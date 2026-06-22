import { render, screen, fireEvent } from "@testing-library/react-native";
import { PostCard } from "@/components/PostCard";
import { strings } from "@/i18n";
import type { PostDTO } from "@shared/types";

const basePost: PostDTO = {
  id: "p1",
  communityId: "c1",
  author: { id: "u1", displayName: "Marta", avatarUrl: null },
  content: "Cześć wszystkim",
  // Recent enough to render as "just now".
  createdAt: new Date().toISOString(),
  imageUrl: null,
  deleted: false,
};

describe("PostCard", () => {
  it("renders author, content and a relative time", () => {
    render(<PostCard post={basePost} onMenu={jest.fn()} />);
    expect(screen.getByText("Marta")).toBeTruthy();
    expect(screen.getByText("Cześć wszystkim")).toBeTruthy();
    expect(screen.getByText(strings.posts.timeNow)).toBeTruthy();
  });

  it("⋯ triggers onMenu with the post", () => {
    const onMenu = jest.fn();
    render(<PostCard post={basePost} onMenu={onMenu} />);
    fireEvent.press(
      screen.getByRole("button", { name: strings.posts.moreActions }),
    );
    expect(onMenu).toHaveBeenCalledWith(basePost);
  });

  it("deleted post → tombstone, no author and no ⋯ menu", () => {
    const deleted: PostDTO = {
      ...basePost,
      author: null,
      content: "[deleted]",
      deleted: true,
    };
    render(<PostCard post={deleted} onMenu={jest.fn()} />);
    expect(screen.getByText(strings.posts.deleted)).toBeTruthy();
    expect(screen.queryByText("Marta")).toBeNull();
    expect(
      screen.queryByRole("button", { name: strings.posts.moreActions }),
    ).toBeNull();
  });
});
