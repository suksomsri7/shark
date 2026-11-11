// SVC B.7 — ไฟล์ปฏิทิน (.ics) ของนัด · GET /bq/m/<token>/ics — token ใช้ไม่ได้ทุกกรณี ⇒ 404 body เดียว · ไม่มีชื่อ/เบอร์ลูกค้า
import { loadManageIcs } from "@/lib/modules/booking/online";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ics = await loadManageIcs(token, { ip });
  if (ics === null) {
    return new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="booking.ics"',
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
