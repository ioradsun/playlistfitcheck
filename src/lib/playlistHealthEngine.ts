// Deterministic Playlist Health Scoring Engine

export interface PlaylistInput {
  playlistUrl: string;
  playlistId: string | null;
  playlistName?: string;
  ownerName?: string;
  playlistOwnerIsSpotifyEditorial?: boolean;
  description?: string;
  followersTotal?: number;
  tracksTotal?: number;
  lastUpdatedDays?: number;
  submissionLanguageDetected?: boolean;
  churnRate30d?: number;
  bottomDumpScore?: number;
}

export interface HealthOutput {
  input: {
    playlistUrl: string;
    playlistId: string | null;
  };
  summary: {
    healthScore: number;
    healthLabel: "EXCELLENT" | "STRONG" | "OK" | "WEAK" | "BAD";
    pitchSuitability: "GOOD_TARGET" | "LOW_PRIORITY" | "RISKY_SUBMISSION_FUNNEL" | "DO_NOT_PITCH_SPOTIFY_OWNED";
  };
  scoreBreakdown: {
    sizeFocus: number | null;
    followerTrackRatio: number | null;
    updateCadence: number | null;
    curatorIntentQuality: number | null;
    churnStability: number | null;
    trackPlacementBehavior: number | null;
  };
  flags: string[];
  missingFields: string[];
  notes: string[];
}

function scoreSizeFocus(tracksTotal?: number): number | null {
  if (tracksTotal == null) return null;
  if (tracksTotal >= 30 && tracksTotal <= 80) return 20;
  if (tracksTotal >= 81 && tracksTotal <= 150) return 15;
  if (tracksTotal >= 151 && tracksTotal <= 300) return 8;
  if (tracksTotal > 300) return 0;
  return 0; // < 30
}

function scoreFollowerTrackRatio(followers?: number, tracks?: number): number | null {
  if (followers == null || tracks == null || tracks === 0) return null;
  const ratio = followers / tracks;
  if (ratio >= 100) return 15;
  if (ratio >= 50) return 10;
  if (ratio >= 20) return 5;
  return 0;
}

function scoreUpdateCadence(lastUpdatedDays?: number): number | null {
  if (lastUpdatedDays == null) return null;
  if (lastUpdatedDays <= 7) return 15;
  if (lastUpdatedDays <= 30) return 10;
  if (lastUpdatedDays <= 90) return 5;
  return 0;
}

function scoreCuratorIntent(
  ownerName?: string,
  description?: string,
  isSpotifyEditorial?: boolean,
  submissionLanguageDetected?: boolean
): { score: number | null; isEditorial: boolean; isSubmissionFunnel: boolean } {
  if (isSpotifyEditorial) {
    return { score: 10, isEditorial: true, isSubmissionFunnel: false };
  }

  const desc = (description || "").toLowerCase();
  const submissionKeywords = ["submit", "submissions", " dm ", "promo", "placements", "guaranteed"];
  const hasSubmissionLanguage = submissionLanguageDetected || submissionKeywords.some(k => desc.includes(k));

  if (hasSubmissionLanguage) {
    return { score: 3, isEditorial: false, isSubmissionFunnel: true };
  }

  // Heuristic: if owner and description exist, score based on signals
  if (!ownerName && !description) return { score: null, isEditorial: false, isSubmissionFunnel: false };

  const hasTheme = description && description.length > 15;
  if (hasTheme) return { score: 15, isEditorial: false, isSubmissionFunnel: false };
  return { score: 5, isEditorial: false, isSubmissionFunnel: false };
}

function scoreChurnStability(churnRate30d?: number): number | null {
  if (churnRate30d == null) return null;
  if (churnRate30d >= 0.05 && churnRate30d <= 0.25) return 20;
  if (churnRate30d >= 0.26 && churnRate30d <= 0.45) return 12;
  if (churnRate30d >= 0.01 && churnRate30d <= 0.04) return 8;
  if (churnRate30d >= 0.46 && churnRate30d <= 0.70) return 5;
  return 0;
}

function scoreTrackPlacement(bottomDumpScore?: number): number | null {
  if (bottomDumpScore == null) return null;
  if (bottomDumpScore <= 0.25) return 15;
  if (bottomDumpScore <= 0.50) return 10;
  if (bottomDumpScore <= 0.75) return 5;
  return 0;
}

function getHealthLabel(score: number): HealthOutput["summary"]["healthLabel"] {
  if (score >= 85) return "EXCELLENT";
  if (score >= 75) return "STRONG";
  if (score >= 60) return "OK";
  if (score >= 40) return "WEAK";
  return "BAD";
}

export function computePlaylistHealth(input: PlaylistInput): HealthOutput {
  const missingFields: string[] = [];
  const flags: string[] = [];
  const notes: string[] = [];

  if (input.tracksTotal == null) missingFields.push("tracksTotal");
  if (input.followersTotal == null) missingFields.push("followersTotal");
  if (input.lastUpdatedDays == null) missingFields.push("lastUpdatedDays");
  if (input.churnRate30d == null) missingFields.push("churnRate30d");
  if (input.bottomDumpScore == null) missingFields.push("bottomDumpScore");

  const sizeFocus = scoreSizeFocus(input.tracksTotal);
  const followerTrackRatio = scoreFollowerTrackRatio(input.followersTotal, input.tracksTotal);
  const updateCadence = scoreUpdateCadence(input.lastUpdatedDays);
  const curatorResult = scoreCuratorIntent(
    input.ownerName, input.description,
    input.playlistOwnerIsSpotifyEditorial, input.submissionLanguageDetected
  );
  const curatorIntentQuality = curatorResult.score;
  const churnStability = scoreChurnStability(input.churnRate30d);
  const trackPlacementBehavior = scoreTrackPlacement(input.bottomDumpScore);

  if (curatorIntentQuality == null) missingFields.push("ownerName", "description");

  // Flags
  if (curatorResult.isEditorial) flags.push("SPOTIFY_EDITORIAL_PLAYLIST");
  if (curatorResult.isSubmissionFunnel) flags.push("SUBMISSION_LANGUAGE_DETECTED");
  if (input.tracksTotal && input.tracksTotal > 300) flags.push("OVERSIZED_PLAYLIST");
  if (input.churnRate30d != null && input.churnRate30d > 0.70) flags.push("HIGH_CHURN");
  if (input.bottomDumpScore != null && input.bottomDumpScore > 0.75) flags.push("BOTTOM_DUMP_DETECTED");

  // Notes
  if (input.tracksTotal && input.tracksTotal >= 30 && input.tracksTotal <= 80) {
    notes.push("Track count is in the ideal range for focused playlists.");
  }
  if (input.lastUpdatedDays != null && input.lastUpdatedDays <= 7) {
    notes.push("Playlist was recently updated — good signal of active curation.");
  }

  const maxMap = { sizeFocus: 20, followerTrackRatio: 15, updateCadence: 15, curatorIntentQuality: 15, churnStability: 20, trackPlacementBehavior: 15 };
  const scores = { sizeFocus, followerTrackRatio, updateCadence, curatorIntentQuality, churnStability, trackPlacementBehavior };

  let totalScore = 0;
  let maxPossible = 0;
  for (const [key, val] of Object.entries(scores)) {
    if (val != null) {
      totalScore += val;
      maxPossible += maxMap[key as keyof typeof maxMap];
    }
  }

  const healthScore = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;
  const healthLabel = getHealthLabel(healthScore);

  let pitchSuitability: HealthOutput["summary"]["pitchSuitability"];
  if (input.playlistOwnerIsSpotifyEditorial) {
    pitchSuitability = "DO_NOT_PITCH_SPOTIFY_OWNED";
  } else if (input.submissionLanguageDetected || curatorResult.isSubmissionFunnel) {
    pitchSuitability = "RISKY_SUBMISSION_FUNNEL";
  } else if (healthScore >= 75) {
    pitchSuitability = "GOOD_TARGET";
  } else {
    pitchSuitability = "LOW_PRIORITY";
  }

  return {
    input: { playlistUrl: input.playlistUrl, playlistId: input.playlistId },
    summary: { healthScore, healthLabel, pitchSuitability },
    scoreBreakdown: scores,
    flags,
    missingFields,
    notes,
  };
}

// Sample data for demo
export const SAMPLE_PLAYLIST: PlaylistInput = {
  playlistUrl: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
  playlistId: "37i9dQZF1DXcBWIGoYBM5M",
  playlistName: "Chill Vibes",
  ownerName: "indie_curator_mike",
  playlistOwnerIsSpotifyEditorial: false,
  description: "A carefully curated collection of chill indie, lo-fi and ambient tracks for studying and relaxation.",
  followersTotal: 8420,
  tracksTotal: 62,
  lastUpdatedDays: 3,
  submissionLanguageDetected: false,
  churnRate30d: 0.12,
  bottomDumpScore: 0.18,
};

export const SAMPLE_EDITORIAL: PlaylistInput = {
  playlistUrl: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
  playlistId: "37i9dQZF1DXcBWIGoYBM5M",
  playlistName: "Today's Top Hits",
  ownerName: "Spotify",
  playlistOwnerIsSpotifyEditorial: true,
  description: "The biggest songs right now.",
  followersTotal: 34500000,
  tracksTotal: 50,
  lastUpdatedDays: 1,
  submissionLanguageDetected: false,
  churnRate30d: 0.30,
  bottomDumpScore: 0.10,
};
