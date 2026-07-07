jest.mock("@/hooks/useResource", () => ({ useResource: jest.fn() }));

import { render, screen, fireEvent } from "@testing-library/react-native";
import { Linking } from "react-native";
import { ResourceDetailScreen } from "@/screens/resources/ResourceDetailScreen";
import { useResource } from "@/hooks/useResource";
import { strings } from "@/i18n";
import type { ResourceDTO } from "@shared/types";

const hookMock = useResource as unknown as jest.Mock;

const resource = (over: Partial<ResourceDTO> = {}): ResourceDTO => ({
  id: "r1",
  title: "Telefon zaufania",
  category: "mental_health",
  body: "Bezpłatna, anonimowa linia wsparcia psychicznego.",
  url: "https://example.org",
  featured: true,
  createdAt: "2026-07-01T00:00:00.000Z",
  ...over,
});

function state(over: Partial<ReturnType<typeof useResource>> = {}) {
  return {
    resource: resource(),
    status: "ready" as const,
    retry: jest.fn(),
    ...over,
  };
}

const renderDetail = (nav: { goBack: jest.Mock } = { goBack: jest.fn() }) =>
  render(
    <ResourceDetailScreen
      navigation={nav as never}
      route={{ params: { id: "r1" } } as never}
    />,
  );

beforeEach(() => hookMock.mockReset());

describe("ResourceDetailScreen", () => {
  it("renders the title, category chip and body", () => {
    hookMock.mockReturnValue(state());
    renderDetail();
    expect(screen.getByText("Telefon zaufania")).toBeTruthy();
    expect(
      screen.getByText(strings.resources.categories.mental_health),
    ).toBeTruthy();
    expect(
      screen.getByText("Bezpłatna, anonimowa linia wsparcia psychicznego."),
    ).toBeTruthy();
  });

  it("is full-bleed: renders its own back button that pops the stack", () => {
    hookMock.mockReturnValue(state());
    const nav = { goBack: jest.fn() };
    renderDetail(nav);
    fireEvent.press(screen.getByLabelText(strings.common.back));
    expect(nav.goBack).toHaveBeenCalled();
  });

  it("shows the open-link CTA and opens the URL when the resource links out", () => {
    const openURL = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValue(undefined as unknown as void);
    hookMock.mockReturnValue(
      state({ resource: resource({ url: "https://trevorproject.org" }) }),
    );
    renderDetail();
    fireEvent.press(screen.getByText(strings.resources.openLink));
    expect(openURL).toHaveBeenCalledWith("https://trevorproject.org");
    openURL.mockRestore();
  });

  it("hides the open-link CTA for an in-app article (url = null)", () => {
    hookMock.mockReturnValue(state({ resource: resource({ url: null }) }));
    renderDetail();
    expect(screen.queryByText(strings.resources.openLink)).toBeNull();
  });

  it("shows the error state with a retry", () => {
    const retry = jest.fn();
    hookMock.mockReturnValue(state({ resource: null, status: "error", retry }));
    renderDetail();
    fireEvent.press(screen.getByText(strings.resources.retry));
    expect(retry).toHaveBeenCalled();
  });
});
