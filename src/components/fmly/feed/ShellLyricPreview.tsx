interface ShellLyricPreviewProps {
  firstLine?: string | null;
}

export function ShellLyricPreview({ firstLine }: ShellLyricPreviewProps) {
  if (!firstLine?.trim()) return null;

  return (
    <div className="absolute inset-0 z-[2] flex items-center justify-center px-8 pointer-events-none">
      <div
        className="text-center text-white/90"
        style={{
          fontFamily: '"Montserrat", sans-serif',
          fontWeight: 700,
          fontSize: "clamp(18px, 3vw, 32px)",
          lineHeight: 1.25,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {firstLine}
      </div>
    </div>
  );
}
