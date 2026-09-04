import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sessionSecret } from "./config.js";
import prisma from "./db.js";

export const SESSION_COOKIE = "page_center_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type Actor = { id: number; email: string };
export type AuthenticatedRequest = Request & { actor?: Actor };

export function issueSession(res: Response, actor: Actor) {
  const token = jwt.sign(actor, sessionSecret(), { expiresIn: SESSION_TTL_SECONDS });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

export function clearSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
}

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return res.status(401).json({ success: false, error: "请先登录" });
    const payload = jwt.verify(token, sessionSecret()) as Actor;
    const user = await prisma.user.findUnique({ where: { id: payload.id }, select: { id: true, email: true, status: true } });
    if (!user || user.status !== "ACTIVE") return res.status(401).json({ success: false, error: "登录已失效" });
    req.actor = { id: user.id, email: user.email };
    next();
  } catch {
    return res.status(401).json({ success: false, error: "登录已失效" });
  }
}

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  if (req.header("x-page-center-csrf") !== "1") return res.status(403).json({ success: false, error: "请求来源校验失败" });
  next();
}

export async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    if (process.env.NODE_ENV === "production") throw new Error("ADMIN_BOOTSTRAP_NOT_CONFIGURED");
    return;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 12) } });
  } else if (!(await bcrypt.compare(password, existing.passwordHash))) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: await bcrypt.hash(password, 12), status: "ACTIVE" },
    });
  }
}
