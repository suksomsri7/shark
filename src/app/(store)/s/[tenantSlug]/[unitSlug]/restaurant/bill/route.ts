import { NextResponse } from "next/server";
import { resolveUnit, guestBill } from "@/lib/modules/restaurant/storefront";
import { checkRateLimit } from "@/lib/core/rate-limit";
import { posLinkedLegacyDoor, posLinkedBody } from "@/lib/modules/pos/legacy-door"; // POS P2.14 ▸ LEG-1 มติ 1: สาขาที่ผูก POS = ประตูเดิมปิด (409 + ประตูใหม่) ◂

// GET ?qrToken= — บิลฝั่งลูกค้า + payload PromptPay ยอดรวม (public, login-free)
// rate limit 30 ครั้ง/นาที/ip (ลูกค้ากดดูบิลถี่ ๆ ได้ แต่กันถล่ม)
export async function GET(req: Request, { params }: { params: Promise<{ tenantSlug: string; unitSlug: string }> }) {
  const { tenantSlug, unitSlug } = await params;
  const resolved = await resolveUnit(tenantSlug, unitSlug);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const rl = checkRateLimit(`rest-bill:${resolved.unit.id}:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 60) } });
  }

  const qrToken = new URL(req.url).searchParams.get("qrToken") ?? "";
  // POS P2.14 ▸ LEG-1 มติ 1: สาขาที่ผูก POS ⇒ ประตูเดิมของแขกปิด (409 POS_LINKED + ประตูใหม่ /q/t/<qrToken>) ก่อนเรียก storefront ·
  //   ไม่เปิด session/ไม่สร้างรอบ/ไม่สร้างคำขอ · ค้นไม่ได้ = ปิด (fail-closed · ทางนี้เขียนข้อมูล) · สาขาไม่ผูก POS = ทางเดิมทุกบรรทัด
  if (await posLinkedLegacyDoor(resolved.tenant.id, resolved.unit.id, { write: true })) return NextResponse.json(posLinkedBody(qrToken), { status: 409 });
  // ◂
  const bill = await guestBill(resolved.tenant.id, resolved.unit.id, qrToken);
  if (!bill.ok) return NextResponse.json({ error: "session", reason: bill.reason }, { status: 410 });

  return NextResponse.json({
    ok: true,
    tableName: bill.tableName,
    lines: bill.lines.map((l) => ({ name: l.name, qty: l.qty, lineTotalSatang: l.lineTotalSatang })),
    subtotalSatang: bill.subtotalSatang,
    serviceChargeSatang: bill.serviceChargeSatang,
    totalSatang: bill.totalSatang,
    promptpayPayload: bill.promptpayPayload,
    promptpayName: bill.promptpayName,
  });
}
