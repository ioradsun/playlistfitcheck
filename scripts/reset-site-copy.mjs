#!/usr/bin/env node

/**
 * reset-site-copy.mjs
 *
 * Resets the site_copy DB row to match DEFAULT_COPY in
 * src/hooks/useSiteCopy.tsx.
 *
 * Run once after the brand rename PR merges:
 *   node scripts/reset-site-copy.mjs
 *
 * Reads SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY from .env
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ── Read env ──────────────────────────────────────────────────
const envPath = resolve(root, ".env");
const envRaw = readFileSync(envPath, "utf8");
const env = Object.fromEntries(
  envRaw
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const [k, ...rest] = l.split("=");
      return [k.trim(), rest.join("=").trim().replace(/^"|"$/g, "")];
    })
);

const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY =
  env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY in .env");
  process.exit(1);
}

// ── The canonical DEFAULT_COPY ────────────────────────────────
// Copied verbatim from src/hooks/useSiteCopy.tsx DEFAULT_COPY.
// After any future copy changes, update this object to match.

const DEFAULT_COPY = {
  tools: {
    songfit: {
      label: "FMLY",
      pill: "See what your FMLY is making.",
      heading: "Your music. Their fire.",
      cta: "Drop it",
    },
    lyric: {
      label: "the Director",
      pill: "Turn sound into motion.",
      heading: "Make your music visible.",
      cta: "Make it move",
    },
    hitfit: {
      label: "the A&R",
      pill: "Is it ready?",
      heading: "Honest ears. No hype.",
      cta: "Get the read",
    },
    mix: {
      label: "the Engineer",
      pill: "Trust your ears.",
      heading: "Stop going back and forth. Decide.",
      cta: "Start comparing",
    },
    profit: {
      label: "the Manager",
      pill: "Know your worth.",
      heading: "Your streaming data. Your revenue roadmap.",
      cta: "Talk to the Manager",
    },
    playlist: {
      label: "the Plug",
      pill: "Get in the room.",
      heading: "Build the pitch that opens doors.",
      cta: "Build my pitch",
    },
    vibefit: {
      label: "the Creative",
      pill: "Build the world around your release.",
      heading: "Your track has a look. Find it.",
      cta: "Make the look",
    },
    dreamfit: {
      label: "FMLY Matters",
      pill: "Build with us.",
      heading: "The FMLY builds this together.",
      cta: "Add your voice",
    },
  },
  about: {
    origin_intro: "",
    origin_body: "",
    origin_tagline: "tools.fm — your label. your team. your FMLY.",
    listen_label: "What started it all.",
    tools_intro: "",
    products: [],
  },
  sidebar: {
    brand: "tools.fm",
    story_link: "our story",
  },
  pages: {
    about_title: "our story",
    about_subtitle: "What we built and why.",
    auth_title: "join the FMLY",
  },
  features: {
    crypto_tipping: false,
    growth_flow: false,
    growth_quotas: { guest: 5, limited: 10 },
    fmly_hook: true,
  },
  signals: {
    resolving_label: "STATUS: RESOLVING... ({n}/50 SIGNALS)",
    resolving_summary: "ACQUIRING INITIAL SIGNAL FROM THE FMLY.",
    detected_label: "STATUS: {n}/50 SIGNALS",
    detected_summary: "COLLECTING DATA TO REACH UNIT CONSENSUS.",
    consensus_label: "STATUS: CONSENSUS REACHED",
    consensus_summary: "{pct}% OF THE FMLY RESONATE WITH THIS.",
  },
};

// ── Fetch existing row id ─────────────────────────────────────
async function run() {
  console.log("Connecting to:", SUPABASE_URL);
  console.log("Resetting site_copy to new brand system...\n");

  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const getRes = await fetch(
    `${SUPABASE_URL}/rest/v1/site_copy?select=id&limit=1`,
    { headers }
  );
  const rows = await getRes.json();

  if (!Array.isArray(rows)) {
    console.error("Unexpected response:", rows);
    process.exit(1);
  }

  const body = JSON.stringify({ copy_json: DEFAULT_COPY });

  if (rows.length > 0) {
    const id = rows[0].id;
    console.log(`Found existing row. Updating id: ${id}`);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/site_copy?id=eq.${id}`,
      { method: "PATCH", headers, body }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error("Update failed:", err);
      process.exit(1);
    }
    console.log("✓ site_copy updated");
  } else {
    console.log("No existing row found. Inserting...");
    const res = await fetch(`${SUPABASE_URL}/rest/v1/site_copy`, {
      method: "POST",
      headers,
      body,
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("Insert failed:", err);
      process.exit(1);
    }
    console.log("✓ site_copy inserted");
  }

  console.log("\n✓ Done. Brand copy reset to new system.");
  console.log("  Reload the app to see changes.\n");
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
