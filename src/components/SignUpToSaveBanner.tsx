import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bookmark } from "lucide-react";

export function SignUpToSaveBanner() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading || user) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/90 backdrop-blur-md px-4 py-3 flex items-center justify-center">
      <Button
        size="sm"
        className="ml-1"
        onClick={() => navigate("/auth?mode=signup")}
      >
        Save with a free account
      </Button>
    </div>
  );
}
