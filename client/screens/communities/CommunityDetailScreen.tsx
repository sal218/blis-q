import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { PrimaryButton } from "@/components/forms/PrimaryButton";
import { FormError } from "@/components/forms/FormError";
import { Avatar } from "@/components/Avatar";
import { SegmentedControl } from "@/components/SegmentedControl";
import { CommunityFeed } from "@/screens/communities/CommunityFeed";
import { useCommunityDetail } from "@/hooks/useCommunityDetail";
import { strings, format } from "@/i18n";
import { spacing, radius, type ThemeColors } from "@/constants/theme";
import type { EventsStackParamList } from "@/navigation/AppTabs";

// Community detail — header (name/members) + an About|Feed segmented control.
// Design ref: assets/event-communities-details-screen.png (we ship About + Feed;
// Events/Members/Resources tabs land in their sprints — P-13). The header and
// tabs are fixed; each segment owns its own scroller (About = ScrollView, Feed =
// CommunityFeed's FlatList) so no VirtualizedList is nested in a ScrollView.

type Props = NativeStackScreenProps<EventsStackParamList, "CommunityDetail">;

const ABOUT = 0;

export function CommunityDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { colors } = useTheme();
  const { user } = useAuth();
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
  const [segment, setSegment] = useState(ABOUT);

  // Title the native header with the community name once it loads.
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
  // Compose requires membership AND a resolved identity (user.id non-null).
  const canCompose = isMember && !!user?.id;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Avatar
          uri={community.imageUrl}
          name={community.name}
          size={72}
          borderRadius={radius.lg}
        />
        <Text style={styles.name}>{community.name}</Text>
        <Text style={styles.meta}>
          {format(strings.communities.members, {
            count: community.memberCount,
          })}
        </Text>
      </View>

      <SegmentedControl
        segments={[strings.posts.tabAbout, strings.posts.tabFeed]}
        selectedIndex={segment}
        onChange={setSegment}
      />

      {segment === ABOUT ? (
        <ScrollView
          style={styles.about}
          contentContainerStyle={styles.aboutContent}
        >
          {community.description ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {strings.communities.about}
              </Text>
              <Text style={styles.description}>{community.description}</Text>
            </View>
          ) : null}

          <FormError message={actionError} />

          <PrimaryButton
            label={
              isMember ? strings.communities.leave : strings.communities.join
            }
            onPress={isMember ? leave : join}
            loading={actionLoading}
            variant={isMember ? "secondary" : "primary"}
          />
        </ScrollView>
      ) : (
        <CommunityFeed
          communityId={id}
          canCompose={canCompose}
          currentUserId={user?.id ?? null}
        />
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
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
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
    },
    name: {
      color: colors.text,
      fontSize: 22,
      fontWeight: "800",
      textAlign: "center",
      marginTop: spacing.sm,
    },
    meta: {
      color: colors.textMuted,
      fontSize: 14,
      marginTop: spacing.xs,
    },
    about: {
      flex: 1,
    },
    aboutContent: {
      padding: spacing.lg,
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
