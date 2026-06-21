// src/features/canvas/use-canvas-store.ts
import { create } from "zustand";

import type { Viewport } from "@/src/features/canvas/types";
import { clampZoom } from "@/src/features/canvas/viewport";

interface CanvasState {
  viewport: Viewport;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  /** Render order; last element is drawn on top. */
  nodeOrder: string[];
  /** Ids with a transient "new" highlight. */
  newNodeIds: Set<string>;
  draggingNodeId: string | null;
  resizingNodeId: string | null;

  setViewport: (viewport: Viewport) => void;
  selectNode: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  bringToFront: (nodeId: string) => void;
  setNodeOrder: (ids: string[]) => void;
  markNew: (nodeId: string) => void;
  clearNew: (nodeId: string) => void;
  setDragging: (id: string | null) => void;
  setResizing: (id: string | null) => void;
  reset: () => void;
}

const INITIAL = {
  viewport: { x: 0, y: 0, zoom: 1 } as Viewport,
  selectedNodeId: null as string | null,
  hoveredNodeId: null as string | null,
  nodeOrder: [] as string[],
  draggingNodeId: null as string | null,
  resizingNodeId: null as string | null,
};

function moveToEnd(order: string[], id: string): string[] {
  const without = order.filter((existing) => existing !== id);
  without.push(id);
  return without;
}

export const useCanvasStore = create<CanvasState>((set) => ({
  ...INITIAL,
  newNodeIds: new Set<string>(),

  setViewport: (viewport) =>
    set({ viewport: { x: viewport.x, y: viewport.y, zoom: clampZoom(viewport.zoom) } }),

  selectNode: (id) =>
    set((state) =>
      id === null
        ? { selectedNodeId: null }
        : { selectedNodeId: id, nodeOrder: moveToEnd(state.nodeOrder, id) },
    ),

  setHovered: (id) => set({ hoveredNodeId: id }),

  bringToFront: (nodeId) => set((state) => ({ nodeOrder: moveToEnd(state.nodeOrder, nodeId) })),

  setNodeOrder: (ids) => set({ nodeOrder: [...ids] }),

  markNew: (nodeId) =>
    set((state) => {
      const next = new Set(state.newNodeIds);
      next.add(nodeId);
      return { newNodeIds: next };
    }),

  clearNew: (nodeId) =>
    set((state) => {
      if (!state.newNodeIds.has(nodeId)) return {};
      const next = new Set(state.newNodeIds);
      next.delete(nodeId);
      return { newNodeIds: next };
    }),

  setDragging: (id) => set({ draggingNodeId: id }),
  setResizing: (id) => set({ resizingNodeId: id }),

  reset: () => set({ ...INITIAL, newNodeIds: new Set<string>() }),
}));
