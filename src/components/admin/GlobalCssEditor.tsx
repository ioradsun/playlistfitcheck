import { useState } from "react";
import { Download, Upload, Copy, Check, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { motion } from "framer-motion";

// The canonical global CSS design system — mirrors src/index.css tokens exactly
const GLOBAL_CSS = `/* ═══════════════════════════════════════════════
   toolsFM — Global Design System
   Two-Font Protocol: Geist Sans (editorial) + Geist Mono (technical)
   Semantic token system — all colors HSL
═══════════════════════════════════════════════ */

/* ── LIGHT THEME ─────────────────────────── */
:root {
  /* Surfaces */
  --background:          0 0% 98%;
  --foreground:          240 10% 10%;
  --card:                0 0% 100%;
  --card-foreground:     240 10% 10%;
  --popover:             0 0% 100%;
  --popover-foreground:  240 10% 10%;

  /* Primary — Neon Green */
  --primary:             152 70% 38%;
  --primary-foreground:  0 0% 100%;

  /* Secondary */
  --secondary:           240 5% 92%;
  --secondary-foreground: 240 10% 20%;

  /* Muted */
  --muted:               240 5% 94%;
  --muted-foreground:    215 10% 45%;

  /* Accent */
  --accent:              152 40% 92%;
  --accent-foreground:   152 60% 25%;

  /* Destructive */
  --destructive:         0 72% 51%;
  --destructive-foreground: 0 0% 100%;

  /* Borders & Inputs */
  --border:              240 6% 88%;
  --input:               240 6% 88%;
  --ring:                152 70% 38%;

  /* Radius */
  --radius:              0.75rem;

  /* Glows & Glass */
  --glow-primary:        0 0 20px hsl(152 70% 38% / 0.15);
  --glow-strong:         0 0 40px hsl(152 70% 38% / 0.2);
  --surface-glass:       hsl(0 0% 100% / 0.7);

  /* Score System */
  --score-excellent:     152 70% 38%;
  --score-strong:        152 55% 45%;
  --score-ok:            45 90% 45%;
  --score-weak:          25 90% 45%;
  --score-bad:           0 72% 51%;

  /* Sidebar */
  --sidebar-background:            0 0% 97%;
  --sidebar-foreground:            240 10% 20%;
  --sidebar-primary:               152 70% 38%;
  --sidebar-primary-foreground:    0 0% 100%;
  --sidebar-accent:                240 5% 92%;
  --sidebar-accent-foreground:     240 10% 20%;
  --sidebar-border:                240 6% 88%;
  --sidebar-ring:                  152 70% 38%;
}

/* ── DARK THEME ──────────────────────────── */
.dark {
  /* Surfaces */
  --background:          240 15% 4%;
  --foreground:          210 20% 92%;
  --card:                240 12% 8%;
  --card-foreground:     210 20% 92%;
  --popover:             240 12% 8%;
  --popover-foreground:  210 20% 92%;

  /* Primary — Neon Green (brighter in dark) */
  --primary:             152 70% 45%;
  --primary-foreground:  240 15% 4%;

  /* Secondary */
  --secondary:           240 10% 14%;
  --secondary-foreground: 210 20% 85%;

  /* Muted */
  --muted:               240 8% 12%;
  --muted-foreground:    215 15% 55%;

  /* Accent */
  --accent:              152 50% 30%;
  --accent-foreground:   152 70% 85%;

  /* Destructive */
  --destructive:         0 72% 51%;
  --destructive-foreground: 210 20% 98%;

  /* Borders & Inputs */
  --border:              240 10% 16%;
  --input:               240 10% 16%;
  --ring:                152 70% 45%;

  /* Glows & Glass */
  --glow-primary:        0 0 20px hsl(152 70% 45% / 0.3);
  --glow-strong:         0 0 40px hsl(152 70% 45% / 0.4);
  --surface-glass:       hsl(240 12% 8% / 0.6);

  /* Score System */
  --score-excellent:     152 70% 45%;
  --score-strong:        152 55% 55%;
  --score-ok:            45 90% 55%;
  --score-weak:          25 90% 55%;
  --score-bad:           0 72% 51%;

  /* Sidebar */
  --sidebar-background:            240 12% 6%;
  --sidebar-foreground:            210 20% 85%;
  --sidebar-primary:               152 70% 45%;
  --sidebar-primary-foreground:    240 15% 4%;
  --sidebar-accent:                240 10% 14%;
  --sidebar-accent-foreground:     210 20% 85%;
  --sidebar-border:                240 10% 16%;
  --sidebar-ring:                  152 70% 45%;
}

/* ══════════════════════════════════════════
   TYPOGRAPHY SCALE — Two-Font Protocol
══════════════════════════════════════════ */

/* H1: Page Titles */
h1 {
  font-family: 'Geist', system-ui, sans-serif;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

/* H2: Section Titles */
h2 {
  font-family: 'Geist', system-ui, sans-serif;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

/* Body */
body {
  font-family: 'Geist', system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.6;
}

/* ── Named Type Utilities ─────────────────── */

/* .type-nav — Navigation / Action labels */
/* font-size: 11px | weight: 700 | tracking: 0.15em | uppercase */

/* .type-title — Page titles */
/* font-size: 24px | weight: 700 | tracking: -0.02em */

/* .type-section — Section titles */
/* font-size: 18px | weight: 600 | tracking: -0.02em */

/* .type-body — Body / editorial */
/* font-size: 14px | weight: 400 | line-height: 1.6 */

/* .type-mono — Technical / machine data */
/* font-family: Geist Mono | font-size: 10px | weight: 500 | tracking: 0.05em */

/* .type-mono-sm — Micro labels */
/* font-family: Geist Mono | font-size: 9px | weight: 500 | tracking: 0.08em */

/* ══════════════════════════════════════════
   COMPONENT PATTERNS (CrowdFit / DreamFit)
══════════════════════════════════════════ */

/* Hairline divider */
/* border-top-width: 0.5px; border-color: hsl(var(--border) / 0.3) */

/* Status label (mono readout) */
/* font-mono | text-[11px] | uppercase | tracking-widest | text-muted-foreground */

/* Summary text */
/* font-sans | text-[13px] | leading-relaxed | text-muted-foreground/50 */

/* Action button — Primary (BROADCAST) */
/* bg-foreground | text-background | text-[13px] | font-bold | uppercase | tracking-[0.15em] */

/* Action button — Ghost */
/* hover:bg-foreground/[0.03] | hover:border-foreground/15 */

/* Signal / count badge */
/* font-mono | text-[11px] | tracking-widest */

/* "Turn Off Signal" micro link */
/* font-mono | text-[10px] | text-muted-foreground/50 | hover:text-destructive */

/* Score ring glow */
/* filter: drop-shadow(var(--glow-primary)) */

/* Glass card surface */
/* background: var(--surface-glass) | backdrop-filter: blur(12px) | border: 1px solid hsl(var(--border)) */`;

const TOKEN_GROUPS = [
  {
    label: "Surfaces",
    tokens: [
      { name: "--background", light: "0 0% 98%", dark: "240 15% 4%", desc: "Page background" },
      { name: "--foreground", light: "240 10% 10%", dark: "210 20% 92%", desc: "Primary text" },
      { name: "--card", light: "0 0% 100%", dark: "240 12% 8%", desc: "Card surfaces" },
      { name: "--popover", light: "0 0% 100%", dark: "240 12% 8%", desc: "Popover surfaces" },
    ],
  },
  {
    label: "Primary — Neon Green",
    tokens: [
      { name: "--primary", light: "152 70% 38%", dark: "152 70% 45%", desc: "Brand green" },
      { name: "--primary-foreground", light: "0 0% 100%", dark: "240 15% 4%", desc: "Text on primary" },
      { name: "--ring", light: "152 70% 38%", dark: "152 70% 45%", desc: "Focus ring" },
    ],
  },
  {
    label: "Secondary & Muted",
    tokens: [
      { name: "--secondary", light: "240 5% 92%", dark: "240 10% 14%", desc: "Subtle fills" },
      { name: "--muted", light: "240 5% 94%", dark: "240 8% 12%", desc: "Muted fills" },
      { name: "--muted-foreground", light: "215 10% 45%", dark: "215 15% 55%", desc: "Subdued text" },
      { name: "--accent", light: "152 40% 92%", dark: "152 50% 30%", desc: "Accent fill" },
      { name: "--accent-foreground", light: "152 60% 25%", dark: "152 70% 85%", desc: "Text on accent" },
    ],
  },
  {
    label: "Borders & Inputs",
    tokens: [
      { name: "--border", light: "240 6% 88%", dark: "240 10% 16%", desc: "Hairline borders" },
      { name: "--input", light: "240 6% 88%", dark: "240 10% 16%", desc: "Input borders" },
    ],
  },
  {
    label: "Destructive",
    tokens: [
      { name: "--destructive", light: "0 72% 51%", dark: "0 72% 51%", desc: "Error / delete" },
    ],
  },
  {
    label: "Score System",
    tokens: [
      { name: "--score-excellent", light: "152 70% 38%", dark: "152 70% 45%", desc: "90–100" },
      { name: "--score-strong", light: "152 55% 45%", dark: "152 55% 55%", desc: "75–89" },
      { name: "--score-ok", light: "45 90% 45%", dark: "45 90% 55%", desc: "55–74" },
      { name: "--score-weak", light: "25 90% 45%", dark: "25 90% 55%", desc: "35–54" },
      { name: "--score-bad", light: "0 72% 51%", dark: "0 72% 51%", desc: "0–34" },
    ],
  },
];

const TYPE_SCALE = [
  { cls: "type-title", sample: "Page Title", desc: "24px / 700 / -0.02em" },
  { cls: "type-section", sample: "Section Title", desc: "18px / 600 / -0.02em" },
  { cls: "type-body", sample: "Body editorial text for feed cards and descriptions.", desc: "14px / 400 / 1.6lh" },
  { cls: "type-nav", sample: "NAV LABEL", desc: "11px / 700 / 0.15em / UPPER" },
  { cls: "type-mono", sample: "STATUS: RESOLVING…", desc: "10px Geist Mono / 0.05em" },
  { cls: "type-mono-sm", sample: "MICRO LABEL", desc: "9px Geist Mono / 0.08em" },
];

function ColorSwatch({ hsl, label }: { hsl: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-5 w-5 rounded-sm border flex-shrink-0"
        style={{ background: `hsl(${hsl})`, borderColor: "hsl(var(--border))" }}
      />
      <span className="font-mono text-[10px] text-muted-foreground">{hsl}</span>
    </div>
  );
}

export function GlobalCssEditor() {
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [copied, setCopied] = useState(false);

  const handleExport = () => {
    const blob = new Blob([GLOBAL_CSS], { type: "text/css" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `toolsfm-design-system-${new Date().toISOString().slice(0, 10)}.css`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSS exported");
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(GLOBAL_CSS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("CSS copied to clipboard");
  };

  const handleImport = () => {
    if (!importText.trim()) { toast.error("Paste CSS first"); return; }
    // For now just confirms — a full runtime injection would require a DB column
    toast.info("Import noted — update src/index.css manually to apply.");
    setShowImport(false);
    setImportText("");
  };

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}>
          <Download size={13} /> Export CSS
        </Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={handleCopy}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied!" : "Copy CSS"}
        </Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowImport((v) => !v)}>
          <Upload size={13} /> Import
        </Button>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">
          Two-Font Protocol · HSL Token System
        </span>
      </div>

      {/* Import panel */}
      {showImport && (
        <motion.div
          className="glass-card rounded-xl p-4 space-y-2"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
        >
          <p className="text-xs text-muted-foreground">
            Paste CSS below. Apply will preview here — manually copy to <code className="font-mono text-[11px] bg-muted px-1 rounded">src/index.css</code> to persist.
          </p>
          <Textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder=":root { --primary: 152 70% 38%; ... }"
            className="text-xs font-mono min-h-[120px]"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setShowImport(false); setImportText(""); }}>Cancel</Button>
            <Button size="sm" onClick={handleImport}>Apply</Button>
          </div>
        </motion.div>
      )}

      {/* Raw CSS viewer */}
      <motion.div className="glass-card rounded-xl overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Palette size={14} className="text-primary" />
          <span className="text-sm font-mono font-medium">Raw CSS — Full Token System</span>
        </div>
        <div className="relative">
          <pre className="text-[11px] font-mono text-muted-foreground leading-relaxed p-4 overflow-x-auto max-h-[340px] overflow-y-auto whitespace-pre">
            {GLOBAL_CSS}
          </pre>
        </div>
      </motion.div>

      {/* Token reference — Color swatches */}
      <motion.div className="glass-card rounded-xl overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Palette size={14} className="text-primary" />
          <span className="text-sm font-mono font-medium">Color Tokens — Light / Dark</span>
        </div>
        <div className="divide-y divide-border">
          {TOKEN_GROUPS.map((group) => (
            <div key={group.label} className="px-4 py-3 space-y-2">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{group.label}</p>
              <div className="space-y-1.5">
                {group.tokens.map((t) => (
                  <div key={t.name} className="grid grid-cols-[160px_1fr_1fr] gap-3 items-center text-[11px]">
                    <span className="font-mono text-foreground/80 truncate">{t.name}</span>
                    <ColorSwatch hsl={t.light} label="light" />
                    <ColorSwatch hsl={t.dark} label="dark" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Typography scale */}
      <motion.div className="glass-card rounded-xl overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Palette size={14} className="text-primary" />
          <span className="text-sm font-mono font-medium">Typography Scale</span>
        </div>
        <div className="divide-y divide-border">
          {TYPE_SCALE.map((t) => (
            <div key={t.cls} className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className={t.cls}>{t.sample}</p>
              </div>
              <div className="flex-shrink-0 text-right space-y-0.5">
                <p className="font-mono text-[10px] text-primary">.{t.cls}</p>
                <p className="font-mono text-[9px] text-muted-foreground">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Component patterns quick reference */}
      <motion.div className="glass-card rounded-xl overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Palette size={14} className="text-primary" />
          <span className="text-sm font-mono font-medium">Component Patterns (CrowdFit / DreamFit)</span>
        </div>
        <div className="divide-y divide-border text-[11px] font-mono">
          {[
            { label: "Hairline divider", value: "border-t-[0.5px] border-border/30" },
            { label: "Status label", value: "text-[11px] uppercase tracking-widest text-muted-foreground" },
            { label: "Summary text", value: "text-[13px] leading-relaxed text-muted-foreground/50" },
            { label: "BROADCAST button", value: "bg-foreground text-background text-[13px] font-bold uppercase tracking-[0.15em]" },
            { label: "Ghost button hover", value: "hover:bg-foreground/[0.03] hover:border-foreground/15" },
            { label: "Signal count", value: "font-mono text-[11px] tracking-widest" },
            { label: "Turn Off micro link", value: "font-mono text-[10px] text-muted-foreground/50 hover:text-destructive" },
            { label: "Glass card", value: ".glass-card → var(--surface-glass) + blur(12px)" },
            { label: "Score ring glow", value: ".score-ring → drop-shadow(var(--glow-primary))" },
            { label: "Avatar size (feeds)", value: "h-10 w-10" },
          ].map((p) => (
            <div key={p.label} className="px-4 py-2.5 flex items-start gap-4">
              <span className="text-muted-foreground w-40 flex-shrink-0">{p.label}</span>
              <span className="text-foreground/70 break-all">{p.value}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
