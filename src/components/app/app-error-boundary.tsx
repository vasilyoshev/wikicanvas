import { Component, type ErrorInfo, type ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/src/components/react-native-reusables/button";
import { Text } from "@/src/components/react-native-reusables/text";
import i18n from "@/src/i18n";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center gap-4 p-6">
          <Text variant="h2">{i18n.t("errors:fallback.title")}</Text>
          <Text variant="muted" className="text-center">
            {i18n.t("errors:fallback.description")}
          </Text>
          <Button onPress={this.handleReset} variant="secondary">
            <Text>{i18n.t("errors:fallback.retry")}</Text>
          </Button>
        </View>
      </SafeAreaView>
    );
  }
}
