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

/** Canonical query keys. Created ONCE here; later phases import, never redeclare. */
export const sessionKeys = {
  all: ["sessions"] as const,
  list: (userId: string | null) => ["sessions", "list", userId ?? "anonymous"] as const,
  bundle: (sessionId: string) => ["sessions", "bundle", sessionId] as const,
};

/** Local sessions are not curried by userId; LocalStore holds anon (user_id=null) data unconditionally. */
export function useSessionsList(): UseQueryResult<SessionSummary[], Error> {
  return useQuery({
    queryKey: sessionKeys.list(null),
    queryFn: () => listSessions(null),
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
  return useMutation({
    mutationFn: async ({ title, root }) => {
      const bundle = await createSession(null, title, root);
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
  return useMutation({
    mutationFn: async ({ sessionId, nodeId, geom }) => {
      await updateNodeGeometry(sessionId, nodeId, geom);
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
    },
  });
}
