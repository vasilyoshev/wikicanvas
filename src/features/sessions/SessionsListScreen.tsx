// src/features/sessions/SessionsListScreen.tsx
import { router } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";

import { appEnv } from "@/src/lib/env";

import { ConfirmDialog } from "@/src/components/app/confirm-dialog";
import { EmptyState, LoadingState } from "@/src/components/app/screen-state";
import { Button } from "@/src/components/react-native-reusables/button";
import { Card } from "@/src/components/react-native-reusables/card";
import { Icon } from "@/src/components/react-native-reusables/icon";
import { Input } from "@/src/components/react-native-reusables/input";
import { Text } from "@/src/components/react-native-reusables/text";
import {
  useCreateSession,
  useDeleteSession,
  useRenameSession,
  useSessionsList,
} from "@/src/features/sessions/queries";
import { NewSessionSearch } from "@/src/features/sessions/NewSessionSearch";
import { SessionCard } from "@/src/features/sessions/SessionCard";
import { useSession } from "@/src/providers/session-provider";

export default function SessionsListScreen() {
  const { t } = useTranslation("common");
  const { user } = useSession();
  const { data: summaries, isLoading } = useSessionsList();
  const createSession = useCreateSession();
  const renameSession = useRenameSession();
  const deleteSession = useDeleteSession();

  const [searchOpen, setSearchOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Phase 7 owns sync wiring; this is a placeholder handler the button calls.
  const handleSignInToSync = () => {};

  const openSession = (sessionId: string) => router.push(`/canvas/${sessionId}`);

  const handlePick = async (pick: { lang: string; title: string }) => {
    setSearchOpen(false);
    const session = await createSession.mutateAsync({
      title: pick.title,
      root: { lang: pick.lang, articleTitle: pick.title },
    });
    openSession(session.id);
  };

  const beginRename = (sessionId: string) => {
    const target = (summaries ?? []).find((s) => s.id === sessionId);
    setRenameTarget({ id: sessionId, title: target?.title ?? "" });
    setRenameValue(target?.title ?? "");
  };

  const confirmRename = async () => {
    if (!renameTarget) return;
    const title = renameValue.trim();
    if (title.length === 0) return;
    await renameSession.mutateAsync({ sessionId: renameTarget.id, title });
    setRenameTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteSession.mutateAsync({ sessionId: deleteTarget });
    setDeleteTarget(null);
  };

  const sessions = summaries ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerClassName="grow gap-6 p-4">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-2xl font-bold">Your sessions</Text>
          {user ? null : (
            <Button testID="sign-in-sync" variant="secondary" onPress={handleSignInToSync}>
              <Text>Sign in to sync</Text>
            </Button>
          )}
        </View>

        {isLoading ? (
          <LoadingState label="Loading your sessions" />
        ) : (
          <View className="flex-row flex-wrap gap-4">
            <Pressable
              testID="new-session-card"
              accessibilityRole="button"
              onPress={() => setSearchOpen(true)}
            >
              <Card className="h-[212px] w-60 items-center justify-center gap-2 border-dashed">
                <Icon name="add" className="size-8 text-muted-foreground" />
                <Text variant="muted">New session</Text>
              </Card>
            </Pressable>

            {sessions.length === 0 ? (
              <View className="flex-1 min-w-[240px]">
                <EmptyState
                  icon="map"
                  title="No sessions yet"
                  description="Start a new session to explore Wikipedia on an infinite canvas."
                />
              </View>
            ) : (
              sessions.map((summary) => (
                <SessionCard
                  key={summary.id}
                  summary={summary}
                  onOpen={openSession}
                  onRename={beginRename}
                  onDelete={setDeleteTarget}
                />
              ))
            )}
          </View>
        )}

        {/* AGPL-3.0: an always-reachable in-app link to the source. */}
        <Button
          onPress={() => void Linking.openURL(appEnv.githubRepoUrl)}
          testID="source-code-link"
          variant="link"
        >
          <Text variant="muted">{t("sourceCode")}</Text>
        </Button>
      </ScrollView>

      <NewSessionSearch
        visible={searchOpen}
        onCancel={() => setSearchOpen(false)}
        onPick={handlePick}
      />

      <ConfirmDialog
        visible={renameTarget !== null}
        title="Rename session"
        confirmLabel="Save"
        cancelLabel="Cancel"
        isPending={renameSession.isPending}
        error={renameSession.error ? "Could not rename. Try again." : null}
        onCancel={() => setRenameTarget(null)}
        onConfirm={confirmRename}
      >
        <Input
          testID="rename-session-input"
          autoFocus
          value={renameValue}
          onChangeText={setRenameValue}
          onSubmitEditing={confirmRename}
          placeholder="Session title"
        />
      </ConfirmDialog>

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Delete session?"
        message="This moves the session to the trash. It can be restored from another device while signed in."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isPending={deleteSession.isPending}
        error={deleteSession.error ? "Could not delete. Try again." : null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </SafeAreaView>
  );
}
