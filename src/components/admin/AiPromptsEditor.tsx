import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface AiPrompt {
  slug: string;
  label: string;
  prompt: string;
  updated_at: string;
}

export function AiPromptsEditor() {
  const [prompts, setPrompts] = useState<AiPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

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

  const handleReset = (slug: string) => {
    setEditedPrompts((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
  };

  const isEdited = (slug: string) => editedPrompts[slug] !== undefined;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-primary" size={20} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {prompts.map((p) => {
        const currentValue = editedPrompts[p.slug] ?? p.prompt;
        const edited = isEdited(p.slug);

        return (
          <div key={p.slug} className="glass-card rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div>
                <span className="text-sm font-mono font-medium">{p.label}</span>
                <span className="text-[10px] text-muted-foreground ml-2 font-mono">{p.slug}</span>
              </div>
              <div className="flex items-center gap-2">
                {edited && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleReset(p.slug)}
                      className="h-7 text-xs gap-1"
                    >
                      <RotateCcw size={12} /> Reset
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSave(p.slug)}
                      disabled={saving === p.slug}
                      className="h-7 text-xs gap-1"
                    >
                      {saving === p.slug ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                      Save
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="p-4">
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
          </div>
        );
      })}

      {prompts.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No AI prompts configured yet.</p>
      )}
    </div>
  );
}
