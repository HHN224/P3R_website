#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo '请先安装 Docker Engine 和 Compose 插件。'; exit 1; }
docker compose version >/dev/null
if [ ! -f .env ]; then
  echo '请先将 .env.example 复制为 .env，填写 SITE_URL 和随机 ADMIN_PASSWORD。'
  exit 1
fi
if ! grep -Eq '^SITE_URL=https://[^/[:space:]]+/?$' .env; then
  echo '请将 SITE_URL 设置为 https://你的域名（域名需要解析到本服务器）。'
  exit 1
fi
if grep -q 'ADMIN_PASSWORD=replace-with' .env; then
  echo '请替换 .env 中的示例管理员密码。'
  exit 1
fi
mkdir -p backups
# The container runs as the unprivileged node user (uid 1000).
if command -v sudo >/dev/null; then sudo chown 1000:1000 backups; else chown 1000:1000 backups; fi
docker compose up -d --build --wait
echo '网站已启动。HTTPS 证书由 Caddy 自动申请。访问 SITE_URL，后台路径为 /admin。'
