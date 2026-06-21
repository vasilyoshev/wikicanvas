// src/features/sessions/SessionCard.tsx
import { useRef } from "react";
import { Pressable, View } from "react-native";

import { Button } from "@/src/components/react-native-reusables/button";
import { Card } from "@/src/components/react-native-reusables/card";
import { Icon } from "@/src/components/react-native-reusables/icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  type TriggerRef,
} from "@/src/components/react-native-reusables/popover";
import { Text } from "@/src/components/react-native-reusables/text";
import { summarizeSession } from "@/src/features/sessions/session-summary";
import { SessionThumbnail } from "@/src/features/sessions/SessionThumbnail";
import type { SessionSummary } from "@/src/features/sessions/types";

interface SessionCardProps {
  summary: SessionSummary;
  onOpen: (sessionId: string) => void;
  onRename: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
}

export function SessionCard({ summary, onOpen, onRename, onDelete }: SessionCardProps) {
  const triggerRef = useRef<TriggerRef>(null);
  const { windowCount, editedLabel } = summarizeSession(summary);

  const closeAnd = (fn: () => void) => () => {
    triggerRef.current?.close();
    fn();
  };

  return (
    <Card className="w-60 gap-3 p-3">
      <Pressable
        testID={`session-card-${summary.id}`}
        accessibilityRole="button"
        onPress={() => onOpen(summary.id)}
      >
        <SessionThumbnail previewNodes={summary.previewNodes} />
      </Pressable>
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-0.5">
          <Text numberOfLines={1} className="font-semibold">
            {summary.title}
          </Text>
          <Text variant="muted" className="text-xs">
            {windowCount} {windowCount === 1 ? "window" : "windows"} · edited {editedLabel}
          </Text>
        </View>
        <Popover>
          <PopoverTrigger ref={triggerRef} asChild>
            <Button
              testID={`session-menu-${summary.id}`}
              variant="ghost"
              size="icon"
              accessibilityLabel="Session menu"
            >
              <Icon name="more-vert" className="size-5 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-40 gap-1 p-1">
            <Button
              testID={`session-open-${summary.id}`}
              variant="ghost"
              className="justify-start"
              onPress={closeAnd(() => onOpen(summary.id))}
            >
              <Text>Open</Text>
            </Button>
            <Button
              testID={`session-rename-${summary.id}`}
              variant="ghost"
              className="justify-start"
              onPress={closeAnd(() => onRename(summary.id))}
            >
              <Text>Rename</Text>
            </Button>
            <Button
              testID={`session-delete-${summary.id}`}
              variant="ghost"
              className="justify-start"
              onPress={closeAnd(() => onDelete(summary.id))}
            >
              <Text className="text-destructive">Delete</Text>
            </Button>
          </PopoverContent>
        </Popover>
      </View>
    </Card>
  );
}
