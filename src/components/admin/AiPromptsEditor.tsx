import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ChevronDown } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AiPrompt {
  slug: string;
  label: string;
  prompt: string;
  updated_at: string;
}

const MODEL_OPTIONS = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (default)" },
  { value: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { value: "openai/gpt-5", label: "GPT-5" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { value: "openai/gpt-5.2", label: "GPT-5.2" },
];

const MODEL_SLUG = "analysis-model";

export function AiPromptsEditor() {
  const [prompts, setPrompts] = useState<AiPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [openSlugs, setOpenSlugs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_prompts")
      .select("*")
      .order("label");
    if (error) {
      toast.error("Failed to load prompts");
      console.error(error);
    } else {
      setPrompts(data || []);
    }
    setLoading(false);
  };

  const handleEdit = (slug: string, value: string) => {
    setEditedPrompts((prev) => ({ ...prev, [slug]: value }));
  };

  const handleSave = async (slug: string) => {
    const newPrompt = editedPrompts[slug];
    if (newPrompt === undefined) return;

    if (!newPrompt.trim()) {
      await handleDelete(slug);
      return;
    }

    setSaving(slug);
    const { error } = await supabase
      .from("ai_prompts")
      .update({ prompt: newPrompt })
      .eq("slug", slug);

    if (error) {
      toast.error("Failed to save prompt");
      console.error(error);
    } else {
      toast.success("Prompt saved");
      setPrompts((prev) =>
        prev.map((p) => (p.slug === slug ? { ...p, prompt: newPrompt, updated_at: new Date().toISOString() } : p))
      );
      setEditedPrompts((prev) => {
        const next = { ...prev };
        delete next[slug];
        return next;
      });
    }
    setSaving(null);
  };

  const handleDelete = async (slug: string) => {
    setSaving(slug);
    const { error } = await supabase
      .from("ai_prompts")
      .delete()
      .eq("slug", slug);

    if (error) {
      toast.error("Failed to delete prompt — check permissions");
      console.error(error);
    } else {
      toast.success("Prompt deleted — will use code default");
      setPrompts((prev) => prev.filter((p) => p.slug !== slug));
      setEditedPrompts((prev) => {
        const next = { ...prev };
        delete next[slug];
        return next;
      });
    }
    setSaving(null);
  };

  const handleReset = (slug: string) => {
    setEditedPrompts((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
  };

  const handleModelChange = async (value: string) => {
    setSaving(MODEL_SLUG);
    const { error } = await supabase
      .from("ai_prompts")
      .update({ prompt: value })
      .eq("slug", MODEL_SLUG);

    if (error) {
      toast.error("Failed to save model");
      console.error(error);
    } else {
      toast.success(`Model → ${value}`);
      setPrompts((prev) =>
        prev.map((p) => (p.slug === MODEL_SLUG ? { ...p, prompt: value, updated_at: new Date().toISOString() } : p))
      );
    }
    setSaving(null);
  };

  const isEdited = (slug: string) => editedPrompts[slug] !== undefined;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-primary" size={20} />
      </div>
    );
  }

  const modelPrompt = prompts.find((p) => p.slug === MODEL_SLUG);
  const textPrompts = prompts.filter((p) => p.slug !== MODEL_SLUG);

  return (
    <div className="space-y-3">
      {/* Model selector */}
      {modelPrompt && (
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-sm font-mono font-medium">{modelPrompt.label}</span>
              <span className="text-[10px] text-muted-foreground ml-2 font-mono">{modelPrompt.slug}</span>
            </div>
            <Select
              value={modelPrompt.prompt}
              onValueChange={handleModelChange}
              disabled={saving === MODEL_SLUG}
            >
              <SelectTrigger className="w-[280px] text-xs font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="text-xs font-mono">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Prompt collapsibles */}
      {textPrompts.map((p) => {
        const currentValue = editedPrompts[p.slug] ?? p.prompt;
        const edited = isEdited(p.slug);
        const isOpen = openSlugs[p.slug] ?? false;

        return (
          <Collapsible
            key={p.slug}
            open={isOpen}
            onOpenChange={(open) => setOpenSlugs((prev) => ({ ...prev, [p.slug]: open }))}
          >
            <div className="glass-card rounded-xl overflow-hidden">
              <CollapsibleTrigger asChild>
                <button className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 text-left">
                    <span className="text-sm font-mono font-medium">{p.label}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{p.slug}</span>
                    {edited && (
                      <span className="text-[10px] text-primary font-mono">• edited</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {p.prompt.length.toLocaleString()} chars
                    </span>
                    <ChevronDown
                      size={14}
                      className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </div>
                </button>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="border-t border-border px-4 py-3">
                  <div className="flex items-center justify-end gap-3 mb-2">
                    {edited && (
                      <>
                        <button
                          onClick={() => handleReset(p.slug)}
                          className="text-[13px] font-sans font-bold tracking-[0.15em] uppercase text-muted-foreground/30 hover:text-foreground transition-colors"
                        >
                          Reset
                        </button>
                        <button
                          onClick={() => handleSave(p.slug)}
                          disabled={saving === p.slug}
                          className="text-[13px] font-sans font-bold tracking-[0.15em] uppercase text-foreground hover:text-foreground/80 transition-colors disabled:opacity-50"
                        >
                          {saving === p.slug ? "Saving…" : "Save"}
                        </button>
                      </>
                    )}
                    {!edited && (
                      <button
                        onClick={() => handleDelete(p.slug)}
                        disabled={saving === p.slug}
                        className="text-[13px] font-sans font-bold tracking-[0.15em] uppercase text-muted-foreground/30 hover:text-destructive transition-colors disabled:opacity-50"
                      >
                        {saving === p.slug ? "Deleting…" : "Use Default"}
                      </button>
                    )}
                  </div>
                  <Textarea
                    value={currentValue}
                    onChange={(e) => handleEdit(p.slug, e.target.value)}
                    className="font-mono text-xs min-h-[200px] resize-y bg-muted/20 border-border"
                    spellCheck={false}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Last updated: {new Date(p.updated_at).toLocaleString()}
                  </p>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}

      {prompts.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No custom prompts — all tools using code defaults.</p>
      )}
    </div>
  );
}
