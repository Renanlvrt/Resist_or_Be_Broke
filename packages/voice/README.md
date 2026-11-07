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

## API verification (@elevenlabs/client pinned to 1.35.0)
Checked against the installed 1.35.0 typings: `startSession({signedUrl, connectionType:'websocket', dynamicVariables, clientTools, onMessage({message,source}), onModeChange({mode}), onStatusChange({status}), onDisconnect(details), onError(message, context)})`. Client tool handlers may return `string | number | void` (sync or Promise); the returned string is sent back as the tool result, so the blocking `decide` tool should be configured to wait for the response.
- `signedUrl` implies websocket; `agentId` alone defaults to webrtc. We use the signed URL so the API key stays on the backend.
- Mic: the SDK calls `getUserMedia` itself. In a content script it runs in the host page origin (amazon.co.uk), so Chrome asks once per origin and remembers "Allow". To avoid a prompt on every site, host the voice UI in an extension-origin iframe (`allow="microphone"`) or extension page, where the grant is made once for `chrome-extension://<id>`. If denied, `startSession` rejects and we fall back to typed mode.
- Overrides (if needed, must be enabled in the agent's Security tab): `overrides: { agent: { firstMessage, prompt: {prompt}, language }, tts: { voiceId, modelId, speed } }`.
- Latency: set the agent LLM to a fast one (e.g. Gemini Flash / GPT-4o-mini class), TTS model `eleven_flash_v2_5`, turn timeout ~1-2s, and keep spoken lines under 15 words.
