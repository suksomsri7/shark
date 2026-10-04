// account-bridge.ts — ตัวแปลง PosSale → บัญชี (อยู่ในโมดูล pos)
// เรียก account ผ่าน facade (account/index) เท่านั้น — ตาม chokepoint pos→account (F2.2)
// ⚠️ ห้าม import pos/service (กันวงวน import) — consumer อ่าน PosSale ผ่าน prisma ตรงแล้วส่งเข้ามา
// WO-0002: map ประเภทการชำระของ POS → ช่องทางเงินฝั่งบัญชี แล้วส่งให้ facade

import type { PosPayType } from "@prisma/client";
import { applyExternalSale, reverseExternalSale } from "@/lib/modules/account";

// PosPayType → ช่องทางเงินฝั่งบัญชี (passthrough — WO-0040a เลิกยุบ DEPOSIT/ROOM_CHARGE)
//   CASH → เงินสด (1000) · PROMPTPAY/TRANSFER → ธนาคาร (1010)
//   DEPOSIT → ลูกค้าใช้เงินมัดจำที่วางไว้ → Dr 2110 เงินมัดจำรับ (ลดหนี้สิน)
//   ROOM_CHARGE → ลงบิลห้องยังไม่จ่าย → Dr 1100 ลูกหนี้
function channelOf(type: PosPayType): "CASH" | "TRANSFER" | "PROMPTPAY" | "DEPOSIT" | "ROOM_CHARGE" {
  switch (type) {
    case "CASH":
      return "CASH";
    case "PROMPTPAY":
      return "PROMPTPAY";
    case "DEPOSIT":
      return "DEPOSIT";
    case "ROOM_CHARGE":
      return "ROOM_CHARGE";
    default:
      return "TRANSFER";
  }
}

type SaleForBridge = {
  id: string;
  tenantId: string;
  systemId: string;
  grandTotalSatang: number;
  paidAt: Date | null;
  createdAt: Date;
  receiptNo?: string | null;
  /** POS P1.6: ค่าบริการ (อยู่ในยอดบิล = รายได้ในฐาน VAT) · ทิป (นอกยอดบิล · ไม่ใช่รายได้) — ไม่ส่ง = 0 */
  serviceChargeSatang?: number;
  tipSatang?: number;
};

/** บรรทัดบิลที่ consumer อ่านมาจาก PosSaleLine (WO 4.2) */
export type SaleLineForBridge = {
  name: string;
  qty: number;
  unitPriceSatang: number;
  discountSatang: number;
  lineTotalSatang: number;
  itemId: string | null;
};

/** ลูกค้าของบิล (Customer ของระบบสมาชิก) — ไม่มี = ลูกค้าเดินเข้าร้าน */
export type SaleCustomerForBridge = {
  memberId?: string | null;
  partyId?: string | null;
  name?: string | null;
  phone?: string | null;
};

// เกลี่ย "ส่วนลดท้ายบิล/คูปอง" ลงบรรทัดตามสัดส่วนยอดบรรทัด (largest remainder — ผลรวมตรงเป๊ะ)
// 🔴 ทำไมต้องเกลี่ย: บัญชีรับบรรทัดได้ก็ต่อเมื่อ Σ บรรทัด = ยอดบิลเป๊ะ · PosSale เก็บส่วนลดท้ายบิลไว้ที่หัวบิล
//    ถ้าส่งดิบ ๆ บิลที่มีส่วนลด/คูปองจะถูกปฏิเสธทั้งใบ (เงินยังเข้า GL แต่ไม่มีเอกสาร = รายงานสินค้าโหว่)
function allocateBillDiscount(weights: number[], total: number): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sumW <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sumW);
  const out = raw.map((r) => Math.floor(r));
  let rem = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; rem > 0 && order.length > 0; k++, rem--) out[order[k % order.length].i] += 1;
  return out;
}

/**
 * POS P1.6 — ทิปอยู่ในเงินที่รับ (Σจ่าย = ยอดบิล + ทิป) แต่ไม่ใช่รายได้: หักทิปออกจากแถวจ่ายจากท้ายขึ้นมา ⇒ ขา Dr = ยอดบิลเป๊ะ
 * (การลงบัญชีพักทิปเป็นหนี้สินพนักงาน = งานต่อ · ดูโน้ต P1.6 คำถามเปิด) · ไม่มีทิป = แถวเดิมทุกตัว
 */
function withoutTip<T extends { amountSatang: number }>(payments: T[], tip: number): T[] {
  if (tip <= 0) return payments;
  const out = payments.map((p) => ({ ...p }));
  let rest = tip;
  for (let i = out.length - 1; i >= 0 && rest > 0; i--) {
    const cut = Math.min(rest, out[i].amountSatang);
    out[i].amountSatang -= cut;
    rest -= cut;
  }
  return out.filter((p) => p.amountSatang > 0);
}

/** ขาย POS สำเร็จ → post บัญชี (ผ่าน facade) */
export async function bridgePosSalePaid(
  sale: SaleForBridge,
  payments: { type: PosPayType; amountSatang: number }[],
  /** ยอดรวมของบรรทัดที่เป็นบริการ — แยกลงบัญชีรายได้ค่าบริการ (4030) · 0/ไม่ส่ง = ขายสินค้าทั้งบิล */
  serviceGrossSatang = 0,
  /** WO 4.2 (MAP §F.13) — บรรทัด + ลูกค้าของบิล · ไม่ส่ง = พฤติกรรมเดิม (ยอดรวมอย่างเดียว) */
  detail?: { lines?: SaleLineForBridge[]; customer?: SaleCustomerForBridge | null },
): Promise<{ posted: boolean; reason?: string; docId?: string }> {
  const gross = sale.grandTotalSatang;
  // POS P1.6 ▸ ค่าบริการเป็นบรรทัดหนึ่งของเอกสาร (Σ บรรทัด = ยอดบิล) · ทิปไม่ใช่รายได้ ⇒ หักออกจากขา Dr ให้ JV ลงตัวที่ยอดบิล ◂
  const serviceCharge = Math.max(0, sale.serviceChargeSatang ?? 0);
  const src0 = detail?.lines ?? [];
  const src: SaleLineForBridge[] =
    serviceCharge > 0 && src0.length > 0
      ? [...src0, { name: "ค่าบริการ", qty: 1, unitPriceSatang: serviceCharge, discountSatang: 0, lineTotalSatang: serviceCharge, itemId: null }]
      : src0;
  const pays = withoutTip(payments, Math.max(0, sale.tipSatang ?? 0));
  // ส่วนลดท้ายบิล = Σ บรรทัด − ยอดสุทธิ (เก็บที่หัวบิลใน PosSale.discountSatang รวมคูปองแล้ว)
  const lineSum = src.reduce((n, l) => n + l.qty * l.unitPriceSatang - l.discountSatang, 0);
  const billDiscount = lineSum - gross;
  const alloc =
    billDiscount > 0 ? allocateBillDiscount(src.map((l) => Math.max(0, l.lineTotalSatang)), billDiscount) : src.map(() => 0);
  // ส่งบรรทัดเฉพาะบิลที่ "เกลี่ยแล้วลงตัว" — บิลแปลก (ยอดติดลบ/ส่วนลดเกิน) ถอยไปเส้นเดิมแทนที่จะถูกปฏิเสธ
  const lines =
    src.length > 0 && gross > 0 && billDiscount >= 0
      ? src.map((l, i) => ({
          itemId: l.itemId,
          name: l.name,
          qty: l.qty,
          unitPriceSatang: l.unitPriceSatang,
          discountSatang: l.discountSatang + alloc[i],
        }))
      : undefined;

  const res = await applyExternalSale({
    tenantId: sale.tenantId,
    sourceSystemId: sale.systemId,
    refId: sale.id,
    occurredAt: sale.paidAt ?? sale.createdAt,
    grossSatang: gross,
    // clamp: ส่วนลดท้ายบิลอาจทำให้ยอดบริการ (ก่อนลด) มากกว่ายอดสุทธิ — กันไม่ให้เกินทั้งบิล
    serviceGrossSatang: Math.min(serviceGrossSatang, gross),
    payMethods: pays.map((p) => ({ channel: channelOf(p.type), amountSatang: p.amountSatang })),
    lines,
    customer: detail?.customer ?? undefined,
    receiptNo: sale.receiptNo ?? null,
  });
  // บรรทัดถูกปฏิเสธ (ยอดไม่ตรง/ข้อมูลเพี้ยน) — เงินยังเข้า GL ตามปกติ · เตือนเป็นภาษาไทย **ห้ามมีข้อมูลลูกค้าใน log**
  if (lines && res.reason && res.reason !== "unlinked" && !res.docId)
    console.warn(`[บัญชี] บิล POS ${sale.id}: ไม่บันทึกบรรทัดสินค้าเข้าบัญชี — ${res.reason}`);
  return res;
}

/** void บิล POS → กลับรายการบัญชี (ผ่าน facade) */
export async function bridgePosSaleVoided(sale: {
  id: string;
  tenantId: string;
  systemId: string;
}): Promise<{ posted: boolean }> {
  return reverseExternalSale({
    tenantId: sale.tenantId,
    sourceSystemId: sale.systemId,
    refId: sale.id,
  });
}
