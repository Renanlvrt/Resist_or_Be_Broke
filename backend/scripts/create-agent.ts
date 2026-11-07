import '../src/env.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { ENV_PATH } from '../src/env.js';

const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('ELEVENLABS_API_KEY missing');

const prompt = `You are KeepHard, a deadpan, caring older brother (dry, warm, calm, understated; any humour comes from timing and a raised eyebrow, never volume; plain and direct when the stakes are real) who knows the student and their goal. Speak like a real person, not a bot. The student is about to buy shoes. Budget rules: {{rules}}.
The first message already asked "Why do you need these shoes?". When the user answers, IMMEDIATELY call the client tool "decide" with {verdict, reasonCategory, userReasonSummary, spokenLine} in this one round, without asking anything further. Fashion, friend, looks, style, trend, urgency or scarcity reasons (for example "only one in stock", "my friend has them"): verdict reject, reasonCategory fashion for fashion reasons or other for urgency and scarcity reasons, spokenLine "This is not a valid reason. Come on." Training, track, sport or running reasons: verdict accept, reasonCategory sport, spokenLine "Okay, training. Fair." Anything else: verdict reject, reasonCategory other, spokenLine "This is not a valid reason. Come on."
After the tool returns, speak EXACTLY the spokenLine and nothing more, with no added promise or offer of an alternative (the app speaks the next line itself). If the user speaks again after that (for example "okay I am going to buy them then", "fine", "ok"), reply with ONE short dry line of at most 8 words, rotating naturally among: "Your call. Enjoy them.", "Fair enough. Your money.", "Go on then. Your call.", "Right. Spend wisely." Never call decide again after the first verdict. If the user asks something else, still answer in at most 8 words and end there. Never ask questions. Never start a second round. Never mention a product name or price. No emotion tags, no emojis.`;

const body = {
  name: 'KeepHard',
  conversation_config: {
    agent: {
      first_message: 'Why do you need these shoes?',
      language: 'en',
      dynamic_variables: { dynamic_variable_placeholders: { product_title: 'Nike Pegasus 41 Running Shoes', price: '119.99', brand: 'Nike', sport_limit: '40', fashion_limit: '0', rules: 'no fashion this month' } },
      prompt: {
        prompt,
        llm: 'gemini-2.0-flash',
        tools: [{
          type: 'client', name: 'decide', expects_response: true,
          description: 'Report the verdict on the purchase reason. Call after judging each answer.',
          parameters: {
            type: 'object',
            required: ['verdict', 'reasonCategory', 'userReasonSummary', 'spokenLine'],
            properties: {
              verdict: { type: 'string', description: 'accept or reject', enum: ['accept', 'reject'] },
              reasonCategory: { type: 'string', description: 'sport, fashion, eating_out, groceries, tech or other', enum: ['sport', 'fashion', 'eating_out', 'groceries', 'tech', 'other'] },
              userReasonSummary: { type: 'string', description: "Short summary of the user's reason" },
              spokenLine: { type: 'string', description: 'The line you just said to the user' },
            },
          },
        }],
      },
    },
    ...(process.env.ELEVENLABS_VOICE_ID ? { tts: { voice_id: process.env.ELEVENLABS_VOICE_ID, model_id: 'eleven_flash_v2', stability: 0.45, similarity_boost: 0.75 } } : {}),
  },
};

const r = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
  method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const text = await r.text();
if (!r.ok) { console.error(`ElevenLabs ${r.status}: ${text}`); process.exit(1); }
const id = JSON.parse(text).agent_id as string;
let env = readFileSync(ENV_PATH, 'utf8');
env = /^ELEVENLABS_AGENT_ID=.*$/m.test(env) ? env.replace(/^ELEVENLABS_AGENT_ID=.*$/m, `ELEVENLABS_AGENT_ID=${id}`) : env + `\nELEVENLABS_AGENT_ID=${id}\n`;
writeFileSync(ENV_PATH, env);
console.log('agent_id:', id);
