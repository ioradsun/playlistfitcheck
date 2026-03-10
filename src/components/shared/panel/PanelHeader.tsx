import { X } from 'lucide-react';

interface PanelHeaderProps {
  /**
   * "live"    — pulsing dot, "Live" label
   * "freezing" — pulsing dot, "Line Live" label
   * "engaged"  — no pulse, "Line Paused" label
   */
  status?: 'live' | 'freezing' | 'engaged';
  palette?: string[];
  onClose: () => void;
  /** Optional right-side actions rendered before the X button */
  actions?: React.ReactNode;
  /**
   * "compact" — 28px height (embedded cards)
   * "full"    — 56px height (fullscreen)
   */
  size?: 'compact' | 'full';
}

export function PanelHeader({
  status = 'live',
  palette,
  onClose,
  actions,
  size = 'compact',
}: PanelHeaderProps) {
  const statusLabel =
    status === 'freezing' ? 'Line Live' :
      status === 'engaged' ? 'Line Paused' :
        'Live';

  const isEngaged = status === 'engaged';
  const heightClass = size === 'full' ? 'px-5 pt-4 pb-3' : 'px-3 h-7';

  return (
    <div
      className={`flex items-center justify-between ${heightClass} shrink-0 border-b border-white/[0.05]`}
      style={size === 'full' ? { background: '#0d0d0d' } : undefined}
    >
      <div className="flex items-center gap-1.5">
        <div
          className="rounded-full shrink-0"
          style={{
            width: size === 'full' ? 6 : 4,
            height: size === 'full' ? 6 : 4,
            background: palette?.[1] ?? 'rgba(255,255,255,0.4)',
            opacity: isEngaged ? 0 : size === 'full' ? 0.45 : 0.5,
            animation: isEngaged ? 'none' : 'pulse 2s ease-in-out infinite',
          }}
        />
        <span
          className="font-mono uppercase text-white/20"
          style={{
            fontSize: size === 'full' ? 9 : 8,
            letterSpacing: '0.2em',
          }}
        >
          {statusLabel}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {actions}
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white/80 transition-colors p-1 -mr-1 focus:outline-none"
        >
          <X size={size === 'full' ? 12 : 14} />
        </button>
      </div>
    </div>
  );
}
