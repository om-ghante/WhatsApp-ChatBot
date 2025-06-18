import express from 'express';
import webhookRouter from './api/webhook.js';

const app = express();
app.use('/webhook', webhookRouter);

app.get('/', (req, res) => {
  res.send("Bot is running locally!");
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});