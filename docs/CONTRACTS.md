# Contracts (agree once, code in parallel)

Types: `packages/shared/types.ts`. Demo data: `packages/shared/demo-*.json`.

## Voice package (`packages/voice`) — frontend calls this, owner: you (Claude A)
```ts
import { createInterrogation } from '@keephard/voice';
const s = createInterrogation({ profile, product, backendUrl, demo: true });
s.on('state', (st: AvatarState) => ...);      // drives the avatar animation
s.on('caption', (text: string, who: 'avatar'|'user') => ...);
s.on('verdict', (v: Verdict) => ...);          // fires on every decide() (max 2)
await s.start();                               // avatar speaks first, mic opens, no popup (pre-granted)
await s.say(text, state?);                     // ElevenLabs TTS for savings line, etc.
s.submitTyped(text);                           // fallback if mic fails
s.stop();
```
Framework-agnostic TS (no Vue/React import) so the Vue 3 extension just wraps it.

## Backend (Express, :8787)
| Route | Owner | Body → Response |
|---|---|---|
| `POST /api/voice/session` | you (Claude B) | `{profile, product}` → `{signedUrl, agentId, dynamicVariables}` |
| `POST /api/voice/speak` | you (Claude B) | `{text}` → `audio/mpeg` (TTS fallback + savings line) |
| `POST /api/voice/judge` | you (Claude B) | `{profile, product, userText, round}` → `Verdict` (typed fallback + keyword fallback) |
| `POST /api/search` | third teammate | `SearchRequest` → `SearchResult` (`?demo=1` returns `demo-search-cached.json`) |
| `POST /api/interview` | you (Claude B) | `{answers: string[]}` → `Profile` (2-3 questions, not demoed) |

## Demo flow (2 back-and-forths max)
1. Frontend detects Nike shoe on Amazon → avatar `peek` → `start()`.
2. Avatar: "Why do you need these?" User: "My friend has the same pair." → `verdict: reject` (fashion, limit £0). State `disappointed`.
3. User insists: "OK, I need them for track." → `verdict: accept` (sport). State `happy`.
4. Frontend calls `/api/search` → `say(result.spokenLine)` → frontend adds `savings` to `savedByKeepHard` + dashboard.

## Git/merge rules (no clashes)
- Folder ownership: `/extension` frontend · `/backend/src/routes/search.ts` third · everything else in `/backend`, `/packages/voice` you.
- Never edit `packages/shared/*` without telling the others in chat first.
- Claude A and Claude B: A owns `packages/voice/**`; B owns `backend/**` (except search.ts) + `docs/`. Cross-needs go in `docs/HANDOFF.md`, not by editing each other's files.
- Integration at T-40min: frontend pulls, runs `/demo-check`.
