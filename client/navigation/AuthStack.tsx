import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/navigation/types";
import { SignUpScreen } from "@/screens/auth/SignUpScreen";
import { CheckEmailScreen } from "@/screens/auth/CheckEmailScreen";
import { LoginScreen } from "@/screens/auth/LoginScreen";
import { ForgotPasswordScreen } from "@/screens/auth/ForgotPasswordScreen";
import { ResetPasswordScreen } from "@/screens/auth/ResetPasswordScreen";

// The unauthenticated navigation stack. The login-first entry (LoginScreen) is
// the initial route. Headers are hidden — each screen renders its own header —
// and back navigation is via the in-screen links plus the platform back gesture
// / hardware back button.

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{
        headerShown: false,
        // Transparent so the app-wide ScreenBackground shows through.
        contentStyle: { backgroundColor: "transparent" },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="CheckEmail" component={CheckEmailScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </Stack.Navigator>
  );
}
