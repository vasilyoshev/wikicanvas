import { useLocalSearchParams } from "expo-router";

import { CanvasScreen } from "@/src/features/canvas/CanvasScreen";

export default function CanvasRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return <CanvasScreen sessionId={sessionId} />;
}
