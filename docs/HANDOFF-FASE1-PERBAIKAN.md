# Serah Terima — Perbaikan Hasil Tinjauan Fase 1

Untuk agent pengembang (Gemini atau lainnya). Fase 1 sudah ditinjau; aturan keamanannya baik, tetapi ada tiga temuan yang harus diperbaiki sebelum Fase 2. Dokumen ini adalah **satu-satunya tugas aktif** sampai selesai.

Pagar pengaman, cara kerja, dan format laporan **sama persis** dengan `docs/HANDOFF-FASE1.md` bagian 2, 3, 6, dan 7. Baca bagian itu lagi sebelum mulai. Ringkasnya: tidak ada `firebase deploy`, tidak menyentuh proyek `taskflow-228ee`, tidak mengaktifkan Blaze, tidak memasang dependency baru, tidak menulis rahasia, tidak mengubah rancangan `BACKEND.md` tanpa bertanya, satu langkah satu commit di branch `feat/backend-fase-1`, lalu **berhenti dan tunggu "lanjut"**.

## Yang sudah baik (jangan diubah)
`firestore.rules` dan `tests/rules/` (21 tes hijau, sudah diuji dengan merusak aturan secara sengaja), `functions/index.js` (`onUserCreated`), isolasi Mode Demo, dan idempotensi migrasi. Jangan mengubah aturan keamanan di tugas ini kecuali ada langkah yang menyebutnya, dan bila mengubahnya, tambahkan tes.

## Urutan pengerjaan
Kerjakan **P1 → P2 → P3 → P4**, satu per satu.

---

### P1. Data lokal terhapus saat keluar lalu masuk lagi (PENTING, kehilangan data)

**Lokasi:** `src/store.tsx`, sekitar baris 428–431:
```ts
if (accountRef.current.uid !== fbUser.uid) {
  setLocalData(EMPTY_DATA)
}
```
**Masalah:**
1. `signOut` memanggil `setAccountState(ACCOUNT0)`, yang mengosongkan `uid`. Saat masuk lagi sebagai akun yang sama, kondisi di atas benar, sehingga **seluruh `localData` dihapus**. Di Fase 1 proyek, tugas proyek, dan riwayat aktivitas hanya ada di `localData`, jadi semuanya hilang.
2. Pengguna lama (area sudah ada di cloud) yang masuk di browser yang menyimpan data lokal non-demo tidak pernah ditawari migrasi, dan data lokalnya ikut terhapus.
3. Niat awal kode ini sah: data lokal akun A tidak boleh bocor ke akun B di perangkat yang sama. Itu harus tetap terjamin, tetapi **tanpa menghapus**.

**Yang harus dicapai:**
- Data lokal yang bukan seed demo **tidak pernah dihapus** oleh proses login atau keluar.
- Data lokal tidak bocor antar akun. Usulan: catat pemilik data lokal (uid) terpisah dari `account` (misalnya field `localOwner` di `localStorage`, atau kunci penyimpanan per uid). Data milik uid lain disimpan terpisah dan tidak ditampilkan, bukan dihapus.
- Seed demo (`seededRef`) tetap dibersihkan saat login ke akun sungguhan, seperti sekarang.
- Pengguna lama yang punya area atau tugas lepas lokal non-demo juga mendapat tawaran migrasi (dialog yang sama), bukan hanya pengguna baru.
- **Sebelum menulis kode, tulis rancangan singkat (satu halaman) dan tunggu persetujuan.** Ini menyentuh `load()`, `extractMigration()`, listener auth, `completeSetup`, dan `signOut`.

**Selesai bila** keempat skenario ini lolos di emulator dan Anda melaporkan hasilnya satu per satu:
1. Masuk, buat proyek lokal "P", keluar, masuk lagi dengan akun yang sama → "P" masih ada.
2. Dua akun Google berbeda di browser yang sama: akun B tidak melihat proyek akun A, dan akun A masih memilikinya setelah masuk lagi.
3. Browser dengan area/tugas lepas lokal non-demo lalu masuk sebagai **pengguna lama** → dialog migrasi muncul.
4. Seed demo tidak pernah muncul di akun sungguhan.
Tambahkan juga ke `PROGRESS.md` bagian "Keterbatasan yang diketahui" bahwa proyek lokal terikat ke satu perangkat sampai Fase 2.

---

### P2. Satu tulisan Firestore per ketikan (PENTING, biaya dan batas laju)

**Lokasi:** `onChange` yang memanggil `d.upd(...)` untuk judul dan catatan di `src/components/TaskDetail.tsx` (baris sekitar 271, 276, 343, 347), dan `s.updateArea(a.id, { name })` di `src/components/Manage.tsx` (baris sekitar 137). Setiap karakter menjadi satu `updateDoc` di `store.tsx` (`updateTask`, `updateArea`).

**Masalah:** mengetik catatan 200 karakter = 200 tulisan Firestore. Biaya dihitung per tulisan, kuota gratis harian terbatas, dan Firestore menyarankan paling banyak sekitar satu tulisan per detik per dokumen.

**Yang harus dicapai:**
- Input tetap responsif: teks yang diketik langsung terlihat (state lokal sementara).
- Penulisan ke Firestore ditunda sekitar 600 ms setelah ketikan terakhir, **dan** langsung dikirim (flush) saat: input kehilangan fokus, panel/sheet detail ditutup, pengguna pindah tugas, keluar akun, atau halaman disembunyikan (`visibilitychange`).
- Perubahan terakhir **tidak boleh hilang** bila pengguna menutup detail segera setelah mengetik.
- Perubahan lain (prioritas, tanggal, status, dan seterusnya) tetap langsung ditulis, tidak ditunda.
- Urungkan dan Mode Demo tidak berubah.
- Perubahan sebaiknya terpusat di `store.tsx` (misalnya antrean tulis per dokumen dan field) agar komponen tetap hanya memakai `useStore()`.

**Selesai bila:**
1. Mengetik 50 karakter berurutan di judul menghasilkan **paling banyak 2 tulisan** (buktikan dari log Firestore Emulator atau UI emulator).
2. Mengetik lalu langsung menutup panel detail: teks tersimpan (muat ulang halaman untuk memastikan).
3. Mengetik saat jaringan mati (DevTools Offline), lalu menyalakannya: perubahan terkirim dan tidak ganda.
4. Mode Demo tetap bekerja seperti sebelumnya.

---

### P3. Ukuran aplikasi naik 3,5 kali (SEDANG)

**Fakta:** hasil `npm run build` sebelum Firebase sekitar 327 kB (95 kB gzip); sekarang **1.157 kB (308 kB gzip)** dalam satu berkas, dengan peringatan ukuran chunk dari Vite. Firebase dimuat untuk semua pengunjung, termasuk yang hanya mencoba Mode Demo. Berkas ini juga masuk daftar simpan service worker (`public/sw.js`).

**Yang harus dicapai:**
- Firebase (`firebase/app`, `auth`, `firestore`) dimuat lewat `import()` sebagai chunk terpisah, **hanya** bila dibutuhkan: saat pengguna menekan "Lanjutkan dengan Google" atau saat ada sesi Firebase tersimpan (petunjuk: `account.uid` di penyimpanan lokal). Mode Demo dan layar Masuk pertama kali **tidak** memuat chunk itu.
- Chunk utama kembali di bawah sekitar 450 kB (tidak ada angka yang dipaksakan bila bentuk kode tidak memungkinkan; laporkan angka sebenarnya).
- `npm run build` tidak lagi memunculkan peringatan chunk besar untuk chunk utama.
- Perilaku offline, login, dan sinkronisasi tidak berubah.
- Ini perubahan arsitektur kecil pada `src/lib/firebase.ts` dan `store.tsx`. **Tulis rancangan singkat dan tunggu persetujuan** sebelum menulis kode.

**Selesai bila:** laporan menyertakan ukuran sebelum dan sesudah dari keluaran `npm run build`, tab Network menunjukkan tidak ada permintaan chunk Firebase saat membuka Mode Demo, dan alur login emulator tetap berjalan.

---

### P4. Perbaikan kecil (kerjakan setelah P1–P3, boleh dalam satu commit)
1. **Region Cloud Function.** Firestore berada di `asia-southeast2` (Jakarta), tetapi `onUserCreated` berjalan di `us-central1`. Atur region ke `asia-southeast2` (untuk trigger Auth v1 gunakan `region('asia-southeast2')` dari `firebase-functions/v1`). Pastikan emulator Functions tetap memicunya. **Jangan men-deploy.** Catat di `docs/BACKEND.md` §5 bahwa dukungan runtime Node 24 di Cloud Functions harus diperiksa sebelum deploy pertama (belum diverifikasi).
2. **Gaya kode.** `src/lib/firebase.ts` memakai titik koma, sedangkan kode proyek lain tidak. Samakan dengan gaya `store.tsx`.
3. **Catatan emulator.** Tambahkan satu kalimat di `docs/HANDOFF-FASE1.md` bagian 5: `.env.local` berisi `VITE_USE_EMULATORS=true`, jadi **sebelum build untuk deploy ubah menjadi `false`** (bagian dari Fase 3). Jangan mengubah perilaku kode untuk ini.
4. **Perbarui `docs/PROGRESS.md`** untuk P1–P3 dan hapus klaim "teruji" pada baris Fase 1D bila belum ada buktinya.

## Tidak dikerjakan sekarang (jangan disentuh)
- Batas jumlah dokumen per pengguna dan validasi format `due`/`time` di aturan (kelemahan kecil; ditangani bersama App Check nanti).
- Login pertama saat offline yang menggantung di "Menyiapkan akun…".
- Mengembalikan `createdAt` asli saat Urungkan hapus tugas (kosmetik).
- Apa pun di Fase 2: proyek, undangan, riwayat aktivitas.

## Setelah semua selesai
Laporkan sesuai format `HANDOFF-FASE1.md` bagian 7, lalu pemilik menyerahkan hasilnya untuk **tinjauan ulang** sebelum Fase 2 dimulai.

## Prompt pembuka (untuk ditempel ke agent)
```
Kamu agent pengembang proyek TaskFlow. Baca berurutan: GEMINI.md, AGENTS.md,
docs/HANDOFF-FASE1.md (terutama bagian 2, 3, 6, 7), lalu
docs/HANDOFF-FASE1-PERBAIKAN.md. Kerjakan P1, P2, P3, P4 satu per satu.
Patuhi pagar pengaman tanpa kecuali: jangan firebase deploy, jangan menyentuh
proyek sungguhan, jangan memasang dependency baru, jangan menulis rahasia.
P1 dan P3 butuh rancangan satu halaman dan persetujuan saya sebelum kode.
Setelah tiap langkah: npm run build, npm run test:rules, commit, laporkan
sesuai format, lalu berhenti menunggu "lanjut". Mulai dengan membaca
dokumen-dokumen itu dan ringkas rancanganmu untuk P1 dalam beberapa kalimat.
Jangan menulis kode sebelum saya menjawab "setuju".
```
