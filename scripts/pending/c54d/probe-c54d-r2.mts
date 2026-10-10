// C5.4-D round 2 probe — reviewer S1–S4 + N1/N2/N3/N9/N10 (controller rulings 30 Sep)
//   S1a/S1b enrollment made AFTER the deal was already WON / LOST ⇒ steps still send (after-sale / win-back)
//   S2a     LOST deal (closed after enrollment) hard-deleted, bridges OFF ⇒ the deal's enrollment is STOPPED LOST, 0 sends
//   S2b     control: OPEN deal deleted ⇒ enrollment keeps sending (contact is still a live lead — controller ruling)
//   N1a     real send path, Resend answers 422 (permanent) ⇒ pre-batch behaviour: step logged FAILED and the sequence advances
//   N1b     real send path, 503 → network error → 200 ⇒ one CrmEmailMessage row for the step and ONE Idempotency-Key on all 3 calls
//   S4      complaint replay fired twice CONCURRENTLY ×10 contacts ⇒ per contact exactly 1 withdrawal row, 1 consent event, 1 consent audit
//   N2      complaint replay stops only enrollments created at/before the complaint (a later re-enrollment keeps running)
//   N3      complaint replay whose consent read hits a coded NOT_FOUND (archived contact) answers 200, not 500 (no Svix retry storm)
//   S3      a real v2 server action that calls revalidateAndWake 5× schedules exactly ONE after() drain
//   N9a/b   the after() task of scheduleDrain (core) and of wakeOutbox RETURNS the drain promise (waitUntil covers it)
//   N10     guard vs crm.deal.won consumer race ×10 ⇒ each enrollment: STOPPED WON, exactly 1 crm.sequence.finished, 1 auto_stop audit, 0 sends
// Run (QC3): bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c54d/probe-c54d-r2.mts
// Throwaway tenant `qc-c54d2-<rand>` · outbox candidate query narrowed to it for the whole run · network = stub · CLEAN at the end
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHmac, randomBytes } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

// QC env first (same loader as qc-crm-c5.3) — `@/lib/env` parses process.env at import
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
// the real Resend path needs a key (else core/email answers the dev fallback) — a dummy one: fetch is stubbed, nothing leaves the box
if (!process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = "re_qc_probe_dummy_key";
type Call = { key: string | null; status: number | "throw" };
const FETCH_LOG: Call[] = [];
let RESEND_SCRIPT: (number | "throw")[] = [];
globalThis.fetch = (async (url: Any, init: Any) => {
  if (String(url).startsWith("https://api.resend.com/")) {
    const next = RESEND_SCRIPT.length ? RESEND_SCRIPT.shift()! : 200;
    const hdr = (init?.headers ?? {}) as Record<string, string>;
    FETCH_LOG.push({ key: hdr["Idempotency-Key"] ?? null, status: next });
    if (next === "throw") throw new TypeError("fetch failed (probe)");
    return new Response(JSON.stringify(next === 200 ? { id: `re_${randomBytes(6).toString("hex")}` } : { message: "probe" }), { status: next, headers: { "content-type": "application/json" } });
  }
  throw new Error("probe: network blocked");
}) as typeof fetch;

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
/** Next request scope (technique of qc-crm-c5.3) — `after()` tasks are CAPTURED (not run) so the probe can count and run them */
async function inScope<T>(cookie: string, pathname: string, tasks: Any[], fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-c54d-r2", "x-forwarded-for": "203.0.113.155" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const afterContext = { after: (task: Any) => { tasks.push(task); } };
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [], afterContext };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-c54d2-${rand}`;
const SVIX_SECRET = `whsec_${Buffer.from(randomBytes(24)).toString("base64")}`;
const OLD_SVIX = process.env.RESEND_WEBHOOK_SECRET;
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string) => {
  cks.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}\n        — ACTUAL ${actual}`);
};
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const sub = async (id: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { chk(id, "block ran", false, e instanceof Error ? `${e.name}: ${e.message} ${e.stack?.split("\n")[1] ?? ""}` : String(e)); } };
let T = "";
const USERS: string[] = [];

try {
  const ENV = (await import("@/lib/env" as string)) as Any;
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const coreHash = (await import("@/lib/core/hash" as string)) as Any;
  const SEQ = CRM.sequences;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  const OB = P.outboxEvent; const OB_FIND = OB.findMany;
  OB.findMany = (a: Any) => OB_FIND.call(OB, { ...(a ?? {}), where: { AND: [a?.where ?? {}, { tenantId: T }] } });
  const u = await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC ${TAG}` } });
  USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const token = coreHash.randomToken(32) as string;
  await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 86_400_000), expiresAt: new Date(Date.now() + 86_400_000) } });
  const cookie = `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${T}`;
  const owner = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  let n = 0;
  const mkCrm = async (crm: Record<string, unknown> = {}) => {
    const S = (await sysSvc.createSystem(T, "CRM", `${TAG} ${++n}`)).id as string;
    await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`, JSON.stringify({ uiVersion: 2, bridgesEnabled: true, ...crm }), S);
    const p = await P.crmPipeline.create({ data: { tenantId: T, systemId: S, name: `ขาย ${TAG}`, isDefault: true, stages: { create: [["ใหม่", "OPEN", 20], ["ชนะ", "WON", 100], ["แพ้", "LOST", 0]].map(([name, kind, probability], i) => ({ tenantId: T, systemId: S, sortOrder: i, name, kind, probability })) } }, include: { stages: true } });
    const st = p.stages as Any[];
    return { S, ctx: { tenantId: T, systemId: S, actorUserId: u.id }, pipe: p.id as string, OPEN: st.find((x) => x.kind === "OPEN").id, WON: st.find((x) => x.kind === "WON").id, LOST: st.find((x) => x.kind === "LOST").id };
  };
  type Sys = Awaited<ReturnType<typeof mkCrm>>;
  const c = await mkCrm();
  const mkContact = async (sys: Sys, label: string) => {
    const party = await P.party.create({ data: { tenantId: T, name: `${label} ${TAG}`, kind: "PERSON" } });
    const k = await P.crmContact.create({ data: { tenantId: T, systemId: sys.S, name: `${label} ${TAG}`, firstName: label, partyId: party.id, ownerUserId: u.id, email: `${TAG}-${++n}@qc.invalid` } });
    await P.crmContactConsent.create({ data: { tenantId: T, systemId: sys.S, contactId: k.id, channel: "EMAIL", granted: true, source: "STAFF", createdAt: new Date(Date.now() - 300_000) } });
    return k;
  };
  const mkDeal = (sys: Sys, contactId: string) => P.crmDeal.create({ data: { tenantId: T, systemId: sys.S, contactId, pipelineId: sys.pipe, stageId: sys.OPEN, title: `ดีล ${TAG}`, valueSatang: 100_000, kind: "OPEN", ownerUserId: u.id, stageEnteredAt: new Date() } });
  const EMAIL = (subject: string) => ({ kind: "EMAIL", subject, body: "เรียนคุณ {{contact.firstName}}" });
  const enroll = async (sys: Sys, contactId: string, flags: Any, dealId?: string) => {
    const s = await SEQ.createSequence(sys.ctx, owner, { name: `ลำดับ ${TAG} ${++n}`, stopOnReply: true, businessDaysOnly: false, sendWindow: null, ...flags, steps: [EMAIL("หนึ่ง"), EMAIL("สอง")] });
    const seqId = (s?.id ?? s?.sequence?.id) as string;
    await SEQ.enroll(sys.ctx, owner, { sequenceId: seqId, contactId, ...(dealId ? { dealId } : {}) });
    return (await P.crmSequenceEnrollment.findFirst({ where: { sequenceId: seqId, contactId }, select: { id: true } })).id as string;
  };
  const enr = (id: string) => P.crmSequenceEnrollment.findUnique({ where: { id }, select: { status: true, stepIndex: true, stoppedReason: true, nextAt: true, stats: true, createdAt: true } });
  const recSender = (sent: string[]) => async (r: Any) => { sent.push(String(r.enrollmentId)); return { ok: true }; };
  const runDue = (sys: Sys, at: Date, sender?: Any) => SEQ.runDue(at, { ...(sender ? { deps: { email: sender, line: sender, sms: sender } } : {}), tenantIds: [T] });

  // ── S1 · enrollment made after the deal was already closed keeps running ──
  await sub("S1", async () => {
    const out: string[] = []; let bad = 0;
    for (const kind of ["WON", "LOST"] as const) {
      const k = await mkContact(c, `ปิดก่อน${kind}`);
      const d = await mkDeal(c, k.id);
      await P.crmDeal.update({ where: { id: d.id }, data: { kind, stageId: kind === "WON" ? c.WON : c.LOST, closedAt: new Date(Date.now() - 60_000), stageEnteredAt: new Date(Date.now() - 60_000) } });
      const e = await enroll(c, k.id, { stopOnWon: true, stopOnLost: true }, d.id);
      const sent: string[] = [];
      await runDue(c, new Date(Date.now() + 1_000), recSender(sent));
      const row = await enr(e);
      const mine = sent.filter((x) => x === e).length;
      if (!(mine === 2 && row?.status === "DONE")) bad += 1;
      out.push(`${kind}: sent=${mine} row=${row?.status}/${row?.stoppedReason}`);
    }
    chk("S1", "enrolled on a deal that was ALREADY WON / ALREADY LOST (stopOnWon/stopOnLost on) ⇒ both steps still send, DONE", bad === 0, out.join(" · "));
  });

  // ── S2 · deleteDeal of a LOST deal stops its enrollments (bridges OFF) · OPEN deal delete does not ──
  await sub("S2", async () => {
    const cOff = await mkCrm({ bridgesEnabled: false });
    const kL = await mkContact(cOff, "ลบแพ้"); const dL = await mkDeal(cOff, kL.id);
    const eL = await enroll(cOff, kL.id, { stopOnWon: true, stopOnLost: true }, dL.id);
    // WAIT-free sequence: make the step due later so the delete happens between close and the next send
    await P.crmSequenceEnrollment.update({ where: { id: eL }, data: { nextAt: new Date(Date.now() + 3_600_000) } });
    await P.crmDeal.update({ where: { id: dL.id }, data: { kind: "LOST", stageId: cOff.LOST, closedAt: new Date(Date.now() + 1_000), stageEnteredAt: new Date(Date.now() + 1_000) } });
    const kO = await mkContact(cOff, "ลบเปิด"); const dO = await mkDeal(cOff, kO.id);
    const eO = await enroll(cOff, kO.id, { stopOnWon: true, stopOnLost: true }, dO.id);
    await P.crmSequenceEnrollment.update({ where: { id: eO }, data: { nextAt: new Date(Date.now() + 3_600_000) } });
    const why = { confirm: true, reason: `ลบดีลทดสอบของ probe ${TAG}` };
    const r1 = await CRM.deals.deleteDeal(cOff.ctx, owner, dL.id, why).then(() => "ok", (e: Any) => `ERR ${e?.code} ${e?.message}`);
    const r2 = await CRM.deals.deleteDeal(cOff.ctx, owner, dO.id, why).then(() => "ok", (e: Any) => `ERR ${e?.code} ${e?.message}`);
    const sent: string[] = [];
    await runDue(cOff, new Date(Date.now() + 3_700_000), recSender(sent));
    const rL = await enr(eL); const rO = await enr(eO);
    chk("S2a", "LOST deal (closed after enrollment) deleted with bridges OFF ⇒ its enrollment STOPPED LOST and sends nothing",
      r1 === "ok" && sent.filter((x) => x === eL).length === 0 && rL?.status === "STOPPED" && rL?.stoppedReason === "LOST",
      `delete=${r1} sent=${sent.filter((x) => x === eL).length} row=${rL?.status}/${rL?.stoppedReason}`);
    chk("S2b", "control: OPEN deal deleted ⇒ enrollment keeps sending (live lead · controller ruling)",
      r2 === "ok" && sent.filter((x) => x === eO).length === 2 && rO?.status === "DONE",
      `delete=${r2} sent=${sent.filter((x) => x === eO).length} row=${rO?.status}/${rO?.stoppedReason}`);
  });

  // ── N1 · real send path (defaultSender → sendAsSystem → core Resend transport with the stubbed fetch) ──
  const stepRows = async (e: string) => {
    const row = await P.crmSequenceEnrollment.findUnique({ where: { id: e }, select: { sequenceId: true, sequenceVersion: true } });
    const step0 = await P.crmSequenceStep.findFirst({ where: { sequenceId: row.sequenceId, version: row.sequenceVersion, index: 0 }, select: { id: true } });
    return P.crmEmailMessage.findMany({ where: { tenantId: T, sequenceStepId: step0.id }, select: { status: true, messageId: true } });
  };
  await sub("N1a", async () => {
    const k = await mkContact(c, "ปฏิเสธถาวร");
    const e = await enroll(c, k.id, { stopOnWon: true, stopOnLost: true });
    FETCH_LOG.length = 0; RESEND_SCRIPT = [422, 422];
    await runDue(c, new Date(Date.now() + 1_000));
    const row = await enr(e);
    const log = ((row?.stats?.log ?? []) as Any[]).map((x) => `${x.index}:${x.outcome}`);
    chk("N1a", "Resend 422 (permanent) ⇒ pre-batch behaviour: step 0 logged FAILED and the sequence advances (no retry storm)",
      ENV.emailEnabled === true && FETCH_LOG.length >= 1 && row?.stepIndex !== 0 && log.includes("0:FAILED") && log.includes("1:FAILED"),
      `emailEnabled=${ENV.emailEnabled} calls=${j(FETCH_LOG.map((x) => x.status))} row=${row?.status}/step${row?.stepIndex} log=${j(log)}`);
    RESEND_SCRIPT = [];
  });
  await sub("N1b", async () => {
    const k = await mkContact(c, "ล้มชั่วคราว");
    const e = await enroll(c, k.id, { stopOnWon: true, stopOnLost: true });
    FETCH_LOG.length = 0; RESEND_SCRIPT = [503, "throw", 200, 200];
    let at = Date.now() + 1_000;
    const trail: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      await runDue(c, new Date(at));
      const row = await enr(e);
      trail.push(`${row?.status}/${row?.stepIndex}`);
      if (row?.status !== "ACTIVE" || !row?.nextAt) break;
      at = Math.max(at + 1_000, new Date(row.nextAt).getTime() + 1_000);
    }
    const rows = await stepRows(e);
    const first3 = FETCH_LOG.slice(0, 3);
    chk("N1b", "503 → network error → 200 on step 0 ⇒ all three provider calls carry ONE Idempotency-Key and the step has ONE CrmEmailMessage row (SENT)",
      ENV.emailEnabled === true && first3.length === 3 && !!first3[0]?.key && first3.every((x) => x.key === first3[0]!.key) && rows.length === 1 && rows[0]?.status === "SENT",
      `trail=${trail.join(",")} calls=${j(FETCH_LOG.map((x) => `${x.status}:…${String(x.key).slice(-14)}`))} step0Rows=${j(rows.map((r: Any) => r.status))}`);
    RESEND_SCRIPT = [];
  });

  // ── Resend webhook fixtures ──
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
  const crash = async (emailId: string, contactId: string, svixId: string, at: Date) => {
    await P.crmEmailEvent.create({ data: { tenantId: T, emailId, kind: "COMPLAINT", providerEventId: svixId, at } });
    await P.crmContact.update({ where: { id: contactId }, data: { emailOptOut: true } });
  };

  await sub("S4", async () => {
    const out: string[] = []; let bad = 0;
    for (let i = 0; i < 10; i += 1) {
      const k = await mkContact(c, `พร้อมกัน${i}`); const m = await sendOne(k.id);
      await enroll(c, k.id, { stopOnWon: true, stopOnLost: true });
      const sv = `msg_${TAG}_s4_${i}`;
      await crash(m.id, k.id, sv, new Date(Date.now() - 60_000));
      const rs = await Promise.all([hook("email.complained", { email_id: m.providerId }, sv), hook("email.complained", { email_id: m.providerId }, sv)]);
      const rows = await P.crmContactConsent.count({ where: { tenantId: T, contactId: k.id, channel: "EMAIL", granted: false } });
      const evs = ((await P.outboxEvent.findMany({ where: { tenantId: T, type: "crm.contact.updated" }, select: { payload: true } })) as Any[]).filter((x) => x.payload?.contactId === k.id && (x.payload?.changedKeys ?? []).includes("consent")).length;
      const aud = await P.auditLog.count({ where: { tenantId: T, action: "crm.contact.consent", targetId: k.id } });
      if (!(rows === 1 && evs === 1 && aud === 1 && rs.every((r: Any) => r.status === 200))) bad += 1;
      out.push(`${i}:${rows}/${evs}/${aud}/${rs.map((r: Any) => r.status).join("+")}`);
    }
    chk("S4", "two complaint replays fired concurrently, ×10 contacts ⇒ each: 1 withdrawal row / 1 consent event / 1 consent audit, both 200", bad === 0, `rows/events/audits/status ${out.join(" ")}`);
  });

  await sub("N2", async () => {
    const k = await mkContact(c, "ลงใหม่หลังแจ้ง"); const m = await sendOne(k.id);
    const eOld = await enroll(c, k.id, { stopOnWon: true, stopOnLost: true });
    await P.crmSequenceEnrollment.update({ where: { id: eOld }, data: { createdAt: new Date(Date.now() - 600_000) } });
    const sv = `msg_${TAG}_n2`;
    await crash(m.id, k.id, sv, new Date(Date.now() - 300_000));
    const eNew = await enroll(c, k.id, { stopOnWon: true, stopOnLost: true }); // created after the complaint (staff re-enrolled)
    const r = await hook("email.complained", { email_id: m.providerId }, sv);
    const a = await enr(eOld); const b = await enr(eNew);
    chk("N2", "replay stops only enrollments created at/before the complaint (older STOPPED OPT_OUT · newer stays ACTIVE)",
      r.status === 200 && a?.status === "STOPPED" && b?.status === "ACTIVE", `webhook=${j(r)} older=${a?.status}/${a?.stoppedReason} newer=${b?.status}/${b?.stoppedReason}`);
  });

  await sub("N3", async () => {
    const k = await mkContact(c, "เก็บแล้ว"); const m = await sendOne(k.id);
    const sv = `msg_${TAG}_n3`;
    await crash(m.id, k.id, sv, new Date(Date.now() - 60_000));
    // deterministic stand-in for "contact gone/invisible between the replay's lookup and the consent read": the contact now lives in
    //   another CRM system of the same tenant ⇒ the replay's tenant-scoped lookup finds it, consents.current(email's system) = NOT_FOUND
    const other = await mkCrm();
    await P.crmContact.update({ where: { id: k.id }, data: { systemId: other.S } });
    const probe = await CRM.consents.current(c.ctx, owner, k.id).then(() => "ok", (e: Any) => String(e?.code ?? e?.name));
    const r = await hook("email.complained", { email_id: m.providerId }, sv);
    chk("N3", "replay whose consent read throws a coded NOT_FOUND (contact no longer in this system) answers 200 (no Svix retry for days)",
      probe === "NOT_FOUND" && r.status === 200, `fixture consents.current=${probe} · webhook=${j(r)}`);
  });

  // ── S3 · one drain per action · N9 · after() task returns the drain promise ──
  await sub("S3", async () => {
    const ACT = (await import("@/app/app/sys/[id]/crm/activities/_components/actions" as string)) as Any;
    const k = await mkContact(c, "นับการปลุก");
    const tasks: Any[] = [];
    const r: Any = await inScope(cookie, `/app/sys/${c.S}/crm/activities`, tasks, () => ACT.logActivityAction(c.S, { type: "NOTE", title: `บันทึก ${TAG}`, contactId: k.id }));
    const src = ACT.logActivityAction.toString().length > 0;
    for (const t of tasks) await Promise.resolve(typeof t === "function" ? t() : t).catch(() => undefined);
    chk("S3", "logActivityAction (touch = 5× revalidateAndWake) schedules exactly ONE after() drain", r?.ok === true && src && tasks.length === 1, `action=${j(r?.ok ? "ok" : r)} afterTasks=${tasks.length}`);
  });
  await sub("N9", async () => {
    const OC = (await import("@/lib/outbox-consumers" as string)) as Any;
    const WK = (await import("@/lib/modules/crm/outbox-wake" as string)) as Any;
    const t1: Any[] = []; const t2: Any[] = [];
    // C5.4-D r3 (R2-N6): scheduleDrain and wakeOutbox share ONE coalescing point ⇒ run the first task before the second request
    //   (a wake while a drain is registered-but-not-started is coalesced on purpose — probe-c54d-r3 R2N6 pins that)
    const isP = (x: Any) => !!x && typeof x.then === "function";
    await inScope(cookie, "/x", t1, async () => { OC.scheduleDrain(); });
    const r1 = t1[0] ? t1[0]() : null;
    await Promise.resolve(r1).catch(() => undefined);
    await inScope(cookie, "/y", t2, async () => { WK.wakeOutbox(); });
    const r2 = t2[0] ? t2[0]() : null;
    await Promise.resolve(r2).catch(() => undefined);
    chk("N9a", "scheduleDrain's after() task returns the drain promise (covered by waitUntil)", t1.length === 1 && isP(r1), `tasks=${t1.length} returnsPromise=${isP(r1)}`);
    chk("N9b", "wakeOutbox's after() task returns the drain promise", t2.length === 1 && isP(r2), `tasks=${t2.length} returnsPromise=${isP(r2)}`);
  });

  // ── N10 · guard vs crm.deal.won consumer race ×10 ──
  await sub("N10", async () => {
    const BR = (await import("@/lib/platform/crm-bridges/sequences" as string)) as Any;
    const ids: string[] = []; const deals: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const k = await mkContact(c, `แข่ง${i}`); const d = await mkDeal(c, k.id);
      ids.push(await enroll(c, k.id, { stopOnWon: true, stopOnLost: true }, d.id)); deals.push(d.id);
    }
    for (const d of deals) await CRM.deals.moveDeal(c.ctx, owner, d, { stageId: c.WON });
    const evs = ((await P.outboxEvent.findMany({ where: { tenantId: T, systemId: c.S, type: "crm.deal.won" }, select: { id: true, payload: true, systemId: true, unitId: true } })) as Any[]).filter((x) => deals.includes(x.payload?.dealId));
    const sent: string[] = [];
    await Promise.all([runDue(c, new Date(Date.now() + 1_000), recSender(sent)), ...evs.map((ev) => BR.onDealWonStopSequences({ id: ev.id, tenantId: T, type: "crm.deal.won", payload: ev.payload, systemId: ev.systemId, unitId: ev.unitId }))]);
    let bad = 0; const out: string[] = [];
    for (const e of ids) {
      const row = await enr(e);
      const fin = await P.outboxEvent.count({ where: { tenantId: T, type: "crm.sequence.finished", idempotencyKey: { contains: e } } });
      const au = await P.auditLog.count({ where: { tenantId: T, action: "crm.sequence.auto_stop", targetId: e } });
      if (!(row?.status === "STOPPED" && row?.stoppedReason === "WON" && fin === 1 && au === 1)) bad += 1;
      out.push(`${row?.stoppedReason}/${fin}/${au}`);
    }
    chk("N10", "guard and crm.deal.won consumer racing on 10 enrollments ⇒ each STOPPED WON with exactly 1 finished event and 1 audit, 0 sends",
      evs.length === 10 && bad === 0 && sent.filter((x) => ids.includes(x)).length === 0, `events=${evs.length} sends=${sent.filter((x) => ids.includes(x)).length} ${out.join(" ")}`);
  });
} catch (e) {
  chk("FATAL", "probe ran to the end", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  if (OLD_SVIX === undefined) delete process.env.RESEND_WEBHOOK_SECRET; else process.env.RESEND_WEBHOOK_SECRET = OLD_SVIX;
  await new Promise((r) => setTimeout(r, 2_000));
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
    chk("CLEAN", "throwaway tenant and users removed", left.length === 0 && (await P.tenant.count({ where: { id: T } })) === 0 && (await P.user.count({ where: { id: { in: USERS } } })) === 0, left.join(" · ") || "-");
  }
  await prisma.$disconnect();
}
const passed = cks.filter((x) => x.ok).length;
console.log(`\n${passed === cks.length ? "🟢" : "🔴"} probe-c54d-r2: ${passed}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, findings: cks.filter((x) => !x.ok).map((x) => ({ id: x.id })) })}`);
process.exit(passed === cks.length ? 0 : 1);
