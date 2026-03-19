import { EMOJIS, type EmojiKey } from "./panelConstants";

interface EmojiBarProps {
  counts: Partial<Record<EmojiKey, number>>;
  reacted: Set<string>;
  palette?: string[];
  onReact: (key: EmojiKey) => void;
  variant?: "strip" | "grid";
}

export function EmojiBar({
  counts,
  reacted,
  palette,
  onReact,
  variant = "strip",
}: EmojiBarProps) {
  if (variant === "grid") {
    return (
      <div className="grid grid-cols-6 gap-1 px-3 pb-3 min-h-[60px]">
        {EMOJIS.map(({ key, symbol }) => {
          const count = counts[key] ?? 0;
          const hasReacted = reacted.has(key);
          return (
            <button
              key={key}
              onClick={() => onReact(key)}
              className="flex flex-col items-center py-2 rounded-xl transition-all active:scale-95 focus:outline-none"
              style={{
                background: hasReacted
                  ? `${palette?.[1] ?? "#ffffff"}12`
                  : "transparent",
                boxShadow: hasReacted
                  ? `inset 0 -2px 0 0 ${palette?.[1] ?? "rgba(255,255,255,0.5)"}`
                  : "inset 0 -2px 0 0 transparent",
              }}
            >
              <span className="text-lg leading-none">{symbol}</span>
              <span
                className="text-[9px] font-mono leading-none min-h-[11px]"
                style={{
                  opacity: count > 0 ? 1 : 0,
                  color: hasReacted
                    ? (palette?.[1] ?? "rgba(255,255,255,0.8)")
                    : "rgba(255,255,255,0.35)",
                }}
              >
                {count || 0}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-around px-2 h-10 shrink-0 border-b border-white/[0.04]">
      {EMOJIS.map(({ key, symbol }) => {
        const count = counts[key] ?? 0;
        const hasReacted = reacted.has(key);
        return (
          <button
            key={key}
            onClick={() => onReact(key)}
            className="flex items-center gap-1 text-lg px-2 py-1 rounded-md transition-all active:scale-90 focus:outline-none"
            style={{
              background: hasReacted
                ? `${palette?.[1] ?? "#ffffff"}15`
                : "transparent",
              opacity: hasReacted ? 1 : 0.7,
            }}
          >
            <span>{symbol}</span>
            {count > 0 && (
              <span className="text-[8px] font-mono text-white/30">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
