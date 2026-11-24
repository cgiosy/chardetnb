import { scanMbcs } from "./mbcs-scan.js";
import {
  HMUL as HMUL_CODES,
  MBCS_BIG5_CODES,
  MBCS_BIG5_LOGP,
  MBCS_BIG5_MASK,
  MBCS_EUCKR_CODES,
  MBCS_EUCKR_LOGP,
  MBCS_GB_CODES,
  MBCS_GB_LOGP,
  MBCS_GB_MASK,
  MBCS_OFFSET,
  MBCS_SJIS_CODES,
  MBCS_SJIS_LOGP,
  NUM_MBCS,
  OOS,
  addCandidate,
  asciiTotal,
  decodeInts,
  decodeMask,
  mbcsModel,
  model,
  pruneThreshold,
  scratch,
} from "./model.js";

export const buildMbcs = (): void => {
  const sjisCodes = decodeDeltas(MBCS_SJIS_CODES, 50, false);
  const sjisLogp = decodeDeltas(MBCS_SJIS_LOGP, 50, true);
  const euckrCodes = decodeDeltas(MBCS_EUCKR_CODES, 50, false);
  const euckrLogp = decodeDeltas(MBCS_EUCKR_LOGP, 50, true);
  const gbCodes = decodeDeltas(MBCS_GB_CODES, 65, false);
  const gbLogp = decodeDeltas(MBCS_GB_LOGP, 65, true);
  const gbMask = decodeMask(MBCS_GB_MASK, 2 * gbCodes.length);
  const big5Codes = decodeDeltas(MBCS_BIG5_CODES, 51, false);
  const big5Logp = decodeDeltas(MBCS_BIG5_LOGP, 51, true);
  const big5Mask = decodeMask(MBCS_BIG5_MASK, 2 * big5Codes.length);
  const models: readonly (readonly [Int32Array, Int32Array])[] = [
    [sjisCodes, sjisLogp],
    [sjisCodes.map(shiftJisToEucJp), sjisLogp],
    [euckrCodes, euckrLogp],
    [euckrCodes, euckrLogp],
    masked(gbCodes, gbLogp, gbMask, 0),
    masked(gbCodes, gbLogp, gbMask, 1),
    masked(big5Codes, big5Logp, big5Mask, 0),
    masked(big5Codes, big5Logp, big5Mask, 1),
  ];

  for (const [k, l] of MODEL_LANG.entries()) {
    MODEL_ASCII_W[k] = ASCII_REST[l];
    MODEL_NATIVE_W[k] = NONASCII_REST[l];
  }

  HMUL.set(decodeInts(HMUL_CODES, NUM_MBCS, true));
  for (let m = 0; m <= NUM_MBCS; m++) HOFF[m] = m * (1 << (32 - HSHIFT));
  if (HOFF[NUM_MBCS] > HCAP) throw new Error("MBCS hash tables exceed HCAP");
  for (const [m, g] of MBCS_GRAMMAR.entries()) {
    for (let b = 0; b < 256; b++)
      TRAIL_CLASS[m * 256 + b] = inRanges(g.trail, b) ? 1 | (b < 0x80 ? 2 : 0) : 0;
    for (let word = 0; word < 4; word++) {
      let invalid = 0;
      for (let bit = 0; bit < 32; bit++)
        if (inRanges(g.bad, 0x80 + word * 32 + bit)) invalid |= 1 << bit;
      MBCS_INVALID[m * 4 + word] = invalid;
    }
    const { hiTrail } = g;
    if (hiTrail) for (let b = 0; b < 256; b++) CP949_HITRAIL[b] = inRanges(hiTrail, b) ? 1 : 0;
    for (let b0 = 0x80; b0 < 256; b0++) {
      if (!inRanges(g.lead, b0)) continue;
      const trail = (b0 > 0xc6 && hiTrail) || g.trail;
      let lo = 255;
      let hi = 0;
      for (let b1 = 0x30; b1 < 256; b1++) {
        if (inRanges(trail, b1) && isNative(g, (b0 << 8) | b1)) {
          if (b1 < lo) lo = b1;
          hi = b1;
        }
      }
      for (let b1 = lo; b1 <= hi; b1++)
        if (inRanges(trail, b1) && !isNative(g, (b0 << 8) | b1))
          throw new Error(`MBCS ${m} lead ${b0}: nativeness is not an interval`);
      NATW[m * 256 + b0] = lo | (hi << 8);
    }

    const first = MODEL_FIRST[m];
    const deltas = new Map<number, [number, number]>();
    for (const [k, [codes, logps]] of models.slice(first, MODEL_FIRST[m + 1]).entries()) {
      const rest = MODEL_NATIVE_W[first + k];
      let mx = Math.max(rest, OOS);
      for (const [j, code] of codes.entries()) {
        const logp = logps[j];
        if (j > 0 && code <= codes[j - 1]) throw new Error("MBCS entries must be strictly sorted");
        let d = deltas.get(code);
        if (d === undefined) deltas.set(code, (d = [0, 0]));
        d[k] = logp - (isNative(g, code) ? rest : OOS);
        if (logp > mx) mx = logp;
      }
      MBCS_MAX_CHAR_W[first + k] = mx;
    }
    for (const [code, [d0, d1]] of deltas) {
      const h = HOFF[m] + (Math.imul(code, HMUL[m]) >>> HSHIFT);
      HKD0[h] = (code << 16) | (d0 & 0xffff);
      HD1[h] = d1;
    }
  }
};

const HCAP = 8192;

const decodeDeltas = (src: string, n: number, signed: boolean): Int32Array => {
  const vals = decodeInts(src, n, signed);
  for (let i = 1; i < n; i++) vals[i] = vals[i] + vals[i - 1];
  return vals;
};

const masked = (
  codes: Int32Array,
  logp: Int32Array,
  mask: Uint8Array,
  lang: number,
): readonly [Int32Array, Int32Array] => {
  const keep = (_: number, i: number): boolean => mask[lang * codes.length + i] !== 0;
  return [codes.filter(keep), logp.filter(keep)];
};

const shiftJisToEucJp = (code: number): number => {
  const b0 = code >> 8;
  const b1 = code & 0xff;
  return (
    ((((b0 - (b0 <= 0x9f ? 0x81 : 0xc1)) << 1) + 0x21 + (b1 >= 0x9f ? 1 : 0) + 0x80) << 8) |
    (b1 - (b1 >= 0x9f ? 0x7e : b1 <= 0x7e ? 0x1f : 0x20) + 0x80)
  );
};

const isNative = (g: Grammar, code: number): boolean =>
  inRanges(g.native, code) ||
  (g.nativeLow !== undefined && inRanges(g.nativeLow, code >>> 8) && (code & 0xff) <= 0xa0);

const inRanges = (ranges: readonly number[], b: number): boolean => {
  for (let i = 0; i < ranges.length; i += 2) if (b >= ranges[i] && b <= ranges[i + 1]) return true;
  return false;
};

const MBCS_GRAMMAR: readonly Grammar[] = [
  {
    bad: [0xfd, 0xff],
    lead: [0x81, 0x9f, 0xe0, 0xef],
    trail: [0x40, 0x7e, 0x80, 0xfc],
    native: [0x8140, 0x81ac, 0x829f, 0x82f1, 0x8340, 0x8396, 0x889f, 0x9ffc, 0xe040, 0xeaa4],
  },
  {
    bad: [0x80, 0x8d, 0x90, 0xa0, 0xff, 0xff],
    lead: [0x8e, 0x8f, 0xa1, 0xfe],
    trail: [0xa1, 0xfe],
    native: [0xa100, 0xa1ff, 0xa400, 0xa4ff, 0xa500, 0xa5ff, 0xb000, 0xf4ff],
  },
  {
    bad: [0x80, 0xa0, 0xff, 0xff],
    lead: [0xa1, 0xfd],
    trail: [0xa1, 0xfe],
    native: [0xa100, 0xa1ff, 0xb000, 0xc8ff, 0xca00, 0xfdff],
  },
  {
    bad: [0x80, 0x80, 0xff, 0xff],
    lead: [0x81, 0xfe],
    trail: [0x41, 0x5a, 0x61, 0x7a, 0x81, 0xfe],
    hiTrail: [0xa1, 0xfe],
    native: [0x0000, 0xa1ff, 0xb000, 0xc8ff, 0xca00, 0xfdff],
    nativeLow: [0xa2, 0xaf],
  },
  {
    bad: [0xff, 0xff],
    lead: [0x81, 0xfe],
    trail: [0x40, 0x7e, 0x80, 0xfe],
    native: [0x8100, 0xa1ff, 0xa300, 0xa3ff, 0xb000, 0xf7ff],
    nativeLow: [0xaa, 0xaf, 0xf8, 0xfe],
  },
  {
    bad: [0x80, 0xa0, 0xff, 0xff],
    lead: [0xa1, 0xf9],
    trail: [0x40, 0x7e, 0xa1, 0xfe],
    native: [0xa140, 0xa1fe, 0xa440, 0xc67e, 0xc940, 0xf9d5],
  },
];

type Grammar = {
  bad: readonly number[];
  lead: readonly number[];
  trail: readonly number[];
  native: readonly number[];
  nativeLow?: readonly number[];
  hiTrail?: readonly number[];
};

export const mbcsPrefix = (
  mv: number,
  data: Uint8Array,
  n: number,
  highTotal: number,
  firstHigh: number,
): number => {
  let alive = 0;
  for (let a = 0; a < mv; a++) {
    const m = mbcsOrder[a];
    mbcsNat[m] = 0;
    mbcsChars[m] = 0;
    mbcsDelta[2 * m] = 0;
    mbcsDelta[2 * m + 1] = 0;
    mbcsTrail[m] = 0;
    mbcsExtra[m] = 0;
    if (mbcsBound(m, highTotal) < pruneThreshold()) continue;
    const i = scanMbcs(
      m,
      data,
      firstHigh,
      n - firstHigh > MBCS_PREFIX ? firstHigh + MBCS_PREFIX : n,
      n,
    );
    if (i < 0) continue;
    const ub = mbcsBound(m, highTotal);
    if (i >= n) {
      addCandidate(MBCS_OFFSET + m, ub, mbcsLang);
      continue;
    }
    mbcsPos[m] = i;
    const rate = mbcsRate[m];
    let k = alive++;
    while (k > 0 && mbcsRate[mbcsAlive[k - 1]] < rate) {
      mbcsAlive[k] = mbcsAlive[k - 1];
      k--;
    }
    mbcsAlive[k] = m;
  }
  return alive;
};

export const mbcsComplete = (
  alive: number,
  count: number,
  data: Uint8Array,
  n: number,
  highTotal: number,
): number => {
  let done = 0;
  while (done < count && done < alive) {
    const m = mbcsAlive[done++];
    const t = pruneThreshold();
    if (mbcsBound(m, highTotal) < t) continue;
    let i = mbcsPos[m];
    for (;;) {
      i = scanMbcs(m, data, i, n - i > MBCS_CHUNK ? i + MBCS_CHUNK : n, n);
      if (i < 0) break;
      const ub = mbcsBound(m, highTotal);
      if (i >= n) {
        addCandidate(MBCS_OFFSET + m, ub, mbcsLang);
        break;
      }
      if (ub < t) break;
    }
  }
  for (let a = done; a < alive; a++) mbcsAlive[a - done] = mbcsAlive[a];
  return alive - done;
};

const mbcsBound = (m: number, highTotal: number): number => {
  const nat = mbcsNat[m];
  const chars = mbcsChars[m];
  const trail = mbcsTrail[m];
  const highDone = 2 * chars + mbcsExtra[m] - trail;
  const remHigh = highTotal - highDone;
  const asciiMin = Math.max(0, asciiTotal - trail - remHigh);
  const charsMin = Math.ceil(remHigh / MBCS_MAX_HIGH_PER_CHAR[m]);
  const first = MODEL_FIRST[m];
  const end = MODEL_FIRST[m + 1];
  let best = -Infinity;
  let bestScanned = -Infinity;
  for (let k = first; k < end; k++) {
    const scanned = mbcsDelta[2 * m + k - first] + nat * MODEL_NATIVE_W[k] + (chars - nat) * OOS;
    const v = scanned + asciiMin * MODEL_ASCII_W[k] + charsMin * MBCS_MAX_CHAR_W[k];
    if (v > best) {
      best = v;
      mbcsLang = MODEL_LANG[k];
    }
    if (scanned > bestScanned) bestScanned = scanned;
  }
  mbcsRate[m] = highDone > 0 ? bestScanned / highDone : 0;
  return best;
};

const MBCS_PREFIX = 256;
const MBCS_CHUNK = 1024;
const MBCS_MAX_HIGH_PER_CHAR = Int32Array.of(2, 3, 2, 2, 2, 2);
const mbcsAlive = new Int32Array(NUM_MBCS);
let mbcsLang = -1;
const { ASCII_REST, NONASCII_REST } = model;
const {
  HSHIFT,
  HOFF,
  HMUL,
  HKD0,
  HD1,
  NATW,
  TRAIL_CLASS,
  CP949_HITRAIL,
  MODEL_FIRST,
  MODEL_LANG,
  MODEL_ASCII_W,
  MODEL_NATIVE_W,
  MBCS_MAX_CHAR_W,
  MBCS_INVALID,
} = mbcsModel;
const { mbcsNat, mbcsChars, mbcsDelta, mbcsTrail, mbcsExtra, mbcsPos, mbcsRate, mbcsOrder } =
  scratch;
