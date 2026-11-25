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
| Bagikan proyek (tautan + Salin + Reset, kuota 3/20, keluarkan + Urungkan, pratinjau undangan yang bisa dibuka-tutup, riwayat aktivitas Pro) | `components/Share.tsx` | Tombol Simulasi hanya di mode demo; akun biasa diberi tahu bahwa bergabung menunggu sinkronisasi cloud |
| Masuk dengan Google + Mode Demo, Pilih area awal setelah login pertama, Keluar | `views/AuthView.tsx`, `store.tsx`, `functions/index.js` | DESIGN §6.20, §6.29; login Google lewat Firebase Auth (`signInWithPopup` + cadangan `signInWithRedirect`), Mode Demo tetap lokal |
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
| Backend Fase 1A — Fondasi Firebase & Emulator: konfigurasi emulator (Auth 9099, Firestore 8080, Functions 5001, UI 4000), `.firebaserc` (`demo-taskflow` default, `prod` alias), `firestore.rules` awal (tolak semua), `firestore.indexes.json`, klien `src/lib/firebase.ts` (`persistentLocalCache` + `persistentMultipleTabManager`, tanpa Analytics), skrip `emulators` & `test:rules` | `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `src/lib/firebase.ts`, `package.json` | HANDOFF-FASE1 §4 (1A); belum disambungkan ke UI/store |
| Backend Fase 1B — Security Rules & tesnya: aturan Firestore untuk `users/{uid}` (isolasi pemilik, field server-only, `accent` Gratis vs Pro), `areas`, `tasks` (judul wajib 1–300 karakter, `dur`/`rec`/`rems` Gratis vs Pro, field audit immutable), `reminders`, penolakan penuh `projects`/`invites`/`purchases`, dan 21 tes unit `node --test` lewat emulator | `firestore.rules`, `tests/rules/firestore.test.mjs`, `package.json` | HANDOFF-FASE1 §4 (1B); `@firebase/rules-unit-testing` sebagai devDependency; belum disambungkan ke UI/store |
| Backend Fase 1C — Login Google web & `onUserCreated`: Cloud Function `onUserCreated` membuat `users/{uid}` (`plan: 'free'`, `activeOwned: 0`), layar Masuk baru ("Lanjutkan dengan Google" + "Coba Mode Demo"), Pilih area awal menulis `users/{uid}/areas` dan `guideTasks()` ke `users/{uid}/tasks`, Keluar (`signOut`), Mode Demo tetap lokal | `functions/index.js`, `functions/package.json`, `firebase.json`, `src/store.tsx`, `src/views/AuthView.tsx`, `src/components/icons.tsx`, `docs/DESIGN.md` | HANDOFF-FASE1 §4 (1C); mutasi tugas/area berkelanjutan menyusul di 1D |
| Backend Fase 1D — `store.tsx` tersambung ke Firestore untuk area & tugas lepas: listener realtime `onSnapshot` (`users/{uid}`, `areas`, `tasks`), `plan` hanya-baca dari `users/{uid}` sebagai dasar `isPro`, seluruh mutasi area & tugas lepas menulis ke Firestore (termasuk `moveTask` lintas lepas↔proyek dan Urungkan 6 detik online/offline), proyek/aktivitas/setelan tetap lokal, Mode Demo tetap lokal | `src/store.tsx` | HANDOFF-FASE1 §4 (1D); cache offline `persistentLocalCache` teruji |
| Backend Fase 1E — Pindahkan data lokal ke akun: deteksi data lokal non-demo sebelum login pertama, dialog `Modal`/`Sheet` "Pindahkan data di perangkat ini ke akun Anda?" (Pindahkan / Lewati), tulis batch maks. 500 per batch untuk area & tugas lepas saja, idempoten dan tahan klik ganda | `src/store.tsx`, `src/App.tsx`, `docs/DESIGN.md` | HANDOFF-FASE1 §4 (1E) |

## Belum dibangun

1. **Backend** (tugas Fase 1 yang siap diserahkan: `docs/HANDOFF-FASE1.md`; rancangan lengkap di `docs/BACKEND.md`; PRD §8, pilihan teknis di PRD §9.1: Firebase + login Google + Xendit + Google Play Billing + Capacitor): akun sungguhan, sinkronisasi cloud, validasi kuota Gratis/Pro di server, tautan undangan sungguhan, realtime. Termasuk alur bergabung: daftar/masuk dari tautan, lalu "Masukkan ke area mana?" dengan area milik anggota sendiri (`project_members.area_id`, PRD §5.4, DESIGN §6.25). Saat ini semua data hanya di `localStorage` browser.
2. **Pengingat saat aplikasi tertutup**: butuh push dari server atau Local Notifications Capacitor. Selama TaskFlow terbuka, notifikasi sudah jalan.
3. **Capacitor Android** (PRD §4): paket Android dan Google Play Billing. PWA sudah ada. Saat itu, getaran memakai `@capacitor/haptics` (perlu persetujuan dependency) supaya iOS ikut.
4. **Overlay Google Calendar** (Pro): belum ada desainnya (DESIGN.md §10).

## Keterbatasan yang diketahui

- Proyek, tugas proyek, riwayat aktivitas, dan setelan akun masih lokal di browser (`localStorage`); area dan tugas lepas akun Google sudah tersinkron ke Firestore (dengan cache offline).
- Data demo dibuat relatif terhadap hari ini, jadi tanggal di demo selalu terlihat baru.
- Tes otomatis baru mencakup Security Rules (`npm run test:rules`); belum ada tes UI atau linter. Pemeriksaan = `npm run build` + `npm run test:rules` + cek manual di browser.

## Riwayat

- **25 Nov 2026** — Backend Fase 1E: tawaran pindahkan data lokal non-demo (area & tugas lepas) setelah login pertama dengan batch ≤500 tulis dan pengaman anti-duplikasi.
- **25 Nov 2026** — Backend Fase 1D: `store.tsx` tersambung ke Firestore (`onSnapshot` + mutasi + Urungkan + offline) untuk area, tugas lepas, dan `plan` hanya-baca; proyek & Mode Demo tetap lokal.
- **25 Nov 2026** — Backend Fase 1C: Cloud Function `onUserCreated`, login Google web (`signInWithPopup` + cadangan `signInWithRedirect`), layar Masuk baru (§6.20), Pilih area awal menulis area & tugas panduan ke Firestore, dan Keluar (`signOut`).
- **25 Nov 2026** — Backend Fase 1B: Security Rules untuk `users`, `areas`, `tasks`, `reminders` (penolakan penuh `projects`/`invites`/`purchases`) dan 21 tes aturan `node --test` via Firestore Emulator.
- **25 Nov 2026** — Backend Fase 1A: fondasi Firebase lokal, emulator (`demo-taskflow`), `firestore.rules` awal (tolak semua), dan `src/lib/firebase.ts`.
- **25 Nov 2026** — Pass 7: dukungan perangkat (tablet, sentuh, safe-area, pintasan per platform). Pass 8: gerak mikro centang dan progres. Pass 9: pilih area awal saat Daftar. Pass 10: tugas panduan. Pass 11: usap baris tugas; sheet profil kini tertutup saat Keluar. Pass 12: suara dan getaran. Pass 13: logo dan ikon aplikasi. Pass 14: PWA dan mode offline. Pass 15: notifikasi pengingat. Pass 16: detail tugas HP diringkas, catatan dipindah ke atas. Keputusan untuk area awal, tugas panduan, usap, dan gerak/suara/getaran dicatat di DESIGN 0.9 dan PRD.
- **25 Nov 2026** — Pass 1: inti (shell, Hari Ini, Inbox, Proyek, detail, composer, tema). Pass 2: Jadwal. Pass 3: pencarian, Kelola proyek/area. Pass 4: akun, Pro, titik kunci, durasi/ulangi/pengingat, sambutan akun baru. Pass 5: Bagikan proyek & riwayat aktivitas. Pass 6: focus trap + tumpukan dialog (`Modal`/`Sheet`/`Search`), tanggal bebas di Proyek baru, tautan dapat diklik di catatan, filter area di Timeline, Urungkan untuk geser semua terlambat.
