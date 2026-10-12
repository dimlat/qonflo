# Mini Task Manager

Aplikasi internal kecil untuk membuat task, mengubah statusnya satu langkah demi satu langkah, dan membaca riwayat perubahan per task.

## Cara menjalankan

Butuh Node.js 20 atau lebih baru.

Jalankan backend dan frontend di dua terminal.

```bash
cd backend
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

- UI: http://localhost:5173
- API: http://localhost:3001

Frontend meneruskan permintaan `/api` ke backend lewat proxy Vite.

Test backend:

```bash
cd backend
npm test
```

## Arsitektur

Backend Express (TypeScript) terbagi empat lapisan:

- `domain` — status yang sah, daftar actor, dan validasi input. Tidak mengenal HTTP atau file.
- `services/task-service.ts` — create, update status, delete, dan pembacaan audit log.
- `store/json-store.ts` — menyimpan `data/tasks.json` dan `data/audit-logs.json`.
- `app.ts` — route HTTP tipis di atas service.

Frontend React (TypeScript) satu halaman. Form create, daftar task, dropdown actor, dan riwayat yang bisa dibuka per task. Peta status di UI menyalin aturan backend, tetapi backend tetap yang menolak perpindahan yang tidak sah.

```text
to_do → pending → in_progress → done
```

Perpindahan ke status yang sama diterima dan tidak menulis audit log. Lompat langkah dan mundur ditolak.

## Asumsi

- Field task minimum adalah `id`, `title`, `description`, `status`, `createdAt`, dan `updatedAt`. Status awal selalu `to_do`.
- Actor dipilih dari daftar tetap (`john.doe`, `jane.doe`, `alex.kim`). Tidak ada login.
- Audit log hanya mencatat perubahan status. Create dan delete tidak menulis log.
- Satu orang memakai aplikasi pada satu waktu. File JSON tidak dibuat untuk banyak penulis sekaligus.
- Waktu disimpan dalam UTC. UI menampilkannya dalam waktu lokal.

## Trade-off

- File JSON, bukan database. Data tetap ada setelah backend di-restart, tanpa dependensi tambahan. Yang dikorbankan adalah penulisan bersamaan dan pemakaian lebih dari satu proses.
- Dua file terpisah supaya menghapus task tidak ikut menghapus log. Penulisan diantrikan di dalam satu proses: status dan log disiapkan bersama, file log diganti, lalu file task diganti. Jika penggantian file task gagal, isi file log dikembalikan dan memori tidak diubah. Jendela yang tersisa adalah proses mati di antara dua `rename`.
- Tidak ada auth. Actor adalah pilihan di dropdown, jadi identitasnya tidak terbukti.
- UI hanya menawarkan status berikutnya. Itu membuat alur mudah diikuti, dan backend tetap memvalidasi kalau ada klien lain.

## Jika ada waktu lebih

- Ganti file JSON dengan penyimpanan transaksional (SQLite) supaya status dan log benar-benar satu transaksi.
- Tambah test UI untuk form, riwayat, dan konfirmasi hapus.
- Tampilkan riwayat task yang sudah dihapus di suatu tempat, karena lognya masih ada di API.

## Bagaimana audit log tidak ter-modifikasi?

Aplikasi tidak punya endpoint atau tombol untuk mengubah atau menghapus audit log. `TaskService.updateStatus` hanya menambahkan log ketika status benar-benar maju satu langkah. `deleteTask` hanya menghapus task. Store tidak menyediakan operasi edit log.

Jaminan ini berlaku untuk pemakaian lewat API. Seseorang yang bisa mengedit `data/audit-logs.json` di disk masih bisa mengubah file itu. Versi ini tidak mencoba menutup akses ke filesystem.

## Bagian mana yang paling berisiko jika dipakai banyak user?

Penyimpanan file JSON. Antrian penulisan hanya melindungi satu proses. Apa bila ada 2 proses bersamaan, bisa saling menimpa. Actor juga hanya nama yang dipilih user, jadi riwayat tidak bisa dipercaya sebagai identitas sungguhan kalau banyak orang memakainya.

## Apa yang direfactor lebih dulu jika sistem ini membesar?

Lapisan penyimpanan. Aturan status sudah terisolasi di `backend/src/domain/status.ts` dan bentuk audit log sudah kecil, jadi keduanya bisa tetap. Yang tidak akan bertahan adalah satu pasang file JSON: tidak ada transaksi lintas proses dan tidak ada banyak pembaca yang aman. Langkah pertama adalah mengganti `JsonStore` dengan penyimpanan yang bisa menulis task dan log dalam satu transaksi, tanpa mengubah kontrak API.

## Penggunaan AI

AI (Cursor) membantu menyusun struktur proyek, implementasi awal sesuai PRD, test API, dan draf README ini. Keputusan domain — alur status satu langkah, audit hanya saat status berubah, dua file JSON, dan actor tetap — dikunci di PRD sebelum kode ditulis.

Validasinya: `npm test` di backend menutup acceptance criteria API (create, tolak judul kosong, alur status, idempotent, tolak lompat/mundur/actor asing, hapus task tanpa menghapus log, dan data yang terbaca lagi dari disk). Alur UI dicek di browser: buat task, pindah status, buka riwayat, dan hapus task.
