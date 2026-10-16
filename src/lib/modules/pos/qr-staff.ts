// qr-staff.ts — ตัวอ่านฝั่งพนักงานของ QR (POS P2.7U · §5) — อ่านอย่างเดียว ไม่เขียนตารางใด
//   qrTableRounds: รอบที่แขกสั่งเองผ่าน QR โต๊ะ (placedByUserId null) ของวันนี้ที่สาขา → การ์ดจอ 09 (แถว "หน้าร้าน QR N") · เปิดโต๊ะจากการ์ด = /pos/tables?open=<session>
//   qrTableTokens: QR ของทุกโต๊ะที่ไม่เก็บถาวร (แผงโต๊ะ + แผ่นพิมพ์ A4) · เปลี่ยน QR = registerRotateTableQr (P2.7 S · restaurant.table.rotateQr)
//   🔴 สิทธิ์ = ด่านหน้าขาย (pos.sale.read | pos.sale.create ที่สาขา · registerScopeFor) · อ่านแถวร้านอาหารตรง (อ่านอย่างเดียว · แบบ qr-order.legacyTableQrRedirect)

import { evaluate } from "@/lib/core/rbac";
import { prisma } from "./db";
import { registerScopeFor } from "./register";
import { receiptShopHeader } from "./receipt";
import type { RegisterActor, RegisterCtx } from "./register-shared";
import type { QrTableRoundCard, QrTableRoundsResult, QrTablesResult } from "./qr-staff-shared";

const VIEW = ["pos.sale.read", "pos.sale.create"] as const;
const bad = (r: { code: string; message?: string }) => ({ ok: false as const, code: r.code, message: r.message ?? "" });

/** วันนี้ตามเวลาไทย [00:00, 24:00) เป็น UTC */
function bkkDayStart(now: Date): Date {
  const d = new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  return new Date(new Date(`${d}T00:00:00Z`).getTime() - 7 * 3_600_000);
}

/** รอบ QR โต๊ะของวันนี้ (ใหม่สุด 200 รอบ) — ไม่รวมรอบที่ถูกยกเลิกทั้งรอบ */
export async function qrTableRounds(ctx: RegisterCtx, actor: RegisterActor): Promise<QrTableRoundsResult> {
  try {
    const sc = await registerScopeFor(ctx, actor, VIEW);
    if (!sc.ok) return bad(sc);
    const now = new Date();
    const rows = await prisma.restaurantOrder.findMany({
      where: { tenantId: sc.ctx.tenantId, unitId: sc.ctx.unitId, type: "DINE_IN", placedByUserId: null, sessionId: { not: null }, createdAt: { gte: bkkDayStart(now) }, status: { not: "CANCELLED" } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
      select: {
        id: true,
        dailyNo: true,
        createdAt: true,
        session: { select: { id: true, status: true, tableId: true, table: { select: { name: true } } } },
        items: { select: { qty: true, lineTotal: true, kdsStatus: true } },
      },
    });
    const rounds: QrTableRoundCard[] = [];
    for (const r of rows) {
      if (!r.session) continue;
      const live = r.items.filter((i) => i.kdsStatus !== "CANCELLED");
      if (!live.length) continue;
      const done = live.filter((i) => i.kdsStatus === "READY" || i.kdsStatus === "SERVED").length;
      const served = live.every((i) => i.kdsStatus === "SERVED");
      rounds.push({
        orderId: r.id,
        sessionId: r.session.id,
        tableId: r.session.tableId,
        tableName: r.session.table.name,
        dailyNo: r.dailyNo,
        at: r.createdAt.toISOString(),
        itemCount: live.length,
        qtyCount: live.reduce((s, i) => s + i.qty, 0),
        totalSatang: live.reduce((s, i) => s + i.lineTotal, 0),
        done,
        total: live.length,
        column: served ? "done" : done === live.length ? "ready" : "preparing",
        sessionOpen: r.session.status === "OPEN",
      });
    }
    return { ok: true, rounds: rounds.reverse(), at: now.toISOString() };
  } catch (e) {
    console.error("[pos/qr-staff] qrTableRounds", e);
    return { ok: false, code: "INTERNAL", message: "" };
  }
}

/** QR ของโต๊ะทุกตัวที่ไม่เก็บถาวรของสาขา (เรียงโซน → ชื่อ) + ชื่อร้าน/สาขา (หัวแผ่นพิมพ์) + เปลี่ยน QR ได้ไหม */
export async function qrTableTokens(ctx: RegisterCtx, actor: RegisterActor): Promise<QrTablesResult> {
  try {
    const sc = await registerScopeFor(ctx, actor, VIEW);
    if (!sc.ok) return bad(sc);
    const [tables, head] = await Promise.all([
      prisma.restaurantTable.findMany({
        where: { tenantId: sc.ctx.tenantId, unitId: sc.ctx.unitId, archivedAt: null },
        orderBy: [{ zone: { sortOrder: "asc" } }, { name: "asc" }, { id: "asc" }],
        take: 500,
        select: { id: true, name: true, zoneId: true, qrToken: true, status: true, zone: { select: { name: true } } },
      }),
      receiptShopHeader(prisma, sc.ctx.tenantId, sc.ctx.systemId, sc.ctx.unitId).catch(() => null),
    ]);
    return {
      ok: true,
      tables: tables.map((t) => ({ tableId: t.id, name: t.name, zoneId: t.zoneId, zoneName: t.zone.name, qrToken: t.qrToken, active: t.status === "ACTIVE" })),
      shopName: head?.shopName ?? sc.unitName,
      unitName: head?.branchName || sc.unitName,
      canRotate: evaluate(sc.actor, { module: "restaurant", action: "restaurant.table.rotateQr", unitId: sc.ctx.unitId }),
    };
  } catch (e) {
    console.error("[pos/qr-staff] qrTableTokens", e);
    return { ok: false, code: "INTERNAL", message: "" };
  }
}
