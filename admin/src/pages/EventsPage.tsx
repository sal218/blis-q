import { PlannedPage } from "../components/PlannedPage";

// Events oversight — the backend admin surface hasn't landed yet (event
// moderation flows via the Reports queue today). The layout is structured for
// the planned scope so modules can be wired in without a redesign.

export function EventsPage() {
  return (
    <PlannedPage
      title="Wydarzenia"
      description="Nadzór nad wydarzeniami społeczności — przegląd, wyróżnienia i statystyki."
      emptyIcon="calendar"
      emptyTitle="Panel wydarzeń jest w przygotowaniu"
      emptyDescription="Zgłoszone wydarzenia możesz już dziś obsługiwać w kolejce Zgłoszeń. Pełny nadzór nad wydarzeniami pojawi się tutaj."
      modules={[
        {
          icon: "check",
          title: "Kolejka zatwierdzania",
          description:
            "Przegląd i akceptacja nowych wydarzeń przed publikacją.",
        },
        {
          icon: "flag",
          title: "Wyróżnione wydarzenia",
          description: "Promowanie wybranych wydarzeń w aplikacji.",
        },
        {
          icon: "chartBar",
          title: "Frekwencja i statystyki",
          description: "Zapisy, obecność i trendy w czasie.",
        },
        {
          icon: "warning",
          title: "Zgłoszenia wydarzeń",
          description: "Widok zgłoszeń dotyczących wydarzeń w jednym miejscu.",
        },
      ]}
    />
  );
}
