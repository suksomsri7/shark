// probe-l3-queues.mts — C5.2 HUNTER lens L3 (queues, cron, redelivery, races) · NOT an oracle · QC2 ONLY (ep-cool-shadow)
// Run: bash scripts/qc2.sh pnpm exec tsx scripts/pending/hunt-l3/probe-l3-queues.mts
// Throwaway tenant `qc-hunt-l3-<rand>-a` · every row with that tenantId + the tenant/users is deleted in finally.
// Never drains the outbox and never runs a real cron job: sequences.runDue is scoped with tenantIds=[mine];
// the minute-job dispatcher runs with its registry CLEARED and two fake jobs named `qc-hunt-l3-<rand>-*` (state rows removed after).
//   L3-A sequence e-mail step whose sender answers { ok:false } (Resend 429/5xx shape) ⇒ enrollment moves PAST the step,
//        log reason still says "will retry" — the step is never retried
//   L3-B deal moved to WON through the CRM service ⇒ crm.deal.won stays PENDING (CRM never schedules a drain) ⇒ the next
//        sequence run still e-mails the contact of the WON deal (stopOnWon=true)
//   L3-C same, bridgesEnabled=false ⇒ even when the crm.deal.won consumer runs, the sequence is not stopped
//   L3-D daily cadence shares ONE 20 s budget: a slow first job ⇒ later daily jobs "no-budget" in the single daily run,
//        and the cut-off job is recorded as run (not due again the same Thai day)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";

const env = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = env.loadQcEnv();
if (!/ep-cool-shadow/.test(host)) { console.log(`not QC2 (${host}) — refuse`); process.exit(1); }
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, "q");
const TAG = `qc-hunt-l3-${rand}`;
const out: Record<string, unknown> = { db: host.replace(/:.*@/, "@"), tag: TAG };
const TENANTS: string[] = [];
const USERS: string[] = [];
const JOBS = [`${TAG}-slow`, `${TAG}-tail`];
const safe = async <T,>(label: string, f: () => Promise<T>): Promise<T | string> => { try { return await f(); } catch (e) { const x = e as Any; return `ERR ${label}: ${x?.name ?? ""}(${x?.code ?? "-"}) ${String(x?.message ?? e).slice(0, 300)}`; } };

try {
  const SEQ = (await import("@/lib/modules/crm/sequences" as string)) as Any;
  const DEALS = (await import("@/lib/modules/crm/deals" as string)) as Any;
  const BR = (await import("@/lib/platform/crm-bridges/sequences" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;

  const t = await P.tenant.create({ data: { name: `${TAG}-a`, slug: `${TAG}-a` } });
  TENANTS.push(t.id);
  const T = t.id as string;
  const u = await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC OWNER ${TAG}` } });
  USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const owner = { userId: u.id as string, role: "OWNER", unitAccess: ["*"], permissions: {} };

  const mkSys = async (label: string, bridges: boolean) => {
    const S = (await sysSvc.createSystem(T, "CRM", `${label} ${TAG}`)).id as string;
    await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_build_object('crm', jsonb_build_object('uiVersion', 2, 'bridgesEnabled', $2::boolean)) WHERE "id" = $1`, S, bridges);
    const pipe = await P.crmPipeline.create({
      data: { tenantId: T, systemId: S, name: `ขาย ${TAG}`, isDefault: true, stages: { create: [["ใหม่", "OPEN", 20], ["ชนะ", "WON", 100]].map(([name, kind, probability], i) => ({ tenantId: T, systemId: S, sortOrder: i, name, kind, probability })) } },
      include: { stages: true },
    });
    const st = pipe.stages as Any[];
    return { ctx: { tenantId: T, systemId: S, actorUserId: owner.userId }, S, pipe: pipe.id as string, OPEN: st.find((x) => x.kind === "OPEN").id as string, WON: st.find((x) => x.kind === "WON").id as string };
  };
  const mkContact = async (S: string, label: string) => {
    const c = await P.crmContact.create({ data: { tenantId: T, systemId: S, name: `${label} ${TAG}`, firstName: label, email: `${TAG}-${label}@qc.invalid`, ownerUserId: owner.userId } });
    await P.crmContactConsent.create({ data: { tenantId: T, systemId: S, contactId: c.id, channel: "EMAIL", granted: true, source: "STAFF", createdAt: new Date(Date.now() - 120_000) } });
    return c;
  };
  const OPENW = { businessDaysOnly: false, sendWindow: null };
  const EMAIL = (subject: string) => ({ kind: "EMAIL", subject, body: "เรียนคุณ {{contact.firstName}}" });
  const enr = (id: string) => P.crmSequenceEnrollment.findUnique({ where: { id }, select: { status: true, stepIndex: true, stoppedReason: true, stats: true } });
  const logOf = (row: Any) => (Array.isArray(row?.stats?.log) ? row.stats.log : []).map((x: Any) => ({ index: x.index, outcome: x.outcome, reason: x.reason }));
  const enrollOne = async (c: Any, seqName: string, contactId: string, dealId?: string) => {
    const s = await SEQ.createSequence(c.ctx, owner, { name: `${seqName} ${TAG}`, stopOnReply: true, stopOnWon: true, stopOnLost: true, ...OPENW, steps: [EMAIL("ขั้นที่หนึ่ง"), EMAIL("ขั้นที่สอง")] });
    const seqId = (s?.id ?? s?.sequence?.id) as string;
    const r = await SEQ.enroll(c.ctx, owner, { sequenceId: seqId, contactId, ...(dealId ? { dealId } : {}) });
    const id = (r?.enrollmentId ?? r?.enrollment?.id ?? r?.id) as string | undefined;
    return id ?? ((await P.crmSequenceEnrollment.findFirst({ where: { sequenceId: seqId, contactId }, select: { id: true } }))?.id as string);
  };

  // ── L3-A · plain { ok:false } from the sender ⇒ step skipped for good ─────────────────────────────────────
  {
    const c = await mkSys("L3-A", true);
    const k = await mkContact(c.S, "A");
    const eid = await enrollOne(c, "ตัวส่งล้ม", k.id);
    const calls: Any[] = [];
    // the exact shape `defaultSender` returns when sendAsSystem ends FAILED (Resend 429/5xx/timeout): no NUL, no throw
    const failing = async (r: Any) => { calls.push({ ch: r.channel }); return { ok: false, error: "ส่งอีเมลไม่สำเร็จ — ระบบจะลองขั้นนี้อีกครั้งในรอบถัดไป" }; };
    const r1 = await safe("runDue#1", () => SEQ.runDue(new Date(Date.now() + 1_000), { deps: { email: failing, line: failing, sms: failing }, tenantIds: [T] }));
    const after1 = await enr(eid);
    const okSender = async (r: Any) => { calls.push({ ch: r.channel, ok: true }); return { ok: true }; };
    const r2 = await safe("runDue#2", () => SEQ.runDue(new Date(Date.now() + 16 * 60_000), { deps: { email: okSender, line: okSender, sms: okSender }, tenantIds: [T] }));
    const after2 = await enr(eid);
    out.L3_A = { run1: r1, afterRun1: { status: after1?.status, stepIndex: after1?.stepIndex, log: logOf(after1) }, run2: r2, afterRun2: { status: after2?.status, stepIndex: after2?.stepIndex, log: logOf(after2) }, senderCalls: calls };
    out.L3_A_verdict = (after1?.stepIndex ?? 0) >= 1 && logOf(after1).some((x: Any) => x.index === 0 && x.outcome === "FAILED") && logOf(after2).filter((x: Any) => x.index === 0 && x.outcome === "SENT").length === 0 ? "BUG-REPRODUCED (step 0 FAILED once, never retried; enrollment moved on)" : "no-bug";
  }

  // ── L3-B / L3-C · deal WON while a stopOnWon sequence is running ─────────────────────────────────────────
  for (const bridges of [true, false]) {
    const label = bridges ? "L3_B" : "L3_C";
    const c = await mkSys(label, bridges);
    const k = await mkContact(c.S, bridges ? "B" : "C");
    const d = await P.crmDeal.create({ data: { tenantId: T, systemId: c.S, contactId: k.id, pipelineId: c.pipe, stageId: c.OPEN, title: `ดีล ${TAG}`, valueSatang: 100_000, kind: "OPEN", ownerUserId: owner.userId, stageEnteredAt: new Date() } });
    const eid = await enrollOne(c, `ดีล ${label}`, k.id, d.id);
    const mv = await safe("moveDeal WON", () => DEALS.moveDeal(c.ctx, owner, d.id, { stageId: c.WON }));
    const wonEvt = await P.outboxEvent.findFirst({ where: { tenantId: T, type: "crm.deal.won", payload: { path: ["dealId"], equals: d.id } }, select: { id: true, status: true, idempotencyKey: true, payload: true, systemId: true, unitId: true, type: true, tenantId: true } });
    let bridgeRan: unknown = "not-run";
    if (!bridges && wonEvt) bridgeRan = await safe("onDealWonStopSequences", () => BR.onDealWonStopSequences({ id: wonEvt.id, tenantId: T, type: "crm.deal.won", payload: wonEvt.payload, systemId: wonEvt.systemId, unitId: wonEvt.unitId }));
    const sent: Any[] = [];
    const rec = async (r: Any) => { sent.push({ ch: r.channel, contactId: r.contactId }); return { ok: true }; };
    const run = await safe("runDue", () => SEQ.runDue(new Date(Date.now() + 1_000), { deps: { email: rec, line: rec, sms: rec }, tenantIds: [T] }));
    const dealNow = await P.crmDeal.findUnique({ where: { id: d.id }, select: { kind: true } });
    const e = await enr(eid);
    out[label] = { bridgesEnabled: bridges, move: typeof mv === "string" ? mv : "ok", dealKind: dealNow?.kind, wonEventStatusAtSend: wonEvt?.status ?? "none", bridgeRan: bridgeRan ?? "ok", run, sentToWonDealContact: sent.length, enrollment: { status: e?.status, stepIndex: e?.stepIndex, stoppedReason: e?.stoppedReason } };
    out[`${label}_verdict`] = dealNow?.kind === "WON" && sent.length > 0 ? "BUG-REPRODUCED (sequence e-mail sent after the deal was WON)" : "no-bug";
  }

  // ── L3-D · daily cadence: one shared 20 s budget ⇒ tail job starves in the single daily invocation ───────────
  {
    const MJ = (await import("@/lib/platform/minute-jobs" as string)) as Any;
    const reg = (globalThis as Any)[Symbol.for("shark.platform.minute-jobs.registry")] as Map<string, unknown>;
    const realNames = [...reg.keys()];
    reg.clear(); // this process only — the real jobs never run here
    let tailRan = 0;
    MJ.registerMinuteJob({ name: JOBS[0], everyMinutes: 1440, cadence: "daily", run: () => new Promise((r) => setTimeout(r, 20_600)) });
    MJ.registerMinuteJob({ name: JOBS[1], everyMinutes: 1440, cadence: "daily", run: async () => { tailRan += 1; } });
    const now1 = new Date();
    const s1 = await MJ.runMinuteJobs(now1, { cadence: "daily", entry: "vps" });
    await MJ.settleOutstandingMinuteJobs(5_000);
    const st = await MJ.getMinuteJobStatus(JOBS);
    // what a second daily invocation the same Thai day would see (there is none in the crontab: one line per day)
    const tailRanAfterRun1 = tailRan;
    const s2 = await MJ.runMinuteJobs(new Date(now1.getTime() + 60_000), { cadence: "daily", entry: "vps" });
    out.L3_D = { realDailyJobsInRegistrationOrder: realNames, run1: s1.results, tailRanAfterRun1, tailRanAfterRun2: tailRan, status: st.map((x: Any) => ({ name: x.name.replace(TAG, "<tag>"), lastRunAt: x.lastRunAt, lastOkAt: x.lastOkAt })), hypotheticalSecondRunSameDay: s2.results.map((x: Any) => ({ ...x, name: x.name.replace(TAG, "<tag>") })) };
    const o1 = Object.fromEntries(s1.results.map((x: Any) => [x.name, x.outcome]));
    out.L3_D_verdict = o1[JOBS[0]] === "cut-off" && o1[JOBS[1]] === "no-budget" ? "BUG-REPRODUCED (tail daily job skipped; cut-off job marked as run for the day)" : `no-bug ${JSON.stringify(o1)}`;
  }
} catch (e) {
  out.fatal = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
} finally {
  await new Promise((r) => setTimeout(r, 2000));
  for (let pass = 0; pass < 4; pass += 1) {
    const tables = ((await P.$queryRawUnsafe(`select distinct table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (const tb of tables) for (const id of TENANTS) await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, id).catch(() => undefined);
  }
  for (const id of TENANTS) { await P.appSystem.deleteMany({ where: { tenantId: id } }).catch(() => undefined); await P.tenant.delete({ where: { id } }).catch(() => undefined); }
  for (const id of USERS) { await P.appNotification.deleteMany({ where: { recipientUserId: id } }).catch(() => undefined); await P.membership.deleteMany({ where: { userId: id } }).catch(() => undefined); await P.user.delete({ where: { id } }).catch(() => undefined); }
  await P.opsAlertState.deleteMany({ where: { source: { contains: TAG } } }).catch(() => undefined);
  await P.opsEvent.deleteMany({ where: { OR: [{ message: { contains: TAG } }, { tenantId: { in: TENANTS } }] } }).catch(() => undefined);
  out.cleanup = {
    tenantsLeft: await P.tenant.count({ where: { id: { in: TENANTS } } }),
    usersLeft: await P.user.count({ where: { id: { in: USERS } } }),
    outboxLeft: await P.outboxEvent.count({ where: { tenantId: { in: TENANTS } } }),
    enrollmentsLeft: await P.crmSequenceEnrollment.count({ where: { tenantId: { in: TENANTS } } }),
    jobStateLeft: await P.opsAlertState.count({ where: { source: { contains: TAG } } }),
    opsEventsLeft: await P.opsEvent.count({ where: { message: { contains: TAG } } }),
  };
  console.log(JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  await prisma.$disconnect();
  process.exit(0);
}
