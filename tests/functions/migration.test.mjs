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
  collection,
  connectFirestoreEmulator,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { db as adminDb } from '../../functions/core.js'

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
    `mig-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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

/** Mirror src/store.tsx migrateLocalData deterministic IDs and PIC mapping for a subset/run. */
async function migrateProjectsBatch(session, localProjects, localTasks, { stopAfter = Infinity } = {}) {
  const uidTag = session.uid.replace(/[^a-zA-Z0-9_-]/g, '') || 'u'
  const callCreate = session.call('createProject')
  const migratedIds = []
  let quotaHit = false

  for (let i = 0; i < localProjects.length; i++) {
    if (i >= stopAfter) break
    const p = localProjects[i]
    const cloudPid = `mig_${uidTag}_${p.id}`.slice(0, 100)
    let alreadyExisted = false
    try {
      const res = await callCreate({
        projectId: cloudPid,
        name: p.name,
        ownerArea: p.area,
        color: p.color,
        start: p.start,
        due: p.due,
        sections: p.sections,
      })
      alreadyExisted = Boolean(res.data?.alreadyExisted)
    } catch (err) {
      if (String(err?.code).includes('resource-exhausted')) {
        quotaHit = true
        break
      }
      throw err
    }

    const existingIds = new Set()
    if (alreadyExisted) {
      const snap = await getDocs(collection(session.db, 'projects', cloudPid, 'tasks'))
      for (const d of snap.docs) existingIds.add(d.id)
    }

    const tasks = localTasks.filter((t) => t.project === p.id)
    const batch = writeBatch(session.db)
    let ops = 0
    for (const t of tasks) {
      if (existingIds.has(t.id)) continue
      const assignee = t.assignee === 'me' || t.assignee === session.uid ? session.uid : null
      batch.set(doc(session.db, 'projects', cloudPid, 'tasks', t.id), {
        title: t.title,
        project: cloudPid,
        area: null,
        section: t.section ?? null,
        assignee,
        status: 'todo',
        prio: 'med',
        start: null,
        due: t.due ?? null,
        time: null,
        dur: null,
        rec: null,
        notes: '',
        createdBy: session.uid,
        updatedBy: session.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        completedAt: null,
      })
      ops++
    }
    if (ops > 0) await batch.commit()
    migratedIds.push(p.id)
  }

  return { migratedIds, quotaHit }
}

describe('Cloud Functions 2F — migrasi proyek lokal, idempotensi, PIC, dan kuota', () => {
  after(async () => {
    await Promise.all(clientApps.map((a) => deleteApp(a).catch(() => {})))
  })

  it('pindah, batalkan di tengah, lalu ulangi tidak menghilangkan atau menggandakan proyek dan memetakan PIC dengan benar', async () => {
    const user = await registerUser('mig-cancel', 'Maya Lokal', 'free')
    const projects = [
      { id: 'lp1', name: 'Lokal 1', area: null, color: 'var(--accent)', start: '2026-12-01', due: '2026-12-20', sections: ['Tahap 1'] },
      { id: 'lp2', name: 'Lokal 2', area: null, color: 'var(--accent)', start: '2026-12-01', due: '2026-12-22', sections: [] },
      { id: 'lp3', name: 'Lokal 3', area: null, color: 'var(--accent)', start: '2026-12-01', due: '2026-12-24', sections: [] },
    ]
    const tasks = [
      { id: 't_me', project: 'lp1', title: 'Tugas Saya', section: 'Tahap 1', assignee: 'me', due: '2026-12-10' },
      { id: 't_sim', project: 'lp1', title: 'Tugas Simulasi', section: 'Tahap 1', assignee: 'ani', due: '2026-12-11' },
      { id: 't_lp2', project: 'lp2', title: 'Tugas LP2', section: null, assignee: 'budi', due: null },
      { id: 't_lp3', project: 'lp3', title: 'Tugas LP3', section: null, assignee: 'me', due: null },
    ]

    // First run cancelled halfway after migrating 1 project (simulate client retry even with overlapping lp1).
    const first = await migrateProjectsBatch(user, projects, tasks, { stopAfter: 1 })
    assert.deepEqual(first.migratedIds, ['lp1'])
    assert.equal(first.quotaHit, false)

    // Repeat full list without removing lp1 yet -> createProject returns alreadyExisted: true, no duplicates.
    const second = await migrateProjectsBatch(user, projects, tasks)
    assert.deepEqual(second.migratedIds, ['lp1', 'lp2', 'lp3'])
    assert.equal(second.quotaHit, false)

    const ownedSnap = await adminDb.collection('projects').where('ownerId', '==', user.uid).get()
    assert.equal(ownedSnap.size, 3)

    const uidTag = user.uid.replace(/[^a-zA-Z0-9_-]/g, '') || 'u'
    const lp1TasksSnap = await adminDb.collection(`projects/mig_${uidTag}_lp1/tasks`).get()
    assert.equal(lp1TasksSnap.size, 2)
    const byId = Object.fromEntries(lp1TasksSnap.docs.map((d) => [d.id, d.data()]))
    assert.equal(byId.t_me.assignee, user.uid)
    assert.equal(byId.t_sim.assignee, null)
  })

  it('6 proyek lokal pada akun Gratis memindahkan 5, menyisakan 1 secara aman, lalu memindah sisa ke-6 setelah 1 proyek diarsipkan', async () => {
    const user = await registerUser('mig-six', 'Raka Enam', 'free')
    const projects = Array.from({ length: 6 }, (_, i) => ({
      id: `six_${i + 1}`,
      name: `Proyek Lokal ${i + 1}`,
      area: null,
      color: 'var(--accent)',
      start: '2026-12-01',
      due: '2026-12-20',
      sections: [],
    }))
    const tasks = projects.map((p, i) => ({
      id: `task_${i + 1}`,
      project: p.id,
      title: `Tugas ${i + 1}`,
      section: null,
      assignee: i % 2 === 0 ? 'me' : 'citra',
      due: '2026-12-15',
    }))

    const run1 = await migrateProjectsBatch(user, projects, tasks)
    assert.equal(run1.quotaHit, true)
    assert.equal(run1.migratedIds.length, 5)
    assert.deepEqual(run1.migratedIds, ['six_1', 'six_2', 'six_3', 'six_4', 'six_5'])

    const remaining = projects.filter((p) => !run1.migratedIds.includes(p.id))
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0].id, 'six_6')

    // Archive one project to free a slot, then migrate the 6th local project.
    const uidTag = user.uid.replace(/[^a-zA-Z0-9_-]/g, '') || 'u'
    await user.call('setProjectArchived')({ projectId: `mig_${uidTag}_six_5`, archived: true })

    const run2 = await migrateProjectsBatch(user, remaining, tasks)
    assert.equal(run2.quotaHit, false)
    assert.deepEqual(run2.migratedIds, ['six_6'])

    const allOwned = await adminDb.collection('projects').where('ownerId', '==', user.uid).get()
    assert.equal(allOwned.size, 6)
  })

  it('dua pengguna berbeda dengan ID proyek lokal sama tidak saling bertabrakan di koleksi top-level projects', async () => {
    const [a, b] = await Promise.all([
      registerUser('mig-ua', 'Pengguna A', 'free'),
      registerUser('mig-ub', 'Pengguna B', 'free'),
    ])
    const sameLocal = [
      { id: 'uas', name: 'Tugas Akhir UAS', area: null, color: 'var(--accent)', start: '2026-12-01', due: '2026-12-20', sections: [] },
    ]
    const [ra, rb] = await Promise.all([
      migrateProjectsBatch(a, sameLocal, []),
      migrateProjectsBatch(b, sameLocal, []),
    ])
    assert.deepEqual(ra.migratedIds, ['uas'])
    assert.deepEqual(rb.migratedIds, ['uas'])
  })
})
