import { getApps, initializeApp } from 'firebase-admin/app'
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
