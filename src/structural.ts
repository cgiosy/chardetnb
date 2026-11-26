export const ENC_ASCII = 0;
export const ENC_UTF_8 = 1;
export const ENC_UTF_16BE = 2;
export const ENC_UTF_16LE = 3;
export const ENC_UTF_32BE = 4;
export const ENC_UTF_32LE = 5;

// Control bytes seen by the last asciiPrefix/utf8Scan: bit b for byte b < 0x20, bit 31 also for 0x7F.
// Bits 9..13 (TAB, LF, VT, FF, CR) may be missing: no caller looks at them.
export let scanCtl = 0;

export const asciiPrefix = (data: Uint8Array, n: number, words: Int32Array, head: number): number => {
  let ctl = 0;
  let i = 0;
  wordCtl = 0;
  if (words.length !== 0) {
    for (; i < head; i = (i + 1) | 0) {
      const b = data[i];
      if (b >= 0x80) break;
      if (b < 0x20 || b === 0x7f) ctl |= ctlBit(b);
    }
    if (i === head) i = (head + (skipAscii(data, words, 0, head) << 2)) | 0;
  }
  for (; i < n; i = (i + 1) | 0) {
    const b = data[i];
    if (b >= 0x80) break;
    if (b < 0x20 || b === 0x7f) ctl |= ctlBit(b);
  }
  scanCtl = ctl | wordCtl;
  return i;
};

// RFC 3629 UTF-8 minus surrogates, U+E000..U+F8FF and noncharacters U+FFFD..U+FFFF / U+xFFFE..U+xFFFF.
// A sequence cut by the end of data is accepted when `truncated`. On success scanCtl holds the
// control bytes of data[i..n).
export const utf8Scan = (
  data: Uint8Array,
  i: number,
  n: number,
  truncated: boolean,
  words: Int32Array,
  head: number,
): boolean => {
  let ctl = 0;
  wordCtl = 0;
  while (i < n) {
    const b = data[i];
    if (b < 0x80) {
      if (b < 0x20 || b === 0x7f) ctl |= ctlBit(b);
      i = (i + 1) | 0;
      if (((i - head) & 3) === 0 && words.length !== 0)
        i = (head + (skipAscii(data, words, (i - head) >> 2, head) << 2)) | 0;
      continue;
    }
    if (b < 0xe0) {
      if (b < 0xc2) return false;
      if (i + 1 >= n) return cut(ctl, truncated);
      if ((data[i + 1] & 0xc0) !== 0x80) return false;
      i = (i + 2) | 0;
    } else if (b < 0xf0) {
      if (b === 0xee) return false;
      if (i + 1 >= n) return cut(ctl, truncated);
      const b1 = data[i + 1];
      if (b1 < (b === 0xe0 ? 0xa0 : b === 0xef ? 0xa4 : 0x80) || b1 > (b === 0xed ? 0x9f : 0xbf))
        return false;
      if (i + 2 >= n) return cut(ctl, truncated);
      const b2 = data[i + 2];
      if (b2 < 0x80 || b2 > (b === 0xef && b1 === 0xbf ? 0xbc : 0xbf)) return false;
      i = (i + 3) | 0;
    } else {
      if (b > 0xf4) return false;
      if (i + 1 >= n) return cut(ctl, truncated);
      const b1 = data[i + 1];
      if (b1 < (b === 0xf0 ? 0x90 : 0x80) || b1 > (b === 0xf4 ? 0x8f : 0xbf)) return false;
      if (i + 2 >= n) return cut(ctl, truncated);
      const b2 = data[i + 2];
      if ((b2 & 0xc0) !== 0x80) return false;
      if (i + 3 >= n) return cut(ctl, truncated);
      const b3 = data[i + 3];
      if (b3 < 0x80 || b3 > ((b1 & 0x0f) === 0x0f && b2 === 0xbf ? 0xbd : 0xbf)) return false;
      i = (i + 4) | 0;
    }
  }
  scanCtl = ctl | wordCtl;
  return true;
};

export const validateUtf32 = (data: Uint8Array, len: number, be: boolean): boolean => {
  if (len < 4 || (len & 3) !== 0) return false;
  const o0 = be ? 0 : 3;
  const o1 = be ? 1 : 2;
  const o2 = be ? 2 : 1;
  const o3 = be ? 3 : 0;
  for (let i = 0; i < len; i = (i + 4) | 0) {
    const cp =
      ((data[i + o0] << 24) | (data[i + o1] << 16) | (data[i + o2] << 8) | data[i + o3]) >>> 0;
    if (!isAllowedScalar(cp)) return false;
  }
  return true;
};

export const validateUtf16 = (
  data: Uint8Array,
  len: number,
  be: boolean,
  truncated: boolean,
): boolean => {
  if (len < 2 || (len & 1) !== 0) return false;
  const hiOff = be ? 0 : 1;
  const loOff = be ? 1 : 0;
  for (let i = 0; i < len; i = (i + 2) | 0) {
    const u = (data[i + hiOff] << 8) | data[i + loOff];
    if (u >= 0x20 && u < 0x7f) continue;
    if (u >= 0xd800 && u <= 0xdbff) {
      if (i + 2 >= len) return truncated;
      const u2 = (data[i + 2 + hiOff] << 8) | data[i + 2 + loOff];
      if (u2 < 0xdc00 || u2 > 0xdfff) return false;
      i = (i + 2) | 0;
      continue;
    }
    if (!isAllowedScalar(u)) return false;
  }
  return true;
};

// 1 when NULs at even offsets outnumber odd ones more than 2:1, -1 for the reverse, else 0.
export const nulParity = (data: Uint8Array, n: number): number => {
  let even = 0;
  let odd = 0;
  for (let i = 0; i + 1 < n; i = (i + 2) | 0) {
    if (data[i] === 0) even++;
    if (data[i + 1] === 0) odd++;
  }
  if ((n & 1) !== 0 && data[n - 1] === 0) even++;
  return even > odd * 2 ? 1 : odd > even * 2 ? -1 : 0;
};

export const detectIso2022 = (
  data: Uint8Array,
  len: number,
  poolLo: number,
  poolHi: number,
): number => {
  let found = 0;
  const view = len === data.length ? data : data.subarray(0, len);
  for (let i = view.indexOf(0x1b); i >= 0 && i + 2 < len; i = view.indexOf(0x1b, i + 1)) {
    const b1 = data[i + 1];
    const b2 = data[i + 2];
    const b3 = i + 3 < len ? data[i + 3] : 0;
    for (const [s1, s2, lo, hi, enc] of ISO2022_SIGS)
      if (b1 === s1 && b2 === s2 && b3 >= lo && b3 <= hi) found |= 1 << enc;
  }
  for (const enc of ISO2022_PRIORITY)
    if (((found >>> enc) & 1) !== 0 && inPool(poolLo, poolHi, enc)) return enc;
  return -1;
};

export const inPool = (lo: number, hi: number, id: number): boolean =>
  id < 32 ? ((lo >>> id) & 1) !== 0 : ((hi >>> (id - 32)) & 1) !== 0;

const isAllowedScalar = (cp: number): boolean => {
  if (cp < 0x7f) return cp >= 0x20 || (cp >= 0x09 && cp <= 0x0d);
  if (cp <= 0x9f) return false;
  if (cp < 0xd800) return true;
  if (cp <= 0xf8ff) return false;
  if (cp > 0x10ffff || cp === 0xfffd) return false;
  return (cp & 0xfffe) !== 0xfffe;
};

const cut = (ctl: number, truncated: boolean): boolean => {
  scanCtl = ctl | wordCtl;
  return truncated;
};

// Only called for b < 0x20 or b === 0x7F (both 0x1F and 0x7F map to bit 31).
const ctlBit = (b: number): number => 1 << (b & 31);

// Returns the first word index >= j that holds a byte >= 0x80 (words.length if none), ORing the
// control bytes of the skipped words into wordCtl. The tests are lane-exact for words without high
// bits (no carry or borrow crosses a lane unless the test already failed), so byte order is irrelevant.
const skipAscii = (data: Uint8Array, words: Int32Array, j: number, head: number): number => {
  const wn = words.length;
  for (; j < wn; j = (j + 1) | 0) {
    const w = words[j];
    if (((w | (w - LO20) | (w + LO01)) & HI) === 0) {
      if (j + 1 >= wn) continue;
      const v = words[j + 1];
      if (((v | (v - LO20) | (v + LO01)) & HI) === 0) {
        j = (j + 1) | 0;
        continue;
      }
      j = (j + 1) | 0;
      if ((v & HI) !== 0) return j;
      if (ctlLanes(v) !== 0) wordCtl |= ctlBytes(data, (head + (j << 2)) | 0);
      continue;
    }
    if ((w & HI) !== 0) return j;
    if (ctlLanes(w) !== 0) wordCtl |= ctlBytes(data, (head + (j << 2)) | 0);
  }
  return wn;
};

// Lanes (of a word without high bits) holding 0x00..0x08, 0x0E..0x1F or 0x7F.
const ctlLanes = (w: number): number =>
  ((~(w + 0x60606060) & (~(w + 0x77777777) | (w + 0x72727272))) | (w + LO01)) & HI;

const ctlBytes = (data: Uint8Array, p: number): number => {
  let ctl = 0;
  for (let k = p; k < p + 4; k = (k + 1) | 0) {
    const b = data[k];
    if (b < 0x20 || b === 0x7f) ctl |= ctlBit(b);
  }
  return ctl;
};

let wordCtl = 0;
const HI = 0x80808080 | 0;
const LO20 = 0x20202020;
const LO01 = 0x01010101;

const ENC_ISO_2022_JP = 6;
const ENC_ISO_2022_KR = 7;
const ENC_ISO_2022_CN = 8;

const ISO2022_SIGS: readonly (readonly [number, number, number, number, number])[] = [
  [0x24, 0x42, 0x00, 0xff, ENC_ISO_2022_JP],
  [0x24, 0x40, 0x00, 0xff, ENC_ISO_2022_JP],
  [0x28, 0x4a, 0x00, 0xff, ENC_ISO_2022_JP],
  [0x28, 0x49, 0x00, 0xff, ENC_ISO_2022_JP],
  [0x24, 0x28, 0x44, 0x44, ENC_ISO_2022_JP],
  [0x24, 0x29, 0x43, 0x43, ENC_ISO_2022_KR],
  [0x24, 0x29, 0x41, 0x41, ENC_ISO_2022_CN],
  [0x24, 0x29, 0x47, 0x47, ENC_ISO_2022_CN],
  [0x24, 0x2a, 0x48, 0x48, ENC_ISO_2022_CN],
  [0x24, 0x2b, 0x49, 0x4d, ENC_ISO_2022_CN],
];

const ISO2022_PRIORITY = [ENC_ISO_2022_KR, ENC_ISO_2022_CN, ENC_ISO_2022_JP];
