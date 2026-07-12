import { prisma } from "@/lib/core/db";
import type { AccountChequeDirection, AccountChequeStatus, Prisma } from "@prisma/client";
// posting engine (owner = GL-Core) — subagent แค่ import + เรียกตามลายเซ็น
import { ensureAccounting, postChequeEntry, resolveMapping } from "./gl";

// ─────────────────────────────────────────────────────────────
// cheque.ts — ทะเบียนเช็ครับ/เช็คจ่าย (§3.5)
// lifecycle: เช็ครับ ON_HAND→DEPOSITED→CLEARED/BOUNCED · เช็คจ่าย ISSUED→CLEARED/VOIDED
// posting (ผ่าน gl.postManualJV — Σdr==Σcr เสมอ):
//   เช็ครับ  ลงทะเบียน  Dr 1040 เช็ครับรอนำฝาก / Cr 1100 ลูกหนี้
//            เคลียร์     Dr 1010 ธนาคาร        / Cr 1040
//            เด้ง        Dr 1100 ลูกหนี้        / Cr 1040|1010 (ตั้งลูกหนี้กลับ)
//   เช็คจ่าย ออกเช็ค     Dr 2100 เจ้าหนี้        / Cr 2300 เช็คจ่ายรอเรียกเก็บ
//            เคลียร์     Dr 2300               / Cr 1010 ธนาคาร
//            ยกเลิก      Dr 2300               / Cr 2100 เจ้าหนี้ (ตั้งเจ้าหนี้กลับ)
// เงิน Int สตางค์ · scope = tenantId + systemId
// ─────────────────────────────────────────────────────────────

type Ctx = { tenantId: string; systemId: string };
type Tx = Prisma.TransactionClient;

export const CHEQUE_DIR_LABEL: Record<AccountChequeDirection, string> = {
  IN: "เช็ครับ",
  OUT: "เช็คจ่าย",
};

export const CHEQUE_STATUS_LABEL: Record<AccountChequeStatus, string> = {
  ON_HAND: "อยู่ในมือ",
  DEPOSITED: "นำฝากแล้ว",
  CLEARED: "เรียกเก็บได้",
  BOUNCED: "เช็คเด้ง",
  ISSUED: "จ่ายแล้ว",
  VOIDED: "ยกเลิก",
};

export function chequeStatusTone(s: AccountChequeStatus): "muted" | "strong" | "danger" {
  if (s === "CLEARED") return "strong";
  if (s === "BOUNCED" || s === "VOIDED") return "danger";
  return "muted";
}

// ─────────────────── อ่าน ───────────────────

export function listCheques(
  tenantId: string,
  systemId: string,
  opts?: { direction?: AccountChequeDirection; status?: AccountChequeStatus },
) {
  return prisma.accountCheque.findMany({
    where: {
      tenantId,
      systemId,
      ...(opts?.direction ? { direction: opts.direction } : {}),
      ...(opts?.status ? { status: opts.status } : {}),
    },
    orderBy: [{ chequeDate: "desc" }, { createdAt: "desc" }],
  });
}

export function getCheque(tenantId: string, systemId: string, id: string) {
  return prisma.accountCheque.findFirst({ where: { id, tenantId, systemId } });
}

/** ยอดคงค้างในมือ/รอเรียกเก็บ ต่อทิศทาง (สำหรับสรุปหัวหน้า) */
export async function chequeSummary(tenantId: string, systemId: string) {
  const rows = await prisma.accountCheque.groupBy({
    by: ["direction", "status"],
    where: { tenantId, systemId },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const pending = (dir: AccountChequeDirection, statuses: AccountChequeStatus[]) =>
    rows
      .filter((r) => r.direction === dir && statuses.includes(r.status))
      .reduce((s, r) => s + (r._sum.amount ?? 0), 0);
  return {
    inPending: pending("IN", ["ON_HAND", "DEPOSITED"]), // เช็ครับรอเรียกเก็บ
    outPending: pending("OUT", ["ISSUED"]), // เช็คจ่ายรอเรียกเก็บ
  };
}

// ─────────────────── posting helper ───────────────────

async function bankLedgerId(ctx: Ctx, financeAccountId: string | null, db: Tx): Promise<string> {
  if (financeAccountId) {
    const fa = await db.accountFinance.findFirst({
      where: { id: financeAccountId, systemId: ctx.systemId },
      select: { ledgerAccountId: true },
    });
    if (fa?.ledgerAccountId) return fa.ledgerAccountId;
  }
  return resolveMapping(ctx, "BANK", undefined, db);
}

// ─────────────────── สร้าง (+ลงทะเบียนบัญชี) ───────────────────

export async function createCheque(input: {
  tenantId: string;
  systemId: string;
  direction: AccountChequeDirection;
  chequeNo: string;
  bankName: string;
  bankBranch?: string | null;
  chequeDate: Date;
  amount: number; // สตางค์
  financeAccountId?: string | null;
  note?: string | null;
  documentId?: string | null; // R-B: ผูกเอกสาร (IN=เอกสารขาย · OUT=เอกสารซื้อ) → ตัดหนี้จริง
}): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (!input.chequeNo.trim()) return { ok: false, reason: "กรุณากรอกเลขที่เช็ค" };
  if (!input.bankName.trim()) return { ok: false, reason: "กรุณากรอกชื่อธนาคาร" };
  const amount = Math.round(input.amount);
  if (amount <= 0) return { ok: false, reason: "จำนวนเงินต้องมากกว่า 0" };
  const ctx = { tenantId: input.tenantId, systemId: input.systemId };
  try {
    const id = await prisma.$transaction(async (tx) => {
      await ensureAccounting(ctx, tx);

      // R-B: ผูกเอกสาร → ตรวจทิศทาง/สถานะ/ยอดคงเหลือ + สร้าง payment (ตัดหนี้) + อัปสถานะเอกสาร
      let contactId: string | null = null;
      let doc: { id: string; contactId: string | null; grandTotal: number; paidTotal: number; docType: string } | null = null;
      if (input.documentId) {
        const d = await tx.accountDocument.findFirst({
          where: { id: input.documentId, tenantId: ctx.tenantId, systemId: ctx.systemId },
          select: { id: true, contactId: true, direction: true, status: true, grandTotal: true, paidTotal: true, docType: true },
        });
        if (!d) throw new Error("ไม่พบเอกสารที่อ้างอิง");
        // IN cheque = รับเงิน = เอกสารขาย (direction OUT) · OUT cheque = จ่าย = เอกสารซื้อ (IN)
        const wantDir = input.direction === "IN" ? "OUT" : "IN";
        if (d.direction !== wantDir) throw new Error("ทิศทางเช็คไม่ตรงกับเอกสาร");
        if (!["AWAITING_PAYMENT", "PARTIAL"].includes(d.status))
          throw new Error("เอกสารนี้รับ/จ่ายชำระไม่ได้ในสถานะปัจจุบัน");
        const remain = Math.max(0, d.grandTotal - d.paidTotal);
        if (amount > remain + 1) throw new Error("จำนวนเงินเช็คเกินยอดคงเหลือของเอกสาร");
        contactId = d.contactId;
        doc = { id: d.id, contactId: d.contactId, grandTotal: d.grandTotal, paidTotal: d.paidTotal, docType: d.docType };
      }

      const cq = await tx.accountCheque.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          direction: input.direction,
          chequeNo: input.chequeNo.trim(),
          bankName: input.bankName.trim(),
          bankBranch: input.bankBranch?.trim() || null,
          chequeDate: input.chequeDate,
          amount,
          status: input.direction === "IN" ? "ON_HAND" : "ISSUED",
          financeAccountId: input.financeAccountId || null,
          note: input.note?.trim() || null,
        },
        select: { id: true },
      });

      // ตัดหนี้เอกสาร (sub-ledger ตรง GL) + กันจ่าย/รับซ้ำผ่านหน้าเอกสาร
      if (doc) {
        await tx.accountDocumentPayment.create({
          data: {
            tenantId: ctx.tenantId,
            systemId: ctx.systemId,
            documentId: doc.id,
            paidAt: input.chequeDate,
            channel: "CHEQUE",
            financeAccountId: input.financeAccountId || null,
            amount,
            whtAmountSatang: 0,
            chequeId: cq.id,
          },
        });
        const newPaid = doc.paidTotal + amount;
        const fully = newPaid >= doc.grandTotal;
        const status = fully
          ? doc.docType === "DEPOSIT_PAYMENT" || doc.docType === "DEPOSIT_RECEIPT"
            ? "AWAITING_DEDUCT"
            : "PAID"
          : "PARTIAL";
        await tx.accountDocument.update({ where: { id: doc.id }, data: { paidTotal: newPaid, status } });
      }

      // ลงทะเบียนบัญชี (commitEntry refType=AccountCheque event=REGISTER — idempotent/reversible)
      if (input.direction === "IN") {
        const t = await resolveMapping(ctx, "CHEQUE_IN_TRANSIT", undefined, tx);
        const ar = await resolveMapping(ctx, "AR", undefined, tx);
        await postChequeEntry(
          ctx,
          {
            chequeId: cq.id,
            event: "REGISTER",
            book: "RECEIPTS",
            date: input.chequeDate,
            memo: `รับเช็ค ${input.chequeNo.trim()} — ${input.bankName.trim()}`,
            lines: [
              { accountId: t, debit: amount, credit: 0, note: "เช็ครับรอนำฝาก" },
              { accountId: ar, debit: 0, credit: amount, note: "ลดลูกหนี้จากรับเช็ค", contactId },
            ],
          },
          tx,
        );
      } else {
        const ap = await resolveMapping(ctx, "AP", undefined, tx);
        const pay = await resolveMapping(ctx, "CHEQUE_PAYABLE", undefined, tx);
        await postChequeEntry(
          ctx,
          {
            chequeId: cq.id,
            event: "REGISTER",
            book: "PAYMENTS",
            date: input.chequeDate,
            memo: `จ่ายเช็ค ${input.chequeNo.trim()} — ${input.bankName.trim()}`,
            lines: [
              { accountId: ap, debit: amount, credit: 0, note: "ลดเจ้าหนี้จากจ่ายเช็ค", contactId },
              { accountId: pay, debit: 0, credit: amount, note: "เช็คจ่ายรอเรียกเก็บ" },
            ],
          },
          tx,
        );
      }
      return cq.id;
    });
    return { ok: true, id };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "บันทึกเช็คไม่สำเร็จ" };
  }
}

// คืนหนี้เอกสารเมื่อเช็คเด้ง/ยกเลิก (void payment ที่ผูก + ถอย paidTotal/สถานะ)
async function restoreDocForCheque(tx: Tx, tenantId: string, systemId: string, chequeId: string): Promise<string | null> {
  const pay = await tx.accountDocumentPayment.findFirst({
    where: { chequeId, tenantId, systemId, voidedAt: null },
    select: { id: true, amount: true, documentId: true, document: { select: { contactId: true } } },
  });
  if (!pay) return null;
  await tx.accountDocumentPayment.update({ where: { id: pay.id }, data: { voidedAt: new Date(), voidReason: "เช็คเด้ง/ยกเลิก" } });
  const doc = await tx.accountDocument.findFirst({ where: { id: pay.documentId }, select: { paidTotal: true } });
  const newPaid = Math.max(0, (doc?.paidTotal ?? 0) - pay.amount);
  await tx.accountDocument.update({
    where: { id: pay.documentId },
    data: { paidTotal: newPaid, status: newPaid > 0 ? "PARTIAL" : "AWAITING_PAYMENT" },
  });
  return pay.document?.contactId ?? null;
}

// ─────────────────── เปลี่ยนสถานะ (lifecycle) ───────────────────

/** นำฝาก (เช็ครับ ON_HAND → DEPOSITED) — ยังไม่ลงบัญชี (เงินยังไม่เข้าธนาคาร) */
export async function depositCheque(
  tenantId: string,
  systemId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const cq = await getCheque(tenantId, systemId, id);
  if (!cq) return { ok: false, reason: "ไม่พบเช็ค" };
  if (cq.direction !== "IN") return { ok: false, reason: "นำฝากได้เฉพาะเช็ครับ" };
  if (cq.status !== "ON_HAND") return { ok: false, reason: "เช็คนี้ไม่อยู่สถานะรอนำฝาก" };
  await prisma.accountCheque.update({ where: { id }, data: { status: "DEPOSITED" } });
  return { ok: true };
}

/** เคลียร์ (เรียกเก็บได้) — เช็ครับ Dr ธนาคาร/Cr 1040 · เช็คจ่าย Dr 2300/Cr ธนาคาร */
export async function clearCheque(
  tenantId: string,
  systemId: string,
  id: string,
  clearedDate?: Date,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const ctx = { tenantId, systemId };
  try {
    await prisma.$transaction(async (tx) => {
      const cq = await tx.accountCheque.findFirst({ where: { id, tenantId, systemId } });
      if (!cq) throw new Error("ไม่พบเช็ค");
      const date = clearedDate ?? new Date();
      const bank = await bankLedgerId(ctx, cq.financeAccountId, tx);
      if (cq.direction === "IN") {
        if (cq.status !== "DEPOSITED" && cq.status !== "ON_HAND")
          throw new Error("เช็ครับต้องนำฝากก่อนจึงเรียกเก็บได้");
        const t = await resolveMapping(ctx, "CHEQUE_IN_TRANSIT", undefined, tx);
        await postChequeEntry(
          ctx,
          {
            chequeId: cq.id,
            event: "CLEAR",
            book: "RECEIPTS",
            date,
            memo: `เช็ครับเรียกเก็บได้ ${cq.chequeNo}`,
            lines: [
              { accountId: bank, debit: cq.amount, credit: 0, note: "เงินเข้าธนาคาร" },
              { accountId: t, debit: 0, credit: cq.amount, note: "ล้างเช็ครับรอนำฝาก" },
            ],
          },
          tx,
        );
      } else {
        if (cq.status !== "ISSUED") throw new Error("เช็คจ่ายนี้ไม่อยู่สถานะรอเรียกเก็บ");
        const pay = await resolveMapping(ctx, "CHEQUE_PAYABLE", undefined, tx);
        await postChequeEntry(
          ctx,
          {
            chequeId: cq.id,
            event: "CLEAR",
            book: "PAYMENTS",
            date,
            memo: `เช็คจ่ายถูกเรียกเก็บ ${cq.chequeNo}`,
            lines: [
              { accountId: pay, debit: cq.amount, credit: 0, note: "ล้างเช็คจ่ายรอเรียกเก็บ" },
              { accountId: bank, debit: 0, credit: cq.amount, note: "เงินออกจากธนาคาร" },
            ],
          },
          tx,
        );
      }
      await tx.accountCheque.update({ where: { id }, data: { status: "CLEARED", clearedAt: date } });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "เคลียร์เช็คไม่สำเร็จ" };
  }
}

/** เช็ครับเด้ง (BOUNCED) — reverse ผลบัญชี + ตั้งลูกหนี้กลับ */
export async function bounceCheque(
  tenantId: string,
  systemId: string,
  id: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const ctx = { tenantId, systemId };
  try {
    await prisma.$transaction(async (tx) => {
      const cq = await tx.accountCheque.findFirst({ where: { id, tenantId, systemId } });
      if (!cq) throw new Error("ไม่พบเช็ค");
      if (cq.direction !== "IN") throw new Error("เด้งได้เฉพาะเช็ครับ");
      if (cq.status !== "ON_HAND" && cq.status !== "DEPOSITED" && cq.status !== "CLEARED")
        throw new Error("สถานะเช็คไม่รองรับการทำเด้ง");
      const ar = await resolveMapping(ctx, "AR", undefined, tx);
      // คืนหนี้เอกสารที่ผูก (ถ้ามี) → invoice กลับเป็นค้างชำระ + ได้ contactId ของบรรทัด AR
      const contactId = await restoreDocForCheque(tx, tenantId, systemId, id);
      // ตั้งลูกหนี้กลับ: ถ้าเคยเคลียร์แล้ว → Cr ธนาคาร (ดึงเงินคืน) · ยังไม่เคลียร์ → Cr 1040
      const counter =
        cq.status === "CLEARED"
          ? await bankLedgerId(ctx, cq.financeAccountId, tx)
          : await resolveMapping(ctx, "CHEQUE_IN_TRANSIT", undefined, tx);
      await postChequeEntry(
        ctx,
        {
          chequeId: cq.id,
          event: "BOUNCE",
          book: "RECEIPTS",
          date: new Date(),
          memo: `เช็คเด้ง ${cq.chequeNo}${reason ? ` — ${reason}` : ""}`,
          lines: [
            { accountId: ar, debit: cq.amount, credit: 0, note: "ตั้งลูกหนี้กลับ (เช็คเด้ง)", contactId },
            {
              accountId: counter,
              debit: 0,
              credit: cq.amount,
              note: cq.status === "CLEARED" ? "หักเงินธนาคารคืน" : "ล้างเช็ครับรอนำฝาก",
            },
          ],
        },
        tx,
      );
      await tx.accountCheque.update({
        where: { id },
        data: { status: "BOUNCED", note: reason?.trim() || cq.note },
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "บันทึกเช็คเด้งไม่สำเร็จ" };
  }
}

/** ยกเลิกเช็คจ่าย (VOIDED) — reverse + ตั้งเจ้าหนี้กลับ (เฉพาะยังไม่เรียกเก็บ) */
export async function voidCheque(
  tenantId: string,
  systemId: string,
  id: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const ctx = { tenantId, systemId };
  try {
    await prisma.$transaction(async (tx) => {
      const cq = await tx.accountCheque.findFirst({ where: { id, tenantId, systemId } });
      if (!cq) throw new Error("ไม่พบเช็ค");
      if (cq.direction !== "OUT") throw new Error("ยกเลิกได้เฉพาะเช็คจ่าย");
      if (cq.status !== "ISSUED") throw new Error("ยกเลิกได้เฉพาะเช็คจ่ายที่ยังไม่ถูกเรียกเก็บ");
      const ap = await resolveMapping(ctx, "AP", undefined, tx);
      const pay = await resolveMapping(ctx, "CHEQUE_PAYABLE", undefined, tx);
      // คืนหนี้เอกสารที่ผูก (ถ้ามี) → เจ้าหนี้กลับเป็นค้างจ่าย + contactId ของบรรทัด AP
      const contactId = await restoreDocForCheque(tx, tenantId, systemId, id);
      await postChequeEntry(
        ctx,
        {
          chequeId: cq.id,
          event: "VOID",
          book: "PAYMENTS",
          date: new Date(),
          memo: `ยกเลิกเช็คจ่าย ${cq.chequeNo}${reason ? ` — ${reason}` : ""}`,
          lines: [
            { accountId: pay, debit: cq.amount, credit: 0, note: "ล้างเช็คจ่ายรอเรียกเก็บ" },
            { accountId: ap, debit: 0, credit: cq.amount, note: "ตั้งเจ้าหนี้กลับ (ยกเลิกเช็ค)", contactId },
          ],
        },
        tx,
      );
      await tx.accountCheque.update({
        where: { id },
        data: { status: "VOIDED", note: reason?.trim() || cq.note },
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "ยกเลิกเช็คไม่สำเร็จ" };
  }
}
