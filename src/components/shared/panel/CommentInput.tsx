interface CommentInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  onFocus?: () => void;
  placeholder?: string;
  hasSubmitted?: boolean;
  size?: 'compact' | 'full';
}

export function CommentInput({
  value,
  onChange,
  onSubmit,
  onClose,
  onFocus,
  placeholder = 'What hit the hardest?',
  hasSubmitted = false,
  size = 'compact',
}: CommentInputProps) {
  const heightClass = size === 'full' ? 'h-11' : 'h-8';
  const textSize = size === 'full' ? 'text-[12px]' : 'text-[11px]';
  const px = size === 'full' ? 'px-4' : 'px-3';
  const borderRadius = size === 'full' ? 'rounded-lg' : 'rounded-md';

  return (
    <div
      className="shrink-0 border-t border-white/[0.06] px-2 py-1 relative"
      style={{ background: 'rgba(10,10,10,0.95)' }}
    >
      <div className={`relative ${heightClass}`}>
        <div
          className={`absolute inset-0 transition-opacity ${
            hasSubmitted ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSubmit();
              }
              if (e.key === 'Escape') onClose();
            }}
            placeholder={placeholder}
            maxLength={200}
            className={`w-full ${heightClass} bg-white/[0.04] border border-white/[0.07] ${borderRadius} ${px} ${textSize} text-white placeholder:text-white/18 focus:outline-none focus:border-white/15 transition-colors`}
          />
        </div>
        <div
          className={`absolute inset-0 flex items-center justify-center text-[10px] font-mono text-white/30 transition-opacity ${
            hasSubmitted ? 'opacity-100' : 'opacity-0 pointer-events-none'
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
