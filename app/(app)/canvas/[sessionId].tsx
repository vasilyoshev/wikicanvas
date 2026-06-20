import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Text } from "@/src/components/react-native-reusables/text";

export default function CanvasScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  return (
    <SafeAreaView className="flex-1 bg-background" testID="canvas-screen">
      <View className="flex-1 items-center justify-center gap-2 p-6">
        <Text variant="h2">Canvas</Text>
        <Text variant="muted">Session {sessionId}</Text>
      </View>
    </SafeAreaView>
  );
}
