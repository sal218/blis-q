import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { ComingSoon } from "@/components/ComingSoon";
import { strings } from "@/i18n";
import { spacing, type ThemeColors } from "@/constants/theme";

// Chat tab — placeholder this slice. Design target: assets/chat-screen.png
// (message list / conversations). Real chat (Supabase Realtime Broadcast) is a
// later slice; this keeps the IA tab in place.

export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={styles.title}>{strings.chat.title}</Text>
      <ComingSoon message={strings.chat.comingSoon} />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.lg,
    },
    title: {
      color: colors.text,
      fontSize: 28,
      fontWeight: "800",
    },
  });
}
