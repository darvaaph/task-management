import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const isEmulator = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST,
)

if (getApps().length === 0) {
  initializeApp(
    isEmulator ? { projectId: process.env.GCLOUD_PROJECT || 'demo-taskflow' } : undefined,
  )
}

export const db = getFirestore()
export const auth = getAuth()

export const ACTIVITY_LIMIT = 200
export const BATCH_LIMIT = 500

export const STATUS_LABEL = {
  todo: 'Belum',
  in_progress: 'Dikerjakan',
  done: 'Selesai',
}

export async function deleteDocsInBatches(docs) {
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = db.batch()
    for (const snap of docs.slice(i, i + BATCH_LIMIT)) {
      batch.delete(snap.ref)
    }
    await batch.commit()
  }
}

/** Delete all subcollections (tasks, members, activity) and invites belonging to a project. */
export async function cleanupProjectChildren(projectId) {
  const [tasksSnap, membersSnap, activitySnap, invitesSnap] = await Promise.all([
    db.collection(`projects/${projectId}/tasks`).select().get(),
    db.collection(`projects/${projectId}/members`).select().get(),
    db.collection(`projects/${projectId}/activity`).select().get(),
    db.collection('invites').where('projectId', '==', projectId).select().get(),
  ])

  const allDocs = [
    ...tasksSnap.docs,
    ...membersSnap.docs,
    ...activitySnap.docs,
    ...invitesSnap.docs,
  ]
  if (allDocs.length > 0) {
    await deleteDocsInBatches(allDocs)
  }
}

/**
 * Recompute users/{uid}.activeOwned and projects/{pid}.memberCount across the database.
 * Only writes documents whose stored counter differs from the actual count, in <=500-op batches.
 * Exported from core.js so tests can invoke it directly without Cloud Scheduler.
 */
export async function reconcileAllCounters() {
  const [projectsSnap, usersSnap] = await Promise.all([
    db.collection('projects').select('ownerId', 'archived', 'memberIds', 'memberCount').get(),
    db.collection('users').select('activeOwned').get(),
  ])

  const activeByOwner = new Map()
  const updates = []
  let projectsUpdated = 0
  let usersUpdated = 0

  for (const projSnap of projectsSnap.docs) {
    const data = projSnap.data() ?? {}
    const memberIds = Array.isArray(data.memberIds) ? data.memberIds : []
    const actualMemberCount = memberIds.length
    if (data.memberCount !== actualMemberCount) {
      updates.push({ ref: projSnap.ref, data: { memberCount: actualMemberCount } })
      projectsUpdated += 1
    }
    if (data.archived !== true && typeof data.ownerId === 'string' && data.ownerId) {
      activeByOwner.set(data.ownerId, (activeByOwner.get(data.ownerId) ?? 0) + 1)
    }
  }

  for (const userSnap of usersSnap.docs) {
    const expectedActive = activeByOwner.get(userSnap.id) ?? 0
    const currentActive = userSnap.data()?.activeOwned
    if (currentActive !== expectedActive) {
      updates.push({ ref: userSnap.ref, data: { activeOwned: expectedActive } })
      usersUpdated += 1
    }
  }

  for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
    const batch = db.batch()
    for (const u of updates.slice(i, i + BATCH_LIMIT)) {
      batch.update(u.ref, u.data)
    }
    await batch.commit()
  }

  return { projectsUpdated, usersUpdated }
}

/** Keep at most the latest 200 activity entries per project with minimal Firestore reads. */
export async function trimProjectActivity(projectId) {
  const col = db.collection(`projects/${projectId}/activity`)
  const countSnap = await col.count().get()
  const total = countSnap.data().count
  if (total <= ACTIVITY_LIMIT) return

  const overflow = total - ACTIVITY_LIMIT
  const oldestSnap = await col.orderBy('createdAt', 'asc').limit(overflow).select().get()
  if (!oldestSnap.empty) {
    await deleteDocsInBatches(oldestSnap.docs)
  }
}

/**
 * Core idempotent processor for project task activity logging.
 * Exported from core.js (not index.js) so tests can verify duplicate-delivery safety
 * without exposing non-function objects to firebase-functions' index.js loader.
 */
export async function processProjectTaskWrite({ eventId, projectId, beforeData, afterData }) {
  // Deletions do not produce activity entries (docs/BACKEND.md §3.5).
  if (!afterData) return false

  let type = null
  let buildText = null
  const title =
    (typeof afterData.title === 'string' && afterData.title.trim().slice(0, 300)) || 'Tanpa judul'

  if (!beforeData) {
    type = 'task_created'
    buildText = (actor) => `${actor} menambahkan "${title}"`
  } else if (
    typeof afterData.status === 'string' &&
    afterData.status in STATUS_LABEL &&
    afterData.status !== beforeData.status
  ) {
    if (afterData.status === 'done') {
      type = 'task_completed'
      buildText = (actor) => `${actor} menyelesaikan "${title}"`
    } else {
      type = 'task_status'
      buildText = (actor) => `${actor} memindah "${title}" ke ${STATUS_LABEL[afterData.status]}`
    }
  } else {
    return false
  }

  const actorId =
    (typeof afterData.updatedBy === 'string' && afterData.updatedBy) ||
    (typeof afterData.createdBy === 'string' && afterData.createdBy) ||
    ''

  const projSnap = await db.doc(`projects/${projectId}`).get()
  if (!projSnap.exists) return false

  let actorName = 'Anggota'
  if (actorId && !actorId.includes('/')) {
    const memberSnap = await db.doc(`projects/${projectId}/members/${actorId}`).get()
    if (memberSnap.exists && typeof memberSnap.data()?.name === 'string' && memberSnap.data()?.name.trim()) {
      actorName = memberSnap.data().name.trim().slice(0, 100)
    } else {
      const userSnap = await db.doc(`users/${actorId}`).get()
      if (userSnap.exists && typeof userSnap.data()?.name === 'string' && userSnap.data()?.name.trim()) {
        actorName = userSnap.data().name.trim().slice(0, 100)
      }
    }
  }

  const safeId = `ev_${String(eventId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)}`
  const actRef = db.doc(`projects/${projectId}/activity/${safeId}`)

  try {
    // Deterministic doc ID + create() makes duplicate trigger delivery a strict no-op.
    await actRef.create({
      type,
      actorId,
      actorName,
      text: buildText(actorName),
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 6) return false
    throw err
  }

  await trimProjectActivity(projectId)
  return true
}
