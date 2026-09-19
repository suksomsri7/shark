// /api/v1/crm/openapi.json — สัญญาของ REST CRM ในรูป OpenAPI 3.1 (ใบ C1.10)
//
// **ไม่ต้องใช้คีย์**: ผู้เชื่อมต่อ/AI agent ต้องอ่านสัญญาได้ก่อนมีคีย์ · ไม่มีข้อมูลของร้านใด มีแต่รูปร่างของ endpoint
// 🔴 โฟลเดอร์ `openapi.json` เป็น static segment ⇒ ชนะ `[...path]/route.ts` ข้าง ๆ เสมอ
import { crmApi } from "@/lib/modules/crm";

const CACHE_SECONDS = 300;

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify(crmApi.buildOpenApi()), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` },
  });
}
