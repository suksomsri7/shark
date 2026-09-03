// QC WO 3.4 — โปรไฟล์ผู้ติดต่อ 360° (src/lib/modules/account/contact-profile.ts)
//
// requires: acc-v2-seed
//
// รัน (บังคับ DB QC branch):
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/seed-acc-v2-qc.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/acc-v2-expected-contact-profile.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-contact-profile.mts
//
// เทียบ **สองการคำนวณที่เขียนแยกกัน**: contact-profile.ts (Prisma findMany + รวมยอด/จัด bucket ฝั่ง JS)
// กับเฉลย acc-v2-expected.json คีย์ "contactProfile" (SQL ดิบ FILTER/CASE — acc-v2-expected-contact-profile.mts)
//
// ครอบคลุม (BLUEPRINT §3 แถว 3.4 · DESIGN-SPEC-V2 §7.1):
//   Q1  หัวโปรไฟล์ (เลขที่ · ชื่อ · ประเภท · ตัวอักษร avatar · chip)
//   Q2  KPI: ค้างรับ/ค้างจ่าย + จำนวนใบ + พ้นกำหนด + ซื้อสะสมปีนี้ + จำนวนครั้ง = เฉลย
//   Q3  อายุหนี้ 5 ช่วง = เฉลย · ผลรวม bucket = ยอดค้างพอดี
//   Q4  ตัวนับแท็บ เอกสาร n / ไฟล์แนบ n = เฉลย
//   Q5  เอกสาร 5 รายการล่าสุด: จำนวน + ลำดับ (id ตรงเฉลย)
//   Q6  แท็บเอกสาร: ทุกชนิดในตารางเดียว + ตัวกรองชนิด/สถานะ + pagination
//   Q7  แท็บไฟล์แนบ / แท็บการเชื่อมต่อ (การ์ด 4 ใบ · สมาชิกเชื่อมจริงผ่าน Party)
//   Q8  งบ query ต่อแท็บ ≤ 12 (นับ SQL จริงจาก prisma log)
//   Q9  ผู้ขาย = ป้าย "ค้างจ่าย" (ไม่ใช่ค้างรับ) · ทิศทางเอกสารถูกฝั่ง
//   Q10 IDOR/scope: contactId ของระบบอื่น = null · guard/nav ทะเบียนครบ

import { readFileSync, existsSync } from "node:fs";

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string; today: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();

// ── ตัวนับ SQL จริง (แบบเดียวกับ qc-acc-v2-contacts.mts) ──
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
let sqlLog: string[] = [];
let counting = false;
const client = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  log: [{ emit: "event", level: "query" }],
});
(client as unknown as { $on: (e: string, cb: (ev: { query: string }) => void) => void }).$on("query", (ev) => {
  if (counting) sqlLog.push(ev.query);
});
(globalThis as unknown as { prisma?: PrismaClient }).prisma = client;

const { prisma } = await import("@/lib/core/db");
const cp = await import("@/lib/modules/account/contact-profile");
const guard = await import("@/lib/modules/account/guard");

let passed = 0;
const findings: string[] = [];
const ok = (name: string) => {
  passed++;
  console.log("  ✅ " + name);
};
const bad = (name: string, detail: string) => {
  findings.push(`${name} — ${detail}`);
  console.log("  ❌ " + name + " — " + detail);
};
const assert = (name: string, cond: boolean, detail = "") => (cond ? ok(name) : bad(name, detail));
const eq = (name: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  assert(name, a === b, `ได้ ${a} · ควรได้ ${b}`);
};
const countSql = () => sqlLog.filter((q) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE)/i.test(q)).length;

console.log(`\n===== QC WO 3.4 · โปรไฟล์ผู้ติดต่อ 360° =====`);
console.log(`[env] DB ${host}\n`);

if (!existsSync(QC.expectedPath)) {
  console.error(`❌ ไม่พบเฉลย ${QC.expectedPath} — รัน seed ก่อน`);
  process.exit(2);
}
const E = JSON.parse(readFileSync(QC.expectedPath, "utf8"));
if (!E.contactProfile) {
  console.error("❌ เฉลยยังไม่มีคีย์ contactProfile — รัน scripts/acc-v2-expected-contact-profile.mts ก่อน");
  process.exit(1);
}
const ctx = { tenantId: E.tenantId as string, systemId: E.systemId as string };
const X = E.contactProfile as {
  contactId: string;
  code: string;
  name: string;
  outstandingSatang: number;
  outstandingDocs: number;
  overdueDocs: number;
  aging: { notDue: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number };
  paidThisYearSatang: number;
  paidDocsThisYear: number;
  year: number;
  docsCount: number;
  filesCount: number;
  recentDocIds: string[];
};
const BASE = `/app/sys/${ctx.systemId}/account`;
const ASOF = new Date(`${QC.today}T12:00:00+07:00`);
const load = (tab: "info" | "docs" | "files" | "links", extra: Record<string, unknown> = {}) =>
  cp.contactProfile(ctx, X.contactId, { base: BASE, tab, asOf: ASOF, ...extra });

// ═══════════════ Q1 หัวโปรไฟล์ ═══════════════
console.log("Q1 หัวโปรไฟล์:");
const p = await load("info");
if (!p) {
  console.error("❌ contactProfile คืน null สำหรับ fixture — หยุด");
  process.exit(1);
}
eq("Q1.1 เลขที่ = เฉลย", p.header.code, X.code);
eq("Q1.2 ชื่อ = เฉลย", p.header.name, X.name);
eq("Q1.3 ประเภท (ลูกค้า)", p.header.kindLabel, "ลูกค้า");
eq("Q1.4 ตัวอักษร avatar (ตัดคำนำหน้า)", p.header.avatarLetter, "ป");
assert("Q1.5 chip แรก = ประเภทผู้ติดต่อ", p.header.chips[0]?.tone === "kind", JSON.stringify(p.header.chips));
assert(
  "Q1.6 chip กลุ่มกำหนดเองมาครบ (ปิยธิดาอยู่กลุ่ม ลูกค้า VIP)",
  p.header.chips.some((c) => c.tone === "group" && c.label === "ลูกค้า VIP"),
  JSON.stringify(p.header.chips.map((c) => c.label)),
);
assert("Q1.7 ยังไม่ถูกรวม/ปิดใช้งาน", !p.header.archived && p.header.mergedIntoId === null);

// ═══════════════ Q2 KPI ═══════════════
console.log("\nQ2 KPI:");
eq("Q2.1 ป้ายยอดค้าง = ค้างรับ (ลูกค้า)", p.kpi.outstandingLabel, "ค้างรับ");
eq("Q2.2 ยอดค้าง = เฉลย", p.kpi.outstandingSatang, X.outstandingSatang);
eq("Q2.3 จำนวนใบค้าง = เฉลย", p.kpi.outstandingDocs, X.outstandingDocs);
eq("Q2.4 จำนวนใบพ้นกำหนด = เฉลย", p.kpi.overdueDocs, X.overdueDocs);
eq("Q2.5 แดงเมื่อมีใบพ้นกำหนด", p.kpi.outstandingDanger, X.overdueDocs > 0);
eq("Q2.6 ซื้อสะสมปีนี้ = เฉลย", p.kpi.paidThisYearSatang, X.paidThisYearSatang);
eq("Q2.7 จำนวนครั้ง (ใบที่มีเงินเข้าปีนี้) = เฉลย", p.kpi.paidDocsThisYear, X.paidDocsThisYear);
eq("Q2.8 ปีที่แสดง = ปีปฏิทินไทยของ asOf", p.kpi.year, X.year);
assert(
  "Q2.9 ป้ายกฎลูกค้าประจำสร้างจากค่ากฎจริง (ไม่ hardcode)",
  /^ซื้อ ≥\d+ ครั้ง\/(ปี|\d+ เดือน)$/.test(p.kpi.regularRuleLabel),
  p.kpi.regularRuleLabel,
);

// ═══════════════ Q3 อายุหนี้ ═══════════════
console.log("\nQ3 อายุหนี้ของรายนี้ (5 ช่วง):");
const bucket = (k: string) => p.aging.buckets.find((b) => b.key === k)?.satang;
eq("Q3.1 ยังไม่ครบกำหนด = เฉลย", bucket("notDue"), X.aging.notDue);
eq("Q3.2 1–30 วัน = เฉลย", bucket("d1_30"), X.aging.d1_30);
eq("Q3.3 31–60 วัน = เฉลย", bucket("d31_60"), X.aging.d31_60);
eq("Q3.4 61–90 วัน = เฉลย", bucket("d61_90"), X.aging.d61_90);
eq("Q3.5 เกิน 90 วัน = เฉลย", bucket("d90plus"), X.aging.d90plus);
eq(
  "Q3.6 ผลรวม 5 ช่วง = ยอดค้างพอดี",
  p.aging.buckets.reduce((s, b) => s + b.satang, 0),
  p.kpi.outstandingSatang,
);
eq("Q3.7 มี 5 ช่วงเท่านั้น + ป้ายไทยตรงสเปค", p.aging.buckets.map((b) => b.label), [
  "ยังไม่ครบกำหนด",
  "1–30 วัน",
  "31–60 วัน",
  "61–90 วัน",
  "เกิน 90 วัน",
]);
assert("Q3.8 ช่วง 'เกิน 90 วัน' ทำเครื่องหมายสีแดง", p.aging.buckets[4]?.danger === true);

// ═══════════════ Q4 ตัวนับแท็บ ═══════════════
console.log("\nQ4 ตัวนับแท็บ:");
eq("Q4.1 เอกสาร n = เฉลย", p.tabs.docs, X.docsCount);
eq("Q4.2 ไฟล์แนบ n = เฉลย", p.tabs.files, X.filesCount);

// ═══════════════ Q5 เอกสาร 5 รายการล่าสุด ═══════════════
console.log("\nQ5 เอกสาร 5 รายการล่าสุด:");
assert("Q5.1 ไม่เกิน 5 รายการ", p.recentDocs.length <= 5, `${p.recentDocs.length}`);
eq("Q5.2 ลำดับ (issueDate desc, id desc) ตรงเฉลย", p.recentDocs.map((d) => d.id), X.recentDocIds);
assert("Q5.3 ทุกแถวมีลิงก์ปลายทางจริง (ไม่ใช่ #)", p.recentDocs.every((d) => d.href.startsWith(BASE) && d.href.length > BASE.length + 3));
assert("Q5.4 ทุกแถวมีป้ายชนิด + ป้ายสถานะภาษาไทย", p.recentDocs.every((d) => !!d.docTypeLabel && !!d.statusLabel && !/^[A-Z_]+$/.test(d.statusLabel)));

// ═══════════════ Q6 แท็บเอกสาร ═══════════════
console.log("\nQ6 แท็บเอกสาร (ทุกชนิด + ตัวกรอง + pagination):");
const pd = (await load("docs"))!;
assert("Q6.1 docsTab ถูกเติมเมื่อ tab=docs", !!pd.docsTab);
eq("Q6.2 total = จำนวนเอกสารทั้งหมดของราย", pd.docsTab!.total, X.docsCount);
assert("Q6.3 แท็บอื่นไม่ถูกโหลดทิ้งไว้ (filesTab/linksTab = null)", pd.filesTab === null && pd.linksTab === null);
eq(
  "Q6.4 ตัวเลือกชนิดเอกสารรวมกัน = จำนวนเอกสารทั้งหมด",
  pd.docsTab!.docTypeOptions.reduce((s, o) => s + o.count, 0),
  X.docsCount,
);
{
  // ผู้ติดต่อคู่ซ้ำ (C00007) มี 4 ชนิด — ใช้ตรวจว่าตารางเดียวรวมทุกชนิดจริง + ตัวกรองชนิดทำงาน
  const MD = E.mergeDuplicate as { secondary: { id: string; docs: number; docTypes: number } };
  const ps = (await cp.contactProfile(ctx, MD.secondary.id, { base: BASE, tab: "docs", asOf: ASOF }))!;
  eq("Q6.5 ตัวรองคู่ซ้ำ: เอกสารทุกชนิดอยู่ในตารางเดียว", ps.docsTab!.total, MD.secondary.docs);
  eq("Q6.6 ตัวรองคู่ซ้ำ: ตัวเลือกชนิด = จำนวนชนิดจริง", ps.docsTab!.docTypeOptions.length, MD.secondary.docTypes);
  const firstType = ps.docsTab!.docTypeOptions[0]!;
  const pf = (await cp.contactProfile(ctx, MD.secondary.id, { base: BASE, tab: "docs", asOf: ASOF, docType: firstType.value }))!;
  eq(`Q6.7 กรองชนิด "${firstType.label}" ได้ ${firstType.count} ใบ`, pf.docsTab!.total, firstType.count);
  assert("Q6.8 แถวที่กรองแล้วเป็นชนิดเดียวกันทั้งหมด", pf.docsTab!.rows.every((r) => r.docType === firstType.value));
  const st = ps.docsTab!.statusOptions[0];
  if (st) {
    const pst = (await cp.contactProfile(ctx, MD.secondary.id, { base: BASE, tab: "docs", asOf: ASOF, status: st.value }))!;
    eq(`Q6.9 กรองสถานะ "${st.label}" ได้ ${st.count} ใบ`, pst.docsTab!.total, st.count);
  } else {
    assert("Q6.9 มีตัวเลือกสถานะอย่างน้อย 1 ค่า", false, "statusOptions ว่าง");
  }
  assert("Q6.10 pagination: pageCount ≥ 1 และ page อยู่ในช่วง", ps.docsTab!.pageCount >= 1 && ps.docsTab!.page >= 1 && ps.docsTab!.page <= ps.docsTab!.pageCount);
  const p2 = (await cp.contactProfile(ctx, MD.secondary.id, { base: BASE, tab: "docs", asOf: ASOF, page: 2 }))!;
  assert("Q6.11 หน้า 2 คืนแถวคนละชุดกับหน้า 1", p2.docsTab!.rows.every((r) => !ps.docsTab!.rows.some((x) => x.id === r.id)), "แถวซ้ำข้ามหน้า");
}

// ═══════════════ Q7 แท็บไฟล์แนบ + การเชื่อมต่อ ═══════════════
console.log("\nQ7 แท็บไฟล์แนบ + การเชื่อมต่อ:");
const pf2 = (await load("files"))!;
assert("Q7.1 filesTab ถูกเติมเมื่อ tab=files", !!pf2.filesTab);
eq("Q7.2 จำนวนไฟล์ในแท็บ = ตัวนับแท็บ", pf2.filesTab!.rows.length, Math.min(X.filesCount, 100));
const pl = (await load("links"))!;
assert("Q7.3 linksTab ถูกเติมเมื่อ tab=links", !!pl.linksTab);
eq("Q7.4 การ์ดการเชื่อมต่อ 4 ใบ (สมาชิก/CRM/แชท/POS)", pl.linksTab!.cards.map((c) => c.key), ["member", "crm", "chat", "pos"]);
const memberCard = pl.linksTab!.cards.find((c) => c.key === "member")!;
assert("Q7.5 ปิยธิดา เชื่อมกับสมาชิกจริง (ผ่าน Party — seed I5)", memberCard.linked && !!memberCard.detail, JSON.stringify(memberCard));
const chatCard = pl.linksTab!.cards.find((c) => c.key === "chat")!;
assert(
  "Q7.6 การ์ดแชท = ยังไม่เชื่อม (ไม่มี facade ของโมดูลแชท — ค่าจริง ไม่ใช่ค่าปลอม)",
  chatCard.linked === false && chatCard.detail === null,
  JSON.stringify(chatCard),
);

// ═══════════════ Q8 งบ query ═══════════════
console.log("\nQ8 งบ query ต่อแท็บ ≤ 12 (SQL จริงจาก prisma log):");
for (const tab of ["info", "docs", "files", "links"] as const) {
  sqlLog = [];
  counting = true;
  await load(tab);
  counting = false;
  const c = countSql();
  assert(`Q8.${tab} แท็บ "${tab}" ใช้ ${c} query (≤ 12)`, c > 0 && c <= 12, `${c}`);
}

// ═══════════════ Q9 ฝั่งผู้ขาย ═══════════════
console.log("\nQ9 ผู้ขาย = ป้าย 'ค้างจ่าย':");
const vendor = await prisma.accountContact.findFirst({
  where: { tenantId: ctx.tenantId, systemId: ctx.systemId, kind: "VENDOR", archivedAt: null },
  orderBy: { createdAt: "asc" },
  select: { id: true },
});
const pv = vendor ? await cp.contactProfile(ctx, vendor.id, { base: BASE, tab: "info", asOf: ASOF }) : null;
assert("Q9.1 โหลดโปรไฟล์ผู้ขายได้", !!pv);
eq("Q9.2 ป้ายยอดค้างของผู้ขาย = ค้างจ่าย", pv?.kpi.outstandingLabel, "ค้างจ่าย");
{
  const vendorPayable = await prisma.$queryRaw<Array<{ total: bigint; docs: bigint }>>`
    SELECT COALESCE(SUM("grandTotal" - "paidTotal"), 0)::bigint AS total, COUNT(*)::bigint AS docs
      FROM "AccountDocument"
     WHERE "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} AND "contactId" = ${vendor!.id}
       AND "direction" = 'IN' AND "status" IN ('AWAITING_PAYMENT','PARTIAL') AND "voidedAt" IS NULL
       AND ("grandTotal" - "paidTotal") > 0`;
  eq("Q9.3 ยอดค้างจ่าย = SQL ดิบฝั่ง IN", pv?.kpi.outstandingSatang, Number(vendorPayable[0]!.total));
  eq("Q9.4 จำนวนใบค้างจ่าย = SQL ดิบ", pv?.kpi.outstandingDocs, Number(vendorPayable[0]!.docs));
}

// ═══════════════ Q10 scope / ทะเบียน ═══════════════
console.log("\nQ10 scope + ทะเบียน route:");
const otherSystem = await prisma.appSystem.findFirst({ where: { tenantId: ctx.tenantId, type: "CRM" }, select: { id: true } });
const cross = otherSystem ? await cp.contactProfile({ tenantId: ctx.tenantId, systemId: otherSystem.id }, X.contactId, { base: BASE }) : "skip";
assert("Q10.1 contactId ของระบบบัญชี เปิดจากระบบอื่นไม่ได้ (คืน null)", cross === null, JSON.stringify(cross === "skip" ? "ไม่มีระบบอื่นให้ทดสอบ" : "ได้ข้อมูลกลับมา"));
const fake = await cp.contactProfile(ctx, "cxxxxxxxxxxxxxxxxxxxxxxxx", { base: BASE });
assert("Q10.2 id ที่ไม่มีจริง = null (ไม่ throw)", fake === null);
eq("Q10.3 guard.ts มี contacts/[contactId]/page.tsx", guard.ACCOUNT_PAGE_PERMISSIONS["contacts/[contactId]/page.tsx"], "account.contact.manage");
assert(
  "Q10.4 ลิงก์ปุ่มท้ายชี้ปลายทางจริงทั้ง 3 ปุ่ม",
  p.links.newInvoiceHref.includes("contactId=") && p.links.remindHref.includes("contactId=") && p.links.ledgerHref.includes("contactId="),
  JSON.stringify(p.links),
);

console.log(`\n===== QC WO 3.4 · โปรไฟล์ 360° สรุป =====`);
console.log(`ผ่าน ${passed} · ตก ${findings.length}`);
if (findings.length > 0) console.log(findings.map((f) => "  - " + f).join("\n"));
await prisma.$disconnect();
process.exit(findings.length === 0 ? 0 : 1);
