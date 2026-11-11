// SVC D.9 ▸ ตัวอ่านฝั่งผู้เช่า (พอร์ทัลลิงก์เซ็น · LINE) — สัญญา ledger/svc-briefs/svc-brief-d.9.md §3.0 §3.1 (ชื่อภายในเลือกเอง)
//   • ไม่มีผู้กระทำ: ผู้เรียก = platform (dorm-portal / dorm-line) หลังตรวจลิงก์/ตัวตนแชทแล้ว · ทุกคำสั่งผูก tenantId ที่ผู้เรียกให้
//   • สัญญาที่ยังมีผล (live) = ACTIVE|NOTICE · endedAt ว่าง · endDate ว่างหรือ ≥ วันนี้ไทย · หน่วย DORM ของร้าน — คิวรีเดียว (เวลาตอบใกล้กันทุกกรณีล้ม · X7)
//   • บิลที่ผู้เช่าเห็น = SENT | PARTIALLY_PAID | PAID ของสัญญานั้นเท่านั้น (ไม่เห็น DRAFT/HELD/VOID)
//   • ยอดค้างสด: มีใบแจ้งหนี้ = จากบัญชี ณ ตอนเรียก (นิยามเดียวกับ D.11 outstandingMany) + ใบเพิ่มหนี้ที่ยังค้าง · ไม่มีใบ = total − paid · ไม่ติดลบ
//   • tenantDb เท่านั้น (F5.1) · ไม่คืนเบอร์/เลขบัตร · ชื่อผู้เช่าคืนเฉพาะ portalPartyName (ใช้เทียบชื่อผู้โอน/ข้อความถึงตัวผู้เช่าเอง)
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { resolveCanonical } from "@/lib/modules/party";
import { billBalances } from "./balance"; // SVC D.10 ▸ R3 ◂
import { bahtOf, docFinMany, thDateOf, thMonthOf, ymdOfDate } from "./latefee";

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** ค่าที่ไม่มีวันตรงแถวใด — ใช้วิ่งคิวรีเดียวกันเมื่อ token/บิลไม่ผ่าน (เวลาตอบใกล้กัน) */
const NONE_ID = "~";
const VISIBLE = ["SENT", "PARTIALLY_PAID", "PAID"];
const DEAD_DOC = ["VOIDED", "CANCELLED", "DRAFT"];

export type PortalLeaseRow = {
  id: string;
  tenantId: string;
  unitId: string;
  roomId: string;
  partyId: string;
  roomNumber: string;
  unitName: string;
  startDate: string;
  endDate: string | null;
  rentSatang: number;
  commonFeeSatang: number;
  depositSatang: number;
  policySnapshot: Prisma.JsonValue | null;
  moveInPhotos: Prisma.JsonValue | null;
  signatureFileId: string | null;
  coTenants: Prisma.JsonValue | null;
};
type LeaseRaw = Omit<PortalLeaseRow, "startDate" | "endDate"> & { startDate: Date; endDate: Date | null };
const leaseOf = (r: LeaseRaw): PortalLeaseRow => ({ ...r, startDate: ymdOfDate(r.startDate) ?? "", endDate: ymdOfDate(r.endDate) });

/** วันนี้ไทยในรูป YYYY-MM-DD (ผู้เรียกส่งมา) — ผิดรูป ⇒ วันที่ที่ไม่มีสัญญาใดผ่าน */
const dayOk = (ymd: string) => (/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : "9999-12-31");

/** สัญญา live ของร้าน (คิวรีเดียว · ไม่ผ่าน = null) — id/ร้านผิดรูปยังวิ่งคิวรีเดิมด้วยค่าที่ไม่ตรงแถวใด */
export async function portalLiveLease(tenantId: string, leaseId: string, today: string): Promise<PortalLeaseRow | null> {
  const tid = isStr(tenantId) && tenantId.length <= 100 ? tenantId : NONE_ID;
  const lid = isStr(leaseId) && ID_RE.test(leaseId) ? leaseId : NONE_ID;
  const rows = await tenantDb({ tenantId: tid }).$queryRaw<LeaseRaw[]>`
    SELECT l."id", l."tenantId", l."unitId", l."roomId", l."partyId", r."number" AS "roomNumber", u."name" AS "unitName",
           l."startDate", l."endDate", l."rentSatang", l."commonFeeSatang", l."depositSatang", l."policySnapshot", l."moveInPhotos", l."signatureFileId", l."coTenants"
    FROM "DormLease" l
    JOIN "BusinessUnit" u ON u."id" = l."unitId" AND u."tenantId" = l."tenantId" AND u."type"::text = 'DORM'
    JOIN "HotelRoom" r ON r."id" = l."roomId" AND r."tenantId" = l."tenantId"
    WHERE l."tenantId" = ${tid} AND l."id" = ${lid} AND l."status" IN ('ACTIVE', 'NOTICE') AND l."endedAt" IS NULL
      AND (l."endDate" IS NULL OR l."endDate" >= ${dayOk(today)}::date)
    LIMIT 1`;
  return rows[0] ? leaseOf(rows[0]) : null;
}

/** W13 ▸ Party ตัวจริงหลังรวม (canonical) ของร้านนี้ — ไม่พบ ⇒ id เดิม */
export async function portalCanonicalParty(tenantId: string, partyId: string): Promise<string> {
  if (!isStr(tenantId) || !isStr(partyId)) return partyId;
  try {
    return (await resolveCanonical(tenantId, partyId)) || partyId;
  } catch {
    return partyId;
  }
}

/**
 * สัญญา live ทั้งหมดของ Party (ร้านนี้ · เรียงห้อง) — ใช้กับ postback/รูปในแชท (Party มาจากแถวผู้ติดต่อของ webhook)
 *   W13: เทียบแบบ canonical — สัญญาของ Party ใดก็ได้ในครอบครัวที่รวมแล้ว (ปลายทางเดียวกัน) นับเป็นของคนเดียวกัน
 */
export async function portalLiveLeasesOfParty(tenantId: string, partyId: string, today: string): Promise<PortalLeaseRow[]> {
  if (!isStr(tenantId) || !isStr(partyId) || !ID_RE.test(partyId)) return [];
  const root = await portalCanonicalParty(tenantId, partyId);
  const rows = await tenantDb({ tenantId }).$queryRaw<LeaseRaw[]>`
    WITH RECURSIVE fam AS (
      SELECT p."id" FROM "Party" p WHERE p."tenantId" = ${tenantId} AND p."id" = ${root}
      UNION
      SELECT c."id" FROM "Party" c JOIN fam ON c."mergedIntoId" = fam."id" WHERE c."tenantId" = ${tenantId}
    )
    SELECT l."id", l."tenantId", l."unitId", l."roomId", l."partyId", r."number" AS "roomNumber", u."name" AS "unitName",
           l."startDate", l."endDate", l."rentSatang", l."commonFeeSatang", l."depositSatang", l."policySnapshot", l."moveInPhotos", l."signatureFileId", l."coTenants"
    FROM "DormLease" l
    JOIN "BusinessUnit" u ON u."id" = l."unitId" AND u."tenantId" = l."tenantId" AND u."type"::text = 'DORM'
    JOIN "HotelRoom" r ON r."id" = l."roomId" AND r."tenantId" = l."tenantId"
    WHERE l."tenantId" = ${tenantId} AND l."partyId" IN (SELECT "id" FROM fam) AND l."status" IN ('ACTIVE', 'NOTICE') AND l."endedAt" IS NULL
      AND (l."endDate" IS NULL OR l."endDate" >= ${dayOk(today)}::date)
    ORDER BY r."number" ASC, l."id" ASC
    LIMIT 20`;
  return rows.map(leaseOf);
}

/** สัญญาของหน่วย (สถานะใดก็ได้) + live ไหม — จอพนักงานออกรหัสผูก (ไม่พบ ⇒ null) */
export async function portalLeaseOfUnit(tenantId: string, unitId: string, leaseId: string, today: string): Promise<{ id: string; live: boolean } | null> {
  if (!isStr(tenantId) || !isStr(unitId) || !isStr(leaseId) || !ID_RE.test(leaseId)) return null;
  const l = await tenantDb({ tenantId, unitId }).dormLease.findFirst({ where: { id: leaseId }, select: { id: true } });
  if (!l) return null;
  const live = await portalLiveLease(tenantId, leaseId, today);
  return { id: l.id, live: !!live && live.unitId === unitId };
}

/** บิลนี้เป็นบิลที่ผู้เช่าเห็นของสัญญานี้ไหม (คิวรีเดียว · ค่าผิดรูปยังวิ่งด้วยค่าที่ไม่ตรงแถวใด) */
export async function portalBillVisible(tenantId: string, leaseId: string, billId: string): Promise<boolean> {
  const tid = isStr(tenantId) && tenantId.length <= 100 ? tenantId : NONE_ID;
  const lid = isStr(leaseId) && ID_RE.test(leaseId) ? leaseId : NONE_ID;
  const bid = isStr(billId) && ID_RE.test(billId) ? billId : NONE_ID;
  const rows = await tenantDb({ tenantId: tid }).$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "DormBill" WHERE "tenantId" = ${tid} AND "leaseId" = ${lid} AND "id" = ${bid} AND "status" IN ('SENT', 'PARTIALLY_PAID', 'PAID') LIMIT 1`;
  return rows.length === 1;
}

export type PortalSlipStatus = "PENDING" | "AUTO_APPROVED" | "NEEDS_REVIEW" | "APPROVED" | "REJECTED";
export type PortalBillRow = {
  id: string;
  leaseId: string;
  unitId: string;
  periodKey: string;
  periodLabel: string;
  dueDate: string;
  dueLabel: string;
  status: string;
  docId: string | null;
  docNo: string | null;
  lines: { code: string; labelTh: string; detail: string | null; amountSatang: number }[];
  adjustments: { kind: "CREDIT" | "DEBIT"; docNo: string | null; amountSatang: number }[];
  totalSatang: number;
  paidSatang: number;
  outstandingSatang: number;
  paidAt: string | null;
  slip: null | { status: PortalSlipStatus; at: string };
};

const SLIP_STATUSES = new Set(["PENDING", "AUTO_APPROVED", "NEEDS_REVIEW", "APPROVED", "REJECTED"]);
const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");

function linesOf(v: Prisma.JsonValue): PortalBillRow["lines"] {
  if (!Array.isArray(v)) return [];
  const out: PortalBillRow["lines"] = [];
  for (const x of v) {
    if (!isRec(x) || !isStr(x.code) || typeof x.labelTh !== "string" || typeof x.amountSatang !== "number") continue;
    const meta = isRec(x.meta) ? x.meta : {};
    const detail = (x.code === "ELEC" || x.code === "WATER") && typeof meta.units === "number" ? `${fmtInt(meta.units)} หน่วย` : null;
    out.push({ code: x.code, labelTh: x.labelTh, detail, amountSatang: Math.trunc(x.amountSatang) });
  }
  return out;
}

type BillRaw = {
  id: string;
  leaseId: string;
  unitId: string;
  periodKey: string;
  status: string;
  dueDate: Date | null;
  accountDocumentId: string | null;
  totalSatang: number;
  paidSatang: number;
  paidAt: Date | null;
  lines: Prisma.JsonValue;
};

/**
 * บิลที่ผู้เช่าเห็นของสัญญา (งวดใหม่ → เก่า) พร้อมยอดค้างสด · ใบลด/เพิ่มหนี้ · สลิปล่าสุด — อ่านล้วน
 *   only = จำกัดเฉพาะบิลเหล่านี้ (ต้องเป็นของสัญญานี้อยู่ดี)
 */
export async function portalLeaseBills(tenantId: string, lease: { id: string; unitId: string }, opts?: { only?: string[] }): Promise<PortalBillRow[]> {
  if (!isStr(tenantId) || !isStr(lease?.id) || !isStr(lease?.unitId)) return [];
  const db = tenantDb({ tenantId, unitId: lease.unitId });
  const bills: BillRaw[] = await db.dormBill.findMany({
    where: { leaseId: lease.id, status: { in: VISIBLE }, ...(opts?.only ? { id: { in: opts.only.filter((x) => ID_RE.test(x)) } } : {}) },
    orderBy: [{ periodKey: "desc" }, { id: "asc" }],
    take: 60,
    select: { id: true, leaseId: true, unitId: true, periodKey: true, status: true, dueDate: true, accountDocumentId: true, totalSatang: true, paidSatang: true, paidAt: true, lines: true },
  });
  if (!bills.length) return [];
  const docIds = bills.map((b) => b.accountDocumentId).filter((x): x is string => !!x);
  const bal = await billBalances(tenantId, bills.map((b) => b.id)); // SVC D.10 ▸ R3: ยอดนิยามเดียว · outstandingSatang = dueSatang (รวมยอดยกมา) ◂
  const fin = await docFinMany(tenantId, bills.filter((b) => !!b.accountDocumentId).map((b) => ({ docId: b.accountDocumentId as string, billId: b.id })));
  const raw = tenantDb({ tenantId });
  // เลขใบแจ้งหนี้ + ใบลด/เพิ่มหนี้ที่มีผล (ทุกสมุด · คิวรีเดียว) + รับชำระของใบเพิ่มหนี้
  const docs = docIds.length
    ? await raw.$queryRaw<{ id: string; docNo: string | null; docType: string; sourceDocId: string | null; grandTotal: number; status: string }[]>`
        SELECT "id", "docNo", "docType"::text AS "docType", "sourceDocId", "grandTotal", "status"::text AS "status" FROM "AccountDocument"
        WHERE "tenantId" = ${tenantId} AND ("id" = ANY(${docIds}::text[]) OR ("sourceDocId" = ANY(${docIds}::text[]) AND "docType"::text IN ('CREDIT_NOTE', 'DEBIT_NOTE')))
        ORDER BY "createdAt" ASC, "id" ASC`
    : [];
  const debitIds = docs.filter((d) => d.docType === "DEBIT_NOTE" && !DEAD_DOC.includes(d.status)).map((d) => d.id);
  const debitPays = debitIds.length
    ? await raw.$queryRaw<{ documentId: string; total: number }[]>`
        SELECT "documentId", COALESCE(SUM("amount" + COALESCE("whtAmountSatang", 0)), 0)::int AS "total" FROM "AccountDocumentPayment"
        WHERE "tenantId" = ${tenantId} AND "documentId" = ANY(${debitIds}::text[]) AND "voidedAt" IS NULL GROUP BY "documentId"`
    : [];
  const debitPaid = new Map(debitPays.map((p) => [p.documentId, Number(p.total)]));
  const slips = await db.paymentSlip.findMany({
    where: { refType: "DORM_BILL", refId: { in: bills.map((b) => b.id) } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { refId: true, status: true, createdAt: true },
  });
  return bills.map((b) => {
    const docId = b.accountDocumentId;
    const head = docId ? docs.find((d) => d.id === docId) : undefined;
    const adjDocs = docId ? docs.filter((d) => d.sourceDocId === docId && (d.docType === "CREDIT_NOTE" || d.docType === "DEBIT_NOTE") && !DEAD_DOC.includes(d.status)) : [];
    const outstanding = bal.get(b.id)?.dueSatang ?? 0;
    const f = docId ? fin.get(docId) : undefined;
    const paid = docId
      ? (f && !DEAD_DOC.includes(f.status) ? f.tieOff : 0) + adjDocs.filter((d) => d.docType === "DEBIT_NOTE").reduce((s, d) => s + (debitPaid.get(d.id) ?? 0), 0)
      : Math.max(0, b.paidSatang);
    const s = slips.find((x) => x.refId === b.id);
    const due = ymdOfDate(b.dueDate) ?? "";
    const lastPay = f?.pays.length ? f.pays[f.pays.length - 1]!.ymd : ymdOfDate(b.paidAt);
    return {
      id: b.id,
      leaseId: b.leaseId,
      unitId: b.unitId,
      periodKey: b.periodKey,
      periodLabel: thMonthOf(b.periodKey),
      dueDate: due,
      dueLabel: due ? thDateOf(due) : "",
      status: b.status,
      docId,
      docNo: head?.docNo ?? null,
      lines: [...linesOf(b.lines), ...(bal.get(b.id)?.carriedIn ?? []).map((c) => ({ code: "CARRIED_IN", labelTh: "ยอดยกมา", detail: thMonthOf(c.periodKey), amountSatang: c.satang }))], // SVC D.10 ▸ อธิบายยอดที่สูงกว่าบิลงวดนี้ ◂
      adjustments: adjDocs.map((d) => ({ kind: d.docType === "CREDIT_NOTE" ? ("CREDIT" as const) : ("DEBIT" as const), docNo: d.docNo, amountSatang: Number(d.grandTotal) })),
      totalSatang: b.totalSatang,
      paidSatang: paid,
      outstandingSatang: outstanding,
      paidAt: paid > 0 ? (lastPay ?? null) : null,
      slip: s && SLIP_STATUSES.has(s.status) ? { status: s.status as PortalSlipStatus, at: s.createdAt.toISOString() } : null,
    };
  });
}

/** บิลสำหรับส่งข้อความ (อ่านสดทุกครั้ง · ร้านนี้เท่านั้น) — ไม่พบ ⇒ null */
export async function portalBillForSend(tenantId: string, billId: string): Promise<{ id: string; leaseId: string; unitId: string; status: string; hasDoc: boolean } | null> {
  if (!isStr(tenantId) || !isStr(billId) || !ID_RE.test(billId)) return null;
  const rows = await tenantDb({ tenantId }).$queryRaw<{ id: string; leaseId: string; unitId: string; status: string; accountDocumentId: string | null }[]>`
    SELECT "id", "leaseId", "unitId", "status", "accountDocumentId" FROM "DormBill" WHERE "tenantId" = ${tenantId} AND "id" = ${billId} LIMIT 1`;
  const r = rows[0];
  return r ? { id: r.id, leaseId: r.leaseId, unitId: r.unitId, status: r.status, hasDoc: !!r.accountDocumentId } : null;
}

/** ชื่อ Party (ข้อความถึงตัวผู้เช่าเอง/เทียบชื่อผู้โอน — ห้ามลงพอร์ทัล/log) */
export async function portalPartyName(tenantId: string, partyId: string): Promise<string | null> {
  if (!isStr(tenantId) || !isStr(partyId)) return null;
  const p = await tenantDb({ tenantId }).party.findFirst({ where: { id: partyId }, select: { name: true } });
  return p?.name ?? null;
}

/** ไฟล์ของร้าน (ชนิด + ที่อยู่ส่วนตัว) */
export async function portalFileAssets(tenantId: string, ids: string[]): Promise<Map<string, { contentType: string; path: string }>> {
  const want = [...new Set(ids.filter((x) => isStr(x) && ID_RE.test(x)))];
  if (!isStr(tenantId) || !want.length) return new Map();
  const rows = await tenantDb({ tenantId }).fileAsset.findMany({ where: { id: { in: want } }, select: { id: true, contentType: true, path: true } });
  return new Map(rows.map((r) => [r.id, { contentType: r.contentType, path: r.path }]));
}

/** หน่วยที่ยังใช้งานของร้าน (ตรวจ OA ใช้ร่วม) */
export async function portalActiveUnitIds(tenantId: string): Promise<string[]> {
  if (!isStr(tenantId)) return [];
  const rows = await tenantDb({ tenantId }).businessUnit.findMany({ where: { status: "ACTIVE" }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 500 });
  return rows.map((r) => r.id);
}

/**
 * ด่านพนักงานของหอ (Membership สด · หน่วย DORM ACTIVE ของร้าน · สิทธิ์ action) — ไม่ผ่าน ⇒ null
 *   ใช้กับจอออกรหัสผูก (dorm.lease.manage) และตั้งเมนู LINE (dorm.settings.edit)
 */
export async function dormStaffGate(ctx: unknown, unitId: unknown, action: string): Promise<{ tenantId: string; unitId: string; unitName: string } | null> {
  if (!isRec(ctx) || !isStr(ctx.tenantId) || !isStr(ctx.actorUserId) || !isStr(unitId)) return null;
  const tenantId = ctx.tenantId;
  const db = tenantDb({ tenantId });
  const unit = await db.businessUnit.findFirst({ where: { id: unitId, type: "DORM", status: "ACTIVE" }, select: { id: true, name: true } });
  if (!unit) return null;
  const mem = await db.membership.findFirst({ where: { tenantId, userId: ctx.actorUserId, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } });
  if (!mem) return null;
  const m: MembershipCtx = {
    role: mem.role,
    unitAccess: Array.isArray(mem.unitAccess) ? mem.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: isRec(mem.permissions) ? mem.permissions : {},
  };
  return evaluate(m, { module: "dorm", action, unitId: unit.id }) ? { tenantId, unitId: unit.id, unitName: unit.name } : null;
}

/** ป้ายงวด "พ.ย. 2569" · วัน "5 พ.ย. 2569" · เงิน "฿5,486.00" (ตัวเดียวกับ D.11) */
export const portalPeriodLabel = (periodKey: string): string => thMonthOf(periodKey);
export const portalDateLabel = (ymd: string): string => thDateOf(ymd);
export const portalBaht = (satang: number): string => bahtOf(satang);

/**
 * SVC D.9 W2 ▸ สถานะสดของบิลสำหรับ precheck ของ notifyCustomer (หลังอ้างสิทธิ์ · ก่อนส่ง) — **คิวรีเดียว**:
 *   สถานะบิล · มีใบไหม · สัญญา live (นิยาม §3.0) · ยอดค้างสด (ใบแจ้งหนี้ − รับชำระที่ไม่ยกเลิก (+WHT) − ใบลดหนี้ที่มีผล + ใบเพิ่มหนี้ที่ยังค้าง ·
 *   ไม่มีใบ = total − paid) — นิยามเดียวกับ portalLeaseBills · ไม่พบ ⇒ null
 */
export async function portalBillLiveState(
  tenantId: string,
  billId: string,
  today: string,
): Promise<{ status: string; hasDoc: boolean; leaseId: string; unitId: string; leaseLive: boolean; outstandingSatang: number } | null> {
  if (!isStr(tenantId) || !isStr(billId) || !ID_RE.test(billId)) return null;
  const rows = await tenantDb({ tenantId }).$queryRaw<{ status: string; doc: string | null; leaseId: string; unitId: string; live: boolean; outstanding: number }[]>`
    SELECT b."status", b."accountDocumentId" AS "doc", b."leaseId", b."unitId",
      EXISTS (
        SELECT 1 FROM "DormLease" l JOIN "BusinessUnit" u ON u."id" = l."unitId" AND u."tenantId" = l."tenantId" AND u."type"::text = 'DORM'
        WHERE l."tenantId" = b."tenantId" AND l."id" = b."leaseId" AND l."unitId" = b."unitId" AND l."status" IN ('ACTIVE', 'NOTICE') AND l."endedAt" IS NULL
          AND (l."endDate" IS NULL OR l."endDate" >= ${dayOk(today)}::date)
      ) AS "live",
      (CASE WHEN b."accountDocumentId" IS NULL THEN GREATEST(0, b."totalSatang" - b."paidSatang")
       ELSE GREATEST(0, COALESCE((
         SELECT CASE WHEN d."status"::text IN ('VOIDED', 'CANCELLED', 'DRAFT') THEN 0 ELSE GREATEST(0,
           d."grandTotal"
           - COALESCE((SELECT SUM(p."amount" + COALESCE(p."whtAmountSatang", 0)) FROM "AccountDocumentPayment" p WHERE p."tenantId" = d."tenantId" AND p."documentId" = d."id" AND p."voidedAt" IS NULL), 0)
           - COALESCE((SELECT SUM(c."grandTotal") FROM "AccountDocument" c WHERE c."tenantId" = d."tenantId" AND c."sourceDocId" = d."id" AND c."docType"::text = 'CREDIT_NOTE' AND c."status"::text NOT IN ('VOIDED', 'CANCELLED', 'DRAFT')), 0))
           + COALESCE((SELECT SUM(GREATEST(0, x."grandTotal" - COALESCE((SELECT SUM(q."amount" + COALESCE(q."whtAmountSatang", 0)) FROM "AccountDocumentPayment" q WHERE q."tenantId" = x."tenantId" AND q."documentId" = x."id" AND q."voidedAt" IS NULL), 0)))
               FROM "AccountDocument" x WHERE x."tenantId" = d."tenantId" AND x."sourceDocId" = d."id" AND x."docType"::text = 'DEBIT_NOTE' AND x."status"::text NOT IN ('VOIDED', 'CANCELLED', 'DRAFT')), 0)
         END
         FROM "AccountDocument" d WHERE d."tenantId" = b."tenantId" AND d."id" = b."accountDocumentId"
       ), 0)) END)::int AS "outstanding"
    FROM "DormBill" b WHERE b."tenantId" = ${tenantId} AND b."id" = ${billId} LIMIT 1`;
  const r = rows[0];
  const due = r ? (await billBalances(tenantId, [billId])).get(billId)?.dueSatang : undefined; // SVC D.10 ▸ R3: นิยามเดียว (รวมยอดยกมา) ◂
  return r ? { status: r.status, hasDoc: !!r.doc, leaseId: r.leaseId, unitId: r.unitId, leaseLive: r.live === true, outstandingSatang: due ?? Number(r.outstanding) } : null;
}

/** W7 ▸ มีสลิปที่ใช้คีย์กันส่งซ้ำนี้แล้วไหม (ส่งซ้ำของคนเดิม = ให้ submitSlip คืนผลเดิม) — รูปนิพจน์เดียวกับดัชนี unique ของ slip-verify */
export async function portalSlipKeyExists(tenantId: string, idempotencyKey: string): Promise<boolean> {
  if (!isStr(tenantId) || !isStr(idempotencyKey)) return false;
  const hit = await tenantDb({ tenantId }).$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "PaymentSlip" WHERE "tenantId" = ${tenantId} AND ("checks"->>'idempotencyKey') = ${idempotencyKey} LIMIT 1`;
  return hit.length > 0;
}
