// Deterministic Playlist Fit Scoring Engine

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
  avgTrackPopularity?: number;
}

export interface HealthOutput {
  input: {
    playlistUrl: string;
    playlistId: string | null;
  };
  summary: {
    healthScore: number;
    healthLabel: "GREAT_FIT" | "GOOD_FIT" | "POSSIBLE_FIT" | "WEAK_FIT" | "POOR_FIT";
    pitchSuitability: "WORTH_PITCHING" | "LOW_PRIORITY" | "ACCEPTS_SUBMISSIONS" | "HIGH_RISK" | "SPOTIFY_EDITORIAL";
  };
  scoreBreakdown: {
    songActivity: number | null;
    focusLevel: number | null;
    curatorType: number | null;
    recentActivity: number | null;
    reachPerSong: number | null;
    rotationStyle: number | null;
    songPlacement: number | null;
  };
  flags: string[];
  missingFields: string[];
  notes: string[];
  narrative?: string;
  recommendation?: string;
}

function scoreFocusLevel(tracksTotal?: number): number | null {
  if (tracksTotal == null) return null;
  if (tracksTotal >= 30 && tracksTotal <= 80) return 20;
  if (tracksTotal >= 81 && tracksTotal <= 150) return 15;
  if (tracksTotal >= 151 && tracksTotal <= 300) return 8;
  if (tracksTotal > 300) return 0;
  return 0;
}

function scoreReachPerSong(followers?: number, tracks?: number): number | null {
  if (followers == null || tracks == null || tracks === 0) return null;
  const ratio = followers / tracks;
  if (ratio >= 100) return 15;
  if (ratio >= 50) return 10;
  if (ratio >= 20) return 5;
  return 0;
}

function scoreRecentActivity(lastUpdatedDays?: number): number | null {
  if (lastUpdatedDays == null) return null;
  if (lastUpdatedDays <= 7) return 15;
  if (lastUpdatedDays <= 30) return 10;
  if (lastUpdatedDays <= 90) return 5;
  return 0;
}

function scoreCuratorType(
  ownerName?: string,
  description?: string,
  isSpotifyEditorial?: boolean,
  submissionLanguageDetected?: boolean
): { score: number | null; isEditorial: boolean; isSubmissionFunnel: boolean; isPayForPlay: boolean } {
  if (isSpotifyEditorial) {
    return { score: 10, isEditorial: true, isSubmissionFunnel: false, isPayForPlay: false };
  }

  const desc = (description || "").toLowerCase();

  const payForPlayPhrases = ["guaranteed placement", "guaranteed add", "pay for play", "pay for placement", "fee for inclusion", "promotional service", "direct placement", "promo package", "paid placement", "paid promotion", "buy placement"];
  const payForPlayWords = ["payola"];
  const hasPayForPlay = payForPlayPhrases.some(p => desc.includes(p)) || payForPlayWords.some(w => new RegExp(`\\b${w}\\b`).test(desc));

  const submissionKeywords = ["submit", "submissions", " dm "];
  const hasSubmissionLanguage = submissionLanguageDetected || submissionKeywords.some(k => desc.includes(k));

  if (hasPayForPlay) {
    return { score: 3, isEditorial: false, isSubmissionFunnel: true, isPayForPlay: true };
  }

  if (hasSubmissionLanguage) {
    return { score: 8, isEditorial: false, isSubmissionFunnel: true, isPayForPlay: false };
  }

  if (!ownerName && !description) return { score: null, isEditorial: false, isSubmissionFunnel: false, isPayForPlay: false };

  const hasTheme = description && description.length > 15;
  if (hasTheme) return { score: 15, isEditorial: false, isSubmissionFunnel: false, isPayForPlay: false };
  return { score: 5, isEditorial: false, isSubmissionFunnel: false, isPayForPlay: false };
}

function scoreRotationStyle(churnRate30d?: number): number | null {
  if (churnRate30d == null) return null;
  if (churnRate30d >= 0.05 && churnRate30d <= 0.25) return 20;
  if (churnRate30d >= 0.26 && churnRate30d <= 0.45) return 12;
  if (churnRate30d >= 0.01 && churnRate30d <= 0.04) return 8;
  if (churnRate30d >= 0.46 && churnRate30d <= 0.70) return 5;
  return 0;
}

function scoreSongPlacement(bottomDumpScore?: number): number | null {
  if (bottomDumpScore == null) return null;
  if (bottomDumpScore <= 0.25) return 15;
  if (bottomDumpScore <= 0.50) return 10;
  if (bottomDumpScore <= 0.75) return 5;
  return 0;
}

function scoreSongActivity(avgPopularity?: number): number | null {
  if (avgPopularity == null) return null;
  if (avgPopularity >= 60) return 20;
  if (avgPopularity >= 40) return 15;
  if (avgPopularity >= 20) return 8;
  return 0;
}

function getFitLabel(score: number): HealthOutput["summary"]["healthLabel"] {
  if (score >= 85) return "GREAT_FIT";
  if (score >= 75) return "GOOD_FIT";
  if (score >= 60) return "POSSIBLE_FIT";
  if (score >= 40) return "WEAK_FIT";
  return "POOR_FIT";
}

const FIT_LABEL_DISPLAY: Record<HealthOutput["summary"]["healthLabel"], { emoji: string; text: string }> = {
  GREAT_FIT: { emoji: "🔥", text: "Great Fit" },
  GOOD_FIT: { emoji: "👍", text: "Good Fit" },
  POSSIBLE_FIT: { emoji: "🤷", text: "Possible Fit" },
  WEAK_FIT: { emoji: "⚠️", text: "Weak Fit" },
  POOR_FIT: { emoji: "❌", text: "Poor Fit" },
};

export function getFitLabelDisplay(label: HealthOutput["summary"]["healthLabel"]) {
  return FIT_LABEL_DISPLAY[label];
}

function generateNarrative(input: PlaylistInput, scores: HealthOutput["scoreBreakdown"], healthScore: number, curatorResult: ReturnType<typeof scoreCuratorType>): string {
  const parts: string[] = [];

  // Song Activity narrative
  if (scores.songActivity != null) {
    if (scores.songActivity >= 15) {
      parts.push(`Songs on this playlist are generally active on Spotify${input.avgTrackPopularity ? ` (avg popularity ${input.avgTrackPopularity})` : ""}, indicating real listener demand.`);
    } else if (scores.songActivity >= 8) {
      parts.push(`Moderate song activity${input.avgTrackPopularity ? ` (avg popularity ${input.avgTrackPopularity})` : ""}. Some engagement, but room for stronger options.`);
    } else {
      parts.push(`Low song activity${input.avgTrackPopularity ? ` (avg popularity ${input.avgTrackPopularity})` : ""}. Low-activity playlists rarely generate traction.`);
    }
  }

  // Focus Level
  if (scores.focusLevel != null) {
    if (input.tracksTotal != null) {
      if (scores.focusLevel >= 20) {
        parts.push(`With ${input.tracksTotal} tracks, this is a focused playlist where each song gets attention.`);
      } else if (scores.focusLevel >= 15) {
        parts.push(`At ${input.tracksTotal} tracks, it's slightly large but still manageable.`);
      } else {
        parts.push(`With ${input.tracksTotal} tracks, your song will compete with a crowded field.`);
      }
    }
  }

  // Curator
  if (curatorResult.isPayForPlay) {
    parts.push("There are pay-for-play red flags in the description — proceed with caution.");
  } else if (curatorResult.isEditorial) {
    parts.push("This is a Spotify Editorial playlist. Use Spotify for Artists instead of pitching directly.");
  } else if (curatorResult.isSubmissionFunnel) {
    parts.push("The curator accepts submissions — check the description for their preferred method.");
  }

  // Recent Activity
  if (scores.recentActivity != null) {
    if (input.lastUpdatedDays != null) {
      if (input.lastUpdatedDays <= 7) {
        parts.push("The curator is actively managing this playlist.");
      } else if (input.lastUpdatedDays > 90) {
        parts.push(`Last updated ${input.lastUpdatedDays} days ago — the curator may have moved on.`);
      }
    }
  }

  // Reach
  if (scores.reachPerSong != null && input.followersTotal != null && input.tracksTotal != null && input.tracksTotal > 0) {
    const ratio = Math.round(input.followersTotal / input.tracksTotal);
    if (ratio >= 100) {
      parts.push(`Each song gets excellent exposure (${ratio}:1 follower-to-track ratio).`);
    } else if (ratio < 20) {
      parts.push(`Low reach per song (${ratio}:1 ratio) — limited exposure for each track.`);
    }
  }

  return parts.join(" ");
}

function generateRecommendation(healthScore: number, curatorResult: ReturnType<typeof scoreCuratorType>, input: PlaylistInput): string {
  if (curatorResult.isEditorial) {
    return "Use Spotify for Artists (S4A) to submit. Don't pitch directly.";
  }
  if (curatorResult.isPayForPlay) {
    return "Skip. Pay-for-play playlists can hurt your algorithmic standing.";
  }
  if (healthScore >= 85) {
    if (curatorResult.isSubmissionFunnel) {
      return "Pitch directly. Check the playlist description for their submission method (DM, email, form). High confidence this will drive real plays.";
    }
    return "Worth pitching. This playlist shows strong signals across the board.";
  }
  if (healthScore >= 75) {
    return "Solid choice. Worth pitching or submitting if your song fits the vibe.";
  }
  if (healthScore >= 60) {
    return "Might work, but stronger options likely exist. Consider if strategically aligned.";
  }
  if (healthScore >= 40) {
    return "Long shot. Only consider if strategically aligned with your genre and goals.";
  }
  return "Skip this one. Your time is better spent elsewhere.";
}

export function computePlaylistHealth(input: PlaylistInput): HealthOutput {
  const missingFields: string[] = [];
  const flags: string[] = [];
  const notes: string[] = [];

  if (input.tracksTotal == null) missingFields.push("tracksTotal");
  if (input.followersTotal == null) missingFields.push("followersTotal");
  if (input.avgTrackPopularity == null) missingFields.push("avgTrackPopularity");
  if (input.lastUpdatedDays == null) missingFields.push("lastUpdatedDays");
  if (input.churnRate30d == null) missingFields.push("churnRate30d");
  if (input.bottomDumpScore == null) missingFields.push("bottomDumpScore");

  const focusLevel = scoreFocusLevel(input.tracksTotal);
  const reachPerSong = scoreReachPerSong(input.followersTotal, input.tracksTotal);
  const recentActivity = scoreRecentActivity(input.lastUpdatedDays);
  const curatorResult = scoreCuratorType(
    input.ownerName, input.description,
    input.playlistOwnerIsSpotifyEditorial, input.submissionLanguageDetected
  );
  const curatorType = curatorResult.score;
  const songActivity = scoreSongActivity(input.avgTrackPopularity);
  const rotationStyle = scoreRotationStyle(input.churnRate30d);
  const songPlacement = scoreSongPlacement(input.bottomDumpScore);

  if (curatorType == null) missingFields.push("ownerName", "description");

  // Flags
  if (curatorResult.isEditorial) flags.push("SPOTIFY_EDITORIAL_PLAYLIST");
  if (curatorResult.isPayForPlay) flags.push("PAY_FOR_PLAY_LANGUAGE_DETECTED");
  if (curatorResult.isSubmissionFunnel && !curatorResult.isPayForPlay) flags.push("ACCEPTS_SUBMISSIONS");
  if (input.tracksTotal && input.tracksTotal > 300) flags.push("OVERSIZED_PLAYLIST");
  if (input.churnRate30d != null && input.churnRate30d > 0.70) flags.push("HIGH_CHURN");
  if (input.bottomDumpScore != null && input.bottomDumpScore > 0.75) flags.push("BOTTOM_DUMP_DETECTED");

  const maxMap = { songActivity: 20, focusLevel: 20, curatorType: 15, recentActivity: 15, reachPerSong: 15, rotationStyle: 20, songPlacement: 15 };
  const scores = { songActivity, focusLevel, curatorType, recentActivity, reachPerSong, rotationStyle, songPlacement };

  let totalScore = 0;
  let maxPossible = 0;
  for (const [key, val] of Object.entries(scores)) {
    if (val != null) {
      totalScore += val;
      maxPossible += maxMap[key as keyof typeof maxMap];
    }
  }

  const healthScore = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;
  const healthLabel = getFitLabel(healthScore);

  let pitchSuitability: HealthOutput["summary"]["pitchSuitability"];
  if (input.playlistOwnerIsSpotifyEditorial) {
    pitchSuitability = "SPOTIFY_EDITORIAL";
  } else if (curatorResult.isPayForPlay) {
    pitchSuitability = "HIGH_RISK";
  } else if (curatorResult.isSubmissionFunnel) {
    pitchSuitability = "ACCEPTS_SUBMISSIONS";
  } else if (healthScore >= 75) {
    pitchSuitability = "WORTH_PITCHING";
  } else {
    pitchSuitability = "LOW_PRIORITY";
  }

  const narrative = generateNarrative(input, scores, healthScore, curatorResult);
  const recommendation = generateRecommendation(healthScore, curatorResult, input);

  return {
    input: { playlistUrl: input.playlistUrl, playlistId: input.playlistId },
    summary: { healthScore, healthLabel, pitchSuitability },
    scoreBreakdown: scores,
    flags,
    missingFields,
    notes,
    narrative,
    recommendation,
  };
}

// Sample data for demo
export const SAMPLE_PLAYLIST: PlaylistInput & { _trackList: { name: string; artists: string }[] } = {
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
  _trackList: [
    { name: "Weightless", artists: "Marconi Union" },
    { name: "Sunset Lover", artists: "Petit Biscuit" },
    { name: "Intro", artists: "The xx" },
    { name: "Skinny Love", artists: "Bon Iver" },
    { name: "Electric Feel", artists: "MGMT" },
    { name: "Do I Wanna Know?", artists: "Arctic Monkeys" },
    { name: "Motion Sickness", artists: "Phoebe Bridgers" },
    { name: "Pink + White", artists: "Frank Ocean" },
    { name: "Cigarette Daydreams", artists: "Cage The Elephant" },
    { name: "Apocalypse", artists: "Cigarettes After Sex" },
    { name: "Dissolve", artists: "Absofacto" },
    { name: "Ivy", artists: "Frank Ocean" },
    { name: "Agnes", artists: "Glass Animals" },
    { name: "Dreams", artists: "Fleetwood Mac" },
    { name: "Redbone", artists: "Childish Gambino" },
  ],
};

export const SAMPLE_EDITORIAL: PlaylistInput & { _trackList: { name: string; artists: string }[] } = {
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
  _trackList: [
    { name: "Die With A Smile", artists: "Lady Gaga, Bruno Mars" },
    { name: "APT.", artists: "ROSÉ, Bruno Mars" },
    { name: "Birds of a Feather", artists: "Billie Eilish" },
    { name: "Espresso", artists: "Sabrina Carpenter" },
    { name: "That's So True", artists: "Gracie Abrams" },
    { name: "Taste", artists: "Sabrina Carpenter" },
    { name: "Good Luck, Babe!", artists: "Chappell Roan" },
    { name: "Stargazing", artists: "Myles Smith" },
    { name: "Luther", artists: "Kendrick Lamar, SZA" },
    { name: "I Love You, I'm Sorry", artists: "Gracie Abrams" },
    { name: "Timeless", artists: "The Weeknd, Playboi Carti" },
    { name: "Messy", artists: "Lola Young" },
    { name: "Sympathy Is a Knife", artists: "Charli XCX" },
    { name: "Beautiful Things", artists: "Benson Boone" },
    { name: "Too Sweet", artists: "Hozier" },
  ],
};
