import { useRef } from "react";

interface CommentInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  onFocus?: () => void;
  placeholder?: string;
  hasSubmitted?: boolean;
  size?: "compact" | "full";
}

export function CommentInput({
  value,
  onChange,
  onSubmit,
  onClose,
  onFocus,
  placeholder = "What hit",
  hasSubmitted = false,
  size = "compact",
}: CommentInputProps) {
  const heightClass = size === "full" ? "h-11" : "h-8";
  const textSize = size === "full" ? "text-[13px]" : "text-[12px]";
  const px = size === "full" ? "px-4" : "px-3";

  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className="relative z-10 shrink-0 px-2 py-1"
      style={{
        background: "#0a0a0a",
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className={`relative ${heightClass}`}>
        <div
          className={`absolute inset-0 transition-opacity ${
            hasSubmitted ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSubmit();
              }
              if (e.key === "Escape") onClose();
            }}
            placeholder={placeholder}
            maxLength={200}
            className={`w-full ${heightClass} bg-transparent ${px} ${textSize} text-white/80 placeholder:text-white/25 focus:outline-none transition-colors`}
          />
        </div>
        <div
          className={`absolute inset-0 flex items-center justify-center text-[10px] font-mono text-white/30 transition-opacity ${
            hasSubmitted ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          ✓ sent
        </div>
      </div>

      <style>{`
        @keyframes liftFade {
          0%   { transform: translateY(0);     opacity: 0.7; }
          100% { transform: translateY(-36px); opacity: 0;   }
        }
      `}</style>
    </div>
  );
}
