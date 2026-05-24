# Firebase Setup

App ini memakai Firebase Realtime Database supaya jadwal yang dibuat di satu device otomatis muncul di device lain.

## 1. Buat Firebase project

1. Buka Firebase Console.
2. Buat project baru atau pilih project yang sudah ada.
3. Tambahkan Web App.
4. Copy config Web App dari `Project settings -> General -> Your apps`.

## 2. Isi config di `script.js`

Ganti value kosong di bagian atas `script.js`:

```js
const firebaseConfig = {
  apiKey: '...',
  authDomain: '...',
  databaseURL: '...',
  projectId: '...',
  storageBucket: '...',
  messagingSenderId: '...',
  appId: '...',
};
```

`databaseURL` wajib ada. Kalau belum muncul, buat Realtime Database dulu.

## 3. Buat Realtime Database

1. Di Firebase Console, buka `Build -> Realtime Database`.
2. Klik `Create Database`.
3. Pilih region.
4. Untuk percobaan cepat, mulai dari test mode.

## 4. Publish rules

Rules sederhana tersedia di `firebase-rules.json`:

```json
{
  "rules": {
    "assignments": {
      ".read": true,
      ".write": true
    }
  }
}
```

Rules ini cocok untuk testing internal karena siapa pun yang punya URL app bisa baca/tulis data. Untuk production, tambahkan Firebase Authentication dan rules yang lebih ketat.

## 5. Jalankan local

```bash
python3 -m http.server 8000
```

Buka dua browser/device ke URL yang sama. Kalau memakai device lain di Wi-Fi yang sama, buka dengan IP laptop:

```text
http://IP_LAPTOP:8000
```

Contoh:

```text
http://192.168.1.10:8000
```
