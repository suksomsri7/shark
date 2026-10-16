import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveUnit, resolveTableSession } from "@/lib/modules/restaurant/storefront";
import { createServiceRequest } from "@/lib/modules/restaurant/order";
import { checkRateLimit } from "@/lib/core/rate-limit";
import { posLinkedLegacyDoor, posLinkedBody } from "@/lib/modules/pos/legacy-door"; // POS P2.14 ▸ LEG-1 มติ 1: สาขาที่ผูก POS = ประตูเดิมปิด (409 + ประตูใหม่) ◂

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

  // กันยิงถล่ม — 10 ครั้ง/นาที/IP ต่อสาขา (public ไม่ต้องล็อกอิน)
  const rlIp = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const rl = checkRateLimit(`resto-call:${resolved.unit.id}:${rlIp}`, { limit: 10, windowMs: 60000 });
  if (!rl.ok)
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 60) } },
    );

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const b = parsed.data;

  // POS P2.14 ▸ LEG-1 มติ 1: สาขาที่ผูก POS ⇒ ประตูเดิมของแขกปิด (409 POS_LINKED + ประตูใหม่ /q/t/<qrToken>) ก่อนเรียก storefront ·
  //   ไม่เปิด session/ไม่สร้างรอบ/ไม่สร้างคำขอ · ค้นไม่ได้ = ปิด (fail-closed · ทางนี้เขียนข้อมูล) · สาขาไม่ผูก POS = ทางเดิมทุกบรรทัด
  if (await posLinkedLegacyDoor(resolved.tenant.id, resolved.unit.id, { write: true })) return NextResponse.json(posLinkedBody(b.qrToken), { status: 409 });
  // ◂
  const sess = await resolveTableSession(resolved.tenant.id, resolved.unit.id, b.qrToken);
  if (!sess.ok) return NextResponse.json({ error: "session", reason: sess.reason }, { status: 410 });

  const res = await createServiceRequest(resolved.tenant.id, resolved.unit.id, sess.sessionId, b.type, b.note);
  return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "failed", reason: res.reason }, { status: 409 });
}
