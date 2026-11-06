// GET /doc/<token> — SEC S3a.5 ▸ ใบเสนอราคาสาธารณะ (ลูกค้าเปิดจากลิงก์ในข้อความที่เลขาส่ง · ไม่ต้องล็อกอิน · token = capability) ◂
//   route handler (ไม่ใช่ page) เพื่อตอบสถานะจริง: 404 token ผิด/ไม่ใช่ใบเสนอราคาที่ออกแล้ว/ร้านปิดลิงก์สาธารณะ (§9.2)/หมดอายุ · 429 ยิงถี่
//   ด่านแบบ /r/: เพดานต่อ IP (`publicDocument`) + ต่อ token (`publicDocumentToken`) ก่อนค้น · noindex · no-referrer · no-store · CSP (สคริปต์เดียวผูก nonce)
//   เนื้อหา = `renderPublicDocumentHtml` (เทมเพลตพิมพ์เดิมผ่าน buildPrintOptions) · ปุ่ม "ดาวน์โหลด PDF" → /doc/<token>/pdf (ส่วน B — ตอนนี้ 501)
import { randomBytes } from "node:crypto";
import { accountRateGuard } from "@/lib/modules/account/rate-limit";
import { loadPublicDocument, PUBLIC_DOC_HEADERS, PUBLIC_DOC_NOT_FOUND, publicDocClientIp, publicDocPlain, renderPublicDocumentHtml } from "@/lib/modules/account/public-doc";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const ip = await accountRateGuard("publicDocument", publicDocClientIp(req));
  if (!ip.ok) return publicDocPlain(429, ip.reason, { "Retry-After": String(ip.retryAfterSec) });
  const tok = await accountRateGuard("publicDocumentToken", String(token).slice(0, 64));
  if (!tok.ok) return publicDocPlain(429, tok.reason, { "Retry-After": String(tok.retryAfterSec) });
  const view = await loadPublicDocument(token);
  if (!view) return publicDocPlain(404, PUBLIC_DOC_NOT_FOUND);
  const nonce = randomBytes(16).toString("base64");
  const html = renderPublicDocumentHtml(view, { nonce, pdfHref: `/doc/${encodeURIComponent(token)}/pdf` });
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...PUBLIC_DOC_HEADERS,
      "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    },
  });
}
