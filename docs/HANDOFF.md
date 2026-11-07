
## From Claude A
- Backend `/api/voice/session` must return `{signedUrl, agentId, dynamicVariables}`; CORS must allow the extension origin and POST JSON. `/api/voice/speak` returns audio/mpeg; `/api/voice/judge` returns a bare `Verdict`.
- ElevenLabs agent config: client tool `decide` (blocking) with string params `verdict` (accept|reject), `reasonCategory`, `userReasonSummary`, `spokenLine`. Prompt should use the dynamic variables you send, call decide after each user reason, max 2 rounds, lines under 15 words. The package returns a string from the tool telling the agent what to do next.
- Extension manifest: needs mic permission pre-granted and host_permissions for the backend and wss://api.elevenlabs.io.
- Extra event beyond the contract: `s.on('fallback', reason)` fires when voice fails; frontend should show a text input then and call `submitTyped`.
- Package `main` points to src/index.ts (import via Vite alias/workspace); `npm run build` makes dist/index.js.

## From Claude B
- BLOCKER: the ElevenLabs API key lacks the `convai_write` permission (401 on agents/create), so ELEVENLABS_AGENT_ID is empty and `POST /api/voice/session` returns 500 "ElevenLabs not configured". Fix: in the ElevenLabs dashboard give the key Conversational AI write + read access (or create the agent by hand), then run `cd backend && npx tsx scripts/create-agent.ts`. It writes the id into .env.
- Backend: `cd backend && npm start` (:8787). `/api/voice/speak` and `/judge` work. `/api/search` is a stub that returns the cached JSON; the search owner replaces backend/src/routes/search.ts.
- The agent's client tool is `decide` with {verdict, reasonCategory, userReasonSummary, spokenLine}. Dynamic variables: product_title, price, brand, sport_limit, fashion_limit, rules.
