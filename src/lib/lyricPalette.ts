const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const MOOD_PALETTES: Record<string, string[]> = {
  intimate: ["#0A0A0F", "#C9A96E", "#F0ECE2", "#FFD700", "#5A4A30"],
  anthemic: ["#1A0A05", "#E8632B", "#FFF0E6", "#FF6B35", "#7D3A1A"],
  dreamy: ["#0A0510", "#B088F9", "#F0E6FF", "#C49EFF", "#5A3A8A"],
  aggressive: ["#050A14", "#4FA4D4", "#E8F4F8", "#00BFFF", "#2A5570"],
  melancholy: ["#050A14", "#2255AA", "#E8F4F8", "#4FA4D4", "#2A5570"],
  euphoric: ["#0A0A0F", "#C9A96E", "#F0ECE2", "#FFD700", "#5A4A30"],
  eerie: ["#050F0A", "#00BFA5", "#E0F5F0", "#00FFCC", "#1A5A4A"],
  vulnerable: ["#0F0510", "#D4618C", "#F5E6EE", "#FF69B4", "#8A3358"],
  triumphant: ["#0A0A0F", "#C9A96E", "#F0ECE2", "#FFD700", "#5A4A30"],
  nostalgic: ["#0F0A05", "#A0845C", "#F5EDE2", "#C4A878", "#6A5030"],
  defiant: ["#0E0E12", "#A0A4AC", "#E8E8EC", "#B8BCC4", "#5A5A66"],
  hopeful: ["#050F05", "#228844", "#E6FFE6", "#34D058", "#1A5A2A"],
  raw: ["#0E0E12", "#A0A4AC", "#E8E8EC", "#B8BCC4", "#5A5A66"],
  hypnotic: ["#0A0510", "#B088F9", "#F0E6FF", "#C49EFF", "#5A3A8A"],
};

export function darkenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - amount;
  return `#${Math.round(r * f).toString(16).padStart(2, "0")}${Math.round(g * f).toString(16).padStart(2, "0")}${Math.round(b * f).toString(16).padStart(2, "0")}`;
}

export function lightenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `#${Math.min(255, Math.round(r + (255 - r) * amount)).toString(16).padStart(2, "0")}${Math.min(255, Math.round(g + (255 - g) * amount)).toString(16).padStart(2, "0")}${Math.min(255, Math.round(b + (255 - b) * amount)).toString(16).padStart(2, "0")}`;
}

export function desaturateHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
  const f = amount;
  return `#${Math.round(r + (gray - r) * f).toString(16).padStart(2, "0")}${Math.round(g + (gray - g) * f).toString(16).padStart(2, "0")}${Math.round(b + (gray - b) * f).toString(16).padStart(2, "0")}`;
}

export function derivePaletteFromDirection(cd: any): string[] {
  const autoPalettes = cd?.auto_palettes;
  if (Array.isArray(autoPalettes) && autoPalettes.length > 0 && Array.isArray(autoPalettes[0])) {
    return autoPalettes[0].filter((c: unknown) => typeof c === "string");
  }

  const sections = cd?.sections;
  if (Array.isArray(sections) && sections.length > 0) {
    const dominantColors = sections
      .map((s: any) => s?.dominantColor)
      .filter((c: unknown): c is string => typeof c === "string" && HEX_COLOR_RE.test(c));

    if (dominantColors.length > 0) {
      const primary = dominantColors[0];
      const accent = dominantColors.length > 1 ? dominantColors[1] : primary;
      return [
        darkenHex(primary, 0.85),
        accent,
        "#ffffff",
        lightenHex(accent, 0.3),
        desaturateHex(primary, 0.6),
      ];
    }
  }

  if (Array.isArray(cd?.palette) && cd.palette.length > 0) {
    return cd.palette.filter((c: unknown) => typeof c === "string");
  }

  const firstMood = sections?.[0]?.visualMood;
  if (firstMood && MOOD_PALETTES[firstMood]) return MOOD_PALETTES[firstMood];

  return ["#0A0A0F", "#C9A96E", "#F0ECE2", "#FFD700", "#5A4A30"];
}
