/**
 * Centralized route path constants.
 * Every navigable tool path lives here so renames propagate from one place.
 */

export const ROUTES = {
  // FMLY
  fmly:        "/fmly",
  fmlyMatters: "/fmly-matters",

  // Team tools
  director:  "/the-director",
  ar:        "/the-ar",
  engineer:  "/the-engineer",
  manager:   "/the-manager",
  plug:      "/the-plug",
  creative:  "/the-creative",
} as const;

/** Map from internal tool key → route path */
export const TOOL_TO_PATH: Record<string, string> = {
  songfit:   ROUTES.fmly,
  dreamfit:  ROUTES.fmlyMatters,
  lyric:     ROUTES.director,
  hitfit:    ROUTES.ar,
  mix:       ROUTES.engineer,
  profit:    ROUTES.manager,
  playlist:  ROUTES.plug,
  vibefit:   ROUTES.creative,
};

/** Map from route path → internal tool key (includes legacy paths for redirect support) */
export const PATH_TO_TOOL_KEY: Record<string, string> = {
  [ROUTES.fmly]:        "songfit",
  [ROUTES.fmlyMatters]: "dreamfit",
  [ROUTES.director]:    "lyric",
  [ROUTES.ar]:          "hitfit",
  [ROUTES.engineer]:    "mix",
  [ROUTES.manager]:     "profit",
  [ROUTES.plug]:        "playlist",
  [ROUTES.creative]:    "vibefit",
  // Legacy paths (for redirects)
  "/CrowdFit":    "songfit",
  "/SongFit":     "songfit",
  "/LyricFit":    "lyric",
  "/HitFit":      "hitfit",
  "/MixFit":      "mix",
  "/ProFit":      "profit",
  "/PlaylistFit": "playlist",
  "/VibeFit":     "vibefit",
  "/DreamFit":    "dreamfit",
};

/** Legacy paths that should redirect to new paths */
export const LEGACY_REDIRECTS: Record<string, string> = {
  "/CrowdFit":    ROUTES.fmly,
  "/SongFit":     ROUTES.fmly,
  "/LyricFit":    ROUTES.director,
  "/HitFit":      ROUTES.ar,
  "/MixFit":      ROUTES.engineer,
  "/ProFit":      ROUTES.manager,
  "/PlaylistFit": ROUTES.plug,
  "/VibeFit":     ROUTES.creative,
  "/DreamFit":    ROUTES.fmlyMatters,
};
