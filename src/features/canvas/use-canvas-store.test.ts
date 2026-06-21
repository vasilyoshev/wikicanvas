// src/features/canvas/use-canvas-store.test.ts
import { useCanvasStore } from "@/src/features/canvas/use-canvas-store";

beforeEach(() => {
  useCanvasStore.getState().reset();
});

describe("useCanvasStore", () => {
  it("starts with an identity viewport and empty selection/order", () => {
    const s = useCanvasStore.getState();
    expect(s.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(s.selectedNodeId).toBeNull();
    expect(s.hoveredNodeId).toBeNull();
    expect(s.nodeOrder).toEqual([]);
    expect(s.newNodeIds.size).toBe(0);
  });

  it("setViewport clamps zoom", () => {
    useCanvasStore.getState().setViewport({ x: 10, y: 20, zoom: 999 });
    expect(useCanvasStore.getState().viewport).toEqual({ x: 10, y: 20, zoom: 4 });
  });

  it("selectNode sets selection and brings it to front", () => {
    useCanvasStore.getState().setNodeOrder(["a", "b", "c"]);
    useCanvasStore.getState().selectNode("a");
    const s = useCanvasStore.getState();
    expect(s.selectedNodeId).toBe("a");
    expect(s.nodeOrder).toEqual(["b", "c", "a"]);
  });

  it("selectNode(null) clears selection without reordering", () => {
    useCanvasStore.getState().setNodeOrder(["a", "b"]);
    useCanvasStore.getState().selectNode(null);
    expect(useCanvasStore.getState().selectedNodeId).toBeNull();
    expect(useCanvasStore.getState().nodeOrder).toEqual(["a", "b"]);
  });

  it("bringToFront moves an existing id to the end (top)", () => {
    useCanvasStore.getState().setNodeOrder(["a", "b", "c"]);
    useCanvasStore.getState().bringToFront("a");
    expect(useCanvasStore.getState().nodeOrder).toEqual(["b", "c", "a"]);
  });

  it("bringToFront appends an id not yet in the order", () => {
    useCanvasStore.getState().setNodeOrder(["a", "b"]);
    useCanvasStore.getState().bringToFront("z");
    expect(useCanvasStore.getState().nodeOrder).toEqual(["a", "b", "z"]);
  });

  it("markNew adds and clearNew removes a new-highlight id", () => {
    useCanvasStore.getState().markNew("a");
    expect(useCanvasStore.getState().newNodeIds.has("a")).toBe(true);
    useCanvasStore.getState().clearNew("a");
    expect(useCanvasStore.getState().newNodeIds.has("a")).toBe(false);
  });

  it("setHovered, setDragging and setResizing track transient ids", () => {
    const s = useCanvasStore.getState();
    s.setHovered("a");
    s.setDragging("b");
    s.setResizing("c");
    const next = useCanvasStore.getState();
    expect(next.hoveredNodeId).toBe("a");
    expect(next.draggingNodeId).toBe("b");
    expect(next.resizingNodeId).toBe("c");
  });

  it("reset returns to initial state", () => {
    const s = useCanvasStore.getState();
    s.setViewport({ x: 5, y: 5, zoom: 2 });
    s.selectNode("a");
    s.markNew("a");
    s.reset();
    const next = useCanvasStore.getState();
    expect(next.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(next.selectedNodeId).toBeNull();
    expect(next.newNodeIds.size).toBe(0);
    expect(next.nodeOrder).toEqual([]);
  });
});
