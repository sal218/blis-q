import { useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { FormError } from "@/components/forms/FormError";
import { Avatar } from "@/components/Avatar";
import { useCommunityDetail } from "@/hooks/useCommunityDetail";
import { strings, format } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { EventsStackParamList } from "@/navigation/AppTabs";

// Community detail — join/leave. Design ref:
// assets/event-communities-details-screen.png (we render only what the API
// provides this slice: name, member count, description, join/leave). Data lives
// in useCommunityDetail; this screen is composition only.

type Props = NativeStackScreenProps<EventsStackParamList, "CommunityDetail">;

export function CommunityDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    community,
    status,
    loadError,
    actionLoading,
    actionError,
    reload,
    join,
    leave,
  } = useCommunityDetail(id);

  // Title the native header with the community name once it loads (view-only
  // side effect — no data fetching here).
  useEffect(() => {
    if (community) navigation.setOptions({ title: community.name });
  }, [community, navigation]);

  if (status === "loading") {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (status === "error" || !community) {
    return (
      <View style={[styles.root, styles.centered]}>
        <Text style={styles.errorText}>{loadError}</Text>
        <View style={styles.fullWidth}>
          <PrimaryButton label={strings.communities.retry} onPress={reload} />
        </View>
      </View>
    );
  }

  const isMember = community.membership !== null;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Avatar
          uri={community.imageUrl}
          name={community.name}
          size={88}
          borderRadius={radius.lg}
        />
        <Text style={styles.name}>{community.name}</Text>
        <Text style={styles.meta}>
          {format(strings.communities.members, {
            count: community.memberCount,
          })}
        </Text>
      </View>

      {community.description ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{strings.communities.about}</Text>
          <Text style={styles.description}>{community.description}</Text>
        </View>
      ) : null}

      <FormError message={actionError} />

      <PrimaryButton
        label={isMember ? strings.communities.leave : strings.communities.join}
        onPress={isMember ? leave : join}
        loading={actionLoading}
        variant={isMember ? "secondary" : "primary"}
      />
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: spacing.lg,
    },
    centered: {
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
    },
    fullWidth: {
      alignSelf: "stretch",
    },
    errorText: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
      marginBottom: spacing.md,
    },
    header: {
      alignItems: "center",
      marginBottom: spacing.lg,
    },
    name: {
      color: colors.text,
      fontSize: 24,
      fontWeight: "800",
      textAlign: "center",
      marginTop: spacing.md,
    },
    meta: {
      color: colors.textMuted,
      fontSize: 14,
      marginTop: spacing.xs,
    },
    section: {
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
      marginBottom: spacing.xs,
    },
    description: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
    },
  });
}
