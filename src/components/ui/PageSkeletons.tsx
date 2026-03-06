import { forwardRef, type HTMLAttributes } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Variant = "new" | "existing";

const S = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <Skeleton ref={ref} className={cn("animate-none", className)} {...props} />
  )
);
S.displayName = "S";

const PostCardSkeleton = () => (
  <div className="border-b border-border/40">
    <div className="px-3 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <S className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <S className="h-3.5 w-28" />
          <S className="h-2.5 w-16" />
        </div>
      </div>
      <S className="h-6 w-6 rounded-full" />
    </div>
    <S className="h-[310px] w-full rounded-none bg-muted/40" />
    <div className="px-1 py-1 flex items-center gap-1">
      <S className="h-8 w-8 rounded-full" />
      <S className="h-8 w-8 rounded-full" />
      <S className="h-8 w-8 rounded-full" />
      <S className="h-8 w-8 rounded-full" />
      <div className="flex-1" />
      <S className="h-8 w-8 rounded-full" />
    </div>
    <div className="px-3 pb-3 space-y-2">
      <S className="h-3.5 w-4/5" />
      <S className="h-3.5 w-3/5" />
    </div>
  </div>
);

export const CrowdFitSkeleton = ({ variant }: { variant: Variant }) => (
  <div className="w-full max-w-2xl mx-auto space-y-4">
    <div className="border-b border-border/40 flex">
      <div className="flex-1 flex items-center justify-center py-3">
        <S className="h-4 w-16 rounded-full" />
      </div>
      <div className="flex-1 flex items-center justify-center py-3">
        <S className="h-4 w-16 rounded-full" />
      </div>
    </div>

    <div className="mx-3 my-3 rounded-2xl border border-border/50 bg-muted/10 p-4 flex items-center gap-3">
      <S className="h-9 w-9 rounded-full" />
      <S className="h-9 flex-1 rounded-xl" />
      <S className="h-9 w-20 rounded-xl" />
    </div>

    <div>
      {Array.from({ length: variant === "existing" ? 5 : 3 }).map((_, index) => (
        <PostCardSkeleton key={index} />
      ))}
    </div>
  </div>
);

export const LyricFitSkeleton = ({ variant }: { variant: Variant }) => {
  if (variant === "new") {
    return (
      <div className="flex-1 flex flex-col px-4 py-4 min-h-0">
        <div className="self-start flex items-center gap-2">
          <S className="h-8 w-20 rounded-full" />
          <S className="h-8 w-20 rounded-full" />
        </div>

        <div className="glass-card rounded-xl p-6 flex flex-col items-center gap-4 border-2 border-dashed border-border/50">
          <S className="h-12 w-12 rounded-xl" />
          <S className="h-5 w-48 rounded" />
          <S className="h-3.5 w-36 rounded" />
          <div className="flex items-center gap-2">
            <S className="h-6 w-14 rounded-full" />
            <S className="h-6 w-14 rounded-full" />
          </div>
        </div>

        <S className="h-10 w-full rounded-lg mt-4" />
      </div>
    );
  }

  const lyricWidths = ["65%", "80%", "55%", "75%", "90%", "60%", "70%", "85%", "50%", "78%", "63%", "88%", "45%", "72%"];

  return (
    <div className="flex-1 flex flex-col px-4 py-4 min-h-0">
      <div className="self-start flex items-center gap-2">
        <S className="h-8 w-20 rounded-full" />
        <S className="h-8 w-20 rounded-full" />
      </div>

      <div className="flex items-center gap-3">
        <S className="h-7 w-7 rounded-md" />
        <S className="h-5 w-48 rounded" />
        <div className="ml-auto flex gap-2">
          <S className="h-7 w-16 rounded-md" />
          <S className="h-7 w-7 rounded-md" />
        </div>
      </div>

      <S className="h-14 w-full rounded-lg bg-muted/40" />

      <div className="flex-1 space-y-2.5 overflow-hidden">
        {lyricWidths.map((width, index) => (
          <S key={index} className="h-5 rounded bg-muted/30" style={{ width }} />
        ))}
      </div>
    </div>
  );
};

const UploadZoneSkeleton = ({ showBadge = false }: { showBadge?: boolean }) => (
  <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-3">
    <div className="flex items-center gap-2">
      <S className="h-4 w-20 rounded" />
      {showBadge && <S className="h-4 w-14 rounded" />}
    </div>
    <div className="rounded-lg border-2 border-dashed border-border/50 bg-muted/10 flex flex-col items-center justify-center gap-2 py-6">
      <S className="h-8 w-8 rounded-lg" />
      <S className="h-3 w-36 rounded" />
      <S className="h-3 w-24 rounded" />
    </div>
  </div>
);

export const HitFitSkeleton = ({ variant }: { variant: Variant }) => {
  if (variant === "new") {
    return (
      <div className="w-full max-w-2xl mx-auto space-y-4">
        <div className="space-y-2">
          <S className="h-6 w-72 rounded mx-auto" />
          <S className="h-4 w-52 rounded mx-auto" />
        </div>

        <UploadZoneSkeleton />
        <UploadZoneSkeleton showBadge />

        <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-3">
          <div className="flex gap-2">
            <S className="h-7 w-20 rounded-md" />
            <S className="h-7 w-20 rounded-md" />
            <S className="h-7 w-20 rounded-md" />
          </div>
          <div className="rounded-lg border-2 border-dashed border-border/50 bg-muted/10 flex flex-col items-center justify-center gap-2 py-6">
            <S className="h-8 w-8 rounded-lg" />
            <S className="h-3 w-36 rounded" />
            <S className="h-3 w-24 rounded" />
          </div>
        </div>

        <S className="h-10 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      <div className="space-y-2">
        <S className="h-5 w-64 rounded" />
        <S className="h-4 w-44 rounded" />
      </div>

      <div className="flex gap-4">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="flex flex-col items-center gap-2">
            <S className="h-16 w-16 rounded-full" />
            <S className="h-4 w-24 rounded" />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <S className="h-3.5 w-28 rounded" />
            <S className="h-2 flex-1 rounded-full bg-muted/50" />
            <S className="h-3.5 w-8 rounded" />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <S className="h-4 w-36 rounded" />
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-muted/10 p-4 space-y-2">
            <div className="flex items-center gap-3">
              <S className="h-8 w-8 rounded-lg" />
              <S className="h-4 w-40 rounded" />
            </div>
            <S className="h-3.5 w-4/5 rounded" />
            <S className="h-3.5 w-3/5 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
};

export const PlaylistFitSkeleton = ({ variant }: { variant: Variant }) => {
  if (variant === "new") {
    return (
      <div className="w-full max-w-2xl mx-auto space-y-4">
        <div className="space-y-2">
          <S className="h-6 w-80 rounded mx-auto" />
          <S className="h-4 w-56 rounded mx-auto" />
        </div>

        <div className="rounded-xl p-4 space-y-3 border border-border glass-card">
          <div className="relative">
            <S className="h-11 w-full rounded-xl bg-muted/30" />
            <S className="h-4 w-4 rounded absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
          <S className="h-px w-full bg-border rounded-none" />
          <div className="relative">
            <S className="h-11 w-full rounded-xl bg-muted/30" />
            <S className="h-4 w-4 rounded absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        <S className="h-11 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      <S className="h-3.5 w-48 rounded" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col items-center gap-4 py-4">
          <S className="h-32 w-32 rounded-full" />
          <S className="h-6 w-24 rounded-sm" />
        </div>

        <div className="space-y-3 py-4">
          <S className="h-3 w-28 rounded" />
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <S className="h-3.5 w-32 rounded" />
              <S className="h-2 flex-1 rounded-full" />
              <S className="h-3.5 w-8 rounded" />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <S className="h-4 w-44 rounded" />
        <S className="h-3.5 w-5/6 rounded" />
        <S className="h-3.5 w-3/4 rounded" />
        <S className="h-3.5 w-4/5 rounded" />
        <S className="h-3.5 w-2/3 rounded" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-muted/10 p-4 space-y-2">
            <S className="h-4 w-40 rounded" />
            <S className="h-3.5 w-5/6 rounded" />
            <S className="h-3.5 w-2/3 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
};

const MixCardSkeleton = () => (
  <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-3">
    <S className="h-8 w-full rounded-lg bg-muted/30" />
    <S className="h-14 w-full rounded bg-muted/40" />
    <div className="flex items-center gap-2">
      <S className="h-7 w-20 rounded" />
      <S className="h-7 w-7 rounded-full" />
      <S className="h-7 w-7 rounded-full" />
    </div>
    <S className="h-8 w-full rounded-lg bg-muted/30" />
  </div>
);

export const MixFitSkeleton = ({ variant }: { variant: Variant }) => {
  if (variant === "new") {
    return (
      <div className="w-full max-w-2xl mx-auto space-y-4 text-center">
        <div className="space-y-2">
          <S className="h-5 w-72 rounded mx-auto" />
          <S className="h-4 w-48 rounded mx-auto" />
        </div>

        <div className="rounded-xl p-4 space-y-3 border border-border glass-card">
          <S className="h-11 w-full rounded-lg bg-muted/30" />
          <S className="h-px w-full bg-border rounded-none" />
          <S className="h-20 w-full rounded-lg bg-muted/30" />
          <S className="h-px w-full bg-border rounded-none" />
          <S className="h-4 w-36 rounded" />
          <div className="rounded-lg border-2 border-dashed border-border/50 p-8 flex flex-col items-center gap-3">
            <S className="h-10 w-10 rounded-xl" />
            <S className="h-3.5 w-40 rounded" />
            <S className="h-3 w-28 rounded" />
          </div>
        </div>

        <S className="h-11 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto py-6 px-4 space-y-5">
      <div className="space-y-2">
        <S className="h-6 w-48 rounded" />
        <S className="h-3.5 w-64 rounded" />
      </div>

      <div className="glass-card rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <S className="h-4 w-20 rounded" />
          <S className="h-4 w-16 rounded" />
        </div>
        <S className="h-16 w-full rounded bg-muted/40" />
      </div>

      <div className="flex items-center gap-3">
        <S className="h-8 w-8 rounded-full" />
        <S className="h-8 w-24 rounded" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <MixCardSkeleton key={index} />
        ))}
      </div>

      <div className="glass-card rounded-xl p-4 space-y-2">
        <S className="h-3 w-16 rounded" />
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 py-2 border-t border-border/50">
            <S className="h-3 w-6 rounded" />
            <S className="h-3.5 flex-1 rounded" />
            <S className="h-3 w-24 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
};

const DreamCardSkeleton = () => (
  <div className="rounded-xl border border-border bg-muted/10 mx-4 my-3 p-4 space-y-3">
    <div className="flex items-center gap-3">
      <S className="h-9 w-9 rounded-full" />
      <div className="space-y-2">
        <S className="h-3.5 w-28 rounded" />
        <S className="h-2.5 w-16 rounded" />
      </div>
      <S className="h-5 w-14 rounded-full ml-auto" />
    </div>
    <S className="h-5 w-3/4 rounded" />
    <S className="h-3.5 w-full rounded" />
    <S className="h-3.5 w-5/6 rounded" />
    <div className="flex items-center gap-3">
      <S className="h-7 w-16 rounded-full" />
      <S className="h-7 w-16 rounded-full" />
      <S className="h-7 w-16 rounded-full" />
    </div>
  </div>
);

export const DreamFitSkeleton = ({ variant: _variant }: { variant: Variant }) => (
  <div className="w-full max-w-[470px] mx-auto">
    <div className="border-b border-border/40 px-4 pt-3 pb-3 flex gap-3">
      <S className="h-10 w-10 rounded-full" />
      <S className="h-10 flex-1 rounded-xl bg-muted/30" />
    </div>

    <div className="border-b border-border/40 flex">
      <div className="flex-1 flex items-center justify-center py-3">
        <S className="h-4 w-14 rounded" />
      </div>
      <div className="flex-1 flex items-center justify-center py-3">
        <S className="h-4 w-14 rounded" />
      </div>
    </div>

    {Array.from({ length: 4 }).map((_, index) => (
      <DreamCardSkeleton key={index} />
    ))}
  </div>
);
