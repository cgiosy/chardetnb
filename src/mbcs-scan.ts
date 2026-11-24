import { mbcsModel, scratch } from "./model.js";

export const scanMbcs = (
  m: number,
  data: Uint8Array,
  i: number,
  stop: number,
  n: number,
): number => {
  switch (m) {
    case M_SJIS:
      return scanSjis(data, i, stop, n);
    case M_EUCJP:
      return scanEucJp(data, i, stop, n);
    case M_EUCKR:
      return scanEucKr(data, i, stop, n);
    case M_CP949:
      return scanCp949(data, i, stop, n);
    case M_GB18030:
      return scanGb18030(data, i, stop, n);
    default:
      return scanBig5(data, i, stop, n);
  }
};

const scanSjis = (data: Uint8Array, i: number, stop: number, n: number): number => {
  i = i | 0;
  stop = stop | 0;
  n = n | 0;
  const hoff = HOFF[M_SJIS];
  const mul = HMUL[M_SJIS];
  let nat = 0,
    chars = 0,
    d0 = 0,
    trail = 0,
    extra = 0;
  while (i < stop) {
    const b0 = data[i];
    if (b0 < 0x80) {
      i = (i + 1) | 0;
      continue;
    }
    if (b0 >= 0xa1 && b0 <= 0xdf) {
      nat = (nat + 1) | 0;
      chars = (chars + 1) | 0;
      extra = (extra - 1) | 0;
      i = (i + 1) | 0;
      continue;
    }
    if (!((b0 >= 0x81 && b0 <= 0x9f) || (b0 >= 0xe0 && b0 <= 0xef)) || ((i + 1) | 0) >= n)
      return -1;
    const b1 = data[(i + 1) | 0];
    const tc = TRAIL_CLASS[M_SJIS * 256 + b1];
    if ((tc & 1) === 0) return -1;
    trail = (trail + (tc >>> 1)) | 0;
    const nw = NATW[M_SJIS * 256 + b0];
    nat = (nat + ((((b1 - (nw & 255)) | ((nw >>> 8) - b1)) >>> 31) ^ 1)) | 0;
    chars = (chars + 1) | 0;
    const code = (b0 << 8) | b1;
    const kv = HKD0[(hoff + (Math.imul(code, mul) >>> HSHIFT)) | 0];
    d0 = (d0 + (((kv << 16) >> 16) & ((((kv >>> 16) ^ code) - 1) >> 31))) | 0;
    i = (i + 2) | 0;
  }
  addState(M_SJIS, nat, chars, d0, 0, trail, extra);
  return i;
};

const scanEucJp = (data: Uint8Array, i: number, stop: number, n: number): number => {
  i = i | 0;
  stop = stop | 0;
  n = n | 0;
  const hoff = HOFF[M_EUCJP];
  const mul = HMUL[M_EUCJP];
  let nat = 0,
    chars = 0,
    d0 = 0,
    extra = 0;
  while (i < stop) {
    const b0 = data[i];
    if (b0 < 0x80) {
      i = (i + 1) | 0;
      continue;
    }
    if (b0 >= 0xa1 && b0 <= 0xfe) {
      if (((i + 1) | 0) >= n) return -1;
      const b1 = data[(i + 1) | 0];
      if (b1 < 0xa1 || b1 > 0xfe) return -1;
      const nw = NATW[M_EUCJP * 256 + b0];
      nat = (nat + ((((b1 - (nw & 255)) | ((nw >>> 8) - b1)) >>> 31) ^ 1)) | 0;
      chars = (chars + 1) | 0;
      const code = (b0 << 8) | b1;
      const kv = HKD0[(hoff + (Math.imul(code, mul) >>> HSHIFT)) | 0];
      d0 = (d0 + (((kv << 16) >> 16) & ((((kv >>> 16) ^ code) - 1) >> 31))) | 0;
      i = (i + 2) | 0;
    } else if (b0 === 0x8e) {
      if (((i + 1) | 0) >= n) return -1;
      const b1 = data[(i + 1) | 0];
      if (b1 < 0xa1 || b1 > 0xdf) return -1;
      nat = (nat + 1) | 0;
      chars = (chars + 1) | 0;
      i = (i + 2) | 0;
    } else if (b0 === 0x8f) {
      if (((i + 2) | 0) >= n) return -1;
      const b1 = data[(i + 1) | 0];
      const b2 = data[(i + 2) | 0];
      if (b1 < 0xa1 || b1 > 0xfe || b2 < 0xa1 || b2 > 0xfe) return -1;
      nat = (nat + ((0xaf - b1) >>> 31)) | 0;
      chars = (chars + 1) | 0;
      extra = (extra + 1) | 0;
      i = (i + 3) | 0;
    } else return -1;
  }
  addState(M_EUCJP, nat, chars, d0, 0, 0, extra);
  return i;
};

const scanEucKr = (data: Uint8Array, i: number, stop: number, n: number): number => {
  i = i | 0;
  stop = stop | 0;
  n = n | 0;
  const hoff = HOFF[M_EUCKR];
  const mul = HMUL[M_EUCKR];
  let nat = 0,
    chars = 0,
    d0 = 0;
  while (i < stop) {
    const b0 = data[i];
    if (b0 < 0x80) {
      i = (i + 1) | 0;
      continue;
    }
    if (b0 < 0xa1 || b0 === 0xc9 || b0 >= 0xfe || ((i + 1) | 0) >= n) return -1;
    const b1 = data[(i + 1) | 0];
    if (b1 < 0xa1 || b1 > 0xfe) return -1;
    const nw = NATW[M_EUCKR * 256 + b0];
    nat = (nat + ((((b1 - (nw & 255)) | ((nw >>> 8) - b1)) >>> 31) ^ 1)) | 0;
    chars = (chars + 1) | 0;
    const code = (b0 << 8) | b1;
    const kv = HKD0[(hoff + (Math.imul(code, mul) >>> HSHIFT)) | 0];
    d0 = (d0 + (((kv << 16) >> 16) & ((((kv >>> 16) ^ code) - 1) >> 31))) | 0;
    i = (i + 2) | 0;
  }
  addState(M_EUCKR, nat, chars, d0, 0, 0, 0);
  return i;
};

const scanCp949 = (data: Uint8Array, i: number, stop: number, n: number): number => {
  i = i | 0;
  stop = stop | 0;
  n = n | 0;
  const hoff = HOFF[M_CP949];
  const mul = HMUL[M_CP949];
  let nat = 0,
    chars = 0,
    d0 = 0,
    trail = 0;
  while (i < stop) {
    const b0 = data[i];
    if (b0 < 0x80) {
      i = (i + 1) | 0;
      continue;
    }
    if (b0 < 0x81 || b0 === 0xc9 || b0 >= 0xfe || ((i + 1) | 0) >= n) return -1;
    const b1 = data[(i + 1) | 0];
    const tc = b0 <= 0xc6 ? TRAIL_CLASS[M_CP949 * 256 + b1] : CP949_HITRAIL[b1];
    if ((tc & 1) === 0) return -1;
    trail = (trail + (tc >>> 1)) | 0;
    const nw = NATW[M_CP949 * 256 + b0];
    nat = (nat + ((((b1 - (nw & 255)) | ((nw >>> 8) - b1)) >>> 31) ^ 1)) | 0;
    chars = (chars + 1) | 0;
    const code = (b0 << 8) | b1;
    const kv = HKD0[(hoff + (Math.imul(code, mul) >>> HSHIFT)) | 0];
    d0 = (d0 + (((kv << 16) >> 16) & ((((kv >>> 16) ^ code) - 1) >> 31))) | 0;
    i = (i + 2) | 0;
  }
  addState(M_CP949, nat, chars, d0, 0, trail, 0);
  return i;
};

const scanGb18030 = (data: Uint8Array, i: number, stop: number, n: number): number => {
  i = i | 0;
  stop = stop | 0;
  n = n | 0;
  const hoff = HOFF[M_GB18030];
  const mul = HMUL[M_GB18030];
  let nat = 0,
    chars = 0,
    d0 = 0,
    d1 = 0,
    trail = 0,
    extra = 0;
  while (i < stop) {
    const b0 = data[i];
    if (b0 < 0x80) {
      i = (i + 1) | 0;
      continue;
    }
    if (b0 < 0x81 || b0 > 0xfe || ((i + 1) | 0) >= n) return -1;
    const b1 = data[(i + 1) | 0];
    if (b1 < 0x40) {
      if (b1 < 0x30 || b1 > 0x39 || ((i + 3) | 0) >= n) return -1;
      const b2 = data[(i + 2) | 0];
      const b3 = data[(i + 3) | 0];
      if (b2 < 0x81 || b2 > 0xfe || b3 < 0x30 || b3 > 0x39) return -1;
      chars = (chars + 1) | 0;
      trail = (trail + 2) | 0;
      extra = (extra + 2) | 0;
      i = (i + 4) | 0;
      continue;
    }
    const tc = TRAIL_CLASS[M_GB18030 * 256 + b1];
    if ((tc & 1) === 0) return -1;
    trail = (trail + (tc >>> 1)) | 0;
    const nw = NATW[M_GB18030 * 256 + b0];
    nat = (nat + ((((b1 - (nw & 255)) | ((nw >>> 8) - b1)) >>> 31) ^ 1)) | 0;
    chars = (chars + 1) | 0;
    const code = (b0 << 8) | b1;
    const h = (hoff + (Math.imul(code, mul) >>> HSHIFT)) | 0;
    const kv = HKD0[h];
    const hit = (((kv >>> 16) ^ code) - 1) >> 31;
    d0 = (d0 + (((kv << 16) >> 16) & hit)) | 0;
    d1 = (d1 + (HD1[h] & hit)) | 0;
    i = (i + 2) | 0;
  }
  addState(M_GB18030, nat, chars, d0, d1, trail, extra);
  return i;
};

const scanBig5 = (data: Uint8Array, i: number, stop: number, n: number): number => {
  i = i | 0;
  stop = stop | 0;
  n = n | 0;
  const hoff = HOFF[M_BIG5];
  const mul = HMUL[M_BIG5];
  let nat = 0,
    chars = 0,
    d0 = 0,
    d1 = 0,
    trail = 0;
  while (i < stop) {
    const b0 = data[i];
    if (b0 < 0x80) {
      i = (i + 1) | 0;
      continue;
    }
    if (b0 < 0xa1 || b0 > 0xf9 || ((i + 1) | 0) >= n) return -1;
    const b1 = data[(i + 1) | 0];
    const tc = TRAIL_CLASS[M_BIG5 * 256 + b1];
    if ((tc & 1) === 0) return -1;
    trail = (trail + (tc >>> 1)) | 0;
    const code = (b0 << 8) | b1;
    if (code >= 0xc6a1 && code <= 0xc8fe) return -1;
    const nw = NATW[M_BIG5 * 256 + b0];
    nat = (nat + ((((b1 - (nw & 255)) | ((nw >>> 8) - b1)) >>> 31) ^ 1)) | 0;
    chars = (chars + 1) | 0;
    const h = (hoff + (Math.imul(code, mul) >>> HSHIFT)) | 0;
    const kv = HKD0[h];
    const hit = (((kv >>> 16) ^ code) - 1) >> 31;
    d0 = (d0 + (((kv << 16) >> 16) & hit)) | 0;
    d1 = (d1 + (HD1[h] & hit)) | 0;
    i = (i + 2) | 0;
  }
  addState(M_BIG5, nat, chars, d0, d1, trail, 0);
  return i;
};

const addState = (
  m: number,
  nat: number,
  chars: number,
  d0: number,
  d1: number,
  trail: number,
  extra: number,
): void => {
  mbcsNat[m] = mbcsNat[m] + nat;
  mbcsChars[m] = mbcsChars[m] + chars;
  mbcsDelta[2 * m] = mbcsDelta[2 * m] + d0;
  mbcsDelta[2 * m + 1] = mbcsDelta[2 * m + 1] + d1;
  mbcsTrail[m] = mbcsTrail[m] + trail;
  mbcsExtra[m] = mbcsExtra[m] + extra;
};

const M_SJIS = 0;
const M_EUCJP = 1;
const M_EUCKR = 2;
const M_CP949 = 3;
const M_GB18030 = 4;
const M_BIG5 = 5;
const { HSHIFT, HOFF, HMUL, HKD0, HD1, NATW, TRAIL_CLASS, CP949_HITRAIL } = mbcsModel;
const { mbcsNat, mbcsChars, mbcsDelta, mbcsTrail, mbcsExtra } = scratch;
