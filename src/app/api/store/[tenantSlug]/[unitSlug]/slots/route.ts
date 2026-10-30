import { NextResponse } from "next/server";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { resolveSettings } from "@/lib/core/settings";
import { resolveUnit, findSlots } from "@/lib/modules/booking/service";

// GET ช่องเวลาว่าง (public) ?serviceId=&staffId=&date=YYYY-MM-DD  (staffId=any = ใครก็ได้)
// SVC B.7: findSlots ช่อง ONLINE ของ B.3 (horizon · lead · % ออนไลน์ — ช่าง 0% ไม่โผล่) · rate limit บนฐาน (ข้ามเครื่อง) นับก่อนค้นฐาน
export async function GET(
  req: Request,
  { params }: { params: Promise<{ tenantSlug: string; unitSlug: string }> },
) {
  const { tenantSlug, unitSlug } = await params;
  const url = new URL(req.url);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 100) || "unknown";
  const rl = await checkRateLimitDb(`bq:slots:${String(tenantSlug).slice(0, 120)}/${String(unitSlug).slice(0, 120)}:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 60) } });
  }
  const serviceId = url.searchParams.get("serviceId") ?? "";
  const staffParam = url.searchParams.get("staffId") ?? "any";
  const date = url.searchParams.get("date") ?? "";
  if (!serviceId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const resolved = await resolveUnit(tenantSlug, unitSlug);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const ctx = { tenantId: resolved.tenant.id, unitId: resolved.unit.id };
  // O10: ช่างที่ร้านซ่อนชื่อ (customerCanChoose=false) ⇒ ระบุตรง ๆ ไม่ได้ · คำตอบไม่มี id ช่าง (ใครก็ได้ไม่เปิดเผยว่าใครว่าง)
  if (staffParam !== "any") {
    const cc = await resolveSettings({ tenantId: ctx.tenantId }, ["booking.staff.customerCanChoose"], { unitId: ctx.unitId, staffId: staffParam });
    if (cc["booking.staff.customerCanChoose"]?.value === false) return NextResponse.json({ slots: [] });
  }
  const slots = await findSlots(
    ctx,
    { serviceId, staffId: staffParam === "any" ? null : staffParam, dateStr: date, channel: "ONLINE" },
  );
  return NextResponse.json({ slots: slots.map((s) => ({ startMin: s.startMin, hhmm: s.hhmm })) });
}
