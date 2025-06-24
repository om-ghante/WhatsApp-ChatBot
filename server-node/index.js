const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5000;

// Enable CORS for all routes
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Handle OPTIONS preflight requests
app.options('/api/message', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://whats-app-chat-bot-client.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

app.post('/api/message', (req, res) => {
  console.log('Received from frontend:', req.body.message);
  res.json({ response: 'hello' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});