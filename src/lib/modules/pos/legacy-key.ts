// HF-O23 — คีย์กันกดซ้ำของหน้าขายเดิม (`registerSaleAction` ใน src/lib/actions/pos.ts)
//
// ปัญหา: เดิมเอาคีย์จาก client ไปค้น/สร้าง PosSale ตรง ๆ ในช่อง unique(tenantId, idempotencyKey) เดียวกับที่โมดูลอื่นใช้
//   (`hotel-sale-<id>` · `booking-sale-<id>` · `ticket-sale-<id>` · `ecom-<id>` · `rental-<id>` · `clinic-<id>` · `school-<id>` · `subscription-<id>` · …)
//   ⇒ (ก) แคชเชียร์ "จองคีย์" ล่วงหน้า → createSale ของโมดูลนั้นเจอบิลซ้ำแล้วคืนบิลปลอม (ห้อง/ออเดอร์ไม่ถูกเก็บเงิน)
//   ⇒ (ข) ส่งคีย์ของโมดูลอื่น → ได้เลขใบเสร็จ/ยอดของบิลนั้นกลับไป
// แก้แบบเดียวกับหน้าขายใหม่ (register.ts · R4 K1 · "reg2:"):
//   1) คีย์ของ client = [A-Za-z0-9_-] ยาว 8–100 เท่านั้น (UI ส่ง UUID) — ":" ไม่อยู่ในชุดอักษร ⇒ ส่ง "pos1:…" มาเองไม่ได้
//   2) เก็บ/ค้นด้วย POS1_KEY_PREFIX + คีย์ เสมอ ⇒ ไม่มีวันชนคีย์ของโมดูลอื่น
//   3) คืนบิลเดิมเฉพาะบิลที่ sourceModule = POS และสาขาเดียวกัน (ป้องกันซ้อน)
//   4) ช่วงเปลี่ยนรุ่น: แท็บที่เปิดก่อน deploy อาจกดยืนยันซ้ำด้วยคีย์เปล่าที่บันทึกไปแล้ว ⇒ ถ้าไม่มีแถว "pos1:" ค้นคีย์เปล่าด้วย
//      แต่คืนเฉพาะแถว POS ของสาขาเดียวกัน — แถวของโมดูลอื่น = ไม่เห็น (ไปต่อด้วยคีย์ที่มีคำนำหน้า)
import type { Prisma, PrismaClient } from "@prisma/client";

/** คำนำหน้าคีย์ที่หน้าขายเดิมเก็บจริง (ของหน้าขายใหม่ = "reg2:") */
export const POS1_KEY_PREFIX = "pos1:";

/** คีย์ของ client ที่รับได้ — ไม่มี ":" ⇒ ปลอมคำนำหน้าไม่ได้ */
export const isPosClientKey = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(v);

/** คีย์ที่เก็บใน PosSale.idempotencyKey สำหรับคีย์ของ client */
export const posStoredKey = (clientKey: string): string => POS1_KEY_PREFIX + clientKey;

export type PosReplay = { saleId: string; receiptNo: string | null; grandTotalSatang: number; pointEarned: number; legacyBareKey: boolean };
/** replay = บิลเดิมของการกดซ้ำ · taken = แถว "pos1:<คีย์>" มีแล้วแต่ไม่ใช่บิล POS ของสาขานี้ (ห้ามคืน ห้ามส่งต่อ createSale) · none = ขายใหม่ได้ */
export type PosKeyLookup = { kind: "replay"; sale: PosReplay } | { kind: "taken" } | { kind: "none" };

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * ค้นคีย์ของ client (ผ่าน isPosClientKey แล้ว) ก่อนขาย
 * - แถว "pos1:<คีย์>" ที่เป็น POS + สาขาเดียวกัน → replay · เป็นของอื่น → taken
 * - ไม่มีแถว "pos1:" → แถวคีย์เปล่า (บันทึกก่อน deploy) ที่เป็น POS + สาขาเดียวกัน → replay (legacyBareKey)
 * - แถวคีย์เปล่าของโมดูลอื่น/สาขาอื่น → ไม่เห็น (none) ⇒ ผู้เรียกขายต่อด้วย "pos1:<คีย์>" · ไม่มีวันคืนบิลของโมดูลอื่น
 */
export async function lookupPosKey(db: Db, tenantId: string, unitId: string, clientKey: string): Promise<PosKeyLookup> {
  const select = { id: true, receiptNo: true, grandTotalSatang: true, pointEarned: true, sourceModule: true, unitId: true } as const;
  const ownPos = (r: { sourceModule: string; unitId: string }) => r.sourceModule === "POS" && r.unitId === unitId;
  const pref = await db.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: posStoredKey(clientKey) } }, select });
  if (pref) {
    if (!ownPos(pref)) return { kind: "taken" };
    return { kind: "replay", sale: { saleId: pref.id, receiptNo: pref.receiptNo, grandTotalSatang: pref.grandTotalSatang, pointEarned: pref.pointEarned, legacyBareKey: false } };
  }
  const bare = await db.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: clientKey } }, select });
  if (bare && ownPos(bare)) {
    return { kind: "replay", sale: { saleId: bare.id, receiptNo: bare.receiptNo, grandTotalSatang: bare.grandTotalSatang, pointEarned: bare.pointEarned, legacyBareKey: true } };
  }
  return { kind: "none" };
}
