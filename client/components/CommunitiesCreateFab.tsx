import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  Animated,
  StyleSheet,
  Easing,
} from "react-native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useTheme } from "@/contexts/ThemeContext";
import {
  Plus,
  X,
  UsersThree,
  CalendarBlank,
} from "@/components/icons/PhosphorIcons";
import { strings } from "@/i18n";
import { spacing, radius, shadow, type ThemeColors } from "@/constants/theme";

// The Communities-segment creation entry point (design ref:
// assets/event-communities-screen.png): a bottom-right FAB that opens a
// speed-dial of "Utwórz wydarzenie" + "Załóż społeczność". The OPEN menu lives
// in a full-screen Modal so (a) the dim covers the whole screen — not just the
// list — and (b) the option rows get the full screen width and never clip.
// Purely a nicer trigger for the EXISTING create flows — no functionality change.

interface Props {
  onCreateCommunity: () => void;
  onCreateEvent: () => void;
}

const FAB_SIZE = 56;
// Resting FAB clears the (opaque) bottom tab bar by a small margin; the list
// already ends at the tab bar, so we do NOT add the tab-bar height here.
const RESTING_BOTTOM = spacing.lg;

export function CommunitiesCreateFab({
  onCreateCommunity,
  onCreateEvent,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tabBarHeight = useBottomTabBarHeight();
  const [open, setOpen] = useState(false);
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      rise.setValue(0);
      Animated.timing(rise, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [open, rise]);

  const close = () => setOpen(false);
  const runAction = (action: () => void) => {
    close();
    action();
  };

  const optionStyle = (extraLift: number) => ({
    opacity: rise,
    transform: [
      {
        translateY: rise.interpolate({
          inputRange: [0, 1],
          outputRange: [extraLift, 0],
        }),
      },
    ],
  });

  const renderOption = (
    label: string,
    icon: ReactNode,
    lift: number,
    onPress: () => void,
    testID: string,
  ) => (
    <Animated.View style={optionStyle(lift)}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={styles.optionPressable}
      >
        <View style={styles.optionLabel}>
          <Text style={styles.optionLabelText} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <View style={styles.optionIcon}>{icon}</View>
      </Pressable>
    </Animated.View>
  );

  return (
    <>
      {/* Resting FAB, in the screen. */}
      <View
        pointerEvents="box-none"
        style={[styles.anchor, { bottom: RESTING_BOTTOM }]}
      >
        <Pressable
          testID="communities-fab"
          accessibilityRole="button"
          accessibilityLabel={strings.communities.createMenu}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(true)}
          style={styles.fab}
        >
          <Plus size={26} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* Open menu — full-screen so the dim + options cover the whole screen. */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
        statusBarTranslucent
      >
        <Pressable
          style={styles.backdrop}
          onPress={close}
          accessibilityLabel={strings.communities.pickCommunityClose}
        />
        <View
          pointerEvents="box-none"
          style={[styles.menu, { bottom: tabBarHeight + RESTING_BOTTOM }]}
        >
          {renderOption(
            strings.communities.createEvent,
            <CalendarBlank size={22} color="#FFFFFF" />,
            24,
            () => runAction(onCreateEvent),
            "fab-create-event",
          )}
          {renderOption(
            strings.communities.create,
            <UsersThree size={22} color="#FFFFFF" />,
            12,
            () => runAction(onCreateCommunity),
            "fab-create-community",
          )}
          <Pressable
            testID="communities-fab-close"
            accessibilityRole="button"
            accessibilityLabel={strings.communities.pickCommunityClose}
            onPress={close}
            style={styles.fab}
          >
            <X size={24} color="#FFFFFF" />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    anchor: {
      position: "absolute",
      right: spacing.lg,
      alignItems: "flex-end",
    },
    fab: {
      width: FAB_SIZE,
      height: FAB_SIZE,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      ...shadow,
      shadowOpacity: 0.25,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.35)",
    },
    menu: {
      position: "absolute",
      right: spacing.lg,
      left: spacing.lg,
      alignItems: "flex-end",
      gap: spacing.md,
    },
    optionPressable: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    optionLabel: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
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
