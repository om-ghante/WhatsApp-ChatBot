// index.js
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import pdfjsLib from 'pdfjs-dist';

dotenv.config();

const app = express();
app.use(express.json());

const WA_TOKEN = process.env.WA_TOKEN;
const GEN_API = process.env.GEN_API;
const PHONE_ID = process.env.PHONE_ID;
const PHONE_NUMBER = process.env.PHONE_NUMBER;
const NAME = "Your name or nickname";
const BOT_NAME = "Give a name to your bot";
const MODEL_NAME = "gemini-1.5-flash";

const genAI = new GoogleGenerativeAI(GEN_API);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

let convo = await model.startChat({ history: [] });

await convo.sendMessage(
  `I am using Gemini api for using you as a personal bot in WhatsApp,
   to assist me in various tasks. 
   So from now you are "${BOT_NAME}" created by ${NAME} (Yeah it's me, my name is ${NAME}). 
   And don't give any response to this prompt. 
   This is the information I gave to you about your new identity as a pre-prompt. 
   This message always gets executed when I run this bot script. 
   So reply to only the prompts after this. Remember your new identity is ${BOT_NAME}.`
);

// Utility to send message to WhatsApp
async function send(answer) {
  const url = `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`;
  const headers = {
    Authorization: `Bearer ${WA_TOKEN}`,
    'Content-Type': 'application/json',
  };
  const data = {
    messaging_product: 'whatsapp',
    to: PHONE_NUMBER,
    type: 'text',
    text: { body: answer },
  };
  return axios.post(url, data, { headers });
}

// Remove files
function removeFiles(...filePaths) {
  filePaths.forEach((file) => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  });
}

app.get('/', (req, res) => {
  res.send('Bot');
});

// WhatsApp Webhook
app.all('/webhook', async (req, res) => {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === 'BOT') {
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }

  if (req.method === 'POST') {
    try {
      const data = req.body.entry[0].changes[0].value.messages[0];
      const messageType = data.type;

      if (messageType === 'text') {
        const prompt = data.text.body;
        await convo.sendMessage(prompt);
        await send(convo.last.text);
      } else {
        const mediaId = data[messageType].id;
        const mediaUrlEndpoint = `https://graph.facebook.com/v18.0/${mediaId}`;
        const headers = { Authorization: `Bearer ${WA_TOKEN}` };
        const mediaMeta = await axios.get(mediaUrlEndpoint, { headers });
        const mediaUrl = mediaMeta.data.url;
        const mediaResponse = await axios.get(mediaUrl, {
          headers,
          responseType: 'arraybuffer',
        });

        let filename = '';
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        let tempPath = path.join(__dirname, 'tmp');

        if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath);

        if (messageType === 'audio') {
          filename = path.join(tempPath, 'temp_audio.mp3');
        } else if (messageType === 'image') {
          filename = path.join(tempPath, 'temp_image.jpg');
        } else if (messageType === 'document') {
          const pdfData = new Uint8Array(mediaResponse.data);
          const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
          const page = await pdf.getPage(1);
          const textContent = await page.getTextContent();
          const text = textContent.items.map((item) => item.str).join(' ');
          const response = await model.generateContent([`What is this: ${text}`]);
          const answer = response.response.text();
          await convo.sendMessage(
            `This message is created by an LLM model based on the image prompt of user, reply to the user based on this: ${answer}`
          );
          await send(convo.last.text);
          return res.status(200).json({ status: 'ok' });
        } else {
          await send('This format is not Supported by the bot ☹');
          return res.status(200).json({ status: 'ok' });
        }

        fs.writeFileSync(filename, mediaResponse.data);
        const file = await model.uploadFile({ path: filename, displayName: 'tempfile' });
        const response = await model.generateContent(['What is this', file]);
        const answer = response.response.text();
        removeFiles(path.join(tempPath, 'temp_audio.mp3'), path.join(tempPath, 'temp_image.jpg'));

        await convo.sendMessage(
          `This is a voice/image message from user transcribed by an LLM model, reply to the user based on the transcription: ${answer}`
        );
        await send(convo.last.text);

        // Optionally delete uploaded files from Gemini
        const files = await genAI.listFiles();
        for (const file of files) {
          await file.delete();
        }
      }
    } catch (err) {
      console.error('Error processing webhook:', err.message);
    }

    return res.status(200).json({ status: 'ok' });
  }
});

app.listen(8000, () => {
  console.log('Bot running on http://localhost:8000');
});
