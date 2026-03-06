import { LogIn, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface AuthNudgeProps {
  onDismiss: () => void;
}

export function AuthNudge({ onDismiss }: AuthNudgeProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-2 text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg px-3 py-2">
      <LogIn size={12} className="shrink-0" />
      <span className="flex-1">
        Log in to save your project and access it later.{" "}
        <button
          className="underline font-medium hover:text-amber-300 transition-colors"
          onClick={() => navigate("/auth")}
        >
          Log in
        </button>
      </span>
      <button onClick={onDismiss} className="shrink-0 hover:text-amber-300 transition-colors" aria-label="Dismiss login reminder">
        <X size={12} />
      </button>
    </div>
  );
}
