import { Router } from "express";
import bcrypt from "bcryptjs";
import prisma from "./db.js";
import {
  authenticate,
  clearSession,
  issueSession,
  requireCsrf,
  type AuthenticatedRequest,
} from "./auth.js";
import { metaConfig, readiness } from "./config.js";
import {
  completeAuthorization,
  createAuthorizationUrl,
  deleteComment,
  deletePost,
  disconnect,
  listComments,
  listPosts,
  listScheduledPosts,
  publishPost,
  replyToComment,
  schedulePost,
  status,
  verifyAuthorization,
} from "./meta-service.js";
import {
  createPluginToken,
  listPluginTokens,
  revokePluginToken,
} from "./plugin-token-service.js";
import {
  generateFacebookCopy,
  parseProductUrl,
  type ProductDraft,
} from "./product-draft-service.js";
import {
  getAiRuntimeSettings,
  getAiSettings,
  saveAiSettings,
} from "./ai-settings.js";

const router = Router();
const asyncRoute =
  (handler: (req: any, res: any) => Promise<unknown>) =>
  (req: any, res: any, next: any) =>
    Promise.resolve(handler(req, res)).catch(next);

router.post(
  "/auth/login",
  requireCsrf,
  asyncRoute(async (req, res) => {
    try {
      const email = String(req.body?.email || "")
        .trim()
        .toLowerCase();
      const password = String(req.body?.password || "");
      const user = await prisma.user.findUnique({ where: { email } });
      if (
        !user ||
        user.status !== "ACTIVE" ||
        !(await bcrypt.compare(password, user.passwordHash))
      )
        return res
          .status(401)
          .json({
            success: false,
            error: "账号或密码错误",
            code: "INVALID_CREDENTIALS",
          });
      issueSession(res, { id: user.id, email: user.email });
      res.json({ success: true, data: { id: user.id, email: user.email } });
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "login_database_failed",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return res
        .status(503)
        .json({
          success: false,
          error: "服务尚未完成数据库初始化",
          code: "SERVICE_NOT_READY",
        });
    }
  }),
);
router.post("/auth/logout", requireCsrf, (_req, res) => {
  clearSession(res);
  res.json({ success: true });
});
router.get("/auth/me", authenticate, (req: AuthenticatedRequest, res) =>
  res.json({ success: true, data: req.actor }),
);
router.get("/readiness", (_req, res) =>
  res.json({ success: true, data: readiness() }),
);

router.use(authenticate);
router.get(
  "/plugin/tokens",
  asyncRoute(async (req: AuthenticatedRequest, res) =>
    res.json({ success: true, data: await listPluginTokens(req.actor!.id) }),
  ),
);
router.post(
  "/plugin/tokens",
  requireCsrf,
  asyncRoute(async (req: AuthenticatedRequest, res) =>
    res.json({
      success: true,
      data: await createPluginToken(
        req.actor!.id,
        String(req.body?.name || ""),
      ),
    }),
  ),
);
router.delete(
  "/plugin/tokens/:tokenId",
  requireCsrf,
  asyncRoute(async (req: AuthenticatedRequest, res) => {
    await revokePluginToken(req.actor!.id, req.params.tokenId);
    res.json({ success: true });
  }),
);
router.get(
  "/settings/ai",
  asyncRoute(async (req: AuthenticatedRequest, res) =>
    res.json({ success: true, data: await getAiSettings(req.actor!.id) }),
  ),
);
router.put(
  "/settings/ai",
  requireCsrf,
  asyncRoute(async (req: AuthenticatedRequest, res) =>
    res.json({
      success: true,
      data: await saveAiSettings(
        req.actor!.id,
        String(req.body?.textModel || ""),
        String(req.body?.baseUrl || ""),
        typeof req.body?.token === "string" ? req.body.token : undefined,
        req.body?.clearToken === true,
      ),
    }),
  ),
);
router.post(
  "/product-drafts/parse",
  requireCsrf,
  asyncRoute(async (req: AuthenticatedRequest, res) =>
    res.json({
      success: true,
      data: await parseProductUrl(String(req.body?.url || "")),
    }),
  ),
);
router.post(
  "/product-drafts/generate",
  requireCsrf,
  asyncRoute(async (req: AuthenticatedRequest, res) => {
    const input = req.body?.product || {};
    const product: ProductDraft = {
      sourceUrl: String(input.sourceUrl || "").slice(0, 2048),
      title: String(input.title || "").slice(0, 300),
      description: String(input.description || "").slice(0, 4000),
      price: input.price ? String(input.price).slice(0, 100) : null,
      imageUrls: [],
    };
    if (!product.sourceUrl || !product.title)
      throw new Error("PRODUCT_DRAFT_INVALID");
    const settings = await getAiRuntimeSettings(req.actor!.id);
    res.set("Cache-Control", "no-store").json({
      success: true,
      data: await generateFacebookCopy(product, {
        language: String(req.body?.language || "zh-CN"),
        tone: String(req.body?.tone || "自然、有吸引力"),
        model: settings.aiTextModel,
        gatewayToken: settings.gatewayToken,
        baseUrl: settings.aiBaseUrl,
      }),
    });
  }),
);
router.get(
  "/meta/status",
  asyncRoute(async (req: AuthenticatedRequest, res) =>
    res.json({ success: true, data: await status(req.actor!.id) }),
  ),
);
router.post(
  "/meta/connect",
  requireCsrf,
  asyncRoute(async (req: AuthenticatedRequest, res) =>
    res.json({
      success: true,
      data: { url: await createAuthorizationUrl(req.actor!, metaConfig()) },
    }),
  ),
);
router.post(
  "/meta/verify",
  requireCsrf,
  asyncRoute(async (req: AuthenticatedRequest, res) =>
    res.json({
      success: true,
      data: await verifyAuthorization(req.actor!, metaConfig()),
    }),
  ),
);
router.post(
  "/meta/disconnect",
  requireCsrf,
  asyncRoute(async (req: AuthenticatedRequest, res) => {
    await disconnect(req.actor!.id);
    res.json({ success: true });
  }),
);
router.get(
  "/pages/:pageId/posts",
  asyncRoute(async (req: AuthenticatedRequest, res) =>
    res.json({
      success: true,
      data: await listPosts(
        req.actor!.id,
        req.params.pageId,
        typeof req.query.after === "string" ? req.query.after : undefined,
      ),
    }),
  ),
);
router.delete(
  "/pages/:pageId/posts/:postId",
  requireCsrf,
  asyncRoute(async (req: AuthenticatedRequest, res) => {
    const result = await deletePost({
      userId: req.actor!.id,
      pageId: req.params.pageId,
      postId: req.params.postId,
      confirmationText: String(req.body?.confirmationText || ""),
      idempotencyKey: String(req.body?.idempotencyKey || ""),
    });
    res.json({ success: true, data: result });
  }),
);
router.get(
  "/pages/:pageId/posts/:postId/comments",
  asyncRoute(async (req: AuthenticatedRequest, res) =>
    res.json({
      success: true,
      data: await listComments(
        req.actor!.id,
        req.params.pageId,
        req.params.postId,
        typeof req.query.after === "string" ? req.query.after : undefined,
      ),
    }),
  ),
);
router.post(
  "/pages/:pageId/comments/:commentId/replies",
  requireCsrf,
  asyncRoute(async (req: AuthenticatedRequest, res) => {
    const result = await replyToComment({
      userId: req.actor!.id,
      pageId: req.params.pageId,
      commentId: req.params.commentId,
      message: String(req.body?.message || ""),
      confirmationText: String(req.body?.confirmationText || ""),
      idempotencyKey: String(req.body?.idempotencyKey || ""),
    });
    res.json({ success: true, data: result });
  }),
);
router.delete(
  "/pages/:pageId/comments/:commentId",
  requireCsrf,
  asyncRoute(async (req: AuthenticatedRequest, res) => {
    const result = await deleteComment({
      userId: req.actor!.id,
      pageId: req.params.pageId,
      commentId: req.params.commentId,
      confirmationText: String(req.body?.confirmationText || ""),
      idempotencyKey: String(req.body?.idempotencyKey || ""),
    });
    res.json({ success: true, data: result });
  }),
);
router.get(
  "/pages/:pageId/scheduled-posts",
  asyncRoute(async (req: AuthenticatedRequest, res) =>
    res.json({
      success: true,
      data: await listScheduledPosts(
        req.actor!.id,
        req.params.pageId,
        typeof req.query.after === "string" ? req.query.after : undefined,
      ),
    }),
  ),
);
router.post(
  "/pages/:pageId/scheduled-posts",
  requireCsrf,
  asyncRoute(async (req: AuthenticatedRequest, res) => {
    const result = await schedulePost({
      userId: req.actor!.id,
      pageId: req.params.pageId,
      message: String(req.body?.message || ""),
      imageUrl: req.body?.imageUrl ? String(req.body.imageUrl) : undefined,
      scheduledAt: String(req.body?.scheduledAt || ""),
      confirmationText: String(req.body?.confirmationText || ""),
      idempotencyKey: String(req.body?.idempotencyKey || ""),
    });
    res.json({ success: true, data: result });
  }),
);
router.post(
  "/pages/:pageId/posts",
  requireCsrf,
  asyncRoute(async (req: AuthenticatedRequest, res) => {
    const result = await publishPost({
      userId: req.actor!.id,
      pageId: req.params.pageId,
      message: String(req.body?.message || ""),
      imageUrl: req.body?.imageUrl ? String(req.body.imageUrl) : undefined,
      imageDataUrl: req.body?.imageDataUrl
        ? String(req.body.imageDataUrl)
        : undefined,
      confirmationText: String(req.body?.confirmationText || ""),
      idempotencyKey: String(req.body?.idempotencyKey || ""),
    });
    res.json({ success: true, data: result });
  }),
);

export const callbackRouter = Router();
callbackRouter.get(
  "/callback",
  asyncRoute(async (req, res) => {
    const origin =
      process.env.APP_ORIGIN || `${req.protocol}://${req.get("host")}`;
    try {
      if (req.query.error) throw new Error("META_AUTH_DENIED");
      const code = String(req.query.code || "");
      const stateValue = String(req.query.state || "");
      if (!code || !stateValue) throw new Error("META_CALLBACK_INVALID");
      const pageCount = await completeAuthorization(
        code,
        stateValue,
        metaConfig(),
      );
      res.type("html").send(callbackHtml(origin, true, pageCount));
    } catch {
      res.type("html").send(callbackHtml(origin, false, 0));
    }
  }),
);

function callbackHtml(origin: string, success: boolean, pageCount: number) {
  const payload = JSON.stringify(
    success ? { type: "META_CONNECTED", pageCount } : { type: "META_ERROR" },
  );
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Meta OAuth</title><body style="font-family:system-ui;padding:40px;text-align:center"><h1>${success ? "授权完成" : "授权未完成"}</h1><p>${success ? `已同步 ${pageCount} 个公共主页。` : "请关闭窗口后重试。"}</p><script>if(window.opener){window.opener.postMessage(${payload},${JSON.stringify(origin)})}setTimeout(()=>window.close(),1200)</script></body></html>`;
}

export default router;
