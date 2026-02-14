import { motion } from "framer-motion";

interface PageBadgeProps {
  label: string;
  subtitle: string;
}

export function PageBadge({ label, subtitle }: PageBadgeProps) {
  return (
    <div className="text-center space-y-1">
      <motion.div
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
      >
        <span>{label}</span>
        <span className="text-primary/60">—</span>
        <span className="text-primary/80 font-normal">{subtitle}</span>
      </motion.div>
    </div>
  );
}