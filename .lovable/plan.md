

# Product-Led Growth System for toolsFM

## Overview
Build a usage quota + invite-to-unlock growth system with an admin toggle (like the existing crypto tipping toggle), a floating "Fit Widget," and a gamified collab points system. This is a large feature set -- here is a phased plan starting with the core MVP.

---

## Phase 1: Database Schema (New Tables + Columns)

### New table: `usage_tracking`
Tracks per-user, per-tool usage counts (reset-able by period or permanent).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | nullable (null = anonymous, keyed by session) |
| session_id | text | for anonymous tracking |
| tool | text | e.g. "hitfit", "vibefit", "profit" |
| count | integer | default 0 |
| period | text | e.g. "lifetime" or "2026-02" |
| updated_at | timestamptz | |

### New table: `invites`
Tracks invite links and conversions.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| inviter_user_id | uuid | who sent |
| invite_code | text | unique shareable code |
| invitee_user_id | uuid | nullable, filled on conversion |
| converted_at | timestamptz | nullable |
| created_at | timestamptz | |

### New table: `collab_points`
Tracks gamification points and badges.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | |
| points | integer | default 0 |
| badge | text | e.g. "collab_starter", "chain_builder" |
| updated_at | timestamptz | |

### Add to `profiles` table
- `invite_code` (text, unique) -- each user gets a permanent invite code
- `is_unlimited` (boolean, default false) -- unlocked via invite conversion

---

## Phase 2: Admin Toggle (Copy Tab)

Following the exact pattern of the crypto tipping toggle:

- Add `growth_flow` boolean to `site_copy.copy_json.features`
- Add a new toggle card in the Admin Copy tab: "Product-Led Growth" with description "Usage quotas + invite-to-unlock flow"
- Wire it identically to `handleToggleCrypto` -- reads/writes `features.growth_flow`
- Update `SiteCopy` TypeScript interface to include `growth_flow: boolean`

---

## Phase 3: Usage Quota Hook

Create `src/hooks/useUsageQuota.ts`:

- Reads the `growth_flow` feature flag from site copy
- If disabled, all tools are unlimited (no restrictions)
- If enabled:
  - Anonymous: 5 uses per tool
  - Signed-in (no invite conversion): 10 uses per tool
  - Unlimited (invited someone who converted): unlimited
- Exposes: `{ canUse: boolean, remaining: number, tier: "anonymous" | "free" | "unlimited", increment: () => void }`
- Each tool tab calls `increment()` on analysis run
- Anonymous tracking uses `sessionId` from `src/lib/sessionId.ts`

---

## Phase 4: Floating Fit Widget

Create `src/components/FitWidget.tsx`:

- Only renders when `features.growth_flow` is enabled
- Floating, draggable, collapsible button in bottom-right corner
- Collapsed state: small icon with usage indicator ring
- Expanded state shows:
  - Per-tool usage bars (e.g. "HitFit: 3/10")
  - Tier badge ("Free" / "Unlimited")
  - If not unlimited: "Invite 1 artist -> unlock unlimited" CTA
  - [Invite Collaborator] button opens invite modal
- Invite modal: shows shareable link (`playlistfitcheck.lovable.app/?ref=CODE`), copy button
- Placed in `Index.tsx` layout (visible on all tool pages)
- Semi-transparent glass design, dark mode compatible

---

## Phase 5: Invite Flow

- On signup, generate unique `invite_code` on `profiles` table (via DB trigger)
- Shareable link: `/?ref=CODE`
- When a new user signs up with a `ref` param:
  - Record conversion in `invites` table
  - Set inviter's `is_unlimited = true`
  - Award collab points to inviter
  - Optional: confetti animation on next inviter login
- Each converted invitee also gets their own invite code (chain reaction)

---

## Phase 6: Collab Points + Badges

- Points awarded for: invite conversion (+100), invitee uses a tool (+10)
- Badge tiers: "Collab Starter" (1 invite), "Chain Builder" (3+), "Growth Engine" (10+)
- Displayed in Fit Widget and on public profile
- Non-blocking -- purely cosmetic rewards

---

## Phase 7: Tool Integration

Each tool tab (HitFit, VibeFit, ProFit, etc.) gets a small guard:

```text
Before running analysis:
  1. Call useUsageQuota("hitfit")
  2. If !canUse -> show gentle nudge (not blocking UI, but disabling the submit button with a tooltip: "Sign up for more uses" or "Invite an artist to unlock unlimited")
  3. If canUse -> run analysis, then call increment()
```

Anonymous users can still browse, view results, and explore -- the quota only gates new analysis runs.

---

## Technical Details

### Files to create:
- `src/hooks/useUsageQuota.ts` -- quota logic hook
- `src/components/FitWidget.tsx` -- floating widget component
- `src/components/FitWidgetInviteModal.tsx` -- invite modal

### Files to modify:
- `src/hooks/useSiteCopy.tsx` -- add `growth_flow` to features interface + default
- `src/pages/Admin.tsx` -- add toggle card (copy tab)
- `src/pages/Index.tsx` -- render FitWidget
- `src/components/hitfit/HitFitTab.tsx` -- add quota guard
- `src/components/vibefit/VibeFitTab.tsx` -- add quota guard
- `src/components/profit/ProFitTab.tsx` -- add quota guard
- `src/components/lyric/LyricFitTab.tsx` -- add quota guard
- `src/pages/MixFitCheck.tsx` -- add quota guard
- `src/pages/Auth.tsx` -- capture `ref` param on signup

### Database migrations:
- Create `usage_tracking`, `invites`, `collab_points` tables with RLS
- Add `invite_code` and `is_unlimited` columns to `profiles`
- Create trigger to auto-generate invite codes on profile creation

### Edge function (optional, Phase 5):
- `convert-invite` -- validates invite code, marks conversion, awards points (uses service role for cross-user updates)

---

## What This Does NOT Do (kept out of MVP):
- Project system (tracks + collaborators) -- can be added later
- Community feed integration -- CrowdFit already exists
- Remix suggestions -- future feature
- Cover art bonus styles from collab points -- future feature

---

## Implementation Order
1. DB migrations (tables + columns + triggers)
2. Admin toggle (quick win, follows existing pattern)
3. Usage quota hook
4. Tool tab guards (all tools)
5. Floating Fit Widget UI
6. Invite flow (signup capture + conversion logic)
7. Collab points + badges

