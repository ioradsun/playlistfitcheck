
// Client-side profanity filter engine
// Words are stored lowercase; matching is case-insensitive and word-boundary aware

// MILD: only the most severe slurs and expletives
const MILD_LIST = [
  "fuck","shit","cunt","nigger","nigga","faggot","fag","kike","spic","chink",
  "twat","asshole","bastard","bitch","cock","dick","pussy","whore","slut","motherfucker",
  "fucker","fucking","bullshit","goddamn","jackass","douchebag","prick","wanker","arse",
];

// STANDARD: adds common profanity + drug references
const STANDARD_LIST = [
  ...MILD_LIST,
  "damn","hell","ass","crap","piss","tits","boobs","butt","horny","sex",
  "blowjob","handjob","dildo","vibrator","orgasm","cum","cumshot","jizz",
  "weed","cocaine","heroin","meth","crack","molly","ecstasy","shroom",
  "rape","molest","pedophile",
];

// STRICT: adds mild slang, adult references, violence
const STRICT_LIST = [
  ...STANDARD_LIST,
  "coke","dope","blunt","joint","bong","high","stoned","drunk","booze",
  "kill","murder","shoot","stab","gun","knife","blood","die","death",
  "sexy","nude","naked","porn","stripper","escort","hoe","thot","skank",
  "pimp","baller","gangsta","thug","hood","ghetto",
];

export type Strictness = "mild" | "standard" | "strict";

function getList(strictness: Strictness): string[] {
  if (strictness === "mild") return MILD_LIST;
  if (strictness === "strict") return STRICT_LIST;
  return STANDARD_LIST;
}

function censor(word: string): string {
  return "*".repeat(word.length);
}

export interface FlaggedWord {
  original: string;
  censored: string;
  count: number;
  firstTimestamp: number;
  lastTimestamp: number;
}

export interface ProfanityReport {
  totalFlagged: number;
  uniqueFlagged: number;
  flaggedWords: FlaggedWord[];
}

export interface LyricLine {
  start: number;
  end: number;
  text: string;
}

export function applyProfanityFilter(
  lines: LyricLine[],
  strictness: Strictness = "standard"
): { filteredLines: LyricLine[]; report: ProfanityReport } {
  const wordList = getList(strictness);
  const wordSet = new Set(wordList);

  // Build a regex that matches whole words (case-insensitive)
  const pattern = new RegExp(
    `\\b(${wordList.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
    "gi"
  );

  const flagMap = new Map<string, FlaggedWord>();
  let totalFlagged = 0;

  const filteredLines = lines.map((line) => {
    const text = line.text.replace(pattern, (match) => {
      const lower = match.toLowerCase();
      totalFlagged++;
      const existing = flagMap.get(lower);
      if (existing) {
        existing.count++;
        existing.lastTimestamp = line.start;
      } else {
        flagMap.set(lower, {
          original: lower,
          censored: censor(match),
          count: 1,
          firstTimestamp: line.start,
          lastTimestamp: line.start,
        });
      }
      return censor(match);
    });
    return { ...line, text };
  });

  const flaggedWords = Array.from(flagMap.values()).sort((a, b) => b.count - a.count);

  return {
    filteredLines,
    report: {
      totalFlagged,
      uniqueFlagged: flagMap.size,
      flaggedWords,
    },
  };
}
