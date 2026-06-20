import { fireEvent, render, screen } from "@testing-library/react-native";

import { ConfirmDialog } from "@/src/components/app/confirm-dialog";

describe("ConfirmDialog", () => {
  it("fires onConfirm and onCancel via testIDs", () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <ConfirmDialog
        visible
        title="Delete session?"
        message="This cannot be undone."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText("Delete session?")).toBeTruthy();
    fireEvent.press(screen.getByTestId("confirm-dialog-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId("confirm-dialog-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("renders an error message when provided", () => {
    render(
      <ConfirmDialog
        visible
        title="Delete session?"
        error="Network error"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByText("Network error")).toBeTruthy();
  });
});
