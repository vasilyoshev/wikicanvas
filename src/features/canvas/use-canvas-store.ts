// src/features/canvas/use-canvas-store.ts
import { create } from "zustand";

import type { NodeBounds, Viewport } from "@/src/features/canvas/types";
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
  /**
   * Transient per-node geometry while a drag/resize gesture is in flight. This is
   * the render source during a gesture so the node tracks the pointer without a
   * per-frame persistence round-trip; it is cleared on gesture end once the final
   * geometry has been committed to the query cache + store.
   */
  liveBounds: Record<string, NodeBounds>;
  /**
   * Last reported article scroll offset (px) per node id. Local UI state, never synced;
   * survives `reset()` (kept out of INITIAL) so a node's reading position is restored
   * when it re-mounts — after virtualization, a theme switch, or reopening the session.
   */
  scrollByNodeId: Record<string, number>;

  setViewport: (viewport: Viewport) => void;
  selectNode: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  bringToFront: (nodeId: string) => void;
  setNodeOrder: (ids: string[]) => void;
  /** Reconcile order against the live node set: keep existing z-order, append new ids, drop removed. */
  syncNodeOrder: (ids: string[]) => void;
  markNew: (nodeId: string) => void;
  clearNew: (nodeId: string) => void;
  setDragging: (id: string | null) => void;
  setResizing: (id: string | null) => void;
  setLiveBounds: (nodeId: string, bounds: NodeBounds) => void;
  clearLiveBounds: (nodeId: string) => void;
  setScroll: (nodeId: string, scrollY: number) => void;
  /** Bulk-load persisted offsets at launch; offsets captured this run take precedence. */
  hydrateScroll: (entries: Record<string, number>) => void;
  /** Drop a node's saved offset (e.g. when the node is deleted). */
  clearScroll: (nodeId: string) => void;
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
  liveBounds: {},
  scrollByNodeId: {},

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

  syncNodeOrder: (ids) =>
    set((state) => {
      const present = new Set(ids);
      const kept = state.nodeOrder.filter((id) => present.has(id));
      const keptSet = new Set(kept);
      const added = ids.filter((id) => !keptSet.has(id));
      return { nodeOrder: [...kept, ...added] };
    }),

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

  setLiveBounds: (nodeId, bounds) =>
    set((state) => ({ liveBounds: { ...state.liveBounds, [nodeId]: bounds } })),

  clearLiveBounds: (nodeId) =>
    set((state) => {
      if (!(nodeId in state.liveBounds)) return {};
      const next = { ...state.liveBounds };
      delete next[nodeId];
      return { liveBounds: next };
    }),

  setScroll: (nodeId, scrollY) =>
    set((state) => {
      const y = Math.max(0, Math.round(scrollY));
      if (state.scrollByNodeId[nodeId] === y) return {};
      return { scrollByNodeId: { ...state.scrollByNodeId, [nodeId]: y } };
    }),

  hydrateScroll: (entries) =>
    set((state) => ({ scrollByNodeId: { ...entries, ...state.scrollByNodeId } })),

  clearScroll: (nodeId) =>
    set((state) => {
      if (!(nodeId in state.scrollByNodeId)) return {};
      const next = { ...state.scrollByNodeId };
      delete next[nodeId];
      return { scrollByNodeId: next };
    }),

  // Note: scrollByNodeId is intentionally preserved so a node restores its scroll on
  // re-mount; node ids are globally unique, so retained entries can't collide.
  reset: () => set({ ...INITIAL, newNodeIds: new Set<string>(), liveBounds: {} }),
}));
