import Cors from 'cors';
import initMiddleware from './_initMiddleware';
import { GoogleGenerativeAI } from '@google/generative-ai';
import pdf from 'pdf-parse';
import axios from 'axios';
import { createCanvas, loadImage } from 'canvas';

// ✅ Enable CORS for frontend only (localhost removed)
const cors = initMiddleware(
  Cors({
    methods: ['POST', 'GET', 'OPTIONS'],
    origin: ['https://whats-app-chat-bot-44ud.vercel.app'],
  })
);

// ✅ Gemini API init
const GEN_API = process.env.GEN_API;
const genAI = new GoogleGenerativeAI(GEN_API);
const MODEL_NAME = process.env.MODEL_NAME || 'gemini-1.5-flash-latest';
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

let conversationHistory = [];
const MAX_HISTORY = 20;

// ✅ Main Handler
export default async function handler(req, res) {
  await cors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Health check
  if (req.method === 'GET' && req.url === '/') {
    return res.status(200).send('✅ WhatsApp AI Bot is alive');
  }

  // Webhook verification
  if (req.method === 'GET' && req.query['hub.verify_token']) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (token === 'BOT') {
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }

  // ✅ Handle WhatsApp webhook (AI chat)
  if (req.method === 'POST' && req.url === '/api/webhook') {
    try {
      const entry = req.body.entry?.[0];
      const changes = entry?.changes?.[0];
      const message = changes?.value?.messages?.[0];
      const metadata = changes?.value?.metadata;

      if (!message) return res.json({ status: 'ok' });

      const PHONE_NUMBER_ID = metadata.phone_number_id;
      const WA_TOKEN = process.env.WA_TOKEN;

      let userInput = '';
      const userLanguage = detectLanguage(message.text?.body || '');

      if (message.type !== 'text') {
        const mediaId = message[message.type]?.id;
        if (!mediaId) return res.json({ status: 'ok' });

        const mediaUrl = `https://graph.facebook.com/v18.0/${mediaId}/`;
        const headers = { Authorization: `Bearer ${WA_TOKEN}` };

        const mediaResponse = await axios.get(mediaUrl, { headers });
        const mediaData = await axios.get(mediaResponse.data.url, {
          responseType: 'arraybuffer',
          headers,
        });

        const mimeType = mediaResponse.data.mime_type;
        userInput = await processMedia(mediaData.data, mimeType);
      } else {
        userInput = message.text.body;
      }

      const promptLang = userLanguage === 'marathi' ? ' (Respond in Marathi)' : ' (Respond in English)';

      conversationHistory.push({ role: 'user', parts: [{ text: userInput }] });
      if (conversationHistory.length > MAX_HISTORY) {
        conversationHistory = conversationHistory.slice(-MAX_HISTORY);
      }

      const chat = model.startChat({
        history: [
          {
            role: 'user',
            parts: [
              {
                text: `You are Om Ghante's WhatsApp Chatbot. Respond in the same language as the user.`,
              },
            ],
          },
          ...conversationHistory,
        ],
        generationConfig: {
          temperature: 1,
          topP: 0.95,
          topK: 0,
          maxOutputTokens: 8192,
        },
      });

      const result = await chat.sendMessage(userInput + promptLang);
      const response = await result.response;
      const text = response.text();

      conversationHistory.push({ role: 'model', parts: [{ text }] });

      const sendURL = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
      const headers = {
        Authorization: `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json',
      };
      const messageBody = {
        messaging_product: 'whatsapp',
        to: message.from,
        type: 'text',
        text: { body: text },
      };

      await axios.post(sendURL, messageBody, { headers });

      return res.json({ status: 'ok' });
    } catch (err) {
      console.error('Webhook error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ✅ Handle /send-template POST
  if (req.method === 'POST' && req.url === '/api/webhook/send-template') {
    const { WA_TOKEN, PHONE_ID, name, phone, dayOfWeek, greeting, image } = req.body;

    const url = `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`;
    const headers = {
      Authorization: `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json',
    };

    const data = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: 'firsttemplate',
        language: { code: 'en_US' },
        components: [
          {
            type: 'header',
            parameters: [
              {
                type: 'image',
                image: { link: `data:image/jpeg;base64,${image}` },
              },
            ],
          },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: name },
              { type: 'text', text: dayOfWeek },
              { type: 'text', text: greeting },
            ],
          },
        ],
      },
    };

    try {
      await axios.post(url, data, { headers });
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error(error.response?.data || error.message);
      return res.status(500).json({ error: 'Failed to send template message' });
    }
  }

  // If not matched
  return res.status(404).json({ message: 'Route not found' });
}

// 🔹 Helper: Language Detection
function detectLanguage(text) {
  const marathiChars = /[\u0900-\u097F]/;
  return marathiChars.test(text) ? 'marathi' : 'english';
}

// 🔹 Helper: Process Media (image, audio, pdf)
async function processMedia(buffer, mimeType) {
  try {
    if (mimeType === 'application/pdf') {
      const data = await pdf(buffer);
      return `PDF Content: ${data.text}`;
    }

    if (mimeType.startsWith('image/')) {
      const img = await loadImage(buffer);
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg');

      const result = await model.generateContent([
        { text: 'Describe this image in detail' },
        {
          inlineData: {
            data: imageData.split(',')[1],
            mimeType: 'image/jpeg',
          },
        },
      ]);
      return result.response.text();
    }

    if (mimeType.startsWith('audio/')) {
      const result = await model.generateContent([
        { text: 'Transcribe this audio:' },
        {
          inlineData: {
            data: buffer.toString('base64'),
            mimeType,
          },
        },
      ]);
      return `Audio Transcription: ${result.response.text()}`;
    }

    return 'Unsupported file format';
  } catch (err) {
    console.error('Media error:', err);
    return 'Error processing media';
  }
}
