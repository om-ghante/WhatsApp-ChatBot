const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

app.use(cors());
app.use(bodyParser.json());

app.options('/api/message', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': 'https://whats-app-chat-bot-client.vercel.app',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true'
  });
  return res.status(200).end();
});

app.post('/api/message', (req, res) => {
  const { message } = req.body;

  if (message === 'Hello') {
    return res.status(200).json({ reply: `${message} world!` });
  } else {
    return res.status(400).json({ error: 'Invalid message' });
  }
});

module.exports = serverless(app);
