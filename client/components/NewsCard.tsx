import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { useTheme } from "@/contexts/ThemeContext";
import { NewsCategoryIcon } from "@/components/icons/PhosphorIcons";
import { NEWS_CATEGORY_COLORS } from "@/constants/newsCategories";
import { formatRelativeTime } from "@/lib/relativeTime";
import { strings } from "@/i18n";
import { spacing, radius, shadow, type ThemeColors } from "@/constants/theme";
import type { NewsDTO, NewsCategory } from "@shared/types";

// One article in the News feed (P-31, design ref: assets/news-feed-*.png). Two
// shapes share one component:
//  • regular row card: a category-gradient thumbnail (imageUrl is null this
//    slice — no <Image>) + category tag + headline + summary + source · date.
//  • featured hero (`featured`): a taller card led by a full-width category
//    gradient banner with a "NA TOPIE" badge, then the same text block.
// The whole card taps through to the article detail — it NEVER opens the source
// link directly (safer for a vulnerable audience: they see context first).

type Props = {
  article: NewsDTO;
  onPress?: (article: NewsDTO) => void;
  featured?: boolean;
};

// A category-tinted gradient fill (the placeholder while imageUrl is null). A
// unique gradient id per article avoids SVG def id collisions across cards.
function CategoryGradient({
  id,
  accent,
  width,
  height,
}: {
  id: string;
  accent: string;
  width: number | string;
  height: number;
}) {
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={accent} />
          <Stop offset="1" stopColor={accent} stopOpacity={0.55} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height={height} fill={`url(#${id})`} />
    </Svg>
  );
}

const THUMB = 76;
const HERO_BANNER = 150;

export function NewsCard({ article, onPress, featured = false }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const accent = NEWS_CATEGORY_COLORS[article.category];
  const categoryLabel =
    strings.news.categories[article.category as NewsCategory];
  const meta = `${article.source} · ${formatRelativeTime(article.createdAt)}`;

  const press = onPress ? () => onPress(article) : undefined;

  const textBlock = (
    <>
      <View style={styles.categoryRow}>
        <View
          style={[styles.tag, { backgroundColor: accent + "1A" }]}
          testID="news-category-tag"
        >
          <Text style={[styles.tagText, { color: accent }]}>
            {categoryLabel}
          </Text>
        </View>
      </View>
      <Text style={styles.title} numberOfLines={featured ? 3 : 2}>
        {article.title}
      </Text>
      <Text style={styles.summary} numberOfLines={2}>
        {article.summary}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {meta}
      </Text>
    </>
  );

  if (featured) {
    return (
      <Pressable
        accessibilityRole={onPress ? "button" : undefined}
        onPress={press}
        style={({ pressed }) => [
          styles.hero,
          onPress && pressed && styles.pressed,
        ]}
      >
        <View style={styles.heroBanner}>
          <CategoryGradient
            id={`news-hero-${article.id}`}
            accent={accent}
            width="100%"
            height={HERO_BANNER}
          />
          <View style={styles.heroIcon}>
            <NewsCategoryIcon
              category={article.category}
              size={40}
              color="#fff"
            />
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{strings.news.featuredBadge}</Text>
          </View>
        </View>
        <View style={styles.heroBody}>{textBlock}</View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={press}
      style={({ pressed }) => [
        styles.card,
        onPress && pressed && styles.pressed,
      ]}
    >
      <View style={styles.thumb} testID="news-thumb">
        <CategoryGradient
          id={`news-thumb-${article.id}`}
          accent={accent}
          width={THUMB}
          height={THUMB}
        />
        <View style={styles.thumbIcon}>
          <NewsCategoryIcon
            category={article.category}
            size={30}
            color="#fff"
          />
        </View>
      </View>
      <View style={styles.content}>{textBlock}</View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      gap: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      ...shadow,
      shadowOpacity: 0.06,
    },
    pressed: { opacity: 0.85 },
    thumb: {
      width: THUMB,
      height: THUMB,
      borderRadius: radius.md,
      overflow: "hidden",
    },
    thumbIcon: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
    },
    content: { flex: 1, gap: 3 },
    // ── Featured hero ──
    hero: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
      ...shadow,
      shadowOpacity: 0.06,
    },
    heroBanner: { height: HERO_BANNER },
    heroIcon: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      opacity: 0.9,
    },
    heroBody: { padding: spacing.md, gap: 3 },
    badge: {
      position: "absolute",
      top: spacing.md,
      left: spacing.md,
      backgroundColor: "rgba(0,0,0,0.35)",
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
    // ── Shared text block ──
    categoryRow: { flexDirection: "row" },
    tag: {
      alignSelf: "flex-start",
      borderRadius: radius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    tagText: { fontSize: 11, fontWeight: "700" },
    title: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "800",
      letterSpacing: -0.2,
      marginTop: 2,
    },
    summary: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 19,
    },
    meta: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
  });
}
