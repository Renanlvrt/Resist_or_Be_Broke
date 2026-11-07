# Bloub attribution

This project uses the actual source of [Bloub](https://github.com/jeremy-prt/bloub), by **Jérémy Perret**, under the MIT License.

Pinned revision: `b4bb3c1b5f93c7b87a2e8d620f667c4093d97749`.

The copyright notice and complete license are retained in `vendor/BLOUB-LICENSE` and `public/BLOUB-LICENSE.txt`, which is included in the production extension. `vendor/BloubBot.upstream.vue.txt` and `vendor/Bloub-architecture.upstream.md` preserve the original component and architecture reference.

## Integrated upstream source

- `bot/`: unmodified upstream geometry, shape profiles, path morphing, engine, expressions, states, eye fitting, decor and cycles. In this refinement the original `thinking` state was restored, including its temporary three-dot morph.
- `components/BloubBot.vue`: the actual upstream component, retaining its state/playback models, cycles, pure-time rendering, gaze/script support, eye-hole mask, body backing and front/back ring/particle ordering.
- `ui/gaze.ts`: upstream pointer projection and gaze scripts, with one small exported page-oriented adapter.

## Local component adaptations

- Defaults are `hexagone`, `ambre` (`#F0B429`), `paper: '#FFFFFF'`, and `follow: true`.
- The cycle defaults to an empty manual sequence because the existing extension controller owns named event timing; playback functionality remains available.
- A new `active` prop pauses internal sampling and detaches gaze listeners while fully hidden, without unmounting during entrance/exit.
- The original opaque backing uses pure white and exactly follows `frame.bodyPath`. Eyes remain the original mask holes; no pupils, eye strokes, body outline, or rectangular backing are added.
- The masked fill uses the same body path instead of a viewBox-sized rectangle. This is visually equivalent under the original mask and keeps all painted backing geometry confined to the actual body.
- The page-oriented gaze helper calls the original `lookTarget`, removes the editor's leftward offset and full arrival spin, and releases its mix when no pointer is present. Bounded yaw/pitch, coordinate normalization, original pitch sign, per-frame bounding box measurement, morph interpolation and compatibility checks are preserved. This is the only eye-tracking pipeline.
- Imports use local extension paths; the original website's i18n label is replaced by a component ARIA label. Cleanup has an SSR guard for reproducible static previews.

Screen choreography, sound, Amazon integration, UI surfaces and tests are separate project code. The full Bloub website, editor, recorder and i18n infrastructure are not copied.
