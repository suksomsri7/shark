import { prisma } from "@/lib/core/db";
import type { AccountChequeDirection, AccountChequeStatus, Prisma } from "@prisma/client";
// posting engine (owner = GL-Core) — subagent แค่ import + เรียกตามลายเซ็น
import { ensureAccounting, postManualJV, resolveMapping } from "./gl";

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
}): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (!input.chequeNo.trim()) return { ok: false, reason: "กรุณากรอกเลขที่เช็ค" };
  if (!input.bankName.trim()) return { ok: false, reason: "กรุณากรอกชื่อธนาคาร" };
  const amount = Math.round(input.amount);
  if (amount <= 0) return { ok: false, reason: "จำนวนเงินต้องมากกว่า 0" };
  const ctx = { tenantId: input.tenantId, systemId: input.systemId };
  try {
    const id = await prisma.$transaction(async (tx) => {
      await ensureAccounting(ctx, tx);
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
      // ลงทะเบียนบัญชี
      if (input.direction === "IN") {
        const t = await resolveMapping(ctx, "CHEQUE_IN_TRANSIT", undefined, tx);
        const ar = await resolveMapping(ctx, "AR", undefined, tx);
        await postManualJV(
          ctx,
          {
            date: input.chequeDate,
            memo: `รับเช็ค ${input.chequeNo.trim()} — ${input.bankName.trim()}`,
            lines: [
              { accountId: t, debit: amount, credit: 0, note: "เช็ครับรอนำฝาก" },
              { accountId: ar, debit: 0, credit: amount, note: "ลดลูกหนี้จากรับเช็ค" },
            ],
          },
          tx,
        );
      } else {
        const ap = await resolveMapping(ctx, "AP", undefined, tx);
        const pay = await resolveMapping(ctx, "CHEQUE_PAYABLE", undefined, tx);
        await postManualJV(
          ctx,
          {
            date: input.chequeDate,
            memo: `จ่ายเช็ค ${input.chequeNo.trim()} — ${input.bankName.trim()}`,
            lines: [
              { accountId: ap, debit: amount, credit: 0, note: "ลดเจ้าหนี้จากจ่ายเช็ค" },
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
        await postManualJV(
          ctx,
          {
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
        await postManualJV(
          ctx,
          {
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
      // ตั้งลูกหนี้กลับ: ถ้าเคยเคลียร์แล้ว → Cr ธนาคาร (ดึงเงินคืน) · ยังไม่เคลียร์ → Cr 1040
      const counter =
        cq.status === "CLEARED"
          ? await bankLedgerId(ctx, cq.financeAccountId, tx)
          : await resolveMapping(ctx, "CHEQUE_IN_TRANSIT", undefined, tx);
      await postManualJV(
        ctx,
        {
          date: new Date(),
          memo: `เช็คเด้ง ${cq.chequeNo}${reason ? ` — ${reason}` : ""}`,
          lines: [
            { accountId: ar, debit: cq.amount, credit: 0, note: "ตั้งลูกหนี้กลับ (เช็คเด้ง)" },
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
      await postManualJV(
        ctx,
        {
          date: new Date(),
          memo: `ยกเลิกเช็คจ่าย ${cq.chequeNo}${reason ? ` — ${reason}` : ""}`,
          lines: [
            { accountId: pay, debit: cq.amount, credit: 0, note: "ล้างเช็คจ่ายรอเรียกเก็บ" },
            { accountId: ap, debit: 0, credit: cq.amount, note: "ตั้งเจ้าหนี้กลับ (ยกเลิกเช็ค)" },
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
