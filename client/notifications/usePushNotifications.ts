import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { fetchWithAuth, getAccessToken } from "@/lib/auth";

// Show notifications even when the app is in the foreground.
// Call this once at module load time (before any component mounts).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Register or refresh the device push token with the backend. */
export async function registerPushToken(): Promise<void> {
  // Web push (FCM service worker) is a separate implementation — skip for now.
  if (Platform.OS === "web") return;

  try {
    // 1. Check / request OS permission
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== "granted") {
      const { status: requested } =
        await Notifications.requestPermissionsAsync();
      finalStatus = requested;
    }

    if (finalStatus !== "granted") {
      // User denied — do nothing, don't retry automatically.
      console.log("[PushTokens] Permission not granted, skipping registration");
      return;
    }

    // 2. Get the Expo push token — works on both iOS and Android.
    //    Expo's service relays to APNs (iOS) and FCM (Android) automatically,
    //    using the APNs key uploaded to EAS during the build.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token: string = tokenData.data; // format: ExponentPushToken[...]
    const platform = Platform.OS;

    // 3. Send to backend
    await _sendTokenToBackend(token, platform);
  } catch (err) {
    // Never throw — push registration must not crash the app
    console.warn("[PushTokens] Registration error:", err);
  }
}

/** Deactivate the current device's push token (call on logout). */
export async function deregisterPushToken(): Promise<void> {
  if (Platform.OS === "web") return;

  try {
    // Best-effort: if we can't get the token, skip silently
    const tokenData = await Notifications.getDevicePushTokenAsync().catch(
      () => null,
    );
    if (!tokenData) return;

    const res = await fetchWithAuth("PATCH", "/api/push-tokens", {
      token: tokenData.data,
    });
    if (!res.ok) {
      console.warn(
        "[PushTokens] Failed to deregister token, status:",
        res.status,
      );
    }
  } catch (err) {
    console.warn("[PushTokens] Deregister error:", err);
  }
}

async function _sendTokenToBackend(
  token: string,
  platform: string,
): Promise<void> {
  try {
    // Guard: only call if we have an auth token (user is logged in)
    const authToken = await getAccessToken();
    if (!authToken) return;

    const res = await fetchWithAuth("POST", "/api/push-tokens", {
      token,
      platform,
    });

    if (!res.ok) {
      console.warn("[PushTokens] Backend rejected token, status:", res.status);
    } else {
      console.log("[PushTokens] Token registered with backend");
    }
  } catch (err) {
    console.warn("[PushTokens] Network error registering token:", err);
  }
}

/**
 * Hook that manages token rotation and foreground notification handling.
 * Mount this once inside a component that is always rendered while the user
 * is authenticated (e.g. inside the main tab navigator or AppContent).
 *
 * @param isAuthenticated - Pass `true` when the user is logged in so the hook
 *   knows when to start listening.
 */
export function usePushNotifications(isAuthenticated: boolean): void {
  const tokenListenerRef = useRef<Notifications.EventSubscription | null>(null);
  const notifListenerRef = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    if (!isAuthenticated || Platform.OS === "web") return;

    // Listen for token rotation (FCM rotates tokens occasionally).
    // Re-register the new token with the backend automatically.
    tokenListenerRef.current = Notifications.addPushTokenListener(
      async (newToken) => {
        console.log("[PushTokens] Token rotated, re-registering");
        await _sendTokenToBackend(newToken.data, Platform.OS);
      },
    );

    // Foreground notification listener — log received notification.
    // The setNotificationHandler above already handles visual display.
    notifListenerRef.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log(
          "[PushNotification] Received in foreground:",
          notification.request.content.title,
        );
      },
    );

    return () => {
      tokenListenerRef.current?.remove();
      notifListenerRef.current?.remove();
    };
  }, [isAuthenticated]);
}
