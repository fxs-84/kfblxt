# Multi-stage: build static assets, serve via nginx
# ————————————————————————————————————————————————
# Stage 1: build
FROM node:20-alpine AS build
WORKDIR /src

# 装依赖(分层缓存)
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

COPY . .
RUN npm run build

# Stage 2: serve via nginx (极薄镜像)
FROM nginx:1.27-alpine
LABEL org.opencontainers.image.title="kfblxt-frontend"
LABEL org.opencontainers.image.description="ANRM 神经康复诊治训练系统(前端)"
LABEL org.opencontainers.image.licenses="MIT"

# 把前端 build 产物放到 nginx html 目录
COPY --from=build /src/dist /usr/share/nginx/html

# SPA 路由 fallback: history mode 下未匹配路由回 /index.html
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
  listen 80;
  listen [::]:80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  # gzip 文本
  gzip on;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
  gzip_min_length 256;

  # 不缓存 SPA 入口
  location = /index.html {
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
  }

  # 不缓存已 hash 的 assets/* 也可设长 cache;这里给 7 天
  location ~* \.(?:js|css|woff2?|ttf)$ {
    expires 7d;
    add_header Cache-Control "public, immutable" always;
  }

  # SPA fallback
  location / {
    try_files $uri $uri/ /index.html;
  }

  # 反代后端:把 /supabase/* 转发到 Supabase 服务(若同一 docker network 中有 supabase 服务)
  # 用户也可直接通过外网 Supabase,无需走这里反代
  # location /supabase/ { proxy_pass http://supabase-kong:8000/; }
}
EOF

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
