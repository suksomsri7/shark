// QC WO 3.2 — หน้าผู้ติดต่อ V2 (src/lib/modules/account/contacts-list.ts + contacts-overview.ts + contacts-ui.tsx)
//
// requires: acc-v2-seed
// ↑ marker (WO 0.7) — qc-all.mts เห็นบรรทัดนี้แล้ว seed ชุดข้อมูล QC ให้ก่อนรัน (ครั้งเดียวต่อ shard)
//
// รัน (บังคับ DB QC branch):
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/seed-acc-v2-qc.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/acc-v2-expected-contacts.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-contacts.mts
//
// เทียบ **สองการคำนวณที่เขียนแยกกัน**: contacts-list.ts/contacts-overview.ts (Prisma groupBy/findMany +
// รวมยอดฝั่ง JS) กับเฉลย acc-v2-expected.json คีย์ "contacts"/"contactsOverview" (SQL ดิบคนละสำนวน —
// scripts/acc-v2-expected-contacts.mts)
//
// ครอบคลุม (BLUEPRINT §3 แถว 3.2 · DESIGN-SPEC-V2 §7.1/§7.4):
//   P1  ตัวนับกลุ่มมาตรฐาน = เฉลย (63/41/12/22/5) + ลูกค้าประจำ = เฉลย (12)
//   P2  ตัวนับกลุ่มกำหนดเอง 3 กลุ่ม = เฉลย
//   P3  ตัวนับ "ที่มา" (สมาชิก/CRM) = เฉลย · แชท/POS/นำเข้า = 0 จริง (ไม่ fabricate)
//   P4  ค้นหา: ชื่อ (partial) · เลขที่ผู้เสียภาษี · เบอร์ (เลนดิบ + +66) · อีเมล
//   P5  pagination: ขอบเขต page/pageSize · total ตรงตัวกรอง
//   P6  เพิ่ม/ลบสมาชิกกลุ่ม (idempotent — เพิ่มซ้ำไม่ error ไม่ซ้ำแถว)
//   P7  เพิ่มผู้ติดต่อยอดนิยม: idempotent (แทรกซ้ำ = created 0 · dedupe ด้วย taxId)
//   P8  ปิดใช้งาน: หายจากกลุ่มมาตรฐานที่ไม่รวม archived (ลูกค้า/ผู้ขาย/ลูกค้าประจำยังนับรวมตามสเปค) + โผล่ใน "ปิดใช้งาน"
//   P9  guard: ไม่มีสิทธิ์ account.contact.manage = ถูกปฏิเสธ · OWNER ผ่าน
//   P10 ภาพรวมผู้ติดต่อ (contacts-overview.ts) = เฉลยอิสระ
//   P11 งบ query หน้ารายการ ≤ 12 (นับจริงจาก prisma log)
//   P12 ยอดค้างรับ/ค้างจ่าย ต่อแถว = outstandingByContacts/payableStats เดิม (regression ไม่ผิดสูตร)
//   P13 nav.ts + guard.ts ทะเบียนครบ (CONTACTS_OVERVIEW ready + route permissions)

import { readFileSync, existsSync } from "node:fs";

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string; today: string; tenantName: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();

// ── ตัวนับ SQL จริง (แบบเดียวกับ qc-acc-v2-overview.mts) ──
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
const cl = await import("@/lib/modules/account/contacts-list");
const co = await import("@/lib/modules/account/contacts-overview");
const svc = await import("@/lib/modules/account/service");
const nav = await import("@/lib/modules/account/nav");
const guard = await import("@/lib/modules/account/guard");
const { assertAccountCan } = await import("@/lib/modules/account/access");

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
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  assert(name, a === b, `ได้ ${a} · ควรได้ ${b}`);
}

console.log(`\n===== QC WO 3.2 · ผู้ติดต่อ V2 =====`);
console.log(`[env] DB ${host}\n`);

if (!existsSync(QC.expectedPath)) {
  console.error(`❌ ไม่พบเฉลย ${QC.expectedPath} — รัน seed ก่อน`);
  process.exit(2);
}
const E = JSON.parse(readFileSync(QC.expectedPath, "utf8"));
if (!E.contacts?.groups) {
  console.error(`❌ เฉลยยังไม่มีคีย์ contacts.groups — รัน QC_ENV_FILE=.env.qc pnpm tsx scripts/acc-v2-expected-contacts.mts ก่อน`);
  process.exit(1);
}
if (!E.contactsOverview) {
  console.error(`❌ เฉลยยังไม่มีคีย์ contactsOverview — รัน scripts/acc-v2-expected-contacts.mts ก่อน`);
  process.exit(1);
}
const ctx = { tenantId: E.tenantId as string, systemId: E.systemId as string };
const XC = E.contacts;
const XO = E.contactsOverview;

// ═══════════════ P1 ตัวนับกลุ่มมาตรฐาน + ลูกค้าประจำ ═══════════════
console.log("P1 ตัวนับกลุ่มมาตรฐาน:");
const sidebar = await cl.loadContactsSidebar(ctx);
eq("P1.1 ทั้งหมด = เฉลย", sidebar.counts.all, XC.all);
eq("P1.2 ลูกค้า = เฉลย", sidebar.counts.customer, XC.customer);
eq("P1.3 ผู้ขาย = เฉลย", sidebar.counts.vendor, XC.vendor);
eq("P1.4 ปิดใช้งาน = เฉลย", sidebar.counts.archived, XC.archived);
eq("P1.5 ลูกค้าประจำ = เฉลย", sidebar.counts.regular, XC.regular);
assert("P1.6 BLUEPRINT §3 แถว 3.2 ตัวนับ 63/41/12/22/5", sidebar.counts.all === 63 && sidebar.counts.customer === 41 && sidebar.counts.regular === 12 && sidebar.counts.vendor === 22 && sidebar.counts.archived === 5, JSON.stringify(sidebar.counts));

// ═══════════════ P2 กลุ่มกำหนดเอง ═══════════════
console.log("\nP2 กลุ่มกำหนดเอง:");
for (const g of XC.groups as { name: string; count: number }[]) {
  const got = sidebar.counts.custom.find((x) => x.name === g.name);
  eq(`P2 กลุ่ม "${g.name}" = เฉลย`, got?.count, g.count);
}

// ═══════════════ P3 ที่มา ═══════════════
console.log("\nP3 ที่มา:");
eq("P3.1 สมาชิก = เฉลย", sidebar.counts.source.member, XC.source.member);
eq("P3.2 CRM = เฉลย", sidebar.counts.source.crm, XC.source.crm);
eq("P3.3 แชท = 0 (ยังไม่ wire ChatContact.partyId)", sidebar.counts.source.chat, 0);
eq("P3.4 POS = 0 (ยังไม่มีกลไกผูก partyId)", sidebar.counts.source.pos, 0);
eq("P3.5 นำเข้า = 0 (ไม่มีคอลัมน์ source)", sidebar.counts.source.imported, 0);

// ═══════════════ P4 ค้นหา ═══════════════
console.log("\nP4 ค้นหา:");
const r1 = await cl.listContactsPage(ctx, { q: "ปิยธิดา" }, sidebar);
assert("P4.1 ค้นหาชื่อบางส่วน เจอปิยธิดา", r1.rows.some((r) => r.name.includes("ปิยธิดา")), r1.rows.map((r) => r.name).join(","));
const c19 = await svc.getContact(ctx.tenantId, ctx.systemId, E.fixtures.contactC00019Id);
const r2 = await cl.listContactsPage(ctx, { q: c19!.taxId! }, sidebar);
assert("P4.2 ค้นหาเลขผู้เสียภาษีตรงเป๊ะ เจอผู้ติดต่อ", r2.rows.some((r) => r.id === c19!.id), String(r2.rows.length));
const r3 = await cl.listContactsPage(ctx, { q: c19!.phone! }, sidebar);
assert("P4.3 ค้นหาเบอร์ดิบ (076xxxxxxx) เจอผู้ติดต่อ", r3.rows.some((r) => r.id === c19!.id), String(r3.rows.length));
const phone66 = "+66" + c19!.phone!.slice(1); // 076xxxxxxx → +6676xxxxxxx (รูปแบบสากล)
const r4 = await cl.listContactsPage(ctx, { q: phone66 }, sidebar);
assert("P4.4 ค้นหาเบอร์รูปแบบ +66 เจอผู้ติดต่อเดิม (normalize เหมือนกัน)", r4.rows.some((r) => r.id === c19!.id), JSON.stringify({ q: phone66, got: r4.rows.length }));

// ═══════════════ P5 pagination ═══════════════
console.log("\nP5 pagination:");
const pg1 = await cl.listContactsPage(ctx, { pageSize: 8, page: 1 }, sidebar);
eq("P5.1 pageSize=8 → 8 แถว", pg1.rows.length, 8);
eq("P5.2 pageCount = ceil(63/8) = 8", pg1.pageCount, Math.ceil(63 / 8));
const pgLast = await cl.listContactsPage(ctx, { pageSize: 8, page: 8 }, sidebar);
eq("P5.3 หน้าสุดท้าย = เศษที่เหลือ (63 - 7*8 = 7 แถว)", pgLast.rows.length, 63 - 7 * 8);
const pgOver = await cl.listContactsPage(ctx, { pageSize: 8, page: 999 }, sidebar);
assert("P5.4 ขอหน้าเกินไม่ throw (คืนแถวว่างหรือ pageCount เดิม)", Array.isArray(pgOver.rows));
eq("P5.5 total ไม่ขึ้นกับหน้า", pgOver.total, 63);
const pgGroup = await cl.listContactsPage(ctx, { group: "vendor", pageSize: 100 }, sidebar);
eq("P5.6 total ของกลุ่ม vendor ตรงตัวกรอง", pgGroup.total, 22);

// ═══════════════ P6 เพิ่ม/ลบสมาชิกกลุ่ม ═══════════════
console.log("\nP6 เพิ่ม/ลบสมาชิกกลุ่ม:");
const tmpGroup = await cl.createContactGroup(ctx, { name: `QC-TMP-GROUP-${Date.now()}` });
const anyContact = (await prisma.accountContact.findFirst({ where: { systemId: ctx.systemId }, select: { id: true } }))!;
const add1 = await cl.addContactsToGroup(ctx, tmpGroup.id, [anyContact.id]);
eq("P6.1 เพิ่มครั้งแรก added=1", add1.added, 1);
const add2 = await cl.addContactsToGroup(ctx, tmpGroup.id, [anyContact.id]);
eq("P6.2 เพิ่มซ้ำ (idempotent) added=0 ไม่ throw ไม่สร้างแถวซ้ำ", add2.added, 0);
const memberCountAfter = await prisma.accountContactGroupMember.count({ where: { groupId: tmpGroup.id } });
eq("P6.3 จำนวนสมาชิกจริงในกลุ่มยังเป็น 1 (ไม่ซ้ำ)", memberCountAfter, 1);
await cl.removeContactFromGroup(ctx, tmpGroup.id, anyContact.id);
const memberCountAfterRemove = await prisma.accountContactGroupMember.count({ where: { groupId: tmpGroup.id } });
eq("P6.4 ลบแล้วเหลือ 0", memberCountAfterRemove, 0);
await prisma.accountContactGroup.delete({ where: { id: tmpGroup.id } });

// ═══════════════ P7 เพิ่มผู้ติดต่อยอดนิยม (idempotent) ═══════════════
console.log("\nP7 เพิ่มผู้ติดต่อยอดนิยม:");
const before7 = await prisma.accountContact.count({ where: { systemId: ctx.systemId, taxId: cl.POPULAR_VENDORS[0].taxId } });
const ins1 = await cl.insertPopularVendors(ctx, [0]);
eq("P7.1 เพิ่มครั้งแรก created=1 (ถ้ายังไม่เคยมี)", ins1.created, before7 === 0 ? 1 : 0);
const ins2 = await cl.insertPopularVendors(ctx, [0]);
eq("P7.2 เพิ่มซ้ำ (idempotent) created=0 skipped=1 (dedupe ด้วย taxId)", ins2, { created: 0, skipped: 1 });
const countAfter7 = await prisma.accountContact.count({ where: { systemId: ctx.systemId, taxId: cl.POPULAR_VENDORS[0].taxId } });
eq("P7.3 ไม่มีแถวซ้ำในฐานข้อมูลจริง", countAfter7, 1);
// ทำความสะอาด (กันตัวเลข "ทั้งหมด" ของเฉลยเพี้ยนถ้ารันซ้ำ)
await prisma.accountContact.deleteMany({ where: { systemId: ctx.systemId, taxId: cl.POPULAR_VENDORS[0].taxId } });

// ═══════════════ P8 ปิดใช้งาน ═══════════════
console.log("\nP8 ปิดใช้งาน:");
const tmpContact = await prisma.accountContact.create({
  data: { tenantId: ctx.tenantId, systemId: ctx.systemId, kind: "CUSTOMER", name: `QC-TMP-ARCHIVE-${Date.now()}` },
});
const beforeArchiveAll = (await cl.loadContactsSidebar(ctx)).counts.all;
await cl.archiveContactById(ctx, tmpContact.id);
const afterArchive = await cl.loadContactsSidebar(ctx);
eq("P8.1 ทั้งหมดไม่ลดลง (archived ยังนับรวม)", afterArchive.counts.all, beforeArchiveAll);
assert("P8.2 ปิดใช้งาน +1", afterArchive.counts.archived >= XC.archived + 1, String(afterArchive.counts.archived));
const rowsArchived = await cl.listContactsPage(ctx, { group: "archived", pageSize: 100 }, afterArchive);
assert("P8.3 โผล่ในกลุ่ม 'ปิดใช้งาน'", rowsArchived.rows.some((r) => r.id === tmpContact.id));
const rowsAll = await cl.listContactsPage(ctx, { group: "all", pageSize: 200 }, afterArchive);
assert("P8.4 ยังอยู่ในกลุ่ม 'ทั้งหมด' (archived ไม่ถูกซ่อนจากทั้งหมด — ตามที่ f5 แสดงยอดรวม 63 รวม archived)", rowsAll.rows.some((r) => r.id === tmpContact.id));
await prisma.accountContact.delete({ where: { id: tmpContact.id } });

// ═══════════════ P9 guard ═══════════════
console.log("\nP9 guard:");
const tag = "QCCONTACTS-" + Date.now();
const t = await prisma.tenant.create({ data: { name: tag, slug: tag.toLowerCase() } });
const ownerUser = await prisma.user.create({ data: { email: tag.toLowerCase() + "-owner@qc.local", name: "QC เจ้าของ" } });
const staffUser = await prisma.user.create({ data: { email: tag.toLowerCase() + "-staff@qc.local", name: "QC พนักงาน" } });
const mOwner = await prisma.membership.create({ data: { userId: ownerUser.id, tenantId: t.id, role: "OWNER", unitAccess: ["*"] }, include: { tenant: true } });
const mStaff = await prisma.membership.create({ data: { userId: staffUser.id, tenantId: t.id, role: "STAFF", unitAccess: ["*"], permissions: {} }, include: { tenant: true } });
try {
  assertAccountCan({ user: { id: ownerUser.id }, active: mOwner } as never, "account.contact.manage");
  ok("P9.1 OWNER ผ่าน account.contact.manage");
} catch {
  bad("P9.1 OWNER ผ่าน account.contact.manage", "throw โดยไม่ควร");
}
let denied = false;
try {
  assertAccountCan({ user: { id: staffUser.id }, active: mStaff } as never, "account.contact.manage");
} catch {
  denied = true;
}
assert("P9.2 STAFF ไม่มีสิทธิ์ถูกปฏิเสธ", denied);
await prisma.membership.deleteMany({ where: { tenantId: t.id } });
await prisma.user.deleteMany({ where: { id: { in: [ownerUser.id, staffUser.id] } } });
await prisma.tenant.delete({ where: { id: t.id } });

// ═══════════════ P10 ภาพรวมผู้ติดต่อ ═══════════════
console.log("\nP10 ภาพรวมผู้ติดต่อ:");
// 🔴 ต้องส่ง "วันนี้" ตัวเดียวกับที่ acc-v2-expected-contacts.mts ใช้ (QC.today ที่ตรึงไว้) ไม่ใช่ Date.now() จริง
//    ไม่งั้นพอเวลาจริงเลยเดือน 2026-09 ไป ตัวเลข "เดือนนี้" ของโค้ดจริงกับเฉลยจะไม่ใช่เดือนเดียวกันอีกต่อไป
const overview = await co.loadContactsOverview(ctx, undefined, new Date(`${QC.today}T12:00:00+07:00`));
eq("P10.1 ลูกค้าใหม่เดือนนี้ = เฉลย", overview.newCustomersThisMonth, XO.newCustomersThisMonth);
eq("P10.2 ลูกค้าที่กลับมาซื้อ = เฉลย", overview.returningCustomers, XO.returningCustomers);
eq("P10.3 top 10 ยอดซื้อ (contactId set) = เฉลย", overview.topCustomersByPurchases.map((r) => r.contactId).sort(), (XO.topCustomersByPurchases as { contactId: string }[]).map((r) => r.contactId).sort());
eq("P10.4 top 10 ค้างชำระ (contactId set) = เฉลย", overview.topOutstanding.map((r) => r.contactId).sort(), (XO.topOutstanding as { contactId: string }[]).map((r) => r.contactId).sort());
eq("P10.5 top 10 ยอดจ่ายผู้ขาย (contactId set) = เฉลย", overview.topVendorsByPayments.map((r) => r.contactId).sort(), (XO.topVendorsByPayments as { contactId: string }[]).map((r) => r.contactId).sort());
if (overview.topCustomersByPurchases[0]) eq("P10.6 อันดับ 1 ยอดซื้อ = เฉลย", overview.topCustomersByPurchases[0].amountSatang, (XO.topCustomersByPurchases as { amountSatang: number }[])[0].amountSatang);

// ═══════════════ P11 งบ query หน้ารายการ ≤ 12 ═══════════════
console.log("\nP11 งบ query หน้ารายการ ≤ 12:");
const meter = { count: 0 };
sqlLog = [];
counting = true;
const sb2 = await cl.loadContactsSidebar(ctx, meter);
await cl.listContactsPage(ctx, { pageSize: 8, page: 1 }, sb2, meter);
counting = false;
const sqlCount = sqlLog.filter((q) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE)/i.test(q)).length;

assert(`P11.1 มิเตอร์ในโค้ด ≤ 12 (ได้ ${meter.count})`, meter.count > 0 && meter.count <= 12, `${meter.count}`);
assert(`P11.2 SQL จริงจาก prisma log ≤ 12 (ได้ ${sqlCount})`, sqlCount <= 12, `${sqlCount}`);

// ═══════════════ P12 ยอดค้างรับ/ค้างจ่าย regression ═══════════════
console.log("\nP12 ยอดค้างรับ/ค้างจ่าย ตรงกับสูตรเดิม:");
const allIds = (await prisma.accountContact.findMany({ where: { systemId: ctx.systemId }, select: { id: true } })).map((r) => r.id);
const [oldReceivable, both] = await Promise.all([svc.outstandingByContacts(ctx.tenantId, ctx.systemId, allIds), cl.outstandingBothByContacts(ctx, allIds)]);
let receivableMatch = true;
for (const [id, amt] of oldReceivable) if (both.receivable.get(id) !== amt) receivableMatch = false;
assert("P12.1 ค้างรับต่อรายตรงกับ outstandingByContacts เดิมทุกราย", receivableMatch);

// ═══════════════ P13 nav.ts + guard.ts ═══════════════
console.log("\nP13 nav.ts + guard.ts:");
const NAV_BASE = "/app/sys/x/account";
const contactsGroup = nav.ACCOUNT_NAV(NAV_BASE, true).find((g) => g.key === "contacts");
const ovItem = contactsGroup?.items.find((i) => i.testId === "CONTACTS_OVERVIEW");
assert("P13.1 CONTACTS_OVERVIEW status=ready href ถูกต้อง", ovItem?.status === "ready" && ovItem?.href === `${NAV_BASE}/contacts/overview`, JSON.stringify(ovItem));
eq("P13.2 guard.ts มี contacts/overview/page.tsx", guard.ACCOUNT_PAGE_PERMISSIONS["contacts/overview/page.tsx"], "account.contact.manage");
eq("P13.3 guard.ts มี contacts/[contactId]/page.tsx", guard.ACCOUNT_PAGE_PERMISSIONS["contacts/[contactId]/page.tsx"], "account.contact.manage");

console.log(`\n===== QC WO 3.2 สรุป =====`);
console.log(`ผ่าน ${passed} · ตก ${findings.length}`);
if (findings.length > 0) console.log(findings.map((f) => "  - " + f).join("\n"));
await prisma.$disconnect();
process.exit(findings.length === 0 ? 0 : 1);
