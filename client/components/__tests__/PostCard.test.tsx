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
    render(<PostCard post={basePost} onReport={jest.fn()} />);
    expect(screen.getByText("Marta")).toBeTruthy();
    expect(screen.getByText("Cześć wszystkim")).toBeTruthy();
    expect(screen.getByText(strings.posts.timeNow)).toBeTruthy();
  });

  it("⋯ triggers onReport with the post", () => {
    const onReport = jest.fn();
    render(<PostCard post={basePost} onReport={onReport} />);
    fireEvent.press(
      screen.getByRole("button", { name: strings.posts.moreActions }),
    );
    expect(onReport).toHaveBeenCalledWith(basePost);
  });

  it("deleted post → tombstone, no author and no report action", () => {
    const deleted: PostDTO = {
      ...basePost,
      author: null,
      content: "[deleted]",
      deleted: true,
    };
    render(<PostCard post={deleted} onReport={jest.fn()} />);
    expect(screen.getByText(strings.posts.deleted)).toBeTruthy();
    expect(screen.queryByText("Marta")).toBeNull();
    expect(
      screen.queryByRole("button", { name: strings.posts.moreActions }),
    ).toBeNull();
  });
});
