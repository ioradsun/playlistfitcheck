
# CrowdFit Competitive Submission Arena — Implemented v1.1

## Completed

### Database Schema
- Added lifecycle columns to `songfit_posts`: status, submitted_at, expires_at, cooldown_until, cycle_number, engagement_score, peak_rank, impressions, legacy_boost
- Created `engagement_weights` table (configurable scoring weights)
- Created `songfit_engagement_events` table (unique per user/event/post)
- Created `songfit_cycle_history` table (archived cycle stats)
- Trigger: auto-recompute engagement_score on new event
- Functions: `update_submission_statuses()`, `increment_impressions()`, `increment_cycle_number()`
- Backfilled existing posts with lifecycle states
- Cron job: runs lifecycle transitions every 15 minutes

### Submission Lifecycle
- 21-day live → 21-day cooldown → eligible
- Duplicate submission detection with contextual toasts
- Re-entry with 15% legacy boost (decays after 48h)
- Status badges on all post cards (Live/Expired/Cooldown/Eligible)

### Billboard System
- Feed toggle: Recent / Billboard
- Billboard modes: Trending, Top (decay-weighted), Best Fit (rate-based), All-Time
- Rank display on cards

### Engagement Tracking
- Events logged: like, comment, save, spotify_click, follow_from_post, profile_visit
- Impression tracking via IntersectionObserver
- Weighted scoring via configurable `engagement_weights` table

### Song Detail Page
- Route: /song/:postId
- Current cycle stats, lifetime impact, cycle history, peak rank

### Competitive Artist Profile
- 6-stat summary grid (Peak Rank, Best Score, Impact, Cycles, Avg Rank, Songs)
- Active submission spotlight
- Full submission record with status badges

## Deferred to Phase 2
- Native audio preview hosting
- Completion/skip/replay rate tracking
- Verified artist weighting
- AI Fit Score clustering
- Achievement badges
- Advanced anti-gaming (beyond unique constraints)
