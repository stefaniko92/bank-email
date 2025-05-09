const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = 3001;

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Store received webhooks
let receivedWebhooks = [];

// Endpoint to receive webhooks
app.post('/webhook', (req, res) => {
  console.log('Received webhook:', JSON.stringify(req.body, null, 2));
  receivedWebhooks.push({
    timestamp: new Date().toISOString(),
    payload: req.body
  });
  res.json({ success: true, message: 'Webhook received' });
});

// Endpoint to view received webhooks
app.get('/webhooks', (req, res) => {
  res.json(receivedWebhooks);
});

// Endpoint to clear received webhooks
app.delete('/webhooks', (req, res) => {
  receivedWebhooks = [];
  res.json({ success: true, message: 'Webhooks cleared' });
});

app.listen(port, () => {
  console.log(`Test server running at http://localhost:${port}`);
  console.log(`Webhook endpoint: http://localhost:${port}/webhook`);
  console.log(`View webhooks: http://localhost:${port}/webhooks`);
}); 