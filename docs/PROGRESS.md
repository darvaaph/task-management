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
| Bagikan proyek (tautan + Salin + Reset, kuota 3/20, keluarkan + Urungkan, pratinjau undangan, riwayat aktivitas Pro) | `components/Share.tsx` | Simulasi, tanpa backend |
| Masuk / Daftar / Lupa kata sandi / Tautan terkirim, Mode Demo, Keluar | `views/AuthView.tsx` | Simulasi, tanpa backend |
| Layar Pro + semua titik kunci (Timeline, kuota proyek, ulangi, durasi, pengingat, warna aksen, bagikan) | `components/Pro.tsx` | "Beli Pro" hanya simulasi |
| Profil HP: tema, kelola area, warna aksen, Pro, keluar | `App.tsx` (`ProfileSheet`) | |
| Perangkat dan platform: panel detail melayang di 768–1099 px, isian 16 px di layar sentuh, safe-area di navigasi bawah/FAB/toast/sheet, `dvh` di modal, label ⌘K/Ctrl+K per platform, Timeline di tablet sentuh memakai "Ubah jadwal" | `lib/device.ts`, `App.tsx`, `index.css` | DESIGN §6.28 |
| Pilih area awal setelah Daftar (6 preset, minimal 1, Lewati = 3 bawaan) | `views/AuthView.tsx`, `store.tsx` (`register`), `lib/constants.ts` (`AREA_PRESETS`) | DESIGN §6.29 |
| Tugas panduan di Inbox untuk akun baru + "Hapus semua panduan" dengan Urungkan | `lib/seed.ts` (`guideTasks`), `store.tsx` (`clearGuides`), `views/TodayView.tsx` | DESIGN §6.30 |
| Usap baris tugas di layar sentuh (kanan = Selesai, kiri = Jadwalkan) + tugas panduan keempat | `components/TaskRow.tsx`, `lib/seed.ts` | DESIGN §6.31 |
| Suara dan getaran saat tugas selesai / ambang usap, mati secara bawaan, sakelar di profil HP dan sidebar | `lib/feedback.ts`, `store.tsx`, `App.tsx`, `TaskRow.tsx` | DESIGN §6.32; getaran iOS menunggu Capacitor |
| Logo "Cincin terbuka": `LogoMark` di sidebar dan halaman Masuk, favicon SVG/PNG, apple-touch-icon, ikon 192/512 + maskable untuk PWA | `components/icons.tsx`, `public/`, `index.html` | DESIGN §5.1 |
| PWA: manifest, meta iOS/Android, service worker offline (shell + aset hasil build + font), hanya aktif di build produksi | `public/manifest.webmanifest`, `public/sw.js`, `main.tsx`, `index.html` | DESIGN §6.28; uji dengan `npm run build` lalu `npm run preview` |
| Notifikasi pengingat selama aplikasi terbuka: jadwal dari `rems`, izin lewat tombol, klik membuka tugas, tidak dobel setelah muat ulang | `components/Reminders.tsx`, `lib/logic.ts` (`reminderTimes`), `public/sw.js`, `store.tsx` (`markNotified`) | DESIGN §6.22 |
| Detail tugas lebih pendek di HP: catatan di bawah judul, Durasi/Ulangi/Pengingat jadi baris ringkas, Hapus/Simpan menempel di bawah (isi sheet 1.288 → 839 px); semua properti dalam satu kartu RINCIAN, tanggal/jam lewat pemilih bawaan, sheet bisa ditarik ke bawah untuk ditutup | `components/TaskDetail.tsx` | DESIGN §6.11 |
| Gerak mikro: centang memantul, warna centang/judul berganti halus, progress bar mengikuti token gerak (mati saat reduced motion) | `TaskRow.tsx`, `TaskDetail.tsx`, `ui.tsx`, `index.css` | DESIGN §6.32 |

## Belum dibangun

1. **Backend** (PRD §8): akun sungguhan, sinkronisasi cloud, validasi kuota Gratis/Pro di server, tautan undangan sungguhan, realtime. Saat ini semua data hanya di `localStorage` browser.
2. **Pengingat saat aplikasi tertutup**: butuh push dari server atau Local Notifications Capacitor. Selama TaskFlow terbuka, notifikasi sudah jalan.
3. **Capacitor Android** (PRD §4): paket Android dan Google Play Billing. PWA sudah ada. Saat itu, getaran memakai `@capacitor/haptics` (perlu persetujuan dependency) supaya iOS ikut.
4. **Overlay Google Calendar** (Pro): belum ada desainnya (DESIGN.md §10).

## Keterbatasan yang diketahui

- "Masuk" hanya memeriksa format isian lalu masuk dengan data yang ada di browser ini. "Daftar" membuat akun kosong yang juga hanya ada di browser ini.
- Data demo dibuat relatif terhadap hari ini, jadi tanggal di demo selalu terlihat baru.
- Belum ada test otomatis maupun linter. Pemeriksaan = `npm run build` + cek manual di browser.

## Riwayat

- **25 Nov 2026** — Pass 7: dukungan perangkat (tablet, sentuh, safe-area, pintasan per platform). Pass 8: gerak mikro centang dan progres. Pass 9: pilih area awal saat Daftar. Pass 10: tugas panduan. Pass 11: usap baris tugas; sheet profil kini tertutup saat Keluar. Pass 12: suara dan getaran. Pass 13: logo dan ikon aplikasi. Pass 14: PWA dan mode offline. Pass 15: notifikasi pengingat. Pass 16: detail tugas HP diringkas, catatan dipindah ke atas. Keputusan untuk area awal, tugas panduan, usap, dan gerak/suara/getaran dicatat di DESIGN 0.9 dan PRD.
- **25 Nov 2026** — Pass 1: inti (shell, Hari Ini, Inbox, Proyek, detail, composer, tema). Pass 2: Jadwal. Pass 3: pencarian, Kelola proyek/area. Pass 4: akun, Pro, titik kunci, durasi/ulangi/pengingat, sambutan akun baru. Pass 5: Bagikan proyek & riwayat aktivitas. Pass 6: focus trap + tumpukan dialog (`Modal`/`Sheet`/`Search`), tanggal bebas di Proyek baru, tautan dapat diklik di catatan, filter area di Timeline, Urungkan untuk geser semua terlambat.
