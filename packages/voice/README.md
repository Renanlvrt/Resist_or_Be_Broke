# @keephard/voice

Framework-agnostic voice interrogation (ElevenLabs Conversational AI over WebSocket) with a typed/TTS fallback.

```ts
import { createInterrogation } from '@keephard/voice';
const s = createInterrogation({ profile, product, backendUrl: 'http://localhost:8787', demo: true });
s.on('state', (st) => avatar.setState(st));   // peek|idle|listening|talking|happy|disappointed
s.on('caption', (text, who) => ...);          // who: 'avatar' | 'user'
s.on('verdict', (v) => ...);                  // every decide() call, max 2
s.on('fallback', (reason) => showTextBox());  // mic/WebSocket failed or no connection in 4s
await s.start();                              // avatar speaks first, mic opens
await s.say(result.spokenLine);               // TTS via /api/voice/speak, emits talking then idle
s.submitTyped('I need them for track');       // fallback: POST /api/voice/judge, speaks the reply
s.stop();
```

Flow: `POST /api/voice/session` returns `{signedUrl, agentId, dynamicVariables}`; the agent calls client tool `decide({verdict, reasonCategory, userReasonSummary, spokenLine})`. Mode mapping: speaking -> talking, listening -> listening, reject -> disappointed, accept -> happy, say() end -> idle. After an accept (or 2nd round) the session closes once the agent finishes its line.

The ElevenLabs agent must define a client tool named `decide` with those 4 string params and use the dynamic variables from the backend.

Typecheck: `npm i && npx tsc --noEmit`. Bundle: `npm run build`. Demo page: `demo.html`.
