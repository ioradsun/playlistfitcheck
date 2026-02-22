import { HookFitFeed } from "./HookFitFeed";

export function HookFitTab() {
  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      <div className="px-3 pt-4 pb-1">
        <h1 className="text-base font-semibold text-foreground leading-tight">HookFit</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Get the hook that fits social.</p>
      </div>
      <HookFitFeed />
    </div>
  );
}
