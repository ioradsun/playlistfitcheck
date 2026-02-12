

# User Accounts, Profiles, and Search History

## Overview
Add signup/login functionality with role selection (Artist or Curator), user profiles with role-specific features, and saved search history for logged-in users.

## Important Note on Spotify Login
Spotify OAuth is **not supported** on this platform. The available social login options are **Google** and **Apple**. The plan includes Google sign-in as a convenient alternative. Users can still connect their Spotify content by pasting playlist/track URLs.

---

## What You'll Get

### 1. Sign Up and Login
- Email/password signup with a role selector (Artist or Curator)
- Email/password login
- Google sign-in option
- Logout functionality
- Auth-aware navigation bar across the app

### 2. Artist Profile
- Embed a Spotify playlist showcasing their works (using Spotify's embed iframe)
- View history of all their past Fit Check searches with results
- "Run a Search" button that navigates back to the homepage

### 3. Curator Profile
- Simple profile page (can be expanded later)
- View history of their past searches
- "Run a Search" button

### 4. Saved Search Results
- When a logged-in user runs a Fit Check, the results are automatically saved to their account
- Search history displayed on their profile with playlist name, score, and date

---

## Technical Details

### Database Changes

**New tables:**

- `profiles` -- stores user display name, bio, Spotify embed URL, created_at
  - `id` (uuid, FK to auth.users, primary key)
  - `display_name` (text)
  - `bio` (text, nullable)
  - `spotify_embed_url` (text, nullable -- for artists to embed their playlist)
  - `created_at` (timestamptz)

- `user_roles` -- stores role assignment (artist or curator)
  - `id` (uuid, primary key)
  - `user_id` (uuid, FK to auth.users, not null)
  - `role` (enum: artist, curator, user)
  - Unique constraint on (user_id, role)

- `saved_searches` -- stores fit check results per user
  - `id` (uuid, primary key)
  - `user_id` (uuid, FK to auth.users, not null)
  - `playlist_url` (text)
  - `playlist_name` (text)
  - `song_url` (text, nullable)
  - `song_name` (text, nullable)
  - `health_score` (integer)
  - `health_label` (text)
  - `blended_score` (integer, nullable)
  - `blended_label` (text, nullable)
  - `created_at` (timestamptz)

**Security (RLS) policies:**
- Users can only read/update their own profile
- Users can only read their own saved searches
- Roles table readable by the user themselves, writable only on signup via a trigger

**Trigger:**
- Auto-create a profile row when a new user signs up

**Role-checking function:**
- `has_role(user_id, role)` security definer function for safe RLS checks

### New Pages and Components

- `/auth` -- Login/Signup page with role selection on signup
- `/profile` -- User profile page (shows different content for artist vs curator)
- Navigation bar component with login/signup/profile/logout links
- Update the homepage to auto-save search results when user is logged in

### Auth Setup
- Enable email/password authentication
- Configure Google OAuth via Lovable Cloud managed credentials
- Auto-confirm will NOT be enabled (users verify email first)

### File Changes Summary

| File | Change |
|------|--------|
| `src/pages/Auth.tsx` | New -- login/signup with role picker |
| `src/pages/Profile.tsx` | New -- artist/curator profile with search history |
| `src/components/Navbar.tsx` | New -- auth-aware navigation |
| `src/App.tsx` | Add routes, wrap with Navbar |
| `src/pages/Index.tsx` | Save results for logged-in users |
| Database migration | Create profiles, user_roles, saved_searches tables + RLS + triggers |

