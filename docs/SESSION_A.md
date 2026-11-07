# Session A startup prompt: packages/voice

Paste everything below the line into a fresh Claude Code session in the repo root.

---

You are Claude A on KeepHard (GreatUniHack). Read `CLAUDE.md`, `docs/CONTRACTS.md`, `packages/shared/types.ts` and `docs/HANDOFF.md` (if it exists) before writing code.

**Your job:** build `packages/voice`, a framework-agnostic TypeScript package (no Vue/React imports) exposing `createInterrogation({ profile, product, backendUrl, demo })` exactly as specified in CONTRACTS.md: `on('state'|'caption'|'verdict')`, `start()`, `say(text, state?)`, `submitTyped(text)`, `stop()`.

**Ownership**
- You own: `packages/voice/**`.
- You may read everything. You must not edit `backend/**` (Claude B), `extension/**` (frontend teammate), `backend/src/routes/search.ts` (search teammate), `packages/shared/*` (team-agreed only), or `docs/` files other than `docs/HANDOFF.md`.

**Behaviour**
- `start()`: POST `${backendUrl}/api/voice/session` with `{profile, product}`, open the ElevenLabs Conversational AI session with the returned `signedUrl` and `dynamicVariables`. Avatar speaks first, mic opens with no popup (permission is pre-granted).
- Drive `AvatarState`: peek, idle, listening, talking, happy (accept), disappointed (reject).
- The agent calls a client tool `decide` with the verdict; emit `verdict` on each call (max 2). Interrogation is 1-2 back-and-forths, short lines under 15 words.
- Fallbacks: if the session fails or the mic is denied, switch to typed mode: `submitTyped(text)` calls `/api/voice/judge` (`{profile, product, userText, round}`) and plays `/api/voice/speak` audio for the avatar line. `say()` uses `/api/voice/speak`.
- `demo: true` means demo-profile data and the cached flow; `demo: false` uses live everything.
- Keys never appear in this package; only the backend holds them.

**Verify** by running: typecheck, a small node/vitest script with a mocked backend covering reject then accept, and the typed fallback. Do not claim done without running it.

**HANDOFF.md protocol** (`docs/HANDOFF.md`, the only shared channel)
- Need something from Claude B (route shape change, a new field, a bug)? Append a block under `## A -> B`:
  `- [ ] (time) what you need, exact request/response, why`
- Check `## B -> A` at the start and after each milestone; when you act on an item, change `[ ]` to `[x]` and add a one-line note.
- Append only. Never edit the other side's entries, never edit their files. Anything needing a change to `packages/shared/*` goes to `## Shared change requests` for the human to agree in chat.
- When your package is done, append `## A -> ALL: voice ready` with the import path, build command and one usage snippet.

Start by summarising the contract in 5 lines, then build.
