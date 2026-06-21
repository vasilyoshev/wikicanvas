// src/features/canvas/AddArticleSearch.test.tsx
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { AddArticleSearch } from "@/src/features/canvas/AddArticleSearch";
import { searchTitles } from "@/src/features/wikipedia/client";
import { parseArticleInput } from "@/src/features/wikipedia/links";
import type { SearchResult } from "@/src/features/wikipedia/types";

jest.mock("@/src/features/wikipedia/client", () => ({ searchTitles: jest.fn() }));
jest.mock("@/src/features/wikipedia/links", () => ({ parseArticleInput: jest.fn() }));

const mockSearchTitles = searchTitles as jest.MockedFunction<typeof searchTitles>;
const mockParseArticleInput = parseArticleInput as jest.MockedFunction<typeof parseArticleInput>;

const results: SearchResult[] = [
  { lang: "en", title: "Dog", description: "domestic animal", thumbnailUrl: null },
  { lang: "en", title: "Dog breed", description: null, thumbnailUrl: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  // Default: input is not a pasted article URL/title.
  mockParseArticleInput.mockReturnValue(null);
});

describe("AddArticleSearch", () => {
  it("searches as you type and renders suggestions", async () => {
    mockSearchTitles.mockResolvedValue(results);
    const onPick = jest.fn();
    const { getByTestId, getByText } = render(<AddArticleSearch lang="en" onPick={onPick} />);

    fireEvent.changeText(getByTestId("add-article-input"), "dog");

    await waitFor(() => expect(mockSearchTitles).toHaveBeenCalledWith("en", "dog"));
    await waitFor(() => expect(getByText("Dog")).toBeTruthy());
    expect(getByText("Dog breed")).toBeTruthy();
  });

  it("picks a suggestion via onPick with lang+title", async () => {
    mockSearchTitles.mockResolvedValue(results);
    const onPick = jest.fn();
    const { getByTestId, getByText } = render(<AddArticleSearch lang="en" onPick={onPick} />);

    fireEvent.changeText(getByTestId("add-article-input"), "dog");
    await waitFor(() => expect(getByText("Dog")).toBeTruthy());

    fireEvent.press(getByText("Dog"));
    expect(onPick).toHaveBeenCalledWith({ lang: "en", title: "Dog" });
  });

  it("when the input parses as a pasted Wikipedia URL/title, offers a direct add and skips search picks", async () => {
    mockParseArticleInput.mockReturnValue({ lang: "de", title: "Hund" });
    const onPick = jest.fn();
    const { getByTestId, getByText } = render(<AddArticleSearch lang="en" onPick={onPick} />);

    fireEvent.changeText(getByTestId("add-article-input"), "https://de.wikipedia.org/wiki/Hund");

    await waitFor(() =>
      expect(mockParseArticleInput).toHaveBeenCalledWith(
        "https://de.wikipedia.org/wiki/Hund",
        "en",
      ),
    );
    // A direct "open this article" row appears using the parsed title.
    const directRow = getByText("Open “Hund”");
    fireEvent.press(directRow);
    expect(onPick).toHaveBeenCalledWith({ lang: "de", title: "Hund" });
  });

  it("does not search for empty/whitespace input", async () => {
    const onPick = jest.fn();
    const { getByTestId } = render(<AddArticleSearch lang="en" onPick={onPick} />);

    fireEvent.changeText(getByTestId("add-article-input"), "   ");

    // Give any async effect a tick; assert no search fired.
    await waitFor(() => expect(mockSearchTitles).not.toHaveBeenCalled());
  });
});
