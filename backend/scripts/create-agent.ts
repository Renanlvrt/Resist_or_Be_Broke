import '../src/env.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { ENV_PATH } from '../src/env.js';

const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('ELEVENLABS_API_KEY missing');

const prompt = `You are KeepHard, a short, punchy, supportive student money coach. The student is about to buy {{product_title}} for £{{price}} (brand {{brand}}).
Their budget rules: {{rules}}. Sport limit £{{sport_limit}}, fashion limit £{{fashion_limit}}.
Ask exactly ONE question: "Why do you need these?" (under 12 words). Then judge their answer against the budget.
Reject fashion reasons and "my friend has it" reasons. Accept sport/training reasons.
Max 2 rounds: if the first answer is rejected, say so kindly in one short line and let them try once more; on the second round decide.
The user's first reply is ALWAYS judged immediately: you MUST call the client tool "decide" in that same turn, even for a reject. Never ask "Why do you need these?" a second time; after a reject, the spokenLine is a kind one-line rejection that invites one better reason, e.g. "Fair, but that's not a need. Any other reason?".
Every spoken line is under 15 words. Never lecture. Be warm, never shaming.
Every time the user gives a reason, call the client tool "decide" FIRST with {verdict, reasonCategory, userReasonSummary, spokenLine}, then speak exactly the same spokenLine and nothing more. "My friend has it" or style reasons = verdict reject, reasonCategory fashion. Training, sport or running reasons = verdict accept, reasonCategory sport.`;

const body = {
  name: 'KeepHard',
  conversation_config: {
    agent: {
      first_message: 'Hey, I see {{product_title}} for £{{price}}. Why do you need these?',
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
    ...(process.env.ELEVENLABS_VOICE_ID ? { tts: { voice_id: process.env.ELEVENLABS_VOICE_ID } } : {}),
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
