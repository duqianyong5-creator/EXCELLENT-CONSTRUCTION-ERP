/**
 * JT/T 808-2013 编解码（信春科技 SLC 终端协议 V1.54 低功耗版）
 *
 * 纯函数、无 IO，便于用协议文档里的报文样例做单元测试。
 *
 * 帧：0x7e | 消息头 | 消息体 | 校验码(1) | 0x7e
 * 转义：0x7e -> 0x7d 0x02，0x7d -> 0x7d 0x01（校验后再转义；收包先还原再校验）
 * 校验：从消息头第一个字节到消息体最后一个字节逐字节异或
 * 字节序：大端
 * 消息头：消息ID(2) | 消息体属性(2) | 终端手机号 BCD[6] | 消息流水号(2) | [分包项 总包数(2) 包序号(2)]
 * 消息体属性：bit0-9 体长度，bit10-12 加密，bit13 分包
 */

export const FLAG = 0x7e;

export const MsgId = {
  // 终端 -> 平台
  TERMINAL_ACK: 0x0001,
  HEARTBEAT: 0x0002,
  LOGOUT: 0x0003,
  REGISTER: 0x0100,
  AUTH: 0x0102,
  ATTRIBUTES: 0x0107,
  TIME_SYNC_REQ: 0x0109,
  POSITION: 0x0200,
  POSITION_QUERY_ACK: 0x0201, // 旧固件对 0x8201 的应答：应答流水号(2) + 位置汇报体
  SLEEP_BATTERY: 0x0210,
  BATCH_POSITION: 0x0704,
  TIMEZONE_SYNC: 0x1007,
  ICCID: 0x1107,
  FAKE_SHUTDOWN_HEARTBEAT: 0x0f02,
  // 平台 -> 终端
  PLATFORM_ACK: 0x8001,
  REGISTER_ACK: 0x8100,
  SET_PARAMS: 0x8103,
  TERMINAL_CONTROL: 0x8105,
  TIME_SYNC_ACK: 0x8109,
  REBOOT: 0x8155,
  POSITION_QUERY: 0x8201,
  TEXT: 0x8300,
} as const;

/** 平台通用应答结果 */
export const AckResult = { OK: 0, FAIL: 1, BAD_MESSAGE: 2, UNSUPPORTED: 3, ALARM_CONFIRMED: 4 } as const;

/** 注册应答结果 */
export const RegisterResult = {
  OK: 0,
  VEHICLE_REGISTERED: 1,
  VEHICLE_NOT_FOUND: 2,
  TERMINAL_REGISTERED: 3,
  TERMINAL_NOT_FOUND: 4,
} as const;

/** 0x8103 终端参数 ID（本次对接会用到的） */
export const ParamId = {
  HEARTBEAT_INTERVAL: 0x0001, // DWORD 秒
  MAIN_SERVER_HOST: 0x0013, // STRING
  MAIN_SERVER_PORT: 0x0018, // DWORD
  REPORT_STRATEGY: 0x0020, // DWORD 0 定时 1 定距
  DEFAULT_TIME_INTERVAL: 0x0029, // DWORD 秒
  GPS_INTERVAL: 0xf110, // DWORD 秒
  REALTIME_UPLOAD_MODE: 0xf115, // BYTE 模式(0 定时/1 定距) + WORD 间隔（10~120s 或 200~1000m）
  SLEEP_INTERVAL_MIN: 0xf117, // DWORD 分钟，0 = 禁止休眠
  DEVICE_TIMEZONE: 0xf142, // BYTE 时区编码
  SLEEP_ACTION: 0xf141, // BYTE 0 心跳 1 断网 2 发定位
  REPORT_WHEN_STATIONARY: 0xf154, // BYTE 0 不报 1 报
} as const;

export interface Jt808Frame {
  msgId: number;
  bodyLength: number;
  encrypted: boolean;
  /** 终端手机号（BCD 12 位字符串，含前导 0） */
  phone: string;
  serial: number;
  subpackage?: { total: number; index: number };
  body: Buffer;
  checksumOk: boolean;
}

// ---------- 基础工具 ----------

export function xorChecksum(buf: Buffer): number {
  let c = 0;
  for (let i = 0; i < buf.length; i++) c ^= buf[i];
  return c;
}

/** 收包：还原转义（输入不含首尾 0x7e） */
export function unescapeBytes(buf: Buffer): Buffer {
  const out: number[] = [];
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0x7d && i + 1 < buf.length) {
      const n = buf[i + 1];
      if (n === 0x02) { out.push(0x7e); i++; continue; }
      if (n === 0x01) { out.push(0x7d); i++; continue; }
    }
    out.push(b);
  }
  return Buffer.from(out);
}

/** 发包：转义（输入不含首尾 0x7e） */
export function escapeBytes(buf: Buffer): Buffer {
  const out: number[] = [];
  for (const b of buf) {
    if (b === 0x7e) out.push(0x7d, 0x02);
    else if (b === 0x7d) out.push(0x7d, 0x01);
    else out.push(b);
  }
  return Buffer.from(out);
}

export function bcdToString(buf: Buffer): string {
  let s = '';
  for (const b of buf) s += ((b >> 4) & 0x0f).toString() + (b & 0x0f).toString();
  return s;
}

/** 数字串 -> BCD，左侧补 0 到指定字节数 */
export function stringToBcd(digits: string, bytes: number): Buffer {
  const clean = digits.replace(/\D/g, '').slice(-bytes * 2).padStart(bytes * 2, '0');
  const out = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i++) {
    out[i] = (parseInt(clean[i * 2], 10) << 4) | parseInt(clean[i * 2 + 1], 10);
  }
  return out;
}

/** 设备号归一化：去掉非数字与前导 0（BCD 12 位 与 设备上印的 11 位 号可互相匹配） */
export function normalizeDeviceNo(input: string): string {
  const digits = String(input ?? '').replace(/\D/g, '');
  return digits.replace(/^0+/, '') || '0';
}

// ---------- 帧解析 / 组装 ----------

/**
 * 解析一帧（输入为两个 0x7e 之间的原始字节，仍带转义）。
 * 头部不完整或长度不符返回 null；校验码不符也返回帧但 checksumOk=false，由上层决定是否丢弃。
 */
/**
 * 消息体上限。协议里消息体长度只有 10 位（≤1023），这里放宽到 8KB 容忍厂家固件不严谨，
 * 但绝不接受几十 KB 的巨帧——那不是真实终端会发的，只会是放大攻击。
 */
export const MAX_BODY_BYTES = 8 * 1024;
/** 单个 0x0704 批量帧最多解析多少个点 */
export const MAX_BATCH_ITEMS = 200;

export function decodeFrame(escaped: Buffer): Jt808Frame | null {
  const raw = unescapeBytes(escaped);
  if (raw.length < 12 + 1) return null; // 最短：12 字节头 + 1 校验
  if (raw.length > MAX_BODY_BYTES + 32) return null; // 巨帧直接丢弃
  const msgId = raw.readUInt16BE(0);
  const props = raw.readUInt16BE(2);
  const bodyLength = props & 0x03ff;
  const encrypted = ((props >> 10) & 0x07) !== 0;
  const hasSub = (props & 0x2000) !== 0;
  const phone = bcdToString(raw.subarray(4, 10));
  const serial = raw.readUInt16BE(10);
  let offset = 12;
  let subpackage: Jt808Frame['subpackage'];
  if (hasSub) {
    if (raw.length < offset + 4 + 1) return null;
    subpackage = { total: raw.readUInt16BE(offset), index: raw.readUInt16BE(offset + 2) };
    offset += 4;
  }
  // 实际体长度以帧为准（个别厂家样例的长度字段不准），但不能超过声明 + 校验
  const payload = raw.subarray(0, raw.length - 1);
  const checksum = raw[raw.length - 1];
  const body = raw.subarray(offset, raw.length - 1);
  return {
    msgId,
    bodyLength,
    encrypted,
    phone,
    serial,
    subpackage,
    body,
    checksumOk: xorChecksum(payload) === checksum,
  };
}

/** 组装一帧（含首尾 0x7e，已转义） */
export function encodeFrame(msgId: number, phone: string, serial: number, body: Buffer = Buffer.alloc(0)): Buffer {
  if (body.length > 0x03ff) throw new Error(`JT808 body too long: ${body.length}`);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(msgId, 0);
  header.writeUInt16BE(body.length & 0x03ff, 2);
  stringToBcd(phone, 6).copy(header, 4);
  header.writeUInt16BE(serial & 0xffff, 10);
  const payload = Buffer.concat([header, body]);
  const withSum = Buffer.concat([payload, Buffer.from([xorChecksum(payload)])]);
  return Buffer.concat([Buffer.from([FLAG]), escapeBytes(withSum), Buffer.from([FLAG])]);
}

/**
 * 组装分包消息中的一包（消息体属性 bit13=1，消息头后面多 4 字节：总包数 + 包序号）。
 * 主要给测试和将来下发长消息用；上行的分包由网关负责重组。
 */
export function encodeSubFrame(
  msgId: number, phone: string, serial: number, total: number, index: number, body: Buffer,
): Buffer {
  const header = Buffer.alloc(16);
  header.writeUInt16BE(msgId, 0);
  header.writeUInt16BE((body.length & 0x03ff) | 0x2000, 2);
  stringToBcd(phone, 6).copy(header, 4);
  header.writeUInt16BE(serial & 0xffff, 10);
  header.writeUInt16BE(total & 0xffff, 12);
  header.writeUInt16BE(index & 0xffff, 14);
  const payload = Buffer.concat([header, body]);
  const withSum = Buffer.concat([payload, Buffer.from([xorChecksum(payload)])]);
  return Buffer.concat([Buffer.from([FLAG]), escapeBytes(withSum), Buffer.from([FLAG])]);
}

/**
 * 从 TCP 流缓冲区中切出完整帧（两个 0x7e 之间的内容）。
 * 兼容 "…7e7e…"（连发）与共享单个 7e 的情况；返回剩余未完成数据。
 */
export function splitFrames(buffer: Buffer): { frames: Buffer[]; rest: Buffer } {
  const frames: Buffer[] = [];
  let start = -1;
  let i = 0;
  while (i < buffer.length) {
    if (buffer[i] === FLAG) {
      if (start >= 0 && i > start + 1) {
        frames.push(buffer.subarray(start + 1, i));
        start = i; // 允许共享 7e 作为下一帧起始
      } else {
        start = i;
      }
    }
    i++;
  }
  if (start < 0) return { frames, rest: Buffer.alloc(0) }; // 全是垃圾，丢弃
  return { frames, rest: buffer.subarray(start) };
}

// ---------- 0x0200 位置汇报 ----------

export interface PositionExtras {
  mileageKm?: number; // 0x01
  fuelL?: number; // 0x02
  signalPercent?: number; // 0x30
  satellites?: number; // 0x31
  batteryPercent?: number; // 0xE4
  externalPower?: boolean; // 0xE4 状态 0=接通外电
  moving?: boolean; // 0xE5
  alarmExt?: Buffer; // 0xE7 8 字节
  voltage?: number; // 0xF0 0.01V
  currentMa?: number; // 0xF1
  gpsSatellites?: number; // 0xF2
  networkType?: '2G' | '4G'; // 0xF5
  imei?: string; // 0xF6
  raw: Map<number, Buffer>;
}

export interface Position {
  alarm: number;
  status: number;
  acc: boolean;
  fixed: boolean;
  moving: boolean; // 状态位 bit22
  latitude: number;
  longitude: number;
  altitude: number;
  speedKmh: number;
  heading: number;
  /** 终端上报时间（已按 tzOffsetHours 换算为 UTC） */
  time: Date;
  extras: PositionExtras;
}

/** 解析 BCD[6] YYMMDDhhmmss（终端本地时区）为 UTC */
export function bcdTimeToDate(buf: Buffer, tzOffsetHours: number): Date {
  const s = bcdToString(buf);
  const yy = +s.slice(0, 2), mm = +s.slice(2, 4), dd = +s.slice(4, 6);
  const hh = +s.slice(6, 8), mi = +s.slice(8, 10), ss = +s.slice(10, 12);
  const utcMs = Date.UTC(2000 + yy, mm - 1, dd, hh, mi, ss) - tzOffsetHours * 3600 * 1000;
  return new Date(utcMs);
}

/** Date(UTC) -> 终端本地时区 BCD[6] */
export function dateToBcdTime(date: Date, tzOffsetHours: number): Buffer {
  const local = new Date(date.getTime() + tzOffsetHours * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  const s = p(local.getUTCFullYear() % 100) + p(local.getUTCMonth() + 1) + p(local.getUTCDate())
    + p(local.getUTCHours()) + p(local.getUTCMinutes()) + p(local.getUTCSeconds());
  return stringToBcd(s, 6);
}

export function parseExtras(buf: Buffer): PositionExtras {
  const raw = new Map<number, Buffer>();
  const ex: PositionExtras = { raw };
  let i = 0;
  while (i + 2 <= buf.length) {
    const id = buf[i];
    const len = buf[i + 1];
    const val = buf.subarray(i + 2, i + 2 + len);
    if (val.length < len) break; // 截断，忽略残余
    raw.set(id, val);
    switch (id) {
      case 0x01: if (len >= 4) ex.mileageKm = val.readUInt32BE(0) / 10; break;
      case 0x02: if (len >= 2) ex.fuelL = val.readUInt16BE(0) / 10; break;
      case 0x30: if (len >= 1) ex.signalPercent = val[0]; break;
      case 0x31: if (len >= 1) ex.satellites = val[0]; break;
      case 0xe4:
        if (len >= 2) { ex.externalPower = val[0] === 0; ex.batteryPercent = val[1]; }
        break;
      case 0xe5: if (len >= 1) ex.moving = val[0] === 1; break;
      case 0xe7: ex.alarmExt = Buffer.from(val); break;
      case 0xf0: if (len >= 2) ex.voltage = val.readUInt16BE(0) / 100; break;
      case 0xf1: if (len >= 2) ex.currentMa = val.readUInt16BE(0); break;
      case 0xf2: if (len >= 1) ex.gpsSatellites = val[0]; break;
      case 0xf5: if (len >= 1) ex.networkType = val[0] === 1 ? '4G' : '2G'; break;
      case 0xf6: if (len >= 8) ex.imei = bcdToString(val.subarray(0, 8)).replace(/^0+/, ''); break;
      default: break;
    }
    i += 2 + len;
  }
  return ex;
}

/** 解析 0x0200 消息体（也用于 0x0704 里的每一项） */
export function parsePosition(body: Buffer, tzOffsetHours: number): Position | null {
  if (body.length < 28) return null;
  const alarm = body.readUInt32BE(0);
  const status = body.readUInt32BE(4);
  const latRaw = body.readUInt32BE(8) / 1e6;
  const lngRaw = body.readUInt32BE(12) / 1e6;
  const south = (status & (1 << 2)) !== 0;
  const west = (status & (1 << 3)) !== 0;
  return {
    alarm,
    status,
    acc: (status & 1) !== 0,
    fixed: (status & (1 << 1)) !== 0,
    moving: (status & (1 << 22)) !== 0,
    latitude: south ? -latRaw : latRaw,
    longitude: west ? -lngRaw : lngRaw,
    altitude: body.readUInt16BE(16),
    speedKmh: body.readUInt16BE(18) / 10,
    heading: body.readUInt16BE(20),
    time: bcdTimeToDate(body.subarray(22, 28), tzOffsetHours),
    extras: parseExtras(body.subarray(28)),
  };
}

/**
 * 解析 0x0704 定位数据批量上传：返回每一项的 0x0200 消息体。
 *
 * declared 是设备自己声明的点数，count 是实际解析上限（受 MAX_BATCH_ITEMS 约束）。
 * 两者必须都返回：只返回收敛后的 count，调用方就永远看不出「这次补传被截断了」，
 * 而平台已经回了 OK，终端会把本地缓存删掉——丢的点找不回来。
 */
export function parseBatchPositions(body: Buffer): { count: number; declared: number; blindZone: boolean; items: Buffer[] } {
  if (body.length < 3) return { count: 0, declared: 0, blindZone: false, items: [] };
  const declared = body.readUInt16BE(0);
  const count = Math.min(declared, MAX_BATCH_ITEMS);
  const blindZone = body[2] === 1;
  const items: Buffer[] = [];
  let i = 3;
  while (i + 2 <= body.length && items.length < count) {
    const len = body.readUInt16BE(i);
    const item = body.subarray(i + 2, i + 2 + len);
    if (item.length < len) break;
    items.push(item);
    i += 2 + len;
  }
  return { count, declared, blindZone, items };
}

// ---------- 0x1007 时区 ----------

/**
 * 时区编码：值 = 时区 * 4 << 1，最低位 0 东区 / 1 西区。例：64 = 东八区，65 = 西八区。
 * 返回小时偏移（东正西负）；解析失败返回 null。
 */
export function decodeTimezone(byte: number): number | null {
  if (!Number.isInteger(byte) || byte < 0 || byte > 255) return null;
  const west = (byte & 1) === 1;
  const hours = (byte >> 1) / 4;
  if (hours > 14) return null;
  return west ? -hours : hours;
}

export function encodeTimezone(offsetHours: number): number {
  const west = offsetHours < 0;
  return ((Math.round(Math.abs(offsetHours) * 4)) << 1) | (west ? 1 : 0);
}

// ---------- 平台下行报文 ----------

export function buildPlatformAck(phone: string, serial: number, replySerial: number, replyMsgId: number, result: number = AckResult.OK): Buffer {
  const body = Buffer.alloc(5);
  body.writeUInt16BE(replySerial & 0xffff, 0);
  body.writeUInt16BE(replyMsgId & 0xffff, 2);
  body[4] = result;
  return encodeFrame(MsgId.PLATFORM_ACK, phone, serial, body);
}

export function buildRegisterAck(phone: string, serial: number, replySerial: number, result: number, authCode?: string): Buffer {
  const head = Buffer.alloc(3);
  head.writeUInt16BE(replySerial & 0xffff, 0);
  head[2] = result;
  const body = result === RegisterResult.OK && authCode
    ? Buffer.concat([head, Buffer.from(authCode.slice(0, 20), 'latin1')])
    : head;
  return encodeFrame(MsgId.REGISTER_ACK, phone, serial, body);
}

/** 0x8109 请求同步时间应答：年(2) 月 日 时 分 秒 结果 —— 以终端本地时区时间下发 */
export function buildTimeSyncAck(phone: string, serial: number, now: Date, tzOffsetHours: number): Buffer {
  const local = new Date(now.getTime() + tzOffsetHours * 3600 * 1000);
  const body = Buffer.alloc(8);
  body.writeUInt16BE(local.getUTCFullYear(), 0);
  body[2] = local.getUTCMonth() + 1;
  body[3] = local.getUTCDate();
  body[4] = local.getUTCHours();
  body[5] = local.getUTCMinutes();
  body[6] = local.getUTCSeconds();
  body[7] = AckResult.OK;
  return encodeFrame(MsgId.TIME_SYNC_ACK, phone, serial, body);
}

export interface ParamItem { id: number; value: Buffer }

export function dwordParam(id: number, value: number): ParamItem {
  const b = Buffer.alloc(4); b.writeUInt32BE(value >>> 0, 0); return { id, value: b };
}
export function byteParam(id: number, value: number): ParamItem {
  return { id, value: Buffer.from([value & 0xff]) };
}
export function stringParam(id: number, value: string): ParamItem {
  return { id, value: Buffer.from(value, 'latin1') };
}
/** 0xF115 实时定位上传模式：mode 0 定时(秒 10~120) / 1 定距(米 200~1000) */
export function realtimeUploadParam(mode: 0 | 1, interval: number): ParamItem {
  const b = Buffer.alloc(3); b[0] = mode; b.writeUInt16BE(interval & 0xffff, 1);
  return { id: ParamId.REALTIME_UPLOAD_MODE, value: b };
}

export type SetParamsLayout = '2011' | '2013';

/**
 * 0x8103 设置终端参数：参数总数(1) + [包参数个数(1)，仅 2011 版] + 参数项列表 [ID(4) 长度(1) 值]。
 * 厂家协议的下发样例（02 02 00000013 …）以及参数 0xF156「当前协议」默认值 1 = jt808-2011 都表明
 * 这批设备默认按 2011 版布局解析，因此默认用 2011 版；设备切到 2013 版后可传 layout='2013'。
 */
export function buildSetParams(phone: string, serial: number, params: ParamItem[], layout: SetParamsLayout = '2011'): Buffer {
  const count = params.length & 0xff;
  const parts: Buffer[] = [layout === '2011' ? Buffer.from([count, count]) : Buffer.from([count])];
  for (const p of params) {
    const head = Buffer.alloc(5);
    head.writeUInt32BE(p.id >>> 0, 0);
    head[4] = p.value.length & 0xff;
    parts.push(head, p.value);
  }
  return encodeFrame(MsgId.SET_PARAMS, phone, serial, Buffer.concat(parts));
}

/** 0x8105 终端控制（命令字 4 = 复位/重启，3 = 关机，5 = 恢复出厂） */
export function buildTerminalControl(phone: string, serial: number, command: number): Buffer {
  return encodeFrame(MsgId.TERMINAL_CONTROL, phone, serial, Buffer.from([command & 0xff]));
}

/** 0x8155 一键重启（消息体为空） */
export function buildReboot(phone: string, serial: number): Buffer {
  return encodeFrame(MsgId.REBOOT, phone, serial);
}

/** 0x8201 位置信息查询（消息体为空；终端回复 0x0001 并上传一条 0x0200） */
export function buildPositionQuery(phone: string, serial: number): Buffer {
  return encodeFrame(MsgId.POSITION_QUERY, phone, serial);
}

export function hex(buf: Buffer): string {
  return buf.toString('hex');
}
