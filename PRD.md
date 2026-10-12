# PRD: Mini Task Manager

Spec produk untuk aplikasi internal yang dipakai tim mengelola task sederhana, lengkap dengan riwayat perubahan status. Dokumen ini mengunci keputusan domain, API, dan UI supaya frontend dan backend dibangun konsisten.

Estimasi pengerjaan: 3–5 jam. Tidak ada satu solusi yang “benar”; yang dinilai adalah kejelasan, konsistensi, dan alasan di balik keputusan.

## 1. Latar belakang

Tim internal sering mengubah status task, tetapi tidak jelas siapa yang mengubah apa. Perubahan data sulit ditelusuri, dan UI yang ada tidak menjelaskan riwayat perubahan.

Yang dibutuhkan adalah aplikasi kecil yang membuat data task dan jejak perubahannya mudah dibaca.

## 2. Problem statement

Buat Mini Task Manager di mana user dapat:

- membuat task
- mengubah status task mengikuti alur yang ditentukan
- menghapus task
- melihat daftar semua task
- melihat riwayat perubahan status (audit log) per task

## 3. Tujuan

- Status task selalu mengikuti alur domain yang sama di frontend dan backend.
- Setiap perubahan status yang benar-benar terjadi meninggalkan audit log yang bisa menjawab: task mana, siapa yang mengubah, dari status apa ke status apa, dan kapan.
- Audit log tidak bisa diubah atau dihapus lewat aplikasi.
- Struktur kode jelas dan konsisten antara React (TypeScript) dan Express (TypeScript).

## 4. Non-goals

Di luar scope pengerjaan ini:

- autentikasi, sesi, dan role
- UI kompleks (drag-and-drop, filter lanjutan, notifikasi, dashboard)
- edit judul atau deskripsi setelah task dibuat
- audit untuk aksi selain perubahan status (create dan delete tidak menulis log)
- database, antrian, atau infrastruktur multi-instance

## 5. Aktor

Tidak ada login. Actor adalah user yang dipilih dari daftar tetap lewat dropdown, lalu dikirim bersama permintaan ubah status.

Daftar actor:

| id | label |
| --- | --- |
| `john.doe` | john.doe |
| `jane.doe` | jane.doe |
| `alex.kim` | alex.kim |

Actor wajib ada pada update status. Actor tidak dipakai pada create atau delete.

## 6. User stories

1. Sebagai anggota tim, saya ingin membuat task dengan judul (dan deskripsi opsional) supaya pekerjaan tercatat. Status awal selalu `to_do`.
2. Sebagai anggota tim, saya ingin melihat semua task dalam satu daftar supaya status masing-masing terlihat jelas.
3. Sebagai anggota tim, saya ingin mengubah status task satu langkah maju, dengan memilih siapa yang melakukan perubahan, supaya alur kerja tetap teratur.
4. Sebagai anggota tim, saya ingin sistem menolak perubahan status yang melompat atau mundur, supaya data tidak menyimpang dari alur.
5. Sebagai anggota tim, saya ingin menghapus task yang tidak lagi dipakai, tanpa menghilangkan riwayat status yang sudah tercatat.
6. Sebagai anggota tim, saya ingin membuka riwayat satu task dan membaca perubahan dari yang paling lama ke yang paling baru.

## 7. Domain model

### 7.1 Task

| Field | Tipe | Aturan |
| --- | --- | --- |
| `id` | string (UUID) | Dibuat server. Tidak bisa diubah klien. |
| `title` | string | Wajib. Dipangkas spasi. Panjang 1–120 karakter setelah trim. |
| `description` | string | Opsional. Kosong disimpan sebagai string kosong. Maksimum 500 karakter. |
| `status` | enum | Salah satu: `to_do`, `pending`, `in_progress`, `done`. Saat create selalu `to_do`. |
| `createdAt` | string ISO 8601 | Diisi server. |
| `updatedAt` | string ISO 8601 | Diisi server. Berubah hanya ketika status benar-benar berubah. |

Task tidak punya field actor. Actor hanya hidup di audit log.

### 7.2 Audit log

| Field | Tipe | Aturan |
| --- | --- | --- |
| `id` | string (UUID) | Dibuat server. |
| `taskId` | string | Id task yang berubah. Tetap valid setelah task dihapus. |
| `taskTitle` | string | Judul task pada saat perubahan, disalin ke log supaya riwayat tetap terbaca setelah task dihapus. |
| `actor` | string | Salah satu id di daftar actor. |
| `fromStatus` | enum status | Status sebelum perubahan. |
| `toStatus` | enum status | Status sesudah perubahan. |
| `createdAt` | string ISO 8601 | Waktu perubahan, diisi server. |

Contoh bacaan untuk user:

> User "john.doe" changed Task "Prepare Invoice" status from "pending" to "in_progress" at 2025-01-01 10:00

UI merender kalimat itu dari field di atas. Backend menyimpan field terstruktur, bukan kalimat jadi.

## 8. State machine status

Perubahan yang sah hanya satu langkah maju:

```text
to_do → pending → in_progress → done
```

| Dari | Ke | Hasil |
| --- | --- | --- |
| `to_do` | `pending` | Diterima. Tulis audit log. |
| `pending` | `in_progress` | Diterima. Tulis audit log. |
| `in_progress` | `done` | Diterima. Tulis audit log. |
| status apa pun | status yang sama | Diterima sebagai no-op. Task dikembalikan apa adanya. Tidak ada audit log. `updatedAt` tidak berubah. |
| lainnya (lompat, mundur, nilai tidak dikenal) | | Ditolak. HTTP 400. Task dan log tidak berubah. |

`done` tidak punya langkah berikutnya. Meminta `done → done` tetap no-op idempotent.

Validasi alur wajib di backend. Frontend boleh menyembunyikan pilihan yang tidak sah, tetapi bukan sumber kebenaran.

## 9. Aturan audit log

- Audit log hanya dibuat ketika status benar-benar berpindah ke langkah berikutnya.
- Create task dan delete task tidak membuat audit log.
- Tidak ada operasi update atau delete untuk audit log, lewat API maupun lewat UI.
- Update status tidak menghapus atau menimpa log lama. Log baru selalu ditambahkan.
- Delete task menghapus task dari daftar, dan tidak menyentuh log. `GET /tasks/:id/audit-logs` untuk id tersebut tetap mengembalikan log yang sudah ada.
- Daftar log untuk satu task diurutkan menaik berdasarkan `createdAt` (paling lama di atas). Jika waktu sama, urutkan berdasarkan `id` menaik supaya urutan stabil.
- Penulisan status baru dan audit log baru adalah satu operasi. Jika penulisan log gagal, status task tidak berubah.

## 10. Persistence

Data disimpan di dua file JSON di backend:

- `data/tasks.json` — daftar task
- `data/audit-logs.json` — daftar audit log

Alasan pilihan ini untuk scope 3–5 jam: data tetap ada setelah proses backend di-restart, tanpa memasang database. Kedua koleksi dipisah supaya menghapus task tidak ikut menghapus log.

Risiko yang diterima pada pilihan ini (concurrency dan satu proses saja) dicatat di bagian 15, dan tidak diselesaikan di versi ini.

## 11. API

Base path: `/api`. Response JSON. Waktu dalam ISO 8601 UTC.

### `GET /api/tasks`

Mengembalikan semua task, terbaru di atas (`createdAt` menurun).

```json
{
  "tasks": [
    {
      "id": "uuid",
      "title": "Prepare Invoice",
      "description": "",
      "status": "pending",
      "createdAt": "2025-01-01T09:00:00.000Z",
      "updatedAt": "2025-01-01T10:00:00.000Z"
    }
  ]
}
```

### `POST /api/tasks`

Body:

```json
{ "title": "Prepare Invoice", "description": "Optional" }
```

- `title` wajib, aturan sama dengan domain model.
- `description` opsional.
- Status di body diabaikan. Server selalu menyimpan `to_do`.
- Sukses: `201` dan objek task.
- Judul kosong atau terlalu panjang: `400`.

### `PUT /api/tasks/:id/status`

Body:

```json
{ "status": "in_progress", "actor": "john.doe" }
```

- Task tidak ditemukan: `404`.
- `actor` bukan anggota daftar: `400`.
- `status` tidak dikenal, melompat, atau mundur: `400`.
- `status` sama dengan status sekarang: `200`, task yang sama, tanpa audit log baru.
- Perpindahan satu langkah: `200`, task dengan status dan `updatedAt` baru, plus satu audit log baru.

Body error:

```json
{ "error": "Status can only move one step forward" }
```

Pesan error singkat dan stabil supaya frontend bisa menampilkannya.

### `DELETE /api/tasks/:id`

- Task ada: `204`, task hilang dari daftar, audit log tidak berubah.
- Task tidak ada: `404`.

### `GET /api/tasks/:id/audit-logs`

Mengembalikan log untuk `taskId` tersebut, urut kronologis menaik. Tetap `200` dengan `logs: []` jika task sudah dihapus tetapi tidak pernah punya log, atau jika task masih ada dan belum pernah berganti status. `404` hanya jika tidak ada task dan tidak ada satupun log untuk id itu — dengan kata lain, id tidak pernah dikenal.

Untuk menjaga API tetap sederhana: endpoint ini mengembalikan `200` dan array (boleh kosong) selama `taskId` berbentuk UUID. Tidak perlu membedakan “task belum punya log” dan “task sudah dihapus”.

```json
{
  "logs": [
    {
      "id": "uuid",
      "taskId": "uuid",
      "taskTitle": "Prepare Invoice",
      "actor": "john.doe",
      "fromStatus": "pending",
      "toStatus": "in_progress",
      "createdAt": "2025-01-01T10:00:00.000Z"
    }
  ]
}
```

### `GET /api/actors`

Mengembalikan daftar actor untuk dropdown. Sumbernya konstanta di backend, sama dengan validasi `actor` pada update status.

```json
{ "actors": ["john.doe", "jane.doe", "alex.kim"] }
```

## 12. Frontend

Satu halaman. Estetika tidak dinilai; yang dinilai adalah kejelasan.

- Daftar task: judul, status yang mudah dibedakan, dan waktu update.
- Form create: judul (wajib) dan deskripsi (opsional). Setelah sukses, task baru muncul di daftar dengan status `to_do`.
- Pada tiap task yang belum `done`: kontrol untuk mengajukan status berikutnya saja, plus dropdown actor. Contoh: task `pending` hanya menawarkan `in_progress`.
- Task `done` tidak menampilkan kontrol pindah status.
- Tombol hapus pada tiap task, dengan konfirmasi singkat sebelum menghapus.
- Riwayat per task dibuka sebagai bagian yang bisa diperluas (expandable) di baris task itu. Isi tiap baris log mengikuti kalimat contoh di bagian 7.2, urut dari yang paling lama.
- Task tanpa log menampilkan keadaan kosong yang menjelaskan bahwa status belum pernah berubah.
- Error dari backend (validasi status, actor, judul) ditampilkan di dekat aksi yang gagal.
- Frontend tidak mengirim perpindahan yang melanggar alur. Backend tetap memvalidasi.

Label status yang ditampilkan:

| nilai | label |
| --- | --- |
| `to_do` | To do |
| `pending` | Pending |
| `in_progress` | In progress |
| `done` | Done |

## 13. Non-functional requirements

- **Idempotent update.** Mengirim status yang sama berulang kali tidak menambah audit log dan tidak mengubah `updatedAt`.
- **Konsistensi.** Status task dan audit log selalu sejalan: tidak ada perpindahan status tanpa log, dan tidak ada log tanpa perpindahan yang benar-benar terjadi.
- **Persistence.** Data bertahan selama file JSON tidak dihapus, termasuk setelah backend di-restart.
- **Validasi domain di backend.** Frontend opsional sebagai bantuan, bukan pengganti.
- **Tidak overengineering.** Tanpa auth, role, dan UI yang rumit.

## 14. Acceptance criteria

1. Create task dengan judul valid menghasilkan task `to_do` dan tidak menghasilkan audit log.
2. Create tanpa judul ditolak.
3. Daftar menampilkan semua task yang masih ada.
4. `to_do → pending → in_progress → done` masing-masing menghasilkan tepat satu audit log, dengan actor, judul task, from, to, dan waktu.
5. Meminta status yang sama dua kali hanya menghasilkan nol log baru pada permintaan kedua.
6. `to_do → in_progress`, `done → pending`, dan status yang tidak dikenal ditolak. Task dan log tetap seperti sebelum permintaan.
7. Actor di luar daftar ditolak. Tidak ada log baru.
8. Hapus task menghilangkan task dari daftar. Meminta log task itu masih mengembalikan log yang sudah tertulis.
9. Log ditampilkan dari yang paling lama ke yang paling baru.
10. Setelah backend di-restart, task dan log yang sudah tersimpan masih ada.

## 15. Asumsi

- Daftar field task pada brief asli tidak lengkap, jadi field minimum dikunci seperti bagian 7.1.
- “Siapa yang mengubah” cukup diwakili dropdown actor, tanpa identitas login.
- Audit yang wajib hanya perubahan status, sesuai kalimat requirement. Create dan delete sengaja tidak masuk log.
- Satu pengguna memakai UI pada satu waktu. File JSON tidak dirancang untuk banyak penulis bersamaan.
- Zona waktu penyimpanan UTC. Tampilan waktu di UI boleh diformat lokal.

## 16. Out of scope

- Mengubah judul atau deskripsi setelah create.
- Mengembalikan task yang sudah dihapus.
- Memindahkan status lebih dari satu langkah dalam satu permintaan.
- Pagination, pencarian, dan filter.
- Akun user sungguhan.

## 17. Catatan untuk README nanti

Tiga pertanyaan ini dijawab di README setelah implementasi, berdasarkan kode yang benar-benar ada. PRD hanya menandai risiko produknya.

- **Audit log tidak boleh ter-modifikasi.** Aplikasi tidak menyediakan jalan untuk mengubah atau menghapus log. Jaminan ini berlaku untuk pemakaian lewat API aplikasi, bukan untuk seseorang yang mengedit file JSON langsung di disk.
- **Risiko jika dipakai banyak user.** Penyimpanan file JSON pada satu proses bisa kehilangan atau menimpa penulisan ketika dua update status terjadi bersamaan. Itulah bagian yang paling rapuh saat beban naik.
- **Refactor pertama jika sistem membesar.** Lapisan penyimpanan (file JSON menjadi penyimpanan yang mendukung penulisan atomik dan banyak pembaca) disentuh lebih dulu, karena aturan status dan bentuk audit log sudah kecil dan stabil, sedangkan ketahanan data tidak.

Pertanyaan “bagian mana yang dibantu AI” juga dijawab di README, bukan di dokumen ini.
