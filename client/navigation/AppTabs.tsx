import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  House,
  CalendarMinus,
  ChatsTeardrop,
  User,
} from "@/components/icons/PhosphorIcons";
import type { NavigatorScreenParams } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { HomeScreen } from "@/screens/HomeScreen";
import { EventsScreen } from "@/screens/events/EventsScreen";
import { EventDetailScreen } from "@/screens/events/EventDetailScreen";
import { CreateEventScreen } from "@/screens/events/CreateEventScreen";
import { CommunityDetailScreen } from "@/screens/communities/CommunityDetailScreen";
import { CreateCommunityScreen } from "@/screens/communities/CreateCommunityScreen";
import { ChatInboxScreen } from "@/screens/chat/ChatInboxScreen";
import { ChatThreadScreen } from "@/screens/chat/ChatThreadScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";
import { BlockedUsersScreen } from "@/screens/BlockedUsersScreen";
import { strings } from "@/i18n";

// Authenticated app shell. Post-login IA: bottom tabs Home · Events · Chat ·
// Profile. The Events tab is a stack: its landing screen hosts a segmented
// control (Events / Safe places / Communities) and pushes Community detail/create
// on top. The Chat tab is a stack: the Messages inbox pushes the chat thread.
// Profile is a stack so it can host the blocked-users screen. (There is
// intentionally no Communities tab — communities live under Events → Communities.)

// Shared route params for the chat thread — registered in BOTH the Events stack
// (reached from a community) and the Chat stack (reached from the inbox), so the
// screen is reused. canModerate snapshots the caller's community role so the
// thread offers delete on others' messages (the server still enforces).
export type ChatThreadParams = {
  communityId: string;
  communityName: string;
  canModerate: boolean;
};

export type AppTabsParamList = {
  Home: undefined;
  // NavigatorScreenParams so other tabs (e.g. Home) can deep-link into the Events
  // stack, e.g. navigate("Events", { screen: "CommunityDetail", params: { id } }).
  Events: NavigatorScreenParams<EventsStackParamList>;
  Chat: NavigatorScreenParams<ChatStackParamList>;
  ProfileTab: undefined;
};

export type EventsStackParamList = {
  EventsHome: undefined;
  EventDetail: { id: string };
  CreateEvent: { communityId: string };
  CommunityDetail: { id: string };
  CreateCommunity: undefined;
  ChatThread: ChatThreadParams;
};

export type ChatStackParamList = {
  ChatInbox: undefined;
  ChatThread: ChatThreadParams;
};

export type ProfileStackParamList = {
  ProfileHome: undefined;
  BlockedUsers: undefined;
};

const Tabs = createBottomTabNavigator<AppTabsParamList>();
const EventsStackNav = createNativeStackNavigator<EventsStackParamList>();
const ChatStackNav = createNativeStackNavigator<ChatStackParamList>();
const ProfileStackNav = createNativeStackNavigator<ProfileStackParamList>();

function EventsStack() {
  const { colors } = useTheme();
  return (
    <EventsStackNav.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: "transparent" },
        // iOS: show just the back chevron, never the previous screen's title as
        // a label (it otherwise falls back to the English route name, and the
        // label shows/hides inconsistently across devices).
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <EventsStackNav.Screen
        name="EventsHome"
        component={EventsScreen}
        options={{ headerShown: false }}
      />
      <EventsStackNav.Screen
        name="EventDetail"
        component={EventDetailScreen}
        // No native header: the screen is full-bleed so the banner runs
        // edge-to-edge under the status bar (immersive, per the mockup). The
        // screen renders its own floating back button.
        options={{ headerShown: false }}
      />
      <EventsStackNav.Screen
        name="CreateEvent"
        component={CreateEventScreen}
        options={{ title: strings.events.createTitle }}
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
      <EventsStackNav.Screen
        name="ChatThread"
        component={ChatThreadScreen}
        options={{ title: "" }}
      />
    </EventsStackNav.Navigator>
  );
}

function ChatStack() {
  const { colors } = useTheme();
  return (
    <ChatStackNav.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: "transparent" },
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <ChatStackNav.Screen
        name="ChatInbox"
        component={ChatInboxScreen}
        options={{ headerShown: false }}
      />
      <ChatStackNav.Screen
        name="ChatThread"
        component={ChatThreadScreen}
        options={{ title: "" }}
      />
    </ChatStackNav.Navigator>
  );
}

function ProfileStack() {
  const { colors } = useTheme();
  return (
    <ProfileStackNav.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: "transparent" },
        // iOS: show just the back chevron, never the previous screen's title as
        // a label (it otherwise falls back to the English route name, and the
        // label shows/hides inconsistently across devices).
        headerBackButtonDisplayMode: "minimal",
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
  const insets = useSafeAreaInsets();
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          // A bit taller than the default, with the icon + label vertically
          // centered above the home-indicator safe area (symmetric padding).
          height: 60 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
        },
      }}
    >
      <Tabs.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: strings.tabs.home,
          tabBarIcon: ({ color, size }) => <House size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="Events"
        component={EventsStack}
        options={{
          title: strings.tabs.events,
          tabBarIcon: ({ color, size }) => (
            <CalendarMinus size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="Chat"
        component={ChatStack}
        options={{
          title: strings.tabs.chat,
          tabBarIcon: ({ color, size }) => (
            <ChatsTeardrop size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{
          title: strings.tabs.profile,
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
    </Tabs.Navigator>
  );
}
