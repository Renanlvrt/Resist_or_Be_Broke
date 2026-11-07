# KeepHard — GreatUniHack 2026

Chrome extension (Vue 3 + TS, CRXJS) + Express backend. When a student (persona Sam, on a loan) is about to buy something on Amazon, an animated avatar interrogates them by voice (ElevenLabs Conversational AI, speech-to-speech), accepts or rejects the reason against the budget in `packages/shared/demo-profile.json`, then suggests the same product cheaper (Firecrawl + Claude) and records the savings on a dashboard. Tracks: Overall, NatWest (financial inclusion), ElevenLabs. No n8n.

**Pitch:** 2 min + 1 min Q&A. Judges: Problem & Impact 25, Technical 25, Creativity 20, Design 15, Presentation 15. See `PRD.md`.

## Rules
- 2h build. DEMO FIRST. Demo mode is default and hardcoded where it can break (profile, cached search); ElevenLabs and the verdict stay live with fallbacks. Non-demo mode (toggle in pinned popup) uses live everything.
- Interrogation: 1-2 back-and-forths, fast, not robotic (short lines, <15 words).
- Contracts in `docs/CONTRACTS.md` + `packages/shared/types.ts`. Do not change without team agreement.
- Secrets: only in `.env` (gitignored). Never commit, log or hardcode keys. Keys live on the backend only.
- Inform only, supportive tone, no investment advice, ElevenLabs stock voice (no cloning).
- Ownership: see CONTRACTS.md "Git/merge rules". Stay in your folders.
- Dashboard "add goal" must work but is not demoed; monthly interview (2-3 questions, live voice) must work but is not demoed.
- Keep code minimal; no speculative abstractions. Verify by running before claiming done.

## Skills
`/demo-check` pre-pitch checklist · `/contracts` validate shared JSON vs types.
