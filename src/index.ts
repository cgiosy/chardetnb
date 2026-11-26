import { buildMbcs, mbcsComplete, mbcsPrefix } from "./mbcs.js";
import {
  ENC_NAMES as ENC_NAMES_CSV,
  LANG_NAMES as LANG_NAMES_CSV,
  MBCS_OFFSET,
  NUM_ENC,
  NUM_MBCS,
  NUM_SBCS,
  POOL32_HI,
  POOL32_LO,
  POOL47_HI,
  POOL47_LO,
  SBCS_OFFSET,
  asciiTotal,
  buildModel,
  compactHistogram,
  countHigh,
  mbcsModel,
  model,
  nH,
  noHigh,
  resetCandidates,
  scratch,
} from "./model.js";
import { scoreSbcs } from "./sbcs.js";
import {
  ENC_ASCII,
  ENC_UTF_16BE,
  ENC_UTF_16LE,
  ENC_UTF_32BE,
  ENC_UTF_32LE,
  ENC_UTF_8,
  asciiPrefix,
  detectIso2022,
  inPool,
  nulParity,
  scanCtl,
  utf8Scan,
  validateUtf16,
  validateUtf32,
} from "./structural.js";

export { NUM_ENC, POOL32_HI, POOL32_LO, POOL47_HI, POOL47_LO };

export const detect = (
  data: Uint8Array,
  poolLo = POOL47_LO,
  poolHi = POOL47_HI,
  sampleLimit = 0,
): Result => detectInto(data, poolLo, poolHi, sampleLimit, newResult());

export const detectInto = (
  data: Uint8Array,
  poolLo: number,
  poolHi: number,
  sampleLimit: number,
  out: Result,
): Result => {
  if (!initialized) init();
  const len = data.length;
  if (len === 0) return setResult(out, -1, -1, 0, 0);
  const n = sampleLimit > 0 && len > sampleLimit ? sampleLimit : len;
  const truncated = n < len;

  const w16 = n >= 2 ? (data[0] << 8) | data[1] : -1;
  const w32 = n >= 4 ? ((w16 << 16) | (data[2] << 8) | data[3]) >>> 0 : -1;
  if (
    w32 === 0x0000feff &&
    inPool(poolLo, poolHi, ENC_UTF_32BE) &&
    validateUtf32(data, n & ~3, true)
  )
    return setResult(out, ENC_UTF_32BE, -1, 1, 99);
  if (
    w32 === 0xfffe0000 &&
    inPool(poolLo, poolHi, ENC_UTF_32LE) &&
    validateUtf32(data, n & ~3, false)
  )
    return setResult(out, ENC_UTF_32LE, -1, 1, 99);
  if (
    w16 === 0xfeff &&
    inPool(poolLo, poolHi, ENC_UTF_16BE) &&
    validateUtf16(data, n & ~1, true, truncated)
  )
    return setResult(out, ENC_UTF_16BE, -1, 1, 99);
  if (
    w16 === 0xfffe &&
    inPool(poolLo, poolHi, ENC_UTF_16LE) &&
    validateUtf16(data, n & ~1, false, truncated)
  )
    return setResult(out, ENC_UTF_16LE, -1, 1, 99);

  const head = (4 - (data.byteOffset & 3)) & 3;
  const words =
    IS_LE && n >= WORDS_MIN
      ? new Int32Array(data.buffer, data.byteOffset + head, (n - head) >>> 2)
      : NO_WORDS;
  const firstHigh = asciiPrefix(data, n, words, head);
  let controls = scanCtl;
  if (firstHigh < n) {
    // With a high byte present only NUL decides between the UTF-16/32 checks and null, so valid
    // UTF-8 never needs the histogram.
    if (inPool(poolLo, poolHi, ENC_UTF_8) && utf8Scan(data, firstHigh, n, truncated, words, head)) {
      controls |= scanCtl;
      if ((controls & 1) !== 0) return detectNul(data, n, poolLo, poolHi, truncated, out);
      if ((controls & (BAD_C0 | SO_SI | ESC)) !== 0) return setResult(out, -1, -1, 0, 0);
      return setResult(out, ENC_UTF_8, -1, 1, 99);
    }
    countHigh(data, firstHigh, n, words, head);
    controls |= compactHistogram(n);
  } else noHigh(n);
  const hasNul = (controls & 1) !== 0;
  const hasEsc = (controls & ESC) !== 0;
  let badC0 = (controls & BAD_C0) !== 0;
  if (hasEsc && !hasNul && !badC0 && nH === 0) {
    const iso = detectIso2022(data, n, poolLo, poolHi);
    if (iso >= 0) return setResult(out, iso, -1, 1, 99);
  }
  if ((controls & SO_SI) !== 0) badC0 = true;
  if (nH === 0 && !hasNul && !badC0 && !hasEsc) {
    if (inPool(poolLo, poolHi, ENC_ASCII)) return setResult(out, ENC_ASCII, -1, 1, 99);
    if (inPool(poolLo, poolHi, ENC_UTF_8)) return setResult(out, ENC_UTF_8, -1, 1, 99);
  }
  if (hasNul) return detectNul(data, n, poolLo, poolHi, truncated, out);
  if (badC0 || hasEsc) return setResult(out, -1, -1, 0, 0);
  // Here UTF-8 is out of the pool or already failed utf8Scan.
  return scoreStatistical(data, n, poolLo, poolHi, firstHigh, truncated, words, head, out);
};

const detectNul = (
  data: Uint8Array,
  n: number,
  poolLo: number,
  poolHi: number,
  truncated: boolean,
  out: Result,
): Result => {
  const n32 = truncated ? n & ~3 : n;
  if ((n32 & 3) === 0 && n32 >= 4) {
    if (inPool(poolLo, poolHi, ENC_UTF_32BE) && validateUtf32(data, n32, true))
      return setResult(out, ENC_UTF_32BE, -1, 1, 99);
    if (inPool(poolLo, poolHi, ENC_UTF_32LE) && validateUtf32(data, n32, false))
      return setResult(out, ENC_UTF_32LE, -1, 1, 99);
  }
  const n16 = truncated ? n & ~1 : n;
  if ((n16 & 1) === 0 && n16 >= 2) {
    const parity = nulParity(data, n16);
    if (
      parity > 0 &&
      inPool(poolLo, poolHi, ENC_UTF_16BE) &&
      validateUtf16(data, n16, true, truncated)
    )
      return setResult(out, ENC_UTF_16BE, -1, 1, 99);
    if (
      parity < 0 &&
      inPool(poolLo, poolHi, ENC_UTF_16LE) &&
      validateUtf16(data, n16, false, truncated)
    )
      return setResult(out, ENC_UTF_16LE, -1, 1, 99);
  }
  return setResult(out, -1, -1, 0, 0);
};

export const init = (): void => {
  if (initialized) return;
  buildModel();
  buildMbcs();
  for (let q = 0; q < 60; q++) EXP2_INT[q] = 2 ** -q;
  for (let j = 0; j < 256; j++) EXP2_FRAC[j] = 2 ** (-j / 256);
  initialized = true;
};

export const newResult = (): Result => ({
  encId: -1,
  langId: -1,
  encoding: null,
  language: null,
  confidence: 0,
  marginBits: 0,
});

const scoreStatistical = (
  data: Uint8Array,
  n: number,
  poolLo: number,
  poolHi: number,
  firstHigh: number,
  truncated: boolean,
  words: Int32Array,
  head: number,
  out: Result,
): Result => {
  resetCandidates();
  hmask.fill(0);
  for (let j = 0; j < nH; j++) {
    const b = actH[j];
    hmask[b >> 5] |= 1 << (b & 31);
  }
  const mv = selectValid(NUM_MBCS, MBCS_OFFSET, MBCS_INVALID, mbcsOrder, poolLo, poolHi);
  const nv = selectValid(NUM_SBCS, SBCS_OFFSET, SBCS_INVALID, sbcsOrder, poolLo, poolHi);
  const highTotal = n - asciiTotal;
  if (highTotal * 4 < n) {
    if (nv > 0) scoreSbcs(nv, n);
    const alive = mbcsPrefix(mv, data, n, highTotal, firstHigh, truncated, words, head);
    mbcsComplete(alive, alive, data, n, highTotal, truncated, words, head);
  } else {
    let alive = mbcsPrefix(mv, data, n, highTotal, firstHigh, truncated, words, head);
    alive = mbcsComplete(alive, 1, data, n, highTotal, truncated, words, head);
    if (nv > 0) scoreSbcs(nv, n);
    mbcsComplete(alive, alive, data, n, highTotal, truncated, words, head);
  }
  return finish(out);
};

// Writes the pool members whose invalid-byte mask misses every present high byte into order.
const selectValid = (
  cnt: number,
  off: number,
  invalid: Int32Array,
  order: Int32Array,
  poolLo: number,
  poolHi: number,
): number => {
  const h0 = hmask[0];
  const h1 = hmask[1];
  const h2 = hmask[2];
  const h3 = hmask[3];
  let k = 0;
  for (let e = 0; e < cnt; e++) {
    if (!inPool(poolLo, poolHi, off + e)) continue;
    const hits =
      (h0 & invalid[e * 4]) |
      (h1 & invalid[e * 4 + 1]) |
      (h2 & invalid[e * 4 + 2]) |
      (h3 & invalid[e * 4 + 3]);
    if (hits === 0) order[k++] = e;
  }
  return k;
};

const finish = (out: Result): Result => {
  let nc = 0;
  let best = -1;
  for (let g = 0; g < 2; g++) {
    const off = g === 0 ? SBCS_OFFSET : MBCS_OFFSET;
    for (let m = candMask[g]; m !== 0; m &= m - 1) {
      const id = off + (31 - Math.clz32(m & -m));
      const ll = candLL[id];
      candList[nc++] = id;
      if (
        best < 0 ||
        ll > candLL[best] ||
        (ll === candLL[best] && CANON_RANK[id] < CANON_RANK[best])
      )
        best = id;
    }
  }
  if (best < 0) return setResult(out, -1, -1, 0, 0);
  const maxLL = candLL[best];
  let second = -Infinity;
  let denom = 0;
  for (let a = 0; a < nc; a++) {
    const id = candList[a];
    const ll = candLL[id];
    const k = maxLL - ll;
    if (k < 15360) denom += EXP2_INT[k >> 8] * EXP2_FRAC[k & 255];
    if (id !== best && ll > second) second = ll;
  }
  return setResult(
    out,
    best,
    candLang[best],
    denom > 0 ? 1 / denom : 1,
    second > -Infinity ? (maxLL - second) / 256 : 99,
  );
};

const setResult = (
  out: Result,
  encId: number,
  langId: number,
  confidence: number,
  marginBits: number,
): Result => {
  out.encId = encId;
  out.langId = langId;
  out.encoding = encId >= 0 ? ENC_NAMES[encId] : null;
  out.language = langId >= 0 ? LANG_NAMES[langId] : null;
  out.confidence = confidence;
  out.marginBits = marginBits;
  return out;
};

const BAD_C0 = 0xf7ff01fe;
const SO_SI = (1 << 0x0e) | (1 << 0x0f);
const ESC = 1 << 0x1b;
const IS_LE = new Uint8Array(Uint16Array.of(1).buffer)[0] === 1;
const WORDS_MIN = 32;
const NO_WORDS = new Int32Array(0);
const hmask = new Int32Array(4);
const EXP2_INT = new Float64Array(60);
const EXP2_FRAC = new Float64Array(256);
const candList = new Int32Array(NUM_ENC);
let initialized = false;
const { CANON_RANK, SBCS_INVALID } = model;
const { MBCS_INVALID } = mbcsModel;
const { actH, candMask, candLang, candLL, mbcsOrder, sbcsOrder } = scratch;
export const ENC_NAMES = ENC_NAMES_CSV.split(",");
export const LANG_NAMES = LANG_NAMES_CSV.split(",");

export type Result = {
  encId: number;
  langId: number;
  encoding: string | null;
  language: string | null;
  confidence: number;
  marginBits: number;
};
