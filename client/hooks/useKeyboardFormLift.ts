import { useEffect, useRef } from "react";
import { Keyboard, Platform, type ScrollView } from "react-native";

// Lifts a centered form so a lower CTA (e.g. the Log in button) stays visible
// when the keyboard opens: in sync with the keyboard it scrolls the form region
// up to just below the top (so the header/logo slides out of view), and scrolls
// back to the centered layout when the keyboard closes.
//
// Wire it up by: capturing the form region's top Y via onLayout into formTopRef,
// putting scrollRef on a ScrollView that has `automaticallyAdjustKeyboardInsets`
// (that supplies the scroll room this needs), and passing the top inset/offset
// to keep the form clear of the status bar. iOS uses the `will` events so the
// motion tracks the keyboard animation; Android uses `did`.

export function useKeyboardFormLift(topOffset: number) {
  const scrollRef = useRef<ScrollView>(null);
  const formTopRef = useRef(0);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = Keyboard.addListener(showEvent, () => {
      const y = Math.max(0, formTopRef.current - topOffset);
      scrollRef.current?.scrollTo({ y, animated: true });
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [topOffset]);

  return { scrollRef, formTopRef };
}
