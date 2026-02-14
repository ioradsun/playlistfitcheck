interface PageBadgeProps {
  label: string;
  subtitle: string;
}

export function PageBadge({ label, subtitle }: PageBadgeProps) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
        {subtitle}
      </div>
    </div>
  );
}
