import { render, screen, fireEvent } from "@testing-library/react-native";
import { PostActionsSheet } from "@/components/PostActionsSheet";
import { strings } from "@/i18n";
import type { PostDTO } from "@shared/types";

// The ⋯ action sheet: Report is always offered; Delete is offered for the
// caller's OWN post OR when the caller can moderate the community (mod/admin).
// canModerate mirrors the server's softDeletePost authorization.

function post(authorId: string): PostDTO {
  return {
    id: "p1",
    communityId: "c1",
    author: { id: authorId, displayName: "Marta", avatarUrl: null },
    content: "Cześć",
    createdAt: new Date().toISOString(),
    imageUrl: null,
    deleted: false,
  };
}

const handlers = () => ({
  onClose: jest.fn(),
  onReport: jest.fn(),
  onDelete: jest.fn(),
});

const deleteQuery = () =>
  screen.queryByRole("button", { name: strings.posts.delete });

describe("PostActionsSheet — Delete gating", () => {
  it("own post (not a moderator) → Report and Delete shown", () => {
    render(
      <PostActionsSheet
        post={post("me")}
        currentUserId="me"
        canModerate={false}
        {...handlers()}
      />,
    );
    expect(
      screen.getByRole("button", { name: strings.posts.report }),
    ).toBeTruthy();
    expect(deleteQuery()).toBeTruthy();
  });

  it("another user's post, not a moderator → Report only, no Delete", () => {
    render(
      <PostActionsSheet
        post={post("someone-else")}
        currentUserId="me"
        canModerate={false}
        {...handlers()}
      />,
    );
    expect(
      screen.getByRole("button", { name: strings.posts.report }),
    ).toBeTruthy();
    expect(deleteQuery()).toBeNull();
  });

  it("another user's post, caller can moderate → Report and Delete shown", () => {
    render(
      <PostActionsSheet
        post={post("someone-else")}
        currentUserId="me"
        canModerate={true}
        {...handlers()}
      />,
    );
    expect(
      screen.getByRole("button", { name: strings.posts.report }),
    ).toBeTruthy();
    expect(deleteQuery()).toBeTruthy();
  });

  it("Delete / Report / Cancel presses fire the right handlers", () => {
    const h = handlers();
    const p = post("someone-else");
    render(
      <PostActionsSheet
        post={p}
        currentUserId="me"
        canModerate={true}
        {...h}
      />,
    );
    fireEvent.press(screen.getByRole("button", { name: strings.posts.delete }));
    expect(h.onDelete).toHaveBeenCalledWith(p);
    fireEvent.press(screen.getByRole("button", { name: strings.posts.report }));
    expect(h.onReport).toHaveBeenCalledWith(p);
    fireEvent.press(
      screen.getByRole("button", { name: strings.common.cancel }),
    );
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });

  it("post=null → the sheet is not visible (no actions rendered)", () => {
    render(
      <PostActionsSheet
        post={null}
        currentUserId="me"
        canModerate={true}
        {...handlers()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: strings.posts.report }),
    ).toBeNull();
  });
});
