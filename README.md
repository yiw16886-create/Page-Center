# Meta Page Center

独立的 Meta 公共主页管理与发布应用。它不依赖原广告管理系统，也不包含 SaaS 组织或多租户绑定。

## 功能

- 网站账号登录（HttpOnly Cookie）
- Meta OAuth 与 state 防重放
- 当前登录用户级授权隔离
- 公共主页同步与权限展示
- 最近帖子读取
- 文本/图片 URL 发帖
- 明确发布确认、幂等键与审计日志
- AES-256-GCM 加密保存用户 Token 和 Page Token
- 私人 MCP 插件：OAuth 2.1 登录、列出主页、读取帖子、确认后发布帖子
- 独立、可撤销的插件访问 Token（数据库只保存 SHA-256 哈希）
- 商品链接临时解析、AI Facebook 文案生成与人工确认发布

## 本地启动

1. 复制 `.env.example` 为 `.env` 并填写配置。
2. 安装依赖：`npm install`
3. 执行迁移：`npm run db:migrate`
4. 启动：`npm run dev`

首次启动会在数据库不存在 `ADMIN_EMAIL` 时创建管理员。单管理员模式下，后续修改 Vercel 的 `ADMIN_PASSWORD` 会在下一次服务初始化时安全更新数据库密码哈希，因此当前环境变量中的密码是登录凭据来源。

`JWT_SECRET` 是可选覆盖项；未配置或不足 32 个字符时，应用会从 32 字节的 `TOKEN_ENCRYPTION_KEY` 派生独立的会话签名密钥。轮换实际使用的密钥会使现有登录会话失效。

## Meta 配置

Meta App 的 Valid OAuth Redirect URI 必须与 `META_REDIRECT_URI` 完全一致。生产环境需要申请并获批：

- `pages_show_list`
- `pages_read_engagement`
- `pages_read_user_content`
- `pages_manage_posts`
- `pages_manage_engagement`
- `pages_manage_metadata`

应用仍处于 Development 模式时，只有 App 角色内的账号可以完成授权。

## 商品链接智能发布

在“发布帖子”中粘贴一个公开 HTTPS 商品链接。服务端优先解析 Open Graph 和
Product JSON-LD，提取商品名、描述、价格及最多 8 个原图 URL。页面 HTML、图片、
商品目录和解析结果均不写入数据库，响应完成后即释放。

用户可在“设置 → AI 连接与模型”保存自己的 Vercel AI Gateway Token；Token 使用
AES-256-GCM 加密并仅在服务端解密，浏览器只能看到是否已连接。账号 Token 的优先级
高于 Vercel 自动注入的 OIDC Token 和部署环境中的 `AI_GATEWAY_API_KEY`。本地环境
也可继续使用 `OPENAI_API_KEY` 直接调用 OpenAI 作为兼容后备。生成请求关闭存储并
禁止将提示用于训练，文案会回填到编辑器，用户仍需选择公共主页并明确确认后才调用
Graph API 发布。

AI 是发布区内的可选动作：解析商品后可以分别选择“使用原图”“AI 文案”或
“AI 配图”，未点击时不会调用相应模型。“设置 → AI 连接与模型”允许按 Gateway
的 `provider/model` 格式自由填写账号级文案模型和图片模型。AI 配图只在当前浏览器草稿中
短暂存在，确认后以二进制直接上传 Meta；数据库只保存两个模型 ID，不保存草稿、
图片、Base64 或商品内容。

解析器限制 HTTPS、响应大小、超时和重定向次数，并在每次请求前检查 DNS/IP，
阻止访问本机、内网和云元数据地址。商品页面内容按不可信输入处理。
当公开商品源站对 Vercel 返回 403、429 或读取超时时，系统会把用户输入的公开 URL
发送给 Jina Reader 做兼容读取；不会发送 Cookie、登录信息、Meta Token 或其他
系统数据。回退响应同样受 2MB 上限约束，解析结果仍不写入数据库。

## 数据迁移原则

不要复制原系统的整库。只迁移已授权公共主页的标识和展示信息；旧 Token 应通过新应用重新 OAuth 获取，避免跨系统复用密钥或明文 Token。

## 私人插件

插件入口为 `https://page-center-tau.vercel.app/api/mcp`，采用 Streamable HTTP。插件只服务当前单管理员账号，不包含组织、租户或 SaaS 绑定。

ChatGPT 网页版使用独立于 Meta OAuth 的插件 OAuth 2.1：受保护资源发现、授权服务器发现、授权码 + PKCE(S256)、`resource` 绑定、短期访问 Token、刷新 Token 轮换和撤销。OAuth Token 只保存 SHA-256 哈希，不需要新增 Vercel 环境变量。

网页版连接时只需填写 MCP 地址；ChatGPT 会自动发现 OAuth 配置并打开 Page Center 登录与授权页面。本地旧版 Codex 仍可在“私人插件访问”中生成兼容 Token。

插件提供三个工具：

- `list_pages`：列出 OAuth 已授权主页及能力。
- `get_page_posts`：读取指定主页的最近帖子。
- `publish_page_post`：发布文本或公开 HTTPS 图片；必须提供精确确认字符串 `PUBLISH:<pageId>` 和唯一幂等键。

此配置面向私人安装，不用于公开插件市场。不要把任何兼容 Token 写入仓库或聊天内容。
