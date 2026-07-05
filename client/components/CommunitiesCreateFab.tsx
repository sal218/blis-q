import { useMemo, useRef, useState, useCallback, type ReactNode } from "react";
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  Easing,
} from "react-native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useTheme } from "@/contexts/ThemeContext";
import {
  Plus,
  UsersThree,
  CalendarBlank,
} from "@/components/icons/PhosphorIcons";
import { strings } from "@/i18n";
import { spacing, radius, shadow, type ThemeColors } from "@/constants/theme";

// The Communities-segment creation entry point (design ref:
// assets/event-communities-screen.png): a bottom-right FAB that expands into a
// speed-dial of "Załóż społeczność" + "Utwórz wydarzenie". Animated with RN's
// core Animated API (useNativeDriver transform/opacity) — deliberately NOT
// reanimated, so it needs no new native dependency / dev-client rebuild. Purely
// a nicer trigger for the EXISTING create flows — no functionality change.

interface Props {
  onCreateCommunity: () => void;
  onCreateEvent: () => void;
}

// How far each option row rises above the FAB when open.
const OPTION_1_RISE = 72;
const OPTION_2_RISE = 136;

export function CommunitiesCreateFab({
  onCreateCommunity,
  onCreateEvent,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tabBarHeight = useBottomTabBarHeight();
  const [open, setOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const animateTo = useCallback(
    (to: number) =>
      Animated.timing(anim, {
        toValue: to,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(),
    [anim],
  );

  const close = useCallback(() => {
    setOpen(false);
    animateTo(0);
  }, [animateTo]);

  const toggle = useCallback(() => {
    const next = !open;
    setOpen(next);
    animateTo(next ? 1 : 0);
  }, [open, animateTo]);

  const runAction = useCallback(
    (action: () => void) => {
      close();
      action();
    },
    [close],
  );

  const rotate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "45deg"],
  });
  const option1Y = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -OPTION_1_RISE],
  });
  const option2Y = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -OPTION_2_RISE],
  });

  const renderOption = (
    label: string,
    icon: ReactNode,
    translateY: Animated.AnimatedInterpolation<number>,
    onPress: () => void,
    testID: string,
  ) => (
    <Animated.View
      pointerEvents={open ? "auto" : "none"}
      style={[styles.optionRow, { opacity: anim, transform: [{ translateY }] }]}
    >
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={styles.optionPressable}
      >
        <View style={styles.optionLabel}>
          <Text style={styles.optionLabelText}>{label}</Text>
        </View>
        <View style={styles.optionIcon}>{icon}</View>
      </Pressable>
    </Animated.View>
  );

  return (
    <>
      <Animated.View
        pointerEvents={open ? "auto" : "none"}
        style={[styles.backdrop, { opacity: anim }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>

      <View
        pointerEvents="box-none"
        style={[styles.fabArea, { bottom: tabBarHeight + spacing.lg }]}
      >
        {renderOption(
          strings.communities.createEvent,
          <CalendarBlank size={22} color="#FFFFFF" />,
          option2Y,
          () => runAction(onCreateEvent),
          "fab-create-event",
        )}
        {renderOption(
          strings.communities.create,
          <UsersThree size={22} color="#FFFFFF" />,
          option1Y,
          () => runAction(onCreateCommunity),
          "fab-create-community",
        )}

        <Pressable
          testID="communities-fab"
          accessibilityRole="button"
          accessibilityLabel={strings.communities.createMenu}
          accessibilityState={{ expanded: open }}
          onPress={toggle}
          style={styles.fab}
        >
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Plus size={26} color="#FFFFFF" />
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.35)",
    },
    fabArea: {
      position: "absolute",
      right: spacing.lg,
      alignItems: "flex-end",
    },
    fab: {
      width: 56,
      height: 56,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      ...shadow,
      shadowOpacity: 0.25,
    },
    // Option rows sit at the FAB's baseline and rise via translateY when open.
    optionRow: {
      position: "absolute",
      bottom: 0,
      right: 0,
      flexDirection: "row",
      alignItems: "center",
    },
    optionPressable: {
      flexDirection: "row",
      alignItems: "center",
    },
    optionLabel: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginRight: spacing.sm,
      ...shadow,
      shadowOpacity: 0.12,
    },
    optionLabelText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "600",
    },
    optionIcon: {
      width: 48,
      height: 48,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      ...shadow,
      shadowOpacity: 0.2,
    },
  });
}
