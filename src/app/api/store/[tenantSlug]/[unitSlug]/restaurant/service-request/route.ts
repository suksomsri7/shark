import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveUnit, resolveTableSession } from "@/lib/modules/restaurant/storefront";
import { createServiceRequest } from "@/lib/modules/restaurant/order";

const schema = z.object({
  qrToken: z.string().min(1),
  type: z.enum(["CALL_STAFF", "REQUEST_BILL"]),
  note: z.string().trim().max(200).optional(),
});

// POST — ลูกค้าเรียกพนักงาน / ขอเช็คบิล (public)
export async function POST(req: Request, { params }: { params: Promise<{ tenantSlug: string; unitSlug: string }> }) {
  const { tenantSlug, unitSlug } = await params;
  const resolved = await resolveUnit(tenantSlug, unitSlug);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const b = parsed.data;

  const sess = await resolveTableSession(resolved.tenant.id, resolved.unit.id, b.qrToken);
  if (!sess.ok) return NextResponse.json({ error: "session", reason: sess.reason }, { status: 410 });

  const res = await createServiceRequest(resolved.tenant.id, resolved.unit.id, sess.sessionId, b.type, b.note);
  return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "failed", reason: res.reason }, { status: 409 });
}
