import {
  validateEmail,
  validateNewPassword,
  validateDisplayName,
  isNonEmpty,
  isConsentValid,
  PASSWORD_MIN,
} from "@/validation/auth";

describe("validateEmail", () => {
  it("accepts a well-formed address", () => {
    expect(validateEmail("user@example.pl")).toBeNull();
  });

  it.each(["", "nope", "a@b", "a@b.", "@example.pl", "user@@x.pl", "spa ce@x.pl"])(
    "rejects %p",
    (value) => {
      expect(validateEmail(value)).toEqual({ code: "emailInvalid" });
    },
  );
});

describe("validateNewPassword", () => {
  it("rejects passwords shorter than the minimum", () => {
    expect(validateNewPassword("short")).toEqual({
      code: "passwordTooShort",
      min: PASSWORD_MIN,
    });
  });

  it("accepts an 8+ char password", () => {
    expect(validateNewPassword("supersecret")).toBeNull();
  });
});

describe("validateDisplayName", () => {
  it("rejects empty / whitespace-only", () => {
    expect(validateDisplayName("   ")).toEqual({ code: "displayNameRequired" });
  });

  it("accepts a real name", () => {
    expect(validateDisplayName("Ola")).toBeNull();
  });
});

describe("isNonEmpty", () => {
  it("is false for whitespace, true for content", () => {
    expect(isNonEmpty("  ")).toBe(false);
    expect(isNonEmpty(" x ")).toBe(true);
  });
});

describe("isConsentValid", () => {
  it("requires account_creation", () => {
    expect(isConsentValid([])).toBe(false);
    expect(isConsentValid(["analytics"])).toBe(false);
    expect(isConsentValid(["account_creation"])).toBe(true);
    expect(isConsentValid(["account_creation", "marketing_emails"])).toBe(true);
  });
});
