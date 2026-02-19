import { formatDistanceToNow } from "date-fns";

export type ActiveVersion = "explicit" | "fmly";

interface VersionToggleProps {
  active: ActiveVersion;
  explicitLastEdited?: Date | null;
  fmlyLastEdited?: Date | null;
  hasFmly: boolean;
  onChange: (v: ActiveVersion) => void;
}

export function VersionToggle({
  active,
  explicitLastEdited,
  fmlyLastEdited,
  hasFmly,
  onChange,
}: VersionToggleProps) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Version</p>
      <div className="flex items-center gap-4 border-b border-border/40 pb-2">
        <button
          onClick={() => onChange("explicit")}
          className={`font-mono text-[11px] tracking-widest uppercase whitespace-nowrap transition-colors ${
            active === "explicit"
              ? "text-foreground font-medium"
              : "text-muted-foreground font-normal hover:text-foreground"
          }`}
        >
          Explicit
        </button>
        <button
          onClick={() => onChange("fmly")}
          className={`font-mono text-[11px] tracking-widest uppercase whitespace-nowrap transition-colors ${
            active === "fmly"
              ? "text-foreground font-medium"
              : "text-muted-foreground font-normal hover:text-foreground"
          }`}
        >
          FMLY Friendly
        </button>
      </div>
      <div className="text-[10px] font-mono text-muted-foreground/50">
        {active === "explicit" && explicitLastEdited
          ? `Edited ${formatDistanceToNow(explicitLastEdited, { addSuffix: true })}`
          : active === "fmly" && fmlyLastEdited
          ? `Edited ${formatDistanceToNow(fmlyLastEdited, { addSuffix: true })}`
          : ""}
      </div>
    </div>
  );
}
