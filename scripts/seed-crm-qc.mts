// seed ชุดข้อมูล QC ของ RUN "CRM v2" — ต่อยอดร้าน QC ของระบบสมาชิก (ต้อง seed-member-qc.mts ก่อน)
//
// ใช้:  pnpm exec tsx scripts/seed-crm-qc.mts
// 🔴 โหลด `.env.qc` เท่านั้น (ผ่าน acc-v2-env.loadQcEnv) — `.env` = production
// 🔴 ตัวเลข/กติกาทั้งหมดเป็นสัญญาอยู่ที่ `scripts/crm-qc-env.mts` (CQC) — แก้ที่นั่นก่อนแก้ที่นี่
// 🔴 idempotent: ลบ "ชั้น CRM" ของร้าน QC (crm* · team* · custom* · ผู้ใช้ nok) แล้วสร้างใหม่ — ไม่แตะข้อมูลสมาชิก
// 🔴 ตารางที่ยังไม่มี (เฟสถัดไป: อีเมล/sequence/โควตา/คอมมิชชัน) ข้ามด้วย has(model) — seed โตตามเฟสได้โดยไม่ล้ม
// 🔴 ท้ายสคริปต์ **รัน backfill 6 ตัวของ C1.1** กับร้านนี้ (ถ้ามีไฟล์) ⇒ DB อยู่ในสภาพหลัง backfill เหมือน prod
//
// โครงตาม ledger/CRM-RUN.md §0 ข้อ 1 + พิมพ์เขียว docs/modules/20-crm-v2.md §4

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const cq = (await import("./crm-qc-env.mts" as string)) as { CQC: Any; dayFromToday: (n: number, h?: number) => Date; CRM_BACKFILLS: readonly string[] };
const mq = (await import("./member-qc-env.mts" as string)) as { MQC: Any; resolveMemberScope: (p: Any) => Promise<{ tenantId: string; systemId: string; systems: Record<string, string> } | null> };
const { CQC, dayFromToday, CRM_BACKFILLS } = cq;

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const sys = await import("@/lib/modules/system/service");
const crm = await import("@/lib/modules/crm/service");
const t0 = Date.now();

// model ที่มีใน client นี้ (ตารางของเฟสถัดไปยังไม่มี → ข้าม)
const has = (m: string) => typeof P[m]?.findFirst === "function";

// ═══════════════════ 0. ร้าน QC สมาชิกต้องมีก่อน ═══════════════════
const mscope = await mq.resolveMemberScope(prisma);
if (!mscope) { console.error("❌ ยังไม่มีชุดข้อมูล QC สมาชิก — รัน scripts/seed-member-qc.mts ก่อน"); process.exit(1); }
const tenantId = mscope.tenantId;
const ME = existsSync(mq.MQC.expectedPath) ? JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8")) : null;
if (!ME) { console.error("❌ ไม่พบ member-expected.json"); process.exit(1); }
const units: Record<string, string> = ME.units;
const users: Record<string, { userId: string }> = { owner: ME.users.owner, manager: ME.users.manager, ...ME.users.staff };

// ═══════════════════ 1. ลบชั้น CRM เดิม (ลูกก่อนแม่ · ลูกที่ไม่มี tenantId ลบผ่าน id ของแม่ในร้านนี้) ═══════════════════
const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ตารางอาจยังไม่มี */ } };
const idsOf = async (m: string) => (has(m) ? (await P[m].findMany({ where: { tenantId }, select: { id: true } })).map((r: { id: string }) => r.id) : []);
const delChildren = async (child: string, fk: string, parent: string) => { if (!has(child)) return; const ids = await idsOf(parent); if (ids.length) await d(() => P[child].deleteMany({ where: { [fk]: { in: ids } } })); };
// ลูก (ไม่มี tenantId) → ระบุ fk + แม่
await delChildren("customRecordValueHistory", "recordId", "customRecord");
await delChildren("customRecordValue", "recordId", "customRecord");
await delChildren("crmEmailEvent", "emailId", "crmEmailMessage");
await delChildren("crmScoreLog", "contactId", "crmContact");
await delChildren("crmTrackedClick", "linkId", "crmTrackedLink");
await delChildren("crmWebEvent", "sessionId", "crmWebSession");
await delChildren("crmSequenceStep", "sequenceId", "crmSequence");
await delChildren("crmDealStageHistory", "dealId", "crmDeal");
await delChildren("crmDealLine", "dealId", "crmDeal");
await delChildren("crmDealContact", "dealId", "crmDeal");
await delChildren("crmCompanyContact", "companyId", "crmCompany");
await delChildren("teamMember", "teamId", "team");
// แม่ (มี tenantId)
for (const m of [
  "customRecord", "customObject",
  "crmCommission", "crmCommissionRule", "crmQuota", "crmVisibilityPolicy", "crmPortalRequest", "crmPortalAccess",
  "crmEmailMessage", "crmEmailTemplate", "crmEmailUserSetting", "crmSequenceEnrollment", "crmSequence",
  "crmAssignmentRule", "crmScoreRule", "crmTrackedLink", "crmWebSession",
  "crmActivity", "crmDeal", "crmStage", "crmPipeline", "crmCompany", "crmContact", "crmLostReason", "team",
]) if (has(m)) await d(() => P[m].deleteMany({ where: { tenantId } }));
// ส่วน/ฟิลด์ของวัตถุกำหนดเอง (objectKey ≠ customer) — ของสมาชิกไม่แตะ
await d(() => P.memberFieldValueHistory.deleteMany({ where: { field: { tenantId, objectKey: { not: "customer" } } } }));
await d(() => P.memberField.deleteMany({ where: { tenantId, objectKey: { not: "customer" } } }));
await d(() => P.memberSection.deleteMany({ where: { tenantId, objectKey: { not: "customer" } } }));
await d(() => P.membership.deleteMany({ where: { user: { email: CQC.users.nok.email } } }));
await d(() => P.user.deleteMany({ where: { email: CQC.users.nok.email } }));
// Party COMPANY ของบริษัท QC (จับด้วยเลขภาษี/ชื่อ) — สมาชิกไม่ใช้
await d(() => P.party.deleteMany({ where: { tenantId, kind: "COMPANY", OR: [{ taxId: { startsWith: "01055" } }, { name: { startsWith: "บริษัท คิวซี" } }, { name: CQC.companies.textCompany }] } }));

// ═══════════════════ 2. ระบบเพิ่ม (CRM · INVENTORY · ACCOUNT) ═══════════════════
const systems: Record<string, string> = { ...mscope.systems };
const LABEL: Record<string, string> = { CRM: "CRM", INVENTORY: "สินค้า", ACCOUNT: "บัญชี" };
for (const type of CQC.extraSystems as string[]) {
  if (systems[type]) continue;
  const s = await sys.createSystem(tenantId, type as Any, `${LABEL[type] ?? type} · CRM QC`);
  systems[type] = s.id;
  for (const key of Object.keys(units)) await sys.linkUnit(tenantId, s.id, units[key]!);
}
const SYS = systems.CRM!;
const ctx = { tenantId, systemId: SYS };

// ═══════════════════ 3. ผู้ใช้ nok (หัวหน้าทีมกระบี่) + ทีม 2 ═══════════════════
const nokUser = await prisma.user.create({ data: { email: CQC.users.nok.email, name: CQC.users.nok.name } });
await prisma.membership.create({ data: { userId: nokUser.id, tenantId, role: "STAFF", unitAccess: [units[CQC.users.nok.unit]!], permissions: { "crm.contact.read": true, "crm.contact.create": true, "crm.contact.update": true, "crm.deal.read": true, "crm.deal.create": true, "crm.deal.move": true, "crm.activity.create": true, "crm.activity.complete": true }, acceptedAt: new Date() } });
users.nok = { userId: nokUser.id };
// สิทธิ์ crm ให้ thana/kata (STAFF เดิม) — เพิ่มโดยไม่ทับของสมาชิก
for (const k of ["thana", "kata"]) {
  const m = await P.membership.findFirst({ where: { userId: users[k]!.userId, tenantId } });
  if (m) await P.membership.update({ where: { id: m.id }, data: { permissions: { ...(m.permissions as Record<string, boolean>), "crm.contact.read": true, "crm.contact.create": true, "crm.contact.update": true, "crm.deal.read": true, "crm.deal.create": true, "crm.deal.move": true, "crm.activity.create": true, "crm.activity.complete": true } } });
}
const teams: Record<string, string> = {};
if (has("team")) {
  for (const t of CQC.teams as Any[]) {
    const row = await P.team.create({ data: { tenantId, name: t.name, leadUserId: users[t.lead]!.userId, unitIds: [units[t.unit]!] } });
    teams[t.key] = row.id;
    const memberKeys: string[] = Array.from(new Set([...t.members, t.lead]));
    for (const k of memberKeys) await P.teamMember.create({ data: { teamId: row.id, userId: users[k]!.userId, role: k === t.lead ? "LEAD" : "MEMBER" } });
  }
}
const teamOfUser = (k: string) => (k === "thana" || k === "pook" ? teams.phuket ?? null : k === "nok" || k === "kata" ? teams.krabi ?? null : null);

// ═══════════════════ 4. pipeline 2 + เหตุผลแพ้ ═══════════════════
const b2b = await crm.ensureCrm(ctx);
await P.crmPipeline.update({ where: { id: b2b.id }, data: { name: CQC.pipelines.b2b.name } });
const retail = await P.crmPipeline.create({ data: { tenantId, systemId: SYS, name: CQC.pipelines.retail.name, isDefault: false, sortOrder: 1, stages: { create: (CQC.pipelines.retail.stages as string[]).map((name: string, i: number) => ({ tenantId, systemId: SYS, name, kind: i === 2 ? "WON" : i === 3 ? "LOST" : "OPEN", probability: i === 0 ? 20 : i === 1 ? 60 : i === 2 ? 100 : 0, sortOrder: i })) } }, include: { stages: { orderBy: { sortOrder: "asc" } } } });
const b2bStages = b2b.stages as { id: string; kind: string; sortOrder: number }[];
const retailStages = retail.stages as { id: string; kind: string; sortOrder: number }[];
const lostReasonIds: string[] = [];
if (has("crmLostReason")) for (const [i, label] of (CQC.lostReasons as string[]).entries()) {
  const r = await P.crmLostReason.create({ data: { tenantId, systemId: SYS, key: `lr${i + 1}`, label, sortOrder: i, active: true, isSystem: i === 4 } });
  lostReasonIds.push(r.id);
}

// ═══════════════════ 5. บริษัท 20 (Party COMPANY · 15 มีเลขภาษี) ═══════════════════
const companyIds: string[] = [];
if (has("crmCompany")) {
  for (let i = 1; i <= CQC.companies.total; i += 1) {
    const withTax = i <= CQC.companies.withTaxId;
    const party = await P.party.create({ data: { tenantId, kind: "COMPANY", name: CQC.companies.nameOf(i), taxId: withTax ? CQC.companies.taxIdOf(i) : null, branchCode: "00000", email: `info@${CQC.companies.domainOf(i)}` } });
    const owner = i <= 10 ? "thana" : i <= 15 ? "nok" : "manager";
    const c = await P.crmCompany.create({ data: { tenantId, systemId: SYS, partyId: party.id, name: CQC.companies.nameOf(i), taxId: withTax ? CQC.companies.taxIdOf(i) : null, branchCode: "00000", emailDomain: CQC.companies.domainOf(i), industry: i % 2 ? "ท่องเที่ยว/ทัวร์" : "โรงแรม", size: ["MICRO", "SMALL", "MEDIUM", "LARGE"][i % 4], website: `https://${CQC.companies.domainOf(i)}`, ownerUserId: users[owner]!.userId, teamId: teamOfUser(owner), lifecycleStage: i <= 10 ? "CUSTOMER" : "PROSPECT", score: (i * 7) % 100 } });
    companyIds.push(c.id);
  }
}

// ═══════════════════ 6. ผู้ติดต่อ 80 (ผ่าน service v1 + เติมคอลัมน์ v2) ═══════════════════
const FIRST = ["วรรณา", "สมพงษ์", "นภา", "กิตติ", "อรุณี", "ประยุทธ", "ศิริพร", "ธีระ", "มณีรัตน์", "อนงค์"];
const LAST = ["ศิริพงษ์", "แก้วมณี", "อินทร์แก้ว", "บุญมาก", "ทองดี", "พงษ์พันธ์", "สุขใจ", "รัตนโชติ"];
const contactIds: string[] = [];
for (let i = 1; i <= CQC.contacts.total; i += 1) {
  const first = FIRST[(i - 1) % 10]!; const last = LAST[Math.floor((i - 1) / 10) % 8]!;
  const isTextCo = i >= 74 && i <= 76;
  const coIdx = i <= 60 ? ((i - 1) % 20) + 1 : null;
  const owner = CQC.contacts.ownerOf(i);
  const c = await crm.createContact(ctx, {
    name: `${first} ${last}${i >= 77 ? " (ซ้ำ)" : ""}`,
    phone: CQC.contacts.phoneOf(i),
    email: i >= 77 ? null : CQC.contacts.emailOf(i),
    company: isTextCo ? CQC.companies.textCompany : coIdx ? CQC.companies.nameOf(coIdx) : null,
    source: i % 4 === 0 ? "WEB_FORM" : i % 4 === 1 ? "LINE" : i % 4 === 2 ? "REFERRAL" : "EVENT",
    ownerUserId: users[owner]!.userId,
  });
  contactIds.push(c.id);
  const patch: Record<string, unknown> = {};
  const cols = await P.crmContact.findUnique({ where: { id: c.id } });
  if (cols && "leadStatus" in cols) Object.assign(patch, {
    firstName: first, lastName: last,
    leadStatus: i <= 30 ? "QUALIFIED" : i <= 60 ? "CONTACTED" : "NEW",
    lifecycleStage: i <= 10 ? "CUSTOMER" : i <= 60 ? "PROSPECT" : "LEAD",
    score: (i * 13) % 100, scoreBand: (i * 13) % 100 >= 50 ? "HOT" : (i * 13) % 100 >= 20 ? "WARM" : "COLD",
    teamId: teamOfUser(owner), jobTitle: coIdx ? (((i - 1) % 3) === 0 ? "ผู้จัดการฝ่ายกิจกรรม" : ((i - 1) % 3) === 1 ? "ฝ่ายจัดซื้อ" : "ฝ่ายบัญชี") : null,
    sourceKind: i % 4 === 0 ? "WEB_FORM" : i % 4 === 1 ? "LINE_OA" : i % 4 === 2 ? "REFERRAL" : "OTHER",
    sourceDetail: i % 4 === 0 ? { utm: { source: "facebook", medium: "cpc", campaign: "b2b_q4" }, pageUrl: "https://siamdive.example.com/corporate" } : null,
    lastActivityAt: dayFromToday(-(i % 20)),
  });
  if (coIdx && has("crmCompanyContact") && companyIds[coIdx - 1]) {
    const primary = ((i - 1) % 3) === 0;
    await P.crmCompanyContact.create({ data: { companyId: companyIds[coIdx - 1], contactId: c.id, role: primary ? "DECISION_MAKER" : ((i - 1) % 3) === 1 ? "COORDINATOR" : "BILLING", jobTitle: patch.jobTitle ?? null, isPrimary: primary } });
    if (primary) patch.companyId = companyIds[coIdx - 1];
  }
  if (Object.keys(patch).length) await P.crmContact.update({ where: { id: c.id }, data: patch });
}

// ═══════════════════ 7. ดีล 60 (1..45 B2B · 46..60 retail) ═══════════════════
const dealIds: string[] = [];
const stageFor = (i: number) => {
  const st = i <= 45 ? b2bStages : retailStages;
  if (i <= 10) return st.find((s) => s.kind === "WON")!;
  if (i <= 15) return st.find((s) => s.kind === "LOST")!;
  const open = st.filter((s) => s.kind === "OPEN");
  return open[(i - 16) % open.length]!;
};
for (let i = 1; i <= CQC.deals.total; i += 1) {
  const st = stageFor(i);
  const open = (i <= 45 ? b2bStages : retailStages).filter((s) => s.kind === "OPEN");
  const dl = await crm.createDeal(ctx, { contactId: contactIds[i - 1]!, pipelineId: i <= 45 ? b2b.id : retail.id, stageId: open[0]!.id, title: `ดีล QC ${String(i).padStart(2, "0")} — ${i <= 45 ? "แพ็กเกจดำน้ำองค์กร" : "คอร์สรายบุคคล"}`, valueSatang: CQC.deals.valueOf(i), expectedCloseAt: dayFromToday(i <= 15 ? -5 : (i % 60) + 3) });
  if (st.id !== open[0]!.id) await crm.moveDeal(ctx, dl.id, st.id);
  dealIds.push(dl.id);
  const owner = CQC.contacts.ownerOf(i);
  const row = await P.crmDeal.findUnique({ where: { id: dl.id } });
  const patch: Record<string, unknown> = { ownerUserId: users[owner]!.userId };
  if (row && "stageEnteredAt" in row) {
    const stale = i >= 16 && i <= 21;
    Object.assign(patch, {
      teamId: teamOfUser(owner), companyId: i <= 60 && companyIds.length ? companyIds[(i - 1) % 20] ?? null : null,
      stageEnteredAt: dayFromToday(stale ? -40 : -(i % 10)), lastActivityAt: dayFromToday(stale ? -CQC.deals.staleDays : -(i % 7)),
      forecastCategory: i % 5 === 0 ? "COMMIT" : i % 5 === 1 ? "BEST_CASE" : "PIPELINE",
      lostReasonId: i > 10 && i <= 15 && lostReasonIds.length ? lostReasonIds[(i - 11) % lostReasonIds.length] : null,
      sourceKind: i % 3 === 0 ? "WEB_FORM" : "LINE_OA",
    });
  }
  await P.crmDeal.update({ where: { id: dl.id }, data: patch });
}

// ═══════════════════ 8. กิจกรรม 200 (3/ดีล = 180 + 20 บนผู้ติดต่อไม่มีดีล) ═══════════════════
const TYPES = ["CALL", "MEETING", "EMAIL", "LINE", "TASK", "NOTE"] as const;
let actCount = 0;
for (let i = 1; i <= CQC.deals.total; i += 1) {
  for (let k = 0; k < CQC.activities.perDeal; k += 1) {
    const type = TYPES[(i + k) % 6]!;
    const done = k < 2;
    const a = await crm.addActivity(ctx, { contactId: contactIds[i - 1]!, dealId: dealIds[i - 1]!, type, title: `${type} ครั้งที่ ${k + 1} ของดีล ${i}`, dueAt: dayFromToday(done ? -(k + 1) : 2) });
    if (done) await crm.completeActivity(ctx, a.id);
    const row = await P.crmActivity.findUnique({ where: { id: a.id } });
    const v2: Record<string, unknown> = { ownerUserId: users[CQC.contacts.ownerOf(i)]!.userId };
    if (row && "direction" in row) Object.assign(v2, { direction: type === "NOTE" || type === "TASK" ? null : k % 2 ? "IN" : "OUT", channel: type === "CALL" ? "PHONE" : type === "EMAIL" ? "EMAIL" : type === "LINE" ? "LINE" : null, startAt: done ? dayFromToday(-(k + 1), 10) : null, durationSec: type === "CALL" && done ? 180 + i : null, outcome: type === "CALL" && done ? "สนใจ" : null, source: "MANUAL" });
    await P.crmActivity.update({ where: { id: a.id }, data: v2 });
    actCount += 1;
  }
}
for (let i = 61; i <= 80; i += 1) {
  const a = await crm.addActivity(ctx, { contactId: contactIds[i - 1]!, type: "TASK", title: `ติดตาม lead ${i}`, dueAt: dayFromToday((i % 5) - 2) });
  await P.crmActivity.update({ where: { id: a.id }, data: { ownerUserId: users[CQC.contacts.ownerOf(i)]!.userId } });
  actCount += 1;
}

// ═══════════════════ 9. วัตถุกำหนดเอง "สัญญา" (parent COMPANY · 12 รายการ) ═══════════════════
let contractObjectId: string | null = null; let contractRecords = 0;
if (has("customObject") && has("memberSection") && companyIds.length) {
  const co = CQC.customObjects.contract;
  const obj = await P.customObject.create({ data: { tenantId, systemId: SYS, key: co.key, label: co.label, labelPlural: co.labelPlural, icon: "doc", parentType: co.parentType, titleFieldKey: "contractNo", showAsTab: true, portalVisible: true, sortOrder: 0 } });
  contractObjectId = obj.id;
  const sec = await P.memberSection.create({ data: { tenantId, systemId: SYS, objectKey: co.key, key: "main", label: "รายละเอียดสัญญา", columns: 2, sortOrder: 0, isSystem: false } });
  const fieldDefs = [["contractNo", "เลขที่สัญญา", "TEXT"], ["startAt", "วันเริ่ม", "DATE"], ["endAt", "วันสิ้นสุด", "DATE"], ["valueSatang", "มูลค่า", "MONEY"], ["autoRenew", "ต่ออายุอัตโนมัติ", "BOOLEAN"]];
  const fields: Record<string, string> = {};
  for (const [i, [key, label, type]] of fieldDefs.entries()) {
    const f = await P.memberField.create({ data: { tenantId, systemId: SYS, sectionId: sec.id, objectKey: co.key, key, label, type, sortOrder: i, filterable: true, required: key === "contractNo" } });
    fields[key!] = f.id;
  }
  for (let i = 1; i <= co.records; i += 1) {
    const companyId = companyIds[(i - 1) % 12]!;
    const rec = await P.customRecord.create({ data: { tenantId, systemId: SYS, objectId: obj.id, parentType: "COMPANY", parentId: companyId, title: `CT-2569-${String(i).padStart(3, "0")}`, ownerUserId: users.manager!.userId, createdById: users.manager!.userId } });
    const vals: [string, Record<string, unknown>][] = [
      ["contractNo", { valueText: `CT-2569-${String(i).padStart(3, "0")}` }],
      ["startAt", { valueDate: dayFromToday(-300 + i * 10) }],
      ["endAt", { valueDate: dayFromToday(i <= 4 ? 20 + i : 65 + i * 10) }], // 4 สัญญาหมดใน 30 วัน (ใช้ทดสอบกฎ field_due)
      ["valueSatang", { valueNumber: 100_000_00 * i }],
      ["autoRenew", { valueBool: i % 2 === 0 }],
    ];
    for (const [k, v] of vals) await P.customRecordValue.create({ data: { recordType: "CUSTOM", recordId: rec.id, fieldId: fields[k]!, ...v } });
    contractRecords += 1;
  }
  await P.customObject.update({ where: { id: obj.id }, data: { recordCount: contractRecords } });
}

// ═══════════════════ 10. backfill 6 ตัว (ถ้ามีไฟล์) ═══════════════════
const backfillRan: string[] = [];
for (const s of CRM_BACKFILLS) {
  if (!existsSync(`scripts/${s}`)) continue;
  const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${s}`, "--tenant", CQC.tenantSlug], { encoding: "utf8", env: process.env, timeout: 600_000 });
  if (r.status !== 0) { console.error(`❌ backfill ${s} ล้ม\n${(r.stdout ?? "") + (r.stderr ?? "")}`.slice(-2000)); process.exit(1); }
  backfillRan.push(s);
}

// ═══════════════════ 11. เฉลย ═══════════════════
const count = async (m: string, where: Record<string, unknown> = { tenantId }) => (has(m) ? P[m].count({ where }) : 0);
const expected = {
  _readme: "เฉลยของชุดข้อมูล QC CRM v2 — เขียนโดย scripts/seed-crm-qc.mts ทุกครั้งที่ seed · ข้อสอบ qc-crm-*.mts อ่านไฟล์นี้",
  generatedAt: new Date().toISOString(), today: CQC.today, oracleValidUntil: CQC.oracleValidUntil,
  tenantId, systemId: SYS, systems, units, teams,
  users: { owner: users.owner, manager: users.manager, thana: users.thana, pook: users.pook, kata: users.kata, nok: users.nok },
  pipelines: { b2b: { id: b2b.id, stages: b2bStages.map((s) => s.id) }, retail: { id: retail.id, stages: retailStages.map((s) => s.id) } },
  lostReasonIds, companyIds, contactIds, dealIds, contractObjectId,
  counts: {
    companies: companyIds.length, contacts: contactIds.length, deals: dealIds.length, dealsWon: CQC.deals.won, dealsLost: CQC.deals.lost, dealsOpen: CQC.deals.open,
    staleCandidates: CQC.deals.stale, activities: actCount, contractRecords, teams: Object.keys(teams).length,
    companyContacts: await count("crmCompanyContact", {}), stageHistory: await count("crmDealStageHistory", {}),
    textCompanyContacts: CQC.contacts.textCompany, duplicatePairs: CQC.contacts.duplicates,
  },
  backfillRan,
};
writeFileSync(CQC.expectedPath, JSON.stringify(expected, null, 2));
console.log(`\n✅ seed CRM: ร้าน ${tenantId} · ระบบ CRM ${SYS} · บริษัท ${companyIds.length} · ผู้ติดต่อ ${contactIds.length} · ดีล ${dealIds.length} · กิจกรรม ${actCount} · สัญญา ${contractRecords} · ทีม ${Object.keys(teams).length} · backfill ${backfillRan.length}/${CRM_BACKFILLS.length} · เฉลย ${CQC.expectedPath} · ${Math.round((Date.now() - t0) / 1000)}s`);
await prisma.$disconnect();
