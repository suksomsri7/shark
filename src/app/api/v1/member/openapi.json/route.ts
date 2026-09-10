// /api/v1/member/openapi.json — สัญญาของ API ระบบสมาชิกในรูป OpenAPI 3.1 (M1.11)
//
// **ไม่ต้องใช้คีย์**: ผู้เชื่อมต่อ (หรือ AI agent) ต้องอ่านสัญญาได้ก่อนจะมีคีย์เสมอ
// และเอกสารนี้ไม่มีข้อมูลของร้านใดเลย — มีแต่รูปร่างของ endpoint
//
// 🔴 เส้นทาง: โฟลเดอร์ชื่อ `openapi.json` เป็น static segment (จุดในชื่อโฟลเดอร์เป็นตัวอักษรธรรมดา)
//    Next จับคู่แบบเจาะจงก่อนเสมอ: static > dynamic > catch-all ⇒ ไฟล์นี้ชนะ `[...path]/route.ts` ข้าง ๆ
import { buildOpenApi } from "@/lib/modules/member/api/openapi";
import { MEMBER_OPS } from "@/lib/modules/member/api/registry";

/** 5 นาที: สัญญาเปลี่ยนตอน deploy เท่านั้น แต่ไม่แคชยาวจนคนแก้แล้วยังเห็นของเก่า */
const CACHE_SECONDS = 300;

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify(buildOpenApi(MEMBER_OPS)), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    },
  });
}
