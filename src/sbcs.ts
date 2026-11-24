import {
  NUM_LANGS,
  NUM_LATIN,
  NUM_SCRIPTS,
  NUM_SBCS,
  SBCS_INT_MAX,
  SBCS_OFFSET,
  addCandidate,
  asciiTotal,
  model,
  nA,
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
    for (let j = 0; j < nA; j = (j + 1) | 0) u = (u + cntA32[j] * AMAX[actA[j]]) | 0;
    for (let j = 0; j < nH; j = (j + 1) | 0) u = (u + cntH32[j] * GMAX[actH[j]]) | 0;
    if (u < t0) return;
  }

  let a0 = 0,
    a1 = 0,
    a2 = 0,
    a3 = 0,
    a4 = 0,
    a5 = 0,
    a6 = 0,
    a7 = 0;
  for (let j = 0; j < nA; j = (j + 1) | 0) {
    const c = cntA32[j];
    const base = actA[j] << 4;
    a0 = (a0 + c * AWT[base]) | 0;
    a1 = (a1 + c * AWT[base + 1]) | 0;
    a2 = (a2 + c * AWT[base + 2]) | 0;
    a3 = (a3 + c * AWT[base + 3]) | 0;
    a4 = (a4 + c * AWT[base + 4]) | 0;
    a5 = (a5 + c * AWT[base + 5]) | 0;
    a6 = (a6 + c * AWT[base + 6]) | 0;
    a7 = (a7 + c * AWT[base + 7]) | 0;
  }
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0,
    b7 = 0;
  for (let j = 0; j < nA; j = (j + 1) | 0) {
    const c = cntA32[j];
    const base = actA[j] << 4;
    b0 = (b0 + c * AWT[base + 8]) | 0;
    b1 = (b1 + c * AWT[base + 9]) | 0;
    b2 = (b2 + c * AWT[base + 10]) | 0;
    b3 = (b3 + c * AWT[base + 11]) | 0;
    b4 = (b4 + c * AWT[base + 12]) | 0;
    b5 = (b5 + c * AWT[base + 13]) | 0;
    b6 = (b6 + c * AWT[base + 14]) | 0;
    b7 = (b7 + c * AWT[base + 15]) | 0;
  }
  latAcc32[0] = a0;
  latAcc32[1] = a1;
  latAcc32[2] = a2;
  latAcc32[3] = a3;
  latAcc32[4] = a4;
  latAcc32[5] = a5;
  latAcc32[6] = a6;
  latAcc32[7] = a7;
  latAcc32[8] = b0;
  latAcc32[9] = b1;
  latAcc32[10] = b2;
  latAcc32[11] = b3;
  latAcc32[12] = b4;
  latAcc32[13] = b5;
  latAcc32[14] = b6;
  latAcc32[15] = b7;
  for (let l = 0; l < NUM_LANGS; l++)
    langAsciiLL[l] = l < NUM_LATIN ? latAcc32[l] : asciiTotal * ASCII_REST[l];
  rankLanguages();

  for (let e = 0; e < NUM_SBCS; e++) ubound32[e] = scriptMaxAscii[SBCS_SCRIPT[e]] | 0;
  let e0 = 0;
  for (; e0 + 8 <= NUM_SBCS; e0 = (e0 + 8) | 0) {
    let u0 = ubound32[e0],
      u1 = ubound32[e0 + 1];
    let u2 = ubound32[e0 + 2],
      u3 = ubound32[e0 + 3];
    let u4 = ubound32[e0 + 4],
      u5 = ubound32[e0 + 5];
    let u6 = ubound32[e0 + 6],
      u7 = ubound32[e0 + 7];
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
    let acc = ubound32[e0];
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
      for (let r = first; r < last; r++) {
        const l = langOrder[r];
        const thr = eBest > t ? eBest : t;
        let v = langAsciiLL[l] | 0;
        if (v < thr) break;
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
    for (let j = 0; j < nA; j = (j + 1) | 0) u += cntA[j] * AMAX[actA[j]];
    for (let j = 0; j < nH; j = (j + 1) | 0) u += cntH[j] * GMAX[actH[j]];
    if (u < t0) return;
  }

  latAcc.fill(0);
  for (let j = 0; j < nA; j = (j + 1) | 0) {
    const c = cntA[j];
    const base = actA[j] << 4;
    for (let li = 0; li < 16; li = (li + 1) | 0) latAcc[li] = latAcc[li] + c * AWT[base + li];
  }
  for (let l = 0; l < NUM_LANGS; l++)
    langAsciiLL[l] = l < NUM_LATIN ? latAcc[l] : asciiTotal * ASCII_REST[l];
  rankLanguages();

  for (let e = 0; e < NUM_SBCS; e++) ubound[e] = scriptMaxAscii[SBCS_SCRIPT[e]];
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
      for (let r = first; r < last; r++) {
        const l = langOrder[r];
        const thr = eBest > t ? eBest : t;
        let v = langAsciiLL[l];
        if (v < thr) break;
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

const rankLanguages = (): void => {
  for (let s = 0; s < NUM_SCRIPTS; s++) scriptMaxAscii[s] = -Infinity;
  for (let l = 0; l < NUM_LANGS; l++) {
    const v = langAsciiLL[l];
    const s = LANG_SCRIPT[l];
    if (v > scriptMaxAscii[s]) scriptMaxAscii[s] = v;
    let k = l;
    const first = SCRIPT_FIRST[s];
    while (k > first && langAsciiLL[langOrder[k - 1]] < v) {
      langOrder[k] = langOrder[k - 1];
      k--;
    }
    langOrder[k] = l;
  }
};

const rankEncodings = (nv: number, ub: Int32Array | Float64Array): void => {
  for (let a = 1; a < nv; a++) {
    const e = sbcsOrder[a];
    const u = ub[e];
    let k = a;
    while (k > 0 && ub[sbcsOrder[k - 1]] < u) {
      sbcsOrder[k] = sbcsOrder[k - 1];
      k--;
    }
    sbcsOrder[k] = e;
  }
};

const sameOnPresent = (e1: number, e2: number): boolean => {
  if (SBCS_SCRIPT[e1] !== SBCS_SCRIPT[e2]) return false;
  const o1 = e1 * 128;
  const o2 = e2 * 128;
  for (let j = 0; j < nH; j = (j + 1) | 0) {
    const b = actH[j];
    if (SBCS_KEY[o1 + b] !== SBCS_KEY[o2 + b]) return false;
  }
  return true;
};

const {
  SBCS_SCRIPT,
  LANG_SCRIPT,
  ASCII_REST,
  SCRIPT_FIRST,
  SCRIPT_COUNT,
  pairOff,
  pairW,
  AWT,
  AMAX,
  WMAXT,
  GMAX,
  SBCS_KEY,
} = model;
const { actA, cntA, cntA32, actH, cntH, cntH32, sbcsOrder } = scratch;
const langAsciiLL = new Float64Array(NUM_LANGS);
const scriptMaxAscii = new Float64Array(NUM_SCRIPTS);
const latAcc = new Float64Array(16);
const latAcc32 = new Int32Array(16);
const ubound = new Float64Array(NUM_SBCS);
const ubound32 = new Int32Array(NUM_SBCS);
const langOrder = new Int32Array(NUM_LANGS);
