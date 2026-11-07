# Resist or Be Broke

A Chrome extension for UK students on loans. When you're about to buy something on Amazon, it says back **your own** monthly goals and rules, plus exactly what the purchase does to your money before next payday — and finds a cheaper identical item. It never blocks: **Continue to checkout always works**.

> It's not the AI stopping you. It's you.

## Layout (pnpm workspaces, TypeScript)

| Path | What |
| --- | --- |
| `packages/engine` | Pure TS, no AI: shared contracts (`src/types.ts`), forecast, rules, green/amber/red policy, template wording, the synthetic "Aisha" profile. Unit-tested with vitest. |
| `apps/extension` | Chrome MV3 (Vite + React): content script, check-in overlay, hover avatar, dashboard *(step 2)* |
| `apps/backend` | Next.js API routes: `/api/interview`, `/api/message`, `/api/tts`, `/api/alternatives` *(steps 3–4)* |
| `apps/mock-shop` | Static mock product/checkout page — demo fallback if Amazon's DOM breaks *(step 2)* |

## Setup

```bash
corepack enable          # or: npm i -g pnpm
pnpm install
pnpm test                # engine unit tests
cp .env.example .env     # real keys go in .env only (gitignored)
```

## Engine in one paragraph

Daily balance forecast from today up to the day before the next income; lowest point with and without the purchase.
**green** = fits the plan · **amber** = dents the goal (uses > 25% of the spare money before payday, or leaves < £25) ·
**red** = breaks a rule the user set, or takes the balance below £0 before the next income.
With Aisha on 7 Nov 2026, a £60 purchase leaves **£12 on 28 Nov** (vs **£72** without).

## Privacy

Balance, bills, profile and decision log stay in `chrome.storage.local`. The backend only ever sees a `DecisionSummary`:
item, price, category, the computed numbers and the user's own rule/goal text.
