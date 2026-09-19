// probe-c111-review.mts — builder probe (ไม่ใช่ oracle) ของรีวิว C1.11: SF-1 · SF-2 · SF-4 · SF-5 · SF-6 · N-1 · N-2 · N-3
//   แต่ละข้อมีกรณีบวก (สิ่งที่ต้องทำได้) + กรณีลบ (สิ่งที่ต้องไม่เกิด)
// QC database only (.env.qc / .env.qc2 ผ่าน qc2.sh) · tenant ทิ้ง `qc-p111-<rand>-*` ลบใน finally
// Run: bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c111-review.mts
//   (ไม่ต้องตั้ง CRM_V2_SWITCH — probe ตั้ง/ลบเองในโพรเซสสำหรับ N-2)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";

const env = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
console.log(`[env] DB ${env.loadQcEnv().host}`);
delete process.env.CRM_V2_SWITCH;
delete process.env.CRM_V2_SWITCH_TENANTS;

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
async function inScope<T>(cookie: string, phase: "render" | "action", fn: () => Promise<T>): Promise<T> {
  const req = new Request("http://qc.local/app", { headers: { cookie, "user-agent": "qc-p111" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const ws = { route: "/app", page: "/app/page", forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
  const unit = { type: "request", phase, implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname: "/app", search: "" } };
  return nextWork.workAsyncStorage.run(ws, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-p111-${rand}`;
const results: { id: string; ok: boolean }[] = [];
const chk = (id: string, name: string, ok: unknown, detail: string) => {
  results.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — ${detail}`}`);
};
const TENANTS: string[] = [];
const USERS: string[] = [];
const j = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
const DAY = 86_400_000;
let seq = 0;
const phoneOf = () => `08${String((Math.floor(Math.random() * 9_000_000) + 1_000_000) * 10 + (seq++ % 10)).padStart(8, "0").slice(-8)}`;
type Who = { userId: string; cookie: string };
type R = { ok: boolean; code: string; msg: string; v: Any };
const run = async (who: Who, fn: Any, ...args: Any[]): Promise<R> => {
  try {
    const v: Any = await inScope(who.cookie, "action", () => fn(...args));
    if (v && typeof v === "object" && "ok" in v) return { ok: v.ok === true, code: String(v.code ?? ""), msg: String(v.error ?? ""), v };
    return { ok: true, code: "", msg: "", v };
  } catch (e) {
    const d = String((e as Any)?.digest ?? "");
    if (d.startsWith("NEXT_REDIRECT")) return { ok: true, code: "REDIRECT", msg: d, v: null };
    return { ok: false, code: "THROWN", msg: e instanceof Error ? e.message : String(e), v: null };
  }
};
const isEl = (x: Any) => !!x && typeof x === "object" && typeof x.$$typeof === "symbol" && "props" in x;
async function walk(n: Any, acc: { tids: string[]; text: string[]; seen: Set<object> }, d = 0): Promise<void> {
  if (d > 200 || n == null || typeof n === "boolean" || typeof n === "function" || typeof n === "symbol") return;
  if (typeof n === "string" || typeof n === "number") { acc.text.push(String(n)); return; }
  if (typeof n !== "object" || acc.seen.has(n)) return;
  acc.seen.add(n);
  if (typeof n.then === "function") { await walk(await n, acc, d + 1); return; }
  if (Array.isArray(n)) { for (const x of n) await walk(x, acc, d + 1); return; }
  if (isEl(n)) {
    const t = n.type;
    const props = n.props ?? {};
    if (props["data-testid"]) acc.tids.push(String(props["data-testid"]));
    if (typeof t === "function") {
      if (t.constructor?.name === "AsyncFunction") { await walk(await t(props), acc, d + 1); return; }
      const oe = console.error;
      console.error = () => undefined;
      try { const out = t(props); console.error = oe; await walk(out, acc, d + 1); return; } catch { console.error = oe; }
    }
    for (const [k, v] of Object.entries(props)) if (k !== "key" && k !== "ref") await walk(v, acc, d + 1);
    return;
  }
  for (const v of Object.values(n)) await walk(v, acc, d + 1);
}
const render = async (who: Who, file: string, params: Record<string, string>, sp: Record<string, string> = {}) => {
  const mod = (await import(pathToFileURL(resolve(file)).href)) as Any;
  const acc = { tids: [] as string[], text: [] as string[], seen: new Set<object>() };
  try {
    await inScope(who.cookie, "render", async () => walk(await mod.default({ params: Promise.resolve(params), searchParams: Promise.resolve(sp) }), acc));
    return { status: 200, ...acc };
  } catch (e) {
    return { status: /404/.test(String((e as Any)?.digest ?? "")) ? 404 : -1, ...acc, err: String((e as Error)?.message ?? e) };
  }
};

try {
  const sysSvc = (await import("@/lib/modules/system/service")) as Any;
  const hash = (await import("@/lib/core/hash" as string)) as Any;
  const V1 = (await import(pathToFileURL(resolve("src/lib/modules/crm/actions.ts")).href)) as Any;
  const PANEL = (await import(pathToFileURL(resolve("src/lib/modules/chat/crm-panel-actions.ts")).href)) as Any;
  const CA = (await import(pathToFileURL(resolve("src/lib/modules/crm/contacts-actions.ts")).href)) as Any;
  const COA = (await import(pathToFileURL(resolve("src/lib/modules/crm/companies-actions.ts")).href)) as Any;
  const TA = (await import(pathToFileURL(resolve("src/lib/modules/crm/templates-actions.ts")).href)) as Any;
  const SW = (await import(pathToFileURL(resolve("src/lib/modules/crm/switch-actions.ts")).href)) as Any;
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const BR = (await import("@/lib/platform/crm-bridges" as string)) as Any;

  const mkTenant = async (s: string) => { const t = (await P.tenant.create({ data: { name: `${TAG}${s}`, slug: `${TAG}${s}` } })).id as string; TENANTS.push(t); return t; };
  const mkWho = async (tid: string, s: string, role: string, perms: Record<string, unknown> = {}): Promise<Who> => {
    const u = await P.user.create({ data: { email: `${TAG}-${s}@qc.invalid`, name: `QC ${s}` } });
    USERS.push(u.id);
    await P.membership.create({ data: { userId: u.id, tenantId: tid, role, unitAccess: ["*"], permissions: perms, acceptedAt: new Date() } });
    const tok = hash.randomToken(32) as string;
    await P.session.create({ data: { userId: u.id, tokenHash: hash.sha256(tok), idleExpiresAt: new Date(Date.now() + DAY), expiresAt: new Date(Date.now() + DAY) } });
    return { userId: u.id, cookie: `shark_session=${tok}; __Host-shark_session=${tok}; shark_tenant=${tid}` };
  };
  const setCrm = (id: string, o: Record<string, unknown>) =>
    P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END,'{crm}',(CASE WHEN jsonb_typeof("settings"->'crm')='object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id"=$2`, JSON.stringify(o), id);
  const crmOf = async (id: string) => ((await P.appSystem.findUnique({ where: { id } }))?.settings as Any)?.crm ?? {};
  const mkChat = async (tid: string, chatSys: string, partyId: string | null, name: string, phone: string | null = null) => {
    const cc = await P.chatContact.create({ data: { tenantId: tid, systemId: chatSys, channel: "LINE", externalUserId: `${TAG}-${Math.random().toString(36).slice(2)}`, displayName: name, phone, partyId } });
    return (await P.chatConversation.create({ data: { tenantId: tid, systemId: chatSys, channel: "LINE", contactId: cc.id, lastMessageAt: new Date() } })).id as string;
  };

  // ── ร้าน A: CRM v2 (ตัวแรก) + แชท · ร้าน V: CRM v1 + แชท ──
  const A = await mkTenant("-a");
  const owner = await mkWho(A, "owner", "OWNER");
  const mgr = await mkWho(A, "mgr", "MANAGER", { "crm.settings.manage": true });
  const SA = (await sysSvc.createSystem(A, "CRM", `CRM ${TAG}`)).id as string;
  await new Promise((r) => setTimeout(r, 20));
  const SA2 = (await sysSvc.createSystem(A, "CRM", `CRM สอง ${TAG}`)).id as string;
  const CA_SYS = (await sysSvc.createSystem(A, "CHAT", `แชท ${TAG}`)).id as string;
  await setCrm(SA, { uiVersion: 2 });
  await setCrm(SA2, { uiVersion: 2 });
  const V = await mkTenant("-v");
  const ownerV = await mkWho(V, "ownerv", "OWNER");
  const SV = (await sysSvc.createSystem(V, "CRM", `CRM v1 ${TAG}`)).id as string;
  const CV = (await sysSvc.createSystem(V, "CHAT", `แชท v1 ${TAG}`)).id as string;
  const ctxA = { tenantId: A, systemId: SA, actorUserId: owner.userId };
  const actorA = { userId: owner.userId, role: "OWNER", unitAccess: ["*"], permissions: {} };

  // ═ SF-1 ═
  console.log("── SF-1 · v1 unchanged + notice ──");
  const vc = await P.crmContact.create({ data: { tenantId: V, systemId: SV, name: `วีหนึ่ง ${rand}`, firstName: `วีหนึ่ง ${rand}` } });
  const SVC = (await import("@/lib/modules/crm/service" as string)) as Any;
  const board = await SVC.getBoard({ tenantId: V, systemId: SV });
  const vd = await SVC.createDeal({ tenantId: V, systemId: SV }, { contactId: vc.id, pipelineId: board.pipeline.id, stageId: board.pipeline.stages[0].id, title: `ดีลวี ${rand}`, valueSatang: 100_00 });
  const docs0 = await P.accountDocument.count({ where: { tenantId: V } });
  const q = await run(ownerV, V1.issueQuotationAction, (() => { const f = new FormData(); f.set("systemId", SV); f.set("dealId", vd.id); return f; })());
  const docs1 = await P.accountDocument.count({ where: { tenantId: V } });
  chk("SF-1.neg", "issueQuotationAction บนร้านที่ไม่มีสมุดบัญชี = พฤติกรรม v1 เดิม: ไม่ throw · ไม่ redirect เพิ่ม · ไม่มีเอกสาร", q.ok && q.code === "" && docs1 === docs0, `${j(q)} docs=${docs0}→${docs1}`);
  const DEALS = "src/app/app/sys/[id]/crm/deals/page.tsx";
  const withN = await render(ownerV, DEALS, { id: SV }, { notice: `แจ้งเตือนทดสอบ ${rand}` });
  const noN = await render(ownerV, DEALS, { id: SV });
  chk("SF-1.pos", "หน้าดีล v1 + ?notice= → แถบ deals-v1-notice มีข้อความ · ไม่มี param → ไม่มีแถบ", withN.tids.includes("deals-v1-notice") && withN.text.join(" ").includes(`แจ้งเตือนทดสอบ ${rand}`) && !noN.tids.includes("deals-v1-notice"), `with=${withN.status}/${withN.tids.includes("deals-v1-notice")} without=${noN.tids.includes("deals-v1-notice")}`);

  // ═ SF-2 ═
  console.log("── SF-2 · chat panel gate ──");
  const bogus = `${TAG}-no-such-conversation`;
  const pv = await run(ownerV, PANEL.getChatCrmPanelAction, bogus);
  const lv = await run(ownerV, PANEL.createLeadFromChatAction, bogus);
  chk("SF-2.neg", "ร้าน v1: getChatCrmPanelAction คืน data:null ทันทีโดยไม่แตะห้อง (id ห้องมั่วก็ไม่ NOT_FOUND) · สร้าง lead ถูกปฏิเสธ FORBIDDEN",
    pv.ok && pv.v?.data === null && !lv.ok && lv.code === "FORBIDDEN", `panel=${j(pv.v)} lead=${lv.code}`);
  const pa = await run(owner, PANEL.getChatCrmPanelAction, bogus);
  chk("SF-2.pos", "ร้าน v2: id ห้องมั่ว → NOT_FOUND (ห้องถูกค้นจริงหลังผ่านประตู) · context-panel mount แผงเฉพาะเมื่อ crmPanel (ตัดสินฝั่ง server ใน chat/ui.tsx)",
    !pa.ok && pa.code === "NOT_FOUND" && /crmPanel && <ChatCrmPanel/.test(readFileSync("src/lib/modules/chat/context-panel.tsx", "utf8")) && /crmPanel=\{crmPanel\}/.test(readFileSync("src/lib/modules/chat/ui.tsx", "utf8")),
    `panel=${pa.code}`);

  // ═ SF-4 ═
  console.log("── SF-4 · import fill-blanks + routed keys ──");
  const ph = phoneOf();
  const k0 = (await CRM.contacts.createContact(ctxA, actorA, { firstName: `นำเข้าเดิม ${rand}`, phone: ph, jobTitle: "ผู้จัดการเดิม" })).contact;
  const bad = await run(owner, CA.importContactsAction, SA, { headers: ["ชื่อ", "ตำแหน่ง"], rows: [[`ใหม่ ${rand}`, "x"]], mapping: { ชื่อ: "firstName", ตำแหน่ง: "f.jobTitle" }, onDuplicate: "update" });
  chk("SF-4.neg", "จับคู่ f.jobTitle (ฟิลด์ระบบแบบฟิลด์กำหนดเอง) → ปฏิเสธ (ข้อความไทย) ไม่เขียนอะไร", !bad.ok && /[ก-๙]/.test(bad.msg) && (await P.crmContact.count({ where: { systemId: SA, firstName: `ใหม่ ${rand}` } })) === 0, `${bad.code}:${bad.msg.slice(0, 80)}`);
  const up = await run(owner, CA.importContactsAction, SA, { headers: ["ชื่อ", "นามสกุล", "เบอร์", "ตำแหน่ง"], rows: [[`นำเข้าเดิม ${rand}`, "สกุลใหม่", ph, "ตำแหน่งทับ"]], mapping: { ชื่อ: "firstName", นามสกุล: "lastName", เบอร์: "phone", ตำแหน่ง: "jobTitle" }, onDuplicate: "update" });
  const k1 = (await P.crmContact.findUnique({ where: { id: k0.id } })) as Any;
  chk("SF-4.pos", "onDuplicate update: นามสกุลที่ว่างถูกเติม · ตำแหน่งที่มีอยู่ไม่ถูกทับ · updated 1", up.ok && up.v?.updated === 1 && k1?.lastName === "สกุลใหม่" && k1?.jobTitle === "ผู้จัดการเดิม", `${j(up.v)} last=${k1?.lastName} job=${k1?.jobTitle}`);

  // ═ SF-5 ═
  console.log("── SF-5 · company merge only non-null ──");
  const mkCo = async (name: string, industry: string | null, website: string | null) => {
    const partyId = (await P.party.create({ data: { tenantId: A, name, kind: "COMPANY" } })).id as string;
    return (await P.crmCompany.create({ data: { tenantId: A, systemId: SA, name, partyId, industry, website } })).id as string;
  };
  const c1 = await mkCo(`บริษัทเก็บ ${rand}`, "ท่องเที่ยว", null);
  const c2 = await mkCo(`บริษัทรวม ${rand}`, null, "https://example.invalid");
  const m = await run(owner, COA.mergeCompaniesAction, SA, { keepId: c1, mergeId: c2, confirm: true, reason: "ทดสอบรวมบริษัท", fieldChoices: { industry: "merge", website: "merge" } });
  const kept = (await P.crmCompany.findUnique({ where: { id: c1 } })) as Any;
  chk("SF-5.neg", "fieldChoices.industry=merge แต่อีกฝั่งว่าง → ค่าของบริษัทที่เก็บไว้ไม่ถูกล้าง", m.ok && kept?.industry === "ท่องเที่ยว", `${m.code} industry=${kept?.industry}`);
  chk("SF-5.pos", "fieldChoices.website=merge และอีกฝั่งมีค่า → ใช้ค่าของอีกฝั่ง", m.ok && kept?.website === "https://example.invalid", `website=${kept?.website}`);
  const mv = await run(owner, COA.companyMergeValuesAction, SA, c1, c2);
  chk("SF-5.pos2", "companyMergeValuesAction คืนค่าของบริษัทที่มองเห็น (ถูกรวมแล้ว = ไม่มีในผล)", mv.ok && mv.v.items.length === 1 && mv.v.items[0].id === c1, j(mv.v));

  // ═ SF-6 ═
  console.log("── SF-6 · chat lead audited as USER ──");
  const pn = (await P.party.create({ data: { tenantId: A, name: `ลูกค้าแชท ${rand}`, kind: "PERSON", phone: phoneOf() } })).id as string;
  const conv = await mkChat(A, CA_SYS, pn, `ลูกค้าแชท ${rand}`);
  const lead = await run(owner, PANEL.createLeadFromChatAction, conv);
  const au = lead.ok ? ((await P.auditLog.findFirst({ where: { tenantId: A, action: "crm.contact.create", targetId: lead.v.contactId } })) as Any) : null;
  chk("SF-6.pos", "สร้าง lead จากแผงแชท → audit crm.contact.create เป็น USER (ผู้กด) · via chat-panel", lead.ok && au?.actorType === "USER" && au?.actorId === owner.userId && j(au?.after).includes("chat-panel"), `${j(lead.v)} audit=${au?.actorType}/${au?.actorId === owner.userId}/${j(au?.after)}`);
  await setCrm(SA, { chatToLead: true });
  const pb = (await P.party.create({ data: { tenantId: A, name: `ลูกค้าสะพาน ${rand}`, kind: "PERSON", phone: phoneOf() } })).id as string;
  const convB = await mkChat(A, CA_SYS, pb, `ลูกค้าสะพาน ${rand}`);
  await BR.onChatMessage({ id: `${TAG}-ev`, tenantId: A, type: "chat.message.received", payload: { conversationId: convB, channel: "LINE" }, systemId: null, unitId: null });
  const bc = (await P.crmContact.findFirst({ where: { tenantId: A, partyId: pb } })) as Any;
  const ab = bc ? ((await P.auditLog.findFirst({ where: { tenantId: A, action: "crm.contact.create", targetId: bc.id } })) as Any) : null;
  chk("SF-6.neg", "lead จากสะพานอัตโนมัติ (ไม่มีคนกด) → audit เป็น SYSTEM · via bridge", !!bc && ab?.actorType === "SYSTEM" && !ab?.actorId && j(ab?.after).includes("bridge"), `lead=${!!bc} audit=${ab?.actorType}/${j(ab?.after)}`);

  // ═ N-1 ═
  console.log("── N-1 · objects need crm.object.manage ──");
  const rm = await run(mgr, TA.applyBusinessTemplateAction, SA2, "dive");
  const objM = await P.customObject.count({ where: { systemId: SA2 } });
  const pipeM = await P.crmPipeline.count({ where: { systemId: SA2, name: "ขายทริปกรุ๊ป" } });
  chk("N-1.neg", "MANAGER (crm.settings.manage ไม่มี crm.object.manage) → ใส่เทมเพลตได้ แต่ข้ามวัตถุ (skippedObjects + ข้อความไทย) · ไม่มีวัตถุถูกสร้าง · pipeline มา",
    rm.ok && j(rm.v?.skippedObjects).includes("trip_group") && /[ก-๙]/.test(String(rm.v?.notice ?? "")) && objM === 0 && pipeM === 1, `${j(rm.v)} objects=${objM} pipe=${pipeM}`);
  const ro = await run(owner, TA.applyBusinessTemplateAction, SA2, "dive");
  const obj = (await P.customObject.findFirst({ where: { systemId: SA2, key: "trip_group" } })) as Any;
  const objAudit = obj ? ((await P.auditLog.findFirst({ where: { tenantId: A, action: "crm.object.create", targetId: obj.id } })) as Any) : null;
  chk("N-1.pos", "OWNER ใส่ซ้ำ → วัตถุถูกสร้างด้วย actor จริง (audit crm.object.create actorId = เจ้าของ) · ไม่มี skippedObjects",
    ro.ok && (ro.v?.skippedObjects ?? []).length === 0 && !!obj && objAudit?.actorId === owner.userId, `${j(ro.v)} audit=${objAudit?.actorId}`);
  const skip = await run(owner, TA.skipBusinessTemplateAction, SA);
  chk("N-1/SF-7", "ไม่ใช้เทมเพลต → settings.crm.businessTemplate = \"none\"", skip.ok && (await crmOf(SA))?.businessTemplate === "none", j(await crmOf(SA)));

  // ═ N-2 ═
  console.log("── N-2 · switch back always ──");
  const down = await run(owner, SW.setCrmUiVersionAction, SA2, 1);
  const upNoEnv = await run(owner, SW.setCrmUiVersionAction, SA2, 2);
  chk("N-2.pos", "ไม่มี env สวิตช์: เจ้าของร้านสลับ 2→1 ได้เสมอ", down.ok && (await crmOf(SA2))?.uiVersion === 1, j(down.v));
  chk("N-2.neg", "ไม่มี env สวิตช์: 1→2 ถูกปฏิเสธ FORBIDDEN (ค่ายังเป็น 1)", !upNoEnv.ok && upNoEnv.code === "FORBIDDEN" && (await crmOf(SA2))?.uiVersion === 1, j(upNoEnv.v));
  process.env.CRM_V2_SWITCH_TENANTS = A;
  const upEnv = await run(owner, SW.setCrmUiVersionAction, SA2, 2);
  delete process.env.CRM_V2_SWITCH_TENANTS;
  chk("N-2.pos2", "ร้านอยู่ใน CRM_V2_SWITCH_TENANTS → 1→2 ได้", upEnv.ok && (await crmOf(SA2))?.uiVersion === 2, j(upEnv.v));

  // ═ N-3 ═
  console.log("── N-3 · panel target = first ACTIVE CRM ──");
  const t0 = await CRM.crmPanelTarget(A);
  await P.appSystem.update({ where: { id: SA }, data: { active: false } });
  const t1 = await CRM.crmPanelTarget(A);
  await P.appSystem.update({ where: { id: SA2 }, data: { active: false } });
  const t2 = await CRM.crmPanelTarget(A);
  chk("N-3.pos", "ระบบ CRM ตัวแรกถูกปิดใช้ → เป้าหมายเลื่อนเป็นตัวที่สองที่ยังเปิด", t0?.systemId === SA && t1?.systemId === SA2, `${j(t0)} → ${j(t1)}`);
  chk("N-3.neg", "ทุกระบบ CRM ปิดใช้ → ไม่มีเป้าหมาย (แผงไม่ mount)", t2 === null, j(t2));
  void existsSync;
} catch (e) {
  chk("FATAL", "probe ran to the end", false, String((e as Error)?.stack ?? e).slice(0, 500));
} finally {
  delete process.env.CRM_V2_SWITCH_TENANTS;
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  if (ids.length) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[]).map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => 0);
    for (const id of ids) {
      await P.appSystemUnit.deleteMany({ where: { tenantId: id } }).catch(() => 0);
      await P.appSystem.deleteMany({ where: { tenantId: id } }).catch(() => 0);
      await P.tenant.delete({ where: { id } }).catch(() => 0);
    }
    for (const u of USERS) await P.session.deleteMany({ where: { userId: u } }).catch(() => 0);
    for (const u of USERS) await P.appNotification.deleteMany({ where: { recipientUserId: u } }).catch(() => 0);
    for (const u of USERS) await P.user.delete({ where: { id: u } }).catch(() => 0);
    chk("CLEAN", "throwaway tenants + users gone", (await P.tenant.count({ where: { id: { in: ids } } })) === 0 && (await P.user.count({ where: { id: { in: USERS } } })) === 0, "left");
  }
  await prisma.$disconnect();
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed === results.length ? "🟢" : "🔴"} probe-c111-review: ${passed}/${results.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: results.length, passed, findings: results.filter((r) => !r.ok).map((r) => r.id) })}`);
process.exit(passed === results.length ? 0 : 1);
