// C5.4-D round 3 probe — re-review R2-S1..S3 + R2-N1b/N2/N3/N5/N6/N8 (controller rulings 30 Sep)
//   Provider stub behaves like Resend's idempotency: same key + same body ⇒ replay the original answer · same key + DIFFERENT body ⇒ 409 ·
//   script entries: 200 · "lost" (accepted, answer lost = network error AFTER acceptance) · "neterr" (not accepted) · any HTTP status (not stored)
// Run (QC3): bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c54d/probe-c54d-r3.mts
// Throwaway tenant `qc-c54d3-<rand>` · outbox candidate query narrowed to it · network = stub · CLEAN at the end
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash, createHmac, randomBytes } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
if (!process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = "re_qc_probe_dummy_key";

type Step = 200 | "lost" | "neterr" | number;
type Accepted = { key: string | null; id: string; html: string; body: string };
const STORE = new Map<string, { bodyHash: string; id: string }>();
const ACCEPTED: Accepted[] = [];
const CALLS: { key: string | null; answer: string }[] = [];
let SCRIPT: Step[] = [];
let DEFAULT_STEP: Step = 200;
globalThis.fetch = (async (url: Any, init: Any) => {
  if (!String(url).startsWith("https://api.resend.com/")) throw new Error("probe: network blocked");
  const hdr = (init?.headers ?? {}) as Record<string, string>;
  const key = hdr["Idempotency-Key"] ?? null;
  const body = String(init?.body ?? "");
  const bh = createHash("sha256").update(body).digest("hex");
  const res = (status: number, json: Any) => new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  if (key && STORE.has(key)) {
    const prev = STORE.get(key)!;
    if (prev.bodyHash === bh) { CALLS.push({ key, answer: "replay-200" }); return res(200, { id: prev.id }); }
    CALLS.push({ key, answer: "409" });
    return res(409, { name: "invalid_idempotent_request", message: "Same idempotency key used with a different request payload" });
  }
  const step = SCRIPT.length ? SCRIPT.shift()! : DEFAULT_STEP;
  CALLS.push({ key, answer: String(step) });
  if (step === 200 || step === "lost") {
    const id = `re_${randomBytes(6).toString("hex")}`;
    if (key) STORE.set(key, { bodyHash: bh, id });
    let html = ""; try { html = String(JSON.parse(body)?.html ?? ""); } catch { /* */ }
    ACCEPTED.push({ key, id, html, body });
    if (step === "lost") throw new TypeError("fetch failed (answer lost after acceptance)");
    return res(200, { id });
  }
  if (step === "neterr") throw new TypeError("fetch failed (probe)");
  return res(step, { message: "probe" });
}) as typeof fetch;
const accOf = (key: string | null | undefined) => ACCEPTED.filter((a) => !!key && a.key === key);

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
async function inScope<T>(cookie: string, pathname: string, tasks: Any[], fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-c54d-r3", "x-forwarded-for": "203.0.113.156" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const afterContext = { after: (task: Any) => { tasks.push(task); } };
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [], afterContext };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}
const runTasks = async (tasks: Any[]) => { for (const t of tasks.splice(0)) await Promise.resolve(typeof t === "function" ? t() : t).catch(() => undefined); };

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-c54d3-${rand}`;
const SVIX_SECRET = `whsec_${Buffer.from(randomBytes(24)).toString("base64")}`;
const OLD_SVIX = process.env.RESEND_WEBHOOK_SECRET;
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string) => {
  cks.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}\n        — ACTUAL ${actual}`);
};
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const sub = async (id: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { chk(id, "block ran", false, e instanceof Error ? `${e.name}: ${e.message} ${e.stack?.split("\n").slice(1, 3).join(" ") ?? ""}` : String(e)); } };
const HOUR = 3_600_000;
let T = "";
const USERS: string[] = [];

try {
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
    await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`, JSON.stringify({ uiVersion: 2, bridgesEnabled: true, email: { trackOpens: true, trackClicks: true }, ...crm }), S);
    const p = await P.crmPipeline.create({ data: { tenantId: T, systemId: S, name: `ขาย ${TAG}`, isDefault: true, stages: { create: [["ใหม่", "OPEN", 20], ["ชนะ", "WON", 100], ["ส่งมอบแล้ว", "WON", 100], ["แพ้", "LOST", 0], ["แพ้-ปิดแฟ้ม", "LOST", 0]].map(([name, kind, probability], i) => ({ tenantId: T, systemId: S, sortOrder: i, name, kind, probability })) } }, include: { stages: true } });
    const st = (p.stages as Any[]).sort((a, b) => a.sortOrder - b.sortOrder);
    return { S, ctx: { tenantId: T, systemId: S, actorUserId: u.id }, pipe: p.id as string, OPEN: st[0].id, WON: st[1].id, WON2: st[2].id, LOST: st[3].id, LOST2: st[4].id };
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
  const enroll = async (sys: Sys, contactId: string, dealId?: string) => {
    const s = await SEQ.createSequence(sys.ctx, owner, { name: `ลำดับ ${TAG} ${++n}`, stopOnReply: true, stopOnWon: true, stopOnLost: true, businessDaysOnly: false, sendWindow: null, steps: [EMAIL("หนึ่ง"), EMAIL("สอง")] });
    const seqId = (s?.id ?? s?.sequence?.id) as string;
    await SEQ.enroll(sys.ctx, owner, { sequenceId: seqId, contactId, ...(dealId ? { dealId } : {}) });
    return (await P.crmSequenceEnrollment.findFirst({ where: { sequenceId: seqId, contactId }, select: { id: true } })).id as string;
  };
  const enr = (id: string) => P.crmSequenceEnrollment.findUnique({ where: { id }, select: { status: true, stepIndex: true, stoppedReason: true, nextAt: true, stats: true, createdAt: true, sequenceVersion: true } });
  const logOf = (row: Any) => ((row?.stats?.log ?? []) as Any[]).map((x) => `${x.index}:${x.outcome}`);
  const attemptsOf = (row: Any) => j(row?.stats?.attempts ?? {});
  const hold = (id: string, ms = HOUR) => P.crmSequenceEnrollment.update({ where: { id }, data: { nextAt: new Date(Date.now() + ms) } });
  const recSender = (sent: string[]) => async (r: Any) => { sent.push(String(r.enrollmentId)); return { ok: true }; };
  const runDue = (at: Date, sender?: Any) => SEQ.runDue(at, { ...(sender ? { deps: { email: sender, line: sender, sms: sender } } : {}), tenantIds: [T] });
  const seqKey = (eid: string, v = 1, i = 0) => `seq:${eid}:v${v}:${i}`;
  const stepMails = async (eid: string, index = 0) => {
    const row = await P.crmSequenceEnrollment.findUnique({ where: { id: eid }, select: { sequenceId: true, sequenceVersion: true } });
    const st = await P.crmSequenceStep.findFirst({ where: { sequenceId: row.sequenceId, version: row.sequenceVersion, index }, select: { id: true } });
    return P.crmEmailMessage.findMany({ where: { tenantId: T, sequenceStepId: st.id }, select: { id: true, status: true, messageId: true, providerError: true, routing: true } });
  };
  // the Idempotency-Key a step's mail carries (= Message-ID of its row)
  const keysOfStep = async (eid: string) => (await stepMails(eid)).map((m: Any) => m.messageId as string);

  // ══════ R2-S1 · WON→WON / LOST→LOST keep the close date ══════
  await sub("R2S1a", async () => {
    const k = await mkContact(c, "หลังขาย");
    const d = await mkDeal(c, k.id);
    const m1 = await CRM.deals.moveDeal(c.ctx, owner, d.id, { stageId: c.WON }).then(() => "ok", (e: Any) => `ERR ${e?.code} ${e?.message}`);
    const won1 = await P.crmDeal.findUnique({ where: { id: d.id }, select: { closedAt: true, stageEnteredAt: true } });
    await new Promise((r) => setTimeout(r, 1_100));
    const e = await enroll(c, k.id, d.id); // after-sale sequence, made after the win
    await hold(e);
    await new Promise((r) => setTimeout(r, 1_100));
    const m2 = await CRM.deals.moveDeal(c.ctx, owner, d.id, { stageId: c.WON2 }).then(() => "ok", (err: Any) => `ERR ${err?.code} ${err?.message}`);
    const won2 = await P.crmDeal.findUnique({ where: { id: d.id }, select: { closedAt: true, stageEnteredAt: true, kind: true } });
    const sent: string[] = [];
    await runDue(new Date(Date.now() + 2 * HOUR), recSender(sent));
    const row = await enr(e);
    chk("R2S1a", "enrolled after the WIN, then a WON→WON stage move ⇒ closedAt keeps the first win (stageEnteredAt moves) and the after-sale steps still send",
      m1 === "ok" && m2 === "ok" && won2?.kind === "WON" && won2?.closedAt?.getTime() === won1?.closedAt?.getTime() && won2?.stageEnteredAt?.getTime() > won1!.stageEnteredAt.getTime() && sent.filter((x) => x === e).length === 2 && row?.status === "DONE",
      `moves=${m1}/${m2} closedAt ${j(won1?.closedAt)}→${j(won2?.closedAt)} stageEnteredAt moved=${won2?.stageEnteredAt?.getTime() > (won1?.stageEnteredAt?.getTime() ?? 0)} sent=${sent.filter((x) => x === e).length} row=${row?.status}/${row?.stoppedReason}`);
  });
  await sub("R2S1b", async () => {
    const cOff = await mkCrm({ bridgesEnabled: false });
    const lr = await P.crmLostReason.create({ data: { tenantId: T, systemId: cOff.S, key: `price-${rand}`, label: "ราคา" } });
    const k = await mkContact(cOff, "แพ้สองขั้น");
    const d = await mkDeal(cOff, k.id);
    const e1 = await enroll(cOff, k.id, d.id); await hold(e1); // enrolled BEFORE the loss ⇒ must stop on delete
    await new Promise((r) => setTimeout(r, 1_100));
    const m1 = await CRM.deals.moveDeal(cOff.ctx, owner, d.id, { stageId: cOff.LOST, lostReasonId: lr.id, lostNote: `แพ้ ${TAG}` }).then(() => "ok", (err: Any) => `ERR ${err?.code} ${err?.message}`);
    await new Promise((r) => setTimeout(r, 1_100));
    const e2 = await enroll(cOff, k.id, d.id); await hold(e2); // win-back made AFTER the loss ⇒ must keep running
    await new Promise((r) => setTimeout(r, 1_100));
    const m2 = await CRM.deals.moveDeal(cOff.ctx, owner, d.id, { stageId: cOff.LOST2, lostReasonId: lr.id, lostNote: `ปิดแฟ้ม ${TAG}` }).then(() => "ok", (err: Any) => `ERR ${err?.code} ${err?.message}`);
    const del = await CRM.deals.deleteDeal(cOff.ctx, owner, d.id, { confirm: true, reason: `ลบดีลแพ้ของ probe ${TAG}` }).then(() => "ok", (err: Any) => `ERR ${err?.code} ${err?.message}`);
    const sent: string[] = [];
    await runDue(new Date(Date.now() + 2 * HOUR), recSender(sent));
    const r1 = await enr(e1); const r2 = await enr(e2);
    chk("R2S1b", "LOST→LOST move then delete (bridges off) ⇒ the enrollment made before the loss STOPPED LOST · the win-back made after the loss keeps sending",
      m1 === "ok" && m2 === "ok" && del === "ok" && r1?.status === "STOPPED" && r1?.stoppedReason === "LOST" && sent.filter((x) => x === e2).length === 2 && r2?.status === "DONE",
      `moves=${m1}/${m2} delete=${del} before=${r1?.status}/${r1?.stoppedReason} after=${r2?.status}/${r2?.stoppedReason} sentAfter=${sent.filter((x) => x === e2).length}`);
  });

  // ══════ R2-S2 · redelivery answered 409 by the provider = the earlier attempt was accepted ══════
  const trackResolves = async (emailId: string, contactId: string, html: string) => {
    const open = /\/t\/o\/([^".]+)\.gif/.exec(html)?.[1] ?? "";
    const click = /\/t\/c\/([^"]+)"/.exec(html)?.[1] ?? "";
    const unsub = /\/u\/([^"/]+)"/.exec(html)?.[1] ?? "";
    await new Promise((r) => setTimeout(r, 2_600)); // opens count only once the mail is ≥ OPEN_MIN_AGE_MS old (bot pre-fetch guard)
    await CRM.emails.trackOpen(open, { ip: "203.0.113.157", ua: "Mozilla/5.0 (Windows NT 10.0) probe" });
    const clicked = click ? await CRM.emails.trackClick(click, { ip: "203.0.113.157", ua: "Mozilla/5.0 probe" }) : { url: null };
    const opens = await P.crmEmailEvent.count({ where: { emailId, kind: "OPEN" } });
    await CRM.emails.unsubscribe(unsub, { ip: "203.0.113.157" }).catch(() => undefined);
    const k = await P.crmContact.findUnique({ where: { id: contactId }, select: { emailOptOut: true } });
    return { tokens: `${!!open}/${!!click}/${!!unsub}`, opens, clickUrl: clicked?.url ?? null, optOut: k?.emailOptOut === true };
  };
  const sysSend = (k: Any, key: string) => CRM.emails.sendAsSystem({ tenantId: T, systemId: c.S }, { contactId: k.id, to: [k.email], subject: `ติดตาม ${TAG}`, bodyHtml: `<p>ดูรายละเอียด <a href="https://example.com/r3">ที่นี่</a></p>`, idempotencyKey: key, redeliverFailed: true });
  await sub("R2S2a", async () => {
    const k = await mkContact(c, "รับแล้วคำตอบหาย");
    const key = `probe:${TAG}:s2a`;
    SCRIPT = ["lost"];
    const a1 = await sysSend(k, key);
    const a2 = await sysSend(k, key);
    const row = await P.crmEmailMessage.findUnique({ where: { id: a2.emailId }, select: { status: true, providerError: true, providerId: true, routing: true } });
    const accepted = ACCEPTED.filter((x) => x.key === a1.messageId); // Idempotency-Key = the row's Message-ID
    const res = accepted[0] ? await trackResolves(a2.emailId, k.id, accepted[0].html) : null;
    chk("R2S2a", "attempt 1 accepted but its answer lost, redelivery answered 409 ⇒ exactly ONE mail accepted, row SENT with the 'delivery unconfirmed' marker, and the open/click/unsubscribe links of THAT mail resolve",
      a1.status === "FAILED" && a2.status === "SENT" && row?.status === "SENT" && /UNCONFIRMED/i.test(String(row?.providerError ?? "")) && accepted.length === 1 && res?.opens === 1 && res?.clickUrl === "https://example.com/r3" && res?.optOut === true,
      `a1=${a1.status} a2=${a2.status}${a2.reused ? "(reused)" : ""} row=${row?.status}/${row?.providerError}/${row?.providerId} accepted=${accepted.length} calls=${j(CALLS.filter((x) => x.key === a1.messageId).map((x) => x.answer))} resolve=${j(res)}`);
  });
  await sub("R2S2b", async () => {
    const k = await mkContact(c, "สามครั้ง");
    const key = `probe:${TAG}:s2b`;
    SCRIPT = [503];
    const a1 = await sysSend(k, key); // 503 — not accepted
    SCRIPT = ["lost"];
    const a2 = await sysSend(k, key); // redelivery accepted, answer lost
    const a3 = await sysSend(k, key); // redelivery ⇒ 409
    const row = await P.crmEmailMessage.findUnique({ where: { id: a3.emailId }, select: { status: true, providerError: true } });
    const accepted = ACCEPTED.filter((x) => x.key === a1.messageId);
    const res = accepted[0] ? await trackResolves(a3.emailId, k.id, accepted[0].html) : null;
    chk("R2S2b", "503 → accepted-but-lost → 409 ⇒ one mail, row SENT unconfirmed, the links of the ACCEPTED (2nd) body resolve (its hashes were persisted before its provider call and not overwritten by the 409 path)",
      a1.status === "FAILED" && a2.status === "FAILED" && a3.status === "SENT" && row?.status === "SENT" && accepted.length === 1 && res?.opens === 1 && res?.clickUrl === "https://example.com/r3" && res?.optOut === true,
      `a=${a1.status}/${a2.status}/${a3.status} row=${row?.status}/${row?.providerError} accepted=${accepted.length} calls=${j(CALLS.filter((x) => x.key === a1.messageId).map((x) => x.answer))} resolve=${j(res)}`);
  });
  await sub("R2S2c", async () => {
    const k = await mkContact(c, "ขั้นรับแล้วคำตอบหาย");
    const e = await enroll(c, k.id);
    SCRIPT = ["lost"];
    let at = Date.now() + 1_000;
    await runDue(new Date(at));
    const r1 = await enr(e);
    at = Math.max(at + 1_000, new Date(r1.nextAt).getTime() + 1_000);
    SCRIPT = [200]; // step 2 (new key) accepted normally
    await runDue(new Date(at));
    const r2 = await enr(e);
    const keys = await keysOfStep(e);
    chk("R2S2c", "sequence step: attempt 1 accepted-but-lost ⇒ the redelivery's 409 counts as sent: step advances (DONE), 1 mail for step 0, attempt counter stays at the first failure only",
      r1?.stepIndex === 0 && r2?.status === "DONE" && keys.length === 1 && accOf(keys[0]).length === 1 && r2?.stats?.attempts?.["v1:0"] === 1,
      `after1=${r1?.status}/step${r1?.stepIndex} after2=${r2?.status}/step${r2?.stepIndex} log=${j(logOf(r2))} attempts=${attemptsOf(r2)} step0Rows=${keys.length} accepted=${keys[0] ? accOf(keys[0]).length : 0}`);
  });

  // ══════ R2-S3 · outage class (401/403/429) keeps retrying, not counted, 72 h ceiling · message-specific 4xx = permanent ══════
  await sub("R2S3a", async () => {
    const k = await mkContact(c, "คีย์หลุด");
    const e = await enroll(c, k.id);
    DEFAULT_STEP = 401;
    const start = Date.now() + 1_000;
    let at = start; let runs = 0; let maxGap = 0; let stoppedAt = 0;
    for (; runs < 80; runs += 1) {
      await runDue(new Date(at));
      const row = await enr(e);
      if (row?.status !== "ACTIVE") { stoppedAt = at; break; }
      const next = new Date(row.nextAt).getTime();
      maxGap = Math.max(maxGap, next - at);
      at = next + 1_000;
    }
    DEFAULT_STEP = 200;
    const row = await enr(e);
    const au = await P.auditLog.count({ where: { tenantId: T, action: "crm.sequence.auto_stop", targetId: e } });
    const hrs = (stoppedAt - start) / HOUR;
    chk("R2S3a", "Resend 401 (shop-side outage) ⇒ step 0 keeps retrying far beyond 5 attempts at a capped backoff (≤ 2 h) and is STOPPED FAILED only once 72 h have passed since its first failure (one audit)",
      row?.status === "STOPPED" && row?.stoppedReason === "FAILED" && row?.stepIndex === 0 && runs > 5 && hrs >= 72 && hrs < 75 && maxGap <= 2 * HOUR + 1_000 && au === 1,
      `runs=${runs} stoppedAfter=${hrs.toFixed(1)}h maxGap=${(maxGap / 60_000).toFixed(0)}min row=${row?.status}/${row?.stoppedReason}/step${row?.stepIndex} audits=${au} attempts=${attemptsOf(row)}`);
  });
  await sub("R2S3b", async () => {
    const out: string[] = []; let bad = 0;
    for (const code of [429, 403]) {
      const k = await mkContact(c, `ช่วงล่ม${code}`);
      const e = await enroll(c, k.id);
      DEFAULT_STEP = code;
      let at = Date.now() + 1_000;
      for (let i = 0; i < 7; i += 1) { await runDue(new Date(at)); const row = await enr(e); if (row?.status !== "ACTIVE") break; at = new Date(row.nextAt).getTime() + 1_000; }
      DEFAULT_STEP = 200;
      const row = await enr(e);
      if (!(row?.status === "ACTIVE" && row?.stepIndex === 0)) bad += 1;
      out.push(`${code}: ${row?.status}/step${row?.stepIndex} attempts=${attemptsOf(row)}`);
      await P.crmSequenceEnrollment.update({ where: { id: e }, data: { status: "STOPPED", stoppedReason: "MANUAL", nextAt: null } });
    }
    chk("R2S3b", "429 and 403 behave like 401: after 7 failed runs the enrollment is still ACTIVE on step 0 (not stopped by the 5-attempt rule)", bad === 0, out.join(" · "));
  });
  await sub("R2S3c", async () => {
    const out: string[] = []; let bad = 0;
    for (const code of [404, 400]) {
      const k = await mkContact(c, `ปฏิเสธ${code}`);
      const e = await enroll(c, k.id);
      DEFAULT_STEP = code;
      await runDue(new Date(Date.now() + 1_000));
      DEFAULT_STEP = 200;
      const row = await enr(e);
      if (!(row?.status === "DONE" && logOf(row).join(",") === "0:FAILED,1:FAILED")) bad += 1;
      out.push(`${code}: ${row?.status}/step${row?.stepIndex} log=${j(logOf(row))}`);
    }
    chk("R2S3c", "message-specific 404 / 400 stay permanent: logged FAILED and the sequence advances (pre-batch behaviour)", bad === 0, out.join(" · "));
  });

  // ══════ R2-N2 · system keys and REST/staff keys live in separate namespaces ══════
  await sub("R2N2", async () => {
    // (a) staff/REST first with the step's key, then the step
    const kA = await mkContact(c, "คีย์ชนก");
    const eA = await enroll(c, kA.id); await hold(eA);
    const staffA = await CRM.emails.sendEmail(c.ctx, owner, { contactId: kA.id, subject: `พนักงาน ${TAG}`, bodyHtml: "<p>จากพนักงาน</p>", idempotencyKey: seqKey(eA) });
    await P.crmSequenceEnrollment.update({ where: { id: eA }, data: { nextAt: new Date(Date.now() - 1_000) } });
    await runDue(new Date(Date.now() + 1_000));
    const stepA = await stepMails(eA);
    // (b) step first, then staff/REST with the same string
    const kB = await mkContact(c, "คีย์ชนข");
    const eB = await enroll(c, kB.id);
    await runDue(new Date(Date.now() + 1_000));
    const stepB = await stepMails(eB);
    const staffB = await CRM.emails.sendEmail(c.ctx, owner, { contactId: kB.id, subject: `พนักงาน ${TAG}`, bodyHtml: "<p>จากพนักงาน</p>", idempotencyKey: seqKey(eB) });
    chk("R2N2", "a staff/REST Idempotency-Key equal to a step key (\"seq:<enrollment>:v1:0\") neither pre-occupies the step's mail nor is answered with it — both directions produce two different messages",
      stepA.length === 1 && stepA[0]?.status === "SENT" && stepA[0]?.id !== staffA.emailId && stepB.length === 1 && staffB.emailId !== stepB[0]?.id && staffB.reused !== true,
      `a: staff=${staffA.emailId?.slice(0, 8)} step=${stepA.map((m: Any) => `${m.id.slice(0, 8)}:${m.status}`).join(",") || "none"} · b: step=${stepB.map((m: Any) => `${m.id.slice(0, 8)}:${m.status}`).join(",") || "none"} staff=${staffB.emailId?.slice(0, 8)}${staffB.reused ? "(REUSED)" : ""}`);
  });

  // ══════ R2-N3 · a QUEUED row left by a crashed send is in flight, not sent ══════
  await sub("R2N3", async () => {
    const k = await mkContact(c, "ค้างส่ง");
    const e = await enroll(c, k.id);
    SCRIPT = [503];
    let at = Date.now() + 1_000;
    await runDue(new Date(at));
    let row = await enr(e);
    const [m] = await stepMails(e);
    const lease = new Date(Date.now() + 2 * HOUR);
    await P.crmEmailMessage.update({ where: { id: m.id }, data: { status: "QUEUED", leaseUntil: lease } }); // a redelivery died mid-send
    at = Math.max(at + 1_000, new Date(row.nextAt).getTime() + 1_000);
    const callsBefore = CALLS.length;
    await runDue(new Date(at));
    const mid = await enr(e);
    const midCalls = CALLS.length - callsBefore;
    const reaped = await CRM.emails.runScheduled(new Date(lease.getTime() + 60_000), { tenantIds: [T] });
    const mRow = await P.crmEmailMessage.findUnique({ where: { id: m.id }, select: { status: true } });
    at = Math.max(lease.getTime() + 120_000, new Date(mid.nextAt ?? 0).getTime() + 1_000);
    SCRIPT = [200, 200];
    await runDue(new Date(at));
    row = await enr(e);
    const rows = await stepMails(e);
    chk("R2N3", "prior QUEUED (crashed in-flight send) ⇒ the step does NOT advance and makes no provider call · after the reaper marks it FAILED the step redelivers the same row and advances",
      mid?.stepIndex === 0 && mid?.status === "ACTIVE" && midCalls === 0 && new Date(mid.nextAt).getTime() >= lease.getTime() && mRow?.status === "FAILED" && row?.status === "DONE" && rows.length === 1 && rows[0]?.status === "SENT",
      `mid=${mid?.status}/step${mid?.stepIndex} midCalls=${midCalls} midNextAt≥lease=${new Date(mid?.nextAt ?? 0).getTime() >= lease.getTime()} attempts=${attemptsOf(mid)} reaper=${j(reaped?.failed)} rowAfterReap=${mRow?.status} final=${row?.status}/step${row?.stepIndex} step0Rows=${j(rows.map((r: Any) => r.status))}`);
  });

  // ══════ R2-N8d · opt-out between attempt 1 and the redelivery ⇒ no mail ══════
  await sub("R2N8d", async () => {
    const k = await mkContact(c, "ถอนระหว่างรอ");
    const e = await enroll(c, k.id);
    SCRIPT = [503];
    let at = Date.now() + 1_000;
    await runDue(new Date(at));
    const r1 = await enr(e);
    await P.crmContact.update({ where: { id: k.id }, data: { emailOptOut: true } });
    const before = ACCEPTED.length; const callsBefore = CALLS.length;
    at = Math.max(at + 1_000, new Date(r1.nextAt).getTime() + 1_000);
    await runDue(new Date(at));
    const r2 = await enr(e);
    chk("R2N8d", "the customer opts out between attempt 1 and the redelivery ⇒ no provider call, no mail, the step is skipped",
      r1?.stepIndex === 0 && CALLS.length - callsBefore === 0 && ACCEPTED.length === before && logOf(r2).includes("0:SKIPPED"),
      `r1=step${r1?.stepIndex} callsAfterOptOut=${CALLS.length - callsBefore} newMails=${ACCEPTED.length - before} log=${j(logOf(r2))} final=${r2?.status}`);
  });

  // ══════ R2-N6 / R2-N8c · one coalescing point for scheduleDrain (core) and wakeOutbox (CRM) ══════
  const OC = (await import("@/lib/outbox-consumers" as string)) as Any;
  const WK = (await import("@/lib/modules/crm/outbox-wake" as string)) as Any;
  await sub("R2N6", async () => {
    const t1: Any[] = []; const t2: Any[] = []; const t3: Any[] = [];
    await inScope(cookie, "/a", t1, async () => { OC.scheduleDrain(); WK.wakeOutbox(); OC.scheduleDrain(); });
    const inOne = t1.length;
    await runTasks(t1);
    await Promise.all([inScope(cookie, "/b", t2, async () => { OC.scheduleDrain(); }), inScope(cookie, "/c", t3, async () => { WK.wakeOutbox(); })]);
    const across = t2.length + t3.length;
    const ret = t2[0] ?? t3[0];
    const r = ret ? ret() : null;
    const isP = !!r && typeof r.then === "function";
    await Promise.resolve(r).catch(() => undefined);
    await runTasks(t2); await runTasks(t3);
    chk("R2N6", "scheduleDrain + wakeOutbox share ONE coalescing point: 3 calls in one request ⇒ 1 after() drain · two concurrent requests of different modules ⇒ 1 drain · the task still returns the drain promise",
      inOne === 1 && across === 1 && isP, `oneRequest=${inOne} twoRequests=${across} returnsPromise=${isP}`);
  });
  await sub("R2N8c", async () => {
    const ACT = (await import("@/app/app/sys/[id]/crm/activities/_components/actions" as string)) as Any;
    const k1 = await mkContact(c, "สองคำขอ1"); const k2 = await mkContact(c, "สองคำขอ2");
    const since = new Date();
    const t1: Any[] = []; const t2: Any[] = [];
    const [r1, r2] = (await Promise.all([
      inScope(cookie, `/app/sys/${c.S}/crm/activities`, t1, () => ACT.logActivityAction(c.S, { type: "NOTE", title: `หนึ่ง ${TAG}`, contactId: k1.id })),
      inScope(cookie, `/app/sys/${c.S}/crm/activities`, t2, () => ACT.logActivityAction(c.S, { type: "NOTE", title: `สอง ${TAG}`, contactId: k2.id })),
    ])) as Any[];
    const pending = (await P.outboxEvent.findMany({ where: { tenantId: T, createdAt: { gte: since }, status: "PENDING" }, select: { id: true, type: true } })) as Any[];
    const tasks = t1.length + t2.length;
    await runTasks(t1); await runTasks(t2);
    const still = pending.length ? await P.outboxEvent.count({ where: { id: { in: pending.map((p) => p.id) }, status: "PENDING", attempts: 0 } }) : -1;
    chk("R2N8c", "two concurrent v2 actions (5 wakes each) ⇒ ONE drain scheduled in total, and that drain processes the events of BOTH requests",
      r1?.ok === true && r2?.ok === true && tasks === 1 && pending.length >= 2 && still === 0, `actions=${r1?.ok}/${r2?.ok} afterTasks=${tasks} pendingBefore=${pending.length} (${[...new Set(pending.map((p) => p.type))].join(",")}) untouchedAfter=${still}`);
  });

  // ══════ R2-N8a/b · guard vs consumer race, forced with a barrier (both directions) ══════
  const BR = (await import("@/lib/platform/crm-bridges/sequences" as string)) as Any;
  const raceFixture = async (label: string) => {
    const ids: string[] = []; const deals: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const k = await mkContact(c, `${label}${i}`); const d = await mkDeal(c, k.id);
      ids.push(await enroll(c, k.id, d.id)); deals.push(d.id);
    }
    for (const d of deals) await CRM.deals.moveDeal(c.ctx, owner, d, { stageId: c.WON });
    const evs = ((await P.outboxEvent.findMany({ where: { tenantId: T, systemId: c.S, type: "crm.deal.won" }, select: { id: true, payload: true, systemId: true, unitId: true } })) as Any[]).filter((x) => deals.includes(x.payload?.dealId));
    return { ids, deals, evs };
  };
  const consume = (ev: Any) => BR.onDealWonStopSequences({ id: ev.id, tenantId: T, type: "crm.deal.won", payload: ev.payload, systemId: ev.systemId, unitId: ev.unitId });
  const verdict = async (ids: string[]) => {
    let bad = 0; const out: string[] = [];
    for (const e of ids) {
      const row = await enr(e);
      const fin = await P.outboxEvent.count({ where: { tenantId: T, type: "crm.sequence.finished", idempotencyKey: { contains: e } } });
      const au = await P.auditLog.count({ where: { tenantId: T, action: "crm.sequence.auto_stop", targetId: e } });
      if (!(row?.status === "STOPPED" && row?.stoppedReason === "WON" && fin === 1 && au === 1)) bad += 1;
      out.push(`${row?.stoppedReason}/${fin}/${au}`);
    }
    return { bad, out: out.join(" ") };
  };
  await sub("R2N8a", async () => {
    const { ids, deals, evs } = await raceFixture("กั้นด่าน");
    let release!: () => void; const barrier = new Promise<void>((r) => { release = r; });
    const DEAL = P.crmDeal; const FF = DEAL.findFirst; let held = 0;
    DEAL.findFirst = async (a: Any) => {
      if (a?.select?.stageEnteredAt && a?.select?.closedAt && a?.select?.kind && deals.includes(a?.where?.id)) { held += 1; await barrier; }
      return FF.call(DEAL, a);
    };
    let sum: Any = null; const sent: string[] = [];
    try {
      const guard = runDue(new Date(Date.now() + 1_000), recSender(sent)).then((s: Any) => { sum = s; });
      while (held === 0) await new Promise((r) => setTimeout(r, 20));
      await Promise.all(evs.map(consume)); // consumers stop every row while the guard holds its claims at the deal read
      release();
      await guard;
    } finally { DEAL.findFirst = FF; release(); }
    const v = await verdict(ids);
    chk("R2N8a", "race forced (guard claimed and paused at its deal read while the crm.deal.won consumer stopped the rows) ⇒ the guard ATTEMPTED and lost its conditional stop on every row it held · each enrollment exactly 1 finished event + 1 audit, 0 sends",
      evs.length === ids.length && held >= 1 && sum?.failed === held && sum?.finished === 0 && v.bad === 0 && sent.filter((x) => ids.includes(x)).length === 0,
      `events=${evs.length} guardHeld=${held} runDue=${j(sum)} sends=${sent.filter((x) => ids.includes(x)).length} ${v.out}`);
  });
  await sub("R2N8b", async () => {
    const { ids, deals, evs } = await raceFixture("กั้นผู้รับ");
    let release!: () => void; const barrier = new Promise<void>((r) => { release = r; });
    const EN = P.crmSequenceEnrollment; const FM = EN.findMany; let seen = 0; let parked = 0;
    EN.findMany = async (a: Any) => {
      const rows = await FM.call(EN, a);
      if (a?.where?.dealId && deals.includes(a.where.dealId) && a?.where?.sequence) { seen += rows.length; parked += 1; await barrier; }
      return rows;
    };
    let sum: Any = null; const sent: string[] = [];
    try {
      const cons = Promise.all(evs.map(consume));
      while (parked < evs.length) await new Promise((r) => setTimeout(r, 20));
      sum = await runDue(new Date(Date.now() + 1_000), recSender(sent)); // the guard stops every row while the consumers hold ACTIVE rows
      release();
      await cons;
    } finally { EN.findMany = FM; release(); }
    const v = await verdict(ids);
    chk("R2N8b", "race forced the other way (consumers read ACTIVE rows and paused before their conditional stop while the guard stopped them) ⇒ consumers ATTEMPTED on rows the guard had already stopped · still exactly 1 finished event + 1 audit per enrollment, 0 sends",
      evs.length === ids.length && seen === ids.length && sum?.finished === ids.length && v.bad === 0 && sent.filter((x) => ids.includes(x)).length === 0,
      `events=${evs.length} consumerSawActive=${seen} runDue=${j(sum)} sends=${sent.filter((x) => ids.includes(x)).length} ${v.out}`);
  });

  // ══════ R2-N5 · member-linked contacts: concurrent replays (member side) · linked mid-call ⇒ retryable ══════
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
  const crash = async (emailId: string, contactId: string, svixId: string) => {
    await P.crmEmailEvent.create({ data: { tenantId: T, emailId, kind: "COMPLAINT", providerEventId: svixId, at: new Date(Date.now() - 60_000) } });
    await P.crmContact.update({ where: { id: contactId }, data: { emailOptOut: true } });
  };
  const M = (await sysSvc.createSystem(T, "MEMBER", `สมาชิก ${TAG}`)).id as string;
  const mkMember = async (label: string) => {
    const cu = await P.customer.create({ data: { tenantId: T, memberSystemId: M, name: `${label} ${TAG}`, memberCode: `${rand}${++n}` } });
    await P.memberConsent.create({ data: { tenantId: T, customerId: cu.id, channel: "EMAIL", granted: true, source: "STAFF", grantedAt: new Date(Date.now() - 300_000) } });
    return cu.id as string;
  };
  const memberSide = async (customerId: string) => {
    const mc = await P.memberConsent.findMany({ where: { customerId, channel: "EMAIL" }, select: { granted: true } });
    const ev = ((await P.outboxEvent.findMany({ where: { tenantId: T, type: "member.consent.changed" }, select: { payload: true } })) as Any[]).filter((x) => x.payload?.customerId === customerId && x.payload?.channel === "EMAIL" && x.payload?.granted === false).length;
    const au = await P.auditLog.count({ where: { tenantId: T, action: "member.privacy.consent", targetId: customerId } });
    return { rows: mc.length, withdrawn: mc.filter((r: Any) => r.granted === false).length, ev, au };
  };
  await sub("R2N5a", async () => {
    const out: string[] = []; let bad = 0;
    for (let i = 0; i < 5; i += 1) {
      const k = await mkContact(c, `สมาชิกพร้อมกัน${i}`); const m = await sendOne(k.id);
      const cu = await mkMember(`สมาชิก${i}`);
      await P.crmContact.update({ where: { id: k.id }, data: { memberCustomerId: cu } });
      const sv = `msg_${TAG}_n5a_${i}`;
      await crash(m.id, k.id, sv);
      const rs = await Promise.all([hook("email.complained", { email_id: m.providerId }, sv), hook("email.complained", { email_id: m.providerId }, sv)]);
      const ms = await memberSide(cu);
      const crmRows = await P.crmContactConsent.count({ where: { tenantId: T, contactId: k.id, channel: "EMAIL", granted: false } });
      if (!(rs.every((r: Any) => r.status === 200) && ms.rows === 1 && ms.withdrawn === 1 && ms.ev === 1 && ms.au === 1 && crmRows === 0)) bad += 1;
      out.push(`${i}:member ${ms.withdrawn}/${ms.ev}/${ms.au} crm ${crmRows} ${rs.map((r: Any) => r.status).join("+")}`);
    }
    chk("R2N5a", "member-linked contact, two complaint replays fired concurrently ×5 ⇒ member side: 1 withdrawn MemberConsent / 1 member.consent.changed / 1 audit · CRM side: no CrmContactConsent row (member is the source of truth)", bad === 0, out.join(" · "));
  });
  await sub("R2N5b", async () => {
    const k = await mkContact(c, "ผูกกลางทาง"); const m = await sendOne(k.id);
    const cu = await mkMember("ผูกกลางทาง");
    const sv = `msg_${TAG}_n5b`;
    await crash(m.id, k.id, sv);
    // the contact becomes member-linked right after consents.set loaded it (between its read and its locked transaction)
    const CC = P.crmContact; const FF = CC.findFirst; let hits = 0; let linked = false;
    CC.findFirst = async (a: Any) => {
      const row = await FF.call(CC, a);
      const and = Array.isArray(a?.where?.AND) ? a.where.AND : [];
      if (!linked && and.some((w: Any) => w?.id === k.id)) { hits += 1; if (hits === 2) { linked = true; await P.$executeRawUnsafe(`UPDATE "CrmContact" SET "memberCustomerId" = $1 WHERE "id" = $2`, cu, k.id); } }
      return row;
    };
    let r1: Any = null;
    try { r1 = await hook("email.complained", { email_id: m.providerId }, sv); } finally { CC.findFirst = FF; }
    const r2 = await hook("email.complained", { email_id: m.providerId }, sv); // Svix retry
    const ms = await memberSide(cu);
    chk("R2N5b", "contact becomes member-linked between the consent read and its locked write ⇒ the replay answers 500 (retryable, not a silent skip) · the Svix retry then withdraws consent on the member side",
      linked && r1?.status === 500 && r2?.status === 200 && ms.withdrawn === 1,
      `linkedMidCall=${linked} first=${j(r1)} retry=${j(r2)} member=${j(ms)}`);
  });

  // ══════ R2-N1b · a full daily cap is a wait, never a send/redelivery ══════
  await sub("R2N1b", async () => {
    const cCap = await mkCrm();
    const k = await mkContact(cCap, "เพดานเต็ม");
    const e = await enroll(cCap, k.id);
    await P.tenant.update({ where: { id: T }, data: { limits: { crm: { emailsPerDay: 0 } } } });
    const callsBefore = CALLS.length;
    const at = Date.now() + 1_000;
    try { await runDue(new Date(at)); } finally { await P.tenant.update({ where: { id: T }, data: { limits: {} } }); }
    const row = await enr(e);
    const th = new Date(at + 7 * HOUR);
    const nextMidnight = Date.UTC(th.getUTCFullYear(), th.getUTCMonth(), th.getUTCDate() + 1) - 7 * HOUR;
    chk("R2N1b", "emailsPerDay full ⇒ no provider call, no attempt counted, no FAILED log line — the step waits until the next Thai day (cap window)",
      CALLS.length === callsBefore && row?.status === "ACTIVE" && row?.stepIndex === 0 && !row?.stats?.attempts?.["v1:0"] && !logOf(row).includes("0:FAILED") && new Date(row?.nextAt ?? 0).getTime() === nextMidnight,
      `calls=${CALLS.length - callsBefore} row=${row?.status}/step${row?.stepIndex} nextAt=${j(row?.nextAt)} expected=${new Date(nextMidnight).toISOString()} attempts=${attemptsOf(row)} log=${j(logOf(row))}`);
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
console.log(`\n${passed === cks.length ? "🟢" : "🔴"} probe-c54d-r3: ${passed}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, findings: cks.filter((x) => !x.ok).map((x) => ({ id: x.id })) })}`);
process.exit(passed === cks.length ? 0 : 1);
