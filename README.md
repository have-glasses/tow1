# Tow1

一个与同级论坛项目完全隔离的单用户私人网盘。它使用独立登录、独立数据表，文件直接上传到腾讯云 COS。

## 本地运行

1. 复制 `.env.example` 为 `.env.local` 并填写配置。
2. 安装依赖：`npm install`
3. 启动：`npm run dev`

默认账号为 `owner`。必须配置 `DRIVE_PASSWORD` 或 `DRIVE_PASSWORD_HASH`，并设置 `DRIVE_SESSION_SECRET`。

生成密码哈希：

```powershell
node -e "const c=require('node:crypto');const s=c.randomBytes(16).toString('hex');console.log(['scrypt',s,c.scryptSync(process.argv[1],s,32).toString('hex')].join(String.fromCharCode(36)))" "你的密码"
```

## 分享文件

登录后的主人可以对文件或文件夹创建分享链接：

- 分享链接格式：`https://tow1.zhuoline.cn/s/分享口令`
- 访客无需登录，但必须输入你设置的分享密码。
- 每条分享都需要设置到期时间，最长不超过一年。
- 分享可以随时撤销；过期、撤销或回收站内的文件不会继续开放访问。
- 分享文件夹时，访客可以浏览文件夹内容并逐个下载其中的文件。

密码输错会被限流：同一访问来源连续输错 5 次后，会短暂锁定 15 分钟。

## 预览、容量和回收站

- 图片、PDF、文本、音频、视频文件可以点击卡片预览。
- 其它暂不支持预览的文件仍可下载。
- `NEXT_PUBLIC_STORAGE_QUOTA_GB` 用来设置网盘显示的总容量，例如 `50` 表示 50GB。
- 回收站默认是软删除：移入回收站后仍保留记录和 COS 文件。
- 在回收站点击“永久删除”会删除数据库记录，并删除对应 COS 对象；文件夹会连同子内容一起删除。

注意：永久删除不可撤销。若 COS 密钥或权限配置错误，永久删除真实文件时会失败并保留数据库记录，避免出现“页面没了但 COS 文件还在”的不一致状态。

## Vercel 上线检查

Vercel 部署后，必须在项目的 Environment Variables 里配置与 `.env.local` 对应的变量，并重新部署 Production：

- `DRIVE_USERNAME`
- `DRIVE_PASSWORD` 或 `DRIVE_PASSWORD_HASH`
- `DRIVE_SESSION_SECRET`
- `DRIVE_TURSO_DATABASE_URL`
- `DRIVE_TURSO_AUTH_TOKEN`
- `DRIVE_COS_SECRET_ID`
- `DRIVE_COS_SECRET_KEY`
- `DRIVE_COS_BUCKET`
- `DRIVE_COS_REGION`
- `DRIVE_COS_PREFIX`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_MAX_UPLOAD_MB`
- `NEXT_PUBLIC_STORAGE_QUOTA_GB`
- `DRIVE_MAX_ZIP_MB`（分享文件夹打包下载的容量上限，默认 100MB）

`NEXT_PUBLIC_APP_URL` 上线后应设置为你的正式访问地址，例如：

```env
NEXT_PUBLIC_APP_URL=https://tow1.zhuoline.cn
```

如果暂时还没绑定正式域名，就先填 Vercel 给你的生产域名。

## COS 跨域配置

浏览器会直传 COS。请在存储桶的跨域访问 CORS 中允许网盘域名：

- 方法：`PUT`, `GET`, `HEAD`
- AllowedHeaders：`*`
- ExposeHeaders：`ETag`, `Content-Length`
- 生产域名：`https://tow1.zhuoline.cn`
- 本地开发域名：`http://localhost:3000`

存储桶应保持私有读写。下载链接由服务端生成短期签名，公开分享页本身不会暴露 COS 私有密钥。

## 数据隔离

优先使用 `DRIVE_TURSO_DATABASE_URL` 和 `DRIVE_TURSO_AUTH_TOKEN`。若留空，应用可兼容读取同级环境中的 `TURSO_DATABASE_URL`，但仍只创建和访问 `drive_items`、`drive_shares`、`drive_share_attempts` 这些网盘表。
