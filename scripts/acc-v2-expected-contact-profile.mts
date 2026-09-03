// เฉลย "โปรไฟล์ผู้ติดต่อ 360° + รวมผู้ติดต่อซ้ำ" (WO 3.4) — เขียนคีย์ `contactProfile` + `mergeDuplicate`
// ต่อท้าย scripts/acc-v2-expected.json
//
// รัน:  QC_ENV_FILE=.env.qc pnpm tsx scripts/acc-v2-expected-contact-profile.mts
//
// 🔴 กติกาเดียวกับ acc-v2-expected-contacts.mts: **ห้าม import
//    src/lib/modules/account/contact-profile.ts / contact-merge.ts / reports.ts** — ตัวเลขทุกตัวคำนวณใหม่
//    ด้วย SQL ดิบคนละสำนวน (bucket อายุหนี้คิดด้วย CASE ... date_part ใน SQL · โค้ดจริงคิดใน JS จาก findMany)
//    ⇒ ข้อสอบเทียบ "สองการคำนวณที่เขียนแยกกัน" ไม่ใช่เทียบโค้ดกับตัวเอง
//
// ⚠️ seed-acc-v2-qc.mts เขียนทับ acc-v2-expected.json ทั้งไฟล์ ⇒ seed ใหม่แล้วต้องรันไฟล์นี้ซ้ำ

import { readFileSync, writeFileSync } from "node:fs";

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string; today: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();
console.log(`🗄️  DB QC: ${host}`);

const { prisma } = await import("@/lib/core/db");

const E = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as Record<string, unknown> & {
  tenantId: string;
  systemId: string;
  fixtures: Record<string, unknown>;
};
const T = E.tenantId;
const S = E.systemId;
const n = (x: unknown) => Number(x ?? 0);

// "วันนี้" ของข้อสอบ (เวลาไทยเที่ยงวัน) — ใช้ตัวเดียวกับที่ qc ส่งเป็น asOf ให้ contactProfile
const NOW = new Date(`${QC.today}T12:00:00+07:00`);
const YEAR = Number(QC.today.slice(0, 4));
const YEAR_START = new Date(`${YEAR}-01-01T00:00:00+07:00`);

// ─────────────── 1) โปรไฟล์ของ C00019 "ปิยธิดา อินสุ่ม" (fixture หลักของดีไซน์ g6/g19) ───────────────
const target = await prisma.$queryRaw<Array<{ id: string; code: string | null; name: string; kind: string }>>`
  SELECT "id", "code", "name", "kind" FROM "AccountContact"
   WHERE "tenantId" = ${T} AND "systemId" = ${S} AND "name" = 'ปิยธิดา อินสุ่ม' LIMIT 1`;
if (target.length === 0) throw new Error("ไม่พบผู้ติดต่อ fixture 'ปิยธิดา อินสุ่ม' — seed ก่อน");
const C = target[0]!;

// อายุหนี้ 5 ช่วง (สูตร: วันเกินกำหนด = วันนี้ − (dueDate ?? issueDate) · ≤0 = ยังไม่ครบกำหนด)
const agingRows = await prisma.$queryRaw<
  Array<{ b0: bigint; b1: bigint; b2: bigint; b3: bigint; b4: bigint; total: bigint; docs: bigint; overdue: bigint }>
>`
  WITH open AS (
    SELECT ("grandTotal" - "paidTotal") AS remain,
           FLOOR(EXTRACT(EPOCH FROM (${NOW}::timestamp - COALESCE("dueDate", "issueDate"))) / 86400) AS d
      FROM "AccountDocument"
     WHERE "tenantId" = ${T} AND "systemId" = ${S} AND "contactId" = ${C.id}
       AND "direction" = 'OUT' AND "status" IN ('AWAITING_PAYMENT','PARTIAL') AND "voidedAt" IS NULL
       AND ("grandTotal" - "paidTotal") > 0
  )
  SELECT
    COALESCE(SUM(remain) FILTER (WHERE d <= 0), 0)::bigint AS b0,
    COALESCE(SUM(remain) FILTER (WHERE d > 0  AND d <= 30), 0)::bigint AS b1,
    COALESCE(SUM(remain) FILTER (WHERE d > 30 AND d <= 60), 0)::bigint AS b2,
    COALESCE(SUM(remain) FILTER (WHERE d > 60 AND d <= 90), 0)::bigint AS b3,
    COALESCE(SUM(remain) FILTER (WHERE d > 90), 0)::bigint AS b4,
    COALESCE(SUM(remain), 0)::bigint AS total,
    COUNT(*)::bigint AS docs,
    COUNT(*) FILTER (WHERE d > 0)::bigint AS overdue
  FROM open`;
const a = agingRows[0]!;

// ── ชุดที่ 2: bucket ตาม "วันนี้จริงของเครื่อง" ──────────────────────────────────────────────
// ทำไมต้องมี 2 ชุด: ข้อสอบ (qc-acc-v2-contact-profile) ส่ง asOf = QC.today (วันที่ตรึงของดีไซน์ 2026-09-30)
// แต่ **หน้าเว็บจริงใช้นาฬิกาเครื่อง** ⇒ ภาพหน้าจอจะตกช่วงอายุหนี้คนละช่องกันถ้าเทียบกับชุดตรึง
// ⇒ `agingNow` = เฉลยสำหรับ visual-acc-v2 เท่านั้น (สร้างใหม่ทุกครั้งที่ seed ⇒ ไม่เน่าข้ามวัน)
const agingNowRows = await prisma.$queryRaw<Array<{ b0: bigint; b1: bigint; b2: bigint; b3: bigint; b4: bigint }>>`
  WITH open AS (
    SELECT ("grandTotal" - "paidTotal") AS remain,
           FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE("dueDate", "issueDate"))) / 86400) AS d
      FROM "AccountDocument"
     WHERE "tenantId" = ${T} AND "systemId" = ${S} AND "contactId" = ${C.id}
       AND "direction" = 'OUT' AND "status" IN ('AWAITING_PAYMENT','PARTIAL') AND "voidedAt" IS NULL
       AND ("grandTotal" - "paidTotal") > 0
  )
  SELECT
    COALESCE(SUM(remain) FILTER (WHERE d <= 0), 0)::bigint AS b0,
    COALESCE(SUM(remain) FILTER (WHERE d > 0  AND d <= 30), 0)::bigint AS b1,
    COALESCE(SUM(remain) FILTER (WHERE d > 30 AND d <= 60), 0)::bigint AS b2,
    COALESCE(SUM(remain) FILTER (WHERE d > 60 AND d <= 90), 0)::bigint AS b3,
    COALESCE(SUM(remain) FILTER (WHERE d > 90), 0)::bigint AS b4
  FROM open`;
const an = agingNowRows[0]!;

// เงินที่ชำระจริง "ปีนี้" (ปีปฏิทินไทย) + จำนวนใบที่มีเงินเข้า
const paidRows = await prisma.$queryRaw<Array<{ amount: bigint; docs: bigint }>>`
  SELECT COALESCE(SUM(p."amount"), 0)::bigint AS amount, COUNT(DISTINCT p."documentId")::bigint AS docs
    FROM "AccountDocumentPayment" p
    JOIN "AccountDocument" d ON d."id" = p."documentId"
   WHERE p."voidedAt" IS NULL AND p."paidAt" >= ${YEAR_START}
     AND d."tenantId" = ${T} AND d."systemId" = ${S} AND d."contactId" = ${C.id}
     AND d."direction" = 'OUT' AND d."voidedAt" IS NULL`;
const paid = paidRows[0]!;

// จำนวนเอกสาร (แท็บ "เอกสาร n") + ไฟล์แนบ (แท็บ "ไฟล์แนบ n")
const cntRows = await prisma.$queryRaw<Array<{ docs: bigint; files: bigint }>>`
  SELECT
    (SELECT COUNT(*) FROM "AccountDocument" WHERE "tenantId" = ${T} AND "systemId" = ${S} AND "contactId" = ${C.id})::bigint AS docs,
    (SELECT COUNT(*) FROM "AccountAttachment" att JOIN "AccountDocument" d2 ON d2."id" = att."documentId"
      WHERE att."systemId" = ${S} AND d2."contactId" = ${C.id})::bigint AS files`;
const cnt = cntRows[0]!;

// เอกสาร 5 รายการล่าสุด (เรียง issueDate desc, id desc — ลำดับเดียวกับที่โค้ดจริงใช้)
const recentRows = await prisma.$queryRaw<Array<{ id: string; docNo: string | null; docType: string }>>`
  SELECT "id", "docNo", "docType" FROM "AccountDocument"
   WHERE "tenantId" = ${T} AND "systemId" = ${S} AND "contactId" = ${C.id}
   ORDER BY "issueDate" DESC, "id" DESC LIMIT 5`;

const contactProfile = {
  contactId: C.id,
  code: C.code,
  name: C.name,
  kind: C.kind,
  outstandingSatang: n(a.total),
  outstandingDocs: n(a.docs),
  overdueDocs: n(a.overdue),
  aging: { notDue: n(a.b0), d1_30: n(a.b1), d31_60: n(a.b2), d61_90: n(a.b3), d90plus: n(a.b4) },
  /** สำหรับ visual-acc-v2 เท่านั้น (หน้าเว็บใช้นาฬิกาเครื่อง ไม่ใช่ QC.today) */
  agingNow: { notDue: n(an.b0), d1_30: n(an.b1), d31_60: n(an.b2), d61_90: n(an.b3), d90plus: n(an.b4) },
  paidThisYearSatang: n(paid.amount),
  paidDocsThisYear: n(paid.docs),
  year: YEAR,
  docsCount: n(cnt.docs),
  filesCount: n(cnt.files),
  recentDocIds: recentRows.map((r) => r.id),
  recentDocNos: recentRows.map((r) => r.docNo),
};

// ─────────────── 2) คู่ผู้ติดต่อซ้ำที่ seed ตั้งใจใส่ (WO 3.4 §7.3) ───────────────
const pairRows = await prisma.$queryRaw<
  Array<{ id: string; code: string | null; name: string; taxId: string | null; branchCode: string | null }>
>`
  SELECT "id", "code", "name", "taxId", "branchCode" FROM "AccountContact"
   WHERE "tenantId" = ${T} AND "systemId" = ${S} AND "archivedAt" IS NULL AND "mergedIntoId" IS NULL
     AND "taxId" IN (
       SELECT "taxId" FROM "AccountContact"
        WHERE "tenantId" = ${T} AND "systemId" = ${S} AND "archivedAt" IS NULL AND "taxId" IS NOT NULL
        GROUP BY "taxId" HAVING COUNT(*) > 1
     )
   ORDER BY "branchCode", "code"`;
if (pairRows.length !== 2)
  throw new Error(`คาดว่ามีคู่ซ้ำเลขภาษี 1 คู่ (2 แถว) แต่พบ ${pairRows.length} แถว — seed ไม่ตรงกับที่ WO 3.4 กำหนด`);
const [primaryRow, secondaryRow] = pairRows as [(typeof pairRows)[number], (typeof pairRows)[number]];

const perContact = async (id: string) => {
  const r = await prisma.$queryRaw<Array<{ docs: bigint; types: bigint; jv: bigint; groups: bigint; rules: bigint }>>`
    SELECT
      (SELECT COUNT(*) FROM "AccountDocument" WHERE "tenantId" = ${T} AND "systemId" = ${S} AND "contactId" = ${id})::bigint AS docs,
      (SELECT COUNT(DISTINCT "docType") FROM "AccountDocument" WHERE "tenantId" = ${T} AND "systemId" = ${S} AND "contactId" = ${id})::bigint AS types,
      (SELECT COUNT(*) FROM "AccountJournalLine" WHERE "systemId" = ${S} AND "contactId" = ${id})::bigint AS jv,
      (SELECT COUNT(*) FROM "AccountContactGroupMember" WHERE "systemId" = ${S} AND "contactId" = ${id})::bigint AS groups,
      (SELECT COUNT(*) FROM "AccountRecurringRule" WHERE "systemId" = ${S} AND "contactId" = ${id})::bigint AS rules`;
  const x = r[0]!;
  return { docs: n(x.docs), docTypes: n(x.types), journalLines: n(x.jv), groups: n(x.groups), recurringRules: n(x.rules) };
};

// กลุ่มที่ซ้ำกันทั้งสองฝั่ง (ตอนรวมต้อง "ลบทิ้ง" ไม่ใช่ย้าย เพราะ unique(groupId,contactId))
const sharedGroupRows = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
  SELECT COUNT(*)::bigint AS cnt FROM "AccountContactGroupMember" m1
   WHERE m1."systemId" = ${S} AND m1."contactId" = ${secondaryRow.id}
     AND EXISTS (SELECT 1 FROM "AccountContactGroupMember" m2
                  WHERE m2."systemId" = ${S} AND m2."contactId" = ${primaryRow.id} AND m2."groupId" = m1."groupId")`;

const primaryCounts = await perContact(primaryRow.id);
const secondaryCounts = await perContact(secondaryRow.id);

const mergeDuplicate = {
  taxId: primaryRow.taxId,
  primary: { id: primaryRow.id, code: primaryRow.code, name: primaryRow.name, branchCode: primaryRow.branchCode, ...primaryCounts },
  secondary: { id: secondaryRow.id, code: secondaryRow.code, name: secondaryRow.name, branchCode: secondaryRow.branchCode, ...secondaryCounts },
  /** กลุ่มที่ทั้งสองฝั่งอยู่เหมือนกัน → ตอนรวมต้องถูกลบทิ้ง (ที่เหลือย้าย) */
  sharedGroups: n(sharedGroupRows[0]?.cnt),
  /** เอกสารรวมหลังรวม (แถบสรุปของ g7: "หลังรวม: เอกสาร N ใบ ย้ายไป …") */
  totalDocsAfterMerge: primaryCounts.docs + secondaryCounts.docs,
};

(E as Record<string, unknown>).contactProfile = contactProfile;
(E as Record<string, unknown>).mergeDuplicate = mergeDuplicate;
writeFileSync(QC.expectedPath, `${JSON.stringify(E, null, 2)}\n`);

console.log("✅ เขียนคีย์ contactProfile + mergeDuplicate ลง", QC.expectedPath);
console.log(
  `   โปรไฟล์ ${contactProfile.code}: ค้างรับ ${contactProfile.outstandingSatang} สตางค์ (${contactProfile.outstandingDocs} ใบ · พ้นกำหนด ${contactProfile.overdueDocs}) · ซื้อสะสมปี ${YEAR} ${contactProfile.paidThisYearSatang} · เอกสาร ${contactProfile.docsCount} · ไฟล์ ${contactProfile.filesCount}`,
);
console.log(
  `   คู่ซ้ำ ${mergeDuplicate.primary.code} (เอกสาร ${primaryCounts.docs}) ↔ ${mergeDuplicate.secondary.code} (เอกสาร ${secondaryCounts.docs} · ${secondaryCounts.docTypes} ชนิด · JV ${secondaryCounts.journalLines} · กลุ่ม ${secondaryCounts.groups} (ซ้ำ ${mergeDuplicate.sharedGroups}) · กฎประจำ ${secondaryCounts.recurringRules})`,
);
await prisma.$disconnect();
