require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdf = require('pdf-parse');
const { createCanvas, loadImage } = require('canvas');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const GEN_API = process.env.GEN_API;
const NAME = process.env.OWNER_NAME || "Om Ghante";
const BOT_NAME = process.env.BOT_NAME || "Om Ghante's ChatBot";
const MODEL_NAME = process.env.MODEL_NAME || "gemini-1.5-flash-latest";
const WA_TOKEN = process.env.WA_TOKEN;
const PHONE_ID = process.env.PHONE_ID;

const genAI = new GoogleGenerativeAI(GEN_API);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

let conversationHistory = [];
const MAX_HISTORY = 20;

// Language detection
function detectLanguage(text) {
  const marathiChars = /[\u0900-\u097F]/;
  return marathiChars.test(text) ? 'marathi' : 'english';
}

// Media processor
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
        { text: "Describe this image in detail" },
        { inlineData: { data: imageData.split(',')[1], mimeType: 'image/jpeg' } }
      ]);

      return result.response.text();
    }

    if (mimeType.startsWith('audio/')) {
      const result = await model.generateContent([
        { text: "Transcribe this audio:" },
        { inlineData: { data: buffer.toString('base64'), mimeType } }
      ]);

      return `Audio Transcription: ${result.response.text()}`;
    }

    return "Unsupported file format";
  } catch (error) {
    console.error('Media processing error:', error);
    return "Error processing media";
  }
}

// Health check
app.get('/', (req, res) => res.send('WhatsApp AI Bot'));

// WhatsApp webhook
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (token === 'BOT') {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// WhatsApp message handler
app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];
    const metadata = changes?.value?.metadata;

    if (!message) return res.json({ status: "ok" });

    const PHONE_NUMBER_ID = metadata.phone_number_id;
    const WA_TOKEN = process.env.WA_TOKEN;

    let userInput = '';
    const userLanguage = detectLanguage(message.text?.body || '');

    if (message.type !== 'text') {
      const mediaId = message[message.type]?.id;
      if (!mediaId) return res.json({ status: "ok" });

      const mediaUrl = `https://graph.facebook.com/v18.0/${mediaId}/`;
      const headers = { 'Authorization': `Bearer ${WA_TOKEN}` };

      const mediaResponse = await axios.get(mediaUrl, { headers });
      const mediaData = await axios.get(mediaResponse.data.url, {
        responseType: 'arraybuffer',
        headers
      });

      const mimeType = mediaResponse.data.mime_type;
      userInput = await processMedia(mediaData.data, mimeType);
    } else {
      userInput = message.text.body;
    }

    const languagePrompt = userLanguage === 'marathi' ? 
      " (Respond in Marathi)" : " (Respond in English)";

    conversationHistory.push({ role: "user", parts: [{ text: userInput }] });
    if (conversationHistory.length > MAX_HISTORY) {
      conversationHistory = conversationHistory.slice(-MAX_HISTORY);
    }

    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: `You are ${BOT_NAME} created by ${NAME}. Respond in the same language as the user.` }]
        },
        ...conversationHistory
      ],
      generationConfig: {
        temperature: 1,
        topP: 0.95,
        topK: 0,
        maxOutputTokens: 8192
      }
    });

    const result = await chat.sendMessage(userInput + languagePrompt);
    const response = await result.response;
    const text = response.text();

    conversationHistory.push({ role: "model", parts: [{ text }] });

    const sendURL = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
    const headers = {
      'Authorization': `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json'
    };
    const messageBody = {
      messaging_product: "whatsapp",
      to: message.from,
      type: "text",
      text: { body: text }
    };
    await axios.post(sendURL, messageBody, { headers });

    res.json({ status: "ok" });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// NEW: Simplified hello_world template endpoint
app.post('/schedule-template', async (req, res) => {
  try {
    const { phone, time } = req.body;

    if (!phone || !time) {
      return res.status(400).json({ error: 'Missing phone or time' });
    }

    const now = new Date();
    const scheduledTime = new Date(time); // ISO string or timestamp
    const delay = scheduledTime - now;

    if (delay < 0) {
      return res.status(400).json({ error: 'Scheduled time is in the past' });
    }

    setTimeout(async () => {
      const url = `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`;
      const headers = {
        Authorization: `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json'
      };

      const data = {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: "hello_world", // Your approved template name
          language: { code: "en_US" }
        }
      };

      try {
        await axios.post(url, data, { headers });
        console.log(`✅ Template sent to ${phone} at ${new Date().toLocaleString()}`);
      } catch (error) {
        console.error('❌ Error sending scheduled template:', error.response?.data || error.message);
      }
    }, delay);

    res.json({ success: true, message: `Template message scheduled for ${new Date(scheduledTime).toLocaleString()}` });
  } catch (error) {
    console.error('❌ Schedule template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));