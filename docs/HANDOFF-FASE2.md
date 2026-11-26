# Serah Terima — Backend Fase 2: Proyek dan Kolaborasi

Untuk agent pengembang (Gemini atau lainnya). Fase 1 sudah final. Rancangan umum ada di `docs/BACKEND.md`; **baca §4.1 (celah di draf aturan) sebelum menulis satu baris pun**. Kalau dokumen ini berbeda dengan BACKEND.md, dokumen ini yang berlaku untuk Fase 2; bila ragu, tanya pemilik. Pemilik proyek masih pemula: **satu langkah, lapor, berhenti, tunggu "lanjut".**

## 1. Tujuan
Proyek, bagian, dan tugas proyek tersimpan di Firestore dan dipakai bersama: undang lewat tautan, gabung, keluarkan anggota, riwayat aktivitas. Kuota Gratis/Pro ditegakkan di server. Semuanya dibangun dan diuji di **emulator**. Tidak ada yang di-deploy. Pembayaran (Xendit), Capacitor, dan Google Calendar **bukan** bagian Fase 2.

## 2. Pagar pengaman
Semua pagar di `docs/HANDOFF-FASE1.md` bagian 2 tetap berlaku (tidak ada `firebase deploy`, tidak menyentuh `taskflow-228ee`, tidak mengaktifkan Blaze, tidak menulis rahasia, mode demo tetap lokal, `npm audit fix --force` dilarang), dengan perubahan:
- **Branch:** `feat/backend-fase-2`, dibuat dari `feat/backend-fase-1` setelah semua perubahan di sana di-commit.
- **Dependency baru: tidak ada.** `firebase` (sudah mencakup klien Functions), `firebase-functions`, dan `firebase-admin` sudah cukup. Tes tetap `node --test`.
- **Jangan melemahkan aturan atau tes Fase 1.** 21 tes lama harus tetap hijau tanpa diubah, kecuali sebuah tes menguji perilaku yang memang diubah Fase 2; kalau begitu, tanya dulu.
- Firebase tetap dimuat lewat `import()` (chunk terpisah). Bundel utama tidak boleh kembali membengkak.
- Pakai komponen yang ada (`TaskRow`, `Sheet`, `Modal`, `Chip`, ...). Semua data lewat `useStore()`.

## 3. Aturan bisnis yang tidak boleh meleset (PRD §5.4)
- Gratis: maksimal **5 proyek aktif milik sendiri**. Proyek arsip dan proyek milik orang lain tidak dihitung.
- Anggota per proyek: **3** (pemilik Gratis) atau **20** (pemilik Pro), termasuk pemilik.
- Fitur Pro **di dalam tugas proyek** (durasi, ulangi Hari kerja/Bulanan, pengingat ganda), Timeline proyek, dan riwayat aktivitas mengikuti paket **pemilik proyek**, bukan paket pengguna yang sedang membuka. Di UI, `s.isPro` tidak cukup untuk hal-hal ini; perlu pengecekan per proyek di satu tempat (misalnya `isProFor(project)` di store atau `lib/logic.ts`).
- Area bersifat pribadi: tiap anggota memilih areanya sendiri (`members/{uid}.area`). Tidak ada area yang dibuat otomatis, dan area pemilik tidak pernah tampil di akun anggota atau halaman undangan.
- Batas ditegakkan di **Security Rules atau Cloud Functions**. UI boleh mengunci lebih dulu, tapi bukan satu-satunya penjaga.

## 4. Langkah-langkah

### 2A. Rancangan (tanpa kode)
Tulis `docs/FASE2-RANCANGAN.md` (maksimal dua halaman, bahasa Indonesia), lalu **berhenti dan tunggu persetujuan**. Wajib menjawab:
1. **Penegakan kuota proyek** (buat, arsipkan, pulihkan, hapus). Bandingkan:
   - **(a) Lewat callable Function** *(disarankan)*: klien tidak pernah menulis `activeOwned` atau membuat/mengarsipkan/menghapus proyek secara langsung; Function memeriksa kuota dalam satu transaksi. Sederhana dan sulit diakali. Kekurangan: empat aksi itu butuh internet.
   - **(b) Batch dari klien** (rancangan awal BACKEND §3.3): tetap bisa offline, tetapi aturan harus mengikat perubahan hitungan pada proyek tertentu **dari dua arah** dengan `getAfter`/`existsAfter`. Rumit dan rawan celah. Bila memilih ini, jelaskan aturannya lengkap.
   Jangan memilih sendiri. Pemilik yang memutuskan.
2. **Model "orang".** Kode memakai daftar tetap `PEOPLE` (`me`, `budi`, `siti`, ...) di `Composer`, `TaskDetail`, `TaskRow`, `ProjectView`, `ProjectsView`, `Share`, dan `store.tsx`. Di akun nyata, anggota adalah uid dengan nama dari `members/{uid}`. Rancang satu sumber untuk nama, inisial, dan warna avatar yang melayani akun nyata **dan** Mode Demo. Warna avatar hanya boleh diambil dari warna yang sudah ada di `PEOPLE` (dipilih tetap berdasarkan uid); jangan menambah warna.
3. **Susunan kode.** `src/store.tsx` sudah sekitar 1.500 baris. Usulkan pemecahan ke modul pembantu (misalnya sinkronisasi cloud, antrean tulis, penyimpanan lokal) dengan tetap **satu** `useStore()`. Pemecahan dikerjakan sebagai langkah terpisah **tanpa mengubah perilaku**, dengan commit sendiri.
4. **Listener dan biaya:** apa saja yang didengarkan, kapan, dan perkiraan jumlah pembacaan (BACKEND §3.2). Arsip dan riwayat dimuat saat dibuka.
5. **Urungkan untuk aksi server.** UI sekarang memberi Urungkan 6 detik untuk hapus bagian, arsipkan, hapus proyek, dan keluarkan anggota. Untuk aksi yang lewat Function, usulan: **tunda pengiriman 6 detik**; Urungkan membatalkan sebelum terkirim. Jelaskan apa yang terjadi bila tab ditutup atau offline di tengah jeda.

### 2B. Security Rules dan tesnya
Tambah aturan untuk `projects`, `members`, `tasks` proyek, `activity`, `invites`, dan `reminders` (dengan `projectId`) sesuai keputusan 2A dan **§4.1 BACKEND.md**. Tes serangan **wajib** (masing-masing "ditolak", dan jalur sah "diizinkan"):
1. Membuat proyek dengan `ownerPlan: 'pro'` oleh akun Gratis.
2. Mengubah `ownerId`, `memberIds`, `memberCount`, `ownerPlan` oleh pemilik maupun anggota.
3. Akun Gratis membuat proyek aktif ke-6, termasuk lewat: menurunkan `activeOwned` sendiri, memulihkan arsip, dan menulis langsung tanpa Function.
4. Bukan anggota membaca atau menulis proyek, tugas, anggota, atau aktivitas.
5. Anggota yang sudah dikeluarkan masih membaca atau menulis.
6. Anggota (bukan pemilik) mengubah proyek, mengeluarkan orang, atau membuat/mereset undangan.
7. Mendaftar (`list`) semua undangan; membuat atau menimpa undangan untuk proyek orang lain.
8. Menambahkan diri sendiri ke `members` atau `memberIds` tanpa `joinProject`.
9. Anggota mengubah `area` atau data milik anggota lain.
10. `updatedBy` palsu; `assignee` yang bukan anggota.
11. Durasi, `weekdays`/`monthly`, dan pengingat ganda: ditolak di proyek pemilik Gratis **walaupun penulisnya Pro**; diizinkan di proyek pemilik Pro **walaupun penulisnya Gratis**.
12. Membaca aktivitas di proyek pemilik Gratis.
13. Menulis aktivitas dari klien.

**Selesai bila:** semua tes (lama dan baru) hijau, dan untuk tiga aturan terpenting (kuota, `ownerPlan`, undangan) Anda merusak aturannya sengaja, menunjukkan tesnya gagal, lalu memulihkannya.

### 2C. Cloud Functions
Di `asia-southeast2`: `joinProject`, `removeMember`, `onProjectTaskWritten` (aktivitas), `onProjectDeleted`, `onPlanChanged`, ditambah Function kuota bila 2A memilih opsi (a). `reconcileCounters` (terjadwal) **ditunda ke Fase 3**.
- Setiap callable: wajib login, validasi tipe semua argumen, jalan dalam transaksi bila menghitung kuota, pesan error berbahasa Indonesia yang tidak membocorkan data proyek.
- `joinProject` memeriksa: token ada dan aktif, cocok dengan `projects/{pid}.inviteToken` dan pemiliknya, proyek tidak diarsipkan, belum menjadi anggota (idempoten), kapasitas berdasarkan **`users/{ownerId}.plan` saat itu**.
- `removeMember`: hanya pemilik; pemilik tidak bisa dikeluarkan; tugas yang PIC-nya orang itu kembali ke pemilik (lebih dari 500 tugas dibagi per batch).
- Aktivitas: tambah tugas, ganti status, selesai, anggota bergabung/dikeluarkan; simpan paling banyak 200 terakhir; trigger harus aman bila terpanggil dua kali.
- Tes di `tests/functions/*.test.mjs` memakai emulator Auth + Firestore + Functions, tambahkan skrip `test:functions`.
- **Selesai bila:** dua orang bergabung bersamaan ke slot terakhir hanya satu yang berhasil (tes paralel), dan semua tes hijau.

### 2D. Proyek di store dan UI
- Proyek, bagian, dan tugas proyek pindah ke Firestore dengan listener sesuai 2A. Mode Demo tetap lokal dan tidak berubah.
- Ganti nama bagian tetap disimpan saat `blur`; judul dan catatan tugas proyek memakai antrean tulis tertunda yang sama dengan tugas lepas.
- Fitur Pro di dalam proyek memakai paket pemilik (bagian 3).
- **Selesai bila:** dengan **dua akun** di emulator (dua profil browser atau jendela samaran), perubahan satu akun muncul di akun lain tanpa muat ulang; offline lalu online tidak menghilangkan atau menggandakan perubahan; Board, Timeline proyek, Jadwal, Hari Ini, dan pencarian menampilkan tugas proyek dengan benar.

### 2E. Undangan, bergabung, keluarkan anggota
- Token acak minimal 20 karakter (`crypto.getRandomValues`). Ganti pembuatan token lama di `Share.tsx` dan `resetInviteToken` di store. **Reset tautan** menonaktifkan token lama.
- Tautan memakai alamat aplikasi saat ini: `` `${location.origin}/invite/${token}` `` (domain `taskflow.id` belum ada). Perbarui `DESIGN.md` §6.25.
- Halaman `/invite/{token}`: aplikasi tidak punya router, jadi cukup baca `location.pathname` (jangan menambah dependency). Isi sesuai DESIGN §6.25, tanpa area pemilik. Belum login: simpan token di `sessionStorage`, lanjutkan setelah login. Keadaan wajib: tautan tidak berlaku, proyek penuh, sudah anggota (langsung buka proyek), offline ("Butuh koneksi internet untuk bergabung.").
- Setelah bergabung: "Masukkan ke area mana?" (chip area sendiri + "Nanti saja"). Anggota bisa menggantinya dari Kelola proyek. Anggota **tidak** melihat aksi khusus pemilik.
- Dikeluarkan saat sedang membuka proyek: kembali ke daftar Proyek dengan toast yang jelas, tanpa error di konsol.
- Hapus tombol "Simulasi" dan kalimat "setelah sinkronisasi cloud aktif" untuk akun nyata; Mode Demo tetap punya simulasinya.
- Teks baru dicatat di `DESIGN.md`.
- **Selesai bila:** alur penuh dengan dua akun berjalan di emulator pada **1280px dan 375px, terang dan gelap**, termasuk keempat keadaan di atas.

### 2F. Pindahkan proyek lokal dan lengkapi riwayat
- Akun yang punya proyek lokal (`byUid`) ditawari memindahkannya ke akun. Patuhi kuota (yang tidak muat tetap lokal dan diberi tahu). PIC `me` menjadi uid pengguna; PIC orang simulasi dikosongkan. Idempoten dan tahan klik ganda. Salinan lokal **tidak dihapus** sebelum penulisan dikonfirmasi server.
- Riwayat aktivitas dan Timeline proyek terbuka untuk semua anggota bila pemiliknya Pro (uji dengan mengubah `plan` lewat UI emulator).
- **Selesai bila:** tidak ada proyek yang hilang atau ganda pada skenario: pindah, batalkan di tengah, ulangi; dan 6 proyek lokal pada akun Gratis.

## 5. Setelah tiap langkah
`npm run build`, `npm run test:rules` (dan `test:functions` sejak 2C), satu commit, perbarui `PROGRESS.md`, laporkan sesuai format `HANDOFF-FASE1.md` bagian 7 (termasuk **apa yang belum teruji**), lalu berhenti.

Catatan lingkungan: alur login di emulator memuat skrip dari `apis.google.com`, jadi browser penguji tetap butuh internet.

## 6. Berhenti dan tanya bila
- Rancangan di BACKEND.md atau dokumen ini tidak bisa diwujudkan dengan aman.
- Sebuah aturan hanya bisa lolos dengan melonggarkan keamanan.
- Butuh dependency baru, mengubah tampilan di luar yang disebut, atau menyentuh pembayaran.
- Tes gagal dan penyebabnya tidak jelas setelah dua kali mencoba.

## 7. Setelah Fase 2
Pemilik menyerahkan hasilnya untuk **tinjauan keamanan** oleh agent lain (aturan, Functions, tes, alur dua akun) sebelum Fase 3 (rilis beta, Blaze, deploy).

## 8. Prompt pembuka (untuk ditempel ke agent)
```
Kamu agent pengembang proyek TaskFlow. Baca berurutan: GEMINI.md, AGENTS.md,
docs/HANDOFF-FASE2.md, docs/BACKEND.md (terutama bagian 4.1),
docs/HANDOFF-FASE1.md bagian 2 dan 7, lalu firestore.rules dan tests/ yang
sudah ada. Patuhi pagar pengaman tanpa kecuali: jangan firebase deploy,
jangan menyentuh proyek sungguhan, jangan menambah dependency, jangan menulis
rahasia, jangan melemahkan aturan atau tes yang ada.
Mulai dari langkah 2A saja: tulis docs/FASE2-RANCANGAN.md, jangan menulis
kode apa pun, lalu berhenti dan tunggu keputusan saya.
```
