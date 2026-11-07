# Session B startup prompt: backend voice routes + interview + integration

Paste everything below the line into a fresh Claude Code session in the repo root.

---

You are Claude B on KeepHard (GreatUniHack). Read `CLAUDE.md`, `docs/CONTRACTS.md`, `packages/shared/types.ts` and `docs/HANDOFF.md` (if it exists) before writing code.

**Your job:** the Express backend on :8787 except search, plus integration support.

**Ownership**
- You own: `backend/**` except `backend/src/routes/search.ts`, and `docs/`.
- You must not edit `packages/voice/**` (Claude A), `extension/**` (frontend), `backend/src/routes/search.ts` (search teammate), `packages/shared/*` without team agreement.

**Build**
- `GET /health` returns 200.
- `POST /api/voice/session`: `{profile, product}` to `{signedUrl, agentId, dynamicVariables}`. Get the signed URL from ElevenLabs using `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID`. Dynamic variables carry the budget, category limits and product the agent needs.
- `POST /api/voice/speak`: `{text}` to `audio/mpeg` via ElevenLabs TTS, stock voice only (no cloning).
- `POST /api/voice/judge`: `{profile, product, userText, round}` to `Verdict`. Claude decides against the profile; a keyword fallback (friend/same pair/bored => fashion reject; track/run/sport => sport accept) when the LLM fails. Supportive tone, no investment advice, `spokenLine` under 15 words.
- `POST /api/interview`: `{answers: string[]}` to `Profile` (2-3 questions, live voice, not demoed but must work).
- Mount the search router from `search.ts` at `/api/search` without editing it (stub import if the file is missing and tell the human).
- Keys only from `.env` (gitignored), never logged or hardcoded; provide `.env.example` with names only.
- CORS open for the extension origin. Import types from `packages/shared/types`.

**Verify** with the curl commands in `.claude/skills/demo-check/SKILL.md` (items 1-8) and `/contracts`. Run them; do not claim done untested.

**HANDOFF.md protocol** (`docs/HANDOFF.md`, the only shared channel; create it on first need with sections `## A -> B`, `## B -> A`, `## Shared change requests`)
- Need something from Claude A? Append under `## B -> A`: `- [ ] (time) what, exact request/response, why`.
- Check `## A -> B` at the start and after each milestone; mark `[x]` with a one-line note when handled.
- Append only; never edit the other side's entries or files. Shared type changes go under `## Shared change requests` for the human.
- When routes are live, append `## B -> ALL: backend ready` with the start command, port, env names, and a curl example per route.

Start by listing the five routes and their response shapes in 5 lines, then build.
