import { emails, tracking, wakeOutbox } from "@/lib/modules/crm";

// GET /t/c/<token> — ลิงก์ที่ถูกห่อไว้ในอีเมลของ CRM (ใบ C2.5 · R-C.7)
//
// 🔴 AUDIT-CLASS X7 (open redirect): ปลายทางมาจาก **แถวในฐานที่ผูกกับค่าย่อยของ token นั้นตัวเดียว** ไม่ใช่จาก
//    คำขอ — พารามิเตอร์ใน URL (`?u=` `?url=` `?redirect=`) ถูกมองข้ามทั้งหมด · token ที่ถูกแก้/ตัด/ทำเป็น URL/
//    ใส่ `../` ⇒ 302 ไปหน้าแรกของแอป ไม่มีทางไปปลายทางที่ผู้ยิงเลือก
// 🔴 ยังทำงานเมื่อร้านกลับไป uiVersion 1 (มติผู้คุมงาน 24 ก.ย. ข้อ 7): ลิงก์ในจดหมายที่ลูกค้าถืออยู่แล้วต้องไม่ตาย
// 🔴 เต็มเพดานความถี่ = ยัง redirect ให้ลูกค้าเหมือนเดิม แต่ไม่นับคลิก (ลูกค้าไม่ควรถูกกันเพราะกดซ้ำ)
// 🔴 ต้องเรียกผ่าน facade `@/lib/modules/crm` เท่านั้น (fitness F2.3 จงใจไม่ยกเว้นโฟลเดอร์ `/t/*`)

export const dynamic = "force-dynamic";

const ipOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";

function home(): Response {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return new Response(null, { status: 302, headers: { Location: `${base}/`, "Cache-Control": "no-store" } });
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  try {
    const { token } = await params;
    const clean = String(token ?? "");
    if (!clean) return home();
    const ip = ipOf(req);
    const allowed = await emails.trackGate("c", { ip, token: clean });
    const ua = req.headers.get("user-agent");
    const { url, ticket } = await emails.trackClick(clean, { ip, ua }, { count: allowed });
    if (!url) return home();
    if (allowed) wakeOutbox(); // CRM C5.5-fix13 ▸ P-it5-2 sweep: event crm.email.clicked (หลัง redirect แล้ว · รวมการปลุกซ้อน) ◂
    // CRM C2.6 ▸ ตั๋วระบุตัวตน (`sd_ct`): คลิกที่ **นับจริง** ของจดหมายที่รู้ว่าเป็นของผู้ติดต่อคนไหน และปลายทางอยู่ใน
    //   โดเมนที่ร้านประกาศไว้เท่านั้น ⇒ หน้าที่ลูกค้าไปถึงผูกการเข้าชมย้อนหลังเข้ากับลูกค้าคนนั้นได้โดยไม่ต้องส่งอีเมล/เบอร์
    //   ผ่านหน้าเว็บเลย (AUDIT-CLASS X7 · X8) · ปลายทางยังเป็น url ที่เก็บไว้เสมอ (ต่อพารามิเตอร์ท้ายเท่านั้น)
    //   🔴 เป็น hunk เดียวที่ใบ C2.6 แตะ route ของใบ C2.5 (มติผู้คุมงาน 24 ก.ย. ข้อ 1) ◂
    //   C5.1-fix ▸ F5: แถวอีเมล/ผู้ติดต่อ/ระบบที่คำสั่งนับอ่านมาแล้ว ส่งต่อให้ตัวทำตั๋ว (ไม่อ่านฐานซ้ำ — ทางร้อน 2 รอบไปกลับ) ◂
    const target = await tracking.ticketedClickUrl(clean.split("~")[0] ?? "", url, { counted: allowed, userAgent: ua, pre: ticket ?? null });
    // CRM C5.4-F ▸ L4-m1: ปลายทางที่มีทางเดินภาษาไทยเคยทำ `new Response` พัง (ByteString) ⇒ ลูกค้าตกไปหน้าแรกของ SHARK ◂
    return new Response(null, { status: 302, headers: { Location: tracking.headerSafeLocation(target), "Cache-Control": "no-store" } });
  } catch {
    return home();
  }
}
