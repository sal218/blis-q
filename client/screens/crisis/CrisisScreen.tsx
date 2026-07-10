import { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  Linking,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import {
  CaretLeft,
  CaretRight,
  ShieldCheck,
  Phone,
  Lock,
} from "@/components/icons/PhosphorIcons";
import { CrisisContactCard, telUrl } from "@/components/CrisisContactCard";
import { useCrisisContacts } from "@/hooks/useCrisisContacts";
import { strings } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import {
  CRISIS_CONTACT_CATEGORIES,
  type CrisisContactCategory,
} from "@shared/types";
import type { ResourcesStackParamList } from "@/navigation/AppTabs";

// Crisis / safety page ("Pomoc w kryzysie", P-37, design refs:
// assets/safety-page-darkmode.png + safety-page-lightmode.png). Reached from the
// Lifebuoy button in the Wsparcie header. A PUBLIC read (works signed-out).
//
// Layout: the header, the 112 emergency banner and the filter chips are PINNED
// (they never scroll out of sight — the banner is the fastest path to help); only
// the contact list scrolls beneath them. The banner's number comes from the
// admin-managed emergency contact (never hardcoded), and the emergency contact is
// shown ONLY in the banner — it is excluded from the list so 112 isn't duplicated.
// The categories are coarse SERVICE types, never identity — Article-9-safe.
// Favorites/save (the mockup's bookmark) is deferred.

type Props = NativeStackScreenProps<ResourcesStackParamList, "Crisis">;

// A warm, urgent accent for the emergency (112) banner — distinct from the green
// regular call buttons. Matches the mockup's magenta emergency treatment.
const EMERGENCY_ACCENT = "#DB2777";

// The filter chips exclude `emergency` — the emergency contact is the banner, not
// a chip (per the mockup).
const CHIP_CATEGORIES = CRISIS_CONTACT_CATEGORIES.filter(
  (c) => c !== "emergency",
);

export function CrisisScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, status, refreshing, refresh, retry } = useCrisisContacts();

  const [category, setCategory] = useState<CrisisContactCategory | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(true);

  // The emergency contact drives the banner; it's independent of the active chip.
  const emergency = items.find((c) => c.category === "emergency") ?? null;
  // The list is the non-emergency contacts (112 lives in the pinned banner only,
  // so it isn't duplicated), filtered client-side by the active chip.
  const nonEmergency = items.filter((c) => c.category !== "emergency");
  const shown = category
    ? nonEmergency.filter((c) => c.category === category)
    : nonEmergency;

  const callEmergency = () => {
    if (emergency) void Linking.openURL(telUrl(emergency.phone));
  };

  const renderPill = (
    label: string,
    active: boolean,
    onPress: () => void,
    key: string,
  ) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      {/* Back button — always visible so you can leave from any state. */}
      <View style={styles.backRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.crisis.back}
          hitSlop={8}
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        >
          <CaretLeft size={22} color={colors.text} />
        </Pressable>
      </View>

      {status === "loading" ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : status === "error" ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{strings.crisis.loadError}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={retry}
            style={({ pressed }) => [
              styles.retryBtn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.retryText}>{strings.crisis.retry}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* ── Pinned header: title, banner + chips never scroll away ── */}
          <View style={styles.pinned}>
            <Text style={styles.title}>{strings.crisis.title}</Text>
            <Text style={styles.subtitle}>{strings.crisis.subtitle}</Text>

            {/* 112 emergency banner — number from the emergency contact (data). */}
            {emergency ? (
              <View style={styles.banner}>
                <View style={styles.bannerIcon}>
                  <ShieldCheck size={22} color={EMERGENCY_ACCENT} />
                </View>
                <View style={styles.bannerText}>
                  <Text style={styles.bannerTitle}>
                    {strings.crisis.emergency.title}
                  </Text>
                  <Text style={styles.bannerBody}>
                    {strings.crisis.emergency.body}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${strings.crisis.callAction}: ${emergency.phone}`}
                  onPress={callEmergency}
                  style={({ pressed }) => [
                    styles.bannerCall,
                    pressed && styles.pressed,
                  ]}
                >
                  <Phone size={17} color="#FFFFFF" />
                  <Text style={styles.bannerCallText}>{emergency.phone}</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Category filter chips (wrap — all visible, no hidden scroll).
                Emergency is excluded (it's the banner). */}
            <View style={styles.chips}>
              {renderPill(
                strings.crisis.filterAll,
                category === null,
                () => setCategory(null),
                "all",
              )}
              {CHIP_CATEGORIES.map((c) =>
                renderPill(
                  strings.crisis.categories[c],
                  category === c,
                  () => setCategory(c),
                  c,
                ),
              )}
            </View>

            {/* Section header + trust label. */}
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>
                {strings.crisis.recommendedTitle}
              </Text>
              <View style={styles.trust}>
                <ShieldCheck size={15} color={colors.primary} />
                <Text style={styles.trustText}>
                  {strings.crisis.verifiedLabel}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Only the contacts scroll ── */}
          <FlatList
            data={shown}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => <CrisisContactCard contact={item} />}
            showsVerticalScrollIndicator={false}
            style={styles.list}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insets.bottom + spacing.xl },
            ]}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={colors.primary}
              />
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {category ? strings.crisis.emptyCategory : strings.crisis.empty}
              </Text>
            }
            ListFooterComponent={
              // Confidentiality reassurance footer (collapsible, expanded default).
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: safetyOpen }}
                onPress={() => setSafetyOpen((v) => !v)}
                style={styles.safety}
              >
                <View style={styles.safetyIcon}>
                  <Lock size={20} color={colors.primary} />
                </View>
                <View style={styles.safetyText}>
                  <Text style={styles.safetyTitle}>
                    {strings.crisis.safety.title}
                  </Text>
                  {safetyOpen ? (
                    <Text style={styles.safetyBody}>
                      {strings.crisis.safety.body}
                    </Text>
                  ) : null}
                </View>
                <View
                  style={{
                    transform: [{ rotate: safetyOpen ? "-90deg" : "90deg" }],
                  }}
                >
                  <CaretRight size={18} color={colors.textMuted} />
                </View>
              </Pressable>
            }
          />
        </>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: "transparent" },
    backRow: {
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.xs,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    // Pinned header block (title + banner + chips + section header).
    pinned: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    title: {
      color: colors.text,
      fontSize: 30,
      fontWeight: "800",
      letterSpacing: -0.5,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 21,
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },
    // Emergency banner.
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: EMERGENCY_ACCENT + "1A",
      borderWidth: 1,
      borderColor: EMERGENCY_ACCENT + "40",
    },
    bannerIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: EMERGENCY_ACCENT + "26",
    },
    bannerText: { flex: 1, gap: 2 },
    bannerTitle: {
      color: colors.text,
      fontSize: 14.5,
      fontWeight: "800",
      letterSpacing: -0.2,
    },
    bannerBody: {
      color: colors.textMuted,
      fontSize: 12.5,
      lineHeight: 17,
    },
    bannerCall: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderRadius: radius.full,
      backgroundColor: EMERGENCY_ACCENT,
    },
    bannerCallText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "800",
    },
    // Filter chips — wrap so all are visible (no hidden horizontal scroll).
    chips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    pill: {
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderRadius: radius.full,
      borderWidth: 1,
    },
    pillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    pillInactive: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    pillText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
    pillTextActive: { color: "#FFFFFF" },
    // Section header.
    sectionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "800",
      letterSpacing: -0.3,
    },
    trust: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    trustText: {
      color: colors.primary,
      fontSize: 12.5,
      fontWeight: "700",
    },
    // Scrolling contact list.
    list: { flex: 1 },
    listContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    separator: { height: spacing.md },
    emptyText: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
      paddingVertical: spacing.xl,
    },
    // Safety footer.
    safety: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      marginTop: spacing.lg,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    safetyIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary + "1A",
    },
    safetyText: { flex: 1, gap: 3 },
    safetyTitle: {
      color: colors.text,
      fontSize: 14.5,
      fontWeight: "800",
      letterSpacing: -0.2,
    },
    safetyBody: {
      color: colors.textMuted,
      fontSize: 12.5,
      lineHeight: 17,
    },
    // Loading / error.
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
      gap: spacing.md,
    },
    errorText: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
    },
    retryBtn: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
    },
    retryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
    pressed: { opacity: 0.7 },
  });
}
