# 车载 GPS 定位器接入（JT808 / 信春科技 V1.54 低功耗版）

设备直接把定位发到本后端（不经过厂家平台、不用 Traccar），进入现有的地图 / 静止报警 / 工时 / 在线判定链路。

```
定位器 ──TCP(JT808)──▶ 后端网关 Jt808Server ──▶ GpsDeviceService.ingest
                                                    │ 设备号 → gps_devices 登记表 → 车牌
                                                    │ 车牌 → 司机接单时填的车牌 → 进行中任务
                                                    ▼
                                            GpsService.upload(driverId, taskId, 点)
                                            → gps_logs（source='device'）→ 地图/报警/工时/在线
```

代码在 `backend/src/gps-device/`：`jt808.codec.ts`（协议编解码，纯函数，测试用厂家报文样例逐字节比对）、
`jt808.server.ts`（TCP 网关）、`gps-device.service.ts`（设备 ↔ 车牌 ↔ 任务）、`gps-device.controller.ts`（管理接口）。
Web 管理端菜单「GPS设备」（管理员 / 调度员）。

## 1. 后端环境变量

| 变量 | 说明 |
|---|---|
| `JT808_PORT` | 网关监听的 TCP 端口，如 `5023`。**不设置则网关不启动**。 |
| `JT808_DEVICE_TZ_OFFSET_HOURS` | 设备上报时间的时区，默认 `8`（厂家协议用北京时间）。设备开机会发 0x1007 时区同步，收到后以设备为准。 |

## 2. 数据库

生产库 `synchronize` 关闭，上线前在 Supabase SQL Editor 执行一次（幂等）：

```
database/migrations/2026-09-14_gps_devices.sql
```

内容：`gps_logs` 增加 `source` 列；新建 `gps_devices` 表。开发库由 TypeORM 自动建表。

## 3. Railway 暴露 TCP 端口

Railway 的 HTTP 域名只转发 HTTP，设备走原始 TCP，需要 **TCP Proxy**：

1. Railway → 后端 service → **Settings → Networking → TCP Proxy → Add**
2. 内部端口填 `JT808_PORT` 的值（如 `5023`）
3. Railway 会分配一个 `xxx.proxy.rlwy.net:NNNNN` 形式的 **域名 + 端口** —— 这就是要写进设备的服务器地址
4. Variables 里加 `JT808_PORT=5023`（以及可选的 `JT808_DEVICE_TZ_OFFSET_HOURS`），重新部署
5. 部署日志应出现 `JT808 gateway listening on 0.0.0.0:5023`

每个 service 只能有一个 TCP Proxy；HTTP 端口 `$PORT` 不受影响，同一服务同时提供 API 和 TCP 网关。

## 4. 设备侧配置

用厂家的短信指令 / 配置工具把设备的**主服务器地址**改成上一步的域名与端口（协议参数 `0x0013` 服务器地址、`0x0018` 端口）。协议默认 JT808（参数 `0xF156`），不用改。

设备接车电（ACC/常电）安装；SIM 卡需 4G 数据，NZ 频段含 B28。

## 5. 登记与绑定流程（Web 端「GPS设备」页）

1. 设备开机连上网关后，因未登记会被拒绝注册，页面顶部会显示 **「有未登记的设备正在尝试连接」** 和它的设备号
2. 点设备号 → 填**车牌** → 登记。之后设备重新注册即被接受（设备自己会重试）
3. 司机接单时填写的车牌**必须与登记车牌一致**（不区分大小写、空格、连字符），定位点才会归到该司机的进行中任务
4. 没有进行中任务时，设备位置只更新在设备列表（最后位置 / 电量 / 在线），不写轨迹

页面操作：**立即定位**（0x8201）、**实时模式**、**重启**（0x8155）、停用 / 删除。

### 实时模式（调度地图需要）

低功耗版设备默认静止后会休眠、停止上报。「实时模式」一次性下发（0x8103，按厂家 2011 版布局）：
禁止休眠（`0xF117=0`）、定时 10 秒上报（`0xF115`、`0x0029`）、静止也上报（`0xF154=1`）、心跳 60 秒（`0x0001`）、设备时区（`0xF142`）。
接车电时功耗无所谓；新设备登记后建议立刻下发一次。

## 6. 本地联调

```bash
# backend/.env 加 JT808_PORT=5023 后启动，然后用厂家样例心跳报文测试：
printf '\x7e\x00\x02\x00\x00\x99\x99\x99\x99\x91\x18\x00\x0c\x87\x7e' | nc 127.0.0.1 5023 | xxd
# 期望回 7e 8001 0005 999999999118 xxxx 000c 0002 00 xx 7e（平台通用应答）
```

设备真机联调看后端日志：`device <设备号> connected`、`register from unregistered device`（去登记）、
`batch from … (blind-zone backfill)`（离线补传）。

## 7. 排错

| 现象 | 看什么 |
|---|---|
| 页面显示「网关未启动」 | 后端没设 `JT808_PORT` |
| 设备一直不出现在「未登记」里 | 设备服务器地址 / 端口没改对；Railway TCP Proxy 端口与 `JT808_PORT` 不一致；SIM 无数据 |
| 已登记但地图不显示 | 车牌与司机接单填写的不一致；或该司机没有进行中任务（看设备列表的「最后位置」是否在更新） |
| 时间差 8 小时 / 12 小时 | 检查 `JT808_DEVICE_TZ_OFFSET_HOURS`，或下发一次实时模式（会同步设备时区） |
| 设备在线但无定位 | `no_fix`：室内 / 天线遮挡，设备列表里电量、信号仍会更新 |

协议细节以 `jt808.codec.spec.ts` 里的厂家样例为准；设备识别用消息头里的 11 位设备号（0x0100 里的终端 ID 字段是固定值，勿用）。
