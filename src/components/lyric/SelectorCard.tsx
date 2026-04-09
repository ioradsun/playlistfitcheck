import type { ReactNode } from "react";

interface SelectorCardProps {
  label: string;
  tag: string;
  mainText: string;
  subTexts: string[];
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function SelectorCard({
  label,
  tag,
  mainText,
  subTexts,
  isOpen,
  onToggle,
  children,
}: SelectorCardProps) {
  return (
    <div data-selector-card="true" style={{ margin: "0 16px", position: "relative" }}>
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.2)",
          fontFamily: '"SF Mono", monospace',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.02)",
          padding: "9px 12px",
          cursor: "pointer",
          textAlign: "left",
          color: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 9, fontFamily: '"SF Mono", monospace', color: "#44d27e" }}>{tag}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            style={{
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 160ms ease",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 13,
            color: "rgba(255,255,255,0.8)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {mainText}
        </div>
        <div
          style={{
            marginTop: 5,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            fontSize: 9,
            color: "rgba(255,255,255,0.18)",
            fontFamily: '"SF Mono", monospace',
          }}
        >
          {subTexts.map((text) => (
            <span key={text}>{text}</span>
          ))}
        </div>
      </button>
      {isOpen && (
        <div
          style={{
            background: "#111113",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            maxHeight: "min(280px, 50vh)",
            marginTop: 8,
            overflowY: "auto",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export type { SelectorCardProps };
