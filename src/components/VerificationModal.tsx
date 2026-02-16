import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VerificationModal({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10MB");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!user || !file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("verification-screenshots")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from("verification_requests")
        .insert({
          user_id: user.id,
          screenshot_url: path,
          status: "pending",
        });
      if (insertError) throw insertError;

      setSubmitted(true);
      toast.success("Verification request submitted!");
    } catch (e: any) {
      toast.error(e.message || "Failed to submit");
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setFile(null);
      setPreview(null);
      setSubmitted(false);
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        {submitted ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle2 size={48} className="text-primary" />
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold">Request Submitted</h3>
              <p className="text-sm text-muted-foreground">We'll review your screenshot and verify your profile shortly.</p>
            </div>
            <Button onClick={handleClose}>Done</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Get Verified</DialogTitle>
              <DialogDescription>
                Upload a screenshot of your Spotify for Artists page. Make sure your name and profile picture is visible along with the rest of the page.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {preview ? (
                <div className="relative rounded-lg overflow-hidden border border-border">
                  <img src={preview} alt="Screenshot preview" className="w-full max-h-64 object-contain bg-muted/30" />
                  <button
                    onClick={() => { setFile(null); setPreview(null); }}
                    className="absolute top-2 right-2 px-2 py-1 rounded-md bg-background/80 backdrop-blur text-xs hover:bg-background transition-colors"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => inputRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center gap-2 hover:border-primary/50 hover:bg-muted/30 transition-colors"
                >
                  <Upload size={24} className="text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Click to upload screenshot</span>
                  <span className="text-[10px] text-muted-foreground/60">PNG, JPG up to 10MB</span>
                </button>
              )}

              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={handleClose} disabled={uploading}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={!file || uploading}>
                  {uploading ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Upload size={14} className="mr-1.5" />}
                  Upload
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
