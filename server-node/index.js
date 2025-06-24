const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5000;

// Enable CORS for all routes
app.use(cors());

// Parse JSON bodies
app.use(express.json());

app.post('/api/message', (req, res) => {
  console.log('Received from frontend:', req.body.message);
  res.json({ response: 'hello' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});