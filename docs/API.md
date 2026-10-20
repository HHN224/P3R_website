# 发布接口 v1

同源后台使用这些 JSON 接口；也可通过脚本携带登录 cookie 调用。写请求必须发送和 `.env` 中 `SITE_URL` 完全一致的 `Origin`（`Origin` 不含路径，因此子路径部署下仍填 origin，不需要附带 `BASE_PATH`），不允许跨站调用，不设置宽泛的 CORS。API 路由返回 `Cache-Control: no-store`。

设置 `BASE_PATH=/blog` 时，下表所有路径与上传返回的图片地址都带上该前缀（例如 `/blog/api/login`、`/blog/uploads/xxx.webp`），`BASE_PATH` 为空时保持根路径不变。会话 Cookie 的 `Path` 也随 `BASE_PATH` 变化。

| 方法与路径 | 用途 |
|---|---|
| GET `/api/session` | 查询是否登录 |
| POST `/api/login` | JSON `{ "password": "你的管理员密码" }`，成功设置 12 小时 cookie |
| POST `/api/logout` | 撤销当前 cookie 对应的会话 |
| GET `/api/admin/posts` | 获取全部文章，包括草稿、Markdown 与 revision |
| POST `/api/admin/posts` | 创建文章 |
| PUT `/api/admin/posts/:slug` | 更新文章，必须发送读取时的 revision |
| POST `/api/admin/preview` | JSON `{ "markdown": "..." }`，返回安全渲染的 html 和 toc |
| POST `/api/admin/uploads` | multipart/form-data，文件字段 `file`，返回 `{ "url": "/uploads/随机名.webp" }` |
| GET `/api/admin/export` | 下载含全部 Markdown 和元数据的 JSON |

除了会话查询与登录，以上接口都需要登录。会话以哈希存储在 SQLite。上传图片地址公开，草稿不要上传保密图片；未发布正文不会出现在公开列表、详情、RSS 或 sitemap。

文章请求示例：

```json
{
  "slug": "a-new-story",
  "title": "新的记录",
  "date": "2026-09-22",
  "category": "随笔",
  "tags": ["Python", "Agent"],
  "series": "构建自己的 Agent",
  "day": 7,
  "excerpt": "这一篇的简短介绍。",
  "markdown": "## 开始\n\n正文内容。",
  "status": "draft"
}
```

创建成功返回 201 和文章对象，包含 `revision: 1`。修改时增加 `revision` 并发送所有字段；成功后 revision 加一。重复 slug 或旧版本返回 409；无效字段返回 400；未登录 401；来源不匹配 403；文件过大 413；限流 429。未知错误返回 500，不暴露内部堆栈。网址标识创建后不能修改。将 status 改为 `published` 立即发布，改为 `draft` 撤稿。

公开接口：`/healthz`、`/feed.xml`、`/sitemap.xml`、`/robots.txt`。搜索入口 `/journal?q=关键词`，可加 `category`、`tag`、`series` 查询参数；结果仅包含已发布文章。

## 限流与体积上限

以下数值取自 `src/app.mjs`；调整代码时请同步更新本节。

| 项目 | 当前值 | 超出时 |
|---|---|---|
| JSON 请求体 | 1 MB（`express.json` 默认上限） | 413 |
| `/api` 全部路由 | 每 60 秒 120 次 | 429 |
| `/api/login` | 每 15 分钟 10 次，成功登录不计数（`skipSuccessfulRequests`） | 429 |
| 图片上传 | 单文件 8 MB、一次 1 个文件 | 413 |
| 图片输入像素 | 4000 万像素 | 400 |
| Markdown 正文（预览与保存） | 500,000 字符 | 400 |

上传接受 JPG、PNG、WebP、GIF、AVIF，统一转为 WebP（最长边 2400 像素、质量 85），字段名 `file`，成功返回 201。

## 字段校验上限

`validatePost` 的约束如下，超出返回 400 并附说明文案。

| 字段 | 约束 |
|---|---|
| `slug` | 1–100 位小写字母、数字与连字符，形如 `a-new-story`；创建后不可修改 |
| `title` | 1–200 字 |
| `markdown` | 1–500,000 字 |
| `date` | `YYYY-MM-DD`，且为真实存在的日期 |
| `status` | `draft` 或 `published` |
| `category` | 可选，最长 40 字，缺省为「随笔」 |
| `series` | 可选，最长 80 字 |
| `excerpt` | 可选，最长 500 字；缺省时取正文纯文本前 140 字 |
| `tags` | 最多 12 个，每个不超过 30 字，自动去重 |
| `day` | 0–9999 的整数，用于系列内排序 |
