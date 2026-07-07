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

  // Bottom tabs (post-login IA): Home · Events · Wsparcie · Chat · Profile.
  tabs: {
    home: "Strona główna",
    events: "Wydarzenia",
    resources: "Wsparcie", // "Support" — the Resources tab (P-37)
    chat: "Czat",
    profile: "Profil",
  },

  // Home tab (design ref: home-screen.png). Greeting + "your communities" rail
  // (live) + placeholder sections for events/safe-places/activity (Wkrótce).
  home: {
    title: "Strona główna",
    greeting: "Cześć, {name} 👋", // "Hi, {name} 👋"
    greetingNoName: "Cześć 👋", // greeting when no display name is set
    subtitle: "Oto co dzieje się w Twojej społeczności.", // "Here's what's happening in your community."
    yourCommunities: "Twoje społeczności", // "Your communities"
    seeAll: "Zobacz wszystkie", // "See all"
    noCommunities: "Nie należysz jeszcze do żadnej społeczności.", // "You're not in any community yet."
    upcomingEvents: "Nadchodzące wydarzenia", // "Upcoming events"
    noUpcomingEvents: "Nie wybierasz się jeszcze na żadne wydarzenia.", // "You're not going to any events yet."
    nearbyPlaces: "Bezpieczne miejsca w pobliżu", // "Nearby safe places"
    latestActivity: "Najnowsze ze społeczności", // "Latest from your communities"
    // Polished empty states for the sections whose data doesn't exist yet.
    eventsEmpty: "Wydarzenia pojawią się wkrótce.", // "Events will appear soon."
    placesEmpty: "Bezpieczne miejsca pojawią się wkrótce.", // "Safe places will appear soon."
    activityEmpty: "Aktywność pojawi się wkrótce.", // "Activity will appear soon."
  },

  // Chat tab placeholder (design ref: chat-screen.png) + the community chat
  // THREAD (design ref: chat-groupchat-details-screen.png). The Messages inbox
  // (Chat tab root) lands in P-24b; the thread is reached from a community for now.
  chat: {
    title: "Czat",
    comingSoon: "Czat pojawi się wkrótce.", // "Chat coming soon."
    open: "Czat", // button on the community screen → opens that community's chat
    // Messages inbox (Chat tab root, P-24b/P-24c)
    messagesTitle: "Wiadomości", // "Messages" — the inbox screen title
    noMessagesYet: "Brak wiadomości", // preview when a community chat has no messages
    inboxEmpty:
      "Nie masz jeszcze żadnych czatów. Dołącz do społeczności, aby zacząć.", // no joined communities
    yesterday: "Wczoraj", // inbox timestamp for a message sent yesterday
    searchPlaceholder: "Szukaj wiadomości", // inbox search field ("Search messages")
    searchEmpty: "Brak wyników", // no chats match the search query
    composerPlaceholder: "Napisz wiadomość…", // "Write a message…"
    send: "Wyślij", // "Send"
    empty: "Brak wiadomości. Napisz pierwszą.", // "No messages. Write the first one."
    loadError: "Nie udało się załadować czatu.", // "Couldn't load the chat."
    retry: "Spróbuj ponownie", // "Try again"
    deleted: "Ta wiadomość została usunięta.", // deleted-message tombstone
    sendError: "Nie udało się wysłać wiadomości.", // send failure
    notAvailable: "Ta wiadomość nie jest już dostępna.", // 404 on report/delete
    forbidden: "Nie masz uprawnień do tej akcji.", // 403
    // Per-message long-press actions
    messageActions: "Opcje wiadomości", // a11y label / action-sheet title
    report: "Zgłoś", // "Report"
    reportTitle: "Zgłoś wiadomość", // report modal title (passed to ReportPostModal)
    reportReasonPlaceholder: "Opisz, co jest nie tak z tą wiadomością",
    reportSuccess: "Dziękujemy. Zgłoszenie zostało wysłane.", // success toast
    delete: "Usuń", // "Delete"
    deleteConfirmTitle: "Usunąć wiadomość?", // "Delete message?"
    deleteConfirmBody: "Tej operacji nie można cofnąć.", // "This can't be undone."
  },

  // Events tab: a segmented section (Events / Safe places / Communities). Events
  // + Communities are built; Safe places stays a placeholder (Sprint 7, P-13).
  events: {
    title: "Wydarzenia", // "Events"
    tabEvents: "Wydarzenia",
    tabSafePlaces: "Bezpieczne miejsca", // "Safe places"
    tabCommunities: "Społeczności", // "Communities"
    safePlacesComingSoon: "Bezpieczne miejsca pojawią się wkrótce.",

    // Feed (the Events segment)
    searchPlaceholder: "Szukaj wydarzeń", // "Search events"
    empty: "Nie ma jeszcze żadnych nadchodzących wydarzeń.", // "No upcoming events yet."
    emptySearch: "Brak wyników dla tego wyszukiwania.", // "No results for this search."
    emptyCategory: "Brak wydarzeń w tej kategorii.", // "No events in this category."
    loadError: "Nie udało się załadować wydarzeń.", // "Couldn't load events."
    retry: "Spróbuj ponownie", // "Try again"
    goingCount: "{count} idzie", // "{count} going" (legacy; prefer goingLabel())
    // Attendee count with Polish plural of "osoba" (person) — see goingLabel().
    goingOne: "1 osoba idzie", // exactly one
    goingFew: "{count} osoby idą", // 2–4 (not 12–14)
    goingMany: "{count} osób idzie", // 0, 5+, and the teens

    // Categories (slice D2). Keys MUST match EVENT_CATEGORIES in shared/types.ts.
    // Coarse event-TYPE labels — never identity/orientation (Article 9).
    filterAll: "Wszystkie", // "All" — the feed filter chip that clears the category
    categoryLabel: "Kategoria (opcjonalnie)", // create-form picker label
    categories: {
      social: "Towarzyskie", // "Social"
      support: "Wsparcie", // "Support"
      activism: "Aktywizm", // "Activism"
      education: "Edukacja", // "Education"
      culture: "Kultura", // "Culture"
      sports: "Sport", // "Sports"
      health: "Zdrowie", // "Health"
      other: "Inne", // "Other"
    },

    // Detail
    detailLoadError: "Nie udało się załadować wydarzenia.", // "Couldn't load the event."
    whenLabel: "Kiedy", // "When"
    whereLabel: "Gdzie", // "Where"
    aboutLabel: "O wydarzeniu", // "About"
    noLocation: "Miejsce zostanie podane", // "Location to be announced"
    noDescription: "Brak opisu.", // "No description."

    // RSVP
    rsvpPrompt: "Twoja odpowiedź", // "Your RSVP"
    rsvpGoing: "Pójdę", // "Going"
    rsvpInterested: "Interesuje mnie", // "Interested"
    rsvpNotGoing: "Nie pójdę", // "Not going"
    rsvpError: "Nie udało się zapisać odpowiedzi. Spróbuj ponownie.", // "Couldn't save your RSVP."

    // API error copy
    notAvailable: "To wydarzenie nie jest już dostępne.", // "This event is no longer available."
    rsvpForbidden: "Dołącz do społeczności, aby potwierdzić udział.", // "Join the community to RSVP."
    rsvpUnavailable: "To wydarzenie zostało odwołane lub już się odbyło.", // 409 — "This event was cancelled or has already taken place."

    // Detail ⋯ overflow menu + report
    moreActions: "Więcej opcji", // "More options" (the ⋯ a11y label)
    reportEvent: "Zgłoś wydarzenie", // "Report event" (menu row)
    reportTitle: "Zgłoś wydarzenie", // report modal title
    reportPlaceholder: "Opisz, co jest nie tak z tym wydarzeniem", // "Describe what's wrong with this event"

    // Cancelled / past states (slice B2)
    cancelledNotice: "To wydarzenie zostało odwołane.", // "This event was cancelled."
    pastNotice: "To wydarzenie już się odbyło.", // "This event has already taken place."
    rsvpClosedCancelled: "Wydarzenie odwołane", // disabled RSVP bar — cancelled
    rsvpClosedPast: "Wydarzenie minęło", // disabled RSVP bar — past
    cancelAction: "Anuluj wydarzenie", // ⋯ row + the destructive confirm button
    cancelConfirmTitle: "Anulować wydarzenie?", // "Cancel this event?"
    cancelConfirmBody:
      "Uczestnicy zobaczą, że wydarzenie zostało odwołane. Tej operacji nie można cofnąć.", // "Attendees will see it was cancelled. This can't be undone."
    cancelForbidden: "Nie możesz anulować tego wydarzenia.", // 403 — "You can't cancel this event."
    cancelError: "Nie udało się anulować wydarzenia. Spróbuj ponownie.", // generic cancel failure

    // Save / bookmark (slice C2)
    saveAction: "Zapisz", // "Save" (not-yet-saved)
    savedAction: "Zapisano", // "Saved" (already saved)
    savedTitle: "Zapisane", // saved-events screen title
    savedEmpty: "Nie masz jeszcze zapisanych wydarzeń.", // "You have no saved events yet."
    savedLoadError: "Nie udało się załadować zapisanych wydarzeń.", // saved-list load error
    saveError: "Nie udało się zapisać wydarzenia. Spróbuj ponownie.", // toggle-save failure

    // Create event (form on Community detail)
    createCta: "Utwórz wydarzenie", // "Create event" (the entry button)
    createTitle: "Nowe wydarzenie", // "New event" (screen header)
    createSubtitle: "Stwórz wydarzenie dla społeczności", // "Create an event for the community"
    titleLabel: "Tytuł", // "Title"
    titlePlaceholder: "Nazwa wydarzenia", // "Event name"
    descriptionLabel: "Opis (opcjonalnie)", // "Description (optional)"
    descriptionPlaceholder: "Szczegóły wydarzenia", // "Event details"
    locationLabel: "Miejsce (opcjonalnie)", // "Location (optional)"
    locationPlaceholder: "Adres lub nazwa miejsca", // "Address or venue name"
    startLabel: "Początek", // "Start"
    endLabel: "Koniec", // "End"
    addEnd: "Dodaj godzinę zakończenia", // "Add end time"
    removeEnd: "Usuń godzinę zakończenia", // "Remove end time"
    create: "Utwórz wydarzenie", // "Create event" (submit)
    createError: "Nie udało się utworzyć wydarzenia. Spróbuj ponownie.", // "Couldn't create the event."
    // Field errors
    titleRequired: "Podaj tytuł wydarzenia.", // "Enter an event title."
    titleTooLong: "Tytuł może mieć maksymalnie {max} znaków.", // "Title max {max} chars."
    descriptionTooLong: "Opis może mieć maksymalnie {max} znaków.", // "Description max {max} chars."
    locationTooLong: "Miejsce może mieć maksymalnie {max} znaków.", // "Location max {max} chars."
    endBeforeStart: "Koniec musi być po początku.", // "End must be after the start."
    // Create API error copy
    createForbidden:
      "Musisz być członkiem tej społeczności, aby utworzyć wydarzenie.", // "You must be a member of this community to create an event."
    createCommunityGone: "Tej społeczności już nie ma.", // "This community no longer exists."
  },

  // Safe Places — the mobile list (epic P-40 slice SP-3).
  safePlaces: {
    searchPlaceholder: "Szukaj miejsca lub miasta", // "Search a place or city"
    clear: "Wyczyść wyszukiwanie", // "Clear search" (a11y label for the ✕)
    filterAll: "Wszystkie", // "All" — the category filter chip that clears
    empty: "Nie ma jeszcze żadnych bezpiecznych miejsc.", // "No safe places yet."
    emptyCategory: "Brak miejsc w tej kategorii.", // "No places in this category."
    emptySearch: "Brak wyników dla tego wyszukiwania.", // "No results for this search."
    loadError: "Nie udało się załadować miejsc.", // "Couldn't load places."
    retry: "Spróbuj ponownie", // "Try again"
    saveAction: "Zapisz", // "Save" (bookmark, not-yet-saved) — a11y label
    savedAction: "Zapisano", // "Saved" (already bookmarked) — a11y label
    savedEmpty: "Nie masz jeszcze zapisanych miejsc.", // "No saved places yet."
    savedLoadError: "Nie udało się załadować zapisanych miejsc.", // saved-list load error
    // Detail screen (P-40)
    detailLoadError: "Nie udało się załadować miejsca.", // "Couldn't load the place." (singular)
    aboutLabel: "O miejscu", // "About" section heading
    moreActions: "Więcej opcji", // ⋯ accessibility label
    reportAction: "Zgłoś to miejsce", // ⋯ menu row + a11y label ("Report this place")
    reportTitle: "Zgłoś miejsce", // report modal title
    reportPlaceholder: "Opisz, co jest nie tak z tym miejscem", // "Describe what's wrong with this place"
    // Accessibility features (P-40) — keys MUST match ACCESSIBILITY_FEATURES.
    accessibilityTitle: "Udogodnienia", // "Accessibility / amenities" section heading
    accessibility: {
      wheelchair_accessible: "Dostęp dla wózków", // "Wheelchair accessible"
      gender_neutral_restroom: "Toaleta neutralna płciowo", // "Gender-neutral restroom"
      free_wifi: "Darmowe Wi-Fi", // "Free Wi-Fi"
    },
    // Map placeholder (P-40 / SP-4). The interactive map isn't built yet; the
    // list reserves a rounded panel that renders this hint and a "view map" CTA.
    mapComingSoon: "Mapa już wkrótce", // "Map coming soon"
    viewMap: "Zobacz mapę", // "View map" (reserved expand CTA — inert until SP-4)
    // Curation framing (COMPLIANCE §5.8 / P-40): present as team-curated
    // LGBT-friendly places, NOT an absolute safety guarantee.
    disclaimer:
      "Miejsca przyjazne osobom LGBT+ wybrane przez nasz zespół — to nie jest gwarancja bezpieczeństwa.", // "LGBT-friendly places curated by our team — not a guarantee of safety."
    // ODbL licence requirement — must render the exact "© OpenStreetMap
    // contributors" string wherever OSM-sourced data is shown.
    attribution: "Dane miejsc częściowo z © OpenStreetMap contributors",
    // Category labels — keys MUST match SAFE_PLACE_CATEGORIES (shared/types.ts).
    categories: {
      cafe: "Kawiarnia", // "Café"
      club: "Klub", // "Club"
      bar: "Bar", // "Bar"
      ngo: "Organizacja", // "NGO / organisation"
      health: "Zdrowie", // "Health"
      community_center: "Centrum społeczności", // "Community centre"
      education: "Edukacja", // "Education"
      service: "Usługa", // "Service"
      other: "Inne", // "Other"
    },
  },

  // Resources tab (P-37 Support & Education, design ref: profile-resources.png):
  // one directory screen (search + category chips + featured section + list)
  // that pushes a detail. Admin-curated content; read-only for users.
  resources: {
    title: "Wsparcie", // big header ("Resources")
    subtitle: "Wsparcie, informacje i narzędzia dla społeczności LGBTQ+.", // "Support, information and tools for the LGBTQ+ community."
    allTitle: "Wszystkie materiały", // section header above the non-featured list
    searchPlaceholder: "Szukaj materiałów", // "Search resources"
    categoriesHeader: "Kategorie", // "Categories"
    featuredTitle: "Polecane materiały", // "Featured Resources"
    viewAll: "Zobacz wszystkie materiały", // "View all resources"
    filterAll: "Wszystkie", // "All" — the category filter chip that clears
    empty: "Nie ma jeszcze żadnych materiałów.", // "No resources yet."
    emptyCategory: "Brak materiałów w tej kategorii.", // "No resources in this category."
    emptySearch: "Brak wyników dla tego wyszukiwania.", // "No results for this search."
    loadError: "Nie udało się załadować materiałów.", // "Couldn't load resources."
    retry: "Spróbuj ponownie", // "Try again"
    clear: "Wyczyść wyszukiwanie", // "Clear search" (a11y label for the ✕)
    detailLoadError: "Nie udało się załadować materiału.", // "Couldn't load the resource." (singular)
    openLink: "Otwórz stronę", // "Open link" — external-link CTA on the detail
    // Category labels — keys MUST match RESOURCE_CATEGORIES (shared/types.ts).
    categories: {
      mental_health: "Zdrowie psychiczne", // "Mental Health & Wellbeing"
      legal_rights: "Prawa i pomoc prawna", // "Legal Rights & Support"
      community_orgs: "Organizacje społeczne", // "Community Organizations"
      education_careers: "Edukacja i kariera", // "Education & Careers"
      health_services: "Usługi zdrowotne", // "Health Services"
      housing_support: "Wsparcie mieszkaniowe", // "Housing Support"
    },
  },

  // The "Zapisane" (Saved) screen — a 2-tab view over saved events + places.
  saved: {
    title: "Zapisane", // "Saved" (screen/header title)
    tabEvents: "Wydarzenia", // "Events"
    tabSafePlaces: "Bezpieczne miejsca", // "Safe places"
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
    // Redesigned Profile: grouped setting cards + a premium log-out.
    account: "Konto", // "Account" section header
    support: "Wsparcie", // "Support" section header
    about: "O aplikacji Blis-Q", // "About Blis-Q" row
    help: "Pomoc i wsparcie", // "Help & support" row (opens a mailto when configured)
    logOut: "Wyloguj się", // premium log-out button label
    // Stat cells (shown only once real counts are wired — see ProfileStats).
    statCommunities: "Społeczności", // "Communities"
    statEvents: "Wydarzenia", // "Events"
  },

  // Static "About Blis-Q" screen (Profile → Wsparcie → O aplikacji).
  about: {
    title: "O aplikacji", // nav header title
    version: "Wersja {version}", // "Version {version}"
    body: "Blis-Q to bezpieczna przestrzeń dla społeczności LGBT+ w Polsce — miejsce, w którym możesz nawiązywać kontakty, odkrywać wydarzenia i przyjazne miejsca oraz znaleźć wsparcie.", // "Blis-Q is a safe space for Poland's LGBT+ community — connect, discover events and friendly places, and find support."
  },

  communities: {
    searchPlaceholder: "Szukaj społeczności",
    empty: "Nie ma jeszcze żadnych społeczności.",
    emptyEncourage: "Załóż pierwszą i zbuduj swoją społeczność.", // encouraging line under the empty state ("Create the first and build your community.")
    emptySearch: "Brak wyników dla tego wyszukiwania.",
    loadError: "Nie udało się załadować społeczności.",
    retry: "Spróbuj ponownie",
    create: "Załóż społeczność",
    members: "Członkowie: {count}", // legacy long form (kept for other callers)
    // Card metadata plural — see memberLabel(). "1 członek / 3 członkowie / 5 członków".
    memberOne: "1 członek",
    memberFew: "{count} członkowie",
    memberMany: "{count} członków",
    joined: "Dołączono",
    join: "Dołącz",
    leave: "Opuść",
    // FAB speed-dial + create-event community picker (Option 1)
    createMenu: "Utwórz", // FAB a11y label (opens the create menu)
    createEvent: "Utwórz wydarzenie", // FAB option + picker action ("Create event")
    pickCommunityTitle: "Wybierz społeczność", // picker sheet title ("Choose a community")
    pickCommunitySubtitle: "W której społeczności utworzyć wydarzenie?", // "In which community to create the event?"
    pickCommunityEmpty:
      "Dołącz najpierw do społeczności, aby utworzyć wydarzenie.", // no joined communities ("Join a community first to create an event.")
    pickCommunityClose: "Zamknij", // sheet close a11y label ("Close")
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
