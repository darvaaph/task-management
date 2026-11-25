# Serah Terima — Backend Fase 1

Untuk agent pengembang (Gemini atau lainnya) yang mengerjakan Fase 1 backend TaskFlow. Pemilik proyek masih pemula, jadi **kerjakan satu langkah, lapor, lalu berhenti menunggu "lanjut"**. Jangan mengerjakan beberapa langkah sekaligus.

Rancangan data, rules, dan Functions ada di `docs/BACKEND.md`. Dokumen ini hanya membatasi **apa yang dikerjakan di Fase 1**, **apa yang dilarang**, dan **kapan sebuah langkah dianggap selesai**. Kalau keduanya berbeda, tanya pemilik proyek; jangan memutuskan sendiri.

## 1. Tujuan Fase 1
Akun nyata dengan login Google, plus area dan tugas lepas yang tersimpan di Firestore dan tetap bisa dipakai offline. Semuanya dibangun dan diuji di **Firebase Emulator**. Tidak ada yang di-deploy.

## 2. Pagar pengaman (wajib)
1. **Jangan menjalankan `firebase deploy`**, `firebase use`, `firebase projects:*`, atau perintah apa pun yang menyentuh proyek sungguhan `taskflow-228ee`. Semua kerja memakai emulator dengan Project ID **`demo-taskflow`**.
2. **`.firebaserc`** harus berisi `default: demo-taskflow` dan alias `prod: taskflow-228ee`. Dengan begitu `firebase deploy` tanpa `--project` gagal dengan sendirinya.
3. **Jangan mengaktifkan Blaze** atau mengubah apa pun di akun penagihan. Jangan menyuruh pemilik "upgrade" demi menyelesaikan Fase 1.
4. **Jangan menaruh rahasia** (kunci Xendit, JSON service account, client secret) di kode, commit, atau chat. `.env.local` tidak boleh ikut commit.
5. **Dependency:** hanya `@firebase/rules-unit-testing` (dev, di proyek ini) serta `firebase-functions` dan `firebase-admin` (di `functions/`). `firebase` dan `firebase-tools` sudah terpasang. Pasang apa pun selain itu hanya setelah pemilik setuju. **Dilarang `npm audit fix --force`** (menurunkan Firebase ke versi lama).
6. **Tidak ada test runner baru.** Tes aturan memakai `node --test` bawaan Node, berkas `.mjs`, dijalankan lewat `firebase emulators:exec`.
7. **Mode demo tetap lokal** dan tidak boleh menyentuh Firebase.
8. **Jangan mengubah rancangan** di `BACKEND.md` tanpa bertanya. Kalau ada yang tidak praktis, tulis masalah dan usulan, lalu tunggu jawaban.
9. **Teks antarmuka baru** harus bahasa Indonesia dan dicatat di `docs/DESIGN.md` bersamaan dengan kodenya. Teks yang saya tandai "usulan" di bawah boleh dipakai, tapi pemilik berhak mengubahnya.
10. **Satu langkah = satu branch kerja yang sama (`feat/backend-fase-1`) + satu commit.** Commit tidak boleh berisi `.env.local`.
11. Setiap langkah berakhir dengan `npm run build` lolos, tes yang relevan hijau, dan `docs/PROGRESS.md` diperbarui.

## 3. Syarat awal
- Node 24, Java 17 (sudah terpasang), `firebase-tools` 15.x terpasang global.
- **Risiko Java:** versi baru emulator Firestore mungkin menolak Java 17. Kalau emulator gagal start karena versi Java, **berhenti dan minta pemilik memasang JDK 21** (Temurin). Jangan mencoba menyiasatinya.
- `.env.local` sudah ada (lihat bagian 5). `apiKey` di dalamnya disalin dari tangkapan layar; mode emulator tidak memakainya, jadi tidak menghalangi pekerjaan.

## 4. Langkah-langkah

### 1A. Fondasi Firebase dan emulator
Buat: `firebase.json` (emulator Auth 9099, Firestore 8080, Functions 5001, UI 4000), `.firebaserc` (lihat pagar 2), `firestore.rules` (awal), `firestore.indexes.json`, `src/lib/firebase.ts`, `.env.example` (sudah ada, perbarui bila perlu), skrip `emulators` dan `test:rules` di `package.json`.
- `src/lib/firebase.ts`: bila `VITE_USE_EMULATORS === 'true'`, inisialisasi dengan `projectId: 'demo-taskflow'` dan sambungkan Auth + Firestore ke emulator; selain itu pakai konfigurasi `VITE_FIREBASE_*`. Firestore memakai `persistentLocalCache` dengan `persistentMultipleTabManager` (BACKEND.md §1). **Jangan memasang Analytics** (`getAnalytics`).
- **Selesai bila:** `npm run emulators` menyala tanpa error, `npm run build` lolos, dan halaman dev tetap terbuka normal (belum ada perubahan tampilan).

### 1B. Security Rules dan tesnya
Tulis `firestore.rules` untuk `users`, `users/{uid}/areas`, `users/{uid}/tasks`, `users/{uid}/reminders` mengikuti BACKEND.md §4 (bagian proyek menyusul di Fase 2, untuk sementara semua akses ke `projects` dan `invites` ditolak). Tes di `tests/rules/*.test.mjs`.
Kasus yang **wajib** diuji, masing-masing ada tes "ditolak" dan "diizinkan":
- Pengguna hanya membaca dan menulis dokumen dirinya; tanpa login semua ditolak; pengguna lain ditolak.
- Klien tidak boleh mengubah `plan`, `proSource`, `proSince`, `createdAt`, `email`.
- `accent` selain `indigo` ditolak untuk akun Gratis, diizinkan untuk Pro.
- Tugas: judul wajib berupa teks tidak kosong maksimal 300 karakter; `dur` terisi, `rec` berisi `weekdays` atau `monthly`, dan `rems` lebih dari satu **ditolak untuk Gratis, diizinkan untuk Pro**.
- Area dan tugas pribadi tidak bisa dibaca pengguna lain.
- **Selesai bila:** `npm run test:rules` hijau, dan Anda menunjukkan satu tes yang sengaja diubah menjadi salah gagal (membuktikan tesnya benar-benar menguji).

### 1C. Login Google di web, layar Masuk baru
- Login: `signInWithPopup` dengan `GoogleAuthProvider` (jika popup diblokir, cadangan `signInWithRedirect`). Android native menyusul di Fase 5, jangan dikerjakan.
- Cloud Function `onUserCreated` (folder `functions/`) membuat `users/{uid}` dengan `plan: 'free'`, `activeOwned: 0`, `createdAt`, `email`, `name`, `photoURL`. **Kalau trigger Auth ternyata tidak praktis di emulator, berhenti dan ajukan usulan ke pemilik** (pagar 8).
- Layar Masuk (`views/AuthView.tsx`) berubah mengikuti `DESIGN.md` §6.20 (catatan "Akan berubah"): tombol **"Lanjutkan dengan Google"** dan **"Coba Mode Demo"**. Hapus isian email, kata sandi, dan alur Lupa kata sandi. Teks usulan di bawah tombol: *"Gunakan akun Google pribadi. Akun sekolah atau kampus kadang diblokir oleh admin."*
- Setelah login pertama: tampilkan "Pilih area awal" (DESIGN §6.29) dan tulis area pilihan ke `users/{uid}/areas`; tulis `guideTasks()` ke `users/{uid}/tasks`.
- Keluar (`signOut`) berfungsi dan kembali ke layar Masuk.
- Perbarui `DESIGN.md` §6.20 dari "akan berubah" menjadi aturan yang berlaku.
- **Selesai bila:** di emulator, login dengan akun Google palsu membuat `users/{uid}` (cek di UI emulator), area dan tugas panduan muncul, keluar berfungsi, Mode Demo tetap bekerja seperti sebelumnya, dan tampilan benar di **1280px dan 375px, terang dan gelap**.

### 1D. `store.tsx` tersambung ke Firestore (area dan tugas lepas)
- **Yang pindah ke cloud:** area (`users/{uid}/areas`) dan tugas lepas (`users/{uid}/tasks`). `plan` dibaca dari `users/{uid}` (hanya-baca di klien) dan menjadi dasar `s.isPro`.
- **Yang tetap lokal di Fase 1:** proyek dan tugas di dalam proyek, riwayat aktivitas, dan setelan akun (tema, aksen, suara, getaran, pengingat terkirim). Fase 2 memindahkannya. Jangan mengubah perilakunya.
- Semua aksi yang sekarang memanggil `setData` untuk area dan tugas lepas menulis ke Firestore; state diisi dari listener (`onSnapshot`). **Aturan `AGENTS.md` tetap berlaku:** komponen hanya memakai `useStore()`, aksi yang menghapus tetap lewat `undoable(...)` (Urungkan 6 detik, termasuk saat data di cloud), dan tidak ada `localStorage` di luar `store.tsx`.
- **Ini langkah paling rumit karena `tasks` di store sekarang mencampur tugas lepas dan tugas proyek. Sebelum menulis kode, tulis rancangan singkat (satu halaman, bahasa Indonesia) tentang cara memisahkannya dan tunggu persetujuan pemilik.**
- Mode demo dan pengguna tanpa login memakai alur lokal yang sudah ada.
- **Selesai bila:** area dan tugas lepas berubah di UI emulator saat Anda mengubahnya di aplikasi; mematikan jaringan di DevTools lalu mengubah tugas tetap berfungsi, dan perubahannya terkirim setelah jaringan kembali; muat ulang halaman tidak menghilangkan data; Urungkan berfungsi; Mode Demo tidak berubah; `npm run build` dan `npm run test:rules` hijau.

### 1E. Pindahkan data lokal ke akun (opsional, kerjakan hanya bila 1A–1D beres)
Setelah login pertama, bila browser punya data lokal non-demo, tawarkan "Pindahkan data di perangkat ini ke akun Anda?" untuk **area dan tugas lepas saja**. Teks usulan: *"Pindahkan data di perangkat ini ke akun Anda?"* dengan tombol **Pindahkan** dan **Lewati**. Gunakan batch (maksimal 500 tulisan per batch).
- **Selesai bila:** data lokal contoh berpindah satu kali dan tidak terduplikasi bila tombol ditekan dua kali.

## 5. File lingkungan
- `.env.local` (tidak ikut git): `VITE_FIREBASE_*` dari konfigurasi proyek sungguhan dan `VITE_USE_EMULATORS=true`.
- `.env.example` (ikut git): kerangka yang sama tanpa nilai.

## 6. Kapan harus berhenti dan bertanya
- Emulator menolak Java, atau sebuah langkah menuntut dependency di luar daftar.
- Rancangan di `BACKEND.md` tidak praktis, atau bertentangan dengan `AGENTS.md`/`DESIGN.md`.
- Ada keinginan mengubah perilaku di luar lingkup Fase 1 (misalnya proyek, undangan, pembayaran).
- Tes gagal dan penyebabnya tidak jelas setelah dua kali mencoba.

## 7. Format laporan setelah tiap langkah
1. File yang dibuat atau diubah.
2. Hasil `npm run build` dan tes (salin keluarannya yang relevan).
3. Yang sudah dicek di browser (ukuran, tema).
4. Hal yang belum teruji atau meragukan.
5. Berhenti dan tunggu "lanjut".

## 8. Setelah Fase 1
Pemilik menyerahkan `firestore.rules`, folder `functions/`, dan `tests/` untuk **ditinjau ulang oleh agent lain** sebelum Fase 2. Tinjauan itu fokus pada celah keamanan dan kuota. Jangan menganggap Fase 1 final sebelum tinjauan itu.

## 9. Prompt pembuka (untuk ditempel ke agent)
```
Kamu agent pengembang proyek TaskFlow. Baca berurutan: GEMINI.md, AGENTS.md,
docs/HANDOFF-FASE1.md, lalu docs/BACKEND.md. Kerjakan Fase 1 satu langkah
(1A, 1B, ...) dalam satu waktu. Patuhi "Pagar pengaman" di HANDOFF-FASE1.md
tanpa kecuali, terutama: jangan menjalankan firebase deploy, jangan menyentuh
proyek sungguhan, jangan memasang dependency di luar daftar, dan jangan
menulis rahasia ke kode atau chat. Setelah tiap langkah: npm run build, tes,
commit, laporkan sesuai format di bagian 7, lalu berhenti menunggu "lanjut".
Mulai sekarang dengan membaca dokumen-dokumen itu, lalu ringkas rencanamu
untuk langkah 1A dalam beberapa kalimat. Jangan menulis kode sebelum saya
menjawab "setuju".
```
