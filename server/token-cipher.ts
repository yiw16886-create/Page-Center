import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(env: NodeJS.ProcessEnv = process.env) {
  const value = env.TOKEN_ENCRYPTION_KEY;
  if (!value) throw new Error("TOKEN_ENCRYPTION_KEY_MISSING");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY_INVALID");
  return decoded;
}

export function encryptToken(value: string, env: NodeJS.ProcessEnv = process.env) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(env), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptToken(value: string, env: NodeJS.ProcessEnv = process.env) {
  const [version, iv, tag, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("TOKEN_CIPHERTEXT_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", key(env), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
