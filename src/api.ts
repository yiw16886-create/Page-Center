const headers = {
  "Content-Type": "application/json",
  "X-Page-Center-CSRF": "1",
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const body = await response.json();
  if (!response.ok)
    throw new ApiError(
      body.error || "REQUEST_FAILED",
      response.status,
      body.code,
    );
  return body.data as T;
}

export type User = { id: number; email: string };
export type Page = {
  pageId: string;
  pageName: string;
  category: string | null;
  canRead: boolean;
  canPublish: boolean;
  canManageComments: boolean;
  status: string;
};
export type MetaStatus = {
  connected: boolean;
  facebookUserName: string | null;
  grantedScopes: string[];
  tokenExpiresAt: string | null;
  lastVerifiedAt: string | null;
  pages: Page[];
};
export type Post = {
  id: string;
  message?: string;
  created_time?: string;
  full_picture?: string;
  permalink_url?: string;
  is_published?: boolean;
};
export type PluginToken = {
  id: string;
  name: string;
  tokenPrefix: string;
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
};
export type StoreConnection = {
  id: string;
  provider: "SHOPLINE";
  name: string;
  handle: string;
  publicStoreUrl: string;
  status: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};
export type HotProduct = {
  id: string;
  storeConnectionId: string;
  title: string;
  productUrl: string;
  sales7d: number;
  salesPrevious7d: number;
  growthRate: number;
  hotScore: number;
  lastSeenAt: string;
  storeConnection: { name: string };
};

export const api = {
  me: () => request<User>("/api/auth/me"),
  login: (email: string, password: string) =>
    request<User>("/api/auth/login", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST", headers }),
  readiness: () =>
    request<{
      ready: boolean;
      checks: Array<{ id: string; label: string; ready: boolean }>;
    }>("/api/readiness"),
  metaStatus: () => request<MetaStatus>("/api/meta/status"),
  connect: () =>
    request<{ url: string }>("/api/meta/connect", { method: "POST", headers }),
  verify: () =>
    request<MetaStatus>("/api/meta/verify", { method: "POST", headers }),
  disconnect: () =>
    request<void>("/api/meta/disconnect", { method: "POST", headers }),
  pluginTokens: () => request<PluginToken[]>("/api/plugin/tokens"),
  createPluginToken: (name: string) =>
    request<{ record: PluginToken; token: string }>("/api/plugin/tokens", {
      method: "POST",
      headers,
      body: JSON.stringify({ name }),
    }),
  revokePluginToken: (tokenId: string) =>
    request<void>(`/api/plugin/tokens/${encodeURIComponent(tokenId)}`, {
      method: "DELETE",
      headers,
    }),
  stores: () => request<StoreConnection[]>("/api/stores"),
  saveShopline: (input: {
    name: string;
    handle: string;
    publicStoreUrl: string;
    accessToken: string;
  }) =>
    request<StoreConnection>("/api/stores/shopline", {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    }),
  syncStore: (connectionId: string) =>
    request<{ products: number; ordersScanned: number; syncedAt: string }>(
      `/api/stores/${encodeURIComponent(connectionId)}/sync`,
      { method: "POST", headers },
    ),
  disconnectStore: (connectionId: string) =>
    request<void>(`/api/stores/${encodeURIComponent(connectionId)}`, {
      method: "DELETE",
      headers,
    }),
  hotProducts: (storeId?: string) =>
    request<HotProduct[]>(
      `/api/products/hot?limit=20${storeId ? `&storeId=${encodeURIComponent(storeId)}` : ""}`,
    ),
  posts: (pageId: string) =>
    request<{ posts: Post[]; nextCursor: string | null }>(
      `/api/pages/${encodeURIComponent(pageId)}/posts`,
    ),
  publish: (pageId: string, message: string, imageUrl: string) =>
    request<{ postId: string }>(
      `/api/pages/${encodeURIComponent(pageId)}/posts`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          message,
          imageUrl: imageUrl || undefined,
          confirmationText: `PUBLISH:${pageId}`,
          idempotencyKey: crypto.randomUUID().replaceAll("-", ""),
        }),
      },
    ),
};
