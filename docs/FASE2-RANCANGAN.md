# Rancangan Backend Fase 2: Proyek dan Kolaborasi (Langkah 2A)

Dokumen ini menjawab lima pokok rancangan di `docs/HANDOFF-FASE2.md` §4 (2A) dengan menutup seluruh celah `docs/BACKEND.md` §4.1 sebelum kode ditulis.

---

## 1. Penegakan Kuota Proyek (Buat, Arsipkan, Pulihkan, Hapus)

Aturan: akun Gratis maksimal memiliki **5 proyek aktif milik sendiri** (`ownerId == uid && archived == false`). Proyek arsip dan proyek milik orang lain tidak dihitung.

| Aspek | Opsi (a) Callable Function *(disarankan di Handoff)* | Opsi (b) Batch Klien + Aturan Dua Arah |
|---|---|---|
| Cara kerja | Klien memanggil Function (`createProject`, `setProjectArchived`, `deleteProject`). `activeOwned` dan `archived` dikunci dari klien di Security Rules; Function memvalidasi `users/{uid}.plan` dan kuota dalam satu transaksi server. | Klien mengirim `writeBatch` ke `projects/{pid}` dan `users/{uid}` sekaligus; Security Rules mengikat keduanya memakai `getAfter` dan `existsAfter`. |
| Keamanan & celah §4.1 | Sangat rapat: klien mustahil memalsukan `ownerPlan`, menurunkan `activeOwned`, atau membuat/memulihkan proyek ke-6 tanpa Function. | Rawan kasus tepi: butuh field saksi di `users/{uid}`, batas 10 baca aturan per batch, dan belum ada `reconcileCounters` di Fase 2. |
| Pengalaman offline | 4 aksi siklus hidup proyek butuh internet (sama seperti `joinProject`). **Isi proyek** (tugas, bagian, nama, tenggat, area) tetap bisa diubah offline lewat Firestore biasa. | Keempat aksi siklus hidup proyek bisa diantrekan saat offline, tetapi bila ditolak saat online lagi (kuota penuh di perangkat lain), seluruh batch gagal dan UI harus memutar balik tampilan. |
| Migrasi lokal (2F) | Mudah memindahkan hingga 5 proyek lokal sekaligus secara transaksional. | Hanya bisa 1 proyek per batch karena satu field pengikat di `users/{uid}`. |

**Rincian lengkap aturan dua arah bila memilih Opsi (b):**
Dokumen `users/{uid}` menambah satu field saksi `lastQuotaPid` (hanya boleh diubah pemilik bersama `activeOwned`):
1. **Dari `projects/{pid}` ke `users/{uid}`:**
   - `create`: wajib `ownerId == me()`, `memberIds == [me()]`, `memberCount == 1`, `archived == false`, `ownerPlan == userDoc(me()).get('plan', 'free')`, `getAfter(users/me()).data.activeOwned == userDoc(me()).activeOwned + 1`, dan `getAfter(users/me()).data.lastQuotaPid == pid`.
   - `update` field `archived` oleh pemilik: bila `!resource.data.archived && request.resource.data.archived` (arsipkan), wajib `activeOwned` turun `1` dan `lastQuotaPid == pid`; bila sebaliknya (pulihkan), wajib `activeOwned` naik `1` dan `lastQuotaPid == pid`.
   - `delete` oleh pemilik: bila `!resource.data.archived`, wajib `activeOwned` turun `1` dan `lastQuotaPid == pid`; bila sudah diarsipkan, `activeOwned` tidak boleh berubah.
2. **Dari `users/{uid}` balik ke `projects/{pid}` (mencegah klien menurunkan `activeOwned` sendirian):**
   - `activeOwned` wajib bilangan bulat `>= 0`, hanya bergeser `+1` atau `-1`, dan hasil akhirnya `<= 5 || plan == 'pro'`.
   - Saat naik `+1` dengan `pid = request.resource.data.lastQuotaPid`: wajib proyek `pid` milik `uid` baru dibuat aktif (`!exists(projects/pid) && existsAfter(projects/pid) && !getAfter(projects/pid).data.archived && getAfter(projects/pid).data.ownerId == uid`) **atau** proyek arsip milik `uid` dipulihkan (`exists(projects/pid) && get(projects/pid).data.ownerId == uid && get(projects/pid).data.archived && !getAfter(projects/pid).data.archived`).
   - Saat turun `-1` dengan `pid = request.resource.data.lastQuotaPid`: wajib sebelumnya proyek `pid` milik `uid` berstatus aktif (`exists(projects/pid) && get(projects/pid).data.ownerId == uid && !get(projects/pid).data.archived`) dan sesudahnya terhapus atau menjadi arsip (`!existsAfter(projects/pid) || getAfter(projects/pid).data.archived == true`).

> **Keputusan pemilik (26 Nov 2026):** dipilih **Opsi (a) Callable Function** (`createProject`, `setProjectArchived`, `deleteProject`). `activeOwned` dan perubahan `archived`/`create`/`delete` proyek dikunci dari klien di Security Rules.

---

## 2. Model "Orang" dan Pengecekan Paket Pemilik Proyek

Satu modul `src/lib/people.ts` dan helper di `store` menggantikan seluruh pembacaan langsung `PEOPLE[id]` serta literal `'me'` di `Composer`, `TaskDetail`, `TaskRow`, `ProjectView`, `ProjectsView`, `Share`, `Reminders`, dan `store.tsx`:
- **Identitas diri (`s.selfId`):** bernilai `'me'` di Mode Demo/lokal, dan `uid` Firebase di akun nyata. Kepemilikan proyek dicek lewat `s.isOwner(project)` (`(project.ownerId ?? 'me') === s.selfId`).
- **Satu pintu `s.personOf(id, projectId?) -> Person`:**
  - **Mode Demo:** langsung mengembalikan entri `PEOPLE[id]` (`me` memakai nama `account.name`, serta `budi`, `siti`, `rani`, `dimas`, `wulan`, `tono` tidak berubah).
  - **Akun nyata:** bila `id === uid`, memakai `account.name` (inisial huruf pertama kapital, warna `PEOPLE.me.c`). Bila `id` anggota lain, nama diambil dari `projects/{pid}/members/{id}.name` (dengan cadangan cache lintas proyek, atau `{ name: 'Anggota', i: '?' }` saat snapshot belum tiba/mantan anggota agar UI tidak pernah gagal render).
- **Warna avatar tetap tanpa warna baru:** ketujuh warna `oklch(...)` yang sudah ada di `PEOPLE` diekspor sebagai `PEOPLE_COLORS`. Untuk `uid` nyata, warna dipilih deterministik lewat hash ringan (`hashUid(uid) % PEOPLE_COLORS.length`) sehingga warna seorang anggota selalu konsisten di semua layar dan perangkat tanpa menambah palet baru.
- **Paket pemilik proyek (`s.isProFor(project)`):** mengembalikan `true` di Mode Demo, `project.ownerPlan === 'pro'` untuk fitur di dalam proyek bersama (durasi, ulangi Hari kerja/Bulanan, pengingat ganda pada `users/{uid}/reminders/{taskId}` yang menyertakan `projectId`, tab Timeline proyek, dan riwayat aktivitas), serta jatuh ke `s.isPro` untuk tugas lepas dan fitur pribadi.

---

## 3. Susunan Kode (`src/store.tsx`)

`src/store.tsx` (~1.550 baris) dipecah menjadi empat modul pembantu di `src/lib/` dengan tetap mempertahankan **satu `StoreProvider` dan satu `useStore()`** (komponen UI tidak berubah):
1. `src/lib/localStore.ts`: baca/simpan `localStorage` (`data`, `byUid`, `legacy`, `migrated`), flag `sessionStorage` (redirect login dan token undangan), serta sinkronisasi antar-tab `storage`.
2. `src/lib/cloudCodec.ts`: fungsi murni pemetaan dokumen Firestore ke tipe aplikasi (`Task`, `Area`, `Project`, `Member`, `Activity`, `Reminder`), termasuk pengisian wajib `updatedBy: uid` pada tugas proyek untuk riwayat aktivitas (§4.1 #7).
3. `src/lib/writeQueue.ts`: antrean tulis tertunda 600 ms untuk ketikan teks (`title`, `notes`, nama area, nama proyek) beserta `flush` saat `blur`/tutup/pindah/`visibilitychange`/`pagehide`, dan timer tunda 6 detik untuk aksi server.
4. `src/lib/people.ts`: resolver `Person`, warna avatar berbasis `uid`, dan helper `isProFor`.

Pemecahan ini dikerjakan sebagai **langkah terpisah sebelum menyambungkan proyek ke Firestore di 2D**, murni memindah kode tanpa mengubah perilaku, diverifikasi build + tes, dalam **satu commit tersendiri**.

---

## 4. Listener dan Perkiraan Biaya Baca

Mode Demo tidak membuka koneksi Firebase (0 baca). Untuk akun nyata:

| Jalur Firestore | Cara muat | Kapan aktif |
|---|---|---|
| `users/{uid}`, `users/{uid}/areas`, `users/{uid}/tasks`, `users/{uid}/reminders` | `onSnapshot` | Selama sesi login aktif. |
| `projects` (`memberIds array-contains uid` & `archived == false`) | `onSnapshot` | Selama sesi login aktif (indeks komposit di `firestore.indexes.json`). |
| `projects/{pid}/tasks` | `onSnapshot` | Untuk tiap proyek aktif (agar Hari Ini, Jadwal, pencarian, dan progres selalu sinkron). |
| `projects/{pid}/members` | `onSnapshot` | Saat proyek dibuka (`ProjectView`/Bagikan/Kelola), **dan** pada proyek aktif bersama (`memberIds.length > 1` atau `ownerId !== uid`) agar `members/{uid}.area` milik anggota serta inisial avatar di kartu/daftar langsung tersedia. Proyek pribadi tunggal = **0 baca anggota**. |
| Proyek arsip, `projects/{pid}/activity`, dan `invites/{token}` | `getDocs` / `getDoc` | **Dimuat sekali saat dibuka**: tab Arsip (tugas arsip baru dimuat saat kartunya dibuka), panel Bagikan (`ownerPlan == 'pro'`, ambil 30 terbaru dari maks. 200), dan halaman `/invite/{token}` (1 baca). |

**Perkiraan bacaan harian (1 pengguna aktif: 1 profil, 3 area, 25 tugas lepas, 3 pengingat, 2 proyek pribadi + 1 proyek bersama 3 anggota, total 36 tugas proyek):**
- Muat awal cache dingin: `1 + 3 + 25 + 3 + 3 + 36 + 3 = ~74 baca`.
- Buka ulang di perangkat yang sama (`persistentLocalCache`): hanya dokumen yang berubah (~5 sampai 15 baca).
- Perubahan kolaborasi & buka Bagikan/Arsip harian: ~30 sampai 80 baca.
- **Total: ±80 sampai 180 baca/pengguna aktif/hari.** Kuota gratis Firestore (50.000 baca/hari) cukup untuk ±250 sampai 500 pengguna aktif harian.

---

## 5. Urungkan (6 Detik) untuk Aksi Server

- **Hapus bagian (`deleteSection`):** tetap memakai `undoableCloud` (batch Firestore klien + tulis balik bila diurungkan, berfungsi online dan offline).
- **Aksi lewat Callable Function** (`removeMember`, serta `archiveProject` dan `deleteProject` pada Opsi 1a; `deleteProject` tetap ditunda pada Opsi 1b karena trigger `onProjectDeleted` menghapus permanen seluruh subkoleksi tugas/anggota/aktivitas): memakai **tunda pengiriman 6 detik** di `writeQueue`.
  1. Saat ditekan, UI langsung menyembunyikan proyek/anggota di memori (*optimistic mask*) dan menampilkan toast 6 detik dengan **Urungkan**. Request belum dikirim ke server.
  2. Menekan **Urungkan** membatalkan timer sebelum terkirim (0 panggilan server, subkoleksi utuh).
  3. Bila muncul toast aksi baru sebelum 6 detik habis, aksi tertunda sebelumnya langsung dikirim (*flush*) agar tidak batal diam-diam.
- **Bila tab ditutup di tengah jeda 6 detik:** event `visibilitychange` (`hidden`), `pagehide`, dan `signOut` langsung memicu pengiriman segera tanpa menunggu sisa detik. Jika browser mematikan tab sebelum paket jaringan keluar, aksi batal secara aman (*fail-safe*): saat aplikasi dibuka kembali, proyek atau anggota masih utuh sesuai keadaan server tanpa merusak penghitung atau meninggalkan subkoleksi yatim.
- **Bila offline:** jika sejak awal tidak ada koneksi (`!navigator.onLine`), aksi ditolak jujur dengan toast *"Butuh koneksi internet untuk melakukan aksi ini."* tanpa menyembunyikan data secara semu. Jika koneksi terputus di tengah jeda 6 detik, panggilan Function pada detik ke-6 gagal, tampilan optimis dikembalikan utuh seperti semula, dan muncul toast *"Koneksi terputus. Perubahan belum tersimpan, coba lagi saat online."*

---

## Status Persetujuan

Disetujui pemilik pada **26 November 2026**:
1. **Penegakan kuota proyek (Bagian 1):** menggunakan **Opsi (a) Callable Function**.
2. **Bagian 2 sampai 5:** model `personOf`/`isProFor`, pemecahan modul `store`, strategi listener, dan mekanisme tunda 6 detik disetujui untuk dilanjutkan ke Langkah 2B.
