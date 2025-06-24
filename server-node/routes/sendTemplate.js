const express = require("express");
const router = express.Router();
const axios = require("axios");

router.post("/", async (req, res) => {
  try {
    const { WA_TOKEN, PHONE_ID, name, phone, dayOfWeek, greeting } = req.body;

    console.log("success");
    // Removed `image` check from validation
    if (!WA_TOKEN || !PHONE_ID || !name || !phone) {
      return res.status(400).json({ error: "Missing required fields" });
    }

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

    const response = await axios.post(url, data, { headers });
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error("Template send error:", {
      message: error.message,
      response: error.response?.data,
      stack: error.stack,
    });
    res.status(500).json({
      error: "Failed to send template",
      details: error.response?.data || error.message,
    });
  }
});

module.exports = router;
