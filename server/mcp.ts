import type { NextFunction, Request, Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { authenticatePluginToken } from "./plugin-token-service.js";
import { listPosts, publishPost, status } from "./meta-service.js";
import { authenticateOAuthAccessToken, oauthChallenge } from "./oauth.js";

type PluginRequest = Request & {
  pluginActor?: { id: number; email: string; scopes: string[] };
};

export async function requirePluginToken(
  req: PluginRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const authorization = req.header("authorization");
    const oauthActor = await authenticateOAuthAccessToken(authorization);
    const legacyActor = oauthActor
      ? null
      : await authenticatePluginToken(authorization);
    const actor =
      oauthActor ||
      (legacyActor
        ? { ...legacyActor, scopes: ["pages.read", "pages.write"] }
        : null);
    if (!actor) {
      res.setHeader("WWW-Authenticate", oauthChallenge());
      return res.status(401).json({ error: "PLUGIN_OAUTH_REQUIRED" });
    }
    req.pluginActor = actor;
    next();
  } catch (error) {
    console.error(
      "plugin_auth_failed",
      error instanceof Error ? error.message : String(error),
    );
    return res.status(503).json({ error: "PLUGIN_AUTH_UNAVAILABLE" });
  }
}

const result = (value: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
  structuredContent: value,
});

const authError = (scope: string) => ({
  content: [{ type: "text" as const, text: `需要重新授权插件权限：${scope}` }],
  isError: true,
  _meta: { "mcp/www_authenticate": oauthChallenge(scope) },
});

const invalidInput = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
});

const postsInput = z.object({
  pageId: z.string().min(1),
  after: z.string().optional(),
});

const publishInput = z.object({
  pageId: z.string().min(1),
  message: z.string().min(1).max(63206),
  imageUrl: z.string().url().optional(),
  confirmationText: z.string(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{12,128}$/),
});

const tools = [
  {
    name: "list_pages",
    title: "列出已授权公共主页",
    description:
      "列出当前私人 Page Center 账号经 Meta OAuth 授权的公共主页及读取、发布权限。",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    securitySchemes: [{ type: "oauth2", scopes: ["pages.read"] }],
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "get_page_posts",
    title: "读取公共主页帖子",
    description: "读取指定且已授权 Facebook 公共主页的最近帖子。",
    inputSchema: {
      type: "object",
      properties: {
        pageId: {
          type: "string",
          minLength: 1,
          description: "由 list_pages 返回的 Facebook Page ID",
        },
        after: { type: "string", description: "可选的下一页游标" },
      },
      required: ["pageId"],
      additionalProperties: false,
    },
    securitySchemes: [{ type: "oauth2", scopes: ["pages.read"] }],
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "publish_page_post",
    title: "发布公共主页帖子",
    description:
      "发布文本或公开 HTTPS 图片帖子。仅在用户明确确认目标主页和内容后调用；confirmationText 必须精确等于 PUBLISH:<pageId>。",
    inputSchema: {
      type: "object",
      properties: {
        pageId: {
          type: "string",
          minLength: 1,
          description: "由 list_pages 返回且具有发布权限的 Facebook Page ID",
        },
        message: { type: "string", minLength: 1, maxLength: 63206 },
        imageUrl: { type: "string", format: "uri" },
        confirmationText: {
          type: "string",
          description: "必须精确等于 PUBLISH:<pageId>",
        },
        idempotencyKey: {
          type: "string",
          pattern: "^[A-Za-z0-9_-]{12,128}$",
        },
      },
      required: ["pageId", "message", "confirmationText", "idempotencyKey"],
      additionalProperties: false,
    },
    securitySchemes: [{ type: "oauth2", scopes: ["pages.write"] }],
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
] as const;

function createServer(userId: number, scopes: string[]) {
  const server = new Server(
    { name: "meta-page-center-private", version: "1.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "这是私人 Meta 公共主页管理服务。发布前必须先列出主页并取得用户对目标主页与正文的明确确认；不得猜测 Page ID 或自行发布。",
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools as unknown as Array<Record<string, unknown>>,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = request.params.arguments || {};
    if (request.params.name === "list_pages") {
      if (!scopes.includes("pages.read")) return authError("pages.read");
      const current = await status(userId);
      const pages = current.pages.map(
        (page: {
          pageId: string;
          pageName: string;
          category: string | null;
          canRead: boolean;
          canPublish: boolean;
          canManageComments: boolean;
          status: string;
          lastVerifiedAt: Date | null;
        }) => ({
          pageId: page.pageId,
          pageName: page.pageName,
          category: page.category,
          canRead: page.canRead,
          canPublish: page.canPublish,
          canManageComments: page.canManageComments,
          status: page.status,
          lastVerifiedAt: page.lastVerifiedAt,
        }),
      );
      return result({ connected: current.connected, pages });
    }
    if (request.params.name === "get_page_posts") {
      if (!scopes.includes("pages.read")) return authError("pages.read");
      const parsed = postsInput.safeParse(args);
      if (!parsed.success) return invalidInput("主页读取参数无效");
      return result(
        await listPosts(userId, parsed.data.pageId, parsed.data.after),
      );
    }
    if (request.params.name === "publish_page_post") {
      if (!scopes.includes("pages.write")) return authError("pages.write");
      const parsed = publishInput.safeParse(args);
      if (!parsed.success) return invalidInput("主页发布参数无效");
      return result(await publishPost({ userId, ...parsed.data }));
    }
    return invalidInput("未知工具");
  });

  return server;
}

export async function handleMcp(req: PluginRequest, res: Response) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }
  const server = createServer(req.pluginActor!.id, req.pluginActor!.scopes);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
