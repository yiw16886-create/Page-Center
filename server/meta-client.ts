import type { ReturnTypeMetaConfig } from "./types.js";

type GraphError = { error?: { code?: number; error_subcode?: number; message?: string } };

export type MetaPage = { id: string; name: string; category?: string; access_token: string; tasks?: string[] };
export type MetaPermission = { permission: string; status: string };
export type MetaComment = {
  id: string;
  message?: string;
  created_time?: string;
  from?: { id?: string; name?: string };
  can_remove?: boolean;
  comments?: { data?: MetaComment[] };
};

export class MetaClient {
  constructor(private readonly config: ReturnTypeMetaConfig, private readonly request: typeof fetch = fetch) {}

  private async graph<T>(url: URL, init?: RequestInit) {
    const response = await this.request(url, { ...init, signal: AbortSignal.timeout(10_000) });
    const body = (await response.json()) as T & GraphError;
    if (!response.ok || body.error) throw new Error(`META_GRAPH_ERROR_${body.error?.code || response.status}`);
    return body;
  }

  async exchangeCode(code: string) {
    const url = new URL(`https://graph.facebook.com/${this.config.graphVersion}/oauth/access_token`);
    url.search = new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, redirect_uri: this.config.redirectUri, code }).toString();
    return this.graph<{ access_token: string; expires_in?: number }>(url);
  }

  identity(token: string) {
    const url = new URL(`https://graph.facebook.com/${this.config.graphVersion}/me`);
    url.search = new URLSearchParams({ fields: "id,name", access_token: token }).toString();
    return this.graph<{ id: string; name?: string }>(url);
  }

  async permissions(token: string) {
    const url = new URL(`https://graph.facebook.com/${this.config.graphVersion}/me/permissions`);
    url.searchParams.set("access_token", token);
    return (await this.graph<{ data?: MetaPermission[] }>(url)).data || [];
  }

  async pages(token: string) {
    const url = new URL(`https://graph.facebook.com/${this.config.graphVersion}/me/accounts`);
    url.search = new URLSearchParams({ fields: "id,name,category,access_token,tasks", limit: "100", access_token: token }).toString();
    return (await this.graph<{ data?: MetaPage[] }>(url)).data || [];
  }
}

export class PageClient {
  constructor(private readonly token: string, private readonly version: string, private readonly request: typeof fetch = fetch) {}

  private async graph<T>(path: string, method: "GET" | "POST" | "DELETE", params: Record<string, string> = {}) {
    const safePath = path.split("/").map(encodeURIComponent).join("/");
    const url = new URL(`https://graph.facebook.com/${this.version}/${safePath}`);
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}`, Accept: "application/json" };
    const init: RequestInit = { method, headers, signal: AbortSignal.timeout(10_000) };
    if (method === "GET") Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    else if (method === "POST") { headers["Content-Type"] = "application/x-www-form-urlencoded"; init.body = new URLSearchParams(params); }
    const response = await this.request(url, init);
    const body = (await response.json()) as T & GraphError;
    if (!response.ok || body.error) throw new Error(`META_GRAPH_ERROR_${body.error?.code || response.status}`);
    return body;
  }

  async posts(pageId: string, limit = 20, after?: string) {
    const result = await this.graph<{ data?: unknown[]; paging?: { cursors?: { after?: string }; next?: string } }>(`${pageId}/posts`, "GET", {
      fields: "id,message,created_time,full_picture,permalink_url,is_published",
      limit: String(Math.min(Math.max(limit, 1), 50)),
      ...(after ? { after } : {}),
    });
    return { posts: result.data || [], nextCursor: result.paging?.next ? result.paging.cursors?.after || null : null };
  }

  async scheduledPosts(pageId: string, limit = 20, after?: string) {
    const result = await this.graph<{ data?: unknown[]; paging?: { cursors?: { after?: string }; next?: string } }>(`${pageId}/scheduled_posts`, "GET", {
      fields: "id,message,created_time,scheduled_publish_time,full_picture,permalink_url,is_published",
      limit: String(Math.min(Math.max(limit, 1), 50)),
      ...(after ? { after } : {}),
    });
    return { posts: result.data || [], nextCursor: result.paging?.next ? result.paging.cursors?.after || null : null };
  }

  async comments(postId: string, limit = 50, after?: string) {
    const result = await this.graph<{ data?: MetaComment[]; paging?: { cursors?: { after?: string }; next?: string } }>(`${postId}/comments`, "GET", {
      fields: "id,message,created_time,from{id,name},can_remove,comments.limit(20){id,message,created_time,from{id,name},can_remove}",
      order: "reverse_chronological",
      limit: String(Math.min(Math.max(limit, 1), 100)),
      ...(after ? { after } : {}),
    });
    return { comments: result.data || [], nextCursor: result.paging?.next ? result.paging.cursors?.after || null : null };
  }

  replyToComment(commentId: string, message: string) {
    return this.graph<{ id: string }>(`${commentId}/comments`, "POST", { message });
  }

  deleteObject(objectId: string) {
    return this.graph<{ success: boolean }>(objectId, "DELETE");
  }

  publishText(pageId: string, message: string) {
    return this.graph<{ id: string }>(`${pageId}/feed`, "POST", { message, published: "true" });
  }

  publishPhoto(pageId: string, message: string, imageUrl: string) {
    return this.graph<{ id?: string; post_id?: string }>(`${pageId}/photos`, "POST", { url: imageUrl, caption: message, published: "true" });
  }

  scheduleText(pageId: string, message: string, scheduledAt: number) {
    return this.graph<{ id: string }>(`${pageId}/feed`, "POST", {
      message,
      published: "false",
      scheduled_publish_time: String(scheduledAt),
    });
  }

  schedulePhoto(pageId: string, message: string, imageUrl: string, scheduledAt: number) {
    return this.graph<{ id?: string; post_id?: string }>(`${pageId}/photos`, "POST", {
      url: imageUrl,
      caption: message,
      published: "false",
      scheduled_publish_time: String(scheduledAt),
    });
  }

  async publishPhotoData(
    pageId: string,
    message: string,
    bytes: Uint8Array,
    mediaType: string,
  ) {
    const safePath = `${pageId}/photos`.split("/").map(encodeURIComponent).join("/");
    const url = new URL(`https://graph.facebook.com/${this.version}/${safePath}`);
    const form = new FormData();
    form.set("caption", message);
    form.set("published", "true");
    form.set(
      "source",
      new Blob([bytes], { type: mediaType }),
      mediaType === "image/png" ? "generated.png" : "generated.jpg",
    );
    const response = await this.request(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await response.json()) as {
      id?: string;
      post_id?: string;
    } & GraphError;
    if (!response.ok || body.error)
      throw new Error(`META_GRAPH_ERROR_${body.error?.code || response.status}`);
    return body;
  }
}
