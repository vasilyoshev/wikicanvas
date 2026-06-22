import { useEffect, useState } from "react";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { completeAuthRedirect } from "@/src/features/auth/callback";
import { Button } from "@/src/components/react-native-reusables/button";
import { Text } from "@/src/components/react-native-reusables/text";
import { LoadingState } from "@/src/components/app/screen-state";

export default function AuthCallbackScreen() {
  const { t } = useTranslation("common");
  const [error, setError] = useState<string | null>(null);
  // Bumping this re-runs the redirect-completion effect — a real retry of the exchange.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    setError(null);
    Linking.getInitialURL()
      .then(async (initialUrl) => {
        const url = initialUrl ?? (typeof window !== "undefined" ? window.location.href : null);
        if (!url) {
          throw new Error("Missing callback URL.");
        }
        await completeAuthRedirect(url);
        if (mounted) router.replace("/(app)");
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : "Sign-in failed.");
      });
    return () => {
      mounted = false;
    };
  }, [attempt]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center gap-4 p-6">
        {error ? (
          <>
            <Text className="text-center text-destructive">{error}</Text>
            <Button onPress={() => setAttempt((n) => n + 1)} variant="secondary">
              <Text>{t("retry")}</Text>
            </Button>
          </>
        ) : (
          <LoadingState label={t("loading")} />
        )}
      </View>
    </SafeAreaView>
  );
}
