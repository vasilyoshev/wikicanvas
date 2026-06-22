// src/features/sessions/queries.ts
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  listSessions,
  getSessionBundle,
  createSession,
  renameSession,
  deleteSession,
  updateViewport,
  updateNodeGeometry,
  addNode,
  addEdge,
  deleteNode,
} from "@/src/features/sessions/local-repository";
import type {
  Session,
  Node,
  Edge,
  Viewport,
  NodeGeometry,
  NodeInput,
  EdgeInput,
  SessionSummary,
  SessionBundle,
} from "@/src/features/sessions/types";
import { syncBus } from "@/src/lib/sync-bus";
import { useSession } from "@/src/providers/session-provider";

/** Canonical query keys. Created ONCE here; later phases import, never redeclare. */
export const sessionKeys = {
  all: ["sessions"] as const,
  list: (userId: string | null) => ["sessions", "list", userId ?? "anonymous"] as const,
  bundle: (sessionId: string) => ["sessions", "bundle", sessionId] as const,
};

/** Sessions list scoped by current auth user: anon-only when signed out, owned sessions when signed in. */
export function useSessionsList(): UseQueryResult<SessionSummary[], Error> {
  const { user } = useSession();
  return useQuery({
    queryKey: sessionKeys.list(user?.id ?? null),
    queryFn: () => listSessions(user?.id ?? null),
  });
}

export function useSessionBundle(sessionId: string): UseQueryResult<SessionBundle, Error> {
  return useQuery({
    queryKey: sessionKeys.bundle(sessionId),
    queryFn: async () => {
      const bundle = await getSessionBundle(sessionId);
      if (!bundle) throw new Error("Session not found");
      return bundle;
    },
    enabled: Boolean(sessionId),
  });
}

export function useCreateSession(): UseMutationResult<
  Session,
  Error,
  { title: string; root: { lang: string; articleTitle: string } }
> {
  const queryClient = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async ({ title, root }) => {
      // Stamp the current owner so a signed-in user's new session is theirs (shows
      // in their list, syncs to their account) — not an orphaned anonymous row.
      const bundle = await createSession(user?.id ?? null, title, root);
      return bundle.session;
    },
    onSuccess: (session) => {
      syncBus.notify(session.id);
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
  });
}

export function useRenameSession(): UseMutationResult<
  void,
  Error,
  { sessionId: string; title: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, title }) => {
      await renameSession(sessionId, title);
    },
    onSuccess: (_data, { sessionId }) => {
      syncBus.notify(sessionId);
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      void queryClient.invalidateQueries({ queryKey: sessionKeys.bundle(sessionId) });
    },
  });
}

export function useDeleteSession(): UseMutationResult<void, Error, { sessionId: string }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId }) => {
      await deleteSession(sessionId);
    },
    onSuccess: (_data, { sessionId }) => {
      syncBus.notify(sessionId);
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
  });
}

export function useUpdateViewport(): UseMutationResult<
  void,
  Error,
  { sessionId: string; viewport: Viewport }
> {
  return useMutation({
    mutationFn: async ({ sessionId, viewport }) => {
      await updateViewport(sessionId, viewport);
    },
    onSuccess: (_data, { sessionId }) => {
      syncBus.notify(sessionId);
    },
  });
}

export function useUpdateNodeGeometry(): UseMutationResult<
  void,
  Error,
  { sessionId: string; nodeId: string; geom: NodeGeometry }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, nodeId, geom }) => {
      await updateNodeGeometry(sessionId, nodeId, geom);
    },
    // Optimistically advance the cached bundle so the node keeps its committed
    // geometry the instant the in-gesture live override is cleared (no snap-back).
    onMutate: ({ sessionId, nodeId, geom }) => {
      queryClient.setQueryData<SessionBundle>(sessionKeys.bundle(sessionId), (old) =>
        old
          ? { ...old, nodes: old.nodes.map((n) => (n.id === nodeId ? { ...n, ...geom } : n)) }
          : old,
      );
    },
    onSuccess: (_data, { sessionId }) => {
      syncBus.notify(sessionId);
    },
  });
}

export function useAddNode(): UseMutationResult<
  Node,
  Error,
  { sessionId: string; node: NodeInput }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, node }) => addNode(sessionId, node),
    onSuccess: (_node, { sessionId }) => {
      syncBus.notify(sessionId);
      void queryClient.invalidateQueries({ queryKey: sessionKeys.bundle(sessionId) });
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
  });
}

export function useDeleteNode(): UseMutationResult<
  void,
  Error,
  { sessionId: string; nodeId: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, nodeId }) => deleteNode(sessionId, nodeId),
    // Optimistically drop the node (and its edges) so the window disappears instantly.
    onMutate: ({ sessionId, nodeId }) => {
      queryClient.setQueryData<SessionBundle>(sessionKeys.bundle(sessionId), (old) =>
        old
          ? {
              ...old,
              nodes: old.nodes.filter((n) => n.id !== nodeId),
              edges: old.edges.filter(
                (e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId,
              ),
            }
          : old,
      );
    },
    onSuccess: (_data, { sessionId }) => {
      syncBus.notify(sessionId);
      void queryClient.invalidateQueries({ queryKey: sessionKeys.bundle(sessionId) });
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
  });
}

export function useAddEdge(): UseMutationResult<
  Edge,
  Error,
  { sessionId: string; edge: EdgeInput }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, edge }) => addEdge(sessionId, edge),
    onSuccess: (_edge, { sessionId }) => {
      syncBus.notify(sessionId);
      void queryClient.invalidateQueries({ queryKey: sessionKeys.bundle(sessionId) });
      // addEdge bumps the session clock; refresh the list so the "edited …" label
      // and ordering stay current after an edge-only (de-duped) link spawn.
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
  });
}
