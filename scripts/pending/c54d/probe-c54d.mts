// C5.4-D (FB-QUEUE) builder probe — behaviours of the fix that the pinned C5.3-L3 checks do not cover
//   P1 LOST at send time (event never emitted/drained) ⇒ STOPPED LOST · 0 sends · one auto_stop audit + one finished event
//   P2 controls: stopOnWon=false with a WON deal and stopOnLost=false with a LOST deal still send every step
//   P3 bounded retry: a sender failing every time ⇒ step 0 kept, backoff grows, STOPPED FAILED after 5 attempts, exactly one audit row
//   P4 complaint replay after the customer re-granted e-mail consent (row after the complaint) ⇒ no new withdrawal row
//   P5 complaint replay when the opt-out flag was cleared ⇒ nothing touched (enrollment ACTIVE, no rows)
//   P6 complaint replay twice on the crash state ⇒ exactly ONE withdrawal row, enrollment STOPPED OPT_OUT
//   P7 bounce replay on the crash state (event + emailBouncedAt, no stop) ⇒ enrollment STOPPED BOUNCE
//   P8 hourly cadence: a never-run job registered AFTER a job that ran in the previous window runs FIRST (least-recently-run order)
//   P9 REST write on a uiVersion-1 system is refused and does NOT wake the outbox (no drain of this tenant's PENDING event)
// Run (QC3): bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c54d/probe-c54d.mts
// Throwaway tenant `qc-c54d-<rand>` · outbox candidate query narrowed to it (process-local guard) · everything deleted in finally (CLEAN)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHmac, randomBytes } from "node:crypto";

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-c54d-${rand}`;
const SVIX_SECRET = `whsec_${Buffer.from(randomBytes(24)).toString("base64")}`;
const OLD_SVIX = process.env.RESEND_WEBHOOK_SECRET;
const JOBS = [`${TAG}-hA`, `${TAG}-hB`];
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string) => {
  cks.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}\n        — ACTUAL ${actual}`);
};
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
globalThis.fetch = (async () => { throw new Error("probe: network blocked"); }) as typeof fetch;
let T = "";
const USERS: string[] = [];

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const SEQ = CRM.sequences;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  const OB = P.outboxEvent; const OB_FIND = OB.findMany;
  OB.findMany = (a: Any) => OB_FIND.call(OB, { ...(a ?? {}), where: { AND: [a?.where ?? {}, { tenantId: T }] } });
  const u = await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC ${TAG}` } });
  USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const owner = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  let n = 0;
  const mkCrm = async (crm: Record<string, unknown> = {}) => {
    const S = (await sysSvc.createSystem(T, "CRM", `${TAG} ${++n}`)).id as string;
    await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`, JSON.stringify({ uiVersion: 2, bridgesEnabled: true, ...crm }), S);
    const p = await P.crmPipeline.create({ data: { tenantId: T, systemId: S, name: `ขาย ${TAG}`, isDefault: true, stages: { create: [["ใหม่", "OPEN", 20], ["ชนะ", "WON", 100], ["แพ้", "LOST", 0]].map(([name, kind, probability], i) => ({ tenantId: T, systemId: S, sortOrder: i, name, kind, probability })) } }, include: { stages: true } });
    const st = p.stages as Any[];
    return { S, ctx: { tenantId: T, systemId: S, actorUserId: u.id }, pipe: p.id as string, OPEN: st.find((x) => x.kind === "OPEN").id, WON: st.find((x) => x.kind === "WON").id, LOST: st.find((x) => x.kind === "LOST").id };
  };
  const c = await mkCrm();
  const mkContact = async (label: string) => {
    const party = await P.party.create({ data: { tenantId: T, name: `${label} ${TAG}`, kind: "PERSON" } });
    const k = await P.crmContact.create({ data: { tenantId: T, systemId: c.S, name: `${label} ${TAG}`, firstName: label, partyId: party.id, ownerUserId: u.id, email: `${TAG}-${label}@qc.invalid` } });
    await P.crmContactConsent.create({ data: { tenantId: T, systemId: c.S, contactId: k.id, channel: "EMAIL", granted: true, source: "STAFF", createdAt: new Date(Date.now() - 120_000) } });
    return k;
  };
  const mkDeal = (contactId: string) => P.crmDeal.create({ data: { tenantId: T, systemId: c.S, contactId, pipelineId: c.pipe, stageId: c.OPEN, title: `ดีล ${TAG}`, valueSatang: 100_000, kind: "OPEN", ownerUserId: u.id, stageEnteredAt: new Date() } });
  const EMAIL = (subject: string) => ({ kind: "EMAIL", subject, body: "เรียนคุณ {{contact.firstName}}" });
  const enroll = async (contactId: string, flags: Any, dealId?: string) => {
    const s = await SEQ.createSequence(c.ctx, owner, { name: `ลำดับ ${TAG} ${++n}`, stopOnReply: true, businessDaysOnly: false, sendWindow: null, ...flags, steps: [EMAIL("หนึ่ง"), EMAIL("สอง")] });
    const seqId = (s?.id ?? s?.sequence?.id) as string;
    await SEQ.enroll(c.ctx, owner, { sequenceId: seqId, contactId, ...(dealId ? { dealId } : {}) });
    return (await P.crmSequenceEnrollment.findFirst({ where: { sequenceId: seqId, contactId }, select: { id: true } })).id as string;
  };
  const enr = (id: string) => P.crmSequenceEnrollment.findUnique({ where: { id }, select: { status: true, stepIndex: true, stoppedReason: true, nextAt: true, stats: true } });
  const runDue = (at: Date, sender: Any) => SEQ.runDue(at, { deps: { email: sender, line: sender, sms: sender }, tenantIds: [T], systemIds: [c.S] });
  const audits = (id: string) => P.auditLog.findMany({ where: { tenantId: T, action: "crm.sequence.auto_stop", targetId: id }, select: { after: true } });
  const finished = (id: string) => P.outboxEvent.findMany({ where: { tenantId: T, type: "crm.sequence.finished", idempotencyKey: { contains: id } }, select: { payload: true } });

  // P1 · LOST at send time (deal row flipped directly — no crm.deal.lost event exists at all)
  {
    const k = await mkContact("แพ้");
    const d = await mkDeal(k.id);
    const e = await enroll(k.id, { stopOnWon: true, stopOnLost: true }, d.id);
    await P.crmDeal.update({ where: { id: d.id }, data: { kind: "LOST", stageId: c.LOST, closedAt: new Date() } });
    const sent: string[] = [];
    await runDue(new Date(Date.now() + 1_000), async (r: Any) => { sent.push(r.channel); return { ok: true }; });
    const row = await enr(e); const au = await audits(e); const fin = await finished(e);
    chk("P1", "LOST deal + stopOnLost ⇒ 0 sends · STOPPED LOST · 1 auto_stop audit (LOST) · 1 finished event (LOST)",
      sent.length === 0 && row?.status === "STOPPED" && row?.stoppedReason === "LOST" && au.length === 1 && au[0]?.after?.reason === "LOST" && fin.length === 1 && fin[0]?.payload?.reason === "LOST",
      `sent=${sent.length} row=${j({ s: row?.status, r: row?.stoppedReason, step: row?.stepIndex })} audits=${j(au.map((a: Any) => a.after?.reason))} finished=${j(fin.map((f: Any) => f.payload?.reason))}`);
  }
  // P2 · controls: flags off ⇒ the guard never stops
  {
    const kW = await mkContact("ชนะไม่หยุด"); const dW = await mkDeal(kW.id);
    const eW = await enroll(kW.id, { stopOnWon: false, stopOnLost: true }, dW.id);
    await P.crmDeal.update({ where: { id: dW.id }, data: { kind: "WON", stageId: c.WON, closedAt: new Date() } });
    const kL = await mkContact("แพ้ไม่หยุด"); const dL = await mkDeal(kL.id);
    const eL = await enroll(kL.id, { stopOnWon: true, stopOnLost: false }, dL.id);
    await P.crmDeal.update({ where: { id: dL.id }, data: { kind: "LOST", stageId: c.LOST, closedAt: new Date() } });
    const sent: string[] = [];
    await runDue(new Date(Date.now() + 1_000), async (r: Any) => { sent.push(r.contactId); return { ok: true }; });
    const rW = await enr(eW); const rL = await enr(eL);
    chk("P2", "controls: stopOnWon=false + WON deal and stopOnLost=false + LOST deal still send both steps (DONE)",
      sent.filter((x) => x === kW.id).length === 2 && sent.filter((x) => x === kL.id).length === 2 && rW?.status === "DONE" && rL?.status === "DONE",
      `sentW=${sent.filter((x) => x === kW.id).length} sentL=${sent.filter((x) => x === kL.id).length} W=${rW?.status} L=${rL?.status}`);
  }
  // P3 · bounded retry with growing backoff
  {
    const k = await mkContact("ส่งล้มตลอด");
    const e = await enroll(k.id, { stopOnWon: true, stopOnLost: true });
    const fail = async () => ({ ok: false, error: "ส่งอีเมลไม่สำเร็จ — ระบบจะลองขั้นนี้อีกครั้งในรอบถัดไป" });
    const trail: string[] = [];
    let at = Date.now() + 1_000;
    for (let i = 0; i < 7; i += 1) {
      await runDue(new Date(at), fail);
      const row = await enr(e);
      const gap = row?.nextAt ? Math.round((new Date(row.nextAt).getTime() - at) / 60_000) : null;
      trail.push(`${row?.status}/${row?.stepIndex}/+${gap}m`);
      if (row?.status !== "ACTIVE") break;
      at = new Date(row.nextAt).getTime() + 1_000;
    }
    const row = await enr(e); const au = await audits(e); const log = (row?.stats?.log ?? []) as Any[];
    chk("P3", "a step that fails every time stays on step 0 with backoff 15→30→60→120 min, then STOPPED FAILED after 5 attempts with exactly one auto_stop audit (FAILED)",
      row?.status === "STOPPED" && row?.stoppedReason === "FAILED" && row?.stepIndex === 0 && au.length === 1 && au[0]?.after?.reason === "FAILED" && log.filter((x) => x.outcome === "FAILED").length === 5 && trail.slice(0, 4).join(",") === "ACTIVE/0/+15m,ACTIVE/0/+30m,ACTIVE/0/+60m,ACTIVE/0/+120m",
      `trail=${trail.join(",")} final=${j({ s: row?.status, r: row?.stoppedReason, step: row?.stepIndex })} audits=${au.length} failedLog=${log.filter((x) => x.outcome === "FAILED").length}`);
  }
  // P4–P7 · Resend webhook replays
  process.env.RESEND_WEBHOOK_SECRET = SVIX_SECRET;
  const transport = async () => ({ ok: true, providerId: `${TAG}-prov-${randomBytes(4).toString("hex")}` });
  const sendOne = async (contactId: string) => {
    const r = await CRM.emails.sendEmail(c.ctx, owner, { contactId, subject: `ทักทาย ${TAG}`, bodyHtml: "<p>สวัสดี</p>" }, { transport });
    return P.crmEmailMessage.findUnique({ where: { id: r.emailId }, select: { id: true, providerId: true } });
  };
  const hook = async (type: string, data: Any, svixId: string) => {
    const body = JSON.stringify({ type, data });
    const ts = String(Math.floor(Date.now() / 1000));
    const key = Buffer.from(SVIX_SECRET.slice("whsec_".length), "base64");
    const sig = createHmac("sha256", key).update(`${svixId}.${ts}.${body}`).digest("base64");
    return CRM.emails.providerWebhook({ rawBody: body, headers: { "svix-id": svixId, "svix-timestamp": ts, "svix-signature": `v1,${sig}` } });
  };
  const withdrawals = (contactId: string) => P.crmContactConsent.count({ where: { tenantId: T, contactId, channel: "EMAIL", granted: false } });
  const crashState = async (kind: "COMPLAINT" | "BOUNCE", emailId: string, contactId: string, svixId: string, at = new Date()) => {
    await P.crmEmailEvent.create({ data: { tenantId: T, emailId, kind, providerEventId: svixId, at } });
    await P.crmContact.update({ where: { id: contactId }, data: kind === "COMPLAINT" ? { emailOptOut: true } : { emailBouncedAt: at } });
  };
  {
    const k = await mkContact("ให้ใหม่"); const m = await sendOne(k.id); const e = await enroll(k.id, { stopOnWon: true, stopOnLost: true });
    const sv = `msg_${TAG}_p4`;
    await crashState("COMPLAINT", m.id, k.id, sv, new Date(Date.now() - 60_000));
    await P.crmContactConsent.create({ data: { tenantId: T, systemId: c.S, contactId: k.id, channel: "EMAIL", granted: true, source: "STAFF", createdAt: new Date() } }); // re-granted AFTER the complaint
    const r = await hook("email.complained", { email_id: m.providerId }, sv);
    const row = await enr(e);
    chk("P4", "complaint replay after a newer re-grant writes NO withdrawal row (the newer consent wins)",
      r.status === 200 && (await withdrawals(k.id)) === 0, `webhook=${j(r)} withdrawals=${await withdrawals(k.id)} enrollment=${row?.status}/${row?.stoppedReason}`);
  }
  {
    const k = await mkContact("ล้างธง"); const m = await sendOne(k.id); const e = await enroll(k.id, { stopOnWon: true, stopOnLost: true });
    const sv = `msg_${TAG}_p5`;
    await crashState("COMPLAINT", m.id, k.id, sv);
    await P.crmContact.update({ where: { id: k.id }, data: { emailOptOut: false } }); // flag cleared since
    const r = await hook("email.complained", { email_id: m.providerId }, sv);
    const row = await enr(e);
    chk("P5", "complaint replay after the opt-out flag was cleared touches nothing (0 rows · enrollment ACTIVE)",
      r.status === 200 && (await withdrawals(k.id)) === 0 && row?.status === "ACTIVE", `webhook=${j(r)} withdrawals=${await withdrawals(k.id)} enrollment=${row?.status}`);
  }
  {
    const k = await mkContact("ซ้ำสองครั้ง"); const m = await sendOne(k.id); const e = await enroll(k.id, { stopOnWon: true, stopOnLost: true });
    const sv = `msg_${TAG}_p6`;
    await crashState("COMPLAINT", m.id, k.id, sv);
    const r1 = await hook("email.complained", { email_id: m.providerId }, sv);
    const r2 = await hook("email.complained", { email_id: m.providerId }, sv);
    const row = await enr(e);
    const au = await P.auditLog.count({ where: { tenantId: T, action: "crm.email.complained", targetId: m.id } });
    chk("P6", "two replays on the crash state ⇒ exactly ONE withdrawal row, enrollment STOPPED OPT_OUT, one repair audit",
      r1.status === 200 && r2.status === 200 && (await withdrawals(k.id)) === 1 && row?.status === "STOPPED" && row?.stoppedReason === "OPT_OUT" && au === 1,
      `r1=${j(r1)} r2=${j(r2)} withdrawals=${await withdrawals(k.id)} enrollment=${row?.status}/${row?.stoppedReason} audits=${au}`);
  }
  {
    const k = await mkContact("เด้ง"); const m = await sendOne(k.id); const e = await enroll(k.id, { stopOnWon: true, stopOnLost: true });
    const sv = `msg_${TAG}_p7`;
    await crashState("BOUNCE", m.id, k.id, sv);
    const r = await hook("email.bounced", { email_id: m.providerId, bounce: { type: "Permanent" } }, sv);
    const row = await enr(e);
    chk("P7", "bounce replay on the crash state stops the running sequence (STOPPED BOUNCE)",
      r.status === 200 && row?.status === "STOPPED" && row?.stoppedReason === "BOUNCE", `webhook=${j(r)} enrollment=${row?.status}/${row?.stoppedReason}`);
  }
  // P8 · hourly least-recently-run order
  {
    const MJ = (await import("@/lib/platform/minute-jobs" as string)) as Any;
    const reg = (globalThis as Any)[Symbol.for("shark.platform.minute-jobs.registry")] as Map<string, unknown>;
    const saved = new Map(reg);
    const order: string[] = [];
    const now = new Date();
    // job A ran in the PREVIOUS hourly window; job B never ran ⇒ both due, B first although registered second
    await P.opsAlertState.create({ data: { source: `minute-job:run:${JOBS[0]}`, lastAlertAt: new Date(now.getTime() - 3_600_000) } });
    reg.clear();
    try {
      MJ.registerMinuteJob({ name: JOBS[0], everyMinutes: 60, cadence: "hourly", run: async () => { order.push("A"); } });
      MJ.registerMinuteJob({ name: JOBS[1], everyMinutes: 60, cadence: "hourly", run: async () => { order.push("B"); } });
      const r = await MJ.runMinuteJobs(now, { cadence: "hourly", entry: "vps" });
      chk("P8", "hourly: the never-run job B (registered second) runs before job A that ran last window · both ok",
        order.join("") === "BA" && r.results.every((x: Any) => x.outcome === "ok"), `order=${order.join("")} results=${j(r.results.map((x: Any) => x.outcome))}`);
    } finally {
      reg.clear();
      for (const [k2, v] of saved) reg.set(k2, v);
    }
  }
  // P9 · v1 system: REST write refused ⇒ no wake (this tenant's PENDING marker event stays PENDING)
  {
    const v1 = await mkCrm({ uiVersion: 1 });
    const AK = (await import("@/lib/api-keys/service" as string)) as Any;
    const SC = (await import("@/lib/api-keys/scopes" as string)) as Any;
    const ROUTE = (await import("@/app/api/v1/crm/[...path]/route" as string)) as Any;
    const key = await AK.createApiKey({ tenantId: T }, `${TAG} v1`, { scopes: [...((SC.API_SCOPE_BUNDLES as Any[]).find((x) => x.id === "crm.operate")?.scopes ?? [])], systemId: v1.S, createdById: u.id });
    const marker = await P.outboxEvent.create({ data: { tenantId: T, systemId: v1.S, type: "crm.contact.updated", payload: { contactId: "none" }, idempotencyKey: `${TAG}-marker` } });
    const res: Response = await ROUTE.POST(new Request("http://qc.invalid/api/v1/crm/contacts", { method: "POST", headers: { authorization: `Bearer ${key.rawKey}`, "content-type": "application/json", "idempotency-key": `${TAG}-v1`, "x-forwarded-for": "203.0.113.154" }, body: JSON.stringify({ name: `v1 ${TAG}` }) }), { params: Promise.resolve({ path: ["contacts"] }) });
    await new Promise((r) => setTimeout(r, 3_000));
    const mk = await P.outboxEvent.findUnique({ where: { id: marker.id }, select: { status: true } });
    await P.apiKey.delete({ where: { id: key.id } }).catch(() => undefined);
    chk("P9", "uiVersion-1 system: REST write refused (≥ 400) and no drain woken (marker event still PENDING)",
      res.status >= 400 && mk?.status === "PENDING", `status=${res.status} marker=${mk?.status}`);
  }
} catch (e) {
  chk("FATAL", "probe ran to the end", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  if (OLD_SVIX === undefined) delete process.env.RESEND_WEBHOOK_SECRET; else process.env.RESEND_WEBHOOK_SECRET = OLD_SVIX;
  await new Promise((r) => setTimeout(r, 1_500));
  for (const nm of JOBS) await P.opsAlertState.deleteMany({ where: { source: { contains: nm } } }).catch(() => undefined);
  if (T) {
    await P.apiKey.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.opsEvent.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    const left: string[] = [];
    for (const t of tables) { const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[]; if (Number(r?.[0]?.n ?? 0) > 0) left.push(`${t}=${r[0].n}`); }
    for (const uid of USERS) { await P.session.deleteMany({ where: { userId: uid } }).catch(() => undefined); await P.appNotification.deleteMany({ where: { recipientUserId: uid } }).catch(() => undefined); await P.membership.deleteMany({ where: { userId: uid } }).catch(() => undefined); await P.user.delete({ where: { id: uid } }).catch(() => undefined); }
    const jobs = await P.opsAlertState.count({ where: { OR: JOBS.map((nm) => ({ source: { contains: nm } })) } });
    chk("CLEAN", "throwaway tenant, users and fake job-state rows removed", left.length === 0 && (await P.tenant.count({ where: { id: T } })) === 0 && jobs === 0, `${left.join(" · ") || "-"} jobs=${jobs}`);
  }
  await prisma.$disconnect();
}
const passed = cks.filter((c) => c.ok).length;
console.log(`\n${passed === cks.length ? "🟢" : "🔴"} probe-c54d: ${passed}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, findings: cks.filter((c) => !c.ok).map((c) => ({ id: c.id })) })}`);
process.exit(passed === cks.length ? 0 : 1);
