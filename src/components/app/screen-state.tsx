import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";

import { Card, CardDescription, CardTitle } from "@/src/components/react-native-reusables/card";
import { Icon, type MaterialIconName } from "@/src/components/react-native-reusables/icon";
import { Text } from "@/src/components/react-native-reusables/text";

interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label }: LoadingStateProps) {
  return (
    <View className="items-center justify-center gap-3 p-6">
      <ActivityIndicator />
      {label ? <Text variant="muted">{label}</Text> : null}
    </View>
  );
}

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Card className="w-full max-w-md">
      <View className="items-center gap-4 px-6">
        {icon ? (
          <View className="size-14 items-center justify-center rounded-full bg-muted">
            <Icon name={icon as MaterialIconName} className="size-7 text-muted-foreground" />
          </View>
        ) : null}
        <View className="items-center gap-1.5">
          <CardTitle className="text-center">{title}</CardTitle>
          {description ? (
            <CardDescription className="max-w-[42ch] text-center">{description}</CardDescription>
          ) : null}
        </View>
        {action ? <View className="w-full items-center">{action}</View> : null}
      </View>
    </Card>
  );
}
