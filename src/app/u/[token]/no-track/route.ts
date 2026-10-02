import { emails, wakeOutbox } from "@/lib/modules/crm";

// POST /u/<token>/no-track — ลูกค้าขอ "ไม่ต้องติดตามการเปิดอ่าน/คลิก" แต่ยังรับอีเมลได้ (CRM C5.4-B · L5-M4 · พิมพ์เขียว §11.4 trackingOptOut)
//   ปุ่มอยู่บนหน้า `/u/<token>` (คู่กับปุ่มยกเลิกรับ) — form POST จากคนกดจริงเท่านั้น
// 🔴 GET ห้ามทำอะไร (ตัวสแกนลิงก์ยิง GET ทุกลิงก์) · AUDIT-CLASS X7: token รู้จัก/ไม่รู้จัก ได้หน้าเดียวกันทุกไบต์
// 🔴 ทำงานแม้ร้านกลับไป uiVersion 1 (แบบเดียวกับ one-click): คำขอของลูกค้าห้ามขึ้นกับสวิตช์หน้าจอ

export const dynamic = "force-dynamic";

const DONE_HTML =
  '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>หยุดติดตามแล้ว</title></head>' +
  "<body><h1>หยุดติดตามการเปิดอ่านแล้ว</h1><p>อีเมลจากร้านนี้จะไม่นับการเปิดอ่านหรือการคลิกของคุณอีก ขอบคุณที่แจ้งให้ทราบ</p></body></html>";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  try {
    const { token } = await params;
    const clean = String(token ?? "");
    if (clean) await emails.stopTracking(clean, { ua: req.headers.get("user-agent") });
    if (clean) wakeOutbox(); // CRM C5.5-fix13 ▸ P-it5-2: ปลุกคิว outbox หลังเขียนสำเร็จ (กลไกเดียวกับ action/REST ของ CRM — `wakeOutbox` หลัง commit · ไม่เคยทำให้คำขอล้ม) · ระบายหลังตอบแล้ว (after) = หน้านี้ไม่ช้าลง ◂
  } catch {
    // ล้มแล้วยังตอบหน้าเดิม (ไม่บอกอะไรเกี่ยวกับ token)
  }
  return new Response(DONE_HTML, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/** GET = ไม่ทำอะไร — ชี้ผู้ใช้ไปหน้ายืนยันที่มีปุ่มกดจริง */
export async function GET(): Promise<Response> {
  return new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
}
