// probe-l6.mts — HUNTER C5.2 lens L6 (UI/UX & business correctness) · NOT an oracle · QC2 only
//   throwaway tenant `qc-hunt-l6-*` (every tenant-scoped row deleted in finally)
// Run: bash scripts/qc2.sh pnpm exec tsx scripts/pending/hunt-l6/probe-l6.mts
// Probes (all through real service code; dependent rows for the merge probes are inserted by hand ONLY where noted):
//   P1 company lifecycle/score after its deal is WON (contact lifecycle = positive control)
//   P2 stage-requirement modal payload: custom NUMBER/SELECT values arrive as the strings the modal's <input type=text> sends
//   P3 archive a deal field that a stage requires → deals that already HAVE the value can no longer enter the stage; stage edits fail
//   P4 merge contacts: drop has an ACTIVE sequence enrollment, an e-mail, a score log, a web session → what moves; then the engine tick
//   P5 merge companies: drop has a file link + an accepted portal access → what moves
//   P6 "overdue" on the web list vs the mobile/widget counters for a task due earlier today (Asia/Bangkok)
//   P7 custom DATE field accepts a Buddhist-era year typed in ISO shape ("2569-12-31")
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";

const env = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = env.loadQcEnv();
if (!/ep-cool-shadow/.test(host)) {
  console.log(`not QC2 (${host})`);
  process.exit(1);
}
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, "q");
const TAG = `qc-hunt-l6-${rand}`;
const out: Record<string, unknown> = { tag: TAG };
const TENANTS: string[] = [];
const USERS: string[] = [];
const safe = async <T,>(label: string, f: () => Promise<T>): Promise<T | string> => {
  try {
    return await f();
  } catch (e) {
    const x = e as Any;
    return `ERR ${label}: ${x?.name ?? ""}(${x?.code ?? "-"}) ${String(x?.message ?? e).slice(0, 260)}`;
  }
};
const idOf = (r: Any) => r?.id ?? r?.row?.id ?? r?.contact?.id ?? r?.company?.id ?? r?.contactId ?? r?.companyId;

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const MEM = (await import("@/lib/modules/member" as string)) as Any;
  const W = (await import("@/lib/modules/crm/widgets" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const t = await P.tenant.create({ data: { name: TAG, slug: TAG } });
  TENANTS.push(t.id);
  const T = t.id as string;
  const u = await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC owner ${TAG}` } });
  USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const owner = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const S = (await sysSvc.createSystem(T, "CRM", `CRM ${TAG}`)).id as string;
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = $2::jsonb WHERE "id" = $1`, S, JSON.stringify({ crm: { uiVersion: 2, bridgesEnabled: true } }));
  const ctx = { tenantId: T, systemId: S, actorUserId: u.id };

  const pipe = await CRM.pipelines.createPipeline(ctx, owner, {
    name: `ขาย ${TAG}`,
    stages: [
      { name: "ใหม่", kind: "OPEN", probability: 10 },
      { name: "เสนอราคา", kind: "OPEN", probability: 50 },
      { name: "ชนะ", kind: "WON", probability: 100 },
      { name: "แพ้", kind: "LOST", probability: 0 },
    ],
  });
  const st = Object.fromEntries(pipe.stages.map((s: Any) => [s.name, s.id]));

  // ── P1 ──
  const co = await safe("createCompany", () => CRM.companies.createCompany(ctx, owner, { name: `บริษัททดสอบ ${rand}` }));
  const coId = idOf(co);
  const c1 = await safe("createContact", () => CRM.contacts.createContact(ctx, owner, { firstName: `สมชาย${rand}`, lastName: "ใจดี", phone: "0812345678" }));
  const c1Id = idOf(c1);
  await safe("addContact", () => CRM.companies.addContact(ctx, owner, coId, { contactId: c1Id, isPrimary: true }));
  const d1 = await safe("createDeal", () => CRM.deals.createDeal(ctx, owner, { pipelineId: pipe.id, title: `ดีล ${rand}`, contactId: c1Id, companyId: coId, valueSatang: 5_000_000 }));
  const won = await safe("moveWon", () => CRM.deals.moveDeal(ctx, owner, idOf(d1), { stageId: st["ชนะ"] }));
  const coRow = await P.crmCompany.findUnique({ where: { id: coId }, select: { lifecycleStage: true, score: true, wonValueSatang: true, openDealCount: true } });
  const cRow = await P.crmContact.findUnique({ where: { id: c1Id }, select: { lifecycleStage: true } });
  out.P1 = { dealWon: typeof won === "string" ? won : (won as Any).kind, company: { ...coRow, wonValueSatang: String(coRow?.wonValueSatang) }, contactLifecycle_control: cRow?.lifecycleStage };

  // ── P2 ──
  const fctx = { ...ctx, objectKey: "deal", actor: owner };
  const sec = await MEM.fields.createSection(fctx, { key: "qcL6", label: "ข้อมูลดีล L6" });
  await MEM.fields.createField(fctx, { sectionId: sec.id, key: "qcAmt", label: "งบประมาณ", type: "NUMBER" });
  await MEM.fields.createField(fctx, { sectionId: sec.id, key: "qcKind", label: "ประเภทลูกค้า", type: "SELECT", options: { choices: [{ value: "option", label: "โรงงาน" }, { value: "option_2", label: "ร้านค้า" }] } });
  const upd = await safe("updateStage", () => CRM.pipelines.updateStage(ctx, owner, st["เสนอราคา"], { requireFields: ["qcAmt", "qcKind"] }));
  out.P2_stageRequire = typeof upd === "string" ? upd : (upd as Any).requireFields;
  const c2 = await CRM.contacts.createContact(ctx, owner, { firstName: `วิภา${rand}`, lastName: "ทดสอบ", phone: "0898765432" });
  const d2 = await CRM.deals.createDeal(ctx, owner, { pipelineId: pipe.id, title: `ดีลสอง ${rand}`, contactId: idOf(c2) });
  const tryMove = async (label: string, vals: Record<string, unknown> | null) => {
    const r = await safe(label, () => CRM.deals.moveDeal(ctx, owner, d2.id, { stageId: st["เสนอราคา"], ...(vals ? { requireFieldsValues: vals } : {}) }));
    return typeof r === "string" ? r : `OK stage=${(r as Any).stageId === st["เสนอราคา"] ? "เสนอราคา" : (r as Any).stageId}`;
  };
  out.P2 = {
    a_noValues: await tryMove("noValues", null),
    b_modalPayload_numberAsString: await tryMove("modal-number-string", { qcAmt: "50000", qcKind: "option" }),
    c_modalPayload_selectLabel: await tryMove("modal-select-label", { qcAmt: 50000, qcKind: "โรงงาน" }),
    d_control_typedValues: await tryMove("control", { qcAmt: 50000, qcKind: "option" }),
  };

  // ── P3 ── d2 now sits in "เสนอราคา" WITH both values. Take it back to "ใหม่", archive qcAmt, try again.
  await safe("back", () => CRM.deals.moveDeal(ctx, owner, d2.id, { stageId: st["ใหม่"] }));
  const layout = await MEM.fields.listLayout(fctx);
  const amt = layout.sections.flatMap((s: Any) => s.fields).find((f: Any) => f.key === "qcAmt");
  const arch = await safe("archiveField", () => MEM.fields.archiveField(fctx, amt.id));
  const vals = await P.customRecordValue.findMany({ where: { tenantId: T, recordId: d2.id }, select: { fieldId: true, valueNumber: true, valueText: true } }).catch((e: Any) => String(e));
  out.P3 = {
    archived: typeof arch === "string" ? arch : "ok",
    storedValuesStillThere: vals,
    moveAfterArchive: await tryMove("afterArchive", null),
    moveAfterArchive_withValue: await tryMove("afterArchive-withValue", { qcAmt: 50000 }),
    renameStageSendingItsOwnRequireFields: await safe("renameStage", () => CRM.pipelines.updateStage(ctx, owner, st["เสนอราคา"], { name: "เสนอราคา", requireFields: ["qcAmt", "qcKind"] })).then((r) => (typeof r === "string" ? r : "ok")),
  };

  // ── P4 merge contacts ──
  const keep = await CRM.contacts.createContact(ctx, owner, { firstName: `เก็บ${rand}`, lastName: "ไว้", email: `keep-${rand}@qc.invalid` });
  const drop = await CRM.contacts.createContact(ctx, owner, { firstName: `รวม${rand}`, lastName: "ทิ้ง", email: `drop-${rand}@qc.invalid` });
  const K = idOf(keep);
  const D = idOf(drop);
  const seq = await safe("createSequence", () => CRM.sequences.createSequence(ctx, owner, { name: `ติดตาม ${rand}`, businessDaysOnly: false, steps: [{ kind: "TASK", taskTitle: "โทรติดตาม" }, { kind: "WAIT", waitDays: 1 }, { kind: "TASK", taskTitle: "โทรรอบสอง" }] }));
  const enr = typeof seq === "string" ? seq : await safe("enroll", () => CRM.sequences.enroll(ctx, owner, { sequenceId: (seq as Any).id, contactId: D }));
  // hand-inserted dependents (the merge function is what is under test)
  const em = await safe("email-row", () => P.crmEmailMessage.create({ data: { tenantId: T, systemId: S, contactId: D, direction: "IN", messageId: `<l6-${rand}@qc.invalid>`, threadKey: `t-${rand}`, fromAddr: `drop-${rand}@qc.invalid`, subject: "สอบถามราคา", status: "DELIVERED", trackTokenHash: `h-${rand}`, receivedAt: new Date() } }));
  const sl = await safe("score-row", () => P.crmScoreLog.create({ data: { tenantId: T, contactId: D, points: 30, reason: "เปิดอีเมล" } }));
  const ws = await safe("web-row", () => P.crmWebSession.create({ data: { tenantId: T, systemId: S, visitorId: `v-${rand}`, contactId: D } }));
  const mg = await safe("mergeContacts", () => CRM.contacts.mergeContacts(ctx, owner, { keepId: K, mergeId: D, confirm: true, reason: `hunter L6 merge probe ${rand}` }));
  const where = async () => ({
    enrollments: await P.crmSequenceEnrollment.findMany({ where: { tenantId: T, contactId: { in: [K, D] } }, select: { contactId: true, status: true, stoppedReason: true } }),
    emails: await P.crmEmailMessage.findMany({ where: { tenantId: T, contactId: { in: [K, D] } }, select: { contactId: true } }),
    scoreLogs: await P.crmScoreLog.findMany({ where: { tenantId: T, contactId: { in: [K, D] } }, select: { contactId: true, points: true } }),
    webSessions: await P.crmWebSession.findMany({ where: { tenantId: T, contactId: { in: [K, D] } }, select: { contactId: true } }),
    keepScore: (await P.crmContact.findUnique({ where: { id: K }, select: { score: true } }))?.score,
  });
  const lab = (x: Any) => (Array.isArray(x) ? x.map((r: Any) => ({ ...r, contactId: r.contactId === K ? "KEEP" : r.contactId === D ? "DROP" : r.contactId })) : x);
  const afterMerge = await where();
  out.P4 = {
    setup: { seq: typeof seq === "string" ? seq : "ok", enroll: typeof enr === "string" ? enr : "ok", email: typeof em === "string" ? em : "ok", score: typeof sl === "string" ? sl : "ok", web: typeof ws === "string" ? ws : "ok" },
    merge: typeof mg === "string" ? mg : { moved: (mg as Any).moved, warnings: (mg as Any).warnings },
    afterMerge: Object.fromEntries(Object.entries(afterMerge).map(([k, v]) => [k, lab(v)])),
  };
  await P.crmSequenceEnrollment.updateMany({ where: { tenantId: T }, data: { nextAt: new Date(Date.now() - 60_000) } });
  const tick = await safe("runDue", () => CRM.sequences.runDue(new Date(), { tenantIds: [T] }));
  (out.P4 as Any).engineTick = typeof tick === "string" ? tick : { finished: (tick as Any).finished, executed: (tick as Any).executed };
  (out.P4 as Any).enrollmentsAfterTick = lab(await P.crmSequenceEnrollment.findMany({ where: { tenantId: T, contactId: { in: [K, D] } }, select: { contactId: true, status: true, stoppedReason: true } }));

  // ── P5 merge companies ──
  const ck = idOf(await CRM.companies.createCompany(ctx, owner, { name: `บริษัทเก็บ ${rand}` }));
  const cm = idOf(await CRM.companies.createCompany(ctx, owner, { name: `บริษัทรวม ${rand}` }));
  const px = idOf(await CRM.contacts.createContact(ctx, owner, { firstName: `พอร์ทัล${rand}`, lastName: "ลูกค้า", email: `portal-${rand}@qc.invalid` }));
  await safe("addContact-portal", () => CRM.companies.addContact(ctx, owner, cm, { contactId: px }));
  const fl = await safe("file-row", () => P.crmFileLink.create({ data: { tenantId: T, systemId: S, entityType: "COMPANY", entityId: cm, fileId: `f-${rand}`, name: "สัญญาเช่า.pdf", size: 1000, mime: "application/pdf" } }));
  const pa = await safe("portal-row", () => P.crmPortalAccess.create({ data: { tenantId: T, systemId: S, companyId: cm, contactId: px, acceptedAt: new Date() } }));
  const mc = await safe("mergeCompanies", () => CRM.companies.mergeCompanies(ctx, owner, { keepId: ck, mergeId: cm, confirm: true, reason: `hunter L6 company merge ${rand}` }));
  const labC = (id: string) => (id === ck ? "KEEP" : id === cm ? "DROP" : id);
  out.P5 = {
    setup: { file: typeof fl === "string" ? fl : "ok", portal: typeof pa === "string" ? pa : "ok" },
    merge: typeof mc === "string" ? mc : { moved: (mc as Any).moved, warnings: (mc as Any).warnings },
    fileLinks: (await P.crmFileLink.findMany({ where: { tenantId: T, entityType: "COMPANY" }, select: { entityId: true } })).map((r: Any) => labC(r.entityId)),
    portalAccess: (await P.crmPortalAccess.findMany({ where: { tenantId: T }, select: { companyId: true, revokedAt: true } })).map((r: Any) => ({ company: labC(r.companyId), revoked: !!r.revokedAt })),
    contactLinksOfPortalUser: (await P.crmCompanyContact.findMany({ where: { tenantId: T, contactId: px }, select: { companyId: true, endedAt: true } }).catch(() => [])).map((r: Any) => ({ company: labC(r.companyId), ended: !!r.endedAt })),
  };

  // ── P6 overdue: a task due 60 s ago (same Thai day unless run in the first minute after 00:00 Bangkok) ──
  const now = new Date();
  const bkkHour = (now.getUTCHours() + 7) % 24;
  const act = await safe("logActivity", () => CRM.activities.logActivity(ctx, owner, { type: "TASK", title: "โทรหาลูกค้า", contactId: K, dueAt: new Date(now.getTime() - 60_000) }));
  const webOverdue = await safe("listOverdue", () => CRM.activities.listActivities(ctx, owner, { status: "overdue" }));
  const webToday = await safe("listToday", () => CRM.activities.listActivities(ctx, owner, { status: "today" }));
  const mob = await safe("mobileToday", () => CRM.mobile.todayTasks({ ...ctx, actorUserId: u.id }, owner, now));
  const wid = await safe("widgetToday", () => W.todayTasks(ctx, owner, { now }));
  const brief = await safe("home", () => CRM.home?.loadCrmHome?.(ctx, owner));
  out.P6 = {
    bangkokHour: bkkHour,
    activity: typeof act === "string" ? act : "ok",
    web_overdueTab: typeof webOverdue === "string" ? webOverdue : (webOverdue as Any).items?.length,
    web_todayTab: typeof webToday === "string" ? webToday : (webToday as Any).items?.length,
    mobile_counts: typeof mob === "string" ? mob : (mob as Any).counts,
    widget_counts: typeof wid === "string" ? wid : (wid as Any).counts,
    homeLoader: typeof brief === "string" ? brief : brief === undefined ? "n/a" : "ok",
  };

  // ── P7 BE year in a custom DATE field ──
  const cf = { ...ctx, objectKey: "contact", actor: owner };
  const sec2 = await safe("sec2", () => MEM.fields.createSection(cf, { key: "qcL6c", label: "สัญญา" }));
  const fd = await safe("dateField", () => MEM.fields.createField(cf, { sectionId: (sec2 as Any).id, key: "qcEnd", label: "วันหมดสัญญา", type: "DATE" }));
  const setBE = await safe("setBE", () => MEM.fields.setFieldValues(cf, K, { qcEnd: "2569-12-31" }, { via: "STAFF", byUserId: u.id }));
  const setThai = await safe("setThaiSlash", () => MEM.fields.setFieldValues(cf, K, { qcEnd: "31/12/2569" }, { via: "STAFF", byUserId: u.id }));
  const stored = await P.customRecordValue.findFirst({ where: { tenantId: T, recordId: K, valueDate: { not: null } }, select: { valueDate: true } }).catch((e: Any) => String(e));
  out.P7 = { field: typeof fd === "string" ? fd : "ok", iso_BE_2569: typeof setBE === "string" ? setBE : "ACCEPTED", thaiSlash: typeof setThai === "string" ? setThai : "ACCEPTED", storedValueDate: (stored as Any)?.valueDate ?? stored };
} catch (e) {
  out.fatal = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
} finally {
  for (let pass = 0; pass < 4; pass += 1) {
    const tables = ((await P.$queryRawUnsafe(`select distinct table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[])
      .map((r) => String(r.table_name))
      .filter((x) => /^[A-Za-z_]+$/.test(x));
    for (const tb of tables) for (const id of TENANTS) await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, id).catch(() => undefined);
  }
  for (const id of TENANTS) {
    await P.appSystem.deleteMany({ where: { tenantId: id } }).catch(() => undefined);
    await P.tenant.delete({ where: { id } }).catch(() => undefined);
  }
  for (const id of USERS) {
    await P.appNotification.deleteMany({ where: { recipientUserId: id } }).catch(() => undefined);
    await P.membership.deleteMany({ where: { userId: id } }).catch(() => undefined);
    await P.user.delete({ where: { id } }).catch(() => undefined);
  }
  out.cleanup = {
    tenantsLeft: await P.tenant.count({ where: { slug: { startsWith: "qc-hunt-l6-" } } }),
    usersLeft: await P.user.count({ where: { email: { startsWith: "qc-hunt-l6-" } } }),
  };
  console.log(JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  await P.$disconnect();
}
