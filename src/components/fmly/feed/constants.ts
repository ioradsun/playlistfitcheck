/**
 * Feed card dimensions — kept in sync with the real DOM so virtual window
 * math matches what renders.
 *
 * Per card (non-reels):
 *   Outer wrapper:  px-2 pb-3       → 12px bottom padding
 *   Inner rounded:  height 320px    → Shell interior
 *     ├─ PlayerHeader: 44px (hardcoded in PlayerHeader.tsx)
 *     ├─ Media area:   flex-1       (= 232px)
 *     └─ Bottom bar:   44px (hardcoded)
 *
 *   Total occupied = 320 + 12 = 332px.
 *
 * If any of these numbers change in PlayerHeader, FeedCard wrapper padding,
 * or Shell bar height, update here. Mismatches break virtual-window scroll
 * math and the skeleton-to-real-card transition.
 */

const CARD_WRAPPER_BOTTOM_PADDING_PX = 12;   // Tailwind pb-3 on outer wrapper

/** Height of the inner rounded card (Shell interior). Used as inline
 *  `height` on FeedCard + SkeletonCard inner slot. */
export const CARD_CONTENT_HEIGHT_PX = 320;

/** Total per-card occupied vertical space including outer bottom padding.
 *  Used by virtual window cardHeight math and content-visibility
 *  intrinsic size. */
export const CARD_TOTAL_HEIGHT_PX =
  CARD_CONTENT_HEIGHT_PX + CARD_WRAPPER_BOTTOM_PADDING_PX;    // 332

/** Desktop feed column max width. */
export const FEED_MAX_WIDTH_PX = 470;
