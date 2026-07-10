jest.mock("@/hooks/useCrisisContacts", () => ({
  useCrisisContacts: jest.fn(),
}));

import { render, screen, fireEvent } from "@testing-library/react-native";
import { Linking } from "react-native";
import { CrisisScreen } from "@/screens/crisis/CrisisScreen";
import { useCrisisContacts } from "@/hooks/useCrisisContacts";
import { strings } from "@/i18n";
import type { CrisisContactDTO } from "@shared/types";

const useMock = useCrisisContacts as unknown as jest.Mock;

function ready(items: CrisisContactDTO[]) {
  return {
    items,
    status: "ready" as const,
    errorMessage: null,
    refreshing: false,
    refresh: jest.fn(),
    retry: jest.fn(),
  };
}

function contact(over: Partial<CrisisContactDTO> = {}): CrisisContactDTO {
  return {
    id: "c1",
    name: "Kontakt",
    phone: "111 111",
    description: "Opis.",
    hours: null,
    category: "emotional_crisis",
    // Default VERIFIED so fixtures show under the verified-only gate; pass
    // verified:false explicitly to exercise the gate.
    verified: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

const emergency = contact({
  id: "e",
  name: "Numer alarmowy",
  phone: "112",
  category: "emergency",
});
const legal = contact({
  id: "l",
  name: "Pomoc prawna",
  phone: "22 111 22 33",
  category: "legal",
});
const emo = contact({
  id: "m",
  name: "Telefon zaufania",
  phone: "116 123",
  category: "emotional_crisis",
});

// Minimal navigation/route props for the screen.
const nav = { goBack: jest.fn(), navigate: jest.fn() } as never;
const route = { key: "Crisis", name: "Crisis", params: undefined } as never;

beforeEach(() => useMock.mockReset());

describe("CrisisScreen — safety behavior", () => {
  it("the 112 banner dials the emergency contact's number (data-driven)", () => {
    useMock.mockReturnValue(ready([emergency, legal]));
    const spy = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValue(undefined as never);
    render(<CrisisScreen navigation={nav} route={route} />);
    // The banner call button is labelled with the emergency PHONE (distinct from
    // the per-card button which is labelled with the name).
    fireEvent.press(screen.getByLabelText(`${strings.crisis.callAction}: 112`));
    expect(spy).toHaveBeenCalledWith("tel:112");
    spy.mockRestore();
  });

  it("hides the banner when there is no emergency contact", () => {
    useMock.mockReturnValue(ready([legal, emo]));
    render(<CrisisScreen navigation={nav} route={route} />);
    expect(screen.queryByText(strings.crisis.emergency.title)).toBeNull();
  });

  it("does not render an 'emergency' filter chip", () => {
    useMock.mockReturnValue(ready([emergency, legal]));
    render(<CrisisScreen navigation={nav} route={route} />);
    expect(screen.queryByText(strings.crisis.categories.emergency)).toBeNull();
    // …but the non-emergency chips are present.
    expect(screen.getByText(strings.crisis.categories.legal)).toBeTruthy();
    expect(screen.getByText(strings.crisis.filterAll)).toBeTruthy();
  });

  it("shows the emergency contact ONLY in the banner, not duplicated as a card", () => {
    useMock.mockReturnValue(ready([emergency, legal]));
    render(<CrisisScreen navigation={nav} route={route} />);
    // The banner is present (reassurance copy)…
    expect(screen.getByText(strings.crisis.emergency.title)).toBeTruthy();
    // …but the emergency contact is NOT also a list card (112 isn't duplicated).
    expect(screen.queryByText(/Numer alarmowy/)).toBeNull();
    // The non-emergency contact IS listed.
    expect(screen.getByText(/Pomoc prawna/)).toBeTruthy();
  });

  it("filters the non-emergency list client-side when a category chip is tapped", () => {
    useMock.mockReturnValue(ready([emergency, legal, emo]));
    render(<CrisisScreen navigation={nav} route={route} />);
    // Under "Wszystkie" the list shows the non-emergency contacts; the emergency
    // contact is in the banner only (never a list card).
    expect(screen.queryByText(/Numer alarmowy/)).toBeNull();
    expect(screen.getByText(/Pomoc prawna/)).toBeTruthy();
    expect(screen.getByText(/Telefon zaufania/)).toBeTruthy();

    // Tap "Prawne" → only the legal contact remains; the banner (emergency) still
    // shows, proving the filter is client-side over the already-loaded list.
    fireEvent.press(screen.getByText(strings.crisis.categories.legal));
    expect(screen.getByText(/Pomoc prawna/)).toBeTruthy();
    expect(screen.queryByText(/Telefon zaufania/)).toBeNull();
    expect(screen.getByText(strings.crisis.emergency.title)).toBeTruthy();
  });

  it("hides an UNVERIFIED contact from the list (defense-in-depth)", () => {
    const unverified = contact({
      id: "u",
      name: "Niezweryfikowany",
      category: "legal",
      verified: false,
    });
    useMock.mockReturnValue(ready([legal, unverified]));
    render(<CrisisScreen navigation={nav} route={route} />);
    expect(screen.getByText(/Pomoc prawna/)).toBeTruthy(); // verified → shown
    expect(screen.queryByText(/Niezweryfikowany/)).toBeNull(); // unverified → hidden
  });

  it("hides the banner when the emergency contact is unverified", () => {
    const unverifiedEmergency = contact({
      id: "e2",
      name: "Numer alarmowy",
      phone: "112",
      category: "emergency",
      verified: false,
    });
    useMock.mockReturnValue(ready([unverifiedEmergency, legal]));
    render(<CrisisScreen navigation={nav} route={route} />);
    expect(screen.queryByText(strings.crisis.emergency.title)).toBeNull();
  });
});
