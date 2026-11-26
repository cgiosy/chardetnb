export const NUM_ENC = 47;
export const POOL32_LO = 0xffffefff;
export const POOL32_HI = 0x1;
export const POOL47_LO = 0xffffffff;
export const POOL47_HI = 0x7fff;

export const ENC_NAMES =
  "ASCII,UTF-8,UTF-16BE,UTF-16LE,UTF-32BE,UTF-32LE,ISO-2022-JP,ISO-2022-KR,ISO-2022-CN,Shift_JIS,EUC-JP,EUC-KR,CP949,GB18030,Big5,ISO-8859-1,ISO-8859-2,ISO-8859-5,ISO-8859-6,ISO-8859-7,ISO-8859-8,ISO-8859-9,KOI8-R,windows-874,windows-1250,windows-1251,windows-1252,windows-1253,windows-1254,windows-1255,windows-1256,windows-1257,windows-1258,KOI8-U,IBM866,IBM855,macintosh,x-mac-cyrillic,ISO-8859-3,ISO-8859-4,ISO-8859-10,ISO-8859-13,ISO-8859-14,ISO-8859-15,ISO-8859-16,CP850,CP852".split(
    ",",
  );
export const LANG_NAMES =
  "en,fr,de,es,cs,pl,ro,hu,pt,it,mt,lv,lt,et,is,cy,tr,vi,ru,uk,sr,el,ar,he,th,ko,ja,zh-Hans,zh-Hant".split(
    ",",
  );

export type Result = {
  encId: number;
  langId: number;
  encoding: string | null;
  language: string | null;
  confidence: number;
  marginBits: number;
};


const I32 = (n: number): Int32Array => new Int32Array(n);

const HI = 0x80808080 | 0;
const LO20 = 0x20202020;
const LO01 = 0x01010101;
const IS_LE = new Uint8Array(Int32Array.of(1).buffer)[0] === 1;
const NO_WORDS = I32(0);

const SBCS_SCRIPT = I32(32);
const CANON_RANK = I32(47);
const SBCS_KEY = I32(4096);
const HMUL = I32(5);
const MODEL_LANG = I32(8);
const REST = I32(29);
const MBCS_NEG_RATE2 = I32(16);

const SCRIPT_META = Int32Array.of(0, 18, 21, 23, 22, 24, 18, 3, 1, 1, 1, 1);
const SBCS_INVALID = I32(128);
const pairOff = I32(32);
const pairW = new Int16Array(420 * 128);
const WMAXT = new Int16Array(128 * 32);
const GMAX = I32(128);

const HKD0 = I32(2560);
const HD1 = I32(2560);
const NATW = new Uint16Array(1536);
const TRAIL_CLASS = new Uint8Array(1536);
const MBCS_INVALID = I32(24);

const hist = I32(256);
const bank2 = I32(256);
const actH = I32(128);
const cntH32 = I32(128);
const hmask = I32(4);
const candLang = I32(47);
const candLL = new Float64Array(47);
const EXP2 = new Float64Array(316);
const mbcsSt = new Float64Array(48);
const mbcsOrder = I32(6);
const sbcsOrder = I32(32);
const langHint = I32(16);
const bucket = I32(33);
const tmpB = I32(128);
const tmpC = I32(128);
const ubound32 = I32(32);

let initialized = false;
let asciiDirty = false;
let curTrunc = false;
let curN = 0;
let curHigh = 0;
let scanCtl = 0;
let wordCtl = 0;
let nH = 0;
let asciiTotal = 0;
let candMask0 = 0;
let candMask1 = 0;
let bestLL = -Infinity;
let secondLL = -Infinity;
let mbcsLang = -1;

export const newResult = (): Result => setResult({} as Result, -1);

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
  if (len === 0) return setResult(out, -1);
  const n = sampleLimit > 0 && len > sampleLimit ? sampleLimit : len;
  const truncated = n < len;

  const w16 = n >= 2 ? (data[0] << 8) | data[1] : -1;
  const w32 = n >= 4 ? ((w16 << 16) | (data[2] << 8) | data[3]) >>> 0 : -1;
  const b32 = w32 === 0xfeff ? 4 : w32 === 0xfffe0000 ? 5 : -1;
  if (b32 >= 0 && validUtf(data, n & ~3, b32, poolLo, poolHi, false)) return ok(out, b32);
  const b16 = w16 === 0xfeff ? 2 : w16 === 0xfffe ? 3 : -1;
  if (b16 >= 0 && validUtf(data, n & ~1, b16, poolLo, poolHi, truncated)) return ok(out, b16);

  const head = (4 - (data.byteOffset & 3)) & 3;
  const words =
    IS_LE && n >= 32
      ? new Int32Array(data.buffer, data.byteOffset + head, (n - head) >>> 2)
      : NO_WORDS;
  const firstHigh = asciiPrefix(data, n, words, head);
  let controls = scanCtl;
  if (firstHigh < n) {
    if (inPool(poolLo, poolHi, 1) && utf8Scan(data, firstHigh, n, truncated, words, head)) {
      controls |= scanCtl;
      if (controls & 1) return detectNul(data, n, poolLo, poolHi, truncated, out);
      return controls & ~15872 ? setResult(out, -1) : ok(out, 1);
    }
    countHigh(data, firstHigh, n, words, head);
    controls |= compactHistogram(n);
  } else {
    nH = 0;
    asciiTotal = n;
  }
  if (controls & 1) return detectNul(data, n, poolLo, poolHi, truncated, out);
  if (nH === 0) {
    if ((controls & ~15872) === 0) {
      if (inPool(poolLo, poolHi, 0)) return ok(out, 0);
      if (inPool(poolLo, poolHi, 1)) return ok(out, 1);
    } else if (controls & (1 << 27) && !(controls & 0xf7ff01fe)) {
      const iso = detectIso2022(data, n, poolLo, poolHi);
      if (iso >= 0) return ok(out, iso);
    }
  }
  if (controls & ~15872) return setResult(out, -1);

  candMask0 = candMask1 = 0;
  bestLL = secondLL = -Infinity;
  hmask.fill(0);
  for (let j = 0; j < nH; j++) {
    const b = actH[j];
    hmask[b >> 5] |= 1 << (b & 31);
  }
  const mv = selectValid(6, 9, MBCS_INVALID, mbcsOrder, poolLo, poolHi);
  const nv = selectValid(32, 15, SBCS_INVALID, sbcsOrder, poolLo, poolHi);
  curN = n;
  curTrunc = truncated;
  curHigh = n - asciiTotal;
  const dense = curHigh * 4 >= n;
  if (!dense && nv > 0) scoreSbcs(nv, n);
  let alive = mbcsPrefix(mv, data, firstHigh, words, head);
  if (dense) {
    alive = mbcsComplete(alive, 1, data, words, head);
    if (nv > 0) scoreSbcs(nv, n);
  }
  mbcsComplete(alive, alive, data, words, head);
  return finish(out);
};

const inPool = (lo: number, hi: number, id: number): boolean =>
  id < 32 ? ((lo >>> id) & 1) !== 0 : ((hi >>> (id - 32)) & 1) !== 0;

const ok = (out: Result, enc: number): Result => setResult(out, enc, -1, 1, 99);

const setResult = (
  out: Result,
  encId: number,
  langId = -1,
  confidence = 0,
  marginBits = 0,
): Result => {
  out.encId = encId;
  out.langId = langId;
  out.encoding = encId >= 0 ? ENC_NAMES[encId] : null;
  out.language = langId >= 0 ? LANG_NAMES[langId] : null;
  out.confidence = confidence;
  out.marginBits = marginBits;
  return out;
};

const asciiPrefix = (data: Uint8Array, n: number, words: Int32Array, head: number): number => {
  let ctl = 0;
  let i = 0;
  wordCtl = 0;
  if (words.length !== 0) {
    for (; i < head; i = (i + 1) | 0) {
      const b = data[i];
      if (b >= 0x80) break;
      if (b < 0x20 || b === 0x7f) ctl |= 1 << (b & 31);
    }
    if (i === head) i = (head + (skipAscii(data, words, 0, head) << 2)) | 0;
  }
  for (; i < n; i = (i + 1) | 0) {
    const b = data[i];
    if (b >= 0x80) break;
    if (b < 0x20 || b === 0x7f) ctl |= 1 << (b & 31);
  }
  scanCtl = ctl | wordCtl;
  return i;
};

const skipAscii = (data: Uint8Array, words: Int32Array, j: number, head: number): number => {
  const wn = words.length | 0;
  const wn4 = (wn - 3) | 0;
  j = j | 0;
  while (j < wn4) {
    const w0 = words[j];
    const w1 = words[j + 1];
    const w2 = words[j + 2];
    const w3 = words[j + 3];
    if (
      (((w0 | (w0 - LO20) | (w0 + LO01)) |
        (w1 | (w1 - LO20) | (w1 + LO01)) |
        (w2 | (w2 - LO20) | (w2 + LO01)) |
        (w3 | (w3 - LO20) | (w3 + LO01))) &
        HI) ===
      0
    ) {
      j += 4;
      continue;
    }
    for (let k = 0; k < 4; k++) {
      const w = words[j + k];
      if (((w | (w - LO20) | (w + LO01)) & HI) === 0) continue;
      if ((w & HI) !== 0) return j + k;
      ctlWord(data, w, (head + ((j + k) << 2)) | 0);
    }
    j += 4;
  }
  for (; j < wn; j++) {
    const w = words[j];
    if (((w | (w - LO20) | (w + LO01)) & HI) === 0) continue;
    if ((w & HI) !== 0) return j;
    ctlWord(data, w, (head + (j << 2)) | 0);
  }
  return wn;
};

const ctlWord = (data: Uint8Array, w: number, p: number): void => {
  if ((((~(w + 0x60606060) & (~(w + 0x77777777) | (w + 0x72727272))) | (w + LO01)) & HI) !== 0)
    for (let k = p; k < p + 4; k = (k + 1) | 0) {
      const b = data[k];
      if (b < 0x20 || b === 0x7f) wordCtl |= 1 << (b & 31);
    }
};

const utf8Slow = (data: Uint8Array, i: number, n: number, truncated: boolean): number => {
  const b = data[i];
  const cut = truncated ? n : -1;
  if (b < 0xc2 || b === 0xee || b > 0xf4) return -1;
  if (++i >= n) return cut;
  const b1 = data[i];
  if (b < 0xe0) return (b1 & 0xc0) === 0x80 ? i + 1 : -1;
  if (b < 0xf0) {
    if (b1 < (b === 0xe0 ? 0xa0 : b === 0xef ? 0xa4 : 0x80) || b1 > (b === 0xed ? 0x9f : 0xbf))
      return -1;
    if (++i >= n) return cut;
    const b2 = data[i];
    return b2 >= 0x80 && b2 <= (b === 0xef && b1 === 0xbf ? 0xbc : 0xbf) ? i + 1 : -1;
  }
  if (b1 < (b === 0xf0 ? 0x90 : 0x80) || b1 > (b === 0xf4 ? 0x8f : 0xbf)) return -1;
  if (++i >= n) return cut;
  const b2 = data[i];
  if ((b2 & 0xc0) !== 0x80) return -1;
  if (++i >= n) return cut;
  const b3 = data[i];
  return b3 >= 0x80 && b3 <= ((b1 & 15) === 15 && b2 === 0xbf ? 0xbd : 0xbf) ? i + 1 : -1;
};

const utf8Scan = (
  data: Uint8Array,
  i: number,
  n: number,
  truncated: boolean,
  words: Int32Array,
  head: number,
): boolean => {
  i = i | 0;
  n = n | 0;
  const safeEnd = (n - 3) | 0;
  let ctl = 0;
  wordCtl = 0;
  while (i < safeEnd) {
    let b = data[i];
    if (b < 0x80) {
      if (b < 0x20 || b === 0x7f) ctl |= 1 << (b & 31);
      i++;
      if (((i - head) & 3) === 0 && words.length !== 0)
        i = (head + (skipAscii(data, words, (i - head) >> 2, head) << 2)) | 0;
      continue;
    }
    if (b >= 0xe1 && b <= 0xec) {
      do {
        if (((data[i + 1] ^ 0x80) | (data[i + 2] ^ 0x80)) >= 0x40) return false;
        i += 3;
      } while (i < safeEnd && (b = data[i]) >= 0xe1 && b <= 0xec);
      continue;
    }
    if (b < 0xe0) {
      if (b < 0xc2) return false;
      do {
        if ((data[i + 1] & 0xc0) !== 0x80) return false;
        i += 2;
      } while (i < safeEnd && (b = data[i]) >= 0xc2 && b < 0xe0);
      continue;
    }
    if (b < 0xf0) {
      if (b === 0xee) return false;
      const b1 = data[i + 1];
      if (b1 < (b === 0xe0 ? 0xa0 : b === 0xef ? 0xa4 : 0x80) || b1 > (b === 0xed ? 0x9f : 0xbf))
        return false;
      const b2 = data[i + 2];
      if (b2 < 0x80 || b2 > (b === 0xef && b1 === 0xbf ? 0xbc : 0xbf)) return false;
      i += 3;
    } else {
      if (b > 0xf4) return false;
      const b1 = data[i + 1];
      if (b1 < (b === 0xf0 ? 0x90 : 0x80) || b1 > (b === 0xf4 ? 0x8f : 0xbf)) return false;
      const b2 = data[i + 2];
      if ((b2 & 0xc0) !== 0x80) return false;
      const b3 = data[i + 3];
      if (b3 < 0x80 || b3 > ((b1 & 15) === 15 && b2 === 0xbf ? 0xbd : 0xbf)) return false;
      i += 4;
    }
  }
  while (i < n) {
    const b = data[i];
    if (b < 0x80) {
      if (b < 0x20 || b === 0x7f) ctl |= 1 << (b & 31);
      i++;
    } else {
      i = utf8Slow(data, i, n, truncated);
      if (i < 0) return false;
    }
  }
  scanCtl = ctl | wordCtl;
  return true;
};

const validUtf = (
  data: Uint8Array,
  len: number,
  e: number,
  poolLo: number,
  poolHi: number,
  truncated: boolean,
): boolean => {
  if (e < 0 || !inPool(poolLo, poolHi, e)) return false;
  const dv = new DataView(data.buffer, data.byteOffset, len);
  const le = (e & 1) !== 0;
  const okCp = (cp: number): boolean =>
    cp < 0x7f
      ? cp >= 0x20 || (cp >= 0x09 && cp <= 0x0d)
      : cp > 0x9f && (cp < 0xd800 || (cp > 0xf8ff && cp <= 0x10ffff && cp !== 0xfffd && (cp & 0xfffe) !== 0xfffe));
  if (e > 3) {
    for (let i = 0; i < len; i += 4) if (!okCp(dv.getUint32(i, le))) return false;
    return true;
  }
  for (let i = 0; i < len; i += 2) {
    const u = dv.getUint16(i, le);
    if (u >= 0xd800 && u <= 0xdbff) {
      if (i + 2 >= len) return truncated;
      const u2 = dv.getUint16((i += 2), le);
      if (u2 < 0xdc00 || u2 > 0xdfff) return false;
    } else if (!okCp(u)) return false;
  }
  return true;
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
  if ((n32 & 3) === 0 && n32 >= 4)
    for (const e of [4, 5]) if (validUtf(data, n32, e, poolLo, poolHi, false)) return ok(out, e);
  const n16 = truncated ? n & ~1 : n;
  if ((n16 & 1) === 0 && n16 >= 2) {
    let even = 0, odd = 0;
    for (let i = 0; i < n16; i += 2) {
      if (!data[i]) even++;
      if (!data[i + 1]) odd++;
    }
    const e = even > odd * 2 ? 2 : odd > even * 2 ? 3 : -1;
    if (validUtf(data, n16, e, poolLo, poolHi, truncated)) return ok(out, e);
  }
  return setResult(out, -1);
};

const detectIso2022 = (data: Uint8Array, len: number, poolLo: number, poolHi: number): number => {
  let found = 0;
  for (let i = 0; i + 2 < len; i++) {
    if (data[i] !== 27) continue;
    const b1 = data[i + 1], b2 = data[i + 2], b3 = i + 3 < len ? data[i + 3] : 0;
    found |=
      b1 === 40 && (b2 === 73 || b2 === 74)
        ? 64
        : b1 !== 36
          ? 0
          : b2 === 64 || b2 === 66 || (b2 === 40 && b3 === 68)
            ? 64
            : b2 === 41 && b3 === 67
              ? 128
              : (b2 === 41 && (b3 === 65 || b3 === 71)) || (b2 === 42 && b3 === 72) || (b2 === 43 && b3 >= 73 && b3 <= 77)
                ? 256
                : 0;
  }
  for (const e of [7, 8, 6]) if (found & (1 << e) && inPool(poolLo, poolHi, e)) return e;
  return -1;
};

const countBytes = (data: Uint8Array, i: number, end: number): void => {
  for (; i < end; i++) {
    const b = data[i];
    if (b >= 0x80 || b < 0x20 || b === 0x7f) hist[b]++;
  }
};

const countHigh = (data: Uint8Array, i: number, n: number, words: Int32Array, head: number): void => {
  i = i | 0;
  n = n | 0;
  if (words.length !== 0) {
    const aEnd = i + ((head - i) & 3);
    const lim = aEnd < n ? aEnd : n;
    countBytes(data, i, lim);
    i = lim;
    const wn = words.length;
    let j = (i - head) >> 2;
    if (j < wn) {
      asciiDirty = true;
      if (wn - j < 64) countSparse(words, j, wn);
      else {
        let banked = false;
        while (j < wn) {
          const end = j + 4096 < wn ? j + 4096 : wn;
          const pe = j + 16 < end ? j + 16 : end;
          let clean = 0;
          let rep = 0;
          for (let k = j; k < pe; k++) {
            const w = words[k];
            if (((w | (w - LO20) | (w + LO01)) & HI) === 0) clean++;
            const x = w ^ (w >>> 16);
            if (((x & 0xff) === 0 && (w & 0x80) !== 0) || ((x & 0xff00) === 0 && (w & 0x8000) !== 0))
              rep++;
          }
          if (clean >= 12) countSparse4(words, j, end);
          else if (clean >= 8) countSparse(words, j, end);
          else if (rep >= 4) {
            countBanked(words, j, end);
            banked = true;
          } else countDense(words, j, end);
          j = end;
        }
        if (banked)
          for (let b = 0; b < 256; b++) {
            hist[b] += bank2[b];
            bank2[b] = 0;
          }
      }
      i = (head + (wn << 2)) | 0;
    }
  }
  countBytes(data, i, n);
};

const countSparse4 = (words: Int32Array, j: number, end: number): void => {
  j = j | 0;
  end = end | 0;
  const end4 = (end - 3) | 0;
  while (j < end4) {
    const w0 = words[j];
    const w1 = words[j + 1];
    const w2 = words[j + 2];
    const w3 = words[j + 3];
    if (
      (((w0 | (w0 - 0x20202020) | (w0 + 0x01010101)) |
        (w1 | (w1 - 0x20202020) | (w1 + 0x01010101)) |
        (w2 | (w2 - 0x20202020) | (w2 + 0x01010101)) |
        (w3 | (w3 - 0x20202020) | (w3 + 0x01010101))) &
        0x80808080) ===
      0
    ) {
      j += 4;
      continue;
    }
    for (let k = 0; k < 4; k++) {
      const w = words[j + k];
      if (((w | (w - 0x20202020) | (w + 0x01010101)) & 0x80808080) === 0) continue;
      hist[w & 255]++;
      hist[(w >>> 8) & 255]++;
      hist[(w >>> 16) & 255]++;
      hist[w >>> 24]++;
    }
    j += 4;
  }
  if (j < end) countSparse(words, j, end);
};

const countSparse = (words: Int32Array, j: number, end: number): void => {
  for (; j < end; j = (j + 1) | 0) {
    const w = words[j];
    if (((w | (w - 0x20202020) | (w + 0x01010101)) & 0x80808080) === 0) continue;
    hist[w & 255]++;
    hist[(w >>> 8) & 255]++;
    hist[(w >>> 16) & 255]++;
    hist[w >>> 24]++;
  }
};

const countDense = (words: Int32Array, j: number, end: number): void => {
  for (; j < end; j = (j + 1) | 0) {
    const w = words[j];
    hist[w & 255]++;
    hist[(w >>> 8) & 255]++;
    hist[(w >>> 16) & 255]++;
    hist[w >>> 24]++;
  }
};

const countBanked = (words: Int32Array, j: number, end: number): void => {
  for (; j < end; j = (j + 1) | 0) {
    const w = words[j];
    hist[w & 255]++;
    hist[(w >>> 8) & 255]++;
    bank2[(w >>> 16) & 255]++;
    bank2[w >>> 24]++;
  }
};

const compactHistogram = (n: number): number => {
  let controls = 0;
  for (let b = 0; b < 0x20; b = (b + 1) | 0) {
    if (hist[b] === 0) continue;
    hist[b] = 0;
    controls |= 1 << b;
  }
  if (asciiDirty) {
    for (let b = 0x20; b < 0x7f; b++) hist[b] = 0;
    asciiDirty = false;
  }
  if (hist[0x7f] !== 0) {
    hist[0x7f] = 0;
    controls |= 1 << 31;
  }
  let h = 0;
  let high = 0;
  for (let g = 128; g < 256; g += 8) {
    if (
      (hist[g] | hist[g + 1] | hist[g + 2] | hist[g + 3] | hist[g + 4] | hist[g + 5] | hist[g + 6] | hist[g + 7]) ===
      0
    )
      continue;
    for (let b = g; b < g + 8; b++) {
      const c = hist[b];
      if (c === 0) continue;
      hist[b] = 0;
      actH[h] = b - 0x80;
      cntH32[h++] = c | 0;
      high += c >>> 0;
    }
  }
  nH = h;
  asciiTotal = n - high;
  return controls;
};

const addCandidate = (encId: number, ll: number, lang: number): void => {
  if (encId >= 15) candMask0 |= 1 << (encId - 15);
  else candMask1 |= 1 << (encId - 9);
  candLL[encId] = ll;
  candLang[encId] = lang;
  if (ll > bestLL) {
    secondLL = bestLL;
    bestLL = ll;
  } else if (ll > secondLL) {
    secondLL = ll;
  }
};

const pruneThreshold = (): number => Math.min(secondLL, bestLL - 15359);

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
    if (
      ((h0 & invalid[e * 4]) |
        (h1 & invalid[e * 4 + 1]) |
        (h2 & invalid[e * 4 + 2]) |
        (h3 & invalid[e * 4 + 3])) ===
      0
    )
      order[k++] = e;
  }
  return k;
};

const finish = (out: Result): Result => {
  let best = -1;
  let maxLL = 0;
  let second = -Infinity;
  let denom = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let g = 0; g < 2; g++) {
      const off = g ? 9 : 15;
      for (let m = g ? candMask1 : candMask0; m !== 0; m &= m - 1) {
        const id = off + (31 - Math.clz32(m & -m));
        const ll = candLL[id];
        if (pass === 0) {
          if (best < 0 || ll > candLL[best] || (ll === candLL[best] && CANON_RANK[id] < CANON_RANK[best]))
            best = id;
        } else {
          const k = maxLL - ll;
          if (k < 15360) denom += EXP2[k >> 8] * EXP2[60 + (k & 255)];
          if (id !== best && ll > second) second = ll;
        }
      }
    }
    if (best < 0) return setResult(out, -1);
    maxLL = candLL[best];
  }
  return setResult(
    out,
    best,
    candLang[best],
    1 / denom,
    second > -Infinity ? (maxLL - second) / 256 : 99,
  );
};

const sameOnPresent = (e: number, prevE: number): boolean => {
  if (SBCS_SCRIPT[e] !== SBCS_SCRIPT[prevE]) return false;
  const ke = e * 128;
  const kp = prevE * 128;
  for (let j = 0; j < nH; j = (j + 1) | 0)
    if (SBCS_KEY[ke + actH[j]] !== SBCS_KEY[kp + actH[j]]) return false;
  return true;
};

const scoreSbcs = (nv: number, n: number): void => {
  if (nH > 8) {
    bucket.fill(0);
    for (let j = 0; j < nH; j++) bucket[Math.clz32(cntH32[j])]++;
    for (let k = 0, at = 0; k < 33; k++) {
      const c = bucket[k];
      bucket[k] = at;
      at += c;
    }
    for (let j = 0; j < nH; j++) {
      const c = cntH32[j];
      const at = bucket[Math.clz32(c)]++;
      tmpB[at] = actH[j];
      tmpC[at] = c;
    }
    for (let j = 0; j < nH; j++) {
      actH[j] = tmpB[j];
      cntH32[j] = tmpC[j];
    }
  }
  if (n > 262144) {
    scoreSbcsF64(nv);
    return;
  }

  const t0 = pruneThreshold();
  if (t0 > -Infinity) {
    let u = 0;
    for (let j = 0; j < nH; j = (j + 1) | 0) u = (u + cntH32[j] * GMAX[actH[j]]) | 0;
    if (u < t0) return;
  }

  for (let e0 = 0; e0 < 32; e0 = (e0 + 8) | 0) {
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
      const base = (actH[j] * 32 + e0) | 0;
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
  for (let a = 1; a < nv; a++) {
    const e = sbcsOrder[a];
    const ue = ubound32[e];
    let k = a;
    while (k > 0 && ubound32[sbcsOrder[k - 1]] < ue) {
      sbcsOrder[k] = sbcsOrder[k - 1];
      k--;
    }
    sbcsOrder[k] = e;
  }

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
      const first = SCRIPT_META[s];
      const count = SCRIPT_META[s + 6];
      const last = first + count;
      const poff = pairOff[e] - first;
      let l = langHint[s] >= 0 ? langHint[s] : first;
      for (let k = 0; k < count; k++, l = l + 1 === last ? first : l + 1) {
        const thr = eBest > t ? eBest : t;
        const pw = ((poff + l) * 128) | 0;
        let v = 0;
        let j = 0;
        for (; j + 1 < nH; j = (j + 2) | 0) {
          v = (v + cntH32[j] * pairW[(pw + actH[j]) | 0] + cntH32[j + 1] * pairW[(pw + actH[j + 1]) | 0]) | 0;
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
    if (eLang >= 0 && eBest >= t) addCandidate(15 + e, eBest, eLang);
  }
};

const scoreSbcsF64 = (nv: number): void => {
  for (let a = 0; a < nv; a++) {
    const e = sbcsOrder[a];
    const t = pruneThreshold();
    const s = SBCS_SCRIPT[e];
    let eBest = -Infinity;
    let eLang = -1;
    let pw = pairOff[e] * 128;
    for (let l = SCRIPT_META[s], end = l + SCRIPT_META[s + 6]; l < end; l++, pw += 128) {
      const thr = eBest > t ? eBest : t;
      let v = 0;
      for (let j = 0; j < nH && v >= thr; j++) v += cntH32[j] * pairW[pw + actH[j]];
      if (v > eBest && v >= t) {
        eBest = v;
        eLang = l;
      }
    }
    if (eLang >= 0) addCandidate(15 + e, eBest, eLang);
  }
};

const mbcsPrefix = (
  mv: number,
  data: Uint8Array,
  firstHigh: number,
  words: Int32Array,
  head: number,
): number => {
  let alive = 0;
  let euckrAlive = false;
  const stop = curN - firstHigh > 256 ? firstHigh + 256 : curN;
  for (let a = 0; a < mv; a++) {
    const m = mbcsOrder[a];
    const o = m * 8;
    for (let p = 0; p < 6; p++) mbcsSt[o + p] = 0;
    const t = pruneThreshold();
    if (t > -Infinity && mbcsBound(m) < t) continue;
    if (m === 3 && (euckrAlive || candMask1 & 4)) {
      if (candMask1 & 4) {
        addCandidate(12, candLL[11], candLang[11]);
        continue;
      }
      for (let p = 0; p < 7; p++) mbcsSt[24 + p] = mbcsSt[16 + p];
      mbcsBound(3);
    } else {
      const i = SCANNERS[m](data, firstHigh, stop, curN, curTrunc, words, head);
      if (i < 0) continue;
      const ub = mbcsBound(m);
      if (i >= curN) {
        addCandidate(9 + m, ub, mbcsLang);
        continue;
      }
      if (m === 2) euckrAlive = true;
      mbcsSt[o + 6] = i;
    }
    const rate = mbcsSt[o + 7];
    let k = alive++;
    while (k > 0 && mbcsSt[mbcsOrder[k - 1] * 8 + 7] < rate) {
      mbcsOrder[k] = mbcsOrder[k - 1];
      k--;
    }
    mbcsOrder[k] = m;
  }
  return alive;
};

const mbcsComplete = (
  alive: number,
  count: number,
  data: Uint8Array,
  words: Int32Array,
  head: number,
): number => {
  let done = 0;
  while (done < count && done < alive) {
    const m = mbcsOrder[done++];
    if (m < 0) continue;
    const t = pruneThreshold();
    if (mbcsBound(m) < t) continue;
    let i = mbcsSt[m * 8 + 6];
    const chunk = t === -Infinity ? 65536 : curHigh * 4 < curN ? 16384 : 1024;
    const scan = SCANNERS[m];
    for (;;) {
      i = scan(data, i, curN - i > chunk ? i + chunk : curN, curN, curTrunc, words, head);
      if (i < 0) break;
      if (i >= curN) {
        const ub = mbcsBound(m);
        addCandidate(9 + m, ub, mbcsLang);
        if (m === 2) {
          for (let k = done; k < alive; k++) {
            if (mbcsOrder[k] === 3) {
              mbcsOrder[k] = -1;
              addCandidate(12, ub, mbcsLang);
              break;
            }
          }
        }
        break;
      }
      if (t > -Infinity && mbcsBound(m) < t) break;
    }
  }
  for (let a = done; a < alive; a++) mbcsOrder[a - done] = mbcsOrder[a];
  return alive - done;
};

const mbcsBound = (m: number): number => {
  const o = m * 8;
  const nat = mbcsSt[o];
  const chars = mbcsSt[o + 1];
  const trail = mbcsSt[o + 4];
  const highDone = 2 * chars + mbcsSt[o + 5] - trail;
  const remEff = Math.max(0, curHigh - highDone - (curTrunc ? (m === 1 || m === 4 ? 2 : 1) : 0));
  const remTrail = Math.min(remEff, asciiTotal - trail);
  let best = -Infinity;
  let bestScanned = -Infinity;
  for (let k = m < 4 ? m : 2 * m - 4, j = 0; j < (m < 4 ? 1 : 2); j++, k++) {
    const sc = mbcsSt[o + 2 + j] + nat * REST[MODEL_LANG[k]] + (chars - nat) * -6615 + trail * 1280;
    const hh = MBCS_NEG_RATE2[k];
    const at = MBCS_NEG_RATE2[8 + k];
    const v = sc - (at < hh ? remTrail * at + (remEff - remTrail) * hh : remEff * hh) * 0.5;
    if (v > best) {
      best = v;
      mbcsLang = MODEL_LANG[k];
    }
    if (sc > bestScanned) bestScanned = sc;
  }
  mbcsSt[o + 7] = highDone > 0 ? bestScanned / highDone : 0;
  return best;
};

const skipAsciiWords = (words: Int32Array, j: number, end: number, head: number): number => {
  j = j | 0;
  end = end | 0;
  while (j + 1 < end && ((words[j] | words[j + 1]) & 0x80808080) === 0) j += 2;
  if (j < end && (words[j] & 0x80808080) === 0) j++;
  return (head + (j << 2)) | 0;
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
  const o = m * 8;
  mbcsSt[o] += nat;
  mbcsSt[o + 1] += chars;
  mbcsSt[o + 2] += d0;
  mbcsSt[o + 3] += d1;
  mbcsSt[o + 4] += trail;
  mbcsSt[o + 5] += extra;
};

const SCANNERS: ((data: Uint8Array, i: number, stop: number, n: number, truncated: boolean, words: Int32Array, head: number) => number)[] = [
  (data, i, stop, n, truncated, words, head) => {
    i = i | 0;
    stop = stop | 0;
    n = n | 0;
    const safeStop = (stop < n ? stop : n - 1) | 0;
    const wend = words.length !== 0 ? (stop - head) >> 2 : 0;
    const mul = HMUL[0];
    let nat = 0, chars = 0, d0 = 0, trail = 0, extra = 0;
    while (i < safeStop) {
      const b0 = data[i];
      if (b0 < 0x80) {
        i++;
        if (((i - head) & 3) === 0) {
          const j = (i - head) >> 2;
          if (j < wend && (words[j] & 0x80808080) === 0) i = skipAsciiWords(words, j + 1, wend, head);
        }
        continue;
      }
      const nw = NATW[b0];
      if (nw === 0) {
        if (b0 >= 0xa1 && b0 <= 0xdf) { nat++; chars++; extra--; i++; continue; }
        return -1;
      }
      const b1 = data[i + 1];
      const tc = TRAIL_CLASS[b1];
      if ((tc & 1) === 0) return -1;
      trail += tc >>> 1;
      nat += (((b1 - (nw & 255)) | ((nw >>> 8) - b1)) >>> 31) ^ 1;
      chars++;
      const code = (b0 << 8) | b1;
      const kv = HKD0[(Math.imul(code, mul) >>> 23) | 0];
      d0 = (d0 + (((kv << 16) >> 16) & ((((kv >>> 16) ^ code) - 1) >> 31))) | 0;
      i += 2;
    }
    if (i < stop) {
      const b0 = data[i];
      if (b0 >= 0x80) {
        if (NATW[b0] !== 0) { if (!truncated) return -1; extra++; }
        else if (b0 >= 0xa1 && b0 <= 0xdf) { nat++; chars++; extra--; }
        else return -1;
      }
      i = n;
    }
    addState(0, nat, chars, d0, 0, trail, extra);
    return i;
  },
  (data, i, stop, n, truncated, words, head) => {
    i = i | 0;
    stop = stop | 0;
    n = n | 0;
    const safeStop = (stop < n ? stop : n - 1) | 0;
    const wend = words.length !== 0 ? (stop - head) >> 2 : 0;
    const mul = HMUL[1];
    let nat = 0, chars = 0, d0 = 0, extra = 0;
    while (i < safeStop) {
      const b0 = data[i];
      if (b0 < 0x80) {
        i++;
        if (((i - head) & 3) === 0) {
          const j = (i - head) >> 2;
          if (j < wend && (words[j] & 0x80808080) === 0) i = skipAsciiWords(words, j + 1, wend, head);
        }
        continue;
      }
      if (b0 >= 0xa1 && b0 <= 0xfe) {
        const b1 = data[i + 1];
        if (b1 < 0xa1 || b1 > 0xfe) return -1;
        const nw = NATW[256 + b0];
        nat += (((b1 - (nw & 255)) | ((nw >>> 8) - b1)) >>> 31) ^ 1;
        chars++;
        const code = (b0 << 8) | b1;
        const kv = HKD0[(512 + (Math.imul(code, mul) >>> 23)) | 0];
        d0 = (d0 + (((kv << 16) >> 16) & ((((kv >>> 16) ^ code) - 1) >> 31))) | 0;
        i += 2;
      } else if (b0 === 0x8e) {
        const b1 = data[i + 1];
        if (b1 < 0xa1 || b1 > 0xdf) return -1;
        nat++; chars++; i += 2;
      } else if (b0 === 0x8f) {
        if (i + 2 >= n) {
          if (!truncated || data[i + 1] < 0xa1 || data[i + 1] > 0xfe) return -1;
          extra += n - i; i = n; break;
        }
        const b1 = data[i + 1], b2 = data[i + 2];
        if (b1 < 0xa1 || b1 > 0xfe || b2 < 0xa1 || b2 > 0xfe) return -1;
        nat += (0xaf - b1) >>> 31; chars++; extra++; i += 3;
      } else return -1;
    }
    if (i < stop) {
      const b0 = data[i];
      if (b0 >= 0x80) {
        if (!truncated || !((b0 >= 0xa1 && b0 <= 0xfe) || b0 === 0x8e || b0 === 0x8f)) return -1;
        extra++;
      }
      i = n;
    }
    addState(1, nat, chars, d0, 0, 0, extra);
    return i;
  },
  (data, i, stop, n, truncated, words, head) => {
    i = i | 0;
    stop = stop | 0;
    n = n | 0;
    const safeStop = (stop < n ? stop : n - 1) | 0;
    const wend = words.length !== 0 ? (stop - head) >> 2 : 0;
    const mul = HMUL[2];
    let nat = 0, chars = 0, d0 = 0, extra = 0;
    while (i < safeStop) {
      const b0 = data[i];
      if (b0 < 0x80) {
        i++;
        if (((i - head) & 3) === 0) {
          const j = (i - head) >> 2;
          if (j < wend && (words[j] & 0x80808080) === 0) i = skipAsciiWords(words, j + 1, wend, head);
        }
        continue;
      }
      if (b0 < 0xa1 || b0 === 0xc9 || b0 >= 0xfe) return -1;
      const b1 = data[i + 1];
      if (b1 < 0xa1 || b1 > 0xfe) return -1;
      const nw = NATW[512 + b0];
      nat += (((b1 - (nw & 255)) | ((nw >>> 8) - b1)) >>> 31) ^ 1;
      chars++;
      const code = (b0 << 8) | b1;
      const kv = HKD0[(1024 + (Math.imul(code, mul) >>> 23)) | 0];
      d0 = (d0 + (((kv << 16) >> 16) & ((((kv >>> 16) ^ code) - 1) >> 31))) | 0;
      i += 2;
    }
    if (i < stop) {
      const b0 = data[i];
      if (b0 >= 0x80) { if (!truncated || b0 < 0xa1 || b0 === 0xc9 || b0 >= 0xfe) return -1; extra++; }
      i = n;
    }
    addState(2, nat, chars, d0, 0, 0, extra);
    return i;
  },
  (data, i, stop, n, truncated, words, head) => {
    i = i | 0;
    stop = stop | 0;
    n = n | 0;
    const safeStop = (stop < n ? stop : n - 1) | 0;
    const wend = words.length !== 0 ? (stop - head) >> 2 : 0;
    const mul = HMUL[2];
    let nat = 0, chars = 0, d0 = 0, trail = 0, extra = 0;
    while (i < safeStop) {
      const b0 = data[i];
      if (b0 < 0x80) {
        i++;
        if (((i - head) & 3) === 0) {
          const j = (i - head) >> 2;
          if (j < wend && (words[j] & 0x80808080) === 0) i = skipAsciiWords(words, j + 1, wend, head);
        }
        continue;
      }
      if (b0 < 0x81 || b0 === 0xc9 || b0 >= 0xfe) return -1;
      const b1 = data[i + 1];
      const tc = TRAIL_CLASS[(b0 <= 0xc6 ? 768 : 512) + b1];
      if ((tc & 1) === 0) return -1;
      trail += tc >>> 1;
      const nw = NATW[768 + b0];
      nat += (((b1 - (nw & 255)) | ((nw >>> 8) - b1)) >>> 31) ^ 1;
      chars++;
      const code = (b0 << 8) | b1;
      const kv = HKD0[(1024 + (Math.imul(code, mul) >>> 23)) | 0];
      d0 = (d0 + (((kv << 16) >> 16) & ((((kv >>> 16) ^ code) - 1) >> 31))) | 0;
      i += 2;
    }
    if (i < stop) {
      const b0 = data[i];
      if (b0 >= 0x80) { if (!truncated || b0 < 0x81 || b0 === 0xc9 || b0 >= 0xfe) return -1; extra++; }
      i = n;
    }
    addState(3, nat, chars, d0, 0, trail, extra);
    return i;
  },
  (data, i, stop, n, truncated, words, head) => {
    i = i | 0;
    stop = stop | 0;
    n = n | 0;
    const safeStop = (stop < n ? stop : n - 1) | 0;
    const wend = words.length !== 0 ? (stop - head) >> 2 : 0;
    const mul = HMUL[3];
    let nat = 0, chars = 0, d0 = 0, d1 = 0, trail = 0, extra = 0;
    while (i < safeStop) {
      const b0 = data[i];
      if (b0 < 0x80) {
        i++;
        if (((i - head) & 3) === 0) {
          const j = (i - head) >> 2;
          if (j < wend && (words[j] & 0x80808080) === 0) i = skipAsciiWords(words, j + 1, wend, head);
        }
        continue;
      }
      const nw = NATW[1024 + b0];
      if (nw === 0) return -1;
      const b1 = data[i + 1];
      if (b1 < 0x40) {
        if (b1 < 0x30 || b1 > 0x39) return -1;
        if (i + 3 >= n) {
          if (!truncated || (i + 2 < n && (data[i + 2] < 0x81 || data[i + 2] > 0xfe))) return -1;
          extra += i + 2 < n ? 2 : 1; i = n; break;
        }
        const b2 = data[i + 2], b3 = data[i + 3];
        if (b2 < 0x81 || b2 > 0xfe || b3 < 0x30 || b3 > 0x39) return -1;
        chars++; trail += 2; extra += 2; i += 4;
        continue;
      }
      const tc = TRAIL_CLASS[1024 + b1];
      if ((tc & 1) === 0) return -1;
      trail += tc >>> 1;
      nat += (((b1 - (nw & 255)) | ((nw >>> 8) - b1)) >>> 31) ^ 1;
      chars++;
      const code = (b0 << 8) | b1;
      const h = (1536 + (Math.imul(code, mul) >>> 23)) | 0;
      const kv = HKD0[h];
      const hit = (((kv >>> 16) ^ code) - 1) >> 31;
      d0 = (d0 + (((kv << 16) >> 16) & hit)) | 0;
      d1 = (d1 + (HD1[h] & hit)) | 0;
      i += 2;
    }
    if (i < stop) {
      const b0 = data[i];
      if (b0 >= 0x80) { if (!truncated || NATW[1024 + b0] === 0) return -1; extra++; }
      i = n;
    }
    addState(4, nat, chars, d0, d1, trail, extra);
    return i;
  },
  (data, i, stop, n, truncated, words, head) => {
    i = i | 0;
    stop = stop | 0;
    n = n | 0;
    const safeStop = (stop < n ? stop : n - 1) | 0;
    const wend = words.length !== 0 ? (stop - head) >> 2 : 0;
    const mul = HMUL[4];
    let nat = 0, chars = 0, d0 = 0, d1 = 0, trail = 0, extra = 0;
    while (i < safeStop) {
      const b0 = data[i];
      if (b0 < 0x80) {
        i++;
        if (((i - head) & 3) === 0) {
          const j = (i - head) >> 2;
          if (j < wend && (words[j] & 0x80808080) === 0) i = skipAsciiWords(words, j + 1, wend, head);
        }
        continue;
      }
      const nw = NATW[1280 + b0];
      if (nw === 0) return -1;
      const b1 = data[i + 1];
      const tc = TRAIL_CLASS[1280 + b1];
      if ((tc & 1) === 0) return -1;
      trail += tc >>> 1;
      nat += (((b1 - (nw & 255)) | ((nw >>> 8) - b1)) >>> 31) ^ 1;
      chars++;
      const code = (b0 << 8) | b1;
      if (code >= 0xc6a1 && code <= 0xc8fe) return -1;
      const h = (2048 + (Math.imul(code, mul) >>> 23)) | 0;
      const kv = HKD0[h];
      const hit = (((kv >>> 16) ^ code) - 1) >> 31;
      d0 = (d0 + (((kv << 16) >> 16) & hit)) | 0;
      d1 = (d1 + (HD1[h] & hit)) | 0;
      i += 2;
    }
    if (i < stop) {
      const b0 = data[i];
      if (b0 >= 0x80) { if (!truncated || NATW[1280 + b0] === 0) return -1; extra++; }
      i = n;
    }
    addState(5, nat, chars, d0, d1, trail, extra);
    return i;
  },
];

export const init = (): void => {
  if (initialized) return;
  const ic = (i: number): number => {
    const c = DATA.charCodeAt(i);
    return c - 35 - (c > 92 ? 1 : 0);
  };
  let pos = 0;
  const dec = (x: Int32Array | number, term = 89, delta = 0): Int32Array => {
    const out = typeof x === "number" ? I32(x) : x;
    const cont = 91 - term;
    for (let i = 0; i < out.length; i++) {
      let u = 0;
      let mul = 1;
      for (;;) {
        const k = ic(pos++);
        if (k < term) {
          u += k * mul;
          break;
        }
        u += (k - term) * mul;
        mul *= cont;
      }
      out[i] = delta && i > 0 ? out[i - 1] + u : u;
    }
    return out;
  };
  const dec2 = (n: number, min: number, B: number): Int32Array => {
    const out = I32(n);
    for (let i = 0; i < n; i++) out[i] = min + ic(pos++) * B + ic(pos++);
    return out;
  };

  dec(SBCS_KEY);
  const featFid = dec(416);
  const metaCnt = dec(25);
  dec(SBCS_SCRIPT);
  dec(CANON_RANK);
  dec(MODEL_LANG);
  const natRunInts = dec(141);

  const trRunInts = dec(30, 74);
  const mCodes = [dec(50, 74, 1), dec(50, 74, 1), dec(65, 74, 1), dec(51, 74, 1)];
  const natVals = dec(16, 74);
  dec(MBCS_NEG_RATE2, 74);
  dec(HMUL, 74);

  const featLogp = dec2(416, -2930, 52);
  const mLogp = dec2(216, -2254, 33);
  REST.set(dec2(29, -3401, 39));
  const maskBase = pos;

  const featW = I32(25 * 128);
  for (let l = 0, p = 0; l < 25; l++)
    for (let j = 0, fid = -1; j < metaCnt[l]; j++, p++) featW[l * 128 + (fid += featFid[p])] = featLogp[p];
  WMAXT.fill(-6615);
  GMAX.fill(-6615);
  for (let e = 0, pair = 0; e < 32; e++) {
    const script = SBCS_SCRIPT[e];
    pairOff[e] = pair;
    for (let l = SCRIPT_META[script], end = l + SCRIPT_META[script + 6]; l < end; l++, pair++) {
      const r = REST[l];
      for (let b = 0; b < 128; b++) {
        const c = SBCS_KEY[e * 128 + b];
        if (!c) SBCS_INVALID[e * 4 + (b >> 5)] |= 1 << (b & 31);
        const fw = c >= 3 ? featW[l * 128 + c - 3] : 0;
        const w = fw || (c === 2 || (c >= 3 && (script || c >= 13)) ? r : -6615);
        pairW[pair * 128 + b] = w;
        if (w > WMAXT[b * 32 + e]) WMAXT[b * 32 + e] = w;
        if (w > GMAX[b]) GMAX[b] = w;
      }
    }
  }

  for (let k = 0, p = 0; k < natRunInts.length; k += 3) {
    p += natRunInts[k];
    const base = (p >> 7) * 256 + 128 + (p & 127);
    NATW.fill(natVals[natRunInts[k + 2]], base, base + natRunInts[k + 1]);
  }
  for (let k = 0, p = 0; k < trRunInts.length; k += 3) {
    p += trRunInts[k];
    TRAIL_CLASS.fill(trRunInts[k + 2], p, p + trRunInts[k + 1]);
  }
  for (let m = 0; m < 6; m++) MBCS_INVALID[m * 4 + 3] = m ? 1 << 31 : 7 << 29;
  MBCS_INVALID[4] = ~0xc000;
  MBCS_INVALID[5] = MBCS_INVALID[9] = MBCS_INVALID[12] = MBCS_INVALID[21] = 1;
  MBCS_INVALID[8] = MBCS_INVALID[20] = -1;

  for (let idx = 0, lpOff = 0, mbit = 0; idx < 5; idx++) {
    const m = idx < 3 ? idx : idx + 1;
    const codes = mCodes[idx ? idx - 1 : 0];
    const first = m < 4 ? m : 2 * m - 4;
    const hoff = idx << 9;
    const mul = HMUL[idx];
    for (let k = 0; k < (m < 4 ? 1 : 2); k++) {
      const r = REST[MODEL_LANG[first + k]];
      for (let j = 0; j < codes.length; j++) {
        if (idx > 2) {
          const b = mbit++;
          if (((ic(maskBase + ((b / 6) | 0)) >> (b % 6)) & 1) === 0) continue;
        }
        let code = codes[j], b1 = code & 255;
        if (idx === 1) {
          const b0 = (code >> 8) - ((code >> 8) <= 0x9f ? 0x81 : 0xc1), hi = b1 >= 0x9f ? 1 : 0;
          code = ((b0 * 2 + 161 + hi) << 8) | (b1 += hi ? 2 : b1 <= 0x7e ? 97 : 96);
        }
        const nw = NATW[m * 256 + (code >> 8)];
        const delta = mLogp[lpOff + j] - (b1 >= (nw & 255) && b1 <= (nw >>> 8) ? r : -6615);
        const h = hoff + (Math.imul(code, mul) >>> 23);
        HKD0[h] |= (code << 16) | (k ? 0 : delta & 0xffff);
        if (k) HD1[h] = delta;
      }
    }
    if (idx) lpOff += codes.length;
  }
  for (let j = 0; j < 256; j++) {
    if (j < 60) EXP2[j] = 2 ** -j;
    EXP2[60 + j] = 2 ** (-j / 256);
  }
  initialized = true;
};

const DATA = "################################$&$'$$$$$$%B$$$$$$$$$$$$$$%C$$$(%%%%0%%%%%%%%%%%%%%%%%1$%%%%2%d3G9:L4%@AH5I;M<=EeNO8>F6$%J?D7Qf%################################$%$%$%%$$%%%%$%%$R$[$%_$$K`~Oa$PW%%%%0%%%%%%%%%%%%%%%%%1$%%%%2%%3%9:g4%ZAS5T;w<=vV]z8>r6${}P?t7Q|$################################$%%%G%KH%%%%%$%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%&'()*+,-./0123456789:;<=>?@ABCDE$FM%I%LJNOPQ%$%R################################$###$#######%$#############%###%#&%'%(%)*+,%-./012%34567%89#####$:;<=>?@ABC$$$$$$$$#############################################$%%$$$$$$$%%$$#%$$$$$$%$%%%%%$%%%%%%%%%%%%%%%%%%%%#%%%%%%%%%&'()%*+,-./0123456789:;<=>?@%A%%BCD#################################$#$$$$$$$$$%$$$$$$$$$$$$$$$%$$$################################$&'()*+,-./0123456789:;<=>?@##$$#################################$&$'$$$$$$%B$$$$$$$$$$$$$$%C$$$(%%%%0%%%%%%%%%%%%%%%%%1$%%%%2y%3G9:L4%@AH5I;M<=ExNO8>F6$%J?D7h`%$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$F$$$$$$$$$$$$$$$%$$$$$$$$$$$$D&'<*+:);./012345E6789,(BA->C?=@%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$####$###########%%%%$%%########$'%%(%%)*%%%%%%%%%%%+,%-%./0%%1%%234%5%6%%78%9%%:;<%=>%%?@%&%%%$AB%CD%%%E&%%%%%$$$$$$$$$$$%%$$$$)#%#%*$$#$%%%%%%#%XYU$bc#$K%_~OPa$$$%$%$$$$%B$$$%$$$[$$$$$R`C%$%W%%%%0%%%%%%%%%%%%%%%%%1$%%%%2%%3%9:g4%ZAS5T;w<=vV]z8>r6${}P?t7Q|$%%%%%$$$$$%%%%%%M%%%%$%%#$O%P%QR$%%%$%$$%$G%$$$H$$KLS$$$F$I%N%%J%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%&'()*+,-./0123456789:;<=>?@ABCDE)#%%%*$$$$%%%#%##%XYU$bc$$K%^#P%$&$'$$$$$$%B$$$$$$$$$$$$$$%C$$$(%%%%0%%%%%%%%%%%%%%%%%1$%%%%2%d3G9:L4%@AH5I;M<=EeNO8>F6$%J?D7Qf%$#%$%$$$#$#%#####%%%%$%%#$#%####$$%$$$$$$$#%$$$%$$$$$$$$%%%%%$%%%%%%%%%%%%%%%%%%%%#%%%%%%%%%&'()%*+,-./0123456789:;<=>?@%A%%BCD#)#%%%*$$$$%%%####%XYU$bc$$K%^##%$&$'$$$$$$%B$$$$$$$$$$$$$$%C$$$(%%%%0%%%%%%%%%%%%%%%%%1$%%%%2y%3G9:L4%@AH5I;M<=ExNO8>F6$%J?D7h`%$#%$%$$$$$#%#####%%%%$%%$$#%####$$$$$$$$$$$%$$$$$$$$$$$$$$$%$$$$%%%%%%%%%%#%%%%%$%%%%%%$$#######&'()*+,-./0123456789:;<=>?@##$$#$%%$%$$$$$%%$%%%%%%%%$%%%$%%$$$%$%$$$$$$$$%%$$$$$$$$$$$$$$%%$$$%%&%'%(%)*+,%-./012%3456$7%89$:;<$=$>?@A$$$$$BC$$$$$$$$$$$$$$$$$%)#%#%*$$#$#%#$$$#%XYU$bc#$#%#$$#$#$'$#$$%$%B$$$%$$$$$$$$%$%C$$$@%%%%0%%%%%%%%%%%%%%%%%1$%%%%2%%3RniZ4%TjS5aklompK]q8%F6$u[_s7WP$)#%%%*$$$$#%%####%XYU$bc$$#%^##%$&$'$$$$$$%B$$$$$$$$$$$$$$%C$$$(%%%%0%%%%%%%+%%%%%.%%%1$%%%%2%-3G9:g4%@AH5I;,<=EVN/8>}S6$%J?D7~S$%$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$FI$LJ$$$$$S$$$$$%G$KH$$$$$%$$D&'<*+:);./012345E6789,(BA->C?=@%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%&'()*+,-./012345$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$6789:;<=>?@ABCDE%FGIHJ%%$$$$$$$$M%%%F%IG%%LKJHN%O%P%Q%%%%%R%D%@%&%'%<%*%+%:%)%%%$$$$$;%.%$$$$/%$$$$$$$0%$$$$$$$$1%2%3%4%5$$$$%E$%6%7%8%9%,%(%B%$$A%-%>%C%?%=%$$$0%%%%129G:4L%A5HI;<M=EN8O>6F?JD7$$$'$$$3$$$$$$%%$$$$$$$$$$$%%$@%(&$$%$$BC*$%%%%^bcYU%X$$%%$)%%%%$$%%$%%%%%%%%%%%#%%%%h$$$$$$$$$$%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$$%$$$$K$$$%M$%%$$$$L$S%GIHJ%O%PN%$$$$$%%$$%Q%%%%%%%%%$%%%%R$%FE&'()*+,-./0123456789:;<=>?@ABCD$################################$%$'$#%$$y%%%$#%$~Q$$$$%$$h`x%$#W%%%#0%%%%%%%%%%%#%%%%%1$%%%%2%%3G9:#4~P%AH5I;M<=E#NO8>}Q6$%J?D7%%$################################$%%%$%%$$%%%%$%$$R$%$%p$$Kjl%%P%%%%%0%%%%%%%%%%%%%%%%%1$%%%%2%%3i9:L4%@nS5T;k<=mVq%o>F6$%u?D7%s$################################$%%%%%%$%%%%%$%%$Rjlm%o$pVK%P%s%%%%%0%%%%%%%%%%%%%%%%%1%%%%%2%d3i9:L4%@nS5T;k<=Eeq%8>F6%%u?D7Qf%################################$U$'$%$$%$%B$$$%$$$$Y$$$%$%C$$$@%%%%0%%%%%%%%%%%%%%%%%1$%%%%2%%3RniZ4%TjS5aklompK]q8%F6$u[_s7WPX################################$%%'%~P%$%$%%%$$%%%%}Q%%$%%%%%%%%%%%%%0%%%%%%%%%%%%%%%%%1%%%%%2%%3G9:L4%@AH5I;M<=E}RNO8>F6%%J?D7Q~R%################################$&$')$%$K$%B$$$$$$$$%$$$P$%C%^%(%%%%0%%%%%%%%%%%%%%%%%1$%%%%2%d3G9:L4%@AH5I;M<=EeNO8>F6$%J?D7Qf%################################$%R%)%%$K$%B%$a%$$%[%U$$PS}TC%^%W%%%%0%%%%%%%%%%%%%%%%%1%%%%%2%%3G9:g4Z@AH5I;M<=EV]O8>r6_tJ?D7T~T%%75:4G%AI;HE=M0%%@%>6ODJ%12%'%$%9<8?N%%%($$$$&BC$$$$$%%%$$$$$$$$$$$$$$L%$$$$$$$$e%%%%h%%%$$$$$%$%3%%F%$fd%%%Q%$$$$$$$$$$$$$$$$$$%75:4}PZA[;%r=%0%%%%>6%%%_12%~O%$S9<8?%R%P%T$a%`BC$$$$$%%%%$$$$%W$$$$$$$%g$$$$$$$$V%%%v%%%w$$$$%%$%3%%]z%K%%%%Q%|$$$$$$$$$$$$t%{$$%%$N&$+$'/($%$&$$$$%$$$6'*$$$$%$$%$/%$$&&23'&&/($%E$&$%$6=%&&$$%%8&E*8-$3$$$$&&U%3&$$%&%($%&35$%&%E$%&%+J$$I(&8$%$%$$%I(%$$9&(%2%$2((3$%$&&$45$$8&$)$'[$4$-A+3$)$$$$-$%%$+%$%$,3@$&$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$&%$%$$$$$*$$$$$$$$$%$$$$$$$$$%$$$2$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$+3+-1,*,.),.,).+*JDG@BA>C##$'%&#$(#$#%#&'##$$$#$##########$&%(')*+FECDGH,/4<8:>2B01-9?;=@A356K7LMNOP.QIJ==<<>??>$$#$$$$$%$&&&$'$$($:){-)-$*$%&%%)%.&.%)%$+5%&6$,$%&%%,%-&-i,i-&O$,$1&1<,<$&$W,ZD-D1.1:-:%,%$&$W,W$&&D/D$&$$/$)&))0)l/l*0L$/$%&%E/E$1$%&%S/S$2dc&dt*$oCw($u,=&C=&Cu*$r.c&dv*$s.c&z(w($uvz)$<p6%%($$%'%%%)'&$$%$&$2'*$$$)$z'%6%2F$+uz'u[}.p4{/}1q9v,}8~'{C|uq,OC0r.A.|=v3:5}.-Mw?z/+-v1y2|4y.0`o/r2Kw-+g/u.$/(%$..:},%SC%~p($$*w/wo{)y+&|EtRni<v{*r+s}*oLyAns.{E}2P}1}.*7y/Hp/W~3r-o(&r/r3n=p3C|1|0u3}@s31u^s2N{-'5p5v<~1Kp1{N+,<o10-o2w2n1Jo2zu)A~{.s|t+%nP)%0%)%..Q$?{*''/4}($y*4$?M.s+o,y1<z({,z.|:z(q.w(*v1u3{0C~Hp0n4}A|0v0s,(}w~+wnx/xo|*n2~tp+q{p0xup0uvw+qyfuwr0{qr0r~s+zqr0q~s+q|w)s}o.yjyjtz'tz'}m}m}m}m|7yjtz'|v/wy1w_==sv|ntn},so~zvoCp~|px~}+|}xv{JppzvonM@:@:B<J2O=J2E6G85HV&</5H</?@A+:D:D</5HLAJ%FJ=>:D7A?7<=A9KRP3LPS#;(<F6,KU6,PMM%OCE6IDI<M.P(8@F;GCGCGC0JJT5FHR24D@KDLLM;K;F1PUA5IN9RJ*K2F6S@DLN,KUR0HCFBFBREDO=AHO:HJ9I?M+@VCB@+MA;/?-L9OOCDT:N%K$F=H@F7C=>A>A>AN,K3NSS(J$BO?=R:M);PM>AQD9EHGKM%IAJ9F0F0O5L;G?KOR)JAP0RE:V75DVF1H%L.K7D?G&=B:AR@JFO*I1N-FP>KK%MEL<G)M0ISLVT:IJ?%E0F+>&@TDACNB>>&B><$CNB><$<$>&E0@TCNCNB%>R@T?E<$@4=)?E>&:I@T?E>&<$>R<$>&=):I>&HE=,DD=EADI%9:=:H&;/BJD8B,G7JQA.DSETFR@I039F4F<;7E2C#$>:=M1L6H>O#$HS<QEV=+AMDG7:?*FP;7CHCBAHGLIGA2ETDEDUB>0N:V6;:P7:1K>+74?4####5C:?0$FB##K&=%C6=<C#I+7,>1IGBMA$A=FQI;AJETE@E*D/6'8);A9H1+D78U7,6')5=V<F;E<FJ=8.=V=@H$32C(;(GSC1@OBGG-4PH-CDD+CVE/H7BR8.<-=*=*716,3*>-6#LPD#BIDD<>>@8Q@+8&DK@9<$:S7(9DC36#A-?@?/JVG+F<?/FB:SH/FIE0<9@OI3J0:.?*;8JQ7#@OGJ@BFN<9D/=HB$1#>;.);S?;EKD&F$?BE<?BD>>EB<A-B2G#?2?Q>3CAC/F5@TBFAD@:EP;KC&GG@GB'<1:FE/=+7L=@?Q;(:,2424<#307$>(02026015;65#?015?:<<=38<@=BA@+4+5;1502<078>=02(:(:(:,3,3(:*<-C(:######&*(:&*&**<&*(:80/67.)?+6173..0;&;@.017)?244'6(08-&)?-&3.3.-&17/6/6249>-&+6+66(8A::=A08/608+6-&/6)?-&4'+680)?6<.0+6-*.:+3&B.:&B)1-*)10#:#@')14')1)10#+3A++3&B)1)1)1.:&B.:&B2+)1&B&B)1)1-*4'+3&B)12+.:+3-*&B5;-*&B0#.:&B-*&B62-*+33+)14C1)1))1+31)&B)1@':#624'2+&B.:&B)10#&B4'1))1)1-*-*)1)1+3+3&B+34C)1)13++3.:-*+32+)1A+5;0#-*+3.:-*&B&B.:1))1)1)1&B&B&B)1>(1C5#5&1C19161:1:6A181=1:131>3,173&>&>:=4A=A3HI?>+##%#####SbccbccccFccc4L9BQcXccbcccccccccccYE+#";
