require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { PDFDocument } = require('pdf-lib');
const app = express();

// Environment variables
const WA_TOKEN = process.env.WA_TOKEN;
const GEN_API = process.env.GEN_API;
const PHONE_ID = process.env.PHONE_ID;
const NAME = "Om"; // Your name
const BOT_NAME = "OmBot"; // Bot's name
const MODEL_NAME = "gemini-1.5-flash-latest";

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
  const data = {
    messaging_product: "whatsapp",
    to: to,
    type: "text",
    text: { body: cleanResponse(text) }
  };
  
  try {
    await axios.post(url, data, { headers });
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
  }
}

// Download media file
async function downloadMedia(mediaId, mimeType) {
  const url = `https://graph.facebook.com/v18.0/${mediaId}/`;
  const headers = { 'Authorization': `Bearer ${WA_TOKEN}` };
  
  const response = await axios.get(url, { headers });
  const mediaUrl = response.data.url;
  const mediaResponse = await axios.get(mediaUrl, { 
    headers,
    responseType: 'arraybuffer'
  });

  const extension = mimeType.split('/')[1];
  const filePath = path.join(os.tmpdir(), `temp_${Date.now()}.${extension}`);
  fs.writeFileSync(filePath, mediaResponse.data);
  
  return filePath;
}

// Convert PDF to images
async function pdfToImages(pdfPath) {
  const pdfData = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfData);
  const imagePaths = [];

  for (let i = 0; i < pdfDoc.getPageCount(); i++) {
    const imagePath = path.join(os.tmpdir(), `temp_image_${Date.now()}_${i}.jpg`);
    const page = pdfDoc.getPage(i);
    const image = await page.renderToJpeg();
    fs.writeFileSync(imagePath, image);
    imagePaths.push(imagePath);
  }

  return imagePaths;
}

// Upload file to Gemini
async function uploadFileToGemini(filePath) {
  const fileData = {
    inlineData: {
      data: Buffer.from(fs.readFileSync(filePath)).toString('base64'),
      mimeType: path.extname(filePath) === '.pdf' ? 
        'application/pdf' : 
        `image/${path.extname(filePath).slice(1)}`
    }
  };
  return fileData;
}

app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.send("OmGhante's Bot is running!");
});

// Webhook verification
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

// Message processing
app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];
    
    if (!message) return res.sendStatus(200);

    const sender = message.from;
    const messageType = message.type;

    // Get or initialize chat session
    let chat = chatHistories.get(sender);
    if (!chat) chat = await initializeChat(sender);

    if (messageType === 'text') {
      // Handle text message
      const prompt = message.text.body;
      const result = await chat.sendMessage(prompt);
      const responseText = result.response.text();
      await sendMessage(sender, responseText);
    } else {
      // Handle media messages
      const mediaId = message[messageType].id;
      const mimeType = message[messageType].mime_type;
      let mediaPath;

      try {
        mediaPath = await downloadMedia(mediaId, mimeType);
        
        if (messageType === 'document' && mimeType === 'application/pdf') {
          // Process PDF document
          const imagePaths = await pdfToImages(mediaPath);
          
          for (const imagePath of imagePaths) {
            const fileData = await uploadFileToGemini(imagePath);
            const prompt = "What is this?";
            const result = await model.generateContent([prompt, fileData]);
            const responseText = result.response.text();
            
            await chat.sendMessage(
              `This is an image-based PDF. Respond to the user based on this: ${responseText}`
            );
            await sendMessage(sender, chat.lastMessage);
          }
          
          // Cleanup
          imagePaths.forEach(p => fs.existsSync(p) && fs.unlinkSync(p));
        } else {
          // Process other media types
          const fileData = await uploadFileToGemini(mediaPath);
          const prompt = "Please describe this file:";
          const result = await model.generateContent([prompt, fileData]);
          const responseText = result.response.text();
          
          await chat.sendMessage(
            `This was received from the user. Respond to it: ${responseText}`
          );
          await sendMessage(sender, chat.lastMessage);
        }
      } finally {
        // Cleanup media files
        if (mediaPath && fs.existsSync(mediaPath)) fs.unlinkSync(mediaPath);
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Error processing message:', error);
    res.sendStatus(200);
  }
});

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});