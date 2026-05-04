# 部署说明

## 方式一：本地开发（推荐先行）

### 前置要求
- Node.js 20+
- PostgreSQL 15+
- npm 或 pnpm

### 1. 初始化数据库

```bash
# 创建数据库
psql -U postgres -c "CREATE DATABASE truck_dispatch;"

# 执行 Schema
psql -U postgres -d truck_dispatch -f database/schema.sql
```

### 2. 启动后端

```bash
cd backend

# 复制配置文件
copy .env.example .env
# 编辑 .env，填写数据库密码、JWT_SECRET、Google Maps Key

# 安装依赖
npm install

# 开发模式
npm run start:dev
# 后端运行在 http://localhost:3000
# API 文档：http://localhost:3000/api/docs
```

### 3. 启动前端

```bash
cd frontend

# 复制配置文件
copy .env.example .env.local
# 填写 VITE_GOOGLE_MAPS_KEY

# 安装依赖
npm install

# 开发模式
npm run dev
# 前端运行在 http://localhost:5173
```

### 4. 登录测试

默认管理员账户：
- 邮箱：admin@trucksystem.com
- 密码：Admin@123456

⚠️ **上线前必须修改默认密码！**

---

## 方式二：Docker Compose 部署

### 前置要求
- Docker 24+
- Docker Compose 2.20+

### 1. 配置环境变量

```bash
# 项目根目录创建 .env 文件
cat > .env << EOF
DB_PASSWORD=YourStrongPassword@2024
JWT_SECRET=your-256bit-secret-key-here
GOOGLE_MAPS_API_KEY=AIza...
EOF
```

### 2. 一键启动

```bash
docker compose up -d
```

启动后：
- 前端：http://localhost
- 后端 API：http://localhost:3000
- API 文档：http://localhost:3000/api/docs

### 3. 查看日志

```bash
docker compose logs -f backend
docker compose logs -f postgres
```

### 4. 停止服务

```bash
docker compose down
# 保留数据库数据
docker compose down -v  # 清除所有数据（慎用）
```

---

## 方式三：生产服务器部署（Ubuntu 22.04）

### 1. 安装依赖

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL 15
sudo apt-get install -y postgresql-15

# Nginx
sudo apt-get install -y nginx

# PM2
npm install -g pm2
```

### 2. PostgreSQL 配置

```bash
sudo -u postgres psql -c "CREATE USER truckuser WITH PASSWORD 'your_password';"
sudo -u postgres psql -c "CREATE DATABASE truck_dispatch OWNER truckuser;"
sudo -u postgres psql -d truck_dispatch -f /path/to/database/schema.sql
```

### 3. 后端部署

```bash
cd /var/www/truck-dispatch/backend
npm ci
npm run build

# 配置 .env
cat > .env << EOF
NODE_ENV=production
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=truckuser
DATABASE_PASSWORD=your_password
DATABASE_NAME=truck_dispatch
JWT_SECRET=your-jwt-secret
PORT=3000
GOOGLE_MAPS_API_KEY=your-key
EOF

# PM2 启动
pm2 start dist/main.js --name truck-backend
pm2 startup
pm2 save
```

### 4. 前端构建

```bash
cd /var/www/truck-dispatch/frontend
npm ci
VITE_GOOGLE_MAPS_KEY=your-key npm run build
# 产物在 dist/
```

### 5. Nginx 配置

```nginx
# /etc/nginx/sites-available/truck-dispatch
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/truck-dispatch/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /uploads/ {
        proxy_pass http://localhost:3000/uploads/;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/truck-dispatch /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 6. SSL（推荐使用 Let's Encrypt）

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## Google Maps API 配置

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建项目 → 启用 Maps JavaScript API
3. 创建 API Key，限制到你的域名
4. 填入 `VITE_GOOGLE_MAPS_KEY`（前端）和 `GOOGLE_MAPS_API_KEY`（后端）

---

## 目录结构总览

```
货车系统开发/
├── backend/                # NestJS 后端
│   ├── src/
│   │   ├── auth/          # 认证模块（JWT、登录、注册）
│   │   ├── users/         # 用户管理（RBAC）
│   │   ├── tasks/         # 任务管理
│   │   ├── gps/           # GPS 追踪 + 防作弊
│   │   ├── work-records/  # 工时记录
│   │   ├── adjustments/   # 工时调整
│   │   ├── notifications/ # 通知 + WebSocket 网关
│   │   └── common/        # 公共 Guards、Decorators
│   ├── Dockerfile
│   └── package.json
├── frontend/               # React 前端
│   ├── src/
│   │   ├── pages/
│   │   │   ├── auth/      # 登录、注册
│   │   │   ├── admin/     # 管理员/调度员界面
│   │   │   ├── driver/    # 司机界面
│   │   │   └── client/    # 客户界面
│   │   ├── store/         # Redux 状态管理
│   │   ├── api/           # API 封装
│   │   ├── hooks/         # useSocket 等
│   │   └── i18n.ts        # 中英文国际化
│   ├── Dockerfile
│   └── package.json
├── database/
│   └── schema.sql          # 完整数据库结构
├── docs/
│   ├── API.md             # API 文档
│   └── DEPLOY.md          # 本文件
└── docker-compose.yml
```

---

## 安全检查清单

- [ ] 修改默认管理员密码
- [ ] 设置强 JWT_SECRET（256位随机字符串）
- [ ] 数据库使用专用用户，不使用 postgres 超级用户
- [ ] 生产环境关闭 TypeORM synchronize（改为 migrations）
- [ ] Nginx 配置 rate limiting
- [ ] 上传文件大小限制（当前默认10MB）
- [ ] HTTPS（SSL 证书）
- [ ] Google Maps API Key 限制域名

---

## 常见问题

**Q: 上传文件后无法访问？**  
A: 确保 `backend/uploads/` 目录存在且有写权限。Docker 环境中已通过 volume 挂载。

**Q: WebSocket 连接失败？**  
A: 检查 Nginx location /socket.io/ 配置，需要 Upgrade 头支持。

**Q: GPS 功能需要 HTTPS？**  
A: 是的，浏览器 Geolocation API 在生产环境要求 HTTPS。本地开发 localhost 例外。
