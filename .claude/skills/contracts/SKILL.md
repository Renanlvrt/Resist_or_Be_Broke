---
name: contracts
description: Validate packages/shared/demo-*.json against types.ts and check that the backend routes and packages/voice match docs/CONTRACTS.md. Use before integration or after anyone touches shared types, routes or the voice API.
---

# Contracts check

Read `docs/CONTRACTS.md` and `packages/shared/types.ts` first. Report mismatches only; do not edit shared files (tell the user instead).

## 1. Demo JSON vs types
Run from repo root:
```
npx tsx .claude/skills/contracts/check.ts
```
It maps demo-profile.json to `Profile`, demo-product.json to `Product`, demo-search-cached.json to `SearchResult`, and flags missing, unknown or wrongly typed fields (including `Category` keys and literal unions). Exit code 1 means a mismatch. If `tsx` is unavailable, report that and do the comparison by reading.

## 2. Backend routes vs CONTRACTS.md
Expected (Express, :8787): `POST /api/voice/session`, `/api/voice/speak`, `/api/voice/judge`, `/api/search`, `/api/interview`.
- Grep `backend/src` for route registrations (`router.post(`, `app.post(`, `app.use('/api`) and confirm each path exists, is POST, and is mounted under `/api`.
- Check each handler's body and response shape against the table: session `{profile, product}` to `{signedUrl, agentId, dynamicVariables}`; speak `{text}` to `audio/mpeg`; judge `{profile, product, userText, round}` to `Verdict`; search `SearchRequest` to `SearchResult` with `?demo=1` returning the cached JSON; interview `{answers: string[]}` to `Profile`.
- Verdict responses must use exactly the `Verdict` fields. Types must be imported from `packages/shared/types`, not redefined.

## 3. Voice package vs CONTRACTS.md
In `packages/voice`: it exports `createInterrogation({profile, product, backendUrl, demo})`. The session has `start()`, `say(text, state?)`, `submitTyped(text)`, `stop()`, and `on('state'|'caption'|'verdict', cb)` with the documented callback signatures (`AvatarState`; `(text, 'avatar'|'user')`; `Verdict`). No Vue/React imports allowed (grep for `from 'vue'` and `from 'react'`). The verdict event fires at most twice.

## Report
One line per check: PASS/FAIL plus file:line and expected-vs-actual for each mismatch. Finish with the list of mismatches and who owns the fix (see CONTRACTS.md ownership).
