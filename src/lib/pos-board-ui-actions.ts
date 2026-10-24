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
// POS P4.3 ▸ F-P3-21 · CD-P43-O7r: posBoardCardsAction รับกุญแจ `pos-86:` (การ์ดสินค้าหมดนาน) และ `pos-refund:` (การ์ดคืนเงินลูกค้า) ด้วย — ชิปของจอขาย ·
//   ออเดอร์ · บิล · ด่านต่อกุญแจ: สาขาในกุญแจ (86) / สาขาของออเดอร์ (คืนเงิน) ต้องผูกระบบนี้ และผู้ใช้มีสิทธิ์ที่สาขานั้น ◂

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
// POS P4.3 ▸ F-P3-21 · CD-P43-O7r: กุญแจของตัวกวาดบอร์ด (sweepPosBoard) — 86 = posBoardKeys.soldOut(unit, product, mark) · คืนเงิน = posBoardKeys.refund(order)
//   "pos-86:<unit>:<product>:" (posBoardKeys.soldOutPrefix · ไม่มี mark) = 86 ที่ค้างอยู่ตอนนี้ของสินค้านั้น (จอขายไม่รู้ id ของ mark) — แปลงเป็นกุญแจเต็มจาก PosAvailabilityMark ◂
const SOLD_OUT_PREFIX = "pos-86:";
const REFUND_PREFIX = "pos-refund:";
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** สิทธิ์ที่เห็นชิปการ์ด 86 ที่สาขา (ผู้ขาย หรือผู้จัดการสินค้า) */
const canSoldOut = (m: MembershipCtx, unitId: string) => can(m, "pos.sale.create", unitId) || can(m, "pos.product.manage", unitId);
/** สิทธิ์ที่เห็นชิปการ์ดคืนเงินของออเดอร์ที่สาขา (รับ/ปฏิเสธออเดอร์ หรือขาย/ดูบิล) */
const canRefund = (m: MembershipCtx, unitId: string) =>
  can(m, "pos.order.accept", unitId) || can(m, "pos.order.reject", unitId) || can(m, "pos.sale.create", unitId) || can(m, "pos.sale.read", unitId);

/** ด่านสิทธิ์ต่อสาขา — boolean ล้วน (กฎ P1.6-R2) */
function can(m: MembershipCtx, action: string, unitId: string): boolean {
  return evaluate(m, { module: "pos", action, unitId });
}

/**
 * CD-P38U-2 — การ์ดที่มีอยู่แล้วของแถวจุดผิดปกติ (กุญแจ posBoardKeys.anomaly) · กุญแจที่ไม่มีการ์ด = ไม่อยู่ในผล
 * POS P4.3 ▸ F-P3-21 · CD-P43-O7r: + กุญแจ 86 (posBoardKeys.soldOut / soldOutPrefix) และคืนเงิน (posBoardKeys.refund) — กุญแจที่ไม่ผ่านด่านของสาขา = ตัดทิ้งเงียบ ๆ
 *   (ไม่บอกว่ามีการ์ดไหม) · ผลของกุญแจ prefix คืนเป็นกุญแจเต็ม (จอแยกสินค้าจากกุญแจ) ◂
 */
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
    const soldOutNow: { unitId: string; productId: string }[] = []; // POS P4.3 ▸ กุญแจแบบ prefix (ไม่มี mark) ◂
    const refundOrders: { key: string; orderId: string }[] = []; // POS P4.3 ▸ ตรวจสาขาของออเดอร์หลังอ่าน ◂
    for (const k of raw) {
      if (keys.length + soldOutNow.length + refundOrders.length >= MAX_KEYS) break;
      if (typeof k !== "string" || k.length > 300 || keys.includes(k)) continue;
      if (k.startsWith(ANOMALY_PREFIX)) {
        // pos-anomaly:<rule>:<unitId>:<date>:<ref>
        const unitId = k.split(":")[2] ?? "";
        if (!linked.has(unitId) || !can(m, REPORT_PERMISSION, unitId) || !can(m, ANOMALY_PERMISSION, unitId)) continue;
        keys.push(k);
      } else if (k.startsWith(SOLD_OUT_PREFIX)) {
        // POS P4.3 ▸ pos-86:<unitId>:<productId>:<markId> (เต็ม) หรือ pos-86:<unitId>:<productId>: (ค้างอยู่ตอนนี้) — สาขาในกุญแจ ◂
        const [, unitId = "", productId = "", markId, ...rest] = k.split(":");
        if (rest.length || !ID_RE.test(unitId) || !ID_RE.test(productId) || !linked.has(unitId) || !canSoldOut(m, unitId)) continue;
        if (markId === "") soldOutNow.push({ unitId, productId });
        else if (markId !== undefined && ID_RE.test(markId)) keys.push(k);
      } else if (k.startsWith(REFUND_PREFIX)) {
        // POS P4.3 ▸ pos-refund:<orderId> — สาขาของออเดอร์ (อ่านด้านล่าง) ◂
        const orderId = k.slice(REFUND_PREFIX.length);
        if (ID_RE.test(orderId) && !refundOrders.some((r) => r.key === k)) refundOrders.push({ key: k, orderId });
      }
    }
    if (soldOutNow.length) {
      const marks = await prisma.posAvailabilityMark.findMany({
        where: { tenantId, systemId: sys.id, OR: soldOutNow.map((x) => ({ unitId: x.unitId, productId: x.productId })) },
        select: { id: true, unitId: true, productId: true },
      });
      for (const mk of marks) keys.push(posBoardKeys.soldOut(mk.unitId, mk.productId, mk.id));
    }
    if (refundOrders.length) {
      const orders = await prisma.posOrder.findMany({ where: { tenantId, systemId: sys.id, id: { in: refundOrders.map((r) => r.orderId) } }, select: { id: true, unitId: true } });
      for (const o of orders) if (linked.has(o.unitId) && canRefund(m, o.unitId)) keys.push(posBoardKeys.refund(o.id));
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
