import { NextResponse } from "next/server";
import { resolveUnit, guestBill } from "@/lib/modules/restaurant/storefront";
import { checkRateLimit } from "@/lib/core/rate-limit";

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
