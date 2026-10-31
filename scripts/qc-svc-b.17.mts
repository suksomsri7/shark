// QC — SVC B.17 · waitlist "แจ้งฉันถ้ามีคนยกเลิก" + ไม่มาซ้ำ (บังคับมัดจำ / ต้องโทรจอง) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-b.17.md (§2–§7 ผูกตรงตัว) · MASTER-PLAN แถว B.17 · DESIGN-BOOKING-QUEUE B3.2 · ภาคผนวก ก #32
//        ข้อมูลฉาก: scripts/svc-qc-data.mts บล็อก "SVC B.17" (SQC_WAITLIST_SCENE) · ไม่มีภาพแบบ
//
// กลุ่มข้อ:
//   PC positive control (เขียวตั้งแต่ก่อนทำ: ค่าตั้ง #32 เดิม · ตัวจับส่งซ้ำ/เวลาเงียบ/บล็อกของ notifyCustomer · ยกเลิกพร้อมกันได้ผู้ชนะ 1 · ยกเว้นสมาชิกของ B.8 ·
//      ยกเลิกทางเดิมไม่ยิง event · ตัวตรวจ PII จับเบอร์ที่ฝังได้)
//   T  ตาราง BookingWaitlist (R1 — ยังไม่มีใน schema ⇒ แดงจนกว่าจะเคาะ migration)
//   K  ค่าตั้ง (waitlistMode · waitlistMaxActive · msg.waitlistOpen · msg.enabled รับคีย์ใหม่แบบไม่บังคับ) + สิทธิ์ booking.deposit.waive
//   N  ไม่มาซ้ำ: นับถูกช่วงเวลา (ขอบ ±1 นาที) · เฉพาะหน่วย · เฉพาะ NO_SHOW · ตัวตนจากทางยืนยันแล้ว · เลี่ยงด้วยเบอร์ใหม่/ทาง ONLINE ไม่ได้ ·
//      บังคับมัดจำ (ไม่ดูเกณฑ์นาที · ยกเว้นสมาชิกไม่มีผล) · ต้องโทรจอง · ทาง STAFF ไม่ถูกบล็อก · ร้านยกเว้นรายนัด (สิทธิ์สด + audit)
//   W  เข้า/ออก waitlist (ตัวตน LINE เท่านั้น · OFF · มีที่ว่าง · เพดาน · กติกาไม่มาซ้ำ · รูปข้อมูล · rate limit · พร้อมกัน 10 ทาง = 1 แถว)
//   C  มีช่องว่าง ⇒ แจ้งครั้งเดียว (ยกเลิก ×10 พร้อม consumer ×3 + tick ×2) · ALL/FIRST · ไม่ตรง = ไม่แจ้ง · จบแล้ว/ออกแล้ว/จองแล้ว = ไม่แจ้ง ·
//      รับข้อเสนอผ่านทางจองปกติ (คนที่สอง FULL · มัดจำบังคับยังมีผล) · เลื่อน/ไม่มา/ยกเลิกทางเดิม/หมดเวลาเงียบ · ปิดข้อความ
//   E  งานรายนาที: หมดอายุทีละหน้าจนหมด (pageSize 5) · หลังหน้าต่าง = EXPIRED ไม่แจ้ง · signal
//   X  แยกร้าน (event ปลอมข้ามร้าน · tick จำกัดร้าน) · PII (ตาราง/log/outbox/audit/ผลคืน/console) · ไม่มีคำขอออกนอกเครื่อง
//   U  หน้าจอง: view.waitlist + กล่อง DOM · S ไฟล์/สัญญาโค้ด (S-1 ตรวจเฉพาะตอนรับใบ) · Q svcqc ไม่ถูกแตะ · G regression · Z ล้าง
//
// ข้อมูลทดสอบอยู่ใต้ tenant ชั่วคราว slug `qc-svc-b17-*` + ผู้ใช้ `qc-svc-b17-*@qc.invalid` · id ขึ้นต้น `svcb17_` · ลบใน finally (+ กวาดของค้างตอนเริ่ม)
// 🔴 ไม่ยิง LINE จริง: ตัวจำลอง (node:http 127.0.0.1) + LINE_API_BASE + ครอบ fetch (นอกเครื่อง = บล็อก) · ข้อสอบเรียก consumer เอง (พัก outbox ของร้านทดสอบ)
// รัน (ห้ามครอบ timeout · ห้าม kill กลางคัน):
//   bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.17.mts [--no-regression]
//   `--no-regression` = ข้าม G เป็น SKIP (ไม่นับผ่าน · iso.sh ทิ้ง env จึงใช้อาร์กิวเมนต์)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_WAITLIST_SCENE as SC, SQC_TENANT, SQC_UNITS, sqcIdentityToken } from "./svc-qc-data.mjs";

type Any = any;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-svc-b.17";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_B17_NO_REGRESSION === "1";
const F = {
  wl: "src/lib/modules/booking/waitlist.ts",
  rule: "src/lib/modules/booking/no-show-rule.ts",
  plat: "src/lib/platform/booking-waitlist.ts",
  service: "src/lib/modules/booking/service.ts",
  online: "src/lib/modules/booking/online.ts",
  index: "src/lib/modules/booking/index.ts",
  access: "src/lib/modules/booking/access.ts",
  defs: "src/lib/core/settings/defs/booking.ts",
  perms: "src/lib/core/permissions.ts",
  consumers: "src/lib/outbox-consumers.ts",
  minute: "src/lib/platform/minute-jobs.ts",
  comp: "src/components/public-booking.tsx",
  action: "src/app/(store)/s/[tenantSlug]/[unitSlug]/waitlist-actions.ts",
  page: "src/app/(store)/s/[tenantSlug]/[unitSlug]/page.tsx",
  actions: "src/lib/actions/booking.ts",
  dict: "src/lib/i18n/dict.ts",
  schema: "prisma/schema/booking.prisma",
} as const;
const NEW_FILES = [F.wl, F.rule, F.plat, F.action];
/** ไฟล์ที่ใบนี้แก้ได้ (ใบสั่ง §1) — migration ใหม่ใต้ prisma/migrations/*_svc_b17/ ได้เมื่อ R1-ก */
const OWN = new Set<string>([...NEW_FILES, F.service, F.online, F.index, F.access, F.defs, F.perms, F.consumers, F.minute, F.comp, F.page, F.actions, F.dict, F.schema]);
/** ห้ามแตะ (ใบสั่ง §1 "ห้ามแตะ") — รวมไฟล์ของเลน B.13 (l3) */
const FROZEN = [
  "src/lib/modules/booking/resources.ts", "src/lib/modules/booking/resource-kinds.ts", "src/lib/modules/booking/planner.ts", "src/lib/modules/booking/planner-run.ts",
  "src/lib/modules/booking/queue-line.ts", "src/lib/modules/booking/today-line.ts", "src/lib/modules/booking/line-ops.ts", "src/lib/modules/booking/public-line.ts",
  "src/lib/modules/booking/deposit.ts",
  "src/lib/platform/notify-customer.ts", "src/lib/platform/booking-notify.ts", "src/lib/platform/booking-line-link.ts", "src/lib/platform/postback-routes.ts",
  "src/lib/modules/chat", "src/lib/core/settings/service.ts", "src/lib/core/settings/registry.ts", "src/lib/core/settings/types.ts",
  "src/lib/automation/labels.ts", "src/lib/webhooks/labels.ts",
];
/** ฟังก์ชันใน service.ts ที่ต้องเท่า HEAD ทุกไบต์ (ใบสั่ง §1) */
const PROTECTED_FNS = ["busyRowsOf", "slotClear", "selfQuotaOk", "openCountForPhone", "replayOf", "holdMinutesOf", "findSlots"];

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ฐาน QC ของ RUN SVC ⇒ exit 4 ก่อนแตะฐาน
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }

// ═══════════════ สำเนาสัญญา (ใบสั่ง §3) ═══════════════
type Ctx = { tenantId: string; unitId: string; actorUserId?: string };
type Ref = { tenantSlug: string; unitSlug: string };
type JoinRes = { ok: true; entryId: string; duplicated: boolean; expiresAt: Date } | { ok: false; code: string; reason: string };
type RnsState = { action: "REQUIRE_DEPOSIT" | "PHONE_ONLY" | null; count: number; rule: { count: number; windowDays: number; action: string } | null };
type WlApi = {
  WAITLIST_RATE?: Any;
  joinWaitlistOnline?: (ref: Ref, i: Any, opts?: { now?: Date; ip?: string }) => Promise<JoinRes>;
  leaveWaitlistOnline?: (ref: Ref, i: { entryId: string; who: string }, opts?: { now?: Date; ip?: string }) => Promise<Any>;
};
type RuleApi = {
  REPEAT_NO_SHOW_REASON?: string;
  repeatNoShowOf?: (ctx: Ctx, who: { channel: string; partyId?: string | null; phone?: string | null }, opts?: { now?: Date }) => Promise<RnsState>;
  excuseNoShow?: (ctx: { tenantId: string; actorUserId: string }, i: { unitId: string; appointmentId: string; reason: string }) => Promise<Any>;
};
type PlatApi = {
  onWaitlistEvent?: (evt: Any, opts?: { now?: Date }) => Promise<void>;
  runWaitlistTick?: (now: Date, opts?: { tenantIds?: string[]; signal?: AbortSignal; deadline?: number; pageSize?: number }) => Promise<Any>;
};

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
const need = (l: { mod: Any; err: string }, what: string): Any => { if (!l.mod) throw new AssertFail(`โหลด ${what} ไม่ได้ (${l.err})`); return l.mod; };
const git = (args: string[]) => spawnSync("git", ["-C", ROOT, ...args], { encoding: "utf8" }).stdout ?? "";
const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
const valueImports = (s: string): string[] =>
  [...stripComments(s).matchAll(/^\s*import\s+(?!type\b)([^;]*?)\s+from\s+["']([^"']+)["']/gm)].map((m) => m[2]);
const addDays = (ds: string, n: number): string => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const bkkToday = (): string => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const bkkMs = (ds: string, min: number): number => { const [y, m, d] = ds.split("-").map(Number); return Date.UTC(y, m - 1, d) + (min - 420) * 60_000; };
const hm = (s: string): number => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const at = (ds: string, s: string): Date => new Date(bkkMs(ds, hm(s)));
const mOf = (ms: number) => Math.floor(ms / 60_000);
const DAY_MS = 86_400_000;
const js = (v: unknown) => { try { return JSON.stringify(v) ?? ""; } catch { return String(v); } };
const RESULTS: unknown[] = [];
const keep = <X,>(r: X): X => { RESULTS.push(r); return r; };

// ═══════════════ HTML ═══════════════
const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
const textOf = (html: string) => unesc(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const attrsOf = (openTag: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const tagName = openTag.slice(1).split(/[\s>/]/)[0];
  for (const m of openTag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:="([^"]*)")?/g)) if (m[1] !== tagName) out[m[1].toLowerCase()] = unesc(m[2] ?? "");
  return out;
};
function boxes(html: string, attr: string): { attrs: Record<string, string>; html: string }[] {
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
    out.push({ attrs: attrsOf(openTag), html: html.slice(open, end) });
  }
  return out;
}

// ═══════════════ ตัวจำลอง LINE + ครอบ fetch ═══════════════
type FakeReq = { method: string; path: string; json: Any };
const FAKE: FakeReq[] = [];
const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    const path = (req.url ?? "").split("?")[0] ?? "";
    let json: Any = null;
    if (String(req.headers["content-type"] ?? "").includes("json")) { try { json = JSON.parse(raw.toString("utf8")); } catch { json = null; } }
    FAKE.push({ method: req.method ?? "", path, json });
    res.writeHead(200, { "content-type": "application/json" });
    if (req.method === "POST" && path === "/v2/bot/message/push") return res.end(JSON.stringify({ sentMessages: [{ id: `fm${FAKE.length}` }] }));
    return res.end("{}");
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const FAKE_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const LINE_API_BASE_SAVED = process.env.LINE_API_BASE;
process.env.LINE_API_BASE = FAKE_BASE;
const REAL_FETCH = globalThis.fetch;
const BLOCKED: string[] = [];
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = "";
  try { host = new URL(url).hostname; } catch { /* ไม่ใช่ URL */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
  BLOCKED.push(host.slice(0, 80));
  return new Response(JSON.stringify({ message: "blocked by qc" }), { status: 503, headers: { "content-type": "application/json" } });
}) as typeof fetch;
const mark = () => FAKE.length;
const pushesTo = (ext: string, m0 = 0) => FAKE.slice(m0).filter((r) => r.method === "POST" && r.path === "/v2/bot/message/push" && r.json?.to === ext);
const msgText = (r: FakeReq | undefined): string => { const m = r?.json?.messages?.[0]; return String(m?.text ?? m?.altText ?? ""); };

// ═══════════════ โหลดโมดูล ═══════════════
const wlLoad = await importFile(F.wl);
const ruleLoad = await importFile(F.rule);
const platLoad = await importFile(F.plat);
const svcLoad = await tryImport("@/lib/modules/booking/service");
const onlineLoad = await tryImport("@/lib/modules/booking/online");
const lineLoad = await tryImport("@/lib/modules/booking/queue-line");
const settingsLoad = await tryImport("@/lib/core/settings");
const permLoad = await tryImport("@/lib/core/permissions");
const ncLoad = await tryImport("@/lib/platform/notify-customer");
const slLoad = await tryImport("@/lib/core/signed-link");
const dbLoad = await tryImport("@/lib/core/db");
const reactLoad = await tryImport("react");
const rdsLoad = await tryImport("react-dom/server");
const compLoad = await importFile(F.comp);
const BK = () => need(svcLoad, "booking/service");
const ON = () => need(onlineLoad, "booking/online");
const LN = () => need(lineLoad, "booking/queue-line");
const SET = () => need(settingsLoad, "core/settings");
const prisma: Any = need(dbLoad, "core/db").prisma;
const WL = {
  join: (ref: Ref, i: Any, o?: Any): Promise<JoinRes> => fnOf(wlLoad, "joinWaitlistOnline", F.wl)(ref, i, o).then(keep),
  leave: (ref: Ref, i: Any, o?: Any): Promise<Any> => fnOf(wlLoad, "leaveWaitlistOnline", F.wl)(ref, i, o).then(keep),
  rns: (ctx: Ctx, who: Any, o?: Any): Promise<RnsState> => fnOf(ruleLoad, "repeatNoShowOf", F.rule)(ctx, who, o).then(keep),
  excuse: (ctx: Any, i: Any): Promise<Any> => fnOf(ruleLoad, "excuseNoShow", F.rule)(ctx, i).then(keep),
  ev: (evt: Any, o?: Any): Promise<void> => fnOf(platLoad, "onWaitlistEvent", F.plat)(evt, o),
  tick: (now: Date, o?: Any): Promise<Any> => fnOf(platLoad, "runWaitlistTick", F.plat)(now, o).then(keep),
};
const REASON = (): string => {
  const r = (ruleLoad.mod as RuleApi | null)?.REPEAT_NO_SHOW_REASON;
  if (typeof r !== "string" || !r.trim()) throw new AssertFail(`«${F.rule}» ยังไม่มี export REPEAT_NO_SHOW_REASON`);
  return r;
};
const hasWork = typeof (wlLoad.mod as WlApi | null)?.joinWaitlistOnline === "function" && typeof (platLoad.mod as PlatApi | null)?.runWaitlistTick === "function"
  && typeof (ruleLoad.mod as RuleApi | null)?.repeatNoShowOf === "function";
const renderComp = (props: Record<string, unknown>): string => {
  const C = compLoad.mod?.default;
  if (typeof C !== "function") throw new AssertFail(`โหลด ${F.comp} ไม่ได้: ${compLoad.err}`);
  if (!reactLoad.mod || !rdsLoad.mod) throw new AssertFail(`react: ${reactLoad.err || rdsLoad.err}`);
  return String(rdsLoad.mod.renderToStaticMarkup(reactLoad.mod.createElement(C, props))).replace(/<!-- -->/g, "");
};

// ═══════════════ ฐานข้อมูล ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]));
  return colCache.get(table) ?? [];
};
const rid = (p: string) => `svcb17_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
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
const SLUG = "qc-svc-b17-";
const USER_MAIL = "qc-svc-b17-";
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
async function cleanupUsers() {
  try {
    await pool.query(`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${USER_MAIL}%`]);
    await pool.query(`DELETE FROM "Membership" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${USER_MAIL}%`]);
    await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${USER_MAIL}%`]);
  } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}
const RUN = Date.now().toString(36);
const RAND = randomBytes(3).toString("hex");
const IPN = randomInt(10, 250);
const IP = (n: number) => `10.17.${IPN}.${n}`;
let ipSeq = 0;
/** IP ใหม่ทุกคำขอสาธารณะ (ถัง rate limit ต่อ IP ไม่ชนกันเองระหว่างข้อ · W-10 ใช้ IP คงที่ .250) */
const nextIp = () => IP(1 + (ipSeq++ % 240));
async function cleanupBuckets() {
  try { await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1 OR key LIKE $2`, [`%10.17.${IPN}.%`, `%${SLUG}%`]); } catch (e) { console.log(`  ⚠️ ลบ rate bucket: ${errMsg(e)}`); }
}
const SV_MARK = "qc-svc-b17";
/** เขียนค่าตั้งแถวตรง (SQL · JSON null ได้) — คีย์ของใบนี้ยังไม่มี def ก่อนทำ จึงไม่ผ่านเครื่องยนต์ */
async function sv(tenantId: string, unitId: string, key: string, value: unknown, scope = "UNIT") {
  await pool.query(`DELETE FROM "SettingValue" WHERE "tenantId" = $1 AND key = $2 AND scope = $3 AND "scopeId" = $4`, [tenantId, key, scope, unitId]);
  await pool.query(`INSERT INTO "SettingValue" (id, "tenantId", key, scope, "scopeId", value, "setById", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, now())`,
    [rid("sv"), tenantId, key, scope, unitId, JSON.stringify(value), SV_MARK]);
}
async function svClear(tenantId: string, unitId: string, key: string) {
  await pool.query(`DELETE FROM "SettingValue" WHERE "tenantId" = $1 AND key = $2 AND scope = 'UNIT' AND "scopeId" = $3`, [tenantId, key, unitId]);
}
/** กันตัวระบายคิวอื่นหยิบ event ของร้านทดสอบไปส่งเอง — ข้อสอบเรียก consumer เองทุกครั้ง */
const parkOutbox = async () => { await pool.query(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 days' WHERE "tenantId" = ANY($1::text[]) AND status::text = 'PENDING'`, [[ids.tA, ids.tB]]); };
const evRow = async (tenantId: string, idemKeyLike: string) =>
  (await q<Any>(`SELECT id, "tenantId", type, "unitId", payload FROM "OutboxEvent" WHERE "tenantId" = $1 AND "idempotencyKey" LIKE $2 ORDER BY "createdAt" DESC`, [tenantId, idemKeyLike]));
const wlRow = async (entryId: string) => (await q<Any>(`SELECT * FROM "${SC.table}" WHERE id = $1`, [entryId]))[0] ?? null;
const logRows = async (tenantId: string, like: string) => q<{ dedupeKey: string; status: string; unitId: string }>(`SELECT "dedupeKey", status, "unitId" FROM "ServiceMessageLog" WHERE "tenantId" = $1 AND "dedupeKey" LIKE $2 ORDER BY at`, [tenantId, like]);
const KEY = (entryId: string, staffId: string, ds: string, hhmm: string) => SC.dedupeKey(entryId, staffId, bkkMs(ds, hm(hhmm)));

// ═══════════════ ฉาก ═══════════════
const TODAY = bkkToday();
const D = addDays(TODAY, 5);   // วันฉากหลัก (ในขอบเขตจองล่วงหน้าแม่แบบตัดผม 30 วัน)
const D1 = addDays(TODAY, 6);  // วันที่ยังว่าง (U-2)
const T = (k: string) => `svcb17_${k}_${RUN}`;
const ids = { tA: T("tA"), tB: T("tB"), uOwner: T("owner"), uStaff: T("staff"), uOwnerB: T("ownerB") };
type UnitKey = "W" | "F" | "Q" | "X" | "R" | "P" | "N" | "M" | "V" | "B";
const UNITS: Record<UnitKey, { id: string; tenantId: string; slug: string; name: string; mode: "ALL" | "FIRST" | "OFF" }> = {
  W: { id: T("uW"), tenantId: ids.tA, slug: `b17-w-${RUN}`, name: "บาร์เบอร์รอคิวว่าง", mode: "ALL" },
  F: { id: T("uF"), tenantId: ids.tA, slug: `b17-f-${RUN}`, name: "บาร์เบอร์คนแรก", mode: "FIRST" },
  Q: { id: T("uQ"), tenantId: ids.tA, slug: `b17-q-${RUN}`, name: "บาร์เบอร์เวลาเงียบ", mode: "ALL" },
  X: { id: T("uX"), tenantId: ids.tA, slug: `b17-x-${RUN}`, name: "บาร์เบอร์ปิดรอคิว", mode: "OFF" },
  R: { id: T("uR"), tenantId: ids.tA, slug: `b17-r-${RUN}`, name: "บาร์เบอร์กติกาไม่มา", mode: "ALL" },
  P: { id: T("uP"), tenantId: ids.tA, slug: `b17-p-${RUN}`, name: "บาร์เบอร์ต้องโทรจอง", mode: "ALL" },
  N: { id: T("uN"), tenantId: ids.tA, slug: `b17-n-${RUN}`, name: "บาร์เบอร์ไม่เก็บมัดจำ", mode: "OFF" },
  M: { id: T("uM"), tenantId: ids.tA, slug: `b17-m-${RUN}`, name: "บาร์เบอร์สมาชิกทอง", mode: "OFF" },
  V: { id: T("uV"), tenantId: ids.tA, slug: `b17-v-${RUN}`, name: "บาร์เบอร์วันเต็ม", mode: "ALL" },
  B: { id: T("uB"), tenantId: ids.tB, slug: `b17-b-${RUN}`, name: "ร้านบีรอคิว", mode: "ALL" },
};
const ctxOf = (k: UnitKey): Ctx => ({ tenantId: UNITS[k].tenantId, unitId: UNITS[k].id });
const SLUGS: Record<string, string> = { [ids.tA]: `${SLUG}a-${RUN}`, [ids.tB]: `${SLUG}b-${RUN}` };
const refOf = (k: UnitKey): Ref => ({ tenantSlug: SLUGS[UNITS[k].tenantId], unitSlug: UNITS[k].slug });
const stf = (k: UnitKey, n: 1 | 2) => `${UNITS[k].id}_s${n}`;
const STAFF_NAME = (k: UnitKey, n: 1 | 2) => `ช่าง${n === 1 ? "หนึ่ง" : "สอง"}${k}`;
const svc = (k: UnitKey, s: "cut" | "perm") => `${UNITS[k].id}_${s}`;
const OWNER = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.uOwner };
const OWNER_B = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.uOwnerB };
const usedPhones = new Set<string>();
const newPhone = () => { for (;;) { const p = `08${randomInt(10_000_000, 99_999_999)}`; if (!usedPhones.has(p)) { usedPhones.add(p); return p; } } };
const PHONES: string[] = [];
const NAMES: string[] = [];
const dashed = (p: string) => `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
const phoneLeak = (s: string): string[] => PHONES.filter((p) => s.includes(p) || s.includes(dashed(p)) || s.includes(`66${p.slice(1)}`));

type Pty = { id: string; phone: string; name: string; ext: string; contactId: string | null; tenantId: string };
const PTY: Record<string, Pty> = {};
const ap: Record<string, string> = {};
const E: Record<string, string> = {};        // entry ids
const conn: Record<string, string> = {};
let setupOk = false;
let setupErr = "";
const whoOf = (k: string): string => BK_IDENTITY(PTY[k].tenantId, PTY[k].id);
const BK_IDENTITY = (tenantId: string, partyId: string): string => {
  const f = onlineLoad.mod?.bookingIdentityToken;
  if (typeof f !== "function") throw new AssertFail(`booking/online ไม่มี bookingIdentityToken (${onlineLoad.err})`);
  return f({ tenantId }, partyId, 240) as string;
};

/** บรรทัด console ทั้งหมดระหว่างเรียกงานของใบ (X8: log ห้ามมีเบอร์/ชื่อ) */
const captured: string[] = [];
async function quiet<R>(fn: () => Promise<R>): Promise<R> {
  const k = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  const grab = (...a: unknown[]) => { captured.push(a.map((x) => (typeof x === "string" ? x : fmt(x))).join(" ")); };
  console.log = grab; console.info = grab; console.warn = grab; console.error = grab; console.debug = grab;
  try { return await fn(); } finally { Object.assign(console, k); }
}

async function book(k: UnitKey, staff: 1 | 2, s: "cut" | "perm", start: string, ds = D, extra: Record<string, unknown> = {}): Promise<string> {
  const phone = newPhone(); PHONES.push(phone);
  const name = `ลูกค้าฉาก${k}${start.replace(":", "")}${RAND}`; NAMES.push(name);
  const r = await BK().bookAppointment(ctxOf(k), {
    serviceId: svc(k, s), staffId: stf(k, staff), dateStr: ds, startMin: hm(start), channel: "STAFF", customerName: name, customerPhone: phone,
    idempotencyKey: `b17-${RUN}-${k}-${staff}-${start}-${ds}-${randomInt(1e6)}`, ...extra,
  });
  if (!r?.ok) throw new AssertFail(`จอง ${k} s${staff} ${s} ${start}: ${r?.code} ${r?.reason}`);
  if (r.status === "PENDING") { const c = await BK().setAppointmentStatus(UNITS[k].tenantId, UNITS[k].id, r.id, "CONFIRMED"); ok(c?.ok !== false, `ยืนยัน ${k} ${start}`); }
  return r.id;
}
/** นัดย้อนหลัง/ล่วงหน้าแบบแถวตรง (bookAppointment ไม่รับเวลาอดีต) — ใช้ตั้งประวัติไม่มา */
async function insAppt(k: UnitKey, o: { startAt: Date; status: string; partyId?: string | null; phone: string; snap?: Record<string, unknown> }): Promise<string> {
  const id = rid("ap");
  await insertRow("Appointment", {
    id, tenantId: UNITS[k].tenantId, unitId: UNITS[k].id, staffId: stf(k, 1), serviceId: svc(k, "cut"), startAt: o.startAt, endAt: new Date(o.startAt.getTime() + 30 * 60_000),
    status: o.status, customerName: `ประวัติ${RAND}`, customerPhone: o.phone, partyId: o.partyId ?? null, kind: "BOOKED", channel: "ONLINE", source: "ONLINE",
    policySnapshot: JSON.stringify(o.snap ?? {}), updatedAt: new Date(),
  });
  return id;
}
async function mkParty(key: string, tenantId: string, opts: { contact?: "A" | "B" | null; blocked?: boolean; phone?: string } = {}): Promise<Pty> {
  const phone = opts.phone ?? newPhone(); PHONES.push(phone);
  const name = `คุณ${key}รอคิว${RAND}`; NAMES.push(name);
  const p = await prisma.party.create({ data: { tenantId, kind: "PERSON", name, phone, phoneNorm: phone } });
  let contactId: string | null = null;
  const ext = `Ub17${key.toLowerCase()}${RAND}${RUN}`;
  if (opts.contact) {
    const c = await prisma.chatContact.create({
      data: { tenantId, systemId: opts.contact === "A" ? sysA : sysB, channel: "LINE", channelConnectionId: conn[opts.contact], externalUserId: ext, partyId: p.id, lang: "th", ...(opts.blocked ? { blockedAt: new Date() } : {}) },
    });
    contactId = c.id;
  }
  PTY[key] = { id: p.id, phone, name, ext, contactId, tenantId };
  return PTY[key];
}
let sysA = "", sysB = "";

/** ลายนิ้วมือของร้าน svcqc (Q-1 · ใบนี้ห้ามแตะร้านจริงของฉาก) */
async function svcqcPrint(): Promise<string> {
  const r = await q<Any>(
    `SELECT (SELECT count(*)::text || ':' || coalesce(max("updatedAt")::text, '') FROM "SettingValue" WHERE "tenantId" = $1) AS a,
            (SELECT count(*)::text FROM "SettingProfile" WHERE "tenantId" = $1) AS b,
            (SELECT count(*)::text || ':' || coalesce(max("updatedAt")::text, '') FROM "Appointment" WHERE "tenantId" = $1) AS c,
            (SELECT count(*)::text FROM "ServiceMessageLog" WHERE "tenantId" = $1 AND "messageKey" = 'waitlistOpen') AS d`,
    [SQC_TENANT.id],
  );
  return fmt(r[0]);
}
let printBefore = "";

console.log(`\n(${LABEL} · วันนี้ไทย ${TODAY} · วันฉาก ${D} · ตัวจำลอง LINE ${FAKE_BASE} · งาน: ${hasWork ? "มี" : "ยังไม่มี"} waitlist/rule/platform)`);

try {
  printBefore = await svcqcPrint();
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length} ร้าน)`); await cleanup(stale); }
  await cleanupUsers();

  // ═══════════════ สร้างฉาก (ใช้ของที่มีอยู่แล้วเท่านั้น) ═══════════════
  console.log("\n── สร้างข้อมูลทดสอบ ──");
  try {
    const now = new Date();
    for (const t of [ids.tA, ids.tB]) await insertRow("Tenant", { id: t, name: `QC B17 ${t === ids.tA ? "ร้านเอ" : "ร้านบี"}`, slug: SLUGS[t], updatedAt: now });
    for (const [uid, k, t] of [[ids.uOwner, "owner", ids.tA], [ids.uStaff, "staff", ids.tA], [ids.uOwnerB, "ownerb", ids.tB]] as const) {
      await insertRow("User", { id: uid, email: `${USER_MAIL}${k}-${RUN}@qc.invalid`, name: `QC B17 ${k}`, updatedAt: now });
      const isStaff = k === "staff";
      await insertRow("Membership", {
        id: rid("mb"), userId: uid, tenantId: t, role: isStaff ? "STAFF" : "OWNER", unitAccess: JSON.stringify(isStaff ? [UNITS.R.id] : ["*"]),
        permissions: JSON.stringify(isStaff ? { "booking.appointment.setStatus": true, "booking.job.run": true } : {}), acceptedAt: now, updatedAt: now,
      });
    }
    sysA = (await prisma.appSystem.create({ data: { tenantId: ids.tA, type: "CHAT", name: `qc-b17-chat-${RUN}` } })).id;
    sysB = (await prisma.appSystem.create({ data: { tenantId: ids.tB, type: "CHAT", name: `qc-b17-chat-b-${RUN}` } })).id;
    conn.A = (await prisma.chatChannelConnection.create({ data: { tenantId: ids.tA, systemId: sysA, type: "LINE", displayName: `qc-b17-a-${RUN}`, externalAccountId: `qc-b17-a-${RUN}`, credentials: { channelAccessToken: `qcb17tokA${RAND}`, channelSecret: `qcb17secA${RAND}` }, meta: { basicId: "@qcb17a" } } })).id;
    conn.B = (await prisma.chatChannelConnection.create({ data: { tenantId: ids.tB, systemId: sysB, type: "LINE", displayName: `qc-b17-b-${RUN}`, externalAccountId: `qc-b17-b-${RUN}`, credentials: { channelAccessToken: `qcb17tokB${RAND}`, channelSecret: `qcb17secB${RAND}` }, meta: { basicId: "@qcb17b" } } })).id;
    const memberSys = T("memsys");
    await insertRow("AppSystem", { id: memberSys, tenantId: ids.tA, type: "MEMBER", name: `QC B17 MEMBER`, updatedAt: now });
    await insertRow("AppSystemUnit", { id: rid("asu"), tenantId: ids.tA, systemId: memberSys, unitId: UNITS.M.id, type: "MEMBER" });

    let ord = 0;
    for (const [k, u] of Object.entries(UNITS) as [UnitKey, (typeof UNITS)[UnitKey]][]) {
      await insertRow("BusinessUnit", { id: u.id, tenantId: u.tenantId, type: "BOOKING", name: u.name, slug: u.slug, updatedAt: now });
      for (let w = 0; w < 7; w++) await insertRow("BookingHours", { id: rid("bh"), tenantId: u.tenantId, unitId: u.id, weekday: w, openMin: 600, closeMin: 1200, closed: false, updatedAt: now });
      await insertRow("BookingService", { id: svc(k, "cut"), tenantId: u.tenantId, unitId: u.id, name: `ตัดผมรอคิว${k}`, durationMin: 30, priceSatang: 25000, bufferMin: 0, depositSatang: 0, bookable: true, sortOrder: 0, updatedAt: now });
      await insertRow("BookingService", { id: svc(k, "perm"), tenantId: u.tenantId, unitId: u.id, name: `ดัดผมรอคิว${k}`, durationMin: 120, priceSatang: 150000, bufferMin: 0, depositSatang: 0, bookable: true, sortOrder: 1, updatedAt: now });
      for (const n of [1, 2] as const) await insertRow("BookingStaff", { id: stf(k, n), tenantId: u.tenantId, unitId: u.id, name: STAFF_NAME(k, n), sortOrder: n, createdAt: new Date(now.getTime() - 600_000 + ++ord * 1000), updatedAt: now });
      const a = await SET().applyTemplate(u.tenantId === ids.tA ? OWNER : OWNER_B, { tenantId: u.tenantId }, { unitId: u.id, domain: "booking", templateKey: "BARBER", overwrite: "RESET_ALL" });
      ok(a?.ok === true, `applyTemplate ${k}: ${a?.code} ${fmt(a?.issues)}`);
      await sv(u.tenantId, u.id, "messaging.lineConnectionId", u.tenantId === ids.tA ? conn.A : conn.B);
      await sv(u.tenantId, u.id, "messaging.channelOrder", ["LINE", "WEB_LINK"]);
      await sv(u.tenantId, u.id, "messaging.quietHours", k === "Q" ? { start: "21:00", end: "08:00" } : null);
      await sv(u.tenantId, u.id, "booking.booking.onlineSharePct", 100);
      await sv(u.tenantId, u.id, "booking.booking.maxOpenPerPhone", null);
      await sv(u.tenantId, u.id, SC.settings.mode, u.mode);
    }
    await sv(ids.tA, UNITS.P.id, SC.settings.repeatNoShow, { count: 3, windowDays: 180, action: "PHONE_ONLY" });
    await sv(ids.tA, UNITS.N.id, "booking.deposit.method", "NONE");
    await sv(ids.tA, UNITS.M.id, "booking.deposit.memberExemptTier", "GOLD");

    // ── นัดที่ทำให้หน้าต่างเต็ม (ช่อง STAFF · B.3) ──
    for (const [key, st2, s, t0] of [
      ["A1", 1, "cut", "14:00"], ["A2", 1, "cut", "14:30"], ["A3", 2, "cut", "14:00"], ["A4", 2, "cut", "14:30"],
      ["A5", 1, "cut", "16:00"], ["A6", 1, "cut", "16:30"], ["A7", 2, "cut", "16:00"], ["A8", 2, "cut", "16:30"],
    ] as const) ap[key] = await book("W", st2, s, t0);
    ap.F1 = await book("F", 1, "cut", "14:00"); ap.F2 = await book("F", 1, "cut", "14:30");
    for (const [key, t0] of [["Q1", "14:00"], ["Q2", "14:30"], ["Q3", "16:00"], ["Q4", "16:30"], ["Q5", "18:00"], ["Q6", "18:30"]] as const) ap[key] = await book("Q", 1, "cut", t0);
    ap.R1 = await book("R", 1, "cut", "14:00"); ap.R2 = await book("R", 1, "cut", "14:30");
    ap.B1 = await book("B", 1, "cut", "14:00"); ap.B2 = await book("B", 1, "cut", "14:30");
    // หน่วย V: ช่างหนึ่งเต็มทั้งวัน D (10:00–20:00 · 20 นัด) · ช่างสองปิดรับออนไลน์ ⇒ วัน D ไม่มีเวลาว่างเลย (U-1)
    await sv(ids.tA, UNITS.V.id, "booking.booking.onlineSharePct", 100);
    for (let m = 600; m < 1200; m += 30) await book("V", 1, "cut", `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
    await sv(ids.tA, stf("V", 2), "booking.booking.onlineSharePct", 0, "STAFF");

    // ── ลูกค้า (Party + LINE) ──
    for (const k of ["P1", "P2", "P3", "P4", "P5", "P6", "PF2", "PF3", "PQ1", "PQ2", "PQ3", "PR", "PV1", "PV2"]) await mkParty(k, ids.tA, { contact: "A" });
    await mkParty("PF1", ids.tA, { contact: "A", blocked: true });
    await mkParty("PB", ids.tB, { contact: "B" });
    for (const k of ["PK1", "PK2", "PK3", "PO", "PP", "PN", "PE", "PVIC", "PG"]) await mkParty(k, ids.tA, { contact: "A" });
    // ประวัติไม่มา (แถวตรง · วันที่ย้อนหลัง) — PR: 2 ครั้งในหน่วย R ด้วย "เบอร์เก่า" (Party เปลี่ยนเบอร์แล้ว · N-7)
    const nowMs = now.getTime();
    const oldPhoneR = newPhone(); PHONES.push(oldPhoneR); PTY.PR_OLD = { ...PTY.PR, phone: oldPhoneR };
    ap.PR_NS1 = await insAppt("R", { startAt: new Date(nowMs - 10 * DAY_MS), status: "NO_SHOW", partyId: PTY.PR.id, phone: oldPhoneR });
    ap.PR_NS2 = await insAppt("R", { startAt: new Date(nowMs - 20 * DAY_MS), status: "NO_SHOW", partyId: PTY.PR.id, phone: oldPhoneR });
    // PK1: ขอบใน (90 วัน − 1 นาที) · PK2: ขอบนอก (90 วัน + 1 นาที) · PK3: CANCELLED/DONE ไม่นับ + NO_SHOW อนาคตไม่นับ
    await insAppt("R", { startAt: new Date(nowMs - 10 * DAY_MS), status: "NO_SHOW", partyId: PTY.PK1.id, phone: PTY.PK1.phone });
    await insAppt("R", { startAt: new Date(nowMs - 90 * DAY_MS + 60_000), status: "NO_SHOW", partyId: PTY.PK1.id, phone: PTY.PK1.phone });
    await insAppt("R", { startAt: new Date(nowMs - 10 * DAY_MS), status: "NO_SHOW", partyId: PTY.PK2.id, phone: PTY.PK2.phone });
    await insAppt("R", { startAt: new Date(nowMs - 90 * DAY_MS - 60_000), status: "NO_SHOW", partyId: PTY.PK2.id, phone: PTY.PK2.phone });
    await insAppt("R", { startAt: new Date(nowMs - 5 * DAY_MS), status: "NO_SHOW", partyId: PTY.PK3.id, phone: PTY.PK3.phone });
    await insAppt("R", { startAt: new Date(nowMs - 6 * DAY_MS), status: "CANCELLED", partyId: PTY.PK3.id, phone: PTY.PK3.phone });
    await insAppt("R", { startAt: new Date(nowMs - 7 * DAY_MS), status: "DONE", partyId: PTY.PK3.id, phone: PTY.PK3.phone });
    await insAppt("R", { startAt: new Date(nowMs + 2 * DAY_MS), status: "NO_SHOW", partyId: PTY.PK3.id, phone: PTY.PK3.phone });
    // PO: ไม่มา 2 ครั้งในหน่วยอื่น (W) ⇒ หน่วย R ไม่นับ
    await insAppt("W", { startAt: new Date(nowMs - 3 * DAY_MS), status: "NO_SHOW", partyId: PTY.PO.id, phone: PTY.PO.phone });
    await insAppt("W", { startAt: new Date(nowMs - 4 * DAY_MS), status: "NO_SHOW", partyId: PTY.PO.id, phone: PTY.PO.phone });
    // PP: 3 ครั้งใน P (PHONE_ONLY 3/180) · PN: 2 ครั้งใน N (มัดจำ NONE) · PE: 2 ครั้งใน R (ร้านยกเว้น 1 ครั้ง · N-13) · PG: สมาชิกทอง (N-5)
    for (const d of [10, 40, 170]) await insAppt("P", { startAt: new Date(nowMs - d * DAY_MS), status: "NO_SHOW", partyId: PTY.PP.id, phone: PTY.PP.phone });
    for (const d of [3, 9]) await insAppt("N", { startAt: new Date(nowMs - d * DAY_MS), status: "NO_SHOW", partyId: PTY.PN.id, phone: PTY.PN.phone });
    ap.PE_NS1 = await insAppt("R", { startAt: new Date(nowMs - 2 * DAY_MS), status: "NO_SHOW", partyId: PTY.PE.id, phone: PTY.PE.phone });
    ap.PE_NS2 = await insAppt("R", { startAt: new Date(nowMs - 8 * DAY_MS), status: "NO_SHOW", partyId: PTY.PE.id, phone: PTY.PE.phone });
    // PVIC: มีคนกรอกเบอร์ของ PVIC บนหน้า ONLINE แล้วไม่มา 2 ครั้ง (ไม่ผูก Party) ⇒ ตัวตน LINE ของ PVIC ต้องไม่โดน (N-14)
    for (const d of [4, 6]) await insAppt("R", { startAt: new Date(nowMs - d * DAY_MS), status: "NO_SHOW", partyId: null, phone: PTY.PVIC.phone });
    // PG สมาชิก GOLD (Customer.partyId = PG) ของระบบสมาชิกที่ผูกหน่วย M
    await insertRow("Customer", { id: T("custG"), tenantId: ids.tA, memberSystemId: memberSys, name: PTY.PG.name, firstName: PTY.PG.name, phone: PTY.PG.phone, partyId: PTY.PG.id, tier: "GOLD", status: "ACTIVE", updatedAt: now });
    await parkOutbox();
    setupOk = true;
  } catch (e) {
    setupErr = errMsg(e);
    record("SETUP", "สร้างฉาก", "FAIL", setupErr, "CRITICAL");
  }
  const needSetup = () => ok(setupOk, `ฉากสร้างไม่สำเร็จ: ${setupErr}`);

  // ═══════════════ PC · positive control (ต้องเขียวก่อนทำ) ═══════════════
  console.log("\n── PC: positive control ──");
  await st("PC-1", "#32 booking.late.repeatNoShow (B.0) ยังเป็นตาราง UNIT · ค่าเริ่ม ตัดผม/สปา 2/90 บังคับมัดจำ · คลินิก 3/180 ต้องโทรจอง · ร้านเดิม null", () => {
    const d = SET().getDef(SC.settings.repeatNoShow);
    ok(d, "ไม่มี def");
    eq([d.type, [...d.chain]], ["table", ["UNIT"]], "type/chain");
    eq({ BARBER: d.defaults.BARBER, SPA: d.defaults.SPA, CLINIC: d.defaults.CLINIC, _fallback: d.defaults._fallback }, { ...SC.repeatNoShowDefaults, _fallback: null }, "ค่าเริ่ม");
  });
  await st("PC-2", "ฉาก: หน้าต่าง 14:00–15:00 ของช่างหนึ่ง (หน่วย W) ไม่มีเวลาว่างช่อง LINE · 10:00 ว่าง · หน่วย V วัน D ไม่มีเวลาว่างเลย", async () => {
    needSetup();
    const s = await BK().findSlots(ctxOf("W"), { serviceId: svc("W", "cut"), staffId: stf("W", 1), dateStr: D, channel: "LINE" });
    const starts = (s as Any[]).map((x) => x.startMin);
    eq(starts.filter((t: number) => t >= 840 && t < 900), [], "เวลาว่าง 14–15");
    ok(starts.includes(600), "10:00 ต้องว่าง (ตัวควบคุม)");
    const v = await BK().findSlots(ctxOf("V"), { serviceId: svc("V", "cut"), staffId: null, dateStr: D, channel: "LINE" });
    eq((v as Any[]).length, 0, "หน่วย V วัน D");
  });
  await st("PC-3", "ตัวจับส่งซ้ำ: notifyCustomer คีย์เดียว 5 ทางพร้อมกัน ⇒ push 1 · แถว log 1 (SENT) — ตัวนับของข้อสอบนับซ้ำได้จริง", async () => {
    needSetup();
    const nc = need(ncLoad, "notify-customer");
    const m0 = mark();
    const key = `booking:qcb17pc:${RUN}`;
    await Promise.all(Array.from({ length: 5 }, () => nc.notifyCustomer({ tenantId: ids.tA }, { unitId: UNITS.W.id, domain: "booking", messageKey: "confirmation", partyId: PTY.PV2.id, vars: { ชื่อ: "ทดสอบ" }, dedupeKey: key, at: new Date() })));
    eq(pushesTo(PTY.PV2.ext, m0).length, 1, "push");
    eq((await logRows(ids.tA, key)).map((r) => r.status), ["SENT"], "แถว log");
  });
  await st("PC-4", "ตัวจับเวลาเงียบ: หน่วย Q ข้อความไม่ข้ามเวลาเงียบ ตอน 22:30 ⇒ SKIPPED_QUIET ไม่ push · คีย์เดิมตอน 08:01 ⇒ SENT (ลองซ้ำได้)", async () => {
    needSetup();
    const nc = need(ncLoad, "notify-customer");
    const m0 = mark();
    const key = `booking:qcb17pcq:${RUN}`;
    const base = { unitId: UNITS.Q.id, domain: "booking", messageKey: "noShowRebook", partyId: PTY.PV2.id, vars: { ชื่อ: "ทดสอบ" }, dedupeKey: key };
    const r1 = await nc.notifyCustomer({ tenantId: ids.tA }, { ...base, at: at(addDays(D, -1), "22:30") });
    eq(r1.status, "SKIPPED_QUIET", "22:30");
    eq(pushesTo(PTY.PV2.ext, m0).length, 0, "push ตอนเงียบ");
    const r2 = await nc.notifyCustomer({ tenantId: ids.tA }, { ...base, at: at(D, "08:01") });
    eq(r2.status, "SENT", "08:01");
    eq(pushesTo(PTY.PV2.ext, m0).length, 1, "push หลังเงียบ");
  });
  await st("PC-5", "ตัวจับ optOut: ผู้ติดต่อที่บล็อก (PF1) ⇒ SKIPPED_CONSENT ไม่ push", async () => {
    needSetup();
    const nc = need(ncLoad, "notify-customer");
    const m0 = mark();
    const r = await nc.notifyCustomer({ tenantId: ids.tA }, { unitId: UNITS.F.id, domain: "booking", messageKey: "confirmation", partyId: PTY.PF1.id, vars: {}, dedupeKey: `booking:qcb17pcc:${RUN}`, at: new Date() });
    eq(r.status, "SKIPPED_CONSENT", "สถานะ");
    eq(pushesTo(PTY.PF1.ext, m0).length, 0, "push");
  });
  await st("PC-6", "ยกเว้นมัดจำสมาชิก (B.8 #37) ใช้ได้ก่อนติดกติกา: PG (GOLD · ลิงก์ LINE) จองดัดผม 120 นาทีหน่วย M ⇒ มัดจำ 0", async () => {
    needSetup();
    const r = await ON().bookOnline(refOf("M"), { serviceId: svc("M", "perm"), staffId: stf("M", 1), dateStr: D, startMin: hm("10:00"), who: whoOf("PG"), idempotencyKey: `b17-${RUN}-pc6` }, { ip: nextIp() });
    ok(r?.ok, `จอง: ${r?.code} ${r?.reason}`);
    eq(r.depositSatang, 0, "มัดจำ");
  });
  await st("PC-7", "ตัวตรวจ PII จับเบอร์ที่ฝังได้ (ทั้งแบบติดกัน/ขีด/66) และไม่จับข้อความสะอาด", () => {
    ok(PHONES.length > 0, "ไม่มีเบอร์ฉาก");
    const p = PHONES[0];
    ok(phoneLeak(`x${p}y`).length === 1 && phoneLeak(`x${dashed(p)}`).length === 1 && phoneLeak(`66${p.slice(1)}`).length === 1, "ไม่จับ");
    eq(phoneLeak("booking:waitlistOpen:abc:def:123"), [], "จับผิด");
  });

  // ═══════════════ T · ตาราง (R1) ═══════════════
  console.log("\n── T: ตาราง BookingWaitlist (R1) ──");
  let hasTable = false;
  await st("T-1", `ตาราง "${SC.table}" มีคอลัมน์ตามใบสั่ง §4 (${SC.columns.length} คอลัมน์) — ⚠️ ยังไม่มีใน prisma/schema/booking.prisma ⇒ รอมติ R1`, async () => {
    const c = (await cols(SC.table)).map((x) => x.column_name);
    ok(c.length > 0, `ไม่มีตาราง "${SC.table}" ในฐาน (รอมติ R1: migration เพิ่มอย่างเดียว)`);
    const miss = SC.columns.filter((x) => !c.includes(x));
    ok(miss.length === 0, `ขาดคอลัมน์: ${miss.join(", ")}`);
    ok(/model\s+BookingWaitlist\s*\{/.test(src(F.schema)), "schema ไม่มี model BookingWaitlist");
    hasTable = true;
  });
  await st("T-2", "ตารางไม่มีคอลัมน์ชื่อ/เบอร์/อีเมล (PII อ่านจาก Party ตอนส่ง) · Prisma client มี bookingWaitlist", async () => {
    const c = (await cols(SC.table)).map((x) => x.column_name);
    ok(c.length > 0, `ไม่มีตาราง "${SC.table}"`);
    eq(c.filter((x) => /name|phone|email/i.test(x)), [], "คอลัมน์ PII");
    ok(typeof prisma.bookingWaitlist?.findMany === "function", "prisma.bookingWaitlist ไม่มี (ยังไม่ generate)");
  }, "MAJOR");

  // ═══════════════ K · ค่าตั้ง + สิทธิ์ ═══════════════
  console.log("\n── K: ค่าตั้ง + สิทธิ์ ──");
  await st("K-1", `${SC.settings.mode}: enum OFF/FIRST/ALL · ชั้น UNIT · กลุ่ม booking · ป้ายไทย · ค่าเริ่ม ตัดผม ALL · สปา FIRST · คลินิก OFF · ร้านเดิม OFF`, () => {
    const d = SET().getDef(SC.settings.mode);
    ok(d, `ยังไม่มี def ${SC.settings.mode}`);
    eq([d.type, [...d.chain], d.group], ["enum", ["UNIT"], "booking"], "type/chain/group");
    ok(isThai(d.labelTh), "labelTh");
    for (const m of SC.modes) ok(d.schema.safeParse(m).success, `schema ไม่รับ ${m}`);
    ok(!d.schema.safeParse("SOME").success, "schema รับค่านอกชุด");
    eq({ BARBER: d.defaults.BARBER, SPA: d.defaults.SPA, CLINIC: d.defaults.CLINIC, _fallback: d.defaults._fallback }, SC.modeDefaults, "ค่าเริ่ม");
    ok(SC.modes.every((m) => isThai(d.enumLabelsTh?.[m])), "ป้าย enum ไทย");
  });
  await st("K-2", `${SC.settings.maxActive}: int 1–10 · UNIT · ค่าเริ่ม 3 ทุกแม่แบบ`, () => {
    const d = SET().getDef(SC.settings.maxActive);
    ok(d, `ยังไม่มี def ${SC.settings.maxActive}`);
    eq([d.type, [...d.chain]], ["int", ["UNIT"]], "type/chain");
    eq([d.defaults.BARBER, d.defaults.SPA, d.defaults.CLINIC, d.defaults._fallback], [3, 3, 3, 3], "ค่าเริ่ม");
    eq([d.schema.safeParse(0).success, d.schema.safeParse(1).success, d.schema.safeParse(10).success, d.schema.safeParse(11).success], [false, true, true, false], "ขอบ");
  });
  await st("K-3", `${SC.settings.message}: template · UNIT · ตัวแปร ${SC.messageVars.join(" ")} · ข้อความตัดผมมี {เวลา} {ลิงก์จอง} · คลินิกไม่มี {บริการ} (#51)`, () => {
    const d = SET().getDef(SC.settings.message);
    ok(d, `ยังไม่มี def ${SC.settings.message}`);
    eq([d.type, [...d.chain]], ["template", ["UNIT"]], "type/chain");
    eq([...(d.templateVars ?? [])].sort(), [...SC.messageVars].sort(), "templateVars");
    const b = d.defaults.BARBER?.th ?? "";
    ok(isThai(b) && b.includes("{เวลา}") && b.includes("{ลิงก์จอง}"), `ข้อความตัดผม: ${b}`);
    ok(!String(d.defaults.CLINIC?.th ?? "{บริการ}").includes("{บริการ}"), "คลินิกมี {บริการ}");
    ok(!/โปรโมชัน|ส่วนลด|ลดราคา/.test(b), "มีเนื้อหาการตลาด");
  });
  await st("K-4", "booking.msg.enabled: รับค่าเดิม 10 คีย์ (ร้านที่บันทึกไว้ก่อนใบนี้ต้องยัง valid) และ 11 คีย์ (+waitlistOpen) · ค่าเริ่ม waitlistOpen ตัดผม/สปา true · คลินิก/ร้านเดิม false", () => {
    const d = SET().getDef(SC.settings.enabled);
    ok(d, "ไม่มี def");
    const ten = Object.fromEntries(Object.keys(d.defaults.BARBER ?? {}).filter((k) => k !== "waitlistOpen").map((k) => [k, true]));
    eq(Object.keys(ten).length, 10, "ชนิดเดิม 10");
    ok(d.schema.safeParse(ten).success, "ค่าเดิม 10 คีย์ไม่ผ่าน schema (ร้านเดิมพัง)");
    ok(d.schema.safeParse({ ...ten, waitlistOpen: false }).success, "11 คีย์ไม่ผ่าน schema");
    eq([d.defaults.BARBER?.waitlistOpen, d.defaults.SPA?.waitlistOpen, d.defaults.CLINIC?.waitlistOpen, d.defaults._fallback?.waitlistOpen], [true, true, false, false], "ค่าเริ่ม waitlistOpen");
  });
  await st("K-5", "สิทธิ์ booking.deposit.waive ใช้จริงแล้ว (ไม่อยู่ใน planned) · ป้ายไทย", () => {
    const p = need(permLoad, "permissions");
    const s = stripComments(src(F.perms));
    const planned = /planned:\s*\[([\s\S]*?)\]/.exec(s.slice(s.indexOf('"booking.deposit.waive": ')))?.[1] ?? "";
    ok(!planned.includes('"booking.deposit.waive"'), "booking.deposit.waive ยังอยู่ใน planned");
    ok(typeof p === "object", "โหลด permissions");
  }, "MAJOR");

  // ═══════════════ N · ไม่มาซ้ำ ═══════════════
  console.log("\n── N: ไม่มาซ้ำ ──");
  const R = ctxOf("R");
  await st("N-1", "LINE (ตัวตนยืนยันแล้ว): PR ไม่มา 2 ครั้งใน 90 วัน ⇒ { action REQUIRE_DEPOSIT · count 2 · rule 2/90 } (นับจาก Party แม้นัดเก่าใช้เบอร์อื่น — N-7)", async () => {
    needSetup();
    const r = await WL.rns(R, { channel: "LINE", partyId: PTY.PR.id });
    eq(r, { action: "REQUIRE_DEPOSIT", count: 2, rule: { count: 2, windowDays: 90, action: "REQUIRE_DEPOSIT" } }, "สถานะ");
  });
  await st("N-2", "ขอบหน้าต่าง: ไม่มาเมื่อ 90 วัน − 1 นาที นับ (PK1 = 2 ⇒ บังคับมัดจำ) · 90 วัน + 1 นาที ไม่นับ (PK2 = 1 ⇒ ไม่ติด) · CANCELLED/DONE/NO_SHOW ในอนาคต ไม่นับ (PK3 = 1)", async () => {
    needSetup();
    const now = new Date();
    const [a, b, c] = await Promise.all([PTY.PK1, PTY.PK2, PTY.PK3].map((p) => WL.rns(R, { channel: "LINE", partyId: p.id }, { now })));
    eq([a.count, a.action], [2, "REQUIRE_DEPOSIT"], "PK1");
    eq([b.count, b.action], [1, null], "PK2");
    eq([c.count, c.action], [1, null], "PK3");
  });
  await st("N-3", "นับเฉพาะหน่วย: PO ไม่มา 2 ครั้งในหน่วย W ⇒ หน่วย R = 0 · หน่วยที่ปิดกติกา (null) ⇒ { action null, count 0, rule null }", async () => {
    needSetup();
    eq((await WL.rns(R, { channel: "LINE", partyId: PTY.PO.id })).count, 0, "PO ที่หน่วย R");
    eq((await WL.rns(ctxOf("W"), { channel: "LINE", partyId: PTY.PO.id })).count, 2, "PO ที่หน่วย W");
    await sv(ids.tA, UNITS.W.id, SC.settings.repeatNoShow, null);
    try { eq(await WL.rns(ctxOf("W"), { channel: "LINE", partyId: PTY.PO.id }), { action: null, count: 0, rule: null }, "ปิดกติกา"); }
    finally { await svClear(ids.tA, UNITS.W.id, SC.settings.repeatNoShow); }
  });
  await st("N-4", "จอง LINE ของ PR (ตัดผม 30 นาที ราคา ฿250 · ปกติไม่มีมัดจำเพราะ < 90 นาที) ⇒ มัดจำบังคับ 20% = ฿50 · PENDING ถือช่อง · snapshot noShowRule { REQUIRE_DEPOSIT, 2 } ไม่มี deposit.exempt", async () => {
    needSetup();
    const r = await ON().bookOnline(refOf("R"), { serviceId: svc("R", "cut"), staffId: stf("R", 2), dateStr: D, startMin: hm("10:00"), who: whoOf("PR"), idempotencyKey: `b17-${RUN}-n4` }, { ip: nextIp() });
    ok(r?.ok, `จอง: ${r?.code} ${r?.reason}`);
    eq([r.depositSatang, r.status, r.holdUntilMs !== null], [5000, "PENDING", true], "มัดจำ/สถานะ/ถือช่อง");
    const [row] = await q<Any>(`SELECT "policySnapshot" AS s, "partyId" FROM "Appointment" WHERE "tenantId" = $1 AND "idempotencyKey" = $2`, [ids.tA, `b17-${RUN}-n4`]);
    eq(row?.s?.noShowRule, { action: "REQUIRE_DEPOSIT", count: 2 }, "snapshot.noShowRule");
    ok(!row?.s?.deposit?.exempt, "มี deposit.exempt");
  });
  await st("N-5", "ยกเว้นสมาชิกไม่มีผลกับคนติดกติกา: PG (GOLD) หลังไม่มา 2 ครั้ง จองดัดผม 120 นาที ⇒ มัดจำ ฿300 (ไม่ใช่ 0)", async () => {
    needSetup();
    const nowMs = Date.now();
    for (const d of [5, 15]) await insAppt("M", { startAt: new Date(nowMs - d * DAY_MS), status: "NO_SHOW", partyId: PTY.PG.id, phone: PTY.PG.phone });
    const r = await ON().bookOnline(refOf("M"), { serviceId: svc("M", "perm"), staffId: stf("M", 2), dateStr: D, startMin: hm("10:00"), who: whoOf("PG"), idempotencyKey: `b17-${RUN}-n5` }, { ip: nextIp() });
    ok(r?.ok, `จอง: ${r?.code} ${r?.reason}`);
    eq(r.depositSatang, 30000, "มัดจำ");
  });
  await st("N-6", `ต้องโทรจอง (หน่วย P · 3/180): PP จอง LINE ⇒ REPEAT_NO_SHOW + ข้อความกลาง (ไม่มีคำว่า "${SC.reasonMustNotContain[0]}") · ไม่สร้างนัด · ทาง ONLINE ด้วยเบอร์เดียวกันก็โดน`, async () => {
    needSetup();
    const why = REASON();
    ok(isThai(why) && SC.reasonMustNotContain.every((w) => !why.toLowerCase().includes(w)), `ข้อความกลาง: ${why}`);
    const r = await ON().bookOnline(refOf("P"), { serviceId: svc("P", "cut"), staffId: stf("P", 1), dateStr: D, startMin: hm("11:00"), who: whoOf("PP"), idempotencyKey: `b17-${RUN}-n6a` }, { ip: nextIp() });
    eq([r?.ok, r?.code, r?.reason], [false, "REPEAT_NO_SHOW", why], "LINE");
    const o = await ON().bookOnline(refOf("P"), { serviceId: svc("P", "cut"), staffId: stf("P", 1), dateStr: D, startMin: hm("11:00"), name: "ลูกค้าออนไลน์", phone: PTY.PP.phone, idempotencyKey: `b17-${RUN}-n6b` }, { ip: nextIp() });
    eq([o?.ok, o?.code, o?.reason], [false, "REPEAT_NO_SHOW", why], "ONLINE");
    eq((await q<Any>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "tenantId" = $1 AND "idempotencyKey" LIKE $2`, [ids.tA, `b17-${RUN}-n6%`]))[0].n, 0, "นัดที่สร้าง");
  });
  await st("N-7", "เลี่ยงด้วยเบอร์ใหม่ไม่ได้: นัดไม่มาของ PR ใช้เบอร์เก่า · Party ปัจจุบันเบอร์อื่น ⇒ LINE ยังติด (ข้อ N-1/N-4) · ตรวจว่าฉากเบอร์ต่างกันจริง", async () => {
    needSetup();
    const rows = await q<Any>(`SELECT "customerPhone" AS p FROM "Appointment" WHERE id = ANY($1::text[])`, [[ap.PR_NS1, ap.PR_NS2]]);
    ok(rows.length === 2 && rows.every((x) => x.p === PTY.PR_OLD.phone && x.p !== PTY.PR.phone), "ฉาก");
    eq((await WL.rns(R, { channel: "LINE", partyId: PTY.PR.id })).action, "REQUIRE_DEPOSIT", "LINE");
  });
  await st("N-8", "เลี่ยงด้วยทาง ONLINE ไม่ได้: ONLINE + เบอร์เก่าของนัดไม่มา ⇒ มัดจำ ฿50 · ONLINE + เบอร์ปัจจุบันของ Party (หา Party จากเบอร์) ⇒ มัดจำ ฿50 · เบอร์ใหม่เอี่ยม ⇒ 0 (ตัวควบคุม · หนี้ OTP)", async () => {
    needSetup();
    const go = (phone: string, t0: string, k: string) => ON().bookOnline(refOf("R"), { serviceId: svc("R", "cut"), staffId: stf("R", 2), dateStr: D, startMin: hm(t0), name: "ลูกค้าออนไลน์", phone, idempotencyKey: `b17-${RUN}-n8${k}` }, { ip: nextIp() });
    const a = await go(PTY.PR_OLD.phone, "11:00", "a");
    const b = await go(PTY.PR.phone, "11:30", "b");
    const fresh = newPhone(); PHONES.push(fresh);
    const c = await go(fresh, "12:00", "c");
    ok(a?.ok && b?.ok && c?.ok, `จอง: ${a?.code} ${b?.code} ${c?.code}`);
    eq([a.depositSatang, b.depositSatang, c.depositSatang], [5000, 5000, 0], "มัดจำ (เบอร์เก่า · เบอร์ Party · เบอร์ใหม่)");
  });
  await st("N-9", "ทางร้าน (STAFF/PHONE) ไม่ถูกบล็อก = ทาง \"โทรจอง\": จองให้ PP ที่หน่วย P ⇒ ok CONFIRMED · repeatNoShowOf ช่อง PHONE ยังรายงาน PHONE_ONLY count 3 ให้ร้านเห็น", async () => {
    needSetup();
    const r = await BK().bookAppointment(ctxOf("P"), { serviceId: svc("P", "cut"), staffId: stf("P", 2), dateStr: D, startMin: hm("12:00"), channel: "PHONE", customerName: PTY.PP.name, customerPhone: PTY.PP.phone, idempotencyKey: `b17-${RUN}-n9` });
    ok(r?.ok, `จอง: ${r?.code} ${r?.reason}`);
    eq(r.status, "CONFIRMED", "สถานะ");
    const s = await WL.rns(ctxOf("P"), { channel: "PHONE", phone: PTY.PP.phone });
    eq([s.action, s.count], ["PHONE_ONLY", 3], "สถานะช่อง PHONE");
  });
  await st("N-10", "นโยบายอ่านสดทุกคำขอ: ตั้ง 3/90 ⇒ PR ไม่ติด (2 < 3) · คืนค่าแม่แบบ ⇒ ติดอีก", async () => {
    needSetup();
    await sv(ids.tA, UNITS.R.id, SC.settings.repeatNoShow, { count: 3, windowDays: 90, action: "REQUIRE_DEPOSIT" });
    try { eq((await WL.rns(R, { channel: "LINE", partyId: PTY.PR.id })).action, null, "3/90"); }
    finally { await svClear(ids.tA, UNITS.R.id, SC.settings.repeatNoShow); }
    eq((await WL.rns(R, { channel: "LINE", partyId: PTY.PR.id })).action, "REQUIRE_DEPOSIT", "คืนแม่แบบ");
  });
  await st("N-11", "บังคับมัดจำแต่ร้านไม่มีวิธีรับมัดจำ (หน่วย N · method NONE) ⇒ ปฏิเสธแบบต้องโทรจอง (REPEAT_NO_SHOW) ไม่สร้างนัด", async () => {
    needSetup();
    const r = await ON().bookOnline(refOf("N"), { serviceId: svc("N", "cut"), staffId: stf("N", 1), dateStr: D, startMin: hm("11:00"), who: whoOf("PN"), idempotencyKey: `b17-${RUN}-n11` }, { ip: nextIp() });
    eq([r?.ok, r?.code], [false, "REPEAT_NO_SHOW"], "ผล");
  });
  await st("N-12", "หน้าจองขั้น 3 (ตัวตน PR) แสดงมัดจำ ฿50 ตรงกับที่จะถูกเก็บจริง (ไม่ใช่ ฿0)", async () => {
    needSetup();
    const v = await ON().loadOnlineBooking(refOf("R"), { svc: svc("R", "cut"), staff: stf("R", 2), date: D, time: "13:00", who: whoOf("PR") }, { ip: nextIp() });
    ok(v?.ok && v.view.step === 3, `view: ${fmt(v)}`);
    eq(v.view.summary.depositSatang, 5000, "summary.depositSatang");
  });
  await st("N-13", "ร้านยกเว้นรายนัด (excuseNoShow · booking.deposit.waive · Membership สด): ไม่มีสิทธิ์/ร้านอื่น ⇒ NOT_FOUND คำตอบเดียว · เหตุผลว่าง ⇒ BAD_INPUT · นัดไม่ใช่ NO_SHOW ⇒ BAD_STATE · ยกเว้นแล้ว PE เหลือ 1 ⇒ ไม่ติด · ซ้ำ = duplicated · audit 1 แถว (id ล้วน)", async () => {
    needSetup();
    const base = { unitId: UNITS.R.id, appointmentId: ap.PE_NS1, reason: "ลูกค้าแจ้งป่วยล่วงหน้า" };
    const n1 = await WL.excuse({ tenantId: ids.tA, actorUserId: ids.uStaff }, base);
    const n2 = await WL.excuse({ tenantId: ids.tB, actorUserId: ids.uOwnerB }, { ...base, unitId: UNITS.B.id });
    const n3 = await WL.excuse({ tenantId: ids.tA, actorUserId: ids.uOwner }, { ...base, appointmentId: T("nope") });
    eq([n1?.code, n2?.code, n3?.code], ["NOT_FOUND", "NOT_FOUND", "NOT_FOUND"], "รหัส");
    eq(new Set([n1?.reason, n2?.reason, n3?.reason]).size, 1, "ข้อความ NOT_FOUND ต้องเหมือนกัน");
    eq((await WL.excuse({ tenantId: ids.tA, actorUserId: ids.uOwner }, { ...base, reason: " " }))?.code, "BAD_INPUT", "เหตุผลว่าง");
    eq((await WL.excuse({ tenantId: ids.tA, actorUserId: ids.uOwner }, { ...base, appointmentId: ap.R1 }))?.code, "BAD_STATE", "นัดยืนยัน");
    const a = await WL.excuse({ tenantId: ids.tA, actorUserId: ids.uOwner }, base);
    eq([a?.ok, a?.duplicated ?? false], [true, false], "ครั้งแรก");
    const b = await WL.excuse({ tenantId: ids.tA, actorUserId: ids.uOwner }, base);
    eq([b?.ok, b?.duplicated], [true, true], "ซ้ำ");
    eq([(await WL.rns(R, { channel: "LINE", partyId: PTY.PE.id })).count, (await WL.rns(R, { channel: "LINE", partyId: PTY.PE.id })).action], [1, null], "PE หลังยกเว้น");
    const au = await q<Any>(`SELECT "targetId", coalesce("after"::text,'') AS a FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'booking.no_show.excused'`, [ids.tA]);
    eq(au.map((x) => x.targetId), [ap.PE_NS1], "audit");
    eq(phoneLeak(js(au)), [], "audit มีเบอร์");
    const [snap] = await q<Any>(`SELECT "policySnapshot" AS s FROM "Appointment" WHERE id = $1`, [ap.PE_NS1]);
    eq(snap?.s?.noShow?.excused, true, "policySnapshot.noShow.excused");
  });
  await st("N-14", "ทางไม่ยืนยันวางยาตัวตนไม่ได้: มีคนกรอกเบอร์ของ PVIC บน ONLINE แล้วไม่มา 2 ครั้ง (ไม่ผูก Party) ⇒ ตัวตน LINE ของ PVIC count 0 · แต่คำขอ ONLINE ด้วยเบอร์นั้นติด (count 2)", async () => {
    needSetup();
    eq((await WL.rns(R, { channel: "LINE", partyId: PTY.PVIC.id })).count, 0, "LINE");
    eq((await WL.rns(R, { channel: "ONLINE", phone: PTY.PVIC.phone })).count, 2, "ONLINE");
  });

  // ═══════════════ W · เข้า/ออก waitlist ═══════════════
  console.log("\n── W: เข้า/ออก waitlist ──");
  const W = refOf("W");
  const J = (ref: Ref, k: string, x: Record<string, unknown>, ip = nextIp()) => WL.join(ref, { who: whoOf(k), ...x }, { ip });
  const win = (s: string, st2: 1 | 2 | null, from: string, to: string, ds = D, unit: UnitKey = "W") =>
    ({ serviceId: svc(unit, s as "cut" | "perm"), staffId: st2 ? stf(unit, st2) : null, dateStr: ds, fromMin: hm(from), toMin: hm(to) });
  await st("W-1", "ต้องมีลิงก์ตัวตน LINE: ไม่ส่ง/ปลอม/หมดอายุ/ของร้านอื่น ⇒ IDENTITY_REQUIRED ข้อความเดียวกันทุกไบต์ · ไม่สร้างแถว", async () => {
    needSetup();
    const secret = process.env.SESSION_SECRET ?? "";
    const expired = sqcIdentityToken(secret, { tenantId: ids.tA, partyId: PTY.P1.id, nowMs: Date.now() - 3 * DAY_MS, ttlMin: 60 });
    const other = BK_IDENTITY(ids.tB, PTY.PB.id);
    const rs = await Promise.all(["", "x.y", expired, other].map((who, i) => WL.join(W, { ...win("cut", 1, "14:00", "15:00"), who }, { ip: nextIp() })));
    eq(rs.map((r) => r.ok === false && r.code), Array(4).fill("IDENTITY_REQUIRED"), "รหัส");
    eq(new Set(rs.map((r) => (r as Any).reason)).size, 1, "ข้อความ");
  });
  await st("W-2", "หน่วยปิด waitlist (OFF) ⇒ DISABLED", async () => {
    needSetup();
    const r = await J(refOf("X"), "P1", win("cut", 1, "14:00", "15:00", D, "X"));
    eq([r.ok, (r as Any).code], [false, "DISABLED"], "ผล");
  });
  await st("W-3", "หน้าต่างที่มีเวลาว่างอยู่แล้ว (10:00–11:00) ⇒ HAS_FREE (ไม่รับ · ให้จองเลย)", async () => {
    needSetup();
    const r = await J(W, "P1", win("cut", 1, "10:00", "11:00"));
    eq([r.ok, (r as Any).code], [false, "HAS_FREE"], "ผล");
  });
  await st("W-4", "เข้าสำเร็จ (P1 · ตัดผม · ช่างหนึ่ง · 14:00–15:00): แถว ACTIVE · expiresAt = 15:00 วัน D · ตัวตนเป็น Party · ส่งซ้ำ = id เดิม duplicated", async () => {
    needSetup();
    const r = await J(W, "P1", win("cut", 1, "14:00", "15:00"));
    ok(r.ok, `join: ${fmt(r)}`);
    if (!r.ok) return;
    E.E1 = r.entryId;
    eq(r.expiresAt instanceof Date ? r.expiresAt.getTime() : new Date(r.expiresAt as Any).getTime(), bkkMs(D, hm("15:00")), "expiresAt");
    const row = await wlRow(r.entryId);
    eq([row?.status, row?.partyId, row?.unitId, row?.serviceId, row?.staffId, row?.dateStr, row?.fromMin, row?.toMin], ["ACTIVE", PTY.P1.id, UNITS.W.id, svc("W", "cut"), stf("W", 1), D, 840, 900], "แถว");
    const again = await J(W, "P1", win("cut", 1, "14:00", "15:00"));
    eq([again.ok, again.ok && again.entryId, again.ok && again.duplicated], [true, r.entryId, true], "ซ้ำ");
  });
  await st("W-5", "เข้ารายการอื่นครบ: E2 ใครก็ได้ 14–15 · E3 ช่างสอง 14–15 · E4 ช่างหนึ่ง 16–17 · E5 ดัดผม ช่างหนึ่ง 14–15 · E6 ตัดผม ช่างหนึ่ง 14–15 · FIRST: EF1→EF2→EF3 · เงียบ: EQ1–EQ3 · R: ER · B: EB", async () => {
    needSetup();
    const plan: [string, Ref, string, Record<string, unknown>][] = [
      ["E2", W, "P2", win("cut", null, "14:00", "15:00")], ["E3", W, "P3", win("cut", 2, "14:00", "15:00")], ["E4", W, "P4", win("cut", 1, "16:00", "17:00")],
      ["E5", W, "P5", win("perm", 1, "14:00", "15:00")], ["E6", W, "P6", win("cut", 1, "14:00", "15:00")],
      ["EF1", refOf("F"), "PF1", win("cut", 1, "14:00", "15:00", D, "F")], ["EF2", refOf("F"), "PF2", win("cut", 1, "14:00", "15:00", D, "F")], ["EF3", refOf("F"), "PF3", win("cut", 1, "14:00", "15:00", D, "F")],
      ["EQ1", refOf("Q"), "PQ1", win("cut", 1, "14:00", "15:00", D, "Q")], ["EQ2", refOf("Q"), "PQ2", win("cut", 1, "16:00", "17:00", D, "Q")], ["EQ3", refOf("Q"), "PQ3", win("cut", 1, "18:00", "19:00", D, "Q")],
      ["ER", refOf("R"), "PR", win("cut", 1, "14:00", "15:00", D, "R")], ["EB", refOf("B"), "PB", win("cut", 1, "14:00", "15:00", D, "B")],
    ];
    const bad: string[] = [];
    for (const [k, ref, p, x] of plan) {
      const r = await WL.join(ref, { who: BK_IDENTITY(PTY[p].tenantId, PTY[p].id), ...x }, { ip: nextIp() });
      if (r.ok) E[k] = r.entryId; else bad.push(`${k}: ${r.code}`);
    }
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("W-6", "เพดานต่อคน (waitlistMaxActive = 1 ชั่วคราว): P4 มี E4 แล้ว เข้าอีกรายการ ⇒ LIMIT", async () => {
    needSetup();
    await sv(ids.tA, UNITS.W.id, SC.settings.maxActive, 1);
    try {
      const r = await J(W, "P4", win("cut", 2, "14:00", "15:00"));
      eq([r.ok, (r as Any).code], [false, "LIMIT"], "ผล");
    } finally { await svClear(ids.tA, UNITS.W.id, SC.settings.maxActive); }
  });
  await st("W-7", "ติดกติกาต้องโทรจอง (PP หน่วย P) ⇒ REPEAT_NO_SHOW + ข้อความกลาง · ติดบังคับมัดจำ (PR) เข้าได้ (W-5 ER)", async () => {
    needSetup();
    const r = await WL.join(refOf("P"), { who: whoOf("PP"), ...win("cut", 1, "14:00", "15:00", D, "P") }, { ip: nextIp() });
    eq([r.ok, (r as Any).code, (r as Any).reason], [false, "REPEAT_NO_SHOW", REASON()], "ผล");
    ok(!!E.ER, "ER ไม่ได้เข้า");
  });
  await st("W-8", "รูปข้อมูล: วันอดีต · เกินจองล่วงหน้า · fromMin ≥ toMin · toMin > 1440 · วันไม่จริง ⇒ BAD_INPUT · บริการของหน่วยอื่น/slug ไม่มี ⇒ NOT_FOUND", async () => {
    needSetup();
    const cases: Record<string, unknown>[] = [
      win("cut", 1, "14:00", "15:00", addDays(TODAY, -1)), win("cut", 1, "14:00", "15:00", addDays(TODAY, 45)),
      { ...win("cut", 1, "14:00", "15:00"), fromMin: 900, toMin: 900 }, { ...win("cut", 1, "14:00", "15:00"), toMin: 2000 }, { ...win("cut", 1, "14:00", "15:00"), dateStr: "2026-02-30" },
    ];
    const rs = await Promise.all(cases.map((x) => J(W, "P2", x)));
    eq(rs.map((r) => (r as Any).code), Array(cases.length).fill("BAD_INPUT"), "BAD_INPUT");
    const nf1 = await J(W, "P2", { ...win("cut", 1, "14:00", "15:00"), serviceId: svc("R", "cut") });
    const nf2 = await WL.join({ tenantSlug: SLUGS[ids.tA], unitSlug: `nope-${RUN}` }, { who: whoOf("P2"), ...win("cut", 1, "14:00", "15:00") }, { ip: nextIp() });
    eq([(nf1 as Any).code, (nf2 as Any).code], ["NOT_FOUND", "NOT_FOUND"], "NOT_FOUND");
  });
  await st("W-9", "ยิงพร้อมกัน 10 ทาง (P3 · E3 เดิม) ⇒ ok ทุกทาง id เดียว · แถว ACTIVE ของ P3 ในหน่วย W = 1", async () => {
    needSetup();
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => J(W, "P3", win("cut", 2, "14:00", "15:00"), nextIp())));
    ok(rs.every((r) => r.ok), `ผล: ${fmt(rs.map((r) => (r as Any).code))}`);
    eq(new Set(rs.map((r) => (r as Any).entryId)).size, 1, "id");
    eq((await q<Any>(`SELECT count(*)::int AS n FROM "${SC.table}" WHERE "tenantId" = $1 AND "unitId" = $2 AND "partyId" = $3 AND status = 'ACTIVE'`, [ids.tA, UNITS.W.id, PTY.P3.id]))[0].n, 1, "แถว");
  });
  await st("W-10", `rate limit ก่อนแตะฐาน: IP เดียว ${SC.rate.joinIp.limit + 1} ครั้งในหน่วยปิด ⇒ ${SC.rate.joinIp.limit} ครั้งแรก DISABLED · ครั้งสุดท้าย RATE_LIMITED · WAITLIST_RATE ตรงสัญญา`, async () => {
    needSetup();
    eq((wlLoad.mod as WlApi | null)?.WAITLIST_RATE, SC.rate, "WAITLIST_RATE");
    const out: string[] = [];
    for (let i = 0; i <= SC.rate.joinIp.limit; i++) out.push(String((await J(refOf("X"), "P1", win("cut", 1, "14:00", "15:00", D, "X"), IP(250)) as Any).code));
    eq(out, [...Array(SC.rate.joinIp.limit).fill("DISABLED"), "RATE_LIMITED"], "ผล");
  }, "MAJOR");
  await st("W-11", "ออก waitlist: P6 ออก E6 ⇒ CANCELLED · ซ้ำ = duplicated · P1 ออกของ P6 / ร้านบีใช้ id นี้ / ตัวตนเสีย / id ไม่มี ⇒ NOT_FOUND ข้อความเดียวกัน · แถวไม่เปลี่ยน", async () => {
    needSetup();
    ok(!!E.E6, "ไม่มี E6 (W-5)");
    const n1 = await WL.leave(W, { entryId: E.E6, who: whoOf("P1") }, { ip: nextIp() });
    const n2 = await WL.leave(refOf("B"), { entryId: E.E6, who: whoOf("PB") }, { ip: nextIp() });
    const n3 = await WL.leave(W, { entryId: E.E6, who: "x.y" }, { ip: nextIp() });
    const n4 = await WL.leave(W, { entryId: T("nope"), who: whoOf("P6") }, { ip: nextIp() });
    eq([n1?.code, n2?.code, n3?.code, n4?.code], Array(4).fill("NOT_FOUND"), "รหัส");
    eq(new Set([n1, n2, n3, n4].map((x) => x?.reason)).size, 1, "ข้อความ");
    eq((await wlRow(E.E6))?.status, "ACTIVE", "ยังไม่เปลี่ยน");
    const a = await WL.leave(W, { entryId: E.E6, who: whoOf("P6") }, { ip: nextIp() });
    const b = await WL.leave(W, { entryId: E.E6, who: whoOf("P6") }, { ip: nextIp() });
    eq([a?.ok, a?.duplicated, b?.ok, b?.duplicated], [true, false, true, true], "ผล");
    const row = await wlRow(E.E6);
    eq([row?.status, row?.endReason, row?.endedAt !== null], ["CANCELLED", "CUSTOMER", true], "แถว");
  });

  // ═══════════════ U · หน้าจอง (ก่อนมีช่องว่าง) ═══════════════
  console.log("\n── U: หน้าจอง ──");
  await st("U-1", "วันเต็มทั้งวัน (หน่วย V วัน D) + ตัวตน LINE ⇒ view.waitlist { mode ALL, canJoin true, joined false } · กล่อง form[data-bk-waitlist-join] มี hidden serviceId/staffId/dateStr/who · ปุ่มไทย", async () => {
    needSetup();
    const q0 = { svc: svc("V", "cut"), staff: stf("V", 1), date: D, who: whoOf("PV1") };
    const v = await ON().loadOnlineBooking(refOf("V"), q0, { ip: nextIp() });
    ok(v?.ok && v.view.step === 2, `view: ${fmt(v)}`);
    eq(v.view.waitlist, { mode: "ALL", canJoin: true, joined: false }, "view.waitlist");
    const h = renderComp({ view: v.view, basePath: `/s/${SLUGS[ids.tA]}/${UNITS.V.slug}`, query: q0, idempotencyKey: "k" });
    const f = boxes(h, "data-bk-waitlist-join");
    eq(f.length, 1, "form");
    const inputs = boxes(f[0].html, "name").map((b) => b.attrs.name);
    ok(["serviceId", "staffId", "dateStr", "who"].every((n) => inputs.includes(n)), `hidden: ${inputs.join(",")}`);
    ok(isThai(textOf(f[0].html)), "ปุ่มไม่ใช่ไทย");
    eq(phoneLeak(h), [], "เบอร์ในหน้า");
  });
  await st("U-2", "ไม่มีตัวตน ⇒ canJoin false + [data-bk-waitlist-need-line] · วันที่ยังว่าง (D+1) ⇒ ไม่มีคีย์ waitlist และไม่มีกล่อง data-bk-waitlist", async () => {
    needSetup();
    const v = await ON().loadOnlineBooking(refOf("V"), { svc: svc("V", "cut"), staff: stf("V", 1), date: D }, { ip: nextIp() });
    ok(v?.ok, "view");
    eq(v.view.waitlist?.canJoin, false, "canJoin");
    eq(boxes(renderComp({ view: v.view, basePath: "/x", query: {}, idempotencyKey: "k" }), "data-bk-waitlist-need-line").length, 1, "need-line");
    const f = await ON().loadOnlineBooking(refOf("V"), { svc: svc("V", "cut"), staff: stf("V", 1), date: D1, who: whoOf("PV1") }, { ip: nextIp() });
    ok(f?.ok && !("waitlist" in f.view), "วันว่างมีคีย์ waitlist");
    eq(boxes(renderComp({ view: f.view, basePath: "/x", query: {}, idempotencyKey: "k" }), "data-bk-waitlist").length, 0, "กล่อง");
  });
  await st("U-3", "เข้าแล้ว ⇒ joined true + [data-bk-waitlist-joined]", async () => {
    needSetup();
    const r = await WL.join(refOf("V"), { who: whoOf("PV1"), serviceId: svc("V", "cut"), staffId: stf("V", 1), dateStr: D }, { ip: nextIp() });
    ok(r.ok, `join (ค่าเริ่มหน้าต่าง = เวลาเปิด–ปิด): ${fmt(r)}`);
    const v = await ON().loadOnlineBooking(refOf("V"), { svc: svc("V", "cut"), staff: stf("V", 1), date: D, who: whoOf("PV1") }, { ip: nextIp() });
    eq(v?.view?.waitlist?.joined, true, "joined");
    eq(boxes(renderComp({ view: v.view, basePath: "/x", query: {}, idempotencyKey: "k" }), "data-bk-waitlist-joined").length, 1, "กล่อง joined");
  }, "MAJOR");

  // ═══════════════ C · มีช่องว่าง ⇒ แจ้งครั้งเดียว ═══════════════
  console.log("\n── C: ช่องว่าง ⇒ แจ้ง ──");
  const now0 = () => new Date();
  const cW = ctxOf("W");
  let cancelEvt: Any = null;
  await st("PC-8", "ยกเลิกนัด A1 พร้อมกัน 10 ทาง (cancelByShop · B.4) ⇒ สำเร็จ 1 · event booking.cancelled#A1 = 1 · ช่อง 14:00 ช่างหนึ่งว่างตาม findSlots (ของเดิม)", async () => {
    needSetup();
    const rs = await Promise.all(Array.from({ length: 10 }, () => LN().cancelByShop(cW, ap.A1)));
    eq(rs.filter((r: Any) => r?.ok).length, 1, "สำเร็จ");
    await parkOutbox();
    const ev = await evRow(ids.tA, `booking.cancelled#${ap.A1}`);
    eq(ev.length, 1, "event");
    cancelEvt = ev[0];
    const s = await BK().findSlots(cW, { serviceId: svc("W", "cut"), staffId: stf("W", 1), dateStr: D, channel: "LINE" });
    ok((s as Any[]).some((x) => x.startMin === 840), "14:00 ไม่ว่าง");
  });
  let m1 = 0;
  await st("C-1", "consumer ×3 + tick ×2 พร้อมกัน ⇒ P1 (ช่างหนึ่ง 14–15) 1 ข้อความ · P2 (ใครก็ได้) 1 · P3 (ช่างสอง) 0 · P4 (16–17) 0 · P5 (ดัดผม 120 นาทีไม่พอ) 0 · P6 (ออกแล้ว) 0", async () => {
    needSetup();
    ok(cancelEvt, "ไม่มี event (PC-8)");
    m1 = mark();
    await quiet(() => Promise.all([WL.ev(cancelEvt, { now: now0() }), WL.ev(cancelEvt, { now: now0() }), WL.ev(cancelEvt, { now: now0() }), WL.tick(now0(), { tenantIds: [ids.tA] }), WL.tick(now0(), { tenantIds: [ids.tA] })]));
    eq(["P1", "P2", "P3", "P4", "P5", "P6"].map((k) => pushesTo(PTY[k].ext, m1).length), [1, 1, 0, 0, 0, 0], "จำนวนข้อความ P1–P6");
  });
  await st("C-2", `dedupeKey ตรงสัญญา (${SC.dedupeKey("<entry>", "<staff>", 0).replace(/:0$/, ":<m>")}) · แถว log ของ E1/E2 อย่างละ 1 SENT · ไม่มีแถวของ E3–E6`, async () => {
    needSetup();
    ok(E.E1 && E.E2, "ไม่มี entry E1/E2 (W-4/W-5)");
    eq((await logRows(ids.tA, `booking:waitlistOpen:${E.E1}:%`)).map((r) => [r.dedupeKey, r.status]), [[KEY(E.E1, stf("W", 1), D, "14:00"), "SENT"]], "E1");
    eq((await logRows(ids.tA, `booking:waitlistOpen:${E.E2}:%`)).map((r) => [r.dedupeKey, r.status]), [[KEY(E.E2, stf("W", 1), D, "14:00"), "SENT"]], "E2");
    for (const k of ["E3", "E4", "E5", "E6"]) eq((await logRows(ids.tA, `booking:waitlistOpen:${E[k]}:%`)).length, 0, k);
  });
  await st("C-3", "ซ้ำ/ซ้อนอีกรอบ (consumer ×2 + tick ×2) ⇒ ไม่มีข้อความใหม่ (X4/X5)", async () => {
    needSetup();
    const m0 = mark();
    await quiet(() => Promise.all([WL.ev(cancelEvt, { now: now0() }), WL.ev(cancelEvt, { now: now0() }), WL.tick(now0(), { tenantIds: [ids.tA] }), WL.tick(now0(), { tenantIds: [ids.tA] })]));
    eq(FAKE.slice(m0).filter((r) => r.path === "/v2/bot/message/push").length, 0, "push ใหม่");
  });
  await st("C-4", "ข้อความถึง P1: ชื่อ P1 · ชื่อหน่วย · 14:00 · ชื่อช่าง · ลิงก์หน้าจอง /s/<ร้าน>/<สาขา>?svc=…&staff=…&date=…&time=14:00&who=<ตัวตน P1> · ไม่มีเบอร์ · ไม่มีชื่อคนอื่น", async () => {
    needSetup();
    const ps = pushesTo(PTY.P1.ext, m1);
    eq(ps.length, 1, "ข้อความถึง P1 (C-1)");
    const t = msgText(ps[0]);
    ok(t.includes(PTY.P1.name) && t.includes(UNITS.W.name) && t.includes("14:00") && t.includes(STAFF_NAME("W", 1)), `ข้อความ: ${t.slice(0, 160)}`);
    const um = /(https?:\/\/[^\s]+|\/s\/[^\s]+)/.exec(t);
    ok(um, "ไม่มีลิงก์");
    const u = new URL(um![1], "http://x.invalid");
    eq(u.pathname, `/s/${SLUGS[ids.tA]}/${UNITS.W.slug}`, "path");
    eq([u.searchParams.get("svc"), u.searchParams.get("staff"), u.searchParams.get("date"), u.searchParams.get("time")], [svc("W", "cut"), stf("W", 1), D, "14:00"], "query");
    const v = need(slLoad, "signed-link").verifyLink(u.searchParams.get("who") ?? "", "booking.identity");
    eq([v?.tenantId, v?.subjectId], [ids.tA, PTY.P1.id], "ตัวตนในลิงก์");
    eq(phoneLeak(t), [], "เบอร์");
    ok(!NAMES.filter((n) => n !== PTY.P1.name).some((n) => t.includes(n)), "มีชื่อคนอื่น");
  });
  await st("C-5", "FIRST (หน่วย F): ยกเลิก F1 + consumer ×3 พร้อมกัน ⇒ EF1 (บล็อก) ไม่ได้ (แถว SKIPPED_CONSENT) · EF2 ได้ 1 · EF3 0 · tick ซ้ำ ⇒ EF3 ยัง 0", async () => {
    needSetup();
    const c = await LN().cancelByShop(ctxOf("F"), ap.F1);
    ok(c?.ok, `ยกเลิก: ${c?.code}`);
    await parkOutbox();
    const [ev] = await evRow(ids.tA, `booking.cancelled#${ap.F1}`);
    const m0 = mark();
    await quiet(() => Promise.all([WL.ev(ev, { now: now0() }), WL.ev(ev, { now: now0() }), WL.ev(ev, { now: now0() })]));
    await quiet(() => WL.tick(now0(), { tenantIds: [ids.tA] }));
    eq(["PF1", "PF2", "PF3"].map((k) => pushesTo(PTY[k].ext, m0).length), [0, 1, 0], "PF1–PF3");
    eq((await logRows(ids.tA, `booking:waitlistOpen:${E.EF1}:%`)).map((r) => r.status), ["SKIPPED_CONSENT"], "EF1");
    eq((await logRows(ids.tA, `booking:waitlistOpen:${E.EF3}:%`)).length, 0, "EF3");
  });
  await st("C-6", "รับข้อเสนอผ่านทางจองปกติเท่านั้น: P1 จอง 14:00 ช่างหนึ่ง (bookOnline LINE) ⇒ ok · P2 จองเวลาเดียวกัน ⇒ FULL (กันจองซ้อน) · tick ⇒ E1 = BOOKED (endReason BOOKED) · E2 ยัง ACTIVE", async () => {
    needSetup();
    const a = await ON().bookOnline(W, { serviceId: svc("W", "cut"), staffId: stf("W", 1), dateStr: D, startMin: hm("14:00"), who: whoOf("P1"), idempotencyKey: `b17-${RUN}-c6a` }, { ip: nextIp() });
    ok(a?.ok, `P1: ${a?.code} ${a?.reason}`);
    const b = await ON().bookOnline(W, { serviceId: svc("W", "cut"), staffId: stf("W", 1), dateStr: D, startMin: hm("14:00"), who: whoOf("P2"), idempotencyKey: `b17-${RUN}-c6b` }, { ip: nextIp() });
    eq([b?.ok, b?.code], [false, "FULL"], "P2");
    await parkOutbox();
    await quiet(() => WL.tick(now0(), { tenantIds: [ids.tA] }));
    const r1 = await wlRow(E.E1);
    eq([r1?.status, r1?.endReason], ["BOOKED", "BOOKED"], "E1");
    eq((await wlRow(E.E2))?.status, "ACTIVE", "E2");
  });
  await st("C-7", "มัดจำบังคับยังมีผลกับคนที่ได้ข้อเสนอ: ยกเลิก R1 ⇒ PR ได้ข้อความ 1 · PR จองเวลานั้นผ่านลิงก์ ⇒ มัดจำ ฿50 · PENDING", async () => {
    needSetup();
    const c = await LN().cancelByShop(R, ap.R1);
    ok(c?.ok, `ยกเลิก: ${c?.code}`);
    await parkOutbox();
    const [ev] = await evRow(ids.tA, `booking.cancelled#${ap.R1}`);
    const m0 = mark();
    await quiet(() => WL.ev(ev, { now: now0() }));
    eq(pushesTo(PTY.PR.ext, m0).length, 1, "ข้อความถึง PR");
    const r = await ON().bookOnline(refOf("R"), { serviceId: svc("R", "cut"), staffId: stf("R", 1), dateStr: D, startMin: hm("14:00"), who: whoOf("PR"), idempotencyKey: `b17-${RUN}-c7` }, { ip: nextIp() });
    ok(r?.ok, `จอง: ${r?.code} ${r?.reason}`);
    eq([r.depositSatang, r.status], [5000, "PENDING"], "มัดจำ/สถานะ");
  });
  await st("C-8", "เลื่อนนัดปล่อยช่องเดิม: ร้านเลื่อน A2 (ช่างหนึ่ง 14:30 → 18:00) ⇒ consumer ของ booking.rescheduled ⇒ P2 ได้ข้อเสนอใหม่ 14:30 (คีย์ใหม่) · P1 (จองแล้ว) 0", async () => {
    needSetup();
    const r = await LN().rescheduleByShop(cW, ap.A2, { dateStr: D, startMin: hm("18:00") });
    ok(r?.ok, `เลื่อน: ${r?.code} ${r?.reason}`);
    await parkOutbox();
    const [ev] = await evRow(ids.tA, `booking.rescheduled#${ap.A2}#%`);
    ok(ev, "ไม่มี event เลื่อน");
    const m0 = mark();
    await quiet(() => Promise.all([WL.ev(ev, { now: now0() }), WL.ev(ev, { now: now0() })]));
    eq([pushesTo(PTY.P2.ext, m0).length, pushesTo(PTY.P1.ext, m0).length], [1, 0], "P2 · P1");
    ok(msgText(pushesTo(PTY.P2.ext, m0)[0]).includes("14:30"), "เวลา 14:30");
    ok((await logRows(ids.tA, KEY(E.E2, stf("W", 1), D, "14:30"))).length === 1, "คีย์ 14:30 ของ E2");
  });
  await st("C-9", "ไม่มาตามนัด (setAppointmentStatus NO_SHOW ทางเดิม · นัด A3 ช่างสอง 14:00) ⇒ consumer booking.no_show ⇒ P3 (ช่างสอง) ได้ 1 (14:00) · คีย์ของทุก entry ไม่ซ้ำ", async () => {
    needSetup();
    const s = await BK().setAppointmentStatus(ids.tA, UNITS.W.id, ap.A3, "NO_SHOW");
    ok(s?.ok !== false, `NO_SHOW: ${fmt(s)}`);
    await parkOutbox();
    const [ev] = await evRow(ids.tA, `booking.no_show#${ap.A3}`);
    ok(ev, "ไม่มี event ไม่มา");
    const m0 = mark();
    await quiet(() => WL.ev(ev, { now: now0() }));
    eq(pushesTo(PTY.P3.ext, m0).length, 1, "P3");
    ok(msgText(pushesTo(PTY.P3.ext, m0)[0]).includes("14:00"), "เวลา 14:00");
    const all = await logRows(ids.tA, "booking:waitlistOpen:%");
    eq(all.length, new Set(all.map((r) => r.dedupeKey)).size, "คีย์ซ้ำ");
  });
  await st("C-10", "ยกเลิกทางเดิมที่ไม่ยิง event (setAppointmentStatus CANCELLED · A5 ช่างหนึ่ง 16:00) ⇒ tick จับได้เอง · ปิดข้อความ (msg.enabled.waitlistOpen = false) ⇒ ไม่ส่ง · เปิดคืน ⇒ P4 ได้ 1", async () => {
    needSetup();
    const s = await BK().setAppointmentStatus(ids.tA, UNITS.W.id, ap.A5, "CANCELLED");
    ok(s?.ok !== false, `CANCELLED: ${fmt(s)}`);
    eq((await evRow(ids.tA, `booking.cancelled#${ap.A5}`)).length, 0, "ตัวควบคุม: ทางเดิมไม่ยิง event");
    const en = SET().getDef(SC.settings.enabled)?.defaults?.BARBER ?? {};
    await sv(ids.tA, UNITS.W.id, SC.settings.enabled, { ...Object.fromEntries(Object.keys(en).map((k) => [k, true])), waitlistOpen: false });
    const m0 = mark();
    try {
      await quiet(() => WL.tick(now0(), { tenantIds: [ids.tA] }));
      eq(pushesTo(PTY.P4.ext, m0).length, 0, "ปิดข้อความ");
    } finally { await svClear(ids.tA, UNITS.W.id, SC.settings.enabled); }
    await quiet(() => WL.tick(now0(), { tenantIds: [ids.tA] }));
    eq(pushesTo(PTY.P4.ext, m0).length, 1, "เปิดคืน");
    ok(msgText(pushesTo(PTY.P4.ext, m0)[0]).includes("16:00"), "เวลา 16:00");
  });
  const DQ = addDays(D, -1);
  await st("C-11", "เวลาเงียบ (หน่วย Q 21:00–08:00): ยกเลิก Q1/Q3/Q5 · consumer ตอน 22:30 ⇒ ไม่ส่ง (แถว SKIPPED_QUIET) · PQ2 ออก · คนอื่นจองช่อง 18:00 · tick 23:30 ⇒ 0 · tick 08:01 ⇒ PQ1 1 · PQ2 0 (ออกแล้ว) · PQ3 0 (ช่องถูกจอง) · tick 08:02 ⇒ ไม่ซ้ำ", async () => {
    needSetup();
    const cQ = ctxOf("Q");
    const m0 = mark();
    for (const a of ["Q1", "Q3", "Q5"]) { const c = await LN().cancelByShop(cQ, ap[a]); ok(c?.ok, `ยกเลิก ${a}`); }
    await parkOutbox();
    for (const a of ["Q1", "Q3", "Q5"]) { const [ev] = await evRow(ids.tA, `booking.cancelled#${ap[a]}`); await quiet(() => WL.ev(ev, { now: at(DQ, "22:30") })); }
    eq(["PQ1", "PQ2", "PQ3"].map((k) => pushesTo(PTY[k].ext, m0).length), [0, 0, 0], "22:30");
    eq((await logRows(ids.tA, `booking:waitlistOpen:${E.EQ1}:%`)).map((r) => r.status), ["SKIPPED_QUIET"], "แถว EQ1");
    const lv = await WL.leave(refOf("Q"), { entryId: E.EQ2, who: whoOf("PQ2") }, { ip: nextIp() });
    ok(lv?.ok, "PQ2 ออก");
    await book("Q", 1, "cut", "18:00");
    await quiet(() => WL.tick(at(DQ, "23:30"), { tenantIds: [ids.tA] }));
    eq(["PQ1", "PQ2", "PQ3"].map((k) => pushesTo(PTY[k].ext, m0).length), [0, 0, 0], "23:30");
    await quiet(() => WL.tick(at(D, "08:01"), { tenantIds: [ids.tA] }));
    eq(["PQ1", "PQ2", "PQ3"].map((k) => pushesTo(PTY[k].ext, m0).length), [1, 0, 0], "08:01");
    await quiet(() => WL.tick(at(D, "08:02"), { tenantIds: [ids.tA] }));
    eq(pushesTo(PTY.PQ1.ext, m0).length, 1, "08:02");
  });

  // ═══════════════ X · แยกร้าน ═══════════════
  console.log("\n── X: แยกร้าน ──");
  await st("X-1", "ยกเลิก B1 (ร้านบี) · event ปลอมของร้านเอที่ชี้นัดร้านบี ⇒ PB 0 · tick จำกัดร้านเอ ⇒ PB 0 · event จริงของร้านบี ⇒ PB 1", async () => {
    needSetup();
    const c = await LN().cancelByShop(ctxOf("B"), ap.B1);
    ok(c?.ok, `ยกเลิก: ${c?.code}`);
    await parkOutbox();
    const [ev] = await evRow(ids.tB, `booking.cancelled#${ap.B1}`);
    const m0 = mark();
    await quiet(() => WL.ev({ ...ev, tenantId: ids.tA, unitId: UNITS.W.id }, { now: now0() }));
    await quiet(() => WL.tick(now0(), { tenantIds: [ids.tA] }));
    eq(pushesTo(PTY.PB.ext, m0).length, 0, "ข้ามร้าน");
    eq((await logRows(ids.tA, `booking:waitlistOpen:${E.EB}:%`)).length, 0, "แถว log ใต้ร้านเอ");
    await quiet(() => WL.ev(ev, { now: now0() }));
    eq(pushesTo(PTY.PB.ext, m0).length, 1, "ร้านบี");
  });

  // ═══════════════ E · งานรายนาที ═══════════════
  console.log("\n── E: งานรายนาที ──");
  await st("E-1", "หมดอายุทีละหน้าจนหมด (keyset · pageSize 5): entry ACTIVE ที่ expiresAt ผ่านแล้ว 12 แถว ⇒ tick ครั้งเดียว EXPIRED ครบ 12 · ไม่มีข้อความ", async () => {
    needSetup();
    ok(hasTable, "ไม่มีตาราง (T-1)");
    const past = new Date(Date.now() - 60_000);
    for (let i = 0; i < 12; i++) {
      await insertRow(SC.table, { id: T(`exp${String(i).padStart(2, "0")}`), tenantId: ids.tA, unitId: UNITS.X.id, partyId: PTY.P5.id, serviceId: svc("X", "cut"), staffId: null, dateStr: TODAY, fromMin: 0, toMin: 1, status: "ACTIVE", expiresAt: past, updatedAt: new Date() });
    }
    const m0 = mark();
    const r = await quiet(() => WL.tick(now0(), { tenantIds: [ids.tA], pageSize: 5 }));
    ok(typeof r?.expired === "number" && r.expired >= 12, `expired = ${fmt(r)}`);
    eq((await q<Any>(`SELECT count(*)::int AS n FROM "${SC.table}" WHERE "tenantId" = $1 AND id LIKE $2 AND status = 'EXPIRED'`, [ids.tA, `svcb17_exp%_${RUN}`]))[0].n, 12, "EXPIRED");
    eq(FAKE.slice(m0).filter((x) => x.path === "/v2/bot/message/push").length, 0, "push");
  });
  await st("E-2", "หลังหน้าต่างทุกช่อง (tick ตอน 21:00 วัน D ทั้งสองร้าน) ⇒ entry ACTIVE ของวัน D = EXPIRED ทั้งหมด (endReason EXPIRED) · ไม่มีข้อความ", async () => {
    needSetup();
    const m0 = mark();
    await quiet(() => WL.tick(at(D, "21:00"), { tenantIds: [ids.tA, ids.tB] }));
    eq((await q<Any>(`SELECT count(*)::int AS n FROM "${SC.table}" WHERE "tenantId" = ANY($1::text[]) AND "dateStr" = $2 AND status = 'ACTIVE'`, [[ids.tA, ids.tB], D]))[0].n, 0, "ACTIVE ที่เหลือ");
    eq((await wlRow(E.E2))?.endReason, "EXPIRED", "E2");
    eq(FAKE.slice(m0).filter((x) => x.path === "/v2/bot/message/push").length, 0, "push");
  });
  await st("E-3", "signal ถูกยกเลิกแล้ว ⇒ tick คืนผลทันทีไม่ throw", async () => {
    needSetup();
    const ac = new AbortController();
    ac.abort();
    const r = await quiet(() => WL.tick(now0(), { tenantIds: [ids.tA], signal: ac.signal }));
    ok(r && typeof r === "object", `ผล: ${fmt(r)}`);
  }, "MAJOR");

  // ═══════════════ X8 · PII ═══════════════
  await st("X-2", "PII: ServiceMessageLog · OutboxEvent · AuditLog · แถว waitlist · ผลคืนทุกฟังก์ชัน · console ระหว่างเรียก ⇒ ไม่มีเบอร์/ชื่อ · ไม่มีคำขอออกนอกเครื่อง", async () => {
    needSetup();
    const TT = [ids.tA, ids.tB];
    const bad: string[] = [];
    const chk = (what: string, s: string, names = true) => { const l = phoneLeak(s); if (l.length) bad.push(`${what}: เบอร์ …${l[0].slice(-4)}`); if (names && NAMES.some((n) => s.includes(n))) bad.push(`${what}: ชื่อ`); };
    chk("ServiceMessageLog", js(await q<Any>(`SELECT "dedupeKey", status FROM "ServiceMessageLog" WHERE "tenantId" = ANY($1::text[])`, [TT])));
    chk("OutboxEvent", js(await q<Any>(`SELECT payload::text AS p FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND type LIKE 'booking.%'`, [TT])));
    chk("AuditLog", js(await q<Any>(`SELECT coalesce("after"::text,'') || coalesce("before"::text,'') AS a FROM "AuditLog" WHERE "tenantId" = ANY($1::text[]) AND action LIKE 'booking.%'`, [TT])));
    if ((await cols(SC.table)).length) chk("waitlist", js(await q<Any>(`SELECT * FROM "${SC.table}" WHERE "tenantId" = ANY($1::text[])`, [TT])));
    chk("ผลคืน", js(RESULTS));
    chk("console", captured.join("\n"));
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
    eq(BLOCKED, [], "คำขอนอกเครื่อง");
  });
  await st("Q-1", "ร้าน svcqc ไม่ถูกแตะ (ค่าตั้ง · แม่แบบ · นัด · ข้อความ waitlist เท่าก่อนรัน)", async () => {
    eq(await svcqcPrint(), printBefore, "ลายนิ้วมือ svcqc");
    ok(SQC_UNITS.barber.id.startsWith("svcqc"), "ข้อมูลฉาก svcqc");
  }, "MAJOR");
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  try { await cleanup([ids.tA, ids.tB]); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupUsers();
  await cleanupBuckets();
  await st("Z-1", "หลังล้าง: tenant `qc-svc-b17-*` 0 · นัด/outbox/log ข้อความ/ผู้ติดต่อ/ค่าตั้ง/audit/waitlist ของร้านทดสอบ 0 · ผู้ใช้ทดสอบ 0 · rate bucket ของรอบ 0", async () => {
    eq((await q<Any>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0].n, 0, "tenant");
    for (const t of ["Appointment", "OutboxEvent", "ServiceMessageLog", "ChatContact", "ChatChannelConnection", "SettingValue", "AuditLog", "Party", SC.table]) {
      if (!(await cols(t)).length) continue;
      eq((await q<Any>(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [[ids.tA, ids.tB]]))[0].n, 0, t);
    }
    eq((await q<Any>(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, [`${USER_MAIL}%`]))[0].n, 0, "user");
    eq((await q<Any>(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE $1`, [`%10.17.${IPN}.%`]))[0].n, 0, "rate bucket");
  }, "MAJOR");
  await pool.end();
  globalThis.fetch = REAL_FETCH;
  if (LINE_API_BASE_SAVED === undefined) delete process.env.LINE_API_BASE; else process.env.LINE_API_BASE = LINE_API_BASE_SAVED;
  server.close();
}

// ═══════════════ S. ไฟล์ · สัญญาโค้ด ═══════════════
console.log("\n── S: ไฟล์ · สัญญาโค้ด ──");
{
  const ch = dirty(["src", "prisma"]);
  const headHas = git(["ls-tree", "--name-only", "HEAD", "--", F.wl]).trim() === F.wl;
  if (ch.length === 0 && headHas) skip("S-1", "แตะเฉพาะไฟล์ของใบ", "B.17 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ");
  else await st("S-1", "แตะเฉพาะไฟล์ของใบ (§1 · migration *_svc_b17 ได้เมื่อ R1-ก) · มีไฟล์ใหม่ครบ 4 ไฟล์", () => {
    const outside = ch.filter((f) => !OWN.has(f) && !/^prisma\/migrations\/[^/]*_svc_b17\//.test(f));
    ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 6).join(", ")}`);
    const miss = NEW_FILES.filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
}
await st("S-2", "ไม่แตะไฟล์ต้องห้าม: ทรัพยากร/ตัววางคิว (เลน B.13) · queue-line/today-line/line-ops/public-line/deposit · notify-customer/booking-notify/booking-line-link/postback-routes · แชท · เครื่องยนต์ค่าตั้ง · ทะเบียนป้าย event", () => {
  eq(dirty(FROZEN), [], "ไฟล์ที่แตะ");
});
await st("S-3", "ไฟล์ใหม่: ไม่เรียกตัวส่ง LINE ตรง · platform ส่งผ่าน notifyCustomer + precheck · ไฟล์ในโมดูลไม่ import prisma ดิบ (F5) · ไม่มีเวลาเครื่องดิบ · ไม่มี console.* · ไม่ฮาร์ดโค้ด 90/180 วัน", () => {
  const miss = [F.wl, F.rule, F.plat].filter((f) => !existsSync(join(ROOT, f)));
  ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  const bad: string[] = [];
  for (const f of [F.wl, F.rule, F.plat]) {
    const c = stripComments(src(f));
    const m = /\b(pushLineMessagesToContact|pushFlexToParty|sendLineToParty|pushToContact|replyFlex)\b|api\.line\.me/.exec(c);
    if (m) bad.push(`${f}: ${m[0]}`);
    if (/\.(getDay|getHours|getMinutes|getDate|getMonth|getFullYear)\s*\(\s*\)/.test(c)) bad.push(`${f}: เวลาเครื่องดิบ`);
    if (/\bconsole\s*\./.test(c)) bad.push(`${f}: console`);
    if (/\b(90|180)\b/.test(c)) bad.push(`${f}: เลข 90/180`);
  }
  for (const f of [F.wl, F.rule]) if (/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["']@\/lib\/core\/db["']/.test(stripComments(src(f)))) bad.push(`${f}: import prisma ดิบ`);
  const p = stripComments(src(F.plat));
  if (!/\bnotifyCustomer\s*\(/.test(p) || !/\bprecheck\b/.test(p)) bad.push(`${F.plat}: ไม่เรียก notifyCustomer พร้อม precheck`);
  if (/bypassQuiet\s*:\s*true/.test(p)) bad.push(`${F.plat}: bypassQuiet`);
  ok(bad.length === 0, bad.join(" · "));
}, "MAJOR");
await st("S-4", `service.ts: ${PROTECTED_FNS.join(" · ")} เท่า HEAD ทุกไบต์ · บรรทัดเดิมที่ลบ ≤ 10 · มีบล็อก // SVC B.17`, () => {
  const fnText = (s: string, name: string): string => {
    const i = s.search(new RegExp(`(export\\s+)?(async\\s+)?function\\s+${name}\\s*\\(`));
    if (i < 0) return "";
    const j = s.slice(i + 10).search(/\n(export\s+)?(async\s+)?function\s|\n\/\*\*|\nconst\s|\nexport\s+(type|const)\s/);
    return j < 0 ? s.slice(i) : s.slice(i, i + 10 + j);
  };
  const head = git(["show", `HEAD:${F.service}`]);
  const cur = src(F.service);
  const diffFns = PROTECTED_FNS.filter((n) => fnText(head, n) !== fnText(cur, n));
  ok(diffFns.length === 0, `เปลี่ยน: ${diffFns.join(", ")}`);
  const removed = git(["diff", "-U0", "HEAD", "--", F.service]).split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---") && l.slice(1).trim() !== "");
  ok(removed.length <= 10, `ลบ/แก้บรรทัดเดิม ${removed.length} บรรทัด`);
  ok(/SVC B\.17/.test(cur), "ไม่มีบล็อก SVC B.17 (bookAppointment ยังไม่บังคับกติกา)");
});
await st("S-5", "ต่อสาย: outbox-consumers compose onWaitlistEvent ใน booking.cancelled · booking.rescheduled · booking.no_show (ของเดิมยังอยู่) · minute-jobs มี booking.waitlist.tick ทุก 1 นาที (lazy import) · ค่าตั้งอ่านจากทะเบียน", () => {
  const c = stripComments(src(F.consumers));
  const bad: string[] = [];
  for (const t of ["booking.cancelled", "booking.rescheduled", "booking.no_show"]) {
    const i = c.indexOf(`"${t}":`);
    const line = i < 0 ? "" : c.slice(i, c.indexOf("\n  \"", i + 5) > 0 ? c.indexOf("\n  \"", i + 5) : i + 1200);
    if (!/onWaitlistEvent/.test(line)) bad.push(`${t}: ไม่มี onWaitlistEvent`);
  }
  if (!/forfeitAfterLateCancel/.test(c) || !/onBookingNotifyEvent/.test(c) || !/memberApptBridge\("onBookingNoShow"\)/.test(c)) bad.push("ของเดิมหาย");
  const m = stripComments(src(F.minute));
  const k = m.indexOf(`"${SC.minuteJob}"`);
  if (k < 0 || !/everyMinutes:\s*1\b/.test(m.slice(k, k + 300)) || !/import\(\s*["']@\/lib\/platform\/booking-waitlist["']\s*\)/.test(m.slice(k, k + 400))) bad.push(`minute-jobs ไม่มี ${SC.minuteJob}`);
  const w = stripComments(src(F.wl)) + stripComments(src(F.plat));
  for (const key of [SC.settings.mode, SC.settings.maxActive]) if (!w.includes(key)) bad.push(`ไม่อ่าน ${key}`);
  if (!stripComments(src(F.rule)).includes(SC.settings.repeatNoShow)) bad.push(`no-show-rule ไม่อ่าน ${SC.settings.repeatNoShow}`);
  ok(bad.length === 0, bad.join(" · "));
}, "MAJOR");
await st("S-6", "action สาธารณะ: \"use server\" บรรทัดแรก · export async function เท่านั้น · ip จาก x-forwarded-for · เรียก joinWaitlistOnline/leaveWaitlistOnline · excuseNoShowAction ใน actions/booking.ts + BOOKING_ACTIONS = booking.deposit.waive · คอมโพเนนต์ไม่ import ค่าจาก modules/db", () => {
  const a = src(F.action);
  ok(!!a, `ยังไม่มี ${F.action}`);
  ok(/^\s*["']use server["']/.test(a), "ไม่มี use server บรรทัดแรก");
  const code = stripComments(a);
  ok(!/export\s+(const|let|type|interface|default|class|function\s)/.test(code.replace(/export\s+async\s+function/g, "")), "export อื่น");
  ok(/x-forwarded-for/.test(code) && /joinWaitlistOnline\s*\(/.test(code) && /leaveWaitlistOnline\s*\(/.test(code), "ip/การเรียก");
  ok(/export\s+async\s+function\s+excuseNoShowAction\s*\(/.test(stripComments(src(F.actions))), "ไม่มี excuseNoShowAction");
  ok(/excuseNoShowAction["']?\s*:\s*\[\s*["']booking\.deposit\.waive["']\s*\]/.test(stripComments(src(F.access))), "BOOKING_ACTIONS");
  const imps = valueImports(src(F.comp));
  ok(!imps.some((p) => /^@\/lib\/(modules|platform)\/|^@\/lib\/core\/db|^@prisma\/client/.test(p)), `คอมโพเนนต์ import ต้องห้าม: ${imps.join(", ")}`);
}, "MAJOR");

// ═══════════════ G. regression (หลังล้างข้อมูล) ═══════════════
console.log("\n── G: regression (b.3 · b.4 · b.7 · b.8 · b.9 · smoke) ──");
const judgeSvc = (allowFail: (id: string) => boolean, allowSkip: (id: string) => boolean) => (out: string) => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return false;
  try {
    const j = JSON.parse(line.slice(13)) as { failed: string[]; skipped?: string[] };
    return j.failed.every(allowFail) && (j.skipped ?? []).every(allowSkip);
  } catch { return false; }
};
const fileCheck = (x: string) => ["S-1", "S-2", "ST-1"].includes(x);
const REG: { s: string; args?: string[]; env?: Record<string, string>; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-svc-b.3", env: { SVC_B3_NO_REGRESSION: "1" }, judge: judgeSvc(fileCheck, (x) => /^(G|H|V|Q)-/.test(x) || fileCheck(x)), note: "ไม่มี FAIL ยกเว้นข้อไฟล์สกปรกระหว่างทำ" },
  { s: "qc-svc-b.4", args: ["--no-regression"], judge: judgeSvc(fileCheck, (x) => /^(G|H|V|Q)-/.test(x) || fileCheck(x)), note: "ไม่มี FAIL ยกเว้น ST-1" },
  { s: "qc-svc-b.7", args: ["--no-regression"], judge: judgeSvc(fileCheck, (x) => /^(G|H|V|Q)-/.test(x) || fileCheck(x)), note: "ไม่มี FAIL ยกเว้น S-1/S-2" },
  { s: "qc-svc-b.8", args: ["--no-regression"], judge: judgeSvc(fileCheck, (x) => /^(G|H|V|Q)-/.test(x) || fileCheck(x)), note: "ไม่มี FAIL ยกเว้น S-1/S-2" },
  { s: "qc-svc-b.9", args: ["--no-regression"], judge: judgeSvc(fileCheck, (x) => /^(G|H|V|Q)-/.test(x) || fileCheck(x)), note: "ไม่มี FAIL ยกเว้น S-1/S-2 (ต้อง ORACLE-EDIT ค่าเริ่ม msg.enabled ตาม R2 ก่อน)" },
  { s: "qc-svc-smoke" },
];
{
  const why = !hasWork ? "ยังไม่มีงานของใบ (waitlist.joinWaitlistOnline · no-show-rule.repeatNoShowOf · booking-waitlist.runWaitlistTick) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_B17_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.args?.length ? ` ${g.args.join(" ")}` : ""}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t0 = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: { ...process.env, ...(g.env ?? {}) }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 45 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-b17-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(all, r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t0) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC B.17 · waitlist + ไม่มาซ้ำ =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: G-* เมื่อ --no-regression · S-1 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length + skipped.filter((c) => c.id !== "S-1").length > 0 ? 1 : 0);
