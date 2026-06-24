# Blis-Q — Podsumowanie przetwarzania danych na potrzeby DPIA

> _To jest tłumaczenie dokumentu roboczego (oryginał w języku angielskim:
> `DPIA_INPUT.md`), przygotowane dla wygody. W razie wątpliwości prosimy o kontakt._

**Cel dokumentu.** To napisane prostym językiem podsumowanie tego, jak aplikacja
Blis-Q przetwarza dane osobowe, przygotowane przez **zespół deweloperski (podmiot
przetwarzający)**, aby **klient (administrator danych)** i jego radca prawny mogli
upewnić się, że **ocena skutków dla ochrony danych (DPIA) obejmuje wszystko**. Jest
to dokument „żywy" — będziemy go aktualizować w miarę rozwoju aplikacji lub po
dodaniu nowych operacji przetwarzania. **Nie jest to porada prawna** — to wkład
techniczny, którego prawnik potrzebuje do oceny ryzyka.

---

## 1. Czym jest aplikacja

Blis-Q to platforma społecznościowa (iOS + Android oraz wewnętrzny panel
administracyjny w przeglądarce) dla **społeczności LGBT+ w Polsce**. Planowane
funkcje: grupy społecznościowe + czat grupowy, wydarzenia + zapisy (RSVP), mapa
przyjaznych miejsc („bezpieczne miejsca"), materiały wsparcia / edukacyjne, funkcje
bezpieczeństwa oraz płatna subskrypcja premium.

**Status budowy (aby nic nie zostało odczytane jako już działające).** DPIA ocenia
także planowane przetwarzanie, więc planowane funkcje są tu ujęte — ale dla
ścisłości:

- **Wdrożone:** rejestracja/logowanie konta (e-mail + logowanie Google), zbieranie
  wyraźnej zgody, eksport konta + usunięcie/anonimizacja, grupy społecznościowe,
  wpisy + zgłaszanie, moderacja (kolejka zgłoszeń, usuwanie treści, blokada/
  zawieszenie użytkownika) oraz wewnętrzny panel administracyjny.
- **Planowane (jeszcze niezbudowane):** czat grupowy, mapa bezpiecznych miejsc,
  wydarzenia/RSVP, subskrypcje premium oraz sekcja **kontaktów alarmowych**.

## 2. Role

- **Administrator danych — klient.** Prowadzi Blis-Q, jest właścicielem produktu,
  decyduje, jakie dane są zbierane i w jakim celu. Ponosi główne obowiązki prawne,
  w tym przeprowadzenie DPIA.
- **Podmiot przetwarzający — Ladly Media FZ-LLC (zespół deweloperski).** Buduje i
  utrzymuje system zgodnie z poleceniami klienta. Przed przetwarzaniem
  jakichkolwiek rzeczywistych danych użytkowników między administratorem a
  podmiotem przetwarzającym musi zostać podpisana **umowa powierzenia przetwarzania
  danych (art. 28 RODO)**. **Podmiot przetwarzający ma siedzibę poza UE/EOG (na
  Bliskim Wschodzie)** — zatem przepływ danych administrator→podmiot przetwarzający
  sam w sobie stanowi przekazanie do państwa trzeciego i wymaga odpowiedniego
  mechanizmu (np. standardowych klauzul umownych, SCC); zob. §14.

## 3. Dlaczego DPIA jest obowiązkowe (przesłanki wysokiego ryzyka)

Aplikacja spełnia **co najmniej cztery** z kryteriów wysokiego ryzyka EROD (dwa
wystarczą, by DPIA było wymagane):

1. **Dane szczególnych kategorii (art. 9 RODO)** — orientacja seksualna.
2. **Osoby wymagające szczególnej ochrony** — osoby LGBT+ w obecnej sytuacji w
   Polsce.
3. **Przetwarzanie na dużą skalę** — produkt jest kierowany do dziesiątek tysięcy
   użytkowników.
4. **Dane o lokalizacji** — (planowana) mapa „bezpiecznych miejsc".

## 4. Kwestia art. 9 (najważniejsze ryzyko)

Zgodnie z RODO **orientacja seksualna to dane „szczególnej kategorii" (art. 9)** —
najwyższy poziom ochrony. Co istotne, przesłanka ta jest spełniona **już przez samo
posiadanie konta**: dołączenie do platformy opisanej jako przeznaczona dla
społeczności LGBT+ samo w sobie ujawnia orientację seksualną. Administrator
przetwarza więc dane z art. 9 **od chwili rejestracji użytkownika**, niezależnie od
tego, co użytkownik publikuje.

- **Podstawa prawna:** realną podstawą jest **art. 9 ust. 2 lit. a) — wyraźna
  zgoda**: dobrowolna, konkretna, świadoma i jednoznaczna, wyrażona poprzez wyraźne
  działanie potwierdzające (bez okienek zaznaczonych domyślnie), możliwa do
  wycofania i rejestrowana **per użytkownik, per cel, per wersja polityki
  prywatności**.

## 5. Dane osobowe przetwarzane przez aplikację

- **Konto:** e-mail, nazwa wyświetlana (wybrany pseudonim), awatar, status
  premium/subskrypcji, oznaczenie administratora.
- **Status konta / moderacja:** stan i znacznik czasu zawieszenia (blokady);
  katalog użytkowników w panelu administracyjnym (administratorzy mogą
  wyszukiwać/listować użytkowników po nazwie/e-mailu i widzieć status); oraz
  **działania moderacyjne** — status / rozstrzygnięcie / osoba rozpatrująca
  zgłoszenie, a także rekordy usunięcia treści / blokady.
- **Rejestry zgód:** czego dotyczyła zgoda, wersja polityki, znaczniki czasu oraz
  adres IP w chwili wyrażenia zgody (krótka retencja, do celów dowodowych).
- **Treści użytkownika:** wpisy społecznościowe, zgłoszenia treści, blokady; oraz
  (planowane) wiadomości czatu grupowego (zob. §7).
- **Aktywność:** członkostwa w społecznościach; (planowane) zapisy na wydarzenia
  (RSVP).
- **Powiadomienia:** tokeny push urządzeń, preferencje powiadomień.
- **Bezpieczeństwo/audyt:** dziennik audytowy istotnych działań (**wyłącznie
  identyfikatory** — bez treści wiadomości, bez danych osobowych, bez treści
  powodów/rozstrzygnięć) oraz ograniczone adresy IP na potrzeby bezpieczeństwa /
  ograniczania liczby żądań.
- **Lokalizacja:** zob. §6 — lokalizacja użytkownika jest obsługiwana efemerycznie i
  **nie jest przechowywana**.
- **Wiek / data urodzenia:** **obecnie nie są zbierane.** To, czy aplikacja będzie
  ograniczona do osób dorosłych, czy będzie zbierać datę urodzenia, to otwarta
  decyzja administratora (zob. §14).

## 6. Dane o lokalizacji (planowana mapa bezpiecznych miejsc)

- **Lokalizacja użytkownika:** żądana **wyłącznie w momencie użycia** (gdy
  użytkownik otwiera mapę), nigdy przy starcie aplikacji ani w tle. **Współrzędne
  GPS użytkownika nie są przechowywane** — wyszukiwania „w pobliżu" wykorzystują je
  do pojedynczego zapytania i odrzucają (nie są zapisywane w bazie, logach ani
  analityce). Preferowany obszar, jeśli zostanie ustawiony, jest przechowywany
  **wyłącznie na poziomie miasta** (np. „Warszawa"), nigdy jako dokładne
  współrzędne.
- **Dane lokali:** sama lista bezpiecznych miejsc (nazwa, adres, kategoria oraz
  **współrzędne lokalu**) jest **kuratorowana przez administratora i przechowywana**
  w bazie danych. To dane lokalu/biznesowe, nie lokalizacja użytkownika — niemniej
  administrator powinien potwierdzić sposób ich traktowania.
- Dostawca mapy (np. Mapbox / OpenStreetMap) wymaga własnej umowy powierzenia (DPA);
  DPIA powinno wprost odnieść się do przetwarzania danych o lokalizacji.

## 7. Wiadomości i moderacja (planowany czat; brak szyfrowania end-to-end — celowo)

- Planowane wiadomości czatu grupowego będą przechowywane w bazie danych w postaci
  **jawnej** (szyfrowane **w spoczynku** przez dostawcę infrastruktury — zob. §8) i
  **możliwe do odczytu przez moderatorów / podmiot przetwarzający z dostępem do bazy
  danych**.
- **Szyfrowanie end-to-end zostało celowo odrzucone**, ponieważ uniemożliwiłoby
  moderację treści — a dla wrażliwej społeczności możliwość przeglądania i
  reagowania na zgłoszone/szkodliwe treści jest funkcją krytyczną dla
  bezpieczeństwa.
- Musi to zostać **ujawnione w polityce prywatności**: wiadomości są przechowywane
  na serwerach, mogą być przeglądane przez moderatorów w odpowiedzi na zgłoszenia, a
  podmiot przetwarzający ma techniczny dostęp do treści w bazie danych.

## 8. Szyfrowanie i środki bezpieczeństwa

- **W tranzycie (podczas przesyłania):** cały ruch korzysta z **TLS/HTTPS** między
  aplikacjami, API i usługami zaplecza (TLS kończone na warstwie hostingu).
  **Wdrożone.**
- **W spoczynku:** baza danych (**Supabase** — którego zarządzany PostgreSQL jest
  hostowany na AWS) oraz magazyn plików (Cloudflare R2) szyfrują dane w spoczynku
  algorytmem **AES-256**, po stronie tych dostawców. Korzystamy z Supabase
  bezpośrednio; nie jesteśmy odrębnym klientem AWS. **Wdrożone.**
- **Szyfrowanie na poziomie aplikacji / end-to-end:** **nie jest stosowane** —
  celowa decyzja, aby moderatorzy mogli przeglądać zgłoszone treści (zob. §7). Treść
  jest zatem czytelna po stronie serwera i chroniona środkami „w tranzycie" + „w
  spoczynku" powyżej.
- **Pozostałe środki:** dostęp do bazy danych wyłącznie przez zaplecze (aplikacje
  nigdy nie komunikują się bezpośrednio z bazą), ograniczanie liczby żądań na
  wrażliwych punktach końcowych, rejestrowanie audytowe oraz monitoring błędów.

## 9. Funkcje bezpieczeństwa (prosimy o potwierdzenie ujęcia w DPIA)

Dla tej wrażliwej grupy odbiorców aplikacja zawiera funkcje związane z
bezpieczeństwem:

- **Szybkie wyjście / tryb dyskretny** — zbudowane we wcześniejszym szkielecie, ale
  obecnie **wstrzymane** w oczekiwaniu na przegląd produktowy/bezpieczeństwa.
- **Kontakty alarmowe / wsparcia (planowane, jeszcze niezbudowane)** — sekcja, która
  będzie kierować użytkowników do **zewnętrznych organizacji kryzysowych i
  wsparcia** (np. telefony zaufania, organizacje wspierające osoby LGBT+, pomoc
  prawna). Ponieważ kieruje to wrażliwe osoby do rzeczywistych organizacji,
  **treść musi być wyselekcjonowana i zweryfikowana przez administratora**, a my
  prosimy, aby DPIA **wprost uwzględniło tę funkcję** zanim ją zbudujemy.

## 10. Podmioty podprzetwarzające / strony trzecie

**Główna infrastruktura (baza danych, magazyn, pamięć podręczna, hosting API) jest w
regionie UE tam, gdzie to wybrano.** Inni dostawcy (usługi Google, e-mail,
subskrypcje, mapy) **mogą wiązać się z przetwarzaniem poza UE lub specyficznym dla
dostawcy** — każdy wymaga własnej **umowy powierzenia (DPA)** i odpowiedniego
**mechanizmu przekazywania danych (np. SCC)** potwierdzonego przez administratora.

**Kilka praktycznych uwag, aby nie wyglądało to na większą pracę, niż jest:**

- To **żywa lista** — dostawcy mogą się zmieniać i będą się zmieniać. Zmiana lub
  dodanie podprocesora **nie** oznacza ponownego wykonywania DPIA; obsługuje to
  **postanowienie o podprocesorach w umowie powierzenia administrator↔podmiot
  przetwarzający** (administrator jest powiadamiany, a lista aktualizowana).
- **Większość umów DPA dostawców to standardowe warunki, które się _akceptuje_**
  (często pole wyboru lub przełącznik w ustawieniach), a nie umowy do
  negocjowania/sporządzania. Jedyną faktycznie negocjowaną/podpisywaną umową jest
  umowa **klient ↔ Ladly Media FZ-LLC (podmiot przetwarzający)**.
- Dziś potwierdzenia DPA wymagają tylko dostawcy **obecnie używani**. **Planowani**
  (RevenueCat, dostawca mapy) poczekają, aż dana funkcja faktycznie powstanie.

**Obecnie używani:**

| Usługa                         | Cel                                                                     | Region / uwagi                                 |
| ------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------- |
| Supabase                       | Baza danych, uwierzytelnianie, dostarczanie czatu w czasie rzeczywistym | Frankfurt (UE)                                 |
| Cloudflare R2                  | Magazyn plików / obrazów                                                | Jurysdykcja UE                                 |
| Upstash Redis                  | Ograniczanie żądań + pamięć podręczna                                   | Frankfurt (UE)                                 |
| Fly.io                         | Hosting serwera API                                                     | Warszawa (UE)                                  |
| Sentry                         | Monitoring błędów                                                       | Region danych UE                               |
| Firebase Cloud Messaging (FCM) | Powiadomienia push                                                      | Google — potwierdzić DPA + mechanizm transferu |
| Google Sign-In                 | Tożsamość logowania (token OIDC Google wymieniany na sesję)             | Google — potwierdzić DPA + mechanizm transferu |
| Resend                         | E-mail transakcyjny                                                     | Potwierdzić DPA + mechanizm transferu          |

**Planowani (DPA niepotrzebne, dopóki funkcja nie powstanie):**

| Usługa                       | Cel                                            | Region / uwagi                        |
| ---------------------------- | ---------------------------------------------- | ------------------------------------- |
| RevenueCat                   | Zarządzanie subskrypcjami (premium, planowane) | Potwierdzić DPA + mechanizm transferu |
| Dostawca mapy (Mapbox / OSM) | Mapa bezpiecznych miejsc (planowane)           | Potwierdzić dostawcę + DPA / opcję UE |

## 11. Prawa osób, których dane dotyczą (wbudowane w system)

- **Zgoda** zbierana przy rejestracji (nie można jej pominąć ani zaznaczyć
  domyślnie) i rejestrowana.
- **Dostęp / przenoszenie (art. 20):** eksport danych konta.
- **Usunięcie (art. 17):** usunięcie konta polega na **anonimizacji**, a nie
  twardym usunięciu — dane osobowe są czyszczone, treści użytkownika stają się
  anonimowe („[usunięto]"), a tożsamość jest usuwana, podczas gdy wątki
  społecznościowe pozostają spójne. Sesje są unieważniane, a tokeny push
  dezaktywowane.
- **Dziennik audytowy** istotnych działań, z anonimizacją sprawcy po usunięciu
  konta.

## 12. Retencja (planowana — administrator potwierdza dokładne okresy do polityki)

Retencja jest **zaprojektowana, ale jeszcze nieegzekwowana** — automatyczne zadanie
czyszczące jest dopiero do zbudowania. Zakładane okresy (do potwierdzenia i
umieszczenia w polityce prywatności):

- Treści usunięte „miękko" czyszczone po ~30 dniach.
- Dzienniki audytowe: ~90 dni (ogólne) / ~12 miesięcy (istotne dla bezpieczeństwa).
- Adresy IP zgód: krótka retencja (~90 dni).
- **Konta nieaktywne:** ostrzeżenie, a następnie anonimizacja po określonym okresie
  nieaktywności (zwykle 12–24 miesiące) — **administrator musi ustalić tę liczbę.**

## 13. Gotowość na naruszenia

Monitoring techniczny jest wdrożony / planowany (monitoring błędów, retencja logów,
dzienniki zdarzeń uwierzytelniania, wykrywanie anomalii w limitach żądań).
**Administrator potrzebuje udokumentowanego planu reagowania na incydenty** (kto
powiadamia polski organ **UODO w ciągu 72 godzin** i co stanowi naruszenie
podlegające zgłoszeniu).

---

## 14. O co prosimy prawnika / administratora o potwierdzenie lub decyzję

Abyśmy mogli poprawnie sfinalizować budowę, DPIA / administrator powinien
potwierdzić:

1. Że DPIA **wprost obejmuje** dane z art. 9, lokalizację, grupę wymagającą
   szczególnej ochrony, przetwarzanie na dużą skalę — **oraz funkcję kontaktów
   alarmowych** (§9).
2. **Podstawę prawną** (wyraźna zgoda) i treść zgody.
3. **Wiek / osoby małoletnie:** czy aplikacja jest **tylko dla dorosłych (18+)**,
   czy dopuści osoby małoletnie i będzie zbierać datę urodzenia? (Dzieci to grupa
   wymagająca szczególnej ochrony, a w Polsce wiek zgody cyfrowej to 16 lat — to
   wpływa na proces zgody i na DPIA.)
4. **Przekazywanie danych do państw trzecich** — odpowiedni mechanizm (np. SCC) dla
   **(a) przepływu administrator→podmiot przetwarzający**, ponieważ podmiot
   przetwarzający (**Ladly Media FZ-LLC**) ma siedzibę poza UE/EOG, **oraz (b)
   dostawców spoza UE** z §10 (Google/FCM, Google Sign-In, Resend, RevenueCat,
   dostawca mapy).
5. **Okresy nieaktywności / retencji** (§12) do polityki prywatności.
6. Wybór **dostawcy mapy** + jego DPA (§6).
7. Czy wymagany jest **inspektor ochrony danych (IOD/DPO)** oraz kwestię
   rejestracji / oceny w **UODO**.
8. Osobę odpowiedzialną za **plan reagowania na incydenty** (§13).
9. Że model **bez E2EE / wiadomości czytelne dla moderatorów** (§7) jest
   odzwierciedlony w polityce prywatności.

Jeśli w trakcie budowy pojawi się cokolwiek innego, zasygnalizujemy to i
zaktualizujemy ten dokument.
