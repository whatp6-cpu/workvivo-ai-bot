const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());

const HF_API_KEY = process.env.HF_API_KEY;          // Your Hugging Face token
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN; // Your Slack Bot token
const HF_MODEL = "google/flan-t5-small";           // Free hosted model for testing

// Health check
app.get('/', (req, res) => res.send('ok'));

// Incoming Slack events
app.post('/incoming', async (req, res) => {
  try {
    const body = req.body;

    // Slack URL verification
    if (body.type === 'url_verification') {
      return res.json({ challenge: body.challenge });
    }

    const evt = body.event || body;

    // Ignore bot messages
    if (!evt || evt.bot_id || evt.subtype === 'bot_message') return res.status(200).send('ignored');

    const text = evt.text || (evt.message && evt.message.text) || body.text || '';
    const userId = evt.user || evt.user_id || evt.sender || (evt.message && evt.message.user);

    if (!text || !userId) return res.status(200).send('no text/user');

    // Armenian corporate tone prompt
    const prompt = `Դու մեր ընկերական, պրոֆեսիոնալ և հստակ կորպորատիվ տոնով գրող օգնականն ես։ Խնդրում եմ ուղղիր կամ վերաշարադրիր հետևյալ տեքստը՝\n\n"""${text}"""\n\nՊատասխանիր միայն ուղղված տեքստով։`;

    // Call Hugging Face Inference API
    const hfResp = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs: prompt })
    });

    if (!hfResp.ok) {
      const errText = await hfResp.text();
      console.error('HF API error:', errText);
      await postSlackDM(userId, 'Ներողություն — AI-ն հիմա հասանելի չէ, փորձեք ավելի ուշ։');
      return res.status(200).send('hf error');
    }

    const hfJson = await hfResp.json();
    let replyText = '';

    if (Array.isArray(hfJson) && hfJson[0] && hfJson[0].generated_text) {
      replyText = hfJson[0].generated_text;
    } else if (typeof hfJson === 'string') {
      replyText = hfJson;
    } else {
      replyText = JSON.stringify(hfJson).slice(0, 2000);
    }

    await postSlackDM(userId, replyText.slice(0, 3000));
    res.status(200).send('ok');

  } catch (err) {
    console.error('Server error:', err);
    res.status(500).send('error');
  }
});

// Function to send DM back to Slack user
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
    console.error('Slack DM error:', err);
  }
}

const port = process.env.PORT || 10000;
app.listen(port, () => console.log('Server running on port', port));
