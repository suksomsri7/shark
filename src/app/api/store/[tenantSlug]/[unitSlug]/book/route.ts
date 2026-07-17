import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveUnit, getAvailableSlots, createAppointment } from "@/lib/modules/booking/service";

const schema = z.object({
  serviceId: z.string().min(1),
  staffId: z.string().min(1), // "any" = ใครก็ได้
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startMin: z.number().int().min(0).max(1439),
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(6).max(20),
  note: z.string().trim().max(300).optional(),
  idempotencyKey: z.string().trim().min(1).max(100).optional(), // กันยิงซ้ำ/ดับเบิลคลิก
});

// POST จองนัด (public)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantSlug: string; unitSlug: string }> },
) {
  const { tenantSlug, unitSlug } = await params;
  const resolved = await resolveUnit(tenantSlug, unitSlug);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const b = parsed.data;

  const { id: tenantId } = resolved.tenant;
  const { id: unitId } = resolved.unit;

  // แก้ "ใครก็ได้" → เลือก staff ที่ว่างจริงในเวลานั้น
  let staffId = b.staffId;
  if (staffId === "any") {
    const slots = await getAvailableSlots(tenantId, unitId, b.serviceId, null, b.date);
    const match = slots.find((s) => s.startMin === b.startMin);
    if (!match) return NextResponse.json({ error: "slot_taken" }, { status: 409 });
    staffId = match.staffId;
  }

  const res = await createAppointment({
    tenantId,
    unitId,
    serviceId: b.serviceId,
    staffId,
    dateStr: b.date,
    startMin: b.startMin,
    customerName: b.name,
    customerPhone: b.phone,
    note: b.note,
    source: "ONLINE",
    idempotencyKey: b.idempotencyKey,
  });
  if (!res.ok) return NextResponse.json({ error: "unavailable", reason: res.reason }, { status: 409 });
  return NextResponse.json({ ok: true, id: res.id });
}
