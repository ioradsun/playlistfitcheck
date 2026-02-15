export interface Dream {
  id: string;
  user_id: string;
  title: string;
  frustration: string;
  transformation: string;
  dream_type: "feature" | "new_fit";
  target_fit: string | null;
  status: "seeding" | "momentum" | "review" | "building" | "live" | "not_a_fit";
  status_note: string | null;
  backers_count: number;
  comments_count: number;
  trending_score: number;
  created_at: string;
  profiles?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

export interface DreamComment {
  id: string;
  dream_id: string;
  user_id: string;
  content: string;
  parent_comment_id: string | null;
  created_at: string;
  profiles?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

export const STATUS_CONFIG: Record<string, { label: string; emoji: string; className: string }> = {
  seeding: { label: "Seeding", emoji: "🌱", className: "bg-emerald-500/10 text-emerald-400" },
  momentum: { label: "Momentum", emoji: "🔥", className: "bg-orange-500/10 text-orange-400" },
  review: { label: "Under Review", emoji: "👀", className: "bg-yellow-500/10 text-yellow-400" },
  building: { label: "In Development", emoji: "🛠", className: "bg-blue-500/10 text-blue-400" },
  live: { label: "Live", emoji: "🚀", className: "bg-primary/10 text-primary" },
  not_a_fit: { label: "Not a Fit", emoji: "❌", className: "bg-destructive/10 text-destructive" },
};

