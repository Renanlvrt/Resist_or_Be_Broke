# KeepHard: Devpost submission

Tracks: Overall, NatWest AI-Powered Financial Inclusion & Resilience, ElevenLabs Best Use of ElevenLabs.

## Tagline

A friend with your budget in their head, standing next to you at checkout.

## Inspiration

Students run out of money before the term runs out. Save the Student's 2026 survey (a self-selected online poll of 1,419 students, so a survey, not official statistics) puts average student spending at £1,146 a month, with a £467 monthly gap after the Maintenance Loan, and 77% worry about repaying. A Censuswide poll of 2,000 UK adults (June 2025) found 42 impulse purchases a year, about £944, and 61% regret impulse buys at least occasionally. Among 16 to 34-year-olds, 87% have bought on impulse because of social media.

Today's tools act too late or too loudly. Bank apps show what you spent after the money has gone. Cleo's Roast Mode is a separate app that judges after the fact. Checkout-blocker extensions show a generic "are you sure?" with no knowledge of your budget, and they are easy to ignore.

We wanted to be there at the moment of purchase, using the user's own budget, and to offer a way out other than "no".

## What it does

KeepHard is a Chrome extension. When a student is about to buy something on Amazon, an animated avatar pops up and asks by voice: "Why do you need these?"

1. The student answers out loud. The avatar weighs the reason against the budget the student set (for example fashion £0, sport £40 a month) and gives a binary verdict, accept or reject. Every rejection cites the student's own budget, never "the AI thinks".
2. The avatar changes mood (disappointed, happy). The student can push back once, so there are at most two rounds.
3. On an accept, Firecrawl and Claude find the same product cheaper. The avatar says the saving aloud, and the saving is recorded to `savedByKeepHard`.
4. Hover the bottom-right corner and the avatar peeks. Hover again and a dashboard opens with the monthly recap, an encouraging message and an "Add goal" button.
5. Monthly interview: 2 to 3 live voice questions turn the student's answers into their budget profile. It is built and works, but we do not demo it.

**The principle:** it is not the AI stopping you, it is you. The avatar only repeats your own budget and does the maths. It persuades and never blocks: "continue to checkout" always works.

## How we built it

- **ElevenLabs Conversational AI (speech-to-speech):** the avatar speaks first, the mic opens, and the student talks back with no typing. The backend mints a signed session URL and passes the budget and product as dynamic variables, so the keys never reach the browser. Lines are kept under 15 words so it feels like a conversation, not a lecture. ElevenLabs TTS reads the savings line. Stock voice only, no cloning.
- **Claude:** judges each reason against the category limit (`/api/voice/judge`), picks the matching cheaper product from search results, writes the spoken line, and turns the interview answers into a `Profile`. A keyword fallback (friend/same leads to reject, track/sport leads to accept) takes over if Claude takes more than 2 s or fails.
- **Firecrawl:** searches for the same product at a lower price. Claude reads the messy results and chooses the match.
- **Chrome extension:** Vue 3 + TypeScript with CRXJS. A content script on Amazon runs the avatar. A framework-agnostic voice package (`@keephard/voice`) is wired in through a decoupled `window` CustomEvent bridge. Backend calls go through the background service worker.
- **Express backend on :8787:** `/api/voice/{session,speak,judge}`, `/api/search`, `/api/interview`. API keys live in `.env` on the backend only.
- **Storage:** profile, savings and goals live in `chrome.storage.local`.
- **Modes:** demo mode is the default, with a hardcoded profile and cached search. A toggle in the pinned popup switches to live everything.

## What is real and what is mocked

We would rather say this than have a judge find it.

| Part | Demo mode (default) | Live mode (popup toggle) |
| --- | --- | --- |
| Budget profile | Hardcoded persona Sam, 20, student loan (`demo-profile.json`) | Built from the monthly voice interview |
| Voice conversation | Live ElevenLabs speech-to-speech | Live ElevenLabs |
| Verdict | Live Claude against the hardcoded profile, with keyword fallback | Live Claude, with keyword fallback |
| Cheaper product search | Cached JSON (`demo-search-cached.json`) | Live Firecrawl + Claude |
| Savings line | ElevenLabs TTS (clip may be pre-cached) | ElevenLabs TTS |
| Dashboard recap ("last month saved") | Seeded sample figures, not real history | Built from recorded `savedByKeepHard` |
| Bank data | None. No real bank connection. | None. Open Banking needs FCA authorisation, so it is future work. |
| Retailers | Amazon only, a fixed Nike page plus our own mock page | Amazon only |

## Challenges we ran into

- Making speech-to-speech feel like a conversation rather than a form: short lines, avatar speaks first, mic open with no permission popup.
- Getting a budget-aware verdict in under 2 s. Hence the keyword fallback.
- Keeping API keys off the client while the browser still opens a real-time voice session.
- Splitting the work across four people in 2 hours. We froze the contracts in `docs/CONTRACTS.md` and `packages/shared/types.ts` first, and used a decoupled event bridge so the voice package and the Vue avatar never import each other.
- Staying on the right side of advice rules. We recommend no products or investments, only budget maths and the same item at a lower price.

## Accomplishments that we are proud of

- A full voice loop in 2 hours: ask, listen, judge, change mood, find a cheaper item, speak the saving, record it.
- A product that persuades instead of blocking, which is the ethical choice and also the one that keeps users from uninstalling.
- Every rejection states the rule behind it, so the avatar is transparent about why.
- Captions on every line plus a typed fallback, so it works when the mic or the room does not.
- Demo mode that survives bad Wi-Fi, with the real path behind a toggle.

## What we learned

- Voice changes the feel of a budget rule. "Fashion is £0 this month" said aloud by a face is harder to wave away than a pop-up.
- Hershfield et al. (2011) found that people who interacted with age-progressed versions of themselves saved more for the future. These were lab studies, mostly with hypothetical money, so we treat them as motivation, not proof that KeepHard works. We have not measured user outcomes.
- Short lines and fast turn-taking matter more for naturalness than voice quality alone.
- Fallbacks are part of the design: cached search, keyword verdict and typed input.

## What is next

- Real bank data through an FCA-authorised Open Banking provider, or inside the NatWest app for student accounts.
- Other retailers beyond Amazon.
- Tuning for other age groups and for people with irregular income.
- Signposting free debt advice when answers suggest serious hardship (a design rule today, not yet a tested feature).
- User testing with real students to measure whether the saved amounts hold up.

## Built with

ElevenLabs Conversational AI, ElevenLabs TTS, Claude API (Anthropic), Firecrawl, Chrome Extension Manifest V3, CRXJS, Vue 3, TypeScript, Node.js, Express, `chrome.storage.local`.

---

## Judging criteria mapping

### Overall (Problem & Impact 25, Technical 25, Creativity 20, Design 15, Presentation 15)

| Criterion | Where we answer it |
| --- | --- |
| Problem & Impact (25) | Sourced gap: £467 monthly gap after the loan, 42 impulse buys a year (about £944), 61% regret. We act at the moment of purchase, where bank apps and statements are too late. |
| Technical (25) | Real-time speech-to-speech via ElevenLabs Conversational AI, budget-aware Claude verdict under 2 s with a fallback, Firecrawl + Claude product matching, signed sessions so keys stay on the backend, decoupled voice package and extension bridge. |
| Creativity (20) | Not a blocker. It argues from your own budget, then finds the cheaper version so you still get the item. A friend at the checkout instead of a warning. |
| Design (15) | An avatar with moods (peek, speaking, disappointed, happy) is harder to ignore than a pop-up. Captions on every line, typed fallback, plain English, amounts in £. |
| Presentation (15) | Live demo on Amazon with one story (Sam, two rounds, one saving, one dashboard), a demo-mode fallback and a backup video. |

### NatWest: AI-Powered Financial Inclusion & Resilience

| Criterion | Where we answer it |
| --- | --- |
| Customer focus | Built for Sam, 20, a student on a loan managing money alone and trying to reach the next payment. Not for wealthy users, and not for people already in serious debt, who get signposted to free debt advice. |
| Innovation | Intervention at the point of purchase, by voice, with the user's own budget, plus a cheaper alternative. Existing tools are after-the-fact or generic. |
| Social impact and inclusivity | Voice is easier than reading numbers for people who struggle with dashboards. Captions and typed input cover the other cases. Inform only, so it respects autonomy. Supportive tone, no shaming. |
| AI and data, incl. "financial time travel" | Claude judges and matches products. Our time-travel idea is the future-self framing: the avatar speaks for the student's own future and their own promises ("keep the promises you made to yourself"), backed by Hershfield et al. (2011), where talking with age-progressed selves led to more saving. We use the idea, not a rendering of an aged face, and we make no claim of measured effect. Data stays minimal: profile and savings are on-device; the cloud sees item, price, category, the spoken reason and the budget numbers needed for the verdict. |
| Feasibility | Runs today as a working extension. The path to NatWest is Open Banking via an FCA-authorised provider, or inside the NatWest app for student accounts. Fewer overdraft cases and a reason for students to choose NatWest are our hypotheses, not results. Today it uses mock data. |

### ElevenLabs: Best Use of ElevenLabs

| Criterion | Where we answer it |
| --- | --- |
| Voice core to the product | The product is the conversation: interrupting and persuading at the click. A text pop-up would be ignored. |
| Natural voices | Avatar speaks first, lines under 15 words, 1 to 2 turns, mood changes with the verdict. Stock voice, no cloning. |
| Audio makes something possible or accessible | Hands-free, in-the-moment negotiation with your own budget, and a monthly interview you answer by talking, which helps people who find forms and dashboards hard. Captions and a typed fallback keep it accessible for others. |
| Platform breadth | Conversational AI (speech-to-speech) for the interrogation and the interview, TTS for the savings line. |

---

## 2-minute pitch script (with the voice section)

The pitcher opens with the research slides. My part (voice) is the live demo window. Timings follow the PRD.

| Time | Who | Beat and script |
| --- | --- | --- |
| 0:00-0:35 | Pitcher | Research slides: £467 monthly gap, 42 impulse buys a year, 61% regret. "Apps tell you what went wrong after. Nobody is there at the checkout." |
| 0:35-0:50 | Pitcher | "Meet Sam, 20, on a student loan. Sam set a budget: fashion £0, sport £40. Sam is on Amazon." |
| 0:50-1:00 | Voice (me) | Nike page loads. The avatar peeks and asks aloud: "Why do you need these?" I say: "My friend has the same pair." |
| 1:00-1:12 | Voice (me) | Reject. The avatar looks disappointed and says the rule in one line (fashion is £0 in Sam's budget). I say: "OK, I need them for track." |
| 1:12-1:22 | Voice (me) | Accept (sport £40). The avatar is happy. |
| 1:22-1:35 | Voice (me) | Search finds the same Nike about £20 cheaper. The avatar says the saving aloud. Savings recorded. |
| 1:35-1:50 | Pitcher, me on the mouse | Hover bottom-right, avatar peeks, hover again, dashboard and monthly recap. "The avatar says well done." |
| 1:50-2:00 | Pitcher | "It never blocked Sam. Sam's budget did the talking. KeepHard: keep the promises you made to yourself." |

**My lines to say out loud in the pitch:** "That was ElevenLabs speech-to-speech, not a pre-recorded clip. Same engine runs a monthly interview that turns three spoken answers into Sam's budget." (Say the second sentence only if time allows. The interview is not demoed.)

**Voice role in one sentence:** I own the ElevenLabs agent, the interrogation, the interviewer, the monthly recap voice and the backend routes behind them.

---

## 1-minute Q&A cheat sheet: 12 hard questions

Keep each answer to 15 to 20 seconds.

1. **Is the demo real or faked?**
   Demo mode is the default and hardcodes the profile (Sam) and the cached product search. The ElevenLabs conversation and the Claude verdict are live, with a keyword fallback for the verdict. Live mode, behind the popup toggle, uses everything live. The dashboard's "last month" figures are seeded sample data.

2. **What happens to my data? Where are the keys?**
   Profile, savings and goals stay in `chrome.storage.local`. The cloud sees item title, price, category, the spoken reason and the budget numbers needed for the verdict. No account numbers or transactions. API keys are on the backend in `.env`, never in the extension, never logged.

3. **Why persuade instead of block?**
   It is the user's money and the user's budget. Blocking gets the extension uninstalled and is paternalistic. Inform-only keeps trust, and "continue" always works.

4. **Isn't a voice bot nagging a nuisance?**
   It speaks once per product, takes at most two rounds, and uses short lines. We have not user-tested nuisance yet, and that is what we would test first.

5. **Do you clone a voice or impersonate anyone?**
   No. ElevenLabs stock voice only. No cloning.

6. **Is this financial advice?**
   No. We recommend no products or investments. We do budget maths against the user's own limits, and the same item at a lower price.

7. **Does the cheaper alternative actually work live?**
   Live mode uses Firecrawl and Claude. In the demo it is a cached result, about £20 less, because venue Wi-Fi can fail. We have not benchmarked match accuracy.

8. **What if Claude or ElevenLabs is slow or the mic fails?**
   Verdict over 2 s falls to the keyword rules. A mic failure shows a typed box, and captions run on every line. The savings line can be a cached clip.

9. **Do you have evidence it changes behaviour?**
   No outcome data. The motivation is Hershfield et al. (2011) on future-self interaction, which were lab studies with mostly hypothetical money. Our sizing numbers are from a self-selected student survey and a Censuswide poll. We are explicit that it is unproven.

10. **How is this different from Cleo or checkout blockers?**
    Cleo judges after the fact in a separate app. Blockers show a generic prompt with no personal budget. We speak at the purchase, quote your own budget, and find a cheaper way.

11. **How does this connect to real bank data and NatWest?**
    Not built. It needs Open Banking through an FCA-authorised provider, or integration in the NatWest app for student accounts. Today the budget is set by the user or by the voice interview.

12. **What about vulnerable users or serious debt?**
    Not the target. Where answers suggest serious hardship, the rule is to signpost free debt advice rather than coach. That is a design rule, not a tested feature, and we say so.

---

## Demo-day checklist (voice part)

- [ ] Backend running on :8787, `.env` filled with ElevenLabs, Claude and Firecrawl keys, no keys in the repo
- [ ] Backend reachable from the extension (background service worker calls `localhost:8787`)
- [ ] ElevenLabs agent ID and signed-session route working (`/api/voice/session`)
- [ ] Extension loaded unpacked, voice bridge content script present, pinned popup shows demo mode ON
- [ ] Mic permission granted for the extension beforehand, correct input device selected, speakers loud enough for the room
- [ ] Say "My friend has the same pair" and check reject plus disappointed state and the one-line rule
- [ ] Say "I need them for track" and check accept plus happy state
- [ ] Savings line plays aloud, and savings appear in `savedByKeepHard` and on the dashboard
- [ ] Fallback typed box tested: unplug the mic or force `keephard:fallback`, then type both answers
- [ ] Cached audio ready: savings-line clip on disk in case TTS is slow
- [ ] Keyword fallback tested by forcing a Claude failure on `/api/voice/judge`
- [ ] Wi-Fi throttled test passed, hotspot ready as a backup (demo mode needs only ElevenLabs)
- [ ] Interview and Add goal tested once off-stage
- [ ] Mock Nike page open in a second tab in case Amazon changes
- [ ] Backup video queued, and the pitcher knows the cue to switch to it
- [ ] Run the `/demo-check` skill at T-40
