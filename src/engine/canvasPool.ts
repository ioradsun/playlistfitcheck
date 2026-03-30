/**
 * canvasPool.ts — Global pool of reusable canvas pairs for the feed.
 *
 * The feed creates at most POOL_SIZE canvas contexts regardless of how
 * many cards exist. Cards acquire a slot when active, release on eviction.
 * This keeps GPU memory and draw-call overhead constant at O(POOL_SIZE).
 */

// 3 slots: 1 active player + 1 preloaded (center card behind cover) + 1 buffer.
// Only the center card and the active card create players — all other visible
// cards show the zero-cost React cover. This keeps GPU memory constant at O(3)
// regardless of how many cards exist in the feed.
const POOL_SIZE = 3;

interface CanvasSlot {
  id: number;
  bg: HTMLCanvasElement;
  text: HTMLCanvasElement;
  inUse: boolean;
  heldBy: string | null; // postId
}

let _slots: CanvasSlot[] | null = null;

function getSlots(): CanvasSlot[] {
  if (_slots) return _slots;
  _slots = Array.from({ length: POOL_SIZE }, (_, i) => {
    const bg = document.createElement("canvas");
    const text = document.createElement("canvas");
    bg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
    text.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
    return { id: i, bg, text, inUse: false, heldBy: null };
  });
  return _slots;
}

/** Acquire a canvas pair for a card. Returns null if pool exhausted. */
export function acquireCanvasSlot(postId: string): CanvasSlot | null {
  const slots = getSlots();
  const free = slots.find((s) => !s.inUse);
  if (!free) return null;
  free.inUse = true;
  free.heldBy = postId;
  return free;
}

/** Release a canvas pair back to the pool. Clears its contents. */
export function releaseCanvasSlot(postId: string): void {
  const slots = getSlots();
  const slot = slots.find((s) => s.heldBy === postId);
  if (!slot) return;
  // Clear canvases so they don't show stale frames
  const bgCtx = slot.bg.getContext("2d", { alpha: false });
  bgCtx?.clearRect(0, 0, slot.bg.width, slot.bg.height);
  const tCtx = slot.text.getContext("2d", { alpha: true });
  tCtx?.clearRect(0, 0, slot.text.width, slot.text.height);
  slot.inUse = false;
  slot.heldBy = null;
  // Wake any cards that were waiting for a free slot
  window.dispatchEvent(new CustomEvent("crowdfit:pool-slot-freed"));
}

/** Check if a card currently holds a slot. */
export function hasCanvasSlot(postId: string): boolean {
  return getSlots().some((s) => s.heldBy === postId);
}

/** How many slots are free. */
export function freeSlotCount(): number {
  return getSlots().filter((s) => !s.inUse).length;
}
