/**
 * HeroWordPreprocessor — Compute held-word signals BEFORE the AI call.
 *
 * First principle: The artist already told you what matters.
 * A word held for 500ms+ is a deliberate vocal choice. The AI's job is
 * to CONFIRM that signal and assign creative treatment — not to guess
 * which words are important from lyrics alone.
 *
 * Pipeline:
 *   1. Whisper returns word-level timestamps
 *   2. THIS MODULE computes duration + flags held words
 *   3. Flagged words are injected into the AI prompt as HELD_WORDS
 *   4. AI returns wordDirectives with entry/exit/behavior/color
 *   5. sceneCompiler consumes wordDirectives as before
 */

// ═══════════════════════════════════════════════════════════════
// Filler guard — words that are long because of rhythm, not meaning
// ═══════════════════════════════════════════════════════════════

const LYRIC_FILLER = new Set([
  // articles, prepositions, conjunctions
  'the', 'a', 'an', 'in', 'on', 'at', 'to', 'of', 'and', 'or', 'but',
  'is', 'it', 'as', 'for', 'with', 'from', 'by', 'than',
  // pronouns
  'i', 'me', 'my', 'im', 'mine', 'myself', 'you', 'your', 'yours',
  'he', 'him', 'his', 'she', 'her', 'we', 'us', 'our', 'they', 'them', 'their',
  // common verbs that carry rhythm not meaning
  'be', 'been', 'was', 'were', 'am', 'are', 'got', 'get', 'do', 'did',
  'dont', 'have', 'has', 'had', 'can', 'cant', 'will', 'wont', 'ill', 'ive',
  // interjections — the big trap in lyrics
  'oh', 'yeah', 'yo', 'uh', 'um', 'ah', 'ooh', 'hey', 'wow',
  'nah', 'yah', 'aye', 'mmm', 'huh', 'woo', 'la', 'na', 'da',
  // demonstratives / question words
  'that', 'this', 'its', 'those', 'these', 'what', 'where',
  'who', 'how', 'when', 'which',
  // short function words
  'so', 'if', 'up', 'out', 'not', 'no', 'just', 'like', 'all',
  'too', 'very', 'real', 'bout',
]);

export interface HeldWord {
  word: string;
  clean: string;
  durationMs: number;
  startSec: number;
  endSec: number;
  lineIndex: number;
  /** Position within the song (0-1) for narrative arc context */
  songPosition: number;
}

export interface HeroWordInput {
  /** All words ≥500ms that aren't filler — the primary hero candidates */
  heldWords: HeldWord[];
  /** Song duration for context */
  songDurationSec: number;
  /** Total word count for density context */
  totalWordCount: number;
  /** Median word duration for calibration */
  medianDurationMs: number;
}

/**
 * Pre-process word timestamps into held-word signals.
 * Runs BEFORE the AI call. Zero AI cost.
 */
export function extractHeldWords(
  words: Array<{ word: string; start: number; end: number }>,
  lines: Array<{ start: number; end: number; text: string }>,
  songStart: number,
  songEnd: number,
): HeroWordInput {
  const songDuration = Math.max(0.01, songEnd - songStart);
  const durations: number[] = [];

  const heldWords: HeldWord[] = [];

  for (const w of words) {
    const dur = w.end - w.start;
    durations.push(dur);

    if (dur < 0.5) continue; // Below threshold

    const clean = w.word.replace(/[^a-zA-Z]/g, '').toLowerCase();
    if (!clean || clean.length < 2) continue;
    if (LYRIC_FILLER.has(clean)) continue;

    const lineIndex = lines.findIndex(
      l => w.start >= (l.start ?? 0) && w.start < (l.end ?? Infinity)
    );

    heldWords.push({
      word: w.word,
      clean,
      durationMs: Math.round(dur * 1000),
      startSec: w.start,
      endSec: w.end,
      lineIndex: Math.max(0, lineIndex),
      songPosition: (w.start - songStart) / songDuration,
    });
  }

  // Deduplicate by clean form — keep the longest occurrence
  const byClean = new Map<string, HeldWord>();
  for (const hw of heldWords) {
    const existing = byClean.get(hw.clean);
    if (!existing || hw.durationMs > existing.durationMs) {
      byClean.set(hw.clean, hw);
    }
  }

  // Sort by song position
  const deduped = [...byClean.values()].sort((a, b) => a.songPosition - b.songPosition);

  // Compute median duration
  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0.2;

  return {
    heldWords: deduped,
    songDurationSec: songDuration,
    totalWordCount: words.length,
    medianDurationMs: Math.round(median * 1000),
  };
}

/**
 * Format held words into the AI prompt injection block.
 */
export function formatHeldWordsForPrompt(input: HeroWordInput): string {
  if (input.heldWords.length === 0) return '';

  const lines = input.heldWords.map(hw => {
    const pos = (hw.songPosition * 100).toFixed(0);
    return `  "${hw.clean}" — ${hw.durationMs}ms (${pos}% into song)`;
  });

  return `
HELD_WORDS (artist held these ≥500ms — these are your primary hero candidates):
${lines.join('\n')}

Median word duration: ${input.medianDurationMs}ms
Total words: ${input.totalWordCount}
Song duration: ${input.songDurationSec.toFixed(0)}s
`.trim();
}


// ═══════════════════════════════════════════════════════════════
// AI PROMPT — the actual system prompt for hero word selection
// ═══════════════════════════════════════════════════════════════

export const HERO_WORD_SYSTEM_PROMPT = `You are a lyric video director. Your job is to decide which words in a song deserve visual emphasis ("hero treatment") and what that treatment should look like.

## YOUR PRIMARY INPUT: HELD_WORDS

You'll receive a list called HELD_WORDS — these are words the artist held for 500ms or longer. In a typical song where most words are 100-300ms, a 500ms+ word is a deliberate artistic choice. The artist is telling you: "this word matters."

**HELD_WORDS are your #1 priority.** Every held word should get a wordDirective unless it's genuinely low-impact in context (rare — the artist held it for a reason).

## HOW TO ASSIGN EMPHASIS LEVELS

emphasisLevel controls visual weight. Map it from duration + narrative importance:

| Duration | Default emphasisLevel | Adjustments |
|----------|----------------------|-------------|
| ≥1500ms  | 5 (maximum)          | The artist REALLY held this. Always 5. |
| 1000-1499ms | 4                 | +1 if it's a title word, hook, or climax moment |
| 700-999ms | 3                   | +1 if narrative anchor, -1 if repeated filler-adjacent |
| 500-699ms | 2                   | +1 if emotionally loaded, stays 2 if common word |

## HOW TO CHOOSE VISUAL TREATMENT

For each hero word, pick entry/exit/behavior based on what the word MEANS:

**The word IS the directive.** Match the animation to the semantics:
- Motion words (fly, run, fall, spin, drift) → movement-matching entry/exit
- Impact words (hit, crash, slam, punch) → slam-down, shatter
- Emotional words (love, pain, heart, cry) → bloom, exhale, pulse
- Time words (wait, patience, forever) → breathe-in, linger
- Size words (monster, giant, tiny) → explode-in or whisper
- Element words (fire, ice, wave, rain) → element-matching color + behavior

If a word doesn't have obvious visual semantics, use its ROLE in the narrative:
- Opening/thesis words → materialize (clean reveal)
- Climax words → explode-in or slam-down (maximum impact)
- Closing/resolution words → drift-in, linger (gentle landing)
- Repeated hook words → same treatment each time (consistency = recognition)

## AVAILABLE ENTRY STYLES
slam-down, punch-in, explode-in, snap-in, shatter-in, rise, materialize, breathe-in, drift-in, surface, drop, plant, stomp, cut-in, whisper, bloom, melt-in, ink-drop, focus-in, spin-in, tumble-in

## AVAILABLE EXIT STYLES  
shatter, snap-out, burn-out, punch-out, dissolve, drift-up, exhale, sink, drop-out, cut-out, vanish, linger, evaporate, whisper-out, gravity-fall, soar, launch, scatter-fly, melt, freeze-crack, scatter-letters, cascade-down, cascade-up, blur-out, spin-out, peel-off, peel-reverse

## AVAILABLE BEHAVIORS (while word is on screen)
pulse, vibrate, float, grow, contract, flicker, orbit, lean, freeze, tilt, pendulum, pulse-focus, none

## AVAILABLE HERO PRESENTATIONS (for emphasisLevel ≥ 4)
inline-scale, delayed-reveal, isolation, vertical-lift, vertical-drop, tracking-expand, dim-surroundings

## WHAT TO RETURN

Return a JSON object with a "wordDirectives" array. Each entry:

{
  "word": "monster",           // lowercase, no punctuation
  "emphasisLevel": 4,          // 1-5
  "entry": "explode-in",       // from entry styles above
  "exit": "shatter",           // from exit styles above  
  "behavior": "vibrate",       // from behaviors above (or "none")
  "heroPresentation": "inline-scale"  // only for emphasisLevel ≥ 4
}

## RULES

1. Every HELD_WORD should get a directive (unless truly low-impact in context)
2. You may add up to 5 additional words under 500ms if they're narratively critical (title words, emotional anchors)
3. Keep total directives under 30 — too many heroes = no heroes
4. Repeated words (hooks/choruses) get the SAME treatment every time
5. Match visual to meaning. If the word is "spin", use spin-in. If it's "fall", use drop.
6. Don't over-assign emphasisLevel 5 — reserve it for ≥1500ms words and the absolute emotional peak
7. Return ONLY the JSON object, no explanation`;

/**
 * Build the full user prompt for the AI call.
 */
export function buildHeroWordPrompt(
  input: HeroWordInput,
  lyrics: string,
  title: string,
  artist: string,
): string {
  const heldBlock = formatHeldWordsForPrompt(input);

  return `# Song: "${title}" by ${artist}

## Lyrics:
${lyrics}

## ${heldBlock}

Based on the held words and lyrics above, return the wordDirectives JSON.`;
}
