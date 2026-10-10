// C5.5-fix13 INDEPENDENT REVIEW round 2 (builder tip ff65c37a) — attacks on the round-2 changes. Own tenants `qc-cf18r2-*` ×2 on QC3; CLEAN.
//   A  RV13-2 role-mailbox rule: exact semantics through a real erase — personal local parts that CONTAIN a role word (sales.somchai ·
//      somchai.sales · hr-anan · ann.hr) are still tokens; role words with digits/separators/case (info2024 · Support_01) are not
//   B  RV13-1 scheduled-task delete: only mask-only tasks of THIS tenant; a task with other text is kept (masked); a pre-masked unrelated task kept
//   C  RV13-5 non-CRM proposals: other tenant untouched · a FINISHED proposal keeps its status · JSON-key collision keeps every value (` #2`)
//   D  executePlan write-back guard without any erase: the step note is still written (plain payload) · payload with an integer > 2^53
//      (JSON round trip changes it ⇒ guard sees "changed") — is the note lost?
//   E  public routes: response status/bytes identical for a valid first request and a garbage token (no new token oracle)
//   F  SEQ_TASK assignee chain: contact owner without a membership (left the shop) ⇒ no company text · unassigned contact ⇒ shop owner ⇒ name
// Run (QC3): bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//              bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf18/review/probe-cf18-review-r2.mts
// No drain is run (after() tasks counted only). "FINDING" = reviewer's expectation (RED = reproduced); "control" must be GREEN.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const host = accEnv.loadQcEnv().host;
if (!/ep-weathered-river/.test(String(host ?? "")) || !/ep-weathered-river/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.error(`probe-cf18-review-r2: QC3 only (host=${host})`);
  process.exit(4);
}
process.env.SHARK_AI_MOCK = "1";
delete process.env.SHARK_AI_KEY;
if (!process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = "re_qc_probe_dummy_key";
globalThis.fetch = (async () => {
  throw new Error("probe-cf18-review-r2: network blocked");
}) as typeof fetch;

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf18r2-${rand}`;
const MASK = "[ข้อมูลถูกลบ]";
const cks: { id: string; ok: boolean; finding: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string, finding = false) => {
  cks.push({ id, ok: !!ok, finding });
  console.log(`  ${ok ? "✅" : "❌"} [${id}]${finding ? " (FINDING)" : " (control)"} ${n}\n        — ACTUAL ${actual}`);
};
const info = (id: string, msg: string) => console.log(`  ℹ️  [${id}] ${msg}`);
const sub = async (id: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (e) {
    chk(id, "block ran", false, e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 600) : String(e));
  }
};
const j = (v: unknown) => JSON.stringify(v ?? null);
const cut = (v: unknown, n = 160) => {
  const s = String(v ?? "").replace(/\s+/g, " ");
  return s.length > n ? `${s.slice(0, n)}…` : s;
};
const has = (v: unknown, x: string) => (typeof v === "string" ? v : j(v)).includes(x);
const hex = () => randomBytes(12).toString("hex");
const phoneOf = () => `08${Array.from(randomBytes(8)).map((b) => String(b % 10)).join("")}`;

const AFTER: unknown[] = [];
const PENDING_KEY = Symbol.for("shark.core.after-drain.pendingSince");
const holder = globalThis as unknown as Record<symbol, number | undefined>;
async function inScope<T>(pathname: string, fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { "user-agent": "probe-cf18-review-r2", "x-forwarded-for": "203.0.113.198" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const afterContext = { after: (task: unknown) => { AFTER.push(task); } };
  const workStore = { route: pathname, page: `${pathname}/route`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [], afterContext };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}

let T = "";
let T2 = "";
let S = "";
const USERS: string[] = [];
const BUCKETS: string[] = [];

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const MEM = (await import("@/lib/modules/member" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const PLANS = (await import("@/lib/ai/plans" as string)) as Any;
  const R_ONE = (await import("../../../../src/app/u/[token]/one-click/route.ts" as string)) as Any;
  const R_NOT = (await import("../../../../src/app/u/[token]/no-track/route.ts" as string)) as Any;

  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  T2 = (await P.tenant.create({ data: { name: `${TAG}-2`, slug: `${TAG}-2` } })).id as string;
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix} ${TAG}` } });
    USERS.push(u.id);
    return u.id as string;
  };
  const MROW: Record<string, Any> = {};
  const owner = await mkUser("-owner");
  const staffA = await mkUser("-sa");
  const gone = await mkUser("-gone"); // never a member (left the shop)
  MROW[owner] = await P.membership.create({ data: { userId: owner, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  MROW[staffA] = await P.membership.create({ data: { userId: staffA, tenantId: T, role: "STAFF", unitAccess: ["*"], permissions: { "crm.contact.read": true, "crm.contact.create": true }, acceptedAt: new Date() } });
  const crmActor = (uid: string) => MEM.toMemberActor(uid, MROW[uid]);
  S = (await sysSvc.createSystem(T, "CRM", `${TAG} crm`)).id as string;
  await P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify({ uiVersion: 2, bridgesEnabled: true }),
    S,
  );
  const ctxOf = (uid: string) => ({ tenantId: T, systemId: S, actorUserId: uid });
  const coName = `บริษัทลับ ${TAG}`;
  const coParty = await P.party.create({ data: { tenantId: T, name: coName, kind: "COMPANY" } });
  const company = await P.crmCompany.create({ data: { tenantId: T, systemId: S, partyId: coParty.id, name: coName, ownerUserId: owner } });
  const mkContact = async (first: string, ownerUserId: string | null, phone: string, email: string, linked = false) => {
    const name = `${first} ${TAG}`;
    const party = await P.party.create({ data: { tenantId: T, name, kind: "PERSON", phone, email } });
    const k = await P.crmContact.create({ data: { tenantId: T, systemId: S, name, firstName: first, lastName: TAG, partyId: party.id, ownerUserId, phone, email, ...(linked ? { companyId: company.id, company: coName } : {}) } });
    if (linked) await P.crmCompanyContact.create({ data: { tenantId: T, companyId: company.id, contactId: k.id, isPrimary: true } });
    return k;
  };
  const erase = (k: Any) => CRM.privacy.eraseContact(ctxOf(owner), crmActor(owner), { contactId: k.id, confirm: true, reason: "ลูกค้าขอลบข้อมูล (review r2)" }, { del: async () => undefined });
  const exp = () => new Date(Date.now() + 86_400_000);
  const room = `u~${owner}~${hex()}`;
  await P.aiConversation.create({ data: { id: room, tenantId: T, title: "ห้องรีวิว r2" } });

  // ════════ A · RV13-2 exact matching semantics ════════
  console.log("\n── A role-mailbox local parts ──");
  await sub("A", async () => {
    const dom = `${rand}cust.qc.invalid`;
    const cases = [
      { local: "sales.somchai", personal: true },
      { local: "somchai.sales", personal: true },
      { local: "hr-anan", personal: true },
      { local: "ann.hr", personal: true },
      { local: "info2024", personal: false },
      { local: "Support_01", personal: false },
    ];
    const out: string[] = [];
    let personalOk = true;
    let roleOk = true;
    for (const c of cases) {
      const k = await mkContact(`คนเมล${c.local.replace(/[^a-z]/gi, "")}`, owner, phoneOf(), `${c.local}@${dom}`);
      const mem = await P.aiMemory.create({ data: { tenantId: T, content: `ติดต่อผ่าน ${c.local} ทางไลน์ ${TAG}` } });
      const er = await erase(k);
      const after = (await P.aiMemory.findUnique({ where: { id: mem.id }, select: { content: true } }))?.content as string;
      const masked = !has(after, c.local) && has(after, MASK);
      out.push(`${c.local}:${er?.erased ? "" : "!"}${masked ? "masked" : "kept"}`);
      if (c.personal && !masked) personalOk = false;
      if (!c.personal && masked) roleOk = false;
    }
    chk("A1", "control: personal local parts that contain a role word (sales.somchai · somchai.sales · hr-anan · ann.hr) are still masked", personalOk, j(out));
    chk("A2", "control: role words with digits / separators / capitals (info2024 · Support_01) are no longer standalone tokens", roleOk, j(out));
  });

  // ════════ B · RV13-1 scheduled-task delete scope ════════
  console.log("\n── B scheduled tasks ──");
  await sub("B", async () => {
    const phone = phoneOf();
    const x = await mkContact("งานประจำ", owner, phone, `task-${rand}@cust.qc.invalid`);
    const full = x.name as string;
    const tOnly = await P.aiScheduledTask.create({ data: { tenantId: T, instruction: `${full} ${phone}`, hourBkk: 3, active: false } });
    const tMix = await P.aiScheduledTask.create({ data: { tenantId: T, instruction: `ทุกเช้าสรุปยอด และเตือนโทรหา ${full}`, hourBkk: 3, active: false } });
    const tPre = await P.aiScheduledTask.create({ data: { tenantId: T, instruction: `${MASK} สรุปยอดขายรายวัน ${TAG}`, hourBkk: 3, active: false } });
    const t2 = await P.aiScheduledTask.create({ data: { tenantId: T2, instruction: `${full} ${phone}`, hourBkk: 3, active: false } });
    const er = await erase(x);
    const rows = (await P.aiScheduledTask.findMany({ where: { id: { in: [tOnly.id, tMix.id, tPre.id, t2.id] } }, select: { id: true, instruction: true } })) as Any[];
    const by = (id: string) => rows.find((r) => r.id === id);
    chk("B1", "control: mask-only task deleted · task with other text kept + masked · unrelated pre-masked task kept byte-identical · other tenant's task untouched",
      er?.erased === true && !by(tOnly.id) && !!by(tMix.id) && !has(by(tMix.id), full) && has(by(tMix.id)?.instruction, "ทุกเช้าสรุปยอด") && by(tPre.id)?.instruction === tPre.instruction && by(t2.id)?.instruction === t2.instruction,
      j(rows.map((r) => cut(r.instruction, 50))));
  });

  // ════════ C · RV13-5 non-CRM proposals ════════
  console.log("\n── C non-CRM proposals ──");
  await sub("C", async () => {
    const phone = phoneOf();
    const x = await mkContact("ข้อเสนอ", owner, phone, `prop-${rand}@cust.qc.invalid`);
    const full = x.name as string;
    const room2 = `u~${owner}~${hex()}`;
    await P.aiConversation.create({ data: { id: room2, tenantId: T2, title: "อีกร้าน" } });
    const p2 = await P.aiProposal.create({ data: { tenantId: T2, conversationId: room2, kind: "booking_create_appointment", summary: `นัด ${full}`, payload: { phone }, expiresAt: exp() } });
    const done = await P.aiProposal.create({ data: { tenantId: T, conversationId: room, kind: "booking_create_appointment", status: "EXECUTED", summary: `นัด ${full}`, resultNote: `นัดแล้ว ${phone}`, payload: { notes: { [full]: "a", [MASK]: "b", [`${MASK} #2`]: "c" }, phone }, expiresAt: exp(), executedAt: new Date() } });
    await erase(x);
    const p2a = await P.aiProposal.findUnique({ where: { id: p2.id }, select: { status: true, summary: true, payload: true } });
    const da = await P.aiProposal.findUnique({ where: { id: done.id }, select: { status: true, summary: true, resultNote: true, payload: true } });
    const vals = Object.values((da?.payload as Any)?.notes ?? {}).sort();
    chk("C1", "control: other tenant's PENDING proposal with the same tokens is untouched (status + text)", p2a?.status === "PENDING" && p2a?.summary === p2.summary && j(p2a?.payload) === j(p2.payload), j(p2a));
    chk("C2", "control: a finished (EXECUTED) proposal keeps its status; summary/resultNote/payload masked; key collisions keep all 3 values", da?.status === "EXECUTED" && !has(da, full) && !has(da, phone) && j(vals) === j(["a", "b", "c"]), cut(j(da), 260));
  });

  // ════════ D · executePlan write-back guard without an erase ════════
  console.log("\n── D executePlan guard (no erase) ──");
  await sub("D", async () => {
    const m = { role: "OWNER", unitAccess: ["*"], permissions: {} };
    const plain = await P.aiPlan.create({ data: { tenantId: T, conversationId: room, title: `แผนธรรมดา ${TAG}`, expiresAt: exp(), stepsJson: [{ kind: "qc_unknown_kind", summary: "ขั้นเดียว", payload: { n: 1, s: "x", nested: { b: 2, a: 1 } }, status: "PENDING" }] } });
    const r1 = await PLANS.executePlan(m, { tenantId: T }, plain.id, { userId: owner });
    const a1 = await P.aiPlan.findUnique({ where: { id: plain.id }, select: { status: true, stepsJson: true } });
    const s1 = (a1?.stepsJson as Any[])?.[0];
    chk("D1", "control: no erase — the step's FAILED status AND its note are written back (guarded write path)", a1?.status === "FAILED" && s1?.status === "FAILED" && typeof s1?.note === "string" && s1.note.length > 0, `run=${cut(j(r1), 100)} step=${cut(j(s1), 160)}`);
    // integer beyond 2^53 — Prisma reads it as a JS number (precision lost), so the snapshot differs from the stored jsonb
    const big = await P.$queryRawUnsafe(
      `INSERT INTO "AiPlan" ("id","tenantId","conversationId","title","status","hasDestructive","stepsJson","expiresAt","createdAt") VALUES ($1,$2,$3,$4,'PENDING',false,$5::jsonb,$6,now()) RETURNING "id"`,
      `cqr2${hex()}`, T, room, `แผนเลขใหญ่ ${TAG}`, `[{"kind":"qc_unknown_kind","summary":"ขั้นเลขใหญ่","payload":{"ref":12345678901234567891},"status":"PENDING"}]`, exp(),
    ) as Any[];
    const bigId = big[0].id as string;
    await PLANS.executePlan(m, { tenantId: T }, bigId, { userId: owner });
    const raw = (await P.$queryRawUnsafe(`SELECT "status", "stepsJson"::text AS s FROM "AiPlan" WHERE "id" = $1`, bigId)) as Any[];
    const s2 = JSON.parse(raw[0].s)[0];
    info("D2", `payload integer > 2^53: status=${raw[0].status} step.status=${s2?.status} note=${j(s2?.note ?? null)} stored ref=${raw[0].s.match(/"ref": ?(\d+)/)?.[1]} (pre-existing precision loss on any write-back; the guard falls back to status-only when the round trip changes the number)`);
  });

  // ════════ E · public route bytes ════════
  console.log("\n── E route bytes valid vs garbage ──");
  await sub("E", async () => {
    const email = `route-${rand}@cust.qc.invalid`;
    const k = await mkContact("ลูกค้าลิงก์", owner, phoneOf(), email);
    const inRow = await P.crmEmailMessage.create({ data: { tenantId: T, systemId: S, contactId: k.id, direction: "IN", messageId: `${S}:${TAG}-in@cust.qc.invalid`, threadKey: randomBytes(16).toString("hex"), fromAddr: email, toAddrs: [`crm@${TAG}.qc.invalid`], subject: `สอบถาม ${TAG}`, bodyText: "สอบถาม", status: "RECEIVED", receivedAt: new Date(), trackTokenHash: hex() } });
    const sent: Any[] = [];
    await CRM.emails.sendEmail(ctxOf(owner), crmActor(owner), { contactId: k.id, replyToEmailId: inRow.id, subject: `Re: ${TAG}`, bodyText: "ตอบกลับค่ะ" }, { transport: async (mm: Any) => { sent.push(mm); return { ok: true, id: `qc-${rand}` }; } });
    const utok = (j(sent).match(/\/u\/([A-Za-z0-9_.~-]+)/) ?? [])[1] ?? "";
    const garbage = `zz${hex()}`;
    const ip = "203.0.113.198";
    for (const t of [utok, garbage]) BUCKETS.push(...(CRM.emails.trackRateKeys("u", { ip, token: t }) as string[]));
    const call = async (fn: () => Promise<Response>, path: string) => {
      holder[PENDING_KEY] = undefined;
      const n0 = AFTER.length;
      const res = await inScope(path, fn);
      return { n: AFTER.length - n0, status: res.status, headers: j([...res.headers.entries()].sort()), body: await res.text() };
    };
    const nt = (t: string) => () => R_NOT.POST(new Request(`http://qc.local/u/${t}/no-track`, { method: "POST", headers: { "user-agent": "probe-cf18-review-r2" } }), { params: Promise.resolve({ token: t }) });
    const oc = (t: string) => () => R_ONE.POST(new Request(`http://qc.local/u/${t}/one-click`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip }, body: "List-Unsubscribe=One-Click" }), { params: Promise.resolve({ token: t }) });
    const ntV = await call(nt(utok), "/u/v/no-track");
    const ntG = await call(nt(garbage), "/u/g/no-track");
    const ocV = await call(oc(utok), "/u/v/one-click");
    const ocG = await call(oc(garbage), "/u/g/one-click");
    const ocV2 = await call(oc(utok), "/u/v/one-click");
    chk("E0", "control (premise): the sent mail carries a /u token; the valid first requests flipped (one wake each), garbage none, repeat none", !!utok && ntV.n === 1 && ocV.n === 1 && ntG.n === 0 && ocG.n === 0 && ocV2.n === 0, `wakes nt=${ntV.n}/${ntG.n} oc=${ocV.n}/${ocG.n} oc#2=${ocV2.n}`);
    chk("E1", "control: status + headers + body identical for a valid (flipping) request and a garbage token on both /u routes (no new token oracle)", ntV.status === ntG.status && ntV.headers === ntG.headers && ntV.body === ntG.body && ocV.status === ocG.status && ocV.headers === ocG.headers && ocV.body === ocG.body && ocV2.body === ocG.body, `nt ${ntV.status}/${ntG.status} oc ${ocV.status}/${ocG.status}`);
  });

  // ════════ F · SEQ_TASK assignee chain ════════
  console.log("\n── F SEQ_TASK assignee chain ──");
  await sub("F", async () => {
    const yGone = await mkContact("ลูกค้าคนออก", gone, phoneOf(), `gone-${rand}@cust.qc.invalid`, true);
    const yNone = await mkContact("ลูกค้าไม่มีเจ้าของ", null, phoneOf(), `none-${rand}@cust.qc.invalid`, true);
    const seq = await CRM.sequences.createSequence(ctxOf(owner), crmActor(owner), { name: `ลำดับ r2 ${TAG}`, businessDaysOnly: false, steps: [{ kind: "TASK", taskTitle: "โทรหาฝ่ายจัดซื้อ {{contact.companyName}}", taskType: "CALL" }] });
    for (const k of [yGone, yNone]) await CRM.sequences.enroll(ctxOf(owner), crmActor(owner), { sequenceId: seq.id, contactId: k.id });
    await CRM.sequences.runDue(new Date(Date.now() + 120_000), { tenantIds: [T] });
    const tasks = (await P.crmActivity.findMany({ where: { tenantId: T, contactId: { in: [yGone.id, yNone.id] }, sourceRef: { startsWith: "seq:" } }, select: { contactId: true, title: true, ownerUserId: true } })) as Any[];
    const tG = tasks.find((t) => t.contactId === yGone.id);
    const tN = tasks.find((t) => t.contactId === yNone.id);
    chk("F1", "control: contact owner who is no longer a member ⇒ task title has no company text", !!tG && tG.ownerUserId === gone && !has(tG.title, coName) && has(tG.title, "โทรหาฝ่ายจัดซื้อ"), j(tG));
    chk("F2", "control: unassigned contact ⇒ shop OWNER is the assignee and sees the company name", !!tN && tN.ownerUserId === owner && has(tN.title, coName), j(tN));
  });
} finally {
  await new Promise((r) => setTimeout(r, 1_000));
  const left: string[] = [];
  const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[])
    .map((r) => String(r.table_name))
    .filter((t) => /^[A-Za-z_]+$/.test(t));
  for (const TT of [T, T2].filter(Boolean)) {
    await P.opsEvent.deleteMany({ where: { tenantId: TT } }).catch(() => undefined);
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, TT).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: TT } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: TT } }).catch(() => undefined);
    for (const t of tables) {
      const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, TT).catch(() => [{ n: 0 }])) as Any[];
      if (Number(r?.[0]?.n ?? 0) > 0) left.push(`${t}=${r[0].n}`);
    }
  }
  for (const k of [T, S].filter(Boolean)) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${k}%`).catch(() => undefined);
  if (BUCKETS.length) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" = ANY($1::text[])`, BUCKETS).catch(() => undefined);
  for (const uid of USERS) {
    await P.appNotification.deleteMany({ where: { recipientUserId: uid } }).catch(() => undefined);
    await P.session.deleteMany({ where: { userId: uid } }).catch(() => undefined);
    await P.membership.deleteMany({ where: { userId: uid } }).catch(() => undefined);
    await P.user.delete({ where: { id: uid } }).catch(() => undefined);
  }
  const buckets = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE "key" = ANY($1::text[]) OR "key" LIKE ANY($2::text[])`, BUCKETS, [T, S].filter(Boolean).map((s) => `%${s}%`))) as Any[])[0]?.n ?? 0);
  if (T) chk("CLEAN", "throwaway tenants, users, system rows and rate buckets removed (0 rows left)", left.length === 0 && buckets === 0 && (await P.tenant.count({ where: { id: { in: [T, T2].filter(Boolean) } } })) === 0 && (await P.user.count({ where: { id: { in: USERS } } })) === 0, `${left.join(" · ") || "-"} buckets=${buckets}`);
  await prisma.$disconnect();
}
const controls = cks.filter((c) => !c.finding);
const findings = cks.filter((c) => c.finding);
console.log(`\ncontrols ${controls.filter((c) => c.ok).length}/${controls.length} green · findings reproduced (RED) ${findings.filter((c) => !c.ok).length}/${findings.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ controls: controls.map((c) => [c.id, c.ok]), findings: findings.map((c) => [c.id, c.ok ? "NOT-REPRODUCED" : "REPRODUCED"]) })}`);
process.exit(controls.every((c) => c.ok) ? 0 : 1);
