import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Save, FileText } from "lucide-react";
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
      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Saving..." : "Save All Changes"}
        </Button>
      </div>

      {/* Tool Copy */}
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
