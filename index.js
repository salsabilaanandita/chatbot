import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// File upload diproses di memory (tanpa disimpan ke disk), maks 10 MB
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Ganti model cukup di satu tempat (default gemini-3.5-flash-lite yang sangat cepat & kuota aman)
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

// Daftar model fallback jika model utama terkena rate limit (429) atau error sementara
const FALLBACK_MODELS = [
  GEMINI_MODEL,
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
];
const UNIQUE_MODELS = [...new Set(FALLBACK_MODELS)];

async function generateWithFallback({ contents, config, model = GEMINI_MODEL }) {
  const modelsToTry = [...new Set([model, ...UNIQUE_MODELS])];
  let lastError = null;

  for (const currentModel of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: currentModel,
        contents,
        ...(config ? { config } : {}),
      });
      return response;
    } catch (err) {
      lastError = err;
      const status = err.status || err.statusCode || (err.error && err.error.code);
      const isRateLimit =
        status === 429 ||
        (err.message &&
          (err.message.includes('429') ||
            err.message.includes('quota') ||
            err.message.includes('RESOURCE_EXHAUSTED')));
      const isNotFound = status === 404;
      const isOverloaded = status === 503;

      console.warn(
        `[Gemini API] Model '${currentModel}' gagal (Status: ${status || 'unknown'}). Mencoba model berikutnya...`
      );

      if (isRateLimit || isNotFound || isOverloaded) {
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

async function streamWithFallback({ contents, config, onChunk, isClientDisconnected, model = GEMINI_MODEL }) {
  const modelsToTry = [...new Set([model, ...UNIQUE_MODELS])];
  let lastError = null;

  for (const currentModel of modelsToTry) {
    try {
      const responseStream = await ai.models.generateContentStream({
        model: currentModel,
        contents,
        ...(config ? { config } : {}),
      });

      for await (const chunk of responseStream) {
        if (isClientDisconnected && isClientDisconnected()) {
          return { aborted: true };
        }
        const text = chunk.text || '';
        if (text) {
          onChunk(text);
        }
      }

      return { success: true, model: currentModel };
    } catch (err) {
      lastError = err;
      const status = err.status || err.statusCode || (err.error && err.error.code);
      const isRateLimit =
        status === 429 ||
        (err.message &&
          (err.message.includes('429') ||
            err.message.includes('quota') ||
            err.message.includes('RESOURCE_EXHAUSTED')));
      const isNotFound = status === 404;
      const isOverloaded = status === 503;

      console.warn(
        `[Gemini API Stream] Model '${currentModel}' gagal (Status: ${status || 'unknown'}). Mencoba model berikutnya...`
      );

      if (isRateLimit || isNotFound || isOverloaded) {
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

// ---- Konfigurasi "kepribadian" chatbot -------------------------------------
// Use case: Chatbot AI (education bot)
const SYSTEM_INSTRUCTION = `Kamu adalah "Chatbot AI", asisten belajar yang sabar, ramah, dan suportif untuk pelajar dan mahasiswa Indonesia.
Aturan:
- Jawab dalam Bahasa Indonesia dengan gaya santai tapi tetap sopan, ringkas, dan jelas.
- Langsung ke inti poin penting agar jawaban cepat dipahami, mulai dari konsep dasar dan beri analogi sehari-hari jika perlu.
- Akhiri penjelasan panjang dengan 1 pertanyaan singkat untuk mengecek pemahaman.
- Jika diminta mengerjakan tugas, bimbing dulu dengan petunjuk sebelum memberi jawaban final.
- Fokus pada topik pendidikan dan belajar. Tolak dengan sopan permintaan yang berbahaya atau tidak pantas.
- Jangan memberi diagnosis medis, hukum, atau keuangan yang bersifat final; sarankan konsultasi ke ahlinya.
- Jika tidak yakin, katakan terus terang, jangan mengarang.`;

// Rentang sesuai materi: temperature 0.0-2.0, top_k 1-40, top_p 0.0-1.0
const GENERATION_CONFIG = {
  temperature: 0.6, // sedikit lebih fokus agar jawaban cepat & tepat
  topK: 40,
  topP: 0.95,
  systemInstruction: SYSTEM_INSTRUCTION,
};

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const sendError = (res, e, status = 500) => {
  console.error(e);
  const statusCode = e.status || e.statusCode || (e.error && e.error.code) || status;
  let clientMessage = e.message || 'Terjadi kesalahan pada server.';

  if (
    statusCode === 429 ||
    clientMessage.includes('429') ||
    clientMessage.includes('quota') ||
    clientMessage.includes('RESOURCE_EXHAUSTED')
  ) {
    return res.status(429).json({
      error: 'Batas kuota Gemini API (Rate Limit 429) tercapai. Silakan coba sesaat lagi.',
    });
  }

  const finalStatus = statusCode >= 100 && statusCode < 600 ? statusCode : 500;
  res.status(finalStatus).json({ error: clientMessage });
};

// ---- POST /api/chat & /chat : percakapan multi-turn & single prompt ---------
// Mendukung Streaming SSE (Real-time & cepat) atau JSON standar
app.post(['/api/chat', '/chat'], async (req, res) => {
  let { conversation, prompt, stream = true } = req.body;
  try {
    if (!conversation && prompt) {
      conversation = [{ role: 'user', text: prompt }];
    }
    if (!Array.isArray(conversation) || conversation.length === 0) {
      return sendError(res, new Error('conversation harus berupa array yang tidak kosong atau sediakan prompt.'), 400);
    }
    const valid = conversation.every(
      (m) => m && ['user', 'model'].includes(m.role) && typeof m.text === 'string' && m.text.trim()
    );
    if (!valid) {
      return sendError(res, new Error('Setiap pesan wajib punya role ("user"/"model") dan text.'), 400);
    }

    const contents = conversation.map(({ role, text }) => ({
      role,
      parts: [{ text }],
    }));

    // Jika mode streaming diaktifkan (default: respon instan & cepat)
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      let clientDisconnected = false;
      res.on('close', () => {
        if (!res.writableEnded) {
          clientDisconnected = true;
        }
      });

      try {
        await streamWithFallback({
          contents,
          config: GENERATION_CONFIG,
          isClientDisconnected: () => clientDisconnected,
          onChunk: (text) => {
            if (!clientDisconnected) {
              res.write(`data: ${JSON.stringify({ text })}\n\n`);
            }
          },
        });

        if (!clientDisconnected) {
          res.write('data: [DONE]\n\n');
          res.end();
        }
      } catch (streamErr) {
        if (!clientDisconnected) {
          const errMsg =
            streamErr.status === 429 || streamErr.message?.includes('429')
              ? 'Batas kuota Gemini API (Rate Limit 429) tercapai. Silakan coba sesaat lagi.'
              : (streamErr.message || 'Terjadi kesalahan saat streaming jawaban.');
          res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
          res.end();
        }
      }
      return;
    }

    // Mode non-streaming (JSON biasa)
    const response = await generateWithFallback({
      contents,
      config: GENERATION_CONFIG,
    });

    res.status(200).json({ result: response.text });
  } catch (e) {
    sendError(res, e);
  }
});

// ---- Endpoint multimodal (Sesi 2) ------------------------------------------
app.post('/generate-text', async (req, res) => {
  const { prompt } = req.body;
  try {
    if (!prompt) return sendError(res, new Error('prompt wajib diisi.'), 400);
    const response = await generateWithFallback({ contents: prompt });
    res.status(200).json({ result: response.text });
  } catch (e) {
    sendError(res, e);
  }
});

const fileEndpoint = (route, field, defaultPrompt) =>
  app.post(route, upload.single(field), async (req, res) => {
    try {
      if (!req.file) return sendError(res, new Error(`File "${field}" wajib diunggah.`), 400);
      const { prompt } = req.body;
      const response = await generateWithFallback({
        contents: [
          { text: prompt || defaultPrompt, type: 'text' },
          { inlineData: { data: req.file.buffer.toString('base64'), mimeType: req.file.mimetype } },
        ],
        config: { systemInstruction: SYSTEM_INSTRUCTION },
      });
      res.status(200).json({ result: response.text });
    } catch (e) {
      sendError(res, e);
    }
  });

fileEndpoint('/generate-from-image', 'image', 'Tolong deskripsikan gambar berikut.');
fileEndpoint('/generate-from-document', 'document', 'Tolong buat ringkasan dari dokumen berikut.');
fileEndpoint('/generate-from-audio', 'audio', 'Tolong buatkan transkrip dari rekaman berikut.');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Gemini Chatbot running on http://localhost:${PORT}`));
