import { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Linking,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { CategoryChip } from "@/components/CategoryChip";
import { useResource } from "@/hooks/useResource";
import { strings } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { ResourcesStackParamList } from "@/navigation/AppTabs";

// Resource detail (P-37). Title, a read-only category chip, the full body, and —
// when the resource links out (NGO / hotline / org page) — an "Otwórz stronę"
// button that opens the external URL. Tapping a card ALWAYS lands here first
// (never a direct external jump), so an at-risk user sees the context before
// leaving the app. In-app articles (url = null) simply show the body.

type Props = NativeStackScreenProps<ResourcesStackParamList, "ResourceDetail">;

export function ResourceDetailScreen({ route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { resource, status, retry } = useResource(route.params.id);

  if (status === "loading") {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (status === "error" || !resource) {
    return (
      <View style={[styles.root, styles.centered]}>
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
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{resource.title}</Text>

      <View style={styles.categoryRow}>
        <CategoryChip label={strings.resources.categories[resource.category]} />
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
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: "transparent" },
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
