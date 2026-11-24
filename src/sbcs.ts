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
  if (n <= SBCS_INT_MAX) scoreSbcsI32(nv);
  else scoreSbcsF64(nv);
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
      const last = first + SCRIPT_COUNT[s];
      const poff = pairOff[e] - first;
      for (let l = first; l < last; l++) {
        const thr = eBest > t ? eBest : t;
        let v = 0;
        const pw = ((poff + l) * 128) | 0;
        let j = 0;
        for (; j < nH; j = (j + 1) | 0) {
          v = (v + cntH32[j] * pairW[(pw + actH[j]) | 0]) | 0;
          if (v < thr) break;
        }
        if (j < nH) continue;
        if (v > eBest || (v === eBest && l < eLang)) {
          eBest = v;
          eLang = l;
        }
      }
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
      const last = first + SCRIPT_COUNT[s];
      const poff = pairOff[e] - first;
      for (let l = first; l < last; l++) {
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

const ubound = new Float64Array(NUM_SBCS);
const ubound32 = new Int32Array(NUM_SBCS);
const { SBCS_SCRIPT, SCRIPT_FIRST, SCRIPT_COUNT, pairOff, pairW, WMAXT, GMAX, SBCS_KEY } = model;
const { actH, cntH, cntH32, sbcsOrder } = scratch;
