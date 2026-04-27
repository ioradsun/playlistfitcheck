import { Camera, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { FmlyBadge } from "@/components/FmlyBadge";

interface Props {
  userId: string;
  displayName: string;
  bio: string;
  avatarUrl?: string;
  isVerified: boolean;
  tintColor: string;
  isOwner: boolean;
  editing: boolean;
  uploading: boolean;
  onNameChange: (value: string) => void;
  onBioChange: (value: string) => void;
  onAvatarClick: () => void;
}

export function ProfileHero({
  userId,
  displayName,
  bio,
  avatarUrl,
  isVerified,
  tintColor,
  isOwner,
  editing,
  uploading,
  onNameChange,
  onBioChange,
  onAvatarClick,
}: Props) {
  const initials = (displayName || "?")
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <section
      className="rounded-2xl border border-white/10 p-5 sm:p-6 relative overflow-hidden"
      style={{ background: `radial-gradient(circle at 10% 15%, ${tintColor}33 0%, transparent 55%)` }}
    >
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
        <button
          type="button"
          className="group relative rounded-full"
          onClick={isOwner ? onAvatarClick : undefined}
          disabled={!isOwner || uploading}
        >
          <Avatar className="h-28 w-28 sm:h-32 sm:w-32 border border-white/10">
            <AvatarImage src={avatarUrl} />
            <AvatarFallback className="text-2xl font-semibold">{initials}</AvatarFallback>
          </Avatar>
          {isVerified && <span className="absolute bottom-1 right-1"><VerifiedBadge size={18} /></span>}
          {isOwner && (
            <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 bg-black/50 flex items-center justify-center transition-opacity">
              {uploading ? <Loader2 className="animate-spin" size={18} /> : <Camera size={18} />}
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono tracking-[0.2em] text-muted-foreground">FMLY</span>
            <FmlyBadge userId={userId} />
          </div>
          {editing ? (
            <Input value={displayName} onChange={(event) => onNameChange(event.target.value)} placeholder="Display name" />
          ) : (
            <h2 className="text-2xl sm:text-3xl font-semibold truncate">{displayName || "Unnamed artist"}</h2>
          )}

          {editing ? (
            <Textarea
              value={bio}
              onChange={(event) => onBioChange(event.target.value)}
              rows={3}
              placeholder="Add a one-line bio"
            />
          ) : (
            <p className="text-sm text-muted-foreground">{bio || (isOwner ? "Add a one-line bio" : "")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
