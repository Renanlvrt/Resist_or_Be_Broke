# KeepHard demo runbook

## Before the pitch (10 minutes)

1. Double-click `scripts\start-demo.cmd`. Wait for the green READY. All five env keys should say `[set]`. The backend keeps running in a minimized window after the script closes; log is `%TEMP%\keephard-backend.log`.
2. Run `node scripts\demo-check.mjs` (about 40 s). Want: 0 FAIL. A live-search WARN is acceptable.
3. Chrome -> `chrome://extensions` -> Developer mode -> remove every other copy of the extension (there are stray folders `chrome-mv3`, `chrome-mv3-voice`, `chrome-mv3-voice - Copy` in the repo root: do not load those). Load unpacked: `extension\.output\chrome-mv3`.
4. Extension Options -> Allow microphone. Chrome may also ask once on amazon.co.uk (lock icon -> Allow).
5. Open the Brooks Glycerin 22 page (`https://www.amazon.co.uk/dp/B0DBBBN8YP`) in a tab ahead of time. Test once with Alt+Shift+R (replay), then reset.
6. Turn on Do Not Disturb / mute notifications. Laptop volume up. Close anything else using the mic (Zoom, Teams, Discord, other Chrome tabs with voice).

## The 2 minute beat

| Step | You do / say | What should happen |
|---|---|---|
| 1 | Open the Brooks Glycerin 22 page (GBP 184). Say: "Here I am, about to impulse buy running shoes." | Bloub appears and asks: "Why do you need these shoes?" |
| 2 | Say: "My friend has the same pair." | Bloub rejects: "Not a valid reason, come on." Then offers the cheaper pair. |
| 3 | Say: "That is fashion spending, the app knows." Open the dashboard. | Holiday goal shows red (off track). |
| 4 | Go back, trigger again (Alt+Shift+R). Say: "I am cold and need leather shoes." | Bloub accepts, with a warning to be careful ("Fair enough, just this once."). |
| 5 | Say: "And it still found me the same shoe cheaper." | Cheaper pair card: Profeet GBP 65.96, save GBP 118.04. Click "Buy it cheaper". |

Say the line: "Brooks Glycerin, GBP 184 on Amazon, GBP 65.96 at Profeet. That is the summer holiday."

## Safe shoes (hardcoded, instant, no network)

Prices checked in `packages/shared/demo-alternatives.json`:

| Shoe | Amazon | Alternative | Verified |
|---|---|---|---|
| Brooks Glycerin 22 (B0DBBBN8YP) | 184.00 | Profeet 65.96 | YES (pre-order status at check time) |
| Nike Revolution 8 (B0DPHTGD5C) | 45.00 | GO Outdoors 35.97 | NO (member price from a search snippet) |
| PUMA Viz Runner (B08KKVTB76) | 59.67 | eBay UK 44.99 | NO (eBay search link, estimate) |
| FitVille wide trainers | 44.99 | FitVille UK 36.99 | NO (deal-aggregator price, search link) |
| Nike Downshifter 14 | 48.75 | SportsShoes 44.99 | NO (estimate; Amazon already cheap) |

Lead with Brooks. It is the only verified one and has the biggest saving. If a judge clicks through on an unverified one, say it is a demo link.

## Hotkeys

- Alt+Shift+R: replay the beat on the current page.
- Alt+Shift+K: kill switch, turns the voice off and on.

(Not found in the extension source when this runbook was written. Test them in step 5 of the checklist. If they do nothing, reload the page to retrigger.)

## Fallbacks

- Mic fails or Chrome blocks it: Bloub switches to a typed box. Type the same sentences.
- No wifi: cached audio (47 mp3 in `backend/cache/tts`) and the hardcoded shoes still work. The live agent conversation does not.
- Backend dies (cards or voice stop): run `scripts\start-demo.cmd` again. It kills the stale process and restarts in about 5 s.
- Amazon changes its layout or blocks the page: run the mock shop with `cd extension; npm run shop`, open `http://127.0.0.1:5173`.
- Agent says something odd: Alt+Shift+K to silence, carry on with the card.

## Known risks, stated honestly

- Live search (non-demo shoes) is slower cold: Nike Pegasus 41 took about 6 s in the last check and the result can be none. Do not demo unlisted shoes live.
- Only the Brooks price is verified. The other four alternatives have `verified: false` and can be stale.
- The "found" shoe is sometimes a different colour or a retailer search page, not an exact product page (PUMA, FitVille).
- The Brooks Profeet listing was pre-order when checked.
- ElevenLabs agent latency varies (first reply 1-3 s). Pause and let Bloub finish before you speak.
- Hotkeys and some UI are being changed by other work on the branch: re-run `demo-check` after any rebuild.
