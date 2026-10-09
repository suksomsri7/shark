// POS P1.8 ▸ ตัวรับคิว `pos.sale.refunded` (มติ R7) — ลงทะเบียนบรรทัดเดียวใน outbox-consumers.ts (ครอบ withAutomation · โหลดแบบ dynamic) ◂
//
// ลำดับ (ทุกขั้น idempotent · เล่นซ้ำได้ไม่จำกัด):
//   0. รอคิวปิดบิล: event `pos.sale.paid` ของบิลเดิมยัง PENDING = โยน (คิวลองใหม่) ⇒ ฝั่งบัญชี/สมาชิกเห็นการขายก่อนการคืนเสมอ
//   1. บัญชี: บิลเดิมยังไม่มี JV ขาย (pos.sale.paid ข้ามเพราะคืนครบก่อนคิววิ่ง ⇒ REFUNDED) = ลงแทน (ล้ม = log เดินต่อ · F8)
//      แล้วใบลดหนี้ + JV กลับรายการตามสัดส่วน (bridgePosSaleRefunded → account.applyExternalRefund · ไม่ผูกบัญชี = จบเงียบ · ล้ม = โยน)
//   2. คลัง (O12): บรรทัด restock === true ที่มี OUT ของบิลเดิม → รับคืนที่ "ต้นทุน/คลัง/ล็อตของ OUT เดิม" คีย์ pos-refund-<refundSaleId>-<refundLineId>[-<invItemId>]
//      (มีคำว่า refund ⇒ สะพานคลัง→บัญชีลง Dr1200/Cr5000) · restock false/null = ไม่มี movement (ต้นทุนขายคงอยู่ = ความเสียหาย)
//   3. สมาชิก (member-bridges.onPosSaleRefunded): แต้ม/ยอดสะสม/ตรา/ระดับ — ล้ม = WARN (บิล/บัญชีไม่กระทบ · แบบ memberSaleBridge)
// 🔴 ขั้น 1–2 ล้ม ⇒ โยนท้ายสุด (คิวลองใหม่ · ทางที่ REVIEW #10 ขอ) หลังวิ่งทุกขั้นครบแล้ว · voidSale เดิมไม่เปลี่ยน
// 🔴 CRM/บอร์ดงาน: ไม่แตะในใบนี้ (ไฟล์ร้อนของ CRM) — follow-up ของ session CRM
import type { OutboxHandler } from "@/lib/core/outbox";
import { logOps } from "@/lib/core/ops";
import * as inventory from "@/lib/modules/inventory/service";
import { systemForUnit } from "@/lib/modules/system/service";
import { prisma } from "./db";
import { applyExternalChannelCommission, posSalePosted } from "@/lib/modules/account";
import { saleChannelName } from "./channel"; // POS P2.1 ◂
import { bridgePosSaleCommission, bridgePosSalePaid, bridgePosSaleRefunded } from "./account-bridge";
import { lineConsumption } from "./service";

type Evt = Parameters<OutboxHandler>[0];

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
function errCode(e: unknown): string {
  for (let cur: unknown = e, d = 0; cur && typeof cur === "object" && d < 5; d++) {
    const o = cur as { code?: unknown; cause?: unknown };
    if (typeof o.code === "string" && o.code) return o.code;
    cur = o.cause;
  }
  return e instanceof Error ? e.name : "unknown";
}

export const posSaleRefunded: OutboxHandler = async (evt: Evt) => {
  const p = (evt.payload && typeof evt.payload === "object" ? evt.payload : {}) as Record<string, unknown>;
  const refundSaleId = str(p.refundSaleId);
  if (!refundSaleId) return;
  const refund = await prisma.posSale.findFirst({
    where: { id: refundSaleId, tenantId: evt.tenantId, docType: "REFUND" },
    include: { lines: { orderBy: { id: "asc" } }, payments: { orderBy: { id: "asc" } } },
  });
  if (!refund?.refSaleId) return;
  const sale = await prisma.posSale.findFirst({
    where: { id: refund.refSaleId, tenantId: evt.tenantId },
    include: { lines: { orderBy: { id: "asc" } }, payments: { orderBy: { id: "asc" } } },
  });
  if (!sale) return;
  const full = typeof p.full === "boolean" ? p.full : sale.status === "REFUNDED";

  // 0. ขายก่อนคืนเสมอ
  const paidEvt = await prisma.outboxEvent.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: evt.tenantId, idempotencyKey: `PosSale#${sale.id}#PAID` } },
    select: { status: true },
  });
  if (paidEvt?.status === "PENDING") throw new Error("รอคิวปิดบิลของบิลเดิม (pos.sale.paid) ก่อนบันทึกการคืนเงิน — ลองใหม่อัตโนมัติ");

  const errors: unknown[] = [];
  const origById = new Map(sale.lines.map((l) => [l.id, l]));

  // 1a. บัญชีของบิลเดิม (F8): ลงแทนเฉพาะเมื่อ pos.sale.paid ข้ามไปจริง (ยังไม่มี JV PosSale#<saleId>#PAID — เช่นคืนครบก่อนคิวปิดบิลวิ่ง ⇒ บิล REFUNDED)
  //   ขั้นนี้ล้ม = log แล้วเดินต่อ — ห้ามขวางการลงใบลดหนี้ของใบคืน
  if (!sale.giftCardId && sale.docType === "SALE") {
    try {
      const posted = await posSalePosted({ tenantId: evt.tenantId, sourceSystemId: sale.systemId, refId: sale.id });
      if (posted === false) {
        await bridgePosSalePaid(sale, sale.payments, sale.lines.reduce((n, l) => n + (l.serviceId ? l.lineTotalSatang : 0), 0), {
          lines: sale.lines.map((l) => ({ name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, discountSatang: l.discountSatang, lineTotalSatang: l.lineTotalSatang, itemId: l.itemId })),
          customer: null,
        });
      }
    } catch (e) {
      console.error("[pos] refund: ลงบัญชีบิลเดิมแทนคิวปิดบิลไม่สำเร็จ — ลงใบลดหนี้ต่อ", { saleId: sale.id, refundSaleId: refund.id, code: errCode(e) });
    }
    // POS P2.1 ▸ fix round 1 (รีวิว F1) — บิลมี PAID แล้วแต่ขั้น COMMISSION ยังไม่ลง (ล้มหลัง PAID แล้วบิลถูกคืนครบ ⇒ คิวปิดบิลไม่วิ่งซ้ำ) ◂
    //   ลง COMMISSION ของบิลก่อน 1c เสมอ (idempotent ต่อคีย์ · ไม่มี PAID = facade ไม่ลง · ไม่มีค่าคอมฯ = ไม่มี query)
    //   ล้ม = โยนท้ายสุด ⇒ คิวลองใหม่ (1c ข้ามเพราะยังไม่มี COMMISSION ⇒ ไม่มีวันกลับค่าคอมฯ ที่ไม่เคยลง)
    try {
      await bridgePosSaleCommission(sale);
    } catch (e) {
      errors.push(e);
    }
  }

  // POS P2.1 ▸ ชื่อช่องทางของใบคืน (ผู้ติดต่อลูกหนี้แพลตฟอร์ม + memo) — อ่านเฉพาะใบที่มี PLATFORM/ส่วนแบ่งค่าคอมฯ ◂
  const shareC = Math.max(0, refund.channelCommissionSatang);
  const shareV = Math.max(0, refund.channelCommissionVatSatang);
  const channelName =
    refund.payments.some((x) => x.type === "PLATFORM") || shareC + shareV > 0 ? await saleChannelName(prisma, evt.tenantId, refund.channelId, refund.channelCode) : null;

  // 1b. ใบลดหนี้ + JV ของใบคืน — ยอด 0 (F4) = ไม่มีเงินให้ลง · ล้ม (≠ ไม่ผูกบัญชี) = โยน ⇒ คิวลองใหม่ (ห้ามเตือนแล้วจบ)
  try {
    if (refund.grandTotalSatang > 0) {
      const serviceGross = refund.lines.reduce((n, l) => n + (l.serviceId ? l.lineTotalSatang : 0), 0);
      const res = await bridgePosSaleRefunded(
        refund,
        sale.id,
        refund.lines.map((l) => ({ name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, discountSatang: l.discountSatang, lineTotalSatang: l.lineTotalSatang, itemId: l.itemId })),
        refund.payments,
        serviceGross,
        channelName,
      );
      if (res.reason && res.reason !== "unlinked" && !res.docId) throw new Error(`[บัญชี] ใบคืน POS ${refund.id}: ไม่บันทึกใบลดหนี้ — ${res.reason}`);
    }
  } catch (e) {
    errors.push(e);
  }

  // POS P2.1 ▸ 1c. R9: กลับค่าคอมฯ ช่องทางตามส่วนแบ่งของใบคืน (คีย์ PosSale#<ใบคืน>#COMMISSION_REFUNDED · ล้ม = โยน ⇒ ลองใหม่) ◂
  try {
    if (shareC + shareV > 0 && refund.channelPayout) {
      await applyExternalChannelCommission({
        tenantId: evt.tenantId,
        sourceSystemId: refund.systemId,
        refId: refund.id,
        occurredAt: refund.paidAt ?? refund.createdAt,
        commissionSatang: shareC,
        commissionVatSatang: shareV,
        payout: refund.channelPayout,
        channelName: channelName ?? "",
        receiptNo: refund.receiptNo,
        reverse: true,
        saleRefId: sale.id, // fix round 1 (F1 F3): กลับได้เฉพาะเมื่อบิลมี COMMISSION · ผู้ติดต่อ = ของ PAID ◂
      });
    }
  } catch (e) {
    errors.push(e);
  }

  // 2. คลัง — รับคืนที่ต้นทุนของ OUT เดิม (O12)
  try {
    const wanted = refund.lines.filter((l) => l.restock === true && l.refLineId && origById.has(l.refLineId));
    if (wanted.length) {
      const invSystemId = await systemForUnit(evt.tenantId, sale.unitId, "INVENTORY");
      if (invSystemId) {
        const invCtx = { tenantId: evt.tenantId, systemId: invSystemId };
        // ส่วนที่ต้องคืนต่อบรรทัดใบคืน = ส่วนตัดของบรรทัดเดิม (lineConsumption · ตัวกำหนดเดียวกับตอนขาย) ตามจำนวนที่คืน
        //   บรรทัดชั่งคืนทั้งบรรทัด (กรัมเดิม) · ชุดคืนส่วนประกอบ qty × จำนวนชุดที่คืน
        const parts = wanted.flatMap((rl) => {
          const ol = origById.get(rl.refLineId!)!;
          const mine = lineConsumption("", { id: ol.id, itemId: ol.itemId, qty: rl.qty, weightGrams: ol.weightGrams, components: ol.components });
          const orig = lineConsumption(sale.id, { id: ol.id, itemId: ol.itemId, qty: ol.qty, weightGrams: ol.weightGrams, components: ol.components });
          // ลำดับเดียวกันเสมอ (บรรทัดผูกคลังก่อน แล้วส่วนประกอบตามลำดับ) ⇒ จับคู่ด้วยตำแหน่ง
          return mine.map((x, i) => ({
            itemId: x.itemId,
            qty: x.qty,
            outKey: orig[i]!.key,
            key: ol.itemId && i === 0 ? `pos-refund-${refund.id}-${rl.id}` : `pos-refund-${refund.id}-${rl.id}-${x.itemId}`,
          }));
        });
        const outs = await prisma.invMovement.findMany({
          where: { tenantId: evt.tenantId, type: "OUT", idempotencyKey: { in: parts.map((x) => x.outKey) } },
          select: { idempotencyKey: true, itemId: true, costSatang: true, locationId: true, lotCode: true },
        });
        const outOf = new Map(outs.map((m) => [m.idempotencyKey, m]));
        for (const part of parts) {
          const out = outOf.get(part.outKey);
          if (!out || out.itemId !== part.itemId) continue; // ไม่เคยตัดสต็อก (ไม่ผูกคลัง/ตัดล้ม) = ไม่มีอะไรให้คืน
          try {
            await inventory.receive(invCtx, {
              itemId: part.itemId,
              qty: part.qty,
              costSatang: out.costSatang, // O12: ต้นทุนของการตัดเดิม ไม่ใช่ถัวเฉลี่ยปัจจุบัน
              // F9: คืนเข้าคลัง/ล็อตเดียวกับที่ตัดออก (หลายคลังไม่เพี้ยน) · OUT แถว legacy ไม่มีคลัง = คลัง default
              locationId: out.locationId,
              lotCode: out.lotCode,
              idempotencyKey: part.key,
              sourceModule: "POS",
              refType: "PosSale",
              refId: refund.id,
              note: `รับคืนจากใบคืนเงิน ${refund.receiptNo ?? refund.id}`,
            });
          } catch (e) {
            // HF-INV-1 R3.3 ▸ ทิ้งร่องรอย (ไม่มีข้อมูลลูกค้า) แล้วให้คิวลองใหม่ (คีย์เดิมไม่รับซ้ำ) ◂
            console.error("[pos] refund restock failed — event will retry", { refundSaleId: refund.id, itemId: part.itemId, qty: part.qty, code: errCode(e) });
            errors.push(e);
          }
        }
      }
    }
  } catch (e) {
    errors.push(e);
  }

  // 3. สมาชิก (ของแถม · ล้ม = WARN)
  if (sale.memberId) {
    try {
      const bridges = await import("@/lib/member-bridges");
      await bridges.onPosSaleRefunded(evt.tenantId, refund.id, full);
    } catch (e) {
      await logOps("WARN", "member", `สะพานสมาชิกของ "${evt.type}" ล้มเหลว (ใบคืน ${refund.id}) — ใบคืนและบัญชีไม่กระทบ`, {
        tenantId: evt.tenantId,
        detail: e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 500) : String(e).slice(0, 500),
      });
    }
  }

  if (errors.length) throw errors[0];
};
