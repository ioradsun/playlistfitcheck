import { AnimatePresence, motion } from 'framer-motion';

interface PanelShellProps {
  isOpen: boolean;
  /**
   * "embedded" — absolute, fills positioned ancestor (InStudio card default)
   * "fullscreen" — fixed, bottom-anchored, 88vh (ShareableLyricDance)
   */
  variant?: 'embedded' | 'fullscreen';
  children: React.ReactNode;
}

export function PanelShell({ isOpen, variant = 'embedded', children }: PanelShellProps) {
  const positionClass = variant === 'fullscreen'
    ? 'fixed bottom-0 left-0 right-0 z-[70] h-[88vh]'
    : 'absolute inset-x-0 top-0 bottom-0 z-[200]';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          className={`${positionClass} flex flex-col overflow-hidden`}
          style={{
            background: variant === 'fullscreen' ? '#0d0d0d' : 'rgba(10,10,10,0.97)',
            backdropFilter: variant === 'embedded' ? 'blur(12px)' : undefined,
            borderTop: variant === 'fullscreen' ? '1px solid rgba(255,255,255,0.06)' : undefined,
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
