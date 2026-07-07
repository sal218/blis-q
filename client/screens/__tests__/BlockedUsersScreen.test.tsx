jest.mock("@/lib/api/safety", () => ({
  listBlocks: jest.fn(),
  unblockUser: jest.fn(),
}));

import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { BlockedUsersScreen } from "@/screens/BlockedUsersScreen";
import { listBlocks, unblockUser } from "@/lib/api/safety";
import { strings } from "@/i18n";

const listMock = listBlocks as unknown as jest.Mock;
const unblockMock = unblockUser as unknown as jest.Mock;

const BLOCKS = [
  { id: "u1", displayName: "Alex", avatarUrl: null },
  { id: "u2", displayName: "Marta", avatarUrl: null },
];

beforeEach(() => {
  listMock.mockReset();
  unblockMock.mockReset();
});

describe("BlockedUsersScreen", () => {
  it("renders the blocked users", async () => {
    listMock.mockResolvedValue({ ok: true, data: BLOCKS });
    render(
      <BlockedUsersScreen
        navigation={{ goBack: jest.fn() } as never}
        route={{} as never}
      />,
    );
    expect(await screen.findByText("Alex")).toBeTruthy();
    expect(screen.getByText("Marta")).toBeTruthy();
  });

  it("shows the empty state when there are no blocks", async () => {
    listMock.mockResolvedValue({ ok: true, data: [] });
    render(
      <BlockedUsersScreen
        navigation={{ goBack: jest.fn() } as never}
        route={{} as never}
      />,
    );
    expect(await screen.findByText(strings.profile.blockedEmpty)).toBeTruthy();
  });

  it("shows an error state and retries", async () => {
    listMock.mockResolvedValueOnce({ ok: false, error: { kind: "network" } });
    render(
      <BlockedUsersScreen
        navigation={{ goBack: jest.fn() } as never}
        route={{} as never}
      />,
    );
    expect(await screen.findByText(strings.errors.network)).toBeTruthy();

    listMock.mockResolvedValueOnce({ ok: true, data: BLOCKS });
    fireEvent.press(
      screen.getByRole("button", { name: strings.communities.retry }),
    );
    expect(await screen.findByText("Alex")).toBeTruthy();
  });

  it("removes a user from the list after a successful unblock", async () => {
    listMock.mockResolvedValue({ ok: true, data: BLOCKS });
    unblockMock.mockResolvedValue({ ok: true, data: { ok: true } });
    render(
      <BlockedUsersScreen
        navigation={{ goBack: jest.fn() } as never}
        route={{} as never}
      />,
    );
    await screen.findByText("Alex");

    fireEvent.press(
      screen.getByRole("button", {
        name: `${strings.profile.unblock} Alex`,
      }),
    );

    await waitFor(() => expect(unblockMock).toHaveBeenCalledWith("u1"));
    await waitFor(() => expect(screen.queryByText("Alex")).toBeNull());
    expect(screen.getByText("Marta")).toBeTruthy();
  });
});
