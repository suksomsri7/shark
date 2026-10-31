// SVC D.10 ▸ ยอดค้างนิยามเดียวของบิลหอ (A11) — สัญญา ledger/svc-briefs/svc-brief-d.10.md §3.1
//   ทุกจอ/ทุกทางที่ต้องการ "ยอดค้าง" ใช้ฟังก์ชันนี้: D.11 outstandingMany · พอร์ทัล/Flex/ยอดคาดหวังสลิป D.9 · รับเงิน D.10
//   • open ต่อเอกสาร (จากบัญชี ณ ตอนเรียก): grandTotal − รับชำระที่ไม่ยกเลิก (+WHT) − ใบลดหนี้ที่มีผล · ไม่ติดลบ · ร่าง/ยกเลิก = 0
//   • ยกยอด = ไม่ย้ายลูกหนี้ (ค้างยังอยู่ในเอกสารเดิม) · carriedSatang เป็นป้าย "ไปจ่ายพร้อมบิลหน้า" ⇒ ปรากฏใน carriedIn ของบิลที่ผู้เช่าเห็นถัดไปของสัญญา
//   • ร้านอื่น/ไม่พบ ⇒ ไม่อยู่ใน Map (ไม่ throw) · คิวรีชุดเดียวต่อการเรียก (ไม่ N+1) · เงินสตางค์จำนวนเต็ม
import { tenantDb } from "@/lib/core/db";
import { dormBillDocsMany, type DormBillDocs } from "@/lib/modules/account";

export type DormBillBalance = {
  billId: string;
  leaseId: string;
  unitId: string;
  periodKey: string;
  status: string;
  invoice: { docId: string; docNo: string | null; openSatang: number } | null;
  debitNotes: { docId: string; docNo: string | null; openSatang: number }[];
  ownOutstandingSatang: number;
  carriedOutSatang: number;
  carriedIn: { billId: string; periodKey: string; satang: number }[];
  dueSatang: number;
};

const VISIBLE = ["SENT", "PARTIALLY_PAID", "PAID"];
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
type BillRow = { id: string; leaseId: string; unitId: string; periodKey: string; status: string; accountDocumentId: string | null; totalSatang: number; paidSatang: number; carriedSatang: number };

const ownOf = (b: BillRow, d: DormBillDocs | undefined): number =>
  !b.accountDocumentId ? Math.max(0, b.totalSatang - b.paidSatang) : d ? d.invoice.openSatang + d.debitNotes.reduce((a, x) => a + x.openSatang, 0) : 0;

/** ยอดรับแล้วรวมของบิล (ใบแจ้งหนี้ + ใบเพิ่มหนี้ · ไม่มีใบ = paidSatang เดิม) — ใช้ตั้ง DormBill.paidSatang และ KPI จอ 06 */
export async function billPaidSatang(tenantId: string, bills: { id: string; accountDocumentId: string | null; paidSatang: number }[]): Promise<Map<string, number>> {
  const docs = await dormBillDocsMany(tenantId, bills.map((b) => b.accountDocumentId).filter((x): x is string => !!x));
  const out = new Map<string, number>();
  for (const b of bills) {
    const d = b.accountDocumentId ? docs.get(b.accountDocumentId) : undefined;
    out.set(b.id, !b.accountDocumentId ? b.paidSatang : d ? d.invoice.paidSatang + d.debitNotes.reduce((a, x) => a + x.paidSatang, 0) : 0);
  }
  return out;
}

export async function billBalances(tenantId: string, billIds: string[]): Promise<Map<string, DormBillBalance>> {
  const out = new Map<string, DormBillBalance>();
  const ids = [...new Set((billIds ?? []).filter((x) => typeof x === "string" && ID_RE.test(x)))];
  if (!tenantId || !ids.length) return out;
  const db = tenantDb({ tenantId });
  const wanted = await db.$queryRaw<BillRow[]>`
    SELECT "id", "leaseId", "unitId", "periodKey", "status", "accountDocumentId", "totalSatang", "paidSatang", "carriedSatang"
    FROM "DormBill" WHERE "tenantId" = ${tenantId} AND "id" = ANY(${ids}::text[])`;
  if (!wanted.length) return out;
  const leases = [...new Set(wanted.map((b) => b.leaseId))];
  // บิลที่เห็นทุกใบของสัญญาเหล่านี้ที่ตั้งยกยอด (+ บิลที่ขอ) — หา "บิลถัดไป" ต้องรู้งวดของบิลที่เห็นทั้งหมด
  const fam = await db.$queryRaw<BillRow[]>`
    SELECT "id", "leaseId", "unitId", "periodKey", "status", "accountDocumentId", "totalSatang", "paidSatang", "carriedSatang"
    FROM "DormBill" WHERE "tenantId" = ${tenantId} AND "leaseId" = ANY(${leases}::text[]) AND "status" = ANY(${VISIBLE}::text[])
    ORDER BY "periodKey" ASC, "id" ASC`;
  const carriers = fam.filter((b) => b.carriedSatang > 0);
  const docIds = [...wanted, ...carriers].map((b) => b.accountDocumentId).filter((x): x is string => !!x);
  const docs = await dormBillDocsMany(tenantId, docIds);
  const carriedOutOf = (b: BillRow) => Math.min(Math.max(0, b.carriedSatang), ownOf(b, b.accountDocumentId ? docs.get(b.accountDocumentId) : undefined));
  const incoming = new Map<string, DormBillBalance["carriedIn"]>();
  for (const c of carriers) {
    const satang = carriedOutOf(c);
    if (satang <= 0) continue;
    const next = fam.find((b) => b.leaseId === c.leaseId && b.periodKey > c.periodKey);
    if (!next) continue;
    const list = incoming.get(next.id) ?? [];
    list.push({ billId: c.id, periodKey: c.periodKey, satang });
    incoming.set(next.id, list);
  }
  for (const b of wanted) {
    const d = b.accountDocumentId ? docs.get(b.accountDocumentId) : undefined;
    const own = ownOf(b, d);
    const carriedIn = VISIBLE.includes(b.status) ? (incoming.get(b.id) ?? []) : [];
    out.set(b.id, {
      billId: b.id,
      leaseId: b.leaseId,
      unitId: b.unitId,
      periodKey: b.periodKey,
      status: b.status,
      invoice: d ? { docId: d.invoice.docId, docNo: d.invoice.docNo, openSatang: d.invoice.openSatang } : null,
      debitNotes: (d?.debitNotes ?? []).map((n) => ({ docId: n.docId, docNo: n.docNo, openSatang: n.openSatang })),
      ownOutstandingSatang: own,
      carriedOutSatang: carriedOutOf(b),
      carriedIn,
      dueSatang: own + carriedIn.reduce((a, c) => a + c.satang, 0),
    });
  }
  return out;
}
