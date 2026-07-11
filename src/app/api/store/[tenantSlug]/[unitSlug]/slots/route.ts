import { NextResponse } from "next/server";
import { resolveUnit, getAvailableSlots } from "@/lib/modules/booking/service";

// GET ช่องเวลาว่าง (public) ?serviceId=&staffId=&date=YYYY-MM-DD  (staffId=any = ใครก็ได้)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ tenantSlug: string; unitSlug: string }> },
) {
  const { tenantSlug, unitSlug } = await params;
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId") ?? "";
  const staffParam = url.searchParams.get("staffId") ?? "any";
  const date = url.searchParams.get("date") ?? "";
  if (!serviceId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const resolved = await resolveUnit(tenantSlug, unitSlug);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const slots = await getAvailableSlots(
    resolved.tenant.id,
    resolved.unit.id,
    serviceId,
    staffParam === "any" ? null : staffParam,
    date,
  );
  return NextResponse.json({ slots });
}
