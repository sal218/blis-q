import type { NativeStackScreenProps } from "@react-navigation/native-stack";

// Param list for the unauthenticated auth stack. Screens receive typed
// navigation + route props from this.
//
// ResetPassword carries the raw reset token from the deep link. It is consumed
// immediately on mount and then stripped from the navigation state (P-9 — the
// token must not linger in retained nav/link state); see ResetPasswordScreen.
export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
  CheckEmail: { email: string };
  ForgotPassword: undefined;
  ResetPassword: { token?: string };
};

export type AuthScreenProps<T extends keyof AuthStackParamList> =
  NativeStackScreenProps<AuthStackParamList, T>;
