import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { decryptToken, encryptToken } from "../server/token-cipher.js";

test("tokens are encrypted with authenticated encryption", () => {
  const env = { TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64") } as NodeJS.ProcessEnv;
  const encrypted = encryptToken("page-secret", env);
  assert.notEqual(encrypted, "page-secret");
  assert.equal(decryptToken(encrypted, env), "page-secret");
  const parts = encrypted.split(".");
  parts[2] = `${parts[2][0] === "A" ? "B" : "A"}${parts[2].slice(1)}`;
  assert.throws(() => decryptToken(parts.join("."), env));
});
