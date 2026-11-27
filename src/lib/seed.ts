import { addDays, today } from './dates'
import type { Data, Priority, Recurrence, Status, Task } from './types'

type Row = [string, string, string | null, string | null, string | null, string | null, Status, Priority, number | null, number | null, string | null, string, Recurrence?, number?]

/** Starter tasks for a new account: undated Inbox items (never overdue) that teach the app by using it. */
export function guideTasks(): Task[] {
  const rows: [string, string][] = [
    ['Centang lingkaran di kiri untuk menyelesaikan tugas', 'Tugas selesai pindah ke bawah. Centang lagi kalau ingin membatalkannya.'],
    ['Buka tugas ini untuk melihat detailnya', 'Di detail kamu bisa mengatur tanggal, prioritas, pengingat, dan catatan. Coba beri tanggal Besok.'],
    ['Hapus tugas ini lewat detail tugas', 'Buka tugas, lalu pilih Hapus. Selama 6 detik ada tombol Urungkan kalau berubah pikiran.'],
  ]
  // Swiping only exists on touch screens, so only teach it there.
  if (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) {
    rows.splice(1, 0, ['Usap tugas ini ke kanan atau ke kiri', 'Usap ke kanan untuk menyelesaikan, ke kiri untuk menjadwalkan. Tombol dan detail tugas tetap bisa dipakai.'])
  }
  return rows.map(([title, notes], i) => ({
    id: 'g' + (i + 1), title, project: null, area: null, section: null, assignee: null, status: 'todo', prio: 'med',
    start: null, due: null, time: null, notes, rec: null, dur: null, guide: true,
  }))
}

/** Demo data. Day numbers are offsets from today, so the demo always looks current. */
export function seed(): Data {
  const t0 = today()
  const d = (n: number | null) => (n == null ? null : addDays(t0, n))
  const rows: Row[] = [
    ['t1', 'Kirim revisi bab 2', 'uas', null, 'Revisi', 'me', 'todo', 'high', null, -1, null, 'Revisi sesuai catatan dosen di dokumen bersama.'],
    ['t2', 'Bayar tagihan listrik', null, 'pribadi', null, null, 'todo', 'med', null, -2, null, ''],
    ['t3', 'Rapat tugas akhir', 'uas', null, 'Pengerjaan', 'budi', 'todo', 'high', null, 0, '19:00', 'Link meet ada di grup.', 'weekly', 90],
    ['t4', 'Finalisasi slide presentasi', 'pitch', null, null, 'me', 'in_progress', 'high', -3, 0, '10:00', '', undefined, 120],
    ['t5', 'Beli paket data', null, null, null, null, 'todo', 'low', null, 0, null, ''],
    ['t6', 'Review desain UI', 'pitch', null, null, 'budi', 'done', 'med', null, 0, '14:00', ''],
    ['t7', 'Belanja bulanan', null, 'pribadi', null, null, 'todo', 'med', null, 0, null, ''],
    ['t8', 'Survei toko cat', 'reno', null, null, 'me', 'todo', 'low', null, 2, null, ''],
    ['t9', 'Tulis bab 3 metodologi', 'uas', null, 'Pengerjaan', 'siti', 'in_progress', 'med', 1, 5, null, ''],
    ['t10', 'Wawancara narasumber', 'uas', null, 'Riset', 'budi', 'todo', 'med', null, 3, '13:00', ''],
    ['t11', 'Kirim proposal anggaran', 'pitch', null, null, 'me', 'todo', 'high', null, 4, null, ''],
    ['t12', 'Cat dinding kamar', 'reno', null, null, 'me', 'todo', 'med', 5, 6, null, ''],
    ['t13', 'Kumpulkan referensi jurnal', 'uas', null, 'Riset', 'siti', 'done', 'low', -11, -5, null, ''],
    ['t14', 'Susun outline bab 1', 'uas', null, 'Pengerjaan', 'me', 'done', 'med', -8, -4, null, ''],
    ['t15', 'Latihan presentasi', 'pitch', null, null, 'me', 'todo', 'med', null, 7, '16:00', '', 'daily', 30],
    ['t16', 'Pesan furnitur', 'reno', null, null, 'me', 'todo', 'low', null, 10, null, ''],
    ['t17', 'Daftar ulang semester', null, 'kuliah', null, null, 'todo', 'high', null, 1, null, ''],
    ['t18', 'Siapkan sesi tanya jawab', 'uas', null, 'Revisi', 'me', 'todo', 'low', 13, 17, null, ''],
    ['t19', 'Perpanjang STNK', null, null, null, null, 'todo', 'med', null, 4, null, ''],
    ['t20', 'Cari ide kado untuk Ibu', null, 'pribadi', null, null, 'todo', 'low', null, null, null, ''],
  ]
  return {
    areas: [
      { id: 'kuliah', name: 'Kuliah', color: 'var(--area-kuliah)' },
      { id: 'kantor', name: 'Kantor', color: 'var(--area-kantor)' },
      { id: 'pribadi', name: 'Pribadi', color: 'var(--area-pribadi)' },
    ],
    projects: [
      { id: 'uas', name: 'Tugas Akhir UAS', area: 'kuliah', color: 'var(--area-kuliah)', start: d(-13)!, due: d(19)!, members: ['me', 'budi', 'siti'], sections: ['Riset', 'Pengerjaan', 'Revisi'], archived: false },
      { id: 'pitch', name: 'Pitch Klien Q4', area: 'kantor', color: 'var(--area-kantor)', start: d(-7)!, due: d(9)!, members: ['me', 'budi'], sections: [], archived: false },
      { id: 'reno', name: 'Renovasi Kamar', area: 'pribadi', color: 'var(--area-pribadi)', start: d(-3)!, due: d(13)!, members: ['me'], sections: [], archived: false },
      { id: 'kos', name: 'Pindahan Kos', area: 'pribadi', color: 'var(--area-pribadi)', start: d(-22)!, due: d(-11)!, members: ['me'], sections: [], archived: true },
    ],
    tasks: rows.map(a => ({
      id: a[0], title: a[1], project: a[2], area: a[3], section: a[4], assignee: a[5], status: a[6], prio: a[7],
      start: d(a[8]), due: d(a[9]), time: a[10], notes: a[11], rec: a[12] ?? null, dur: a[13] ?? null,
    })),
    activity: [
      { p: 'pitch', text: 'Budi menyelesaikan "Review desain UI"', ts: Date.now() - 3 * 3600e3 },
      { p: 'uas', text: 'Siti memindah "Tulis bab 3 metodologi" ke Dikerjakan', ts: Date.now() - 2 * 864e5 },
      { p: 'uas', text: 'Kamu menyelesaikan "Susun outline bab 1"', ts: Date.now() - 4 * 864e5 },
      { p: 'uas', text: 'Siti menyelesaikan "Kumpulkan referensi jurnal"', ts: Date.now() - 5 * 864e5 },
    ],
  }
}
