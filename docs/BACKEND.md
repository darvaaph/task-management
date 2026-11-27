# TaskFlow — Rancangan Backend (Firebase)

Versi rancangan 0.1, 25 Nov 2026. Pilihan teknis ada di `PRD.md` §9.1; dokumen ini menjabarkan **cara** membangunnya. Belum ada kode backend. Kalau implementasi menemukan hal yang tidak cocok, perbarui dokumen ini dulu.

## 1. Prinsip

1. **Offline tetap jalan.** Firestore memakai `persistentLocalCache` (IndexedDB) dengan `persistentMultipleTabManager`. Membaca dan mengubah tugas, area, dan proyek milik sendiri bisa tanpa internet; perubahan diantrekan dan dikirim saat koneksi kembali.
2. **Server yang menentukan batas.** Semua aturan Gratis/Pro dicek di Security Rules atau Cloud Functions (PRD §3). Klien boleh menampilkan kunci lebih dulu, tapi tidak pernah jadi satu-satunya penjaga.
3. **Hemat baca.** Biaya Firestore dihitung per dokumen yang dibaca. Satu pengguna cukup mendengarkan: data dirinya, area dan tugas lepasnya, serta tugas di proyek aktif tempat ia menjadi anggota. Arsip hanya dimuat saat dibuka.
4. **Data pribadi tetap pribadi.** Area dan tugas lepas hanya bisa dibaca pemiliknya. Anggota proyek hanya melihat isi proyek itu (PRD §8, keamanan).
5. **Mode demo tetap lokal.** Demo tidak pernah menyentuh Firebase; `localStorage` seperti sekarang.

## 2. Struktur koleksi

```
users/{uid}                              profil, paket, penghitung, setelan
users/{uid}/areas/{areaId}               area milik pengguna
users/{uid}/tasks/{taskId}               tugas lepas (Inbox / area)
users/{uid}/reminders/{taskId}           pilihan pengingat pengguna untuk tugas proyek bersama
users/{uid}/notified/{yyyy-mm}           pengingat yang sudah dikirim (opsional, ganti account.notified)

projects/{projectId}                     data proyek + ringkasan untuk aturan
projects/{projectId}/members/{uid}       anggota: peran, area pilihan anggota, nama tampilan
projects/{projectId}/tasks/{taskId}      tugas di dalam proyek
projects/{projectId}/activity/{id}       riwayat aktivitas (ditulis Cloud Functions)

invites/{token}                          tautan undangan → proyek, dengan ringkasan publik untuk halaman undangan
purchases/{purchaseId}                   transaksi Xendit / Google Play (hanya Cloud Functions)
```

### 2.1 `users/{uid}`
| Field | Tipe | Ditulis oleh | Catatan |
|---|---|---|---|
| `name`, `photoURL`, `email` | string | Functions saat akun dibuat, nama boleh diubah klien | dari akun Google |
| `plan` | `'free' \| 'pro'` | **Functions saja** | |
| `proSource` | `'xendit' \| 'google_play' \| 'manual' \| null` | Functions saja | |
| `proSince` | timestamp \| null | Functions saja | |
| `activeOwned` | number | klien dalam batch yang divalidasi rules | jumlah proyek aktif milik sendiri (kuota 5) |
| `accent`, `theme`, `sound`, `haptics` | | klien | `accent` selain Indigo hanya bila `plan == 'pro'` |
| `onboarding`, `checkedAreas` | boolean | klien | kartu sambutan |
| `createdAt` | timestamp | Functions | |

### 2.2 `users/{uid}/areas/{areaId}`
`name`, `color`, `order`. Dibuat klien saat "Pilih area awal" setelah login Google pertama (DESIGN §6.29).

### 2.3 `users/{uid}/tasks/{taskId}` dan `projects/{pid}/tasks/{taskId}`
Bentuk sama dengan `Task` di `src/lib/types.ts`, ditambah `createdBy`, `createdAt`, `updatedAt`, `completedAt`:
`title, area, section, assignee, status, prio, start, due, time, dur, rec, notes, rems?, guide?`.
- Di tugas lepas, `area` = area milik pengguna; `rems` disimpan langsung di tugas.
- Di tugas proyek, `area` selalu `null` (area dipegang proyek / pilihan anggota) dan `rems` **tidak** disimpan di tugas, tetapi di `users/{uid}/reminders/{taskId}` supaya tiap anggota punya pengingat sendiri (PRD §5.5).
- Tanggal tetap string `YYYY-MM-DD` dan jam `HH:MM` seperti sekarang (zona waktu lokal, sesuai `lib/dates.ts`).

### 2.4 `projects/{projectId}`
| Field | Catatan |
|---|---|
| `ownerId` | pemilik |
| `name`, `color`, `start`, `due`, `sections[]`, `archived` | seperti `Project` sekarang |
| `ownerArea` | area pemilik (`projects.area_id` di PRD); tidak dipakai anggota lain |
| `memberIds[]` | daftar uid, untuk query `array-contains` dan pengecekan rules tanpa `get()` tambahan |
| `memberCount` | dijaga Functions |
| `ownerPlan` | salinan `plan` pemilik; diperbarui Functions saat pemilik upgrade. Menentukan kuota 3/20, Timeline proyek, dan riwayat aktivitas untuk semua anggota (PRD §5.4) |
| `inviteToken` | token aktif; dibaca pemilik dan anggota di Bagikan (keputusan pemilik 27 Nov 2026), hanya pemilik yang dapat membuat/meresetnya |

Kenapa ada salinan (`memberIds`, `ownerPlan`): Security Rules dibatasi beberapa `get()` per permintaan dan tiap `get()` dihitung sebagai baca. Menyimpan ringkasan di dokumen proyek membuat aturan cukup membaca satu dokumen.

### 2.5 `projects/{pid}/members/{uid}`
`role` (`owner` | `member`), `area` (area **milik anggota itu sendiri**, PRD §5.4), `name`, `photoURL`, `joinedAt`. Anggota boleh mengubah `area` miliknya saja.

### 2.6 `invites/{token}`
`projectId`, `ownerId`, `active`, `createdAt`, plus ringkasan untuk halaman undangan: `projectName`, `ownerName`, `memberCount`, `due`, `full`. Siapa pun yang login boleh **membaca satu dokumen** dengan token yang ia punya (`get`), tetapi tidak boleh **mendaftar** (`list`) semua undangan.

## 3. Alur data utama

### 3.1 Login pertama
1. Web/PWA: `signInWithPopup` (desktop) atau `signInWithRedirect` (HP) dengan `GoogleAuthProvider`. Android (Capacitor): plugin login Google native → kredensial → `signInWithCredential`. Google memblokir login OAuth di WebView, jadi jalur native wajib.
2. Function `onUserCreated` membuat `users/{uid}` (`plan: 'free'`, `activeOwned: 0`).
3. Klien menampilkan "Pilih area awal" (DESIGN §6.29) lalu menulis area yang dipilih dan tugas panduan (`guideTasks()`).
4. Kalau browser ini punya data lokal TaskFlow (bukan demo), tawarkan "Pindahkan data di perangkat ini ke akun Anda?" → tulis berkelompok (batch, maks. 500 tulisan per batch), proyek ikut aturan kuota.

### 3.2 Yang didengarkan klien
| Listener | Dipakai untuk |
|---|---|
| `users/{uid}` | paket, setelan, penghitung |
| `users/{uid}/areas` | sidebar, filter area |
| `users/{uid}/tasks` | Inbox, Hari Ini, Jadwal (tugas lepas) |
| `projects` where `memberIds array-contains uid` and `archived == false` | daftar proyek aktif |
| `projects/{pid}/tasks` untuk setiap proyek aktif | detail proyek, Hari Ini, Jadwal |
| `projects/{pid}/members` saat proyek dibuka | avatar, PIC, Bagikan |
| `users/{uid}/reminders` | pengingat tugas proyek |

Arsip dan riwayat aktivitas dimuat sekali saat dibuka (`getDocs`), bukan didengarkan.

`store.tsx` tetap jadi satu-satunya pintu data: aksi yang sekarang memanggil `setData` diganti menulis ke Firestore, dan state diisi dari listener. Komponen tidak berubah.

### 3.3 Membuat, mengarsipkan, memulihkan, menghapus proyek (kuota 5)
Dilakukan klien dalam **satu batch** yang juga mengubah `users/{uid}.activeOwned`; rules memeriksa hasilnya dengan `getAfter()`. Dengan begitu tetap bisa offline dan tidak bisa diakali.
- Buat: tulis `projects/{pid}` + `members/{uid}` (owner) + `activeOwned + 1`. Ditolak bila hasilnya > 5 dan pemilik bukan Pro.
- Arsipkan: `archived: true` + `activeOwned − 1`. Pulihkan: kebalikannya, kena kuota.
- Hapus: hapus proyek + `activeOwned − 1` (bila aktif). Subkoleksi (tugas, anggota, aktivitas) dibersihkan Function `onProjectDeleted`.
- Function terjadwal harian `reconcileCounters` menghitung ulang `activeOwned` sebagai jaring pengaman.

### 3.4 Undangan dan bergabung
1. Pemilik membuka Bagikan → bila belum ada token, klien membuat `invites/{token}` + `projects.inviteToken` dalam satu batch. **Reset tautan** = token lama `active: false`, token baru dibuat.
2. Teman membuka `/invite/{token}` → (login bila perlu, token disimpan sementara) → membaca `invites/{token}` untuk halaman undangan.
3. Tombol **Gabung proyek** memanggil callable Function `joinProject(token)`. Dalam satu transaksi: token aktif, belum anggota, `memberCount < (ownerPlan == 'pro' ? 20 : 3)` → tulis `members/{uid}`, tambah `memberIds`, `memberCount + 1`, perbarui ringkasan undangan.
4. Klien menampilkan "Masukkan ke area mana?" → menulis `members/{uid}.area` (DESIGN §6.25).
5. Mengeluarkan anggota: callable `removeMember(projectId, uid)` (pemilik saja) → hapus anggota, keluarkan dari `memberIds`, `memberCount − 1`, tugas yang PIC-nya orang itu dikembalikan ke pemilik.

Bergabung butuh internet (tidak bisa diverifikasi offline). Pesan: "Butuh koneksi internet untuk bergabung."

### 3.5 Riwayat aktivitas
Function `onProjectTaskWritten` (trigger tulis di `projects/{pid}/tasks/{taskId}`) menulis `activity` untuk: tambah tugas, ganti status, selesai. Bergabung/dikeluarkan ditulis oleh `joinProject` / `removeMember`. Disimpan selalu; **dibaca** hanya bila `ownerPlan == 'pro'`. Simpan 200 entri terakhir per proyek (Function memangkas yang lama).

### 3.6 Pro
- **Web (Xendit):** klien memanggil callable `createCheckout()` → Function membuat invoice Xendit (QRIS, e-wallet, VA) dan mengembalikan URL bayar. Webhook Xendit (HTTPS Function, dicek dengan token callback Xendit) → `purchases/{id}` `verified` → `users/{uid}.plan = 'pro'`.
- **Android (Google Play Billing):** plugin billing di Capacitor → token pembelian → callable `verifyPlayPurchase(token)` memeriksa ke Google Play Developer API → acknowledge → `plan = 'pro'`.
- Function `onPlanChanged` menyalin `ownerPlan` ke semua proyek milik pengguna itu.
- Halaman Pro membedakan jalur: di dalam aplikasi Android selalu Google Play Billing (PRD §6 skenario 2).

### 3.7 Pengingat
Web/PWA: seperti sekarang (`ReminderRunner`), hanya saat aplikasi terbuka. Android: jadwalkan ulang `@capacitor/local-notifications` setiap kali daftar tugas berubah, untuk tugas lepas dan tugas proyek di mana pengguna adalah PIC (atau pembuat bila tanpa PIC), PRD §5.5. Tidak memakai push server.

## 4. Security Rules (garis besar)

Bukan versi final; dipakai sebagai acuan saat menulis `firestore.rules` dan diuji dengan Firebase Emulator.

> **Peringatan (26 Nov 2026): jangan salin draf di bawah.** Bagian proyek dan undangannya punya celah keamanan, dijelaskan di §4.1. `firestore.rules` yang sudah dibangun di Fase 1 (bagian `users`, area, tugas, pengingat) lebih ketat daripada draf ini dan menjadi acuan untuk bagian tersebut.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function signedIn() { return request.auth != null; }
    function me() { return request.auth.uid; }
    function userDoc(uid) { return get(/databases/$(db)/documents/users/$(uid)).data; }
    function isPro(uid) { return userDoc(uid).plan == 'pro'; }
    // Fields only Cloud Functions may set.
    function touchesServerFields() {
      return request.resource.data.diff(resource.data).affectedKeys()
        .hasAny(['plan', 'proSource', 'proSince', 'createdAt', 'email']);
    }

    match /users/{uid} {
      allow read: if signedIn() && me() == uid;
      allow update: if signedIn() && me() == uid && !touchesServerFields()
        // Accent colours other than Indigo are Pro.
        && (request.resource.data.accent == 'indigo' || isPro(uid))
        // activeOwned may only move by 1 and never past the free quota.
        && (request.resource.data.activeOwned <= 5 || isPro(uid));
      allow create, delete: if false; // Functions only

      match /areas/{id}     { allow read, write: if signedIn() && me() == uid; }
      match /reminders/{id} {
        allow read, delete: if signedIn() && me() == uid;
        allow write: if signedIn() && me() == uid
          // Project-task reminders follow the project owner's plan; check ownerPlan via the task's project in the final rules.
          && (request.resource.data.keys.size() <= 1 || isPro(uid));
      }
      match /tasks/{id} {
        allow read, delete: if signedIn() && me() == uid;
        allow create, update: if signedIn() && me() == uid && validTask(uid);
      }
    }

    // Pro-only task fields: duration, weekday/monthly repeat, more than one reminder.
    function validTask(uid) {
      let t = request.resource.data;
      return t.title is string && t.title.size() > 0 && t.title.size() <= 300
        && (t.dur == null || isPro(uid))
        && (t.rec == null || t.rec in ['daily', 'weekly'] || isPro(uid))
        && (!('rems' in t) || t.rems.size() <= 1 || isPro(uid));
    }

    match /projects/{pid} {
      function p() { return resource.data; }
      function member() { return signedIn() && me() in p().memberIds; }
      function owner() { return signedIn() && p().ownerId == me(); }

      allow read: if member();
      // Created together with the owner's counter in one batch.
      allow create: if signedIn() && request.resource.data.ownerId == me()
        && request.resource.data.memberIds == [me()]
        && getAfter(/databases/$(db)/documents/users/$(me())).data.activeOwned
             == userDoc(me()).activeOwned + 1;
      allow update: if owner()
        && !request.resource.data.diff(p()).affectedKeys().hasAny(['ownerId', 'memberIds', 'memberCount', 'ownerPlan']);
      allow delete: if owner();

      match /members/{uid} {
        allow read: if signedIn() && me() in get(/databases/$(db)/documents/projects/$(pid)).data.memberIds;
        // A member may only change their own area; joining/leaving goes through Functions.
        allow update: if signedIn() && me() == uid
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['area']);
        allow create: if signedIn() && me() == uid && uid == get(/databases/$(db)/documents/projects/$(pid)).data.ownerId;
        allow delete: if false;
      }
      match /tasks/{id} {
        function proj() { return get(/databases/$(db)/documents/projects/$(pid)).data; }
        allow read, delete: if signedIn() && me() in proj().memberIds;
        // Pro task fields follow the project owner's plan.
        allow create, update: if signedIn() && me() in proj().memberIds && validTask(proj().ownerId);
      }
      match /activity/{id} {
        allow read: if signedIn() && me() in get(/databases/$(db)/documents/projects/$(pid)).data.memberIds
          && get(/databases/$(db)/documents/projects/$(pid)).data.ownerPlan == 'pro';
        allow write: if false; // Functions only
      }
    }

    match /invites/{token} {
      allow get: if signedIn();
      allow list: if false;
      allow create, update: if signedIn() && request.resource.data.ownerId == me();
      allow delete: if false;
    }

    match /purchases/{id} { allow read, write: if false; }
  }
}
```

Catatan yang harus diputuskan saat menulis rules final:
- **Diputuskan (25 Nov 2026):** fitur Pro di tugas proyek (durasi, ulangi Hari kerja/Bulanan, lebih dari satu pengingat) mengikuti paket **pemilik proyek**, konsisten dengan Timeline proyek (PRD §5.4). Anggota Gratis di proyek milik pengguna Pro boleh memakainya di proyek itu. Pengingat tetap disimpan per anggota, jadi batasnya juga mengikuti `ownerPlan` proyek untuk tugas proyek.
- Pengecekan `activeOwned` di `users` perlu dipasangkan dengan `existsAfter` / `getAfter` pada proyek supaya penghitung tidak bisa diturunkan tanpa mengarsipkan proyek.

### 4.1 Celah di draf, wajib ditutup di Fase 2
1. **Pro palsu:** `projects` `create` tidak memeriksa `ownerPlan`, jadi klien bisa membuat proyek dengan `ownerPlan: 'pro'` (20 anggota dan fitur Pro). Wajib sama dengan `plan` asli di `users/{uid}`. `memberCount` harus 1, `memberIds` harus `[uid]`, `archived` harus `false`.
2. **Kuota 5 proyek bisa diakali:** `activeOwned` bisa diturunkan sendiri karena perubahannya tidak terikat pada perubahan proyek tertentu.
3. **Pulihkan arsip tanpa menambah hitungan:** `update` pemilik bisa mengubah `archived` tanpa `activeOwned` ikut berubah.
4. **Undangan bisa dibajak:** `invites` hanya memeriksa `ownerId` pada data baru, jadi pengguna lain bisa menimpa undangan yang sudah ada atau membuat undangan yang menunjuk proyek orang lain. `joinProject` juga wajib memeriksa `projects/{pid}.ownerId == invite.ownerId` dan `inviteToken == token`.
5. **Token bisa ditebak:** UI saat ini membuat token dari id proyek (`Share.tsx`). Token harus acak (`crypto.getRandomValues`, minimal 20 karakter).
6. **Pengingat tugas proyek:** dokumen `reminders/{taskId}` perlu `projectId` supaya aturan bisa membaca `ownerPlan` dan memastikan penulisnya anggota.
7. **Riwayat aktivitas butuh pelaku:** trigger Firestore tidak otomatis tahu siapa penulisnya. Tugas proyek wajib menyimpan `updatedBy`, yang dipaksa aturan sama dengan `request.auth.uid`.
8. **Dokumen anggota:** `members` `create` harus membatasi field dan `role`.

## 5. Cloud Functions

| Function | Jenis | Tugas |
|---|---|---|
| `onUserCreated` | Auth trigger | buat `users/{uid}` |
| `joinProject` | callable | validasi token + kuota anggota, tambah anggota (§3.4) |
| `removeMember` | callable | keluarkan anggota, kembalikan tugasnya (§3.4) |
| `onProjectTaskWritten` | Firestore trigger | tulis riwayat aktivitas (§3.5) |
| `onProjectDeleted` | Firestore trigger | hapus subkoleksi dan undangan |
| `onPlanChanged` | Firestore trigger di `users/{uid}` | salin `ownerPlan` ke proyek milik pengguna |
| `createCheckout` | callable | buat invoice Xendit |
| `xenditWebhook` | HTTPS | verifikasi callback Xendit, aktifkan Pro |
| `verifyPlayPurchase` | callable | verifikasi pembelian Google Play, aktifkan Pro |
| `reconcileCounters` | terjadwal harian | hitung ulang `activeOwned` dan `memberCount` |

Rahasia (kunci Xendit, akun layanan Google Play) disimpan di Secret Manager lewat `defineSecret`, tidak pernah di kode klien.

Catatan runtime: seluruh Cloud Functions dijalankan di region `asia-southeast2` (Jakarta) mengikuti Firestore. Dukungan runtime Node 24 di Cloud Functions harus diperiksa sebelum deploy pertama (belum diverifikasi).

## 6. Perkiraan biaya awal

Pengguna aktif biasa per hari: ±100–300 baca (listener awal + perubahan) dan ±20–50 tulis. Kuota gratis harian Firestore (cek angka terbaru di halaman harga Firebase) cukup untuk ratusan pengguna aktif per hari. Function berjalan per undangan, pembayaran, dan perubahan tugas proyek. Pasang **peringatan anggaran** di Google Cloud sejak hari pertama.

## 7. Urutan pengerjaan

1. Proyek Firebase + Emulator Suite lokal, `firebase.json`, aturan awal, CI uji rules. *(perlu: proyek Firebase dibuat pemilik)*
2. Login Google (web) + `onUserCreated` + Pilih area awal + tawaran pindah data lokal. Layar Masuk baru (DESIGN §6.20).
3. `store.tsx` pindah ke Firestore untuk area dan tugas lepas, dengan cache offline. Demo tetap lokal.
4. Proyek, bagian, tugas proyek + kuota 5 (batch + `getAfter`).
5. Undangan, bergabung, keluarkan anggota, halaman `/invite/{token}`, "Masukkan ke area mana?".
6. Riwayat aktivitas, `ownerPlan`, Timeline proyek untuk anggota.
7. Xendit + halaman Pro sungguhan.
8. Capacitor Android: login native, notifikasi lokal, Google Play Billing, uji tertutup 12 penguji × 14 hari.

Setiap langkah: uji di Emulator dulu, lalu `npm run build`, cek di browser (desktop + HP, terang + gelap), perbarui `PROGRESS.md`.

## 8. Dependency baru (perlu persetujuan saat langkahnya tiba)

`firebase` (klien), `firebase-tools` (CLI, dev), paket Cloud Functions (`firebase-functions`, `firebase-admin`), `@capacitor/core`, `@capacitor/android`, `@capacitor/local-notifications`, plugin login Google native dan plugin Google Play Billing untuk Capacitor (dipilih dan dicek versinya saat langkah 8).
