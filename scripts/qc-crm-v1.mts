// QC — CRM v1 regression (ใบ C1.11 · สัญญาข้อ I ของ oracle qc-crm-c1.11 · CRM-RUN §2 C1.11 S5)
//   ร้านที่ยังเป็นหน้าจอ CRM เดิม (settings.crm.uiVersion = 1 — ทุกร้านบน prod จนกว่าเจ้าของเปิดเอง) ต้องใช้งานได้เหมือนเดิมทุกอย่าง:
//   หน้า v1 สามหน้า (ContactsV1Page/CrmContactsSection · DealsV1Page/CrmDealsSection · ActivitiesV1Page/CrmActivitiesSection) + หน้าภาพรวม CrmHub
//   · action v1 หกตัวของ crm/actions.ts (createContactAction · createDealAction · moveDealAction · addActivityAction · completeActivityAction ·
//   issueQuotationAction) รับ FormData แล้วเขียนสิ่งที่ควรเขียน · ข้อมูลข้ามกันได้ทั้งสองทาง (v2 → หน้า v1 · v1 → บริการ/หน้า v2 หลังสลับเป็น 2)
// Builder's file (C1.11) · QC database only (.env.qc / qc2.sh) · ร้านทิ้ง `qc-crmv1-<rand>` ลบทั้งหมดใน finally
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-v1.mts
// requires: crm-seed   (house style — ไฟล์นี้ไม่อ่าน/ไม่เขียนแถวของ seed เลย · ทุกอย่างอยู่ในร้านทิ้งของตัวเอง)
// 🔴 ไม่ SKIP เมื่อมี crm/actions.ts · บรรทัดสุดท้าย JSON_SUMMARY · exit 0 เมื่อผ่านครบเท่านั้น
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";

const V1_ACTIONS = "src/lib/modules/crm/actions.ts";
const CRM_DIR = "src/app/app/sys/[id]/crm";
const PAGES = {
  contacts: `${CRM_DIR}/contacts/page.tsx`,
  deals: `${CRM_DIR}/deals/page.tsx`,
  activities: `${CRM_DIR}/activities/page.tsx`,
  companies: `${CRM_DIR}/companies/page.tsx`,
  sys: "src/app/app/sys/[id]/page.tsx",
};

if (!existsSync(V1_ACTIONS)) {
  console.log(`⚠️  SKIPPED — ${V1_ACTIONS} ไม่มีแล้ว (หน้าจอ CRM เดิมถูกถอดออก)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-crmv1-${rand}`;

// ─── Next request scope (เทคนิคเดียวกับ C0.4 / C1.9 / C1.11) ───
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
let SCOPE_RUNS = 0;
async function inScope<T>(cookie: string, pathname: string, phase: "render" | "action", fn: () => Promise<T>): Promise<T> {
  if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) return fn();
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "qc-crm-v1", "x-forwarded-for": "203.0.113.101" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
  const unit = { type: "request", phase, implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  try {
    const out = await nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
    SCOPE_RUNS += 1;
    return out;
  } catch (e) {
    if (/AsyncLocalStorage accessed in runtime/.test(String((e as Error)?.message ?? ""))) return fn();
    throw e;
  }
}

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

// ─── harness ───
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string) => {
  cks.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const cut = (v: unknown, n = 200) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
const pj = (v: Any): string => {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(v, (k, x) => {
      if (k === "_owner" || k === "_store" || typeof x === "function" || typeof x === "symbol") return undefined;
      if (typeof x === "bigint") return x.toString();
      if (x && typeof x === "object") { if (seen.has(x)) return undefined; seen.add(x); }
      return x;
    }) ?? "";
  } catch { return ""; }
};
type Who = { userId: string; cookie: string; tenantId: string; role: string };
type AR = { ok: boolean; code: string; msg: string; v: Any };
const run = async (who: Who, fn: Any, ...args: Any[]): Promise<AR> => {
  if (typeof fn !== "function") return { ok: false, code: "MISSING_FUNCTION", msg: "missing", v: undefined };
  try {
    const v = await inScope(who.cookie, "/app/sys/x/crm", "action", () => fn(...args));
    if (v && typeof v === "object" && "ok" in v) return { ok: (v as Any).ok === true, code: String((v as Any).code ?? ""), msg: String((v as Any).error ?? (v as Any).reason ?? ""), v };
    return { ok: true, code: "", msg: "", v };
  } catch (e) {
    const digest = String((e as Any)?.digest ?? "");
    if (digest.startsWith("NEXT_REDIRECT")) return { ok: true, code: "REDIRECT", msg: digest, v: null };
    const m = /NEXT_HTTP_ERROR_FALLBACK;(\d+)/.exec(digest);
    if (m) return { ok: false, code: m[1] === "404" ? "NOT_FOUND" : `HTTP_${m[1]}`, msg: "", v: null };
    return { ok: false, code: String((e as Any)?.code ?? "THROWN"), msg: e instanceof Error ? e.message : String(e), v: null };
  }
};
const aDesc = (r: AR) => (r.ok ? `ok${r.code ? `(${r.code})` : ""}` : `${r.code}:${cut(r.msg, 90)}`);
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

type PR = { status: number; text: string; els: { name: string; props: Any }[]; err: string };
const typeName = (t: Any): string =>
  typeof t === "string" ? t : typeof t === "function" ? String(t.displayName || t.name || "fn") : t && typeof t === "object" ? String(t.displayName || t.render?.displayName || t.render?.name || t.type?.name || "obj") : String(t);
const isEl = (x: Any) => !!x && typeof x === "object" && typeof x.$$typeof === "symbol" && "props" in x;
async function walkNode(n: Any, acc: { text: string[]; els: { name: string; props: Any }[]; seen: Set<object> }, d: number): Promise<void> {
  if (d > 220 || n === null || n === undefined || typeof n === "boolean" || typeof n === "function" || typeof n === "symbol") return;
  if (typeof n === "string" || typeof n === "number" || typeof n === "bigint") { acc.text.push(String(n)); return; }
  if (typeof n !== "object") return;
  if (n instanceof Date) { acc.text.push(n.toISOString()); return; }
  if (acc.seen.has(n)) return;
  acc.seen.add(n);
  if (typeof n.then === "function") { await walkNode(await n, acc, d + 1); return; }
  if (Array.isArray(n)) { for (const x of n) await walkNode(x, acc, d + 1); return; }
  if (isEl(n)) {
    const t = n.type;
    const props = n.props ?? {};
    acc.els.push({ name: typeName(t), props });
    if (typeof t === "function") {
      if (t.constructor?.name === "AsyncFunction") { await walkNode(await t(props), acc, d + 1); return; }
      let out: Any;
      let rendered = false;
      const origErr = console.error;
      console.error = () => undefined; // client component (hooks) — อ่านผ่าน props แทน
      try { out = t(props); rendered = true; } catch { /* client component */ } finally { console.error = origErr; }
      if (rendered) { await walkNode(out, acc, d + 1); return; }
    }
    for (const [k, v] of Object.entries(props)) if (k !== "key" && k !== "ref") await walkNode(v, acc, d + 1);
    return;
  }
  for (const [k, v] of Object.entries(n)) if (k !== "_owner" && k !== "_store") await walkNode(v, acc, d + 1);
}
const MODS = new Map<string, Any>();
const render = async (who: Who, file: string, params: Record<string, string>, sp: Record<string, string> = {}): Promise<PR> => {
  if (!existsSync(file)) return { status: 0, text: "", els: [], err: `missing ${file}` };
  let mod = MODS.get(file);
  if (!mod) { mod = await import(pathToFileURL(resolve(file)).href).catch((e: unknown) => ({ __err: String(e) })); MODS.set(file, mod); }
  const Page = mod?.default;
  if (typeof Page !== "function") return { status: 0, text: "", els: [], err: `no default export ${cut(mod?.__err, 120)}` };
  const acc = { text: [] as string[], els: [] as { name: string; props: Any }[], seen: new Set<object>() };
  try {
    await inScope(who.cookie, `/app/sys/${params.id ?? "x"}/page`, "render", async () => {
      await walkNode(await Page({ params: Promise.resolve(params), searchParams: Promise.resolve(sp) }), acc, 0);
    });
    return { status: 200, text: acc.text.join("\n"), els: acc.els, err: "" };
  } catch (e) {
    const digest = String((e as Any)?.digest ?? "");
    if (/NEXT_HTTP_ERROR_FALLBACK;404/.test(digest)) return { status: 404, text: "", els: [], err: "" };
    if (digest.startsWith("NEXT_REDIRECT")) return { status: 307, text: "", els: [], err: digest };
    return { status: -1, text: acc.text.join("\n"), els: acc.els, err: cut(e instanceof Error ? `${e.name}: ${e.message}` : String(e)) };
  }
};
const hasEl = (r: PR, name: string) => r.els.some((e) => e.name === name);
const hasTid = (r: PR, tid: string) => r.els.some((e) => String(e.props?.["data-testid"] ?? "") === tid);
const allOf = (r: PR) => `${r.text}\n${pj(r.els.map((e) => e.props))}`;
const pDesc = (r: PR) => `${r.status}${r.err ? `(${cut(r.err, 100)})` : ""}`;

const TIDS: string[] = [];
const USERS: string[] = [];
const DAY = 86_400_000;
let phoneSeq = 0;
const phoneOf = () => `08${String((Math.floor(Math.random() * 9_000_000) + 1_000_000) * 10 + (phoneSeq++ % 10)).padStart(8, "0").slice(-8)}`;

console.log(`\n═══ QC CRM v1 regression — หน้า v1 3 หน้า + CrmHub · action v1 6 ตัว · ข้อมูลข้ามกับ v2 ═══`);
console.log(`[env] DB ${host} · tag ${TAG}\n`);

try {
  const V1 = (await import(pathToFileURL(resolve(V1_ACTIONS)).href)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service")) as Any;
  const coreHash = (await import("@/lib/core/hash" as string)) as Any;
  const CT = (await import("@/lib/modules/crm/contacts" as string)) as Any;
  const SVC = (await import("@/lib/modules/crm/service" as string)) as Any;
  const UI = (await import("@/lib/modules/crm/ui" as string)) as Any;
  const CO_ACT = (await import("@/lib/modules/crm/companies-actions" as string).catch(() => ({}))) as Any;

  const T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  TIDS.push(T);
  const mkWho = async (suffix: string, role: string): Promise<Who> => {
    const u = await P.user.create({ data: { email: `${TAG}-${suffix}@qc.invalid`, name: `QC ${suffix} ${TAG}` } });
    USERS.push(u.id);
    await P.membership.create({ data: { userId: u.id, tenantId: T, role, unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    const token = coreHash.randomToken(32) as string;
    await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 30 * DAY), expiresAt: new Date(Date.now() + 90 * DAY) } });
    return { userId: u.id, role, tenantId: T, cookie: `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${T}` };
  };
  const owner = await mkWho("owner", "OWNER");
  const S = (await sysSvc.createSystem(T, "CRM", `CRM v1 ${TAG}`)).id as string;
  const crmOf = async () => ((await P.appSystem.findUnique({ where: { id: S } }))?.settings as Any)?.crm ?? {};
  const setUi = (v: 1 | 2) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify({ uiVersion: v }), S);
  const actor = { userId: owner.userId, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const ctx2 = { tenantId: T, systemId: S, actorUserId: owner.userId };

  // ══ S0 — โครง + ประตู ══
  console.log("── S0 · structure ──");
  const SIX = ["createContactAction", "createDealAction", "moveDealAction", "addActivityAction", "completeActivityAction", "issueQuotationAction"];
  chk("V1-S0.1", "crm/actions.ts ยังมี action v1 ครบ 6 ตัว · หน้า contacts/deals/activities + CrmHub มีอยู่ · ร้านใหม่ = uiVersion 1 (ค่าเริ่มต้น)",
    SIX.every((n) => typeof V1[n] === "function") && Object.values(PAGES).every(existsSync) && typeof UI.CrmHub === "function" && (await crmOf())?.uiVersion !== 2,
    "all", `missing=${SIX.filter((n) => typeof V1[n] !== "function").join(",") || "-"} crmHub=${typeof UI.CrmHub} settings=${pj(await crmOf())}`);
  {
    const co = await render(owner, PAGES.companies, { id: S });
    chk("V1-S0.2", "[harness control] request scope ทำงาน (หน้า v2 ล้วน /crm/companies ของร้าน uiVersion 1 → 404 ผ่านตัวตรวจ notFound)", co.status === 404, "404", pDesc(co));
  }

  // ══ S1 — หน้า v1 สามหน้า + CrmHub ══
  console.log("\n── S1 · v1 pages ──");
  const hub = await render(owner, PAGES.sys, { id: S });
  chk("V1-S1.1", "ทางเข้าโมดูล /app/sys/[id] ของร้าน uiVersion 1 = CrmHub เดิม (แท็บ v1 4 แท็บ ไม่มี \"บริษัท\") · ไม่มีหน้าแรก v2 (crm-home) · ไม่มีตัวเลือกเทมเพลต",
    hub.status === 200 && hasEl(hub, "CrmHub") && !hasTid(hub, "crm-home") && !hasTid(hub, "crm-template-picker") && allOf(hub).includes("งานติดตาม") && !allOf(hub).includes(`/app/sys/${S}/crm/companies`),
    "CrmHub", `status=${pDesc(hub)} hub=${hasEl(hub, "CrmHub")} home=${hasTid(hub, "crm-home")}`);
  const pgC = await render(owner, PAGES.contacts, { id: S });
  const pgD = await render(owner, PAGES.deals, { id: S });
  const pgA = await render(owner, PAGES.activities, { id: S });
  chk("V1-S1.2", "หน้า /crm/contacts = ContactsV1Page (CrmContactsSection) พร้อมฟอร์มเพิ่มผู้ติดต่อ v1 (createContactAction)",
    pgC.status === 200 && (hasEl(pgC, "ContactsV1Page") || hasEl(pgC, "CrmContactsSection")) && hasEl(pgC, "CrmContactsSection"), "v1", `${pDesc(pgC)} section=${hasEl(pgC, "CrmContactsSection")}`);
  chk("V1-S1.3", "หน้า /crm/deals = DealsV1Page (CrmDealsSection · กระดานไปป์ไลน์ v1)",
    pgD.status === 200 && hasEl(pgD, "CrmDealsSection"), "v1", `${pDesc(pgD)} section=${hasEl(pgD, "CrmDealsSection")}`);
  chk("V1-S1.4", "หน้า /crm/activities = ActivitiesV1Page (CrmActivitiesSection)",
    pgA.status === 200 && hasEl(pgA, "CrmActivitiesSection"), "v1", `${pDesc(pgA)} section=${hasEl(pgA, "CrmActivitiesSection")}`);

  // ══ S2 — action v1 หกตัว (FormData) ══
  console.log("\n── S2 · v1 actions ──");
  const cName = `คุณวีหนึ่งฟอร์ม ${rand}`;
  const cPhone = phoneOf();
  const a1 = await run(owner, V1.createContactAction, fd({ systemId: S, name: cName, phone: cPhone, source: "หน้าร้าน" }));
  const c1 = (await P.crmContact.findFirst({ where: { tenantId: T, systemId: S, name: cName } })) as Any;
  chk("V1-S2.1", "createContactAction(FormData) → CrmContact 1 แถว (ชื่อ · เบอร์) ในระบบนี้", a1.ok && !!c1 && String(c1.phone ?? "").replace(/\D/g, "").endsWith(cPhone.slice(-8)), "row", `${aDesc(a1)} row=${!!c1} phone=${c1?.phone}`);
  const board = await SVC.getBoard({ tenantId: T, systemId: S });
  const stages = [...(board.pipeline.stages as Any[])].sort((a, b) => a.sortOrder - b.sortOrder);
  const openStages = stages.filter((s) => s.kind === "OPEN");
  const dTitle = `ดีลฟอร์มวีหนึ่ง ${rand}`;
  const a2 = await run(owner, V1.createDealAction, fd({ systemId: S, contactId: c1?.id ?? "", pipelineId: board.pipeline.id, stageId: openStages[0]?.id ?? "", title: dTitle, value: "1520.50" }));
  const d1 = (await P.crmDeal.findFirst({ where: { tenantId: T, systemId: S, title: dTitle } })) as Any;
  chk("V1-S2.2", "createDealAction(FormData) → CrmDeal ขั้นแรก · มูลค่า 1,520.50 บาท = 152,050 สตางค์ · ผูกผู้ติดต่อ", a2.ok && !!d1 && d1.stageId === openStages[0]?.id && d1.valueSatang === 152_050 && d1.contactId === c1?.id,
    "deal", `${aDesc(a2)} deal=${!!d1} value=${d1?.valueSatang} stage=${d1?.stageId === openStages[0]?.id}`);
  const target = openStages[1] ?? stages.find((s) => s.kind === "WON");
  const a3 = await run(owner, V1.moveDealAction, fd({ systemId: S, dealId: d1?.id ?? "", stageId: target?.id ?? "" }));
  const d1b = (await P.crmDeal.findUnique({ where: { id: d1?.id ?? "-" } })) as Any;
  const hist = d1 ? await P.crmDealStageHistory.count({ where: { dealId: d1.id, toStageId: target?.id } }) : 0;
  chk("V1-S2.3", "moveDealAction(FormData) → ดีลย้ายไปขั้นที่เลือก + แถวประวัติขั้น", a3.ok && d1b?.stageId === target?.id && hist >= 1, "moved", `${aDesc(a3)} stage=${d1b?.stageId === target?.id} history=${hist}`);
  const tTitle = `งานโทรวีหนึ่ง ${rand}`;
  const due = new Date(Date.now() + 2 * DAY).toISOString().slice(0, 10);
  const a4 = await run(owner, V1.addActivityAction, fd({ systemId: S, contactId: c1?.id ?? "", dealId: d1?.id ?? "", type: "CALL", title: tTitle, dueAt: due }));
  const act = (await P.crmActivity.findFirst({ where: { tenantId: T, systemId: S, title: tTitle } })) as Any;
  chk("V1-S2.4", "addActivityAction(FormData) → CrmActivity CALL ค้าง (doneAt null) มีกำหนด · ผูกผู้ติดต่อ+ดีล", a4.ok && !!act && act.type === "CALL" && !act.doneAt && !!act.dueAt && act.contactId === c1?.id && act.dealId === d1?.id,
    "activity", `${aDesc(a4)} row=${!!act} type=${act?.type} done=${act?.doneAt ?? null}`);
  const a5 = await run(owner, V1.completeActivityAction, fd({ systemId: S, activityId: act?.id ?? "" }));
  const actB = (await P.crmActivity.findUnique({ where: { id: act?.id ?? "-" } })) as Any;
  chk("V1-S2.5", "completeActivityAction(FormData) → doneAt ถูกตั้ง", a5.ok && !!actB?.doneAt, "done", `${aDesc(a5)} doneAt=${actB?.doneAt ?? null}`);
  const docsBefore = await P.accountDocument.count({ where: { tenantId: T } }).catch(() => 0);
  const a6 = await run(owner, V1.issueQuotationAction, fd({ systemId: S, dealId: d1?.id ?? "" }));
  const docsAfter = await P.accountDocument.count({ where: { tenantId: T } }).catch(() => 0);
  chk("V1-S2.6", "issueQuotationAction(FormData) บนร้านที่ยังไม่มีสมุดบัญชี → ไม่ล่ม (ไม่ throw) และไม่มีเอกสารถูกสร้าง (พฤติกรรม v1 เดิม: ผล ok:false ถูกกลืน · DealsError พากลับด้วย ?notice=)",
    a6.ok && docsAfter === docsBefore, "no throw · no doc", `${aDesc(a6)} docs=${docsBefore}→${docsAfter}`);
  {
    const msg = `ข้อความทดสอบจากฟอร์มดีล ${rand}`;
    const withN = await render(owner, PAGES.deals, { id: S }, { notice: msg });
    const without = await render(owner, PAGES.deals, { id: S });
    chk("V1-S2.7", "หน้าดีล v1 แสดงข้อความ ?notice= (ผลของ withDealNotice) เหนือหน้า v1 เดิม · ไม่มี param = ไม่มีแถบข้อความ (หน้า v1 เดิม)",
      withN.status === 200 && hasTid(withN, "deals-v1-notice") && allOf(withN).includes(msg) && hasEl(withN, "CrmDealsSection") && without.status === 200 && !hasTid(without, "deals-v1-notice") && hasEl(without, "CrmDealsSection"),
      "notice shown only with param", `with=${pDesc(withN)}/${hasTid(withN, "deals-v1-notice")} without=${hasTid(without, "deals-v1-notice")}`);
  }

  // ══ S3 — ข้อมูลข้ามกันทั้งสองทาง ══
  console.log("\n── S3 · cross data ──");
  const svcName = `คุณจากบริการวีสอง ${rand}`;
  let svcOk = false;
  try { await CT.createContact(ctx2, actor, { firstName: svcName, phone: phoneOf() }); svcOk = true; } catch (e) { console.log(`   ↳ createContact v2: ${cut((e as Error)?.message)}`); }
  const pgC2 = await render(owner, PAGES.contacts, { id: S });
  const pgD2 = await render(owner, PAGES.deals, { id: S });
  chk("V1-S3.1", "ผู้ติดต่อที่สร้างผ่านบริการ v2 (contacts.createContact) โผล่ในหน้าผู้ติดต่อ v1 · ดีลที่สร้างผ่าน action v1 โผล่ในกระดาน v1",
    svcOk && pgC2.status === 200 && hasEl(pgC2, "CrmContactsSection") && allOf(pgC2).includes(svcName) && allOf(pgC2).includes(cName) && pgD2.status === 200 && allOf(pgD2).includes(dTitle),
    "both on v1", `svc=${svcOk} contacts=${pDesc(pgC2)} shows=${allOf(pgC2).includes(svcName)}/${allOf(pgC2).includes(cName)} deals=${allOf(pgD2).includes(dTitle)}`);
  let listed = false;
  try { listed = pj(await CT.listContacts(ctx2, actor, { q: cName })).includes(c1?.id ?? "§"); } catch { listed = false; }
  await setUi(2);
  const v2C = await render(owner, PAGES.contacts, { id: S });
  const v2D = await render(owner, PAGES.deals, { id: S });
  const v2A = await render(owner, PAGES.activities, { id: S }, { status: "done" });
  const v2Home = await render(owner, PAGES.sys, { id: S });
  chk("V1-S3.2", "ข้อมูลของ action v1 อยู่ในบริการ/หน้า v2: listContacts (v2) เจอผู้ติดต่อ · สลับเป็น 2 แล้วหน้า contacts/deals เป็น v2 (ไม่มี section v1) และแสดงผู้ติดต่อ/ดีลเดิม · ทางเข้าเป็นหน้าแรก v2",
    listed && v2C.status === 200 && !hasEl(v2C, "CrmContactsSection") && allOf(v2C).includes(cName) && v2D.status === 200 && !hasEl(v2D, "CrmDealsSection") && allOf(v2D).includes(dTitle) && hasTid(v2Home, "crm-home"),
    "v2 sees v1 data", `listed=${listed} contacts=${pDesc(v2C)} v1Section=${hasEl(v2C, "CrmContactsSection")} name=${allOf(v2C).includes(cName)} deals=${pDesc(v2D)} title=${allOf(v2D).includes(dTitle)} home=${hasTid(v2Home, "crm-home")} activities=${pDesc(v2A)}`);
  const v2co = await run(owner, CO_ACT.createCompanyAction, S, { name: `บริษัทตอนเป็นสอง ${rand}` });
  await setUi(1);
  const back = await render(owner, PAGES.contacts, { id: S });
  const coAt1 = await run(owner, CO_ACT.createCompanyAction, S, { name: `บริษัทตอนเป็นหนึ่ง ${rand}` });
  const counts = { contacts: await P.crmContact.count({ where: { systemId: S } }), deals: await P.crmDeal.count({ where: { systemId: S } }), companies: await P.crmCompany.count({ where: { systemId: S } }) };
  chk("V1-S3.3", "สลับกลับเป็น 1: หน้า v1 กลับมา (CrmContactsSection) และยังเห็นทุกคน · action v2 ถูกปฏิเสธ (FORBIDDEN) อีกครั้ง · ไม่มีอะไรถูกลบ (บริษัทที่สร้างตอนเป็น 2 ยังอยู่)",
    v2co.ok && back.status === 200 && hasEl(back, "CrmContactsSection") && allOf(back).includes(cName) && allOf(back).includes(svcName) && !coAt1.ok && coAt1.code === "FORBIDDEN" && counts.companies === 1 && counts.contacts >= 2 && counts.deals === 1,
    "rows kept", `v2company=${aDesc(v2co)} v1=${pDesc(back)} section=${hasEl(back, "CrmContactsSection")} v2At1=${aDesc(coAt1)} counts=${pj(counts)}`);
} catch (e) {
  chk("V1-FATAL", "the regression ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  const ids = TIDS.filter((x) => /^[a-z0-9]+$/i.test(x));
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* FK order — next pass */ } };
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[])
      .map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) {
      await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
      await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.tenant.delete({ where: { id } }));
    }
    for (const uid of USERS) await del(() => P.session.deleteMany({ where: { userId: uid } }));
    for (const uid of USERS) await del(() => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
    for (const uid of USERS) await del(() => P.user.delete({ where: { id: uid } }));
    try {
      const left: string[] = [];
      for (const t of tables) {
        const n = Number((((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[])[0]?.n) ?? 0);
        if (n > 0) left.push(`${t}=${n}`);
      }
      const tenants = await P.tenant.count({ where: { id: { in: ids } } });
      const users = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
      chk("V1-CLEAN", "ร้านทิ้ง + ทุกแถวของร้าน + ผู้ใช้/session ทิ้ง ถูกลบหมด (ฐาน QC กลับเหมือนเดิม)", left.length === 0 && tenants === 0 && users === 0, "0", `${left.join(" · ") || "-"} tenants=${tenants} users=${users}`);
    } catch (e) {
      chk("V1-CLEAN", "ร้านทิ้งถูกลบหมด", false, "0", cut((e as Error)?.message));
    }
  }
  await prisma.$disconnect();
}

void SCOPE_RUNS;
const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
console.log(`\n${passed === total ? "🟢" : "🔴"} CRM v1: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings: cks.filter((c) => !c.ok).map((c) => c.id) })}`);
process.exit(passed === total ? 0 : 1);
