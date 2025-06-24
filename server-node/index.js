require("dotenv").config();
const express = require("express");
const cors = require("cors");
const webhookRoutes = require("./routes/webhook");
const templateRoutes = require("./routes/sendTemplate");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/", (req, res) => res.send("✅ WhatsApp AI Bot is alive"));

// Routes
app.use("/webhook", webhookRoutes);
app.use("/sendtemplate", templateRoutes);

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
