// QC WO 0.2 — "ปิดรูรั่วเดิม": ด่านสิทธิ์ระดับ page · จับคู่ผู้ติดต่อซ้ำ · รายการเอกสารกรองฝั่ง server · token ผี
// รัน (แนะนำ · DB QC branch):  QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-guard.mts
//
// 🔴 ความปลอดภัยข้อมูล: สคริปต์นี้ **สร้าง tenant ทิ้ง** แล้วลบทิ้งเมื่อจบ (ไม่แตะข้อมูลร้านอื่นเลย —
//    ทุก query ผูก tenantId ของตัวเอง) แต่ยังควรชี้ไปที่ DB QC เสมอ: ตั้ง QC_ENV_FILE=.env.qc
//    สคริปต์จะพิมพ์ชื่อไฟล์ env + โฮสต์ DB ที่ใช้จริงให้ตรวจก่อนเริ่มทุกครั้ง
//
// ครอบคลุม (ดู ledger/wo-notes/0.2.md):
//   G1 ทุก route ใต้ src/app/app/sys/[id]/account/** มีด่านสิทธิ์ + สิทธิ์นั้นกันคนไม่มีสิทธิ์ได้จริง
//   G2 findOrCreateCustomerContact: taxId+สาขา → เบอร์ normalize → ชื่อ+อีเมล · ห้ามชื่อเปล่า · ข้ามที่ถูกเก็บ
//   G3 listDocumentsPaged: tabCounts บวกกันลงตัว · OVERDUE คิดใน SQL · ขอบเขต page/pageSize · ค้นหา
//   G4 ไม่มี token ผี (--color-fg/--color-bg/--color-success/--color-primary/--color-hover) ในขอบเขตบัญชี
process.loadEnvFile?.(process.env.QC_ENV_FILE ?? ".env");

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const { prisma } = await import("@/lib/core/db");
const system = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const { ACCOUNT_PAGE_PERMISSIONS } = await import("@/lib/modules/account/guard");
const { assertAccountCan } = await import("@/lib/modules/account/access");
const { PERMISSION_KEYS } = await import("@/lib/core/permissions");

// ─────────────────── harness (แบบเดียวกับ qc-chat-security.mts) ───────────────────
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
const ROUTE_DIR = join(ROOT, "src/app/app/sys/[id]/account");
const envFile = process.env.QC_ENV_FILE ?? ".env";
const dbHost = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").split("/")[0] || "(ไม่พบ DATABASE_URL)";
console.log(`\n===== QC WO 0.2 · ปิดรูรั่วบัญชี =====`);
console.log(`[env] ไฟล์ ${envFile} · DB ${dbHost}\n`);

const tag = "QCACC02-" + Date.now();
let tenantId = "";
const userIds: string[] = [];

try {
  // ═══════════════ G1 — ด่านสิทธิ์ระดับ page ═══════════════
  // ที่ทดสอบจริง: (ก) ไฟล์ route แต่ละไฟล์ "บังคับ" action ตามทะเบียน ACCOUNT_PAGE_PERMISSIONS
  //               (ข) action นั้นกันผู้ใช้ที่ไม่มีสิทธิ์ได้จริงเมื่อเรียกด่านเดียวกับที่หน้าเรียก
  // ที่ **ไม่ได้** ทดสอบ: HTTP request จริง (ด่านอยู่หลัง requireTenant() ซึ่งต้องมี request context ของ Next)
  console.log("G1 ด่านสิทธิ์ทุก route บัญชี (static wiring):");
  const shared = readFileSync(join(ROUTE_DIR, "reports/_shared.tsx"), "utf8");
  const sharedAction = /assertAccountCan\(\s*ctx\.auth\s*,\s*"([^"]+)"/.exec(shared)?.[1] ?? "";
  const routeEntries = Object.entries(ACCOUNT_PAGE_PERMISSIONS);
  eq("ทะเบียนสิทธิ์ครอบทุกไฟล์ route ที่มีอยู่จริงในโฟลเดอร์", routeEntries.length, listRouteFiles().length);
  for (const [rel, action] of routeEntries) {
    const p = join(ROUTE_DIR, rel);
    if (!existsSync(p)) {
      bad(`G1 ${rel}`, "ไม่พบไฟล์");
      continue;
    }
    const src = readFileSync(p, "utf8");
    const direct = src.includes(`"${action}"`);
    const viaShared = /loadReport\(/.test(src) && sharedAction === action;
    assert(`G1 ${rel} → ${action}`, direct || viaShared, "ไฟล์ไม่ได้บังคับ action นี้ก่อนโหลดข้อมูล");
  }
  // ทุก action ที่ใช้ ต้องมีจริงในทะเบียนสิทธิ์กลาง (กันพิมพ์ผิดแล้วด่านเปิดโล่งเงียบ ๆ)
  const unknown = [...new Set(routeEntries.map(([, a]) => a))].filter((a) => !PERMISSION_KEYS.has(a));
  assert("ทุก action ที่ route ใช้มีอยู่จริงใน permissions.ts §account", unknown.length === 0, unknown.join(", "));

  // ─── seed tenant ทิ้ง ───
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag.toLowerCase() } });
  tenantId = t.id;
  const owner = await prisma.user.create({ data: { email: tag.toLowerCase() + "-owner@qc.local", name: "QC เจ้าของ" } });
  const staff = await prisma.user.create({ data: { email: tag.toLowerCase() + "-staff@qc.local", name: "QC พนักงาน" } });
  const staff2 = await prisma.user.create({ data: { email: tag.toLowerCase() + "-staff2@qc.local", name: "QC พนักงานเอกสาร" } });
  userIds.push(owner.id, staff.id, staff2.id);
  const mOwner = await prisma.membership.create({
    data: { userId: owner.id, tenantId, role: "OWNER", unitAccess: ["*"] },
    include: { tenant: true },
  });
  const mStaff = await prisma.membership.create({
    data: { userId: staff.id, tenantId, role: "STAFF", unitAccess: ["*"], permissions: {} },
    include: { tenant: true },
  });
  const mStaffDocs = await prisma.membership.create({
    data: {
      userId: staff2.id,
      tenantId,
      role: "STAFF",
      unitAccess: ["*"],
      permissions: { "account.doc.create": true },
    },
    include: { tenant: true },
  });
  const sys = await system.createSystem(tenantId, "ACCOUNT", "บัญชี " + tag);
  const systemId = sys.id;
  console.log(`\n[seed] tenant ${tenantId} · system ${systemId}\n`);

  console.log("G1 ด่านสิทธิ์ทุก route บัญชี (runtime — assertAccountCan กับ membership จริงใน DB):");
  const authOf = (m: typeof mOwner) => ({ user: { id: m.userId }, active: m });
  const denies = (m: typeof mOwner, action: string) => {
    try {
      assertAccountCan(authOf(m) as never, action);
      return false;
    } catch {
      return true;
    }
  };
  const distinctActions = [...new Set(routeEntries.map(([, a]) => a))].sort();
  for (const action of distinctActions) {
    assert(`G1 STAFF ไม่มีสิทธิ์ → ถูกปฏิเสธ: ${action}`, denies(mStaff, action));
  }
  assert("G1 positive control: OWNER ผ่านทุก action", distinctActions.every((a) => !denies(mOwner, a)));
  assert(
    "G1 positive control: STAFF ที่ได้ account.doc.create เข้าหน้าเอกสารได้ แต่ยังเข้าหน้าตั้งค่าไม่ได้",
    !denies(mStaffDocs, "account.doc.create") && denies(mStaffDocs, "account.settings.manage"),
  );

  // ═══════════════ G2 — จับคู่ผู้ติดต่อซ้ำ ═══════════════
  console.log("\nG2 จับคู่ผู้ติดต่อ (dedupe):");
  eq("normalizePhoneTh('08-1234-5678')", acc.normalizePhoneTh("08-1234-5678"), "0812345678");
  eq("normalizePhoneTh('+66 81 234 5678')", acc.normalizePhoneTh("+66 81 234 5678"), "0812345678");
  eq("normalizePhoneTh('02-090-4301')", acc.normalizePhoneTh("02-090-4301"), "020904301");
  eq("normalizePhoneTh('+66 (0)81 234 5678')", acc.normalizePhoneTh("+66 (0)81 234 5678"), "0812345678");
  eq("normalizePhoneTh(null) = ''", acc.normalizePhoneTh(null), "");

  const ctx = { tenantId, systemId };
  const c1 = await acc.findOrCreateCustomerContact(ctx, { name: "สมชาย ทองดี", phone: "081-111-1111" });
  const c2 = await acc.findOrCreateCustomerContact(ctx, { name: "สมชาย ทองดี", phone: "089-222-2222" });
  assert("ชื่อซ้ำ 'สมชาย ทองดี' คนละเบอร์ → คนละผู้ติดต่อ (ห้ามจับด้วยชื่อเปล่า)", c1.id !== c2.id);

  const c1again = await acc.findOrCreateCustomerContact(ctx, { name: "สมชาย ท. (ชื่อเล่น)", phone: "+66 81 111 1111" });
  eq("เบอร์ +66 81 111 1111 = 081-111-1111 → ผู้ติดต่อเดิม", c1again.id, c1.id);

  const co1 = await acc.findOrCreateCustomerContact(ctx, {
    name: "บจก. เอ บี ซี",
    taxId: "0105561111111",
    branchCode: "00000",
  });
  const co2 = await acc.findOrCreateCustomerContact(ctx, {
    name: "บริษัท เอบีซี จำกัด (สะกดคนละแบบ)",
    taxId: "0105561111111",
    branchCode: "00000",
  });
  eq("เลขภาษี+สาขาเดียวกัน → ผู้ติดต่อเดิม", co2.id, co1.id);
  const co3 = await acc.findOrCreateCustomerContact(ctx, {
    name: "บจก. เอ บี ซี (สาขา 1)",
    taxId: "0105561111111",
    branchCode: "00001",
  });
  assert("เลขภาษีเดียวกันคนละสาขา → คนละผู้ติดต่อ", co3.id !== co1.id);

  const e1 = await acc.findOrCreateCustomerContact(ctx, { name: "คุณเมล์ ทดสอบ", email: "mail@qc.local" });
  const e2 = await acc.findOrCreateCustomerContact(ctx, { name: "คุณเมล์ ทดสอบ", email: "mail@qc.local" });
  eq("ชื่อ+อีเมลตรงกันทั้งคู่ → ผู้ติดต่อเดิม", e2.id, e1.id);
  const e3 = await acc.findOrCreateCustomerContact(ctx, { name: "คุณเมล์ ทดสอบ", email: "other@qc.local" });
  assert("ชื่อเดียวกันแต่อีเมลต่าง → คนละผู้ติดต่อ", e3.id !== e1.id);
  const e4 = await acc.findOrCreateCustomerContact(ctx, { name: "คุณเมล์ ทดสอบ" });
  assert("ชื่อเปล่า (ไม่มีเบอร์/อีเมล/เลขภาษี) → สร้างใหม่ ไม่หยิบของคนอื่น", e4.id !== e1.id && e4.id !== e3.id);

  await prisma.accountContact.update({ where: { id: c2.id }, data: { archivedAt: new Date() } });
  const c2after = await acc.findOrCreateCustomerContact(ctx, { name: "สมชาย ทองดี", phone: "089-222-2222" });
  assert("ผู้ติดต่อที่ถูกเก็บ (archivedAt) ไม่ถูกนำกลับมาใช้", c2after.id !== c2.id);
  const archivedStill = await prisma.accountContact.findUnique({ where: { id: c2.id }, select: { archivedAt: true } });
  assert("ของเดิมยังถูกเก็บอยู่ (ไม่ถูกปลุกคืน)", archivedStill?.archivedAt != null);

  // ═══════════════ G3 — listDocumentsPaged ═══════════════
  console.log("\nG3 รายการเอกสาร (กรอง/นับ/แบ่งหน้า ฝั่ง server):");
  const cA = await prisma.accountContact.create({
    data: { tenantId, systemId, kind: "CUSTOMER", name: "บจก. ลูกค้าเอ QC" },
  });
  const cB = await prisma.accountContact.create({
    data: { tenantId, systemId, kind: "CUSTOMER", name: "หจก. ลูกค้าบี QC" },
  });
  const day = 24 * 60 * 60 * 1000;
  const past = new Date(Date.now() - 30 * day);
  const future = new Date(Date.now() + 30 * day);
  let seq = 0;
  const mkDoc = (
    status: "AWAITING_PAYMENT" | "PARTIAL" | "PAID" | "DRAFT",
    contactId: string,
    dueDate: Date | null,
    issueDate: Date,
  ) =>
    prisma.accountDocument.create({
      data: {
        tenantId,
        systemId,
        docType: "INVOICE",
        status,
        contactId,
        dueDate,
        issueDate,
        docNo: status === "DRAFT" ? null : `IV-${String(++seq).padStart(4, "0")}`,
        grandTotal: 100_00 * (seq + 1),
      },
    });
  // 12 รอชำระ ยังไม่ถึงกำหนด (ลูกค้า A) · 4 รอชำระ พ้นกำหนด (B) · 2 ชำระบางส่วน พ้นกำหนด (B) · 6 ชำระแล้ว (A) · 3 ร่าง (A)
  for (let i = 0; i < 12; i++) await mkDoc("AWAITING_PAYMENT", cA.id, future, new Date(Date.now() - i * day));
  for (let i = 0; i < 4; i++) await mkDoc("AWAITING_PAYMENT", cB.id, past, new Date(Date.now() - (20 + i) * day));
  for (let i = 0; i < 2; i++) await mkDoc("PARTIAL", cB.id, past, new Date(Date.now() - (30 + i) * day));
  for (let i = 0; i < 6; i++) await mkDoc("PAID", cA.id, past, new Date(Date.now() - (40 + i) * day));
  for (let i = 0; i < 3; i++) await mkDoc("DRAFT", cA.id, null, new Date(Date.now() - (50 + i) * day));
  const TOTAL = 27;

  const all = await acc.listDocumentsPaged(tenantId, systemId, { docType: "INVOICE" });
  eq("total (ทั้งหมด) = 27", all.total, TOTAL);
  eq("tabCounts.ALL = total", all.tabCounts.ALL, all.total);
  const sumStatus = (Object.entries(all.tabCounts) as [string, number][])
    .filter(([k]) => k !== "ALL" && k !== "OVERDUE")
    .reduce((s, [, v]) => s + v, 0);
  eq("ผลรวมนับรายสถานะ = ALL (แท็บบวกกันลงตัว)", sumStatus, TOTAL);
  eq("tabCounts.AWAITING_PAYMENT = 16", all.tabCounts.AWAITING_PAYMENT, 16);
  eq("tabCounts.PARTIAL = 2", all.tabCounts.PARTIAL, 2);
  eq("tabCounts.PAID = 6", all.tabCounts.PAID, 6);
  eq("tabCounts.DRAFT = 3", all.tabCounts.DRAFT, 3);
  eq("tabCounts.OVERDUE = 6 (พ้นกำหนด = รอชำระ/บางส่วน + ครบกำหนดแล้ว)", all.tabCounts.OVERDUE, 6);

  const overdue = await acc.listDocumentsPaged(tenantId, systemId, { docType: "INVOICE", status: "OVERDUE", pageSize: 3 });
  eq("OVERDUE คิดใน SQL: total = 6 แม้ pageSize = 3 (ไม่ใช่กรองใน JS หลัง take)", overdue.total, 6);
  eq("OVERDUE หน้าแรกได้ 3 แถวตาม pageSize", overdue.rows.length, 3);
  assert(
    "ทุกแถวใน OVERDUE พ้นกำหนดจริงตาม isOverdue()",
    overdue.rows.every((r) => acc.isOverdue(r)),
  );
  const notOverdue = await acc.listDocumentsPaged(tenantId, systemId, {
    docType: "INVOICE",
    status: ["AWAITING_PAYMENT", "PARTIAL"],
    excludeOverdue: true,
  });
  eq("แท็บ 'รอชำระเงิน' (ตัดพ้นกำหนดออก) = 12", notOverdue.total, 12);

  eq("pageSize ปริยาย = 20", all.pageSize, 20);
  eq("หน้าแรกได้ 20 แถว", all.rows.length, 20);
  eq("pageCount = 2", all.pageCount, 2);
  const p2 = await acc.listDocumentsPaged(tenantId, systemId, { docType: "INVOICE", page: 2 });
  eq("หน้า 2 ได้ 7 แถว", p2.rows.length, TOTAL - 20);
  const ids1 = new Set(all.rows.map((r) => r.id));
  assert("หน้า 2 ไม่ซ้ำกับหน้า 1", p2.rows.every((r) => !ids1.has(r.id)));
  const pBig = await acc.listDocumentsPaged(tenantId, systemId, { docType: "INVOICE", pageSize: 500 });
  eq("pageSize เกินเพดาน → ตัดเหลือ 100", pBig.pageSize, 100);
  const pSmall = await acc.listDocumentsPaged(tenantId, systemId, { docType: "INVOICE", pageSize: -5, page: -3 });
  assert("pageSize/page ติดลบ → บีบเป็น 1", pSmall.pageSize === 1 && pSmall.page === 1);
  const pFar = await acc.listDocumentsPaged(tenantId, systemId, { docType: "INVOICE", page: 999 });
  assert("หน้าเกินท้ายสุด → ไม่มีแถว แต่ total ยังถูก", pFar.rows.length === 0 && pFar.total === TOTAL);

  const qNo = await acc.listDocumentsPaged(tenantId, systemId, { docType: "INVOICE", q: "IV-0003" });
  assert("ค้นหาเลขที่เอกสาร 'IV-0003' → 1 ใบ", qNo.total === 1 && qNo.rows[0]?.docNo === "IV-0003");
  const qLower = await acc.listDocumentsPaged(tenantId, systemId, { docType: "INVOICE", q: "iv-0003" });
  eq("ค้นหาไม่สนตัวพิมพ์เล็ก/ใหญ่", qLower.total, 1);
  const qName = await acc.listDocumentsPaged(tenantId, systemId, { docType: "INVOICE", q: "ลูกค้าบี" });
  eq("ค้นหาด้วยชื่อผู้ติดต่อ 'ลูกค้าบี' → 6 ใบ", qName.total, 6);
  eq("นับแท็บก็ถูกกรองด้วยคำค้นเช่นกัน (ALL = 6)", qName.tabCounts.ALL, 6);
  const qNone = await acc.listDocumentsPaged(tenantId, systemId, { docType: "INVOICE", q: "ไม่มีทางเจอ zzz" });
  assert("ค้นหาไม่เจอ → 0 แถว 0 total", qNone.total === 0 && qNone.rows.length === 0);
  const byContact = await acc.listDocumentsPaged(tenantId, systemId, { docType: "INVOICE", contactId: cB.id });
  eq("กรองตามผู้ติดต่อ B → 6 ใบ", byContact.total, 6);
  // ⚠️ ขอบเขตวันต้องเผื่อ timezone: ใช้ "พรุ่งนี้" เป็นปลายทาง ไม่งั้นเอกสารของ "วันนี้ตอนดึก"
  // จะหลุดออกเมื่อรันช่วง UTC 17:00+ (เวลาไทยข้ามวันแล้ว แต่วันที่ UTC ยังไม่ข้าม)
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const byDate = await acc.listDocumentsPaged(tenantId, systemId, {
    docType: "INVOICE",
    from: ymd(new Date(Date.now() - 11 * day)),
    to: ymd(new Date(Date.now() + day)),
  });
  eq("กรองช่วงวันที่ 12 วันล่าสุด → 12 ใบ", byDate.total, 12);
  const otherType = await acc.listDocumentsPaged(tenantId, systemId, { docType: "QUOTATION" });
  assert("กรอง docType: ใบเสนอราคา = 0 (ไม่ปนกับใบแจ้งหนี้)", otherType.total === 0 && otherType.tabCounts.ALL === 0);

  // ทะลุร้าน: ระบบอื่นต้องไม่เห็นเอกสารของเรา
  const sys2 = await system.createSystem(tenantId, "ACCOUNT", "บัญชี 2 " + tag);
  const cross = await acc.listDocumentsPaged(tenantId, sys2.id, { docType: "INVOICE" });
  assert("scope systemId: ระบบบัญชีอีกตัวเห็น 0 ใบ", cross.total === 0 && cross.rows.length === 0);

  // ═══════════════ G4 — token ผี ═══════════════
  console.log("\nG4 token ผีในขอบเขตบัญชี:");
  const ghost = grepGhost(["src/lib/modules/account", "src/app/app/sys/[id]/account"]);
  assert("ไม่มี --color-fg/--color-bg/--color-success/--color-primary/--color-hover", ghost.length === 0, ghost.join(" | "));
} catch (e) {
  bad("สคริปต์ล้มกลางทาง", e instanceof Error ? (e.stack ?? e.message) : String(e));
} finally {
  // ─── cleanup: ลบเฉพาะข้อมูลของ tenant ทดสอบ ───
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.log("  [cleanup] ข้าม: " + (e instanceof Error ? e.message : String(e)));
    }
  };
  if (tenantId) {
    await del(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocument.deleteMany({ where: { tenantId } }));
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

console.log(`\n===== สรุป: ผ่าน ${passed} · ไม่ผ่าน ${findings.length} =====`);
if (findings.length > 0) console.log(findings.map((f) => "  • " + f).join("\n"));
console.log(findings.length === 0 ? "🎉 WO 0.2 ผ่านทั้งหมด\n" : "⚠️ มีข้อไม่ผ่าน\n");
await prisma.$disconnect();
process.exit(findings.length === 0 ? 0 : 1);

// ─────────────────── helpers ───────────────────
/** ไฟล์ route จริงในโฟลเดอร์บัญชี (page.tsx + route.ts) เทียบกับทะเบียนสิทธิ์ */
function listRouteFiles(): string[] {
  const out = execFileSync(
    "find",
    [ROUTE_DIR, "-type", "f", "(", "-name", "page.tsx", "-o", "-name", "route.ts", ")"],
    { encoding: "utf8" },
  );
  return out
    .split("\n")
    .filter(Boolean)
    .map((p) => p.slice(ROUTE_DIR.length + 1))
    .sort();
}

/** grep token ผีตาม UI_STANDARD.md §0.1 (ต้องว่างก่อน merge) */
function grepGhost(dirs: string[]): string[] {
  const hits: string[] = [];
  for (const d of dirs) {
    try {
      const out = execFileSync(
        "grep",
        ["-rn", "-E", "--", "color-(fg|bg|success|primary|hover)", join(ROOT, d)],
        { encoding: "utf8" },
      );
      hits.push(...out.split("\n").filter(Boolean).map((l) => l.replace(ROOT + "/", "")));
    } catch {
      // grep exit 1 = ไม่เจอ = ผ่าน
    }
  }
  return hits;
}
