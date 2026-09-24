// sanitize.ts — ตัด HTML ที่ผู้ใช้พิมพ์เองให้เหลือเฉพาะแท็กที่ปลอดภัย (allowlist)
//
// 🔴 ไฟล์นี้อยู่ที่ `core` เพราะมีผู้เรียกมากกว่าหนึ่งโมดูลแล้ว (M1.7: เนื้อความ "นโยบายความเป็น
//    ส่วนตัว" ของระบบสมาชิก) — โมดูลห้าม import ข้ามกัน (fitness F2) ⇒ ของกลางต้องอยู่ core
//    ต้นแบบ = `src/lib/modules/kanban/sanitize.ts#sanitizeDescription` (K1.6 · D12) ซึ่งยังใช้ของ
//    ตัวเองอยู่ (บอร์ดงานมี markdown-lite พ่วง) — รวมสองที่เป็นตัวเดียวเป็นงานเก็บกวาดใบแยก
//    (บันทึกเป็นหนี้ไว้ใน ledger/wo-notes/member-M1.7.md)
// 🔴 ไฟล์นี้ **บริสุทธิ์**: ไม่แตะ prisma/next/env — เรียกได้จากทั้ง server, client และสคริปต์
// 🔴 ไม่มี DOM parser/ไลบรารีนอก (D12 "ไม่เพิ่ม dependency") — regex ล้วน
//
// กติกา: แท็กใน allowlist เก็บไว้ (ตัด attribute ทิ้งทั้งหมด ยกเว้น href ของ <a> ที่เป็น http/https)
//   · script/style/iframe/object/embed/noscript → ตัดทั้งก้อนรวมเนื้อหาข้างใน (ไม่ใช่ข้อความที่คนตั้งใจอ่าน)
//   · แท็กอื่นที่ไม่รู้จัก → "ปลด" แท็กออกแต่คงข้อความข้างในไว้

/** แท็กที่ต้องตัดทิ้งทั้งก้อน (รวมเนื้อหาข้างใน) */
const STRIP_WITH_CONTENT = ["script", "style", "iframe", "object", "embed", "noscript"] as const;

/** แท็กเดี่ยว (void) ที่อันตราย/ไม่รองรับ — ตัดทั้งแท็กโดยไม่ต้องหาคู่ปิด */
const VOID_DANGEROUS = /<(img|input|source|track|embed|object|iframe|script|style|noscript)\b[^>]*\/?>/gi;
// CRM C2.5 ▸ ชุดเดียวกัน **ลบ img** — ใช้เฉพาะเมื่อผู้เรียกเปิด `allowImages` (อีเมลขาเข้า) ◂
const VOID_DANGEROUS_KEEP_IMG = /<(input|source|track|embed|object|iframe|script|style|noscript)\b[^>]*\/?>/gi;

/**
 * แท็กที่อนุญาตในเนื้อความยาว (เอกสารนโยบาย/คำอธิบาย)
 * กว้างกว่ารายละเอียดการ์ดบอร์ดงานเล็กน้อย: มี `h3` และ `blockquote` เพราะนโยบาย PDPA จริง
 * มักมีหัวข้อย่อยสามชั้นและย่อหน้าอ้างกฎหมาย
 */
const ALLOWLIST = new Set([
  "p", "br", "hr", "h1", "h2", "h3", "ul", "ol", "li", "strong", "b", "em", "i", "s", "u", "code", "pre", "blockquote", "a",
]);

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)(\s+[^>]*)?\s*\/?>/g;
const HREF_RE = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
// CRM C2.5 ▸ attribute ของ <img> ที่อยู่รอดในโหมด `allowImages` — src (http/https) · alt · width · height ◂
const SRC_RE = /src\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const ALT_RE = /alt\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const NUM_ATTR_RE = (name: string) => new RegExp(`${name}\\s*=\\s*("(\\d{1,5})"|'(\\d{1,5})'|(\\d{1,5}))`, "i");

function escapeAttr(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function attrValue(attrs: string | undefined, re: RegExp): string {
  const m = attrs ? attrs.match(re) : null;
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : "";
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
  let out = String(dirty);

  // 1) ตัดทั้งก้อน (แท็ก + เนื้อหา) ของแท็กอันตรายที่มีคู่เปิด-ปิด
  for (const tag of STRIP_WITH_CONTENT) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
    // เปิดแล้วไม่ปิด (ตั้งใจให้ตัวตัดพลาด) → ตัดตั้งแต่แท็กเปิดจนจบข้อความ
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*$`, "gi"), "");
  }
  // 2) แท็กเดี่ยวอันตราย/ไม่รองรับ
  out = out.replace(allowImages ? VOID_DANGEROUS_KEEP_IMG : VOID_DANGEROUS, "");

  // 3) ไล่ทุกแท็กที่เหลือ: อยู่ใน allowlist → เขียนใหม่ให้เหลือ attribute ที่อนุญาตเท่านั้น
  out = out.replace(TAG_RE, (match, tagNameRaw: string, attrsRaw: string | undefined) => {
    const tag = tagNameRaw.toLowerCase();
    const isClosing = match.startsWith("</");
    if (allowImages && tag === "img") {
      if (isClosing) return "";
      const src = attrValue(attrsRaw, SRC_RE);
      if (!/^https?:\/\//i.test(src)) return "";
      const alt = attrValue(attrsRaw, ALT_RE);
      const w = attrValue(attrsRaw, NUM_ATTR_RE("width"));
      const h = attrValue(attrsRaw, NUM_ATTR_RE("height"));
      return `<img src="${escapeAttr(src)}"${alt ? ` alt="${escapeAttr(alt)}"` : ""}${w ? ` width="${w}"` : ""}${h ? ` height="${h}"` : ""}>`;
    }
    if (!ALLOWLIST.has(tag)) return "";
    if (isClosing) return `</${tag}>`;
    if (tag === "br") return "<br>";
    if (tag === "hr") return "<hr>";
    if (tag === "a") {
      const m = attrsRaw ? attrsRaw.match(HREF_RE) : null;
      const href = m ? (m[2] ?? m[3] ?? m[4] ?? "") : "";
      if (!linkSchemeOk(href, schemes)) return ""; // javascript: / data: ฯลฯ — ปลดแท็กทิ้ง
      return `<a href="${escapeAttr(href)}" rel="noopener" target="_blank">`;
    }
    return `<${tag}>`;
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
