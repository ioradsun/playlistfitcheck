import { SongFitFeed } from "./SongFitFeed";

interface Props {
  reelsMode?: boolean;
}

export function SongFitTab({ reelsMode = false }: Props) {
  return (
    <div className={reelsMode ? "w-full" : "w-full max-w-2xl mx-auto space-y-4"}>
      <SongFitFeed reelsMode={reelsMode} />
    </div>
  );
}
