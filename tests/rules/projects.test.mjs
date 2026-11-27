import { readFileSync } from 'node:fs'
import { after, before, beforeEach, describe, it } from 'node:test'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'

const PROJECT_ID = 'demo-taskflow-projects'
const RULES_PATH = new URL('../../firestore.rules', import.meta.url)

const PRO_OWNER = 'uid-pro-owner'
const FREE_OWNER = 'uid-free-owner'
const FREE_MEMBER = 'uid-free-member'
const REMOVED_MEMBER = 'uid-removed-member'
const OUTSIDER = 'uid-outsider'

const TOK_PRO = 'invite_pro_active_0123456789'
const TOK_INACTIVE = 'invite_pro_old_retired_01234'

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
let testEnv

const authedDb = (uid) => testEnv.authenticatedContext(uid).firestore()
const unauthedDb = () => testEnv.unauthenticatedContext().firestore()

function makeProjectDoc({
  ownerId,
  ownerPlan,
  name = 'Proyek Kolaborasi',
  ownerArea = 'kuliah',
  color = 'var(--area-kuliah)',
  start = '2026-11-26',
  due = '2026-12-20',
  sections = ['Riset', 'Revisi'],
  archived = false,
  memberIds = [ownerId],
  inviteToken = null,
  createdAt = new Date('2026-11-25T00:00:00Z'),
}) {
  return {
    ownerId,
    ownerPlan,
    name,
    ownerArea,
    color,
    start,
    due,
    sections,
    archived,
    memberIds,
    memberCount: memberIds.length,
    inviteToken,
    createdAt,
  }
}

function makeProjectTask({
  project,
  title = 'Tugas Kelompok',
  section = 'Riset',
  assignee = null,
  status = 'todo',
  prio = 'med',
  due = '2026-12-05',
  time = '10:00',
  dur = null,
  rec = null,
  createdBy,
  updatedBy = createdBy,
  createdAt = new Date('2026-11-25T00:00:00Z'),
}) {
  return {
    title,
    project,
    area: null,
    section,
    assignee,
    status,
    prio,
    start: null,
    due,
    time,
    dur,
    rec,
    notes: '',
    createdBy,
    updatedBy,
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
  }
}

async function seedPhase2Data() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    const createdAt = new Date('2026-11-25T00:00:00Z')

    await db.doc(`users/${PRO_OWNER}`).set({
      name: 'Siti Pro',
      email: 'siti@example.com',
      photoURL: null,
      plan: 'pro',
      proSource: 'manual',
      proSince: createdAt,
      activeOwned: 1,
      createdAt,
    })

    await db.doc(`users/${FREE_OWNER}`).set({
      name: 'Budi Gratis',
      email: 'budi@example.com',
      photoURL: null,
      plan: 'free',
      proSource: null,
      proSince: null,
      activeOwned: 5,
      createdAt,
    })

    await db.doc(`users/${FREE_MEMBER}`).set({
      name: 'Rani Anggota',
      email: 'rani@example.com',
      photoURL: null,
      plan: 'free',
      proSource: null,
      proSince: null,
      activeOwned: 0,
      createdAt,
    })

    await db.doc(`users/${REMOVED_MEMBER}`).set({
      name: 'Dimas Mantan',
      email: 'dimas@example.com',
      photoURL: null,
      plan: 'free',
      proSource: null,
      proSince: null,
      activeOwned: 0,
      createdAt,
    })

    await db.doc(`users/${OUTSIDER}`).set({
      name: 'Tono Luar',
      email: 'tono@example.com',
      photoURL: null,
      plan: 'pro',
      proSource: 'manual',
      proSince: createdAt,
      activeOwned: 0,
      createdAt,
    })

    // Pro-owned shared project: members are PRO_OWNER (owner) and FREE_MEMBER (free member).
    await db.doc('projects/proj-pro').set(
      makeProjectDoc({
        ownerId: PRO_OWNER,
        ownerPlan: 'pro',
        name: 'Riset Produk Pro',
        memberIds: [PRO_OWNER, FREE_MEMBER],
        inviteToken: TOK_PRO,
        createdAt,
      }),
    )

    await db.doc(`projects/proj-pro/members/${PRO_OWNER}`).set({
      role: 'owner',
      area: 'kantor',
      name: 'Siti Pro',
      photoURL: null,
      joinedAt: createdAt,
    })

    await db.doc(`projects/proj-pro/members/${FREE_MEMBER}`).set({
      role: 'member',
      area: 'kuliah',
      name: 'Rani Anggota',
      photoURL: null,
      joinedAt: createdAt,
    })

    // Stale member subdoc left intentionally without membership in memberIds to verify memberIds revocation lock.
    await db.doc(`projects/proj-pro/members/${REMOVED_MEMBER}`).set({
      role: 'member',
      area: 'pribadi',
      name: 'Dimas Mantan',
      photoURL: null,
      joinedAt: createdAt,
    })

    await db.doc('projects/proj-pro/tasks/t-pro-1').set(
      makeProjectTask({
        project: 'proj-pro',
        title: 'Susun instrumen',
        assignee: FREE_MEMBER,
        createdBy: PRO_OWNER,
        createdAt,
      }),
    )

    await db.doc('projects/proj-pro/activity/act-pro-1').set({
      actorId: PRO_OWNER,
      text: 'Siti Pro menambahkan "Susun instrumen"',
      createdAt,
    })

    await db.doc(`users/${REMOVED_MEMBER}/reminders/t-pro-1`).set({
      keys: ['m30'],
      projectId: 'proj-pro',
    })

    // Free-owned shared project (#1 of 5 active owned by FREE_OWNER), where PRO_OWNER is a member!
    await db.doc('projects/proj-free-1').set(
      makeProjectDoc({
        ownerId: FREE_OWNER,
        ownerPlan: 'free',
        name: 'Tugas Statistik Gratis',
        memberIds: [FREE_OWNER, PRO_OWNER],
        createdAt,
      }),
    )

    await db.doc(`projects/proj-free-1/members/${FREE_OWNER}`).set({
      role: 'owner',
      area: 'kuliah',
      name: 'Budi Gratis',
      photoURL: null,
      joinedAt: createdAt,
    })

    await db.doc(`projects/proj-free-1/members/${PRO_OWNER}`).set({
      role: 'member',
      area: 'kantor',
      name: 'Siti Pro',
      photoURL: null,
      joinedAt: createdAt,
    })

    await db.doc('projects/proj-free-1/tasks/t-free-1').set(
      makeProjectTask({
        project: 'proj-free-1',
        title: 'Kumpulkan data',
        assignee: PRO_OWNER,
        createdBy: FREE_OWNER,
        createdAt,
      }),
    )

    await db.doc('projects/proj-free-1/activity/act-free-1').set({
      actorId: FREE_OWNER,
      text: 'Budi Gratis menambahkan "Kumpulkan data"',
      createdAt,
    })

    // Remaining 4 active projects owned by FREE_OWNER (total = 5 active) + 1 archived project.
    for (let i = 2; i <= 5; i++) {
      await db.doc(`projects/proj-free-${i}`).set(
        makeProjectDoc({
          ownerId: FREE_OWNER,
          ownerPlan: 'free',
          name: `Proyek Aktif ${i}`,
          memberIds: [FREE_OWNER],
          createdAt,
        }),
      )
    }

    await db.doc('projects/proj-free-archived').set(
      makeProjectDoc({
        ownerId: FREE_OWNER,
        ownerPlan: 'free',
        name: 'Proyek Lama Arsip',
        archived: true,
        memberIds: [FREE_OWNER],
        createdAt,
      }),
    )

    await db.doc(`invites/${TOK_PRO}`).set({
      projectId: 'proj-pro',
      ownerId: PRO_OWNER,
      active: true,
      createdAt,
      projectName: 'Riset Produk Pro',
      ownerName: 'Siti Pro',
      memberCount: 2,
      due: '2026-12-20',
      full: false,
    })

    await db.doc(`invites/${TOK_INACTIVE}`).set({
      projectId: 'proj-pro',
      ownerId: PRO_OWNER,
      active: false,
      createdAt,
      projectName: 'Riset Produk Pro',
      ownerName: 'Siti Pro',
      memberCount: 2,
      due: '2026-12-20',
      full: false,
    })
  })
}

before(async () => {
  const rules = readFileSync(RULES_PATH, 'utf8')
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await seedPhase2Data()
})

after(async () => {
  await testEnv.cleanup()
})

describe('Serangan 1 & 2 — Pemalsuan ownerPlan dan field khusus server pada projects', () => {
  it('1. menolak pembuatan proyek dengan ownerPlan: pro oleh akun Gratis (maupun pembuatan langsung tanpa Function), dan mengizinkan baca/ubah proyek sah hasil Function', async () => {
    const freeDb = authedDb(FREE_OWNER)
    await assertFails(
      freeDb.doc('projects/proj-fake-pro').set(
        makeProjectDoc({
          ownerId: FREE_OWNER,
          ownerPlan: 'pro',
          name: 'Pro Palsu',
        }),
      ),
    )

    // Legitimate server-created project can be read and edited (allowed fields) by its owner.
    await assertSucceeds(freeDb.doc('projects/proj-free-1').get())
    await assertSucceeds(freeDb.doc('projects/proj-free-1').update({ name: 'Tugas Statistik Revisi' }))
  })

  it('2. menolak perubahan ownerId, memberIds, memberCount, ownerPlan (serta archived/createdAt) oleh pemilik maupun anggota, dan mengizinkan perubahan metadata sah oleh pemilik', async () => {
    const ownerDb = authedDb(FREE_OWNER)
    const memberDb = authedDb(PRO_OWNER)

    await assertFails(ownerDb.doc('projects/proj-free-1').update({ ownerId: PRO_OWNER }))
    await assertFails(ownerDb.doc('projects/proj-free-1').update({ memberIds: [FREE_OWNER] }))
    await assertFails(ownerDb.doc('projects/proj-free-1').update({ memberCount: 1 }))
    await assertFails(ownerDb.doc('projects/proj-free-1').update({ ownerPlan: 'pro' }))
    await assertFails(ownerDb.doc('projects/proj-free-1').update({ createdAt: new Date() }))

    await assertFails(memberDb.doc('projects/proj-free-1').update({ ownerId: PRO_OWNER }))
    await assertFails(memberDb.doc('projects/proj-free-1').update({ memberIds: [PRO_OWNER] }))
    await assertFails(memberDb.doc('projects/proj-free-1').update({ memberCount: 10 }))
    await assertFails(memberDb.doc('projects/proj-free-1').update({ ownerPlan: 'pro' }))

    await assertSucceeds(
      ownerDb.doc('projects/proj-free-1').update({
        name: 'Statistik Terapan',
        ownerArea: 'kantor',
        color: 'var(--area-kantor)',
        start: '2026-11-26',
        due: '2026-12-25',
        sections: ['Data', 'Analisis'],
        updatedAt: new Date(),
      }),
    )
  })
})

describe('Serangan 3 — Akun Gratis menembus kuota 5 proyek aktif', () => {
  it('3. menolak akun Gratis membuat proyek aktif ke-6 lewat menurunkan activeOwned, memulihkan arsip, atau menulis/menghapus langsung tanpa Function; mengizinkan kueri proyek sah', async () => {
    const freeDb = authedDb(FREE_OWNER)

    // Attempt A: lower activeOwned manually on users/{uid}.
    await assertFails(freeDb.doc(`users/${FREE_OWNER}`).update({ activeOwned: 0 }))

    // Attempt B: unarchive archived project directly to become 6th active project.
    await assertFails(freeDb.doc('projects/proj-free-archived').update({ archived: false }))

    // Attempt C: write 6th active project directly (single write or batch).
    await assertFails(
      freeDb.doc('projects/proj-free-6').set(
        makeProjectDoc({
          ownerId: FREE_OWNER,
          ownerPlan: 'free',
          name: 'Proyek Ke-6',
        }),
      ),
    )
    const batch = freeDb.batch()
    batch.set(
      freeDb.doc('projects/proj-free-6b'),
      makeProjectDoc({ ownerId: FREE_OWNER, ownerPlan: 'free', name: 'Proyek Batch Ke-6' }),
    )
    batch.update(freeDb.doc(`users/${FREE_OWNER}`), { activeOwned: 6 })
    await assertFails(batch.commit())

    // Attempt D: archive or delete directly from client without Function.
    await assertFails(freeDb.doc('projects/proj-free-1').update({ archived: true }))
    await assertFails(freeDb.doc('projects/proj-free-1').delete())

    // Legitimate path: querying active & archived projects where user is in memberIds succeeds.
    await assertSucceeds(
      freeDb.collection('projects').where('memberIds', 'array-contains', FREE_OWNER).where('archived', '==', false).get(),
    )
    await assertSucceeds(
      freeDb.collection('projects').where('memberIds', 'array-contains', FREE_OWNER).where('archived', '==', true).get(),
    )
  })
})

describe('Serangan 4 & 5 — Isolasi bukan anggota dan anggota yang sudah dikeluarkan', () => {
  it('4. menolak bukan anggota membaca atau menulis proyek, tugas, anggota, aktivitas, atau pengingat proyek; mengizinkan anggota aktif', async () => {
    const outsiderDb = authedDb(OUTSIDER)
    const anonDb = unauthedDb()

    await assertFails(anonDb.doc('projects/proj-pro').get())
    await assertFails(outsiderDb.doc('projects/proj-pro').get())
    await assertFails(outsiderDb.collection('projects').get())
    await assertFails(outsiderDb.doc('projects/proj-pro').update({ name: 'Bajak' }))

    await assertFails(outsiderDb.doc(`projects/proj-pro/members/${PRO_OWNER}`).get())
    await assertFails(outsiderDb.collection('projects/proj-pro/members').get())

    await assertFails(outsiderDb.doc('projects/proj-pro/tasks/t-pro-1').get())
    await assertFails(
      outsiderDb.doc('projects/proj-pro/tasks/t-inject').set(
        makeProjectTask({ project: 'proj-pro', createdBy: OUTSIDER }),
      ),
    )
    await assertFails(outsiderDb.doc('projects/proj-pro/tasks/t-pro-1').delete())

    await assertFails(outsiderDb.doc('projects/proj-pro/activity/act-pro-1').get())
    await assertFails(
      outsiderDb.doc(`users/${OUTSIDER}/reminders/t-pro-1`).set({
        projectId: 'proj-pro',
        keys: ['m30'],
      }),
    )

    // Legitimate member reads project, members, tasks, and activity.
    const memberDb = authedDb(FREE_MEMBER)
    await assertSucceeds(memberDb.doc('projects/proj-pro').get())
    await assertSucceeds(memberDb.collection('projects/proj-pro/members').get())
    await assertSucceeds(memberDb.collection('projects/proj-pro/tasks').get())
    await assertSucceeds(memberDb.collection('projects/proj-pro/activity').get())
  })

  it('5. menolak anggota yang sudah dikeluarkan membaca atau menulis di proyek (meski subdokumen members tertinggal), tetapi masih mengizinkan hapus reminder miliknya sendiri', async () => {
    const removedDb = authedDb(REMOVED_MEMBER)

    await assertFails(removedDb.doc('projects/proj-pro').get())
    await assertFails(removedDb.doc(`projects/proj-pro/members/${REMOVED_MEMBER}`).get())
    await assertFails(removedDb.doc(`projects/proj-pro/members/${REMOVED_MEMBER}`).update({ area: 'kuliah' }))
    await assertFails(removedDb.doc('projects/proj-pro/tasks/t-pro-1').get())
    await assertFails(
      removedDb.doc('projects/proj-pro/tasks/t-pro-1').update({
        status: 'done',
        updatedBy: REMOVED_MEMBER,
      }),
    )
    await assertFails(removedDb.doc('projects/proj-pro/activity/act-pro-1').get())
    await assertFails(
      removedDb.doc(`users/${REMOVED_MEMBER}/reminders/t-pro-1`).update({
        keys: ['m10'],
        projectId: 'proj-pro',
      }),
    )

    // Legitimate cleanup: removed user can still read/delete their own stale reminder doc.
    await assertSucceeds(removedDb.doc(`users/${REMOVED_MEMBER}/reminders/t-pro-1`).get())
    await assertSucceeds(removedDb.doc(`users/${REMOVED_MEMBER}/reminders/t-pro-1`).delete())
  })
})

describe('Serangan 6, 7, 8 & 9 — Hak pemilik vs anggota, keamanan undangan, dan area pribadi anggota', () => {
  it('6. menolak anggota (bukan pemilik) mengubah proyek, mengeluarkan orang, atau membuat/mereset undangan; mengizinkan pemilik mengelola proyek & undangan', async () => {
    const memberDb = authedDb(FREE_MEMBER)
    const ownerDb = authedDb(PRO_OWNER)

    await assertFails(memberDb.doc('projects/proj-pro').update({ name: 'Diubah Anggota' }))
    await assertFails(memberDb.doc(`projects/proj-pro/members/${PRO_OWNER}`).delete())
    await assertFails(ownerDb.doc(`projects/proj-pro/members/${FREE_MEMBER}`).delete())
    await assertFails(memberDb.doc(`invites/${TOK_PRO}`).update({ active: false }))

    const rogueTok = 'invite_by_member_9876543210'
    await assertFails(
      memberDb.doc(`invites/${rogueTok}`).set({
        projectId: 'proj-pro',
        ownerId: FREE_MEMBER,
        active: true,
        createdAt: new Date(),
        projectName: 'Riset Produk Pro',
        ownerName: 'Rani Anggota',
        memberCount: 2,
        due: '2026-12-20',
        full: false,
      }),
    )

    // Legitimate owner resets link in one batch: retire old token + create 20+ char new token + point project.inviteToken.
    const nextTok = 'invite_pro_rotated_9876543210'
    const resetBatch = ownerDb.batch()
    resetBatch.update(ownerDb.doc(`invites/${TOK_PRO}`), { active: false })
    resetBatch.set(ownerDb.doc(`invites/${nextTok}`), {
      projectId: 'proj-pro',
      ownerId: PRO_OWNER,
      active: true,
      createdAt: new Date(),
      projectName: 'Riset Produk Pro',
      ownerName: 'Siti Pro',
      memberCount: 2,
      due: '2026-12-20',
      full: false,
    })
    resetBatch.update(ownerDb.doc('projects/proj-pro'), { inviteToken: nextTok })
    await assertSucceeds(resetBatch.commit())
  })

  it('7. menolak mendaftar (list) semua undangan, token pendek, membuat/menimpa undangan proyek orang lain, atau mengaktifkan ulang token lama; mengizinkan get satu token', async () => {
    const outsiderDb = authedDb(OUTSIDER)
    const ownerDb = authedDb(PRO_OWNER)

    // Listing invites is always forbidden.
    await assertFails(outsiderDb.collection('invites').get())
    await assertFails(ownerDb.collection('invites').where('ownerId', '==', PRO_OWNER).get())

    // Short (<20 char) token is forbidden even for owner.
    const shortTok = 'short_token_123'
    const shortBatch = ownerDb.batch()
    shortBatch.set(ownerDb.doc(`invites/${shortTok}`), {
      projectId: 'proj-pro',
      ownerId: PRO_OWNER,
      active: true,
      createdAt: new Date(),
      projectName: 'Riset Produk Pro',
      ownerName: 'Siti Pro',
      memberCount: 2,
      due: '2026-12-20',
      full: false,
    })
    shortBatch.update(ownerDb.doc('projects/proj-pro'), { inviteToken: shortTok })
    await assertFails(shortBatch.commit())

    // Outsider cannot create an invite pointing to PRO_OWNER's project (even with ownerId == OUTSIDER).
    const hijackTok = 'invite_hijack_attempt_0123456'
    await assertFails(
      outsiderDb.doc(`invites/${hijackTok}`).set({
        projectId: 'proj-pro',
        ownerId: OUTSIDER,
        active: true,
        createdAt: new Date(),
        projectName: 'Bajak Proyek',
        ownerName: 'Tono Luar',
        memberCount: 1,
        due: '2026-12-20',
        full: false,
      }),
    )

    // Outsider cannot overwrite existing invite token of PRO_OWNER.
    await assertFails(
      outsiderDb.doc(`invites/${TOK_PRO}`).set({
        projectId: 'proj-pro',
        ownerId: OUTSIDER,
        active: true,
        createdAt: new Date(),
        projectName: 'Timpa Undangan',
        ownerName: 'Tono Luar',
        memberCount: 1,
        due: '2026-12-20',
        full: false,
      }),
    )
    await assertFails(outsiderDb.doc(`invites/${TOK_PRO}`).update({ active: false }))

    // Owner cannot reactivate an already deactivated token or create an invite for an archived project.
    await assertFails(ownerDb.doc(`invites/${TOK_INACTIVE}`).update({ active: true }))

    const freeOwnerDb = authedDb(FREE_OWNER)
    const archTok = 'invite_archived_proj_01234567'
    await assertFails(
      freeOwnerDb.doc(`invites/${archTok}`).set({
        projectId: 'proj-free-archived',
        ownerId: FREE_OWNER,
        active: true,
        createdAt: new Date(),
        projectName: 'Proyek Lama Arsip',
        ownerName: 'Budi Gratis',
        memberCount: 1,
        due: '2026-12-20',
        full: false,
      }),
    )

    // Legitimate path: any signed-in user holding the exact token can get that single invite doc; unauthed cannot.
    await assertFails(unauthedDb().doc(`invites/${TOK_PRO}`).get())
    await assertSucceeds(outsiderDb.doc(`invites/${TOK_PRO}`).get())
  })

  it('8. menolak menambahkan diri sendiri ke members atau memberIds tanpa joinProject; mengizinkan akses setelah joinProject server', async () => {
    const outsiderDb = authedDb(OUTSIDER)

    await assertFails(
      outsiderDb.doc(`projects/proj-pro/members/${OUTSIDER}`).set({
        role: 'member',
        area: null,
        name: 'Tono Luar',
        photoURL: null,
        joinedAt: new Date(),
      }),
    )
    await assertFails(
      outsiderDb.doc('projects/proj-pro').update({
        memberIds: [PRO_OWNER, FREE_MEMBER, OUTSIDER],
      }),
    )

    // Simulate server-side joinProject transaction and confirm member can now read & pick personal area.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await db.doc('projects/proj-pro').update({
        memberIds: [PRO_OWNER, FREE_MEMBER, OUTSIDER],
        memberCount: 3,
      })
      await db.doc(`projects/proj-pro/members/${OUTSIDER}`).set({
        role: 'member',
        area: null,
        name: 'Tono Luar',
        photoURL: null,
        joinedAt: new Date(),
      })
    })

    await assertSucceeds(outsiderDb.doc('projects/proj-pro').get())
    await assertSucceeds(outsiderDb.doc(`projects/proj-pro/members/${OUTSIDER}`).update({ area: 'usaha' }))
  })

  it('9. menolak anggota maupun pemilik mengubah area atau data anggota lain (serta role/name sendiri); mengizinkan anggota mengubah area miliknya sendiri', async () => {
    const memberDb = authedDb(FREE_MEMBER)
    const ownerDb = authedDb(PRO_OWNER)

    // Member cannot edit owner's member doc; owner cannot edit member's private area either.
    await assertFails(memberDb.doc(`projects/proj-pro/members/${PRO_OWNER}`).update({ area: 'pribadi' }))
    await assertFails(ownerDb.doc(`projects/proj-pro/members/${FREE_MEMBER}`).update({ area: 'kantor' }))

    // Member cannot escalate role or alter server-managed fields on their own member doc.
    await assertFails(memberDb.doc(`projects/proj-pro/members/${FREE_MEMBER}`).update({ role: 'owner' }))
    await assertFails(memberDb.doc(`projects/proj-pro/members/${FREE_MEMBER}`).update({ name: 'Nama Palsu' }))

    // Legitimate path: member updates only their own area (including clearing to null).
    await assertSucceeds(memberDb.doc(`projects/proj-pro/members/${FREE_MEMBER}`).update({ area: 'pribadi' }))
    await assertSucceeds(memberDb.doc(`projects/proj-pro/members/${FREE_MEMBER}`).update({ area: null, updatedAt: new Date() }))
  })
})

describe('Serangan 10 & 11 — Validasi updatedBy, assignee, dan fitur Pro mengikuti ownerPlan proyek', () => {
  it('10. menolak updatedBy palsu/kosong, createdBy palsu, area/rems langsung di tugas proyek, dan assignee bukan anggota; mengizinkan tugas proyek sah', async () => {
    const memberDb = authedDb(FREE_MEMBER)

    // Missing or forged updatedBy on create and update.
    const missingUpdatedBy = makeProjectTask({ project: 'proj-pro', createdBy: FREE_MEMBER })
    delete missingUpdatedBy.updatedBy
    await assertFails(memberDb.doc('projects/proj-pro/tasks/t-no-upd').set(missingUpdatedBy))

    await assertFails(
      memberDb.doc('projects/proj-pro/tasks/t-forged-upd').set(
        makeProjectTask({
          project: 'proj-pro',
          createdBy: FREE_MEMBER,
          updatedBy: PRO_OWNER,
        }),
      ),
    )
    await assertFails(
      memberDb.doc('projects/proj-pro/tasks/t-pro-1').update({
        status: 'done',
        updatedBy: PRO_OWNER,
      }),
    )
    await assertFails(memberDb.doc('projects/proj-pro/tasks/t-pro-1').update({ status: 'done' }))

    // Forged createdBy on create or mutating createdBy on update.
    await assertFails(
      memberDb.doc('projects/proj-pro/tasks/t-forged-creator').set(
        makeProjectTask({
          project: 'proj-pro',
          createdBy: PRO_OWNER,
          updatedBy: FREE_MEMBER,
        }),
      ),
    )
    await assertFails(
      memberDb.doc('projects/proj-pro/tasks/t-pro-1').update({
        createdBy: FREE_MEMBER,
        updatedBy: FREE_MEMBER,
      }),
    )

    // Non-member assignee (outsider UID or demo slug 'budi'), non-null area, or inline rems on project task.
    await assertFails(
      memberDb.doc('projects/proj-pro/tasks/t-bad-pic1').set(
        makeProjectTask({
          project: 'proj-pro',
          assignee: OUTSIDER,
          createdBy: FREE_MEMBER,
        }),
      ),
    )
    await assertFails(
      memberDb.doc('projects/proj-pro/tasks/t-bad-pic2').set(
        makeProjectTask({
          project: 'proj-pro',
          assignee: 'budi',
          createdBy: FREE_MEMBER,
        }),
      ),
    )
    await assertFails(
      memberDb.doc('projects/proj-pro/tasks/t-pro-1').update({
        assignee: REMOVED_MEMBER,
        updatedBy: FREE_MEMBER,
      }),
    )
    await assertFails(
      memberDb.doc('projects/proj-pro/tasks/t-has-area').set({
        ...makeProjectTask({ project: 'proj-pro', createdBy: FREE_MEMBER }),
        area: 'kuliah',
      }),
    )
    await assertFails(
      memberDb.doc('projects/proj-pro/tasks/t-has-rems').set({
        ...makeProjectTask({ project: 'proj-pro', createdBy: FREE_MEMBER }),
        rems: ['m30'],
      }),
    )

    // Legitimate create, update (assignee null or valid member), and delete.
    await assertSucceeds(
      memberDb.doc('projects/proj-pro/tasks/t-valid-1').set(
        makeProjectTask({
          project: 'proj-pro',
          assignee: PRO_OWNER,
          createdBy: FREE_MEMBER,
        }),
      ),
    )
    await assertSucceeds(
      memberDb.doc('projects/proj-pro/tasks/t-valid-1').update({
        assignee: null,
        status: 'in_progress',
        updatedBy: FREE_MEMBER,
      }),
    )
    await assertSucceeds(memberDb.doc('projects/proj-pro/tasks/t-valid-1').delete())
  })

  it('11. durasi, weekdays/monthly, dan pengingat ganda ditolak di proyek pemilik Gratis walaupun penulisnya Pro; diizinkan di proyek pemilik Pro walaupun penulisnya Gratis', async () => {
    const proMemberInFreeProj = authedDb(PRO_OWNER)
    const freeMemberInProProj = authedDb(FREE_MEMBER)

    // DENIED in Free-owned project (proj-free-1) EVEN THOUGH writer is PRO_OWNER!
    await assertFails(
      proMemberInFreeProj.doc('projects/proj-free-1/tasks/t-pro-dur').set(
        makeProjectTask({
          project: 'proj-free-1',
          dur: 60,
          createdBy: PRO_OWNER,
        }),
      ),
    )
    await assertFails(
      proMemberInFreeProj.doc('projects/proj-free-1/tasks/t-free-1').update({
        rec: 'weekdays',
        updatedBy: PRO_OWNER,
      }),
    )
    await assertFails(
      proMemberInFreeProj.doc('projects/proj-free-1/tasks/t-free-1').update({
        rec: 'monthly',
        updatedBy: PRO_OWNER,
      }),
    )
    // Multi-reminder denied in Free-owned project even for PRO_OWNER, including cross-project spoofing!
    await assertFails(
      proMemberInFreeProj.doc(`users/${PRO_OWNER}/reminders/t-free-1`).set({
        projectId: 'proj-free-1',
        keys: ['m10', 'm30'],
      }),
    )
    await assertFails(
      proMemberInFreeProj.doc(`users/${PRO_OWNER}/reminders/t-free-1`).set({
        projectId: 'proj-pro',
        keys: ['m10', 'm30'],
      }),
    )

    // Free-tier features in Free-owned project still succeed for PRO_OWNER.
    await assertSucceeds(
      proMemberInFreeProj.doc('projects/proj-free-1/tasks/t-free-ok').set(
        makeProjectTask({
          project: 'proj-free-1',
          dur: null,
          rec: 'weekly',
          createdBy: PRO_OWNER,
        }),
      ),
    )
    await assertSucceeds(
      proMemberInFreeProj.doc(`users/${PRO_OWNER}/reminders/t-free-1`).set({
        projectId: 'proj-free-1',
        keys: ['m30'],
      }),
    )

    // ALLOWED in Pro-owned project (proj-pro) EVEN THOUGH writer is FREE_MEMBER!
    await assertSucceeds(
      freeMemberInProProj.doc('projects/proj-pro/tasks/t-free-writes-pro').set(
        makeProjectTask({
          project: 'proj-pro',
          dur: 90,
          rec: 'weekdays',
          createdBy: FREE_MEMBER,
        }),
      ),
    )
    await assertSucceeds(
      freeMemberInProProj.doc('projects/proj-pro/tasks/t-free-writes-pro').update({
        dur: 120,
        rec: 'monthly',
        updatedBy: FREE_MEMBER,
      }),
    )
    await assertSucceeds(
      freeMemberInProProj.doc(`users/${FREE_MEMBER}/reminders/t-pro-1`).set({
        projectId: 'proj-pro',
        keys: ['m10', 'h1', 'd1'],
      }),
    )

    // Atomic move batch: create project task and its reminder in the same writeBatch.
    const moveBatch = freeMemberInProProj.batch()
    moveBatch.set(
      freeMemberInProProj.doc('projects/proj-pro/tasks/t-moved-with-rem'),
      makeProjectTask({
        project: 'proj-pro',
        createdBy: FREE_MEMBER,
      }),
    )
    moveBatch.set(freeMemberInProProj.doc(`users/${FREE_MEMBER}/reminders/t-moved-with-rem`), {
      projectId: 'proj-pro',
      keys: ['m10', 'm30'],
    })
    await assertSucceeds(moveBatch.commit())
  })

  it('11b. setelah pemilik proyek turun dari Pro ke Gratis, mengubah status/menghapus nilai Pro lama diizinkan, sedangkan mengganti atau memasang nilai Pro baru ditolak (termasuk pengingat ganda)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await db.doc('projects/proj-pro/tasks/t-pro-existing').set(
        makeProjectTask({
          project: 'proj-pro',
          title: 'Tugas Berdurasi Lama',
          dur: 60,
          rec: 'weekdays',
          createdBy: PRO_OWNER,
        }),
      )
      await db.doc(`users/${FREE_MEMBER}/reminders/t-pro-existing`).set({
        projectId: 'proj-pro',
        keys: ['m10', 'm30', 'd1'],
      })
      await db.doc('projects/proj-pro').update({ ownerPlan: 'free' })
    })

    const memberDb = authedDb(FREE_MEMBER)
    const ownerDb = authedDb(PRO_OWNER)
    const taskRef = memberDb.doc('projects/proj-pro/tasks/t-pro-existing')
    const remRef = memberDb.doc(`users/${FREE_MEMBER}/reminders/t-pro-existing`)

    // Changing status while keeping existing dur/rec is allowed.
    await assertSucceeds(taskRef.update({ status: 'done', updatedBy: FREE_MEMBER }))
    // Replacing dur or rec with another Pro value is denied.
    await assertFails(taskRef.update({ dur: 120, updatedBy: FREE_MEMBER }))
    await assertFails(taskRef.update({ rec: 'monthly', updatedBy: FREE_MEMBER }))
    // Clearing dur individually (while rec: 'weekdays' remains) or clearing rec is allowed.
    await assertSucceeds(ownerDb.doc('projects/proj-pro/tasks/t-pro-existing').update({ dur: null, updatedBy: PRO_OWNER }))
    await assertSucceeds(taskRef.update({ rec: null, updatedBy: FREE_MEMBER }))
    // Creating a new Pro-featured task after downgrade is still denied.
    await assertFails(
      ownerDb.doc('projects/proj-pro/tasks/t-after-downgrade').set(
        makeProjectTask({
          project: 'proj-pro',
          dur: 30,
          createdBy: PRO_OWNER,
        }),
      ),
    )

    // Existing multi-reminder can keep or remove items, but cannot add or swap to new multi-reminders.
    await assertSucceeds(remRef.update({ projectId: 'proj-pro', keys: ['m10', 'm30', 'd1'], updatedAt: new Date() }))
    await assertSucceeds(remRef.update({ projectId: 'proj-pro', keys: ['m10', 'm30'] }))
    await assertFails(remRef.update({ projectId: 'proj-pro', keys: ['m10', 'm30', 'h1'] }))
    await assertFails(remRef.update({ projectId: 'proj-pro', keys: ['d0', 'd1'] }))
    await assertSucceeds(remRef.update({ projectId: 'proj-pro', keys: ['m10'] }))
  })
})

describe('Serangan 12 & 13 — Riwayat aktivitas proyek', () => {
  it('12. menolak membaca aktivitas di proyek pemilik Gratis (walaupun pembacanya Pro), dan mengizinkan semua anggota membacanya di proyek pemilik Pro', async () => {
    const freeOwnerDb = authedDb(FREE_OWNER)
    const proMemberDb = authedDb(PRO_OWNER)
    const freeMemberDb = authedDb(FREE_MEMBER)

    // Denied in Free-owned project for both Free owner and Pro member.
    await assertFails(freeOwnerDb.doc('projects/proj-free-1/activity/act-free-1').get())
    await assertFails(freeOwnerDb.collection('projects/proj-free-1/activity').get())
    await assertFails(proMemberDb.doc('projects/proj-free-1/activity/act-free-1').get())
    await assertFails(proMemberDb.collection('projects/proj-free-1/activity').get())

    // Allowed in Pro-owned project for both Pro owner and Free member.
    await assertSucceeds(proMemberDb.doc('projects/proj-pro/activity/act-pro-1').get())
    await assertSucceeds(freeMemberDb.doc('projects/proj-pro/activity/act-pro-1').get())
    await assertSucceeds(freeMemberDb.collection('projects/proj-pro/activity').get())
  })

  it('13. menolak klien menulis, mengubah, atau menghapus aktivitas di proyek mana pun', async () => {
    const proOwnerDb = authedDb(PRO_OWNER)
    const freeMemberDb = authedDb(FREE_MEMBER)

    await assertFails(
      proOwnerDb.doc('projects/proj-pro/activity/act-client').set({
        actorId: PRO_OWNER,
        text: 'Palsu',
        createdAt: new Date(),
      }),
    )
    await assertFails(
      freeMemberDb.doc('projects/proj-pro/activity/act-client-2').set({
        actorId: FREE_MEMBER,
        text: 'Palsu',
        createdAt: new Date(),
      }),
    )
    await assertFails(proOwnerDb.doc('projects/proj-pro/activity/act-pro-1').update({ text: 'Diubah' }))
    await assertFails(proOwnerDb.doc('projects/proj-pro/activity/act-pro-1').delete())
  })

  it('14. menolak klien membaca, mendaftar, atau menulis koleksi nisan deletedProjects', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('deletedProjects/proj-deleted-1').set({
        ownerId: PRO_OWNER,
        deletedAt: new Date(),
      })
    })

    const ownerDb = authedDb(PRO_OWNER)
    const outsiderDb = authedDb(OUTSIDER)
    const anonDb = unauthedDb()

    await assertFails(anonDb.doc('deletedProjects/proj-deleted-1').get())
    await assertFails(ownerDb.doc('deletedProjects/proj-deleted-1').get())
    await assertFails(outsiderDb.doc('deletedProjects/proj-deleted-1').get())
    await assertFails(ownerDb.collection('deletedProjects').get())
    await assertFails(
      ownerDb.doc('deletedProjects/proj-deleted-2').set({
        ownerId: PRO_OWNER,
        deletedAt: new Date(),
      }),
    )
    await assertFails(ownerDb.doc('deletedProjects/proj-deleted-1').update({ ownerId: OUTSIDER }))
    await assertFails(ownerDb.doc('deletedProjects/proj-deleted-1').delete())
  })

  it('15. menolak color proyek berisi url(...) atau warna di luar daftar sah, dan menerima setiap warna sah AREA_COLORS + var(--accent)', async () => {
    const ownerDb = authedDb(FREE_OWNER)

    await assertFails(ownerDb.doc('projects/proj-free-1').update({ color: 'url(https://contoh.test/lacak.png)' }))
    await assertFails(ownerDb.doc('projects/proj-free-1').update({ color: '#ff0000' }))
    await assertFails(ownerDb.doc('projects/proj-free-1').update({ color: 'red' }))
    await assertFails(ownerDb.doc('projects/proj-free-1').update({ color: 'var(--high)' }))

    const validColors = [
      'var(--area-kuliah)',
      'var(--area-kantor)',
      'var(--area-pribadi)',
      'oklch(0.62 0.14 50)',
      'oklch(0.6 0.11 195)',
      'oklch(0.6 0.15 0)',
      'var(--accent)',
    ]
    for (const color of validColors) {
      await assertSucceeds(ownerDb.doc('projects/proj-free-1').update({ color }))
    }
  })
})
