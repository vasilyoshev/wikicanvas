import { createRef } from "react";
import { TextInput } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { Input } from "@/src/components/react-native-reusables/input";

describe("Input", () => {
  it("renders and emits onChangeText", () => {
    const onChangeText = jest.fn();
    render(<Input testID="field" onChangeText={onChangeText} placeholder="Search" />);
    fireEvent.changeText(screen.getByTestId("field"), "hello");
    expect(onChangeText).toHaveBeenCalledWith("hello");
  });

  it("forwards a ref to the underlying TextInput", () => {
    const ref = createRef<TextInput>();
    render(<Input ref={ref} testID="field" />);
    expect(ref.current).not.toBeNull();
  });
});
