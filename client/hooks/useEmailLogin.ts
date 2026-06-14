import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { login } from "@/lib/api/auth";
import { validateEmail, isNonEmpty } from "@/validation/auth";
import { fieldErrorMessage, apiErrorMessage } from "@/lib/messages";
import { strings } from "@/i18n";

// Email/password login form state + submit, extracted so LoginScreen stays
// mostly composition (ENGINEERING_STANDARDS §1). This design has no inline
// field-error slots, so validation + API errors surface through a single
// `formError` banner. Login never hints the password policy — an empty password
// reads as generic invalid credentials.

export type UseEmailLogin = {
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  showPassword: boolean;
  toggleShowPassword: () => void;
  formError: string | null;
  submitting: boolean;
  submit: () => Promise<void>;
};

export function useEmailLogin(): UseEmailLogin {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setFormError(null);
    const emailError = validateEmail(email);
    if (emailError) {
      setFormError(fieldErrorMessage(emailError));
      return;
    }
    if (!isNonEmpty(password)) {
      setFormError(strings.errors.invalidCredentials);
      return;
    }

    setSubmitting(true);
    const result = await login(email.trim().toLowerCase(), password);
    setSubmitting(false);

    if (result.ok) {
      await signIn(result.data);
    } else {
      setFormError(apiErrorMessage(result.error));
    }
  }

  return {
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    toggleShowPassword: () => setShowPassword((v) => !v),
    formError,
    submitting,
    submit,
  };
}
