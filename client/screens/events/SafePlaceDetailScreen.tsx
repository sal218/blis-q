import { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Animated,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { ReportPostModal } from "@/components/ReportPostModal";
import { CategoryChip } from "@/components/CategoryChip";
import {
  MapPin,
  CaretLeft,
  Bookmark,
  Check,
} from "@/components/icons/PhosphorIcons";
import { useSafePlace } from "@/hooks/useSafePlace";
import { strings } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { EventsStackParamList } from "@/navigation/AppTabs";

// Safe-place detail (design ref: assets/event-safeplace-screen.png). Mirrors
// EventDetailScreen's language: an edge-to-edge banner (the admin photo, or a
// brand gradient placeholder), a floating back + ⋯ (Report) button, then the
// name, category chip, address/city and description, with a pinned Save button.
// COORDINATES ARE NEVER SHOWN (Article 9 — they only place the pin on the map,
// SP-4). Distance/directions/hours/reviews/share are deferred (P-40).

type Props = NativeStackScreenProps<EventsStackParamList, "SafePlaceDetail">;

const BANNER_HEIGHT = 240;
const BANNER_RADIUS = 28;
const SCRIM = "rgba(0,0,0,0.5)";

function BannerPlaceholder({ colors }: { colors: ThemeColors }) {
  return (
    <Svg
      testID="safe-place-banner-placeholder"
      width="100%"
      height={BANNER_HEIGHT}
    >
      <Defs>
        <LinearGradient id="safe-place-banner" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.primary} />
          <Stop offset="1" stopColor={colors.accent} />
        </LinearGradient>
      </Defs>
      <Rect
        width="100%"
        height={BANNER_HEIGHT}
        fill="url(#safe-place-banner)"
      />
    </Svg>
  );
}

export function SafePlaceDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { place, status, saving, retry, toggleSave, report } = useSafePlace(
    route.params.id,
  );
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const sheetAnim = useRef(new Animated.Value(0)).current;

  const openMenu = () => {
    setMenuVisible(true);
    Animated.timing(sheetAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  };
  const closeMenu = () => {
    Animated.timing(sheetAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => setMenuVisible(false));
  };

  const backButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={strings.common.back}
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

  if (status === "error" || !place) {
    return (
      <View style={[styles.root, styles.centered]}>
        {backButton}
        <Text style={styles.errorText}>
          {strings.safePlaces.detailLoadError}
        </Text>
        <View style={styles.fullWidth}>
          <PrimaryButton label={strings.safePlaces.retry} onPress={retry} />
        </View>
      </View>
    );
  }

  const where = [place.address, place.city].filter(Boolean).join(", ");
  const isSaved = place.saved;

  const onSubmitReport = async (reason: string) => {
    const result = await report(reason);
    if (result.ok) Alert.alert(strings.posts.reportSuccess);
    return result;
  };

  const moreButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={strings.safePlaces.moreActions}
      hitSlop={8}
      onPress={openMenu}
      style={[styles.moreBtn, { top: insets.top + spacing.sm }]}
    >
      <Text style={styles.moreGlyph}>⋯</Text>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      {backButton}
      {moreButton}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
      >
        <View style={styles.bannerClip}>
          {place.imageUrl ? (
            <Image
              testID="safe-place-banner"
              source={{ uri: place.imageUrl }}
              style={styles.bannerMedia}
              resizeMode="cover"
            />
          ) : (
            <BannerPlaceholder colors={colors} />
          )}
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>{place.name}</Text>

          <View style={styles.categoryRow}>
            <CategoryChip
              label={strings.safePlaces.categories[place.category]}
            />
          </View>

          {where ? (
            <View style={styles.row}>
              <MapPin size={18} color={colors.textMuted} />
              <Text style={styles.rowText}>{where}</Text>
            </View>
          ) : null}

          {place.description ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>
                {strings.safePlaces.aboutLabel}
              </Text>
              <Text style={styles.description}>{place.description}</Text>
            </>
          ) : null}

          {place.accessibilityFeatures.length > 0 ? (
            <View testID="accessibility-section">
              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>
                {strings.safePlaces.accessibilityTitle}
              </Text>
              {place.accessibilityFeatures.map((f) => (
                <View key={f} style={styles.accessRow}>
                  <View style={styles.accessCheck}>
                    <Check size={14} color={colors.primary} />
                  </View>
                  <Text style={styles.accessText}>
                    {strings.safePlaces.accessibility[f]}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View
        style={[
          styles.bottomBar,
          { paddingBottom: insets.bottom + spacing.sm },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isSaved
              ? strings.safePlaces.savedAction
              : strings.safePlaces.saveAction
          }
          accessibilityState={{ selected: isSaved, disabled: saving }}
          disabled={saving}
          onPress={toggleSave}
          style={({ pressed }) => [
            styles.saveBtn,
            isSaved && styles.saveBtnActive,
            pressed && styles.saveBtnPressed,
          ]}
        >
          <Bookmark
            size={18}
            filled={isSaved}
            color={isSaved ? "#fff" : colors.primary}
          />
          <Text
            style={[styles.saveBtnText, isSaved && styles.saveBtnTextActive]}
            numberOfLines={1}
          >
            {isSaved
              ? strings.safePlaces.savedAction
              : strings.safePlaces.saveAction}
          </Text>
        </Pressable>
      </View>

      {menuVisible ? (
        <View style={styles.sheetOverlay}>
          <Animated.View style={[styles.sheetBackdrop, { opacity: sheetAnim }]}>
            <Pressable
              accessibilityLabel={strings.common.cancel}
              style={StyleSheet.absoluteFill}
              onPress={closeMenu}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.sheet,
              {
                paddingBottom: insets.bottom + spacing.md,
                transform: [
                  {
                    translateY: sheetAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [400, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.safePlaces.reportAction}
              onPress={() => {
                closeMenu();
                setReportVisible(true);
              }}
              style={styles.sheetRow}
            >
              <Text style={styles.sheetRowText}>
                {strings.safePlaces.reportAction}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.common.cancel}
              onPress={closeMenu}
              style={styles.sheetRow}
            >
              <Text style={styles.sheetCancelText}>
                {strings.common.cancel}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}

      <ReportPostModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={onSubmitReport}
        title={strings.safePlaces.reportTitle}
        placeholder={strings.safePlaces.reportPlaceholder}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: "transparent" },
    scrollContent: { paddingBottom: spacing.xl },
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
    moreBtn: {
      position: "absolute",
      right: spacing.lg,
      zIndex: 10,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: SCRIM,
    },
    moreGlyph: {
      color: "#fff",
      fontSize: 22,
      fontWeight: "800",
      lineHeight: 22,
    },
    sheetOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 20,
      justifyContent: "flex-end",
    },
    sheetBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.45)",
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    sheetRow: { paddingVertical: spacing.md, alignItems: "center" },
    sheetRowText: { color: colors.danger, fontSize: 16, fontWeight: "700" },
    sheetCancelText: {
      color: colors.textMuted,
      fontSize: 16,
      fontWeight: "600",
    },
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
    bannerClip: {
      width: "100%",
      height: BANNER_HEIGHT,
      overflow: "hidden",
      borderBottomLeftRadius: BANNER_RADIUS,
      borderBottomRightRadius: BANNER_RADIUS,
      backgroundColor: colors.surface,
    },
    bannerMedia: { width: "100%", height: BANNER_HEIGHT },
    body: { padding: spacing.lg },
    title: {
      color: colors.text,
      fontSize: 26,
      fontWeight: "800",
      marginBottom: spacing.md,
    },
    categoryRow: {
      flexDirection: "row",
      marginTop: -spacing.xs,
      marginBottom: spacing.sm,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    rowText: { flex: 1, color: colors.text, fontSize: 15 },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: spacing.lg,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
      marginBottom: spacing.sm,
    },
    description: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
    accessRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    accessCheck: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    accessText: { flex: 1, color: colors.text, fontSize: 15 },
    bottomBar: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    saveBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      paddingVertical: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: colors.primary,
      backgroundColor: colors.surface,
    },
    saveBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    saveBtnPressed: { opacity: 0.85 },
    saveBtnText: { color: colors.primary, fontSize: 16, fontWeight: "800" },
    saveBtnTextActive: { color: "#fff" },
  });
}
