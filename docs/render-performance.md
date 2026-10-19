# Adaptive workbench rendering — 2026-09-28

The reported Windows Chrome / integrated-GPU stutter has no Performance trace or measured FPS baseline yet. GPU fill rate and repeated shadow rendering are hypotheses from the scene code, not confirmed root causes. No Windows FPS improvement is claimed by this change.

## Behavior

| Profile | Maximum render pixels | Maximum pixel ratio | Shadows |
| --- | ---: | ---: | --- |
| Full | 1,500,000 | 1.25 | Enabled |
| Balanced | 950,000 | 1 | Enabled |
| Light | 600,000 | 0.85 | Disabled |

The canvas keeps its CSS dimensions. Scene geometry, mouse sensitivity, raycast frequency and assembly rules are unchanged. Material programs are refreshed when shadows toggle.

Only consecutive rendered animation frames contribute to adaptation. A measurement window needs at least 1,200 ms and 12 frames. Two windows averaging above 28 ms lower quality by one step; eight windows below 19 ms restore one step. Startup gets two seconds of grace; every change gets five seconds to settle. Idle/hidden frames and suspension gaps reset the measurement window. The lowest setting is bounded; this is not a guarantee of a target frame rate.

Shelf label projection now uses the cached viewport size from ResizeObserver rather than reading clientWidth/clientHeight during every label write.

## Verification

- Synthetic frame streams cover sustained slowdown, gradual recovery, startup, idle/background gaps, isolated stutters, alternating loads and pixel-budget limits.
- Full project suite: 174 tests passed; production build passed.
- Local in-app browser: 1280 x 720 CSS viewport rendered at 1600 x 900 in full quality; room load and stock selection remain functional.
- Windows integrated-GPU before/after frame times, INP and actual automatic tier changes on that hardware remain unmeasured. Follow-up should record the same moving/turning/holding scenario 2–3 times in Chrome Performance and compare median frame times with stable hardware, viewport and browser settings.

For local diagnostics, the canvas exposes data-render-quality. There is no additional user-facing control or telemetry collection. Reload starts from full quality. To roll back, remove the adaptive sampler/application calls and restore the previous fixed 1.5-million-pixel / 1.25 ratio cap.
