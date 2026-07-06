import { render, screen } from "@testing-library/react-native";
import { ProfileStats } from "@/components/ProfileStats";

describe("ProfileStats", () => {
  it("renders a cell per stat (value + label)", () => {
    render(
      <ProfileStats
        stats={[
          { value: "12", label: "Społeczności" },
          { value: "8", label: "Wydarzenia" },
        ]}
      />,
    );
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("Społeczności")).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("Wydarzenia")).toBeTruthy();
  });

  it("renders nothing when there are no stats (never fabricated)", () => {
    render(<ProfileStats stats={[]} />);
    expect(screen.queryByTestId("profile-stats")).toBeNull();
  });
});
