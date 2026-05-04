# 货车司机调度与管理系统

商业级全栈系统，支持多角色权限、GPS实时追踪、工时管理、Supabase云数据库。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + Ant Design 5 + Redux Toolkit + i18n |
| 后端 | NestJS 10 + TypeORM + Socket.io |
| 数据库 | Supabase (PostgreSQL) |
| 文件存储 | Supabase Storage |
| 地图 | Google Maps JavaScript API |
| 认证 | JWT + Passport |
| 容器 | Docker + Nginx |

## 快速开始

### 第一步：配置 Supabase

1. 登录 [supabase.com](https://supabase.com) → 新建项目
2. 进入 **SQL Editor** → 粘贴并执行 `database/supabase_migration.sql`
3. 进入 **Settings → Database** → 复制 Connection String (Session Mode)
4. 进入 **Settings → API** → 复制 `service_role` key 和 Project URL

### 第二步：配置环境变量

```bash
cd backend
copy .env.example .env
```

编辑 `backend/.env`：

```env
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_SERVICE_KEY=eyJ...（service_role key）
SUPABASE_STORAGE_BUCKET=truck-uploads
JWT_SECRET=（运行下方命令生成）
```

生成 JWT_SECRET：
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 第三步：配置 Google Maps（可选）

```bash
cd frontend
copy .env.example .env.local
# 填写 VITE_GOOGLE_MAPS_KEY
```

> 不配置也可运行，地图区域会显示占位提示。

### 第四步：启动

**Windows 一键启动：**
```
双击 start-dev.bat
```

**手动启动：**
```bash
# 后端
cd backend
npm install
npm run start:dev

# 前端（新终端）
cd frontend
npm install
npm run dev
```

访问：
- 前端：http://localhost:5173
- API 文档：http://localhost:3000/api/docs

### 默认管理员账户

| 字段 | 值 |
|------|-----|
| 邮箱 | admin@trucksystem.com |
| 密码 | Admin@123456 |

> ⚠️ 上线前必须修改！

---

## 项目结构

```
货车系统开发/
├── backend/                    # NestJS 后端
│   └── src/
│       ├── auth/               # JWT 认证、登录、注册
│       ├── users/              # 用户管理、RBAC
│       ├── tasks/              # 任务 CRUD、开始/完成
│       ├── gps/                # GPS 上传、防作弊、异常检测
│       ├── work-records/       # 工时记录
│       ├── adjustments/        # 工时调整 + 日志
│       ├── notifications/      # 通知 + WebSocket 网关
│       └── common/
│           ├── guards/         # JwtAuthGuard, RolesGuard
│           ├── decorators/     # @Roles, @CurrentUser
│           └── services/       # StorageService (Supabase)
├── frontend/                   # React 前端
│   └── src/
│       ├── pages/
│       │   ├── auth/           # 登录、注册
│       │   ├── admin/          # 管理员/调度员（仪表盘、用户、任务、工时、异常、通知）
│       │   ├── driver/         # 司机（任务列表、GPS上传、完成任务、个人中心）
│       │   └── client/         # 客户（订单列表、实时追踪）
│       ├── store/              # Redux (auth, notif)
│       ├── api/                # Axios 封装
│       ├── hooks/              # useSocket
│       └── i18n.ts             # 中/英文
├── database/
│   ├── supabase_migration.sql  # ← Supabase SQL Editor 执行此文件
│   └── schema.sql              # 原始 schema 备用
├── docs/
│   ├── API.md                  # 完整 API 文档
│   └── DEPLOY.md               # 部署指南
├── docker-compose.yml          # 仅 backend + frontend（数据库用 Supabase）
└── start-dev.bat               # Windows 一键启动
```

---

## 角色权限说明

| 角色 | 可访问功能 |
|------|-----------|
| **Admin** | 全部功能：用户审核/创建/禁用、任务CRUD、工时调整、异常管理 |
| **Dispatcher** | 任务创建/分配、用户审核、工时查看/调整 |
| **Driver** | 今日任务、开始/完成任务、GPS上传、历史记录、个人中心 |
| **Client** | 自己的订单、司机实时位置追踪、完成记录查看 |

## GPS 防作弊规则

| 检测项 | 阈值 | 触发异常 |
|-------|------|---------|
| GPS 超时 | > 60秒无上报 | gps_disconnect |
| 速度过快 | > 140 km/h | speed_anomaly |
| 瞬移检测 | 短时间内位移 > 10km 且超过合理速度 1.5 倍 | teleport |

## 工时计算

```
system_duration = end_time - start_time（分钟）
gps_duration    = GPS有效轨迹时长（排除超时段）
final_duration  = system_duration + adjustment_time
                  或管理员手动覆盖
```

所有调整操作都记录在 `adjustment_logs` 表，包含操作人和时间戳。

---

## Docker 部署

```bash
# 根目录创建 .env
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_SERVICE_KEY=eyJ...
JWT_SECRET=...
GOOGLE_MAPS_API_KEY=AIza...

# 启动
docker compose up -d
```

访问 http://localhost（Nginx 反代前端+后端）

详细生产部署见 [docs/DEPLOY.md](docs/DEPLOY.md)
