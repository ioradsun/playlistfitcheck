import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePrimaryArbiter } from "@/components/fmly/feed/usePrimaryArbiter";

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin = "0px";
  readonly scrollMargin = "0px";
  readonly thresholds = [0];
  takeRecords = vi.fn(() => []);
  disconnect = vi.fn();
  unobserve = vi.fn();
  observe = vi.fn();

  constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
}

const makeRect = (top: number, height: number): DOMRect =>
  ({
    x: 0,
    y: top,
    top,
    bottom: top + height,
    left: 0,
    right: 400,
    width: 400,
    height,
    toJSON: () => ({}),
  }) as DOMRect;

const makeCard = (top: number, height: number) => {
  const card = document.createElement("div");
  Object.defineProperty(card, "offsetTop", { value: top, configurable: true });
  card.getBoundingClientRect = () => makeRect(top, height);
  return card;
};

const mountArbiter = (cardTops: number[], cardHeight: number, rootHeight: number) => {
  const scrollContainer = document.createElement("div");
  Object.defineProperty(scrollContainer, "clientHeight", { value: rootHeight, configurable: true });
  Object.defineProperty(scrollContainer, "scrollHeight", {
    value: cardTops.length * cardHeight,
    configurable: true,
  });
  scrollContainer.scrollTop = 0;
  scrollContainer.getBoundingClientRect = () => makeRect(0, rootHeight);

  const ids = cardTops.map((_, i) => `card-${i}`);
  const cardRefs = {
    current: new Map(ids.map((id, i) => [id, makeCard(cardTops[i], cardHeight)])),
  };
  const renderedIds = new Set(ids);

  return renderHook(() => usePrimaryArbiter(scrollContainer, cardRefs, renderedIds));
};

describe("usePrimaryArbiter boundary geometry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("picks the first card when first card center is below root center", () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    const { result } = mountArbiter([200, 532, 864], 332, 600);

    expect(result.current.primaryId).toBe("card-0");
  });

  it("picks the last card when last card center is above root center", () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    const { result } = mountArbiter([-564, -232, 100], 100, 600);

    expect(result.current.primaryId).toBe("card-2");
  });

  it("picks a middle card when neither boundary condition applies", () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    const { result } = mountArbiter([-200, 132, 464], 332, 600);

    expect(result.current.primaryId).toBe("card-1");
  });
});
