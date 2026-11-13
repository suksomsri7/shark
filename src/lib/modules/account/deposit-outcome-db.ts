// deposit-outcome-db.ts — ตัวคำนวณ/เขียน "ผลการคืน/ริบมัดจำ" (ACC T3 · Job A2/A3) · คู่ของ deposit-outcome.ts (pure)
// 🔴 ใช้ tx ที่ผู้เรียกส่งมาเท่านั้น (ไม่ import prisma ตรง — fitness F5)
import { Prisma } from "@prisma/client";
import { depositOutcomeOf, EMPTY_DEPOSIT_OUTCOME, forfeitKeyPrefix, type DepositOutcome } from "./deposit-outcome";

/** JV ริบแบบไม่ออกใบลดหนี้ที่ยังมีผล (POSTED · ไม่ใช่รายการกลับ) — กรองคีย์ในโค้ด (คีย์ประกอบในเซิร์ฟเวอร์ · ไม่ใช้ startsWith ของฐานข้อมูล) */
export async function liveForfeitKeepCount(tx: Prisma.TransactionClient, systemId: string, depositId: string): Promise<number> {
  const rows = await tx.accountJournalEntry.findMany({ where: { systemId, refType: "AccountDocument", refId: depositId, status: "POSTED", reversalOfId: null }, select: { idempotencyKey: true } });
  const pre = forfeitKeyPrefix(depositId);
  return rows.filter((r) => r.idempotencyKey === pre || (r.idempotencyKey ?? "").startsWith(`${pre}:R`)).length;
}

/**
 * คำนวณผลใหม่จากของจริงแล้วเขียนกลับ (ตัวเดียวทุกเส้นทาง)
 *   refunded/forfeited = Σ ใบลดหนี้ของมัดจำที่ยังมีผล (refType DepositRefund / DepositForfeit · refId = ใบมัดจำ)
 *   forfeitKeep = มี JV ริบ (ไม่ออกใบลดหนี้) ที่ยังมีผล ⇒ ยอดที่ผู้เรียกส่ง (`keepGross`) หรือค่าเดิม · ไม่มี ⇒ 0
 *   refundVoided = คืนแบบยกเลิกใบ (ไม่มีใบกำกับ) — ผู้เรียกส่งยอดที่คืน (ใบเป็น VOIDED แล้วไม่มีทางหาย้อนหลัง)
 */
export async function recomputeDepositOutcomeInTx(
  tx: Prisma.TransactionClient,
  systemId: string,
  depositId: string,
  opts: { keepGross?: number; refundVoided?: number } = {},
): Promise<DepositOutcome> {
  const dep = await tx.accountDocument.findFirst({ where: { id: depositId, systemId }, select: { id: true, status: true, depositOutcome: true } });
  if (!dep) return EMPTY_DEPOSIT_OUTCOME;
  const prev = depositOutcomeOf(dep.depositOutcome) ?? EMPTY_DEPOSIT_OUTCOME;
  const cns = await tx.accountDocument.findMany({
    where: { systemId, docType: "CREDIT_NOTE", refType: { in: ["DepositRefund", "DepositForfeit"] }, refId: depositId, status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] } },
    select: { refType: true, grandTotal: true },
  });
  const liveKeep = await liveForfeitKeepCount(tx, systemId, depositId);
  const next: DepositOutcome = {
    refunded: cns.filter((c) => c.refType === "DepositRefund").reduce((s, c) => s + c.grandTotal, 0) + (opts.refundVoided ?? (dep.status === "VOIDED" ? prev.refunded : 0)),
    forfeited: cns.filter((c) => c.refType === "DepositForfeit").reduce((s, c) => s + c.grandTotal, 0),
    forfeitKeep: liveKeep > 0 ? (opts.keepGross ?? prev.forfeitKeep) : 0,
  };
  const empty = next.refunded + next.forfeited + next.forfeitKeep === 0;
  await tx.accountDocument.update({ where: { id: depositId }, data: { depositOutcome: empty ? Prisma.DbNull : (next as unknown as Prisma.InputJsonValue) } });
  return next;
}
