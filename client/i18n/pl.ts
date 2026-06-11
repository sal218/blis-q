// Polish copy for Blis-Q (the only locale in v1; app ships Polish, LTR). All
// user-facing strings live here — screens never inline literals — so a future
// locale is a new file plus a map entry, with no screen changes. Interpolation
// tokens use {name}; resolve them with format() from ./index.
//
// Tone: warm, plain, safety-first. Error copy is deliberately generic and does
// NOT reveal whether an account/email exists (mirrors the backend's uniform,
// enumeration-resistant responses).

export const pl = {
  common: {
    appName: "Blis-Q",
    continue: "Dalej",
    back: "Wstecz",
    cancel: "Anuluj",
    loading: "Ładowanie…",
    email: "E-mail",
    emailPlaceholder: "twoj@email.pl",
    password: "Hasło",
    displayName: "Nazwa wyświetlana",
    displayNamePlaceholder: "Jak mamy się do Ciebie zwracać?",
    show: "Pokaż",
    hide: "Ukryj",
    signOut: "Wyloguj się",
  },

  welcome: {
    tagline: "Bezpieczna przestrzeń dla osób LGBT+ w Polsce",
    signIn: "Zaloguj się",
    createAccount: "Załóż konto",
    continueWithGoogle: "Kontynuuj z Google",
  },

  signUp: {
    title: "Załóż konto",
    subtitle: "Dołącz do społeczności Blis-Q",
    submit: "Załóż konto",
    haveAccount: "Masz już konto? Zaloguj się",
  },

  checkEmail: {
    title: "Sprawdź swoją skrzynkę",
    body: "Wysłaliśmy link weryfikacyjny na adres {email}. Kliknij w niego, aby aktywować konto.",
    resend: "Wyślij link ponownie",
    resent: "Jeśli konto wymaga weryfikacji, wysłaliśmy link ponownie.",
    backToLogin: "Wróć do logowania",
  },

  login: {
    title: "Zaloguj się",
    subtitle: "Witaj ponownie",
    submit: "Zaloguj się",
    forgotPassword: "Nie pamiętasz hasła?",
    noAccount: "Nie masz konta? Załóż je",
    needVerify: "Nie otrzymałeś linku weryfikacyjnego?",
  },

  forgotPassword: {
    title: "Reset hasła",
    subtitle:
      "Podaj swój adres e-mail, a wyślemy Ci link do zresetowania hasła.",
    submit: "Wyślij link",
    done: "Jeśli konto istnieje, wysłaliśmy link do resetu hasła na podany adres.",
    backToLogin: "Wróć do logowania",
  },

  resetPassword: {
    title: "Ustaw nowe hasło",
    subtitle: "Wpisz nowe hasło do swojego konta.",
    newPassword: "Nowe hasło",
    submit: "Zapisz nowe hasło",
    success: "Hasło zostało zmienione. Możesz się teraz zalogować.",
    invalidLink: "Ten link jest nieprawidłowy lub wygasł. Poproś o nowy.",
    backToLogin: "Wróć do logowania",
  },

  consent: {
    title: "Zgody",
    intro: "Aby założyć konto, potrzebujemy Twojej wyraźnej zgody.",
    accountCreation:
      "Zakładam konto i akceptuję Regulamin oraz Politykę prywatności.",
    marketing: "Chcę otrzymywać wiadomości marketingowe (opcjonalnie).",
    analytics:
      "Zgadzam się na anonimową analitykę, aby ulepszać aplikację (opcjonalnie).",
    location:
      "Zgadzam się na wykorzystanie miasta z mojego profilu (opcjonalnie).",
    requiredBadge: "wymagane",
    confirm: "Akceptuję i kontynuuję",
    legalIntro: "Zapoznaj się z dokumentami:",
    terms: "Regulamin",
    privacy: "Polityka prywatności",
    legalUnavailable:
      "Regulamin i Polityka prywatności będą dostępne przed premierą.",
    googleTitle: "Jeszcze jeden krok",
    googleIntro:
      "Aby dokończyć rejestrację przez Google, potwierdź wymagane zgody.",
  },

  errors: {
    generic: "Coś poszło nie tak. Spróbuj ponownie.",
    network: "Brak połączenia. Sprawdź internet i spróbuj ponownie.",
    invalidCredentials: "Nieprawidłowy e-mail lub hasło.",
    rateLimited: "Zbyt wiele prób. Spróbuj ponownie za {seconds} s.",
    emailInvalid: "Podaj poprawny adres e-mail.",
    passwordTooShort: "Hasło musi mieć co najmniej {min} znaków.",
    displayNameRequired: "Podaj nazwę wyświetlaną.",
    consentRequired: "Musisz zaakceptować wymaganą zgodę.",
    googleFailed: "Logowanie przez Google nie powiodło się.",
    googleCancelled: "Logowanie przez Google zostało anulowane.",
  },
} as const;
