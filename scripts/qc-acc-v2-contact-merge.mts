// QC WO 3.4 — รวมผู้ติดต่อซ้ำ (src/lib/modules/account/contact-merge.ts · DESIGN-SPEC-V2 §7.3 · ภาพ g7)
//
// requires: acc-v2-seed
//
// รัน (บังคับ DB QC branch):
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/seed-acc-v2-qc.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/acc-v2-expected-contact-profile.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-contact-merge.mts
//
// 🔴 ชุดนี้ **แก้ข้อมูล** (รวมผู้ติดต่อจริง) — ทำงานบน "คู่ทดสอบที่สร้างเองในสคริปต์" เป็นหลัก และ
//    ล้างทิ้งท้ายสคริปต์เสมอ (finally) · ส่วนคู่ซ้ำของ seed ใช้แค่ "อ่าน" (ตรวจว่ารายการคู่ตรวจเจอ)
//    ยกเว้นข้อ M6 ที่รวมจริง แล้ว **seed ใหม่ท้ายสคริปต์** เพื่อคืนสภาพให้ชุดอื่น
//
// ครอบคลุม (BLUEPRINT §3 แถว 3.4):
//   M1  listMergeCandidates: เจอคู่ที่ seed ตั้งใจใส่ + เหตุผลถูก (เลขภาษีตรงกัน)
//   M2  เกณฑ์ครบ 3 แบบ: เลขภาษี · เบอร์ · ชื่อคล้าย ≥90% (สร้างคู่ทดสอบเองทีละแบบ)
//   M3  ปฏิเสธที่ควรปฏิเสธ: id เดียวกัน · ไม่พบ (IDOR ข้ามระบบ) · ปิดใช้งานอยู่ · รวมซ้ำ
//   M4  ธุรกรรมย้อนกลับครบเมื่อพังกลางทาง (failAfter ทีละจุด — ไม่มีแถวไหนขยับเลย)
//   M5  fieldChoices: ค่าที่เลือกไปอยู่ที่ตัวหลัก (+ phoneNorm ถูกเขียนคู่กับ phone)
//   M6  รวมจริงคู่ของ seed: ย้ายครบทุกตาราง (เอกสาร/JV/กลุ่ม dedupe/กฎประจำ) · ตัวรอง archived+mergedIntoId
//       · Party ถูกรวม · PartyMergeCandidate = MERGED · audit ถูกเขียน · aging ตัวหลัก = ผลรวม
//   M7  dismissMergeCandidate: คู่หายจากรายการ + สถานะ DISMISSED
//   M8  countOpenMergeCandidates + guard/nav ทะเบียนครบ

import { readFileSync, existsSync } from "node:fs";

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string; today: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();

const { prisma } = await import("@/lib/core/db");
const cm = await import("@/lib/modules/account/contact-merge");
const cp = await import("@/lib/modules/account/contact-profile");
const rep = await import("@/lib/modules/account/reports");
const svc = await import("@/lib/modules/account/service");
const guard = await import("@/lib/modules/account/guard");
const nav = await import("@/lib/modules/account/nav");

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

console.log(`\n===== QC WO 3.4 · รวมผู้ติดต่อซ้ำ =====`);
console.log(`[env] DB ${host}\n`);

if (!existsSync(QC.expectedPath)) {
  console.error(`❌ ไม่พบเฉลย ${QC.expectedPath} — รัน seed ก่อน`);
  process.exit(2);
}
const E = JSON.parse(readFileSync(QC.expectedPath, "utf8"));
if (!E.mergeDuplicate) {
  console.error("❌ เฉลยยังไม่มีคีย์ mergeDuplicate — รัน scripts/acc-v2-expected-contact-profile.mts ก่อน");
  process.exit(1);
}
const ctx = { tenantId: E.tenantId as string, systemId: E.systemId as string };
const MD = E.mergeDuplicate as {
  taxId: string;
  sharedGroups: number;
  totalDocsAfterMerge: number;
  primary: { id: string; code: string; name: string; docs: number; journalLines: number; groups: number; recurringRules: number };
  secondary: { id: string; code: string; name: string; docs: number; docTypes: number; journalLines: number; groups: number; recurringRules: number };
};

// ── ผู้ติดต่อทดสอบที่สคริปต์นี้สร้างเอง (ลบทิ้งท้ายสคริปต์เสมอ) ──
const tempIds: string[] = [];
const mkTemp = async (input: { name: string; taxId?: string | null; phone?: string | null; branchCode?: string }) => {
  const row = await svc.createContact({
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    kind: "CUSTOMER",
    legalType: "COMPANY",
    name: input.name,
    // 🔴 ตั้ง taxId ทีหลังเสมอ: partial unique index (systemId,taxId,branchCode) จะชนตั้งแต่ create
    //    ถ้าใส่เลขซ้ำมาพร้อม branchCode ปริยาย "00000" (และ createContact จะรีทราย 6 รอบเปล่า ๆ)
    taxId: null,
    phone: input.phone ?? null,
    email: null,
    address: null,
    creditTermDays: 0,
    note: "QC-3.4-TEMP",
  });
  if (input.taxId || input.branchCode)
    await prisma.accountContact.update({
      where: { id: row.id },
      data: { ...(input.taxId ? { taxId: input.taxId } : {}), ...(input.branchCode ? { branchCode: input.branchCode } : {}) },
    });
  tempIds.push(row.id);
  return row.id;
};

let needReseed = false;

try {
  // ═══════════════ M1 รายการคู่ที่ระบบสงสัย ═══════════════
  console.log("M1 listMergeCandidates เจอคู่ที่ seed ตั้งใจใส่:");
  const cands = await cm.listMergeCandidates(ctx);
  const seedPair = cands.find(
    (c) => [c.a.id, c.b.id].includes(MD.primary.id) && [c.a.id, c.b.id].includes(MD.secondary.id),
  );
  assert("M1.1 เจอคู่ของ seed ในรายการ", !!seedPair, `เจอ ${cands.length} คู่`);
  eq("M1.2 เหตุผล = เลขภาษีตรงกัน", seedPair?.reason, "TAX_ID");
  eq("M1.3 ป้ายเหตุผลภาษาไทย", seedPair?.reasonLabel, "เลขภาษีตรงกัน");
  assert(
    "M1.4 ตัวหลักโดยปริยาย = ฝั่งที่มีเอกสารมากกว่า (ย้ายน้อยที่สุด)",
    seedPair?.a.id === MD.secondary.id && seedPair?.b.id === MD.primary.id,
    JSON.stringify({ a: seedPair?.a.code, aDocs: seedPair?.a.docCount, b: seedPair?.b.code, bDocs: seedPair?.b.docCount }),
  );
  eq("M1.5 จำนวนเอกสารบนการ์ด = เฉลย (ตัวรอง)", seedPair?.a.docCount, MD.secondary.docs);
  eq("M1.6 จำนวน JV บนการ์ด = เฉลย (ตัวรอง)", seedPair?.a.journalLineCount, MD.secondary.journalLines);
  eq("M1.7 จำนวนกฎเอกสารประจำ = เฉลย (ตัวรอง)", seedPair?.a.recurringCount, MD.secondary.recurringRules);
  assert("M1.8 ไม่มีคู่ที่ id ซ้ำตัวเอง", cands.every((c) => c.a.id !== c.b.id));

  // ═══════════════ M2 เกณฑ์ครบ 3 แบบ ═══════════════
  console.log("\nM2 เกณฑ์ทั้ง 3 แบบ (สร้างคู่ทดสอบเอง):");
  const phoneA = await mkTemp({ name: "บริษัท คิวซีเบอร์ซ้ำ หนึ่ง จำกัด", phone: "081-999-0001" });
  const phoneB = await mkTemp({ name: "หจก. คิวซีเบอร์ซ้ำ สอง", phone: "0819990001" });
  // 🔴 ให้คนละเบอร์โดยตั้งใจ: ถ้าเบอร์เดียวกัน `party.findOrCreate` จะจับเป็น **Party เดียวกัน**
  //    ⇒ ทำเครื่องหมาย "ไม่ใช่คนเดียวกัน" (M7) ไม่ได้ เพราะสถานะเก็บที่ระดับคู่ Party (ดู wo-notes/3.4.md)
  const nameA = await mkTemp({ name: "บริษัท คิวซีชื่อคล้ายมากจริง ๆ จำกัด", phone: "081-777-0001" });
  const nameB = await mkTemp({ name: "บริษัท คิวซีชื่อคล้ายมากจริงๆ จำกัด", phone: "081-777-0002" });
  const c2 = await cm.listMergeCandidates(ctx);
  const findPair = (x: string, y: string) => c2.find((c) => [c.a.id, c.b.id].includes(x) && [c.a.id, c.b.id].includes(y));
  eq("M2.1 คู่เบอร์เดียวกัน (normalize แล้ว) = PHONE", findPair(phoneA, phoneB)?.reason, "PHONE");
  const nameCand = findPair(nameA, nameB);
  eq("M2.2 คู่ชื่อคล้าย ≥90% = NAME_SIMILAR", nameCand?.reason, "NAME_SIMILAR");
  assert(
    "M2.3 ป้ายชื่อคล้ายมี % จริง (ไม่ใช่ค่าคงที่)",
    /^ชื่อคล้าย \d{2,3}%$/.test(nameCand?.reasonLabel ?? ""),
    nameCand?.reasonLabel ?? "",
  );
  assert(
    "M2.4 เลขภาษีต่างกัน + ชื่อไม่คล้าย = ไม่ถูกจับเป็นคู่",
    !findPair(phoneA, nameA),
    "จับคู่มั่ว",
  );

  // ═══════════════ M3 ปฏิเสธที่ควรปฏิเสธ ═══════════════
  console.log("\nM3 การปฏิเสธ:");
  const r1 = await cm.mergeContacts(ctx, { primaryId: phoneA, secondaryId: phoneA });
  assert("M3.1 id เดียวกัน = ปฏิเสธ (ข้อความไทย)", !r1.ok && /รายเดียวกัน/.test(r1.reason), JSON.stringify(r1));
  const otherSystem = await prisma.appSystem.findFirst({ where: { tenantId: ctx.tenantId, type: "CRM" }, select: { id: true } });
  const r2 = await cm.mergeContacts({ tenantId: ctx.tenantId, systemId: otherSystem!.id }, { primaryId: phoneA, secondaryId: phoneB });
  assert("M3.2 IDOR: เรียกจากระบบอื่น = ไม่พบ (ไม่ใช่รวมสำเร็จ)", !r2.ok && /ไม่พบ/.test(r2.reason), JSON.stringify(r2));
  await prisma.accountContact.update({ where: { id: nameB }, data: { archivedAt: new Date() } });
  const r3 = await cm.mergeContacts(ctx, { primaryId: nameA, secondaryId: nameB });
  assert("M3.3 ตัวรองปิดใช้งานอยู่ = ปฏิเสธ", !r3.ok && /ปิดใช้งาน/.test(r3.reason), JSON.stringify(r3));
  await prisma.accountContact.update({ where: { id: nameB }, data: { archivedAt: null } });
  {
    // ยกเลิกค้างกลางทาง: voidedAt ตั้งแล้วแต่สถานะยังไม่ปิด
    const stuckDoc = await prisma.accountDocument.findFirst({ where: { systemId: ctx.systemId, contactId: MD.secondary.id }, select: { id: true, status: true, voidedAt: true } });
    await prisma.accountDocument.update({ where: { id: stuckDoc!.id }, data: { voidedAt: new Date(), status: "AWAITING_PAYMENT" } });
    const r4 = await cm.mergeContacts(ctx, { primaryId: MD.primary.id, secondaryId: MD.secondary.id });
    assert("M3.4 มีเอกสารยกเลิกค้างกลางทาง = ปฏิเสธพร้อมบอกวิธีแก้", !r4.ok && /ยกเลิกค้าง/.test(r4.reason), JSON.stringify(r4));
    await prisma.accountDocument.update({ where: { id: stuckDoc!.id }, data: { voidedAt: stuckDoc!.voidedAt, status: stuckDoc!.status } });
  }

  // ═══════════════ M4 ธุรกรรมย้อนกลับครบ ═══════════════
  console.log("\nM4 ล้มกลางทาง = ไม่มีอะไรขยับ:");
  const snapshot = async (id: string) => {
    const [docs, jv, groups, rules, row] = await Promise.all([
      prisma.accountDocument.count({ where: { systemId: ctx.systemId, contactId: id } }),
      prisma.accountJournalLine.count({ where: { systemId: ctx.systemId, contactId: id } }),
      prisma.accountContactGroupMember.count({ where: { systemId: ctx.systemId, contactId: id } }),
      prisma.accountRecurringRule.count({ where: { systemId: ctx.systemId, contactId: id } }),
      prisma.accountContact.findUnique({ where: { id }, select: { archivedAt: true, mergedIntoId: true, name: true } }),
    ]);
    return { docs, jv, groups, rules, archived: !!row?.archivedAt, merged: row?.mergedIntoId ?? null, name: row?.name };
  };
  const beforeSec = await snapshot(MD.secondary.id);
  const beforePri = await snapshot(MD.primary.id);
  for (const stage of ["documents", "journalLines", "groups", "recurringRules"] as const) {
    const res = await cm.mergeContacts(ctx, {
      primaryId: MD.primary.id,
      secondaryId: MD.secondary.id,
      fieldChoices: { name: "secondary" },
      failAfter: stage,
    });
    const s = await snapshot(MD.secondary.id);
    const q = await snapshot(MD.primary.id);
    assert(
      `M4.${stage} พังหลังย้าย "${stage}" → ทุกตารางกลับที่เดิม + ตัวหลักไม่ถูกแก้`,
      !res.ok && JSON.stringify(s) === JSON.stringify(beforeSec) && JSON.stringify(q) === JSON.stringify(beforePri),
      JSON.stringify({ res, s, beforeSec, q, beforePri }),
    );
  }

  // ═══════════════ M5 fieldChoices ═══════════════
  console.log("\nM5 เลือกค่าทีละฟิลด์:");
  const fA = await mkTemp({ name: "บริษัท คิวซีเลือกค่า เอ จำกัด", taxId: "9100000000011", phone: "076-111-2222", branchCode: "00000" });
  const fB = await mkTemp({ name: "บริษัท คิวซีเลือกค่า บี จำกัด", taxId: "9100000000011", phone: "076-333-4444", branchCode: "00009" });
  const r5 = await cm.mergeContacts(ctx, {
    primaryId: fA,
    secondaryId: fB,
    fieldChoices: { name: "secondary", phone: "secondary", creditTermDays: "primary" },
  });
  assert("M5.1 รวมสำเร็จ", r5.ok, JSON.stringify(r5));
  const afterA = await prisma.accountContact.findUnique({ where: { id: fA }, select: { name: true, phone: true, phoneNorm: true } });
  eq("M5.2 ชื่อของตัวหลักถูกแทนด้วยค่าที่เลือก", afterA?.name, "บริษัท คิวซีเลือกค่า บี จำกัด");
  eq("M5.3 เบอร์ถูกแทน", afterA?.phone, "076-333-4444");
  eq("M5.4 phoneNorm ถูกเขียนคู่กับ phone เสมอ", afterA?.phoneNorm, svc.normalizePhoneTh("076-333-4444"));
  const afterB = await prisma.accountContact.findUnique({ where: { id: fB }, select: { archivedAt: true, mergedIntoId: true } });
  assert("M5.5 ตัวรอง archived + mergedIntoId = ตัวหลัก", !!afterB?.archivedAt && afterB?.mergedIntoId === fA, JSON.stringify(afterB));
  const r5b = await cm.mergeContacts(ctx, { primaryId: fA, secondaryId: fB });
  assert("M5.6 รวมซ้ำคู่เดิม = ปฏิเสธ (idempotent · ข้อความไทย)", !r5b.ok && /รวมไปแล้ว/.test(r5b.reason), JSON.stringify(r5b));

  // ═══════════════ M6 รวมจริงคู่ของ seed ═══════════════
  console.log("\nM6 รวมจริง: ย้ายครบทุกตาราง:");
  needReseed = true;
  const agingBefore = await rep.agingReport(ctx, { direction: "OUT" });
  const beforeTotal =
    (agingBefore.rows.find((r) => r.contactId === MD.primary.id)?.totalSatang ?? 0) +
    (agingBefore.rows.find((r) => r.contactId === MD.secondary.id)?.totalSatang ?? 0);
  const auditBefore = await prisma.auditLog.count({ where: { tenantId: ctx.tenantId, action: "account.contact.merge" } });
  const partyBefore = await prisma.accountContact.findMany({
    where: { id: { in: [MD.primary.id, MD.secondary.id] } },
    select: { id: true, partyId: true },
  });

  const rm = await cm.mergeContacts(ctx, { primaryId: MD.primary.id, secondaryId: MD.secondary.id, actorId: E.ownerUserId });
  assert("M6.1 รวมสำเร็จ", rm.ok, JSON.stringify(rm));
  if (rm.ok) {
    eq("M6.2 ย้ายเอกสารครบ = จำนวนของตัวรอง (14 ใบ)", rm.moved.documents, MD.secondary.docs);
    eq("M6.3 ย้ายบรรทัดสมุดรายวันครบ", rm.moved.journalLines, MD.secondary.journalLines);
    eq("M6.4 ย้ายกฎเอกสารประจำครบ", rm.moved.recurringRules, MD.secondary.recurringRules);
    eq("M6.5 กลุ่มซ้ำถูกลบทิ้ง (ไม่ใช่ย้าย — unique(groupId,contactId))", rm.moved.groupsDeduped, MD.sharedGroups);
    eq("M6.6 กลุ่มที่ไม่ซ้ำถูกย้าย", rm.moved.groupsMoved, MD.secondary.groups - MD.sharedGroups);
  }
  const leftover = await snapshot(MD.secondary.id);
  eq("M6.7 ไม่เหลือเอกสารที่ตัวรอง", leftover.docs, 0);
  eq("M6.8 ไม่เหลือบรรทัดสมุดรายวันที่ตัวรอง", leftover.jv, 0);
  eq("M6.9 ไม่เหลือกลุ่มที่ตัวรอง", leftover.groups, 0);
  eq("M6.10 ไม่เหลือกฎเอกสารประจำที่ตัวรอง", leftover.rules, 0);
  assert("M6.11 ตัวรอง archived + mergedIntoId ชี้ตัวหลัก", leftover.archived && leftover.merged === MD.primary.id, JSON.stringify(leftover));
  const afterPri = await snapshot(MD.primary.id);
  eq("M6.12 เอกสารตัวหลัก = ผลรวมสองฝั่ง (g7: 'หลังรวม เอกสาร N ใบ')", afterPri.docs, MD.totalDocsAfterMerge);
  eq("M6.13 JV ตัวหลัก = ผลรวมสองฝั่ง", afterPri.jv, MD.primary.journalLines + MD.secondary.journalLines);

  {
    // JV: contactId ของบรรทัดที่ย้ายมาต้องชี้ตัวหลักจริงใน DB (ไม่ใช่แค่ตัวเลขที่ฟังก์ชันคืน)
    const jvRows = await prisma.accountJournalLine.count({ where: { systemId: ctx.systemId, contactId: MD.primary.id } });
    eq("M6.14 นับจาก DB: JV ที่ชี้ตัวหลัก = ผลรวม", jvRows, MD.primary.journalLines + MD.secondary.journalLines);
  }
  const agingAfter = await rep.agingReport(ctx, { direction: "OUT", contactId: MD.primary.id });
  eq(
    "M6.15 อายุหนี้ของตัวหลักหลังรวม = ผลรวมของสองฝั่งก่อนรวม",
    agingAfter.rows.find((r) => r.contactId === MD.primary.id)?.totalSatang ?? 0,
    beforeTotal,
  );
  const profileAfter = await cp.contactProfile(ctx, MD.primary.id, { base: `/app/sys/${ctx.systemId}/account` });
  eq("M6.16 โปรไฟล์ตัวหลัก: แท็บเอกสาร = ผลรวม", profileAfter?.tabs.docs, MD.totalDocsAfterMerge);
  const auditAfter = await prisma.auditLog.count({ where: { tenantId: ctx.tenantId, action: "account.contact.merge" } });
  eq("M6.17 เขียน audit 1 แถว (action=account.contact.merge)", auditAfter - auditBefore, 1);
  {
    const a = await prisma.auditLog.findFirst({
      where: { tenantId: ctx.tenantId, action: "account.contact.merge" },
      orderBy: { createdAt: "desc" },
      select: { before: true, after: true, targetId: true },
    });
    const before = a?.before as { secondary?: { documents?: number } } | null;
    assert(
      "M6.18 audit เก็บจำนวนที่ย้ายต่อตาราง (ก่อน/หลัง)",
      a?.targetId === MD.primary.id && before?.secondary?.documents === MD.secondary.docs,
      JSON.stringify({ targetId: a?.targetId, before: a?.before, after: a?.after }),
    );
  }
  {
    const pPri = partyBefore.find((r) => r.id === MD.primary.id)?.partyId ?? null;
    const pSec = partyBefore.find((r) => r.id === MD.secondary.id)?.partyId ?? null;
    if (pPri && pSec && pPri !== pSec) {
      const secParty = await prisma.party.findUnique({ where: { id: pSec }, select: { mergedIntoId: true } });
      eq("M6.19 Party ของตัวรองชี้ไป Party ของตัวหลัก", secParty?.mergedIntoId, pPri);
      const cand = await prisma.partyMergeCandidate.findFirst({
        where: { tenantId: ctx.tenantId, partyAId: pPri < pSec ? pPri : pSec, partyBId: pPri < pSec ? pSec : pPri },
        select: { status: true },
      });
      eq("M6.20 PartyMergeCandidate ของคู่นี้ = MERGED", cand?.status, "MERGED");
    } else {
      assert("M6.19 ทั้งคู่มี Party คนละตัว (ต้องมีเพื่อทดสอบการรวม Party)", false, JSON.stringify({ pPri, pSec }));
    }
  }
  const candsAfter = await cm.listMergeCandidates(ctx);
  assert(
    "M6.21 คู่ที่รวมแล้วหายจากรายการ",
    !candsAfter.some((c) => [c.a.id, c.b.id].includes(MD.secondary.id)),
    JSON.stringify(candsAfter.map((c) => [c.a.code, c.b.code])),
  );

  // ═══════════════ M7 ไม่ใช่คนเดียวกัน (ข้าม) ═══════════════
  console.log("\nM7 ไม่ใช่คนเดียวกัน (ปุ่ม ข้าม):");
  // ใช้คู่ "ชื่อคล้าย" (คนละเบอร์ ⇒ คนละ Party) — คู่ "เบอร์เดียวกัน" ใช้ไม่ได้ตามเหตุผลด้านบน
  const d1 = await cm.dismissMergeCandidate(ctx, nameA, nameB);
  assert("M7.1 บันทึกสำเร็จ", d1.ok, JSON.stringify(d1));
  const candsAfterDismiss = await cm.listMergeCandidates(ctx);
  assert(
    "M7.2 คู่ที่ข้ามแล้วหายจากรายการ",
    !candsAfterDismiss.some((c) => [c.a.id, c.b.id].includes(nameA) && [c.a.id, c.b.id].includes(nameB)),
    "ยังโผล่อยู่",
  );
  {
    const [pa, pb] = await Promise.all([
      prisma.accountContact.findUnique({ where: { id: nameA }, select: { partyId: true } }),
      prisma.accountContact.findUnique({ where: { id: nameB }, select: { partyId: true } }),
    ]);
    const [x, y] = [pa!.partyId!, pb!.partyId!].sort();
    const row = await prisma.partyMergeCandidate.findFirst({ where: { tenantId: ctx.tenantId, partyAId: x, partyBId: y }, select: { status: true } });
    eq("M7.3 สถานะใน PartyMergeCandidate = DISMISSED", row?.status, "DISMISSED");
  }
  const d2 = await cm.dismissMergeCandidate(ctx, nameA, nameA);
  assert("M7.4 ข้ามด้วย id เดียวกัน = ปฏิเสธ", !d2.ok, JSON.stringify(d2));
  const d3 = await cm.dismissMergeCandidate(ctx, phoneA, phoneB);
  assert(
    "M7.5 คู่ที่ผูก Party เดียวกันอยู่แล้ว = ปฏิเสธพร้อมบอกเหตุ (ข้อจำกัดที่รู้ตัว ไม่ใช่พังเงียบ)",
    !d3.ok && /ตัวตนเดียวกัน/.test(d3.reason),
    JSON.stringify(d3),
  );

  // ═══════════════ M8 ตัวนับ + ทะเบียน ═══════════════
  console.log("\nM8 ตัวนับ badge + ทะเบียน route:");
  const openCount = await cm.countOpenMergeCandidates(ctx);
  // เฉลยอิสระ: นับ "คู่" ด้วย self-join (คนละสำนวนกับโค้ดจริงที่ใช้ GROUP BY + n*(n-1)/2)
  const openRows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT (
      (SELECT COUNT(*) FROM "PartyMergeCandidate" WHERE "tenantId" = ${ctx.tenantId} AND "status" = 'OPEN')
      + (SELECT COUNT(*) FROM "AccountContact" a JOIN "AccountContact" b
           ON b."systemId" = a."systemId" AND b."id" > a."id"
          AND regexp_replace(b."taxId", '\D', '', 'g') = regexp_replace(a."taxId", '\D', '', 'g')
         WHERE a."tenantId" = ${ctx.tenantId} AND a."systemId" = ${ctx.systemId}
           AND a."archivedAt" IS NULL AND a."mergedIntoId" IS NULL AND a."taxId" IS NOT NULL
           AND b."archivedAt" IS NULL AND b."mergedIntoId" IS NULL AND b."taxId" IS NOT NULL)
      + (SELECT COUNT(*) FROM "AccountContact" a JOIN "AccountContact" b
           ON b."systemId" = a."systemId" AND b."id" > a."id" AND b."phoneNorm" = a."phoneNorm"
         WHERE a."tenantId" = ${ctx.tenantId} AND a."systemId" = ${ctx.systemId}
           AND a."archivedAt" IS NULL AND a."mergedIntoId" IS NULL AND a."phoneNorm" IS NOT NULL AND a."phoneNorm" <> ''
           AND b."archivedAt" IS NULL AND b."mergedIntoId" IS NULL)
    )::bigint AS n`;
  eq("M8.1 countOpenMergeCandidates = เฉลยอิสระ (party OPEN + คู่เลขภาษี + คู่เบอร์)", openCount, Number(openRows[0]!.n));
  eq("M8.2 guard.ts มี contacts/merge/page.tsx + สิทธิ์แยก", guard.ACCOUNT_PAGE_PERMISSIONS["contacts/merge/page.tsx"], "account.contact.merge");
  const NAV_BASE = "/app/sys/x/account";
  const item = nav.ACCOUNT_NAV(NAV_BASE, true).find((g) => g.key === "contacts")?.items.find((i) => i.testId === "CONTACT_MERGE");
  assert(
    "M8.3 nav 'รวมผู้ติดต่อซ้ำ' = ready + href จริง (ไม่ใช่ 🕓)",
    item?.status === "ready" && item?.href === `${NAV_BASE}/contacts/merge` && item?.label === "รวมผู้ติดต่อซ้ำ",
    JSON.stringify(item),
  );
  eq("M8.4 ฟิลด์ที่เลือกได้ = 9 ช่องตาม g7", cm.MERGE_FIELDS.length, 9);
} finally {
  // ── ล้างผู้ติดต่อทดสอบที่สคริปต์สร้างเอง ──
  for (const id of tempIds) {
    const c = await prisma.accountContact.findUnique({ where: { id }, select: { partyId: true } });
    await prisma.accountContactGroupMember.deleteMany({ where: { contactId: id } });
    await prisma.accountDocument.deleteMany({ where: { contactId: id } });
    await prisma.accountContact.deleteMany({ where: { id } });
    if (c?.partyId) {
      await prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: c.partyId }, { partyBId: c.partyId }] } });
      await prisma.party.deleteMany({ where: { id: c.partyId, tenantId: ctx.tenantId } });
    }
  }
  console.log(`\n🧹 ลบผู้ติดต่อทดสอบ ${tempIds.length} ราย`);

  // ── คืนสภาพ fixture: M6 "รวมจริง" คู่ซ้ำของ seed ไปแล้ว (ย้อนกลับไม่ได้ตามดีไซน์) ⇒ seed ใหม่ + เขียนเฉลยใหม่
  //    ทำให้ชุดนี้ "รันซ้ำได้" และไม่ทิ้งสภาพพังไว้ให้ชุดอื่น (กติกา cleanup ของใบสั่งงาน)
  if (needReseed) {
    console.log("♻️  คืนสภาพชุดข้อมูล QC (seed ใหม่ + เขียนเฉลยใหม่) …");
    const { execFileSync } = await import("node:child_process");
    for (const f of [
      "scripts/seed-acc-v2-qc.mts",
      "scripts/acc-v2-expected-dashboard.mts",
      "scripts/acc-v2-expected-contacts.mts",
      "scripts/acc-v2-expected-contact-profile.mts",
    ]) {
      execFileSync("pnpm", ["exec", "tsx", f], { stdio: ["ignore", "ignore", "inherit"], env: process.env });
      console.log(`   ✓ ${f}`);
    }
  }
}

console.log(`\n===== QC WO 3.4 · รวมผู้ติดต่อซ้ำ สรุป =====`);
console.log(`ผ่าน ${passed} · ตก ${findings.length}`);
if (findings.length > 0) console.log(findings.map((f) => "  - " + f).join("\n"));
if (needReseed) console.log("♻️  คืนสภาพชุดข้อมูล QC เรียบร้อย (seed + เฉลย เขียนใหม่แล้ว)");
await prisma.$disconnect();
process.exit(findings.length === 0 ? 0 : 1);
