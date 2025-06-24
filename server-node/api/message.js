const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();

app.use(cors({
  origin: 'https://whats-app-chat-bot-client.vercel.app', // <- your frontend
  methods: ['POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('Server Started');
});

app.post('/api/message', (req, res) => {
  const { message } = req.body;

  if (message === 'Hello') {
    return res.status(200).json({ reply: `${message} world!` });
  } else {
    return res.status(400).json({ error: 'Invalid message' });
  }
});

module.exports = serverless(app); // ✅ Important for Vercel!
