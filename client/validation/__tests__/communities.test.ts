import {
  validateCommunityName,
  validateCommunityDescription,
  COMMUNITY_NAME_MAX,
  COMMUNITY_DESCRIPTION_MAX,
} from "@/validation/communities";

describe("community name validation", () => {
  it("accepts a normal name", () => {
    expect(validateCommunityName("Queer Creatives")).toBeNull();
  });

  it("rejects an empty name", () => {
    expect(validateCommunityName("")).toEqual({ code: "nameRequired" });
  });

  it("rejects a whitespace-only name (trimmed before checking)", () => {
    expect(validateCommunityName("    ")).toEqual({ code: "nameRequired" });
  });

  it("rejects a name longer than the max (after trim)", () => {
    const tooLong = "a".repeat(COMMUNITY_NAME_MAX + 1);
    expect(validateCommunityName(tooLong)).toEqual({
      code: "nameTooLong",
      max: COMMUNITY_NAME_MAX,
    });
  });

  it("counts the trimmed length, so surrounding spaces don't push over the max", () => {
    const padded = `  ${"a".repeat(COMMUNITY_NAME_MAX)}  `;
    expect(validateCommunityName(padded)).toBeNull();
  });
});

describe("community description validation", () => {
  it("accepts an empty description (optional)", () => {
    expect(validateCommunityDescription("")).toBeNull();
  });

  it("rejects a description longer than the max", () => {
    const tooLong = "a".repeat(COMMUNITY_DESCRIPTION_MAX + 1);
    expect(validateCommunityDescription(tooLong)).toEqual({
      code: "descriptionTooLong",
      max: COMMUNITY_DESCRIPTION_MAX,
    });
  });
});
