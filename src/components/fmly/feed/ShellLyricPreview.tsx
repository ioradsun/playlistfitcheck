interface Props {
  firstLine?: string | null;
}

export function ShellLyricPreview({ firstLine }: Props) {
  const hasText = !!firstLine?.trim();

  return (
    <div className="absolute inset-0 z-[2] flex items-center justify-center px-8 pointer-events-none">
      {hasText ? (
        <div
          className="text-center text-white/90 transition-opacity duration-200"
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
      ) : (
        <div className="flex flex-col items-center gap-2.5 w-full max-w-[260px]">
          <div
            className="h-5 w-full rounded-full animate-skeleton-shimmer"
            style={{
              background:
                "linear-gradient(110deg, rgba(255,255,255,0.04) 20%, rgba(255,255,255,0.09) 40%, rgba(255,255,255,0.04) 60%)",
              backgroundSize: "200% 100%",
            }}
          />
          <div
            className="h-5 w-3/5 rounded-full animate-skeleton-shimmer"
            style={{
              background:
                "linear-gradient(110deg, rgba(255,255,255,0.04) 20%, rgba(255,255,255,0.09) 40%, rgba(255,255,255,0.04) 60%)",
              backgroundSize: "200% 100%",
            }}
          />
        </div>
      )}
    </div>
  );
}
