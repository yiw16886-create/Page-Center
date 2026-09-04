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
- 私人 MCP 插件：列出主页、读取帖子、确认后发布帖子
- 独立、可撤销的插件访问 Token（数据库只保存 SHA-256 哈希）

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

## 数据迁移原则

不要复制原系统的整库。只迁移已授权公共主页的标识和展示信息；旧 Token 应通过新应用重新 OAuth 获取，避免跨系统复用密钥或明文 Token。

## 私人插件

插件入口为 `https://page-center-tau.vercel.app/api/mcp`，采用 Streamable HTTP。插件只服务当前单管理员账号，不包含组织、租户或 SaaS 绑定。

1. 登录 Page Center，在“私人插件访问”中生成连接 Token。
2. 立即复制 Token；页面关闭后不会再次显示明文。
3. 安装仓库内 `plugins/meta-page-center-private` 插件，并把 Token 保存在运行 Codex 的环境变量 `PAGE_CENTER_PLUGIN_TOKEN` 中。
4. 需要断开时，在 Page Center 撤销该 Token，插件会立即失效。

插件提供三个工具：

- `list_pages`：列出 OAuth 已授权主页及能力。
- `get_page_posts`：读取指定主页的最近帖子。
- `publish_page_post`：发布文本或公开 HTTPS 图片；必须提供精确确认字符串 `PUBLISH:<pageId>` 和唯一幂等键。

此配置面向私人安装，不用于公开插件市场。不要把 `PAGE_CENTER_PLUGIN_TOKEN` 写入仓库、聊天内容或 Vercel 环境变量。
