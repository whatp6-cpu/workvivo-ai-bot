// server.js
const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

const HF_API_KEY = process.env.HF_API_KEY;          // Hugging Face API key
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN; // Slack Bot User OAuth Token
const HF_MODEL = "google/flan-t5-small";           // Free hosted model

// Root route (optional)
app.get('/', (req, res) => res.send('ok'));

// Main incoming Slack events route
app.post('/incoming', async (req, res) => {
  try {
    const body = req.body;

    // 1️⃣ Slack URL verification
    if (body.type === 'url_verification') {
      return res.json({ challenge: body.challenge });
    }

    const evt = body.event || body;

    // Ignore messages from bots or empty events
    if (!evt || evt.bot_id || evt.subtype === 'bot_message') return res.status(200).send('ignored');

    // Extract text and user ID
    const text = evt.text || (evt.message && evt.message.text) || body.text || '';
    const userId = evt.user || evt.user_id || evt.sender || (evt.message && evt.message.user);

    if (!text || !userId) return res.status(200).send('no text/user');

    // Prepare prompt for Hugging Face
    const prompt = `Դու մեր ընկերական, պրոֆեսիոնալ և հստակ կորպորատիվ տոնով գրող օգնականն ես։ Խնդրում եմ ուղղիր կամ վերաշարադրիր հետևյալ տեքստը՝\n\n"""${text}"""\n\nՊատասխանիր միայն ուղղված տեքստով։`;

    // Send request to Hugging Face API
    const hfResp = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs: prompt })
    });

    if (!hfResp.ok) {
      console.error(await hfResp.text());
      await postSlackDM(userId, 'Ներողություն — AI-ն հիմա հասանելի չէ, փորձեք ավելի ուշ։');
      return res.status(200).send('hf error');
    }

    const hfJson = await hfResp.json();
    let replyText = '';

    if (Array.isArray(hfJson) && hfJson[0] && hfJson[0].generated_text) {
      replyText = hfJson[0].generated_text;
    } else if (hfJson.generated_text) {
      replyText = hfJson.generated_text;
    } else if (typeof hfJson === 'string') {
      replyText = hfJson;
    } else {
      replyText = JSON.stringify(hfJson).slice(0, 2000);
    }

    // Send reply back to Slack
    await postSlackDM(userId, replyText.slice(0, 3000));
    res.status(200).send('ok');

  } catch (err) {
    console.error('incoming err', err);
    res.status(500).send('error');
  }
});

// Function to send DM to Slack user
async function postSlackDM(userId, text) {
  try {
    const conv = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ users: userId })
    });
    const convJson = await conv.json();
    if (!convJson.ok) return;

    const channel = convJson.channel && convJson.channel.id;
    if (!channel) return;

    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, text })
    });
  } catch (err) {
    console.error('postSlackDM error', err);
  }
}

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
