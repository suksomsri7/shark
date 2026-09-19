// probe-c19-review.mts — builder evidence for the controller's C1.9 review items B1 · S1 · S2 · S5 · S6 (positive + negative each)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c19-review.mts
// requires: nothing seeded — one throwaway tenant `qc-c19r-<rand>` + users/sessions, swept in `finally` · no drainOutbox · QC DB only
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";

const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
async function inScope<T>(cookie: string, phase: "render" | "action", fn: () => Promise<T>): Promise<T> {
  const req = new Request("http://qc.local/app", { headers: { cookie, "user-agent": "qc-c19r" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const ws = { route: "/app", page: "/app/page", forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
  const unit = { type: "request", phase, implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname: "/app", search: "" } };
  return nextWork.workAsyncStorage.run(ws, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const coreHash = (await import("@/lib/core/hash" as string)) as Any;
const OBJ = (await import("@/lib/modules/crm/objects" as string)) as Any;
const MEM = (await import("@/lib/modules/member" as string)) as Any;
const ACT = (await import("@/lib/modules/crm/objects-actions" as string)) as Any;
const SRV = (await import("@/components/crm/objects/server" as string)) as Any;
const TYP = (await import("@/components/crm/objects/types" as string)) as Any;

const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, name: string, ok: unknown, detail: string) => {
  cks.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — ${detail}`}`);
};
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c19r-${rand}`;
const USERS: string[] = [];
let T = "";

// ─── page renderer (the oracle's technique: call the page inside a request scope, walk the tree) ───
const isEl = (x: Any) => !!x && typeof x === "object" && typeof x.$$typeof === "symbol" && "props" in x;
async function walk(n: Any, acc: { text: string[]; els: Any[]; seen: Set<object> }, d = 0): Promise<void> {
  if (d > 220 || n === null || n === undefined || typeof n === "boolean" || typeof n === "function" || typeof n === "symbol") return;
  if (typeof n === "string" || typeof n === "number") { acc.text.push(String(n)); return; }
  if (typeof n !== "object" || acc.seen.has(n)) return;
  acc.seen.add(n);
  if (typeof n.then === "function") return walk(await n, acc, d + 1);
  if (Array.isArray(n)) { for (const x of n) await walk(x, acc, d + 1); return; }
  if (isEl(n)) {
    const t = n.type;
    acc.els.push({ name: typeof t === "function" ? t.name : String(t), props: n.props ?? {} });
    if (typeof t === "function") {
      if (t.constructor?.name === "AsyncFunction") return walk(await t(n.props), acc, d + 1);
      const e = console.error;
      console.error = () => undefined;
      try { return await walk(t(n.props), acc, d + 1); } catch { /* client component */ } finally { console.error = e; }
    }
    for (const [k, v] of Object.entries(n.props ?? {})) if (k !== "key") await walk(v, acc, d + 1);
    return;
  }
  for (const v of Object.values(n)) await walk(v, acc, d + 1);
}
async function render(cookie: string, file: string, params: Record<string, string>, sp: Record<string, string> = {}) {
  const mod = (await import(pathToFileURL(resolve(file)).href)) as Any;
  const acc = { text: [] as string[], els: [] as Any[], seen: new Set<object>() };
  try {
    await inScope(cookie, "render", async () => walk(await mod.default({ params: Promise.resolve(params), searchParams: Promise.resolve(sp) }), acc));
    return { status: 200, text: acc.text.join("\n"), els: acc.els };
  } catch (e) {
    const dg = String((e as Any)?.digest ?? "");
    return { status: /404/.test(dg) ? 404 : -1, text: String((e as Error)?.message ?? e), els: [] as Any[] };
  }
}

console.log(`\n═══ probe C1.9 review · DB ${host} · ${TAG} ═══`);
try {
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  const S = (await sysSvc.createSystem(T, "CRM", `CRM ${TAG}`)).id as string;
  await P.appSystem.update({ where: { id: S }, data: { settings: { crm: { uiVersion: 2 } } } });
  const STAFF = ["crm.contact.read", "crm.contact.create", "crm.contact.update", "crm.company.read", "crm.company.update", "crm.record.read", "crm.record.create", "crm.record.update"];
  const mk = async (suffix: string, role: string, keys: string[]) => {
    const u = await P.user.create({ data: { email: `${TAG}-${suffix}@qc.invalid`, name: `QC ${suffix}` } });
    USERS.push(u.id);
    const permissions = Object.fromEntries(keys.map((k) => [k, true]));
    await P.membership.create({ data: { userId: u.id, tenantId: T, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
    const tok = coreHash.randomToken(32) as string;
    await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(tok), idleExpiresAt: new Date(Date.now() + 864e5), expiresAt: new Date(Date.now() + 864e5) } });
    return { id: u.id, cookie: `shark_session=${tok}; __Host-shark_session=${tok}; shark_tenant=${T}`, actor: { userId: u.id, role, unitAccess: ["*"], permissions } };
  };
  const owner = await mk("owner", "OWNER", []);
  const mgr = await mk("mgr", "MANAGER", []);
  const thana = await mk("thana", "STAFF", STAFF);
  const reader = await mk("reader", "STAFF", ["crm.contact.read"]);
  const ctx = { tenantId: T, systemId: S, actorUserId: owner.id };
  const party = async (name: string) => (await P.party.create({ data: { tenantId: T, name, kind: "COMPANY" } })).id;
  const co = (await P.crmCompany.create({ data: { tenantId: T, systemId: S, name: `บริษัท ${rand}`, partyId: await party(`บริษัท ${rand}`), ownerUserId: thana.id } })).id as string;
  const kParty = (await P.party.create({ data: { tenantId: T, name: `ผู้อ่าน ${rand}`, kind: "PERSON" } })).id;
  const kR = (await P.crmContact.create({ data: { tenantId: T, systemId: S, name: `ผู้อ่าน ${rand}`, firstName: "ผู้อ่าน", partyId: kParty, ownerUserId: reader.id } })).id as string;
  // object "pol" (COMPANY) — pno TEXT · secret TEXT sensitive · req TEXT sensitive REQUIRED · when DATETIME
  await OBJ.create(ctx, owner.actor, { key: "pol", label: "กรมธรรม์", labelPlural: "กรมธรรม์", parentType: "COMPANY", titleFieldKey: "pno", showAsTab: true });
  const sec = await MEM.fields.createSection({ ...ctx, objectKey: "pol" }, { key: "polInfo", label: "ข้อมูล" });
  for (const f of [
    { key: "pno", label: "เลขกรมธรรม์", type: "TEXT" },
    { key: "secret", label: "เลขลับ", type: "TEXT", sensitive: true },
    { key: "req", label: "โรคประจำตัว", type: "TEXT", sensitive: true, required: true },
    { key: "when", label: "นัดตรวจ", type: "DATETIME" },
  ]) await MEM.fields.createField({ ...ctx, objectKey: "pol" }, { sectionId: sec.id, ...f });
  await OBJ.create(ctx, owner.actor, { key: "vis", label: "การเยี่ยม", labelPlural: "การเยี่ยม", parentType: "CONTACT", titleFieldKey: "vname", showAsTab: true });
  const act = (who: Any, name: string, ...args: Any[]) => inScope(who.cookie, "action", () => ACT[name](...args)) as Promise<Any>;
  const REC = "src/app/app/sys/[id]/crm/objects/[key]/[recordId]/page.tsx";

  // ══ B1 — sensitive values through the UI ══
  const ffO = (await SRV.formFieldsOf(ctx, owner.actor, "pol")) as Any[];
  const ffT = (await SRV.formFieldsOf({ ...ctx, actorUserId: thana.id }, thana.actor, "pol")) as Any[];
  chk("B1.1", "access is per viewer (D8 decision, not 'value missing'): OWNER → secret/req not hidden · STAFF → hidden · non-sensitive never hidden",
    ffO.every((f) => !f.hidden) && ffT.find((f) => f.key === "secret")?.hidden && ffT.find((f) => f.key === "req")?.hidden && !ffT.find((f) => f.key === "pno")?.hidden,
    JSON.stringify({ o: ffO.map((f) => [f.key, f.hidden]), t: ffT.map((f) => [f.key, f.hidden]) }));
  const when = TYP.thaiInputToIso("2026-09-19T10:00");
  const c1 = await act(owner, "createRecordAction", S, "pol", { parentId: co, values: { pno: `P1-${rand}`, secret: "S-111", req: "R-1", when } });
  const r1 = c1.ok ? await OBJ.records.get(ctx, owner.actor, "pol", c1.data.id) : null;
  chk("B1.2", "OWNER create with sensitive values (incl. a REQUIRED sensitive field) → stored and readable by OWNER", c1.ok && r1?.values.secret === "S-111" && r1?.values.req === "R-1", `${JSON.stringify(c1).slice(0, 200)}`);
  const u1 = c1.ok ? await act(owner, "updateRecordAction", S, "pol", c1.data.id, { values: { secret: "S-222" } }) : { ok: false };
  const r1b = c1.ok ? await OBJ.records.get(ctx, owner.actor, "pol", c1.data.id) : null;
  chk("B1.3", "OWNER edit of a sensitive value → saved", u1.ok && r1b?.values.secret === "S-222", JSON.stringify(u1).slice(0, 200));
  const cNeg = await act(owner, "createRecordAction", S, "pol", { parentId: co, values: { pno: `NEG-${rand}` } });
  chk("B1.4", "[negative] the REQUIRED sensitive field is still enforced (missing → VALIDATION, Thai)", !cNeg.ok && cNeg.code === "VALIDATION" && /[ก-๙]/.test(cNeg.error), JSON.stringify(cNeg).slice(0, 200));
  const c2 = await act(owner, "createRecordAction", S, "pol", { parentId: co, values: { pno: `P2-${rand}`, req: "R-2" } });
  const pT1 = c1.ok ? await render(thana.cookie, REC, { id: S, key: "pol", recordId: c1.data.id }) : null;
  const pT2 = c2.ok ? await render(thana.cookie, REC, { id: S, key: "pol", recordId: c2.data.id }) : null;
  const hiddenCount = (t: string) => t.split("ซ่อน (ข้อมูลอ่อนไหว)").length - 1;
  chk("B1.5", "STAFF record page: 'ซ่อน (ข้อมูลอ่อนไหว)' once per sensitive field that HAS a value (rec1: secret+req = 2 · rec2: req only = 1), never the value",
    pT1?.status === 200 && pT2?.status === 200 && hiddenCount(pT1.text) === 2 && hiddenCount(pT2.text) === 1 && !pT1.text.includes("S-222") && !pT1.text.includes("R-1"),
    `p1=${pT1?.status}:${pT1 ? hiddenCount(pT1.text) : "-"} p2=${pT2?.status}:${pT2 ? hiddenCount(pT2.text) : "-"}`);
  const editT = pT1?.els.find((e: Any) => e.name === "EditRecordToggle");
  const pO1 = c1.ok ? await render(owner.cookie, REC, { id: S, key: "pol", recordId: c1.data.id }) : null;
  const editO = pO1?.els.find((e: Any) => e.name === "EditRecordToggle");
  chk("B1.6", "STAFF never gets an input for a field it cannot see (edit form omits secret/req) · OWNER's edit form has them and the page shows the value",
    !!editT && editT.props.fields.every((f: Any) => !(f.key === "secret" && !f.hidden)) && editT.props.fields.filter((f: Any) => !f.hidden).every((f: Any) => !["secret", "req"].includes(f.key)) &&
      !!editO && editO.props.fields.some((f: Any) => f.key === "secret" && !f.hidden) && pO1!.text.includes("S-222"),
    `thanaForm=${editT ? JSON.stringify(editT.props.fields.map((f: Any) => [f.key, f.hidden])) : "none"} ownerForm=${editO ? "yes" : "none"} ownerValue=${pO1?.text.includes("S-222")}`);

  // ══ S1 — DATETIME is Thai time ══
  const stored = r1?.values.when;
  chk("S1.1", "10:00 Thai → '+07:00' ISO → stored 03:00Z → back to '2026-09-19T10:00' in the edit input and '10:00' in the display",
    when === "2026-09-19T10:00:00+07:00" && stored === "2026-09-19T03:00:00.000Z" && TYP.isoToThaiInput(stored) === "2026-09-19T10:00" && String(TYP.displayValue(stored, [], "DATETIME")).includes("10:00"),
    `when=${when} stored=${stored} back=${stored ? TYP.isoToThaiInput(stored) : "-"} disp=${stored ? TYP.displayValue(stored, [], "DATETIME") : "-"}`);
  chk("S1.2", "[negative] malformed input is passed through untouched (engine rejects with Thai) · garbage ISO → empty input",
    TYP.thaiInputToIso("19/09/2026 10:00") === "19/09/2026 10:00" && TYP.isoToThaiInput("nope") === "", "-");

  // ══ S2 — no object tabs without crm.record.read ══
  const CT = "src/app/app/sys/[id]/crm/contacts/[contactId]/page.tsx";
  const tabOf = (r: Any) => r.els.some((e: Any) => /[?&]tab=obj-vis/.test(String(e.props?.href ?? "")));
  const rR = await render(reader.cookie, CT, { id: S, contactId: kR });
  const rO = await render(owner.cookie, CT, { id: S, contactId: kR });
  chk("S2.1", "contact 360: reader without crm.record.read → no obj-vis tab (page itself 200) · [positive] OWNER → tab present",
    rR.status === 200 && !tabOf(rR) && rO.status === 200 && tabOf(rO), `reader=${rR.status}/${tabOf(rR)} owner=${rO.status}/${tabOf(rO)}`);
  const DL = "src/app/app/sys/[id]/crm/companies/[companyId]/page.tsx";
  const rMiss = await render(owner.cookie, DL, { id: S, companyId: co }, { tab: "obj-nope" });
  const rCT = await render(owner.cookie, CT, { id: S, contactId: kR }, { tab: "obj-nope" });
  chk("S2.2", "unknown obj-* tab on contact 360 → Thai 'ไม่พบรายการนี้' panel (company keeps its own fallback)", rCT.status === 200 && rCT.text.includes("ไม่พบรายการนี้") && rMiss.status === 200, `contact=${rCT.status}/${rCT.text.includes("ไม่พบรายการนี้")}`);

  // ══ S5 — rename / delete / cap of saved views ══
  const v1 = await act(owner, "saveObjectViewAction", S, "pol", { name: "ของฉัน", filters: { q: "P" } });
  const ren = v1.ok ? await act(owner, "renameObjectViewAction", S, "pol", v1.data.id, { name: "ชื่อใหม่" }) : { ok: false };
  const renA = v1.ok ? await P.auditLog.count({ where: { tenantId: T, action: "crm.object.view.rename", targetId: v1.data.id, actorId: owner.id } }) : 0;
  const renT = v1.ok ? await act(thana, "renameObjectViewAction", S, "pol", v1.data.id, { name: "ยึด" }) : { ok: true };
  chk("S5.1", "owner renames own view (+ audit) · [negative] STAFF on someone else's PRIVATE view → NOT_FOUND, name unchanged",
    ren.ok && renA === 1 && !renT.ok && renT.code === "NOT_FOUND" && (await P.memberSavedView.findUnique({ where: { id: v1.data.id } }))?.name === "ชื่อใหม่", `${JSON.stringify(ren).slice(0, 80)} audit=${renA} thana=${renT.code}`);
  const vt = await act(owner, "saveObjectViewAction", S, "pol", { name: "ทั้งร้าน", filters: { q: "P" }, scope: "TEAM" });
  const tT = vt.ok ? await act(thana, "deleteObjectViewAction", S, "pol", vt.data.id) : { ok: true };
  const tM = vt.ok ? await act(mgr, "renameObjectViewAction", S, "pol", vt.data.id, { name: "ผู้จัดการแก้" }) : { ok: false };
  const del = vt.ok ? await act(mgr, "deleteObjectViewAction", S, "pol", vt.data.id) : { ok: false };
  const delA = vt.ok ? await P.auditLog.count({ where: { tenantId: T, action: "crm.object.view.delete", targetId: vt.data.id } }) : 0;
  chk("S5.2", "TEAM view: [negative] STAFF delete → FORBIDDEN · MANAGER rename + delete → ok (+ audit)",
    !tT.ok && tT.code === "FORBIDDEN" && tM.ok && del.ok && delA === 1 && !(await P.memberSavedView.findUnique({ where: { id: vt.data?.id ?? "x" } })),
    `staff=${tT.code} mgrRename=${tM.ok} del=${del.ok} audit=${delA}`);
  const have = await P.memberSavedView.count({ where: { tenantId: T, systemId: S, objectKey: "pol", ownerUserId: owner.id } });
  if (have < 49) {
    await P.memberSavedView.createMany({ data: Array.from({ length: 49 - have }, (_x, i) => ({ tenantId: T, systemId: S, ownerUserId: owner.id, scope: "PRIVATE", name: `เติม ${i}`, objectKey: "pol", filters: {} })) });
  }
  const c50 = await act(owner, "saveObjectViewAction", S, "pol", { name: "ที่ห้าสิบ", filters: {} });
  const c51 = await act(owner, "saveObjectViewAction", S, "pol", { name: "เกิน", filters: {} });
  const n = await P.memberSavedView.count({ where: { tenantId: T, systemId: S, objectKey: "pol", ownerUserId: owner.id } });
  chk("S5.3", "cap: the 50th view saves · [negative] the 51st → VALIDATION with a Thai message, still 50 rows", c50.ok && !c51.ok && c51.code === "VALIDATION" && /[ก-๙]/.test(c51.error) && n === 50, `50th=${c50.ok} 51st=${c51.code} rows=${n}`);

  // ══ S6 — CONFIRM_REQUIRED opens the key + reason inputs ══
  const a0 = await act(owner, "archiveObjectAction", S, "pol", {});
  const src = readFileSync("src/app/app/sys/[id]/crm/settings/objects/_components/ObjectsAdmin.tsx", "utf8");
  const a1 = await act(owner, "archiveObjectAction", S, "pol", { confirmKey: "pol", reason: "ทดสอบรีวิว C1.9" });
  chk("S6.1", "archive with records and no confirmation → code CONFIRM_REQUIRED, which the form turns into 'show key + reason' (setNeeds(true)) · [positive] key + reason → archived",
    !a0.ok && a0.code === "CONFIRM_REQUIRED" && /res\.code === "CONFIRM_REQUIRED"\) setNeeds\(true\)/.test(src) && /\{needs && \(/.test(src) && a1.ok,
    `none=${a0.code} static=${/setNeeds\(true\)/.test(src)} ok=${a1.ok}`);
} catch (e) {
  chk("FATAL", "probe ran to the end", false, String((e as Error)?.stack ?? e).slice(0, 600));
} finally {
  if (T) {
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => r.table_name as string);
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = '${T}'`).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.businessUnit.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
  }
  for (const u of USERS) {
    await P.session.deleteMany({ where: { userId: u } }).catch(() => undefined);
    await P.appNotification.deleteMany({ where: { recipientUserId: u } }).catch(() => undefined);
    await P.user.delete({ where: { id: u } }).catch(() => undefined);
  }
  const left = T ? await P.tenant.count({ where: { id: T } }) : 0;
  chk("CLEAN", "throwaway tenant + users removed", left === 0 && (await P.user.count({ where: { id: { in: USERS } } })) === 0, `tenant=${left}`);
  await prisma.$disconnect();
}
const passed = cks.filter((c) => c.ok).length;
console.log(`\n${passed === cks.length ? "🟢" : "🔴"} probe C1.9 review: ${passed}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, findings: cks.filter((c) => !c.ok).map((c) => c.id) })}`);
process.exit(passed === cks.length ? 0 : 1);
