/**
 * Rail fence cipher: encryption, decryption and a ranked brute force.
 *
 * The plaintext is written in a zigzag across a number of rails and the
 * ciphertext is the rails read top to bottom. The zigzag repeats every
 * 2 * (rails - 1) positions, so the rail of position i is a triangle wave
 * of i. The offset starts the wave part way through that cycle, which is
 * the convention CyberChef uses for its own offset field:
 *
 *   k    = (i + offset) mod 2(rails - 1)
 *   rail = k            when k < rails
 *          2(rails-1)-k otherwise
 *
 * Decryption needs only the length: the same wave says how many characters
 * each rail holds, so the ciphertext can be cut into rails and read back
 * along the zigzag.
 *
 * The brute force cannot rank candidates by letter frequency, because a
 * transposition never changes which letters are present, only their order.
 * Every candidate has exactly the same letter counts. So the score is an
 * n-gram fitness: the sum of log10 probabilities of every bigram and every
 * quadgram in the candidate, which rewards English letter order.
 *
 * Pure functions, no React and no DOM.
 */

/** Characters accepted for encryption and decryption. */
export const MAX_CHARS = 20000;
/** Largest rail count accepted. */
export const MAX_RAILS = 1000;
/** Largest offset accepted before it is reduced modulo the cycle. */
export const MAX_OFFSET = 1000000;
/** Characters accepted by the brute force. */
export const BRUTE_MAX_CHARS = 5000;
/** Total character placements the brute force may spend across all candidates. */
export const BRUTE_WORK_BUDGET = 8000000;
/** Candidates kept and shown, best first. */
export const BRUTE_TOP = 20;
/** Fewest letters the scorer can say anything about: one quadgram. */
export const MIN_SCORED_LETTERS = 4;

export type Mode = "all" | "strip" | "fixed";
export type Direction = "encrypt" | "decrypt";

/* ------------------------------------------------------------- the fence */

export function cycleLength(rails: number): number {
  return 2 * (rails - 1);
}

/** Rail of position i, 0 being the top rail. */
export function railAt(i: number, rails: number, offset: number): number {
  const cycle = cycleLength(rails);
  const k = (i + offset) % cycle;
  return k < rails ? k : cycle - k;
}

export function railPattern(length: number, rails: number, offset: number): Uint16Array {
  const out = new Uint16Array(length);
  const cycle = cycleLength(rails);
  let k = offset % cycle;
  for (let i = 0; i < length; i += 1) {
    out[i] = k < rails ? k : cycle - k;
    k += 1;
    if (k === cycle) k = 0;
  }
  return out;
}

/** Characters on each rail. */
export function railLengths(pattern: Uint16Array, rails: number): number[] {
  const counts = new Array<number>(rails).fill(0);
  for (let i = 0; i < pattern.length; i += 1) counts[pattern[i]] += 1;
  return counts;
}

/** Reads the zigzag rail by rail. */
export function encryptStream<T>(stream: T[], rails: number, offset: number): T[] {
  const pattern = railPattern(stream.length, rails, offset);
  const buckets: T[][] = Array.from({ length: rails }, () => []);
  for (let i = 0; i < stream.length; i += 1) buckets[pattern[i]].push(stream[i]);
  return buckets.flat();
}

/**
 * For each plaintext position, the index in the ciphertext it came from.
 * Rail r occupies a contiguous run of the ciphertext, starting after the
 * runs of every rail above it.
 */
export function decryptSources(length: number, rails: number, offset: number): Int32Array {
  const pattern = railPattern(length, rails, offset);
  const start = new Int32Array(rails + 1);
  for (let i = 0; i < length; i += 1) start[pattern[i] + 1] += 1;
  for (let r = 1; r <= rails; r += 1) start[r] += start[r - 1];
  const src = new Int32Array(length);
  for (let i = 0; i < length; i += 1) {
    src[i] = start[pattern[i]];
    start[pattern[i]] += 1;
  }
  return src;
}

export function decryptStream<T>(stream: T[], rails: number, offset: number): T[] {
  const src = decryptSources(stream.length, rails, offset);
  const out = new Array<T>(stream.length);
  for (let i = 0; i < stream.length; i += 1) out[i] = stream[src[i]];
  return out;
}

/* ------------------------------------------------------ spaces and marks */

/** A letter or digit in any script rides the fence in every mode. */
const RIDES = /^[\p{L}\p{N}]$/u;

export interface Split {
  /** The characters that ride the fence, in order. */
  stream: string[];
  /** Puts a transformed stream back into the full text. */
  rebuild: (out: string[]) => string;
  /** Characters removed (strip mode) or held in place (fixed mode). */
  setAside: number;
}

/**
 * "all" puts every character on the fence, spaces and punctuation included.
 * "strip" removes everything that is not a letter or digit first. "fixed"
 * leaves spaces and punctuation where they were and moves only letters and
 * digits through the fence.
 */
export function splitText(text: string, mode: Mode): Split {
  const chars = Array.from(text);
  if (mode === "all") {
    return { stream: chars, rebuild: (out) => out.join(""), setAside: 0 };
  }
  const stream: string[] = [];
  const slots: number[] = [];
  chars.forEach((ch, i) => {
    if (RIDES.test(ch)) {
      stream.push(ch);
      slots.push(i);
    }
  });
  const setAside = chars.length - stream.length;
  if (mode === "strip") {
    return { stream, rebuild: (out) => out.join(""), setAside };
  }
  return {
    stream,
    setAside,
    rebuild: (out) => {
      const copy = chars.slice();
      for (let j = 0; j < slots.length; j += 1) copy[slots[j]] = out[j];
      return copy.join("");
    },
  };
}

/* ------------------------------------------------------- encrypt/decrypt */

export type RunOutcome =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      output: string;
      /** The fence's characters in plaintext order, for drawing the zigzag. */
      plainStream: string[];
      pattern: Uint16Array;
      rails: number;
      /** Offset reduced modulo the cycle. */
      offset: number;
      /** Each rail's characters, top rail first. Joined, they are the ciphertext stream. */
      railTexts: string[];
      notices: string[];
    };

export interface KeyCheck {
  ok: boolean;
  message: string;
  rails: number;
  offset: number;
}

/** Validates rails and offset as typed, and reduces the offset into one cycle. */
export function checkKey(railsRaw: string, offsetRaw: string): KeyCheck {
  const railsText = railsRaw.trim();
  const offsetText = offsetRaw.trim() === "" ? "0" : offsetRaw.trim();
  if (!/^\d+$/.test(railsText)) {
    return { ok: false, message: "Rails must be a whole number, 2 or more.", rails: 0, offset: 0 };
  }
  const rails = Number(railsText);
  if (rails < 2) {
    return { ok: false, message: "A fence needs at least 2 rails. With 1 rail nothing moves.", rails, offset: 0 };
  }
  if (rails > MAX_RAILS) {
    return { ok: false, message: `This page accepts up to ${MAX_RAILS} rails.`, rails, offset: 0 };
  }
  if (!/^\d+$/.test(offsetText)) {
    return { ok: false, message: "The offset must be a whole number, 0 or more.", rails, offset: 0 };
  }
  const offset = Number(offsetText);
  if (offset > MAX_OFFSET) {
    return { ok: false, message: `Keep the offset under ${MAX_OFFSET.toLocaleString("en-US")}. Only its remainder modulo ${cycleLength(rails)} matters.`, rails, offset: 0 };
  }
  return { ok: true, message: "", rails, offset };
}

/** Drops trailing line breaks, which a paste nearly always adds and a fence never meant. */
function trimTrailingBreaks(text: string): { text: string; trimmed: boolean } {
  const trimmed = text.replace(/[\r\n]+$/, "");
  return { text: trimmed, trimmed: trimmed.length !== text.length };
}

export function runRailFence(options: {
  text: string;
  rails: number;
  offset: number;
  direction: Direction;
  mode: Mode;
}): RunOutcome {
  const { rails, direction, mode } = options;
  if (options.text === "") return { kind: "empty" };
  if (!Number.isInteger(rails) || rails < 2 || rails > MAX_RAILS) {
    return { kind: "error", message: `Rails must be a whole number from 2 to ${MAX_RAILS}.` };
  }
  if (!Number.isInteger(options.offset) || options.offset < 0) {
    return { kind: "error", message: "The offset must be a whole number, 0 or more." };
  }
  const notices: string[] = [];
  const cycle = cycleLength(rails);
  const offset = options.offset % cycle;
  if (offset !== options.offset) {
    notices.push(
      `The zigzag repeats every ${cycle} positions with ${rails} rails, so offset ${options.offset} is the same as offset ${offset}.`,
    );
  }

  let text = options.text;
  if (mode === "all") {
    const t = trimTrailingBreaks(text);
    text = t.text;
    if (t.trimmed) notices.push("A trailing line break was ignored.");
  }
  let chars = Array.from(text);
  if (chars.length > MAX_CHARS) {
    chars = chars.slice(0, MAX_CHARS);
    text = chars.join("");
    notices.push(`Only the first ${MAX_CHARS.toLocaleString("en-US")} characters were processed.`);
  }
  const split = splitText(text, mode);
  const n = split.stream.length;
  if (n === 0) {
    return {
      kind: "error",
      message:
        mode === "all"
          ? "There is nothing to put on the fence."
          : "There are no letters or digits to put on the fence.",
    };
  }
  if (split.setAside > 0) {
    notices.push(
      mode === "strip"
        ? `${split.setAside} ${split.setAside === 1 ? "space or punctuation mark was" : "spaces and punctuation marks were"} removed before enciphering.`
        : `${split.setAside} ${split.setAside === 1 ? "space or punctuation mark stays" : "spaces and punctuation marks stay"} in place; only letters and digits move.`,
    );
  }
  if (offset === 0 && rails >= n) {
    notices.push(
      `With ${rails} rails and ${n} ${n === 1 ? "character" : "characters"}, every character lands on its own rail and the output equals the input.`,
    );
  }

  const pattern = railPattern(n, rails, offset);
  let plainStream: string[];
  let cipherStream: string[];
  if (direction === "encrypt") {
    plainStream = split.stream;
    cipherStream = encryptStream(plainStream, rails, offset);
  } else {
    cipherStream = split.stream;
    plainStream = decryptStream(cipherStream, rails, offset);
  }
  const railTexts = new Array<string>(rails).fill("");
  for (let i = 0; i < n; i += 1) railTexts[pattern[i]] += plainStream[i];

  return {
    kind: "ok",
    output: split.rebuild(direction === "encrypt" ? cipherStream : plainStream),
    plainStream,
    pattern,
    rails,
    offset,
    railTexts,
    notices,
  };
}

/* --------------------------------------------------------- English score */

/*
  The tables below were counted from about 1.7 million letters of English
  prose: Newton's Opticks (public domain), the common free software license
  texts, and modern technical articles, upper-cased with every non-letter
  removed, so n-grams run across word boundaries the same way they do in a
  ciphertext with its spaces stripped.

  Quadgrams: the 2,000 most frequent, which between them cover about half of
  all quadgram occurrences in the sample. Bucket k holds the quadgrams whose
  log10 probability rounds to QUAD_TOP - 0.1 * k. Anything not listed scores
  QUAD_FLOOR, one order of magnitude below the rarest listed quadgram.

  Bigrams: all 676, as -10 * log10(probability), rounded. A bigram never seen
  in the sample scores as if it had been seen half a time.
*/
export const QUAD_TOP = -2.4;
export const QUAD_BUCKETS: string[] = [
  "TION",
  "THER THAT",
  "OFTH NTHE FTHE THES STHE ETHE",
  "OTHE WITH HERE TTHE DTHE",
  "ATIO ANDT SAND NDTH THEC",
  "HICH WHIC EVER THEM THEP INTH INGT EAND IGHT THIS IONS ERTH MENT FROM WORK",
  "THIN TAND ONTH HING TING THEF NGTH EFOR RTHE CTIO THEL ECON VERY SOFT THEI INGA TOTH THAN SERV SNOT",
  "ABLE THET ISTH THED THEN ESTH THEO PORT NTER ATTH ANDA YTHE HESE HECO INTE SION VERS OVER ANDI ENSE " +
    "GTHE STAN PART CONT ERVE ECTI ENTI",
  "DING HESA RACT INGS HTHE ICEN RETH LICE RING ETHA ORTH CENS THEA RTHA YOUR ITIS FORE SAME ANDS STHA " +
    "DIST IONO SWIT IONA ICAT ESAM NOTH HATI ESOF RVER COLO RAND INGI ALLY OUGH EOFT ACTI COMP THEW SARE " +
    "OLOU LOUR AUSE REFR EFRA WHEN THEB READ MTHE",
  "CHAN HATT HELI TIME COND NDER WHAT EDTH SECO DAND ATED INST ESAN FORM ROMT CAUS LIGH SING WILL THEY " +
    "EPRO ENTS NING OUND ERSI UNDE FORT ENTH OMTH ISNO HEFI OURS ANCE HOSE ETWO NAND THEE MEAN ONOF ERAN " +
    "EACH EINT SIDE HEPR ENCE HAVE ETHI ITHA BYTH RATI INTO SOME ANGE WHER MORE EDIN APPL ERIN BECA ERAT " +
    "HERA SYOU FILE SETH EREF WARE SPEC DOES IRST FFER TWOR FIRS ERED",
  "ONLY ATIS EYOU NDIT ONFI TOFT ECAU CONF FRAC MOST YAND ROUG IONI CESS HEIR CATI ONTR SINT LINE OULD " +
    "EREN SFOR ABOU ESNO ENTA HERT IONT HETH THOS IFIC HAND KING INGO BOUT EDTO EREA THEG FORA ICAL THTH " +
    "RESS TALL RATE EDBY ANDC CONS IVES OWER YTHI NDIN ANDW RAYS EMEN THEH TURE OTHI THOU ONAN MBER ECOM " +
    "STRI ICHI THRO COVE BEFO ITHO ITHT LLOW RIGH APPE ATER EANS IFTH COPY RIBU ESIN HANG TRIB IBUT RECT " +
    "TRAN CTED HENT VICE ATES HEMA THRE HROU ANDO FERE HEPA WRIT EFIR",
  "TERM REAT LATE NGAN RENT RANS DIFF TERS EPAR LASS PROP DTHA INGL CHIS FTER CHIN NFIG RSIO ESTO EDAN " +
    "ESSI ANDR COMM SEVE ERAL DATA NOFT VERA EREI BACK RIVE FICA ITIO ALSO SWHI OUNT AFTE NEVE NGLE NEED " +
    "RECO DINT ANDB UMEN HEIN ISLI NOTA OESN PASS NSTA REST ONSO PRIS AREA NETW INGE IFFE NDRE EDIS LECT " +
    "EMOR MAKE GREE TTHA IDEN FYOU ATCH LESS TIVE DITI ESTA ENOT ESER STIN HISL EWIT TANC GENE LTHE FAIL " +
    "HEMO OURC ORAN TEST ISTR TATI TYOU TTER ATHE REAS DENT SLIC ITCH STOR ISTA ORRE MODE HOUT TIST ECOL " +
    "LOAD MAND ORMA VERT POWE ETER REFL ITHE NERA FIGU OINT SOTH ETWE EFLE IGUR SUPP UBLI ERST ANDL ORTI " +
    "TSTH HEDI NTHA WERE REIS NOTI LING ORTS TFOR UMBE TICA PLAC ENTE SIGN NAME ESEC HATA ONEA BETW TWEE " +
    "HOST",
  "TAIN ERET TABL EENT ALLO WEEN YOUC CATE ANDN ERNE UTTH EONE CODE ENER ONES CALL GLAS REAL NUMB IFYO " +
    "SUCH DOCU OCUM CUME LLTH TOBE REQU DNOT IENT HERI YOUA EWHI NGIN ORET LACE INGW AULT IBLE IBRA WITC " +
    "USET FTHI EWOR ARTI TUAL ATTE SSIO BEIN STTH ERES METH TERA ODIF ORKS ANDD ONNE BOTH PRES ANDP TERT " +
    "ONST ANDE MEDI STAT ERAY ESPE ATIN ALLE AINS PUBL STAL RARY RANG UALL ERMI LOCK YSTE EQUI TISA ANDM " +
    "NSTH DRIV DWIT ESSO CONN ANDF UGHT ANTH CTLY SSES PLIC FREE FAUL HOLE OGRA STEM RESE TENT ISWH DFOR " +
    "EARE HATS CHTH INES PROG RINT ESTI HANT ROGR CHEC ESSE CHES AKES PPLI COME EQUE EDON POIN LINK LIST " +
    "ACHI SWHE FACE MODI DRES HECK DERT NGTO RFAC DEFA SYST AREN INGF ERTI NNOT LIBR CKET JECT OMET RISM " +
    "NNEC ONSI ROUT ALLT ANOT NTRO CETH SOUR EFAU EPLA EING PECI GAND SECT ANIN SIST BRAR GRAM NECT EFRO " +
    "LAND PEAR HATC URCE ONSA LIKE ASTH LYTH PPEA TSOF RITE REFO ACCE PROV SCON NEAN TERI ISCO ANNO ARET " +
    "TINT PARA OPER LONG NESS TURN EVIC ECTE ERSA ORDE APER ARED YOUM RFOR ILIT PEND FFIC TERN LEAS ERIS " +
    "NDCO OUTO INCL MEMO MADE LETH EOTH TROL COUN ARTS ELIN THEV DEVI SITI LIMI IMIT STAR THEU PTIO TEDA " +
    "ARDS BYTE ENTL CANN REAC EVEN ERSO LITY IREC EITH SWER SHOW HEDE HREE TORE OFTW ITSO CENT ARGE DBYT " +
    "WARD EROF ESWI NYOU NTIN RATH",
  "OFAN NOTT TWAR TEDT INGB ASTO MAGE EXPE GIVE ONOT RODU ODUC CLUD ENTT SWOR ENTO NDAR SFRO TETH KNOW " +
    "AGES VLAN PROD EATE SONE INAT HESI TAKE AUTH UPON IMES ASON DIRE ADDR CIDE YING HITE NDAN ANYT ONIS " +
    "NONE ONDI ARTO TILL NDSO STRA LEAN LOOK GAIN HEST NEOF MPLE VETH MALL IFIE ONAL PERF NCLU DDRE FOUR " +
    "CORR POSE TWHI CEOF STRE MUST ONTA LICA OTHA OUTA NFOR SCRI NGIT HINE TWIT DONO YOUW ICES RESO WHIT " +
    "TICE TART TOCO TERF ONVE AGAI RYTH BUTI ONIT VIDE ESSA TSAN EDIA ESIT REAN TREA NTTH INAL ARES ISTI " +
    "STOP HISI NDNO EPOR FTWA EDAT ECOR OREA PECT ANYO CONV HARD SENT INGR USED ACKE HEFO INGP AMES HEMI " +
    "OUTE NETH PATH EASO UPPO TTIN ERVI ELIB RTOF HARE IMAG TOMA RDER GHTH TIFI GETH ASSE DIFI MACH INED " +
    "ONSE CIRC ESEN ONEO INCI ITTH EIGH SURE OUTT AMET MAIN VERE CTOR ISSI TCHE NTLY ENSI ASIN NGON BUIL " +
    "CEPT NSOF EGRE PROC VERI DCON NDWH PERI EWHE ERFO ONTO RULE STIL YCON NNIN RONG MORY ITAN YONE SSIN " +
    "HESP ERWI ISIN SHAR LLER ITIN HEPO ERSE ECTO MOVE PERM ACHE ORIN REDI IDES RACK CCES HEOT FLEC PAGE " +
    "NYTH REMO ERCO BODY TORA ENDE URED URES NTAI REES ILES EPRI OTTH ENDS INGC SITS ECHA ERTO FULL ATUR " +
    "THIR ESST HENA ATAL CERT ECIF ITTE UEST ERRO BOVE NDON TCON FALL REIN EMAN HENE DYOU OUCA ESAR ISTO " +
    "NSAN BJEC ABOV ORKI INDI HESU GREA PPLE DOWN NCEO ESHA EEDS RROR ORDI RIES TATE NTOF THAS NGES ERFA " +
    "BUTE ETRA AINT STOF NATI VENT RITY PERA ORES CTIV ERYT EFIL VING NINT WOUL NCES SMAL ASSI OLLE LATI " +
    "BASE ANAG",
  "INGD HERS UARE HELE INIT DERS BILI SPRO MISS PACK ESCR NTOT LLBE UTOF CROS SEST SSTH URAT BLUE BLES " +
    "HOLD ISIS STER CIFI INAN ONIN STOT TEVE TNOT SOWN TERO ERPR ESWH RDIN KEEP PING EMAC BLIC ONCE EDWI " +
    "FIRM EPER IONW EWHO HATW ROCE USES PROB TIES RESP RANT DROP UCAN ELIG ROMA EMOD TEDI NDLE ULAR TONE " +
    "ROUN ICHT ERRE ROVI INCH CARD TEDB HATM RTHI ANDY USER LLIN GHTS ACON REEN HEDO PPOR RENO SPAR CORD " +
    "MANA QUIR SEAN EAST NTAN ROSS SPER HEWH NSWE ONET QUAL ONDS MUCH EISN LIEN BOOT HEON NDIS BLET SIBL " +
    "LOWE MEAS ELLO THEK ITSE NTRA EOUT INDO NAGE OTIC NSID ANSW DATE CLIE SINC ERVA EQUA TFRO UNDA ATYO " +
    "DSTH ETIM SEIT WHOL HIST MATT ENTR TINC SONT EISA EINS UNTI AFFI ESTR TSTO ACTU ERNA EDOC RSAN RTIC " +
    "ANNE POSI ERYO LISH BLOC WING GTHA GURE OFIT SETT RISE OSIT NDST ENDI OSET EPRE HEME OMPO DESC NCID " +
    "MINA ADTH SWHA ENDO PLES PARE MATI IOUS RSTH IONF RCON IEST EUSE OPTI HIRD PAPE NOTB DONE TSIN YTHA " +
    "CTIN RENC ETTH IATE UTIO ALLI ETOT CAND EWAL PERC INGM TDOE IVER UIRE EASU STEA BLEM OCES OWIN ESON " +
    "CEAN ACTE LTER OBJE PROT NTOA HALL ELLS REPO ORCO TRAC DIES THOR ATEL RALL ALLS HEHO ESYO CABL DISC " +
    "SHOU PLAN DETH LYAN NTIT EAPP HATY DELL ITHI ANGI HALF ECOP RKIN FECT TOAN GING OUTI CHAR ROFT ASUR " +
    "SPAC CTUA SEPA YOUH FIRE RSTO ESIG WALL YOFT TOFA NALL CREA BECO TELY UCHA XACT ARRA OSTS RREC HERO " +
    "FIED FOUN ORMO YOUT EXAC IESA RAGE DUCE KAND ISHE RTSO NGIS RYOU HEOR XPER ESET SOFA ULTI ARDW NTED " +
    "SELF ERMS EIST HETE KTHE GEME RSOF DVER ROPO REDA OVID HERW OPEN FORC ROLL COST SAYS ARER IESO NITI " +
    "TTHI TEAD ATEN HOUL ECTS POLI EASE ARAT RTIF SONA LEAR STRU REYO RAFF RSTA NITS NCEI RTIO NOTS EDFO " +
    "ULES TRAF EDIT ITYO OUMA CULA LESO NTRI UTHE EMOS REPL LOSE YRIG DFRO WATE ISAN OWTH NGSO HEEX ERIM " +
    "NDED OLLO FINE EALL EREC LIVE ININ CONC FORI ISTS NCET EOFA REVE ATEA TISN OUHA SCOM NDOW VIOL CEIV " +
    "PLIE YTES ECUR ISMA OLET WHIL",
  "GHTO RMIN SSOF RWIT HESO NSTE OMPA IONB RERE FITS NWHI EANO TCOM ALRE RECE TEXT LOCA BSER DERI HANA " +
    "SCAN TPRO ATIT FTHA ESCO HECA REOF NEAR ANDH RANY TREF EADI SEOF NATE DTHI STHI LERA FOLL AINE DWAR " +
    "NDYO FORW DESI OFCO AYBE AREF SEND HEAP KERN ACCO HATP RUNN ESOU ACES UTIN GINA HEWO RVIC AILU DISK " +
    "ODEL NDAT USEI ERMA ERWH ESPO LARG HECL RMAN DEVE RNEL SABO NTHI ISAL COPI EDGE KETH NENT UHAV ILUR " +
    "LURE ARTH QUES EFIN ETUR WAYS SEQU TTLE RMAT OUAR EXCE VATI ODIE OMES SUAL METE AGEM HEAD OPYR ESUN " +
    "AKIN ETTI VEST UNIT WANT BODI TCAN TWHE ACTL ERCE TESA REDT MITT QUEN CHAS HATH ALIN SEDO EADO NTAT " +
    "ATIV TWAS MANY ORIT UMAY GATE LEOF REWA YELL GHTT HELA OAND PAND ERGE SENS EDCO PACE SOLV VALU PYRI " +
    "ALLA ICHA ICUL NCEA PONT HAPP ANST EIVE NDOR ISTE TSOW UTER YFOR ELEA RPRO BREA TELL SINE EBYT DPAR " +
    "GHTA ECEI ECOD NTIC HEYA ESOR DOFT EFUL EXPL ALON ONWH ETHR STHR OLVE CHED ANSM WORD UTES NTEN IMPL " +
    "ESOL ERAC LYIN ISRE HATD CLES WHET ALCO ERON DRAC NODE RDWA MAYB NCON EINC LESA SESS ILLB TERE TRIC " +
    "GURA UILD ARRI ONAS LEXI SORT TCHA RNAL OCKE WRON OBSE TIAL WIND DERA ECOV UTHO SHAL NDBY UNNI EARS " +
    "INEA NOTE USUA AYSA EDEF INET ENTW AREC ROBL TORY ADIN USIN ESFO OMMO SESA WORT ORAG HEGL MING EADT " +
    "NINC TITI REME GROU HEAT DULE FRAN DENC ECTL LUDE ESHO ESYS AREI NDWI VARI WTHE HILE USEA SIZE TECT " +
    "HEBO TRAT AGRE ASED IMEN BLIS LEST LENT LUST NGWI ONTI IOLE HONE LAST DWHI TYOF SINA RIPT ATIC ROMI " +
    "FLEX LLED INGU RALP ISON ALIT NSMI RETU IDRA ATHA DONT NOTR NDOF NTSA EATT PTHE NPRO HISW DISA YARE " +
    "OFIN ONEI PPLY PLAT NSIT OBLE MATC OFLI IONM NGIB EDIF EGLA ISAB ATET RUNS EFOU SAPP EPAP OLIC MMON " +
    "LANE HATO TEAN EMEA DEDT FORS NSEA HEDA PROM INER HATR REPR HATE HECH YWHE NSIN YREF NEST NTST CLEA " +
    "DTOT ELSE ERIT RWHI APRO RIME SBUT THNO ONON XIST ASTR HELO ITST DWOR PERS ITES LENG ANGL BAND URIN " +
    "IONP ENUM RPRI EITI EXTE TISW GETS IONC HENI CRIP EROR RWAR BLEA EPEN IVED NABL SECU TOFI LEIN HAST " +
    "EMBE TTEN DINA LITT ORTE ESBE OURT OGET BUTT FIND NDSE TORI TSEL SETO FAST ANTI NWIT OSTA MULT OMPL " +
    "STOA EDFR HATL NANY PERP INDE ATCO ACKA YWIT ASEC INSI IGNA EABO FTHO RDIS NOTC CARR EDUN ISAS RONT " +
    "CKTH MWAR",
  "OTBE AVES TORS OPOR CPRO HISA ATOR HANI TAPP ITOR ENET HEFR LYRE REMA ETAN ASSW REIT VESA NGCO ATTA " +
    "ENTC RRAN TARE EDSO BEEN HEWA TERP BUTO OPLE RNET ITHN IREW TOGE OREI CKIN BERS AYST ITTL EEVE HEKE " +
    "PRIN IDER ITDO SPON DEGR IDTH TTRA OSED OSTO RAME ATMA ALTH NDTO DEFI ATAN ASTA HEFA ESIS EDES TANT " +
    "OSES EREB ASTE ECTR OUTP OUSE CORE OFRE RESI PERT AVET SIVE MINU OTAL REDE EDEN PPEN HETW SDIS LETO " +
    "HEUS CECO FRAM YINT UNDT UMIN ARLY PEOP EOPL YOUD LOWI RITI SREA STOB NDSA DUND AVER LECO LVER AILS " +
    "ITLE NGAS ASNO ITAT INTS IDED HETR OTIN AROU STWO GWIT USTE ALPU NTIL IRCU ERME TANY ORTO DEST OURA " +
    "VISI ANDG ERUN NGWH OTRE DEPE ORIG LETE EROU DWHE INGN YOUS IGIN COMB ORKA TRUN CLIC LAIM EONL YWHI " +
    "IONE ANSP SSAN CEIS RARE SERI DSAN RGET OCON ORSE IGNE NGRE STBE DIAT GFOR REDW ONEN RIGI CLAI EYAR " +
    "OURE HEAN LNOT SEAR THIC LIES ABIL URRE EREP METI SOUT XION OMAI EANY SLOW SACO ACRO ANSA LINU INUX " +
    "TEND FANY RSIN OPIE ONOR TBEC GINT WAND PPED ITIE NSEI LICL GYOU SLOT LEAV IOND AINI BERE ENGT EXIO " +
    "ALLB GEST EESO ONGE RECI YOUN ALUE MBIN IRMW MACP TITL ERSU CESA BLEI ENAN ANDV HINT HEHA URNS EXIS " +
    "ICLI ACPR NTTO OMEO HENC WHOS EINA SSER MATE ENIN MOUN MMAN OMAT SATT STEN TONT RNIN DEDI NSTR LAIN " +
    "SINS ERPE EDAS ELEN RTIN INCO SITE",
];
export const BIGRAM_TENTHS: number[] = [
  /* A */ 37, 26, 22, 25, 42, 29, 27, 35, 26, 43, 30, 22, 26, 18, 40, 26, 41, 21, 22, 19, 29, 29, 32, 38, 27, 43,
  /* B */ 30, 41, 41, 43, 24, 46, 43, 46, 31, 37, 54, 26, 43, 43, 27, 40, 55, 31, 34, 40, 28, 45, 46, 53, 27, 65,
  /* C */ 24, 42, 32, 41, 23, 40, 44, 23, 28, 54, 27, 28, 41, 44, 21, 34, 47, 30, 35, 24, 30, 48, 41, 56, 35, 62,
  /* D */ 25, 29, 31, 29, 22, 31, 34, 34, 22, 44, 41, 31, 32, 32, 25, 31, 44, 28, 26, 25, 30, 35, 29, 48, 33, 48,
  /* E */ 20, 27, 21, 20, 24, 23, 29, 30, 23, 41, 35, 23, 24, 20, 25, 24, 32, 17, 18, 21, 32, 26, 26, 27, 29, 43,
  /* F */ 26, 39, 34, 39, 29, 29, 40, 41, 24, 53, 50, 31, 38, 41, 24, 38, 49, 26, 33, 24, 32, 42, 37, 55, 33, 52,
  /* G */ 27, 34, 36, 37, 25, 35, 36, 27, 28, 52, 47, 31, 35, 32, 30, 34, 49, 28, 30, 28, 31, 42, 35, 53, 38, 51,
  /* H */ 21, 36, 35, 36, 16, 37, 41, 39, 22, 49, 43, 37, 35, 36, 25, 35, 48, 30, 34, 26, 35, 42, 36, 53, 34, 45,
  /* I */ 30, 29, 22, 26, 27, 26, 26, 40, 39, 52, 35, 25, 27, 18, 23, 30, 39, 26, 20, 20, 37, 27, 42, 33, 56, 35,
  /* J */ 43, 59, 62, 55, 36, 62, 65, 65, 50, 65, 56, 65, 65, 65, 39, 44, 65, 55, 51, 55, 38, 56, 65, 62, 62, 65,
  /* K */ 34, 39, 39, 41, 27, 39, 44, 44, 31, 55, 50, 37, 41, 34, 38, 40, 52, 41, 30, 34, 38, 46, 38, 58, 43, 65,
  /* L */ 24, 34, 34, 29, 21, 33, 40, 39, 22, 53, 39, 23, 35, 36, 24, 33, 47, 35, 28, 28, 29, 35, 35, 46, 25, 52,
  /* M */ 23, 31, 38, 38, 22, 39, 43, 43, 26, 55, 49, 40, 32, 39, 25, 29, 51, 40, 31, 30, 31, 46, 35, 51, 37, 49,
  /* N */ 24, 32, 25, 19, 22, 29, 21, 36, 25, 44, 33, 30, 32, 29, 22, 32, 44, 33, 22, 20, 30, 33, 32, 43, 29, 45,
  /* O */ 28, 29, 28, 27, 31, 22, 30, 37, 30, 43, 33, 25, 24, 19, 28, 26, 48, 19, 25, 22, 21, 28, 25, 37, 37, 45,
  /* P */ 25, 41, 37, 36, 24, 38, 40, 34, 30, 52, 47, 26, 39, 43, 25, 28, 48, 25, 31, 29, 30, 40, 39, 45, 34, 59,
  /* Q */ 49, 53, 51, 52, 53, 52, 58, 62, 53, 65, 58, 52, 58, 52, 50, 59, 62, 47, 47, 48, 29, 62, 58, 65, 62, 65,
  /* R */ 21, 32, 28, 27, 18, 30, 32, 35, 22, 47, 29, 32, 27, 29, 22, 30, 46, 28, 24, 23, 29, 29, 31, 44, 26, 49,
  /* S */ 22, 29, 27, 30, 20, 29, 35, 27, 22, 44, 33, 29, 28, 28, 22, 26, 39, 31, 23, 19, 26, 37, 26, 42, 30, 46,
  /* T */ 22, 30, 27, 31, 20, 30, 35, 15, 19, 43, 40, 28, 31, 32, 21, 30, 42, 24, 23, 23, 28, 37, 26, 44, 28, 47,
  /* U */ 29, 31, 29, 32, 30, 37, 31, 38, 30, 51, 45, 27, 28, 25, 37, 28, 55, 24, 25, 24, 43, 50, 37, 40, 41, 56,
  /* V */ 30, 51, 45, 49, 22, 47, 54, 50, 28, 65, 65, 36, 38, 50, 37, 46, 58, 50, 44, 43, 47, 62, 49, 46, 49, 65,
  /* W */ 26, 43, 41, 41, 28, 42, 44, 24, 24, 55, 51, 39, 40, 32, 26, 42, 58, 32, 33, 35, 47, 45, 39, 54, 44, 62,
  /* X */ 35, 45, 36, 40, 36, 44, 47, 41, 33, 56, 54, 44, 41, 48, 43, 33, 55, 45, 40, 33, 48, 47, 44, 47, 43, 65,
  /* Y */ 28, 32, 32, 33, 31, 33, 38, 36, 30, 47, 43, 35, 33, 34, 24, 32, 47, 32, 27, 27, 38, 40, 32, 51, 40, 45,
  /* Z */ 41, 53, 54, 54, 35, 42, 58, 56, 43, 65, 65, 55, 55, 65, 41, 56, 65, 55, 51, 53, 50, 58, 55, 65, 48, 58,
];
const QUAD_STEP = 0.1;
export const QUAD_FLOOR = QUAD_TOP - QUAD_STEP * (QUAD_BUCKETS.length - 1) - 1;
const NOT_LISTED = 255;

let quadIndex: Uint8Array | null = null;
let quadLp: Float64Array | null = null;
let bigramLp: Float64Array | null = null;

/** Builds the 26^4 lookup on first use, so the page costs nothing until scored. */
function tables(): { quad: Uint8Array; lp: Float64Array; bi: Float64Array } {
  if (!quadIndex || !quadLp || !bigramLp) {
    const quad = new Uint8Array(26 * 26 * 26 * 26).fill(NOT_LISTED);
    QUAD_BUCKETS.forEach((bucket, k) => {
      for (const gram of bucket.split(" ")) {
        if (gram.length !== 4) continue;
        let idx = 0;
        for (let j = 0; j < 4; j += 1) idx = idx * 26 + (gram.charCodeAt(j) - 65);
        quad[idx] = k;
      }
    });
    const lp = new Float64Array(256).fill(QUAD_FLOOR);
    for (let k = 0; k < QUAD_BUCKETS.length; k += 1) lp[k] = QUAD_TOP - QUAD_STEP * k;
    const bi = new Float64Array(676);
    for (let i = 0; i < 676; i += 1) bi[i] = -BIGRAM_TENTHS[i] / 10;
    quadIndex = quad;
    quadLp = lp;
    bigramLp = bi;
  }
  return { quad: quadIndex, lp: quadLp, bi: bigramLp };
}

/** A to Z as 0 to 25, case folded; anything else as -1. ASCII only, on purpose. */
export function letterCode(ch: string): number {
  if (ch.length !== 1) return -1;
  const c = ch.charCodeAt(0);
  if (c >= 65 && c <= 90) return c - 65;
  if (c >= 97 && c <= 122) return c - 97;
  return -1;
}

/**
 * Sum of log10 probabilities over a sequence of letter codes, read through
 * an index map. Codes of -1 (spaces, digits, punctuation) are skipped, so
 * n-grams join across them.
 */
function scoreCodes(codes: Int16Array, order: Int32Array | null, length: number): { total: number; letters: number } {
  const { quad, lp, bi } = tables();
  let total = 0;
  let letters = 0;
  let q = 0;
  let prev = -1;
  for (let i = 0; i < length; i += 1) {
    const c = codes[order ? order[i] : i];
    if (c < 0) continue;
    if (prev >= 0) total += bi[prev * 26 + c];
    q = (q % 17576) * 26 + c;
    letters += 1;
    if (letters >= 4) total += lp[quad[q]];
    prev = c;
  }
  return { total, letters };
}

export interface Fitness {
  /** Sum of every bigram and quadgram log10 probability. */
  total: number;
  /** Total divided by the number of letters, comparable across lengths. */
  perLetter: number;
  letters: number;
}

export function englishFitness(text: string): Fitness {
  const chars = Array.from(text);
  const codes = new Int16Array(chars.length);
  for (let i = 0; i < chars.length; i += 1) codes[i] = letterCode(chars[i]);
  const { total, letters } = scoreCodes(codes, null, chars.length);
  return { total, perLetter: letters ? total / letters : 0, letters };
}

/* ------------------------------------------------------------ brute force */

export interface Candidate {
  rails: number;
  offset: number;
  /** Fitness per letter. Higher is more English-like. */
  fitness: number;
  /** The full decryption, with spaces and punctuation restored per the mode. */
  text: string;
}

export type BruteOutcome =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      candidates: Candidate[];
      /** Keys tried. */
      tried: number;
      /** Highest rail count tried. */
      railsTo: number;
      /** Highest rail count the length allows: n - 1. */
      railsLimit: number;
      /** True when the work budget stopped the search before railsLimit. */
      capped: boolean;
      offsets: boolean;
      length: number;
      notices: string[];
    };

interface Ranked {
  rails: number;
  offset: number;
  total: number;
  stream: string;
  src: Int32Array;
}

/**
 * Tries rails 2 to n - 1, and every offset when asked, scoring each
 * decryption. Keys are visited in increasing rails then offset, and a later
 * key only displaces an earlier one with a strictly better score, so ties
 * go to the simpler key. Identical decryptions from different keys appear
 * once, under the first key that produced them.
 */
export function bruteForce(textRaw: string, options: { mode: Mode; offsets: boolean }): BruteOutcome {
  const { mode, offsets } = options;
  if (textRaw.trim() === "") return { kind: "empty" };
  const notices: string[] = [];
  let text = textRaw;
  if (mode === "all") {
    const t = trimTrailingBreaks(text);
    text = t.text;
    if (t.trimmed) notices.push("A trailing line break was ignored.");
  }
  const split = splitText(text, mode);
  const n = split.stream.length;
  if (n > BRUTE_MAX_CHARS) {
    return {
      kind: "error",
      message: `The brute force accepts up to ${BRUTE_MAX_CHARS.toLocaleString("en-US")} characters on the fence, and this has ${n.toLocaleString("en-US")}. It cannot work on a slice, because the rail boundaries depend on the full length.`,
    };
  }
  const codes = new Int16Array(n);
  let letters = 0;
  for (let i = 0; i < n; i += 1) {
    codes[i] = letterCode(split.stream[i]);
    if (codes[i] >= 0) letters += 1;
  }
  if (n < 3) {
    return { kind: "error", message: "With fewer than 3 characters there is no rail count between 2 and n - 1 to try." };
  }
  if (letters < MIN_SCORED_LETTERS) {
    return {
      kind: "error",
      message: `The score reads English letter order, so it needs at least ${MIN_SCORED_LETTERS} letters A to Z. This has ${letters}.`,
    };
  }

  const railsLimit = n - 1;
  const top: Ranked[] = [];
  let tried = 0;
  let work = 0;
  let railsTo = 1;
  let capped = false;

  for (let rails = 2; rails <= railsLimit; rails += 1) {
    const keys = offsets ? cycleLength(rails) : 1;
    if (rails > 2 && work + keys * n > BRUTE_WORK_BUDGET) {
      capped = true;
      break;
    }
    for (let offset = 0; offset < keys; offset += 1) {
      const src = decryptSources(n, rails, offset);
      const { total } = scoreCodes(codes, src, n);
      tried += 1;
      work += n;
      if (top.length === BRUTE_TOP && total <= top[top.length - 1].total) continue;
      let stream = "";
      for (let i = 0; i < n; i += 1) stream += split.stream[src[i]];
      if (top.some((t) => t.total === total && t.stream === stream)) continue;
      let at = top.length;
      while (at > 0 && top[at - 1].total < total) at -= 1;
      top.splice(at, 0, { rails, offset, total, stream, src });
      if (top.length > BRUTE_TOP) top.pop();
    }
    railsTo = rails;
  }

  if (capped) {
    notices.push(
      `Stopped after ${railsTo} rails: the search is capped at ${BRUTE_WORK_BUDGET.toLocaleString("en-US")} character placements, and the full range runs to ${railsLimit}. Rail counts that high are rare in practice.`,
    );
  }

  const candidates = top.map((t) => {
    const out = new Array<string>(n);
    for (let i = 0; i < n; i += 1) out[i] = split.stream[t.src[i]];
    return { rails: t.rails, offset: t.offset, fitness: t.total / letters, text: split.rebuild(out) };
  });

  return { kind: "ok", candidates, tried, railsTo, railsLimit, capped, offsets, length: n, notices };
}
