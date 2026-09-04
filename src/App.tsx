import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  FileText,
  KeyRound,
  LogOut,
  Plug,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Unplug,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  ApiError,
  type MetaStatus,
  type Page,
  type PluginToken,
  type Post,
  type User,
} from "./api";

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark">
          <FileText />
        </div>
        <p className="eyebrow">META PAGE CENTER</p>
        <h1>公共主页管理与发布</h1>
        <p className="muted">登录后连接 Meta，仅管理你授权的公共主页。</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              onLogin(await api.login(email, password));
            } catch (error) {
              toast.error(
                error instanceof ApiError && error.status === 401
                  ? "账号或密码错误"
                  : "服务尚未初始化，请检查数据库和环境变量",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            邮箱
            <input
              autoComplete="username"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            密码
            <input
              autoComplete="current-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="primary full" disabled={busy}>
            {busy ? "登录中…" : "登录"}
          </button>
        </form>
        <p className="security-note">
          <ShieldCheck size={16} /> 登录会话保存在 HttpOnly Cookie 中
        </p>
      </section>
    </main>
  );
}

function Badge({ ok, children }: { ok: boolean; children: string }) {
  return (
    <span className={ok ? "badge ok" : "badge"}>
      {ok && <Check size={12} />}
      {children}
    </span>
  );
}
function Empty({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="empty">
      <Icon />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function PluginAccess() {
  const [tokens, setTokens] = useState<PluginToken[]>([]);
  const [revealedToken, setRevealedToken] = useState("");
  const [busy, setBusy] = useState(false);
  const mcpAddress = `${location.origin}/api/mcp`;

  useEffect(() => {
    void api
      .pluginTokens()
      .then(setTokens)
      .catch(() => toast.error("读取插件 Token 失败"));
  }, []);

  async function createToken() {
    setBusy(true);
    try {
      const created = await api.createPluginToken("私人 Page Center 插件");
      setRevealedToken(created.token);
      setTokens((current) => [created.record, ...current]);
      toast.success("连接 Token 已生成，请立即复制保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成 Token 失败");
    } finally {
      setBusy(false);
    }
  }

  async function revokeToken(token: PluginToken) {
    if (!confirm(`撤销“${token.name}”？撤销后插件将立即断开。`)) return;
    setBusy(true);
    try {
      await api.revokePluginToken(token.id);
      setTokens((current) =>
        current.map((item) =>
          item.id === token.id ? { ...item, status: "REVOKED" } : item,
        ),
      );
      if (revealedToken.startsWith(token.tokenPrefix)) setRevealedToken("");
      toast.success("Token 已撤销");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "撤销 Token 失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel plugin-access">
      <div className="panel-title">
        <div>
          <h2>私人插件访问</h2>
          <p>MCP 地址：{mcpAddress}</p>
        </div>
        <Plug />
      </div>
      <div className="plugin-actions">
        <button
          className="primary"
          disabled={busy}
          onClick={() => void createToken()}
        >
          生成连接 Token
        </button>
        <span>Token 仅显示一次，数据库只保存 SHA-256 哈希。</span>
      </div>
      {revealedToken && (
        <div className="token-reveal">
          <code>{revealedToken}</code>
          <button
            className="icon-button"
            title="复制 Token"
            aria-label="复制 Token"
            onClick={() =>
              void navigator.clipboard
                .writeText(revealedToken)
                .then(() => toast.success("Token 已复制"))
            }
          >
            <Copy size={16} />
          </button>
        </div>
      )}
      <div className="token-list">
        {tokens
          .filter((token) => token.status === "ACTIVE")
          .map((token) => (
            <div key={token.id}>
              <span>
                <strong>{token.name}</strong>
                <small>
                  {token.tokenPrefix}… ·{" "}
                  {token.lastUsedAt
                    ? `最近使用 ${new Date(token.lastUsedAt).toLocaleString()}`
                    : "尚未使用"}
                </small>
              </span>
              <button
                className="icon-button"
                title="撤销 Token"
                aria-label={`撤销 ${token.name}`}
                disabled={busy}
                onClick={() => void revokeToken(token)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
      </div>
    </section>
  );
}

function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [meta, setMeta] = useState<MetaStatus | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState("");
  const selected = useMemo(
    () => meta?.pages.find((page) => page.pageId === selectedId) || null,
    [meta, selectedId],
  );
  const reloadMeta = useCallback(async () => {
    const value = await api.metaStatus();
    setMeta(value);
    setSelectedId((current) =>
      value.pages.some((p) => p.pageId === current)
        ? current
        : value.pages[0]?.pageId || "",
    );
  }, []);
  const reloadPosts = useCallback(async () => {
    if (!selectedId) {
      setPosts([]);
      return;
    }
    try {
      setPosts((await api.posts(selectedId)).posts);
    } catch {
      setPosts([]);
      toast.error("读取帖子失败，请检查主页读取权限");
    }
  }, [selectedId]);
  useEffect(() => {
    void reloadMeta();
  }, [reloadMeta]);
  useEffect(() => {
    void reloadPosts();
  }, [reloadPosts]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin !== location.origin) return;
      if (event.data?.type === "META_CONNECTED") {
        toast.success(`授权完成，已同步 ${event.data.pageCount} 个主页`);
        void reloadMeta();
      } else if (event.data?.type === "META_ERROR")
        toast.error("Meta 授权未完成");
    };
    addEventListener("message", listener);
    return () => removeEventListener("message", listener);
  }, [reloadMeta]);

  async function act(name: string, action: () => Promise<void>) {
    setBusy(name);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="app-shell">
      <header>
        <div className="brand">
          <div className="brand-mark small">
            <FileText />
          </div>
          <div>
            <strong>Meta 公共主页中心</strong>
            <span>独立管理与发布</span>
          </div>
        </div>
        <div className="user">
          <span>{user.email}</span>
          <button
            className="icon-button"
            title="退出"
            onClick={() =>
              void act("logout", async () => {
                await api.logout();
                onLogout();
              })
            }
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <main className="workspace">
        <aside>
          <div className="aside-title">
            <span>已授权主页</span>
            <strong>{meta?.pages.length || 0}</strong>
          </div>
          {meta?.pages.map((page) => (
            <button
              key={page.pageId}
              className={`page-item ${selectedId === page.pageId ? "active" : ""}`}
              onClick={() => setSelectedId(page.pageId)}
            >
              <span className="avatar">{page.pageName.slice(0, 1)}</span>
              <span>
                <strong>{page.pageName}</strong>
                <small>{page.category || "公共主页"}</small>
              </span>
            </button>
          ))}
          {meta?.connected && !meta.pages.length && (
            <Empty
              icon={FileText}
              title="没有可用主页"
              detail="检查主页角色和授权权限"
            />
          )}
        </aside>
        <section className="content">
          <div className="hero">
            <div>
              <p className="eyebrow">STANDALONE MODULE</p>
              <h1>{selected?.pageName || "公共主页工作台"}</h1>
              <p>
                {selected
                  ? `Page ID ${selected.pageId}`
                  : "连接 Meta 后管理主页内容并发布帖子。"}
              </p>
            </div>
            <div className="hero-actions">
              <button
                className="primary"
                disabled={!!busy}
                onClick={() =>
                  void act("connect", async () => {
                    const { url } = await api.connect();
                    window.open(
                      url,
                      "meta-page-oauth",
                      "popup,width=640,height=760",
                    );
                  })
                }
              >
                <ExternalLink size={16} />
                {meta?.connected ? "重新授权" : "连接 Meta"}
              </button>
              {meta?.connected && (
                <>
                  <button
                    disabled={!!busy}
                    onClick={() =>
                      void act("verify", async () => {
                        await api.verify();
                        await reloadMeta();
                        toast.success("授权已校验");
                      })
                    }
                  >
                    <RefreshCw size={16} />
                    校验
                  </button>
                  <button
                    className="danger"
                    disabled={!!busy}
                    onClick={() => {
                      if (confirm("断开当前账号的 Meta 授权？"))
                        void act("disconnect", async () => {
                          await api.disconnect();
                          await reloadMeta();
                        });
                    }}
                  >
                    <Unplug size={16} />
                    断开
                  </button>
                </>
              )}
            </div>
          </div>
          {selected && (
            <div className="permissions">
              <Badge ok={selected.canRead}>读取帖子</Badge>
              <Badge ok={selected.canPublish}>发布帖子</Badge>
              <Badge ok={selected.canManageComments}>管理评论</Badge>
            </div>
          )}
          <div className="grid">
            <section className="panel composer">
              <div className="panel-title">
                <div>
                  <h2>发布帖子</h2>
                  <p>文本或公开 HTTPS 图片地址</p>
                </div>
                <Send />
              </div>
              <textarea
                placeholder="写下要发布到公共主页的内容…"
                value={message}
                maxLength={63206}
                onChange={(e) => setMessage(e.target.value)}
              />
              <input
                type="url"
                placeholder="可选：图片 HTTPS URL"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
              />
              <div className="composer-foot">
                <span>{message.length.toLocaleString()} / 63,206</span>
                <button
                  className="primary"
                  disabled={!selected?.canPublish || !message.trim() || !!busy}
                  onClick={() =>
                    void act("publish", async () => {
                      if (
                        !selected ||
                        !confirm(`确认发布到“${selected.pageName}”？`)
                      )
                        return;
                      const result = await api.publish(
                        selected.pageId,
                        message,
                        imageUrl,
                      );
                      toast.success(`发布成功：${result.postId}`);
                      setMessage("");
                      setImageUrl("");
                      await reloadPosts();
                    })
                  }
                >
                  {busy === "publish" ? "发布中…" : "确认发布"}
                </button>
              </div>
            </section>
            <section className="panel connection">
              <div className="panel-title">
                <div>
                  <h2>授权状态</h2>
                  <p>按当前登录用户隔离</p>
                </div>
                <KeyRound />
              </div>
              <dl>
                <div>
                  <dt>Meta 账号</dt>
                  <dd>{meta?.facebookUserName || "未连接"}</dd>
                </div>
                <div>
                  <dt>最近校验</dt>
                  <dd>
                    {meta?.lastVerifiedAt
                      ? new Date(meta.lastVerifiedAt).toLocaleString()
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Token 存储</dt>
                  <dd>服务端加密</dd>
                </div>
              </dl>
            </section>
          </div>
          <PluginAccess />
          <section className="panel posts">
            <div className="panel-title">
              <div>
                <h2>最近帖子</h2>
                <p>
                  {selected
                    ? `来自 ${selected.pageName}`
                    : "选择公共主页后查看"}
                </p>
              </div>
              <button
                className="icon-button"
                disabled={!selectedId || !!busy}
                onClick={() => void act("posts", reloadPosts)}
              >
                <RefreshCw size={18} />
              </button>
            </div>
            {posts.length ? (
              <div className="post-list">
                {posts.map((post) => (
                  <article key={post.id}>
                    {post.full_picture && (
                      <img src={post.full_picture} alt="帖子图片" />
                    )}
                    <div>
                      <p>{post.message || "（图片帖子）"}</p>
                      <span>
                        {post.created_time
                          ? new Date(post.created_time).toLocaleString()
                          : post.id}
                      </span>
                      {post.permalink_url && (
                        <a
                          href={post.permalink_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          在 Facebook 查看 <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                icon={FileText}
                title="暂无帖子"
                detail={
                  selected
                    ? "授权后刷新，或先发布第一条帖子"
                    : "请先连接并选择公共主页"
                }
              />
            )}
          </section>
        </section>
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);
  if (user === undefined)
    return <main className="loading">正在加载公共主页中心…</main>;
  return user ? (
    <Dashboard user={user} onLogout={() => setUser(null)} />
  ) : (
    <Login onLogin={setUser} />
  );
}
