// /api/v1/hr/openapi.json — สัญญาของ API ระบบงานบุคคลในรูป OpenAPI 3.1 (ใบ H4.8)
//
// **ไม่ต้องใช้คีย์**: ผู้เชื่อมต่อ/agent ต้องอ่านสัญญาได้ก่อนมีคีย์ · เอกสารนี้ไม่มีข้อมูลของร้านใดเลย มีแต่รูปร่างของ endpoint
// 🔴 โฟลเดอร์ชื่อ `openapi.json` เป็น static segment ⇒ ชนะ `[...path]/route.ts` ข้าง ๆ
import { buildOpenApi } from "@/lib/modules/hr/api/openapi";
import { HR_OPS } from "@/lib/modules/hr/api/registry";

const CACHE_SECONDS = 300;

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify(buildOpenApi(HR_OPS)), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    },
  });
}
