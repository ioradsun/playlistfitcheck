

## UX Audio Clarity Fixes

### Problem Summary
Audio state is invisible to the user. There's no mute icon, no route-change cleanup, and auto-alternation can override manual mute. Users find unexpected audio deeply annoying.

### Changes

**1. Add a visible mute/unmute icon overlay on the active canvas**
- File: `InlineBattle.tsx`
- Track an `isMuted` state derived from the active audio element
- Show a small speaker/speaker-slash icon in the bottom-right corner of the ACTIVE canvas panel
- Icon appears briefly on tap (fade in/out after 1.5s) so it doesn't clutter the visual, but confirms the action
- Always visible as a subtle watermark (very low opacity) so users know where to tap

**2. Mute all audio on route navigation**
- File: `InlineBattle.tsx`
- Add a `useEffect` cleanup that mutes both audio refs on unmount (component teardown = route change or tab switch)
- This guarantees audio stops when leaving the page

**3. Respect manual mute during auto-alternate**
- File: `InlineBattle.tsx`
- Track a `userMuted` ref that gets set to `true` when user taps to mute
- When auto-alternate fires (side switch after hook ends), check `userMuted` — if true, keep the new side muted too
- Reset `userMuted` only when user explicitly taps to unmute

**4. Fix the instruction text**
- File: `HookFitPostCard.tsx`  
- Change "Tap each side to play" to "Tap a side to play"
- The vote button already appears after one tap, so the instruction should match

**5. Lift `isMuted` into BattleState for external visibility**
- Add `isMuted: boolean` to `BattleState` interface
- `HookFitPostCard` can optionally show a small mute indicator near the action row if needed later

### Technical Details

**InlineBattle.tsx changes:**
- New state: `const [isMuted, setIsMuted] = useState(true)` (starts muted since no interaction yet)
- New ref: `const userMutedRef = useRef(false)`
- On canvas tap (mute toggle): set `userMutedRef.current = true/false` and update `isMuted`
- On auto-alternate effect: check `userMutedRef.current` before unmuting
- On unmount: `useEffect(() => () => { muteAll() }, [])` — mute both audio refs
- Render a small `Volume2` or `VolumeX` icon (from lucide) over the active canvas, positioned absolute bottom-right, with `opacity-30` idle and `opacity-80` on recent tap (auto-fades)
- Add `isMuted` to the `BattleState` object passed to parent

**HookFitPostCard.tsx changes:**
- Change hint text from "Tap each side to play" to "Tap a side to play"

