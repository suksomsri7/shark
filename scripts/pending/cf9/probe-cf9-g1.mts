// probe — CRM C5.5-G1: every AI tool call runs AS THE CALLER (actor) — RED on 5ebea63f, GREEN after the card.
//   The probe passes an actor everywhere (plain objects, no import of ai/actor.ts) so the SAME file runs on both trees:
//   on the untouched tree `runTool`/`sendMessage` ignore the extra field ⇒ the leaks show as red checks.
//   Personas: OWNER · MANAGER limited to branch u1 · STAFF with only ai.chat.send · STAFF ai+crm.contact.read (team A) ·
//             STAFF ai+member.customer.read · STAFF ai+kb.article.create · STAFF ai+pos.sale.create · API keys (scope-less "general",
//             account-only) at the executor and through the REAL route `POST /api/v1/ai/tools/[name]`.
//   Model: scripted provider (no network · `globalThis.fetch` blocked · SHARK_AI_MOCK=1 for the doors that pick their own provider).
//   G*  = gate/visibility checks (counted) · P* = positive controls (counted) · I* = info (not counted)
//   OWNER outputs of every read tool are written (normalised) to $CF9_OWNER_OUT for a byte-for-byte diff between the two trees.
// QC3 ONLY (ep-weathered-river) · throwaway tenant `qc-cf9-*` swept in finally (0 rows left).
// Run: bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 CF9_OWNER_OUT=/tmp/cf9-logs/owner-<label>.json \
//        bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf9/probe-cf9-g1.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-weathered-river/.test(host) || !/ep-weathered-river/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.log(`QC3 only — got ${host}`);
  process.exit(1);
}
process.env.SHARK_AI_MOCK = "1"; // doors that resolve their own provider get the echo mock, never a live model
delete process.env.SHARK_AI_KEY;
globalThis.fetch = (async () => {
  throw new Error("network blocked");
}) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-cf9-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const res: { id: string; ok: boolean }[] = [];
const chk = (id: string, ok: boolean, msg: string) => {
  res.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${msg}`);
};
const info = (id: string, msg: string) => console.log(`  ℹ️  [${id}] ${msg}`);
const j = (v: unknown) => JSON.stringify(v);
const cut = (v: unknown, n = 170) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const USERS: string[] = [];
const TENANTS: string[] = [];
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
const tools = (await import("@/lib/ai/tools" as string)) as Any;
const svc = (await import("@/lib/ai/service" as string)) as Any;
const mkUser = async (suffix: string) => {
  const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix} ${TAG}` } });
  USERS.push(u.id);
  return u.id as string;
};
const member = (uid: string, tid: string, role: string, unitAccess: string[], permissions: Record<string, boolean>) =>
  P.membership.create({ data: { userId: uid, tenantId: tid, role, unitAccess, permissions, acceptedAt: new Date() } });
const setCrm = (sysId: string, obj: Record<string, unknown>) =>
  P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
      (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify(obj),
    sysId,
  );
// ── Next request scope (technique of probe-fix1 / probe-cf8-actions) — for the web server actions ──
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-cf9", "x-forwarded-for": "203.0.113.190" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const afterContext = { after: (_task: Any) => undefined };
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [], afterContext };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}
const coreHash = (await import("@/lib/core/hash" as string)) as Any;
async function sessionCookie(uid: string, tid: string): Promise<string> {
  const token = coreHash.randomToken(32) as string;
  await P.session.create({ data: { userId: uid, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 86_400_000), expiresAt: new Date(Date.now() + 86_400_000) } });
  return `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${tid}`;
}

// scripted model: a list of replies; `text: "$LAST_TOOL"` echoes the last tool result (so a door that only stores the reply shows it)
class Scripted {
  calls: { tools: string[]; system: string }[] = [];
  private i = 0;
  constructor(private steps: Any[]) {}
  async chat(messages: Any[], opts?: { tools?: { name: string; parameters?: Any }[] }) {
    this.calls.push({ tools: (opts?.tools ?? []).map((t) => t.name), system: String(messages.find((m: Any) => m.role === "system")?.content ?? "") });
    const step = this.steps[Math.min(this.i, this.steps.length - 1)];
    this.i += 1;
    if (step.text === "$LAST_TOOL") {
      const last = [...messages].reverse().find((m: Any) => m.role === "tool");
      return { text: `ผลเครื่องมือ: ${last?.content ?? "(ไม่มี)"}`, tokensIn: 10, tokensOut: 10, model: "scripted" };
    }
    return { text: step.text ?? "", toolCalls: step.toolCalls, tokensIn: 10, tokensOut: 10, model: "scripted" };
  }
}
const isRefusal = (out: string) => {
  try {
    const o = JSON.parse(out) as Any;
    return typeof o?.error === "string" && /ไม่มีสิทธิ์|ใช้เครื่องมือนี้ไม่ได้|ไม่ทราบว่าใคร/.test(o.error);
  } catch {
    return false;
  }
};
// normalise an OWNER tool output so the two trees can be compared byte-for-byte (ids, dates, times, the run tag)
const norm = (s: string) =>
  String(s)
    .split(TAG).join("<TAG>")
    .replace(/\bc[a-z0-9]{20,30}\b/g, "<ID>")
    .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}\s*\d{1,2}:\d{2}/g, "<DT>")
    .replace(/\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?/g, "<DATE>")
    .replace(/\b\d{1,2}:\d{2}\b/g, "<HM>");

let tA = "";
try {
  // ═══ world ═══
  const t = await P.tenant.create({ data: { name: `${TAG}-a`, slug: `${TAG}-a` } });
  tA = t.id;
  TENANTS.push(tA);
  const u1 = (await P.businessUnit.create({ data: { tenantId: tA, type: "SHOP", name: "สาขาหนึ่ง", slug: `${TAG}-u1` } })).id as string;
  const u2 = (await P.businessUnit.create({ data: { tenantId: tA, type: "SHOP", name: "สาขาสอง", slug: `${TAG}-u2` } })).id as string;
  const owner = await mkUser("-owner");
  const mgr = await mkUser("-mgr");
  const staffAi = await mkUser("-ai");
  const staffCrm = await mkUser("-crm");
  const staffMem = await mkUser("-mem");
  const staffKb = await mkUser("-kb");
  const staffPos = await mkUser("-pos");
  const AI = { "ai.chat.send": true };
  const perms: Record<string, Record<string, boolean>> = {
    [owner]: {}, [mgr]: {}, [staffAi]: AI, [staffCrm]: { ...AI, "crm.contact.read": true }, [staffMem]: { ...AI, "member.customer.read": true },
    [staffKb]: { ...AI, "kb.article.create": true }, [staffPos]: { ...AI, "pos.sale.create": true },
  };
  await member(owner, tA, "OWNER", ["*"], perms[owner]!);
  await member(mgr, tA, "MANAGER", [u1], perms[mgr]!);
  for (const s of [staffAi, staffCrm, staffMem, staffKb, staffPos]) await member(s, tA, "STAFF", ["*"], perms[s]!);
  const act = (uid: string) => {
    const role = uid === owner ? "OWNER" : uid === mgr ? "MANAGER" : "STAFF";
    return { kind: "member", tenantId: tA, userId: uid, membership: { role, unitAccess: uid === mgr ? [u1] : ["*"], permissions: perms[uid] } };
  };
  const keyActor = (scopes: string[], systemId: string | null = null) => ({ kind: "apiKey", tenantId: tA, keyId: `${TAG}-k`, scopes, systemId });

  // systems (fixed names so OWNER outputs compare across trees)
  const A = (await sysSvc.createSystem(tA, "ACCOUNT", "บัญชีทดสอบ")).id as string;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  await accSvc.saveSettings(tA, A, { orgName: "QC ร้านทดสอบ", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  const M = (await sysSvc.createSystem(tA, "MEMBER", "สมาชิกทดสอบ")).id as string;
  await sysSvc.createSystem(tA, "KANBAN", "บอร์ดทดสอบ");
  await sysSvc.createSystem(tA, "CHAT", "แชททดสอบ");
  const C1 = (await sysSvc.createSystem(tA, "CRM", "CRM หนึ่ง")).id as string;
  const C2 = (await sysSvc.createSystem(tA, "CRM", "CRM สอง")).id as string;
  const C3 = (await sysSvc.createSystem(tA, "CRM", "CRM รุ่นเดิม")).id as string;
  await setCrm(C1, { uiVersion: 2 });
  await setCrm(C2, { uiVersion: 2 });
  await setCrm(C3, { uiVersion: 1 });
  const teamA = (await P.team.create({ data: { tenantId: tA, name: `${TAG}-A`, unitIds: [u1] } })).id as string;
  const teamB = (await P.team.create({ data: { tenantId: tA, name: `${TAG}-B`, unitIds: [u2] } })).id as string;
  await P.teamMember.create({ data: { tenantId: tA, teamId: teamA, userId: staffCrm } });
  const day = 86_400_000;
  await P.crmContact.create({ data: { tenantId: tA, systemId: C1, name: "ลีดทีมเอ", phone: "0811000001", ownerUserId: staffCrm, teamId: teamA, source: "LINE", createdAt: new Date(Date.now() - 3 * day) } });
  await P.crmContact.create({ data: { tenantId: tA, systemId: C2, name: "ลีดทีมบี", phone: "0811000002", ownerUserId: owner, teamId: teamB, source: "เว็บ", createdAt: new Date(Date.now() - 2 * day) } });
  await P.crmContact.create({ data: { tenantId: tA, systemId: C3, name: "ลีดระบบเดิม", phone: "0811000003", source: "walk-in", createdAt: new Date(Date.now() - 1 * day) } });
  await P.customer.create({ data: { tenantId: tA, memberSystemId: M, name: "สมาชิกสาขาหนึ่ง", phone: "0899000101", homeUnitId: u1, memberCode: "QCA001" } });
  await P.customer.create({ data: { tenantId: tA, memberSystemId: M, name: "สมาชิกสาขาสอง", phone: "0899000102", homeUnitId: u2, memberCode: "QCA002" } });
  await P.shopOrder.create({ data: { tenantId: tA, unitId: u1, code: "SO-QC1", customerName: "ผู้ซื้อสาขาหนึ่ง", customerPhone: "0822000001", totalSatang: 10_000 } });
  await P.shopOrder.create({ data: { tenantId: tA, unitId: u2, code: "SO-QC2", customerName: "ผู้ซื้อสาขาสอง", customerPhone: "0822000002", totalSatang: 20_000 } });
  await P.aiCreditWallet.create({ data: { tenantId: tA, balanceMicro: 50_000_000, grantedAt: new Date() } });
  const conv = await P.aiConversation.create({ data: { tenantId: tA, title: "QC G1" } });
  const rt = (actor: Any, name: string, args: Any = {}) => tools.runTool({ tenantId: tA, actor, conversationId: conv.id }, name, args) as Promise<string>;

  // ═══ G0 registry: every registered tool is mapped by the access table (unknown = denied) ═══
  console.log("\n── G0 access table covers the registry ──");
  let unmapped: string[] = ["(tool-access missing)"];
  try {
    const TA = (await import("@/lib/ai/tool-access" as string)) as Any;
    unmapped = (tools.toolRegistry() as Any[]).map((x) => x.def.name).filter((n: string) => !TA.toolIsMapped(n));
  } catch (e) {
    unmapped = [`import failed: ${cut((e as Error).message, 80)}`];
  }
  chk("G0.1", unmapped.length === 0, `tools without an access rule: ${j(unmapped)} (registry ${(tools.toolRegistry() as Any[]).length})`);

  // ═══ G1 recent_leads (CRM visibility per system + masking) ═══
  console.log("\n── G1 recent_leads ──");
  const full = ["0811000001", "0811000002", "0811000003"];
  const leads: Record<string, string> = {};
  for (const [k, uid] of Object.entries({ owner, mgr, staffAi, staffCrm })) leads[k] = await rt(act(uid), "recent_leads", { limit: 20 });
  const has = (s: string, x: string) => s.includes(x);
  chk("G1.1", !has(leads.staffAi!, "ลีดทีมเอ") && !has(leads.staffAi!, "ลีดทีมบี") && !full.some((p) => has(leads.staffAi!, p)),
    `STAFF ai.chat.send only: no CRM v2 leads, no full phone → ${cut(leads.staffAi)}`);
  chk("G1.2", has(leads.staffCrm!, "ลีดทีมเอ") && !has(leads.staffCrm!, "ลีดทีมบี") && !full.some((p) => has(leads.staffCrm!, p)),
    `STAFF + crm.contact.read (team A): own team lead only, masked → ${cut(leads.staffCrm)}`);
  chk("G1.3", has(leads.mgr!, "ลีดทีมเอ") && !has(leads.mgr!, "ลีดทีมบี") && !full.some((p) => has(leads.mgr!, p)),
    `MANAGER limited to u1: team A (u1) lead, not team B (u2), masked → ${cut(leads.mgr)}`);
  chk("P1.1", ["ลีดทีมเอ", "ลีดทีมบี", "ลีดระบบเดิม"].every((n) => has(leads.owner!, n)) && has(leads.owner!, "xxxxxxx001") && !full.some((p) => has(leads.owner!, p)),
    `OWNER: all 3 leads (2 CRM v2 systems + v1), phones masked like the CRM assistant serializer → ${cut(leads.owner)}`);
  info("I1.1", `v1 CRM lead visible to STAFF ai-only (v1 web hub has no read key — unchanged): ${has(leads.staffAi!, "ลีดระบบเดิม")}`);

  // ═══ G2 member legacy tools ═══
  console.log("\n── G2 customer_search / customer_points / member_count ──");
  const cs: Record<string, string> = {};
  for (const [k, uid] of Object.entries({ owner, mgr, staffAi, staffMem })) cs[k] = await rt(act(uid), "customer_search", { query: "สมาชิกสาขา" });
  chk("G2.1", isRefusal(cs.staffAi!) && !has(cs.staffAi!, "0899000101"), `STAFF ai-only → refusal, no member phone → ${cut(cs.staffAi)}`);
  chk("G2.2", has(cs.mgr!, "สมาชิกสาขาหนึ่ง") && !has(cs.mgr!, "สมาชิกสาขาสอง"), `MANAGER u1 → branch u1 member only → ${cut(cs.mgr)}`);
  chk("P2.1", has(cs.staffMem!, "สมาชิกสาขาหนึ่ง") && has(cs.staffMem!, "สมาชิกสาขาสอง") && has(cs.owner!, "สมาชิกสาขาสอง") && has(cs.owner!, "0899000102"),
    `STAFF + member.customer.read and OWNER see both · OWNER phone unchanged → ${cut(cs.owner, 120)}`);
  const cp = await rt(act(staffAi), "customer_points", { query: "สมาชิกสาขา" });
  const cpM = await rt(act(mgr), "customer_points", { query: "สมาชิกสาขา" });
  chk("G2.3", isRefusal(cp) && has(cpM, "สมาชิกสาขาหนึ่ง") && !has(cpM, "สมาชิกสาขาสอง"), `customer_points: STAFF ai-only refused · MANAGER u1 branch only → ${cut(cp, 80)} | ${cut(cpM, 90)}`);
  const mc = await rt(act(staffAi), "member_count");
  chk("G2.4", isRefusal(mc), `member_count: STAFF ai-only refused (member.customer.read) → ${cut(mc)}`);

  // ═══ G3 financial_summary · G4 kb_auto_save · G5 memory (D1) · G6 chat ═══
  console.log("\n── G3 financial · G4 kb_auto_save · G5 memory · G6 chat ──");
  const fsAi = await rt(act(staffAi), "financial_summary");
  const fsOwner = await rt(act(owner), "financial_summary");
  const fsMgr = await rt(act(mgr), "financial_summary");
  chk("G3.1", isRefusal(fsAi), `financial_summary STAFF ai-only → refusal (account.report.view) → ${cut(fsAi)}`);
  chk("P3.1", !isRefusal(fsOwner) && !isRefusal(fsMgr), `OWNER / MANAGER (account web door = evaluate → MANAGER passes) → ${cut(fsOwner, 90)}`);
  const kb0 = await P.kbArticle.count({ where: { tenantId: tA } });
  const kbAi = await rt(act(staffAi), "kb_auto_save", { title: "นโยบายลับ", content: "เขียนโดยพนักงานที่ไม่มีสิทธิ์" });
  const kb1 = await P.kbArticle.count({ where: { tenantId: tA } });
  chk("G4.1", isRefusal(kbAi) && kb1 === kb0, `kb_auto_save STAFF ai-only → refusal and no article (${kb0}→${kb1}) → ${cut(kbAi)}`);
  const kbOk = await rt(act(staffKb), "kb_auto_save", { title: "นโยบายคืนสินค้า", content: "คืนได้ใน 7 วัน" });
  const kb2 = await P.kbArticle.count({ where: { tenantId: tA } });
  chk("P4.1", !isRefusal(kbOk) && kb2 === kb1 + 1, `STAFF + kb.article.create → saved (${kb1}→${kb2})`);
  const rem = await rt(act(staffAi), "remember_fact", { content: "ร้านหยุดทุกวันจันทร์" });
  const memRows = await P.aiMemory.count({ where: { tenantId: tA } });
  const lm = await rt(act(staffAi), "list_memories");
  chk("P5.1", !isRefusal(rem) && memRows === 1 && has(lm, "ร้านหยุดทุกวันจันทร์"), `D1 unchanged: STAFF ai-only remembers/lists shop memory (tenant-scoped, ${memRows} row)`);
  const chAi = await rt(act(staffAi), "chat_unread_conversations");
  const chOwner = await rt(act(owner), "chat_unread_conversations");
  chk("G6.1", isRefusal(chAi) && !isRefusal(chOwner), `chat_unread_conversations: STAFF ai-only refused (chat.conversation.read) · OWNER ok → ${cut(chAi, 90)}`);
  const up = await rt(act(staffAi), "upcoming_schedule", { days: 7 });
  chk("G6.2", isRefusal(up), `upcoming_schedule: STAFF ai-only refused (calendar.event.read — /app/calendar door) → ${cut(up, 90)}`);

  // ═══ G7 unit-axis tools (requireUnit door) ═══
  console.log("\n── G7 shop_pending_orders by branch ──");
  const spM = await rt(act(mgr), "shop_pending_orders");
  const shopO = await rt(act(owner), "shop_pending_orders");
  chk("G7.1", has(spM, "SO-QC1") && !has(spM, "SO-QC2"), `MANAGER u1 → order of u1 only → ${cut(spM)}`);
  chk("P7.1", has(shopO, "SO-QC1") && has(shopO, "SO-QC2"), `OWNER → both branches → ${cut(shopO, 90)}`);

  // ═══ G8 module registry tools (account · kanban · member · crm) ═══
  console.log("\n── G8 module registry tools ──");
  const accAi = await rt(act(staffAi), "account_dashboard", {});
  const accOwner = await rt(act(owner), "account_dashboard", {});
  chk("G8.1", isRefusal(accAi), `account_dashboard STAFF ai-only → refusal (was the fixed assistant read set) → ${cut(accAi, 90)}`);
  chk("P8.1", !isRefusal(accOwner) && !/"error"/.test(accOwner), `account_dashboard OWNER → data → ${cut(accOwner, 80)}`);
  const kbnAi = await rt(act(staffAi), "kanban_list_boards", {});
  chk("G8.2", isRefusal(kbnAi), `kanban_list_boards STAFF ai-only → refusal (no kanban key) → ${cut(kbnAi, 90)}`);
  const memAi = await rt(act(staffAi), "member_list", {});
  chk("G8.3", isRefusal(memAi) && !has(memAi, "สมาชิกสาขา"), `member_list STAFF ai-only, no cookie (app/cron path) → refusal (was the shop-wide assistant read set) → ${cut(memAi, 90)}`);
  const crmS = await rt(act(staffCrm), "crm_search", { q: "ลีด" });
  chk("P8.2", !/NO_HUMAN|ไม่ทราบว่าใครถาม|ต้องเปิดจากหน้า/.test(crmS) && has(crmS, "ลีดทีมเอ") && !has(crmS, "ลีดทีมบี"),
    `crm_search STAFF + crm.contact.read with NO cookie (mobile/cron path) → runs as the caller (team A only) → ${cut(crmS, 120)}`);

  // ═══ G9 action tools + plan ═══
  console.log("\n── G9 proposals by callers who could not confirm them ──");
  const pr0 = await P.aiProposal.count({ where: { tenantId: tA } });
  const sale = { lines: [{ name: "กาแฟ", qty: 1, unitPriceSatang: 5000 }], payType: "CASH" };
  const posAi = await rt(act(staffAi), "pos_create_sale", sale);
  const mcAi = await rt(act(staffAi), "member_create", { name: "สมาชิกใหม่", phone: "0890000000" });
  const pr1 = await P.aiProposal.count({ where: { tenantId: tA } });
  chk("G9.1", isRefusal(posAi) && isRefusal(mcAi) && pr1 === pr0, `STAFF ai-only: pos_create_sale + member_create → refusal, proposals ${pr0}→${pr1}`);
  const posOk = await rt(act(staffPos), "pos_create_sale", sale);
  const posOwner = await rt(act(owner), "pos_create_sale", sale);
  const pr2 = await P.aiProposal.count({ where: { tenantId: tA } });
  chk("P9.1", /proposalId/.test(posOk) && /proposalId/.test(posOwner) && pr2 === pr1 + 2, `STAFF + pos.sale.create and OWNER → proposals created (${pr1}→${pr2})`);
  const pl0 = await P.aiPlan.count({ where: { tenantId: tA } });
  const plan = { title: "แผนทดสอบ", steps: [{ kind: "inventory_receive", summary: "รับของ 5 ชิ้น", payload: { sku: "X1", qty: 5 } }] };
  const planAi = await rt(act(staffAi), "propose_plan", plan);
  const pl1 = await P.aiPlan.count({ where: { tenantId: tA } });
  const planOwner = await rt(act(owner), "propose_plan", plan);
  const pl2 = await P.aiPlan.count({ where: { tenantId: tA } });
  chk("G9.2", isRefusal(planAi) && pl1 === pl0, `propose_plan with a step STAFF ai-only cannot confirm → refusal, plans ${pl0}→${pl1} → ${cut(planAi, 90)}`);
  chk("P9.2", /planId/.test(planOwner) && pl2 === pl1 + 1, `OWNER plan created (${pl1}→${pl2})`);

  // ═══ G10 executor without an actor (old call shape) = fail closed ═══
  const noActor = await tools.runTool({ tenantId: tA, conversationId: conv.id }, "recent_leads", {});
  chk("G10.1", isRefusal(noActor) && !full.some((p) => has(noActor, p)), `runTool without actor → refusal (no data) → ${cut(noActor, 90)}`);
  const foreign = await tools.runTool({ tenantId: tA, actor: { ...act(owner), tenantId: "other-tenant" } }, "recent_leads", {});
  chk("G10.2", isRefusal(foreign), `actor of another tenant → refusal → ${cut(foreign, 80)}`);

  // ═══ G11 API keys at the executor ═══
  console.log("\n── G11 API keys (executor) ──");
  const gk = keyActor([]);
  const ak = keyActor(["account.doc.view"], A);
  const keyOut: Record<string, string> = {};
  for (const n of ["recent_leads", "financial_summary", "kb_auto_save", "remember_fact", "forget_fact", "customer_search"]) {
    keyOut[`g:${n}`] = await rt(gk, n, n === "kb_auto_save" ? { title: "x", content: "y" } : n === "remember_fact" ? { content: "คีย์จำ" } : n === "customer_search" ? { query: "สมาชิก" } : {});
    keyOut[`a:${n}`] = await rt(ak, n, n === "kb_auto_save" ? { title: "x", content: "y" } : n === "remember_fact" ? { content: "คีย์จำ" } : n === "customer_search" ? { query: "สมาชิก" } : {});
  }
  const keyLeaks = Object.entries(keyOut).filter(([, v]) => !isRefusal(v)).map(([k]) => k);
  chk("G11.1", keyLeaks.length === 0 && !Object.values(keyOut).some((v) => full.some((p) => v.includes(p))),
    `general + account-only key: recent_leads/financial_summary/kb_auto_save/remember_fact/forget_fact/customer_search all refused · not refused=${j(keyLeaks)}`);
  const gList = await rt(gk, "list_systems");
  const aList = await rt(ak, "list_systems");
  const aDocs = await rt(ak, "account_list_documents", {});
  chk("P11.1", !isRefusal(gList) && !isRefusal(aDocs), `general key list_systems ok · account key account_list_documents ok (module scope) → ${cut(aDocs, 70)}`);
  info("I11.1", `account-only key list_systems (non-module, non-general key) → ${isRefusal(aList) ? "refused" : "allowed"} (hotfix/apiv1-scope answers 403 key_not_general at the route)`);

  // ═══ G12 REST door (real route handler, real keys) ═══
  console.log("\n── G12 POST /api/v1/ai/tools/[name] ──");
  const keySvc = (await import("@/lib/api-keys/service" as string)) as Any;
  const kGen = await keySvc.createApiKey({ tenantId: tA }, `${TAG}-gen`, {});
  const kAcc = await keySvc.createApiKey({ tenantId: tA }, `${TAG}-acc`, { scopes: ["account.doc.view"], systemId: A });
  const TOOLS = (await import("../../../src/app/api/v1/ai/tools/[name]/route.ts" as string)) as Any;
  const post = async (raw: string, name: string, args: Any = {}) => {
    const r = await TOOLS.POST(new Request(`http://qc.invalid/api/v1/ai/tools/${name}`, { method: "POST", headers: { authorization: `Bearer ${raw}`, "content-type": "application/json" }, body: j({ args }) }), { params: Promise.resolve({ name }) });
    return { status: r.status as number, body: await r.text() };
  };
  const r1 = await post(kGen.rawKey, "recent_leads", { limit: 5 });
  const r2 = await post(kAcc.rawKey, "recent_leads", { limit: 5 });
  const r3 = await post(kAcc.rawKey, "kb_auto_save", { title: "x", content: "y" });
  const kbAfterRest = await P.kbArticle.count({ where: { tenantId: tA } });
  chk("G12.1", !full.some((p) => r1.body.includes(p) || r2.body.includes(p)) && !/ลีดทีม/.test(r1.body + r2.body),
    `route recent_leads with general key ${r1.status} / account key ${r2.status} → no CRM lead, no phone → ${cut(r2.body, 110)}`);
  chk("G12.2", kbAfterRest === kb2, `route kb_auto_save with account key → no article written (${kb2}→${kbAfterRest}) · ${r3.status} ${cut(r3.body, 90)}`);

  // ═══ G13 offering filter + executor behind it (sendMessage with a scripted model) ═══
  console.log("\n── G13 sendMessage: tools offered per caller ──");
  const script = () => new Scripted([
    { toolCalls: [{ id: "l1", name: "load_skill", args: { skills: ["knowledge", "sales", "crm", "account"] } }] },
    { toolCalls: [{ id: "t1", name: "kb_auto_save", args: { title: "จากแชท", content: "ข้อมูลจากแชท" } }, { id: "t2", name: "financial_summary", args: {} }] },
    { text: "$LAST_TOOL" },
  ]);
  const kbS0 = await P.kbArticle.count({ where: { tenantId: tA } });
  const spAi = script();
  const sAi = await svc.sendMessage({ tenantId: tA, actor: act(staffAi) }, { text: "เก็บนโยบาย + กำไรเดือนนี้" }, { provider: spAi });
  const kbS1 = await P.kbArticle.count({ where: { tenantId: tA } });
  const r0Ai = spAi.calls[0]?.tools ?? [];
  const r1Ai = spAi.calls[1]?.tools ?? [];
  chk("G13.1", !r1Ai.includes("kb_auto_save") && !r1Ai.includes("financial_summary") && !r0Ai.includes("open_system") && r1Ai.includes("sales_summary"),
    `STAFF ai-only: offered after load_skill excludes kb_auto_save/financial_summary (sales_summary kept) · core excludes open_system → round0=${j(r0Ai)} round1=${j(r1Ai.slice(0, 12))}`);
  chk("G13.2", !/- knowledge:|- account:/.test(spAi.calls[0]?.system ?? "") && /- sales:/.test(spAi.calls[0]?.system ?? ""),
    `STAFF ai-only: skill index hides skills with no usable tool (knowledge, account) and keeps sales`);
  chk("G13.3", sAi.ok === true && kbS1 === kbS0 && !/รายได้บาท/.test(String(sAi.reply)),
    `model calls the un-offered kb_auto_save + financial_summary anyway → executor refuses: KB ${kbS0}→${kbS1} · reply ${cut(sAi.reply, 100)}`);
  const spO = script();
  const sO = await svc.sendMessage({ tenantId: tA, actor: act(owner) }, { text: "เก็บนโยบาย + กำไรเดือนนี้" }, { provider: spO });
  const kbS2 = await P.kbArticle.count({ where: { tenantId: tA } });
  chk("P13.1", sO.ok === true && (spO.calls[1]?.tools ?? []).includes("kb_auto_save") && (spO.calls[1]?.tools ?? []).includes("financial_summary") && kbS2 === kbS1 + 1 && /- knowledge:/.test(spO.calls[0]?.system ?? ""),
    `OWNER: kb_auto_save + financial_summary offered and run (KB ${kbS1}→${kbS2})`);

  // ═══ G14 doors: mobile lib (provider injectable) · scheduled job · web action / mobile route / member assistant (mock echo) ═══
  console.log("\n── G14 doors ──");
  const mchat = (await import("@/lib/mobile/chat" as string)) as Any;
  const spMob = new Scripted([{ toolCalls: [{ id: "m1", name: "kb_auto_save", args: { title: "จากแอป", content: "เขียนจากแอป" } }] }, { text: "$LAST_TOOL" }]);
  const kbM0 = await P.kbArticle.count({ where: { tenantId: tA } });
  const evs: Any[] = [];
  for await (const ev of mchat.sendMobileChat({ tenantId: tA, actor: act(staffAi) }, { text: "จดนโยบาย" }, { provider: spMob })) evs.push(ev);
  const kbM1 = await P.kbArticle.count({ where: { tenantId: tA } });
  chk("G14.1", evs.some((e) => e.type === "done") && kbM1 === kbM0, `mobile chat lib (STAFF ai-only) → kb_auto_save refused: KB ${kbM0}→${kbM1}`);
  // scheduled job: pick a Bangkok hour with no other active task in the QC DB so only ours runs
  const sched = (await import("@/lib/ai/scheduled" as string)) as Any;
  const busy = new Set(((await P.aiScheduledTask.findMany({ where: { active: true }, select: { hourBkk: true } })) as Any[]).map((r) => r.hourBkk as number));
  const hour = [...Array(24).keys()].find((h) => !busy.has(h));
  if (hour === undefined) {
    chk("G14.2", false, "no free hour for the scheduled-task check");
  } else {
    await P.aiScheduledTask.create({ data: { tenantId: tA, instruction: "สรุปลูกค้ามุ่งหวังล่าสุด", hourBkk: hour } });
    const now = new Date(Date.UTC(2031, 0, 15, (hour + 24 - 7) % 24, 5));
    const spSch = new Scripted([{ toolCalls: [{ id: "s1", name: "recent_leads", args: { limit: 20 } }] }, { text: "$LAST_TOOL" }]);
    const ran = await sched.runScheduledTasks(now, { provider: spSch });
    const note = await P.appNotification.findFirst({ where: { tenantId: tA, title: "งานประจำจากผู้ช่วย AI" }, orderBy: { createdAt: "desc" } });
    const body = String(note?.body ?? "");
    chk("G14.2", ran >= 1 && !!note && !/ลีดทีมเอ|ลีดทีมบี/.test(body) && !full.some((p) => body.includes(p)),
      `scheduled task (notification seen by every member) → no CRM v2 lead, no phone (ran=${ran}) → ${cut(body, 120)}`);
  }
  // web action under a forged Next request scope + real session cookie (mock echo model ⇒ positive control of the door)
  const AIA = (await import("@/lib/ai/actions" as string)) as Any;
  const ckAi = await sessionCookie(staffAi, tA);
  const web: Any = await inScope(ckAi, "/app", () => AIA.sendAiMessageAction({ text: "สวัสดีครับ" })).catch((e: Error) => ({ ok: false, message: e.message }));
  chk("P14.1", web?.ok === true && /รับทราบ/.test(String(web.reply)), `web sendAiMessageAction (STAFF ai-only, session) still answers → ${cut(j(web), 90)}`);
  const mobAuth = (await import("@/lib/mobile/auth" as string)) as Any;
  const MOB = (await import("../../../src/app/api/mobile/chat/send/route.ts" as string)) as Any;
  const tok = (await mobAuth.issueMobileToken(staffAi)).token as string;
  const mres = await MOB.POST(new Request("http://qc.invalid/api/mobile/chat/send", { method: "POST", headers: { authorization: `Bearer ${tok}`, "x-tenant-id": tA, "content-type": "application/json" }, body: j({ text: "สวัสดี" }) }));
  const mtxt = await mres.text();
  chk("P14.2", mres.status === 200 && /"type":"done"/.test(mtxt), `mobile route chat/send (STAFF ai-only, Bearer) still answers → ${cut(mtxt, 90)}`);
  const MAA = (await import("@/lib/modules/member/assistant-actions" as string)) as Any;
  const ckMem = await sessionCookie(staffMem, tA);
  const ma: Any = await inScope(ckMem, `/app/sys/${M}/member/assistant`, () => MAA.sendMemberAssistantAction(M, null, "สวัสดี")).catch((e: Error) => ({ ok: false, reason: e.message }));
  chk("P14.3", ma?.ok === true, `member assistant action (STAFF member.customer.read) still answers → ${cut(j(ma), 90)}`);

  // ═══ G15 confirm re-checks the CONFIRMER (step 4 — evidence) ═══
  console.log("\n── G15 confirm runs with the confirmer's rights ──");
  const props = (await import("@/lib/ai/proposals" as string)) as Any;
  const ownerProp = await P.aiProposal.findFirst({ where: { tenantId: tA, kind: "pos_create_sale", status: "PENDING" }, orderBy: { createdAt: "desc" } });
  const mAi = { role: "STAFF", unitAccess: ["*"], permissions: perms[staffAi] };
  const ex = ownerProp ? await props.executeProposal(mAi, { tenantId: tA }, ownerProp.id, { userId: staffAi }) : { ok: false, note: "no row" };
  const after = ownerProp ? (await P.aiProposal.findUnique({ where: { id: ownerProp.id } }))?.status : null;
  chk("G15.1", ex.ok === false && after === "PENDING", `OWNER's pos_create_sale proposal confirmed by STAFF ai-only → refused, row stays PENDING → ${cut(ex.note, 90)}`);
  const plans = (await import("@/lib/ai/plans" as string)) as Any;
  const ownerPlan = await P.aiPlan.findFirst({ where: { tenantId: tA, status: "PENDING" }, orderBy: { createdAt: "desc" } });
  const pex = ownerPlan ? await plans.executePlan(mAi, { tenantId: tA }, ownerPlan.id, {}) : null;
  const planAfter = ownerPlan ? (await P.aiPlan.findUnique({ where: { id: ownerPlan.id } }))?.status : null;
  chk("G15.2", !!pex && pex.ok === false && pex.doneCount === 0, `OWNER's plan confirmed by STAFF ai-only → no step runs (per-step KIND_ACCESS of the confirmer) → ${cut(pex?.results?.[0]?.note, 80)}`);
  info("I15.2", `…but the plan row is now ${planAfter} (claimed PENDING→RUNNING before the per-step check) — the OWNER can no longer confirm it (pre-existing, reported, not changed)`);

  // ═══ OWNER byte-for-byte dump ═══
  const ownerTools = ["list_systems", "sales_summary", "sales_by_day", "growth_recommendations", "kb_search", "low_stock", "pending_leaves", "member_count",
    "customer_search", "customer_points", "reward_list_redemptions", "today_appointments", "upcoming_schedule", "queue_waiting", "shop_pending_orders",
    "chat_unread_conversations", "approvals_pending", "rental_active", "restaurant_today", "ticket_event_sales", "financial_summary", "recent_leads",
    "list_memories", "account_dashboard", "kanban_list_boards", "member_list"];
  const argsOf: Record<string, Any> = { kb_search: { query: "คืนสินค้า" }, customer_search: { query: "สมาชิกสาขา" }, customer_points: { query: "สมาชิกสาขา" }, recent_leads: { limit: 20 } };
  const dump: Record<string, string> = {};
  for (const n of ownerTools) dump[n] = norm(await rt(act(owner), n, argsOf[n] ?? {}));
  const outFile = process.env.CF9_OWNER_OUT;
  if (outFile) writeFileSync(outFile, `${j(dump)}\n`);
  info("I.OWNER", `OWNER outputs of ${ownerTools.length} tools written to ${outFile ?? "(CF9_OWNER_OUT unset)"}`);
} catch (e) {
  chk("FATAL", false, `probe crashed: ${cut((e as Error)?.stack ?? e, 400)}`);
} finally {
  for (const T of TENANTS) {
    const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tbs) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    let left = 0;
    for (const t of tbs) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
    chk(`CLEAN-${T.slice(-6)}`, left === 0 && (await P.tenant.count({ where: { id: T } })) === 0, `tenant rows left=${left}`);
  }
  for (const id of USERS) {
    await P.session.deleteMany({ where: { userId: id } }).catch(() => undefined);
    await P.membership.deleteMany({ where: { userId: id } }).catch(() => undefined);
    await P.appNotification.deleteMany({ where: { recipientUserId: id } }).catch(() => undefined);
    await P.user.delete({ where: { id } }).catch(() => undefined);
  }
  const usersLeft = await P.user.count({ where: { email: { startsWith: TAG } } });
  chk("CLEAN-users", usersLeft === 0, `users left=${usersLeft}`);
  const pass = res.filter((r) => r.ok).length;
  console.log(`\nJSON_SUMMARY ${j({ pass, total: res.length, red: res.filter((r) => !r.ok).map((r) => r.id) })}`);
  await prisma.$disconnect();
  process.exit(res.every((r) => r.ok) ? 0 : 1);
}
