import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
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
  writeBatch,
} from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import {
  auth as adminAuth,
  db as adminDb,
  reconcileAllCounters,
} from '../../functions/core.js'

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
    `prod-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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

  await waitFor(async () => {
    const snap = await adminDb.doc(`users/${uid}`).get()
    return snap.exists
  })

  await adminDb.doc(`users/${uid}`).update({
    name: displayName,
    plan,
  })
  return { ...session, uid, name: displayName }
}

after(async () => {
  await Promise.all(clientApps.map((a) => deleteApp(a).catch(() => {})))
})

describe('Cloud Functions 3B — reconcileCounters', () => {
  it('memperbaiki activeOwned dan memberCount yang meleset, dan idempoten saat dijalankan dua kali', async () => {
    const owner = await registerUser('rec-owner', 'Raka Reconcile')
    const created1 = await owner.call('createProject')({
      name: 'Proyek Aktif 1',
      color: 'var(--area-kuliah)',
      start: '2026-11-27',
      due: '2026-12-20',
      sections: ['Umum'],
    })
    const pid1 = created1.data.projectId

    const created2 = await owner.call('createProject')({
      name: 'Proyek Arsip',
      color: 'var(--area-kantor)',
      start: '2026-11-27',
      due: '2026-12-20',
      sections: ['Umum'],
    })
    const pid2 = created2.data.projectId
    await owner.call('setProjectArchived')({ projectId: pid2, archived: true })

    // Deliberately corrupt stored counters.
    await adminDb.doc(`users/${owner.uid}`).update({ activeOwned: 99 })
    await adminDb.doc(`projects/${pid1}`).update({ memberCount: 7 })

    const first = await reconcileAllCounters()
    assert.ok(first.usersUpdated >= 1)
    assert.ok(first.projectsUpdated >= 1)

    const [userSnap, proj1Snap] = await Promise.all([
      adminDb.doc(`users/${owner.uid}`).get(),
      adminDb.doc(`projects/${pid1}`).get(),
    ])
    assert.equal(userSnap.data()?.activeOwned, 1)
    assert.equal(proj1Snap.data()?.memberCount, 1)

    // Second run must be a strict no-op (zero writes).
    const second = await reconcileAllCounters()
    assert.equal(second.usersUpdated, 0)
    assert.equal(second.projectsUpdated, 0)
  })
})

describe('Cloud Functions 3B — deleteAccount (K1)', () => {
  it('menolak pemanggilan tanpa login', async () => {
    const anon = createClientSession('del-anon')
    await assert.rejects(
      () => anon.call('deleteAccount')({}),
      (err) => err?.code === 'functions/unauthenticated',
    )
  })

  it('serangan: pengguna lain tidak bisa menghapus akun korban dengan mengirim uid target', async () => {
    const victim = await registerUser('del-victim', 'Korban Aman')
    const attacker = await registerUser('del-attacker', 'Penyerang')

    await adminDb.doc(`users/${victim.uid}/areas/kuliah`).set({
      name: 'Kuliah',
      color: 'var(--area-kuliah)',
      order: 0,
    })

    // Attacker tries passing victim's uid; deleteAccount must only delete attacker itself.
    const res = await attacker.call('deleteAccount')({ uid: victim.uid })
    assert.equal(res.data.deleted, true)

    const [victimUser, victimArea, attackerUser] = await Promise.all([
      adminDb.doc(`users/${victim.uid}`).get(),
      adminDb.doc(`users/${victim.uid}/areas/kuliah`).get(),
      adminDb.doc(`users/${attacker.uid}`).get(),
    ])
    assert.equal(victimUser.exists, true)
    assert.equal(victimArea.exists, true)
    assert.equal(attackerUser.exists, false)
  })

  it('menghapus data pribadi, proyek milik sendiri beserta nisan, keluar dari proyek orang lain tanpa merusak proyeknya, dan menghapus akun Auth', async () => {
    const userA = await registerUser('del-a', 'Dina Hapus')
    const userB = await registerUser('del-b', 'Budi Pemilik')

    // User A personal data.
    await Promise.all([
      adminDb.doc(`users/${userA.uid}/areas/a1`).set({ name: 'Kuliah', color: 'var(--area-kuliah)', order: 0 }),
      adminDb.doc(`users/${userA.uid}/tasks/t1`).set({ title: 'Tugas pribadi', status: 'todo', createdBy: userA.uid }),
      adminDb.doc(`users/${userA.uid}/notified/2026-11`).set({ keys: ['t1'] }),
    ])

    // User A owns Project A with a task and an invite.
    const createdA = await userA.call('createProject')({
      name: 'Proyek Milik A',
      color: 'var(--area-kuliah)',
      start: '2026-11-27',
      due: '2026-12-25',
      sections: ['Riset'],
    })
    const pidA = createdA.data.projectId
    const tokA = `invite_del_a_${Date.now()}_0123456789`
    const batchA = writeBatch(userA.db)
    batchA.set(doc(userA.db, `invites/${tokA}`), {
      projectId: pidA,
      ownerId: userA.uid,
      active: true,
      projectName: 'Proyek Milik A',
      ownerName: userA.name,
      memberCount: 1,
      due: '2026-12-25',
      full: false,
      createdAt: serverTimestamp(),
    })
    batchA.update(doc(userA.db, `projects/${pidA}`), { inviteToken: tokA })
    await batchA.commit()
    await setDoc(doc(userA.db, `projects/${pidA}/tasks/ta1`), {
      title: 'Tugas Proyek A',
      project: pidA,
      area: null,
      section: 'Riset',
      assignee: userA.uid,
      status: 'todo',
      prio: 'med',
      start: null,
      due: '2026-12-01',
      time: null,
      dur: null,
      rec: null,
      notes: '',
      createdBy: userA.uid,
      updatedBy: userA.uid,
      createdAt: serverTimestamp(),
    })

    // User B owns Project B; User A joins it, gets assigned a task, and has a personal reminder.
    const createdB = await userB.call('createProject')({
      name: 'Proyek Bersama B',
      color: 'var(--area-kantor)',
      start: '2026-11-27',
      due: '2026-12-25',
      sections: ['Kerja'],
    })
    const pidB = createdB.data.projectId
    const tokB = `invite_del_b_${Date.now()}_0123456789`
    const batchB = writeBatch(userB.db)
    batchB.set(doc(userB.db, `invites/${tokB}`), {
      projectId: pidB,
      ownerId: userB.uid,
      active: true,
      projectName: 'Proyek Bersama B',
      ownerName: userB.name,
      memberCount: 1,
      due: '2026-12-25',
      full: false,
      createdAt: serverTimestamp(),
    })
    batchB.update(doc(userB.db, `projects/${pidB}`), { inviteToken: tokB })
    await batchB.commit()

    await userA.call('joinProject')({ token: tokB })
    await setDoc(doc(userB.db, `projects/${pidB}/tasks/tb1`), {
      title: 'Tugas untuk A di proyek B',
      project: pidB,
      area: null,
      section: 'Kerja',
      assignee: userA.uid,
      status: 'todo',
      prio: 'high',
      start: null,
      due: '2026-12-05',
      time: null,
      dur: null,
      rec: null,
      notes: '',
      createdBy: userB.uid,
      updatedBy: userB.uid,
      createdAt: serverTimestamp(),
    })
    await adminDb.doc(`users/${userA.uid}/reminders/tb1`).set({
      projectId: pidB,
      keys: ['0d'],
    })

    // User A deletes their own account.
    const res = await userA.call('deleteAccount')({})
    assert.equal(res.data.deleted, true)
    assert.equal(res.data.ownedProjectsDeleted, 1)
    assert.equal(res.data.leftProjectsCount, 1)

    // Verify User A profile, subcollections, owned project, invite, and tombstone.
    const [
      userASnap,
      areasA,
      tasksA,
      remsA,
      projASnap,
      projATasks,
      invASnap,
      tombASnap,
    ] = await Promise.all([
      adminDb.doc(`users/${userA.uid}`).get(),
      adminDb.collection(`users/${userA.uid}/areas`).get(),
      adminDb.collection(`users/${userA.uid}/tasks`).get(),
      adminDb.collection(`users/${userA.uid}/reminders`).get(),
      adminDb.doc(`projects/${pidA}`).get(),
      adminDb.collection(`projects/${pidA}/tasks`).get(),
      adminDb.doc(`invites/${tokA}`).get(),
      adminDb.doc(`deletedProjects/${pidA}`).get(),
    ])
    assert.equal(userASnap.exists, false)
    assert.equal(areasA.size, 0)
    assert.equal(tasksA.size, 0)
    assert.equal(remsA.size, 0)
    assert.equal(projASnap.exists, false)
    assert.equal(projATasks.size, 0)
    assert.equal(invASnap.exists, false)
    assert.equal(tombASnap.exists, true)

    // Verify Auth user A is deleted.
    await assert.rejects(
      () => adminAuth.getUser(userA.uid),
      (err) => err?.code === 'auth/user-not-found',
    )

    // Verify User B's Project B is completely intact and A's task was reassigned to B.
    const [projBSnap, memberAInB, taskB1Snap, invBSnap] = await Promise.all([
      adminDb.doc(`projects/${pidB}`).get(),
      adminDb.doc(`projects/${pidB}/members/${userA.uid}`).get(),
      adminDb.doc(`projects/${pidB}/tasks/tb1`).get(),
      adminDb.doc(`invites/${tokB}`).get(),
    ])
    assert.equal(projBSnap.exists, true)
    assert.deepEqual(projBSnap.data()?.memberIds, [userB.uid])
    assert.equal(projBSnap.data()?.memberCount, 1)
    assert.equal(memberAInB.exists, false)
    assert.equal(taskB1Snap.exists, true)
    assert.equal(taskB1Snap.data()?.assignee, userB.uid)
    assert.equal(invBSnap.data()?.memberCount, 1)
    assert.equal(invBSnap.data()?.full, false)
  })
})
