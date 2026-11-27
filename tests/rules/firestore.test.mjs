import { readFileSync } from 'node:fs'
import { after, before, beforeEach, describe, it } from 'node:test'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'

const PROJECT_ID = 'demo-taskflow'
const RULES_PATH = new URL('../../firestore.rules', import.meta.url)

const FREE_UID = 'user-free'
const PRO_UID = 'user-pro'
const OTHER_UID = 'user-other'

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
let testEnv

const authedDb = (uid) => testEnv.authenticatedContext(uid).firestore()
const unauthedDb = () => testEnv.unauthenticatedContext().firestore()

async function seedBaseData() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    const createdAt = new Date('2026-11-25T00:00:00Z')

    await db.doc(`users/${FREE_UID}`).set({
      name: 'Budi Gratis',
      email: 'free@example.com',
      photoURL: null,
      plan: 'free',
      proSource: null,
      proSince: null,
      activeOwned: 0,
      createdAt,
    })

    await db.doc(`users/${PRO_UID}`).set({
      name: 'Siti Pro',
      email: 'pro@example.com',
      photoURL: null,
      plan: 'pro',
      proSource: 'manual',
      proSince: createdAt,
      activeOwned: 2,
      createdAt,
    })

    await db.doc(`users/${FREE_UID}/areas/kuliah`).set({
      name: 'Kuliah',
      color: 'var(--area-kuliah)',
      order: 0,
    })

    await db.doc(`users/${FREE_UID}/tasks/t-existing`).set({
      title: 'Tugas awal',
      project: null,
      area: 'kuliah',
      section: null,
      assignee: null,
      status: 'todo',
      prio: 'med',
      start: null,
      due: '2026-11-26',
      time: null,
      dur: null,
      rec: null,
      notes: '',
      createdBy: FREE_UID,
      createdAt,
    })

    await db.doc(`users/${PRO_UID}/tasks/t-pro-full`).set({
      title: 'Tugas Pro lengkap',
      project: null,
      area: 'kantor',
      section: null,
      assignee: null,
      status: 'in_progress',
      prio: 'high',
      start: '2026-11-25',
      due: '2026-11-28',
      time: '09:30',
      dur: 60,
      rec: 'weekdays',
      notes: 'Catatan panjang untuk pengujian update penuh',
      rems: ['m10', 'm30'],
      guide: false,
      createdBy: PRO_UID,
      createdAt,
      updatedAt: createdAt,
      completedAt: null,
    })

    await db.doc(`users/${FREE_UID}/reminders/r-existing`).set({
      keys: ['m30'],
      projectId: 'proj-free',
    })

    const validInviteToken = 'tok_seed_1234567890abcdef'

    await db.doc('projects/proj-1').set({
      ownerId: PRO_UID,
      name: 'Tugas Akhir',
      ownerArea: 'kantor',
      color: 'var(--area-kantor)',
      start: '2026-11-25',
      due: '2026-12-10',
      sections: ['Riset'],
      archived: false,
      memberIds: [PRO_UID, FREE_UID],
      memberCount: 2,
      ownerPlan: 'pro',
      inviteToken: validInviteToken,
      createdAt,
    })

    await db.doc('projects/proj-1/tasks/pt-1').set({
      title: 'Tugas proyek',
      project: 'proj-1',
      area: null,
      section: 'Riset',
      assignee: PRO_UID,
      status: 'todo',
      prio: 'med',
      start: null,
      due: '2026-12-01',
      time: null,
      dur: null,
      rec: null,
      notes: '',
      createdBy: PRO_UID,
      updatedBy: PRO_UID,
      createdAt,
    })

    await db.doc('projects/proj-free').set({
      ownerId: FREE_UID,
      name: 'Proyek Gratis',
      ownerArea: 'kuliah',
      color: 'var(--area-kuliah)',
      start: '2026-11-25',
      due: '2026-12-05',
      sections: [],
      archived: false,
      memberIds: [FREE_UID],
      memberCount: 1,
      ownerPlan: 'free',
      inviteToken: null,
      createdAt,
    })

    await db.doc('projects/proj-free/tasks/pt-free-1').set({
      title: 'Tugas di proyek Gratis',
      project: 'proj-free',
      area: null,
      section: null,
      assignee: FREE_UID,
      status: 'todo',
      prio: 'med',
      start: null,
      due: '2026-12-02',
      time: null,
      dur: null,
      rec: null,
      notes: '',
      createdBy: FREE_UID,
      updatedBy: FREE_UID,
      createdAt,
    })

    await db.doc(`invites/${validInviteToken}`).set({
      projectId: 'proj-1',
      ownerId: PRO_UID,
      active: true,
      createdAt,
      projectName: 'Tugas Akhir',
      ownerName: 'Siti Pro',
      memberCount: 2,
      due: '2026-12-10',
      full: false,
    })

    await db.doc('purchases/pay-1').set({
      uid: PRO_UID,
      status: 'verified',
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
  await seedBaseData()
})

after(async () => {
  await testEnv.cleanup()
})

describe('users/{uid} — akses dasar, isolasi, dan field server', () => {
  it('menolak semua baca dan tulis tanpa login', async () => {
    const db = unauthedDb()
    await assertFails(db.doc(`users/${FREE_UID}`).get())
    await assertFails(db.doc(`users/${FREE_UID}`).update({ name: 'Anonim' }))
    await assertFails(db.doc('users/new-anon').set({ name: 'Anonim' }))
  })

  it('mengizinkan pemilik membaca dan mengubah setelan miliknya sendiri', async () => {
    const db = authedDb(FREE_UID)
    await assertSucceeds(db.doc(`users/${FREE_UID}`).get())
    await assertSucceeds(
      db.doc(`users/${FREE_UID}`).update({
        name: 'Budi Santoso',
        theme: 'dark',
        sound: true,
        haptics: false,
        onboarding: true,
        checkedAreas: true,
      }),
    )
  })

  it('menolak pengguna lain membaca atau mengubah profil orang lain', async () => {
    const db = authedDb(OTHER_UID)
    await assertFails(db.doc(`users/${FREE_UID}`).get())
    await assertFails(db.doc(`users/${FREE_UID}`).update({ name: 'Dibajak' }))
  })

  it('menolak klien membuat atau menghapus dokumen users/{uid}', async () => {
    const db = authedDb(OTHER_UID)
    await assertFails(
      db.doc(`users/${OTHER_UID}`).set({
        name: 'Buat sendiri',
        email: 'other@example.com',
        plan: 'pro',
      }),
    )
    await assertFails(authedDb(FREE_UID).doc(`users/${FREE_UID}`).delete())
  })

  it('menolak klien mengubah field khusus server (plan, proSource, proSince, createdAt, email, activeOwned)', async () => {
    const db = authedDb(FREE_UID)
    await assertFails(db.doc(`users/${FREE_UID}`).update({ plan: 'pro' }))
    await assertFails(db.doc(`users/${FREE_UID}`).update({ proSource: 'xendit' }))
    await assertFails(db.doc(`users/${FREE_UID}`).update({ proSince: new Date() }))
    await assertFails(db.doc(`users/${FREE_UID}`).update({ createdAt: new Date() }))
    await assertFails(db.doc(`users/${FREE_UID}`).update({ email: 'hacked@example.com' }))
    await assertFails(db.doc(`users/${FREE_UID}`).update({ activeOwned: 1 }))
    await assertFails(db.doc(`users/${FREE_UID}`).update({ unknownField: true }))
  })
})

describe('users/{uid} — warna aksen (Gratis vs Pro)', () => {
  it('mengizinkan akun Gratis memilih indigo dan menolak aksen lain', async () => {
    const db = authedDb(FREE_UID)
    await assertSucceeds(db.doc(`users/${FREE_UID}`).update({ accent: 'indigo' }))
    await assertFails(db.doc(`users/${FREE_UID}`).update({ accent: 'teal' }))
    await assertFails(db.doc(`users/${FREE_UID}`).update({ accent: 'tangerine' }))
    await assertFails(db.doc(`users/${FREE_UID}`).update({ accent: 'forest' }))
  })

  it('mengizinkan akun Pro memilih semua warna aksen resmi dan menolak nilai asing', async () => {
    const db = authedDb(PRO_UID)
    await assertSucceeds(db.doc(`users/${PRO_UID}`).update({ accent: 'teal' }))
    await assertSucceeds(db.doc(`users/${PRO_UID}`).update({ accent: 'tangerine' }))
    await assertSucceeds(db.doc(`users/${PRO_UID}`).update({ accent: 'forest' }))
    await assertSucceeds(db.doc(`users/${PRO_UID}`).update({ accent: 'indigo' }))
    await assertFails(db.doc(`users/${PRO_UID}`).update({ accent: 'neon-pink' }))
  })
})

describe('users/{uid}/areas — area pribadi', () => {
  it('mengizinkan pemilik membuat, membaca, mengubah, dan menghapus area valid', async () => {
    const db = authedDb(FREE_UID)
    const ref = db.doc(`users/${FREE_UID}/areas/kantor`)
    await assertSucceeds(ref.set({ name: 'Kantor', color: 'var(--area-kantor)', order: 1 }))
    await assertSucceeds(ref.get())
    await assertSucceeds(ref.update({ name: 'Kerja' }))
    await assertSucceeds(ref.delete())
  })

  it('menolak area tidak valid (nama kosong atau field asing)', async () => {
    const db = authedDb(FREE_UID)
    await assertFails(db.doc(`users/${FREE_UID}/areas/bad1`).set({ name: '', color: 'var(--area-kuliah)' }))
    await assertFails(db.doc(`users/${FREE_UID}/areas/bad2`).set({ name: '   ', color: 'var(--area-kuliah)' }))
    await assertFails(db.doc(`users/${FREE_UID}/areas/bad3`).set({ name: 'Kantor', color: 'var(--area-kantor)', extra: 1 }))
  })

  it('menolak tanpa login dan pengguna lain membaca atau menulis area pribadi', async () => {
    await assertFails(unauthedDb().doc(`users/${FREE_UID}/areas/kuliah`).get())
    await assertFails(unauthedDb().doc(`users/${FREE_UID}/areas/a-anon`).set({ name: 'Anon', color: 'red' }))

    const other = authedDb(OTHER_UID)
    await assertFails(other.doc(`users/${FREE_UID}/areas/kuliah`).get())
    await assertFails(other.doc(`users/${FREE_UID}/areas/kuliah`).update({ name: 'Diubah' }))
    await assertFails(other.doc(`users/${FREE_UID}/areas/kuliah`).delete())
    await assertFails(other.doc(`users/${FREE_UID}/areas/baru`).set({ name: 'Susupan', color: 'red' }))
  })
})

describe('users/{uid}/tasks — isolasi dan validasi judul tugas', () => {
  it('mengizinkan pemilik CRUD tugas valid termasuk judul tepat 300 karakter', async () => {
    const db = authedDb(FREE_UID)
    const ref = db.doc(`users/${FREE_UID}/tasks/t-300`)
    await assertSucceeds(
      ref.set({
        title: 'a'.repeat(300),
        project: null,
        area: 'kuliah',
        status: 'todo',
        prio: 'high',
        due: '2026-11-26',
        dur: null,
        rec: null,
        notes: 'Catatan singkat',
      }),
    )
    await assertSucceeds(ref.get())
    await assertSucceeds(ref.update({ status: 'done' }))
    await assertSucceeds(ref.delete())
  })

  it('menolak judul kosong, hanya spasi, bukan string, atau lebih dari 300 karakter', async () => {
    const db = authedDb(FREE_UID)
    await assertFails(db.doc(`users/${FREE_UID}/tasks/t-empty`).set({ title: '' }))
    await assertFails(db.doc(`users/${FREE_UID}/tasks/t-space`).set({ title: '   ' }))
    await assertFails(db.doc(`users/${FREE_UID}/tasks/t-missing`).set({ notes: 'Tanpa judul' }))
    await assertFails(db.doc(`users/${FREE_UID}/tasks/t-num`).set({ title: 12345 }))
    await assertFails(db.doc(`users/${FREE_UID}/tasks/t-long`).set({ title: 'a'.repeat(301) }))
  })

  it('menolak tanpa login dan pengguna lain mengakses tugas pribadi', async () => {
    await assertFails(unauthedDb().doc(`users/${FREE_UID}/tasks/t-existing`).get())
    await assertFails(unauthedDb().doc(`users/${FREE_UID}/tasks/t-anon`).set({ title: 'Anon' }))

    const other = authedDb(OTHER_UID)
    await assertFails(other.doc(`users/${FREE_UID}/tasks/t-existing`).get())
    await assertFails(other.doc(`users/${FREE_UID}/tasks/t-existing`).update({ title: 'Dibajak' }))
    await assertFails(other.doc(`users/${FREE_UID}/tasks/t-existing`).delete())
    await assertFails(other.doc(`users/${FREE_UID}/tasks/t-inject`).set({ title: 'Susupan' }))
  })

  it('menolak tugas lepas yang mengisi field project non-null', async () => {
    const db = authedDb(FREE_UID)
    await assertFails(db.doc(`users/${FREE_UID}/tasks/t-proj`).set({ title: 'Salah tempat', project: 'proj-1' }))
  })
})

describe('users/{uid}/tasks — batasan fitur Pro (dur, rec, rems)', () => {
  it('dur: ditolak untuk Gratis bila terisi, diizinkan untuk Pro', async () => {
    const freeDb = authedDb(FREE_UID)
    const proDb = authedDb(PRO_UID)

    await assertSucceeds(freeDb.doc(`users/${FREE_UID}/tasks/t-nodur`).set({ title: 'Tanpa durasi', dur: null }))
    await assertFails(freeDb.doc(`users/${FREE_UID}/tasks/t-dur`).set({ title: 'Dengan durasi', dur: 60 }))
    await assertFails(freeDb.doc(`users/${FREE_UID}/tasks/t-existing`).update({ dur: 30 }))

    await assertSucceeds(proDb.doc(`users/${PRO_UID}/tasks/t-dur-pro`).set({ title: 'Durasi Pro', dur: 90 }))
    await assertFails(proDb.doc(`users/${PRO_UID}/tasks/t-dur-bad`).set({ title: 'Durasi nol', dur: 0 }))
  })

  it('rec: daily/weekly diizinkan untuk Gratis; weekdays/monthly ditolak untuk Gratis, diizinkan untuk Pro', async () => {
    const freeDb = authedDb(FREE_UID)
    const proDb = authedDb(PRO_UID)

    await assertSucceeds(freeDb.doc(`users/${FREE_UID}/tasks/t-daily`).set({ title: 'Harian', rec: 'daily' }))
    await assertSucceeds(freeDb.doc(`users/${FREE_UID}/tasks/t-weekly`).set({ title: 'Mingguan', rec: 'weekly' }))
    await assertFails(freeDb.doc(`users/${FREE_UID}/tasks/t-weekdays`).set({ title: 'Hari kerja', rec: 'weekdays' }))
    await assertFails(freeDb.doc(`users/${FREE_UID}/tasks/t-monthly`).set({ title: 'Bulanan', rec: 'monthly' }))
    await assertFails(freeDb.doc(`users/${FREE_UID}/tasks/t-existing`).update({ rec: 'weekdays' }))

    await assertSucceeds(proDb.doc(`users/${PRO_UID}/tasks/t-weekdays-pro`).set({ title: 'Hari kerja Pro', rec: 'weekdays' }))
    await assertSucceeds(proDb.doc(`users/${PRO_UID}/tasks/t-monthly-pro`).set({ title: 'Bulanan Pro', rec: 'monthly' }))
    await assertFails(proDb.doc(`users/${PRO_UID}/tasks/t-bad-rec`).set({ title: 'Tidak valid', rec: 'yearly' }))
  })

  it('rems: maksimal 1 untuk Gratis, lebih dari 1 ditolak untuk Gratis dan diizinkan untuk Pro', async () => {
    const freeDb = authedDb(FREE_UID)
    const proDb = authedDb(PRO_UID)

    await assertSucceeds(freeDb.doc(`users/${FREE_UID}/tasks/t-rem0`).set({ title: 'Tanpa pengingat', rems: [] }))
    await assertSucceeds(freeDb.doc(`users/${FREE_UID}/tasks/t-rem1`).set({ title: 'Satu pengingat', rems: ['m30'] }))
    await assertFails(freeDb.doc(`users/${FREE_UID}/tasks/t-rem2`).set({ title: 'Dua pengingat', rems: ['m30', 'd1'] }))
    await assertFails(freeDb.doc(`users/${FREE_UID}/tasks/t-existing`).update({ rems: ['m10', 'h1'] }))

    await assertSucceeds(proDb.doc(`users/${PRO_UID}/tasks/t-rem2-pro`).set({ title: 'Dua pengingat Pro', rems: ['m30', 'd1'] }))
    await assertFails(proDb.doc(`users/${PRO_UID}/tasks/t-rem-bad`).set({ title: 'Bukan daftar', rems: 'm30' }))
    await assertFails(proDb.doc(`users/${PRO_UID}/tasks/t-rem-bad-key`).set({ title: 'Kunci asing', rems: ['unknown'] }))
    await assertFails(proDb.doc(`users/${PRO_UID}/tasks/t-rem-bad-type`).set({ title: 'Elemen angka', rems: [123] }))
  })

  it('mengizinkan Pro memperbarui tugas penuh (semua field Pro) dan menolak perubahan createdBy/createdAt', async () => {
    const proDb = authedDb(PRO_UID)
    const ref = proDb.doc(`users/${PRO_UID}/tasks/t-pro-full`)
    await assertSucceeds(
      ref.update({
        title: 'Tugas Pro diperbarui',
        dur: 120,
        rec: 'monthly',
        rems: ['m10', 'm30', 'd1'],
        status: 'done',
        updatedAt: new Date('2026-11-26T10:00:00Z'),
        completedAt: new Date('2026-11-26T10:00:00Z'),
      }),
    )
    await assertFails(ref.update({ createdBy: OTHER_UID }))
    await assertFails(ref.update({ createdAt: new Date('2020-01-01T00:00:00Z') }))
  })

  it('mengizinkan pengguna yang turun paket (Pro -> Gratis) mengubah status atau menghapus fitur Pro lama, tetapi menolak memasang/mengganti nilai Pro baru', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`users/${PRO_UID}`).update({ plan: 'free', proSource: null })
    })

    const downgradedDb = authedDb(PRO_UID)
    const ref = downgradedDb.doc(`users/${PRO_UID}/tasks/t-pro-full`)

    // Keeping existing dur/rec/rems while changing status or clearing individual Pro fields must succeed.
    await assertSucceeds(ref.update({ status: 'done', updatedAt: new Date() }))
    await assertSucceeds(ref.update({ rems: ['m10'] }))
    await assertSucceeds(ref.update({ dur: null }))
    await assertSucceeds(ref.update({ rec: null }))

    // Re-seed full Pro task for testing disallowed Pro replacements on downgraded Free user.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`users/${PRO_UID}/tasks/t-pro-full`).update({
        dur: 60,
        rec: 'weekdays',
        rems: ['m10', 'm30'],
      })
    })

    await assertFails(ref.update({ dur: 90 }))
    await assertFails(ref.update({ rec: 'monthly' }))
    await assertFails(ref.update({ rems: ['m10', 'm30', 'd1'] }))
    await assertFails(ref.update({ rems: ['d0', 'd1'] }))
    await assertFails(downgradedDb.doc(`users/${PRO_UID}/tasks/t-new-pro`).set({ title: 'Baru', dur: 30 }))
  })
})

describe('users/{uid}/reminders — pengingat per pengguna', () => {
  it('mengizinkan 1 pengingat di proyek pemilik Gratis, menolak >1 di proyek Gratis atau tanpa projectId, mengizinkan >1 di proyek pemilik Pro', async () => {
    const freeDb = authedDb(FREE_UID)
    const proDb = authedDb(PRO_UID)

    await assertSucceeds(freeDb.doc(`users/${FREE_UID}/reminders/r-existing`).get())
    await assertSucceeds(freeDb.doc(`users/${FREE_UID}/reminders/pt-free-1`).set({ keys: ['d1'], projectId: 'proj-free' }))
    await assertFails(freeDb.doc(`users/${FREE_UID}/reminders/pt-free-1`).set({ keys: ['m30', 'd1'], projectId: 'proj-free' }))
    await assertFails(freeDb.doc(`users/${FREE_UID}/reminders/pt-free-1`).set({ keys: ['d1'] }))
    await assertSucceeds(freeDb.doc(`users/${FREE_UID}/reminders/pt-free-1`).delete())

    await assertSucceeds(proDb.doc(`users/${PRO_UID}/reminders/pt-1`).set({ keys: ['m10', 'm30', 'd1'], projectId: 'proj-1' }))
  })

  it('menolak tanpa login dan pengguna lain mengakses reminders', async () => {
    await assertFails(unauthedDb().doc(`users/${FREE_UID}/reminders/r-existing`).get())
    await assertFails(authedDb(OTHER_UID).doc(`users/${FREE_UID}/reminders/r-existing`).get())
    await assertFails(authedDb(OTHER_UID).doc(`users/${FREE_UID}/reminders/r-existing`).set({ keys: ['d0'], projectId: 'proj-free' }))
  })
})

describe('Koleksi server-only (purchases) dan akses ilegal tingkat koleksi tetap ditolak di Fase 2', () => {
  it('menolak seluruh baca/tulis pada purchases, pembuatan proyek langsung dari klien, dan daftar seluruh invites', async () => {
    const proDb = authedDb(PRO_UID)
    await assertFails(proDb.doc('projects/proj-new').set({ ownerId: PRO_UID, name: 'Baru' }))
    await assertFails(proDb.collection('invites').get())

    await assertFails(proDb.doc('purchases/pay-1').get())
    await assertFails(proDb.doc('purchases/pay-2').set({ uid: PRO_UID }))
  })
})
