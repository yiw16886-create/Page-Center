import { createHash } from "node:crypto";
import prisma from "./db.js";
import { decryptToken, encryptToken } from "./token-cipher.js";

const API_VERSION = "v20260901";
const HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const MAX_PRODUCTS = 1000;
const MAX_ORDERS = 5000;

type ShoplineProduct = {
  id?: string;
  title?: string;
  path?: string;
  handle?: string;
  status?: string;
};
type ShoplineOrder = {
  order_at?: string;
  created_at?: string;
  financial_status?: string;
  status?: string;
  cancelled_at?: string | null;
  line_items?: Array<{ product_id?: string; quantity?: number }>;
};

export type ShoplineConnectionInput = {
  name: string;
  handle: string;
  publicStoreUrl: string;
  accessToken: string;
};

function normalizeHandle(value: string) {
  const handle = value.trim().toLowerCase();
  if (!HANDLE_PATTERN.test(handle)) throw new Error("SHOPLINE_HANDLE_INVALID");
  return handle;
}

function normalizePublicStoreUrl(value: string) {
  const url = new URL(value.trim());
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error("SHOPLINE_PUBLIC_URL_INVALID");
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function apiBase(handle: string) {
  return `https://${handle}.myshopline.com/admin/openapi/${API_VERSION}`;
}

async function shoplineGet<T>(
  handle: string,
  token: string,
  path: string,
  params: Record<string, string>,
): Promise<{ body: T; next: string | null }> {
  const base = apiBase(handle);
  const url = new URL(path, `${base}/`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error("SHOPLINE_AUTH_INVALID");
    if (response.status === 429) throw new Error("SHOPLINE_RATE_LIMITED");
    throw new Error(`SHOPLINE_HTTP_${response.status}`);
  }
  const link = response.headers.get("link") || "";
  const nextMatch = link.match(/<([^>]+)>;\s*rel="next"/i);
  let next: string | null = null;
  if (nextMatch) {
    const candidate = new URL(nextMatch[1]);
    if (
      candidate.hostname === `${handle}.myshopline.com` &&
      candidate.pathname.startsWith(`/admin/openapi/${API_VERSION}/`)
    )
      next = candidate.toString();
  }
  return { body: (await response.json()) as T, next };
}

async function getAllProducts(handle: string, token: string) {
  const products: ShoplineProduct[] = [];
  let path = "products/products.json";
  let params: Record<string, string> = {
    status: "active",
    limit: "50",
    fields: "id,title,path,handle,status",
  };
  while (products.length < MAX_PRODUCTS) {
    const page = await shoplineGet<{ products?: ShoplineProduct[] }>(
      handle,
      token,
      path,
      params,
    );
    products.push(...(page.body.products || []));
    if (!page.next) break;
    path = page.next;
    params = {};
  }
  return products.slice(0, MAX_PRODUCTS);
}

async function getRecentOrders(handle: string, token: string) {
  const orders: ShoplineOrder[] = [];
  const start = new Date(Date.now() - 14 * 86_400_000).toISOString();
  let path = "orders.json";
  let params: Record<string, string> = {
    order_at_min: start,
    financial_status: "paid",
    status: "any",
    limit: "100",
    fields: "order_at,created_at,financial_status,status,cancelled_at,line_items",
  };
  while (orders.length < MAX_ORDERS) {
    const page = await shoplineGet<{ orders?: ShoplineOrder[] }>(
      handle,
      token,
      path,
      params,
    );
    orders.push(...(page.body.orders || []));
    if (!page.next) break;
    path = page.next;
    params = {};
  }
  return orders.slice(0, MAX_ORDERS);
}

function productKey(storeId: string, sourceId: string) {
  return createHash("sha256").update(`${storeId}:${sourceId}`).digest("hex");
}

function productUrl(origin: string, product: ShoplineProduct) {
  const path =
    product.path?.startsWith("/") && !product.path.startsWith("//")
      ? product.path
      : product.handle
        ? `/products/${encodeURIComponent(product.handle)}`
        : "";
  if (!path) throw new Error("SHOPLINE_PRODUCT_LINK_MISSING");
  return new URL(path, `${origin}/`).toString();
}

export function scoreProducts(
  products: Array<{ sourceId: string; sales7d: number; salesPrevious7d: number }>,
) {
  const maxSales = Math.max(1, ...products.map((item) => item.sales7d));
  return products.map((item) => {
    const growthRate =
      item.salesPrevious7d === 0
        ? item.sales7d > 0
          ? 1
          : 0
        : (item.sales7d - item.salesPrevious7d) / item.salesPrevious7d;
    const volumeScore = (item.sales7d / maxSales) * 70;
    const growthScore = Math.max(0, Math.min(2, growthRate)) * 15;
    return {
      ...item,
      growthRate,
      hotScore: Math.round((volumeScore + growthScore) * 100) / 100,
    };
  });
}

export async function saveShoplineConnection(
  userId: number,
  input: ShoplineConnectionInput,
) {
  const handle = normalizeHandle(input.handle);
  const publicStoreUrl = normalizePublicStoreUrl(input.publicStoreUrl);
  const name = input.name.trim().slice(0, 100);
  const accessToken = input.accessToken.trim();
  if (!name || accessToken.length < 20) throw new Error("SHOPLINE_INPUT_INVALID");
  await shoplineGet<{ products?: ShoplineProduct[] }>(
    handle,
    accessToken,
    "products/products.json",
    { limit: "1", fields: "id,title,path,handle,status" },
  );
  const connection = await prisma.storeConnection.upsert({
    where: { userId_handle: { userId, handle } },
    update: {
      name,
      publicStoreUrl,
      accessTokenCiphertext: encryptToken(accessToken),
      status: "ACTIVE",
      lastError: null,
    },
    create: {
      userId,
      name,
      handle,
      publicStoreUrl,
      accessTokenCiphertext: encryptToken(accessToken),
    },
  });
  return sanitizeConnection(connection);
}

function sanitizeConnection(connection: {
  id: string;
  provider: string;
  name: string;
  handle: string;
  publicStoreUrl: string;
  status: string;
  lastSyncedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: connection.id,
    provider: connection.provider,
    name: connection.name,
    handle: connection.handle,
    publicStoreUrl: connection.publicStoreUrl,
    status: connection.status,
    lastSyncedAt: connection.lastSyncedAt,
    lastError: connection.lastError,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

export async function listStoreConnections(userId: number) {
  const rows = await prisma.storeConnection.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(sanitizeConnection);
}

export async function disconnectStore(userId: number, connectionId: string) {
  await prisma.storeConnection.deleteMany({ where: { id: connectionId, userId } });
}

export async function syncShopline(userId: number, connectionId: string) {
  const connection = await prisma.storeConnection.findFirst({
    where: { id: connectionId, userId, provider: "SHOPLINE", status: "ACTIVE" },
  });
  if (!connection) throw new Error("SHOPLINE_CONNECTION_NOT_FOUND");
  const syncStartedAt = new Date();
  try {
    const token = decryptToken(connection.accessTokenCiphertext);
    const [products, orders] = await Promise.all([
      getAllProducts(connection.handle, token),
      getRecentOrders(connection.handle, token),
    ]);
    const now = Date.now();
    const current = new Map<string, number>();
    const previous = new Map<string, number>();
    for (const order of orders) {
      if (order.cancelled_at || order.status === "cancelled") continue;
      const orderTime = Date.parse(order.order_at || order.created_at || "");
      if (!Number.isFinite(orderTime)) continue;
      const bucket = now - orderTime <= 7 * 86_400_000 ? current : previous;
      for (const item of order.line_items || []) {
        if (!item.product_id) continue;
        bucket.set(
          item.product_id,
          (bucket.get(item.product_id) || 0) + Math.max(0, Number(item.quantity) || 0),
        );
      }
    }
    const valid = products.filter(
      (product): product is ShoplineProduct & { id: string; title: string } =>
        !!product.id && !!product.title,
    );
    const scored = scoreProducts(
      valid.map((product) => ({
        sourceId: product.id,
        sales7d: current.get(product.id) || 0,
        salesPrevious7d: previous.get(product.id) || 0,
      })),
    );
    const scores = new Map(scored.map((item) => [item.sourceId, item]));
    const upserts = valid.map((product) => {
      const score = scores.get(product.id)!;
      const key = productKey(connection.id, product.id);
      return prisma.productLink.upsert({
        where: {
          storeConnectionId_productKey: {
            storeConnectionId: connection.id,
            productKey: key,
          },
        },
        update: {
          title: product.title.slice(0, 255),
          productUrl: productUrl(connection.publicStoreUrl, product),
          status: "ACTIVE",
          sales7d: score.sales7d,
          salesPrevious7d: score.salesPrevious7d,
          growthRate: score.growthRate,
          hotScore: score.hotScore,
          lastSeenAt: syncStartedAt,
        },
        create: {
          userId,
          storeConnectionId: connection.id,
          productKey: key,
          title: product.title.slice(0, 255),
          productUrl: productUrl(connection.publicStoreUrl, product),
          sales7d: score.sales7d,
          salesPrevious7d: score.salesPrevious7d,
          growthRate: score.growthRate,
          hotScore: score.hotScore,
          lastSeenAt: syncStartedAt,
        },
      });
    });
    // Keep transactions small enough for serverless databases and function timeouts.
    // A failed retry is safe because every write is an idempotent upsert.
    for (let index = 0; index < upserts.length; index += 100) {
      await prisma.$transaction(upserts.slice(index, index + 100));
    }
    await prisma.$transaction([
      prisma.productLink.updateMany({
        where: {
          storeConnectionId: connection.id,
          lastSeenAt: { lt: syncStartedAt },
        },
        data: { status: "INACTIVE" },
      }),
      prisma.storeConnection.update({
        where: { id: connection.id },
        data: { lastSyncedAt: syncStartedAt, lastError: null },
      }),
    ]);
    return { products: valid.length, ordersScanned: orders.length, syncedAt: syncStartedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "SHOPLINE_SYNC_FAILED";
    await prisma.storeConnection.update({
      where: { id: connection.id },
      data: { lastError: message.slice(0, 500) },
    });
    throw error;
  }
}

export async function listHotProducts(
  userId: number,
  options: { storeId?: string; limit?: number } = {},
) {
  const limit = Math.max(1, Math.min(50, options.limit || 20));
  return prisma.productLink.findMany({
    where: {
      userId,
      status: "ACTIVE",
      ...(options.storeId ? { storeConnectionId: options.storeId } : {}),
    },
    select: {
      id: true,
      storeConnectionId: true,
      title: true,
      productUrl: true,
      sales7d: true,
      salesPrevious7d: true,
      growthRate: true,
      hotScore: true,
      lastSeenAt: true,
      storeConnection: { select: { name: true } },
    },
    orderBy: [{ hotScore: "desc" }, { sales7d: "desc" }],
    take: limit,
  });
}
