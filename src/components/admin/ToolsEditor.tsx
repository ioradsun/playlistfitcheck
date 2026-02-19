import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Coins, Rocket, Wrench, GripVertical, Target } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Reorder, useDragControls } from "framer-motion";

const ALL_TOOLS = [
  { key: "songfit",  label: "CrowdFit" },
  { key: "hitfit",   label: "HitFit" },
  { key: "vibefit",  label: "VibeFit" },
  { key: "profit",   label: "ProFit" },
  { key: "playlist", label: "PlaylistFit" },
  { key: "mix",      label: "MixFit" },
  { key: "lyric",    label: "LyricFit" },
  { key: "dreamfit", label: "DreamFit" },
];

const DEFAULT_ORDER = ALL_TOOLS.map(t => t.key);

interface FeaturesState {
  crypto_tipping: boolean;
  growth_flow: boolean;
  growth_quotas: { guest: number; limited: number };
  tools_enabled: Record<string, boolean>;
  tools_order: string[];
  crowdfit_mode: "reactions" | "hook_review";
}

const DEFAULT_FEATURES: FeaturesState = {
  crypto_tipping: false,
  growth_flow: false,
  growth_quotas: { guest: 5, limited: 10 },
  tools_enabled: Object.fromEntries(ALL_TOOLS.map(t => [t.key, true])),
  tools_order: DEFAULT_ORDER,
  crowdfit_mode: "reactions",
};

async function patchFeatures(patch: Partial<FeaturesState>) {
  const { data: existing } = await supabase.from("site_copy").select("id, copy_json").limit(1).single();
  if (!existing) throw new Error("No site_copy row found");
  const prev = (existing.copy_json as any) || {};
  const updated = {
    ...prev,
    features: { ...(prev.features || {}), ...patch },
  };
  await supabase.functions.invoke("admin-dashboard", { body: { action: "update_site_copy", copy_json: updated } });
  window.dispatchEvent(new CustomEvent("site-copy-updated"));
}

// Individual draggable tool row
function ToolRow({
  tool,
  enabled,
  saving,
  onToggle,
}: {
  tool: { key: string; label: string };
  enabled: boolean;
  saving: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={tool.key}
      dragListener={false}
      dragControls={controls}
      className="px-4 py-3 flex items-center justify-between bg-background border-b border-border last:border-0 select-none"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground transition-colors shrink-0"
          onPointerDown={(e) => controls.start(e)}
        >
          <GripVertical size={15} />
        </button>
        <div className="min-w-0">
          <p className="text-sm font-medium">{tool.label}</p>
          <p className="text-xs text-muted-foreground font-mono">{tool.key}</p>
        </div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        disabled={saving}
      />
    </Reorder.Item>
  );
}

export function ToolsEditor() {
  const [features, setFeatures] = useState<FeaturesState>(DEFAULT_FEATURES);
  const [orderedKeys, setOrderedKeys] = useState<string[]>(DEFAULT_ORDER);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [guestQuota, setGuestQuota] = useState(5);
  const [limitedQuota, setLimitedQuota] = useState(10);
  const [savingQuotas, setSavingQuotas] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    supabase.from("site_copy").select("copy_json").limit(1).single().then(({ data }) => {
      if (data?.copy_json) {
        const f = (data.copy_json as any).features || {};
        const tools_enabled = { ...DEFAULT_FEATURES.tools_enabled, ...(f.tools_enabled || {}) };
        const savedOrder: string[] = Array.isArray(f.tools_order) && f.tools_order.length > 0
          ? f.tools_order
          : DEFAULT_ORDER;
        // Ensure any new tools not in saved order are appended
        const merged = [
          ...savedOrder.filter(k => DEFAULT_ORDER.includes(k)),
          ...DEFAULT_ORDER.filter(k => !savedOrder.includes(k)),
        ];
        setFeatures({
          crypto_tipping: f.crypto_tipping ?? false,
          growth_flow: f.growth_flow ?? false,
          growth_quotas: f.growth_quotas ?? { guest: 5, limited: 10 },
          tools_enabled,
          tools_order: merged,
          crowdfit_mode: f.crowdfit_mode ?? "reactions",
        });
        setOrderedKeys(merged);
        setGuestQuota(f.growth_quotas?.guest ?? 5);
        setLimitedQuota(f.growth_quotas?.limited ?? 10);
      }
      setLoading(false);
    });
  }, []);

  const handleReorder = (newOrder: string[]) => {
    setOrderedKeys(newOrder);
  };

  const saveOrder = async () => {
    setSavingOrder(true);
    try {
      await patchFeatures({ tools_order: orderedKeys });
      setFeatures(f => ({ ...f, tools_order: orderedKeys }));
      toast.success("Tool order saved");
    } catch {
      toast.error("Failed to save order");
    } finally {
      setSavingOrder(false);
    }
  };

  const toggleTool = async (key: string, enabled: boolean) => {
    const prev = features.tools_enabled[key];
    setFeatures(f => ({ ...f, tools_enabled: { ...f.tools_enabled, [key]: enabled } }));
    setSavingKey(key);
    try {
      const newEnabled = { ...features.tools_enabled, [key]: enabled };
      await patchFeatures({ tools_enabled: newEnabled });
      toast.success(`${ALL_TOOLS.find(t => t.key === key)?.label} ${enabled ? "enabled" : "disabled"}`);
    } catch {
      setFeatures(f => ({ ...f, tools_enabled: { ...f.tools_enabled, [key]: prev } }));
      toast.error("Failed to update");
    } finally {
      setSavingKey(null);
    }
  };

  const toggleCrypto = async (enabled: boolean) => {
    const prev = features.crypto_tipping;
    setFeatures(f => ({ ...f, crypto_tipping: enabled }));
    setSavingKey("crypto");
    try {
      await patchFeatures({ crypto_tipping: enabled });
      toast.success(enabled ? "Crypto tipping enabled" : "Crypto tipping disabled");
    } catch {
      setFeatures(f => ({ ...f, crypto_tipping: prev }));
      toast.error("Failed to update");
    } finally {
      setSavingKey(null);
    }
  };

  const toggleGrowth = async (enabled: boolean) => {
    const prev = features.growth_flow;
    setFeatures(f => ({ ...f, growth_flow: enabled }));
    setSavingKey("growth");
    try {
      await patchFeatures({ growth_flow: enabled });
      toast.success(enabled ? "Growth flow enabled" : "Growth flow disabled");
    } catch {
      setFeatures(f => ({ ...f, growth_flow: prev }));
      toast.error("Failed to update");
    } finally {
      setSavingKey(null);
    }
  };

  const setCrowdfitMode = async (mode: "reactions" | "hook_review") => {
    const prev = features.crowdfit_mode;
    setFeatures(f => ({ ...f, crowdfit_mode: mode }));
    setSavingKey("crowdfit_mode");
    try {
      await patchFeatures({ crowdfit_mode: mode } as any);
      toast.success(mode === "hook_review" ? "Hook Review mode enabled" : "Standard reactions enabled");
    } catch {
      setFeatures(f => ({ ...f, crowdfit_mode: prev }));
      toast.error("Failed to update");
    } finally {
      setSavingKey(null);
    }
  };

  const saveQuotas = async () => {
    setSavingQuotas(true);
    try {
      await patchFeatures({ growth_quotas: { guest: guestQuota, limited: limitedQuota } });
      setFeatures(f => ({ ...f, growth_quotas: { guest: guestQuota, limited: limitedQuota } }));
      toast.success("Quotas saved");
    } catch {
      toast.error("Failed to save quotas");
    } finally {
      setSavingQuotas(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={20} /></div>;
  }

  const orderChanged = orderedKeys.join(",") !== features.tools_order.join(",");

  return (
    <div className="space-y-6">

      {/* ── Tool Toggles + Order ── */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Wrench size={14} className="text-primary" />
          <span className="text-sm font-mono font-medium">Products</span>
          <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">Drag to reorder · toggle to show/hide</span>
          <div className="ml-auto flex items-center gap-2">
            {orderChanged && (
              <button
                onClick={saveOrder}
                disabled={savingOrder}
                className="px-3 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {savingOrder ? "Saving…" : "Save Order"}
              </button>
            )}
          </div>
        </div>

        <Reorder.Group
          axis="y"
          values={orderedKeys}
          onReorder={handleReorder}
          className="divide-y divide-border"
          as="div"
        >
          {orderedKeys.map((key) => {
            const tool = ALL_TOOLS.find(t => t.key === key);
            if (!tool) return null;
            const enabled = features.tools_enabled[key] ?? true;
            return (
              <ToolRow
                key={key}
                tool={tool}
                enabled={enabled}
                saving={savingKey === key}
                onToggle={(v) => toggleTool(key, v)}
              />
            );
          })}
        </Reorder.Group>
      </div>

      {/* ── CrowdFit Mode ── */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Target size={14} className="text-primary" />
          <span className="text-sm font-mono font-medium">CrowdFit Mode</span>
        </div>
        <div className="divide-y divide-border">
          <button
            onClick={() => setCrowdfitMode("reactions")}
            disabled={savingKey === "crowdfit_mode"}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/30 transition-colors"
          >
            <div className="text-left">
              <p className="text-sm font-medium">Standard reactions</p>
              <p className="text-xs text-muted-foreground mt-0.5">🔥 fire, 💬 comments, share, bookmark</p>
            </div>
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${features.crowdfit_mode === "reactions" || !features.crowdfit_mode ? "border-primary bg-primary" : "border-border"}`}>
              {(features.crowdfit_mode === "reactions" || !features.crowdfit_mode) && <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
            </div>
          </button>
          <button
            onClick={() => setCrowdfitMode("hook_review")}
            disabled={savingKey === "crowdfit_mode"}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/30 transition-colors"
          >
            <div className="text-left">
              <p className="text-sm font-medium">Hook Review</p>
              <p className="text-xs text-muted-foreground mt-0.5">Structured 2-tap panel — did the hook land?</p>
            </div>
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${features.crowdfit_mode === "hook_review" ? "border-primary bg-primary" : "border-border"}`}>
              {features.crowdfit_mode === "hook_review" && <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
            </div>
          </button>
        </div>
      </div>

      {/* ── Crypto Tipping ── */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Coins size={14} className="text-purple-400" />
          <span className="text-sm font-mono font-medium">Crypto Tipping</span>
        </div>
        <div className="px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">$DEGEN tipping on CrowdFit</p>
            <p className="text-xs text-muted-foreground mt-0.5">Show tip button on all posts (Base chain)</p>
          </div>
          <Switch
            checked={features.crypto_tipping}
            onCheckedChange={toggleCrypto}
            disabled={savingKey === "crypto"}
          />
        </div>
      </div>

      {/* ── Product-Led Growth ── */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Rocket size={14} className="text-primary" />
          <span className="text-sm font-mono font-medium">Product-Led Growth</span>
        </div>
        <div className="px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Usage quotas + invite-to-unlock</p>
            <p className="text-xs text-muted-foreground mt-0.5">toolsFM widget with usage tracking</p>
          </div>
          <Switch
            checked={features.growth_flow}
            onCheckedChange={toggleGrowth}
            disabled={savingKey === "growth"}
          />
        </div>

        {features.growth_flow && (
          <div className="px-4 pb-4 pt-1 border-t border-border space-y-3">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Quotas (uses per tool)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Guest</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={guestQuota}
                  onChange={(e) => setGuestQuota(Number(e.target.value))}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Limited (signed up)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={limitedQuota}
                  onChange={(e) => setLimitedQuota(Number(e.target.value))}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm font-mono"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-[11px] text-muted-foreground flex-1">Unlimited = invite converts</p>
              <button
                onClick={saveQuotas}
                disabled={savingQuotas}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {savingQuotas ? "Saving…" : "Save Quotas"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
