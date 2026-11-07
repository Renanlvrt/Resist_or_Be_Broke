
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

## A -> B
- Verified packages/voice against @elevenlabs/client 1.35.0 (now pinned): the API usage was correct; only added explicit `connectionType: 'websocket'`.
- Agent config (dashboard/create-agent script): `decide` must be a blocking client tool (wait for response) so the returned string reaches the LLM; use TTS model `eleven_flash_v2_5` and a fast LLM, turn timeout 1-2s. Overrides (firstMessage/prompt/voice) only work if enabled in the agent's Security settings; avoid relying on them.
- Extension: getUserMedia in a content script prompts per host origin (amazon.co.uk). Preferred: render the avatar/voice in an extension-origin iframe with `allow="microphone"` so the grant is once for the extension; otherwise the user clicks Allow once on amazon.co.uk and it persists.

- [ ] (A) backend/scripts/create-agent.ts sets decide to expects_response:false, but packages/voice returns a string from the tool and docs/ELEVENLABS_AGENT_MANUAL.md uses blocking. Please change it to expects_response:true before running Route A. B owns that file.

## A -> frontend
Build the voice extension: `node scripts/make-extension.mjs` (copies your bundle to `chrome-mv3-voice/` and adds the bridge; your bundle is untouched). Event contract: `docs/CONTRACTS.md` > "Extension bridge events". Add this to your own code:
1. When a Nike/shoe product is detected on amazon.co.uk, after the `peek` state: `window.dispatchEvent(new CustomEvent('keephard:start', {detail: {product}}))` (`product` per `packages/shared/types.ts`; profile is optional, defaults to demo profile). Dispatch only once per page.
2. Map `keephard:state` (`detail.state`: peek|idle|listening|talking|happy|disappointed) to the Bloub animation states.
3. Show `keephard:caption` (`detail.text`, `detail.who`) as the speech bubble / transcript.
4. On `keephard:fallback`, show a text input and send `window.dispatchEvent(new CustomEvent('keephard:typed', {detail:{text}}))`.
5. On `keephard:verdict` with `verdict.verdict === 'accept'`, call `/api/search` (backend :8787, via your own fetch or request it through the background) and then `window.dispatchEvent(new CustomEvent('keephard:say', {detail:{text: result.spokenLine, state:'happy'}}))`; add `result.savings` to `savedByKeepHard` and the dashboard.
6. Call `keephard:stop` when the user dismisses Bloub or leaves the product.
Mic: open the extension's Options page once and click "Allow microphone" (note: the content script runs in the amazon.co.uk origin, so Chrome may also ask once there; if denied, `keephard:fallback` fires and typed mode works).
