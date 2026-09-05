// /api/v1/account/openapi.json — สัญญาของ API บัญชีในรูป OpenAPI 3.1 (WO A4)
//
// **ไม่ต้องใช้คีย์**: ผู้เชื่อมต่อ (หรือ AI agent) ต้องอ่านสัญญาได้ก่อนจะมีคีย์เสมอ
// และเอกสารนี้ไม่มีข้อมูลของร้านใดเลย — มีแต่รูปร่างของ endpoint (ข้อสอบ OA-2.11 เฝ้าไว้)
//
// 🔴 เส้นทาง: โฟลเดอร์ชื่อ `openapi.json` เป็น "static segment" (จุดในชื่อโฟลเดอร์เป็นตัวอักษรธรรมดา
//    ไม่ใช่ convention ของ Next — ที่มีความหมายพิเศษคือ `[...]` `(...)` `@...` เท่านั้น)
//    Next จับคู่แบบเจาะจงก่อนเสมอ: static > dynamic > catch-all
//    (`node_modules/next/dist/docs/.../07-api-routes.md` §Caveats) ⇒ ไฟล์นี้ชนะ `[...path]/route.ts`
//    ที่อยู่ข้าง ๆ และ dispatch จะไม่ถูกเรียกด้วย path นี้เลย
import { buildOpenApi } from "@/lib/modules/account/api/openapi";
import { ACCOUNT_OPS } from "@/lib/modules/account/api/registry";

/** 5 นาที: สัญญาเปลี่ยนตอน deploy เท่านั้น แต่ไม่แคชยาวจนคนแก้แล้วยังเห็นของเก่า */
const CACHE_SECONDS = 300;

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify(buildOpenApi(ACCOUNT_OPS)), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    },
  });
}
