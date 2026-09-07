import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.js";
import { pkceChallenge } from "../server/oauth.js";

test("OAuth discovery and unauthenticated MCP challenge work over HTTP", async () => {
  const app = createApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  const origin = `http://127.0.0.1:${port}`;
  const previousOrigin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = origin;

  try {
    const resourceResponse = await fetch(
      `${origin}/.well-known/oauth-protected-resource`,
    );
    assert.equal(resourceResponse.status, 200);
    const resource = (await resourceResponse.json()) as {
      resource: string;
      authorization_servers: string[];
    };
    assert.equal(resource.resource, `${origin}/api/mcp`);
    assert.deepEqual(resource.authorization_servers, [origin]);

    const serverResponse = await fetch(
      `${origin}/.well-known/oauth-authorization-server`,
    );
    const metadata = (await serverResponse.json()) as {
      code_challenge_methods_supported: string[];
      client_id_metadata_document_supported: boolean;
    };
    assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"]);
    assert.equal(metadata.client_id_metadata_document_supported, true);

    const mcpResponse = await fetch(`${origin}/api/mcp`, {
      redirect: "manual",
    });
    assert.equal(mcpResponse.status, 401);
    assert.match(
      mcpResponse.headers.get("www-authenticate") || "",
      /oauth-protected-resource/,
    );

    const verifier = "a".repeat(43);
    const authorize = new URL(`${origin}/oauth/authorize`);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set(
      "client_id",
      "https://chatgpt.com/oauth/client.json",
    );
    authorize.searchParams.set(
      "redirect_uri",
      "https://chatgpt.com/connector_platform_oauth_redirect",
    );
    authorize.searchParams.set("code_challenge", pkceChallenge(verifier));
    authorize.searchParams.set("code_challenge_method", "S256");
    authorize.searchParams.set("resource", `${origin}/api/mcp`);
    authorize.searchParams.set("scope", "pages.read pages.write");
    authorize.searchParams.set("state", "test-state");
    const authorizeResponse = await fetch(authorize, { redirect: "manual" });
    assert.equal(authorizeResponse.status, 302);
    assert.match(
      authorizeResponse.headers.get("location") || "",
      /^\/?\?oauth_return=/,
    );
  } finally {
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
