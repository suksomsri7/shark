import { prisma } from "@/lib/core/db";
import type { AccountWhtIncomeType, AccountLegalType, Prisma } from "@prisma/client";

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
    orderBy: { paidAt: "asc" },
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
  incomeType: AccountWhtIncomeType | null;
  incomeLabel: string;
  base: number;
  whtRateBp: number | null;
  whtAmount: number;
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
  const certs = await prisma.accountDocument.findMany({
    where: {
      tenantId,
      systemId,
      docType: "WHT_CERT",
      status: "ISSUED",
      issueDate: { gte, lt },
      contact: { legalType },
    },
    include: { contact: { select: { name: true, taxId: true } } },
    orderBy: { issueDate: "asc" },
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
      incomeType: c.whtIncomeType,
      incomeLabel: c.whtIncomeType ? WHT_INCOME_LABEL[c.whtIncomeType] : "—",
      base,
      whtRateBp: c.whtRateBp,
      whtAmount: wht,
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
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const bahtStr = (satang: number) => (satang / 100).toFixed(2);

export async function pndCsv(
  tenantId: string,
  systemId: string,
  input: { type: 3 | 53; period: string },
): Promise<string> {
  const { rows, grandBase, grandWht } = await pnd(tenantId, systemId, input);
  const header = [
    "ลำดับ",
    "เลขที่ 50 ทวิ",
    "วันที่จ่าย",
    "ชื่อผู้รับเงิน",
    "เลขประจำตัวผู้เสียภาษี",
    "ประเภทเงินได้",
    "จำนวนเงินได้",
    "อัตรา (%)",
    "ภาษีที่หัก",
  ];
  const lines = rows.map((r) =>
    [
      r.seq,
      r.certNo ?? "",
      r.paidAt.toISOString().slice(0, 10),
      r.recipientName,
      r.recipientTaxId ?? "",
      r.incomeLabel,
      bahtStr(r.base),
      r.whtRateBp != null ? (r.whtRateBp / 100).toFixed(2) : "",
      bahtStr(r.whtAmount),
    ]
      .map(csvCell)
      .join(","),
  );
  const totalLine = ["", "", "", "", "", "รวม", bahtStr(grandBase), "", bahtStr(grandWht)]
    .map(csvCell)
    .join(",");
  return "﻿" + [header.map(csvCell).join(","), ...lines, totalLine].join("\n");
}
