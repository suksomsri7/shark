// /api/v1/crm/manifest.json — สัญญาทั้งหมดของ REST/AI ของ CRM ในเอกสารเดียว (ใบ C3.8)
//
// **ไม่ต้องใช้คีย์** (เหมือน openapi.json): op ของร้าน · เลนลูกค้า `/portal/*` · tool ของผู้ช่วย AI 32 ตัว · เหตุการณ์เว็บฮุค · event ภายใน
// มาจากทะเบียนล้วน (`crmApi.crmManifest` — บริสุทธิ์ ไม่แตะ DB ไม่มีข้อมูลร้านใด)
// 🔴 โฟลเดอร์ `manifest.json` เป็น static segment ⇒ ชนะ `[...path]/route.ts` ข้าง ๆ เสมอ
import { crmApi } from "@/lib/modules/crm";

const CACHE_SECONDS = 300;

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify(crmApi.crmManifest()), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` },
  });
}
