export const NUM_ENC = 47;
export const NUM_MBCS = 6;
export const NUM_SBCS = 32;
export const MBCS_OFFSET = 9;
export const SBCS_OFFSET = 15;
export const NUM_LANGS = 26;
export const NUM_LATIN = 15;
const NUM_MBCS_LANG_MODELS = 8;
export const POOL32_LO = 0xffffefff;
export const POOL32_HI = 0x1;
export const POOL47_LO = 0xffffffff;
export const POOL47_HI = 0x7fff;
export const ENC_NAMES =
  "ASCII,UTF-8,UTF-16BE,UTF-16LE,UTF-32BE,UTF-32LE,ISO-2022-JP,ISO-2022-KR,ISO-2022-CN,Shift_JIS,EUC-JP,EUC-KR,CP949,GB18030,Big5,ISO-8859-1,ISO-8859-2,ISO-8859-5,ISO-8859-6,ISO-8859-7,ISO-8859-8,ISO-8859-9,KOI8-R,windows-874,windows-1250,windows-1251,windows-1252,windows-1253,windows-1254,windows-1255,windows-1256,windows-1257,windows-1258,KOI8-U,IBM866,IBM855,macintosh,x-mac-cyrillic,ISO-8859-3,ISO-8859-4,ISO-8859-10,ISO-8859-13,ISO-8859-14,ISO-8859-15,ISO-8859-16,CP850,CP852";
export const LANG_NAMES =
  "en,fr,de,es,cs,pl,ro,mt,lv,lt,et,is,cy,tr,vi,ru,uk,sr,el,ar,he,th,ko,ja,zh-Hans,zh-Hant";
export const HMUL = "vwt~u6kwkowd%|dzgrV|dzgrV}nlpt'epaonx%";
export const MBCS_SJIS_CODES =
  "psp+$<t7%%($$%'%%%)'&$$%$&$2'*$$$)$o(%6%2F$+vt(~_y/r5x0|2x:p-s:s(|E";
export const MBCS_SJIS_LOGP =
  "fk&]b4#{7|5a+u2dA#c0t-c9n1{9nAeBn)Sl-u4u'z(l=i&f,l%i=n-w2pBb4##k+#j+q'c*r.p/##c*o(n(#a-~,o(";
export const MBCS_EUCKR_CODES =
  "pyo.OC0~.A.w?w4:5y/-MtAw0+-u2y3~5u/0a|/r3Kr.+h/q/$/(%$..:w-%SC%v|($$*t0";
export const MBCS_EUCKR_LOGP =
  "fu&l6c4t@y&i0y&z-}>Wt@c*b4c6q&o'd/x*d*e*w0#v0},n'#o)c3~>j&#i:c)}&c*f@j%k%d.k&o(r/e*o2x5g?~Bm?l5f)";
export const MBCS_GB_CODES =
  "|}p+r,&oHtUtn<{{+{+z}+yNxCo{/~G}3P|2y/*7v0H}/Wo5}-u(&o0s4y>q4C{2z1v4{Bt41pcs3Nv.'5s6p>}2Ko2wQ+,<~10-o3w3}1Jo3xs*Awt0";
export const MBCS_GB_LOGP =
  "zk'i&b*~,c4b4o(k+j+o1a9o0|Tq:p:#o1|,{RzR~,o(##s.b4c4b4{;l6n(#o(#k+g2~5~,o(m6x*b*y&x0qCv5x0}6z%b4y0x0eEj7x&c4r8m<j+#b4q'q/p9o(";
export const MBCS_GB_MASK = "#ScddcddddFddd4L9BQdX2";
export const MBCS_BIG5_CODES =
  "psp-%|R)%0%)%..Q$?s+''/4s)$q+4$?M.|+y,x2<p)u-v/t<p)}.}(*u2v4y1CtK~0p5|Cz1t1},(";
export const MBCS_BIG5_LOGP =
  "h~%n0x*d(d'z;c4b4o(o1|6a@n)b4#k+#j+#q'#~,a-{7l<#s8b4c*h&x&{1l6mWj<r/d)x&c*h&x0#c4o(b4##n(##o(";
export const MBCS_BIG5_MASK = "d_ddddddddddd>.E#";
export const buildModel = (): void => {
  const cls = decodeInts(SBCS_CLS, NUM_SBCS * 128, false);
  const featFid = decodeInts(FEAT_FID, NUM_SBCS_FEATS, false);
  const featLogp = decodeInts(FEAT_LOGP, NUM_SBCS_FEATS, true);
  const latinAscii = decodeInts(LATIN_ASCII_W, NUM_LATIN * 27, true);
  const meta = decodeInts(LANG_META, NUM_SBCS_LANGS + 2 * NUM_LANGS - NUM_LATIN, true);
  SBCS_SCRIPT_A.set(decodeInts(SBCS_SCRIPT, NUM_SBCS, false));
  LANG_SCRIPT_A.set(decodeInts(LANG_SCRIPT, NUM_LANGS, false));
  CANON_RANK_A.set(decodeInts(CANON_RANK, NUM_ENC, false));
  for (let l = 0; l < NUM_LANGS; l++) {
    NONASCII_REST[l] = meta[NUM_SBCS_LANGS + l];
    ASCII_REST[l] =
      l < NUM_LATIN ? latinAscii[l] : meta[NUM_SBCS_LANGS + NUM_LANGS + l - NUM_LATIN];
  }
  const featW = new Int32Array(NUM_LANGS * 128).fill(FEAT_ABSENT);
  for (let l = 0, p = 0; l < NUM_SBCS_LANGS; l++) {
    let fid = -1;
    let logp = 0;
    for (let j = 0; j < meta[l]; j++, p++) {
      fid += featFid[p];
      logp += featLogp[p];
      featW[l * 128 + fid] = logp;
    }
  }
  AMAX.fill(-32768);
  for (let l = 0; l < NUM_LANGS; l++) {
    const sc = LANG_SCRIPT_A[l];
    const count = SCRIPT_COUNT[sc];
    if (count === 0) SCRIPT_FIRST[sc] = l;
    else if (SCRIPT_FIRST[sc] + count !== l)
      throw new Error("languages of a script must be consecutive");
    SCRIPT_COUNT[sc] = count + 1;
    const rest = ASCII_REST[l];
    for (let b = 0; b < 128; b++) {
      const w =
        l < NUM_LATIN && b >= 0x61 && b <= 0x7a
          ? rest + latinAscii[NUM_LATIN + l * 26 + b - 0x61]
          : rest;
      if (l < NUM_LATIN) AWT[b * 16 + l] = w;
      AMAX[b] = Math.max(AMAX[b], w);
    }
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
      const rest = NONASCII_REST[l];
      for (let b = 0; b < 128; b++) {
        const c = cls[e * 128 + b];
        let w = OOS;
        if (c === 2) w = rest;
        else if (c >= 3) {
          const fw = featW[l * 128 + c - 3];
          w = fw !== FEAT_ABSENT ? fw : script !== 0 || c - 3 >= 10 ? rest : OOS;
        }
        pairW[pair * 128 + b] = w;
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
export const NUM_SCRIPTS = 9;
export const countBytes = (data: Uint8Array, n: number): void => {
  n = n | 0;
  let i = 0;
  if (n >= 32) {
    const head = (4 - (data.byteOffset & 3)) & 3;
    for (; i < head; i = (i + 1) | 0) {
      const b = data[i];
      hist[b] = hist[b] + 1;
    }
    const words = ((n - head) >>> 2) | 0;
    const u = new Uint32Array(data.buffer, data.byteOffset + head, words);
    for (let j = 0; j < words; j = (j + 1) | 0) {
      const w = u[j];
      const b0 = w & 255;
      const b1 = (w >>> 8) & 255;
      const b2 = (w >>> 16) & 255;
      const b3 = w >>> 24;
      hist[b0] = hist[b0] + 1;
      hist[b1] = hist[b1] + 1;
      hist[b2] = hist[b2] + 1;
      hist[b3] = hist[b3] + 1;
    }
    i = (head + words * 4) | 0;
  }
  for (; i < n; i = (i + 1) | 0) {
    const b = data[i];
    hist[b] = hist[b] + 1;
  }
};
export const compactHistogram = (n: number): number => {
  let a = 0;
  let h = 0;
  let total = 0;
  for (let g = 0; g < 256; g = (g + 8) | 0) {
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
      if (b < 0x80) {
        actA[a] = b;
        cntA32[a] = c | 0;
        a = (a + 1) | 0;
        total += c;
      } else {
        actH[h] = b - 0x80;
        cntH32[h] = c | 0;
        h = (h + 1) | 0;
      }
    }
  }
  nA = a;
  nH = h;
  asciiTotal = total;
  let controls = 0;
  for (let j = 0; j < a; j++) {
    const b = actA[j];
    if (b >= 0x20) break;
    controls |= 1 << b;
  }
  if (a > 0 && actA[a - 1] === 0x7f) controls |= 1 << 31;
  if (n > SBCS_INT_MAX) {
    cntA.set(cntA32.subarray(0, a));
    cntH.set(cntH32.subarray(0, h));
  }
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
const CODE_T = 60;
const CODE_U = 74;
const INT_CHARS =
  "#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_abcdefghijklmnopqrstuvwxyz{|}~";
const LANG_SCRIPT = "###############$$$%'&()*++";
const SBCS_SCRIPT = "##$'%&#$(#$#%#&'##$$$#$#########";
const SBCS_CLS =
  "################################$&$'$$$$$$%0$$$$$$$$$$$$$$%1$$$(%%%%2%%%%%%%%%%%%%%%%%3$%%%%4%56789:;%<=>?@ABCDEFGHIJKL$%MNOPQR%################################$%$%$%%$$%%%%$%%$U$k$%{'$$}'|'o(u($w(v(%%%%2%%%%%%%%%%%%%%%%%3$%%%%4%%6%89T;%V=X?^A_CDYZlnIJ%L$z'q(N%PQ~'$################################$%%%&%'(%%%%%$%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%)*+,-./0123456789:;<=>?@ABCDEFGH$IJ%K%LMNOPQ%$%R################################$###$#######%$#############%###%#&%'%(%)*+,%-./012%34567%89#####$:;<=>?@ABC$$$$$$$$#############################################$%%$$$$$$$%%$$#%$$$$$$%$%%%%%$%%%%%%%%%%%%%%%%%%%%#%%%%%%%%%&'()%*+,-./0123456789:;<=>?@%A%%BCD#################################$#$$$$$$$$$%$$$$$$$$$$$$$$$%$$$################################$&'()*+,-./0123456789:;<=>?@##$$#################################$&$'$$$$$$%0$$$$$$$$$$$$$$%1$$$(%%%%2%%%%%%%%%%%%%%%%%3$%%%%4g%6789:;%<=>?@ABCDEaGHIJKL$%MNOPh|'%$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$I$$$$$$$$$$$$$$$%$$$$$$$$$$$$G)*?-.=,>12345678H9:;</+ED0AFB@C%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$####$###########%%%%$%%########$&%%'%%()%%%%%%%%%%%*+%,%-./%%0%%123%4%5%%67%8%%9:;%<=%%>?%@%%%$AB%CD%%%E@%%%%%$$$$$$$$$$$%%$$$$)#%#%*$$#$%%%%%%#%r*s*t*$p*q*#$}'%{'o(w(u($$$%$%$$$$%0$$$%$$$k$$$$$U|'1%$%v(%%%%2%%%%%%%%%%%%%%%%%3$%%%%4%%6%89T;%V=X?^A_CDYZlnIJ%L$z'q(N%PQ~'$%%%%%$$$$$%%%%%%J%%%%$%%#$O%P%QR$%%%$%$$%$&%$$$($$'LS$$$I$K%N%%M%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%)*+,-./0123456789:;<=>?@ABCDEFGH)#%%%*$$$$%%%#%##%r*s*t*$p*q*$$}'%y'#w(%$&$'$$$$$$%0$$$$$$$$$$$$$$%1$$$(%%%%2%%%%%%%%%%%%%%%%%3$%%%%4%56789:;%<=>?@ABCDEFGHIJKL$%MNOPQR%$#%$%$$$#$#%#####%%%%$%%#$#%####$$%$$$$$$$#%$$$%$$$$$$$$%%%%%$%%%%%%%%%%%%%%%%%%%%#%%%%%%%%%&'()%*+,-./0123456789:;<=>?@%A%%BCD#)#%%%*$$$$%%%####%r*s*t*$p*q*$$}'%y'##%$&$'$$$$$$%0$$$$$$$$$$$$$$%1$$$(%%%%2%%%%%%%%%%%%%%%%%3$%%%%4g%6789:;%<=>?@ABCDEaGHIJKL$%MNOPh|'%$#%$%$$$$$#%#####%%%%$%%$$#%####$$$$$$$$$$$%$$$$$$$$$$$$$$$%$$$$%%%%%%%%%%#%%%%%$%%%%%%$$#######&'()*+,-./0123456789:;<=>?@##$$#$%%$%$$$$$%%$%%%%%%%%$%%%$%%$$$%$%$$$$$$$$%%$$$$$$$$$$$$$$%%$$$%%&%'%(%)*+,%-./012%3456$7%89$:;<$=$>?@A$$$$$BC$$$$$$$$$$$$$$$$$%)#%#%*$$#$#%#$$$#%r*s*t*$p*q*#$#%#$$#$#$'$#$$%$%0$$$%$$$$$$$$%$%1$$$<%%%%2%%%%%%%%%%%%%%%%%3$%%%%4%%6UfSV;%^[X?u(]ciej}'lmI%KL$r(k{'p(Pv(w($)#%%%*$$$$#%%####%r*s*t*$p*q*$$#%y'##%$&$'$$$$$$%0$$$$$$$$$$$$$$%1$$$(%%%%2%%%%%%%+%%%%%.%%%3$%%%%4%-6789T;%<=>?@A,CDEZG/IJx(L$%MNOPy($%$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$IK$LM$$$$$S$$$$$%&$'($$$$$%$$G)*?-.=,>12345678H9:;</+ED0AFB@C%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%)*+,-./012345678$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$9:;<=>?@ABCDEFGH%I&K(M%%$$$$$$$$J%%%I%K&%%L'M(N%O%P%Q%%%%%R%G%C%)%*%?%-%.%=%,%%%$$$$$>%1%$$$$2%$$$$$$$3%$$$$$$$$4%5%6%7%8$$$$%H$%9%:%;%<%/%+%E%$$D%0%A%F%B%@%$$$2%%%%34879;:%=?>@ACBDEGIHJLKNMOP$$$'$$$6$$$$$$%%$$$$$$$$$$$%%$<%(&$$%$$01*$%%%%y'p*q*s*t*%r*$$%%$)%%%%$$%%$%%%%%%%%%%%#%%%%h$$$$$$$$$$%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$$%$$$$'$$$%J$%%$$$$L$S%&K(M%O%PN%$$$$$%%$$%Q%%%%%%%%%$%%%%R$%IH)*+,-./0123456789:;<=>?@ABCDEFG$################################$%$'$#%$$g%%%$#%$d$$$$%$$h|'a%$#v(%%%#2%%%%%%%%%%%#%%%%%3$%%%%4%%6789#;W%=>?@ABCDE#GHIJbL$%MNOP%%$################################$%%%$%%$$%%%%$%$$U$%$%j$$}'[c%%w(%%%%%2%%%%%%%%%%%%%%%%%3$%%%%4%%6S89:;%<fX?^A]CDeZm%iJKL$%r(NOP%p($################################$%%%%%%$%%%%%$%%$U[ce%i$jZ}'%w(%p(%%%%%2%%%%%%%%%%%%%%%%%3%%%%%4%56S89:;%<fX?^A]CDEFm%IJKL%%r(NOPQR%################################$t*$'$%$$%$%0$$$%$$$$s*$$$%$%1$$$<%%%%2%%%%%%%%%%%%%%%%%3$%%%%4%%6UfSV;%^[X?u(]ciej}'lmI%KL$r(k{'p(Pv(w(r*################################$%%'%W%$%$%%%$$%%%%b%%$%%%%%%%%%%%%%2%%%%%%%%%%%%%%%%%3%%%%%4%%6789:;%<=>?@ABCDEs(GHIJKL%%MNOPQt(%################################$&$')$%$}'$%0$$$$$$$$%$$$w($%1%y'%(%%%%2%%%%%%%%%%%%%%%%%3$%%%%4%56789:;%<=>?@ABCDEFGHIJKL$%MNOPQR%################################$%U%)%%$}'$%0%$u(%$$%k%t*$$w(Xz(1%y'%v(%%%%2%%%%%%%%%%%%%%%%%3%%%%%4%%6789T;V<=>?@ABCDEZlHIJ%L{'%MNOP^{(%%P?9;7%=@A>EDB2%%<%JLHOM%34%'%$%8CING%%%($$$$&01$$$$$%%%$$$$$$$$$$$$$$:%$$$$$$$$F%%%%h%%%$$$$$%$%6%%K%$R5%%%Q%$$$$$$$$$$$$$$$$$$%P?9;q(V=kA%%D%2%%%%JL%%%{'34%o(%$X8CIN%U%w(%^$u(%|'01$$$$$%%%%$$$$%v($$$$$$$%T$$$$$$$$Z%%%Y%%%_$$$$%%$%6%%ln%}'%%%%Q%~'$$$$$$$$$$$$%%z'$$";
const FEAT_FID =
  "%%$y)$$$$'*$)%'$$$$&$(&%A',$$%(4'$%$2*''%(%6*'.&*$(1%&%%)G/$*/$(-$7.3?%/$5*')(-,%;Q(&)%'$&)&*S&'$*0&%(93$'D-3&'&'&&&%&$7*'$((K$;2'2)$-)$$$$+$$$)%$*&$))E$&$$$$$$$$$$$$$$$$$$$'$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$&%$&$$)'$$$$$$$$%$$$$$$$$$%$$$,'$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$";
const FEAT_LOGP =
  "bu)#c*a-c*c?b5#nv)c4#gc%t[c4yAuLbXb_s9r9eEb*n'p(v{)c>~,c4kGi2|.i8po)o(p9it%v&u/v7{;tJtWbj&|/}9rv%gW#ht%ya&vn%ug%n+xj%gd%s-nx&a'r9};e/dYm@fZ{a%d{&a'u?vPn(qCt*xr'~,b4##eOq/o1b4zw%tf%gRx_gb%jKy+o'}1x*b4xw&n1qBpBq8a%b6}1z*dh&[~>u6vn%r/tn(eb%z4f*g9{;nGd)~(b;kPla'f1d)lGoXl<q:b'ts&v,i8d/dHgo%z<bn&e&b?a-s/r%#p'p9q9n2#o2p9#c4}1|'#f)z-c*n'r/}1d.y+p(p.q8n'p(b*a-~,c*h&h+q.hk%xJ{<f;y0u<bY{0yGnOc=w(v*c5e/pD{/q&k&l8|[oCj4a>t3n4bYcf&f%tLc4g?ng&xu)ePdPol'vLqBrAe3a-|Pu=y=xJ{?.p)c8s)d@e3n'Cn+jb%gFt2i2z.t6}Mt:w>tD{^xLrv%|b%rS}8l7e6k8jc%s;sJz:f)Uu5}+v=q1JNd&bTc*a/n)t@ug%rJf)x&dOhr&p'p&q&}Rld%a7NiGzl%yYv>oOd3l+m)s2pd%ah%x2Y4k'}-~5bHy0i&#j7x&zy'kIl?it%vAl's)d?c*t6g<b?cOb2h2x&h0y+qDdQyIt(DwKh0j%d<q<nKeQ|q%d(rAk2k@i&rZc4|/uX|i%eE}:x;s8bGc>r9}1~^uQt[{Ri/{8|(y)xt%l7c4j7i0n'y&k3v=c%n(i5Fy-v5a)r&d'y5~Ei<c3h;y'd7p(c4q6~>r5a7c+";
const LATIN_ASCII_W =
  "hq'|r'bs'bs'lv'zt'nv'vt'~v'fw'tu'jw'pt'tv'd~'}i%e>oMcXwt%qGgEub%cf%p@u.iVwIae%wg%}CpJib%oc%ql%oMe4wIp@gEjSmi%{2{RuUuy%y7{2u,ci%M#oa%qPwg%aa%qPw=}e%kj%ch%yd%cA#b'f.h?we%mEoQw^o|%uBuPi]gi%r0e:wSgLyo%gLe0#qg%qh%qd%cZy,mE##}7su%u=q[ec%{w%s,m5s,kd%d'#c^cRif%ul%aLy2}f%sj%a[}Vy2##y2Koi%eFeFcZyn%##aAo_yLwZm[gWsj%yq%uX#wZqa%mg%mVsb%##kJ}Mko%qAuY}Tyk%#y?{9km%cLmVyI{Pqc%el%mS#s^o[uYcN#e^#mX}c%at%s;{c%yXgw%y=s;#ot%##k_eUmi%k_uV#gk%w^yg%sf%w?###y3ms%mM#oSqf%iJgP#au%uFuUmk%o_}f%{[}Ge?we%m]ch%gZ#mBy@##cx%}C#eTqm%#mH#qr%oOc]yXyZoa%cXaU#{e%sp%ch%qb%iS###aKkw%yC#iRif%#iH#az%iMe^oVuXke%ij%cT#}g%so%uf%}c%mP####wv%}9#}Zcu%#mGuDaq%cFg_qc%cYeb%o[cL#oXmm%el%ie%cO####av%c;#uFyj%eVm_{Jao%m=oXeb%g^ko%oN##cr%og%wd%ub%uP####es%eDqV{f%{j%qQaYqTih%##k^gMgm%sd%u?#sg%ySkRaO#ga%#ml%#ix%uRk9ma%eq%#w?y=ip%#ma%ag%gZ}l%{Ow6#ej%kTuV}Uk9##uViCee%uIuh%kFcH#am%ur%si%#eOsSwZg|%gb%qL#mWcHsl%}_sS####";
const LANG_META =
  "3C37?51595/931s%g%m%^c%a%Ye%~w+ft+tw+nw+h}*zh+pf+bo+ra+|c+lo+r}*rw+h|*lb*xl(nk(nn(nc(dd(nn'dg(|c*tt*xt*xt*~z'~z'~z'~z'~z'~z'dd(nu'pi(pi(pi(";
const CANON_RANK = "#$&%(')*+FECDGH,/4<8:>2B01-9?;=@A356K7LMNOP.QIJ";
// Shared records are destructured into module-private consts by hot modules; V8 reloads exported or imported bindings through a cell on every access.
const SBCS_SCRIPT_A = new Uint8Array(NUM_SBCS);
const LANG_SCRIPT_A = new Uint8Array(NUM_LANGS);
const CANON_RANK_A = new Uint8Array(NUM_ENC);
const ASCII_REST = new Int32Array(NUM_LANGS);
const NONASCII_REST = new Int32Array(NUM_LANGS);
const SCRIPT_FIRST = new Int32Array(NUM_SCRIPTS);
const SCRIPT_COUNT = new Int32Array(NUM_SCRIPTS);
const SBCS_INVALID = new Int32Array(NUM_SBCS * 4);
const pairOff = new Uint16Array(NUM_SBCS);
const pairW = new Int16Array(360 * 128);
const AWT = new Int16Array(128 * 16);
const AMAX = new Int16Array(128);
const WMAXT = new Int16Array(128 * NUM_SBCS);
const GMAX = new Int16Array(128);
const SBCS_KEY = new Int32Array(NUM_SBCS * 128);
export const model = {
  SBCS_SCRIPT: SBCS_SCRIPT_A,
  LANG_SCRIPT: LANG_SCRIPT_A,
  CANON_RANK: CANON_RANK_A,
  ASCII_REST,
  NONASCII_REST,
  SCRIPT_FIRST,
  SCRIPT_COUNT,
  SBCS_INVALID,
  pairOff,
  pairW,
  AWT,
  AMAX,
  WMAXT,
  GMAX,
  SBCS_KEY,
};
const NUM_SBCS_LANGS = 22;
const NUM_SBCS_FEATS = 390;
const FEAT_ABSENT = 1;
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
const MODEL_LANG = Int32Array.of(23, 23, 22, 22, 24, 25, 25, 24);
const MODEL_ASCII_W = new Int32Array(NUM_MBCS_LANG_MODELS);
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
  MODEL_ASCII_W,
  MODEL_NATIVE_W,
  MBCS_MAX_CHAR_W,
  MBCS_INVALID,
};
const actA = new Uint8Array(128);
const cntA = new Float64Array(128);
const cntA32 = new Int32Array(128);
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
  actA,
  cntA,
  cntA32,
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
export let nA = 0;
export let nH = 0;
export let asciiTotal = 0;
const hist = new Uint32Array(256);
let bestLL = -Infinity;
let secondLL = -Infinity;
