import { fireEvent, render, screen } from "@testing-library/react-native";

import { Button } from "@/src/components/react-native-reusables/button";
import { Text } from "@/src/components/react-native-reusables/text";

describe("Button", () => {
  it("renders its label and fires onPress", () => {
    const onPress = jest.fn();
    render(
      <Button onPress={onPress} testID="btn">
        <Text>Tap me</Text>
      </Button>,
    );
    expect(screen.getByText("Tap me")).toBeTruthy();
    fireEvent.press(screen.getByTestId("btn"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not fire onPress when disabled", () => {
    const onPress = jest.fn();
    render(
      <Button disabled onPress={onPress} testID="btn">
        <Text>Tap me</Text>
      </Button>,
    );
    fireEvent.press(screen.getByTestId("btn"));
    expect(onPress).not.toHaveBeenCalled();
  });
});
