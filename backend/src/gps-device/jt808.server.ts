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
  /** 同一连接的帧串行处理，避免分包/批量乱序 */
  queue: Promise<void>;
  /** 待处理帧数，超过阈值暂停读取（背压） */
  pending: number;
  /** 被拒绝次数（未登记设备号），用于挡扫描 */
  rejects: number;
  /** 坏帧计数，用于日志降频 */
  badFrames: number;
  /** 分包消息的暂存区：key = 消息ID:总包数 */
  partials: Map<string, { parts: Map<number, Buffer>; at: number; bytes: number }>;
  /** 连上后迟迟不发有效帧的连接会被清掉（防止占用连接数） */
  handshakeTimer: ReturnType<typeof setTimeout> | null;
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
  /** true = 设备已登记但被停用；false = 完全没登记过 */
  disabled: boolean;
}

const MAX_BUFFER = 64 * 1024; // 单连接最大积压（0x0704 批量最多也就几 KB）
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 终端心跳一般 ≤ 5 分钟；低功耗休眠会主动断开
const HANDSHAKE_TIMEOUT_MS = 10 * 1000; // 连上后 10 秒内没有一帧有效数据就断开
const MAX_PENDING_FRAMES = 100; // 待处理帧超过这个数就暂停读取
const MAX_CONNECTIONS = 500;
const MAX_UNREGISTERED = 200;
/** 一条连接上被拒绝多少次就断开：真实设备登记后就不会再被拒，这是挡设备号扫描的 */
const MAX_REJECTS_PER_SESSION = 5;
/** 一条连接上允许多少次校验错误的帧，超过只记一条汇总日志，避免刷日志 */
const MAX_BAD_FRAME_LOGS = 3;
/** 分包重组上限：包数、字节数、同时进行的消息数、以及攒包的有效期 */
const MAX_SUBPACKAGES = 64;
const MAX_SUBPACKAGE_BYTES = 128 * 1024;
const MAX_SUBPACKAGE_SETS = 4;
const SUBPACKAGE_TTL_MS = 60 * 1000;

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
  private startError: string | null = null;

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
    // Railway 配了 TCP Proxy 后会把 PORT 顶成代理的目标端口。网关的 onModuleInit 先跑，
    // 抢到端口后 app.listen 才报 EADDRINUSE —— 整个进程崩溃重启，API 一起宕。宁可不开网关。
    const httpPort = Number(this.config.get<string>('PORT') || 3000);
    if (port === httpPort) {
      this.startError = `JT808_PORT (${port}) is the same as the HTTP port — gateway not started`;
      this.logger.error(`${this.startError}. Set JT808_PORT and PORT to different ports.`);
      return;
    }
    // 定位器网关起不来（端口被占、权限不足）不应该连带把后台、司机 App、客户端一起拖下线，
    // 设备页顶部的告警条会显示网关未运行。
    try {
      await this.start(port);
    } catch (e: any) {
      this.startError = e?.message || String(e);
      this.logger.error(`JT808 gateway failed to start on port ${port}: ${this.startError}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  /** 也供测试直接调用（port=0 随机端口） */
  start(port: number, host = '0.0.0.0'): Promise<number> {
    return new Promise((resolve, reject) => {
      // 连接准入由 handleConnection 自己管（优先踢空连接），不用 net 的先到先得上限
      const server = net.createServer((socket) => this.handleConnection(socket));
      this.server = server; // 先挂上，监听失败时 stop() 也能收拾干净
      server.on('error', (err) => {
        this.logger.error(`JT808 server error: ${err.message}`);
        reject(err);
      });
      server.listen(port, host, () => {
        this.startError = null;
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

  /** 网关启动失败的原因（端口被占等），供管理端显示 */
  getStartError(): string | null {
    return this.startError;
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
      queue: Promise.resolve(),
      pending: 0,
      rejects: 0,
      badFrames: 0,
      partials: new Map(),
      handshakeTimer: null,
    };
    // 连接数到上限时，优先踢掉「连上但一帧有效数据都没发」的连接，
    // 否则一批空连接就能把真实设备全部挡在门外。
    if (this.sessions.size >= MAX_CONNECTIONS) {
      const idle = [...this.sessions].find((s) => s.frames === 0);
      if (idle) {
        this.logger.warn(`connection limit reached, dropping an idle connection from ${idle.addr}`);
        idle.socket.destroy();
      } else {
        this.logger.error(`connection limit reached with all sessions active, refusing ${session.addr}`);
        socket.destroy();
        return;
      }
    }
    this.sessions.add(session);
    socket.setKeepAlive(true, 60_000);
    socket.setNoDelay(true);
    socket.setTimeout(IDLE_TIMEOUT_MS, () => {
      this.logger.debug(`idle timeout ${session.deviceNo ?? session.addr}`);
      socket.destroy();
    });
    session.handshakeTimer = setTimeout(() => {
      if (session.frames === 0) {
        this.logger.debug(`no valid frame from ${session.addr} within handshake window, closing`);
        socket.destroy();
      }
    }, HANDSHAKE_TIMEOUT_MS);
    session.handshakeTimer.unref?.(); // 不要因为这个定时器把进程/测试拖住不退出
    socket.on('data', (chunk) => this.onData(session, chunk));
    socket.on('error', (err) => this.logger.debug(`socket ${session.deviceNo ?? session.addr}: ${err.message}`));
    socket.on('close', () => this.dropSession(session));
  }

  private dropSession(session: Session): void {
    if (session.handshakeTimer) { clearTimeout(session.handshakeTimer); session.handshakeTimer = null; }
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
        session.badFrames++;
        if (session.badFrames <= MAX_BAD_FRAME_LOGS) {
          this.logger.warn(`bad checksum from ${session.addr} msg=0x${frame.msgId.toString(16)}`);
        } else if (session.badFrames === MAX_BAD_FRAME_LOGS + 1) {
          this.logger.warn(`further malformed frames from ${session.addr} will not be logged`);
        }
        continue;
      }
      if (frame.encrypted) {
        this.logger.warn(`encrypted message not supported from ${session.addr}`);
        this.send(session, buildPlatformAck(frame.phone, this.nextSerial(session), frame.serial, frame.msgId, AckResult.UNSUPPORTED));
        continue;
      }
      session.frames++;
      session.lastSeenAt = new Date();
      if (session.handshakeTimer) { clearTimeout(session.handshakeTimer); session.handshakeTimer = null; }
      if (!this.bindDevice(session, frame.phone)) return;

      // 分包消息：先攒齐再处理。消息体长度字段只有 10 位（≤1023 字节），
      // 一个定位点 74 字节，所以盲区补报超过十几个点时终端必然分包发送。
      // 不重组就只会处理第一包、后面几包当残帧丢掉——而且我们还回了「成功」，终端就不再重传了。
      const assembled = frame.subpackage ? this.collectSubpackage(session, frame) : frame;
      if (!assembled) {
        // 还没攒齐：按协议逐包应答，等后续包
        this.send(session, buildPlatformAck(frame.phone, this.nextSerial(session), frame.serial, frame.msgId, AckResult.OK));
        continue;
      }
      // 逐帧串行处理，避免同一设备的分包/批量乱序；
      // 处理慢（数据库卡）时暂停读取，不让待处理链无限增长。
      session.pending++;
      if (session.pending >= MAX_PENDING_FRAMES && !session.socket.isPaused()) session.socket.pause();
      session.queue = session.queue
        .then(() => this.handleFrame(session, assembled))
        .catch((e) => {
          this.logger.error(`handle 0x${assembled.msgId.toString(16)} from ${session.deviceNo}: ${e?.message || e}`);
        })
        .then(() => {
          session.pending--;
          if (session.pending < MAX_PENDING_FRAMES && session.socket.isPaused()) session.socket.resume();
        });
    }
  }

  /**
   * 收集分包消息。攒齐返回拼好的整条消息，没攒齐返回 null。
   * 同一条消息的各包共用「消息ID + 总包数」，包序号从 1 开始。
   */
  private collectSubpackage(session: Session, frame: Jt808Frame): Jt808Frame | null {
    const { total, index } = frame.subpackage!;
    if (total < 1 || total > MAX_SUBPACKAGES || index < 1 || index > total) {
      this.logger.warn(`bogus subpackage ${index}/${total} for 0x${frame.msgId.toString(16)} from ${session.deviceNo}`);
      return null;
    }
    const key = `${frame.msgId}:${total}`;
    let set = session.partials.get(key);
    const now = Date.now();
    if (set && now - set.at > SUBPACKAGE_TTL_MS) {
      this.logger.warn(`discarding a stale ${set.parts.size}/${total} subpackage set from ${session.deviceNo}`);
      set = undefined;
    }
    if (!set) {
      if (session.partials.size >= MAX_SUBPACKAGE_SETS) session.partials.clear();
      set = { parts: new Map(), at: now, bytes: 0 };
      session.partials.set(key, set);
    }
    if (!set.parts.has(index)) {
      set.bytes += frame.body.length;
      if (set.bytes > MAX_SUBPACKAGE_BYTES) {
        this.logger.warn(`subpackage set for 0x${frame.msgId.toString(16)} from ${session.deviceNo} too large, dropping`);
        session.partials.delete(key);
        return null;
      }
      set.parts.set(index, frame.body);
    }
    set.at = now;
    if (set.parts.size < total) return null;

    session.partials.delete(key);
    const body = Buffer.concat(Array.from({ length: total }, (_, i) => set!.parts.get(i + 1)!));
    this.logger.log(`reassembled 0x${frame.msgId.toString(16)} from ${session.deviceNo}: ${total} packets, ${body.length} bytes`);
    return { ...frame, body, subpackage: undefined };
  }

  /** 返回 false 表示这一帧不该再处理（连接已被判定为异常并关闭） */
  private bindDevice(session: Session, phone: string): boolean {
    const deviceNo = normalizeDeviceNo(phone);
    if (session.deviceNo === deviceNo) { session.phone = phone; return true; }
    if (session.deviceNo) {
      // 真实终端在一条连接里不会换设备号；换号只可能是扫描/伪造，顺带还能借此把别的设备踢下线
      this.logger.warn(`device number changed on one connection (${session.deviceNo} -> ${deviceNo}) from ${session.addr}, closing`);
      session.socket.destroy();
      return false;
    }
    session.phone = phone;
    session.deviceNo = deviceNo;
    const previous = this.byDevice.get(deviceNo);
    if (previous && previous !== session) {
      // 同一设备重连：踢掉旧连接（设备休眠/换基站后重连很常见，不能拒绝新连接，否则真设备会被锁在外面）。
      // 但旧连接刚刚还在正常收发，说明可能有人拿着同一个设备号顶号——记下来以便排查。
      if (Date.now() - previous.lastSeenAt.getTime() < 60_000) {
        this.logger.warn(
          `device ${deviceNo} taken over by ${session.addr} while the previous connection (${previous.addr}) was still active`,
        );
      }
      previous.socket.destroy();
    }
    this.byDevice.set(deviceNo, session);
    this.logger.log(`device ${deviceNo} connected from ${session.addr}`);
    return true;
  }

  private async handleFrame(session: Session, frame: Jt808Frame): Promise<void> {
    const phone = frame.phone;
    const deviceNo = session.deviceNo!;
    const ack = (result: number = AckResult.OK) =>
      this.send(session, buildPlatformAck(phone, this.nextSerial(session), frame.serial, frame.msgId, result));

    // 未登记 / 已停用的设备：任何消息都登记到「未登记设备」列表，保证管理端一定能发现它。
    // （有些固件从别的平台切过来时会跳过注册，直接发心跳或定位；只认注册消息就会永远看不到这台设备）
    // 一律回失败，迫使终端重新走注册流程；登记完成后下一次注册即被接受。
    const device = await this.devices.findByDeviceNo(deviceNo);
    if (!device || !device.enabled) {
      this.noteUnregistered(session, deviceNo, !!device);
      if (frame.msgId === MsgId.REGISTER) {
        this.send(session, buildRegisterAck(phone, this.nextSerial(session), frame.serial, RegisterResult.TERMINAL_NOT_FOUND));
      } else if (frame.msgId !== MsgId.TERMINAL_ACK) {
        ack(AckResult.FAIL);
      }
      // 真实设备登记之后就不会再被拒；连续被拒只可能是拿设备号在试探，断开让它付出重连成本
      if (++session.rejects >= MAX_REJECTS_PER_SESSION) {
        this.logger.warn(`${session.rejects} rejected frames on one connection from ${session.addr}, closing`);
        session.socket.destroy();
      }
      return;
    }
    session.rejects = 0;

    switch (frame.msgId) {
      case MsgId.REGISTER: {
        session.authed = true;
        // 鉴权码沿用厂家平台做法：就是设备号本身
        this.send(session, buildRegisterAck(phone, this.nextSerial(session), frame.serial, RegisterResult.OK, device.deviceNo));
        await this.devices.touch(deviceNo);
        return;
      }
      case MsgId.AUTH: {
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
          if ((await this.devices.ingest(deviceNo, pos, { batch: true, blindZone: batch.blindZone })) === 'stored') stored++;
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

  private noteUnregistered(session: Session, deviceNo: string, disabled: boolean): void {
    const cur = this.unregistered.get(deviceNo);
    if (cur) {
      cur.count++;
      cur.lastAt = new Date();
      cur.addr = session.addr;
      cur.disabled = disabled;
      // 终端会不停重试，日志按次数降频，避免刷屏
      if (cur.count % 50 === 0) {
        this.logger.warn(`${disabled ? 'disabled' : 'unregistered'} device ${deviceNo} still trying (${cur.count}x)`);
      }
      return;
    }
    if (this.unregistered.size >= MAX_UNREGISTERED) {
      const oldest = [...this.unregistered.entries()].sort((a, b) => a[1].lastAt.getTime() - b[1].lastAt.getTime())[0];
      if (oldest) this.unregistered.delete(oldest[0]);
    }
    this.unregistered.set(deviceNo, { deviceNo, addr: session.addr, count: 1, lastAt: new Date(), disabled });
    this.logger.warn(`${disabled ? 'disabled' : 'unregistered'} device ${deviceNo} connected from ${session.addr} — register it in the admin console`);
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
