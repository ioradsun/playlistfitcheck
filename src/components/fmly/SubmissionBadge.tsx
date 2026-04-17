import { Badge } from "@/components/ui/badge";
import { Clock, Flame, Trophy, RotateCcw, Zap } from "lucide-react";

interface Props {
  status: string;
  expiresAt?: string | null;
  cooldownUntil?: string | null;
  compact?: boolean;
}

function daysLeft(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function SubmissionBadge({ status, expiresAt, cooldownUntil, compact }: Props) {
  switch (status) {
    case 'live': {
      const days = daysLeft(expiresAt);
      return (
        <Badge variant="default" className="bg-emerald-600 text-white border-emerald-700 gap-1 text-[10px] font-semibold">
          <Flame size={10} />
          {compact ? `${days}d` : `Live • ${days}d left`}
        </Badge>
      );
    }
    case 'expired':
      return (
        <Badge variant="secondary" className="bg-muted-foreground/80 text-white gap-1 text-[10px]">
          <Clock size={10} />
          Expired
        </Badge>
      );
    case 'cooldown': {
      const days = daysLeft(cooldownUntil);
      return (
        <Badge variant="secondary" className="bg-amber-600 text-white border-amber-700 gap-1 text-[10px]">
          <Clock size={10} />
          {compact ? `CD ${days}d` : `Cooldown • ${days}d`}
        </Badge>
      );
    }
    case 'eligible':
      return (
        <Badge variant="secondary" className="bg-blue-600 text-white border-blue-700 gap-1 text-[10px]">
          <RotateCcw size={10} />
          Re-Enter
        </Badge>
      );
    default:
      return null;
  }
}
