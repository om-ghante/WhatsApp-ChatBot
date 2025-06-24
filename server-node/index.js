require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// WhatsApp configuration from environment
const WA_TOKEN = process.env.WA_TOKEN;
const PHONE_ID = process.env.PHONE_ID;

// Health check
app.get('/', (req, res) => res.send('WhatsApp Scheduler API'));

// Template message endpoint
app.post('/send-template', async (req, res) => {
  try {
    const { name, phone, dayOfWeek, greeting, image } = req.body;
    
    console.log('Received request to send template to:', phone);

    // Validate required fields
    if (!name || !phone || !dayOfWeek || !greeting || !image) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate phone number format
    if (!phone.match(/^\+\d{10,15}$/)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const url = `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`;
    const headers = {
      Authorization: `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json'
    };

    const templateData = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: "firsttemplate", // Must match your approved template name
        language: { code: "en_US" },
        components: [
          {
            type: "header",
            parameters: [
              {
                type: "image",
                image: { 
                  link: image // Cloudinary URL
                }
              }
            ]
          },
          {
            type: "body",
            parameters: [
              { type: "text", text: name },
              { type: "text", text: dayOfWeek },
              { type: "text", text: greeting }
            ]
          }
        ]
      }
    };

    console.log('Sending to WhatsApp API:', {
      to: phone,
      template: templateData.template.name
    });

    const response = await axios.post(url, templateData, { headers });
    console.log('WhatsApp API response:', response.data);
    
    res.json({ 
      success: true,
      message: "Template message sent successfully"
    });
  } catch (err) {
    console.error('Error sending template:', {
      message: err.message,
      response: err.response?.data,
      stack: err.stack
    });
    
    res.status(500).json({ 
      error: 'Failed to send template message',
      details: err.response?.data || err.message
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));