import { tracking } from "@/lib/modules/crm";

// POST /t/e — ปลายทางเก็บการเข้าชมของสคริปต์ shark.js (ใบ C2.6 · R-C.7)
//
// 🔴 **ทุกคำตอบคือ 204 ตัวเปล่า** (เว้นคำขอที่ใหญ่เกินเพดาน = 413 เปล่า ๆ) — ไม่มีทางรู้จากคำตอบว่า siteKey ใช้ได้ไหม
//    · ความยินยอมผ่านไหม · เขียนแถวหรือเปล่า (AUDIT-CLASS X7)
// 🔴 CORS ผูกกับ "โดเมนที่ร้านของ payload นั้นประกาศไว้" เท่านั้น — ไม่มี `*` ไม่มี Allow-Credentials
// 🔴 อ่านคุกกี้จาก `req.headers` เท่านั้น (ห้าม next/headers — route นี้ต้องรันกับ Request ธรรมดาได้)
// 🔴 AUDIT-CLASS X8: ไม่มี IP ดิบไปถึงฐานข้อมูล (บริการแปลงเป็น ipHash ก่อนเสมอ)
// 🔴 ต้องเรียกผ่าน facade `@/lib/modules/crm` เท่านั้น (fitness F2.3)

export const dynamic = "force-dynamic";

const ipOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";

function empty(status: number, cors: string | null): Response {
  const h = new Headers({ "Cache-Control": "no-store, max-age=0", Vary: "Origin" });
  if (cors) h.set("Access-Control-Allow-Origin", cors);
  return new Response(null, { status, headers: h });
}

export async function OPTIONS(req: Request): Promise<Response> {
  const cors = await tracking.corsOriginForPreflight(req.headers.get("origin")).catch(() => null);
  const h = new Headers({ "Cache-Control": "no-store, max-age=0", Vary: "Origin" });
  if (cors) {
    h.set("Access-Control-Allow-Origin", cors);
    h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    h.set("Access-Control-Allow-Headers", "content-type");
    h.set("Access-Control-Max-Age", "600");
  }
  return new Response(null, { status: 204, headers: h });
}

export async function POST(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  try {
    // 🔴 (รีวิวรอบ 2 · S3) เพดานขนาด body ถูกบังคับ **ก่อนอ่าน**: `content-length` ที่ประกาศเกินเพดาน = ปฏิเสธทันที ·
    //    ไม่ประกาศหรือโกหก = ตัวอ่านแบบมีเพดานเลิกรับกลางทาง (ของเดิม `await req.text()` ดูดทั้งก้อนก่อนวัด)
    const capped = await tracking.readCappedBody(req);
    if (capped.over) {
      return empty(413, await tracking.corsOriginForPreflight(origin).catch(() => null));
    }
    const bytes = capped.bytes;
    let body: unknown = null;
    try {
      body = JSON.parse(capped.text) as unknown;
    } catch {
      return empty(204, null);
    }
    const cors = await tracking.corsOriginForPayload(body, origin).catch(() => null);
    await tracking.collect(body, { origin, ip: ipOf(req), userAgent: req.headers.get("user-agent") ?? "", bytes });
    return empty(204, cors);
  } catch {
    return empty(204, null);
  }
}
