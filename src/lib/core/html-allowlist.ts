// html-allowlist.ts — ตัวสแกน HTML แบบ "ปฏิเสธเป็นค่าเริ่มต้น" (default-deny) ที่ตัวตัด HTML ทั้งสองตัวใช้ร่วมกัน
//   ผู้ใช้: `core/sanitize.ts#sanitizeHtml` (นโยบายสมาชิก · อีเมล CRM) และ `modules/kanban/sanitize.ts#sanitizeDescription`
//
// 🔴 HOTFIX 2026-10-01 (ledger/wo-notes/hotfix-sanitize-2026-10-01.md) — ของเดิมเป็น regex `replace` บนข้อความดิบ:
//    (1) รู้จักแค่ "ช่องว่าง" เป็นตัวคั่น attribute ⇒ `<svg/onload=…>` `<details/open/ontoggle=…>` `<a/href=javascript:…>`
//        และชื่อแท็กที่มี `-`/`:` (`<x-y onclick=…>`) หลุดออกไปทั้งดุ้น (ข้อความนอกแท็กที่ regex จับไม่ได้ = ผ่านเลย)
//    (2) `(\s+[^>]*)?\s*\/?>` ซ้อน quantifier ⇒ `<a` + ช่องว่าง n ตัว ใช้เวลา ~n³ (1,600 ตัว = 1.5 วินาที)
// ⇒ ตัวนี้ **สร้างผลลัพธ์ใหม่จาก token** ไม่ใช่ลบของออกจากข้อความเดิม:
//    · `<` ทุกตัวในผลลัพธ์ = แท็กที่ผู้เรียกเขียนเองจากค่าคงที่ (callback `rewrite`) เท่านั้น
//    · ข้อความระหว่างแท็ก: `<` ที่ไม่ได้เป็นแท็กที่รู้จัก → `&lt;` (เบราว์เซอร์แสดงผลเหมือนเดิม)
//    · comment / `<!…>` / `<?…>` / `</ …>` → ทิ้ง (เบราว์เซอร์ก็ไม่แสดงอยู่แล้ว)
//    · สแกนรอบเดียว ไม่มี regex ที่ backtrack ได้ ⇒ เวลา ~ความยาวข้อความ (1 MB ไม่ถึง 200 ms)
// 🔴 ไฟล์นี้ **บริสุทธิ์**: ไม่แตะ prisma/next/env — เรียกได้ทั้ง server, client และสคริปต์

/** attribute ที่แยกได้จากแท็ก — `value` ถอดรหัส entity แล้ว **ครั้งเดียว** · `null` = เปิด quote แล้วไม่ปิด (ถือว่าใช้ไม่ได้) */
export type HtmlAttr = { name: string; value: string | null; quoted: boolean };

export type AllowlistPolicy = {
  /** แท็กที่ตัดทิ้ง "ทั้งก้อน" รวมเนื้อหาจนถึงแท็กปิดของมัน (ชื่อตัวพิมพ์เล็ก) */
  stripWithContent: ReadonlySet<string>;
  /** แท็กข้างบนที่เปิดแล้วไม่มีแท็กปิด: `true` = ตัดตั้งแต่ตรงนั้นจนจบข้อความ · `false` = ตัดเฉพาะแท็กเปิด (เนื้อหาที่เหลือเป็นข้อความธรรมดา) */
  unclosedStripDropsRest: boolean;
  /**
   * แท็กที่สแกนเจอ (ชื่อตัวพิมพ์เล็ก · `attrs` = ข้อความดิบระหว่างชื่อแท็กกับ `>`) → markup ที่จะเขียนออก หรือ `""` = ทิ้งแท็ก (ข้อความข้างในยังอยู่)
   * 🔴 ค่าที่คืนต้องประกอบจากค่าคงที่ + `escapeAttr(...)` เท่านั้น — ตัวสแกนเขียนค่านี้ออกตรง ๆ
   */
  rewrite: (name: string, closing: boolean, attrs: string) => string;
};

const ATTR_ESC: Record<string, string> = { "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;", "'": "&#39;" };

/**
 * เข้ารหัสค่า attribute ให้อยู่ใน `"…"` ได้ปลอดภัย — & " < > ' ครบ (ตัดซ้ำกี่รอบก็ได้ผลเดิมเมื่อคู่กับ `decodeAttr`)
 * เดินรอบเดียวแทน `replace` 5 รอบ (ค่ายาวมาก ๆ ไม่ช้าลงแบบไม่เป็นเชิงเส้น)
 */
export function escapeAttr(v: string): string {
  let out = "";
  let last = 0;
  for (let i = 0; i < v.length; i++) {
    const e = ATTR_ESC[v[i]!];
    if (e === undefined) continue;
    out += v.slice(last, i) + e;
    last = i + 1;
  }
  return last === 0 ? v : out + v.slice(last);
}

const NAMED: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
const isDigit = (c: number) => c >= 48 && c <= 57;
const isHex = (c: number) => isDigit(c) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);

/**
 * ถอดรหัส entity ในค่า attribute **ครั้งเดียว** — ชุดเดียวกับ regex `&(#x[0-9a-f]{1,6}|#\d{1,7}|amp|quot|apos|lt|gt);`/i
 * (ชุดที่ `escapeAttr` เขียน + ตัวเลข) · ตัวตรวจ scheme จึงเห็นค่าเดียวกับที่เบราว์เซอร์จะเห็นหลังเราเข้ารหัสกลับ ·
 * entity อื่น (`&colon;` ฯลฯ) คงไว้ตามตัวอักษร ⇒ หลังเข้ารหัสกลับ เบราว์เซอร์ก็เห็นตามตัวอักษร · เดินรอบเดียว (indexOf)
 */
export function decodeAttr(v: string): string {
  let amp = v.indexOf("&");
  if (amp < 0) return v;
  let out = "";
  let last = 0;
  while (amp >= 0) {
    let rep: string | null = null;
    let end = -1;
    if (v.charCodeAt(amp + 1) === 35 /* # */) {
      const hex = v.charCodeAt(amp + 2) === 120 || v.charCodeAt(amp + 2) === 88; // x / X
      const ds = amp + (hex ? 3 : 2);
      let k = ds;
      while (k < v.length && k - ds < (hex ? 7 : 8) && (hex ? isHex(v.charCodeAt(k)) : isDigit(v.charCodeAt(k)))) k++;
      const len = k - ds;
      if (len >= 1 && len <= (hex ? 6 : 7) && v.charCodeAt(k) === 59 /* ; */) {
        const code = parseInt(v.slice(ds, k), hex ? 16 : 10);
        end = k + 1;
        rep = Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : v.slice(amp, end);
      }
    } else {
      let semi = -1;
      for (let k = amp + 2; k <= amp + 5 && k < v.length; k++) if (v.charCodeAt(k) === 59) { semi = k; break; } // ชื่อยาวสุด 4 ตัว — ไม่สแกนไกล
      if (semi > 0) {
        const named = NAMED[v.slice(amp + 1, semi).toLowerCase()];
        if (named !== undefined) { rep = named; end = semi + 1; }
      }
    }
    if (rep !== null) {
      out += v.slice(last, amp) + rep;
      last = end;
      amp = v.indexOf("&", end);
    } else amp = v.indexOf("&", amp + 1);
  }
  return out + v.slice(last);
}

/** ช่องว่างแบบเดียวกับ `\s` ของ JS (ของเดิมใช้ `\s` คั่นชื่อแท็ก — คงไว้เพื่อให้ผลเดิมทุกไบต์) */
function isSpace(c: number): boolean {
  return (
    c === 32 || (c >= 9 && c <= 13) || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff
  );
}
function isAlpha(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}
const SLASH = 47;
const EQ = 61;

/**
 * แยก attribute จากข้อความดิบในแท็ก — `/` และช่องว่างเป็นตัวคั่น (แบบเบราว์เซอร์) · ชื่อตัวพิมพ์เล็ก · ชื่อซ้ำ = ตัวแรกชนะ
 * สแกนรอบเดียว (ทุกขั้นเดินหน้า) ⇒ เวลาเชิงเส้น
 */
export function parseAttrs(raw: string): HtmlAttr[] {
  const out: HtmlAttr[] = [];
  const n = raw.length;
  let i = 0;
  while (i < n) {
    let c = raw.charCodeAt(i);
    if (isSpace(c) || c === SLASH) { i++; continue; }
    const ns = i;
    i++; // อักขระแรกของชื่อเป็นอะไรก็ได้ (รวม `=`) ตามสเปก
    while (i < n) {
      c = raw.charCodeAt(i);
      if (isSpace(c) || c === SLASH || c === EQ) break;
      i++;
    }
    const name = raw.slice(ns, i).toLowerCase();
    let j = i;
    while (j < n && isSpace(raw.charCodeAt(j))) j++;
    if (j < n && raw.charCodeAt(j) === EQ) {
      j++;
      while (j < n && isSpace(raw.charCodeAt(j))) j++;
      const q = raw[j];
      if (q === '"' || q === "'") {
        const close = raw.indexOf(q, j + 1);
        if (close < 0) { out.push({ name, value: null, quoted: true }); break; }
        out.push({ name, value: decodeAttr(raw.slice(j + 1, close)), quoted: true });
        i = close + 1;
      } else {
        const vs = j;
        while (j < n && !isSpace(raw.charCodeAt(j))) j++;
        out.push({ name, value: decodeAttr(raw.slice(vs, j)), quoted: false });
        i = j;
      }
    } else {
      out.push({ name, value: "", quoted: false });
    }
  }
  return out;
}

/** attribute ตัวแรกที่ชื่อตรง (`null`/ไม่มี = "") */
export function attrOf(attrs: readonly HtmlAttr[], name: string): HtmlAttr | null {
  for (const a of attrs) if (a.name === name) return a;
  return null;
}

/** `<` ทุกตัวในข้อความ → `&lt;` (ข้อความเท่านั้น — ไม่แตะ `&` ให้ entity เดิมคงอยู่ทุกไบต์) */
function escapeText(s: string): string {
  // split/join แทน replace(/</g): ผลเท่ากัน แต่ replace แบบ global บนข้อความหลายร้อย KB ที่มี `<` นับแสนตัวช้าลงแบบไม่เป็นเชิงเส้นใน V8
  return s.indexOf("<") < 0 ? s : s.split("<").join("&lt;");
}

/**
 * ตัด HTML ตามนโยบาย — สแกนซ้ายไปขวารอบเดียว
 * กติกาหาขอบแท็กเหมือนของเดิม: แท็กจบที่ `>` ตัวแรก (ไม่สนเครื่องหมายคำพูด) ⇒ HTML ปกติได้ผลเดิมทุกไบต์ ·
 * ส่วนที่เหลือหลังแท็กกลายเป็นข้อความ (`<` ถูก escape) จึงไม่มีทางกลายเป็นแท็กในเบราว์เซอร์ไม่ว่าเราอ่านขอบแท็กต่างจากเบราว์เซอร์แค่ไหน
 */
export function sanitizeWithPolicy(input: string, policy: AllowlistPolicy): string {
  const s = input;
  const n = s.length;
  const out: string[] = [];
  let textStart = 0;
  let i = 0;
  const flush = (end: number) => {
    if (end > textStart) out.push(escapeText(s.slice(textStart, end)));
  };
  // แคชตำแหน่งแท็กปิดของแท็กตัดทั้งก้อน (ต่อชื่อ) — แท็กเปิดซ้ำ ๆ ที่ไม่มีคู่ปิดจะไม่สแกนถึงท้ายข้อความซ้ำทุกตัว (กัน O(n²))
  const closerCache = new Map<string, { at: number; end: number }>();
  const findCloser = (name: string, from: number): { at: number; end: number } => {
    const hit = closerCache.get(name);
    if (hit && (hit.at < 0 || hit.at >= from)) return hit;
    let p = from;
    for (;;) {
      const lt = s.indexOf("</", p);
      if (lt < 0) break;
      let k = lt + 2;
      let ok = k + name.length <= n;
      for (let t = 0; ok && t < name.length; t++) {
        let c = s.charCodeAt(k + t);
        if (c >= 65 && c <= 90) c += 32;
        if (c !== name.charCodeAt(t)) ok = false;
      }
      if (ok) {
        k += name.length;
        while (k < n && isSpace(s.charCodeAt(k))) k++;
        if (k < n && s.charCodeAt(k) === 62 /* > */) {
          const r = { at: lt, end: k + 1 };
          closerCache.set(name, r);
          return r;
        }
        p = k; // ช่องว่างที่เพิ่งข้ามไม่ต้องสแกนซ้ำ
      } else p = lt + 2;
    }
    const none = { at: -1, end: -1 };
    closerCache.set(name, none);
    return none;
  };

  // ตำแหน่งถัดไปของคำค้น (จำผลไว้ — `from` เดินหน้าอย่างเดียว ⇒ แต่ละคำสแกนข้อความรวมไม่เกินหนึ่งรอบ)
  const nextCache = new Map<string, number>();
  const nextOf = (needle: string, from: number): number => {
    const hit = nextCache.get(needle);
    if (hit !== undefined && (hit < 0 || hit >= from)) return hit;
    const at = s.indexOf(needle, from);
    nextCache.set(needle, at);
    return at;
  };

  while (i < n) {
    const j = s.indexOf("<", i);
    if (j < 0) break;
    const c1 = j + 1 < n ? s.charCodeAt(j + 1) : -1;
    const closing = c1 === SLASH && j + 2 < n && isAlpha(s.charCodeAt(j + 2));
    if (isAlpha(c1) || closing) {
      const gt = s.indexOf(">", j + 1);
      // ไม่มี `>` เหลือเลย ⇒ จากนี้ไปไม่มีแท็กไหนจบได้ = ข้อความทั้งหมด (escape `<`)
      if (gt < 0) break;
      let k = j + (closing ? 2 : 1);
      const ns = k;
      while (k < gt) {
        const c = s.charCodeAt(k);
        if (isSpace(c) || c === SLASH) break;
        k++;
      }
      const name = s.slice(ns, k).toLowerCase();
      flush(j);
      if (!closing && policy.stripWithContent.has(name)) {
        const cl = findCloser(name, gt + 1);
        if (cl.at >= 0) {
          i = textStart = cl.end;
          continue;
        }
        if (policy.unclosedStripDropsRest) {
          textStart = i = n;
          break;
        }
        i = textStart = gt + 1;
        continue;
      }
      const rep = policy.rewrite(name, closing, s.slice(k, gt));
      if (rep) out.push(rep);
      i = textStart = gt + 1;
      continue;
    }
    if (c1 === 33 /* ! */ || c1 === 63 /* ? */ || c1 === SLASH) {
      // comment · <!DOCTYPE> · <![CDATA[ ]]> · <?xml ?> · </ …> — เบราว์เซอร์ไม่แสดงผล ⇒ ทิ้ง (ไม่มีจุดจบ = ทิ้งถึงท้าย)
      flush(j);
      let end = -1;
      if (c1 === 33 && s.startsWith("<!--", j)) {
        if (s.startsWith(">", j + 4)) end = j + 5;
        else if (s.startsWith("->", j + 4)) end = j + 6;
        else {
          const a = nextOf("-->", j + 4);
          const b = nextOf("--!>", j + 4);
          if (b >= 0 && (a < 0 || b < a)) end = b + 4;
          else if (a >= 0) end = a + 3;
        }
      } else {
        const gt = s.indexOf(">", j + 2);
        if (gt >= 0) end = gt + 1;
      }
      if (end < 0) {
        textStart = i = n;
        break;
      }
      i = textStart = end;
      continue;
    }
    // `<` ที่ไม่ได้เปิดแท็ก (เช่น "x < 5") — เป็นข้อความ (escape ตอน flush)
    i = j + 1;
  }
  flush(n);
  return out.join("");
}
