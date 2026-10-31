// QC — SVC B.16 · ความชอบ/ข้อห้ามลูกค้าบนการ์ดงาน + มือถือหมอ (แรงนวด · แพ้น้ำมัน) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-b.16.md (§2–§6 ผูกตรงตัว) · MASTER-PLAN แถว B.16 · DESIGN-BOOKING-QUEUE R7 ("เก็บใน CRM/สมาชิก ไม่ใช่ในนัด") · §6 แถว CRM v2
//        engine ฟิลด์สมาชิกเดิม (member/fields.ts) + นโยบายข้อมูลอ่อนไหวเดิม (member/privacy.ts evaluateSensitiveAccess · D8 · D17) — ห้ามทำ engine ใหม่
//        ข้อมูลฉาก: scripts/svc-qc-data.mts บล็อก "SVC B.16" (SQC_CUSTOMER_NOTES_SCENE) · ไม่มีภาพแบบ (ภาพ "—" ในแผน)
//
// กลุ่มข้อ:
//   PC positive control (ต้องเขียวตั้งแต่ก่อนทำ: engine ฟิลด์อ่านฉากได้ · นโยบายอ่อนไหวของสมาชิกตัดสินตามที่ฉากตั้ง · คอมโพเนนต์ B.5 render ได้ · กล่องความเป็นส่วนตัว B.11)
//   D  ค่าตั้ง booking.privacy.jobCardFields (ทะเบียน · ป้ายไทย · ชั้น TENANT · เจ้าของเท่านั้น · ค่าเริ่มตามแม่แบบ · schema · หน้า 14)
//   P  สิทธิ์ (pure): คีย์ booking.customer.notes · แถวตารางสิทธิ์ · ชุดตามแม่แบบ · canSeeCustomerNotes
//   L  ตัวโหลด loadJobCustomerNotes: ใครเห็นอะไร (OWNER/MANAGER/หมอ 2 แบบ/ไม่มีคีย์/นอกสาขา) · ลำดับ · การแสดงผล · ข้ามฟิลด์ที่ไม่ควรขึ้น · ค่าเริ่มแม่แบบ
//   X  แยกร้าน/สาขา/ระบบสมาชิก (X1 · คำตอบเหมือน "ไม่มี" ทุกไบต์) · X8 (DTO/console/log/payload ไม่มี PII · บันทึกการดูตามนโยบาย · ไม่บันทึกซ้ำ) · อ่านอย่างเดียว
//   R  คอมโพเนนต์: TodayLine/MyQueue รับ prop notes · ไม่มี prop = DOM เดิมทุกไบต์
//   S  ไฟล์/สัญญาโค้ด (S-1 ตรวจเฉพาะตอนรับใบ) · Q svcqc ไม่ถูกแตะ · G regression · Z ล้างข้อมูล
//
// ข้อมูลทดสอบอยู่ใต้ tenant ชั่วคราว slug `qc-svc-b16-*` + ผู้ใช้ `qc-svc-b16-*@qc.invalid` · id ขึ้นต้น `svcb16_` · ลบใน finally (+ กวาดของค้างตอนเริ่ม)
// รัน (ห้ามครอบ timeout · ห้าม kill กลางคัน):
//   bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.16.mts [--no-regression]
//   `--no-regression` = ข้าม G เป็น SKIP (ไม่นับผ่าน · iso.sh ทิ้ง env จึงใช้อาร์กิวเมนต์)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_CUSTOMER_NOTES_SCENE as SC, SQC_TENANT } from "./svc-qc-data.mjs";

type Any = any;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-svc-b.16";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_B16_NO_REGRESSION === "1";
const F = {
  notes: "src/lib/modules/booking/customer-notes.ts",
  privShared: "src/lib/modules/booking/privacy-shared.ts",
  bookingIndex: "src/lib/modules/booking/index.ts",
  memberIndex: "src/lib/modules/member/index.ts",
  perms: "src/lib/core/permissions.ts",
  defs: "src/lib/core/settings/defs/booking.ts",
  todayLine: "src/components/booking/TodayLine.tsx",
  myQueue: "src/components/booking/MyQueue.tsx",
  pageToday: "src/app/app/u/[unitSlug]/booking/page.tsx",
  pageMine: "src/app/app/u/[unitSlug]/booking/mine/page.tsx",
  msgSettings: "src/components/booking/settings/BookingMessagesSettings.tsx",
} as const;
/** ไฟล์ที่ใบนี้แก้ได้ (ใบสั่ง §1) — ไฟล์ใหม่ใต้ src/components/booking/ และ src/lib/modules/member/ (ไฟล์ใหม่เท่านั้น) ได้ตามใบสั่ง */
const OWN = new Set<string>([F.notes, F.privShared, F.bookingIndex, F.memberIndex, F.perms, F.defs, F.todayLine, F.myQueue, F.pageToday, F.pageMine]);
/** ห้ามแตะ (ใบสั่ง §1 "ห้ามแตะ") — engine ฟิลด์/นโยบายสมาชิก · จอ B.5 ส่วนตัวโหลด · action · 3 ทะเบียน event · schema */
const FROZEN = [
  "src/lib/modules/member/fields.ts", "src/lib/modules/member/privacy.ts", "src/lib/modules/member/profile.ts", "src/lib/modules/member/access.ts",
  "src/lib/modules/booking/today-line.ts", "src/lib/modules/booking/line-access.ts", "src/lib/modules/booking/line-ops.ts",
  "src/lib/modules/booking/planner.ts", "src/lib/modules/booking/planner-run.ts", "src/lib/modules/booking/queue-line.ts", "src/lib/modules/booking/service.ts",
  "src/lib/actions/booking.ts", "src/lib/actions/booking-settings.ts", "src/lib/actions/booking-line.ts",
  "src/lib/core/settings/service.ts", "src/lib/core/settings/registry.ts", "src/lib/core/settings/types.ts",
  "src/lib/outbox-consumers.ts", "src/lib/automation/labels.ts", "src/lib/webhooks/labels.ts",
];

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ฐาน QC ของ RUN SVC ⇒ exit 4 ก่อนแตะฐาน
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }

// ═══════════════ ตัวช่วย ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 260) ?? String(v); } catch { return String(v); } };
const ok = (cond: unknown, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string, sev: Sev) => {
  cks.push({ id, res, sev, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>, sev: Sev = "CRITICAL") => {
  try { await fn(); record(id, name, "PASS", "", sev); } catch (e) { record(id, name, "FAIL", errMsg(e), sev); }
};
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => record(id, name, "SKIP", why, sev);
const THAI = /[฀-๿]/;
const isThai = (s: unknown) => typeof s === "string" && THAI.test(s);
const src = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const sorted = (a: readonly string[]) => [...a].sort();
const tryImport = async (spec: string): Promise<{ mod: Any; err: string }> => {
  try { return { mod: await import(spec as string), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const importFile = async (rel: string): Promise<{ mod: Any; err: string }> =>
  existsSync(join(ROOT, rel)) ? tryImport(pathToFileURL(join(ROOT, rel)).href) : { mod: null, err: `ยังไม่มีไฟล์ «${rel}»` };
const fnOf = (load: { mod: Any; err: string }, name: string, rel: string): ((...a: Any[]) => Any) => {
  const f = load.mod?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return f as (...a: Any[]) => Any;
};
const git = (args: string[]) => spawnSync("git", ["-C", ROOT, ...args], { encoding: "utf8" }).stdout ?? "";
const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim());
const valueImports = (s: string): string[] =>
  [...stripComments(s).matchAll(/^\s*import\s+(?!type\b)([^;]*?)\s+from\s+["']([^"']+)["']/gm)].map((m) => m[2]);
const typeOnlyImports = (s: string): string[] => [...stripComments(s).matchAll(/^\s*import\s+type\s+[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);

// ═══════════════ HTML ═══════════════
const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
const textOf = (html: string) => unesc(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const attrsOf = (openTag: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const tagName = openTag.slice(1).split(/[\s>/]/)[0];
  for (const m of openTag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:="([^"]*)")?/g)) if (m[1] !== tagName) out[m[1].toLowerCase()] = unesc(m[2] ?? "");
  return out;
};
/** กล่องทุกตัวที่มี attr ชื่อนี้ (แท็กสมดุล) → { attrs, html } ตามลำดับในเอกสาร */
function boxes(html: string, attr: string, val?: string): { attrs: Record<string, string>; html: string }[] {
  const out: { attrs: Record<string, string>; html: string }[] = [];
  const re = new RegExp(`\\s${attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:="|[\\s/>])`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const open = html.lastIndexOf("<", m.index);
    const openEnd = html.indexOf(">", m.index);
    const openTag = html.slice(open, openEnd + 1);
    const tag = /^<([a-zA-Z0-9-]+)/.exec(openTag)?.[1] ?? "div";
    let end = openEnd + 1;
    if (!openTag.endsWith("/>") && !["input", "img", "br", "hr"].includes(tag)) {
      const tagRe = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "g");
      tagRe.lastIndex = open;
      let depth = 0;
      let mm: RegExpExecArray | null;
      while ((mm = tagRe.exec(html))) {
        if (mm[2] === "/") { if (depth === 0) { end = tagRe.lastIndex; break; } continue; }
        depth += mm[1] === "/" ? -1 : 1;
        if (depth === 0) { end = tagRe.lastIndex; break; }
      }
    }
    const attrs = attrsOf(openTag);
    if (val === undefined || attrs[attr] === val) out.push({ attrs, html: html.slice(open, end) });
  }
  return out;
}
const one = (html: string, attr: string, val?: string) => {
  const b = boxes(html, attr, val);
  if (b.length !== 1) throw new AssertFail(`ต้องมี [${attr}${val === undefined ? "" : `=${val}`}] 1 กล่อง ได้ ${b.length}`);
  return b[0];
};

// ═══════════════ โหลดโมดูล ═══════════════
const notesLoad = await importFile(F.notes);
const privLoad = await importFile(F.privShared);
const permLoad = await tryImport("@/lib/core/permissions");
const settingsLoad = await tryImport("@/lib/core/settings");
const memberLoad = await tryImport("@/lib/modules/member");
const bookingLoad = await tryImport("@/lib/modules/booking");
const reactLoad = await tryImport("react");
const rdsLoad = await tryImport("react-dom/server");
const compOf = async (rel: string): Promise<{ c: Any; why: string }> => {
  const r = await importFile(rel);
  if (!r.mod) return { c: null, why: r.err };
  return typeof r.mod.default === "function" ? { c: r.mod.default, why: "" } : { c: null, why: `${rel} ไม่มี default export` };
};
const TodayLineC = await compOf(F.todayLine);
const MyQueueC = await compOf(F.myQueue);
const MsgSettingsC = await compOf(F.msgSettings);
const render = (c: { c: Any; why: string }, props: Record<string, unknown>): string => {
  if (!c.c) throw new AssertFail(c.why);
  if (!reactLoad.mod || !rdsLoad.mod) throw new AssertFail(`react: ${reactLoad.err || rdsLoad.err}`);
  return String(rdsLoad.mod.renderToStaticMarkup(reactLoad.mod.createElement(c.c, props))).replace(/<!-- -->/g, "");
};
const hasWork = typeof notesLoad.mod?.loadJobCustomerNotes === "function";
const LOAD = (ctx: Any, viewer: Any, ids: Any, opts?: Any): Promise<Any> => fnOf(notesLoad, "loadJobCustomerNotes", F.notes)(ctx, viewer, ids, opts);

// ═══════════════ ฐานข้อมูล ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]));
  return colCache.get(table) ?? [];
};
const rid = (p: string) => `svcb16_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
async function insertRow(table: string, vals: Record<string, unknown>): Promise<void> {
  const v: Record<string, unknown> = { ...vals };
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    v[c.column_name] = c.column_name === "id" ? rid("id") : t === "text" || t.startsWith("character") ? "qc" : ["integer", "bigint", "numeric", "double precision"].includes(t) ? 0
      : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "date" ? "2031-01-01" : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
}
const SLUG = "qc-svc-b16-";
const USER_MAIL = "qc-svc-b16-";
async function cleanup(idsToDel: string[]) {
  if (!idsToDel.length) return;
  const tables = (await q<{ table_name: string }>(`SELECT DISTINCT c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`)).map((r) => r.table_name);
  let pending = tables;
  for (let pass = 0; pass < 8 && pending.length; pass++) {
    const failed: string[] = [];
    for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [idsToDel]); } catch { failed.push(t); } }
    pending = failed;
  }
  if (pending.length) console.log(`  ⚠️ ลบไม่ได้: ${pending.join(", ")}`);
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [idsToDel]); } catch (e) { console.log(`  ⚠️ ลบ Tenant: ${errMsg(e)}`); }
}
async function cleanupGlobal() {
  try {
    await pool.query(`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${USER_MAIL}%`]);
    await pool.query(`DELETE FROM "Membership" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${USER_MAIL}%`]);
    await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${USER_MAIL}%`]);
  } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}

// ═══════════════ ฉาก (ร้านชั่วคราว) ═══════════════
const RUN = Date.now().toString(36);
const T = (k: string) => `svcb16_${k}_${RUN}`;
const ids = {
  tA: T("tA"), tB: T("tB"), tD: T("tD"),
  uS: T("uS"), uS2: T("uS2"), uN: T("uN"), uB: T("uB"), uDspa: T("uDspa"), uDbar: T("uDbar"),
  mA: T("mA"), mB: T("mB"), mD: T("mD"), hrA: T("hrA"), empT1: T("empT1"),
};
type Viewer = { userId: string; member: { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown> } };
const V = (key: string, role: Viewer["member"]["role"], unitAccess: string[], perms: string[] = []): Viewer => ({
  userId: T(`u_${key}`), member: { role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])) },
});
const NOTES = SC.permissionKey;
const VW = {
  owner: V("owner", "OWNER", ["*"]),
  manager: V("mgr", "MANAGER", [ids.uS]),
  mgr2: V("mgr2", "MANAGER", [ids.uS2]),
  thera1: V("thera1", "STAFF", [ids.uS], [NOTES, "booking.job.run"]),
  thera2: V("thera2", "STAFF", [ids.uS], [NOTES, "booking.job.run"]),
  wild: V("wild", "STAFF", [ids.uS], ["booking.*"]),
  prov: V("prov", "STAFF", [ids.uS], ["booking.job.run", "booking.appointment.setStatus"]),
  theraX: V("theraX", "STAFF", [ids.uS2], [NOTES, "booking.job.run"]),
  ownerB: V("ownerB", "OWNER", ["*"]),
  ownerD: V("ownerD", "OWNER", ["*"]),
  mgrD: V("mgrD", "MANAGER", [ids.uDspa]),
};
const cA = { tenantId: ids.tA, unitId: ids.uS };
const sec: Record<string, string> = {};   // key → MemberSection.id (ร้าน A)
const fld: Record<string, string> = {};   // key → MemberField.id (ร้าน A)
const cust: Record<string, string> = {};  // c1 c2 c3 merged closed other(ร้าน B) d1(ร้าน D) b1(ร้าน B)
const ap: Record<string, string> = {};    // appointment ids
const PII: string[] = [];                 // ชื่อ เบอร์ อีเมล รหัสสมาชิก id ลูกค้า — ต้องไม่อยู่ใน DTO/console/payload
const VALUE_SECRETS: string[] = [];       // ค่าฟิลด์ (โดยเฉพาะอ่อนไหว) — ต้องไม่อยู่ใน console/payload
let setupOk = false;
let setupErr = "";

/** บรรทัด console ทั้งหมดระหว่างเรียกตัวโหลด (X8: log ห้ามมี PII/ค่าฟิลด์) */
const captured: string[] = [];
async function quiet<R>(fn: () => Promise<R>): Promise<R> {
  const keep = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  const grab = (...a: unknown[]) => { captured.push(a.map((x) => (typeof x === "string" ? x : fmt(x))).join(" ")); };
  console.log = grab; console.info = grab; console.warn = grab; console.error = grab; console.debug = grab;
  try { return await fn(); } finally { Object.assign(console, keep); }
}
const call = (ctx: Any, viewer: Any, idsIn: Any, opts?: Any) => quiet(() => LOAD(ctx, viewer, idsIn, opts));
const leakIn = (s: string, list: string[]) => list.filter((x) => x && s.includes(x));

/** ลายนิ้วมือของร้าน svcqc (Q-1 · ใบนี้ห้ามแตะร้านจริงของฉาก) */
async function svcqcPrint(): Promise<string> {
  const r = await q<{ a: string; b: string; c: string; d: string }>(
    `SELECT (SELECT count(*)::text || ':' || coalesce(max("updatedAt")::text, '') FROM "SettingValue" WHERE "tenantId" = $1) AS a,
            (SELECT count(*)::text FROM "SettingProfile" WHERE "tenantId" = $1) AS b,
            (SELECT count(*)::text FROM "MemberAccessLog" WHERE "tenantId" = $1) AS c,
            (SELECT count(*)::text FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'member.sensitive.viewed') AS d`,
    [SQC_TENANT.id],
  );
  return fmt(r[0]);
}
let printBefore = "";

console.log(`\n(${LABEL} · งาน: ${hasWork ? "มี loadJobCustomerNotes" : "ยังไม่มี «customer-notes.ts»"})`);

try {
  printBefore = await svcqcPrint();
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length} ร้าน)`); await cleanup(stale); }
  await cleanupGlobal();

  // ── สร้างฉาก ──
  try {
    const now = new Date();
    for (const [id, n] of [[ids.tA, "a"], [ids.tB, "b"], [ids.tD, "d"]] as const) await insertRow("Tenant", { id, name: `QC B16 ร้าน ${n}`, slug: `${SLUG}${n}-${RUN}`, updatedAt: now });
    const units: [string, string, string][] = [[ids.uS, ids.tA, "spa"], [ids.uS2, ids.tA, "spa2"], [ids.uN, ids.tA, "nomember"], [ids.uB, ids.tB, "b"], [ids.uDspa, ids.tD, "dspa"], [ids.uDbar, ids.tD, "dbar"]];
    for (const [id, t, s] of units) await insertRow("BusinessUnit", { id, tenantId: t, type: "BOOKING", name: `QC B16 ${s}`, slug: `${s}-${RUN}`, updatedAt: now });
    for (const [id, t, type] of [[ids.mA, ids.tA, "MEMBER"], [ids.mB, ids.tB, "MEMBER"], [ids.mD, ids.tD, "MEMBER"], [ids.hrA, ids.tA, "HR"]] as const)
      await insertRow("AppSystem", { id, tenantId: t, type, name: `QC B16 ${type} ${t.slice(-4)}`, updatedAt: now });
    for (const [u, t, s] of [[ids.uS, ids.tA, ids.mA], [ids.uS2, ids.tA, ids.mA], [ids.uB, ids.tB, ids.mB], [ids.uDspa, ids.tD, ids.mD], [ids.uDbar, ids.tD, ids.mD]] as const)
      await insertRow("AppSystemUnit", { id: rid("asu"), tenantId: t, systemId: s, unitId: u, type: "MEMBER" });
    // แม่แบบค่าตั้ง (SettingProfile) — A/B = SPA · D = SPA + BARBER (ค่าเริ่ม jobCardFields ตามแม่แบบ)
    for (const [u, t, k, by] of [[ids.uS, ids.tA, "SPA", VW.owner.userId], [ids.uS2, ids.tA, "SPA", VW.owner.userId], [ids.uB, ids.tB, "SPA", VW.ownerB.userId], [ids.uDspa, ids.tD, "SPA", VW.ownerD.userId], [ids.uDbar, ids.tD, "BARBER", VW.ownerD.userId]] as const)
      await insertRow("SettingProfile", { id: rid("sp"), tenantId: t, unitId: u, domain: "booking", templateKey: k, templateVersion: 1, appliedById: by });
    // ค่าตั้งระดับร้านของ A (TENANT) — เขียนแถวตรง (ไม่ผ่านเครื่องยนต์ เพราะคีย์เป็นของใบนี้ — ก่อนทำยังไม่มี def)
    await insertRow("SettingValue", { id: rid("sv"), tenantId: ids.tA, key: SC.settingKey, scope: "TENANT", scopeId: ids.tA, value: JSON.stringify(SC.tenantSetting), updatedAt: now });

    // ผู้ใช้ + สมาชิกภาพ
    const ten: Record<string, string> = { ownerB: ids.tB, ownerD: ids.tD, mgrD: ids.tD };
    for (const [k, v] of Object.entries(VW)) {
      await insertRow("User", { id: v.userId, email: `${USER_MAIL}${k}-${RUN}@qc.invalid`, name: `QC b16 ${k}`, updatedAt: now });
      await insertRow("Membership", { id: rid("mb"), userId: v.userId, tenantId: ten[k] ?? ids.tA, role: v.member.role, unitAccess: JSON.stringify(v.member.unitAccess), permissions: JSON.stringify(v.member.permissions), acceptedAt: now, updatedAt: now });
    }
    // หมอ 1 ผูกพนักงาน HR ตำแหน่ง "หมอนวด" (นโยบายส่วน health ให้ตำแหน่งนี้ดูได้ · D17)
    await insertRow("HrEmployee", { id: ids.empT1, tenantId: ids.tA, systemId: ids.hrA, name: "หมอนวดทดสอบ B16", position: SC.hrPosition, linkedUserId: VW.thera1.userId, updatedAt: now });

    // ส่วน/ฟิลด์สมาชิก ร้าน A (engine เดิม — แถวตามสคีมา MemberSection/MemberField)
    for (const [i, s] of SC.sections.entries()) {
      sec[s.key] = T(`sec_${s.key}`);
      await insertRow("MemberSection", { id: sec[s.key], tenantId: ids.tA, systemId: ids.mA, key: s.key, label: s.label, sensitive: s.sensitive, isSystem: "isSystem" in s ? !!s.isSystem : false, sortOrder: i, updatedAt: now });
    }
    for (const [i, f] of SC.fields.entries()) {
      fld[f.key] = T(`f_${f.key}`);
      await insertRow("MemberField", {
        id: fld[f.key], tenantId: ids.tA, systemId: ids.mA, sectionId: sec[f.section], key: f.key, label: f.label, type: f.type,
        options: JSON.stringify(f.options ?? {}), sensitive: !!f.sensitive, isSystem: !!f.isSystem, systemKey: f.isSystem ? f.key : null,
        archivedAt: f.archived ? now : null, sortOrder: i, updatedAt: now,
      });
    }
    for (const p of SC.policies) {
      const [tt, k] = p.target.split(":");
      await insertRow("MemberSensitivePolicy", { id: rid("pol"), tenantId: ids.tA, systemId: ids.mA, targetType: tt, targetId: sec[k], roles: p.roles, hrPositions: p.hrPositions, hrDepartments: [], sameUnitOnly: false, logAccess: p.logAccess, updatedAt: now });
    }
    // ลูกค้า
    const mkCust = async (k: string, tenantId: string, systemId: string, c: { name: string; phone: string; email: string; memberCode: string }, status = "ACTIVE") => {
      cust[k] = T(`c_${k}`);
      PII.push(c.name, c.phone, c.email, c.memberCode, cust[k], `${c.phone.slice(0, 3)}-${c.phone.slice(3, 6)}-${c.phone.slice(6)}`);
      await insertRow("Customer", { id: cust[k], tenantId, memberSystemId: systemId, name: c.name, firstName: c.name.split(" ")[0], phone: c.phone, email: c.email, memberCode: c.memberCode, status, updatedAt: now });
    };
    await mkCust("c1", ids.tA, ids.mA, SC.customers.c1);
    await mkCust("c2", ids.tA, ids.mA, SC.customers.c2);
    await mkCust("c3", ids.tA, ids.mA, SC.customers.c3);
    await mkCust("merged", ids.tA, ids.mA, SC.customers.merged, "MERGED");
    await mkCust("closed", ids.tA, ids.mA, SC.customers.closed, "CLOSED");
    await mkCust("other", ids.tB, ids.mB, SC.customers.other);
    await mkCust("b1", ids.tB, ids.mB, { name: "คุณบีหนึ่ง ทดสอบ", phone: "0861160007", email: "b1.b16@qc.invalid", memberCode: "B16-0007" });
    await mkCust("d1", ids.tD, ids.mD, { name: "คุณดีหนึ่ง ทดสอบ", phone: "0861160008", email: "d1.b16@qc.invalid", memberCode: "B16-0008" });
    // ค่าฟิลด์ (คอลัมน์แยกชนิด)
    const typeOf = (k: string) => SC.fields.find((f) => f.key === k)!.type;
    const putVal = async (tenantId: string, customerId: string, fieldId: string, type: string, v: unknown) => {
      const cell: Record<string, unknown> =
        type === "TEXT" || type === "LONG_TEXT" ? { valueText: v }
        : type === "SELECT" ? { valueOptions: [v] } // engine อ่าน SELECT จาก valueOptions[0] (fields.ts readCell)
        : type === "MULTI_SELECT" ? { valueOptions: v }
        : type === "BOOLEAN" ? { valueBool: v }
        : type === "NUMBER" ? { valueNumber: v }
        : type === "DATE" ? { valueDate: new Date(`${String(v)}T00:00:00+07:00`) }
        : type === "FILE" ? { valueFileId: v }
        : { valueRef: v };
      await insertRow("MemberFieldValue", { id: rid("fv"), tenantId, customerId, fieldId, ...cell, updatedAt: now });
    };
    for (const [k, v] of Object.entries(SC.c1Values)) {
      if (SC.fields.find((f) => f.key === k)?.isSystem) continue; // ฟิลด์ระบบ (phone) อ่านจากคอลัมน์ Customer
      await putVal(ids.tA, cust.c1, fld[k], typeOf(k), v);
      if ((typeOf(k) === "TEXT" || typeOf(k) === "LONG_TEXT") && typeof v === "string") VALUE_SECRETS.push(v.slice(0, 40));
    }
    await putVal(ids.tA, cust.c1, fld.stylistId, "LOOKUP", ids.empT1); // LOOKUP ไม่อยู่ใน c1Values (ต้องเป็น id พนักงานจริงของฉาก)
    for (const [k, v] of Object.entries(SC.c2Values)) { await putVal(ids.tA, cust.c2, fld[k], typeOf(k), v); VALUE_SECRETS.push(String(v)); }
    for (const k of ["merged", "closed"]) for (const [f, v] of [["musicPref", "เพลงของคนที่ปิดบัญชี"], ["pressurePref", "FIRM"]] as const) await putVal(ids.tA, cust[k], fld[f], typeOf(f), v);
    VALUE_SECRETS.push("ตะไคร้", "ยูคาลิปตัส", "เพลงของคนที่ปิดบัญชี");

    // ร้าน B: ระบบสมาชิกของตัวเอง ฟิลด์ pressurePref (ส่วนไม่อ่อนไหว) — ใช้พิสูจน์ว่าด่านข้ามร้านไม่ได้ว่างเพราะร้าน B ไม่มีข้อมูล
    for (const [t, s, sk, pk, ck, val] of [[ids.tB, ids.mB, "secB", "fB", "b1", "LIGHT"], [ids.tB, ids.mB, "secB", "fB", "other", "FIRM"]] as const) {
      if (!sec[sk]) { sec[sk] = T(sk); await insertRow("MemberSection", { id: sec[sk], tenantId: t, systemId: s, key: "prefs", label: "ความชอบ", sensitive: false, updatedAt: now }); }
      if (!fld[pk]) { fld[pk] = T(pk); await insertRow("MemberField", { id: fld[pk], tenantId: t, systemId: s, sectionId: sec[sk], key: "pressurePref", label: "แรงกดที่ชอบ", type: "SELECT", options: JSON.stringify(SC.fields[1].options), sensitive: false, updatedAt: now }); }
      await putVal(t, cust[ck], fld[pk], "SELECT", val);
    }
    // ร้าน D: เทมเพลต salon (ส่วน health อ่อนไหว · ไม่มีแถวนโยบาย = OWNER/MANAGER) + musicPref
    sec.dH = T("secDH"); sec.dP = T("secDP");
    await insertRow("MemberSection", { id: sec.dH, tenantId: ids.tD, systemId: ids.mD, key: "health", label: "สุขภาพ", sensitive: true, updatedAt: now });
    await insertRow("MemberSection", { id: sec.dP, tenantId: ids.tD, systemId: ids.mD, key: "prefs", label: "ความชอบ", sensitive: false, updatedAt: now });
    for (const [k, s, type, opt] of [["pressurePref", sec.dH, "SELECT", SC.fields[1].options], ["chemicalAllergy", sec.dH, "LONG_TEXT", {}], ["musicPref", sec.dP, "TEXT", {}]] as const) {
      fld[`d_${k}`] = T(`fd_${k}`);
      await insertRow("MemberField", { id: fld[`d_${k}`], tenantId: ids.tD, systemId: ids.mD, sectionId: s, key: k, label: SC.fields.find((f) => f.key === k)!.label, type, options: JSON.stringify(opt ?? {}), sensitive: k === "chemicalAllergy", updatedAt: now });
    }
    await putVal(ids.tD, cust.d1, fld.d_pressurePref, "SELECT", "FIRM");
    await putVal(ids.tD, cust.d1, fld.d_chemicalAllergy, "LONG_TEXT", "แพ้ลาเวนเดอร์");
    await putVal(ids.tD, cust.d1, fld.d_musicPref, "TEXT", "แจ๊ส");
    VALUE_SECRETS.push("แพ้ลาเวนเดอร์");

    // ผู้ให้บริการ + บริการ + นัด (วันนี้ 15:00 ไทย)
    const staffOf: Record<string, string> = {};
    const svcOf: Record<string, string> = {};
    for (const [i, [u, t]] of units.entries()) {
      staffOf[u] = T(`st${i}`); svcOf[u] = T(`sv${i}`);
      await insertRow("BookingStaff", { id: staffOf[u], tenantId: t, unitId: u, name: "หมอนวดทดสอบ", updatedAt: now });
      await insertRow("BookingService", { id: svcOf[u], tenantId: t, unitId: u, name: "นวดน้ำมันอโรมา 90", durationMin: 90, updatedAt: now });
    }
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    const start = new Date(`${today}T15:00:00+07:00`);
    const end = new Date(start.getTime() + 90 * 60_000);
    const mkAp = async (k: string, tenantId: string, unitId: string, customerKey: string | null, name: string, phone: string) => {
      ap[k] = T(`ap_${k}`);
      await insertRow("Appointment", { id: ap[k], tenantId, unitId, staffId: staffOf[unitId], serviceId: svcOf[unitId], startAt: start, endAt: end, customerName: name, customerPhone: phone, customerId: customerKey ? cust[customerKey] : null, status: "CONFIRMED", updatedAt: now });
    };
    await mkAp("a1", ids.tA, ids.uS, "c1", SC.customers.c1.name, SC.customers.c1.phone);
    await mkAp("a2", ids.tA, ids.uS, "c2", SC.customers.c2.name, SC.customers.c2.phone);
    await mkAp("a3", ids.tA, ids.uS, "c3", SC.customers.c3.name, SC.customers.c3.phone);
    await mkAp("aW", ids.tA, ids.uS, null, "ลูกค้าไม่เป็นสมาชิก", "0861169999");
    await mkAp("aM", ids.tA, ids.uS, "merged", SC.customers.merged.name, SC.customers.merged.phone);
    await mkAp("aC", ids.tA, ids.uS, "closed", SC.customers.closed.name, SC.customers.closed.phone);
    await mkAp("aU2", ids.tA, ids.uS2, "c1", SC.customers.c1.name, SC.customers.c1.phone);
    await mkAp("aX", ids.tA, ids.uS, "other", SC.customers.other.name, SC.customers.other.phone); // นัดร้าน A ชี้ลูกค้าระบบสมาชิกร้าน B
    await mkAp("aN", ids.tA, ids.uN, "c1", SC.customers.c1.name, SC.customers.c1.phone);           // สาขาที่ไม่ผูกระบบสมาชิก
    await mkAp("aB", ids.tB, ids.uB, "b1", "คุณบีหนึ่ง ทดสอบ", "0861160007");
    await mkAp("dS", ids.tD, ids.uDspa, "d1", "คุณดีหนึ่ง ทดสอบ", "0861160008");
    await mkAp("dB", ids.tD, ids.uDbar, "d1", "คุณดีหนึ่ง ทดสอบ", "0861160008");
    PII.push("ลูกค้าไม่เป็นสมาชิก", "0861169999");
    // บันทึกการดูของเมื่อวาน (หน้า booking.mine) — ต้องไม่กันแถวของวันนี้
    await insertRow("MemberAccessLog", { id: T("log_yday"), tenantId: ids.tA, customerId: cust.c1, userId: VW.owner.userId, targetType: "SECTION", targetId: sec.health, page: "booking.mine", createdAt: new Date(Date.now() - 26 * 3_600_000), updatedAt: now });
    setupOk = true;
  } catch (e) {
    setupErr = errMsg(e);
    console.log(`  ⚠️ สร้างฉากไม่ได้: ${setupErr}`);
  }
  const needSetup = () => ok(setupOk, `ฉากไม่พร้อม: ${setupErr}`);
  const mctx = (tenantId: string, systemId: string) => ({ tenantId, systemId, actorUserId: null });
  const mActor = (v: Viewer) => ({ userId: v.userId, role: v.member.role, unitAccess: v.member.unitAccess, permissions: v.member.permissions });

  // ═══════════════ PC. positive control ═══════════════
  console.log("\n── PC: positive control (เขียวก่อนทำ) ──");
  await st("PC-1", "engine ฟิลด์สมาชิกเดิมอ่านฉากได้: c1 pressurePref=MEDIUM · oilAllergy 2 ค่า · coldRoom=true · massageCount=7 · เลย์เอาต์มีส่วน health อ่อนไหว + oldNote เก็บแล้ว", async () => {
    needSetup();
    const f = memberLoad.mod?.fields;
    ok(f && typeof f.getFieldValues === "function" && typeof f.listLayout === "function", `member.fields ไม่พร้อม: ${memberLoad.err}`);
    const v = (await f.getFieldValues(mctx(ids.tA, ids.mA), [cust.c1]))[cust.c1] ?? {};
    eq([v.pressurePref, sorted((v.oilAllergy ?? []) as string[]), v.coldRoom, Number(v.massageCount), v.pregnant], ["MEDIUM", ["EUCALYPTUS", "LEMONGRASS"], true, 7, false], "ค่า c1");
    ok(!("oldNote" in v), "ฟิลด์ที่เก็บแล้วไม่ควรมีค่า (engine กรอง archivedAt)");
    const lay = await f.listLayout(mctx(ids.tA, ids.mA));
    const h = (lay.sections as Any[]).find((s) => s.key === "health");
    ok(h?.sensitive === true && (h.fields as Any[]).some((x) => x.key === "pressurePref"), "ส่วน health");
  });
  await st("PC-2", "นโยบายอ่อนไหวเดิม (canViewSensitive) ตัดสินตามฉาก: OWNER/MANAGER health ✓ · หมอ1 (ตำแหน่งหมอนวด) health ✓ oilAllergy ✗ · หมอ2 health ✗ intake ✓", async () => {
    needSetup();
    const cv = memberLoad.mod?.canViewSensitive;
    ok(typeof cv === "function", `member.canViewSensitive: ${memberLoad.err}`);
    const tgt = (tt: string, id: string) => ({ targetType: tt, targetId: id, customerId: cust.c1 });
    const m = mctx(ids.tA, ids.mA);
    const got = [
      await cv(m, mActor(VW.owner), tgt("SECTION", sec.health)), await cv(m, mActor(VW.manager), tgt("SECTION", sec.health)), await cv(m, mActor(VW.manager), tgt("FIELD", fld.oilAllergy)),
      await cv(m, mActor(VW.thera1), tgt("SECTION", sec.health)), await cv(m, mActor(VW.thera1), tgt("FIELD", fld.oilAllergy)),
      await cv(m, mActor(VW.thera2), tgt("SECTION", sec.health)), await cv(m, mActor(VW.thera2), tgt("SECTION", sec.intake)),
    ];
    eq(got, [true, true, true, true, false, false, true], "[owner.h mgr.h mgr.oil t1.h t1.oil t2.h t2.intake]");
  });

  // ═══════════════ D. ค่าตั้ง ═══════════════
  console.log("\n── D: ค่าตั้ง booking.privacy.jobCardFields ──");
  const S = settingsLoad.mod;
  await st("D-1", `def ${SC.settingKey}: domain booking · group privacy · type table · chain [TENANT] · ป้าย/คำอธิบายไทย · sensitivity PRIVACY · ownerOnly · ค่าเริ่ม BARBER [] · SPA [pressurePref, chemicalAllergy] · CLINIC [] · _fallback []`, () => {
    ok(typeof S?.getDef === "function", `core/settings: ${settingsLoad.err}`);
    const d = S.getDef(SC.settingKey);
    ok(d, `ไม่มี def ${SC.settingKey}`);
    eq([d.domain, d.group, d.type, [...d.chain], d.sensitivity, d.ownerOnly], ["booking", "privacy", "table", ["TENANT"], "PRIVACY", true], "คุณสมบัติ");
    ok(isThai(d.labelTh) && String(d.labelTh).includes("การ์ดงาน"), `labelTh: ${d.labelTh}`);
    ok(isThai(d.helpTh), `helpTh: ${d.helpTh}`);
    eq([d.defaults.BARBER, d.defaults.SPA, d.defaults.CLINIC, d.defaults._fallback], [SC.templateDefaults.BARBER, SC.templateDefaults.SPA, SC.templateDefaults.CLINIC, []], "ค่าเริ่ม");
  });
  await st("D-2", "schema: รับรายการรหัสฟิลด์ (camelCase) 0–20 ตัวไม่ซ้ำ · ปฏิเสธ ไม่ใช่อาร์เรย์ · ซ้ำ · เกิน 20 · รหัสมีช่องว่าง/ไทย/ขึ้นต้นตัวใหญ่ · null", () => {
    const d = S?.getDef?.(SC.settingKey);
    ok(d?.schema?.safeParse, `ไม่มี def ${SC.settingKey}`);
    const pass = (v: unknown) => d.schema.safeParse(v).success === true;
    const bad: string[] = [];
    for (const v of [[], ["pressurePref"], SC.tenantSetting, Array.from({ length: 20 }, (_, i) => `f${i}`)]) if (!pass(v)) bad.push(`ควรรับ ${fmt(v)}`);
    for (const v of ["pressurePref", null, { a: 1 }, ["a", "a"], Array.from({ length: 21 }, (_, i) => `f${i}`), ["แรงนวด"], ["a b"], ["Pressure"], [""], [1]]) if (pass(v)) bad.push(`ควรปฏิเสธ ${fmt(v)}`);
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("D-3", "ตัวอ่านค่าตั้ง: ร้าน D สาขา SPA = [pressurePref, chemicalAllergy] (แม่แบบ) · สาขา BARBER = [] · ร้าน A = ค่าระดับร้าน (TENANT) 14 ตัวตามลำดับ", async () => {
    needSetup();
    ok(typeof S?.resolveSetting === "function", "ไม่มี resolveSetting");
    ok(S.getDef(SC.settingKey), `ไม่มี def ${SC.settingKey}`);
    const r = async (t: string, u: string) => (await S.resolveSetting({ tenantId: t }, SC.settingKey, { unitId: u }))?.value;
    eq([await r(ids.tD, ids.uDspa), await r(ids.tD, ids.uDbar), await r(ids.tA, ids.uS)], [SC.templateDefaults.SPA, [], SC.tenantSetting], "ค่า");
  });
  const pageModel = async (v: Viewer) => fnOf(bookingLoad, "loadBookingSettingsPage", "@/lib/modules/booking")({ ...v.member, userId: v.userId }, { tenantId: ids.tD }, { unitId: ids.uDspa, page: "messages" });
  await st("PC-3", "กล่องความเป็นส่วนตัวหน้า 14 (B.11) ของเดิม: เจ้าของเห็นแถว booking.privacy.walkInRetentionDays ใน [data-bk-privacy]", async () => {
    needSetup();
    const h = render(MsgSettingsC, { model: await pageModel(VW.ownerD), actions: { save: async () => ({ ok: true }), reset: async () => ({ ok: true }), applyTemplate: async () => ({ ok: true }), setStaffService: async () => ({ ok: true }), setServiceBooking: async () => ({ ok: true }), applyRolePreset: async () => ({ ok: true }) } });
    one(one(h, "data-bk-privacy").html, "data-setting-key", "booking.privacy.walkInRetentionDays");
  }, "MAJOR");
  await st("D-4", "หน้า 14 (ทะเบียนสร้างหน้า · ไม่วาดเอง): เจ้าของเห็นแถว jobCardFields ใน [data-bk-privacy] แก้ได้ + ป้ายไทย · ผู้จัดการเห็นแบบล็อก (เจ้าของเท่านั้น)", async () => {
    needSetup();
    const acts = { save: async () => ({ ok: true }), reset: async () => ({ ok: true }), applyTemplate: async () => ({ ok: true }), setStaffService: async () => ({ ok: true }), setServiceBooking: async () => ({ ok: true }), applyRolePreset: async () => ({ ok: true }) };
    const ro = one(one(render(MsgSettingsC, { model: await pageModel(VW.ownerD), actions: acts }), "data-bk-privacy").html, "data-setting-key", SC.settingKey);
    ok(ro.attrs["data-locked"] !== "true" && isThai(textOf(ro.html)) && textOf(ro.html).includes("การ์ดงาน"), `เจ้าของ: ${textOf(ro.html).slice(0, 120)}`);
    const rm = one(one(render(MsgSettingsC, { model: await pageModel(VW.mgrD), actions: acts }), "data-bk-privacy").html, "data-setting-key", SC.settingKey);
    ok(rm.attrs["data-locked"] === "true", `ผู้จัดการต้องล็อก: ${fmt(rm.attrs)}`);
  }, "MAJOR");

  // ═══════════════ P. สิทธิ์ (pure) ═══════════════
  console.log("\n── P: สิทธิ์ ──");
  const pm = permLoad.mod;
  await st("P-1", `คีย์ ${NOTES} ลงทะเบียน (isPermissionKey) + ป้ายไทย (ไม่ใช่คีย์ดิบ) · ไม่ planned (มีโค้ดใช้)`, () => {
    ok(pm?.isPermissionKey?.(NOTES) === true, "ไม่ลงทะเบียน");
    const l = pm.permissionLabel(NOTES);
    ok(isThai(l) && l !== NOTES, `ป้าย ${l}`);
    ok((pm.PERMISSIONS as Any[] | undefined)?.find((x) => x.key === NOTES)?.planned !== true, "ยัง planned");
  });
  await st("P-2", "ตารางสิทธิ์ BOOKING_ROLE_ROWS มีแถว notes (ป้าย/คีย์ตามใบสั่ง · ต่อท้าย) · ชุด LEAD + PROVIDER ติ๊ก · CASHIER/ASSISTANT ไม่ติ๊ก · bookingPresetPermissions SPA PROVIDER ⇒ true · CASHIER ⇒ false", () => {
    const rows = pm?.BOOKING_ROLE_ROWS as Any[] | undefined;
    ok(Array.isArray(rows), "ไม่มี BOOKING_ROLE_ROWS");
    const r = rows!.find((x) => x.id === SC.roleRow.id);
    eq(r && { id: r.id, labelTh: r.labelTh, keys: [...r.keys] }, { ...SC.roleRow, keys: [...SC.roleRow.keys] }, "แถว notes");
    eq(rows![rows!.length - 1]?.id, SC.roleRow.id, "แถว notes ต่อท้ายตาราง (แถวเดิมไม่เลื่อน)");
    for (const tpl of ["BARBER", "SPA", "CLINIC"]) {
      const P = pm.BOOKING_ROLE_PRESETS?.[tpl] ?? {};
      for (const role of ["LEAD", "PROVIDER", "CASHIER", "ASSISTANT"]) {
        const has = ((P[role] ?? []) as string[]).includes(SC.roleRow.id);
        ok(has === (SC.presetRows as readonly string[]).includes(role), `${tpl}.${role} notes=${has}`);
      }
    }
    eq([pm.bookingPresetPermissions("SPA", "PROVIDER")?.[NOTES], pm.bookingPresetPermissions("SPA", "CASHIER")?.[NOTES], pm.bookingPresetPermissions("BARBER", "LEAD")?.[NOTES]], [true, false, true], "bookingPresetPermissions");
  });
  await st("P-3", "canSeeCustomerNotes (privacy-shared.ts pure): OWNER ✓ · MANAGER สาขานี้ ✓ / สาขาอื่น ✗ · STAFF+คีย์ ✓ · booking.* ✓ · STAFF ไม่มีคีย์ ✗ · STAFF+คีย์ สาขาอื่น ✗ · null ✗", () => {
    const fn = fnOf(privLoad, "canSeeCustomerNotes", F.privShared);
    const U = "unit-x";
    const got = [
      fn({ role: "OWNER", unitAccess: ["*"], permissions: {} }, U), fn({ role: "MANAGER", unitAccess: [U], permissions: {} }, U), fn({ role: "MANAGER", unitAccess: ["other"], permissions: {} }, U),
      fn({ role: "STAFF", unitAccess: [U], permissions: { [NOTES]: true } }, U), fn({ role: "STAFF", unitAccess: [U], permissions: { "booking.*": true } }, U),
      fn({ role: "STAFF", unitAccess: [U], permissions: { "booking.job.run": true, "booking.customer.phoneFull": true } }, U), fn({ role: "STAFF", unitAccess: ["other"], permissions: { [NOTES]: true } }, U), fn(null, U),
    ];
    eq(got, [true, true, false, true, true, false, false, false], "ผล");
  });

  // ═══════════════ L. ตัวโหลด ═══════════════
  console.log("\n── L: loadJobCustomerNotes ──");
  const idsA = () => [ap.a1, ap.a2, ap.a3, ap.aW, ap.aM, ap.aC, ap.aU2, ap.aX, ap.aN, ap.aB];
  const keysOf = (e: Any) => ((e?.items ?? []) as Any[]).map((i) => i.key);
  const LG = async () => (await q<{ customerId: string; userId: string; targetType: string; targetId: string; page: string | null; hrPosition: string | null; hrEmployeeId: string | null }>(
    `SELECT "customerId", "userId", "targetType", "targetId", page, "hrPosition", "hrEmployeeId" FROM "MemberAccessLog" WHERE "tenantId" = $1 AND id <> $2 ORDER BY "createdAt", id`, [ids.tA, T("log_yday")]));
  const sens = new Set(["pressurePref", "chemicalAllergy", "oilAllergy", "pregnant"]);
  let ownerToday: Any = null;
  await st("L-1", "OWNER การ์ด c1: 8 รายการตามลำดับค่าตั้ง (ข้าม phone/LOOKUP/FILE/DATE/เก็บแล้ว/ไม่มีจริง) · ป้ายจากฟิลด์ · display ไทย (SELECT/MULTI ป้ายตัวเลือก · BOOLEAN ใช่/ไม่ใช่ · NUMBER) · sensitive ถูก · hidden 0", async () => {
    needSetup();
    ownerToday = await call(cA, VW.owner, idsA(), { page: "booking.today" });
    const e = ownerToday?.[ap.a1];
    ok(e, `ไม่มีรายการของนัด c1: ${fmt(ownerToday)}`);
    eq(keysOf(e), [...SC.expectC1.owner.shown], "ลำดับ/ชุดฟิลด์");
    eq(e.hidden, 0, "hidden");
    eq(e.appointmentId, ap.a1, "appointmentId");
    for (const it of e.items as Any[]) {
      eq(it.label, SC.fields.find((f) => f.key === it.key)!.label, `${it.key}.label`);
      eq(it.sensitive, sens.has(it.key), `${it.key}.sensitive`);
      if (SC.c1Display[it.key] !== undefined) eq(it.display, SC.c1Display[it.key], `${it.key}.display`);
    }
  });
  await st("L-2", `ข้อความยาว (longNote ${String(SC.c1Values.longNote).length} ตัว) ตัดที่ ${SC.textMax} + "…" · ช่องว่างยุบ · ขึ้นต้นตรงค่าเดิม`, () => {
    const it = ((ownerToday?.[ap.a1]?.items ?? []) as Any[]).find((x) => x.key === "longNote");
    ok(it, "ไม่มี longNote");
    const d = String(it.display);
    ok([...d].length <= SC.textMax + 1 && d.endsWith("…") && d.startsWith("ไหล่ซ้ายตึงมาก ไหล่ซ้าย") && !/\s{2,}/.test(d), `display: ${d.length} ${d.slice(0, 40)}…${d.slice(-5)}`);
  }, "MAJOR");
  const expectView = async (id: string, v: Viewer, exp: { shown: readonly string[]; hidden: number }) => {
    const r = await call(cA, v, idsA());
    const e = r?.[ap.a1];
    ok(e, `ไม่มีรายการ c1: ${fmt(r)}`);
    eq([keysOf(e), e.hidden], [[...exp.shown], exp.hidden], id);
    return r;
  };
  await st("L-3", "MANAGER สาขานี้: เห็นครบ 8 · hidden 0 (นโยบาย health ให้ MANAGER · oilAllergy ค่าปริยาย OWNER/MANAGER)", () => expectView("manager", VW.manager, SC.expectC1.manager));
  await st("L-4", "หมอ 1 (คีย์ notes + ตำแหน่ง HR หมอนวด): health ✓ · intake ✓ · oilAllergy ✗ ⇒ 7 รายการ · hidden 1", () => expectView("thera1", VW.thera1, SC.expectC1.thera1));
  await st("L-5", "หมอ 2 (คีย์ notes · ไม่ผูก HR): เห็นเฉพาะไม่อ่อนไหว + intake ⇒ 5 รายการ · hidden 3 · ค่าอ่อนไหวที่ซ่อนไม่อยู่ใน DTO", async () => {
    const r = await expectView("thera2", VW.thera2, SC.expectC1.thera2);
    const s = JSON.stringify(r);
    const leak = leakIn(s, [String(SC.c1Values.chemicalAllergy), "ตะไคร้", "ปานกลาง", "MEDIUM", "LEMONGRASS"]);
    ok(leak.length === 0, `ค่าอ่อนไหวหลุด: ${leak.join(", ")}`);
  });
  await st("L-6", "c2 (มีแค่ musicPref): OWNER [musicPref เพลงลูกทุ่ง] hidden 0 · หมอ 2 [musicPref] hidden 3 · c3 (ไม่มีค่า): OWNER ไม่มีรายการ · หมอ 2 {items: [], hidden: 3}", async () => {
    needSetup();
    const o = await call(cA, VW.owner, [ap.a2, ap.a3]);
    eq([((o?.[ap.a2]?.items ?? []) as Any[]).map((i) => [i.key, i.display]), o?.[ap.a2]?.hidden, ap.a3 in (o ?? {})], [[["musicPref", "เพลงลูกทุ่ง"]], 0, false], "OWNER");
    const t2 = await call(cA, VW.thera2, [ap.a2, ap.a3]);
    eq([keysOf(t2?.[ap.a2]), t2?.[ap.a2]?.hidden, t2?.[ap.a3]], [["musicPref"], 3, { appointmentId: ap.a3, items: [], hidden: 3 }], "หมอ 2");
  });
  await st("L-7", "ไม่มีสิทธิ์ ⇒ {} : ช่างมีแค่ job.run · หมอคีย์ notes แต่สาขาอื่น · MANAGER สาขาอื่น · viewer null — และไม่เขียนบันทึกการดูเลย", async () => {
    needSetup();
    const before = (await LG()).length;
    const got = [await call(cA, VW.prov, idsA()), await call(cA, VW.theraX, idsA()), await call(cA, VW.mgr2, idsA()), await call(cA, null, idsA())];
    eq(got, [{}, {}, {}, {}], "ผล");
    eq((await LG()).length, before, "บันทึกการดูเพิ่ม");
  });
  await st("L-8", "booking.* (wildcard) ⇒ เห็นเท่าหมอ 2 (คีย์จองไม่ใช่ใบผ่านข้อมูลอ่อนไหว — นโยบายสมาชิกตัดสิน)", () => expectView("wild", VW.wild, SC.expectC1.thera2));
  await st("L-9", "นัดที่ต้องไม่ขึ้น (OWNER): walk-in ไม่มีลูกค้า · ลูกค้า MERGED · CLOSED · นัดสาขาอื่น (ขอผ่าน ctx สาขานี้) · ลูกค้าระบบสมาชิกร้านอื่น · สาขาไม่ผูกระบบสมาชิก · นัดร้านอื่น ⇒ คืนเฉพาะ a1 a2", async () => {
    needSetup();
    eq(sorted(Object.keys(ownerToday ?? {})), sorted([ap.a1, ap.a2]), "คีย์ที่คืน");
  });
  await st("L-10", "ค่าเริ่มแม่แบบ (ร้าน D ไม่มีค่าระดับร้าน): สาขา SPA ⇒ [pressurePref แน่น, chemicalAllergy แพ้ลาเวนเดอร์] · สาขา BARBER ⇒ {}", async () => {
    needSetup();
    const s = await call({ tenantId: ids.tD, unitId: ids.uDspa }, VW.ownerD, [ap.dS]);
    eq(((s?.[ap.dS]?.items ?? []) as Any[]).map((i) => [i.key, i.display]), [["pressurePref", "แน่น"], ["chemicalAllergy", "แพ้ลาเวนเดอร์"]], "SPA");
    eq(await call({ tenantId: ids.tD, unitId: ids.uDbar }, VW.ownerD, [ap.dB]), {}, "BARBER");
  });
  await st("L-11", "ข้อมูลเข้าแปลก: [] ⇒ {} · ไม่ใช่อาร์เรย์ ⇒ {} · id ซ้ำ/ไม่ใช่สตริงปน ⇒ ได้รายการเดียวต่อ id · id ขยะ 1,000 ตัวต่อท้าย ⇒ ยังได้ a1 (ไม่ throw)", async () => {
    needSetup();
    eq([await call(cA, VW.owner, []), await call(cA, VW.owner, "x"), await call(cA, VW.owner, null)], [{}, {}, {}], "ว่าง");
    const mixed = await call(cA, VW.owner, [ap.a1, ap.a1, 42, null, { id: ap.a2 }, ap.a1]);
    eq(Object.keys(mixed ?? {}), [ap.a1], "ซ้ำ/ปน");
    const junk = await call(cA, VW.owner, [ap.a1, ...Array.from({ length: 1000 }, (_, i) => `junk-${i}`)]);
    ok(junk?.[ap.a1]?.items?.length === 8, `ขยะ 1,000: ${fmt(Object.keys(junk ?? {}))}`);
  }, "MAJOR");

  // ═══════════════ X. ขอบเขต · PDPA ═══════════════
  console.log("\n── X: แยกร้าน · PDPA (X1 · X8) ──");
  await st("X-1", "ข้ามร้าน (X1): ctx A ขอนัดร้าน B ≡ ขอ id ที่ไม่มีจริง ≡ {} (ทุกไบต์) · ctx {ร้าน A, สาขาร้าน B} ⇒ {} · ctx {ร้าน B, สาขาร้าน A} ⇒ {} · positive: เจ้าของ B ที่ร้าน B เห็นนัดตัวเอง", async () => {
    needSetup();
    const a = await call(cA, VW.owner, [ap.aB]);
    const b = await call(cA, VW.owner, ["svcb16-no-such-appointment"]);
    eq(JSON.stringify(a), JSON.stringify(b), "ร้านอื่น vs ไม่มีจริง");
    eq(a, {}, "ร้านอื่น");
    eq(await call({ tenantId: ids.tA, unitId: ids.uB }, VW.owner, [ap.aB, ap.a1]), {}, "ร้าน A + สาขาร้าน B");
    eq(await call({ tenantId: ids.tB, unitId: ids.uS }, VW.ownerB, [ap.a1, ap.aB]), {}, "ร้าน B + สาขาร้าน A");
    const pos = await call({ tenantId: ids.tB, unitId: ids.uB }, VW.ownerB, [ap.aB, ap.a1]);
    eq([Object.keys(pos ?? {}), ((pos?.[ap.aB]?.items ?? []) as Any[]).map((i) => [i.key, i.display])], [[ap.aB], [["pressurePref", "เบา"]]], "positive ร้าน B");
  });
  await st("X-2", "สาขาไม่ผูกระบบสมาชิก ⇒ {} (นัดชี้ลูกค้าระบบสมาชิกร้าน A ก็ไม่ขึ้น) · นัดร้าน A ที่ชี้ลูกค้าระบบสมาชิกร้าน B ⇒ ไม่ขึ้น", async () => {
    needSetup();
    eq(await call({ tenantId: ids.tA, unitId: ids.uN }, VW.owner, [ap.aN]), {}, "สาขาไม่ผูก");
    eq(ap.aX in ((await call(cA, VW.owner, [ap.aX])) ?? {}), false, "ลูกค้าระบบอื่น");
  });
  await st("X-3", "X8 DTO: ทุกผลลัพธ์มีแค่ {appointmentId, items[{key,label,display,sensitive}], hidden} · ไม่มีชื่อ/เบอร์ (เต็มหรือขีด)/อีเมล/รหัสสมาชิก/id ลูกค้า แม้ผู้ดูเป็นเจ้าของ", async () => {
    needSetup();
    const all = [ownerToday, await call(cA, VW.thera1, idsA()), await call(cA, VW.thera2, idsA()), await call({ tenantId: ids.tD, unitId: ids.uDspa }, VW.ownerD, [ap.dS])];
    const bad: string[] = [];
    for (const r of all) for (const [k, e] of Object.entries((r ?? {}) as Record<string, Any>)) {
      if (!isDeepStrictEqual(sorted(Object.keys(e)), ["appointmentId", "hidden", "items"])) bad.push(`${k} คีย์ ${Object.keys(e).join(",")}`);
      for (const it of (e.items ?? []) as Any[]) if (!isDeepStrictEqual(sorted(Object.keys(it)), ["display", "key", "label", "sensitive"])) bad.push(`${k}.${it.key} คีย์ ${Object.keys(it).join(",")}`);
    }
    const leak = leakIn(JSON.stringify(all), PII);
    ok(bad.length === 0 && leak.length === 0, [...bad.slice(0, 4), leak.length ? `PII: ${leak.slice(0, 4).join(", ")}` : ""].filter(Boolean).join(" · "));
  });
  await st("X-4", "X8 บันทึกการดู (D17 · ตามนโยบายสมาชิก): OWNER วันนี้หน้า booking.today ⇒ c1 = SECTION health + FIELD oilAllergy (intake logAccess=false ไม่บันทึก) · เรียกซ้ำ ⇒ ไม่เพิ่ม · หน้า booking.mine ⇒ +2 (แถวเมื่อวานไม่กัน) · หมอ 1 ⇒ SECTION health 1 แถว + ตำแหน่ง/พนักงาน HR ณ ตอนดู · หมอ 2 ⇒ 0 · c2/c3 ⇒ 0", async () => {
    needSetup();
    ok(hasWork, "ยังไม่มีตัวโหลด");
    await pool.query(`DELETE FROM "MemberAccessLog" WHERE "tenantId" = $1 AND id <> $2`, [ids.tA, T("log_yday")]);
    const sig = (r: { userId: string; customerId: string; targetType: string; targetId: string; page: string | null }) => `${r.userId === VW.owner.userId ? "owner" : r.userId === VW.thera1.userId ? "t1" : r.userId}|${r.customerId === cust.c1 ? "c1" : r.customerId}|${r.targetType}|${r.targetId === sec.health ? "health" : r.targetId === fld.oilAllergy ? "oil" : r.targetId}|${r.page}`;
    await call(cA, VW.owner, idsA(), { page: "booking.today" });
    eq(sorted((await LG()).map(sig)), sorted(["owner|c1|SECTION|health|booking.today", "owner|c1|FIELD|oil|booking.today"]), "OWNER วันนี้");
    await call(cA, VW.owner, idsA(), { page: "booking.today" });
    eq((await LG()).length, 2, "เรียกซ้ำวันเดียวกัน");
    await call(cA, VW.owner, idsA(), { page: "booking.mine" });
    eq(sorted((await LG()).map(sig)), sorted(["owner|c1|SECTION|health|booking.today", "owner|c1|FIELD|oil|booking.today", "owner|c1|SECTION|health|booking.mine", "owner|c1|FIELD|oil|booking.mine"]), "หน้า mine");
    await call(cA, VW.thera1, idsA(), { page: "booking.mine" });
    const t1 = (await LG()).filter((r) => r.userId === VW.thera1.userId);
    eq(t1.map((r) => [sig(r), r.hrPosition, r.hrEmployeeId]), [["t1|c1|SECTION|health|booking.mine", SC.hrPosition, ids.empT1]], "หมอ 1");
    await call(cA, VW.thera2, idsA(), { page: "booking.mine" });
    eq((await LG()).filter((r) => r.userId === VW.thera2.userId).length, 0, "หมอ 2");
    eq((await LG()).filter((r) => r.customerId !== cust.c1).length, 0, "ลูกค้าอื่น");
  });
  await st("X-5", "X8 event: member.sensitive.viewed ของร้าน A ถูกยิง (ทางเดิมของสมาชิก) · payload ไม่มี PII/ค่าฟิลด์ · ไม่มี event booking.* หรือชนิดอื่นจากการเปิดดู", async () => {
    needSetup();
    const rows = await q<{ type: string; payload: unknown }>(`SELECT type, payload FROM "OutboxEvent" WHERE "tenantId" = $1`, [ids.tA]);
    ok(rows.some((r) => r.type === "member.sensitive.viewed"), "ไม่มี member.sensitive.viewed");
    const other = [...new Set(rows.map((r) => r.type).filter((t) => t !== "member.sensitive.viewed"))];
    eq(other, [], "event ชนิดอื่น");
    const leak = leakIn(JSON.stringify(rows.map((r) => r.payload)), [...PII.filter((p) => !p.startsWith("svcb16_c_")), ...VALUE_SECRETS]);
    ok(leak.length === 0, `payload มี: ${leak.slice(0, 4).join(", ")}`);
  });
  await st("X-6", "X8 console: ระหว่างเรียกตัวโหลดทั้งหมด ไม่มีบรรทัด log ที่มีชื่อ/เบอร์/อีเมล/ค่าฟิลด์", () => {
    ok(hasWork, "ยังไม่มีตัวโหลด");
    const leak = leakIn(captured.join("\n"), [...PII, ...VALUE_SECRETS]);
    ok(leak.length === 0, `log มี: ${leak.slice(0, 4).join(", ")} (${captured.length} บรรทัด)`);
  });
  await st("X-7", "อ่านอย่างเดียว: Customer · MemberFieldValue · Appointment ของร้าน A ไม่ถูกแก้ (updatedAt/จำนวนเท่าเดิม) · ไม่มี AuditLog จากการเปิดดู", async () => {
    needSetup();
    ok(hasWork, "ยังไม่มีตัวโหลด");
    const snap = async () => fmt(await q(`SELECT (SELECT count(*)::text || max("updatedAt")::text FROM "Customer" WHERE "tenantId" = $1) a, (SELECT count(*)::text || max("updatedAt")::text FROM "MemberFieldValue" WHERE "tenantId" = $1) b, (SELECT count(*)::text || max("updatedAt")::text FROM "Appointment" WHERE "tenantId" = $1) c, (SELECT count(*)::text FROM "AuditLog" WHERE "tenantId" = $1) d`, [ids.tA]));
    const before = await snap();
    await call(cA, VW.owner, idsA());
    await call(cA, VW.thera1, idsA(), { page: "booking.mine" });
    eq(await snap(), before, "ก่อน/หลัง");
  }, "MAJOR");

  // ═══════════════ R. คอมโพเนนต์ ═══════════════
  console.log("\n── R: TodayLine · MyQueue ──");
  const nowMs = Date.now();
  const job = (id: string, status: string, label: string): Any => ({
    appointmentId: id, kind: "BOOKED", status, assignMode: "SPECIFIC", ticketNumber: id === "apW" ? "P001" : "P002", ticketStatus: status === "IN_SERVICE" ? "SERVING" : "WAITING",
    label, serviceName: "นวดน้ำมันอโรมา 90", staffId: "st1", staffName: "น้องเมย์", bookedStartMs: nowMs, plannedStartMs: nowMs, plannedEndMs: nowMs + 90 * 60_000,
    waitMin: 5, waitedMin: 3, whyText: null, phoneMasked: "•••-•••-0001", phone: null, mine: true, actions: [],
  });
  const VIEW: Any = {
    unitId: "u1", dayStr: new Date(nowMs + 7 * 3_600_000).toISOString().slice(0, 10), nowMs, openMin: 600, closeMin: 1260, axisStartMs: nowMs - 3_600_000, axisEndMs: nowMs + 4 * 3_600_000,
    kpi: { booked: 2, arrived: 1, absent: 0, upcoming: 0, walkIns: 0, walkInsLeft: 0, waiting: 1, longestWaitMin: 3, longestWaitTicket: "P001", done: 0 },
    staff: [{ staffId: "st1", name: "น้องเมย์", seat: 1, mine: true, blocks: [] }],
    waiting: [job("apW", "ARRIVED", "คุณนิด")], inService: [job("apS", "IN_SERVICE", "คุณต้น")], skipped: [], todo: [], why: null,
    access: { view: true, operate: true, checkIn: true, walkIn: true, runOwn: true, runAny: true, fullPhone: false }, myStaffIds: ["st1"], walkInForm: null,
  };
  const noop = async () => {};
  const ACTS = Object.fromEntries(["call", "recall", "skip", "start", "done", "move", "checkin", "noshow", "cancel", "walkin"].map((k) => [k, noop]));
  const NOTE_PROP = {
    apW: { appointmentId: "apW", items: [{ key: "pressurePref", label: "แรงกดที่ชอบ", display: "ปานกลาง", sensitive: true }, { key: "musicPref", label: "เพลงที่ชอบ", display: "เพลงบรรเลงเปียโน", sensitive: false }], hidden: 1 },
    apS: { appointmentId: "apS", items: [{ key: "oilAllergy", label: "แพ้น้ำมัน", display: "ตะไคร้", sensitive: true }], hidden: 0 },
  };
  const checkNotes = (box: string, id: string) => {
    const n = one(box, "data-job-notes", id);
    const p = one(n.html, "data-job-note", NOTE_PROP[id as "apW" | "apS"].items[0].key);
    const it = NOTE_PROP[id as "apW" | "apS"].items[0];
    ok(textOf(p.html).includes(it.label) && textOf(p.html).includes(it.display) && p.attrs["data-sensitive"] === String(it.sensitive), `โน้ต ${id}: ${textOf(p.html)} ${fmt(p.attrs)}`);
    const hid = boxes(n.html, "data-job-notes-hidden");
    const want = NOTE_PROP[id as "apW" | "apS"].hidden;
    if (want > 0) ok(hid.length === 1 && hid[0].attrs["data-job-notes-hidden"] === String(want) && textOf(hid[0].html).includes("ซ่อน"), `ซ่อน ${id}: ${fmt(hid.map((h) => h.attrs))}`);
    else eq(hid.length, 0, `ไม่ควรมีป้ายซ่อน ${id}`);
  };
  await st("PC-4", "คอมโพเนนต์ B.5 เดิม render ได้ด้วยมุมมองตัวอย่าง (TodayLine มี [data-line-wait=apW] · MyQueue มี [data-my-job=apS])", () => {
    one(render(TodayLineC, { view: VIEW, unitSlug: "spa", actions: ACTS }), "data-line-wait", "apW");
    one(render(MyQueueC, { view: VIEW, unitSlug: "spa", actions: ACTS }), "data-my-job", "apS");
  }, "MAJOR");
  await st("R-1", "TodayLine prop notes: แถวรอ [data-line-wait] + กำลังทำ [data-line-inservice] มี [data-job-notes=<id>] · รายการ [data-job-note=<key>] มีป้าย+ค่า + data-sensitive · hidden>0 ⇒ [data-job-notes-hidden=N] ข้อความมีคำว่า 'ซ่อน'", () => {
    const h = render(TodayLineC, { view: VIEW, unitSlug: "spa", actions: ACTS, notes: NOTE_PROP });
    checkNotes(one(h, "data-line-wait", "apW").html, "apW");
    checkNotes(one(h, "data-line-inservice", "apS").html, "apS");
  });
  await st("R-2", "MyQueue (มือถือหมอ) prop notes: งานที่กำลังทำ [data-my-job] + ทุกแถว [data-line-wait=apW] มีโน้ตของงานนั้น", () => {
    const h = render(MyQueueC, { view: VIEW, unitSlug: "spa", actions: ACTS, notes: NOTE_PROP });
    checkNotes(one(h, "data-my-job", "apS").html, "apS");
    const rows = boxes(h, "data-line-wait", "apW");
    ok(rows.length >= 1, "ไม่มีแถว apW");
    for (const r of rows) checkNotes(r.html, "apW");
  });
  await st("R-3", "ไม่ส่ง notes / ส่ง {} ⇒ DOM เท่าเดิมทุกไบต์ (ไม่มี data-job-notes) — ร้านตัดผม/ผู้ไม่มีสิทธิ์เห็นจอเดิม", () => {
    for (const C of [TodayLineC, MyQueueC]) {
      const a = render(C, { view: VIEW, unitSlug: "spa", actions: ACTS });
      const b = render(C, { view: VIEW, unitSlug: "spa", actions: ACTS, notes: {} });
      ok(a === b && !a.includes("data-job-notes"), "ไม่เท่ากัน/มีกล่องโน้ต");
    }
    const withNotes = render(TodayLineC, { view: VIEW, unitSlug: "spa", actions: ACTS, notes: NOTE_PROP });
    ok(withNotes.includes("data-job-notes"), "positive: ส่ง notes แล้วต้องมีกล่อง");
  }, "MAJOR");
} finally {
  // ═══════════════ Z. ล้างข้อมูล + Q ═══════════════
  console.log("\n── Z/Q: ล้างข้อมูล · svcqc ไม่ถูกแตะ ──");
  try {
    const all = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
    await cleanup(all);
    await cleanupGlobal();
    const left = Number((await q<{ n: string }>(`SELECT count(*)::text AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0]?.n ?? 0);
    const leftU = Number((await q<{ n: string }>(`SELECT count(*)::text AS n FROM "User" WHERE email LIKE $1`, [`${USER_MAIL}%`]))[0]?.n ?? 0);
    record("Z-1", "ล้างร้าน/ผู้ใช้ทดสอบหมด (qc-svc-b16-* = 0)", left + leftU === 0 ? "PASS" : "FAIL", left + leftU ? `เหลือ tenant ${left} · user ${leftU}` : "", "MAJOR");
  } catch (e) {
    record("Z-1", "ล้างร้าน/ผู้ใช้ทดสอบหมด", "FAIL", errMsg(e), "MAJOR");
  }
  try {
    const after = await svcqcPrint();
    record("Q-1", "ร้าน svcqc ไม่ถูกแตะ (SettingValue · SettingProfile · MemberAccessLog · event member.sensitive.viewed เท่าเดิม)", printBefore && after === printBefore ? "PASS" : "FAIL", after === printBefore ? "" : `ก่อน ${printBefore} หลัง ${after}`, "MAJOR");
  } catch (e) {
    record("Q-1", "ร้าน svcqc ไม่ถูกแตะ", "FAIL", errMsg(e), "MAJOR");
  }
  await pool.end().catch(() => {});
}

// ═══════════════ S. ไฟล์ · สัญญาโค้ด ═══════════════
console.log("\n── S: ไฟล์ · สัญญาโค้ด ──");
{
  const ch = dirty(["src", "prisma"]);
  const headHas = git(["ls-tree", "--name-only", "HEAD", "--", F.notes]).trim() === F.notes;
  if (ch.length === 0 && headHas) skip("S-1", "แตะเฉพาะไฟล์ของใบ", "B.16 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ", "MAJOR");
  else await st("S-1", "แตะเฉพาะไฟล์ของใบ (§1 · ไฟล์ใหม่ใต้ src/components/booking/ และ src/lib/modules/member/ ได้) · มี customer-notes.ts · แก้ permissions/defs/privacy-shared/TodayLine/MyQueue/หน้า 2 หน้า", () => {
    const allowNew = (f: string) => (f.startsWith("src/components/booking/") || f.startsWith("src/lib/modules/member/")) && !git(["ls-tree", "--name-only", "HEAD", "--", f]).trim();
    const outside = ch.filter((f) => !OWN.has(f) && !allowNew(f));
    ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 6).join(", ")}`);
    const miss = [F.notes, F.privShared, F.perms, F.defs, F.todayLine, F.myQueue, F.pageToday, F.pageMine].filter((f) => !ch.includes(f));
    ok(miss.length === 0, `ยังไม่แก้/ยังไม่มี: ${miss.join(", ")}`);
  }, "MAJOR");
}
await st("S-2", "ไม่มี migration/แก้ schema · ไม่แตะ engine ฟิลด์/นโยบายสมาชิก (fields · privacy · profile · access) · ตัวโหลดจอ B.5 · ตัววางคิว · actions · เครื่องยนต์ค่าตั้ง · 3 ทะเบียน event", () => {
  eq(dirty(["prisma", ...FROZEN]), [], "ไฟล์ที่แตะ");
});
await st("S-3", `«${F.notes}»: import ค่าได้เฉพาะ @/lib/core/* · @/lib/modules/member (facade) · @/lib/modules/system/service · ./ ในโมดูล · ไม่แตะตารางสมาชิกตรง (memberField/memberFieldValue/memberAccessLog/memberSensitivePolicy/customer) · ไม่มี console.* · ไม่ยิง outbox · ไม่มีเวลาเครื่องดิบ`, () => {
  const s = src(F.notes);
  ok(s, `ยังไม่มี «${F.notes}»`);
  const bad = valueImports(s).filter((p) => !(p.startsWith("@/lib/core/") || p === "@/lib/modules/member" || p === "@/lib/modules/system/service" || p.startsWith("./")));
  ok(bad.length === 0, `import ต้องห้าม: ${bad.join(", ")}`);
  const code = stripComments(s);
  const tbl = [...code.matchAll(/\.(memberField|memberFieldValue|memberAccessLog|memberSensitivePolicy|memberSection|customer)\s*\./g)].map((m) => m[1]);
  ok(tbl.length === 0, `แตะตารางสมาชิกตรง: ${[...new Set(tbl)].join(", ")} (ใช้ facade สมาชิก)`);
  ok(!/\bconsole\s*\./.test(code), "มี console.*");
  ok(!/emitOutbox|outboxEvent/.test(code), "ยิง outbox เอง");
  ok(!/\.(getDay|getHours|getMinutes|getDate|getMonth|getFullYear)\s*\(\s*\)/.test(code), "เวลาเครื่องดิบ");
});
await st("S-4", "member/index.ts แก้แบบเพิ่มอย่างเดียว (ไม่ลบ/แก้บรรทัด export เดิม) · privacy-shared.ts ยัง pure (import ค่าได้แค่ @/lib/core/rbac)", () => {
  const d = git(["diff", "-U0", "HEAD", "--", F.memberIndex]);
  const removed = d.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---") && l.slice(1).trim() !== "");
  eq(removed, [], "บรรทัดที่ลบใน member/index.ts");
  const bad = valueImports(src(F.privShared)).filter((p) => p !== "@/lib/core/rbac");
  eq(bad, [], "import ใน privacy-shared.ts");
});
await st("S-5", "หน้า /booking + /booking/mine: เรียก loadJobCustomerNotes (page booking.today / booking.mine) ด้วย id งานจากจอ แล้วส่ง notes= ให้ TodayLine/MyQueue · viewer จาก requireUnit (Membership สด)", () => {
  const p: string[] = [];
  for (const [f, pg, c] of [[F.pageToday, "booking.today", "TodayLine"], [F.pageMine, "booking.mine", "MyQueue"]] as const) {
    const s = stripComments(src(f));
    if (!/loadJobCustomerNotes\s*\(/.test(s)) p.push(`${f}: ไม่เรียก loadJobCustomerNotes`);
    if (!s.includes(`"${pg}"`)) p.push(`${f}: ไม่มี page "${pg}"`);
    if (!new RegExp(`<${c}\\b[^>]*\\bnotes=`).test(s.replace(/\n/g, " "))) p.push(`${f}: <${c} notes=…> ไม่มี`);
    if (!/requireUnit\s*\(/.test(s)) p.push(`${f}: ไม่มี requireUnit`);
  }
  ok(p.length === 0, p.join(" · "));
});
await st("S-6", "คอมโพเนนต์/หน้า: import จาก customer-notes เป็น import type เท่านั้น (ไม่ลาก server ลง client) · ไม่ฮาร์ดโค้ดรหัสฟิลด์ (pressurePref/chemicalAllergy) หรือคีย์ค่าตั้ง", () => {
  const p: string[] = [];
  for (const f of [F.todayLine, F.myQueue]) {
    const s = src(f);
    if (valueImports(s).some((x) => x.includes("customer-notes"))) p.push(`${f}: import ค่าจาก customer-notes`);
  }
  for (const f of [F.todayLine, F.myQueue, F.pageToday, F.pageMine]) {
    const s = stripComments(src(f));
    if (/pressurePref|chemicalAllergy|jobCardFields/.test(s)) p.push(`${f}: ฮาร์ดโค้ดรหัสฟิลด์/คีย์ค่าตั้ง`);
  }
  ok(typeOnlyImports(src(F.todayLine)).some((x) => x.includes("customer-notes")) || /notes\??\s*:/.test(src(F.todayLine)), "TodayLine ยังไม่ประกาศ prop notes");
  ok(p.length === 0, p.join(" · "));
}, "MAJOR");

// ═══════════════ G. regression (หลังล้างข้อมูล) ═══════════════
console.log("\n── G: regression (b.4 · b.5 · b.6 · b.11 · สมาชิก m1.3 · smoke) ──");
const judgeSvc = (allowSkip: (id: string) => boolean, allowFail: (id: string) => boolean = () => false) => (out: string) => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return false;
  const j = JSON.parse(line.slice(13)) as { failed: string[]; skipped?: string[] };
  return j.failed.every(allowFail) && (j.skipped ?? []).every(allowSkip);
};
/** ชุดสมาชิก: JSON_SUMMARY {findings:[{id,sev}]} — ข้อภาพ S3.x ต้องมีเบราว์เซอร์ (QC_BASE) จึงยอมให้ค้างได้เท่านั้น */
const judgeMember = (allowed: readonly string[]) => (out: string) => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return false;
  const j = JSON.parse(line.slice(13)) as { total?: number; findings?: { id: string }[] };
  return (j.total ?? 0) > 0 && (j.findings ?? []).every((f) => allowed.includes(f.id));
};
const REG: { s: string; args?: string[]; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-svc-b.4", args: ["--no-regression"], judge: judgeSvc((x) => x.startsWith("G-") || x === "ST-1", (x) => x === "ST-1"), note: "ไม่มี FAIL ยกเว้น ST-1 · SKIP เฉพาะ G-*/ST-1" },
  { s: "qc-svc-b.5", args: ["--no-regression"], judge: judgeSvc((x) => /^(H|E|V|Q|G)-/.test(x) || x === "S-1", (x) => x === "S-1"), note: "ไม่มี FAIL ยกเว้น S-1 · SKIP เฉพาะ H/E/V/Q/G/S-1" },
  { s: "qc-svc-b.6", args: ["--no-regression"], judge: judgeSvc((x) => /^(H|V|Q|G)-/.test(x) || x === "S-1", (x) => ["S-1", "S-2", "S-9", "S-10"].includes(x)), note: "ไม่มี FAIL ยกเว้น S-1/S-2/S-9/S-10 (ตรวจไฟล์สกปรก/diff ตอนรับใบ) · SKIP เฉพาะ H/V/Q/G/S-1" },
  { s: "qc-svc-b.11", args: ["--no-regression"], judge: judgeSvc((x) => /^(V|Q|G)-/.test(x)), note: "ไม่มี FAIL · SKIP เฉพาะ V/Q/G (ต้อง ORACLE-EDIT b.11 K-3/K-4/N-4 ตามมติ R1 ก่อน)" },
  { s: "qc-member-m1.3", judge: judgeMember(["M1.3-S3.1", "M1.3-S3.2", "M1.3-S3.3"]), note: "ตัวออกแบบฟิลด์สมาชิก · ค้างได้เฉพาะ S3.1–S3.3 (ภาพ/เบราว์เซอร์)" },
  { s: "qc-svc-smoke" },
];
{
  const why = !hasWork ? "ยังไม่มีงานของใบ (customer-notes.loadJobCustomerNotes) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_B16_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t0 = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: { ...process.env }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 45 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-b16-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(all, r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t0) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC B.16 · ความชอบ/ข้อห้ามลูกค้าบนการ์ดงาน =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: G-* เมื่อ --no-regression · S-1 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length + skipped.filter((c) => !(c.id === "S-1")).length > 0 ? 1 : 0);
