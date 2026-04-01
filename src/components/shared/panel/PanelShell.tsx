import { AnimatePresence, motion } from 'framer-motion';

interface PanelShellProps {
  isOpen: boolean;
  /**
   * "embedded" — absolute, fills positioned ancestor (InStudio card default)
   * "fullscreen" — fixed, bottom-anchored, 88vh (ShareableLyricDance)
   */
  variant?: 'embedded' | 'fullscreen' | 'reels';
  /** Pixels to extend upward beyond the positioned ancestor — covers the card
   *  profile header in embedded mode. Outer overflow:hidden clips cleanly. */
  topOffset?: number;
  /** Maximum height as CSS value. Panel content scrolls within this constraint. */
  maxHeight?: string;
  /** Bottom offset in px for fixed fullscreen variant. */
  bottomOffset?: number;
  children: React.ReactNode;
}

export function PanelShell({ isOpen, variant = 'embedded', topOffset = 0, maxHeight, bottomOffset = 0, children }: PanelShellProps) {
  const positionClass =
    variant === 'fullscreen'
      ? 'fixed left-0 right-0 z-[70] h-[88vh]'
      : variant === 'reels'
        ? 'absolute inset-x-0 bottom-0 z-[500]'
        : 'absolute inset-x-0 z-[400]';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          className={`${positionClass} flex flex-col overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: variant === 'embedded' ? 'rgba(10,10,10,0.97)' : '#0d0d0d',
            backdropFilter: variant === 'embedded' ? 'blur(12px)' : undefined,
            borderTop: variant !== 'embedded' ? '1px solid rgba(255,255,255,0.06)' : undefined,
            top: variant === 'reels' ? 44 : variant === 'embedded' ? 0 : undefined,
            bottom: variant === 'fullscreen' || variant === 'embedded' ? bottomOffset : undefined,
            maxHeight: maxHeight ?? undefined,
            height: maxHeight ?? undefined,
          }}
        >
          {variant === 'embedded' && topOffset > 0 && (
            <div style={{ height: topOffset, flexShrink: 0 }} />
          )}
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
