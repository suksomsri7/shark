import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveUnit, placeGuestOrder } from "@/lib/modules/restaurant/storefront";

const schema = z.object({
  qrToken: z.string().min(1),
  guestToken: z.string().max(64).optional(),
  note: z.string().trim().max(300).optional(),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        qty: z.number().int().min(1).max(50),
        note: z.string().trim().max(200).optional(),
        choiceIds: z.array(z.string()).max(20).default([]),
      }),
    )
    .min(1)
    .max(50),
});

// POST — ลูกค้าสั่งอาหารผ่าน QR (public, ไม่ต้อง login)
export async function POST(req: Request, { params }: { params: Promise<{ tenantSlug: string; unitSlug: string }> }) {
  const { tenantSlug, unitSlug } = await params;
  const resolved = await resolveUnit(tenantSlug, unitSlug);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const b = parsed.data;

  const res = await placeGuestOrder({
    tenantId: resolved.tenant.id,
    unitId: resolved.unit.id,
    qrToken: b.qrToken,
    guestToken: b.guestToken,
    note: b.note,
    cart: b.items.map((i) => ({ menuItemId: i.menuItemId, qty: i.qty, note: i.note, choiceIds: i.choiceIds })),
  });

  if (res.ok) return NextResponse.json({ ok: true, dailyNo: res.dailyNo });
  const status = res.err.code === "KITCHEN_CLOSED" ? 422 : res.err.code === "SESSION_GONE" ? 410 : 409;
  return NextResponse.json({ error: res.err.code, reason: res.err.reason, itemIds: "itemIds" in res.err ? res.err.itemIds : undefined }, { status });
}
