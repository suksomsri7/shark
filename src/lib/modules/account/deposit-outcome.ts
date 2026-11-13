// ─────────────────────────────────────────────────────────────
// deposit-outcome.ts — ผลการคืน/ริบเงินมัดจำของใบรับมัดจำ (ACC T3 · Job A2/A3)
//
// ปัญหาเดิม: ใบรับมัดจำที่ "คืนเงิน" หรือ "ริบ" แล้วขึ้นสถานะ "หักมัดจำแล้ว" (DEDUCTED) ซึ่งไม่จริง
// ทางแก้: เก็บยอดที่คืน/ริบไว้ที่คอลัมน์ `AccountDocument.depositOutcome` (Json · ค่าที่คำนวณจากเอกสาร/สมุดรายวัน —
//   ไม่ใช่แหล่งความจริงใหม่) แล้วทุกจอ/REST สร้างป้ายจาก `depositOutcomeLabel` ตัวเดียว
//   ทำไมเก็บ: หน้ารายการมีงบจำนวน query — การหาป้ายสดต่อแถวต้องอ่านใบลดหนี้ + JV เพิ่ม (ห้ามขยายงบ)
//   ทุกเส้นทางที่เปลี่ยนผล (คืน · ริบ · ยกเลิกใบลดหนี้ของมัดจำ · กลับรายการ JV ริบ) เรียก `recomputeDepositOutcomeInTx` ตัวเดียว
//
// 🔴 ไฟล์นี้ pure (ใช้ได้ทั้งจอและ server) · ตัวเขียน = deposit-outcome-db.ts (ใช้ tx ของผู้เรียก — fitness F5)
// ─────────────────────────────────────────────────────────────

/** สตางค์ · refunded = คืนแล้ว (ใบลดหนี้คืนมัดจำที่ยังมีผล หรือคืนแบบยกเลิกใบ) · forfeited = ริบแล้ว (ใบลดหนี้ริบ + ริบแบบไม่ออกใบลดหนี้) */
export type DepositOutcome = { refunded: number; forfeited: number; forfeitKeep: number };

export const EMPTY_DEPOSIT_OUTCOME: DepositOutcome = { refunded: 0, forfeited: 0, forfeitKeep: 0 };

export function depositOutcomeOf(v: unknown): DepositOutcome | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const n = (k: string) => (typeof o[k] === "number" && Number.isFinite(o[k]) ? Math.max(0, Math.round(o[k] as number)) : 0);
  const out = { refunded: n("refunded"), forfeited: n("forfeited"), forfeitKeep: n("forfeitKeep") };
  return out.refunded + out.forfeited + out.forfeitKeep > 0 ? out : null;
}

/** ผลที่ API คืน (ฟิลด์ที่คำนวณ) */
export type DepositSettlementView = {
  kind: "REFUNDED" | "FORFEITED" | "MIXED";
  /** true = คืน/ริบไม่ครบยอดใบ (ส่วนที่เหลือถูกหักในใบแจ้งหนี้/ยังค้างอยู่) */
  partial: boolean;
  refundedSatang: number;
  forfeitedSatang: number;
  labelTh: string;
};

/**
 * ป้ายสถานะที่ถูกต้องของใบรับ/ใบจ่ายมัดจำที่ถูกคืน/ริบ — null = ใช้ป้ายสถานะปกติ
 *   คืนครบ "คืนมัดจำแล้ว" · ริบครบ "ริบมัดจำแล้ว" · ไม่ครบยอดใบ = "…บางส่วน" · ทั้งคืนและริบ = "คืนบางส่วน · ริบส่วนที่เหลือ"
 */
export function depositSettlementView(doc: { docType: string; status: string; grandTotal: number; depositOutcome?: unknown }): DepositSettlementView | null {
  if (doc.docType !== "DEPOSIT_RECEIPT" && doc.docType !== "DEPOSIT_PAYMENT") return null;
  if (doc.status === "DRAFT" || doc.status === "CANCELLED") return null;
  const o = depositOutcomeOf(doc.depositOutcome);
  if (!o) return null;
  const refunded = o.refunded;
  const forfeited = o.forfeited + o.forfeitKeep;
  const partial = refunded + forfeited < doc.grandTotal;
  if (refunded > 0 && forfeited > 0) return { kind: "MIXED", partial, refundedSatang: refunded, forfeitedSatang: forfeited, labelTh: "คืนมัดจำบางส่วน · ริบส่วนที่เหลือ" };
  if (refunded > 0) return { kind: "REFUNDED", partial, refundedSatang: refunded, forfeitedSatang: 0, labelTh: partial ? "คืนมัดจำบางส่วน" : "คืนมัดจำแล้ว" };
  return { kind: "FORFEITED", partial, refundedSatang: 0, forfeitedSatang: forfeited, labelTh: partial ? "ริบมัดจำบางส่วน" : "ริบมัดจำแล้ว" };
}

export const depositOutcomeLabel = (doc: { docType: string; status: string; grandTotal: number; depositOutcome?: unknown }): string | null => depositSettlementView(doc)?.labelTh ?? null;

/** คีย์ JV ริบแบบไม่ออกใบลดหนี้ของใบรับมัดจำ (event FORFEIT · FORFEIT:R<n> หลังกลับรายการ — gl.postDepositSettlement) */
export const forfeitKeyPrefix = (depositId: string) => `AccountDocument#${depositId}#FORFEIT`;

