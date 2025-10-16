const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());

const HF_API_KEY = process.env.HF_API_KEY;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const HF_MODEL = "Syntheresis/auto-edit-hy-500m";

app.get('/', (req, res) => res.send('ok'));

app.post('/incoming', async (req, res) => {
  try {
    const payload = req.body;
    const evt = payload.event || payload;

    if (!evt || evt.bot_id || evt.subtype === 'bot_message') return res.status(200).send('ignored');

    const text = evt.text || (evt.message && evt.message.text) || payload.text || '';
    const userId = evt.user || evt.user_id || evt.sender || (evt.message && evt.message.user);

    if (!text || !userId) return res.status(200).send('no text/user');

    const prompt = `Դու մեր ընկերական, պրոֆեսիոնալ և հստակ կորպորատիվ տոնով գրող օգնականն ես։ Խնդրում եմ ուղղիր կամ վերաշարադրիր հետևյալ տեքստը՝\n\n"""${text}"""\n\nՊատասխանիր միայն ուղղված տեքստով։`;

    const hfResp = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 256 } })
    });

    if (!hfResp.ok) {
      console.error(await hfResp.text());
      await postSlackDM(userId, 'Ներողություն — խնդիրը AI-ի հետ էր, փորձեք ավելի ուշ։');
      return res.status(200).send('hf error');
    }

    const hfJson = await hfResp.json();
    let replyText = '';
    if (typeof hfJson === 'string') replyText = hfJson;
    else if (hfJson.generated_text) replyText = hfJson.generated_text;
    else if (Array.isArray(hfJson) && hfJson[0] && hfJson[0].generated_text) replyText = hfJson[0].generated_text;
    else replyText = JSON.stringify(hfJson).slice(0, 2000);

    await postSlackDM(userId, replyText.slice(0, 3000));
    res.status(200).send('ok');
  } catch (err) {
    console.error('incoming err', err);
    res.status(500).send('error');
  }
});

async function postSlackDM(userId, text) {
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
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('listening on', port));
