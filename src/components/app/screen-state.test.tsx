import { render, screen } from "@testing-library/react-native";
import { Text } from "@/src/components/react-native-reusables/text";

import { EmptyState, LoadingState } from "@/src/components/app/screen-state";

describe("screen-state", () => {
  it("LoadingState renders its label", () => {
    render(<LoadingState label="Loading sessions" />);
    expect(screen.getByText("Loading sessions")).toBeTruthy();
  });

  it("LoadingState renders without a label", () => {
    render(<LoadingState />);
    expect(screen.UNSAFE_getByType(require("react-native").ActivityIndicator)).toBeTruthy();
  });

  it("EmptyState renders title, description and action", () => {
    render(
      <EmptyState
        title="No sessions yet"
        description="Start exploring Wikipedia"
        action={<Text>New session</Text>}
      />,
    );
    expect(screen.getByText("No sessions yet")).toBeTruthy();
    expect(screen.getByText("Start exploring Wikipedia")).toBeTruthy();
    expect(screen.getByText("New session")).toBeTruthy();
  });
});
