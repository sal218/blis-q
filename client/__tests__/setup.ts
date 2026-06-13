// Global test setup for the client (jest-expo) test environment.
//
// Native modules that have no JS implementation under jest are mocked here so
// any module that imports them can load. Behaviour-specific assertions override
// these per-test.

// expo-secure-store → in-memory map. Lets session-persistence logic be tested
// for real (set → get → delete) without a native keychain.
jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) =>
      store.has(key) ? store.get(key)! : null,
    ),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

// Safe-area context: provide static insets so screens using useSafeAreaInsets
// render without a real SafeAreaProvider measuring the device. The provider
// mocks just render their children (a function component may return a ReactNode).
jest.mock("react-native-safe-area-context", () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  const passthrough = ({ children }: { children: React.ReactNode }) => children;
  return {
    SafeAreaProvider: passthrough,
    SafeAreaView: passthrough,
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { insets: inset, frame },
  };
});

// Theme context: components read colours via useTheme(), which throws outside a
// ThemeProvider. Globally mock it so every component test gets a working theme
// without wrapping in a provider (behaviour tests don't assert colours). The
// REAL ThemeContext (toggle/persist/rehydrate) is exercised via requireActual in
// its own unit test. Palette is inlined here (the factory can't reference outer
// scope or require()).
jest.mock("@/contexts/ThemeContext", () => {
  const colors = {
    primary: "#8B73FF",
    primaryDark: "#6D4AFF",
    accent: "#A78BFA",
    background: "#16122E",
    surface: "#221B42",
    text: "#F5F5F7",
    textMuted: "#A9A4C0",
    border: "#332A55",
    danger: "#F87171",
    success: "#34D399",
  };
  return {
    useTheme: () => ({
      colors,
      mode: "dark",
      isReady: true,
      setMode: jest.fn(),
      toggleMode: jest.fn(),
    }),
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

// The native Google Sign-In module has no JS fallback under jest. Tests that
// exercise the Google flow mock our wrapper (@/lib/googleAuth) instead; this
// just keeps imports resolvable.
jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(),
    signOut: jest.fn(),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: "SIGN_IN_CANCELLED",
    IN_PROGRESS: "IN_PROGRESS",
    PLAY_SERVICES_NOT_AVAILABLE: "PLAY_SERVICES_NOT_AVAILABLE",
  },
}));
