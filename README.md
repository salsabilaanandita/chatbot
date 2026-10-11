# Chatbot AI - Gemini AI Chatbot

Chatbot asisten belajar berbasis **Gemini 2.5 Flash**. Backend memakai Node.js + Express, frontend memakai HTML/CSS/Vanilla JS. Dibuat dari materi Sesi 2 dan Sesi 3 *AI Productivity and AI API Integration for Developers* (Hacktiv8).

## Use case dan konfigurasi

- **Use case:** education bot, yaitu Chatbot AI untuk pelajar dan mahasiswa Indonesia.
- **System instruction:** persona sabar dan suportif, menjelaskan bertahap dengan analogi, menjawab dalam Bahasa Indonesia santai, membimbing dulu sebelum memberi jawaban akhir, dan menolak topik yang tidak pantas.
- **Parameter:** `temperature: 0.7`, `topK: 40`, `topP: 0.95`. Semuanya bisa diubah di `GENERATION_CONFIG` pada `index.js`.
- **Multi-turn:** frontend mengirim seluruh riwayat percakapan, jadi Gemini ingat konteks.

## Fitur

- `POST /api/chat`: percakapan multi-turn & multimodal real-time (mendukung streaming SSE dan input teks, gambar, audio, serta dokumen).
- **Upload File, Gambar & Audio langsung di UI**:
  - Tombol lampiran (paperclip) di samping kotak input pesan.
  - Gambar (`png`, `jpg`, `webp`): preview thumbnail langsung di chat.
  - Audio (`mp3`, `wav`, `m4a`, `ogg`): pemutar audio mini di bubble percakapan.
  - Dokumen (`pdf`, `txt`, `csv`, `doc`): badge dokumen dengan ukuran file.
- Endpoint multimodal API mandiri:
  - `POST /generate-text` dengan body JSON `{ "prompt": "..." }`
  - `POST /generate-from-image` dengan form-data `image` (File) dan `prompt` (Text, opsional)
  - `POST /generate-from-document` dengan form-data `document` (File: pdf/txt) dan `prompt` (opsional)
  - `POST /generate-from-audio` dengan form-data `audio` (File: mp3/wav) dan `prompt` (opsional)

## Cara menjalankan

Prasyarat: Node.js v18+ dan Gemini API key dari <https://aistudio.google.com/apikey>.

```bash
npm install
cp .env.example .env      # lalu isi GEMINI_API_KEY di file .env
npm start
```

Buka <http://localhost:3000>.

## Contoh request

```http
POST http://localhost:3000/api/chat
Content-Type: application/json

{
  "conversation": [
    { "role": "user", "text": "Apa itu fotosintesis?" }
  ]
}
```

Response: `{ "result": "..." }`

## Struktur

```
gemini-chatbot-api/
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── index.js
├── package.json
├── .env.example
└── .gitignore
```

## Mengumpulkan ke GitHub

`.env`, `node_modules`, dan `package-lock.json` sudah masuk `.gitignore`, jadi API key tidak ikut ter-push.

```bash
git init
git add .
git commit -m "Implementasi chatbot Gemini AI"
git branch -M main
git remote add origin https://github.com/<username>/<nama-repo>.git
git push -u origin main
```

Deliverables: URL repository GitHub dan screenshot User Interface.
