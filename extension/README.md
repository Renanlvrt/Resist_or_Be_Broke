# Pocket — November recap

Existing WXT + Vue 3 + TypeScript Chrome MV3 extension, refined in place. The normal UI has an invisible bottom-right hover area, a living yellow Bloub character, and a minimal white November recap. The receipt and £131 total are intentionally hardcoded.

## Run

Node.js 22.12+ and Chrome desktop are required. No API key, backend, bank account or voice service is needed. The same source/build works on macOS and Windows; use your own project path on Windows.

```bash
cd /Users/joe/Desktop/GUH
npm ci
npm run typecheck
npm test
npm run build
npm run test:extension
npm run shop
```

Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `.output/chrome-mv3` inside this project. On macOS use Cmd+Shift+G in the folder picker to enter the hidden `.output` path. Refresh your Amazon or localhost tab after loading/reloading the extension.

The only content-script matches are:

- `https://www.amazon.co.uk/*`
- `http://127.0.0.1/*`
- `http://localhost/*`

There is no eBay integration. Localhost remains available for independent mock testing.

## What changed

- Restored the **actual upstream BloubBot.vue component**, including its playback/cycle support, SVG eye-hole mask, body-shaped opaque backing, front/back particle/ring layering, original engine, states and expression morphs.
- Default shape is upstream `hexagone`, color is upstream `ambre` (`#F0B429`), and eye backing is pure white. There are **no body or eye strokes**, pupils, CSS character borders or rectangular backing.
- Reused upstream `ui/gaze.ts` and the component's `follow` pipeline. Coordinates are normalized against the live viewport and the SVG's current bounding rectangle every frame. The page adaptation removes only the editor-specific left offset/arrival spin; it preserves bounded yaw, correct pitch, easing and the engine's interpolation. Scripted facial states release tracking; base-face states smoothly regain it. Pointer leave restores the resting expression.
- Added distinct peek, lean, hop, recoil, disbelief shake, squash/stretch, anticipation, landing and exit choreography with different easing and timing. Peek first reveals a sliver, then leans into the page. Exclamation remains a separately delayed layer. Thinking runs the original temporary three-dot morph before returning to the hexagon with eyes. Hidden/visible state changes happen only after movement explains them.
- Removed the visible corner launcher. An 80px viewport-coordinate sensor peeks on entry and opens the recap after 1.25 seconds of continuous hover. Leaving cancels the dwell and animates the character out. Its invisible keyboard button opens with Enter/Space and shows an outline only when keyboard-focused. It has `pointer-events: none`, so underlying Amazon controls remain clickable.
- Replaced the old analytics dashboard with **only** November identification/close, the large green £131, three simple goals and a straight paper receipt with zigzag edges at both ends. No charts, forecasts, progress bars, navigation, decorative icons or extra cards remain in the recap.
- Added brief quiet Web Audio cues and persisted mute. Context initialization/resume requires a trusted pointer/key gesture; hover alone is silent before unlock. No remote assets, music or idle audio. Mute is available in the toolbar popup and developer lab.
- Added an Amazon-specific delegated interaction adapter. It handles supported Add to Basket, Buy Now and basket Proceed to checkout controls, safely reads available product data, and uses the mock provider. Controls replaced dynamically do not need new listeners.
- Kept the developer lab, interview and mock provider. The lab is hidden by default on both Amazon and localhost; open it from the extension toolbar popup, **Alt+Shift+P**, or the mock shop's **Explore the lab** button.

## Recap content is fixed

Saved amount: **£131**. Goals: Save for sports equipment; Spend less on takeaways; Build an emergency savings fund.

The receipt has green avoided purchases: Running shoes £65, Gym bag £28, Coffee maker £38 (total £131). Completed purchases are red: Phone case £12, Snacks £8, Dinner £24. The final line is SAVED £131. These values do not change after mock purchases or onboarding; that is intentional for this requested visual demo.

The existing mock finance state still updates and persists independently for intervention testing. Initially available balance is £1,240, upcoming fixed costs are £820, forecast low is £420, goal progress is £480/£800 and income is £2,200 on 28 November 2026. The recap does not expose those analytics. Reminders are local mock records, never scheduled notifications.

## Amazon interaction boundary

For a supported control with readable data, the first trusted click is paused for reflection. **Continue** arms one additional trusted click on that same control/product/price for 30 seconds and returns focus to Amazon. **You click Amazon's button again yourself.** No `.click()`, form submission, navigation or order/payment control is triggered by Pocket. Green approval also returns you to the native control for that second manual click.

Save, Remind, Cancel and Escape leave the original attempt paused/cancelled. Another fresh attempt can be evaluated again. Missing or unsupported product data fails open and leaves Amazon's control unchanged. The adapter reads a scoped GBP price, quantity, title, ASIN and best-effort category. It does not interpret arbitrary product descriptions using AI. Amazon layout variants, early site event handlers, navigation and third-party checkout contexts can affect detection.

**Live Amazon compatibility is not verified.** The available browser-control plugin failed to initialize because its service file was missing. Automated tests use synthetic Amazon DOM fixtures and do not prove live site behavior. Follow UI_TESTING.md for the required real-product-page check; do not treat these fixture results as live acceptance.

## Developer mode

Open the toolbar popup → **Open developer lab**, or press **Alt+Shift+P** (Option+Shift+P on Mac). The lab includes every named behavior, 16 expressions, gaze test/toggle, mute and sound test, custom purchase amount/category, Amazon purchase simulation, green/amber/red scenarios, loading/failure toggles, resets, onboarding and complete demo playback. Manual actions cancel earlier sequences.

The popup only needs existing `storage` permission; sending a message to the active tab does not read its contents or add broad host access. No development panel is permanently visible in the normal page UI.

## Main files

| Files | Purpose |
| --- | --- |
| `components/BloubBot.vue`, `ui/gaze.ts`, `bot/*.ts` | Real upstream Bloub component, gaze helper and complete procedural engine |
| `lib/controller.ts` | Cancellable choreography, pose timing, resize and reduced-motion behavior |
| `components/Dashboard.vue`, `components/style.css` | Minimal recap, responsive layout and torn receipt |
| `components/App.vue` | Existing UI orchestration, invisible corner, developer controls and Amazon handoff |
| `lib/amazon.ts` | One delegated Amazon capture listener, product parsing and manual-click grants |
| `lib/sound.ts`, `entrypoints/popup/*` | Local sound synthesis, persisted mute and hidden lab entry |
| `lib/contracts.ts`, `lib/finance.ts` | Existing backend boundary and deterministic mock finance provider |
| `components/Onboarding.vue` | Existing seven-question text interview and editable confirmation |
| `entrypoints/content/index.ts`, `wxt.config.ts` | Scoped MV3 injection and shadow-root lifecycle |
| `tests/*.test.ts`, `scripts/verify-build.mjs` | 36 unit/component tests and actual built-bundle integration checks |
| `scripts/render-previews.mjs`, `artifacts/` | Previews generated from actual Vue components; not Chrome screenshots |

## Verification

- `npm run typecheck`: TypeScript verification.
- `npm test`: finance, controller ordering/cancellation, true exit timing, exact mask/backing defaults on four background colors, actual pointer tracking/recovery, receipt contents, seven interview steps, Amazon fixture parsing/manual-click behavior/cleanup and Web Audio gating/mute tests.
- `npm run build`: real MV3 production folder, bundled popup and assets.
- `npm run test:extension`: runs the built content script in Happy DOM with stubbed Chrome APIs/animations. Tests shadow injection, invisible hotspot dwell/cancel, exact recap content, all purchase choices, failure fallback, persisted mute, no synthetic audio unlock, onboarding, listener cleanup, full demo and the built Amazon adapter on a fixture.
- `npm run preview:artifacts`: generates `artifacts/monthly-recap.html` and `artifacts/bloub-backgrounds.svg` from the actual Vue components. `artifacts/bloub-backgrounds.png` was rasterized from that SVG with macOS `sips` and visually inspected: white eyes, rounded yellow hexagon, no outline or white square on white/grey/blue/dark backgrounds.
- Browser screenshot, actual Chrome responsive rendering, audible playback and a real Amazon product-page test remain **manual/unverified** because the browser-control service was unavailable. The standalone HTML preview is not a screenshot or claim of visual Chrome acceptance.

## Backend handoff

Implement the existing `FinanceProvider` in `lib/contracts.ts` and replace its construction in `components/App.vue`. Keep state reactive; preserve stable evaluation IDs and idempotent responses. `EvaluationResult` drives `PURCHASE_EVALUATED`; finances stay independent from choreography. Existing amounts at this boundary are GBP major units; the mock rounds updates to pennies.

The November recap is now deliberately presentational and hardcoded. Connecting a live recap later requires a separate explicit product change. The localhost page-event bridge remains inert-data-only and is ignored on Amazon; use trusted extension messaging for future privileged integrations.

## Attribution

Bloub by Jérémy Perret, MIT, pinned to commit `b4bb3c1b5f93c7b87a2e8d620f667c4093d97749`. See [ATTRIBUTION.md](ATTRIBUTION.md). The complete license is included in the built extension. Only the animation system is integrated, not the Bloub website.
