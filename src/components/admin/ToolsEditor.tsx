import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Coins, Rocket, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { motion } from "framer-motion";

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

interface FeaturesState {
  crypto_tipping: boolean;
  growth_flow: boolean;
  growth_quotas: { guest: number; limited: number };
  tools_enabled: Record<string, boolean>;
}

const DEFAULT_FEATURES: FeaturesState = {
  crypto_tipping: false,
  growth_flow: false,
  growth_quotas: { guest: 5, limited: 10 },
  tools_enabled: Object.fromEntries(ALL_TOOLS.map(t => [t.key, true])),
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

export function ToolsEditor() {
  const [features, setFeatures] = useState<FeaturesState>(DEFAULT_FEATURES);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [guestQuota, setGuestQuota] = useState(5);
  const [limitedQuota, setLimitedQuota] = useState(10);
  const [savingQuotas, setSavingQuotas] = useState(false);

  useEffect(() => {
    supabase.from("site_copy").select("copy_json").limit(1).single().then(({ data }) => {
      if (data?.copy_json) {
        const f = (data.copy_json as any).features || {};
        const tools_enabled = { ...DEFAULT_FEATURES.tools_enabled, ...(f.tools_enabled || {}) };
        setFeatures({
          crypto_tipping: f.crypto_tipping ?? false,
          growth_flow: f.growth_flow ?? false,
          growth_quotas: f.growth_quotas ?? { guest: 5, limited: 10 },
          tools_enabled,
        });
        setGuestQuota(f.growth_quotas?.guest ?? 5);
        setLimitedQuota(f.growth_quotas?.limited ?? 10);
      }
      setLoading(false);
    });
  }, []);

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

  return (
    <div className="space-y-6">

      {/* ── Tool Toggles ── */}
      <motion.div className="glass-card rounded-xl overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Wrench size={14} className="text-primary" />
          <span className="text-sm font-mono font-medium">Products</span>
          <span className="text-xs text-muted-foreground ml-auto">Toggle to show/hide in sidebar & navigation</span>
        </div>
        <div className="divide-y divide-border">
          {ALL_TOOLS.map((tool) => {
            const enabled = features.tools_enabled[tool.key] ?? true;
            return (
              <div key={tool.key} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{tool.label}</p>
                  <p className="text-xs text-muted-foreground font-mono">{tool.key}</p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(v) => toggleTool(tool.key, v)}
                  disabled={savingKey === tool.key}
                />
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* ── Crypto Tipping ── */}
      <motion.div className="glass-card rounded-xl overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
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
      </motion.div>

      {/* ── Product-Led Growth ── */}
      <motion.div className="glass-card rounded-xl overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
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
      </motion.div>
    </div>
  );
}
