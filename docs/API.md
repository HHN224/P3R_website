# 发布接口 v1

同源后台使用这些 JSON 接口；也可通过脚本携带登录 cookie 调用。写请求必须发送和 `.env` 中 `SITE_URL` 完全一致的 `Origin`，不允许跨站调用，不设置宽泛的 CORS。API 路由返回 `Cache-Control: no-store`。

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
