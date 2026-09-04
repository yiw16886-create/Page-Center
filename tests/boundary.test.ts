import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("standalone schema has no SaaS tenant binding", () => {
  const schema = read("prisma/schema.prisma");
  for (const term of ["Organization", "orgId", "org_id", "tenantId", "workspaceId"]) assert.equal(schema.includes(term), false);
});

test("standalone app excludes legacy modules", () => {
  const files = fs.readdirSync(path.join(root, "server"), { recursive: true }).map(String).join("\n").toLowerCase();
  for (const term of ["ad-center", "store-sync", "account-health", "project-board", "business-manager"]) assert.equal(files.includes(term), false);
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
