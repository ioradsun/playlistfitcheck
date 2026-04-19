import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

describe("usePrimaryArbiter regression guards", () => {
  it("uses renderedIds resyncRef pathway and no second renderedIds effect", () => {
    const src = readFileSync("src/components/fmly/feed/usePrimaryArbiter.ts", "utf8");

    expect(src).toContain("const resyncRef = useRef<(() => void) | null>(null);");
    expect(src).toContain("useEffect(() => {\n    resyncRef.current?.();\n  }, [renderedIds]);");
    expect(src).toContain('rootMargin: "-25% 0px -25% 0px"');
    expect(src).not.toContain("][renderedIds, scrollContainer, cardRefs]");
  });
});
