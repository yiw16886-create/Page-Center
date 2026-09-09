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

test("comment moderation, post deletion, and scheduling preserve write safeguards", () => {
  const routes = read("server/routes.ts");
  const service = read("server/meta-service.ts");
  for (const path of [
    "/pages/:pageId/posts/:postId",
    "/pages/:pageId/comments/:commentId/replies",
    "/pages/:pageId/comments/:commentId",
    "/pages/:pageId/scheduled-posts",
  ]) assert.match(routes, new RegExp(path.replaceAll("/", "\\/")));
  assert.match(service, /REPLY_COMMENT:/);
  assert.match(service, /DELETE_COMMENT:/);
  assert.match(service, /DELETE_POST:/);
  assert.match(service, /SCHEDULE:/);
  assert.match(service, /runIdempotentAction/);
  assert.match(service, /canManageComments/);
  assert.match(service, /10 \* 60 \* 1000/);
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
  assert.match(service, /https:\/\/r\.jina\.ai\//);
  assert.match(service, /PRODUCT_HTTP_403/);
  assert.match(service, /store: false/);
  assert.match(service, /requestedModel = "gpt-5\.5"/);
  assert.match(read("server/ai-endpoint.ts"), /chat\/completions/);
  assert.match(routes, /\/product-drafts\/parse/);
  assert.match(routes, /\/product-drafts\/generate/);
  assert.doesNotMatch(routes, /\/stores\/shopline|\/products\/hot/);
});

test("AI relay tokens are encrypted and never returned to the browser", () => {
  const schema = read("prisma/schema.prisma");
  const settings = read("server/ai-settings.ts");
  const api = read("src/api.ts");
  assert.match(schema, /aiGatewayTokenCiphertext\s+String\?/);
  assert.match(settings, /encryptToken/);
  assert.match(settings, /decryptToken/);
  assert.match(settings, /hasToken: Boolean/);
  assert.doesNotMatch(api, /aiGatewayTokenCiphertext/);
  assert.match(api, /aiBaseUrl/);
  assert.match(api, /availableModels/);
  const endpoint = read("server/ai-endpoint.ts");
  assert.match(endpoint, /url\.protocol !== "https:"/);
  assert.match(endpoint, /AI_BASE_URL_BLOCKED/);
  assert.match(read("server/product-draft-service.ts"), /redirect: "error"/);
});

test("AI copy generation remains opt-in and image generation is absent", () => {
  const app = read("src/App.tsx");
  const routes = read("server/routes.ts");
  const schema = read("prisma/schema.prisma");
  const meta = read("server/meta-service.ts");
  assert.match(app, /AI 文案/);
  assert.doesNotMatch(app, /AI 配图|图片模型 ID/);
  assert.match(app, /只有点击 AI 按钮时才会调用并计费/);
  assert.match(app, /availableModels\.map/);
  assert.match(app, /中转站 API 基础地址/);
  assert.doesNotMatch(app, /模型 ID/);
  assert.match(routes, /\/settings\/ai/);
  assert.doesNotMatch(routes, /\/product-drafts\/generate-image/);
  assert.match(meta, /imageDataHash/);
  assert.match(meta, /IMAGE_DATA_TOO_LARGE/);
  assert.doesNotMatch(schema, /PostDraft|GeneratedImage|imageData|imageUrl/);
  assert.doesNotMatch(schema, /aiImageModel/);
});

test("dashboard exposes comments, replies, deletion, and native scheduling", () => {
  const app = read("src/App.tsx");
  const api = read("src/api.ts");
  assert.match(app, /评论管理/);
  assert.match(app, /replyComment/);
  assert.match(app, /deleteComment/);
  assert.match(app, /deletePost/);
  assert.match(app, /定时发布/);
  assert.match(api, /scheduled-posts/);
  assert.doesNotMatch(app, /评论管理模块已预留/);
});

test("page sidebar shows public page details instead of OAuth capabilities", () => {
  const app = read("src/App.tsx");
  const client = read("server/meta-client.ts");
  const schema = read("prisma/schema.prisma");
  assert.match(app, /公共主页详细信息/);
  assert.match(app, /主页名称/);
  assert.match(app, /Page ID/);
  assert.match(app, /主页类别/);
  assert.match(app, /主页链接/);
  assert.match(app, /联系电话/);
  assert.match(app, /联系邮箱/);
  assert.match(app, /联系地址/);
  assert.match(client, /link,website,phone,emails,single_line_address/);
  assert.match(schema, /pageLink\s+String\?/);
  assert.match(schema, /emails\s+String\s+@default\("\[\]"\)/);
  assert.match(app, /最近同步/);
  assert.doesNotMatch(app, /<h2>主页能力<\/h2>/);
  assert.doesNotMatch(app, /当前 OAuth 权限快照/);
});
