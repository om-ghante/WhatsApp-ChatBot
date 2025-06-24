const express = require("express");
const router = express.Router();
const axios = require("axios");
const pdf = require("pdf-parse");
const { createCanvas, loadImage } = require("canvas");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const GEN_API = process.env.GEN_API;
const NAME = process.env.OWNER_NAME || "Om Ghante";
const BOT_NAME = process.env.BOT_NAME || "Om's AI Assistant";
const MODEL_NAME = process.env.MODEL_NAME || "gemini-1.5-flash-latest";
const WA_TOKEN = process.env.WA_TOKEN;
const MAX_HISTORY = 20;

const genAI = new GoogleGenerativeAI(GEN_API);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });
let conversationHistory = [];

// Detect language
function detectLanguage(text) {
  const marathiChars = /[\u0900-\u097F]/;
  return marathiChars.test(text) ? "marathi" : "english";
}

// Media processor
async function processMedia(buffer, mimeType) {
  try {
    if (mimeType === "application/pdf") {
      const data = await pdf(buffer);
      return `PDF Content: ${data.text}`;
    }

    if (mimeType.startsWith("image/")) {
      const img = await loadImage(buffer);
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const imageData = canvas.toDataURL("image/jpeg");

      const result = await model.generateContent([
        { text: "Describe this image in detail" },
        { inlineData: { data: imageData.split(",")[1], mimeType: "image/jpeg" } }
      ]);
      return result.response.text();
    }

    if (mimeType.startsWith("audio/")) {
      const result = await model.generateContent([
        { text: "Transcribe this audio:" },
        { inlineData: { data: buffer.toString("base64"), mimeType } }
      ]);
      return `Audio Transcript: ${result.response.text()}`;
    }

    return "Unsupported file format";
  } catch (error) {
    console.error("Media processing failed:", error);
    return "Could not process this file.";
  }
}

// GET: Verify token
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === "BOT") {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// POST: Receive message
router.post("/", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];
    const metadata = changes?.value?.metadata;

    if (!message) return res.json({ status: "ok" });

    const PHONE_NUMBER_ID = metadata.phone_number_id;

    let userInput = "";
    const userLanguage = detectLanguage(message.text?.body || "");

    if (message.type !== "text") {
      const mediaId = message[message.type]?.id;
      if (!mediaId) return res.json({ status: "ok" });

      const headers = { Authorization: `Bearer ${WA_TOKEN}` };
      const mediaUrl = `https://graph.facebook.com/v18.0/${mediaId}/`;
      const mediaResponse = await axios.get(mediaUrl, { headers });
      const mediaData = await axios.get(mediaResponse.data.url, {
        responseType: "arraybuffer",
        headers,
      });

      const mimeType = mediaResponse.data.mime_type;
      userInput = await processMedia(mediaData.data, mimeType);
    } else {
      userInput = message.text.body;
    }

    const languagePrompt = userLanguage === "marathi"
      ? " (Respond in Marathi)"
      : " (Respond in English)";

    conversationHistory.push({ role: "user", parts: [{ text: userInput }] });
    if (conversationHistory.length > MAX_HISTORY) {
      conversationHistory = conversationHistory.slice(-MAX_HISTORY);
    }

    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: `You are ${BOT_NAME}, created by ${NAME}. Respond in user's language.` }]
        },
        ...conversationHistory,
      ],
      generationConfig: {
        temperature: 0.9,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
    });

    const result = await chat.sendMessage(userInput + languagePrompt);
    const text = result.response.text();
    conversationHistory.push({ role: "model", parts: [{ text }] });

    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: message.from,
        type: "text",
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${WA_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({ status: "ok" });
  } catch (error) {
    console.error("Chatbot error:", error.response?.data || error.message);
    res.status(500).json({ error: "AI processing failed", details: error.message });
  }
});

module.exports = router;
