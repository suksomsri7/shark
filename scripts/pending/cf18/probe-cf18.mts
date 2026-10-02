// C5.5-fix13 probe (card cf18) — RED on 839b348e (hunt-4 tree) · GREEN on the fix. Own throwaway tenant `qc-cf18-*` on QC3; CLEAN at the end.
//   E  H4-1 PDPA erase reaches AI memories (private of every member · shop facts · legacy · key/job rows) and AI plans (pending + finished)
//      + support cases opened by the assistant; prompts of every member carry no erased token; re-erase is clean
//   P  H4-2 CRM proposal door respects G2 room ownership (chat-born crm.* rows: room viewers only; page-button / pseudo-room rows: old rule)
//   C  H4-3 `{{contact.companyName}}` follows the SENDER's company visibility (fix10) — system sends keep the raw text
//   K  H4-4 CRM read tools are not advertised to API keys and the route answers 403 with the working alternative; write tools stay
// Run (QC3): bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//              bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf18/probe-cf18.mts
// "FINDING" checks assert the fixed behaviour (RED on the unfixed tree); "control" checks must be GREEN on both trees.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const host = accEnv.loadQcEnv().host;
if (!/ep-weathered-river/.test(String(host ?? "")) || !/ep-weathered-river/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.error(`probe-cf18: QC3 only (host=${host})`);
  process.exit(4);
}
process.env.SHARK_AI_MOCK = "1";
delete process.env.SHARK_AI_KEY;
if (!process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = "re_qc_probe_dummy_key";
globalThis.fetch = (async () => {
  throw new Error("probe-cf18: network blocked");
}) as typeof fetch;

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
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
  const TA = (await import("@/lib/ai/tool-access" as string)) as Any;
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
  const mkContact = async (first: string, ownerUserId: string, phone: string, email: string, link: "company" | "text" | "none") => {
    const name = `${first} ${TAG}`;
    const party = await P.party.create({ data: { tenantId: T, name, kind: "PERSON", phone, email } });
    const k = await P.crmContact.create({
      data: {
        tenantId: T, systemId: S, name, firstName: first, lastName: TAG, partyId: party.id, ownerUserId, phone, email,
        ...(link === "company" ? { companyId: company.id, company: coName } : link === "text" ? { company: `ร้านเล็ก ${TAG}` } : {}),
      },
    });
    if (link === "company") await P.crmCompanyContact.create({ data: { tenantId: T, companyId: company.id, contactId: k.id, isPrimary: true } });
    return k;
  };
  const prompt = async (uid: string) => String((await svc.sendMessage({ tenantId: T, actor: act(uid) }, { text: "สวัสดี" }, { provider: new Scripted([{ text: "$SYSTEM" }]) })).reply ?? "");
  const rt = (uid: string, name: string, args: Any = {}, conversationId?: string) =>
    tools.runTool({ tenantId: T, actor: act(uid), ...(conversationId ? { conversationId } : {}) }, name, args) as Promise<string>;

  // ════════ E · H4-1 PDPA erase × AI memories / plans / support cases ════════
  console.log("\n── E PDPA erase × AiMemory / AiPlan / SupportCase ──");
  await sub("E", async () => {
    const phone = phoneOf();
    const email = `somying-${rand}@cust.qc.invalid`;
    const x = await mkContact("สมหญิง", staffA, phone, email, "none");
    const fullName = x.name as string;
    const tokensOf = (v: unknown) => [phone, fullName, email].filter((tk) => has(v, tk));
    const convA = `u~${staffA}~${hex()}`;
    await P.aiConversation.create({ data: { id: convA, tenantId: T, title: `นัด ${fullName}` } });
    await P.aiMessage.create({ data: { tenantId: T, conversationId: convA, role: "USER", content: `ช่วยจำว่า ${fullName} เบอร์ ${phone}` } });
    // memories of every owner kind
    await rt(staffA, "remember_fact", { content: `ลูกค้า ${fullName} โทร ${phone} อีเมล ${email} ชอบโปรวันศุกร์` }); // u~A (private, contact data allowed)
    await rt(staffA, "remember_fact", { content: `${fullName} ${phone}` }); // u~A — nothing but the person
    await rt(staffB, "remember_fact", { content: `${fullName} ขอให้โทรช่วงบ่าย` }); // u~B
    const ownerFact = await rt(owner, "remember_fact", { content: `${fullName} เป็นลูกค้าประจำของร้าน` }); // o~OWNER (shop fact, no contact data)
    await P.aiMemory.create({ data: { tenantId: T, content: `${fullName} เป็นลูกค้า VIP ของร้าน ให้ส่วนลดเสมอ` } }); // legacy
    await P.aiMemory.create({ data: { id: `s~daily~${hex()}`, tenantId: T, content: `สรุปเช้า: ${fullName} ยังไม่ได้จ่าย` } }); // job row
    await rt(staffA, "remember_fact", { content: `ร้านปิดทุกวันจันทร์ ${TAG}` }); // unrelated control
    const unrelBefore = await P.aiMemory.findFirst({ where: { tenantId: T, content: `ร้านปิดทุกวันจันทร์ ${TAG}` }, select: { id: true, content: true, updatedAt: true } });
    const memBefore = (await P.aiMemory.findMany({ where: { tenantId: T }, select: { id: true, content: true } })) as Any[];
    chk("E0.1", "control (premise): 7 memories exist (u~A ×3 · u~B · o~OWNER · legacy · s~job), 6 of them name the person", memBefore.length === 7 && memBefore.filter((m) => tokensOf(m.content).length).length === 6, `rows=${memBefore.length} withPerson=${memBefore.filter((m) => tokensOf(m.content).length).length} ownerFact=${cut(ownerFact, 80)} ids=${j(memBefore.map((m) => String(m.id).slice(0, 2)))}`);
    // plans: pending (room of A) · finished (DONE) · unrelated pending (control)
    const exp = new Date(Date.now() + 86_400_000);
    const planP = await P.aiPlan.create({
      data: {
        tenantId: T, conversationId: convA, title: `โทรนัด ${fullName}`, expiresAt: exp,
        stepsJson: [{ kind: "booking_create_appointment", summary: `นัด "${fullName}" โทร ${phone}`, payload: { customerName: fullName, phone, qty: 2, tags: ["vip", fullName] }, status: "PENDING" }],
      },
    });
    const planD = await P.aiPlan.create({
      data: {
        tenantId: T, conversationId: convA, title: "ปิดยอดวันนี้", status: "DONE", expiresAt: exp, executedAt: new Date(),
        stepsJson: [{ kind: "booking_create_appointment", summary: "นัดลูกค้า", payload: { email }, status: "DONE", note: `นัดแล้ว ${fullName}` }],
      },
    });
    const planU = await P.aiPlan.create({
      data: { tenantId: T, conversationId: convA, title: `ตรวจสต็อก ${TAG}`, expiresAt: exp, stepsJson: [{ kind: "booking_create_appointment", summary: "อื่น", payload: { n: 1 }, status: "PENDING" }] },
    });
    // support case opened by the assistant from A's room
    const sup = await rt(staffA, "support_open_case", { subject: `ลูกค้า ${fullName} แจ้งปัญหาใบเสร็จ`, detail: `ลูกค้าโทร ${phone} บอกว่าใบเสร็จไม่ออก` }, convA);
    const before = { A: await prompt(staffA), B: await prompt(staffB), O: await prompt(owner) };
    chk("E0.2", "control (mechanism): before the erase the prompts of A (private: phone), B (private: name) and OWNER (shop fact: name) carry the person", has(before.A, phone) && has(before.B, fullName) && has(before.O, fullName), `A=${j(tokensOf(before.A))} B=${j(tokensOf(before.B))} O=${j(tokensOf(before.O))} support=${cut(sup, 60)}`);

    const DELS: string[] = [];
    const er = await CRM.privacy.eraseContact(ctxOf(owner), crmActor(owner), { contactId: x.id, confirm: true, reason: "ลูกค้าขอลบข้อมูล (probe cf18 E)" }, { del: async (p: string) => { DELS.push(String(p)); } });
    const xAfter = await P.crmContact.findUnique({ where: { id: x.id }, select: { name: true, phone: true, email: true } });
    chk("E1.0", "control: erase succeeded, contact row anonymised", er?.erased === true && tokensOf(xAfter).length === 0, `erased=${er?.erased} counts.aiMessages=${er?.counts?.aiMessages} notifications=${er?.counts?.notifications}`);
    const msgs = (await P.aiMessage.findMany({ where: { tenantId: T, conversationId: convA, role: "USER" }, select: { content: true } })) as Any[];
    const convRow = await P.aiConversation.findUnique({ where: { id: convA }, select: { title: true } });
    chk("E1.1", "control: AI messages / conversation title are still masked by the erase", msgs.length > 0 && msgs.every((m) => tokensOf(m.content).length === 0 && has(m.content, MASK)) && tokensOf(convRow?.title).length === 0, `msgs=${j(msgs.map((m) => cut(m.content, 60)))} title=${j(convRow?.title)}`);
    const memAfter = (await P.aiMemory.findMany({ where: { tenantId: T }, select: { id: true, content: true, updatedAt: true } })) as Any[];
    const left = memAfter.filter((m) => tokensOf(m.content).length);
    chk("E1.2", "FINDING: no AiMemory row (private of A and B · OWNER shop fact · legacy · job row) still holds the phone / name / e-mail", left.length === 0, `left=${left.length} · ${j(memAfter.map((m) => `${String(m.id).slice(0, 2)}: ${cut(m.content, 60)}`))}`, true);
    const kinds = new Set(memAfter.filter((m) => has(m.content, MASK)).map((m) => (String(m.id).includes("~") ? String(m.id).slice(0, 2) : "legacy")));
    chk("E1.3", "FINDING: memories keep their other content with the mask (u~ ×2 owners, o~, legacy, s~ masked in place, 'ชอบโปรวันศุกร์' kept)", ["u~", "o~", "legacy", "s~"].every((k) => kinds.has(k)) && memAfter.some((m) => has(m.content, "ชอบโปรวันศุกร์") && has(m.content, MASK)) && memAfter.filter((m) => String(m.id).startsWith("u~")).length === 3, `maskedKinds=${j([...kinds])} uRows=${memAfter.filter((m) => String(m.id).startsWith("u~")).length}`, true);
    chk("E1.4", "FINDING: the memory that was nothing but the person ('<name> <phone>') is deleted (7 → 6 rows)", memAfter.length === 6 && !memAfter.some((m) => String(m.content).replace(/\[ข้อมูลถูกลบ\]/g, "").replace(/[\s\p{P}]/gu, "") === ""), `rows=${memAfter.length}`, true);
    const unrelAfter = memAfter.find((m) => m.id === unrelBefore?.id);
    chk("E1.5", "control: an unrelated memory is untouched (content and updatedAt)", !!unrelAfter && unrelAfter.content === unrelBefore.content && new Date(unrelAfter.updatedAt).getTime() === new Date(unrelBefore.updatedAt).getTime(), `${j(unrelAfter?.content)}`);
    const after = { A: await prompt(staffA), B: await prompt(staffB), O: await prompt(owner) };
    chk("E1.6", "FINDING: the next system prompt of A, B and OWNER carries none of the erased tokens", tokensOf(after.A).length + tokensOf(after.B).length + tokensOf(after.O).length === 0, `A=${j(tokensOf(after.A))} B=${j(tokensOf(after.B))} O=${j(tokensOf(after.O))}`, true);
    const pP = await P.aiPlan.findUnique({ where: { id: planP.id }, select: { title: true, stepsJson: true, status: true } });
    const pD = await P.aiPlan.findUnique({ where: { id: planD.id }, select: { title: true, stepsJson: true, status: true } });
    const pU = await P.aiPlan.findUnique({ where: { id: planU.id }, select: { title: true, stepsJson: true, status: true } });
    const st0 = Array.isArray(pP?.stepsJson) ? pP.stepsJson[0] : null;
    chk("E1.7", "FINDING: the pending plan holds no token (title · summary · payload incl. arrays) and is retired (EXPIRED); structure/kinds/numbers intact", tokensOf(pP).length === 0 && pP?.status === "EXPIRED" && st0?.kind === "booking_create_appointment" && st0?.payload?.qty === 2 && Array.isArray(st0?.payload?.tags) && st0.payload.tags[0] === "vip" && has(pP?.title, MASK), `plan=${cut(j(pP), 260)}`, true);
    chk("E1.8", "FINDING: the finished plan (DONE) holds no token and keeps its status", tokensOf(pD).length === 0 && pD?.status === "DONE" && has(pD, MASK), `plan=${cut(j(pD), 200)}`, true);
    chk("E1.9", "control: an unrelated pending plan is untouched (PENDING, same title)", pU?.status === "PENDING" && pU?.title === `ตรวจสต็อก ${TAG}`, `plan=${cut(j(pU), 120)}`);
    const cases = (await P.supportCase.findMany({ where: { tenantId: T }, select: { subject: true, messages: { select: { body: true } } } })) as Any[];
    chk("E1.10", "FINDING: the support case the assistant opened (subject + first message) no longer holds the phone / name", cases.length === 1 && tokensOf(cases).length === 0 && has(cases, MASK), `cases=${cut(j(cases), 200)}`, true);
    // re-erase: same answer path (resweep), no error, nothing new to mask, memories unchanged
    const snap = j(memAfter.map((m) => [m.id, m.content]).sort());
    let re: Any = null;
    try {
      re = await CRM.privacy.eraseContact(ctxOf(owner), crmActor(owner), { contactId: x.id, confirm: true, reason: "ลบซ้ำ (probe cf18 E)" }, { del: async () => undefined });
    } catch (e) {
      re = { threw: e instanceof Error ? e.message : String(e) };
    }
    const memRe = (await P.aiMemory.findMany({ where: { tenantId: T }, select: { id: true, content: true } })) as Any[];
    chk("E1.11", "control: re-erase runs clean (no throw) and leaves the masked memories as they were", !re?.threw && j(memRe.map((m) => [m.id, m.content]).sort()) === snap, `re=${cut(j(re), 160)}`);
    info("E1.12", `erase counts ${j(er?.counts)} · files deleted ${DELS.length}`);
  });

  // ════════ P · H4-2 G2 room ownership × CRM proposal door ════════
  console.log("\n── P CRM proposal door × G2 rooms ──");
  await sub("P", async () => {
    const roomA = `u~${staffA}~${hex()}`;
    await P.aiConversation.create({ data: { id: roomA, tenantId: T, title: "ห้องของ A" } });
    const mk = async (label: string) => {
      await rt(staffA, "crm_create_lead", { name: `${label} ${TAG}`, phone: phoneOf() }, roomA);
      return (await P.aiProposal.findFirst({ where: { tenantId: T, conversationId: roomA, status: "PENDING" }, orderBy: { createdAt: "desc" }, select: { id: true, kind: true, status: true } })) as Any;
    };
    const statusOf = async (id: string) => (await P.aiProposal.findUnique({ where: { id }, select: { status: true } }))?.status;
    // one proposal per check (on the unfixed tree a successful foreign cancel/confirm would change the row the next check needs)
    const pB1 = await mk("ลูกค้าหนึ่ง");
    const pB2 = await mk("ลูกค้าสอง");
    const pO = await mk("ลูกค้าสาม");
    const pA1 = await mk("ลูกค้าสี่");
    const pA2 = await mk("ลูกค้าห้า");
    chk("P0.1", "control (premise): A's chat turns left 5 pending crm.* proposals in A's own room", [pB1, pB2, pO, pA1, pA2].every((p) => p && String(p.kind).startsWith("crm.")) && new Set([pB1, pB2, pO, pA1, pA2].map((p) => p?.id)).size === 5, j(pB1));
    const ghost = `c${hex()}`;
    const doorB = await CRM.aiBridges.cancelProposalById(T, doorActor(staffB), pB1.id);
    const doorGhost = await CRM.aiBridges.cancelProposalById(T, doorActor(staffB), ghost);
    const stB1 = await statusOf(pB1.id);
    chk("P1.1", "FINDING: staff B cannot cancel A's chat-room proposal (reject door) — answer identical to a non-existent id, row stays PENDING", j(doorB) === j(doorGhost) && stB1 === "PENDING", `door=${j(doorB)} ghost=${j(doorGhost)} status=${stB1}`, true);
    const errOf = async (uid: string, id: string) => {
      try {
        const r = await CRM.aiBridges.confirmProposal(ctxOf(uid), crmActor(uid), id);
        return { ok: r?.ok === true, note: r?.note };
      } catch (e) {
        return { ok: false, refused: e instanceof Error ? e.message : String(e), code: (e as Any)?.code ?? null };
      }
    };
    const cB = await errOf(staffB, pB2.id);
    const cGhost = await errOf(staffB, ghost);
    const stB2 = await statusOf(pB2.id);
    chk("P1.2", "FINDING: staff B cannot confirm it through the CRM page door — same refusal as a non-existent id, row stays PENDING", !cB.ok && j(cB) === j(cGhost) && stB2 === "PENDING", `B=${cut(j(cB), 160)} ghost=${j(cGhost)} status=${stB2}`, true);
    const cO = await errOf(owner, pO.id);
    const doorO = await CRM.aiBridges.cancelProposalById(T, doorActor(owner), pO.id);
    const stO = await statusOf(pO.id);
    chk("P1.3", "FINDING: the OWNER is not a viewer of A's u~ room either (G2) — page confirm and reject door answer 'not found', row stays PENDING", !cO.ok && j(cO) === j(cGhost) && j(doorO) === j(doorGhost) && stO === "PENDING", `owner confirm=${cut(j(cO), 120)} reject=${j(doorO)} status=${stO}`, true);
    const cA = await errOf(staffA, pA1.id);
    const stA1 = await statusOf(pA1.id);
    chk("P0.2", "control: A (room creator) confirms her own proposal through the CRM door", cA.ok && stA1 === "EXECUTED", `A=${cut(j(cA), 120)} status=${stA1}`);
    const doorA = await CRM.aiBridges.cancelProposalById(T, doorActor(staffA), pA2.id);
    chk("P0.3", "control: A cancels her own chat-room proposal through the reject door", doorA?.handled === true && doorA?.ok === true && (await statusOf(pA2.id)) === "REJECTED", j(doorA));
    // pseudo-room rows keep the old rule: card scan (crm:card:…) and a page-button row (requestedByUserId, `<prefix>:<hex>`)
    const card = await P.aiProposal.create({
      data: { tenantId: T, conversationId: `crm:card:${S}`, kind: "crm_create_lead", summary: "นามบัตร", payload: { systemId: S, name: `นามบัตร ${TAG}`, phone: "", email: "", company: "", jobTitle: "" }, expiresAt: new Date(Date.now() + 3_600_000) },
    });
    const page = await P.aiProposal.create({
      data: { tenantId: T, conversationId: `crm:assist:${hex()}`, kind: "crm.contacts.create", summary: "ปุ่มในหน้า", payload: { systemId: S, requestedByUserId: staffA, opId: "contacts.create", input: { name: `ปุ่ม ${TAG}` }, params: {} }, expiresAt: new Date(Date.now() + 3_600_000) },
    });
    const dCard = await CRM.aiBridges.cancelProposalById(T, doorActor(staffB), card.id);
    const dPage = await CRM.aiBridges.cancelProposalById(T, doorActor(staffB), page.id);
    chk("P0.4", "control: pseudo-room rows keep the old door rule — staff B (has crm.contact.create) cancels a card-scan row and a page-button row", dCard?.ok === true && dPage?.ok === true, `card=${j(dCard)} page=${j(dPage)}`);
    // key room (k~): proposal made by an API key → OWNER confirms/cancels (route contract) · other staff = not found (same as executeProposal)
    const key = await keySvc.createApiKey({ tenantId: T }, `${TAG}-crm-write`, { scopes: ["crm.contact.read", "crm.contact.create"], systemId: S, createdById: owner });
    const H = { authorization: `Bearer ${key.rawKey}`, "content-type": "application/json" };
    const viaKey = async (label: string) => {
      const res = await TOOLS_ROUTE.POST(new Request("http://qc.invalid/api/v1/ai/tools/crm_create_lead", { method: "POST", headers: H, body: j({ args: { name: `${label} ${TAG}`, phone: phoneOf() } }) }), { params: Promise.resolve({ name: "crm_create_lead" }) });
      const rj = (await res.json()) as Any;
      const kp = await P.aiProposal.findFirst({ where: { tenantId: T, conversationId: String(rj?.conversationId ?? "-") }, select: { id: true, conversationId: true } });
      return { status: res.status, pending: rj?.pendingConfirmation === true, kp };
    };
    const k1 = await viaKey("คีย์หนึ่ง");
    const k2 = await viaKey("คีย์สอง");
    chk("P0.5", "control (premise + K: write tools stay for keys): the key's write tool answers 200 pendingConfirmation and leaves a proposal in a k~ room", [k1, k2].every((k) => k.status === 200 && k.pending && String(k.kp?.conversationId ?? "").startsWith("k~")), `status=${k1.status}/${k2.status} conv=${cut(k1.kp?.conversationId, 30)}`);
    if (k1.kp && k2.kp) {
      const kB = await CRM.aiBridges.cancelProposalById(T, doorActor(staffB), k1.kp.id);
      chk("P1.4", "FINDING: staff B cannot cancel a key-room (k~) proposal — aligned with executeProposal (OWNER only), same answer as a non-existent id", j(kB) === j(doorGhost) && (await statusOf(k1.kp.id)) === "PENDING", `B=${j(kB)}`, true);
      const kO = await CRM.aiBridges.cancelProposalById(T, doorActor(owner), k2.kp.id);
      chk("P0.6", "control: the OWNER cancels a key-room proposal (route contract: the owner confirms in the app)", kO?.ok === true, j(kO));
    }
  });

  // ════════ C · H4-3 {{contact.companyName}} × fix10 ════════
  console.log("\n── C {{contact.companyName}} × sender's company visibility ──");
  await sub("C", async () => {
    const y = await mkContact("วิไล", staffA, phoneOf(), `wilai-${rand}@cust.qc.invalid`, "company");
    const z = await mkContact("มานี", staffA, phoneOf(), `manee-${rand}@cust.qc.invalid`, "text");
    const ctxA = ctxOf(staffA);
    const aA = crmActor(staffA);
    const masked = await CRM.contacts.companyTextsForViewer(ctxA, aA, [{ id: y.id, companyId: y.companyId, company: y.company }]);
    chk("C0.1", "control (fix10 rule): A gets no company text for y (linked company hidden from A)", masked.get(y.id) === null, `A=${j(masked.get(y.id))}`);
    const inRow = async (k: Any) =>
      P.crmEmailMessage.create({
        data: {
          tenantId: T, systemId: S, contactId: k.id, direction: "IN", messageId: `${S}:${TAG}-${k.id}-in@cust.qc.invalid`, threadKey: randomBytes(16).toString("hex"), fromAddr: k.email,
          toAddrs: [`crm@${TAG}.qc.invalid`], subject: `สอบถาม ${TAG}`, bodyText: "ขอใบเสนอราคา", status: "RECEIVED", receivedAt: new Date(), trackTokenHash: hex(),
        },
      });
    const iy = await inRow(y);
    const iz = await inRow(z);
    const tpl = await P.crmEmailTemplate.create({ data: { tenantId: T, systemId: S, name: `tpl ${TAG}`, subject: "ใบเสนอราคา {{contact.companyName}}", bodyHtml: "<p>เรียน {{contact.firstName}} ฝ่ายจัดซื้อ {{contact.companyName}}</p>" } });
    const later = () => new Date(Date.now() + 86_400_000);
    const tr = { transport: async () => ({ ok: true, id: "never" }) };
    const bodyOf = async (r: Any) => P.crmEmailMessage.findUnique({ where: { id: r.emailId }, select: { subject: true, bodyHtml: true, bodyText: true } });
    const comp = await CRM.emails.sendEmail(ctxA, aA, { contactId: y.id, replyToEmailId: iy.id, subject: `Re: ${TAG} {{contact.companyName}}`, bodyText: "ฝ่ายจัดซื้อ {{contact.companyName}} — แนบใบเสนอราคาค่ะ", scheduledAt: later() }, tr);
    const tplA = await CRM.emails.sendEmail(ctxA, aA, { contactId: y.id, replyToEmailId: iy.id, templateId: tpl.id, scheduledAt: later() }, tr);
    const bComp = await bodyOf(comp);
    const bTpl = await bodyOf(tplA);
    chk("C1.1", "FINDING: A's composer mail (subject + body) does not spell out the hidden company's name (rendered as empty, like 'no company')", !has(bComp, coName) && has(bComp?.bodyHtml, "ฝ่ายจัดซื้อ") && !has(bComp, "{{"), `mail=${cut(j(bComp), 200)}`, true);
    chk("C1.2", "FINDING: A's template mail (subject + body) does not spell out the hidden company's name", !has(bTpl, coName) && has(bTpl?.bodyHtml, "ฝ่ายจัดซื้อ") && !has(bTpl, "{{"), `mail=${cut(j(bTpl), 200)}`, true);
    const thread = await CRM.emails.getThread(ctxA, aA, iy.threadKey);
    chk("C1.3", "FINDING: the thread A reads back holds no hidden company name", !has(thread.messages, coName), `outs=${(thread.messages as Any[]).filter((m) => m.direction === "OUT").length}`, true);
    const oComp = await CRM.emails.sendEmail(ctxOf(owner), crmActor(owner), { contactId: y.id, replyToEmailId: iy.id, subject: `Re: ${TAG}`, bodyText: "ฝ่ายจัดซื้อ {{contact.companyName}}", scheduledAt: later() }, tr);
    const oTpl = await CRM.emails.sendEmail(ctxOf(owner), crmActor(owner), { contactId: y.id, replyToEmailId: iy.id, templateId: tpl.id, scheduledAt: later() }, tr);
    chk("C0.2", "control: the OWNER (sees the company) still gets the company name in composer and template mails", has(await bodyOf(oComp), coName) && has(await bodyOf(oTpl), coName), "owner composer + template");
    const sys = await CRM.emails.sendAsSystem({ tenantId: T, systemId: S }, { contactId: y.id, replyToEmailId: iy.id, templateId: tpl.id, scheduledAt: later() }, tr);
    chk("C0.3", "control: a system send (sequence / rule sender `sendAsSystem`) keeps the raw company text — the mail goes to the contact", has(await bodyOf(sys), coName), cut(j(await bodyOf(sys)), 160));
    const zA = await CRM.emails.sendEmail(ctxA, aA, { contactId: z.id, replyToEmailId: iz.id, subject: `Re: ${TAG}`, bodyText: "ฝ่ายจัดซื้อ {{contact.companyName}}", scheduledAt: later() }, tr);
    chk("C0.4", "control: a contact with company TEXT but no linked company keeps the text for A (fix10: unlinked = original text)", has(await bodyOf(zA), `ร้านเล็ก ${TAG}`), cut(j(await bodyOf(zA)), 160));
  });

  // ════════ K · H4-4 CRM read tools × API keys ════════
  console.log("\n── K CRM-scoped key: manifest vs executor ──");
  await sub("K", async () => {
    await mkContact("กมล", owner, phoneOf(), `kamol-${rand}@cust.qc.invalid`, "none");
    const key = await keySvc.createApiKey({ tenantId: T }, `${TAG}-crm-read`, { scopes: ["crm.contact.read"], systemId: S, createdById: owner });
    const H = { authorization: `Bearer ${key.rawKey}` };
    const lst = await SKILLS_ROUTE.GET(new Request("http://qc.invalid/api/v1/ai/skills", { headers: H }));
    const lj = (await lst.json()) as Any;
    const one = await SKILL_ROUTE.GET(new Request("http://qc.invalid/api/v1/ai/skills/crm", { headers: H }), { params: Promise.resolve({ id: "crm" }) });
    const oj = (await one.json()) as Any;
    const listed: string[] = (oj?.tools ?? []).map((t: Any) => t?.function?.name).filter(Boolean);
    const reads = ["crm_search", "crm_contact_360", "crm_score_explain"];
    chk("K1.1", "FINDING: the manifest no longer advertises CRM read tools to a read-only CRM key (skills list + skills/crm)", !(lj?.skills ?? []).some((s: Any) => s.id === "crm") && !reads.some((n) => listed.includes(n)), `skills=${j((lj?.skills ?? []).map((s: Any) => `${s.id}:${s.toolCount}`))} skill/crm=${one.status} tools=${j(listed)}`, true);
    const call = await TOOLS_ROUTE.POST(
      new Request("http://qc.invalid/api/v1/ai/tools/crm_search", { method: "POST", headers: { ...H, "content-type": "application/json" }, body: j({ args: { q: "กมล" } }) }),
      { params: Promise.resolve({ name: "crm_search" }) },
    );
    const cj = (await call.json()) as Any;
    chk("K1.2", "FINDING: calling a CRM read tool with the key answers 403 naming the working path (/api/v1/crm) — no 'open the app and ask again'", call.status === 403 && has(cj?.error, "/api/v1/crm") && !has(cj, "ถามอีกครั้ง") && !has(cj, "ลองใหม่"), `status=${call.status} body=${cut(j(cj), 220)}`, true);
    const keyW = await keySvc.createApiKey({ tenantId: T }, `${TAG}-crm-rw`, { scopes: ["crm.contact.read", "crm.contact.create"], systemId: S, createdById: owner });
    const oneW = await SKILL_ROUTE.GET(new Request("http://qc.invalid/api/v1/ai/skills/crm", { headers: { authorization: `Bearer ${keyW.rawKey}` } }), { params: Promise.resolve({ id: "crm" }) });
    const listedW: string[] = (((await oneW.json()) as Any)?.tools ?? []).map((t: Any) => t?.function?.name).filter(Boolean);
    chk("K0.1", "control: a key with a CRM write scope still sees the CRM write tool (crm_create_lead)", oneW.status === 200 && listedW.includes("crm_create_lead"), `tools=${j(listedW)}`);
    chk("K1.3", "FINDING: …and no CRM read tool next to it", !reads.some((n) => listedW.includes(n)), `tools=${j(listedW)}`, true);
    const offered = TA.toolsOfferedTo(act(staffB), ["crm_search", "crm_contact_360", "crm_create_lead"]);
    const ownerRun = await rt(owner, "crm_search", { q: "กมล" });
    chk("K0.2", "control: people keep the CRM tools — staff B is offered crm_search/360/create_lead; OWNER's crm_search returns data", offered.length === 3 && !has(ownerRun, '"error"') && has(ownerRun, "กมล"), `offered=${j(offered)} owner=${cut(ownerRun, 100)}`);
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
console.log(`\ncontrols ${controls.filter((c) => c.ok).length}/${controls.length} green · findings GREEN (fixed) ${findings.filter((c) => c.ok).length}/${findings.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ controls: controls.map((c) => [c.id, c.ok]), findings: findings.map((c) => [c.id, c.ok ? "GREEN" : "RED"]) })}`);
process.exit(cks.every((c) => c.ok) ? 0 : 1);
