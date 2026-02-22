interface PaletteEditorProps {
  palette: [string, string, string];
  onChange: (palette: [string, string, string]) => void;
}

export function PaletteEditor({ palette, onChange }: PaletteEditorProps) {
  return (
    <div className="space-y-3 rounded-lg border border-border/50 bg-background/40 p-3">
      <div className="grid grid-cols-3 gap-2">
        {(["Shadow", "Midtone", "Highlight"] as const).map((label, i) => (
          <div key={label} className="space-y-1 rounded-md border border-border/40 p-2">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              {label}
            </label>
            <input
              className="h-8 w-full cursor-pointer rounded border border-border/50 bg-transparent"
              type="color"
              value={palette[i]}
              onChange={(e) => {
                const next = [...palette] as [string, string, string];
                next[i] = e.target.value;
                onChange(next);
              }}
            />
            <span className="block text-[10px] font-mono text-foreground/80">{palette[i]}</span>
          </div>
        ))}
      </div>

      <div
        className="h-3 w-full rounded-full border border-border/40"
        style={{
          background: `linear-gradient(to right, ${palette[0]}, ${palette[1]}, ${palette[2]})`,
        }}
      />
    </div>
  );
}
