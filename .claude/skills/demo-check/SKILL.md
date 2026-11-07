---
name: demo-check
description: Pre-pitch checklist for KeepHard. Runs the backend, env, voice, search and fallback checks it can, and walks the user through the manual ones. Use before the demo or at T-40min integration.
---

# Demo check

Run every item you can with Bash; ask the user to do the manual ones. Report a table: item, PASS / FAIL / MANUAL-pending, one-line evidence. Never print secret values. Backend is `http://localhost:8787`. If it is down, mark dependent items FAIL and say how to start it (`cd backend && npm run dev`). Run from the repo root.

## Automated
1. Health:
   `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/health` (expect 200)
2. `.env` keys present, values hidden (also add any key named in `.env.example`):
   `for k in ELEVENLABS_API_KEY ELEVENLABS_AGENT_ID ANTHROPIC_API_KEY FIRECRAWL_API_KEY; do grep -Eq "^$k=.+" .env backend/.env 2>/dev/null && echo "$k set" || echo "$k MISSING"; done`
3. ELEVENLABS_AGENT_ID set: from the loop above, report as its own row.
4. Voice session (do not print the signedUrl):
   `curl -s -X POST http://localhost:8787/api/voice/session -H "Content-Type: application/json" -d "{\"profile\":$(cat packages/shared/demo-profile.json),\"product\":$(cat packages/shared/demo-product.json)}" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(['signedUrl','agentId','dynamicVariables'].map(k=>k+':'+(j[k]?'ok':'MISSING')).join(' '))})"`
5. Speak returns audio:
   `curl -s -X POST http://localhost:8787/api/voice/speak -H "Content-Type: application/json" -d '{"text":"Why do you need these?"}' -o speak-test.mp3 -w "%{http_code} %{content_type} %{size_download}\n"` (expect 200, audio/mpeg, size > 1000; delete speak-test.mp3 afterwards)
6. Cached search:
   `curl -s -X POST "http://localhost:8787/api/search?demo=1" -H "Content-Type: application/json" -d "{\"product\":$(cat packages/shared/demo-product.json)}"` (expect found true, cached true, savings 20, Nike Pegasus at SportsShoes)
7. Rejection path (typed judge), expect `verdict: reject`:
   `curl -s -X POST http://localhost:8787/api/voice/judge -H "Content-Type: application/json" -d "{\"profile\":$(cat packages/shared/demo-profile.json),\"product\":$(cat packages/shared/demo-product.json),\"userText\":\"My friend has the same pair.\",\"round\":1}"`
8. Acceptance path, expect `verdict: accept`, `reasonCategory: sport`: same command with `\"userText\":\"OK, I need them for track.\",\"round\":2`.
9. Contracts: run the `/contracts` skill and include its result.

## Manual (ask the user, record each answer)
10. Chrome mic pre-granted for `https://www.amazon.co.uk` (chrome://settings/content/microphone, in the Allow list; no prompt appears).
11. Extension loaded from the latest build and demo mode toggle ON in the pinned popup.
12. On an Amazon Nike shoe page the avatar peeks, speaks first, and the mic opens with no popup.
13. Say the rejection phrase ("My friend has the same pair.") then the acceptance phrase ("OK, I need them for track."): states go disappointed then happy, savings line spoken.
14. The £20 savings appear in the dashboard and `savedByKeepHard` increases.
15. Wi-Fi off: the typed box works end to end (submitTyped, verdict, text result).
16. With search/TTS failing, the cached savings line ("...twenty pounds cheaper at SportsShoes...") still shows.
17. Backup video recorded, plays offline, already open in a tab or on the desktop.

End with one line: GO / NO-GO plus the top blockers, each with its owner (see CLAUDE.md and CONTRACTS.md ownership).
