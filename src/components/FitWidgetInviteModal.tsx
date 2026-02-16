import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface FitWidgetInviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inviteCode: string | null;
}

export function FitWidgetInviteModal({ open, onOpenChange, inviteCode }: FitWidgetInviteModalProps) {
  const [copied, setCopied] = useState(false);

  const inviteUrl = inviteCode
    ? `${window.location.origin}/?ref=${inviteCode}`
    : "";

  const handleCopy = useCallback(() => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast.success("Invite link copied!");
    setTimeout(() => setCopied(false), 2000);
  }, [inviteUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite a Collaborator</DialogTitle>
          <DialogDescription>
            Share this link. When they sign up, you both unlock unlimited usage.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="flex gap-2">
            <Input value={inviteUrl} readOnly className="text-xs font-mono" />
            <Button size="icon" variant="outline" onClick={handleCopy} disabled={!inviteCode}>
              {copied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Each artist you invite can also invite others — chain reaction!
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
