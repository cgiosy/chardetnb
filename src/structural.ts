export const ENC_ASCII = 0;
export const ENC_UTF_8 = 1;
export const ENC_UTF_16BE = 2;
export const ENC_UTF_16LE = 3;
export const ENC_UTF_32BE = 4;
export const ENC_UTF_32LE = 5;

export const buildUtf8Dfa = (): void => {
  for (const [s, first, last, next] of UTF8_RULES)
    for (let b = first; b <= last; b++) UTF8_DFA[s * 256 + b] = next * 256;
  for (const [s, first, last] of UTF8_FOUR_BYTE_SECOND)
    for (let b = first; b <= last; b++)
      UTF8_DFA[s * 256 + b] = ((b & 0x0f) === 0x0f ? U_FNC3 : U_C2) * 256;
};

export const utf8Valid = (
  data: Uint8Array,
  start: number,
  n: number,
  truncated: boolean,
): boolean => {
  let s = 0;
  if (n < UTF8_SWAR_MIN) {
    for (let i = start | 0; i < n; i = (i + 1) | 0) {
      s = UTF8_DFA[(s + data[i]) | 0];
      if (s === UTF8_REJ) return false;
    }
    return truncated || s === 0;
  }
  let i = start | 0;
  const head = (4 - (data.byteOffset & 3)) & 3;
  const u =
    n - head >= 4 ? new Uint32Array(data.buffer, data.byteOffset + head, (n - head) >>> 2) : null;
  while (i < n) {
    if (s === 0 && u !== null) {
      const rel = (i - head) | 0;
      if ((rel & 3) === 0 && rel >= 0) {
        const j = rel >>> 2;
        if (j < u.length && (u[j] & 0x80808080) === 0) {
          i = (i + 4) | 0;
          continue;
        }
      }
    }
    s = UTF8_DFA[(s + data[i]) | 0];
    if (s === UTF8_REJ) return false;
    i = (i + 1) | 0;
  }
  return truncated || s === 0;
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

export const nulParity = (data: Uint8Array, n: number): [number, number] => {
  let even = 0;
  let odd = 0;
  for (let i = 0; i + 1 < n; i = (i + 2) | 0) {
    if (data[i] === 0) even++;
    if (data[i + 1] === 0) odd++;
  }
  if ((n & 1) !== 0 && data[n - 1] === 0) even++;
  return [even, odd];
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

const UTF8_SWAR_MIN = 4096;
const U_ACC = 0;
const U_REJ = 1;
const U_C1 = 2;
const U_C2 = 3;
const U_E0 = 4;
const U_ED = 5;
const U_EF = 6;
const U_EFBF = 7;
const U_F0 = 8;
const U_F1 = 9;
const U_F4 = 10;
const U_FNC3 = 11;
const U_FNC4 = 12;
const U_NUM = 13;
const UTF8_REJ = U_REJ * 256;
const UTF8_DFA = new Uint16Array(U_NUM * 256).fill(UTF8_REJ);

const UTF8_RULES: readonly (readonly [number, number, number, number])[] = [
  [U_ACC, 0x00, 0x7f, U_ACC],
  [U_ACC, 0xc2, 0xdf, U_C1],
  [U_ACC, 0xe0, 0xe0, U_E0],
  [U_ACC, 0xe1, 0xec, U_C2],
  [U_ACC, 0xed, 0xed, U_ED],
  [U_ACC, 0xef, 0xef, U_EF],
  [U_ACC, 0xf0, 0xf0, U_F0],
  [U_ACC, 0xf1, 0xf3, U_F1],
  [U_ACC, 0xf4, 0xf4, U_F4],
  [U_C1, 0x80, 0xbf, U_ACC],
  [U_C2, 0x80, 0xbf, U_C1],
  [U_E0, 0xa0, 0xbf, U_C1],
  [U_ED, 0x80, 0x9f, U_C1],
  [U_EF, 0xa4, 0xbf, U_C1],
  [U_EF, 0xbf, 0xbf, U_EFBF],
  [U_EFBF, 0x80, 0xbc, U_ACC],
  [U_FNC3, 0x80, 0xbe, U_C1],
  [U_FNC3, 0xbf, 0xbf, U_FNC4],
  [U_FNC4, 0x80, 0xbd, U_ACC],
];

const UTF8_FOUR_BYTE_SECOND: readonly (readonly [number, number, number])[] = [
  [U_F0, 0x90, 0xbf],
  [U_F1, 0x80, 0xbf],
  [U_F4, 0x80, 0x8f],
];

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
