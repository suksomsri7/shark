import { emails } from "@/lib/modules/crm";

// GET /t/o/<token>.gif — รูปจุดเดียว 1×1 ที่ฝังท้ายอีเมลของ CRM (ใบ C2.5 · R-C.7)
//
// 🔴 AUDIT-CLASS X7: **คำตอบเหมือนกันทุกไบต์เสมอ** — token รู้จัก / ไม่รู้จัก / เพี้ยน / เต็มเพดานความถี่
//    ได้ 200 · image/gif · no-store · ไบต์เดียวกัน · ไม่มีอะไรบอกว่า token นั้น "ใช้ได้จริงไหม"
//    (ถ้าคำตอบต่างกันแม้แต่ header เดียว ใครก็ไล่เดา token ของร้านอื่นได้ทีละตัว)
// 🔴 ตอบรูปเสมอแม้นับไม่ได้: ตอบ 404 = กล่องจดหมายของลูกค้าขึ้นรูปแตกกลางจดหมายที่ร้านส่งไปเอง
// 🔴 เพดานความถี่ผ่าน `checkRateLimitDb` ตัวเดียวของระบบ (กุญแจถังมาจาก `emails.trackRateKeys` — ไม่มี IP ดิบ/token ดิบ)
// 🔴 ต้องเรียกผ่าน facade `@/lib/modules/crm` เท่านั้น (fitness F2.3 จงใจไม่ยกเว้นโฟลเดอร์ `/t/*`)

export const dynamic = "force-dynamic";

/** gif โปร่งใส 1×1 (43 ไบต์) — คงที่ ไม่ต้องสร้างใหม่ทุกคำขอ */
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

function gif(): Response {
  return new Response(new Uint8Array(PIXEL), {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.byteLength),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}

const ipOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  try {
    const { token } = await params;
    const clean = String(token ?? "").replace(/\.gif$/i, "");
    if (!clean) return gif();
    const ip = ipOf(req);
    const allowed = await emails.trackGate("o", { ip, token: clean });
    await emails.trackOpen(clean, { ip, ua: req.headers.get("user-agent") }, { count: allowed });
  } catch {
    // นับไม่ได้ = ตัวเลขรายงานขาดไป 1 ครั้ง — ห้ามทำให้รูปในจดหมายของลูกค้าแตก
  }
  return gif();
}
