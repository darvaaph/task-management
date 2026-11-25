# Progres TaskFlow

Terakhir diperbarui: 25 November 2026. Perbarui file ini setiap selesai satu bagian pekerjaan.

## Sudah dibangun (desktop + HP, terang + gelap)

| Bagian | File utama | Catatan |
|---|---|---|
| Shell: sidebar, navigasi bawah, FAB, toast + Urungkan, banner demo | `App.tsx` | |
| Hari Ini: terlambat + geser, Fokus Utama, tugas lain, progres, proyek aktif, kartu sambutan akun baru | `views/TodayView.tsx` | |
| Inbox: filter area, Belum dijadwalkan / Terjadwal | `views/InboxView.tsx` | |
| Proyek: kartu, filter area, Aktif/Arsip, Proyek baru + kuota | `views/ProjectsView.tsx` | |
| Detail proyek: List per bagian, Board (geser antarkolom di desktop), Timeline | `views/ProjectView.tsx` | |
| Jadwal: Bulan, Minggu (kisi jam di desktop, agenda di HP), Timeline; geser-dan-lepas; kemunculan tugas berulang | `views/JadwalView.tsx` | |
| Tambah tugas: tujuan + tanggal bawaan mengikuti halaman, prioritas, PIC | `components/Composer.tsx` | |
| Detail tugas: lokasi, status, prioritas, tanggal, mulai, jam, durasi, ulangi, PIC, pengingat, catatan | `components/TaskDetail.tsx` | |
| Pencarian ⌘K | `components/Search.tsx` | |
| Kelola proyek (bagian, arsip, hapus 2 langkah) dan Kelola area | `components/Manage.tsx` | |
| Masuk / Daftar / Lupa kata sandi / Tautan terkirim, Mode Demo, Keluar | `views/AuthView.tsx` | Simulasi, tanpa backend |
| Layar Pro + semua titik kunci (Timeline, kuota proyek, ulangi, durasi, pengingat, warna aksen) | `components/Pro.tsx` | "Beli Pro" hanya simulasi |
| Profil HP: tema, kelola area, warna aksen, Pro, keluar | `App.tsx` (`ProfileSheet`) | |

## Belum dibangun

1. **Bagikan proyek** (DESIGN.md §6.25): tautan undangan + Salin + Reset, daftar anggota dengan kuota 3 (Gratis) / 20 (Pro), keluarkan anggota (tugasnya kembali ke pemilik, dengan Urungkan), keadaan "Proyek ini sudah penuh", pratinjau halaman undangan, riwayat aktivitas (Pro).
   - Referensi prototipe: `docs/prototype/taskflow-prototype.dc.html` baris ±571 (desktop), ±999 (HP), logika `shVM` baris ±1467, pencatatan aktivitas `log()` baris ±1197.
   - Perlu: field `activity` di data (lihat `seed()` prototipe baris ±1112), tombol "Bagikan" di header detail proyek, `ProCtx` baru `'share'` (baris tabelnya sudah ada di `Pro.tsx`).
2. **Backend** (PRD §8): akun sungguhan, sinkronisasi cloud, validasi kuota Gratis/Pro di server, tautan undangan sungguhan, realtime. Saat ini semua data hanya di `localStorage` browser.
3. **Notifikasi pengingat**: pilihan pengingat sudah tersimpan di tugas (`rems`), tapi belum ada yang mengirim notifikasi.
4. **PWA + Capacitor Android** (PRD §4): manifest, service worker, paket Android, Google Play Billing.
5. **Overlay Google Calendar** (Pro): belum ada desainnya (DESIGN.md §10).

## Keterbatasan yang diketahui

- "Masuk" hanya memeriksa format isian lalu masuk dengan data yang ada di browser ini. "Daftar" membuat akun kosong yang juga hanya ada di browser ini.
- Data demo dibuat relatif terhadap hari ini, jadi tanggal di demo selalu terlihat baru.
- Belum ada test otomatis maupun linter. Pemeriksaan = `npm run build` + cek manual di browser.

## Riwayat

- **25 Nov 2026** — Pass 1: inti (shell, Hari Ini, Inbox, Proyek, detail, composer, tema). Pass 2: Jadwal. Pass 3: pencarian, Kelola proyek/area. Pass 4: akun, Pro, titik kunci, durasi/ulangi/pengingat, sambutan akun baru.
