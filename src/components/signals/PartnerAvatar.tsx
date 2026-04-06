interface Props {
  name: string;
  avatarUrl: string | null;
  size?: number;
}

export function PartnerAvatar({ name, avatarUrl, size = 36 }: Props) {
  return (
    <div
      className="rounded-full overflow-hidden bg-muted shrink-0 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="w-full h-full object-cover"
        />
      ) : (
        <span
          className="text-muted-foreground/60"
          style={{ fontSize: Math.round(size * 0.36) }}
        >
          {(name?.[0] ?? "?").toUpperCase()}
        </span>
      )}
    </div>
  );
}
