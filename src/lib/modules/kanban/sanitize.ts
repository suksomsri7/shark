// sanitize.ts — รายละเอียดการ์ด: HTML allowlist + markdown-lite (K1.6 · D12 · พิมพ์เขียว §11.6)
//
// 🔴 D12: P1 ใช้ textarea + markdown-lite ธรรมดา "ไม่เพิ่ม dependency" — ไฟล์นี้จึงเขียน sanitizer
//    เองด้วย regex ล้วน (ไม่มี DOM parser/cheerio) แทนที่จะใช้ไลบรารีสำเร็จรูป
// 🔴 ไฟล์นี้ **บริสุทธิ์**: ไม่แตะ prisma/DB — เรียกซ้ำได้ทั้งฝั่ง server (ก่อนบันทึก) และข้อสอบ (ตรง ๆ)
//
// กติกา allowlist (§11.6): p br h1 h2 ul ol li strong b em i s code a(href http/https เท่านั้น · rel=noopener)
// — แท็กอื่นทั้งหมด (script/iframe/img/on*/javascript:) ถูกตัดทิ้ง · แท็กที่ไม่อยู่ใน allowlist (เช่น h3)
//   ถูก "ปลด" ออกแต่ **คงข้อความข้างในไว้** (ไม่ใช่ตัดทั้งก้อน) — ต่างจาก script/iframe/style ที่ตัดทั้งเนื้อหา
//   เพราะเนื้อหาข้างในนั้นไม่ใช่สิ่งที่ผู้ใช้ตั้งใจให้อ่าน (โค้ด/มาร์กอัปอันตราย)

/** แท็กที่ต้องตัดทิ้งทั้งก้อน (รวมเนื้อหาข้างใน) — เป็นโค้ด/มาร์กอัปอันตราย ไม่ใช่ข้อความที่ผู้ใช้ตั้งใจพิมพ์ */
const STRIP_WITH_CONTENT = ["script", "style", "iframe", "object", "embed", "noscript"] as const;

/** แท็กเดี่ยว (void) ที่อันตราย/ไม่รองรับ — ตัดทั้งแท็กได้เลยโดยไม่ต้องหาคู่ปิด */
const VOID_DANGEROUS = /<(img|input|hr|source|track|embed|object|iframe|script|style|noscript)\b[^>]*\/?>/gi;

/** แท็กที่อนุญาต (§11.6) — ค่า = attribute ที่อนุญาตเก็บไว้ (ว่าง = ไม่มี attribute ไหนรอดเลย) */
const ALLOWLIST = new Set([
  "p", "br", "h1", "h2", "ul", "ol", "li", "strong", "b", "em", "i", "s", "code", "a",
]);

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)(\s+[^>]*)?\s*\/?>/g;
const HREF_RE = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

function escapeAttr(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * ตัด HTML ให้เหลือเฉพาะ allowlist — ไม่มี Date/DOM parser ตาม D12
 * @param dirty HTML ดิบจากผู้ใช้ (textarea/markdown-lite) — `null`/`undefined` = ยังไม่มีรายละเอียด
 */
export function sanitizeDescription(dirty: string | null | undefined): string {
  if (!dirty) return "";
  let out = dirty;

  // 1) ตัดทั้งก้อน (แท็ก + เนื้อหา) ของแท็กอันตรายที่มีคู่เปิด-ปิด
  for (const tag of STRIP_WITH_CONTENT) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
  }
  // 2) แท็กเดี่ยวอันตราย/ไม่รองรับ (img ฯลฯ) — ตัดทั้งแท็ก (ไม่มีเนื้อหาให้เก็บอยู่แล้ว)
  out = out.replace(VOID_DANGEROUS, "");

  // 3) ไล่ทุกแท็กที่เหลือ: อยู่ใน allowlist → เขียนใหม่ให้เหลือ attribute ที่อนุญาตเท่านั้น
  //    ไม่อยู่ใน allowlist → "ปลด" แท็กออก (คืนสตริงว่าง) แต่ข้อความรอบ ๆ ยังอยู่
  out = out.replace(TAG_RE, (match, tagNameRaw: string, attrsRaw: string | undefined) => {
    const tag = tagNameRaw.toLowerCase();
    const isClosing = match.startsWith("</");
    if (!ALLOWLIST.has(tag)) return "";
    if (isClosing) return `</${tag}>`;
    if (tag === "br") return "<br>";
    if (tag === "a") {
      const m = attrsRaw ? attrsRaw.match(HREF_RE) : null;
      const href = m ? (m[2] ?? m[3] ?? m[4] ?? "") : "";
      if (!/^https?:\/\//i.test(href)) return ""; // ไม่ใช่ http(s) — เช่น javascript: — ปลดแท็กทิ้ง
      return `<a href="${escapeAttr(href)}" rel="noopener">`;
    }
    return `<${tag}>`;
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
