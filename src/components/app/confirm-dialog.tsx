import type { ReactNode } from "react";
import { ActivityIndicator, Modal, View } from "react-native";

import { Button } from "@/src/components/react-native-reusables/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/react-native-reusables/card";
import { Text } from "@/src/components/react-native-reusables/text";
import { useReduceMotionEnabled } from "@/src/lib/accessibility";

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isPending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isPending = false,
  error,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const reduceMotionEnabled = useReduceMotionEnabled();

  return (
    <Modal
      animationType={reduceMotionEnabled ? "none" : "fade"}
      onRequestClose={onCancel}
      transparent
      visible={visible}
    >
      <View className="flex-1 items-center justify-center bg-black/50 p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            {message ? <CardDescription>{message}</CardDescription> : null}
          </CardHeader>
          <CardContent>
            <View className="gap-3">
              {children ?? null}
              {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
              <Button
                disabled={isPending}
                onPress={onCancel}
                testID="confirm-dialog-cancel"
                variant="secondary"
              >
                <Text>{cancelLabel}</Text>
              </Button>
              <Button
                disabled={isPending}
                onPress={onConfirm}
                testID="confirm-dialog-confirm"
                variant="destructive"
              >
                {isPending ? <ActivityIndicator color="#ffffff" /> : null}
                <Text>{confirmLabel}</Text>
              </Button>
            </View>
          </CardContent>
        </Card>
      </View>
    </Modal>
  );
}
