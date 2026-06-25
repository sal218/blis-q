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

  // Bottom tabs (post-login IA): Home · Events · Chat · Profile.
  tabs: {
    home: "Strona główna",
    events: "Wydarzenia",
    chat: "Czat",
    profile: "Profil",
  },

  // Home tab — placeholder this slice (design ref: home-screen.png).
  home: {
    title: "Strona główna",
    comingSoon: "Twój kanał społeczności pojawi się wkrótce.",
  },

  // Chat tab — placeholder this slice (design ref: chat-screen.png).
  chat: {
    title: "Czat",
    comingSoon: "Czat pojawi się wkrótce.",
  },

  // Events tab: a segmented section (Events / Safe places / Communities). Only
  // Communities is built this slice; the other two are placeholders.
  events: {
    title: "Wydarzenia",
    tabEvents: "Wydarzenia",
    tabSafePlaces: "Bezpieczne miejsca",
    tabCommunities: "Społeczności",
    eventsComingSoon: "Wydarzenia pojawią się wkrótce.",
    safePlacesComingSoon: "Bezpieczne miejsca pojawią się wkrótce.",
  },

  profile: {
    title: "Profil",
    appearance: "Wygląd",
    theme: "Motyw",
    themeDark: "Ciemny",
    themeLight: "Jasny",
    blockedUsers: "Blokowani użytkownicy",
    blockedEmpty: "Nie masz zablokowanych użytkowników.",
    blockedLoadError: "Nie udało się załadować listy. Spróbuj ponownie.",
    unblock: "Odblokuj",
    unblockError: "Nie udało się odblokować użytkownika. Spróbuj ponownie.",
  },

  communities: {
    searchPlaceholder: "Szukaj społeczności",
    empty: "Nie ma jeszcze żadnych społeczności.",
    emptySearch: "Brak wyników dla tego wyszukiwania.",
    loadError: "Nie udało się załadować społeczności.",
    retry: "Spróbuj ponownie",
    create: "Załóż społeczność",
    members: "Członkowie: {count}",
    joined: "Dołączono",
    join: "Dołącz",
    leave: "Opuść",
    about: "O społeczności",
    notFound: "Nie znaleziono tej społeczności.",
    alreadyMember: "Już należysz do tej społeczności.",
    leaveSoleAdmin:
      "Społeczność musi mieć co najmniej jednego administratora. Najpierw przekaż tę rolę.",
    joinError: "Nie udało się dołączyć. Spróbuj ponownie.",
    leaveError: "Nie udało się opuścić społeczności. Spróbuj ponownie.",
    createTitle: "Załóż społeczność",
    nameLabel: "Nazwa",
    namePlaceholder: "Nazwa społeczności",
    descriptionLabel: "Opis (opcjonalnie)",
    descriptionPlaceholder: "O czym jest ta społeczność?",
    createError: "Nie udało się założyć społeczności. Spróbuj ponownie.",
    nameRequired: "Podaj nazwę społeczności.",
    nameTooLong: "Nazwa może mieć maksymalnie {max} znaków.",
    descriptionTooLong: "Opis może mieć maksymalnie {max} znaków.",
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
    taglinePrimary: "Społeczność. Wydarzenia. Wsparcie. Bezpieczeństwo.",
    taglineAccent: "Razem jest nam bliżej.",
    emailPlaceholder: "E-mail",
    passwordPlaceholder: "Hasło",
    submit: "Zaloguj się",
    forgotPassword: "Nie pamiętasz hasła?",
    orContinue: "lub kontynuuj przez",
    continueWithApple: "Kontynuuj z Apple",
    continueWithGoogle: "Kontynuuj z Google",
    appleUnavailable: "Logowanie przez Apple będzie dostępne wkrótce.",
    noAccountPrompt: "Nie masz konta?",
    signUpLink: "Załóż konto",
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

  // Community posts feed + report (design ref: event-communities-details-screen.png,
  // "Feed" tab). Read-only this slice — composing a post comes later.
  posts: {
    tabAbout: "Informacje", // segment: About
    tabFeed: "Tablica", // segment: Feed
    empty: "Nie ma jeszcze wpisów. Zajrzyj tu później.", // no posts yet
    retry: "Spróbuj ponownie", // retry
    deleted: "Ten wpis został usunięty.", // deleted-post tombstone
    notAvailable: "Ten wpis nie jest już dostępny.", // 404 on report/refresh
    moreActions: "Opcje wpisu", // ⋯ accessibility label
    report: "Zgłoś", // report action
    reportTitle: "Zgłoś wpis", // report modal title
    reportReasonPlaceholder: "Opisz, co jest nie tak z tym wpisem",
    // Data-minimising helper — the reason is sent to moderators and stored.
    reportReasonHelper:
      "Twoje zgłoszenie trafi do moderatorów. Nie podawaj zbędnych danych osobowych ani wrażliwych.",
    reportReasonRequired: "Proszę podać powód zgłoszenia.", // empty-reason validation (polite)
    reportSubmit: "Wyślij zgłoszenie", // submit
    reportSuccess: "Dziękujemy. Zgłoszenie zostało wysłane.", // success toast
    // Relative timestamps (abbreviated units avoid Polish plural complexity).
    timeNow: "przed chwilą",
    timeMinutes: "{count} min temu",
    timeHours: "{count} godz. temu",
    timeDays: "{count} dni temu",
    // Compose (members)
    compose: "Dodaj wpis", // compose entry button
    composeTitle: "Nowy wpis", // compose modal title
    composePlaceholder: "Podziel się czymś ze społecznością", // composer placeholder
    composeSubmit: "Opublikuj", // publish
    composeRequired: "Napisz coś, aby opublikować wpis.", // empty-content validation (gentle)
    // Delete-own
    delete: "Usuń", // delete action
    deleteConfirmTitle: "Usunąć wpis?", // delete confirm title
    deleteConfirmBody: "Tej operacji nie można cofnąć.", // delete confirm body
    // Shared
    forbidden: "Nie masz uprawnień do tej akcji.", // 403 on create/delete
  },

  // Account-suspended screen (P-20): shown when a banned user is blocked — at
  // login or when an authenticated request returns 403 account_suspended. Tone is
  // calm and non-shaming (safety-first; this is a vulnerable audience).
  accountSuspended: {
    title: "Konto zostało zawieszone", // "Your account has been suspended"
    // "Access to your account has been temporarily suspended. If you think this
    // is a mistake, contact us."
    body: "Dostęp do Twojego konta został tymczasowo zawieszony. Jeśli uważasz, że to pomyłka, skontaktuj się z nami.",
    appeal: "Skontaktuj się z nami", // "Contact us" (appeal CTA → mailto)
    // Honest fallback when no support email is configured yet (no dead link).
    appealUnavailable: "Możliwość odwołania będzie dostępna wkrótce.", // "Appeals will be available soon."
    backToLogin: "Wróć do logowania", // "Back to login"
  },

  errors: {
    generic: "Coś poszło nie tak. Spróbuj ponownie.",
    network: "Brak połączenia. Sprawdź internet i spróbuj ponownie.",
    invalidCredentials: "Nieprawidłowy e-mail lub hasło.",
    // Shown on the login screen after an expired session couldn't be refreshed (P-10).
    sessionExpired: "Twoja sesja wygasła. Zaloguj się ponownie.", // "Your session expired. Please log in again."
    rateLimited: "Zbyt wiele prób. Spróbuj ponownie za {seconds} s.",
    emailInvalid: "Podaj poprawny adres e-mail.",
    passwordTooShort: "Hasło musi mieć co najmniej {min} znaków.",
    displayNameRequired: "Podaj nazwę wyświetlaną.",
    consentRequired: "Musisz zaakceptować wymaganą zgodę.",
    googleFailed: "Logowanie przez Google nie powiodło się.",
    googleCancelled: "Logowanie przez Google zostało anulowane.",
  },
} as const;
