import { tracking } from "@/lib/modules/crm";

// GET /l/<code> — ลิงก์ติดตามของ CRM (ใบ C2.6 · R-C.7 · ภาพ 11)
//
// 🔴 AUDIT-CLASS X6 (open redirect): ปลายทางมาจาก **แถวในฐานของรหัสนั้นตัวเดียว** — `?url=` `?to=` `?redirect=` `?next=`
//    ในคำขอถูกมองข้ามทั้งหมด (url ถูกตรวจว่าเป็น http/https จริงตั้งแต่ตอนสร้าง)
// 🔴 AUDIT-CLASS X7: รหัสที่ไม่รู้จัก / ลิงก์ที่ปิด / ลิงก์ที่หมดอายุ ได้ **คำตอบเดียวกันทุกไบต์** (302 ไปหน้าแรกของ SHARK
//    · ไม่มีคุกกี้ · ไม่มีเนื้อความ) ⇒ ไม่มีเครื่องมือไล่เดารหัสลิงก์ของร้านอื่น
// 🔴 คุกกี้ `sd_u=1` ผูก Path=/l/<code> · HttpOnly · Secure — เป็นแค่ธง "เคยนับเป็นคนใหม่แล้ว" ไม่มีตัวระบุตัวตนอยู่ในค่า
// 🔴 ร้านที่ยัง uiVersion 1 ยัง redirect เหมือนเดิม (QR ที่พิมพ์ไปแล้วต้องไม่ตาย) แต่ไม่นับอะไร · บอท/เต็มเพดานก็เช่นกัน
// 🔴 ต้องเรียกผ่าน facade `@/lib/modules/crm` เท่านั้น (fitness F2.3 จงใจไม่ยกเว้นโฟลเดอร์ `/l/*`)

export const dynamic = "force-dynamic";

const ipOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";
/** ค่า header เป็น ByteString — url ที่มีอักขระนอก latin1 (ไทย/จีน) ต้องเข้ารหัสก่อน ไม่งั้นสร้าง Response ไม่ได้เลย */
const headerSafe = (url: string) => (/^[ -~]*$/.test(url) ? url : encodeURI(url));

function redirect(location: string, setCookie?: string): Response {
  const headers = new Headers({ Location: headerSafe(location), "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" });
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return new Response(null, { status: 302, headers });
}

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  try {
    const { code } = await params;
    const clean = String(code ?? "");
    if (!clean) return redirect(tracking.LINK_FALLBACK_URL);
    const cookie = req.headers.get("cookie") ?? "";
    const hit = await tracking.resolveLinkHit(clean, {
      ip: ipOf(req),
      userAgent: req.headers.get("user-agent") ?? "",
      hasUniqueCookie: /(?:^|;\s*)sd_u=/.test(cookie),
    });
    if (!hit) return redirect(tracking.LINK_FALLBACK_URL);
    return redirect(hit.url, tracking.linkUniqueCookie(hit.code));
  } catch {
    return redirect(tracking.LINK_FALLBACK_URL);
  }
}
