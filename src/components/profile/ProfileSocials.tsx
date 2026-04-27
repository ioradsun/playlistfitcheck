import { Globe, Instagram, MessageCircle, Music2, ShoppingBag, Spotify, Youtube } from "lucide-react";
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
  { key: "spotify_embed_url", label: "Spotify", icon: Spotify },
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
