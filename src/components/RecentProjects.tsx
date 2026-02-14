import { useState, useEffect, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderOpen, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";

export interface RecentProjectItem {
  id: string;
  label: string;
  meta: string;
}

interface RecentProjectsProps<T> {
  fetcher: () => Promise<T[]>;
  toItem: (item: T) => RecentProjectItem;
  onLoad: (item: T) => void;
  onDelete: (id: string) => Promise<void>;
  refreshKey?: number;
  maxItems?: number;
  children: ReactNode;
}

export function RecentProjects<T>({
  fetcher,
  toItem,
  onLoad,
  onDelete,
  refreshKey,
  maxItems = 5,
  children,
}: RecentProjectsProps<T>) {
  const { user } = useAuth();
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"new" | "recent">("new");

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    fetcher().then((data) => {
      setItems(data.slice(0, maxItems));
      setLoading(false);
    });
  }, [user, fetcher, refreshKey, maxItems]);

  const hasRecent = user && !loading && items.length > 0;

  return (
    <div className="w-full space-y-4">
      {/* Tab toggle — only show if there are recent items */}
      {hasRecent && (
        <div className="flex justify-center">
          <div className="inline-flex items-center rounded-full bg-muted/40 p-0.5 gap-0.5">
            <button
              onClick={() => setTab("new")}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                tab === "new"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              New
            </button>
            <button
              onClick={() => setTab("recent")}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                tab === "recent"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Recent
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <AnimatePresence mode="wait">
        {tab === "new" ? (
          <motion.div
            key="new"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
          >
            {children}
          </motion.div>
        ) : (
          <motion.div
            key="recent"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-lg mx-auto space-y-2"
          >
            {items.map((raw) => {
              const item = toItem(raw);
              return (
                <Card key={item.id} className="border-border/30 bg-card/50 hover:border-border/60 transition-colors">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.meta}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => onLoad(raw)}
                    >
                      <FolderOpen size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        await onDelete(item.id);
                        setItems((prev) => prev.filter((i) => toItem(i).id !== item.id));
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
