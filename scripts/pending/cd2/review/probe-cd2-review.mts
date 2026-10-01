// C5.4-D2 REVIEW probe (independent reviewer · read-only on src) — each check asserts the CORRECT behaviour; RED = finding proven.
// Run (QC3): env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh \
//            pnpm exec tsx scripts/pending/cd2/review/probe-cd2-review.mts
// Provider stub = same Resend-like model as probe-cd2 (same key + same body ⇒ replay · same key + different body ⇒ 409).
// Throwaway tenants `qc-cd2r-<rand>` · CLEAN at the end (0 rows left). Never prints SESSION_SECRET.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash, createHmac, randomBytes } from "node:crypto";

const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
if (!process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = "re_qc_probe_dummy_key";

type Step = 200 | "lost" | number;
type Accepted = { key: string | null; id: string; html: string; body: Any };
const STORE = new Map<string, { bodyHash: string; id: string }>();
const ACCEPTED: Accepted[] = [];
const CALLS: { key: string | null; answer: string; to: string[] }[] = [];
const BODIES = new Map<string, Any[]>();
let SCRIPT: Step[] = [];
globalThis.fetch = (async (url: Any, init: Any) => {
  if (!String(url).startsWith("https://api.resend.com/")) throw new Error("probe: network blocked");
  const hdr = (init?.headers ?? {}) as Record<string, string>;
  const key = hdr["Idempotency-Key"] ?? null;
  const body = String(init?.body ?? "");
  let parsed: Any = {}; try { parsed = JSON.parse(body); } catch { /* */ }
  const to = Array.isArray(parsed?.to) ? parsed.to.map(String) : [];
  const bh = createHash("sha256").update(body).digest("hex");
  const res = (status: number, json: Any) => new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  if (key) BODIES.set(key, [...(BODIES.get(key) ?? []), parsed]);
  if (key && STORE.has(key)) {
    const prev = STORE.get(key)!;
    if (prev.bodyHash === bh) { CALLS.push({ key, answer: "replay-200", to }); return res(200, { id: prev.id }); }
    CALLS.push({ key, answer: "409", to });
    return res(409, { name: "invalid_idempotent_request" });
  }
  const step = SCRIPT.length ? SCRIPT.shift()! : 200;
  CALLS.push({ key, answer: String(step), to });
  if (step === 200 || step === "lost") {
    const id = `re_${randomBytes(6).toString("hex")}`;
    if (key) STORE.set(key, { bodyHash: bh, id });
    ACCEPTED.push({ key, id, html: String(parsed?.html ?? ""), body: parsed });
    if (step === "lost") throw new TypeError("fetch failed (answer lost after acceptance)");
    return res(200, { id });
  }
  return res(Number(step), { message: "probe" });
}) as typeof fetch;

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cd2r-${rand}`;
const SVIX_SECRET = `whsec_${Buffer.from(randomBytes(24)).toString("base64")}`;
const OLD_SVIX = process.env.RESEND_WEBHOOK_SECRET;
const OLD_SECRET = process.env.SESSION_SECRET;
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string) => { cks.push({ id, ok: !!ok }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}\n        — ACTUAL ${actual}`); };
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const sub = async (id: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { chk(id, "block ran", false, e instanceof Error ? `${e.name}: ${e.message} ${e.stack?.split("\n").slice(1, 3).join(" ") ?? ""}` : String(e)); } };
const HOUR = 3_600_000;
let T = ""; let T2 = "";
const USERS: string[] = [];

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const SEQ = CRM.sequences;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  T2 = (await P.tenant.create({ data: { name: `${TAG}-b`, slug: `${TAG}-b` } })).id as string;
  const OB = P.outboxEvent; const OB_FIND = OB.findMany;
  OB.findMany = (a: Any) => OB_FIND.call(OB, { ...(a ?? {}), where: { AND: [a?.where ?? {}, { tenantId: { in: [T, T2] } }] } });
  const u = await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC ${TAG}` } });
  USERS.push(u.id);
  for (const tid of [T, T2]) await P.membership.create({ data: { userId: u.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const owner = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  let n = 0;
  const mkCrm = async (crm: Record<string, unknown> = {}, tenantId = T) => {
    const S = (await sysSvc.createSystem(tenantId, "CRM", `${TAG} ${++n}`)).id as string;
    await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`, JSON.stringify({ uiVersion: 2, bridgesEnabled: true, email: { trackOpens: true, trackClicks: true }, ...crm }), S);
    return { S, T: tenantId, ctx: { tenantId, systemId: S, actorUserId: u.id } };
  };
  type Sys = Awaited<ReturnType<typeof mkCrm>>;
  const mkContact = async (sys: Sys, label: string, email?: string) => {
    const party = await P.party.create({ data: { tenantId: sys.T, name: `${label} ${TAG}`, kind: "PERSON" } });
    const k = await P.crmContact.create({ data: { tenantId: sys.T, systemId: sys.S, name: `${label} ${TAG}`, firstName: label, partyId: party.id, ownerUserId: u.id, email: email ?? `${TAG}-${++n}@qc.invalid` } });
    await P.crmContactConsent.create({ data: { tenantId: sys.T, systemId: sys.S, contactId: k.id, channel: "EMAIL", granted: true, source: "STAFF", createdAt: new Date(Date.now() - 300_000) } });
    return k;
  };
  const sysSend = (sys: Sys, k: Any, key: string) => CRM.emails.sendAsSystem({ tenantId: sys.T, systemId: sys.S }, { contactId: k.id, to: [k.email], subject: `ติดตาม ${TAG}`, bodyHtml: `<p>ดู <a href="https://example.com/cd2r">ที่นี่</a></p>`, idempotencyKey: key, redeliverFailed: true });
  const rowOf = (id: string) => P.crmEmailMessage.findUnique({ where: { id }, select: { id: true, status: true, providerId: true, providerError: true, messageId: true } });
  const unsubOf = (acc: Accepted) => /\/u\/([^/>]+)\/one-click>/.exec(String(acc.body?.headers?.["List-Unsubscribe"] ?? ""))?.[1] ?? "";
  const rfcOf = (messageId: string) => messageId.slice(messageId.indexOf(":") + 1);
  const diffKeys = (a: Any, b: Any) => Object.keys({ ...a, ...b }).filter((x) => j(a?.[x]) !== j(b?.[x]));

  // ══════ RV-T1 · SESSION_SECRET differs between attempt 1 (accepted, answer lost) and the redelivery ══════
  //   (key rotation, or Vercel /api/cron/outbox vs VPS crm-cron running crm.sequences with different values)
  await sub("RV-T1", async () => {
    const c = await mkCrm();
    const k = await mkContact(c, "หมุนกุญแจ");
    const key = `probe:${TAG}:t1`;
    SCRIPT = ["lost"];
    const a1 = await sysSend(c, k, key);
    process.env.SESSION_SECRET = `${OLD_SECRET}-rotated-for-probe`;
    let a2: Any;
    try { a2 = await sysSend(c, k, key); } finally { process.env.SESSION_SECRET = OLD_SECRET; }
    const row = await rowOf(a2.emailId);
    const acc = ACCEPTED.filter((x) => x.key === a1.messageId);
    const bodies = BODIES.get(a1.messageId) ?? [];
    await CRM.emails.unsubscribe(acc[0] ? unsubOf(acc[0]) : "", { ip: "203.0.113.181" }).catch(() => undefined);
    const kk = await P.crmContact.findUnique({ where: { id: k.id }, select: { emailOptOut: true } });
    chk("RV-T1", "secret changed between the accepted-but-lost attempt and the redelivery ⇒ the customer's List-Unsubscribe one-click of the mail they HOLD must still opt them out (row hashes must not be overwritten by a non-reproducible attempt)",
      kk?.emailOptOut === true,
      `a=${a1.status}/${a2.status}/${a2.failCode} row=${row?.status}/${row?.providerError} accepted=${acc.length} calls=${j(CALLS.filter((x) => x.key === a1.messageId).map((x) => x.answer))} bodyFieldsDiffer=${j(bodies.length > 1 ? diffKeys(bodies[0], bodies[1]) : [])} heldMailUnsubWorks=${kk?.emailOptOut}`);
  });

  // ══════ RV-T2 · inbound key rotated between attempt 1 (accepted, answer lost) and the redelivery ══════
  await sub("RV-T2", async () => {
    const c = await mkCrm();
    const k = await mkContact(c, "หมุนกล่องเข้า");
    const key = `probe:${TAG}:t2`;
    SCRIPT = ["lost"];
    const a1 = await sysSend(c, k, key);
    await CRM.emails.rotateInboundKey(c.ctx, owner, { confirm: true, reason: "probe rotate key" });
    const a2 = await sysSend(c, k, key);
    const row = await rowOf(a2.emailId);
    const acc = ACCEPTED.filter((x) => x.key === a1.messageId);
    const bodies = BODIES.get(a1.messageId) ?? [];
    chk("RV-T2", "owner rotates the CRM inbound key between the accepted-but-lost attempt and the redelivery ⇒ redelivery must still be byte-identical (replayed 200, row SENT with the accepted id)",
      a2.status === "SENT" && row?.providerId === acc[0]?.id && acc.length === 1,
      `a=${a1.status}/${a2.status}/${a2.failCode} row=${row?.status}/${row?.providerError} accepted=${acc.length} calls=${j(CALLS.filter((x) => x.key === a1.messageId).map((x) => x.answer))} fieldsDiffer=${j(bodies.length > 1 ? diffKeys(bodies[0], bodies[1]) : [])} reply_to ${bodies[0]?.reply_to === bodies[1]?.reply_to ? "same" : "CHANGED"}`);
  });

  // ══════ RV-F4 · wait episode key never reset: a pause/resume makes ONE later cap-full day stop the enrollment ══════
  await sub("RV-F4", async () => {
    const c = await mkCrm();
    const k = await mkContact(c, "พักแล้วเดินต่อ");
    const s = await SEQ.createSequence(c.ctx, owner, { name: `ลำดับ ${TAG} ${++n}`, stopOnReply: true, stopOnWon: true, stopOnLost: true, businessDaysOnly: false, sendWindow: null, steps: [{ kind: "EMAIL", subject: "หนึ่ง", body: "สวัสดี https://example.com/x" }, { kind: "EMAIL", subject: "สอง", body: "สอง" }] });
    const seqId = (s?.id ?? s?.sequence?.id) as string;
    await SEQ.enroll(c.ctx, owner, { sequenceId: seqId, contactId: k.id });
    const e = (await P.crmSequenceEnrollment.findFirst({ where: { sequenceId: seqId, contactId: k.id }, select: { id: true } })).id as string;
    const t0 = Date.now() + 1_000;
    await P.tenant.update({ where: { id: T }, data: { limits: { crm: { emailsPerDay: 0 } } } });
    let mid: Any; let fin: Any; let au: Any;
    try {
      await SEQ.runDue(new Date(t0), { tenantIds: [T] }); // day 0: cap full ⇒ wait (episode starts)
      mid = await P.crmSequenceEnrollment.findUnique({ where: { id: e }, select: { status: true, stats: true, nextAt: true } });
      await SEQ.pause(c.ctx, owner, e); // staff pauses the same day
      await SEQ.resume(c.ctx, owner, e); // … and resumes (row keeps stepIndex + stats)
      await SEQ.runDue(new Date(t0 + 7 * 24 * HOUR), { tenantIds: [T] }); // a week later the cap is full for ONE day
      fin = await P.crmSequenceEnrollment.findUnique({ where: { id: e }, select: { status: true, stoppedReason: true, stats: true } });
      au = await P.auditLog.findMany({ where: { tenantId: T, targetId: e, action: { in: ["crm.sequence.step_wait", "crm.sequence.auto_stop"] } }, select: { action: true } });
    } finally { await P.tenant.update({ where: { id: T }, data: { limits: {} } }); }
    chk("RV-F4", "cap full on day 0 (one wait) · paused/resumed · cap full again ONE day a week later ⇒ must wait again (new episode, new step_wait line) — not 'cap full for more than 3 days' STOPPED FAILED",
      mid?.status === "ACTIVE" && fin?.status === "ACTIVE",
      `mid=${mid?.status} waits=${j(mid?.stats?.waits)} final=${fin?.status}/${fin?.stoppedReason} log=${j((fin?.stats?.log ?? []).map((x: Any) => `${x.index}:${x.outcome}`))} audits=${j(au?.map((x: Any) => x.action))}`);
  });

  // ══════ RV-W1 / RV-W2 · webhook Message-ID fallback ══════
  process.env.RESEND_WEBHOOK_SECRET = SVIX_SECRET;
  const hook = async (type: string, data: Any, svixId: string) => {
    const body = JSON.stringify({ type, data });
    const ts = String(Math.floor(Date.now() / 1000));
    const key = Buffer.from(SVIX_SECRET.slice("whsec_".length), "base64");
    const sig = createHmac("sha256", key).update(`${svixId}.${ts}.${body}`).digest("base64");
    return CRM.emails.providerWebhook({ rawBody: body, headers: { "svix-id": svixId, "svix-timestamp": ts, "svix-signature": `v1,${sig}` } });
  };
  await sub("RV-W1", async () => {
    // an event whose email_id is NOT this outbound mail's id but carries its Message-ID (e.g. an `email.received` event for an inbound
    // mail whose sender copied our Message-ID, if the account's webhook also subscribes receiving events) back-fills providerId BEFORE the
    // type filter ⇒ the genuine complaint for the mail afterwards is unknown_email
    const c = await mkCrm();
    const k = await mkContact(c, "เติมรหัสผิด");
    SCRIPT = ["lost"];
    const a1 = await sysSend(c, k, `probe:${TAG}:w1`);
    const acc = ACCEPTED.find((x) => x.key === a1.messageId);
    const r0 = await hook("email.received", { email_id: `re_inbound_${TAG}`, message_id: `<${rfcOf(a1.messageId)}>` }, `msg_${TAG}_w1a`);
    const mid = await rowOf(a1.emailId);
    const r1 = await hook("email.complained", { email_id: acc?.id, message_id: `<${rfcOf(a1.messageId)}>` }, `msg_${TAG}_w1b`);
    const kk = await P.crmContact.findUnique({ where: { id: k.id }, select: { emailOptOut: true } });
    chk("RV-W1", "an unhandled event type carrying the Message-ID must not back-fill providerId · the genuine complaint that follows still opts the contact out",
      mid?.providerId === null && kk?.emailOptOut === true,
      `received=${j(r0)} providerIdAfter=${mid?.providerId === null ? "null" : mid?.providerId?.startsWith("re_inbound_") ? "INBOUND-ID" : mid?.providerId} complaint=${j(r1)} optOut=${kk?.emailOptOut}`);
  });
  await sub("RV-W2", async () => {
    // tenant B holds an OUT row for tenant A's mail (shape written by ingestInbound for an authenticated staff BCC-capture: direction OUT,
    // providerId NULL, routing NULL, messageId `<B system>:<A rfc>`) · A's own row is gone (retention purge / erasure) ⇒ a complaint about
    // A's mail flips B's contact
    const cA = await mkCrm();
    const cB = await mkCrm({}, T2);
    const addr = `${TAG}-shared@qc.invalid`;
    const kA = await mkContact(cA, "ร้านเอ", addr);
    const kB = await mkContact(cB, "ร้านบี", addr);
    const a = await sysSend(cA, kA, `probe:${TAG}:w2`);
    const accA = ACCEPTED.find((x) => x.key === a.messageId);
    const rfcA = rfcOf(a.messageId);
    await P.crmEmailMessage.create({ data: { tenantId: T2, systemId: cB.S, contactId: kB.id, direction: "OUT", messageId: `${cB.S}:${rfcA}`, references: [], threadKey: randomBytes(16).toString("hex"), fromAddr: "staff@qc.invalid", toAddrs: [addr], ccAddrs: [], subject: `capture ${TAG}`, sentById: u.id, sentAt: new Date(), status: "SENT", matchedBy: "EMAIL", trackTokenHash: createHash("sha256").update(`crm.email.in:${cB.S}:${rfcA}`).digest("hex") } });
    await P.crmEmailEvent.deleteMany({ where: { emailId: a.emailId } });
    await P.crmEmailMessage.delete({ where: { id: a.emailId } }); // A's row purged
    const r = await hook("email.complained", { email_id: accA?.id, message_id: `<${rfcA}>` }, `msg_${TAG}_w2`);
    const kb = await P.crmContact.findUnique({ where: { id: kB.id }, select: { emailOptOut: true } });
    chk("RV-W2", "a complaint about tenant A's mail must never change tenant B's contact (fallback restricted to rows our send path wrote)",
      kb?.emailOptOut === false,
      `hook=${j(r)} tenantB contact optOut=${kb?.emailOptOut}`);
  });

  // ══════ RV-X · cost of the unindexed fallback scan on QC3 (informational, always green) ══════
  await sub("RV-X", async () => {
    const counts = (await P.$queryRawUnsafe(`SELECT count(*)::int AS total, count(*) FILTER (WHERE "direction"='OUT')::int AS out, count(*) FILTER (WHERE "direction"='OUT' AND "providerId" IS NULL)::int AS out_null FROM "CrmEmailMessage"`)) as Any[];
    const tail = `:zz-${TAG}@shark.in.th`;
    const plan = (await P.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT "id" FROM "CrmEmailMessage" WHERE "direction" = 'OUT' AND "providerId" IS NULL AND lower(right("messageId", $1::int)) = $2 LIMIT 2`, tail.length, tail)) as Any[];
    const plan2 = (await P.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT "id" FROM "CrmEmailMessage" WHERE "providerId" = $1 LIMIT 1`, `re_none_${TAG}`)) as Any[];
    const txt = (p: Any[]) => p.map((r) => String(Object.values(r)[0])).join(" | ");
    chk("RV-X", "informational: row counts + plans of the fallback scan and of the (pre-existing) providerId lookup", true, `counts=${j(counts[0])}\n        fallback: ${txt(plan)}\n        byProviderId: ${txt(plan2)}`);
  });
} catch (e) {
  chk("FATAL", "probe ran to the end", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  process.env.SESSION_SECRET = OLD_SECRET;
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
console.log(`\n${passed === cks.length ? "🟢" : "🔴"} probe-cd2-review: ${passed}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, findings: cks.filter((x) => !x.ok).map((x) => ({ id: x.id })) })}`);
process.exit(passed === cks.length ? 0 : 1);
