# AGENTS.md — TaskFlow

Panduan untuk siapa pun (manusia atau AI agent) yang melanjutkan proyek ini. Baca seluruh file ini sebelum menulis kode.

TaskFlow adalah aplikasi tugas dan proyek berbahasa Indonesia untuk pelajar, mahasiswa, dan pekerja: Hari Ini, Inbox, Jadwal, dan Proyek, di desktop dan HP.

## Sumber kebenaran (urutan prioritas)

1. `docs/tokens/tokens.json` — nilai warna, font, spasi, radius, ukuran.
2. `docs/DESIGN.md` — aturan tampilan, komponen, bahasa, aksesibilitas. **Wajib dibaca sebelum mengubah UI.**
3. `docs/PRD.md` — tujuan produk, fitur, aturan bisnis Gratis vs Pro, anti-goal.
4. `docs/prototype/taskflow-prototype.dc.html` — prototipe interaktif asli (markup + logika di `<script>` bagian bawah). Dipakai sebagai referensi untuk layar yang **belum** dibangun (lihat `docs/PROGRESS.md`). Jangan disalin mentah; terjemahkan ke komponen dan konvensi di bawah.
5. Kode yang sudah ada — pola yang sudah dipakai lebih penting daripada selera pribadi.

Kalau ada yang tidak tertulis di sini maupun di dokumen di atas, **tanya dulu**. Jangan menebak fitur, teks, atau warna baru.

## Tech stack

| | Versi | Catatan |
|---|---|---|
| Vite | 6.4.6 | `vite.config.ts` |
| React | 19.1 | function components + hooks saja |
| TypeScript | 5.8, `strict`, `noUnusedLocals` | `tsconfig.json` |
| Tailwind CSS | 4.1 lewat `@tailwindcss/vite` | **tanpa** `tailwind.config.js`; tema ada di CSS |

Tidak ada router, state library, backend, test runner, atau linter. Backend yang direncanakan (Firebase) dirancang di `docs/BACKEND.md`; ikuti dokumen itu saat mulai membangunnya. Jangan menambah dependency tanpa persetujuan pemilik proyek.

Rencana platform di PRD: Web/PWA lalu dibungkus Capacitor untuk Android. Jangan memakai API yang menghalangi itu (misalnya fitur khusus Node di browser).

## Perintah

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build — WAJIB lolos sebelum menyatakan selesai
```

## Struktur

```
src/
  main.tsx            StoreProvider + App
  App.tsx             shell: sidebar (desktop) / navigasi bawah + FAB (HP), overlay, toast, profil
  store.tsx           SATU store (React context): data, UI, akun, semua aksi. Disimpan di localStorage "taskflow-v1"
  index.css           impor Tailwind + token, base styles (di @layer base), animasi
  tokens.css          CSS variable dari tokens.json (tema terang/gelap/OS, aksen)  ← jangan diedit manual
  tailwind-theme.css  pemetaan token ke utilitas Tailwind (@theme)                  ← jangan diedit manual
  lib/
    types.ts          Task, Project, Area, Data
    constants.ts      label prioritas/status, PEOPLE, AREA_COLORS, kuota
    dates.ts          semua helper tanggal (ISO "YYYY-MM-DD", nama hari/bulan Indonesia)
    logic.ts          aturan domain: inToday, isOverdue, byOpen, progres proyek, tujuan (Dest), pengulangan
    seed.ts           data demo, relatif terhadap hari ini
  components/
    ui.tsx            blok dasar: Chip, Segmented, PrioPicker, PrioBadge, ProgressBar, Avatar,
                      SectionLabel, EmptyCard, Sheet, Modal, useEscape, btnPrimary, btnSecondary
    TaskRow.tsx       baris tugas (dipakai di semua daftar)
    Composer.tsx      tambah tugas: InlineComposer (desktop), QuickSheet (HP)
    DestPicker.tsx    pemilih tujuan Inbox / area / proyek › bagian
    TaskDetail.tsx    DetailPanel (desktop 360px) dan DetailSheet (HP)
    Search.tsx        pencarian ⌘K
    Manage.tsx        Kelola proyek, Kelola area
    Pro.tsx           ProBadge, ProScreen, ProLocked, AccentPicker
    icons.tsx         ikon garis SVG
  views/              satu file per layar: Today, Inbox, Jadwal (Bulan/Minggu/Timeline), Projects, Project, Auth
docs/                 dokumen desain dan progres (lihat di atas)
```

## Aturan wajib

### 1. Warna dan token
- Semua warna lewat token: `bg-surface`, `text-fg2`, `border-line2`, `bg-high-soft`, atau `var(--accent)` di `style`. **Jangan menulis hex/rgb/oklch baru di komponen.** Pengecualian yang sudah ada: warna avatar di `PEOPLE` dan palet tambahan di `AREA_COLORS` (`constants.ts`).
- Daftar token: `canvas bg surface surface2 hover line line2 fg fg2 fg3 accent accent-soft on-accent high high-soft med med-soft low low-soft area-kuliah area-kantor area-pribadi`.
- Warna area hanya untuk **penanda** (titik, batang, progress), tidak untuk teks.
- Aksen dipakai untuk: tab aktif, FAB, "Coba Mode Demo", "Beli Pro", garis hari ini, progres. Bukan untuk teks biasa atau dekorasi.
- Tema dan aksen diatur di `<html data-theme data-accent>` oleh store. Komponen tidak boleh mengecek tema sendiri.

### 2. Spasi Tailwind = 2px per unit (paling sering salah!)
`tailwind-theme.css` mengatur `--spacing: 2px`. Jadi angka kelas = **piksel ÷ 2**:

| Mau | Tulis |
|---|---|
| 8px | `p-4`, `gap-4` |
| 16px | `p-8` |
| 34px tinggi tombol | `h-17` |
| 44px | `px-22` |
| 50px baris tugas | `min-h-25` |

Jangan pakai nilai Tailwind "biasa" (`p-4` ≠ 16px di sini). Ukuran yang tidak genap boleh pakai `[...]`, misalnya `w-[360px]`.

### 3. Tipografi
- Font: Bricolage Grotesque (`font-display`, judul), Onest (`font-sans`, bawaan), JetBrains Mono (`font-mono`, label/angka/badge). Jangan menambah font.
- Utilitas siap pakai: `text-title-xl`, `text-title-l`, `text-title-m`, `text-body`, `text-body-s`, `text-meta`, `text-label` (mono kapital, untuk label bagian), `text-badge`.
- Tidak ada teks di bawah 10px. Teks 10–11px hanya mono kapital atau badge.

### 4. Radius dan bayangan
- Radius dari tema: `rounded-xs` 5, `rounded-sm` 7, `rounded-md` 10, `rounded-lg` 14, `rounded-xl` 16, `rounded-fab` 20, `rounded-t-sheet` 22, `rounded-pill` 99.
- Kedalaman dibuat dengan border `line`, bukan bayangan. Bayangan hanya untuk: segmented aktif (`shadow-seg`), FAB (`shadow-fab`), modal/popover.
- Tidak ada gradien, glassmorphism, atau ilustrasi dekoratif.

### 5. Desktop dan HP — selalu dua-duanya
- `App.tsx` punya `useIsMobile()` (≤767px). Layar menerima prop `mobile` dan menggambar dua tata letak bila perlu.
- Desktop: sidebar 236px, isi maks 780px (Hari Ini, Inbox) / 900px (Proyek), panel detail 360px di kanan, dialog = `Modal`.
- HP: navigasi bawah 88px, FAB, padding bawah 110px, dialog = `Sheet` (bottom sheet), target sentuh ≥36px, tombol utama 44–48px.
- Setiap perubahan UI harus dicek di **1280px dan 375px**, mode **terang dan gelap**.

### 6. Komponen dan pola yang harus dipakai ulang
- Butuh chip/segmented/badge/dialog? Pakai yang di `components/ui.tsx`. Jangan membuat versi kedua.
- Daftar tugas selalu memakai `TaskRow`.
- Semua data dan aksi lewat `useStore()`. Jangan `useState` untuk data yang disimpan, dan jangan menulis ke `localStorage` di luar `store.tsx`.
- Navigasi: `s.go(view, extra)`. UI sementara: `s.setUI({...})`. Dialog global: `s.setUI({ overlay: 'search' | 'project' | 'areas' })`.
- Aksi yang menghapus/menyembunyikan data: buat aksinya di `store.tsx` dengan helper internal `undoable(pesan, fn)` (contoh: `deleteTask`, `archiveProject`) → toast 6 detik dengan **Urungkan**. Jangan meminta konfirmasi tambahan kecuali dampaknya besar (hapus proyek, hapus area yang dipakai). Toast biasa: `s.say(pesan)`.
- Tanggal selalu string ISO lokal `YYYY-MM-DD` lewat `lib/dates.ts`. Jangan memakai `new Date().toISOString()` (zona waktu UTC menggeser hari).
- Aturan domain (terlambat, hari ini, progres, pengulangan) ada di `lib/logic.ts`. Tambahkan di sana, jangan diulang di komponen.

### 7. Gratis vs Pro
- Cek dengan `s.isPro` (Pro **atau** mode demo), atau `s.isProFor(project)` untuk fitur di dalam proyek. Fitur terkunci **tetap terlihat** dengan `ProBadge`; mengetuknya memanggil `s.openPro(ctx, project?)`.
- **Pengecualian proyek bersama milik orang lain (Gratis):** jika pengguna adalah anggota di proyek milik orang lain yang pemiliknya Gratis (`!s.canUpgradeFor(project)`), jangan membuka layar Pro karena pembelian Pro anggota tidak membuka fitur proyek itu. `s.openPro(ctx, project)` menampilkan toast *"Fitur ini mengikuti paket pemilik proyek."*, dan Timeline proyek menampilkan keterangan pengganti tanpa tombol beli. `ProBadge` tetap terlihat.
- Fitur Pro baru: tambahkan `ProCtx` di `store.tsx`, kalimat konteks di `CTX`, dan barisnya di `ROWS` (`components/Pro.tsx`).
- Fitur terkunci tidak boleh jadi menu utama.
- Semua batas harus divalidasi ulang di server begitu backend ada (PRD §3).

### 8. Bahasa dan teks
- Seluruh antarmuka berbahasa Indonesia. Istilah yang dibiarkan: Inbox, Timeline, Board, List, Pro.
- Status: **Belum · Dikerjakan · Selesai**. Prioritas: **Tinggi · Sedang · Rendah**.
- Pakai "proyek", "arsip", "bagian", "bersama", "bagikan" — bukan project/archives/section/shared/share.
- Ambil teks dari `docs/DESIGN.md` atau prototipe bila ada. Kalimat bantuan pendek dan tidak menyalahkan.
- Komentar kode dalam bahasa Inggris, hanya untuk menjelaskan *kenapa*, bukan mengulang kode.

### 9. Aksesibilitas (wajib)
- Kontras teks ≥ 4,5:1 di terang dan gelap. `fg3` adalah abu-abu paling muda untuk teks.
- Elemen yang bisa diklik = `<button type="button">` atau `<a>`. Pengecualian: baris tugas/kartu yang punya tombol sendiri di dalamnya.
- Tombol ikon wajib `aria-label`; ikon dekoratif `aria-hidden="true"`; tombol toggle pakai `aria-pressed`; dialog pakai `role="dialog" aria-modal aria-label`.
- Warna tidak boleh satu-satunya pembeda: prioritas selalu ada labelnya, area selalu ada namanya.
- Setiap isian punya label tertulis, bukan hanya placeholder.

### 10. Jebakan yang sudah pernah terjadi
- CSS dasar di `index.css` harus di dalam `@layer base`, kalau tidak ia menimpa utilitas Tailwind (tombol jadi tanpa teks).
- Anak dari `Sheet`/`Modal` diberi `flex-none` otomatis supaya tidak tergencet (textarea pernah terpotong). Jangan dihapus.
- Komponen kecil jangan didefinisikan **di dalam** komponen lain bila berisi input — tiap render akan me-mount ulang dan fokus hilang.
- Ganti nama yang memindahkan data (nama bagian) disimpan saat `blur`, bukan tiap ketikan.

## Anti-slop: jangan lakukan

- Menambah warna, font, ikon berwarna penuh, emoji sebagai ikon, gradien, atau bayangan di luar aturan di atas.
- Menambah fitur di luar PRD, terutama yang ada di anti-goal: wiki/editor catatan panjang, chat, custom fields, hierarki lebih dari 3 lapis.
- Teks bahasa Inggris di UI, lorem ipsum, atau kalimat pemasaran yang tidak ada di desain.
- Membuat ulang komponen yang sudah ada, atau gaya inline baru untuk hal yang sudah punya utilitas.
- Menyatakan "selesai" tanpa `npm run build` lolos dan tanpa cek di browser (desktop + HP, terang + gelap).
- Menulis ulang file besar tanpa diminta. Ubah sekecil mungkin yang menyelesaikan tugas.

## Status dan langkah berikutnya

Lihat `docs/PROGRESS.md`. Perbarui file itu setiap selesai satu bagian pekerjaan.

Pekerjaan backend yang sedang berjalan: `docs/HANDOFF-FASE2.md` (tugas, batasan, definisi selesai) dan `docs/BACKEND.md` (rancangan). Agent Gemini membaca `GEMINI.md`, yang menunjuk ke file ini.
