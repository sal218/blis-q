import * as Linking from "expo-linking";
import type { LinkingOptions } from "@react-navigation/native";
import type { AuthStackParamList } from "@/navigation/types";

// Deep-link configuration for the auth stack. The reset-password link is the one
// that matters: blisq://reset-password?token=… (and the same path on the web app
// once universal/app links are configured at provisioning). React Navigation maps
// the ?token query into ResetPassword's `token` param; the screen captures it and
// immediately scrubs it from navigation state (P-9).
//
// ⚠️ Provisioning follow-up: configure iOS Associated Domains / Android App Links
// so the emailed https://<web>/reset-password link opens the app directly. Until
// then the blisq:// scheme deep link works for testing.

const prefixes = [Linking.createURL("/")];
const webUrl = process.env.EXPO_PUBLIC_WEB_APP_URL;
if (webUrl) prefixes.push(webUrl);

export const linking: LinkingOptions<AuthStackParamList> = {
  prefixes,
  config: {
    screens: {
      Welcome: "",
      SignUp: "signup",
      Login: "login",
      CheckEmail: "check-email",
      ForgotPassword: "forgot-password",
      ResetPassword: "reset-password",
    },
  },
};
