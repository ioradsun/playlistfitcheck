import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, FolderOpen } from "lucide-react";
import { useMixProjectStorage, type MixProjectData } from "@/hooks/useMixProjectStorage";

interface SavedProjectsListProps {
  onLoad: (project: MixProjectData) => void;
  refreshKey?: number;
}

export function SavedProjectsList({ onLoad, refreshKey }: SavedProjectsListProps) {
  const { list, remove } = useMixProjectStorage();
  const [projects, setProjects] = useState<MixProjectData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    list().then((p) => { setProjects(p); setLoading(false); });
  }, [list, refreshKey]);

  if (loading) return null;
  if (projects.length === 0) return null;

  return (
    <div className="w-full max-w-md mx-auto space-y-3 mt-6">
      <h3 className="text-sm font-medium text-muted-foreground">Saved Projects</h3>
      {projects.map((p) => (
        <Card key={p.id} className="group">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{p.title}</p>
              <p className="text-xs text-muted-foreground">
                {p.mixes.length} mix{p.mixes.length !== 1 ? "es" : ""} ·{" "}
                {new Date(p.updatedAt).toLocaleDateString()}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onLoad(p)}>
              <FolderOpen size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={async () => {
                await remove(p.id);
                setProjects((prev) => prev.filter((x) => x.id !== p.id));
              }}
            >
              <Trash2 size={14} />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
