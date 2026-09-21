import {
  AckResult, MsgId, RegisterResult, ParamId,
  bcdToString, stringToBcd, normalizeDeviceNo,
  escapeBytes, unescapeBytes, xorChecksum,
  decodeFrame, encodeFrame, splitFrames,
  parsePosition, parseBatchPositions, bcdTimeToDate, dateToBcdTime,
  decodeTimezone, encodeTimezone,
  buildPlatformAck, buildRegisterAck, buildTimeSyncAck, buildSetParams, buildReboot,
  realtimeUploadParam, dwordParam, byteParam,
} from './jt808.codec';

// 报文样例全部来自厂家协议文档（信春科技 JT808 V1.54）
const H = (s: string) => Buffer.from(s.replace(/\s+/g, ''), 'hex');
const inner = (s: string) => H(s).subarray(1, -1); // 去掉首尾 7e

describe('JT808 escape / checksum', () => {
  it('escapes per spec example: 30 7e 08 7d 55 -> 30 7d02 08 7d01 55', () => {
    expect(escapeBytes(H('307e087d55'))).toEqual(H('307d02087d0155'));
    expect(unescapeBytes(H('307d02087d0155'))).toEqual(H('307e087d55'));
  });

  it('leaves a trailing lone 0x7d untouched', () => {
    expect(unescapeBytes(H('307d'))).toEqual(H('307d'));
  });

  it('xor checksum matches heartbeat example (0x87)', () => {
    const raw = unescapeBytes(inner('7e00020000999999999118000c877e'));
    expect(xorChecksum(raw.subarray(0, -1))).toBe(0x87);
  });
});

describe('BCD helpers', () => {
  it('round-trips phone numbers with leading zero padding', () => {
    expect(bcdToString(H('051160004464'))).toBe('051160004464');
    expect(stringToBcd('51160004464', 6)).toEqual(H('051160004464'));
    expect(stringToBcd('999999999118', 6)).toEqual(H('999999999118'));
  });

  it('normalizes device numbers (BCD 12-digit vs printed 11-digit)', () => {
    expect(normalizeDeviceNo('051160004464')).toBe('51160004464');
    expect(normalizeDeviceNo(' 5116-0004464 ')).toBe('51160004464');
    expect(normalizeDeviceNo('000')).toBe('0');
  });
});

describe('decodeFrame on vendor examples', () => {
  it('heartbeat 0x0002 (empty body)', () => {
    const f = decodeFrame(inner('7e00020000999999999118000c877e'))!;
    expect(f).toMatchObject({ msgId: MsgId.HEARTBEAT, bodyLength: 0, phone: '999999999118', serial: 0x000c, checksumOk: true });
    expect(f.body.length).toBe(0);
    expect(f.subpackage).toBeUndefined();
  });

  it('terminal general ack 0x0001', () => {
    const f = decodeFrame(inner('7e0001000599999999911800077fbc810300cb7e'))!;
    expect(f.msgId).toBe(MsgId.TERMINAL_ACK);
    expect(f.checksumOk).toBe(true);
    expect(f.body.readUInt16BE(0)).toBe(0x7fbc); // 应答流水号
    expect(f.body.readUInt16BE(2)).toBe(0x8103); // 应答 ID
    expect(f.body[4]).toBe(0);
  });

  it('register 0x0100 carries the device number in the header phone field', () => {
    const f = decodeFrame(inner(
      '7e0100002d0511600044640000002a08523132333435333533333531313600000000000000000000000030303034343634ffd4c14238383838389e7e',
    ))!;
    expect(f.msgId).toBe(MsgId.REGISTER);
    expect(f.phone).toBe('051160004464');
    expect(normalizeDeviceNo(f.phone)).toBe('51160004464');
    expect(f.bodyLength).toBe(0x2d);
    expect(f.body.length).toBe(0x2d);
    expect(f.checksumOk).toBe(true);
    expect(f.body.subarray(4, 9).toString('latin1')).toBe('12345'); // 制造商ID
  });

  it('auth 0x0102 body is the auth code (vendor uses the device number)', () => {
    const f = decodeFrame(inner('7e0102000b051160004464000135313136303030343436346c7e'))!;
    expect(f.msgId).toBe(MsgId.AUTH);
    expect(f.checksumOk).toBe(true);
    expect(f.body.toString('latin1')).toBe('51160004464');
  });

  it('flags a corrupted checksum instead of throwing', () => {
    const f = decodeFrame(inner('7e00020000999999999118000c007e'))!;
    expect(f.checksumOk).toBe(false);
  });

  it('returns null for a truncated header', () => {
    expect(decodeFrame(H('0002000099'))).toBeNull();
  });
});

describe('encodeFrame reproduces vendor platform examples byte-for-byte', () => {
  it('platform ack 0x8001', () => {
    const out = buildPlatformAck('999999999118', 0x85eb, 0x0007, 0x0704, AckResult.OK);
    expect(out).toEqual(H('7e8001000599999999911885eb0007070400677e'));
  });

  it('register ack 0x8100 with auth code = device number', () => {
    const out = buildRegisterAck('051160004464', 0x33ab, 0x0000, RegisterResult.OK, '51160004464');
    expect(out).toEqual(H('7e8100000e05116000446433ab0000003531313630303034343634727e'));
  });

  it('register ack without auth code when rejected', () => {
    const f = decodeFrame(buildRegisterAck('051160004464', 1, 5, RegisterResult.TERMINAL_NOT_FOUND).subarray(1, -1))!;
    expect(f.body).toEqual(H('000504'));
  });

  it('time sync ack 0x8109 (2018-08-22 15:31:12 local)', () => {
    // 文档样例的时间是终端本地时间；用 +8 时区反推 UTC 再编码应得到同一报文
    const localMs = Date.UTC(2018, 7, 22, 15, 31, 12);
    const out = buildTimeSyncAck('777777777943', 0xbbb2, new Date(localMs - 8 * 3600 * 1000), 8);
    expect(out).toEqual(H('7e81090008777777777943bbb207e208160f1f0c00547e'));
  });

  it('escapes 0x7e/0x7d inside the frame (checksum computed before escaping)', () => {
    const body = H('7e7d');
    const frame = encodeFrame(0x8300, '000000000001', 0x7e7d, body);
    // 流水号 7e7d 与消息体 7e7d 都必须转义
    expect(frame.subarray(1, -1).includes(0x7e)).toBe(false);
    const back = decodeFrame(frame.subarray(1, -1))!;
    expect(back.serial).toBe(0x7e7d);
    expect(back.body).toEqual(body);
    expect(back.checksumOk).toBe(true);
  });

  it('rejects oversize bodies', () => {
    expect(() => encodeFrame(0x8300, '1', 0, Buffer.alloc(1024))).toThrow();
  });
});

describe('splitFrames (TCP stream reassembly)', () => {
  const hb = '7e00020000999999999118000c877e';

  it('extracts back-to-back frames and keeps the incomplete tail', () => {
    const buf = H(hb + hb + '7e0002');
    const { frames, rest } = splitFrames(buf);
    expect(frames).toHaveLength(2);
    expect(rest).toEqual(H('7e0002'));
  });

  it('handles a shared single 0x7e between frames', () => {
    const shared = hb + hb.slice(2); // …877e00020000…
    const { frames } = splitFrames(H(shared));
    expect(frames).toHaveLength(2);
    expect(decodeFrame(frames[1])!.msgId).toBe(MsgId.HEARTBEAT);
  });

  it('drops garbage before the first flag and keeps a partial frame', () => {
    const { frames, rest } = splitFrames(H('aabb' + hb.slice(0, 10)));
    expect(frames).toHaveLength(0);
    expect(rest).toEqual(H(hb.slice(0, 10)));
  });

  it('returns empty rest when there is no flag at all', () => {
    const { frames, rest } = splitFrames(H('aabbcc'));
    expect(frames).toHaveLength(0);
    expect(rest.length).toBe(0);
  });
});

describe('parsePosition on the vendor 0x0200 example', () => {
  // 文档样例（缺首 7e，我们直接取消息体）
  const frameHex = '02000048051160004464000d'
    + '00000000' + '000c0002' + '0159885e' + '06cbf344' + '0000' + '0000' + '0000' + '200807180722'
    + '010400000001' + '30011c' + '310109' + 'e4020063' + 'e50100' + 'e60100' + 'e7080000000000000000'
    + 'ee0a01cc01262c009a674300';
  const body = H(frameHex).subarray(12);

  it('decodes the base fields (Shenzhen, GMT+8 -> UTC)', () => {
    const p = parsePosition(body, 8)!;
    expect(body.length).toBe(0x48);
    expect(p.latitude).toBeCloseTo(22.644830, 6);
    expect(p.longitude).toBeCloseTo(114.029380, 6); // 0x06cbf344 = 114029380
    expect(p.fixed).toBe(true);
    expect(p.acc).toBe(false);
    expect(p.speedKmh).toBe(0);
    expect(p.heading).toBe(0);
    expect(p.time.toISOString()).toBe('2020-08-07T10:07:22.000Z'); // 18:07:22 +08
  });

  it('decodes vendor extra-info items', () => {
    const p = parsePosition(body, 8)!;
    expect(p.extras.mileageKm).toBe(0.1);
    expect(p.extras.signalPercent).toBe(0x1c);
    expect(p.extras.satellites).toBe(9);
    expect(p.extras.externalPower).toBe(true); // 状态 0 = 接通外接电源
    expect(p.extras.batteryPercent).toBe(99);
    expect(p.extras.moving).toBe(false);
    expect(p.extras.raw.get(0xee)?.length).toBe(10);
  });

  it('applies south/west sign bits from the status word', () => {
    const b = Buffer.from(body);
    b.writeUInt32BE(0x000c0002 | (1 << 2) | (1 << 3), 4); // 南纬 + 西经
    const p = parsePosition(b, 8)!;
    expect(p.latitude).toBeLessThan(0);
    expect(p.longitude).toBeLessThan(0);
  });

  it('uses the per-connection timezone offset (NZ +12)', () => {
    const p = parsePosition(body, 12)!;
    expect(p.time.toISOString()).toBe('2020-08-07T06:07:22.000Z');
  });

  it('returns null for a body shorter than 28 bytes', () => {
    expect(parsePosition(Buffer.alloc(10), 8)).toBeNull();
  });

  it('ignores a truncated trailing extra item', () => {
    const b = Buffer.concat([body.subarray(0, 28), H('e402')]);
    expect(parsePosition(b, 8)!.extras.batteryPercent).toBeUndefined();
  });
});

describe('0x0704 batch upload', () => {
  it('splits N position items and reports blind-zone flag', () => {
    const item = Buffer.alloc(28);
    item.writeUInt32BE(1 << 1, 4); // fixed
    item.writeUInt32BE(22_000_000, 8);
    item.writeUInt32BE(114_000_000, 12);
    stringToBcd('200807180722', 6).copy(item, 22);
    const lenBuf = Buffer.alloc(2); lenBuf.writeUInt16BE(28, 0);
    const body = Buffer.concat([H('0002'), H('01'), lenBuf, item, lenBuf, item]);
    const r = parseBatchPositions(body);
    expect(r.count).toBe(2);
    expect(r.blindZone).toBe(true);
    expect(r.items).toHaveLength(2);
    expect(parsePosition(r.items[1], 8)!.latitude).toBe(22);
  });

  it('stops at a truncated item without throwing', () => {
    const body = H('0002' + '00' + '001c' + '00');
    expect(parseBatchPositions(body).items).toHaveLength(0);
  });

  it('caps the number of items a single frame can expand into (amplification guard)', () => {
    const item = Buffer.alloc(28);
    const lenBuf = Buffer.alloc(2); lenBuf.writeUInt16BE(28, 0);
    const parts = [H('ffff'), H('00')]; // 声称 65535 个点
    for (let i = 0; i < 400; i++) parts.push(lenBuf, item);
    const r = parseBatchPositions(Buffer.concat(parts));
    expect(r.count).toBe(200);
    expect(r.items.length).toBeLessThanOrEqual(200);
  });
});

describe('oversized frame rejection', () => {
  it('drops a frame whose body is far beyond any legitimate JT808 message', () => {
    // 协议消息体上限 1023 字节；几十 KB 的「一帧」只会是放大攻击
    const header = Buffer.alloc(12);
    header.writeUInt16BE(MsgId.BATCH_POSITION, 0);
    const huge = Buffer.concat([header, Buffer.alloc(60 * 1024, 0x41), Buffer.from([0])]);
    expect(decodeFrame(huge)).toBeNull();
  });

  it('still accepts a large-but-plausible frame', () => {
    const body = Buffer.alloc(1000, 0x42);
    const frame = encodeFrame(MsgId.BATCH_POSITION, '051160004464', 1, body);
    expect(decodeFrame(frame.subarray(1, -1))!.body).toEqual(body);
  });
});

describe('time and timezone helpers', () => {
  it('bcd time round-trips through UTC', () => {
    const d = bcdTimeToDate(H('200807180722'), 8);
    expect(dateToBcdTime(d, 8)).toEqual(H('200807180722'));
    expect(dateToBcdTime(d, 12)).toEqual(H('200807220722'));
  });

  it('decodes the 0x1007 / 0xF142 timezone byte (64 = +8, 65 = -8)', () => {
    expect(decodeTimezone(64)).toBe(8);
    expect(decodeTimezone(65)).toBe(-8);
    expect(decodeTimezone(96)).toBe(12);
    expect(decodeTimezone(0)).toBe(0);
    expect(decodeTimezone(255)).toBeNull();
    expect(encodeTimezone(8)).toBe(64);
    expect(encodeTimezone(-8)).toBe(65);
    expect(encodeTimezone(12)).toBe(96);
    expect(encodeTimezone(5.5)).toBe(44);
  });
});

describe('0x8103 set params / 0x8155 reboot', () => {
  const params = [
    realtimeUploadParam(0, 10),
    dwordParam(ParamId.DEFAULT_TIME_INTERVAL, 10),
    byteParam(ParamId.DEVICE_TIMEZONE, encodeTimezone(12)),
  ];

  it('defaults to the vendor/2011 layout: count + package-count + [id(4) len(1) value]', () => {
    const f = decodeFrame(buildSetParams('051160004464', 1, params).subarray(1, -1))!;
    expect(f.msgId).toBe(MsgId.SET_PARAMS);
    expect(f.checksumOk).toBe(true);
    expect(f.body[0]).toBe(3);
    expect(f.body[1]).toBe(3);
    expect(f.body.subarray(2, 10)).toEqual(H('0000f11503' + '00000a')); // F115, len 3, 定时 10s
    expect(f.body.subarray(10, 19)).toEqual(H('0000002904' + '0000000a')); // 0029, len 4
    expect(f.body.subarray(19, 25)).toEqual(H('0000f14201' + '60')); // F142, len 1, UTC+12
  });

  it('reproduces the vendor 0x8103 example (server host + port, 2011 layout) byte-for-byte', () => {
    const { stringParam } = require('./jt808.codec');
    const out = buildSetParams('613310262184', 0xc1d2, [
      stringParam(ParamId.MAIN_SERVER_HOST, '39.104.62.81'),
      dwordParam(ParamId.MAIN_SERVER_PORT, 7300),
    ]);
    expect(out).toEqual(H('7e8103001c613310262184c1d20202000000130c33392e3130342e36322e3831000000180400001c84cb7e'));
  });

  it('can emit the 2013 layout (no package-count byte)', () => {
    const f = decodeFrame(buildSetParams('051160004464', 1, params, '2013').subarray(1, -1))!;
    expect(f.body[0]).toBe(3);
    expect(f.body.subarray(1, 9)).toEqual(H('0000f11503' + '00000a'));
  });

  it('reboot has an empty body', () => {
    const f = decodeFrame(buildReboot('051160004464', 9).subarray(1, -1))!;
    expect(f.msgId).toBe(MsgId.REBOOT);
    expect(f.body.length).toBe(0);
    expect(f.serial).toBe(9);
  });
});
