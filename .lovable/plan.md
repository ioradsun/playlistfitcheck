

# Auth UX Redesign + Terms Page

## What changes

### 1. Auth page: Tabbed "Sign Up / Sign In" layout
Replace the current toggle-link approach with clean tabs at the top of the card:
- Two tabs: **Sign Up** and **Sign In**
- Removes the "Create your account" / "Welcome back" title -- the tabs make intent obvious
- The Spotify Artist Profile field only shows on the Sign Up tab
- "Forgot password?" stays under Sign In
- Shared email + password fields in both tabs

### 2. "By signing up, you agree to the terms." under Sign Up button
- Small muted text below the Sign Up button
- "terms" is a link to `/terms`

### 3. Terms page (`/terms`)
A casual, honest terms page matching your brand voice. Covers:
- **What tools.fm is**: experimental music tools, provided as-is
- **Your music stays yours**: we don't store uploaded audio files (MixFit, LyricFit, HitFit process audio but don't persist the files)
- **What we do store**: metadata, analysis results, profile info, posts
- **No guarantees**: tools are experiments, results are pattern recognition not promises
- **Spotify data**: we use Spotify's API for search/metadata, we don't access your Spotify account beyond what you paste
- **Account**: you can delete your account anytime
- Tone: short paragraphs, plain language, no legalese

---

## Technical details

### Files to create
- `src/pages/Terms.tsx` -- the terms page component

### Files to modify
- `src/pages/Auth.tsx`
  - Replace title + toggle link with Radix `Tabs` component (Sign Up / Sign In)
  - Add "By signing up, you agree to the terms." text with link below the Sign Up button
  - Remove the bottom "Already have an account?" / "Don't have an account?" toggle
- `src/App.tsx`
  - Add route: `/terms` pointing to the Terms page with PageLayout

### UX decisions
- Tabs give instant clarity about where you are (no hunting for "Sign up free" link at the bottom)
- The terms link is unobtrusive -- small muted text, not a checkbox (reduces friction)
- Terms page uses the same `PageLayout` wrapper as other pages for consistency
