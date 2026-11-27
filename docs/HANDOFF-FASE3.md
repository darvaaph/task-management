# Serah Terima — Fase 3: Rilis Beta Web

Untuk agent pengembang (Gemini atau lainnya) **dan pemilik**. Fase 2 sudah final (tinjauan keamanan lolos, uji manual lolos, `test:rules` dan `test:functions` hijau). Fase 3 adalah fase pertama yang menyentuh proyek sungguhan **`taskflow-228ee`**, jadi pekerjaannya dibagi dua dengan tegas:

- **Agent** hanya menyiapkan kode, konfigurasi, dan dokumen, lalu mengujinya di emulator.
- **Pemilik** sendiri yang mengaktifkan Blaze, mengatur penagihan, dan menjalankan setiap perintah deploy.

Satu langkah, lapor, berhenti, tunggu "lanjut".

## 1. Tujuan
TaskFlow bisa dipakai sekelompok kecil penguji (sekitar 10–30 orang) di `https://taskflow-228ee.web.app`, dengan akun Google sungguhan, data di Firestore produksi, dan kolaborasi proyek yang berfungsi. Ada halaman kebijakan privasi, anggaran biaya terpasang, dan tersedia cara memberi Pro gratis kepada penguji tanpa pembayaran.

**Bukan bagian Fase 3:** pembayaran Xendit (Fase 4), Capacitor/Android (Fase 5), domain sendiri, Google Calendar, dan rilis publik (Fase 6).

## 2. Pagar pengaman
Semua pagar di `HANDOFF-FASE1.md` §2 dan `HANDOFF-FASE2.md` §2 tetap berlaku, dengan perubahan berikut:

1. **Agent tidak pernah menjalankan** `firebase deploy`, `firebase use`, `firebase projects:*`, `firebase functions:*`, atau perintah apa pun dengan `--project prod` / `taskflow-228ee`. Agent **menuliskan** perintahnya untuk pemilik; pemilik yang menjalankannya dan menempelkan hasilnya.
2. **`.firebaserc` tidak diubah.** `default` tetap `demo-taskflow`, sehingga deploy tanpa `--project prod` gagal dengan sendirinya.
3. **Agent tidak menyentuh penagihan**, kuota, IAM, atau setelan Google Cloud. Langkah di konsol ditulis sebagai panduan untuk pemilik.
4. **Rahasia tetap di luar repo.** Nilai konfigurasi web Firebase (`VITE_FIREBASE_*`) bukan rahasia dan boleh berada di `.env.production.local` milik pemilik, tetapi **tidak di-commit**. JSON service account, token CLI, dan data pribadi pemilik (email, nomor HP) tidak pernah masuk kode, commit, atau chat.
5. **Branch:** `feat/rilis-beta`, dibuat dari `feat/backend-fase-2` setelah semua perubahannya di-commit. Satu langkah = satu commit.
6. **Dependency baru: tidak ada.**
7. **Jangan melemahkan aturan atau tes.** Semua tes yang ada tetap hijau tanpa diubah.
8. **Mode Demo tetap lokal**, juga di produksi.

## 3. Keputusan pemilik (disetujui 27 Nov 2026)
Semua usulan di bawah **disetujui pemilik** dan berlaku sebagai keputusan.

| No | Pertanyaan | Keputusan |
|---|---|---|
| K1 | Apakah ada **Hapus akun** di beta? | **Ya.** Fitur ini diminta UU PDP dan nanti wajib di Google Play. Bentuknya: tombol di Profil, konfirmasi, lalu callable `deleteAccount` menghapus data pengguna dan proyek miliknya, mengeluarkannya dari proyek orang lain, lalu menghapus akun Auth. |
| K2 | **Batas anggaran** bulanan untuk peringatan | Rp 50.000 dengan peringatan di 50%, 90%, dan 100%. Catatan: peringatan anggaran hanya memberi tahu, **tidak menghentikan** tagihan. |
| K3 | **Kontak** di kebijakan privasi | Email khusus TaskFlow milik pemilik, ditulis oleh pemilik sendiri ke halaman itu, bukan oleh agent. |
| K4 | Cara **memberi Pro ke penguji** | Pemilik mengubah `users/{uid}` lewat konsol Firestore: `plan: "pro"`, `proSource: "manual"`. `onPlanChanged` menyesuaikan proyeknya. Tidak perlu kode baru. |
| K5 | **Penggabungan ke `main`** | Setelah beta stabil seminggu, `feat/rilis-beta` digabung ke `main` lewat PR. |

## 4. Langkah-langkah

### 3A. Pemeriksaan siap rilis (tanpa kode, tanpa deploy)
Tulis `docs/FASE3-PERIKSA.md` (maksimal satu halaman) yang menjawab:
1. Apakah runtime **Node 24** untuk Cloud Functions (`functions/package.json`, `engines`) sudah didukung? Kalau belum, apakah aman turun ke versi terbaru yang didukung? (BACKEND §5)
2. Apakah `onUserCreated` (Functions v1, auth trigger) masih bisa di-deploy berdampingan dengan Functions v2?
3. Daftar semua Function yang akan di-deploy, regionnya, dan apakah ada yang terpanggil tanpa login.
4. Apa saja yang dibaca dari `import.meta.env` di build produksi, dan apa yang terjadi bila salah satunya kosong.
5. Apakah ada sisa kode khusus emulator atau Mode Demo yang bisa aktif di produksi (misalnya `simulateJoin`, `buyPro`, label "Running in emulator mode").

Lalu **berhenti dan tunggu persetujuan**.

### 3B. Kode untuk produksi (diuji di emulator)
1. **`firebase.json` → `hosting`:** `public: dist`, rewrite semua jalur ke `/index.html` (untuk `/invite/{token}` dan `/demo`), header `Cache-Control: no-cache` untuk `/index.html`, `/sw.js`, dan `/manifest.webmanifest`, serta cache panjang untuk `/assets/**`. Tambahkan header keamanan dasar (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`). CSP penuh **tidak** dikerjakan sekarang; catat sebagai sisa.
2. **`reconcileCounters`** (terjadwal harian, `asia-southeast2`, BACKEND §5): menghitung ulang `activeOwned` dan `memberCount`, hanya menulis bila berbeda, dibatasi per batch, dan aman bila berjalan dua kali. Sertakan tes di `tests/functions/`.
3. **`deleteAccount`** (bila K1 = ya): callable, wajib login, idempoten. Menghapus `users/{uid}` beserta subkoleksinya, proyek milik sendiri (lewat jalur yang sama dengan `deleteProject`, termasuk nisan), keanggotaan di proyek orang lain (seperti `removeMember`), lalu akun Auth. Tes serangan: orang lain tidak bisa menghapus akun ini, dan data proyek orang lain tetap utuh. UI: baris "Hapus akun" di Profil (warna `high`), konfirmasi dengan nama akun, lalu kembali ke layar Masuk. Ini aksi besar, jadi **tidak** memakai Urungkan. Teks dicatat di `DESIGN.md`.
4. **Halaman `/privasi`** (statis, dibaca lewat `location.pathname` seperti `/invite`), dalam bahasa Indonesia dan memakai sapaan "kamu". Isinya: data apa yang disimpan (nama dan email Google, area, tugas, proyek), di mana disimpan (Firebase, Jakarta), siapa yang melihatnya (anggota proyek bersama), cara menghapusnya, dan kontak. Kontak dibiarkan sebagai `[KONTAK — diisi pemilik]`. Tautan "Kebijakan privasi" ditaruh di layar Masuk dan Profil.
5. **Indeks:** pastikan `firestore.indexes.json` memuat semua kueri yang dipakai (produksi menolak kueri tanpa indeks, sedangkan emulator tidak).
6. **Contoh lingkungan:** tambahkan `.env.production.example` (nilai kosong, `VITE_USE_EMULATORS=false`) beserta penjelasan cara mengisinya. `.gitignore` sudah menolak `.env.*` selain contoh.

**Selesai bila:** build dan semua tes hijau; `npm run build` dengan `VITE_USE_EMULATORS=false` dan nilai palsu tidak membuka koneksi ke emulator; `firebase emulators:start` dengan hosting menyajikan `/invite/x`, `/demo`, dan `/privasi` dengan benar; dan Hapus akun lolos alur dua akun di emulator (1280px terang, 375px gelap).

Setelah 3B, pemilik menyerahkan hasilnya untuk **tinjauan** sebelum 3C.

### 3C. Persiapan proyek sungguhan (dikerjakan pemilik, dipandu)
Agent menulis panduan langkah demi langkah di `docs/RILIS-BETA.md`. Pemilik mengerjakannya sendiri dan mencentang tiap langkahnya:
1. Aktifkan **Blaze** untuk `taskflow-228ee`.
2. Pasang **peringatan anggaran** (K2) di Google Cloud Billing.
3. Pastikan **Firestore** sudah dibuat di `asia-southeast2` (mode produksi). Region tidak bisa diubah setelah dibuat.
4. Pastikan login Google aktif dan **domain yang diizinkan** di Authentication memuat `taskflow-228ee.web.app` dan `taskflow-228ee.firebaseapp.com`.
5. Isi `.env.production.local` dari konsol (Project settings → Your apps → Web).
6. Atur **kebijakan pembersihan image** Functions saat CLI menanyakannya (simpan 1 hari), supaya penyimpanan tidak menumpuk biaya.

### 3D. Deploy bertahap (perintah dijalankan pemilik)
Urutannya menurunkan risiko: aturan dulu, lalu Functions, lalu aplikasi. Setelah tiap perintah, pemilik menempelkan hasilnya dan agent memeriksanya sebelum lanjut.
1. `firebase deploy --project prod --only firestore:rules,firestore:indexes`
2. `firebase deploy --project prod --only functions`
3. `npm run build` (dengan `.env.production.local`), lalu `firebase deploy --project prod --only hosting`

Kalau ada yang salah: hosting bisa dikembalikan dari konsol (Hosting → riwayat rilis), dan aturan bisa dikembalikan dengan men-deploy commit sebelumnya.

### 3E. Uji asap di produksi lalu undang penguji
Pemilik menguji dengan **dua akun Google sungguhan**, memakai panduan yang ditulis agent mengikuti format bagian **Pengujian** di `AGENTS.md`: login, area awal, tugas lepas, proyek, undangan dan bergabung, keluarkan anggota, offline lalu online, Pro manual (K4), Hapus akun, `/privasi`, dan `/demo`. Penguji baru diundang setelah semua langkahnya lolos. Pantau pemakaian di konsol selama minggu pertama.

## 5. Setelah tiap langkah
`npm run build`, `npm run test:rules`, `npm run test:functions`, satu commit, perbarui `PROGRESS.md`, laporkan dengan format `HANDOFF-FASE1.md` §7 (termasuk **apa yang belum teruji**), lalu berhenti.

## 6. Berhenti dan tanya bila
- Sebuah langkah butuh deploy, perintah ke proyek sungguhan, atau perubahan penagihan.
- Runtime, region, atau jenis Function yang direncanakan ternyata tidak didukung.
- Butuh dependency baru, teks atau fitur di luar yang disebut di sini, atau menyentuh pembayaran.
- Tes gagal dan penyebabnya belum jelas setelah dua kali mencoba.

## 7. Prompt pembuka (untuk ditempel ke agent)
```
Kamu agent pengembang proyek TaskFlow. Baca berurutan: GEMINI.md, AGENTS.md,
docs/HANDOFF-FASE3.md, docs/BACKEND.md, docs/HANDOFF-FASE1.md bagian 2 dan 7,
lalu firebase.json, functions/, dan tests/. Patuhi pagar pengaman tanpa
kecuali: kamu tidak pernah menjalankan firebase deploy atau perintah apa pun
ke proyek taskflow-228ee, tidak menyentuh penagihan, tidak menambah
dependency, tidak menulis rahasia, dan tidak melemahkan aturan atau tes.
Mulai dari langkah 3A saja: tulis docs/FASE3-PERIKSA.md tanpa mengubah kode,
lalu berhenti dan tunggu keputusan saya.
```
