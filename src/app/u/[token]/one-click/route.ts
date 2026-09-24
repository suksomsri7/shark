import { emails } from "@/lib/modules/crm";

// POST /u/<token>/one-click — ยกเลิกรับอีเมลแบบคลิกเดียวตาม RFC 8058 (ใบ C2.5 · R-C.7)
//   หัวจดหมายที่ชี้มาที่นี่: `List-Unsubscribe: <…/u/<token>/one-click>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
//
// 🔴 **GET ห้ามยกเลิกอะไร**: ตัวสแกนลิงก์ของ Gmail/Outlook และตัวดึงพรีวิวยิง GET ทุกลิงก์ในจดหมาย ⇒
//    ถ้า GET ยกเลิกให้ ลูกค้าที่ไม่เคยกดจะถูกตัดออกจากรายชื่อเงียบ ๆ (หน้า `/u/<token>` มีปุ่มยืนยันให้คนกด)
// 🔴 AUDIT-CLASS X7: token รู้จักหรือไม่รู้จักได้ **สถานะเดียวกัน** (ไม่มีเครื่องทำนาย token ที่ใช้ได้)
// 🔴 ทำงานแม้ร้านกลับไป uiVersion 1 (มติผู้คุมงาน ข้อ 7): การยกเลิกรับตามกฎหมายห้ามขึ้นกับสวิตช์หน้าจอ

export const dynamic = "force-dynamic";

const ipOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";

const DONE_HTML =
  '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>ยกเลิกรับอีเมลแล้ว</title></head>' +
  "<body><h1>ยกเลิกรับอีเมลแล้ว</h1><p>เราจะไม่ส่งอีเมลข่าวสารถึงคุณอีก ขอบคุณที่แจ้งให้ทราบ</p></body></html>";

function done(): Response {
  return new Response(DONE_HTML, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  try {
    const { token } = await params;
    const clean = String(token ?? "");
    const ip = ipOf(req);
    // 🔴 คำตอบของด่านความถี่ต้องถูก **ใช้** ไม่ใช่แค่เรียกให้ผ่าน ๆ: ลิงก์นี้ยิงได้โดยไม่ต้องล็อกอิน และการยิง
    //    ซ้ำ ๆ ทำให้เกิดการเขียนฐานทุกครั้ง (ธง · แถวความยินยอม · แถวเหตุการณ์ · audit) — เต็มเพดาน = ไม่แตะฐาน
    //    แต่ยังตอบหน้าเดิมทุกไบต์ (คนกดจริงต้องไม่เห็นว่าระบบกันอยู่ · และไม่มีเครื่องทำนาย token ที่ใช้ได้)
    const allowed = await emails.trackGate("u", { ip, token: clean });
    if (clean && allowed) await emails.unsubscribe(clean, { ip, ua: req.headers.get("user-agent") });
  } catch {
    // ล้มแล้วยังตอบ 2xx: ผู้ให้บริการอีเมลเห็น 5xx = ซ่อนปุ่ม "ยกเลิกรับ" ของเราทิ้ง
  }
  return done();
}

/** GET = ไม่ทำอะไร (ดูหัวไฟล์) — ชี้ผู้ใช้ไปหน้ายืนยันที่มีปุ่มกดจริง */
export async function GET(): Promise<Response> {
  return new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
}
