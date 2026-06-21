// src/features/canvas/layout.test.ts
import { computeContentBounds, thumbnailLayout } from "@/src/features/canvas/layout";

describe("computeContentBounds", () => {
  it("returns a zero rect for no nodes", () => {
    expect(computeContentBounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("encloses all node rects", () => {
    const bounds = computeContentBounds([
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 200, y: 50, width: 50, height: 50 },
    ]);
    expect(bounds).toEqual({ x: 0, y: 0, width: 250, height: 100 });
  });

  it("handles negative coordinates", () => {
    const bounds = computeContentBounds([
      { x: -100, y: -50, width: 50, height: 50 },
      { x: 100, y: 100, width: 50, height: 50 },
    ]);
    expect(bounds).toEqual({ x: -100, y: -50, width: 250, height: 200 });
  });
});

describe("thumbnailLayout", () => {
  const size = { width: 200, height: 120 };

  it("returns empty geometry for no nodes", () => {
    expect(thumbnailLayout([], [], size)).toEqual({ rects: [], lines: [] });
  });

  it("scales nodes to fit within the thumbnail and preserves ids", () => {
    const out = thumbnailLayout(
      [
        { id: "a", x: 0, y: 0, width: 400, height: 400 },
        { id: "b", x: 800, y: 0, width: 400, height: 400 },
      ],
      [],
      size,
      8,
    );
    expect(out.rects.map((r) => r.id)).toEqual(["a", "b"]);
    for (const r of out.rects) {
      expect(r.x).toBeGreaterThanOrEqual(-0.001);
      expect(r.y).toBeGreaterThanOrEqual(-0.001);
      expect(r.x + r.width).toBeLessThanOrEqual(size.width + 0.001);
      expect(r.y + r.height).toBeLessThanOrEqual(size.height + 0.001);
    }
  });

  it("emits a line per edge from source center to target center", () => {
    const out = thumbnailLayout(
      [
        { id: "a", x: 0, y: 0, width: 100, height: 100 },
        { id: "b", x: 300, y: 0, width: 100, height: 100 },
      ],
      [{ sourceNodeId: "a", targetNodeId: "b" }],
      size,
    );
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].x1).toBeLessThan(out.lines[0].x2);
  });

  it("drops edges whose endpoints are missing", () => {
    const out = thumbnailLayout(
      [{ id: "a", x: 0, y: 0, width: 100, height: 100 }],
      [{ sourceNodeId: "a", targetNodeId: "ghost" }],
      size,
    );
    expect(out.lines).toHaveLength(0);
  });
});
