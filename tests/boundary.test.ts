import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("standalone schema has no SaaS tenant binding", () => {
  const schema = read("prisma/schema.prisma");
  for (const term of [
    "Organization",
    "orgId",
    "org_id",
    "tenantId",
    "workspaceId",
  ])
    assert.equal(schema.includes(term), false);
});

test("standalone app excludes legacy modules", () => {
  const files = fs
    .readdirSync(path.join(root, "server"), { recursive: true })
    .map(String)
    .join("\n")
    .toLowerCase();
  for (const term of [
    "ad-center",
    "store-sync",
    "account-health",
    "project-board",
    "business-manager",
  ])
    assert.equal(files.includes(term), false);
});

test("write endpoint requires CSRF, confirmation and idempotency", () => {
  const routes = read("server/routes.ts");
  const service = read("server/meta-service.ts");
  assert.match(routes, /requireCsrf/);
  assert.match(service, /PUBLISH:/);
  assert.match(service, /idempotencyKey/);
  assert.match(service, /state: "PENDING"/);
  assert.match(service, /ActionLog|actionLog/);
});

test("login distinguishes invalid credentials from service initialization errors", () => {
  const api = read("src/api.ts");
  const app = read("src/App.tsx");
  const routes = read("server/routes.ts");
  assert.match(api, /class ApiError/);
  assert.match(app, /error\.status === 401/);
  assert.match(routes, /SERVICE_NOT_READY/);
});

test("deployment applies migrations before building", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.scripts.build, /prisma migrate deploy/);
});

test("admin bootstrap reconciles a changed environment password", () => {
  const auth = read("server/auth.ts");
  assert.match(auth, /bcrypt\.compare\(password, existing\.passwordHash\)/);
  assert.match(auth, /prisma\.user\.update/);
});

test("private plugin tokens are hashed, revocable, and isolated from browser sessions", () => {
  const service = read("server/plugin-token-service.ts");
  const schema = read("prisma/schema.prisma");
  const routes = read("server/routes.ts");
  assert.match(service, /createHash\("sha256"\)/);
  assert.match(service, /randomBytes\(32\)/);
  assert.match(service, /status: "REVOKED"/);
  assert.match(schema, /model PluginAccessToken/);
  assert.match(schema, /tokenHash\s+String\s+@unique/);
  assert.doesNotMatch(schema, /rawToken|plaintextToken/);
  assert.match(routes, /requireCsrf/);
});

test("private MCP exposes only scoped Page tools and preserves publish safeguards", () => {
  const mcp = read("server/mcp.ts");
  const app = read("server/app.ts");
  for (const tool of ["list_pages", "get_page_posts", "publish_page_post"]) {
    assert.match(mcp, new RegExp(`name: "${tool}"`));
  }
  assert.match(mcp, /confirmationText/);
  assert.match(mcp, /idempotencyKey/);
  assert.match(mcp, /destructiveHint: true/);
  assert.match(mcp, /securitySchemes/);
  assert.match(mcp, /pages\.read/);
  assert.match(mcp, /pages\.write/);
  assert.match(app, /requirePluginToken/);
});

test("plugin package targets the private production MCP endpoint", () => {
  const manifest = JSON.parse(
    read("plugins/meta-page-center-private/.codex-plugin/plugin.json"),
  );
  const config = JSON.parse(read("plugins/meta-page-center-private/.mcp.json"));
  assert.equal(manifest.name, "meta-page-center-private");
  assert.deepEqual(manifest.interface.capabilities, ["Read", "Write"]);
  assert.equal(
    config.mcpServers["meta-page-center-private"].url,
    "https://page-center-tau.vercel.app/api/mcp",
  );
  assert.equal(
    "bearer_token_env_var" in config.mcpServers["meta-page-center-private"],
    false,
  );
});

test("plugin OAuth implements discovery, PKCE, audience binding, and refresh rotation", () => {
  const oauth = read("server/oauth.ts");
  const schema = read("prisma/schema.prisma");
  const app = read("server/app.ts");
  assert.match(oauth, /oauth-protected-resource/);
  assert.match(oauth, /oauth-authorization-server/);
  assert.match(oauth, /code_challenge_methods_supported: \["S256"\]/);
  assert.match(oauth, /authorization_response_iss_parameter_supported: true/);
  assert.match(oauth, /client_id_metadata_document_supported: true/);
  assert.match(oauth, /resource !== oauthResource\(\)/);
  assert.match(oauth, /grantType === "refresh_token"/);
  assert.match(oauth, /refreshTokenHash: hash\(nextRefreshToken\)/);
  assert.match(schema, /model OAuthAuthorizationCode/);
  assert.match(schema, /model OAuthAccessToken/);
  assert.doesNotMatch(schema, /accessToken\s+String|refreshToken\s+String/);
  assert.match(app, /express\.urlencoded/);
  const vercel = read("vercel.json");
  assert.match(vercel, /\/\.well-known\/\(\.\*\)/);
  assert.match(vercel, /\/oauth\/\(\.\*\)/);
});

test("OAuth login return accepts only the internal authorize path", () => {
  const app = read("src/App.tsx");
  assert.match(app, /oauth_return/);
  assert.match(app, /startsWith\("\/oauth\/authorize\?"\)/);
  assert.match(app, /!oauthReturn\.startsWith\("\/\/"\)/);
});

test("Page Center dashboard keeps a pluggable high-density UI shell", () => {
  const app = read("src/App.tsx");
  const styles = read("src/styles.css");
  assert.match(app, /role="tablist"/);
  assert.match(app, /读取帖子/);
  assert.match(app, /发布帖子/);
  assert.match(app, /管理评论/);
  assert.match(app, /Meta OAuth 全局连接/);
  assert.match(app, /activeTab === "settings"/);
  assert.match(app, /extension-nav/);
  assert.match(
    styles,
    /grid-template-columns:\s*repeat\(12,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(styles, /\.widget-primary\s*{[^}]*grid-column:\s*span 8/);
  assert.match(styles, /\.widget-secondary\s*{[^}]*grid-column:\s*span 4/);
});

test("OAuth and private plugin controls live in global settings", () => {
  const app = read("src/App.tsx");
  const settingsStart = app.indexOf('activeTab === "settings"');
  const oauthStart = app.indexOf("Meta OAuth 全局连接");
  const pluginStart = app.lastIndexOf("<PluginAccess />");
  assert.ok(settingsStart >= 0);
  assert.ok(oauthStart > settingsStart);
  assert.ok(pluginStart > oauthStart);
  assert.match(app, /一次授权同步并控制当前账号可管理的全部公共主页/);
});

test("product-link drafts are ephemeral and replace the SHOPLINE catalog", () => {
  const schema = read("prisma/schema.prisma");
  const service = read("server/product-draft-service.ts");
  const routes = read("server/routes.ts");
  assert.doesNotMatch(schema, /model StoreConnection|model ProductLink/);
  assert.match(service, /MAX_HTML_BYTES/);
  assert.match(service, /PRODUCT_URL_BLOCKED/);
  assert.match(service, /store: false/);
  assert.match(service, /VERCEL_OIDC_TOKEN/);
  assert.match(service, /ai-gateway\.vercel\.sh\/v1\/responses/);
  assert.match(service, /disallowPromptTraining: true/);
  assert.match(routes, /\/product-drafts\/parse/);
  assert.match(routes, /\/product-drafts\/generate/);
  assert.doesNotMatch(routes, /\/stores\/shopline|\/products\/hot/);
});

test("AI generation remains opt-in and generated images are not persisted", () => {
  const app = read("src/App.tsx");
  const routes = read("server/routes.ts");
  const schema = read("prisma/schema.prisma");
  const meta = read("server/meta-service.ts");
  assert.match(app, /AI 文案/);
  assert.match(app, /AI 配图/);
  assert.match(app, /只有点击 AI 按钮时才会调用并计费/);
  assert.match(routes, /\/settings\/ai/);
  assert.match(routes, /\/product-drafts\/generate-image/);
  assert.match(meta, /imageDataHash/);
  assert.match(meta, /IMAGE_DATA_TOO_LARGE/);
  assert.doesNotMatch(schema, /PostDraft|GeneratedImage|imageData|imageUrl/);
});
