import { FmlyFeed } from "./FmlyFeed";

interface Props {
  reelsMode?: boolean;
}

export function FmlyTab({ reelsMode = false }: Props) {
  return (
    <div className={reelsMode ? "w-full" : "w-full max-w-2xl mx-auto space-y-4"}>
      <FmlyFeed reelsMode={reelsMode} />
    </div>
  );
}
