import { useMemo } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import {
  MagnifyingGlass,
  ResourceCategoryIcon,
  CaretRight,
} from "@/components/icons/PhosphorIcons";
import { ResourceCard } from "@/components/ResourceCard";
import { CardListSkeleton } from "@/components/skeleton/CardListSkeleton";
import { useResources } from "@/hooks/useResources";
import { RESOURCE_CATEGORY_COLORS } from "@/constants/resourceCategories";
import { strings } from "@/i18n";
import { spacing, radius, shadow, type ThemeColors } from "@/constants/theme";
import { RESOURCE_CATEGORIES, type ResourceCategory } from "@shared/types";
import type { ResourcesStackParamList } from "@/navigation/AppTabs";

// Resources hub (P-37, design ref: assets/profile-resources.png): a header, a
// search box (→ the list), a 2-column grid of the 6 content categories (→ the
// list preselected to that category), and a "Featured" strip of the flagged
// resources (→ detail), with a "view all" link. Read-only. The mockup's
// top-right quick-exit ⚡ is intentionally NOT built — quick-exit is PAUSED
// pending a product safety decision (P-17).

type Props = NativeStackScreenProps<ResourcesStackParamList, "ResourcesHome">;

const FEATURED_LIMIT = 5;

export function ResourcesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, status } = useResources();

  const featured = items.filter((r) => r.featured).slice(0, FEATURED_LIMIT);
  const featuredLoading = status === "loading" && items.length === 0;

  const openList = (category?: ResourceCategory) =>
    navigation.navigate("ResourcesList", category ? { category } : {});

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{strings.resources.title}</Text>
      <Text style={styles.subtitle}>{strings.resources.subtitle}</Text>

      {/* Search entry — taps through to the searchable list. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.resources.searchPlaceholder}
        onPress={() => openList()}
        style={styles.searchBox}
      >
        <MagnifyingGlass size={20} color={colors.textMuted} />
        <Text style={styles.searchPlaceholder}>
          {strings.resources.searchPlaceholder}
        </Text>
      </Pressable>

      <Text style={styles.sectionTitle}>
        {strings.resources.categoriesHeader}
      </Text>
      <View style={styles.categoryList}>
        {RESOURCE_CATEGORIES.map((c: ResourceCategory) => {
          const accent = RESOURCE_CATEGORY_COLORS[c];
          return (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityLabel={strings.resources.categories[c]}
              onPress={() => openList(c)}
              style={({ pressed }) => [
                styles.catCard,
                { backgroundColor: accent + "14" },
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.catIconDisc}>
                <ResourceCategoryIcon category={c} size={24} color={accent} />
              </View>
              <Text style={styles.catLabel} numberOfLines={2}>
                {strings.resources.categories[c]}
              </Text>
              <CaretRight size={20} color={accent} />
            </Pressable>
          );
        })}
      </View>

      {featuredLoading ? (
        <>
          <Text style={styles.sectionTitle}>
            {strings.resources.featuredTitle}
          </Text>
          <CardListSkeleton count={3} padded={false} />
        </>
      ) : featured.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>
            {strings.resources.featuredTitle}
          </Text>
          <View style={styles.featuredList}>
            {featured.map((r) => (
              <ResourceCard
                key={r.id}
                resource={r}
                onPress={(res) =>
                  navigation.navigate("ResourceDetail", { id: res.id })
                }
              />
            ))}
          </View>
        </>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => openList()}
        style={styles.viewAll}
      >
        <Text style={styles.viewAllText}>{strings.resources.viewAll}</Text>
        <CaretRight size={18} color={colors.primary} />
      </Pressable>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: "transparent" },
    content: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
    },
    title: {
      color: colors.text,
      fontSize: 32,
      fontWeight: "800",
      letterSpacing: -0.5,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 16,
      lineHeight: 22,
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      ...shadow,
      shadowOpacity: 0.05,
    },
    searchPlaceholder: {
      color: colors.textMuted,
      fontSize: 16,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "800",
      letterSpacing: -0.3,
      marginTop: spacing.xl,
      marginBottom: spacing.md,
    },
    categoryList: {
      gap: spacing.md,
    },
    catCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderRadius: radius.lg,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
    },
    pressed: { opacity: 0.85 },
    catIconDisc: {
      width: 48,
      height: 48,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.card,
    },
    catLabel: {
      flex: 1,
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
      letterSpacing: -0.2,
    },
    featuredList: {
      gap: spacing.md,
    },
    viewAll: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      marginTop: spacing.xl,
      paddingVertical: spacing.sm,
    },
    viewAllText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: "700",
    },
  });
}
