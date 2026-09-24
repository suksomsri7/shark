import { emails } from "@/lib/modules/crm";

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
    const { url } = await emails.trackClick(clean, { ip, ua: req.headers.get("user-agent") }, { count: allowed });
    if (!url) return home();
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch {
    return home();
  }
}
