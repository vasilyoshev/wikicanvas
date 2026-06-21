import { buildEdgePath } from "@/src/features/canvas/edge-path";

describe("buildEdgePath", () => {
  const source = { x: 0, y: 0, width: 100, height: 100 };
  const target = { x: 300, y: 0, width: 100, height: 100 };

  it("returns a cubic bezier path string starting with M and containing C", () => {
    const d = buildEdgePath(source, target);
    expect(d.startsWith("M")).toBe(true);
    expect(d).toContain("C");
  });

  it("starts at the source right-center and ends at the target left-center", () => {
    const d = buildEdgePath(source, target);
    // Source right-center = (100, 50); target left-center = (300, 50).
    expect(d).toContain("M 100 50");
    expect(d.trimEnd().endsWith("300 50")).toBe(true);
  });

  it("produces control points that bow horizontally between the endpoints", () => {
    const d = buildEdgePath(source, target);
    // Control x's are the midpoint between the endpoints (200) per the formula.
    expect(d).toContain("C 200 50");
  });

  it("handles a target to the left of the source without throwing", () => {
    const d = buildEdgePath(target, source);
    expect(d.startsWith("M 400 50")).toBe(true);
  });
});
