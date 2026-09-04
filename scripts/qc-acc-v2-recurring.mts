// QC WO 1.9 — "เอกสารประจำ + เตือนครบกำหนด" · BLUEPRINT §0.3 ข้อ 4 และ 7
// รัน (บังคับ DB QC branch):  QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-recurring.mts
//
// 🔴 ความปลอดภัยข้อมูล: สคริปต์นี้ **สร้าง tenant ทิ้ง** แล้วลบทิ้งเมื่อจบ (ทุก query ผูก tenantId ของตัวเอง)
//    ต้องชี้ DB QC เสมอ — สคริปต์พิมพ์ไฟล์ env + โฮสต์ DB ให้ตรวจก่อนเริ่ม
//
// 🔴 ปิดการส่งอีเมลจริงก่อน import อะไรทั้งสิ้น: `.env.qc` มี RESEND_API_KEY อยู่จริง
//    ถ้าไม่ลบทิ้ง ชุดทดสอบ "เตือนชำระ" จะยิงอีเมลออกไปที่ Resend จริง (bounce + กินโควตา)
//    `emailEnabled` ถูกคำนวณตอน import `@/lib/env` ⇒ ต้องลบก่อนบรรทัด import ใด ๆ
//
// ครอบคลุม (ดู ledger/wo-notes/1.9.md):
//   P0  สายไฟ/ทะเบียน: actions ไม่แตะ prisma · assertAccountCan ครบทุก action · guard/nav/scope/cron route/script
//   P1  คณิตความถี่ (บริสุทธิ์): งวดแรก · เลื่อนงวด · สิ้นเดือน 31 → ก.พ. 28/29 → มี.ค. 31 · periodKey · ป้ายไทย
//   P2  CRUD + สโคป + สิทธิ์: สร้าง/แก้/เปิด-ปิด · ผู้ติดต่อข้ามระบบถูกตัดทิ้ง · ระบบอื่นมองไม่เห็นกฎ
//   P3  ตัวสร้าง: 1 งวด = 1 ใบ (รันซ้ำได้) · เลื่อน nextRunAt · endDate หยุด · autoApprove ออกจริง + JV สมดุล
//                 · ข้อมูลไม่ครบ = คงเป็นร่าง + แจ้งเตือน · ฝั่งรายจ่ายก็ทำงาน
//   P4  ตัวเตือน: ครบกำหนดพรุ่งนี้/พ้นกำหนด/ใบกำกับซื้อ 8 วัน/เช็ค → เขียนครั้งเดียว (รันซ้ำ = 0 เพิ่ม)
//                 · คนไม่มีสิทธิ์ account.payment.record ไม่ได้รับ
//   P5  เตือนชำระลูกค้า: ส่งได้เมื่อมีอีเมล + มี audit · ไม่มีอีเมล/ไม่มียอดค้าง = เหตุผลไทย
//   P6  pendingTasks: ทุกช่องตรงกับที่นับมือ
//   P7  ป้ายไทยล้วน (ไม่มี enum ดิบโผล่หน้าจอ)

// CI ไม่มีทั้ง `.env` และ `.env.qc` — env มาจาก DATABASE_URL/DIRECT_URL ที่ workflow export ไว้
// (process.loadEnvFile โยน ENOENT ถ้าไม่มีไฟล์ · และค่าที่ export มาก่อน "ชนะ" ไฟล์เสมอ — WO 0.7)
try { process.loadEnvFile?.(process.env.QC_ENV_FILE ?? ".env"); } catch { /* CI: ไม่มีไฟล์ env */ }
// 🔴 ต้องอยู่ก่อน import ทุกตัว (ดูหัวไฟล์)
delete process.env.RESEND_API_KEY;

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
console.log("\n===== QC WO 1.9 · เอกสารประจำ + เตือนครบกำหนด =====");
console.log(`[env] ไฟล์ ${envFile} · DB ${dbHost}\n`);

// ═══════════════════════ P0 — สายไฟ / ทะเบียน (static) ═══════════════════════
console.log("P0 สายไฟ/ทะเบียน (อ่านจากซอร์สจริง):");
{
  const actionsSrc = readFileSync(join(ROOT, "src/lib/modules/account/recurring-actions.ts"), "utf8");
  const sharedSrc = readFileSync(join(ROOT, "src/lib/modules/account/recurring-shared.ts"), "utf8");
  const pageSrc = readFileSync(join(ROOT, "src/lib/modules/account/recurring-page.tsx"), "utf8");

  assert("P0.1 recurring-actions.ts ไม่ import prisma ตรง ๆ (fitness F5 เต็มโควตา 45 ไฟล์)",
    !/from\s+["']@\/lib\/core\/db["']/.test(actionsSrc));
  assert("P0.2 recurring-shared.ts บริสุทธิ์ (ไม่แตะ prisma/next — ใช้ฝั่ง client ได้)",
    !/from\s+["']@\/lib\/core\/db["']/.test(sharedSrc) && !/from\s+["']next\//.test(sharedSrc));
  assert("P0.3 recurring-page.tsx ไม่ import prisma ตรง ๆ", !/from\s+["']@\/lib\/core\/db["']/.test(pageSrc));

  for (const [fn, action] of [
    ["saveRecurringRuleAction", "account.doc.create"],
    ["toggleRecurringRuleAction", "account.doc.create"],
    ["runRecurringNowAction", "account.doc.create"],
    ["runRemindersNowAction", "account.payment.record"],
    ["sendPaymentReminderAction", "account.payment.record"],
  ] as const) {
    const seg = actionsSrc.split(`export async function ${fn}`)[1]?.split("\nexport ")[0] ?? "";
    assert(`P0.4 ${fn} ผ่าน loadAccountSystem + assertAccountCan("${action}")`,
      /loadAccountSystem\(/.test(seg) && seg.includes(`assertAccountCan(auth, "${action}")`),
      "ไม่พบด่านสิทธิ์ในตัว action");
  }
  assert("P0.5 sendPaymentReminderAction กัน open redirect (ปลายทางต้องขึ้นต้น /app/)",
    /startsWith\("\/app\/"\)/.test(actionsSrc));

  const { ACCOUNT_PAGE_PERMISSIONS } = await import("@/lib/modules/account/guard");
  const { PERMISSION_KEYS } = await import("@/lib/core/permissions");
  for (const [rel, action] of [
    ["recurring/page.tsx", "account.doc.view"],
    ["recurring/new/page.tsx", "account.doc.create"],
    ["recurring/[ruleId]/edit/page.tsx", "account.doc.create"],
  ] as const) {
    eq(`P0.6 ทะเบียนสิทธิ์ ${rel} = ${action}`, ACCOUNT_PAGE_PERMISSIONS[rel], action);
    const p = join(ROOT, "src/app/app/sys/[id]/account", rel);
    assert(`P0.7 ไฟล์ route ${rel} มีจริงและบังคับ action ในไฟล์`,
      existsSync(p) && readFileSync(p, "utf8").includes(`"${action}"`));
    assert(`P0.8 action ของ ${rel} มีอยู่จริงใน permissions.ts`, PERMISSION_KEYS.has(action));
  }

  const { ACCOUNT_NAV } = await import("@/lib/modules/account/nav");
  const nav = ACCOUNT_NAV("/app/sys/TEST/account", true);
  const byTestId = (id: string) => nav.flatMap((g) => g.items).find((i) => i.testId === id);
  for (const id of ["REVENUE_RECURRING", "EXPENSE_RECURRING"]) {
    const it = byTestId(id);
    assert(`P0.9 nav ${id} เป็น "ready" + ป้ายไทย "เอกสารประจำ"`,
      !!it && it.status === "ready" && it.label === "เอกสารประจำ", it ? `status=${it.status} label=${it.label}` : "ไม่พบ");
    eq(`P0.10 nav ${id} href ชี้ /recurring`, it?.href, "/app/sys/TEST/account/recurring");
  }

  const scopeSrc = readFileSync(join(ROOT, "src/lib/core/scope.ts"), "utf8");
  assert("P0.11 scope.ts ลงทะเบียน AccountRecurringRule เป็นแกน system", /AccountRecurringRule:\s*sys\(\)/.test(scopeSrc));
  assert("P0.12 scope.ts ลงทะเบียน AccountRecurringRun เป็นแกน system", /AccountRecurringRun:\s*sys\(\)/.test(scopeSrc));

  for (const rel of ["src/app/api/cron/account/recurring/route.ts", "src/app/api/cron/account/reminders/route.ts"]) {
    const p = join(ROOT, rel);
    const src = existsSync(p) ? readFileSync(p, "utf8") : "";
    assert(`P0.13 ${rel} มีจริง + กันด้วย isCronAuthorized + รองรับ POST`,
      src.includes("isCronAuthorized(req)") && /export async function POST/.test(src),
      existsSync(p) ? "ขาดด่าน/POST" : "ไม่พบไฟล์");
  }
  assert("P0.14 scripts/acc-v2-cron-recurring.mts มีจริง (ตัวห่อสำหรับ cron บน VPS)",
    existsSync(join(ROOT, "scripts/acc-v2-cron-recurring.mts")));

  const detailSrc = readFileSync(join(ROOT, "src/components/account-v2/DocDetailPage.tsx"), "utf8");
  assert("P0.15 ⋯ ของหน้าเอกสารเดินสาย sendPaymentReminderAction จริง (ไม่ใช่ป้าย 'เร็ว ๆ นี้' แล้ว)",
    detailSrc.includes("sendPaymentReminderAction") && !/soon\("เตือนชำระ"\)/.test(detailSrc));
  assert('P0.16 ⋯ มี "ตั้งเป็นเอกสารประจำ" ชี้ /recurring/new?from=', detailSrc.includes("recurring/new?from="));
}

// ═══════════════════════ P1 — คณิตความถี่ (บริสุทธิ์) ═══════════════════════
console.log("\nP1 คณิตความถี่ (ไม่แตะ DB):");
const RS = await import("@/lib/modules/account/recurring-shared");
{
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
  const iso = (x: Date) => x.toISOString().slice(0, 10);

  eq("P1.1 งวดแรก MONTHLY วันที่ 1 · เริ่ม 15 ม.ค. → 1 ก.พ.",
    iso(RS.firstRunAt({ frequency: "MONTHLY", dayOfMonth: 1, startDate: d("2026-01-15") })), "2026-02-01");
  eq("P1.2 งวดแรก MONTHLY วันที่ 1 · เริ่ม 1 ม.ค. → 1 ม.ค. (วันเริ่มตรงพอดี ไม่ข้ามงวด)",
    iso(RS.firstRunAt({ frequency: "MONTHLY", dayOfMonth: 1, startDate: d("2026-01-01") })), "2026-01-01");
  eq("P1.3 งวดแรก MONTHLY วันที่ 31 · เริ่ม 1 ก.พ. 2026 → 28 ก.พ. (หดให้พอดีเดือน)",
    iso(RS.firstRunAt({ frequency: "MONTHLY", dayOfMonth: 31, startDate: d("2026-02-01") })), "2026-02-28");

  const spec31 = { frequency: "MONTHLY" as const, dayOfMonth: 31, startDate: d("2026-01-31") };
  eq("P1.4 เลื่อนงวด 31 ม.ค. → 28 ก.พ. 2026 (ปีปกติ)", iso(RS.nextRunAfter(spec31, d("2026-01-31"))), "2026-02-28");
  eq("P1.5 เลื่อนงวด 28 ก.พ. → 31 มี.ค. (แองเคอร์ยังเป็น 31 ไม่เพี้ยนสะสม)",
    iso(RS.nextRunAfter(spec31, d("2026-02-28"))), "2026-03-31");
  eq("P1.6 เลื่อนงวด 31 ม.ค. 2028 → 29 ก.พ. (ปีอธิกสุรทิน)",
    iso(RS.nextRunAfter({ frequency: "MONTHLY", dayOfMonth: 31, startDate: d("2028-01-31") }, d("2028-01-31"))), "2028-02-29");
  eq("P1.7 เลื่อนงวด 30 เม.ย. → 31 พ.ค.",
    iso(RS.nextRunAfter({ frequency: "MONTHLY", dayOfMonth: 31, startDate: d("2026-01-31") }, d("2026-04-30"))), "2026-05-31");
  eq("P1.8 QUARTERLY เลื่อน 3 เดือน",
    iso(RS.nextRunAfter({ frequency: "QUARTERLY", dayOfMonth: 15, startDate: d("2026-01-15") }, d("2026-01-15"))), "2026-04-15");
  eq("P1.9 YEARLY เลื่อน 12 เดือน",
    iso(RS.nextRunAfter({ frequency: "YEARLY", dayOfMonth: 15, startDate: d("2026-01-15") }, d("2026-01-15"))), "2027-01-15");
  eq("P1.10 WEEKLY เลื่อน 7 วัน",
    iso(RS.nextRunAfter({ frequency: "WEEKLY", weekday: 1, startDate: d("2026-09-07") }, d("2026-09-07"))), "2026-09-14");
  // 2026-09-07 = วันจันทร์ · ขอวันพุธ (3) → 2026-09-09
  eq("P1.11 งวดแรก WEEKLY วันพุธ · เริ่มวันจันทร์ 7 ก.ย. → 9 ก.ย.",
    iso(RS.firstRunAt({ frequency: "WEEKLY", weekday: 3, startDate: d("2026-09-07") })), "2026-09-09");
  eq("P1.12 งวดแรก WEEKLY ตรงวันเริ่มพอดี → วันเริ่มเลย",
    iso(RS.firstRunAt({ frequency: "WEEKLY", weekday: 1, startDate: d("2026-09-07") })), "2026-09-07");

  eq("P1.13 periodKey MONTHLY", RS.periodKeyOf("MONTHLY", d("2026-09-30")), "2026-09");
  eq("P1.14 periodKey QUARTERLY", RS.periodKeyOf("QUARTERLY", d("2026-09-30")), "2026-Q3");
  eq("P1.15 periodKey YEARLY", RS.periodKeyOf("YEARLY", d("2026-09-30")), "2026");
  eq("P1.16 periodKey WEEKLY = วันที่นัด", RS.periodKeyOf("WEEKLY", d("2026-09-30")), "2026-09-30");

  eq("P1.17 ป้ายตารางเวลา MONTHLY เป็นภาษาคน",
    RS.scheduleLabel({ frequency: "MONTHLY", dayOfMonth: 5, startDate: d("2026-09-05") }), "ทุกเดือน วันที่ 5");
  eq("P1.18 ป้ายตารางเวลา WEEKLY เป็นภาษาคน",
    RS.scheduleLabel({ frequency: "WEEKLY", weekday: 1, startDate: d("2026-09-07") }), "ทุกสัปดาห์ วันจันทร์");

  const tpl = RS.parseRecurringTemplate({ lines: [{ name: "ค่าเช่า", qty: "2", unitPriceSatang: 100000.4, vatRateBp: 999 }], dueDays: "15" });
  eq("P1.19 แม่แบบ: ราคาเป็นสตางค์จำนวนเต็มเสมอ", tpl.lines[0]?.unitPriceSatang, 100000);
  eq("P1.20 แม่แบบ: อัตรา VAT นอกชุดที่รู้จัก → 700", tpl.lines[0]?.vatRateBp, 700);
  eq("P1.21 แม่แบบ: dueDays แปลงเป็นตัวเลข", tpl.dueDays, 15);
  eq("P1.22 แม่แบบ: JSON เพี้ยนไม่ throw (คืนแม่แบบเปล่า)", RS.parseRecurringTemplate("ขยะ").lines.length, 0);
  assert("P1.23 ไม่เลือกผู้ติดต่อ → ออกอัตโนมัติไม่ได้ พร้อมเหตุผลไทย",
    (RS.autoApproveBlockReason({ contactId: null, template: tpl }) ?? "").includes("ผู้ติดต่อ"));
  eq("P1.24 ข้อมูลครบ → ไม่มีเหตุขวางการออกอัตโนมัติ",
    RS.autoApproveBlockReason({ contactId: "c1", template: tpl }), null);
  assert("P1.25 validateRuleInput จับ 'ไม่มีรายการ'",
    RS.validateRuleInput({ name: "x", docType: "INVOICE", frequency: "MONTHLY", startDate: d("2026-09-01"), endDate: null, template: RS.parseRecurringTemplate({}), leadDays: 0 })
      .some((e) => e.includes("อย่างน้อย 1 รายการ")));
  assert("P1.26 validateRuleInput จับ 'วันสิ้นสุดก่อนวันเริ่ม'",
    RS.validateRuleInput({ name: "x", docType: "INVOICE", frequency: "MONTHLY", startDate: d("2026-09-10"), endDate: d("2026-09-01"), template: tpl, leadDays: 0 })
      .some((e) => e.includes("วันที่สิ้นสุด")));
  assert("P1.27 ชนิดเอกสารนอกรายการทำเอกสารประจำไม่ได้", !RS.isRecurringDocType("RECEIPT"));
}

// ═══════════════════════ เตรียมข้อมูลจริง ═══════════════════════
const { prisma } = await import("@/lib/core/db");
const sysMod = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");
const access = await import("@/lib/modules/account/access");

const tag = "QCACC19-" + Date.now();
let tenantId = "";
const userIds: string[] = [];
const DAY = 86_400_000;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const lineTpl = (name: string, priceSatang: number, accountId: string | null = null) => ({
  name,
  description: "",
  qty: 1,
  unitName: "เดือน",
  unitPriceSatang: priceSatang,
  vatRateBp: 700,
  discountSatang: 0,
  productId: null,
  accountId,
});

try {
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag.toLowerCase() } });
  tenantId = t.id;
  const owner = await prisma.user.create({ data: { email: tag.toLowerCase() + "-owner@qc.local", name: "QC เจ้าของ" } });
  const staff = await prisma.user.create({ data: { email: tag.toLowerCase() + "-staff@qc.local", name: "QC พนักงาน" } });
  const finance = await prisma.user.create({ data: { email: tag.toLowerCase() + "-fin@qc.local", name: "QC การเงิน" } });
  userIds.push(owner.id, staff.id, finance.id);
  await prisma.membership.create({ data: { userId: owner.id, tenantId, role: "OWNER", unitAccess: ["*"] } });
  const mStaff = await prisma.membership.create({
    data: { userId: staff.id, tenantId, role: "STAFF", unitAccess: ["*"], permissions: {} },
    include: { tenant: true },
  });
  await prisma.membership.create({
    data: { userId: finance.id, tenantId, role: "STAFF", unitAccess: ["*"], permissions: { "account.payment.record": true } },
  });

  const s1 = await sysMod.createSystem(tenantId, "ACCOUNT", "บัญชี " + tag);
  const s2 = await sysMod.createSystem(tenantId, "ACCOUNT", "บัญชีอีกร้าน " + tag);
  const systemId = s1.id;
  const otherSystemId = s2.id;
  console.log(`\n[seed] tenant ${tenantId} · system ${systemId}\n`);

  await acc.saveSettings(tenantId, systemId, { orgName: "ร้าน QC 1.9", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE", defaultDueDays: 30 });
  await acc.saveSettings(tenantId, otherSystemId, { orgName: "อีกร้าน", vatRegistered: true, vatRateBp: 700 });
  await gl.ensureAccounting({ tenantId, systemId });
  await gl.ensureAccounting({ tenantId, systemId: otherSystemId });

  const cust = await acc.createContact({
    tenantId, systemId, kind: "CUSTOMER", legalType: "COMPANY",
    name: "บริษัท ลูกค้าประจำ จำกัด", email: "customer-1.9@qc.local",
  });
  const custNoEmail = await acc.createContact({
    tenantId, systemId, kind: "CUSTOMER", legalType: "PERSON", name: "คุณไม่มีอีเมล",
  });
  const vendor = await acc.createContact({
    tenantId, systemId, kind: "VENDOR", legalType: "COMPANY", name: "บริษัท ผู้ให้เช่า จำกัด",
  });
  const foreignContact = await acc.createContact({
    tenantId, systemId: otherSystemId, kind: "CUSTOMER", legalType: "COMPANY", name: "ลูกค้าของอีกร้าน",
  });
  const expAccounts = await (await import("@/lib/modules/account/expense")).listExpenseAccounts(systemId);
  const expAccountId = expAccounts[0]?.id ?? null;

  // ═════════ P2 — CRUD + สโคป + สิทธิ์ ═════════
  console.log("P2 กฎเอกสารประจำ (CRUD · สโคป · สิทธิ์):");
  const baseRule = {
    name: "ค่าเช่าสำนักงาน รายเดือน",
    docType: "INVOICE" as const,
    contactId: cust.id,
    template: RS.parseRecurringTemplate({ priceMode: "EXCL_VAT", lines: [lineTpl("ค่าเช่าสำนักงาน", 1_000_000)], dueDays: 7 }),
    frequency: "MONTHLY" as const,
    dayOfMonth: 1,
    weekday: null,
    startDate: d("2026-01-01"),
    endDate: null,
    leadDays: 0,
    autoApprove: false,
    active: true,
  };
  const created = await acc.createRecurringRule(tenantId, systemId, baseRule, owner.id);
  assert("P2.1 สร้างกฎสำเร็จ", created.ok, created.ok ? "" : created.reason);
  const ruleId = created.ok ? created.id : "";
  const rule1 = await acc.getRecurringRule(tenantId, systemId, ruleId);
  eq("P2.2 อ่านกฎกลับมาได้ · ชื่อตรง", rule1?.name, "ค่าเช่าสำนักงาน รายเดือน");
  eq("P2.3 nextRunAt = งวดแรกที่คำนวณให้เอง (1 ม.ค. 2026)", rule1 ? RS.ymd(rule1.nextRunAt) : "", "2026-01-01");
  eq("P2.4 แม่แบบถูกเก็บครบ 1 บรรทัด", rule1?.template.lines.length, 1);
  eq("P2.5 ผู้ติดต่อผูกถูกราย", rule1?.contactName, "บริษัท ลูกค้าประจำ จำกัด");

  const badType = await acc.createRecurringRule(tenantId, systemId, { ...baseRule, docType: "RECEIPT" as never }, owner.id);
  assert("P2.6 ชนิดเอกสารที่ไม่รองรับถูกปฏิเสธพร้อมเหตุผลไทย",
    !badType.ok && badType.reason.includes("ตั้งเป็นเอกสารประจำไม่ได้"), badType.ok ? "ผ่านไปได้" : badType.reason);
  const noLines = await acc.createRecurringRule(tenantId, systemId, { ...baseRule, template: RS.parseRecurringTemplate({}) }, owner.id);
  assert("P2.7 แม่แบบไม่มีรายการถูกปฏิเสธ", !noLines.ok && noLines.reason.includes("อย่างน้อย 1 รายการ"));

  const crossContact = await acc.createRecurringRule(tenantId, systemId, { ...baseRule, name: "ข้ามระบบ", contactId: foreignContact.id }, owner.id);
  const crossRule = crossContact.ok ? await acc.getRecurringRule(tenantId, systemId, crossContact.id) : null;
  eq("P2.8 ผู้ติดต่อของอีกระบบถูกตัดทิ้ง (กัน IDOR) → contactId = null", crossRule?.contactId, null);
  // ปิดกฎทดสอบตัวนี้ทันที — ชุด P3 นับ "จำนวนเอกสารที่ตัวสร้างทำ" แบบเป๊ะ กฎค้างจะทำให้ตัวเลขเพี้ยน
  if (crossContact.ok) await acc.setRecurringRuleActive(tenantId, systemId, crossContact.id, false);

  eq("P2.9 ระบบอื่นมองไม่เห็นกฎของระบบนี้", await acc.getRecurringRule(tenantId, otherSystemId, ruleId), null);
  eq("P2.10 รายการกฎของอีกระบบว่างเปล่า", (await acc.listRecurringRules(tenantId, otherSystemId)).length, 0);

  const upd = await acc.updateRecurringRule(tenantId, systemId, ruleId, { ...baseRule, name: "ค่าเช่าสำนักงาน (แก้ชื่อ)", leadDays: 3 });
  assert("P2.11 แก้กฎสำเร็จ", upd.ok, upd.ok ? "" : upd.reason);
  const rule2 = await acc.getRecurringRule(tenantId, systemId, ruleId);
  eq("P2.12 ชื่อใหม่ถูกบันทึก", rule2?.name, "ค่าเช่าสำนักงาน (แก้ชื่อ)");
  eq("P2.13 ตารางเวลาไม่เปลี่ยน → nextRunAt คงเดิม (ไม่ทำงวดหาย/ซ้ำ)", rule2 ? RS.ymd(rule2.nextRunAt) : "", "2026-01-01");
  const updSched = await acc.updateRecurringRule(tenantId, systemId, ruleId, { ...baseRule, dayOfMonth: 15, leadDays: 3 });
  assert("P2.14 แก้ตารางเวลาสำเร็จ", updSched.ok);
  const rule3 = await acc.getRecurringRule(tenantId, systemId, ruleId);
  eq("P2.15 เปลี่ยนวันที่ของเดือน → คิด nextRunAt ใหม่ (15 ม.ค. 2026)", rule3 ? RS.ymd(rule3.nextRunAt) : "", "2026-01-15");

  const offRes = await acc.setRecurringRuleActive(tenantId, systemId, ruleId, false);
  assert("P2.16 ปิดกฎสำเร็จ", offRes.ok);
  eq("P2.17 สถานะกลายเป็นหยุดชั่วคราว", (await acc.getRecurringRule(tenantId, systemId, ruleId))?.active, false);
  const offCross = await acc.setRecurringRuleActive(tenantId, otherSystemId, ruleId, false);
  assert("P2.18 ปิดกฎข้ามระบบไม่ได้", !offCross.ok);

  let staffBlocked = false;
  try {
    access.assertAccountCan({ user: { id: staff.id }, active: mStaff }, "account.doc.create");
  } catch {
    staffBlocked = true;
  }
  assert("P2.19 พนักงานที่ไม่มี account.doc.create ถูกปฏิเสธ (ด่านเดียวกับที่ action เรียก)", staffBlocked);
  assert("P2.20 พนักงานคนเดียวกันก็ไม่มี account.payment.record",
    !access.accountCan({ user: { id: staff.id }, active: mStaff }, "account.payment.record"));

  // ═════════ P3 — ตัวสร้างเอกสาร ═════════
  console.log("\nP3 ตัวสร้างเอกสารประจำ:");
  const now = new Date(); // ใช้เวลาจริง (แจ้งเตือนกันซ้ำเทียบกับ createdAt จริง — ห้ามใช้วันในอนาคต)

  // กฎ A: รายเดือน ยังไม่ถึงรอบตอนแรก (nextRunAt ในอดีต ⇒ ถึงรอบทันที)
  const ruleARes = await acc.createRecurringRule(tenantId, systemId, {
    ...baseRule, name: "ใบแจ้งหนี้ค่าบริการรายเดือน", startDate: d("2026-01-31"), dayOfMonth: 31,
  }, owner.id);
  const ruleAId = ruleARes.ok ? ruleARes.id : "";
  const runA1 = await acc.runRecurringRules(now, { tenantId, systemId });
  assert("P3.1 รอบแรกสร้างเอกสารอย่างน้อย 1 ใบ", runA1.created >= 1, JSON.stringify(runA1));
  const docsA1 = await prisma.accountDocument.findMany({ where: { tenantId, systemId, source: "RECURRING" } });
  eq("P3.2 เอกสารที่สร้าง = 1 ใบ (กฎอื่นถูกปิด/ยังไม่ถึงรอบ)", docsA1.length, 1);
  eq("P3.3 เอกสารมีที่มา = RECURRING", docsA1[0]?.source, "RECURRING");
  assert("P3.4 เอกสารติดแท็ก 'ประจำ'", (docsA1[0]?.tags ?? []).includes("ประจำ"));
  eq("P3.5 อ้างอิงบนเอกสาร = ชื่อกฎ", docsA1[0]?.reference, "ใบแจ้งหนี้ค่าบริการรายเดือน");
  eq("P3.6 สถานะเป็นร่าง (ยังไม่เปิด autoApprove)", docsA1[0]?.status, "DRAFT");
  eq("P3.7 วันที่ออก = วันที่นัด ไม่ใช่วันที่รัน", docsA1[0] ? RS.ymd(docsA1[0].issueDate) : "", "2026-01-31");
  eq("P3.8 ครบกำหนด = วันที่ออก + dueDays(7)", docsA1[0] ? RS.ymd(docsA1[0].dueDate as Date) : "", "2026-02-07");
  eq("P3.9 ยอดสุทธิ = 10,000 + VAT 7% = 10,700.00 บาท", docsA1[0]?.grandTotal, 1_070_000);

  const ruleAafter1 = await acc.getRecurringRule(tenantId, systemId, ruleAId);
  eq("P3.10 nextRunAt เลื่อนเป็น 28 ก.พ. 2026 (31 → สิ้นเดือน)", ruleAafter1 ? RS.ymd(ruleAafter1.nextRunAt) : "", "2026-02-28");
  assert("P3.11 lastRunAt ถูกบันทึก", !!ruleAafter1?.lastRunAt);
  eq("P3.12 บันทึกประวัติงวดไว้ 1 แถว", ruleAafter1?.runCount, 1);
  const run1Rows = await prisma.accountRecurringRun.findMany({ where: { ruleId: ruleAId } });
  eq("P3.13 กุญแจงวดของแถวประวัติ = 2026-01", run1Rows[0]?.periodKey, "2026-01");

  // กฎที่เริ่มย้อนหลัง: ไล่ **ทีละงวดต่อ 1 รอบ cron** (ไม่ถล่มออกทีเดียว 8 ใบ)
  const runA2 = await acc.runRecurringRules(now, { tenantId, systemId });
  eq("P3.14 กฎที่เริ่มย้อนหลังไล่ทีละงวด: รอบถัดมาได้งวด ก.พ. อีก 1 ใบ (ไม่ถล่มทีเดียว)", runA2.created, 1);
  const ruleAafter2 = await acc.getRecurringRule(tenantId, systemId, ruleAId);
  eq("P3.15 nextRunAt เลื่อนเป็น 31 มี.ค. (แองเคอร์ 31 กลับมา ไม่ค้างที่ 28)",
    ruleAafter2 ? RS.ymd(ruleAafter2.nextRunAt) : "", "2026-03-31");

  // 🔴 หัวใจของ WO: ย้อน nextRunAt กลับไปงวดที่ทำไปแล้ว แล้วยิงซ้ำ → ต้อง "ข้าม" ไม่ใช่สร้างซ้ำ
  const docsBeforeReplay = await prisma.accountRecurringRun.count({ where: { ruleId: ruleAId } });
  await prisma.accountRecurringRule.update({ where: { id: ruleAId }, data: { nextRunAt: d("2026-01-31") } });
  const runA3 = await acc.runRecurringRules(now, { tenantId, systemId });
  eq("P3.16 งวดเดิมถูกยิงซ้ำ → ข้าม (unique(ruleId, periodKey) เป็นคนตัดสิน ไม่ใช่ตรรกะในโค้ด)", runA3.skipped, 1);
  eq("P3.17 งวดเดิมถูกยิงซ้ำ → ไม่สร้างเอกสารเพิ่ม", runA3.created, 0);
  eq("P3.18 จำนวนงวดที่บันทึกไว้เท่าเดิม (รัน 2 ครั้ง = 1 ใบต่อ 1 งวด)",
    await prisma.accountRecurringRun.count({ where: { ruleId: ruleAId } }), docsBeforeReplay);
  const ruleAafter3 = await acc.getRecurringRule(tenantId, systemId, ruleAId);
  eq("P3.19 ถึงจะข้าม ก็ยังเลื่อนงวดต่อ (ไม่ค้างอยู่งวดเดิมตลอดกาล)",
    ruleAafter3 ? RS.ymd(ruleAafter3.nextRunAt) : "", "2026-02-28");

  // งวดที่ยังมาไม่ถึง (อนาคต) ต้องไม่ถูกสร้างล่วงหน้าเมื่อ leadDays = 0
  await prisma.accountRecurringRule.update({
    where: { id: ruleAId },
    data: { nextRunAt: new Date(now.getTime() + 30 * DAY) },
  });
  const runA4 = await acc.runRecurringRules(now, { tenantId, systemId });
  eq("P3.20 งวดในอนาคต + leadDays 0 → ไม่สร้างล่วงหน้า", runA4.created, 0);
  await acc.setRecurringRuleActive(tenantId, systemId, ruleAId, false); // ปิดไม่ให้รบกวนชุดถัดไป

  // กฎ B: endDate หยุดกฎ
  const ruleBRes = await acc.createRecurringRule(tenantId, systemId, {
    ...baseRule, name: "สัญญาสิ้นสุดสิ้นเดือน", startDate: d("2026-02-01"), dayOfMonth: 1, endDate: d("2026-02-15"),
  }, owner.id);
  const ruleBId = ruleBRes.ok ? ruleBRes.id : "";
  const runB = await acc.runRecurringRules(now, { tenantId, systemId });
  eq("P3.21 กฎที่มีวันสิ้นสุด: งวดในช่วงยังสร้างได้", runB.created, 1);
  const ruleBAfter = await acc.getRecurringRule(tenantId, systemId, ruleBId);
  eq("P3.22 งวดถัดไปเลย endDate → ปิดกฎอัตโนมัติ", ruleBAfter?.active, false);
  const runB2 = await acc.runRecurringRules(now, { tenantId, systemId });
  eq("P3.23 กฎที่ปิดแล้วไม่ถูกหยิบมาทำอีก", runB2.created, 0);

  // กฎ C: autoApprove + ข้อมูลครบ → ออกเอกสารจริง + JV สมดุล
  const ruleCRes = await acc.createRecurringRule(tenantId, systemId, {
    ...baseRule, name: "ค่าบริการรายเดือน (ออกอัตโนมัติ)", startDate: d("2026-03-01"), dayOfMonth: 1, autoApprove: true,
  }, owner.id);
  const ruleCId = ruleCRes.ok ? ruleCRes.id : "";
  const runC = await acc.runRecurringRules(now, { tenantId, systemId });
  eq("P3.24 autoApprove: ออกเอกสารให้ 1 ใบ", runC.issued, 1);
  const runRowC = await prisma.accountRecurringRun.findFirst({ where: { ruleId: ruleCId } });
  const docC = runRowC ? await prisma.accountDocument.findUnique({ where: { id: runRowC.documentId } }) : null;
  assert("P3.25 เอกสารที่ออกอัตโนมัติมีเลขที่จริง", !!docC?.docNo, `docNo=${docC?.docNo}`);
  assert("P3.26 สถานะพ้นร่างแล้ว (รอชำระ)", docC?.status === "AWAITING_PAYMENT", `status=${docC?.status}`);
  const jvC = await prisma.accountJournalEntry.findMany({
    where: { systemId, refType: "AccountDocument", refId: docC?.id ?? "" },
    include: { lines: true },
  });
  assert("P3.27 มีสมุดรายวันของเอกสารที่ออกอัตโนมัติ", jvC.length >= 1);
  const jvBalanced = jvC.every((e) => e.lines.reduce((s, l) => s + l.debit, 0) === e.lines.reduce((s, l) => s + l.credit, 0));
  assert("P3.28 สมุดรายวันสมดุล (Dr = Cr)", jvBalanced);
  await acc.setRecurringRuleActive(tenantId, systemId, ruleCId, false);

  // กฎ D: autoApprove แต่ไม่มีผู้ติดต่อ → คงเป็นร่าง + แจ้งเตือนพร้อมเหตุผล
  const ruleDRes = await acc.createRecurringRule(tenantId, systemId, {
    ...baseRule, name: "แม่แบบข้อมูลไม่ครบ", contactId: null, startDate: d("2026-04-01"), dayOfMonth: 1, autoApprove: true,
  }, owner.id);
  const ruleDId = ruleDRes.ok ? ruleDRes.id : "";
  const runD = await acc.runRecurringRules(now, { tenantId, systemId });
  eq("P3.29 ข้อมูลไม่ครบ: ยังสร้างร่างให้ (ไม่เงียบหาย)", runD.created, 1);
  eq("P3.30 ข้อมูลไม่ครบ: ไม่ออกเอกสารจริง", runD.issued, 0);
  const runRowD = await prisma.accountRecurringRun.findFirst({ where: { ruleId: ruleDId } });
  const docD = runRowD ? await prisma.accountDocument.findUnique({ where: { id: runRowD.documentId } }) : null;
  eq("P3.31 เอกสารคงสถานะร่าง", docD?.status, "DRAFT");
  const notiD = await prisma.appNotification.findMany({ where: { tenantId, title: "เอกสารประจำรอตรวจ" } });
  assert("P3.32 มีแจ้งเตือน 'เอกสารประจำรอตรวจ' พร้อมเหตุผลไทย",
    notiD.length >= 1 && notiD[0].body.includes("ผู้ติดต่อ"), notiD[0]?.body ?? "ไม่มีแจ้งเตือน");
  assert("P3.33 แจ้งเตือนจ่าหน้าถึงผู้รับรายคน (G11) ไม่ใช่ประกาศทั้งร้าน", notiD.every((n) => n.recipientUserId !== null));
  await acc.setRecurringRuleActive(tenantId, systemId, ruleDId, false);

  // กฎ E: ฝั่งรายจ่าย
  const ruleERes = await acc.createRecurringRule(tenantId, systemId, {
    ...baseRule,
    name: "ค่าเช่าออฟฟิศ (รายจ่าย)",
    docType: "EXPENSE",
    contactId: vendor.id,
    template: RS.parseRecurringTemplate({ priceMode: "EXCL_VAT", lines: [lineTpl("ค่าเช่าออฟฟิศ", 500_000, expAccountId)], dueDays: 30 }),
    startDate: d("2026-05-01"),
    dayOfMonth: 1,
  }, owner.id);
  const ruleEId = ruleERes.ok ? ruleERes.id : "";
  const runE = await acc.runRecurringRules(now, { tenantId, systemId });
  eq("P3.34 ฝั่งรายจ่ายก็สร้างได้", runE.created, 1);
  const runRowE = await prisma.accountRecurringRun.findFirst({ where: { ruleId: ruleEId } });
  const docE = runRowE ? await prisma.accountDocument.findUnique({ where: { id: runRowE.documentId } }) : null;
  eq("P3.35 เอกสารรายจ่ายมีทิศทาง IN", docE?.direction, "IN");
  eq("P3.36 ยอดสุทธิรายจ่าย = 5,000 + VAT 7% = 5,350.00 บาท", docE?.grandTotal, 535_000);
  await acc.setRecurringRuleActive(tenantId, systemId, ruleEId, false);

  // กฎ F: สร้างล่วงหน้า n วัน (งวดยังไม่ถึงแต่ leadDays ครอบถึง)
  const soonDay = new Date(acc.bkkTodayUtcMidnight(now).getTime() + 3 * DAY);
  const ruleFRes = await acc.createRecurringRule(tenantId, systemId, {
    ...baseRule, name: "สร้างล่วงหน้า 5 วัน", startDate: soonDay, dayOfMonth: soonDay.getUTCDate(), leadDays: 5,
  }, owner.id);
  const ruleFId = ruleFRes.ok ? ruleFRes.id : "";
  const runF = await acc.runRecurringRules(now, { tenantId, systemId });
  eq("P3.37 leadDays: งวดที่จะถึงในอีก 3 วัน ถูกสร้างล่วงหน้าแล้ว", runF.created, 1);
  const runRowF = await prisma.accountRecurringRun.findFirst({ where: { ruleId: ruleFId } });
  eq("P3.38 กุญแจงวดคิดจาก 'วันที่นัด' ไม่ใช่วันที่รัน",
    runRowF?.periodKey, RS.periodKeyOf("MONTHLY", soonDay));
  await acc.setRecurringRuleActive(tenantId, systemId, ruleFId, false);

  const crossDocs = await prisma.accountDocument.count({ where: { tenantId, systemId: otherSystemId } });
  eq("P3.39 ไม่มีเอกสารรั่วไปอีกระบบ", crossDocs, 0);

  // ═════════ P4 — ตัวเตือนรายวัน ═════════
  console.log("\nP4 ตัวเตือนอัตโนมัติรายวัน:");
  const today = acc.bkkTodayUtcMidnight(now);
  const tomorrow = new Date(today.getTime() + DAY);
  const yesterday = new Date(today.getTime() - DAY);

  const ivDueTomorrow = await acc.createDocument({
    tenantId, systemId, docType: "INVOICE", contactId: cust.id,
    issueDate: today, dueDate: tomorrow, vatMode: "EXCLUDE",
    lines: [{ description: "งานบริการ ก.", qty: 1, unitPrice: 200_000, vatRateBp: 700 }],
  });
  const issTomorrow = await acc.issueDocument(tenantId, systemId, ivDueTomorrow.id);
  assert("P4.1 ออกใบแจ้งหนี้ครบกำหนดพรุ่งนี้สำเร็จ", issTomorrow.ok, issTomorrow.ok ? "" : issTomorrow.reason);

  const ivOverdue = await acc.createDocument({
    tenantId, systemId, docType: "INVOICE", contactId: cust.id,
    issueDate: new Date(today.getTime() - 10 * DAY), dueDate: yesterday, vatMode: "EXCLUDE",
    lines: [{ description: "งานบริการ ข.", qty: 1, unitPrice: 300_000, vatRateBp: 700 }],
  });
  const issOverdue = await acc.issueDocument(tenantId, systemId, ivOverdue.id);
  assert("P4.2 ออกใบแจ้งหนี้ที่พ้นกำหนดวันแรกสำเร็จ", issOverdue.ok, issOverdue.ok ? "" : issOverdue.reason);

  // PTX รอรับ 8 วัน + เช็คถึงกำหนดใน 2 วัน — สร้างเป็น fixture ตรง ๆ (ชุดนี้ทดสอบ "ตัวเตือน" ไม่ใช่ flow ของ PTX/เช็ค)
  await prisma.accountDocument.create({
    data: {
      tenantId, systemId, docType: "PURCHASE_TAX_INVOICE", docNo: "PTX-QC19-001", status: "AWAITING_RECEIVE",
      direction: "IN", issueDate: new Date(today.getTime() - 8 * DAY), contactId: vendor.id,
      subTotal: 100_000, vatAmount: 7_000, grandTotal: 107_000,
    },
  });
  await prisma.accountCheque.create({
    data: {
      tenantId, systemId, direction: "OUT", chequeNo: "CHQ-QC19-001", bankName: "ธนาคารกสิกรไทย",
      chequeDate: new Date(today.getTime() + 2 * DAY), amount: 250_000, status: "ISSUED",
    },
  });

  const rem1 = await acc.runAccountReminders(now, { tenantId, systemId });
  assert("P4.3 เตือน 'ครบกำหนดพรุ่งนี้' อย่างน้อย 1 รายการ", rem1.DUE_TOMORROW >= 1, JSON.stringify(rem1));
  assert("P4.4 เตือน 'พ้นกำหนดชำระแล้ว' อย่างน้อย 1 รายการ", rem1.OVERDUE_TODAY >= 1, JSON.stringify(rem1));
  assert("P4.5 เตือน 'ใบกำกับภาษีซื้อยังไม่ได้รับ' (เกิน 7 วัน)", rem1.PTX_AWAITING >= 1, JSON.stringify(rem1));
  assert("P4.6 เตือน 'เช็คถึงกำหนด' (ภายใน 3 วัน)", rem1.CHEQUE_DUE >= 1, JSON.stringify(rem1));

  const notiAll = await prisma.appNotification.findMany({ where: { tenantId } });
  const byTitle = (t: string) => notiAll.filter((n) => n.title === t);
  eq("P4.7 ผู้รับ = เจ้าของ + พนักงานการเงิน (2 คน) ต่อ 1 เรื่อง",
    new Set(byTitle("เช็คถึงกำหนด").map((n) => n.recipientUserId)).size, 2);
  assert("P4.8 พนักงานที่ไม่มีสิทธิ์รับ/จ่ายเงิน ไม่ได้รับแจ้งเตือนเลย",
    notiAll.every((n) => n.recipientUserId !== staff.id));
  assert("P4.9 ข้อความเตือนมีเลขที่เอกสารจริง (ไม่ใช่ข้อความลอย)",
    byTitle("ครบกำหนดพรุ่งนี้").some((n) => n.body.includes(issTomorrow.ok ? issTomorrow.docNo : "?")));
  assert("P4.10 ข้อความเตือนเป็นภาษาไทย ไม่มี enum ดิบ",
    byTitle("ครบกำหนดพรุ่งนี้").every((n) => !/AWAITING_PAYMENT|INVOICE|OVERDUE/.test(n.body)));

  const beforeSecond = notiAll.length;
  const rem2 = await acc.runAccountReminders(now, { tenantId, systemId });
  const totalNew = rem2.DUE_TOMORROW + rem2.OVERDUE_TODAY + rem2.PTX_AWAITING + rem2.CHEQUE_DUE + rem2.PP30_DUE;
  eq("P4.11 รันซ้ำวันเดียวกัน: ไม่มีแจ้งเตือนใหม่", totalNew, 0);
  eq("P4.12 จำนวนแถวแจ้งเตือนไม่เพิ่ม", await prisma.appNotification.count({ where: { tenantId } }), beforeSecond);

  // ภ.พ.30 — เตือนเฉพาะวันที่ 5 ของเดือน (5 วันก่อนกำหนดยื่นวันที่ 10)
  //
  // 🔴 ระเบิดเวลา (เจอจริง 5 ก.ย. 2026): `rem1` ข้างบนเรียกด้วย **เวลาจริง** — ถ้าวันไทยวันนี้เป็นวันที่ 5 พอดี
  //    ตัวเตือน ภ.พ.30 จะถูกยิงไปแล้วตั้งแต่ `rem1` แล้ว `dayFive` (วันเดียวกัน) จะโดน
  //    `notifyUsersOncePerDay` กันซ้ำ → คืน 0 ⇒ ข้อสอบแดงเดือนละครั้งโดยที่โค้ดไม่ได้พัง
  //    ⇒ วัดที่ "ยิงไปกี่ครั้งรวมทั้งสองรอบ" แทนที่จะผูกกับรอบใดรอบหนึ่ง (ผลเท่ากันทุกวันของเดือน)
  const dayFive = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 5, 5, 0, 0));
  const remPp30 = await acc.runAccountReminders(dayFive, { tenantId, systemId });
  const pp30Fired = rem1.PP30_DUE + remPp30.PP30_DUE;
  assert(
    "P4.13 วันที่ 5 ของเดือน มีเตือน ภ.พ.30 (นับรวมรอบที่เวลาจริงตรงวันที่ 5 อยู่แล้ว)",
    pp30Fired >= 1,
    `rem1=${rem1.PP30_DUE} · dayFive=${remPp30.PP30_DUE} · วันไทยวันนี้ ${now.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })}`,
  );
  // กันซ้ำ: ยิงรอบเดิมอีกครั้งในวันเดียวกัน ต้องไม่เพิ่มแถวแจ้งเตือน
  const pp30RowsBefore = await prisma.appNotification.count({ where: { tenantId, title: "ภ.พ.30 ใกล้ครบกำหนดยื่น" } });
  const remPp30Again = await acc.runAccountReminders(dayFive, { tenantId, systemId });
  eq("P4.13b ยิงซ้ำวันที่ 5 วันเดิม → ไม่เตือนซ้ำ", remPp30Again.PP30_DUE, 0);
  eq(
    "P4.13c จำนวนแถวเตือน ภ.พ.30 ไม่เพิ่ม",
    await prisma.appNotification.count({ where: { tenantId, title: "ภ.พ.30 ใกล้ครบกำหนดยื่น" } }),
    pp30RowsBefore,
  );
  const pp30 = await prisma.appNotification.findFirst({ where: { tenantId, title: "ภ.พ.30 ใกล้ครบกำหนดยื่น" } });
  assert("P4.14 ข้อความ ภ.พ.30 บอกงวดและวันครบกำหนด", !!pp30 && /งวด \d{4}-\d{2}/.test(pp30.body), pp30?.body ?? "ไม่มี");
  const dayEight = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 8, 5, 0, 0));
  const remNoPp30 = await acc.runAccountReminders(dayEight, { tenantId, systemId });
  eq("P4.15 วันอื่นไม่เตือน ภ.พ.30 ซ้ำ", remNoPp30.PP30_DUE, 0);

  // ═════════ P5 — เตือนชำระถึงลูกค้า ═════════
  console.log("\nP5 เตือนชำระถึงลูกค้า (⋯ บนหน้าเอกสาร):");
  const remindRes = await acc.sendPaymentReminder(tenantId, systemId, ivOverdue.id, {
    actorId: owner.id,
    origin: "https://shark.in.th",
  });
  assert("P5.1 ส่งเตือนชำระสำเร็จเมื่อผู้ติดต่อมีอีเมล", remindRes.ok, remindRes.ok ? "" : remindRes.reason);
  if (remindRes.ok) {
    eq("P5.2 ส่งไปที่อีเมลของผู้ติดต่อ", remindRes.email, "customer-1.9@qc.local");
    assert("P5.3 อีเมลแนบลิงก์สาธารณะ /r/<token>", (remindRes.link ?? "").startsWith("https://shark.in.th/r/"), remindRes.link ?? "ไม่มีลิงก์");
  }
  const auditRemind = await prisma.auditLog.findMany({ where: { tenantId, action: "account.doc.remind" } });
  eq("P5.4 บันทึก AuditLog การเตือนชำระ 1 แถว", auditRemind.length, 1);
  eq("P5.5 AuditLog ชี้เอกสารที่ถูกเตือน", auditRemind[0]?.targetId, ivOverdue.id);
  eq("P5.6 AuditLog บันทึกผู้กด", auditRemind[0]?.actorId, owner.id);

  const ivNoEmail = await acc.createDocument({
    tenantId, systemId, docType: "INVOICE", contactId: custNoEmail.id,
    issueDate: today, dueDate: new Date(today.getTime() + 5 * DAY), vatMode: "EXCLUDE",
    lines: [{ description: "งานบริการ ค.", qty: 1, unitPrice: 100_000, vatRateBp: 700 }],
  });
  await acc.issueDocument(tenantId, systemId, ivNoEmail.id);
  const remindNoEmail = await acc.sendPaymentReminder(tenantId, systemId, ivNoEmail.id, { origin: "https://shark.in.th" });
  assert("P5.7 ไม่มีอีเมล → ปฏิเสธพร้อมเหตุผลไทยที่บอกวิธีแก้",
    !remindNoEmail.ok && remindNoEmail.reason.includes("เพิ่มอีเมลในข้อมูลผู้ติดต่อ"),
    remindNoEmail.ok ? "ส่งไปได้ทั้งที่ไม่มีอีเมล" : remindNoEmail.reason);
  eq("P5.8 เหตุผลบนจอ (ปุ่มจาง) ตรงกับที่ server ตอบ",
    acc.paymentReminderBlockReason({ docType: "INVOICE", status: "AWAITING_PAYMENT", contactEmail: null }),
    remindNoEmail.ok ? null : remindNoEmail.reason);
  eq("P5.9 ใบเสนอราคาไม่มีการเตือนชำระ",
    acc.paymentReminderBlockReason({ docType: "QUOTATION", status: "AWAITING_ACCEPT", contactEmail: "a@b.c" }),
    "เอกสารชนิดนี้ไม่มีการเตือนชำระ");
  eq("P5.10 เอกสารที่ชำระครบแล้วเตือนไม่ได้",
    acc.paymentReminderBlockReason({ docType: "INVOICE", status: "PAID", contactEmail: "a@b.c" }),
    "เอกสารนี้ไม่มียอดค้างชำระ");
  const remindCross = await acc.sendPaymentReminder(tenantId, otherSystemId, ivOverdue.id, { origin: "https://shark.in.th" });
  assert("P5.11 เตือนชำระข้ามระบบไม่ได้ (สโคป)", !remindCross.ok && remindCross.reason === "ไม่พบเอกสาร");

  // ═════════ P6 — งานที่รอคุณ ═════════
  console.log("\nP6 การ์ด 'งานที่รอคุณ' (pendingTasks):");
  const qt = await acc.createDocument({
    tenantId, systemId, docType: "QUOTATION", contactId: cust.id, issueDate: today,
    validUntil: new Date(today.getTime() + 15 * DAY), vatMode: "EXCLUDE",
    lines: [{ description: "เสนอราคางาน ง.", qty: 1, unitPrice: 400_000, vatRateBp: 700 }],
  });
  await acc.issueDocument(tenantId, systemId, qt.id);

  const tasks = await acc.pendingTasks(tenantId, systemId);
  const expectQt = await prisma.accountDocument.count({ where: { tenantId, systemId, docType: "QUOTATION", status: "AWAITING_ACCEPT" } });
  const expectPo = await prisma.accountDocument.count({ where: { tenantId, systemId, docType: { in: ["PURCHASE_ORDER", "ASSET_PURCHASE_ORDER"] }, status: "AWAITING_APPROVAL" } });
  const expectDeposit = await prisma.accountDocument.count({ where: { tenantId, systemId, docType: { in: ["DEPOSIT_RECEIPT", "DEPOSIT_PAYMENT"] }, status: "AWAITING_DEDUCT" } });
  const expectReview = await prisma.accountJournalEntry.count({ where: { tenantId, systemId, needsReview: true } });
  const expectPtx = await prisma.accountDocument.count({ where: { tenantId, systemId, docType: "PURCHASE_TAX_INVOICE", status: "AWAITING_RECEIVE" } });
  const expectRecurringDrafts = await prisma.accountDocument.count({ where: { tenantId, systemId, source: "RECURRING", status: "DRAFT" } });

  eq("P6.1 ใบเสนอราคารอตอบรับ", tasks.quotationAwaitingAccept, expectQt);
  assert("P6.2 ใบเสนอราคารอตอบรับนับได้จริง (≥1)", tasks.quotationAwaitingAccept >= 1);
  eq("P6.3 PO รออนุมัติ", tasks.poAwaitingApproval, expectPo);
  eq("P6.4 มัดจำรอหัก", tasks.depositAwaitingDeduct, expectDeposit);
  eq("P6.5 รายการต้องตรวจ", tasks.needsReview, expectReview);
  eq("P6.6 ใบกำกับซื้อรอรับ", tasks.purchaseTaxAwaiting, expectPtx);
  assert("P6.7 ใบกำกับซื้อรอรับนับได้จริง (≥1)", tasks.purchaseTaxAwaiting >= 1);
  eq("P6.8 เอกสารประจำที่รอตรวจ", tasks.recurringDraftsAwaiting, expectRecurringDrafts);
  assert("P6.9 เอกสารประจำรอตรวจนับได้จริง (≥1)", tasks.recurringDraftsAwaiting >= 1);
  eq("P6.10 ผลรวมเท่ากับผลบวกทุกช่อง",
    tasks.total,
    expectQt + expectPo + expectDeposit + expectReview + expectPtx + expectRecurringDrafts);
  const tasksOther = await acc.pendingTasks(tenantId, otherSystemId);
  eq("P6.11 อีกระบบในร้านเดียวกันต้องเป็น 0 (สโคปต่อระบบ)", tasksOther.total, 0);

  // ═════════ P7 — ป้ายไทยล้วน ═════════
  console.log("\nP7 ป้ายไทยล้วน:");
  const thaiOnly = (s: string) => !/[A-Za-z]/.test(s);
  assert("P7.1 ป้ายความถี่ทุกตัวเป็นไทย", Object.values(RS.FREQUENCY_LABEL).every(thaiOnly), JSON.stringify(RS.FREQUENCY_LABEL));
  assert("P7.2 ป้ายชนิดเอกสารประจำทุกตัวเป็นไทย", Object.values(RS.RECURRING_DOC_LABEL).every(thaiOnly));
  assert("P7.3 ชื่อวันในสัปดาห์เป็นไทยครบ 7 วัน", RS.WEEKDAY_LABEL.length === 7 && RS.WEEKDAY_LABEL.every(thaiOnly));
  assert("P7.4 หัวข้อแจ้งเตือนทุกชนิดเป็นไทย (ยกเว้นชื่อแบบฟอร์มภาษี ภ.พ.30)",
    Object.values(acc.REMINDER_TITLE).every(thaiOnly), JSON.stringify(acc.REMINDER_TITLE));
  assert("P7.5 ทุกแจ้งเตือนที่ระบบเขียนในชุดนี้ ไม่มีชื่อ enum ดิบหลุด",
    (await prisma.appNotification.findMany({ where: { tenantId } })).every(
      (n) => !/DRAFT|AWAITING_|PURCHASE_TAX_INVOICE|RECURRING/.test(n.title + " " + n.body),
    ));

  // ═════════ ตรวจรวม ═════════
  console.log("\nP8 ตรวจรวมทั้ง tenant:");
  const allEntries = (await prisma.accountJournalEntry.findMany({ where: { tenantId }, include: { lines: true } })) as {
    lines: { debit: number; credit: number }[];
  }[];
  const unbalanced = allEntries.filter(
    (e) => e.lines.reduce((s, l) => s + l.debit, 0) !== e.lines.reduce((s, l) => s + l.credit, 0),
  );
  eq("P8.1 ทุกชุดสมุดรายวันของ tenant นี้สมดุล", unbalanced.length, 0);
  const suspense = await prisma.accountJournalLine.findMany({ where: { tenantId, account: { code: "9999" } } });
  eq("P8.2 ไม่มีรายการตกบัญชีพัก 9999", suspense.length, 0);
  const runs = await prisma.accountRecurringRun.findMany({ where: { tenantId } });
  const dupKey = new Set(runs.map((r) => `${r.ruleId}|${r.periodKey}`));
  eq("P8.3 ไม่มีประวัติงวดซ้ำ (ruleId+periodKey ไม่ซ้ำ)", dupKey.size, runs.length);
  const docsOfRuns = await prisma.accountDocument.count({ where: { tenantId, id: { in: runs.map((r) => r.documentId) } } });
  eq("P8.4 ทุกแถวประวัติงวดชี้ไปยังเอกสารที่มีอยู่จริง", docsOfRuns, runs.length);
} finally {
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.log(`  ⚠ cleanup: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
  };
  if (tenantId) {
    await del(() => prisma.accountRecurringRun.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountRecurringRule.deleteMany({ where: { tenantId } }));
    await del(() => prisma.appNotification.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountJournalLine.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountJournalEntry.updateMany({ where: { tenantId }, data: { reversalOfId: null } }));
    await del(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentPayment.updateMany({ where: { tenantId }, data: { chequeId: null, whtCertDocId: null } }));
    await del(() => prisma.accountCheque.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentPayment.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentRelation.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocument.updateMany({ where: { tenantId }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
    await del(() => prisma.accountAttachment.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocument.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocSequence.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountMapping.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountFinance.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountLedger.updateMany({ where: { tenantId }, data: { parentId: null } }));
    await del(() => prisma.accountLedger.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountPeriod.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountProduct.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountContact.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountSettings.deleteMany({ where: { tenantId } }));
    await del(() => prisma.appSystemUnit.deleteMany({ where: { tenantId } }));
    await del(() => prisma.appSystem.deleteMany({ where: { tenantId } }));
    await del(() => prisma.auditLog.deleteMany({ where: { tenantId } }));
    await del(() => prisma.membership.deleteMany({ where: { tenantId } }));
    await del(() => prisma.tenant.delete({ where: { id: tenantId } }));
  }
  for (const uid of userIds) await del(() => prisma.user.delete({ where: { id: uid } }));
  console.log("\n[cleanup] ลบ test data เรียบร้อย");
}

console.log(`\n===== สรุป WO 1.9: ผ่าน ${passed} · ไม่ผ่าน ${findings.length} =====`);
if (findings.length > 0) console.log(findings.map((f) => "  • " + f).join("\n"));
console.log(findings.length === 0 ? "🎉 WO 1.9 ผ่านทั้งหมด\n" : "⚠️ มีข้อไม่ผ่าน\n");
process.exit(findings.length === 0 ? 0 : 1);
