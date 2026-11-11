// GET /doc/<token>/pdf — SEC S3a.5 ส่วน B ▸ ไฟล์ PDF ของใบเสนอราคาสาธารณะ (มติเจ้าของ 7 พ.ย. 2569) ◂
//   ด่านเดียวกับหน้า A: เพดานต่อ IP/ต่อ token (429) → token ผิด/ไม่ใช่ใบเสนอราคาที่ออกแล้ว/ร้านปิดลิงก์/หมดอายุ = 404
//   เนื้อ = `renderPublicDocumentPdf` (เทมเพลตเดียวกับหน้า A ผ่าน `loadPublicDocument`) · attachment `<docNo>.pdf` (ASCII + RFC 5987) · no-store · noindex
//   สร้างไฟล์ไม่สำเร็จ = 500 ข้อความไทย (ไม่ส่งข้อความดิบ) + logOps
import { logOps } from "@/lib/core/ops";
import { accountRateGuard } from "@/lib/modules/account/rate-limit";
import { loadPublicDocument, PUBLIC_DOC_HEADERS, PUBLIC_DOC_NOT_FOUND, publicDocClientIp, publicDocPlain } from "@/lib/modules/account/public-doc";
import { pdfContentDisposition, renderPublicDocumentPdf } from "@/lib/modules/account/public-doc-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const ip = await accountRateGuard("publicDocument", publicDocClientIp(req));
  if (!ip.ok) return publicDocPlain(429, ip.reason, { "Retry-After": String(ip.retryAfterSec) });
  const tok = await accountRateGuard("publicDocumentToken", String(token).slice(0, 64));
  if (!tok.ok) return publicDocPlain(429, tok.reason, { "Retry-After": String(tok.retryAfterSec) });
  const view = await loadPublicDocument(token);
  if (!view) return publicDocPlain(404, PUBLIC_DOC_NOT_FOUND);
  let pdf: Buffer;
  try {
    pdf = await renderPublicDocumentPdf(view);
  } catch (e) {
    await logOps("ERROR", "account", "สร้าง PDF ใบเสนอราคาสาธารณะไม่สำเร็จ", { detail: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300) });
    return publicDocPlain(500, "สร้างไฟล์ PDF ไม่สำเร็จ — ลองใหม่อีกครั้ง หรือกด \"พิมพ์ / บันทึกเป็น PDF\" ในหน้าเอกสาร");
  }
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": pdfContentDisposition(view.docNo),
      "Content-Length": String(pdf.length),
      ...PUBLIC_DOC_HEADERS,
    },
  });
}
