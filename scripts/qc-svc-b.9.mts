// QC — SVC B.9 · แจ้งเตือนลูกค้า (9 ชนิด) + ผูก LINE + postback booking.* + รับบัตรคิวจากมือถือ (#42) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-b.9.md (§3 สัญญา · §4 DOM · §6 จุดที่เลือกเอง) · ledger/SVC-MASTER-PLAN.md แถว B.9 · CC §4
//        ภาพ ledger/design-booking/06-customer-line.png (ข + ค: ถ้อยคำ/ปุ่ม) · ใบ R0.7 (notifyCustomer · ChatLinkCode · postback-routes) · ใบ B.4 §7 · ใบ B.6 §3.4 §9 (มติ Q6)
//
// กลุ่มข้อ:
//   PC  ตัวควบคุม (เขียวตั้งแต่ก่อนมีงาน): ข้อมูลทดสอบ · ตัวจำลอง LINE + notifyCustomer + dedupe · ผูกรหัสของ R0.7
//   N   notifyBooking: เปิด/ปิดต่อชนิด · ถ้อยคำแก้ · เวลาเงียบ/ข้าม · ผู้รับ (รหัส → Party) · X1 · คลินิกไม่ใส่บริการ · optOut · ไม่มี OA · partyMismatch
//   K   รหัสผูก + postback (เจ้าของเท่านั้น · ข้อความกลางเดียว · ข้ามร้าน · เช็กอินพร้อมกัน · ไปไม่ทัน · เลื่อนคิว (B.6) · ทะเบียน)
//   E   consumer ส่งซ้ำ/พร้อมกัน (X4) + หลายโพรเซสพร้อมกัน = ข้อความเดียว
//   T   minute-job (X5): reminder · จองหลังจุดเตือน · nearTurn · delayed · rebookInvite · tick ซ้อน · tenantIds
//   R   รับบัตรคิวจากมือถือ (#42): ปิด/เปิด · ไม่พบ = คำตอบเดียว · เบอร์ซ้ำไม่คืนลิงก์ · รอนานเกิน · rate limit · X8
//   U   คอมโพเนนต์ RemoteTicket · V ภาพ (QC_BASE) · P สแกน PII · S ไฟล์/สัญญาโค้ด · G regression (หลังล้าง) · Z ล้างข้อมูล
//
// 🔴 ไม่ยิง LINE จริง: ตัวจำลอง (node:http 127.0.0.1) + LINE_API_BASE + ครอบ fetch (นอกเครื่อง = บล็อก) · โพรเซสลูก (E-5) ได้ LINE_API_BASE เดียวกัน
// เวลา: วันฉาก D = วันนี้ไทย + 5 · now ฉีดทุกฟังก์ชัน · tick ส่ง tenantIds เสมอ (ห้ามแตะ seed)
// ร้านทดสอบ slug `qc-svc-b9-*` · ผู้ใช้ `qc-svc-b9-*@qc.invalid` · ลบใน finally (+ กวาดค้างตอนเริ่ม)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.9.mts [--no-regression]
//      (ห้าม timeout ครอบ · `--no-regression` = G เป็น SKIP ซึ่งไม่นับผ่าน · QC_BASE=http://127.0.0.1:<port> เปิดหมวด V)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_VISUAL_SPECS } from "./svc-qc-data.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const LABEL = "qc-svc-b.9";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_B9_NO_REGRESSION === "1";
const F = {
  notify: "src/lib/platform/booking-notify.ts",
  link: "src/lib/platform/booking-line-link.ts",
  remote: "src/lib/platform/booking-remote.ts",
  remoteAction: "src/app/(store)/s/[tenantSlug]/[unitSlug]/remote/actions.ts", // ORACLE-EDIT (ผู้คุม 30 ต.ค.): action สาธารณะอยู่ใต้ app/(store) ตามแบบ B.6 (fitness F6.1)
  remotePage: "src/app/(store)/s/[tenantSlug]/[unitSlug]/remote/page.tsx",
  remoteComp: "src/components/booking/public/RemoteTicket.tsx",
  postback: "src/lib/platform/postback-routes.ts",
  minute: "src/lib/platform/minute-jobs.ts",
  consumers: "src/lib/outbox-consumers.ts",
  queueLine: "src/lib/modules/booking/queue-line.ts",
  index: "src/lib/modules/booking/index.ts",
  publicLine: "src/lib/modules/booking/public-line.ts", // B.6
  notifyCustomer: "src/lib/platform/notify-customer.ts",
} as const;
const KINDS = ["confirmation", "reminder", "checkedIn", "ticketIssued", "nearTurn", "yourTurn", "delayed", "noShowRebook", "rebookInvite", "courseExpiry"] as const;
type Kind = (typeof KINDS)[number];

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }

// ═══════════════ โหมดโพรเซสลูก (E-5) — เรียก notifyBooking ครั้งเดียวแล้วจบ (ไม่สร้างข้อมูล/ไม่ล้าง) ═══════════════
{
  const ix = process.argv.indexOf("--child-notify");
  if (ix >= 0) {
    const [tenantId, unitId, appointmentId, kind, nowIso] = process.argv.slice(ix + 1);
    let out: unknown;
    try {
      if (!existsSync(join(ROOT, F.notify))) throw new Error(`ยังไม่มี ${F.notify}`);
      const m = (await import(pathToFileURL(join(ROOT, F.notify)).href)) as Any;
      if (typeof m.notifyBooking !== "function") throw new Error("ไม่มี export notifyBooking");
      out = await m.notifyBooking({ tenantId, unitId }, { appointmentId, kind }, { now: new Date(nowIso) });
    } catch (e) {
      out = { error: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
    }
    console.log(`CHILD_RESULT ${JSON.stringify(out)}`);
    process.exit(0);
  }
}

// ═══════════════ สำเนาสัญญา (ใบสั่ง §3) ═══════════════
type Ctx = { tenantId: string; unitId: string; actorUserId?: string };
type Outcome = { kind: Kind; status: string; dedupeKey: string | null; duplicate: boolean; retryAt: Date | null };
type NotifyApi = {
  BOOKING_MSG_KINDS?: readonly string[];
  notifyBooking?: (ctx: Ctx, i: { appointmentId: string; kind: Kind; offsetMin?: number }, opts?: { now?: Date }) => Promise<Outcome>;
  runBookingNotifyTick?: (now: Date, opts?: { tenantIds?: string[] }) => Promise<Record<string, number>>;
  onBookingNotifyEvent?: (evt: Any) => Promise<void>;
};
type PbCtx = { tenantId: string; connectionId: string; chatContactId: string; partyId: string | null; replyToken: string | null };
type PbReply = { text?: string; flex?: Any };
type LinkApi = {
  BOOKING_POSTBACK_NOT_FOUND?: string;
  issueBookingLinkCode?: (ctx: Ctx, i: { appointmentId: string }, opts?: { now?: Date }) => Promise<Any>;
  resolveBookingParty?: (ctx: { tenantId: string }, a: { purpose: string; refId: string }) => Promise<string | null>;
  onBookingPostback?: (ctx: PbCtx, evt: Any, opts?: { now?: Date }) => Promise<PbReply>;
  onBookingLinked?: (ctx: PbCtx, a: Any, opts?: { now?: Date }) => Promise<PbReply>;
};
type RemoteApi = {
  REMOTE_RATE?: Any;
  loadRemoteTicketForm?: (t: string, u: string, opts?: { now?: Date }) => Promise<Any>;
  takeRemoteTicket?: (t: string, u: string, i: { serviceId: string; staffId: string | null; phone: string; clientKey: string }, opts?: { now?: Date }) => Promise<Any>;
};

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
const tryImport = async <T,>(spec: string): Promise<{ mod: T | null; err: string }> => {
  try { return { mod: (await import(spec)) as T, err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const loadIf = async <T,>(rel: string) => (existsSync(join(ROOT, rel)) ? tryImport<T>(pathToFileURL(join(ROOT, rel)).href) : { mod: null as T | null, err: `ยังไม่มีไฟล์ «${rel}»` });
const fnOf = <Fn,>(load: { mod: unknown; err: string }, name: string, rel: string): Fn => {
  const f = (load.mod as Record<string, unknown> | null)?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return f as Fn;
};
const addDays = (ds: string, n: number): string => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const bkkToday = (): string => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const bkkMs = (ds: string, min: number): number => { const [y, m, d] = ds.split("-").map(Number); return Date.UTC(y, m - 1, d) + (min - 420) * 60_000; };
const hm = (s: string): number => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const at = (ds: string, s: string, sec = 0): Date => new Date(bkkMs(ds, hm(s)) + sec * 1000);
const mOf = (d: Date) => Math.floor(d.getTime() / 60_000);
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const src = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const js = (v: unknown) => { try { return JSON.stringify(v) ?? ""; } catch { return String(v); } };
const RESULTS: unknown[] = [];
const keep = <X,>(r: X): X => { RESULTS.push(r); return r; };

// ═══════════════ ตัวจำลอง LINE + ครอบ fetch ═══════════════
type FakeReq = { method: string; path: string; auth: string; json: Any; status: number };
const FAKE: FakeReq[] = [];
const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    const path = (req.url ?? "").split("?")[0] ?? "";
    let json: Any = null;
    if (String(req.headers["content-type"] ?? "").includes("json")) { try { json = JSON.parse(raw.toString("utf8")); } catch { json = null; } }
    const rec: FakeReq = { method: req.method ?? "", path, auth: String(req.headers.authorization ?? ""), json, status: 0 };
    FAKE.push(rec);
    const send = (code: number, obj: unknown) => { rec.status = code; if (res.writableEnded) return; res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (req.method === "POST" && path === "/v2/bot/message/push") return send(200, { sentMessages: [{ id: `fm${FAKE.length}` }] });
    if (req.method === "POST" && path === "/v2/bot/message/reply") return send(200, { sentMessages: [{ id: `fr${FAKE.length}` }] });
    if (req.method === "GET" && path.startsWith("/v2/bot/profile/")) return send(200, { displayName: "ลูกค้าคิวซี", userId: path.split("/").pop() });
    return send(200, {});
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
const pushesTo = (ext: string, m0: number) => FAKE.slice(m0).filter((r) => r.method === "POST" && r.path === "/v2/bot/message/push" && r.json?.to === ext);
const msgText = (r: FakeReq | undefined): string => { const m = r?.json?.messages?.[0]; return String(m?.text ?? m?.altText ?? ""); };

// ═══════════════ โหลดโมดูล ═══════════════
const notifyLoad = await loadIf<NotifyApi>(F.notify);
const linkLoad = await loadIf<LinkApi>(F.link);
const remoteLoad = await loadIf<RemoteApi>(F.remote);
const b6Load = await loadIf<Any>(F.publicLine);
const lineLoad = await tryImport<Any>("@/lib/modules/booking/queue-line");
const bookingLoad = await tryImport<Any>("@/lib/modules/booking/service");
const settingsLoad = await tryImport<Any>("@/lib/core/settings");
const chatLoad = await tryImport<Any>("@/lib/modules/chat");
const pbLoad = await tryImport<Any>("@/lib/platform/postback-routes");
const ncLoad = await tryImport<Any>("@/lib/platform/notify-customer");
const dbLoad = await tryImport<Any>("@/lib/core/db");
const NT = {
  notify: () => fnOf<NonNullable<NotifyApi["notifyBooking"]>>(notifyLoad, "notifyBooking", F.notify),
  tick: () => fnOf<NonNullable<NotifyApi["runBookingNotifyTick"]>>(notifyLoad, "runBookingNotifyTick", F.notify),
  issue: () => fnOf<NonNullable<LinkApi["issueBookingLinkCode"]>>(linkLoad, "issueBookingLinkCode", F.link),
  postback: () => fnOf<NonNullable<LinkApi["onBookingPostback"]>>(linkLoad, "onBookingPostback", F.link),
  form: () => fnOf<NonNullable<RemoteApi["loadRemoteTicketForm"]>>(remoteLoad, "loadRemoteTicketForm", F.remote),
  take: () => fnOf<NonNullable<RemoteApi["takeRemoteTicket"]>>(remoteLoad, "takeRemoteTicket", F.remote),
};
const NOT_FOUND_TEXT = (): string => {
  const t = (linkLoad.mod as LinkApi | null)?.BOOKING_POSTBACK_NOT_FOUND;
  if (typeof t !== "string" || !t.trim()) throw new AssertFail(`«${F.link}» ยังไม่มี export BOOKING_POSTBACK_NOT_FOUND (ข้อความกลาง)`);
  return t;
};
const need = <T,>(l: { mod: T | null; err: string }, what: string): T => { if (!l.mod) throw new AssertFail(`โหลด ${what} ไม่ได้ (${l.err})`); return l.mod; };
const LN = () => need(lineLoad, "booking/queue-line");
const BK = () => need(bookingLoad, "booking/service");
const SET = () => need(settingsLoad, "core/settings");
const CHAT = () => need(chatLoad, "modules/chat");
const PB = () => need(pbLoad, "platform/postback-routes");
const prisma: Any = need(dbLoad, "core/db").prisma;
const parsePb = (data: string) => { const e = PB().parsePostbackData(data); ok(!!e, `parsePostbackData(${data}) = null`); return e; };

// ═══════════════ ฐานข้อมูล ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]));
  return colCache.get(table) ?? [];
};
const rid = (p: string) => `svcb9_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
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
const SLUG = "qc-svc-b9-";
const USER_MAIL = "qc-svc-b9-";
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
async function cleanupBuckets(tenantIds: string[], slugs: string[]) {
  try {
    for (const t of tenantIds) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1 OR key LIKE $2`, [`chat-link:${t}:%`, `bq:ticket:${t}:%`]);
    for (const s of slugs) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, [`bq:remote:${s}/%`]);
  } catch (e) { console.log(`  ⚠️ ลบ rate bucket: ${errMsg(e)}`); }
}
const SV_MARK = "qc-svc-b9";
async function sv(tenantId: string, unitId: string, key: string, value: unknown) {
  await prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId: unitId } });
  await prisma.settingValue.create({ data: { tenantId, key, scope: "UNIT", scopeId: unitId, value, setById: SV_MARK } });
}
async function svClear(tenantId: string, unitId: string, key: string) {
  await prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId: unitId } });
}
/** กันตัวระบายคิวอื่น (QC server/ข้อสอบอื่น) หยิบ event ของร้านทดสอบไปส่งเอง — ข้อสอบเรียก consumer เองทุกครั้ง */
const parkOutbox = async (tenantIds: string[]) => { await pool.query(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 days' WHERE "tenantId" = ANY($1::text[]) AND status::text = 'PENDING'`, [tenantIds]); };
const enabledMap = (off: readonly string[]) => Object.fromEntries(KINDS.map((k) => [k, !off.includes(k)]));

// ═══════════════ ข้อมูลทดสอบ ═══════════════
const RUN = Date.now().toString(36);
const RAND = randomBytes(3).toString("hex");
const TODAY = bkkToday();
const D = addDays(TODAY, 5);
const T = (k: string) => `svcb9_${k}_${RUN}`;
const ids = {
  tA: T("tA"), tB: T("tB"),
  uA: T("uA"), uQ: T("uQ"), uD: T("uD"), uC: T("uC"), uN: T("uN"), uR: T("uR"), uB: T("uB"),
  s1: T("s1"), s2: T("s2"), q1: T("q1"), d1: T("d1"), c1: T("c1"), n1: T("n1"), r1: T("r1"), b1: T("b1"),
  svcCut: T("svcCut"), svcShave: T("svcShave"), qShave: T("qShave"), dWash: T("dWash"), dShave: T("dShave"), cSvc: T("cSvc"), nSvc: T("nSvc"), rCut: T("rCut"), bSvc: T("bSvc"),
  uOwner: T("owner"), uOwnerB: T("ownerB"),
};
const C_SVC_NAME = "ตรวจผิวหนังเฉพาะทาง";
const STAFF_NAME: Record<string, string> = { s1: "ช่างเอ", s2: "ช่างบี", q1: "ช่างคิว", d1: "ช่างดี", c1: "หมอซี", n1: "ช่างเอ็น", r1: "ช่างอาร์", b1: "ช่างร้านบี" };
const cA: Ctx = { tenantId: ids.tA, unitId: ids.uA };
const cQ: Ctx = { tenantId: ids.tA, unitId: ids.uQ };
const cD: Ctx = { tenantId: ids.tA, unitId: ids.uD };
const cC: Ctx = { tenantId: ids.tA, unitId: ids.uC };
const cN: Ctx = { tenantId: ids.tA, unitId: ids.uN };
const cB: Ctx = { tenantId: ids.tB, unitId: ids.uB };
const SLUGS: Record<string, string> = {};
const OWNER = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.uOwner };
const OWNER_B = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.uOwnerB };
const usedPhones = new Set<string>();
const newPhone = () => { for (;;) { const p = `08${randomInt(10_000_000, 99_999_999)}`; if (!usedPhones.has(p)) { usedPhones.add(p); return p; } } };
const PHONES: string[] = [];
const NAMES: string[] = [];
const dashed = (p: string) => `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
const phoneLeak = (s: string): string[] => PHONES.filter((p) => s.includes(p) || s.includes(dashed(p)) || s.includes(`66${p.slice(1)}`));

// นัด (คีย์ → ข้อมูล) — วัน D
type Bk = { unit: "A" | "C" | "N" | "D" | "B"; staff: string; svc: string; start: string };
const BOOK: Record<string, Bk> = {
  PD: { unit: "A", staff: "s1", svc: "svcShave", start: "10:00" }, // จบงาน 10:20 → rebookInvite
  P3: { unit: "A", staff: "s1", svc: "svcCut", start: "11:00" },   // เช็กอินทาง LINE
  P7: { unit: "A", staff: "s1", svc: "svcCut", start: "13:00" },   // ไม่มา → noShowRebook
  P1: { unit: "A", staff: "s1", svc: "svcCut", start: "15:30" },   // ยืนยัน · เตือน 1440/120
  P8: { unit: "A", staff: "s1", svc: "svcCut", start: "17:00" },   // หลายโพรเซส
  P2: { unit: "A", staff: "s2", svc: "svcCut", start: "12:00" },   // มี Party ไม่มี LINE
  P6: { unit: "A", staff: "s2", svc: "svcCut", start: "13:00" },   // ผูกรหัสกับคนอื่น (partyMismatch)
  P5: { unit: "A", staff: "s2", svc: "svcCut", start: "14:00" },   // ผู้ติดต่อถูกบล็อก
  P4: { unit: "A", staff: "s2", svc: "svcCut", start: "16:30" },   // ถ้อยคำแก้ · ไปไม่ทัน
  PR: { unit: "A", staff: "s2", svc: "svcCut", start: "18:00" },   // จองหลังจุดเตือน
  C1: { unit: "C", staff: "c1", svc: "cSvc", start: "14:00" },     // คลินิก
  N1: { unit: "N", staff: "n1", svc: "nSvc", start: "14:00" },     // หน่วยไม่มี OA
  Z: { unit: "D", staff: "d1", svc: "dShave", start: "11:45" },    // คิวล่าช้า
  PB: { unit: "B", staff: "b1", svc: "bSvc", start: "15:30" },     // ร้าน B
};
const UNIT_CTX: Record<Bk["unit"], Ctx> = { A: cA, C: cC, N: cN, D: cD, B: cB };
const ap: Record<string, string> = {};      // คีย์ → appointmentId
const party: Record<string, string> = {};   // คีย์ → partyId
const phoneOf: Record<string, string> = {};
const nameOf: Record<string, string> = {};
const W: Record<string, string> = {};       // walk-in คีย์ → appointmentId (W1..W5 uQ · WD uD)
const ticketOf: Record<string, string> = {}; // walk-in คีย์ → queueTicketId
const ticketNo: Record<string, string> = {};
const conn: Record<string, string> = {};    // cA · cB
const K: Record<string, { id: string; ext: string; partyId: string | null }> = {}; // ผู้ติดต่อ LINE
let sysA = "", sysB = "";
let setupOk = false;

type ApRow = { id: string; status: string; kind: string; queueTicketId: string | null; checkedInAt: Date | null; partyId: string | null; channel: string | null; customerPhone: string | null };
const apRow = async (id: string): Promise<ApRow> => {
  const [r] = await q<ApRow>(`SELECT id, status::text AS status, kind, "queueTicketId", "checkedInAt", "partyId", channel, "customerPhone" FROM "Appointment" WHERE id = $1`, [id]);
  if (!r) throw new AssertFail(`ไม่พบนัด ${id}`);
  return r;
};
const tkNumber = async (ticketId: string | null): Promise<string> => {
  ok(!!ticketId, "ไม่มีบัตร");
  const [r] = await q<{ number: string }>(`SELECT number FROM "QueueTicket" WHERE id = $1`, [ticketId]);
  return r?.number ?? "";
};
const logRows = async (key: string) => q<{ status: string; channel: string }>(`SELECT status, channel FROM "ServiceMessageLog" WHERE "tenantId" = $1 AND "dedupeKey" = $2`, [ids.tA, key]);
const pbCtx = (k: string, tenantId = ids.tA, c = "cA"): PbCtx => ({ tenantId, connectionId: conn[c], chatContactId: K[k].id, partyId: K[k].partyId, replyToken: null });
const REPLIES: PbReply[] = [];

console.log(`\n(วันนี้ไทย ${TODAY} · วันฉาก D ${D} · ตัวจำลอง LINE ${FAKE_BASE})`);

try {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length} ร้าน)`); await cleanup(stale); }
  await cleanupUsers();
  await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, [`bq:remote:${SLUG}%`]);

  // ── สร้างข้อมูล ──
  console.log("\n── สร้างข้อมูลทดสอบ ──");
  try {
    for (const [id, n] of [[ids.tA, "a"], [ids.tB, "b"]] as const) {
      SLUGS[id] = `${SLUG}${n}-${RUN}`;
      await insertRow("Tenant", { id, name: `QC B9 ร้าน ${n}`, slug: SLUGS[id], updatedAt: new Date() });
    }
    const units: [string, string, string, string][] = [
      [ids.uA, ids.tA, "a", "บาร์เบอร์คิวซี"], [ids.uQ, ids.tA, "q", "สาขาคิว"], [ids.uD, ids.tA, "d", "สาขาล่าช้า"], [ids.uC, ids.tA, "c", "คลินิกคิวซี"],
      [ids.uN, ids.tA, "n", "สาขาไม่มีโอเอ"], [ids.uR, ids.tA, "r", "สาขารับบัตรมือถือ"], [ids.uB, ids.tB, "b", "ร้านบีสาขา"],
    ];
    for (const [id, t, n, name] of units) {
      SLUGS[id] = `b9-${n}-${RUN}`;
      await insertRow("BusinessUnit", { id, tenantId: t, type: "BOOKING", name, slug: SLUGS[id], updatedAt: new Date() });
      for (let w = 0; w < 7; w++) await insertRow("BookingHours", { id: rid("bh"), tenantId: t, unitId: id, weekday: w, openMin: 600, closeMin: 1200, closed: false, updatedAt: new Date() });
    }
    const svc = async (id: string, t: string, u: string, name: string, durationMin: number, priceSatang: number) =>
      insertRow("BookingService", { id, tenantId: t, unitId: u, name, durationMin, priceSatang, bufferMin: 0, depositSatang: 0, bookable: true, sortOrder: 0, updatedAt: new Date() });
    await svc(ids.svcCut, ids.tA, ids.uA, "ตัดผมชาย", 45, 25000);
    await svc(ids.svcShave, ids.tA, ids.uA, "โกนหนวด", 20, 12000);
    await svc(ids.qShave, ids.tA, ids.uQ, "โกนหนวด", 20, 12000);
    await svc(ids.dWash, ids.tA, ids.uD, "ตัด + สระ", 60, 35000);
    await svc(ids.dShave, ids.tA, ids.uD, "โกนหนวด", 20, 12000);
    await svc(ids.cSvc, ids.tA, ids.uC, C_SVC_NAME, 30, 50000);
    await svc(ids.nSvc, ids.tA, ids.uN, "ตัดผมชาย", 45, 25000);
    await svc(ids.rCut, ids.tA, ids.uR, "ตัดผมชาย", 30, 25000);
    await svc(ids.bSvc, ids.tB, ids.uB, "ตัดผมชาย", 45, 25000);
    let ord = 0;
    const staff = async (k: keyof typeof STAFF_NAME, t: string, u: string, sortOrder: number) =>
      insertRow("BookingStaff", { id: ids[k as keyof typeof ids], tenantId: t, unitId: u, name: STAFF_NAME[k], sortOrder, createdAt: new Date(Date.now() - 600_000 + ++ord * 1000), updatedAt: new Date() });
    await staff("s1", ids.tA, ids.uA, 1); await staff("s2", ids.tA, ids.uA, 2);
    await staff("q1", ids.tA, ids.uQ, 1); await staff("d1", ids.tA, ids.uD, 1); await staff("c1", ids.tA, ids.uC, 1);
    await staff("n1", ids.tA, ids.uN, 1); await staff("r1", ids.tA, ids.uR, 1); await staff("b1", ids.tB, ids.uB, 1);
    // คลินิก: แม่แบบ CLINIC ต้องผูกหมอ↔บริการ (ไม่ผูก = NOT_QUALIFIED)
    await insertRow("BookingStaffService", { id: rid("bss"), tenantId: ids.tA, unitId: ids.uC, staffId: ids.c1, serviceId: ids.cSvc, updatedAt: new Date() });
    for (const [uid, k, t] of [[ids.uOwner, "owner", ids.tA], [ids.uOwnerB, "ownerb", ids.tB]] as const) {
      await insertRow("User", { id: uid, email: `${USER_MAIL}${k}-${RUN}@qc.invalid`, name: `QC B9 ${k}`, updatedAt: new Date() });
      await insertRow("Membership", { id: rid("mb"), userId: uid, tenantId: t, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: JSON.stringify({}), acceptedAt: new Date(), updatedAt: new Date() });
    }
    // แม่แบบ (BARBER ทุกหน่วย · คลินิก = CLINIC) แล้วค่อยวางค่าตั้งของข้อสอบ
    for (const [t, u, tpl, actor] of [
      [ids.tA, ids.uA, "BARBER", OWNER], [ids.tA, ids.uQ, "BARBER", OWNER], [ids.tA, ids.uD, "BARBER", OWNER], [ids.tA, ids.uC, "CLINIC", OWNER],
      [ids.tA, ids.uN, "BARBER", OWNER], [ids.tA, ids.uR, "BARBER", OWNER], [ids.tB, ids.uB, "BARBER", OWNER_B],
    ] as const) {
      const a = await SET().applyTemplate(actor, { tenantId: t }, { unitId: u, domain: "booking", templateKey: tpl, overwrite: "RESET_ALL" });
      ok(a?.ok === true, `applyTemplate ${tpl} ${u}: ${a?.code} ${fmt(a?.issues)}`);
    }
    // LINE OA (ตัวจำลอง) + ผู้ติดต่อ
    sysA = (await prisma.appSystem.create({ data: { tenantId: ids.tA, type: "CHAT", name: `qc-b9-chat-${RUN}` } })).id;
    sysB = (await prisma.appSystem.create({ data: { tenantId: ids.tB, type: "CHAT", name: `qc-b9-chat-b-${RUN}` } })).id;
    conn.cA = (await prisma.chatChannelConnection.create({ data: { tenantId: ids.tA, systemId: sysA, type: "LINE", displayName: `qc-b9-a-${RUN}`, externalAccountId: `qc-b9-a-${RUN}`, credentials: { channelAccessToken: `qcb9tokA${RAND}`, channelSecret: `qcb9secA${RAND}` }, meta: { basicId: "@qcb9a" } } })).id;
    conn.cB = (await prisma.chatChannelConnection.create({ data: { tenantId: ids.tB, systemId: sysB, type: "LINE", displayName: `qc-b9-b-${RUN}`, externalAccountId: `qc-b9-b-${RUN}`, credentials: { channelAccessToken: `qcb9tokB${RAND}`, channelSecret: `qcb9secB${RAND}` }, meta: { basicId: "@qcb9b" } } })).id;
    for (const u of [ids.uA, ids.uQ, ids.uD, ids.uC, ids.uR]) await sv(ids.tA, u, "messaging.lineConnectionId", conn.cA);
    await sv(ids.tB, ids.uB, "messaging.lineConnectionId", conn.cB);
    for (const [t, u] of [[ids.tA, ids.uA], [ids.tA, ids.uQ], [ids.tA, ids.uD], [ids.tA, ids.uC], [ids.tA, ids.uN], [ids.tA, ids.uR], [ids.tB, ids.uB]] as const) {
      await sv(t, u, "messaging.quietHours", { start: "21:00", end: "08:00" });
      await sv(t, u, "messaging.channelOrder", ["LINE", "WEB_LINK"]);
    }
    await sv(ids.tA, ids.uQ, "booking.queue.walkInCloseWaitMin", 600);
    await sv(ids.tA, ids.uD, "booking.notify.delayAlertMin", 5);

    // นัด (bookAppointment STAFF · ใช้ facade ของ B.3)
    for (const [key, b] of Object.entries(BOOK)) {
      const ctx = UNIT_CTX[b.unit];
      phoneOf[key] = newPhone(); PHONES.push(phoneOf[key]);
      nameOf[key] = `คุณ${key}ทดสอบ${RAND}`; NAMES.push(nameOf[key]);
      const r = await BK().bookAppointment(ctx, {
        serviceId: ids[b.svc as keyof typeof ids], staffId: ids[b.staff as keyof typeof ids], dateStr: D, startMin: hm(b.start), channel: "STAFF",
        customerName: nameOf[key], customerPhone: phoneOf[key], idempotencyKey: `b9-${RUN}-${key}`,
      });
      if (!r?.ok) throw new AssertFail(`จอง ${key} ${b.start}: ${r?.code} ${r?.reason}`);
      ap[key] = r.id;
      if (r.status === "PENDING") { const c = await BK().setAppointmentStatus(ctx.tenantId, ctx.unitId, r.id, "CONFIRMED"); ok(c?.ok, `ยืนยัน ${key}: ${c?.reason}`); }
      const row = await apRow(r.id);
      ok(!!row.partyId, `นัด ${key} ไม่ได้ partyId (linkPartyAfterCommit)`);
      party[key] = row.partyId as string;
    }
    // PR = จองหลังจุดเตือนทั้งสอง (สร้างเมื่อ D 17:00 · นัด 18:00)
    await q(`UPDATE "Appointment" SET "createdAt" = $2 WHERE id = $1`, [ap.PR, at(D, "17:00")]);
    // ผู้ติดต่อ LINE
    const contact = async (k: string, tenantId: string, systemId: string, c: string, partyId: string | null, extra: Any = {}) => {
      const ext = `Ub9${k.toLowerCase()}${RAND}${RUN}`;
      const row = await prisma.chatContact.create({ data: { tenantId, systemId, channel: "LINE", channelConnectionId: conn[c], externalUserId: ext, partyId, lang: "th", ...extra } });
      K[k] = { id: row.id, ext, partyId };
    };
    for (const k of ["P1", "P3", "P4", "P7", "P8", "PD", "PR", "C1", "N1", "Z"]) await contact(`k${k}`, ids.tA, sysA, "cA", party[k]); // P2 P6 = ไม่มี LINE
    await contact("kP5", ids.tA, sysA, "cA", party.P5, { blockedAt: new Date() });
    await contact("kB", ids.tB, sysB, "cB", party.PB);
    const otherParty = (await prisma.party.create({ data: { tenantId: ids.tA, kind: "PERSON", name: `คนอื่นทดสอบ${RAND}` } })).id;
    await contact("kOther", ids.tA, sysA, "cA", otherParty);
    for (const k of ["kFree1", "kFree2", "kFree3"]) await contact(k, ids.tA, sysA, "cA", null);

    // จบงาน PD (เช็กอิน 10:00 → เริ่ม 10:00 → เสร็จ 10:20)
    for (const [op, t] of [["checkIn", "10:00"], ["startJob", "10:00"], ["completeJob", "10:20"]] as const) {
      const r = op === "checkIn" ? await LN().checkIn(cA, { appointmentId: ap.PD }, { via: "STAFF", now: at(D, t) }) : await LN()[op](cA, ap.PD, { now: at(D, t) });
      ok(r?.ok, `PD ${op}: ${r?.code} ${r?.reason}`);
    }
    // walk-in หน่วยคิว (W1..W5 · 11:00:0i · ไม่มีเบอร์) + หน่วยล่าช้า (WD 10:30 เริ่มทันที · 60 นาที)
    for (let i = 1; i <= 5; i++) {
      const r = await LN().createWalkIn(cQ, { serviceId: ids.qShave, staffId: null, channel: "STAFF" }, { now: at(D, "11:00", i) });
      ok(r?.ok, `walk-in W${i}: ${r?.code} ${r?.reason}`);
      W[`W${i}`] = r.appointmentId; ticketOf[`W${i}`] = r.ticketId; ticketNo[`W${i}`] = r.ticketNumber;
    }
    {
      const r = await LN().createWalkIn(cD, { serviceId: ids.dWash, staffId: null, channel: "STAFF" }, { now: at(D, "10:30") });
      ok(r?.ok, `walk-in WD: ${r?.code} ${r?.reason}`);
      W.WD = r.appointmentId;
      const s = await LN().startJob(cD, W.WD, { now: at(D, "10:30") });
      ok(s?.ok, `WD start: ${s?.code} ${s?.reason}`);
    }
    // ผูกรหัสด้วยชิ้นของ R0.7 (ไม่พึ่งงานของใบนี้): W4 → kFree1 · W5 → kFree2 · P6 → kOther (ผู้ติดต่อมี Party อื่น ⇒ partyMismatch)
    const linkVia = async (purpose: string, refId: string, k: string, resolvedParty: string | null) => {
      const iss = await CHAT().issueLinkCode({ tenantId: ids.tA }, { purpose, refId, ttlMin: 30 * 24 * 60, connectionId: conn.cA });
      ok(iss?.ok, `issueLinkCode ${purpose}: ${fmt(iss)}`);
      const res = await CHAT().consumeLinkCode({ tenantId: ids.tA }, { connectionId: conn.cA, chatContactId: K[k].id, text: iss.code, resolveParty: async () => resolvedParty });
      ok(!!res, `consumeLinkCode ${purpose} → ${k} = null`);
    };
    await linkVia("QUEUE_TICKET", ticketOf.W4, "kFree1", null);
    await linkVia("QUEUE_TICKET", ticketOf.W5, "kFree2", null);
    await linkVia("APPOINTMENT", ap.P6, "kOther", party.P6);
    await parkOutbox([ids.tA, ids.tB]);
    setupOk = true;
    console.log("  ✓ ข้อมูลพร้อม");
  } catch (e) {
    console.log(`  ❌ สร้างข้อมูลทดสอบไม่สำเร็จ: ${errMsg(e)}`);
  }
  const needSetup = () => ok(setupOk, "สร้างข้อมูลทดสอบไม่สำเร็จ (ดูบรรทัดบน)");
  const notify = async (ctx: Ctx, key: string, kind: Kind, now: Date, offsetMin?: number): Promise<Outcome> =>
    keep(await NT.notify()(ctx, { appointmentId: key, kind, ...(offsetMin !== undefined ? { offsetMin } : {}) }, { now }));

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC: ตัวควบคุม (ต้องเขียวตั้งแต่ก่อนมีงาน) ──");
  await st("PC-1", `ข้อมูลทดสอบ: แม่แบบ 7 หน่วย · นัด ${Object.keys(BOOK).length} รายการ CONFIRMED + Party · walk-in W1–W5 (A001–A005) · PD จบงาน · ผูกรหัส W4/W5/P6 ด้วยชิ้น R0.7`, async () => {
    needSetup();
    eq([1, 2, 3, 4, 5].map((i) => ticketNo[`W${i}`]), ["A001", "A002", "A003", "A004", "A005"], "เลขบัตร W1–W5");
    eq((await apRow(ap.PD)).status, "DONE", "PD");
    for (const k of Object.keys(BOOK).filter((x) => x !== "PD")) eq((await apRow(ap[k])).status, "CONFIRMED", `สถานะ ${k}`);
    const used = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "ChatLinkCode" WHERE "tenantId" = $1 AND "usedAt" IS NOT NULL`, [ids.tA]);
    eq(used[0].n, 3, "รหัสที่ใช้แล้ว");
  });
  await st("PC-2", "ตัวจำลอง LINE + notifyCustomer (R0.7): ส่งถึงผู้ติดต่อของ Party บน OA ของหน่วยได้ 1 ครั้ง · คีย์เดิมซ้ำ = duplicate ไม่ส่งเพิ่ม · ไม่มีคำขอหลุดออกนอกเครื่อง", async () => {
    needSetup();
    const nc = ncLoad.mod?.notifyCustomer;
    ok(typeof nc === "function", `notifyCustomer โหลดไม่ได้ (${ncLoad.err})`);
    const m0 = mark();
    const input = { unitId: ids.uA, domain: "booking", messageKey: "confirmation", partyId: party.P1, vars: { ชื่อ: "ทดสอบ" }, dedupeKey: `svc-b9:${RAND}:pc2`, at: at(D, "12:00") };
    const r1 = await nc({ tenantId: ids.tA }, input);
    const r2 = await nc({ tenantId: ids.tA }, input);
    eq([r1?.status, r1?.channel], ["SENT", "LINE"], "ครั้งแรก");
    ok(r2?.duplicate === true, `ครั้งสอง ${fmt(r2)}`);
    eq(pushesTo(K.kP1.ext, m0).length, 1, "จำนวน push");
    eq(pushesTo(K.kP1.ext, m0)[0].auth, `Bearer qcb9tokA${RAND}`, "token OA");
    eq(BLOCKED, [], "คำขอนอกเครื่อง");
  });
  await st("PC-3", "ผูกรหัสของ R0.7 ผ่าน webhook path: issueLinkCode QUEUE_TICKET + handleLinkCodeText ⇒ linked (ทะเบียน postback ใช้ได้)", async () => {
    needSetup();
    const iss = await CHAT().issueLinkCode({ tenantId: ids.tA }, { purpose: "QUEUE_TICKET", refId: ticketOf.W2, ttlMin: 600, connectionId: conn.cA });
    ok(iss?.ok, fmt(iss));
    const r = await PB().handleLinkCodeText({ tenantId: ids.tA, connectionId: conn.cA, chatContactId: K.kFree3.id, replyToken: null }, iss.code);
    eq([r?.matched, r?.linked], [true, true], "ผล");
    // คืนสภาพ: ไม่ให้ W2 มีผู้รับ (N-7a ใช้ W2 = ไม่มีผู้รับ)
    await prisma.chatLinkCode.deleteMany({ where: { tenantId: ids.tA, refId: ticketOf.W2 } });
  });

  await st("PC-4", "ฉากเป็นไปได้ (B.5 loadTodayLine + ค่าตั้งแม่แบบ): หน่วยคิว D 11:01 แถวรอ W1–W5 (W4 ข้างหน้า 3) · หน่วยล่าช้า D 11:50 แผนนัด Z ช้ากว่า 11:45 ≥ 5 นาที · reminderOffsetsMin [1440,120] · nearTurnAhead 2 · delayAlertMin(หน่วยล่าช้า) 5 · rebookAfterDays(โกนหนวด) 28", async () => {
    needSetup();
    const tl = await tryImport<Any>("@/lib/modules/booking/today-line");
    const load = tl.mod?.loadTodayLine;
    ok(typeof load === "function", `loadTodayLine (B.5) โหลดไม่ได้ ${tl.err}`);
    const ALL = { view: true, operate: true, checkIn: true, walkIn: true, runOwn: true, runAny: true, fullPhone: false };
    const vq = await load(cQ, { userId: ids.uOwner, access: ALL }, { now: at(D, "11:01") });
    eq((vq?.waiting ?? []).map((j: Any) => j.appointmentId), [1, 2, 3, 4, 5].map((i) => W[`W${i}`]), "แถวรอหน่วยคิว");
    const vd = await load(cD, { userId: ids.uOwner, access: ALL }, { now: at(D, "11:50") });
    const z = [...(vd?.waiting ?? []), ...(vd?.inService ?? [])].find((j: Any) => j.appointmentId === ap.Z);
    ok(!!z && typeof z.plannedStartMs === "number" && z.plannedStartMs - at(D, "11:45").getTime() >= 5 * 60_000, `แผน Z ${fmt(z && { planned: z.plannedStartMs, booked: z.bookedStartMs })}`);
    const r = await SET().resolveSettings({ tenantId: ids.tA }, ["booking.notify.reminderOffsetsMin", "booking.notify.nearTurnAhead", "booking.msg.enabled"], { unitId: ids.uA });
    eq([r["booking.notify.reminderOffsetsMin"]?.value, r["booking.notify.nearTurnAhead"]?.value], [[1440, 120], 2], "ค่าตั้งหน่วยหลัก");
    eq(r["booking.msg.enabled"]?.value, enabledMap(["courseExpiry"]), "msg.enabled แม่แบบ BARBER");
    eq((await SET().resolveSettings({ tenantId: ids.tA }, ["booking.notify.delayAlertMin"], { unitId: ids.uD }))["booking.notify.delayAlertMin"]?.value, 5, "delayAlertMin");
    eq((await SET().resolveSettings({ tenantId: ids.tA }, ["booking.service.rebookAfterDays"], { unitId: ids.uA, serviceId: ids.svcShave }))["booking.service.rebookAfterDays"]?.value, 28, "rebookAfterDays");
  });

  // ═══════════════ N notifyBooking ═══════════════
  console.log("\n── N: notifyBooking (§3.1) ──");
  await st("N-1", "export: BOOKING_MSG_KINDS (10 ชนิด ตามลำดับ) · notifyBooking · runBookingNotifyTick · onBookingNotifyEvent", () => {
    const m = notifyLoad.mod as NotifyApi | null;
    ok(!!m, `โหลด ${F.notify} ไม่ได้: ${notifyLoad.err}`);
    eq([...(m!.BOOKING_MSG_KINDS ?? [])], [...KINDS], "BOOKING_MSG_KINDS");
    for (const f of ["notifyBooking", "runBookingNotifyTick", "onBookingNotifyEvent"]) ok(typeof (m as Any)[f] === "function", `ไม่มี ${f}`);
  });
  await st("N-2", "confirmation P1 (D−3 10:00) ⇒ SENT ครั้งเดียว · ข้อความมีชื่อ + 15:30 + ชื่อช่าง · ไม่มีเบอร์ · ปุ่ม postback booking.reschedule?a=<id> · แถว log `booking:confirmation:<id>:<นาที>` SENT · เรียกซ้ำ = duplicate", async () => {
    needSetup();
    const m0 = mark();
    const key = `booking:confirmation:${ap.P1}:${mOf(at(D, "15:30"))}`;
    const r = await notify(cA, ap.P1, "confirmation", at(addDays(D, -3), "10:00"));
    eq([r.kind, r.status, r.dedupeKey, r.duplicate], ["confirmation", "SENT", key, false], "ผล");
    const r2 = await notify(cA, ap.P1, "confirmation", at(addDays(D, -3), "10:05"));
    ok(r2.duplicate === true && r2.dedupeKey === key, `ครั้งสอง ${fmt(r2)}`);
    const ps = pushesTo(K.kP1.ext, m0);
    eq(ps.length, 1, "push");
    const t = msgText(ps[0]);
    ok(t.includes(nameOf.P1) && t.includes("15:30") && t.includes(STAFF_NAME.s1), `ข้อความ: ${t.slice(0, 160)}`);
    eq(phoneLeak(js(ps[0].json)), [], "เบอร์ในข้อความ");
    ok(js(ps[0].json).includes(`booking.reschedule?a=${ap.P1}`), "ไม่มีปุ่ม booking.reschedule");
    eq((await logRows(key)).map((x) => x.status), ["SENT"], "log");
  });
  await st("N-3", "ปิดชนิด confirmation ที่หน่วย ⇒ DISABLED · ไม่ส่ง · ไม่มีแถว log (dedupeKey null)", async () => {
    needSetup();
    await sv(ids.tA, ids.uA, "booking.msg.enabled", enabledMap(["confirmation", "courseExpiry"]));
    try {
      const m0 = mark();
      const r = await notify(cA, ap.P3, "confirmation", at(addDays(D, -3), "10:00"));
      eq([r.status, r.dedupeKey], ["DISABLED", null], "ผล");
      eq(pushesTo(K.kP3.ext, m0).length, 0, "push");
      eq((await logRows(`booking:confirmation:${ap.P3}:${mOf(at(D, "11:00"))}`)).length, 0, "log");
    } finally { await svClear(ids.tA, ids.uA, "booking.msg.enabled"); }
  });
  await st("N-4", "ถ้อยคำที่ร้านแก้ (booking.msg.confirmation ชั้น UNIT) ⇒ ข้อความที่ส่ง = ถ้อยคำใหม่ + ตัวแปรเติมแล้ว", async () => {
    needSetup();
    await sv(ids.tA, ids.uA, "booking.msg.confirmation", { th: "ข้อความแก้แล้ว #B9EDIT {ชื่อ} เวลา {เวลา}" });
    try {
      const m0 = mark();
      const r = await notify(cA, ap.P4, "confirmation", at(addDays(D, -3), "10:00"));
      eq(r.status, "SENT", "ผล");
      const t = msgText(pushesTo(K.kP4.ext, m0)[0]);
      ok(t.startsWith("ข้อความแก้แล้ว #B9EDIT") && t.includes(nameOf.P4) && t.includes("16:30") && !t.includes("{"), `ข้อความ: ${t.slice(0, 160)}`);
    } finally { await svClear(ids.tA, ids.uA, "booking.msg.confirmation"); }
  });
  await st("N-5", "แต่ละชนิดปิดได้: ปิดทั้ง 10 ⇒ ทุกชนิด DISABLED (ตรวจก่อนสถานะ) · เปิดทั้ง 10 ⇒ courseExpiry = BAD_STATE · ชนิดที่สถานะไม่เข้า (yourTurn บนนัดยังไม่มา) = BAD_STATE", async () => {
    needSetup();
    await sv(ids.tA, ids.uA, "booking.msg.enabled", enabledMap([...KINDS]));
    try {
      const bad: string[] = [];
      for (const k of KINDS) { const r = await notify(cA, ap.P2, k, at(addDays(D, -3), "10:00"), 60); if (r.status !== "DISABLED" || r.dedupeKey !== null) bad.push(`${k}=${r.status}`); }
      ok(bad.length === 0, `ไม่ DISABLED: ${bad.join(" ")}`);
      await sv(ids.tA, ids.uA, "booking.msg.enabled", enabledMap([]));
      eq((await notify(cA, ap.P2, "courseExpiry", at(addDays(D, -3), "10:00"))).status, "BAD_STATE", "courseExpiry");
      eq((await notify(cA, ap.P2, "yourTurn", at(addDays(D, -3), "10:00"))).status, "BAD_STATE", "yourTurn บนนัดยังไม่มา");
      eq((await notify(cA, ap.P2, "reminder", at(addDays(D, -3), "10:00"))).status, "BAD_STATE", "reminder ไม่ส่ง offsetMin");
    } finally { await svClear(ids.tA, ids.uA, "booking.msg.enabled"); }
  });
  await st("N-6", "เวลาเงียบ: reminder P4 (D−1 22:30) ⇒ SKIPPED_QUIET + retryAt = D 08:00 ไม่ส่ง · ticketIssued W5 (D 22:30 · ลูกค้ารอทันที) ⇒ ข้ามเวลาเงียบ SENT ถึงผู้ติดต่อที่ผูกรหัส (มีเลขบัตร)", async () => {
    needSetup();
    const m0 = mark();
    const r = await notify(cA, ap.P4, "reminder", at(addDays(D, -1), "22:30"), 1440);
    eq(r.status, "SKIPPED_QUIET", "reminder");
    eq(r.retryAt instanceof Date ? r.retryAt.getTime() : r.retryAt, at(D, "08:00").getTime(), "retryAt");
    eq(pushesTo(K.kP4.ext, m0).length, 0, "push reminder");
    const t = await notify(cQ, W.W5, "ticketIssued", at(D, "22:30"));
    eq(t.status, "SENT", "ticketIssued");
    const ps = pushesTo(K.kFree2.ext, m0);
    eq(ps.length, 1, "push ticketIssued");
    ok(msgText(ps[0]).includes(ticketNo.W5), `ไม่มีเลขบัตร: ${msgText(ps[0]).slice(0, 120)}`);
  });
  await st("N-7", "ไม่มีผู้รับ: W2 (walk-in ไม่มีเบอร์ ไม่ผูกรหัส) ⇒ NO_RECIPIENT ไม่มีแถว log · P2 (มี Party แต่ไม่มี LINE บน OA) ⇒ NO_CHANNEL ไม่ส่ง", async () => {
    needSetup();
    const m0 = mark();
    const a = await notify(cQ, W.W2, "ticketIssued", at(D, "11:00", 30));
    eq([a.status, a.dedupeKey], ["NO_RECIPIENT", null], "W2");
    eq((await logRows(`booking:ticketIssued:${ticketOf.W2}`)).length, 0, "log W2");
    const b = await notify(cA, ap.P2, "confirmation", at(addDays(D, -3), "10:00"));
    eq(b.status, "NO_CHANNEL", "P2");
    eq(FAKE.slice(m0).filter((x) => x.path === "/v2/bot/message/push").length, 0, "push");
  });
  await st("N-8", "X1: ctx ร้าน B อ้างนัดร้าน A ⇒ NOT_FOUND · สาขาอื่นของร้านเดียวกัน ⇒ NOT_FOUND · ไม่ส่ง", async () => {
    needSetup();
    const m0 = mark();
    for (const [ctx, what] of [[{ tenantId: ids.tB, unitId: ids.uA }, "ร้าน B"], [{ tenantId: ids.tB, unitId: ids.uB }, "ร้าน B หน่วย B"], [cQ, "สาขาอื่น"]] as const) {
      const r = await notify(ctx, ap.P1, "reminder", at(addDays(D, -1), "15:30"), 1440);
      eq([r.status, r.dedupeKey], ["NOT_FOUND", null], what);
    }
    eq(pushesTo(K.kP1.ext, m0).length, 0, "push");
  });
  await st("N-9", "คลินิก (แม่แบบ CLINIC): ร้านแก้ถ้อยคำใส่ {บริการ} ⇒ ข้อความที่ส่งไม่มีชื่อบริการ (ยังมีชื่อหมอ + เวลา)", async () => {
    needSetup();
    await sv(ids.tA, ids.uC, "booking.msg.confirmation", { th: "ยืนยันนัด [{บริการ}] กับ {ช่าง} เวลา {เวลา} #CLN" });
    try {
      const m0 = mark();
      const r = await notify(cC, ap.C1, "confirmation", at(addDays(D, -3), "10:00"));
      eq(r.status, "SENT", "ผล");
      const t = msgText(pushesTo(K.kC1.ext, m0)[0]);
      ok(t.includes("#CLN") && t.includes(STAFF_NAME.c1) && t.includes("14:00"), `ข้อความ: ${t.slice(0, 160)}`);
      ok(!t.includes(C_SVC_NAME), `มีชื่อบริการ: ${t.slice(0, 160)}`);
    } finally { await svClear(ids.tA, ids.uC, "booking.msg.confirmation"); }
  });
  await st("N-10", "optOut: ผู้ติดต่อของ P5 ถูกบล็อก ⇒ SKIPPED_CONSENT ไม่ส่ง", async () => {
    needSetup();
    const m0 = mark();
    const r = await notify(cA, ap.P5, "confirmation", at(addDays(D, -3), "10:00"));
    eq(r.status, "SKIPPED_CONSENT", "ผล");
    eq(pushesTo(K.kP5.ext, m0).length, 0, "push");
  });
  await st("N-11", "หน่วยไม่ได้ตั้ง LINE OA (messaging.lineConnectionId ว่าง) ⇒ NO_CHANNEL ไม่ส่ง (ไม่เดา OA อื่น)", async () => {
    needSetup();
    const m0 = mark();
    const r = await notify(cN, ap.N1, "confirmation", at(addDays(D, -3), "10:00"));
    eq(r.status, "NO_CHANNEL", "ผล");
    eq(pushesTo(K.kN1.ext, m0).length, 0, "push");
  });
  await st("N-12", "ผู้รับจากรหัสผูก: W4 (walk-in ไม่มี Party) ผูกกับ kFree1 ⇒ ticketIssued ถึง kFree1 (มีเลขบัตร A004)", async () => {
    needSetup();
    const m0 = mark();
    const r = await notify(cQ, W.W4, "ticketIssued", at(D, "11:00", 40));
    eq([r.status, r.dedupeKey], ["SENT", `booking:ticketIssued:${ticketOf.W4}`], "ผล");
    const ps = pushesTo(K.kFree1.ext, m0);
    eq(ps.length, 1, "push");
    ok(msgText(ps[0]).includes(ticketNo.W4), `ข้อความ: ${msgText(ps[0]).slice(0, 120)}`);
  });
  await st("N-13", "partyMismatch: P6 ผูกรหัสกับ kOther ที่มี Party อื่น ⇒ ไม่ใช้ kOther (ตกไปทาง Party ของนัด = ไม่มี LINE ⇒ NO_CHANNEL) · kOther ไม่ได้ข้อความ", async () => {
    needSetup();
    const m0 = mark();
    const r = await notify(cA, ap.P6, "confirmation", at(addDays(D, -3), "10:00"));
    eq(r.status, "NO_CHANNEL", "ผล");
    eq(pushesTo(K.kOther.ext, m0).length, 0, "push ถึง kOther");
  });

  // ═══════════════ K รหัสผูก + postback ═══════════════
  console.log("\n── K: รหัสผูก + postback booking.* (§3.2) ──");
  await st("K-0", "ทะเบียน postback-routes มี route prefix \"booking.\" (resolveParty · onPostback · onLinked เป็นฟังก์ชัน)", () => {
    const routes = (PB().POSTBACK_ROUTES ?? []) as Any[];
    const r = routes.find((x) => x?.prefix === "booking.");
    ok(!!r, `ไม่มี route booking. (มี ${routes.map((x) => x?.prefix).join(",") || "ว่าง"})`);
    for (const f of ["resolveParty", "onPostback", "onLinked"]) ok(typeof r[f] === "function", `ไม่มี ${f}`);
  });
  const codes: Record<string, string> = {};
  await st("K-1", "issueBookingLinkCode: walk-in W3 ⇒ QUEUE_TICKET (refId = บัตร · หมดอายุไม่เกินสิ้นวันไทย · deepLink มี @qcb9a + รหัส) · นัด P2 ⇒ APPOINTMENT · ร้าน B ⇒ NOT_FOUND · หน่วยไม่มี OA ⇒ NOT_CONFIGURED · งานจบแล้ว ⇒ BAD_STATE", async () => {
    needSetup();
    const now = at(D, "11:00", 50);
    const w = keep(await NT.issue()(cQ, { appointmentId: W.W3 }, { now }));
    ok(w?.ok === true && w.purpose === "QUEUE_TICKET" && /^[A-Z2-9]{8}$/.test(String(w.code)), `W3 ${fmt(w)}`);
    ok(typeof w.deepLink === "string" && w.deepLink.includes("@qcb9a") && w.deepLink.includes(w.code), `deepLink ${w.deepLink}`);
    ok(new Date(w.expiresAt).getTime() <= bkkMs(addDays(D, 1), 0) + 60_000, `expiresAt ${w.expiresAt}`);
    const row = await q<{ purpose: string; refId: string; connectionId: string }>(`SELECT purpose, "refId", "connectionId" FROM "ChatLinkCode" WHERE "tenantId" = $1 AND "codeLast4" = $2 AND "usedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1`, [ids.tA, String(w.code).slice(-4)]);
    eq(row[0] ? [row[0].purpose, row[0].refId, row[0].connectionId] : null, ["QUEUE_TICKET", ticketOf.W3, conn.cA], "แถวรหัส");
    codes.W3 = w.code;
    const p = keep(await NT.issue()(cA, { appointmentId: ap.P2 }, { now: at(addDays(D, -3), "10:00") }));
    ok(p?.ok === true && p.purpose === "APPOINTMENT", `P2 ${fmt(p)}`);
    codes.P2 = p.code;
    const p8 = keep(await NT.issue()(cA, { appointmentId: ap.P8 }, { now: at(addDays(D, -3), "10:00") }));
    ok(p8?.ok === true && p8.purpose === "APPOINTMENT", `P8 ${fmt(p8)}`);
    codes.P8 = p8.code;
    eq((await NT.issue()(cB, { appointmentId: ap.P2 }, { now }))?.code, "NOT_FOUND", "ร้าน B");
    eq((await NT.issue()(cN, { appointmentId: ap.N1 }, { now }))?.code, "NOT_CONFIGURED", "ไม่มี OA");
    eq((await NT.issue()(cA, { appointmentId: ap.PD }, { now }))?.code, "BAD_STATE", "งานจบ");
  });
  await st("K-2", "ลูกค้าส่งรหัสบัตร W3 ในแชท (handleLinkCodeText) ⇒ ผูก + คำตอบมีเลขบัตร A003 · ไม่มีเบอร์ · แถวรหัสใช้โดยผู้ติดต่อนี้", async () => {
    needSetup();
    ok(!!codes.W3, "ไม่มีรหัส W3 (K-1)");
    const r = await PB().handleLinkCodeText({ tenantId: ids.tA, connectionId: conn.cA, chatContactId: K.kFree3.id, replyToken: null }, codes.W3);
    if (r?.reply) REPLIES.push(r.reply);
    eq([r?.matched, r?.linked], [true, true], "ผล");
    ok(String(r?.reply?.text ?? "").includes(ticketNo.W3), `คำตอบ: ${String(r?.reply?.text).slice(0, 120)}`);
    const used = await q<{ u: string }>(`SELECT "usedByChatContactId" AS u FROM "ChatLinkCode" WHERE "tenantId" = $1 AND "refId" = $2`, [ids.tA, ticketOf.W3]);
    ok(used.some((x) => x.u === K.kFree3.id), "ไม่ได้ผูกกับ kFree3");
  });
  await st("K-3", "onLinked: รหัสนัด P2 โดยผู้ติดต่อที่มี Party อื่น (partyMismatch) ⇒ คำตอบ = LINK_OK_TEXT ตรงตัว (ไม่บอกเวลา/ชื่อ) · รหัสนัด P8 โดยเจ้าของ ⇒ คำตอบมีเวลา 17:00", async () => {
    needSetup();
    ok(!!codes.P2 && !!codes.P8, "ไม่มีรหัส (K-1)");
    const a = await PB().handleLinkCodeText({ tenantId: ids.tA, connectionId: conn.cA, chatContactId: K.kOther.id, replyToken: null }, codes.P2);
    if (a?.reply) REPLIES.push(a.reply);
    eq([a?.linked, a?.reply?.text], [true, PB().LINK_OK_TEXT], "mismatch");
    const b = await PB().handleLinkCodeText({ tenantId: ids.tA, connectionId: conn.cA, chatContactId: K.kP8.id, replyToken: null }, codes.P8);
    if (b?.reply) REPLIES.push(b.reply);
    ok(b?.linked === true && String(b?.reply?.text ?? "").includes("17:00"), `เจ้าของ: ${fmt(b?.reply)}`);
  });

  // ═══════════════ E consumer (ก่อนเช็กอิน P3) ═══════════════
  console.log("\n── E: consumer ส่งซ้ำ/พร้อมกัน (X4) ──");
  const consLoad = await tryImport<{ consumers: Record<string, (evt: Any) => Promise<void>> }>("@/lib/outbox-consumers");
  const CONS = (type: string) => {
    const c = consLoad.mod?.consumers?.[type];
    if (typeof c !== "function") throw new AssertFail(`consumers["${type}"] ไม่มี (${consLoad.err})`);
    return c;
  };
  const evt = (type: string, unitId: string, payload: Record<string, unknown>) => ({ id: rid("evt"), tenantId: ids.tA, type, payload, systemId: null, unitId });
  await st("E-2", "booking.created (BOOKED) ของ P3 · consumer 5 ทางพร้อมกัน ⇒ confirmation ถึง kP3 ครั้งเดียว (มี 11:00)", async () => {
    needSetup();
    const m0 = mark();
    const e = evt("booking.created", ids.uA, { appointmentId: ap.P3, unitId: ids.uA, staffId: ids.s1, kind: "BOOKED", channel: "STAFF", serviceId: ids.svcCut });
    await Promise.all(Array.from({ length: 5 }, () => CONS("booking.created")(e)));
    const ps = pushesTo(K.kP3.ext, m0);
    eq(ps.length, 1, "push");
    ok(msgText(ps[0]).includes("11:00"), `ข้อความ: ${msgText(ps[0]).slice(0, 120)}`);
  });

  await st("K-4", "postback booking.checkin?a=P3 จากเจ้าของ (kP3 · Party ตรง) 5 ทางพร้อมกัน (D 10:55) ⇒ P3 ARRIVED · บัตรเดียว · ทุกคำตอบมีเลขบัตรเดียวกัน", async () => {
    needSetup();
    const ctx = pbCtx("kP3");
    const rs = await Promise.all(Array.from({ length: 5 }, () => NT.postback()(ctx, parsePb(`booking.checkin?a=${ap.P3}`), { now: at(D, "10:55") })));
    rs.forEach((r) => REPLIES.push(r));
    await parkOutbox([ids.tA]);
    const row = await apRow(ap.P3);
    eq(row.status, "ARRIVED", "สถานะ");
    const n = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "QueueTicket" WHERE "tenantId" = $1 AND "refType" = 'APPOINTMENT' AND "refId" = $2 AND status::text <> 'CANCELLED'`, [ids.tA, ap.P3]);
    eq(n[0].n, 1, "บัตร");
    const num = await tkNumber(row.queueTicketId);
    const bad = rs.filter((r) => !String(r?.text ?? "").includes(num));
    ok(bad.length === 0, `คำตอบไม่มีเลข ${num}: ${fmt(bad[0])}`);
  });
  await st("E-1", "booking.checked_in ของ P3 (แถว outbox จริง) · consumer 2 ครั้ง ⇒ checkedIn ถึง kP3 ครั้งเดียว (มีเลขบัตร)", async () => {
    needSetup();
    const [o] = await q<{ id: string; type: string; payload: Any; unitId: string }>(`SELECT id, type, payload, "unitId" FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'booking.checked_in' AND payload->>'appointmentId' = $2 LIMIT 1`, [ids.tA, ap.P3]);
    ok(!!o, "ไม่มี event booking.checked_in ของ P3 (K-4 ล้ม?)");
    const m0 = mark();
    const e = { id: o.id, tenantId: ids.tA, type: o.type, payload: o.payload, systemId: null, unitId: o.unitId };
    await CONS("booking.checked_in")(e);
    await CONS("booking.checked_in")(e);
    const ps = pushesTo(K.kP3.ext, m0);
    eq(ps.length, 1, "push");
    ok(msgText(ps[0]).includes(await tkNumber((await apRow(ap.P3)).queueTicketId)), `ข้อความ: ${msgText(ps[0]).slice(0, 120)}`);
  });

  await st("K-5", "ไม่ใช่เจ้าของ ⇒ ข้อความกลางเดียว (BOOKING_POSTBACK_NOT_FOUND) ทุกไบต์: kOther เช็กอินนัด P4 · kOther เช็กอิน P6 (ผูกรหัสแต่ partyMismatch) · id สุ่ม · ไม่มีพารามิเตอร์ · action ไม่รู้จัก ⇒ P4/P6 ไม่เปลี่ยน ไม่มีบัตร", async () => {
    needSetup();
    const NF = NOT_FOUND_TEXT();
    const ctx = pbCtx("kOther");
    const now = at(D, "16:20");
    const datas = [`booking.checkin?a=${ap.P4}`, `booking.checkin?a=${ap.P6}`, `booking.checkin?a=svcb9_nope_${RUN}`, "booking.checkin", `booking.zzz?a=${ap.P4}`, `booking.late?a=${ap.P4}`, `booking.reschedule?a=${ap.P1}`];
    for (const d of datas) {
      const r = await NT.postback()(ctx, parsePb(d), { now });
      REPLIES.push(r);
      eq(r?.text, NF, d);
    }
    for (const k of ["P4", "P6"]) { const r = await apRow(ap[k]); eq([r.status, r.queueTicketId], ["CONFIRMED", null], k); }
  });
  await st("K-6", "X1: ผู้ติดต่อร้าน B (ctx จาก OA ร้าน B) กดเช็กอินนัดของร้าน A ⇒ ข้อความกลาง · นัดไม่เปลี่ยน", async () => {
    needSetup();
    const r = await NT.postback()(pbCtx("kB", ids.tB, "cB"), parsePb(`booking.checkin?a=${ap.P4}`), { now: at(D, "16:20") });
    REPLIES.push(r);
    eq(r?.text, NOT_FOUND_TEXT(), "คำตอบ");
    eq((await apRow(ap.P4)).status, "CONFIRMED", "P4");
  });
  await st("K-7", "ไปไม่ทัน (booking.late?a=P4 · เจ้าของ · D 16:35) กด 2 ครั้ง ⇒ คำตอบรับทราบ (ไม่ใช่ข้อความกลาง) · audit booking.customer.running_late แถวเดียว (ไม่มีเบอร์/ชื่อ) · สถานะนัดไม่เปลี่ยน", async () => {
    needSetup();
    const ctx = pbCtx("kP4");
    const NF = NOT_FOUND_TEXT();
    for (let i = 0; i < 2; i++) {
      const r = await NT.postback()(ctx, parsePb(`booking.late?a=${ap.P4}`), { now: at(D, "16:35", i * 30) });
      REPLIES.push(r);
      ok(!!String(r?.text ?? "").trim() && r?.text !== NF, `คำตอบครั้ง ${i + 1}: ${fmt(r)}`);
    }
    const rows = await q<{ after: Any; before: Any }>(`SELECT "after", "before" FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'booking.customer.running_late' AND "targetId" = $2`, [ids.tA, ap.P4]);
    eq(rows.length, 1, "audit");
    eq(phoneLeak(js(rows)), [], "เบอร์ใน audit");
    ok(!js(rows).includes(nameOf.P4), "ชื่อใน audit");
    eq((await apRow(ap.P4)).status, "CONFIRMED", "P4");
  });
  await st("K-9", "เลื่อนนัด (booking.reschedule?a=P1) จากเจ้าของ ⇒ คำตอบที่ไม่ใช่ข้อความกลาง", async () => {
    needSetup();
    const r = await NT.postback()(pbCtx("kP1"), parsePb(`booking.reschedule?a=${ap.P1}`), { now: at(addDays(D, -1), "16:00") });
    REPLIES.push(r);
    ok(!!String(r?.text ?? "").trim() && r?.text !== NOT_FOUND_TEXT(), fmt(r));
  });
  await st("K-10", "ผ่านทะเบียนจริง (dispatchPostback): id สุ่ม ⇒ handled + ข้อความกลาง · ข้อมูลผิดรูป ⇒ ไม่ handled", async () => {
    needSetup();
    const r = await PB().dispatchPostback(pbCtx("kP1"), `booking.checkin?a=svcb9_nope2_${RUN}`);
    if (r?.reply) REPLIES.push(r.reply);
    eq([r?.handled, r?.reply?.text], [true, NOT_FOUND_TEXT()], "ผล");
    eq((await PB().dispatchPostback(pbCtx("kP1"), "booking.checkin?a=<script>"))?.handled, false, "ผิดรูป");
  });

  // ═══════════════ T minute-job ═══════════════
  console.log("\n── T: minute-job booking.notify.tick (X5) ──");
  await st("T-0", "minute-jobs.ts ลงทะเบียน booking.notify.tick (everyMinutes 1) → runBookingNotifyTick (โหลดตอนรัน)", () => {
    const s = stripComments(src(F.minute));
    const i = s.indexOf('"booking.notify.tick"');
    ok(i > 0, "ไม่พบชื่องาน booking.notify.tick");
    const blk = s.slice(Math.max(0, i - 200), i + 400);
    ok(/everyMinutes:\s*1\b/.test(blk) && /runBookingNotifyTick/.test(blk) && /import\(/.test(blk), `บล็อก: ${blk.replace(/\s+/g, " ").slice(0, 200)}`);
  }, "MAJOR");
  await st("T-1", "reminder P1: tick ร้าน A 2 ทางพร้อมกันที่ D−1 15:30 (1440) + ซ้ำ ⇒ 1 · D 13:30 (120) ⇒ +1 · D 13:31 ⇒ 0 · ปุ่ม checkin/late ของ P1 · ร้าน B ไม่ได้อะไร (tenantIds)", async () => {
    needSetup();
    const m0 = mark();
    await Promise.all([NT.tick()(at(addDays(D, -1), "15:30"), { tenantIds: [ids.tA] }), NT.tick()(at(addDays(D, -1), "15:30"), { tenantIds: [ids.tA] })]);
    await NT.tick()(at(addDays(D, -1), "15:30", 20), { tenantIds: [ids.tA] });
    eq(pushesTo(K.kP1.ext, m0).length, 1, "หลังรอบ 1440");
    eq(pushesTo(K.kB.ext, m0).length, 0, "ร้าน B");
    await NT.tick()(at(D, "13:30"), { tenantIds: [ids.tA] });
    await NT.tick()(at(D, "13:31"), { tenantIds: [ids.tA] });
    const ps = pushesTo(K.kP1.ext, m0);
    eq(ps.length, 2, "รวม");
    for (const p of ps) ok(js(p.json).includes(`booking.checkin?a=${ap.P1}`) && js(p.json).includes(`booking.late?a=${ap.P1}`), "ไม่มีปุ่ม checkin/late");
    for (const o of [1440, 120]) eq((await logRows(`booking:reminder:${ap.P1}:${o}:${mOf(at(D, "15:30"))}`)).map((x) => x.status), ["SENT"], `log ${o}`);
  });
  await st("T-6", "X1 ของ tick: tick ร้าน B (D−1 15:30) ⇒ kB ได้เตือน 1 · ร้าน A ไม่ได้เพิ่ม", async () => {
    needSetup();
    const m0 = mark();
    await NT.tick()(at(addDays(D, -1), "15:30"), { tenantIds: [ids.tB] });
    eq(pushesTo(K.kB.ext, m0).length, 1, "kB");
    eq(pushesTo(K.kP1.ext, m0).length, 0, "kP1");
  });
  await st("T-2", "จองหลังจุดเตือน: PR (สร้าง D 17:00 · นัด 18:00) ⇒ ไม่มีเตือนเลย (ทั้ง 1440/120) ตลอดทุก tick", async () => {
    needSetup();
    await NT.tick()(at(D, "17:30"), { tenantIds: [ids.tA] });
    eq(pushesTo(K.kPR.ext, 0).length, 0, "push ถึง kPR (ทั้งรอบ)");
  });
  await st("T-3", "nearTurn (หน่วยคิว · ข้างหน้า ≤ 2): D 11:01 W4 ข้างหน้า 3 ⇒ ไม่ส่ง · W1 เริ่ม 11:02 · tick 2 ทางพร้อมกัน 11:03 + ซ้ำ ⇒ W4 ได้ 1 (มี A004 + ปุ่ม booking.defer) · W5 (ข้างหน้า 3) ไม่ได้", async () => {
    needSetup();
    const m0 = mark();
    await NT.tick()(at(D, "11:01"), { tenantIds: [ids.tA] });
    eq(pushesTo(K.kFree1.ext, m0).length, 0, "11:01");
    const s = await LN().startJob(cQ, W.W1, { now: at(D, "11:02") });
    ok(s?.ok, `เริ่ม W1: ${s?.code} ${s?.reason}`);
    await parkOutbox([ids.tA]);
    await Promise.all([NT.tick()(at(D, "11:03"), { tenantIds: [ids.tA] }), NT.tick()(at(D, "11:03"), { tenantIds: [ids.tA] })]);
    await NT.tick()(at(D, "11:03", 30), { tenantIds: [ids.tA] });
    const ps = pushesTo(K.kFree1.ext, m0);
    eq(ps.length, 1, "W4");
    ok(msgText(ps[0]).includes(ticketNo.W4) && js(ps[0].json).includes(`booking.defer?a=${W.W4}`), `ข้อความ/ปุ่ม: ${msgText(ps[0]).slice(0, 120)}`);
    eq(pushesTo(K.kFree2.ext, m0).length, 0, "W5");
    eq((await logRows(`booking:nearTurn:${ticketOf.W4}`)).map((x) => x.status), ["SENT"], "log");
  });
  await st("K-8", "เลื่อนไปคิวหลัง (booking.defer?a=W4 · ผู้ติดต่อที่ผูกรหัส · D 11:05) ⇒ ใช้ deferTicket ของ B.6 · W4 อยู่หลัง W5 (checkedInAt) · คนอื่นกด ⇒ ข้อความกลาง", async () => {
    needSetup();
    ok(!!b6Load.mod, `ต้องมี B.6 (${F.publicLine}) — ${b6Load.err}`);
    const NF = NOT_FOUND_TEXT();
    const o = await NT.postback()(pbCtx("kOther"), parsePb(`booking.defer?a=${W.W4}`), { now: at(D, "11:05") });
    REPLIES.push(o);
    eq(o?.text, NF, "คนอื่น");
    const r = await NT.postback()(pbCtx("kFree1"), parsePb(`booking.defer?a=${W.W4}`), { now: at(D, "11:05") });
    REPLIES.push(r);
    ok(!!String(r?.text ?? "").trim() && r?.text !== NF, `เจ้าของ: ${fmt(r)}`);
    const w4 = await apRow(W.W4), w5 = await apRow(W.W5);
    ok(!!w4.checkedInAt && !!w5.checkedInAt && w4.checkedInAt.getTime() > w5.checkedInAt.getTime(), `W4 ${w4.checkedInAt?.toISOString()} · W5 ${w5.checkedInAt?.toISOString()}`);
  });
  await st("E-3", "queue.ticket.called ของ W4 (callJob จริง D 11:10) · consumer 2 ทางพร้อมกัน ⇒ yourTurn ถึง kFree1 ครั้งเดียว (มี A004)", async () => {
    needSetup();
    const c = await LN().callJob(cQ, W.W4, { now: at(D, "11:10") });
    ok(c?.ok, `callJob: ${c?.code} ${c?.reason}`);
    await parkOutbox([ids.tA]);
    const [o] = await q<{ id: string; type: string; payload: Any; unitId: string }>(`SELECT id, type, payload, "unitId" FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'queue.ticket.called' AND payload->>'appointmentId' = $2 ORDER BY "createdAt" DESC LIMIT 1`, [ids.tA, W.W4]);
    ok(!!o, "ไม่มี event queue.ticket.called");
    const m0 = mark();
    const e = { id: o.id, tenantId: ids.tA, type: o.type, payload: o.payload, systemId: null, unitId: o.unitId };
    await Promise.all([CONS("queue.ticket.called")(e), CONS("queue.ticket.called")(e)]);
    const ps = pushesTo(K.kFree1.ext, m0);
    eq(ps.length, 1, "push");
    ok(msgText(ps[0]).includes(ticketNo.W4), `ข้อความ: ${msgText(ps[0]).slice(0, 120)}`);
  });
  await st("T-4", "delayed (หน่วยล่าช้า · delayAlertMin 5): WD (60 นาที เริ่ม 10:30) ยังทำอยู่ 11:50 ⇒ นัด Z 11:45 เลื่อน ≥ 5 นาที · tick 2 ทางพร้อมกัน + ซ้ำ ⇒ ถึง kZ 1 ครั้ง (มี 11:45 + จำนวนนาที ≥ 5)", async () => {
    needSetup();
    const m0 = mark();
    await Promise.all([NT.tick()(at(D, "11:50"), { tenantIds: [ids.tA] }), NT.tick()(at(D, "11:50"), { tenantIds: [ids.tA] })]);
    await NT.tick()(at(D, "11:50", 30), { tenantIds: [ids.tA] });
    const ps = pushesTo(K.kZ.ext, m0).filter((p) => /ช้ากว่ากำหนด/.test(msgText(p)));
    eq(ps.length, 1, "delayed");
    const t = msgText(ps[0]);
    const n = Number(/ประมาณ (\d+) นาที/.exec(t)?.[1] ?? "NaN");
    ok(t.includes("11:45") && n >= 5, `ข้อความ: ${t.slice(0, 160)}`);
    eq((await logRows(`booking:delayed:${ap.Z}:${mOf(at(D, "11:45"))}`)).map((x) => x.status), ["SENT"], "log");
  });
  await st("T-5", "rebookInvite (ตัดผม 28 วัน): PD จบ D 10:20 · tick D+27 ⇒ 0 · D+28 10:30 ⇒ 1 · ซ้ำ ⇒ 0", async () => {
    needSetup();
    const m0 = mark();
    await NT.tick()(at(addDays(D, 27), "10:30"), { tenantIds: [ids.tA] });
    eq(pushesTo(K.kPD.ext, m0).length, 0, "D+27");
    await NT.tick()(at(addDays(D, 28), "10:30"), { tenantIds: [ids.tA] });
    await NT.tick()(at(addDays(D, 28), "10:31"), { tenantIds: [ids.tA] });
    const ps = pushesTo(K.kPD.ext, m0);
    eq(ps.length, 1, "D+28");
    ok(msgText(ps[0]).includes(nameOf.PD), `ข้อความ: ${msgText(ps[0]).slice(0, 120)}`);
    eq((await logRows(`booking:rebookInvite:${ap.PD}`)).map((x) => x.status), ["SENT"], "log");
  });

  // ═══════════════ E ต่อ ═══════════════
  await st("E-4", "booking.no_show (P7 → NO_SHOW) · consumer 2 ครั้ง ⇒ noShowRebook ถึง kP7 ครั้งเดียว (มี 13:00) · บรรทัดเดิมของ no_show ยังวิ่ง (ไม่โยน)", async () => {
    needSetup();
    await q(`UPDATE "Appointment" SET status = 'NO_SHOW' WHERE id = $1`, [ap.P7]);
    const m0 = mark();
    const e = evt("booking.no_show", ids.uA, { appointmentId: ap.P7, tenantId: ids.tA, unitId: ids.uA, customerId: null, serviceId: ids.svcCut });
    await sv(ids.tA, ids.uA, "messaging.quietHours", null); // consumer ใช้นาฬิกาจริง — กันรันตอนกลางคืนแล้วติดเวลาเงียบ
    try {
      await CONS("booking.no_show")(e);
      await CONS("booking.no_show")(e);
    } finally { await sv(ids.tA, ids.uA, "messaging.quietHours", { start: "21:00", end: "08:00" }); }
    const ps = pushesTo(K.kP7.ext, m0);
    eq(ps.length, 1, "push");
    ok(msgText(ps[0]).includes("13:00") && msgText(ps[0]).includes(nameOf.P7), `ข้อความ: ${msgText(ps[0]).slice(0, 120)}`);
  });
  await st("E-5", "หลายโพรเซสพร้อมกัน: 3 โพรเซสลูกเรียก notifyBooking(P8 confirmation) พร้อมกัน ⇒ push ถึง kP8 1 ครั้ง · แถว log 1 แถว SENT · ผล SENT ไม่ซ้ำ 1 ราย อีก 2 = duplicate", async () => {
    needSetup();
    const m0 = mark();
    const now = at(addDays(D, -2), "10:00").toISOString();
    const run1 = () => new Promise<string>((resolve) => {
      const p = spawn("pnpm", ["exec", "tsx", SELF, "--child-notify", ids.tA, ids.uA, ap.P8, "confirmation", now], { cwd: ROOT, env: { ...process.env, LINE_API_BASE: FAKE_BASE } });
      let o = "";
      p.stdout.on("data", (b: Buffer) => { o += b.toString(); });
      p.stderr.on("data", (b: Buffer) => { o += b.toString(); });
      p.on("close", () => resolve(o));
    });
    const outs = await Promise.all([run1(), run1(), run1()]);
    const res = outs.map((o) => { const m = /CHILD_RESULT (\{.*\})/.exec(o); try { return m ? JSON.parse(m[1]) : { error: o.split("\n").slice(-3).join(" | ").slice(0, 160) }; } catch { return { error: "อ่านผลไม่ได้" }; } });
    keep(res);
    const errs = res.filter((r) => r?.error);
    ok(errs.length === 0, `โพรเซสลูกล้ม: ${fmt(errs[0])}`);
    eq(pushesTo(K.kP8.ext, m0).length, 1, "push");
    const key = `booking:confirmation:${ap.P8}:${mOf(at(D, "17:00"))}`;
    eq((await logRows(key)).map((x) => x.status), ["SENT"], "log");
    eq(res.filter((r) => r.status === "SENT" && r.duplicate === false).length, 1, "ผู้ชนะ");
    eq(res.filter((r) => r.duplicate === true).length, 2, "duplicate");
  });

  // ═══════════════ R รับบัตรคิวจากมือถือ ═══════════════
  console.log("\n── R: รับบัตรคิวจากมือถือ (#42 · §3.3) ──");
  const tA = SLUGS[ids.tA], tB = SLUGS[ids.tB], uR = SLUGS[ids.uR];
  const NOW_R = at(D, "12:00");
  const take = async (t: string, u: string, phone: string, clientKey: string, staffId: string | null = null) =>
    keep(await NT.take()(t, u, { serviceId: ids.rCut, staffId, phone, clientKey: `${clientKey}-${RUN}` }, { now: NOW_R }));
  const remotePhone = newPhone(); PHONES.push(remotePhone);
  const remotePhone2 = newPhone(); PHONES.push(remotePhone2);
  const walkCount = async () => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "unitId" = $1 AND kind = 'WALKIN'`, [ids.uR]))[0].n;
  await st("R-1", "loadRemoteTicketForm: หน่วยเปิด ⇒ บริการ + ช่าง (walkInPickStaff) + maxWaitMin 90 · ร้านอื่น/สาขาไม่มี ⇒ null · ปิด remoteTicket ⇒ null", async () => {
    needSetup();
    const f = keep(await NT.form()(tA, uR, { now: NOW_R }));
    ok(!!f && Array.isArray(f.services) && f.services.some((s: Any) => s.id === ids.rCut), `form ${fmt(f)}`);
    ok(Array.isArray(f.staff) && f.staff.some((s: Any) => s.id === ids.r1), `staff ${fmt(f.staff)}`);
    eq(f.maxWaitMin, 90, "maxWaitMin");
    eq(await NT.form()(tB, uR, { now: NOW_R }), null, "ร้านอื่น");
    eq(await NT.form()(tA, `nope-${RUN}`, { now: NOW_R }), null, "สาขาไม่มี");
    await sv(ids.tA, ids.uR, "booking.queue.remoteTicket", { enabled: false, maxWaitMin: 90 });
    try { eq(await NT.form()(tA, uR, { now: NOW_R }), null, "ปิด"); } finally { await svClear(ids.tA, ids.uR, "booking.queue.remoteTicket"); }
  });
  await st("R-2", "takeRemoteTicket ⇒ walk-in channel REMOTE QUEUED + บัตร · ticketUrl = /bq/t/<token ของ B.6> (loadTicketView ได้เลขเดียวกัน) · lineLink = ลิงก์แชท OA (@qcb9a) · ผลไม่มีเบอร์", async () => {
    needSetup();
    const n0 = await walkCount();
    const r = await take(tA, uR, remotePhone, "ck1");
    ok(r?.ok === true && typeof r.ticketNumber === "string", fmt(r));
    eq(await walkCount(), n0 + 1, "แถวใหม่");
    const [row] = await q<{ channel: string; status: string; queueTicketId: string }>(`SELECT channel, status::text AS status, "queueTicketId" FROM "Appointment" WHERE "unitId" = $1 AND kind = 'WALKIN' ORDER BY "createdAt" DESC LIMIT 1`, [ids.uR]);
    eq([row.channel, row.status, await tkNumber(row.queueTicketId)], ["REMOTE", "QUEUED", r.ticketNumber], "แถว");
    ok(String(r.ticketUrl).startsWith("/bq/t/"), `ticketUrl ${r.ticketUrl}`);
    ok(typeof r.lineLink === "string" && r.lineLink.includes("line.me") && r.lineLink.includes("@qcb9a"), `lineLink ${r.lineLink}`);
    eq(phoneLeak(js(r)), [], "เบอร์ในผล");
    const loadTicketView = b6Load.mod?.loadTicketView;
    ok(typeof loadTicketView === "function", `ต้องมี B.6 loadTicketView (${b6Load.err})`);
    const v = await loadTicketView(String(r.ticketUrl).slice("/bq/t/".length), { now: NOW_R });
    eq(v?.ticketNumber, r.ticketNumber, "หน้าบัตร B.6");
  });
  await st("R-3", "เบอร์เดิมรับซ้ำวันเดียวกัน ⇒ ALREADY · ไม่มีลิงก์บัตร/LINE ในผล · ไม่สร้างแถว", async () => {
    needSetup();
    const n0 = await walkCount();
    const r = await take(tA, uR, remotePhone, "ck2");
    eq([r?.ok, r?.code], [false, "ALREADY"], "ผล");
    ok(!js(r).includes("/bq/t/") && !js(r).includes("line.me"), `มีลิงก์: ${fmt(r)}`);
    eq(await walkCount(), n0, "แถว");
  });
  await st("R-4", "รอนานเกิน maxWaitMin (ตั้ง 5 นาที · มีงาน 30 นาทีรออยู่) ⇒ TOO_LONG ไม่สร้างแถว", async () => {
    needSetup();
    await sv(ids.tA, ids.uR, "booking.queue.remoteTicket", { enabled: true, maxWaitMin: 5 });
    try {
      const n0 = await walkCount();
      const r = await take(tA, uR, remotePhone2, "ck3");
      eq([r?.ok, r?.code], [false, "TOO_LONG"], "ผล");
      eq(await walkCount(), n0, "แถว");
    } finally { await svClear(ids.tA, ids.uR, "booking.queue.remoteTicket"); }
  });
  await st("R-5", "X7: ไม่พบ/ร้านอื่น/ปิด remoteTicket ⇒ {ok:false, code:NOT_FOUND, reason} เดียวกันทุกไบต์ · ไม่สร้างแถว", async () => {
    needSetup();
    const n0 = await walkCount();
    const a = await take(tA, `nope-${RUN}`, remotePhone2, "ck4");
    const b = await take(tB, uR, remotePhone2, "ck5");
    await sv(ids.tA, ids.uR, "booking.queue.remoteTicket", { enabled: false, maxWaitMin: 90 });
    let c: Any;
    try { c = await take(tA, uR, remotePhone2, "ck6"); } finally { await svClear(ids.tA, ids.uR, "booking.queue.remoteTicket"); }
    eq(a?.code, "NOT_FOUND", "ไม่พบ");
    eq(b, a, "ร้านอื่น");
    eq(c, a, "ปิด");
    eq(await walkCount(), n0, "แถว");
  });
  await st("R-6", "rate limit ก่อนแตะฐาน (5 ครั้ง/10 นาที/ผู้ใช้): เบอร์ผิด 5 ครั้ง = BAD_INPUT · ครั้งที่ 6 = RATE_LIMITED · ผู้ใช้อื่นยังได้ BAD_INPUT · REMOTE_RATE ตามสัญญา", async () => {
    needSetup();
    eq((remoteLoad.mod as RemoteApi | null)?.REMOTE_RATE?.perClient, { limit: 5, windowMs: 600000 }, "REMOTE_RATE");
    const codesSeen: string[] = [];
    for (let i = 0; i < 6; i++) codesSeen.push(String((await take(tA, uR, i % 2 ? "12" : "", "ckrl"))?.code));
    eq(codesSeen, ["BAD_INPUT", "BAD_INPUT", "BAD_INPUT", "BAD_INPUT", "BAD_INPUT", "RATE_LIMITED"], "ลำดับผล");
    eq((await take(tA, uR, "", "ckrl2"))?.code, "BAD_INPUT", "ผู้ใช้อื่น");
  });

  // ═══════════════ U คอมโพเนนต์ ═══════════════
  console.log("\n── U: คอมโพเนนต์ RemoteTicket (§4) ──");
  await st("U-1", "RemoteTicket: ฟอร์ม (radio serviceId · staffId มี \"\" · phone required · submit) · ผลสำเร็จมีเลขบัตร + ลิงก์บัตร + ลิงก์ LINE เฉพาะเมื่อมี · ผลล้มมี data-bq-remote-error · ไม่มีเบอร์ · ไม่ import ค่าจาก modules/platform/db", async () => {
    ok(existsSync(join(ROOT, F.remoteComp)), `ยังไม่มี ${F.remoteComp}`);
    const code = stripComments(src(F.remoteComp));
    const imps = [...code.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].filter((m) => !m[1]).map((m) => m[2]);
    ok(!imps.some((p) => /^@\/lib\/(modules|platform)\/|^@\/lib\/core\/db|^@prisma\/client/.test(p)), `import ต้องห้าม: ${imps.join(", ")}`);
    const modR = await tryImport<Any>(pathToFileURL(join(ROOT, F.remoteComp)).href);
    const C = modR.mod?.default;
    ok(typeof C === "function", `ไม่มี default export (${modR.err})`);
    const React = (await import("react" as string)) as Any;
    const RDS = (await import("react-dom/server" as string)) as Any;
    const form = { unitName: "สาขารับบัตร", services: [{ id: "sv1", name: "ตัดผมชาย", durationMin: 30 }], staff: [{ id: "st1", name: "ช่างอาร์" }], waitMin: 25, maxWaitMin: 90 };
    const act = async () => null;
    const render = (initial?: Any) => String(RDS.renderToStaticMarkup(React.createElement(C, { form, action: act, ...(initial ? { initial } : {}) })));
    const h0 = render();
    ok(/data-bq-remote[\s>=]/.test(h0) && /<form[^>]*data-bq-remote-form/.test(h0), "ราก/ฟอร์ม");
    ok(/type="radio"[^>]*name="serviceId"|name="serviceId"[^>]*type="radio"/.test(h0) && /value="sv1"/.test(h0), "radio serviceId");
    ok(/name="staffId"/.test(h0) && /value=""/.test(h0), "staffId + ใครก็ได้");
    ok(/<input[^>]*name="phone"[^>]*required|<input[^>]*required[^>]*name="phone"/.test(h0), "phone required");
    ok(/type="submit"/.test(h0), "submit");
    const okRes = { ok: true, ticketNumber: "A777", waitMin: 25, ticketUrl: "/bq/t/tok.sig", lineLink: "https://line.me/R/oaMessage/%40qcb9a/?ABCD2345" };
    const h1 = render(okRes);
    ok(/data-bq-remote-ticket="A777"/.test(h1) && /data-bq-remote-open[^>]*href="\/bq\/t\/tok\.sig"|href="\/bq\/t\/tok\.sig"[^>]*data-bq-remote-open/.test(h1), "ผลสำเร็จ/ลิงก์บัตร");
    ok(/data-bq-remote-line/.test(h1), "ลิงก์ LINE");
    const h2 = render({ ...okRes, lineLink: null });
    ok(!/data-bq-remote-line/.test(h2), "lineLink null ยังมีปุ่ม LINE");
    const h3 = render({ ok: false, code: "ALREADY", reason: "เบอร์นี้มีบัตรคิววันนี้แล้ว" });
    ok(/data-bq-remote-error/.test(h3), "ผลล้ม");
    eq(phoneLeak(h0 + h1 + h2 + h3), [], "เบอร์");
  }, "MAJOR");

  // ═══════════════ V ภาพ ═══════════════
  console.log("\n── V: ภาพ (หน้ารับบัตรมือถือ · ไม่มีภาพแบบ ⇒ HTTP + ไม่ล้น) ──");
  {
    const specs = SQC_VISUAL_SPECS["b.9"];
    const base = process.env.QC_BASE ?? "";
    const name = "ภาพ b.9 (booking-remote-ticket) 1440 + 390 · HTTP < 400 · ไม่ล้นแนวนอน · ไม่มี page error";
    if (!Array.isArray(specs) || specs.length !== 1) record("V-1", name, "FAIL", `SQC_VISUAL_SPECS b.9 ${fmt(specs)}`, "MAJOR");
    else if (!base) skip("V-1", name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + รันฉาก B.5 (แม่แบบ BARBER บน svcqc) แล้วรันซ้ำด้วย QC_BASE", "MAJOR");
    else {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "b.9", "--user", "owner", "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const o = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      record("V-1", name, r.status === 0 ? "PASS" : "FAIL", r.status === 0 ? "" : `exit=${r.status} ${o.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "MAJOR");
    }
  }

  // ═══════════════ P สแกน PII ═══════════════
  console.log("\n── P: สแกน PII (X8) ──");
  await st("P-1", "ไม่มีเบอร์ลูกค้าใน: ServiceMessageLog (dedupeKey) · OutboxEvent payload · AuditLog · ผลคืนทุกตัว · คำตอบ postback · ข้อความที่ส่ง LINE · ไม่มีชื่อลูกค้าใน log/payload/audit", async () => {
    needSetup();
    const T2 = [ids.tA, ids.tB];
    const sml = await q<{ k: string }>(`SELECT "dedupeKey" AS k FROM "ServiceMessageLog" WHERE "tenantId" = ANY($1::text[])`, [T2]);
    const ob = await q<{ p: string }>(`SELECT payload::text AS p FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[])`, [T2]);
    const au = await q<{ a: string }>(`SELECT coalesce("after"::text,'') || coalesce("before"::text,'') AS a FROM "AuditLog" WHERE "tenantId" = ANY($1::text[]) AND action LIKE 'booking.%'`, [T2]);
    const bad: string[] = [];
    const chk = (what: string, s: string, names = true) => { const l = phoneLeak(s); if (l.length) bad.push(`${what}: เบอร์ …${l[0].slice(-4)}`); if (names) { const n = NAMES.find((x) => s.includes(x)); if (n) bad.push(`${what}: ชื่อ`); } };
    chk("ServiceMessageLog", js(sml));
    chk("OutboxEvent", js(ob));
    chk("AuditLog", js(au));
    chk("ผลคืน", js(RESULTS), false);
    chk("คำตอบ postback", js(REPLIES), false);
    chk("push LINE", js(FAKE.map((f) => f.json)), false);
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
    eq(BLOCKED, [], "คำขอนอกเครื่อง");
  });
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  try { await cleanup([ids.tA, ids.tB]); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupUsers();
  await cleanupBuckets([ids.tA, ids.tB], [SLUGS[ids.tA] ?? `${SLUG}a-${RUN}`, SLUGS[ids.tB] ?? `${SLUG}b-${RUN}`]);
  await st("Z-1", "หลังล้าง: tenant `qc-svc-b9-*` 0 · นัด/บัตร/outbox/log ข้อความ/รหัสผูก/ผู้ติดต่อ/ค่าตั้ง/audit ของร้านทดสอบ 0 · ผู้ใช้ทดสอบ 0 · rate bucket ของรอบ 0", async () => {
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0].n, 0, "tenant");
    for (const t of ["Appointment", "QueueTicket", "OutboxEvent", "ServiceMessageLog", "ChatLinkCode", "ChatContact", "ChatChannelConnection", "SettingValue", "AuditLog", "Party"]) {
      if (!(await cols(t)).length) continue;
      eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [[ids.tA, ids.tB]]))[0].n, 0, t);
    }
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, [`${USER_MAIL}%`]))[0].n, 0, "user");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE $1 OR key LIKE $2 OR key LIKE $3`, [`bq:remote:${SLUG}%`, `chat-link:${ids.tA}:%`, `bq:ticket:${ids.tA}:%`]))[0].n, 0, "rate bucket");
  }, "MAJOR");
  await pool.end();
  globalThis.fetch = REAL_FETCH;
  if (LINE_API_BASE_SAVED === undefined) delete process.env.LINE_API_BASE; else process.env.LINE_API_BASE = LINE_API_BASE_SAVED;
  server.close();
}

// ═══════════════ S. ไฟล์ · สัญญาโค้ด ═══════════════
console.log("\n── S: ไฟล์ · สัญญาโค้ด ──");
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
const NEW_FILES = [F.notify, F.link, F.remote, F.remoteAction, F.remotePage, F.remoteComp];
// ORACLE-EDIT (ผู้คุม 30 ต.ค.): มติ Q2 คีย์ booking.notify.hideServiceName + แม่แบบ checkedIn มี {เลขคิว} ⇒ defs/booking.ts แตะได้ (เพิ่มเท่านั้น)
const OWN = new Set<string>([...NEW_FILES, F.postback, F.minute, F.consumers, F.queueLine, F.index, "src/lib/core/settings/defs/booking.ts"]);
{
  const ch = dirty(["src", "prisma"]);
  const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.notify}`]); return true; } catch { return false; } })();
  if (ch.length === 0 && headHas) skip("S-1", "แตะเฉพาะไฟล์ของใบ", "B.9 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ");
  else await st("S-1", "แตะเฉพาะไฟล์ของใบ (§1) · มีไฟล์ใหม่ครบ 6 ไฟล์", () => {
    const outside = ch.filter((f) => !OWN.has(f));
    ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 6).join(", ")}`);
    const miss = NEW_FILES.filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
}
// ORACLE-EDIT (ผู้คุม 30 ต.ค. · D.9): หลัง B.9 merge แล้ว S-2 ตรวจ dirty ทั้ง core/chat จะแดงทุกครั้งที่เลนอื่นทำงาน ⇒ ข้ามแบบเดียวกับ S-1
const headHasB9 = (() => { try { git(["cat-file", "-e", `HEAD:${F.notify}`]); return true; } catch { return false; } })();
if (headHasB9) skip("S-2", "ไม่มี migration/แก้ schema · ไม่แตะ core/แชท", "B.9 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ");
else await st("S-2", "ไม่มี migration/แก้ schema · ไม่มี event ใหม่ (ทะเบียนป้าย automation/webhooks ไม่ถูกแตะ) · ไม่แตะ core / notify-customer / โมดูลแชท / defs", () => {
  eq(dirty(["prisma", "src/lib/automation/labels.ts", "src/lib/webhooks/labels.ts", "src/lib/core", F.notifyCustomer, "src/lib/modules/chat"]).filter((f) => f !== "src/lib/core/settings/defs/booking.ts"), [], "ไฟล์"); // ORACLE-EDIT (ผู้คุม 30 ต.ค.) มติ Q2
});
await st("S-3", "ตัวเชื่อมสลับได้: ไฟล์ของใบไม่เรียกตัวส่ง LINE ตรง (push*/sendLineToParty/replyFlex/api.line.me) · booking-notify.ts ส่งผ่าน notifyCustomer", () => {
  const miss = NEW_FILES.filter((f) => !existsSync(join(ROOT, f)));
  ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  const bad: string[] = [];
  for (const f of NEW_FILES) { const c = stripComments(src(f)); const m = /\b(pushLineMessagesToContact|pushFlexToParty|sendLineToParty|pushToContact|replyFlex)\b|api\.line\.me/.exec(c); if (m) bad.push(`${f}: ${m[0]}`); }
  ok(bad.length === 0, bad.join(" · "));
  ok(/\bnotifyCustomer\s*\(/.test(stripComments(src(F.notify))), "booking-notify.ts ไม่เรียก notifyCustomer");
}, "MAJOR");
await st("S-4", "นโยบายจากทะเบียนค่าตั้ง: notify อ่าน booking.msg.enabled · reminderOffsetsMin · nearTurnAhead · delayAlertMin · rebookAfterDays (ไม่มีเลข 1440/120 ฝัง) · remote อ่าน booking.queue.remoteTicket + checkRateLimitDb", () => {
  const n = stripComments(src(F.notify));
  ok(!!n, `ยังไม่มี ${F.notify}`);
  const miss = ["booking.msg.enabled", "booking.notify.reminderOffsetsMin", "booking.notify.nearTurnAhead", "booking.notify.delayAlertMin", "booking.service.rebookAfterDays"].filter((k) => !n.includes(k));
  ok(miss.length === 0, `notify ไม่อ่าน: ${miss.join(", ")}`);
  ok(!/\b(1440|120)\b/.test(n), "มีเลข 1440/120 ฝังใน booking-notify.ts");
  const r = stripComments(src(F.remote));
  ok(r.includes("booking.queue.remoteTicket") && /checkRateLimitDb/.test(r), "remote ไม่อ่าน remoteTicket/checkRateLimitDb");
}, "MAJOR");
await st("S-5", "ไม่มีเวลาเครื่องดิบ (.getDay/.getHours/.getMinutes/.getDate/.getMonth/.getFullYear) ในไฟล์ใหม่", () => {
  const bad: string[] = [];
  const miss = NEW_FILES.filter((f) => !existsSync(join(ROOT, f)));
  ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  for (const f of NEW_FILES) src(f).split("\n").forEach((l, i) => { if (/\.(getDay|getHours|getMinutes|getDate|getMonth|getFullYear)\s*\(\s*\)/.test(l.replace(/\/\/.*$/, ""))) bad.push(`${f}:${i + 1}`); });
  ok(bad.length === 0, bad.slice(0, 4).join(" · "));
}, "MAJOR");
await st("S-6", "action/หน้า: booking-remote action \"use server\" · export async function เท่านั้น · clientKey จาก x-forwarded-for · เรียก takeRemoteTicket · หน้า remote: loadRemoteTicketForm + notFound + robots index:false + force-dynamic", () => {
  const a = src(F.remoteAction);
  ok(!!a, `ยังไม่มี ${F.remoteAction}`);
  ok(/^\s*["']use server["']/.test(a), "ไม่มี use server บรรทัดแรก");
  const code = stripComments(a);
  ok(!/export\s+(const|let|type|interface|default|class|function\s)/.test(code.replace(/export\s+async\s+function/g, "")), "export อื่นที่ไม่ใช่ async function");
  ok(/x-forwarded-for/.test(code) && /takeRemoteTicket\s*\(/.test(code), "ไม่อ่าน IP / ไม่เรียก takeRemoteTicket");
  const p = stripComments(src(F.remotePage));
  ok(!!p && /loadRemoteTicketForm/.test(p) && /notFound\s*\(/.test(p) && /index:\s*false/.test(p) && /force-dynamic/.test(p), "page.tsx");
}, "MAJOR");
await st("S-7", "postback-routes.ts: เพิ่มบรรทัดเท่านั้น (ไม่มีบรรทัดถูกลบเทียบ HEAD) · route booking. โหลด booking-line-link แบบ import() ตอนเรียก", () => {
  const diff = git(["diff", "HEAD", "--", F.postback]);
  const removed = diff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"));
  eq(removed, [], "บรรทัดที่ลบ");
  const s = stripComments(src(F.postback));
  ok(/prefix:\s*["']booking\.["']/.test(s) && /import\(\s*["']@\/lib\/platform\/booking-line-link["']\s*\)/.test(s), "ไม่มี route booking. แบบ lazy import");
}, "MAJOR");

// ═══════════════ G. regression (หลังล้างข้อมูล) ═══════════════
console.log("\n── G: regression ──");
const judgeNoFail = (out: string) => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return false;
  try { return (JSON.parse(line.slice(13)) as { failed: string[] }).failed.length === 0; } catch { return false; }
};
const REG: { s: string; args?: string[]; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-svc-b.5", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-b.4", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-b.11", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-r0.7", judge: (out, code) => code === 0 || judgeNoFail(out), note: "postback-routes · notifyCustomer" },
  { s: "qc-svc-smoke" },
];
{
  const hasWork = typeof (notifyLoad.mod as NotifyApi | null)?.notifyBooking === "function" && typeof (linkLoad.mod as LinkApi | null)?.onBookingPostback === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (booking-notify.notifyBooking / booking-line-link.onBookingPostback) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_B9_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.args?.length ? ` ${g.args.join(" ")}` : ""}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 40 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-b9-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(all, r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC B.9 · แจ้งเตือน + ผูก LINE + postback + รับบัตรมือถือ =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: G-* เมื่อ --no-regression · V-1 ไม่มี QC_BASE · S-1/S-2 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
