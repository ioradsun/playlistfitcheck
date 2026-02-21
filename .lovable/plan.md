

# Hook Battle: Interaction Redesign

The current bottom panel has too many layers competing for attention: vote bars with percentages, a question prompt, a comment input, a vote count, a share button, and a tagline -- all stacked vertically with inconsistent spacing and text that clips on mobile.

## The Problem

1. Vote labels ("EVEREST PEAK", "STEP BY STEP") clip at small widths
2. Too many visual layers: bars, percentages, question, input, count, button, tagline
3. The hierarchy is unclear -- what should the user do first?
4. On mobile, this stack pushes critical actions below the fold

## The Principle

One action at a time. The interface should breathe. Every element earns its place.

## The New Flow

Three states, each owning the full bottom panel:

**State 1: Pre-Vote** -- Just the canvases. A single whisper of instruction at the bottom center: "TAP TO VOTE". Nothing else. The art speaks.

**State 2: Post-Vote, Pre-Comment** -- The vote result appears as a single centered line: "HOOK A 67%" with the winning bar below. Below that, a full-width input with the question as placeholder ("what did [hook] do to you?"). Typing and hitting Enter submits. No separate button -- Enter is the action.

**State 3: Post-Comment (or dismissed)** -- The input collapses. "SEND THIS" becomes the sole CTA. Vote count appears as a quiet footnote. The tagline stays.

## Key Design Decisions

- Vote percentages: Show only the voted hook's percentage as a single large number, not both side-by-side. The rival percentage is implied (100 minus).
- Hook labels: Truncate with ellipsis at 12 characters on mobile to prevent clipping.
- Comment input: Full-width, no border-radius change, just a clean underline-style input (border-bottom only) to feel lighter.
- "SEND THIS" button: Only appears after comment or if user scrolls past the input. Rounded-full pill shape, not full-width rectangle.
- Remove the "vs" divider entirely from the bottom -- the canvases already show the split.
- Total votes: Shown inline with SEND THIS as "3 votes -- SEND THIS" to reduce vertical layers.

## Technical Changes

### `src/pages/ShareableHook.tsx`

**Battle bottom panel (lines 872-972):**

Replace the entire bottom panel with a state-machine approach:

```text
State 1 (pre-vote):
  <p "TAP TO VOTE" centered, 10px mono, white/20>

State 2 (voted, not commented):
  <div centered>
    <p hookLabel truncated, 11px mono white/40>
    <p percentage, text-4xl bold tabular-nums white/90>
    <div single vote bar, 2px, full-width>
  </div>
  <input underline-style, placeholder="what did [hook] do to you?">

State 3 (commented or dismissed):
  <p "your words are on the video" white/30>
  <button pill "SEND THIS">
  <p vote count + tagline>
```

- Remove the dual side-by-side vote bar layout
- Remove the standalone "vs" text element
- Remove the separate question prompt (move into input placeholder)
- Consolidate vote count and tagline into one line
- Add `truncate max-w-[120px]` to hook labels in the canvas overlays to prevent clipping
- Use `text-4xl` for the winning percentage (single focal number)
- Input uses `border-b border-white/15` instead of full border for lighter feel

### Mobile-specific refinements

- Bottom panel gets `pb-safe` (safe area inset) for notched phones
- Max vertical height of bottom panel: `max-h-[35vh]` to ensure canvases always dominate
- Touch targets: minimum 44px height on all interactive elements

