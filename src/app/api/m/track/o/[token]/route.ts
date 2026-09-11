import { prisma } from "@/lib/core/db";
import { trackOpen } from "@/lib/modules/marketing";

// GET /api/m/track/o/<token>.gif — รูปจุดเดียว 1×1 ที่ฝังท้ายอีเมลแคมเปญ (M3.2)
//
// 🔴 ต้องตอบรูปเสมอ ไม่ว่าจะนับได้หรือไม่: token ผิด/ผู้รับถูกลบ/นับไปแล้ว → ยังคืน gif เปล่า
//    (ตอบ 404 = กล่องอีเมลของลูกค้าขึ้นรูปแตกกลางข้อความที่ร้านส่งไปเอง)
// 🔴 เส้นนี้เปิดสาธารณะโดยจำเป็น (ไคลเอนต์อีเมลเรียกโดยไม่มี session) ⇒ token ต้องมีลายเซ็น
//    (`openToken()` = "<id>.<hmac 16 ตัว>") ไม่งั้นใครก็ยิงนับ "เปิดอ่าน" ให้แคมเปญคนอื่นได้
// 🔴 ไม่มีแคช: ผู้ให้บริการอีเมลบางรายแคชรูปแทนลูกค้า ⇒ สั่ง no-store ทุกครั้ง

export const dynamic = "force-dynamic";

// gif โปร่งใส 1×1 (43 ไบต์) — คงที่ ไม่ต้องสร้างใหม่ทุกคำขอ
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

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = String(token ?? "").replace(/\.gif$/i, "");
  const recipientId = clean.split(".")[0] ?? "";
  if (!recipientId) return gif();

  try {
    // ไคลเอนต์อีเมลไม่มี session ⇒ หา "ร้านของผู้รับใบนี้" ก่อน แล้วให้ตัวนับตรวจลายเซ็นอีกชั้น
    const rec = await prisma.mktRecipient.findUnique({ where: { id: recipientId }, select: { tenantId: true } });
    if (rec) await trackOpen(rec.tenantId, clean);
  } catch {
    // นับไม่ได้ = ตัวเลขรายงานขาดไป 1 ครั้ง — ห้ามทำให้รูปในอีเมลของลูกค้าแตก
  }
  return gif();
}
