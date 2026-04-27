import { Globe, Instagram, MessageCircle, Music2, ShoppingBag, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProfileRecord } from "@/components/profile/types";

interface Props {
  profile: ProfileRecord;
  isOwner: boolean;
  editing: boolean;
  onSocialChange: (key: keyof Pick<ProfileRecord, "spotify_embed_url" | "instagram_url" | "tiktok_url" | "youtube_url" | "website_url" | "merch_url">, value: string) => void;
  onDm: () => void;
}

const socialDefs = [
  { key: "spotify_embed_url", label: "Spotify", icon: SpotifyGlyph },
  { key: "instagram_url", label: "Instagram", icon: Instagram },
  { key: "tiktok_url", label: "TikTok", icon: Music2 },
  { key: "youtube_url", label: "YouTube", icon: Youtube },
  { key: "website_url", label: "Website", icon: Globe },
  { key: "merch_url", label: "Merch", icon: ShoppingBag },
] as const;

export function ProfileSocials({ profile, isOwner, editing, onSocialChange, onDm }: Props) {
  if (editing && isOwner) {
    return (
      <section className="rounded-xl border border-white/10 p-4 space-y-2">
        {socialDefs.map((item) => (
          <Input
            key={item.key}
            value={(profile[item.key] ?? "") as string}
            onChange={(event) => onSocialChange(item.key, event.target.value)}
            placeholder={`${item.label} URL`}
          />
        ))}
      </section>
    );
  }

  const entries = socialDefs.filter((item) => Boolean(profile[item.key]));
  if (!entries.length && !isOwner) return null;

  return (
    <section className="rounded-xl border border-white/10 p-4">
      <div className="flex flex-wrap gap-2">
        {entries.map((entry) => {
          const Icon = entry.icon;
          return (
            <a
              key={entry.key}
              href={profile[entry.key] as string}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-xl border border-white/10 px-3 py-2 text-xs font-mono tracking-wide hover:border-white/20"
            >
              <Icon size={14} className="mr-1.5" /> {entry.label}
            </a>
          );
        })}
        {!isOwner && (
          <Button variant="secondary" size="sm" onClick={onDm}>
            <MessageCircle size={14} className="mr-1.5" /> DM
          </Button>
        )}
        {isOwner && !entries.length && <p className="text-sm text-muted-foreground">Add your social links while editing.</p>}
      </div>
    </section>
  );
}

function SpotifyGlyph({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={className}>
      <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.5 17.34a.75.75 0 0 1-1.03.24c-2.81-1.72-6.34-2.11-10.5-1.15a.75.75 0 1 1-.34-1.46c4.54-1.04 8.43-.61 11.63 1.35a.75.75 0 0 1 .24 1.02zm1.47-3.26a.94.94 0 0 1-1.29.31c-3.22-1.98-8.12-2.55-11.93-1.37a.94.94 0 0 1-.56-1.8c4.17-1.3 9.53-.66 13.48 1.74.44.27.58.84.3 1.12zm.13-3.4C15.56 8.6 9.73 8.42 6.36 9.43a1.13 1.13 0 0 1-.66-2.16c3.87-1.18 10.31-.95 14.55 1.59a1.13 1.13 0 1 1-1.16 1.82z" />
    </svg>
  );
}
