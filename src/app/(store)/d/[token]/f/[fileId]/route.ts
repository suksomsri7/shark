// SVC D.9 ▸ ไฟล์ของสัญญา (รูปห้อง/เอกสาร) · GET /d/<token>/f/<fileId> — X10: ไฟล์ส่วนตัวผ่าน route ที่ตรวจด่านเท่านั้น
//   ด่านเดียวกับหน้าจ่าย (rate → ลายเซ็น → สัญญา live) + fileId ต้องอยู่ในรายการไฟล์ของสัญญานี้ (ไม่มีบัตร/ลายเซ็น) ⇒ ไม่ผ่าน = 404 เนื้อเดียว
//   🔴 ทุกคำตอบ `Cache-Control: private, no-store` · สตรีมไบต์เอง (ไม่ redirect ไป CDN)
import { portalClientKey, portalFileRef } from "@/lib/platform/dorm-portal";

export const dynamic = "force-dynamic";

// W10: sandbox กันไฟล์ที่ร้านอัป (เช่น PDF/HTML ปลอมชนิด) รันสคริปต์บน origin ของเรา
const NO_STORE = { "cache-control": "private, no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "content-security-policy": "sandbox" };
const notFound = () => new Response("Not Found", { status: 404, headers: { ...NO_STORE, "content-type": "text/plain; charset=utf-8" } });
const INLINE = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

export async function GET(req: Request, { params }: { params: Promise<{ token: string; fileId: string }> }): Promise<Response> {
  try {
    const { token, fileId } = await params;
    const ref = await portalFileRef(token, fileId, { clientKey: portalClientKey(req.headers) });
    if (!ref) return notFound();
    const body = await ref.open();
    if (!body) return notFound();
    const ct = INLINE.has(ref.contentType) ? ref.contentType : "application/octet-stream";
    return new Response(body as BodyInit, {
      status: 200,
      headers: { ...NO_STORE, "content-type": ct, "content-disposition": INLINE.has(ref.contentType) ? "inline" : "attachment" },
    });
  } catch {
    return notFound();
  }
}
