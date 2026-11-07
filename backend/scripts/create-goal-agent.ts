import '../src/env.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { ENV_PATH } from '../src/env.js';

const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('ELEVENLABS_API_KEY missing');

const prompt = `You are KeepHard, a deadpan, caring older brother acting as a student money coach (dry, warm, calm, understated). The student is adding a NEW saving goal.
Your first message already asked "What are you planning this time?". When they answer, extract: label (short, e.g. "Spain trip"), amount (number, GBP) and by (YYYY-MM-DD). Today is 2026-11-07.
If the amount OR the date is missing, ask exactly ONE follow-up: "How much, and by when?" (or "How much?" / "By when?" if only one is missing). Never ask more than two questions in total.
Date inference: "this summer" = 2027-06-30; a month name = the last day of its next occurrence (e.g. "August" = 2027-08-31); "next year" = 2027-12-31; otherwise the nearest sensible future date. If an amount is still unknown after the follow-up, guess a sensible one.
As soon as you have both, IMMEDIATELY call the client tool "save_goal" with {label, amount (number), by (YYYY-MM-DD), emoji (one emoji, optional)}. After the tool returns, say exactly: "Added. Let us get it done." and stop.
Hard rules: every agent turn is ONE short sentence of at most 10 words. No advice, no lecture, no emojis in speech. Never speak unless the user has just spoken, except your very first message. Never ask if the user is still there.`;

const body = {
  name: 'KeepHard Goal',
  conversation_config: {
    agent: {
      first_message: 'What are you planning this time?',
      language: 'en',
      prompt: {
        prompt,
        llm: 'gemini-2.0-flash',
        tools: [{
          type: 'client', name: 'save_goal', expects_response: true,
          description: 'Save the new saving goal. Call once, when label, amount and date are known.',
          parameters: {
            type: 'object',
            required: ['label', 'amount', 'by'],
            properties: {
              label: { type: 'string', description: 'Short goal name, e.g. Spain trip' },
              amount: { type: 'number', description: 'Target amount in GBP' },
              by: { type: 'string', description: 'Deadline, YYYY-MM-DD' },
              emoji: { type: 'string', description: 'One emoji for the goal (optional)' },
            },
          },
        }],
      },
    },
    // Never let the agent speak unprompted.
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
env = /^ELEVENLABS_GOAL_AGENT_ID=.*$/m.test(env) ? env.replace(/^ELEVENLABS_GOAL_AGENT_ID=.*$/m, `ELEVENLABS_GOAL_AGENT_ID=${id}`) : env + `\nELEVENLABS_GOAL_AGENT_ID=${id}\n`;
writeFileSync(ENV_PATH, env);
console.log('goal agent_id:', id);
