import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { ComposePostModal } from "@/components/ComposePostModal";
import { strings } from "@/i18n";

describe("ComposePostModal", () => {
  it("empty content → validation message, does not submit", () => {
    const onSubmit = jest.fn();
    render(
      <ComposePostModal visible onClose={jest.fn()} onSubmit={onSubmit} />,
    );
    fireEvent.press(
      screen.getByRole("button", { name: strings.posts.composeSubmit }),
    );
    expect(screen.getByText(strings.posts.composeRequired)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the trimmed content and closes on success", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ ok: true });
    const onClose = jest.fn();
    render(<ComposePostModal visible onClose={onClose} onSubmit={onSubmit} />);

    fireEvent.changeText(
      screen.getByPlaceholderText(strings.posts.composePlaceholder),
      "  Nowy wpis  ",
    );
    fireEvent.press(
      screen.getByRole("button", { name: strings.posts.composeSubmit }),
    );

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("Nowy wpis"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("shows the error message when submission fails", async () => {
    const onSubmit = jest
      .fn()
      .mockResolvedValue({ ok: false, message: "Nie udało się" });
    const onClose = jest.fn();
    render(<ComposePostModal visible onClose={onClose} onSubmit={onSubmit} />);

    fireEvent.changeText(
      screen.getByPlaceholderText(strings.posts.composePlaceholder),
      "Treść",
    );
    fireEvent.press(
      screen.getByRole("button", { name: strings.posts.composeSubmit }),
    );

    await waitFor(() => expect(screen.getByText("Nie udało się")).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });
});
