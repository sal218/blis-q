import { Ionicons } from "@expo/vector-icons";
import type { NavigatorScreenParams } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { HomeScreen } from "@/screens/HomeScreen";
import { ChatScreen } from "@/screens/ChatScreen";
import { EventsScreen } from "@/screens/events/EventsScreen";
import { CommunityDetailScreen } from "@/screens/communities/CommunityDetailScreen";
import { CreateCommunityScreen } from "@/screens/communities/CreateCommunityScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";
import { BlockedUsersScreen } from "@/screens/BlockedUsersScreen";
import { strings } from "@/i18n";

// Authenticated app shell. Post-login IA: bottom tabs Home · Events · Chat ·
// Profile. Home/Chat are placeholders this slice. The Events tab is a stack:
// its landing screen hosts a segmented control (Events / Safe places /
// Communities) and pushes Community detail/create on top. Profile is a stack so
// it can host the blocked-users screen. (There is intentionally no Communities
// tab — communities live under Events → Communities.)

export type AppTabsParamList = {
  Home: undefined;
  // NavigatorScreenParams so other tabs (e.g. Home) can deep-link into the Events
  // stack, e.g. navigate("Events", { screen: "CommunityDetail", params: { id } }).
  Events: NavigatorScreenParams<EventsStackParamList>;
  Chat: undefined;
  ProfileTab: undefined;
};

export type EventsStackParamList = {
  EventsHome: undefined;
  CommunityDetail: { id: string };
  CreateCommunity: undefined;
};

export type ProfileStackParamList = {
  ProfileHome: undefined;
  BlockedUsers: undefined;
};

const Tabs = createBottomTabNavigator<AppTabsParamList>();
const EventsStackNav = createNativeStackNavigator<EventsStackParamList>();
const ProfileStackNav = createNativeStackNavigator<ProfileStackParamList>();

function EventsStack() {
  const { colors } = useTheme();
  return (
    <EventsStackNav.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <EventsStackNav.Screen
        name="EventsHome"
        component={EventsScreen}
        options={{ headerShown: false }}
      />
      <EventsStackNav.Screen
        name="CommunityDetail"
        component={CommunityDetailScreen}
        options={{ title: "" }}
      />
      <EventsStackNav.Screen
        name="CreateCommunity"
        component={CreateCommunityScreen}
        options={{ title: strings.communities.createTitle }}
      />
    </EventsStackNav.Navigator>
  );
}

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
        name="Home"
        component={HomeScreen}
        options={{
          title: strings.tabs.home,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="Events"
        component={EventsStack}
        options={{
          title: strings.tabs.events,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "calendar" : "calendar-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          title: strings.tabs.chat,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "chatbubble" : "chatbubble-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{
          title: strings.tabs.profile,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs.Navigator>
  );
}
