// QC — SVC B.7 · จองออนไลน์ใหม่ + ลิงก์จัดการนัด (ภาพ จอง 03) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-b.7.md (§3 สัญญา · §4 DOM · §6 จุดที่เลือกเอง) · ledger/SVC-MASTER-PLAN.md แถว B.7
//        ledger/DESIGN-BOOKING-QUEUE.md R3 · §7 · ภาคผนวก ก #19–36 · ภาพ ledger/design-booking/03-online-booking.png
//
// กลุ่มข้อ:
//   T   ข้อมูล + แม่แบบ BARBER (ร้าน A หลายสาขา · ร้าน B) · PC ตัวควบคุม (เขียวก่อนมีงาน: B.3 จอง/หาช่อง · ลิงก์เซ็น · rate limit · สายยิงพร้อมกัน · ตัวตรวจ PII)
//   W   หน้าจอง (loadOnlineBooking: บริการ · ช่าง · วัน · เวลา = findSlots · สรุป · กติกาจากค่าตั้ง · ตัวตน LINE · ภาษา · X1 · X7)
//   B   จอง (bookOnline: ลิงก์จัดการนัด · event · ตัวตน · รหัสล้มของ B.3 · idempotency · ข้อมูลเพิ่ม · ไม่มี PII)
//   X   ยิงพร้อมกันข้ามโพรเซส (ช่องเดียว · key เดียว · ใครก็ได้ · เลื่อน∥จอง · เลื่อนเกินเพดาน · ยกเลิก∥เลื่อน · จอง∥walk-in∥ย้ายช่าง)
//   M   ลิงก์จัดการนัด (มุมมอง · snapshot · เวลาฟรี · token เสียทุกแบบ = คำตอบเดียว · อายุ 7 วัน · manageLinkFor · ไม่มี PII)
//   R   เลื่อน · C ยกเลิก · I .ics · RL rate limit · K ตู้ (หนี้ B.6) · U DOM · H server จริง · S ไฟล์/สัญญาโค้ด · Q ฉาก svcqc · V ภาพ · G regression · Z ล้าง
//
// เวลา: วันทดสอบ = วันอนาคต (วันนี้ไทย + 2 ขึ้นไป · ข้ามวันจันทร์ที่ร้านปิด) · จองใช้นาฬิกาจริง (bookAppointment ของ B.3) · หน้าจัดการนัดฉีด now
// ร้านทดสอบ slug `qc-svc-b7-*` · id ขึ้นต้น `svcb7_` · IP ทดสอบ `svcb7-*` · ลบใน finally (+ กวาดค้างตอนเริ่ม)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.7.mts [--no-regression]
//      (ห้าม timeout ครอบ · `--no-regression` = ข้าม G เป็น SKIP ซึ่งไม่นับผ่าน · QC_BASE=http://127.0.0.1:<port> เปิดหมวด H/V)
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import {
  SQC, SQC_ONLINE_SCENE as OSC, SQC_VISUAL_SPECS, sqcOnlineSceneDay, sqcIdentityToken, sqcManageToken,
} from "./svc-qc-data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const LABEL = "qc-svc-b.7";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_B7_NO_REGRESSION === "1";
const F = {
  online: "src/lib/modules/booking/online.ts",
  tok: "src/lib/modules/booking/manage-token.ts",
  service: "src/lib/modules/booking/service.ts",
  index: "src/lib/modules/booking/index.ts",
  pub: "src/lib/modules/booking/public-line.ts",
  kiosk: "src/components/booking/public/Kiosk.tsx",
  routeBook: "src/app/api/store/[tenantSlug]/[unitSlug]/book/route.ts",
  routeSlots: "src/app/api/store/[tenantSlug]/[unitSlug]/slots/route.ts",
  pageStore: "src/app/(store)/s/[tenantSlug]/[unitSlug]/page.tsx",
  compBooking: "src/components/public-booking.tsx",
  compManage: "src/components/booking/online/ManageCard.tsx",
  pageManage: "src/app/(store)/bq/m/[token]/page.tsx",
  routeIcs: "src/app/(store)/bq/m/[token]/ics/route.ts",
  actManage: "src/app/(store)/bq/m/actions.ts",
  dict: "src/lib/i18n/dict.ts",
  scene: "scripts/svc-qc-online-scene.mts",
} as const;
const FROZEN = [
  "src/lib/modules/booking/planner.ts", "src/lib/modules/booking/planner-run.ts", "src/lib/modules/booking/queue-line.ts",
  "src/lib/modules/booking/today-line.ts", "src/lib/modules/booking/line-ops.ts", "src/lib/modules/booking/devices.ts",
  "src/lib/modules/booking/settings-model.ts", "src/lib/core", "src/lib/outbox-consumers.ts", "src/lib/automation/labels.ts",
  "src/lib/webhooks/labels.ts", "src/lib/platform", "src/lib/actions",
];

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc (ep-mute-scene) ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }

// ═══════════════ สำเนาสัญญา (ใบสั่ง §3) ═══════════════
type Ctx = { tenantId: string; unitId: string; actorUserId?: string };
type Ref = { tenantSlug: string; unitSlug: string };
type OnlineLocale = "th" | "en";
type OnlineService = { id: string; name: string; durationMin: number; priceSatang: number; depositSatang: number };
type OnlineStaff = { id: string; name: string };
type OnlineDay = { dateStr: string; closed: boolean };
type OnlineTime = { startMin: number; hhmm: string; free: boolean };
type OnlinePolicy = {
  graceMin: number | null; afterGrace: string | null; freeChangeBeforeMin: number; selfRescheduleMax: number; requireConfirm: boolean;
  depositMethod: string; payWithinMin: number | null; forfeitPct: number | null;
};
type OnlineQuery = { svc?: string; staff?: string; date?: string; time?: string; who?: string; lang?: string };
type OnlineBookingView = {
  tenantName: string; unitName: string; locale: OnlineLocale; locales: OnlineLocale[];
  identity: { name: string; phoneMasked: string } | null;
  step: 1 | 2 | 3;
  services: OnlineService[]; service: OnlineService | null;
  anyStaff: boolean; staff: OnlineStaff[]; staffSel: string | null;
  days: OnlineDay[]; dateSel: string | null;
  times: OnlineTime[]; timeSel: { startMin: number; hhmm: string } | null;
  summary: { startMs: number; endMs: number; staffName: string | null; priceSatang: number; depositSatang: number; payAtShopSatang: number; freeUntilMs: number } | null;
  policy: OnlinePolicy | null;
  extraField: { key: string; label: string } | null;
};
type ViewRes = { ok: true; view: OnlineBookingView } | { ok: false; code: string };
type OnlineBookInput = { serviceId: string; staffId: string | null; dateStr: string; startMin: number; name?: string; phone?: string; note?: string; idempotencyKey?: string; who?: string };
type BookRes = { ok: true; manageUrl: string | null; status: "PENDING" | "CONFIRMED"; startMs: number; holdUntilMs: number | null; depositSatang: number } | { ok: false; code: string; reason: string };
type ManageView = {
  tenantName: string; unitName: string; locale: OnlineLocale; serviceName: string; staffName: string | null; anyStaff: boolean;
  startMs: number; endMs: number; status: string; cancelReason: string | null;
  priceSatang: number; depositSatang: number; depositPaid: boolean; holdUntilMs: number | null;
  policy: OnlinePolicy; freeUntilMs: number; rescheduleCount: number; rescheduleLeft: number;
  canCancel: boolean; canReschedule: boolean; cancelBlock: string | null; rescheduleBlock: string | null; icsPath: string;
  reschedule: { staff: OnlineStaff[]; staffSel: string | null; days: OnlineDay[]; dateSel: string | null; times: OnlineTime[] } | null;
};
type MViewRes = { ok: true; view: ManageView } | { ok: false; code: string };
type OpRes = { ok: true; startMs?: number } | { ok: false; code: string; reason: string };
type NowIp = { now?: Date; ip?: string };
type OnlineApi = {
  loadOnlineBooking?: (ref: Ref, q: OnlineQuery, opts?: { ip?: string; now?: Date }) => Promise<ViewRes>;
  bookOnline?: (ref: Ref, i: OnlineBookInput, opts?: { ip?: string }) => Promise<BookRes>;
  bookingIdentityToken?: (ctx: { tenantId: string }, partyId: string, ttlMin?: number) => string;
  manageLinkFor?: (ctx: Ctx, appointmentId: string) => Promise<string | null>;
  loadManageView?: (token: unknown, opts?: NowIp & { lang?: string; reschedule?: { date?: string; staff?: string } }) => Promise<MViewRes>;
  rescheduleOnline?: (token: unknown, to: { dateStr: string; startMin: number; staffId: string | null }, opts?: NowIp) => Promise<OpRes>;
  cancelOnline?: (token: unknown, opts?: NowIp) => Promise<OpRes>;
  loadManageIcs?: (token: unknown, opts?: NowIp) => Promise<string | null>;
  ONLINE_RATE?: unknown;
};
type TokApi = { manageToken?: (id: string) => string | null; manageTokenHash?: (t: string) => string; MANAGE_TOKEN_LABEL?: string };
// ของเดิม (มีแล้ว)
type Slot = { startMin: number; hhmm: string; staffId: string };
type BookingApi = {
  findSlots: (ctx: Ctx, q: { serviceId: string; staffId: string | null; dateStr: string; channel: "ONLINE" | "STAFF" }, opts?: { now?: Date; excludeAppointmentId?: string }) => Promise<Slot[]>;
  bookAppointment: (ctx: Ctx, i: { serviceId: string; staffId: string | null; dateStr: string; startMin: number; channel: "STAFF" | "ONLINE"; customerName: string; customerPhone: string; idempotencyKey?: string }) => Promise<{ ok: true; id: string; staffId: string; status: string } | { ok: false; code: string; reason: string }>;
  setAppointmentStatus: (tenantId: string, unitId: string, id: string, status: "CONFIRMED" | "CANCELLED") => Promise<{ ok: boolean; reason?: string }>;
  expireDepositHolds: (now: Date) => Promise<{ expired: number }>;
};
type LineApi = {
  createWalkIn: (ctx: Ctx, i: { serviceId: string; staffId: string | null; channel: "STAFF" }, opts?: { now?: Date }) => Promise<{ ok: true; appointmentId: string; staffId: string } | { ok: false; code: string; reason: string }>;
};
type OpsApi = { moveJobStaff: (ctx: Ctx, id: string, toStaffId: string, opts?: { now?: Date }) => Promise<{ ok: true } | { ok: false; code: string; reason: string }> };
type PubApi = { loadKioskView?: (token: unknown, opts?: { now?: Date }) => Promise<(Record<string, unknown> & { bookUrl?: unknown }) | null> };
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
type SetRes = { ok: boolean; code?: string; issues?: unknown };
type SettingsApi = {
  applyTemplate: (actor: Actor, ctx: { tenantId: string }, i: { unitId: string; domain: string; templateKey: string; overwrite: "KEEP_CUSTOM" | "RESET_ALL" }) => Promise<SetRes>;
  setSettings: (actor: Actor, ctx: { tenantId: string }, changes: { key: string; scope: string; scopeId: string; value: unknown }[]) => Promise<SetRes>;
  resetSetting: (actor: Actor, ctx: { tenantId: string }, t: { key: string; scope: string; scopeId: string }) => Promise<SetRes>;
};
type LinkApi = {
  signLink: (i: { tenantId: string; purpose: string; subjectId: string; expMin: number }) => string;
  verifyLink: (t: unknown, purpose: string) => { tenantId: string; subjectId: string } | null;
};
type RateApi = { checkRateLimitDb: (key: string, o: { limit: number; windowMs: number }, now?: number) => Promise<{ ok: boolean }> };

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
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const MIN = 60_000;
const addDays = (ds: string, n: number): string => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const weekdayOf = (ds: string): number => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const bkkToday = (): string => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const bkkMs = (ds: string, min: number): number => { const [y, m, d] = ds.split("-").map(Number); return Date.UTC(y, m - 1, d) + (min - 420) * MIN; };
const hm = (s: string): number => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const at = (ds: string, s: string | number): Date => new Date(bkkMs(ds, typeof s === "number" ? s : hm(s)));
const hhmmOfMs = (ms: number | null | undefined) => (ms == null ? "null" : new Date(ms + 7 * 3_600_000).toISOString().slice(11, 16));
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const src = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const rand43 = () => randomBytes(32).toString("base64url");
const SECRET = process.env.SESSION_SECRET ?? "";
const mg = (id: string) => sqcManageToken(SECRET, id);
const tokOfUrl = (u: string | null | undefined): string => { ok(typeof u === "string" && u.startsWith("/bq/m/"), `manageUrl ${fmt(u)}`); return (u as string).slice("/bq/m/".length); };
const THAI = /[฀-๿]/;

// ═══════════════ โหลดโมดูล (path ไม่ใช่ literal — next build ตรวจ scripts/*.mts) ═══════════════
const loadIf = async <T,>(rel: string) => (existsSync(join(ROOT, rel)) ? tryImport<T>(pathToFileURL(join(ROOT, rel)).href) : { mod: null as T | null, err: `ยังไม่มีไฟล์ «${rel}»` });
const onlineLoad = await loadIf<OnlineApi>(F.online);
const tokLoad = await loadIf<TokApi>(F.tok);
const pubLoad = await loadIf<PubApi>(F.pub);
const bookingLoad = await tryImport<BookingApi>("@/lib/modules/booking/service");
const lineLoad = await tryImport<LineApi>("@/lib/modules/booking/queue-line");
const opsLoad = await tryImport<OpsApi>("@/lib/modules/booking/line-ops");
const settingsLoad = await tryImport<SettingsApi>("@/lib/core/settings");
const linkLoad = await tryImport<LinkApi>("@/lib/core/signed-link");
const rateLoad = await tryImport<RateApi>("@/lib/core/rate-limit-db");
const fnOf = <Fn,>(load: { mod: unknown; err: string }, name: string, rel: string): Fn => {
  const f = (load.mod as Record<string, unknown> | null)?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return f as Fn;
};
const ON = {
  view: () => fnOf<NonNullable<OnlineApi["loadOnlineBooking"]>>(onlineLoad, "loadOnlineBooking", F.online),
  book: () => fnOf<NonNullable<OnlineApi["bookOnline"]>>(onlineLoad, "bookOnline", F.online),
  ident: () => fnOf<NonNullable<OnlineApi["bookingIdentityToken"]>>(onlineLoad, "bookingIdentityToken", F.online),
  linkFor: () => fnOf<NonNullable<OnlineApi["manageLinkFor"]>>(onlineLoad, "manageLinkFor", F.online),
  mview: () => fnOf<NonNullable<OnlineApi["loadManageView"]>>(onlineLoad, "loadManageView", F.online),
  resched: () => fnOf<NonNullable<OnlineApi["rescheduleOnline"]>>(onlineLoad, "rescheduleOnline", F.online),
  cancel: () => fnOf<NonNullable<OnlineApi["cancelOnline"]>>(onlineLoad, "cancelOnline", F.online),
  ics: () => fnOf<NonNullable<OnlineApi["loadManageIcs"]>>(onlineLoad, "loadManageIcs", F.online),
};
const must = <T,>(l: { mod: T | null; err: string }, what: string): T => { if (!l.mod) throw new AssertFail(`โหลด ${what} ไม่ได้ (${l.err})`); return l.mod; };
const BK = () => must(bookingLoad, "booking/service");
const LN = () => must(lineLoad, "queue-line");
const OPS = () => must(opsLoad, "line-ops");
const SETTINGS = () => must(settingsLoad, "core/settings");
const LINK = () => must(linkLoad, "core/signed-link");
const RATE = () => must(rateLoad, "core/rate-limit-db");

// ═══════════════ โหมดลูกโพรเซส (ยิงพร้อมกันข้ามโพรเซส · แบบ qc-svc-b.3) ═══════════════
type CallSpec =
  | { fn: "b3"; ctx: Ctx; input: { serviceId: string; staffId: string | null; dateStr: string; startMin: number; customerName: string; customerPhone: string } }
  | { fn: "book"; ref: Ref; input: OnlineBookInput; ip: string }
  | { fn: "resched"; token: string; to: { dateStr: string; startMin: number; staffId: string | null }; ip: string }
  | { fn: "cancel"; token: string; ip: string }
  | { fn: "walkin"; ctx: Ctx; serviceId: string; now: string }
  | { fn: "move"; ctx: Ctx; id: string; to: string; now: string };
type CallOut = { fn: CallSpec["fn"]; ok: boolean; code: string | null; reason: string | null; url: string | null; staffId: string | null; threw: string | null };
type ChildSpec = { run: string; idx: number; scenarios: { key: string; calls: CallSpec[] }[] };
type Scenario = { key: string; calls: CallSpec[] };
const goFile = (run: string, key: string) => `/tmp/svc-b7-go-${run}-${key}`;
async function runCall(c: CallSpec): Promise<CallOut> {
  const base = { fn: c.fn, ok: false, code: null, reason: null, url: null, staffId: null, threw: null } as CallOut;
  try {
    if (c.fn === "b3") {
      const r = await BK().bookAppointment(c.ctx, { ...c.input, channel: "STAFF" });
      return r.ok ? { ...base, ok: true, staffId: r.staffId } : { ...base, code: r.code, reason: r.reason };
    }
    if (c.fn === "book") {
      const r = await ON.book()(c.ref, c.input, { ip: c.ip });
      return r.ok ? { ...base, ok: true, url: r.manageUrl } : { ...base, code: r.code, reason: r.reason };
    }
    if (c.fn === "resched") {
      const r = await ON.resched()(c.token, c.to, { ip: c.ip });
      return r.ok ? { ...base, ok: true } : { ...base, code: r.code, reason: r.reason };
    }
    if (c.fn === "cancel") {
      const r = await ON.cancel()(c.token, { ip: c.ip });
      return r.ok ? { ...base, ok: true } : { ...base, code: r.code, reason: r.reason };
    }
    if (c.fn === "walkin") {
      const r = await LN().createWalkIn(c.ctx, { serviceId: c.serviceId, staffId: null, channel: "STAFF" }, { now: new Date(c.now) });
      return r.ok ? { ...base, ok: true, staffId: r.staffId } : { ...base, code: r.code, reason: r.reason };
    }
    const r = await OPS().moveJobStaff(c.ctx, c.id, c.to, { now: new Date(c.now) });
    return r.ok ? { ...base, ok: true } : { ...base, code: r.code, reason: r.reason };
  } catch (e) {
    return { ...base, threw: errMsg(e).slice(0, 160) };
  }
}
if (process.env.QC_B7_CHILD) {
  const spec = JSON.parse(process.env.QC_B7_CHILD) as ChildSpec;
  try {
    const dbm = (await import("@/lib/core/db" as string)) as unknown as { prisma: { $queryRawUnsafe: (q: string) => Promise<unknown>; $disconnect: () => Promise<void> } };
    await dbm.prisma.$queryRawUnsafe("SELECT 1"); // อุ่น pool ก่อนบอกพร้อม
    for (const sc of spec.scenarios) {
      console.log(`READY ${sc.key}`);
      const t0 = Date.now();
      while (!existsSync(goFile(spec.run, sc.key))) { if (Date.now() - t0 > 300_000) { console.log("ABORT"); process.exit(5); } await sleep(10); }
      const outs = await Promise.all(sc.calls.map(runCall));
      console.log(`RES ${sc.key} ${JSON.stringify(outs)}`);
    }
    await dbm.prisma.$disconnect();
    process.exit(0);
  } catch (e) {
    console.log(`CHILD_ERR ${errMsg(e)}`);
    process.exit(3);
  }
}
// โหมดไม่มี SESSION_SECRET (B-11): จองได้ แต่ลิงก์จัดการนัด = null
if (process.env.QC_B7_NOSECRET) {
  try {
    const p = JSON.parse(process.env.QC_B7_NOSECRET) as { ref: Ref; input: OnlineBookInput; ip: string; probe: string };
    const r = await ON.book()(p.ref, p.input, { ip: p.ip });
    const tok = fnOf<NonNullable<TokApi["manageToken"]>>(tokLoad, "manageToken", F.tok)("svcb7_probe");
    const v = await ON.mview()(p.probe, { ip: p.ip });
    console.log(`NOSECRET_JSON=${JSON.stringify({ book: r, tok, view: v })}`);
    process.exit(0);
  } catch (e) {
    console.log(`NOSECRET_ERR ${errMsg(e)}`);
    process.exit(3);
  }
}
const NCHILD = 5;
const goFiles: string[] = [];

// ═══════════════ คอมโพเนนต์ (renderToStaticMarkup) ═══════════════
type Comp = (props: Record<string, unknown>) => unknown;
const compOf = async (rel: string): Promise<{ c: Comp | null; why: string }> => {
  if (!existsSync(join(ROOT, rel))) return { c: null, why: `ยังไม่มี ${rel}` };
  const r = await tryImport<Record<string, unknown>>(pathToFileURL(join(ROOT, rel)).href);
  if (!r.mod) return { c: null, why: `import ${rel} ล้ม: ${r.err}` };
  return typeof r.mod.default === "function" ? { c: r.mod.default as Comp, why: "" } : { c: null, why: `${rel} ไม่มี default export ที่เป็นคอมโพเนนต์` };
};
const BookingC = await compOf(F.compBooking);
const ManageC = await compOf(F.compManage);
const KioskC = await compOf(F.kiosk);
type ReactLike = { createElement: (c: Comp | string, p: Record<string, unknown> | null, ...ch: unknown[]) => unknown };
type RdsLike = { renderToStaticMarkup: (el: unknown) => string };
const React = (await import("react" as string)) as unknown as ReactLike;
const RDS = (await import("react-dom/server" as string)) as unknown as RdsLike;
const noop1 = async (_fd: FormData) => { void _fd; };
const noop2 = async (_p: unknown, _fd: FormData) => { void _p; void _fd; return null; };
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
/** กล่องทุกตัวที่มี attr ชื่อนี้ (แท็กสมดุล) → { tag, attrs, html } ตามลำดับในเอกสาร */
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

// ═══════════════ PII (X8) ═══════════════
const PHONES: string[] = [];
const NAMES: string[] = [];
let phoneSeq = 0;
const RUNN = (Date.now() % 1_000_000).toString().padStart(6, "0");
const newPhone = (): string => { const p = `09${RUNN.slice(0, 4)}${String(++phoneSeq).padStart(4, "0")}`; PHONES.push(p); return p; };
let nameSeq = 0;
const newName = (): string => { const n = `คุณทดสอบบีเจ็ด${++nameSeq}ซ`; NAMES.push(n); return n; };
const dashed = (p: string) => `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
const piiLeak = (s: string): string[] => [
  ...PHONES.filter((p) => s.includes(p) || s.includes(dashed(p)) || s.includes(`+66${p.slice(1)}`) || s.includes(`66${p.slice(1)}`)),
  ...NAMES.filter((n) => s.includes(n)),
];

// ═══════════════ ฐานข้อมูล ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]));
  return colCache.get(table) ?? [];
};
const rid = (p: string) => `svcb7_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
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
const SLUG = "qc-svc-b7-";
const TOKENS_USED = new Set<string>(); // ถัง rate ต่อ token (คีย์มีแต่ hash) — ลบตอนจบ
const tkBucket = (t: string) => `bq:manage:tk:${sha256hex(t).slice(0, 32)}`;
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
    await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE '%svcb7%' OR key LIKE '%qc-svc-b7-%'`);
    const keys = [...TOKENS_USED].map(tkBucket);
    if (keys.length) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key = ANY($1::text[])`, [keys]);
  } catch (e) { console.log(`  ⚠️ ลบถัง rate: ${errMsg(e)}`); }
}

// ═══════════════ ข้อมูลทดสอบ ═══════════════
const RUN = Date.now().toString(36);
const TODAY = bkkToday();
/** วันเปิดร้านถัดไป (วันนี้ + 2 ขึ้นไป · ข้ามวันจันทร์ที่ร้านปิด · ไม่เกิน horizon 30 วันของ BARBER) — แต่ละฉากใช้วันของตัวเอง */
const OPEN: string[] = [];
for (let n = 2; n <= 29 && OPEN.length < 24; n++) { const d = addDays(TODAY, n); if (weekdayOf(d) !== 1) OPEN.push(d); }
let openIdx = 0;
const nextOpen = (): string => { const d = OPEN[openIdx++]; if (!d) throw new Error("วันทดสอบหมด"); return d; };
const D = {
  w: nextOpen(), b: nextOpen(), m: nextOpen(), r: nextOpen(), r2: nextOpen(), r3: nextOpen(), r4: nextOpen(), c: nextOpen(),
  x0: nextOpen(), x1: nextOpen(), x2: nextOpen(), x3: nextOpen(), x4: nextOpen(), x5: nextOpen(), x6: nextOpen(), x7: nextOpen(),
  rl: nextOpen(), u: nextOpen(),
};
const MONDAY = (() => { for (let n = 2; n < 10; n++) { const d = addDays(TODAY, n); if (weekdayOf(d) === 1) return d; } return addDays(TODAY, 2); })();
const T = (k: string) => `svcb7_${k}_${RUN}`;
const ids = {
  tA: T("tA"), tB: T("tB"),
  uO: T("uO"), uO2: T("uO2"), uE: T("uE"), uL: T("uL"), uS: T("uS"), uB: T("uB"), uQ: T("uQ"),
  CUT: T("CUT"), WASH: T("WASH"), PERM: T("PERM"), NOB: T("NOB"), O2CUT: T("O2CUT"), ECUT: T("ECUT"), EPERM: T("EPERM"), LCUT: T("LCUT"), SCUT: T("SCUT"), BCUT: T("BCUT"),
  ek: T("ek"), boy: T("boy"), nun: T("nun"), jack: T("jack"), a: T("a"), h: T("h"), z: T("z"), qq: T("qq"), e1: T("e1"), e2: T("e2"), l1: T("l1"), s1: T("s1"), s2: T("s2"), b1: T("b1"),
  P1: T("P1"), P2: T("P2"), PB: T("PB"), KQ: T("KQ"), owner: T("owner"), ownerB: T("ownerB"),
};
const STAFF_NAME: Record<string, string> = { [ids.ek]: "ช่างเอก", [ids.boy]: "ช่างบอย", [ids.nun]: "ช่างนุ่น", [ids.jack]: "ช่างแจ๊ค" };
const KQ_TOKEN = rand43();
const PARTY1 = { name: "คุณแพรว", phone: "0812344417" };
PHONES.push(PARTY1.phone, "0812349999", "0812345555"); // เบอร์ Party ห้ามโผล่เต็มบนหน้าใด ๆ
const cO: Ctx = { tenantId: ids.tA, unitId: ids.uO };
const cO2: Ctx = { tenantId: ids.tA, unitId: ids.uO2 };
const cS: Ctx = { tenantId: ids.tA, unitId: ids.uS };
const cL: Ctx = { tenantId: ids.tA, unitId: ids.uL };
const cB: Ctx = { tenantId: ids.tB, unitId: ids.uB };
const OWNER: Actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.owner };
const OWNER_B: Actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.ownerB };
const SLUGS: Record<string, string> = {};
const ref = (u: string, t: string = ids.tA): Ref => ({ tenantSlug: SLUGS[t], unitSlug: SLUGS[u] });
let ipSeq = 0;
const newIp = () => `svcb7-${RUN}-${++ipSeq}`;
/** input จองออนไลน์ (ชื่อ/เบอร์ใหม่ทุกครั้ง · key ใหม่) */
const bi = (o: { serviceId: string; staffId: string | null; dateStr: string; startMin: number } & Partial<OnlineBookInput>): OnlineBookInput =>
  ({ name: newName(), phone: newPhone(), idempotencyKey: rid("k"), ...o });
type ApptRow = { id: string; unitId: string; staffId: string; serviceId: string; startAt: Date; endAt: Date; status: string; channel: string | null; source: string; kind: string; assignMode: string;
  customerName: string; customerPhone: string; note: string | null; manageTokenHash: string | null; rescheduleCount: number; cancelReason: string | null; depositSatang: number; depositPaidAt: Date | null; partyId: string | null; createdAt: Date; idempotencyKey: string | null };
const apRow = async (id: string): Promise<ApptRow> => {
  const r = (await q<ApptRow>(`SELECT id, "unitId", "staffId", "serviceId", "startAt", "endAt", status::text AS status, channel, source, kind, "assignMode", "customerName", "customerPhone", note, "manageTokenHash", "rescheduleCount", "cancelReason", "depositSatang", "depositPaidAt", "partyId", "createdAt", "idempotencyKey" FROM "Appointment" WHERE id = $1`, [id]))[0];
  ok(!!r, `ไม่พบนัด ${id}`);
  return r;
};
const rowByKey = async (key: string): Promise<ApptRow> => {
  const r = (await q<{ id: string }>(`SELECT id FROM "Appointment" WHERE "tenantId" = ANY($1::text[]) AND "idempotencyKey" = $2`, [[ids.tA, ids.tB], key]))[0];
  ok(!!r, `ไม่พบนัดของ key ${key}`);
  return apRow(r.id);
};
type Ev = { type: string; idempotencyKey: string; payload: Record<string, unknown> };
const evOf = async (type: string, apptId: string): Promise<Ev[]> =>
  q<Ev>(`SELECT type, "idempotencyKey", payload FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND type = $2 AND payload->>'appointmentId' = $3 ORDER BY "createdAt", id`, [[ids.tA, ids.tB], type, apptId]);
const overlapIn = async (staffId: string, ds: string): Promise<string[]> => {
  const rows = await q<{ id: string; s: Date; e: Date }>(`SELECT id, "startAt" AS s, "endAt" AS e FROM "Appointment" WHERE "staffId" = $1 AND "startAt" < $3 AND "endAt" > $2 AND status NOT IN ('CANCELLED','NO_SHOW','DONE') ORDER BY "startAt", id`, [staffId, new Date(bkkMs(ds, 0)), new Date(bkkMs(ds, 1440))]);
  const bad: string[] = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) if (rows[j].s.getTime() < rows[i].e.getTime() && rows[i].s.getTime() < rows[j].e.getTime()) bad.push(`${hhmmOfMs(rows[i].s.getTime())}×${hhmmOfMs(rows[j].s.getTime())}`);
  return bad;
};
const holdingAt = async (staffId: string, ds: string, min: number): Promise<number> =>
  (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "staffId" = $1 AND "startAt" = $2 AND status NOT IN ('CANCELLED','NO_SHOW')`, [staffId, at(ds, min)]))[0].n;
/** ตัวห่อ: จำ token ที่ใช้ (ลบถัง rate ต่อ token ตอนจบ) */
const MV = (t: unknown, o?: NowIp & { lang?: string; reschedule?: { date?: string; staff?: string } }) => { if (typeof t === "string") TOKENS_USED.add(t); return ON.mview()(t, { ip: newIp(), ...o }); };
const RS = (t: unknown, to: { dateStr: string; startMin: number; staffId: string | null }, o?: NowIp) => { if (typeof t === "string") TOKENS_USED.add(t); return ON.resched()(t, to, { ip: newIp(), ...o }); };
const CN = (t: unknown, o?: NowIp) => { if (typeof t === "string") TOKENS_USED.add(t); return ON.cancel()(t, { ip: newIp(), ...o }); };
const ICS = (t: unknown, o?: NowIp) => { if (typeof t === "string") TOKENS_USED.add(t); return ON.ics()(t, { ip: newIp(), ...o }); };
const VIEW = async (u: string, qy: OnlineQuery, t: string = ids.tA): Promise<OnlineBookingView> => {
  const r = await ON.view()(ref(u, t), qy, { ip: newIp() });
  ok(r.ok, `loadOnlineBooking ${fmt(r)}`);
  return (r as { ok: true; view: OnlineBookingView }).view;
};
/** จองออนไลน์ที่ต้องสำเร็จ → { row, token } */
const bookOk = async (u: string, i: OnlineBookInput, t: string = ids.tA): Promise<{ row: ApptRow; token: string; res: Extract<BookRes, { ok: true }> }> => {
  const r = await ON.book()(ref(u, t), i, { ip: newIp() });
  ok(r.ok, `bookOnline ${fmt(r)}`);
  const res = r as Extract<BookRes, { ok: true }>;
  const token = tokOfUrl(res.manageUrl);
  TOKENS_USED.add(token);
  return { row: await rowByKey(i.idempotencyKey as string), token, res };
};
const failOf = (r: { ok: boolean }, what: string): { code: string; reason: string } => {
  ok(!r.ok, `${what}: ควรล้ม ได้ ${fmt(r)}`);
  const f = r as { code?: unknown; reason?: unknown };
  ok(typeof f.reason === "string" && f.reason.trim().length > 0, `${what}: reason ว่าง`);
  return { code: String(f.code), reason: f.reason as string };
};

let setupOk = false;
let tplOk = false;
const needSetup = () => ok(setupOk, "สร้างข้อมูลทดสอบไม่สำเร็จ (ดูบรรทัดบน)");
const needTpl = () => { needSetup(); ok(tplOk, "แม่แบบ/ค่าตั้งทดสอบไม่สำเร็จ (T-0)"); };
console.log(`\n(วันนี้ไทย ${TODAY} · วันทดสอบ ${D.w} … ${D.u} · SESSION_SECRET ${SECRET.length >= 32 ? "มี" : "ไม่มี ⚠️"})`);

try {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length} ร้าน)`); await cleanup(stale); }
  await cleanupGlobal();

  // ── สร้างข้อมูล ──
  try {
    for (const [id, n, name] of [[ids.tA, "a", "QC B7 Shop A"], [ids.tB, "b", "QC B7 Shop B"]] as const) {
      SLUGS[id] = `${SLUG}${n}-${RUN}`;
      await insertRow("Tenant", { id, name, slug: SLUGS[id], updatedAt: new Date() });
    }
    const units: [string, string, string, string, string, boolean][] = [
      [ids.uO, ids.tA, "o", "สาขาออนไลน์", "BOOKING", true], [ids.uO2, ids.tA, "o2", "สาขาสอง", "BOOKING", true], [ids.uE, ids.tA, "e", "Branch E", "BOOKING", true],
      [ids.uL, ids.tA, "l", "สาขาเดิม", "BOOKING", true], [ids.uS, ids.tA, "s", "สาขาแถวเดียว", "BOOKING", false], [ids.uB, ids.tB, "b", "สาขาร้านบี", "BOOKING", false],
      [ids.uQ, ids.tA, "q", "สาขาคิว", "QUEUE", false],
    ];
    for (const [id, t, n, name, type, monClosed] of units) {
      SLUGS[id] = `b7-${n}-${RUN}`;
      await insertRow("BusinessUnit", { id, tenantId: t, type, name, slug: SLUGS[id], updatedAt: new Date() });
      if (type === "BOOKING") for (let w = 0; w < 7; w++) await insertRow("BookingHours", { id: rid("bh"), tenantId: t, unitId: id, weekday: w, openMin: 600, closeMin: 1200, closed: monClosed && w === 1, updatedAt: new Date() });
    }
    const svc = async (id: string, t: string, u: string, name: string, durationMin: number, priceSatang: number, sortOrder: number, o?: { depositSatang?: number; bookable?: boolean }) =>
      insertRow("BookingService", { id, tenantId: t, unitId: u, name, durationMin, priceSatang, bufferMin: 0, depositSatang: o?.depositSatang ?? 0, bookable: o?.bookable ?? true, sortOrder, updatedAt: new Date() });
    await svc(ids.CUT, ids.tA, ids.uO, "ตัดผมชาย", 45, 25000, 1);
    await svc(ids.WASH, ids.tA, ids.uO, "ตัด + สระ", 60, 35000, 2);
    await svc(ids.PERM, ids.tA, ids.uO, "ดัดผม", 120, 150000, 3, { depositSatang: 30000 });
    await svc(ids.NOB, ids.tA, ids.uO, "บริการไม่เปิดจอง", 30, 10000, 4, { bookable: false });
    await svc(ids.O2CUT, ids.tA, ids.uO2, "ตัดผมชาย", 45, 25000, 1);
    await svc(ids.ECUT, ids.tA, ids.uE, "Men's haircut", 45, 25000, 1);
    await svc(ids.EPERM, ids.tA, ids.uE, "Perm", 120, 150000, 2, { depositSatang: 30000 });
    await svc(ids.LCUT, ids.tA, ids.uL, "ตัดผมชาย", 45, 25000, 1);
    await svc(ids.SCUT, ids.tA, ids.uS, "ตัดผมชาย", 45, 25000, 1);
    await svc(ids.BCUT, ids.tB, ids.uB, "ตัดผมชาย", 45, 25000, 1);
    let ord = 0;
    const staff = async (id: string, t: string, u: string, name: string, sortOrder: number) =>
      insertRow("BookingStaff", { id, tenantId: t, unitId: u, name, sortOrder, createdAt: new Date(Date.now() - 600_000 + ++ord * 1000), updatedAt: new Date() });
    for (const [i, k] of [ids.ek, ids.boy, ids.nun, ids.jack].entries()) await staff(k, ids.tA, ids.uO, STAFF_NAME[k], i + 1);
    await insertRow("BookingStaffService", { id: rid("bss"), tenantId: ids.tA, unitId: ids.uO, staffId: ids.boy, serviceId: ids.CUT, updatedAt: new Date() }); // ช่างบอยไม่รับดัด/สระ
    for (const [i, [k, n]] of ([[ids.a, "ช่างเอ"], [ids.h, "ช่างซ่อนชื่อ"], [ids.z, "ช่างไม่รับออนไลน์"], [ids.qq, "ช่างโควตาน้อย"]] as const).entries()) await staff(k, ids.tA, ids.uO2, n, i + 1);
    await staff(ids.e1, ids.tA, ids.uE, "Alex", 1);
    await staff(ids.e2, ids.tA, ids.uE, "Sam", 2);
    await staff(ids.l1, ids.tA, ids.uL, "ช่างร้านเดิม", 1);
    await staff(ids.s1, ids.tA, ids.uS, "ช่างหนึ่ง", 1);
    await staff(ids.s2, ids.tA, ids.uS, "ช่างสอง", 2);
    await staff(ids.b1, ids.tB, ids.uB, "ช่างร้านบี", 1);
    // Party (ตัวตนจาก LINE)
    await insertRow("Party", { id: ids.P1, tenantId: ids.tA, name: PARTY1.name, phone: PARTY1.phone, phoneNorm: PARTY1.phone, updatedAt: new Date() });
    await insertRow("Party", { id: ids.P2, tenantId: ids.tA, name: "คุณซ้ำบีเจ็ด", phone: "0812349999", phoneNorm: "0812349999", mergedIntoId: ids.P1, updatedAt: new Date() });
    await insertRow("Party", { id: ids.PB, tenantId: ids.tB, name: "คุณร้านบีเจ็ด", phone: "0812345555", phoneNorm: "0812345555", updatedAt: new Date() });
    NAMES.push("คุณซ้ำบีเจ็ด", "คุณร้านบีเจ็ด");
    // ตู้ของหน่วยแถวเดียว (หนี้ B.6 §9 · การเก็บตามใบสั่ง B.6 §3.1)
    await insertRow("QueueDisplay", { id: ids.KQ, tenantId: ids.tA, unitId: ids.uS, name: `KIOSK ${ids.KQ}`, displayToken: `sha256:${sha256hex(KQ_TOKEN)}`, settings: JSON.stringify({ kind: "KIOSK" }), updatedAt: new Date() });
    setupOk = true;
  } catch (e) {
    console.log(`  ❌ สร้างข้อมูลทดสอบไม่สำเร็จ: ${errMsg(e)}`);
  }

  console.log("\n── T: แม่แบบ + ค่าตั้งทดสอบ ──");
  await st("T-0", "applyTemplate BARBER ที่สาขา o/o2/e/s + ร้าน B (สาขา legacy ไม่เลือกแม่แบบ) · s เปิดแถวเดียว · ค่าตั้งรายช่าง/รายบริการ/ภาษา ของข้อสอบ", async () => {
    needSetup();
    for (const [actor, t, u] of [[OWNER, ids.tA, ids.uO], [OWNER, ids.tA, ids.uO2], [OWNER, ids.tA, ids.uE], [OWNER, ids.tA, ids.uS], [OWNER_B, ids.tB, ids.uB]] as const) {
      const a = await SETTINGS().applyTemplate(actor, { tenantId: t }, { unitId: u, domain: "booking", templateKey: "BARBER", overwrite: "RESET_ALL" });
      ok(a.ok, `applyTemplate ${u}: ${a.code} ${fmt(a.issues)}`);
    }
    const sets: [string, string, string, unknown][] = [
      ["booking.queue.singleLine", "UNIT", ids.uS, true],
      ["booking.booking.onlineSharePct", "STAFF", ids.jack, 0],
      ["booking.booking.requireConfirm", "SERVICE", ids.WASH, true],
      ["booking.booking.extraFields", "SERVICE", ids.WASH, "MASSAGE_NOTE"],
      ["booking.staff.customerCanChoose", "STAFF", ids.h, false],
      ["booking.booking.onlineSharePct", "STAFF", ids.z, 0],
      ["booking.booking.onlineSharePct", "STAFF", ids.qq, 10],
      ["booking.general.customerLocales", "UNIT", ids.uL, ["th"]],
    ];
    for (const [key, scope, scopeId, value] of sets) {
      const r = await SETTINGS().setSettings(OWNER, { tenantId: ids.tA }, [{ key, scope, scopeId, value }]);
      ok(r.ok, `${key}@${scope}: ${r.code} ${fmt(r.issues)}`);
    }
    tplOk = true;
  });

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC: ตัวควบคุม (ต้องเขียวตั้งแต่ก่อนมีงาน) ──");
  await st("PC-1", "B.3 ช่อง ONLINE ทำงานบนข้อมูลทดสอบ: findSlots ช่างเอก ≥ 30 ช่อง · ช่างแจ๊ค (0%) = 0 ช่อง · ช่างบอยดัดผม = 0 ช่อง · วันจันทร์ (ร้านปิด) = 0 ช่อง", async () => {
    needTpl();
    const f = (staffId: string | null, serviceId: string, ds: string) => BK().findSlots(cO, { serviceId, staffId, dateStr: ds, channel: "ONLINE" });
    ok((await f(ids.ek, ids.CUT, D.w)).length >= 30, "ช่างเอก");
    eq((await f(ids.jack, ids.CUT, D.w)).length, 0, "ช่างแจ๊ค 0%");
    eq((await f(ids.boy, ids.PERM, D.w)).length, 0, "ช่างบอยดัด");
    eq((await f(null, ids.CUT, MONDAY)).length, 0, "วันจันทร์");
  });
  await st("PC-2", "B.3 bookAppointment ONLINE (ไม่ผ่าน online.ts) ⇒ สำเร็จ แล้วช่องเดิมซ้ำ ⇒ FULL · ดัดผม ⇒ PENDING (ถือช่องมัดจำ ฿300)", async () => {
    needTpl();
    const i = { serviceId: ids.CUT, staffId: ids.ek, dateStr: D.u, startMin: 600, channel: "ONLINE" as const, customerName: newName(), customerPhone: newPhone() };
    const a = await BK().bookAppointment(cO, i);
    ok(a.ok, fmt(a));
    const b = await BK().bookAppointment(cO, { ...i, customerName: newName(), customerPhone: newPhone() });
    eq(b.ok ? "OK" : b.code, "FULL", "ซ้ำ");
    const p = await BK().bookAppointment(cO, { serviceId: ids.PERM, staffId: ids.nun, dateStr: D.u, startMin: 780, channel: "ONLINE", customerName: newName(), customerPhone: newPhone() });
    ok(p.ok && p.status === "PENDING", fmt(p));
    eq((await apRow((p as { id: string }).id)).depositSatang, 30000, "มัดจำดัด");
  });
  await st("PC-3", "ลิงก์เซ็น: sqcIdentityToken (สูตรของข้อสอบ/ฉากภาพ) ผ่าน verifyLink(\"booking.identity\") ของ core · ผิดจุดประสงค์ ⇒ null · signLink ของ core ตรวจผ่าน", () => {
    ok(SECRET.length >= 32, "ไม่มี SESSION_SECRET ใน env QC");
    const tk = sqcIdentityToken(SECRET, { tenantId: ids.tA, partyId: ids.P1, nowMs: Date.now(), ttlMin: 60 });
    eq(LINK().verifyLink(tk, "booking.identity"), { tenantId: ids.tA, subjectId: ids.P1 }, "verify");
    eq(LINK().verifyLink(tk, "booking.checkin"), null, "ผิดจุดประสงค์");
    eq(LINK().verifyLink(LINK().signLink({ tenantId: ids.tA, purpose: "booking.identity", subjectId: ids.P1, expMin: 5 }), "booking.identity"), { tenantId: ids.tA, subjectId: ids.P1 }, "signLink");
  });
  await st("PC-4", "checkRateLimitDb นับข้ามคำขอ + ใช้ now ที่ฉีด (3/นาที ⇒ ครั้งที่ 4 ล้ม · ข้ามหน้าต่างแล้วผ่าน)", async () => {
    const key = `svcb7:pc4:${RUN}`;
    const t0 = Date.now();
    const r = [];
    for (let i = 0; i < 4; i++) r.push((await RATE().checkRateLimitDb(key, { limit: 3, windowMs: 60_000 }, t0)).ok);
    eq(r, [true, true, true, false], "ในหน้าต่าง");
    eq((await RATE().checkRateLimitDb(key, { limit: 3, windowMs: 60_000 }, t0 + 61_000)).ok, true, "หน้าต่างใหม่");
  }, "MAJOR");
  await st("PC-5", "ตัวตรวจ PII จับได้จริง (positive control): JSON ที่มีเบอร์/ชื่อลูกค้าทดสอบ ⇒ ถูกจับ · รูปเบอร์ขีด/+66 ⇒ ถูกจับ", () => {
    const p = newPhone();
    const n = newName();
    ok(piiLeak(JSON.stringify({ x: p })).length === 1 && piiLeak(dashed(p)).length === 1 && piiLeak(`+66${p.slice(1)}`).length === 1 && piiLeak(`a ${n} b`).length === 1, "ตัวตรวจไม่จับ");
    eq(piiLeak(`${PARTY1.phone.slice(-4)} •••`), [], "เบอร์ปิดไม่นับ");
  }, "MAJOR");
  await st("PC-6", "createWalkIn ที่หน่วยแถวเดียว (now ฉีด) ทำงาน · moveJobStaff ของ walk-in ทำงาน (ตัวควบคุมของ X-7)", async () => {
    needTpl();
    const now = at(D.u, "10:00");
    const w = await LN().createWalkIn(cS, { serviceId: ids.SCUT, staffId: null, channel: "STAFF" }, { now });
    ok(w.ok, fmt(w));
    const wid = (w as { appointmentId: string }).appointmentId;
    const to = (w as { staffId: string }).staffId === ids.s1 ? ids.s2 : ids.s1;
    const m = await OPS().moveJobStaff(cS, wid, to, { now });
    ok(m.ok, fmt(m));
  }, "MAJOR");

  // ═══════════════ W หน้าจอง ═══════════════
  console.log("\n── W: หน้าจอง (loadOnlineBooking · ภาพ 03) ──");
  let wTaken = false;
  try { if (setupOk && tplOk) { const r = await BK().bookAppointment(cO, { serviceId: ids.CUT, staffId: ids.ek, dateStr: D.w, startMin: 720, channel: "STAFF", customerName: newName(), customerPhone: newPhone() }); wTaken = r.ok; } } catch { /* W-4 รายงาน */ }
  await st("W-1", "ขั้น 1: บริการ active+bookable เรียง sortOrder (ไม่มีบริการไม่เปิดจอง) · มัดจำตามแม่แบบ (ดัด ฿300 · ตัด/สระ 0) · step 1 · ชื่อร้าน/สาขา · ภาษา th (ค่าแรกของ customerLocales)", async () => {
    needTpl();
    const v = await VIEW(ids.uO, {});
    eq(v.step, 1, "step");
    eq(v.services.map((s) => [s.id, s.durationMin, s.priceSatang, s.depositSatang]), [[ids.CUT, 45, 25000, 0], [ids.WASH, 60, 35000, 0], [ids.PERM, 120, 150000, 30000]], "บริการ");
    eq([v.service, v.summary, v.timeSel, v.identity], [null, null, null, null], "ยังไม่เลือก");
    eq([v.tenantName, v.unitName, v.locale, v.locales], ["QC B7 Shop A", "สาขาออนไลน์", "th", ["th", "en"]], "ร้าน/ภาษา");
  });
  await st("W-2", "ขั้น 2 ช่าง: เฉพาะคนที่ทำบริการได้ · ออนไลน์ > 0% · ลูกค้าเลือกชื่อได้ · มีตัวเลือกใครก็ได้ (staffSel ปริยาย any) · ระบุช่างนอกรายการ ⇒ กลับค่าปริยาย", async () => {
    needTpl();
    const cut = await VIEW(ids.uO, { svc: ids.CUT });
    eq([cut.step, cut.service?.id, cut.anyStaff, cut.staffSel], [2, ids.CUT, true, "any"], "ตัด");
    eq(cut.staff.map((s) => s.id), [ids.ek, ids.boy, ids.nun], "ช่างตัด (ไม่มีแจ๊ค 0%)");
    eq((await VIEW(ids.uO, { svc: ids.PERM })).staff.map((s) => s.id), [ids.ek, ids.nun], "ช่างดัด (บอยไม่รับดัด)");
    eq((await VIEW(ids.uO2, { svc: ids.O2CUT })).staff.map((s) => s.id), [ids.a, ids.qq], "สาขาสอง (ไม่มีช่างซ่อนชื่อ/0%)");
    eq((await VIEW(ids.uO, { svc: ids.CUT, staff: ids.jack })).staffSel, "any", "ช่าง 0%");
    eq((await VIEW(ids.uO, { svc: ids.CUT, staff: ids.b1 })).staffSel, "any", "ช่างร้าน B");
    eq((await VIEW(ids.uO, { svc: ids.CUT, staff: ids.ek })).staffSel, ids.ek, "ระบุช่าง");
  });
  await st("W-3", "ขั้น 2 วัน: วันนี้ … วันนี้+29 (horizon 30 ของ BARBER) · วันจันทร์ = closed · วันเปิด = ไม่ closed · dateSel ปริยาย = วันแรกที่ไม่ closed · ร้านเดิม (_fallback) horizon 14", async () => {
    needTpl();
    const v = await VIEW(ids.uO, { svc: ids.CUT, staff: ids.ek });
    eq([v.days.length, v.days[0]?.dateStr, v.days[v.days.length - 1]?.dateStr], [30, TODAY, addDays(TODAY, 29)], "ช่วงวัน");
    for (const d of v.days.slice(1)) eq(d.closed, weekdayOf(d.dateStr) === 1, `closed ${d.dateStr}`);
    eq(v.dateSel, v.days.find((d) => !d.closed)?.dateStr ?? null, "dateSel ปริยาย");
    eq((await VIEW(ids.uO, { svc: ids.CUT, staff: ids.ek, date: MONDAY })).dateSel, v.dateSel, "เลือกวันปิด ⇒ ปริยาย");
    eq((await VIEW(ids.uO, { svc: ids.CUT, staff: ids.ek, date: addDays(TODAY, 30) })).dateSel, v.dateSel, "เลย horizon ⇒ ปริยาย");
    const l = await VIEW(ids.uL, { svc: ids.LCUT });
    eq([l.days.length, l.days[l.days.length - 1]?.dateStr], [14, addDays(TODAY, 13)], "legacy horizon 14");
  });
  await st("W-4", "ขั้น 2 เวลา: ช่อง free = findSlots(ONLINE) ทุกตัว (ช่างเอก + ใครก็ได้) · ช่องที่ถูกจอง 12:00 มีอยู่ใน times แบบ free=false · ทุกช่องอยู่บนตาราง 15 นาที เรียงเวลา", async () => {
    needTpl();
    ok(wTaken, "ตั้งนัดช่างเอก 12:00 ไม่สำเร็จ");
    for (const staffId of [ids.ek, null]) {
      const v = await VIEW(ids.uO, { svc: ids.CUT, staff: staffId ?? "any", date: D.w });
      eq(v.dateSel, D.w, "dateSel");
      const want = (await BK().findSlots(cO, { serviceId: ids.CUT, staffId, dateStr: D.w, channel: "ONLINE" })).map((s) => s.startMin);
      eq(v.times.filter((t) => t.free).map((t) => t.startMin), want, `free ${staffId ?? "any"}`);
      ok(v.times.every((t, i) => t.startMin % 15 === 0 && t.hhmm === hhmm(t.startMin) && (i === 0 || t.startMin > v.times[i - 1].startMin)), "ตาราง/เรียง");
      if (staffId) eq(v.times.find((t) => t.startMin === 720)?.free, false, "12:00 ช่างเอก = เต็ม");
    }
  });
  await st("W-5", "ขั้น 3 สรุป: ตัดผมชาย ช่างเอก 11:00 = เริ่ม/จบ(45 นาที)/ราคา/มัดจำ 0/จ่ายที่ร้าน/เลื่อนฟรีถึง (−180 นาที) · ดัดผม ช่างนุ่น 15:30 = ฿1,500 · มัดจำ ฿300 · จ่ายที่ร้าน ฿1,200 · จบ 17:30 (ภาพ 03ค)", async () => {
    needTpl();
    const v = await VIEW(ids.uO, { svc: ids.CUT, staff: ids.ek, date: D.w, time: "11:00" });
    eq([v.step, v.timeSel], [3, { startMin: 660, hhmm: "11:00" }], "step");
    eq(v.summary, { startMs: bkkMs(D.w, 660), endMs: bkkMs(D.w, 705), staffName: "ช่างเอก", priceSatang: 25000, depositSatang: 0, payAtShopSatang: 25000, freeUntilMs: bkkMs(D.w, 660 - 180) }, "สรุปตัด");
    const p = await VIEW(ids.uO, { svc: ids.PERM, staff: ids.nun, date: D.w, time: "15:30" });
    eq(p.summary, { startMs: bkkMs(D.w, 930), endMs: bkkMs(D.w, 1050), staffName: "ช่างนุ่น", priceSatang: 150000, depositSatang: 30000, payAtShopSatang: 120000, freeUntilMs: bkkMs(D.w, 930 - 180) }, "สรุปดัด");
    const any = await VIEW(ids.uO, { svc: ids.CUT, staff: "any", date: D.w, time: "11:00" });
    eq([any.step, any.summary?.staffName], [3, null], "ใครก็ได้ ⇒ staffName null");
    const full = await VIEW(ids.uO, { svc: ids.CUT, staff: ids.ek, date: D.w, time: "12:00" });
    eq([full.step, full.timeSel, full.summary], [2, null, null], "เวลาเต็ม ⇒ ขั้น 2");
    eq((await VIEW(ids.uO, { svc: ids.CUT, staff: ids.ek, date: D.w, time: "11:05" })).step, 2, "นอกตาราง ⇒ ขั้น 2");
  });
  await st("W-6", "กติกาจากทะเบียนค่าตั้ง (ไม่แคช): ค่าแม่แบบ BARBER ทุกช่อง · ร้านแก้ freeChangeBeforeMin 180→60 ⇒ หน้าถัดไปเห็น 60 + freeUntil ขยับ · คืนค่า ⇒ 180 · ตัด+สระ requireConfirm (ชั้นบริการ) = true", async () => {
    needTpl();
    const v = await VIEW(ids.uO, { svc: ids.CUT, staff: ids.ek, date: D.w, time: "11:00" });
    eq(v.policy, { graceMin: 10, afterGrace: "RELEASE_REQUEUE", freeChangeBeforeMin: 180, selfRescheduleMax: 2, requireConfirm: false, depositMethod: "PROMPTPAY_SLIP", payWithinMin: 15, forfeitPct: 100 }, "policy");
    const s = await SETTINGS().setSettings(OWNER, { tenantId: ids.tA }, [{ key: "booking.late.freeChangeBeforeMin", scope: "UNIT", scopeId: ids.uO, value: 60 }]);
    ok(s.ok, fmt(s));
    try {
      const v2 = await VIEW(ids.uO, { svc: ids.CUT, staff: ids.ek, date: D.w, time: "11:00" });
      eq([v2.policy?.freeChangeBeforeMin, v2.summary?.freeUntilMs], [60, bkkMs(D.w, 600)], "หลังแก้");
    } finally {
      await SETTINGS().resetSetting(OWNER, { tenantId: ids.tA }, { key: "booking.late.freeChangeBeforeMin", scope: "UNIT", scopeId: ids.uO });
    }
    eq((await VIEW(ids.uO, { svc: ids.CUT, staff: ids.ek })).policy?.freeChangeBeforeMin, 180, "คืนค่า");
    eq((await VIEW(ids.uO, { svc: ids.WASH })).policy?.requireConfirm, true, "requireConfirm บริการ");
  });
  await st("W-7", "ข้อมูลขอเพิ่ม (extraFields ชั้นบริการ): ตัด+สระ = MASSAGE_NOTE + ป้ายไม่ว่าง · ตัดผมชาย = null", async () => {
    needTpl();
    const v = await VIEW(ids.uO, { svc: ids.WASH });
    eq(v.extraField?.key, "MASSAGE_NOTE", "WASH");
    ok(typeof v.extraField?.label === "string" && v.extraField.label.trim().length > 0, "ป้าย");
    eq((await VIEW(ids.uO, { svc: ids.CUT })).extraField, null, "CUT");
  }, "MAJOR");
  const whoOk = () => sqcIdentityToken(SECRET, { tenantId: ids.tA, partyId: ids.P1, nowMs: Date.now(), ttlMin: 60 });
  const BAD_WHO = (): [string, string][] => {
    const good = whoOk();
    return [
      ["ร้านอื่น (tenant B)", sqcIdentityToken(SECRET, { tenantId: ids.tB, partyId: ids.P1, nowMs: Date.now(), ttlMin: 60 })],
      ["Party ของร้าน B ใน token ร้าน A", sqcIdentityToken(SECRET, { tenantId: ids.tA, partyId: ids.PB, nowMs: Date.now(), ttlMin: 60 })],
      ["Party ที่ถูกรวมแล้ว", sqcIdentityToken(SECRET, { tenantId: ids.tA, partyId: ids.P2, nowMs: Date.now(), ttlMin: 60 })],
      ["ผิดจุดประสงค์ (booking.checkin)", LINK().signLink({ tenantId: ids.tA, purpose: "booking.checkin", subjectId: ids.P1, expMin: 60 })],
      ["หมดอายุ", sqcIdentityToken(SECRET, { tenantId: ids.tA, partyId: ids.P1, nowMs: Date.now() - 3 * 3_600_000, ttlMin: 60 })],
      ["ปลอมลายเซ็น", `${good.slice(0, -2)}${good.endsWith("AA") ? "BB" : "AA"}`],
      ["สุ่ม", rand43()],
    ];
  };
  await st("W-8", "ตัวตนจาก LINE: token ถูก ⇒ identity { ชื่อ Party · เบอร์ปิด •••-•••-4417 } · ไม่มีเบอร์เต็มใน view", async () => {
    needTpl();
    const v = await VIEW(ids.uO, { svc: ids.CUT, who: whoOk() });
    eq(v.identity, { name: PARTY1.name, phoneMasked: "•••-•••-4417" }, "identity");
    ok(!JSON.stringify(v).includes(PARTY1.phone), "เบอร์เต็มหลุด");
  });
  await st("W-9", "X7 ตัวตน: token ใช้ไม่ได้ 7 แบบ (ร้านอื่น · Party ร้านอื่น · Party ถูกรวม · ผิดจุดประสงค์ · หมดอายุ · ปลอม · สุ่ม) ⇒ view เท่ากับไม่ส่ง who ทุกไบต์", async () => {
    needTpl();
    const qy = { svc: ids.CUT, staff: ids.ek, date: D.w, time: "11:00" };
    const base = await VIEW(ids.uO, qy);
    for (const [what, who] of BAD_WHO()) eq(await VIEW(ids.uO, { ...qy, who }), base, what);
  });
  await st("W-10", "X1 หน้าจอง: slug ไม่มี / สาขา QUEUE / slug สาขาร้าน B คู่กับ slug ร้าน A ⇒ { ok:false, code: NOT_FOUND } เดียวกัน · svc ของร้าน B / ของสาขาอื่น / ไม่เปิดจอง ⇒ ขั้น 1 (ไม่เลือก)", async () => {
    needTpl();
    const r = [
      await ON.view()({ tenantSlug: SLUGS[ids.tA], unitSlug: `nope-${RUN}` }, {}, { ip: newIp() }),
      await ON.view()(ref(ids.uQ), {}, { ip: newIp() }),
      await ON.view()({ tenantSlug: SLUGS[ids.tA], unitSlug: SLUGS[ids.uB] }, {}, { ip: newIp() }),
      await ON.view()({ tenantSlug: `nope-${RUN}`, unitSlug: SLUGS[ids.uO] }, {}, { ip: newIp() }),
    ];
    for (const x of r) eq(x, { ok: false, code: "NOT_FOUND" }, "NOT_FOUND");
    for (const svc of [ids.BCUT, ids.O2CUT, ids.NOB]) eq([(await VIEW(ids.uO, { svc })).step, (await VIEW(ids.uO, { svc })).service], [1, null], `svc ${svc}`);
  });
  await st("W-11", "ภาษา: lang=en ที่สาขาที่เปิด th/en ⇒ en · สาขาที่เปิด th อย่างเดียว ⇒ th (locales [th]) · ค่าแปลก ⇒ ตัวแรก", async () => {
    needTpl();
    eq((await VIEW(ids.uE, { lang: "en" })).locale, "en", "uE en");
    eq([(await VIEW(ids.uL, { lang: "en" })).locale, (await VIEW(ids.uL, {})).locales], ["th", ["th"]], "uL");
    eq((await VIEW(ids.uO, { lang: "jp" })).locale, "th", "แปลก");
  }, "MAJOR");
  await st("W-12", "X8 view ไม่มี PII (ชื่อ/เบอร์ลูกค้าที่จองไว้ในวันนั้น) · ไม่มี id นัด/manageTokenHash/policySnapshot", async () => {
    needTpl();
    const v = JSON.stringify(await VIEW(ids.uO, { svc: ids.CUT, staff: ids.ek, date: D.w, time: "11:00" }));
    eq(piiLeak(v), [], "PII");
    ok(!/manageTokenHash|policySnapshot|customerPhone|customerName|svcb7_k_/.test(v), "ฟิลด์ภายใน");
  });

  // ═══════════════ B จอง ═══════════════
  console.log("\n── B: จอง (bookOnline) ──");
  const fx: Record<string, { row: ApptRow; token: string }> = {};
  await st("B-1", "จองตัดผมชาย ช่างเอก ⇒ CONFIRMED · manageUrl = /bq/m/<HMAC(id)> · แถวเก็บ sha256(token) · channel ONLINE · kind BOOKED · ไม่มี holdUntil · มัดจำ 0", async () => {
    needTpl();
    const i = bi({ serviceId: ids.CUT, staffId: ids.ek, dateStr: D.b, startMin: 600 });
    const { row, token, res } = await bookOk(ids.uO, i);
    fx.b1 = { row, token };
    eq([res.status, res.holdUntilMs, res.depositSatang, res.startMs], ["CONFIRMED", null, 0, bkkMs(D.b, 600)], "ผล");
    eq(token, mg(row.id), "token = HMAC(id)");
    eq(row.manageTokenHash, sha256hex(token), "hash");
    eq([row.channel, row.source, row.kind, row.assignMode, row.staffId, row.status], ["ONLINE", "ONLINE", "BOOKED", "SPECIFIC", ids.ek, "CONFIRMED"], "แถว");
    ok(token.length === 43 && /^[A-Za-z0-9_-]+$/.test(token), "รูป token");
  });
  await st("B-2", "ดัดผม ⇒ PENDING · holdUntilMs = createdAt + 15 นาที (payWithinMin) · depositSatang 30000 (มัดจำ = B.8 · ไม่รับเงินที่นี่)", async () => {
    needTpl();
    const { row, token, res } = await bookOk(ids.uO, bi({ serviceId: ids.PERM, staffId: ids.nun, dateStr: D.b, startMin: 780 }));
    fx.b2 = { row, token };
    eq([res.status, res.depositSatang, row.status, row.depositSatang], ["PENDING", 30000, "PENDING", 30000], "ผล");
    ok(res.holdUntilMs !== null && Math.abs(res.holdUntilMs - (row.createdAt.getTime() + 15 * MIN)) < 5_000, `holdUntil ${res.holdUntilMs}`);
  });
  await st("B-3", "booking.created ของนัดออนไลน์: 1 แถว คีย์ booking.created#<id> (ใน tx เดียว) · payload มี appointmentId/unitId/staffId/channel ONLINE · ไม่มี PII · ช่อง STAFF ของ bookAppointment ไม่ยิง (คงพฤติกรรม B.3)", async () => {
    needTpl();
    ok(!!fx.b1, "ต้องมี B-1");
    const e = await evOf("booking.created", fx.b1.row.id);
    eq(e.map((x) => x.idempotencyKey), [`booking.created#${fx.b1.row.id}`], "event");
    eq([e[0].payload.unitId, e[0].payload.staffId, e[0].payload.channel, e[0].payload.kind], [ids.uO, ids.ek, "ONLINE", "BOOKED"], "payload");
    eq(piiLeak(JSON.stringify(e[0].payload)), [], "PII");
    const s = await BK().bookAppointment(cO, { serviceId: ids.CUT, staffId: ids.boy, dateStr: D.b, startMin: 600, channel: "STAFF", customerName: newName(), customerPhone: newPhone() });
    ok(s.ok, fmt(s));
    eq((await evOf("booking.created", (s as { id: string }).id)).length, 0, "STAFF ไม่ยิง");
  });
  await st("B-4", "จองจากลิงก์ตัวตน LINE โดยไม่กรอกชื่อ/เบอร์ ⇒ สำเร็จ · ชื่อ/เบอร์ = Party · channel LINE · partyId = Party · ส่งเบอร์อื่นมาด้วย ⇒ ถูกละ", async () => {
    needTpl();
    const i = { ...bi({ serviceId: ids.CUT, staffId: ids.nun, dateStr: D.b, startMin: 600 }), name: undefined, phone: undefined, who: whoOk() };
    const { row } = await bookOk(ids.uO, i);
    eq([row.customerName, row.customerPhone, row.channel, row.partyId], [PARTY1.name, PARTY1.phone, "LINE", ids.P1], "แถว");
    const j = { ...bi({ serviceId: ids.CUT, staffId: ids.nun, dateStr: D.b, startMin: 720 }), who: whoOk() };
    const r2 = await bookOk(ids.uO, j);
    eq([r2.row.customerPhone, r2.row.channel], [PARTY1.phone, "LINE"], "ละเบอร์ที่ส่งมา");
    const ev = await evOf("booking.created", row.id);
    eq(ev.map((x) => x.payload.channel), ["LINE"], "event LINE");
  });
  await st("B-5", "ตัวตนใช้ไม่ได้ (7 แบบ) + ไม่กรอกชื่อ/เบอร์ ⇒ BAD_INPUT ทุกแบบ (รหัส/ข้อความเดียวกัน) · ตัวตนใช้ไม่ได้ + กรอกเอง ⇒ สำเร็จ channel ONLINE · partyId ≠ Party ในลิงก์", async () => {
    needTpl();
    const outs: unknown[] = [];
    for (const [, who] of BAD_WHO()) {
      const r = await ON.book()(ref(ids.uO), { serviceId: ids.CUT, staffId: ids.ek, dateStr: D.b, startMin: 900, idempotencyKey: rid("k"), who }, { ip: newIp() });
      outs.push(r);
    }
    ok(outs.every((o) => isDeepStrictEqual(o, outs[0])), `คำตอบไม่เท่ากัน ${fmt(outs.slice(0, 2))}`);
    eq((outs[0] as { code?: string }).code, "BAD_INPUT", "รหัส");
    const { row } = await bookOk(ids.uO, { ...bi({ serviceId: ids.CUT, staffId: ids.ek, dateStr: D.b, startMin: 900 }), who: BAD_WHO()[0][1] });
    ok(row.channel === "ONLINE" && row.partyId !== ids.P1, fmt([row.channel, row.partyId]));
  });
  await st("B-6", "รหัสล้มของ B.3 ส่งต่อ: PAST · BEYOND_HORIZON · LEAD_TIME · OFF_GRID · OUTSIDE_HOURS · NOT_QUALIFIED · FULL (ชน = 0% ข้อความเดียวกัน) · NOT_FOUND (บริการร้าน B / ไม่เปิดจอง / ช่างร้าน B / ช่างที่ลูกค้าเลือกชื่อไม่ได้ / สาขาไม่มี)", async () => {
    needTpl();
    const B = async (u: string, o: { serviceId: string; staffId: string | null; dateStr: string; startMin: number }, r0: Ref = ref(u)) => {
      const r = await ON.book()(r0, bi(o), { ip: newIp() });
      return r.ok ? { code: "OK", reason: "" } : failOf(r, `${o.dateStr} ${o.startMin}`);
    };
    const nowMs = Date.now();
    const leadT = nowMs + 30 * MIN;
    const leadDay = new Date(leadT + 7 * 3_600_000).toISOString().slice(0, 10);
    let leadMin = Math.ceil(((Math.floor(leadT / MIN) + 420) % 1440 + 1) / 15) * 15;
    let leadDs = leadDay;
    if (leadMin >= 1440) { leadMin = 0; leadDs = addDays(leadDay, 1); }
    const got: [string, string][] = [
      ["PAST", (await B(ids.uO, { serviceId: ids.CUT, staffId: ids.ek, dateStr: TODAY, startMin: 0 })).code],
      ["BEYOND_HORIZON", (await B(ids.uO, { serviceId: ids.CUT, staffId: ids.ek, dateStr: addDays(TODAY, 30), startMin: 600 })).code],
      ["LEAD_TIME", (await B(ids.uO, { serviceId: ids.CUT, staffId: ids.ek, dateStr: leadDs, startMin: leadMin })).code],
      ["OFF_GRID", (await B(ids.uO, { serviceId: ids.CUT, staffId: ids.ek, dateStr: D.b, startMin: 605 })).code],
      ["OUTSIDE_HOURS", (await B(ids.uO, { serviceId: ids.CUT, staffId: ids.ek, dateStr: D.b, startMin: 1260 })).code],
      ["NOT_QUALIFIED", (await B(ids.uO, { serviceId: ids.PERM, staffId: ids.boy, dateStr: D.b, startMin: 600 })).code],
      ["NOT_FOUND", (await B(ids.uO, { serviceId: ids.BCUT, staffId: null, dateStr: D.b, startMin: 600 })).code],
      ["NOT_FOUND", (await B(ids.uO, { serviceId: ids.NOB, staffId: null, dateStr: D.b, startMin: 600 })).code],
      ["NOT_FOUND", (await B(ids.uO, { serviceId: ids.CUT, staffId: ids.b1, dateStr: D.b, startMin: 600 })).code],
      ["NOT_FOUND", (await B(ids.uO2, { serviceId: ids.O2CUT, staffId: ids.h, dateStr: D.b, startMin: 600 })).code],
      ["NOT_FOUND", (await B(ids.uO, { serviceId: ids.CUT, staffId: null, dateStr: D.b, startMin: 600 }, { tenantSlug: SLUGS[ids.tA], unitSlug: SLUGS[ids.uB] })).code],
    ];
    eq(got.map((g) => g[1]), got.map((g) => g[0]), "รหัส");
    const clash = await B(ids.uO, { serviceId: ids.CUT, staffId: ids.ek, dateStr: D.b, startMin: 600 });
    const zero = await B(ids.uO2, { serviceId: ids.O2CUT, staffId: ids.z, dateStr: D.b, startMin: 600 });
    eq([clash.code, zero.code, clash.reason === zero.reason], ["FULL", "FULL", true], "FULL ข้อความเดียว");
  });
  await st("B-7", "idempotency: ส่งซ้ำ key เดิมข้อมูลเดิม ⇒ ผลเดิม + manageUrl เดิม · แถว 1 · event 1 · key เดิมข้อมูลต่าง (เวลา) ⇒ BAD_INPUT", async () => {
    needTpl();
    const i = bi({ serviceId: ids.CUT, staffId: ids.boy, dateStr: D.b, startMin: 720 });
    const a = await ON.book()(ref(ids.uO), i, { ip: newIp() });
    const b = await ON.book()(ref(ids.uO), i, { ip: newIp() });
    ok(a.ok && b.ok, fmt([a, b]));
    eq(b, a, "ผลเดิม");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "tenantId" = $1 AND "idempotencyKey" = $2`, [ids.tA, i.idempotencyKey]))[0].n, 1, "แถว");
    const row = await rowByKey(i.idempotencyKey as string);
    eq((await evOf("booking.created", row.id)).length, 1, "event");
    const c = await ON.book()(ref(ids.uO), { ...i, startMin: 780 }, { ip: newIp() });
    eq(failOf(c, "ข้อมูลต่าง").code, "BAD_INPUT", "ข้อมูลต่าง");
  });
  await st("B-8", "ข้อมูลขอเพิ่ม: ตัด+สระ note บันทึกในแถว · note ยาว 301 ⇒ BAD_INPUT · ชื่อว่าง/เบอร์ \"0\" ⇒ BAD_INPUT · requireConfirm (บริการ) ⇒ PENDING ไม่มี holdUntil", async () => {
    needTpl();
    const { row, res } = await bookOk(ids.uO, bi({ serviceId: ids.WASH, staffId: ids.ek, dateStr: D.b, startMin: 840, note: "แรงนวดปานกลาง" }));
    eq([row.note, res.status, res.holdUntilMs], ["แรงนวดปานกลาง", "PENDING", null], "note/PENDING");
    for (const bad of [{ note: "ก".repeat(301) }, { name: "" }, { phone: "0" }]) {
      const r = await ON.book()(ref(ids.uO), { ...bi({ serviceId: ids.CUT, staffId: ids.ek, dateStr: D.b, startMin: 1020 }), ...bad }, { ip: newIp() });
      eq(failOf(r, fmt(bad).slice(0, 30)).code, "BAD_INPUT", fmt(Object.keys(bad)));
    }
  });
  await st("B-9", "X8 คำตอบ bookOnline ไม่มีชื่อ/เบอร์/id นัด/hash (ทั้งสำเร็จและล้ม)", async () => {
    needTpl();
    const i = bi({ serviceId: ids.CUT, staffId: ids.nun, dateStr: D.b, startMin: 1020 });
    const a = await ON.book()(ref(ids.uO), i, { ip: newIp() });
    const b = await ON.book()(ref(ids.uO), { ...bi({ serviceId: ids.CUT, staffId: ids.nun, dateStr: D.b, startMin: 1020 }) }, { ip: newIp() });
    ok(a.ok, fmt(a));
    const row = await rowByKey(i.idempotencyKey as string);
    for (const r of [a, b]) {
      const s = JSON.stringify(r);
      eq(piiLeak(s), [], "PII");
      ok(!s.includes(row.id) && !s.includes(sha256hex(mg(row.id))), "id/hash หลุด");
    }
  });
  await st("B-10", "ไม่มี SESSION_SECRET (ลูกโพรเซส): จองสำเร็จ แต่ manageUrl = null · manageToken = null · loadManageView(token ใด ๆ) = NOT_FOUND", async () => {
    needTpl();
    const p = { ref: ref(ids.uO), input: bi({ serviceId: ids.CUT, staffId: ids.nun, dateStr: D.b, startMin: 1080 }), ip: newIp(), probe: fx.b1?.token ?? rand43() };
    const r = spawnSync(process.execPath, [...process.execArgv, SELF], { cwd: ROOT, env: { ...process.env, SESSION_SECRET: "", QC_B7_NOSECRET: JSON.stringify(p) }, encoding: "utf8", timeout: 300_000, maxBuffer: 16 * 1024 * 1024 });
    const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith("NOSECRET_JSON="));
    ok(!!line, `ลูกโพรเซส exit=${r.status} ${(r.stdout ?? "").split("\n").filter((l) => l.startsWith("NOSECRET_ERR")).join(" ").slice(0, 200)}`);
    const j = JSON.parse(line!.slice("NOSECRET_JSON=".length)) as { book: BookRes; tok: unknown; view: unknown };
    ok(j.book.ok && j.book.manageUrl === null, `book ${fmt(j.book)}`);
    eq([j.tok, j.view], [null, { ok: false, code: "NOT_FOUND" }], "token/view");
  }, "MAJOR");

  // ═══════════════ X ยิงพร้อมกันข้ามโพรเซส ═══════════════
  console.log(`\n── X: ยิงพร้อมกันข้ามโพรเซส (${NCHILD} โพรเซส × 2 คำขอ ต่อฉาก) ──`);
  const xfx: Record<string, { row: ApptRow; token: string }> = {};
  let xPrepErr = "";
  let w0 = "";
  try {
    needTpl();
    xfx.a4 = await bookOk(ids.uO, bi({ serviceId: ids.CUT, staffId: ids.ek, dateStr: D.x4, startMin: 600 }));
    xfx.a5 = await bookOk(ids.uO, bi({ serviceId: ids.CUT, staffId: ids.boy, dateStr: D.x5, startMin: 600 }));
    xfx.a6 = await bookOk(ids.uO, bi({ serviceId: ids.CUT, staffId: ids.nun, dateStr: D.x6, startMin: 600 }));
    const w = await LN().createWalkIn(cS, { serviceId: ids.SCUT, staffId: ids.s1, channel: "STAFF" } as { serviceId: string; staffId: string | null; channel: "STAFF" }, { now: at(D.x7, "10:00") });
    ok(w.ok, `walk-in W0 ${fmt(w)}`);
    w0 = (w as { appointmentId: string }).appointmentId;
  } catch (e) { xPrepErr = errMsg(e); }
  const ten = (f: (i: number) => CallSpec): CallSpec[] => Array.from({ length: 10 }, (_, i) => f(i));
  const bk = (u: string, o: { serviceId: string; staffId: string | null; dateStr: string; startMin: number } & Partial<OnlineBookInput>): CallSpec => ({ fn: "book", ref: ref(u), input: bi(o), ip: newIp() });
  const idemX2 = rid("x2");
  const x2Input = bi({ serviceId: ids.CUT, staffId: ids.nun, dateStr: D.x2, startMin: 600, idempotencyKey: idemX2 });
  const X5_TIMES = [660, 720, 780, 840, 900, 960, 1020, 1080, 1110, 1140];
  const x0: Scenario = { key: "x0", calls: ten(() => ({ fn: "b3", ctx: cO, input: { serviceId: ids.CUT, staffId: ids.ek, dateStr: D.x0, startMin: 600, customerName: newName(), customerPhone: newPhone() } })) };
  const scenarios: Scenario[] = xPrepErr ? [x0] : [
    x0,
    { key: "x1", calls: ten(() => bk(ids.uO, { serviceId: ids.CUT, staffId: ids.ek, dateStr: D.x1, startMin: 600 })) },
    { key: "x2", calls: ten(() => ({ fn: "book", ref: ref(ids.uO), input: x2Input, ip: newIp() })) },
    { key: "x3", calls: ten(() => bk(ids.uO, { serviceId: ids.CUT, staffId: null, dateStr: D.x3, startMin: 600 })) },
    { key: "x4", calls: ten((i) => (i === 0
      ? { fn: "resched", token: xfx.a4.token, to: { dateStr: D.x4, startMin: 840, staffId: ids.ek }, ip: newIp() }
      : bk(ids.uO, { serviceId: ids.CUT, staffId: ids.ek, dateStr: D.x4, startMin: 840 }))) },
    { key: "x5", calls: ten((i) => ({ fn: "resched", token: xfx.a5.token, to: { dateStr: D.x5, startMin: X5_TIMES[i], staffId: ids.boy }, ip: newIp() })) },
    { key: "x6", calls: ten((i) => (i % 2 === 0
      ? { fn: "cancel", token: xfx.a6.token, ip: newIp() }
      : { fn: "resched", token: xfx.a6.token, to: { dateStr: D.x6, startMin: 660 + i * 45, staffId: ids.nun }, ip: newIp() })) },
    { key: "x7", calls: ten((i) => (i < 4 ? bk(ids.uS, { serviceId: ids.SCUT, staffId: ids.s2, dateStr: D.x7, startMin: 615 })
      : i < 6 ? bk(ids.uS, { serviceId: ids.SCUT, staffId: null, dateStr: D.x7, startMin: 615 })
        : i < 8 ? { fn: "walkin", ctx: cS, serviceId: ids.SCUT, now: at(D.x7, "10:00").toISOString() }
          : { fn: "move", ctx: cS, id: w0, to: ids.s2, now: at(D.x7, "10:00").toISOString() })) },
  ];
  let results = new Map<string, CallOut[]>();
  let harnessErr = "";
  const hasOnline = typeof onlineLoad.mod?.bookOnline === "function";
  // ไม่มีงาน/เตรียมฉากไม่ได้ ⇒ รันเฉพาะตัวควบคุม x0 (สายยิงพร้อมกันต้องทำงานก่อนมีงาน)
  if (setupOk && tplOk) {
    try { results = await runHarness(hasOnline ? scenarios : [x0], NCHILD); } catch (e) { harnessErr = errMsg(e); }
  } else harnessErr = "สร้างข้อมูล/แม่แบบไม่สำเร็จ";
  const R = (key: string): CallOut[] => {
    ok(!harnessErr, `สายยิงพร้อมกันล้ม: ${harnessErr}`);
    ok(key === "x0" || !xPrepErr, `เตรียมฉาก X ไม่สำเร็จ: ${xPrepErr}`);
    ok(hasOnline || key === "x0", `ยังไม่มี export bookOnline ใน «${F.online}»`);
    const r = results.get(key) ?? [];
    ok(r.length === 10, `${key}: ได้ผล ${r.length}/10 (ลูกโพรเซสตาย/หมดเวลา)`);
    const t = r.filter((x) => x.threw);
    ok(t.length === 0, `${key}: throw ${t.length} ครั้ง: ${t[0]?.threw}`);
    return r;
  };
  const summ = (r: CallOut[]) => ({ ok: r.filter((x) => x.ok).length, codes: r.filter((x) => !x.ok).map((x) => x.code ?? "?") });
  await st("X-0", "ตัวควบคุม: bookAppointment STAFF ของ B.3 10 ทางข้ามโพรเซส ช่องเดียว ⇒ สำเร็จ 1 · แถว 1 (สายยิงพร้อมกันทำงาน)", async () => {
    const r = R("x0");
    eq(summ(r).ok, 1, fmt(summ(r)));
    eq(await holdingAt(ids.ek, D.x0, 600), 1, "แถว");
  });
  await st("X-1", "จองออนไลน์ช่องเดียวกัน ช่างเดียวกัน 10 ทาง ⇒ สำเร็จ 1 · FULL 9 (ข้อความเดียวกัน) · แถวถือช่อง 1 · ไม่มี throw", async () => {
    const r = R("x1");
    const s = summ(r);
    eq([s.ok, s.codes.filter((c) => c === "FULL").length], [1, 9], fmt(s));
    eq(new Set(r.filter((x) => !x.ok).map((x) => x.reason)).size, 1, "ข้อความ FULL");
    eq(await holdingAt(ids.ek, D.x1, 600), 1, "แถว");
    eq(await overlapIn(ids.ek, D.x1), [], "ซ้อน");
  });
  await st("X-2", "idempotency key เดียว 10 ทางข้ามโพรเซส ⇒ สำเร็จทั้ง 10 · manageUrl เดียวกัน · แถว 1 · booking.created 1", async () => {
    const r = R("x2");
    eq(summ(r).ok, 10, fmt(summ(r)));
    eq(new Set(r.map((x) => x.url)).size, 1, "manageUrl");
    const row = await rowByKey(idemX2);
    eq(r[0].url, `/bq/m/${mg(row.id)}`, "ลิงก์ = HMAC(id)");
    eq((await evOf("booking.created", row.id)).length, 1, "event");
  });
  await st("X-3", "ใครก็ได้ 10 ทาง (ช่างที่รับออนไลน์ 3 คน) ⇒ สำเร็จ 3 คนละช่าง · FULL 7 · ไม่มีช่างซ้อน", async () => {
    const r = R("x3");
    const s = summ(r);
    eq([s.ok, s.codes.filter((c) => c === "FULL").length], [3, 7], fmt(s));
    const rows = await q<{ staffId: string }>(`SELECT "staffId" FROM "Appointment" WHERE "unitId" = $1 AND "startAt" = $2 AND status NOT IN ('CANCELLED','NO_SHOW')`, [ids.uO, at(D.x3, 600)]);
    eq(rows.map((x) => x.staffId).sort(), [ids.ek, ids.boy, ids.nun].sort(), "ช่าง");
  });
  await st("X-4", "ลูกค้าเลื่อนเข้าช่อง 14:00 ∥ ลูกค้าอื่นจองช่องเดียวกัน 9 ทาง ⇒ ช่องนั้นมีเจ้าของ 1 · ไม่มีซ้อน · เลื่อนสำเร็จ ⇔ จองทั้ง 9 FULL", async () => {
    const r = R("x4");
    const rs = r.find((x) => x.fn === "resched");
    ok(!!rs, "ไม่มีผลเลื่อน");
    const books = r.filter((x) => x.fn === "book");
    eq(await holdingAt(ids.ek, D.x4, 840), 1, "เจ้าของช่อง");
    eq(await overlapIn(ids.ek, D.x4), [], "ซ้อน");
    if (rs!.ok) eq(books.filter((x) => x.ok).length, 0, "เลื่อนได้แล้วยังจองได้");
    else eq([rs!.code, books.filter((x) => x.ok).length], ["FULL", 1], "เลื่อนแพ้");
    const a = await apRow(xfx.a4.row.id);
    eq(a.startAt.getTime() === at(D.x4, 840).getTime(), rs!.ok, "แถวนัดตรงผล");
  });
  await st("X-5", "เลื่อนนัดเดียว 10 ทางพร้อมกัน (เพดาน selfRescheduleMax 2) ⇒ สำเร็จ 2 พอดี · ที่เหลือ MAX_RESCHEDULE/LOST_RACE · rescheduleCount 2 · booking.rescheduled 2", async () => {
    const r = R("x5");
    const s = summ(r);
    eq(s.ok, 2, fmt(s));
    ok(s.codes.every((c) => c === "MAX_RESCHEDULE" || c === "LOST_RACE"), fmt(s.codes));
    eq((await apRow(xfx.a5.row.id)).rescheduleCount, 2, "rescheduleCount");
    eq((await evOf("booking.rescheduled", xfx.a5.row.id)).length, 2, "event");
    eq(await overlapIn(ids.boy, D.x5), [], "ซ้อน");
  });
  await st("X-6", "ยกเลิก 5 ∥ เลื่อน 5 นัดเดียวกัน ⇒ ยกเลิกสำเร็จ 1 · สถานะสุดท้าย CANCELLED · booking.cancelled 1 · rescheduleCount = จำนวนเลื่อนที่สำเร็จ (≤ 2)", async () => {
    const r = R("x6");
    const c = r.filter((x) => x.fn === "cancel");
    const m = r.filter((x) => x.fn === "resched");
    eq(c.filter((x) => x.ok).length, 1, `ยกเลิก ${fmt(summ(c))}`);
    const a = await apRow(xfx.a6.row.id);
    eq([a.status, a.cancelReason], ["CANCELLED", "CUSTOMER"], "สถานะ");
    eq((await evOf("booking.cancelled", a.id)).length, 1, "event cancelled");
    const nm = m.filter((x) => x.ok).length;
    ok(nm <= 2 && a.rescheduleCount === nm, `เลื่อนสำเร็จ ${nm} · count ${a.rescheduleCount}`);
  });
  await st("X-7", "หน่วยแถวเดียว: จองออนไลน์ 10:15 (ระบุช่าง 4 · ใครก็ได้ 2) ∥ walk-in 2 ∥ ย้าย walk-in มาช่างสอง 2 ⇒ ไม่มีแถวถือช่องซ้อนบนช่างใด · ไม่มี throw · รหัสอยู่ในชุดที่คาด", async () => {
    const r = R("x7");
    const bad = r.filter((x) => !x.ok && !(
      (x.fn === "book" && x.code === "FULL") || (x.fn === "walkin" && ["WALKIN_CLOSED", "BUSY"].includes(x.code ?? "")) ||
      (x.fn === "move" && ["FULL", "CLASH", "LOST_RACE", "BUSY", "BAD_STATE"].includes(x.code ?? ""))));
    ok(bad.length === 0, `รหัสนอกชุด ${fmt(bad.map((x) => [x.fn, x.code]))}`);
    for (const sid of [ids.s1, ids.s2]) eq(await overlapIn(sid, D.x7), [], `ซ้อน ${sid === ids.s1 ? "ช่างหนึ่ง" : "ช่างสอง"}`);
    ok(r.some((x) => x.fn === "book" && x.ok) || r.some((x) => x.fn === "move" && x.ok), "ไม่มีใครได้ช่อง (ตัวควบคุม)");
  });

  // ═══════════════ M ลิงก์จัดการนัด ═══════════════
  console.log("\n── M: ลิงก์จัดการนัด (loadManageView · X7 · snapshot) ──");
  const mv = async (t: unknown, o?: NowIp & { reschedule?: { date?: string; staff?: string }; lang?: string }): Promise<ManageView> => {
    const r = await MV(t, o);
    ok(r.ok, `loadManageView ${fmt(r)}`);
    return (r as { ok: true; view: ManageView }).view;
  };
  let m1: { row: ApptRow; token: string } | null = null;
  try { if (tplOk && hasOnline) m1 = await bookOk(ids.uO, bi({ serviceId: ids.CUT, staffId: ids.nun, dateStr: D.m, startMin: 840 })); } catch (e) { console.log(`  ⚠️ เตรียม M1: ${errMsg(e)}`); }
  const needM1 = () => { ok(!!m1, "เตรียมนัด M1 ไม่สำเร็จ (bookOnline)"); return m1!; };
  const M1_START = bkkMs(D.m, 840);
  await st("M-1", "มุมมองนัด: บริการ/ช่าง/เวลาเริ่ม-จบ(ไม่รวม buffer)/สถานะ/ราคา/มัดจำ/กติกาจาก snapshot/เลื่อนฟรีถึง/เหลือเลื่อน 2/ทำได้ทั้งยกเลิก+เลื่อน/icsPath", async () => {
    const { token } = needM1();
    const v = await mv(token);
    eq([v.serviceName, v.staffName, v.anyStaff, v.startMs, v.endMs, v.status, v.cancelReason], ["ตัดผมชาย", "ช่างนุ่น", false, M1_START, M1_START + 45 * MIN, "CONFIRMED", null], "นัด");
    eq([v.priceSatang, v.depositSatang, v.depositPaid, v.holdUntilMs], [25000, 0, false, null], "เงิน");
    eq(v.policy, { graceMin: 10, afterGrace: "RELEASE_REQUEUE", freeChangeBeforeMin: 180, selfRescheduleMax: 2, requireConfirm: false, depositMethod: "PROMPTPAY_SLIP", payWithinMin: 15, forfeitPct: 100 }, "policy");
    eq([v.freeUntilMs, v.rescheduleCount, v.rescheduleLeft, v.canCancel, v.canReschedule, v.cancelBlock, v.rescheduleBlock], [M1_START - 180 * MIN, 0, 2, true, true, null, null], "สิทธิ์");
    eq([v.icsPath, v.reschedule, v.unitName, v.locale], [`/bq/m/${token}/ics`, null, "สาขาออนไลน์", "th"], "อื่น");
  });
  await st("M-2", "snapshot ชนะค่าตั้งใหม่ (CC §1.6): ร้านแก้ freeChangeBeforeMin→60 + selfRescheduleMax→0 หลังจอง ⇒ นัดเดิมยัง 180/2 · ยกเลิกตอน −120 นาที ⇒ LATE_CHANGE (ตาม snapshot) · นัดใหม่เห็น 60/0", async () => {
    const { token } = needM1();
    const s = await SETTINGS().setSettings(OWNER, { tenantId: ids.tA }, [
      { key: "booking.late.freeChangeBeforeMin", scope: "UNIT", scopeId: ids.uO, value: 60 }, { key: "booking.late.selfRescheduleMax", scope: "UNIT", scopeId: ids.uO, value: 0 },
    ]);
    ok(s.ok, fmt(s));
    try {
      const v = await mv(token);
      eq([v.policy.freeChangeBeforeMin, v.policy.selfRescheduleMax, v.rescheduleLeft], [180, 2, 2], "snapshot");
      eq(failOf(await CN(token, { now: new Date(M1_START - 120 * MIN) }), "ยกเลิก −120").code, "LATE_CHANGE", "ยกเลิก −120");
      const nv = await VIEW(ids.uO, { svc: ids.CUT, staff: ids.ek });
      eq([nv.policy?.freeChangeBeforeMin, nv.policy?.selfRescheduleMax], [60, 0], "นัดใหม่");
    } finally {
      for (const key of ["booking.late.freeChangeBeforeMin", "booking.late.selfRescheduleMax"]) await SETTINGS().resetSetting(OWNER, { tenantId: ids.tA }, { key, scope: "UNIT", scopeId: ids.uO });
    }
    eq((await apRow(needM1().row.id)).status, "CONFIRMED", "แถวไม่เปลี่ยน");
  });
  await st("M-3", "ขอบเวลาฟรี (now ฉีด): now = freeUntil ⇒ ยกเลิก/เลื่อนได้ · now = freeUntil + 1 นาที ⇒ ไม่ได้ทั้งคู่ · cancelBlock/rescheduleBlock = LATE_CHANGE", async () => {
    const { token } = needM1();
    const a = await mv(token, { now: new Date(M1_START - 180 * MIN) });
    eq([a.canCancel, a.canReschedule, a.cancelBlock], [true, true, null], "ที่ขอบ");
    const b = await mv(token, { now: new Date(M1_START - 179 * MIN) });
    eq([b.canCancel, b.canReschedule, b.cancelBlock, b.rescheduleBlock], [false, false, "LATE_CHANGE", "LATE_CHANGE"], "เลยขอบ");
  });
  let mRev: { row: ApptRow; token: string } | null = null;
  let mWalk = "";
  try {
    if (tplOk && hasOnline) {
      mRev = await bookOk(ids.uO, bi({ serviceId: ids.CUT, staffId: ids.ek, dateStr: D.m, startMin: 600 }));
      await pool.query(`UPDATE "Appointment" SET "manageTokenHash" = NULL WHERE id = $1`, [mRev.row.id]);
      const w = await LN().createWalkIn(cS, { serviceId: ids.SCUT, staffId: null, channel: "STAFF" }, { now: at(D.m, "10:00") });
      if (w.ok) { mWalk = w.appointmentId; await pool.query(`UPDATE "Appointment" SET "manageTokenHash" = $2 WHERE id = $1`, [mWalk, sha256hex(mg(mWalk))]); }
    }
  } catch (e) { console.log(`  ⚠️ เตรียม M-4: ${errMsg(e)}`); }
  const BAD_TOKENS = (): [string, unknown][] => {
    const t = needM1().token;
    return [
      ["สุ่ม 43 ตัว", rand43()], ["ว่าง", ""], ["ไม่ใช่สตริง", 12345], ["null", null], ["แก้ตัวท้าย", `${t.slice(0, -1)}${t.endsWith("A") ? "B" : "A"}`],
      ["ยาว 44", `${t}A`], ["ตัวพิมพ์ใหญ่", t.toUpperCase() === t ? t.toLowerCase() : t.toUpperCase()],
      ["ลิงก์เช็กอินของนัดเดียวกัน", LINK().signLink({ tenantId: ids.tA, purpose: "booking.checkin", subjectId: needM1().row.id, expMin: 60 })],
      ["HMAC ป้ายอื่น", createHmac("sha256", `booking-ticket:v1:${SECRET}`).update(needM1().row.id).digest("base64url")],
      ["hash ที่เก็บ", sha256hex(t)], ["hash ถูกล้าง", mRev ? mRev.token : rand43()], ["นัด walk-in (มี hash)", mWalk ? mg(mWalk) : rand43()],
    ];
  };
  await st("M-4", "X7 token ใช้ไม่ได้ 12 แบบ (สุ่ม · ว่าง · ไม่ใช่สตริง · null · แก้ตัวท้าย · ยาว 44 · ตัวพิมพ์ · ลิงก์เช็กอิน · HMAC ป้ายอื่น · hash ที่เก็บ · hash ถูกล้าง · walk-in) ⇒ ดู/ยกเลิก/เลื่อน/.ics ได้คำตอบเดียวกันทุกไบต์ (NOT_FOUND · ics null)", async () => {
    needM1();
    ok(!!mRev && !!mWalk, "เตรียมนัด hash ถูกล้าง / walk-in ไม่สำเร็จ");
    const outs: unknown[] = [];
    for (const [, t] of BAD_TOKENS()) {
      outs.push([await MV(t), await CN(t), await RS(t, { dateStr: D.m, startMin: 960, staffId: ids.nun }), await ICS(t)]);
    }
    eq((outs[0] as unknown[])[0], { ok: false, code: "NOT_FOUND" }, "view");
    ok(((outs[0] as unknown[])[1] as { code?: string }).code === "NOT_FOUND" && (outs[0] as unknown[])[3] === null, `cancel/ics ${fmt(outs[0])}`);
    BAD_TOKENS().forEach(([what], i) => eq(outs[i], outs[0], what));
    eq([(await apRow(needM1().row.id)).status, (await apRow(mRev!.row.id)).status], ["CONFIRMED", "CONFIRMED"], "แถวไม่เปลี่ยน");
  });
  await st("M-5", "อายุลิงก์ = เวลานัด + 7 วัน (now ฉีด): +7 วัน −1 นาที ⇒ ดูได้ (ยกเลิกไม่ได้ LATE_CHANGE) · +7 วัน +1 นาที ⇒ NOT_FOUND ทั้งดูและยกเลิก (คำตอบเดียวกับ token สุ่ม)", async () => {
    const { token } = needM1();
    const a = await mv(token, { now: new Date(M1_START + 7 * 1440 * MIN - MIN) });
    eq([a.status, a.canCancel, a.cancelBlock], ["CONFIRMED", false, "LATE_CHANGE"], "ก่อนหมดอายุ");
    const late = new Date(M1_START + 7 * 1440 * MIN + MIN);
    eq(await MV(token, { now: late }), { ok: false, code: "NOT_FOUND" }, "หมดอายุ");
    eq(await CN(token, { now: late }), await CN(rand43(), { now: late }), "ยกเลิกหลังหมดอายุ = token สุ่ม");
  });
  await st("M-6", "X8 มุมมองนัด + .ics ไม่มีชื่อ/เบอร์/note ลูกค้า · ไม่มี id นัด/hash", async () => {
    const { token, row } = needM1();
    for (const s of [JSON.stringify(await mv(token)), String(await ICS(token))]) {
      eq(piiLeak(s), [], "PII");
      ok(!s.includes(row.id) && !s.includes(sha256hex(token)), "id/hash หลุด");
    }
  });
  await st("M-7", "manageLinkFor (ทางพนักงาน/B.9): นัด STAFF ที่ยังไม่มี hash ⇒ /bq/m/<HMAC(id)> + ตั้ง hash · เรียกซ้ำได้ค่าเดิม · ร้าน B / สาขาอื่น / walk-in / id สุ่ม ⇒ null · ลิงก์ใช้ดูได้", async () => {
    needTpl();
    const s = await BK().bookAppointment(cO, { serviceId: ids.CUT, staffId: ids.boy, dateStr: D.m, startMin: 600, channel: "STAFF", customerName: newName(), customerPhone: newPhone() });
    ok(s.ok, fmt(s));
    const id = (s as { id: string }).id;
    eq((await apRow(id)).manageTokenHash, null, "ก่อน");
    const L = ON.linkFor();
    eq(await L(cB, id), null, "ร้าน B");
    eq(await L(cO2, id), null, "สาขาอื่น");
    eq((await apRow(id)).manageTokenHash, null, "ร้านอื่นไม่ตั้ง hash");
    const u = await L(cO, id);
    eq(u, `/bq/m/${mg(id)}`, "ลิงก์");
    eq(await L(cO, id), u, "ซ้ำ");
    eq((await apRow(id)).manageTokenHash, sha256hex(mg(id)), "hash");
    ok(!!mWalk, "ไม่มี walk-in");
    eq([await L(cS, mWalk), await L(cO, rid("nope"))], [null, null], "walk-in/สุ่ม");
    TOKENS_USED.add(mg(id));
    eq((await mv(mg(id))).staffName, "ช่างบอย", "ดูได้");
  });
  await st("M-8", "สถานะอื่น: ร้านยกเลิก ⇒ CANCELLED · ทำอะไรไม่ได้ (BAD_STATE) · ดัดผมค้างมัดจำ ⇒ holdUntilMs/มัดจำ 300 · หมดเวลาจ่าย (expireDepositHolds) ⇒ CANCELLED + DEPOSIT_TIMEOUT", async () => {
    needTpl();
    const a = await bookOk(ids.uO, bi({ serviceId: ids.CUT, staffId: ids.boy, dateStr: D.m, startMin: 720 }));
    const sc = await BK().setAppointmentStatus(ids.tA, ids.uO, a.row.id, "CANCELLED");
    ok(sc.ok, fmt(sc));
    const v = await mv(a.token);
    eq([v.status, v.canCancel, v.canReschedule, v.cancelBlock, v.rescheduleBlock], ["CANCELLED", false, false, "BAD_STATE", "BAD_STATE"], "ร้านยกเลิก");
    eq(failOf(await RS(a.token, { dateStr: D.m, startMin: 780, staffId: ids.boy }), "เลื่อนนัดที่ยกเลิก").code, "BAD_STATE", "เลื่อน");
    eq(failOf(await CN(a.token), "ยกเลิกซ้ำ").code, "BAD_STATE", "ยกเลิก");
    const p = await bookOk(ids.uO, bi({ serviceId: ids.PERM, staffId: ids.ek, dateStr: D.m, startMin: 960 }));
    const pv = await mv(p.token);
    eq([pv.status, pv.depositSatang, pv.depositPaid], ["PENDING", 30000, false], "ค้างมัดจำ");
    ok(pv.holdUntilMs !== null && Math.abs(pv.holdUntilMs - (p.row.createdAt.getTime() + 15 * MIN)) < 5_000, `holdUntil ${pv.holdUntilMs}`);
    await pool.query(`UPDATE "Appointment" SET "createdAt" = $2 WHERE id = $1`, [p.row.id, new Date(Date.now() - 20 * MIN)]);
    await BK().expireDepositHolds(new Date());
    const ev = await mv(p.token);
    eq([ev.status, ev.cancelReason, ev.canCancel, ev.holdUntilMs], ["CANCELLED", "DEPOSIT_TIMEOUT", false, null], "หมดเวลาจ่าย");
  });

  // ═══════════════ R เลื่อน ═══════════════
  console.log("\n── R: ลูกค้าเลื่อนนัดเอง (rescheduleOnline) ──");
  let r1: { row: ApptRow; token: string } | null = null;
  try { if (tplOk && hasOnline) r1 = await bookOk(ids.uO, bi({ serviceId: ids.CUT, staffId: ids.ek, dateStr: D.r, startMin: 600 })); } catch (e) { console.log(`  ⚠️ เตรียม R1: ${errMsg(e)}`); }
  const needR1 = () => { ok(!!r1, "เตรียมนัด R1 ไม่สำเร็จ"); return r1!; };
  let icsBefore = "";
  await st("R-1", "เลื่อน 10:00 → 11:00 ช่างเดิม ⇒ ok · แถวเดิม (id/ลิงก์เดิม) startAt/endAt ใหม่ · rescheduleCount 1 · SPECIFIC · booking.rescheduled (คีย์ #id#startAt#staff · by CUSTOMER · fromStartAt · ไม่มี PII)", async () => {
    const { token, row } = needR1();
    icsBefore = String(await ICS(token));
    const r = await RS(token, { dateStr: D.r, startMin: 660, staffId: ids.ek });
    ok(r.ok, fmt(r));
    eq((r as { startMs?: number }).startMs, bkkMs(D.r, 660), "startMs");
    const a = await apRow(row.id);
    eq([a.startAt.getTime(), a.endAt.getTime(), a.rescheduleCount, a.staffId, a.assignMode, a.status, a.manageTokenHash], [bkkMs(D.r, 660), bkkMs(D.r, 705), 1, ids.ek, "SPECIFIC", "CONFIRMED", sha256hex(token)], "แถว");
    const e = await evOf("booking.rescheduled", row.id);
    eq(e.map((x) => x.idempotencyKey), [`booking.rescheduled#${row.id}#${at(D.r, 660).toISOString()}#${ids.ek}`], "event");
    eq([e[0].payload.by, e[0].payload.fromStartAt, e[0].payload.startAt], ["CUSTOMER", at(D.r, 600).toISOString(), at(D.r, 660).toISOString()], "payload");
    eq(piiLeak(JSON.stringify(e[0].payload)), [], "PII");
  });
  await st("R-2", "เลื่อนทับช่วงเดิมของตัวเอง (11:00 → 11:15) ⇒ ok (ไม่นับแถวตัวเอง) · ครั้งที่ 3 ⇒ MAX_RESCHEDULE แถวไม่เปลี่ยน", async () => {
    const { token, row } = needR1();
    const r = await RS(token, { dateStr: D.r, startMin: 675, staffId: ids.ek });
    ok(r.ok, `ทับตัวเอง ${fmt(r)}`);
    eq(failOf(await RS(token, { dateStr: D.r, startMin: 780, staffId: ids.ek }), "ครั้งที่ 3").code, "MAX_RESCHEDULE", "ครั้งที่ 3");
    const a = await apRow(row.id);
    eq([a.startAt.getTime(), a.rescheduleCount], [bkkMs(D.r, 675), 2], "แถว");
  });
  let r2: { row: ApptRow; token: string } | null = null;
  let rp: { row: ApptRow; token: string } | null = null;
  let rl: { row: ApptRow; token: string } | null = null;
  try {
    if (tplOk && hasOnline) {
      r2 = await bookOk(ids.uO, bi({ serviceId: ids.CUT, staffId: ids.nun, dateStr: D.r2, startMin: 600 }));
      rp = await bookOk(ids.uO, bi({ serviceId: ids.PERM, staffId: ids.nun, dateStr: D.r2, startMin: 780 }));
      rl = await bookOk(ids.uO, bi({ serviceId: ids.CUT, staffId: ids.nun, dateStr: D.r2, startMin: 1080 }));
      await BK().bookAppointment(cO, { serviceId: ids.CUT, staffId: ids.ek, dateStr: D.r2, startMin: 600, channel: "STAFF", customerName: newName(), customerPhone: newPhone() });
    }
  } catch (e) { console.log(`  ⚠️ เตรียม R-3: ${errMsg(e)}`); }
  await st("R-3", "เวลาใหม่ตรวจเหมือนจองใหม่: PAST · BEYOND_HORIZON · OFF_GRID · OUTSIDE_HOURS · LEAD_TIME (now ฉีด) · NOT_QUALIFIED · FULL (ชน = 0% ข้อความเดียวกัน) · NOT_FOUND (ช่างร้าน B / ช่างสาขาอื่น) · BAD_INPUT 3 แบบ · แถวไม่เปลี่ยนทุกกรณี", async () => {
    ok(!!r2 && !!rp && !!rl, "เตรียมนัด R-3 ไม่สำเร็จ");
    const c = async (t: string, to: { dateStr: string; startMin: number; staffId: string | null }, o?: NowIp) => failOf(await RS(t, to, o), `${to.dateStr} ${to.startMin} ${to.staffId}`);
    const got: [string, string][] = [
      ["PAST", (await c(r2!.token, { dateStr: TODAY, startMin: 0, staffId: ids.nun })).code],
      ["BEYOND_HORIZON", (await c(r2!.token, { dateStr: addDays(TODAY, 30), startMin: 600, staffId: ids.nun })).code],
      ["OFF_GRID", (await c(r2!.token, { dateStr: D.r2, startMin: 605, staffId: ids.nun })).code],
      ["OUTSIDE_HOURS", (await c(r2!.token, { dateStr: D.r2, startMin: 1260, staffId: ids.nun })).code],
      ["LEAD_TIME", (await c(rl!.token, { dateStr: D.r2, startMin: 645, staffId: ids.nun }, { now: at(D.r2, "10:00") })).code],
      ["NOT_QUALIFIED", (await c(rp!.token, { dateStr: D.r2, startMin: 900, staffId: ids.boy })).code],
      ["NOT_FOUND", (await c(r2!.token, { dateStr: D.r2, startMin: 660, staffId: ids.b1 })).code],
      ["NOT_FOUND", (await c(r2!.token, { dateStr: D.r2, startMin: 660, staffId: ids.a })).code],
      ["BAD_INPUT", (await c(r2!.token, { dateStr: "2026-13-40", startMin: 660, staffId: ids.nun })).code],
      ["BAD_INPUT", (await c(r2!.token, { dateStr: D.r2, startMin: 1500, staffId: ids.nun })).code],
      ["BAD_INPUT", (await c(r2!.token, { dateStr: D.r2, startMin: 660, staffId: 123 as unknown as string })).code],
    ];
    eq(got.map((g) => g[1]), got.map((g) => g[0]), "รหัส");
    const clash = await c(r2!.token, { dateStr: D.r2, startMin: 600, staffId: ids.ek });
    const zero = await c(r2!.token, { dateStr: D.r2, startMin: 660, staffId: ids.jack });
    eq([clash.code, zero.code, clash.reason === zero.reason], ["FULL", "FULL", true], "FULL ข้อความเดียว");
    for (const x of [r2!, rp!, rl!]) { const a = await apRow(x.row.id); eq([a.startAt.getTime(), a.rescheduleCount, a.staffId], [x.row.startAt.getTime(), 0, x.row.staffId], "แถวไม่เปลี่ยน"); }
  });
  await st("R-4", "เลยเวลาฟรี (now = เริ่ม − 179 นาที) ⇒ LATE_CHANGE แม้เวลาใหม่ว่าง · แถวไม่เปลี่ยน · ไม่มี event", async () => {
    ok(!!r2, "ไม่มี R2");
    eq(failOf(await RS(r2!.token, { dateStr: D.r2, startMin: 720, staffId: ids.nun }, { now: new Date(bkkMs(D.r2, 600 - 179)) }), "เลยเวลา").code, "LATE_CHANGE", "รหัส");
    eq([(await apRow(r2!.row.id)).startAt.getTime(), (await evOf("booking.rescheduled", r2!.row.id)).length], [bkkMs(D.r2, 600), 0], "แถว/event");
  });
  await st("R-5", "ร้านเดิม (ไม่เลือกแม่แบบ · selfRescheduleMax 0) ⇒ เลื่อนไม่ได้ MAX_RESCHEDULE · มุมมอง rescheduleLeft 0 · ยกเลิกยังทำได้ (freeChangeBeforeMin ค่าเริ่ม)", async () => {
    needTpl();
    const l = await bookOk(ids.uL, bi({ serviceId: ids.LCUT, staffId: ids.l1, dateStr: D.r, startMin: 600 }));
    eq(failOf(await RS(l.token, { dateStr: D.r, startMin: 720, staffId: ids.l1 }), "legacy").code, "MAX_RESCHEDULE", "เลื่อน");
    const v = await mv(l.token);
    eq([v.rescheduleLeft, v.canReschedule, v.rescheduleBlock, v.canCancel], [0, false, "MAX_RESCHEDULE", true], "มุมมอง");
    const c = await CN(l.token);
    ok(c.ok, fmt(c));
  }, "MAJOR");
  await st("R-6", "requireConfirm (snapshot) = true: ตัด+สระ PENDING → ร้านยืนยัน CONFIRMED → ลูกค้าเลื่อน ⇒ กลับ PENDING (ร้านยืนยันเวลาใหม่)", async () => {
    needTpl();
    const w = await bookOk(ids.uO, bi({ serviceId: ids.WASH, staffId: ids.ek, dateStr: D.r3, startMin: 600 }));
    eq(w.row.status, "PENDING", "จอง");
    const s = await BK().setAppointmentStatus(ids.tA, ids.uO, w.row.id, "CONFIRMED");
    ok(s.ok, fmt(s));
    const r = await RS(w.token, { dateStr: D.r3, startMin: 720, staffId: ids.ek });
    ok(r.ok, fmt(r));
    eq((await apRow(w.row.id)).status, "PENDING", "หลังเลื่อน");
  }, "MAJOR");
  await st("R-7", "นัดใครก็ได้ (ANY) เลื่อนด้วย staffId null ⇒ ok · assignMode ANY · ระบุช่าง ⇒ SPECIFIC", async () => {
    needTpl();
    const a = await bookOk(ids.uO, bi({ serviceId: ids.CUT, staffId: null, dateStr: D.r3, startMin: 840 }));
    eq(a.row.assignMode, "ANY", "จอง");
    const r = await RS(a.token, { dateStr: D.r3, startMin: 900, staffId: null });
    ok(r.ok, fmt(r));
    const x = await apRow(a.row.id);
    eq([x.assignMode, x.startAt.getTime()], ["ANY", bkkMs(D.r3, 900)], "ANY");
    const r2b = await RS(a.token, { dateStr: D.r3, startMin: 960, staffId: ids.nun });
    ok(r2b.ok, fmt(r2b));
    const y = await apRow(a.row.id);
    eq([y.assignMode, y.staffId], ["SPECIFIC", ids.nun], "SPECIFIC");
  }, "MAJOR");
  await st("R-8", "โควตา % ออนไลน์ไม่นับแถวตัวเอง: ช่างโควตา 10% (60 นาที/วัน) มีนัดออนไลน์ 45 นาที → เลื่อนในวันเดียวกัน ⇒ ok · ตัวควบคุม: จองใหม่อีก 45 นาทีวันนั้น ⇒ FULL", async () => {
    needTpl();
    const a = await bookOk(ids.uO2, bi({ serviceId: ids.O2CUT, staffId: ids.qq, dateStr: D.r4, startMin: 600 }));
    const ctl = await ON.book()(ref(ids.uO2), bi({ serviceId: ids.O2CUT, staffId: ids.qq, dateStr: D.r4, startMin: 960 }), { ip: newIp() });
    eq(ctl.ok ? "OK" : ctl.code, "FULL", "ตัวควบคุม (โควตาเต็ม)");
    const r = await RS(a.token, { dateStr: D.r4, startMin: 840, staffId: ids.qq });
    ok(r.ok, `เลื่อน ${fmt(r)}`);
  });
  await st("R-9", "มัดจำที่จ่ายแล้วติดไปกับนัด: ดัดผม (จ่ายแล้ว) เลื่อน ⇒ id/hash/depositPaidAt/depositSatang เดิม", async () => {
    ok(!!rp, "ไม่มี RP");
    const paid = new Date(Date.now() - 60_000);
    await pool.query(`UPDATE "Appointment" SET "depositPaidAt" = $2, status = 'CONFIRMED' WHERE id = $1`, [rp!.row.id, paid]);
    const r = await RS(rp!.token, { dateStr: D.r2, startMin: 900, staffId: ids.nun });
    ok(r.ok, fmt(r));
    const a = await apRow(rp!.row.id);
    eq([a.depositPaidAt?.getTime(), a.depositSatang, a.manageTokenHash, a.startAt.getTime()], [paid.getTime(), 30000, sha256hex(rp!.token), bkkMs(D.r2, 900)], "แถว");
    eq((await mv(rp!.token)).depositPaid, true, "มุมมอง");
  }, "MAJOR");
  await st("R-10", "findSlots opt excludeAppointmentId: ช่องของนัดตัวเองว่างเมื่อยกเว้น · ไม่ส่ง opt ⇒ ผลเดิม (เท่ากับ opts ว่าง)", async () => {
    ok(!!r2, "ไม่มี R2");
    const q0 = { serviceId: ids.CUT, staffId: ids.nun, dateStr: D.r2, channel: "ONLINE" as const };
    const base = (await BK().findSlots(cO, q0)).map((s) => s.startMin);
    const ex = (await BK().findSlots(cO, q0, { excludeAppointmentId: r2!.row.id })).map((s) => s.startMin);
    ok(!base.includes(600) && ex.includes(600), `base ${base.includes(600)} ex ${ex.includes(600)}`);
    eq((await BK().findSlots(cO, q0, {})).map((s) => s.startMin), base, "opts ว่าง");
  }, "MAJOR");

  // ═══════════════ C ยกเลิก ═══════════════
  console.log("\n── C: ลูกค้ายกเลิกเอง (cancelOnline) ──");
  let c1: { row: ApptRow; token: string } | null = null;
  try { if (tplOk && hasOnline) c1 = await bookOk(ids.uO, bi({ serviceId: ids.CUT, staffId: ids.ek, dateStr: D.c, startMin: 600 })); } catch (e) { console.log(`  ⚠️ เตรียม C1: ${errMsg(e)}`); }
  await st("C-1", "เลยเวลาฟรี (−179 นาที) ⇒ LATE_CHANGE · แถว CONFIRMED · ไม่มี booking.cancelled", async () => {
    ok(!!c1, "ไม่มี C1");
    eq(failOf(await CN(c1!.token, { now: new Date(bkkMs(D.c, 600 - 179)) }), "เลยเวลา").code, "LATE_CHANGE", "รหัส");
    eq([(await apRow(c1!.row.id)).status, (await evOf("booking.cancelled", c1!.row.id)).length], ["CONFIRMED", 0], "แถว/event");
  });
  await st("C-2", "ในเวลาฟรี ⇒ ok · CANCELLED + cancelReason CUSTOMER · booking.cancelled 1 (คีย์ booking.cancelled#id · reason CUSTOMER · depositPaid false · ไม่มี PII) · ช่องกลับมาว่าง · ยกเลิกซ้ำ ⇒ BAD_STATE event ไม่ซ้ำ", async () => {
    ok(!!c1, "ไม่มี C1");
    const r = await CN(c1!.token);
    ok(r.ok, fmt(r));
    const a = await apRow(c1!.row.id);
    eq([a.status, a.cancelReason], ["CANCELLED", "CUSTOMER"], "แถว");
    const e = await evOf("booking.cancelled", a.id);
    eq(e.map((x) => x.idempotencyKey), [`booking.cancelled#${a.id}`], "event");
    eq([e[0].payload.reason, e[0].payload.depositPaid], ["CUSTOMER", false], "payload");
    eq(piiLeak(JSON.stringify(e[0].payload)), [], "PII");
    ok((await BK().findSlots(cO, { serviceId: ids.CUT, staffId: ids.ek, dateStr: D.c, channel: "ONLINE" })).some((s) => s.startMin === 600), "ช่องไม่ว่างคืน");
    eq(failOf(await CN(c1!.token), "ซ้ำ").code, "BAD_STATE", "ซ้ำ");
    eq((await evOf("booking.cancelled", a.id)).length, 1, "event ไม่ซ้ำ");
  });
  await st("C-3", "มัดจำจ่ายแล้วยกเลิกในเวลาฟรี ⇒ ok · payload depositPaid true + depositSatang 30000 (จุดต่อ B.8 คืนเงิน) · ค้างมัดจำ (ยังไม่จ่าย) ยกเลิกได้", async () => {
    needTpl();
    const p = await bookOk(ids.uO, bi({ serviceId: ids.PERM, staffId: ids.nun, dateStr: D.c, startMin: 780 }));
    await pool.query(`UPDATE "Appointment" SET "depositPaidAt" = now(), status = 'CONFIRMED' WHERE id = $1`, [p.row.id]);
    ok((await CN(p.token)).ok, "ยกเลิกจ่ายแล้ว");
    const e = await evOf("booking.cancelled", p.row.id);
    eq([e.length, e[0]?.payload.depositPaid, e[0]?.payload.depositSatang], [1, true, 30000], "payload");
    const h = await bookOk(ids.uO, bi({ serviceId: ids.PERM, staffId: ids.ek, dateStr: D.c, startMin: 900 }));
    eq(h.row.status, "PENDING", "ค้างมัดจำ");
    ok((await CN(h.token)).ok, "ยกเลิกค้างมัดจำ");
    eq((await apRow(h.row.id)).status, "CANCELLED", "สถานะ");
  }, "MAJOR");

  // ═══════════════ I .ics ═══════════════
  console.log("\n── I: เพิ่มลงปฏิทินมือถือ (.ics) ──");
  const icsUtc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const unfold = (s: string) => s.replace(/\r\n[ \t]/g, "");
  await st("I-1", "ics ของนัด: VCALENDAR/VEVENT · DTSTART/DTEND = เริ่ม/จบ (UTC Z) · UID appt-<hash16>@shark.in.th · SEQUENCE 0 · STATUS CONFIRMED · SUMMARY มีบริการ · DESCRIPTION มีลิงก์จัดการนัด · บรรทัดจบ CRLF ทุกบรรทัด", async () => {
    const { token } = needM1();
    const s = await ICS(token);
    ok(typeof s === "string" && s.length > 0, `ics ${fmt(s)}`);
    const raw = s as string;
    ok(!/[^\r]\n/.test(raw) && raw.endsWith("\r\n"), "ไม่ใช่ CRLF");
    const u = unfold(raw);
    for (const need of ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", `DTSTART:${icsUtc(M1_START)}`, `DTEND:${icsUtc(M1_START + 45 * MIN)}`, `UID:appt-${sha256hex(token).slice(0, 16)}@shark.in.th`, "SEQUENCE:0", "STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR"]) {
      ok(u.split("\r\n").includes(need), `ไม่มีบรรทัด ${need}`);
    }
    ok(/^SUMMARY:.*ตัดผมชาย/m.test(u), "SUMMARY");
    ok(u.includes(`/bq/m/${token}`), "DESCRIPTION ลิงก์");
  }, "MAJOR");
  await st("I-2", "หลังเลื่อน 2 ครั้ง: UID เดิม · SEQUENCE 2 · DTSTART เวลาใหม่ · ยกเลิกแล้ว ⇒ STATUS:CANCELLED", async () => {
    const { token } = needR1();
    const u = unfold(String(await ICS(token)));
    const uid = (x: string) => /^UID:.*$/m.exec(x)?.[0] ?? "";
    ok(!!icsBefore && uid(unfold(icsBefore)) === uid(u) && uid(u) !== "", "UID เปลี่ยน");
    ok(u.includes("SEQUENCE:2") && u.includes(`DTSTART:${icsUtc(bkkMs(D.r, 675))}`), "SEQUENCE/DTSTART");
    ok(!!c1, "ไม่มี C1");
    ok(unfold(String(await ICS(c1!.token))).includes("STATUS:CANCELLED"), "CANCELLED");
  }, "MAJOR");

  // ═══════════════ RL rate limit ═══════════════
  console.log("\n── RL: rate limit (checkRateLimitDb · นับก่อนค้นฐาน) ──");
  await st("RL-1", "ONLINE_RATE = ค่าคงที่ของใบสั่ง §3.6", () => {
    eq(onlineLoad.mod?.ONLINE_RATE, { book: { limit: 10, windowMs: 60000 }, view: { limit: 60, windowMs: 60000 }, manageIp: { limit: 60, windowMs: 600000 }, manageToken: { limit: 10, windowMs: 600000 } }, "ONLINE_RATE");
  }, "MAJOR");
  await st("RL-2", "จอง: IP เดียว 11 ครั้ง (ข้อมูลผิดก็นับ) ⇒ 10 ครั้งแรกไม่ RATE_LIMITED · ครั้งที่ 11 RATE_LIMITED · IP อื่น ⇒ ไม่ติด", async () => {
    needTpl();
    const ip = newIp();
    const codes: string[] = [];
    for (let i = 0; i < 11; i++) { const r = await ON.book()(ref(ids.uL), { serviceId: "nope", staffId: null, dateStr: D.rl, startMin: 600, name: "x", phone: "0800000000" }, { ip }); codes.push(r.ok ? "OK" : r.code); }
    ok(codes.slice(0, 10).every((c) => c !== "RATE_LIMITED") && codes[10] === "RATE_LIMITED", fmt(codes));
    const o = await ON.book()(ref(ids.uL), { serviceId: "nope", staffId: null, dateStr: D.rl, startMin: 600, name: "x", phone: "0800000000" }, { ip: newIp() });
    ok(!o.ok && o.code !== "RATE_LIMITED", fmt(o));
  });
  await st("RL-3", "ลิงก์จัดการนัด ต่อ token: ยกเลิก 10 ครั้ง (เลยเวลาฟรี · คนละ IP) ⇒ LATE_CHANGE · ครั้งที่ 11 ⇒ RATE_LIMITED · ข้ามหน้าต่าง 10 นาที (now ฉีด) ⇒ กลับมา LATE_CHANGE", async () => {
    needTpl();
    const a = await bookOk(ids.uO, bi({ serviceId: ids.CUT, staffId: ids.nun, dateStr: D.rl, startMin: 600 }));
    const late = new Date(bkkMs(D.rl, 600 - 60));
    const codes: string[] = [];
    for (let i = 0; i < 11; i++) { const r = await CN(a.token, { now: late }); codes.push(r.ok ? "OK" : r.code); }
    eq(codes, [...Array(10).fill("LATE_CHANGE"), "RATE_LIMITED"], "ลำดับ");
    const r = await CN(a.token, { now: new Date(late.getTime() + 11 * MIN) });
    eq(r.ok ? "OK" : r.code, "LATE_CHANGE", "หน้าต่างใหม่");
  });
  await st("RL-4", "ลิงก์จัดการนัด ต่อ IP: token สุ่ม 60 ครั้ง IP เดียว ⇒ NOT_FOUND · ครั้งที่ 61 ⇒ RATE_LIMITED · IP อื่น ⇒ NOT_FOUND · ข้ามหน้าต่าง ⇒ NOT_FOUND", async () => {
    needTpl();
    const ip = newIp();
    const t0 = new Date();
    const codes: string[] = [];
    for (let i = 0; i < 61; i++) { const r = await ON.mview()(rand43(), { ip, now: t0 }); codes.push(r.ok ? "OK" : r.code); }
    eq([codes.slice(0, 60).every((c) => c === "NOT_FOUND"), codes[60]], [true, "RATE_LIMITED"], "ลำดับ");
    eq(await ON.mview()(rand43(), { ip: newIp(), now: t0 }), { ok: false, code: "NOT_FOUND" }, "IP อื่น");
    eq(await ON.mview()(rand43(), { ip, now: new Date(t0.getTime() + 11 * MIN) }), { ok: false, code: "NOT_FOUND" }, "หน้าต่างใหม่");
  });
  await st("RL-5", "หน้าจอง ต่อ IP: 60 ครั้ง ⇒ ok · ครั้งที่ 61 ⇒ RATE_LIMITED", async () => {
    needTpl();
    const ip = newIp();
    const res: string[] = [];
    for (let i = 0; i < 61; i++) { const r = await ON.view()(ref(ids.uL), {}, { ip }); res.push(r.ok ? "OK" : r.code); }
    eq([res.slice(0, 60).every((c) => c === "OK"), res[60]], [true, "RATE_LIMITED"], "ลำดับ");
  }, "MAJOR");

  // ═══════════════ K ตู้ (หนี้ B.6 §9) ═══════════════
  console.log("\n── K: ตู้ \"จองวันอื่นล่วงหน้า\" (หนี้ B.6 §9) ──");
  await st("K-1", "loadKioskView.bookUrl = /s/<tenantSlug>/<unitSlug> · Kiosk หน้าแรกมี QR data-kiosk-book-qr ที่ data-href = bookUrl", async () => {
    needTpl();
    const lk = pubLoad.mod?.loadKioskView;
    ok(typeof lk === "function", "ไม่มี loadKioskView");
    const v = await lk!(KQ_TOKEN, { now: at(D.u, "11:00") });
    ok(!!v, "kiosk view null");
    eq(v!.bookUrl, `/s/${SLUGS[ids.tA]}/${SLUGS[ids.uS]}`, "bookUrl");
    const h = render(KioskC, { view: v, actions: { checkIn: noop2, walkIn: noop2 } });
    const qr = boxes(h, "data-kiosk-book-qr");
    ok(qr.length >= 1 && qr.every((b) => b.attrs["data-href"] === v!.bookUrl), `QR ${fmt(qr.map((b) => b.attrs["data-href"]))}`);
  }, "MINOR");

  // ═══════════════ U DOM ═══════════════
  console.log("\n── U: คอมโพเนนต์ (renderToStaticMarkup · สัญญา DOM §4) ──");
  const bkHtml = async (u: string, qy: OnlineQuery, idem = "idem-u") => {
    const v = await VIEW(u, qy);
    return { v, h: render(BookingC, { view: v, basePath: `/s/${SLUGS[ids.tA]}/${SLUGS[u]}`, query: qy, idempotencyKey: idem }) };
  };
  const hrefHas = (b: { attrs: Record<string, string> }, part: string) => { try { return decodeURIComponent(b.attrs.href ?? "").includes(part); } catch { return false; } };
  await st("U-1", "ขั้น 1: ราก data-bk-online data-step=1 data-locale=th · การ์ดบริการ <a data-bk-service> ตามลำดับ (href มี svc=<id>) · ป้ายมัดจำเฉพาะดัดผม · ไม่มี data-bk-identity · มีตัวตน ⇒ แถบชื่อ + เบอร์ปิด (ไม่มีเบอร์เต็ม)", async () => {
    needTpl();
    const { h } = await bkHtml(ids.uO, {});
    const root = boxes(h, "data-bk-online")[0];
    ok(!!root && root.attrs["data-step"] === "1" && root.attrs["data-locale"] === "th", `root ${fmt(root?.attrs)}`);
    const sv = boxes(h, "data-bk-service");
    eq(sv.map((b) => b.attrs["data-bk-service"]), [ids.CUT, ids.WASH, ids.PERM], "บริการ");
    ok(sv.every((b) => b.tag === "a" && hrefHas(b, `svc=${b.attrs["data-bk-service"]}`)), "ลิงก์ svc");
    eq(sv.map((b) => b.html.includes("data-bk-deposit")), [false, false, true], "ป้ายมัดจำ");
    eq(boxes(h, "data-bk-identity").length, 0, "identity");
    const w = (await bkHtml(ids.uO, { who: whoOk() })).h;
    const idb = boxes(w, "data-bk-identity");
    ok(idb.length === 1 && textOf(idb[0].html).includes("4417") && textOf(idb[0].html).includes(PARTY1.name), "แถบตัวตน");
    ok(!w.includes(PARTY1.phone), "เบอร์เต็มหลุด");
  });
  await st("U-2", "ขั้น 2: ช่าง <a data-bk-staff> any + ช่างในรายการ (ตัวที่เลือก data-on) · วัน data-bk-day ครบ (ปิด = data-closed ไม่ใช่ลิงก์) · เวลา data-bk-time ตามลำดับ view.times (free=1 = ลิงก์ time=HH:MM · free=0 ไม่ใช่ลิงก์)", async () => {
    needTpl();
    const { v, h } = await bkHtml(ids.uO, { svc: ids.CUT, staff: ids.ek, date: D.u });
    eq(boxes(h, "data-bk-staff").map((b) => b.attrs["data-bk-staff"]), ["any", ids.ek, ids.boy, ids.nun], "ช่าง");
    eq(boxes(h, "data-bk-staff").filter((b) => "data-on" in b.attrs).map((b) => b.attrs["data-bk-staff"]), [ids.ek], "data-on");
    const days = boxes(h, "data-bk-day");
    eq(days.map((b) => b.attrs["data-bk-day"]), v.days.map((d) => d.dateStr), "วัน");
    const mon = days.find((b) => b.attrs["data-bk-day"] === MONDAY);
    ok(!!mon && "data-closed" in mon.attrs && mon.tag !== "a", "วันจันทร์");
    const tm = boxes(h, "data-bk-time");
    eq(tm.map((b) => b.attrs["data-bk-time"]), v.times.map((t) => t.hhmm), "เวลา");
    ok(v.times.some((t) => !t.free), "ฉากต้องมีเวลาเต็ม (PC-2 จอง 10:00)");
    tm.forEach((b, i) => {
      const t = v.times[i];
      eq(b.attrs["data-free"], t.free ? "1" : "0", `data-free ${t.hhmm}`);
      if (t.free) ok(b.tag === "a" && hrefHas(b, `time=${t.hhmm}`), `ลิงก์ ${t.hhmm}`);
      else ok(b.tag !== "a", `เต็มแต่เป็นลิงก์ ${t.hhmm}`);
    });
  });
  await st("U-3", "ขั้น 3 (ตัดผมชาย ไม่มีมัดจำ): data-bk-summary data-start · กติกามีเลขผ่อนผัน 10 + เวลาเลื่อนฟรีถึง · ไม่มีช่องมัดจำ · ฟอร์มมีชื่อ/เบอร์ + hidden idempotencyKey = prop · ไม่มี note · ปุ่ม data-bk-submit", async () => {
    needTpl();
    const { v, h } = await bkHtml(ids.uO, { svc: ids.CUT, staff: ids.ek, date: D.u, time: "11:00" }, "idem-u3");
    eq(boxes(h, "data-bk-summary")[0]?.attrs["data-start"], String(v.summary?.startMs), "summary");
    const pol = textOf(boxes(h, "data-bk-policy")[0]?.html ?? "");
    ok(/\b10\b/.test(pol) && pol.includes(hhmmOfMs(v.summary?.freeUntilMs)), `กติกา: ${pol.slice(0, 120)}`);
    eq(["data-bk-deposit-now", "data-bk-pay-at-shop", "data-bk-deposit-slot"].map((a) => boxes(h, a).length), [0, 0, 0], "ไม่มีมัดจำ");
    const form = boxes(h, "data-bk-confirm-form")[0];
    ok(!!form, "ไม่มีฟอร์ม");
    const ins = inputsOf(form.html);
    ok(ins.some((x) => x.name === "name") && ins.some((x) => x.name === "phone"), "ชื่อ/เบอร์");
    ok(ins.some((x) => x.name === "idempotencyKey" && x.type === "hidden" && x.value === "idem-u3"), "idempotencyKey");
    ok(!ins.some((x) => x.name === "note"), "note");
    ok(boxes(h, "data-bk-submit").length === 1, "submit");
  });
  await st("U-4", "ขั้น 3 ดัดผม: data-bk-deposit-now data-satang=30000 · data-bk-pay-at-shop 120000 · data-bk-deposit-slot (B.8) · ตัด+สระ: textarea[name=note] · มีตัวตน: ไม่มีช่องชื่อ/เบอร์", async () => {
    needTpl();
    const p = (await bkHtml(ids.uO, { svc: ids.PERM, staff: ids.nun, date: D.u, time: "15:30" })).h;
    eq([boxes(p, "data-bk-deposit-now")[0]?.attrs["data-satang"], boxes(p, "data-bk-pay-at-shop")[0]?.attrs["data-satang"], boxes(p, "data-bk-deposit-slot").length], ["30000", "120000", 1], "มัดจำ");
    const w = (await bkHtml(ids.uO, { svc: ids.WASH, staff: ids.ek, date: D.u, time: "14:00" })).h;
    ok(inputsOf(boxes(w, "data-bk-confirm-form")[0]?.html ?? "").some((x) => x.name === "note" && x.tag === "textarea"), "note");
    const i = (await bkHtml(ids.uO, { svc: ids.CUT, staff: ids.ek, date: D.u, time: "11:00", who: whoOk() })).h;
    const ins = inputsOf(boxes(i, "data-bk-confirm-form")[0]?.html ?? "");
    ok(!ins.some((x) => x.name === "name" || x.name === "phone") && boxes(i, "data-bk-identity").length === 1, "ตัวตน");
  });
  await st("U-5", "ภาษาอังกฤษ: สาขาชื่ออังกฤษล้วน lang=en ขั้น 1/2/3 ⇒ data-locale=en และไม่มีอักษรไทยในข้อความทั้งหน้า · lang=th ⇒ มีอักษรไทย", async () => {
    needTpl();
    for (const qy of [{ lang: "en" }, { lang: "en", svc: ids.ECUT, staff: ids.e1, date: D.u }, { lang: "en", svc: ids.EPERM, staff: ids.e1, date: D.u, time: "11:00" }] as OnlineQuery[]) {
      const { v, h } = await bkHtml(ids.uE, qy);
      eq(boxes(h, "data-bk-online")[0]?.attrs["data-locale"], "en", "locale");
      const th = textOf(h).match(/[฀-๿]+/g);
      ok(!th, `ขั้น ${v.step}: มีอักษรไทย ${fmt(th?.slice(0, 4))}`);
    }
    ok(THAI.test(textOf((await bkHtml(ids.uE, { lang: "th", svc: ids.ECUT })).h)), "th ไม่มีไทย");
  }, "MAJOR");
  const mcHtml = (v: ManageView, token: string, extra?: Record<string, unknown>) => render(ManageC, { view: v, token, actions: { cancel: noop1, reschedule: noop1 }, ...(extra ?? {}) });
  await st("U-6", "ManageCard ทำได้: data-bk-manage data-status · data-bk-manage-when data-start · ฟอร์ม data-bk-cancel + ปุ่ม · ลิงก์ data-bk-reschedule (r=1) · data-bk-ics = icsPath · ไม่มี data-bk-late · ไม่มี PII · at ⇒ ทุกฟอร์มมี hidden at · ไม่ส่ง ⇒ ไม่มี", async () => {
    const { token } = needM1();
    const v = await mv(token);
    const h = mcHtml(v, token);
    const root = boxes(h, "data-bk-manage")[0];
    ok(!!root && root.attrs["data-status"] === "CONFIRMED", `root ${fmt(root?.attrs)}`);
    eq(boxes(h, "data-bk-manage-when")[0]?.attrs["data-start"], String(M1_START), "when");
    const cf = boxes(h, "data-bk-cancel").filter((b) => b.tag === "form");
    ok(cf.length === 1 && cf[0].html.includes("data-bk-cancel-btn"), "ฟอร์มยกเลิก");
    const rl2 = boxes(h, "data-bk-reschedule");
    ok(rl2.length === 1 && rl2[0].tag === "a" && hrefHas(rl2[0], "r=1"), "ลิงก์เลื่อน");
    eq(boxes(h, "data-bk-ics")[0]?.attrs.href, v.icsPath, "ics");
    eq([boxes(h, "data-bk-late").length, piiLeak(h)], [0, []], "late/PII");
    ok(!inputsOf(h).some((x) => x.name === "at"), "at โดยไม่ส่ง");
    const ha = mcHtml(v, token, { at: "2031-01-01T03:00:00.000Z" });
    const forms = boxes(ha, "action").filter((b) => /^<form\b/.test(b.html));
    ok(forms.length >= 1 && forms.every((f) => inputsOf(f.html).some((x) => x.name === "at" && x.type === "hidden" && x.value === "2031-01-01T03:00:00.000Z")), "at ทุกฟอร์ม");
  });
  await st("U-7", "ManageCard เลยเวลาฟรี: ไม่มีฟอร์มยกเลิก/ลิงก์เลื่อน · data-bk-late data-code=LATE_CHANGE · ยังมีลิงก์ .ics", async () => {
    const { token } = needM1();
    const h = mcHtml(await mv(token, { now: new Date(M1_START - 60 * MIN) }), token);
    eq([boxes(h, "data-bk-cancel").filter((b) => b.tag === "form").length, boxes(h, "data-bk-reschedule").length], [0, 0], "ปุ่ม");
    eq(boxes(h, "data-bk-late")[0]?.attrs["data-code"], "LATE_CHANGE", "late");
    eq(boxes(h, "data-bk-ics").length, 1, "ics");
  });
  await st("U-8", "ManageCard โหมดเลื่อน: view.reschedule ≠ null · ฟอร์ม data-bk-reschedule-form = จำนวนเวลา free · แต่ละฟอร์มมี hidden date/startMin/staffId · ไม่มีลิงก์ data-bk-reschedule", async () => {
    const { token } = needM1();
    const v = await mv(token, { reschedule: { date: D.m } });
    ok(!!v.reschedule && v.reschedule.dateSel === D.m, `reschedule ${fmt(v.reschedule)}`);
    const free = v.reschedule!.times.filter((t) => t.free);
    const want = (await BK().findSlots(cO, { serviceId: ids.CUT, staffId: ids.nun, dateStr: D.m, channel: "ONLINE" }, { excludeAppointmentId: needM1().row.id })).map((s) => s.startMin);
    if (v.reschedule!.staffSel === ids.nun) eq(free.map((t) => t.startMin), want, "free = findSlots (exclude ตัวเอง)");
    const h = mcHtml(v, token);
    const fs = boxes(h, "data-bk-reschedule-form").filter((b) => b.tag === "form");
    eq(fs.length, free.length, "จำนวนฟอร์ม");
    ok(fs.every((f) => { const n = inputsOf(f.html).map((x) => x.name); return n.includes("date") && n.includes("startMin") && n.includes("staffId"); }), "hidden");
    eq(boxes(h, "data-bk-reschedule").filter((b) => b.tag === "a").length, 0, "ลิงก์เลื่อน");
  });
  await st("U-9", "ManageCard ค้างมัดจำ: data-bk-deposit-slot (B.8 ใส่ QR) · err=รหัส ⇒ แสดงข้อความจาก dict (ไม่แสดงรหัสดิบ)", async () => {
    needTpl();
    const p = await bookOk(ids.uO, bi({ serviceId: ids.PERM, staffId: ids.ek, dateStr: D.u, startMin: 960 }));
    const v = await mv(p.token);
    ok(v.holdUntilMs !== null, "ไม่ถือช่อง");
    const h = mcHtml(v, p.token, { err: "LATE_CHANGE" });
    eq(boxes(h, "data-bk-deposit-slot").length, 1, "deposit slot");
    ok(!textOf(h).includes("LATE_CHANGE"), "รหัสดิบ");
  }, "MAJOR");

  // ═══════════════ H server จริง ═══════════════
  console.log("\n── H: server จริง (QC_BASE) ──");
  const BASE = (process.env.QC_BASE ?? "").replace(/\/+$/, "");
  const H_IDS = ["H-1", "H-2", "H-3", "H-4", "H-5"] as const;
  const H_NAMES: Record<(typeof H_IDS)[number], string> = {
    "H-1": "GET หน้าร้าน ขั้น 2/3 ⇒ 200 data-bk-online · ไม่มี PII · มี who ⇒ referrer no-referrer + noindex",
    "H-2": "POST /api/store/<t>/<u>/book ⇒ 200 { ok, manageUrl } · ไม่มี PII/id · GET manageUrl ⇒ 200 data-bk-manage + meta noindex/no-referrer",
    "H-3": "X7 GET /bq/m/<token เสีย 5 แบบ> ⇒ 404 ทุกตัว · ไม่มีชื่อสาขาใน body · GET /bq/m/<t>/ics ⇒ 200 text/calendar no-store · token เสีย ⇒ 404",
    "H-4": "GET /api/store/<t>/<u>/slots = findSlots ONLINE (ช่างเอก) · ช่างแจ๊ค (0%) ⇒ []",
    "H-5": "rate limit จริงข้ามคำขอ: POST book IP เดียว (x-forwarded-for) ครั้งที่ 11 ⇒ 429",
  };
  let hReady = "";
  if (!BASE) hReady = "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + เปิด server แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port>";
  else if (!tplOk || !hasOnline) hReady = "ข้อมูล/งานของใบยังไม่พร้อม";
  else {
    const ping = await fetch(`${BASE}/`, { redirect: "manual", signal: AbortSignal.timeout(8_000) }).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))));
    if (ping instanceof Error) hReady = `ต่อ ${BASE} ไม่ได้ (${ping.message.slice(0, 80)})`;
  }
  if (hReady) for (const id of H_IDS) skip(id, H_NAMES[id], hReady, "MAJOR");
  else {
    const get = async (path: string, ip = newIp()) => {
      const r = await fetch(`${BASE}${path}`, { headers: { "x-forwarded-for": ip }, redirect: "manual", signal: AbortSignal.timeout(60_000) });
      return { status: r.status, html: await r.text(), ct: r.headers.get("content-type") ?? "", cc: r.headers.get("cache-control") ?? "" };
    };
    const post = async (path: string, body: unknown, ip = newIp()) => {
      const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
      return { status: r.status, text: await r.text() };
    };
    const store = `/s/${SLUGS[ids.tA]}/${SLUGS[ids.uO]}`;
    const meta = (h: string) => /<meta[^>]+name="robots"[^>]+noindex/.test(h) && /<meta[^>]+name="referrer"[^>]+no-referrer/.test(h);
    await st("H-1", H_NAMES["H-1"], async () => {
      const a = await get(`${store}?svc=${ids.CUT}&staff=${ids.ek}&date=${D.u}`);
      eq(a.status, 200, "ขั้น 2");
      ok(/data-bk-online[^>]*data-step="2"|data-step="2"[^>]*data-bk-online/.test(a.html), "data-step 2");
      eq(piiLeak(a.html), [], "PII");
      const b = await get(`${store}?svc=${ids.CUT}&staff=${ids.ek}&date=${D.u}&time=11:00&who=${encodeURIComponent(whoOk())}`);
      eq(b.status, 200, "ขั้น 3");
      ok(meta(b.html), "meta เมื่อมี who");
      ok(!b.html.includes(PARTY1.phone), "เบอร์เต็ม");
    }, "MAJOR");
    await st("H-2", H_NAMES["H-2"], async () => {
      const i = bi({ serviceId: ids.CUT, staffId: ids.boy, dateStr: D.u, startMin: 1020 });
      const r = await post(`/api/store/${SLUGS[ids.tA]}/${SLUGS[ids.uO]}/book`, i);
      eq(r.status, 200, `HTTP ${r.text.slice(0, 120)}`);
      const j = JSON.parse(r.text) as { ok?: boolean; manageUrl?: string };
      ok(j.ok === true && typeof j.manageUrl === "string", r.text.slice(0, 160));
      const row = await rowByKey(i.idempotencyKey as string);
      eq(piiLeak(r.text), [], "PII");
      ok(!r.text.includes(row.id), "id หลุด");
      TOKENS_USED.add(tokOfUrl(j.manageUrl));
      const m = await get(j.manageUrl as string);
      eq(m.status, 200, "manage");
      ok(m.html.includes("data-bk-manage") && meta(m.html), "manage DOM/meta");
      eq(piiLeak(m.html), [], "PII manage");
    }, "MAJOR");
    await st("H-3", H_NAMES["H-3"], async () => {
      const { token } = needM1();
      const bad = [rand43(), `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`, sha256hex(token), "x", mRev ? mRev.token : rand43()];
      const rs = [];
      for (const t of bad) { TOKENS_USED.add(t); rs.push(await get(`/bq/m/${encodeURIComponent(t)}`)); }
      eq(rs.map((r) => r.status), [404, 404, 404, 404, 404], "สถานะ");
      ok(rs.every((r) => !r.html.includes("สาขาออนไลน์")), "ชื่อสาขาหลุด");
      const ic = await get(`/bq/m/${token}/ics`);
      ok(ic.status === 200 && ic.ct.startsWith("text/calendar") && /no-store/.test(ic.cc) && ic.html.includes("BEGIN:VCALENDAR"), `ics ${ic.status} ${ic.ct} ${ic.cc}`);
      eq((await get(`/bq/m/${rand43()}/ics`)).status, 404, "ics เสีย");
    }, "MAJOR");
    await st("H-4", H_NAMES["H-4"], async () => {
      const path = (staff: string) => `/api/store/${SLUGS[ids.tA]}/${SLUGS[ids.uO]}/slots?serviceId=${ids.CUT}&staffId=${staff}&date=${D.u}`;
      const a = JSON.parse((await get(path(ids.ek))).html) as { slots?: { startMin: number }[] };
      eq((a.slots ?? []).map((s) => s.startMin), (await BK().findSlots(cO, { serviceId: ids.CUT, staffId: ids.ek, dateStr: D.u, channel: "ONLINE" })).map((s) => s.startMin), "ช่างเอก");
      eq((JSON.parse((await get(path(ids.jack))).html) as { slots?: unknown[] }).slots, [], "ช่างแจ๊ค");
    }, "MAJOR");
    await st("H-5", H_NAMES["H-5"], async () => {
      const ip = newIp();
      const st2: number[] = [];
      for (let i = 0; i < 11; i++) st2.push((await post(`/api/store/${SLUGS[ids.tA]}/${SLUGS[ids.uL]}/book`, { serviceId: "nope", staffId: null, dateStr: D.rl, startMin: 600, name: "x", phone: "0800000000" }, ip)).status);
      ok(st2.slice(0, 10).every((s) => s !== 429) && st2[10] === 429, fmt(st2));
    }, "MAJOR");
  }

  // ═══════════════ Q ฉาก svcqc ═══════════════
  console.log("\n── Q: ฉากภาพบนร้าน svcqc (scripts/svc-qc-online-scene.mts) ──");
  const DD = sqcOnlineSceneDay(TODAY);
  const svcStaff = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "BookingStaff" WHERE "tenantId" = $1 AND "unitId" = $2 AND active`, [SQC.tenant.id, SQC.units.barber.id]))[0].n;
  const runTsx = (file: string, args: string[] = []) => {
    const r = spawnSync("pnpm", ["exec", "tsx", file, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const m = /SCENE_SUMMARY (\{.*\})/.exec(out);
    let sum: { created?: number; updated?: number; removed?: number } | null = null;
    try { sum = m ? JSON.parse(m[1]) : null; } catch { /* อ่านไม่ได้ */ }
    return { status: r.status, out, sum };
  };
  if (svcStaff !== 4) {
    for (const [id, n] of [["Q-1", "ฉากรันได้"], ["Q-2", "หน้าจองบน svcqc ตรงภาพ 03"], ["Q-3", "รันซ้ำไม่เขียน"]]) skip(id, n, `ร้าน svcqc บาร์เบอร์มีช่าง ${svcStaff} (ต้อง 4) — รัน scripts/seed-svc-qc.mts ก่อน`, "MAJOR");
  } else {
    await st("Q-1", `ฉาก svcqc รันได้ (exit 0) · SCENE_SUMMARY {created,updated,removed} · วันฉาก ${DD}`, () => {
      ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`);
      const r = runTsx(F.scene);
      ok(r.status === 0 && !!r.sum && ["created", "updated", "removed"].every((k) => typeof (r.sum as Record<string, unknown>)[k] === "number"), `exit=${r.status} ${r.sum ? fmt(r.sum) : r.out.split("\n").slice(-4).join(" | ").slice(0, 240)}`);
    }, "MAJOR");
    await st("Q-2", "บน svcqc วันฉาก: ขั้น 3 ดัดผม ช่างนุ่น 15:30 = ฿1,500 · มัดจำ ฿300 · จ่ายที่ร้าน ฿1,200 · จบ 17:30 · ตัวตน คุณแพรว •••-•••-4417 · ขั้น 2 มีเวลาเต็ม (ขีดฆ่า) และ 15:30 ว่าง", async () => {
      const who = sqcIdentityToken(SECRET, { tenantId: SQC.tenant.id, partyId: OSC.party.id, nowMs: Date.now(), ttlMin: 60 });
      const r3 = await ON.view()({ tenantSlug: SQC.tenant.slug, unitSlug: SQC.units.barber.slug }, { svc: OSC.pick.serviceName, staff: OSC.pick.staffId, date: DD, time: OSC.pick.time, who }, { ip: newIp() });
      ok(r3.ok, fmt(r3));
      const v = (r3 as { view: OnlineBookingView }).view;
      eq([v.step, v.summary?.priceSatang, v.summary?.depositSatang, v.summary?.payAtShopSatang, hhmmOfMs(v.summary?.endMs), v.identity?.phoneMasked, v.identity?.name],
        [3, OSC.expect.priceSatang, OSC.expect.depositSatang, OSC.expect.payAtShopSatang, OSC.expect.end, OSC.expect.phoneMasked, OSC.party.name], "ขั้น 3");
      const r2 = await ON.view()({ tenantSlug: SQC.tenant.slug, unitSlug: SQC.units.barber.slug }, { svc: OSC.pick.serviceName, staff: OSC.pick.staffId, date: DD }, { ip: newIp() });
      ok(r2.ok, fmt(r2));
      const t = (r2 as { view: OnlineBookingView }).view.times;
      ok(t.some((x) => !x.free) && t.find((x) => x.hhmm === OSC.pick.time)?.free === true, `เวลา ${fmt(t.slice(0, 6))}`);
    }, "MAJOR");
    await st("Q-3", "รันฉากซ้ำ ⇒ SCENE_SUMMARY 0/0/0", () => {
      ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`);
      const r = runTsx(F.scene);
      ok(r.status === 0 && r.sum?.created === 0 && r.sum?.updated === 0 && r.sum?.removed === 0, `exit=${r.status} ${fmt(r.sum)}`);
    }, "MAJOR");
  }

  // ═══════════════ V ภาพ ═══════════════
  console.log("\n── V: ภาพ (จอง 03 ก ข ค) ──");
  {
    const specs = SQC_VISUAL_SPECS["b.7"];
    const name = "ภาพ b.7 (online-step1 · online-step2 · online-step3) 1440 + 390 · HTTP < 400 · ไม่ล้นแนวนอน · ไม่มี page error";
    if (!Array.isArray(specs) || specs.length !== 3) record("V-1", name, "FAIL", `SQC_VISUAL_SPECS b.7 ${fmt(specs)}`, "MAJOR");
    else if (!BASE) skip("V-1", name, "ไม่มี QC_BASE — ผู้คุม build QC + reseed + ฉาก + server แล้วรันซ้ำด้วย QC_BASE", "MAJOR");
    else {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "b.7", "--user", "owner", "--base", BASE], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      if (r.status === 0) record("V-1", `${name} (ภาพ .qc-shots/svc/b.7 — ผู้คุมเทียบ PARITY 03 ก/ข/ค)`, "PASS", "", "MAJOR");
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
  await st("Z-1", "หลังล้าง: tenant `qc-svc-b7-*` 0 · นัด/Party/ค่าตั้ง/outbox/อุปกรณ์ของร้านทดสอบ 0 · ถัง rate ของทดสอบ (IP · slug · token) 0 · ไฟล์สัญญาณ /tmp/svc-b7-go-* ของรอบนี้ 0 (ฉาก svcqc คงไว้ให้ถ่ายภาพ — ล้างด้วย scripts/svc-qc-online-scene.mts --clear)", async () => {
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0].n, 0, "tenant");
    for (const t of ["Appointment", "Party", "SettingValue", "OutboxEvent", "QueueDisplay", "QueueTicket", "BookingStaff", "AuditLog"]) {
      if (!(await cols(t)).length) continue;
      eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [[ids.tA, ids.tB]]))[0].n, 0, t);
    }
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE '%svcb7%' OR key LIKE '%qc-svc-b7-%' OR key = ANY($1::text[])`, [[...TOKENS_USED].map(tkBucket)]))[0].n, 0, "ถัง rate");
    eq(goFiles.filter((f) => existsSync(f)), [], "ไฟล์สัญญาณ");
  }, "MAJOR");
  await pool.end();
}

// ═══════════════ S. ไฟล์ · สัญญาโค้ด ═══════════════
console.log("\n── S: ไฟล์ · สัญญาโค้ด ──");
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
const diffLines = (rel: string) => (spawnSync("git", ["diff", "-U0", "HEAD", "--", rel], { cwd: ROOT, encoding: "utf8" }).stdout ?? "").split("\n").filter((l) => /^[+-](?![+-])/.test(l));
const OWN = new Set<string>([F.online, F.tok, F.service, F.index, F.pub, F.kiosk, F.routeBook, F.routeSlots, F.pageStore, F.compBooking, F.compManage, F.pageManage, F.routeIcs, F.actManage, F.dict]);
const NEW_FILES = [F.online, F.tok, F.compManage, F.pageManage, F.routeIcs, F.actManage];
{
  const ch = dirty(["src", "prisma"]);
  const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.online}`]); return true; } catch { return false; } })();
  if (ch.length === 0 && headHas) skip("S-1", "แตะเฉพาะไฟล์ของใบ", "B.7 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ");
  else await st("S-1", "แตะเฉพาะไฟล์ของใบ (§1 · ไฟล์ย่อยใต้ src/components/booking/online/ ได้) · ไฟล์ใหม่ครบ (online · manage-token · ManageCard · หน้า/ics/actions ของ /bq/m)", () => {
    const outside = ch.filter((f) => !OWN.has(f) && !f.startsWith("src/components/booking/online/"));
    ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 6).join(", ")}`);
    const miss = NEW_FILES.filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
}
await st("S-2", "ไม่มี migration/แก้ schema · ไม่แตะตัววางคิว/queue-line/today-line/line-ops/devices/settings-model/core (รวม defs · permissions)/platform/actions/3 ทะเบียน event", () => {
  eq(dirty(["prisma", ...FROZEN]), [], "ไฟล์");
});
await st("S-3", "service.ts แก้แบบเพิ่ม: บรรทัดที่ลบ/แก้ ≤ 12 (signature ของ findSlots/BookInput + จุดเสียบใน tx) · ไม่แตะ busyRowsOf/slotClear/selfQuotaOk/openCountForPhone/replayOf · ไม่มี createAppointment ในทางจองสาธารณะ", () => {
  const removed = diffLines(F.service).filter((l) => l.startsWith("-") && l.slice(1).trim() !== "");
  ok(removed.length <= 12, `ลบ/แก้ ${removed.length} บรรทัด: ${removed.slice(0, 2).join(" | ").slice(0, 160)}`);
  const body = (name: string) => { const s = src(F.service); const i = s.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\b`)); return i < 0 ? "" : s.slice(i, i + 400); };
  const head = (name: string) => { try { const s = git(["show", `HEAD:${F.service}`]); const i = s.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\b`)); return i < 0 ? "" : s.slice(i, i + 400); } catch { return ""; } };
  for (const n of ["busyRowsOf", "slotClear", "selfQuotaOk", "openCountForPhone", "replayOf"]) eq(body(n), head(n), `${n} ถูกแก้`);
  for (const f of [F.online, F.routeBook]) ok(!/createAppointment\s*\(/.test(stripComments(src(f))), `${f} เรียก createAppointment`);
}, "MAJOR");
await st("S-4", "online.ts + manage-token.ts: ไม่ import prisma ดิบ (F5) · manage-token ไม่แตะฐาน · HMAC + timingSafeEqual · rate limit ด้วย checkRateLimitDb (ไม่มี Map ในหน่วยความจำ / checkRateLimit เดิม) · ไม่ log token", () => {
  const o = stripComments(src(F.online));
  const t = stripComments(src(F.tok));
  ok(!!o && !!t, "ยังไม่มีไฟล์");
  const rawPrisma = /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/;
  ok(!rawPrisma.test(o) && !rawPrisma.test(t), "prisma ดิบ");
  ok(!/@\/lib\/core\/db|@prisma\/client["']/.test(t.replace(/import\s+type[^;]+;/g, "")), "manage-token แตะฐาน");
  ok(/createHmac/.test(t) && /timingSafeEqual/.test(o + t), "HMAC/timing-safe");
  ok(/checkRateLimitDb/.test(o) && !/\bcheckRateLimit\s*\(/.test(o) && !/new\s+Map\s*<[^>]*number/.test(o), "rate limit");
  for (const s of [o, t]) ok(!/console\.(log|info|warn|error)\([^)]*token/i.test(s), "log token");
}, "CRITICAL");
await st("S-5", `action สาธารณะ «${F.actManage}»: "use server" · export async function เท่านั้น · ≥ 2 ตัว (cancelOnline · rescheduleOnline) · ไม่มี requireUnit/session · อ่าน at เฉพาะใต้ SVC_QC_CLOCK`, () => {
  const s = src(F.actManage);
  ok(!!s, `ยังไม่มี ${F.actManage}`);
  ok(/^\s*["']use server["']/.test(s), "ไม่มี use server บรรทัดแรก");
  const code = stripComments(s);
  ok(!/export\s+(const|let|type|interface|default|class|function\s)/.test(code.replace(/export\s+async\s+function/g, "")), "export อื่นที่ไม่ใช่ async function");
  const fns = [...code.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)].map((m) => ({ name: m[1], at: m.index ?? 0 }));
  ok(fns.length >= 2, `action ${fns.length} ตัว`);
  const bad: string[] = [];
  fns.forEach((f, i) => { const body = code.slice(f.at, fns[i + 1]?.at ?? code.length); if (!/\b(cancelOnline|rescheduleOnline)\s*\(/.test(body)) bad.push(`${f.name}: ไม่เรียก facade`); });
  ok(bad.length === 0, bad.join(" · "));
  ok(!/requireUnit|requireAuth|getSession/.test(code), "action สาธารณะใช้ session");
  if (/["']at["']/.test(code)) ok(/SVC_QC_CLOCK/.test(code), "อ่าน at โดยไม่มีด่าน SVC_QC_CLOCK");
}, "CRITICAL");
await st("S-6", "หน้า /bq/m: notFound + force-dynamic + robots index false + referrer no-referrer + loadManageView · ?at= ใต้ SVC_QC_CLOCK · route .ics: loadManageIcs + text/calendar + no-store · หน้าร้าน: loadOnlineBooking + notFound", () => {
  const bad: string[] = [];
  const p = stripComments(src(F.pageManage));
  if (!p) bad.push(`ไม่มี ${F.pageManage}`);
  else {
    if (!/loadManageView\s*\(/.test(p)) bad.push("ไม่เรียก loadManageView");
    if (!/notFound\s*\(/.test(p)) bad.push("notFound");
    if (!/dynamic\s*=\s*["']force-dynamic["']/.test(p)) bad.push("force-dynamic");
    if (!/robots[\s\S]{0,80}index\s*:\s*false/.test(p) || !/referrer\s*:\s*["']no-referrer["']/.test(p)) bad.push("metadata");
    if (/\bat\b/.test(p.replace(/\bat:/g, "")) && /searchParams/.test(p) && !/SVC_QC_CLOCK/.test(p)) bad.push("?at= ไม่มีด่าน");
  }
  const r = stripComments(src(F.routeIcs));
  if (!r || !/loadManageIcs\s*\(/.test(r) || !/text\/calendar/.test(r) || !/no-store/.test(r)) bad.push("route ics");
  const s = stripComments(src(F.pageStore));
  if (!/loadOnlineBooking\s*\(/.test(s) || !/notFound\s*\(/.test(s)) bad.push("หน้าร้าน");
  ok(bad.length === 0, bad.join(" · "));
}, "MAJOR");
await st("S-7", "ไม่มีเวลาเครื่องดิบ (.getDay/.getHours/.getMinutes/.getDate/.getMonth/.getFullYear) ในไฟล์ใหม่/เขียนใหม่", () => {
  const files = [F.online, F.tok, F.compBooking, F.compManage, F.actManage, F.pageManage, F.routeIcs];
  const miss = files.filter((f) => !existsSync(join(ROOT, f)));
  ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  const bad: string[] = [];
  for (const f of files) src(f).split("\n").forEach((l, i) => { if (/\.(getDay|getHours|getMinutes|getDate|getMonth|getFullYear)\s*\(\s*\)/.test(l.replace(/\/\/.*$/, ""))) bad.push(`${f}:${i + 1}`); });
  ok(bad.length === 0, bad.slice(0, 4).join(" · "));
}, "MAJOR");
await st("S-8", "คอมโพเนนต์สาธารณะ: ไม่ import ค่าจาก @/lib/modules · @/lib/core/db · @prisma/client (import type ได้) · ไม่อ้าง customerName/customerPhone · ไม่ฮาร์ดโค้ดคีย์ค่าตั้ง booking.*", () => {
  const bad: string[] = [];
  const onlineDir = join(ROOT, "src/components/booking/online");
  const extra = existsSync(onlineDir) ? (spawnSync("ls", [onlineDir], { encoding: "utf8" }).stdout ?? "").split("\n").filter((f) => /\.tsx?$/.test(f)).map((f) => `src/components/booking/online/${f}`) : [];
  for (const f of [F.compBooking, F.compManage, ...extra]) {
    const s = stripComments(src(f));
    if (!s) { bad.push(`ไม่มี ${f}`); continue; }
    const valueImports = [...s.matchAll(/^\s*import\s+(?!type\b)[^;]*from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
    if (valueImports.some((x) => x.startsWith("@/lib/modules") || x === "@/lib/core/db" || x === "@prisma/client")) bad.push(`${f}: import ค่าจากชั้นฐาน`);
    if (/customerName|customerPhone/.test(s)) bad.push(`${f}: อ้าง PII`);
    if (/["']booking\.(booking|late|deposit|staff|general|service)\./.test(s)) bad.push(`${f}: คีย์ค่าตั้ง`);
  }
  ok(bad.length === 0, bad.slice(0, 4).join(" · "));
}, "MAJOR");
await st("S-9", "route book → bookOnline (ไม่มี createAppointment/checkRateLimit ในหน่วยความจำ) · route slots → findSlots + checkRateLimitDb (ไม่มี getAvailableSlots)", () => {
  const b = stripComments(src(F.routeBook));
  ok(/bookOnline\s*\(/.test(b) && !/createAppointment|\bcheckRateLimit\s*\(/.test(b), "book route");
  const s = stripComments(src(F.routeSlots));
  ok(/findSlots\s*\(/.test(s) && /checkRateLimitDb/.test(s) && !/getAvailableSlots|\bcheckRateLimit\s*\(/.test(s), "slots route");
}, "MAJOR");
await st("S-10", "dict th/en คีย์คู่กันครบ (เพิ่มคีย์ใหม่ทั้งสองภาษา)", async () => {
  const d = await tryImport<{ DICT?: Record<string, Record<string, string>> }>(pathToFileURL(join(ROOT, F.dict)).href);
  const th = Object.keys(d.mod?.DICT?.th ?? {}).sort();
  const en = Object.keys(d.mod?.DICT?.en ?? {}).sort();
  ok(th.length > 0, `โหลด dict ไม่ได้ ${d.err}`);
  eq(th.filter((k) => !en.includes(k)).concat(en.filter((k) => !th.includes(k))), [], "คีย์ไม่คู่");
}, "MINOR");
await st("S-11", "public-line.ts + Kiosk.tsx (หนี้ B.6): เพิ่มบรรทัดเท่านั้น (ลบ/แก้ ≤ 3) · มี bookUrl", () => {
  for (const f of [F.pub, F.kiosk]) {
    const removed = diffLines(f).filter((l) => l.startsWith("-") && l.slice(1).trim() !== "");
    ok(removed.length <= 3, `${f} ลบ/แก้ ${removed.length} บรรทัด`);
    ok(/bookUrl/.test(src(f)), `${f} ไม่มี bookUrl`);
  }
}, "MINOR");

// ═══════════════ G. regression (หลังล้างข้อมูล) ═══════════════
console.log("\n── G: regression (b.3 · b.4 · b.5 · b.6 · booking-race · booking-deposit · smoke) ──");
const judgeSvc = (allowSkip: (id: string) => boolean, allowFail: (id: string) => boolean = () => false) => (out: string) => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return false;
  const j = JSON.parse(line.slice(13)) as { failed: string[]; skipped?: string[] };
  return j.failed.every(allowFail) && (j.skipped ?? []).every(allowSkip);
};
const REG: { s: string; args?: string[]; env?: Record<string, string>; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-svc-b.3", env: { SVC_B3_NO_REGRESSION: "1" }, judge: judgeSvc((x) => x.startsWith("G-") || x === "ST-1", (x) => x === "ST-1"), note: "ไม่มี FAIL ยกเว้น ST-1 (ไฟล์ของใบ B.7 ยังไม่ commit) · SKIP เฉพาะ G-*/ST-1" },
  { s: "qc-svc-b.4", args: ["--no-regression"], judge: judgeSvc((x) => x.startsWith("G-") || x === "ST-1", (x) => x === "ST-1"), note: "ไม่มี FAIL ยกเว้น ST-1 · SKIP เฉพาะ G-*/ST-1" },
  { s: "qc-svc-b.5", args: ["--no-regression"], judge: judgeSvc((x) => /^(H|E|V|Q|G)-/.test(x) || x === "S-1", (x) => x === "S-1"), note: "ไม่มี FAIL ยกเว้น S-1 · SKIP เฉพาะ H/E/V/Q/G/S-1" },
  { s: "qc-svc-b.6", args: ["--no-regression"], judge: judgeSvc((x) => /^(H|V|Q|G)-/.test(x) || x === "S-1", (x) => x === "S-1" || x === "S-9"), note: "ไม่มี FAIL ยกเว้น S-1 · S-9 (diff core-fix หลัง merge) · SKIP เฉพาะ H/V/Q/G/S-1" },
  { s: "qc-booking-race" },
  { s: "qc-booking-deposit" },
  { s: "qc-svc-smoke" },
];
{
  const hasWork = typeof onlineLoad.mod?.bookOnline === "function" && typeof onlineLoad.mod?.loadManageView === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (online.bookOnline / loadManageView) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_B7_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: { ...process.env, ...(g.env ?? {}) }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 40 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-b7-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(all, r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC B.7 · จองออนไลน์ + ลิงก์จัดการนัด =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: H-* / V-1 ไม่มี QC_BASE · Q-* svcqc ยังไม่ seed · G-* เมื่อ --no-regression — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);

// ═══════════════ สายยิงพร้อมกัน (parent · แบบ qc-svc-b.3) ═══════════════
async function runHarness(scs: Scenario[], n: number): Promise<Map<string, CallOut[]>> {
  const out = new Map<string, CallOut[]>();
  const ready = new Map<string, Set<number>>();
  const res = new Map<string, Map<number, CallOut[]>>();
  const dead = new Set<number>();
  const errs: string[] = [];
  const kids = Array.from({ length: n }, (_, idx) => {
    const spec: ChildSpec = { run: RUN, idx, scenarios: scs.map((s) => ({ key: s.key, calls: s.calls.slice(idx * 2, idx * 2 + 2) })) };
    const ch = spawn(process.execPath, [...process.execArgv, SELF], { cwd: ROOT, env: { ...process.env, QC_B7_CHILD: JSON.stringify(spec) }, stdio: ["ignore", "pipe", "pipe"] });
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
