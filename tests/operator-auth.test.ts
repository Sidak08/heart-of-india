import { describe, expect, it } from "vitest";
import { verifyOperatorCredentials } from "@/lib/server/operator";

describe("operator credentials", () => {
  it("accepts the configured email and scrypt password", async () => {
    await expect(verifyOperatorCredentials(" OWNER@example.com ", "test-password-123")).resolves.toBe(true);
  });

  it("rejects an incorrect email or password", async () => {
    await expect(verifyOperatorCredentials("other@example.com", "test-password-123")).resolves.toBe(false);
    await expect(verifyOperatorCredentials("owner@example.com", "wrong-password")).resolves.toBe(false);
  });
});
