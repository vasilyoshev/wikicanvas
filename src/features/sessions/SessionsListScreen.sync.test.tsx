// src/features/sessions/SessionsListScreen.sync.test.tsx
import { fireEvent, render } from "@testing-library/react-native";

import { SessionsListScreen } from "@/src/features/sessions/SessionsListScreen";
import { runSyncSignIn } from "@/src/features/sync/use-sync";
import { useSession } from "@/src/providers/session-provider";
import { useSessionsList } from "@/src/features/sessions/queries";

jest.mock("@/src/features/sync/use-sync", () => ({ runSyncSignIn: jest.fn() }));
jest.mock("@/src/providers/session-provider", () => ({ useSession: jest.fn() }));
jest.mock("@/src/features/sessions/NewSessionSearch", () => ({
  NewSessionSearch: () => null,
}));
jest.mock("@/src/features/sessions/SessionCard", () => ({
  SessionCard: () => null,
}));
jest.mock("@/src/features/sessions/queries", () => ({
  useSessionsList: jest.fn(),
  useCreateSession: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false })),
  useRenameSession: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false })),
  useDeleteSession: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false })),
  sessionKeys: { all: ["sessions"] },
}));

const mockRunSyncSignIn = jest.mocked(runSyncSignIn);
const mockUseSession = jest.mocked(useSession);
const mockUseSessionsList = jest.mocked(useSessionsList);

describe("SessionsListScreen — sign-in-to-sync wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunSyncSignIn.mockResolvedValue(undefined);
    mockUseSession.mockReturnValue({ user: null } as unknown as ReturnType<typeof useSession>);
    mockUseSessionsList.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useSessionsList>);
  });

  it("calls runSyncSignIn when the sign-in-sync button is pressed", () => {
    const { getByTestId } = render(<SessionsListScreen />);
    fireEvent.press(getByTestId("sign-in-sync"));
    expect(mockRunSyncSignIn).toHaveBeenCalledTimes(1);
  });
});
