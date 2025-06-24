require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const pdf = require("pdf-parse");
const { createCanvas, loadImage } = require("canvas");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.ORIGIN_API,
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Config & Model
const GEN_API = process.env.GEN_API;
const NAME = process.env.OWNER_NAME || "Om Ghante";
const BOT_NAME = process.env.BOT_NAME || "Om Ghante's ChatBot";
const MODEL_NAME = process.env.MODEL_NAME || "gemini-1.5-flash-latest";

const genAI = new GoogleGenerativeAI(GEN_API);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

let conversationHistory = [];
const MAX_HISTORY = 20;

// Health check
app.get("/", (req, res) => res.send("✅ WhatsApp AI Bot is alive"));

// Webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === "BOT") {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// WhatsApp webhook receiver
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];
    const metadata = changes?.value?.metadata;

    if (!message) return res.json({ status: "ok" });

    const PHONE_NUMBER_ID = metadata.phone_number_id;
    const WA_TOKEN = process.env.WA_TOKEN;

    let userInput = "";
    const userLanguage = detectLanguage(message.text?.body || "");

    if (message.type !== "text") {
      const mediaId = message[message.type]?.id;
      if (!mediaId) return res.json({ status: "ok" });

      const mediaUrl = `https://graph.facebook.com/v18.0/${mediaId}/`;
      const headers = { Authorization: `Bearer ${WA_TOKEN}` };

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
          parts: [{ text: `You are ${BOT_NAME} created by ${NAME}. Respond in the user's language.` }],
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
    console.error("Webhook error:", error.response?.data || error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Send template API
app.post("/send-template", async (req, res) => {
  const { WA_TOKEN, PHONE_ID, name, phone, dayOfWeek, greeting, image } = req.body;

  const url = `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`;
  const headers = {
    Authorization: `Bearer ${WA_TOKEN}`,
    "Content-Type": "application/json",
  };

  const data = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: "firsttemplate",
      language: { code: "en_US" },
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "image",
              image: { link: `data:image/jpeg;base64,${image}` },
            },
          ],
        },
        {
          type: "body",
          parameters: [
            { type: "text", text: name },
            { type: "text", text: dayOfWeek },
            { type: "text", text: greeting },
          ],
        },
      ],
    },
  };

  try {
    await axios.post(url, data, { headers });
    res.json({ success: true });
  } catch (error) {
    console.error("Template send error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to send template message" });
  }
});

// Language detection
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
        { inlineData: { data: imageData.split(",")[1], mimeType: "image/jpeg" } },
      ]);

      return result.response.text();
    }

    if (mimeType.startsWith("audio/")) {
      const result = await model.generateContent([
        { text: "Transcribe this audio:" },
        { inlineData: { data: buffer.toString("base64"), mimeType } },
      ]);

      return `Audio Transcription: ${result.response.text()}`;
    }

    return "Unsupported file format";
  } catch (error) {
    console.error("Media processing error:", error);
    return "Error processing media";
  }
}

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
