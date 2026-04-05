interface Props {
  name: string;
  avatarUrl: string | null;
  size?: number;
}

export function PartnerAvatar({ name, avatarUrl, size = 36 }: Props) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        background: "rgba(255,255,255,0.08)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span
          style={{
            fontSize: Math.round(size * 0.36),
            color: "rgba(255,255,255,0.4)",
          }}
        >
          {(name?.[0] ?? "?").toUpperCase()}
        </span>
      )}
    </div>
  );
}
