import { FieldValue } from 'firebase-admin/firestore'
import { region } from 'firebase-functions/v1'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  onDocumentDeleted,
  onDocumentUpdated,
  onDocumentWritten,
} from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import {
  BATCH_LIMIT,
  auth,
  cleanupProjectChildren,
  db,
  deleteDocsInBatches,
  processProjectTaskWrite,
  reconcileAllCounters,
  trimProjectActivity,
} from './core.js'

const REGION = 'asia-southeast2'
const FREE_PROJECT_QUOTA = 5
const FREE_MEMBER_QUOTA = 3
const PRO_MEMBER_QUOTA = 20

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,100}$/
// Allowed project marker colours: AREA_COLORS + 'var(--accent)'.
// Must be updated together with src/lib/constants.ts (AREA_COLORS) and firestore.rules (validProjectUpdate).
const VALID_PROJECT_COLORS = new Set([
  'var(--area-kuliah)',
  'var(--area-kantor)',
  'var(--area-pribadi)',
  'oklch(0.62 0.14 50)',
  'oklch(0.6 0.11 195)',
  'oklch(0.6 0.15 0)',
  'var(--accent)',
])

function requireAuth(request) {
  const uid = request.auth?.uid
  if (typeof uid !== 'string' || !uid) {
    throw new HttpsError('unauthenticated', 'Silakan masuk terlebih dahulu.')
  }
  return uid
}

function requirePlainObject(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpsError('invalid-argument', 'Data permintaan tidak valid.')
  }
  return data
}

function requireDocId(val, label = 'ID') {
  if (typeof val !== 'string') {
    throw new HttpsError('invalid-argument', `${label} tidak valid.`)
  }
  const trimmed = val.trim()
  if (!trimmed || trimmed.length > 100 || trimmed.includes('/')) {
    throw new HttpsError('invalid-argument', `${label} tidak valid.`)
  }
  return trimmed
}

function requireNonEmptyString(val, maxLen, label) {
  if (typeof val !== 'string') {
    throw new HttpsError('invalid-argument', `${label} wajib berupa teks.`)
  }
  const trimmed = val.trim()
  if (!trimmed || val.length > maxLen) {
    throw new HttpsError('invalid-argument', `${label} tidak boleh kosong (maks. ${maxLen} karakter).`)
  }
  return trimmed
}

function requireIsoDate(val, label) {
  if (typeof val !== 'string' || !ISO_DATE_RE.test(val)) {
    throw new HttpsError('invalid-argument', `${label} tidak valid.`)
  }
  return val
}

function fallbackDisplayName(authToken) {
  if (typeof authToken?.name === 'string' && authToken.name.trim()) {
    return authToken.name.trim().slice(0, 100)
  }
  if (typeof authToken?.email === 'string' && authToken.email.includes('@')) {
    return authToken.email.split('@')[0].slice(0, 100)
  }
  return 'Anggota'
}

/**
 * Create the server-managed profile document on first sign-up so clients cannot
 * forge plan/quota fields (docs/BACKEND.md §2.1, §3.1).
 */
export const onUserCreated = region(REGION).auth.user().onCreate(async (user) => {
  const fallbackName = user.email ? user.email.split('@')[0] : 'Kamu'
  const name = (user.displayName?.trim() || fallbackName).slice(0, 100)
  const ref = db.doc(`users/${user.uid}`)

  try {
    // Use create() so retried Auth triggers never overwrite an existing profile or plan.
    await ref.create({
      name,
      email: user.email ?? '',
      photoURL: user.photoURL ?? null,
      plan: 'free',
      proSource: null,
      proSince: null,
      activeOwned: 0,
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch (err) {
    // gRPC code 6 = ALREADY_EXISTS: treat duplicate trigger delivery as a no-op.
    if (err && typeof err === 'object' && 'code' in err && err.code === 6) return
    throw err
  }
})

/**
 * Option (a) project creation with server-enforced Free/Pro active project quota.
 * Supports an optional deterministic projectId for idempotent local-to-cloud migration (2F).
 */
export const createProject = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request)
  const data = requirePlainObject(request.data)

  let projectId = null
  if (data.projectId !== undefined && data.projectId !== null) {
    const expectedPrefix = `mig_${uid}_`
    if (
      typeof data.projectId !== 'string' ||
      !SAFE_ID_RE.test(data.projectId) ||
      !data.projectId.startsWith(expectedPrefix) ||
      data.projectId.length <= expectedPrefix.length
    ) {
      throw new HttpsError('invalid-argument', 'ID proyek tidak valid.')
    }
    projectId = data.projectId
  }

  const name = requireNonEmptyString(data.name, 200, 'Nama proyek')
  if (typeof data.color !== 'string' || !VALID_PROJECT_COLORS.has(data.color)) {
    throw new HttpsError('invalid-argument', 'Warna proyek tidak valid.')
  }
  const color = data.color
  const start = requireIsoDate(data.start, 'Tanggal mulai')
  const due = requireIsoDate(data.due, 'Tanggal tenggat')
  if (start > due) {
    throw new HttpsError('invalid-argument', 'Tanggal mulai tidak boleh melewati tenggat.')
  }

  let ownerArea = null
  if (data.ownerArea !== undefined && data.ownerArea !== null) {
    if (typeof data.ownerArea !== 'string' || data.ownerArea.length > 100) {
      throw new HttpsError('invalid-argument', 'Area proyek tidak valid.')
    }
    ownerArea = data.ownerArea.trim() || null
  }

  let sections = []
  if (data.sections !== undefined) {
    if (!Array.isArray(data.sections) || data.sections.length > 50) {
      throw new HttpsError('invalid-argument', 'Daftar bagian proyek tidak valid.')
    }
    sections = data.sections.map((s) => requireNonEmptyString(s, 100, 'Nama bagian'))
    if (sections.join('').length > 5000) {
      throw new HttpsError('invalid-argument', 'Daftar bagian proyek terlalu panjang.')
    }
  }

  const projRef = projectId ? db.doc(`projects/${projectId}`) : db.collection('projects').doc()
  const deletedRef = db.doc(`deletedProjects/${projRef.id}`)
  const userRef = db.doc(`users/${uid}`)
  const activeQuery = db.collection('projects').where('ownerId', '==', uid).where('archived', '==', false)

  return db.runTransaction(async (tx) => {
    const [userSnap, existingProjSnap, deletedProjSnap, activeSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(projRef),
      tx.get(deletedRef),
      tx.get(activeQuery),
    ])

    if (!userSnap.exists) {
      throw new HttpsError('failed-precondition', 'Profil akun belum siap. Coba lagi sebentar.')
    }

    if (deletedProjSnap.exists) {
      throw new HttpsError('already-exists', 'Gagal membuat proyek. Silakan coba lagi.')
    }

    if (existingProjSnap.exists) {
      // Idempotent retry for the same owner; generic failure otherwise so foreign IDs never leak.
      if (existingProjSnap.data()?.ownerId === uid) {
        return { projectId: projRef.id, alreadyExisted: true }
      }
      throw new HttpsError('already-exists', 'Gagal membuat proyek. Silakan coba lagi.')
    }

    const userData = userSnap.data() ?? {}
    const plan = userData.plan === 'pro' ? 'pro' : 'free'
    const activeCount = activeSnap.size

    if (plan !== 'pro' && activeCount >= FREE_PROJECT_QUOTA) {
      throw new HttpsError(
        'resource-exhausted',
        `Kuota ${FREE_PROJECT_QUOTA} proyek aktif penuh. Arsipkan proyek lain atau beralih ke Pro.`,
      )
    }

    const ownerName =
      (typeof userData.name === 'string' && userData.name.trim().slice(0, 100)) ||
      fallbackDisplayName(request.auth?.token)
    const ownerPhoto = typeof userData.photoURL === 'string' ? userData.photoURL : null
    const now = FieldValue.serverTimestamp()

    tx.create(projRef, {
      ownerId: uid,
      ownerPlan: plan,
      name,
      ownerArea,
      color,
      start,
      due,
      sections,
      archived: false,
      memberIds: [uid],
      memberCount: 1,
      inviteToken: null,
      createdAt: now,
      updatedAt: now,
    })

    tx.set(db.doc(`projects/${projRef.id}/members/${uid}`), {
      role: 'owner',
      area: ownerArea,
      name: ownerName,
      photoURL: ownerPhoto,
      joinedAt: now,
    })

    tx.update(userRef, { activeOwned: activeCount + 1 })

    return { projectId: projRef.id, alreadyExisted: false }
  })
})

/**
 * Option (a) archive / restore toggle with transactional quota validation on restore.
 */
export const setProjectArchived = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request)
  const data = requirePlainObject(request.data)
  const projectId = requireDocId(data.projectId, 'ID proyek')
  if (typeof data.archived !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Status arsip tidak valid.')
  }
  const nextArchived = data.archived

  const projRef = db.doc(`projects/${projectId}`)
  const userRef = db.doc(`users/${uid}`)
  const activeQuery = db.collection('projects').where('ownerId', '==', uid).where('archived', '==', false)

  return db.runTransaction(async (tx) => {
    const [projSnap, userSnap, activeSnap] = await Promise.all([
      tx.get(projRef),
      tx.get(userRef),
      tx.get(activeQuery),
    ])

    // Identical error for missing vs non-owned project to avoid leaking project existence.
    if (!projSnap.exists || projSnap.data()?.ownerId !== uid) {
      throw new HttpsError('permission-denied', 'Kamu tidak memiliki akses untuk mengelola proyek ini.')
    }
    if (!userSnap.exists) {
      throw new HttpsError('failed-precondition', 'Profil akun belum siap. Coba lagi sebentar.')
    }

    const curArchived = projSnap.data()?.archived === true
    const activeCount = activeSnap.size
    if (curArchived === nextArchived) {
      tx.update(userRef, { activeOwned: activeCount })
      return { projectId, archived: nextArchived }
    }

    const plan = userSnap.data()?.plan === 'pro' ? 'pro' : 'free'
    if (!nextArchived && plan !== 'pro' && activeCount >= FREE_PROJECT_QUOTA) {
      throw new HttpsError(
        'resource-exhausted',
        `Kuota ${FREE_PROJECT_QUOTA} proyek aktif penuh. Arsipkan proyek lain atau beralih ke Pro.`,
      )
    }

    const nextActiveCount = nextArchived ? Math.max(0, activeCount - 1) : activeCount + 1
    tx.update(projRef, { archived: nextArchived, updatedAt: FieldValue.serverTimestamp() })
    tx.update(userRef, { activeOwned: nextActiveCount })

    return { projectId, archived: nextArchived }
  })
})

/**
 * Option (a) project deletion; decrements activeOwned when deleting an active project.
 * Subcollections and invites are cleaned asynchronously by onProjectDeleted.
 */
export const deleteProject = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request)
  const data = requirePlainObject(request.data)
  const projectId = requireDocId(data.projectId, 'ID proyek')

  const projRef = db.doc(`projects/${projectId}`)
  const userRef = db.doc(`users/${uid}`)
  const activeQuery = db.collection('projects').where('ownerId', '==', uid).where('archived', '==', false)

  return db.runTransaction(async (tx) => {
    const [projSnap, userSnap, activeSnap] = await Promise.all([
      tx.get(projRef),
      tx.get(userRef),
      tx.get(activeQuery),
    ])

    if (!projSnap.exists || projSnap.data()?.ownerId !== uid) {
      throw new HttpsError('permission-denied', 'Kamu tidak memiliki akses untuk menghapus proyek ini.')
    }

    const wasArchived = projSnap.data()?.archived === true
    const nextActiveCount = wasArchived ? activeSnap.size : Math.max(0, activeSnap.size - 1)

    tx.delete(projRef)
    // Tombstone blocks immediate or delayed reuse of deleted project IDs.
    tx.set(db.doc(`deletedProjects/${projectId}`), {
      ownerId: uid,
      deletedAt: FieldValue.serverTimestamp(),
    })
    if (userSnap.exists) {
      tx.update(userRef, { activeOwned: nextActiveCount })
    }

    return { projectId, deleted: true }
  })
})

/**
 * Join a shared project via invite token inside a single Firestore transaction so
 * concurrent joins for the last remaining slot never exceed the owner's live plan limit.
 */
export const joinProject = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request)
  const data = requirePlainObject(request.data)
  const invalidLinkMsg = 'Tautan undangan tidak berlaku atau sudah diganti.'

  if (
    typeof data.token !== 'string' ||
    data.token.length < 20 ||
    data.token.length > 128 ||
    data.token.includes('/')
  ) {
    throw new HttpsError('invalid-argument', invalidLinkMsg)
  }
  const token = data.token

  const result = await db.runTransaction(async (tx) => {
    const inviteRef = db.doc(`invites/${token}`)
    const inviteSnap = await tx.get(inviteRef)
    if (!inviteSnap.exists) {
      throw new HttpsError('not-found', invalidLinkMsg)
    }

    const inv = inviteSnap.data() ?? {}
    if (
      inv.active !== true ||
      typeof inv.projectId !== 'string' ||
      !inv.projectId ||
      inv.projectId.includes('/') ||
      typeof inv.ownerId !== 'string' ||
      !inv.ownerId
    ) {
      throw new HttpsError('failed-precondition', invalidLinkMsg)
    }

    const projectId = inv.projectId
    const projRef = db.doc(`projects/${projectId}`)
    const memberRef = db.doc(`projects/${projectId}/members/${uid}`)
    const ownerRef = db.doc(`users/${inv.ownerId}`)
    const joinerRef = db.doc(`users/${uid}`)

    const [projSnap, memberSnap, ownerSnap, joinerSnap] = await Promise.all([
      tx.get(projRef),
      tx.get(memberRef),
      tx.get(ownerRef),
      tx.get(joinerRef),
    ])

    if (!projSnap.exists) {
      throw new HttpsError('not-found', invalidLinkMsg)
    }

    const proj = projSnap.data() ?? {}
    if (proj.ownerId !== inv.ownerId || proj.inviteToken !== token) {
      throw new HttpsError('failed-precondition', invalidLinkMsg)
    }
    if (proj.archived === true) {
      throw new HttpsError('failed-precondition', invalidLinkMsg)
    }

    const curMembers = Array.isArray(proj.memberIds) ? proj.memberIds : []
    const joinerData = joinerSnap.exists ? (joinerSnap.data() ?? {}) : {}
    const joinerName =
      (typeof joinerData.name === 'string' && joinerData.name.trim().slice(0, 100)) ||
      fallbackDisplayName(request.auth?.token)
    const joinerPhoto = typeof joinerData.photoURL === 'string' ? joinerData.photoURL : null

    // Idempotent return when the caller is already a project member.
    if (curMembers.includes(uid)) {
      if (!memberSnap.exists) {
        tx.set(memberRef, {
          role: proj.ownerId === uid ? 'owner' : 'member',
          area: null,
          name: joinerName,
          photoURL: joinerPhoto,
          joinedAt: FieldValue.serverTimestamp(),
        })
      }
      return { projectId, alreadyMember: true }
    }

    // Enforce member capacity strictly against the project owner's live plan at join time.
    const liveOwnerPlan = ownerSnap.exists && ownerSnap.data()?.plan === 'pro' ? 'pro' : 'free'
    const limit = liveOwnerPlan === 'pro' ? PRO_MEMBER_QUOTA : FREE_MEMBER_QUOTA
    if (curMembers.length >= limit) {
      throw new HttpsError('resource-exhausted', 'Proyek ini sudah penuh. Hubungi pemiliknya.')
    }

    const nextMembers = [...curMembers, uid]
    const nextCount = nextMembers.length
    const nextFull = nextCount >= limit
    const now = FieldValue.serverTimestamp()

    tx.set(memberRef, {
      role: 'member',
      area: null,
      name: joinerName,
      photoURL: joinerPhoto,
      joinedAt: now,
    })

    tx.update(projRef, {
      memberIds: nextMembers,
      memberCount: nextCount,
      ownerPlan: liveOwnerPlan,
      updatedAt: now,
    })

    tx.update(inviteRef, {
      memberCount: nextCount,
      full: nextFull,
      updatedAt: now,
    })

    const actRef = db.collection(`projects/${projectId}/activity`).doc()
    tx.create(actRef, {
      type: 'member_joined',
      actorId: uid,
      actorName: joinerName,
      targetId: uid,
      text: `${joinerName} bergabung lewat tautan undangan`,
      createdAt: now,
    })

    return { projectId, alreadyMember: false }
  })

  if (!result.alreadyMember) {
    await trimProjectActivity(result.projectId)
  }
  return result
})

/**
 * Remove a member from a project (owner only), update counters/invite summary,
 * and reassign all tasks assigned to that member back to the project owner in <=500-op batches.
 */
export const removeMember = onCall({ region: REGION }, async (request) => {
  const callerUid = requireAuth(request)
  const data = requirePlainObject(request.data)
  const projectId = requireDocId(data.projectId, 'ID proyek')
  const rawTarget = 'memberUid' in data ? data.memberUid : data.uid
  const targetUid = requireDocId(rawTarget, 'ID anggota')

  const txResult = await db.runTransaction(async (tx) => {
    const projRef = db.doc(`projects/${projectId}`)
    const projSnap = await tx.get(projRef)

    // Non-leaking error whether project is missing or caller is not the owner.
    if (!projSnap.exists || projSnap.data()?.ownerId !== callerUid) {
      throw new HttpsError('permission-denied', 'Hanya pemilik proyek yang dapat mengeluarkan anggota.')
    }

    const proj = projSnap.data() ?? {}
    if (targetUid === proj.ownerId) {
      throw new HttpsError('failed-precondition', 'Pemilik proyek tidak dapat dikeluarkan.')
    }

    const memberRef = db.doc(`projects/${projectId}/members/${targetUid}`)
    const ownerRef = db.doc(`users/${callerUid}`)
    const inviteRef =
      typeof proj.inviteToken === 'string' && proj.inviteToken && !proj.inviteToken.includes('/')
        ? db.doc(`invites/${proj.inviteToken}`)
        : null

    const [memberSnap, ownerSnap, inviteSnap] = await Promise.all([
      tx.get(memberRef),
      tx.get(ownerRef),
      inviteRef ? tx.get(inviteRef) : Promise.resolve(null),
    ])

    const curMembers = Array.isArray(proj.memberIds) ? proj.memberIds : []
    if (!curMembers.includes(targetUid) && !memberSnap.exists) {
      return { removed: false }
    }

    const removedName =
      (memberSnap.exists &&
        typeof memberSnap.data()?.name === 'string' &&
        memberSnap.data()?.name.trim().slice(0, 100)) ||
      'Anggota'
    const ownerName =
      (ownerSnap.exists &&
        typeof ownerSnap.data()?.name === 'string' &&
        ownerSnap.data()?.name.trim().slice(0, 100)) ||
      fallbackDisplayName(request.auth?.token)
    const livePlan = ownerSnap.exists && ownerSnap.data()?.plan === 'pro' ? 'pro' : 'free'
    const limit = livePlan === 'pro' ? PRO_MEMBER_QUOTA : FREE_MEMBER_QUOTA

    const nextMembers = curMembers.filter((id) => id !== targetUid)
    const nextCount = nextMembers.length
    const now = FieldValue.serverTimestamp()

    tx.update(projRef, {
      memberIds: nextMembers,
      memberCount: nextCount,
      ownerPlan: livePlan,
      updatedAt: now,
    })

    if (memberSnap.exists) {
      tx.delete(memberRef)
    }

    if (inviteSnap?.exists && inviteSnap.data()?.active === true) {
      tx.update(inviteRef, {
        memberCount: nextCount,
        full: nextCount >= limit,
        updatedAt: now,
      })
    }

    const actRef = db.collection(`projects/${projectId}/activity`).doc()
    tx.create(actRef, {
      type: 'member_removed',
      actorId: callerUid,
      actorName: ownerName,
      targetId: targetUid,
      text: `${removedName} dikeluarkan dari proyek`,
      createdAt: now,
    })

    return { removed: true }
  })

  // Reassign tasks even on retry in case a previous invocation crashed mid-batch.
  const tasksSnap = await db
    .collection(`projects/${projectId}/tasks`)
    .where('assignee', '==', targetUid)
    .get()

  for (let i = 0; i < tasksSnap.docs.length; i += BATCH_LIMIT) {
    const batch = db.batch()
    const now = FieldValue.serverTimestamp()
    for (const taskDoc of tasksSnap.docs.slice(i, i + BATCH_LIMIT)) {
      batch.update(taskDoc.ref, { assignee: callerUid, updatedAt: now })
    }
    await batch.commit()
  }

  // Clean up removed member's personal reminders tied to this project.
  const remSnap = await db
    .collection(`users/${targetUid}/reminders`)
    .where('projectId', '==', projectId)
    .get()
  if (!remSnap.empty) {
    await deleteDocsInBatches(remSnap.docs)
  }

  if (txResult.removed) {
    await trimProjectActivity(projectId)
  }

  return {
    projectId,
    removedUid: targetUid,
    removed: txResult.removed,
    reassignedTasks: tasksSnap.size,
  }
})

export const onProjectTaskWritten = onDocumentWritten(
  { document: 'projects/{projectId}/tasks/{taskId}', region: REGION },
  async (event) => {
    const beforeData = event.data?.before?.exists ? event.data.before.data() : null
    const afterData = event.data?.after?.exists ? event.data.after.data() : null
    await processProjectTaskWrite({
      eventId: event.id,
      projectId: event.params.projectId,
      beforeData,
      afterData,
    })
  },
)

/**
 * Clean up all nested subcollections (tasks, members, activity) and invites when a project is deleted.
 */
export const onProjectDeleted = onDocumentDeleted(
  { document: 'projects/{projectId}', region: REGION },
  async (event) => {
    await cleanupProjectChildren(event.params.projectId)
  },
)

/**
 * Propagate user plan changes (Free <-> Pro) to ownerPlan on all owned projects
 * and refresh the `full` summary flag on active invites for those projects.
 */
export const onPlanChanged = onDocumentUpdated(
  { document: 'users/{uid}', region: REGION },
  async (event) => {
    const beforePlan = event.data?.before?.data()?.plan === 'pro' ? 'pro' : 'free'
    const afterPlan = event.data?.after?.data()?.plan === 'pro' ? 'pro' : 'free'
    if (beforePlan === afterPlan) return

    const { uid } = event.params
    const limit = afterPlan === 'pro' ? PRO_MEMBER_QUOTA : FREE_MEMBER_QUOTA

    const [projSnap, invitesSnap] = await Promise.all([
      db.collection('projects').where('ownerId', '==', uid).get(),
      db.collection('invites').where('ownerId', '==', uid).where('active', '==', true).get(),
    ])

    const updates = []
    const now = FieldValue.serverTimestamp()

    for (const docSnap of projSnap.docs) {
      if (docSnap.data()?.ownerPlan !== afterPlan) {
        updates.push({ ref: docSnap.ref, data: { ownerPlan: afterPlan, updatedAt: now } })
      }
    }

    for (const invSnap of invitesSnap.docs) {
      const count = typeof invSnap.data()?.memberCount === 'number' ? invSnap.data().memberCount : 1
      const nextFull = count >= limit
      if (invSnap.data()?.full !== nextFull) {
        updates.push({ ref: invSnap.ref, data: { full: nextFull, updatedAt: now } })
      }
    }

    for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
      const batch = db.batch()
      for (const u of updates.slice(i, i + BATCH_LIMIT)) {
        batch.update(u.ref, u.data)
      }
      await batch.commit()
    }
  },
)

/**
 * Daily safety net that reconciles users/{uid}.activeOwned and projects/{pid}.memberCount
 * in <=500-op batches, writing only documents whose counters drifted (docs/BACKEND.md §3.3, §5).
 */
export const reconcileCounters = onSchedule(
  { schedule: 'every day 03:00', timeZone: 'Asia/Jakarta', region: REGION },
  async () => {
    await reconcileAllCounters()
  },
)

/**
 * Permanently delete the signed-in user's account, personal data, owned projects (with tombstones),
 * memberships in other users' projects (reassigning tasks back to each project owner), and Auth user.
 * Strictly operates only on request.auth.uid and is idempotent on retry (HANDOFF-FASE3 K1, §4 3B).
 */
export const deleteAccount = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request)

  const [ownedSnap, memberSnap] = await Promise.all([
    db.collection('projects').where('ownerId', '==', uid).get(),
    db.collection('projects').where('memberIds', 'array-contains', uid).get(),
  ])

  let ownedProjectsDeleted = 0
  for (const projDoc of ownedSnap.docs) {
    const projectId = projDoc.id
    const projRef = db.doc(`projects/${projectId}`)
    const deleted = await db.runTransaction(async (tx) => {
      const snap = await tx.get(projRef)
      if (!snap.exists || snap.data()?.ownerId !== uid) return false
      tx.delete(projRef)
      tx.set(db.doc(`deletedProjects/${projectId}`), {
        ownerId: uid,
        deletedAt: FieldValue.serverTimestamp(),
      })
      return true
    })
    if (deleted) {
      ownedProjectsDeleted += 1
    }
    await cleanupProjectChildren(projectId)
  }

  let leftProjectsCount = 0
  for (const projDoc of memberSnap.docs) {
    if (projDoc.data()?.ownerId === uid) continue
    const projectId = projDoc.id
    const projRef = db.doc(`projects/${projectId}`)

    const leaveResult = await db.runTransaction(async (tx) => {
      const projSnap = await tx.get(projRef)
      if (!projSnap.exists) return null
      const proj = projSnap.data() ?? {}
      if (proj.ownerId === uid) return null

      const ownerId = typeof proj.ownerId === 'string' ? proj.ownerId : ''
      const curMembers = Array.isArray(proj.memberIds) ? proj.memberIds : []
      const memberRef = db.doc(`projects/${projectId}/members/${uid}`)
      const ownerRef = ownerId ? db.doc(`users/${ownerId}`) : null
      const inviteRef =
        typeof proj.inviteToken === 'string' && proj.inviteToken && !proj.inviteToken.includes('/')
          ? db.doc(`invites/${proj.inviteToken}`)
          : null

      const [mSnap, ownerSnap, inviteSnap] = await Promise.all([
        tx.get(memberRef),
        ownerRef ? tx.get(ownerRef) : Promise.resolve(null),
        inviteRef ? tx.get(inviteRef) : Promise.resolve(null),
      ])

      if (!curMembers.includes(uid) && !mSnap.exists) {
        return { left: false, ownerId }
      }

      const memberName =
        (mSnap.exists && typeof mSnap.data()?.name === 'string' && mSnap.data()?.name.trim().slice(0, 100)) ||
        fallbackDisplayName(request.auth?.token)
      const livePlan = ownerSnap?.exists && ownerSnap.data()?.plan === 'pro' ? 'pro' : 'free'
      const limit = livePlan === 'pro' ? PRO_MEMBER_QUOTA : FREE_MEMBER_QUOTA

      const nextMembers = curMembers.filter((id) => id !== uid)
      const nextCount = nextMembers.length
      const now = FieldValue.serverTimestamp()

      tx.update(projRef, {
        memberIds: nextMembers,
        memberCount: nextCount,
        ownerPlan: livePlan,
        updatedAt: now,
      })

      if (mSnap.exists) {
        tx.delete(memberRef)
      }

      if (inviteSnap?.exists && inviteSnap.data()?.active === true) {
        tx.update(inviteRef, {
          memberCount: nextCount,
          full: nextCount >= limit,
          updatedAt: now,
        })
      }

      const actRef = db.collection(`projects/${projectId}/activity`).doc()
      tx.create(actRef, {
        type: 'member_left',
        actorId: uid,
        actorName: memberName,
        targetId: uid,
        text: `${memberName} keluar dari proyek`,
        createdAt: now,
      })

      return { left: true, ownerId }
    })

    if (leaveResult?.ownerId) {
      const tasksSnap = await db
        .collection(`projects/${projectId}/tasks`)
        .where('assignee', '==', uid)
        .get()
      for (let i = 0; i < tasksSnap.docs.length; i += BATCH_LIMIT) {
        const batch = db.batch()
        const now = FieldValue.serverTimestamp()
        for (const taskDoc of tasksSnap.docs.slice(i, i + BATCH_LIMIT)) {
          batch.update(taskDoc.ref, { assignee: leaveResult.ownerId, updatedAt: now })
        }
        await batch.commit()
      }
    }

    if (leaveResult?.left) {
      leftProjectsCount += 1
      await trimProjectActivity(projectId)
    }
  }

  const [areasSnap, tasksSnap, remsSnap, notifiedSnap] = await Promise.all([
    db.collection(`users/${uid}/areas`).select().get(),
    db.collection(`users/${uid}/tasks`).select().get(),
    db.collection(`users/${uid}/reminders`).select().get(),
    db.collection(`users/${uid}/notified`).select().get(),
  ])

  const userSubDocs = [
    ...areasSnap.docs,
    ...tasksSnap.docs,
    ...remsSnap.docs,
    ...notifiedSnap.docs,
  ]
  if (userSubDocs.length > 0) {
    await deleteDocsInBatches(userSubDocs)
  }

  await db.doc(`users/${uid}`).delete()

  try {
    await auth.deleteUser(uid)
  } catch (err) {
    if (!err || typeof err !== 'object' || err.code !== 'auth/user-not-found') {
      throw err
    }
  }

  return { deleted: true, ownedProjectsDeleted, leftProjectsCount }
})
