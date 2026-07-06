import { PlannedPage } from "../components/PlannedPage";

// Curated advertising (P-36) — the campaign system isn't built yet. Structured
// for the planned business dashboard so it can grow into campaigns, budgets
// and performance without a redesign.

export function AdCampaignsPage() {
  return (
    <PlannedPage
      title="Kampanie reklamowe"
      description="Wyselekcjonowane reklamy przyjaznych marek — widoczne wyłącznie w darmowej wersji aplikacji."
      emptyIcon="megaphone"
      emptyTitle="Panel kampanii jest w przygotowaniu"
      emptyDescription="Tu zatwierdzisz reklamodawców i będziesz zarządzać kampaniami. Żadne sieci reklamowe stron trzecich nie będą śledzić użytkowników."
      modules={[
        {
          icon: "check",
          title: "Zatwierdzanie reklamodawców",
          description: "Ręczna akceptacja każdej marki przed startem kampanii.",
        },
        {
          icon: "megaphone",
          title: "Kampanie",
          description: "Harmonogram, kreacje i miejsca wyświetlania.",
        },
        {
          icon: "chartBar",
          title: "Wyniki",
          description: "Wyświetlenia, kliknięcia i CTR bez śledzenia osób.",
        },
      ]}
    />
  );
}
