import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderOpen, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

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
}

export function RecentProjects<T>({
  fetcher,
  toItem,
  onLoad,
  onDelete,
  refreshKey,
  maxItems = 5,
}: RecentProjectsProps<T>) {
  const { user } = useAuth();
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    fetcher().then((data) => {
      setItems(data.slice(0, maxItems));
      setLoading(false);
    });
  }, [user, fetcher, refreshKey, maxItems]);

  if (!user || loading || items.length === 0) return null;

  return (
    <div className="w-full max-w-lg mx-auto space-y-2 mt-6">
      <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
        Recent Projects
      </p>
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
    </div>
  );
}
