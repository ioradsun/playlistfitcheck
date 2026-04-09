# CODEX Cleanup Pass 2

## Item #11 (P1) — Viral clip download appears clickable but no-ops
- Add a clearly visible disabled state for the Viral Clip modal download button when no moment is selected (reduced opacity + not-allowed cursor).
- Replace the silent early return in `handleDownload` with explicit error logging and `setStage("error")` when `getPlayer()` returns null.
- Keep empty-moment UX explicit in the modal (message shown instead of a dead button path).
- Add `console.warn` in `FitTab` when passing empty moments into `ViralClipModal` so root-cause tracing is possible.
