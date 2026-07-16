import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveUnit, createOrder } from "@/lib/modules/shop/service";
import { checkRateLimit } from "@/lib/core/rate-limit";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(4).max(20),
  note: z.string().trim().max(300).optional(),
  lines: z
    .array(z.object({ productId: z.string().min(1), qty: z.number().int().min(1).max(999) }))
    .min(1)
    .max(50),
});

// POST สร้างออเดอร์ (public) — rate limit 10 ออเดอร์/นาที/ip
export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantSlug: string; unitSlug: string }> },
) {
  const { tenantSlug, unitSlug } = await params;
  const resolved = await resolveUnit(tenantSlug, unitSlug);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const rl = checkRateLimit(`shop-order:${resolved.unit.id}:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 60) } },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const b = parsed.data;

  const ctx = { tenantId: resolved.tenant.id, unitId: resolved.unit.id };
  try {
    const order = await createOrder(ctx, {
      customerName: b.name,
      customerPhone: b.phone,
      note: b.note,
      lines: b.lines,
    });
    return NextResponse.json({ ok: true, code: order.code, totalSatang: order.totalSatang });
  } catch (e) {
    return NextResponse.json(
      { error: "order_failed", message: e instanceof Error ? e.message : "สร้างออเดอร์ไม่สำเร็จ" },
      { status: 400 },
    );
  }
}
