// app/(auth)/sign-up.sync.test.tsx
import { fireEvent, render } from "@testing-library/react-native";

import SignUpScreen from "@/app/(auth)/sign-up";
import { runSyncSignIn } from "@/src/features/sync/use-sync";

jest.mock("@/src/features/sync/use-sync", () => ({ runSyncSignIn: jest.fn() }));

const mockRunSyncSignIn = jest.mocked(runSyncSignIn);

describe("(auth) Google sign-in -> sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunSyncSignIn.mockResolvedValue(undefined);
  });

  it("calls runSyncSignIn when the Google button is pressed", () => {
    const { getByTestId } = render(<SignUpScreen />);
    fireEvent.press(getByTestId("google-sign-in"));
    expect(mockRunSyncSignIn).toHaveBeenCalledTimes(1);
  });
});
