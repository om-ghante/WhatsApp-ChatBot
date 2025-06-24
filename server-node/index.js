const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cors = require('cors');

require('dotenv').config();

const PORT = process.env.PORT || 6173;

app.get('/', (req, res) => {
    res.send('Server Started');
});

app.use(bodyParser.json());
app.use(cors());


app.post('/api/message', (req, res) => {
  const { message } = req.body;

  if (message === 'Hello') {
    return res.status(200).json({ reply: `${message} world!` });
  } else {
    return res.status(400).json({ error: 'Invalid message' });
  }
});

app.listen(PORT, () => {
    console.log(`Server is running on ${PORT}`)
})