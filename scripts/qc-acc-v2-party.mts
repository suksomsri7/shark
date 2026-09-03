// QC WO 3.1 — "Party": ตัวตนกลางระดับ tenant + ผู้ผลิต 5 จุด + backfill
// รัน (แนะนำ · DB QC branch):  QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-party.mts
// requires: acc-v2-seed
//
// 🔴 ความปลอดภัยข้อมูล: ส่วนใหญ่ของไฟล์นี้ **สร้าง tenant ทิ้ง** แล้วลบทิ้งเมื่อจบ (ไม่แตะข้อมูลร้านอื่น)
//    ส่วนที่แตะร้าน QC จริง (`SIAM DIVE QC`) คือ P7 (ผู้ผลิตเชื่อม Party) + P8 (backfill idempotent สโมค)
//    — ทั้งคู่สร้างเฉพาะแถวที่แท็กไว้ (ชื่อขึ้นต้น `QCPARTY-`) แล้วลบทิ้งใน finally เท่านั้น
//
// ครอบคลุม (ดู ledger/wo-notes/3.1.md):
//   P1 ลำดับจับคู่: taxId ชนะเบอร์ · เบอร์ชนะชื่อ+อีเมล · ชื่อเปล่าไม่จับคู่เด็ดขาด · +66/0 เบอร์เดียวกัน ·
//      เลขภาษีมีขีด/เว้นวรรค
//   P2 แถวที่ถูกรวมแล้ว (mergedIntoId) ไม่ใช่ปลายทางที่ถูกจับคู่อีก
//   P3 tenant isolation — เบอร์เดียวกันคนละ tenant = คนละ Party
//   P4 ชื่อไทย/emoji/ยาวมาก ไม่ล้ม + จับคู่ซ้ำได้ปกติ
//   P5 createExternalQuotation ส่ง partyId → ใช้ AccountContact เดิมซ้ำ ไม่สร้างใหม่
//   P6 injected failure: party.findOrCreate ถูกบังคับให้ throw (ชื่อว่างหลัง trim) → producer (account.createContact)
//      ยังสำเร็จ (partyId = null ไม่ throw ออกมา)
//   P7 ผู้ผลิตทั้ง 5 (account contact · member customer · crm contact · supplier · hr employee) เชื่อม partyId จริง
//      บนร้าน QC (`SIAM DIVE QC`)
//   P8 backfill: ตัวเลขตรงกับเฉลยอิสระที่คำนวณด้วย SQL group-by เอง (ไม่เรียก facade) · รันซ้ำ = 0 การเปลี่ยนแปลง ·
//      คู่กำกวมถูกบันทึกครั้งเดียว (rerun ไม่ซ้ำ) — ทดสอบด้วย tenant ทิ้ง (เหตุผล: DB QC ใช้ร่วมกับ session อื่น
//      พร้อมกัน จะคำนวณเฉลยอิสระจาก "ทั้งตาราง" ไม่ได้อย่างปลอดภัย) + สโมคแยกบนร้าน QC จริงว่า rerun = 0
// CI ไม่มีทั้ง `.env` และ `.env.qc` — env มาจาก DATABASE_URL/DIRECT_URL ที่ workflow export ไว้
try { process.loadEnvFile?.(process.env.QC_ENV_FILE ?? ".env"); } catch { /* CI: ไม่มีไฟล์ env */ }

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const { prisma } = await import("@/lib/core/db");
const system = await import("@/lib/modules/system/service");
const party = await import("@/lib/modules/party");
const accSvc = await import("@/lib/modules/account/service");
const accIdx = await import("@/lib/modules/account");
const memberSvc = await import("@/lib/modules/member/service");
const crmSvc = await import("@/lib/modules/crm/service");
const hrSvc = await import("@/lib/modules/hr/service");
const procSvc = await import("@/lib/modules/inventory/procurement");
const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  resolveAccV2Scope: (p: unknown) => Promise<{ tenantId: string; systemId: string } | null>;
};

// ─────────────────────── harness ───────────────────────
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

const { host } = accEnv.loadQcEnv();
console.log(`\n===== QC WO 3.1 · Party =====`);
console.log(`[env] DB ${host}\n`);

const tag = "QCPARTY-" + Date.now();
let tenantId = ""; // tenant ทิ้ง (P1-P6, P8 ส่วนเฉลยอิสระ)
let tenant2Id = ""; // tenant ทิ้งที่สอง (P3 tenant isolation)
const userIds: string[] = [];
// systems ที่สร้างเพิ่มบนร้าน QC จริง (P7) — ลบเฉพาะที่สร้างเอง
const qcCreatedSystemIds: string[] = [];
const qcCreatedRows: { model: "accountContact" | "customer" | "crmContact" | "hrEmployee" | "supplier" | "party" | "partyMergeCandidate"; id: string }[] = [];

try {
  // ─── setup: tenant ทิ้งหลัก + ระบบครบ 5 ───
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag.toLowerCase() } });
  tenantId = t.id;
  const t2 = await prisma.tenant.create({ data: { name: tag + "-B", slug: (tag + "-b").toLowerCase() } });
  tenant2Id = t2.id;
  const sysAccount = await system.createSystem(tenantId, "ACCOUNT", "บัญชี " + tag);
  const sysCrm = await system.createSystem(tenantId, "CRM", "CRM " + tag);
  const sysMember = await system.createSystem(tenantId, "MEMBER", "สมาชิก " + tag);
  const sysHr = await system.createSystem(tenantId, "HR", "HR " + tag);
  const sysInv = await system.createSystem(tenantId, "INVENTORY", "คลัง " + tag);
  console.log(`[seed] tenant ${tenantId} (+ tenant2 ${tenant2Id})\n`);

  // ═══════════════ P1 — ลำดับจับคู่ ═══════════════
  console.log("P1 ลำดับจับคู่ (taxId → เบอร์ → ชื่อ+อีเมล):");

  const p1a = await party.findOrCreate(tenantId, { name: "บจก. เอ", taxId: "0105561000011", phone: "0811111111" });
  assert("สร้าง Party ใหม่รอบแรก created=true", p1a.created, JSON.stringify(p1a));
  const p1aAgainDiffPhone = await party.findOrCreate(tenantId, {
    name: "ชื่ออื่นไม่เกี่ยว",
    taxId: "0105561000011",
    phone: "0822222222", // เบอร์คนละคน — taxId ต้องชนะ ไม่ไปจับคู่ตามเบอร์
  });
  eq("taxId ชนะเบอร์ (จับคู่ Party เดิมแม้เบอร์ไม่ตรง)", p1aAgainDiffPhone.id, p1a.id);
  eq("จับคู่ด้วย taxId ⇒ created=false", p1aAgainDiffPhone.created, false);

  const p1b = await party.findOrCreate(tenantId, { name: "คุณบี", phone: "0833333333", email: "b@qc.local" });
  const p1bByPhone = await party.findOrCreate(tenantId, {
    name: "ชื่อไม่ตรงเลย",
    email: "not-b@qc.local", // อีเมลไม่ตรง — เบอร์ต้องชนะ (ไม่มี taxId ทั้งคู่)
    phone: "0833333333",
  });
  eq("เบอร์ชนะชื่อ+อีเมล (จับคู่ Party เดิมแม้อีเมลไม่ตรง)", p1bByPhone.id, p1b.id);

  const p1nameOnly1 = await party.findOrCreate(tenantId, { name: "ชื่อซ้ำไม่มีตัวช่วยอื่น" });
  const p1nameOnly2 = await party.findOrCreate(tenantId, { name: "ชื่อซ้ำไม่มีตัวช่วยอื่น" });
  assert(
    "ชื่ออย่างเดียว (ไม่มี taxId/เบอร์/อีเมล) ไม่มีวันจับคู่ — สร้างใหม่ทุกครั้ง",
    p1nameOnly1.id !== p1nameOnly2.id && p1nameOnly1.created && p1nameOnly2.created,
    JSON.stringify({ p1nameOnly1, p1nameOnly2 }),
  );

  const p1phone0 = await party.findOrCreate(tenantId, { name: "คุณซี", phone: "0899999999" });
  const p1phonePlus66 = await party.findOrCreate(tenantId, { name: "คุณซี2", phone: "+66899999999" });
  eq("+66899999999 กับ 0899999999 คือเบอร์เดียวกัน", p1phonePlus66.id, p1phone0.id);
  const p1phoneZeroPrefix = await party.findOrCreate(tenantId, { name: "คุณซี3", phone: "+66 (0)89 999 9999" });
  eq("+66 (0)89 999 9999 ก็คือเบอร์เดียวกัน", p1phoneZeroPrefix.id, p1phone0.id);

  const p1tax1 = await party.findOrCreate(tenantId, { name: "บจก. ดี", taxId: "0-1055-61000-02-2", branchCode: "00000" });
  const p1tax2 = await party.findOrCreate(tenantId, { name: "บจก. ดี (สาขา)", taxId: "0105561000022", branchCode: "00000" });
  eq("เลขภาษีมีขีด/เว้นวรรค normalize แล้วตรงกับตัวเลขล้วน", p1tax2.id, p1tax1.id);

  // ═══════════════ P2 — merged rows excluded ═══════════════
  console.log("\nP2 แถวที่ถูกรวมแล้วไม่ใช่ปลายทาง:");
  const p2target = await party.findOrCreate(tenantId, { name: "บจก. อี (ตัวหลัก)", taxId: "0105561000033" });
  await prisma.party.update({ where: { id: p2target.id }, data: { mergedIntoId: p1a.id } }); // สมมติถูกรวมเข้า p1a
  const p2again = await party.findOrCreate(tenantId, { name: "บจก. อี (ซ้ำ)", taxId: "0105561000033" });
  assert(
    "Party ที่ mergedIntoId ไม่ null ไม่ถูกจับคู่อีก (สร้างใหม่แทน)",
    p2again.created && p2again.id !== p2target.id,
    JSON.stringify(p2again),
  );

  // ═══════════════ P3 — tenant isolation ═══════════════
  console.log("\nP3 tenant isolation:");
  const p3t1 = await party.findOrCreate(tenantId, { name: "คุณเหมือนกัน", phone: "0877777777" });
  const p3t2 = await party.findOrCreate(tenant2Id, { name: "คุณเหมือนกัน", phone: "0877777777" });
  assert(
    "เบอร์เดียวกันคนละ tenant = คนละ Party (ทั้งคู่ created=true)",
    p3t1.id !== p3t2.id && p3t1.created && p3t2.created,
    JSON.stringify({ p3t1, p3t2 }),
  );

  // ═══════════════ P4 — ไทย/emoji/ชื่อยาวมาก ═══════════════
  console.log("\nP4 ชื่อไทย/emoji/ยาวมาก:");
  const longName = "นายทดสอบชื่อยาวมาก 🎉🐳" + "ก".repeat(300);
  const p4a = await party.findOrCreate(tenantId, { name: longName, phone: "0866665555" });
  assert("สร้าง Party ชื่อไทย+emoji+ยาว 300+ ตัวอักษรได้ไม่ล้ม", !!p4a.id, JSON.stringify(p4a));
  const p4b = await party.findOrCreate(tenantId, { name: "ชื่ออื่น", phone: "0866665555" });
  eq("จับคู่ซ้ำได้ปกติแม้ Party เดิมชื่อยาว/มี emoji (จับด้วยเบอร์)", p4b.id, p4a.id);

  // ═══════════════ P5 — createExternalQuotation ใช้ partyId ซ้ำ ═══════════════
  console.log("\nP5 createExternalQuotation ใช้ partyId ซ้ำ:");
  await prisma.accountSystemLink.create({
    data: { tenantId, systemId: sysAccount.id, linkedKind: "CRM", linkedId: sysCrm.id },
  });
  const p5Party = await party.findOrCreate(tenantId, { name: "บจก. เอฟ", taxId: "0105561000044" });
  const q1 = await accIdx.createExternalQuotation({
    tenantId,
    sourceSystemId: sysCrm.id,
    sourceKind: "CRM",
    refType: "CrmDeal",
    refId: "deal-1-" + tag,
    title: "งานที่ 1",
    valueSatang: 10000,
    customer: { name: "ชื่อไม่ตรงกับที่เคยสร้าง", phone: null, email: null },
    partyId: p5Party.id,
  });
  assert("ออกใบเสนอราคาใบแรกสำเร็จ", q1.ok, JSON.stringify(q1));
  let contact1Id = "";
  if (q1.ok) {
    const doc1 = await prisma.accountDocument.findFirst({ where: { id: q1.docId }, select: { contactId: true } });
    contact1Id = doc1?.contactId ?? "";
  }
  const q2 = await accIdx.createExternalQuotation({
    tenantId,
    sourceSystemId: sysCrm.id,
    sourceKind: "CRM",
    refType: "CrmDeal",
    refId: "deal-2-" + tag, // ดีลคนละใบ → ไม่ idempotent ด้วย refId — ต้องจับคู่ด้วย partyId แทน
    title: "งานที่ 2",
    valueSatang: 20000,
    customer: { name: "ชื่อไม่ตรงอีกแบบ", phone: null, email: null },
    partyId: p5Party.id,
  });
  assert("ออกใบเสนอราคาใบที่สองสำเร็จ", q2.ok, JSON.stringify(q2));
  if (q2.ok) {
    const doc2 = await prisma.accountDocument.findFirst({ where: { id: q2.docId }, select: { contactId: true } });
    eq("ใบที่สองใช้ AccountContact เดิม (จับคู่ด้วย partyId ไม่สร้างใหม่)", doc2?.contactId, contact1Id);
  }
  const contactCountForParty = await prisma.accountContact.count({ where: { systemId: sysAccount.id, partyId: p5Party.id } });
  eq("มี AccountContact แค่ 1 แถวสำหรับ partyId นี้ (ไม่งอกซ้ำ)", contactCountForParty, 1);

  // ═══════════════ P6 — injected failure ═══════════════
  console.log("\nP6 injected failure (party.findOrCreate ถูกบังคับ throw):");
  const directThrow = await party.safeFindOrCreate(tenantId, { name: "   " }); // ชื่อว่างหลัง trim → findOrCreate throw ข้างใน
  eq("safeFindOrCreate ไม่ throw ออกมา — คืน null", directThrow, null);
  const injectedContact = await accSvc.createContact({
    tenantId,
    systemId: sysAccount.id,
    kind: "CUSTOMER",
    name: "   ", // ชื่อว่างหลัง trim (แต่ createContact เองไม่บังคับชื่อไม่ว่าง) → party ล้มข้างใน
    phone: null,
    email: null,
  });
  assert(
    "account.createContact ยังสำเร็จแม้ party.findOrCreate ล้มข้างใน (partyId = null ไม่ throw)",
    !!injectedContact.id && injectedContact.partyId === null,
    JSON.stringify(injectedContact),
  );

  // ═══════════════ P8 (เฉลยอิสระ) — backfill บน tenant ทิ้ง ═══════════════
  console.log("\nP8 backfill: เฉลยอิสระ (SQL group-by เอง) + คู่กำกวม:");
  // แถวกลุ่ม A: taxId เดียวกัน 2 แถว (AccountContact) → คาดว่ารวมเป็น Party ใหม่ 1 ราย matched=2
  // 🔴 partial unique index (systemId,taxId,branchCode) WHERE archivedAt IS NULL กันแถว active ซ้ำ —
  //    แถวแรกจึงต้องสร้างแบบ "เก็บเข้ากรุ" (archivedAt) ก่อน ถึงจะสร้างแถวที่สองด้วย taxId เดียวกันได้
  //    (backfill ตั้งใจไม่กรอง archivedAt — ครอบทั้งแถวที่ถูกเก็บด้วย เหมือน backfill phoneNorm เดิม)
  const bfTax = "0199988000011";
  const bfA1 = await prisma.accountContact.create({
    data: { tenantId, systemId: sysAccount.id, kind: "CUSTOMER", name: tag + "-bfA1", taxId: bfTax, branchCode: "00000", archivedAt: new Date() },
  });
  const bfA2 = await prisma.accountContact.create({
    data: { tenantId, systemId: sysAccount.id, kind: "CUSTOMER", name: tag + "-bfA2", taxId: bfTax, branchCode: "00000" },
  });
  // แถวกลุ่ม B: เบอร์เดียวกันข้ามตาราง (AccountContact + Customer) → matched=2 created=1
  const bfPhone = "0655500011";
  const memberSystem = await prisma.appSystem.findFirst({ where: { id: sysMember.id } });
  const bfB1 = await prisma.accountContact.create({
    data: { tenantId, systemId: sysAccount.id, kind: "CUSTOMER", name: tag + "-bfB1", phone: bfPhone, ...accSvc.contactWriteFields({ phone: bfPhone }) },
  });
  const bfB2 = await prisma.customer.create({
    data: { tenantId, memberSystemId: memberSystem!.id, name: tag + "-bfB2", phone: bfPhone },
  });
  // แถวกำกวม: 2 Party ที่มีอยู่แล้วแชร์ taxId เดียวกัน (ข้อมูลเสียจำลอง) + 1 แถว AccountContact ใหม่ชี้ไปที่ taxId นั้น
  const ambigTax = "0177766000099";
  const ambigParty1 = await prisma.party.create({ data: { tenantId, kind: "COMPANY", name: tag + "-ambig1", taxId: ambigTax, branchCode: "00000" } });
  const ambigParty2 = await prisma.party.create({ data: { tenantId, kind: "COMPANY", name: tag + "-ambig2", taxId: ambigTax, branchCode: "00000" } });
  const bfAmbigRow = await prisma.accountContact.create({
    data: { tenantId, systemId: sysAccount.id, kind: "CUSTOMER", name: tag + "-bfAmbig", taxId: ambigTax, branchCode: "00000" },
  });

  // stdout ปนคำเตือน SSL ของ pg (พิมพ์ไป stderr แบบ async — อาจโผล่หลัง JSON ถ้ารวม stdout+stderr)
  // ⇒ อ่านจาก stdout อย่างเดียว + หาบรรทัดสุดท้ายที่ parse เป็น JSON ได้จริง (กันบรรทัดเปล่า/warning ปน)
  const lastJsonLine = (stdout: string): unknown => {
    const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(lines[i]!);
      } catch {
        continue;
      }
    }
    throw new Error("ไม่พบบรรทัด JSON ที่ parse ได้ใน stdout: " + stdout.slice(-500));
  };

  const runBackfill = (extraArgs: string[]) =>
    spawnSync("pnpm", ["exec", "tsx", "scripts/acc-v2-party-backfill.mts", "--tenant", tenantId, "--apply", ...extraArgs], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      env: process.env,
    });

  const run1 = runBackfill([]);
  eq("backfill รอบแรก exit 0", run1.status, 0);
  const run1Json = lastJsonLine(run1.stdout ?? "") as { tenants?: { matched: number; created: number; ambiguous: number }[] };
  const run1Totals = run1Json.tenants?.[0];
  assert("backfill รอบแรกพิมพ์ JSON บรรทัดสุดท้ายได้", !!run1Totals, JSON.stringify(run1Json).slice(-500));

  if (run1Totals) {
    // เฉลยอิสระ: กลุ่ม A (taxId) 2 แถว matched → created 1 ราย · กลุ่ม B (phone) 2 แถว matched → created 1 ราย
    // แถวกำกวม 1 แถวไม่ถูก matched (ไม่ auto-pick) → ambiguous += 1
    eq("matched รวม = 2(กลุ่ม A) + 2(กลุ่ม B) = 4 (แถวกำกวมไม่นับ matched)", run1Totals.matched, 4);
    eq("created = 2 (Party ใหม่จากกลุ่ม A + กลุ่ม B)", run1Totals.created, 2);
    eq("ambiguous = 1 (แถวเดียวที่ชนกับ Party ซ้ำ 2 ราย)", run1Totals.ambiguous, 1);
  }

  // ตรวจ DB ตรง ๆ (ไม่ผ่าน facade) — เฉลยอิสระด้วย SQL ล้วน
  const bfA1After = await prisma.accountContact.findFirst({ where: { id: bfA1.id }, select: { partyId: true } });
  const bfA2After = await prisma.accountContact.findFirst({ where: { id: bfA2.id }, select: { partyId: true } });
  assert(
    "กลุ่ม A ทั้งสองแถวจับคู่ Party เดียวกัน (SQL ตรวจตรง)",
    !!bfA1After?.partyId && bfA1After.partyId === bfA2After?.partyId,
    JSON.stringify({ bfA1After, bfA2After }),
  );
  const bfB1After = await prisma.accountContact.findFirst({ where: { id: bfB1.id }, select: { partyId: true } });
  const bfB2After = await prisma.customer.findFirst({ where: { id: bfB2.id }, select: { partyId: true } });
  assert(
    "กลุ่ม B ข้ามตาราง (AccountContact+Customer) จับคู่ Party เดียวกัน (เบอร์เดียวกัน)",
    !!bfB1After?.partyId && bfB1After.partyId === bfB2After?.partyId,
    JSON.stringify({ bfB1After, bfB2After }),
  );
  const bfAmbigAfter = await prisma.accountContact.findFirst({ where: { id: bfAmbigRow.id }, select: { partyId: true } });
  eq("แถวกำกวมไม่ถูก auto-pick — partyId ยัง null", bfAmbigAfter?.partyId ?? null, null);
  const mergeCandCount = await prisma.partyMergeCandidate.count({
    where: { tenantId, OR: [{ partyAId: ambigParty1.id }, { partyBId: ambigParty1.id }] },
  });
  eq("บันทึกคู่กำกวมลง PartyMergeCandidate 1 คู่", mergeCandCount, 1);

  // รอบสอง (rerun) — ต้อง idempotent: matched/created = 0 ทุกตัว · ambiguous ยังนับซ้ำได้ (แถวยังกำกวมอยู่) แต่ไม่ insert ซ้ำ
  const run2 = runBackfill([]);
  const run2Json = lastJsonLine(run2.stdout ?? "") as { tenants?: { matched: number; created: number; ambiguous: number }[] };
  const run2Totals = run2Json.tenants?.[0];
  if (run2Totals) {
    eq("รันซ้ำ: matched = 0 (แถวที่แก้แล้วไม่ถูกดึงมาอีก — idempotent)", run2Totals.matched, 0);
    eq("รันซ้ำ: created = 0", run2Totals.created, 0);
  }
  const mergeCandCountAfterRerun = await prisma.partyMergeCandidate.count({
    where: { tenantId, OR: [{ partyAId: ambigParty1.id }, { partyBId: ambigParty1.id }] },
  });
  eq("คู่กำกวมไม่ถูกบันทึกซ้ำตอนรันรอบสอง (ยังคง 1 แถว)", mergeCandCountAfterRerun, 1);

  qcCreatedRows.push({ model: "party", id: ambigParty1.id }, { model: "party", id: ambigParty2.id });

  // ═══════════════ P7 — ผู้ผลิตทั้ง 5 บนร้าน QC จริง ═══════════════
  console.log("\nP7 ผู้ผลิตทั้ง 5 เชื่อม partyId จริงบนร้าน SIAM DIVE QC:");
  const qcScope = await accEnv.resolveAccV2Scope(prisma);
  if (!qcScope) {
    bad("หาร้าน SIAM DIVE QC ไม่เจอ", "รัน seed-acc-v2-qc.mts ก่อน");
  } else {
    const ensureSystem = async (type: "CRM" | "MEMBER" | "HR" | "INVENTORY") => {
      const existing = await prisma.appSystem.findFirst({ where: { tenantId: qcScope.tenantId, type }, select: { id: true } });
      if (existing) return existing.id;
      const created = await system.createSystem(qcScope.tenantId, type, `${type} (สร้างโดย qc-acc-v2-party)`);
      qcCreatedSystemIds.push(created.id);
      return created.id;
    };
    const qcCrmSys = await ensureSystem("CRM");
    const qcMemberSys = await ensureSystem("MEMBER");
    const qcHrSys = await ensureSystem("HR");
    const qcInvSys = await ensureSystem("INVENTORY");

    const c1 = await accSvc.createContact({
      tenantId: qcScope.tenantId,
      systemId: qcScope.systemId,
      kind: "CUSTOMER",
      name: tag + "-account",
      phone: "0611110001",
    });
    qcCreatedRows.push({ model: "accountContact", id: c1.id });
    assert("account.createContact เชื่อม partyId", !!c1.partyId, JSON.stringify(c1));

    const c2 = await memberSvc.findOrCreate({
      tenantId: qcScope.tenantId,
      memberSystemId: qcMemberSys,
      name: tag + "-member",
      phone: "0611110002",
      source: "STAFF",
    });
    qcCreatedRows.push({ model: "customer", id: c2.id });
    assert("member.findOrCreate เชื่อม partyId", !!c2.partyId, JSON.stringify(c2));

    const c3 = await crmSvc.createContact(
      { tenantId: qcScope.tenantId, systemId: qcCrmSys },
      { name: tag + "-crm", phone: "0611110003" },
    );
    const c3Row = await prisma.crmContact.findFirst({ where: { id: c3.id }, select: { partyId: true } });
    qcCreatedRows.push({ model: "crmContact", id: c3.id });
    assert("crm.createContact เชื่อม partyId", !!c3Row?.partyId, JSON.stringify(c3Row));

    const c4 = await hrSvc.createEmployee({ tenantId: qcScope.tenantId, systemId: qcHrSys }, { name: tag + "-hr", phone: "0611110004" });
    const c4Row = await prisma.hrEmployee.findFirst({ where: { id: c4.id }, select: { partyId: true } });
    qcCreatedRows.push({ model: "hrEmployee", id: c4.id });
    assert("hr.createEmployee เชื่อม partyId", !!c4Row?.partyId, JSON.stringify(c4Row));

    const c5 = await procSvc.createSupplier(
      { tenantId: qcScope.tenantId, systemId: qcInvSys },
      { name: tag + "-supplier", phone: "0611110005" },
    );
    const c5Row = await prisma.supplier.findFirst({ where: { id: c5.id }, select: { partyId: true } });
    qcCreatedRows.push({ model: "supplier", id: c5.id });
    assert("procurement.createSupplier (Supplier) เชื่อม partyId", !!c5Row?.partyId, JSON.stringify(c5Row));
  }

  // สโมค backfill idempotent บนร้าน QC จริง (rerun เต็มร้าน = 0 การเปลี่ยนแปลง เพราะ backfill จริงรันไปแล้วตอน WO นี้)
  console.log("\nP8 (สโมคบนร้าน QC จริง) backfill rerun เต็มร้าน = 0:");
  if (qcScope) {
    const smoke = spawnSync(
      "pnpm",
      ["exec", "tsx", "scripts/acc-v2-party-backfill.mts", "--tenant", qcScope.tenantId, "--apply"],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, env: process.env },
    );
    try {
      const smokeJson = lastJsonLine(smoke.stdout ?? "") as { tenants?: { matched: number; created: number }[] };
      const smokeTotals = smokeJson.tenants?.[0];
      // หมายเหตุ: c1-c5 ของ P7 เพิ่งสร้างใหม่และ**มี**partyId แล้ว (เชื่อมตอนสร้าง) → ไม่มีอะไรให้ backfill เพิ่ม
      assert(
        "รัน backfill --apply เต็มร้าน QC ซ้ำ ⇒ matched=created=0 (ทุกแถวมี partyId แล้ว)",
        !!smokeTotals && smokeTotals.matched === 0 && smokeTotals.created === 0,
        JSON.stringify(smokeTotals),
      );
    } catch (e) {
      bad("อ่าน JSON จากสโมค backfill ไม่ได้", (smoke.stdout ?? "").slice(-500) + " · " + String(e));
    }
  }
} catch (e) {
  bad("สคริปต์ล้มกลางคัน", e instanceof Error ? (e.stack ?? e.message) : String(e));
} finally {
  // ─── cleanup ───
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.log("  [cleanup] ข้าม: " + (e instanceof Error ? e.message : String(e)));
    }
  };
  // แถวที่สร้างบนร้าน QC จริง (P7 + PartyMergeCandidate ambiguous ของ P8 อยู่ใน tenant ทิ้งอยู่แล้ว)
  for (const r of qcCreatedRows) {
    if (r.model === "accountContact") await del(() => prisma.accountContact.delete({ where: { id: r.id } }));
    else if (r.model === "customer") await del(() => prisma.customer.delete({ where: { id: r.id } }));
    else if (r.model === "crmContact") await del(() => prisma.crmContact.delete({ where: { id: r.id } }));
    else if (r.model === "hrEmployee") await del(() => prisma.hrEmployee.delete({ where: { id: r.id } }));
    else if (r.model === "supplier") await del(() => prisma.supplier.delete({ where: { id: r.id } }));
    else if (r.model === "party") await del(() => prisma.party.delete({ where: { id: r.id } }));
  }
  for (const sid of qcCreatedSystemIds) await del(() => prisma.appSystem.delete({ where: { id: sid } }));

  for (const id of [tenantId, tenant2Id].filter(Boolean)) {
    await del(() => prisma.partyMergeCandidate.deleteMany({ where: { tenantId: id } }));
    await del(() => prisma.party.deleteMany({ where: { tenantId: id } }));
    await del(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId: id } }));
    await del(() => prisma.accountDocument.deleteMany({ where: { tenantId: id } }));
    await del(() => prisma.accountContact.deleteMany({ where: { tenantId: id } }));
    await del(() => prisma.customer.deleteMany({ where: { tenantId: id } }));
    await del(() => prisma.crmContact.deleteMany({ where: { tenantId: id } }));
    await del(() => prisma.hrEmployee.deleteMany({ where: { tenantId: id } }));
    await del(() => prisma.supplier.deleteMany({ where: { tenantId: id } }));
    await del(() => prisma.accountSystemLink.deleteMany({ where: { tenantId: id } }));
    await del(() => prisma.accountSettings.deleteMany({ where: { tenantId: id } }));
    await del(() => prisma.appSystemUnit.deleteMany({ where: { tenantId: id } }));
    await del(() => prisma.appSystem.deleteMany({ where: { tenantId: id } }));
    await del(() => prisma.membership.deleteMany({ where: { tenantId: id } }));
    await del(() => prisma.tenant.delete({ where: { id } }));
  }
  for (const uid of userIds) await del(() => prisma.user.delete({ where: { id: uid } }));
  console.log("\n[cleanup] ลบ test data เรียบร้อย");
}

console.log(`\n===== สรุป: ผ่าน ${passed} · ไม่ผ่าน ${findings.length} =====`);
if (findings.length > 0) console.log(findings.map((f) => "  • " + f).join("\n"));
console.log(findings.length === 0 ? "🎉 WO 3.1 ผ่านทั้งหมด\n" : "⚠️ มีข้อไม่ผ่าน\n");
await prisma.$disconnect();
process.exit(findings.length === 0 ? 0 : 1);
