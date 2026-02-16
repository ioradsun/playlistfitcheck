import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface VerificationRequest {
  id: string;
  user_id: string;
  screenshot_url: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

export function PendingVerifications() {
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-dashboard", {
        body: { action: "get_verification_requests" },
      });
      if (error) throw error;
      setRequests(data?.requests || []);
    } catch (e: any) {
      toast.error("Failed to load verification requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, []);

  const handleAction = async (requestId: string, action: "approve" | "reject") => {
    setProcessing(requestId);
    try {
      const { error } = await supabase.functions.invoke("admin-dashboard", {
        body: { action: "review_verification", request_id: requestId, decision: action },
      });
      if (error) throw error;
      toast.success(action === "approve" ? "Artist verified!" : "Request rejected");
      fetchRequests();
    } catch (e: any) {
      toast.error(e.message || "Failed to process");
    } finally {
      setProcessing(null);
    }
  };

  const getSignedUrl = async (path: string) => {
    const { data } = await supabase.functions.invoke("admin-dashboard", {
      body: { action: "get_verification_screenshot_url", path },
    });
    if (data?.url) {
      window.open(data.url, "_blank");
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={20} /></div>;
  }

  if (requests.length === 0) {
    return <div className="text-center py-12 text-sm text-muted-foreground">No pending verification requests.</div>;
  }

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="text-sm font-mono font-medium">Verification Requests</span>
        <span className="text-xs font-mono text-muted-foreground">{requests.length} total</span>
      </div>

      <div className="divide-y divide-border">
        {requests.map((req) => {
          const initials = (req.profile?.display_name || "?").slice(0, 2).toUpperCase();
          return (
            <div key={req.id} className="px-4 py-3 flex items-center gap-3">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src={req.profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">{initials}</AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{req.profile?.display_name || "Unknown"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                </p>
              </div>

              <Badge
                variant={req.status === "pending" ? "outline" : req.status === "approved" ? "default" : "destructive"}
                className="text-[10px] capitalize shrink-0"
              >
                {req.status}
              </Badge>

              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 shrink-0"
                onClick={() => getSignedUrl(req.screenshot_url)}
              >
                <ExternalLink size={14} />
              </Button>

              {req.status === "pending" && (
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    className="h-8 px-3 text-xs gap-1"
                    onClick={() => handleAction(req.id, "approve")}
                    disabled={processing === req.id}
                  >
                    {processing === req.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                    Verify
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-xs gap-1"
                    onClick={() => handleAction(req.id, "reject")}
                    disabled={processing === req.id}
                  >
                    <XCircle size={12} />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
