import * as net from 'net';
import { Logger, NotFoundException } from '@nestjs/common';
import { Jt808Server } from './jt808.server';
import {
  MsgId, RegisterResult, AckResult,
  Jt808Frame, decodeFrame, encodeFrame, splitFrames, stringToBcd,
} from './jt808.codec';

const H = (s: string) => Buffer.from(s.replace(/\s+/g, ''), 'hex');
const KNOWN = '051160004464'; // 厂家样例里的设备（BCD 12 位）
const KNOWN_NO = '51160004464';

// 厂家协议文档样例报文
const REGISTER_KNOWN = H('7e0100002d0511600044640000002a08523132333435333533333531313600000000000000000000000030303034343634ffd4c14238383838389e7e');
const AUTH_KNOWN = H('7e0102000b051160004464000135313136303030343436346c7e');
const HEARTBEAT = encodeFrame(MsgId.HEARTBEAT, KNOWN, 0x0c);
const POSITION_BODY = H(
  '00000000' + '000c0002' + '0159885e' + '06cbf344' + '0000' + '0000' + '0000' + '200807180722'
  + '010400000001' + '30011c' + '310109' + 'e4020063' + 'e50100' + 'e60100' + 'e7080000000000000000'
  + 'ee0a01cc01262c009a674300',
);
const POSITION_KNOWN = encodeFrame(MsgId.POSITION, KNOWN, 0x0d, POSITION_BODY);

/** 测试客户端：收集并按消息 ID 等待服务器下行帧 */
function client(port: number) {
  const socket = net.connect({ port, host: '127.0.0.1' });
  let buf: Buffer = Buffer.alloc(0);
  const frames: Jt808Frame[] = [];
  const waiters: Array<() => void> = [];
  socket.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    const { frames: raws, rest } = splitFrames(buf);
    buf = rest;
    for (const r of raws) { const f = decodeFrame(r); if (f) frames.push(f); }
    waiters.splice(0).forEach((w) => w());
  });
  const ready = new Promise<void>((res, rej) => { socket.once('connect', () => res()); socket.once('error', rej); });
  const waitFor = (msgId: number, timeoutMs = 3000): Promise<Jt808Frame> => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting 0x${msgId.toString(16)}`)), timeoutMs);
    const check = () => {
      const idx = frames.findIndex((f) => f.msgId === msgId);
      if (idx >= 0) { clearTimeout(timer); resolve(frames.splice(idx, 1)[0]); return true; }
      return false;
    };
    if (!check()) waiters.push(() => { check(); });
  });
  return { socket, ready, waitFor, frames };
}

const flush = () => new Promise((r) => setTimeout(r, 60));

describe('Jt808Server (TCP gateway)', () => {
  let server: Jt808Server;
  let port: number;
  let devices: any;

  beforeAll(async () => {
    Logger.overrideLogger(false);
    devices = {
      findByDeviceNo: jest.fn(async (no: string) =>
        no === KNOWN_NO ? { id: 'dev1', deviceNo: KNOWN_NO, enabled: true, vehiclePlate: 'ABC123' } : null),
      touch: jest.fn(async () => undefined),
      ingest: jest.fn(async () => 'stored'),
    };
    const config = { get: jest.fn(() => undefined) };
    server = new Jt808Server(config as any, devices as any);
    port = await server.start(0, '127.0.0.1');
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(() => {
    devices.ingest.mockClear();
    devices.touch.mockClear();
  });

  it('registers a known device and replies 0x8100 OK with auth code = device number', async () => {
    const c = client(port);
    await c.ready;
    c.socket.write(REGISTER_KNOWN);
    const ack = await c.waitFor(MsgId.REGISTER_ACK);
    expect(ack.phone).toBe(KNOWN);
    expect(ack.body.readUInt16BE(0)).toBe(0); // 对应注册流水号
    expect(ack.body[2]).toBe(RegisterResult.OK);
    expect(ack.body.subarray(3).toString('latin1')).toBe(KNOWN_NO);
    expect(server.getOnline().map((o) => o.deviceNo)).toContain(KNOWN_NO);
    expect(server.isOnline(KNOWN_NO)).toBe(true);
    c.socket.destroy();
    await flush();
    expect(server.isOnline(KNOWN_NO)).toBe(false);
  });

  it('rejects an unregistered device with result 4 and records the attempt for onboarding', async () => {
    const c = client(port);
    await c.ready;
    const body = decodeFrame(REGISTER_KNOWN.subarray(1, -1))!.body;
    c.socket.write(encodeFrame(MsgId.REGISTER, '000012345678', 7, body));
    const ack = await c.waitFor(MsgId.REGISTER_ACK);
    expect(ack.body.readUInt16BE(0)).toBe(7);
    expect(ack.body[2]).toBe(RegisterResult.TERMINAL_NOT_FOUND);
    expect(ack.body.length).toBe(3); // 失败不带鉴权码
    const attempt = server.getUnregistered().find((u) => u.deviceNo === '12345678');
    expect(attempt).toBeDefined();
    expect(attempt!.count).toBe(1);
    server.clearUnregistered('12345678');
    expect(server.getUnregistered().find((u) => u.deviceNo === '12345678')).toBeUndefined();
    c.socket.destroy();
  });

  it('acks auth + heartbeat with 0x8001 and touches the device', async () => {
    const c = client(port);
    await c.ready;
    c.socket.write(AUTH_KNOWN);
    const a1 = await c.waitFor(MsgId.PLATFORM_ACK);
    expect(a1.body.readUInt16BE(0)).toBe(1); // 鉴权帧流水号
    expect(a1.body.readUInt16BE(2)).toBe(MsgId.AUTH);
    expect(a1.body[4]).toBe(AckResult.OK);

    c.socket.write(HEARTBEAT);
    const a2 = await c.waitFor(MsgId.PLATFORM_ACK);
    expect(a2.body.readUInt16BE(2)).toBe(MsgId.HEARTBEAT);
    await flush();
    expect(devices.touch).toHaveBeenCalledWith(KNOWN_NO);
    c.socket.destroy();
  });

  it('auth from an unknown device is answered with FAIL so the terminal re-registers', async () => {
    const c = client(port);
    await c.ready;
    c.socket.write(encodeFrame(MsgId.AUTH, '000012345678', 2, Buffer.from('12345678', 'latin1')));
    const a = await c.waitFor(MsgId.PLATFORM_ACK);
    expect(a.body[4]).toBe(AckResult.FAIL);
    c.socket.destroy();
  });

  it('discovers a device that skips registration and goes straight to heartbeat/position', async () => {
    // 有些固件从别的平台切过来时不重新注册，只认注册消息就永远看不到这台设备
    const c = client(port);
    await c.ready;
    c.socket.write(encodeFrame(MsgId.HEARTBEAT, '000087654321', 1));
    const hb = await c.waitFor(MsgId.PLATFORM_ACK);
    expect(hb.body[4]).toBe(AckResult.FAIL); // 回失败，逼它重新注册

    c.socket.write(encodeFrame(MsgId.POSITION, '000087654321', 2, POSITION_BODY));
    const pos = await c.waitFor(MsgId.PLATFORM_ACK);
    expect(pos.body[4]).toBe(AckResult.FAIL);
    await flush();
    expect(devices.ingest).not.toHaveBeenCalled(); // 未登记设备的点不入库

    const attempt = server.getUnregistered().find((u) => u.deviceNo === '87654321');
    expect(attempt).toMatchObject({ count: 2, disabled: false });
    server.clearUnregistered('87654321');
    c.socket.destroy();
  });

  it('flags a registered-but-disabled device separately from an unknown one', async () => {
    devices.findByDeviceNo.mockImplementationOnce(async () => ({ id: 'dev9', deviceNo: '55555555555', enabled: false }));
    const c = client(port);
    await c.ready;
    c.socket.write(encodeFrame(MsgId.HEARTBEAT, '055555555555', 1));
    await c.waitFor(MsgId.PLATFORM_ACK);
    expect(server.getUnregistered().find((u) => u.deviceNo === '55555555555')).toMatchObject({ disabled: true });
    server.clearUnregistered('55555555555');
    c.socket.destroy();
  });

  it('closes a connection that never sends a valid frame (no session slot squatting)', async () => {
    // 握手超时是 30s，这里只验证连接建立后仍未发帧时 frames 计数为 0、服务器未把它当设备
    const c = client(port);
    await c.ready;
    await flush();
    expect(server.getOnline().some((o) => o.addr === `127.0.0.1:${(c.socket as any).localPort}`)).toBe(false);
    c.socket.destroy();
  });

  it('acks a position report and hands the parsed point to the device service', async () => {
    const c = client(port);
    await c.ready;
    c.socket.write(POSITION_KNOWN);
    const a = await c.waitFor(MsgId.PLATFORM_ACK);
    expect(a.body.readUInt16BE(0)).toBe(0x0d);
    expect(a.body.readUInt16BE(2)).toBe(MsgId.POSITION);
    await flush();
    expect(devices.ingest).toHaveBeenCalledTimes(1);
    const [no, pos] = devices.ingest.mock.calls[0];
    expect(no).toBe(KNOWN_NO);
    expect(pos.latitude).toBeCloseTo(22.64483, 5);
    expect(pos.longitude).toBeCloseTo(114.02938, 5);
    expect(pos.fixed).toBe(true);
    expect(pos.time.toISOString()).toBe('2020-08-07T10:07:22.000Z'); // 默认 UTC+8
    expect(pos.extras.batteryPercent).toBe(99);
    c.socket.destroy();
  });

  it('applies the timezone announced by 0x1007 to later positions', async () => {
    const c = client(port);
    await c.ready;
    c.socket.write(encodeFrame(MsgId.TIMEZONE_SYNC, KNOWN, 3, Buffer.from([96, 0, 0, 0]))); // 96 = UTC+12
    await c.waitFor(MsgId.PLATFORM_ACK);
    c.socket.write(POSITION_KNOWN);
    await c.waitFor(MsgId.PLATFORM_ACK);
    await flush();
    const pos = devices.ingest.mock.calls[0][1];
    expect(pos.time.toISOString()).toBe('2020-08-07T06:07:22.000Z');
    expect(server.getOnline().find((o) => o.deviceNo === KNOWN_NO)!.tzOffset).toBe(12);
    c.socket.destroy();
  });

  it('replies 0x8109 to a time-sync request with the device-local time', async () => {
    const c = client(port);
    await c.ready;
    c.socket.write(encodeFrame(MsgId.TIME_SYNC_REQ, KNOWN, 5));
    const r = await c.waitFor(MsgId.TIME_SYNC_ACK);
    expect(r.body.length).toBe(8);
    const local = new Date(Date.now() + 8 * 3600 * 1000);
    expect(r.body.readUInt16BE(0)).toBe(local.getUTCFullYear());
    expect(r.body[2]).toBe(local.getUTCMonth() + 1); // body: 年(2) 月 日 时 分 秒 结果
    expect(r.body[7]).toBe(AckResult.OK);
    c.socket.destroy();
  });

  it('parses a legacy 0x0201 position-query reply (serial + position body)', async () => {
    const c = client(port);
    await c.ready;
    const body = Buffer.concat([H('0011'), POSITION_BODY]);
    c.socket.write(encodeFrame(MsgId.POSITION_QUERY_ACK, KNOWN, 0x21, body));
    const a = await c.waitFor(MsgId.PLATFORM_ACK);
    expect(a.body.readUInt16BE(2)).toBe(MsgId.POSITION_QUERY_ACK);
    await flush();
    expect(devices.ingest).toHaveBeenCalledTimes(1);
    expect(devices.ingest.mock.calls[0][1].latitude).toBeCloseTo(22.64483, 5);
    c.socket.destroy();
  });

  it('ingests every item of a 0x0704 batch upload as batch', async () => {
    const c = client(port);
    await c.ready;
    const len = Buffer.alloc(2); len.writeUInt16BE(POSITION_BODY.length, 0);
    const body = Buffer.concat([H('0002'), H('01'), len, POSITION_BODY, len, POSITION_BODY]);
    c.socket.write(encodeFrame(MsgId.BATCH_POSITION, KNOWN, 9, body));
    const a = await c.waitFor(MsgId.PLATFORM_ACK);
    expect(a.body.readUInt16BE(2)).toBe(MsgId.BATCH_POSITION);
    await flush();
    expect(devices.ingest).toHaveBeenCalledTimes(2);
    expect(devices.ingest.mock.calls[1][2]).toEqual({ batch: true });
    c.socket.destroy();
  });

  it('survives garbage, bad checksums and split frames, then keeps serving', async () => {
    const c = client(port);
    await c.ready;
    c.socket.write(H('00ff7e12'));
    c.socket.write(H('7e00020000999999999118000c007e')); // 校验错
    await flush();
    expect(devices.touch).not.toHaveBeenCalled();
    // 一帧拆成两段发送
    c.socket.write(HEARTBEAT.subarray(0, 6));
    await flush();
    c.socket.write(HEARTBEAT.subarray(6));
    const a = await c.waitFor(MsgId.PLATFORM_ACK);
    expect(a.body.readUInt16BE(2)).toBe(MsgId.HEARTBEAT);
    c.socket.destroy();
  });

  it('sends platform commands to the live session and refuses when offline', async () => {
    const c = client(port);
    await c.ready;
    c.socket.write(HEARTBEAT);
    await c.waitFor(MsgId.PLATFORM_ACK);

    server.setRealtimeMode(KNOWN_NO, 10, 12);
    const set = await c.waitFor(MsgId.SET_PARAMS);
    expect(set.phone).toBe(KNOWN);
    expect(set.body[0]).toBe(7); // 参数总数
    expect(set.body[1]).toBe(7); // 包参数个数（2011 版布局，与厂家样例一致）
    expect(set.body.subarray(2, 6).readUInt32BE(0)).toBe(0xf117); // 第一项：禁止休眠

    server.queryPosition(KNOWN_NO);
    expect((await c.waitFor(MsgId.POSITION_QUERY)).body.length).toBe(0);

    server.reboot(KNOWN_NO);
    expect((await c.waitFor(MsgId.REBOOT)).msgId).toBe(MsgId.REBOOT);

    c.socket.destroy();
    await flush();
    expect(() => server.reboot(KNOWN_NO)).toThrow(NotFoundException);
  });

  it('replaces a stale session when the same device reconnects', async () => {
    const c1 = client(port);
    await c1.ready;
    c1.socket.write(HEARTBEAT);
    await c1.waitFor(MsgId.PLATFORM_ACK);
    const closed = new Promise<void>((r) => c1.socket.once('close', () => r()));

    const c2 = client(port);
    await c2.ready;
    c2.socket.write(HEARTBEAT);
    await c2.waitFor(MsgId.PLATFORM_ACK);
    await closed; // 旧连接被踢
    expect(server.getOnline().filter((o) => o.deviceNo === KNOWN_NO)).toHaveLength(1);
    c2.socket.destroy();
  });

  it('drops a connection that floods without frame delimiters', async () => {
    const c = client(port);
    await c.ready;
    const closed = new Promise<void>((r) => c.socket.once('close', () => r()));
    // 一个起始 7e 后面跟 70KB 永不结束的数据：必须触发缓冲上限并断开（纯垃圾无 7e 会被直接丢弃、不占内存）
    c.socket.write(Buffer.concat([Buffer.from([0x7e]), Buffer.alloc(70 * 1024, 0x11)]));
    await closed;
  });
});
