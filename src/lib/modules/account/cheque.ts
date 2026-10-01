import { prisma } from "@/lib/core/db";
import { safeReason } from "./errors";
import type { AccountChequeDirection, AccountChequeStatus, Prisma } from "@prisma/client";
// posting engine (owner = GL-Core) — subagent แค่ import + เรียกตามลายเซ็น
import { ensureAccounting, postChequeEntry, resolveMapping } from "./gl";
import { emitChequeChanged } from "./events";
import { emitOutboxMany } from "@/lib/core/outbox";
// CRM C5.4-C ▸ (round 6 · F4) ด่านหนี้เดียวกับ recordPayment: ล็อกแถวเอกสาร · หนี้จริงหักใบลดหนี้ทั้งครอบครัว · สถานะจาก receivableStatusOf ◂
import {
  AUTO_TI_CN_CHEQUE_MSG,
  CHEQUE_UNWIND_REASON,
  assertDepositNotAppliedInTx,
  assertNoLiveCnOnAutoTaxInvoicesInTx,
  liveCreditTotalInTx,
  lockDocumentRow,
  lockGroupHeadsOfDocsInTx,
  receivableStatusOf,
  syncGroupHeadsOfDocsInTx,
  unwindPaymentInTx,
  getSettings,
  recordPaymentInTx,
  type PaymentChequeGl,
  type RecordPaymentInput,
  attachDraftReceiptPaymentsInTx,
  type DraftReceiptPaymentRow,
} from "./service";
import { recordVendorPaymentInTx, type RecordVendorPaymentInput } from "./expense";
// CRM C5.4-C ▸ (round 8b · R8-1 option a) เช็คใบเดียวของใบวางบิล/ใบรวมจ่าย ผูกได้แค่งวดแรก — งวดอื่นของชุดหาจากคีย์กันซ้ำ ◂
import { paymentsOfCheque } from "./group-batch";

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
  // WO 5.1 — จำนวนเช็คต่อทิศทาง (ทุกสถานะ) ใช้เป็น badge บนแท็บ "เช็ครับ/เช็คจ่าย" ของหน้าการเงิน (g9)
  const countOf = (dir: AccountChequeDirection) => rows.filter((r) => r.direction === dir).reduce((s, r) => s + r._count._all, 0);
  return {
    inPending: pending("IN", ["ON_HAND", "DEPOSITED"]), // เช็ครับรอเรียกเก็บ
    outPending: pending("OUT", ["ISSUED"]), // เช็คจ่ายรอเรียกเก็บ
    inCount: countOf("IN"),
    outCount: countOf("OUT"),
  };
}

// ─────────────────── หน้ารายการ V2 (§10.4) ───────────────────
// WO 5.4: "ผู้ติดต่อ"/"อ้างอิงเอกสาร" มาจาก join ผ่าน `payment.document` (relation ที่มีอยู่แล้ว) —
// **ไม่เพิ่มคอลัมน์ contactId/documentId ซ้ำบน AccountCheque** (ดูเหตุผลใน wo-notes/5.4.md ขั้น 3 ข้อ 1) —
// เช็คที่ยังไม่เคยผูก payment (ยังไม่มีในหน้าปัจจุบัน — ฟอร์มสร้างผูกเอกสารเสมอ) จะได้ contact/doc = null เฉย ๆ

export type ChequeRowV2 = {
  id: string;
  direction: AccountChequeDirection;
  chequeNo: string;
  bankName: string;
  bankBranch: string | null;
  chequeDate: Date;
  amount: number;
  status: AccountChequeStatus;
  depositedAt: Date | null;
  clearedAt: Date | null;
  note: string | null;
  contactName: string | null;
  /** WO B3: id ของผู้ติดต่อจริง (มีเมื่อเช็คผูกเอกสารที่มี contactId — null เมื่อรู้แค่ชื่อจาก snapshot) */
  contactId: string | null;
  documentId: string | null;
  documentNo: string | null;
};

/** WO 9.3: แปลงแถวเช็ค → ChequeRowV2 — สูตรเดียวใช้ทั้งทางที่ตัดหน้าที่ DB และทางที่มีคำค้น */
function toChequeRowV2(c: {
  id: string;
  direction: AccountChequeDirection;
  chequeNo: string;
  bankName: string;
  bankBranch: string | null;
  chequeDate: Date;
  amount: number;
  status: AccountChequeStatus;
  depositedAt: Date | null;
  clearedAt: Date | null;
  note: string | null;
  payment: {
    document: {
      id: string;
      docNo: string | null;
      contactId: string | null;
      contactSnapshot: unknown;
      contact: { name: string } | null;
    } | null;
  } | null;
}): ChequeRowV2 {
  const doc = c.payment?.document ?? null;
  const snap = (doc?.contactSnapshot as Record<string, unknown> | null) ?? null;
  return {
    id: c.id,
    direction: c.direction,
    chequeNo: c.chequeNo,
    bankName: c.bankName,
    bankBranch: c.bankBranch,
    chequeDate: c.chequeDate,
    amount: c.amount,
    status: c.status,
    depositedAt: c.depositedAt,
    clearedAt: c.clearedAt,
    note: c.note,
    contactName: (snap?.name as string) ?? doc?.contact?.name ?? null,
    contactId: doc?.contactId ?? null,
    documentId: doc?.id ?? null,
    documentNo: doc?.docNo ?? null,
  };
}

/** เช็คเดียว รูปแบบเดียวกับแถวในหน้ารายการ (WO B3 — `GET /cheques/{id}` ของ API) · null = ไม่พบ */
export async function getChequeRowV2(tenantId: string, systemId: string, id: string): Promise<ChequeRowV2 | null> {
  const c = await prisma.accountCheque.findFirst({
    where: { id, tenantId, systemId },
    include: {
      payment: {
        select: {
          document: { select: { id: true, docNo: true, contactId: true, contactSnapshot: true, contact: { select: { name: true } } } },
        },
      },
    },
  });
  return c ? toChequeRowV2(c) : null;
}

export async function listChequesV2(
  tenantId: string,
  systemId: string,
  opts: {
    direction: AccountChequeDirection;
    status?: AccountChequeStatus;
    bank?: string; // ค้นหาชื่อธนาคาร/เลขที่เช็ค/ผู้ติดต่อ
    from?: Date; // ช่วงวันที่บนเช็ค
    to?: Date;
    page?: number;
    pageSize?: number;
  },
): Promise<{ rows: ChequeRowV2[]; total: number; totalSatang: number }> {
  // 🔴 WO 9.3 (Part D "แบ่งหน้าที่ฝั่ง DB") — เดิมดึง **ทะเบียนเช็คทั้งระบบ** เข้าหน่วยความจำ (ไม่มี take)
  //    แล้ว slice ฝั่ง JS ⇒ โตไม่มีเพดานตามจำนวนเช็คที่ร้านเคยออก
  //    ตอนนี้: ไม่มีคำค้น = ตัดหน้า + รวมยอดที่ DB · มีคำค้นค่อยใช้ทางเดิม (คำค้นครอบชื่อผู้ติดต่อที่แช่แข็ง
  //    ใน JSON `contactSnapshot` และเลขที่เอกสารที่อยู่คนละตาราง 2 ชั้น — กรองใน SQL ให้ผลเท่าเดิมไม่ได้)
  const where = {
    tenantId,
    systemId,
    direction: opts.direction,
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.from || opts.to
      ? { chequeDate: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lt: opts.to } : {}) } }
      : {}),
  };
  const docInclude = {
    payment: {
      select: {
        document: {
          select: { id: true, docNo: true, contactId: true, contactSnapshot: true, contact: { select: { name: true } } },
        },
      },
    },
  };
  const orderBy = [{ chequeDate: "desc" as const }, { createdAt: "desc" as const }];
  const q = (opts.bank ?? "").trim().toLowerCase();

  if (q.length === 0) {
    const pageSize = opts.pageSize ?? 20;
    const page = Math.max(1, opts.page ?? 1);
    const [agg, pageRows] = await Promise.all([
      prisma.accountCheque.aggregate({ where, _count: { _all: true }, _sum: { amount: true } }),
      prisma.accountCheque.findMany({ where, include: docInclude, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return {
      rows: pageRows.map(toChequeRowV2),
      total: agg._count._all,
      totalSatang: agg._sum.amount ?? 0,
    };
  }

  const all = await prisma.accountCheque.findMany({ where, include: docInclude, orderBy });
  const mapped: ChequeRowV2[] = all.map(toChequeRowV2);
  const filtered =
    q.length === 0
      ? mapped
      : mapped.filter(
          (r) =>
            r.chequeNo.toLowerCase().includes(q) ||
            r.bankName.toLowerCase().includes(q) ||
            (r.contactName ?? "").toLowerCase().includes(q) ||
            (r.documentNo ?? "").toLowerCase().includes(q),
        );

  const totalSatang = filtered.reduce((s, r) => s + r.amount, 0);
  const pageSize = opts.pageSize ?? 20;
  const page = Math.max(1, opts.page ?? 1);
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  return { rows, total: filtered.length, totalSatang };
}

/** จำนวนเช็คต่อสถานะของทิศทางเดียว — ใช้เป็นตัวนับ StatusTabs (ไม่ผูกกับตัวกรองวันที่/ค้นหาปัจจุบัน
 *  เหมือน StatusTabs ของหน้าเอกสารอื่น ๆ ที่นับจากทั้งชุดข้อมูล ไม่ใช่หน้าที่กรองแล้ว) — 1 query (groupBy) */
export async function chequeStatusCounts(
  tenantId: string,
  systemId: string,
  direction: AccountChequeDirection,
): Promise<Record<AccountChequeStatus, number>> {
  const rows = await prisma.accountCheque.groupBy({
    by: ["status"],
    where: { tenantId, systemId, direction },
    _count: { _all: true },
  });
  const out = {} as Record<AccountChequeStatus, number>;
  for (const r of rows) out[r.status] = r._count._all;
  return out;
}

/** สรุปหัวหน้า V2 ต่อทิศทาง (§10.4): "รอเรียกเก็บ ฿"/"เช็คจ่ายรอตัด ฿" + "ครบกำหนดใน 7 วัน n"
 *  หน้าต่างเดียวกับ reminders CHEQUE_DUE (`service.ts CHEQUE_LEAD_DAYS`) — รวมที่เลยกำหนดแล้วแต่ยังไม่เคลียร์ */
export async function chequeSummaryV2(
  tenantId: string,
  systemId: string,
  direction: AccountChequeDirection,
): Promise<{ pendingSatang: number; dueSoonCount: number }> {
  const pendingStatuses: AccountChequeStatus[] = direction === "IN" ? ["ON_HAND", "DEPOSITED"] : ["ISSUED"];
  const rows = await prisma.accountCheque.findMany({
    where: { tenantId, systemId, direction, status: { in: pendingStatuses } },
    select: { amount: true, chequeDate: true },
  });
  const pendingSatang = rows.reduce((s, r) => s + r.amount, 0);
  const horizon = new Date(Date.now() + 8 * 24 * 3600 * 1000); // 7 วันข้างหน้า + วันนี้ (รวมที่เลยกำหนดแล้ว)
  const dueSoonCount = rows.filter((r) => r.chequeDate < horizon).length;
  return { pendingSatang, dueSoonCount };
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

export type CreateChequeInput = {
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
  /** WO 1.4: เช็คที่เกิดจากการรับ/จ่ายชำระในฟอร์ม §5.2 F — payment + JV (Dr 1040 / Cr 1100) ลงไปแล้ว
   *  ⇒ ที่นี่ทำแค่ "ขึ้นทะเบียนเช็ค" + ผูกกลับไปที่ payment · ห้ามตัดหนี้/โพสต์ซ้ำ */
  paymentId?: string | null;
};

/**
 * CRM C5.4-C ▸ (round 10 · มติ B — R9-5) ด่านของร่างเช็คที่ไม่ต้องอ่านฐานข้อมูล (ตัดช่องว่างแล้วต้องไม่ว่าง · ยอด > 0)
 *   recordGroupPayment / ฟอร์มรับ-จ่ายชำระ ตรวจด้วยตัวนี้ **ก่อนเขียนอะไร** ◂
 */
export function chequeDraftProblem(input: { chequeNo?: string | null; bankName?: string | null; amount?: number }): string | null {
  if (!String(input.chequeNo ?? "").trim()) return "กรุณากรอกเลขที่เช็ค";
  if (!String(input.bankName ?? "").trim()) return "กรุณากรอกชื่อธนาคาร";
  if (input.amount !== undefined && !(Math.round(Number(input.amount) || 0) > 0)) return "จำนวนเงินต้องมากกว่า 0";
  return null;
}

export async function createCheque(input: CreateChequeInput): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const bad = chequeDraftProblem(input);
  if (bad) return { ok: false, reason: bad };
  try {
    const id = await prisma.$transaction((tx) => createChequeInTx(tx, input));
    return { ok: true, id };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกเช็คไม่สำเร็จ") };
  }
}

/**
 * CRM C5.4-C ▸ (round 10 · มติ B — R9-4/R9-5 ทางฟอร์ม payment.ts) รับ/จ่ายชำระ 1 งวดด้วยเช็ค = งวด + เช็ค + ผูก **ในธุรกรรมเดียว**
 *   (เดิม recordPayment แล้วค่อย createCheque ⇒ ยกเลิกงวดแทรกก่อนผูกได้ · เช็คถูกปฏิเสธแล้วงวดค้างโดยไม่มีเช็ค)
 *   คีย์กันซ้ำเดิม (งวดมีอยู่แล้ว) + ยังไม่มีเช็ค ⇒ ผูกเช็คให้ · มีเช็คแล้ว ⇒ ไม่ทำอะไร ◂
 */
export async function recordPaymentWithChequeInOneTx(
  tenantId: string,
  systemId: string,
  documentId: string,
  side: "revenue" | "expense",
  payment: RecordPaymentInput & RecordVendorPaymentInput,
  chq: { chequeNo: string; bankName: string; chequeDate: Date; amount: number; financeAccountId?: string | null; note?: string | null },
): Promise<{ ok: true; status: string; paymentId: string; whtCertNo?: string } | { ok: false; reason: string }> {
  const bad = chequeDraftProblem(chq);
  if (bad) return { ok: false, reason: bad };
  const failMsg = side === "expense" ? "บันทึกจ่ายไม่สำเร็จ" : "บันทึกชำระไม่สำเร็จ";
  try {
    const settings = side === "revenue" ? await getSettings(tenantId, systemId) : null;
    const r = await prisma.$transaction(async (tx) => {
      const one = side === "expense"
        ? await recordVendorPaymentInTx(tx, tenantId, systemId, documentId, payment)
        : await recordPaymentInTx(tx, tenantId, systemId, documentId, payment, settings!);
      const linked = one.duplicate
        ? (await tx.accountDocumentPayment.findFirst({ where: { id: one.paymentId, tenantId, systemId }, select: { chequeId: true } }))?.chequeId
        : null;
      if (!linked)
        await createChequeInTx(tx, {
          tenantId,
          systemId,
          direction: side === "expense" ? "OUT" : "IN",
          chequeNo: chq.chequeNo,
          bankName: chq.bankName,
          chequeDate: chq.chequeDate,
          amount: chq.amount,
          financeAccountId: chq.financeAccountId ?? null,
          documentId,
          paymentId: one.paymentId,
          note: chq.note ?? null,
        });
      await syncGroupHeadsOfDocsInTx(tx, tenantId, systemId, [documentId]);
      return one;
    }, { maxWait: 20_000, timeout: 40_000 });
    return { ok: true, status: r.status, paymentId: r.paymentId, whtCertNo: (r as { whtCertNo?: string }).whtCertNo };
  } catch (e) {
    return { ok: false, reason: safeReason(e, failMsg) };
  }
}

/**
 * CRM C5.4-C ▸ (round 11 · R10-6) อนุมัติใบเสร็จขายสดพร้อมรับเงิน (path ②): ผูกรายการรับเงิน + สร้างเช็ค + ผูกเช็ค **ในธุรกรรมเดียว**
 *   ⇒ รายการรับที่เป็นเช็คไม่มีวันมีอยู่โดยไม่มีเช็คของมัน (เดิม ผูก → ออก → สร้างเช็คทีหลัง: ยกเลิกแทรกก่อนผูกเช็คได้ 8/8)
 *   การออกเอกสาร + เอกสารภาษีหัก ณ ที่จ่าย ยังเป็นขั้นแยก (issueDocument มีธุรกรรมของตัวเอง) ◂
 */
export async function attachReceiptPaymentsWithChequesInOneTx(
  tenantId: string,
  systemId: string,
  documentId: string,
  rows: (DraftReceiptPaymentRow & { cheque: { chequeNo: string; bankName: string; chequeDate: Date } | null; chequeFinanceAccountId: string | null })[],
): Promise<{ ok: true; paymentIds: string[] } | { ok: false; reason: string }> {
  for (const r of rows) {
    const bad = r.cheque ? chequeDraftProblem({ chequeNo: r.cheque.chequeNo, bankName: r.cheque.bankName, amount: r.amount }) : null;
    if (bad) return { ok: false, reason: bad };
  }
  try {
    const paymentIds = await prisma.$transaction(async (tx) => {
      const ids = await attachDraftReceiptPaymentsInTx(tx, tenantId, systemId, documentId, rows.map(({ cheque: _c, chequeFinanceAccountId: _f, ...row }) => row));
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r.cheque) continue;
        await createChequeInTx(tx, {
          tenantId,
          systemId,
          direction: "IN",
          chequeNo: r.cheque.chequeNo,
          bankName: r.cheque.bankName,
          chequeDate: r.cheque.chequeDate,
          amount: r.amount,
          financeAccountId: r.chequeFinanceAccountId,
          documentId,
          paymentId: ids[i],
          note: r.note,
        });
      }
      return ids;
    }, { maxWait: 20_000, timeout: 40_000 });
    return { ok: true, paymentIds };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ผูกรายการรับเงินไม่สำเร็จ") };
  }
}

/**
 * CRM C5.4-C ▸ (round 10 · มติ B) ตัวสร้างเช็คในธุรกรรมของผู้เรียก — recordGroupPayment / ฟอร์มรับ-จ่ายชำระ บันทึกงวด + เช็ค + ผูก
 *   ในธุรกรรมเดียว (ล้ม = ไม่มีอะไรถูกเขียน ไม่มี event) · throw ข้อความไทย ◂
 */
export async function createChequeInTx(tx: Tx, input: CreateChequeInput): Promise<string> {
  const bad = chequeDraftProblem(input);
  if (bad) throw new Error(bad);
  const amount = Math.round(input.amount);
  const ctx = { tenantId: input.tenantId, systemId: input.systemId };
      await ensureAccounting(ctx, tx);

      // R-B: ผูกเอกสาร → ตรวจทิศทาง/สถานะ/ยอดคงเหลือ + สร้าง payment (ตัดหนี้) + อัปสถานะเอกสาร
      let contactId: string | null = null;
      let doc: { id: string; contactId: string | null; grandTotal: number; paidTotal: number; docType: string } | null = null;
      let creditTotal = 0;
      if (input.documentId && !input.paymentId) {
        // round 6 · F4: ล็อกแถวเอกสารก่อนอ่านยอด (เช็คพร้อมรับชำระ/ใบลดหนี้ = อ่านยอดเก่า → เก็บเกิน)
        await lockDocumentRow(tx, ctx.tenantId, ctx.systemId, input.documentId);
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
        // round 6 · F4/F7: หนี้จริงของใบแจ้งหนี้ = grand − paid − ใบลดหนี้ของทั้งครอบครัว (F-05) · เผื่อ 1 สตางค์เฉพาะเมื่อยังมีหนี้ค้าง
        creditTotal = d.docType === "INVOICE" ? await liveCreditTotalInTx(tx, ctx.systemId, d.id) : 0;
        const remain = Math.max(0, d.grandTotal - d.paidTotal - creditTotal);
        if (amount > remain + (remain > 0 ? 1 : 0)) throw new Error("จำนวนเงินเช็คเกินยอดคงเหลือของเอกสาร");
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
        const payRow = await tx.accountDocumentPayment.create({
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
        const status = doc.docType === "INVOICE"
          ? receivableStatusOf(doc.grandTotal, newPaid, creditTotal) // round 6 · F4: ฟังก์ชันสถานะเดียว (ใบลดหนี้ปิดส่วนที่เหลือได้)
          : fully
            ? doc.docType === "DEPOSIT_PAYMENT" || doc.docType === "DEPOSIT_RECEIPT"
              ? "AWAITING_DEDUCT"
              : "PAID"
            : "PARTIAL";
        await tx.accountDocument.update({ where: { id: doc.id }, data: { paidTotal: newPaid, status } });
        // round 6 · F4: เช็ครับที่ตัดหนี้เอกสารขาย = การรับชำระ ⇒ event เดียวกับ recordPayment (CRM นับเงิน · webhook) และ
        //   `account.invoice.paid` เมื่อใบแจ้งหนี้ครบ — คีย์เดียวกับ recordPayment ⇒ ครั้งเดียวต่อเอกสารไม่ว่าจากทางไหน
        if (input.direction === "IN") {
          const docNo = (await tx.accountDocument.findFirst({ where: { id: doc.id }, select: { docNo: true } }))?.docNo ?? null;
          await emitOutboxMany(tx, [
            { tenantId: ctx.tenantId, systemId: ctx.systemId, type: "account.payment.recorded", idempotencyKey: `account.payment.recorded#${payRow.id}`,
              payload: { documentId: doc.id, paymentId: payRow.id, amountSatang: amount, docType: doc.docType } },
            ...(status === "PAID" && doc.docType === "INVOICE" && newPaid > 0
              ? [{ tenantId: ctx.tenantId, systemId: ctx.systemId, type: "account.invoice.paid", idempotencyKey: `account.invoice.paid#${doc.id}`,
                  payload: { documentId: doc.id, docNo, grandTotalSatang: doc.grandTotal, paidTotalSatang: newPaid, creditNoteSatang: creditTotal } }]
              : []),
          ]);
        }
      }

      // WO 1.4: เช็คของ payment ที่โพสต์แล้ว → ผูกกลับ แล้วจบ (ไม่ตัดหนี้ซ้ำ ไม่โพสต์ซ้ำ)
      if (input.paymentId) {
        const found = await tx.accountDocumentPayment.findFirst({
          where: { id: input.paymentId, tenantId: ctx.tenantId, systemId: ctx.systemId },
          select: { documentId: true },
        });
        if (!found) throw new Error("ไม่พบรายการชำระที่จะผูกเช็ค");
        // round 10 · มติ B (R9-4): อ่านสถานะงวดใต้ล็อกเอกสาร — งวดที่ถูกยกเลิกไปแล้วผูกเช็คไม่ได้
        //   (เดิมผูกได้ ⇒ เช็คเด้งลงลูกหนี้/เงินระหว่างทางซ้ำด้วยเงินของงวดที่ยกเลิกไปแล้ว)
        await lockDocumentRow(tx, ctx.tenantId, ctx.systemId, found.documentId);
        const pay = await tx.accountDocumentPayment.findFirst({
          where: { id: input.paymentId, tenantId: ctx.tenantId, systemId: ctx.systemId },
          select: { id: true, chequeId: true, voidedAt: true },
        });
        if (!pay) throw new Error("ไม่พบรายการชำระที่จะผูกเช็ค");
        if (pay.voidedAt) throw new Error("รายการชำระนี้ถูกยกเลิกแล้ว — ผูกเช็คไม่ได้ ให้บันทึกรับ/จ่ายชำระใหม่พร้อมข้อมูลเช็ค");
        if (pay.chequeId) throw new Error("รายการชำระนี้ผูกเช็คไว้แล้ว");
        const n = await tx.accountDocumentPayment.updateMany({ where: { id: pay.id, chequeId: null }, data: { chequeId: cq.id } });
        if (n.count !== 1) throw new Error("รายการชำระนี้ผูกเช็คไว้แล้ว");
        return cq.id;
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
}

/**
 * CRM C5.4-C ▸ (round 7 · N1) ล็อกแถวเช็ค (`FOR UPDATE`) แล้วอ่านใหม่ใต้ล็อก — ทุกการเปลี่ยนสถานะเช็ค (นำฝาก · เคลียร์ · เด้ง · ยกเลิก) ผ่านตัวนี้
 *   ลำดับล็อกของทั้งระบบ: **เช็ค → เอกสาร → แถวรับชำระ (CAS)** — voidPayment (service.ts) ล็อกเช็คของงวดนั้นก่อนเอกสารเหมือนกัน
 *   เดิมอ่านสถานะโดยไม่ล็อก ⇒ กดเด้งซ้ำ/ยิง REST ซ้ำ ผ่านทั้งคู่ ถอยยอดรับชำระสองครั้ง (ยอดค้างเกินจริง ⇒ เก็บเงินลูกค้าเกิน) ◂
 */
async function lockChequeRow(tx: Tx, tenantId: string, systemId: string, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "AccountCheque" WHERE "id" = ${id} AND "tenantId" = ${tenantId} AND "systemId" = ${systemId} FOR UPDATE`;
  return tx.accountCheque.findFirst({ where: { id, tenantId, systemId } });
}

/** round 7 · N1: เปลี่ยนสถานะเช็คแบบมีเงื่อนไข (CAS) — ใครเปลี่ยนก่อนชนะ อีกฝ่ายได้ข้อความไทยว่าทำไปแล้ว */
async function casChequeStatus(tx: Tx, id: string, from: AccountChequeStatus, data: Prisma.AccountChequeUpdateManyMutationInput): Promise<void> {
  const n = await tx.accountCheque.updateMany({ where: { id, status: from }, data });
  if (n.count !== 1) throw new Error("สถานะเช็คเพิ่งถูกเปลี่ยนโดยรายการอื่น — รีเฟรชหน้าแล้วตรวจสถานะล่าสุดอีกครั้ง");
}

/**
 * round 7 · N1: ข้อความไทยเมื่อเช็คอยู่ในสถานะปลายทางแล้ว (กดซ้ำ/ยิงซ้ำ) — **คงวลีเดิมของระบบไว้ในข้อความเสมอ**
 * (ข้อสอบ/แอปภายนอกจับวลีเดิม: "นำฝากก่อน" · "ไม่อยู่สถานะรอเรียกเก็บ" · "ยกเลิกได้เฉพาะเช็คจ่ายที่ยังไม่ถูกเรียกเก็บ" · "สถานะเช็คไม่รองรับการทำเด้ง")
 */
function alreadyMsg(status: string, action: "เด้ง" | "ยกเลิก" | "เคลียร์", direction: string): string | null {
  const legacyClear = direction === "IN" ? "เคลียร์ได้เฉพาะเช็ครับที่นำฝากก่อน" : "เช็คจ่ายนี้ไม่อยู่สถานะรอเรียกเก็บ";
  if (action === "เด้ง" && status === "BOUNCED") return "เช็คนี้ถูกบันทึกเด้งไปแล้ว — สถานะเช็คไม่รองรับการทำเด้งซ้ำ ไม่ต้องทำซ้ำ";
  if (action === "ยกเลิก" && status === "VOIDED") return "เช็คนี้ถูกยกเลิกไปแล้ว — ยกเลิกได้เฉพาะเช็คจ่ายที่ยังไม่ถูกเรียกเก็บ ไม่ต้องทำซ้ำ";
  if (action === "เคลียร์") {
    if (status === "BOUNCED") return `เช็คนี้ถูกบันทึกเด้งแล้ว — ${legacyClear}`;
    if (status === "VOIDED") return `เช็คนี้ถูกยกเลิกแล้ว — ${legacyClear}`;
    if (status === "CLEARED") return `เช็คนี้เรียกเก็บแล้ว ไม่ต้องทำซ้ำ — ${legacyClear}`;
  }
  return null;
}

// คืนหนี้เอกสารเมื่อเช็คเด้ง/ยกเลิก
//   round 7 · N1: ผู้เรียกถือล็อกแถวเช็คอยู่ · round 8b · R8-1 (option a): ชุดที่ต้องคืน = งวดที่ผูกเช็ค + งวดอื่นของชุดเดียวกันจากคีย์
//   `GRP#<group>#<client>#<child>` (group-batch.paymentsOfCheque)
//   CRM C5.4-C ▸ round 10 · มติ A (R9-1/R9-2/R9-3): แต่ละงวดถอยด้วย **unwindPaymentInTx ตัวเดียวกับ voidPayment** (เงิน + WHT · ใบกำกับอัตโนมัติ ·
//   เอกสารภาษีหัก ณ ที่จ่าย · JV ใบมัดจำ · payment.voided) — ต่างกันแค่ขาเงินสดที่ JV เช็คเป็นเจ้าของ (ผู้เรียกลงจาก `unwound[].gl`)
//   ลำดับล็อก: เช็ค → ใบกำกับอัตโนมัติ ↑id → เอกสาร ↑id → แถวรับชำระ (CAS) · ด่านปฏิเสธทั้งหมดตรวจก่อนเขียน (ไม่ผ่าน = ไม่มีอะไรถูกเขียน)
//   มติ C (R9-6): หัวเอกสารกลุ่มของใบลูกที่ถูกคืนหนี้ sync ในธุรกรรมเดียวกัน ◂
type Restored = {
  contactId: string | null;
  unwound: { paymentId: string; documentId: string; gl: PaymentChequeGl }[];
  /** งวดของเช็คนี้ที่ถูกยกเลิกไปก่อนหน้า (ข้อมูลเก่าก่อนมติ B2c) และ JV ของงวดถูกกลับไปแล้ว — เงินออกจากบัญชีพักเช็คไปแล้วตอนนั้น */
  earlierReversedCash: number;
};
async function restoreDocForCheque(tx: Tx, tenantId: string, systemId: string, chequeId: string): Promise<Restored> {
  const ctx = { tenantId, systemId };
  const all = await paymentsOfCheque(tx, tenantId, systemId, chequeId);
  if (all.length === 0) return { contactId: null, unwound: [], earlierReversedCash: 0 };
  const ids = all.map((p) => p.id);
  const tis = await tx.accountDocument.findMany({
    where: { tenantId, systemId, docType: "TAX_INVOICE", sourcePaymentId: { in: ids }, status: { notIn: ["VOIDED", "CANCELLED"] } },
    select: { id: true, sourcePaymentId: true },
    orderBy: { id: "asc" },
  });
  for (const t of tis) await lockDocumentRow(tx, tenantId, systemId, t.id);
  const docIds = [...new Set(all.map((p) => p.documentId))].sort();
  for (const d of docIds) await lockDocumentRow(tx, tenantId, systemId, d);
  await lockGroupHeadsOfDocsInTx(tx, tenantId, systemId, docIds); // round 11 · LOCK ORDER ขั้น 4 — ก่อนลงบัญชี (R10-2)
  const live = await tx.accountDocumentPayment.findMany({
    where: { id: { in: ids }, tenantId, systemId, voidedAt: null },
    orderBy: [{ documentId: "asc" }, { id: "asc" }],
    select: { id: true, documentId: true },
  });
  // ── ด่านปฏิเสธ (ก่อนเขียนอะไร) — เหมือน voidPayment: ใบลดหนี้ที่ยังมีผลอ้างใบกำกับอัตโนมัติ · ใบมัดจำที่ถูกหักไปแล้ว ──
  const liveIds = new Set(live.map((p) => p.id));
  await assertNoLiveCnOnAutoTaxInvoicesInTx(tx, systemId, tis.filter((t) => t.sourcePaymentId && liveIds.has(t.sourcePaymentId)).map((t) => t.id), AUTO_TI_CN_CHEQUE_MSG);
  for (const d of [...new Set(live.map((p) => p.documentId))]) {
    const doc = await tx.accountDocument.findFirst({ where: { id: d, tenantId, systemId }, select: { id: true, docType: true } });
    if (doc) await assertDepositNotAppliedInTx(tx, systemId, doc);
  }
  const unwound: Restored["unwound"] = [];
  for (const p of live) {
    const r = await unwindPaymentInTx(tx, ctx, p.id, CHEQUE_UNWIND_REASON, "CHEQUE");
    if (r) unwound.push(r);
  }
  // งวดที่ถูกยกเลิกไปก่อนหน้า: ไม่ลงซ้ำ (มติ A · legacy) — จดเฉพาะเงินที่ reversal ของงวดดึงออกจากบัญชีพักเช็คไปแล้ว (ใช้เมื่อเช็คเคลียร์แล้ว)
  let earlierReversedCash = 0;
  const done = new Set(unwound.map((u) => u.paymentId));
  const earlier = await tx.accountDocumentPayment.findMany({
    where: { id: { in: ids.filter((id) => !done.has(id)) }, tenantId, systemId, voidedAt: { not: null } },
    select: { id: true, amount: true, feeAmount: true, document: { select: { direction: true } } },
  });
  for (const p of earlier) {
    const reversed = await tx.accountJournalEntry.count({ where: { systemId, refType: "AccountDocumentPayment", refId: p.id, journal: "REVERSAL" } });
    if (reversed > 0) earlierReversedCash += p.document.direction === "IN" ? p.amount + p.feeAmount : p.amount - p.feeAmount;
  }
  await syncGroupHeadsOfDocsInTx(tx, tenantId, systemId, unwound.map((u) => u.documentId));
  // ผู้ติดต่อของบรรทัด AR/AP ของเช็คที่ขึ้นทะเบียนเอง = เอกสารของงวดที่ผูกเช็ค
  const head = all.find((p) => p.chequeId === chequeId) ?? all[0];
  const contactId = (await tx.accountDocument.findFirst({ where: { id: head.documentId }, select: { contactId: true } }))?.contactId ?? null;
  return { contactId, unwound, earlierReversedCash };
}

/** เช็คที่ขึ้นทะเบียนเอง (มี JV REGISTER ของตัวเช็ค) — บัญชีทั้งก้อนอยู่ที่เช็ค · เช็คที่ผูกงวดรับ/จ่าย (ฟอร์ม/ใบวางบิล) ไม่มี REGISTER */
async function chequeRegistered(tx: Tx, systemId: string, chequeId: string): Promise<boolean> {
  return (await tx.accountJournalEntry.count({ where: { systemId, refType: "AccountCheque", refId: chequeId, idempotencyKey: `AccountCheque#${chequeId}#REGISTER` } })) > 0;
}

type JvLine = { accountId: string; debit: number; credit: number; contactId?: string | null; note?: string };

/**
 * CRM C5.4-C ▸ (round 10 · มติ A) บรรทัด JV ของเช็คเด้ง (IN) / ยกเลิกเช็คจ่าย (OUT):
 *   • เช็คขึ้นทะเบียนเอง → เหมือนเดิม: AR/AP ↔ คู่บัญชี เต็มจำนวนเช็ค
 *   • เช็คของงวดรับ/จ่าย → **เฉพาะงวดที่คำสั่งนี้ยกเลิกจริง** (งวดที่ถูกยกเลิกไปก่อนแล้วไม่ลงซ้ำ):
 *       MIRROR  ขาย: Dr ลูกหนี้ (เงิน+WHT) · Cr 1160 WHT · Cr ค่าธรรมเนียม · Cr คู่บัญชี (เงิน−ค่าธรรมเนียม)
 *               ซื้อ: Cr เจ้าหนี้ (เงิน+WHT) · Dr 2130 WHT · Cr ค่าธรรมเนียม · Dr คู่บัญชี (เงิน+ค่าธรรมเนียม)
 *       DEPOSIT JV มัดจำถูกกลับแล้ว → คืนขาเงินที่ reversal ดึงออก · คู่บัญชี (ไม่มีลูกหนี้/เจ้าหนี้)
 *   • รวมยอดต่อบัญชี+ผู้ติดต่อ แล้วตัดบรรทัดที่เป็นศูนย์ (เช็คมัดจำที่ยังไม่เคลียร์ = ไม่มีบรรทัดเหลือ ⇒ ไม่ลง JV) ◂
 */
async function chequeUnwindLines(
  ctx: Ctx,
  tx: Tx,
  cq: { id: string; direction: AccountChequeDirection; amount: number },
  counterId: string,
  counterNote: string,
  restored: Restored,
): Promise<JvLine[]> {
  const IN = cq.direction === "IN";
  const raw: JvLine[] = [];
  const dr = (accountId: string, v: number, note?: string, contactId?: string | null) => { if (v) raw.push({ accountId, debit: v, credit: 0, note, contactId }); };
  const cr = (accountId: string, v: number, note?: string, contactId?: string | null) => { if (v) raw.push({ accountId, debit: 0, credit: v, note, contactId }); };
  const ctlKey = IN ? "AR" : "AP";
  const ctlNote = IN ? "ตั้งลูกหนี้กลับ (เช็คเด้ง)" : "ตั้งเจ้าหนี้กลับ (ยกเลิกเช็ค)";
  if (await chequeRegistered(tx, ctx.systemId, cq.id)) {
    const ctl = await resolveMapping(ctx, ctlKey, undefined, tx);
    if (IN) { dr(ctl, cq.amount, ctlNote, restored.contactId); cr(counterId, cq.amount, counterNote); }
    else { dr(counterId, cq.amount, counterNote); cr(ctl, cq.amount, ctlNote, restored.contactId); }
  } else {
    const ctl = await resolveMapping(ctx, ctlKey, undefined, tx);
    for (const u of restored.unwound) {
      const g = u.gl;
      if (g.kind === "MIRROR") {
        const whtId = g.wht > 0 ? await resolveMapping(ctx, IN ? "WHT_ASSET" : "WHT_PAYABLE", undefined, tx) : "";
        const feeId = g.fee > 0 ? await resolveMapping(ctx, "PAYMENT_FEE", undefined, tx) : "";
        if (IN) {
          dr(ctl, g.amount + g.wht, ctlNote, g.contactId);
          if (g.wht) cr(whtId, g.wht, "กลับภาษีถูกหัก ณ ที่จ่าย (เช็คเด้ง)", g.contactId);
          if (g.fee) cr(feeId, g.fee, "กลับค่าธรรมเนียม (เช็คเด้ง)");
          cr(counterId, g.amount - g.fee, counterNote);
        } else {
          cr(ctl, g.amount + g.wht, ctlNote, g.contactId);
          if (g.wht) dr(whtId, g.wht, "กลับภาษีหัก ณ ที่จ่ายค้างนำส่ง (ยกเลิกเช็ค)", g.contactId);
          if (g.fee) cr(feeId, g.fee, "กลับค่าธรรมเนียม (ยกเลิกเช็ค)");
          dr(counterId, g.amount + g.fee, counterNote);
        }
      } else if (g.kind === "DEPOSIT") {
        if (IN) { dr(g.cashAccountId, g.amount, "คืนขาเงินของใบรับมัดจำ (เช็คเด้ง)"); cr(counterId, g.amount, counterNote); }
        else { cr(g.cashAccountId, g.amount, "คืนขาเงินของใบจ่ายมัดจำ (ยกเลิกเช็ค)"); dr(counterId, g.amount, counterNote); }
      } else if (g.amount > 0) {
        // round 12 · R11-1/R11-4: งวดที่ไม่เคยลงบัญชี (ร่างใบเสร็จ · ใบมัดจำที่ยังรับไม่ครบ) — ไม่มีขาอื่นให้กลับ แต่ถ้าเช็คเคลียร์แล้ว
        //   JV เคลียร์ย้ายเงิน พักเช็ค → ธนาคาร ไว้ ⇒ พักเช็ค ↔ คู่บัญชี ของงวดนี้ (ยังไม่เคลียร์ = คู่บัญชีคือพักเช็ค หักล้างเป็นศูนย์)
        const transit = await resolveMapping(ctx, IN ? "CHEQUE_IN_TRANSIT" : "CHEQUE_PAYABLE", undefined, tx);
        if (IN) { dr(transit, g.amount, "งวดที่ยังไม่ลงบัญชี"); cr(counterId, g.amount, counterNote); }
        else { cr(transit, g.amount, "งวดที่ยังไม่ลงบัญชี"); dr(counterId, g.amount, counterNote); }
      }
    }
    // ข้อมูลเก่า: งวดที่ถูกยกเลิกไปก่อน (JV งวดกลับไปแล้ว) แต่เช็คถูกเคลียร์เข้าธนาคารทั้งใบ ⇒ คืนเงินส่วนนั้นจากธนาคารกลับบัญชีพักเช็ค
    if (restored.earlierReversedCash > 0) {
      const transit = await resolveMapping(ctx, IN ? "CHEQUE_IN_TRANSIT" : "CHEQUE_PAYABLE", undefined, tx);
      if (IN) { dr(transit, restored.earlierReversedCash, "งวดที่ยกเลิกไปก่อนหน้า"); cr(counterId, restored.earlierReversedCash, counterNote); }
      else { cr(transit, restored.earlierReversedCash, "งวดที่ยกเลิกไปก่อนหน้า"); dr(counterId, restored.earlierReversedCash, counterNote); }
    }
  }
  // รวมต่อบัญชี+ผู้ติดต่อ · ตัดศูนย์
  const net = new Map<string, JvLine>();
  for (const l of raw) {
    const k = `${l.accountId}|${l.contactId ?? ""}`;
    const cur = net.get(k) ?? { accountId: l.accountId, debit: 0, credit: 0, contactId: l.contactId ?? null, note: l.note };
    cur.debit += l.debit; cur.credit += l.credit;
    net.set(k, cur);
  }
  const out: JvLine[] = [];
  for (const l of net.values()) {
    const v = l.debit - l.credit;
    if (v > 0) out.push({ ...l, debit: v, credit: 0 });
    else if (v < 0) out.push({ ...l, debit: 0, credit: -v });
  }
  // เดบิตก่อนเครดิต (ลำดับเดิมของ JV เช็ค)
  return out.sort((a, b) => (b.debit > 0 ? 1 : 0) - (a.debit > 0 ? 1 : 0));
}

// ─────────────────── เปลี่ยนสถานะ (lifecycle) ───────────────────

/** นำฝาก (เช็ครับ ON_HAND → DEPOSITED) — ยังไม่ลงบัญชี (เงินยังไม่เข้าธนาคาร) */
export async function depositCheque(
  tenantId: string,
  systemId: string,
  id: string,
  depositedAt?: Date,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const cq = await getCheque(tenantId, systemId, id);
  if (!cq) return { ok: false, reason: "ไม่พบเช็ค" };
  if (cq.direction !== "IN") return { ok: false, reason: "นำฝากได้เฉพาะเช็ครับ" };
  if (cq.status !== "ON_HAND") return { ok: false, reason: "เช็คนี้ไม่อยู่สถานะรอนำฝาก" };
  // WO 5.4 (§10.4): บันทึกวันที่นำฝากจริง (ของเดิมเปลี่ยนแค่ status ไม่มีวันที่เก็บ)
  // WO D4: ห่อ $transaction เพิ่ม (ของเดิมเป็น update เดี่ยว) เพื่อยิง account.cheque.changed ในธุรกรรมเดียวกัน
  try {
  await prisma.$transaction(async (tx) => {
    // round 7 · N1: CAS — นำฝากซ้ำ/พร้อมเด้ง ไม่ทับสถานะที่เพิ่งเปลี่ยน
    const n = await tx.accountCheque.updateMany({ where: { id, tenantId, systemId, status: "ON_HAND" }, data: { status: "DEPOSITED", depositedAt: depositedAt ?? new Date() } });
    if (n.count !== 1) throw new Error("เช็คนี้ไม่อยู่สถานะรอนำฝากแล้ว — รีเฟรชหน้าแล้วตรวจสถานะล่าสุด");
    await emitChequeChanged(tx, { tenantId, systemId }, { chequeId: id, direction: cq.direction, chequeNo: cq.chequeNo, status: "DEPOSITED", amountSatang: cq.amount });
  });
  } catch (e) {
    return { ok: false, reason: safeReason(e, "นำฝากเช็คไม่สำเร็จ") };
  }
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
      const cq = await lockChequeRow(tx, tenantId, systemId, id); // round 7 · N1 (เคลียร์ ∥ เด้ง อ่านสถานะเดียวกันไม่ได้อีก)
      if (!cq) throw new Error("ไม่พบเช็ค");
      const again = alreadyMsg(cq.status, "เคลียร์", cq.direction);
      if (again) throw new Error(again);
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
      await casChequeStatus(tx, id, cq.status, { status: "CLEARED", clearedAt: date });
      await emitChequeChanged(tx, ctx, { chequeId: cq.id, direction: cq.direction, chequeNo: cq.chequeNo, status: "CLEARED", amountSatang: cq.amount });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เคลียร์เช็คไม่สำเร็จ") };
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
      const cq = await lockChequeRow(tx, tenantId, systemId, id); // round 7 · N1
      if (!cq) throw new Error("ไม่พบเช็ค");
      if (cq.direction !== "IN") throw new Error("เด้งได้เฉพาะเช็ครับ");
      const again = alreadyMsg(cq.status, "เด้ง", cq.direction);
      if (again) throw new Error(again);
      if (cq.status !== "ON_HAND" && cq.status !== "DEPOSITED" && cq.status !== "CLEARED")
        throw new Error("สถานะเช็คไม่รองรับการทำเด้ง");
      // คืนหนี้เอกสารที่ผูก (ถ้ามี) — round 10 · มติ A: ถอยทุกงวดด้วยตัวเดียวกับ voidPayment (ปฏิเสธก่อนเขียนถ้ามีใบลดหนี้/มัดจำถูกหัก)
      const restored = await restoreDocForCheque(tx, tenantId, systemId, id);
      // ตั้งลูกหนี้กลับ: ถ้าเคยเคลียร์แล้ว → Cr ธนาคาร (ดึงเงินคืน) · ยังไม่เคลียร์ → Cr 1040
      const counter =
        cq.status === "CLEARED"
          ? await bankLedgerId(ctx, cq.financeAccountId, tx)
          : await resolveMapping(ctx, "CHEQUE_IN_TRANSIT", undefined, tx);
      const lines = await chequeUnwindLines(ctx, tx, cq, counter, cq.status === "CLEARED" ? "หักเงินธนาคารคืน" : "ล้างเช็ครับรอนำฝาก", restored);
      if (lines.length > 0)
        await postChequeEntry(
          ctx,
          { chequeId: cq.id, event: "BOUNCE", book: "RECEIPTS", date: new Date(), memo: `เช็คเด้ง ${cq.chequeNo}${reason ? ` — ${reason}` : ""}`, lines },
          tx,
        );
      await casChequeStatus(tx, id, cq.status, { status: "BOUNCED", note: reason?.trim() || cq.note });
      await emitChequeChanged(tx, ctx, { chequeId: cq.id, direction: cq.direction, chequeNo: cq.chequeNo, status: "BOUNCED", amountSatang: cq.amount });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกเช็คเด้งไม่สำเร็จ") };
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
      const cq = await lockChequeRow(tx, tenantId, systemId, id); // round 7 · N1
      if (!cq) throw new Error("ไม่พบเช็ค");
      if (cq.direction !== "OUT") throw new Error("ยกเลิกได้เฉพาะเช็คจ่าย");
      const again = alreadyMsg(cq.status, "ยกเลิก", cq.direction);
      if (again) throw new Error(again);
      if (cq.status !== "ISSUED") throw new Error("ยกเลิกได้เฉพาะเช็คจ่ายที่ยังไม่ถูกเรียกเก็บ");
      const pay = await resolveMapping(ctx, "CHEQUE_PAYABLE", undefined, tx);
      // คืนหนี้เอกสารที่ผูก (ถ้ามี) — round 10 · มติ A: ถอยทุกงวดด้วยตัวเดียวกับ voidVendorPayment (50 ทวิ · JV ใบจ่ายมัดจำ · WHT)
      const restored = await restoreDocForCheque(tx, tenantId, systemId, id);
      const lines = await chequeUnwindLines(ctx, tx, cq, pay, "ล้างเช็คจ่ายรอเรียกเก็บ", restored);
      if (lines.length > 0)
        await postChequeEntry(
          ctx,
          { chequeId: cq.id, event: "VOID", book: "PAYMENTS", date: new Date(), memo: `ยกเลิกเช็คจ่าย ${cq.chequeNo}${reason ? ` — ${reason}` : ""}`, lines },
          tx,
        );
      await casChequeStatus(tx, id, cq.status, { status: "VOIDED", note: reason?.trim() || cq.note });
      await emitChequeChanged(tx, ctx, { chequeId: cq.id, direction: cq.direction, chequeNo: cq.chequeNo, status: "VOIDED", amountSatang: cq.amount });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ยกเลิกเช็คไม่สำเร็จ") };
  }
}
