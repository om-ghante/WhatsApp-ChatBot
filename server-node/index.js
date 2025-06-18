const express = require('express');

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { PDFDocument } = require('pdf-lib');

dotenv.config();
const app = express();
app.use(express.json());


const WA_TOKEN = process.env.WA_TOKEN;
const GEN_API = process.env.GEN_API;
const PHONE_ID = process.env.PHONE_ID;
const NAME = "Om";
const BOT_NAME = "OmBot";

const MODEL_NAME = "gemini-1.5-flash-latest";


const genAI = new GoogleGenerativeAI(GEN_API);
const model = genAI.getGenerativeModel({
  model: MODEL_NAME,
  generationConfig: { temperature: 1, topP: 0.95, topK: 0, maxOutputTokens: 8192 },
  safetySettings: [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  ]
});



function cleanResponse(text) {
  return text.replace(/\*{1,2}(.*?)\*{1,2}/g, '$1')
             .replace(/`{1,3}(.*?)`{1,3}/g, '$1')
             .replace(/#/g, '')
             .trim();
}


async function sendMessage(to, text) {
  try {
    await axios.post(`https://graph.facebook.com/v18.0/${PHONE_ID}/messages`, {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: cleanResponse(text) }
    }, {
      headers: {
        Authorization: `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error("Send Message Error:", error.response?.data || error.message);
  }
}


async function downloadMedia(mediaId, mimeType) {
  const mediaMeta = await axios.get(`https://graph.facebook.com/v18.0/${mediaId}/`, {
    headers: { Authorization: `Bearer ${WA_TOKEN}` }
  });
  const mediaUrl = mediaMeta.data.url;
  const mediaFile = await axios.get(mediaUrl, {
    headers: { Authorization: `Bearer ${WA_TOKEN}` },
    responseType: 'arraybuffer'
  });
  const ext = mimeType.split('/')[1];
  const filePath = path.join(os.tmpdir(), `media_${Date.now()}.${ext}`);
  fs.writeFileSync(filePath, mediaFile.data);
  return filePath;
}

async function uploadFileToGemini(filePath) {
  const ext = path.extname(filePath);
  const mimeType = ext === '.pdf' ? 'application/pdf' : 'image/jpeg';
  const base64Data = fs.readFileSync(filePath).toString('base64');
  return {
    inlineData: {
      data: base64Data,
      mimeType
    }
  };
}


app.get('/', (req, res) => {
  
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === 'BOT') {

    res.status(200).send(challenge);

  } else {
    
    res.sendStatus(403);
  }
});

app.post('/', async (req, res) => {
  try {
    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const sender = message.from;
    const type = message.type;

    if (type === 'text') {
      const prompt = message.text.body;
      const chat = genAI.getGenerativeModel({ model: MODEL_NAME }).startChat({ history: [] });
      await chat.sendMessage(`You are ${BOT_NAME} built by ${NAME}. Respond politely.`);
      const reply = await chat.sendMessage(prompt);
      await sendMessage(sender, reply.response.text());
    } else {
      const mediaId = message[type]?.id;
      const mimeType = message[type]?.mime_type;

      const filePath = await downloadMedia(mediaId, mimeType);
      const geminiFile = await uploadFileToGemini(filePath);
      const result = await model.generateContent([
        "Please describe this file briefly:",
        geminiFile
      ]);
      const fileDescription = result.response.text();

      const chat = genAI.getGenerativeModel({ model: MODEL_NAME }).startChat({ history: [] });
      await chat.sendMessage(`A user sent media with this content: ${fileDescription}`);
      const response = await chat.sendMessage("Give a helpful response based on the media.");
      await sendMessage(sender, response.response.text());

      fs.unlinkSync(filePath);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook Error:", err.message);
    res.sendStatus(200);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server listening on http://localhost:${PORT}`));

