import { NextResponse } from "next/server";
import { bookOnline } from "@/lib/modules/booking/online";
import { scheduleDrain } from "@/lib/outbox-consumers";

// POST จองนัด (public) — SVC B.7: กติกาจองของ B.3 ผ่าน bookOnline (กันจองซ้อนข้ามโพรเซส · rate limit บนฐาน · ลิงก์ตัวตน LINE)
//   200 { ok, manageUrl, status, startMs, holdUntilMs, depositSatang } · ไม่มี id นัด/ชื่อ/เบอร์ในคำตอบ (X8)
//   RATE_LIMITED ⇒ 429 (+Retry-After) · NOT_FOUND ⇒ 404 · BAD_INPUT ⇒ 400 · อื่น ⇒ 409 · body ไม่ใช่ JSON ⇒ 400
export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantSlug: string; unitSlug: string }> },
) {
  const { tenantSlug, unitSlug } = await params;
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const body = (await req.json().catch(() => undefined)) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, code: "BAD_INPUT", reason: "ข้อมูลการจองไม่ครบหรือไม่ถูกต้อง กรุณาลองใหม่" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const r = await bookOnline(
    { tenantSlug, unitSlug },
    {
      serviceId: b.serviceId as string,
      staffId: (b.staffId === "any" || b.staffId === "" || b.staffId === undefined ? null : b.staffId) as string | null,
      dateStr: (b.dateStr ?? b.date) as string,
      startMin: b.startMin as number,
      ...(b.name !== undefined ? { name: b.name as string } : {}),
      ...(b.phone !== undefined ? { phone: b.phone as string } : {}),
      ...(b.note !== undefined ? { note: b.note as string } : {}),
      ...(b.idempotencyKey !== undefined ? { idempotencyKey: b.idempotencyKey as string } : {}),
      ...(b.who !== undefined ? { who: b.who as string } : {}),
    },
    { ip },
  );
  if (r.ok) {
    scheduleDrain();
    return NextResponse.json(r);
  }
  const status = r.code === "RATE_LIMITED" ? 429 : r.code === "NOT_FOUND" ? 404 : r.code === "BAD_INPUT" ? 400 : 409;
  return NextResponse.json(
    { ok: false, code: r.code, reason: r.reason },
    { status, ...(status === 429 ? { headers: { "Retry-After": "60" } } : {}) },
  );
}
