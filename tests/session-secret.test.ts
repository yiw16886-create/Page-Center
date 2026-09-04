import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { readiness, sessionSecret } from "../server/config.js";

test("session secret uses an explicit valid JWT secret", () => {
  const explicit = "x".repeat(32);
  assert.equal(sessionSecret({ JWT_SECRET: explicit } as NodeJS.ProcessEnv), explicit);
});

test("session secret is deterministically derived from the encryption key", () => {
  const encryptionKey = randomBytes(32).toString("base64");
  const env = { NODE_ENV: "production", TOKEN_ENCRYPTION_KEY: encryptionKey } as NodeJS.ProcessEnv;
  const first = sessionSecret(env);
  const second = sessionSecret(env);
  assert.equal(first, second);
  assert.ok(first.length >= 32);
  assert.notEqual(first, encryptionKey);
  assert.equal(readiness(env).checks.find((check) => check.id === "session")?.ready, true);
});

test("a legacy short JWT secret falls back to the encryption key", () => {
  const encryptionKey = randomBytes(32).toString("base64");
  const env = {
    NODE_ENV: "production",
    JWT_SECRET: "legacy-short-value",
    TOKEN_ENCRYPTION_KEY: encryptionKey,
  } as NodeJS.ProcessEnv;
  const derived = sessionSecret(env);
  assert.ok(derived.length >= 32);
  assert.notEqual(derived, env.JWT_SECRET);
});

test("production rejects missing or malformed session key material", () => {
  assert.throws(() => sessionSecret({ NODE_ENV: "production" } as NodeJS.ProcessEnv), /JWT_SECRET_INVALID/);
  assert.throws(
    () => sessionSecret({ NODE_ENV: "production", TOKEN_ENCRYPTION_KEY: "not-a-32-byte-key" } as NodeJS.ProcessEnv),
    /JWT_SECRET_INVALID/,
  );
});
