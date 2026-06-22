import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/src/components/react-native-reusables/button";
import { Text } from "@/src/components/react-native-reusables/text";
import { runSyncSignIn } from "@/src/features/sync/use-sync";

export default function SignUpScreen() {
  const handleGoogleSync = () => {
    void runSyncSignIn().catch((error) => {
      console.warn("[sync] google sign-in failed", error);
    });
  };

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-background p-6">
      <View className="w-full max-w-sm gap-6">
        <View className="gap-2">
          <Text className="text-center text-3xl font-bold">Welcome to WikiCanvas</Text>
          <Text className="text-center text-muted-foreground">
            Sign in to sync your sessions across devices.
          </Text>
        </View>

        <Button testID="google-sign-in" onPress={handleGoogleSync}>
          <Text>Continue with Google</Text>
        </Button>
      </View>
    </SafeAreaView>
  );
}
