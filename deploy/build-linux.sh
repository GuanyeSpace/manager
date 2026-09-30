#!/bin/bash
# 在本机构建与服务器架构一致的部署包，不携带开发环境变量。
set -euo pipefail
project_dir=$(cd "$(dirname "$0")/.." && pwd)
output=${1:-/tmp/manager-linux-release.tar.gz}
staging=$(mktemp -d)
container_id=
cleanup() {
  if [ -n "$container_id" ]; then docker rm -f "$container_id" >/dev/null; fi
  rm -rf "$staging"
}
trap cleanup EXIT
cd "$project_dir"
COPYFILE_DISABLE=1 tar --exclude='app/generated' -cf - app components lib modules prisma public package.json package-lock.json prisma7.config.ts next.config.ts tsconfig.json postcss.config.mjs proxy.ts next-env.d.ts | tar -xf - -C "$staging"
container_id=$(docker create --platform linux/amd64 --memory=3g --cpus=2 -w /app -e NEXT_TELEMETRY_DISABLED=1 -e NODE_OPTIONS=--max-old-space-size=1024 node:22-bookworm-slim sh -c 'apt-get update -qq && apt-get install -y -qq openssl ca-certificates && npm ci --no-audit --no-fund && ./node_modules/.bin/prisma generate --config prisma7.config.ts && npm run build -- --webpack && cp -r public .next/standalone/public && cp -r .next/static .next/standalone/.next/static && tar -czf /release.tar.gz -C .next standalone')
docker cp "$staging/." "$container_id:/app"
docker start -a "$container_id"
test "$(docker inspect -f '{{.State.ExitCode}}' "$container_id")" = 0
docker cp "$container_id:/release.tar.gz" "$output"
printf '构建包：%s\n' "$output"
