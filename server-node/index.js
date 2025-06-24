require("dotenv").config();
const express = require("express");
const cors = require("cors");
const webhookRoutes = require("./routes/webhook");
const templateRoutes = require("./routes/sendTemplate");

const app = express();
const PORT = 8000;

// Enable CORS for all routes
app.use(cors());

// Increase payload limit for image data
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check
app.get("/", (req, res) => res.send("✅ WhatsApp Scheduler API is running"));

// Routes
app.use("/webhook", webhookRoutes);
app.use("/sendtemplate", templateRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    status: 'error',
    message: 'Unexpected server error',
    error: err.message
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`➡️  Endpoint: http://localhost:${PORT}/sendtemplate`);
});