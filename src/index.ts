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
  countBytes,
  mbcsModel,
  model,
  nH,
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
  buildUtf8Dfa,
  detectIso2022,
  inPool,
  nulParity,
  utf8Valid,
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
  if (w16 === 0xfeff && inPool(poolLo, poolHi, ENC_UTF_16BE) && validateUtf16(data, n & ~1, true))
    return setResult(out, ENC_UTF_16BE, -1, 1, 99);
  if (w16 === 0xfffe && inPool(poolLo, poolHi, ENC_UTF_16LE) && validateUtf16(data, n & ~1, false))
    return setResult(out, ENC_UTF_16LE, -1, 1, 99);

  countBytes(data, n);
  const controls = compactHistogram(n);
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
  if (hasNul) {
    if ((n & 3) === 0) {
      if (inPool(poolLo, poolHi, ENC_UTF_32BE) && validateUtf32(data, n, true))
        return setResult(out, ENC_UTF_32BE, -1, 1, 99);
      if (inPool(poolLo, poolHi, ENC_UTF_32LE) && validateUtf32(data, n, false))
        return setResult(out, ENC_UTF_32LE, -1, 1, 99);
    }
    if ((n & 1) === 0) {
      const [evenNul, oddNul] = nulParity(data, n);
      if (
        evenNul > oddNul * 2 &&
        inPool(poolLo, poolHi, ENC_UTF_16BE) &&
        validateUtf16(data, n, true)
      )
        return setResult(out, ENC_UTF_16BE, -1, 1, 99);
      if (
        oddNul > evenNul * 2 &&
        inPool(poolLo, poolHi, ENC_UTF_16LE) &&
        validateUtf16(data, n, false)
      )
        return setResult(out, ENC_UTF_16LE, -1, 1, 99);
    }
    return setResult(out, -1, -1, 0, 0);
  }
  if (badC0 || hasEsc) return setResult(out, -1, -1, 0, 0);
  let firstHigh = 0;
  while (firstHigh < n && data[firstHigh] < 0x80) firstHigh++;
  if (inPool(poolLo, poolHi, ENC_UTF_8) && utf8Valid(data, firstHigh, n))
    return setResult(out, ENC_UTF_8, -1, 1, 99);
  return scoreStatistical(data, n, poolLo, poolHi, firstHigh, out);
};

export const init = (): void => {
  if (initialized) return;
  buildModel();
  buildUtf8Dfa();
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
  out: Result,
): Result => {
  resetCandidates();
  let h0 = 0;
  let h1 = 0;
  let h2 = 0;
  let h3 = 0;
  for (let j = 0; j < nH; j++) {
    const b = actH[j];
    const bit = 1 << (b & 31);
    if (b < 32) h0 |= bit;
    else if (b < 64) h1 |= bit;
    else if (b < 96) h2 |= bit;
    else h3 |= bit;
  }
  const select = (cnt: number, off: number, invalid: Int32Array, order: Int32Array): number => {
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
  const mv = select(NUM_MBCS, MBCS_OFFSET, MBCS_INVALID, mbcsOrder);
  const nv = select(NUM_SBCS, SBCS_OFFSET, SBCS_INVALID, sbcsOrder);
  const highTotal = n - asciiTotal;
  if (highTotal * 4 < n) {
    if (nv > 0) scoreSbcs(nv, n);
    const alive = mbcsPrefix(mv, data, n, highTotal, firstHigh);
    mbcsComplete(alive, alive, data, n, highTotal);
  } else {
    let alive = mbcsPrefix(mv, data, n, highTotal, firstHigh);
    alive = mbcsComplete(alive, 1, data, n, highTotal);
    if (nv > 0) scoreSbcs(nv, n);
    mbcsComplete(alive, alive, data, n, highTotal);
  }
  return finish(out);
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
