"use server";
// pos-board-ui-actions.ts — ตัวอ่านชิป "การ์ด #n" ของแถวรายงานจุดผิดปกติ (POS P3.8U ▸ CD-P38U-2 · CD-P38U-7 ◂)
//
// 🔴 ทำไมอยู่ที่ราก src/lib (ไม่ใช่ modules/pos): qc-pos-p3.8 ST1 ห้าม modules/pos/** import pos-board-* (ทิศกลับ) — composition root แบบ pos-board-actions.ts
//    (CD-P38U-2 ฉบับร่าง · ผู้คุมย้ายไป modules/pos/board-ui-actions.ts แล้ว ST1 แดง ⇒ CONTROLLER-DECISION CD-P38U-B1 ใน wo-notes)
// เปลือกบางแบบ ai-panel-actions.ts: session → ระบบ POS ของร้านนี้ → กรองกุญแจ → posCardsForKeys (pos-board-bridges · ตัวอ่านอย่างเดียว)
// 🔴 ไม่มีพฤติกรรมเซิร์ฟเวอร์ใหม่: posCardsForKeys ไม่มีด่านสิทธิ์ข้างใน ⇒ ด่านอยู่ที่นี่ — เฉพาะกุญแจ `pos-anomaly:` ของสาขาที่ผูกระบบนี้
//    และผู้ใช้มี pos.report.view + pos.report.anomaly ที่สาขานั้น (evaluate คืน boolean · ไม่ throw) · ไม่เกิน 200 กุญแจ
// 🔴 "use server" export ได้เฉพาะ async function · ชนิดผลลัพธ์อยู่ในไฟล์นี้ (ไม่ export) — จอใช้ Awaited<ReturnType<…>>
// 🔴 ไม่มี throw · คำปฏิเสธคืนเป็นข้อมูล {ok:false, code} · ผลไม่มีชื่อคน (key · cardNo · href · completed)
// POS P4.3 ▸ F-P3-21 (CD-P43-O7): + posOpsCardsAction — ชิปการ์ด 86 (`pos-86:`) / คืนเงิน (`pos-refund:`) ของจอขาย · ออเดอร์ · บิล (ด่านต่อสาขาในตัว) ◂

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { posMembership } from "@/lib/modules/pos/access";
import { prisma } from "@/lib/core/db";
import { ANOMALY_PERMISSION, REPORT_PERMISSION } from "@/lib/modules/pos/reports";
import { posCardsForKeys } from "./pos-board-bridges";
import { posBoardKeys } from "@/lib/modules/pos/board-settings-shared"; // POS P4.3 ▸ F-P3-21: กุญแจการ์ด 86 / คืนเงิน ◂

type CardChip = { key: string; cardNo: number | null; href: string; completed: boolean };
type CardsResult = { ok: true; cards: CardChip[] } | { ok: false; code: "NOT_FOUND" | "UNKNOWN" };

const ANOMALY_PREFIX = "pos-anomaly:";
const MAX_KEYS = 200;

/** ด่านสิทธิ์ต่อสาขา — boolean ล้วน (กฎ P1.6-R2) */
function can(m: MembershipCtx, action: string, unitId: string): boolean {
  return evaluate(m, { module: "pos", action, unitId });
}

/** CD-P38U-2 — การ์ดที่มีอยู่แล้วของแถวจุดผิดปกติ (กุญแจ posBoardKeys.anomaly) · กุญแจที่ไม่มีการ์ด = ไม่อยู่ในผล */
export async function posBoardCardsAction(args: { systemId: string; keys: string[] }): Promise<CardsResult> {
  try {
    const auth = await requireTenant();
    const tenantId = auth.active.tenantId;
    const m = posMembership(auth.active);
    const systemId = typeof args?.systemId === "string" ? args.systemId : "";
    const sys = systemId ? await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS" }, select: { id: true } }) : null;
    if (!sys) return { ok: false, code: "NOT_FOUND" };
    const linked = new Set((await prisma.appSystemUnit.findMany({ where: { tenantId, systemId: sys.id, type: "POS" }, select: { unitId: true } })).map((r) => r.unitId));
    const raw = Array.isArray(args?.keys) ? args.keys : [];
    const keys: string[] = [];
    for (const k of raw) {
      if (keys.length >= MAX_KEYS) break;
      if (typeof k !== "string" || !k.startsWith(ANOMALY_PREFIX) || k.length > 300 || keys.includes(k)) continue;
      // pos-anomaly:<rule>:<unitId>:<date>:<ref>
      const unitId = k.split(":")[2] ?? "";
      if (!linked.has(unitId) || !can(m, REPORT_PERMISSION, unitId) || !can(m, ANOMALY_PERMISSION, unitId)) continue;
      keys.push(k);
    }
    if (keys.length === 0) return { ok: true, cards: [] };
    const cards = await posCardsForKeys(tenantId, keys);
    return { ok: true, cards: cards.map((c) => ({ key: c.key, cardNo: c.cardNo, href: c.href, completed: c.completed })) };
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos-board-ui-actions] cards", e);
    return { ok: false, code: "UNKNOWN" };
  }
}

// ═══════════ POS P4.3 ▸ F-P3-21 · CD-P38U-9 · CD-P43-O7: ชิปการ์ด 86 / คืนเงินบนจอขาย · ออเดอร์ · บิล ◂ ═══════════
type OpsCardChip = CardChip & { kind: "SOLD_OUT" | "REFUND"; ref: string };
type OpsCardsResult = { ok: true; cards: OpsCardChip[] } | { ok: false; code: "NOT_FOUND" | "UNKNOWN" };
const OPS_MAX = 100;
const isRef = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64 && /^[A-Za-z0-9_-]+$/.test(v);
const refsOf = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter(isRef))].slice(0, OPS_MAX) : []);

/**
 * การ์ดบอร์ดงานที่ระบบเปิดให้ของสาขาหนึ่ง (ตัวกวาด sweepPosBoard · อ่านอย่างเดียว · ไม่มีการ์ด = ไม่อยู่ในผล):
 *   productIds → การ์ด "สินค้าหมดนาน" ของ 86 ที่ยังค้างอยู่ (`pos-86:<unit>:<product>:<markId>` จาก PosAvailabilityMark ปัจจุบัน) — ผู้ขายได้/จัดการสินค้าได้ที่สาขา ·
 *   orderIds / saleIds → การ์ด "คืนเงินลูกค้า" ของออเดอร์ (`pos-refund:<orderId>` · saleIds = ออเดอร์ที่ผูกบิลนั้น) — ออเดอร์ต้องเป็นของระบบ+สาขานี้ ·
 *   ผู้ใช้ต้องรับ/ปฏิเสธออเดอร์ หรือขาย/ดูบิลได้ที่สาขา
 * 🔴 posCardsForKeys ไม่มีด่านข้างใน ⇒ ด่านอยู่ที่นี่ (evaluate boolean) · ผลไม่มีชื่อคน (kind · ref · cardNo · href · completed) · หน้าบอร์ดตรวจสิทธิ์เองเมื่อกดลิงก์
 */
export async function posOpsCardsAction(args: { systemId: string; unitId: string; productIds?: string[]; orderIds?: string[]; saleIds?: string[] }): Promise<OpsCardsResult> {
  try {
    const auth = await requireTenant();
    const tenantId = auth.active.tenantId;
    const m = posMembership(auth.active);
    const systemId = typeof args?.systemId === "string" ? args.systemId : "";
    const unitId = typeof args?.unitId === "string" ? args.unitId : "";
    const sys = systemId && unitId ? await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS" }, select: { id: true } }) : null;
    const link = sys ? await prisma.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId, unitId, type: "POS" } }, select: { systemId: true } }) : null;
    if (!sys || !link || link.systemId !== sys.id) return { ok: false, code: "NOT_FOUND" };
    const want: { key: string; kind: OpsCardChip["kind"]; ref: string }[] = [];
    // 86: mark ที่ยังค้างของสินค้าที่ขอ (สินค้าคืนขายแล้ว = ไม่มี mark = ไม่มีชิป · การ์ดที่ตัวกวาดปิดแล้วไม่ถูกถาม)
    const productIds = refsOf(args?.productIds);
    if (productIds.length && (can(m, "pos.sale.create", unitId) || can(m, "pos.product.manage", unitId))) {
      const marks = await prisma.posAvailabilityMark.findMany({ where: { tenantId, systemId: sys.id, unitId, productId: { in: productIds } }, select: { id: true, productId: true } });
      for (const mk of marks) want.push({ key: posBoardKeys.soldOut(unitId, mk.productId, mk.id), kind: "SOLD_OUT", ref: mk.productId });
    }
    // คืนเงิน: ออเดอร์ของระบบ+สาขานี้ (ตาม id หรือบิลที่ผูก)
    const orderIds = refsOf(args?.orderIds);
    const saleIds = refsOf(args?.saleIds);
    const canOrders = can(m, "pos.order.accept", unitId) || can(m, "pos.order.reject", unitId) || can(m, "pos.sale.create", unitId) || can(m, "pos.sale.read", unitId);
    if ((orderIds.length || saleIds.length) && canOrders) {
      const orders = await prisma.posOrder.findMany({
        where: { tenantId, systemId: sys.id, unitId, OR: [...(orderIds.length ? [{ id: { in: orderIds } }] : []), ...(saleIds.length ? [{ saleId: { in: saleIds } }] : [])] },
        select: { id: true, saleId: true },
        take: OPS_MAX * 2,
      });
      for (const o of orders) {
        if (orderIds.includes(o.id)) want.push({ key: posBoardKeys.refund(o.id), kind: "REFUND", ref: o.id });
        if (o.saleId && saleIds.includes(o.saleId)) want.push({ key: posBoardKeys.refund(o.id), kind: "REFUND", ref: o.saleId });
      }
    }
    if (want.length === 0) return { ok: true, cards: [] };
    const cards = new Map((await posCardsForKeys(tenantId, [...new Set(want.map((w) => w.key))])).map((c) => [c.key, c]));
    const out: OpsCardChip[] = [];
    for (const w of want) {
      const c = cards.get(w.key);
      if (c) out.push({ key: c.key, kind: w.kind, ref: w.ref, cardNo: c.cardNo, href: c.href, completed: c.completed });
    }
    return { ok: true, cards: out };
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos-board-ui-actions] ops cards", e);
    return { ok: false, code: "UNKNOWN" };
  }
}
