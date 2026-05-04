# 货车调度管理系统 API 文档

Base URL: `http://localhost:3000`  
认证方式：Bearer Token（JWT）

---

## 认证模块 /auth

| 方法 | 路径 | 描述 | 权限 |
|------|------|------|------|
| POST | /auth/login | 登录 | 公开 |
| POST | /auth/register | 注册申请 | 公开 |
| GET  | /auth/me | 获取当前用户 | 已登录 |

### POST /auth/login
```json
// Request
{
  "identifier": "admin@trucksystem.com",
  "password": "Admin@123456"
}

// Response
{
  "access_token": "eyJhbGciOiJIUzI1...",
  "user": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@trucksystem.com",
    "role": "admin",
    "fullName": "系统管理员",
    "language": "zh"
  }
}
```

### POST /auth/register
```json
// Request
{
  "username": "driver001",
  "email": "driver@example.com",
  "password": "Password123!",
  "role": "driver",
  "fullName": "张三",
  "phone": "13800138000"
}
// Response: { "message": "注册成功，等待管理员审核", "userId": "uuid" }
```

---

## 用户管理 /users

| 方法 | 路径 | 描述 | 权限 |
|------|------|------|------|
| GET | /users | 用户列表 | Admin/Dispatcher |
| GET | /users/pending | 待审核用户 | Admin/Dispatcher |
| GET | /users/drivers | 活跃司机列表 | Admin/Dispatcher |
| GET | /users/clients | 活跃客户列表 | Admin/Dispatcher |
| GET | /users/:id | 用户详情 | Admin/Dispatcher |
| POST | /users | 创建用户 | Admin |
| PATCH | /users/:id/approve | 审批通过 | Admin/Dispatcher |
| PATCH | /users/:id/reject | 拒绝申请 | Admin/Dispatcher |
| PATCH | /users/:id/disable | 禁用账户 | Admin |
| PATCH | /users/:id/enable | 启用账户 | Admin |
| PATCH | /users/:id/role | 修改角色 | Admin |
| PATCH | /users/profile | 更新个人资料 | 已登录 |
| PATCH | /users/change-password | 修改密码 | 已登录 |

---

## 任务管理 /tasks

| 方法 | 路径 | 描述 | 权限 |
|------|------|------|------|
| GET | /tasks | 任务列表（按角色过滤） | 已登录 |
| GET | /tasks/today | 今日任务 | Driver |
| GET | /tasks/stats | 统计数据 | Admin/Dispatcher |
| GET | /tasks/:id | 任务详情 | 已登录 |
| POST | /tasks | 创建任务 | Admin/Dispatcher |
| PATCH | /tasks/:id | 编辑任务 | Admin/Dispatcher |
| PATCH | /tasks/:id/assign | 分配司机 | Admin/Dispatcher |
| POST | /tasks/:id/start | 开始任务 | Driver |
| POST | /tasks/:id/complete | 完成任务（含图片上传） | Driver |
| PATCH | /tasks/:id/cancel | 取消任务 | Admin/Dispatcher |

### POST /tasks（创建任务）
```json
{
  "title": "广州→深圳货运",
  "clientId": "uuid",
  "driverId": "uuid",
  "startLocation": "广州白云区仓库",
  "endLocation": "深圳罗湖区客户仓",
  "startLat": 23.1292,
  "startLng": 113.2644,
  "endLat": 22.5481,
  "endLng": 114.0579,
  "cargo": "电子元件",
  "cargoWeight": 2.5,
  "scheduledAt": "2024-03-15T08:00:00Z",
  "notes": "注意轻拿轻放"
}
```

### POST /tasks/:id/complete（multipart/form-data）
```
Field: notes (text)
Field: images (file, 最多5张)
```

---

## GPS 追踪 /gps

| 方法 | 路径 | 描述 | 权限 |
|------|------|------|------|
| POST | /gps/upload | 上传GPS坐标 | Driver |
| GET | /gps/track/:taskId | 任务GPS轨迹 | 已登录 |
| GET | /gps/positions | 所有司机最新位置 | Admin/Dispatcher |
| GET | /gps/driver/:driverId/position | 指定司机位置 | 已登录 |

### POST /gps/upload（每10秒调用一次）
```json
{
  "taskId": "uuid",
  "latitude": 22.5481,
  "longitude": 114.0579,
  "speed": 60.5,
  "heading": 180.0,
  "accuracy": 5.0
}
// Response
{
  "log": { "id": 1, "latitude": 22.5481, ... },
  "anomalies": []  // 或 ["speed_anomaly", "teleport"]
}
```

---

## 工时记录 /work-records

| 方法 | 路径 | 描述 | 权限 |
|------|------|------|------|
| GET | /work-records | 工时列表 | 已登录（Driver只看自己） |
| GET | /work-records/task/:taskId | 按任务查询 | 已登录 |
| GET | /work-records/:id | 详情 | 已登录 |

---

## 工时调整 /adjustments

| 方法 | 路径 | 描述 | 权限 |
|------|------|------|------|
| POST | /adjustments | 调整工时 | Admin/Dispatcher |
| POST | /adjustments/set-final | 手动设置最终工时 | Admin/Dispatcher |
| GET | /adjustments/logs | 调整日志 | Admin/Dispatcher |

### POST /adjustments
```json
{
  "workRecordId": "uuid",
  "driverId": "uuid",
  "taskId": "uuid",
  "addedMinutes": 30,   // 或 60
  "reason": "交通延误"
}
```

---

## 通知 /notifications

| 方法 | 路径 | 描述 | 权限 |
|------|------|------|------|
| GET | /notifications | 我的通知 | 已登录 |
| GET | /notifications/unread-count | 未读数量 | 已登录 |
| PATCH | /notifications/:id/read | 标记已读 | 已登录 |
| PATCH | /notifications/read-all | 全部已读 | 已登录 |

---

## WebSocket 事件

连接地址：`ws://localhost:3000`  
连接参数：`auth: { token: "Bearer_token" }`

### 服务端 → 客户端

| 事件 | 数据 | 描述 |
|------|------|------|
| `notification` | `{ title, content, type, meta }` | 新通知推送 |
| `gps:update` | `{ driverId, latitude, longitude, speed, timestamp }` | GPS位置更新 |

### 客户端 → 服务端

| 事件 | 描述 |
|------|------|
| `ping` | 心跳检测 |

---

## 工时计算逻辑

```
system_duration = end_time - start_time（分钟）
gps_duration    = GPS有效轨迹时长（排除超时断连）
adjustment_time = 手动叠加时间（+30min / +60min / 自定义）
final_duration  = system_duration + adjustment_time
                  （或管理员手动覆盖）
```

## GPS 防作弊规则

| 规则 | 阈值 | 异常类型 |
|------|------|------|
| GPS 超时 | > 60秒无上报 | gps_disconnect |
| 速度异常 | > 140 km/h | speed_anomaly |
| 瞬移检测 | 距离 > 10km 且超过合理速度1.5倍 | teleport |
