import { Text, Pressable } from "react-native";
import { act, render, screen, fireEvent } from "@testing-library/react-native";

// Verify AuthContext's suspension wiring: it registers a force-logout handler
// that flips isSuspended, and every session boundary (signOut / dismissSuspended)
// bumps the suspension generation so stale 403s can't re-show the screen. The
// generation MECHANICS themselves are covered by lib/api/__tests__/http.suspension.
const mockRegister = jest.fn();
const mockBump = jest.fn();
jest.mock("@/lib/api/http", () => ({
  registerSuspendedHandler: (fn: unknown) => mockRegister(fn),
  bumpSuspensionGeneration: () => mockBump(),
}));
jest.mock("@/lib/session", () => ({
  loadSession: jest.fn(async () => null),
  saveSession: jest.fn(async () => {}),
  clearSession: jest.fn(async () => {}),
}));
jest.mock("@/notifications/usePushNotifications", () => ({
  deregisterPushToken: jest.fn(async () => {}),
}));
jest.mock("@/lib/googleAuth", () => ({
  signOutGoogle: jest.fn(async () => {}),
}));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";

function Probe() {
  const { isSuspended, signOut, dismissSuspended } = useAuth();
  return (
    <>
      <Text testID="suspended">{String(isSuspended)}</Text>
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
  mockRegister.mockClear();
  mockBump.mockClear();
});

// The handler AuthProvider registered with the HTTP layer.
function registeredHandler(): () => Promise<void> {
  const fn = mockRegister.mock.calls.find((c) => typeof c[0] === "function");
  return fn![0] as () => Promise<void>;
}

describe("AuthContext — suspension wiring", () => {
  it("registers a handler that force-logs-out and sets isSuspended", async () => {
    await mount();
    expect(screen.getByTestId("suspended").props.children).toBe("false");

    await act(async () => {
      await registeredHandler()();
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
      await registeredHandler()();
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
