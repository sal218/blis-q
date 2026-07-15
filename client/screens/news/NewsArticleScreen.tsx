import { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Linking,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { CategoryChip } from "@/components/CategoryChip";
import {
  CaretLeft,
  CaretRight,
  Phone,
  NewsCategoryIcon,
} from "@/components/icons/PhosphorIcons";
import { useArticle } from "@/hooks/useArticle";
import { formatRelativeTime } from "@/lib/relativeTime";
import { NEWS_CATEGORY_COLORS } from "@/constants/newsCategories";
import { strings, format } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { ResourcesStackParamList } from "@/navigation/AppTabs";

// News article detail (P-31, design ref: assets/news-details-*.png). Full-bleed:
// a category-gradient hero (imageUrl is null this slice — no photo), a floating
// back button, then the category chip + a "NA TOPIE" badge (if featured), the
// title, a source · date · read-time meta row, and the content. TWO modes: our
// editorial (a non-null body → the full text) and externally-sourced (null body →
// the summary + a "Czytaj u źródła" link). An inline "Potrzebujesz wsparcia?"
// callout links to the crisis page. Read-time shows only when there's a body.

type Props = NativeStackScreenProps<ResourcesStackParamList, "NewsArticle">;

const BANNER_HEIGHT = 210;
const SCRIM = "rgba(0,0,0,0.5)";

// Words-per-minute read estimate from the body (~200 wpm, min 1).
function readMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function ArticleBanner({ accent }: { accent: string }) {
  return (
    <Svg testID="news-banner-placeholder" width="100%" height={BANNER_HEIGHT}>
      <Defs>
        <LinearGradient id="news-article-banner" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={accent} />
          <Stop offset="1" stopColor={accent} stopOpacity={0.55} />
        </LinearGradient>
      </Defs>
      <Rect
        width="100%"
        height={BANNER_HEIGHT}
        fill="url(#news-article-banner)"
      />
    </Svg>
  );
}

export function NewsArticleScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { article, status, retry } = useArticle(route.params.id);

  const backButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={strings.crisis.back}
      hitSlop={8}
      onPress={() => navigation.goBack()}
      style={[styles.backBtn, { top: insets.top + spacing.sm }]}
    >
      <CaretLeft size={22} color="#fff" />
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

  if (status === "error" || !article) {
    return (
      <View style={[styles.root, styles.centered]}>
        {backButton}
        <Text style={styles.errorText}>{strings.news.detailLoadError}</Text>
        <View style={styles.fullWidth}>
          <PrimaryButton label={strings.news.retry} onPress={retry} />
        </View>
      </View>
    );
  }

  const accent = NEWS_CATEGORY_COLORS[article.category];
  const hasBody = article.body !== null && article.body.trim().length > 0;
  const sourceUrl = article.sourceUrl;
  const meta = hasBody
    ? `${article.source} · ${formatRelativeTime(article.createdAt)} · ${format(
        strings.news.readTime,
        { count: readMinutes(article.body as string) },
      )}`
    : `${article.source} · ${formatRelativeTime(article.createdAt)}`;

  return (
    <View style={styles.root}>
      {backButton}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
      >
        <View style={styles.bannerClip}>
          {article.imageUrl ? (
            <Image
              testID="news-banner"
              source={{ uri: article.imageUrl }}
              style={styles.bannerMedia}
              resizeMode="cover"
            />
          ) : (
            <>
              <ArticleBanner accent={accent} />
              <View style={styles.bannerIcon} pointerEvents="none">
                <NewsCategoryIcon
                  category={article.category}
                  size={48}
                  color="#fff"
                />
              </View>
            </>
          )}
        </View>

        <View style={styles.body}>
          <View style={styles.categoryRow}>
            <CategoryChip label={strings.news.categories[article.category]} />
            {article.featured ? (
              <View style={[styles.badge, { backgroundColor: accent }]}>
                <Text style={styles.badgeText}>
                  {strings.news.featuredBadge}
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.title}>{article.title}</Text>
          <Text style={styles.meta}>{meta}</Text>

          {hasBody ? (
            <Text style={styles.content}>{article.body}</Text>
          ) : (
            <>
              <Text style={styles.content}>{article.summary}</Text>
              {sourceUrl ? (
                <View style={styles.cta}>
                  <PrimaryButton
                    label={strings.news.openSource}
                    onPress={() => {
                      void Linking.openURL(sourceUrl);
                    }}
                  />
                </View>
              ) : null}
            </>
          )}

          {/* Inline crisis-support callout → the "Pomoc w kryzysie" page. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.news.support.title}
            onPress={() => navigation.navigate("Crisis")}
            style={({ pressed }) => [
              styles.support,
              pressed && styles.supportPressed,
            ]}
          >
            <View style={styles.supportIcon}>
              <Phone size={22} color={colors.primary} />
            </View>
            <View style={styles.supportText}>
              <Text style={styles.supportTitle}>
                {strings.news.support.title}
              </Text>
              <Text style={styles.supportBody}>
                {strings.news.support.body}
              </Text>
            </View>
            <CaretRight size={20} color={colors.textMuted} />
          </Pressable>
        </View>
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
      backgroundColor: SCRIM,
    },
    scrollContent: { paddingBottom: spacing.xl },
    bannerClip: {
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
      overflow: "hidden",
    },
    bannerMedia: { width: "100%", height: BANNER_HEIGHT },
    bannerIcon: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      opacity: 0.9,
    },
    body: { padding: spacing.lg },
    centered: {
      flex: 1,
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
    categoryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    badge: {
      borderRadius: radius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
    },
    badgeText: {
      color: "#fff",
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    title: {
      color: colors.text,
      fontSize: 26,
      fontWeight: "800",
      letterSpacing: -0.3,
      marginBottom: spacing.sm,
    },
    meta: {
      color: colors.textMuted,
      fontSize: 13,
      marginBottom: spacing.lg,
    },
    content: {
      color: colors.text,
      fontSize: 16,
      lineHeight: 24,
    },
    cta: {
      marginTop: spacing.lg,
      borderRadius: radius.lg,
      overflow: "hidden",
    },
    support: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      marginTop: spacing.xl,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },
    supportPressed: { opacity: 0.7 },
    supportIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary + "1A",
    },
    supportText: { flex: 1 },
    supportTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "700",
    },
    supportBody: {
      color: colors.textMuted,
      fontSize: 13,
      marginTop: 1,
    },
  });
}
