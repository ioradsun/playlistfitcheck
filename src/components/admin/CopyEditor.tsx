import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Save, FileText, Download, Upload, Activity } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import type { SiteCopy, AboutProduct } from "@/hooks/useSiteCopy";

const TOOL_KEYS = ["songfit", "profit", "playlist", "mix", "lyric", "hitfit", "dreamfit"] as const;

export function CopyEditor() {
  const [copy, setCopy] = useState<SiteCopy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("site_copy")
        .select("copy_json")
        .limit(1)
        .single();
      if (data?.copy_json) setCopy(data.copy_json as any);
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (!copy) return;
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("admin-dashboard", {
        body: { action: "update_site_copy", copy_json: copy },
      });
      if (error) throw error;
      toast.success("Copy saved");
      window.dispatchEvent(new CustomEvent("site-copy-updated"));
    } catch (e) {
      toast.error("Failed to save copy");
    } finally {
      setSaving(false);
    }
  };

  const updateTool = (key: string, field: string, value: string) => {
    setCopy((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tools: {
          ...prev.tools,
          [key]: { ...prev.tools[key], [field]: value },
        },
      };
    });
  };

  const updateAbout = (field: string, value: string) => {
    setCopy((prev) => {
      if (!prev) return prev;
      return { ...prev, about: { ...prev.about, [field]: value } };
    });
  };

  const updateProduct = (index: number, field: keyof AboutProduct, value: string) => {
    setCopy((prev) => {
      if (!prev) return prev;
      const products = [...prev.about.products];
      products[index] = { ...products[index], [field]: value };
      return { ...prev, about: { ...prev.about, products } };
    });
  };

  const updatePage = (field: string, value: string) => {
    setCopy((prev) => {
      if (!prev) return prev;
      return { ...prev, pages: { ...prev.pages, [field]: value } };
    });
  };

  const updateSidebar = (field: string, value: string) => {
    setCopy((prev) => {
      if (!prev) return prev;
      return { ...prev, sidebar: { ...prev.sidebar, [field]: value } };
    });
  };

  const updateSignal = (field: string, value: string) => {
    setCopy((prev) => {
      if (!prev) return prev;
      return { ...prev, signals: { ...prev.signals, [field]: value } };
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-primary" size={20} />
      </div>
    );
  }

  if (!copy) {
    return <p className="text-sm text-muted-foreground text-center py-8">No copy data found.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Action buttons */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              const blob = new Blob([JSON.stringify(copy, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `site-copy-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
              toast.success("Copy exported");
            }}
          >
            <Download size={14} /> Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowImport((v) => !v)}
          >
            <Upload size={14} /> Import
          </Button>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Saving..." : "Save All Changes"}
        </Button>
      </div>

      {/* Import paste panel */}
      {showImport && (
        <motion.div className="glass-card rounded-xl p-4 space-y-2" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
          <label className="text-xs text-muted-foreground">Paste JSON below, then click Apply</label>
          <Textarea
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            placeholder='{"tools":{...},"about":{...},"sidebar":{...},"pages":{...}}'
            className="text-xs font-mono min-h-[120px]"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setShowImport(false); setImportJson(""); }}>Cancel</Button>
            <Button size="sm" onClick={() => {
              try {
                const parsed = JSON.parse(importJson);
                if (parsed.tools && parsed.about && parsed.sidebar && parsed.pages) {
                  setCopy(parsed);
                  setShowImport(false);
                  setImportJson("");
                  toast.success("Copy imported — click Save to apply");
                } else {
                  toast.error("Invalid copy JSON structure");
                }
              } catch {
                toast.error("Failed to parse JSON");
              }
            }}>Apply</Button>
          </div>
        </motion.div>
      )}

      <motion.div className="glass-card rounded-xl overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <FileText size={14} className="text-primary" />
          <span className="text-sm font-mono font-medium">Tool Names & Pills</span>
        </div>
        <div className="divide-y divide-border">
          {TOOL_KEYS.map((key) => {
            const tool = copy.tools[key];
            if (!tool) return null;
            return (
              <div key={key} className="px-4 py-3 space-y-2">
                <p className="text-xs font-mono text-muted-foreground uppercase">{key}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Label</label>
                    <Input
                      value={tool.label}
                      onChange={(e) => updateTool(key, "label", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Pill / Subtitle</label>
                    <Input
                      value={tool.pill}
                      onChange={(e) => updateTool(key, "pill", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  {tool.heading !== undefined && (
                    <div className="sm:col-span-2">
                      <label className="text-[10px] text-muted-foreground">Heading</label>
                      <Input
                        value={tool.heading || ""}
                        onChange={(e) => updateTool(key, "heading", e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <label className="text-[10px] text-muted-foreground">Subheading</label>
                    <Input
                      value={tool.subheading || ""}
                      onChange={(e) => updateTool(key, "subheading", e.target.value)}
                      className="h-8 text-sm"
                      placeholder="Optional subheading"
                    />
                  </div>
                  {tool.cta !== undefined && (
                    <div>
                      <label className="text-[10px] text-muted-foreground">CTA Button</label>
                      <Input
                        value={tool.cta || ""}
                        onChange={(e) => updateTool(key, "cta", e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Page Titles */}
      <motion.div className="glass-card rounded-xl overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <FileText size={14} className="text-primary" />
          <span className="text-sm font-mono font-medium">Page Titles & Sidebar</span>
        </div>
        <div className="px-4 py-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Sidebar Brand</label>
              <Input value={copy.sidebar.brand} onChange={(e) => updateSidebar("brand", e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Story Link Text</label>
              <Input value={copy.sidebar.story_link} onChange={(e) => updateSidebar("story_link", e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">About Page Title</label>
              <Input value={copy.pages.about_title} onChange={(e) => updatePage("about_title", e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">About Page Subtitle</label>
              <Input value={copy.pages.about_subtitle} onChange={(e) => updatePage("about_subtitle", e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Auth Page Title</label>
              <Input value={copy.pages.auth_title} onChange={(e) => updatePage("auth_title", e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
        </div>
      </motion.div>

      {/* About / Origin Story */}
      <motion.div className="glass-card rounded-xl overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <FileText size={14} className="text-primary" />
          <span className="text-sm font-mono font-medium">Origin Story</span>
        </div>
        <div className="px-4 py-3 space-y-3">
          <div>
            <label className="text-[10px] text-muted-foreground">Intro Paragraph</label>
            <Textarea value={copy.about.origin_intro} onChange={(e) => updateAbout("origin_intro", e.target.value)} className="text-sm min-h-[60px]" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Body Paragraph</label>
            <Textarea value={copy.about.origin_body} onChange={(e) => updateAbout("origin_body", e.target.value)} className="text-sm min-h-[60px]" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Tagline</label>
            <Input value={copy.about.origin_tagline} onChange={(e) => updateAbout("origin_tagline", e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Listen Label</label>
            <Input value={copy.about.listen_label} onChange={(e) => updateAbout("listen_label", e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Tools Section Intro</label>
            <Textarea value={copy.about.tools_intro} onChange={(e) => updateAbout("tools_intro", e.target.value)} className="text-sm min-h-[60px]" />
          </div>
        </div>
      </motion.div>

      {/* About Products */}
      <motion.div className="glass-card rounded-xl overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <FileText size={14} className="text-primary" />
          <span className="text-sm font-mono font-medium">Tool Descriptions (About Page)</span>
        </div>
        <div className="divide-y divide-border">
          {copy.about.products.map((product, i) => (
            <div key={i} className="px-4 py-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Name</label>
                  <Input value={product.name} onChange={(e) => updateProduct(i, "name", e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Tagline</label>
                  <Input value={product.tagline} onChange={(e) => updateProduct(i, "tagline", e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Description</label>
                <Textarea value={product.description} onChange={(e) => updateProduct(i, "description", e.target.value)} className="text-sm min-h-[50px]" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">How It Works</label>
                <Textarea value={product.how} onChange={(e) => updateProduct(i, "how", e.target.value)} className="text-sm min-h-[50px]" />
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Signal Verbiage */}
      <motion.div className="glass-card rounded-xl overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Activity size={14} className="text-primary" />
          <span className="text-sm font-mono font-medium">Signal Verbiage (CrowdFit &amp; DreamFit)</span>
        </div>
        <div className="divide-y divide-border">
          {/* Tier 1: Resolving */}
          <div className="px-4 py-3 space-y-2">
            <p className="text-xs font-mono text-muted-foreground uppercase">0–10 Signals — Resolving</p>
            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground">Status Label <span className="opacity-50">(mono readout)</span></label>
                <Input value={copy.signals?.resolving_label ?? ""} onChange={(e) => updateSignal("resolving_label", e.target.value)} className="h-8 text-sm font-mono" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Summary Line</label>
                <Input value={copy.signals?.resolving_summary ?? ""} onChange={(e) => updateSignal("resolving_summary", e.target.value)} className="h-8 text-sm font-mono" />
              </div>
            </div>
          </div>
          {/* Tier 2: Detected */}
          <div className="px-4 py-3 space-y-2">
            <p className="text-xs font-mono text-muted-foreground uppercase">11–49 Signals — Detected <span className="normal-case opacity-60">(use {"{n}"} for count)</span></p>
            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground">Status Label</label>
                <Input value={copy.signals?.detected_label ?? ""} onChange={(e) => updateSignal("detected_label", e.target.value)} className="h-8 text-sm font-mono" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Summary Line</label>
                <Input value={copy.signals?.detected_summary ?? ""} onChange={(e) => updateSignal("detected_summary", e.target.value)} className="h-8 text-sm font-mono" />
              </div>
            </div>
          </div>
          {/* Tier 3: Consensus */}
          <div className="px-4 py-3 space-y-2">
            <p className="text-xs font-mono text-muted-foreground uppercase">50+ Signals — Consensus <span className="normal-case opacity-60">(use {"{pct}"} for percentage)</span></p>
            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground">Status Label</label>
                <Input value={copy.signals?.consensus_label ?? ""} onChange={(e) => updateSignal("consensus_label", e.target.value)} className="h-8 text-sm font-mono" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Summary Line</label>
                <Input value={copy.signals?.consensus_summary ?? ""} onChange={(e) => updateSignal("consensus_summary", e.target.value)} className="h-8 text-sm font-mono" />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Bottom save */}
      <div className="flex justify-end pb-8">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Saving..." : "Save All Changes"}
        </Button>
      </div>
    </div>
  );
}
