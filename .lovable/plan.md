
## Single Change — Panel Replay Signal Card Subtitle

### File to edit
`src/components/songfit/HookReviewsSheet.tsx`

### Change
Line 300 — the subtitle inside the Replay Signal dashboard card currently reads:

```
{replayPct >= 50 ? "would run it back" : "would skip"}
```

Update it to match the feed's language exactly:

```
{replayPct >= 50 ? "of the FMLY would run it back." : "are feeling this."}
```

This aligns the panel card's secondary label with what users already see on the feed card, so both surfaces speak the same language.

### Result
- **Majority (≥ 50%):** `of the FMLY would run it back.`
- **Minority (< 50%):** `are feeling this.`

No other changes needed — one line, two string values.
