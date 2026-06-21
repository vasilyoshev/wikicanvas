// src/features/canvas/spawn-placement.test.ts
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  placeChildNode,
} from "@/src/features/canvas/spawn-placement";
import type { NodeBounds } from "@/src/features/canvas/types";

const source: NodeBounds = { x: 100, y: 100, width: 380, height: 520 };

describe("placeChildNode", () => {
  it("exposes sane default dimensions", () => {
    expect(DEFAULT_NODE_WIDTH).toBe(380);
    expect(DEFAULT_NODE_HEIGHT).toBe(520);
  });

  it("places the child to the right of the source with the default gap when nothing else exists", () => {
    const placed = placeChildNode(source, []);
    expect(placed).toEqual({
      x: source.x + source.width + 40, // default gap 40
      y: source.y,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    });
  });

  it("honours a custom size and gap", () => {
    const placed = placeChildNode(source, [], { width: 200, height: 300 }, 10);
    expect(placed).toEqual({
      x: source.x + source.width + 10,
      y: source.y,
      width: 200,
      height: 300,
    });
  });

  it("never overlaps the source itself", () => {
    // Source is the only existing node; the candidate must clear it.
    const placed = placeChildNode(source, [source]);
    expect(placed.x).toBe(source.x + source.width + 40);
    expect(placed.y).toBe(source.y); // to the right, no overlap, so no vertical nudge
  });

  it("nudges down when the right slot is occupied by an existing node", () => {
    const occupant: NodeBounds = {
      x: source.x + source.width + 40,
      y: source.y,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    };
    const placed = placeChildNode(source, [occupant]);
    expect(placed.x).toBe(source.x + source.width + 40);
    // Pushed below the occupant by exactly its height + gap.
    expect(placed.y).toBe(occupant.y + occupant.height + 40);
  });

  it("keeps nudging down past a stack of occupants until a free slot is found", () => {
    const x = source.x + source.width + 40;
    const first: NodeBounds = {
      x,
      y: source.y,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    };
    const second: NodeBounds = {
      x,
      y: first.y + first.height + 40,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    };
    const placed = placeChildNode(source, [first, second]);
    expect(placed.x).toBe(x);
    expect(placed.y).toBe(second.y + second.height + 40);
  });

  it("ignores existing nodes that do not horizontally overlap the right slot", () => {
    // An existing node far to the left/below the right slot must not nudge the child.
    const farAway: NodeBounds = { x: -1000, y: -1000, width: 50, height: 50 };
    const placed = placeChildNode(source, [farAway]);
    expect(placed.y).toBe(source.y);
  });

  it("treats edge-touching rectangles as non-overlapping (open interval)", () => {
    // An occupant whose bottom edge exactly meets the candidate top must not count as overlap.
    const x = source.x + source.width + 40;
    const occupant: NodeBounds = {
      x,
      y: source.y - DEFAULT_NODE_HEIGHT, // its bottom edge == candidate's top edge
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    };
    const placed = placeChildNode(source, [occupant]);
    expect(placed.y).toBe(source.y);
  });
});
