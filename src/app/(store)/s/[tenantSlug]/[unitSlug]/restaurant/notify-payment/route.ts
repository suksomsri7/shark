import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveUnit, notifyPromptpayPayment } from "@/lib/modules/restaurant/storefront";
import { checkRateLimit } from "@/lib/core/rate-limit";
import { posLinkedLegacyDoor, posLinkedBody } from "@/lib/modules/pos/legacy-door"; // POS P2.14 ▸ LEG-1 มติ 1: สาขาที่ผูก POS = ประตูเดิมปิด (409 + ประตูใหม่) ◂

const schema = z.object({ qrToken: z.string().min(1) });

// POST — ลูกค้าแจ้งว่าสแกนจ่ายพร้อมเพย์แล้ว → ส่งสัญญาณให้ร้านยืนยันรับเงิน (public, login-free)
// rate limit 6 ครั้ง/นาที/ip + dedup 2 นาทีใน createServiceRequest → ร้านไม่โดนสแปม
export async function POST(req: Request, { params }: { params: Promise<{ tenantSlug: string; unitSlug: string }> }) {
  const { tenantSlug, unitSlug } = await params;
  const resolved = await resolveUnit(tenantSlug, unitSlug);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const rl = checkRateLimit(`rest-notify-pay:${resolved.unit.id}:${ip}`, { limit: 6, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 60) } });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // POS P2.14 ▸ LEG-1 มติ 1: สาขาที่ผูก POS ⇒ ประตูเดิมของแขกปิด (409 POS_LINKED + ประตูใหม่ /q/t/<qrToken>) ก่อนเรียก storefront ·
  //   ไม่เปิด session/ไม่สร้างรอบ/ไม่สร้างคำขอ · ค้นไม่ได้ = ปิด (fail-closed · ทางนี้เขียนข้อมูล) · สาขาไม่ผูก POS = ทางเดิมทุกบรรทัด
  if (await posLinkedLegacyDoor(resolved.tenant.id, resolved.unit.id, { write: true })) return NextResponse.json(posLinkedBody(parsed.data.qrToken), { status: 409 });
  // ◂
  const res = await notifyPromptpayPayment(resolved.tenant.id, resolved.unit.id, parsed.data.qrToken);
  return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "failed", reason: res.reason }, { status: 409 });
}
