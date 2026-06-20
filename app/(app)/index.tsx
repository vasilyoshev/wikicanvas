import { Linking, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { Button } from "@/src/components/react-native-reusables/button";
import { Text } from "@/src/components/react-native-reusables/text";
import { EmptyState } from "@/src/components/app/screen-state";
import { appEnv } from "@/src/lib/env";

export default function SessionsListScreen() {
  const { t } = useTranslation("common");

  return (
    <SafeAreaView className="flex-1 bg-background" testID="sessions-list-screen">
      <View className="flex-1 items-center justify-center gap-6 p-6">
        <Text variant="h1">WikiCanvas</Text>
        <EmptyState
          icon="map"
          title="No sessions yet"
          description="Start an exploration from a Wikipedia article."
        />
        <Button
          onPress={() => void Linking.openURL(appEnv.githubRepoUrl)}
          testID="source-code-link"
          variant="link"
        >
          <Text>{t("sourceCode")}</Text>
        </Button>
      </View>
    </SafeAreaView>
  );
}
