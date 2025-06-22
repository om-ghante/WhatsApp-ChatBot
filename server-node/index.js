// index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdf = require('pdf-parse');
const { createCanvas, loadImage } = require('canvas');
const app = express();

// Configuration
const WA_TOKEN = process.env.WA_TOKEN;
const GEN_API = process.env.GEN_API;
const PHONE_ID = process.env.PHONE_ID;
const PHONE_NUMBER = process.env.PHONE_NUMBER;
const NAME = process.env.OWNER_NAME || "Your name";
const BOT_NAME = process.env.BOT_NAME || "AI Assistant";
const MODEL_NAME = process.env.MODEL_NAME || "gemini-1.5-flash-latest";

const genAI = new GoogleGenerativeAI(GEN_API);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

// Global conversation history
let conversationHistory = [];
const MAX_HISTORY = 20;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// WhatsApp message sender
async function sendWhatsAppMessage(text) {
  const url = `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`;
  const headers = {
    'Authorization': `Bearer ${WA_TOKEN}`,
    'Content-Type': 'application/json'
  };
  
  const data = {
    messaging_product: "whatsapp",
    to: PHONE_NUMBER,
    type: "text",
    text: { body: text }
  };

  try {
    await axios.post(url, data, { headers });
  } catch (error) {
    console.error('WhatsApp API error:', error.response?.data || error.message);
  }
}

// Detect language and set response language
function detectLanguage(text) {
  const marathiChars = /[\u0900-\u097F]/;
  return marathiChars.test(text) ? 'marathi' : 'english';
}

// Process different media types
async function processMedia(buffer, mimeType) {
  try {
    // Process PDF
    if (mimeType === 'application/pdf') {
      const data = await pdf(buffer);
      return `PDF Content: ${data.text}`;
    }
    
    // Process images
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
    
    // Process audio
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

// Webhook endpoints
app.get('/', (req, res) => res.send('WhatsApp AI Bot'));

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === 'BOT') {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];
    
    if (!message) return res.json({ status: "ok" });

    let userInput = '';
    const userLanguage = detectLanguage(message.text?.body || '');
    
    // Handle media messages
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

    // Add language context to prompt
    const languagePrompt = userLanguage === 'marathi' ? 
      " (Respond in Marathi)" : " (Respond in English)";
    
    // Maintain conversation history
    conversationHistory.push({ role: "user", parts: [{ text: userInput }] });
    
    // Trim history to prevent excessive token usage
    if (conversationHistory.length > MAX_HISTORY) {
      conversationHistory = conversationHistory.slice(-MAX_HISTORY);
    }

    // Generate response
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
    
    // Add bot response to history
    conversationHistory.push({ role: "model", parts: [{ text }] });
    
    // Send response via WhatsApp
    await sendWhatsAppMessage(text);
    
    res.json({ status: "ok" });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));