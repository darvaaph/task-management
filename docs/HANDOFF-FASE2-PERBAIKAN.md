# Serah Terima — Perbaikan Hasil Tinjauan Fase 2

Untuk agent pengembang (Gemini atau lainnya). Fase 2 sudah ditinjau: aturan, Functions, 34 tes aturan, 8 tes fungsi, dan alur undangan dua akun berjalan. Tetapi **dua celah keamanan terbukti di emulator** dan satu masalah pembelian Pro harus beres. Sampai selesai, **ini satu-satunya tugas aktif**. Jangan mulai Fase 3.

Pagar pengaman, cara kerja, dan format laporan **sama persis** dengan `docs/HANDOFF-FASE2.md` §2, §5, §6, dan `HANDOFF-FASE1.md` bagian 7. Ringkasnya: tidak ada `firebase deploy`, tidak menyentuh proyek `taskflow-228ee`, tidak mengaktifkan Blaze, tidak menambah dependency, tidak menulis rahasia, **jangan melemahkan aturan atau tes yang ada**, satu langkah satu commit di branch `feat/backend-fase-2`, lalu **berhenti dan tunggu "lanjut"**.

## Jangan diubah
Kuota di dalam transaksi, `joinProject` (token cocok + paket pemilik saat itu), token acak 24 karakter, `list` undangan yang ditolak, halaman undangan tanpa area pemilik, serta penanganan anggota yang dikeluarkan. Semua sudah benar.

**Aturan kerja untuk P1 dan P2:** tulis dulu **tes yang mereproduksi celah dan GAGAL** pada kode sekarang, tunjukkan kegagalannya, baru perbaiki sampai hijau. Setelah hijau, lepas perbaikannya sebentar, tunjukkan tesnya gagal lagi, lalu pasang kembali.

---

### P1. Mantan anggota bisa mengambil alih ID proyek yang dihapus (PENTING, terbukti)

**Lokasi:** `functions/index.js` `createProject` (menerima `projectId` bebas), `deleteProject`; `src/store.tsx` migrasi lokal (sekitar baris 2373 dan 2406).

**Reproduksi yang terbukti:** pemilik membuat proyek, anggota bergabung lalu dikeluarkan, pemilik menambah 300 tugas, lalu `deleteProject`. Mantan anggota langsung memanggil `createProject` dengan ID yang sama sebelum `onProjectDeleted` selesai. Hasilnya berhasil, dan ia **membaca seluruh 300 tugas** proyek yang dihapus.

**Perbaikan (keduanya wajib):**
1. `createProject` hanya menerima `projectId` bila diawali **`mig_${uid}_`** dengan **uid pemanggil secara penuh**, selain tetap lolos `SAFE_ID_RE`. ID lain ditolak (`invalid-argument`).
2. `deleteProject` menulis nisan `deletedProjects/{projectId}` (misalnya `ownerId`, `deletedAt`) **dalam transaksi yang sama** dengan penghapusan. `createProject` membacanya di dalam transaksinya dan menolak ID yang sudah punya nisan. Klien tidak boleh membaca atau menulis koleksi itu (tambahkan tes aturan eksplisit).

**Sisi klien:** ganti `uidTag` (16 karakter pertama) menjadi uid penuh, dan potong hasil `cloudPid` sampai **100** karakter, bukan 128, karena `SAFE_ID_RE` hanya menerima 100. Migrasi tetap idempoten. Data lama berawalan 16 karakter hanya ada di emulator, jadi tidak perlu kompatibilitas.

**Selesai bila:** tes baru di `tests/functions/` menolak (a) mantan anggota membuat ulang ID yang dihapus, (b) ID bebas, dan (c) ID berawalan `mig_` milik uid lain; tes migrasi lama tetap hijau.

---

### P2. Warna proyek bisa dipakai melacak anggota (SEDANG, terbukti)

**Fakta:** `createProject` dan aturan `update` menerima `color: "url(https://contoh.test/lacak.png)"`. Warna proyek dipakai di `style={{ background }}` di browser **semua anggota**, sehingga browser mereka memuat alamat milik pemilik (IP dan waktu aktif bocor).

**Perbaikan:**
- Daftar warna sah = `AREA_COLORS` (`src/lib/constants.ts`) **ditambah `var(--accent)`**. Yang terakhir wajib ada, karena dipakai untuk proyek tanpa area (`store.tsx`, `createProject`). Jangan sampai proyek "Tanpa area" ditolak.
- Tegakkan di **Function** `createProject` **dan** di **aturan** `validProjectUpdate`. Samakan dua daftar itu, dan beri komentar di kedua tempat bahwa daftar harus diubah bersama.
- Saat dibaca (`src/lib/cloudCodec.ts`), warna di luar daftar diganti `var(--accent)`. Ini pertahanan kedua.
- Migrasi proyek lokal dengan warna di luar daftar dipetakan ke `var(--accent)`, bukan ditolak.
- **Audit:** periksa semua nilai yang dikendalikan pengguna lain (nama proyek, bagian, nama anggota, `ownerName` undangan) yang masuk ke `style`, `src`, atau `href`. Laporkan hasilnya. Saat ditinjau, tidak ada `<img>` atau `photoURL` yang dirender; pastikan tetap begitu.

**Selesai bila:** tes menolak `url(...)` dan warna bebas di Function dan aturan, menerima setiap warna sah termasuk `var(--accent)`, dan proyek tanpa area tetap bisa dibuat dari UI.

---

### P3. Anggota ditawari membeli Pro yang tidak membuka apa pun (SEDANG, wajib sebelum Fase 4)

**Fakta (terbukti untuk pengulangan):** anggota di proyek pemilik Gratis mengetuk "Bulanan", lalu muncul layar **"TaskFlow Pro — Sekali bayar"**. Membeli Pro tidak membuka fitur itu, karena fitur di dalam proyek mengikuti paket **pemilik** (PRD §5.4).

**Tempat yang terdampak:** `TaskDetail.tsx` (durasi, ulangi, dan tautan PRO di teks pengingat) serta `ProjectView.tsx` (Timeline proyek, `ProLocked ctx="tl"`). `Share.tsx` sudah benar (tombol "Lihat Pro" hanya untuk pemilik); jangan diubah.

**Perbaikan:**
- Satu keputusan di satu tempat (misalnya di store): bila fitur milik **proyek orang lain** yang pemiliknya Gratis, jangan buka layar Pro. Tampilkan teks (usulan, boleh diubah pemilik): **"Fitur ini mengikuti paket pemilik proyek."** Toast untuk chip, dan keterangan pengganti tanpa tombol beli untuk Timeline.
- `ProBadge` tetap terlihat. Perilaku pemilik, tugas lepas, Mode Demo, dan Timeline utama (Jadwal) tidak berubah.
- Perbarui `AGENTS.md` §7 (aturan "mengetuk memanggil `s.openPro`" mendapat pengecualian ini) dan `DESIGN.md` §6.18.

**Selesai bila:** dengan dua akun di emulator, anggota tidak pernah melihat layar beli untuk fitur milik proyek pemilik Gratis, pemilik tetap melihatnya, dan tampilan dicek di **1280px dan 375px, terang dan gelap**.

---

### P4. Tugas Pro tidak bisa diubah setelah pemilik kehilangan Pro (KECIL, belum terbukti)

**Dugaan dari pembacaan aturan:** `validProjectTask` (dan `validTask` untuk tugas lepas) memeriksa **seluruh isi** dokumen hasil. Kalau pemilik yang tadinya Pro menjadi Gratis (misalnya Pro manual penguji beta dicabut), tugas yang punya `dur` atau `rec` `weekdays`/`monthly` tidak bisa diubah apa pun, termasuk dicentang.

**Kerjakan:** buktikan dulu dengan tes. Kalau terbukti, ubah aturan supaya syarat Pro hanya berlaku saat nilai Pro **baru dipasang atau diubah**. Mempertahankan nilai lama dan menghapusnya (`null`) tetap boleh. Pengingat ganda mengikuti prinsip yang sama.
**Selesai bila:** setelah penurunan paket, mengubah status tugas ber-`dur` diizinkan, mengganti `dur` ke nilai lain ditolak, menghapusnya diizinkan, dan akun Gratis tetap **tidak bisa** memasang nilai Pro baru (semua tes serangan lama hijau).

---

## Menunggu keputusan pemilik — jangan dikerjakan
**Bolehkah anggota membagikan tautan undangan?** Sekarang anggota bisa melihat dan menyalinnya. PRD §5.4 menyebut pemilik yang membuat dan membagikan tautan.
Perlu diketahui sebelum memutuskan: menyembunyikannya di UI **tidak cukup**, karena `inviteToken` ada di dokumen proyek yang boleh dibaca anggota. Kalau diputuskan "hanya pemilik", token harus dipindah ke dokumen yang hanya bisa dibaca pemilik. Jangan mengubah apa pun sampai pemilik memutuskan.

## Setelah selesai
`npm run build`, `npm run test:rules`, `npm run test:functions`, perbarui `PROGRESS.md`, lalu laporkan sesuai format. Sertakan **apa yang belum teruji** (dua akun aktif bersamaan, offline, 375px/terang untuk halaman undangan, migrasi lokal di browser) dan cek sebanyak yang bisa dilakukan. Pemilik akan menyerahkan hasilnya untuk **tinjauan ulang** sebelum Fase 3.

## Prompt pembuka (untuk ditempel ke agent)
```
Kamu agent pengembang proyek TaskFlow. Baca berurutan: GEMINI.md, AGENTS.md,
docs/HANDOFF-FASE2-PERBAIKAN.md, docs/HANDOFF-FASE2.md bagian 2, 5, 6,
lalu firestore.rules, functions/index.js, dan tests/. Kerjakan P1, P2, P3, P4
satu per satu. Untuk P1 dan P2: tulis tes yang gagal dulu dan tunjukkan
kegagalannya sebelum memperbaiki. Patuhi pagar pengaman tanpa kecuali:
jangan firebase deploy, jangan menyentuh proyek sungguhan, jangan menambah
dependency, jangan menulis rahasia, jangan melemahkan aturan atau tes.
Jangan sentuh bagian "Menunggu keputusan pemilik". Setelah tiap langkah:
build, tes, commit, laporkan, lalu berhenti menunggu "lanjut". Mulai dengan
tes reproduksi P1 saja.
```
