import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

describe("secret encryption", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips encrypted values without storing plaintext", () => {
    vi.stubEnv(
      "APP_ENCRYPTION_KEY",
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    );

    const encrypted = encryptSecret("super-secret-value");

    expect(encrypted).toBeTruthy();
    expect(encrypted).not.toContain("super-secret-value");
    expect(decryptSecret(encrypted)).toBe("super-secret-value");
  });

  it("keeps empty optional secrets empty", () => {
    expect(encryptSecret("")).toBeNull();
    expect(decryptSecret(null)).toBeUndefined();
  });
});
