// ─────────────────────────────────────────────────────────────
// reconcile.ts — กระทบยอดธนาคาร (bank reconciliation) — WO 5.3
// อ้าง DESIGN-SPEC-V2 §10.2 · เฟรม g10-bank-reconcile.png · checklist เต็มใน ledger/wo-notes/5.3.md
//
// นิยาม 2 ฝั่ง:
//   ฝั่งธนาคาร  = AccountBankStatementLine (นำเข้าจาก CSV ของธนาคาร)
//   ฝั่งระบบ    = AccountJournalLine ที่ลงบัญชี GL ของช่องทางนั้น (AccountFinance.ledgerAccountId)
//                 → 1 แถว statement จับคู่กับ 1 "บรรทัด" สมุดรายวัน (ไม่ใช่ทั้งใบ — JV โอนระหว่าง
//                   ช่องทางมีบรรทัดธนาคาร 2 บัญชี ถ้าผูกระดับใบจะชนกัน)
//
// กติกาจับคู่อัตโนมัติ (ปลอดภัยกว่าที่ร่างไว้ — ดู wo-notes "ต่างจากใบสั่งงาน"):
//   ยอดต้องเท่ากันเป๊ะเสมอ (สตางค์ + เครื่องหมาย) · ค้นในช่วงวัน ±3
//   ตรงวันเดียวกัน + มีตัวเลือกเดียว           → MATCHED (จับคู่ให้เลย)
//   ตรงยอดแต่วันคลาด 1–3 วัน หรือมีหลายตัวเลือก → SUGGESTED (แนะนำ · คนกดยืนยัน) + ข้อความใบ้ตาม g10
//   ไม่มีตัวเลือก                              → UNMATCHED
//   จับคู่ 1:1 เสมอ (บรรทัดสมุดรายวันที่ถูกจองไปแล้วไม่ถูกเสนอซ้ำ — บังคับด้วย unique index ชั้น DB ด้วย)
//
// กติกาเงิน/ความปลอดภัย: satang integer ทุกจุด · ทุก query ผูก tenantId+systemId ·
//   โพสต์บัญชีผ่าน gl.ts เท่านั้น (postBankReconcileEntry) · เขียนทุกครั้ง = writeAudit
// ─────────────────────────────────────────────────────────────

import { tenantDb } from "@/lib/core/db";
import type { Prisma, AccountBankStatementLineStatus, AccountDocType } from "@prisma/client";
import { postBankReconcileEntry, resolveMapping } from "./gl";
import { writeAudit } from "./access";
import { emitReconcileConfirmed } from "./events";
// WO 5.5 — ตะขอ "คำขอ QR พร้อมเพย์ที่ยังรอชำระ ↔ แถวเงินเข้าใน statement"
// (payment-request.ts ไม่ import ไฟล์นี้กลับ ⇒ ไม่มีวงจร import)
import { settleStaticRequestsFromStatement } from "./payment-request";
import { editorDetailPath } from "./doc-editor-config";
import { dayKeyBkk, monthStart, monthEndExclusive } from "./dashboard";
import { formatDateTh } from "@/lib/ui/date";
import {
  parseBankStatementCsv,
  BANK_SOURCE_LABEL,
  type BankSource,
  type ParsedStatementRow,
} from "./bank-statement-csv";

export type ReconcileCtx = { tenantId: string; systemId: string };
type Tx = Prisma.TransactionClient;
// ทุก query ผ่าน `tenantDb(ctx)` (inject tenantId+systemId ให้อัตโนมัติ) — เงื่อนไขที่เขียนซ้ำในโค้ด
// เป็นเกราะชั้นที่สอง ไม่ใช่ที่พึ่งเดียว · `$queryRaw` ไม่ผ่าน extension ⇒ เขียน WHERE เองครบทั้งสองแกน
// (แนวเดียวกับ dashboard.ts) · transaction ที่ต้องส่งต่อให้ gl.ts cast เป็น Prisma.TransactionClient
// เหมือน contact-merge.ts (ตัว tx ตัวเดียวกัน แค่ชนิดต่างเพราะเป็น extended client)

/** ช่วงวันที่ยอมให้คลาดได้ตอนจับคู่ (วัน) — §10.2 "ยอด + วันที่ ±3" */
export const MATCH_DAY_WINDOW = 3;

export type ReconcileFail = { ok: false; reason: string };
const fail = (reason: string): ReconcileFail => ({ ok: false, reason });

// ─────────────────── ตัวช่วยวัน ───────────────────

function dayIndex(dayKey: string): number {
  return Math.round(Date.parse(`${dayKey}T00:00:00Z`) / 86_400_000);
}

function dayDiff(a: Date, b: Date): number {
  return Math.abs(dayIndex(dayKeyBkk(a)) - dayIndex(dayKeyBkk(b)));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

export function isPeriodKey(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

// ─────────────────── ช่องทาง ───────────────────

export type ReconcileChannel = {
  id: string;
  code: string | null;
  name: string;
  ledgerAccountId: string;
  ledgerCode: string;
  bankName: string | null;
  accountNo: string | null;
};

/** ช่องทางที่กระทบยอดได้ = ธนาคาร/e-Wallet ที่ยังใช้งานอยู่และผูกบัญชี GL แล้ว */
export async function listReconcilableChannels(ctx: ReconcileCtx): Promise<ReconcileChannel[]> {
  const rows = await tenantDb(ctx).accountFinance.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      archivedAt: null,
      type: { in: ["BANK", "E_WALLET"] },
      ledgerAccountId: { not: null },
    },
    orderBy: [{ type: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, ledgerAccountId: true, bankName: true, accountNo: true },
  });
  if (rows.length === 0) return [];
  const ledgers = await tenantDb(ctx).accountLedger.findMany({
    where: { systemId: ctx.systemId, id: { in: rows.map((r) => r.ledgerAccountId!) } },
    select: { id: true, code: true },
  });
  const codeById = new Map(ledgers.map((l) => [l.id, l.code]));
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    ledgerAccountId: r.ledgerAccountId!,
    ledgerCode: codeById.get(r.ledgerAccountId!) ?? "—",
    bankName: r.bankName,
    accountNo: r.accountNo,
  }));
}

/**
 * หาช่องทางเดียวจากรายการช่องทางทั้งหมด
 * 🔴 WO 9.3 (งบ query): หน้าจอ g10 เรียก `listReconcilableChannels` เองอยู่แล้ว (ทำ dropdown)
 *    ถ้าตัวนี้โหลดซ้ำอีกรอบ = ยิง AccountFinance + AccountLedger ซ้ำเปล่า ๆ 2 query
 *    → รับรายการที่โหลดมาแล้วผ่าน `channels` ได้ (ไม่ส่งมาก็ยังโหลดเองเหมือนเดิม)
 */
async function getChannel(ctx: ReconcileCtx, financeId: string, channels?: ReconcileChannel[]): Promise<ReconcileChannel | null> {
  const all = channels ?? (await listReconcilableChannels(ctx));
  return all.find((c) => c.id === financeId) ?? null;
}

// ─────────────────── นำเข้า statement ───────────────────

export type ImportPreviewRow = {
  seq: number;
  csvRow: number;
  dateText: string;
  description: string;
  refNo: string | null;
  amountSatang: number;
  balanceAfterSatang: number | null;
  duplicate: boolean; // มีอยู่แล้วในระบบ (fingerprint ซ้ำ) → นำเข้าจริงจะข้าม
  outOfPeriod: boolean; // ไม่อยู่ในเดือนที่เลือก → นำเข้าจริงจะข้าม
};

export type ImportPreview = {
  source: BankSource;
  sourceLabel: string;
  headers: string[];
  totalRows: number;
  newRows: number;
  duplicateRows: number;
  outOfPeriodRows: number;
  errors: { row: number; reason: string }[];
  rows: ImportPreviewRow[]; // 20 แถวแรก (§ ตาม pattern WO 1.8)
  closingFromFile: number | null;
  openingFromFile: number | null;
};

export const IMPORT_PREVIEW_ROWS = 20;

function inPeriod(d: Date, periodKey: string): boolean {
  return dayKeyBkk(d).slice(0, 7) === periodKey;
}

async function existingFingerprints(ctx: ReconcileCtx, financeId: string, fps: string[]): Promise<Set<string>> {
  if (fps.length === 0) return new Set();
  const rows = await tenantDb(ctx).accountBankStatementLine.findMany({
    where: { financeId, fingerprint: { in: fps } },
    select: { fingerprint: true },
  });
  return new Set(rows.map((r) => r.fingerprint));
}

/** ขั้น "ตรวจสอบก่อนนำเข้า" — ไม่เขียน DB (pattern เดียวกับนำเข้า CSV ของ WO 1.8) */
export async function previewStatementImport(
  ctx: ReconcileCtx,
  input: { financeId: string; periodKey: string; source: BankSource; text: string },
): Promise<ImportPreview | ReconcileFail> {
  const channel = await getChannel(ctx, input.financeId);
  if (!channel) return fail("ไม่พบช่องทางการเงินนี้ (หรือยังไม่ได้ผูกบัญชีแยกประเภท)");
  if (!isPeriodKey(input.periodKey)) return fail("รูปแบบเดือนไม่ถูกต้อง");

  const parsed = parseBankStatementCsv(input.text, input.source);
  const dup = await existingFingerprints(ctx, input.financeId, parsed.rows.map((r) => r.fingerprint));

  let newRows = 0;
  let duplicateRows = 0;
  let outOfPeriodRows = 0;
  const rows: ImportPreviewRow[] = [];
  for (const r of parsed.rows) {
    const duplicate = dup.has(r.fingerprint);
    const outOfPeriod = !inPeriod(r.txDate, input.periodKey);
    if (outOfPeriod) outOfPeriodRows++;
    else if (duplicate) duplicateRows++;
    else newRows++;
    if (rows.length < IMPORT_PREVIEW_ROWS) {
      rows.push({
        seq: r.seq,
        csvRow: r.csvRow,
        // วันที่บนจอต้องเป็นแบบไทย ("5 ก.ย. 2026") ไม่ใช่ ISO ดิบ — ตีกลับรอบ 2 ของ WO 5.2 ก็เรื่องนี้
        dateText: formatDateTh(r.txDate),
        description: r.description,
        refNo: r.refNo,
        amountSatang: r.amountSatang,
        balanceAfterSatang: r.balanceAfterSatang,
        duplicate,
        outOfPeriod,
      });
    }
  }

  return {
    source: parsed.source,
    sourceLabel: BANK_SOURCE_LABEL[parsed.source],
    headers: parsed.headers,
    totalRows: parsed.rows.length,
    newRows,
    duplicateRows,
    outOfPeriodRows,
    errors: parsed.errors,
    rows,
    closingFromFile: parsed.closingFromFile,
    openingFromFile: parsed.openingFromFile,
  };
}

export type ImportResult = {
  ok: true;
  statementId: string;
  imported: number;
  duplicates: number;
  outOfPeriod: number;
  errors: { row: number; reason: string }[];
  closingBalanceSatang: number;
};

/**
 * นำเข้าแถว statement จริง — idempotent ต่อไฟล์ (fingerprint ซ้ำ = ข้าม ⇒ นำเข้าไฟล์เดิมซ้ำได้ 0 แถวใหม่)
 * 1 ช่องทาง 1 เดือน = 1 ใบ statement (นำเข้าเพิ่ม = เติมแถวลงใบเดิม + คำนวณยอดปลายงวดใหม่)
 */
export async function importStatement(
  ctx: ReconcileCtx,
  input: { financeId: string; periodKey: string; source: BankSource; fileName: string; text: string; userId?: string | null },
): Promise<ImportResult | ReconcileFail> {
  const channel = await getChannel(ctx, input.financeId);
  if (!channel) return fail("ไม่พบช่องทางการเงินนี้ (หรือยังไม่ได้ผูกบัญชีแยกประเภท)");
  if (!isPeriodKey(input.periodKey)) return fail("รูปแบบเดือนไม่ถูกต้อง");

  const locked = await isPeriodLocked(ctx, input.financeId, input.periodKey);
  if (locked) return fail("เดือนนี้ยืนยันกระทบยอดแล้ว — เปิดกลับก่อนจึงจะนำเข้าเพิ่มได้");

  const parsed = parseBankStatementCsv(input.text, input.source);
  if (parsed.rows.length === 0) {
    return fail(parsed.errors[0]?.reason ?? "ไม่พบรายการในไฟล์");
  }

  const usable = parsed.rows.filter((r) => inPeriod(r.txDate, input.periodKey));
  const outOfPeriod = parsed.rows.length - usable.length;
  if (usable.length === 0) return fail(`ไม่มีแถวใดอยู่ในเดือน ${input.periodKey} (ไฟล์มี ${parsed.rows.length} แถว)`);

  const existing = await existingFingerprints(ctx, input.financeId, usable.map((r) => r.fingerprint));
  const fresh = usable.filter((r) => !existing.has(r.fingerprint));

  const result = await tenantDb(ctx).$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const statement = await upsertStatement(tx, ctx, {
      financeId: input.financeId,
      periodKey: input.periodKey,
      source: parsed.source,
      fileName: input.fileName,
      userId: input.userId ?? null,
    });

    if (fresh.length > 0) {
      const maxSeq = await tx.accountBankStatementLine.aggregate({
        where: { systemId: ctx.systemId, statementId: statement.id },
        _max: { seq: true },
      });
      let seq = maxSeq._max.seq ?? 0;
      await tx.accountBankStatementLine.createMany({
        data: fresh.map((r: ParsedStatementRow) => ({
          statementId: statement.id,
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          financeId: input.financeId,
          seq: ++seq,
          txDate: r.txDate,
          description: r.description.slice(0, 500),
          refNo: r.refNo?.slice(0, 100) ?? null,
          amountSatang: r.amountSatang,
          balanceAfterSatang: r.balanceAfterSatang,
          fingerprint: r.fingerprint,
        })),
        skipDuplicates: true, // กันแข่งกันนำเข้าพร้อมกัน (unique financeId+fingerprint)
      });
    }

    const totals = await recomputeStatementTotals(tx, ctx, statement.id, parsed.openingFromFile, parsed.closingFromFile);
    return { statementId: statement.id, closing: totals.closing };
  });

  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: input.userId ?? null,
    action: "account.reconcile.import",
    targetType: "AccountBankStatement",
    targetId: result.statementId,
    after: { financeId: input.financeId, periodKey: input.periodKey, source: parsed.source, imported: fresh.length, fileName: input.fileName },
  });

  return {
    ok: true,
    statementId: result.statementId,
    imported: fresh.length,
    duplicates: usable.length - fresh.length,
    outOfPeriod,
    errors: parsed.errors,
    closingBalanceSatang: result.closing,
  };
}

async function upsertStatement(
  tx: Tx,
  ctx: ReconcileCtx,
  o: { financeId: string; periodKey: string; source: BankSource; fileName: string; userId: string | null },
) {
  const found = await tx.accountBankStatement.findFirst({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, financeId: o.financeId, periodKey: o.periodKey },
    select: { id: true },
  });
  if (found) {
    await tx.accountBankStatement.update({
      where: { id: found.id },
      data: { source: o.source, fileName: o.fileName, importedAt: new Date(), importedById: o.userId },
    });
    return found;
  }
  return tx.accountBankStatement.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      financeId: o.financeId,
      periodKey: o.periodKey,
      source: o.source,
      fileName: o.fileName,
      importedById: o.userId,
      closingBalanceSatang: 0,
    },
    select: { id: true },
  });
}

/** ยอดปลายงวดของ statement: ใช้คอลัมน์ยอดคงเหลือแถวสุดท้ายถ้ามี · ไม่มี = ยอดยกมา + Σ แถว */
async function recomputeStatementTotals(
  tx: Tx,
  ctx: ReconcileCtx,
  statementId: string,
  openingFromFile: number | null,
  closingFromFile: number | null,
): Promise<{ closing: number; opening: number | null; rowCount: number }> {
  const agg = await tx.accountBankStatementLine.aggregate({
    where: { systemId: ctx.systemId, statementId },
    _sum: { amountSatang: true },
    _count: { _all: true },
  });
  const sum = agg._sum.amountSatang ?? 0;
  const rowCount = agg._count._all;
  const opening = openingFromFile;
  const closing = closingFromFile ?? (opening ?? 0) + sum;
  await tx.accountBankStatement.update({
    where: { id: statementId },
    data: { rowCount, openingBalanceSatang: opening, closingBalanceSatang: closing },
  });
  return { closing, opening, rowCount };
}

// ─────────────────── ฝั่งระบบ (บรรทัดสมุดรายวันของช่องทาง) ───────────────────

export type SystemEntryRow = {
  lineId: string;
  entryId: string;
  docNo: string;
  date: Date;
  amountSatang: number; // + = เงินเข้า (debit) · − = เงินออก (credit)
  label: string; // "รับชำระ IV-202609-0031" ฯลฯ
  memo: string | null;
  refType: string | null;
  refId: string | null;
  documentId: string | null;
  documentNo: string | null;
  /** ลิงก์ไปหน้าเอกสาร (คำนวณจาก base ที่ผู้เรียกส่งมา — null เมื่อบรรทัดนี้ไม่ได้มาจากเอกสาร) */
  documentHref: string | null;
  reconciled: boolean;
  /** WO B3: id ของแถว statement ที่บรรทัดนี้กระทบยอดด้วยแล้ว (null = ยังไม่กระทบยอด) */
  matchedLineId: string | null;
};

/** ป้ายกำกับฝั่งระบบ (g10 คอลัมน์ "รายละเอียด") — อิงเอกสาร/ใบสำคัญที่มา */
function labelOf(memo: string | null, docNo: string | null, fallbackDocNo: string): string {
  const base = memo?.trim() || "รายการบัญชี";
  if (docNo) return `${base} ${docNo}`;
  return `${base} ${fallbackDocNo}`;
}

/**
 * บรรทัดฝั่งระบบของช่องทางนี้ในช่วงงวด (ขยายหัว-ท้าย ±3 วันเพื่อให้จับคู่ข้ามเดือนได้)
 * ไม่รวมบรรทัดที่กระทบยอดไปแล้ว เว้นแต่ระบุ includeReconciled
 */
export async function listSystemEntries(
  ctx: ReconcileCtx,
  o: { ledgerAccountId: string; periodKey: string; includeReconciled?: boolean; base?: string },
): Promise<SystemEntryRow[]> {
  const from = addDays(monthStart(o.periodKey), -MATCH_DAY_WINDOW);
  const to = addDays(monthEndExclusive(o.periodKey), MATCH_DAY_WINDOW);

  const lines = await tenantDb(ctx).accountJournalLine.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      accountId: o.ledgerAccountId,
      ...(o.includeReconciled ? {} : { reconciledAt: null }),
      entry: { date: { gte: from, lt: to }, status: { not: "REVERSED" } },
    },
    select: {
      id: true,
      debit: true,
      credit: true,
      note: true,
      reconciledAt: true,
      reconciledStatementLineId: true,
      entry: { select: { id: true, docNo: true, date: true, memo: true, refType: true, refId: true } },
    },
    orderBy: [{ entry: { date: "asc" } }, { id: "asc" }],
  });

  // เอกสารต้นทาง (สำหรับป้าย "รับชำระ IV-…" / "จ่าย PUR-…") — ดึงเป็นชุดเดียว ไม่ยิงต่อแถว
  const paymentIds = lines.filter((l) => l.entry.refType === "AccountDocumentPayment" && l.entry.refId).map((l) => l.entry.refId!);
  const docIds = lines.filter((l) => l.entry.refType === "AccountDocument" && l.entry.refId).map((l) => l.entry.refId!);
  // 🔴 WO 9.3 (งบ query): เดิม select ซ้อน `document` ในใบรับชำระ → prisma แตกเป็นอีก query หนึ่ง
  //    รวมกับ query เอกสารตรง ๆ ด้านล่างกลายเป็นยิง AccountDocument 2 ครั้งด้วยชุด id คนละชุด
  //    → เอาแค่ documentId มา แล้วยิง AccountDocument **ครั้งเดียว** ด้วย id ที่รวมทั้งสองทาง
  //    (ทุกตัวมี guard `.length` — ชุดว่างต้องไม่ยิง ไม่งั้น prisma ยิง `IN (NULL)` ทิ้งเปล่า ๆ)
  const payments = paymentIds.length
    ? await tenantDb(ctx).accountDocumentPayment.findMany({
        where: { systemId: ctx.systemId, id: { in: paymentIds } },
        select: { id: true, documentId: true },
      })
    : [];
  const allDocIds = [...new Set([...docIds, ...payments.map((p) => p.documentId)])];
  const docs = allDocIds.length
    ? await tenantDb(ctx).accountDocument.findMany({ where: { systemId: ctx.systemId, id: { in: allDocIds } }, select: { id: true, docNo: true, docType: true } })
    : [];
  const payMap = new Map(payments.map((p) => [p.id, p]));
  const docMap = new Map(docs.map((d) => [d.id, d]));

  return lines.map((l) => {
    let documentId: string | null = null;
    let documentNo: string | null = null;
    let documentType: AccountDocType | null = null;
    if (l.entry.refType === "AccountDocumentPayment" && l.entry.refId) {
      const p = payMap.get(l.entry.refId);
      const d = p ? docMap.get(p.documentId) : undefined; // เอกสารมาจาก docMap ชุดเดียวกับทางตรง
      documentId = d?.id ?? null;
      documentNo = d?.docNo ?? null;
      documentType = d?.docType ?? null;
    } else if (l.entry.refType === "AccountDocument" && l.entry.refId) {
      const d = docMap.get(l.entry.refId);
      documentId = d?.id ?? null;
      documentNo = d?.docNo ?? null;
      documentType = d?.docType ?? null;
    }
    return {
      lineId: l.id,
      entryId: l.entry.id,
      docNo: l.entry.docNo,
      date: l.entry.date,
      amountSatang: l.debit - l.credit,
      label: labelOf(l.entry.memo ?? l.note, documentNo, l.entry.docNo),
      memo: l.entry.memo,
      refType: l.entry.refType,
      refId: l.entry.refId,
      documentId,
      documentNo,
      documentHref: o.base && documentId && documentType ? editorDetailPath(o.base, documentType, documentId) : null,
      reconciled: l.reconciledAt != null,
      matchedLineId: l.reconciledStatementLineId,
    };
  });
}

// ─────────────────── จับคู่อัตโนมัติ ───────────────────

export type AutoMatchResult = {
  ok: true;
  matched: number;
  suggested: number;
  unmatched: number;
  skipped: number;
  created: number;
};

function hintFor(diffDays: number, ambiguous: boolean): string {
  if (ambiguous) return `ยอดตรงกันแต่มีรายการในระบบมากกว่า 1 รายการ (ห่าง ${diffDays} วัน)`;
  return diffDays === 0 ? "ยอดและวันที่ตรงกัน" : `ยอดและวันที่ตรงกัน ±${diffDays} วัน`;
}

/**
 * จับคู่อัตโนมัติทั้งใบ — คำนวณใหม่ทุกครั้ง (แถวที่คนจับคู่/สร้าง/ข้ามไว้แล้วไม่ถูกแตะ)
 * ลำดับ: ตรงวันเดียวกันก่อน (รอบที่ 1) แล้วค่อยไล่ระยะ 1→3 วัน (รอบที่ 2) เพื่อไม่ให้แถววันคลาด
 * ไปแย่งบรรทัดที่ควรเป็นของแถววันตรง
 */
export async function autoMatch(ctx: ReconcileCtx, statementId: string, userId?: string | null): Promise<AutoMatchResult | ReconcileFail> {
  const statement = await tenantDb(ctx).accountBankStatement.findFirst({
    where: { id: statementId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, financeId: true, periodKey: true, confirmedAt: true },
  });
  if (!statement) return fail("ไม่พบรายการเดินบัญชีที่นำเข้า");
  if (statement.confirmedAt) return fail("เดือนนี้ยืนยันกระทบยอดแล้ว — เปิดกลับก่อนจึงจะจับคู่ใหม่ได้");
  const channel = await getChannel(ctx, statement.financeId);
  if (!channel) return fail("ไม่พบช่องทางการเงินนี้");

  // 🔗 WO 5.5 — ก่อนจับคู่: แถวเงินเข้าที่ยอด+วันตรงกับ "คำขอ QR พร้อมเพย์ที่ยังรอชำระ" = ลูกค้าโอนมาแล้วจริง
  //    → บันทึกรับชำระ + JV ให้ก่อน แล้วรอบจับคู่ด้านล่างจะเห็นบรรทัดใหม่ (วันตรงเป๊ะ) แล้วจับคู่ให้เอง
  //    🔴 ต้องอยู่ **ก่อน** listSystemEntries เสมอ ไม่งั้นบรรทัดที่เพิ่งสร้างตกสำรวจรอบนี้ (idempotent ในตัว)
  const preLines = await tenantDb(ctx).accountBankStatementLine.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, statementId },
    select: { id: true, amountSatang: true, txDate: true, status: true, matchedLineId: true },
    orderBy: [{ txDate: "asc" }, { seq: "asc" }],
  });
  await settleStaticRequestsFromStatement(ctx, statement.financeId, preLines);

  const [lines, system] = await Promise.all([
    tenantDb(ctx).accountBankStatementLine.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, statementId },
      orderBy: [{ txDate: "asc" }, { seq: "asc" }],
    }),
    listSystemEntries(ctx, { ledgerAccountId: channel.ledgerAccountId, periodKey: statement.periodKey }),
  ]);

  // บรรทัดฝั่งระบบที่ยังว่าง (ยังไม่ถูกกระทบยอด และยังไม่ถูกแถวอื่นจองในรอบนี้)
  const taken = new Set(lines.filter((l) => l.matchedLineId).map((l) => l.matchedLineId!));
  const free = system.filter((s) => !taken.has(s.lineId));
  const byAmount = new Map<number, SystemEntryRow[]>();
  for (const s of free) {
    const arr = byAmount.get(s.amountSatang);
    if (arr) arr.push(s);
    else byAmount.set(s.amountSatang, [s]);
  }

  const open = lines.filter((l) => l.status === "UNMATCHED" || l.status === "SUGGESTED");
  const updates: { id: string; status: AccountBankStatementLineStatus; matchedLineId: string | null; matchedEntryId: string | null; suggestedLineId: string | null; suggestedEntryId: string | null; suggestedHint: string | null }[] = [];
  const claim = (s: SystemEntryRow) => {
    const arr = byAmount.get(s.amountSatang);
    if (arr) byAmount.set(s.amountSatang, arr.filter((x) => x.lineId !== s.lineId));
  };

  const decided = new Set<string>();

  // รอบที่ 1 — วันตรงกันเป๊ะ + ตัวเลือกเดียว = จับคู่ให้เลย
  for (const l of open) {
    const cands = (byAmount.get(l.amountSatang) ?? []).filter((s) => dayDiff(s.date, l.txDate) === 0);
    if (cands.length === 1) {
      claim(cands[0]);
      decided.add(l.id);
      updates.push({
        id: l.id,
        status: "MATCHED",
        matchedLineId: cands[0].lineId,
        matchedEntryId: cands[0].entryId,
        suggestedLineId: null,
        suggestedEntryId: null,
        suggestedHint: null,
      });
    }
  }

  // รอบที่ 2 — ที่เหลือ: ยอดตรงในช่วง ±3 วัน → แนะนำ (คนกดยืนยัน)
  for (const l of open) {
    if (decided.has(l.id)) continue;
    const cands = (byAmount.get(l.amountSatang) ?? [])
      .map((s) => ({ s, d: dayDiff(s.date, l.txDate) }))
      .filter((c) => c.d <= MATCH_DAY_WINDOW)
      .sort((a, b) => a.d - b.d || a.s.date.getTime() - b.s.date.getTime());
    if (cands.length === 0) {
      updates.push({ id: l.id, status: "UNMATCHED", matchedLineId: null, matchedEntryId: null, suggestedLineId: null, suggestedEntryId: null, suggestedHint: null });
      continue;
    }
    const best = cands[0];
    claim(best.s);
    updates.push({
      id: l.id,
      status: "SUGGESTED",
      matchedLineId: null,
      matchedEntryId: null,
      suggestedLineId: best.s.lineId,
      suggestedEntryId: best.s.entryId,
      suggestedHint: hintFor(best.d, cands.length > 1),
    });
  }

  await tenantDb(ctx).$transaction(async (tx) => {
    for (const u of updates) {
      await tx.accountBankStatementLine.updateMany({
        where: { id: u.id, tenantId: ctx.tenantId, systemId: ctx.systemId },
        data: {
          status: u.status,
          matchedLineId: u.matchedLineId,
          matchedEntryId: u.matchedEntryId,
          suggestedLineId: u.suggestedLineId,
          suggestedEntryId: u.suggestedEntryId,
          suggestedHint: u.suggestedHint,
          matchedAt: u.status === "MATCHED" ? new Date() : null,
          matchedById: u.status === "MATCHED" ? userId ?? null : null,
        },
      });
      if (u.status === "MATCHED" && u.matchedLineId) {
        await tx.accountJournalLine.updateMany({
          where: { id: u.matchedLineId, tenantId: ctx.tenantId, systemId: ctx.systemId, reconciledAt: null },
          data: { reconciledAt: new Date(), reconciledStatementLineId: u.id },
        });
      }
    }
  });

  const counts = await countByStatus(ctx, statementId);
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: userId ?? null,
    action: "account.reconcile.auto_match",
    targetType: "AccountBankStatement",
    targetId: statementId,
    after: counts,
  });
  return { ok: true, ...counts };
}

async function countByStatus(ctx: ReconcileCtx, statementId: string) {
  const rows = await tenantDb(ctx).accountBankStatementLine.groupBy({
    by: ["status"],
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, statementId },
    _count: { _all: true },
  });
  const get = (s: AccountBankStatementLineStatus) => rows.find((r) => r.status === s)?._count._all ?? 0;
  return {
    matched: get("MATCHED"),
    suggested: get("SUGGESTED"),
    unmatched: get("UNMATCHED"),
    skipped: get("SKIPPED"),
    created: get("CREATED"),
  };
}

// ─────────────────── จับคู่/ยกเลิก/ข้าม ด้วยมือ ───────────────────

async function loadOpenLine(ctx: ReconcileCtx, lineId: string) {
  const line = await tenantDb(ctx).accountBankStatementLine.findFirst({
    where: { id: lineId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    include: { statement: { select: { id: true, confirmedAt: true, periodKey: true, financeId: true } } },
  });
  return line;
}

/** จับคู่ด้วยมือ — ยอดต้องเท่ากันเป๊ะ · ต้องเป็นบรรทัดของบัญชี GL ของช่องทางเดียวกัน · 1:1 */
export async function manualMatch(
  ctx: ReconcileCtx,
  input: { lineId: string; journalLineId: string; userId?: string | null },
): Promise<{ ok: true } | ReconcileFail> {
  const line = await loadOpenLine(ctx, input.lineId);
  if (!line) return fail("ไม่พบแถวรายการเดินบัญชี");
  if (line.statement.confirmedAt) return fail("เดือนนี้ยืนยันกระทบยอดแล้ว — เปิดกลับก่อนจึงจะแก้การจับคู่ได้");
  if (line.status === "MATCHED" || line.status === "CREATED") return fail("แถวนี้จับคู่ไว้แล้ว — ยกเลิกการจับคู่ก่อน");

  const channel = await getChannel(ctx, line.financeId);
  if (!channel) return fail("ไม่พบช่องทางการเงินนี้");

  const jl = await tenantDb(ctx).accountJournalLine.findFirst({
    where: { id: input.journalLineId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, accountId: true, debit: true, credit: true, reconciledAt: true, entry: { select: { id: true, docNo: true, status: true } } },
  });
  if (!jl) return fail("ไม่พบรายการในระบบที่เลือก");
  if (jl.accountId !== channel.ledgerAccountId) return fail("รายการที่เลือกไม่ได้ลงบัญชีของช่องทางนี้");
  if (jl.entry.status === "REVERSED") return fail("รายการในระบบนี้ถูกกลับรายการไปแล้ว");
  if (jl.reconciledAt) return fail("รายการในระบบนี้ถูกกระทบยอดกับแถวอื่นไปแล้ว");
  const sysAmount = jl.debit - jl.credit;
  if (sysAmount !== line.amountSatang) {
    return fail(`จำนวนเงินไม่ตรงกัน — statement ${(line.amountSatang / 100).toFixed(2)} · ระบบ ${(sysAmount / 100).toFixed(2)} (ต้องเท่ากันเป๊ะ)`);
  }

  try {
    await tenantDb(ctx).$transaction(async (tx) => {
      const claimed = await tx.accountJournalLine.updateMany({
        where: { id: jl.id, tenantId: ctx.tenantId, systemId: ctx.systemId, reconciledAt: null },
        data: { reconciledAt: new Date(), reconciledStatementLineId: line.id },
      });
      if (claimed.count === 0) throw new Error("RACE");
      await tx.accountBankStatementLine.updateMany({
        where: { id: line.id, tenantId: ctx.tenantId, systemId: ctx.systemId },
        data: {
          status: "MATCHED",
          matchedLineId: jl.id,
          matchedEntryId: jl.entry.id,
          suggestedLineId: null,
          suggestedEntryId: null,
          suggestedHint: null,
          matchedAt: new Date(),
          matchedById: input.userId ?? null,
        },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "RACE") return fail("รายการในระบบนี้เพิ่งถูกจับคู่ไปแล้ว — โหลดหน้าใหม่");
    throw e;
  }

  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: input.userId ?? null,
    action: "account.reconcile.match",
    targetType: "AccountBankStatementLine",
    targetId: line.id,
    after: { journalLineId: jl.id, entryDocNo: jl.entry.docNo, amountSatang: line.amountSatang },
  });
  return { ok: true };
}

/** ยกเลิกการจับคู่ — คืนบรรทัดฝั่งระบบให้ว่าง แล้วกลับเป็น "รอจับคู่" */
export async function unmatch(ctx: ReconcileCtx, input: { lineId: string; userId?: string | null }): Promise<{ ok: true } | ReconcileFail> {
  const line = await loadOpenLine(ctx, input.lineId);
  if (!line) return fail("ไม่พบแถวรายการเดินบัญชี");
  if (line.statement.confirmedAt) return fail("เดือนนี้ยืนยันกระทบยอดแล้ว — เปิดกลับก่อนจึงจะแก้การจับคู่ได้");
  if (line.status === "CREATED") return fail("แถวนี้สร้างรายการบัญชีไปแล้ว — ยกเลิกการจับคู่ไม่ได้ (ต้องกลับรายการใบสำคัญนั้น)");
  if (line.status !== "MATCHED") return fail("แถวนี้ยังไม่ได้จับคู่");

  await tenantDb(ctx).$transaction(async (tx) => {
    if (line.matchedLineId) {
      await tx.accountJournalLine.updateMany({
        where: { id: line.matchedLineId, tenantId: ctx.tenantId, systemId: ctx.systemId },
        data: { reconciledAt: null, reconciledStatementLineId: null },
      });
    }
    await tx.accountBankStatementLine.updateMany({
      where: { id: line.id, tenantId: ctx.tenantId, systemId: ctx.systemId },
      data: { status: "UNMATCHED", matchedLineId: null, matchedEntryId: null, matchedAt: null, matchedById: null },
    });
  });

  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: input.userId ?? null,
    action: "account.reconcile.unmatch",
    targetType: "AccountBankStatementLine",
    targetId: line.id,
    before: { journalLineId: line.matchedLineId },
  });
  return { ok: true };
}

/** ข้ามแถว (เช่น รายการที่ธนาคารบันทึกซ้ำ/ไม่เกี่ยวกับกิจการ) — ยังนับเป็น "ยังไม่กระทบยอด" ในส่วนต่าง */
export async function skipLine(
  ctx: ReconcileCtx,
  input: { lineId: string; reason?: string | null; userId?: string | null },
): Promise<{ ok: true } | ReconcileFail> {
  const line = await loadOpenLine(ctx, input.lineId);
  if (!line) return fail("ไม่พบแถวรายการเดินบัญชี");
  if (line.statement.confirmedAt) return fail("เดือนนี้ยืนยันกระทบยอดแล้ว — เปิดกลับก่อนจึงจะแก้ได้");
  if (line.status === "MATCHED" || line.status === "CREATED") return fail("แถวที่จับคู่/สร้างรายการแล้ว ข้ามไม่ได้");

  await tenantDb(ctx).accountBankStatementLine.updateMany({
    where: { id: line.id, tenantId: ctx.tenantId, systemId: ctx.systemId },
    data: { status: "SKIPPED", skipReason: input.reason?.slice(0, 300) ?? null, suggestedLineId: null, suggestedEntryId: null, suggestedHint: null },
  });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: input.userId ?? null,
    action: "account.reconcile.skip",
    targetType: "AccountBankStatementLine",
    targetId: line.id,
    after: { reason: input.reason ?? null },
  });
  return { ok: true };
}

// ─────────────────── สร้างรายการจากแถว statement (ค่าธรรมเนียม/ดอกเบี้ย) ───────────────────

export type CreateEntryKind = "FEE" | "INTEREST" | "OTHER";
export const CREATE_ENTRY_KIND_LABEL: Record<CreateEntryKind, string> = {
  FEE: "ค่าธรรมเนียมธนาคาร",
  INTEREST: "ดอกเบี้ยรับ",
  OTHER: "อื่น ๆ (เลือกผังบัญชีเอง)",
};

/**
 * สร้างใบสำคัญจากแถว statement — ค่าธรรมเนียม: Dr 6510 / Cr เงิน · ดอกเบี้ย: Dr เงิน / Cr 4910
 * idempotent ต่อแถว (gl.postBankReconcileEntry ผูก idempotencyKey กับ statementLineId)
 * สำเร็จ → แถวเป็น CREATED (นับเป็น "กระทบยอดแล้ว" เพราะฝั่งระบบเพิ่งเกิดจากแถวนี้)
 */
export async function createEntryFromLine(
  ctx: ReconcileCtx,
  input: { lineId: string; kind: CreateEntryKind; accountCode?: string | null; note?: string | null; userId?: string | null },
): Promise<{ ok: true; entryId: string } | ReconcileFail> {
  const line = await loadOpenLine(ctx, input.lineId);
  if (!line) return fail("ไม่พบแถวรายการเดินบัญชี");
  if (line.statement.confirmedAt) return fail("เดือนนี้ยืนยันกระทบยอดแล้ว — เปิดกลับก่อนจึงจะสร้างรายการได้");
  if (line.status === "MATCHED") return fail("แถวนี้จับคู่กับรายการในระบบแล้ว");
  if (line.status === "CREATED" && line.createdEntryId) return fail("แถวนี้สร้างรายการบัญชีไปแล้ว");

  const channel = await getChannel(ctx, line.financeId);
  if (!channel) return fail("ไม่พบช่องทางการเงินนี้");

  if (input.kind === "FEE" && line.amountSatang > 0) return fail("ค่าธรรมเนียมต้องเป็นรายการเงินออก (ยอดติดลบ)");
  if (input.kind === "INTEREST" && line.amountSatang < 0) return fail("ดอกเบี้ยรับต้องเป็นรายการเงินเข้า (ยอดเป็นบวก)");

  // บัญชีคู่: FEE → BANK_FEE (6510) · INTEREST → INTEREST_INCOME (4910) · OTHER → รหัสที่ผู้ใช้เลือก
  let counterLedgerId: string;
  if (input.kind === "OTHER") {
    const code = input.accountCode?.trim();
    if (!code) return fail("เลือกผังบัญชีสำหรับรายการนี้ก่อน");
    const ledger = await tenantDb(ctx).accountLedger.findFirst({
      where: { systemId: ctx.systemId, code, archivedAt: null },
      select: { id: true },
    });
    if (!ledger) return fail(`ไม่พบผังบัญชีรหัส ${code}`);
    counterLedgerId = ledger.id;
  } else {
    counterLedgerId = await resolveMapping(ctx, input.kind === "FEE" ? "BANK_FEE" : "INTEREST_INCOME");
  }
  if (counterLedgerId === channel.ledgerAccountId) return fail("บัญชีคู่ต้องไม่ใช่บัญชีของช่องทางนี้เอง");

  const memo = input.note?.trim() || (input.kind === "FEE" ? "ค่าธรรมเนียมธนาคาร" : input.kind === "INTEREST" ? "ดอกเบี้ยรับ" : line.description);

  const res = await tenantDb(ctx).$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const posted = await postBankReconcileEntry(
      ctx,
      {
        statementLineId: line.id,
        financeLedgerId: channel.ledgerAccountId,
        counterLedgerId,
        amountSatang: line.amountSatang,
        date: line.txDate,
        memo,
        note: line.description.slice(0, 200),
        postedById: input.userId ?? undefined,
      },
      tx,
    );
    if ("skipped" in posted) {
      // โพสต์ไปแล้วก่อนหน้า (retry/กดซ้ำ) — หา entry เดิมมาผูกให้ครบ
      const existing = await tx.accountJournalEntry.findFirst({
        where: { systemId: ctx.systemId, idempotencyKey: `AccountBankStatementLine#${line.id}#RECONCILE` },
        select: { id: true },
      });
      if (!existing) return null;
      await markCreated(tx, ctx, line.id, existing.id, channel.ledgerAccountId);
      return existing.id;
    }
    await markCreated(tx, ctx, line.id, posted.entryId, channel.ledgerAccountId);
    return posted.entryId;
  });

  if (!res) return fail("สร้างรายการไม่สำเร็จ");

  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: input.userId ?? null,
    action: "account.reconcile.create_entry",
    targetType: "AccountBankStatementLine",
    targetId: line.id,
    after: { kind: input.kind, entryId: res, amountSatang: line.amountSatang, memo },
  });
  return { ok: true, entryId: res };
}

/** ผูกแถว statement กับใบสำคัญที่เพิ่งสร้าง + ทำเครื่องหมาย "กระทบยอดแล้ว" ที่บรรทัดเงินของใบนั้น */
async function markCreated(tx: Tx, ctx: ReconcileCtx, lineId: string, entryId: string, ledgerAccountId: string): Promise<void> {
  const cashLine = await tx.accountJournalLine.findFirst({
    where: { systemId: ctx.systemId, entryId, accountId: ledgerAccountId },
    select: { id: true },
  });
  if (cashLine) {
    await tx.accountJournalLine.updateMany({
      where: { id: cashLine.id, tenantId: ctx.tenantId, systemId: ctx.systemId },
      data: { reconciledAt: new Date(), reconciledStatementLineId: lineId },
    });
  }
  await tx.accountBankStatementLine.updateMany({
    where: { id: lineId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    data: {
      status: "CREATED",
      createdEntryId: entryId,
      matchedLineId: cashLine?.id ?? null,
      matchedEntryId: entryId,
      suggestedLineId: null,
      suggestedEntryId: null,
      suggestedHint: null,
      matchedAt: new Date(),
    },
  });
}

// ─────────────────── สรุป (4 ไทล์ g10) ───────────────────

export type ReconcileSummary = {
  financeId: string;
  periodKey: string;
  channel: ReconcileChannel;
  hasStatement: boolean;
  statementId: string | null;
  statementBalanceSatang: number | null; // ยอดตาม statement (ปลายงวด)
  systemBalanceSatang: number; // ยอดในระบบ = GL ของบัญชีช่องทาง ณ สิ้นงวด
  differenceSatang: number | null; // statement − ระบบ (null = ยังไม่นำเข้า)
  matchedCount: number; // จับคู่แล้ว (MATCHED + CREATED)
  totalCount: number;
  pendingCount: number; // รอจับคู่ + แนะนำจับคู่
  suggestedCount: number;
  unmatchedCount: number;
  skippedCount: number;
  confirmedAt: Date | null;
  confirmedById: string | null;
  canConfirm: boolean;
  confirmBlockReason: string | null;
  importedAt: Date | null;
  fileName: string | null;
  source: string | null;
};

/** ยอด GL ของบัญชีช่องทาง ณ สิ้นงวด (สูตรเดียวกับ finance.financeBalances/kpi เงินสด — Σdebit − Σcredit) */
export async function systemBalanceAtPeriodEnd(ctx: ReconcileCtx, ledgerAccountId: string, periodKey: string): Promise<number> {
  const to = monthEndExclusive(periodKey);
  const agg = await tenantDb(ctx).accountJournalLine.aggregate({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, accountId: ledgerAccountId, entry: { date: { lt: to } } },
    _sum: { debit: true, credit: true },
  });
  return (agg._sum.debit ?? 0) - (agg._sum.credit ?? 0);
}

export async function summary(
  ctx: ReconcileCtx,
  financeId: string,
  periodKey: string,
  // WO 9.3 — ส่งรายการช่องทางที่โหลดไว้แล้วเข้ามาได้ (ไม่ส่ง = โหลดเอง เหมือนเดิมทุกประการ)
  opts: { channels?: ReconcileChannel[] } = {},
): Promise<ReconcileSummary | ReconcileFail> {
  const channel = await getChannel(ctx, financeId, opts.channels);
  if (!channel) return fail("ไม่พบช่องทางการเงินนี้ (หรือยังไม่ได้ผูกบัญชีแยกประเภท)");
  if (!isPeriodKey(periodKey)) return fail("รูปแบบเดือนไม่ถูกต้อง");

  const [statement, systemBalance] = await Promise.all([
    tenantDb(ctx).accountBankStatement.findFirst({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, financeId, periodKey },
    }),
    systemBalanceAtPeriodEnd(ctx, channel.ledgerAccountId, periodKey),
  ]);

  if (!statement) {
    return {
      financeId,
      periodKey,
      channel,
      hasStatement: false,
      statementId: null,
      statementBalanceSatang: null,
      systemBalanceSatang: systemBalance,
      differenceSatang: null,
      matchedCount: 0,
      totalCount: 0,
      pendingCount: 0,
      suggestedCount: 0,
      unmatchedCount: 0,
      skippedCount: 0,
      confirmedAt: null,
      confirmedById: null,
      canConfirm: false,
      confirmBlockReason: "ยังไม่ได้นำเข้ารายการเดินบัญชีของเดือนนี้",
      importedAt: null,
      fileName: null,
      source: null,
    };
  }

  const counts = await countByStatus(ctx, statement.id);
  const matchedCount = counts.matched + counts.created;
  const totalCount = matchedCount + counts.suggested + counts.unmatched + counts.skipped;
  const pendingCount = counts.suggested + counts.unmatched;
  const difference = statement.closingBalanceSatang - systemBalance;

  const confirmBlockReason =
    statement.confirmedAt != null
      ? null
      : difference !== 0
        ? "ส่วนต่างต้องเป็น 0 ก่อนยืนยัน"
        : pendingCount > 0
          ? `ยังมีรายการรอจับคู่ ${pendingCount} รายการ`
          : null;

  return {
    financeId,
    periodKey,
    channel,
    hasStatement: true,
    statementId: statement.id,
    statementBalanceSatang: statement.closingBalanceSatang,
    systemBalanceSatang: systemBalance,
    differenceSatang: difference,
    matchedCount,
    totalCount,
    pendingCount,
    suggestedCount: counts.suggested,
    unmatchedCount: counts.unmatched,
    skippedCount: counts.skipped,
    confirmedAt: statement.confirmedAt,
    confirmedById: statement.confirmedById,
    canConfirm: statement.confirmedAt == null && confirmBlockReason == null,
    confirmBlockReason,
    importedAt: statement.importedAt,
    fileName: statement.fileName,
    source: statement.source,
  };
}

/**
 * สรุปแบบย่อสำหรับ "บล็อกกระทบยอด" บนหน้าภาพรวมการเงิน (f7 · WO 5.2) — **query เดียวจบ**
 * (หน้านั้นมีงบ query จำกัด ≤12 · ถ้าเรียก summary() เต็มจะกิน 5 query)
 * คืน null เมื่อไม่พบช่องทาง · statementBalanceSatang = null เมื่อยังไม่นำเข้า statement ของเดือนนั้น
 */
export type ReconcileBlock = {
  statementBalanceSatang: number | null;
  systemBalanceSatang: number;
  differenceSatang: number | null;
  matchedCount: number;
  pendingCount: number;
  confirmed: boolean;
};

export async function reconcileBlock(ctx: ReconcileCtx, financeId: string, periodKey: string): Promise<ReconcileBlock | null> {
  if (!isPeriodKey(periodKey)) return null;
  const to = monthEndExclusive(periodKey);
  const rows = await tenantDb(ctx).$queryRaw<
    { closing: bigint | null; confirmed_at: Date | null; system_balance: bigint | null; matched: bigint; pending: bigint }[]
  >`
    SELECT s."closingBalanceSatang"::bigint AS closing,
           s."confirmedAt"                  AS confirmed_at,
           (SELECT COALESCE(SUM(jl.debit - jl.credit), 0)::bigint
              FROM "AccountJournalLine" jl
              JOIN "AccountJournalEntry" e ON e.id = jl."entryId"
             WHERE jl."tenantId" = ${ctx.tenantId} AND jl."systemId" = ${ctx.systemId}
               AND jl."accountId" = f."ledgerAccountId" AND e.date < ${to})            AS system_balance,
           (SELECT COUNT(*)::bigint FROM "AccountBankStatementLine" l
             WHERE l."statementId" = s.id AND l.status IN ('MATCHED', 'CREATED'))      AS matched,
           (SELECT COUNT(*)::bigint FROM "AccountBankStatementLine" l
             WHERE l."statementId" = s.id AND l.status IN ('SUGGESTED', 'UNMATCHED'))  AS pending
      FROM "AccountFinance" f
      LEFT JOIN "AccountBankStatement" s
        ON s."financeId" = f.id AND s."periodKey" = ${periodKey} AND s."systemId" = ${ctx.systemId}
     WHERE f.id = ${financeId} AND f."tenantId" = ${ctx.tenantId} AND f."systemId" = ${ctx.systemId}
     LIMIT 1`;
  const r = rows[0];
  if (!r) return null;
  const systemBalanceSatang = Number(r.system_balance ?? 0);
  const statementBalanceSatang = r.closing == null ? null : Number(r.closing);
  return {
    statementBalanceSatang,
    systemBalanceSatang,
    differenceSatang: statementBalanceSatang == null ? null : statementBalanceSatang - systemBalanceSatang,
    matchedCount: Number(r.matched ?? 0),
    pendingCount: Number(r.pending ?? 0),
    confirmed: r.confirmed_at != null,
  };
}

// ─────────────────── ยืนยัน / เปิดกลับ ───────────────────

export async function isPeriodLocked(ctx: ReconcileCtx, financeId: string, periodKey: string): Promise<boolean> {
  const s = await tenantDb(ctx).accountBankStatement.findFirst({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, financeId, periodKey },
    select: { confirmedAt: true },
  });
  return s?.confirmedAt != null;
}

/**
 * ยืนยันกระทบยอดเดือนนี้ — ทำได้เมื่อ ส่วนต่าง = 0 และไม่มีแถว "รอจับคู่/แนะนำจับคู่" เหลือ
 * ⚠️ ล็อกนี้ล็อกเฉพาะ "การกระทบยอด" ของช่องทาง+เดือนนั้น **ไม่ได้ล็อกการลงบัญชี** —
 *    เอกสาร/ใบสำคัญใหม่ที่ลงวันที่ในเดือนที่ยืนยันไปแล้วยังโพสต์ได้ตามปกติ (ห้ามบล็อกงานบัญชี)
 *    รายการเหล่านั้นจะโผล่เป็น "รายการหลังยืนยัน" ให้กระทบยอดในเดือนถัดไป (ดู listSystemEntries
 *    ที่ยังคืนบรรทัดซึ่ง reconciledAt = null ของงวดนั้น)
 */
export async function confirmMonth(
  ctx: ReconcileCtx,
  input: { financeId: string; periodKey: string; userId?: string | null },
): Promise<{ ok: true; matched: number } | ReconcileFail> {
  const s = await summary(ctx, input.financeId, input.periodKey);
  if ("ok" in s) return s;
  if (!s.hasStatement || !s.statementId) return fail("ยังไม่ได้นำเข้ารายการเดินบัญชีของเดือนนี้");
  if (s.confirmedAt) return fail("เดือนนี้ยืนยันกระทบยอดไปแล้ว");
  if (s.differenceSatang !== 0) return fail("ส่วนต่างต้องเป็น 0 ก่อนยืนยัน");
  if (s.pendingCount > 0) return fail(`ยังมีรายการรอจับคู่ ${s.pendingCount} รายการ`);

  const now = new Date();
  const statementId = s.statementId; // แยกเป็นตัวแปรของตัวเอง — การจำกัดชนิดของ property บน `s` ไม่ไหลเข้า closure ของ $transaction
  // WO D4: ห่อ $transaction (ของเดิมเป็น updateMany เดี่ยว) เพื่อยิง account.reconcile.confirmed ในธุรกรรม
  // เดียวกับการยืนยัน — ผ่าน `tenantDb(ctx).$transaction` (ไม่ใช่ prisma ตรง — ไฟล์นี้ไม่มี raw prisma import)
  const updated = await tenantDb(ctx).$transaction(async (tx) => {
    const res = await tx.accountBankStatement.updateMany({
      where: { id: statementId, tenantId: ctx.tenantId, systemId: ctx.systemId, confirmedAt: null },
      data: { confirmedAt: now, confirmedById: input.userId ?? null },
    });
    if (res.count > 0) {
      // tenantDb().$transaction() ให้ client ที่ทำงานเหมือน Prisma.TransactionClient ทุกอย่างแต่เป็นคนละ
      // ชนิด (extended client) — cast ตามแพตเทิร์นเดียวกับ contact-merge.ts
      await emitReconcileConfirmed(tx as unknown as Prisma.TransactionClient, ctx, {
        financeId: input.financeId,
        periodKey: input.periodKey,
        matched: s.matchedCount,
        statementBalanceSatang: s.statementBalanceSatang,
      });
    }
    return res;
  });
  if (updated.count === 0) return fail("เดือนนี้เพิ่งถูกยืนยันไปแล้ว — โหลดหน้าใหม่");

  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: input.userId ?? null,
    action: "account.reconcile.confirm",
    targetType: "AccountBankStatement",
    targetId: s.statementId,
    after: { financeId: input.financeId, periodKey: input.periodKey, matched: s.matchedCount, statementBalanceSatang: s.statementBalanceSatang },
  });
  return { ok: true, matched: s.matchedCount };
}

/** เปิดกลับ (ยกเลิกการยืนยัน) — สิทธิ์ระดับเจ้าของ (ตรวจที่ชั้น action) */
export async function reopenMonth(
  ctx: ReconcileCtx,
  input: { financeId: string; periodKey: string; reason?: string | null; userId?: string | null },
): Promise<{ ok: true } | ReconcileFail> {
  const s = await tenantDb(ctx).accountBankStatement.findFirst({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, financeId: input.financeId, periodKey: input.periodKey },
    select: { id: true, confirmedAt: true },
  });
  if (!s) return fail("ยังไม่ได้นำเข้ารายการเดินบัญชีของเดือนนี้");
  if (!s.confirmedAt) return fail("เดือนนี้ยังไม่ได้ยืนยัน");

  await tenantDb(ctx).accountBankStatement.updateMany({
    where: { id: s.id, tenantId: ctx.tenantId, systemId: ctx.systemId },
    data: { confirmedAt: null, confirmedById: null },
  });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: input.userId ?? null,
    action: "account.reconcile.reopen",
    targetType: "AccountBankStatement",
    targetId: s.id,
    before: { confirmedAt: s.confirmedAt },
    after: { reason: input.reason ?? null },
  });
  return { ok: true };
}

// ─────────────────── ข้อมูลสำหรับหน้าจอ (g10) ───────────────────

export type StatementLineView = {
  id: string;
  seq: number;
  txDate: Date;
  description: string;
  refNo: string | null;
  amountSatang: number;
  status: AccountBankStatementLineStatus;
  suggestedLineId: string | null;
  suggestedHint: string | null;
  matchedLineId: string | null;
  matchedEntryId: string | null;
  skipReason: string | null;
};

export type ReconcilePageData = {
  summary: ReconcileSummary;
  statementLines: StatementLineView[];
  systemRows: SystemEntryRow[];
  reconciledRows: SystemEntryRow[]; // "รายการที่กระทบยอดแล้ว" ของช่องทาง/เดือนนี้
};

export async function reconcilePageData(
  ctx: ReconcileCtx,
  financeId: string,
  periodKey: string,
  // `channels` = รายการช่องทางที่หน้าจอโหลดไว้แล้ว (WO 9.3 — กันโหลดซ้ำ ดู getChannel)
  opts: { base?: string; channels?: ReconcileChannel[] } = {},
): Promise<ReconcilePageData | ReconcileFail> {
  const s = await summary(ctx, financeId, periodKey, { channels: opts.channels });
  if ("ok" in s) return s;

  // 🔴 WO 9.3 (งบ query): เดิมเรียก listSystemEntries 2 รอบ (รอบยังไม่กระทบยอด + รอบรวมที่กระทบยอดแล้ว)
  //    → บรรทัดสมุดรายวัน/ใบสำคัญ/เอกสารต้นทาง ถูกยิงคนละชุด id เป็น 2 ชุด (AccountDocumentPayment
  //      และ AccountDocument อย่างละ 2 query) ทั้งที่ชุดหลังครอบชุดแรกอยู่แล้ว
  //    → ดึงรอบเดียวแบบ includeReconciled แล้วแยกใน JS: ผลลัพธ์/ลำดับเท่าเดิมเป๊ะ
  //      (เดิม systemRows กรอง reconciledAt=null ที่ SQL · ตอนนี้กรอง !r.reconciled ใน JS — ชุดเดียวกัน
  //       และ orderBy เหมือนกัน การกรองจึงไม่เปลี่ยนลำดับ)
  const [lines, all] = await Promise.all([
    s.statementId
      ? tenantDb(ctx).accountBankStatementLine.findMany({
          where: { tenantId: ctx.tenantId, systemId: ctx.systemId, statementId: s.statementId },
          orderBy: [{ txDate: "asc" }, { seq: "asc" }],
        })
      : Promise.resolve([]),
    listSystemEntries(ctx, { ledgerAccountId: s.channel.ledgerAccountId, periodKey, base: opts.base, includeReconciled: true }),
  ]);
  const system = all.filter((r) => !r.reconciled);
  const reconciled = all.filter((r) => r.reconciled);

  return {
    summary: s,
    statementLines: lines.map((l) => ({
      id: l.id,
      seq: l.seq,
      txDate: l.txDate,
      description: l.description,
      refNo: l.refNo,
      amountSatang: l.amountSatang,
      status: l.status,
      suggestedLineId: l.suggestedLineId,
      suggestedHint: l.suggestedHint,
      matchedLineId: l.matchedLineId,
      matchedEntryId: l.matchedEntryId,
      skipReason: l.skipReason,
    })),
    systemRows: system,
    reconciledRows: reconciled,
  };
}

/** "รายการที่กระทบยอดแล้ว" (§10.2) — บรรทัดของช่องทางในงวดที่มี reconciledAt แล้ว */
export async function listReconciledEntries(
  ctx: ReconcileCtx,
  o: { ledgerAccountId: string; periodKey: string; base?: string },
): Promise<SystemEntryRow[]> {
  const all = await listSystemEntries(ctx, { ...o, includeReconciled: true });
  return all.filter((r) => r.reconciled);
}

// ─────────────────── hook AI (ทางเลือกตาม SPEC — ยังไม่ทำในเฟสนี้) ───────────────────
/**
 * SPEC §10.2 เขียน "AI ช่วยจับคู่ (ทางเลือก)" ไว้ — WO 5.3 **ไม่ทำ** (นอกขอบเขต)
 * จุดต่อไว้ตรงนี้จุดเดียว: ถ้าวันหนึ่งมีตัวช่วย AI ให้ implement ฟังก์ชันนี้แล้วเรียกต่อจาก autoMatch
 * (รับแถวที่ยัง UNMATCHED + รายการระบบที่ยังว่าง → คืนคู่ที่แนะนำพร้อมเหตุผล ไม่ผูกให้เอง)
 */
export type AiMatchSuggestion = { lineId: string; journalLineId: string; confidence: number; reason: string };
export const suggestWithAi: ((ctx: ReconcileCtx, statementId: string) => Promise<AiMatchSuggestion[]>) | null = null;
