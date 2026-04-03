/** Global mute state — shared across all feed cards. One toggle for all. */

let _muted = true;

export function isGlobalMuted(): boolean {
  return _muted;
}

export function setGlobalMuted(muted: boolean): void {
  if (_muted === muted) return;
  _muted = muted;
  window.dispatchEvent(new CustomEvent("crowdfit:mute-change", { detail: { muted } }));
}
