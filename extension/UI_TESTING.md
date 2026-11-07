# Pocket 1.1 — current testing guide

## Prerequisites

Chrome desktop and Node.js 22.12+ with npm. macOS and Windows are supported by the project; Windows was not directly tested. No backend, API keys, bank account, microphone, LLM or ElevenLabs service is needed.

The repository retains WXT, Vue 3 and TypeScript. `npm ci` installs the pinned dependencies and generates WXT types.

## Exact commands

macOS:

```bash
cd /Users/joe/Desktop/GUH
npm ci
npm run typecheck
npm test
npm run build
npm run test:extension
npm run shop
```

Windows PowerShell, after copying the project:

```powershell
cd C:\path\to\GUH
npm ci
npm run typecheck
npm test
npm run build
npm run test:extension
npm run shop
```

Keep the shop terminal running. The URL is **http://127.0.0.1:5173/** (`http://localhost:5173/` also works). Port 5173 must be free. If the server from the previous run is still running, use it instead of starting a second copy.

## Load the production extension

1. Open `chrome://extensions` in Google Chrome.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Select the project folder **`.output/chrome-mv3`**, containing `manifest.json`. On macOS the full path is `/Users/joe/Desktop/GUH/.output/chrome-mv3`; use Cmd+Shift+G in the folder picker to enter a hidden path. Windows uses `.output\chrome-mv3`.
5. Open or refresh the mock shop or your `https://www.amazon.co.uk/` tab.
6. Pin Pocket in Chrome's extensions menu if you want easy access to mute and the developer lab.

The only allowed production shopping host is **www.amazon.co.uk**. eBay and other websites are not matched. Localhost/127.0.0.1 remain explicit development hosts. No remotely executable code is bundled.

## Normal UI: invisible corner

There must be **no visible bottom-right launcher, circle, label or icon**.

- Move into the last 80px of both viewport axes (bottom right). The mascot first reveals a sliver while tilted, then leans farther into the page.
- Keep your cursor there for **1.25 seconds** to open the monthly recap.
- Cross the corner quickly and leave: the dwell cancels and the mascot visibly exits; no dashboard opens later.
- Click an ordinary page control underneath that area. The invisible trigger has `pointer-events: none`; the sensor only watches viewport coordinates, so it does not take the click.
- Keyboard users can Tab to **Open Pocket monthly recap**. An outline is visible only while focused. Enter/Space opens it immediately; focusing alone does not trigger a timed opening.
- Close with × or Escape. The mascot must turn/tilt and physically exit before it becomes inactive. Focus returns to a connected trigger.

Check both a maximized desktop window and a narrow window. The mascot position is independent of the internal SVG clock.

## Monthly recap: exact visual checklist

The overlay should be roughly 77% of the desktop viewport, white, clean and quiet, with a subtle dark backdrop. It contains only:

- Small **November** identifier and close control.
- A very large green **£131** near the top left, with the small Saved this month caption.
- A lower-left heading **Your financial goals** and exactly these bullets: Save for sports equipment; Spend less on takeaways; Build an emergency savings fund.
- One straight, off-white vertical receipt on the right, with a subtle shadow and obvious fine zigzag tears at **both** top and bottom.

The receipt must read:

```text
NOVEMBER RECEIPT

DIDN'T BUY
Running shoes       £65
Gym bag             £28
Coffee maker        £38

BOUGHT
Phone case          £12
Snacks               £8
Dinner              £24

SAVED              £131
```

Avoided purchases are green (`#23874C`); completed purchases are red (`#C94D4D`). £65 + £28 + £38 = £131. No receipt rotation, folded corners, illustrations, charts, graphs, forecasts, progress bars, sidebar, goal cards or decorative symbols should remain. There are no extra actions in this recap.

At widths under 760px, the amount/goals appear first and the receipt stacks underneath; scroll within the dashboard. On short desktop viewports spacing tightens. Check that tears remain visible and no rows/close control are clipped.

These recap numbers/goals are **hardcoded**, as requested. They do not change with mock choices or onboarding. The mock provider still records state for interaction testing, independently of the recap.

### Review artifacts

```bash
npm run preview:artifacts
```

Open `artifacts/monthly-recap.html` in Chrome for the actual server-rendered recap component and stylesheet without installing the extension. This is a static design preview, **not a screenshot or an installed-extension test**. It has a working close button but no mascot/controller.

`artifacts/bloub-backgrounds.svg` is generated from the actual Bloub component. The supplied `artifacts/bloub-backgrounds.png` was rasterized on macOS with:

```bash
sips -s format png artifacts/bloub-backgrounds.svg --out artifacts/bloub-backgrounds.png
```

That PNG was visually inspected: white eyes remain solid on white/grey/blue/dark surfaces, no body outline, no white square. `sips` is macOS-only; opening the SVG/HTML itself works on Windows. These artifacts do not replace real Chrome visual checks.

## Hidden developer lab / mock mode

The lab is hidden by default on Amazon **and** localhost. Open it using any of:

1. Chrome extension toolbar popup → **Open developer lab**.
2. **Alt+Shift+P** (Option+Shift+P on Mac).
3. Mock shop → **Explore the lab**.

The lab shows current state and last event. It contains every named action, 16 expressions, a mouse-follow toggle/test, mute/test sound, purchase scenarios, amount/category inputs, an Amazon simulation, simulated thinking/failure, onboarding, financial reset, position reset and full demo.

The shortcut/popup work on Amazon. The local `pocket:shop` page bridge is intentionally ignored on Amazon.

### Character behavior tests

| Action | Inspect |
| --- | --- |
| IDLE | Yellow rounded hexagon, white eyes, subtle breathing/sway/blinks; not constant bouncing |
| PEEK | Starts outside viewport when hidden; sliver first, −15° to −25° tilt, lean/overshoot/settle |
| EXCLAIM | PEEK first, then widened eyes and separately delayed punctuation pop/rebound/wobble |
| SUSPICIOUS | Narrow eyes, tilt/pause, lean towards item, recoil and goofy side-eye |
| DISAPPROVE | Surprise/freeze, squash, spring and multi-step wobble; confused expression |
| HAPPY | Excited eyes, anticipation, elastic bounce, short wiggle/settle |
| THINKING | Initial upward scripted gaze, tilted body, original Bloub three-dot morph, smooth hexagon/eyes return |
| GUARD | Peek, disbelief, backwards anticipation, central hop/landing, dimming and guarded expression |
| DISMISS | Goodbye reaction, lean back, complete offscreen travel, then hidden |
| RETURN | Animated return to edge, settlement and idle |
| OPEN/CLOSE DASHBOARD | Smooth surface/backdrop transitions; mascot remains on backdrop, away from receipt/amount |

Standalone GUARD supplies choreography; the red purchase scenario also supplies the user-rule dialogue. The actual Bloub states, path morphs, mask, eye shapes and particles/rings must remain recognizable. The original thinking state briefly becomes dots; it always returns to the yellow hexagon with eyes.

Select all expressions and inspect their different white eye shapes. The body has **no SVG stroke**, CSS border or eye outline. Test over light, grey, colored and dark backgrounds. In DevTools, inspect `[data-body]`, `[data-eye-backing]` and the mask: the opaque backing is pure white and confined to the same procedural body path.

### Mouse-follow test

Click **Test eye tracking** with Mouse-following eyes enabled. Move left/right/up/down, near the character and across the viewport. Gaze should follow continuously, with bounded movement and no pupils. Leave the viewport: it should ease back to the resting expression.

Trigger EXCLAIM, THINKING, HAPPY and GUARD, then move again. Scripted states temporarily own gaze; tracking must recover when the engine returns to a base-face state. Test while dashboard is open and on an Amazon page inside the shadow root. No second eye-follow system exists: the upstream component measures its current SVG rectangle each frame and uses the adapted upstream gaze helper plus `BotEngine.setLook` interpolation.

### Sound test

Hover before clicking anything: audio should remain silent if Chrome has not allowed a context. Click **Test sound** in the lab, then try PEEK, EXCLAIM, HAPPY, DISAPPROVE, GUARD and DISMISS. Effects are brief, quiet, synthesized locally and rate-limited. No idle sound or music should play.

Mute using **Mute sounds** in the lab or **Mute sound effects** in the toolbar popup. Test again, then reload the page: mute must persist. Change it in the popup with the lab open: the setting should synchronize. Unmute and make a fresh click/key gesture before testing audio again. If Chrome blocks audio, the UI must still work; it does not repeatedly force resume. Actual audible playback remains a manual Chrome check.

### Mock scenarios and choices

Use **Reset mock data** for the deterministic starting profile. Click shop Buy buttons or lab scenarios:

- £4 notebook: green celebration/badge, automatic mock continuation.
- £60 trainers: amber peek → exclamation → suspicious reflection.
- £28 alcohol: red peek → exclamation → disbelief → central guard and own no-alcohol rule.
- Custom amount/category or **Simulate Amazon purchase**: same provider and animation controller, without touching Amazon controls.

Amber/red always offer **Continue to checkout**, **Save it instead**, **Remind me in 24 hours**, and **Why am I seeing this?**. Each choice changes local mock state; no orders, bank transfers or scheduled notifications occur. On Amazon an extra Cancel this attempt option is present.

Initial provider state is £1,240 available, £820 upcoming expenses, £420 projected low and £480/£800 goal progress. Save £60 moves available balance to £1,180 and savings to £540. A prior notebook continuation deducts another £4. The recap deliberately stays £131 throughout.

Enable **Simulate thinking** and **Failed AI response**, then evaluate. The original thinking morph runs, and failure still leaves all choices available. Invalid amounts show feedback. All finance numbers remain synthetic.

### Full animation sequence and cancellation

With failure/loading off, reset data and select **▶ Play full demo**. It runs notebook approval, trainers reflection/Save, alcohol guard/mock reminder, animated exit and November recap. Three mock decisions are recorded: balance £1,176, goal £540, one mock reminder. The recap remains the fixed £131 design.

Stop the demo or trigger another action during any stage. Rapidly repeat PEEK → GUARD → DISMISS → OPEN DASHBOARD → RETURN; also start a purchase during the post-save celebration. Expect one mascot, no duplicate backdrop, smooth continuation from the visible pose, no stale dialogue and no stuck animation. All timers, RAF loops, Web Animations, sound sources and listeners should clean up on reload/invalidation.

## Real Amazon product-page acceptance (not yet verified)

**The current code has NOT been tested against a live Amazon product page.** The automated Amazon tests are fixtures. The browser-control plugin could not initialize in this session because its service file was missing, so no live-Amazon success or Chrome screenshots are claimed.

To perform the actual acceptance test:

1. Load/reload `.output/chrome-mv3` in Chrome and refresh **https://www.amazon.co.uk/**.
2. Navigate normally to an available product page with a visible title, GBP price and **Add to Basket** control. Use the canonical `www.amazon.co.uk` host. Sign in manually if Amazon requires it.
3. Open the hidden lab using the toolbar or Option/Alt+Shift+P. Verify normal gaze, all animations, sounds, the invisible corner and recap directly on that page.
4. Close the lab. Click **Add to Basket** yourself. If the title/price are readable and the control is supported, Pocket should pause that first click and evaluate the item using mock finance.
5. Check title, price and selected quantity. Amazon-specific selectors scope prices to the main product/buybox, avoiding unrelated recommendation prices.
6. For amber/red, choose **Continue to checkout**. Pocket returns focus and says to click Amazon's original button again within 30 seconds. Verify no native action occurred merely from clicking Continue. Click the Amazon control again yourself if you want to proceed.
7. On a new attempt, choose **Cancel this attempt**, Save, Remind, or Escape. Pocket must not click Amazon, add an item, navigate, or submit an order.
8. Repeat with **Buy Now**, stopping before any final payment/order submission. Pocket never clicks it automatically. Continue only arms the next deliberate human click.
9. Where available, inspect a basket with readable subtotal and **Proceed to checkout**. This control may be paused; final Place your order/Pay controls are outside the adapter selector list and must never be clicked by Pocket.
10. Change a product variation or let Amazon replace a control. Detection should still work once through the delegated listener. A second continuation grant cannot be reused; changed price/quantity requires reevaluation.
11. Unsupported/no-price pages should fail gracefully: the original button is left unchanged, no exception, no duplicate mascot. Amazon event-order/layout variations still require live verification.
12. Test plain scrolling/links and the lower-right hotspot. There should be no page layout shift or permanent click-blocking surface while idle.

No real purchase is necessary to validate the frontend. The adapter never synthesizes a click or submits a form. Do not interpret its Continue label as final order confirmation.

## Onboarding retained for developers

Open **Start / restart check-in** in the lab. Complete seven text topics: starting balance/next income, fixed expenses, savings goal, spending reductions, promises, impulse habits and preferred tone. Review/edit the confirmation and save; `chrome.storage.local` persists the profile. Voice remains explicitly mocked. The recap still uses the requested hardcoded goals/receipt.

Dates in the provider/interview are relative to 7 November 2026, the fixed demo month. Fixed expenses must precede the entered next-income date. Reset mock data restores the demo.

## Debugging, reload and cleanup

After edits:

```bash
npm run typecheck
npm test
npm run build
npm run test:extension
```

Then click **Reload** on Pocket in `chrome://extensions` and refresh the target page. Dev builds and production builds use different output folders; these instructions target production only. `npm run zip` creates `.output/pocket-bloub-1.1.0-chrome.zip`.

- Extension missing: confirm the loaded folder contains MV3 `manifest.json`, refresh the supported tab, check that Chrome site access allows Amazon, and inspect the extension Errors list.
- No visible launcher: intentional. Hover the bottom-right 80px or use the accessible keyboard trigger.
- Lab unavailable: use the toolbar popup on a supported refreshed tab. It reports an error on unsupported/unrefreshed pages. Shortcut is Alt/Option+Shift+P.
- No sound: make a fresh trusted click/key gesture, unmute, check Chrome/site/system audio. Hover cannot unlock audio. No audio block should prevent UI interaction.
- Bad/missing product data: inspect the actual product layout in DevTools and the selectors in `lib/amazon.ts`. Never broaden selectors to final-order/payment controls.
- Content-script error: inspect page DevTools Console and `chrome://extensions` → Pocket → Errors. Inspect `<pocket-companion>` → open shadow root for component styles and SVG mask geometry.
- Duplicate UI: there should be one `<pocket-companion>`; WXT invalidates the older context and Vue unmount cleanup removes all listeners, audio sources and animations.
- Busy mock-shop port: use an already-running server, or stop the process occupying 5173 and rerun `npm run shop`.
- Profile/settings updates in another tab: sound synchronizes through `storage.onChanged`; finance profiles refresh on page reload.

## Tests run and limits

36 Vitest tests cover provider arithmetic/choices, original Bloub rendering, white mask backing on four backgrounds, gaze direction/recovery/script handoff, choreography order/cancellation/exit timing, exact recap values, onboarding, Amazon DOM fixtures and sound gating/mute/cleanup. Typecheck and MV3 production build pass.

Built-bundle integration runs the actual production JavaScript in a simulated host with stubbed Chrome APIs and short Web Animations. It checks invisible hover cancellation/dwell, recap content, all mock choices, failure fallback, popup message entry, mute persistence, no synthetic-event audio unlock, profile save, duplicate/listener cleanup, full demo and the built Amazon adapter on a fixture. It does not simulate Chrome hit-testing, actual audio output or a live Amazon page.

Actual Chrome visual acceptance, responsive layout, audible playback and Amazon event ordering remain manual. The background SVG raster was visually checked; the recap HTML preview is generated but not claimed as a Chrome screenshot. No backend, real financial reasoning, banking, automatic checkout, real reminder scheduling or voice service is implemented.

## Backend handoff

Implement the existing `FinanceProvider` in `lib/contracts.ts` and replace its construction in `components/App.vue`. Keep state reactive and responses idempotent by evaluation ID. `PURCHASE_EVALUATED` accepts the typed result; the controller only decides animation. The November recap is intentionally a fixed presentation. Replace hardcoded recap content only under a new explicit product requirement. Keep the manual Amazon-control boundary and avoid exposing privileged actions to untrusted page events.
