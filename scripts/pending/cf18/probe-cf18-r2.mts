// C5.5-fix13 round 2 probe (card cf18 · review rulings) — RED on 1377bb9a · GREEN on the fix. Own throwaway tenants `qc-cf18-*` on QC3; CLEAN.
//   S1 RV13-1  erase masks AiScheduledTask.instruction · mask-only task deleted · other tenant untouched
//   S2 RV13-2  role-word e-mail local part (`support@…`) is no erase token on its own · the full address still is · a personal local part still is
//   S3 RV13-3  public routes wake the outbox only on a real write (garbage token: no after(); real first write: one; repeat: none)
//   S4 RV13-5  non-CRM AI proposals naming the person: masked; PENDING → EXPIRED; finished keep status
//   S5 RV13-4  `081-2345678` spelling masked (memory + AI message) · token as a JSON key masked in plan steps, colliding keys kept apart
//   S6 RV13-7  confirmProposalById answers a hidden chat-room row exactly like an unknown id
//   S7 owner Q4  SEQ_TASK title renders {{contact.companyName}} by the ASSIGNEE's company visibility (hidden ⇒ "")
//   S8 RUNNING-plan race: an erase that lands while executePlan runs is not undone by its write-back
// Run (QC3): bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//              bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf18/probe-cf18-r2.mts
// The probe never runs a drain (after() tasks are counted, not executed).
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const host = accEnv.loadQcEnv().host;
if (!/ep-weathered-river/.test(String(host ?? "")) || !/ep-weathered-river/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.error(`probe-cf18-r2: QC3 only (host=${host})`);
  process.exit(4);
}
process.env.SHARK_AI_MOCK = "1";
delete process.env.SHARK_AI_KEY;
if (!process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = "re_qc_probe_dummy_key";
globalThis.fetch = (async () => {
  throw new Error("probe-cf18-r2: network blocked");
}) as typeof fetch;

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf18-${rand}`;
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// request scope whose after() only COUNTS the task (never runs it — no drain from this probe)
const AFTER: unknown[] = [];
const PENDING_KEY = Symbol.for("shark.core.after-drain.pendingSince");
const holder = globalThis as unknown as Record<symbol, number | undefined>;
async function inScope<T>(pathname: string, fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { "user-agent": "probe-cf18-r2", "x-forwarded-for": "203.0.113.177" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const afterContext = { after: (task: unknown) => { AFTER.push(task); } };
  const workStore = { route: pathname, page: `${pathname}/route`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [], afterContext };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}

let T = "";
let T2 = "";
const USERS: string[] = [];
const BUCKETS: string[] = [];

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const MEM = (await import("@/lib/modules/member" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const tools = (await import("@/lib/ai/tools" as string)) as Any;
  const ACT = (await import("@/lib/ai/actor" as string)) as Any;
  const PLANS = (await import("@/lib/ai/plans" as string)) as Any;
  const R_ONE = (await import("../../../src/app/u/[token]/one-click/route.ts" as string)) as Any;
  const R_NOT = (await import("../../../src/app/u/[token]/no-track/route.ts" as string)) as Any;
  const R_O = (await import("../../../src/app/t/o/[token]/route.ts" as string)) as Any;

  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  T2 = (await P.tenant.create({ data: { name: `${TAG}-2`, slug: `${TAG}-2` } })).id as string;
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix} ${TAG}` } });
    USERS.push(u.id);
    return u.id as string;
  };
  const ROLE: Record<string, string> = {};
  const PERM: Record<string, Record<string, boolean>> = {};
  const MROW: Record<string, Any> = {};
  const member = async (uid: string, role: string, permissions: Record<string, boolean>) => {
    ROLE[uid] = role;
    PERM[uid] = permissions;
    MROW[uid] = await P.membership.create({ data: { userId: uid, tenantId: T, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
  };
  const owner = await mkUser("-owner");
  const staffA = await mkUser("-sa");
  const staffB = await mkUser("-sb");
  await member(owner, "OWNER", {});
  await member(staffA, "STAFF", { "ai.chat.send": true, "crm.contact.read": true, "crm.contact.create": true, "crm.activity.read": true });
  await member(staffB, "STAFF", { "ai.chat.send": true, "crm.contact.read": true, "crm.contact.create": true });
  const act = (uid: string) => ACT.aiMemberActor(T, uid, { role: ROLE[uid], unitAccess: ["*"], permissions: PERM[uid] });
  const crmActor = (uid: string) => MEM.toMemberActor(uid, MROW[uid]);
  const doorActor = (uid: string) => ({ userId: uid, role: ROLE[uid], unitAccess: ["*"], permissions: PERM[uid] });
  const S = (await sysSvc.createSystem(T, "CRM", `${TAG} crm`)).id as string;
  await P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify({ uiVersion: 2, bridgesEnabled: true }),
    S,
  );
  await P.aiCreditWallet.create({ data: { tenantId: T, balanceMicro: 50_000_000, grantedAt: new Date() } });
  const ctxOf = (uid: string) => ({ tenantId: T, systemId: S, actorUserId: uid });
  const coName = `บริษัทลับ ${TAG}`;
  const coParty = await P.party.create({ data: { tenantId: T, name: coName, kind: "COMPANY" } });
  const company = await P.crmCompany.create({ data: { tenantId: T, systemId: S, partyId: coParty.id, name: coName, ownerUserId: owner } });
  const mkContact = async (first: string, ownerUserId: string, phone: string, email: string, link: boolean) => {
    const name = `${first} ${TAG}`;
    const party = await P.party.create({ data: { tenantId: T, name, kind: "PERSON", phone, email } });
    const k = await P.crmContact.create({ data: { tenantId: T, systemId: S, name, firstName: first, lastName: TAG, partyId: party.id, ownerUserId, phone, email, ...(link ? { companyId: company.id, company: coName } : {}) } });
    if (link) await P.crmCompanyContact.create({ data: { tenantId: T, companyId: company.id, contactId: k.id, isPrimary: true } });
    return k;
  };
  const erase = (k: Any, batch?: number) => CRM.privacy.eraseContact(ctxOf(owner), crmActor(owner), { contactId: k.id, confirm: true, reason: "ลูกค้าขอลบข้อมูล (probe cf18 r2)" }, { del: async () => undefined, ...(batch ? { batch } : {}) });
  const exp = () => new Date(Date.now() + 86_400_000);

  // ════════ S1/S2/S4/S5 · one erase, many tables ════════
  console.log("\n── S1/S2/S4/S5 erase rules ──");
  await sub("S", async () => {
    const phone = phoneOf();
    const dash37 = `${phone.slice(0, 3)}-${phone.slice(3)}`;
    const email = `support@${rand}cust.qc.invalid`; // role local part
    const email2 = `somying.k${rand}@cust.qc.invalid`; // personal local part (previous e-mail)
    const x = await mkContact("สมหญิง", staffA, phone, email, false);
    await P.crmContact.update({ where: { id: x.id }, data: { previousEmails: [email2] } });
    const fullName = x.name as string;
    const PERSON = [phone, fullName, email, dash37];
    const tokensOf = (v: unknown) => PERSON.filter((tk) => has(v, tk));
    const room = `u~${staffA}~${hex()}`;
    await P.aiConversation.create({ data: { id: room, tenantId: T, title: "ห้อง r2" } });
    // S1 scheduled tasks
    const task = await P.aiScheduledTask.create({ data: { tenantId: T, instruction: `ทุกเช้าเตือนให้โทรหา ${fullName} ที่เบอร์ ${phone}`, hourBkk: 3, active: false } });
    const taskOnly = await P.aiScheduledTask.create({ data: { tenantId: T, instruction: `${fullName} ${phone}`, hourBkk: 4, active: false } });
    const taskOther = await P.aiScheduledTask.create({ data: { tenantId: T, instruction: `สรุปยอดขายทุกเช้า ${TAG}`, hourBkk: 5, active: false } });
    const task2 = await P.aiScheduledTask.create({ data: { tenantId: T2, instruction: `โทรหา ${fullName} ${phone}`, hourBkk: 3, active: false } });
    // S2 role word vs address vs personal local part
    const mSupport = await P.aiMemory.create({ data: { tenantId: T, content: `ลูกค้าส่วนใหญ่ติดต่อทีม support ทางไลน์ ${TAG}` } });
    const msgSupport = await P.aiMessage.create({ data: { tenantId: T, conversationId: room, role: "USER", content: `แจ้งทีม support ว่าระบบช้า ${TAG}` } });
    const mAddr = await P.aiMemory.create({ data: { tenantId: T, content: `ส่งเอกสารไปที่ ${email} ด้วย` } });
    const local2 = email2.split("@")[0]!;
    const mLocal2 = await P.aiMemory.create({ data: { tenantId: T, content: `ไลน์ไอดีลูกค้า ${local2} ${TAG}` } });
    // S5 phone 3-7 + JSON key
    const mDash = await P.aiMemory.create({ data: { tenantId: T, content: `โทรกลับ ${dash37} ${TAG}` } });
    const msgDash = await P.aiMessage.create({ data: { tenantId: T, conversationId: room, role: "USER", content: `เบอร์ใหม่ ${dash37}` } });
    const pKey = await P.aiPlan.create({
      data: { tenantId: T, conversationId: room, title: `โน้ต ${TAG}`, status: "DONE", expiresAt: exp(), stepsJson: [{ kind: "booking_create_appointment", summary: "โน้ต", payload: { notes: { [fullName]: "vip", [MASK]: "เดิม" } }, status: "DONE" }] },
    });
    // S4 non-CRM proposals
    const propP = await P.aiProposal.create({ data: { tenantId: T, conversationId: room, kind: "booking_create_appointment", summary: `นัด ${fullName} โทร ${phone}`, payload: { customerName: fullName, phone }, expiresAt: exp() } });
    const propD = await P.aiProposal.create({ data: { tenantId: T, conversationId: room, kind: "booking_create_appointment", status: "EXECUTED", summary: "นัดลูกค้า", resultNote: `นัด ${fullName} แล้ว`, payload: { phone }, expiresAt: exp(), executedAt: new Date() } });
    const propU = await P.aiProposal.create({ data: { tenantId: T, conversationId: room, kind: "booking_create_appointment", summary: `นัดคนอื่น ${TAG}`, payload: { customerName: `คนอื่น ${TAG}` }, expiresAt: exp() } });

    const er = await erase(x, 2);
    chk("S0.1", "control: erase succeeded", er?.erased === true, `counts=${cut(j(er?.counts), 200)}`);
    const tA = await P.aiScheduledTask.findUnique({ where: { id: task.id }, select: { instruction: true, active: true } });
    const tO = await P.aiScheduledTask.findUnique({ where: { id: taskOnly.id } });
    const tX = await P.aiScheduledTask.findUnique({ where: { id: taskOther.id }, select: { instruction: true } });
    const t2 = await P.aiScheduledTask.findUnique({ where: { id: task2.id }, select: { instruction: true } });
    chk("S1.1", "FINDING (RV13-1): the scheduled task's instruction no longer holds the name/phone (masked in place, rest kept)", tA && tokensOf(tA).length === 0 && has(tA.instruction, MASK) && has(tA.instruction, "ทุกเช้าเตือนให้โทรหา"), j(tA), true);
    chk("S1.2", "FINDING (RV13-1): a task whose instruction was only the person is deleted (same rule as mask-only memories)", tO === null, j(tO), true);
    chk("S1.3", "control: unrelated task and the other tenant's task untouched", tX?.instruction === `สรุปยอดขายทุกเช้า ${TAG}` && t2?.instruction === `โทรหา ${fullName} ${phone}`, `${j(tX)} ${j(t2)}`);
    const ms = await P.aiMemory.findUnique({ where: { id: mSupport.id }, select: { content: true } });
    const mm = await P.aiMessage.findUnique({ where: { id: msgSupport.id }, select: { content: true } });
    chk("S2.1", "FINDING (RV13-2): the role local part 'support' is not an erase token — unrelated memory and AI message keep 'ทีม support'", has(ms?.content, "ทีม support") && has(mm?.content, "ทีม support"), `memory=${j(ms?.content)} msg=${j(mm?.content)}`, true);
    const ma = await P.aiMemory.findUnique({ where: { id: mAddr.id }, select: { content: true } });
    const ml = await P.aiMemory.findUnique({ where: { id: mLocal2.id }, select: { content: true } });
    chk("S2.2", "control: the FULL role address is still masked, and a personal local part (previous e-mail) still is a token", !has(ma?.content, email) && has(ma?.content, MASK) && !has(ml?.content, local2) && has(ml?.content, MASK), `addr=${j(ma?.content)} local=${j(ml?.content)}`);
    const md = await P.aiMemory.findUnique({ where: { id: mDash.id }, select: { content: true } });
    const gd = await P.aiMessage.findUnique({ where: { id: msgDash.id }, select: { content: true } });
    chk("S5.1", "FINDING (RV13-4): the 081-2345678 spelling is masked in memories and AI messages", !has(md?.content, dash37) && !has(gd?.content, dash37) && has(md?.content, MASK), `memory=${j(md?.content)} msg=${j(gd?.content)}`, true);
    const pk = await P.aiPlan.findUnique({ where: { id: pKey.id }, select: { status: true, stepsJson: true } });
    const notes = Array.isArray(pk?.stepsJson) ? pk.stepsJson[0]?.payload?.notes : null;
    chk("S5.2", "FINDING (RV13-4): a token used as a JSON key in plan steps is masked; a colliding key is kept apart (no value lost); status kept", !has(pk, fullName) && notes && Object.keys(notes).length === 2 && Object.values(notes).includes("vip") && Object.values(notes).includes("เดิม") && pk?.status === "DONE", cut(j(pk), 220), true);
    const pP = await P.aiProposal.findUnique({ where: { id: propP.id }, select: { status: true, summary: true, payload: true } });
    const pD = await P.aiProposal.findUnique({ where: { id: propD.id }, select: { status: true, resultNote: true, payload: true } });
    const pU = await P.aiProposal.findUnique({ where: { id: propU.id }, select: { status: true, summary: true } });
    chk("S4.1", "FINDING (RV13-5): a PENDING non-CRM proposal naming the person is masked (summary + payload) and EXPIRED", pP?.status === "EXPIRED" && tokensOf(pP).length === 0 && has(pP, MASK), j(pP), true);
    chk("S4.2", "FINDING (RV13-5): a finished non-CRM proposal is masked (resultNote + payload) and keeps EXECUTED", pD?.status === "EXECUTED" && tokensOf(pD).length === 0 && has(pD, MASK), j(pD), true);
    chk("S4.3", "control: an unrelated pending proposal is untouched", pU?.status === "PENDING" && pU?.summary === `นัดคนอื่น ${TAG}`, j(pU));
  });

  // ════════ S3 · RV13-3 wake only on a real write ════════
  console.log("\n── S3 public-route wakes ──");
  await sub("S3", async () => {
    const garbage = `zz${hex()}`;
    const ip = "203.0.113.177";
    for (const r of ["o", "c", "u"] as const) BUCKETS.push(...(CRM.emails.trackRateKeys(r, { ip, token: garbage }) as string[]));
    const count = async (path: string, fn: () => Promise<Response>) => {
      holder[PENDING_KEY] = undefined;
      const n0 = AFTER.length;
      const res = await inScope(path, fn);
      return { n: AFTER.length - n0, status: res.status };
    };
    const postNT = (tok: string) => count(`/u/${tok}/no-track`, () => R_NOT.POST(new Request(`http://qc.local/u/${tok}/no-track`, { method: "POST", headers: { "user-agent": "probe-cf18-r2" } }), { params: Promise.resolve({ token: tok }) }));
    const postOC = (tok: string) => count(`/u/${tok}/one-click`, () => R_ONE.POST(new Request(`http://qc.local/u/${tok}/one-click`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip }, body: "List-Unsubscribe=One-Click" }), { params: Promise.resolve({ token: tok }) }));
    const getO = (tok: string) => count(`/t/o/${tok}.gif`, () => R_O.GET(new Request(`http://qc.local/t/o/${tok}.gif`, { headers: { "user-agent": "Mozilla/5.0 probe", "x-forwarded-for": ip } }), { params: Promise.resolve({ token: `${tok}.gif` }) }));
    const gNT = await postNT(garbage);
    const gOC = await postOC(garbage);
    const gO = await getO(garbage);
    chk("S3.1", "FINDING (RV13-3): garbage tokens on /u no-track, /u one-click and /t/o schedule no drain", gNT.n === 0 && gOC.n === 0 && gO.n === 0, `no-track=${gNT.n} one-click=${gOC.n} open=${gO.n}`, true);
    // a real mail: open (once), then no-track twice, one-click twice
    const email = `real-${rand}@cust.qc.invalid`;
    const k = await mkContact("เมลจริง", owner, phoneOf(), email, false);
    const inRow = await P.crmEmailMessage.create({ data: { tenantId: T, systemId: S, contactId: k.id, direction: "IN", messageId: `${S}:${TAG}-in@cust.qc.invalid`, threadKey: hex(), fromAddr: email, toAddrs: [`crm@${TAG}.qc.invalid`], subject: `ถาม ${TAG}`, bodyText: "ถาม", status: "RECEIVED", receivedAt: new Date(), trackTokenHash: hex() } });
    const sent: Any[] = [];
    const r = await CRM.emails.sendEmail(ctxOf(owner), crmActor(owner), { contactId: k.id, replyToEmailId: inRow.id, subject: `Re: ${TAG}`, bodyText: "ตอบค่ะ" }, { transport: async (m: Any) => { sent.push(m); return { ok: true, id: `qc-${rand}` }; } });
    const html = j(sent);
    const uTok = (html.match(/\/u\/([A-Za-z0-9_.~-]+)/) ?? [])[1] ?? "";
    const oTok = (html.match(/\/t\/o\/([A-Za-z0-9_.~-]+?)\.gif/) ?? [])[1] ?? "";
    await P.$executeRawUnsafe(`UPDATE "CrmEmailMessage" SET "sentAt" = now() - interval '1 minute', "createdAt" = now() - interval '1 minute' WHERE "id" = $1`, r.emailId);
    for (const tk of [uTok, oTok].filter(Boolean)) for (const rr of ["o", "u"] as const) BUCKETS.push(...(CRM.emails.trackRateKeys(rr, { ip, token: tk }) as string[]));
    const rO = oTok ? await getO(oTok) : { n: -1, status: 0 };
    const rNT1 = await postNT(uTok);
    const rNT2 = await postNT(uTok);
    const rOC1 = await postOC(uTok);
    const rOC2 = await postOC(uTok);
    chk("S3.2", "control: real writes still wake — a counted open, the first no-track, the first one-click: one drain each", rO.n === 1 && rNT1.n === 1 && rOC1.n === 1, `open=${rO.n} noTrack#1=${rNT1.n} oneClick#1=${rOC1.n} tokens u=${!!uTok} o=${!!oTok}`);
    chk("S3.3", "FINDING (RV13-3): repeating no-track / one-click on an already-flipped contact writes nothing and schedules no drain", rNT2.n === 0 && rOC2.n === 0, `noTrack#2=${rNT2.n} oneClick#2=${rOC2.n}`, true);
    holder[PENDING_KEY] = undefined;
  });

  // ════════ S6 · RV13-7 confirmProposalById parity ════════
  console.log("\n── S6 confirmProposalById parity ──");
  await sub("S6", async () => {
    const roomA = `u~${staffA}~${hex()}`;
    await P.aiConversation.create({ data: { id: roomA, tenantId: T, title: "ห้อง A" } });
    await tools.runTool({ tenantId: T, actor: act(staffA), conversationId: roomA }, "crm_create_lead", { name: `ลีด ${TAG}`, phone: phoneOf() });
    const p = await P.aiProposal.findFirst({ where: { tenantId: T, conversationId: roomA, status: "PENDING" }, select: { id: true, kind: true } });
    const hid = await CRM.aiBridges.confirmProposalById(T, doorActor(staffB), p?.id ?? "-");
    const ghost = await CRM.aiBridges.confirmProposalById(T, doorActor(staffB), `c${hex()}`);
    chk("S6.1", "FINDING (RV13-7): confirmProposalById answers a hidden chat-room row byte-identically to an unknown id", !!p && j(hid) === j(ghost), `hidden=${j(hid)} ghost=${j(ghost)}`, true);
  });

  // ════════ S7 · owner Q4 SEQ_TASK by assignee ════════
  console.log("\n── S7 SEQ_TASK company text by assignee ──");
  await sub("S7", async () => {
    const yA = await mkContact("ลูกค้าเอ", staffA, phoneOf(), `ya-${rand}@cust.qc.invalid`, true); // assignee A cannot see the company
    const yO = await mkContact("ลูกค้าโอ", owner, phoneOf(), `yo-${rand}@cust.qc.invalid`, true); // assignee OWNER sees it
    const seq = await CRM.sequences.createSequence(ctxOf(owner), crmActor(owner), { name: `ลำดับ ${TAG}`, businessDaysOnly: false, steps: [{ kind: "TASK", taskTitle: "โทรหาฝ่ายจัดซื้อ {{contact.companyName}}", taskType: "CALL" }] });
    for (const k of [yA, yO]) await CRM.sequences.enroll(ctxOf(owner), crmActor(owner), { sequenceId: seq.id, contactId: k.id });
    await CRM.sequences.runDue(new Date(Date.now() + 120_000), { tenantIds: [T] });
    const tasks = (await P.crmActivity.findMany({ where: { tenantId: T, contactId: { in: [yA.id, yO.id] }, sourceRef: { startsWith: "seq:" } }, select: { contactId: true, title: true, ownerUserId: true } })) as Any[];
    const tA = tasks.find((t) => t.contactId === yA.id);
    const tO = tasks.find((t) => t.contactId === yO.id);
    chk("S7.1", "FINDING (owner Q4): the task assigned to A (company hidden from A) does not name the company", !!tA && tA.ownerUserId === staffA && !has(tA.title, coName) && has(tA.title, "โทรหาฝ่ายจัดซื้อ"), j(tA), true);
    chk("S7.2", "control: the task assigned to the OWNER (sees the company) names it", !!tO && has(tO.title, coName), j(tO));
  });

  // ════════ S8 · RUNNING-plan race ════════
  console.log("\n── S8 erase while a plan is running ──");
  await sub("S8", async () => {
    const phone = phoneOf();
    const x = await mkContact("แผนวิ่ง", owner, phone, `run-${rand}@cust.qc.invalid`, false);
    const fullName = x.name as string;
    const room = `u~${owner}~${hex()}`;
    await P.aiConversation.create({ data: { id: room, tenantId: T, title: "ห้องแผน" } });
    const plan = await P.aiPlan.create({ data: { tenantId: T, conversationId: room, title: "แผนบทความ", expiresAt: exp(), stepsJson: [{ kind: "kb_create_article", summary: `บทความของ ${fullName} โทร ${phone}`, payload: { title: `บทความ ${TAG}`, body: `ลูกค้า ${fullName}` }, status: "PENDING" }] } });
    // hold KbArticle so the step's insert blocks after executePlan has read + claimed the plan; the erase does not touch KbArticle
    let release: () => void = () => undefined;
    const released = new Promise<void>((r) => { release = r; });
    let lockedSignal: () => void = () => undefined;
    const locked = new Promise<void>((r) => { lockedSignal = r; });
    const lockTx = P.$transaction(async (tx: Any) => {
      await tx.$executeRawUnsafe(`LOCK TABLE "KbArticle" IN SHARE ROW EXCLUSIVE MODE`);
      lockedSignal();
      await released;
    }, { timeout: 90_000, maxWait: 20_000 });
    await locked;
    const m = { role: "OWNER", unitAccess: ["*"], permissions: {} };
    const run = PLANS.executePlan(m, { tenantId: T }, plan.id, { userId: owner }).catch((e: Error) => ({ threw: e.message }));
    let st = "";
    for (let i = 0; i < 60; i += 1) {
      st = (await P.aiPlan.findUnique({ where: { id: plan.id }, select: { status: true } }))?.status ?? "";
      if (st === "RUNNING") break;
      await sleep(250);
    }
    const er = st === "RUNNING" ? await erase(x) : null;
    const mid = await P.aiPlan.findUnique({ where: { id: plan.id }, select: { stepsJson: true } });
    release();
    await lockTx.catch(() => undefined);
    const res = await run;
    const after = await P.aiPlan.findUnique({ where: { id: plan.id }, select: { status: true, stepsJson: true } });
    chk("S8.0", "control (premise): the plan was RUNNING when the erase ran, the erase masked it, the run finished", st === "RUNNING" && er?.erased === true && !has(mid, phone) && !!res && !res.threw, `status@erase=${st} erased=${er?.erased} mid=${cut(j(mid), 80)} run=${cut(j(res), 120)}`);
    chk("S8.1", "FINDING (RUNNING race): after the run's write-back the plan still holds no name/phone (step status written, masked text kept)", !has(after, phone) && !has(after, fullName) && (after?.status === "DONE" || after?.status === "FAILED"), cut(j(after), 220), true);
    await P.kbArticle.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
  });
} finally {
  await sleep(1_000);
  holder[PENDING_KEY] = undefined;
  const left: string[] = [];
  const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[])
    .map((r) => String(r.table_name))
    .filter((t) => /^[A-Za-z_]+$/.test(t));
  for (const tid of [T, T2].filter(Boolean)) {
    await P.opsEvent.deleteMany({ where: { tenantId: tid } }).catch(() => undefined);
    await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${tid}%`).catch(() => undefined);
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: tid } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: tid } }).catch(() => undefined);
    for (const t of tables) {
      const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => [{ n: 0 }])) as Any[];
      if (Number(r?.[0]?.n ?? 0) > 0) left.push(`${t}=${r[0].n}`);
    }
  }
  if (BUCKETS.length) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" = ANY($1::text[])`, BUCKETS).catch(() => undefined);
  for (const uid of USERS) {
    await P.appNotification.deleteMany({ where: { recipientUserId: uid } }).catch(() => undefined);
    await P.session.deleteMany({ where: { userId: uid } }).catch(() => undefined);
    await P.membership.deleteMany({ where: { userId: uid } }).catch(() => undefined);
    await P.user.delete({ where: { id: uid } }).catch(() => undefined);
  }
  const bLeft = BUCKETS.length ? Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE "key" = ANY($1::text[])`, BUCKETS)) as Any[])[0]?.n ?? 0) : 0;
  if (T) chk("CLEAN", "throwaway tenants, users and rate buckets removed (0 rows left)", left.length === 0 && bLeft === 0 && (await P.tenant.count({ where: { id: { in: [T, T2].filter(Boolean) } } })) === 0 && (await P.user.count({ where: { id: { in: USERS } } })) === 0, `${left.join(" · ") || "-"} buckets=${bLeft}`);
  await prisma.$disconnect();
}
const controls = cks.filter((c) => !c.finding);
const findings = cks.filter((c) => c.finding);
console.log(`\ncontrols ${controls.filter((c) => c.ok).length}/${controls.length} green · findings GREEN (fixed) ${findings.filter((c) => c.ok).length}/${findings.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ controls: controls.map((c) => [c.id, c.ok]), findings: findings.map((c) => [c.id, c.ok ? "GREEN" : "RED"]) })}`);
process.exit(cks.every((c) => c.ok) ? 0 : 1);
