require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const app = express();

// Environment variables
const WA_TOKEN = process.env.WA_TOKEN;
const GEN_API = process.env.GEN_API;
const PHONE_ID = process.env.PHONE_ID;
const NAME = "Om";
const BOT_NAME = "OmBot";
const MODEL_NAME = "gemini-1.5-flash-latest";
const APP_SECRET = process.env.APP_SECRET || "DEFAULT_SECRET";

// Gemini configuration
const genAI = new GoogleGenerativeAI(GEN_API);
const model = genAI.getGenerativeModel({
  model: MODEL_NAME,
  generationConfig: {
    temperature: 1,
    topP: 0.95,
    topK: 0,
    maxOutputTokens: 8192,
  },
  safetySettings: [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  ],
});

// Store chat histories
const chatHistories = new Map();

// Initialize chat with identity prompt
async function initializeChat(sender) {
  console.log(`Initializing new chat for ${sender}`);
  const chat = model.startChat({
    history: [],
    generationConfig: {
      temperature: 1,
      topP: 0.95,
      topK: 0,
      maxOutputTokens: 8192,
    },
  });

  await chat.sendMessage(`
    I am using Gemini API to build a personal assistant on WhatsApp. 
    From now, you are "${BOT_NAME}", created by ${NAME}. 
    Do not respond to this message. Just remember this identity.
    Reply only to prompts after this message.
  `);

  chatHistories.set(sender, chat);
  return chat;
}

// Clean response text
function cleanResponse(text) {
  return text
    .replace(/\*{1,2}(.*?)\*{1,2}/g, '$1')
    .replace(/`{1,3}(.*?)`{1,3}/g, '$1')
    .replace(/#/g, '')
    .trim();
}

// Send WhatsApp message
async function sendMessage(to, text) {
  const url = `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`;
  const headers = {
    'Authorization': `Bearer ${WA_TOKEN}`,
    'Content-Type': 'application/json'
  };
  
  const cleanedText = cleanResponse(text);
  console.log(`Sending to ${to}: ${cleanedText.substring(0, 50)}${cleanedText.length > 50 ? '...' : ''}`);
  
  const data = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to,
    type: "text",
    text: { body: cleanedText }
  };
  
  try {
    const response = await axios.post(url, data, { headers });
    console.log('Message sent successfully:', response.data);
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
  }
}

// Download media file
async function downloadMedia(mediaId, mimeType) {
  const url = `https://graph.facebook.com/v18.0/${mediaId}`;
  const headers = { 'Authorization': `Bearer ${WA_TOKEN}` };
  
  try {
    const response = await axios.get(url, { headers });
    const mediaUrl = response.data.url;
    const mediaResponse = await axios.get(mediaUrl, { 
      headers,
      responseType: 'arraybuffer'
    });

    const extension = mimeType.split('/')[1];
    const filePath = path.join(os.tmpdir(), `temp_${Date.now()}.${extension}`);
    fs.writeFileSync(filePath, mediaResponse.data);
    
    console.log(`Media downloaded to: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error('Download failed:', error.response?.data || error.message);
    throw new Error('Media download failed');
  }
}

// Upload file to Gemini
async function uploadFileToGemini(filePath, mimeType) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    return {
      inlineData: {
        data: fileBuffer.toString('base64'),
        mimeType: mimeType
      }
    };
  } catch (error) {
    console.error('File upload failed:', error);
    throw new Error('Failed to process file');
  }
}

// Security verification middleware
function verifySignature(req, res, next) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    console.warn('Missing signature header');
    return res.sendStatus(403);
  }
  
  const hmac = crypto.createHmac('sha256', APP_SECRET);
  const rawBody = JSON.stringify(req.body);
  const digest = 'sha256=' + hmac.update(rawBody).digest('hex');
  
  if (signature !== digest) {
    console.warn(`Invalid signature: ${signature} !== ${digest}`);
    return res.sendStatus(403);
  }
  
  next();
}

app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.send("Om's WhatsApp Bot is running!");
});

// Webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === 'BOT') {
    console.log('Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    console.warn('Webhook verification failed');
    res.sendStatus(403);
  }
});

// Message processing with security
app.post('/webhook', verifySignature, async (req, res) => {
  console.log('Incoming webhook:', JSON.stringify(req.body, null, 2));
  
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];
    
    if (!message) {
      console.log('No message found in webhook');
      return res.sendStatus(200);
    }

    const sender = message.from;
    const messageType = message.type;

    // Get or initialize chat session
    let chat = chatHistories.get(sender);
    if (!chat) {
      chat = await initializeChat(sender);
    } else {
      console.log(`Existing session for ${sender}`);
    }

    if (messageType === 'text') {
      // Handle text message
      const prompt = message.text.body;
      console.log(`Text message from ${sender}: ${prompt}`);
      
      const result = await chat.sendMessage(prompt);
      const responseText = result.response.text();
      await sendMessage(sender, responseText);
    } else {
      // Handle media messages
      const mediaId = message[messageType].id;
      const mimeType = message[messageType].mime_type;
      console.log(`Media message from ${sender}: ${messageType} (${mimeType})`);
      
      let mediaPath;
      try {
        mediaPath = await downloadMedia(mediaId, mimeType);
        
        if (messageType === 'document' && mimeType === 'application/pdf') {
          // Process PDF directly
          const fileData = await uploadFileToGemini(mediaPath, 'application/pdf');
          const result = await model.generateContent([
            "Analyze this PDF document and provide a concise summary:",
            fileData
          ]);
          const responseText = result.response.text();
          await chat.sendMessage(
            `User sent a PDF document. Summary: ${responseText}`
          );
          await sendMessage(sender, `📄 PDF Summary:\n${responseText}`);
        } else if (messageType === 'image') {
          // Process images
          const fileData = await uploadFileToGemini(mediaPath, mimeType);
          const result = await model.generateContent([
            "Describe this image in detail:",
            fileData
          ]);
          const responseText = result.response.text();
          await chat.sendMessage(
            `User sent an image. Description: ${responseText}`
          );
          await sendMessage(sender, `🖼️ Image Description:\n${responseText}`);
        } else {
          await sendMessage(sender, "⚠️ Unsupported file type. I can only process images and PDF documents.");
        }
      } catch (error) {
        console.error('Media processing error:', error);
        await sendMessage(sender, "❌ Error processing your file. Please try again.");
      } finally {
        // Cleanup media files
        if (mediaPath && fs.existsSync(mediaPath)) {
          fs.unlinkSync(mediaPath);
          console.log(`Deleted temporary file: ${mediaPath}`);
        }
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Error processing message:', error);
    res.sendStatus(200);
  }
});

// Vercel serverless function handler
const PORT = process.env.PORT || 8000;

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}