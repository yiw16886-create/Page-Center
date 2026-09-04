import type { NextFunction, Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { authenticatePluginToken } from "./plugin-token-service.js";
import { listPosts, publishPost, status } from "./meta-service.js";

type PluginRequest = Request & { pluginActor?: { id: number; email: string } };

export async function requirePluginToken(
  req: PluginRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const actor = await authenticatePluginToken(req.header("authorization"));
    if (!actor) return res.status(401).json({ error: "PLUGIN_TOKEN_INVALID" });
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

function createServer(userId: number) {
  const server = new McpServer(
    { name: "meta-page-center-private", version: "1.0.0" },
    {
      instructions:
        "这是私人 Meta 公共主页管理服务。发布前必须先调用 list_pages 确认目标主页，并取得用户对主页与正文的明确确认；不得猜测 Page ID 或自行发布。",
    },
  );

  server.registerTool(
    "list_pages",
    {
      title: "列出已授权公共主页",
      description:
        "列出当前私人 Page Center 账号经 Meta OAuth 授权的公共主页及读取、发布权限。",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
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
    },
  );

  server.registerTool(
    "get_page_posts",
    {
      title: "读取公共主页帖子",
      description: "读取指定且已授权 Facebook 公共主页的最近帖子。",
      inputSchema: {
        pageId: z
          .string()
          .min(1)
          .describe("由 list_pages 返回的 Facebook Page ID"),
        after: z.string().optional().describe("可选的下一页游标"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ pageId, after }) => result(await listPosts(userId, pageId, after)),
  );

  server.registerTool(
    "publish_page_post",
    {
      title: "发布公共主页帖子",
      description:
        "发布文本或公开 HTTPS 图片帖子。仅在用户明确确认目标主页和内容后调用；confirmationText 必须精确等于 PUBLISH:<pageId>。",
      inputSchema: {
        pageId: z
          .string()
          .min(1)
          .describe("由 list_pages 返回且具有发布权限的 Facebook Page ID"),
        message: z.string().min(1).max(63206).describe("帖子正文"),
        imageUrl: z
          .string()
          .url()
          .optional()
          .describe("可选的公开 HTTPS 图片 URL"),
        confirmationText: z
          .string()
          .describe("用户确认字符串，必须精确等于 PUBLISH:<pageId>"),
        idempotencyKey: z
          .string()
          .regex(/^[A-Za-z0-9_-]{12,128}$/)
          .describe("本次发布的唯一幂等键"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => result(await publishPost({ userId, ...input })),
  );

  return server;
}

export async function handleMcp(req: PluginRequest, res: Response) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }
  const server = createServer(req.pluginActor!.id);
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
