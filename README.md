# Resist or Be Broke

A Chrome extension for UK students on loans. When you're about to buy something on Amazon, it says back **your own** monthly goals and rules, plus exactly what the purchase does to your money before next payday — and finds a cheaper identical item. It never blocks: **Continue to checkout always works**.

> It's not the AI stopping you. It's you.

## Layout (pnpm workspaces, TypeScript)

| Path | What |
| --- | --- |
| `packages/engine` | Pure TS, no AI: shared contracts (`src/types.ts`), forecast, rules, green/amber/red policy, template wording, the synthetic "Aisha" profile. Unit-tested with vitest. |
| `apps/extension` | Chrome MV3 (Vite + React): content script, check-in overlay, hover avatar, dashboard |
| `apps/backend` | Next.js API routes: `/api/alternatives` (Firecrawl + OpenAI); later `/api/interview`, `/api/message`, `/api/tts` |
| `apps/mock-shop` | Static mock shop on `localhost:5174` with Amazon's element IDs — demo fallback if Amazon's DOM breaks |

## Setup

```bash
corepack enable          # or: npm i -g pnpm
pnpm install
pnpm test                # all unit tests
cp .env.example .env     # real keys go in .env only (gitignored)

pnpm build:ext           # → apps/extension/dist
pnpm dev:shop            # mock shop on http://localhost:5174
pnpm dev:backend         # API on http://localhost:3000 (optional: the demo falls back to cached results)
```

### Load the extension

1. `pnpm build:ext`
2. Chrome → `chrome://extensions` → turn on **Developer mode** (top right)
3. **Load unpacked** → pick `apps/extension/dist`
4. After every rebuild, click the ↻ on the extension card and reload the shop tab.

The extension only runs on `amazon.co.uk` and `localhost:5174`. "Today" is pinned to 7 Nov 2026 so the numbers match the script; **Reset demo** in the dashboard footer restores Aisha's profile and log.

## Engine in one paragraph

Daily balance forecast from today up to the day before the next income; lowest point with and without the purchase.
**green** = fits the plan · **amber** = dents the goal (uses > 25% of the spare money before payday, or leaves < £25) ·
**red** = breaks a rule the user set, or takes the balance below £0 before the next income.
With Aisha on 7 Nov 2026, Nike Air Max 90 at the real Nike UK price (£134.99) leaves **£12 on 28 Nov** (vs **£146.99** without). The cheaper Nike UK option (£94.49) leaves £52.50.

## Privacy

Balance, bills, profile and decision log stay in `chrome.storage.local`. The backend only ever sees a `DecisionSummary`:
item, price, category, the computed numbers and the user's own rule/goal text.
