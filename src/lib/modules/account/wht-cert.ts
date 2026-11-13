// ─────────────────────────────────────────────────────────────
// wht-cert.ts — ACC T3.3 / T3.5 · 50 ทวิ: ข้อมูลหน้าพิมพ์ · ยกเลิกแล้วออกใบแทน · ฝั่งถูกหัก (รับ 50 ทวิ แล้ว / ค้างรับ)
//   design note ledger/wo-notes/T3.3.md · T3.5.md
//   ไม่แตะฐานที่หัก/อัตรา (T3.1 T3.2 เลน 1) — ใบแทนใช้ยอด/อัตรา/การจ่ายเดิมเสมอ
// ─────────────────────────────────────────────────────────────
import type { AccountWhtIncomeType, Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { legalAmbient } from "@/lib/core/legal-ambient";
import { isLegalAckRequiredError, legalWarning, type LegalAck, type LegalAckRequired, type LegalWarning } from "@/lib/core/settings/legal/warnings";
import { safeReason } from "./errors";
import { deferDocNo, finalizeDocNos, openDocNumbering } from "./doc-numbering";
import { fallbackPrefixOf } from "./settings-schema";
import { pndCertGuardInTx } from "./filed-guard";
import { legalAckResult, legalGateInTx } from "./legal-gate";
import { WHT_INCOME_LABEL, pnd, pnd1kAnnual } from "./wht";
import { whtFormOf, type RecipientFacts } from "./wht-forms";
import { buildCertPrint, type CertPrintInput, type CertPrintModel } from "./wht-cert-print";
import { readSellerSnapshot, sellerBlockOf } from "./seller-snapshot";
import { getSettings, orgDisplayName } from "./service";
import { isJuristicPayer } from "@/lib/core/settings/legal/th-tax-2569";

type Ctx = { tenantId: string; systemId: string };

const bkkYm = (d: Date) => {
  const t = new Date(d.getTime() + 7 * 3_600_000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
};

const snapOf = (raw: unknown) => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** ข้อมูลผู้รับจากสำเนาผู้ติดต่อ (ตรึงตอนออก) → ผู้ติดต่อสด */
export function recipientFactsOf(snap: Record<string, unknown> | null, contact: { legalType?: string | null; taxIdCountry?: string | null; country?: string | null; legalEntityType?: string | null } | null): RecipientFacts {
  return {
    legalType: str(snap?.legalType) ?? contact?.legalType ?? "COMPANY",
    taxIdCountry: str(snap?.taxIdCountry) ?? contact?.taxIdCountry ?? null,
    country: str(snap?.country) ?? contact?.country ?? null,
    legalEntityType: str(snap?.legalEntityType) ?? contact?.legalEntityType ?? null,
    whtRecipient: str(snap?.whtRecipient),
  };
}

// ═══════════ หน้าพิมพ์ ═══════════

export type CertPrintLoad = { cert: { id: string; docNo: string | null; status: string; direction: string }; model: CertPrintModel };

/** โหลดข้อมูลหน้าพิมพ์ 50 ทวิ (null = ไม่พบ) · reprintNo มาจากบันทึกการพิมพ์ (ผู้เรียก) */
export async function loadCertPrint(ctx: Ctx, certId: string, opts: { reprintNo?: number | null; fmtDate: (d: Date) => string }): Promise<CertPrintLoad | null> {
  const cert = await tenantDb(ctx).accountDocument.findFirst({
    where: { id: certId, tenantId: ctx.tenantId, systemId: ctx.systemId, docType: "WHT_CERT" },
    include: { contact: { select: { name: true, taxId: true, address: true, branchCode: true, branchName: true, legalType: true, taxIdCountry: true, country: true, legalEntityType: true } } },
  });
  if (!cert) return null;
  const s = await getSettings(ctx.tenantId, ctx.systemId);
  const snap = snapOf(cert.contactSnapshot);
  const frozen = readSellerSnapshot((cert as unknown as { sellerSnapshot?: unknown }).sellerSnapshot);
  const seller = frozen?.seller ?? sellerBlockOf({ ...s, orgPrefix: null, orgName: orgDisplayName(s) || null, doc: s.doc });
  const facts = recipientFactsOf(snap, cert.contact);
  const [replaces, replacedBy] = await Promise.all([
    tenantDb(ctx).accountDocument.findFirst({ where: { systemId: ctx.systemId, docType: "WHT_CERT", replacedById: cert.id }, select: { docNo: true, issueDate: true, voidReason: true } }),
    cert.replacedById ? tenantDb(ctx).accountDocument.findFirst({ where: { id: cert.replacedById, systemId: ctx.systemId }, select: { docNo: true } }) : Promise.resolve(null),
  ]);
  const seq = cert.direction === "IN" && cert.status === "ISSUED" ? await certSeq(ctx, cert.id, cert.issueDate, cert.whtIncomeType, facts) : null;
  const juristicShop = isJuristicPayer(s.entityKind);
  const input: CertPrintInput = {
    docNo: cert.docNo,
    issueDate: cert.issueDate,
    direction: cert.direction === "OUT" ? "OUT" : "IN",
    status: cert.status,
    voidReason: cert.voidReason,
    voidedAt: cert.voidedAt,
    whtIncomeType: cert.whtIncomeType,
    whtRateBp: cert.whtRateBp,
    subTotal: cert.subTotal,
    whtAmount: cert.whtAmount,
    whtCondition: cert.whtCondition,
    contact: {
      name: str(snap?.name) ?? cert.contact?.name ?? "",
      taxId: str(snap?.taxId) ?? cert.contact?.taxId ?? null,
      address: str(snap?.address) ?? cert.contact?.address ?? null,
      branchCode: str(snap?.branchCode) ?? cert.contact?.branchCode ?? null,
      branchName: str(snap?.branchName) ?? cert.contact?.branchName ?? null,
      ...facts,
    },
    shop: { name: seller.name, taxId: seller.taxId, address: seller.address, branch: seller.branch, entityLegalType: juristicShop === false ? "PERSON" : "COMPANY" },
    seq,
    replaces: replaces ? { docNo: replaces.docNo, issueDate: replaces.issueDate, reason: replaceReasonOf(replaces.voidReason) } : null,
    replacedByNo: replacedBy?.docNo ?? null,
    reprintNo: opts.reprintNo ?? null,
    receivedAt: cert.whtCertReceivedAt,
  };
  const model = buildCertPrint(input, (t) => (t ? (WHT_INCOME_LABEL[t as AccountWhtIncomeType] ?? t) : "—"), opts.fmtDate);
  return { cert: { id: cert.id, docNo: cert.docNo, status: cert.status, direction: cert.direction }, model };
}

const REPLACE_PREFIX = "ยกเลิกเพื่อออกใบแทน: ";
const replaceReasonOf = (voidReason: string | null) => (voidReason?.startsWith(REPLACE_PREFIX) ? voidReason.slice(REPLACE_PREFIX.length) : voidReason);

/** ลำดับที่ในแบบ — ภ.ง.ด.1 = ลำดับผู้รับในรายการ 1ก ของปี · แบบอื่น = ลำดับในรายการเดือนที่จ่าย (ตัวเดียวกับ CSV ช่วยกรอกแบบ) */
async function certSeq(ctx: Ctx, certId: string, issueDate: Date, incomeType: string | null, facts: RecipientFacts): Promise<number | null> {
  const form = whtFormOf(incomeType, facts).form;
  if (form === 1) {
    const y = Number(bkkYm(issueDate).slice(0, 4));
    const annual = await pnd1kAnnual(ctx.tenantId, ctx.systemId, { year: y });
    const row = annual.rows.find((r) => r.certIds.includes(certId));
    return row?.seq ?? null;
  }
  const rep = await pnd(ctx.tenantId, ctx.systemId, { type: form, period: bkkYm(issueDate) });
  return rep.rows.find((r) => r.certId === certId)?.seq ?? null;
}

// ═══════════ ยกเลิกแล้วออกใบแทน (F8) ═══════════

export type ReplaceWhtCertInput = {
  reason: string;
  whtIncomeType?: AccountWhtIncomeType | null;
  whtCondition?: 1 | 2 | 3 | 4 | null;
  /** ดึงชื่อ/ที่อยู่/เลขผู้ถูกหักใหม่จากผู้ติดต่อปัจจุบัน (แก้ข้อมูลผิด) */
  refreshPayee?: boolean;
  actorId?: string | null;
  ack?: LegalAck | null;
};

export type ReplaceWhtCertResult =
  | { ok: true; certId: string; docNo: string; replacedId: string }
  | { ok: false; reason: string; code?: "NOT_FOUND" | "NOT_LIVE" | "WRONG_SIDE" | "REASON_REQUIRED"; legal?: LegalAckRequired };

export function whtReplaceWarnings(docNo: string | null): LegalWarning[] {
  return [legalWarning("WHT_CERT_REPLACE", { docNo: docNo ?? "-" })];
}

export async function replaceWhtCert(ctx: Ctx, certId: string, input: ReplaceWhtCertInput): Promise<ReplaceWhtCertResult> {
  const reason = (input.reason ?? "").trim().slice(0, 300);
  if (reason.length < 3) return { ok: false, code: "REASON_REQUIRED", reason: "ระบุเหตุที่ออกใบแทนอย่างน้อย 3 ตัวอักษร" };
  const ack = input.ack ?? legalAmbient()?.ack ?? null;
  try {
    return await tenantDb(ctx).$transaction(async (etx) => {
      const tx = etx as unknown as Prisma.TransactionClient;
      await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${`acc:wht-cert:${certId}`}))) l`;
      const old = await tx.accountDocument.findFirst({ where: { id: certId, tenantId: ctx.tenantId, systemId: ctx.systemId, docType: "WHT_CERT" } });
      if (!old) return { ok: false as const, code: "NOT_FOUND" as const, reason: "ไม่พบ 50 ทวิ" };
      if (old.direction !== "IN") return { ok: false as const, code: "WRONG_SIDE" as const, reason: "ออกใบแทนได้เฉพาะ 50 ทวิ ที่ร้านเป็นผู้หัก (ฝั่งถูกหักเป็นบันทึกของร้าน ไม่ใช่หนังสือรับรอง)" };
      if (old.status !== "ISSUED" || old.replacedById) return { ok: false as const, code: "NOT_LIVE" as const, reason: "50 ทวิ ใบนี้ถูกยกเลิกหรือออกใบแทนไปแล้ว" };
      await legalGateInTx(tx, ctx.tenantId, whtReplaceWarnings(old.docNo), ack, { op: "account.wht.cert.replace", targetType: "AccountDocument", targetId: old.id });
      let contactSnapshot = old.contactSnapshot as Prisma.InputJsonValue | null;
      if (input.refreshPayee && old.contactId) {
        const c = await tx.accountContact.findFirst({
          where: { id: old.contactId, systemId: ctx.systemId },
          select: { name: true, taxId: true, address: true, branchCode: true, branchName: true, legalType: true, taxIdCountry: true, country: true, legalEntityType: true, phone: true, email: true },
        });
        if (c) contactSnapshot = { ...(snapOf(old.contactSnapshot) ?? {}), ...c } as Prisma.InputJsonValue;
      }
      openDocNumbering(tx);
      const created = await tx.accountDocument.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          docType: "WHT_CERT",
          status: "ISSUED",
          direction: "IN",
          docNo: null,
          issueDate: old.issueDate,
          contactId: old.contactId,
          contactSnapshot: contactSnapshot ?? undefined,
          vatMode: "NONE",
          subTotal: old.subTotal,
          vatAmount: 0,
          whtAmount: old.whtAmount,
          grandTotal: old.grandTotal,
          whtIncomeType: input.whtIncomeType ?? old.whtIncomeType,
          whtRateBp: old.whtRateBp,
          whtCondition: input.whtCondition ?? old.whtCondition,
          sourceDocId: old.sourceDocId,
          sourcePaymentId: old.sourcePaymentId,
          sellerSnapshot: (old.sellerSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
          note: `ออกแทนฉบับเลขที่ ${old.docNo ?? "—"} (เหตุ: ${reason})`,
          createdById: input.actorId ?? null,
        },
        select: { id: true },
      });
      deferDocNo(tx, { docId: created.id, tenantId: ctx.tenantId, systemId: ctx.systemId, date: old.issueDate, series: { kind: "configured", docType: "WHT_CERT", fallbackPrefix: fallbackPrefixOf("WHT_CERT") } });
      // ด่านเดือนที่ยื่น ภ.ง.ด. แล้ว (T1.7): ยกเลิกใบเดิม + ออกใบใหม่ในเดือนเดียวกัน
      await pndCertGuardInTx(tx, ctx, { id: old.id, issueDate: old.issueDate, docNo: old.docNo, whtAmount: old.whtAmount }, "VOID");
      await pndCertGuardInTx(tx, ctx, { id: created.id, issueDate: old.issueDate, docNo: null, whtAmount: old.whtAmount }, "ISSUE");
      await tx.accountDocument.update({
        where: { id: old.id },
        data: { status: "VOIDED", voidedAt: new Date(), voidReason: `${REPLACE_PREFIX}${reason}`, replacedById: created.id },
      });
      if (old.sourcePaymentId) {
        await tx.accountDocumentPayment.updateMany({ where: { id: old.sourcePaymentId, systemId: ctx.systemId, whtCertDocId: old.id }, data: { whtCertDocId: created.id } });
      }
      await tx.accountDocumentRelation.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, fromId: old.id, toId: created.id, type: "REPLACE", amount: old.whtAmount } });
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          actorType: ack?.actorType ?? "USER",
          actorId: input.actorId ?? ack?.actorId ?? null,
          action: "account.wht.cert.replace",
          targetType: "AccountDocument",
          targetId: old.id,
          after: { replacedById: created.id, reason, whtIncomeType: input.whtIncomeType ?? old.whtIncomeType, whtCondition: input.whtCondition ?? old.whtCondition, refreshPayee: !!input.refreshPayee } as object,
        },
      });
      const nos = await finalizeDocNos(tx);
      return { ok: true as const, certId: created.id, docNo: nos.get(created.id) ?? "", replacedId: old.id };
    });
  } catch (e) {
    if (isLegalAckRequiredError(e)) return legalAckResult(e);
    return { ok: false, reason: safeReason(e, "ออกใบแทน 50 ทวิ ไม่สำเร็จ") };
  }
}

// ═══════════ T3.5 ฝั่งถูกหัก — ธงรับแล้วจริง ═══════════

export type ReceivedResult = { ok: true; certId: string; receivedAt: Date | null; changed: boolean } | { ok: false; reason: string; code?: "NOT_FOUND" | "WRONG_SIDE" | "NOT_LIVE" };

/** ทำเครื่องหมาย "ได้รับ 50 ทวิ จากลูกค้าแล้ว" (WTI · direction OUT) — ซ้ำ = ไม่เปลี่ยน (idempotent) */
export async function markWhtCreditReceived(ctx: Ctx, certId: string, input: { received: boolean; note?: string | null; at?: Date | null; actorId?: string | null; actorType?: "USER" | "API_KEY" | "SYSTEM" | "PLATFORM_USER" }): Promise<ReceivedResult> {
  try {
    return await tenantDb(ctx).$transaction(async (etx) => {
      const tx = etx as unknown as Prisma.TransactionClient;
      const c = await tx.accountDocument.findFirst({
        where: { id: certId, tenantId: ctx.tenantId, systemId: ctx.systemId, docType: "WHT_CERT" },
        select: { id: true, direction: true, status: true, whtCertReceivedAt: true, whtCertReceivedNote: true },
      });
      if (!c) return { ok: false as const, code: "NOT_FOUND" as const, reason: "ไม่พบเอกสารภาษีถูกหัก ณ ที่จ่าย" };
      if (c.direction !== "OUT") return { ok: false as const, code: "WRONG_SIDE" as const, reason: "ทำเครื่องหมายรับได้เฉพาะรายการที่ลูกค้าหักภาษีร้าน (ฝั่งถูกหัก)" };
      if (c.status !== "ISSUED") return { ok: false as const, code: "NOT_LIVE" as const, reason: "รายการนี้ถูกยกเลิกแล้ว" };
      const note = (input.note ?? "").trim().slice(0, 200) || null;
      if (input.received && c.whtCertReceivedAt && (note === null || note === c.whtCertReceivedNote)) return { ok: true as const, certId: c.id, receivedAt: c.whtCertReceivedAt, changed: false };
      if (!input.received && !c.whtCertReceivedAt) return { ok: true as const, certId: c.id, receivedAt: null, changed: false };
      const at = input.received ? (c.whtCertReceivedAt ?? input.at ?? new Date()) : null;
      await tx.accountDocument.update({
        where: { id: c.id },
        data: input.received ? { whtCertReceivedAt: at, whtCertReceivedById: input.actorId ?? null, whtCertReceivedNote: note } : { whtCertReceivedAt: null, whtCertReceivedById: null, whtCertReceivedNote: null },
      });
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          actorType: input.actorType ?? "USER",
          actorId: input.actorId ?? null,
          action: input.received ? "account.wht.credit.received" : "account.wht.credit.unreceived",
          targetType: "AccountDocument",
          targetId: c.id,
          before: { receivedAt: c.whtCertReceivedAt?.toISOString() ?? null, note: c.whtCertReceivedNote } as object,
          after: { receivedAt: at?.toISOString() ?? null, note: input.received ? note : null, ...(input.received ? {} : { reason: note }) } as object,
        },
      });
      return { ok: true as const, certId: c.id, receivedAt: at, changed: true };
    });
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกการรับ 50 ทวิ ไม่สำเร็จ") };
  }
}

export type OwedRow = {
  certId: string;
  certNo: string | null;
  paidAt: Date;
  contactId: string | null;
  contactName: string;
  contactTaxId: string | null;
  sourceDocId: string | null;
  sourceDocNo: string | null;
  sourceDocType: string | null;
  base: number;
  whtRateBp: number | null;
  whtAmount: number;
  daysOwed: number;
  /** มีไฟล์แนบที่เอกสารต้นทาง (ข้อมูลประกอบ — ไม่ใช่สถานะรับ) */
  hasAttachment: boolean;
};

/** รายงานค้างรับ 50 ทวิ จากลูกค้า — WTI ที่ยังไม่ทำเครื่องหมายรับ (ไม่เดาจากไฟล์แนบ) */
export async function whtCreditsOwed(ctx: Ctx, opts: { asOf?: Date; contactId?: string | null; from?: Date; to?: Date } = {}): Promise<{
  rows: OwedRow[];
  byContact: { contactId: string | null; contactName: string; count: number; whtAmount: number }[];
  totalWht: number;
  totalBase: number;
  warnings: LegalWarning[];
}> {
  const asOf = opts.asOf ?? new Date();
  const certs = await tenantDb(ctx).accountDocument.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      docType: "WHT_CERT",
      direction: "OUT",
      status: "ISSUED",
      whtCertReceivedAt: null,
      ...(opts.contactId ? { contactId: opts.contactId } : {}),
      ...(opts.from || opts.to ? { issueDate: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lt: opts.to } : {}) } } : {}),
    },
    include: { contact: { select: { name: true, taxId: true } } },
    orderBy: [{ issueDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const srcIds = [...new Set(certs.map((c) => c.sourceDocId).filter((x): x is string => !!x))];
  const srcs = srcIds.length
    ? await tenantDb(ctx).accountDocument.findMany({ where: { systemId: ctx.systemId, id: { in: srcIds } }, select: { id: true, docNo: true, docType: true, _count: { select: { attachments: true } } } })
    : [];
  const srcById = new Map(srcs.map((s) => [s.id, s]));
  const rows: OwedRow[] = certs.map((c) => {
    const snap = snapOf(c.contactSnapshot);
    const src = c.sourceDocId ? srcById.get(c.sourceDocId) : undefined;
    return {
      certId: c.id,
      certNo: c.docNo,
      paidAt: c.issueDate,
      contactId: c.contactId,
      contactName: str(snap?.name) ?? c.contact?.name ?? "—",
      contactTaxId: str(snap?.taxId) ?? c.contact?.taxId ?? null,
      sourceDocId: c.sourceDocId,
      sourceDocNo: src?.docNo ?? null,
      sourceDocType: src?.docType ?? null,
      base: c.subTotal,
      whtRateBp: c.whtRateBp,
      whtAmount: c.whtAmount,
      daysOwed: Math.max(0, Math.floor((asOf.getTime() - c.issueDate.getTime()) / 86_400_000)),
      hasAttachment: (src?._count.attachments ?? 0) > 0,
    };
  });
  const by = new Map<string, { contactId: string | null; contactName: string; count: number; whtAmount: number }>();
  for (const r of rows) {
    const k = r.contactId ?? `name:${r.contactName}`;
    const cur = by.get(k) ?? { contactId: r.contactId, contactName: r.contactName, count: 0, whtAmount: 0 };
    cur.count += 1;
    cur.whtAmount += r.whtAmount;
    by.set(k, cur);
  }
  const totalWht = rows.reduce((s, r) => s + r.whtAmount, 0);
  const totalBase = rows.reduce((s, r) => s + r.base, 0);
  const warnings = rows.length ? [legalWarning("WHT_CREDIT_CERT_OWED", { count: rows.length, amount: (totalWht / 100).toLocaleString("en-US", { minimumFractionDigits: 2 }) })] : [];
  return { rows, byContact: [...by.values()].sort((a, b) => b.whtAmount - a.whtAmount), totalWht, totalBase, warnings };
}
