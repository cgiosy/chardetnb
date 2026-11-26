export const NUM_ENC = 47;
export const NUM_MBCS = 6;
export const NUM_SBCS = 32;
export const MBCS_OFFSET = 9;
export const SBCS_OFFSET = 15;
export const NUM_LANGS = 29;
export const POOL32_LO = 0xffffefff;
export const POOL32_HI = 0x1;
export const POOL47_LO = 0xffffffff;
export const POOL47_HI = 0x7fff;
export const ENC_NAMES =
  "ASCII,UTF-8,UTF-16BE,UTF-16LE,UTF-32BE,UTF-32LE,ISO-2022-JP,ISO-2022-KR,ISO-2022-CN,Shift_JIS,EUC-JP,EUC-KR,CP949,GB18030,Big5,ISO-8859-1,ISO-8859-2,ISO-8859-5,ISO-8859-6,ISO-8859-7,ISO-8859-8,ISO-8859-9,KOI8-R,windows-874,windows-1250,windows-1251,windows-1252,windows-1253,windows-1254,windows-1255,windows-1256,windows-1257,windows-1258,KOI8-U,IBM866,IBM855,macintosh,x-mac-cyrillic,ISO-8859-3,ISO-8859-4,ISO-8859-10,ISO-8859-13,ISO-8859-14,ISO-8859-15,ISO-8859-16,CP850,CP852";
export const LANG_NAMES =
  "en,fr,de,es,cs,pl,ro,hu,pt,it,mt,lv,lt,et,is,cy,tr,vi,ru,uk,sr,el,ar,he,th,ko,ja,zh-Hans,zh-Hant";
export const HMUL = "VfZsl%zevtc+mWVnu)mWVnu)^TUk>TzQi~-";
export const MBCS_SJIS_CODES =
  "psp+$<t7%%($$%'%%%)'&$$%$&$2'*$$$)$o(%6%2F$+vt(~_y/r5x0|2x:p-s:s(|E";
export const MBCS_SJIS_LOGP =
  "ug$]$b.#{0m/a(f-S7#r+T*r1n,[2^7t7^'S${)u.U&z&l4X%U)l$i4})h-P8b.##k(#j(Q&r'r*a+##r'o&n&#p)o)o&";
export const MBCS_EUCKR_CODES =
  "pyo.OC0~.A.w?w4:5y/-MtAw0+-u2y3~5u/0a|/r3Kr.+h/q/$/(%$..:w-%SC%v|($$*t0";
export const MBCS_EUCKR_LOGP =
  "fn${/c.t6j%x+j%Z*n5W$t6r'b.r/b%~%S+X(s't'W,#V,n)}%#_'r-o5Y%#i2R'n%r'f6j$k$d*Z%o&c+t'_-i/v5_8|5[/U'";
export const MBCS_GB_CODES =
  "|}p+r,&oHtUtn<{{+{+z}+yNxCo{/~G}3P|2y/*7v0H}/Wo5}-u(&o0s4y>q4C{2z1v4{Bt41pcs3Nv.'5s6p>}2Ko2wQ+,<~10-o3w3}1Jo3xs*Awt0";
export const MBCS_GB_LOGP =
  "Z|$X%q'o)c.b.o&k(j(o,p1~+]Dq2p2#o,m){BzBo)o&##s*b.c.b.l3{/n&#o&#k(V-o/o)o&|/X(q'j%X,q8g/X,^0z$b.Y,X,t9j0i%c.c1|3j(#b.Q&b+P2o&";
export const MBCS_GB_MASK = "#ScddcddddFddd4L9BQdX2";
export const MBCS_BIG5_CODES =
  "psp-%|R)%0%)%..Q$?s+''/4s)$q+4$?M.|+y,x2<p)u-v/t<p)}.}(*u2v4y1CtK~0p5|Cz1t1},(";
export const MBCS_BIG5_LOGP =
  "h_$}+X(d&s%k3c.b.o&o,]0a6^'b.#k(#j(#Q&#o)p){0{3#d1b.r'W%i%{,{/|Ey3c+S'i%r'W%X,#c.o&b.##n&##o&";
export const MBCS_BIG5_MASK = "d_ddddddddddd>.E#";
export const buildModel = (): void => {
  const cls = decodeInts(SBCS_CLS, NUM_SBCS * 128, false);
  const featFid = decodeInts(FEAT_FID, NUM_SBCS_FEATS, false);
  const featLogp = decodeInts(FEAT_LOGP, NUM_SBCS_FEATS, true);
  const meta = decodeInts(LANG_META, NUM_SBCS_LANGS + NUM_LANGS, true);
  SBCS_SCRIPT_A.set(decodeInts(SBCS_SCRIPT, NUM_SBCS, false));
  LANG_SCRIPT_A.set(decodeInts(LANG_SCRIPT, NUM_LANGS, false));
  CANON_RANK_A.set(decodeInts(CANON_RANK, NUM_ENC, false));
  for (let l = 0; l < NUM_LANGS; l++) NONASCII_REST[l] = meta[NUM_SBCS_LANGS + l];
  const featW = new Int32Array(NUM_LANGS * 128).fill(FEAT_ABSENT);
  const zShift = new Int32Array(NUM_LANGS);
  for (let l = 0, p = 0; l < NUM_SBCS_LANGS; l++) {
    let fid = -1;
    let logp = 0;
    let sNa = 0;
    for (let j = 0; j < meta[l]; j++, p++) {
      fid += featFid[p];
      logp += featLogp[p];
      featW[l * 128 + fid] = logp;
      sNa += 2 ** (logp / 256);
    }
    const slots = Math.max(10, SCRIPT_NA_SIZE[LANG_SCRIPT_A[l]] - meta[l]);
    zShift[l] = Math.round(-Math.log2(sNa + slots * 2 ** (NONASCII_REST[l] / 256) + 1e-3) * 256);
  }
  for (let l = 0; l < NUM_LANGS; l++) {
    const sc = LANG_SCRIPT_A[l];
    const count = SCRIPT_COUNT[sc];
    if (count === 0) SCRIPT_FIRST[sc] = l;
    else if (SCRIPT_FIRST[sc] + count !== l)
      throw new Error("languages of a script must be consecutive");
    SCRIPT_COUNT[sc] = count + 1;
  }
  GMAX.fill(-32768);
  let pair = 0;
  for (let e = 0; e < NUM_SBCS; e++) {
    const script = SBCS_SCRIPT_A[e];
    for (let word = 0; word < 4; word++) {
      let invalid = 0;
      for (let bit = 0; bit < 32; bit++)
        if (cls[e * 128 + word * 32 + bit] === 0) invalid |= 1 << bit;
      SBCS_INVALID[e * 4 + word] = invalid;
    }
    const first = pair;
    pairOff[e] = first;
    for (let l = 0; l < NUM_LANGS; l++) {
      if (LANG_SCRIPT_A[l] !== script) continue;
      const shift = zShift[l];
      const rest = NONASCII_REST[l] + shift;
      for (let b = 0; b < 128; b++) {
        const c = cls[e * 128 + b];
        let w = OOS;
        if (c === 2) w = rest;
        else if (c >= 3) {
          const fw = featW[l * 128 + c - 3];
          w = fw !== FEAT_ABSENT ? fw + shift : script !== 0 || c - 3 >= 10 ? rest : OOS;
        }
        pairW[pair * 128 + b] = w > 0 ? 0 : w;
      }
      pair++;
    }
    for (let b = 0; b < 128; b++) {
      let mx = -32768;
      for (let k = first; k < pair; k++) mx = Math.max(mx, pairW[k * 128 + b]);
      WMAXT[b * NUM_SBCS + e] = mx;
      if (mx > GMAX[b]) GMAX[b] = mx;
    }
  }
  SBCS_KEY.set(cls);
};
export const decodeInts = (src: string, n: number, signed: boolean): Int32Array => {
  const out = new Int32Array(n);
  const term = signed ? CODE_T : CODE_U;
  const cont = INT_CHARS.length - term;
  let p = 0;
  for (let i = 0; i < n; i++) {
    let u = 0;
    let mul = 1;
    for (;;) {
      const k = ICODE[src.charCodeAt(p++)];
      if (k < term) {
        u += k * mul;
        break;
      }
      u += (k - term) * mul;
      mul *= cont;
    }
    out[i] = signed ? (u % 2 === 0 ? u / 2 : -(u + 1) / 2) : u;
  }
  return out;
};
export const decodeMask = (src: string, n: number): Uint8Array => {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (ICODE[src.charCodeAt((i / 6) | 0)] >> (i % 6)) & 1;
  return out;
};
export const OOS = -6615;
// Counts data[i..n) into hist. Word counting may add printable ASCII too (compactHistogram drops it);
// what matters is that every high byte and every control byte is counted. Long inputs go by chunks
// whose first 16 words pick the loop: mostly printable ASCII skips such words, a lead byte repeating
// two lanes apart (CJK) splits lanes 2-3 into a second bank so one counter does not serialize the
// stores, anything else counts every word into hist.
export const countHigh = (
  data: Uint8Array,
  i: number,
  n: number,
  words: Int32Array,
  head: number,
): void => {
  if (words.length !== 0) {
    for (; ((i - head) & 3) !== 0 && i < n; i = (i + 1) | 0) {
      const b = data[i];
      hist[b] = hist[b] + 1;
    }
    const wn = words.length;
    let j = (i - head) >> 2;
    if (j < wn) {
      if (wn - j < 64) countSparse(words, j, wn);
      else {
        let banked = false;
        while (j < wn) {
          const end = j + CHUNK_WORDS < wn ? j + CHUNK_WORDS : wn;
          const pe = j + 16 < end ? j + 16 : end;
          let clean = 0;
          let rep = 0;
          for (let k = j; k < pe; k = (k + 1) | 0) {
            const w = words[k];
            if (((w | (w - 0x20202020) | (w + 0x01010101)) & 0x80808080) === 0) clean++;
            const x = w ^ (w >>> 16);
            if (((x & 0xff) === 0 && (w & 0x80) !== 0) || ((x & 0xff00) === 0 && (w & 0x8000) !== 0))
              rep++;
          }
          if (clean >= 8) countSparse(words, j, end);
          else if (rep >= 4) {
            countBanked(words, j, end);
            banked = true;
          } else countDense(words, j, end);
          j = end;
        }
        if (banked)
          for (let b = 0; b < 256; b = (b + 1) | 0) {
            hist[b] = hist[b] + bank2[b];
            bank2[b] = 0;
          }
      }
      i = (head + (wn << 2)) | 0;
    }
  }
  for (; i < n; i = (i + 1) | 0) {
    const b = data[i];
    hist[b] = hist[b] + 1;
  }
};
const countSparse = (words: Int32Array, j: number, end: number): void => {
  for (; j < end; j = (j + 1) | 0) {
    const w = words[j];
    if (((w | (w - 0x20202020) | (w + 0x01010101)) & 0x80808080) === 0) continue;
    const b0 = w & 255;
    const b1 = (w >>> 8) & 255;
    const b2 = (w >>> 16) & 255;
    const b3 = w >>> 24;
    hist[b0] = hist[b0] + 1;
    hist[b1] = hist[b1] + 1;
    hist[b2] = hist[b2] + 1;
    hist[b3] = hist[b3] + 1;
  }
};
const countDense = (words: Int32Array, j: number, end: number): void => {
  for (; j < end; j = (j + 1) | 0) {
    const w = words[j];
    const b0 = w & 255;
    const b1 = (w >>> 8) & 255;
    const b2 = (w >>> 16) & 255;
    const b3 = w >>> 24;
    hist[b0] = hist[b0] + 1;
    hist[b1] = hist[b1] + 1;
    hist[b2] = hist[b2] + 1;
    hist[b3] = hist[b3] + 1;
  }
};
const countBanked = (words: Int32Array, j: number, end: number): void => {
  for (; j < end; j = (j + 1) | 0) {
    const w = words[j];
    const b0 = w & 255;
    const b1 = (w >>> 8) & 255;
    const b2 = (w >>> 16) & 255;
    const b3 = w >>> 24;
    hist[b0] = hist[b0] + 1;
    hist[b1] = hist[b1] + 1;
    bank2[b2] = bank2[b2] + 1;
    bank2[b3] = bank2[b3] + 1;
  }
};
export const noHigh = (n: number): void => {
  nH = 0;
  asciiTotal = n;
};
export const compactHistogram = (n: number): number => {
  let controls = 0;
  for (let b = 0; b < 0x20; b = (b + 1) | 0) {
    if (hist[b] === 0) continue;
    hist[b] = 0;
    controls |= 1 << b;
  }
  for (let b = 0x20; b < 0x7f; b = (b + 1) | 0) hist[b] = 0;
  if (hist[0x7f] !== 0) {
    hist[0x7f] = 0;
    controls |= 1 << 31;
  }
  let h = 0;
  let high = 0;
  for (let g = 128; g < 256; g = (g + 8) | 0) {
    const any =
      hist[g] |
      hist[g + 1] |
      hist[g + 2] |
      hist[g + 3] |
      hist[g + 4] |
      hist[g + 5] |
      hist[g + 6] |
      hist[g + 7];
    if (any === 0) continue;
    for (let b = g; b < g + 8; b = (b + 1) | 0) {
      const c = hist[b];
      if (c === 0) continue;
      hist[b] = 0;
      actH[h] = b - 0x80;
      cntH32[h] = c | 0;
      h = (h + 1) | 0;
      high += c >>> 0;
    }
  }
  nH = h;
  asciiTotal = n - high;
  if (n > SBCS_INT_MAX) for (let k = 0; k < h; k++) cntH[k] = cntH32[k];
  return controls;
};
export const resetCandidates = (): void => {
  candMask[0] = 0;
  candMask[1] = 0;
  bestLL = -Infinity;
  secondLL = -Infinity;
};
export const addCandidate = (encId: number, ll: number, lang: number): void => {
  if (encId >= SBCS_OFFSET) candMask[0] = candMask[0] | (1 << (encId - SBCS_OFFSET));
  else candMask[1] = candMask[1] | (1 << (encId - MBCS_OFFSET));
  candLL[encId] = ll;
  candLang[encId] = lang;
  if (ll > bestLL) {
    secondLL = bestLL;
    bestLL = ll;
  } else if (ll > secondLL) {
    secondLL = ll;
  }
};
export const pruneThreshold = (): number => {
  if (secondLL === -Infinity) return -Infinity;
  const t = bestLL - 15359;
  return secondLL < t ? secondLL : t;
};
export const SBCS_INT_MAX = 262144;
const NUM_MBCS_LANG_MODELS = 8;
const NUM_SCRIPTS = 9;
const NUM_SBCS_LANGS = 25;
const NUM_SBCS_FEATS = 416;
const CODE_T = 45;
const CODE_U = 74;
const FEAT_ABSENT = 1;
const SCRIPT_NA_SIZE = Int32Array.of(220, 90, 70, 45, 70, 80);
const INT_CHARS =
  "#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_abcdefghijklmnopqrstuvwxyz{|}~";
const LANG_SCRIPT = "##################$$$%'&()*++";
const SBCS_SCRIPT = "##$'%&#$(#$#%#&'##$$$#$#########";
const SBCS_CLS =
  "################################$&$'$$$$$$%0$$$$$$$$$$$$$$%1$$$(%%%%2%%%%%%%%%%%%%%%%%3$%%%%4%56789:;%<=>?@ABCDEFGHIJKL$%MNOPQR%################################$%$%$%%$$%%%%$%%$U$k$%|'$$~'}'p(w($y(x(%%%%2%%%%%%%%%%%%%%%%%3$%%%%4%%6%89T;%V=X?^A_CDYZlnIJy'L${'r(Ns(PQo($################################$%%%&%'(%%%%%$%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%)*+,-./0123456789:;<=>?@ABCDEFGH$IJ%K%LMNOPQ%$%R################################$###$#######%$#############%###%#&%'%(%)*+,%-./012%34567%89#####$:;<=>?@ABC$$$$$$$$#############################################$%%$$$$$$$%%$$#%$$$$$$%$%%%%%$%%%%%%%%%%%%%%%%%%%%#%%%%%%%%%&'()%*+,-./0123456789:;<=>?@%A%%BCD#################################$#$$$$$$$$$%$$$$$$$$$$$$$$$%$$$################################$&'()*+,-./0123456789:;<=>?@##$$#################################$&$'$$$$$$%0$$$$$$$$$$$$$$%1$$$(%%%%2%%%%%%%%%%%%%%%%%3$%%%%4g%6789:;%<=>?@ABCDEaGHIJKL$%MNOPh}'%$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$I$$$$$$$$$$$$$$$%$$$$$$$$$$$$G)*?-.=,>12345678H9:;</+ED0AFB@C%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$####$###########%%%%$%%########$&%%'%%()%%%%%%%%%%%*+%,%-./%%0%%123%4%5%%67%8%%9:;%<=%%>?%@%%%$AB%CD%%%E@%%%%%$$$$$$$$$$$%%$$$$)#%#%*$$#$%%%%%%#%t*u*v*$r*s*#$~'%|'p(y(w($$$%$%$$$$%0$$$%$$$k$$$$$U}'1%$%x(%%%%2%%%%%%%%%%%%%%%%%3$%%%%4%%6%89T;%V=X?^A_CDYZlnIJy'L${'r(Ns(PQo($%%%%%$$$$$%%%%%%J%%%%$%%#$O%P%QR$%%%$%$$%$&%$$$($$'LS$$$I$K%N%%M%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%)*+,-./0123456789:;<=>?@ABCDEFGH)#%%%*$$$$%%%#%##%t*u*v*$r*s*$$~'%z'#y(%$&$'$$$$$$%0$$$$$$$$$$$$$$%1$$$(%%%%2%%%%%%%%%%%%%%%%%3$%%%%4%56789:;%<=>?@ABCDEFGHIJKL$%MNOPQR%$#%$%$$$#$#%#####%%%%$%%#$#%####$$%$$$$$$$#%$$$%$$$$$$$$%%%%%$%%%%%%%%%%%%%%%%%%%%#%%%%%%%%%&'()%*+,-./0123456789:;<=>?@%A%%BCD#)#%%%*$$$$%%%####%t*u*v*$r*s*$$~'%z'##%$&$'$$$$$$%0$$$$$$$$$$$$$$%1$$$(%%%%2%%%%%%%%%%%%%%%%%3$%%%%4g%6789:;%<=>?@ABCDEaGHIJKL$%MNOPh}'%$#%$%$$$$$#%#####%%%%$%%$$#%####$$$$$$$$$$$%$$$$$$$$$$$$$$$%$$$$%%%%%%%%%%#%%%%%$%%%%%%$$#######&'()*+,-./0123456789:;<=>?@##$$#$%%$%$$$$$%%$%%%%%%%%$%%%$%%$$$%$%$$$$$$$$%%$$$$$$$$$$$$$$%%$$$%%&%'%(%)*+,%-./012%3456$7%89$:;<$=$>?@A$$$$$BC$$$$$$$$$$$$$$$$$%)#%#%*$$#$#%#$$$#%t*u*v*$r*s*#$#%#$$#$#$'$#$$%$%0$$$%$$$$$$$$%$%1$$$<%%%%2%%%%%%%%%%%%%%%%%3$%%%%4%%6UfSV;%^[X?w(]ciej~'lmI%KL$t(k|'q(Px(y($)#%%%*$$$$#%%####%t*u*v*$r*s*$$#%z'##%$&$'$$$$$$%0$$$$$$$$$$$$$$%1$$$(%%%%2%%%%%%%+%%%%%.%%%3$%%%%4%-6789T;%<=>?@A,CDEZG/IJz(L$%MNOP{($%$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$IK$LM$$$$$S$$$$$%&$'($$$$$%$$G)*?-.=,>12345678H9:;</+ED0AFB@C%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%)*+,-./012345678$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$9:;<=>?@ABCDEFGH%I&K(M%%$$$$$$$$J%%%I%K&%%L'M(N%O%P%Q%%%%%R%G%C%)%*%?%-%.%=%,%%%$$$$$>%1%$$$$2%$$$$$$$3%$$$$$$$$4%5%6%7%8$$$$%H$%9%:%;%<%/%+%E%$$D%0%A%F%B%@%$$$2%%%%34879;:%=?>@ACBDEGIHJLKNMOP$$$'$$$6$$$$$$%%$$$$$$$$$$$%%$<%(&$$%$$01*$%%%%z'r*s*u*v*%t*$$%%$)%%%%$$%%$%%%%%%%%%%%#%%%%h$$$$$$$$$$%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$$%$$$$'$$$%J$%%$$$$L$S%&K(M%O%PN%$$$$$%%$$%Q%%%%%%%%%$%%%%R$%IH)*+,-./0123456789:;<=>?@ABCDEFG$################################$%$'$#%$$g%%%$#%$d$$$$%$$h}'a%$#x(%%%#2%%%%%%%%%%%#%%%%%3$%%%%4%%6789#;W%=>?@ABCDE#GHIJbL$%MNOP%%$################################$%%%$%%$$%%%%$%$$U$%$%j$$~'[c%%y(%%%%%2%%%%%%%%%%%%%%%%%3$%%%%4%%6S89:;%<fX?^A]CDeZm%iJKL$%t(NOP%q($################################$%%%%%%$%%%%%$%%$U[ce%i$jZ~'%y(%q(%%%%%2%%%%%%%%%%%%%%%%%3%%%%%4%56S89:;%<fX?^A]CDEFm%IJKL%%t(NOPQR%################################$v*$'$%$$%$%0$$$%$$$$u*$$$%$%1$$$<%%%%2%%%%%%%%%%%%%%%%%3$%%%%4%%6UfSV;%^[X?w(]ciej~'lmI%KL$t(k|'q(Px(y(t*################################$%%'%W%$%$%%%$$%%%%b%%$%%%%%%%%%%%%%2%%%%%%%%%%%%%%%%%3%%%%%4%%6789:;%<=>?@ABCDEu(GHIJKL%%MNOPQv(%################################$&$')$%$~'$%0$$$$$$$$%$$$y($%1%z'%(%%%%2%%%%%%%%%%%%%%%%%3$%%%%4%56789:;%<=>?@ABCDEFGHIJKL$%MNOPQR%################################$%U%)%%$~'$%0%$w(%$$%k%v*$$y(X|(1%z'%x(%%%%2%%%%%%%%%%%%%%%%%3%%%%%4%%6789T;V<=>?@ABCDEZlHIJy'L|'s(MNOP^}(%%P?9;7%=@A>EDB2%%<%JLHOM%34%'%$%8CING%%%($$$$&01$$$$$%%%$$$$$$$$$$$$$$:%$$$$$$$$F%%%%h%%%$$$$$%$%6%%K%$R5%%%Q%$$$$$$$$$$$$$$$$$$%P?9;r(V=kA%y'D%2%%%%JL%%%|'34%p(%$X8CIN%U%y(%^$w(%}'01$$$$$%%%%$$$$%x($$$$$$$%T$$$$$$$$Z%%%Y%%%_$$$$%%$%6%%ln%~'%%%%Q%o($$$$$$$$$$$$s(%{'$$";
const FEAT_FID =
  "%%${)$$$$'*$)%'$$$$&$(&%B',$$%(4'$%$2*''%(%6*'.&*$(1&&%%*G/$*/$).$7.3@%0$6*')&%%@-5$$$&%$&)%&5*$&)(5*')(-,%=Q(&)%'$&*&+S&'$*1&&(93$'E.3&'&'&&&%&$7*'$((M$;2'2)$.)$$$$+$$$)%$*&$))G$&$$$$$$$$$$$$$$$$$$$'$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$&%$&$$)'$$$$$$$$%$$$$$$$$$%$$$,'$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$";
const FEAT_LOGP =
  "b}%#r'p)r'r5Q/#^~%c.#gLtHc.j7u>bFbJS2R2t9q'}%p&vR&R5o)c.Z;X-|*X1py%o&P2xW$g%f+v0l3e=TFQg$m+^2cY$vE#wW$ja$VT$fOn(iQ$VMS*np$p%R2n3T+SGm6uGlKdr$p%U6gAn&q8T(W[$L}AR'p'h<x7Y(oCch%]CU?bEZ(]*n'c7s0RDc.co$u1Q;n)t'q(xQ%o)b.##e@b+o,b.ZZ$tNgBxJvKy=y(~%},X(b.Xp$n,Q8P8b1a$q/},Z(se$[$o5U0VT$c+Te%tKz.u'v1l3^;S'~&Q3ZA[u$f,S'[;oF{3q2q%em$g)X1S+s;gT$Z4qi$T%q5p)d+r$#P&P2Q2^-#_-P2#c.},]&#U'Z*r'}%c+},d*y(p&p*b1}%p&q'p)o)r'W%h(q*wQ$i=[4U3Y,U4QG[,j;n@c4w&V(R/T+a9l+b%Z%[1|Ho8j.P5T.n.QGcd$f$t>c.v5^e$x}%TASAo|$v>Q8c7t-p)mAu4y4i=[6.a'R1d'd6t-}%Cn(yKg:e-X-z*T0n?t2h5e9[Jx>cY$]LcCn1l0t/Z1jLd3d=z2U'U$f/}(v4q,JNS%qCr'P+^'t6fOc=U'i%d@hl$P&a%b%}B[Ma0NX;zR$jGg5o@s-l(]'d-aMpOi-Y$4z%^*o/q;Y,X%#j0i%kV%k<{5xW$g7{%d's5r'T0v3q5c@Q-W-i%w+y(b9sAy<t&DW>w+j$s3Q4}=tA]V$d&c7Z-k6X%RHc.m+uF|P$t9}2i3d1Q;R5R2},_JUBtH{BX+l1|&j'XX$l0c.j0x+}%j%z-v4c$n&X/FY*g/P'c%s%j/_:x3r-W3Y&d0p&c.Q0o5c/a0c(";
const LANG_META =
  "3C37?5159/595/931s$g$m$^$c$a$Y$e$_z&uw&Tz&}y&wi&Zp&pn&|l&Xx&_z&bt&ck&|l&lt&Rj&Rz&Wi&{U&xc%}b%}d%n[%S]%}}$S_%|V&Td&Xd&Xd&";
const CANON_RANK = "#$&%(')*+FECDGH,/4<8:>2B01-9?;=@A356K7LMNOP.QIJ";
// Shared records are destructured into module-private consts by hot modules; V8 reloads exported or imported bindings through a cell on every access.
const SBCS_SCRIPT_A = new Uint8Array(NUM_SBCS);
const LANG_SCRIPT_A = new Uint8Array(NUM_LANGS);
const CANON_RANK_A = new Uint8Array(NUM_ENC);
const NONASCII_REST = new Int32Array(NUM_LANGS);
const SCRIPT_FIRST = new Int32Array(NUM_SCRIPTS);
const SCRIPT_COUNT = new Int32Array(NUM_SCRIPTS);
const SBCS_INVALID = new Int32Array(NUM_SBCS * 4);
const pairOff = new Uint16Array(NUM_SBCS);
const pairW = new Int16Array(420 * 128);
const WMAXT = new Int16Array(128 * NUM_SBCS);
const GMAX = new Int16Array(128);
const SBCS_KEY = new Int32Array(NUM_SBCS * 128);
export const model = {
  SBCS_SCRIPT: SBCS_SCRIPT_A,
  CANON_RANK: CANON_RANK_A,
  NONASCII_REST,
  SCRIPT_FIRST,
  SCRIPT_COUNT,
  SBCS_INVALID,
  pairOff,
  pairW,
  WMAXT,
  GMAX,
  SBCS_KEY,
};
const ICODE = Int8Array.from({ length: 128 }, (_, c) => INT_CHARS.indexOf(String.fromCharCode(c)));
const HCAP = 8192;
const HSHIFT = 23;
const HOFF = new Int32Array(NUM_MBCS + 1);
const HMUL_A = new Int32Array(NUM_MBCS);
const HKD0 = new Int32Array(HCAP);
const HD1 = new Int32Array(HCAP);
const NATW = new Uint16Array(NUM_MBCS * 256);
const TRAIL_CLASS = new Uint8Array(NUM_MBCS * 256);
const CP949_HITRAIL = new Uint8Array(256);
const MODEL_FIRST = Int32Array.of(0, 1, 2, 3, 4, 6, 8);
const MODEL_LANG = Int32Array.of(26, 26, 25, 25, 27, 28, 28, 27);
const MODEL_NATIVE_W = new Int32Array(NUM_MBCS_LANG_MODELS);
const MBCS_MAX_CHAR_W = new Float64Array(NUM_MBCS_LANG_MODELS);
const MBCS_INVALID = new Int32Array(NUM_MBCS * 4);
export const mbcsModel = {
  HSHIFT,
  HOFF,
  HMUL: HMUL_A,
  HKD0,
  HD1,
  NATW,
  TRAIL_CLASS,
  CP949_HITRAIL,
  MODEL_FIRST,
  MODEL_LANG,
  MODEL_NATIVE_W,
  MBCS_MAX_CHAR_W,
  MBCS_INVALID,
};
const actH = new Uint8Array(128);
const cntH = new Float64Array(128);
const cntH32 = new Int32Array(128);
const candMask = new Int32Array(2);
const candLang = new Int32Array(NUM_ENC);
const candLL = new Float64Array(NUM_ENC);
const mbcsNat = new Float64Array(NUM_MBCS);
const mbcsChars = new Float64Array(NUM_MBCS);
const mbcsDelta = new Float64Array(NUM_MBCS * 2);
const mbcsTrail = new Float64Array(NUM_MBCS);
const mbcsExtra = new Float64Array(NUM_MBCS);
const mbcsPos = new Float64Array(NUM_MBCS);
const mbcsRate = new Float64Array(NUM_MBCS);
const mbcsOrder = new Int32Array(NUM_MBCS);
const sbcsOrder = new Int32Array(NUM_SBCS);
export const scratch = {
  actH,
  cntH,
  cntH32,
  candMask,
  candLang,
  candLL,
  mbcsNat,
  mbcsChars,
  mbcsDelta,
  mbcsTrail,
  mbcsExtra,
  mbcsPos,
  mbcsRate,
  mbcsOrder,
  sbcsOrder,
};
const hist = new Int32Array(256);
const bank2 = new Int32Array(256);
const CHUNK_WORDS = 4096;
export let nH = 0;
export let asciiTotal = 0;
let bestLL = -Infinity;
let secondLL = -Infinity;
