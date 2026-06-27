jest.mock("@/lib/api/chat", () => ({
  listCommunityMessages: jest.fn(),
  sendMessage: jest.fn(),
  deleteMessage: jest.fn(),
  reportMessage: jest.fn(),
}));
jest.mock("@/lib/api/safety", () => ({ listBlocks: jest.fn() }));

// Supabase Realtime mock: a single channel whose broadcast handler + subscribe
// callback we capture so the test can simulate incoming messages / SUBSCRIBED.
jest.mock("@/lib/supabase", () => {
  const channel: Record<string, unknown> = {};
  channel.on = jest.fn((_type: string, _filter: unknown, handler: unknown) => {
    channel.__handler = handler;
    return channel;
  });
  channel.subscribe = jest.fn((cb: (s: string) => void) => {
    channel.__subscribeCb = cb;
    cb?.("SUBSCRIBED");
    return channel;
  });
  return {
    supabase: {
      channel: jest.fn(() => channel),
      removeChannel: jest.fn(),
    },
    setRealtimeAuth: jest.fn().mockResolvedValue(undefined),
    __channel: channel,
  };
});

// useFocusEffect → run the effect on mount, cleanup on unmount.
jest.mock("@react-navigation/native", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  return { useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]) };
});

import { AppState } from "react-native";
import { renderHook, act, waitFor } from "@testing-library/react-native";
import { useCommunityChat } from "@/hooks/useCommunityChat";
import { listCommunityMessages, sendMessage } from "@/lib/api/chat";
import { listBlocks } from "@/lib/api/safety";
import { supabase } from "@/lib/supabase";
import type { MessageDTO } from "@shared/types";

const listMock = listCommunityMessages as unknown as jest.Mock;
const sendMock = sendMessage as unknown as jest.Mock;
const blocksMock = listBlocks as unknown as jest.Mock;
const channelMock = supabase.channel as unknown as jest.Mock;
const removeChannelMock = supabase.removeChannel as unknown as jest.Mock;
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports
const channel = require("@/lib/supabase").__channel as any;

function msg(id: string, senderId: string | null): MessageDTO {
  return {
    id,
    communityId: "c1",
    sender: senderId
      ? { id: senderId, displayName: "S", avatarUrl: null }
      : null,
    content: `m-${id}`,
    createdAt: new Date().toISOString(),
    deleted: false,
  };
}

const emptyPage = { ok: true as const, data: { data: [], nextCursor: null } };

let appStateHandler: (s: string) => void = () => {};

beforeEach(() => {
  listMock.mockReset().mockResolvedValue(emptyPage);
  sendMock.mockReset();
  blocksMock.mockReset().mockResolvedValue({ ok: true, data: [] });
  channelMock.mockClear();
  removeChannelMock.mockClear();
  (channel.on as jest.Mock).mockClear();
  (channel.subscribe as jest.Mock).mockClear();
  jest.spyOn(AppState, "addEventListener").mockImplementation(((
    _event: string,
    cb: (s: string) => void,
  ) => {
    appStateHandler = cb;
    return { remove: jest.fn() };
  }) as unknown as typeof AppState.addEventListener);
});

async function ready() {
  const hook = renderHook(() => useCommunityChat("c1", "me"));
  await waitFor(() => expect(hook.result.current.status).toBe("ready"));
  await waitFor(() => expect(blocksMock).toHaveBeenCalled());
  return hook;
}

describe("useCommunityChat — subscription lifecycle", () => {
  it("subscribes to the private channel on focus, removeChannel on unmount", async () => {
    const hook = await ready();
    expect(channelMock).toHaveBeenCalledWith("chat:c1", {
      config: { private: true },
    });
    expect(channel.subscribe).toHaveBeenCalled();

    hook.unmount();
    expect(removeChannelMock).toHaveBeenCalledWith(channel);
  });

  it("AppState background unsubscribes; active re-subscribes", async () => {
    await ready();
    const initialChannels = channelMock.mock.calls.length;

    act(() => appStateHandler("background"));
    expect(removeChannelMock).toHaveBeenCalledWith(channel);

    // subscribe() awaits setRealtimeAuth before creating the channel, so flush.
    await act(async () => appStateHandler("active"));
    await waitFor(() =>
      expect(channelMock.mock.calls.length).toBe(initialChannels + 1),
    );
  });
});

describe("useCommunityChat — live messages", () => {
  it("appends a live message, dedups by id, and drops blocked senders", async () => {
    blocksMock.mockResolvedValue({ ok: true, data: [{ id: "blocked" }] });
    const { result } = await ready();

    // A normal incoming message is appended (newest-first → index 0).
    await act(async () => {
      channel.__handler({ payload: msg("m1", "u1") });
    });
    expect(result.current.messages.map((m) => m.id)).toEqual(["m1"]);

    // Same id again → not duplicated.
    await act(async () => {
      channel.__handler({ payload: msg("m1", "u1") });
    });
    expect(result.current.messages.filter((m) => m.id === "m1")).toHaveLength(
      1,
    );

    // A message from a blocked sender → dropped.
    await act(async () => {
      channel.__handler({ payload: msg("m2", "blocked") });
    });
    expect(result.current.messages.map((m) => m.id)).toEqual(["m1"]);
  });

  it("re-filters an early broadcast once the (delayed) block list resolves", async () => {
    let resolveBlocks!: (v: unknown) => void;
    blocksMock.mockReturnValue(
      new Promise((r) => {
        resolveBlocks = r;
      }),
    );
    const hook = renderHook(() => useCommunityChat("c1", "me"));
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));

    // Block list still pending → a broadcast from a (to-be) blocked sender shows.
    await act(async () => {
      channel.__handler({ payload: msg("early", "blocked") });
    });
    expect(hook.result.current.messages.map((m) => m.id)).toEqual(["early"]);

    // Block list resolves → the already-shown blocked message is removed.
    await act(async () => {
      resolveBlocks({ ok: true, data: [{ id: "blocked" }] });
    });
    await waitFor(() => expect(hook.result.current.messages).toHaveLength(0));
  });
});

describe("useCommunityChat — optimistic send", () => {
  it("reconciles the optimistic message with the server DTO", async () => {
    const real = msg("real-1", "me");
    sendMock.mockResolvedValue({ ok: true, data: real });
    const { result } = await ready();

    await act(async () => {
      await result.current.send("Cześć");
    });

    const ids = result.current.messages.map((m) => m.id);
    expect(ids).toContain("real-1");
    expect(ids.some((id) => id.startsWith("temp-"))).toBe(false);
  });

  it("removes the optimistic message and surfaces the error on send failure", async () => {
    sendMock.mockResolvedValue({ ok: false, error: { kind: "forbidden" } });
    const { result } = await ready();

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.send("nope");
    });

    expect(outcome).toEqual({ ok: false, message: expect.any(String) });
    expect(result.current.messages).toHaveLength(0);
  });
});
