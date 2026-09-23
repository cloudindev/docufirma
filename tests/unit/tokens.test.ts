import {
  generateSignerToken,
  generateVerificationCode,
  hashToken,
  isWellFormedToken,
  sha256Hex,
} from "@/lib/signing/tokens";

describe("signer tokens", () => {
  it("generates 256-bit url-safe tokens", () => {
    const token = generateSignerToken();
    expect(token).toHaveLength(43);
    expect(isWellFormedToken(token)).toBe(true);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("never repeats", () => {
    const set = new Set(Array.from({ length: 1000 }, generateSignerToken));
    expect(set.size).toBe(1000);
  });

  it("hashes deterministically to lowercase hex sha-256", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(hashToken("abc")).toBe(sha256Hex("abc"));
  });

  it("rejects malformed tokens", () => {
    expect(isWellFormedToken("short")).toBe(false);
    expect(isWellFormedToken(`${"a".repeat(42)}=`)).toBe(false);
  });
});

describe("verification codes", () => {
  it("match the DF-XXXX-XXXX format accepted by the database", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateVerificationCode();
      expect(code).toMatch(/^DF-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
      expect(code).not.toMatch(/[01IO]/);
    }
  });
});
