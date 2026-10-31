// QC — SVC B.8 · มัดจำรุ่นแรก (จองคิว) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-b.8.md (§2 ค่าตั้ง · §3 สัญญา · §4 DOM · §6 เงิน · §8 จุดที่เลือกเอง) · ledger/SVC-MASTER-PLAN.md แถว B.8
//        ledger/DESIGN-BOOKING-QUEUE.md ภาคผนวก ก #33–37 · ภาพ ledger/design-booking/03-online-booking.png (ค) · 08-settings.png (มัดจำ)
//
// กลุ่มข้อ:
//   T  ข้อมูล (ร้าน A 3 สาขา: o = มีตัวต่อตรวจสลิป FAKE + อนุมัติอัตโนมัติ · m = ตรวจมือ · x = สาขาที่สาม · ร้าน B) · PC ตัวควบคุม (เขียวก่อนมีงาน)
//   K  ค่าตั้ง (คีย์ใหม่ lateCancelMode · snapshot) · P หน้าจ่าย + แนบสลิป (สาธารณะ · X7) · A เงินเข้า (consumer สลิปอนุมัติ)
//   E  หมดเวลาถือช่อง · S2 จอร้าน (คิว · ยืนยัน · คืน · สิทธิ์สด) · F ริบ/คืน/ยกเลิกช้า · M ยกเว้นสมาชิก · BL ใช้มัดจำในบิล (B.10)
//   L  บัญชีรวม (Σdr=Σcr · ใบรับต่อนัด) · X ยิงพร้อมกันข้ามโพรเซส (X3/X4/X5) · XS ข้ามร้าน/ข้ามหน่วย · EV event + PII · RL rate limit
//   U  DOM · H server จริง (QC_BASE) · V ภาพ 03ค · S ไฟล์/สัญญาโค้ด · G regression (หลังล้าง) · Z ล้าง
//
// เงิน: ทุกยอดเป็นสตางค์ · VAT แยกจากยอดรวม (splitIncludedVat 7%) · GL อ่านจาก AccountJournalEntry refType PosSale ของใบรับ/บิลริบ/ใบคืน/บิลขาย
// เวลา: วันนัด = วันนี้ไทย + 2 … + 29 (ร้านเปิดทุกวัน 10–20) · ถือช่องปกติ payWithinMin 1440 (ไม่ถูกปล่อยระหว่างทดสอบ) · ฉากหมดเวลาจองตอนตั้ง 1 นาทีแล้วคืนค่า
// ร้านทดสอบ slug `qc-svc-b8-*` · id/IP/อีเมลขึ้นต้น `svcb8`/`svc-b8-` · ลบใน finally (+ กวาดค้างตอนเริ่ม)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.8.mts [--no-regression]
//      (ห้าม timeout ครอบ · `--no-regression` = ข้าม G เป็น SKIP ซึ่งไม่นับผ่าน · QC_BASE=http://127.0.0.1:<port> เปิดหมวด H/V)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { createHash, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_VISUAL_SPECS, sqcIdentityToken, sqcManageToken } from "./svc-qc-data.mjs";

type Any = any;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const LABEL = "qc-svc-b.8";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_B8_NO_REGRESSION === "1";
const F = {
  deposit: "src/lib/modules/booking/deposit.ts",
  service: "src/lib/modules/booking/service.ts",
  online: "src/lib/modules/booking/online.ts",
  index: "src/lib/modules/booking/index.ts",
  access: "src/lib/modules/booking/access.ts",
  defs: "src/lib/core/settings/defs/booking.ts",
  consumers: "src/lib/outbox-consumers.ts",
  autoLabels: "src/lib/automation/labels.ts",
  hookLabels: "src/lib/webhooks/labels.ts",
  perms: "src/lib/core/permissions.ts",
  compBooking: "src/components/public-booking.tsx",
  compManage: "src/components/booking/online/ManageCard.tsx",
  pageManage: "src/app/(store)/bq/m/[token]/page.tsx",
  actManage: "src/app/(store)/bq/m/actions.ts",
  actShop: "src/lib/actions/booking.ts",
  pageShop: "src/app/app/u/[unitSlug]/booking/page.tsx",
  minute: "src/lib/platform/minute-jobs.ts",
  dict: "src/lib/i18n/dict.ts",
} as const;
const NEW_EVENTS = ["booking.deposit_paid", "booking.deposit_forfeited", "booking.deposit_refunded"] as const;

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc (ep-mute-scene) ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
// env ของรอบ (ลูกโพรเซสสืบทอดค่าเดียวกัน — ตั้งเฉพาะเมื่อยังไม่มี)
if (!process.env.INTEGRATIONS_CREDENTIALS_KEY) process.env.INTEGRATIONS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
process.env.INTEGRATIONS_FAKE = "1";
for (const k of ["SHARK_BUNNY_ZONE", "SHARK_BUNNY_KEY", "SHARK_BUNNY_CDN"]) delete process.env[k]; // storage จริงห้ามถูกยิง — ทุกสลิปใช้ deps.put ของข้อสอบ

// ═══════════════ ตัวช่วย ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 260) ?? String(v); } catch { return String(v); } };
const ok = (cond: boolean, why: string): void => { if (!cond) throw new AssertFail(why); };
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
const tryImport = async (spec: string): Promise<{ mod: Any; err: string }> => {
  try { return { mod: await import(spec), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const MIN = 60_000;
const addDays = (ds: string, n: number): string => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const bkkToday = (): string => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const bkkMs = (ds: string, min: number): number => { const [y, m, d] = ds.split("-").map(Number); return Date.UTC(y, m - 1, d) + (min - 420) * MIN; };
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const src = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const SECRET = process.env.SESSION_SECRET ?? "";
const THAI = /[฀-๿]/;
const codeOf = (r: Any): string => (r?.ok === true ? "ok" : String(r?.code ?? (r === null ? "null" : r === undefined ? "undefined" : "?")));
const isOk = (r: Any) => r?.ok === true;

// ═══════════════ โหลดโมดูล (path ไม่ใช่ literal — next build ตรวจ scripts/*.mts) ═══════════════
const at = (rel: string) => pathToFileURL(join(ROOT, rel)).href;
const depLoad = existsSync(join(ROOT, F.deposit)) ? await tryImport(at(F.deposit)) : { mod: null, err: `ยังไม่มีไฟล์ «${F.deposit}»` };
const onlineLoad = await tryImport(at(F.online));
const bookingLoad = await tryImport("@/lib/modules/booking/service" as string);
const accessLoad = await tryImport(at(F.access));
const slipLoad = await tryImport("@/lib/payment/slip-verify" as string);
const recvLoad = await tryImport("@/lib/payment/receiver" as string);
const integLoad = await tryImport("@/lib/core/integrations" as string);
const settingsLoad = await tryImport("@/lib/core/settings" as string);
const registryLoad = await tryImport("@/lib/core/settings/registry" as string);
const consLoad = await tryImport("@/lib/outbox-consumers" as string);
const posLoad = await tryImport("@/lib/modules/pos/service" as string);
const posDepLoad = await tryImport("@/lib/modules/pos/deposit" as string);
const sysLoad = await tryImport("@/lib/modules/system/service" as string);
const accLoad = await tryImport("@/lib/modules/account/service" as string);
const glLoad = await tryImport("@/lib/modules/account/gl" as string);
const vatLoad = await tryImport("@/lib/money/vat" as string);
const dbLoad = await tryImport("@/lib/core/db" as string);
const must = (l: { mod: Any; err: string }, what: string): Any => { if (!l.mod) throw new AssertFail(`โหลด ${what} ไม่ได้ (${l.err})`); return l.mod; };
const fnOf = (l: { mod: Any; err: string }, name: string, rel: string): ((...a: Any[]) => Any) => {
  const f = l.mod?.[name];
  if (typeof f !== "function") throw new AssertFail(l.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${l.err}`);
  return f;
};
const D = (name: string) => fnOf(depLoad, name, F.deposit);
const ON = (name: string) => fnOf(onlineLoad, name, F.online);
const BK = () => must(bookingLoad, "booking/service");
const SV = () => must(slipLoad, "payment/slip-verify");
const SETTINGS = () => must(settingsLoad, "core/settings");
const CONS = () => must(consLoad, "outbox-consumers");
const P: Any = dbLoad.mod?.prisma;
const split = (g: number): { baseSatang: number; vatSatang: number } => {
  const f = vatLoad.mod?.splitIncludedVat;
  if (typeof f !== "function") throw new AssertFail("โหลด money/vat ไม่ได้");
  return f(g, 700);
};

// ═══════════════ สลิป/ไฟล์ ═══════════════
const PNG_SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = (): Uint8Array => Uint8Array.from(Buffer.concat([PNG_SIG, randomBytes(96)]));
const PUTS: string[] = [];
const put = async (path: string, _data: Uint8Array, _ct: string): Promise<void> => { PUTS.push(path); void _data; void _ct; };
const del = async (_path: string): Promise<number> => { void _path; return 200; };
const RECV_ID = "0812345678";
const fakeSlip = (o: Record<string, unknown>) => `FAKESLIP:${Buffer.from(JSON.stringify(o), "utf8").toString("base64url")}`;
let trN = 0;
const newTR = () => `B8${Date.now().toString(36)}T${String(++trN).padStart(4, "0")}${randomBytes(3).toString("hex")}`.toUpperCase();
/** สคริปต์สลิปที่ผ่านทุกข้อ (ยอด · ผู้รับ · อายุ · ชื่อผู้โอน) — ใช้กับสาขาที่มีตัวต่อ FAKE */
const goodSlip = (amountSatang: number, payerName: string, over: Record<string, unknown> = {}) =>
  fakeSlip({ status: "VALID", amountSatang, transRef: newTR(), payerName, receiverMasked: `xxx-xxx-${RECV_ID.slice(-4)}`, transferredAt: new Date(Date.now() - 5 * MIN).toISOString(), ...over });

// ═══════════════ โหมดลูกโพรเซส (ยิงพร้อมกันข้ามโพรเซส · แบบ qc-svc-b.7) ═══════════════
type CallSpec =
  | { fn: "consume"; evt: Any }
  | { fn: "consumeReg"; evt: Any }
  | { fn: "confirm"; ctx: Any; input: Any }
  | { fn: "refund"; ctx: Any; input: Any }
  | { fn: "expire"; nowMs: number }
  | { fn: "submit"; token: string; b64: string; script: string; key: string; nowMs: number; ip: string }
  | { fn: "cancel"; token: string; nowMs: number; accept: boolean; ip: string }
  | { fn: "noshow"; t: string; u: string; id: string };
type CallOut = { fn: string; ok: boolean; code: string | null; threw: string | null };
type Scenario = { key: string; calls: CallSpec[] };
type ChildSpec = { run: string; idx: number; scenarios: Scenario[] };
const goFile = (run: string, key: string) => `/tmp/svc-b8-go-${run}-${key}`;
async function runCall(c: CallSpec): Promise<CallOut> {
  const base: CallOut = { fn: c.fn, ok: false, code: null, threw: null };
  try {
    let r: Any = { ok: true };
    if (c.fn === "consume") await D("onDepositSlipApproved")(c.evt);
    else if (c.fn === "consumeReg") {
      const h = CONS().consumers?.["payment.slip.approved"];
      if (typeof h !== "function") throw new Error("ไม่มี consumer payment.slip.approved");
      await h(c.evt);
    } else if (c.fn === "confirm") r = await D("confirmDepositByShop")(c.ctx, c.input);
    else if (c.fn === "refund") r = await D("refundDepositByShop")(c.ctx, c.input);
    else if (c.fn === "expire") r = { ok: true, ...(await BK().expireDepositHolds(new Date(c.nowMs))) };
    else if (c.fn === "submit") r = await D("submitDepositSlip")(c.token, { file: { data: Uint8Array.from(Buffer.from(c.b64, "base64")), contentType: "image/png" }, qrPayload: c.script, idempotencyKey: c.key }, { now: new Date(c.nowMs), ip: c.ip, deps: { put, del } });
    else if (c.fn === "cancel") r = await ON("cancelOnline")(c.token, { now: new Date(c.nowMs), ip: c.ip, acceptForfeit: c.accept });
    else r = await BK().setAppointmentStatus(c.t, c.u, c.id, "NO_SHOW");
    return { ...base, ok: r?.ok === true, code: r?.ok === true ? null : String(r?.code ?? r?.reason ?? "?").slice(0, 60) };
  } catch (e) {
    return { ...base, threw: errMsg(e).slice(0, 160) };
  }
}
if (process.env.QC_B8_CHILD) {
  const spec = JSON.parse(process.env.QC_B8_CHILD) as ChildSpec;
  try {
    await P.$queryRawUnsafe("SELECT 1"); // อุ่น pool ก่อนบอกพร้อม
    for (const sc of spec.scenarios) {
      console.log(`READY ${sc.key}`);
      const t0 = Date.now();
      while (!existsSync(goFile(spec.run, sc.key))) { if (Date.now() - t0 > 300_000) { console.log("ABORT"); process.exit(5); } await sleep(10); }
      const outs = await Promise.all(sc.calls.map(runCall));
      console.log(`RES ${sc.key} ${JSON.stringify(outs)}`);
    }
    await P.$disconnect();
    process.exit(0);
  } catch (e) {
    console.log(`CHILD_ERR ${errMsg(e)}`);
    process.exit(3);
  }
}
const NCHILD = 5;
const goFiles: string[] = [];

// ═══════════════ คอมโพเนนต์ (renderToStaticMarkup) ═══════════════
type Comp = (props: Record<string, unknown>) => unknown;
const compOf = async (rel: string): Promise<{ c: Comp | null; why: string }> => {
  if (!existsSync(join(ROOT, rel))) return { c: null, why: `ยังไม่มี ${rel}` };
  const r = await tryImport(at(rel));
  if (!r.mod) return { c: null, why: `import ${rel} ล้ม: ${r.err}` };
  return typeof r.mod.default === "function" ? { c: r.mod.default as Comp, why: "" } : { c: null, why: `${rel} ไม่มี default export` };
};
const BookingC = await compOf(F.compBooking);
const ManageC = await compOf(F.compManage);
const React: Any = await import("react" as string);
const RDS: Any = await import("react-dom/server" as string);
const noopAct = async (_fd: FormData) => { void _fd; };
const render = (c: { c: Comp | null; why: string }, props: Record<string, unknown>): string => {
  if (!c.c) throw new AssertFail(c.why);
  return String(RDS.renderToStaticMarkup(React.createElement(c.c, props))).replace(/<!-- -->/g, "");
};
const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
const attrsOf = (openTag: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const tagName = openTag.slice(1).split(/[\s>/]/)[0];
  for (const m of openTag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:="([^"]*)")?/g)) if (m[1] !== tagName) out[m[1].toLowerCase()] = unesc(m[2] ?? "");
  return out;
};
function boxes(html: string, attr: string): { tag: string; attrs: Record<string, string>; html: string }[] {
  const out: { tag: string; attrs: Record<string, string>; html: string }[] = [];
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
    out.push({ tag, attrs: attrsOf(openTag), html: html.slice(open, end) });
  }
  return out;
}
const inputsOf = (html: string): Record<string, string>[] => [...html.matchAll(/<(?:input|textarea|select)\b[^>]*>/g)].map((m) => ({ ...attrsOf(m[0]), tag: /^<(\w+)/.exec(m[0])?.[1] ?? "" }));
const textOf = (html: string) => unesc(html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const digitsOf = (s: string) => s.replace(/[,\s]/g, "");

// ═══════════════ PII (X8) ═══════════════
const PHONES: string[] = [];
const NAMES: string[] = [];
let phoneSeq = 0;
const RUNN = (Date.now() % 1_000_000).toString().padStart(6, "0");
const newPhone = (): string => { const p = `09${RUNN.slice(0, 4)}${String(++phoneSeq).padStart(4, "0")}`; PHONES.push(p); return p; };
let nameSeq = 0;
const newName = (): string => { const n = `คุณทดสอบบีแปด${++nameSeq}ซ`; NAMES.push(n); return n; };
const dashed = (p: string) => `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
const piiLeak = (s: string): string[] => [
  ...PHONES.filter((p) => s.includes(p) || s.includes(dashed(p)) || s.includes(`+66${p.slice(1)}`) || s.includes(`66${p.slice(1)}`)),
  ...NAMES.filter((n) => s.includes(n)),
];

// ═══════════════ ฐานข้อมูล (pg ดิบสำหรับล้าง/นับ · prisma สำหรับสร้าง) ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
const SLUG = "qc-svc-b8-";
const TOKENS_USED = new Set<string>();
const tkBucket = (t: string) => `bq:manage:tk:${sha256hex(t).slice(0, 32)}`;
async function cleanup(idsToDel: string[]) {
  if (!idsToDel.length) return;
  const tables = (await q<{ table_name: string }>(`SELECT DISTINCT c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`)).map((r) => r.table_name);
  let pending = tables;
  for (let pass = 0; pass < 10 && pending.length; pass++) {
    const failed: string[] = [];
    for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [idsToDel]); } catch { failed.push(t); } }
    pending = failed;
  }
  if (pending.length) console.log(`  ⚠️ ลบไม่ได้: ${pending.join(", ")}`);
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [idsToDel]); } catch (e) { console.log(`  ⚠️ ลบ Tenant: ${errMsg(e)}`); }
}
async function cleanupGlobal() {
  try {
    await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE '%svcb8%' OR key LIKE '%qc-svc-b8-%' OR key LIKE '%b8-o-%' OR key LIKE '%b8-m-%' OR key LIKE '%b8-x-%' OR key LIKE '%b8-b-%'`);
    const keys = [...TOKENS_USED].map(tkBucket);
    if (keys.length) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key = ANY($1::text[])`, [keys]);
    await pool.query(`DELETE FROM "User" WHERE email LIKE 'svc-b8-%@shark.local'`);
  } catch (e) { console.log(`  ⚠️ ลบถัง rate/ผู้ใช้: ${errMsg(e)}`); }
}

// ═══════════════ ข้อมูลทดสอบ ═══════════════
const RUN = Date.now().toString(36);
const TODAY = bkkToday();
const OPEN: string[] = [];
for (let n = 2; n <= 29; n++) OPEN.push(addDays(TODAY, n));
const T = (k: string) => `svcb8_${k}_${RUN}`;
const ids = {
  tA: T("tA"), tB: T("tB"),
  uO: T("uO"), uM: T("uM"), uX: T("uX"), uB: T("uB"),
  PERM: T("PERM"), CUT: T("CUT"), ODD: T("ODD"), PERM_M: T("PERM_M"), CUT_M: T("CUT_M"), ODD_M: T("ODD_M"), PERM_X: T("PERM_X"), PERM_B: T("PERM_B"),
  o1: T("o1"), o2: T("o2"), o3: T("o3"), m1: T("m1"), m2: T("m2"), m3: T("m3"), x1: T("x1"), b1: T("b1"),
  PG: T("PG"), PS: T("PS"), CG: T("CG"), CS: T("CS"),
};
const STAFF: Record<string, string[]> = { [ids.uO]: [ids.o1, ids.o2, ids.o3], [ids.uM]: [ids.m1, ids.m2, ids.m3], [ids.uX]: [ids.x1], [ids.uB]: [ids.b1] };
const PERM_OF: Record<string, string> = { [ids.uO]: ids.PERM, [ids.uM]: ids.PERM_M, [ids.uX]: ids.PERM_X, [ids.uB]: ids.PERM_B };
const TENANT_OF: Record<string, string> = { [ids.uO]: ids.tA, [ids.uM]: ids.tA, [ids.uX]: ids.tA, [ids.uB]: ids.tB };
const DEP = 30_000; // ดัดผม 120 นาที ฿1,500 × แม่แบบ BARBER 20% (≥ 90 นาที) = ฿300
const ODD_DEP = 18_001; // บริการ 90 นาที ฿900.05 × 20% = 18,001 สตางค์ (ทดสอบปัดเศษ)
const GOLD = { name: "คุณทองบีแปดทดสอบ", phone: "0812348801" };
const SILVER = { name: "คุณเงินบีแปดทดสอบ", phone: "0812348802" };
PHONES.push(GOLD.phone, SILVER.phone);
NAMES.push(GOLD.name, SILVER.name);
const SLUGS: Record<string, string> = {};
const ref = (u: string) => ({ tenantSlug: SLUGS[TENANT_OF[u]], unitSlug: SLUGS[u] });
let ipSeq = 0;
const newIp = () => `svcb8-${RUN}-${++ipSeq}`;
const USERS: Record<string, string> = {};
const actorOf = (k: string, role: "OWNER" | "MANAGER" | "STAFF" = "OWNER") => ({ userId: USERS[k], role, unitAccess: ["*"], permissions: {} });
const shop = (k: string, t: string = ids.tA) => ({ tenantId: t, actorUserId: USERS[k] });
const slotIdx: Record<string, number> = {};
const TIMES = [600, 720, 840, 960];
const nextSlot = (u: string): { dateStr: string; startMin: number; staffId: string } => {
  const i = (slotIdx[u] = (slotIdx[u] ?? -1) + 1);
  const staff = STAFF[u];
  const per = staff.length * TIMES.length;
  const d = OPEN[Math.floor(i / per)];
  if (!d) throw new Error(`ช่องทดสอบของ ${u} หมด`);
  const r = i % per;
  return { dateStr: d, staffId: staff[Math.floor(r / TIMES.length)], startMin: TIMES[r % TIMES.length] };
};
type Appt = { id: string; token: string; unit: string; name: string; phone: string; startMs: number; dateStr: string; startMin: number; staffId: string };
const ROW_SEL = `id, "unitId", "staffId", status::text AS status, channel, "depositSatang", "depositPaidAt", "depositSaleId", "cancelReason", "createdAt", "startAt", "policySnapshot", "customerId"`;
const apRow = async (id: string): Promise<Any> => {
  const r = (await q(`SELECT ${ROW_SEL} FROM "Appointment" WHERE id = $1`, [id]))[0];
  ok(!!r, `ไม่พบนัด ${id}`);
  return r;
};
/** จองออนไลน์ผ่าน B.7 (bookOnline) ⇒ นัด + token ลิงก์จัดการนัด */
async function book(u: string, o: { service?: string; who?: string; name?: string; phone?: string } = {}): Promise<Appt> {
  const s = nextSlot(u);
  const name = o.name ?? newName();
  const phone = o.phone ?? newPhone();
  const key = `svcb8-k-${RUN}-${randomBytes(5).toString("hex")}`;
  const r = await ON("bookOnline")(ref(u), { serviceId: o.service ?? PERM_OF[u], staffId: s.staffId, dateStr: s.dateStr, startMin: s.startMin, name, phone, idempotencyKey: key, ...(o.who ? { who: o.who } : {}) }, { ip: newIp() });
  ok(r?.ok === true, `bookOnline ${fmt(r)}`);
  ok(typeof r.manageUrl === "string" && r.manageUrl.startsWith("/bq/m/"), `manageUrl ${fmt(r.manageUrl)}`);
  const token = r.manageUrl.slice("/bq/m/".length);
  TOKENS_USED.add(token);
  const row = (await q<{ id: string }>(`SELECT id FROM "Appointment" WHERE "tenantId" = $1 AND "idempotencyKey" = $2`, [TENANT_OF[u], key]))[0];
  ok(!!row, "ไม่พบแถวนัดของ key");
  return { id: row.id, token, unit: u, name, phone, startMs: bkkMs(s.dateStr, s.startMin), dateStr: s.dateStr, startMin: s.startMin, staffId: s.staffId };
}
const setVal = async (key: string, scope: string, scopeId: string, value: unknown, t: string = ids.tA) => {
  const r = await SETTINGS().setSettings(actorOf(t === ids.tA ? "ownerA" : "ownerB"), { tenantId: t }, [{ key, scope, scopeId, value }]);
  ok(r?.ok === true, `setSettings ${key}@${scope}=${fmt(value)}: ${r?.code} ${fmt(r?.issues)}`);
};
/** จองระหว่างตั้งค่าชั่วคราว (snapshot จดค่าตอนจอง) แล้วคืนค่าเดิม */
async function bookWith(u: string, sets: [string, unknown][], o: Parameters<typeof book>[1] = {}): Promise<Appt> {
  const prev: [string, unknown][] = [];
  const cur = await SETTINGS().resolveSettings({ tenantId: TENANT_OF[u] }, sets.map((x) => x[0]), { unitId: u });
  for (const [k, v] of sets) { prev.push([k, cur[k]?.value ?? null]); await setVal(k, "UNIT", u, v, TENANT_OF[u]); }
  try { return await book(u, o); } finally { for (const [k, v] of prev) await setVal(k, "UNIT", u, v, TENANT_OF[u]).catch(() => undefined); }
}
/** สลิปตรง R0.6 (ไม่ผ่าน B.8) — ใช้ตั้งฉากที่ไม่พึ่งงานของใบ */
async function rawSlip(t: string, u: string, refId: string, expectedSatang: number, payer: string, script?: string): Promise<Any> {
  const r = await SV().submitSlip({ tenantId: t }, { unitId: u, domain: "BOOKING", refType: "APPT_DEPOSIT", refId, file: { data: png(), contentType: "image/png" }, ...(script ? { qrPayload: script } : {}), expectedSatang, expectedPayerNames: [payer], idempotencyKey: `svcb8-raw-${randomBytes(6).toString("hex")}` }, { put, del });
  ok(r?.ok === true, `submitSlip ${fmt(r)}`);
  return r;
}
const decide = async (t: string, slipId: string, input: Any) => {
  const r = await SV().decideSlip({ userId: USERS[t === ids.tA ? "ownerA" : "ownerB"] }, { tenantId: t }, slipId, { reason: "ตรวจยอดกับแอปธนาคารแล้ว", transRef: newTR(), ...input });
  ok(r?.ok === true, `decideSlip ${fmt(r)}`);
  return r;
};
const slipEvt = async (slipId: string, type = "payment.slip.approved"): Promise<Any> => {
  const r = (await q(`SELECT id, "tenantId", type, payload, "unitId" FROM "OutboxEvent" WHERE type = $1 AND payload->>'slipId' = $2 ORDER BY "createdAt" DESC LIMIT 1`, [type, slipId]))[0];
  ok(!!r, `ไม่พบ event ${type} ของสลิป`);
  return { id: r.id, tenantId: r.tenantId, type: r.type, payload: r.payload, unitId: r.unitId, systemId: null };
};
/** ระบายคิวเฉพาะร้านทดสอบ (consumers จริงของระบบ) */
async function pump(rounds = 30): Promise<string[]> {
  const errs: string[] = [];
  const consumers = CONS().consumers ?? {};
  for (let i = 0; i < rounds; i++) {
    const rows = await q(`SELECT id, "tenantId", type, payload, "unitId" FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND status = 'PENDING' ORDER BY "createdAt", id LIMIT 200`, [[ids.tA, ids.tB]]);
    if (!rows.length) return errs;
    for (const row of rows) {
      const claim = await pool.query(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 minutes' WHERE id = $1 AND status = 'PENDING' RETURNING id`, [row.id]);
      if (!claim.rowCount) continue;
      const h = consumers[row.type];
      if (typeof h === "function") {
        try { await h({ id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, unitId: row.unitId, systemId: null }); } catch (e) { errs.push(`${row.type}: ${errMsg(e).slice(0, 100)}`); }
      }
      await pool.query(`UPDATE "OutboxEvent" SET status = 'DONE', "processedAt" = now() WHERE id = $1 AND status = 'PENDING'`, [row.id]);
    }
  }
  return errs;
}
// ── เงิน ──
const receiptsOf = async (apptId: string): Promise<Any[]> => q(`SELECT s.id, s.status::text AS status, s."grandTotalSatang" AS grand, s."idempotencyKey" AS key FROM "PosSale" s WHERE s."sourceModule" = 'POS_DEPOSIT' AND s."idempotencyKey" LIKE $1 ORDER BY s."createdAt"`, [`booking-deposit-${apptId}%`]);
const depOf = async (receiptId: string | null): Promise<Any> => (receiptId ? (await q(`SELECT id, status::text AS status, "amountSatang" AS amount, "usedSatang" AS used, "refundedSatang" AS refunded, "vatSatang" AS vat FROM "PosDeposit" WHERE "receiptSaleId" = $1`, [receiptId]))[0] ?? null : null);
const forfeitBillsOf = async (apptId: string): Promise<Any[]> => q(`SELECT id, status::text AS status, "grandTotalSatang" AS grand FROM "PosSale" WHERE "sourceModule" = 'BOOKING' AND "sourceId" = $1 AND "idempotencyKey" LIKE 'dep-forfeit:%' ORDER BY "createdAt"`, [apptId]);
const refundsOf = async (receiptId: string): Promise<Any[]> => q(`SELECT id, status::text AS status, "grandTotalSatang" AS grand FROM "PosSale" WHERE "docType" = 'REFUND' AND "refSaleId" = $1`, [receiptId]);
const payTypesOf = async (saleId: string): Promise<string[]> => (await q<{ t: string }>(`SELECT type::text AS t FROM "PosPayment" WHERE "saleId" = $1 ORDER BY id`, [saleId])).map((r) => r.t);
type JLine = { code: string; debit: number; credit: number; entry: string };
const jv = async (saleIds: string[]): Promise<JLine[]> => (saleIds.filter(Boolean).length ? q<JLine>(`SELECT a.code, l.debit, l.credit, e.id AS entry FROM "AccountJournalEntry" e JOIN "AccountJournalLine" l ON l."entryId" = e.id JOIN "AccountLedger" a ON a.id = l."accountId" WHERE e."refType" = 'PosSale' AND e."refId" = ANY($1::text[])`, [saleIds.filter(Boolean)]) : []);
const netCr = (ls: JLine[], pred: (c: string) => boolean) => ls.filter((l) => pred(String(l.code))).reduce((t, l) => t + Number(l.credit) - Number(l.debit), 0);
const balanced = (ls: JLine[]) => { const by = new Map<string, number>(); for (const l of ls) by.set(l.entry, (by.get(l.entry) ?? 0) + Number(l.debit) - Number(l.credit)); return [...by.values()].every((v) => v === 0); };
const evOf = async (type: string, apptId: string): Promise<Any[]> => q(`SELECT type, "idempotencyKey" AS key, payload FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND type = $2 AND payload->>'appointmentId' = $3 ORDER BY "createdAt", id`, [[ids.tA, ids.tB], type, apptId]);
const auditOf = async (action: string, targetId?: string): Promise<Any[]> => q(`SELECT action, "actorId", "targetId", after FROM "AuditLog" WHERE "tenantId" = ANY($1::text[]) AND action = $2 ${targetId ? `AND "targetId" = $3` : ""}`, targetId ? [[ids.tA, ids.tB], action, targetId] : [[ids.tA, ids.tB], action]);
const info = async (u: string, id: string): Promise<Any> => D("depositInfo")({ tenantId: TENANT_OF[u], unitId: u }, id);
const MV = (t: unknown, o: Any = {}) => { if (typeof t === "string") TOKENS_USED.add(t); return D("loadDepositPay")(t, { ip: newIp(), ...o }); };
const SUB = (t: unknown, o: { script?: string; key?: string; now?: Date; ip?: string; data?: Uint8Array; extra?: Any } = {}) => {
  if (typeof t === "string") TOKENS_USED.add(t);
  return D("submitDepositSlip")(t, { file: { data: o.data ?? png(), contentType: "image/png" }, ...(o.script ? { qrPayload: o.script } : {}), idempotencyKey: o.key ?? `svcb8-s-${randomBytes(6).toString("hex")}`, ...(o.extra ?? {}) }, { ip: o.ip ?? newIp(), deps: { put, del }, ...(o.now ? { now: o.now } : {}) });
};
const lateNow = (a: Appt) => new Date(a.startMs - 60 * MIN); // BARBER เลื่อน/ยกเลิกฟรีก่อน 180 นาที ⇒ 60 นาทีก่อนนัด = เลยเวลาฟรี
/** มัดจำที่จ่ายแล้วแบบไม่พึ่งงานของใบ (recordDeposit เดิม · TRANSFER) */
const payOld = async (a: Appt) => { const r = await BK().recordDeposit({ tenantId: TENANT_OF[a.unit], unitId: a.unit }, a.id); ok(r?.ok === true, `recordDeposit ${fmt(r)}`); return r.saleId as string; };

let setupOk = false;
let tplOk = false;
const needSetup = () => ok(setupOk, "สร้างข้อมูลทดสอบไม่สำเร็จ (ดูบรรทัดบน)");
const needTpl = () => { needSetup(); ok(tplOk, "แม่แบบ/ค่าตั้ง/ตัวต่อทดสอบไม่สำเร็จ (T-0)"); };
const hasDep = () => typeof depLoad.mod?.depositInfo === "function";
console.log(`\n(วันนี้ไทย ${TODAY} · วันนัด ${OPEN[0]} … ${OPEN[OPEN.length - 1]} · SESSION_SECRET ${SECRET.length >= 32 ? "มี" : "ไม่มี ⚠️"} · deposit.ts ${depLoad.mod ? "มี" : "ยังไม่มี"})`);

try {
  ok(!!P, `โหลด prisma ไม่ได้ ${dbLoad.err}`);
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length} ร้าน)`); await cleanup(stale); }
  await cleanupGlobal();

  // ── สร้างข้อมูล ──
  const SYS = must(sysLoad, "system/service");
  try {
    for (const [id, n, name] of [[ids.tA, "a", "QC B8 Shop A"], [ids.tB, "b", "QC B8 Shop B"]] as const) {
      SLUGS[id] = `${SLUG}${n}-${RUN}`;
      await P.tenant.create({ data: { id, name, slug: SLUGS[id] } });
    }
    for (const [id, t, n, name] of [[ids.uO, ids.tA, "o", "สาขาตรวจสลิปอัตโนมัติ"], [ids.uM, ids.tA, "m", "สาขาตรวจมือ"], [ids.uX, ids.tA, "x", "สาขาสาม"], [ids.uB, ids.tB, "b", "สาขาร้านบี"]] as const) {
      SLUGS[id] = `b8-${n}-${RUN}`;
      await P.businessUnit.create({ data: { id, tenantId: t, type: "BOOKING", name, slug: SLUGS[id] } });
      for (let w = 0; w < 7; w++) await P.bookingHours.create({ data: { tenantId: t, unitId: id, weekday: w, openMin: 600, closeMin: 1200, closed: false } });
    }
    // POS + บัญชี (จด VAT) ต่อร้าน · สมาชิกเฉพาะสาขา o
    const ACC = must(accLoad, "account/service");
    const GL = must(glLoad, "account/gl");
    for (const [t, units, label] of [[ids.tA, [ids.uO, ids.uM, ids.uX], "A"], [ids.tB, [ids.uB], "B"]] as const) {
      const pos = await SYS.createSystem(t, "POS", `ขาย ${label}`);
      for (const u of units) await SYS.linkUnit(t, pos.id, u);
      const acc = await SYS.createSystem(t, "ACCOUNT", `บัญชี ${label}`);
      await ACC.saveSettings(t, acc.id, { orgName: `QC B8 ${label} จำกัด`, taxId: "0105561177639", vatRegistered: true });
      await GL.ensureAccounting({ tenantId: t, systemId: acc.id });
      await P.accountSystemLink.create({ data: { tenantId: t, systemId: acc.id, linkedKind: "POS", linkedId: pos.id } });
    }
    const mem = await SYS.createSystem(ids.tA, "MEMBER", "สมาชิก A");
    await SYS.linkUnit(ids.tA, mem.id, ids.uO);
    await P.paymentProfile.create({ data: { tenantId: ids.tA, promptpayId: RECV_ID, displayName: "QC B8 Shop A" } }); // ร้าน B ไม่ตั้งผู้รับ (P-8)
    // บริการ · ช่าง
    const svc = (id: string, t: string, u: string, name: string, durationMin: number, priceSatang: number, sortOrder: number) =>
      P.bookingService.create({ data: { id, tenantId: t, unitId: u, name, durationMin, priceSatang, bufferMin: 0, depositSatang: 0, bookable: true, sortOrder } });
    await svc(ids.PERM, ids.tA, ids.uO, "ดัดผม", 120, 150_000, 1);
    await svc(ids.CUT, ids.tA, ids.uO, "ตัดผมชาย", 45, 25_000, 2);
    await svc(ids.ODD, ids.tA, ids.uO, "ทำสีผม", 90, 90_005, 3);
    await svc(ids.PERM_M, ids.tA, ids.uM, "ดัดผม", 120, 150_000, 1);
    await svc(ids.CUT_M, ids.tA, ids.uM, "ตัดผมชาย", 45, 25_000, 2);
    await svc(ids.ODD_M, ids.tA, ids.uM, "ทำสีผม", 90, 90_005, 3);
    await svc(ids.PERM_X, ids.tA, ids.uX, "ดัดผม", 120, 150_000, 1);
    await svc(ids.PERM_B, ids.tB, ids.uB, "ดัดผม", 120, 150_000, 1);
    for (const [u, list] of Object.entries(STAFF)) for (const [i, s] of list.entries()) await P.bookingStaff.create({ data: { id: s, tenantId: TENANT_OF[u], unitId: u, name: `ช่างบีแปด${i + 1}`, sortOrder: i + 1 } });
    // ผู้ใช้ (Membership สด)
    const mkUser = async (k: string, t: string, role: string, unitAccess: string[], perms: string[] = [], accepted = true) => {
      const u = await P.user.create({ data: { email: `svc-b8-${RUN}-${k}@shark.local`, name: `QC B8 ${k}` } });
      await P.membership.create({ data: { userId: u.id, tenantId: t, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: accepted ? new Date() : null } });
      USERS[k] = u.id;
    };
    await mkUser("ownerA", ids.tA, "OWNER", ["*"]);
    await mkUser("ownerB", ids.tB, "OWNER", ["*"]);
    await mkUser("stConfirm", ids.tA, "STAFF", [ids.uO, ids.uM], ["booking.deposit.confirm"]);
    await mkUser("stRefund", ids.tA, "STAFF", [ids.uO, ids.uM], ["booking.deposit.refund"]);
    await mkUser("stNone", ids.tA, "STAFF", [ids.uO, ids.uM], ["booking.checkin"]);
    await mkUser("stUnitX", ids.tA, "STAFF", [ids.uX], ["booking.deposit.confirm", "booking.deposit.refund"]);
    await mkUser("mgrPending", ids.tA, "MANAGER", ["*"], [], false);
    // Party + สมาชิก (ตัวตนจาก LINE · #37)
    for (const [pid, cid, p, tier] of [[ids.PG, ids.CG, GOLD, "GOLD"], [ids.PS, ids.CS, SILVER, "SILVER"]] as const) {
      await P.party.create({ data: { id: pid, tenantId: ids.tA, name: p.name, phone: p.phone, phoneNorm: p.phone } });
      await P.customer.create({ data: { id: cid, tenantId: ids.tA, memberSystemId: mem.id, name: p.name, phone: p.phone, tier, partyId: pid } });
    }
    setupOk = true;
  } catch (e) {
    console.log(`  ❌ สร้างข้อมูลทดสอบไม่สำเร็จ: ${errMsg(e)}`);
  }

  console.log("\n── T: แม่แบบ + ค่าตั้ง + ตัวต่อทดสอบ ──");
  await st("T-0", "applyTemplate BARBER ทุกสาขา · % ออนไลน์ 100 · ถือช่อง 1440 นาที · ไม่จำกัดนัดต่อเบอร์ · o: ยกเว้นสมาชิก GOLD · ตัวต่อ FAKE SLIP_VERIFY ที่ o ⇒ CONNECTED + อนุมัติอัตโนมัติ · m: ยอมคลาด 1000", async () => {
    needSetup();
    for (const [t, u] of [[ids.tA, ids.uO], [ids.tA, ids.uM], [ids.tA, ids.uX], [ids.tB, ids.uB]] as const) {
      const a = await SETTINGS().applyTemplate(actorOf(t === ids.tA ? "ownerA" : "ownerB"), { tenantId: t }, { unitId: u, domain: "booking", templateKey: "BARBER", overwrite: "RESET_ALL" });
      ok(a?.ok === true, `applyTemplate ${u}: ${a?.code} ${fmt(a?.issues)}`);
      await setVal("booking.booking.onlineSharePct", "UNIT", u, 100, t);
      await setVal("booking.deposit.payWithinMin", "UNIT", u, 1440, t);
      await setVal("booking.booking.maxOpenPerPhone", "UNIT", u, null, t);
    }
    await setVal("booking.deposit.memberExemptTier", "UNIT", ids.uO, "GOLD");
    const I = must(integLoad, "core/integrations");
    const s = await I.saveIntegration({ tenantId: ids.tA }, actorOf("ownerA"), { create: true, kind: "SLIP_VERIFY", provider: "FAKE", label: `svcb8-${RUN}`, unitIds: [ids.uO], onFailure: "MANUAL", fields: { apiKey: `qcb8${randomBytes(14).toString("hex")}`, mode: "OK" } });
    const intId = s?.integration?.id;
    ok(!!intId, `saveIntegration ${fmt(s)}`);
    await I.testIntegration({ tenantId: ids.tA }, actorOf("ownerA"), { id: intId });
    const row = await P.tenantIntegration.findUnique({ where: { id: intId } });
    eq(row?.status, "CONNECTED", "สถานะตัวต่อ");
    await setVal("payments.slip.autoApprove", "UNIT", ids.uO, true);
    await setVal("payments.slip.toleranceSatang", "UNIT", ids.uM, 1000);
    tplOk = true;
  });

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC: ตัวควบคุม (ต้องเขียวตั้งแต่ก่อนมีงาน) ──");
  await st("PC-1", "B.7 bookOnline: ดัดผม ⇒ PENDING · มัดจำ 30,000 · ถือช่อง createdAt + 1440 นาที (snapshot) · ตัดผม ⇒ CONFIRMED มัดจำ 0", async () => {
    needTpl();
    const a = await book(ids.uO);
    const r = await apRow(a.id);
    eq([r.status, r.depositSatang, r.depositPaidAt, r.policySnapshot?.values?.["booking.deposit.payWithinMin"]], ["PENDING", DEP, null, 1440], "ดัดผม");
    const c = await book(ids.uO, { service: ids.CUT });
    const rc = await apRow(c.id);
    eq([rc.status, rc.depositSatang], ["CONFIRMED", 0], "ตัดผม");
  });
  await st("PC-2", "POS: recordDeposit (ทางเดิม) ⇒ ใบรับ POS_DEPOSIT 30,000 · GL Dr เงิน 30,000 / Cr 2110 ฐาน / Cr 2200 VAT (splitIncludedVat) · สมดุล · refundDeposit ⇒ ใบคืน · 2110 สุทธิ 0 (ตัวควบคุมสูตร GL ของข้อสอบ)", async () => {
    needTpl();
    const a = await book(ids.uX);
    const rid = await payOld(a);
    await pump();
    const sp = split(DEP);
    const l1 = await jv([rid]);
    eq([netCr(l1, (c) => c === "2110"), netCr(l1, (c) => c === "2200"), -netCr(l1, (c) => c.startsWith("1")), balanced(l1)], [sp.baseSatang, sp.vatSatang, DEP, true], "GL ใบรับ");
    const rf = await BK().refundDeposit({ tenantId: ids.tA, unitId: ids.uX }, a.id);
    ok(rf?.ok === true, fmt(rf));
    await pump();
    const cn = await refundsOf(rid);
    eq(cn.length, 1, "ใบคืน");
    const l2 = await jv([rid, cn[0].id]);
    eq([netCr(l2, (c) => c === "2110"), netCr(l2, (c) => c === "2200"), netCr(l2, (c) => c.startsWith("1")), balanced(l2)], [0, 0, 0, true], "GL หลังคืน");
  });
  await st("PC-3", "R0.6: submitSlip สาขา o (ตัวต่อ FAKE + autoApprove) สลิปดี ⇒ AUTO_APPROVED + payment.slip.approved · สาขา m (ไม่มีตัวต่อ) ⇒ NEEDS_REVIEW · decideSlip APPROVE ⇒ APPROVED + event", async () => {
    needTpl();
    const name = newName();
    const a = await rawSlip(ids.tA, ids.uO, `svcb8-pc3-${RUN}`, DEP, name, goodSlip(DEP, name));
    eq(a.status, "AUTO_APPROVED", "สาขา o");
    await slipEvt(a.slipId);
    const m = await rawSlip(ids.tA, ids.uM, `svcb8-pc3m-${RUN}`, DEP, name, goodSlip(DEP, name));
    eq(m.status, "NEEDS_REVIEW", "สาขา m");
    await decide(ids.tA, m.slipId, { decision: "APPROVE" });
    await slipEvt(m.slipId);
  });
  await st("PC-4", "POS: บิลจ่ายแถว DEPOSIT บางส่วน (15,000 ของ 30,000) ⇒ มัดจำ OPEN คงเหลือ 15,000 · moduleRefundDeposit คืนคงเหลือ ⇒ REFUNDED · GL: 2110 สุทธิ 0 · เงินสุทธิ 15,000 · รายได้+VAT 15,000 (พิสูจน์ทางริบบางส่วนทำได้โดยไม่แตะ POS)", async () => {
    needTpl();
    const a = await book(ids.uX);
    const rid = await payOld(a);
    const posSys = await SYS_POS(ids.tA, ids.uX);
    const s = await must(posLoad, "pos/service").createSale({ tenantId: ids.tA, unitId: ids.uX, systemId: posSys, sourceModule: "BOOKING", sourceId: a.id, idempotencyKey: `svcb8-pc4-${RUN}`, lines: [{ name: "ทดสอบตัดมัดจำบางส่วน", qty: 1, unitPriceSatang: 15_000 }], payMethods: [{ type: "DEPOSIT", amountSatang: 15_000, refSaleId: rid }] });
    const sid = s?.saleId ?? s?.id;
    ok(!!sid, `createSale ${fmt(s)}`);
    const d1 = await depOf(rid);
    eq([d1.status, d1.amount - d1.used - d1.refunded], ["OPEN", 15_000], "หลังตัดบางส่วน");
    const r = await must(posDepLoad, "pos/deposit").moduleRefundDeposit({ tenantId: ids.tA, unitId: ids.uX, receiptSaleId: rid, reason: "ทดสอบคืนคงเหลือ", actorId: "qc" });
    ok(r?.ok === true, fmt(r));
    await pump();
    const d2 = await depOf(rid);
    const cn = await refundsOf(rid);
    eq([d2.status, d2.refunded, cn.length], ["REFUNDED", 15_000, 1], "หลังคืน");
    const l = await jv([rid, sid, cn[0].id]);
    eq([netCr(l, (c) => c === "2110"), -netCr(l, (c) => c.startsWith("1")), netCr(l, (c) => c.startsWith("4") || c === "2200"), balanced(l)], [0, 15_000, 15_000, true], "GL");
  });
  await st("PC-5", "B.3 expireDepositHolds (ทางเดิม): นัดถือช่อง 1 นาที · now + 3 นาที ⇒ CANCELLED DEPOSIT_TIMEOUT", async () => {
    needTpl();
    const a = await bookWith(ids.uX, [["booking.deposit.payWithinMin", 1]]);
    await BK().expireDepositHolds(new Date(Date.now() + 3 * MIN));
    const r = await apRow(a.id);
    eq([r.status, r.cancelReason], ["CANCELLED", "DEPOSIT_TIMEOUT"], "นัด");
  });
  await st("PC-6", "R0.6 promptpayQrFor สาขา o ยอด 30,000 ⇒ svg data URL + ชื่อร้าน (ตัวเทียบ QR ของหน้าจ่าย) · ร้าน B (ไม่ตั้งผู้รับ) ⇒ NO_RECEIVER", async () => {
    needTpl();
    const R = must(recvLoad, "payment/receiver");
    const a = await R.promptpayQrFor({ tenantId: ids.tA }, { unitId: ids.uO, amountSatang: DEP, ref: "x" });
    ok(a?.ok === true && String(a.svgDataUrl).startsWith("data:image/svg+xml") && a.displayName === "QC B8 Shop A", fmt(a).slice(0, 120));
    const b = await R.promptpayQrFor({ tenantId: ids.tB }, { unitId: ids.uB, amountSatang: DEP, ref: "x" });
    eq(codeOf(b), "NO_RECEIVER", "ร้าน B");
  }, "MAJOR");
  await st("PC-7", "ตัวตรวจ PII จับได้จริง (positive control) · ลิงก์เซ็นตัวตน (sqcIdentityToken) ผ่าน B.7: ลูกค้า GOLD ⇒ หน้าจองมี identity", async () => {
    needTpl();
    const p = newPhone();
    const n = newName();
    ok(piiLeak(JSON.stringify({ x: p })).length === 1 && piiLeak(dashed(p)).length === 1 && piiLeak(`a ${n} b`).length === 1, "ตัวตรวจไม่จับ");
    const who = sqcIdentityToken(SECRET, { tenantId: ids.tA, partyId: ids.PG, nowMs: Date.now(), ttlMin: 60 });
    const v = await ON("loadOnlineBooking")(ref(ids.uO), { who }, { ip: newIp() });
    eq(v?.view?.identity?.name, GOLD.name, "identity");
  }, "MAJOR");

  // ═══════════════ K ค่าตั้ง ═══════════════
  console.log("\n── K: ค่าตั้ง (คีย์ใหม่ · snapshot) ──");
  await st("K-1", "def booking.late.lateCancelMode: enum · chain [UNIT] · BARBER/SPA/CLINIC/_fallback = BLOCK · schema รับ BLOCK/FORFEIT ไม่รับค่าอื่น · labelTh · ป้าย enum ไทยครบ", () => {
    const R = must(registryLoad, "settings/registry");
    const d = R.getDef("booking.late.lateCancelMode");
    ok(!!d, "ไม่มี def booking.late.lateCancelMode");
    eq([d.type, [...d.chain]], ["enum", ["UNIT"]], "type/chain");
    for (const t of ["BARBER", "SPA", "CLINIC", "_fallback"]) eq(Object.prototype.hasOwnProperty.call(d.defaults, t) ? d.defaults[t] : d.defaults._fallback, "BLOCK", t);
    ok(d.schema.safeParse("BLOCK").success && d.schema.safeParse("FORFEIT").success && !d.schema.safeParse("REFUND").success && !d.schema.safeParse(null).success, "schema");
    ok(typeof d.labelTh === "string" && d.labelTh.trim().length > 0, "labelTh");
    ok(!!d.enumLabelsTh && typeof d.enumLabelsTh.BLOCK === "string" && typeof d.enumLabelsTh.FORFEIT === "string", `enumLabelsTh ${fmt(d.enumLabelsTh)}`);
  });
  await st("K-2", "SNAPSHOT_KEYS.appointment มี lateCancelMode (คีย์เดิมครบ) · นัดออนไลน์ใหม่จดค่าปัจจุบันใน policySnapshot.values", async () => {
    const R = must(registryLoad, "settings/registry");
    const keys: string[] = [...(R.SNAPSHOT_KEYS?.appointment ?? [])];
    ok(keys.includes("booking.late.lateCancelMode"), "ไม่มีใน snapshot");
    for (const k of ["booking.deposit.method", "booking.deposit.payWithinMin", "booking.deposit.forfeitPct", "booking.late.freeChangeBeforeMin"]) ok(keys.includes(k), `หาย ${k}`);
    needTpl();
    const a = await book(ids.uM);
    eq((await apRow(a.id)).policySnapshot?.values?.["booking.late.lateCancelMode"], "BLOCK", "snapshot");
  });
  await st("K-3", "booking.deposit.method ยังเป็น NONE|PROMPTPAY_SLIP (ไม่เพิ่มโหมด · มติ §8.1) · กติกากลุ่ม deposit เดิม (DEPOSIT_DEADLINE_REQUIRED) คงอยู่", () => {
    const R = must(registryLoad, "settings/registry");
    const d = R.getDef("booking.deposit.method");
    ok(d.schema.safeParse("PROMPTPAY_SLIP").success && d.schema.safeParse("NONE").success && !d.schema.safeParse("PROMPTPAY_CONFIRM").success, "enum");
    const iss = R.validateGroup("booking", "deposit", { "booking.deposit.method": "PROMPTPAY_SLIP", "booking.deposit.payWithinMin": null });
    ok(Array.isArray(iss) && iss.some((x: Any) => x.code === "DEPOSIT_DEADLINE_REQUIRED"), fmt(iss));
  }, "MINOR");
  await st("K-4", "payWithinMin จากค่าตั้งต่อคำขอ: ตั้ง 30 แล้วจอง ⇒ depositInfo.holdUntilMs = createdAt + 30 นาที · นัดเดิม (1440) ไม่เปลี่ยน", async () => {
    needTpl();
    const old = await book(ids.uM);
    const a = await bookWith(ids.uM, [["booking.deposit.payWithinMin", 30]]);
    const ra = await apRow(a.id);
    const ro = await apRow(old.id);
    eq((await info(ids.uM, a.id))?.holdUntilMs, new Date(ra.createdAt).getTime() + 30 * MIN, "ใหม่");
    eq((await info(ids.uM, old.id))?.holdUntilMs, new Date(ro.createdAt).getTime() + 1440 * MIN, "เดิม");
  });

  // ═══════════════ P หน้าจ่าย + แนบสลิป ═══════════════
  console.log("\n── P: หน้าจ่าย + แนบสลิป (สาธารณะ · token = สิทธิ์) ──");
  let pAwait: Appt | null = null;
  try { if (tplOk) pAwait = await book(ids.uO); } catch (e) { console.log(`  (ตั้งฉาก P ล้ม: ${errMsg(e)})`); }
  await st("P-1", "loadDepositPay (AWAITING): state · ยอด 30,000 · holdUntilMs = createdAt + 1440 · QR = promptpayQrFor ยอดเดียวกันทุกไบต์ · canSubmitSlip · ไม่มี lateCancel (ยังไม่เลยเวลาฟรี) · ไม่มีชื่อ/เบอร์", async () => {
    ok(!!pAwait, "ไม่มีนัดฉาก");
    const r = await MV(pAwait!.token);
    ok(r?.ok === true, fmt(r));
    const p = r.pay;
    const row = await apRow(pAwait!.id);
    const qr = await must(recvLoad, "payment/receiver").promptpayQrFor({ tenantId: ids.tA }, { unitId: ids.uO, amountSatang: DEP, ref: "x" });
    eq([p.state, p.amountSatang, p.holdUntilMs, p.qr?.svgDataUrl === qr.svgDataUrl, p.qr?.displayName, p.noReceiver, p.canSubmitSlip, p.slip, p.lateCancel, p.forfeitedSatang, p.refundDueSatang],
      ["AWAITING", DEP, new Date(row.createdAt).getTime() + 1440 * MIN, true, "QC B8 Shop A", false, true, null, null, 0, 0], "pay");
    eq(piiLeak(JSON.stringify(r)), [], "PII");
  });
  await st("P-2", "X7 token เสียทุกแบบ (สุ่ม 43 · รูปผิด · ลายเซ็นของ id อื่น · ไม่ใช่สตริง · token ของนัดที่ลบ hash) ⇒ loadDepositPay / submitDepositSlip คำตอบเดียวกันทุกไบต์ · ไม่อัปไฟล์", async () => {
    ok(hasDep(), "ยังไม่มีงาน");
    const bads: unknown[] = [randomBytes(32).toString("base64url"), "abc", sqcManageToken(SECRET, `svcb8-none-${RUN}`), 12345, null, `${pAwait?.token ?? ""}x`];
    const v = await Promise.all(bads.map((t) => MV(t)));
    eq(new Set(v.map((x) => JSON.stringify(x))).size, 1, `ดู ${fmt(v)}`);
    eq(v[0], { ok: false, code: "NOT_FOUND" }, "รูปคำตอบดู");
    const p0 = PUTS.length;
    const s = [];
    for (const t of bads) s.push(await SUB(t));
    eq(new Set(s.map((x) => JSON.stringify(x))).size, 1, `ส่ง ${fmt(s)}`);
    eq(codeOf(s[0]), "NOT_FOUND", "รหัส");
    eq(PUTS.length, p0, "อัปไฟล์");
  });
  await st("P-3", "แนบสลิปสาขา o (ตัวต่อ FAKE · อนุมัติอัตโนมัติ) ⇒ ok AUTO_APPROVED · state PAID ทันที (ไม่รอคิว) · นัด CONFIRMED · ใบรับ PROMPTPAY 30,000 · สลิป refType APPT_DEPOSIT refId = นัด · expectedSatang จากแถว · คีย์ bq-slip:", async () => {
    ok(!!pAwait && hasDep(), "ไม่มีฉาก/งาน");
    const key = `svcb8-p3-${randomBytes(5).toString("hex")}`;
    const r = await SUB(pAwait!.token, { script: goodSlip(DEP, pAwait!.name), key });
    ok(r?.ok === true, fmt(r));
    eq([r.status, r.state], ["AUTO_APPROVED", "PAID"], "ผล");
    const row = await apRow(pAwait!.id);
    const rc = await receiptsOf(pAwait!.id);
    eq([row.status, !!row.depositPaidAt, rc.length, rc[0]?.grand, row.depositSaleId === rc[0]?.id], ["CONFIRMED", true, 1, DEP, true], "นัด/ใบรับ");
    eq(await payTypesOf(rc[0].id), ["PROMPTPAY"], "วิธีรับ");
    const sl = (await q(`SELECT "refType", "refId", "expectedSatang", domain, checks->>'idempotencyKey' AS k FROM "PaymentSlip" WHERE "tenantId" = $1 AND "refId" = $2`, [ids.tA, pAwait!.id]));
    eq(sl.map((x: Any) => [x.domain, x.refType, x.expectedSatang, x.k]), [["BOOKING", "APPT_DEPOSIT", DEP, `bq-slip:${key}`]], "สลิป");
  });
  await st("P-4", "สาขา m (ไม่มีตัวต่อ) ⇒ NEEDS_REVIEW · state IN_REVIEW · นัดยัง PENDING ไม่มีใบรับ · หน้าจ่าย canSubmitSlip false · แนบซ้ำ ⇒ IN_REVIEW · คีย์เดิมซ้ำ ⇒ ผลเดิม (สลิป 1 แถว)", async () => {
    needTpl();
    ok(hasDep(), "ยังไม่มีงาน");
    const a = await book(ids.uM);
    const key = `svcb8-p4-${randomBytes(5).toString("hex")}`;
    const data = png();
    const r = await SUB(a.token, { script: goodSlip(DEP, a.name), key, data });
    ok(r?.ok === true, fmt(r));
    eq([r.status, r.state], ["NEEDS_REVIEW", "IN_REVIEW"], "ผล");
    eq([(await apRow(a.id)).status, (await receiptsOf(a.id)).length], ["PENDING", 0], "นัด");
    const v = await MV(a.token);
    eq([v.pay?.state, v.pay?.canSubmitSlip, v.pay?.slip?.status], ["IN_REVIEW", false, "NEEDS_REVIEW"], "หน้าจ่าย");
    const again = await SUB(a.token, { script: goodSlip(DEP, a.name), key, data });
    ok(again?.ok === true && again.status === "NEEDS_REVIEW", `คีย์ซ้ำ ${fmt(again)}`);
    eq(codeOf(await SUB(a.token, { script: goodSlip(DEP, a.name) })), "IN_REVIEW", "แนบใบใหม่");
    eq(Number((await q(`SELECT count(*)::int AS n FROM "PaymentSlip" WHERE "tenantId" = $1 AND "refId" = $2`, [ids.tA, a.id]))[0].n), 1, "แถวสลิป");
  });
  await st("P-5", "ปฏิเสธก่อนแตะตัวตรวจสลิป: บริการไม่มีมัดจำ ⇒ NO_DEPOSIT · จ่ายแล้ว ⇒ ALREADY_PAID · เลยเวลาถือช่อง (now ฉีด) ⇒ EXPIRED · นัดถูกปล่อย (DEPOSIT_TIMEOUT) ⇒ EXPIRED · ไม่มีแถวสลิปใหม่/ไม่อัปไฟล์", async () => {
    needTpl();
    ok(hasDep(), "ยังไม่มีงาน");
    const c = await book(ids.uM, { service: ids.CUT_M });
    const paid = await book(ids.uM);
    await payOld(paid);
    const late = await book(ids.uM);
    const lr = await apRow(late.id);
    const gone = await bookWith(ids.uM, [["booking.deposit.payWithinMin", 1]]);
    await BK().expireDepositHolds(new Date(Date.now() + 3 * MIN));
    const p0 = PUTS.length;
    const n0 = Number((await q(`SELECT count(*)::int AS n FROM "PaymentSlip" WHERE "tenantId" = $1`, [ids.tA]))[0].n);
    const res = [await SUB(c.token), await SUB(paid.token), await SUB(late.token, { now: new Date(new Date(lr.createdAt).getTime() + 1441 * MIN) }), await SUB(gone.token)];
    eq(res.map(codeOf), ["NO_DEPOSIT", "ALREADY_PAID", "EXPIRED", "EXPIRED"], "รหัส");
    ok(res.every((x) => typeof x?.reason === "string" && x.reason.length > 0), "reason ว่าง");
    eq([PUTS.length, Number((await q(`SELECT count(*)::int AS n FROM "PaymentSlip" WHERE "tenantId" = $1`, [ids.tA]))[0].n)], [p0, n0], "ไม่มีผลข้างเคียง");
  });
  await st("P-6", "ข้อมูลจาก client ไม่มีผล: ส่ง expectedSatang 1 / policy autoApprove / domain DORM มาในคำขอ (สาขา m) ⇒ สลิปคาด 30,000 · NEEDS_REVIEW (ไม่อนุมัติเอง) · domain BOOKING", async () => {
    needTpl();
    ok(hasDep(), "ยังไม่มีงาน");
    const a = await book(ids.uM);
    const r = await SUB(a.token, { script: goodSlip(1, a.name, { amountSatang: 1 }), extra: { expectedSatang: 1, policy: { autoApprove: true }, domain: "DORM", refType: "DORM_BILL" } });
    ok(r?.ok === true && r.status === "NEEDS_REVIEW", fmt(r));
    const sl = (await q(`SELECT domain, "expectedSatang" FROM "PaymentSlip" WHERE "tenantId" = $1 AND "refId" = $2`, [ids.tA, a.id]))[0];
    eq([sl?.domain, sl?.expectedSatang], ["BOOKING", DEP], "สลิป");
  });
  await st("P-7", "ร้านไม่ตั้งผู้รับเงิน (ร้าน B): หน้าจ่าย noReceiver · qr null · แนบสลิป ⇒ NO_RECEIVER (ไม่อัปไฟล์)", async () => {
    needTpl();
    ok(hasDep(), "ยังไม่มีงาน");
    const b = await book(ids.uB);
    const v = await MV(b.token);
    eq([v?.pay?.state, v?.pay?.noReceiver, v?.pay?.qr], ["AWAITING", true, null], "หน้าจ่าย");
    const p0 = PUTS.length;
    eq(codeOf(await SUB(b.token)), "NO_RECEIVER", "แนบ");
    eq(PUTS.length, p0, "อัปไฟล์");
  }, "MAJOR");

  // ═══════════════ A เงินเข้า (consumer) ═══════════════
  console.log("\n── A: เงินเข้า (สลิปอนุมัติ → ใบรับ → ยืนยันนัด) ──");
  await st("A-1", "สลิปตรวจมือ (m) → decideSlip APPROVE → ระบายคิว ⇒ ใบรับ PROMPTPAY 30,000 · depositPaidAt · CONFIRMED · booking.deposit_paid 1 ครั้ง (via SLIP) · depositInfo PAID · ระบายซ้ำไม่เพิ่ม", async () => {
    needTpl();
    const a = await book(ids.uM);
    const s = await rawSlip(ids.tA, ids.uM, a.id, DEP, a.name);
    await decide(ids.tA, s.slipId, { decision: "APPROVE" });
    await pump();
    await pump();
    const row = await apRow(a.id);
    const rc = await receiptsOf(a.id);
    eq([row.status, !!row.depositPaidAt, rc.length, rc[0]?.grand], ["CONFIRMED", true, 1, DEP], "นัด/ใบรับ");
    eq(await payTypesOf(rc[0].id), ["PROMPTPAY"], "วิธีรับ");
    const ev = await evOf("booking.deposit_paid", a.id);
    eq([ev.length, ev[0]?.payload?.via, ev[0]?.payload?.amountSatang, ev[0]?.payload?.partial, ev[0]?.payload?.late], [1, "SLIP", DEP, false, false], "event");
    const i = await info(ids.uM, a.id);
    eq([i?.state, i?.paidSatang, i?.requiredSatang, i?.holdUntilMs, i?.slipStatus], ["PAID", DEP, DEP, null, "APPROVED"], "info");
  });
  await st("A-2", "requireConfirm (snapshot) = true ⇒ จ่ายแล้วยัง PENDING (ร้านยืนยัน) · PAID · ไม่ถูกปล่อยช่องแม้เลยเวลา", async () => {
    needTpl();
    const a = await bookWith(ids.uM, [["booking.booking.requireConfirm", true], ["booking.deposit.payWithinMin", 1]]);
    const s = await rawSlip(ids.tA, ids.uM, a.id, DEP, a.name);
    await decide(ids.tA, s.slipId, { decision: "APPROVE" });
    await pump();
    await BK().expireDepositHolds(new Date(Date.now() + 3 * MIN));
    const row = await apRow(a.id);
    eq([row.status, !!row.depositPaidAt, (await receiptsOf(a.id)).length], ["PENDING", true, 1], "นัด");
    eq((await info(ids.uM, a.id))?.state, "PAID", "state");
  });
  await st("A-3", "อนุมัติบางส่วน 20,000 ⇒ ใบรับ 20,000 (เงินจริง) · สถานะคง PENDING · UNDERPAID · ไม่ถูกปล่อยช่อง · event partial", async () => {
    needTpl();
    const a = await bookWith(ids.uM, [["booking.deposit.payWithinMin", 1]]);
    const s = await rawSlip(ids.tA, ids.uM, a.id, DEP, a.name);
    await decide(ids.tA, s.slipId, { decision: "APPROVE_PARTIAL", amountSatang: 20_000 });
    await pump();
    await BK().expireDepositHolds(new Date(Date.now() + 3 * MIN));
    const row = await apRow(a.id);
    const rc = await receiptsOf(a.id);
    eq([row.status, rc.length, rc[0]?.grand], ["PENDING", 1, 20_000], "นัด/ใบรับ");
    const i = await info(ids.uM, a.id);
    eq([i?.state, i?.paidSatang, i?.requiredSatang], ["UNDERPAID", 20_000, DEP], "info");
    eq((await evOf("booking.deposit_paid", a.id))[0]?.payload?.partial, true, "event");
  });
  await st("A-4", "อนุมัติเกิน (30,500 ภายในยอมคลาด 1000) ⇒ ใบรับ 30,500 · CONFIRMED · PAID", async () => {
    needTpl();
    const a = await book(ids.uM);
    const s = await rawSlip(ids.tA, ids.uM, a.id, DEP, a.name, goodSlip(30_500, a.name, { amountSatang: 30_500 }));
    await decide(ids.tA, s.slipId, { decision: "APPROVE", amountSatang: 30_500 });
    await pump();
    const rc = await receiptsOf(a.id);
    eq([(await apRow(a.id)).status, rc.length, rc[0]?.grand], ["CONFIRMED", 1, 30_500], "นัด/ใบรับ");
    eq((await info(ids.uM, a.id))?.state, "PAID", "state");
  }, "MAJOR");
  await st("A-5", "เงินเข้าหลังปล่อยช่อง (นัดหมดเวลาก่อน แล้วสลิปอนุมัติ) ⇒ ไม่ปลุกนัด (CANCELLED DEPOSIT_TIMEOUT) · ใบรับ 30,000 ผูกแถว · REFUND_DUE 30,000 · audit booking.deposit.late_money · event late", async () => {
    needTpl();
    const a = await bookWith(ids.uM, [["booking.deposit.payWithinMin", 1]]);
    await BK().expireDepositHolds(new Date(Date.now() + 3 * MIN));
    eq((await apRow(a.id)).status, "CANCELLED", "ปล่อยแล้ว");
    const s = await rawSlip(ids.tA, ids.uM, a.id, DEP, a.name);
    await decide(ids.tA, s.slipId, { decision: "APPROVE" });
    await pump();
    const row = await apRow(a.id);
    const rc = await receiptsOf(a.id);
    eq([row.status, row.cancelReason, rc.length, row.depositSaleId === rc[0]?.id, !!row.depositPaidAt], ["CANCELLED", "DEPOSIT_TIMEOUT", 1, true, true], "นัด/ใบรับ");
    const i = await info(ids.uM, a.id);
    eq([i?.state, i?.refundDueSatang], ["REFUND_DUE", DEP], "info");
    ok((await auditOf("booking.deposit.late_money")).some((x: Any) => x.targetId === a.id || JSON.stringify(x.after ?? {}).includes(a.id)), "audit");
    eq((await evOf("booking.deposit_paid", a.id))[0]?.payload?.late, true, "event");
  });
  await st("A-6", "จ่ายแล้วทางร้าน แล้วมีสลิปอนุมัติอีกใบ ⇒ ไม่ออกใบรับที่สอง · audit booking.deposit.slip_after_paid", async () => {
    needTpl();
    ok(hasDep(), "ยังไม่มีงาน");
    const a = await book(ids.uM);
    const c = await D("confirmDepositByShop")(shop("ownerA"), { unitId: ids.uM, appointmentId: a.id });
    ok(c?.ok === true, fmt(c));
    const s = await rawSlip(ids.tA, ids.uM, a.id, DEP, a.name);
    await decide(ids.tA, s.slipId, { decision: "APPROVE" });
    await pump();
    eq((await receiptsOf(a.id)).length, 1, "ใบรับ");
    ok((await auditOf("booking.deposit.slip_after_paid")).some((x: Any) => x.targetId === a.id || JSON.stringify(x.after ?? {}).includes(a.id)), "audit");
  });
  await st("A-7", "consumer ไม่เชื่อ payload: slipId ปลอม · payload ปั้น refId/ยอด · สลิปจริงแต่ event อ้างร้าน B · สลิปถูกปฏิเสธ ⇒ นัดไม่เปลี่ยน ไม่มีใบรับ (ไม่ throw)", async () => {
    needTpl();
    const a = await book(ids.uM);
    const s = await rawSlip(ids.tA, ids.uM, a.id, DEP, a.name);
    await decide(ids.tA, s.slipId, { decision: "REJECT" });
    const h = D("onDepositSlipApproved");
    await h({ tenantId: ids.tA, unitId: ids.uM, payload: { slipId: `svcb8-fake-${RUN}`, domain: "BOOKING", refType: "APPT_DEPOSIT", refId: a.id, amountSatang: 999_999, status: "APPROVED" } });
    await h({ tenantId: ids.tA, unitId: ids.uM, payload: { slipId: s.slipId, domain: "BOOKING", refType: "APPT_DEPOSIT", refId: a.id, amountSatang: DEP, status: "APPROVED" } });
    await h({ tenantId: ids.tB, unitId: ids.uB, payload: { slipId: s.slipId, domain: "BOOKING", refType: "APPT_DEPOSIT", refId: a.id, amountSatang: DEP, status: "APPROVED" } });
    await h({ tenantId: ids.tA, payload: "ขยะ" });
    const row = await apRow(a.id);
    eq([row.status, row.depositPaidAt, (await receiptsOf(a.id)).length], ["PENDING", null, 0], "นัด");
  });
  await st("A-8", "ทะเบียน consumer: consumers[\"payment.slip.approved\"] เรียกงานเงินของใบ (สลิปอนุมัติแล้ว เรียกผ่านทะเบียนตรง ⇒ ใบรับ + CONFIRMED) · domain อื่น (DORM) ไม่ทำอะไร", async () => {
    needTpl();
    const a = await book(ids.uM);
    const s = await rawSlip(ids.tA, ids.uM, a.id, DEP, a.name);
    await decide(ids.tA, s.slipId, { decision: "APPROVE" });
    const evt = await slipEvt(s.slipId);
    await CONS().consumers["payment.slip.approved"](evt);
    eq([(await apRow(a.id)).status, (await receiptsOf(a.id)).length], ["CONFIRMED", 1], "ผ่านทะเบียน");
    await CONS().consumers["payment.slip.approved"]({ ...evt, payload: { ...evt.payload, domain: "DORM", refType: "DORM_BILL" } });
    eq((await receiptsOf(a.id)).length, 1, "domain อื่น");
  });

  // ═══════════════ E หมดเวลา ═══════════════
  console.log("\n── E: หมดเวลาถือช่อง (expireDepositHolds) ──");
  await st("E-1", "สลิปค้างตรวจ = หยุดนับ: เลยเวลาแล้วไม่ปล่อย (IN_REVIEW) · ร้านปฏิเสธสลิป ⇒ รอบถัดไปปล่อย DEPOSIT_TIMEOUT", async () => {
    needTpl();
    const a = await bookWith(ids.uM, [["booking.deposit.payWithinMin", 1]]);
    const s = await rawSlip(ids.tA, ids.uM, a.id, DEP, a.name);
    await BK().expireDepositHolds(new Date(Date.now() + 3 * MIN));
    eq((await apRow(a.id)).status, "PENDING", "สลิปค้าง");
    await decide(ids.tA, s.slipId, { decision: "REJECT" });
    await BK().expireDepositHolds(new Date(Date.now() + 3 * MIN));
    const r = await apRow(a.id);
    eq([r.status, r.cancelReason], ["CANCELLED", "DEPOSIT_TIMEOUT"], "หลังปฏิเสธ");
  });
  await st("E-2", "ปล่อยช่อง ⇒ booking.cancelled (คีย์ booking.cancelled#<id> · reason DEPOSIT_TIMEOUT · depositPaid false) ใน tx เดียว · เรียกซ้ำไม่มี event เพิ่ม · payload ไม่มี PII", async () => {
    needTpl();
    const a = await bookWith(ids.uM, [["booking.deposit.payWithinMin", 1]]);
    await BK().expireDepositHolds(new Date(Date.now() + 3 * MIN));
    await BK().expireDepositHolds(new Date(Date.now() + 4 * MIN));
    const ev = await evOf("booking.cancelled", a.id);
    eq(ev.map((e: Any) => [e.key, e.payload?.reason, e.payload?.depositPaid, e.payload?.from]), [[`booking.cancelled#${a.id}`, "DEPOSIT_TIMEOUT", false, "PENDING"]], "event");
    eq(piiLeak(JSON.stringify(ev)), [], "PII");
  });
  await st("E-3", "ช่องถือมัดจำของนัดที่จ่ายแล้วบางส่วน/ร้านยืนยันแล้ว ไม่ถูกปล่อย (ตัวควบคุมของ A-2/A-3 ร่วม) · นัดตัดผม (ไม่มีมัดจำ) ไม่ถูกแตะ", async () => {
    needTpl();
    const c = await bookWith(ids.uM, [["booking.deposit.payWithinMin", 1]], { service: ids.CUT_M });
    await BK().expireDepositHolds(new Date(Date.now() + 3 * MIN));
    eq((await apRow(c.id)).status, "CONFIRMED", "ตัดผม");
  }, "MAJOR");

  // ═══════════════ S2 จอร้าน ═══════════════
  console.log("\n── S2: จอร้าน (คิวมัดจำ · ยืนยัน · คืน · สิทธิ์สด) ──");
  await st("S2-1", "confirmDepositByShop (AWAITING) ⇒ ใบรับ PROMPTPAY 30,000 · CONFIRMED · audit booking.deposit.confirm (ผู้กด) · event via SHOP · กดซ้ำ ⇒ duplicated ใบรับเดียว · payType TRANSFER ได้", async () => {
    needTpl();
    ok(hasDep(), "ยังไม่มีงาน");
    const a = await book(ids.uM);
    const r = await D("confirmDepositByShop")(shop("stConfirm"), { unitId: ids.uM, appointmentId: a.id });
    ok(r?.ok === true && r.info?.state === "PAID", fmt(r));
    const rc = await receiptsOf(a.id);
    eq([(await apRow(a.id)).status, rc.length, rc[0]?.grand], ["CONFIRMED", 1, DEP], "นัด/ใบรับ");
    eq(await payTypesOf(rc[0].id), ["PROMPTPAY"], "วิธีรับ");
    ok((await auditOf("booking.deposit.confirm")).some((x: Any) => x.actorId === USERS.stConfirm), "audit ผู้กด");
    eq((await evOf("booking.deposit_paid", a.id)).map((e: Any) => e.payload?.via), ["SHOP"], "event");
    const r2 = await D("confirmDepositByShop")(shop("stConfirm"), { unitId: ids.uM, appointmentId: a.id });
    ok(r2?.ok === true && r2.duplicated === true, fmt(r2));
    eq((await receiptsOf(a.id)).length, 1, "ใบรับหลังกดซ้ำ");
    const b = await book(ids.uM);
    const r3 = await D("confirmDepositByShop")(shop("ownerA"), { unitId: ids.uM, appointmentId: b.id, payType: "TRANSFER" });
    ok(r3?.ok === true, fmt(r3));
    eq(await payTypesOf((await receiptsOf(b.id))[0]?.id), ["TRANSFER"], "TRANSFER");
  });
  await st("S2-2", "confirmDepositByShop ปฏิเสธ: สลิปค้าง ⇒ SLIP_IN_REVIEW · ไม่มีมัดจำ ⇒ NO_DEPOSIT · นัดถูกปล่อย ⇒ BAD_STATE · ไม่มีใบรับเกิด", async () => {
    needTpl();
    ok(hasDep(), "ยังไม่มีงาน");
    const a = await book(ids.uM);
    await rawSlip(ids.tA, ids.uM, a.id, DEP, a.name);
    const c = await book(ids.uM, { service: ids.CUT_M });
    const g = await bookWith(ids.uM, [["booking.deposit.payWithinMin", 1]]);
    await BK().expireDepositHolds(new Date(Date.now() + 3 * MIN));
    const res = [];
    for (const x of [a, c, g]) res.push(await D("confirmDepositByShop")(shop("ownerA"), { unitId: ids.uM, appointmentId: x.id }));
    eq(res.map(codeOf), ["SLIP_IN_REVIEW", "NO_DEPOSIT", "BAD_STATE"], "รหัส");
    eq([(await receiptsOf(a.id)).length, (await receiptsOf(g.id)).length], [0, 0], "ใบรับ");
  });
  await st("S2-3", "UNDERPAID → ร้านกดยืนยัน ⇒ CONFIRMED · ไม่มีใบรับเพิ่ม (ยังใบเดียว 20,000)", async () => {
    needTpl();
    ok(hasDep(), "ยังไม่มีงาน");
    const a = await book(ids.uM);
    const s = await rawSlip(ids.tA, ids.uM, a.id, DEP, a.name);
    await decide(ids.tA, s.slipId, { decision: "APPROVE_PARTIAL", amountSatang: 20_000 });
    await pump();
    const r = await D("confirmDepositByShop")(shop("ownerA"), { unitId: ids.uM, appointmentId: a.id });
    ok(r?.ok === true, fmt(r));
    const rc = await receiptsOf(a.id);
    eq([(await apRow(a.id)).status, rc.length, rc[0]?.grand], ["CONFIRMED", 1, 20_000], "นัด/ใบรับ");
  }, "MAJOR");
  let refundDue: Appt | null = null;
  await st("S2-4", "refundDepositByShop: PAID ของนัดที่ยังใช้บริการ ⇒ BAD_STATE · เหตุผลว่าง ⇒ BAD_INPUT · REFUND_DUE (ลูกค้ายกเลิกในเวลาฟรี) ⇒ ใบคืน CN 30,000 · REFUNDED · event booking.deposit_refunded · audit · กดซ้ำ ⇒ duplicated ใบคืนเดียว", async () => {
    needTpl();
    ok(hasDep(), "ยังไม่มีงาน");
    const a = await book(ids.uM);
    const rid = await payOld(a);
    eq(codeOf(await D("refundDepositByShop")(shop("ownerA"), { unitId: ids.uM, appointmentId: a.id, reason: "ทดสอบ" })), "BAD_STATE", "PAID");
    const c = await ON("cancelOnline")(a.token, { ip: newIp() });
    ok(c?.ok === true, `cancelOnline ${fmt(c)}`);
    refundDue = a;
    eq(codeOf(await D("refundDepositByShop")(shop("ownerA"), { unitId: ids.uM, appointmentId: a.id, reason: "  " })), "BAD_INPUT", "เหตุผล");
    const r = await D("refundDepositByShop")(shop("stRefund"), { unitId: ids.uM, appointmentId: a.id, reason: "โอนคืนลูกค้าแล้ว" });
    ok(r?.ok === true && r.info?.state === "REFUNDED", fmt(r));
    await pump();
    const cn = await refundsOf(rid);
    eq([cn.length, cn[0]?.grand, (await depOf(rid))?.status], [1, DEP, "REFUNDED"], "ใบคืน");
    const ev = await evOf("booking.deposit_refunded", a.id);
    eq(ev.map((e: Any) => e.payload?.refundSatang), [DEP], "event");
    ok((await auditOf("booking.deposit.refund")).some((x: Any) => x.actorId === USERS.stRefund), "audit");
    const r2 = await D("refundDepositByShop")(shop("ownerA"), { unitId: ids.uM, appointmentId: a.id, reason: "กดซ้ำ" });
    ok(r2?.ok === true && r2.duplicated === true, fmt(r2));
    eq((await refundsOf(rid)).length, 1, "ใบคืนหลังกดซ้ำ");
    const l = await jv([rid, cn[0].id]);
    eq([netCr(l, (x) => x === "2110"), netCr(l, (x) => x === "2200"), netCr(l, (x) => x.startsWith("1")), balanced(l)], [0, 0, 0, true], "GL");
  });
  await st("S2-5", "depositQueue (ค่าเริ่ม): สาขา m เท่านั้น · มี AWAITING/IN_REVIEW/UNDERPAID/REFUND_DUE · ไม่มี PAID/REFUNDED/NONE · เบอร์ปิดเสมอ (ไม่มีเบอร์เต็ม) · มีชื่อลูกค้า · เรียงเวลานัด", async () => {
    needTpl();
    ok(hasDep(), "ยังไม่มีงาน");
    const r = await D("depositQueue")(shop("ownerA"), { unitId: ids.uM });
    ok(r?.ok === true && Array.isArray(r.items), fmt(r));
    const st8 = new Set(r.items.map((x: Any) => x.info?.state));
    for (const s of ["AWAITING", "IN_REVIEW", "UNDERPAID", "REFUND_DUE"]) ok(st8.has(s), `ไม่มี ${s} (${[...st8].join(",")})`);
    for (const s of ["PAID", "REFUNDED", "NONE", "USED"]) ok(!st8.has(s), `มี ${s}`);
    const unitRows = await q<{ id: string }>(`SELECT id FROM "Appointment" WHERE "unitId" = $1`, [ids.uM]);
    ok(r.items.every((x: Any) => unitRows.some((u) => u.id === x.appointmentId)), "นัดสาขาอื่น");
    const json = JSON.stringify(r.items);
    eq(PHONES.filter((p) => json.includes(p)), [], "เบอร์เต็ม");
    ok(r.items.every((x: Any) => typeof x.customerName === "string" && x.customerName.length > 0 && /•|\*|x/i.test(String(x.phoneMasked))), "ชื่อ/เบอร์ปิด");
    const ts = r.items.map((x: Any) => x.startMs);
    eq(ts, [...ts].sort((x: number, y: number) => x - y), "เรียงเวลา");
    if (refundDue) ok(!r.items.some((x: Any) => x.appointmentId === refundDue!.id), "นัดที่คืนแล้วยังอยู่ในคิว");
  });
  await st("S2-6", "สิทธิ์สด (Membership จากฐานทุกคำขอ): ไม่มีคีย์มัดจำ ⇒ NOT_FOUND ทุกตัว · stConfirm ยืนยันได้แต่คืนไม่ได้ · ถอดสิทธิ์ในฐาน ⇒ คำขอถัดไป NOT_FOUND · สิทธิ์สาขาอื่น ⇒ NOT_FOUND · ยังไม่ตอบรับ ⇒ NOT_FOUND · stRefund คิวได้", async () => {
    needTpl();
    ok(hasDep(), "ยังไม่มีงาน");
    const a = await book(ids.uM);
    const res = [
      await D("depositQueue")(shop("stNone"), { unitId: ids.uM }),
      await D("confirmDepositByShop")(shop("stNone"), { unitId: ids.uM, appointmentId: a.id }),
      await D("refundDepositByShop")(shop("stConfirm"), { unitId: ids.uM, appointmentId: a.id, reason: "x" }),
      await D("confirmDepositByShop")(shop("stUnitX"), { unitId: ids.uM, appointmentId: a.id }),
      await D("confirmDepositByShop")(shop("mgrPending"), { unitId: ids.uM, appointmentId: a.id }),
    ];
    eq(res.map(codeOf), ["NOT_FOUND", "NOT_FOUND", "NOT_FOUND", "NOT_FOUND", "NOT_FOUND"], "ไม่มีสิทธิ์");
    eq((await receiptsOf(a.id)).length, 0, "ใบรับ");
    ok((await D("depositQueue")(shop("stRefund"), { unitId: ids.uM }))?.ok === true, "stRefund ดูคิว");
    await P.membership.updateMany({ where: { userId: USERS.stConfirm, tenantId: ids.tA }, data: { permissions: { "booking.checkin": true } } });
    eq(codeOf(await D("confirmDepositByShop")(shop("stConfirm"), { unitId: ids.uM, appointmentId: a.id })), "NOT_FOUND", "หลังถอดสิทธิ์");
    await P.membership.updateMany({ where: { userId: USERS.stConfirm, tenantId: ids.tA }, data: { permissions: { "booking.deposit.confirm": true } } });
    ok((await D("confirmDepositByShop")(shop("stConfirm"), { unitId: ids.uM, appointmentId: a.id }))?.ok === true, "คืนสิทธิ์แล้วทำได้");
  });
  await st("S2-7", "access.ts: confirmDepositAction ⇒ [booking.deposit.confirm, booking.deposit.record] · refundDueDepositAction ⇒ [booking.deposit.refund] · permissions.ts: booking.deposit.forfeit ไม่อยู่ใน planned", () => {
    const k = fnOf(accessLoad, "bookingActionKeys", F.access);
    eq([...k("confirmDepositAction")].sort(), ["booking.deposit.confirm", "booking.deposit.record"], "confirm");
    eq([...k("refundDueDepositAction")], ["booking.deposit.refund"], "refund");
    const s = stripComments(src(F.perms));
    const planned = /planned:\s*\[([^\]]*)\]/g;
    let hit = false;
    for (const m of s.matchAll(planned)) if (/booking\.deposit\.forfeit/.test(m[1])) hit = true;
    ok(!hit, "booking.deposit.forfeit ยัง planned");
  }, "MAJOR");

  // ═══════════════ F ริบ · คืน · ยกเลิกช้า ═══════════════
  console.log("\n── F: ริบ · คืน · ยกเลิกช้า ──");
  await st("F-1", "ลูกค้ายกเลิกในเวลาฟรี (มัดจำจ่ายแล้ว) ⇒ CANCELLED CUSTOMER · ไม่มีใบคืนอัตโนมัติ · มัดจำ OPEN · REFUND_DUE 30,000 · acceptForfeit ก่อนเวลาฟรีไม่มีผล", async () => {
    needTpl();
    const a = await book(ids.uM);
    const rid = await payOld(a);
    const c = await ON("cancelOnline")(a.token, { ip: newIp(), acceptForfeit: true });
    ok(c?.ok === true, fmt(c));
    await pump();
    const row = await apRow(a.id);
    eq([row.status, row.cancelReason, (await refundsOf(rid)).length, (await depOf(rid))?.status, (await forfeitBillsOf(a.id)).length], ["CANCELLED", "CUSTOMER", 0, "OPEN", 0], "นัด/เงิน");
    const i = await info(ids.uM, a.id);
    eq([i?.state, i?.refundDueSatang], ["REFUND_DUE", DEP], "info");
  });
  await st("F-2", "ไม่มา pct 100 (snapshot) ⇒ บิลริบ 30,000 (แถว DEPOSIT) · FORFEITED · GL: รายได้+2200 = 30,000 · 2200 = VAT ครั้งเดียว · 2110 สุทธิ 0 · event deposit_forfeited (pct 100 · NO_SHOW) 1 ครั้ง", async () => {
    needTpl();
    const a = await book(ids.uM);
    const rid = await payOld(a);
    const r = await BK().setAppointmentStatus(ids.tA, ids.uM, a.id, "NO_SHOW");
    ok(r?.ok === true, fmt(r));
    await pump();
    const fb = await forfeitBillsOf(a.id);
    eq([fb.length, fb[0]?.status, fb[0]?.grand], [1, "PAID", DEP], "บิลริบ");
    const sp = split(DEP);
    const l = await jv([rid, fb[0].id]);
    eq([netCr(l, (c) => c.startsWith("4")), netCr(l, (c) => c === "2200"), netCr(l, (c) => c === "2110"), balanced(l)], [sp.baseSatang, sp.vatSatang, 0, true], "GL");
    eq((await info(ids.uM, a.id))?.state, "FORFEITED", "state");
    eq((await evOf("booking.deposit_forfeited", a.id)).map((e: Any) => [e.payload?.forfeitSatang, e.payload?.pct, e.payload?.reason]), [[DEP, 100, "NO_SHOW"]], "event");
  });
  await st("F-3", "ไม่มา pct 50 (snapshot) ⇒ บิลริบ 15,000 คีย์ dep-forfeit:<PosDeposit.id> · คงเหลือ REFUND_DUE 15,000 · ร้านคืน ⇒ REFUNDED (forfeited 15,000 · refunded 15,000) · GL: 2110 สุทธิ 0 · เงินสุทธิ 15,000 · รายได้+VAT 15,000", async () => {
    needTpl();
    const a = await bookWith(ids.uM, [["booking.deposit.forfeitPct", 50]]);
    const rid = await payOld(a);
    await BK().setAppointmentStatus(ids.tA, ids.uM, a.id, "NO_SHOW");
    await pump();
    const dep = await depOf(rid);
    const fb = await forfeitBillsOf(a.id);
    const key = (await q(`SELECT "idempotencyKey" AS k FROM "PosSale" WHERE id = $1`, [fb[0]?.id ?? ""]))[0]?.k;
    eq([fb.length, fb[0]?.grand, key, dep?.status, dep ? dep.amount - dep.used - dep.refunded : -1], [1, 15_000, `dep-forfeit:${dep?.id}`, "OPEN", 15_000], "ริบครึ่ง");
    const i1 = await info(ids.uM, a.id);
    eq([i1?.state, i1?.forfeitedSatang, i1?.refundDueSatang], ["REFUND_DUE", 15_000, 15_000], "info ก่อนคืน");
    const r = await D("refundDepositByShop")(shop("ownerA"), { unitId: ids.uM, appointmentId: a.id, reason: "คืนส่วนที่เหลือ" });
    ok(r?.ok === true, fmt(r));
    await pump();
    const cn = await refundsOf(rid);
    const i2 = await info(ids.uM, a.id);
    eq([cn.length, cn[0]?.grand, i2?.state, i2?.forfeitedSatang, i2?.refundedSatang], [1, 15_000, "REFUNDED", 15_000, 15_000], "หลังคืน");
    const l = await jv([rid, fb[0].id, cn[0].id]);
    eq([netCr(l, (c) => c === "2110"), -netCr(l, (c) => c.startsWith("1")), netCr(l, (c) => c.startsWith("4") || c === "2200"), balanced(l)], [0, 15_000, 15_000, true], "GL");
  });
  await st("F-4", "snapshot ชนะ: จองตอน pct 100 แล้วร้านเปลี่ยนเป็น 50 ⇒ ไม่มา ริบ 30,000 · จองตอน pct null ⇒ ไม่ริบ (REFUND_DUE ทั้งหมด)", async () => {
    needTpl();
    const a = await book(ids.uM);
    await payOld(a);
    await setVal("booking.deposit.forfeitPct", "UNIT", ids.uM, 50);
    try {
      await BK().setAppointmentStatus(ids.tA, ids.uM, a.id, "NO_SHOW");
      await pump();
      eq((await forfeitBillsOf(a.id)).map((b: Any) => b.grand), [DEP], "snapshot 100");
    } finally { await setVal("booking.deposit.forfeitPct", "UNIT", ids.uM, 100); }
    const b = await bookWith(ids.uM, [["booking.deposit.forfeitPct", null]]);
    await payOld(b);
    await BK().setAppointmentStatus(ids.tA, ids.uM, b.id, "NO_SHOW");
    await pump();
    eq((await forfeitBillsOf(b.id)).length, 0, "pct null");
    const i = await info(ids.uM, b.id);
    eq([i?.state, i?.refundDueSatang], ["REFUND_DUE", DEP], "info");
  });
  await st("F-5", "ปัดลงเข้าทางลูกค้า: มัดจำ 18,001 × 50% ⇒ บิลริบ 9,000 · คงเหลือ 9,001", async () => {
    needTpl();
    const a = await bookWith(ids.uM, [["booking.deposit.forfeitPct", 50]], { service: ids.ODD_M });
    eq((await apRow(a.id)).depositSatang, ODD_DEP, "มัดจำ");
    const rid = await payOld(a);
    await BK().setAppointmentStatus(ids.tA, ids.uM, a.id, "NO_SHOW");
    await pump();
    const d = await depOf(rid);
    eq([(await forfeitBillsOf(a.id)).map((x: Any) => x.grand), d ? d.amount - d.used - d.refunded : -1], [[9_000], 9_001], "ยอด");
  }, "MAJOR");
  await st("F-6", "ถอยจาก NO_SHOW (ริบบางส่วน) → CONFIRMED ⇒ บิลริบ VOIDED (ทาง moduleUnforfeitDeposit เดิม) · มัดจำกลับ OPEN 30,000 · PAID", async () => {
    needTpl();
    const a = await bookWith(ids.uM, [["booking.deposit.forfeitPct", 50]]);
    const rid = await payOld(a);
    await BK().setAppointmentStatus(ids.tA, ids.uM, a.id, "NO_SHOW");
    await pump();
    const back = await BK().setAppointmentStatus(ids.tA, ids.uM, a.id, "CONFIRMED", { actorUserId: USERS.ownerA });
    ok(back?.ok === true, fmt(back));
    await pump();
    const d = await depOf(rid);
    eq([(await forfeitBillsOf(a.id)).map((x: Any) => x.status), d?.status, d ? d.amount - d.used - d.refunded : -1], [["VOIDED"], "OPEN", DEP], "หลังถอย");
    eq((await info(ids.uM, a.id))?.state, "PAID", "state");
  }, "MAJOR");
  await st("F-7", "ยกเลิกช้า BLOCK (ค่าเริ่ม) ⇒ LATE_CHANGE (พฤติกรรม B.7) แม้ acceptForfeit · หน้าจ่าย lateCancel { allowed:false }", async () => {
    needTpl();
    const a = await book(ids.uM);
    await payOld(a);
    const st0 = (await apRow(a.id)).status;
    const c = await ON("cancelOnline")(a.token, { ip: newIp(), now: lateNow(a), acceptForfeit: true });
    eq(codeOf(c), "LATE_CHANGE", "ยกเลิก");
    eq((await apRow(a.id)).status, st0, "นัดไม่เปลี่ยน");
    const v = await MV(a.token, { now: lateNow(a) });
    eq(v?.pay?.lateCancel?.allowed, false, "lateCancel");
  });
  await st("F-8", "ยกเลิกช้า FORFEIT (snapshot): ไม่ยอมรับ ⇒ FORFEIT_CONFIRM_REQUIRED (ข้อความมียอด 300) ไม่เปลี่ยน · หน้าจ่าย allowed + forfeitSatang 30,000 · ยอมรับ ⇒ CANCELLED CUSTOMER_LATE · บิลริบ 30,000 · FORFEITED · booking.cancelled reason CUSTOMER_LATE · deposit_forfeited reason CUSTOMER_LATE", async () => {
    needTpl();
    const a = await bookWith(ids.uM, [["booking.late.lateCancelMode", "FORFEIT"]]);
    await payOld(a);
    const st0 = (await apRow(a.id)).status;
    const v = await MV(a.token, { now: lateNow(a) });
    eq([v?.pay?.lateCancel?.allowed, v?.pay?.lateCancel?.forfeitSatang], [true, DEP], "หน้าจ่าย");
    const c1 = await ON("cancelOnline")(a.token, { ip: newIp(), now: lateNow(a) });
    eq(codeOf(c1), "FORFEIT_CONFIRM_REQUIRED", "ไม่ยอมรับ");
    ok(digitsOf(String(c1?.reason ?? "")).includes("300"), `ข้อความไม่มียอด: ${c1?.reason}`);
    eq((await apRow(a.id)).status, st0, "ยังไม่ยกเลิก");
    const c2 = await ON("cancelOnline")(a.token, { ip: newIp(), now: lateNow(a), acceptForfeit: true });
    ok(c2?.ok === true, fmt(c2));
    await pump();
    const row = await apRow(a.id);
    eq([row.status, row.cancelReason, (await forfeitBillsOf(a.id)).map((b: Any) => b.grand)], ["CANCELLED", "CUSTOMER_LATE", [DEP]], "นัด/บิลริบ");
    eq((await info(ids.uM, a.id))?.state, "FORFEITED", "state");
    eq((await evOf("booking.cancelled", a.id)).map((e: Any) => e.payload?.reason), ["CUSTOMER_LATE"], "booking.cancelled");
    eq((await evOf("booking.deposit_forfeited", a.id)).map((e: Any) => e.payload?.reason), ["CUSTOMER_LATE"], "deposit_forfeited");
  });
  await st("F-9", "ยกเลิกช้า FORFEIT ยังไม่จ่าย ⇒ ยกเลิกได้ (CUSTOMER_LATE) · ไม่มีบิลริบ/ใบรับ · snapshot BLOCK แล้วร้านเปลี่ยนเป็น FORFEIT ⇒ ยัง LATE_CHANGE", async () => {
    needTpl();
    const a = await bookWith(ids.uM, [["booking.late.lateCancelMode", "FORFEIT"]]);
    const c = await ON("cancelOnline")(a.token, { ip: newIp(), now: lateNow(a), acceptForfeit: true });
    ok(c?.ok === true, fmt(c));
    await pump();
    eq([(await apRow(a.id)).cancelReason, (await forfeitBillsOf(a.id)).length, (await receiptsOf(a.id)).length], ["CUSTOMER_LATE", 0, 0], "ยังไม่จ่าย");
    const b = await book(ids.uM);
    await payOld(b);
    await setVal("booking.late.lateCancelMode", "UNIT", ids.uM, "FORFEIT");
    try {
      eq(codeOf(await ON("cancelOnline")(b.token, { ip: newIp(), now: lateNow(b), acceptForfeit: true })), "LATE_CHANGE", "snapshot BLOCK");
    } finally { await setVal("booking.late.lateCancelMode", "UNIT", ids.uM, "BLOCK").catch(() => undefined); }
  }, "MAJOR");

  // ═══════════════ M ยกเว้นสมาชิก ═══════════════
  console.log("\n── M: ยกเว้นมัดจำสมาชิกระดับ (#37) ──");
  const whoOf = (pid: string) => sqcIdentityToken(SECRET, { tenantId: ids.tA, partyId: pid, nowMs: Date.now(), ttlMin: 60 });
  await st("M-1", "ตัวตน LINE สมาชิก GOLD (memberExemptTier GOLD) ⇒ มัดจำ 0 · CONFIRMED · ไม่ถือช่อง · snapshot deposit.exempt MEMBER_TIER · หน้าจองขั้น 3 แสดงมัดจำ 0", async () => {
    needTpl();
    const a = await book(ids.uO, { who: whoOf(ids.PG), name: GOLD.name, phone: GOLD.phone });
    const r = await apRow(a.id);
    eq([r.depositSatang, r.status, r.channel, r.policySnapshot?.deposit?.exempt], [0, "CONFIRMED", "LINE", "MEMBER_TIER"], "นัด");
    const s = nextSlot(ids.uO);
    const v = await ON("loadOnlineBooking")(ref(ids.uO), { svc: ids.PERM, staff: s.staffId, date: s.dateStr, time: `${String(s.startMin / 60).padStart(2, "0")}:00`, who: whoOf(ids.PG) }, { ip: newIp() });
    eq([v?.view?.step, v?.view?.summary?.depositSatang], [3, 0], "หน้าจอง");
  });
  await st("M-2", "ช่อง ONLINE กรอกเบอร์สมาชิก GOLD เอง (ไม่ผ่าน OTP) ⇒ ไม่ยกเว้น: มัดจำ 30,000 · PENDING (กันสวมเบอร์)", async () => {
    needTpl();
    const a = await book(ids.uO, { name: GOLD.name, phone: GOLD.phone });
    const r = await apRow(a.id);
    eq([r.depositSatang, r.status, r.channel], [DEP, "PENDING", "ONLINE"], "นัด");
  });
  await st("M-3", "ตัวตน LINE สมาชิก SILVER (ต่ำกว่า GOLD) ⇒ มัดจำ 30,000 · ร้านพนักงานจอง (STAFF) เบอร์ GOLD ⇒ มัดจำ 0", async () => {
    needTpl();
    const a = await book(ids.uO, { who: whoOf(ids.PS), name: SILVER.name, phone: SILVER.phone });
    eq((await apRow(a.id)).depositSatang, DEP, "SILVER");
    const s = nextSlot(ids.uO);
    const b = await BK().bookAppointment({ tenantId: ids.tA, unitId: ids.uO }, { serviceId: ids.PERM, staffId: s.staffId, dateStr: s.dateStr, startMin: s.startMin, channel: "STAFF", customerName: GOLD.name, customerPhone: GOLD.phone });
    ok(b?.ok === true, fmt(b));
    eq((await apRow(b.id)).depositSatang, 0, "STAFF GOLD");
  });

  // ═══════════════ BL ใช้มัดจำในบิล ═══════════════
  console.log("\n── BL: ใช้มัดจำในบิล (เชื่อม B.10) ──");
  await st("BL-1", "depositForBill: นัดจ่ายแล้ว บิล 150,000 ⇒ { ใบรับ, 30,000 } · บิล 20,000 ⇒ 20,000 · หน่วยอื่น/ร้านอื่น/ยังไม่จ่าย ⇒ null · จำลอง B.10 (createSale แถว DEPOSIT + เงินสด) ⇒ USED · GL: รายได้+2200 = 150,000 · 2110 สุทธิ 0 · เงิน 150,000", async () => {
    needTpl();
    const a = await book(ids.uM);
    const rid = await payOld(a);
    const f = D("depositForBill");
    eq(await f({ tenantId: ids.tA, unitId: ids.uM }, a.id, 150_000), { refSaleId: rid, satang: DEP }, "เต็ม");
    eq(await f({ tenantId: ids.tA, unitId: ids.uM }, a.id, 20_000), { refSaleId: rid, satang: 20_000 }, "บางส่วน");
    const un = await book(ids.uM);
    eq([await f({ tenantId: ids.tA, unitId: ids.uX }, a.id, 150_000), await f({ tenantId: ids.tB, unitId: ids.uB }, a.id, 150_000), await f({ tenantId: ids.tA, unitId: ids.uM }, un.id, 150_000)], [null, null, null], "null");
    const dfb = await f({ tenantId: ids.tA, unitId: ids.uM }, a.id, 150_000);
    const posSys = await SYS_POS(ids.tA, ids.uM);
    const s = await must(posLoad, "pos/service").createSale({ tenantId: ids.tA, unitId: ids.uM, systemId: posSys, sourceModule: "BOOKING", sourceId: a.id, idempotencyKey: `svcb8-bl1-${RUN}`, lines: [{ name: "ดัดผม", qty: 1, unitPriceSatang: 150_000 }], payMethods: [{ type: "DEPOSIT", amountSatang: dfb.satang, refSaleId: dfb.refSaleId }, { type: "CASH", amountSatang: 150_000 - dfb.satang }] });
    const sid = s?.saleId ?? s?.id;
    ok(!!sid, fmt(s));
    await pump();
    eq([(await depOf(rid))?.status, (await info(ids.uM, a.id))?.state], ["USED", "USED"], "มัดจำ");
    const l = await jv([rid, sid]);
    const v = split(150_000).vatSatang;
    const vat = netCr(l, (c) => c === "2200");
    eq([netCr(l, (c) => c.startsWith("4") || c === "2200"), netCr(l, (c) => c === "2110"), -netCr(l, (c) => c.startsWith("1")), Math.abs(vat - v) <= 1, balanced(l)], [150_000, 0, 150_000, true, true], `GL (VAT ${vat} ≈ ${v})`);
  });

  // ═══════════════ X ยิงพร้อมกันข้ามโพรเซส ═══════════════
  console.log(`\n── X: ยิงพร้อมกันข้ามโพรเซส (${NCHILD} โพรเซส × 2 คำขอ ต่อฉาก) ──`);
  const X: Record<string, Any> = {};
  const scs: Scenario[] = [];
  const NX = NCHILD * 2;
  let xErr = "";
  const xSetErr: Record<string, string> = {};
  const xs = async (key: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { xSetErr[key] = errMsg(e); } };
  try {
    ok(tplOk, "ข้อมูลไม่พร้อม");
    // X-1 consumer ซ้ำ (export ตรง 5 + ผ่านทะเบียน 5) — สลิปอนุมัติแล้ว 1 ใบ
    await xs("x1", async () => {
      const a = await book(ids.uM);
      const s = await rawSlip(ids.tA, ids.uM, a.id, DEP, a.name);
      await decide(ids.tA, s.slipId, { decision: "APPROVE" });
      const evt = await slipEvt(s.slipId);
      await pool.query(`UPDATE "OutboxEvent" SET status = 'DONE', "processedAt" = now() WHERE "tenantId" = $1 AND type = 'payment.slip.approved' AND payload->>'slipId' = $2`, [ids.tA, s.slipId]);
      X.x1 = a;
      scs.push({ key: "x1", calls: Array.from({ length: NX }, (_, i) => (i % 2 ? { fn: "consumeReg", evt } : { fn: "consume", evt })) as CallSpec[] });
    });
    // X-2 ร้านกดยืนยัน ∥ consumer (สลิปอนุมัติแต่ยังไม่ลงเงิน)
    await xs("x2", async () => {
      const a = await book(ids.uM);
      const s = await rawSlip(ids.tA, ids.uM, a.id, DEP, a.name);
      await decide(ids.tA, s.slipId, { decision: "APPROVE" });
      const evt = await slipEvt(s.slipId);
      await pool.query(`UPDATE "OutboxEvent" SET status = 'DONE', "processedAt" = now() WHERE "tenantId" = $1 AND type = 'payment.slip.approved' AND payload->>'slipId' = $2`, [ids.tA, s.slipId]);
      X.x2 = a;
      scs.push({ key: "x2", calls: Array.from({ length: NX }, (_, i) => (i % 2 ? { fn: "confirm", ctx: shop("ownerA"), input: { unitId: ids.uM, appointmentId: a.id } } : { fn: "consume", evt })) as CallSpec[] });
    });
    // X-3 หมดเวลา ∥ consumer (สลิปอนุมัติ · ถือช่อง 1 นาที)
    await xs("x3", async () => {
      const a = await bookWith(ids.uM, [["booking.deposit.payWithinMin", 1]]);
      const s = await rawSlip(ids.tA, ids.uM, a.id, DEP, a.name);
      await decide(ids.tA, s.slipId, { decision: "APPROVE" });
      const evt = await slipEvt(s.slipId);
      await pool.query(`UPDATE "OutboxEvent" SET status = 'DONE', "processedAt" = now() WHERE "tenantId" = $1 AND type = 'payment.slip.approved' AND payload->>'slipId' = $2`, [ids.tA, s.slipId]);
      X.x3 = a;
      const nowMs = Date.now() + 3 * MIN;
      scs.push({ key: "x3", calls: Array.from({ length: NX }, (_, i) => (i % 2 ? { fn: "expire", nowMs } : { fn: "consume", evt })) as CallSpec[] });
    });
    // X-4 หมดเวลาซ้อน 10 ทาง (6 นัดไม่จ่าย)
    await xs("x4", async () => {
      const list: Appt[] = [];
      for (let i = 0; i < 6; i++) list.push(await bookWith(ids.uM, [["booking.deposit.payWithinMin", 1]]));
      X.x4 = list;
      const nowMs = Date.now() + 3 * MIN;
      scs.push({ key: "x4", calls: Array.from({ length: NX }, () => ({ fn: "expire", nowMs })) as CallSpec[] });
    });
    // X-5 แนบสลิป ∥ หมดเวลา (3 นัด · ถือ 1 นาที · สาขา m)
    await xs("x5", async () => {
      const list: Appt[] = [];
      for (let i = 0; i < 3; i++) list.push(await bookWith(ids.uM, [["booking.deposit.payWithinMin", 1]]));
      X.x5 = list;
      const calls: CallSpec[] = [];
      for (let i = 0; i < NX; i++) {
        const a = list[i % 3];
        const row = await apRow(a.id);
        if (i < 6) calls.push({ fn: "submit", token: a.token, b64: Buffer.from(png()).toString("base64"), script: goodSlip(DEP, a.name), key: `svcb8-x5-${i}-${RUN}`, nowMs: new Date(row.createdAt).getTime() + 30_000, ip: newIp() });
        else calls.push({ fn: "expire", nowMs: Date.now() + 3 * MIN });
      }
      scs.push({ key: "x5", calls });
    });
    // X-6 คืนซ้ำ 10 ทาง (REFUND_DUE)
    await xs("x6", async () => {
      const a = await book(ids.uM);
      await payOld(a);
      const c = await ON("cancelOnline")(a.token, { ip: newIp() });
      ok(c?.ok === true, `ตั้งฉาก X-6 ${fmt(c)}`);
      X.x6 = a;
      scs.push({ key: "x6", calls: Array.from({ length: NX }, () => ({ fn: "refund", ctx: shop("ownerA"), input: { unitId: ids.uM, appointmentId: a.id, reason: "คืนพร้อมกัน" } })) as CallSpec[] });
    });
    // X-7 ยกเลิกช้า (ยอมเสียมัดจำ) 10 ทาง
    await xs("x7", async () => {
      const a = await bookWith(ids.uM, [["booking.late.lateCancelMode", "FORFEIT"]]);
      await payOld(a);
      X.x7 = a;
      TOKENS_USED.add(a.token);
      scs.push({ key: "x7", calls: Array.from({ length: NX }, () => ({ fn: "cancel", token: a.token, nowMs: lateNow(a).getTime(), accept: true, ip: newIp() })) as CallSpec[] });
    });
    // X-8 ไม่มา 10 ทาง (pct 50)
    await xs("x8", async () => {
      const a = await bookWith(ids.uM, [["booking.deposit.forfeitPct", 50]]);
      await payOld(a);
      X.x8 = a;
      scs.push({ key: "x8", calls: Array.from({ length: NX }, () => ({ fn: "noshow", t: ids.tA, u: ids.uM, id: a.id })) as CallSpec[] });
    });
    X.out = await runHarness(scs, NCHILD);
    await pump();
    await pump();
  } catch (e) { xErr = errMsg(e); }
  const xr = (k: string): CallOut[] => { ok(!xSetErr[k], `ตั้งฉาก ${k}: ${xSetErr[k]}`); ok(!xErr, `ฮาร์เนส: ${xErr}`); const r = X.out?.get(k); ok(Array.isArray(r) && r.length === NX, `ผล ${k} ไม่ครบ`); return r; };
  const noThrow = (r: CallOut[]) => ok(r.every((x) => !x.threw), `throw: ${r.find((x) => x.threw)?.threw}`);
  await st("X-1", "X4 consumer สลิปอนุมัติ 10 ทางพร้อมกัน (export ตรง + ทะเบียน) ⇒ ใบรับ 1 · PosDeposit 1 · CONFIRMED · booking.deposit_paid 1 · ไม่มี throw", async () => {
    const r = xr("x1");
    noThrow(r);
    const a = X.x1 as Appt;
    const rc = await receiptsOf(a.id);
    eq([rc.length, (await apRow(a.id)).status, (await evOf("booking.deposit_paid", a.id)).length], [1, "CONFIRMED", 1], "ผล");
    eq(Number((await q(`SELECT count(*)::int AS n FROM "PosDeposit" WHERE "tenantId" = $1 AND "idempotencyKey" LIKE $2`, [ids.tA, `%booking-deposit-${a.id}%`]))[0].n), 1, "PosDeposit");
  });
  await st("X-2", "X3 ร้านกดยืนยัน ∥ consumer สลิปเดียวกัน ⇒ ใบรับ 1 · CONFIRMED · PAID", async () => {
    const r = xr("x2");
    noThrow(r);
    const a = X.x2 as Appt;
    eq([(await receiptsOf(a.id)).length, (await apRow(a.id)).status, (await info(ids.uM, a.id))?.state], [1, "CONFIRMED", "PAID"], "ผล");
  });
  await st("X-3", "X5 หมดเวลา ∥ consumer (สลิปอนุมัติแล้ว = ไม่ปล่อย) ⇒ CONFIRMED · ใบรับ 1 · ไม่มี booking.cancelled", async () => {
    const r = xr("x3");
    noThrow(r);
    const a = X.x3 as Appt;
    eq([(await apRow(a.id)).status, (await receiptsOf(a.id)).length, (await evOf("booking.cancelled", a.id)).length], ["CONFIRMED", 1, 0], "ผล");
  });
  await st("X-4", "X5 expireDepositHolds 10 ทางซ้อน ⇒ ทุกนัด CANCELLED DEPOSIT_TIMEOUT · booking.cancelled 1 ต่อนัดพอดี", async () => {
    const r = xr("x4");
    noThrow(r);
    for (const a of X.x4 as Appt[]) {
      const row = await apRow(a.id);
      eq([row.status, row.cancelReason, (await evOf("booking.cancelled", a.id)).length], ["CANCELLED", "DEPOSIT_TIMEOUT", 1], a.id);
    }
  });
  await st("X-5", "X3 แนบสลิป ∥ หมดเวลา ⇒ หลังร้านอนุมัติสลิปที่ค้าง: ทุกนัด = (CONFIRMED + ใบรับ 1) หรือ (CANCELLED + ไม่มีสลิปที่อนุมัติ + ไม่มีใบรับ) หรือ (CANCELLED + ใบรับ 1 + REFUND_DUE) · ไม่มีใบรับเกิน 1 · ไม่มีเงินเข้าที่ไม่ผูกนัด", async () => {
    const r = xr("x5");
    noThrow(r);
    for (const a of X.x5 as Appt[]) {
      const live = await q(`SELECT id, status::text AS status FROM "PaymentSlip" WHERE "tenantId" = $1 AND "refId" = $2 AND status::text IN ('PENDING','NEEDS_REVIEW')`, [ids.tA, a.id]);
      for (const s of live) await decide(ids.tA, s.id, { decision: "APPROVE" }).catch(() => undefined);
    }
    await pump();
    await pump();
    for (const a of X.x5 as Appt[]) {
      const row = await apRow(a.id);
      const rc = await receiptsOf(a.id);
      const approved = Number((await q(`SELECT count(*)::int AS n FROM "PaymentSlip" WHERE "tenantId" = $1 AND "refId" = $2 AND status::text IN ('APPROVED','AUTO_APPROVED')`, [ids.tA, a.id]))[0].n);
      ok(rc.length <= 1, `${a.id} ใบรับ ${rc.length}`);
      const okState =
        (row.status === "CONFIRMED" && rc.length === 1 && row.depositSaleId === rc[0].id) ||
        (row.status === "CANCELLED" && approved === 0 && rc.length === 0) ||
        (row.status === "CANCELLED" && rc.length === 1 && row.depositSaleId === rc[0].id && (await info(ids.uM, a.id))?.state === "REFUND_DUE");
      ok(okState, `${a.id}: ${row.status} สลิปอนุมัติ ${approved} ใบรับ ${rc.length}`);
    }
  });
  await st("X-6", "X3 คืนมัดจำ 10 ทางพร้อมกัน ⇒ ใบคืน 1 · PosDeposit REFUNDED · ok ทุกทาง (duplicated) หรือรหัสไม่ใช่ throw", async () => {
    const r = xr("x6");
    noThrow(r);
    const a = X.x6 as Appt;
    const rid = (await apRow(a.id)).depositSaleId ?? (await receiptsOf(a.id))[0]?.id;
    eq([(await refundsOf(rid)).length, (await depOf(rid))?.status], [1, "REFUNDED"], "ผล");
    eq((await evOf("booking.deposit_refunded", a.id)).length, 1, "event");
  });
  await st("X-7", "X3 ยกเลิกช้า (ยอมเสียมัดจำ) 10 ทาง ⇒ สำเร็จ 1 · อื่น BAD_STATE/LOST_RACE · บิลริบ 1 · deposit_forfeited 1 (ระบายคิวซ้ำแล้ว)", async () => {
    const r = xr("x7");
    noThrow(r);
    eq(r.filter((x) => x.ok).length, 1, `สำเร็จ ${fmt(r.map((x) => x.code))}`);
    ok(r.filter((x) => !x.ok).every((x) => x.code === "BAD_STATE" || x.code === "LOST_RACE" || x.code === "BUSY"), fmt(r.map((x) => x.code)));
    const a = X.x7 as Appt;
    eq([(await forfeitBillsOf(a.id)).filter((b: Any) => b.status === "PAID").length, (await evOf("booking.deposit_forfeited", a.id)).length], [1, 1], "ผล");
  });
  await st("X-8", "X3 ไม่มา 10 ทาง (pct 50) ⇒ บิลริบ PAID 1 ใบ 15,000 · คงเหลือ 15,000 · deposit_forfeited 1", async () => {
    const r = xr("x8");
    noThrow(r);
    const a = X.x8 as Appt;
    const fb = (await forfeitBillsOf(a.id)).filter((b: Any) => b.status === "PAID");
    const d = await depOf((await apRow(a.id)).depositSaleId);
    eq([fb.length, fb[0]?.grand, d ? d.amount - d.used - d.refunded : -1, (await evOf("booking.deposit_forfeited", a.id)).length], [1, 15_000, 15_000, 1], "ผล");
  });

  // ═══════════════ XS ข้ามร้าน/ข้ามหน่วย ═══════════════
  console.log("\n── XS: ข้ามร้าน · ข้ามหน่วย ──");
  await st("XS-1", "depositInfo: ctx ร้าน B / สาขา x บนนัดสาขา m ⇒ null · depositQueue เจ้าของ B ที่สาขา m ⇒ NOT_FOUND", async () => {
    needTpl();
    const a = await book(ids.uM);
    eq([await D("depositInfo")({ tenantId: ids.tB, unitId: ids.uB }, a.id), await D("depositInfo")({ tenantId: ids.tA, unitId: ids.uX }, a.id)], [null, null], "info");
    eq(codeOf(await D("depositQueue")(shop("ownerB", ids.tB), { unitId: ids.uM })), "NOT_FOUND", "คิว");
  });
  await st("XS-2", "ร้าน B/สาขาอื่น ยืนยัน/คืน มัดจำนัดของร้าน A ⇒ NOT_FOUND · ไม่มีใบรับ/ใบคืน", async () => {
    needTpl();
    ok(hasDep(), "ยังไม่มีงาน");
    const a = await book(ids.uM);
    const res = [
      await D("confirmDepositByShop")(shop("ownerB", ids.tB), { unitId: ids.uM, appointmentId: a.id }),
      await D("confirmDepositByShop")(shop("ownerB", ids.tB), { unitId: ids.uB, appointmentId: a.id }),
      await D("confirmDepositByShop")(shop("ownerA"), { unitId: ids.uX, appointmentId: a.id }),
      await D("refundDepositByShop")(shop("ownerB", ids.tB), { unitId: ids.uB, appointmentId: refundDue?.id ?? a.id, reason: "ข้ามร้าน" }),
    ];
    eq(res.map(codeOf), ["NOT_FOUND", "NOT_FOUND", "NOT_FOUND", "NOT_FOUND"], "รหัส");
    eq((await receiptsOf(a.id)).length, 0, "ใบรับ");
  });
  await st("XS-3", "สลิปของร้าน B อ้าง id นัดร้าน A (อนุมัติแล้ว) ⇒ นัด A ไม่เปลี่ยน · ไม่มีใบรับทั้งสองร้าน", async () => {
    needTpl();
    const a = await book(ids.uM);
    const s = await rawSlip(ids.tB, ids.uB, a.id, DEP, a.name);
    await decide(ids.tB, s.slipId, { decision: "APPROVE" });
    await pump();
    const row = await apRow(a.id);
    eq([row.status, row.depositPaidAt, (await receiptsOf(a.id)).length], ["PENDING", null, 0], "นัด A");
    eq(Number((await q(`SELECT count(*)::int AS n FROM "PosSale" WHERE "tenantId" = $1 AND "sourceModule" = 'POS_DEPOSIT'`, [ids.tB]))[0].n), 0, "ใบรับร้าน B");
  });

  // ═══════════════ L บัญชีรวม ═══════════════
  console.log("\n── L: บัญชีรวมของร้านทดสอบ ──");
  await st("L-1", "ทุก journal entry ของร้าน A/B สมดุล (Σdr = Σcr ต่อ entry) · ใบรับมัดจำที่ยัง PAID ต่อนัด ≤ 1 · บิลริบ PAID ต่อนัด ≤ 1 · ใบคืนต่อใบรับ ≤ 1", async () => {
    needTpl();
    const bad = await q(`SELECT e.id FROM "AccountJournalEntry" e JOIN "AccountJournalLine" l ON l."entryId" = e.id WHERE e."tenantId" = ANY($1::text[]) GROUP BY e.id HAVING sum(l.debit) <> sum(l.credit)`, [[ids.tA, ids.tB]]);
    eq(bad.length, 0, "entry ไม่สมดุล");
    const dupR = await q(`SELECT regexp_replace("idempotencyKey", '-r[0-9]+$', '') AS k, count(*)::int AS n FROM "PosSale" WHERE "tenantId" = $1 AND "sourceModule" = 'POS_DEPOSIT' AND status::text = 'PAID' AND "refundedSatang" = 0 AND "idempotencyKey" LIKE 'booking-deposit-%' GROUP BY 1 HAVING count(*) > 1`, [ids.tA]);
    eq(dupR, [], "ใบรับซ้ำ");
    const dupF = await q(`SELECT "sourceId", count(*)::int AS n FROM "PosSale" WHERE "tenantId" = $1 AND "sourceModule" = 'BOOKING' AND "idempotencyKey" LIKE 'dep-forfeit:%' AND status::text = 'PAID' GROUP BY 1 HAVING count(*) > 1`, [ids.tA]);
    eq(dupF, [], "บิลริบซ้ำ");
    const dupC = await q(`SELECT "refSaleId", count(*)::int AS n FROM "PosSale" WHERE "tenantId" = $1 AND "docType" = 'REFUND' GROUP BY 1 HAVING count(*) > 1`, [ids.tA]);
    eq(dupC, [], "ใบคืนซ้ำ");
  });

  // ═══════════════ EV event + PII ═══════════════
  console.log("\n── EV: event ใหม่ 3 ทะเบียน · PII ──");
  await st("EV-1", `event ใหม่ ${NEW_EVENTS.join(" · ")} อยู่ครบ 3 ทะเบียน (consumers · AUTOMATION_EVENTS · WEBHOOK_EVENTS)`, async () => {
    const c = CONS().consumers ?? {};
    const al = must(await tryImport("@/lib/automation/labels" as string), "automation/labels");
    const wl = must(await tryImport("@/lib/webhooks/labels" as string), "webhooks/labels");
    const av = new Set((al.AUTOMATION_EVENTS ?? []).map((x: Any) => x.value));
    const wv = new Set((wl.WEBHOOK_EVENTS ?? []).map((x: Any) => x.value));
    const miss = NEW_EVENTS.filter((e) => typeof c[e] !== "function" || !av.has(e) || !wv.has(e));
    eq(miss, [], "ขาด");
  }, "MAJOR");
  await st("EV-2", "payload ของ event มัดจำ/ยกเลิก/สลิป ทุกแถวของร้านทดสอบ: ไม่มีชื่อ/เบอร์ลูกค้า · ไม่มี token/hash ลิงก์ · คีย์ของ deposit_* อยู่ในรายการสัญญาเท่านั้น", async () => {
    needTpl();
    const rows = await q(`SELECT type, payload FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND (type LIKE 'booking.%' OR type LIKE 'payment.slip.%')`, [[ids.tA, ids.tB]]);
    ok(rows.length > 0, "ไม่มี event");
    const json = JSON.stringify(rows);
    eq(piiLeak(json), [], "PII");
    // ORACLE-EDIT (ผู้คุม 31 ต.ค. · b8-EV2) นับเฉพาะ token จริง (≥16 ตัว) — token ขยะสั้นที่ใช้ทดสอบการปฏิเสธ (เช่น "abc") บังเอิญเป็นส่วนของ id สุ่มใน payload ⇒ แดงเท็จ · hash ยังตรวจทุกตัว
    const toks = [...TOKENS_USED].filter((t) => (t.length >= 16 && json.includes(t)) || json.includes(sha256hex(t)));
    eq(toks.length, 0, "token/hash");
    const allow: Record<string, string[]> = {
      "booking.deposit_paid": ["appointmentId", "unitId", "amountSatang", "requiredSatang", "via", "partial", "late", "status", "tenantId"],
      "booking.deposit_forfeited": ["appointmentId", "unitId", "forfeitSatang", "pct", "reason", "tenantId"],
      "booking.deposit_refunded": ["appointmentId", "unitId", "refundSatang", "tenantId"],
    };
    const extra = rows.filter((r: Any) => allow[r.type]).flatMap((r: Any) => Object.keys(r.payload ?? {}).filter((k) => !allow[r.type].includes(k)).map((k) => `${r.type}.${k}`));
    eq([...new Set(extra)], [], "คีย์นอกสัญญา");
    ok(rows.some((r: Any) => allow[r.type]), "ยังไม่มี event มัดจำใหม่");
  });

  // ═══════════════ RL rate limit ═══════════════
  console.log("\n── RL: rate limit (นับก่อนแตะฐาน/อัปไฟล์) ──");
  await st("RL-1", "แนบสลิป token เดียว 11 ครั้ง (IP ต่างกัน) ⇒ ครั้งที่ 11 RATE_LIMITED และไม่อัปไฟล์ (ถังต่อ token 10/10 นาที)", async () => {
    needTpl();
    ok(hasDep(), "ยังไม่มีงาน");
    const a = await book(ids.uB); // ร้าน B ไม่มีผู้รับ ⇒ NO_RECEIVER ทุกครั้งก่อนอัป (ไม่สร้างสลิป)
    const out: string[] = [];
    let putAt11 = -1;
    for (let i = 0; i < 11; i++) { const p0 = PUTS.length; out.push(codeOf(await SUB(a.token))); if (i === 10) putAt11 = PUTS.length - p0; }
    eq(out[10], "RATE_LIMITED", `ผล ${out.join(",")}`);
    eq(putAt11, 0, "อัปไฟล์ครั้งที่ 11");
  }, "MAJOR");
  await st("RL-2", "หน้าจ่าย IP เดียว 61 ครั้ง ⇒ ครั้งที่ 61 RATE_LIMITED (ถัง bq:manage:ip 60/10 นาที ร่วมกับลิงก์จัดการนัด)", async () => {
    needTpl();
    ok(hasDep(), "ยังไม่มีงาน");
    const a = await book(ids.uM);
    const ip = newIp();
    let last: Any = null;
    for (let i = 0; i < 61; i++) last = await MV(a.token, { ip });
    eq(codeOf(last), "RATE_LIMITED", "ครั้งที่ 61");
  }, "MAJOR");

  // ═══════════════ U DOM ═══════════════
  console.log("\n── U: คอมโพเนนต์ (renderToStaticMarkup · สัญญา DOM §4) ──");
  await st("U-1", "PublicBooking ขั้น 3 ดัดผม (มัดจำ 30,000): [data-bk-deposit-slot] มี [data-bk-pay-method=PROMPTPAY] ข้อความมี 300 และนาทีที่ต้องจ่าย · ปุ่ม [data-bk-submit] มียอด 300", async () => {
    needTpl();
    const s = nextSlot(ids.uO);
    const time = `${String(Math.floor(s.startMin / 60)).padStart(2, "0")}:${String(s.startMin % 60).padStart(2, "0")}`;
    const qy = { svc: ids.PERM, staff: s.staffId, date: s.dateStr, time };
    const v = await ON("loadOnlineBooking")(ref(ids.uO), qy, { ip: newIp() });
    ok(v?.ok === true && v.view.step === 3 && v.view.summary?.depositSatang === DEP, `view ${fmt(v?.view?.step)} ${fmt(v?.view?.summary)}`);
    const html = render(BookingC, { view: v.view, basePath: `/s/${SLUGS[ids.tA]}/${SLUGS[ids.uO]}`, query: qy, idempotencyKey: "svcb8-u1" });
    const slot = boxes(html, "data-bk-deposit-slot")[0];
    ok(!!slot, "ไม่มี slot");
    const pm = boxes(slot.html, "data-bk-pay-method")[0];
    ok(pm?.attrs["data-bk-pay-method"] === "PROMPTPAY", "ไม่มี data-bk-pay-method=PROMPTPAY");
    const t = digitsOf(textOf(pm.html));
    ok(t.includes("300") && t.includes(String(v.view.policy?.payWithinMin)), `ข้อความ "${textOf(pm.html)}"`);
    const btn = boxes(html, "data-bk-submit")[0];
    ok(!!btn && digitsOf(textOf(btn.html)).includes("300"), `ปุ่ม "${btn ? textOf(btn.html) : ""}"`);
  });
  await st("U-2", "PublicBooking ขั้น 3 ตัดผม (มัดจำ 0): ไม่มี slot/pay-method · ปุ่มไม่มีสัญลักษณ์เงิน", async () => {
    needTpl();
    const s = nextSlot(ids.uO);
    const time = `${String(Math.floor(s.startMin / 60)).padStart(2, "0")}:${String(s.startMin % 60).padStart(2, "0")}`;
    const qy = { svc: ids.CUT, staff: s.staffId, date: s.dateStr, time };
    const v = await ON("loadOnlineBooking")(ref(ids.uO), qy, { ip: newIp() });
    ok(v?.ok === true && v.view.step === 3, "view");
    const html = render(BookingC, { view: v.view, basePath: "/s/x/y", query: qy, idempotencyKey: "svcb8-u2" });
    eq([boxes(html, "data-bk-deposit-slot").length, boxes(html, "data-bk-pay-method").length], [0, 0], "slot");
    const btn = boxes(html, "data-bk-submit")[0];
    ok(!!btn && !/฿|THB/.test(textOf(btn.html)), `ปุ่ม "${btn ? textOf(btn.html) : ""}"`);
  }, "MAJOR");
  const manageHtml = async (a: Appt, now?: Date): Promise<{ html: string; pay: Any }> => {
    const mv = await ON("loadManageView")(a.token, { ip: newIp(), ...(now ? { now } : {}) });
    ok(mv?.ok === true, `loadManageView ${fmt(mv)}`);
    const pr = await MV(a.token, now ? { now } : {});
    ok(pr?.ok === true, `loadDepositPay ${fmt(pr)}`);
    return { html: render(ManageC, { view: mv.view, token: a.token, actions: { cancel: noopAct, reschedule: noopAct, slip: noopAct, lateCancel: noopAct }, pay: pr.pay }), pay: pr.pay };
  };
  await st("U-3", "ManageCard AWAITING: [data-bk-deposit-state=AWAITING] · img[data-bk-qr] src = qr ของหน้าจ่าย · [data-bk-pay-until][data-ms] · form[data-bk-slip-form] มี file name=slip (accept รูป) + hidden idempotencyKey · ไม่มีชื่อ/เบอร์", async () => {
    needTpl();
    const a = await book(ids.uO);
    const { html, pay } = await manageHtml(a);
    eq(boxes(html, "data-bk-deposit-state")[0]?.attrs["data-bk-deposit-state"], "AWAITING", "state");
    const img = boxes(html, "data-bk-qr")[0];
    ok(img?.tag === "img" && img.attrs.src === pay.qr?.svgDataUrl, "QR");
    eq(boxes(html, "data-bk-pay-until")[0]?.attrs["data-ms"], String(pay.holdUntilMs), "นับถอยหลัง");
    const form = boxes(html, "data-bk-slip-form")[0];
    ok(!!form, "ไม่มีฟอร์มแนบสลิป");
    const ins = inputsOf(form.html);
    const file = ins.find((x) => x.type === "file" && x.name === "slip");
    ok(!!file && /image\/(jpeg|png|webp)/.test(file.accept ?? ""), `file ${fmt(file)}`);
    ok(ins.some((x) => x.type === "hidden" && x.name === "idempotencyKey" && (x.value ?? "").length > 0), "idempotencyKey");
    eq(piiLeak(html), [], "PII");
  });
  await st("U-4", "ManageCard REFUND_DUE: [data-bk-refund-due][data-satang=30000] · ไม่มีฟอร์มแนบสลิป/QR", async () => {
    needTpl();
    const a = await book(ids.uM);
    await payOld(a);
    const c = await ON("cancelOnline")(a.token, { ip: newIp() });
    ok(c?.ok === true, fmt(c));
    const { html } = await manageHtml(a);
    eq(boxes(html, "data-bk-refund-due")[0]?.attrs["data-satang"], String(DEP), "refund-due");
    eq([boxes(html, "data-bk-slip-form").length, boxes(html, "data-bk-qr").length], [0, 0], "ไม่มีฟอร์ม");
  }, "MAJOR");
  await st("U-5", "ManageCard ยกเลิกช้า: FORFEIT ⇒ form[data-bk-late-cancel] + hidden acceptForfeit=1 + [data-bk-forfeit][data-satang=30000] · BLOCK ⇒ ไม่มีฟอร์มนี้", async () => {
    needTpl();
    const a = await bookWith(ids.uM, [["booking.late.lateCancelMode", "FORFEIT"]]);
    await payOld(a);
    const { html } = await manageHtml(a, lateNow(a));
    const f = boxes(html, "data-bk-late-cancel")[0];
    ok(!!f && inputsOf(f.html).some((x) => x.type === "hidden" && x.name === "acceptForfeit" && x.value === "1"), "ฟอร์ม");
    eq(boxes(html, "data-bk-forfeit")[0]?.attrs["data-satang"], String(DEP), "ยอดริบ");
    const b = await book(ids.uM);
    await payOld(b);
    eq(boxes((await manageHtml(b, lateNow(b))).html, "data-bk-late-cancel").length, 0, "BLOCK");
  });
  await st("U-6", "ManageCard ร้านไม่มีผู้รับ: [data-bk-no-receiver] · ไม่มี img QR · ไม่ส่ง pay ⇒ ไม่มี data-bk-deposit-state (หน้าตาเดิม B.7)", async () => {
    needTpl();
    const b = await book(ids.uB);
    const { html } = await manageHtml(b);
    eq([boxes(html, "data-bk-no-receiver").length > 0, boxes(html, "data-bk-qr").length], [true, 0], "ไม่มีผู้รับ");
    const mv = await ON("loadManageView")(b.token, { ip: newIp() });
    const old = render(ManageC, { view: mv.view, token: b.token, actions: { cancel: noopAct, reschedule: noopAct } });
    eq(boxes(old, "data-bk-deposit-state").length, 0, "ไม่ส่ง pay");
  }, "MAJOR");

  // ═══════════════ H server จริง ═══════════════
  console.log("\n── H: server จริง (QC_BASE) ──");
  const BASE = (process.env.QC_BASE ?? "").replace(/\/+$/, "");
  const H_NAMES: Record<string, string> = {
    "H-1": "GET /bq/m/<token> (AWAITING สาขา o) ⇒ 200 มี data-bk-deposit-state + img data-bk-qr · ไม่มี PII",
    "H-2": "GET หน้าร้านขั้น 3 ดัดผม ⇒ 200 มี data-bk-pay-method=\"PROMPTPAY\"",
  };
  let hReady = "";
  if (!BASE) hReady = "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + เปิด server แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port>";
  else if (!tplOk || !hasDep()) hReady = "ข้อมูล/งานของใบยังไม่พร้อม";
  if (hReady) for (const id of Object.keys(H_NAMES)) skip(id, H_NAMES[id], hReady, "MAJOR");
  else {
    const get = async (path: string) => { const r = await fetch(`${BASE}${path}`, { headers: { "x-forwarded-for": newIp() }, redirect: "manual", signal: AbortSignal.timeout(60_000) }); return { status: r.status, html: await r.text() }; };
    await st("H-1", H_NAMES["H-1"], async () => {
      const a = await book(ids.uO);
      const r = await get(`/bq/m/${a.token}`);
      ok(r.status === 200 && /data-bk-deposit-state="AWAITING"/.test(r.html) && /<img[^>]*data-bk-qr/.test(r.html), `status ${r.status}`);
      eq(piiLeak(r.html), [], "PII");
    }, "MAJOR");
    await st("H-2", H_NAMES["H-2"], async () => {
      const s = nextSlot(ids.uO);
      const time = `${String(Math.floor(s.startMin / 60)).padStart(2, "0")}:${String(s.startMin % 60).padStart(2, "0")}`;
      const r = await get(`/s/${SLUGS[ids.tA]}/${SLUGS[ids.uO]}?svc=${ids.PERM}&staff=${s.staffId}&date=${s.dateStr}&time=${time}`);
      ok(r.status === 200 && /data-bk-pay-method="PROMPTPAY"/.test(r.html), `status ${r.status}`);
    }, "MAJOR");
  }

  // ═══════════════ V ภาพ ═══════════════
  console.log("\n── V: ภาพ (จอง 03 ค · กล่อง PromptPay + ปุ่มจ่ายมัดจำ) ──");
  {
    const specs = SQC_VISUAL_SPECS["b.8"];
    const name = "ภาพ b.8 (online-step3-deposit) 1440 + 390 · HTTP < 400 · ไม่ล้นแนวนอน · ไม่มี page error (ฉากเดียวกับ B.7: scripts/svc-qc-online-scene.mts)";
    if (!Array.isArray(specs) || specs.length !== 1) record("V-1", name, "FAIL", `SQC_VISUAL_SPECS b.8 ${fmt(specs)}`, "MAJOR");
    else if (!BASE) skip("V-1", name, "ไม่มี QC_BASE — ผู้คุม build QC + reseed + ฉาก B.7 + server แล้วรันซ้ำด้วย QC_BASE", "MAJOR");
    else {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "b.8", "--user", "owner", "--base", BASE], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      if (r.status === 0) record("V-1", `${name} (ภาพ .qc-shots/svc/b.8 — ผู้คุมเทียบ PARITY 03ค)`, "PASS", "", "MAJOR");
      else record("V-1", name, "FAIL", `exit=${r.status} ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "MAJOR");
    }
  }
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  for (const f of goFiles) { try { if (existsSync(f)) unlinkSync(f); } catch { /* ไฟล์ของเราเอง */ } }
  try { await cleanup([ids.tA, ids.tB]); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupGlobal();
  await st("Z-1", "หลังล้าง: tenant `qc-svc-b8-*` 0 · นัด/สลิป/ใบรับ/บัญชี/outbox/audit ของร้านทดสอบ 0 · ผู้ใช้ทดสอบ 0 · ถัง rate ของทดสอบ 0 · ไฟล์สัญญาณ /tmp/svc-b8-go-* ของรอบนี้ 0", async () => {
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0].n, 0, "tenant");
    for (const t of ["Appointment", "PaymentSlip", "PosSale", "PosDeposit", "AccountJournalEntry", "OutboxEvent", "AuditLog", "SettingValue", "TenantIntegration"]) {
      const has = (await q(`SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = 'tenantId'`, [t])).length;
      if (!has) continue;
      eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [[ids.tA, ids.tB]]))[0].n, 0, t);
    }
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE 'svc-b8-%@shark.local'`))[0].n, 0, "ผู้ใช้");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE '%svcb8%' OR key LIKE '%qc-svc-b8-%' OR key = ANY($1::text[])`, [[...TOKENS_USED].map(tkBucket)]))[0].n, 0, "ถัง rate");
    eq(goFiles.filter((f) => existsSync(f)), [], "ไฟล์สัญญาณ");
  }, "MAJOR");
  await pool.end();
  await P?.$disconnect?.().catch(() => undefined);
}

// ═══════════════ S. ไฟล์ · สัญญาโค้ด ═══════════════
console.log("\n── S: ไฟล์ · สัญญาโค้ด ──");
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
const diffLines = (rel: string) => (spawnSync("git", ["diff", "-U0", "HEAD", "--", rel], { cwd: ROOT, encoding: "utf8" }).stdout ?? "").split("\n").filter((l) => /^[+-](?![+-])/.test(l));
const OWN = new Set<string>([F.deposit, F.service, F.online, F.index, F.access, F.defs, F.consumers, F.autoLabels, F.hookLabels, F.perms, F.compBooking, F.pageManage, F.actManage, F.actShop, F.pageShop, F.minute, F.dict]);
{
  const ch = dirty(["src", "prisma"]);
  const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.deposit}`]); return true; } catch { return false; } })();
  if (ch.length === 0 && headHas) skip("S-1", "แตะเฉพาะไฟล์ของใบ", "B.8 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ");
  else await st("S-1", "แตะเฉพาะไฟล์ของใบ (§1 · ไฟล์ใต้ src/components/booking/online/ ได้) · มี deposit.ts", () => {
    const outside = ch.filter((f) => !OWN.has(f) && !f.startsWith("src/components/booking/online/"));
    ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 6).join(", ")}`);
    ok(existsSync(join(ROOT, F.deposit)), `ยังไม่มี ${F.deposit}`);
  });
}
await st("S-2", "ไม่มี migration/แก้ schema · ไม่แตะ POS (src/lib/modules/pos) · payment (src/lib/payment) · ตัววางคิว/แถวเดียว/อุปกรณ์/ค่าตั้งโมเดล/public-line", () => {
  eq(dirty(["prisma", "src/lib/modules/pos", "src/lib/payment", "src/lib/modules/booking/planner.ts", "src/lib/modules/booking/planner-run.ts", "src/lib/modules/booking/queue-line.ts", "src/lib/modules/booking/today-line.ts", "src/lib/modules/booking/line-ops.ts", "src/lib/modules/booking/devices.ts", "src/lib/modules/booking/settings-model.ts", "src/lib/modules/booking/public-line.ts"]), [], "ไฟล์");
});
await st("S-3", "deposit.ts: ไม่ import prisma ดิบ (F5) · ไม่เรียก createSale เอง (ผ่าน bookingTxSale/ฟังก์ชันโมดูล POS) · ไม่ส่ง policy ให้ submitSlip · ไม่ log ชื่อ/เบอร์/token · ไม่ฮาร์ดโค้ด GOLD/100%", () => {
  const s = stripComments(src(F.deposit));
  ok(!!s, `ยังไม่มี ${F.deposit}`);
  ok(!/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/.test(s), "prisma ดิบ");
  ok(!/\bcreateSale\s*\(/.test(s), "เรียก createSale ตรง");
  ok(!/policy\s*:/.test(s.slice(s.search(/submitSlip\s*\(/) >= 0 ? s.search(/submitSlip\s*\(/) : s.length).slice(0, 600)), "ส่ง policy ให้ submitSlip");
  ok(!/console\.(log|info|warn|error)\([^)]*(customerName|customerPhone|token|phone)/i.test(s), "log PII/token");
  ok(!/["']GOLD["']|\?\?\s*100\b/.test(s), "ฮาร์ดโค้ดนโยบาย");
}, "CRITICAL");
await st("S-4", "service.ts: holdMinutesOf/busyRowsOf/slotClear/selfQuotaOk/openCountForPhone/replayOf เท่า HEAD · บรรทัดเดิมที่ลบ/แก้ ≤ 40 · จุดเรียก createSale ของไฟล์ยังเป็นจุดเดียว (bookingTxSale)", () => {
  const removed = diffLines(F.service).filter((l) => l.startsWith("-") && l.slice(1).trim() !== "");
  ok(removed.length <= 40, `ลบ/แก้ ${removed.length} บรรทัด`);
  const body = (s: string, name: string) => { const i = s.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\b`)); return i < 0 ? "" : s.slice(i, i + 500); };
  const head = (() => { try { return git(["show", `HEAD:${F.service}`]); } catch { return ""; } })();
  for (const n of ["holdMinutesOf", "busyRowsOf", "slotClear", "selfQuotaOk", "openCountForPhone", "replayOf"]) eq(body(src(F.service), n), body(head, n), `${n} ถูกแก้`);
  const calls = (stripComments(src(F.service)).match(/\bcreateSale\s*\(/g) ?? []).length;
  const callsHead = (stripComments(head).match(/\bcreateSale\s*\(/g) ?? []).length;
  eq(calls, callsHead, "จำนวนจุดเรียก createSale");
}, "MAJOR");
await st("S-5", `action สาธารณะ «${F.actManage}»: "use server" · export async function เท่านั้น · มี action เรียก submitDepositSlip และ action ยกเลิกช้า (cancelOnline + acceptForfeit) · ไม่มี session/requireUnit · ไม่ส่ง deps/policy จากคำขอ`, () => {
  const s = src(F.actManage);
  ok(/^\s*["']use server["']/.test(s), "ไม่มี use server");
  const code = stripComments(s);
  ok(!/export\s+(const|let|type|interface|default|class|function\s)/.test(code.replace(/export\s+async\s+function/g, "")), "export อื่น");
  ok(/submitDepositSlip\s*\(/.test(code), "ไม่มี action แนบสลิป");
  ok(/cancelOnline\s*\([^)]*acceptForfeit/.test(code.replace(/\n/g, " ")), "ไม่มี action ยกเลิกช้า");
  ok(!/requireUnit|requireAuth|getSession/.test(code), "ใช้ session");
  ok(!/\bdeps\s*:|policy\s*:/.test(code), "ส่ง deps/policy");
}, "CRITICAL");
await st("S-6", `จอร้าน «${F.actShop}»: confirmDepositAction + refundDueDepositAction เรียก assertBookingAction ก่อนอ่าน/เขียน · เรียก confirmDepositByShop/refundDepositByShop ด้วย actorUserId · ไม่มีไฟล์ใหม่ใน src/lib/actions (F6)`, () => {
  const code = stripComments(src(F.actShop));
  for (const [act, fn] of [["confirmDepositAction", "confirmDepositByShop"], ["refundDueDepositAction", "refundDepositByShop"]]) {
    const i = code.search(new RegExp(`export\\s+async\\s+function\\s+${act}\\b`));
    ok(i >= 0, `ไม่มี ${act}`);
    const body = code.slice(i, i + 1400);
    ok(new RegExp(`assertBookingAction\\([^)]*["']${act}["']`).test(body), `${act} ไม่ตรวจสิทธิ์`);
    ok(new RegExp(`${fn}\\s*\\(`).test(body) && /actorUserId/.test(body), `${act} ไม่เรียก ${fn}`);
  }
  const fresh = git(["ls-files", "--others", "--exclude-standard", "--", "src/lib/actions"]).split("\n").filter(Boolean);
  eq(fresh, [], "ไฟล์ใหม่ใน src/lib/actions");
}, "MAJOR");
await st("S-7", "คอมโพเนนต์สาธารณะ: ไม่ import ค่าจาก @/lib/modules · @/lib/core/db · @prisma/client · ไม่อ้าง customerName/customerPhone · ไม่ฮาร์ดโค้ดคีย์ค่าตั้ง booking.*", () => {
  const bad: string[] = [];
  const dir = join(ROOT, "src/components/booking/online");
  const extra = existsSync(dir) ? (spawnSync("ls", [dir], { encoding: "utf8" }).stdout ?? "").split("\n").filter((f) => /\.tsx?$/.test(f)).map((f) => `src/components/booking/online/${f}`) : [];
  for (const f of [F.compBooking, ...extra]) {
    const s = stripComments(src(f));
    if (!s) continue;
    const valueImports = [...s.matchAll(/^\s*import\s+(?!type\b)[^;]*from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
    if (valueImports.some((x) => x.startsWith("@/lib/modules") || x === "@/lib/core/db" || x === "@prisma/client")) bad.push(`${f}: import ค่าจากชั้นฐาน`);
    if (/customerName|customerPhone/.test(s)) bad.push(`${f}: อ้าง PII`);
    if (/["']booking\.(booking|late|deposit|staff|general|service)\./.test(s)) bad.push(`${f}: คีย์ค่าตั้ง`);
  }
  ok(bad.length === 0, bad.slice(0, 4).join(" · "));
}, "MAJOR");
await st("S-8", "dict th/en คีย์คู่กันครบ · หน้า /bq/m ส่ง pay จาก loadDepositPay", async () => {
  const d = await tryImport(at(F.dict));
  const th = Object.keys(d.mod?.DICT?.th ?? {}).sort();
  const en = Object.keys(d.mod?.DICT?.en ?? {}).sort();
  ok(th.length > 0, `โหลด dict ไม่ได้ ${d.err}`);
  eq(th.filter((k) => !en.includes(k)).concat(en.filter((k) => !th.includes(k))), [], "คีย์ไม่คู่");
  ok(/loadDepositPay\s*\(/.test(stripComments(src(F.pageManage))), "หน้าไม่โหลด pay");
}, "MINOR");
await st("S-9", "งานทุกนาทียังเรียก expireDepositHolds (minute-jobs) · deposit.ts ไม่มี .getDay/.getHours ดิบ", () => {
  ok(/expireDepositHolds/.test(src(F.minute)) || /expireDepositHolds/.test(src("src/app/api/cron/booking-holds/route.ts")), "ไม่มีงานปล่อยช่องตามเวลา");
  ok(!/\.(getDay|getHours|getMinutes|getDate|getMonth|getFullYear)\s*\(\s*\)/.test(stripComments(src(F.deposit))), "เวลาเครื่องดิบ");
}, "MAJOR");

// ═══════════════ G. regression (หลังล้างข้อมูล) ═══════════════
console.log("\n── G: regression (b.7 · b.3 · b.4 · b.9 · r0.6 · booking-deposit · pos p5.1 · pos p2.9b · smoke) ──");
const judgeSvc = (allowSkip: (id: string) => boolean, allowFail: (id: string) => boolean = () => false) => (out: string) => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return false;
  const j = JSON.parse(line.slice(13)) as { failed?: string[]; skipped?: string[]; findings?: string[] };
  return (j.failed ?? []).every(allowFail) && (j.skipped ?? []).every(allowSkip);
};
const REG: { s: string; args?: string[]; env?: Record<string, string>; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-svc-b.7", args: ["--no-regression"], judge: judgeSvc((x) => /^(H|V|Q|G)-/.test(x) || x === "S-1", (x) => x === "S-1" || x === "S-2"), note: "ไม่มี FAIL ยกเว้น S-1/S-2 (ไฟล์ของใบ B.8 ยังไม่ commit) · SKIP เฉพาะ H/V/Q/G/S-1" },
  { s: "qc-svc-b.3", env: { SVC_B3_NO_REGRESSION: "1" }, judge: judgeSvc((x) => x.startsWith("G-") || x === "ST-1", (x) => x === "ST-1"), note: "ไม่มี FAIL ยกเว้น ST-1 · SKIP เฉพาะ G-*/ST-1" },
  { s: "qc-svc-b.4", args: ["--no-regression"], judge: judgeSvc((x) => x.startsWith("G-") || x === "ST-1", (x) => x === "ST-1"), note: "ไม่มี FAIL ยกเว้น ST-1 · SKIP เฉพาะ G-*/ST-1" },
  { s: "qc-svc-b.9", args: ["--no-regression"], judge: judgeSvc((x) => /^(H|V|Q|G)-/.test(x) || x === "S-1", (x) => x === "S-1" || x === "S-2"), note: "ไม่มี FAIL ยกเว้น S-1/S-2 · SKIP เฉพาะ H/V/Q/G/S-1" },
  { s: "qc-svc-r0.6", judge: (out) => /JSON_SUMMARY/.test(out) && !/❌/.test(out.split("\n").filter((l) => !/\[F-\d+\]/.test(l)).join("\n")), note: "ไม่มี ❌ นอกหมวด F (ไล่ไฟล์ทะเบียน event)" },
  { s: "qc-booking-deposit" },
  { s: "qc-pos-p5.1" },
  { s: "qc-pos-p2.9b" },
  { s: "qc-svc-smoke" },
];
{
  const hasWork = typeof depLoad.mod?.depositInfo === "function" && typeof depLoad.mod?.onDepositSlipApproved === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (deposit.depositInfo / onDepositSlipApproved) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_B8_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: { ...process.env, ...(g.env ?? {}) }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 40 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-b8-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(all, r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groups: Record<string, number> = {};
for (const c of cks) { const g = c.id.replace(/-.*$/, ""); groups[g] = (groups[g] ?? 0) + 1; }
console.log(`\n===== QC SVC B.8 · มัดจำรุ่นแรก (จองคิว) =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""} · กลุ่ม ${fmt(groups)}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: H-* / V-1 ไม่มี QC_BASE · G-* เมื่อ --no-regression — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);

// ═══════════════ ตัวช่วยที่ประกาศท้าย (hoisted) ═══════════════
async function SYS_POS(t: string, u: string): Promise<string> {
  const id = await must(sysLoad, "system/service").systemForUnit(t, u, "POS");
  ok(typeof id === "string" && id.length > 0, `ไม่มี POS ของ ${u}`);
  return id as string;
}

// ═══════════════ สายยิงพร้อมกัน (parent · แบบ qc-svc-b.7) ═══════════════
async function runHarness(scs: Scenario[], n: number): Promise<Map<string, CallOut[]>> {
  const out = new Map<string, CallOut[]>();
  const ready = new Map<string, Set<number>>();
  const res = new Map<string, Map<number, CallOut[]>>();
  const dead = new Set<number>();
  const errs: string[] = [];
  const kids = Array.from({ length: n }, (_, idx) => {
    const spec: ChildSpec = { run: RUN, idx, scenarios: scs.map((s) => ({ key: s.key, calls: s.calls.slice(idx * 2, idx * 2 + 2) })) };
    const ch = spawn(process.execPath, [...process.execArgv, SELF], { cwd: ROOT, env: { ...process.env, QC_B8_CHILD: JSON.stringify(spec) }, stdio: ["ignore", "pipe", "pipe"] });
    createInterface({ input: ch.stdout }).on("line", (l) => {
      const m = /^(READY|RES) (\S+)(?: (.*))?$/.exec(l);
      if (m?.[1] === "READY") { if (!ready.has(m[2])) ready.set(m[2], new Set()); ready.get(m[2])!.add(idx); }
      else if (m?.[1] === "RES") { if (!res.has(m[2])) res.set(m[2], new Map()); res.get(m[2])!.set(idx, JSON.parse(m[3] ?? "[]") as CallOut[]); }
      else if (l.startsWith("CHILD_ERR")) errs.push(`#${idx} ${l}`);
    });
    let tail = "";
    ch.stderr.on("data", (b: Buffer) => { tail = (tail + b.toString()).slice(-400); });
    ch.on("exit", (code) => { dead.add(idx); if (code !== 0) errs.push(`#${idx} exit ${code} ${tail.split("\n").filter(Boolean).slice(-1)[0] ?? ""}`); });
    return ch;
  });
  const waitFor = async (cond: () => boolean, ms: number) => { const t = Date.now(); while (!cond()) { if (Date.now() - t > ms) return false; await sleep(20); } return true; };
  try {
    for (const [si, sc] of scs.entries()) {
      const alive = () => [...Array(n).keys()].filter((i) => !dead.has(i));
      const allReady = await waitFor(() => alive().every((i) => ready.get(sc.key)?.has(i)) && alive().length > 0, si === 0 ? 240_000 : 90_000);
      if (!allReady || alive().length < n) throw new Error(`ลูกโพรเซสไม่พร้อมที่ ${sc.key} (พร้อม ${ready.get(sc.key)?.size ?? 0}/${n}) ${errs.slice(0, 2).join(" · ")}`);
      const f = goFile(RUN, sc.key);
      writeFileSync(f, "go");
      goFiles.push(f);
      await waitFor(() => [...Array(n).keys()].every((i) => res.get(sc.key)?.has(i) || dead.has(i)), 180_000);
      out.set(sc.key, [...Array(n).keys()].flatMap((i) => res.get(sc.key)?.get(i) ?? []));
    }
  } finally {
    await waitFor(() => dead.size === n, 30_000);
    for (const k of kids) if (k.exitCode === null) k.kill("SIGKILL");
  }
  return out;
}
