import {
  NUM_SBCS,
  SBCS_INT_MAX,
  SBCS_OFFSET,
  addCandidate,
  model,
  nH,
  pruneThreshold,
  scratch,
} from "./model.js";

export const scoreSbcs = (nv: number, n: number): void => {
  byCount(n > SBCS_INT_MAX);
  if (n <= SBCS_INT_MAX) scoreSbcsI32(nv);
  else scoreSbcsF64(nv);
};

// Reorders the high-byte histogram by count bit length, largest first. Every weight is <= 0 and
// sums cannot overflow, so partial sums only fall: the result does not depend on term order, but
// losing languages cross the pruning threshold after fewer terms.
const byCount = (f64: boolean): void => {
  bucket.fill(0);
  for (let j = 0; j < nH; j = (j + 1) | 0) {
    const k = Math.clz32(cntH32[j]);
    bucket[k] = bucket[k] + 1;
  }
  for (let k = 0, at = 0; k < 33; k = (k + 1) | 0) {
    const c = bucket[k];
    bucket[k] = at;
    at = (at + c) | 0;
  }
  for (let j = 0; j < nH; j = (j + 1) | 0) {
    const c = cntH32[j];
    const k = Math.clz32(c);
    const at = bucket[k];
    bucket[k] = (at + 1) | 0;
    tmpB[at] = actH[j];
    tmpC[at] = c;
  }
  for (let j = 0; j < nH; j = (j + 1) | 0) {
    actH[j] = tmpB[j];
    cntH32[j] = tmpC[j];
    if (f64) cntH[j] = tmpC[j];
  }
};

const scoreSbcsI32 = (nv: number): void => {
  const t0 = pruneThreshold();
  if (t0 > -Infinity) {
    let u = 0;
    for (let j = 0; j < nH; j = (j + 1) | 0) u = (u + cntH32[j] * GMAX[actH[j]]) | 0;
    if (u < t0) return;
  }

  let e0 = 0;
  for (; e0 + 8 <= NUM_SBCS; e0 = (e0 + 8) | 0) {
    let u0 = 0,
      u1 = 0,
      u2 = 0,
      u3 = 0,
      u4 = 0,
      u5 = 0,
      u6 = 0,
      u7 = 0;
    for (let j = 0; j < nH; j = (j + 1) | 0) {
      const c = cntH32[j];
      const base = (actH[j] * NUM_SBCS + e0) | 0;
      u0 = (u0 + c * WMAXT[base]) | 0;
      u1 = (u1 + c * WMAXT[base + 1]) | 0;
      u2 = (u2 + c * WMAXT[base + 2]) | 0;
      u3 = (u3 + c * WMAXT[base + 3]) | 0;
      u4 = (u4 + c * WMAXT[base + 4]) | 0;
      u5 = (u5 + c * WMAXT[base + 5]) | 0;
      u6 = (u6 + c * WMAXT[base + 6]) | 0;
      u7 = (u7 + c * WMAXT[base + 7]) | 0;
    }
    ubound32[e0] = u0;
    ubound32[e0 + 1] = u1;
    ubound32[e0 + 2] = u2;
    ubound32[e0 + 3] = u3;
    ubound32[e0 + 4] = u4;
    ubound32[e0 + 5] = u5;
    ubound32[e0 + 6] = u6;
    ubound32[e0 + 7] = u7;
  }
  for (; e0 < NUM_SBCS; e0 = (e0 + 1) | 0) {
    let acc = 0;
    for (let j = 0; j < nH; j = (j + 1) | 0)
      acc = (acc + cntH32[j] * WMAXT[actH[j] * NUM_SBCS + e0]) | 0;
    ubound32[e0] = acc;
  }
  rankEncodings(nv, ubound32);

  let prevE = -1;
  let prevBest = -Infinity;
  let prevLang = -1;
  langHint.fill(-1);
  for (let a = 0; a < nv; a++) {
    const e = sbcsOrder[a];
    const t = pruneThreshold();
    const ue = ubound32[e];
    if (ue < t) break;
    let eBest = -Infinity;
    let eLang = -1;
    if (prevE >= 0 && ue === ubound32[prevE] && sameOnPresent(e, prevE)) {
      eBest = prevBest;
      eLang = prevLang;
    } else {
      const s = SBCS_SCRIPT[e];
      const first = SCRIPT_FIRST[s];
      const count = SCRIPT_COUNT[s];
      const last = first + count;
      const poff = pairOff[e] - first;
      // Start from the language that won the previous encoding of this script: a high eBest early
      // prunes the others sooner, and ties still go to the lowest l.
      let l = langHint[s] >= 0 ? langHint[s] : first;
      for (let k = 0; k < count; k++, l = l + 1 === last ? first : l + 1) {
        const thr = eBest > t ? eBest : t;
        let v = 0;
        const pw = ((poff + l) * 128) | 0;
        let j = 0;
        for (; j + 1 < nH; j = (j + 2) | 0) {
          v =
            (v + cntH32[j] * pairW[(pw + actH[j]) | 0] + cntH32[j + 1] * pairW[(pw + actH[j + 1]) | 0]) |
            0;
          if (v < thr) break;
        }
        if (j + 1 < nH) continue;
        if (j < nH) {
          v = (v + cntH32[j] * pairW[(pw + actH[j]) | 0]) | 0;
          if (v < thr) continue;
        }
        if (v > eBest || (v === eBest && l < eLang)) {
          eBest = v;
          eLang = l;
        }
      }
      if (eLang >= 0) langHint[s] = eLang;
      prevE = e;
      prevBest = eBest;
      prevLang = eLang;
    }
    if (eLang >= 0 && eBest >= t) addCandidate(SBCS_OFFSET + e, eBest, eLang);
  }
};

const scoreSbcsF64 = (nv: number): void => {
  const t0 = pruneThreshold();
  if (t0 > -Infinity) {
    let u = 0;
    for (let j = 0; j < nH; j = (j + 1) | 0) u += cntH[j] * GMAX[actH[j]];
    if (u < t0) return;
  }

  ubound.fill(0);
  for (let j = 0; j < nH; j = (j + 1) | 0) {
    const c = cntH[j];
    const base = actH[j] * NUM_SBCS;
    for (let e = 0; e < NUM_SBCS; e = (e + 1) | 0) ubound[e] = ubound[e] + c * WMAXT[base + e];
  }
  rankEncodings(nv, ubound);

  let prevE = -1;
  let prevBest = -Infinity;
  let prevLang = -1;
  langHint.fill(-1);
  for (let a = 0; a < nv; a++) {
    const e = sbcsOrder[a];
    const t = pruneThreshold();
    const ue = ubound[e];
    if (ue < t) break;
    let eBest = -Infinity;
    let eLang = -1;
    if (prevE >= 0 && ue === ubound[prevE] && sameOnPresent(e, prevE)) {
      eBest = prevBest;
      eLang = prevLang;
    } else {
      const s = SBCS_SCRIPT[e];
      const first = SCRIPT_FIRST[s];
      const count = SCRIPT_COUNT[s];
      const last = first + count;
      const poff = pairOff[e] - first;
      // Start from the language that won the previous encoding of this script: a high eBest early
      // prunes the others sooner, and ties still go to the lowest l.
      let l = langHint[s] >= 0 ? langHint[s] : first;
      for (let k = 0; k < count; k++, l = l + 1 === last ? first : l + 1) {
        const thr = eBest > t ? eBest : t;
        let v = 0;
        const pw = ((poff + l) * 128) | 0;
        let j = 0;
        for (; j < nH; j = (j + 1) | 0) {
          v += cntH[j] * pairW[(pw + actH[j]) | 0];
          if (v < thr) break;
        }
        if (j < nH) continue;
        if (v > eBest || (v === eBest && l < eLang)) {
          eBest = v;
          eLang = l;
        }
      }
      if (eLang >= 0) langHint[s] = eLang;
      prevE = e;
      prevBest = eBest;
      prevLang = eLang;
    }
    if (eLang >= 0 && eBest >= t) addCandidate(SBCS_OFFSET + e, eBest, eLang);
  }
};

const rankEncodings = (nv: number, ub: Float64Array | Int32Array): void => {
  for (let a = 1; a < nv; a++) {
    const e = sbcsOrder[a];
    const ue = ub[e];
    let k = a;
    while (k > 0 && ub[sbcsOrder[k - 1]] < ue) {
      sbcsOrder[k] = sbcsOrder[k - 1];
      k--;
    }
    sbcsOrder[k] = e;
  }
};

const sameOnPresent = (e: number, prevE: number): boolean => {
  if (SBCS_SCRIPT[e] !== SBCS_SCRIPT[prevE]) return false;
  const ke = e * 128;
  const kp = prevE * 128;
  for (let j = 0; j < nH; j = (j + 1) | 0)
    if (SBCS_KEY[ke + actH[j]] !== SBCS_KEY[kp + actH[j]]) return false;
  return true;
};

const langHint = new Int32Array(16);
const bucket = new Int32Array(33);
const tmpB = new Uint8Array(128);
const tmpC = new Int32Array(128);
const ubound = new Float64Array(NUM_SBCS);
const ubound32 = new Int32Array(NUM_SBCS);
const { SBCS_SCRIPT, SCRIPT_FIRST, SCRIPT_COUNT, pairOff, pairW, WMAXT, GMAX, SBCS_KEY } = model;
const { actH, cntH, cntH32, sbcsOrder } = scratch;
