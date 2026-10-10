// C5.5-fix13 INDEPENDENT REVIEW probe (card cf18) — attacks on the builder's claims. Own throwaway tenants `qc-cf18r-*` on QC3; CLEAN at the end.
//   R1  H4-1 erase × AI memories / plans / support / scheduled tasks: tenant isolation (2nd tenant with the same tokens) · JSON-escaped name
//       (double quotes) in plan steps · paging with batch 2 · token in a JSON key / phone as a JSON number · a phone format outside the
//       variant list (081-2345678) in memory vs message (consistency) · a generic e-mail local part ("support") over-masking unrelated
//       memories and the SHARK team's support replies · AiScheduledTask.instruction (fed to the model daily) · non-CRM proposal vs plan rule ·
//       support attachment names · memory updatedAt not bumped
//   R2  H4-2 door: legacy (cuid) room · generic executeProposal vs the door give the same "not found" to a non-viewer (G2 consistency)
//   R3  H4-3 residual: a system send (sequence/rule) renders the hidden company into the thread the restricted member reads back
//   R4  H4-4: other read tools also 403 · body has only `error` · a key without CRM scope gets the generic scope 403 (not the CRM-REST hint)
//   R5  P-it5-2: public routes wake the drain for a GARBAGE token (/u no-track, /u one-click, /t/o) · per-request wake once the previous
//       drain has started (no 15 s bound) · /t/c garbage does not wake · viewport on the done page
// Run (QC3): bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//              bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf18/review/probe-cf18-review.mts
// "FINDING" checks assert the behaviour the reviewer expects (RED = finding reproduced). "control" checks must be GREEN. No drain is ever run
// by this probe (after() tasks are counted, never executed) ⇒ no other tenant's outbox rows can be touched.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const host = accEnv.loadQcEnv().host;
if (!/ep-weathered-river/.test(String(host ?? "")) || !/ep-weathered-river/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.error(`probe-cf18-review: QC3 only (host=${host})`);
  process.exit(4);
}
process.env.SHARK_AI_MOCK = "1";
delete process.env.SHARK_AI_KEY;
if (!process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = "re_qc_probe_dummy_key";
globalThis.fetch = (async () => {
  throw new Error("probe-cf18-review: network blocked");
}) as typeof fetch;

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf18r-${rand}`;
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

// request scope whose after() only COUNTS the task (never runs it — no drain from this probe)
const AFTER: unknown[] = [];
const PENDING_KEY = Symbol.for("shark.core.after-drain.pendingSince");
const holder = globalThis as unknown as Record<symbol, number | undefined>;
async function inScope<T>(pathname: string, fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { "user-agent": "probe-cf18-review", "x-forwarded-for": "203.0.113.199" } });
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
  const tools = (await import("@/lib/ai/tools" as string)) as Any;
  const ACT = (await import("@/lib/ai/actor" as string)) as Any;
  const PROPS = (await import("@/lib/ai/proposals" as string)) as Any;
  const keySvc = (await import("@/lib/api-keys/service" as string)) as Any;
  const TOOLS_ROUTE = (await import("../../../../src/app/api/v1/ai/tools/[name]/route.ts" as string)) as Any;
  const R_ONE = (await import("../../../../src/app/u/[token]/one-click/route.ts" as string)) as Any;
  const R_NOT = (await import("../../../../src/app/u/[token]/no-track/route.ts" as string)) as Any;
  const R_O = (await import("../../../../src/app/t/o/[token]/route.ts" as string)) as Any;
  const R_C = (await import("../../../../src/app/t/c/[token]/route.ts" as string)) as Any;

  // ═══ world ═══
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
  await member(staffA, "STAFF", { "ai.chat.send": true, "crm.contact.read": true, "crm.contact.create": true, "crm.email.read": true, "crm.email.send": true });
  await member(staffB, "STAFF", { "ai.chat.send": true, "crm.contact.read": true, "crm.contact.create": true });
  const act = (uid: string) => ACT.aiMemberActor(T, uid, { role: ROLE[uid], unitAccess: ["*"], permissions: PERM[uid] });
  const crmActor = (uid: string) => MEM.toMemberActor(uid, MROW[uid]);
  const doorActor = (uid: string) => ({ userId: uid, role: ROLE[uid], unitAccess: ["*"], permissions: PERM[uid] });
  S = (await sysSvc.createSystem(T, "CRM", `${TAG} crm`)).id as string;
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
  const mkContact = async (first: string, ownerUserId: string, phone: string, email: string, link: "company" | "none") => {
    const name = `${first} ${TAG}`;
    const party = await P.party.create({ data: { tenantId: T, name, kind: "PERSON", phone, email } });
    const k = await P.crmContact.create({
      data: { tenantId: T, systemId: S, name, firstName: first, lastName: TAG, partyId: party.id, ownerUserId, phone, email, ...(link === "company" ? { companyId: company.id, company: coName } : {}) },
    });
    if (link === "company") await P.crmCompanyContact.create({ data: { tenantId: T, companyId: company.id, contactId: k.id, isPrimary: true } });
    return k;
  };
  const rt = (uid: string, name: string, args: Any = {}, conversationId?: string) =>
    tools.runTool({ tenantId: T, actor: act(uid), ...(conversationId ? { conversationId } : {}) }, name, args) as Promise<string>;
  const exp = () => new Date(Date.now() + 86_400_000);

  // ════════ R1 · H4-1 attacks ════════
  console.log("\n── R1 PDPA erase × AI memories / plans / support / scheduled tasks ──");
  await sub("R1", async () => {
    const phone = phoneOf();
    const dash37 = `${phone.slice(0, 3)}-${phone.slice(3)}`; // 081-2345678 — not in phoneVariants
    const phone66num = Number(`66${phone.slice(1)}`); // JSON number form of a token variant
    const email = `support@${rand}cust.qc.invalid`; // generic role local part (7 chars ⇒ becomes a token)
    const x = await mkContact(`สมศรี "แอน"`, staffA, phone, email, "none");
    const fullName = x.name as string;
    const PERSON = [phone, fullName, email];
    const tokensOf = (v: unknown) => PERSON.filter((tk) => has(v, tk));
    const room = `u~${staffA}~${hex()}`;
    await P.aiConversation.create({ data: { id: room, tenantId: T, title: "ห้องรีวิว" } });
    // memories (direct rows: masking is tenant-wide, owner kind irrelevant for these checks)
    const mA = await P.aiMemory.create({ data: { id: `u~${staffA}~${hex()}`, tenantId: T, content: `ลูกค้า ${fullName} เบอร์ ${dash37}` } });
    const mSupport = await P.aiMemory.create({ data: { tenantId: T, content: `ลูกค้าส่วนใหญ่ติดต่อทีม support ทางไลน์ ${TAG}` } }); // unrelated to the person
    const mOnly = await P.aiMemory.create({ data: { tenantId: T, content: `${fullName}` } });
    const msgDash = await P.aiMessage.create({ data: { tenantId: T, conversationId: room, role: "USER", content: `โทรกลับ ${dash37} ด้วย` } });
    const msgSupport = await P.aiMessage.create({ data: { tenantId: T, conversationId: room, role: "USER", content: `แจ้งทีม support ว่าระบบช้า ${TAG}` } });
    // plans: 5 pending with the phone (paging, batch 2) · quoted name · token as JSON key · phone as JSON number
    const pagePlans: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const p = await P.aiPlan.create({ data: { tenantId: T, conversationId: room, title: `แผน ${i} ${TAG}`, expiresAt: exp(), stepsJson: [{ kind: "booking_create_appointment", summary: `โทร ${phone} รอบ ${i}`, payload: { n: i }, status: "PENDING" }] } });
      pagePlans.push(p.id);
    }
    const pQuote = await P.aiPlan.create({ data: { tenantId: T, conversationId: room, title: `นัด ${TAG}`, expiresAt: exp(), stepsJson: [{ kind: "booking_create_appointment", summary: `นัด ${fullName}`, payload: { customerName: fullName }, status: "PENDING" }] } });
    const pKey = await P.aiPlan.create({ data: { tenantId: T, conversationId: room, title: `โน้ต ${TAG}`, status: "DONE", expiresAt: exp(), stepsJson: [{ kind: "booking_create_appointment", summary: "โน้ตลูกค้า", payload: { notes: { [fullName]: "vip" } }, status: "DONE" }] } });
    const pNum = await P.aiPlan.create({ data: { tenantId: T, conversationId: room, title: `เบอร์ ${TAG}`, expiresAt: exp(), stepsJson: [{ kind: "booking_create_appointment", summary: "นัดลูกค้า", payload: { tel: phone66num }, status: "PENDING" }] } });
    // scheduled task naming the person (instruction is sent to the model every day + copied into a notification + push)
    const task = await P.aiScheduledTask.create({ data: { tenantId: T, instruction: `ทุกเช้าเตือนให้โทรหา ${fullName} ที่เบอร์ ${phone}`, hourBkk: 3, active: false } });
    // non-CRM pending proposal naming the person (same content as a plan step)
    const prop = await P.aiProposal.create({ data: { tenantId: T, conversationId: room, kind: "booking_create_appointment", summary: `นัด ${fullName} โทร ${phone}`, payload: { customerName: fullName, phone }, expiresAt: exp() } });
    // support case: shop message (phone) + SHARK team reply with the word "support" + an attachment named after the person
    const sc = await P.supportCase.create({ data: { tenantId: T, caseNo: 1, openedByUserId: staffA, subject: `ใบเสร็จของ ${fullName}` } });
    await P.supportMessage.create({ data: { tenantId: T, caseId: sc.id, authorSide: "SHOP", authorId: staffA, body: `ลูกค้าโทร ${phone}`, attachmentsJson: [{ name: `${fullName}-บัตรประชาชน.jpg`, url: "https://files.qc.invalid/x.jpg", kind: "image" }] } });
    const platMsg = await P.supportMessage.create({ data: { tenantId: T, caseId: sc.id, authorSide: "PLATFORM", authorId: "platform-qc", body: `ทีม support ของ SHARK รับเรื่องแล้ว ${TAG}` } });
    // second tenant with the SAME tokens (must stay untouched)
    const room2 = `u~${owner}~${hex()}`;
    await P.aiConversation.create({ data: { id: room2, tenantId: T2, title: `ห้อง ${fullName}` } });
    await P.aiMessage.create({ data: { tenantId: T2, conversationId: room2, role: "USER", content: `${fullName} ${phone}` } });
    await P.aiMemory.create({ data: { tenantId: T2, content: `${fullName} โทร ${phone} ทีม support` } });
    await P.aiPlan.create({ data: { tenantId: T2, conversationId: room2, title: `โทร ${phone}`, expiresAt: exp(), stepsJson: [{ kind: "x", summary: fullName, payload: {}, status: "PENDING" }] } });
    const sc2 = await P.supportCase.create({ data: { tenantId: T2, caseNo: 1, openedByUserId: owner, subject: `เคสของ ${fullName}` } });
    await P.supportMessage.create({ data: { tenantId: T2, caseId: sc2.id, authorSide: "SHOP", authorId: owner, body: `${phone} support` } });
    await P.aiScheduledTask.create({ data: { tenantId: T2, instruction: `โทร ${phone}`, hourBkk: 3, active: false } });
    const t2Snap = async () => j({
      m: await P.aiMessage.findMany({ where: { tenantId: T2 }, select: { content: true } }),
      mem: await P.aiMemory.findMany({ where: { tenantId: T2 }, select: { content: true, updatedAt: true } }),
      plan: await P.aiPlan.findMany({ where: { tenantId: T2 }, select: { title: true, status: true, stepsJson: true } }),
      sc: await P.supportCase.findMany({ where: { tenantId: T2 }, select: { subject: true, updatedAt: true } }),
      sm: await P.supportMessage.findMany({ where: { tenantId: T2 }, select: { body: true } }),
      task: await P.aiScheduledTask.findMany({ where: { tenantId: T2 }, select: { instruction: true } }),
      conv: await P.aiConversation.findMany({ where: { tenantId: T2 }, select: { title: true } }),
    });
    const t2Before = await t2Snap();
    const mABefore = await P.aiMemory.findUnique({ where: { id: mA.id }, select: { updatedAt: true } });

    const er = await CRM.privacy.eraseContact(ctxOf(owner), crmActor(owner), { contactId: x.id, confirm: true, reason: "ลูกค้าขอลบข้อมูล (review cf18 R1)" }, { del: async () => undefined, batch: 2 });
    chk("R1.0", "control: erase (batch 2) succeeded", er?.erased === true, `erased=${er?.erased} counts=${cut(j(er?.counts), 200)}`);

    chk("R1.1", "control: second tenant's AiMessage / AiMemory / AiPlan / SupportCase / SupportMessage / AiScheduledTask / title are byte-identical (tenant scoping of every new statement)", (await t2Snap()) === t2Before, cut(await t2Snap(), 200));

    const plansAfter = (await P.aiPlan.findMany({ where: { id: { in: pagePlans } }, select: { status: true, stepsJson: true } })) as Any[];
    chk("R1.2", "control: paging (batch 2, 8 matching plans) reaches all 5 phone plans — masked + EXPIRED", plansAfter.length === 5 && plansAfter.every((p) => p.status === "EXPIRED" && !has(p.stepsJson, phone) && has(p.stepsJson, MASK)), j(plansAfter.map((p) => `${p.status}:${cut(j(p.stepsJson), 50)}`)));
    const q = await P.aiPlan.findUnique({ where: { id: pQuote.id }, select: { status: true, stepsJson: true } });
    chk("R1.3", "control: a name with double quotes (JSON-escaped in stepsJson::text) is found and masked in summary + payload", q?.status === "EXPIRED" && !has(q?.stepsJson, `สมศรี`) && has(q?.stepsJson, MASK), cut(j(q), 200));
    const k = await P.aiPlan.findUnique({ where: { id: pKey.id }, select: { status: true, stepsJson: true } });
    info("R1.4", `token as a JSON KEY survives (keys are not walked) — still holds the name: ${has(k?.stepsJson, "สมศรี")} · status ${k?.status} · ${cut(j(k?.stepsJson), 140)}`);
    const nn = await P.aiPlan.findUnique({ where: { id: pNum.id }, select: { status: true, stepsJson: true } });
    info("R1.5", `phone as a JSON NUMBER (token variant 66…) survives; the plan is still selected and retired: status ${nn?.status} · ${cut(j(nn?.stepsJson), 140)}`);

    const mAAfter = await P.aiMemory.findUnique({ where: { id: mA.id }, select: { content: true, updatedAt: true } });
    const msgDashAfter = await P.aiMessage.findUnique({ where: { id: msgDash.id }, select: { content: true } });
    chk("R1.6", "control: memory masked in place, updatedAt not bumped", !has(mAAfter?.content, fullName) && has(mAAfter?.content, MASK) && new Date(mAAfter?.updatedAt).getTime() === new Date(mABefore?.updatedAt).getTime(), j(mAAfter));
    info("R1.7", `phone written as 081-2345678 (outside the variant list): memory keeps it=${has(mAAfter?.content, dash37)} · AI message keeps it=${has(msgDashAfter?.content, dash37)} (consistent with the pre-existing message masking)`);
    chk("R1.8", "control: the memory that was only the person is deleted", (await P.aiMemory.count({ where: { id: mOnly.id } })) === 0, `left=${await P.aiMemory.count({ where: { id: mOnly.id } })}`);

    const mSupAfter = await P.aiMemory.findUnique({ where: { id: mSupport.id }, select: { content: true } });
    const msgSupAfter = await P.aiMessage.findUnique({ where: { id: msgSupport.id }, select: { content: true } });
    const platAfter = await P.supportMessage.findUnique({ where: { id: platMsg.id }, select: { body: true } });
    chk("R1.9", "FINDING: a generic e-mail local part ('support' from support@…) does not rewrite unrelated memories / the SHARK team's support replies", has(mSupAfter?.content, "ทีม support") && has(platAfter?.body, "ทีม support"), `memory=${j(mSupAfter?.content)} platformReply=${j(platAfter?.body)} aiMessage(pre-existing path)=${j(msgSupAfter?.content)}`, true);

    const taskAfter = await P.aiScheduledTask.findUnique({ where: { id: task.id }, select: { instruction: true } });
    chk("R1.10", "FINDING: the scheduled task's instruction (sent to the model daily, copied into an AppNotification + push) no longer holds the name/phone", tokensOf(taskAfter?.instruction).length === 0, j(taskAfter), true);

    const propAfter = await P.aiProposal.findUnique({ where: { id: prop.id }, select: { status: true, summary: true, payload: true } });
    info("R1.11", `non-CRM pending proposal with the same content as a plan step: status ${propAfter?.status} · still names the person=${tokensOf(propAfter).length > 0} (plans with the same step → EXPIRED + masked) — owner question 2`);

    const caseAfter = await P.supportCase.findUnique({ where: { id: sc.id }, select: { subject: true, messages: { select: { body: true, attachmentsJson: true, authorSide: true } } } });
    chk("R1.12", "control: support case subject + shop message masked", !has(caseAfter?.subject, fullName) && caseAfter?.messages?.every((m: Any) => !has(m.body, phone)), cut(j(caseAfter), 220));
    info("R1.13", `support attachment named after the person survives: ${has(caseAfter?.messages, "บัตรประชาชน") && has(caseAfter?.messages, "สมศรี")} (attachmentsJson not masked; the file itself is not deleted)`);
  });

  // ════════ R2 · H4-2 door ════════
  console.log("\n── R2 CRM door × G2 rooms (legacy room · generic door consistency) ──");
  await sub("R2", async () => {
    const roomA = `u~${staffA}~${hex()}`;
    await P.aiConversation.create({ data: { id: roomA, tenantId: T, title: "ห้องของ A" } });
    await rt(staffA, "crm_create_lead", { name: `ลีดรีวิว ${TAG}`, phone: phoneOf() }, roomA);
    const pA = (await P.aiProposal.findFirst({ where: { tenantId: T, conversationId: roomA, status: "PENDING" }, orderBy: { createdAt: "desc" } })) as Any;
    chk("R2.0", "control (premise): A's chat turn left a crm.* proposal without requestedByUserId", !!pA && String(pA.kind).startsWith("crm.") && !has(pA.payload, "requestedByUserId"), j(pA?.kind));
    const ghost = `c${hex()}`;
    const m = (uid: string) => ({ role: ROLE[uid], unitAccess: ["*"], permissions: PERM[uid] });
    const exB = await PROPS.executeProposal(m(staffB), { tenantId: T }, pA.id, { userId: staffB });
    const exG = await PROPS.executeProposal(m(staffB), { tenantId: T }, ghost, { userId: staffB });
    const exO = await PROPS.executeProposal(m(owner), { tenantId: T }, pA.id, { userId: owner });
    chk("R2.1", "control (G2 consistency): the generic confirm door refuses staff B AND the OWNER on A's u~ proposal with the 'not found' text of a ghost id — same rule the CRM door now applies (P1.3 is not a regression)", !exB.ok && !exO.ok && exB.note === exG.note && exO.note === exG.note, `B=${j(exB)} O=${j(exO)} ghost=${j(exG)}`);
    // legacy (cuid) room — G2: OWNER only
    const legacy = `c${hex().slice(0, 23)}`;
    await P.aiConversation.create({ data: { id: legacy, tenantId: T, title: "ห้องรุ่นเดิม" } });
    const mkLegacy = async () => P.aiProposal.create({ data: { tenantId: T, conversationId: legacy, kind: pA.kind, summary: pA.summary, payload: pA.payload, expiresAt: exp() } });
    const l1 = await mkLegacy();
    const l2 = await mkLegacy();
    const dB = await CRM.aiBridges.cancelProposalById(T, doorActor(staffB), l1.id);
    const dA = await CRM.aiBridges.cancelProposalById(T, doorActor(staffA), l1.id);
    const dG = await CRM.aiBridges.cancelProposalById(T, doorActor(staffB), ghost);
    const dO = await CRM.aiBridges.cancelProposalById(T, doorActor(owner), l2.id);
    chk("R2.2", "control: legacy cuid room proposal — staff B and A get the ghost answer, OWNER cancels (G2 legacy rooms = OWNER only)", j(dB) === j(dG) && j(dA) === j(dG) && dO?.ok === true, `B=${j(dB)} A=${j(dA)} O=${j(dO)}`);
    const byId = await CRM.aiBridges.confirmProposalById(T, doorActor(staffB), pA.id);
    const byIdG = await CRM.aiBridges.confirmProposalById(T, doorActor(staffB), ghost);
    info("R2.3", `confirmProposalById hidden=${j(byId)} vs ghost=${j(byIdG)} — differs, but executeProposal never sends a no-requestedBy chat row there (defence in depth only)`);
    chk("R2.4", "control: A's row still PENDING after all foreign attempts", (await P.aiProposal.findUnique({ where: { id: pA.id }, select: { status: true } }))?.status === "PENDING", "status");
  });

  // ════════ R3 · H4-3 residual ════════
  console.log("\n── R3 company merge field — system sends read back by a restricted member ──");
  await sub("R3", async () => {
    const y = await mkContact("วิไล", staffA, phoneOf(), `wilai-${rand}@cust.qc.invalid`, "company");
    const iy = await P.crmEmailMessage.create({
      data: { tenantId: T, systemId: S, contactId: y.id, direction: "IN", messageId: `${S}:${TAG}-in@cust.qc.invalid`, threadKey: randomBytes(16).toString("hex"), fromAddr: y.email, toAddrs: [`crm@${TAG}.qc.invalid`], subject: `สอบถาม ${TAG}`, bodyText: "ขอใบเสนอราคา", status: "RECEIVED", receivedAt: new Date(), trackTokenHash: hex() },
    });
    const tpl = await P.crmEmailTemplate.create({ data: { tenantId: T, systemId: S, name: `tpl ${TAG}`, subject: "ใบเสนอราคา {{contact.companyName}}", bodyHtml: "<p>ฝ่ายจัดซื้อ {{contact.companyName}}</p>" } });
    const tr = { transport: async () => ({ ok: true, id: "never" }) };
    const mine = await CRM.emails.sendEmail(ctxOf(staffA), crmActor(staffA), { contactId: y.id, replyToEmailId: iy.id, templateId: tpl.id, scheduledAt: exp() }, tr);
    const sys = await CRM.emails.sendAsSystem({ tenantId: T, systemId: S }, { contactId: y.id, replyToEmailId: iy.id, templateId: tpl.id, scheduledAt: exp() }, tr);
    const th = await CRM.emails.getThread(ctxOf(staffA), crmActor(staffA), iy.threadKey);
    const outs = (th.messages as Any[]).filter((mm) => mm.direction === "OUT");
    const own = outs.find((mm) => mm.id === mine.emailId);
    const sysOut = outs.find((mm) => mm.id === sys.emailId);
    chk("R3.1", "control: A's own template mail carries no hidden company name", !!own && !has(own, coName), cut(j(own?.subject), 80));
    info("R3.2", `system send (sequence step / rule SEND_EMAIL — reachable from A's own enrol/write) rendered into the thread A reads: shows hidden company=${has(sysOut, coName)} · ${cut(j(sysOut?.subject), 100)}`);
  });

  // ════════ R4 · H4-4 ════════
  console.log("\n── R4 CRM read tools × API keys ──");
  await sub("R4", async () => {
    const key = await keySvc.createApiKey({ tenantId: T }, `${TAG}-crm-read`, { scopes: ["crm.contact.read"], systemId: S, createdById: owner });
    const call = async (raw: string, name: string, args: Any) => {
      const res = await TOOLS_ROUTE.POST(new Request(`http://qc.invalid/api/v1/ai/tools/${name}`, { method: "POST", headers: { authorization: `Bearer ${raw}`, "content-type": "application/json" }, body: j({ args }) }), { params: Promise.resolve({ name }) });
      return { status: res.status, body: (await res.json()) as Any };
    };
    const c360 = await call(key.rawKey, "crm_contact_360", { id: "x" });
    const cScore = await call(key.rawKey, "crm_score_explain", { id: "x" });
    chk("R4.1", "control: crm_contact_360 / crm_score_explain also answer 403 with the CRM-REST hint; body has only `error` (no scope internals)", c360.status === 403 && cScore.status === 403 && j(Object.keys(c360.body)) === '["error"]' && has(c360.body.error, "/api/v1/crm"), `360=${c360.status} ${cut(j(c360.body), 120)} score=${cScore.status}`);
    let other: Any = null;
    try {
      const k2 = await keySvc.createApiKey({ tenantId: T }, `${TAG}-deal-only`, { scopes: ["crm.deal.read"], systemId: S, createdById: owner });
      other = await call(k2.rawKey, "crm_search", { q: "x" });
    } catch (e) {
      other = { threw: e instanceof Error ? e.message : String(e) };
    }
    info("R4.2", `key without crm.contact.read → crm_search: ${cut(j(other), 200)} (route scope check runs before toolVerdict ⇒ the CRM-REST hint is only shown to keys that hold the scope)`);
  });

  // ════════ R5 · P-it5-2 public-route wakes ════════
  console.log("\n── R5 public-route wakes with garbage tokens ──");
  await sub("R5", async () => {
    const garbage = `zz${hex()}`;
    const ip = "203.0.113.199";
    for (const r of ["o", "c", "u"] as const) BUCKETS.push(...(CRM.emails.trackRateKeys(r, { ip, token: garbage }) as string[]));
    const count = async (path: string, fn: () => Promise<Response>) => {
      holder[PENDING_KEY] = undefined;
      const n0 = AFTER.length;
      const res = await inScope(path, fn);
      return { n: AFTER.length - n0, status: res.status, text: res.headers.get("content-type")?.includes("html") ? await res.text() : "" };
    };
    const nt = await count(`/u/${garbage}/no-track`, () => R_NOT.POST(new Request(`http://qc.local/u/${garbage}/no-track`, { method: "POST", headers: { "user-agent": "probe-cf18-review", "x-forwarded-for": ip } }), { params: Promise.resolve({ token: garbage }) }));
    const oc = await count(`/u/${garbage}/one-click`, () => R_ONE.POST(new Request(`http://qc.local/u/${garbage}/one-click`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip }, body: "List-Unsubscribe=One-Click" }), { params: Promise.resolve({ token: garbage }) }));
    const op = await count(`/t/o/${garbage}.gif`, () => R_O.GET(new Request(`http://qc.local/t/o/${garbage}.gif`, { headers: { "user-agent": "Mozilla/5.0 probe", "x-forwarded-for": ip } }), { params: Promise.resolve({ token: `${garbage}.gif` }) }));
    const cl = await count(`/t/c/${garbage}`, () => R_C.GET(new Request(`http://qc.local/t/c/${garbage}`, { headers: { "user-agent": "Mozilla/5.0 probe", "x-forwarded-for": ip } }), { params: Promise.resolve({ token: garbage }) }));
    chk("R5.1", "FINDING: a garbage token on /u no-track (no rate limit) schedules no outbox drain", nt.n === 0, `wakes=${nt.n} status=${nt.status}`, true);
    chk("R5.2", "FINDING: a garbage token on /u one-click schedules no outbox drain", oc.n === 0, `wakes=${oc.n} status=${oc.status}`, true);
    chk("R5.3", "FINDING: a garbage token on /t/o (counted as 'allowed' by the rate gate, nothing written) schedules no outbox drain", op.n === 0, `wakes=${op.n} status=${op.status}`, true);
    chk("R5.4", "control: a garbage token on /t/c does not wake (no url ⇒ home before the wake)", cl.n === 0, `wakes=${cl.n} status=${cl.status}`);
    chk("R5.5", "control (P-it5-3): the no-track / one-click done pages carry the viewport meta", has(nt.text, 'name="viewport"') && has(oc.text, 'name="viewport"'), `nt=${has(nt.text, "viewport")} oc=${has(oc.text, "viewport")}`);
    // coalescing: once the previous drain has STARTED (task clears the flag at its start), the next garbage request schedules another
    let n = 0;
    for (let i = 0; i < 10; i += 1) {
      const n0 = AFTER.length;
      await inScope(`/u/${garbage}/no-track`, () => R_NOT.POST(new Request(`http://qc.local/u/${garbage}/no-track`, { method: "POST" }), { params: Promise.resolve({ token: garbage }) }));
      if (AFTER.length > n0) n += 1;
      holder[PENDING_KEY] = undefined; // what the scheduled task does as its first step when it starts
    }
    info("R5.6", `10 unauthenticated garbage no-track POSTs, each after the previous drain started → ${n} drains scheduled (coalescing only merges not-yet-started drains; no 15 s bound)`);
    holder[PENDING_KEY] = undefined;
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
