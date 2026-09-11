// QC — ระบบสมาชิก v2 WO M3.3: journey — AutomationRule scope MEMBER_JOURNEY · trigger event สมาชิก 24 + cron (member.birthday.upcoming · member.inactive · member.tier.review_due) · condition ชุด segment · action 10 (WAIT_THEN → AutomationRun WAITING scheduledAt + cron รายชั่วโมง) · re-entry · quota MEMBER · loop guard · holdout · dry-run · stats ขั้น×คน + holdout เทียบ · 6 journey สำเร็จรูป · หน้า list (ภาพ 07 บน) + detail (ภาพ 22)
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M3.3 · พิมพ์เขียว §4.1 (AutomationRule/Run) §4.4 (ไม่มีตาราง Journey) §5.9 §7.3 (D15) §7.5 (cron รายชั่วโมง WAIT_THEN) §11.6 (journey: 1 run ต่อคน · re-entry · WAIT_THEN ≤ 90 วัน · ปิด = ยกเลิก run ที่รอ) · ภาพ 07 · 22
// requires: member-seed
//
// สัญญา (migration `member_v2_g3` · src/lib/modules/member/journeys.ts + journey-presets.ts + journeys-actions.ts · facade member/index.ts · หน้า /member/journeys · /member/journeys/[journeyId] · /member/journeys/new)
//   schema (additive): AutomationRule +{holdoutPct Int @default(0) · reentryDays Int? · trigger Json? {event, params}} · AutomationRun +{customerId? · scheduledAt? · stepIndex Int? · payload Json? · journeyId? (= ruleId ซ้ำเพื่อ index) · finishedAt?} index(tenantId,status,scheduledAt) index(ruleId,customerId,createdAt) · enum AutomationRunStatus +{WAITING, HOLDOUT, SKIPPED, CANCELLED} (additive · OK/FAILED คงเดิม) · MemberActivity type ใหม่ "JOURNEY_STEP"
//   ctx = MemberCtx · journeyId = AutomationRule.id (scope MEMBER_JOURNEY · memberSystemId = ระบบ MEMBER · event = trigger.event)
//   createJourney(ctx, actor, { name, trigger: { event, params? }, conditions: SegmentDefinition (ใช้ engine M3.1 · เงื่อนไขว่างได้), actions: [{ type, params }], holdoutPct(0–50), reentryDays?(null = ครั้งเดียวตลอดชีพ), enabled }) → { id } · updateJourney · toggleJourney(enabled=false → run WAITING ทั้งหมด → CANCELLED) · deleteJourney · listJourneys(ctx, actor) → แถว {id, name, enabled, trigger, stats30d {entered, used, saleSatang, costSatang, roi}} · getJourney
//     ตรวจ: event ต้องอยู่ใน JOURNEY_TRIGGERS (member.* point.* stamp.* reward.* voucher.* giftcard.* review.* referral.* booking.completed booking.no_show pos.sale.paid + member.birthday.upcoming{daysBefore} member.inactive{days} member.tier.review_due) · action type ∈ ISSUE_VOUCHER{templateId} GIVE_POINTS{points, expiresDays?} SEND_LINE{template} SEND_EMAIL{subject, template} SEND_SMS{template} SEND_PUSH{title, template} ADD_TAG{tag} REMOVE_TAG{tag} WAIT_THEN{days ≤ 90, ifVoucherUnused?, thenActions[] (ซ้อน WAIT_THEN ได้ 1 ชั้น)} OPEN_KANBAN_CARD{boardId, title} NOTIFY_STAFF{role? | userIds?, title} REQUEST_REVIEW{} · SET_TIER → throw ไทย (เฉพาะ MEMBER_TIER) · actions ≤ 20 · เพดาน MEMBER_LIMITS.journeys (50) · สิทธิ์ member.promo.manage (อ่าน = promo.read)
//   runForEvent(evt { tenantId, type, payload }, { now?, deps? }) → { runs } — เรียกจาก outbox-consumers.ts (withAutomation) สำหรับทุก event ที่มี payload.customerId (best-effort try/catch) · ต่อ journey enabled ที่ trigger.event = type (params ตรง เช่น daysBefore/days): loop guard = run ของ (rule, customer, event idempotencyKey) ซ้ำ → ข้าม · re-entry = มี run (ไม่ใช่ SKIPPED) ของ (rule, customer) ภายใน reentryDays (null = เคยมีเลย) → SKIPPED detail "re-entry" · quota = AutomationRun ของ memberSystemId เดือนไทยนี้ ≥ (Tenant.limits.member.automationRunsPerMonth ?? MEMBER_LIMITS.automationRunsPerMonth 5,000) → SKIPPED detail "quota" · conditions ไม่ผ่าน (segment engine กับลูกค้าคนนี้) → SKIPPED detail "conditions" · holdout = hashPct(ruleId:customerId) < holdoutPct → HOLDOUT (ไม่ทำ action · บันทึก) · ผ่าน → ทำ actions ตามลำดับ · WAIT_THEN → AutomationRun ใหม่ status WAITING scheduledAt = now + days · payload {thenActions, ifVoucherUnused, voucherId} · run หลัก OK (detail สรุปขั้น) · MemberActivity JOURNEY_STEP ต่อ action
//     deps (QC ฉีดได้): { line?, email?, sms?, push?, kanban? } · ปริยาย: chat.pushToContact · core/email · core/sms · push MemberPushDevice · kanban.createCardFromExternal · การส่งเคารพ consent ช่องทางนั้น (ไม่ยินยอม → action SKIPPED ใน detail ไม่ throw)
//   runDueWaits({ now?, deps? }) → { ran } — run WAITING ที่ scheduledAt ≤ now: journey ปิด → CANCELLED · ifVoucherUnused และ voucher (จาก run แม่) ถูกใช้แล้ว → SKIPPED detail "voucher ใช้แล้ว" · ไม่งั้นทำ thenActions → OK · cron.ts รายชั่วโมง runHourlyCron/step journeyWaits + รายวัน emitJourneyCronEvents (birthday.upcoming ต่อ daysBefore ที่ journey ใช้ · member.inactive ต่อ days · idempotencyKey `journey-cron:${type}:${customerId}:${วันไทย}`)
//   presets: JOURNEY_PRESETS 6 ตัว {key, name ไทย, trigger, conditions, actions, holdoutPct 10, reentryDays}: birthday (member.birthday.upcoming daysBefore 7 · ISSUE_VOUCHER + SEND_LINE + GIVE_POINTS) · new_member (member.created · ADD_TAG new + SEND_LINE + WAIT_THEN 7 {SEND_LINE} + WAIT_THEN 30 {SEND_LINE}) · inactive (member.inactive days 60 · conditions tier ≥ silver + consent LINE · ISSUE_VOUCHER + SEND_LINE + WAIT_THEN 7 ifVoucherUnused {SEND_SMS}) · at_risk (member.tier.at_risk · SEND_LINE + NOTIFY_STAFF) · no_show (booking.no_show · ISSUE_VOUCHER + SEND_LINE) · review (pos.sale.paid · WAIT_THEN 1 {REQUEST_REVIEW}) · createFromPreset(ctx, actor, key, { templateId? }) → journey
//   dryRun(ctx, actor, journeyId, { days = 30 }) → { candidates, wouldEnter, holdout, skippedByConditions, perStep: [{ index, type, count }] } — ไม่เขียนอะไร (ประเมินจาก event ย้อนหลัง N วัน ใน OutboxEvent หรือสมาชิกที่เข้าเกณฑ์ cron trigger ณ ตอนนี้)
//   journeyStats(ctx, actor, id, { days = 30 }) → { entered, perStep: [{ index, label ไทย, count }], holdout: { entered, converted, convertedPct }, results: { sent, used, usedPct, saleSatang, costSatang, roi }, uplift: usedPct − holdout.convertedPct, daily: [{ date, used }] , recent: [{ customerId, name, enteredAt, stepLabel, status }] } · เก็บสรุปที่ AutomationRule.journeyStats · "ใช้สิทธิ์" = voucher ของ journey ถูกใช้ หรือ ลูกค้าซื้อ (pos.sale.paid) ภายใน 30 วันหลังเข้า · holdout.converted = ลูกค้า HOLDOUT ที่ซื้อใน 30 วัน
//   UI (ภาพ 07 บน · 22): /member/journeys — builder ประโยค [เมื่อ][trigger ▾] · [และถ้า][เงื่อนไข…] · [ให้ทำ][action ▾][params] · [และ]… · + เพิ่มเงื่อนไข หรือ เพิ่มการกระทำ · ชื่อ journey · ปุ่ม ทดลองรัน / ยกเลิก / บันทึก Journey · 'ทดลองรันย้อนหลังได้' · ป้าย holdout กลุ่มเทียบ % · ตาราง 'Journey ที่เปิดใช้อยู่' (ชื่อ+คำอธิบาย · ส่งเดือนนี้ · ใช้สิทธิ์ n (%) · ยอดที่เกิด · ต้นทุน · ROI · สถานะ toggle) · ปุ่มสร้างจากสำเร็จรูป 6 · /member/journeys/[id] (ภาพ 22): หัว ชื่อ + ชิปสถานะ + สร้าง/แก้ล่าสุด + ปุ่ม แก้ไข/หยุดชั่วคราว/ทำสำเนา · แถวขั้นตอน การ์ดต่อขั้น (เมื่อ/ถ้า/ให้ทำ/รอ n วัน/…) + จำนวนคน · ผลลัพธ์ 30 วัน 5 ตัวเลข (ส่งทั้งหมด · ใช้สิทธิ์ · ยอดที่เกิด · ต้นทุน · ROI) · กล่องฟ้า กลุ่มเทียบ holdout … · กราฟใช้สิทธิ์รายวัน · ตาราง เข้าล่าสุด (ชื่อ · เข้าเมื่อ · ขั้นปัจจุบัน · ใช้แล้ว)
//   testid: journeys-page journeys-builder journey-trigger journey-condition journey-action journey-add journey-name journey-dryrun journeys-save journeys-table journey-row-<id> journeys-presets journey-detail journey-steps journey-step journey-results journey-holdout journey-daily journey-recent journey-toggle
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
const migDir = existsSync("prisma/migrations") ? readdirSync("prisma/migrations").find((d) => /_member_v2_g3$/.test(d)) : undefined;
if (!migDir || !existsSync("src/lib/modules/member/journeys.ts") || !existsSync("src/app/app/sys/[id]/member/journeys/page.tsx")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (migration member_v2_g3 · member/journeys.ts · member/journeys/page.tsx)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const mq = (await import("./member-qc-env.mts" as string)) as { MQC: Any; resolveMemberScope: (p: Any) => Promise<{ tenantId: string; systemId: string; systems: Record<string, string> } | null> };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const thai = (e: Error | null) => !!e && /[ก-๙]/.test(e.message);
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const q = async <T = Any,>(sql: string): Promise<T[]> => (await prisma.$queryRawUnsafe(sql)) as T[];
const cols = async (t: string) => new Set((await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='${t}'`)).map((c) => c.column_name));
const enumVals = async (name: string) => (await q<{ enumlabel: string }>(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='${name}'`)).map((e) => e.enumlabel);
const P = prisma as Any;
let tid = ""; let SYS = "";
const tag = Date.now().toString(36);
const before = { vouchers: new Set<string>(), templates: new Set<string>() };
const made = { journeys: [] as string[], customers: [] as string[], appts: [] as string[], sales: [] as string[], ledgerKeys: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId;
  for (const v of await P.voucher.findMany({ where: { tenantId: tid }, select: { id: true } })) before.vouchers.add(v.id);
  for (const t of await P.voucherTemplate.findMany({ where: { tenantId: tid }, select: { id: true } })) before.templates.add(t.id);
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const J = (await import("@/lib/modules/member/journeys" as string)) as Record<string, (...a: Any[]) => Any>;
  const PRE = (await import("@/lib/modules/member/journey-presets" as string)) as Any;
  const PR = (await import("@/lib/modules/member/profile" as string)) as Record<string, (...a: Any[]) => Any>;
  const V = (await import("@/lib/modules/voucher" as string)) as Record<string, (...a: Any[]) => Any>;
  const PS = (await import("@/lib/modules/point" as string)) as Record<string, (...a: Any[]) => Any>;
  const PV = (await import("@/lib/modules/member/privacy" as string)) as Record<string, (...a: Any[]) => Any>;
  const T = (await import("@/lib/modules/member/tiers" as string)) as Record<string, (...a: Any[]) => Any>;
  const { MEMBER_LIMITS } = (await import("@/lib/modules/member/limits" as string)) as Any;
  const { sha256 } = (await import("@/lib/core/hash" as string)) as Any;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId);
  const thana = await actorOf(E.users.staff.thana.userId);
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const PT = scope.systems.POINT as string;
  const bal = (cid: string) => PS.getBalance(PT, cid);
  const runs = (ruleId: string, extra: Any = {}) => P.automationRun.findMany({ where: { ruleId, ...extra }, orderBy: { createdAt: "asc" } });
  const rule = (id: string) => P.automationRule.findUnique({ where: { id } });
  const mkDeps = () => { const calls = { line: [] as Any[], email: [] as Any[], sms: [] as Any[], push: [] as Any[], kanban: [] as Any[] }; const ok = async () => ({ ok: true }); return { calls, deps: { line: async (r: Any) => { calls.line.push(r); return ok(); }, email: async (r: Any) => { calls.email.push(r); return ok(); }, sms: async (r: Any) => { calls.sms.push(r); return ok(); }, push: async (r: Any) => { calls.push.push(r); return ok(); }, kanban: async (r: Any) => { calls.kanban.push(r); return { ok: true, cardId: `card-${r.customerId}` }; } } }; };
  const tenant0 = await prisma.tenant.findUnique({ where: { id: tid }, select: { limits: true } });
  restore.push(() => prisma.tenant.update({ where: { id: tid }, data: { limits: tenant0?.limits ?? {} } }));
  const T300 = await V.createTemplate(ctx, owner, { name: `journey ฿300 ${tag}`, kind: "FIXED", value: 30_000, config: { unitIds: [] }, validDays: 14, origin: "JOURNEY" });
  const mkCust = async (nm: string, extra: Any = {}) => { const c = await PR.createMember(ctx as Any, owner, { phone: `0890${String((Date.now() + Math.floor(Math.random() * 1000)) % 1_000_000).padStart(6, "0")}`, firstName: nm, lastName: "journey", source: "WALK_IN", homeUnitId: E.units.patong, consents: [{ channel: "LINE", granted: true }], ...extra }); made.customers.push(c.customerId); await PV.setConsent(ctx, owner, c.customerId, { channel: "LINE", granted: true, source: "STAFF" }).catch(() => null); await P.memberChannelIdentity.create({ data: { tenantId: tid, customerId: c.customerId, channel: "LINE", externalId: `U-j-${tag}-${Math.random().toString(36).slice(2, 8)}` } }).catch(() => null); return c.customerId as string; };
  const evt = (type: string, customerId: string, extra: Any = {}, keyExtra = "") => ({ tenantId: tid, type, payload: { customerId, ...extra }, idempotencyKey: `qc33-${tag}-${type}-${customerId}${keyExtra}` });
  const hashPct = (ruleId: string, cid: string) => (parseInt(sha256(`${ruleId}:${cid}`).slice(0, 8), 16) % 10000) / 100;

  // ═══ S1 schema · presets ═══
  const ar = await cols("AutomationRule"); const au = await cols("AutomationRun");
  const st = await enumVals("AutomationRunStatus");
  const presets: Any[] = PRE.JOURNEY_PRESETS ?? [];
  const PK = ["birthday", "new_member", "inactive", "at_risk", "no_show", "review"];
  chk("M3.3-S1.1", "migration member_v2_g3: AutomationRule +{holdoutPct reentryDays trigger} · AutomationRun +{customerId scheduledAt stepIndex payload journeyId finishedAt} · enum AutomationRunStatus +WAITING/HOLDOUT/SKIPPED/CANCELLED (OK/FAILED คงเดิม) · JOURNEY_PRESETS 6 (birthday new_member inactive at_risk no_show review) ชื่อไทย · MEMBER_LIMITS.journeys 50 · automationRunsPerMonth 5,000",
    ["holdoutPct", "reentryDays", "trigger"].every((c) => ar.has(c)) && ["customerId", "scheduledAt", "stepIndex", "payload", "journeyId", "finishedAt"].every((c) => au.has(c)) && ["OK", "FAILED", "WAITING", "HOLDOUT", "SKIPPED", "CANCELLED"].every((v) => st.includes(v)) && PK.every((k) => presets.some((p) => p.key === k && /[ก-๙]/.test(p.name))) && MEMBER_LIMITS.journeys === 50 && MEMBER_LIMITS.automationRunsPerMonth === 5_000,
    "ครบ", `ar=${["holdoutPct", "reentryDays", "trigger"].map((c) => ar.has(c)).join("/")} au=${["customerId", "scheduledAt", "payload"].map((c) => au.has(c)).join("/")} st=${st.join(",")} presets=${presets.map((p) => p.key).join(",")} limits=${MEMBER_LIMITS.journeys}/${MEMBER_LIMITS.automationRunsPerMonth}`);

  const eSetTier = await fails(() => J.createJourney(ctx, owner, { name: "x", trigger: { event: "member.created" }, conditions: { groups: [] }, actions: [{ type: "SET_TIER", params: { tierDefId: "x" } }], holdoutPct: 0, enabled: true }));
  const eEvent = await fails(() => J.createJourney(ctx, owner, { name: "x", trigger: { event: "kanban.card.moved" }, conditions: { groups: [] }, actions: [{ type: "ADD_TAG", params: { tag: "x" } }], holdoutPct: 0, enabled: true }));
  const eWait = await fails(() => J.createJourney(ctx, owner, { name: "x", trigger: { event: "member.created" }, conditions: { groups: [] }, actions: [{ type: "WAIT_THEN", params: { days: 120, thenActions: [] } }], holdoutPct: 0, enabled: true }));
  const eThana = await fails(() => J.createJourney(ctx, thana, { name: "x", trigger: { event: "member.created" }, conditions: { groups: [] }, actions: [{ type: "ADD_TAG", params: { tag: "x" } }], holdoutPct: 0, enabled: true }));
  const jb = await J.createFromPreset(ctx, owner, "birthday", { templateId: T300.id }); made.journeys.push(jb.id);
  const jn = await J.createFromPreset(ctx, owner, "new_member"); made.journeys.push(jn.id);
  const ji = await J.createFromPreset(ctx, owner, "inactive", { templateId: T300.id }); made.journeys.push(ji.id);
  const ja = await J.createFromPreset(ctx, owner, "at_risk"); made.journeys.push(ja.id);
  const jns = await J.createFromPreset(ctx, owner, "no_show", { templateId: T300.id }); made.journeys.push(jns.id);
  const jr = await J.createFromPreset(ctx, owner, "review"); made.journeys.push(jr.id);
  const rb = await rule(jb.id);
  chk("M3.3-S1.2", "createJourney ตรวจ: SET_TIER → throw ไทย · event นอกทะเบียน → throw · WAIT_THEN 120 วัน (> 90) → throw · thana (ไม่มี promo.manage) → throw · createFromPreset 6 ตัว → AutomationRule scope MEMBER_JOURNEY memberSystemId event ตรง trigger (birthday = member.birthday.upcoming daysBefore 7 · holdoutPct 10 · actions มี ISSUE_VOUCHER templateId ที่ส่ง)",
    thai(eSetTier) && thai(eEvent) && thai(eWait) && !!eThana && rb?.scope === "MEMBER_JOURNEY" && rb.memberSystemId === SYS && rb.event === "member.birthday.upcoming" && rb.trigger?.params?.daysBefore === 7 && rb.holdoutPct === 10 && (rb.actions as Any[]).some((a) => a.type === "ISSUE_VOUCHER" && a.params?.templateId === T300.id) && made.journeys.length === 6,
    "6 journey", `tier=${thai(eSetTier)} ev=${thai(eEvent)} wait=${thai(eWait)} th=${!!eThana} rb=${JSON.stringify({ scope: rb?.scope, ev: rb?.event, p: rb?.trigger, h: rb?.holdoutPct })}`);

  // ═══ S2 6 journey สำเร็จรูปรันครบเส้น ═══
  // (1) birthday — สมาชิกใหม่ X วันเกิดอีก 7 วัน · holdout 0 เพื่อให้เข้าแน่
  await P.automationRule.update({ where: { id: jb.id }, data: { holdoutPct: 0 } });
  // ORACLE-EDIT M3.3-S2.1: วันเกิด = "วันไทย" + 7 (cron ใช้วันไทย) · createMember รับ birthDate เป็นสตริง YYYY-MM-DD
  const in7 = new Date(Date.now() + 7 * 3_600_000 + 7 * 86_400_000);
  const X = await mkCust("วันเกิด", { birthDate: `1990-${String(in7.getUTCMonth() + 1).padStart(2, "0")}-${String(in7.getUTCDate()).padStart(2, "0")}` });
  const d1 = mkDeps();
  const em1 = await J.emitJourneyCronEvents({ now: new Date(), tenantId: tid });
  const { drainOutbox } = await import("@/lib/core/outbox");
  const { consumers: CONS } = (await import("@/lib/outbox-consumers" as string)) as Any;
  const bdEv = await P.outboxEvent.findFirst({ where: { tenantId: tid, type: "member.birthday.upcoming", payload: { path: ["customerId"], equals: X } } });
  const r1 = bdEv ? await J.runForEvent({ tenantId: tid, type: "member.birthday.upcoming", payload: bdEv.payload, idempotencyKey: bdEv.idempotencyKey }, { deps: d1.deps }) : null;
  const vX = await P.voucher.findFirst({ where: { customerId: X, origin: "JOURNEY" } });
  const runsB = await runs(jb.id, { customerId: X });
  chk("M3.3-S2.1", "birthday: emitJourneyCronEvents → event member.birthday.upcoming {customerId X, daysBefore 7} (วันเกิดอีก 7 วัน) · runForEvent → run OK · voucher origin JOURNEY originRef {journeyId, runId} · SEND_LINE deps.line เรียก (ข้อความมี {ชื่อ} แทนแล้ว) · GIVE_POINTS → แต้ม +100 (ledger refType JOURNEY)",
    !!bdEv && bdEv.payload.daysBefore === 7 && runsB.some((r: Any) => r.status === "OK") && !!vX && vX.originRef?.journeyId === jb.id && !!vX.originRef?.runId && d1.calls.line.some((c) => c.customerId === X && !/\{ชื่อ\}/.test(c.body ?? c.text ?? "")) && (await bal(X)) === 100 && !!(await prisma.pointLedger.findFirst({ where: { customerId: X, refType: "JOURNEY" as Any } })),
    "ครบเส้น", `em=${JSON.stringify(em1)} ev=${!!bdEv}/${bdEv?.payload?.daysBefore} run=${runsB.map((r: Any) => r.status).join(",")} v=${!!vX}/${vX?.originRef?.journeyId === jb.id} line=${d1.calls.line.length} bal=${await bal(X)}`);
  const em2 = await J.emitJourneyCronEvents({ now: new Date(), tenantId: tid });
  const nBd = await P.outboxEvent.count({ where: { tenantId: tid, type: "member.birthday.upcoming", payload: { path: ["customerId"], equals: X } } });
  const r1b = bdEv ? await J.runForEvent({ tenantId: tid, type: "member.birthday.upcoming", payload: bdEv.payload, idempotencyKey: bdEv.idempotencyKey }, { deps: d1.deps }) : null;
  chk("M3.3-S2.2", "birthday ซ้ำวันเดียวกัน: emit อีกครั้ง → event ไม่ซ้ำ (1) · runForEvent event เดิม (idempotencyKey เดิม) → loop guard ไม่รันซ้ำ (run OK ยัง 1 · voucher 1 · แต้ม 100)", nBd === 1 && (await runs(jb.id, { customerId: X, status: "OK" })).length === 1 && (await P.voucher.count({ where: { customerId: X, origin: "JOURNEY" } })) === 1 && (await bal(X)) === 100, "ไม่ซ้ำ", `ev=${nBd} runs=${(await runs(jb.id, { customerId: X, status: "OK" })).length} v=${await P.voucher.count({ where: { customerId: X, origin: "JOURNEY" } })} em2=${JSON.stringify(em2)}`);

  // (2) new_member — member.created ยิงจาก createMember → drain → consumer เรียก runForEvent (deps ปริยาย: LINE ไม่มี provider → detail SKIPPED ช่องทาง ไม่ throw)
  await P.automationRule.update({ where: { id: jn.id }, data: { holdoutPct: 0 } });
  const N = await mkCust("ใหม่");
  await drainOutbox(CONS, { limit: 300 }); await drainOutbox(CONS, { limit: 300 });
  const runsN = await runs(jn.id, { customerId: N });
  const custN = await prisma.customer.findUnique({ where: { id: N } });
  const waitN = runsN.filter((r: Any) => r.status === "WAITING");
  chk("M3.3-S2.3", "new_member: member.created (จาก createMember) → consumer → run OK · ADD_TAG 'new' อยู่ใน tags · WAIT_THEN 7 + WAIT_THEN 30 → run WAITING 2 แถว scheduledAt ≈ +7 และ +30 วัน (payload.thenActions) · MemberActivity JOURNEY_STEP ≥ 1",
    runsN.some((r: Any) => r.status === "OK") && ((custN?.tags as Any) ?? []).includes("new") && waitN.length === 2 && waitN.some((r: Any) => Math.abs(new Date(r.scheduledAt).getTime() - (Date.now() + 7 * 86_400_000)) < 3600_000) && waitN.some((r: Any) => Math.abs(new Date(r.scheduledAt).getTime() - (Date.now() + 30 * 86_400_000)) < 3600_000) && waitN.every((r: Any) => Array.isArray(r.payload?.thenActions)) && (await P.memberActivity.count({ where: { customerId: N, type: "JOURNEY_STEP" } })) >= 1,
    "OK + WAITING ×2", `runs=${runsN.map((r: Any) => r.status).join(",")} tags=${JSON.stringify(custN?.tags)} wait=${waitN.map((r: Any) => r.scheduledAt).join(",")}`);
  const d2 = mkDeps();
  const w7 = waitN.find((r: Any) => Math.abs(new Date(r.scheduledAt).getTime() - (Date.now() + 7 * 86_400_000)) < 3600_000);
  const due0 = await J.runDueWaits({ now: new Date(), deps: d2.deps });
  const due7 = await J.runDueWaits({ now: new Date(Date.now() + 8 * 86_400_000), deps: d2.deps });
  const w7b = await P.automationRun.findUnique({ where: { id: w7?.id ?? "-" } });
  const w30 = await P.automationRun.findFirst({ where: { ruleId: jn.id, customerId: N, status: "WAITING" } });
  chk("M3.3-S2.4", "runDueWaits ตอนนี้ → 0 (ยังไม่ถึง) · now+8 วัน → run 7 วัน OK (thenActions SEND_LINE เรียก deps.line ให้ N) · run 30 วันยัง WAITING · finishedAt ตั้ง", due0?.ran === 0 && due7?.ran >= 1 && w7b?.status === "OK" && !!w7b.finishedAt && d2.calls.line.some((c) => c.customerId === N) && !!w30, "7 วันทำ · 30 รอ", `due0=${JSON.stringify(due0)} due7=${JSON.stringify(due7)} w7=${w7b?.status} line=${d2.calls.line.length} w30=${!!w30}`);

  // (3) inactive — member.inactive days 60 · เงื่อนไข tier ≥ silver + consent LINE
  await P.automationRule.update({ where: { id: ji.id }, data: { holdoutPct: 0 } });
  const silver = await P.memberTierDef.findFirst({ where: { systemId: SYS, key: "silver" } });
  const I1 = await mkCust("หาย"); const I2 = await mkCust("หายไม่ยินยอม");
  await T.applyTierChange(ctx as Any, I1, silver.id, "MANUAL", { qc: tag }, { byUserId: owner.userId });
  await T.applyTierChange(ctx as Any, I2, silver.id, "MANUAL", { qc: tag }, { byUserId: owner.userId });
  await PV.setConsent(ctx, owner, I2, { channel: "LINE", granted: false, source: "STAFF" });
  const I3 = await mkCust("หายระดับต่ำ");
  for (const id of [I1, I2, I3]) await P.customer.update({ where: { id }, data: { lastActivityAt: new Date(Date.now() - 70 * 86_400_000) } });
  const d3 = mkDeps();
  await J.emitJourneyCronEvents({ now: new Date(), tenantId: tid });
  for (const id of [I1, I2, I3]) { const e = await P.outboxEvent.findFirst({ where: { tenantId: tid, type: "member.inactive", payload: { path: ["customerId"], equals: id } } }); if (e) await J.runForEvent({ tenantId: tid, type: "member.inactive", payload: e.payload, idempotencyKey: e.idempotencyKey }, { deps: d3.deps }); }
  const rI1 = await runs(ji.id, { customerId: I1 }); const rI2 = await runs(ji.id, { customerId: I2 }); const rI3 = await runs(ji.id, { customerId: I3 });
  const vI1 = await P.voucher.findFirst({ where: { customerId: I1, origin: "JOURNEY" } });
  chk("M3.3-S2.5", "inactive 60 วัน: I1 (silver · ยินยอม LINE · หาย 70 วัน) → event member.inactive {days 60} → run OK · voucher + SEND_LINE · WAIT_THEN 7 ifVoucherUnused (WAITING payload.voucherId) · I2 (silver · ไม่ยินยอม) → SKIPPED detail conditions · I3 (member · ต่ำกว่า silver) → SKIPPED conditions",
    rI1.some((r: Any) => r.status === "OK") && !!vI1 && d3.calls.line.some((c) => c.customerId === I1) && rI1.some((r: Any) => r.status === "WAITING" && r.payload?.ifVoucherUnused === true && r.payload?.voucherId === vI1.id) && rI2.some((r: Any) => r.status === "SKIPPED" && /conditions|เงื่อนไข/.test(r.detail ?? "")) && rI3.some((r: Any) => r.status === "SKIPPED"),
    "ผ่านเฉพาะ I1", `I1=${rI1.map((r: Any) => r.status).join(",")} I2=${rI2.map((r: Any) => `${r.status}:${r.detail}`).join(",")} I3=${rI3.map((r: Any) => r.status).join(",")} v=${!!vI1}`);
  const wI1 = rI1.find((r: Any) => r.status === "WAITING");
  const I4 = await mkCust("หายใช้แล้ว");
  await T.applyTierChange(ctx as Any, I4, silver.id, "MANUAL", { qc: tag }, { byUserId: owner.userId });
  await P.customer.update({ where: { id: I4 }, data: { lastActivityAt: new Date(Date.now() - 70 * 86_400_000) } });
  await J.emitJourneyCronEvents({ now: new Date(), tenantId: tid });
  const eI4 = await P.outboxEvent.findFirst({ where: { tenantId: tid, type: "member.inactive", payload: { path: ["customerId"], equals: I4 } } });
  if (eI4) await J.runForEvent({ tenantId: tid, type: "member.inactive", payload: eI4.payload, idempotencyKey: eI4.idempotencyKey }, { deps: d3.deps });
  const vI4 = await P.voucher.findFirst({ where: { customerId: I4, origin: "JOURNEY" } });
  if (vI4) await V.redeem(ctx, { voucherId: vI4.id, customerId: I4, saleId: `qc33-sale-${tag}` });
  const d3b = mkDeps();
  await J.runDueWaits({ now: new Date(Date.now() + 8 * 86_400_000), deps: d3b.deps });
  const wI1b = await P.automationRun.findUnique({ where: { id: wI1?.id ?? "-" } });
  const wI4b = await P.automationRun.findFirst({ where: { ruleId: ji.id, customerId: I4, stepIndex: { not: null } }, orderBy: { createdAt: "desc" } });
  chk("M3.3-S2.6", "WAIT_THEN ifVoucherUnused: I1 ยังไม่ใช้ voucher → หลัง 7 วัน ทำ SEND_SMS (deps.sms เรียก · run OK) · I4 ใช้ voucher ไปแล้ว → run SKIPPED detail 'ใช้แล้ว' ไม่ส่ง SMS", wI1b?.status === "OK" && d3b.calls.sms.some((c) => c.customerId === I1) && wI4b?.status === "SKIPPED" && /ใช้แล้ว|used/.test(wI4b.detail ?? "") && !d3b.calls.sms.some((c) => c.customerId === I4), "SMS เฉพาะยังไม่ใช้", `I1=${wI1b?.status} sms=${d3b.calls.sms.map((c) => c.customerId === I1 ? "I1" : c.customerId === I4 ? "I4" : "?").join(",")} I4=${wI4b?.status}/${wI4b?.detail}`);

  // (4) at_risk — member.tier.at_risk (M1.9) · NOTIFY_STAFF → AppNotification
  await P.automationRule.update({ where: { id: ja.id }, data: { holdoutPct: 0 } });
  const A1 = await mkCust("เสี่ยง");
  const d4 = mkDeps();
  const nBefore = await P.appNotification.count({ where: { tenantId: tid } });
  await J.runForEvent(evt("member.tier.at_risk", A1, { fromTierDefId: silver.id, toTierDefId: null }), { deps: d4.deps });
  const rA = await runs(ja.id, { customerId: A1 });
  chk("M3.3-S2.7", "at_risk: member.tier.at_risk → run OK · SEND_LINE (deps.line) · NOTIFY_STAFF → AppNotification +1 (title ไทย มีชื่อสมาชิก)", rA.some((r: Any) => r.status === "OK") && d4.calls.line.some((c) => c.customerId === A1) && (await P.appNotification.count({ where: { tenantId: tid } })) === nBefore + 1 && /[ก-๙]/.test((await P.appNotification.findFirst({ where: { tenantId: tid }, orderBy: { createdAt: "desc" } }))?.title ?? ""), "OK + แจ้งพนักงาน", `runs=${rA.map((r: Any) => r.status).join(",")} line=${d4.calls.line.length} notif=${await P.appNotification.count({ where: { tenantId: tid } })}/${nBefore + 1}`);

  // (5) no_show — booking.no_show (M3.3 เพิ่ม emit ใน setAppointmentStatus NO_SHOW)
  await P.automationRule.update({ where: { id: jns.id }, data: { holdoutPct: 0 } });
  const NS = await mkCust("ไม่มา");
  const booking = (await import("@/lib/modules/booking/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const svc = await prisma.bookingService.findFirst({ where: { tenantId: tid, unitId: E.units.patong } });
  const staffP = await prisma.bookingStaff.findFirst({ where: { tenantId: tid, unitId: E.units.patong } });
  const cNS = await prisma.customer.findUnique({ where: { id: NS } });
  const d = new Date(Date.now() + 7 * 3600_000 + 3 * 86_400_000);
  const ap = await booking.createAppointment({ tenantId: tid, unitId: E.units.patong, serviceId: svc!.id, staffId: staffP!.id, dateStr: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`, startMin: 660, customerName: "ไม่มา journey", customerPhone: cNS!.phone, source: "STAFF", idempotencyKey: `qc33-appt-${tag}` });
  if (ap?.id) made.appts.push(ap.id);
  await booking.setAppointmentStatus(tid, E.units.patong, ap.id, "NO_SHOW");
  const evNS = await P.outboxEvent.findFirst({ where: { tenantId: tid, type: "booking.no_show", payload: { path: ["appointmentId"], equals: ap.id } } });
  const d5 = mkDeps();
  if (evNS) await J.runForEvent({ tenantId: tid, type: "booking.no_show", payload: evNS.payload, idempotencyKey: evNS.idempotencyKey }, { deps: d5.deps });
  const consumers = read("src/lib/outbox-consumers.ts");
  const A2 = (await import("@/lib/automation/labels" as string)) as Any; const W2 = (await import("@/lib/webhooks/labels" as string)) as Any;
  const in3 = (e: string) => new RegExp(`"${e.replace(/\./g, "\\.")}":`).test(consumers) && A2.AUTOMATION_EVENTS.some((x: Any) => x.value === e && /[ก-๙]/.test(x.label)) && W2.WEBHOOK_EVENTS.filter((x: Any) => x.value === e).length === 1;
  chk("M3.3-S2.8", "no_show: setAppointmentStatus NO_SHOW ยิง event booking.no_show {appointmentId, customerId} (3 ทะเบียน) · journey → run OK · voucher origin JOURNEY + SEND_LINE", !!evNS && evNS.payload.customerId === NS && in3("booking.no_show") && (await runs(jns.id, { customerId: NS })).some((r: Any) => r.status === "OK") && !!(await P.voucher.findFirst({ where: { customerId: NS, origin: "JOURNEY" } })) && d5.calls.line.some((c) => c.customerId === NS), "ครบเส้น", `ev=${!!evNS}/${evNS?.payload?.customerId === NS} reg=${in3("booking.no_show")} runs=${(await runs(jns.id, { customerId: NS })).map((r: Any) => r.status).join(",")}`);

  // (6) review — pos.sale.paid → WAIT_THEN 1 วัน → REQUEST_REVIEW
  await P.automationRule.update({ where: { id: jr.id }, data: { holdoutPct: 0 } });
  const RV = await mkCust("รีวิว");
  const pos = (await import("@/lib/modules/pos/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const sale = await pos.createSale({ tenantId: tid, unitId: E.units.patong, systemId: scope.systems.POS, pointSystemId: PT, memberSystemId: SYS, memberId: RV, idempotencyKey: `qc33-sale-rv-${tag}`, lines: [{ name: "คอร์ส", qty: 1, unitPriceSatang: 100_000 }], payMethods: [{ type: "CASH", amountSatang: 100_000 }] }).catch(() => pos.createSale({ tenantId: tid, unitId: E.units.patong, systemId: scope.systems.POS, pointSystemId: PT, memberId: RV, idempotencyKey: `qc33-sale-rv-${tag}`, lines: [{ name: "คอร์ส", qty: 1, unitPriceSatang: 100_000 }], payMethods: [{ type: "CASH", amountSatang: 100_000 }] }));
  made.sales.push(sale.saleId);
  await drainOutbox(CONS, { limit: 300 }); await drainOutbox(CONS, { limit: 300 });
  const rR = await runs(jr.id, { customerId: RV });
  const wR = rR.find((r: Any) => r.status === "WAITING");
  const d6 = mkDeps();
  await J.runDueWaits({ now: new Date(Date.now() + 2 * 86_400_000), deps: d6.deps });
  const wRb = await P.automationRun.findUnique({ where: { id: wR?.id ?? "-" } });
  const actR = await P.memberActivity.findFirst({ where: { customerId: RV, type: "REVIEW_REQUESTED" } });
  chk("M3.3-S2.9", "review: pos.sale.paid (consumer จริง) → run OK + WAITING 1 วัน (scheduledAt ≈ +1d) · runDueWaits +2 วัน → REQUEST_REVIEW → MemberActivity REVIEW_REQUESTED refId saleId (stub M3.4) · run OK", rR.some((r: Any) => r.status === "OK") && !!wR && Math.abs(new Date(wR.scheduledAt).getTime() - (Date.now() + 86_400_000)) < 3600_000 && wRb?.status === "OK" && !!actR && (actR.refId === sale.saleId || (actR.data as Any)?.refId === sale.saleId) /* ORACLE-EDIT M3.3-S2.9: stub หมดอายุที่ M3.4 — กิจกรรมผูก reviewId (M3.4 S2.1) · เลขบิลอยู่ data.refId */, "ขอรีวิวหลัง 1 วัน", `runs=${rR.map((r: Any) => r.status).join(",")} w=${wR?.scheduledAt} after=${wRb?.status} act=${!!actR}/${actR?.refId === sale?.saleId}`);
  const rvSecond = await pos.createSale({ tenantId: tid, unitId: E.units.patong, systemId: scope.systems.POS, pointSystemId: PT, memberSystemId: SYS, memberId: RV, idempotencyKey: `qc33-sale-rv2-${tag}`, lines: [{ name: "เติมอากาศ", qty: 1, unitPriceSatang: 20_000 }], payMethods: [{ type: "CASH", amountSatang: 20_000 }] }).catch(() => pos.createSale({ tenantId: tid, unitId: E.units.patong, systemId: scope.systems.POS, pointSystemId: PT, memberId: RV, idempotencyKey: `qc33-sale-rv2-${tag}`, lines: [{ name: "เติมอากาศ", qty: 1, unitPriceSatang: 20_000 }], payMethods: [{ type: "CASH", amountSatang: 20_000 }] }));
  made.sales.push(rvSecond.saleId);
  await drainOutbox(CONS, { limit: 300 }); await drainOutbox(CONS, { limit: 300 });
  const rR2 = await runs(jr.id, { customerId: RV });
  chk("M3.3-S2.10", "review reentryDays 30 (preset): บิลที่ 2 ภายใน 30 วัน → run SKIPPED detail re-entry (ไม่ขอรีวิวซ้ำ) · run OK ยัง 1", rR2.filter((r: Any) => r.status === "OK" && r.stepIndex === null).length === 1 && rR2.some((r: Any) => r.status === "SKIPPED" && /re-entry|เข้าซ้ำ/.test(r.detail ?? "")), "SKIPPED re-entry", `runs=${rR2.map((r: Any) => `${r.status}:${r.detail ?? ""}`).join(" | ")}`);

  const OK6 = [jb, jn, ji, ja, jns, jr].map((j) => j.id);
  const okCount = await P.automationRun.count({ where: { ruleId: { in: OK6 }, status: "OK", stepIndex: null } });
  const stepAct = await P.memberActivity.count({ where: { tenantId: tid, type: "JOURNEY_STEP", customerId: { in: made.customers } } });
  chk("M3.3-S2.11", "6 journey สำเร็จรูปมี run OK ครบทุกตัว (≥ 6 รวม) · MemberActivity JOURNEY_STEP ต่อ action ที่ทำจริง ≥ 10 · ทุก run OK มี detail ไทยสรุปขั้น", okCount >= 6 && stepAct >= 10 && (await P.automationRun.findMany({ where: { ruleId: { in: OK6 }, status: "OK" } })).every((r: Any) => /[ก-๙]/.test(r.detail ?? "")), "≥6 OK", `ok=${okCount} steps=${stepAct}`);
  const kanbanBoard = await P.kanbanBoard?.findFirst?.({ where: { tenantId: tid } }).catch(() => null);
  const jk = await J.createJourney(ctx, owner, { name: `เปิดการ์ด ${tag}`, trigger: { event: "member.tier.at_risk" }, conditions: { groups: [] }, actions: [{ type: "OPEN_KANBAN_CARD", params: { boardId: kanbanBoard?.id ?? "no-board", title: "ติดตาม {ชื่อ} เสี่ยงหลุดระดับ" } }, { type: "REMOVE_TAG", params: { tag: "new" } }, { type: "SEND_EMAIL", params: { subject: "ถึงคุณ {ชื่อ}", template: "อย่าลืมกลับมานะ" } }, { type: "SEND_PUSH", params: { title: "SHARK", template: "คิดถึงคุณ {ชื่อ}" } }], holdoutPct: 0, enabled: true });
  made.journeys.push(jk.id);
  const d7 = mkDeps();
  await prisma.customer.update({ where: { id: N }, data: { tags: ["new", "vip"] } });
  await J.runForEvent(evt("member.tier.at_risk", N, {}, "-k"), { deps: d7.deps });
  const custN2 = await prisma.customer.findUnique({ where: { id: N } });
  chk("M3.3-S2.12", "action อื่น: OPEN_KANBAN_CARD → deps.kanban เรียก {boardId, title แทน {ชื่อ}} · REMOVE_TAG 'new' → tags เหลือ ['vip'] · SEND_EMAIL (deps.email) · SEND_PUSH (deps.push) · run OK", d7.calls.kanban.some((c) => c.customerId === N && !/\{ชื่อ\}/.test(c.title ?? "")) && JSON.stringify(custN2?.tags as Any) === JSON.stringify(["vip"]) && d7.calls.email.some((c) => c.customerId === N) && d7.calls.push.some((c) => c.customerId === N) && (await runs(jk.id, { customerId: N })).some((r: Any) => r.status === "OK"), "4 action", `kanban=${d7.calls.kanban.length} tags=${JSON.stringify(custN2?.tags)} email=${d7.calls.email.length} push=${d7.calls.push.length}`);

  // ═══ S3 WAIT_THEN เพิ่มเติม ═══
  const dueEarly = await J.runDueWaits({ now: new Date(Date.now() + 29 * 86_400_000), deps: mkDeps().deps });
  const w30b = await P.automationRun.findUnique({ where: { id: w30?.id ?? "-" } });
  chk("M3.3-S3.1", "run WAITING 30 วัน: now+29 วัน → ยัง WAITING (ไม่ทำก่อนเวลา)", w30b?.status === "WAITING", "WAITING", `${w30b?.status} due=${JSON.stringify(dueEarly)}`);
  await J.toggleJourney(ctx, owner, jn.id, false);
  const w30c = await P.automationRun.findUnique({ where: { id: w30?.id ?? "-" } });
  const d8 = mkDeps();
  const dueOff = await J.runDueWaits({ now: new Date(Date.now() + 31 * 86_400_000), deps: d8.deps });
  chk("M3.3-S3.2", "ปิด journey (toggle enabled=false) → run WAITING ที่เหลือ → CANCELLED ทันที · runDueWaits หลังนั้นไม่ทำ (deps.line 0) · rule.enabled false", w30c?.status === "CANCELLED" && !d8.calls.line.some((c) => c.customerId === N) && (await rule(jn.id))?.enabled === false, "CANCELLED", `st=${w30c?.status} line=${d8.calls.line.length} enabled=${(await rule(jn.id))?.enabled}`);
  await J.toggleJourney(ctx, owner, jn.id, true);
  const N2 = await mkCust("ใหม่สอง");
  await drainOutbox(CONS, { limit: 300 }); await drainOutbox(CONS, { limit: 300 });
  const wN2 = await P.automationRun.findMany({ where: { ruleId: jn.id, customerId: N2, status: "WAITING" } });
  const d9 = mkDeps();
  await J.runDueWaits({ now: new Date(Date.now() + 8 * 86_400_000), deps: d9.deps });
  await J.runDueWaits({ now: new Date(Date.now() + 8 * 86_400_000), deps: d9.deps });
  chk("M3.3-S3.3", "เปิดใหม่ → สมาชิกใหม่ N2 เข้า journey ได้ (WAITING 2) · runDueWaits ซ้ำ 2 ครั้ง → thenActions ทำครั้งเดียว (deps.line ให้ N2 = 1)", wN2.length === 2 && d9.calls.line.filter((c) => c.customerId === N2).length === 1, "1 ครั้ง", `wait=${wN2.length} line=${d9.calls.line.filter((c) => c.customerId === N2).length}`);
  const jw = await J.createJourney(ctx, owner, { name: `ซ้อน ${tag}`, trigger: { event: "member.tier.at_risk" }, conditions: { groups: [] }, actions: [{ type: "WAIT_THEN", params: { days: 1, thenActions: [{ type: "ADD_TAG", params: { tag: "w1" } }, { type: "WAIT_THEN", params: { days: 1, thenActions: [{ type: "ADD_TAG", params: { tag: "w2" } }] } }] } }], holdoutPct: 0, enabled: true });
  made.journeys.push(jw.id);
  const W = await mkCust("ซ้อน");
  await J.runForEvent(evt("member.tier.at_risk", W), { deps: mkDeps().deps });
  await J.runDueWaits({ now: new Date(Date.now() + 1.5 * 86_400_000), deps: mkDeps().deps });
  const tagsW1 = ((await prisma.customer.findUnique({ where: { id: W } }))?.tags as Any as string[]) ?? [];
  await J.runDueWaits({ now: new Date(Date.now() + 2.5 * 86_400_000), deps: mkDeps().deps });
  const tagsW2 = ((await prisma.customer.findUnique({ where: { id: W } }))?.tags as Any as string[]) ?? [];
  const eNest = await fails(() => J.createJourney(ctx, owner, { name: "x", trigger: { event: "member.created" }, conditions: { groups: [] }, actions: [{ type: "WAIT_THEN", params: { days: 1, thenActions: [{ type: "WAIT_THEN", params: { days: 1, thenActions: [{ type: "WAIT_THEN", params: { days: 1, thenActions: [] } }] } }] } }], holdoutPct: 0, enabled: true }));
  chk("M3.3-S3.4", "WAIT_THEN ซ้อน 1 ชั้น: หลัง 1.5 วัน tag w1 (ยังไม่มี w2) · หลัง 2.5 วัน w2 · ซ้อน 3 ชั้น → throw ไทย", tagsW1.includes("w1") && !tagsW1.includes("w2") && tagsW2.includes("w2") && thai(eNest), "w1 → w2", `w1=${JSON.stringify(tagsW1)} w2=${JSON.stringify(tagsW2)} nest=${thai(eNest)}`);

  // ═══ S4 holdout ═══
  const jh = await J.createJourney(ctx, owner, { name: `holdout ${tag}`, trigger: { event: "member.tier.at_risk" }, conditions: { groups: [] }, actions: [{ type: "ADD_TAG", params: { tag: `h-${tag}` } }], holdoutPct: 50, enabled: true });
  made.journeys.push(jh.id);
  const hs: string[] = [];
  for (let k = 0; k < 8; k += 1) hs.push(await mkCust(`ho${k}`));
  for (const id of hs) await J.runForEvent(evt("member.tier.at_risk", id, {}, "-h"), { deps: mkDeps().deps });
  const expHold = hs.filter((id) => hashPct(jh.id, id) < 50).sort();
  const actHold = (await runs(jh.id, { status: "HOLDOUT" })).map((r: Any) => r.customerId).sort();
  chk("M3.3-S4.1", `holdout 50%: run HOLDOUT = ชุด hashPct(ruleId:customerId) < 50 เป๊ะ (${expHold.length}/8) · คนอื่น OK`, JSON.stringify(actHold) === JSON.stringify(expHold) && (await runs(jh.id, { status: "OK" })).length === 8 - expHold.length, `${expHold.length}`, `hold=${actHold.length} ok=${(await runs(jh.id, { status: "OK" })).length}`);
  const tagged = (await prisma.customer.findMany({ where: { id: { in: hs } }, select: { tags: true } })).filter((c) => ((c.tags as Any as string[]) ?? []).includes(`h-${tag}`)).length;
  chk("M3.3-S4.2", "HOLDOUT ไม่ทำ action (tag ติดเฉพาะกลุ่ม OK) แต่บันทึก run เพื่อเทียบ · ยิง event ซ้ำคนเดิม → ไม่เปลี่ยนกลุ่ม (deterministic) · rule.holdoutPct 50", tagged === 8 - expHold.length && (await runs(jh.id, { status: "HOLDOUT" })).every((r: Any) => expHold.includes(r.customerId)) && (await rule(jh.id))?.holdoutPct === 50, "tag เฉพาะ OK", `tagged=${tagged}/${8 - expHold.length}`);
  // ORACLE-EDIT M3.3-S8.2: ปิด jh หลังวัด S4 — ข้อต่อจากนี้ยิง member.tier.at_risk ใส่คนใหม่ (R1/Q1/Q2/L1) ทำให้กลุ่มเทียบของ jh โตเกิน expHold
  await J.toggleJourney(ctx, owner, jh.id, false);

  // ═══ S5 re-entry ═══
  const jre = await J.createJourney(ctx, owner, { name: `re-entry ${tag}`, trigger: { event: "member.tier.at_risk" }, conditions: { groups: [] }, actions: [{ type: "ADD_TAG", params: { tag: "re" } }], holdoutPct: 0, reentryDays: 10, enabled: true });
  made.journeys.push(jre.id);
  const R1 = await mkCust("รี");
  await J.runForEvent(evt("member.tier.at_risk", R1, {}, "-1"), { deps: mkDeps().deps });
  await J.runForEvent(evt("member.tier.at_risk", R1, {}, "-2"), { deps: mkDeps().deps });
  const rr1 = await runs(jre.id, { customerId: R1 });
  chk("M3.3-S5.1", "reentryDays 10: event ที่ 2 (idempotencyKey ใหม่) ภายใน 10 วัน → SKIPPED re-entry · OK 1", rr1.filter((r: Any) => r.status === "OK").length === 1 && rr1.some((r: Any) => r.status === "SKIPPED" && /re-entry|เข้าซ้ำ/.test(r.detail ?? "")), "SKIPPED", rr1.map((r: Any) => `${r.status}:${r.detail ?? ""}`).join(" | "));
  await P.automationRun.updateMany({ where: { ruleId: jre.id, customerId: R1 }, data: { createdAt: new Date(Date.now() - 11 * 86_400_000) } });
  await J.runForEvent(evt("member.tier.at_risk", R1, {}, "-3"), { deps: mkDeps().deps });
  const jre0 = await J.createJourney(ctx, owner, { name: `ครั้งเดียว ${tag}`, trigger: { event: "member.tier.at_risk" }, conditions: { groups: [] }, actions: [{ type: "ADD_TAG", params: { tag: "once" } }], holdoutPct: 0, reentryDays: null, enabled: true });
  made.journeys.push(jre0.id);
  await J.runForEvent(evt("member.tier.at_risk", R1, {}, "-o1"), { deps: mkDeps().deps });
  await P.automationRun.updateMany({ where: { ruleId: jre0.id, customerId: R1 }, data: { createdAt: new Date(Date.now() - 400 * 86_400_000) } });
  await J.runForEvent(evt("member.tier.at_risk", R1, {}, "-o2"), { deps: mkDeps().deps });
  chk("M3.3-S5.2", "พ้น 10 วัน (run เก่า createdAt −11 วัน) → เข้าใหม่ได้ (OK 2) · reentryDays null = ครั้งเดียวตลอดชีพ: แม้ run เก่า 400 วัน → SKIPPED", (await runs(jre.id, { customerId: R1, status: "OK" })).length === 2 && (await runs(jre0.id, { customerId: R1, status: "OK" })).length === 1 && (await runs(jre0.id, { customerId: R1, status: "SKIPPED" })).length === 1, "OK 2 · once 1", `re=${(await runs(jre.id, { customerId: R1, status: "OK" })).length} once=${(await runs(jre0.id, { customerId: R1 })).map((r: Any) => r.status).join(",")}`);

  // ═══ S6 quota · loop guard ═══
  await prisma.tenant.update({ where: { id: tid }, data: { limits: { ...((tenant0?.limits as Any) ?? {}), member: { ...(((tenant0?.limits as Any) ?? {}).member ?? {}), automationRunsPerMonth: (await P.automationRun.count({ where: { rule: { memberSystemId: SYS }, createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } })) + 1 } } } });
  const Q1 = await mkCust("โควตา1"); const Q2 = await mkCust("โควตา2");
  await J.runForEvent(evt("member.tier.at_risk", Q1, {}, "-q"), { deps: mkDeps().deps });
  await J.runForEvent(evt("member.tier.at_risk", Q2, {}, "-q"), { deps: mkDeps().deps });
  const rq2 = await P.automationRun.findMany({ where: { customerId: Q2 } });
  chk("M3.3-S6.1", "quota Tenant.limits.member.automationRunsPerMonth = ที่ใช้ไป+1: Q1 ยังรันได้ · Q2 → SKIPPED detail quota (ไม่ทำ action)", (await P.automationRun.count({ where: { customerId: Q1, status: "OK" } })) >= 1 && rq2.length > 0 && rq2.every((r: Any) => r.status === "SKIPPED" && /quota|โควตา/.test(r.detail ?? "")), "SKIPPED quota", `q1=${await P.automationRun.count({ where: { customerId: Q1, status: "OK" } })} q2=${rq2.map((r: Any) => `${r.status}:${r.detail}`).join(",")}`);
  await prisma.tenant.update({ where: { id: tid }, data: { limits: tenant0?.limits ?? {} } });
  const L1 = await mkCust("ลูป");
  const e1 = evt("member.tier.at_risk", L1, {}, "-loop");
  await Promise.all([J.runForEvent(e1, { deps: mkDeps().deps }), J.runForEvent(e1, { deps: mkDeps().deps })]);
  await J.runForEvent(e1, { deps: mkDeps().deps });
  const rl = await P.automationRun.findMany({ where: { customerId: L1, ruleId: ja.id } });
  chk("M3.3-S6.2", "loop guard: event เดียวกัน (idempotencyKey เดิม) ยิงพร้อมกัน 2 + ซ้ำอีก 1 → run ของ journey at_risk สำหรับ L1 = 1 (ไม่นับ SKIPPED)", rl.filter((r: Any) => r.status !== "SKIPPED").length === 1, "1 run", rl.map((r: Any) => r.status).join(","));

  // ═══ S7 dry-run ═══
  const runsBefore = await P.automationRun.count({ where: { tenantId: tid } });
  const vBefore = await P.voucher.count({ where: { tenantId: tid } });
  const dr = await J.dryRun(ctx, owner, ji.id, { days: 30 });
  chk("M3.3-S7.1", "dryRun(inactive): {candidates ≥ 4 (I1–I4 · lastActivityAt เก่า 70 วัน), wouldEnter, holdout, skippedByConditions ≥ 2 (I2 ไม่ยินยอม · I3 ระดับต่ำ), perStep[]} · ไม่เขียน (run/voucher เท่าเดิม)", (dr?.candidates ?? 0) >= 4 && typeof dr.wouldEnter === "number" && (dr.skippedByConditions ?? 0) >= 2 && Array.isArray(dr.perStep) && dr.perStep.length >= 3 && (await P.automationRun.count({ where: { tenantId: tid } })) === runsBefore && (await P.voucher.count({ where: { tenantId: tid } })) === vBefore, "อ่านอย่างเดียว", `dr=${JSON.stringify(dr)} runs=${await P.automationRun.count({ where: { tenantId: tid } })}/${runsBefore}`);
  const drB = await J.dryRun(ctx, owner, jb.id, { days: 30 });
  const eDrThana = await fails(() => J.dryRun(ctx, thana, jb.id, { days: 30 }));
  chk("M3.3-S7.2", "dryRun(birthday daysBefore 7): candidates ≥ 1 (X วันเกิดอีก 7 วัน) · thana (ไม่มี promo.read? — read-โดยนัยผ่าน) ไม่ throw หรือ throw ไทย · journey ไม่มี → throw ไทย", (drB?.candidates ?? 0) >= 1 && (!eDrThana || thai(eDrThana)) && thai(await fails(() => J.dryRun(ctx, owner, "no-such", { days: 30 }))), "candidates ≥1", `drB=${JSON.stringify(drB)} thana=${eDrThana?.message?.slice(0, 40)}`);

  // ═══ S8 stats ═══
  const stI = await J.journeyStats(ctx, owner, ji.id, { days: 30 });
  chk("M3.3-S8.1", "journeyStats(inactive): entered = run เข้า (OK+HOLDOUT) · perStep มี label ไทย + count (ISSUE_VOUCHER = จำนวน voucher · WAIT_THEN = จำนวน WAITING/OK ของขั้นนั้น) · results {sent, used ≥ 1 (I4 ใช้ voucher), usedPct, saleSatang, costSatang ≥ 30000, roi} · holdout {entered 0, converted 0} · recent[] มีชื่อ · daily[]", stI?.entered >= 2 && Array.isArray(stI.perStep) && stI.perStep.every((s: Any) => /[ก-๙]/.test(s.label) && typeof s.count === "number") && stI.results?.used >= 1 && stI.results.costSatang >= 30_000 && typeof stI.results.roi === "number" && stI.holdout?.entered === 0 && Array.isArray(stI.recent) && stI.recent.every((r: Any) => !!r.name) && Array.isArray(stI.daily), "สถิติครบ", JSON.stringify(stI).slice(0, 300));
  const stH = await J.journeyStats(ctx, owner, jh.id, { days: 30 });
  const listJ = await J.listJourneys(ctx, owner);
  const rowI = listJ?.find((j: Any) => j.id === ji.id);
  chk("M3.3-S8.2", `journeyStats(holdout): holdout.entered = ${expHold.length} · uplift = usedPct − holdout.convertedPct (ตัวเลข) · AutomationRule.journeyStats Json เก็บสรุป · listJourneys แถว inactive มี stats30d {entered, used, saleSatang, costSatang, roi} + enabled + trigger`, stH?.holdout?.entered === expHold.length && typeof stH.uplift === "number" && !!(await rule(jh.id))?.journeyStats && rowI && ["entered", "used", "saleSatang", "costSatang", "roi"].every((k) => k in (rowI.stats30d ?? {})) && "enabled" in rowI && !!rowI.trigger, "ครบ", `hold=${stH?.holdout?.entered}/${expHold.length} uplift=${stH?.uplift} row=${JSON.stringify(rowI).slice(0, 160)}`);

  // ═══ S9 UI / ภาพ ═══
  const pages = { list: read("src/app/app/sys/[id]/member/journeys/page.tsx"), neu: read("src/app/app/sys/[id]/member/journeys/new/page.tsx"), detail: read("src/app/app/sys/[id]/member/journeys/[journeyId]/page.tsx") };
  const act = read("src/lib/modules/member/journeys-actions.ts");
  const compDir = "src/components/member";
  const comps = existsSync(compDir) ? readdirSync(compDir).filter((f) => /journey/i.test(f)).map((f) => read(`${compDir}/${f}`)).join("\n") : "";
  const all = Object.values(pages).join("\n") + comps;
  const TIDS = ["journeys-page", "journeys-builder", "journey-trigger", "journey-condition", "journey-action", "journey-add", "journey-name", "journey-dryrun", "journeys-save", "journeys-table", "journey-row-", "journeys-presets", "journey-detail", "journey-steps", "journey-step", "journey-results", "journey-holdout", "journey-daily", "journey-recent", "journey-toggle"];
  const missingT = TIDS.filter((t) => !all.includes(t));
  const LABELS = ["เมื่อ", "และถ้า", "ให้ทำ", "เพิ่มเงื่อนไข หรือ เพิ่มการกระทำ", "ชื่อ journey", "ทดลองรัน", "บันทึก Journey", "ทดลองรันย้อนหลังได้", "holdout กลุ่มเทียบ", "Journey ที่เปิดใช้อยู่", "ส่งเดือนนี้", "ใช้สิทธิ์", "ยอดที่เกิด", "ต้นทุน", "ROI", "สถานะ", "ขั้นตอน", "ผลลัพธ์ 30 วัน", "กลุ่มเทียบ (holdout", "ใช้สิทธิ์รายวัน", "เข้าล่าสุด", "แก้ไข", "หยุดชั่วคราว", "ทำสำเนา", "สร้าง Journey ใหม่"];
  const missingL = LABELS.filter((l) => !all.includes(l));
  const facade = read("src/lib/modules/member/index.ts"); const jsrc = read("src/lib/modules/member/journeys.ts"); const cron = read("src/lib/platform/cron.ts");
  chk("M3.3-S9.1", "หน้า journeys · new · [journeyId] requireTenant + สิทธิ์ · actions 'use server' gate promo.manage · testid 20 · ป้ายภาพ 07/22 ครบ · facade export createJourney/updateJourney/toggleJourney/deleteJourney/listJourneys/getJourney/runForEvent/runDueWaits/emitJourneyCronEvents/dryRun/journeyStats/createFromPreset · journeys.ts ไม่ import โมดูลอื่นตรงนอก facade · cron.ts มี journeyWaits (รายชั่วโมง) + emitJourneyCronEvents (รายวัน) · outbox-consumers เรียก runForEvent ผ่าน withAutomation/best-effort · ไม่มี any/อีโมจิ/hex",
    Object.values(pages).every((p) => p.length > 0 && /requireTenant/.test(p)) && /["']use server["']/.test(act) && /promo\.manage/.test(act) && missingT.length === 0 && missingL.length === 0 && ["createJourney", "updateJourney", "toggleJourney", "deleteJourney", "listJourneys", "getJourney", "runForEvent", "runDueWaits", "emitJourneyCronEvents", "dryRun", "journeyStats", "createFromPreset"].every((f) => new RegExp(`\\b${f}\\b`).test(facade)) && !/@\/lib\/modules\/(voucher|point|stamp|chat|kanban|booking|pos)\/(?!index)[a-z-]+"/.test(jsrc) && /journeyWaits|runDueWaits/.test(cron) && /emitJourneyCronEvents/.test(cron) && /runForEvent|journeys\./.test(consumers) && !/:\s*any\b/.test(jsrc + act) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(all.replace(/\/\/.*$/gm, "")) && !/#[0-9a-fA-F]{6}\b/.test(all.replace(/\/\/.*$/gm, "")),
    "ครบ", `pages=${Object.values(pages).map((p) => p.length > 0).join("/")} tid-missing=${missingT.join(",") || "-"} labels-missing=${missingL.join(",") || "-"} cron=${/journeyWaits|runDueWaits/.test(cron)}/${/emitJourneyCronEvents/.test(cron)} consumer=${/runForEvent|journeys\./.test(consumers)}`);
  const dir = `${mq.MQC.shotsDir}/3.3`;
  const sum = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const r = (u: string, n: string, d: string) => sum(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  const ok = (u: string, n: string, d: string) => r(u, n, d)?.status === 200 && r(u, n, d)?.missing?.length === 0 && r(u, n, d)?.errors?.length === 0 && !r(u, n, d)?.overflow;
  chk("M3.3-S9.2", "ภาพ 07 บน: journeys-owner desktop+mobile 200 ไม่ล้น (builder + ตาราง journey ที่เปิดใช้อยู่ ≥ 6 แถว) · thana 200 · noperm 404", ok("owner", "journeys-owner", "desktop") && ok("owner", "journeys-owner", "mobile") && ok("thana", "journeys-thana", "desktop") && r("noperm", "journeys-noperm", "desktop")?.status === 404, "200 ×3 · 404", `${r("owner", "journeys-owner", "desktop")?.status}/${r("owner", "journeys-owner", "mobile")?.status}/${r("thana", "journeys-thana", "desktop")?.status}/${r("noperm", "journeys-noperm", "desktop")?.status}`);
  chk("M3.3-S9.3", "ภาพ 22: journey-detail-owner desktop 200 (ขั้นตอน 5 การ์ด · ผลลัพธ์ 5 ตัวเลข · กล่อง holdout · กราฟรายวัน · เข้าล่าสุด) · journey-new-owner 200 (builder ว่าง + สำเร็จรูป 6)", ok("owner", "journey-detail-owner", "desktop") && ok("owner", "journey-new-owner", "desktop"), "200 ×2", `${r("owner", "journey-detail-owner", "desktop")?.status}/${r("owner", "journey-new-owner", "desktop")?.status} missing=${JSON.stringify(r("owner", "journey-detail-owner", "desktop")?.missing)}`);
  chk("M3.3-S9.4", "🔴 parity ภาพ 07 (บน) + 22 — Fable ตรวจด้วยตา · wo-notes/member-M3.3.md มี 'PARITY: ผ่าน'", /^\s*-?\s*\*\*PARITY:\s*ผ่าน\*\*/m.test(read("ledger/wo-notes/member-M3.3.md")), "PARITY: ผ่าน", "ยังไม่ได้ตรวจภาพ", "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M3.3-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  // ORACLE-EDIT M3.3-S2.3 (finally): cron รอบเวลายิงให้คนใน seed ได้ (วันเกิดตรง/หายไปนาน) → คืนแต้ม/ไทม์ไลน์ของ run journey ที่ข้อสอบสร้าง
  if (made.journeys.length) {
    const runIds = ((await P.automationRun.findMany({ where: { OR: [{ ruleId: { in: made.journeys } }, { journeyId: { in: made.journeys } }] }, select: { id: true } }).catch(() => [])) as Any[]).map((x) => x.id);
    if (runIds.length) {
      const jl = ((await P.pointLedger.findMany({ where: { tenantId: tid, refType: "JOURNEY", refId: { in: runIds } }, select: { id: true, systemId: true, customerId: true, delta: true } }).catch(() => [])) as Any[]);
      for (const l of jl) await d(() => P.pointBalance.updateMany({ where: { systemId: l.systemId, customerId: l.customerId }, data: { balance: { decrement: l.delta } } }));
      await d(() => P.pointLot.deleteMany({ where: { ledgerId: { in: jl.map((l) => l.id) } } })); await d(() => P.pointLedger.deleteMany({ where: { id: { in: jl.map((l) => l.id) } } }));
      await d(() => P.memberActivity.deleteMany({ where: { tenantId: tid, type: { in: ["JOURNEY_STEP", "REVIEW_REQUESTED"] }, OR: [{ refId: { in: runIds } }, { refId: { in: made.journeys } }, { createdAt: { gte: new Date(parseInt(tag, 36)) } }] } }));
    }
  }
  if (made.journeys.length) { await d(() => P.automationRun.deleteMany({ where: { ruleId: { in: made.journeys } } })); await d(() => P.automationRule.deleteMany({ where: { id: { in: made.journeys } } })); }
  await d(() => P.appNotification.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 3600_000) }, title: { contains: "เสี่ยง" } } }));
  if (made.appts.length) await d(() => prisma.appointment.deleteMany({ where: { id: { in: made.appts } } }));
  if (made.sales.length) {
    const leds = await prisma.pointLedger.findMany({ where: { tenantId: tid, refId: { in: made.sales } }, select: { id: true } }).catch(() => [] as Any[]);
    await d(() => P.pointLot.deleteMany({ where: { ledgerId: { in: leds.map((l: Any) => l.id) } } })); await d(() => prisma.pointLedger.deleteMany({ where: { id: { in: leds.map((l: Any) => l.id) } } }));
    await d(() => P.accountJournalLine.deleteMany({ where: { entry: { refType: "PosSale", refId: { in: made.sales } } } })); await d(() => P.accountJournalEntry.deleteMany({ where: { tenantId: tid, refType: "PosSale", refId: { in: made.sales } } })); await d(() => P.accountDocument.deleteMany({ where: { tenantId: tid, refType: "PosSale", refId: { in: made.sales } } }));
    await d(() => P.stampEvent.deleteMany({ where: { refType: "SALE", refId: { in: made.sales } } }));
    await d(() => P.memberActivity.deleteMany({ where: { tenantId: tid, refType: "PosSale", refId: { in: made.sales } } }));
    await d(() => P.posPayment.deleteMany({ where: { saleId: { in: made.sales } } })); await d(() => P.posSaleLine.deleteMany({ where: { saleId: { in: made.sales } } })); await d(() => prisma.posSale.deleteMany({ where: { id: { in: made.sales } } }));
  }
  await d(() => P.memberActivity.deleteMany({ where: { tenantId: tid, module: "voucher", refId: { notIn: [...before.vouchers] } } }));
  await d(() => P.voucher.deleteMany({ where: { tenantId: tid, id: { notIn: [...before.vouchers] } } }));
  await d(() => P.voucherTemplate.deleteMany({ where: { tenantId: tid, id: { notIn: [...before.templates] } } }));
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["automationRun", "voucher", "stampCardProgress", "pointLot", "pointLedger", "pointBalance", "memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberAccessLog", "memberActivity"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.appointment.deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) { await d(() => prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } })); await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } })); }
  }
  for (const t of ["member.", "booking.", "pos.sale.", "voucher.", "point.", "stamp."]) await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: t }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M3.3: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
