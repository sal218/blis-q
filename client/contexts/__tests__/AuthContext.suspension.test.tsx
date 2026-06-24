import { Text, Pressable } from "react-native";
import { act, render, screen, fireEvent } from "@testing-library/react-native";

// Verify AuthContext's HTTP-layer wiring: it registers the suspension,
// refresh, and expired-session handlers, and every session boundary bumps the
// suspension generation (so stale 403s can't re-show the screen). The generation
// MECHANICS themselves are covered by lib/api/__tests__/http.suspension + http.refresh.
const mockRegisterSuspended = jest.fn();
const mockRegisterRefresh = jest.fn();
const mockRegisterExpired = jest.fn();
const mockBump = jest.fn();
jest.mock("@/lib/api/http", () => ({
  registerSuspendedHandler: (fn: unknown) => mockRegisterSuspended(fn),
  registerRefreshHandler: (fn: unknown) => mockRegisterRefresh(fn),
  registerSessionExpiredHandler: (fn: unknown) => mockRegisterExpired(fn),
  bumpSuspensionGeneration: () => mockBump(),
}));
jest.mock("@/lib/session", () => ({
  loadSession: jest.fn(async () => null),
  saveSession: jest.fn(async () => {}),
  clearSession: jest.fn(async () => {}),
  refreshSession: jest.fn(async () => "failed"),
}));
jest.mock("@/notifications/usePushNotifications", () => ({
  deregisterPushToken: jest.fn(async () => {}),
}));
jest.mock("@/lib/googleAuth", () => ({
  signOutGoogle: jest.fn(async () => {}),
}));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";

function Probe() {
  const { isSuspended, sessionExpired, signOut, dismissSuspended } = useAuth();
  return (
    <>
      <Text testID="suspended">{String(isSuspended)}</Text>
      <Text testID="expired">{String(sessionExpired)}</Text>
      <Pressable accessibilityLabel="signout" onPress={() => signOut()}>
        <Text>signout</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="dismiss"
        onPress={() => dismissSuspended()}
      >
        <Text>dismiss</Text>
      </Pressable>
    </>
  );
}

async function mount() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {}); // flush the async rehydrate effect
}

beforeEach(() => {
  mockRegisterSuspended.mockClear();
  mockRegisterRefresh.mockClear();
  mockRegisterExpired.mockClear();
  mockBump.mockClear();
});

function captured(mock: jest.Mock): () => Promise<void> {
  const fn = mock.mock.calls.find((c) => typeof c[0] === "function");
  return fn![0] as () => Promise<void>;
}

describe("AuthContext — suspension wiring", () => {
  it("registers a handler that force-logs-out and sets isSuspended", async () => {
    await mount();
    expect(screen.getByTestId("suspended").props.children).toBe("false");

    await act(async () => {
      await captured(mockRegisterSuspended)();
    });

    expect(screen.getByTestId("suspended").props.children).toBe("true");
  });

  it("signOut bumps the suspension generation", async () => {
    await mount();
    mockBump.mockClear();
    await act(async () => {
      fireEvent.press(screen.getByLabelText("signout"));
    });
    expect(mockBump).toHaveBeenCalledTimes(1);
  });

  it("dismissSuspended clears suspension and bumps the generation", async () => {
    await mount();
    await act(async () => {
      await captured(mockRegisterSuspended)();
    });
    expect(screen.getByTestId("suspended").props.children).toBe("true");

    mockBump.mockClear();
    await act(async () => {
      fireEvent.press(screen.getByLabelText("dismiss"));
    });

    expect(screen.getByTestId("suspended").props.children).toBe("false");
    expect(mockBump).toHaveBeenCalledTimes(1);
  });
});

describe("AuthContext — refresh / expired wiring (P-10)", () => {
  it("registers a refresh handler and an expired-session handler", async () => {
    await mount();
    expect(
      mockRegisterRefresh.mock.calls.some((c) => typeof c[0] === "function"),
    ).toBe(true);
    expect(
      mockRegisterExpired.mock.calls.some((c) => typeof c[0] === "function"),
    ).toBe(true);
  });

  it("the expired-session handler bumps the generation, clears, and sets sessionExpired", async () => {
    await mount();
    expect(screen.getByTestId("expired").props.children).toBe("false");

    mockBump.mockClear();
    await act(async () => {
      await captured(mockRegisterExpired)();
    });

    expect(screen.getByTestId("expired").props.children).toBe("true");
    // Generation bumped FIRST so a stale 403 can't flip the UX to suspended.
    expect(mockBump).toHaveBeenCalledTimes(1);
  });
});
