import { prisma } from "@/lib/core/db";
import { csvCell } from "@/lib/core/csv";
import type { AccountWhtIncomeType, AccountLegalType, AccountDocDirection, AccountDocStatus, Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────
// wht.ts — ภาษีหัก ณ ที่จ่าย (WHT) สองขา — §3.5 + F5 (P2)
// ① WHT ถูกหัก (ลูกค้าหักเรา): payment ฝั่ง OUT มี whtAmountSatang → Dr 1160 (โพสต์ที่ gl.postPayment)
//    → wht.ts ทำ "รายงานเครดิตภาษีถูกหัก" (list payment + สำเนา 50 ทวิรับ) รายเดือน/ปี
// ② WHT เราหัก vendor: payment ฝั่ง IN → Cr 2130 (โพสต์ที่ gl) + ออกหนังสือรับรอง 50 ทวิ
//    (AccountDocument docType=WHT_CERT — เลขรัน WHT, whtIncomeType ม.40, whtRateBp, ผูก payment.whtCertDocId)
// ③ ภ.ง.ด.3 (บุคคล) / 53 (นิติ) รายเดือน: สรุป WHT_CERT ตามประเภทเงินได้ + export CSV
// WHT_CERT ไม่โพสต์ GL (metadata — 2130 โพสต์ตอน payment แล้ว · อยู่ NO_GL ใน gl.ts)
// เงิน Int สตางค์ · scope = tenantId + systemId · owner = Finance-WHT agent
// ─────────────────────────────────────────────────────────────

type Ctx = { tenantId: string; systemId: string };

// ประเภทเงินได้ 50 ทวิ (มาตรา 40)
export const WHT_INCOME_LABEL: Record<AccountWhtIncomeType, string> = {
  M40_1: "40(1) เงินเดือน ค่าจ้าง",
  M40_2: "40(2) ค่าธรรมเนียม ค่านายหน้า",
  M40_3: "40(3) ค่าแห่งลิขสิทธิ์/goodwill",
  M40_4: "40(4) ดอกเบี้ย เงินปันผล",
  M40_5: "40(5) ค่าเช่าทรัพย์สิน",
  M40_6: "40(6) วิชาชีพอิสระ",
  M40_7: "40(7) ค่ารับเหมา",
  M40_8: "40(8) ค่าบริการ/อื่นๆ",
};

// ─────────────────── ตัวช่วยงวด (TZ ไทย) ───────────────────

/** "2026-07" → ช่วง [start, next-month-start) เวลาไทย (เก็บ UTC) */
function periodRange(period: string): { gte: Date; lt: Date } {
  const [y, m] = period.split("-").map((x) => parseInt(x, 10));
  // Asia/Bangkok = UTC+7 → 1 ก.ค. 00:00 ไทย = 30 มิ.ย. 17:00 UTC
  const gte = new Date(Date.UTC(y, m - 1, 1, -7, 0, 0));
  const lt = new Date(Date.UTC(y, m, 1, -7, 0, 0));
  return { gte, lt };
}

function baseFromWht(whtAmount: number, rateBp: number | null): number | null {
  if (!rateBp || rateBp <= 0) return null;
  return Math.round((whtAmount * 10000) / rateBp);
}

// ─────────────────── ① รายงานเครดิตภาษีถูกหัก (ลูกค้าหักเรา) ───────────────────

export type WhtCreditRow = {
  paymentId: string;
  documentId: string;
  paidAt: Date;
  docNo: string | null;
  docType: string;
  contactName: string;
  contactTaxId: string | null;
  base: number | null; // ฐานเงินได้ (คำนวณย้อนจากอัตรา)
  whtRateBp: number | null;
  whtAmount: number; // ภาษีถูกหัก (สตางค์) — สะสมเป็นเครดิต 1160
  hasCertCopy: boolean; // แนบสำเนา 50 ทวิที่ได้รับ?
};

/** WHT ถูกหัก: payment ฝั่ง OUT (ลูกหนี้เรา) ที่มี whtAmountSatang > 0 */
export async function listWhtCredits(
  tenantId: string,
  systemId: string,
  opts?: { period?: string; year?: string },
): Promise<{ rows: WhtCreditRow[]; totalWht: number; totalBase: number }> {
  let paidRange: { gte?: Date; lt?: Date } = {};
  if (opts?.period) paidRange = periodRange(opts.period);
  else if (opts?.year) {
    const y = parseInt(opts.year, 10);
    paidRange = { gte: new Date(Date.UTC(y, 0, 1, -7)), lt: new Date(Date.UTC(y + 1, 0, 1, -7)) };
  }

  const payments = await prisma.accountDocumentPayment.findMany({
    where: {
      tenantId,
      systemId,
      whtAmountSatang: { gt: 0 },
      voidedAt: null,
      document: { direction: "OUT" },
      ...(paidRange.gte ? { paidAt: { gte: paidRange.gte, lt: paidRange.lt } } : {}),
    },
    include: {
      document: {
        select: {
          id: true,
          docNo: true,
          docType: true,
          contactSnapshot: true,
          contact: { select: { name: true, taxId: true } },
          attachments: { select: { id: true } },
        },
      },
    },
    // WO 9.3: ตัวตัดสินลำดับ (paidAt เป็นวันที่ ⇒ รับชำระวันเดียวกันเรียงสลับได้) — รายงานต้องนิ่ง
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });

  let totalWht = 0;
  let totalBase = 0;
  const rows: WhtCreditRow[] = payments.map((p) => {
    const snap = (p.document.contactSnapshot as Record<string, unknown> | null) ?? null;
    const base = baseFromWht(p.whtAmountSatang, p.whtRateBp);
    totalWht += p.whtAmountSatang;
    totalBase += base ?? 0;
    return {
      paymentId: p.id,
      documentId: p.document.id,
      paidAt: p.paidAt,
      docNo: p.document.docNo,
      docType: p.document.docType,
      contactName: (snap?.name as string) ?? p.document.contact?.name ?? "—",
      contactTaxId: (snap?.taxId as string) ?? p.document.contact?.taxId ?? null,
      base,
      whtRateBp: p.whtRateBp,
      whtAmount: p.whtAmountSatang,
      hasCertCopy: p.document.attachments.length > 0,
    };
  });
  return { rows, totalWht, totalBase };
}

/**
 * WO 1.4 — บันทึก "เอกสารภาษีถูกหัก ณ ที่จ่าย" ฝั่งขาย (WTI) จาก payment ที่ลูกค้าหักภาษีไว้
 *
 * ต่างจาก 50 ทวิ ฝั่งซื้อ (`issueWhtCert` / prefix `WHT-`) ตรงที่ใบนี้ **เราเป็นผู้ถูกหัก**
 * ⇒ เป็นหลักฐานเครดิตภาษี 1160 ที่ต้องเก็บไว้ยื่นภาษีปลายปี (ภาพ g2 เรียก `WTI-…`)
 * ไม่โพสต์ GL (1160 ลงตอน `postPayment` แล้ว — WHT_CERT อยู่ใน NO_GL ของ gl.ts)
 *
 * 🔴 เรียกได้เฉพาะ "ใน transaction เดียวกับการสร้าง payment" (รับ tx เข้ามา) —
 *    ไม่งั้น payment เกิดแล้วแต่ cert ล้ม = เครดิตภาษีหาย
 */
export async function issueWhtCreditCert(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: {
    documentId: string;
    paymentId: string;
    whtAmount: number;
    whtRateBp: number | null;
    incomeType: AccountWhtIncomeType;
    /** ฐานเงินได้จริงของงวดนี้ (ก่อน VAT) — ไม่ย้อนจาก wht/rate เพราะปัดเศษแล้วเพี้ยน */
    base: number;
    issueDate: Date; // = paidAt (tax point)
  },
): Promise<{ id: string; docNo: string }> {
  const doc = await tx.accountDocument.findFirst({
    where: { id: input.documentId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, contactId: true, contactSnapshot: true },
  });
  if (!doc) throw new Error("ไม่พบเอกสารต้นทางของภาษีถูกหัก ณ ที่จ่าย");
  const docNo = await nextWhtCreditNo(tx, ctx, input.issueDate);
  const cert = await tx.accountDocument.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      docType: "WHT_CERT",
      status: "ISSUED",
      // 🔴 direction = OUT คือตัวแยกว่า "ถูกหัก (เครดิตเรา)" ไม่ใช่ "เราหักเขา (ต้องนำส่ง)"
      //    ภ.ง.ด.3/53 อ่านเฉพาะ direction IN ⇒ ใบนี้ไม่หลุดเข้ารายงานนำส่ง
      direction: "OUT",
      docNo,
      issueDate: input.issueDate,
      contactId: doc.contactId,
      contactSnapshot: (doc.contactSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
      vatMode: "NONE",
      subTotal: input.base,
      vatAmount: 0,
      grandTotal: input.base,
      whtIncomeType: input.incomeType,
      whtRateBp: input.whtRateBp,
      whtAmount: input.whtAmount,
      sourceDocId: doc.id,
      sourcePaymentId: input.paymentId,
      note: "เอกสารภาษีถูกหัก ณ ที่จ่าย (เครดิตภาษี)",
    },
    select: { id: true, docNo: true },
  });
  await tx.accountDocumentPayment.update({
    where: { id: input.paymentId },
    data: { whtCertDocId: cert.id, whtRateBp: input.whtRateBp },
  });
  await tx.accountDocumentRelation.create({
    data: { tenantId: ctx.tenantId, systemId: ctx.systemId, fromId: doc.id, toId: cert.id, type: "TAX_FOR", amount: input.whtAmount },
  });
  return { id: cert.id, docNo: cert.docNo ?? docNo };
}

/** เวอร์ชันที่เปิด transaction เอง — ใช้ตอนออกใบให้ payment ที่สร้างไปแล้ว (ใบเสร็จขายสด §5.2 F) */
export async function issueWhtCreditCertStandalone(
  ctx: Ctx,
  input: {
    documentId: string;
    paymentId: string;
    whtAmount: number;
    whtRateBp: number | null;
    incomeType: AccountWhtIncomeType;
    base: number;
    issueDate: Date;
  },
): Promise<{ ok: true; docNo: string } | { ok: false; reason: string }> {
  try {
    const cert = await prisma.$transaction((tx) => issueWhtCreditCert(tx, ctx, input));
    return { ok: true, docNo: cert.docNo };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "ออกเอกสารภาษีถูกหัก ณ ที่จ่ายไม่สำเร็จ" };
  }
}

/** เลขรันเอกสารภาษีถูกหัก ฝั่งขาย — ใช้ตารางเลขรันร่วม แต่คนละ periodKey ("WTI:YYYY-MM")
 *  ⇒ ไม่กินเลขเดียวกับ 50 ทวิ ฝั่งซื้อ (`WHT-`) และไม่ต้องเพิ่ม docType ใหม่ใน enum */
async function nextWhtCreditNo(tx: Prisma.TransactionClient, ctx: Ctx, date: Date): Promise<string> {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const periodKey = `WTI:${year}-${month}`;
  const seq = await tx.accountDocSequence.upsert({
    where: { systemId_docType_periodKey: { systemId: ctx.systemId, docType: "WHT_CERT", periodKey } },
    create: { tenantId: ctx.tenantId, systemId: ctx.systemId, docType: "WHT_CERT", prefix: "WTI", periodKey, lastNo: 1 },
    update: { lastNo: { increment: 1 } },
  });
  return `WTI-${year}${month}-${String(seq.lastNo).padStart(4, "0")}`;
}

// ─────────────────── ② WHT เราหัก vendor: ทะเบียน + ออก 50 ทวิ ───────────────────

export type WhtDeductionRow = {
  paymentId: string;
  documentId: string;
  paidAt: Date;
  docNo: string | null;
  contactName: string;
  contactTaxId: string | null;
  legalType: AccountLegalType | null;
  base: number | null;
  whtRateBp: number | null;
  whtAmount: number;
  certDocId: string | null;
  certNo: string | null; // เลข 50 ทวิ (ถ้าออกแล้ว)
};

/** WHT เราหัก: payment ฝั่ง IN (เจ้าหนี้) ที่มี whtAmountSatang > 0 */
export async function listWhtDeductions(
  tenantId: string,
  systemId: string,
  opts?: { period?: string },
): Promise<{ rows: WhtDeductionRow[]; totalWht: number }> {
  const paidRange = opts?.period ? periodRange(opts.period) : null;
  const payments = await prisma.accountDocumentPayment.findMany({
    where: {
      tenantId,
      systemId,
      whtAmountSatang: { gt: 0 },
      voidedAt: null,
      document: { direction: "IN" },
      ...(paidRange ? { paidAt: { gte: paidRange.gte, lt: paidRange.lt } } : {}),
    },
    include: {
      document: {
        select: {
          id: true,
          docNo: true,
          contactSnapshot: true,
          contact: { select: { name: true, taxId: true, legalType: true } },
        },
      },
    },
    orderBy: { paidAt: "asc" },
  });

  // เลข 50 ทวิ ของ payment ที่ออกแล้ว (whtCertDocId → docNo)
  const certIds = payments.map((p) => p.whtCertDocId).filter((x): x is string => !!x);
  const certs = certIds.length
    ? await prisma.accountDocument.findMany({
        where: { systemId, id: { in: certIds } },
        select: { id: true, docNo: true },
      })
    : [];
  const certNoById = new Map(certs.map((c) => [c.id, c.docNo]));

  let totalWht = 0;
  const rows: WhtDeductionRow[] = payments.map((p) => {
    const snap = (p.document.contactSnapshot as Record<string, unknown> | null) ?? null;
    totalWht += p.whtAmountSatang;
    return {
      paymentId: p.id,
      documentId: p.document.id,
      paidAt: p.paidAt,
      docNo: p.document.docNo,
      contactName: (snap?.name as string) ?? p.document.contact?.name ?? "—",
      contactTaxId: (snap?.taxId as string) ?? p.document.contact?.taxId ?? null,
      legalType: p.document.contact?.legalType ?? null,
      base: baseFromWht(p.whtAmountSatang, p.whtRateBp),
      whtRateBp: p.whtRateBp,
      whtAmount: p.whtAmountSatang,
      certDocId: p.whtCertDocId,
      certNo: p.whtCertDocId ? certNoById.get(p.whtCertDocId) ?? null : null,
    };
  });
  return { rows, totalWht };
}

// เลขรัน 50 ทวิ (WHT_CERT) — reset รายเดือน · ใช้ AccountDocSequence ร่วม (ตารางกลาง)
async function nextWhtCertNo(
  tx: Prisma.TransactionClient,
  tenantId: string,
  systemId: string,
  date: Date,
): Promise<string> {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const periodKey = `${year}-${month}`;
  const seq = await tx.accountDocSequence.upsert({
    where: { systemId_docType_periodKey: { systemId, docType: "WHT_CERT", periodKey } },
    create: { tenantId, systemId, docType: "WHT_CERT", prefix: "WHT", periodKey, lastNo: 1 },
    update: { lastNo: { increment: 1 } },
  });
  return `WHT-${year}-${month}-${String(seq.lastNo).padStart(4, "0")}`;
}

/**
 * ออกหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) จาก payment ฝั่ง IN ที่หัก WHT ไว้แล้ว
 * → สร้าง AccountDocument docType=WHT_CERT + ผูก payment.whtCertDocId (ไม่โพสต์ GL ซ้ำ)
 */
export async function issueWhtCert(
  tenantId: string,
  systemId: string,
  input: {
    paymentId: string;
    whtIncomeType: AccountWhtIncomeType;
    whtRateBp?: number | null; // ถ้า payment ไม่มีอัตรา
    createdById?: string | null;
  },
): Promise<{ ok: true; certId: string; docNo: string } | { ok: false; reason: string }> {
  try {
    const res = await prisma.$transaction(async (tx) => {
      const pay = await tx.accountDocumentPayment.findFirst({
        where: { id: input.paymentId, tenantId, systemId },
        include: {
          document: { select: { id: true, direction: true, contactId: true, contactSnapshot: true } },
        },
      });
      if (!pay) throw new Error("ไม่พบรายการชำระ");
      if (pay.voidedAt) throw new Error("รายการชำระถูกยกเลิกแล้ว");
      if (pay.document.direction !== "IN") throw new Error("50 ทวิ ออกได้เฉพาะรายการจ่ายที่หักภาษีไว้");
      if (pay.whtAmountSatang <= 0) throw new Error("รายการนี้ไม่มีภาษีหัก ณ ที่จ่าย");
      if (pay.whtCertDocId) throw new Error("ออก 50 ทวิ ให้รายการนี้แล้ว");

      const rateBp = pay.whtRateBp ?? input.whtRateBp ?? null;
      if (!rateBp || rateBp <= 0) throw new Error("กรุณาระบุอัตราภาษีหัก ณ ที่จ่าย");
      const base = baseFromWht(pay.whtAmountSatang, rateBp) ?? 0;
      const issueDate = pay.paidAt; // tax point = วันจ่าย
      const docNo = await nextWhtCertNo(tx, tenantId, systemId, issueDate);

      const cert = await tx.accountDocument.create({
        data: {
          tenantId,
          systemId,
          docType: "WHT_CERT",
          status: "ISSUED",
          direction: "IN",
          docNo,
          issueDate,
          contactId: pay.document.contactId,
          contactSnapshot: (pay.document.contactSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
          vatMode: "NONE",
          whtIncomeType: input.whtIncomeType,
          whtRateBp: rateBp,
          whtAmount: pay.whtAmountSatang,
          subTotal: base, // ฐานเงินได้ที่จ่าย
          grandTotal: base,
          sourceDocId: pay.document.id,
          sourcePaymentId: pay.id,
          createdById: input.createdById ?? null,
        },
        select: { id: true, docNo: true },
      });
      await tx.accountDocumentPayment.update({
        where: { id: pay.id },
        data: { whtCertDocId: cert.id, whtRateBp: rateBp },
      });
      return { certId: cert.id, docNo: cert.docNo ?? docNo };
    });
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "ออก 50 ทวิ ไม่สำเร็จ" };
  }
}

/** โหลด 50 ทวิ + payment ต้นทาง (สำหรับ print view ฟอร์มราชการ) */
export async function getWhtCert(tenantId: string, systemId: string, certId: string) {
  return prisma.accountDocument.findFirst({
    where: { id: certId, tenantId, systemId, docType: "WHT_CERT" },
    include: { contact: true },
  });
}

// ─────────────────── ③ ภ.ง.ด.3 (บุคคล) / 53 (นิติ) ───────────────────

export type PndRow = {
  seq: number;
  certId: string;
  certNo: string | null;
  paidAt: Date;
  recipientName: string;
  recipientTaxId: string | null;
  recipientBranch: string | null; // WO 5.4: สาขา (จาก snapshot.branchCode — ม.86/4 ต้องระบุ 00000=สนง.ใหญ่)
  recipientAddress: string | null; // M5: ที่อยู่ผู้รับเงิน (จาก snapshot)
  incomeType: AccountWhtIncomeType | null;
  incomeLabel: string;
  base: number;
  whtRateBp: number | null;
  whtAmount: number;
  condition: string; // M5: เงื่อนไขการหัก (1=หัก ณ ที่จ่าย · 2=ออกให้ตลอดไป · 3=ออกให้ครั้งเดียว)
};

/**
 * สรุป ภ.ง.ด. รายเดือน — type 3 = ผู้รับบุคคลธรรมดา · 53 = นิติบุคคล
 * (จาก WHT_CERT ที่ออกในเดือนนั้น กรองตาม legalType ของผู้รับ)
 */
export async function pnd(
  tenantId: string,
  systemId: string,
  input: { type: 3 | 53; period: string },
): Promise<{
  rows: PndRow[];
  byIncomeType: Array<{ incomeType: AccountWhtIncomeType; label: string; base: number; wht: number; count: number }>;
  grandBase: number;
  grandWht: number;
}> {
  const legalType: AccountLegalType = input.type === 3 ? "PERSON" : "COMPANY";
  const { gte, lt } = periodRange(input.period);
  // M4: กรอง legalType จาก contactSnapshot (freeze ณ วันออกใบ) ไม่ใช่ contact สด → ภงด 3/53 ไม่ขยับย้อนหลัง
  const allCerts = await prisma.accountDocument.findMany({
    where: {
      tenantId,
      systemId,
      docType: "WHT_CERT",
      // 🔴 WO 1.4: เฉพาะ 50 ทวิ ที่ "เราหักเขา" (direction IN) เท่านั้นที่ต้องนำส่งสรรพากร
      //    ใบ WTI (direction OUT = ลูกค้าหักเรา) เป็นเครดิตภาษีของเรา ห้ามหลุดเข้า ภ.ง.ด.3/53
      direction: "IN",
      status: "ISSUED",
      issueDate: { gte, lt },
    },
    include: { contact: { select: { name: true, taxId: true, address: true, legalType: true, branchCode: true } } },
    orderBy: { issueDate: "asc" },
  });
  const certs = allCerts.filter((c) => {
    const snap = (c.contactSnapshot as Record<string, unknown> | null) ?? null;
    const lt = (snap?.legalType as AccountLegalType) ?? c.contact?.legalType ?? "COMPANY";
    return lt === legalType;
  });

  let grandBase = 0;
  let grandWht = 0;
  const byMap = new Map<AccountWhtIncomeType, { base: number; wht: number; count: number }>();
  const rows: PndRow[] = certs.map((c, i) => {
    const snap = (c.contactSnapshot as Record<string, unknown> | null) ?? null;
    const base = c.subTotal;
    const wht = c.whtAmount;
    grandBase += base;
    grandWht += wht;
    if (c.whtIncomeType) {
      const cur = byMap.get(c.whtIncomeType) ?? { base: 0, wht: 0, count: 0 };
      cur.base += base;
      cur.wht += wht;
      cur.count += 1;
      byMap.set(c.whtIncomeType, cur);
    }
    return {
      seq: i + 1,
      certId: c.id,
      certNo: c.docNo,
      paidAt: c.issueDate,
      recipientName: (snap?.name as string) ?? c.contact?.name ?? "—",
      recipientTaxId: (snap?.taxId as string) ?? c.contact?.taxId ?? null,
      recipientBranch: (snap?.branchCode as string) ?? c.contact?.branchCode ?? "00000",
      recipientAddress: (snap?.address as string) ?? c.contact?.address ?? null,
      incomeType: c.whtIncomeType,
      incomeLabel: c.whtIncomeType ? WHT_INCOME_LABEL[c.whtIncomeType] : "—",
      base,
      whtRateBp: c.whtRateBp,
      whtAmount: wht,
      condition: "1", // หัก ณ ที่จ่าย (default) — 2 ออกให้ตลอดไป · 3 ออกให้ครั้งเดียว
    };
  });

  const byIncomeType = Array.from(byMap.entries()).map(([incomeType, v]) => ({
    incomeType,
    label: WHT_INCOME_LABEL[incomeType],
    base: v.base,
    wht: v.wht,
    count: v.count,
  }));

  return { rows, byIncomeType, grandBase, grandWht };
}

// CSV (BOM UTF-8 ให้ Excel เปิดไทยได้) — ยอดเป็นบาททศนิยม 2
// 🔴 WO 9.2 ข้อ 7: เดิมมีตัวหนีบรรทัด/คอมมาเองแต่ **ไม่กันสูตร** — ชื่อคู่ค้าที่ขึ้นต้นด้วย `=`
//    กลายเป็นสูตรทันทีที่ฝ่ายบัญชีเปิดไฟล์ ⇒ ใช้ `csvCell` กลางของ core/csv.ts แทน (กันสูตร + quote)
const bahtStr = (satang: number) => (satang / 100).toFixed(2);

export async function pndCsv(
  tenantId: string,
  systemId: string,
  input: { type: 3 | 53; period: string },
): Promise<string> {
  const { rows, grandBase, grandWht } = await pnd(tenantId, systemId, input);
  // M5: + ที่อยู่ผู้รับเงิน + เงื่อนไขการหัก (1 หัก ณ ที่จ่าย · 2 ออกให้ตลอดไป · 3 ออกให้ครั้งเดียว)
  // WO 5.4: เพิ่ม "สาขา" (ม.86/4 บังคับระบุ 00000=สนง.ใหญ่ หรือรหัสสาขา) — ของจริงมีอยู่แล้วใน
  // contactSnapshot.branchCode (WO 0.3) เดิมแค่ไม่ได้ export ลง CSV
  const header = [
    "ลำดับ",
    "เลขที่ 50 ทวิ",
    "วันที่จ่าย",
    "ชื่อผู้รับเงิน",
    "เลขประจำตัวผู้เสียภาษี",
    "สาขา",
    "ที่อยู่",
    "ประเภทเงินได้",
    "จำนวนเงินได้",
    "อัตรา (%)",
    "ภาษีที่หัก",
    "เงื่อนไขการหัก",
  ];
  const lines = rows.map((r) =>
    [
      r.seq,
      r.certNo ?? "",
      r.paidAt.toISOString().slice(0, 10),
      r.recipientName,
      r.recipientTaxId ?? "",
      r.recipientBranch ?? "00000",
      r.recipientAddress ?? "",
      r.incomeLabel,
      bahtStr(r.base),
      r.whtRateBp != null ? (r.whtRateBp / 100).toFixed(2) : "",
      bahtStr(r.whtAmount),
      r.condition,
    ]
      .map(csvCell)
      .join(","),
  );
  const totalLine = ["", "", "", "", "", "", "", "รวม", bahtStr(grandBase), "", bahtStr(grandWht), ""]
    .map(csvCell)
    .join(",");
  return "﻿" + [header.map(csvCell).join(","), ...lines, totalLine].join("\n");
}

// CSV ภาษีถูกหัก (เครดิต 1160) — สะสมทั้งปี/งวด สำหรับกระทบยอดเครดิตภาษี
export async function whtCreditsCsv(
  tenantId: string,
  systemId: string,
  opts?: { period?: string; year?: string },
): Promise<string> {
  const { rows, totalBase, totalWht } = await listWhtCredits(tenantId, systemId, opts);
  const header = [
    "วันที่จ่าย",
    "เอกสาร",
    "ผู้หักภาษี (ลูกค้า)",
    "เลขประจำตัวผู้เสียภาษี",
    "ฐานเงินได้",
    "อัตรา (%)",
    "ภาษีถูกหัก",
    "มีสำเนา 50 ทวิ",
  ];
  const lines = rows.map((r) =>
    [
      r.paidAt.toISOString().slice(0, 10),
      r.docNo ?? "",
      r.contactName,
      r.contactTaxId ?? "",
      r.base != null ? bahtStr(r.base) : "",
      r.whtRateBp != null ? (r.whtRateBp / 100).toFixed(2) : "",
      bahtStr(r.whtAmount),
      r.hasCertCopy ? "มี" : "ไม่มี",
    ]
      .map(csvCell)
      .join(","),
  );
  const totalLine = ["", "", "", "รวม", bahtStr(totalBase), "", bahtStr(totalWht), ""]
    .map(csvCell)
    .join(",");
  return "﻿" + [header.map(csvCell).join(","), ...lines, totalLine].join("\n");
}

// ─────────────────── ④ หน้ารายการ V2 (§10.5 · g11) ───────────────────
// รวม direction เดียว = ทั้ง PERSON+COMPANY ในตารางเดียว (ตรง g11 — คอลัมน์เดียวกัน ไม่แยกแบบ)
// ต่างจาก listWhtCredits/listWhtDeductions ("payment"-first, กรอง voidedAt:null) ตรงที่ตัวนี้เริ่มจาก
// AccountDocument WHT_CERT ตรง ๆ (เหมือน pnd()) → เห็นแถวที่ถูกยกเลิกด้วย (แท็บ "ยกเลิก" ต้องมีของจริงให้กรอง)

export type WhtCertStatusTab = "ALL" | "NORMAL" | "CANCELLED";

export type WhtCertRow = {
  id: string; // = certId (DocTable<T extends {id:string}> ต้องการชื่อนี้ — certId คงไว้เพื่ออ่านเข้าใจง่ายในโค้ดอื่น)
  certId: string;
  certNo: string | null;
  cancelled: boolean; // VOIDED หรือ CANCELLED
  paidAt: Date; // = issueDate ของ WHT_CERT (= payment.paidAt ตอนออก)
  contactName: string;
  contactTaxId: string | null;
  legalType: AccountLegalType;
  form: 3 | 53; // PERSON→3 · COMPANY→53 (ใช้กับ direction IN เท่านั้น — ฝั่ง OUT ไม่มีความหมาย)
  sourceDocId: string | null;
  sourceDocNo: string | null; // "อ้างอิงเอกสาร" (g11) — เอกสารต้นทาง (ใบแจ้งหนี้/บันทึกซื้อ ฯลฯ)
  sourceDocType: string | null; // ใช้ประกอบลิงก์ผ่าน editorDetailPath (ทำใน UI ไม่ทำใน wht.ts — คนละชั้น)
  incomeType: AccountWhtIncomeType | null;
  incomeLabel: string;
  base: number;
  whtRateBp: number | null;
  whtAmount: number;
  /** เฉพาะ direction IN — "53:2026-09" = ยื่นแล้วงวดนั้น · null = ยังไม่ยื่น */
  filedPeriodKey: string | null;
};

/** หน้ารายการ WHT V2 (ทั้ง 2 ขา) — ตัวกรอง: ช่วงวันที่ชำระ · แท็บสถานะ · ค้นหา · หน้า */
/**
 * WO 9.3: แปลงแถว WHT_CERT → WhtCertRow — สูตรเดียวใช้ทั้งทางที่ตัดหน้าที่ DB และทางที่มีคำค้น
 * (เดิมเขียน map ไว้ในตัวฟังก์ชัน — แยกออกมาเพื่อไม่ให้ 2 ทางคำนวณต่างกัน)
 */
function toWhtCertRow(
  c: {
    id: string;
    docNo: string | null;
    status: string;
    issueDate: Date;
    contactSnapshot: unknown;
    contact: { name: string; taxId: string | null; legalType: AccountLegalType; branchCode: string | null } | null;
    sourceDocId: string | null;
    whtIncomeType: AccountWhtIncomeType | null;
    subTotal: number;
    whtRateBp: number | null;
    whtAmount: number;
    whtFiledPeriodKey: string | null;
  },
  sourceNoById: Map<string, string | null>,
  sourceTypeById: Map<string, string>,
): WhtCertRow {
  const snap = (c.contactSnapshot as Record<string, unknown> | null) ?? null;
  const legalType = (snap?.legalType as AccountLegalType) ?? c.contact?.legalType ?? "COMPANY";
  return {
    id: c.id,
    certId: c.id,
    certNo: c.docNo,
    cancelled: c.status === "VOIDED" || c.status === "CANCELLED",
    paidAt: c.issueDate,
    contactName: (snap?.name as string) ?? c.contact?.name ?? "—",
    contactTaxId: (snap?.taxId as string) ?? c.contact?.taxId ?? null,
    legalType,
    form: legalType === "PERSON" ? (3 as const) : (53 as const),
    sourceDocId: c.sourceDocId,
    sourceDocNo: c.sourceDocId ? (sourceNoById.get(c.sourceDocId) ?? null) : null,
    sourceDocType: c.sourceDocId ? (sourceTypeById.get(c.sourceDocId) ?? null) : null,
    incomeType: c.whtIncomeType,
    incomeLabel: c.whtIncomeType ? WHT_INCOME_LABEL[c.whtIncomeType] : "—",
    base: c.subTotal,
    whtRateBp: c.whtRateBp,
    whtAmount: c.whtAmount,
    filedPeriodKey: c.whtFiledPeriodKey,
  };
}

export async function listWhtCertsV2(
  tenantId: string,
  systemId: string,
  input: {
    direction: AccountDocDirection; // IN = เราหักผู้ขาย (ต้องนำส่ง) · OUT = ลูกค้าหักเรา (เครดิตภาษี)
    from?: Date;
    to?: Date;
    status?: WhtCertStatusTab;
    q?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<{
  rows: WhtCertRow[];
  total: number;
  totalBase: number;
  totalWht: number;
  tabCounts: { ALL: number; NORMAL: number; CANCELLED: number };
}> {
  // 🔴 WO 9.3 (Part D "แบ่งหน้าที่ฝั่ง DB") — เดิมฟังก์ชันนี้ดึง **ทุกใบ 50 ทวิของระบบ** เข้าหน่วยความจำ
  //    (ไม่มี take) แล้วค่อย filter/slice ฝั่ง JS ⇒ ร้านที่ออก 50 ทวิหลักหมื่นใบจะโหลดหมื่นแถวทุกครั้ง
  //    ที่เปิดหน้า · ตอนนี้: ไม่มีคำค้น = ตัดหน้าที่ DB (นับ/รวมยอดด้วย groupBy+aggregate ทั้งชุด)
  //
  //    ⚠️ ยังเหลือทางเดิมไว้เมื่อ "มีคำค้น" เพราะคำค้นครอบ **เลขที่เอกสารต้นทาง** (`sourceDocId` เป็น
  //    scalar ไม่มี relation ในสคีมา ⇒ กรองใน SQL ไม่ได้) และชื่อผู้ติดต่อที่แช่แข็งใน JSON
  //    `contactSnapshot` ⇒ ถ้าตัดหน้าที่ DB ตอนมีคำค้น ผลลัพธ์จะเปลี่ยน (หาไม่เจอ) — ทางแก้จริงคือ
  //    denormalise `sourceDocNo`/`contactName` ลงคอลัมน์ (งานสคีมา → ยกไป 10.x)
  const baseWhere: Prisma.AccountDocumentWhereInput = {
    tenantId,
    systemId,
    docType: "WHT_CERT",
    direction: input.direction,
    status: { in: ["ISSUED", "VOIDED", "CANCELLED"] },
    ...(input.from || input.to
      ? { issueDate: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lt: input.to } : {}) } }
      : {}),
  };
  const qRaw = (input.q ?? "").trim();
  const pageSizeIn = input.pageSize ?? 20;
  const pageIn = Math.max(1, input.page ?? 1);

  if (qRaw.length === 0) {
    const statusTab = input.status ?? "ALL";
    const CANCELLED_STATES: AccountDocStatus[] = ["VOIDED", "CANCELLED"];
    const statusWhere: Prisma.AccountDocumentWhereInput =
      statusTab === "ALL"
        ? {}
        : statusTab === "NORMAL"
          ? { status: { notIn: CANCELLED_STATES } }
          : { status: { in: CANCELLED_STATES } };
    const where: Prisma.AccountDocumentWhereInput = { ...baseWhere, ...statusWhere };
    const [byStatus, agg, pageRows] = await Promise.all([
      prisma.accountDocument.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
      prisma.accountDocument.aggregate({ where, _count: { _all: true }, _sum: { subTotal: true, whtAmount: true } }),
      prisma.accountDocument.findMany({
        where,
        include: { contact: { select: { name: true, taxId: true, legalType: true, branchCode: true } } },
        orderBy: { issueDate: "desc" },
        skip: (pageIn - 1) * pageSizeIn,
        take: pageSizeIn,
      }),
    ]);
    const cancelledCount = byStatus
      .filter((g) => (CANCELLED_STATES as string[]).includes(g.status))
      .reduce((s, g) => s + (g._count?._all ?? 0), 0);
    const allCount = byStatus.reduce((s, g) => s + (g._count?._all ?? 0), 0);
    const srcIds = pageRows.map((c) => c.sourceDocId).filter((x): x is string => !!x);
    const srcRows = srcIds.length
      ? await prisma.accountDocument.findMany({
          where: { systemId, id: { in: srcIds } },
          select: { id: true, docNo: true, docType: true },
        })
      : [];
    const srcNo = new Map(srcRows.map((s) => [s.id, s.docNo]));
    const srcType = new Map(srcRows.map((s) => [s.id, s.docType as string]));
    return {
      rows: pageRows.map((c) => toWhtCertRow(c, srcNo, srcType)),
      total: agg._count?._all ?? 0,
      totalBase: agg._sum?.subTotal ?? 0,
      totalWht: agg._sum?.whtAmount ?? 0,
      tabCounts: { ALL: allCount, NORMAL: allCount - cancelledCount, CANCELLED: cancelledCount },
    };
  }

  const certs = await prisma.accountDocument.findMany({
    where: baseWhere,
    include: { contact: { select: { name: true, taxId: true, legalType: true, branchCode: true } } },
    orderBy: { issueDate: "desc" },
  });

  const sourceIds = certs.map((c) => c.sourceDocId).filter((x): x is string => !!x);
  const sources = sourceIds.length
    ? await prisma.accountDocument.findMany({ where: { systemId, id: { in: sourceIds } }, select: { id: true, docNo: true, docType: true } })
    : [];
  const sourceNoById = new Map(sources.map((s) => [s.id, s.docNo]));
  const sourceTypeById = new Map(sources.map((s) => [s.id, s.docType as string]));

  const q = qRaw.toLowerCase();
  const allRows: WhtCertRow[] = certs
    .map((c) => toWhtCertRow(c, sourceNoById, sourceTypeById))
    .filter((r) =>
      q.length === 0
        ? true
        : r.contactName.toLowerCase().includes(q) ||
          (r.certNo ?? "").toLowerCase().includes(q) ||
          (r.sourceDocNo ?? "").toLowerCase().includes(q),
    );

  const tabCounts = {
    ALL: allRows.length,
    NORMAL: allRows.filter((r) => !r.cancelled).length,
    CANCELLED: allRows.filter((r) => r.cancelled).length,
  };

  const status = input.status ?? "ALL";
  const filtered = allRows.filter((r) => (status === "ALL" ? true : status === "NORMAL" ? !r.cancelled : r.cancelled));
  const totalBase = filtered.reduce((s, r) => s + r.base, 0);
  const totalWht = filtered.reduce((s, r) => s + r.whtAmount, 0);

  const pageSize = input.pageSize ?? 20;
  const page = Math.max(1, input.page ?? 1);
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  return { rows, total: filtered.length, totalBase, totalWht, tabCounts };
}

/** เครดิตภาษีถูกหักสะสมปีนี้ (Σ WHT_CERT direction OUT, ISSUED, ปีนี้) — ไทล์บนหน้า WHT ทั้ง 2 ขา (g11) */
export async function whtCreditYearTotal(tenantId: string, systemId: string, year: number): Promise<number> {
  const gte = new Date(Date.UTC(year, 0, 1, -7));
  const lt = new Date(Date.UTC(year + 1, 0, 1, -7));
  const agg = await prisma.accountDocument.aggregate({
    where: { tenantId, systemId, docType: "WHT_CERT", direction: "OUT", status: "ISSUED", issueDate: { gte, lt } },
    _sum: { whtAmount: true },
  });
  return agg._sum.whtAmount ?? 0;
}

/**
 * ทำเครื่องหมายนำส่งแล้ว (§10.5 "(งวด)") — คำนวณผลรวมสดจาก `pnd()` เสมอแล้ว upsert (ไม่ increment)
 * ⇒ idempotent ต่อ (systemId, form, periodKey): เรียกซ้ำได้ผลเดิมเป๊ะ ไม่นับซ้ำ
 * stamp `whtFiledPeriodKey = "<form>:<periodKey>"` เฉพาะ cert ที่ยังไม่ stamp (cert เก่าที่ stamp ไปแล้วข้ามเงียบ)
 */
export async function markFiled(
  tenantId: string,
  systemId: string,
  input: { form: 3 | 53; periodKey: string; filedById?: string | null; note?: string | null },
): Promise<{ ok: true; certCount: number; totalBaseSatang: number; totalTaxSatang: number } | { ok: false; reason: string }> {
  try {
    const report = await pnd(tenantId, systemId, { type: input.form, period: input.periodKey });
    if (report.rows.length === 0) return { ok: false, reason: "ไม่มี 50 ทวิ ที่ต้องนำส่งในงวดนี้" };
    const key = `${input.form}:${input.periodKey}`;
    await prisma.$transaction(async (tx) => {
      await tx.accountWhtFiling.upsert({
        where: { systemId_form_periodKey: { systemId, form: input.form, periodKey: input.periodKey } },
        create: {
          tenantId,
          systemId,
          form: input.form,
          periodKey: input.periodKey,
          filedById: input.filedById ?? null,
          totalBaseSatang: report.grandBase,
          totalTaxSatang: report.grandWht,
          certCount: report.rows.length,
          note: input.note ?? null,
        },
        update: {
          filedAt: new Date(),
          filedById: input.filedById ?? null,
          totalBaseSatang: report.grandBase,
          totalTaxSatang: report.grandWht,
          certCount: report.rows.length,
          note: input.note ?? null,
        },
      });
      await tx.accountDocument.updateMany({
        where: { systemId, docType: "WHT_CERT", id: { in: report.rows.map((r) => r.certId) }, whtFiledPeriodKey: null },
        data: { whtFiledPeriodKey: key },
      });
    });
    return { ok: true, certCount: report.rows.length, totalBaseSatang: report.grandBase, totalTaxSatang: report.grandWht };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "ทำเครื่องหมายนำส่งแล้วไม่สำเร็จ" };
  }
}

/** ยกเลิกเครื่องหมายนำส่งแล้ว (สิทธิ์ระดับเจ้าของ — `account.wht.unmark` ตรวจที่ actions.ts) */
export async function unmarkFiled(
  tenantId: string,
  systemId: string,
  input: { form: 3 | 53; periodKey: string },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const key = `${input.form}:${input.periodKey}`;
  try {
    await prisma.$transaction(async (tx) => {
      const filing = await tx.accountWhtFiling.findFirst({
        where: { tenantId, systemId, form: input.form, periodKey: input.periodKey },
      });
      if (!filing) throw new Error("งวดนี้ยังไม่ได้ทำเครื่องหมายนำส่ง");
      await tx.accountDocument.updateMany({
        where: { systemId, docType: "WHT_CERT", whtFiledPeriodKey: key },
        data: { whtFiledPeriodKey: null },
      });
      await tx.accountWhtFiling.delete({ where: { id: filing.id } });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "ยกเลิกเครื่องหมายนำส่งไม่สำเร็จ" };
  }
}

/** งวดที่ทำเครื่องหมายนำส่งแล้วทั้งหมดของระบบ — ใช้เช็คสถานะในหน้ารายการ/modal (ไม่ query ทีละ cert) */
export function listWhtFilings(tenantId: string, systemId: string) {
  return prisma.accountWhtFiling.findMany({ where: { tenantId, systemId }, orderBy: [{ periodKey: "desc" }, { form: "asc" }] });
}

const PERIOD_LABEL_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export function periodKeyLabel(periodKey: string): string {
  const [y, m] = periodKey.split("-").map((x) => parseInt(x, 10));
  return `${PERIOD_LABEL_TH[m - 1] ?? periodKey} ${y}`;
}

/** เดือนย่อไม่มีปี "ก.ย." — ใช้กับชิป "ยื่นแล้ว …" ในตาราง (g11: "ยื่นแล้ว ก.ย." ไม่มีปี ต่างจาก modal ที่มีปี) */
export function periodKeyMonthShort(periodKey: string): string {
  const m = parseInt(periodKey.split("-")[1] ?? "", 10);
  return PERIOD_LABEL_TH[m - 1] ?? periodKey;
}

/**
 * ตรวจแถวที่ผู้ใช้เลือกไว้ (จาก bulk bar g11) ก่อนเปิด modal "ทำเครื่องหมายนำส่งแล้ว" —
 * ต้องอยู่แบบ (ภ.ง.ด.3/53) และงวด (เดือนที่ออก) เดียวกันทั้งหมด ไม่งั้น markFiled ไม่รู้จะยื่นงวดไหน
 */
export async function validateMarkFiledSelection(
  tenantId: string,
  systemId: string,
  certIds: string[],
): Promise<
  | { ok: true; form: 3 | 53; periodKey: string; periodLabel: string; certCount: number; totalBaseSatang: number; totalTaxSatang: number; alreadyFiled: boolean }
  | { ok: false; reason: string }
> {
  if (certIds.length === 0) return { ok: false, reason: "ยังไม่ได้เลือกรายการ" };
  const certs = await prisma.accountDocument.findMany({
    where: { tenantId, systemId, docType: "WHT_CERT", direction: "IN", id: { in: certIds } },
    include: { contact: { select: { legalType: true } } },
  });
  if (certs.length === 0) return { ok: false, reason: "ไม่พบรายการที่เลือก" };
  const forms = new Set(
    certs.map((c) => {
      const snap = (c.contactSnapshot as Record<string, unknown> | null) ?? null;
      const lt = (snap?.legalType as AccountLegalType) ?? c.contact?.legalType ?? "COMPANY";
      return lt === "PERSON" ? 3 : 53;
    }),
  );
  const periods = new Set(certs.map((c) => `${c.issueDate.getUTCFullYear()}-${String(c.issueDate.getUTCMonth() + 1).padStart(2, "0")}`));
  if (forms.size > 1) return { ok: false, reason: "เลือกรายการที่เป็นแบบ ภ.ง.ด. เดียวกันเท่านั้น (บุคคลธรรมดา/นิติบุคคล แยกยื่นกันคนละแบบ)" };
  if (periods.size > 1) return { ok: false, reason: "เลือกรายการในงวด (เดือน) เดียวกันเท่านั้น" };
  const form = [...forms][0] as 3 | 53;
  const periodKey = [...periods][0];
  const report = await pnd(tenantId, systemId, { type: form, period: periodKey });
  const existing = await prisma.accountWhtFiling.findFirst({ where: { tenantId, systemId, form, periodKey } });
  return {
    ok: true,
    form,
    periodKey,
    periodLabel: `ภ.ง.ด.${form} · ${periodKeyLabel(periodKey)}`,
    certCount: report.rows.length,
    totalBaseSatang: report.grandBase,
    totalTaxSatang: report.grandWht,
    alreadyFiled: !!existing,
  };
}
