// src/features/canvas/ZoomControls.tsx
import { View } from "react-native";

import { Button } from "@/src/components/react-native-reusables/button";
import { Icon } from "@/src/components/react-native-reusables/icon";
import { Text } from "@/src/components/react-native-reusables/text";

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFit: () => void;
}

/** Top-bar zoom controls: -, percentage (reset to 100%), +, and fit-to-content. */
export function ZoomControls({ zoom, onZoomIn, onZoomOut, onResetZoom, onFit }: ZoomControlsProps) {
  const percent = `${Math.round(zoom * 100)}%`;
  return (
    <View className="flex-row items-center gap-1 rounded-lg border border-border bg-card p-1">
      <Button
        testID="zoom-out"
        variant="ghost"
        size="icon"
        accessibilityLabel="Zoom out"
        onPress={onZoomOut}
      >
        <Icon name="remove" className="size-5 text-foreground" />
      </Button>
      <Button
        testID="zoom-reset"
        variant="ghost"
        size="sm"
        accessibilityLabel={`Zoom ${percent}, tap to reset to 100%`}
        onPress={onResetZoom}
      >
        <Text className="tabular-nums">{percent}</Text>
      </Button>
      <Button
        testID="zoom-in"
        variant="ghost"
        size="icon"
        accessibilityLabel="Zoom in"
        onPress={onZoomIn}
      >
        <Icon name="add" className="size-5 text-foreground" />
      </Button>
      <Button
        testID="zoom-fit"
        variant="ghost"
        size="icon"
        accessibilityLabel="Fit to content"
        onPress={onFit}
      >
        <Icon name="fit-screen" className="size-5 text-foreground" />
      </Button>
    </View>
  );
}
