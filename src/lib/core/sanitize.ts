// sanitize.ts — ตัด HTML ที่ผู้ใช้พิมพ์เองให้เหลือเฉพาะแท็กที่ปลอดภัย (allowlist)
//
// 🔴 ไฟล์นี้อยู่ที่ `core` เพราะมีผู้เรียกมากกว่าหนึ่งโมดูลแล้ว (M1.7: เนื้อความ "นโยบายความเป็น
//    ส่วนตัว" ของระบบสมาชิก) — โมดูลห้าม import ข้ามกัน (fitness F2) ⇒ ของกลางต้องอยู่ core
//    ต้นแบบ = `src/lib/modules/kanban/sanitize.ts#sanitizeDescription` (K1.6 · D12) ซึ่งยังใช้ของ
//    ตัวเองอยู่ (บอร์ดงานมี markdown-lite พ่วง) — รวมสองที่เป็นตัวเดียวเป็นงานเก็บกวาดใบแยก
//    (บันทึกเป็นหนี้ไว้ใน ledger/wo-notes/member-M1.7.md)
// 🔴 ไฟล์นี้ **บริสุทธิ์**: ไม่แตะ prisma/next/env — เรียกได้จากทั้ง server, client และสคริปต์
// 🔴 ไม่มี DOM parser/ไลบรารีนอก (D12 "ไม่เพิ่ม dependency") — ตัวสแกนเชิงเส้นของเราเอง `core/html-allowlist.ts`
// 🔴 HOTFIX 2026-10-01: เดิมเป็น regex `replace` บนข้อความดิบ ⇒ `<svg/onload=…>` (ตัวคั่น `/`) และ `<x-y on…>` หลุดผ่าน +
//    `<a`+ช่องว่างยาว ๆ ใช้เวลา ~n³ — ตอนนี้ "ปฏิเสธเป็นค่าเริ่มต้น": ผลลัพธ์ประกอบจาก token ใหม่ทั้งหมด `<` ที่ไม่ใช่แท็ก
//    ใน allowlist กลายเป็น `&lt;` (ledger/wo-notes/hotfix-sanitize-2026-10-01.md)
//
// กติกา: แท็กใน allowlist เก็บไว้ (ตัด attribute ทิ้งทั้งหมด ยกเว้น href ของ <a> ที่เป็น http/https)
//   · script/style/iframe/object/embed/noscript → ตัดทั้งก้อนรวมเนื้อหาข้างใน (ไม่ใช่ข้อความที่คนตั้งใจอ่าน)
//   · แท็กอื่นที่ไม่รู้จัก → "ปลด" แท็กออกแต่คงข้อความข้างในไว้

import { attrOf, escapeAttr, parseAttrs, sanitizeWithPolicy, type HtmlAttr } from "./html-allowlist";

/** แท็กที่ต้องตัดทิ้งทั้งก้อน (รวมเนื้อหาข้างใน) */
const STRIP_WITH_CONTENT = ["script", "style", "iframe", "object", "embed", "noscript"] as const;

/**
 * แท็กที่อนุญาตในเนื้อความยาว (เอกสารนโยบาย/คำอธิบาย)
 * กว้างกว่ารายละเอียดการ์ดบอร์ดงานเล็กน้อย: มี `h3` และ `blockquote` เพราะนโยบาย PDPA จริง
 * มักมีหัวข้อย่อยสามชั้นและย่อหน้าอ้างกฎหมาย
 */
const ALLOWLIST = new Set([
  "p", "br", "hr", "h1", "h2", "h3", "ul", "ol", "li", "strong", "b", "em", "i", "s", "u", "code", "pre", "blockquote", "a",
]);

const STRIP = new Set<string>(STRIP_WITH_CONTENT);
/** แท็กเปิด/ปิดรูปมาตรฐาน (สร้างครั้งเดียว — ข้อความที่มีแท็กเป็นแสนตัวไม่ต้องสร้างสตริงใหม่ทุกตัว) */
const OPEN = new Map([...ALLOWLIST].map((t) => [t, `<${t}>`] as const));
const CLOSE = new Map([...ALLOWLIST].map((t) => [t, `</${t}>`] as const));

/**
 * ค่า attribute (ถอดรหัสครั้งเดียวแล้ว) · ไม่มี/quote ไม่ปิด = ""
 * CRM C5.5-fix4 ▸ C5.4-E E1/SF-4 (ถอดรหัส entity ครั้งเดียว + escapeAttr ครบ & " < > ') ย้ายไปอยู่ใน `html-allowlist`
 *   (`parseAttrs` → `decodeAttr` · `escapeAttr`) — ชุด entity เดียวกัน ⇒ ตัดซ้ำกี่รอบก็ได้ผลเดิม ◂
 */
function attrValue(attrs: readonly HtmlAttr[], name: string): string {
  return attrOf(attrs, name)?.value ?? "";
}

/** width/height ของ `<img>`: มี quote = ต้องเป็นตัวเลข 1-5 หลักทั้งค่า · ไม่มี quote = ตัวเลขนำหน้า 1-5 หลัก (เหมือนของเดิม) */
function numAttr(attrs: readonly HtmlAttr[], name: string): string {
  const a = attrOf(attrs, name);
  if (!a || a.value === null) return "";
  const m = a.quoted ? /^\d{1,5}$/.exec(a.value) : /^\d{1,5}/.exec(a.value);
  return m ? m[0] : "";
}

/**
 * CRM C2.5 ▸ href นี้อยู่ใน scheme ที่อนุญาตไหม
 * 🔴 เทียบ scheme แบบ "ตรงตัวก่อน `:`" — ไม่ใช่ `startsWith`: `javascripT:` ที่มีอักขระควบคุมคั่น
 *    (`java\0script:`) ผ่าน startsWith ไม่ได้ แต่เบราว์เซอร์บางตัวยังเปิดให้ ⇒ ตัดอักขระควบคุม/ช่องว่างก่อน ◂
 */
function linkSchemeOk(hrefRaw: string, schemes: readonly string[]): boolean {
  const href = hrefRaw.replace(/[\u0000- ]+/g, "");
  const m = href.match(/^([A-Za-z][A-Za-z0-9+.-]*):/);
  if (!m) return false; // ลิงก์สัมพัทธ์ไม่มีความหมายในเนื้อความที่ส่งออกไปนอกระบบ
  const scheme = (m[1] ?? "").toLowerCase();
  if (!schemes.includes(scheme)) return false;
  if (scheme === "http" || scheme === "https") return /^https?:\/\/[^/\\]/i.test(href);
  return href.length > scheme.length + 1;
}

/**
 * CRM C2.5 ▸ ตัวเลือกของตัวตัด — **ไม่ส่ง = พฤติกรรมเดิมทุกไบต์** (ข้อสอบ `C2.5-S9.10` เทียบผลของ
 * ค่าปริยายกับผลก่อน C2.5 แบบตัวต่อตัว: ผู้เรียกเดิมทุกราย — หน้านโยบายของสมาชิก · รายละเอียดอื่น —
 * ต้องได้ผลเดิม) · `allowImages` เปิดเฉพาะ "อีเมลขาเข้า" ซึ่งต้องเก็บรูปในจดหมายไว้ให้พนักงานกดดูเอง
 * 🔴 เปิดรูป **ไม่ได้** แปลว่าปล่อย attribute อื่น: `onerror`/`onload` ถูกตัดเสมอ และ `src` ต้องเป็น
 *    http(s) เท่านั้น (`javascript:`/`data:` = ปลดแท็กทิ้ง) ◂
 */
export type SanitizeOptions = {
  allowImages?: boolean;
  /**
   * CRM C2.5 ▸ scheme ของ `<a href>` ที่ยอมให้ผ่าน — **ไม่ส่ง = `http`/`https` เท่านั้น (ของเดิม)**
   * จดหมายธุรกิจจริงมี `mailto:` และ `tel:` เป็นปกติ (ลายเซ็นท้ายจดหมาย) ⇒ ตัวเขียนจดหมายของ CRM ส่ง
   * `["http","https","mailto","tel"]` · `javascript:`/`data:` ไม่มีทางอยู่ในรายการนี้ได้ ◂
   */
  allowLinkSchemes?: readonly string[];
};

const DEFAULT_LINK_SCHEMES = ["http", "https"] as const;

/**
 * ตัด HTML ให้เหลือเฉพาะ allowlist
 * @param dirty HTML ดิบจากผู้ใช้ · `null`/`undefined`/ว่าง → คืนสตริงว่าง
 */
export function sanitizeHtml(dirty: string | null | undefined, opts?: SanitizeOptions): string {
  if (!dirty) return "";
  const allowImages = opts?.allowImages === true;
  const schemes = (opts?.allowLinkSchemes ?? DEFAULT_LINK_SCHEMES).map((s) => String(s).toLowerCase());
  // ตัวสแกนเชิงเส้น: script/style/iframe/object/embed/noscript ตัดทั้งก้อน (เปิดไม่ปิด = ตัดถึงท้าย) · แท็กใน allowlist เขียนใหม่
  // ให้เหลือ attribute ที่อนุญาต · แท็กอื่นทั้งหมด (รวม img เมื่อไม่ได้เปิดรูป) ปลดทิ้งแต่คงข้อความ · comment ทิ้ง · `<` อื่น → `&lt;`
  const out = sanitizeWithPolicy(String(dirty), {
    stripWithContent: STRIP,
    unclosedStripDropsRest: true,
    rewrite: (tag, isClosing, rawAttrs) => {
      if (allowImages && tag === "img") {
        if (isClosing) return "";
        const attrs = parseAttrs(rawAttrs);
        const src = attrValue(attrs, "src");
        if (!/^https?:\/\//i.test(src)) return "";
        const alt = attrValue(attrs, "alt");
        const w = numAttr(attrs, "width");
        const h = numAttr(attrs, "height");
        return `<img src="${escapeAttr(src)}"${alt ? ` alt="${escapeAttr(alt)}"` : ""}${w ? ` width="${w}"` : ""}${h ? ` height="${h}"` : ""}>`;
      }
      if (!ALLOWLIST.has(tag)) return "";
      if (isClosing) return CLOSE.get(tag) ?? "";
      if (tag === "br") return "<br>";
      if (tag === "hr") return "<hr>";
      if (tag === "a") {
        const href = attrValue(parseAttrs(rawAttrs), "href");
        if (!linkSchemeOk(href, schemes)) return ""; // javascript: / data: ฯลฯ — ปลดแท็กทิ้ง
        return `<a href="${escapeAttr(href)}" rel="noopener" target="_blank">`;
      }
      return OPEN.get(tag) ?? "";
    },
  });

  return out.trim();
}

/** ตัดแท็กทั้งหมดเหลือข้อความล้วน (ใช้ทำตัวอย่างย่อ/หัวข้อในรายการ) */
export function htmlToText(dirty: string | null | undefined): string {
  if (!dirty) return "";
  return sanitizeHtml(dirty)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}
