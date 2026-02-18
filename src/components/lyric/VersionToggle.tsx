
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
      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Version</p>
      <div className="flex rounded-lg border border-border overflow-hidden text-sm">
        <button
          onClick={() => onChange("explicit")}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            active === "explicit"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          }`}
        >
          Explicit
        </button>
        <button
          onClick={() => onChange("fmly")}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            active === "fmly"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          }`}
        >
          {hasFmly ? "FMLY Friendly" : "FMLY Friendly ✦"}
        </button>
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground/60">
        <span>
          {active === "explicit" && explicitLastEdited
            ? `Edited ${formatDistanceToNow(explicitLastEdited, { addSuffix: true })}`
            : active === "fmly" && fmlyLastEdited
            ? `Edited ${formatDistanceToNow(fmlyLastEdited, { addSuffix: true })}`
            : ""}
        </span>
      </div>
    </div>
  );
}
