// QC WO 0.3 — "Schema เฟส 0": migration additive · partial unique index ผู้ติดต่อ · phoneNorm ·
//              กลุ่มผู้ติดต่อ · pinned · สิทธิ์ใหม่ + การ "ครอบ" ของ account.doc.create
// รัน:  QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-schema.mts
//
// 🔴 ความปลอดภัยข้อมูล: สคริปต์นี้สร้าง tenant ทิ้งแล้วลบทิ้งเมื่อจบ (ทุก query ผูก tenantId ของตัวเอง)
//    แต่ยังต้องชี้ DB QC เสมอ — พิมพ์ไฟล์ env + โฮสต์ DB ให้ตรวจก่อนเริ่มทุกครั้ง
//
// ครอบคลุม (ดู ledger/wo-notes/0.3.md):
//   S1 migration ลงจริง — คอลัมน์/ดัชนี/ตาราง/enum อ่านจาก information_schema + pg_indexes (ไม่เชื่อ Prisma client)
//   S2 พฤติกรรมจริงของ DB — ห้ามผู้ติดต่อ active ซ้ำ (systemId, taxId, branchCode) · ซ้ำได้ถ้าตัวเก่าถูกเก็บ
//   S3 phoneNorm ถูกเขียนทุกทางเข้า (create/update ผ่าน service) + backfill ซ้ำได้
//   S4 กลุ่มผู้ติดต่อ (สร้าง/เพิ่มสมาชิก/กันซ้ำ/cascade) · pinned ปริยาย false
//   S5 สิทธิ์: คีย์ใหม่มีจริง · `account.doc.create` ครอบ `account.doc.view` ผ่าน can() ตัวจริง
//   S6 pnpm drift = ไม่มี drift
// CI ไม่มีทั้ง `.env` และ `.env.qc` — env มาจาก DATABASE_URL/DIRECT_URL ที่ workflow export ไว้
// (process.loadEnvFile โยน ENOENT ถ้าไม่มีไฟล์ · และค่าที่ export มาก่อน "ชนะ" ไฟล์เสมอ — WO 0.7)
try { process.loadEnvFile?.(process.env.QC_ENV_FILE ?? ".env"); } catch { /* CI: ไม่มีไฟล์ env */ }

import { execFileSync } from "node:child_process";

const { prisma } = await import("@/lib/core/db");
const system = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const { ACCOUNT_PAGE_PERMISSIONS } = await import("@/lib/modules/account/guard");
const { assertAccountCan, accountCan, IMPLIES } = await import("@/lib/modules/account/access");
const { PERMISSION_KEYS } = await import("@/lib/core/permissions");

// ─────────────────── harness (แบบเดียวกับ qc-acc-v2-guard.mts) ───────────────────
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

const MIGRATION = "20260902160000_account_v2_phase0";
const envFile = process.env.QC_ENV_FILE ?? ".env";
const dbHost = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").split("/")[0] || "(ไม่พบ DATABASE_URL)";
console.log(`\n===== QC WO 0.3 · Schema เฟส 0 (บัญชี V2) =====`);
console.log(`[env] ไฟล์ ${envFile} · DB ${dbHost}\n`);

type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const columnsOf = async (table: string): Promise<Map<string, ColRow>> => {
  const rows = await prisma.$queryRaw<ColRow[]>`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns WHERE table_name = ${table}`;
  return new Map(rows.map((r) => [r.column_name, r]));
};
const indexDefs = async (table: string): Promise<Map<string, string>> => {
  const rows = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = ${table}`;
  return new Map(rows.map((r) => [r.indexname, r.indexdef]));
};
const enumValues = async (name: string): Promise<string[]> => {
  const rows = await prisma.$queryRaw<{ v: string }[]>`
    SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = ${name} ORDER BY e.enumsortorder`;
  return rows.map((r) => r.v);
};
const isUniqueViolation = (e: unknown) =>
  (e as { code?: string } | null)?.code === "P2002" ||
  /duplicate key value|unique constraint/i.test(e instanceof Error ? e.message : String(e));

const tag = "QCACC03-" + Date.now();
let tenantId = "";
const userIds: string[] = [];

try {
  // ═══════════════ S1 — migration ลงจริงไหม (อ่านจาก catalog ของ Postgres) ═══════════════
  console.log("S1 migration ลงจริง (information_schema / pg_indexes / pg_enum):");
  const applied = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM "_prisma_migrations"
    WHERE migration_name = ${MIGRATION} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  eq(`migration ${MIGRATION} ถูก apply แล้วบน DB นี้`, Number(applied[0]?.n ?? 0), 1);

  const doc = await columnsOf("AccountDocument");
  assert("AccountDocument.source มีจริง · NOT NULL · ปริยาย MANUAL",
    doc.get("source")?.is_nullable === "NO" && (doc.get("source")?.column_default ?? "").includes("MANUAL"),
    JSON.stringify(doc.get("source") ?? null));
  assert("AccountDocument.tags เป็น array · ปริยายว่าง",
    doc.get("tags")?.data_type === "ARRAY" && (doc.get("tags")?.column_default ?? "").includes("ARRAY["),
    JSON.stringify(doc.get("tags") ?? null));
  for (const c of ["priceMode", "discountMode", "salesUserId"])
    assert(`AccountDocument.${c} มีจริงและเป็น NULL ได้ (additive)`, doc.get(c)?.is_nullable === "YES",
      JSON.stringify(doc.get(c) ?? null));

  const contact = await columnsOf("AccountContact");
  for (const c of ["phoneNorm", "ownerUserId", "mergedIntoId", "defaultPriceMode", "defaultWhtType",
    "defaultWhtRateBp", "bankAccountNote"])
    assert(`AccountContact.${c} มีจริงและเป็น NULL ได้ (additive)`, contact.get(c)?.is_nullable === "YES",
      JSON.stringify(contact.get(c) ?? null));

  const docIdx = await indexDefs("AccountDocument");
  // (pg ไม่ใส่ quote ให้ชื่อคอลัมน์ที่เป็นตัวพิมพ์เล็กล้วนอย่าง source → regex ต้องยอมทั้งสองแบบ)
  assert("ดัชนี AccountDocument (systemId, docType, source)",
    [...docIdx.values()].some((d) => /"systemId", "docType", "?source"?\)/.test(d)), [...docIdx.keys()].join(", "));
  const contactIdx = await indexDefs("AccountContact");
  assert("ดัชนี AccountContact (systemId, phoneNorm)",
    [...contactIdx.values()].some((d) => /"systemId", "phoneNorm"/.test(d)), [...contactIdx.keys()].join(", "));
  const partial = contactIdx.get("AccountContact_systemId_taxId_branchCode_active_key") ?? "";
  assert("partial unique index ผู้ติดต่อมีจริง + เป็น UNIQUE + มีเงื่อนไข WHERE ครบทั้ง 2 ข้อ",
    /CREATE UNIQUE INDEX/.test(partial) && /taxId.*IS NOT NULL/.test(partial) && /archivedAt.*IS NULL/.test(partial),
    partial || "ไม่พบดัชนี");

  for (const t of ["AccountContactGroup", "AccountContactGroupMember"]) {
    const cols = await columnsOf(t);
    assert(`ตาราง ${t} มีจริง + ผูก tenantId/systemId (แกน scope)`,
      cols.size > 0 && cols.has("tenantId") && cols.has("systemId"), `คอลัมน์: ${[...cols.keys()].join(",")}`);
  }
  const memberIdx = await indexDefs("AccountContactGroupMember");
  assert("สมาชิกกลุ่ม unique (groupId, contactId)",
    [...memberIdx.values()].some((d) => /UNIQUE/.test(d) && /"groupId", "contactId"/.test(d)),
    [...memberIdx.keys()].join(", "));

  for (const t of ["AccountFinance", "AccountLedger", "AccountProduct"]) {
    const cols = await columnsOf(t);
    assert(`${t}.pinned มีจริง · NOT NULL · ปริยาย false`,
      cols.get("pinned")?.is_nullable === "NO" && (cols.get("pinned")?.column_default ?? "").includes("false"),
      JSON.stringify(cols.get("pinned") ?? null));
  }

  eq("enum AccountDocSource ครบ 8 ค่า (WO C1 เพิ่ม API)", (await enumValues("AccountDocSource")).join(","),
    "MANUAL,AI,IMPORT,INBOX,CRM,POS,RECURRING,API");
  eq("enum AccountPriceMode ครบ 3 ค่า", (await enumValues("AccountPriceMode")).join(","),
    "EXCL_VAT,INCL_VAT,NO_VAT");
  eq("enum AccountDiscountMode ครบ 2 ค่า", (await enumValues("AccountDiscountMode")).join(","), "AMOUNT,PERCENT");

  // 📌 ข้อค้นพบ A: ของเดิมมี "ยกเลิก" ครบแล้ว (CANCELLED = ยกเลิกร่าง · VOIDED = เคยมีผลแล้วยกเลิก)
  //    ⇒ WO นี้ **ไม่เพิ่ม** ค่า VOID · ข้อนี้เฝ้าไม่ให้ใครเผลอเพิ่มค่าที่สามที่แปลว่าเรื่องเดียวกัน
  const statuses = await enumValues("AccountDocStatus");
  assert("AccountDocStatus มี VOIDED + CANCELLED อยู่แล้ว และ **ไม่มี** VOID (ไม่เพิ่มค่าซ้ำความหมาย)",
    statuses.includes("VOIDED") && statuses.includes("CANCELLED") && !statuses.includes("VOID"),
    statuses.join(","));

  // ─── seed tenant ทิ้ง ───
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag.toLowerCase() } });
  tenantId = t.id;
  const mk = async (role: "OWNER" | "STAFF", key: string, permissions: Record<string, boolean> = {}) => {
    const u = await prisma.user.create({ data: { email: `${tag.toLowerCase()}-${key}@qc.local`, name: `QC ${key}` } });
    userIds.push(u.id);
    return prisma.membership.create({
      data: { userId: u.id, tenantId, role, unitAccess: ["*"], permissions },
      include: { tenant: true },
    });
  };
  const mOwner = await mk("OWNER", "owner");
  const mNone = await mk("STAFF", "none");
  const mCreate = await mk("STAFF", "create", { "account.doc.create": true });
  const mView = await mk("STAFF", "view", { "account.doc.view": true });
  const sys = await system.createSystem(tenantId, "ACCOUNT", "บัญชี " + tag);
  const systemId = sys.id;
  console.log(`\n[seed] tenant ${tenantId} · system ${systemId}\n`);

  // ═══════════════ S2 — DB บังคับ "ห้ามผู้ติดต่อ active ซ้ำเลขภาษี+สาขา" ═══════════════
  // ทดสอบด้วย prisma.accountContact.create ตรง ๆ (ข้าม service) — พิสูจน์ว่า **DB** เป็นคนกัน
  console.log("S2 ผู้ติดต่อซ้ำ (partial unique index บังคับที่ชั้น DB):");
  const TAXID = "0105561234567";
  const rawContact = (over: Record<string, unknown> = {}) =>
    prisma.accountContact.create({
      data: { tenantId, systemId, kind: "CUSTOMER", name: "บจก. ซ้ำ QC", taxId: TAXID, branchCode: "00000", ...over },
    });
  const first = await rawContact();
  let dupRejected = false;
  try {
    await rawContact({ name: "บจก. ซ้ำ QC (ใบที่สอง)" });
  } catch (e) {
    dupRejected = isUniqueViolation(e);
  }
  assert("ผู้ติดต่อ active เลขภาษี+สาขาเดียวกัน → DB ปฏิเสธ", dupRejected);

  const other = await rawContact({ branchCode: "00001" });
  assert("เลขภาษีเดียวกัน คนละรหัสสาขา → สร้างได้", !!other.id);

  const noTax1 = await rawContact({ taxId: null, name: "ไม่มีเลขภาษี ก" });
  const noTax2 = await rawContact({ taxId: null, name: "ไม่มีเลขภาษี ข" });
  assert("ผู้ติดต่อที่ยังไม่กรอกเลขภาษี ซ้ำกันได้หลายราย (เงื่อนไข taxId IS NOT NULL)",
    !!noTax1.id && !!noTax2.id && noTax1.id !== noTax2.id);

  // positive control ของ "partial": ถ้าดัชนีเป็น unique เต็มตาราง ข้อนี้จะแดง
  await prisma.accountContact.update({ where: { id: first.id }, data: { archivedAt: new Date() } });
  let reusedAfterArchive = "";
  try {
    reusedAfterArchive = (await rawContact({ name: "บจก. ซ้ำ QC (ออกใหม่หลังเก็บของเก่า)" })).id;
  } catch (e) {
    bad("เก็บของเก่าเข้ากรุแล้ว → ใช้เลขภาษีเดิมสร้างใหม่ได้", e instanceof Error ? e.message : String(e));
  }
  if (reusedAfterArchive) ok("เก็บของเก่าเข้ากรุแล้ว → ใช้เลขภาษีเดิมสร้างใหม่ได้ (พิสูจน์ว่าเงื่อนไข archivedAt ทำงาน)");
  const stillArchived = await prisma.accountContact.findUnique({ where: { id: first.id }, select: { archivedAt: true } });
  assert("ตัวเก่ายังถูกเก็บอยู่ (ไม่ถูกแตะ)", stillArchived?.archivedAt != null);

  // ═══════════════ S3 — phoneNorm ถูกเขียนทุกทางเข้า + backfill ═══════════════
  console.log("\nS3 phoneNorm (คอลัมน์จริง · ทุกทางเข้าเขียนครบ · backfill ซ้ำได้):");
  const created = await acc.createContact({
    tenantId, systemId, kind: "CUSTOMER", name: "คุณเบอร์ สร้างใหม่", phone: "08-1234-5678",
  });
  const afterCreate = await prisma.accountContact.findUnique({ where: { id: created.id }, select: { phoneNorm: true } });
  eq("createContact() เขียน phoneNorm ให้อัตโนมัติ", afterCreate?.phoneNorm, "0812345678");

  await acc.updateContact(tenantId, systemId, created.id, { phone: "+66 89 999 8888" });
  const afterUpdate = await prisma.accountContact.findUnique({ where: { id: created.id }, select: { phoneNorm: true } });
  eq("updateContact() ที่แก้เบอร์ → phoneNorm ตามไปด้วย", afterUpdate?.phoneNorm, "0899998888");

  await acc.updateContact(tenantId, systemId, created.id, { note: "แก้เฉพาะโน้ต" });
  const afterNoteOnly = await prisma.accountContact.findUnique({ where: { id: created.id }, select: { phoneNorm: true } });
  eq("updateContact() ที่ไม่แตะเบอร์ → phoneNorm ไม่ถูกล้าง", afterNoteOnly?.phoneNorm, "0899998888");

  await acc.updateContact(tenantId, systemId, created.id, { phone: null });
  const afterClear = await prisma.accountContact.findUnique({ where: { id: created.id }, select: { phoneNorm: true } });
  eq("ลบเบอร์ทิ้ง → phoneNorm เป็นว่าง (ไม่ค้างของเก่า)", afterClear?.phoneNorm, null);

  // จับคู่ด้วยคอลัมน์: แถวนี้เขียนแบบดิบ (มี phoneNorm) แล้วให้ service หาเจอด้วยเบอร์คนละรูปแบบ
  const byCol = await prisma.accountContact.create({
    data: { tenantId, systemId, kind: "CUSTOMER", name: "คุณจับคู่ คอลัมน์", phone: "02-090-4301", phoneNorm: "020904301" },
  });
  const hit = await acc.findOrCreateCustomerContact({ tenantId, systemId }, { name: "ชื่อคนละแบบ", phone: "+66 (0)2 090 4301" });
  eq("findOrCreateCustomerContact จับคู่จากคอลัมน์ phoneNorm ได้ (คนละรูปแบบเบอร์)", hit.id, byCol.id);

  // backfill: ทำให้ว่างแบบดิบแล้วรันสคริปต์จริง 2 รอบ (ต้องได้ผลเท่ากัน = idempotent)
  await prisma.$executeRaw`UPDATE "AccountContact" SET "phoneNorm" = NULL WHERE "id" = ${byCol.id}`;
  const runBackfill = () =>
    execFileSync("pnpm", ["tsx", "scripts/backfill-acc-v2-phone-norm.mts"], {
      encoding: "utf8",
      env: { ...process.env, QC_ENV_FILE: envFile },
    });
  runBackfill();
  const afterBackfill = await prisma.accountContact.findUnique({ where: { id: byCol.id }, select: { phoneNorm: true } });
  eq("backfill เติม phoneNorm ให้แถวเก่าที่ยังว่าง", afterBackfill?.phoneNorm, "020904301");
  const out2 = runBackfill();
  assert("backfill รันซ้ำ = ไม่เขียนอะไรเพิ่ม (idempotent)", /เติม\/แก้ 0/.test(out2), out2.split("\n").slice(-3).join(" | "));
  const leftover = await prisma.accountContact.count({
    where: { systemId, phoneNorm: null, NOT: { phone: null } },
  });
  eq("หลัง backfill ไม่มีผู้ติดต่อที่มีเบอร์แต่ phoneNorm ว่าง", leftover, 0);

  // ═══════════════ S4 — กลุ่มผู้ติดต่อ + pinned ═══════════════
  console.log("\nS4 กลุ่มผู้ติดต่อ + ปักหมุด:");
  const group = await prisma.accountContactGroup.create({ data: { tenantId, systemId, name: "ลูกค้าประจำ", color: "green" } });
  eq("สร้างกลุ่มได้ · sortOrder ปริยาย 0", group.sortOrder, 0);
  let dupGroup = false;
  try {
    await prisma.accountContactGroup.create({ data: { tenantId, systemId, name: "ลูกค้าประจำ" } });
  } catch (e) {
    dupGroup = isUniqueViolation(e);
  }
  assert("ชื่อกลุ่มซ้ำในระบบเดียวกัน → ถูกปฏิเสธ", dupGroup);

  const member = await prisma.accountContactGroupMember.create({
    data: { tenantId, systemId, groupId: group.id, contactId: created.id },
  });
  assert("เพิ่มผู้ติดต่อเข้ากลุ่มได้", !!member.id);
  let dupMember = false;
  try {
    await prisma.accountContactGroupMember.create({
      data: { tenantId, systemId, groupId: group.id, contactId: created.id },
    });
  } catch (e) {
    dupMember = isUniqueViolation(e);
  }
  assert("เพิ่มคนเดิมซ้ำในกลุ่มเดิม → ถูกปฏิเสธ (unique groupId+contactId)", dupMember);
  await prisma.accountContactGroup.delete({ where: { id: group.id } });
  eq("ลบกลุ่ม → สมาชิกถูกลบตาม (cascade) ไม่ทิ้งขยะ",
    await prisma.accountContactGroupMember.count({ where: { groupId: group.id } }), 0);
  assert("ลบกลุ่มแล้วผู้ติดต่อยังอยู่ (cascade ไม่ลามไปลบคน)",
    (await prisma.accountContact.count({ where: { id: created.id } })) === 1);

  const prod = await prisma.accountProduct.create({ data: { tenantId, systemId, name: "สินค้า QC" } });
  const fin = await prisma.accountFinance.create({ data: { tenantId, systemId, type: "CASH", name: "เงินสด QC" } });
  const led = await prisma.accountLedger.create({
    data: { tenantId, systemId, code: "9998", name: "บัญชีทดสอบ QC", type: "ASSET" },
  });
  assert("pinned ปริยาย false ทั้ง AccountProduct / AccountFinance / AccountLedger",
    prod.pinned === false && fin.pinned === false && led?.pinned === false,
    `product=${prod.pinned} finance=${fin.pinned} ledger=${led?.pinned}`);

  // ═══════════════ S5 — สิทธิ์ใหม่ + การครอบ (can ตัวจริง) ═══════════════
  console.log("\nS5 สิทธิ์ใหม่ + account.doc.create ครอบ account.doc.view:");
  for (const key of ["account.doc.view", "account.reconcile", "account.contact.merge", "account.import", "account.approve.limit"])
    assert(`permissions.ts มีคีย์ ${key}`, PERMISSION_KEYS.has(key));
  assert("ทุก action ในทะเบียนหน้า (ACCOUNT_PAGE_PERMISSIONS) มีจริงใน permissions.ts",
    Object.values(ACCOUNT_PAGE_PERMISSIONS).every((a) => PERMISSION_KEYS.has(a)),
    Object.values(ACCOUNT_PAGE_PERMISSIONS).filter((a) => !PERMISSION_KEYS.has(a)).join(", "));
  const readOnlyPages = ["docs/[docType]/page.tsx", "docs/[docType]/[docId]/page.tsx", "print/[docId]/page.tsx",
    "expense/page.tsx", "expense/[docId]/page.tsx", "purchase/page.tsx", "purchase/[docId]/page.tsx",
    "po/page.tsx", "po/[docId]/page.tsx", "asset-buy/page.tsx", "asset-buy/[docId]/page.tsx"];
  assert(`หน้าอ่านอย่างเดียวทั้ง ${readOnlyPages.length} หน้า ใช้ account.doc.view`,
    readOnlyPages.every((p) => ACCOUNT_PAGE_PERMISSIONS[p] === "account.doc.view"),
    readOnlyPages.filter((p) => ACCOUNT_PAGE_PERMISSIONS[p] !== "account.doc.view").join(", "));
  assert("ตาราง IMPLIES ประกาศ account.doc.create → account.doc.view (ที่เดียวใน access.ts)",
    (IMPLIES["account.doc.create"] ?? []).includes("account.doc.view"));

  const authOf = (m: typeof mOwner) => ({ user: { id: m.userId }, active: m }) as never;
  const denies = (m: typeof mOwner, action: string) => {
    try {
      assertAccountCan(authOf(m), action);
      return false;
    } catch {
      return true;
    }
  };
  assert("STAFF ที่มีแค่ account.doc.create → เข้าหน้าอ่านเอกสารได้ (สิทธิ์ไม่หายตอน deploy)",
    !denies(mCreate, "account.doc.view") && accountCan(authOf(mCreate), "account.doc.view"));
  assert("STAFF ที่มีแค่ account.doc.view → ยัง 'สร้าง/แก้' ไม่ได้ (ห้ามครอบย้อนทาง)",
    denies(mView, "account.doc.create") && !accountCan(authOf(mView), "account.doc.create"));
  assert("STAFF ที่มีแค่ account.doc.view → เข้าหน้าอ่านได้", !denies(mView, "account.doc.view"));
  assert("STAFF ที่ไม่มีสิทธิ์ใด ๆ → ถูกปฏิเสธทั้ง view และ create",
    denies(mNone, "account.doc.view") && denies(mNone, "account.doc.create"));
  assert("STAFF ที่มี account.doc.create ยังเข้าหน้าตั้งค่าไม่ได้ (IMPLIES ไม่รั่วไปสิทธิ์อื่น)",
    denies(mCreate, "account.settings.manage") && denies(mCreate, "account.reconcile"));
  assert("positive control: OWNER ผ่านทุก action ในทะเบียนหน้า",
    Object.values(ACCOUNT_PAGE_PERMISSIONS).every((a) => !denies(mOwner, a)));

  // ═══════════════ S6 — ไม่มี drift ระหว่าง schema กับ DB ═══════════════
  console.log("\nS6 schema ตรงกับ DB (pnpm drift):");
  let driftOut = "";
  let driftCode = 0;
  try {
    driftOut = execFileSync("pnpm", ["drift"], { encoding: "utf8", env: { ...process.env } });
  } catch (e) {
    driftCode = (e as { status?: number }).status ?? 1;
    driftOut = String((e as { stdout?: string }).stdout ?? "");
  }
  assert("pnpm drift = ไม่มีความต่างระหว่าง prisma/schema กับ DB", driftCode === 0 && /No difference detected/.test(driftOut),
    `exit=${driftCode} · ${driftOut.split("\n").filter(Boolean).slice(-2).join(" | ")}`);
} catch (e) {
  bad("สคริปต์ล้มกลางคัน", e instanceof Error ? (e.stack ?? e.message) : String(e));
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
    await del(() => prisma.accountContactGroupMember.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountContactGroup.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocument.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountContact.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountProduct.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountFinance.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountMapping.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountLedger.deleteMany({ where: { tenantId, parentId: { not: null } } }));
    await del(() => prisma.accountLedger.deleteMany({ where: { tenantId } }));
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
console.log(findings.length === 0 ? "🎉 WO 0.3 ผ่านทั้งหมด\n" : "⚠️ มีข้อไม่ผ่าน\n");
await prisma.$disconnect();
process.exit(findings.length === 0 ? 0 : 1);
