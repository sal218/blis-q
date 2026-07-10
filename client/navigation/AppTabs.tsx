import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  House,
  CalendarMinus,
  ChatsTeardrop,
  User,
  BookOpen,
} from "@/components/icons/PhosphorIcons";
import type { NavigatorScreenParams } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTheme } from "@/contexts/ThemeContext";
import { HomeScreen } from "@/screens/HomeScreen";
import { EventsScreen } from "@/screens/events/EventsScreen";
import { EventDetailScreen } from "@/screens/events/EventDetailScreen";
import { SafePlaceDetailScreen } from "@/screens/events/SafePlaceDetailScreen";
import { SavedScreen } from "@/screens/events/SavedScreen";
import { CreateEventScreen } from "@/screens/events/CreateEventScreen";
import { CommunityDetailScreen } from "@/screens/communities/CommunityDetailScreen";
import { CreateCommunityScreen } from "@/screens/communities/CreateCommunityScreen";
import { ChatInboxScreen } from "@/screens/chat/ChatInboxScreen";
import { ChatThreadScreen } from "@/screens/chat/ChatThreadScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";
import { BlockedUsersScreen } from "@/screens/BlockedUsersScreen";
import { AboutScreen } from "@/screens/AboutScreen";
import { ResourcesScreen } from "@/screens/resources/ResourcesScreen";
import { ResourceDetailScreen } from "@/screens/resources/ResourceDetailScreen";
import { CrisisScreen } from "@/screens/crisis/CrisisScreen";
import { strings } from "@/i18n";

// Authenticated app shell. Post-login IA: bottom tabs Home · Events · Wsparcie ·
// Chat · Profile. The Events tab is a stack: its landing screen hosts a segmented
// control (Events / Safe places / Communities) and pushes Community detail/create
// on top. The Wsparcie (Resources / Support & Education, P-37) tab is a stack:
// its directory screen (search + category chips + featured + list) pushes a
// resource detail. The Chat tab is a stack:
// the Messages inbox pushes the chat thread. Profile is a stack so it can host
// the blocked-users screen. (There is intentionally no Communities tab —
// communities live under Events → Communities.)

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
  Resources: NavigatorScreenParams<ResourcesStackParamList>;
  Chat: NavigatorScreenParams<ChatStackParamList>;
  ProfileTab: undefined;
};

export type ResourcesStackParamList = {
  ResourcesHome: undefined;
  ResourceDetail: { id: string };
  // Crisis / safety page ("Pomoc w kryzysie", P-37) — reached from the crisis-help
  // (phone-call) button in each primary screen's header. Lives in this stack so the
  // tab bar stays visible (per the light mockup); slice 3b rolled the header button
  // out app-wide (Home/Events/Wsparcie/Chat/Profile) via the shared
  // CrisisHeaderButton, cross-navigating here from the other tabs.
  Crisis: undefined;
};

export type EventsStackParamList = {
  EventsHome: undefined;
  EventDetail: { id: string };
  SafePlaceDetail: { id: string };
  Saved: undefined;
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
  About: undefined;
};

const Tabs = createBottomTabNavigator<AppTabsParamList>();
const EventsStackNav = createNativeStackNavigator<EventsStackParamList>();
const ResourcesStackNav = createNativeStackNavigator<ResourcesStackParamList>();
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
        name="SafePlaceDetail"
        component={SafePlaceDetailScreen}
        // Full-bleed banner like EventDetail — the screen owns its back button.
        options={{ headerShown: false }}
      />
      <EventsStackNav.Screen
        name="Saved"
        component={SavedScreen}
        options={{ headerShown: false }}
      />
      <EventsStackNav.Screen
        name="CreateEvent"
        component={CreateEventScreen}
        options={{ headerShown: false }}
      />
      <EventsStackNav.Screen
        name="CommunityDetail"
        component={CommunityDetailScreen}
        options={{ headerShown: false }}
      />
      <EventsStackNav.Screen
        name="CreateCommunity"
        component={CreateCommunityScreen}
        options={{ headerShown: false }}
      />
      <EventsStackNav.Screen
        name="ChatThread"
        component={ChatThreadScreen}
        options={{ headerShown: false }}
      />
    </EventsStackNav.Navigator>
  );
}

function ResourcesStack() {
  const { colors } = useTheme();
  return (
    <ResourcesStackNav.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: "transparent" },
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <ResourcesStackNav.Screen
        name="ResourcesHome"
        component={ResourcesScreen}
        // The directory owns its header + search + filters, so no native bar.
        options={{ headerShown: false }}
      />
      <ResourcesStackNav.Screen
        name="ResourceDetail"
        component={ResourceDetailScreen}
        // Full-bleed: the screen renders its own floating back button.
        options={{ headerShown: false }}
      />
      <ResourcesStackNav.Screen
        name="Crisis"
        component={CrisisScreen}
        // The screen owns its header + back button (no native bar).
        options={{ headerShown: false }}
      />
    </ResourcesStackNav.Navigator>
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
        options={{ headerShown: false }}
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
        options={{ headerShown: false }}
      />
      <ProfileStackNav.Screen
        name="About"
        component={AboutScreen}
        options={{ headerShown: false }}
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
        listeners={({ navigation }) => ({
          // Tapping the Events tab always lands on the events LIST — even when
          // arriving from another tab that pushed an EventDetail/CommunityDetail
          // into the Events stack. Without this, a cross-tab navigate leaves the
          // stack on the detail screen (no pop-to-top fires across tabs), so the
          // list becomes unreachable. Navigating to EventsHome pops back to it.
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate("Events", { screen: "EventsHome" });
          },
        })}
        options={{
          title: strings.tabs.events,
          tabBarIcon: ({ color, size }) => (
            <CalendarMinus size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="Resources"
        component={ResourcesStack}
        listeners={({ navigation }) => ({
          // Tapping the Wsparcie tab always lands on the Resources LIST — even
          // after another tab cross-navigated into this stack's Crisis (safety)
          // screen. Without this, that cross-tab navigate leaves the stack on
          // Crisis (no pop-to-top fires across tabs), so the Wsparcie list
          // becomes unreachable. Mirrors the Events tab's reset above.
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate("Resources", { screen: "ResourcesHome" });
          },
        })}
        options={{
          title: strings.tabs.resources,
          tabBarIcon: ({ color, size }) => (
            <BookOpen size={size} color={color} />
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
