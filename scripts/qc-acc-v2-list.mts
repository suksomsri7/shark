// QC WO 1.1 — "หน้ารายการทุกชนิด" (DocListPage + list-tabs.ts)
// requires: acc-v2-seed
// ↑ marker (WO 0.7) — L7–L10 อ่านชุดข้อมูล QC จริง ⇒ `qc-all.mts` seed ให้ครั้งเดียวก่อนรันส่วนนี้
// รัน (แนะนำ · DB QC branch):  QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-list.mts
//
// 🔴 อ่านอย่างเดียว — ไม่มีการ create/update/delete บน tenant QC เลยทั้งไฟล์ (นับ/เทียบ DB จริงเท่านั้น)
//    ยังคงชี้ QC_ENV_FILE เพื่อกันพลาดต่อ prod เหมือนชุด qc-acc-v2-* อื่น
//
// ครอบคลุม (ดู ledger/wo-notes/1.1.md):
//   L1  ทุก docType ที่ WO 1.1 เดินสาย DocListPage เข้าให้ (WO_1_1_DOC_TYPES) มี LIST_TABS ประกาศจริง
//   L2  ทุก docType ใน LIST_TABS: แท็บแรกคือ "all" · ไม่มีคีย์ซ้ำ · label ไม่มีอักษรอังกฤษหลุด
//   L3  tabToFilter(docType, key) คืน filter ตรงกับที่ประกาศไว้ทุกแท็บ (round-trip)
//   L4  activeTabKey/tabToFilter: คีย์ที่ไม่รู้จัก/docType ที่ไม่มี → fallback ปลอดภัย (ไม่ throw)
//   L5  NAV_FLYOUT_TABS ทุกคีย์ (ที่ไม่ใช่ "overdue" sentinel) ต้องมีอยู่จริงใน LIST_TABS ของ docType เดียวกัน
//       (กันตัวนับ flyout ชี้ไปแท็บที่หน้ารายการไม่รู้จัก — จุดกันดริฟต์หลักของ WO นี้)
//   L6  INVOICE: ชุด/ลำดับ/ป้ายแท็บต้องตรง f3-invoice-list.png เป๊ะ (ground truth)
//   L7  (DB) INVOICE tabCounts ตรง acc-v2-expected.json.invoiceTabs ทุกคีย์ + ผลรวม all = Σ (draft+awaiting+partial+paid+overdue+cancelled)
//   L8  (DB) EXPENSE/PURCHASE: ผลรวม all = Σ ทุกแท็บที่ไม่ใช่ "all" · "awaiting" ไม่รวมแถวพ้นกำหนด (เทียบ raw count อิสระ)
//   L9  (DB) page/pageSize bounds ของ listDocumentsPaged/listExpenseDocsPaged/listGoodsIssuePaged (ต่ำกว่า1→1 · เกิน100→100)
//   L10 (DB) sort="docNo" คืนแถวเรียง docNo จริง (เทียบกับ sort ฝั่ง JS อิสระ)

// CI ไม่มีทั้ง `.env` และ `.env.qc` — env มาจาก DATABASE_URL/DIRECT_URL ที่ workflow export ไว้
// (process.loadEnvFile โยน ENOENT ถ้าไม่มีไฟล์ · และค่าที่ export มาก่อน "ชนะ" ไฟล์เสมอ — WO 0.7)
try { process.loadEnvFile?.(process.env.QC_ENV_FILE ?? ".env"); } catch { /* CI: ไม่มีไฟล์ env */ }

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
const findings: string[] = [];
function ok(name: string) {
  passed++;
  console.log("  ✅ " + name);
}
function bad(name: string, detail: string) {
  findings.push(name + " — " + detail);
  console.log("  ❌ " + name + " — " + detail);
}
function assert(name: string, cond: boolean, detail = "") {
  if (cond) ok(name);
  else bad(name, detail);
}
function eq(name: string, actual: unknown, expected: unknown) {
  assert(name, actual === expected, `ได้ ${JSON.stringify(actual)} · ควรได้ ${JSON.stringify(expected)}`);
}

const ROOT = process.cwd();
const envFile = process.env.QC_ENV_FILE ?? ".env";
const dbHost = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").split("/")[0] || "(ไม่พบ DATABASE_URL)";
console.log(`\n===== QC WO 1.1 · หน้ารายการทุกชนิด (DocListPage) =====`);
console.log(`[env] ไฟล์ ${envFile} · DB ${dbHost}\n`);

const {
  LIST_TABS,
  NAV_FLYOUT_TABS,
  WO_1_1_DOC_TYPES,
  tabToFilter,
  activeTabKey,
} = await import("@/lib/modules/account/list-tabs");
const { listDocumentsPaged, computeListTabCounts } = await import("@/lib/modules/account/service");
const { listExpenseDocsPaged } = await import("@/lib/modules/account/expense");
const { listGoodsIssuePaged } = await import("@/lib/modules/account/product");

// ═══════════════ L1 — ทุก docType ของ WO 1.1 มี LIST_TABS ═══════════════
for (const dt of WO_1_1_DOC_TYPES) {
  assert(`L1 ${dt} มี LIST_TABS ประกาศ (ไม่ว่าง)`, Array.isArray(LIST_TABS[dt]) && (LIST_TABS[dt]?.length ?? 0) > 0, `LIST_TABS["${dt}"] = ${JSON.stringify(LIST_TABS[dt])}`);
}

// ═══════════════ L2 — โครงแท็บถูกต้องต่อ docType (แท็บแรก="all" · คีย์ไม่ซ้ำ · ไม่มีอังกฤษหลุด) ═══════════════
const ENGLISH_ALLOW = /^[ก-๙0-9()·\s%.\/-]*$/; // อนุญาตตัวเลข/สัญลักษณ์ทั่วไป — ไม่อนุญาต a-z ปนใน label
for (const [dt, tabs] of Object.entries(LIST_TABS)) {
  if (!tabs || tabs.length === 0) continue;
  assert(`L2 ${dt} แท็บแรกคือ "all"`, tabs[0].key === "all", `แท็บแรก = "${tabs[0].key}"`);
  const keys = tabs.map((t) => t.key);
  assert(`L2 ${dt} ไม่มีคีย์แท็บซ้ำ`, new Set(keys).size === keys.length, `คีย์ = ${keys.join(",")}`);
  const badLabel = tabs.find((t) => !ENGLISH_ALLOW.test(t.label));
  assert(`L2 ${dt} ป้ายแท็บเป็นภาษาไทยล้วน (ไม่มี a-z หลุด)`, !badLabel, badLabel ? `"${badLabel.label}"` : "");
}

// ═══════════════ L3 — tabToFilter คืน filter ตรงกับที่ประกาศ (round-trip) ทุกแท็บ ═══════════════
for (const [dtKey, tabs] of Object.entries(LIST_TABS)) {
  const dt = dtKey as keyof typeof LIST_TABS;
  if (!tabs) continue;
  let allMatch = true;
  const mismatches: string[] = [];
  for (const t of tabs) {
    const got = tabToFilter(dt as never, t.key);
    const wantJson = JSON.stringify(t.filter);
    const gotJson = JSON.stringify(got);
    if (gotJson !== wantJson) {
      allMatch = false;
      mismatches.push(`${t.key}: ได้ ${gotJson} ควรได้ ${wantJson}`);
    }
  }
  assert(`L3 ${dtKey} · tabToFilter คืน filter ตรงทุกแท็บ (${tabs.length} แท็บ)`, allMatch, mismatches.join(" · "));
}

// ═══════════════ L4 — fallback ปลอดภัยเมื่อคีย์/docType ไม่รู้จัก ═══════════════
eq("L4 tabToFilter(INVOICE, คีย์มั่ว) → fallback ALL", JSON.stringify(tabToFilter("INVOICE" as never, "xyz-not-a-tab")), JSON.stringify({ status: "ALL" }));
eq("L4 tabToFilter(docType ที่ไม่มี LIST_TABS, ใด ๆ) → fallback ALL", JSON.stringify(tabToFilter("WHT_CERT" as never, "all")), JSON.stringify({ status: "ALL" }));
eq("L4 activeTabKey(INVOICE, คีย์มั่ว) → แท็บแรก (all)", activeTabKey("INVOICE" as never, "xyz-not-a-tab"), "all");
eq("L4 activeTabKey(INVOICE, undefined) → แท็บแรก (all)", activeTabKey("INVOICE" as never, undefined), "all");

// ═══════════════ L5 — NAV_FLYOUT_TABS เป็นชุดย่อยของ LIST_TABS เสมอ (กันดริฟต์) ═══════════════
for (const [dt, flyout] of Object.entries(NAV_FLYOUT_TABS)) {
  const listKeys = new Set((LIST_TABS[dt as keyof typeof LIST_TABS] ?? []).map((t) => t.key));
  for (const key of Object.keys(flyout)) {
    if (key === "overdue" && flyout[key] === "overdue") {
      // "overdue" เป็น sentinel พิเศษของ flyout (derived) — หน้ารายการของ docType นี้ต้องมีแท็บ "overdue" จริงด้วย
      assert(`L5 ${dt}:overdue (flyout sentinel) มีแท็บ "overdue" ในหน้ารายการจริง`, listKeys.has("overdue"), `LIST_TABS["${dt}"] keys = ${[...listKeys].join(",")}`);
      continue;
    }
    assert(`L5 ${dt}:${key} (flyout) มีแท็บนี้ในหน้ารายการจริง`, listKeys.has(key), `LIST_TABS["${dt}"] keys = ${[...listKeys].join(",")}`);
  }
}

// ═══════════════ L6 — INVOICE ต้องตรง f3-invoice-list.png เป๊ะ (ground truth) ═══════════════
const invoiceTabs = LIST_TABS.INVOICE ?? [];
eq("L6 INVOICE ชุดคีย์แท็บตรง f3", invoiceTabs.map((t) => t.key).join(","), "all,draft,awaiting,partial,paid,overdue,cancelled");
eq("L6 INVOICE ชุดป้ายแท็บตรง f3", invoiceTabs.map((t) => t.label).join(","), "ทั้งหมด,ร่าง,รอชำระ,ชำระบางส่วน,ชำระแล้ว,พ้นกำหนด,ยกเลิก");
assert("L6 INVOICE แท็บ overdue มี tone=danger", invoiceTabs.find((t) => t.key === "overdue")?.tone === "danger");

// ═══════════════ L7 — (DB) INVOICE tabCounts ตรง acc-v2-expected.json.invoiceTabs ═══════════════
const expectedPath = join(ROOT, "scripts/acc-v2-expected.json");
// 🔑 หา tenant/system ของร้าน QC จาก **คีย์เสถียร** (ชื่อร้าน + ชนิดระบบ) ก่อน แล้วค่อยถอยไปใช้ id ในเฉลย
//    เหตุผล (WO 0.7): `acc-v2-expected.json` ที่ commit ไว้เก็บ id ของ Neon branch `wo-acc-v2-qc`
//    บน CI แต่ละ shard มี branch ของตัวเอง ⇒ id คนละชุด · ตัวเลข (invoiceTabs) ต่างหากที่เสถียรข้าม branch
const { prisma } = await import("@/lib/core/db");
const { resolveAccV2Scope } = (await import("./acc-v2-env.mts" as string)) as {
  resolveAccV2Scope: (p: unknown) => Promise<{ tenantId: string; systemId: string } | null>;
};
const qcScope = await resolveAccV2Scope(prisma);
if (!existsSync(expectedPath)) {
  bad("L7 มีไฟล์เฉลย acc-v2-expected.json", `ไม่พบ ${expectedPath} — รัน seed-acc-v2-qc.mts ก่อน`);
} else {
  const E = JSON.parse(readFileSync(expectedPath, "utf8"));
  const tenantId: string = qcScope?.tenantId ?? E.tenantId;
  const systemId: string = qcScope?.systemId ?? E.systemId;
  assert("L7 หาร้าน QC เจอใน DB ก้อนนี้ (ชื่อ SIAM DIVE QC + ระบบ ACCOUNT)", !!qcScope, "ไม่พบ — รัน seed-acc-v2-qc.mts ก่อน");
  const invExpected = E.invoiceTabs as Record<string, number>;

  const counts = await computeListTabCounts(tenantId, systemId, "INVOICE" as never, invoiceTabs as never);
  for (const [key, want] of Object.entries(invExpected)) {
    eq(`L7 INVOICE tabCounts["${key}"] ตรงเฉลย`, counts[key], want);
  }
  const sumOfParts = (invExpected.draft ?? 0) + (invExpected.awaiting ?? 0) + (invExpected.partial ?? 0) + (invExpected.paid ?? 0) + (invExpected.overdue ?? 0) + (invExpected.cancelled ?? 0);
  eq("L7 INVOICE ผลรวม all = Σ(draft+awaiting+partial+paid+overdue+cancelled)", invExpected.all, sumOfParts);

  // ═══════════════ L8 — (DB) EXPENSE/PURCHASE: ผลรวมแท็บสอดคล้อง + awaiting ไม่รวมพ้นกำหนด (เทียบ raw count อิสระ) ═══════════════
  for (const dt of ["EXPENSE", "PURCHASE"] as const) {
    const tabs = LIST_TABS[dt] ?? [];
    const c = await computeListTabCounts(tenantId, systemId, dt as never, tabs as never);
    const sumNonAll = tabs.filter((t) => t.key !== "all").reduce((s, t) => s + (c[t.key] ?? 0), 0);
    eq(`L8 ${dt} ผลรวม all = Σ ทุกแท็บที่ไม่ใช่ "all"`, c.all, sumNonAll);

    // oracle อิสระ: นับตรงจาก DB ไม่ผ่าน computeListTabCounts — AWAITING_PAYMENT ที่ "ยังไม่เลย" dueDate เท่านั้น
    const now = new Date();
    const rawAwaitingTotal = await prisma.accountDocument.count({ where: { tenantId, systemId, docType: dt, status: "AWAITING_PAYMENT" } });
    const rawAwaitingOverdue = await prisma.accountDocument.count({
      where: { tenantId, systemId, docType: dt, status: "AWAITING_PAYMENT", dueDate: { lt: now } },
    });
    eq(`L8 ${dt} tabCounts["awaiting"] = AWAITING_PAYMENT ทั้งหมด − พ้นกำหนด (oracle อิสระ)`, c.awaiting, rawAwaitingTotal - rawAwaitingOverdue);
  }
}

// ═══════════════ L9 — (DB) page/pageSize bounds ═══════════════
if (existsSync(expectedPath)) {
  const E = JSON.parse(readFileSync(expectedPath, "utf8"));
  const tenantId: string = qcScope?.tenantId ?? E.tenantId;
  const systemId: string = qcScope?.systemId ?? E.systemId;

  const p1 = await listDocumentsPaged(tenantId, systemId, { docType: "INVOICE", pageSize: 0, page: -5 });
  eq("L9 listDocumentsPaged pageSize=0 → clamp 1", p1.pageSize, 1);
  eq("L9 listDocumentsPaged page=-5 → clamp 1", p1.page, 1);
  const p2 = await listDocumentsPaged(tenantId, systemId, { docType: "INVOICE", pageSize: 9999 });
  eq("L9 listDocumentsPaged pageSize=9999 → clamp 100", p2.pageSize, 100);

  const e1 = await listExpenseDocsPaged(tenantId, systemId, { docType: "EXPENSE", pageSize: 0, page: 0 });
  eq("L9 listExpenseDocsPaged pageSize=0 → clamp 1", e1.pageSize, 1);
  eq("L9 listExpenseDocsPaged page=0 → clamp 1", e1.page, 1);
  const e2 = await listExpenseDocsPaged(tenantId, systemId, { docType: "EXPENSE", pageSize: 500 });
  eq("L9 listExpenseDocsPaged pageSize=500 → clamp 100", e2.pageSize, 100);

  const g1 = await listGoodsIssuePaged(tenantId, systemId, { pageSize: -1 });
  eq("L9 listGoodsIssuePaged pageSize=-1 → clamp 1", g1.pageSize, 1);

  // ═══════════════ L10 — (DB) sort="docNo" เรียงตรงกับ sort ฝั่ง JS อิสระ ═══════════════
  const sorted = await listDocumentsPaged(tenantId, systemId, { docType: "INVOICE", sort: "docNo", pageSize: 100 });
  const gotOrder = sorted.rows.map((r) => r.docNo);
  const wantOrder = [...gotOrder].sort((a, b) => (a && b ? (a < b ? 1 : a > b ? -1 : 0) : 0));
  eq("L10 listDocumentsPaged sort=docNo เรียง desc ตรงกับ sort ฝั่ง JS อิสระ", JSON.stringify(gotOrder), JSON.stringify(wantOrder));
} else {
  bad("L9/L10 ทดสอบ page bounds + sort ด้วยข้อมูลจริง", "ไม่พบเฉลย acc-v2-expected.json — ข้าม (นับเป็นตก ไม่ใช่ข้าม)");
}

console.log(`\n===== QC WO 1.1 =====`);
console.log(`${findings.length === 0 ? "✅ ผ่านทั้งหมด" : `❌ ตก ${findings.length}`} — ${passed + findings.length} เช็ก`);
process.exit(findings.length === 0 ? 0 : 1);
