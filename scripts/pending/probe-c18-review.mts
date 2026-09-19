// probe-c18-review.mts — builder evidence for the controller's C1.8 review rulings 1 · 2 · 3 · 4 · 6 · 7 · 9 (positive + negative + v1 path each)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c18-review.mts
// requires: nothing seeded — throwaway tenants `qc-c18r-<rand>-*` swept in `finally` · failure injection = tenant-scoped triggers, dropped in `finally`
// Worker mode (ruling 4, second OS process): `… probe-c18-review.mts --worker <tenantId> <systemId> <kind> <phone> <subId,subId,…>`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
globalThis.fetch = (async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const CRM = (await import("@/lib/modules/crm" as string)) as Any;

// ─────────────────────────── worker (ruling 4) ───────────────────────────
const wi = process.argv.indexOf("--worker");
if (wi >= 0) {
  const [tenantId, systemId, kind, phone, subs] = process.argv.slice(wi + 1);
  const ids = String(subs).split(",");
  const r = await Promise.all(
    ids.map((s) =>
      CRM.contacts
        .leadFromBridge({ tenantId, systemId, actorUserId: null }, { kind, name: `คนเดียวกัน ${s.slice(-4)}`, phone, submissionId: s, sourceDetail: { submissionId: s } })
        .then(() => "ok")
        .catch((e: Any) => `ERR ${e?.name}:${e?.code ?? ""}`),
    ),
  );
  console.log(`WORKER_RESULT ${JSON.stringify(r)}`);
  await prisma.$disconnect();
  process.exit(0);
}

const OBX = (await import("@/lib/outbox-consumers" as string)) as Any;
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
const FM = (await import("@/lib/modules/forms/service" as string)) as Any;

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c18r-${rand}`;
const TRIG = `qc_c18r_${rand}`;
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, info = "") => {
  cks.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — ${info}`}`);
};
const call = async (fn: Any, ...a: Any[]) => {
  try {
    return { ok: true, v: await fn(...a), err: "" };
  } catch (e) {
    return { ok: false, v: undefined, err: `${(e as Any)?.name}:${(e as Any)?.code ?? ""}` };
  }
};
const TENANTS: string[] = [];
const TRIG_TABLES = new Set<string>();
let seq = 0;
const nx = () => `${++seq}`;
const phoneOf = () => `08${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;

const failWrites = async (tid: string, table: string) => {
  await P.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION ${TRIG}_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."tenantId" = '${tid}' THEN RAISE EXCEPTION 'qc-c18r forced failure'; END IF; RETURN NEW; END $$`);
  await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIG}_${table.toLowerCase()} ON "${table}"`);
  await P.$executeRawUnsafe(`CREATE TRIGGER ${TRIG}_${table.toLowerCase()} BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION ${TRIG}_fn()`);
  TRIG_TABLES.add(table);
};
const dropTriggers = async () => {
  for (const t of TRIG_TABLES) await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIG}_${t.toLowerCase()} ON "${t}"`).catch(() => 0);
  TRIG_TABLES.clear();
  await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${TRIG}_fn() CASCADE`).catch(() => 0);
};
const mkTenant = async (s: string) => {
  const t = await P.tenant.create({ data: { name: `${TAG}-${s}`, slug: `${TAG}-${s}` } });
  TENANTS.push(t.id);
  return t.id as string;
};
const mk = async (tid: string, type: string) => (await sysSvc.createSystem(tid, type, `${type} ${TAG}`)).id as string;
const setCrm = (sys: string, obj: Record<string, unknown>) =>
  P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', (CASE WHEN jsonb_typeof("settings"->'crm')='object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify(obj), sys);
const FIELDS = [{ key: "name", label: "ชื่อ", type: "text", required: true }, { key: "phone", label: "เบอร์", type: "phone" }, { key: "email", label: "อีเมล", type: "email" }];
const mkForm = async (tid: string) => (await FM.createForm({ tenantId: tid }, { name: `ฟอร์ม ${TAG}`, crmEnabled: true, fields: FIELDS })) as Any;
const synth = (tid: string, type: string, payload: Any) => ({ id: `${TAG}-ev-${nx()}`, tenantId: tid, type, payload, systemId: null, unitId: null });
const consume = (evt: Any) => call(OBX.consumers[evt.type], evt);
const eventOfSub = (tid: string, subId: string) => P.outboxEvent.findFirst({ where: { tenantId: tid, idempotencyKey: `forms.sub.${subId}` } });
/** drains only while OUR event is still pending (the queue is shared) */
const drainUntil = async (id: string) => {
  for (let i = 0; i < 6; i += 1) {
    await OBX.drainAll();
    const r = await P.outboxEvent.findUnique({ where: { id } });
    if (!r || r.status !== "PENDING" || r.availableAt > new Date()) return r;
  }
  return P.outboxEvent.findUnique({ where: { id } });
};

console.log(`\n═══ probe C1.8 review · DB ${host} · ${TAG} ═══`);
try {
  const tV2 = await mkTenant("v2");
  const crmV2 = await mk(tV2, "CRM");
  await setCrm(crmV2, { uiVersion: 2, bridgesEnabled: true, chatToLead: true });
  const memV2 = await mk(tV2, "MEMBER");
  const chatV2 = await mk(tV2, "CHAT");
  const tV1 = await mkTenant("v1");
  const crmV1 = await mk(tV1, "CRM");
  const memV1 = await mk(tV1, "MEMBER");
  const chatV1 = await mk(tV1, "CHAT");
  await setCrm(crmV1, { chatToLead: true });

  // ═══ ruling 1 — a submission already handled (crmContactId set: old direct path / earlier delivery) ⇒ the consumer returns at once ═══
  console.log("── ruling 1 ──");
  for (const [label, tid, sys] of [["v2", tV2, crmV2], ["v1", tV1, crmV1]] as const) {
    const f = await mkForm(tid);
    const old = await CRM.contacts.createContactFromLegacy({ tenantId: tid, systemId: sys }, { name: `ทางเดิม ${label}`, phone: phoneOf(), source: "FORM" });
    const s = await P.formSubmission.create({ data: { tenantId: tid, formId: f.id, answersJson: { name: `ทางเดิม ${label}`, phone: phoneOf() }, crmContactId: old.id } });
    const c0 = await P.crmContact.count({ where: { tenantId: tid } });
    const a0 = await P.crmActivity.count({ where: { tenantId: tid } });
    const r1 = await consume(synth(tid, "forms.submission.received", { formId: f.id, submissionId: s.id }));
    const r2 = await consume(synth(tid, "forms.submission.received", { formId: f.id, submissionId: s.id, crmContactId: old.id }));
    chk(`R1.${label}.pos`, `${label}: already-linked submission (and an old-path payload carrying crmContactId) ⇒ no new contact · no activity · link unchanged`,
      r1.ok && r2.ok && (await P.crmContact.count({ where: { tenantId: tid } })) === c0 && (await P.crmActivity.count({ where: { tenantId: tid } })) === a0 && (await P.formSubmission.findUnique({ where: { id: s.id } })).crmContactId === old.id,
      `${r1.err}${r2.err}`);
    const s2 = await P.formSubmission.create({ data: { tenantId: tid, formId: f.id, answersJson: { name: `ใหม่ ${label}`, phone: phoneOf() } } });
    const r3 = await consume(synth(tid, "forms.submission.received", { formId: f.id, submissionId: s2.id }));
    const l2 = (await P.formSubmission.findUnique({ where: { id: s2.id } })).crmContactId;
    chk(`R1.${label}.neg`, `${label}: [control] an unlinked submission ⇒ one new contact and the link is written`, r3.ok && !!l2 && (await P.crmContact.count({ where: { tenantId: tid } })) === c0 + 1, r3.err);
  }

  // ═══ ruling 2 — transient failure of the lead step ⇒ event fails and is retried · exactly once afterwards ═══
  console.log("── ruling 2 ──");
  for (const [label, tid] of [["v2", tV2], ["v1", tV1]] as const) {
    const f = await mkForm(tid);
    await P.automationRule.create({ data: { tenantId: tid, name: `auto ${TAG}`, event: "forms.submission.received", enabled: true, actionType: "NOTIFY", actionConfig: { title: `AUTO-${TAG}` }, scope: "KANBAN" } });
    await P.webhookEndpoint.create({ data: { tenantId: tid, url: "https://hooks.example.com/qc", secret: `s-${rand}`, eventsJson: ["forms.submission.received"] } });
    const phone = phoneOf();
    let ev: Any = null;
    let first: Any = null;
    let sid = "";
    try {
      await failWrites(tid, "CrmContact");
      sid = (await FM.submitPublicForm(f.publicToken, { name: `ลูกค้า ${label}`, phone }, { ip: "203.0.113.7" })).id;
      ev = await eventOfSub(tid, sid);
      first = await drainUntil(ev.id);
    } finally {
      await dropTriggers();
    }
    const midContacts = await P.crmContact.count({ where: { tenantId: tid, phone } });
    const midAuto = await P.appNotification.count({ where: { tenantId: tid, title: `AUTO-${TAG}` } });
    chk(`R2.${label}.fail`, `${label}: injected CrmContact failure ⇒ the event FAILS for retry (attempts 1 · lastError · still PENDING) · no contact · automation NOT run yet`,
      first?.status === "PENDING" && first?.attempts === 1 && !!first?.lastError && midContacts === 0 && midAuto === 0,
      `status=${first?.status} attempts=${first?.attempts} contacts=${midContacts} auto=${midAuto}`);
    await P.outboxEvent.update({ where: { id: ev.id }, data: { availableAt: new Date() } });
    const done = await drainUntil(ev.id);
    const sub = await P.formSubmission.findUnique({ where: { id: sid } });
    const contacts = await P.crmContact.count({ where: { tenantId: tid, phone } });
    const staff = await P.appNotification.count({ where: { tenantId: tid, title: "มีคนกรอกฟอร์มเข้ามา", body: { contains: f.id } } });
    const auto = await P.appNotification.count({ where: { tenantId: tid, title: `AUTO-${TAG}` } });
    const hooks = await P.webhookDelivery.count({ where: { tenantId: tid, eventType: "forms.submission.received" } });
    chk(`R2.${label}.retry`, `${label}: after the queue retries ⇒ event DONE · exactly 1 contact · crmContactId set · 1 staff notification · 1 automation run · 1 webhook`,
      done?.status === "DONE" && contacts === 1 && !!sub?.crmContactId && staff === 1 && auto === 1 && hooks === 1,
      `status=${done?.status} contacts=${contacts} link=${!!sub?.crmContactId} staff=${staff} auto=${auto} hooks=${hooks}`);
  }
  {
    // negative control: a permanent problem (form of a CRM system with bridges off) never fails the event
    const tOff = await mkTenant("off");
    const crmOff = await mk(tOff, "CRM");
    await setCrm(crmOff, { uiVersion: 2, bridgesEnabled: false });
    const f = await mkForm(tOff);
    const sid = (await FM.submitPublicForm(f.publicToken, { name: "ปิดสะพาน", phone: phoneOf() })).id;
    const ev = await eventOfSub(tOff, sid);
    const d = await drainUntil(ev.id);
    chk("R2.neg", "[control] bridges off ⇒ event DONE on the first attempt · no contact", d?.status === "DONE" && d?.attempts === 0 && (await P.crmContact.count({ where: { tenantId: tOff } })) === 0, `${d?.status}/${d?.attempts}`);
  }

  // ═══ ruling 3 — submission + notification + event in ONE transaction ═══
  console.log("── ruling 3 ──");
  {
    const src = readFileSync("src/lib/modules/forms/service.ts", "utf8");
    const body = src.slice(src.indexOf("export async function submitPublicForm"), src.indexOf("return { id: sub.id }"));
    const tx = body.slice(body.indexOf("prisma.$transaction"));
    chk("R3.static", "[static] formSubmission.create · emitOutbox · appNotification.create all inside the one prisma.$transaction of submitPublicForm",
      /tx\.formSubmission\.create/.test(tx) && /emitOutbox\(tx/.test(tx) && /tx\.appNotification\.create/.test(tx) && (body.match(/\$transaction/g) ?? []).length === 1);
    for (const [label, tid] of [["v2", tV2], ["v1", tV1]] as const) {
      const f = await mkForm(tid);
      const s0 = await P.formSubmission.count({ where: { tenantId: tid, formId: f.id } });
      let r: Any;
      try {
        await failWrites(tid, "AppNotification");
        r = await call(FM.submitPublicForm, f.publicToken, { name: "ล้มตอนแจ้ง", phone: phoneOf() });
      } finally {
        await dropTriggers();
      }
      const s1 = await P.formSubmission.count({ where: { tenantId: tid, formId: f.id } });
      const e1 = await P.outboxEvent.count({ where: { tenantId: tid, type: "forms.submission.received", payload: { path: ["formId"], equals: f.id } } });
      chk(`R3.${label}.pos`, `${label}: notification insert forced to fail ⇒ submit throws · NO submission row · NO event (all rolled back together)`, !r.ok && s1 === s0 && e1 === 0, `ok=${r.ok} subs=${s1 - s0} events=${e1}`);
      const ok = await call(FM.submitPublicForm, f.publicToken, { name: "ปกติ", phone: phoneOf() });
      const e2 = await P.outboxEvent.count({ where: { tenantId: tid, idempotencyKey: `forms.sub.${ok.v?.id}` } });
      chk(`R3.${label}.neg`, `${label}: [control] normal submit ⇒ 1 submission + 1 event`, ok.ok && e2 === 1, ok.err);
    }
  }

  // ═══ ruling 4 — FORM_V1 takes the identity locks ⇒ same phone from 2 OS processes = 1 Party ═══
  console.log("── ruling 4 ──");
  const tsx = "node_modules/.bin/tsx";
  const runWorkers = async (tid: string, sys: string, kind: string, phones: [string, string], subsA: string[], subsB: string[]) => {
    const one = (phone: string, subs: string[]) =>
      new Promise<string>((res) => {
        const ch = spawn(tsx, ["scripts/pending/probe-c18-review.mts", "--worker", tid, sys, kind, phone, subs.join(",")], { env: process.env });
        let out = "";
        ch.stdout.on("data", (d) => (out += String(d)));
        ch.stderr.on("data", () => undefined);
        ch.on("close", () => res(out.match(/WORKER_RESULT (.*)/)?.[1] ?? "no result"));
      });
    return Promise.all([one(phones[0], subsA), one(phones[1], subsB)]);
  };
  const subsFor = async (tid: string, n: number) => {
    const f = await mkForm(tid);
    const out: string[] = [];
    for (let i = 0; i < n; i += 1) out.push((await P.formSubmission.create({ data: { tenantId: tid, formId: f.id, answersJson: {} } })).id);
    return out;
  };
  for (const [label, tid, sys, kind] of [["v1", tV1, crmV1, "FORM_V1"], ["v2", tV2, crmV2, "FORM"]] as const) {
    const phone = phoneOf();
    const subs = await subsFor(tid, 6);
    const w = await runWorkers(tid, sys, kind, [phone, phone], subs.slice(0, 3), subs.slice(3));
    const parties = await P.party.count({ where: { tenantId: tid, phoneNorm: phone } });
    const contacts = await P.crmContact.count({ where: { tenantId: tid, phone } });
    chk(`R4.${label}.pos`, `${label} (${kind}): 6 submissions, same phone, 2 OS processes × 3 in parallel ⇒ exactly 1 Party · contacts ${kind === "FORM_V1" ? "6 (v1 = one per submission)" : "1 (v2 dedupe)"}`,
      parties === 1 && contacts === (kind === "FORM_V1" ? 6 : 1) && w.every((x) => !x.includes("ERR")), `parties=${parties} contacts=${contacts} workers=${w.join(" | ")}`);
    const p1 = phoneOf();
    const p2 = phoneOf();
    const subs2 = await subsFor(tid, 2);
    await runWorkers(tid, sys, kind, [p1, p2], subs2.slice(0, 1), subs2.slice(1));
    const pp = (await P.party.count({ where: { tenantId: tid, phoneNorm: p1 } })) + (await P.party.count({ where: { tenantId: tid, phoneNorm: p2 } }));
    chk(`R4.${label}.neg`, `${label}: [control] two DIFFERENT phones from 2 processes ⇒ 2 Parties`, pp === 2, `parties=${pp}`);
  }

  // ═══ ruling 6 — crm.discount effect is retried on a transient failure, never lost, never duplicated ═══
  console.log("── ruling 6 ──");
  const STD = [{ name: "ใหม่", kind: "OPEN", probability: 10 }, { name: "ชนะ", kind: "WON", probability: 100 }, { name: "แพ้", kind: "LOST", probability: 0 }];
  const pendingDeal = async (tid: string, sys: string) => {
    const pipe = (await P.crmPipeline.create({ data: { tenantId: tid, systemId: sys, name: `ขาย ${nx()} ${TAG}`, stages: { create: STD.map((s, i) => ({ tenantId: tid, systemId: sys, sortOrder: i, ...s })) } }, include: { stages: true } })) as Any;
    const st = [...pipe.stages].sort((a: Any, b: Any) => a.sortOrder - b.sortOrder)[0].id;
    const k = await CRM.contacts.createContactFromLegacy({ tenantId: tid, systemId: sys }, { name: `ลูกค้าส่วนลด ${nx()}`, phone: phoneOf() });
    const req = `${TAG}-req-${nx()}`;
    const d = await P.crmDeal.create({ data: { tenantId: tid, systemId: sys, contactId: k.id, pipelineId: pipe.id, stageId: st, title: `ดีล ${nx()}`, valueSatang: 100_000, pendingLines: { lines: [{ name: "แพ็กเกจ", qty: 2, unitPriceSatang: 10_000, discountBp: 3000 }], discountBp: 0 }, pendingApprovalRequestId: req } });
    return { d: d.id as string, req };
  };
  for (const [label, tid, sys] of [["v2", tV2, crmV2], ["v1", tV1, crmV1]] as const) {
    await P.automationRule.create({ data: { tenantId: tid, name: `auto-appr ${TAG}`, event: "approval.request.approved", enabled: true, actionType: "NOTIFY", actionConfig: { title: `APPR-${TAG}` }, scope: "KANBAN" } });
    const a = await pendingDeal(tid, sys);
    const evt = synth(tid, "approval.request.approved", { entityType: "crm.discount", entityId: `${a.d}:s1`, requestId: a.req });
    let r1: Any;
    try {
      await failWrites(tid, "CrmDealLine");
      r1 = await consume(evt);
    } finally {
      await dropTriggers();
    }
    const notif = () => P.appNotification.count({ where: { tenantId: tid, title: { startsWith: "คำขออนุมัติผ่านแล้ว" }, body: { contains: a.req } } });
    const autoN = () => P.appNotification.count({ where: { tenantId: tid, title: `APPR-${TAG}` } });
    const n1 = await notif();
    const au1 = await autoN();
    chk(`R6.${label}.fail`, `${label}: deal-line insert forced to fail ⇒ the approval event FAILS for retry · the deal still waits for that request · no approval notification / automation yet`,
      !r1.ok && (await P.crmDeal.findUnique({ where: { id: a.d } })).pendingApprovalRequestId === a.req && n1 === 0 && au1 === 0, `ok=${r1.ok} notif=${n1} auto=${au1}`);
    const r2 = await consume(evt);
    const r3 = await consume(evt);
    const lines = await P.crmDealLine.count({ where: { dealId: a.d } });
    chk(`R6.${label}.retry`, `${label}: retry + one more redelivery ⇒ lines applied ONCE (1 line · pending cleared) · 1 approval notification · automation ran once per SUCCESSFUL delivery only (no run on the failed one)`,
      r2.ok && r3.ok && lines === 1 && (await P.crmDeal.findUnique({ where: { id: a.d } })).pendingApprovalRequestId === null && (await notif()) === 1 && (await autoN()) === 2,
      `${r2.err}${r3.err} lines=${lines} notif=${await notif()} auto=${await autoN()}`);
    const b = await pendingDeal(tid, sys);
    const rn = await consume(synth(tid, "approval.request.approved", { entityType: "crm.discount", entityId: `${b.d}:s1`, requestId: `${TAG}-other-request` }));
    chk(`R6.${label}.neg`, `${label}: [control] an approval for a request the deal is NOT waiting for ⇒ resolves · nothing applied`, rn.ok && (await P.crmDealLine.count({ where: { dealId: b.d } })) === 0, rn.err);
  }

  // ═══ ruling 7 — chat → PERSON Party only · ChatContact.partyId written through chat.linkChatContactParty (+ audit) ═══
  console.log("── ruling 7 ──");
  const mkChat = async (tid: string, chatSys: string, phone: string | null, partyId: string | null = null) => {
    const cc = await P.chatContact.create({ data: { tenantId: tid, systemId: chatSys, channel: "LINE", externalUserId: `${TAG}-u${nx()}`, displayName: `แชท ${nx()}`, phone, partyId } });
    const conv = await P.chatConversation.create({ data: { tenantId: tid, systemId: chatSys, channel: "LINE", contactId: cc.id, lastMessageAt: new Date(), lastMessagePreview: "สวัสดี" } });
    return { cc: cc.id as string, conv: conv.id as string };
  };
  const linkAudits = (tid: string, cc: string) => P.auditLog.count({ where: { tenantId: tid, action: "chat.contact.party.link", targetId: cc } });
  {
    const phone = phoneOf();
    const co = await P.party.create({ data: { tenantId: tV2, kind: "COMPANY", name: `บริษัทเบอร์ชน ${rand}`, phone, phoneNorm: phone } });
    const ch = await mkChat(tV2, chatV2, phone);
    const r = await consume(synth(tV2, "chat.message.received", { conversationId: ch.conv, channel: "LINE" }));
    const row = await P.chatContact.findUnique({ where: { id: ch.cc } });
    const pty = row?.partyId ? await P.party.findUnique({ where: { id: row.partyId } }) : null;
    chk("R7.v2.pos", "v2: chat contact whose phone matches a COMPANY Party ⇒ linked to a PERSON Party (never the company) · 1 audit row chat.contact.party.link · lead carries that Party",
      r.ok && !!pty && pty.kind === "PERSON" && pty.id !== co.id && (await linkAudits(tV2, ch.cc)) === 1 && (await P.crmContact.count({ where: { tenantId: tV2, partyId: pty.id } })) === 1,
      `${r.err} kind=${pty?.kind} same=${pty?.id === co.id} audits=${await linkAudits(tV2, ch.cc)}`);
    const pre = await P.party.create({ data: { tenantId: tV2, kind: "PERSON", name: `คนเดิม ${rand}` } });
    const ch2 = await mkChat(tV2, chatV2, phoneOf(), pre.id);
    const r2 = await consume(synth(tV2, "chat.message.received", { conversationId: ch2.conv, channel: "LINE" }));
    chk("R7.v2.neg", "v2: [control] chat contact that already has a Party ⇒ Party unchanged · no link audit", r2.ok && (await P.chatContact.findUnique({ where: { id: ch2.cc } })).partyId === pre.id && (await linkAudits(tV2, ch2.cc)) === 0, r2.err);
    const ch3 = await mkChat(tV1, chatV1, phoneOf());
    const r3 = await consume(synth(tV1, "chat.message.received", { conversationId: ch3.conv, channel: "LINE" }));
    chk("R7.v1", "v1: chat bridge skipped ⇒ ChatContact.partyId stays null · no audit · no lead", r3.ok && (await P.chatContact.findUnique({ where: { id: ch3.cc } })).partyId === null && (await linkAudits(tV1, ch3.cc)) === 0 && (await P.crmContact.count({ where: { tenantId: tV1, sourceKind: "CHAT" } })) === 0, r3.err);
  }

  // ═══ ruling 9 — memberCustomerId written by the contacts service (+ audit) · no raw prisma writes in platform/crm-bridges ═══
  console.log("── ruling 9 ──");
  {
    const src = ["core.ts", "forms.ts", "chat.ts", "index.ts"].map((f) => readFileSync(`src/lib/platform/crm-bridges/${f}`, "utf8")).join("\n");
    const raw = src.match(/(prisma|tx)\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b|\$executeRaw/g) ?? [];
    chk("R9.static", "[static] platform/crm-bridges has no raw prisma write (create/update/upsert/delete/$executeRaw) — reads only", raw.length === 0, raw.join(","));
    const linkAudit = (tid: string, id: string, action: string) => P.auditLog.count({ where: { tenantId: tid, action, targetId: id } });
    for (const [label, tid, sys, mem] of [["v2", tV2, crmV2, memV2], ["v1", tV1, crmV1, memV1]] as const) {
      const pid = (await P.party.create({ data: { tenantId: tid, kind: "PERSON", name: `สมาชิก ${label} ${rand}` } })).id;
      const k = (await P.crmContact.create({ data: { tenantId: tid, systemId: sys, name: `ผู้ติดต่อ ${label}`, firstName: "ก", partyId: pid } })).id;
      const other = (await P.customer.create({ data: { tenantId: tid, memberSystemId: mem, name: `อื่น ${label}`, memberCode: `${TAG}-o${nx()}` } })).id;
      const kLinked = (await P.crmContact.create({ data: { tenantId: tid, systemId: sys, name: `ผูกแล้ว ${label}`, firstName: "ข", partyId: pid, memberCustomerId: other } })).id;
      const cust = (await P.customer.create({ data: { tenantId: tid, memberSystemId: mem, name: `ใหม่ ${label}`, memberCode: `${TAG}-m${nx()}`, partyId: pid } })).id;
      const r = await consume(synth(tid, "member.created", { customerId: cust, partyId: pid, source: "WALK_IN", referrerId: null }));
      const a = (await P.crmContact.findUnique({ where: { id: k } })).memberCustomerId;
      const b = (await P.crmContact.findUnique({ where: { id: kLinked } })).memberCustomerId;
      if (label === "v2") {
        chk("R9.v2.link", "v2: member.created ⇒ contact linked through contacts.linkMemberFromBridge with ONE audit row crm.contact.member.link · already-linked contact untouched (no audit)",
          r.ok && a === cust && b === other && (await linkAudit(tid, k, "crm.contact.member.link")) === 1 && (await linkAudit(tid, kLinked, "crm.contact.member.link")) === 0, r.err);
        const keep = (await P.customer.create({ data: { tenantId: tid, memberSystemId: mem, name: `เก็บ ${label}`, memberCode: `${TAG}-k${nx()}` } })).id;
        await P.customer.update({ where: { id: cust }, data: { status: "MERGED", mergedIntoId: keep } });
        const r2 = await consume(synth(tid, "member.merged", { keepId: keep, mergedId: cust }));
        const r3 = await consume(synth(tid, "member.merged", { keepId: keep, mergedId: cust }));
        chk("R9.v2.repoint", "v2: member.merged (twice) ⇒ re-pointed to the kept member · exactly ONE audit row crm.contact.member.repoint",
          r2.ok && r3.ok && (await P.crmContact.findUnique({ where: { id: k } })).memberCustomerId === keep && (await linkAudit(tid, k, "crm.contact.member.repoint")) === 1, `${r2.err}${r3.err}`);
      } else {
        chk("R9.v1", "v1: member.created bridge skipped ⇒ contact stays unlinked · no audit row", r.ok && a === null && (await linkAudit(tid, k, "crm.contact.member.link")) === 0, r.err);
      }
    }
  }
} catch (e) {
  chk("FATAL", "probe ran to the end", false, e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : String(e));
} finally {
  await dropTriggers();
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  if (ids.length) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => 0);
    for (const id of ids) {
      await P.appSystemUnit.deleteMany({ where: { tenantId: id } }).catch(() => 0);
      await P.appSystem.deleteMany({ where: { tenantId: id } }).catch(() => 0);
      await P.businessUnit.deleteMany({ where: { tenantId: id } }).catch(() => 0);
      await P.tenant.delete({ where: { id } }).catch(() => 0);
    }
    const left = await P.tenant.count({ where: { id: { in: ids } } });
    const trig = ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname LIKE '${TRIG}%'`)) as Any[])[0]?.n ?? 0;
    chk("CLEAN", "throwaway tenants, rows and triggers gone", left === 0 && Number(trig) === 0, `tenants=${left} trig=${trig}`);
  }
  await prisma.$disconnect();
}
const passed = cks.filter((c) => c.ok).length;
console.log(`\n${passed === cks.length ? "🟢" : "🔴"} probe-c18-review: ${passed}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, findings: cks.filter((c) => !c.ok).map((c) => c.id) })}`);
process.exit(passed === cks.length ? 0 : 1);
