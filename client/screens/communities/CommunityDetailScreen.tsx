import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { FormError } from "@/components/forms/FormError";
import {
  getCommunity,
  joinCommunity,
  leaveCommunity,
} from "@/lib/api/communities";
import { communityApiErrorMessage } from "@/lib/messages";
import { strings, format } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { CommunityDTO } from "@shared/types";
import type { EventsStackParamList } from "@/navigation/AppTabs";

// Community detail — join/leave. Design ref:
// assets/event-communities-details-screen.png (we render only what the API
// provides this slice: name, member count, description, join/leave; the
// feed/members/resources tabs in the mockup are later slices).
//
// Both 409s map to `conflict`; the call site picks the copy — join → "already a
// member", leave → "sole admin must hand off the role first" (Codex refinement).

type Props = NativeStackScreenProps<EventsStackParamList, "CommunityDetail">;

type Status = "loading" | "ready" | "error";

export function CommunityDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [community, setCommunity] = useState<CommunityDTO | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    const res = await getCommunity(id);
    if (res.ok) {
      setCommunity(res.data);
      navigation.setOptions({ title: res.data.name });
      setStatus("ready");
    } else {
      setLoadError(communityApiErrorMessage(res.error, strings.errors.generic));
      setStatus("error");
    }
  }, [id, navigation]);

  useEffect(() => {
    load();
  }, [load]);

  const onJoin = async () => {
    setActionLoading(true);
    setActionError(null);
    const res = await joinCommunity(id);
    setActionLoading(false);
    if (res.ok) {
      await load();
    } else {
      setActionError(
        communityApiErrorMessage(res.error, strings.communities.alreadyMember),
      );
    }
  };

  const onLeave = async () => {
    setActionLoading(true);
    setActionError(null);
    const res = await leaveCommunity(id);
    setActionLoading(false);
    if (res.ok) {
      await load();
    } else {
      setActionError(
        communityApiErrorMessage(res.error, strings.communities.leaveSoleAdmin),
      );
    }
  };

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
          <PrimaryButton label={strings.communities.retry} onPress={load} />
        </View>
      </View>
    );
  }

  const isMember = community.membership !== null;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        {community.imageUrl ? (
          <Image source={{ uri: community.imageUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarLetter}>
              {community.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
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
        onPress={isMember ? onLeave : onJoin}
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
    avatar: {
      width: 88,
      height: 88,
      borderRadius: radius.lg,
      marginBottom: spacing.md,
    },
    avatarFallback: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    avatarLetter: {
      color: "#FFFFFF",
      fontSize: 36,
      fontWeight: "700",
    },
    name: {
      color: colors.text,
      fontSize: 24,
      fontWeight: "800",
      textAlign: "center",
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
