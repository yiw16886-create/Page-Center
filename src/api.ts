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
  scheduled_publish_time?: string | number;
};
export type Comment = {
  id: string;
  message?: string;
  created_time?: string;
  from?: { id?: string; name?: string };
  can_remove?: boolean;
  comments?: { data?: Comment[] };
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
export type ProductDraft = {
  sourceUrl: string;
  title: string;
  description: string;
  price: string | null;
  imageUrls: string[];
  parseMode?: "direct" | "reader";
};
export type AiSettings = {
  aiTextModel: string;
  availableModels: Array<{ id: string; label: string }>;
  aiBaseUrl: string;
  hasToken: boolean;
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
  aiSettings: () => request<AiSettings>("/api/settings/ai"),
  saveAiSettings: (
    textModel: string,
    baseUrl: string,
    options: { token?: string; clearToken?: boolean } = {},
  ) =>
    request<AiSettings>("/api/settings/ai", {
      method: "PUT",
      headers,
      body: JSON.stringify({ textModel, baseUrl, ...options }),
    }),
  parseProduct: (url: string) =>
    request<ProductDraft>("/api/product-drafts/parse", {
      method: "POST",
      headers,
      body: JSON.stringify({ url }),
    }),
  generateProductCopy: (
    product: ProductDraft,
    options: { language: string; tone: string },
  ) =>
    request<{ message: string }>("/api/product-drafts/generate", {
      method: "POST",
      headers,
      body: JSON.stringify({ product, ...options }),
    }),
  posts: (pageId: string) =>
    request<{ posts: Post[]; nextCursor: string | null }>(
      `/api/pages/${encodeURIComponent(pageId)}/posts`,
    ),
  scheduledPosts: (pageId: string) =>
    request<{ posts: Post[]; nextCursor: string | null }>(
      `/api/pages/${encodeURIComponent(pageId)}/scheduled-posts`,
    ),
  comments: (pageId: string, postId: string) =>
    request<{ comments: Comment[]; nextCursor: string | null }>(
      `/api/pages/${encodeURIComponent(pageId)}/posts/${encodeURIComponent(postId)}/comments`,
    ),
  replyComment: (pageId: string, commentId: string, message: string) =>
    request<{ replyId: string }>(
      `/api/pages/${encodeURIComponent(pageId)}/comments/${encodeURIComponent(commentId)}/replies`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          message,
          confirmationText: `REPLY_COMMENT:${commentId}`,
          idempotencyKey: crypto.randomUUID().replaceAll("-", ""),
        }),
      },
    ),
  deleteComment: (pageId: string, commentId: string) =>
    request<void>(
      `/api/pages/${encodeURIComponent(pageId)}/comments/${encodeURIComponent(commentId)}`,
      {
        method: "DELETE",
        headers,
        body: JSON.stringify({
          confirmationText: `DELETE_COMMENT:${commentId}`,
          idempotencyKey: crypto.randomUUID().replaceAll("-", ""),
        }),
      },
    ),
  deletePost: (pageId: string, postId: string) =>
    request<void>(
      `/api/pages/${encodeURIComponent(pageId)}/posts/${encodeURIComponent(postId)}`,
      {
        method: "DELETE",
        headers,
        body: JSON.stringify({
          confirmationText: `DELETE_POST:${postId}`,
          idempotencyKey: crypto.randomUUID().replaceAll("-", ""),
        }),
      },
    ),
  schedulePost: (
    pageId: string,
    message: string,
    imageUrl: string,
    scheduledAt: string,
  ) =>
    request<{ postId: string; scheduledAt: string }>(
      `/api/pages/${encodeURIComponent(pageId)}/scheduled-posts`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          message,
          imageUrl: imageUrl || undefined,
          scheduledAt,
          confirmationText: `SCHEDULE:${pageId}`,
          idempotencyKey: crypto.randomUUID().replaceAll("-", ""),
        }),
      },
    ),
  publish: (
    pageId: string,
    message: string,
    imageUrl: string,
    imageDataUrl: string,
  ) =>
    request<{ postId: string }>(
      `/api/pages/${encodeURIComponent(pageId)}/posts`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          message,
          imageUrl: imageUrl || undefined,
          imageDataUrl: imageDataUrl || undefined,
          confirmationText: `PUBLISH:${pageId}`,
          idempotencyKey: crypto.randomUUID().replaceAll("-", ""),
        }),
      },
    ),
};
