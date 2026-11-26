import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { deleteApp, initializeApp } from 'firebase/app'
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  updateProfile,
} from 'firebase/auth'
import {
  connectFirestoreEmulator,
  doc,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { db as adminDb, processProjectTaskWrite } from '../../functions/core.js'

const PROJECT_ID = 'demo-taskflow'
const REGION = 'asia-southeast2'

/** @type {import('firebase/app').FirebaseApp[]} */
const clientApps = []

function createClientSession(tag) {
  const app = initializeApp(
    {
      apiKey: 'demo-api-key',
      authDomain: `${PROJECT_ID}.firebaseapp.com`,
      projectId: PROJECT_ID,
    },
    `client-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  )
  clientApps.push(app)
  const auth = getAuth(app)
  const db = getFirestore(app)
  const fns = getFunctions(app, REGION)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectFunctionsEmulator(fns, '127.0.0.1', 5001)
  return {
    app,
    auth,
    db,
    fns,
    call: (name) => httpsCallable(fns, name),
  }
}

async function waitFor(predicate, timeoutMs = 10000, intervalMs = 120) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const val = await predicate()
    if (val) return val
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error('Timed out waiting for condition in emulator')
}

async function registerUser(tag, displayName, plan = 'free') {
  const session = createClientSession(tag)
  const email = `${tag}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@example.com`
  const cred = await createUserWithEmailAndPassword(session.auth, email, 'Password123!')
  await updateProfile(cred.user, { displayName })
  const uid = cred.user.uid

  // Wait for onUserCreated Auth trigger in Functions Emulator, then ensure displayName & plan.
  await waitFor(async () => {
    const snap = await adminDb.doc(`users/${uid}`).get()
    return snap.exists
  })

  await adminDb.doc(`users/${uid}`).update({
    name: displayName,
    plan,
    ...(plan === 'pro' ? { proSource: 'manual', proSince: new Date() } : {}),
  })

  return { ...session, uid, name: displayName }
}

async function createInviteAsOwner(ownerSession, projectId, token, projectName, memberCount = 1, full = false) {
  const batch = writeBatch(ownerSession.db)
  batch.set(doc(ownerSession.db, 'invites', token), {
    projectId,
    ownerId: ownerSession.uid,
    active: true,
    createdAt: serverTimestamp(),
    projectName,
    ownerName: ownerSession.name,
    memberCount,
    due: '2026-12-20',
    full,
  })
  batch.update(doc(ownerSession.db, 'projects', projectId), {
    inviteToken: token,
    updatedAt: serverTimestamp(),
  })
  await batch.commit()
}

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'FIRESTORE_EMULATOR_HOST wajib aktif lewat emulators:exec')
})

after(async () => {
  await Promise.all(clientApps.map((app) => deleteApp(app).catch(() => {})))
})

describe('Cloud Functions 2C — Validasi autentikasi dan tipe argumen', () => {
  it('menolak panggilan tanpa login dan argumen tidak valid dengan pesan bahasa Indonesia tanpa bocoran data', async () => {
    const anon = createClientSession('anon')

    for (const fnName of ['createProject', 'setProjectArchived', 'deleteProject', 'joinProject', 'removeMember']) {
      await assert.rejects(
        () => anon.call(fnName)({}),
        (err) => err.code === 'functions/unauthenticated' && /masuk/i.test(err.message),
      )
    }

    const user = await registerUser('val', 'Andi Validasi')

    await assert.rejects(
      () => user.call('createProject')('bukan-objek'),
      (err) => err.code === 'functions/invalid-argument',
    )
    await assert.rejects(
      () =>
        user.call('createProject')({
          name: '   ',
          color: 'var(--accent)',
          start: '2026-11-26',
          due: '2026-12-10',
        }),
      (err) => err.code === 'functions/invalid-argument',
    )
    await assert.rejects(
      () =>
        user.call('createProject')({
          name: 'Tanggal terbalik',
          color: 'var(--accent)',
          start: '2026-12-20',
          due: '2026-12-01',
        }),
      (err) => err.code === 'functions/invalid-argument',
    )
    await assert.rejects(
      () => user.call('setProjectArchived')({ projectId: 'p1', archived: 'yes' }),
      (err) => err.code === 'functions/invalid-argument',
    )
    await assert.rejects(
      () => user.call('joinProject')({ token: 'terlalu-pendek' }),
      (err) => err.code === 'functions/invalid-argument',
    )
    await assert.rejects(
      () => user.call('removeMember')({ projectId: 'p1', memberUid: 12345 }),
      (err) => err.code === 'functions/invalid-argument',
    )
  })
})

describe('Cloud Functions 2C — Kuota proyek aktif (Opsi a: createProject, setProjectArchived, deleteProject)', () => {
  it('menegakkan kuota 5 proyek aktif pada akun Gratis, idempoten pada projectId sama, serta menjaga arsip/pulihkan/hapus', async () => {
    const freeOwner = await registerUser('quota-free', 'Budi Kuota', 'free')
    const outsider = await registerUser('quota-other', 'Siti Luar', 'pro')

    const createdIds = []
    for (let i = 1; i <= 5; i++) {
      const detId = `proj_quota_${freeOwner.uid.slice(0, 8)}_${i}`
      const res = await freeOwner.call('createProject')({
        projectId: detId,
        name: `Proyek ${i}`,
        ownerArea: 'kuliah',
        color: 'var(--area-kuliah)',
        start: '2026-11-26',
        due: '2026-12-20',
        sections: ['Bagian A'],
      })
      assert.equal(res.data.projectId, detId)
      assert.equal(res.data.alreadyExisted, false)
      createdIds.push(detId)
    }

    // Idempotent retry with existing deterministic projectId by same owner does not consume extra quota.
    const retryRes = await freeOwner.call('createProject')({
      projectId: createdIds[0],
      name: 'Proyek 1',
      ownerArea: 'kuliah',
      color: 'var(--area-kuliah)',
      start: '2026-11-26',
      due: '2026-12-20',
    })
    assert.equal(retryRes.data.alreadyExisted, true)

    const userAfter5 = await adminDb.doc(`users/${freeOwner.uid}`).get()
    assert.equal(userAfter5.data().activeOwned, 5)

    // 6th active project must be rejected!
    await assert.rejects(
      () =>
        freeOwner.call('createProject')({
          name: 'Proyek Ke-6',
          ownerArea: null,
          color: 'var(--accent)',
          start: '2026-11-26',
          due: '2026-12-20',
        }),
      (err) => err.code === 'functions/resource-exhausted' && /kuota 5 proyek aktif/i.test(err.message),
    )

    // Outsider cannot archive or delete freeOwner's project, and receives the exact same message as for a missing ID.
    let errExisting = ''
    let errMissing = ''
    await assert.rejects(
      () => outsider.call('setProjectArchived')({ projectId: createdIds[0], archived: true }),
      (err) => {
        errExisting = err.message
        return err.code === 'functions/permission-denied'
      },
    )
    await assert.rejects(
      () => outsider.call('setProjectArchived')({ projectId: 'proyek_tidak_ada_sama_sekali', archived: true }),
      (err) => {
        errMissing = err.message
        return err.code === 'functions/permission-denied'
      },
    )
    assert.equal(errExisting, errMissing)

    // Archiving 1 project frees a slot (activeOwned -> 4), allowing a new 5th active project, then blocking restore!
    await freeOwner.call('setProjectArchived')({ projectId: createdIds[0], archived: true })
    assert.equal((await adminDb.doc(`users/${freeOwner.uid}`).get()).data().activeOwned, 4)

    const sixthRes = await freeOwner.call('createProject')({
      name: 'Proyek Pengganti',
      ownerArea: null,
      color: 'var(--accent)',
      start: '2026-11-26',
      due: '2026-12-20',
    })
    assert.ok(sixthRes.data.projectId)
    assert.equal((await adminDb.doc(`users/${freeOwner.uid}`).get()).data().activeOwned, 5)

    // Restoring archived project when 5 active slots are full must fail!
    await assert.rejects(
      () => freeOwner.call('setProjectArchived')({ projectId: createdIds[0], archived: false }),
      (err) => err.code === 'functions/resource-exhausted',
    )

    // Deleting an active project decrements activeOwned -> 4, allowing the archived project to be restored.
    await freeOwner.call('deleteProject')({ projectId: sixthRes.data.projectId })
    assert.equal((await adminDb.doc(`users/${freeOwner.uid}`).get()).data().activeOwned, 4)

    await freeOwner.call('setProjectArchived')({ projectId: createdIds[0], archived: false })
    assert.equal((await adminDb.doc(`users/${freeOwner.uid}`).get()).data().activeOwned, 5)
  })
})

describe('Cloud Functions 2C — joinProject & balapan paralel slot terakhir', () => {
  it('dua orang bergabung bersamaan ke slot terakhir: tepat satu berhasil dan satu ditolak (tes paralel), idempoten bagi anggota lama, dan mengikuti plan pemilik saat itu', async () => {
    const owner = await registerUser('join-owner', 'Rani Pemilik', 'free')
    const member1 = await registerUser('join-m1', 'Dimas Satu', 'free')
    const contenderA = await registerUser('join-ca', 'Wulan Dua', 'pro')
    const contenderB = await registerUser('join-cb', 'Tono Tiga', 'free')

    const { data: created } = await owner.call('createProject')({
      name: 'Kelompok Riset',
      ownerArea: 'kuliah',
      color: 'var(--area-kuliah)',
      start: '2026-11-26',
      due: '2026-12-20',
    })
    const pid = created.projectId
    const token = `tok_race_${Date.now()}_0123456789abcdef`
    await createInviteAsOwner(owner, pid, token, 'Kelompok Riset', 1, false)

    // Slot 2 of 3: member1 joins, and calling joinProject again is idempotent.
    const j1 = await member1.call('joinProject')({ token })
    assert.equal(j1.data.projectId, pid)
    assert.equal(j1.data.alreadyMember, false)

    const j1Repeat = await member1.call('joinProject')({ token })
    assert.equal(j1Repeat.data.alreadyMember, true)
    assert.equal((await adminDb.doc(`projects/${pid}`).get()).data().memberCount, 2)

    // Slot 3 of 3 (LAST FREE SLOT): contenderA and contenderB call joinProject in parallel!
    const [resA, resB] = await Promise.allSettled([
      contenderA.call('joinProject')({ token }),
      contenderB.call('joinProject')({ token }),
    ])

    const fulfilled = [resA, resB].filter((r) => r.status === 'fulfilled')
    const rejected = [resA, resB].filter((r) => r.status === 'rejected')

    assert.equal(fulfilled.length, 1, 'Harus tepat satu pendaftar paralel yang berhasil di slot terakhir')
    assert.equal(rejected.length, 1, 'Harus tepat satu pendaftar paralel yang ditolak karena penuh')
    assert.equal(rejected[0].reason.code, 'functions/resource-exhausted')
    assert.match(rejected[0].reason.message, /penuh/i)

    const projAfterRace = (await adminDb.doc(`projects/${pid}`).get()).data()
    assert.equal(projAfterRace.memberCount, 3)
    assert.equal(projAfterRace.memberIds.length, 3)
    assert.equal((await adminDb.doc(`invites/${token}`).get()).data().full, true)

    // Reject joining when project is archived or token is rotated/inactive.
    await owner.call('setProjectArchived')({ projectId: pid, archived: true })
    const loser = resA.status === 'rejected' ? contenderA : contenderB
    await assert.rejects(
      () => loser.call('joinProject')({ token }),
      (err) => err.code === 'functions/failed-precondition',
    )
    await owner.call('setProjectArchived')({ projectId: pid, archived: false })

    // Upgrade owner's live plan to 'pro' -> onPlanChanged updates ownerPlan & invite.full, and loser can now join!
    await adminDb.doc(`users/${owner.uid}`).update({ plan: 'pro', proSource: 'manual' })
    await waitFor(async () => {
      const p = (await adminDb.doc(`projects/${pid}`).get()).data()
      const inv = (await adminDb.doc(`invites/${token}`).get()).data()
      return p.ownerPlan === 'pro' && inv.full === false
    })

    const joinAfterUpgrade = await loser.call('joinProject')({ token })
    assert.equal(joinAfterUpgrade.data.alreadyMember, false)
    assert.equal((await adminDb.doc(`projects/${pid}`).get()).data().memberCount, 4)

    // Rotating token disables the old token immediately.
    const nextToken = `tok_rotated_${Date.now()}_abcdef0123456789`
    const resetBatch = writeBatch(owner.db)
    resetBatch.update(doc(owner.db, 'invites', token), { active: false })
    resetBatch.set(doc(owner.db, 'invites', nextToken), {
      projectId: pid,
      ownerId: owner.uid,
      active: true,
      createdAt: serverTimestamp(),
      projectName: 'Kelompok Riset',
      ownerName: owner.name,
      memberCount: 4,
      due: '2026-12-20',
      full: false,
    })
    resetBatch.update(doc(owner.db, 'projects', pid), { inviteToken: nextToken })
    await resetBatch.commit()

    const extraUser = await registerUser('join-extra', 'Anggota Baru', 'free')
    await assert.rejects(
      () => extraUser.call('joinProject')({ token }),
      (err) => err.code === 'functions/failed-precondition',
    )
  })
})

describe('Cloud Functions 2C — onProjectTaskWritten, onProjectDeleted, dan removeMember (>500 tugas)', () => {
  it('onProjectTaskWritten mencatat tambah/ganti status/selesai, aman walau terpanggil dua kali, memangkas <=200 entri, dan onProjectDeleted menghapus bersih subkoleksi & invites', async () => {
    const owner = await registerUser('act-owner', 'Siti Pemilik Pro', 'pro')
    const member = await registerUser('act-member', 'Budi Anggota', 'free')
    const keeper = await registerUser('act-keeper', 'Rani Tetap', 'free')

    const { data: created } = await owner.call('createProject')({
      name: 'Proyek Aktivitas & Hapus',
      ownerArea: 'kantor',
      color: 'var(--area-kantor)',
      start: '2026-11-26',
      due: '2026-12-30',
    })
    const pid = created.projectId
    const token = `tok_act_${Date.now()}_0123456789abcdef`
    await createInviteAsOwner(owner, pid, token, 'Proyek Aktivitas & Hapus', 1, false)

    await member.call('joinProject')({ token })
    await keeper.call('joinProject')({ token })

    // Real client task creation + status transitions trigger onProjectTaskWritten in emulator!
    const taskRef = doc(member.db, 'projects', pid, 'tasks', 't-live-1')
    await setDoc(taskRef, {
      title: 'Susun laporan akhir',
      project: pid,
      area: null,
      section: null,
      assignee: member.uid,
      status: 'todo',
      prio: 'high',
      start: null,
      due: '2026-12-10',
      time: null,
      dur: null,
      rec: null,
      notes: '',
      createdBy: member.uid,
      updatedBy: member.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      completedAt: null,
    })

    await waitFor(async () => {
      const snap = await adminDb.collection(`projects/${pid}/activity`).get()
      return snap.docs.some((d) => d.data().text === 'Budi Anggota menambahkan "Susun laporan akhir"')
    })

    await updateDoc(taskRef, { status: 'in_progress', updatedBy: member.uid, updatedAt: serverTimestamp() })
    await waitFor(async () => {
      const snap = await adminDb.collection(`projects/${pid}/activity`).get()
      return snap.docs.some((d) => d.data().text === 'Budi Anggota memindah "Susun laporan akhir" ke Dikerjakan')
    })

    const keeperTaskRef = doc(keeper.db, 'projects', pid, 'tasks', 't-live-1')
    await updateDoc(keeperTaskRef, {
      status: 'done',
      updatedBy: keeper.uid,
      updatedAt: serverTimestamp(),
      completedAt: serverTimestamp(),
    })
    await waitFor(async () => {
      const snap = await adminDb.collection(`projects/${pid}/activity`).get()
      return snap.docs.some((d) => d.data().text === 'Rani Tetap menyelesaikan "Susun laporan akhir"')
    })

    // Duplicate trigger invocation with the exact same eventId must be a strict no-op!
    const dupPayload = {
      eventId: 'dup-event-check-001',
      projectId: pid,
      beforeData: null,
      afterData: {
        title: 'Tugas Uji Idempoten',
        status: 'todo',
        createdBy: member.uid,
        updatedBy: member.uid,
      },
    }
    const firstRun = await processProjectTaskWrite(dupPayload)
    const secondRun = await processProjectTaskWrite(dupPayload)
    assert.equal(firstRun, true)
    assert.equal(secondRun, false)

    const dupDocs = await adminDb
      .collection(`projects/${pid}/activity`)
      .where('text', '==', 'Budi Anggota menambahkan "Tugas Uji Idempoten"')
      .get()
    assert.equal(dupDocs.size, 1)

    // Seed 205 activity docs, then trigger 1 new activity -> trimmed to exactly 200 latest entries!
    const seedActBatch = adminDb.batch()
    for (let i = 0; i < 205; i++) {
      seedActBatch.set(adminDb.doc(`projects/${pid}/activity/seed_act_${i}`), {
        type: 'task_created',
        actorId: owner.uid,
        actorName: owner.name,
        text: `Aktivitas lama ${i}`,
        createdAt: new Date(Date.now() - (300 - i) * 1000),
      })
    }
    await seedActBatch.commit()

    await processProjectTaskWrite({
      eventId: 'trim-trigger-event-206',
      projectId: pid,
      beforeData: null,
      afterData: {
        title: 'Pemicu Pangkas 200',
        status: 'todo',
        createdBy: owner.uid,
        updatedBy: owner.uid,
      },
    })

    const afterTrimSnap = await adminDb.collection(`projects/${pid}/activity`).get()
    assert.equal(afterTrimSnap.size, 200)

    // Delete project -> onProjectDeleted removes tasks, members, 200 activity docs, and invites!
    await owner.call('deleteProject')({ projectId: pid })

    await waitFor(async () => {
      const [tSnap, mSnap, aSnap, iSnap] = await Promise.all([
        adminDb.collection(`projects/${pid}/tasks`).limit(1).get(),
        adminDb.collection(`projects/${pid}/members`).limit(1).get(),
        adminDb.collection(`projects/${pid}/activity`).limit(1).get(),
        adminDb.collection('invites').where('projectId', '==', pid).limit(1).get(),
      ])
      return tSnap.empty && mSnap.empty && aSnap.empty && iSnap.empty
    }, 12000)
  })

  it('removeMember hanya bisa dipanggil pemilik, menolak mengeluarkan pemilik, dan mengembalikan >500 tugas ke pemilik per batch', async () => {
    const owner = await registerUser('rm-owner', 'Andi Pemilik Pro', 'pro')
    const member = await registerUser('rm-member', 'Dimas Keluar', 'free')
    const keeper = await registerUser('rm-keeper', 'Wulan Tetap', 'free')

    const { data: created } = await owner.call('createProject')({
      name: 'Proyek 520 Tugas',
      ownerArea: 'kantor',
      color: 'var(--area-kantor)',
      start: '2026-11-26',
      due: '2026-12-30',
    })
    const pid = created.projectId
    const token = `tok_bulk_${Date.now()}_0123456789abcdef`
    await createInviteAsOwner(owner, pid, token, 'Proyek 520 Tugas', 1, false)

    await member.call('joinProject')({ token })
    await keeper.call('joinProject')({ token })

    // Non-owner cannot remove members; owner cannot remove self.
    await assert.rejects(
      () => member.call('removeMember')({ projectId: pid, memberUid: keeper.uid }),
      (err) => err.code === 'functions/permission-denied',
    )
    await assert.rejects(
      () => owner.call('removeMember')({ projectId: pid, memberUid: owner.uid }),
      (err) => err.code === 'functions/failed-precondition',
    )

    // Seed 520 tasks assigned to `member` (>500 single-batch limit) + 1 task assigned to `keeper`.
    for (let b = 0; b < 2; b++) {
      const batch = adminDb.batch()
      const startIdx = b * 300
      const endIdx = Math.min(520, startIdx + 300)
      for (let i = startIdx; i < endIdx; i++) {
        batch.set(adminDb.doc(`projects/${pid}/tasks/bulk_${i}`), {
          title: `Tugas Massal ${i}`,
          project: pid,
          area: null,
          section: null,
          assignee: member.uid,
          status: 'todo',
          prio: 'low',
          start: null,
          due: null,
          time: null,
          dur: null,
          rec: null,
          notes: '',
          createdBy: owner.uid,
          updatedBy: owner.uid,
          createdAt: new Date(),
        })
      }
      await batch.commit()
    }
    await adminDb.doc(`projects/${pid}/tasks/keeper_only`).set({
      title: 'Tugas Wulan',
      project: pid,
      area: null,
      section: null,
      assignee: keeper.uid,
      status: 'todo',
      prio: 'med',
      start: null,
      due: null,
      time: null,
      dur: null,
      rec: null,
      notes: '',
      createdBy: keeper.uid,
      updatedBy: keeper.uid,
      createdAt: new Date(),
    })

    const rmRes = await owner.call('removeMember')({ projectId: pid, memberUid: member.uid })
    assert.equal(rmRes.data.removed, true)
    assert.equal(rmRes.data.reassignedTasks, 520)

    const stillAssignedToRemoved = await adminDb
      .collection(`projects/${pid}/tasks`)
      .where('assignee', '==', member.uid)
      .get()
    assert.equal(stillAssignedToRemoved.size, 0)

    const assignedToOwner = await adminDb
      .collection(`projects/${pid}/tasks`)
      .where('assignee', '==', owner.uid)
      .get()
    assert.equal(assignedToOwner.size, 520)

    assert.equal((await adminDb.doc(`projects/${pid}/tasks/keeper_only`).get()).data().assignee, keeper.uid)
    assert.equal((await adminDb.doc(`projects/${pid}/members/${member.uid}`).get()).exists, false)

    const actSnap = await adminDb.collection(`projects/${pid}/activity`).get()
    assert.ok(actSnap.docs.some((d) => d.data().text === 'Dimas Keluar dikeluarkan dari proyek'))
  })
})
