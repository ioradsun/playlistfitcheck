import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

// Default copy (fallback if DB not loaded yet)
const DEFAULT_COPY: SiteCopy = {
  tools: {
    songfit: { label: "CrowdFit", pill: "See how your song fits listeners." },
    vibefit: { label: "VibeFit", pill: "Art & captions that fit your song.", heading: "Art & Captions That Fit Your Song", cta: "Fit My Vibe" },
    profit: { label: "ProFit", pill: "See how you can profit from your Spotify", heading: "Turn Your Spotify Data Into A Revenue Strategy", cta: "Generate My Plan" },
    playlist: { label: "PlaylistFit", pill: "See if your song fits playlists.", heading: "Check Playlist Health And Match Your Song", cta: "Analyze Playlist" },
    mix: { label: "MixFit", pill: "See which mix fits best.", heading: "Compare Mix Versions And Choose The Best Fit", cta: "Start Comparing" },
    lyric: { label: "LyricFit", pill: "Fit your lyrics inside captions.", heading: "Get Perfectly Timed Lyrics For Every Drop", cta: "Sync Lyrics" },
    hitfit: { label: "HitFit", pill: "See if your song fits the Top 10.", heading: "Compare Your Track to Your Target Sound", cta: "Analyze" },
    dreamfit: { label: "DreamFit", pill: "Let's build the next Fit together." },
  },
  about: {
    origin_intro: "",
    origin_body: "",
    origin_tagline: "toolsFM: experiments to find answers.",
    listen_label: "Listen to what started it all.",
    tools_intro: "",
    products: [],
  },
  sidebar: {
    brand: "toolsFM",
    story_link: "toolsFM story",
  },
  pages: {
    about_title: "toolsFM story",
    about_subtitle: "What we built and why.",
    auth_title: "Join the FMly",
  },
  features: {
    crypto_tipping: false,
    growth_flow: false,
    growth_quotas: { guest: 5, limited: 10 },
  },
};

export interface ToolCopy {
  label: string;
  pill: string;
  subheading?: string;
  heading?: string;
  cta?: string;
}

export interface AboutProduct {
  name: string;
  tagline: string;
  description: string;
  how: string;
}

export interface SiteCopy {
  tools: Record<string, ToolCopy>;
  about: {
    origin_intro: string;
    origin_body: string;
    origin_tagline: string;
    listen_label: string;
    tools_intro: string;
    products: AboutProduct[];
  };
  sidebar: {
    brand: string;
    story_link: string;
  };
  pages: {
    about_title: string;
    about_subtitle: string;
    auth_title: string;
  };
  features: {
    crypto_tipping: boolean;
    growth_flow: boolean;
    growth_quotas?: {
      guest: number;
      limited: number;
    };
    tools_enabled?: Record<string, boolean>;
    tools_order?: string[];
    crowdfit_mode?: "reactions" | "hook_review";
  };
}

const SiteCopyContext = createContext<SiteCopy>(DEFAULT_COPY);

export function SiteCopyProvider({ children }: { children: ReactNode }) {
  const [copy, setCopy] = useState<SiteCopy>(DEFAULT_COPY);

  const fetchCopy = async () => {
    const { data } = await supabase
      .from("site_copy")
      .select("copy_json")
      .limit(1)
      .single();
    if (data?.copy_json) {
      setCopy(deepMerge(DEFAULT_COPY, data.copy_json as any));
    }
  };

  useEffect(() => {
    fetchCopy();
    // Listen for admin updates
    const handler = () => fetchCopy();
    window.addEventListener("site-copy-updated", handler);
    return () => window.removeEventListener("site-copy-updated", handler);
  }, []);

  return (
    <SiteCopyContext.Provider value={copy}>
      {children}
    </SiteCopyContext.Provider>
  );
}

export function useSiteCopy() {
  return useContext(SiteCopyContext);
}

// Deep merge helper
function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
