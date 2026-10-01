// C5.4-D2 probe — review follow-ups F1–F6 of batch D (crm-C5.4-D-review.md "## Round 3")
//   Provider stub = Resend-like idempotency: same key + same body ⇒ replay the stored answer · same key + DIFFERENT body ⇒ 409 ·
//   SCRIPT entries: 200 · "lost" (accepted, answer lost) · "neterr" (never accepted) · any HTTP status (stored only when STORE_ERRORS) ·
//   PRE entries are answered BEFORE the provider's key check (a network error / early 5xx that never reached Resend's idempotency layer) ·
//   FORCE409 = the next N keyed requests get 409 whatever the body (a provider that answers 409 after a genuinely failed attempt).
// Run (QC3): bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cd2/probe-cd2.mts
// requires: QC3 env (SESSION_SECRET) · throwaway tenant `qc-cd2-<rand>` · network = stub · CLEAN at the end (0 rows left)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash, createHmac, randomBytes } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
if (!process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = "re_qc_probe_dummy_key";

type Step = 200 | "lost" | "neterr" | number;
type Accepted = { key: string | null; id: string; html: string; body: Any };
const STORE = new Map<string, { bodyHash: string; status: number; id?: string }>();
const ACCEPTED: Accepted[] = [];
const CALLS: { key: string | null; answer: string; to: string[] }[] = [];
const BODIES = new Map<string, string[]>();
let SCRIPT: Step[] = [];
let PRE: Step[] = [];
let FORCE409 = 0;
let STORE_ERRORS = false;
let DEFAULT_STEP: Step = 200;
globalThis.fetch = (async (url: Any, init: Any) => {
  if (!String(url).startsWith("https://api.resend.com/")) throw new Error("probe: network blocked");
  const hdr = (init?.headers ?? {}) as Record<string, string>;
  const key = hdr["Idempotency-Key"] ?? null;
  const body = String(init?.body ?? "");
  let parsed: Any = {}; try { parsed = JSON.parse(body); } catch { /* */ }
  const to = Array.isArray(parsed?.to) ? parsed.to.map(String) : [];
  const bh = createHash("sha256").update(body).digest("hex");
  const res = (status: number, json: Any) => new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  if (PRE.length) {
    const p = PRE.shift()!;
    CALLS.push({ key, answer: `pre-${p}`, to });
    if (p === "neterr" || p === "lost") throw new TypeError("fetch failed (never reached the provider)");
    return res(Number(p), { message: "probe pre" });
  }
  if (key) BODIES.set(key, [...(BODIES.get(key) ?? []), body]);
  if (key && FORCE409 > 0) { FORCE409 -= 1; CALLS.push({ key, answer: "force-409", to }); return res(409, { name: "invalid_idempotent_request" }); }
  if (key && STORE.has(key)) {
    const prev = STORE.get(key)!;
    if (prev.bodyHash === bh) {
      CALLS.push({ key, answer: `replay-${prev.status}`, to });
      return prev.status === 200 ? res(200, { id: prev.id }) : res(prev.status, { message: "replayed error" });
    }
    CALLS.push({ key, answer: "409", to });
    return res(409, { name: "invalid_idempotent_request", message: "Same idempotency key used with a different request payload" });
  }
  const step = SCRIPT.length ? SCRIPT.shift()! : DEFAULT_STEP;
  CALLS.push({ key, answer: String(step), to });
  if (step === 200 || step === "lost") {
    const id = `re_${randomBytes(6).toString("hex")}`;
    if (key) STORE.set(key, { bodyHash: bh, status: 200, id });
    ACCEPTED.push({ key, id, html: String(parsed?.html ?? ""), body: parsed });
    if (step === "lost") throw new TypeError("fetch failed (answer lost after acceptance)");
    return res(200, { id });
  }
  if (step === "neterr") throw new TypeError("fetch failed (probe)");
  if (STORE_ERRORS && key) STORE.set(key, { bodyHash: bh, status: Number(step) });
  return res(Number(step), { message: "probe" });
}) as typeof fetch;

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
async function inScope<T>(cookie: string, pathname: string, tasks: Any[], fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-cd2", "x-forwarded-for": "203.0.113.171" } });
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
const TAG = `qc-cd2-${rand}`;
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
let T2 = "";
const USERS: string[] = [];

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const coreHash = (await import("@/lib/core/hash" as string)) as Any;
  const SEQ = CRM.sequences;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  T2 = (await P.tenant.create({ data: { name: `${TAG}-b`, slug: `${TAG}-b` } })).id as string;
  const OB = P.outboxEvent; const OB_FIND = OB.findMany;
  OB.findMany = (a: Any) => OB_FIND.call(OB, { ...(a ?? {}), where: { AND: [a?.where ?? {}, { tenantId: { in: [T, T2] } }] } });
  const u = await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC ${TAG}` } });
  USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  await P.membership.create({ data: { userId: u.id, tenantId: T2, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const token = coreHash.randomToken(32) as string;
  await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 86_400_000), expiresAt: new Date(Date.now() + 86_400_000) } });
  const owner = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  let n = 0;
  const mkCrm = async (crm: Record<string, unknown> = {}, tenantId = T) => {
    const S = (await sysSvc.createSystem(tenantId, "CRM", `${TAG} ${++n}`)).id as string;
    await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`, JSON.stringify({ uiVersion: 2, bridgesEnabled: true, email: { trackOpens: true, trackClicks: true }, ...crm }), S);
    return { S, T: tenantId, ctx: { tenantId, systemId: S, actorUserId: u.id } };
  };
  type Sys = Awaited<ReturnType<typeof mkCrm>>;
  const c = await mkCrm();
  const mkContact = async (sys: Sys, label: string) => {
    const party = await P.party.create({ data: { tenantId: sys.T, name: `${label} ${TAG}`, kind: "PERSON" } });
    const k = await P.crmContact.create({ data: { tenantId: sys.T, systemId: sys.S, name: `${label} ${TAG}`, firstName: label, partyId: party.id, ownerUserId: u.id, email: `${TAG}-${++n}@qc.invalid` } });
    await P.crmContactConsent.create({ data: { tenantId: sys.T, systemId: sys.S, contactId: k.id, channel: "EMAIL", granted: true, source: "STAFF", createdAt: new Date(Date.now() - 300_000) } });
    return k;
  };
  const EMAIL = (subject: string) => ({ kind: "EMAIL", subject, body: "เรียนคุณ {{contact.firstName}} ดู https://example.com/seq" });
  const enroll = async (sys: Sys, contactId: string) => {
    const s = await SEQ.createSequence(sys.ctx, owner, { name: `ลำดับ ${TAG} ${++n}`, stopOnReply: true, stopOnWon: true, stopOnLost: true, businessDaysOnly: false, sendWindow: null, steps: [EMAIL("หนึ่ง"), EMAIL("สอง")] });
    const seqId = (s?.id ?? s?.sequence?.id) as string;
    await SEQ.enroll(sys.ctx, owner, { sequenceId: seqId, contactId });
    return (await P.crmSequenceEnrollment.findFirst({ where: { sequenceId: seqId, contactId }, select: { id: true } })).id as string;
  };
  const enr = (id: string) => P.crmSequenceEnrollment.findUnique({ where: { id }, select: { status: true, stepIndex: true, stoppedReason: true, nextAt: true, stats: true } });
  const logOf = (row: Any) => ((row?.stats?.log ?? []) as Any[]).map((x) => `${x.index}:${x.outcome}`);
  const runDue = (at: Date, tenantId = T) => SEQ.runDue(at, { tenantIds: [tenantId] });
  const stepMails = async (eid: string, index = 0) => {
    const row = await P.crmSequenceEnrollment.findUnique({ where: { id: eid }, select: { sequenceId: true, sequenceVersion: true } });
    const st = await P.crmSequenceStep.findFirst({ where: { sequenceId: row.sequenceId, version: row.sequenceVersion, index }, select: { id: true } });
    return P.crmEmailMessage.findMany({ where: { sequenceStepId: st.id }, select: { id: true, status: true, messageId: true, providerId: true, providerError: true, toAddrs: true } });
  };
  const rfcOf = (messageId: string) => messageId.slice(messageId.indexOf(":") + 1);
  const tokensOf = (acc: Accepted) => ({
    open: /\/t\/o\/([^".]+)\.gif/.exec(acc.html)?.[1] ?? "",
    click: /\/t\/c\/([^"]+)"/.exec(acc.html)?.[1] ?? "",
    unsub: /\/u\/([^"/]+)"/.exec(acc.html)?.[1] ?? "",
    header: /\/u\/([^/>]+)\/one-click>/.exec(String(acc.body?.headers?.["List-Unsubscribe"] ?? ""))?.[1] ?? "",
  });
  /** do the links of the mail the customer actually holds work? (open counted · click redirects · List-Unsubscribe one-click opts out) */
  const linksWork = async (emailId: string, contactId: string, acc: Accepted) => {
    const t = tokensOf(acc);
    await new Promise((r) => setTimeout(r, 2_600)); // opens count only once the mail is ≥ OPEN_MIN_AGE_MS old
    await CRM.emails.trackOpen(t.open, { ip: "203.0.113.172", ua: "Mozilla/5.0 (Windows NT 10.0) probe" });
    const clicked = t.click ? await CRM.emails.trackClick(t.click, { ip: "203.0.113.172", ua: "Mozilla/5.0 probe" }) : { url: null };
    const opens = await P.crmEmailEvent.count({ where: { emailId, kind: "OPEN" } });
    await CRM.emails.unsubscribe(t.header, { ip: "203.0.113.172" }).catch(() => undefined);
    const k = await P.crmContact.findUnique({ where: { id: contactId }, select: { emailOptOut: true } });
    return { tokens: `${!!t.open}/${!!t.click}/${!!t.unsub}/${!!t.header}`, sameUnsub: t.unsub === t.header, opens, clickUrl: clicked?.url ?? null, optOut: k?.emailOptOut === true };
  };
  const sysSend = (sys: Sys, k: Any, key: string, to?: string) => CRM.emails.sendAsSystem({ tenantId: sys.T, systemId: sys.S }, { contactId: k.id, to: [to ?? k.email], subject: `ติดตาม ${TAG}`, bodyHtml: `<p>ดูรายละเอียด <a href="https://example.com/cd2">ที่นี่</a></p>`, idempotencyKey: key, redeliverFailed: true });
  const rowOf = (id: string) => P.crmEmailMessage.findUnique({ where: { id }, select: { id: true, status: true, providerId: true, providerError: true, messageId: true, routing: true, toAddrs: true } });

  // ══════ F1 · deterministic tokens: every attempt of a message is byte-identical ══════
  await sub("F1a", async () => {
    // reviewer's trace: attempt k accepted-but-lost · attempt k+1 never reaches the key check · attempt k+2
    const k = await mkContact(c, "สามครั้งไม่ถึงคีย์");
    const key = `probe:${TAG}:f1a`;
    SCRIPT = ["lost"];
    const a1 = await sysSend(c, k, key);
    PRE = ["neterr"];
    const a2 = await sysSend(c, k, key);
    const a3 = await sysSend(c, k, key);
    const row = await rowOf(a3.emailId);
    const acc = ACCEPTED.filter((x) => x.key === a1.messageId);
    const res = acc[0] ? await linksWork(a3.emailId, k.id, acc[0]) : null;
    chk("F1a", "accepted-but-lost → failure before the key check → redelivery ⇒ ONE mail · row SENT with the provider id of the accepted mail (not 'unconfirmed') · open, click and List-Unsubscribe one-click of THAT mail all work",
      a1.status === "FAILED" && a2.status === "FAILED" && a3.status === "SENT" && row?.status === "SENT" && acc.length === 1 && row?.providerId === acc[0]?.id && !row?.providerError && res?.opens === 1 && res?.clickUrl === "https://example.com/cd2" && res?.optOut === true && res?.sameUnsub === true,
      `a=${a1.status}/${a2.status}/${a3.status} row=${row?.status}/${row?.providerError}/${row?.providerId === acc[0]?.id ? "accepted-id" : row?.providerId} accepted=${acc.length} calls=${j(CALLS.filter((x) => x.key === a1.messageId).map((x) => x.answer))} links=${j(res)}`);
    const bodies = BODIES.get(a1.messageId) ?? [];
    chk("F1b", "every request that reached the provider under this Idempotency-Key carried a byte-identical body (html · text · headers incl. List-Unsubscribe)",
      bodies.length === 2 && bodies[0] === bodies[1], `bodies=${bodies.length} identical=${bodies.length > 1 && new Set(bodies).size === 1}`);
  });
  await sub("F1c", async () => {
    const k = await mkContact(c, "คีย์ลับ");
    const r = await sysSend(c, k, `probe:${TAG}:f1c`);
    const acc = ACCEPTED.find((x) => x.key === r.messageId);
    const t = acc ? tokensOf(acc) : null;
    const secret = String(process.env.SESSION_SECRET ?? "");
    const mac = (s: string, msg: string) => createHmac("sha256", `crm-email-token:v1:${s}`).update(msg).digest("base64url").slice(0, 32);
    const expOpen = `${r.emailId}~${mac(secret, `${r.emailId}|o|0`)}`;
    const otherKey = `${r.emailId}~${mac(`${secret}x`, `${r.emailId}|o|0`)}`;
    const unkeyed = `${r.emailId}~${createHash("sha256").update(`${r.emailId}|o|0`).digest("base64url").slice(0, 32)}`;
    const sig = t?.open.split("~")[1] ?? "";
    chk("F1c", "tokens are keyed: open token = <emailId>~HMAC('crm-email-token:v1:'+SESSION_SECRET, '<emailId>|o|0') (192 bits) · a different key or an unkeyed hash gives another value",
      secret.length >= 32 && t?.open === expOpen && t?.open !== otherKey && t?.open !== unkeyed && sig.length === 32,
      `secretLen=${secret.length} open=${t?.open === expOpen ? "HMAC" : "other"} sigLen=${sig.length}`);
    // cross-row / cross-tenant: a valid signature moved onto another message id resolves nothing
    const c2 = await mkCrm({}, T2);
    const k2 = await mkContact(c2, "ร้านอื่น");
    const r2 = await sysSend(c2, k2, `probe:${TAG}:f1c2`);
    const acc2 = ACCEPTED.find((x) => x.key === r2.messageId);
    const t2 = acc2 ? tokensOf(acc2) : null;
    const moved = `${r2.emailId}~${t?.click.split("~")[1] ?? ""}`;
    const ownClick = t2?.click ? await CRM.emails.trackClick(t2.click, { ip: "203.0.113.173", ua: "Mozilla/5.0 probe" }) : { url: null };
    const movedClick = await CRM.emails.trackClick(moved, { ip: "203.0.113.173", ua: "Mozilla/5.0 probe" });
    await CRM.emails.unsubscribe(`${r2.emailId}~${t?.header.split("~")[1] ?? ""}`, { ip: "203.0.113.173" }).catch(() => undefined);
    const k2After = await P.crmContact.findUnique({ where: { id: k2.id }, select: { emailOptOut: true } });
    chk("F1d", "a signature from tenant A's mail placed on tenant B's mail id resolves nothing (click → no redirect · unsubscribe → no opt-out) · B's own click works (positive control)",
      ownClick?.url === "https://example.com/cd2" && !movedClick?.url && k2After?.emailOptOut === false, `own=${ownClick?.url} moved=${movedClick?.url} k2OptOut=${k2After?.emailOptOut}`);
  });
  await sub("F1e", async () => {
    // tracking opt-out between the accepted-but-lost attempt and the redelivery: the redelivery is the SAME message (identical request) ·
    // the opt-out is enforced where tracking is recorded (opens from that mail are not counted)
    const k = await mkContact(c, "ปิดติดตามระหว่างรอ");
    const key = `probe:${TAG}:f1e`;
    SCRIPT = ["lost"];
    const a1 = await sysSend(c, k, key);
    await P.crmContact.update({ where: { id: k.id }, data: { trackingOptOut: true } });
    const a2 = await sysSend(c, k, key);
    const row = await rowOf(a2.emailId);
    const acc = ACCEPTED.filter((x) => x.key === a1.messageId);
    const t = acc[0] ? tokensOf(acc[0]) : null;
    await new Promise((r) => setTimeout(r, 2_600));
    if (t?.open) await CRM.emails.trackOpen(t.open, { ip: "203.0.113.174", ua: "Mozilla/5.0 (Windows NT 10.0) probe" });
    const opens = await P.crmEmailEvent.count({ where: { emailId: a2.emailId, kind: "OPEN" } });
    chk("F1e", "contact turns tracking off between attempt 1 (accepted, answer lost) and the redelivery ⇒ the redelivery replays the accepted mail (SENT with its provider id, one mail) · its pixel is NOT counted",
      a1.status === "FAILED" && a2.status === "SENT" && row?.providerId === acc[0]?.id && acc.length === 1 && opens === 0,
      `a=${a1.status}/${a2.status} row=${row?.status}/${row?.providerError}/${row?.providerId === acc[0]?.id ? "accepted-id" : row?.providerId} accepted=${acc.length} opens=${opens} calls=${j(CALLS.filter((x) => x.key === a1.messageId).map((x) => x.answer))}`);
  });
  await sub("F1f", async () => {
    const v1 = await mkCrm({ uiVersion: 1 });
    const k = await mkContact(v1, "ร้านรุ่นหนึ่ง");
    const before = CALLS.length;
    const r = await sysSend(v1, k, `probe:${TAG}:f1f`).then((x: Any) => `ok ${x.status}`, (e: Any) => `ERR ${e?.name}/${e?.code ?? ""}`);
    chk("F1f", "uiVersion 1 shop: the system send path is refused exactly as before (no row, no provider call)",
      r.startsWith("ERR") && CALLS.length === before && (await P.crmEmailMessage.count({ where: { systemId: v1.S } })) === 0, `send=${r} calls=${CALLS.length - before}`);
  });

  // ══════ F2 · provider webhooks reach rows that have no provider id yet ══════
  process.env.RESEND_WEBHOOK_SECRET = SVIX_SECRET;
  const hook = async (type: string, data: Any, svixId: string) => {
    const body = JSON.stringify({ type, data });
    const ts = String(Math.floor(Date.now() / 1000));
    const key = Buffer.from(SVIX_SECRET.slice("whsec_".length), "base64");
    const sig = createHmac("sha256", key).update(`${svixId}.${ts}.${body}`).digest("base64");
    return CRM.emails.providerWebhook({ rawBody: body, headers: { "svix-id": svixId, "svix-timestamp": ts, "svix-signature": `v1,${sig}` } });
  };
  await sub("F2a", async () => {
    const k = await mkContact(c, "แจ้งสแปมก่อนส่งซ้ำ");
    const e = await enroll(c, k.id);
    SCRIPT = ["lost"];
    await runDue(new Date(Date.now() + 1_000));
    const [m] = await stepMails(e);
    const acc = ACCEPTED.find((x) => x.key === m?.messageId);
    const sv = `msg_${TAG}_f2a`;
    const r1 = await hook("email.complained", { email_id: acc?.id, message_id: `<${rfcOf(m.messageId)}>` }, sv);
    const kk = await P.crmContact.findUnique({ where: { id: k.id }, select: { emailOptOut: true } });
    const row = await rowOf(m.id);
    const st = await enr(e);
    const r2 = await hook("email.complained", { email_id: acc?.id, message_id: `<${rfcOf(m.messageId)}>` }, sv); // Svix retry of the same event
    const evs = await P.crmEmailEvent.count({ where: { emailId: m.id, kind: "COMPLAINT" } });
    const withdrawn = await P.crmContactConsent.count({ where: { contactId: k.id, channel: "EMAIL", granted: false } });
    chk("F2a", "spam complaint for a mail whose send answer was lost (row FAILED, no provider id) ⇒ resolved by its Message-ID: contact opted out, sequence STOPPED OPT_OUT, provider id back-filled",
      m?.status === "FAILED" && r1?.status === 200 && r1?.handled === true && kk?.emailOptOut === true && row?.providerId === acc?.id && st?.status === "STOPPED" && st?.stoppedReason === "OPT_OUT",
      `rowBefore=${m?.status}/${m?.providerId} hook=${j(r1)} optOut=${kk?.emailOptOut} rowAfter=${row?.status}/${row?.providerId === acc?.id ? "accepted-id" : row?.providerId} enr=${st?.status}/${st?.stoppedReason}`);
    chk("F2b", "the late/retried webhook (same svix id) does not double-write: exactly 1 COMPLAINT event and 1 consent withdrawal",
      r2?.status === 200 && evs === 1 && withdrawn === 1, `retry=${j(r2)} events=${evs} withdrawn=${withdrawn}`);
  });
  await sub("F2c", async () => {
    // rows marked SENT-unconfirmed by the previous build (providerId null) are reachable too · bounce + delivered
    const k = await mkContact(c, "ยืนยันไม่ได้");
    const a = await sysSend(c, k, `probe:${TAG}:f2c-a`);
    const b = await sysSend(c, k, `probe:${TAG}:f2c-b`);
    await P.crmEmailMessage.updateMany({ where: { id: { in: [a.emailId, b.emailId] } }, data: { providerId: null, providerError: "DELIVERY_UNCONFIRMED" } });
    const ra = await hook("email.bounced", { email_id: `re_${TAG}_a`, message_id: `<${rfcOf(a.messageId)}>`, bounce: { type: "Permanent" } }, `msg_${TAG}_f2c_a`);
    const rb = await hook("email.delivered", { email_id: `re_${TAG}_b`, message_id: `<${rfcOf(b.messageId)}>` }, `msg_${TAG}_f2c_b`);
    const rowA = await rowOf(a.emailId); const rowB = await rowOf(b.emailId);
    const kk = await P.crmContact.findUnique({ where: { id: k.id }, select: { emailBouncedAt: true } });
    chk("F2c", "SENT rows without a provider id (previous build's 'unconfirmed') ⇒ a permanent bounce marks the row BOUNCED + the contact bounced · delivered marks DELIVERED",
      ra?.handled === true && rowA?.status === "BOUNCED" && !!kk?.emailBouncedAt && rb?.handled === true && rowB?.status === "DELIVERED",
      `bounce=${j(ra)} rowA=${rowA?.status} bouncedAt=${!!kk?.emailBouncedAt} delivered=${j(rb)} rowB=${rowB?.status}`);
  });
  await sub("F2d", async () => {
    // negatives: a foreign Message-ID · a row that already has a DIFFERENT provider id · delivered for a FAILED row
    const k = await mkContact(c, "ไม่ใช่ของเรา");
    const sent = await sysSend(c, k, `probe:${TAG}:f2d-sent`);
    const sentRow = await rowOf(sent.emailId);
    SCRIPT = [503];
    const failed = await sysSend(c, k, `probe:${TAG}:f2d-failed`);
    const r1 = await hook("email.complained", { email_id: `re_${TAG}_x1`, message_id: "<abc.123@resend.dev>" }, `msg_${TAG}_f2d_1`);
    const r2 = await hook("email.complained", { email_id: `re_${TAG}_x2`, message_id: `<${rfcOf(sent.messageId)}>` }, `msg_${TAG}_f2d_2`);
    const r3 = await hook("email.delivered", { email_id: `re_${TAG}_x3`, message_id: `<${rfcOf(failed.messageId)}>` }, `msg_${TAG}_f2d_3`);
    const kk = await P.crmContact.findUnique({ where: { id: k.id }, select: { emailOptOut: true } });
    const fRow = await rowOf(failed.emailId); const sRow = await rowOf(sent.emailId);
    const evs = await P.crmEmailEvent.count({ where: { emailId: { in: [sent.emailId, failed.emailId] } } });
    chk("F2d", "negatives: foreign Message-ID ⇒ unknown · Message-ID of a row whose provider id is a DIFFERENT id ⇒ unknown (no opt-out) · 'delivered' never flips a FAILED row",
      r1?.reason === "unknown_email" && r2?.reason === "unknown_email" && kk?.emailOptOut === false && sRow?.providerId === sentRow?.providerId && fRow?.status === "FAILED" && evs === 0 && failed.status === "FAILED",
      `foreign=${j(r1)} otherId=${j(r2)} delivered/FAILED=${j(r3)} optOut=${kk?.emailOptOut} failedRow=${fRow?.status} events=${evs}`);
  });

  // ══════ F3 · no dependence on how the provider stores error answers ══════
  await sub("F3a", async () => {
    STORE_ERRORS = true;
    const k = await mkContact(c, "เก็บคำตอบผิด");
    const key = `probe:${TAG}:f3a`;
    SCRIPT = [500];
    const a1 = await sysSend(c, k, key);
    const a2 = await sysSend(c, k, key);
    STORE_ERRORS = false;
    const row = await rowOf(a2.emailId);
    chk("F3a", "provider that STORES error answers per key: attempt 1 genuinely failed (500) ⇒ the redelivery (identical request) gets that stored error back ⇒ row stays FAILED · never SENT · nothing accepted",
      a1.status === "FAILED" && a2.status === "FAILED" && row?.status === "FAILED" && ACCEPTED.filter((x) => x.key === a1.messageId).length === 0,
      `a=${a1.status}/${a2.status} row=${row?.status}/${row?.providerError} calls=${j(CALLS.filter((x) => x.key === a1.messageId).map((x) => x.answer))}`);
  });
  await sub("F3b", async () => {
    const k = await mkContact(c, "409หลังล้มจริง");
    const key = `probe:${TAG}:f3b`;
    SCRIPT = [503];
    const a1 = await sysSend(c, k, key);
    FORCE409 = 1;
    const a2 = await sysSend(c, k, key);
    const row = await rowOf(a2.emailId);
    const a3 = await sysSend(c, k, key); // the provider never had it ⇒ a later attempt is accepted normally
    const row3 = await rowOf(a3.emailId);
    chk("F3b", "409 on a redelivery after a GENUINELY failed attempt ⇒ NOT read as 'sent' (row FAILED, retried) · the next attempt is accepted and only then SENT with a provider id",
      a1.status === "FAILED" && a2.status === "FAILED" && row?.status === "FAILED" && a3.status === "SENT" && !!row3?.providerId && ACCEPTED.filter((x) => x.key === a1.messageId).length === 1,
      `a=${a1.status}/${a2.status}/${a3.status} row2=${row?.status}/${row?.providerError} row3=${row3?.status}/${row3?.providerId ? "id" : "none"} calls=${j(CALLS.filter((x) => x.key === a1.messageId).map((x) => x.answer))}`);
  });

  // ══════ F5 · shop-wide outage notice (E3) — prove, do not rebuild ══════
  await sub("F5", async () => {
    const notes = () => P.appNotification.count({ where: { tenantId: T, recipientUserId: u.id, title: "ระบบส่งอีเมลของร้านใช้งานไม่ได้ชั่วคราว" } });
    const cO = await mkCrm();
    const k0 = await mkContact(cO, "ล่ม503"); await enroll(cO, k0.id);
    DEFAULT_STEP = 503;
    await runDue(new Date(Date.now() + 1_000));
    const after503 = await notes();
    const k1 = await mkContact(cO, "ล่ม401ก"); await enroll(cO, k1.id);
    const k2 = await mkContact(cO, "ล่ม401ข"); await enroll(cO, k2.id);
    DEFAULT_STEP = 401;
    await runDue(new Date(Date.now() + 1_000));
    const after401 = await notes();
    const k3 = await mkContact(cO, "ล่ม401ค"); await enroll(cO, k3.id);
    await runDue(new Date(Date.now() + 1_000));
    DEFAULT_STEP = 200;
    const again = await notes();
    for (const s of await P.crmSequenceEnrollment.findMany({ where: { tenantId: T, sequence: { systemId: cO.S } }, select: { id: true } })) await P.crmSequenceEnrollment.update({ where: { id: s.id }, data: { status: "STOPPED", stoppedReason: "MANUAL", nextAt: null } });
    chk("F5", "E3 already covers F5: sequence steps hitting 401 notify the shop OWNER in-app exactly once per Thai day (3 failing steps ⇒ 1 notice) · a 503 notifies nobody (control)",
      after503 === 0 && after401 === 1 && again === 1, `after503=${after503} after401(2 steps)=${after401} afterThird=${again}`);
  });

  // ══════ F4 · every wait path has a ceiling and one audit line ══════
  const waitAudits = (eid: string) => P.auditLog.count({ where: { tenantId: T, action: "crm.sequence.step_wait", targetId: eid } });
  const stopAudits = (eid: string) => P.auditLog.count({ where: { tenantId: T, action: "crm.sequence.auto_stop", targetId: eid } });
  await sub("F4a", async () => {
    // in-flight QUEUED row whose reaper never runs (reaper failing persistently)
    const k = await mkContact(c, "ค้างกำลังส่ง");
    const e = await enroll(c, k.id);
    SCRIPT = [503];
    let at = Date.now() + 1_000;
    await runDue(new Date(at));
    const [m] = await stepMails(e);
    await P.crmEmailMessage.update({ where: { id: m.id }, data: { status: "QUEUED", leaseUntil: new Date(Date.now() + 100 * HOUR) } });
    const mine = () => CALLS.filter((x) => x.to.includes(String(k.email))).length;
    const callsBefore = mine();
    const start = at; let runs = 0; let waitsAfterFirst = -1;
    for (; runs < 30; runs += 1) {
      const row = await enr(e);
      if (row?.status !== "ACTIVE") break;
      at = Math.max(at + 1_000, new Date(row.nextAt).getTime() + 1_000);
      await runDue(new Date(at));
      if (runs === 1) waitsAfterFirst = await waitAudits(e);
    }
    const row = await enr(e);
    const hrs = (at - start) / HOUR;
    chk("F4a", "in-flight wait (prior QUEUED, reaper never runs) ⇒ ONE step_wait audit for the episode · after the 24 h ceiling the normal FAILED path takes over (log FAILED, counted) ⇒ STOPPED FAILED (1 auto_stop audit) · no provider call meanwhile",
      waitsAfterFirst === 1 && (await waitAudits(e)) === 1 && row?.status === "STOPPED" && row?.stoppedReason === "FAILED" && (await stopAudits(e)) === 1 && logOf(row).filter((x) => x === "0:FAILED").length >= 2 && mine() === callsBefore && hrs < 140,
      `runs=${runs} hrs=${hrs.toFixed(1)} waitAudits=${await waitAudits(e)} row=${row?.status}/${row?.stoppedReason}/step${row?.stepIndex} log=${j(logOf(row))} attempts=${j(row?.stats?.attempts)} calls=${mine() - callsBefore}`);
  });
  await sub("F4b", async () => {
    // daily cap full every day
    const cCap = await mkCrm();
    const k = await mkContact(cCap, "เพดานเต็มทุกวัน");
    const e = await enroll(cCap, k.id);
    await P.tenant.update({ where: { id: T }, data: { limits: { crm: { emailsPerDay: 0 } } } });
    const mine = () => CALLS.filter((x) => x.to.includes(String(k.email))).length;
    const callsBefore = mine();
    const start = Date.now() + 1_000; let at = start; let runs = 0;
    try {
      for (; runs < 12; runs += 1) {
        await runDue(new Date(at));
        const row = await enr(e);
        if (row?.status !== "ACTIVE") break;
        at = new Date(row.nextAt).getTime() + 1_000;
      }
    } finally { await P.tenant.update({ where: { id: T }, data: { limits: {} } }); }
    const row = await enr(e);
    const hrs = (at - start) / HOUR;
    const au = await P.auditLog.findFirst({ where: { tenantId: T, action: "crm.sequence.auto_stop", targetId: e }, select: { after: true } });
    chk("F4b", "daily cap full day after day ⇒ ONE step_wait audit · STOPPED FAILED once 72 h have passed since the first wait (≤ 4 Thai days) with an auto_stop audit naming the cap · no provider call",
      (await waitAudits(e)) === 1 && row?.status === "STOPPED" && row?.stoppedReason === "FAILED" && hrs >= 72 && hrs < 97 && (await stopAudits(e)) === 1 && /cap/i.test(j(au?.after)) && mine() === callsBefore,
      `runs=${runs} hrs=${hrs.toFixed(1)} waitAudits=${await waitAudits(e)} row=${row?.status}/${row?.stoppedReason} audit=${j(au?.after)} log=${j(logOf(row))} calls=${mine() - callsBefore}`);
  });
  await sub("F4c", async () => {
    // control: cap full for one day, then free ⇒ normal send, no stop, no FAILED line
    const cCap = await mkCrm();
    const k = await mkContact(cCap, "เพดานเต็มวันเดียว");
    const e = await enroll(cCap, k.id);
    await P.tenant.update({ where: { id: T }, data: { limits: { crm: { emailsPerDay: 0 } } } });
    const at = Date.now() + 1_000;
    try { await runDue(new Date(at)); } finally { await P.tenant.update({ where: { id: T }, data: { limits: {} } }); }
    const mid = await enr(e);
    const th = new Date(at + 7 * HOUR);
    const nextMidnight = Date.UTC(th.getUTCFullYear(), th.getUTCMonth(), th.getUTCDate() + 1) - 7 * HOUR;
    await runDue(new Date(new Date(mid.nextAt).getTime() + 1_000));
    const row = await enr(e);
    chk("F4c", "control: cap full for one Thai day ⇒ waits to the next Thai midnight (R2-N1b unchanged: no FAILED line, no attempt) with ONE step_wait audit · next day both steps send ⇒ DONE",
      mid?.status === "ACTIVE" && new Date(mid?.nextAt ?? 0).getTime() === nextMidnight && !logOf(mid).includes("0:FAILED") && !mid?.stats?.attempts?.["v1:0"] && (await waitAudits(e)) === 1 && row?.status === "DONE" && logOf(row).join(",") === "0:SENT,1:SENT",
      `mid=${mid?.status} nextAt=${j(mid?.nextAt)} expected=${new Date(nextMidnight).toISOString()} waitAudits=${await waitAudits(e)} final=${row?.status} log=${j(logOf(row))}`);
  });

  // ══════ F6 · carried items ══════
  await sub("F6a", async () => {
    // R2-N1a: the contact's address changed between the failed attempt and the redelivery
    const k = await mkContact(c, "เปลี่ยนอีเมล");
    const e = await enroll(c, k.id);
    SCRIPT = [503];
    let at = Date.now() + 1_000;
    await runDue(new Date(at));
    const r1 = await enr(e);
    const oldAddr = String(k.email);
    const newAddr = `${TAG}-new-${++n}@qc.invalid`;
    await P.crmContact.update({ where: { id: k.id }, data: { email: newAddr } });
    const callsBefore = CALLS.length;
    at = Math.max(at + 1_000, new Date(r1.nextAt).getTime() + 1_000);
    await runDue(new Date(at));
    const r2 = await enr(e);
    const after = CALLS.slice(callsBefore);
    const [m0] = await stepMails(e, 0);
    chk("F6a", "contact e-mail changed between attempt 1 and the redelivery ⇒ the old address is NOT mailed again · step 0 SKIPPED with a reason (row stays FAILED) · the next step goes to the new address",
      r1?.stepIndex === 0 && !after.some((x) => x.to.includes(oldAddr)) && after.some((x) => x.to.includes(newAddr)) && logOf(r2).includes("0:SKIPPED") && m0?.status === "FAILED" && r2?.status === "DONE",
      `callsAfter=${j(after.map((x) => `${x.answer}→${x.to.map((t) => (t === oldAddr ? "OLD" : t === newAddr ? "NEW" : t)).join(",")}`))} log=${j(logOf(r2))} step0=${m0?.status} final=${r2?.status}`);
  });
  await sub("F6b", async () => {
    // round-1 N5 (CRM part): portal writes wake the outbox
    const cP = await mkCrm({ portal: { enabled: true } });
    const k = await mkContact(cP, "ลูกค้าพอร์ทัล");
    const party = await P.party.create({ data: { tenantId: T, name: `บริษัท ${TAG}`, kind: "COMPANY" } });
    const co = await P.crmCompany.create({ data: { tenantId: T, systemId: cP.S, partyId: party.id, name: `บริษัท ${TAG}` } });
    await P.crmCompanyContact.create({ data: { tenantId: T, companyId: co.id, contactId: k.id } });
    const acc = await P.crmPortalAccess.create({ data: { tenantId: T, systemId: cP.S, companyId: co.id, contactId: k.id, role: "ADMIN", acceptedAt: new Date(), loginMethods: ["EMAIL_OTP"] } });
    const CS = (await import("@/lib/modules/member/customer-session" as string)) as Any;
    const minted = await CS.mintPortalSession(acc.id, {});
    const ACT = (await import("@/app/b/[slug]/actions" as string)) as Any;
    const cookieName = CS.portalCookieName();
    const tBad: Any[] = []; const tGood: Any[] = [];
    const bad = await inScope(`${cookieName}=cp_${"z".repeat(40)}`, "/b/x", tBad, () => ACT.portalCreateRequestAction({ kind: "ISSUE", title: `ผิด ${TAG}` }));
    const good = await inScope(`${cookieName}=${minted.token}`, "/b/x", tGood, () => ACT.portalCreateRequestAction({ kind: "ISSUE", title: `แจ้งเรื่อง ${TAG}` }));
    const tasks = tGood.length;
    await runTasks(tBad); await runTasks(tGood);
    chk("F6b", "portal customer write (create request) ⇒ the outbox is woken after the write (1 after() drain) · a refused write (bad session) wakes nothing (control)",
      bad?.ok === false && tBad.length === 0 && good?.ok === true && tasks === 1, `bad=${j(bad)} badTasks=${tBad.length} good=${j(good)} goodTasks=${tasks}`);
  });
} catch (e) {
  chk("FATAL", "probe ran to the end", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  if (OLD_SVIX === undefined) delete process.env.RESEND_WEBHOOK_SECRET; else process.env.RESEND_WEBHOOK_SECRET = OLD_SVIX;
  await new Promise((r) => setTimeout(r, 2_000));
  const left: string[] = [];
  const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
  for (const tid of [T, T2].filter(Boolean)) {
    await P.apiKey.deleteMany({ where: { tenantId: tid } }).catch(() => undefined);
    await P.opsEvent.deleteMany({ where: { tenantId: tid } }).catch(() => undefined);
    await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${tid}%`).catch(() => undefined);
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: tid } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: tid } }).catch(() => undefined);
    for (const t of tables) { const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => [{ n: 0 }])) as Any[]; if (Number(r?.[0]?.n ?? 0) > 0) left.push(`${t}=${r[0].n}`); }
  }
  for (const uid of USERS) { await P.session.deleteMany({ where: { userId: uid } }).catch(() => undefined); await P.appNotification.deleteMany({ where: { recipientUserId: uid } }).catch(() => undefined); await P.membership.deleteMany({ where: { userId: uid } }).catch(() => undefined); await P.user.delete({ where: { id: uid } }).catch(() => undefined); }
  if (T) chk("CLEAN", "throwaway tenants and users removed (0 rows left)", left.length === 0 && (await P.tenant.count({ where: { id: { in: [T, T2].filter(Boolean) } } })) === 0 && (await P.user.count({ where: { id: { in: USERS } } })) === 0, left.join(" · ") || "-");
  await prisma.$disconnect();
}
const passed = cks.filter((x) => x.ok).length;
console.log(`\n${passed === cks.length ? "🟢" : "🔴"} probe-cd2: ${passed}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, findings: cks.filter((x) => !x.ok).map((x) => ({ id: x.id })) })}`);
process.exit(passed === cks.length ? 0 : 1);
