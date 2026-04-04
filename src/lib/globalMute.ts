let _muted = true;
export function isGlobalMuted(): boolean { return _muted; }
export function setGlobalMuted(muted: boolean): void { _muted = muted; }
