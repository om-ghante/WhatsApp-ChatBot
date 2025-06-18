import express from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PDFDocument } from 'pdf-lib';
const router = express.Router();

// Environment variables
const WA_TOKEN = process.env.WA_TOKEN;
const GEN_API = process.env.GEN_API;
const PHONE_ID = process.env.PHONE_ID;
const NAME = "Om";
const BOT_NAME = "OmBot";
const MODEL_NAME = "gemini-1.5-flash-latest";

// Initialize Gemini
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

// Convert PDF to images (simplified for Vercel)
async function processPDF(pdfPath) {
  try {
    const pdfData = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfData);
    
    // Process only the first page to save resources
    if (pdfDoc.getPageCount() > 0) {
      const imagePath = path.join(os.tmpdir(), `temp_image_${Date.now()}.jpg`);
      const page = pdfDoc.getPage(0);
      const image = await page.renderToJpeg();
      fs.writeFileSync(imagePath, image);
      return [imagePath];
    }
    return [];
  } catch (error) {
    console.error('PDF processing error:', error);
    return [];
  }
}

// Upload file to Gemini
async function uploadFileToGemini(filePath) {
  const fileData = {
    inlineData: {
      data: Buffer.from(fs.readFileSync(filePath)).toString('base64'),
      mimeType: path.extname(filePath) === '.pdf' ? 
        'application/pdf' : 
        `image/jpeg`
    }
  };
  return fileData;
}

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === 'BOT') {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

router.post('/', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];
    
    if (!message) return res.sendStatus(200);

    const sender = message.from;
    const messageType = message.type;

    if (messageType === 'text') {
      // Handle text messages directly
      const prompt = message.text.body;
      const chat = genAI.getGenerativeModel({ model: MODEL_NAME }).startChat({ history: [] });
      
      // Initialize with identity
      await chat.sendMessage(`
        You are "${BOT_NAME}", created by ${NAME}. 
        Respond helpfully and concisely to the user.
      `);
      
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
        let fileData;
        
        if (messageType === 'document' && mimeType === 'application/pdf') {
          // Process PDF
          const imagePath = await processPDF(mediaPath);
          if (!imagePath) {
            await sendMessage(sender, "Sorry, I couldn't process that PDF");
            return;
          }
          
          fileData = await uploadFileToGemini(imagePath);
          fs.unlinkSync(imagePath);
        } else {
          // Process other media
          fileData = await uploadFileToGemini(mediaPath);
        }
        
        // Analyze media
        const result = await model.generateContent([
          "Please describe this file concisely:", 
          fileData
        ]);
        const description = result.response.text();
        
        // Generate response
        const chat = genAI.getGenerativeModel({ model: MODEL_NAME }).startChat({ history: [] });
        await chat.sendMessage(`
          You are ${BOT_NAME}. The user sent a media file with this description: 
          "${description}". 
          Respond helpfully and concisely.
        `);
        
        const response = await chat.sendMessage("Please respond to the user about this media");
        await sendMessage(sender, response.response.text());
      } finally {
        if (mediaPath && fs.existsSync(mediaPath)) fs.unlinkSync(mediaPath);
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Error processing message:', error);
    res.sendStatus(200);
  }
});

export default router;