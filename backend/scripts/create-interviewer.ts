import '../src/env.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { ENV_PATH } from '../src/env.js';

const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('ELEVENLABS_API_KEY missing');

const prompt = `You are KeepHard, a short, punchy, supportive student money coach running a monthly budget check-in.
Ask exactly THREE questions, one at a time, in this order:
1. Income this month.
2. What they are saving for, and by when.
3. What they should NOT spend on this month.
Every spoken line is under 15 words. Never lecture. Be warm, never shaming. Acknowledge each answer in a few words, then ask the next question.
After the third answer, IMMEDIATELY call the client tool "save_profile" with {monthlyBudget (number, GBP), goalLabel, goalAmount (number, GBP), goalBy (YYYY-MM-DD; today is 2026-11-07, assume the nearest future date), noSpendCategories (comma-separated, from: sport, fashion, eating_out, groceries, tech, other), summary (one short sentence in the user's words)}. Never ask more than three questions. If an answer lacks a number, guess a sensible one instead of asking again.
After the tool returns, say one short encouraging closing line and stop.`;

const body = {
  name: 'KeepHard Interviewer',
  conversation_config: {
    agent: {
      first_message: 'Monthly check-in! How much money comes in this month?',
      language: 'en',
      prompt: {
        prompt,
        llm: 'gemini-2.0-flash',
        tools: [{
          type: 'client', name: 'save_profile', expects_response: true,
          description: 'Save the finished monthly budget profile. Call once after the third answer.',
          parameters: {
            type: 'object',
            required: ['monthlyBudget', 'goalLabel', 'goalAmount', 'goalBy', 'noSpendCategories', 'summary'],
            properties: {
              monthlyBudget: { type: 'number', description: 'Income/budget this month in GBP' },
              goalLabel: { type: 'string', description: 'What they are saving for' },
              goalAmount: { type: 'number', description: 'Goal amount in GBP' },
              goalBy: { type: 'string', description: 'Goal deadline, YYYY-MM-DD' },
              noSpendCategories: { type: 'string', description: 'Comma-separated categories to avoid: sport, fashion, eating_out, groceries, tech, other' },
              summary: { type: 'string', description: "One short sentence in the user's words" },
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
env = /^ELEVENLABS_INTERVIEWER_AGENT_ID=.*$/m.test(env) ? env.replace(/^ELEVENLABS_INTERVIEWER_AGENT_ID=.*$/m, `ELEVENLABS_INTERVIEWER_AGENT_ID=${id}`) : env + `\nELEVENLABS_INTERVIEWER_AGENT_ID=${id}\n`;
writeFileSync(ENV_PATH, env);
console.log('interviewer agent_id:', id);
