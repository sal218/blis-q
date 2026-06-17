import { useEffect, useRef } from "react";
import { Animated, Keyboard, Platform, type View } from "react-native";

// Lifts a form just enough that a target element (e.g. the Log in button) clears
// the keyboard — no more — so the screen rises naturally instead of jumping to
// the top. Expo-Go-safe: built-in Animated + Keyboard only, no native deps
// (react-native-keyboard-controller is NOT used — it isn't in Expo Go).
//
// Usage: put `ctaRef` on the element that must stay visible, and apply
// `liftStyle` to the Animated.View wrapping the form. On keyboard open it
// measures the element's on-screen overlap with the keyboard (plus a small
// clearance) and translates the form up by exactly that amount, animated in sync
// with the keyboard; it returns to 0 when the keyboard hides. If the element is
// already above the keyboard, it doesn't move.

const CLEARANCE = 16;
const DEFAULT_DURATION = 250;

export function useKeyboardLift() {
  const lift = useRef(new Animated.Value(0)).current;
  const ctaRef = useRef<View>(null);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const animateTo = (toValue: number, duration?: number) =>
      Animated.timing(lift, {
        toValue,
        duration: duration && duration > 0 ? duration : DEFAULT_DURATION,
        useNativeDriver: true,
      }).start();

    const onShow = Keyboard.addListener(showEvent, (event) => {
      const keyboardTop = event.endCoordinates.screenY;
      const node = ctaRef.current;
      if (!node) return;
      node.measureInWindow((_x, y, _width, height) => {
        const overlap = y + height + CLEARANCE - keyboardTop;
        animateTo(overlap > 0 ? overlap : 0, event.duration);
      });
    });

    const onHide = Keyboard.addListener(hideEvent, (event) => {
      animateTo(0, event.duration);
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [lift]);

  const liftStyle = {
    transform: [{ translateY: Animated.multiply(lift, -1) }],
  };

  return { ctaRef, liftStyle };
}
