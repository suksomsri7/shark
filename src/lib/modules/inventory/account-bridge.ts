// account-bridge.ts — ตัวเชื่อม InvMovement → บัญชีต้นทุน (perpetual inventory)
// mirror pos/account-bridge.ts: เรียก account ผ่าน facade (account/index) เท่านั้น
//   — chokepoint inventory→account (F2.2) · ห้าม import account/gl หรือ account/service ตรง
// เลือกบัญชี Dr/Cr ตามชนิด movement + ที่มา (ตาราง WO) · value = |qtyDelta| × costSatang ของ movement
//   (valuation source = movement ledger เดียว — receive เก็บ inCost, consume/refund เก็บต้นทุนถัวเฉลี่ย ณ ตอนนั้น)
// ⚠️ ระบบ ACCOUNT ต้อง resolve ที่ service (มี tenantDb) แล้วส่ง accountSystemId เข้ามา — ไม่มี = ข้ามเงียบ

import { postInventoryGl } from "@/lib/modules/account";

// โมดูลฝั่งขาย (ตัดสต็อกเป็นต้นทุนขาย) → receive จากโมดูลเหล่านี้ = คืนสต็อก (refund) กลับ COGS
const SALE_MODULES = new Set(["ECOM", "CLINIC"]);

export type MovementForGl = {
  id: string;
  type: string; // InvMovementType: "IN" | "OUT" | "ADJUST" | "TRANSFER"
  qtyDelta: number; // + รับเข้า / − ตัดออก
  costSatang: number; // ต้นทุนต่อหน่วยของ movement (source of valuation)
  sourceModule: string | null;
  idempotencyKey: string;
  createdAt: Date;
};

type Plan = { drCode: string; crCode: string; event: "RECEIVE" | "CONSUME"; memo: string };

// map movement → คู่บัญชี Dr/Cr (คืน null = ไม่โพสต์: adjust/transfer/มูลค่า 0 — out of scope)
function planFor(mv: MovementForGl): Plan | null {
  const amount = Math.abs(mv.qtyDelta) * mv.costSatang;
  if (amount <= 0) return null;

  if (mv.type === "OUT") {
    // ตัดสต็อกขาย → Dr 5000 ต้นทุนขาย / Cr 1200 สินค้าคงเหลือ
    return { drCode: "5000", crCode: "1200", event: "CONSUME", memo: "ต้นทุนขาย (perpetual)" };
  }
  if (mv.type === "IN") {
    const src = (mv.sourceModule ?? "").trim();
    // ซื้อเข้า (procurement) → Dr 1200 / Cr 2100 เจ้าหนี้การค้า
    if (src === "procurement") return { drCode: "1200", crCode: "2100", event: "RECEIVE", memo: "รับสินค้าเข้าคลัง (เจ้าหนี้การค้า)" };
    // คืนสต็อก (refund จากฝั่งขาย) → Dr 1200 / Cr 5000 (กลับต้นทุนขาย)
    const isRefund = SALE_MODULES.has(src) || mv.idempotencyKey.includes("refund");
    if (isRefund) return { drCode: "1200", crCode: "5000", event: "RECEIVE", memo: "รับคืนสินค้าเข้าคลัง (กลับต้นทุนขาย)" };
    // รับเข้าอื่น (manual/opening) → Dr 1200 / Cr 3000 ทุนเจ้าของ (นำสินค้าเข้ากิจการ)
    return { drCode: "1200", crCode: "3000", event: "RECEIVE", memo: "นำสินค้าเข้ากิจการ" };
  }
  // ADJUST / TRANSFER → ข้าม (out of scope — ไม่กระทบต้นทุน/ไม่มีบัญชีผลต่างการนับ)
  return null;
}

/**
 * โพสต์บัญชีต้นทุนของ 1 movement (perpetual) ผ่าน account facade
 * accountSystemId = null (ไม่มีระบบ ACCOUNT) → ข้ามเงียบ ๆ (inventory ทำงาน standalone ได้)
 * idempotent ที่ชั้น gl (InvMovement#id#event) — เรียกซ้ำด้วย movement เดิม ไม่โพสต์เบิ้ล
 */
export async function bridgeInventoryMovement(
  accountSystemId: string | null,
  tenantId: string,
  mv: MovementForGl,
): Promise<{ posted: boolean; reason?: string }> {
  if (!accountSystemId) return { posted: false, reason: "no-account-system" };
  const plan = planFor(mv);
  if (!plan) return { posted: false, reason: "out-of-scope" };

  const res = await postInventoryGl(
    { tenantId, systemId: accountSystemId },
    {
      movementId: mv.id,
      event: plan.event,
      date: mv.createdAt,
      drCode: plan.drCode,
      crCode: plan.crCode,
      amountSatang: Math.abs(mv.qtyDelta) * mv.costSatang,
      memo: plan.memo,
    },
  );
  return { posted: "entryId" in res };
}
