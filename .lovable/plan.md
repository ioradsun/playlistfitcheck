Here's the final Lovable prompt:

---

Refactor LyricFit into a two-tab architecture using the same tab strip pattern as `BillboardToggle` in CrowdFit. Create a new `LyricFitToggle` component modeled directly on `BillboardToggle` with two buttons — **Lyrics** and **Fit** — where Fit renders at `opacity-30` with `pointer-events-none` until `lines` has entries.

Rewrite `LyricFitTab` as a thin parent container that holds all shared state: `audioFile`, `audioUrl`, `lines`, `savedLyricId`, `songDna`, `beatGrid`, `songSignature`, `cinematicDirection`, `bgImageUrl`, `sceneManifest`. It renders the toggle strip and conditionally shows either the Lyrics or Fit content below it.

**Lyrics tab** — upload audio, check file size, if under 25MB send raw to `lyric-transcribe`, only run `compressAudioFile` if over 25MB. On response render lines and inline editor from `LyricDisplay` (editing only). Remove `useBeatGrid`, `songSignatureAnalyzer`, `lyric-analyze`, `cinematic-direction`, `lyric-video-bg` from this tab entirely.

**Fit tab** — on entry, first sync/refresh the final transcript from `saved_lyrics`, then auto-trigger in parallel: `beatAnalyzer.worker` and `lyric-analyze`. Show a combined progress bar. Once both complete, auto-call `cinematic-direction`, then unlock the Dance button. Dance button is disabled until `sceneManifest` exists — remove `deriveSceneManifestFromSpec` fallback entirely. Dance button sequence: `lyric-video-bg` → audio upload → upsert `shareable_lyric_dances` → redirect to share URL.

In `LyricDisplay` remove: `fetchSongDna`, the Reveal Song DNA button, `useBeatGrid`, `songSignatureAnalyzer`, `generateBackgroundImage`, and `PublishLyricDanceButton`. Keep: inline editing, waveform, playback, FMLY filter, export.

In `PublishLyricDanceButton` remove the `deriveSceneManifestFromSpec` fallback — `sceneManifest` must come from props or the button stays disabled.

**State flow:**

1. User uploads audio in Lyrics tab
2. Transcription runs → lines populate from ElevenLabs → Fit tab unlocks immediately
3. User clicks Fit tab → sync/refresh final transcript from `saved_lyrics` before proceeding
4. Beat analysis + Song DNA auto-trigger in parallel on tab entry
5. Progress bar shows combined status
6. When both complete, Dance button enables
7. Dance button: bg image → upload → upsert → redirect