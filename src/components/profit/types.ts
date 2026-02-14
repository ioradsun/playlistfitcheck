// ProFit shared types

export interface SpotifySignals {
  followers_total: number;
  artist_popularity: number;
  top_tracks_popularity_avg: number;
  top_tracks_popularity_max: number;
  top_tracks_popularity_skew: number;
  related_artists_count: number;
  related_artists_popularity_avg: number;
  release_count_recent: number;
  release_cadence_days_avg: number | null;
  market_breadth_proxy: number;
  catalog_depth_proxy: number;
}

export interface ArtistData {
  id: string;
  spotify_artist_id: string;
  name: string;
  image_url: string | null;
  genres: string[];
  followers_total: number;
  popularity: number;
  top_tracks: {
    name: string;
    popularity: number;
    preview_url: string | null;
    album_name: string;
    album_image: string | null;
  }[];
  related_artists: {
    name: string;
    popularity: number;
    followers: number;
    genres: string[];
  }[];
  recent_releases: {
    name: string;
    type: string;
    release_date: string;
    total_tracks: number;
    image: string | null;
  }[];
  signals: SpotifySignals;
}

export interface ScorecardItem {
  pillar: "Streaming" | "Live" | "Services" | "Digital" | "BrandLicensing";
  score: number;
  why: string;
}

export interface TopMove {
  rank: number;
  title: string;
  whyFits: string[];
  steps: string[];
  timeCost: "Low" | "Medium" | "High";
  outcome: string;
  measurement: string[];
}

export interface Blueprint {
  artistSnapshot: {
    positioning: string;
    bottleneck: string;
    bestLane: string;
  };
  signalsUsed: { label: string; value: string }[];
  tier: { name: string; reason: string };
  scorecard: ScorecardItem[];
  topMoves: TopMove[];
  ignoreNow: string[];
  roadmap90: {
    month1: string[];
    month2: string[];
    month3: string[];
  };
  weeklyChecklist: {
    week1: string[];
    week2: string[];
  };
  singleROIFocus: { focus: string; why: string };
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  structured?: {
    recommendation: string;
    whyTierFit: string[];
    nextSteps: string[];
    pitfalls: string[];
    nextActionQuestion: string;
  };
}

export interface ProfitReport {
  id: string;
  artist: ArtistData;
  blueprint: Blueprint;
  share_token: string;
  created_at: string;
}

export type PlanVariantType = "7day" | "30day" | "streams" | "live" | "services" | "digital" | "aggressive" | "lowrisk";
