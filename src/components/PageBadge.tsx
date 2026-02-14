import { motion } from "framer-motion";

interface PageBadgeProps {
  label: string;
  subtitle: string;
}

export function PageBadge({ label, subtitle }: PageBadgeProps) {
  return (
    <div className="text-center">
      <motion.div
        className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
      >
        {subtitle}
      </motion.div>
    </div>
  );
}