// /api/v1/crm/openapi.json — สัญญาของ REST CRM ในรูป OpenAPI 3.1 (ใบ C1.10 · ต่อผู้เรียก C3.8)
//
// **ไม่ต้องใช้คีย์**: ผู้เชื่อมต่อ/AI agent ต้องอ่านสัญญาได้ก่อนมีคีย์ · ไม่มีคีย์ = เอกสารคงที่ ไม่มีข้อมูลของร้านใด มีแต่รูปร่างของ endpoint
// CRM C3.8 ▸ ส่ง `Authorization: Bearer <คีย์ CRM>` มาด้วย = + path จริงของทุกวัตถุกำหนดเองในระบบของคีย์ (`/objects/<key>/records…`)
//   ⇒ คำตอบแบบนั้นเป็นของคีย์นั้นคนเดียว: `Cache-Control: private, no-store` (ห้ามแคชร่วม) · คีย์ใช้ไม่ได้ = เอกสารคงที่ตามเดิม ◂
// 🔴 โฟลเดอร์ `openapi.json` เป็น static segment ⇒ ชนะ `[...path]/route.ts` ข้าง ๆ เสมอ
import { crmApi } from "@/lib/modules/crm";

const CACHE_SECONDS = 300;

export async function GET(req: Request): Promise<Response> {
  const { doc, keyed, retryAfterSec } = await crmApi.buildOpenApiForRequest(req);
  // รีวิว C3.8 N3 ▸ เอกสารต่อคีย์นับเข้าถังอ่านของคีย์ — เต็ม = 429 ไทย + Retry-After (แบบเดียวกับ op ของคีย์) ◂
  if (retryAfterSec !== undefined) {
    return new Response(
      JSON.stringify({ error: { code: "rate_limited", message_th: `เรียกใช้ถี่เกินไป — กรุณารออีก ${retryAfterSec} วินาทีแล้วลองใหม่`, message_en: "Too many requests for this API key." } }),
      { status: 429, headers: { "content-type": "application/json; charset=utf-8", "Retry-After": String(retryAfterSec), "Cache-Control": "private, no-store" } },
    );
  }
  return new Response(JSON.stringify(doc), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "Cache-Control": keyed ? "private, no-store" : `public, max-age=${CACHE_SECONDS}`,
      Vary: "Authorization",
    },
  });
}
