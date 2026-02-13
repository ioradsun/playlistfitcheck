

# Mix Fit Check — with Save Support (Local + Cloud)

## Overview

Add a tabbed homepage with the existing **PlaylistFitCheck** and a new **Mix Fit Check** tool. Mix projects save to **localStorage** for guests and additionally to the **cloud database** for logged-in users. Audio files themselves stay in browser memory (too large for cloud storage in this context), but project metadata, rankings, comments, and marker positions persist.

## What Gets Saved

| Data | Local (guest) | Cloud (logged-in) |
|------|--------------|-------------------|
| Song title + notes | Yes | Yes |
| Mix names + rankings + comments | Yes | Yes |
| Start/end marker positions | Yes | Yes |
| Audio files (MP3/WAV) | No (too large) | No |

When a logged-in user reopens a saved project, they will see their metadata, rankings, and comments but will need to re-upload the audio files. A clear prompt will guide them to do so.

## Database Changes

**New table: `mix_projects`**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | auto-generated |
| user_id | uuid (FK) | references auth.users, cascade delete |
| title | text | required |
| notes | text | optional |
| mixes | jsonb | array of mix objects (name, rank, comments, marker positions) |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

**RLS policies:**
- Users can SELECT, INSERT, UPDATE, DELETE only their own rows (`auth.uid() = user_id`)

## New Files

| File | Purpose |
|------|---------|
| `src/pages/MixFitCheck.tsx` | Main workspace: project creation, mix cards grid, global timeline, save/load |
| `src/components/mix/MixCard.tsx` | Individual card: waveform canvas, play/pause, rank, comments, remove |
| `src/components/mix/GlobalTimeline.tsx` | Shared waveform with draggable start/end markers |
| `src/components/mix/MixProjectForm.tsx` | Song title + notes entry form |
| `src/components/mix/SavedProjectsList.tsx` | List of saved projects (from localStorage or cloud) with load/delete |
| `src/hooks/useAudioEngine.ts` | Web Audio API: decode files, extract waveform peaks, manage playback with marker bounds |
| `src/hooks/useMixProjectStorage.ts` | Abstraction over localStorage + cloud save/load logic |

## Modified Files

| File | Change |
|------|--------|
| `src/pages/Index.tsx` | Add tab bar (PlaylistFitCheck / Mix Fit Check) wrapping existing content |

## How It Works

### Tab Navigation
A minimal tab bar appears at the top of the Index page. First tab renders the existing `PlaylistInputSection`/`ResultsDashboard` flow unchanged. Second tab renders the new `MixFitCheck` component.

### Audio Engine (useAudioEngine)
- `AudioContext.decodeAudioData()` decodes uploaded MP3/WAV into `AudioBuffer`
- Waveform peaks extracted from buffer channel data, rendered to `<canvas>`
- Playback via `AudioBufferSourceNode.start(0, startOffset, duration)` respecting marker positions
- Only one source node active at a time (exclusive playback)

### Global Timeline (GlobalTimeline)
- Renders waveform of the first uploaded mix as reference
- Two draggable handles for start/end markers stored as time offsets
- Label displays "Comparing: M:SS - M:SS"
- Marker changes propagate to all mix cards instantly

### Mix Cards (MixCard)
- 3-column responsive grid (1 col mobile, 2 col tablet, 3 col desktop)
- Each card: editable name input, canvas waveform, play/pause button, rank dropdown (1-6, validated for no duplicates), textarea for comments, remove button
- Play button starts from global start marker, stops at end marker

### Save Logic (useMixProjectStorage)
- **Guest**: serialize project metadata (title, notes, mixes array with names/ranks/comments, marker positions) to `localStorage` under a key like `mix_projects`
- **Logged-in**: same data saved to `mix_projects` table via Supabase client, plus localStorage as offline cache
- Save triggers on explicit "Save" button click and auto-saves on significant changes (debounced)
- Load: on mount, check cloud first (if logged in), fall back to localStorage

### Saved Projects List
- Shows previously saved projects with title, date, mix count
- Click to load — restores metadata and prompts user to re-upload audio files
- Delete option available

## Design
- Matches existing dark aesthetic with glass-card patterns
- Waveform rendered in primary color with subtle opacity
- Marker handles styled as primary-colored vertical lines with drag cursors
- Rank #1 card gets a subtle primary border glow
- Professional, minimal, no clutter

