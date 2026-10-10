// C5.5 hunt 4 probe (closing hunt) — read-only on product code; own throwaway tenant `qc-h4-*` on QC3; CLEAN at the end.
//   E  PDPA erase (fix9/fix11 privacy.eraseContact) × per-writer AI memory (G3) and AI plans: the erase masks AiMessage /
//      AiConversation.title / AppNotification, but AiMemory (private notes — G3 explicitly allows contact data there — and legacy shop
//      facts) and AiPlan (title / stepsJson) keep the erased person's phone and full name; memories are re-injected into the system
//      prompt of every later chat turn
//   C  fix10 rule "a hidden company's name is shown nowhere to that viewer" × e-mail merge field `{{contact.companyName}}`: the legacy
//      company text is rendered into the sender's own mail (stored, readable in the thread) although every list / 360 / thread header
//      masks it for that sender
//   K  G1 r2 F4 contract "the manifest never advertises a tool the executor refuses": a CRM-scoped API key is offered the CRM read
//      tools (GET /api/v1/ai/skills · /skills/crm) and every call answers HTTP 200 with the refusal "open the assistant from the app"
//   P  G2 conversation ownership × CRM proposal door: a chat-room `crm.*` proposal of member A (A's private u~ room) is cancellable
//      (web/mobile reject → `aiBridges.cancelProposalById`) and confirmable (CRM page action → `aiBridges.confirmProposal`) by member B
//      who holds the proposal id — the generic doors answer "not found"
// Run (QC3): bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//              bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt4/probe-hunt4.mts
// A check marked "FINDING" asserts the safe behaviour (RED = defect reproduced on 189d81f1); controls must be GREEN.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const host = accEnv.loadQcEnv().host;
if (!/ep-weathered-river/.test(String(host ?? "")) || !/ep-weathered-river/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.error(`probe-hunt4: QC3 only (host=${host})`);
  process.exit(4);
}
process.env.SHARK_AI_MOCK = "1";
delete process.env.SHARK_AI_KEY;
if (!process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = "re_qc_probe_dummy_key";
globalThis.fetch = (async () => {
  throw new Error("probe-hunt4: network blocked");
}) as typeof fetch;

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-h4-${rand}`;
const cks: { id: string; ok: boolean; finding: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string, finding = false) => {
  cks.push({ id, ok: !!ok, finding });
  console.log(`  ${ok ? "✅" : "❌"} [${id}]${finding ? " (FINDING check)" : " (control)"} ${n}\n        — ACTUAL ${actual}`);
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

class Scripted {
  private i = 0;
  constructor(private steps: Any[]) {}
  async chat(messages: Any[]) {
    const step = this.steps[Math.min(this.i, this.steps.length - 1)];
    this.i += 1;
    if (step.text === "$SYSTEM") return { text: `system: ${messages.find((m: Any) => m.role === "system")?.content ?? ""}`, tokensIn: 1, tokensOut: 1, model: "scripted" };
    return { text: step.text ?? "", toolCalls: step.toolCalls, tokensIn: 1, tokensOut: 1, model: "scripted" };
  }
}

let T = "";
let S = "";
const USERS: string[] = [];

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const MEM = (await import("@/lib/modules/member" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const svc = (await import("@/lib/ai/service" as string)) as Any;
  const tools = (await import("@/lib/ai/tools" as string)) as Any;
  const ACT = (await import("@/lib/ai/actor" as string)) as Any;
  const AIP = (await import("@/lib/ai/proposals" as string)) as Any;
  const keySvc = (await import("@/lib/api-keys/service" as string)) as Any;
  const SKILLS_ROUTE = (await import("../../../src/app/api/v1/ai/skills/route.ts" as string)) as Any;
  const SKILL_ROUTE = (await import("../../../src/app/api/v1/ai/skills/[id]/route.ts" as string)) as Any;
  const TOOLS_ROUTE = (await import("../../../src/app/api/v1/ai/tools/[name]/route.ts" as string)) as Any;

  // ═══ world ═══
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
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
  // staff A: assistant + own contacts + e-mail; NO crm.company.read (the fix10 persona "no company read")
  await member(staffA, "STAFF", { "ai.chat.send": true, "crm.contact.read": true, "crm.contact.create": true, "crm.email.read": true, "crm.email.send": true });
  await member(staffB, "STAFF", { "ai.chat.send": true, "crm.contact.read": true, "crm.contact.create": true });
  const act = (uid: string) => ACT.aiMemberActor(T, uid, { role: ROLE[uid], unitAccess: ["*"], permissions: PERM[uid] });
  const crmActor = (uid: string) => MEM.toMemberActor(uid, MROW[uid]);
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
  const mkContact = async (first: string, ownerUserId: string, phone: string, email: string, linkCompany: boolean) => {
    const name = `${first} ${TAG}`;
    const party = await P.party.create({ data: { tenantId: T, name, kind: "PERSON", phone, email } });
    const k = await P.crmContact.create({
      data: {
        tenantId: T, systemId: S, name, firstName: first, lastName: TAG, partyId: party.id, ownerUserId, phone, email,
        ...(linkCompany ? { companyId: company.id, company: coName } : {}),
      },
    });
    if (linkCompany) await P.crmCompanyContact.create({ data: { tenantId: T, companyId: company.id, contactId: k.id, isPrimary: true } });
    return k;
  };
  const prompt = async (uid: string) => String((await svc.sendMessage({ tenantId: T, actor: act(uid) }, { text: "สวัสดี" }, { provider: new Scripted([{ text: "$SYSTEM" }]) })).reply ?? "");
  const rt = (uid: string, name: string, args: Any = {}, conversationId?: string) =>
    tools.runTool({ tenantId: T, actor: act(uid), ...(conversationId ? { conversationId } : {}) }, name, args) as Promise<string>;

  // ════════ E · PDPA erase × AI memory (G3) / AI plan ════════
  console.log("\n── E PDPA erase × AiMemory / AiPlan ──");
  await sub("E", async () => {
    const phone = phoneOf();
    const x = await mkContact("สมหญิง", staffA, phone, `somying-${rand}@cust.qc.invalid`, false);
    const fullName = x.name as string;
    // (1) staff A's assistant stores a PRIVATE note (G3: private memories may hold contact data — the guard covers shop facts only)
    const r1 = await rt(staffA, "remember_fact", { content: `ลูกค้า ${fullName} โทร ${phone} ชอบโปรวันศุกร์` });
    const memA = (await P.aiMemory.findMany({ where: { tenantId: T, content: { contains: phone } }, select: { id: true } })) as Any[];
    chk("E0.1", "control (premise): staff A's remember_fact with the customer's phone is stored as a PRIVATE memory (u~<staffA>~…)", memA.length === 1 && String(memA[0]?.id).startsWith(`u~${staffA}~`), `tool=${cut(r1, 100)} rows=${j(memA.map((m) => String(m.id).slice(0, 30)))}`);
    // (2) a legacy shop fact (pre-G3 row, plain cuid id) naming the customer — no phone/e-mail, so every member sees it (G3 rule)
    await P.aiMemory.create({ data: { tenantId: T, content: `${fullName} เป็นลูกค้า VIP ของร้าน ให้ส่วนลดเสมอ` } });
    // (3) the conversation where it happened (control: the erase masks these) + (4) a pending AI plan in that room
    const conv = `u~${staffA}~${hex()}`;
    await P.aiConversation.create({ data: { id: conv, tenantId: T, title: `นัด ${fullName}` } });
    await P.aiMessage.create({ data: { tenantId: T, conversationId: conv, role: "USER", content: `ช่วยจำว่า ${fullName} เบอร์ ${phone}` } });
    const plan = await P.aiPlan.create({
      data: {
        tenantId: T, conversationId: conv, title: `โทรนัด ${fullName}`, expiresAt: new Date(Date.now() + 86_400_000),
        stepsJson: [{ kind: "booking_create_appointment", summary: `นัด ${fullName} โทร ${phone}`, payload: { customerName: fullName, phone }, status: "PENDING" }],
      },
    });
    const before = await prompt(staffA);
    chk("E0.2", "control (mechanism): before the erase staff A's system prompt carries the private note (phone) and the legacy fact (full name)", has(before, phone) && has(before, fullName), `phone=${has(before, phone)} name=${has(before, fullName)}`);

    // (5) OWNER erases the contact (PDPA request) — the real service, one transaction, follow-up inline
    const DELS: string[] = [];
    const er = await CRM.privacy.eraseContact(ctxOf(owner), crmActor(owner), { contactId: x.id, confirm: true, reason: "ลูกค้าขอลบข้อมูล (probe hunt4 E)" }, { del: async (p: string) => { DELS.push(String(p)); } });
    const xAfter = await P.crmContact.findUnique({ where: { id: x.id }, select: { name: true, phone: true, email: true } });
    chk("E1.0", "control: erase succeeded and the contact row is anonymised", !!er && !has(xAfter, phone) && !has(xAfter, fullName), `erase=${cut(j(er), 200)} row=${j(xAfter)}`);
    const msgs = (await P.aiMessage.findMany({ where: { tenantId: T, conversationId: conv }, select: { content: true } })) as Any[];
    const convRow = await P.aiConversation.findUnique({ where: { id: conv }, select: { title: true } });
    chk("E1.1", "control: the same erase masks the AI conversation (AiMessage.content, AiConversation.title) — the erase does reach AI rows", msgs.every((m) => !has(m.content, phone) && !has(m.content, fullName)) && !has(convRow?.title, fullName), `messages=${j(msgs.map((m) => cut(m.content, 80)))} title=${j(convRow?.title)}`);
    const memsAfter = (await P.aiMemory.findMany({ where: { tenantId: T }, select: { id: true, content: true } })) as Any[];
    const leftPhone = memsAfter.filter((m) => has(m.content, phone));
    const leftName = memsAfter.filter((m) => has(m.content, fullName));
    chk("E1.2", "FINDING: after the PDPA erase no AiMemory row still holds the erased person's phone or full name", leftPhone.length === 0 && leftName.length === 0, `rowsWithPhone=${leftPhone.length} rowsWithName=${leftName.length} · ${j(memsAfter.map((m) => `${String(m.id).slice(0, 2)}…: ${cut(m.content, 70)}`))}`, true);
    const afterA = await prompt(staffA);
    chk("E1.3", "FINDING: staff A's next chat turn no longer feeds the erased person's phone to the model (private memory → system prompt)", !has(afterA, phone), `phoneInPrompt=${has(afterA, phone)}`, true);
    const afterB = await prompt(staffB);
    const afterO = await prompt(owner);
    chk("E1.4", "FINDING: no other member's prompt carries the erased person's full name (legacy shop fact → every member's prompt)", !has(afterB, fullName) && !has(afterO, fullName), `staffB=${has(afterB, fullName)} owner=${has(afterO, fullName)}`, true);
    const planAfter = await P.aiPlan.findUnique({ where: { id: plan.id }, select: { title: true, stepsJson: true, status: true } });
    chk("E1.5", "FINDING (same erase site, pre-existing table): the pending AI plan in that room no longer holds the phone / full name (title, stepsJson)", !has(planAfter, phone) && !has(planAfter, fullName), `plan=${cut(j(planAfter), 220)}`, true);
    info("E1.6", `files deleted by the erase follow-up: ${DELS.length}`);
  });

  // ════════ C · fix10 hidden company name × e-mail merge field ════════
  console.log("\n── C {{contact.companyName}} vs fix10 masking ──");
  await sub("C", async () => {
    const y = await mkContact("วิไล", staffA, phoneOf(), `wilai-${rand}@cust.qc.invalid`, true);
    const ctxA = ctxOf(staffA);
    const aA = crmActor(staffA);
    const masked = await CRM.contacts.companyTextsForViewer(ctxA, aA, [{ id: y.id, companyId: y.companyId, company: y.company }]);
    const ownerSees = await CRM.contacts.companyTextsForViewer(ctxOf(owner), crmActor(owner), [{ id: y.id, companyId: y.companyId, company: y.company }]);
    chk("C0.1", "control (fix10 rule): staff A (no crm.company.read) gets NO company text for the contact; the OWNER gets it", masked.get(y.id) === null && ownerSees.get(y.id) === coName, `staffA=${j(masked.get(y.id))} owner=${j(ownerSees.get(y.id))}`);
    // the customer wrote in first (transactional reply ⇒ no marketing consent needed); staff A answers, scheduled for tomorrow (no transport)
    const tk = randomBytes(16).toString("hex");
    const inRow = await P.crmEmailMessage.create({
      data: {
        tenantId: T, systemId: S, contactId: y.id, direction: "IN", messageId: `${S}:${TAG}-in@cust.qc.invalid`, threadKey: tk, fromAddr: y.email,
        toAddrs: [`crm@${TAG}.qc.invalid`], subject: `สอบถามราคา ${TAG}`, bodyText: "ขอใบเสนอราคา", status: "RECEIVED", receivedAt: new Date(), trackTokenHash: hex(),
      },
    });
    const sent = await CRM.emails.sendEmail(ctxA, aA, {
      contactId: y.id, replyToEmailId: inRow.id, subject: `Re: สอบถามราคา ${TAG}`,
      bodyText: "เรียนคุณ {{contact.firstName}} ฝ่ายจัดซื้อ {{contact.companyName}} — แนบใบเสนอราคาค่ะ", scheduledAt: new Date(Date.now() + 86_400_000),
    }, { transport: async () => ({ ok: true, id: "never" }) });
    chk("C0.2", "control: staff A may send to this contact (visible, crm.email.send) — the mail is accepted (queued)", !!sent, cut(j(sent), 160));
    const thread = await CRM.emails.getThread(ctxA, aA, tk);
    const out = (thread.messages as Any[]).find((m) => m.direction === "OUT");
    chk("C1.1", "FINDING: the mail staff A reads back in the thread does not spell out the hidden company's name (fix10: hidden ⇒ no name anywhere for that viewer)", !!out && !has(out.bodyHtml, coName) && !has(out.bodyText, coName), `outBody=${cut(out?.bodyHtml ?? out?.bodyText, 200)}`, true);
  });

  // ════════ K · manifest vs executor for a CRM-scoped API key ════════
  console.log("\n── K CRM-scoped key: manifest vs executor ──");
  await sub("K", async () => {
    await mkContact("กมล", owner, phoneOf(), `kamol-${rand}@cust.qc.invalid`, false);
    const key = await keySvc.createApiKey({ tenantId: T }, `${TAG}-crm-read`, { scopes: ["crm.contact.read"], systemId: S, createdById: owner });
    const H = { authorization: `Bearer ${key.rawKey}` };
    const lst = await SKILLS_ROUTE.GET(new Request("http://qc.invalid/api/v1/ai/skills", { headers: H }));
    const lj = (await lst.json()) as Any;
    const crmSkill = (lj?.skills ?? []).find((s: Any) => s.id === "crm");
    const one = await SKILL_ROUTE.GET(new Request("http://qc.invalid/api/v1/ai/skills/crm", { headers: H }), { params: Promise.resolve({ id: "crm" }) });
    const oj = (await one.json()) as Any;
    const listed: string[] = (oj?.tools ?? []).map((t: Any) => t?.function?.name).filter(Boolean);
    chk("K0.1", "control (premise): the manifest lists the CRM skill and crm_search for this key", lst.status === 200 && !!crmSkill && one.status === 200 && listed.includes("crm_search"), `skills=${lst.status} crm=${j(crmSkill)} skill/crm=${one.status} tools=${j(listed)}`);
    const ownerRun = await rt(owner, "crm_search", { q: "กมล" });
    chk("K0.2", "control: the tool itself works for a person (OWNER, in-app actor)", !has(ownerRun, '"error"') && has(ownerRun, "กมล"), cut(ownerRun, 140));
    const call = await TOOLS_ROUTE.POST(
      new Request("http://qc.invalid/api/v1/ai/tools/crm_search", { method: "POST", headers: { ...H, "content-type": "application/json" }, body: j({ args: { q: "กมล" } }) }),
      { params: Promise.resolve({ name: "crm_search" }) },
    );
    const cj = (await call.json()) as Any;
    const refused = has(cj?.result, '"error"');
    chk("K1.1", "FINDING: a tool the manifest advertises to this key returns data (or the manifest does not list it) — not HTTP 200 with a refusal", !(call.status === 200 && refused), `status=${call.status} result=${cut(cj?.result, 200)}`, true);
    let refusedAll = 0;
    for (const n of listed.filter((x) => x !== "crm_search")) {
      const r = await TOOLS_ROUTE.POST(new Request(`http://qc.invalid/api/v1/ai/tools/${n}`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: j({ args: {} }) }), { params: Promise.resolve({ name: n }) });
      const rj = (await r.json()) as Any;
      if (r.status === 200 && has(rj?.result, "เปิดผู้ช่วยจากหน้าแอป")) refusedAll += 1;
    }
    info("K1.2", `other advertised CRM tools answering 200 + "open the assistant from the app": ${refusedAll}/${Math.max(0, listed.length - 1)}`);
  });

  // ════════ P · (evidence) G2 room ownership × CRM proposal door ════════
  console.log("\n── P chat-room crm.* proposal cancelled by another member ──");
  await sub("P", async () => {
    const roomA = `u~${staffA}~${hex()}`;
    await P.aiConversation.create({ data: { id: roomA, tenantId: T, title: "ห้องของ A" } });
    const out = await rt(staffA, "crm_create_lead", { name: `ลูกค้าใหม่ ${TAG}`, phone: phoneOf() }, roomA);
    const prop = await P.aiProposal.findFirst({ where: { tenantId: T, conversationId: roomA }, select: { id: true, kind: true, status: true } });
    chk("P0.1", "control (premise): staff A's chat turn left a pending crm.* proposal in A's own room", !!prop && String(prop.kind).startsWith("crm.") && prop.status === "PENDING", `tool=${cut(out, 100)} proposal=${j(prop)}`);
    if (!prop) return;
    const generic = await AIP.rejectProposal({ tenantId: T, actor: act(staffB) }, prop.id);
    const genericConfirm = await AIP.executeProposal({ role: "STAFF", unitAccess: ["*"], permissions: PERM[staffB] }, { tenantId: T }, prop.id, { userId: staffB });
    chk("P0.2", "control (G2 rule): the generic doors refuse staff B on A's room — reject=false, confirm 'not found'", generic === false && genericConfirm?.ok === false, `reject=${generic} confirm=${j(genericConfirm)}`);
    // reject door of web (rejectProposalAction) + mobile (/api/mobile/proposals/reject): crm.* → aiBridges.cancelProposalById first
    const door = await CRM.aiBridges.cancelProposalById(T, { userId: staffB, role: "STAFF", unitAccess: ["*"], permissions: PERM[staffB] }, prop.id);
    const st = await P.aiProposal.findUnique({ where: { id: prop.id }, select: { status: true } });
    chk("P1.1", "FINDING: staff B (not a viewer of A's room) cannot cancel A's chat-room crm.* proposal through the reject door (web/mobile → cancelProposalById)", !(door?.ok === true) && st?.status === "PENDING", `door=${j(door)} status=${st?.status}`, true);
    // confirm door of the CRM pages (confirmAssistProposalAction → aiBridges.confirmProposal) with a client-supplied id
    await rt(staffA, "crm_create_lead", { name: `ลูกค้าใหม่สอง ${TAG}`, phone: phoneOf() }, roomA);
    const prop2 = await P.aiProposal.findFirst({ where: { tenantId: T, conversationId: roomA, status: "PENDING" }, select: { id: true } });
    let conf: Any = null;
    try {
      conf = await CRM.aiBridges.confirmProposal(ctxOf(staffB), crmActor(staffB), prop2?.id ?? "-");
    } catch (e) {
      conf = { refused: e instanceof Error ? e.message : String(e) };
    }
    const st2 = prop2 ? await P.aiProposal.findUnique({ where: { id: prop2.id }, select: { status: true, resultNote: true } }) : null;
    chk("P1.2", "FINDING: staff B cannot CONFIRM A's chat-room crm.* proposal through the CRM page door (confirmAssistProposalAction → confirmProposal)", !(conf?.ok === true) && st2?.status === "PENDING", `door=${cut(j(conf), 160)} proposal=${j(st2)}`, true);
  });
} finally {
  await new Promise((r) => setTimeout(r, 1_000));
  const left: string[] = [];
  const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[])
    .map((r) => String(r.table_name))
    .filter((t) => /^[A-Za-z_]+$/.test(t));
  if (T) {
    await P.opsEvent.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    for (const k of [T, S].filter(Boolean)) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${k}%`).catch(() => undefined);
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    for (const t of tables) {
      const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[];
      if (Number(r?.[0]?.n ?? 0) > 0) left.push(`${t}=${r[0].n}`);
    }
  }
  for (const uid of USERS) {
    await P.appNotification.deleteMany({ where: { recipientUserId: uid } }).catch(() => undefined);
    await P.session.deleteMany({ where: { userId: uid } }).catch(() => undefined);
    await P.membership.deleteMany({ where: { userId: uid } }).catch(() => undefined);
    await P.user.delete({ where: { id: uid } }).catch(() => undefined);
  }
  const buckets = T ? Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE "key" LIKE ANY($1::text[])`, [T, S].filter(Boolean).map((s) => `%${s}%`))) as Any[])[0]?.n ?? 0) : 0;
  if (T) chk("CLEAN", "throwaway tenant, users, system rows and rate buckets removed (0 rows left)", left.length === 0 && buckets === 0 && (await P.tenant.count({ where: { id: T } })) === 0 && (await P.user.count({ where: { id: { in: USERS } } })) === 0, `${left.join(" · ") || "-"} buckets=${buckets}`);
  await prisma.$disconnect();
}
const controls = cks.filter((c) => !c.finding);
const findings = cks.filter((c) => c.finding);
console.log(`\ncontrols ${controls.filter((c) => c.ok).length}/${controls.length} green · finding checks RED (= finding reproduced) ${findings.filter((c) => !c.ok).length}/${findings.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ controls: controls.map((c) => [c.id, c.ok]), findings: findings.map((c) => [c.id, c.ok ? "not reproduced" : "REPRODUCED"]) })}`);
process.exit(controls.every((c) => c.ok) ? 0 : 1);
