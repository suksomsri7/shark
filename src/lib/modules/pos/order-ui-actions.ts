"use server";
// order-ui-actions.ts — POS P2.8U เปลือกบางเพิ่มเติมของจอออเดอร์ทุกช่องทาง (deviation ของใบ U · สัญญา S ไม่มี action ตัวนี้)
//   ordersChannelsAction — ช่องทางของสาขา (listChannels ของ P2.1 · ด่านอ่าน pos.sale.read | pos.sale.create) + ค่าตั้งรับออเดอร์ 3 คอลัมน์ของ P2.8
//     (autoAccept · prepMinutes · pausedUntil) — รางซ้ายต้องรู้สวิตช์ "รับอัตโนมัติ" · เวลาเตรียมปริยาย · แบนเนอร์/ชิป "ปิดรับถึง" ของทุกคน
//     (แคชเชียร์ที่ไม่มี pos.order.accept ก็ต้องเห็นแบนเนอร์) · setChannelOrderSettingsAction คืนมุมมองนี้เฉพาะช่องที่แก้ และต้องมีสิทธิ์รับออเดอร์
//   อ่านอย่างเดียว · ไม่มีตัวเขียนใหม่ (ผู้เขียน 4 คอลัมน์ P2.8 ของ SalesChannel = pos/order.ts เท่านั้น)
// 🔴 "use server" export เฉพาะ async function · คำปฏิเสธคืนเป็นข้อมูล {ok:false, code, message} · ร้าน/ผู้ใช้มาจาก session เท่านั้น

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { listChannels } from "./channel";
import { prisma } from "./db";
import type { ChannelItem } from "./channel-shared";

type Target = { systemId: string; unitId: string; deviceId?: string };
type OrdersChannelRow = ChannelItem & { autoAccept: boolean; prepMinutes: number | null; pausedUntil: string | null };
type Refusal = { ok: false; code: string; message: string };

/** ช่องทางของสาขา (ที่ยังไม่เก็บ) + ค่าตั้งรับออเดอร์ของ P2.8 — ลำดับเดียวกับ listChannels */
export async function ordersChannelsAction(args: Target): Promise<{ ok: true; items: OrdersChannelRow[] } | Refusal> {
  try {
    const auth = await requireTenant();
    const systemId = typeof args?.systemId === "string" ? args.systemId : "";
    const unitId = typeof args?.unitId === "string" ? args.unitId : "";
    if (!systemId || !unitId) return { ok: false, code: "NOT_FOUND", message: "ไม่พบสาขานี้" };
    const m = posMembership(auth.active);
    if (!canAccessUnit(m, unitId)) return { ok: false, code: "NOT_FOUND", message: "ไม่พบสาขานี้" };
    // ด่านชั้นแรกจาก session = ด่านอ่านของจอ (pos.sale.read | pos.sale.create ที่สาขา) · listChannels ตรวจซ้ำกับ DB
    const allowed = ["pos.sale.read", "pos.sale.create"].some((action) => {
      try {
        assertCan(m, { module: "pos", action, unitId });
        return true;
      } catch {
        return false;
      }
    });
    if (!allowed) return { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์ดูออเดอร์ — ขอสิทธิ์จากเจ้าของร้าน" };
    const ctx = { tenantId: auth.active.tenantId, systemId, unitId };
    const actor = { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions };
    // ด่านอ่าน + สร้างช่องทางพื้นฐานครั้งแรก = ของ P2.1 (listChannels ตรวจระบบ/สาขา/สิทธิ์ซ้ำกับ DB)
    const l = await listChannels(ctx, actor);
    if (!l.ok) return { ok: false, code: l.code, message: l.message };
    const ids = l.items.map((c) => c.id);
    const rows = ids.length
      ? await prisma.salesChannel.findMany({ where: { tenantId: ctx.tenantId, unitId, id: { in: ids } }, select: { id: true, autoAccept: true, prepMinutes: true, pausedUntil: true } })
      : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    return {
      ok: true,
      items: l.items.map((c) => {
        const r = byId.get(c.id);
        return { ...c, autoAccept: r?.autoAccept ?? false, prepMinutes: r?.prepMinutes ?? null, pausedUntil: r?.pausedUntil ? r.pausedUntil.toISOString() : null };
      }),
    };
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos/order-ui-actions] ordersChannelsAction", e);
    return { ok: false, code: "INTERNAL", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
  }
}
