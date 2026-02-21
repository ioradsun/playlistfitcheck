/** Normalize a string to a URL-safe slug: lowercase, hyphenated, no punctuation */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "")           // remove smart quotes
    .replace(/[^\w\s-]/g, "")       // strip punctuation
    .replace(/\s+/g, "-")           // spaces → hyphens
    .replace(/-+/g, "-")            // collapse multiple hyphens
    .replace(/^-|-$/g, "");         // trim leading/trailing hyphens
}
