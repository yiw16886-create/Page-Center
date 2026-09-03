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

## 本地启动

1. 复制 `.env.example` 为 `.env` 并填写配置。
2. 安装依赖：`npm install`
3. 执行迁移：`npm run db:migrate`
4. 启动：`npm run dev`

首次启动会在数据库不存在 `ADMIN_EMAIL` 时创建管理员。后续修改 `ADMIN_PASSWORD` 不会自动覆盖已有密码。

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
