import { ArrowLeft, Check, Lock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  name: string;
  isOwner: boolean;
  fromMenu?: boolean;
  editing: boolean;
  lockedInCount: number;
  isLocked: boolean | null;
  onBack: () => void;
  onEditToggle: () => void;
  onLockToggle: () => void;
}

export function ProfileTopBar({
  name,
  isOwner,
  fromMenu,
  editing,
  lockedInCount,
  isLocked,
  onBack,
  onEditToggle,
  onLockToggle,
}: Props) {
  return (
    <div className="flex items-center gap-3">
      {!(isOwner && fromMenu) && (
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft size={18} />
        </Button>
      )}
      <h1 className="text-lg sm:text-xl font-semibold truncate">{name}</h1>

      <div className="ml-auto flex items-center gap-2">
        {isOwner ? (
          <>
            <span className="font-mono text-[11px] text-muted-foreground tracking-wide">LOCKED-IN {lockedInCount}</span>
            <Button variant={editing ? "secondary" : "outline"} size="sm" onClick={onEditToggle}>
              <Pencil size={14} className="mr-1" />
              {editing ? "Done" : "Edit"}
            </Button>
          </>
        ) : (
          <Button size="sm" variant={isLocked ? "secondary" : "outline"} onClick={onLockToggle} disabled={isLocked === null}>
            {isLocked ? (
              <>
                Locked in <Check size={14} className="ml-1" />
              </>
            ) : (
              <>
                <Lock size={14} className="mr-1" /> Lock in
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
