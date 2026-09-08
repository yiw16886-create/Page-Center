import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const DEFAULT_AI_BASE_URL = "https://ai-gateway.vercel.sh/v1";

function privateIp(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::1" || normalized === "::" || normalized === "0.0.0.0")
    return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = mapped || (isIP(normalized) === 4 ? normalized : "");
  if (!ipv4) return false;
  const parts = ipv4.split(".").map(Number);
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] >= 224
  );
}

export function normalizeAiBaseUrl(value: string) {
  if (!value.trim() || value.length > 2048) throw new Error("AI_BASE_URL_INVALID");
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("AI_BASE_URL_INVALID");
  }
  const literalAddress = isIP(url.hostname) ? url.hostname : "";
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.port && url.port !== "443") ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    (literalAddress && privateIp(literalAddress))
  )
    throw new Error("AI_BASE_URL_INVALID");
  url.pathname = url.pathname.replace(/\/+$/, "") || "/v1";
  if (/\/(responses|chat\/completions|images\/generations)$/i.test(url.pathname))
    throw new Error("AI_BASE_URL_MUST_BE_BASE");
  return url.toString().replace(/\/$/, "");
}

export async function assertPublicAiBaseUrl(value: string) {
  const normalized = normalizeAiBaseUrl(value);
  const url = new URL(normalized);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => privateIp(address)))
    throw new Error("AI_BASE_URL_BLOCKED");
  return normalized;
}

export function aiEndpoint(baseUrl: string) {
  const gateway = new URL(baseUrl).hostname === "ai-gateway.vercel.sh";
  return {
    gateway,
    url: `${baseUrl}${gateway ? "/responses" : "/chat/completions"}`,
    fallbackUrl: gateway ? undefined : `${baseUrl}/responses`,
  };
}
