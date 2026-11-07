# KeepHard — PRD, Plan & Pitch

GreatUniHack 2026 · Nov 7 · 2h build · 2 min pitch + 1 min Q&A · Tracks: Overall, NatWest, ElevenLabs

## Product

KeepHard is a Chrome extension. When a student is about to buy something on Amazon, an animated avatar pops up and interrogates them by voice (ElevenLabs Conversational AI, speech-to-speech): "Why do you need these?" It weighs the reason against the budget the student set, then offers the same product cheaper and records what was saved.

**Principle:** it's not the AI stopping you, it's you. The avatar only repeats your own budget and does the maths. It persuades, never blocks: the user can always continue to checkout.

**One-liner:** a friend with your budget in their head, standing next to you at checkout.

Parts:
1. **Interrogation (the demo):** short voice exchange on a product page, verdict accept or reject per budget.
2. **Cheaper alternative:** Firecrawl finds the same item for less, Claude picks the match and writes the spoken line.
3. **Dashboard:** hover the bottom-right corner, the avatar peeks; hover again opens a dashboard with the monthly recap.
4. **Monthly interview (built, not demoed):** 2-3 live voice questions that turn answers into the budget profile.

## Problem and evidence

Students are short of money, impulse buying is one click away, and today's tools either judge after the money has gone or nag until uninstalled.

- **Money gap:** Save the Student's 2026 survey puts average student spending at £1,146 a month, with a £467 monthly gap after the Maintenance Loan. 77% worry about repaying. Self-selected online poll of 1,419 students: call it a survey, not official statistics. ([source](https://studentloancalculator.uk/news/student-money-survey-2026/))
- **Impulse spending:** Censuswide poll of 2,000 UK adults (June 2025): 42 impulse purchases a year, about £944. 87% of 16 to 34-year-olds have bought on impulse because of social media; 61% regret impulse buys at least occasionally. ([source](https://www.vanquis.com/?p=4186))
- **Why a voice that talks back works:** in Hershfield et al. (2011), people who interacted with age-progressed versions of themselves saved more for the future. Lab studies, mostly hypothetical money. ([source](https://clear.dol.gov/study/increasing-saving-behavior-through-age-progressed-renderings-future-self-hershfield-et-al-2011))

| Existing option | What it does | Where it falls short |
| --- | --- | --- |
| Cleo (Roast Mode) | AI chatbot that roasts your spending | After the fact, separate app, generic judgement ([source](https://geo.sig.ai/brands/cleo.md)) |
| Checkout-blocker extensions | Generic "are you sure?" delay | No personal budget, silent text, easy to ignore ([example](https://addons.mozilla.org/firefox/addon/the-impulse-judge/)) |
| Bank apps and statements | Show what you spent | After the money has gone |

**Our gap:** at the moment of purchase, by voice, using the user's own budget, and it finds a cheaper way to get the same thing instead of just saying no.

## Target user

A UK or international student living on a loan or own earnings, managing money alone and struggling to reach the next payment.

**Demo persona: Sam, 20, student loan.** Budget lives in `packages/shared/demo-profile.json` (category limits per month, e.g. fashion £0, sport £40).

Not the target: wealthy users, or people already in serious debt. For them the product signposts free debt advice rather than coaching. Future versions could be tuned for other age groups.

## Decisions locked

| Area | Decision | Why |
| --- | --- | --- |
| Intervention | Inform only: avatar persuades, never blocks, "continue" always works | Ethical and transparent (NatWest), respects autonomy, avoids uninstalls |
| Voice | ElevenLabs Conversational AI, speech-to-speech, stock voice | Voice is the product (ElevenLabs track); no cloning |
| AI | Claude API for verdict, product matching and wording; Firecrawl for search | Verdict and alternative both need reasoning over messy text |
| Surface | Chrome extension (Vue 3 + TS, CRXJS) + Express backend on :8787 | The purchase happens in the browser |
| Modes | Demo mode is default (hardcoded profile, cached search). Toggle in the pinned popup. Non-demo = everything live | Demo must not break; real path must exist |
| Interrogation | 1-2 back-and-forths, lines under 15 words, not robotic | Fast, human, fits 2 min |
| Automation | No n8n anywhere | Cut scope |
| Verdicts | Binary: accept or reject against category limit | Simple to explain and to test |

## Demo script (about 75 s of the 2 min pitch)

The pitcher presents the research number slides first (not our job). Then:

1. **Amazon Nike shoe page.** Normal page, nothing yet.
2. **Avatar pops up** (extension) and asks by voice: "Why do you need these?"
3. **User:** "My friend has the same pair." -> **REJECT.** Fashion limit is £0. Avatar looks disappointed, explains in one line.
4. **User insists:** "I need them for track." -> **ACCEPT.** Sport limit is £40. Avatar happy.
5. **Search:** Firecrawl + Claude finds the same Nike cheaper (about £20 saving). Avatar says it aloud.
6. **Savings recorded** to `savedByKeepHard`.
7. **Hover bottom-right:** avatar peeks. Hover again: dashboard opens with the monthly recap (last month saved, encouraging message, "Add goal" button). Add goal works but is not demoed.

Flow and states match `docs/CONTRACTS.md` (peek, speaking, disappointed, happy; max 2 verdicts).

## Functional requirements

Must-haves make the demo work end to end; nothing in Should or Could starts until every Must is done.

| ID | Priority | Requirement |
| --- | --- | --- |
| F1 | Must | Detect Nike shoe product on Amazon, read title and price, trigger avatar `peek` then `start()` |
| F2 | Must | Voice interrogation via ElevenLabs Conversational AI; avatar speaks first; mic opens without a popup (pre-granted) |
| F3 | Must | Verdict (accept or reject) per round against `demo-profile.json`, fired on `decide()` |
| F4 | Must | Avatar animation states driven by `state` events (Vue 3) |
| F5 | Must | `/api/search`: Firecrawl + Claude returns cheaper same product and `spokenLine`; `?demo=1` returns cached JSON |
| F6 | Must | Avatar says the savings line aloud (ElevenLabs TTS) |
| F7 | Must | Savings written to `savedByKeepHard` and shown on dashboard |
| F8 | Must | Bottom-right hover: avatar peeks; second hover opens dashboard with monthly recap |
| F9 | Must | Pinned popup with demo/live toggle (demo default) |
| F10 | Must | Captions on every spoken line; typed fallback (`submitTyped`) if mic fails |
| S1 | Should | Dashboard "Add goal" works (stored locally) |
| S2 | Should | Monthly interview: 2-3 live voice questions -> `Profile` via `/api/interview` |
| S3 | Should | Keyword fallback verdict when Claude is slow (>2 s) or fails |
| C1 | Could | Other retailers beyond Amazon |
| W1 | Won't | Real bank connection (Open Banking needs FCA authorisation; use mock data) |
| W2 | Won't | Hard blocking of purchases |
| W3 | Won't | Voice cloning, mobile app, multiple users |

## Non-functional requirements

Privacy and trust are part of the product and answer NatWest's "ethical, transparent and responsible" criterion.

**Privacy**
- Profile, savings and goals live in `chrome.storage.local`.
- The cloud (Claude, ElevenLabs) sees only product title, price, category, the user's spoken reason, and the budget numbers needed for the verdict. No account numbers or transactions.
- API keys on the backend only, in `.env`, never in the extension, never logged.
- Extension permissions limited to amazon.co.uk and our backend. Mic requested once on install; a plain-English privacy notice is shown at first run.

**Ethics and safety**
- Inform only. The user can always continue.
- Every rejection cites the user's own budget, never "the AI thinks". Supportive tone, no shaming.
- No investment or product-quality advice (that edges towards regulated advice). The alternative is the same product at a lower price, with budget maths only.
- If answers suggest serious hardship, signpost free debt advice instead of coaching.
- ElevenLabs stock voice only.

**Transparency:** the avatar always states the rule behind the verdict ("fashion is £0 this month in your budget"). Dashboard shows the figures.

**Accessibility:** voice plus captions plus typed input, plain English, amounts in £.

**Performance and reliability**
- First avatar line within 2 s of page detection.
- Verdict under 2 s, else keyword fallback.
- Demo mode needs no network except ElevenLabs; cached search and local profile cover the rest.

## Architecture

```
Amazon page -> content script (Vue 3 avatar) -> @keephard/voice (ElevenLabs WS)
                         |                                  |
                         v                                  v
                 Express :8787  <-- /api/voice/{session,speak,judge}
                         |-- /api/search (Firecrawl + Claude)
                         |-- /api/interview (Claude)
chrome.storage.local: profile, savedByKeepHard, goals
```

Contracts: `docs/CONTRACTS.md`, `packages/shared/types.ts`. Do not change without team agreement.

## Team and roles

| Role | Owns | Done when |
| --- | --- | --- |
| Pitcher | Research number slides, pitch, Q&A, Devpost text | Rehearsed 3 times with live demo |
| Frontend | `/extension`: Vue 3 avatar animation, dashboard, extension base, popup toggle | Avatar peeks on Nike page, states animate, hover opens dashboard |
| Voice person | ElevenLabs agent, interrogation, interviewer, in two Claude Code sessions: A owns `packages/voice/**`; B owns `backend/**` except search.ts, and `docs/` | Two-round demo works by voice; interview returns a `Profile` |
| Third | `/backend/src/routes/search.ts`: Claude API + Firecrawl, cached demo JSON | Returns cheaper Nike and `spokenLine` |

Cross-needs go in `docs/HANDOFF.md`, not by editing each other's files.

## Two-minute pitch (about 120 s)

The pitcher opens with the research slides, then hands over to the live demo.

| Time | Beat | Script |
| --- | --- | --- |
| 0:00-0:35 | Research slides | Pitcher presents the numbers: £467 monthly gap, 42 impulse buys a year, 61% regret. "Apps tell you what went wrong after. Nobody is there at the checkout." |
| 0:35-0:50 | Setup | "Meet Sam, 20, on a student loan. Sam set a budget: fashion £0, sport £40. Sam is on Amazon." |
| 0:50-1:35 | Live demo | Steps 1 to 6 above. Pitcher narrates one short line per step; the avatar does the talking. |
| 1:35-1:50 | Dashboard | Hover, peek, hover, open. "Last month Sam saved £X. The avatar says well done." |
| 1:50-2:00 | Principle and close | "It never blocked Sam. Sam's budget did the talking. KeepHard: keep the promises you made to yourself." |

## Q&A (1 min) mapped to judging criteria

Each answer is aimed at a criterion. Keep to 15 to 20 seconds.

### Overall (Problem & Impact 25, Technical 25, Creativity 20, Design 15, Presentation 15)

| Criterion | Likely question | Answer |
| --- | --- | --- |
| Problem & Impact | Who is this for and does it matter? | Students short £467 a month after the loan; impulse spend of about £944 a year hurts most when money is tight. We act at the moment of purchase. |
| Technical | What is hard here? | Real-time speech-to-speech interrogation, a budget-aware verdict in under 2 s, and a live product search that finds the same item cheaper. |
| Creativity | Isn't this a blocker extension? | Blockers ask "are you sure?". We talk to you, argue the case from your own budget, then find the cheaper one so you still get the shoes. |
| Design | Why an avatar? | A face with moods (disappointed, happy) is harder to ignore than a pop-up and feels like a friend, not a warning. |
| Presentation | How do you prove it works? | Live on Amazon, with demo mode as a fallback and live mode behind a toggle. |

### NatWest (financial inclusion, ethical, transparent, responsible)

| Question | Answer |
| --- | --- |
| Isn't this paternalistic? | It never blocks. The user can always continue. The avatar quotes the user's own budget. |
| Inclusion: why voice? | Easier than reading numbers, more accessible for people who struggle with dashboards, and aimed at students who can least afford a bad month. |
| Privacy? | Profile and savings stay on the device; the cloud sees item, price and the budget numbers needed for the verdict. |
| Is it financial advice? | No. No products or investments recommended; budget maths and the same item at a lower price only. |
| Real bank data / NatWest benefit? | Open Banking via an FCA-authorised provider, or inside the NatWest app for student accounts. Fewer overdraft cases, a reason for students to choose NatWest. Today: mock data. |

### ElevenLabs (use of the platform, voice quality, creativity)

| Question | Answer |
| --- | --- |
| How do you use ElevenLabs? | Conversational AI for the two-round, speech-to-speech interrogation and the live monthly interview; TTS for the savings line. |
| Why is voice essential? | The product is the conversation: interrupting and persuading at the click. Typed text would be ignored. |
| Latency and naturalness? | Short lines under 15 words, avatar speaks first, stock voice, emotion states match the verdict. |
| Voice cloning or safety? | None. Stock voice only. |

## Timeline (2h)

| Time | Everyone | Notes |
| --- | --- | --- |
| 0:00-0:10 | Read this PRD, `CONTRACTS.md`, agree `types.ts` and `demo-profile.json` | Freeze the contracts |
| 0:10-0:40 | Build in parallel against fake data | Frontend avatar and extension base; Voice A session and agent; Voice B routes; Third search; Pitcher slides |
| 0:40-1:20 | Core flow on each side | Voice: two-round verdicts. Frontend: states and hover. Third: cached JSON first, live second |
| 1:20-1:30 | Dashboard recap, popup toggle, Add goal, interview | Should-haves only if Musts work |
| 1:30-1:35 | Freeze features | |
| **1:20 (T-40)** | **Integration** | Frontend pulls everything and runs `/demo-check`. Bugs only, no new features |
| 1:40-2:00 | Rehearse the pitch three times with the live demo; record backup video | Pitcher leads |

## Demo checklist

- [ ] Backend runs on :8787, `.env` filled, no keys in the repo
- [ ] Demo mode on by default; toggle works in the pinned popup
- [ ] Mic pre-granted; speakers loud enough for the room
- [ ] Nike page: avatar peeks and asks "Why do you need these?"
- [ ] "My friend has the same pair" -> reject, avatar disappointed
- [ ] "I need them for track" -> accept, avatar happy
- [ ] Cheaper Nike (about £20 less) found; avatar says the savings line
- [ ] Savings appear in `savedByKeepHard` and on the dashboard
- [ ] Bottom-right hover: peek, then dashboard with recap, message and Add goal
- [ ] Add goal and live interview tested once off-stage
- [ ] Tested with Wi-Fi throttled; typed fallback works
- [ ] Backup video and mock Amazon page ready

## Risks and fallbacks

| Risk | Fallback |
| --- | --- |
| Amazon page structure changes or blocks the detector | Our own mock Nike page; hardcoded product in demo mode |
| ElevenLabs slow or mic fails | `submitTyped` captions; TTS clip pre-cached for the savings line |
| Claude verdict slow or wrong | Keyword fallback in `/api/voice/judge` (friend/same -> reject, track/sport -> accept) |
| Firecrawl slow or finds nothing | `?demo=1` cached `demo-search-cached.json` |
| Venue Wi-Fi bad | Hotspot; demo mode needs only ElevenLabs |
| Avatar animation not ready | Static avatar with state-coloured glow |
| Merge clashes | Folder ownership in `CONTRACTS.md`, handoffs in `docs/HANDOFF.md` |
| Everything fails | Backup video, narrated by the pitcher |

## Open questions (default: tick and move on)

- [ ] Final avatar design and licence if adapted from a repo. Default: original simple SVG/Lottie.
- [ ] Which Nike product page for the demo. Default: one fixed URL plus the mock page.
- [ ] Confirm NatWest as the main sponsor track.
