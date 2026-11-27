# Pemeriksaan Siap Rilis — Fase 3A

Diperiksa pada 27 November 2026 di branch `feat/rilis-beta` (tanpa mengubah kode, tanpa deploy). Acuan: `docs/HANDOFF-FASE3.md` §4 (3A), `docs/BACKEND.md`, `firebase.json`, `functions/`, dan `src/`.

---

## 1. Runtime Node 24 untuk Cloud Functions

- **Status dukungan:** `nodejs24` sudah GA pada Cloud Functions **2nd gen** (Cloud Run functions) dan dikenali oleh `firebase-tools` 15.37.0 (dekomisi 31 Okt 2028), **tetapi tidak didukung pada Cloud Functions 1st gen (`gcfv1`)**.
- **Masalah saat ini:** `functions/package.json` menetapkan `"engines": { "node": "24" }`, padahal `onUserCreated` memakai `firebase-functions/v1` (1st gen). Dalam satu codebase, deploy akan gagal pada `onUserCreated` bila tetap memakai Node 24.
- **Usulan (diterapkan di 3B bila disetujui):** turunkan `engines.node` di `functions/package.json` ke **`"22"`** (`nodejs22`, GA di 1st gen dan 2nd gen, dekomisi 31 Okt 2027). Aman untuk seluruh dependency saat ini: `firebase-admin@14.5.1` (`node >=22`) dan `firebase-functions@7.4.0` (`node >=18.0.0`), dan kode `functions/` tidak memakai API khusus Node 24.

## 2. `onUserCreated` (v1) berdampingan dengan Functions v2

- **Bisa di-deploy berdampingan** dalam satu codebase (`functions/index.js`), karena `onUserCreated` sudah diimpor eksplisit dari `firebase-functions/v1` (`region(REGION).auth.user().onCreate(...)`), sedangkan Function lainnya dari `firebase-functions/v2/*`.
- Syaratnya: runtime codebase harus didukung 1st gen (`nodejs22`, lihat poin 1). Alternatif v2 (`beforeUserCreated`) adalah blocking trigger yang mensyaratkan Identity Platform, sehingga tetap memakai v1 `auth.user().onCreate` adalah pilihan paling sederhana untuk beta.

## 3. Daftar Function, Region, dan Akses Tanpa Login

Seluruh Function berjalan di region **`asia-southeast2`** (Jakarta):

| Function | Gen & Jenis | Status | Bisa terpanggil tanpa login? |
|---|---|---|---|
| `onUserCreated` | v1 Auth trigger (`user.onCreate`) | Ada | Tidak — dipicu internal Firebase Auth saat akun baru dibuat |
| `createProject` | v2 Callable (`onCall`) | Ada | Tidak — wajib token Auth (`requireAuth` di baris pertama) |
| `setProjectArchived` | v2 Callable (`onCall`) | Ada | Tidak — wajib login + pemilik proyek |
| `deleteProject` | v2 Callable (`onCall`) | Ada | Tidak — wajib login + pemilik proyek |
| `joinProject` | v2 Callable (`onCall`) | Ada | Tidak — wajib login |
| `removeMember` | v2 Callable (`onCall`) | Ada | Tidak — wajib login + pemilik proyek |
| `onProjectTaskWritten` | v2 Firestore trigger (`projects/{pid}/tasks/{tid}`) | Ada | Tidak — dipicu internal Firestore |
| `onProjectDeleted` | v2 Firestore trigger (`projects/{pid}`) | Ada | Tidak — dipicu internal Firestore |
| `onPlanChanged` | v2 Firestore trigger (`users/{uid}`) | Ada | Tidak — dipicu internal Firestore |
| `reconcileCounters` | v2 Scheduled trigger (harian) | Rencana 3B | Tidak — dipicu internal Cloud Scheduler |
| `deleteAccount` | v2 Callable (`onCall`, K1) | Rencana 3B | Tidak — wajib login (hanya hapus akun sendiri) |

**Kesimpulan:** tidak ada Function yang mengeksekusi logika tanpa autentikasi. (Endpoint HTTP `onCall` memang dapat dijangkau publik oleh SDK klien, namun ditolak `unauthenticated` jika tanpa ID token valid.)

## 4. Pembacaan `import.meta.env` di Build Produksi

- `import.meta.env.PROD` (`src/main.tsx`): bawaan Vite (`true` saat `npm run build`), mengaktifkan pendaftaran Service Worker (`/sw.js`).
- `import.meta.env.VITE_USE_EMULATORS` (`src/lib/firebase.ts`): hanya dianggap aktif bila bernilai persis `'true'`. **Risiko:** Vite tetap memuat `.env.local` saat `npm run build` bila tidak ditimpa `.env.production.local` (`VITE_USE_EMULATORS=false`).
- Enam variabel konfigurasi Firebase di `src/lib/firebase.ts` (belum ada validasi kosong saat startup):
  - `VITE_FIREBASE_API_KEY` kosong → `getAuth(app)` melempar `auth/invalid-api-key` saat Firebase dimuat (login gagal total).
  - `VITE_FIREBASE_AUTH_DOMAIN` kosong → popup/redirect login Google gagal membuka OAuth handler.
  - `VITE_FIREBASE_PROJECT_ID` kosong → koneksi Firestore dan pemanggilan Functions `asia-southeast2` gagal.
  - `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` kosong → tidak langsung mematahkan Auth/Firestore/Functions karena layanan terkait belum dipakai, tetapi tetap wajib diisi lengkap dari konsol Firebase.

## 5. Sisa Kode Emulator & Mode Demo di Produksi

- **Emulator & spanduk `"Running in emulator mode"`:** `connectAuthEmulator` / Firestore / Functions (`src/lib/firebase.ts`) hanya dipanggil jika `VITE_USE_EMULATORS === 'true'`. Di sisi server (`functions/core.js`), mode emulator hanya aktif jika `FIRESTORE_EMULATOR_HOST` atau `FIREBASE_AUTH_EMULATOR_HOST` ada. Aman di produksi selama build memakai `.env.production.local` dengan `VITE_USE_EMULATORS=false` (3B #6).
- **`simulateJoin` (`Share.tsx`):** tombol *"Simulasi: teman membuka tautan"* hanya dirender saat `s.account.demo === true`. Tidak tampil dan tidak aktif untuk akun Google sungguhan.
- **`buyPro` (`Pro.tsx` / `store.tsx`):** untuk akun cloud (`cloudUidRef.current` ada), `buyPro()` tidak mengaktifkan Pro — hanya menutup dialog dan menampilkan toast *"Pembayaran Pro belum aktif di tahap ini."* Aman dari pemalsuan Pro, meski layar Pro masih menampilkan *"Rp99.000 · sekali bayar · harga contoh"* dan tombol *"Beli Pro"* sebelum diklik (wajar untuk beta; pembayaran baru di Fase 4).
- **Mode Demo (`/demo`):** tidak ada tombol di layar Masuk; hanya terbuka lewat URL `/demo`, tetap 100% lokal (`localStorage`) tanpa mengunduh atau menyentuh Firebase.

---

**Keputusan yang ditunggu sebelum 3B:** konfirmasi turun ke `"node": "22"` di `functions/package.json` dan lanjut ke langkah 3B.
