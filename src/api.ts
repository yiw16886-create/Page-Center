const headers = { "Content-Type": "application/json", "X-Page-Center-CSRF": "1" };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "REQUEST_FAILED");
  return body.data as T;
}

export type User = { id: number; email: string };
export type Page = { pageId: string; pageName: string; category: string | null; canRead: boolean; canPublish: boolean; canManageComments: boolean; status: string };
export type MetaStatus = { connected: boolean; facebookUserName: string | null; grantedScopes: string[]; tokenExpiresAt: string | null; lastVerifiedAt: string | null; pages: Page[] };
export type Post = { id: string; message?: string; created_time?: string; full_picture?: string; permalink_url?: string; is_published?: boolean };

export const api = {
  me: () => request<User>("/api/auth/me"),
  login: (email: string, password: string) => request<User>("/api/auth/login", { method: "POST", headers, body: JSON.stringify({ email, password }) }),
  logout: () => request<void>("/api/auth/logout", { method: "POST", headers }),
  readiness: () => request<{ ready: boolean; checks: Array<{ id: string; label: string; ready: boolean }> }>("/api/readiness"),
  metaStatus: () => request<MetaStatus>("/api/meta/status"),
  connect: () => request<{ url: string }>("/api/meta/connect", { method: "POST", headers }),
  verify: () => request<MetaStatus>("/api/meta/verify", { method: "POST", headers }),
  disconnect: () => request<void>("/api/meta/disconnect", { method: "POST", headers }),
  posts: (pageId: string) => request<{ posts: Post[]; nextCursor: string | null }>(`/api/pages/${encodeURIComponent(pageId)}/posts`),
  publish: (pageId: string, message: string, imageUrl: string) => request<{ postId: string }>(`/api/pages/${encodeURIComponent(pageId)}/posts`, { method: "POST", headers, body: JSON.stringify({ message, imageUrl: imageUrl || undefined, confirmationText: `PUBLISH:${pageId}`, idempotencyKey: crypto.randomUUID().replaceAll("-", "") }) }),
};
