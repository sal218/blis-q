import { PlannedPage } from "../components/PlannedPage";

// Moderation history & tooling — the audit_log is already written server-side
// (P-27) but has no admin view yet. Structured for the planned scope.

export function ModerationPage() {
  return (
    <PlannedPage
      title="Moderacja"
      description="Historia działań moderacyjnych i narzędzia zespołu moderacji."
      emptyIcon="shieldCheck"
      emptyTitle="Historia moderacji jest w przygotowaniu"
      emptyDescription="Bieżące zgłoszenia obsługujesz w kolejce Zgłoszeń, a blokady kont w sekcji Użytkownicy. Tutaj pojawi się pełny dziennik działań."
      modules={[
        {
          icon: "clockCounter",
          title: "Dziennik działań",
          description:
            "Kto, co i kiedy — pełna historia decyzji moderacyjnych.",
        },
        {
          icon: "user",
          title: "Odwołania",
          description: "Kolejka odwołań od blokad i usunięć treści.",
        },
        {
          icon: "warning",
          title: "Kategorie naruszeń",
          description: "Ustrukturyzowane powody decyzji moderacyjnych.",
        },
      ]}
    />
  );
}
