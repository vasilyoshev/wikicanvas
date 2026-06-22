// src/providers/app-providers.test.tsx
import { render } from "@testing-library/react-native";
import { Text } from "react-native";

import { AppProviders } from "@/src/providers/app-providers";
import { useSync } from "@/src/features/sync/use-sync";

jest.mock("@/src/features/sync/use-sync", () => ({ useSync: jest.fn() }));

const mockUseSync = jest.mocked(useSync);

describe("AppProviders", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders children", () => {
    const { getByText } = render(
      <AppProviders>
        <Text>hello</Text>
      </AppProviders>,
    );
    expect(getByText("hello")).toBeTruthy();
  });

  it("mounts the sync gate (calls useSync once)", () => {
    render(
      <AppProviders>
        <Text>hello</Text>
      </AppProviders>,
    );
    expect(mockUseSync).toHaveBeenCalledTimes(1);
  });
});
