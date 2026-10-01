import { tracking } from "@/lib/modules/crm";

// POST /t/v — ออก "ตั๋วผู้เข้าชม" ให้ shark.js บนเว็บของร้าน ส่งต่อให้ฟอร์มของเราที่ร้านฝังด้วย iframe (CRM C4.4-fix3 ▸ J3)
//
// 🔴 AUDIT-CLASS X7: ทุกการปฏิเสธ (siteKey ไม่รู้จัก/ปิด/uiVersion 1 · Origin ไม่ใช่ https ในโดเมนของร้าน · url ของหน้าอยู่นอกโดเมน ·
//    รหัสผู้เข้าชมไม่ใช่ uuid · ไม่เคยยอมรับ/ปฏิเสธ/ถอน/เวอร์ชันเก่า · ผู้ติดต่อขอหยุดติดตาม · เกินเพดาน · body เพี้ยน) = **204 ตัวเปล่า
//    แบบเดียวกันทุกไบต์ และไม่มี header CORS** ⇒ ไม่มีทางถามว่า "ผู้เข้าชมคนนี้มีอยู่ไหม/ยินยอมไหม" (body ใหญ่เกินเพดาน = 413 เปล่า)
// 🔴 ผ่าน = 200 `{"t":"<ตั๋ว>"}` + `Access-Control-Allow-Origin: <origin ของร้านที่ผ่านด่าน>` · ไม่มี Allow-Credentials · no-store ·
//    ตั๋วอยู่ในเนื้อคำตอบนี้ที่เดียว (ไม่อยู่ใน url/คุกกี้/header) และไม่ถูก log
// 🔴 อ่านทุกอย่างจาก `req` (ห้าม next/headers) · เรียกผ่าน facade `@/lib/modules/crm` เท่านั้น (fitness F2.3)
// 🔴 AUDIT-CLASS X8: ไม่มี IP ดิบไปถึงฐาน (บริการแปลงเป็น ipHash ก่อนเสมอ)

export const dynamic = "force-dynamic";

const ipOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";

function empty(status: number): Response {
  return new Response(null, { status, headers: new Headers({ "Cache-Control": "no-store, max-age=0", Vary: "Origin" }) });
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
    const capped = await tracking.readCappedBody(req); // เพดานบังคับก่อนอ่าน (ตัวเดียวกับ /t/e)
    if (capped.over) return empty(413);
    let body: unknown = null;
    try {
      body = JSON.parse(capped.text) as unknown;
    } catch {
      return empty(204);
    }
    const site = await tracking.resolveSite(tracking.siteKeyOfPayload(body)).catch(() => null);
    const minted = await tracking.mintVisitorTicket(body, { origin, ip: ipOf(req), userAgent: req.headers.get("user-agent") ?? "", bytes: capped.bytes }, { site });
    if (!minted) return empty(204);
    return new Response(JSON.stringify({ t: minted.ticket }), {
      status: 200,
      headers: new Headers({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        Vary: "Origin",
        "Access-Control-Allow-Origin": minted.origin,
      }),
    });
  } catch {
    return empty(204);
  }
}
