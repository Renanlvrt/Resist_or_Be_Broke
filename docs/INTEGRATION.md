# Integration at T-40min

People: **You** (voice + backend), **Frontend** (extension, dashboard), **Search** (`backend/src/routes/search.ts`).
Rule: nobody merges with a red build. Announce each step in chat before and after.

## 0. Before T-40 (each person, 5 min)
- You: both Claude sessions have written `## ... ready` in `docs/HANDOFF.md`. Commit and push `packages/voice`, `backend`, `docs`. Backend starts with `.env` filled.
- Search: `?demo=1` returns `demo-search-cached.json` unchanged. Push `search.ts` only.
- Frontend: extension builds; typed box fallback exists; demo mode toggle works. Push `extension/` only.

## 1. Merge order
1. **You** push first (voice package and backend are the base everyone depends on). Tell chat the commit hash.
2. **Search** pulls, confirms `npm run dev` still boots with their route mounted, then pushes `search.ts`. If mounting conflicts, you adjust the mount, they never touch other backend files.
3. **Frontend** pulls last (needs both), rebuilds the extension, reloads it in `chrome://extensions`, wraps `@keephard/voice`.
4. No one edits `packages/shared/*` now. If a contract is wrong, say it in chat; one person fixes, all pull.

## 2. Smoke test (run by you, on the frontend's machine or yours)
1. Start backend; in a clean shell run `/demo-check` (automated items 1-9).
2. Chrome: mic pre-granted on amazon.co.uk, extension loaded, demo mode ON.
3. Open the Nike shoe page. Avatar peeks, speaks, mic opens with no popup.
4. Say "My friend has the same pair." Expect reject, disappointed.
5. Say "OK, I need them for track." Expect accept, happy, search, spoken savings line, £20 in dashboard.
6. Run the whole flow twice end to end. Stopwatch it: under 2 minutes with talking.

## 3. Rollback to typed box (decide by T-25min)
Trigger: any of mic, ElevenLabs session, or voice package failing twice in a row.
1. Frontend switches to typed mode: the input box calls `submitTyped(text)`, and results use `/api/voice/judge` plus `/api/voice/speak` (or text only if audio fails).
2. If `/api/voice/session` fails, keep `demo: true` and typed box; the avatar lines are captions plus `/api/voice/speak`.
3. If search or speak fails, show the cached `spokenLine` from `demo-search-cached.json` as text and still add £20 to the dashboard.
4. If the latest merge broke the build, `git revert` that merge (or check out the last green hash announced in chat); do not debug live after T-25.
5. Last resort: play the backup video, narrate over it.

## 4. T-15min freeze
No merges. Run `/demo-check` once more with the full manual list, including Wi-Fi-off. Record the result in chat as GO or NO-GO.
