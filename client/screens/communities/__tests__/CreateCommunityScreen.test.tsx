jest.mock("@/lib/api/communities", () => ({ createCommunity: jest.fn() }));

import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { CreateCommunityScreen } from "@/screens/communities/CreateCommunityScreen";
import { createCommunity } from "@/lib/api/communities";
import { strings } from "@/i18n";

const createMock = createCommunity as unknown as jest.Mock;

function renderCreate() {
  const navigation = { replace: jest.fn() };
  render(
    <CreateCommunityScreen
      navigation={navigation as never}
      route={{ key: "c", name: "CreateCommunity", params: undefined } as never}
    />,
  );
  return { navigation };
}

beforeEach(() => createMock.mockReset());

describe("CreateCommunityScreen", () => {
  it("blocks submit and shows an error when the name is empty", () => {
    renderCreate();
    fireEvent.press(
      screen.getByRole("button", { name: strings.communities.create }),
    );
    expect(screen.getByText(strings.communities.nameRequired)).toBeTruthy();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("blocks submit for a whitespace-only name (trimmed)", () => {
    renderCreate();
    fireEvent.changeText(
      screen.getByLabelText(strings.communities.nameLabel),
      "   ",
    );
    fireEvent.press(
      screen.getByRole("button", { name: strings.communities.create }),
    );
    expect(screen.getByText(strings.communities.nameRequired)).toBeTruthy();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("submits trimmed values and navigates to the new community on success", async () => {
    createMock.mockResolvedValue({ ok: true, data: { id: "new1" } });
    const { navigation } = renderCreate();

    fireEvent.changeText(
      screen.getByLabelText(strings.communities.nameLabel),
      "  Queer Creatives  ",
    );
    fireEvent.changeText(
      screen.getByLabelText(strings.communities.descriptionLabel),
      "  A space  ",
    );
    fireEvent.press(
      screen.getByRole("button", { name: strings.communities.create }),
    );

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({
        name: "Queer Creatives",
        description: "A space",
      }),
    );
    expect(navigation.replace).toHaveBeenCalledWith("CommunityDetail", {
      id: "new1",
    });
  });
});
