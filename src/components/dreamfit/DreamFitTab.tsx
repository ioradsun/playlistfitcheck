import { useState } from "react";
import { DreamToolsComposer } from "./DreamToolsComposer";
import { DreamToolsFeed } from "./DreamToolsFeed";
import { Sparkles } from "lucide-react";

export function DreamFitTab() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [showComposer, setShowComposer] = useState(false);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Hero */}
      {!showComposer && (
        <div className="text-center space-y-3 py-4">
          <h1 className="text-xl font-bold text-foreground">
            What tool do you wish existed?
          </h1>
          <p className="text-sm text-muted-foreground">
            If it's annoying you, it's annoying someone else too.
          </p>
          <button
            onClick={() => setShowComposer(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity glow-primary"
          >
            <Sparkles size={16} />
            Post a Dream
          </button>
        </div>
      )}

      {/* Composer */}
      {showComposer && (
        <div className="space-y-2">
          <DreamToolsComposer onCreated={() => {
            setRefreshKey((k) => k + 1);
            setShowComposer(false);
          }} />
          <button
            onClick={() => setShowComposer(false)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to feed
          </button>
        </div>
      )}

      {/* Feed */}
      <DreamToolsFeed refreshKey={refreshKey} />
    </div>
  );
}
