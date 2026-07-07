import { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { CategoryChip } from "@/components/CategoryChip";
import { CaretLeft } from "@/components/icons/PhosphorIcons";
import { useResource } from "@/hooks/useResource";
import { strings } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { ResourcesStackParamList } from "@/navigation/AppTabs";

// Resource detail (P-37). Full-bleed (no native header) — the screen owns a
// floating back button. Title, a read-only category chip, the full body, and —
// when the resource links out (NGO / hotline / org page) — an "Otwórz stronę"
// button that opens the external URL. Tapping a card ALWAYS lands here first
// (never a direct external jump), so an at-risk user sees the context before
// leaving the app. In-app articles (url = null) simply show the body.

type Props = NativeStackScreenProps<ResourcesStackParamList, "ResourceDetail">;

export function ResourceDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { resource, status, retry } = useResource(route.params.id);

  const backButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={strings.common.back}
      hitSlop={8}
      onPress={() => navigation.goBack()}
      style={[styles.backBtn, { top: insets.top + spacing.sm }]}
    >
      <CaretLeft size={22} color={colors.text} />
    </Pressable>
  );

  if (status === "loading") {
    return (
      <View style={[styles.root, styles.centered]}>
        {backButton}
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (status === "error" || !resource) {
    return (
      <View style={[styles.root, styles.centered]}>
        {backButton}
        <Text style={styles.errorText}>
          {strings.resources.detailLoadError}
        </Text>
        <View style={styles.fullWidth}>
          <PrimaryButton label={strings.resources.retry} onPress={retry} />
        </View>
      </View>
    );
  }

  const url = resource.url;

  return (
    <View style={styles.root}>
      {backButton}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 56 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{resource.title}</Text>

        <View style={styles.categoryRow}>
          <CategoryChip
            label={strings.resources.categories[resource.category]}
          />
        </View>

        <Text style={styles.body}>{resource.body}</Text>

        {url ? (
          <View style={styles.cta}>
            <PrimaryButton
              label={strings.resources.openLink}
              onPress={() => {
                void Linking.openURL(url);
              }}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: "transparent" },
    backBtn: {
      position: "absolute",
      left: spacing.lg,
      zIndex: 10,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    content: { padding: spacing.lg, paddingBottom: spacing.xl },
    centered: {
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
    },
    fullWidth: { alignSelf: "stretch" },
    errorText: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
      marginBottom: spacing.md,
    },
    title: {
      color: colors.text,
      fontSize: 26,
      fontWeight: "800",
      letterSpacing: -0.3,
      marginBottom: spacing.md,
    },
    categoryRow: {
      flexDirection: "row",
      marginBottom: spacing.lg,
    },
    body: {
      color: colors.text,
      fontSize: 16,
      lineHeight: 24,
    },
    cta: {
      marginTop: spacing.xl,
      borderRadius: radius.lg,
      overflow: "hidden",
    },
  });
}
