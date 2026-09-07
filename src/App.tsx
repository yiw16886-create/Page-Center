import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  FileText,
  ImagePlus,
  KeyRound,
  LogOut,
  MessageSquareText,
  Plug,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unplug,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  type AiSettings,
  ApiError,
  type MetaStatus,
  type PluginToken,
  type Post,
  type ProductDraft,
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
      <p className="plugin-oauth-note">
        ChatGPT 网页版使用专用 OAuth 2.1 登录授权，无需复制 Token。 下方 Token
        仅用于本地 Codex 兼容连接。
      </p>
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

function ProductLinkAssistant({
  onText,
  onImage,
}: {
  onText: (message: string) => void;
  onImage: (imageUrl: string, imageDataUrl: string) => void;
}) {
  const [productUrl, setProductUrl] = useState("");
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [selectedImage, setSelectedImage] = useState("");
  const [previewImage, setPreviewImage] = useState("");
  const [language, setLanguage] = useState("zh-CN");
  const [tone, setTone] = useState("自然、有吸引力");
  const [busy, setBusy] = useState("");

  return (
    <div className="product-assistant">
      <div className="assistant-heading">
        <span><Sparkles size={16} /> 商品链接智能草稿</span>
        <small>临时解析，不写入数据库</small>
      </div>
      <form
        className="product-link-form"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy("parse");
          setDraft(null);
          void api
            .parseProduct(productUrl)
            .then((value) => {
              setDraft(value);
              setSelectedImage(value.imageUrls[0] || "");
              setPreviewImage(value.imageUrls[0] || "");
              toast.success("商品信息解析完成");
            })
            .catch((error) =>
              toast.error(error instanceof Error ? error.message : "商品页解析失败"),
            )
            .finally(() => setBusy(""));
        }}
      >
        <input
          required
          type="url"
          value={productUrl}
          onChange={(event) => setProductUrl(event.target.value)}
          placeholder="粘贴公开 HTTPS 商品链接"
        />
        <button disabled={!!busy}>
          {busy === "parse" ? "解析中…" : "1. 解析商品"}
        </button>
      </form>
      {draft && (
        <div className="product-preview">
          {previewImage && (
            <img src={previewImage} alt={draft.title} referrerPolicy="no-referrer" />
          )}
          <div className="product-fields">
            <dl>
              <div><dt>商品名</dt><dd>{draft.title}</dd></div>
              <div><dt>价格</dt><dd>{draft.price || "页面未提供"}</dd></div>
              <div><dt>描述</dt><dd>{draft.description || "页面未提供"}</dd></div>
            </dl>
            {draft.imageUrls.length > 0 && (
              <label>
                发布图片
                <select value={selectedImage} onChange={(event) => {
                  setSelectedImage(event.target.value);
                  setPreviewImage(event.target.value);
                }}>
                  {draft.imageUrls.map((url, index) => (
                    <option value={url} key={url}>原图 {index + 1}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="generation-options">
              <label>
                语言
                <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                  <option value="zh-CN">中文</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label>
                文案风格
                <input value={tone} maxLength={80} onChange={(event) => setTone(event.target.value)} />
              </label>
            </div>
            <div className="ai-action-buttons">
              <button
                type="button"
                disabled={!!busy || !selectedImage}
                onClick={() => {
                  setPreviewImage(selectedImage);
                  onImage(selectedImage, "");
                  toast.success("已选择商品原图");
                }}
              >
                <Check size={15} /> 使用原图
              </button>
              <button
                type="button"
                className="primary"
                disabled={!!busy}
                onClick={() => {
                  setBusy("copy");
                  void api.generateProductCopy(draft, { language, tone })
                    .then(({ message }) => {
                      onText(message);
                      toast.success("AI 文案已生成，可继续人工修改");
                    })
                    .catch((error) => toast.error(
                      error instanceof Error && error.message === "AI_NOT_CONFIGURED"
                        ? "AI 生成服务尚未配置"
                        : error instanceof Error ? error.message : "AI 文案生成失败",
                    ))
                    .finally(() => setBusy(""));
                }}
              >
                <Sparkles size={15} /> {busy === "copy" ? "生成中…" : "AI 文案"}
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => {
                  setBusy("image");
                  void api.generateProductImage(draft)
                    .then(({ imageDataUrl }) => {
                      setPreviewImage(imageDataUrl);
                      onImage("", imageDataUrl);
                      toast.success("AI 配图已生成，仅保留在当前草稿");
                    })
                    .catch((error) => toast.error(
                      error instanceof Error ? error.message : "AI 配图生成失败",
                    ))
                    .finally(() => setBusy(""));
                }}
              >
                <ImagePlus size={15} /> {busy === "image" ? "生成中…" : "AI 配图"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [meta, setMeta] = useState<MetaStatus | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [busy, setBusy] = useState("");
  const [activeTab, setActiveTab] = useState<
    "posts" | "publish" | "comments" | "settings"
  >("publish");
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
    void api.aiSettings().then(setAiSettings).catch(() =>
      toast.error("AI 模型设置读取失败"),
    );
  }, []);
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
          <div className="aside-main">
            <div className="aside-title">
              <span>已授权主页</span>
              <strong>{meta?.pages.length || 0}</strong>
            </div>
            {meta?.pages.map((page) => (
              <button
                key={page.pageId}
                className={`page-item ${selectedId === page.pageId ? "active" : ""}`}
                onClick={() => {
                  setSelectedId(page.pageId);
                  if (activeTab === "settings") setActiveTab("publish");
                }}
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
          </div>
          <nav className="extension-nav" aria-label="扩展模块">
            <button disabled title="即将开放">
              <CalendarClock size={16} /> 自动化规则 <span>即将开放</span>
            </button>
            <button
              className={activeTab === "settings" ? "active" : ""}
              onClick={() => setActiveTab("settings")}
            >
              <Settings size={16} /> 设置
            </button>
          </nav>
        </aside>
        <section className="content">
          <div className="page-toolbar">
            <div className="page-identity">
              <span className="avatar toolbar-avatar">
                {activeTab === "settings"
                  ? "设"
                  : (selected?.pageName || "P").slice(0, 1)}
              </span>
              <div>
                <div className="identity-line">
                  <h1>
                    {activeTab === "settings"
                      ? "全局设置"
                      : selected?.pageName || "公共主页工作台"}
                  </h1>
                  {activeTab !== "settings" && (
                    <Badge ok={!!selected?.canRead}>
                      {selected?.canRead ? "运行正常" : "等待授权"}
                    </Badge>
                  )}
                </div>
                <p>
                  {activeTab === "settings"
                    ? "Meta OAuth 与私人插件统一管理"
                    : selected
                      ? `ID ${selected.pageId}`
                      : "请选择公共主页"}
                </p>
              </div>
            </div>
            {activeTab !== "settings" && selected && (
              <div className="toolbar-capabilities">
                <Badge ok={selected.canRead}>读取</Badge>
                <Badge ok={selected.canPublish}>发布</Badge>
                <Badge ok={selected.canManageComments}>评论</Badge>
              </div>
            )}
          </div>

          {activeTab !== "settings" && <div className="workspace-tabs" role="tablist" aria-label="主页工作区">
            <button
              role="tab"
              aria-selected={activeTab === "posts"}
              className={activeTab === "posts" ? "active" : ""}
              onClick={() => setActiveTab("posts")}
            >
              <FileText size={15} /> 读取帖子
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "publish"}
              className={activeTab === "publish" ? "active" : ""}
              onClick={() => setActiveTab("publish")}
            >
              <Send size={15} /> 发布帖子
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "comments"}
              className={activeTab === "comments" ? "active" : ""}
              onClick={() => setActiveTab("comments")}
            >
              <MessageSquareText size={15} /> 管理评论
              <span className="beta-tag">预留</span>
            </button>
          </div>}

          <div className="bento-grid">
            {activeTab === "settings" && (
              <>
                <section className="panel oauth-settings widget-primary">
                  <div className="panel-title">
                    <div>
                      <h2>Meta OAuth 全局连接</h2>
                      <p>一次授权同步并控制当前账号可管理的全部公共主页</p>
                    </div>
                    <KeyRound />
                  </div>
                  <div className="connection-summary">
                    <span className={`connection-pill ${meta?.connected ? "online" : ""}`}>
                      <span className="status-dot" />
                      {meta?.connected ? "已连接" : "未连接"}
                    </span>
                    <div>
                      <strong>{meta?.facebookUserName || "尚未连接 Meta 账号"}</strong>
                      <span>
                        {meta?.lastVerifiedAt
                          ? `最近校验 ${new Date(meta.lastVerifiedAt).toLocaleString()}`
                          : "完成授权后会自动同步公共主页"}
                      </span>
                    </div>
                  </div>
                  <dl className="oauth-facts">
                    <div><dt>授权范围</dt><dd>账号下全部已授权公共主页</dd></div>
                    <div><dt>已同步主页</dt><dd>{meta?.pages.length || 0} 个</dd></div>
                    <div><dt>Token 存储</dt><dd>服务端加密</dd></div>
                  </dl>
                  <div className="settings-actions">
                    <button
                      className="primary"
                      disabled={!!busy}
                      onClick={() =>
                        void act("connect", async () => {
                          const { url } = await api.connect();
                          window.open(url, "meta-page-oauth", "popup,width=640,height=760");
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
                          <RefreshCw size={16} /> 校验授权
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
                          <Unplug size={16} /> 断开
                        </button>
                      </>
                    )}
                  </div>
                </section>
                <div className="widget-secondary">
                  <PluginAccess />
                </div>
                {aiSettings && (
                  <section className="panel ai-settings widget-primary">
                    <div className="panel-title">
                      <div>
                        <h2>AI 模型设置</h2>
                        <p>全局默认模型；只有点击 AI 按钮时才会调用并计费</p>
                      </div>
                      <Sparkles />
                    </div>
                    <div className="ai-model-grid">
                      <label>
                        文案模型
                        <select
                          value={aiSettings.aiTextModel}
                          onChange={(event) => setAiSettings({
                            ...aiSettings,
                            aiTextModel: event.target.value,
                          })}
                        >
                          {aiSettings.textModels.map((model) => (
                            <option key={model.id} value={model.id}>{model.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        图片模型
                        <select
                          value={aiSettings.aiImageModel}
                          onChange={(event) => setAiSettings({
                            ...aiSettings,
                            aiImageModel: event.target.value,
                          })}
                        >
                          {aiSettings.imageModels.map((model) => (
                            <option key={model.id} value={model.id}>{model.label}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="settings-actions">
                      <button
                        className="primary"
                        disabled={!!busy}
                        onClick={() => void act("ai-settings", async () => {
                          const saved = await api.saveAiSettings(
                            aiSettings.aiTextModel,
                            aiSettings.aiImageModel,
                          );
                          setAiSettings(saved);
                          toast.success("AI 模型设置已保存");
                        })}
                      >
                        <Check size={16} /> 保存模型设置
                      </button>
                    </div>
                  </section>
                )}
              </>
            )}

            {activeTab === "publish" && (
              <section className="panel composer widget-primary">
                <div className="panel-title">
                  <div>
                    <h2>发布帖子</h2>
                    <p>文本或公开 HTTPS 图片地址</p>
                  </div>
                  <Send />
                </div>
                <ProductLinkAssistant
                  onText={setMessage}
                  onImage={(generatedImageUrl, generatedImageData) => {
                    setImageUrl(generatedImageUrl);
                    setImageDataUrl(generatedImageData);
                  }}
                />
                <textarea
                  placeholder="写下要发布到公共主页的内容…"
                  value={message}
                  maxLength={63206}
                  onChange={(e) => setMessage(e.target.value)}
                />
                {imageDataUrl ? (
                  <div className="generated-image-chip">
                    <img src={imageDataUrl} alt="AI 生成配图预览" />
                    <span>AI 生成配图 · 仅保留在当前草稿</span>
                    <button type="button" onClick={() => setImageDataUrl("")}>移除</button>
                  </div>
                ) : (
                  <input
                    type="url"
                    placeholder="可选：图片 HTTPS URL"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                  />
                )}
                <div className="composer-foot">
                  <span>{message.length.toLocaleString()} / 63,206</span>
                  <button
                    className="primary"
                    disabled={
                      !selected?.canPublish || !message.trim() || !!busy
                    }
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
                          imageDataUrl,
                        );
                        toast.success(`发布成功：${result.postId}`);
                        setMessage("");
                        setImageUrl("");
                        setImageDataUrl("");
                        await reloadPosts();
                      })
                    }
                  >
                    {busy === "publish" ? "发布中…" : "确认发布"}
                  </button>
                </div>
              </section>
            )}

            {activeTab === "posts" && (
              <section className="panel posts widget-primary">
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
                    aria-label="刷新帖子"
                    disabled={!selectedId || !!busy}
                    onClick={() => void act("posts", reloadPosts)}
                  >
                    <RefreshCw size={16} />
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
            )}

            {activeTab === "comments" && (
              <section className="panel widget-primary placeholder-panel">
                <Empty
                  icon={MessageSquareText}
                  title="评论管理模块已预留"
                  detail="后续可接入读取、回复、隐藏和删除评论工具"
                />
              </section>
            )}

            {activeTab !== "settings" && <section className="panel widget-secondary overview-widget">
              <div className="panel-title">
                <div>
                  <h2>主页能力</h2>
                  <p>当前 OAuth 权限快照</p>
                </div>
                <KeyRound />
              </div>
              <div className="capability-list">
                <Badge ok={!!selected?.canRead}>读取帖子</Badge>
                <Badge ok={!!selected?.canPublish}>发布帖子</Badge>
                <Badge ok={!!selected?.canManageComments}>管理评论</Badge>
              </div>
              <div className="widget-slot">
                <CalendarClock size={18} />
                <div>
                  <strong>定时任务</strong>
                  <span>扩展组件预留位</span>
                </div>
              </div>
              <div className="widget-slot">
                <BarChart3 size={18} />
                <div>
                  <strong>数据概览</strong>
                  <span>扩展组件预留位</span>
                </div>
              </div>
            </section>}
          </div>
        </section>
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const oauthReturn = new URLSearchParams(location.search).get("oauth_return");
  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);
  useEffect(() => {
    if (
      user &&
      oauthReturn?.startsWith("/oauth/authorize?") &&
      !oauthReturn.startsWith("//")
    ) {
      location.replace(oauthReturn);
    }
  }, [oauthReturn, user]);
  if (user === undefined)
    return <main className="loading">正在加载公共主页中心…</main>;
  return user ? (
    <Dashboard user={user} onLogout={() => setUser(null)} />
  ) : (
    <Login onLogin={setUser} />
  );
}
