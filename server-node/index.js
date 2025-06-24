require("dotenv").config();
const express = require("express");
const cors = require("cors");
const webhookRoutes = require("./routes/webhook");
const templateRoutes = require("./routes/sendTemplate");

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Setup
const allowedOrigins = ["https://whats-app-chat-bot-client.vercel.app"];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/", (req, res) => res.send("✅ WhatsApp AI Bot is alive"));

// Routes
app.use("/webhook", webhookRoutes);
app.use("/send-template", templateRoutes);

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
