// sanitize.ts — รายละเอียดการ์ด: HTML allowlist + markdown-lite (K1.6 · D12 · พิมพ์เขียว §11.6)
//
// 🔴 D12: P1 ใช้ textarea + markdown-lite ธรรมดา "ไม่เพิ่ม dependency" — ไม่มี DOM parser/cheerio · ตัวสแกนคือ
//    `@/lib/core/html-allowlist` (ตัวเดียวกับ `core/sanitize`) — นโยบาย (allowlist/ลิงก์) ของบอร์ดงานอยู่ที่นี่
// 🔴 HOTFIX 2026-10-01: เดิมเป็น regex `replace` ⇒ `<svg/onload=…>`/`<details/open/ontoggle=…>` (ตัวคั่น `/`) หลุดเข้าการ์ด
//    (อีเมลเข้าบอร์ด · คำขอจากพอร์ทัล = คนนอกร้าน) + ReDoS ~n³ — ตอนนี้ default-deny (ledger/wo-notes/hotfix-sanitize-2026-10-01.md)
// 🔴 ไฟล์นี้ **บริสุทธิ์**: ไม่แตะ prisma/DB — เรียกซ้ำได้ทั้งฝั่ง server (ก่อนบันทึก) และข้อสอบ (ตรง ๆ)
//
// กติกา allowlist (§11.6): p br h1 h2 ul ol li strong b em i s code a(href http/https เท่านั้น · rel=noopener)
// — แท็กอื่นทั้งหมด (script/iframe/img/on*/javascript:) ถูกตัดทิ้ง · แท็กที่ไม่อยู่ใน allowlist (เช่น h3)
//   ถูก "ปลด" ออกแต่ **คงข้อความข้างในไว้** (ไม่ใช่ตัดทั้งก้อน) — ต่างจาก script/iframe/style ที่ตัดทั้งเนื้อหา
//   เพราะเนื้อหาข้างในนั้นไม่ใช่สิ่งที่ผู้ใช้ตั้งใจให้อ่าน (โค้ด/มาร์กอัปอันตราย)

import { attrOf, escapeAttr, parseAttrs, sanitizeWithPolicy } from "@/lib/core/html-allowlist";

/** แท็กที่ต้องตัดทิ้งทั้งก้อน (รวมเนื้อหาข้างใน) — เป็นโค้ด/มาร์กอัปอันตราย ไม่ใช่ข้อความที่ผู้ใช้ตั้งใจพิมพ์ */
const STRIP_WITH_CONTENT = ["script", "style", "iframe", "object", "embed", "noscript"] as const;

/** แท็กที่อนุญาต (§11.6) — ค่า = attribute ที่อนุญาตเก็บไว้ (ว่าง = ไม่มี attribute ไหนรอดเลย) */
const ALLOWLIST = new Set([
  "p", "br", "h1", "h2", "ul", "ol", "li", "strong", "b", "em", "i", "s", "code", "a",
]);

const STRIP = new Set<string>(STRIP_WITH_CONTENT);
/** แท็กเปิด/ปิดรูปมาตรฐาน (สร้างครั้งเดียว — ข้อความที่มีแท็กเป็นแสนตัวไม่ต้องสร้างสตริงใหม่ทุกตัว) */
const OPEN = new Map([...ALLOWLIST].map((t) => [t, `<${t}>`] as const));
const CLOSE = new Map([...ALLOWLIST].map((t) => [t, `</${t}>`] as const));

/**
 * ตัด HTML ให้เหลือเฉพาะ allowlist — ไม่มี Date/DOM parser ตาม D12
 * @param dirty HTML ดิบจากผู้ใช้ (textarea/markdown-lite) — `null`/`undefined` = ยังไม่มีรายละเอียด
 */
export function sanitizeDescription(dirty: string | null | undefined): string {
  if (!dirty) return "";
  // script/style/iframe/object/embed/noscript ตัดทั้งก้อน (เปิดไม่ปิด = ตัดเฉพาะแท็กเปิด — เหมือนของเดิม) · แท็กอื่นที่ไม่อยู่ใน
  // allowlist (img/hr/h3/svg/…) "ปลด" ออกแต่คงข้อความ · comment ทิ้ง · `<` ที่ไม่ใช่แท็ก → `&lt;`
  const out = sanitizeWithPolicy(dirty, {
    stripWithContent: STRIP,
    unclosedStripDropsRest: false,
    rewrite: (tag, isClosing, rawAttrs) => {
      if (!ALLOWLIST.has(tag)) return "";
      if (isClosing) return CLOSE.get(tag) ?? "";
      if (tag === "br") return "<br>";
      if (tag === "a") {
        const href = attrOf(parseAttrs(rawAttrs), "href")?.value ?? "";
        if (!/^https?:\/\//i.test(href)) return ""; // ไม่ใช่ http(s) — เช่น javascript: — ปลดแท็กทิ้ง
        return `<a href="${escapeAttr(href)}" rel="noopener">`;
      }
      return OPEN.get(tag) ?? "";
    },
  });

  return out.trim();
}

// ───────────────────────── markdown-lite (D12) ─────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** ตัวหนา/เอียง/ลิงก์อัตโนมัติของ 1 บรรทัด (escape ก่อนเสมอ กันข้อความดิบเป็น HTML หลุดเข้ามา) */
function renderInline(line: string): string {
  let s = escapeHtml(line);
  s = s.replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${url}" rel="noopener">${url}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return s;
}

/**
 * markdown-lite → HTML แล้วผ่าน `sanitizeDescription` เสมอ (D12 · §11.6)
 * รองรับ: บรรทัดขึ้นต้น `- ` → รายการ `<ul><li>` · `**หนา**` → `<strong>` · `*เอียง*` → `<em>`
 * · บรรทัดว่างคั่นย่อหน้า `<p>` · URL ขึ้นต้น http(s) เชื่อมลิงก์อัตโนมัติ
 */
export function renderDescription(text: string | null | undefined): string {
  if (!text) return "";
  const paragraphs = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const parts: string[] = [];
  for (const para of paragraphs) {
    const lines = para.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) continue;
    const isList = lines.every((l) => /^[-*]\s+/.test(l.trim()));
    if (isList) {
      const items = lines.map((l) => `<li>${renderInline(l.trim().replace(/^[-*]\s+/, ""))}</li>`).join("");
      parts.push(`<ul>${items}</ul>`);
    } else {
      parts.push(`<p>${lines.map((l) => renderInline(l.trim())).join("<br>")}</p>`);
    }
  }
  return sanitizeDescription(parts.join(""));
}
