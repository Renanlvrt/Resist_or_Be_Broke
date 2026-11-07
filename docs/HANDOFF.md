
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

## From Search (`backend/src/routes/search.ts`) ready
- `POST /api/search` implements `SearchRequest -> SearchResult`. `?demo=1` returns `demo-search-cached.json` unchanged.
- Live: Firecrawl `POST /v2/search` (query = model name + product code, `includeDomains` = nike.com (/gb only), sportsshoes.com, jdsports.co.uk, footlocker.co.uk, sportsdirect.com, ebay.co.uk, `country: GB`, limit 5, markdown) -> `askClaude` extracts offers -> we keep same model (version number, product code, no GORE-TEX/Trail/By You variants), cheaper, >= 25% of the price, UK retailer -> cheapest. URLs always come from Firecrawl, never from the model. 6 s budget.
- Fallbacks: missing keys, timeout, error or no match -> the cached JSON if the product is the demo model (Pegasus 41), else `{found:false, savings:0, spokenLine:"I couldn't find it cheaper right now.", cached:false}`.
- Only the product title/brand/price are sent out. No profile.
- Tests: `cd backend && npx tsx --test src/routes/search.test.ts` (8 tests, mocked Firecrawl + Claude). Claude B: could you add `"test": "tsx --test src/routes/*.test.ts"` to backend/package.json? I didn't touch it.
- **Team decision needed on `packages/shared/demo-search-cached.json`:** its URL is `https://example.com/demo`, and the claim (SportsShoes £99.99) doesn't match reality. Checked with Firecrawl on 7 Nov: Sports Direct sells the Nike Pegasus 41 at **£69 (was £129.99), in stock**: https://www.sportsdirect.com/nike-pegasus-41-road-running-shoes-mens-210014 . Live mode would therefore say "£50.99 cheaper at Sports Direct", not £20. Suggest updating the cached JSON to that listing (and the PRD's "about £20 saving" line), or keeping £20 but with a real URL.
