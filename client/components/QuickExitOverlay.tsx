import { View, Text, Pressable, StyleSheet } from "react-native";
import { useQuickExit } from "@/contexts/QuickExitContext";

// Full-screen neutral cover, mounted once at the root (see App.tsx). The
// display flip none<->flex is synchronous with NO animation — speed is the
// whole point. This is deliberately NOT a Modal (modals animate in). The cover
// shows innocuous content so the app is not recognisable if glanced at; a
// discreet long-press returns to the app. See CLAUDE.md "Quick-Exit" gotcha.
export function QuickExitOverlay() {
  const { isExitActive, dismissQuickExit } = useQuickExit();

  return (
    <View
      style={[styles.container, { display: isExitActive ? "flex" : "none" }]}
      pointerEvents={isExitActive ? "auto" : "none"}
    >
      <Text style={styles.heading}>Pogoda</Text>
      <Text style={styles.detail}>Warszawa · 18°C · Zachmurzenie</Text>
      {/* Discreet long-press anywhere below returns to the app. */}
      <Pressable
        style={styles.dismissZone}
        onLongPress={dismissQuickExit}
        delayLongPress={600}
        hitSlop={{ top: 24, left: 24, bottom: 24, right: 24 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999, // keep above the navigator on Android (bg is opaque)
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  heading: {
    fontSize: 32,
    fontWeight: "700",
    color: "#111827",
  },
  detail: {
    marginTop: 8,
    fontSize: 16,
    color: "#4B5563",
  },
  dismissZone: {
    position: "absolute",
    bottom: 48,
    width: 120,
    height: 48,
  },
});
