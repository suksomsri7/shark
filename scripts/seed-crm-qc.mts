// seed ชุดข้อมูล QC ของ RUN "CRM v2" — ต่อยอดร้าน QC ของระบบสมาชิก (ต้อง seed-member-qc.mts ก่อน)
//
// ใช้:  pnpm exec tsx scripts/seed-crm-qc.mts
// 🔴 โหลด `.env.qc` เท่านั้น (ผ่าน acc-v2-env.loadQcEnv) — `.env` = production
// 🔴 ตัวเลข/กติกาทั้งหมดเป็นสัญญาอยู่ที่ `scripts/crm-qc-env.mts` (CQC) — แก้ที่นั่นก่อนแก้ที่นี่
// 🔴 idempotent: ลบ "ชั้น CRM" ของร้าน QC (crm* · team* · custom* · ผู้ใช้ nok) แล้วสร้างใหม่ — ไม่แตะข้อมูลสมาชิก
// 🔴 ตารางที่ยังไม่มี (เฟสถัดไป: อีเมล/sequence/โควตา/คอมมิชชัน) ข้ามด้วย has(model) — seed โตตามเฟสได้โดยไม่ล้ม
// 🔴 ชื่อตาราง partyId (C11) แก้แล้วในใบ C0.1: 9 ตารางจริง 2 กลุ่ม (PARTY_LINK_NEW_COLUMN / PARTY_LINK_EXISTING_COLUMN)
//    — `HotelBooking`/`ClinicPatient` ไม่มีอยู่จริง · `PosSale` ไม่อยู่ในรายการ · เขียนลงเฉลยไว้ให้ข้อสอบอ่าน
// 🔴 ท้ายสคริปต์ **รัน backfill 6 ตัวของ C1.1** กับร้านนี้ (ถ้ามีไฟล์) ⇒ DB อยู่ในสภาพหลัง backfill เหมือน prod
//
// โครงตาม ledger/CRM-RUN.md §0 ข้อ 1 + พิมพ์เขียว docs/modules/20-crm-v2.md §4

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const cq = (await import("./crm-qc-env.mts" as string)) as {
  CQC: Any; dayFromToday: (n: number, h?: number) => Date; CRM_BACKFILLS: readonly string[];
  PARTY_LINK_NEW_COLUMN: readonly string[]; PARTY_LINK_EXISTING_COLUMN: readonly string[]; PARTY_LINK_TABLES: readonly string[];
};
const mq = (await import("./member-qc-env.mts" as string)) as { MQC: Any; resolveMemberScope: (p: Any) => Promise<{ tenantId: string; systemId: string; systems: Record<string, string> } | null> };
const { CQC, dayFromToday, CRM_BACKFILLS } = cq;
const { PARTY_LINK_NEW_COLUMN, PARTY_LINK_EXISTING_COLUMN, PARTY_LINK_TABLES } = cq;

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const sys = await import("@/lib/modules/system/service");
const crm = await import("@/lib/modules/crm/service");
// กติกาเดียวกับที่ moveDeal ใช้ (kind/closedAt/lifecycle) — เมล็ดข้อมูลลอกพฤติกรรม ไม่ลอกโค้ด
const crmRules = await import("@/lib/modules/crm/rules");
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
  "crmFileLink", "crmContactConsent", // ตารางใหม่ของ crm_v2_a (ลูกของ contact/company/deal — ต้องลบก่อนแม่)
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

// แถวธุรกรรม 9 ตาราง (C11 · CQC.businessRows) + ของประกอบ (ช่าง/บริการ/สินทรัพย์/ประเภทคิว/อีเวนต์/คอร์ส/ประเภทห้อง)
//   จับด้วยป้าย `qc-crm-c11` เท่านั้น — แถวธุรกรรมอื่นของร้าน (ของชุดสมาชิก) ไม่แตะ
const BR_TAG = CQC.businessRows.tag as string;
const tagged = (col: string) => ({ tenantId, [col]: { contains: BR_TAG } });
// 🔴 ลบแบบ "ล้มดัง ๆ พร้อมชื่อตาราง" (ไม่ใช่ d() ที่กลืน error) — แถวค้าง = รอบถัดไปชน unique QCC11/C11/SO-QC11-*
//    แล้วพังกลางทางแบบหาต้นเหตุยาก ⇒ หยุดตรงนี้เลยพร้อมบอกว่าตารางไหน
const must = async (table: string, f: () => Promise<unknown>) => {
  try { await f(); } catch (e) { console.error(`❌ ลบแถวป้าย ${BR_TAG} ในตาราง ${table} ไม่สำเร็จ — ${(e as Error)?.message?.slice(0, 200)}`); process.exit(1); }
};
await must("appointment", () => P.appointment.deleteMany({ where: tagged("customerName") }));
await must("bookingService", () => P.bookingService.deleteMany({ where: tagged("name") }));
await must("bookingStaff", () => P.bookingStaff.deleteMany({ where: tagged("name") }));
await must("shopOrder", () => P.shopOrder.deleteMany({ where: { OR: [tagged("customerName"), { tenantId, code: { startsWith: "SO-QC11-" } }] } }));
await must("rentalBooking", () => P.rentalBooking.deleteMany({ where: tagged("customerName") }));
await must("rentalAsset", () => P.rentalAsset.deleteMany({ where: tagged("name") }));
await must("queueTicket", () => P.queueTicket.deleteMany({ where: tagged("contactName") }));
await must("queueTicket(QCC11)", () => P.queueTicket.deleteMany({ where: { tenantId, type: { code: "QCC11" } } }));
await must("queueType", () => P.queueType.deleteMany({ where: { OR: [tagged("name"), { tenantId, code: "QCC11" }, { tenantId, prefix: "C11" }] } }));
await must("clinicVisit", () => P.clinicVisit.deleteMany({ where: tagged("symptom") }));
await must("patientRecord", () => P.patientRecord.deleteMany({ where: tagged("name") }));
await must("ticketOrder", () => P.ticketOrder.deleteMany({ where: { OR: [tagged("buyerName"), { tenantId, orderNo: { startsWith: "TO-QC11-" } }] } }));
await must("ticketEvent", () => P.ticketEvent.deleteMany({ where: tagged("name") }));
await must("schoolEnrollment", () => P.schoolEnrollment.deleteMany({ where: tagged("studentName") }));
await must("schoolClass", () => P.schoolClass.deleteMany({ where: tagged("name") }));
await must("schoolCourse", () => P.schoolCourse.deleteMany({ where: tagged("name") }));
await must("hotelReservation", () => P.hotelReservation.deleteMany({ where: { OR: [tagged("guestName"), { tenantId, code: { startsWith: "HR-QC11-" } }] } }));
await must("hotelRoomType", () => P.hotelRoomType.deleteMany({ where: tagged("name") }));

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
    for (const k of memberKeys) await P.teamMember.create({ data: { tenantId, teamId: row.id, userId: users[k]!.userId, role: k === t.lead ? "LEAD" : "MEMBER" } });
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
    await P.crmCompanyContact.create({ data: { tenantId, companyId: companyIds[coIdx - 1], contactId: c.id, role: primary ? "DECISION_MAKER" : ((i - 1) % 3) === 1 ? "COORDINATOR" : "BILLING", jobTitle: patch.jobTitle ?? null, isPrimary: primary } });
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
  dealIds.push(dl.id);
  const owner = CQC.contacts.ownerOf(i);
  const row = await P.crmDeal.findUnique({ where: { id: dl.id } });
  const patch: Record<string, unknown> = { ownerUserId: users[owner]!.userId };
  // 🔴 ห้ามเรียก `crm.moveDeal` ในเมล็ดข้อมูล (เคยเรียกจนถึง 18 ก.ย. 2569 — เป็นบั๊ก):
  //    moveDeal ยิง event `crm.deal.won` ใน tx เดียวกัน (src/lib/modules/crm/service.ts:163) และ consumer
  //    `onCrmDealWon` (src/lib/member-bridges.ts:616) **สมัครสมาชิกให้ 1 คนต่อดีลที่ชนะ** ⇒ ชุดข้อมูลสมาชิก
  //    ของร้าน QC บวมเงียบ ๆ 10 คน (source=CRM) ตอนที่ชุดข้อสอบอื่น drain outbox ทีหลัง →
  //    `qc-member-m1.9` (ด่าน D11 ของทุกใบ) ตกจาก 30/15/10/5 เป็น 40/15/10/5 โดยไม่มีใครรู้ว่ามาจากไหน
  //    ⇒ เมล็ดข้อมูล "สร้างสถานะ" เท่านั้น ห้ามปลอมเหตุการณ์ธุรกิจที่ไปแก้ข้อมูลของโมดูลอื่น
  //    ดีล 1..15 จึงถูกวางไว้ในขั้นสุดท้ายด้วยการเขียนฟิลด์ชุดเดียวกับที่ moveDeal เขียน (stageId · kind · closedAt)
  //    โดยคิดค่าจาก `rules.dealStateForStage` ตัวเดียวกัน (ห้าม hardcode) + ผลข้างเคียงฝั่งผู้ติดต่อของ WON
  //    (`rules.lifecycleAfterDealWon`) — ต่างจากของเดิมแค่ "ไม่มี event" เท่านั้น
  if (st.id !== open[0]!.id) {
    const state = crmRules.dealStateForStage(st.kind as Any, new Date());
    Object.assign(patch, { stageId: st.id, kind: state.kind, closedAt: state.closedAt });
    if (st.kind === "WON") {
      const c = await P.crmContact.findUnique({ where: { id: contactIds[i - 1]! } });
      if (c) {
        const next = crmRules.lifecycleAfterDealWon(c.lifecycleStage);
        if (next !== c.lifecycleStage) await P.crmContact.update({ where: { id: c.id }, data: { lifecycleStage: next } });
      }
    }
  }
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
    for (const [k, v] of vals) await P.customRecordValue.create({ data: { tenantId, recordType: "CUSTOM", recordId: rec.id, fieldId: fields[k]!, ...v } });
    contractRecords += 1;
  }
  await P.customObject.update({ where: { id: obj.id }, data: { recordCount: contractRecords } });
}

// ═══════════════════ 9.5 แถวธุรกรรม 9 ตาราง (C11 · สัญญา CQC.businessRows · ใบ C1.1) ═══════════════════
// 🔴 สร้าง "สถานะ" ตรงด้วย prisma — ห้ามผ่าน service ของโมดูลเหล่านั้น: service ยิง event/สมัครสมาชิก
//    (จองคิว → member.findOrCreate) ⇒ ชุดข้อมูลสมาชิกบวม (บทเรียน C0.1) · และ partyId **ปล่อยว่าง** โดยตั้งใจ
//    ให้ backfill `party-links` ด้านล่างเป็นคนเติม — พิสูจน์ว่า backfill จับคู่ Party เดิมของผู้ติดต่อ QC ได้จริง
// 🔴 ระบบเหล่านี้เป็น "ประเภทสาขา" (UnitType) ไม่ใช่ AppSystem (SystemType ไม่มี SHOP/RENTAL/…) ⇒ ใช้สาขา patong เดิม
//    ไม่สร้างสาขา/ระบบใหม่ (CQC.extraSystems ไม่ต้องขยาย — ชุดข้อมูลสมาชิกไม่ถูกแตะ)
// ป้ายรายแถว = คำเต็ม `qc-crm-c11:<ตาราง>:<j>` ในคอลัมน์ป้ายของตาราง (PARTY_LINK_IDENTITY[t].tagColumn)
let businessRows = 0;
{
  const U = units.patong!;
  const BR = CQC.businessRows;
  const phoneFor = (t: string, j: number) => CQC.contacts.phoneOf(BR.contactIndexOf(t, j)) as string;
  const label = (t: string, j: number) => `ลูกค้า QC ${BR.rowTagOf(t, j)}`;
  const staff = await P.bookingStaff.create({ data: { tenantId, unitId: U, name: `ช่าง ${BR_TAG}` } });
  const service = await P.bookingService.create({ data: { tenantId, unitId: U, name: `บริการ ${BR_TAG}`, durationMin: 60 } });
  const asset = await P.rentalAsset.create({ data: { tenantId, unitId: U, name: `อุปกรณ์ ${BR_TAG}` } });
  const qType = await P.queueType.create({ data: { tenantId, unitId: U, code: "QCC11", name: `คิว ${BR_TAG}`, prefix: "C11" } });
  const event = await P.ticketEvent.create({ data: { tenantId, unitId: U, name: `อีเวนต์ ${BR_TAG}`, startAt: dayFromToday(10) } });
  const course = await P.schoolCourse.create({ data: { tenantId, unitId: U, name: `คอร์ส ${BR_TAG}` } });
  const klass = await P.schoolClass.create({ data: { tenantId, unitId: U, courseId: course.id, name: `รอบ ${BR_TAG}` } });
  const roomType = await P.hotelRoomType.create({ data: { tenantId, unitId: U, name: `ห้อง ${BR_TAG}` } });
  for (let j = 1; j <= BR.perTable; j += 1) {
    const at = dayFromToday(3 + j, 10);
    await P.appointment.create({ data: { tenantId, unitId: U, staffId: staff.id, serviceId: service.id, startAt: at, endAt: new Date(at.getTime() + 3_600_000), customerName: label("Appointment", j), customerPhone: phoneFor("Appointment", j), source: "STAFF" } });
    await P.shopOrder.create({ data: { tenantId, unitId: U, code: `SO-QC11-${j}`, customerName: label("ShopOrder", j), customerPhone: phoneFor("ShopOrder", j) } });
    await P.rentalBooking.create({ data: { tenantId, unitId: U, assetId: asset.id, customerName: label("RentalBooking", j), customerPhone: phoneFor("RentalBooking", j), startDate: dayFromToday(5 + j * 3), endDate: dayFromToday(6 + j * 3) } });
    // QueueTicket: contactName เป็น optional ⇒ ต้องเขียนเสมอ (คอลัมน์ป้าย — crm-qc-env.mts PARTY_LINK_IDENTITY)
    await P.queueTicket.create({ data: { tenantId, unitId: U, typeId: qType.id, businessDate: CQC.today, seq: j, number: `C11${String(j).padStart(3, "0")}`, priority: 0, channel: "STAFF", contactName: label("QueueTicket", j), contactPhone: phoneFor("QueueTicket", j) } });
    await P.ticketOrder.create({ data: { tenantId, unitId: U, eventId: event.id, orderNo: `TO-QC11-${String(j).padStart(4, "0")}`, buyerName: label("TicketOrder", j), buyerPhone: phoneFor("TicketOrder", j) } });
    await P.schoolEnrollment.create({ data: { tenantId, unitId: U, classId: klass.id, studentName: label("SchoolEnrollment", j), studentPhone: phoneFor("SchoolEnrollment", j) } });
    await P.hotelReservation.create({ data: { tenantId, unitId: U, code: `HR-QC11-${String(j).padStart(4, "0")}`, guestName: label("HotelReservation", j), guestPhone: phoneFor("HotelReservation", j), roomTypeId: roomType.id, checkInDate: dayFromToday(20 + j * 3), checkOutDate: dayFromToday(21 + j * 3) } });
    await P.patientRecord.create({ data: { tenantId, unitId: U, name: `ผู้ป่วย QC ${BR.rowTagOf("PatientRecord", j)}`, phone: phoneFor("PatientRecord", j) } });
    // ClinicVisit ไม่มีเบอร์ในแถว — คนไข้ของ visit ถือเบอร์ของผู้ติดต่อตามสัญญา (ป้ายในชื่อไม่ใช่คำเต็มของตาราง PatientRecord)
    const vp = await P.patientRecord.create({ data: { tenantId, unitId: U, name: `ผู้ป่วย QC ${BR_TAG}-visit-${j}`, phone: phoneFor("ClinicVisit", j) } });
    await P.clinicVisit.create({ data: { tenantId, unitId: U, patientId: vp.id, symptom: `ตรวจทั่วไป ${BR.rowTagOf("ClinicVisit", j)}` } });
    businessRows += 9;
  }
}

// ═══════════════════ 10. backfill 6 ตัว (ถ้ามีไฟล์) ═══════════════════
const backfillRan: string[] = [];
for (const s of CRM_BACKFILLS) {
  if (!existsSync(`scripts/${s}`)) continue;
  // dry-run ก่อนแล้วค่อยรันจริง (พิมพ์บรรทัด BACKFILL_SUMMARY ของทั้งสองรอบ — หลักฐานว่า dry-run นับตรงกับของจริง)
  for (const mode of [["--dry-run"], []]) {
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${s}`, "--tenant", CQC.tenantSlug, ...mode], { encoding: "utf8", env: process.env, timeout: 600_000 });
    if (r.status !== 0) { console.error(`❌ backfill ${s} ล้ม\n${(r.stdout ?? "") + (r.stderr ?? "")}`.slice(-2000)); process.exit(1); }
    const line = /BACKFILL_SUMMARY .*/.exec(r.stdout ?? "")?.[0];
    if (line) console.log(`  ${line}`);
  }
  backfillRan.push(s);
}

// ═══════════════════ 10.5 ด่านกันเมล็ดข้อมูลไปแตะ "ชุดข้อมูลสมาชิก" (บทเรียน 18 ก.ย. 2569) ═══════════════════
// 🔴 ด่าน D11 ของทุกใบใช้ `qc-member-m1.9` (30/15/10/5) เป็นตัวพิสูจน์ว่าข้อมูล QC ถูกคืนสภาพ
//    ถ้าเมล็ดข้อมูล CRM ทำให้สมาชิกเพิ่มขึ้นแม้แต่คนเดียว ด่านนั้นพังทั้ง RUN และไปโผล่ในใบอื่นที่ไม่เกี่ยวเลย
//    ⇒ ตรวจที่นี่ ทันที ดังๆ (exit 1) แทนที่จะให้ข้อสอบคนละชุดมาเจอทีหลังเป็นชั่วโมง
const expectMembers: number = ME.counts?.members ?? 60;
const memberTotal = await P.customer.count({ where: { tenantId } });
const memberFromCrm = await P.customer.count({ where: { tenantId, source: "CRM" } });
const wonEvents = await P.outboxEvent.count({ where: { tenantId, type: "crm.deal.won" } });
const pendingMine = await P.outboxEvent.count({ where: { tenantId, createdAt: { gte: new Date(t0) }, status: { not: "DONE" } } });
if (memberTotal !== expectMembers || memberFromCrm > 0 || wonEvents > 0) {
  console.error(`❌ เมล็ดข้อมูล CRM ไปแตะชุดข้อมูลสมาชิก — หยุดก่อนที่ด่าน D11 (qc-member-m1.9) จะพังในใบอื่น`);
  console.error(`   สมาชิกในร้าน ${memberTotal} คน (สัญญาของชุดข้อมูลสมาชิก = ${expectMembers}) · มาจาก source=CRM ${memberFromCrm} คน · event crm.deal.won ค้าง ${wonEvents} แถว`);
  console.error(`   สาเหตุที่พบบ่อย: เรียก crm.moveDeal ในเมล็ดข้อมูล (ยิง crm.deal.won → consumer สมัครสมาชิกให้) — ดูคอมเมนต์ที่ขั้นตอน 7`);
  process.exit(1);
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
  /** ทะเบียน partyId (C11) ที่แก้ให้ตรงชื่อจริงในใบ C0.1 — ข้อสอบ C1.1 S5 อ่านจากที่นี่/crm-qc-env.mts */
  partyLinkTables: { newColumn: [...PARTY_LINK_NEW_COLUMN], existingColumn: [...PARTY_LINK_EXISTING_COLUMN], all: [...PARTY_LINK_TABLES] },
  counts: {
    companies: companyIds.length, contacts: contactIds.length, deals: dealIds.length, dealsWon: CQC.deals.won, dealsLost: CQC.deals.lost, dealsOpen: CQC.deals.open,
    staleCandidates: CQC.deals.stale, activities: actCount, contractRecords, teams: Object.keys(teams).length,
    companyContacts: await count("crmCompanyContact", {}), stageHistory: await count("crmDealStageHistory", {}),
    textCompanyContacts: CQC.contacts.textCompany, duplicatePairs: CQC.contacts.duplicates, businessRows,
  },
  backfillRan,
};
// แคชของบริษัท (C1.3) — seed เขียนดีล/กิจกรรมตรง ⇒ คำนวณแคชให้ตรงความจริงด้วยสูตรเดียวกับ companies.recomputeCaches (ไม่ยิง event)
await prisma.$executeRawUnsafe(`UPDATE "CrmCompany" co SET
  "openDealCount" = (SELECT count(*)::int FROM "CrmDeal" d WHERE d."companyId" = co."id" AND d."systemId" = co."systemId" AND d."kind" = 'OPEN'),
  "wonValueSatang" = (SELECT COALESCE(sum(COALESCE(d."wonValueSatang", d."valueSatang")), 0)::bigint FROM "CrmDeal" d WHERE d."companyId" = co."id" AND d."systemId" = co."systemId" AND d."kind" = 'WON'),
  "lastActivityAt" = (SELECT max(COALESCE(a."doneAt", a."startAt", a."createdAt")) FROM "CrmActivity" a LEFT JOIN "CrmDeal" d ON d."id" = a."dealId" WHERE a."companyId" = co."id" OR d."companyId" = co."id")
  WHERE co."systemId" = $1`, SYS);
writeFileSync(CQC.expectedPath, JSON.stringify(expected, null, 2));
console.log(`\n✅ seed CRM: ร้าน ${tenantId} · ระบบ CRM ${SYS} · บริษัท ${companyIds.length} · ผู้ติดต่อ ${contactIds.length} · ดีล ${dealIds.length} · กิจกรรม ${actCount} · สัญญา ${contractRecords} · ทีม ${Object.keys(teams).length} · backfill ${backfillRan.length}/${CRM_BACKFILLS.length} · สมาชิกในร้าน ${memberTotal} (CRM ${memberFromCrm}) · outbox ที่ยังไม่ DONE จากรอบนี้ ${pendingMine} · เฉลย ${CQC.expectedPath} · ${Math.round((Date.now() - t0) / 1000)}s`);
await prisma.$disconnect();
