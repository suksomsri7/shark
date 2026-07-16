// account-bridge.ts — ตัวแปลง PosSale → บัญชี (อยู่ในโมดูล pos)
// เรียก account ผ่าน facade (account/index) เท่านั้น — ตาม chokepoint pos→account (F2.2)
// ⚠️ ห้าม import pos/service (กันวงวน import) — consumer อ่าน PosSale ผ่าน prisma ตรงแล้วส่งเข้ามา
// WO-0002: map ประเภทการชำระของ POS → ช่องทางเงินฝั่งบัญชี แล้วส่งให้ facade

import type { PosPayType } from "@prisma/client";
import { applyExternalSale, reverseExternalSale } from "@/lib/modules/account";

// PosPayType → ช่องทางเงินฝั่งบัญชี
//   CASH → เงินสด (1000) · PROMPTPAY/TRANSFER → ธนาคาร (1010)
//   DEPOSIT/ROOM_CHARGE: ยังไม่มีบัญชีเฉพาะ (มัดจำ/folio) → เข้าธนาคารชั่วคราว รอ WO ถัดไป
function channelOf(type: PosPayType): "CASH" | "TRANSFER" | "PROMPTPAY" {
  switch (type) {
    case "CASH":
      return "CASH";
    case "PROMPTPAY":
      return "PROMPTPAY";
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
};

/** ขาย POS สำเร็จ → post บัญชี (ผ่าน facade) */
export async function bridgePosSalePaid(
  sale: SaleForBridge,
  payments: { type: PosPayType; amountSatang: number }[],
): Promise<{ posted: boolean; reason?: string }> {
  return applyExternalSale({
    tenantId: sale.tenantId,
    sourceSystemId: sale.systemId,
    refId: sale.id,
    occurredAt: sale.paidAt ?? sale.createdAt,
    grossSatang: sale.grandTotalSatang,
    payMethods: payments.map((p) => ({ channel: channelOf(p.type), amountSatang: p.amountSatang })),
  });
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
