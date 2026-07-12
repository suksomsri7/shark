import { NextResponse } from "next/server";
import { resolveUnit, resolveTableSession, tableStatusForGuest } from "@/lib/modules/restaurant/storefront";

// GET ?qrToken= — สถานะโต๊ะ + ออเดอร์รวมโต๊ะ (สำหรับ polling ฝั่งลูกค้า)
export async function GET(req: Request, { params }: { params: Promise<{ tenantSlug: string; unitSlug: string }> }) {
  const { tenantSlug, unitSlug } = await params;
  const qrToken = new URL(req.url).searchParams.get("qrToken") ?? "";
  const resolved = await resolveUnit(tenantSlug, unitSlug);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const sess = await resolveTableSession(resolved.tenant.id, resolved.unit.id, qrToken);
  if (!sess.ok) return NextResponse.json({ error: "session", reason: sess.reason }, { status: 410 });
  const status = await tableStatusForGuest(resolved.tenant.id, resolved.unit.id, sess.sessionId);
  if (!status) return NextResponse.json({ error: "session" }, { status: 410 });

  return NextResponse.json({
    ok: true,
    sessionId: sess.sessionId,
    tableName: status.tableName,
    memberLinked: status.memberLinked,
    subtotalSatang: status.subtotalSatang,
    serviceChargeSatang: status.serviceChargeSatang,
    totalSatang: status.totalSatang,
    hasBillRequest: status.hasBillRequest,
    hasCallRequest: status.hasCallRequest,
    orders: status.orders.map((o) => ({
      dailyNo: o.dailyNo,
      items: o.items.map((it) => ({
        name: it.nameSnapshot,
        qty: it.qty,
        options: it.options.map((op) => op.choiceSnapshot),
        kdsStatus: it.kdsStatus,
        lineTotalSatang: it.lineTotal,
      })),
    })),
  });
}
