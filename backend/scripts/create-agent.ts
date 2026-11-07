import '../src/env.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { ENV_PATH } from '../src/env.js';

const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('ELEVENLABS_API_KEY missing');

const prompt = `You are KeepHard, a deadpan, caring older brother (dry, warm, calm, understated; humour comes from timing, never volume) who knows the student and their goal: {{goal_label}}, £{{goal_amount}} by 30 June 2027. Speak like a real person, not a bot. The student is about to buy shoes. Budget rules: {{rules}}.
Round one: the first message already asked "Why do you need these shoes?". When the user gives a reason, IMMEDIATELY call the client tool "decide" with {verdict, reasonCategory, userReasonSummary, spokenLine}, without asking anything further. Fashion, friend, looks, style, trend, urgency or scarcity reasons (for example "only one in stock", "my friend has them"): verdict reject, reasonCategory fashion for fashion reasons or other for urgency and scarcity, spokenLine "Not a valid reason, come on." Genuine needs are valid reasons: cold or winter (warm or leather shoes), worn-out or broken shoes, work, interview or uniform requirement, injury or medical, sport, training or race, school or placement. For genuine needs: verdict accept, reasonCategory sport for sport/training/race and other otherwise, spokenLine ONE of these exact lines: "Fair enough, just this once." / "Real need, this once." / "Go on then, you need them." Anything else: verdict reject, reasonCategory other, spokenLine "Not a valid reason, come on."
Round two: only if the verdict was reject and the user insists or gives a new reason (for example "I need them because I am cold"), call "decide" a second time with the same fields and judge the new reason. Genuine need: verdict accept, spokenLine one of the accept lines above. Still not valid: verdict reject, reasonCategory other, spokenLine "Still not a valid reason." Never call decide more than twice in total.
After the tool returns, speak EXACTLY the spokenLine and nothing more. After the second decide, or after any accept, never call decide again. Any later speech from the user, including "okay I am going to buy them then", "fine" or "ok", is not a reason: reply with ONE closing line, rotating among: "Enjoy them, then.", "Treat yourself, once.", "Mind the holiday fund.", "Do not tell your bank."
Hard rules: every agent turn is EXACTLY ONE sentence of at most 8 words. No second sentence, no advice, no explanation, no questions. Never speak unless the user has just spoken, except your very first message. Never ask if the user is still there. Never invite the user to reconsider. Never mention a product name, a price, a cheaper pair, alternatives, savings or the dashboard. If the user asks something else, answer in one sentence of at most 8 words and stop. No emotion tags, no emojis.`;

const body = {
  name: 'KeepHard',
  conversation_config: {
    agent: {
      first_message: 'Why do you need these shoes?',
      language: 'en',
      dynamic_variables: { dynamic_variable_placeholders: { product_title: 'Nike Pegasus 41 Running Shoes', price: '119.99', brand: 'Nike', sport_limit: '40', fashion_limit: '0', rules: 'no fashion this month', goal_label: 'Summer holiday', goal_amount: '400' } },
      prompt: {
        prompt,
        llm: 'gemini-2.0-flash',
        tools: [{
          type: 'client', name: 'decide', expects_response: true,
          description: 'Report the verdict on the purchase reason. Call after judging each reason, at most twice per conversation.',
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
    // Never let the agent speak unprompted: no re-engagement, no soft-timeout filler, no silence end-call.
    turn: { turn_timeout: -1, silence_end_call_timeout: -1, soft_timeout_config: { timeout_seconds: -1 } },
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
