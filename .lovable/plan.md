

# Download Export Modal — Implementation Complete

## Summary

Replaced the "Republish" button in the FIT tab with a "Download" button that opens a full export modal (`FitExportModal`). Removed the download popover from the `ShareableLyricDance` page.

## Files Changed

| File | Action |
|------|--------|
| `src/components/lyric/FitExportModal.tsx` | **Created** — Export modal with format/quality selection, progress states, download |
| `src/components/songfit/InlineLyricDance.tsx` | **Edited** — Added `forwardRef` + `useImperativeHandle` to expose player |
| `src/components/lyric/FitTab.tsx` | **Edited** — Replaced Republish with Download button + FitExportModal |
| `src/pages/ShareableLyricDance.tsx` | **Edited** — Removed download popover, export state, and handleExport |

## Architecture

- `InlineLyricDance` exposes `InlineLyricDanceHandle.getPlayer()` via `forwardRef`
- `FitTab` holds a ref to `InlineLyricDance` and passes `getPlayer` to `FitExportModal`
- `FitExportModal` uses `exportVideoAsMP4` from `src/engine/exportVideo.ts` (WebCodecs + mp4-muxer)
- Export is video-only; audio notice is displayed in the modal

## Export Options

| Quality | 9:16 | 16:9 | 1:1 |
|---------|------|------|-----|
| 1080p | 1080×1920 | 1920×1080 | 1080×1080 |
| 720p | 720×1280 | 1280×720 | 720×720 |
| 480p | 480×854 | 854×480 | 480×480 |
