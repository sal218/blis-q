import { Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { CommunitiesPlaceholderScreen } from "@/screens/CommunitiesPlaceholderScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";
import { BlockedUsersScreen } from "@/screens/BlockedUsersScreen";
import { strings } from "@/i18n";

// Authenticated app shell: bottom tabs (Communities + Profile). Community
// browse/detail/create lands in PR 2 — the Communities tab is a placeholder for
// now. The Profile tab is a stack so it can host the blocked-users screen.

export type AppTabsParamList = {
  Communities: undefined;
  ProfileTab: undefined;
};

export type ProfileStackParamList = {
  ProfileHome: undefined;
  BlockedUsers: undefined;
};

const Tabs = createBottomTabNavigator<AppTabsParamList>();
const ProfileStackNav = createNativeStackNavigator<ProfileStackParamList>();

function ProfileStack() {
  const { colors } = useTheme();
  return (
    <ProfileStackNav.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <ProfileStackNav.Screen
        name="ProfileHome"
        component={ProfileScreen}
        options={{ headerShown: false }}
      />
      <ProfileStackNav.Screen
        name="BlockedUsers"
        component={BlockedUsersScreen}
        options={{ title: strings.profile.blockedUsers }}
      />
    </ProfileStackNav.Navigator>
  );
}

export function AppTabs() {
  const { colors } = useTheme();
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="Communities"
        component={CommunitiesPlaceholderScreen}
        options={{
          title: strings.tabs.communities,
          tabBarIcon: ({ color }) => <Text style={{ color }}>👥</Text>,
        }}
      />
      <Tabs.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{
          title: strings.tabs.profile,
          tabBarIcon: ({ color }) => <Text style={{ color }}>👤</Text>,
        }}
      />
    </Tabs.Navigator>
  );
}
