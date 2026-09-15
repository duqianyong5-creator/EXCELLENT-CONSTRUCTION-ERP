import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';
import { GpsDeviceService } from './gps-device.service';
import {
  AckResult, MsgId, ParamId, RegisterResult,
  Jt808Frame, decodeFrame, splitFrames, normalizeDeviceNo,
  parsePosition, parseBatchPositions, decodeTimezone, encodeTimezone,
  buildPlatformAck, buildRegisterAck, buildTimeSyncAck, buildSetParams, buildReboot, buildPositionQuery,
  realtimeUploadParam, dwordParam, byteParam, stringParam,
} from './jt808.codec';

interface Session {
  socket: net.Socket;
  addr: string;
  buffer: Buffer;
  /** 协议头里的终端手机号（BCD 12 位） */
  phone: string | null;
  /** 归一化设备号 */
  deviceNo: string | null;
  authed: boolean;
  tzOffset: number;
  serial: number;
  connectedAt: Date;
  lastSeenAt: Date;
  frames: number;
}

export interface OnlineDevice {
  deviceNo: string;
  addr: string;
  connectedAt: Date;
  lastSeenAt: Date;
  tzOffset: number;
  authed: boolean;
}

export interface UnregisteredAttempt {
  deviceNo: string;
  addr: string;
  count: number;
  lastAt: Date;
}

const MAX_BUFFER = 64 * 1024; // 单连接最大积压（0x0704 批量最多也就几 KB）
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 终端心跳一般 ≤ 5 分钟；低功耗休眠会主动断开
const MAX_CONNECTIONS = 500;
const MAX_UNREGISTERED = 200;

/**
 * JT808 TCP 网关：设备 -> 本服务（TCP）-> GpsDeviceService.ingest -> gps_logs / 地图 / 报警 / 工时
 *
 * 通过环境变量 JT808_PORT 开启（不设则不启动）。部署在 Railway 时给该端口加 TCP Proxy，
 * 设备服务器地址配置为 Railway 分配的 domain:port。
 */
@Injectable()
export class Jt808Server implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('JT808');
  private server: net.Server | null = null;
  private sessions = new Set<Session>();
  private byDevice = new Map<string, Session>();
  private unregistered = new Map<string, UnregisteredAttempt>();
  private defaultTz = 8;

  constructor(
    private config: ConfigService,
    private devices: GpsDeviceService,
  ) {}

  async onModuleInit(): Promise<void> {
    const port = Number(this.config.get<string>('JT808_PORT') || 0);
    const tzRaw = this.config.get<string>('JT808_DEVICE_TZ_OFFSET_HOURS');
    const tz = Number(tzRaw);
    if (tzRaw !== undefined && String(tzRaw).trim() !== '' && Number.isFinite(tz) && Math.abs(tz) <= 14) this.defaultTz = tz;
    if (!port) {
      this.logger.log('JT808 gateway disabled (set JT808_PORT to enable)');
      return;
    }
    await this.start(port);
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  /** 也供测试直接调用（port=0 随机端口） */
  start(port: number, host = '0.0.0.0'): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => this.handleConnection(socket));
      server.maxConnections = MAX_CONNECTIONS;
      server.on('error', (err) => {
        this.logger.error(`JT808 server error: ${err.message}`);
        reject(err);
      });
      server.listen(port, host, () => {
        this.server = server;
        const bound = (server.address() as net.AddressInfo).port;
        this.logger.log(`JT808 gateway listening on ${host}:${bound} (device tz default UTC${this.defaultTz >= 0 ? '+' : ''}${this.defaultTz})`);
        resolve(bound);
      });
    });
  }

  async stop(): Promise<void> {
    for (const s of this.sessions) s.socket.destroy();
    this.sessions.clear();
    this.byDevice.clear();
    const server = this.server;
    this.server = null;
    if (server) await new Promise<void>((r) => server.close(() => r()));
  }

  getPort(): number | null {
    const a = this.server?.address();
    return a && typeof a === 'object' ? a.port : null;
  }

  getOnline(): OnlineDevice[] {
    return [...this.byDevice.values()].map((s) => ({
      deviceNo: s.deviceNo!,
      addr: s.addr,
      connectedAt: s.connectedAt,
      lastSeenAt: s.lastSeenAt,
      tzOffset: s.tzOffset,
      authed: s.authed,
    }));
  }

  isOnline(deviceNo: string): boolean {
    return this.byDevice.has(normalizeDeviceNo(deviceNo));
  }

  getUnregistered(): UnregisteredAttempt[] {
    return [...this.unregistered.values()].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
  }

  clearUnregistered(deviceNo: string): void {
    this.unregistered.delete(normalizeDeviceNo(deviceNo));
  }

  // ---------- 平台主动下发 ----------

  /** 重启终端（0x8155） */
  reboot(deviceNo: string): void {
    const s = this.requireSession(deviceNo);
    this.send(s, buildReboot(s.phone!, this.nextSerial(s)));
  }

  /** 让终端立刻上报一次位置（0x8201） */
  queryPosition(deviceNo: string): void {
    const s = this.requireSession(deviceNo);
    this.send(s, buildPositionQuery(s.phone!, this.nextSerial(s)));
  }

  /**
   * 车队实时模式：禁止休眠、定时 N 秒上报、静止也上报、心跳 60s、设备时区按服务器配置。
   * 设备接车电时功耗无所谓，这是调度地图需要的模式。
   */
  setRealtimeMode(deviceNo: string, intervalSec = 10, tzOffset?: number): void {
    const s = this.requireSession(deviceNo);
    const sec = Math.min(120, Math.max(10, Math.round(intervalSec)));
    const tz = tzOffset ?? s.tzOffset;
    this.send(s, buildSetParams(s.phone!, this.nextSerial(s), [
      dwordParam(ParamId.SLEEP_INTERVAL_MIN, 0),
      realtimeUploadParam(0, sec),
      dwordParam(ParamId.DEFAULT_TIME_INTERVAL, sec),
      dwordParam(ParamId.REPORT_STRATEGY, 0),
      byteParam(ParamId.REPORT_WHEN_STATIONARY, 1),
      dwordParam(ParamId.HEARTBEAT_INTERVAL, 60),
      byteParam(ParamId.DEVICE_TIMEZONE, encodeTimezone(tz)),
    ]));
    s.tzOffset = tz;
  }

  /** 修改设备的主服务器地址（迁移服务器用） */
  setServer(deviceNo: string, host: string, port: number): void {
    const s = this.requireSession(deviceNo);
    this.send(s, buildSetParams(s.phone!, this.nextSerial(s), [
      stringParam(ParamId.MAIN_SERVER_HOST, host),
      dwordParam(ParamId.MAIN_SERVER_PORT, port),
    ]));
  }

  private requireSession(deviceNo: string): Session {
    const s = this.byDevice.get(normalizeDeviceNo(deviceNo));
    if (!s || !s.phone) throw new NotFoundException('设备不在线 / Device is offline');
    return s;
  }

  // ---------- 连接处理 ----------

  private handleConnection(socket: net.Socket): void {
    const session: Session = {
      socket,
      addr: `${socket.remoteAddress}:${socket.remotePort}`,
      buffer: Buffer.alloc(0),
      phone: null,
      deviceNo: null,
      authed: false,
      tzOffset: this.defaultTz,
      serial: 0,
      connectedAt: new Date(),
      lastSeenAt: new Date(),
      frames: 0,
    };
    this.sessions.add(session);
    socket.setKeepAlive(true, 60_000);
    socket.setNoDelay(true);
    socket.setTimeout(IDLE_TIMEOUT_MS, () => {
      this.logger.debug(`idle timeout ${session.deviceNo ?? session.addr}`);
      socket.destroy();
    });
    socket.on('data', (chunk) => this.onData(session, chunk));
    socket.on('error', (err) => this.logger.debug(`socket ${session.deviceNo ?? session.addr}: ${err.message}`));
    socket.on('close', () => this.dropSession(session));
  }

  private dropSession(session: Session): void {
    this.sessions.delete(session);
    if (session.deviceNo && this.byDevice.get(session.deviceNo) === session) {
      this.byDevice.delete(session.deviceNo);
      this.logger.log(`device ${session.deviceNo} disconnected (${session.frames} frames)`);
    }
  }

  private onData(session: Session, chunk: Buffer): void {
    session.buffer = Buffer.concat([session.buffer, chunk]);
    if (session.buffer.length > MAX_BUFFER) {
      this.logger.warn(`buffer overflow from ${session.addr}, dropping connection`);
      session.socket.destroy();
      return;
    }
    const { frames, rest } = splitFrames(session.buffer);
    session.buffer = rest;
    for (const raw of frames) {
      const frame = decodeFrame(raw);
      if (!frame) continue;
      if (!frame.checksumOk) {
        this.logger.warn(`bad checksum from ${session.addr} msg=0x${frame.msgId.toString(16)}`);
        continue;
      }
      if (frame.encrypted) {
        this.logger.warn(`encrypted message not supported from ${session.addr}`);
        this.send(session, buildPlatformAck(frame.phone, this.nextSerial(session), frame.serial, frame.msgId, AckResult.UNSUPPORTED));
        continue;
      }
      session.frames++;
      session.lastSeenAt = new Date();
      this.bindDevice(session, frame.phone);
      // 逐帧串行处理，避免同一设备的分包/批量乱序
      this.handleFrame(session, frame).catch((e) => {
        this.logger.error(`handle 0x${frame.msgId.toString(16)} from ${session.deviceNo}: ${e?.message || e}`);
      });
    }
  }

  private bindDevice(session: Session, phone: string): void {
    const deviceNo = normalizeDeviceNo(phone);
    if (session.deviceNo === deviceNo) { session.phone = phone; return; }
    if (session.deviceNo && this.byDevice.get(session.deviceNo) === session) this.byDevice.delete(session.deviceNo);
    session.phone = phone;
    session.deviceNo = deviceNo;
    const previous = this.byDevice.get(deviceNo);
    if (previous && previous !== session) {
      // 同一设备重连：踢掉旧连接
      previous.socket.destroy();
    }
    this.byDevice.set(deviceNo, session);
    this.logger.log(`device ${deviceNo} connected from ${session.addr}`);
  }

  private async handleFrame(session: Session, frame: Jt808Frame): Promise<void> {
    const phone = frame.phone;
    const deviceNo = session.deviceNo!;
    const ack = (result: number = AckResult.OK) =>
      this.send(session, buildPlatformAck(phone, this.nextSerial(session), frame.serial, frame.msgId, result));

    switch (frame.msgId) {
      case MsgId.REGISTER: {
        const device = await this.devices.findByDeviceNo(deviceNo);
        if (!device || !device.enabled) {
          this.noteUnregistered(session, deviceNo);
          this.send(session, buildRegisterAck(phone, this.nextSerial(session), frame.serial, RegisterResult.TERMINAL_NOT_FOUND));
          this.logger.warn(`register from ${device ? 'disabled' : 'unregistered'} device ${deviceNo} (${session.addr})`);
          return;
        }
        session.authed = true;
        // 鉴权码沿用厂家平台做法：就是设备号本身
        this.send(session, buildRegisterAck(phone, this.nextSerial(session), frame.serial, RegisterResult.OK, device.deviceNo));
        await this.devices.touch(deviceNo);
        return;
      }
      case MsgId.AUTH: {
        const device = await this.devices.findByDeviceNo(deviceNo);
        if (!device || !device.enabled) {
          this.noteUnregistered(session, deviceNo);
          ack(AckResult.FAIL); // 终端收到失败会重新走注册
          return;
        }
        session.authed = true;
        ack();
        await this.devices.touch(deviceNo);
        return;
      }
      case MsgId.HEARTBEAT:
      case MsgId.FAKE_SHUTDOWN_HEARTBEAT: {
        ack();
        await this.devices.touch(deviceNo);
        return;
      }
      case MsgId.POSITION: {
        ack(); // 先应答，避免终端重发
        const pos = parsePosition(frame.body, session.tzOffset);
        if (!pos) { this.logger.warn(`short position body from ${deviceNo}`); return; }
        await this.devices.ingest(deviceNo, pos);
        return;
      }
      case MsgId.POSITION_QUERY_ACK: {
        // 旧固件对 0x8201 的应答：应答流水号(2) + 0x0200 消息体；新固件直接发 0x0200
        ack();
        if (frame.body.length > 2) {
          const pos = parsePosition(frame.body.subarray(2), session.tzOffset);
          if (pos) await this.devices.ingest(deviceNo, pos);
        }
        return;
      }
      case MsgId.BATCH_POSITION: {
        ack();
        const batch = parseBatchPositions(frame.body);
        let stored = 0;
        for (const item of batch.items) {
          const pos = parsePosition(item, session.tzOffset);
          if (!pos) continue;
          if ((await this.devices.ingest(deviceNo, pos, { batch: true })) === 'stored') stored++;
        }
        this.logger.log(`batch from ${deviceNo}: ${batch.items.length} points${batch.blindZone ? ' (blind-zone backfill)' : ''}, stored ${stored}`);
        return;
      }
      case MsgId.TIME_SYNC_REQ: {
        this.send(session, buildTimeSyncAck(phone, this.nextSerial(session), new Date(), session.tzOffset));
        return;
      }
      case MsgId.TIMEZONE_SYNC: {
        const tz = frame.body.length ? decodeTimezone(frame.body[0]) : null;
        if (tz !== null) {
          session.tzOffset = tz;
          this.logger.log(`device ${deviceNo} reports timezone UTC${tz >= 0 ? '+' : ''}${tz}`);
        }
        ack();
        return;
      }
      case MsgId.SLEEP_BATTERY: {
        ack();
        if (frame.body.length) await this.devices.touch(deviceNo, { batteryPercent: frame.body[0] });
        return;
      }
      case MsgId.LOGOUT: {
        ack();
        session.authed = false;
        return;
      }
      case MsgId.TERMINAL_ACK: {
        // 终端对我们下发指令的应答：只记日志
        if (frame.body.length >= 5) {
          const replyId = frame.body.readUInt16BE(2);
          const result = frame.body[4];
          this.logger.log(`device ${deviceNo} ack 0x${replyId.toString(16)} result=${result}`);
        }
        return;
      }
      default: {
        // 0x0107 属性、0x1107 ICCID、0x0112/0x0114 等：统一通用应答，保持终端在线
        ack();
        return;
      }
    }
  }

  private noteUnregistered(session: Session, deviceNo: string): void {
    const cur = this.unregistered.get(deviceNo);
    if (cur) { cur.count++; cur.lastAt = new Date(); cur.addr = session.addr; return; }
    if (this.unregistered.size >= MAX_UNREGISTERED) {
      const oldest = [...this.unregistered.entries()].sort((a, b) => a[1].lastAt.getTime() - b[1].lastAt.getTime())[0];
      if (oldest) this.unregistered.delete(oldest[0]);
    }
    this.unregistered.set(deviceNo, { deviceNo, addr: session.addr, count: 1, lastAt: new Date() });
  }

  private nextSerial(session: Session): number {
    session.serial = (session.serial + 1) & 0xffff;
    return session.serial;
  }

  private send(session: Session, frame: Buffer): void {
    if (session.socket.destroyed) return;
    session.socket.write(frame);
  }
}
