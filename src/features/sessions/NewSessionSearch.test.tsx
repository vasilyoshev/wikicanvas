// src/features/sessions/NewSessionSearch.test.tsx
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { NewSessionSearch } from "@/src/features/sessions/NewSessionSearch";
import { searchTitles } from "@/src/features/wikipedia/client";
import { parseArticleInput } from "@/src/features/wikipedia/links";
import type { SearchResult } from "@/src/features/wikipedia/types";

jest.mock("@/src/features/wikipedia/client", () => ({ searchTitles: jest.fn() }));
jest.mock("@/src/features/wikipedia/links", () => ({ parseArticleInput: jest.fn() }));

const mockSearchTitles = searchTitles as jest.MockedFunction<typeof searchTitles>;
const mockParseArticleInput = parseArticleInput as jest.MockedFunction<typeof parseArticleInput>;

const results: SearchResult[] = [
  {
    lang: "en",
    title: "Eiffel Tower",
    description: "famous iron lattice tower",
    thumbnailUrl: null,
  },
  { lang: "en", title: "Eiffel (programming language)", description: null, thumbnailUrl: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockParseArticleInput.mockReturnValue(null);
});

describe("NewSessionSearch", () => {
  it("renders the search input when visible=true", () => {
    mockSearchTitles.mockResolvedValue([]);
    const { getByTestId } = render(
      <NewSessionSearch visible onCancel={jest.fn()} onPick={jest.fn()} />,
    );
    expect(getByTestId("new-session-search-input")).toBeTruthy();
  });

  it("does NOT render the search input when visible=false", () => {
    const { queryByTestId } = render(
      <NewSessionSearch visible={false} onCancel={jest.fn()} onPick={jest.fn()} />,
    );
    expect(queryByTestId("new-session-search-input")).toBeNull();
  });

  it("searches as you type and renders suggestions", async () => {
    mockSearchTitles.mockResolvedValue(results);
    const onPick = jest.fn();
    const { getByTestId, getByText } = render(
      <NewSessionSearch visible onCancel={jest.fn()} onPick={onPick} />,
    );

    fireEvent.changeText(getByTestId("new-session-search-input"), "Eiffel");

    await waitFor(() => expect(mockSearchTitles).toHaveBeenCalledWith("en", "Eiffel"));
    await waitFor(() => expect(getByText("Eiffel Tower")).toBeTruthy());
    expect(getByText("Eiffel (programming language)")).toBeTruthy();
  });

  it("calls onPick with parsed lang+title when submitting a pasted URL/title", async () => {
    mockParseArticleInput.mockReturnValue({ lang: "fr", title: "Tour Eiffel" });
    const onPick = jest.fn();
    const { getByTestId } = render(
      <NewSessionSearch visible onCancel={jest.fn()} onPick={onPick} />,
    );

    const input = getByTestId("new-session-search-input");
    fireEvent.changeText(input, "https://fr.wikipedia.org/wiki/Tour_Eiffel");
    fireEvent(input, "submitEditing");

    expect(mockParseArticleInput).toHaveBeenCalledWith(
      "https://fr.wikipedia.org/wiki/Tour_Eiffel",
      "en",
    );
    expect(onPick).toHaveBeenCalledWith({ lang: "fr", title: "Tour Eiffel" });
  });

  it("calls onPick when a search result row is pressed", async () => {
    mockSearchTitles.mockResolvedValue(results);
    const onPick = jest.fn();
    const { getByTestId, getByText } = render(
      <NewSessionSearch visible onCancel={jest.fn()} onPick={onPick} />,
    );

    fireEvent.changeText(getByTestId("new-session-search-input"), "Eiffel");
    await waitFor(() => expect(getByText("Eiffel Tower")).toBeTruthy());

    fireEvent.press(getByTestId("new-session-result-0"));
    expect(onPick).toHaveBeenCalledWith({ lang: "en", title: "Eiffel Tower" });
  });
});
