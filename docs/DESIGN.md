# TaskFlow — Design System

> **Catatan untuk kode ini (ditambahkan saat implementasi, 25 Nov 2026)**
> - Dokumen ini disalin dari proyek Claude Design. Sumber aslinya: https://claude.ai/code/artifact/8eb58b51-3095-49f2-ab9f-dc0570bd251e
> - Folder `tokens/` yang disebut di bawah ada di `docs/tokens/tokens.json` (sumber). Versi CSS-nya dipakai langsung di `src/tokens.css` dan `src/tailwind-theme.css`.
> - Nama di kode berbeda dengan prototipe: `--kuliah` / `--kantor` / `--pribadi` menjadi `--area-kuliah` / `--area-kantor` / `--area-pribadi`; `--ah` menjadi `--accent-h`; `--display` / `--sans` / `--mono` menjadi `--font-display` / `--font-sans` / `--font-mono`.
> - Tema dan aksen dipasang di `<html data-theme="light|dark" data-accent="indigo|teal|tangerine|forest">`.
> - Kalau dokumen ini dan `docs/tokens/tokens.json` berbeda, `tokens.json` yang benar.

Versi 0.8 · 25 November 2026
Sumber kebenaran untuk tampilan TaskFlow. Kalau prototipe dan dokumen ini berbeda, perbaiki salah satunya agar sama, lalu catat di bagian "Riwayat perubahan".

---

## 1. Prinsip

1. **Tugas dulu, ringkasan belakangan.** Layar harus menampilkan tugas sebanyak mungkin tanpa scroll. Ringkasan (progres, statistik) cukup satu baris.
2. **Satu data, banyak tampilan.** Hari Ini, Inbox, Jadwal, dan Proyek membaca data tugas yang sama. Mengubah tugas di satu tempat langsung terlihat di tempat lain.
3. **Mencatat < 3 detik.** Judul adalah satu-satunya isian wajib. Tanggal, area, dan proyek boleh diatur nanti.
4. **Tidak menghukum.** Tugas terlambat diberi jalan keluar ("Geser ke Hari Ini"), bukan sekadar warna merah.
5. **Terbaca oleh semua orang.** Semua teks memenuhi kontras 4,5:1, termasuk label kecil dan mode gelap.

---

## 2. Warna (design tokens)

Semua warna dipakai lewat CSS variable. Jangan menulis hex langsung di komponen.

Nilai resmi ada di folder `tokens/`: `tokens.json` (sumber, format W3C Design Tokens), `tokens.css` (CSS variable, tema terang/gelap/OS, aksen), dan `tailwind.css` (pemetaan ke Tailwind v4). Kalau nilai di dokumen ini dan `tokens.json` berbeda, `tokens.json` yang benar. Catatan: di `tokens.css` warna area bernama `--area-kuliah` dan seterusnya; prototipe masih memakai `--kuliah`.

### 2.1 Netral

| Token | Terang | Gelap | Dipakai untuk |
|---|---|---|---|
| `--canvas` | `#e4e2dc` | `#0d0d0c` | Latar di luar layar aplikasi (hanya prototipe) |
| `--bg` | `#f6f5f1` | `#161614` | Latar halaman |
| `--surface` | `#fdfcfa` | `#1e1d1b` | Kartu, sidebar, bottom sheet, navigasi bawah |
| `--surface2` | `#eeece6` | `#282724` | Latar segmented control, kolom Board, track progress |
| `--hover` | `rgba(28,27,24,.045)` | `rgba(255,250,240,.045)` | Hover baris dan tombol |
| `--line` | `rgba(28,27,24,.08)` | `rgba(255,250,240,.08)` | Garis pemisah, border kartu |
| `--line2` | `rgba(28,27,24,.16)` | `rgba(255,250,240,.15)` | Border tombol sekunder dan chip |
| `--fg` | `#1c1b18` | `#efede7` | Teks utama |
| `--fg2` | `#58554e` | `#aaa69d` | Teks sekunder, label tab tidak aktif |
| `--fg3` | `#6b675f` | `#9a968d` | Teks tersier: tanggal, jumlah, placeholder |

Kontras `--fg3` (teks terlemah yang diizinkan):

| | `--surface` | `--bg` | `--surface2` |
|---|---|---|---|
| Terang `#6b675f` | 5,49:1 | 5,16:1 | 4,77:1 |
| Gelap `#9a968d` | 5,71:1 | 6,14:1 | 5,07:1 |

Jangan membuat abu-abu yang lebih muda dari `--fg3` untuk teks. Untuk elemen yang benar-benar dekoratif (titik, garis), pakai `--line2`.

### 2.2 Aksen

| Token | Terang | Gelap |
|---|---|---|
| `--accent` | `oklch(0.5 0.16 var(--ah))` ≈ `#355bbd` | `oklch(0.72 0.13 var(--ah))` |
| `--accent-soft` | aksen dengan alpha .11 | aksen dengan alpha .14 |
| `--on-accent` | `#fff` | `#111` |

`--ah` adalah hue aksen. Bawaan: Indigo `265`. Pilihan lain (fitur Pro "warna aksen"): Teal `195`, Tangerine `45`, Forest `150`. Teal memakai lightness 0.47 (bukan 0.5) karena pada 0.5 kontrasnya hanya 4,21:1. Setiap hue baru wajib dicek ulang kontrasnya: teks aksen di atas `--accent-soft` minimal 4,5:1.

Aksen dipakai untuk: tab aktif, tombol utama yang berwarna (FAB, "Coba Mode Demo"), garis "hari ini" di Timeline, dan progres. Jangan memakai aksen untuk teks biasa atau dekorasi.

### 2.3 Prioritas

| Token | Terang | Kontras di atas `-soft` | Gelap |
|---|---|---|---|
| `--high` / `--high-soft` | `oklch(0.53 0.19 27)` ≈ `#c22826` | 4,75:1 | `oklch(0.7 0.16 27)` |
| `--med` / `--med-soft` | `oklch(0.5 0.12 65)` ≈ `#915200` | 4,6:1 | `oklch(0.78 0.13 75)` |
| `--low` / `--low-soft` | `oklch(0.5 0.08 230)` ≈ `#296b88` | 4,9:1 | `oklch(0.72 0.07 230)` |

Label prioritas: **Tinggi**, **Sedang**, **Rendah**. Warna merah juga dipakai untuk status "Terlambat" dan aksi hapus.

### 2.4 Area

| Token | Terang | Gelap |
|---|---|---|
| `--kuliah` | `oklch(0.58 0.13 250)` | `oklch(0.7 0.12 250)` |
| `--kantor` | `oklch(0.57 0.14 310)` | `oklch(0.7 0.12 310)` |
| `--pribadi` | `oklch(0.6 0.12 155)` | `oklch(0.72 0.11 155)` |

Warna area **hanya untuk penanda** (titik 7–9 px, batang Timeline, progress bar proyek), tidak untuk teks. Kontrasnya di bawah 4,5:1, jadi nama area selalu ditulis dengan `--fg` atau `--fg2` di sebelah titiknya.

---

## 3. Tipografi

| Peran | Font | Contoh pemakaian |
|---|---|---|
| Display | **Bricolage Grotesque** 500–700 | Judul halaman, nama proyek, judul bottom sheet |
| Sans | **Onest** 400–700 | Semua teks isi, tombol, label |
| Mono | **JetBrains Mono** 400–600 | Label bagian (huruf kapital), tanggal kecil, jumlah, badge prioritas, shortcut ⌘K |

Skala:

| Nama | Ukuran / tinggi baris | Berat | Font | Contoh |
|---|---|---|---|---|
| `title-xl` | 34 / 1.05 (desktop), 32 / 1.05 (HP) | 600, letter-spacing −0.02em | Display | "Hari Ini", "Proyek" |
| `title-l` | 28–30 / 1.05 | 600 | Display | Nama proyek di halaman detail, nama bulan |
| `title-m` | 18–21 / 1.25 | 600 | Display | Judul tugas di detail, nama proyek di kartu |
| `body` | 14 / 1.3 | 400 | Sans | Judul tugas di daftar |
| `body-s` | 12.5–13 / 1.45 | 400–500 | Sans | Keterangan, tombol kecil |
| `meta` | 12 | 400 | Sans | Nama proyek di bawah tugas, sisa hari |
| `label` | 10.5–11, letter-spacing .08em, kapital | 600 | Mono | "FOKUS UTAMA", "TERLAMBAT (2)" |
| `badge` | 10–10.5 | 600 | Mono | Tinggi / Sedang / Rendah |

Batas bawah: tidak ada teks di bawah **10 px**, dan teks 10–11 px hanya dalam huruf kapital mono atau badge.

---

## 4. Spasi, sudut, bayangan

**Spasi** (kelipatan 2, paling sering): `2 · 4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 24 · 28 · 32 · 44`

- Padding halaman desktop: `32px 44px 48px`. Lebar isi maksimal 780 px (Hari Ini, Inbox), 900 px (Proyek).
- Padding halaman HP: 16–20 px kiri-kanan.
- Jarak antarbagian: 20–28 px. Jarak di dalam bagian: 2 px antarbaris tugas.
- Ruang bawah HP: `padding-bottom:110px` agar baris terakhir tidak tertutup FAB dan navigasi bawah.

**Sudut (radius)**

| Elemen | Radius |
|---|---|
| Badge, chip kecil | 5–6 px |
| Tombol, input, segmented control | 7–10 px (desktop), 10–12 px (HP) |
| Baris tugas | 10 px |
| Kartu | 12–16 px |
| Bottom sheet | 22 px (atas saja) |
| Pill (chip area, tab aktif HP) | 99 px |
| FAB | 20 px |

**Bayangan**

- `--shadow`: hanya untuk bingkai layar di prototipe.
- Segmented control aktif: `0 1px 2px rgba(0,0,0,.1)`.
- FAB: `0 10px 24px -8px` dengan warna aksen.
- Selain itu, kedalaman dibuat dengan **border `--line`**, bukan bayangan.

---

## 5. Ikon

- Gaya garis (outline), `viewBox 0 0 24 24`, `stroke-width` 2 (1.9 di navigasi HP), ujung dan sudut membulat, `stroke="currentColor"`.
- Ukuran: 16 px di sidebar desktop, 22 px di navigasi bawah HP.
- Ikon dekoratif wajib `aria-hidden="true"`. Tombol yang hanya berisi ikon wajib punya `aria-label`.
- Satu gaya untuk semua ikon. Jangan mencampur ikon berwarna penuh dengan ikon garis.

| Menu | Ikon |
|---|---|
| Hari Ini | Lingkaran dengan centang |
| Inbox | Baki masuk |
| Jadwal | Kalender |
| Proyek | Map |

### 5.1 Logo

**Cincin terbuka:** cincin progres yang belum tertutup (celah di kanan atas), dan centang yang menembus celah itu. Artinya tugas selesai dan alurnya terus berjalan. Berkerabat dengan ikon Hari Ini (lingkaran + centang).

- Geometri di kisi 64: kotak radius 15; cincin pusat (32, 32) jari-jari 17, tebal 5,5, celah dari −70° sampai −20°; centang `M22.5 31.5 29.5 38.5 50.5 12.5`, tebal 6; semua ujung membulat.
- **Di dalam aplikasi** (`LogoMark` di `icons.tsx`): kotak `--accent`, garis `--on-accent`, jadi ikut warna aksen dan tema. Sidebar 22 px, halaman Masuk 22–24 px, selalu diikuti kata **TaskFlow** dalam Bricolage Grotesque 600.
- **Di luar aplikasi** (favicon, ikon layar utama) warna tetap Indigo, karena browser dan launcher tidak tahu aksen pengguna: terang `#355bbd` + garis putih, gelap `#7ca2f6` + garis `#161614` (`oklch(0.5 0.16 265)` dan `oklch(0.72 0.13 265)` dalam sRGB).
- Berkas di `public/`: `favicon.svg` (berganti otomatis di mode gelap), `favicon-32.png`, `apple-touch-icon.png` 180 (kotak penuh, iOS membulatkan sendiri), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (latar penuh, tanda diperkecil 80 % agar aman dipotong Android). Untuk mengubah bentuk, ubah SVG lalu buat ulang PNG-nya.
- Jangan memberi bayangan, gradien, atau garis tepi pada logo, dan jangan memutar atau memisah cincin dari centangnya.

---

## 6. Komponen

### 6.1 Baris tugas (`TaskRow`)

- Tinggi minimal 50 px, radius 10.
- Urutan kiri ke kanan: lingkaran centang (area sentuh 38 × 38, lingkaran 20 px dengan border warna prioritas) → judul + meta (titik area/proyek + nama + jam) → tombol "Geser" (jika terlambat) → tanggal → avatar PIC (proyek bersama saja) → badge prioritas.
- Selesai: judul dicoret, warna `--fg3`, lingkaran terisi `--fg3`.
- Terpilih: latar `--accent-soft`.

### 6.2 Tombol

| Jenis | Gaya | Contoh |
|---|---|---|
| Utama | Latar `--fg`, teks `--bg`, 600 | Tambah, Simpan, Masuk |
| Utama berwarna | Latar `--accent`, teks `--on-accent` | FAB +, Coba Mode Demo |
| Sekunder | Transparan, border `--line2`, teks `--fg` | Bagikan, Hari ini, Ubah jadwal |
| Bahaya | Transparan, border `--line2`, teks `--high` | Hapus, Keluar |
| Aksi terlambat | Latar `--high`, teks putih | Geser semua ke Hari Ini |

Tinggi: 32–38 px di desktop, **minimal 44–48 px** untuk tombol utama di HP. Area sentuh di HP minimal 36 px.

### 6.3 Segmented control

Wadah `--surface2`, padding 3, radius 9–10. Opsi aktif: latar `--surface`, teks `--fg`, bayangan tipis. Opsi tidak aktif: transparan, teks `--fg2`.
Dipakai untuk: Bulan | Minggu | Timeline, List | Board | Timeline, Aktif | Arsip, Terang | Gelap.

### 6.4 Chip

- **Filter area** (pill, tinggi 32 desktop / 36 HP): aktif = latar `--fg`, teks `--bg`; tidak aktif = border `--line2`, teks `--fg2`. Selalu diawali titik warna area.
- **Tanggal cepat** (Hari ini, Besok, Senin depan, Tanpa tanggal): gaya sama dengan filter area. Ada di Tambah Tugas dan di detail tugas.

### 6.5 Badge

- Prioritas: mono 600 10.5 px, latar `-soft`, teks warna prioritas, radius 6.
- PRO / DEMO PREVIEW: mono 600 9.5 px, latar `--accent-soft`, teks `--accent`, radius 4.

### 6.6 Kartu proyek

Latar `--surface`, border `--line`, radius 14 (desktop) / 16 (HP), padding 16–18. Isi: badge area, sisa hari, nama proyek (Display), jumlah tugas dan tenggat, progress bar 6 px warna proyek + persentase, avatar anggota.
Hover desktop: border menjadi `--line2`.

### 6.7 Progress

- Bar: tinggi 4 px (ringkasan Hari Ini di HP), 5–6 px (kartu dan detail proyek). Track `--surface2`, isi aksen atau warna proyek.
- Ringkasan Hari Ini di HP **satu baris**: bar + "3/7 selesai". Jangan menampilkan jumlah dan persentase sekaligus.

### 6.8 Navigasi bawah (HP)

- Tinggi 64 px ditambah `max(24 px, env(safe-area-inset-bottom))`: 88 px tanpa home indicator, 98 px di iPhone dengan home indicator. FAB, toast, dan padding bawah halaman ikut naik sebesar nilai yang sama. Empat menu: **Hari Ini · Inbox · Jadwal · Proyek**.
- Aktif: ikon di dalam pill 56 × 30 berlatar `--accent-soft`, ikon dan label `--accent`, label 600.
- Tidak aktif: tanpa pill, warna `--fg2`, label 500.
- Fitur terkunci (Pro) **tidak boleh** jadi menu utama.

### 6.9 FAB

58 × 58, radius 20, aksen, posisi kanan 20 px dan bawah 104 px (di atas navigasi). Membuka sheet Tambah Tugas. Tujuan dan tanggal bawaannya mengikuti halaman (lihat 6.12).

### 6.10 Bottom sheet (HP)

Latar `--surface`, radius atas 22, handle 38 × 5 di tengah, overlay `rgba(0,0,0,.38)`, animasi naik 0.28 detik. Tinggi maksimal 82 % layar. Tombol Simpan di bawah, Hapus di kiri dengan gaya Bahaya.
Dipakai untuk: detail tugas, tambah tugas, profil.

### 6.11 Panel detail (desktop)

Lebar 360 px di kanan, border kiri `--line`, label kiri 86 px dalam grid dua kolom. Jam diisi dengan `<input type="time">` dan bisa dihapus ("Hapus jam"). Tugas tanpa jam tetap sah.

### 6.12 Tambah tugas (composer)

Aturan: **tujuan dan tanggal bawaan mengikuti halaman, tapi selalu terlihat dan bisa diganti sebelum disimpan.**

| Dibuka dari | Tujuan bawaan | Tanggal bawaan |
|---|---|---|
| Hari Ini | Inbox | Hari ini |
| Inbox | Inbox, atau Inbox · Area jika chip area aktif | Tanpa tanggal |
| Jadwal | Inbox | Tanggal yang sedang dipilih |
| Detail proyek | Proyek itu › bagian pertama | Tanpa tanggal |
| Daftar Proyek | Inbox | Hari ini |

- Desktop: baris input + baris kecil "Ke [tujuan ▾] | chip tanggal | chip prioritas". HP: sheet Tambah Tugas dengan urutan judul → Ke → tanggal → prioritas → Simpan.
- Pemilih tujuan: daftar bergrup **INBOX** (tanpa area, per area) dan **PROYEK** (proyek, lalu bagian di bawahnya, menjorok). Terbuka di tempat, bukan pop-up melayang.
- Setelah disimpan muncul toast "Ditambahkan ke [tujuan] · [tanggal]", supaya pengguna tahu tugasnya ke mana walau tidak terlihat di halaman ini.
- Di desktop, tujuan dan tanggal tetap setelah menambah (untuk mencatat beruntun). Di HP, sheet ditutup dan semuanya kembali ke bawaan. Pindah halaman selalu mengembalikan ke bawaan.

**Lokasi di detail tugas** memakai pemilih yang sama, jadi tugas bisa dipindah dari Inbox ke proyek, antarbagian, atau antararea. Masuk ke proyek bersama: PIC tetap jika ia anggota, kalau tidak jadi "Anda". Keluar dari proyek: PIC dan bagian dikosongkan.

### 6.13 Proyek baru

Tombol "+ Proyek baru" (desktop) / "+ Baru" (HP) di halaman Proyek. Desktop: modal 440 px. HP: bottom sheet.
Isian: nama (wajib), area (wajib, bawaan = filter area yang aktif atau Kuliah; warna proyek mengikuti area), tenggat (1/2/3 minggu). Tanggal mulai = hari ini. Menampilkan sisa kuota "x dari 5 slot". Kuota penuh: tombol menjadi "Kuota penuh" dan pesan merah. Setelah dibuat, langsung membuka detail proyek itu.

### 6.14 Kelola proyek

Tombol "Kelola" di header detail proyek. Desktop: modal 480 px. HP: bottom sheet (maks. 86 % tinggi).
- Perubahan **langsung tersimpan** (sama seperti detail tugas). Tombol "Selesai" hanya menutup.
- Isian: nama, area (termasuk "Tanpa area"; warna proyek ikut warna area), tanggal mulai dan tenggat (`<input type="date">`; mulai tidak boleh melewati tenggat).
- Bagian: ganti nama di tempat (tugas ikut pindah nama bagian), hapus (tugasnya jadi "Tanpa bagian"), tambah bagian baru.
- Zona bawah: "Arsipkan proyek" / "Kembalikan dari arsip", lalu "Hapus proyek" dengan konfirmasi dua langkah yang menyebut jumlah tugas yang ikut terhapus.
- Proyek yang diarsipkan menampilkan banner "Proyek ini diarsipkan…" + tombol Kembalikan. Mengembalikan ditolak jika 5 proyek aktif sudah penuh.

### 6.15 Kelola area

Dibuka dari "Kelola" di samping label AREA (sidebar desktop) atau menu profil (HP).
- Tiap baris: tombol warna (ketuk untuk berganti di antara 6 warna), nama (ubah di tempat), jumlah "x tugas · y proyek", hapus.
- Hapus area yang masih dipakai meminta konfirmasi; tugas dan proyeknya menjadi "Tanpa area". Area kosong langsung terhapus.
- Area baru mendapat warna pertama yang belum dipakai.
- Palet area tambahan: `oklch(0.62 0.14 50)`, `oklch(0.6 0.11 195)`, `oklch(0.6 0.15 0)` (penanda saja, bukan teks).

### 6.16 Toast dan Urungkan

Toast biasa tampil 2,6 detik. Aksi yang menghapus atau menyembunyikan data (hapus tugas, hapus bagian, hapus area, arsipkan dan hapus proyek) **tidak meminta konfirmasi tambahan** kecuali dampaknya besar, tetapi selalu menampilkan toast 6 detik dengan tombol **Urungkan**. Urungkan mengembalikan tugas, proyek, dan area ke keadaan tepat sebelum aksi.

### 6.17 Pilih tanggal

Selain chip cepat, setiap isian tanggal (detail tugas, proyek baru, kelola proyek) punya `<input type="date">` untuk tanggal bebas.

### 6.18 Paket Gratis dan Pro

| Fitur | Gratis | Pro (sekali bayar) | Di mana dikunci |
|---|---|---|---|
| Proyek aktif | 5 | Tanpa batas | Proyek baru, Kembalikan dari arsip |
| Timeline | Terkunci | ✓ | Jadwal › Timeline, detail proyek › Timeline |
| Tugas berulang | Harian, Mingguan | + Hari kerja, Bulanan | Detail tugas › Ulangi |
| Durasi tugas | — | 15 mnt–3 jam | Detail tugas › Durasi |
| Warna aksen | Indigo | 4 pilihan | Profil › Warna aksen |

Mode Demo membuka semua fitur Pro dengan label DEMO PREVIEW.

**Pola fitur terkunci:** fitur Pro **tetap terlihat** dengan badge PRO, tidak disembunyikan. Mengetuknya membuka layar Pro dengan kotak konteks ("Timeline termasuk di Pro…") dan baris tabel yang relevan ditandai. Fitur terkunci **tidak** dijadikan menu utama.

**Layar Pro:** desktop modal 560 px, HP sheet 92 %. Isi: judul, kotak konteks (opsional), tabel Fitur | Gratis | Pro, harga, tombol "Beli Pro" (aksen), "Nanti saja", catatan pembayaran (web atau Google Play, status Pro tersimpan di akun). Pengguna Pro melihat "Pro sudah aktif" tanpa tombol beli. Harga Rp99.000 di prototipe hanya contoh.

### 6.19 Tugas berulang dan durasi

- **Ulangi:** Tidak · Harian · Mingguan · Hari kerja · Bulanan. Menyalakan pengulangan pada tugas tanpa tanggal mengisi tanggalnya dengan hari ini.
- **Menyelesaikan tugas berulang** tidak mencoretnya. Tanggalnya maju ke kemunculan berikutnya yang belum lewat (siklus yang terlewat tidak menumpuk), lalu toast "Selesai. Diulang ke Senin, 30 Nov" dengan Urungkan.
- Tugas berulang ditandai "↻ Mingguan" di baris meta dan **tidak dihitung** dalam progres proyek.
- **Durasi:** Tanpa · 15 mnt · 30 mnt · 1 jam · 2 jam · 3 jam. Baris tugas menampilkan rentang jam ("10:00–12:00"). Di Mingguan tinggi blok = durasi (tanpa durasi dianggap 1 jam, minimal 22 px).

### 6.20 Akun

Satu layar masuk dengan empat keadaan: **Masuk**, **Daftar**, **Lupa kata sandi**, **Tautan terkirim**.
- Setiap isian punya label tertulis (bukan hanya placeholder) dan `autocomplete` yang benar.
- Error muncul di atas form, satu pesan, berlatar `--high-soft`: email tidak valid, kata sandi kosong, nama kosong, kata sandi < 8 karakter.
- Daftar menampilkan petunjuk panjang kata sandi yang berubah saat mengetik.
- Pesan reset **tidak membocorkan** apakah email terdaftar ("Kalau email ini terdaftar, tautan reset sudah dikirim").
- "Coba Mode Demo" hanya muncul di keadaan Masuk.

### 6.21 Pencarian

- Desktop: tombol "Cari cepat… ⌘K" di sidebar, atau ⌘K / Ctrl+K dari mana saja. Modal 600 px di atas. HP: ikon kaca pembesar di header Hari Ini, membuka layar penuh dengan tombol Batal.
- Mencari judul tugas, catatan, dan nama proyek. Hasil bergrup TUGAS (maks. 8, tugas belum selesai di atas) dan PROYEK (maks. 5). Hasil pertama disorot; Enter membukanya, Esc menutup.
- Membuka tugas → detail tugas. Membuka proyek → detail proyek.

### 6.22 Detail tugas: mulai dan pengingat

- **Mulai** (opsional) untuk tugas beberapa hari. Tenggat otomatis maju jika lebih awal dari mulai. Ditampilkan sebagai "4 hari".
- **Pengingat** berupa chip. Tugas berjam: 10 mnt, 30 mnt, 1 jam sebelum, H-1 09:00. Tugas tanpa jam: Hari H, H-1, H-3 pukul 09:00. Bawaan: 30 mnt sebelum (berjam) atau Hari H (tanpa jam). Gratis memilih satu (memilih chip lain menggantinya); Pro bisa beberapa. Tanpa tanggal: "Atur tanggal dulu".
- **Notifikasi:** pengingat muncul sebagai notifikasi sistem (judul = judul tugas, isi = "Hari ini, 14:00 · Nama proyek"). Mengetuknya membuka detail tugas itu. Selama izin belum diberikan, di bawah chip pengingat ada kotak `--surface2`: "Izinkan notifikasi supaya pengingat muncul di perangkat ini." + tombol **Izinkan**; bila diblokir: "Notifikasi diblokir. Izinkan lewat pengaturan situs di browser."; bila tidak didukung: "Browser ini belum mendukung notifikasi. Di iPhone, pasang TaskFlow ke layar utama dulu." Profil HP punya baris "Notifikasi pengingat" (Izinkan / Aktif / Diblokir / Tidak didukung). Izin hanya diminta lewat tombol, tidak pernah otomatis.
- Tanpa backend, pengingat hanya berbunyi selama TaskFlow terbuka (termasuk tab di latar). Pengingat yang terlewat lebih dari 15 menit dilewati, tidak dikirim terlambat. Tiap pengingat hanya dikirim sekali.
- **PIC saat menambah tugas:** kalau tujuan adalah proyek bersama, baris "PIC" berisi avatar anggota muncul di composer. Bawaan: Anda.

### 6.23 Geser dan lepas (mouse)

- Board: kartu digeser antarkolom untuk mengganti status.
- Bulan: chip tugas digeser ke tanggal lain. Tugas dengan tanggal mulai ikut bergeser utuh.
- Minggu: blok digeser ke jam dan hari lain (dibulatkan 15 menit); digeser ke baris Sepanjang hari untuk menghapus jamnya.
- Target yang sedang dilewati berlatar `--accent-soft` (Board juga garis putus-putus aksen). Setiap pemindahan memunculkan toast dengan Urungkan.
- Tidak bisa digeser: tenggat proyek, tugas selesai, jadwal berulang yang akan datang. HP tetap memakai tombol (Mulai → / Selesai →) dan pilihan tanggal.
- Perangkat sentuh dengan layar lebar (iPad, tablet Android) memakai tata letak desktop, tetapi Timeline mengikuti aturan HP: batang hanya bisa digeser setelah "Ubah jadwal".

### 6.24 Jadwal berulang yang akan datang

Kemunculan berikutnya tugas berulang tampil di Bulan dan Minggu sebagai chip/blok **samar** (transparan, garis tepi, awalan ↻, opasitas 50 %). Mengetuknya membuka tugas aslinya. Di HP muncul di bagian "AKAN BERULANG" dengan bingkai putus-putus.

### 6.25 Bagikan proyek

Tombol "Bagikan" di header detail proyek (desktop dan HP).
- Tautan undangan + Salin + Reset tautan (tautan lama langsung tidak berlaku).
- Anggota: kuota "x dari 3" (Gratis) atau "x dari 20" (Pro) dengan bar; pemilik tidak bisa dikeluarkan; mengeluarkan anggota mengembalikan tugasnya ke pemilik, dengan Urungkan.
- Kuota penuh: pesan + "Lihat Pro" (Gratis). Pratinjau halaman undangan menunjukkan apa yang dilihat teman, termasuk keadaan "Proyek ini sudah penuh".
- Riwayat aktivitas (Pro): tambah tugas, ganti status, selesai, anggota bergabung/dikeluarkan.

### 6.26 Keadaan kosong dan akun baru

Akun baru dari Daftar mulai **kosong** (area yang dipilih di 6.29 tetap ada). Hari Ini menampilkan kartu sambutan dengan 3 langkah (catat tugas, buat proyek, cek area) yang tercentang otomatis dan bisa dilewati. Setiap halaman punya keadaan kosong sendiri yang menjelaskan apa yang akan muncul dan memberi satu aksi: Hari Ini (Buka Inbox), Inbox, Proyek (+ Proyek baru), Arsip, detail proyek.

### 6.27 Tampilan Mingguan

**Desktop:** kisi 7 kolom (Senin sampai Minggu) dengan kolom jam 56 px di kiri.
- Baris atas (lengket saat scroll): nama hari mono + tanggal. Hari ini = pill aksen, hari terpilih = pill `--surface2`.
- Baris **Sepanjang hari**: tugas tanpa jam dan tenggat proyek, dengan gaya chip yang sama seperti kalender bulanan.
- Kisi jam 07:00–23:00, **48 px per jam**, garis jam `--line`. Sabtu dan Minggu berlatar `--hover`.
- Blok tugas berjam: tinggi 1 jam (tugas belum punya durasi), border kiri 3 px warna proyek/area, latar warna itu 16 % di atas `--surface`, judul 12 px 600 dan jam mono. Tugas di jam yang sama dibagi lebar kolom secara rata. Tugas selesai: opasitas 50 % dan dicoret.
- Garis "sekarang" 2 px aksen dengan titik di kolom hari ini.

**HP:** tidak memakai kisi jam, karena 7 kolom di layar 390 px terlalu sempit untuk dibaca.
- Strip 7 hari (huruf hari, tanggal 38 × 38 radius 12, maksimal 3 titik prioritas).
- Di bawahnya agenda hari terpilih: **Sepanjang hari**, lalu **Berjam** dengan kolom jam 48 px dan garis warna proyek di kiri setiap tugas.

---

### 6.28 Perangkat dan platform

- **Ukuran layar:** HP < 768 px (navigasi bawah). Tablet 768–1099 px: sidebar tetap, **panel detail melayang** di kanan di atas isi (latar gelap tipis, ketuk di luar untuk menutup). Laptop ≥ 1100 px: panel detail menjadi kolom 360 px seperti biasa.
- **Jenis input** ditentukan dari `pointer: coarse`, bukan dari lebar layar. Perangkat sentuh: isian teks minimal 16 px (mencegah zoom otomatis di iOS Safari), dan geser-batang Timeline memakai mode "Ubah jadwal". Jangan memakai `maximum-scale=1`, karena mematikan zoom aksesibilitas.
- **Safe-area:** navigasi bawah, FAB, dan toast memakai `env(safe-area-inset-bottom)`. Tinggi layar memakai `dvh`, bukan `vh`.
- **PWA:** bisa dipasang ke layar utama (`manifest.webmanifest`, tampilan `standalone`, warna latar/tema `--bg` terang). Service worker (`public/sw.js`, hanya di build produksi) menyimpan aplikasi sejak kunjungan pertama, jadi TaskFlow tetap terbuka tanpa internet; halaman diambil dari jaringan dulu supaya versi baru langsung tampil.
- **Pintasan:** label ditulis ⌘K di Mac, iPhone, dan iPad; Ctrl+K di Windows, Linux, dan Android. Keduanya tetap berfungsi di semua platform.

### 6.29 Pilih area awal

Langkah kedua di layar Daftar (setelah nama, email, kata sandi lolos): "Pilih area yang kamu jalani". Chip area (`Chip`, bisa lebih dari satu): **Kuliah, Kantor, Pribadi** (tercentang bawaan), **Sekolah, Usaha, Organisasi**; masing-masing memakai warna `AREA_COLORS` di urutan yang sama. Minimal satu area ("Pilih minimal satu area."). Tombol utama "Lanjut", tautan "‹ Kembali" (isian tetap terisi) dan "Lewati" (memakai 3 area bawaan). Tidak memakan kuota proyek. Area tetap bisa diubah di Kelola area.

### 6.30 Tugas panduan

Akun baru mendapat 3 tugas panduan di Inbox (`guideTasks()` di `seed.ts`), **tanpa tanggal** (tidak pernah jadi Terlambat), prioritas Sedang, ditandai `guide`, masing-masing dengan catatan penjelasan: centang tugas, buka detail, hapus tugas. Di perangkat sentuh ada tugas keempat (urutan kedua): "Usap tugas ini ke kanan atau ke kiri". Kartu sambutan tetap ada; langkah "Catat tugas pertama" hanya tercentang oleh tugas buatan sendiri. Di bawah langkah-langkah ada baris "x tugas panduan menunggu di Inbox" + Buka Inbox + "Hapus semua panduan" (toast dengan Urungkan). Tidak ada proyek panduan (kuota 5 proyek tidak terpakai).

### 6.31 Usap baris tugas (perangkat sentuh)

Istilahnya **usap**, karena "geser" sudah berarti "Geser ke Hari Ini". Hanya aktif bila `pointer: coarse` (mouse tidak pernah mengusap). Usap ke kanan = Selesai (atau "Belum selesai" untuk tugas selesai). Usap ke kiri = membuka dialog **Jadwalkan** (Hari ini · Besok · Senin depan · Pilih tanggal; `Sheet` di HP, `Modal` di tablet), lalu `moveDue` dengan toast Urungkan. Ambang 35 % lebar baris; di bawahnya baris kembali. Label aksi tampil di celah yang terbuka, redup sebelum ambang dan penuh setelahnya. Gerak vertikal di atas 10 px membatalkan usap supaya daftar tetap bisa digulir. Latar aksi memakai token (`--low-soft`, `--accent-soft`) dengan label teks. Tidak aktif di 20 px tepi kiri (gestur kembali iOS), di Timeline, dan di kisi Minggu. Semua aksi juga tersedia lewat tombol atau detail tugas.

### 6.32 Gerak, suara, dan getaran

- Gerak memakai token `--dur-*` dan `--ease-*` (otomatis 0 saat `prefers-reduced-motion`). Centang: lingkaran memantul 0.85→1.1→1 (`animate-pop`, `--dur-sheet`) hanya saat user mencentang, bukan saat baris yang sudah selesai muncul; warna lingkaran dan judul berganti halus. Progress bar beranimasi dengan `--dur-bar`. Tanpa konfeti.
- Suara: satu bunyi lembut (sekitar 0,2 detik, dibuat dengan Web Audio tanpa file) saat tugas selesai lewat centang, usap, Board, atau status. **Mati secara bawaan.** Sakelar Mati/Nyala (`Segmented`): "Suara saat selesai" di profil HP, "Suara" di sidebar desktop. Perilaku terhadap tombol senyap iPhone perlu diuji di perangkat.
- Getaran: 12 ms saat tugas selesai, 8 ms saat ambang usap terlewati. **Mati secara bawaan.** Sakelar "Getaran" di profil HP hanya muncul di perangkat sentuh yang mendukung Vibration API. Web: Vibration API (Android). iOS Safari tidak mendukung; getaran iOS menunggu paket Capacitor.

## 7. Struktur navigasi

| Menu | Isi |
|---|---|
| **Hari Ini** | Terlambat (dengan tombol geser), Fokus Utama (prioritas Tinggi), Tugas lain, Proyek aktif (desktop) |
| **Inbox** | Semua tugas di luar proyek, difilter per area. Dibagi "Belum dijadwalkan" dan "Terjadwal" |
| **Jadwal** | Bulan, Minggu, dan Timeline (Pro). Navigasi ‹ Hari ini › per bulan atau per minggu. Hari yang dipilih dipakai bersama oleh Bulan dan Minggu |
| **Proyek** | Kartu proyek, filter area, Aktif / Arsip. Detail proyek: List, Board, Timeline |

Profil (avatar kanan atas di HP, bawah sidebar di desktop): tema, kelola area, TaskFlow Pro, Keluar. **Avatar tidak boleh langsung keluar akun.**

Timeline di HP hanya-baca secara bawaan. Batang baru bisa digeser setelah menekan "Ubah jadwal", supaya scroll horizontal tidak memindah jadwal secara tidak sengaja.

---

## 8. Bahasa dan penulisan

- Seluruh antarmuka berbahasa Indonesia. Pengecualian: istilah yang sudah umum dipakai apa adanya, yaitu **Inbox**, **Timeline**, **Board**, **List**, **Pro**.
- Status: **Belum · Dikerjakan · Selesai**. Prioritas: **Tinggi · Sedang · Rendah**.
- Gunakan "proyek", bukan "project"; "arsip", bukan "archives"; "bagian", bukan "section"; "bersama", bukan "shared"; "bagikan", bukan "share".
- Kalimat bantuan pendek dan tidak menyalahkan: "Tidak apa-apa. Pindahkan ke hari ini dan lanjutkan."
- Huruf kapital mono hanya untuk label bagian, bukan untuk kalimat.

---

## 9. Aksesibilitas (wajib)

- Teks 4,5:1 di semua ukuran di bawah 24 px, di mode terang dan gelap.
- Warna tidak boleh jadi satu-satunya pembeda. Prioritas selalu disertai label teks, dan area selalu disertai nama.
- Elemen yang bisa diklik memakai `<button>` atau `<a>`, bukan `div` dengan `onClick` (kecuali baris tugas, yang punya tombol centang sendiri).
- Area sentuh minimal 36 px di HP. Tombol utama 44–48 px.

---

## 10. Hal yang belum diputuskan

- Harga Pro (Rp99.000 di prototipe hanya contoh).
- Apakah durasi tugas tetap Pro, atau gratis dengan geser-blok sebagai fitur Pro.
- Pengecualian PRD: anggota Gratis di proyek milik pengguna Pro boleh membuka Timeline proyek itu (belum diterapkan; di prototipe Anda selalu pemilik).
- Overlay Google Calendar (dijanjikan di tabel Pro, belum ada desainnya).

---

## Riwayat perubahan

- **0.10 (25 Nov 2026):** Logo "Cincin terbuka" (5.1), favicon, dan ikon aplikasi.
- **0.9 (25 Nov 2026):** Perangkat dan platform (tablet, sentuh, safe-area, pintasan per platform). Rencana: pilih area awal, tugas panduan, usap baris, gerak/suara/getaran.
- **0.8 (25 Nov 2026):** Tanggal mulai, pengingat, PIC saat menambah, geser-dan-lepas desktop, jadwal berulang di kalender, alur Bagikan + riwayat aktivitas, keadaan kosong dan sambutan akun baru.
- **0.7 (25 Nov 2026):** Paket Gratis/Pro dan layar Pro, Timeline terkunci, tugas berulang, durasi tugas, warna aksen di profil, layar Daftar/Lupa kata sandi, pencarian ⌘K.
- **0.6 (25 Nov 2026):** Kelola proyek (ubah, bagian, arsip, hapus), Kelola area, toast Urungkan, pemilih tanggal bebas. Area kini data yang bisa diubah, bukan konstanta.
- **0.5 (25 Nov 2026):** Composer tambah tugas dengan pemilih tujuan dan tanggal yang terlihat; Lokasi di detail tugas bisa diubah; toast konfirmasi; Proyek baru dengan kuota.
- **0.4 (25 Nov 2026):** Folder `tokens/` (JSON, CSS, Tailwind v4). Aksen Teal diturunkan ke lightness 0.47.
- **0.3 (25 Nov 2026):** Tampilan Mingguan (kisi jam di desktop, strip hari + agenda di HP). Jam tugas bisa diisi dan dihapus di detail tugas.
- **0.2 (25 Nov 2026):** `--fg3`, aksen, dan warna prioritas dipergelap agar lolos 4,5:1. Navigasi diganti menjadi Hari Ini · Inbox · Jadwal · Proyek. Timeline pindah ke dalam Jadwal dan detail proyek. Label diubah ke bahasa Indonesia. Ikon garis SVG menggantikan bentuk CSS. Ditambahkan sheet profil, chip tanggal cepat, navigasi bulan, dan mode "Ubah jadwal" di Timeline HP.
- **0.1 (23 Nov 2026):** Prototipe awal.
