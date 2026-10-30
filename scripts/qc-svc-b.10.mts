// QC — SVC B.10 · จบงาน → บิลจากคิว (บิลพัก POS) + ค่าคอมฯ ตามผู้ให้บริการ · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-b.10.md (§2 มติ · §3 สัญญา · §4 จอ) · ledger/SVC-MASTER-PLAN.md แถว B.10 · SVC-RUN §1.1 ข้อ 3 (POS 2 จุด)
//        ledger/DESIGN-BOOKING-QUEUE.md R8 BQ-2 BQ-3 BQ-5 · CC §7 §10 ข้อ 2 · ภาพ ledger/design-booking/07-done-to-pos.png
//
// กลุ่มข้อ:
//   ST  ไฟล์ของใบ · POS 2 จุด · ไม่มี migration · POS ไม่ import booking · CAS
//   P   ตัวควบคุมบวก: มัดจำ POS จริง · ค่าคอมฯ ผู้ขายของบิลหน้าร้านปกติลงจริง · facade openServiceBill ทำงาน + idempotent
//   F   ฉากภาพ 07 ตรงทุกสตางค์: ฿900 + ฿300 + ฿290 − ฿200 = ฿1,290 · ค่าคอมฯ ช่างเอก ฿134.50 · เสร็จซ้ำ = บิลเดิม · จ่ายผิดยอด/ส่ง DEPOSIT เอง = ปฏิเสธ ·
//       จ่ายแล้ว = บิล BOOKING 1 ใบ (แถว DEPOSIT อ้างใบรับ) · consumer ซ้ำ/พร้อมกัน = ผลครั้งเดียว (X4) · ไม่ไปที่คนกดขาย
//   R   void ⇒ ค่าคอมฯ REVERSE · C ค่าคอมฯ: ปัดครึ่งขึ้นชั้น STAFF · ผู้ทำไม่มีพนักงาน · OFF snapshot · ผู้ทำต่างคนต่อบรรทัด
//   A   แก้ของ (amend) · ยกเลิกบิล (เหตุผล + audit) · เปิดใหม่ · ออกจาก DONE ไม่ได้เมื่อมีบิล · มัดจำถูกคืนระหว่างรอ
//   N   สาขาไม่มี POS ("รับเงินแล้ว") · สาขาเดิม _fallback ไม่เปิดบิลพัก
//   X1  ข้ามร้าน/สาขา ⇒ NOT_FOUND · S สิทธิ์สด (อ่าน Membership ทุกครั้ง) · X3 ยิงพร้อมกันจาก 5 โพรเซส (เสร็จ ×10 · จ่าย ×10 · แก้∥จ่าย)
//   EV  booking.paid 3 ทะเบียน + payload ไม่มี PII · U DOM แผ่นจบงาน · V ภาพ (ผู้คุมถ่าย) · Z ล้างข้อมูล · G regression (หลังล้าง)
//
// เวลา: วันอนาคตคงที่ (วันไทย +6…+18) + `now` ฉีดเข้า · ร้านทดสอบ slug `qc-svc-b10-*` · ลบใน finally (+ กวาดค้างตอนเริ่ม)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.10.mts [--no-regression]
//      (ห้าม timeout ครอบ · `--no-regression` = ข้าม G เป็น SKIP ซึ่งไม่นับผ่าน)
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_VISUAL_SPECS, SQC_DONE_POS_SCENE } from "./svc-qc-data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const LABEL = "qc-svc-b.10";
const F = {
  finish: "src/lib/modules/booking/finish.ts",
  line: "src/lib/modules/booking/queue-line.ts",
  bsvc: "src/lib/modules/booking/service.ts",
  bidx: "src/lib/modules/booking/index.ts",
  today: "src/lib/modules/booking/today-line.ts",
  actBooking: "src/lib/actions/booking.ts",
  actLine: "src/lib/actions/booking-line.ts",
  minePage: "src/app/app/u/[unitSlug]/booking/mine/page.tsx",
  sheet: "src/components/booking/FinishJobSheet.tsx",
  outbox: "src/lib/outbox-consumers.ts",
  auto: "src/lib/automation/labels.ts",
  wh: "src/lib/webhooks/labels.ts",
  scene: "scripts/svc-qc-done-pos-scene.mts",
  posBill: "src/lib/modules/pos/service-bill.ts",
  posIdx: "src/lib/modules/pos/index.ts",
  posHeld: "src/lib/modules/pos/held-cart.ts",
  posSvc: "src/lib/modules/pos/service.ts",
  posComm: "src/lib/modules/pos/staff-commission.ts",
  posUi: "src/lib/modules/pos/register-ui.tsx",
  posAct: "src/lib/modules/pos/register-actions.ts",
} as const;
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_B10_NO_REGRESSION === "1";

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc (ep-mute-scene) ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }

// ═══════════════ สำเนาสัญญา (ใบสั่ง §3) ═══════════════
type Ctx = { tenantId: string; unitId: string; actorUserId?: string };
type ExtraLine = { kind: "SERVICE"; serviceId: string; staffId?: string } | { kind: "PRODUCT"; productId: string; qty: number; staffId?: string };
type BillLine = {
  kind: "SERVICE" | "PRODUCT"; source: "BOOKED" | "EXTRA"; name: string; qty: number; unitPriceSatang: number; amountSatang: number;
  serviceId: string | null; productId: string | null; performerStaffId: string; performerEmployeeId: string | null; commissionBp: number | null;
};
type Preview = {
  appointmentId: string; ticketNumber: string | null; customerLabel: string; staffName: string;
  lines: BillLine[]; subtotalSatang: number; depositSatang: number; dueSatang: number;
  pos: boolean; heldCartId: string | null; billStatus: "NONE" | "HELD" | "PAID" | "CANCELLED";
  rebook: { dateStr: string; startMin: number; staffId: string } | null;
};
type FinishFail = "NOT_FOUND" | "BAD_STATE" | "LOST_RACE" | "BUSY" | "BAD_INPUT" | "FORBIDDEN" | "BILL_PAID" | "BILL_IN_USE" | "USE_POS";
type FinishResult =
  | { ok: true; appointmentId: string; heldCartId: string | null; already: boolean; needsPayment: "POS" | "NO_POS" | "NONE"; legacy?: boolean }
  | { ok: false; code: FinishFail; reason: string };
type AuthOp = "finish" | "amend" | "cancel" | "markPaid";
type FinishApi = {
  previewServiceBill: (ctx: Ctx, id: string, input?: { extras?: ExtraLine[] }) => Promise<Preview | null>;
  finishJob: (ctx: Ctx, id: string, input?: { extras?: ExtraLine[]; now?: Date }) => Promise<FinishResult>;
  ensureServiceBill: (ctx: Ctx, id: string) => Promise<FinishResult>;
  amendServiceBill: (ctx: Ctx, id: string, input: { extras: ExtraLine[] }) => Promise<FinishResult>;
  cancelServiceBill: (ctx: Ctx, id: string, input: { reason: string }) => Promise<FinishResult>;
  markPaidWithoutPos: (ctx: Ctx, id: string, opts?: { now?: Date }) => Promise<FinishResult>;
  authorizeServiceBillOp: (ctx: Ctx, userId: string, op: AuthOp, id: string) => Promise<{ ok: true } | { ok: false; code: "FORBIDDEN" | "NOT_FOUND"; reason: string }>;
  onPosSalePaid: (evt: { id: string; tenantId: string; payload: unknown }) => Promise<void>;
};
type RegCtx = { tenantId: string; systemId: string; unitId: string; deviceId?: string };
type RegActor = { userId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown> };
type Refusal = { ok: false; code: string; message?: string };
type SBLineIn = { kind: "SERVICE" | "PRODUCT"; name: string; qty: number; unitPriceSatang: number; productId: string | null; serviceId: string | null; performerEmployeeId: string | null; commissionBp: number | null };
type SBView = {
  ok: true; heldCartId: string; appointmentId: string; version: number;
  lines: { kind: string; name: string; qty: number; unitPriceSatang: number; amountSatang: number; performerEmployeeId: string | null }[];
  subtotalSatang: number; depositSatang: number; dueSatang: number; deposit: { receiptSaleId: string; satang: number } | null;
};
type PayIn = { heldCartId: string; payMethods: { type: string; amountSatang: number; reference?: string; cashTenderedSatang?: number }[]; idempotencyKey: string };
type PayOut = { ok: true; saleId: string; receiptNo: string | null; grandTotalSatang: number; duplicated: boolean } | Refusal;
type ServiceBillsApi = {
  openServiceBill: (i: { tenantId: string; unitId: string; appointmentId: string; memberId?: string | null; label: string; lines: SBLineIn[]; depositReceiptSaleId?: string | null; actorUserId: string | null }) =>
    Promise<{ ok: true; heldCartId: string; created: boolean } | Refusal>;
  replaceServiceBillLines: (i: { tenantId: string; unitId: string; appointmentId: string; lines: SBLineIn[] }) => Promise<{ ok: true; heldCartId: string; version: number } | Refusal>;
  discardServiceBill: (i: { tenantId: string; unitId: string; appointmentId: string; actorUserId: string | null; reason: string }) => Promise<{ ok: true; heldCartId: string } | Refusal>;
  serviceBillStatus: (tenantId: string, unitId: string, appointmentId: string) => Promise<{ heldCartId: string; status: "HELD" | "PAID" | "DISCARDED"; saleId: string | null } | null>;
  listServiceBills: (ctx: RegCtx, actor: RegActor) => Promise<{ ok: true; items: { heldCartId: string; appointmentId: string; label: string; subtotalSatang: number; depositSatang: number; dueSatang: number; createdAt: Date }[] } | Refusal>;
  serviceBillView: (ctx: RegCtx, actor: RegActor, i: { heldCartId: string }) => Promise<SBView | Refusal>;
  payServiceBill: (ctx: RegCtx, actor: RegActor, i: PayIn) => Promise<PayOut>;
};
type PosApi = {
  serviceBills?: Partial<ServiceBillsApi>;
  createSale: (i: Record<string, unknown>) => Promise<{ saleId: string; status?: string }>;
  voidSale: (tenantId: string, unitId: string, saleId: string, audit?: Record<string, unknown>) => Promise<void>;
};
type HeldApi = { recallHeldCart: (ctx: RegCtx, actor: RegActor, i: { id: string }) => Promise<{ ok: boolean; code?: string }> };
type DepositApi = { moduleRefundDeposit: (i: { tenantId: string; unitId: string; receiptSaleId: string; reason: string; actorId: string }) => Promise<{ ok: boolean; code?: string; message?: string }> };
// ของใบก่อน (มีแล้ว)
type JobResult = { ok: true } | { ok: false; code: string; reason: string };
type LineApi = {
  checkIn: (ctx: Ctx, by: { appointmentId: string }, opts: { via: "STAFF"; now?: Date }) => Promise<{ ok: boolean; code?: string; reason?: string; ticketId?: string }>;
  startJob: (ctx: Ctx, id: string, opts?: { now?: Date }) => Promise<JobResult>;
  completeJob: (ctx: Ctx, id: string, opts?: { now?: Date }) => Promise<JobResult>;
  cancelByShop: (ctx: Ctx, id: string, opts?: { now?: Date }) => Promise<JobResult>;
};
type BookInput = { serviceId: string; staffId: string | null; dateStr: string; startMin: number; channel: "STAFF"; customerName: string; customerPhone: string; idempotencyKey?: string };
type BookingApi = {
  bookAppointment: (ctx: Ctx, i: BookInput) => Promise<{ ok: true; id: string; status: string } | { ok: false; code: string; reason: string }>;
  createAppointment: (i: { tenantId: string; unitId: string; serviceId: string; staffId: string; dateStr: string; startMin: number; customerName: string; customerPhone: string }) => Promise<{ ok: true; id: string } | { ok: false; reason: string }>;
  setAppointmentStatus: (tenantId: string, unitId: string, id: string, status: "PENDING" | "CONFIRMED" | "ARRIVED" | "DONE" | "NO_SHOW" | "CANCELLED") => Promise<{ ok: boolean; reason?: string }>;
  recordDeposit: (ctx: Ctx, id: string, payMethod?: string) => Promise<{ ok: boolean; reason?: string; saleId?: string }>;
};
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
type SettingsApi = {
  setSettings: (actor: Actor, ctx: { tenantId: string }, changes: { key: string; scope: string; scopeId: string; value: unknown }[]) => Promise<{ ok: boolean; code?: string; issues?: unknown }>;
  applyTemplate: (actor: Actor, ctx: { tenantId: string }, i: { unitId: string; domain: string; templateKey: string; overwrite: "KEEP_CUSTOM" | "RESET_ALL" }) => Promise<{ ok: boolean; code?: string; issues?: unknown }>;
};
type Handler = (evt: { id: string; tenantId: string; type: string; payload: unknown; systemId: string | null; unitId: string | null }) => Promise<void>;
type LabelDef = { value: string; label: string };

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
const addDays = (ds: string, n: number): string => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const bkkToday = (): string => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const at = (ds: string, min: number): Date => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d) + (min - 420) * 60_000); };
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const src = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const halfUp = (n: number, d: number) => Math.floor((2 * n + d) / (2 * d)); // n, d > 0

// ═══════════════ โหลดโมดูล ═══════════════
const loadIf = async <T,>(rel: string) => (existsSync(join(ROOT, rel)) ? tryImport<T>(pathToFileURL(join(ROOT, rel)).href) : { mod: null as T | null, err: `ยังไม่มีไฟล์ «${rel}»` });
const finishLoad = await loadIf<FinishApi>(F.finish);
const posLoad = await tryImport<PosApi>("@/lib/modules/pos");
const lineLoad = await tryImport<LineApi>("@/lib/modules/booking/queue-line");
const bookingLoad = await tryImport<BookingApi>("@/lib/modules/booking/service");
const fnOf = <Fn,>(load: { mod: unknown; err: string }, name: string, rel: string): Fn => {
  const f = (load.mod as Record<string, unknown> | null)?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return f as Fn;
};
const FN = <K extends keyof FinishApi>(k: K): FinishApi[K] => fnOf<FinishApi[K]>(finishLoad, k, F.finish);
const SB = <K extends keyof ServiceBillsApi>(k: K): ServiceBillsApi[K] => {
  if (!posLoad.mod) throw new AssertFail(`โหลด pos facade ไม่ได้: ${posLoad.err}`);
  const o = posLoad.mod.serviceBills;
  if (!o || typeof o !== "object") throw new AssertFail("pos/index.ts ยังไม่มี export serviceBills");
  const f = o[k];
  if (typeof f !== "function") throw new AssertFail(`serviceBills.${k} ยังไม่มี`);
  return f as ServiceBillsApi[K];
};
const POS = (): PosApi => { if (!posLoad.mod) throw new AssertFail(`โหลด pos facade ไม่ได้: ${posLoad.err}`); return posLoad.mod; };
const LN = (): LineApi => { if (!lineLoad.mod) throw new AssertFail(`โหลด queue-line ไม่ได้ (${lineLoad.err})`); return lineLoad.mod; };
const BK = (): BookingApi => { if (!bookingLoad.mod) throw new AssertFail(`โหลด booking/service ไม่ได้ (${bookingLoad.err})`); return bookingLoad.mod; };
let consumersCache: Record<string, Handler> | null = null;
const CONSUMERS = async (): Promise<Record<string, Handler>> => {
  if (consumersCache) return consumersCache;
  const m = await tryImport<{ consumers: Record<string, Handler> }>("@/lib/outbox-consumers");
  if (!m.mod) throw new AssertFail(`โหลด outbox-consumers ไม่ได้: ${m.err}`);
  consumersCache = m.mod.consumers;
  return consumersCache;
};
const isRefusal = (r: unknown): r is Refusal => !!r && typeof r === "object" && (r as { ok?: unknown }).ok === false;

// ═══════════════ โหมดลูกโพรเซส (X3 · X4) ═══════════════
type CallSpec =
  | { fn: "finish"; ctx: Ctx; id: string; extras: ExtraLine[]; now: string }
  | { fn: "pay"; ctx: RegCtx; actor: RegActor; heldCartId: string; amount: number; key: string }
  | { fn: "amend"; ctx: Ctx; id: string; extras: ExtraLine[] }
  | { fn: "consume"; eventId: string };
type CallOut = { fn: CallSpec["fn"]; ok: boolean; code: string | null; heldCartId: string | null; saleId: string | null; threw: string | null };
async function eventRow(id: string) {
  const dbm = (await import("@/lib/core/db")) as unknown as { prisma: { outboxEvent: { findUnique: (a: { where: { id: string } }) => Promise<{ id: string; tenantId: string; type: string; payload: unknown; systemId: string | null; unitId: string | null } | null> } } };
  return dbm.prisma.outboxEvent.findUnique({ where: { id } });
}
async function runCall(c: CallSpec): Promise<CallOut> {
  const o: CallOut = { fn: c.fn, ok: false, code: null, heldCartId: null, saleId: null, threw: null };
  try {
    if (c.fn === "finish") {
      const r = await FN("finishJob")(c.ctx, c.id, { extras: c.extras, now: new Date(c.now) });
      return r.ok ? { ...o, ok: true, heldCartId: r.heldCartId } : { ...o, code: r.code };
    }
    if (c.fn === "amend") {
      const r = await FN("amendServiceBill")(c.ctx, c.id, { extras: c.extras });
      return r.ok ? { ...o, ok: true, heldCartId: r.heldCartId } : { ...o, code: r.code };
    }
    if (c.fn === "pay") {
      const r = await SB("payServiceBill")(c.ctx, c.actor, { heldCartId: c.heldCartId, payMethods: [{ type: "CASH", amountSatang: c.amount }], idempotencyKey: c.key });
      return r.ok ? { ...o, ok: true, saleId: r.saleId } : { ...o, code: r.code };
    }
    const ev = await eventRow(c.eventId);
    if (!ev) return { ...o, code: "NO_EVENT" };
    const h = (await CONSUMERS())[ev.type];
    if (!h) return { ...o, code: "NO_HANDLER" };
    await h(ev);
    return { ...o, ok: true };
  } catch (e) {
    return { ...o, threw: errMsg(e).slice(0, 180) };
  }
}
const goFile = (run: string, key: string) => `/tmp/svc-b10-go-${run}-${key}`;
if (process.env.QC_B10_CHILD) {
  const spec = JSON.parse(process.env.QC_B10_CHILD) as { run: string; key: string; calls: CallSpec[] };
  try {
    const dbm = (await import("@/lib/core/db")) as unknown as { prisma: { $queryRawUnsafe: (q: string) => Promise<unknown>; $disconnect: () => Promise<void> } };
    await dbm.prisma.$queryRawUnsafe("SELECT 1");
    console.log(`READY ${spec.key}`);
    const t0 = Date.now();
    while (!existsSync(goFile(spec.run, spec.key))) { if (Date.now() - t0 > 300_000) { console.log("ABORT"); process.exit(5); } await sleep(10); }
    const outs = await Promise.all(spec.calls.map(runCall));
    console.log(`RES ${spec.key} ${JSON.stringify(outs)}`);
    await dbm.prisma.$disconnect();
    process.exit(0);
  } catch (e) {
    console.log(`CHILD_ERR ${errMsg(e)}`);
    process.exit(3);
  }
}

const settingsLoad = await tryImport<SettingsApi>("@/lib/core/settings");
const SETTINGS = (): SettingsApi => { if (!settingsLoad.mod) throw new AssertFail(`โหลด core/settings ไม่ได้ (${settingsLoad.err})`); return settingsLoad.mod; };

// ═══════════════ ฐานข้อมูล ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]));
  return colCache.get(table) ?? [];
};
const rid = (p: string) => `svcb10_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
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
const SLUG = "qc-svc-b10-";
const USER_MAIL = "qc-svc-b10-";
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
    await pool.query(`DELETE FROM "Membership" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${USER_MAIL}%`]);
    await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${USER_MAIL}%`]);
  } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}

const RUN = Date.now().toString(36);
const TODAY = bkkToday();
const dd = (k: number) => addDays(TODAY, 6 + k);
const T = (k: string) => `svcb10_${k}_${RUN}`;
const ids = {
  tA: T("tA"), tB: T("tB"),
  uA: T("uA"), uN: T("uN"), uL: T("uL"), uB: T("uB"),
  posA: T("posA"), posB: T("posB"), hrA: T("hrA"),
  COLOR: T("COLOR"), TREAT: T("TREAT"), CUT: T("CUT"), ODD: T("ODD"), CUTN: T("CUTN"), CUTL: T("CUTL"), CUTB: T("CUTB"),
  WAX: T("WAX"), WAXB: T("WAXB"),
  ek: T("ek"), boy: T("boy"), jack: T("jack"), nn: T("nn"), ll: T("ll"), bb: T("bb"),
  empEk: T("empEk"), empBoy: T("empBoy"),
  uOwner: T("uOwner"), uEk: T("uEk"), uBoy: T("uBoy"), uCash: T("uCash"), uMgr: T("uMgr"), uOwnerB: T("uOwnerB"),
};
const SLUGS: Record<string, string> = {};
const cA: Ctx = { tenantId: ids.tA, unitId: ids.uA, actorUserId: ids.uEk };
const cN: Ctx = { tenantId: ids.tA, unitId: ids.uN, actorUserId: ids.uOwner };
const cL: Ctx = { tenantId: ids.tA, unitId: ids.uL, actorUserId: ids.uOwner };
const cB: Ctx = { tenantId: ids.tB, unitId: ids.uB, actorUserId: ids.uOwnerB };
const cAmgr: Ctx = { ...cA, actorUserId: ids.uMgr };
const DEV = "qcb10dev0000000001";
const rA: RegCtx = { tenantId: ids.tA, systemId: ids.posA, unitId: ids.uA, deviceId: DEV };
const rA2: RegCtx = { tenantId: ids.tA, systemId: ids.posA, unitId: ids.uA, deviceId: "qcb10dev0000000002" };
const rL: RegCtx = { tenantId: ids.tA, systemId: ids.posA, unitId: ids.uL, deviceId: DEV };
const rB: RegCtx = { tenantId: ids.tB, systemId: ids.posB, unitId: ids.uB, deviceId: DEV };
const CASHIER: RegActor = { userId: ids.uCash, role: "STAFF", unitAccess: [ids.uA, ids.uL], permissions: { "pos.sale.create": true } };
const NOPERM: RegActor = { userId: ids.uBoy, role: "STAFF", unitAccess: [ids.uA], permissions: { "booking.job.run": true } };
const OWNER_B: RegActor = { userId: ids.uOwnerB, role: "OWNER", unitAccess: ["*"], permissions: {} };
const OWNER: Actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.uOwner };
const OWNER_BS: Actor = { ...OWNER, userId: ids.uOwnerB };
const ALL_TENANTS = [ids.tA, ids.tB];
let phoneN = 0;
const PHONES: string[] = [];
const NAMES: string[] = [];
const newPhone = () => { const p = `08${String(57_000_000 + ++phoneN).slice(-8)}`; PHONES.push(p); return p; };
const goFiles: string[] = [];

// ═══════════════ ตัวอ่านแถว ═══════════════
type ApRow = { id: string; status: string; doneAt: Date | null; heldCartId: string | null; queueTicketId: string | null; depositSatang: number; depositSaleId: string | null; depositPaidAt: Date | null };
const apRow = async (id: string): Promise<ApRow> => {
  const [r] = await q<ApRow>(`SELECT id, status::text AS status, "doneAt", "heldCartId", "queueTicketId", "depositSatang", "depositSaleId", "depositPaidAt" FROM "Appointment" WHERE id = $1`, [id]);
  if (!r) throw new AssertFail(`ไม่พบนัด ${id}`);
  return r;
};
type CartRow = { id: string; status: string; serviceJobId: string | null; unitId: string; systemId: string; tenantId: string; lineCount: number; approxTotalSatang: number; version: number; cartJson: unknown };
const cartsOf = async (apptId: string): Promise<CartRow[]> =>
  q<CartRow>(`SELECT id, status::text AS status, "serviceJobId", "unitId", "systemId", "tenantId", "lineCount", "approxTotalSatang", version, "cartJson" FROM "PosHeldCart" WHERE "serviceJobId" = $1 ORDER BY "createdAt"`, [apptId]);
type SaleRow = { id: string; status: string; grandTotalSatang: number; sourceModule: string; sourceId: string | null; idempotencyKey: string; soldByUserId: string | null; docType: string };
const salesOf = async (tenantId: string, apptId: string): Promise<SaleRow[]> =>
  q<SaleRow>(`SELECT id, status::text AS status, "grandTotalSatang", "sourceModule", "sourceId", "idempotencyKey", "soldByUserId", "docType"::text AS "docType" FROM "PosSale" WHERE "tenantId" = $1 AND "sourceModule" = 'BOOKING' AND "sourceId" = $2 AND "docType"::text = 'SALE' ORDER BY "createdAt"`, [tenantId, apptId]);
type LineRow = { id: string; name: string; qty: number; unitPriceSatang: number; lineTotalSatang: number; performerEmployeeId: string | null; productId: string | null; serviceId: string | null };
const linesOf = async (saleId: string) => q<LineRow>(`SELECT id, name, qty, "unitPriceSatang", "lineTotalSatang", "performerEmployeeId", "productId", "serviceId" FROM "PosSaleLine" WHERE "saleId" = $1 ORDER BY "lineTotalSatang" DESC, name`, [saleId]);
const paysOf = async (saleId: string) => q<{ type: string; amountSatang: number; refSaleId: string | null }>(`SELECT type::text AS type, "amountSatang", "refSaleId" FROM "PosPayment" WHERE "saleId" = $1 ORDER BY type::text`, [saleId]);
type CommRow = { userId: string; employeeId: string | null; kind: string; amountSatang: number; baseSatang: number; rateBp: number; lineId: string };
const commOf = async (saleId: string) => q<CommRow>(`SELECT "userId", "employeeId", kind::text AS kind, "amountSatang", "baseSatang", "rateBp", "lineId" FROM "PosStaffCommission" WHERE "saleId" = $1 ORDER BY kind::text, "amountSatang" DESC`, [saleId]);
const depositOf = async (receiptSaleId: string) => (await q<{ status: string; amountSatang: number; usedSatang: number; refundedSatang: number }>(`SELECT status::text AS status, "amountSatang", "usedSatang", "refundedSatang" FROM "PosDeposit" WHERE "receiptSaleId" = $1`, [receiptSaleId]))[0] ?? null;
const evCount = async (tenantId: string, key: string) => Number((await q<{ n: string }>(`SELECT count(*)::text AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND "idempotencyKey" = $2`, [tenantId, key]))[0]?.n ?? 0);

/** รันตัวรับคิวของ event ชนิดนี้ที่อ้าง saleId (ตรงกับที่ drain ทำ) · ทำซ้ำได้ (X4) */
async function consume(tenantId: string, type: string, saleId: string): Promise<string[]> {
  const rows = await q<{ id: string; tenantId: string; type: string; payload: unknown; systemId: string | null; unitId: string | null }>(
    `SELECT id, "tenantId", type, payload, "systemId", "unitId" FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = $2 AND payload->>'saleId' = $3 ORDER BY "createdAt"`, [tenantId, type, saleId]);
  ok(rows.length > 0, `ไม่มี event ${type} ของบิล ${saleId}`);
  const h = (await CONSUMERS())[type];
  ok(typeof h === "function", `ไม่มีตัวรับ ${type}`);
  for (const r of rows) await h(r);
  await q(`UPDATE "OutboxEvent" SET status = 'DONE', "processedAt" = now() WHERE id = ANY($1::text[]) AND status = 'PENDING'`, [rows.map((r) => r.id)]);
  return rows.map((r) => r.id);
}

// ═══════════════ ฉาก: พางานถึง IN_SERVICE ═══════════════
const CUSTOMER = (n: string) => { const s = `คุณ${n} QCB10`; NAMES.push(s); return s; };
async function bookInService(ctx: Ctx, svc: string, staff: string, ds: string, startMin: number, o?: { deposit?: boolean; name?: string; start?: boolean }): Promise<string> {
  const r = await BK().bookAppointment(ctx, { serviceId: svc, staffId: staff, dateStr: ds, startMin, channel: "STAFF", customerName: CUSTOMER(o?.name ?? "ลูกค้า"), customerPhone: newPhone(), idempotencyKey: rid("idem") });
  if (!r.ok) throw new AssertFail(`จอง ${ds} ${startMin} ล้ม ${r.code} ${r.reason}`);
  if (r.status === "PENDING") ok((await BK().setAppointmentStatus(ctx.tenantId, ctx.unitId, r.id, "CONFIRMED")).ok, "ยืนยันนัด");
  if (o?.deposit) {
    const d = await BK().recordDeposit(ctx, r.id, "PROMPTPAY");
    ok(d.ok && !!d.saleId, `รับมัดจำล้ม: ${d.reason}`);
  }
  const c = await LN().checkIn(ctx, { appointmentId: r.id }, { via: "STAFF", now: at(ds, startMin - 5) });
  ok(c.ok, `เช็กอินล้ม ${c.code} ${c.reason}`);
  if (o?.start !== false) {
    const s = await LN().startJob(ctx, r.id, { now: at(ds, startMin) });
    ok(s.ok, `เริ่มงานล้ม ${fmt(s)}`);
  }
  return r.id;
}
const okF = (r: FinishResult, what: string): Extract<FinishResult, { ok: true }> => { if (!r.ok) throw new AssertFail(`${what}: ${r.code} ${r.reason}`); return r; };
const pay = async (ctx: RegCtx, actor: RegActor, heldCartId: string, amount: number, key = rid("pay"), extra: PayIn["payMethods"] = []) =>
  SB("payServiceBill")(ctx, actor, { heldCartId, payMethods: [{ type: "CASH", amountSatang: amount }, ...extra], idempotencyKey: key });
const okPay = (r: PayOut, what: string) => { if (!r.ok) throw new AssertFail(`${what}: ${r.code} ${r.message ?? ""}`); return r; };

// ═══════════════ ลูกโพรเซส (ยิงพร้อมกัน) ═══════════════
async function fanOut(key: string, perChild: CallSpec[][]): Promise<CallOut[]> {
  const n = perChild.length;
  const ready = new Set<number>();
  const res = new Map<number, CallOut[]>();
  const dead = new Set<number>();
  const errs: string[] = [];
  const kids = perChild.map((calls, idx) => {
    const ch = spawn(process.execPath, [...process.execArgv, SELF], { cwd: ROOT, env: { ...process.env, QC_B10_CHILD: JSON.stringify({ run: RUN, key, calls }) }, stdio: ["ignore", "pipe", "pipe"] });
    createInterface({ input: ch.stdout }).on("line", (l) => {
      if (l === `READY ${key}`) ready.add(idx);
      else if (l.startsWith(`RES ${key} `)) res.set(idx, JSON.parse(l.slice(`RES ${key} `.length)) as CallOut[]);
      else if (l.startsWith("CHILD_ERR")) errs.push(`#${idx} ${l}`);
    });
    let tail = "";
    ch.stderr.on("data", (b: Buffer) => { tail = (tail + b.toString()).slice(-400); });
    ch.on("exit", (code) => { dead.add(idx); if (code !== 0) errs.push(`#${idx} exit ${code} ${tail.split("\n").filter(Boolean).slice(-1)[0] ?? ""}`); });
    return ch;
  });
  const waitFor = async (cond: () => boolean, ms: number) => { const t = Date.now(); while (!cond()) { if (Date.now() - t > ms) return false; await sleep(20); } return true; };
  try {
    const allReady = await waitFor(() => ready.size === n || dead.size > 0, 240_000);
    if (!allReady || ready.size < n) throw new Error(`ลูกโพรเซสไม่พร้อม (${ready.size}/${n}) ${errs.slice(0, 2).join(" · ")}`);
    const f = goFile(RUN, key);
    writeFileSync(f, "go");
    goFiles.push(f);
    await waitFor(() => res.size + [...dead].filter((i) => !res.has(i)).length >= n, 180_000);
  } finally {
    await waitFor(() => dead.size === n, 30_000);
    for (const k of kids) if (k.exitCode === null) k.kill("SIGKILL");
  }
  if (errs.length && res.size < n) throw new Error(errs.slice(0, 2).join(" · "));
  return [...res.values()].flat();
}

// ═══════════════ ST. ไฟล์ (ก่อนแตะฐาน) ═══════════════
console.log(`\n(วันนี้ไทย ${TODAY} · วันฉาก ${dd(0)}…${dd(12)})`);
console.log("\n── ST: ไฟล์ · POS 2 จุด · ไม่มี migration ──");
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
const OWN_BOOKING = new Set<string>([F.finish, F.line, F.bsvc, F.bidx, F.today, F.actBooking, F.actLine, F.minePage, F.sheet, F.outbox, F.auto, F.wh]);
const OWN_POS = new Set<string>([F.posBill, F.posIdx, F.posHeld, F.posSvc, F.posComm, F.posUi, F.posAct]);
{
  const ch = dirty(["src", "prisma", "messages"]);
  const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.finish}`]); return true; } catch { return false; } })();
  if (ch.length === 0 && headHas) skip("ST-1", "แตะเฉพาะไฟล์ของใบ", "B.10 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ");
  else await st("ST-1", "แตะเฉพาะไฟล์ของใบ (§1) · มี finish.ts + service-bill.ts + FinishJobSheet.tsx ใหม่", () => {
    const outside = ch.filter((f) => !OWN_BOOKING.has(f) && !OWN_POS.has(f) && !/^messages\/[a-z]{2}\/pos\.json$/.test(f));
    ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 6).join(", ")}`);
    const miss = [F.finish, F.posBill, F.sheet, F.posComm].filter((f) => !ch.includes(f));
    ok(miss.length === 0, `ยังไม่แก้/สร้าง: ${miss.join(", ")}`);
  });
}
await st("ST-2", "ไม่มี migration/แก้ schema (prisma/ สะอาด)", () => { eq(dirty(["prisma"]), [], "prisma/"); });
await st("ST-3", "POS แตะเฉพาะ 2 จุด: ไฟล์ใน src/lib/modules/pos ที่เปลี่ยน ⊆ {service-bill · index · held-cart · service · staff-commission · register-ui · register-actions} · ไม่มีไฟล์ pos นอกโมดูลเปลี่ยน", () => {
  const ch = dirty(["src/lib/modules/pos", "src/app/app/sys"]);
  const bad = ch.filter((f) => !OWN_POS.has(f));
  ok(bad.length === 0, `แตะ POS นอก 2 จุด: ${bad.slice(0, 6).join(", ")}`);
});
await st("ST-4", "POS ไม่ import โมดูล booking (เส้นเดิม booking→pos เท่านั้น) · service-bill.ts/staff-commission.ts ไม่อ่านค่าตั้ง booking.*", () => {
  const bad: string[] = [];
  for (const f of OWN_POS) {
    const s = stripComments(src(f));
    if (/from\s+["']@\/lib\/modules\/booking|import\(\s*["']@\/lib\/modules\/booking/.test(s)) bad.push(`${f} import booking`);
    if ((f === F.posBill || f === F.posComm) && /["']booking\.money\./.test(s)) bad.push(`${f} อ่าน booking.money.*`);
  }
  ok(existsSync(join(ROOT, F.posBill)), `ยังไม่มี ${F.posBill}`);
  ok(bad.length === 0, bad.join(" · "));
});
await st("ST-5", "วินัย CAS + เวลาไทย: finish.ts ไม่มี `.appointment.update(` · ไม่มี getDay/getHours ดิบ · ไม่มีตัวกันในหน่วยความจำ", () => {
  ok(existsSync(join(ROOT, F.finish)), `ยังไม่มี ${F.finish}`);
  const s = stripComments(src(F.finish));
  ok(!/\.appointment\.update\s*\(/.test(s), "มี .appointment.update( แบบไม่ CAS");
  ok(!/\.(getDay|getHours|getMinutes|getDate|getMonth|getFullYear)\s*\(\s*\)|toLocaleDateString/.test(s), "มีเวลาเครื่องดิบ");
  ok(!/new\s+Mutex|async-mutex|new\s+Map<[^>]*Promise/.test(s), "มีตัวกันในหน่วยความจำ");
}, "MAJOR");
await st("ST-6", "setStatusAction: สาขาเดิมคงคีย์ `booking-sale-${appt.id}` (hf-o23 ST6) + สาขา V2 เรียก ensureServiceBill · completeJobAction เรียก finishJob", () => {
  const b = src(F.actBooking);
  ok(b.includes("idempotencyKey: `booking-sale-${appt.id}`"), "คีย์บิลเดิมของสาขา _fallback หาย");
  ok(/ensureServiceBill/.test(stripComments(b)), "setStatusAction ยังไม่เรียก ensureServiceBill");
  ok(/finishJob/.test(stripComments(src(F.actLine))), "booking-line.ts ยังไม่เรียก finishJob");
}, "MAJOR");

// ═══════════════ เตรียมข้อมูล ═══════════════
let setupOk = false;
let tplOk = false;
const need = () => ok(setupOk, "สร้างข้อมูลทดสอบไม่สำเร็จ (ดูบรรทัดบน)");
const needTpl = () => { need(); ok(tplOk, "ตั้งแม่แบบ/ค่าคอมฯ ไม่สำเร็จ (T-0)"); };
// สถานะที่ข้อต่อ ๆ ไปใช้ร่วม
const S: {
  main?: string; mainCart?: string; mainSale?: string; depositReceipt?: string; preview?: Preview;
  r?: string; rSale?: string; a?: string; aCart?: string; aLive?: string; x?: string; xCart?: string; xb?: string; xbCart?: string; sAuth?: string;
} = {};

try {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length} ร้าน)`); await cleanup(stale); }
  await cleanupUsers();

  try {
    for (const [id, n] of [[ids.tA, "a"], [ids.tB, "b"]] as const) {
      SLUGS[id] = `${SLUG}${n}-${RUN}`;
      await insertRow("Tenant", { id, name: `QC B10 ร้าน ${n}`, slug: SLUGS[id], updatedAt: new Date() });
    }
    for (const [id, t, n] of [[ids.uA, ids.tA, "a"], [ids.uN, ids.tA, "nopos"], [ids.uL, ids.tA, "legacy"], [ids.uB, ids.tB, "b"]] as const) {
      SLUGS[id] = `b10-${n}-${RUN}`;
      await insertRow("BusinessUnit", { id, tenantId: t, type: "BOOKING", name: `สาขา ${n}`, slug: SLUGS[id], updatedAt: new Date() });
      for (let w = 0; w < 7; w++) await insertRow("BookingHours", { id: rid("bh"), tenantId: t, unitId: id, weekday: w, openMin: 600, closeMin: 1200, closed: false, updatedAt: new Date() });
    }
    const svc = (id: string, t: string, u: string, name: string, durationMin: number, priceSatang: number, depositSatang = 0) =>
      insertRow("BookingService", { id, tenantId: t, unitId: u, name, durationMin, priceSatang, bufferMin: 0, depositSatang, bookable: true, active: true, sortOrder: 0, updatedAt: new Date() });
    await svc(ids.COLOR, ids.tA, ids.uA, "ทำสีผม", 90, 90000, 20000);
    await svc(ids.TREAT, ids.tA, ids.uA, "ทรีตเมนต์บำรุงสี", 30, 30000);
    await svc(ids.CUT, ids.tA, ids.uA, "ตัดผมชาย", 45, 25000);
    await svc(ids.ODD, ids.tA, ids.uA, "บริการเศษสตางค์", 30, 33333);
    await svc(ids.CUTN, ids.tA, ids.uN, "ตัดผมชาย", 45, 25000);
    await svc(ids.CUTL, ids.tA, ids.uL, "ตัดผมชาย", 45, 25000);
    await svc(ids.CUTB, ids.tB, ids.uB, "ตัดผมชาย", 45, 25000);
    let ord = 0;
    const staff = (id: string, t: string, u: string, name: string, employeeId: string | null = null) =>
      insertRow("BookingStaff", { id, tenantId: t, unitId: u, name, sortOrder: ++ord, active: true, employeeId, createdAt: new Date(Date.now() - 600_000 + ord * 1000), updatedAt: new Date() });
    // HR: ช่างเอก/ช่างบอย ผูกผู้ใช้ · ช่างแจ๊ค ไม่มีพนักงาน (CC §10 ข้อ 2)
    await insertRow("AppSystem", { id: ids.hrA, tenantId: ids.tA, type: "HR", name: "ทีมงาน QC B10", updatedAt: new Date() });
    await insertRow("HrEmployee", { id: ids.empEk, tenantId: ids.tA, systemId: ids.hrA, name: "ช่างเอก", linkedUserId: ids.uEk, active: true, updatedAt: new Date() });
    await insertRow("HrEmployee", { id: ids.empBoy, tenantId: ids.tA, systemId: ids.hrA, name: "ช่างบอย", linkedUserId: ids.uBoy, active: true, updatedAt: new Date() });
    await staff(ids.ek, ids.tA, ids.uA, "ช่างเอก", ids.empEk);
    await staff(ids.boy, ids.tA, ids.uA, "ช่างบอย", ids.empBoy);
    await staff(ids.jack, ids.tA, ids.uA, "ช่างแจ๊ค");
    await staff(ids.nn, ids.tA, ids.uN, "ช่างไม่มี POS");
    await staff(ids.ll, ids.tA, ids.uL, "ช่างร้านเดิม");
    await staff(ids.bb, ids.tB, ids.uB, "ช่างร้าน B");
    // POS: ระบบเดียวผูก uA + uL · กะไม่บังคับ · ค่าคอมฯ ผู้ขายเปิด 3% (ตัวควบคุม P-2 · บิล BOOKING ต้องไม่ไปที่ผู้ขาย)
    const posSettings = JSON.stringify({ pos: { shift: { required: { register: false, otherSources: false } }, staffCommission: { enabled: true, defaultBp: 300, sellerRoles: ["OWNER", "MANAGER", "STAFF"], skipDealBills: true } } });
    await insertRow("AppSystem", { id: ids.posA, tenantId: ids.tA, type: "POS", name: "ขายหน้าร้าน QC B10", settings: posSettings, updatedAt: new Date() });
    await insertRow("AppSystem", { id: ids.posB, tenantId: ids.tB, type: "POS", name: "ขายหน้าร้าน QC B10 ร้าน B", settings: posSettings, updatedAt: new Date() });
    for (const [t, s, u] of [[ids.tA, ids.posA, ids.uA], [ids.tA, ids.posA, ids.uL], [ids.tB, ids.posB, ids.uB]] as const) {
      await insertRow("AppSystemUnit", { id: rid("asu"), tenantId: t, systemId: s, unitId: u, type: "POS" });
    }
    for (const [id, t, s] of [[ids.WAX, ids.tA, ids.posA], [ids.WAXB, ids.tB, ids.posB]] as const) {
      await insertRow("PosProduct", { id, tenantId: t, systemId: s, unitId: null, kind: "PRODUCT", name: "แว็กซ์จัดแต่งทรง", basePriceSatang: 29000, trackStock: false, images: "[]", updatedAt: new Date() });
    }
    const users: [string, string, string, string, string[], Record<string, boolean>][] = [
      [ids.uOwner, "owner", ids.tA, "OWNER", ["*"], {}],
      [ids.uEk, "ek", ids.tA, "STAFF", [ids.uA], { "booking.job.run": true }],
      [ids.uBoy, "boy", ids.tA, "STAFF", [ids.uA], { "booking.job.run": true }],
      [ids.uCash, "cash", ids.tA, "STAFF", [ids.uA, ids.uL], { "pos.sale.create": true, "booking.checkin": true }],
      [ids.uMgr, "mgr", ids.tA, "MANAGER", [ids.uA], {}],
      [ids.uOwnerB, "ownerb", ids.tB, "OWNER", ["*"], {}],
    ];
    for (const [uid, k, t, role, ua, perms] of users) {
      await insertRow("User", { id: uid, email: `${USER_MAIL}${k}-${RUN}@qc.invalid`, name: `QC B10 ${k}`, updatedAt: new Date() });
      await insertRow("Membership", { id: rid("mb"), userId: uid, tenantId: t, role, unitAccess: JSON.stringify(ua), permissions: JSON.stringify(perms), acceptedAt: new Date(), updatedAt: new Date() });
    }
    setupOk = true;
  } catch (e) {
    console.log(`  ❌ สร้างข้อมูลทดสอบไม่สำเร็จ: ${errMsg(e)}`);
  }

  console.log("\n── T: แม่แบบ BARBER + ค่าคอมฯ ภาพ 07 (บริการ 10% · สินค้า 5% · ช่างบอย 12.5%/0%) ──");
  await st("T-0", "applyTemplate BARBER ที่ uA · uN · uB (uL = ร้านเดิมไม่เลือกแม่แบบ) · commissionRate UNIT uA {1000, 500} · STAFF ช่างบอย {1250, 0} · commissionTo PERFORMER · มัดจำ PER_SERVICE", async () => {
    need();
    for (const [t, u, a] of [[ids.tA, ids.uA, OWNER], [ids.tA, ids.uN, OWNER], [ids.tB, ids.uB, OWNER_BS]] as const) {
      const r = await SETTINGS().applyTemplate(a, { tenantId: t }, { unitId: u, domain: "booking", templateKey: "BARBER", overwrite: "RESET_ALL" });
      ok(r.ok, `applyTemplate ${u}: ${r.code} ${fmt(r.issues)}`);
    }
    const s = await SETTINGS().setSettings(OWNER, { tenantId: ids.tA }, [
      { key: "booking.money.commissionTo", scope: "UNIT", scopeId: ids.uA, value: "PERFORMER" },
      // README จองคิว: ทำสี มัดจำ ฿200 = ตามที่ตั้งในบริการ (แม่แบบ BARBER ปริยาย = 20% ของบริการ ≥ 90 นาที ⇒ ฿180)
      { key: "booking.deposit.amount", scope: "UNIT", scopeId: ids.uA, value: { mode: "PER_SERVICE" } },
      { key: "booking.money.commissionRate", scope: "UNIT", scopeId: ids.uA, value: { serviceBp: 1000, productBp: 500 } },
      { key: "booking.money.commissionRate", scope: "STAFF", scopeId: ids.boy, value: { serviceBp: 1250, productBp: 0 } },
    ]);
    ok(s.ok, `setSettings: ${s.code} ${fmt(s.issues)}`);
    tplOk = true;
  });

  // ═══════════════ P. ตัวควบคุมบวก ═══════════════
  console.log("\n── P: ตัวควบคุมบวก (POS จริงทำงาน) ──");
  await st("P-1", "มัดจำจริง: จองทำสีผม (มัดจำ ฿200) → recordDeposit PROMPTPAY ⇒ PosDeposit OPEN 20000 + ใบรับ POS_DEPOSIT (ใช้ต่อในฉาก F)", async () => {
    needTpl();
    S.main = await bookInService(cA, ids.COLOR, ids.ek, dd(0), 13 * 60 + 30, { deposit: true, name: "ธนา" });
    const a = await apRow(S.main);
    eq(a.depositSatang, 20000, "Appointment.depositSatang");
    ok(!!a.depositSaleId && !!a.depositPaidAt, "ไม่มีใบรับมัดจำบนนัด");
    S.depositReceipt = a.depositSaleId!;
    const d = await depositOf(S.depositReceipt);
    eq(d && { status: d.status, amountSatang: d.amountSatang, usedSatang: d.usedSatang }, { status: "OPEN", amountSatang: 20000, usedSatang: 0 }, "PosDeposit");
    eq(a.status, "IN_SERVICE", "สถานะนัดหลังเริ่ม");
  });
  await st("P-2", "ค่าคอมฯ ผู้ขายของบิลหน้าร้านปกติ (createSale POS · ผู้ขายแคชเชียร์ · ฿100) + ตัวรับ pos.sale.paid ⇒ ACCRUE ฿3.00 ให้แคชเชียร์ (เครื่องค่าคอมฯ ทำงานจริง)", async () => {
    needTpl();
    const r = await POS().createSale({ tenantId: ids.tA, unitId: ids.uA, systemId: ids.posA, sourceModule: "POS", idempotencyKey: `qcb10-ctrl-${RUN}`, soldByUserId: ids.uCash, shiftId: null, lines: [{ name: "สินค้าควบคุม", qty: 1, unitPriceSatang: 10000 }], payMethods: [{ type: "CASH", amountSatang: 10000 }] });
    await consume(ids.tA, "pos.sale.paid", r.saleId);
    const c = await commOf(r.saleId);
    eq(c.map((x) => [x.kind, x.userId, x.amountSatang]), [["ACCRUE", ids.uCash, 300]], "สมุดค่าคอมฯ ของบิลควบคุม");
  });
  await st("P-3", "facade serviceBills.openServiceBill ทำงานตรง: เปิดบิลพัก serviceJobId ⇒ created:true · เรียกซ้ำคีย์งานเดิม ⇒ id เดิม created:false · แถวเดียว HELD · discard ⇒ DISCARDED", async () => {
    needTpl();
    const fake = T("fakeJob");
    const line: SBLineIn = { kind: "SERVICE", name: "บริการควบคุม", qty: 1, unitPriceSatang: 12345, productId: null, serviceId: ids.CUT, performerEmployeeId: ids.empEk, commissionBp: 1000 };
    const a = await SB("openServiceBill")({ tenantId: ids.tA, unitId: ids.uA, appointmentId: fake, label: "ควบคุม", lines: [line], actorUserId: ids.uOwner });
    ok(a.ok && a.created === true, `ครั้งแรก: ${fmt(a)}`);
    const b = await SB("openServiceBill")({ tenantId: ids.tA, unitId: ids.uA, appointmentId: fake, label: "ควบคุม", lines: [line], actorUserId: ids.uOwner });
    ok(b.ok && b.created === false && a.ok && b.heldCartId === a.heldCartId, `ครั้งที่สอง: ${fmt(b)}`);
    const rows = await cartsOf(fake);
    eq(rows.map((r) => [r.status, r.unitId, r.systemId]), [["HELD", ids.uA, ids.posA]], "แถวบิลพัก");
    const d = await SB("discardServiceBill")({ tenantId: ids.tA, unitId: ids.uA, appointmentId: fake, actorUserId: ids.uOwner, reason: "ล้างตัวควบคุม" });
    ok(d.ok, `discard: ${fmt(d)}`);
    eq((await cartsOf(fake)).map((r) => r.status), ["DISCARDED"], "หลังทิ้ง");
  });

  // ═══════════════ F. ฉากภาพ 07 ═══════════════
  console.log("\n── F: ฉากภาพ 07 — ฿900 + ฿300 + ฿290 − ฿200 = ฿1,290 · ค่าคอมฯ ฿134.50 ──");
  const EXTRAS: ExtraLine[] = [{ kind: "SERVICE", serviceId: ids.TREAT }, { kind: "PRODUCT", productId: ids.WAX, qty: 1 }];
  const mainId = () => { ok(!!S.main, "ไม่มีนัดฉากหลัก (P-1)"); return S.main!; };
  const needCart = () => { mainId(); ok(!!S.mainCart, "ไม่มีบิลจากคิวของฉากหลัก (F-3)"); };
  const needSale = () => { needCart(); ok(!!S.mainSale, "ไม่มีบิลขายของฉากหลัก (F-8)"); };
  await st("F-1", "previewServiceBill (ของเพิ่ม: ทรีตเมนต์ + แว็กซ์) ⇒ บรรทัด [฿900 BOOKED · ฿300 EXTRA · ฿290 PRODUCT] ผู้ทำช่างเอกทุกบรรทัด · bp [1000,1000,500] · รวม ฿1,490 − มัดจำ ฿200 = ฿1,290 · billStatus NONE", async () => {
    const p = await FN("previewServiceBill")(cA, mainId(), { extras: EXTRAS });
    ok(!!p, "preview null");
    S.preview = p!;
    eq(p!.lines.map((l) => [l.kind, l.source, l.amountSatang, l.unitPriceSatang, l.qty, l.performerStaffId, l.performerEmployeeId, l.commissionBp]), [
      ["SERVICE", "BOOKED", 90000, 90000, 1, ids.ek, ids.empEk, 1000],
      ["SERVICE", "EXTRA", 30000, 30000, 1, ids.ek, ids.empEk, 1000],
      ["PRODUCT", "EXTRA", 29000, 29000, 1, ids.ek, ids.empEk, 500],
    ], "บรรทัด");
    eq([p!.subtotalSatang, p!.depositSatang, p!.dueSatang, p!.billStatus, p!.pos, p!.heldCartId], [149000, 20000, 129000, "NONE", true, null], "ยอด");
    eq([p!.lines[0].serviceId, p!.lines[1].serviceId, p!.lines[2].productId], [ids.COLOR, ids.TREAT, ids.WAX], "id ต้นทาง");
  });
  await st("F-2", "ราคาจาก client ไม่ถูกเชื่อ: ของเพิ่มที่มี unitPriceSatang/amount แปลก ๆ ⇒ ราคา server เท่าเดิม · id ต่างสาขา/ร้าน (CUTB · WAXB) ⇒ BAD_INPUT ไม่เปิดบิล", async () => {
    const tainted = [{ kind: "SERVICE", serviceId: ids.TREAT, unitPriceSatang: 1 }, { kind: "PRODUCT", productId: ids.WAX, qty: 1, unitPriceSatang: 1 }] as unknown as ExtraLine[];
    const p = await FN("previewServiceBill")(cA, mainId(), { extras: tainted });
    eq(p?.subtotalSatang, 149000, "ราคาเมื่อ client แนบราคา");
    for (const bad of [[{ kind: "SERVICE", serviceId: ids.CUTB }], [{ kind: "PRODUCT", productId: ids.WAXB, qty: 1 }], [{ kind: "PRODUCT", productId: ids.WAX, qty: 0 }]] as ExtraLine[][]) {
      const r = await FN("finishJob")(cA, mainId(), { extras: bad, now: at(dd(0), 15 * 60) });
      ok(!r.ok && r.code === "BAD_INPUT", `ของผิด ${fmt(bad)} ⇒ ${fmt(r)}`);
    }
    eq((await apRow(mainId())).status, "IN_SERVICE", "งานยังกำลังทำ (ไม่มีอะไรถูกเขียน)");
    eq((await cartsOf(mainId())).length, 0, "ไม่มีบิลพัก");
  });
  await st("F-3", "finishJob 15:01 ⇒ ok · นัด DONE doneAt 15:01 + heldCartId · บัตร DONE · booking.completed 1 · PosHeldCart serviceJobId HELD 3 บรรทัด ของสาขา/ระบบ POS ถูก", async () => {
    const r = okF(await FN("finishJob")(cA, mainId(), { extras: EXTRAS, now: at(dd(0), 15 * 60 + 1) }), "finishJob");
    eq([r.already, r.needsPayment], [false, "POS"], "ผล");
    ok(!!r.heldCartId, "ไม่มี heldCartId");
    S.mainCart = r.heldCartId!;
    const a = await apRow(mainId());
    eq([a.status, a.doneAt?.getTime(), a.heldCartId], ["DONE", at(dd(0), 15 * 60 + 1).getTime(), S.mainCart], "แถวนัด");
    const [tk] = await q<{ status: string }>(`SELECT status::text AS status FROM "QueueTicket" WHERE id = $1`, [a.queueTicketId]);
    eq(tk?.status, "DONE", "บัตร");
    eq(await evCount(ids.tA, `booking.completed#${mainId()}`), 1, "booking.completed");
    const carts = await cartsOf(mainId());
    eq(carts.map((c) => [c.id, c.status, c.unitId, c.systemId, c.lineCount]), [[S.mainCart, "HELD", ids.uA, ids.posA, 3]], "บิลพัก");
  });
  await st("F-4", "กดเสร็จซ้ำ (finishJob · completeJob · ensureServiceBill) ⇒ ok already:true บิลเดิม · บิลพักยัง 1 แถว · booking.completed ยัง 1", async () => {
    const r1 = okF(await FN("finishJob")(cA, mainId(), { extras: [], now: at(dd(0), 15 * 60 + 2) }), "finishJob ซ้ำ");
    eq([r1.already, r1.heldCartId], [true, S.mainCart], "finishJob ซ้ำ");
    const r2 = okF(await FN("ensureServiceBill")(cA, mainId()), "ensureServiceBill");
    eq(r2.heldCartId, S.mainCart, "ensureServiceBill");
    const r3 = await LN().completeJob(cA, mainId(), { now: at(dd(0), 15 * 60 + 3) });
    ok(!r3.ok || r3.ok, "completeJob ไม่ throw");
    eq((await cartsOf(mainId())).length, 1, "จำนวนบิลพัก");
    eq(await evCount(ids.tA, `booking.completed#${mainId()}`), 1, "booking.completed");
  });
  await st("F-5", "หน้าขาย: serviceBillView ⇒ ฿1,490 / มัดจำ ฿200 (ใบรับเดิม) / ต้องจ่าย ฿1,290 · listServiceBills ขึ้นทุกเครื่องของสาขา (เครื่อง 2 ก็เห็น) ยอด ฿1,290", async () => {
    needCart();
    const v = await SB("serviceBillView")(rA, CASHIER, { heldCartId: S.mainCart ?? "" });
    ok(v.ok, `view: ${fmt(v)}`);
    const vv = v as SBView;
    eq([vv.subtotalSatang, vv.depositSatang, vv.dueSatang, vv.deposit?.receiptSaleId, vv.deposit?.satang, vv.appointmentId], [149000, 20000, 129000, S.depositReceipt, 20000, mainId()], "ยอด");
    eq(vv.lines.map((l) => [l.amountSatang, l.performerEmployeeId]), [[90000, ids.empEk], [30000, ids.empEk], [29000, ids.empEk]], "บรรทัด");
    const l = await SB("listServiceBills")(rA2, CASHIER);
    ok(l.ok, `list: ${fmt(l)}`);
    const it = (l as Extract<typeof l, { ok: true }>).items.find((x) => x.heldCartId === S.mainCart);
    eq(it && [it.appointmentId, it.subtotalSatang, it.depositSatang, it.dueSatang], [mainId(), 149000, 20000, 129000], "รายการในลิ้นชักเครื่อง 2");
  });
  await st("F-6", "บิลจากคิวเรียกคืนทางบิลพักปกติไม่ได้ (recallHeldCart) — แถวยัง HELD (ไม่หลุดเป็นบิลหน้าร้านราคาแคตตาล็อก)", async () => {
    needCart();
    const h = await tryImport<HeldApi>("@/lib/modules/pos/held-cart");
    ok(!!h.mod, h.err);
    const r = await h.mod!.recallHeldCart(rA, CASHIER, { id: S.mainCart ?? "" });
    ok(r.ok === false, `เรียกคืนได้: ${fmt(r)}`);
    eq((await cartsOf(mainId())).map((c) => c.status), ["HELD"], "สถานะบิลพัก");
  });
  await st("F-7", "จ่ายผิด: CASH ฿1,000 ⇒ PAYMENT_MISMATCH · ส่งแถว DEPOSIT เอง ⇒ VALIDATION · ไม่มีบิลขาย · บิลพัก HELD · มัดจำไม่ถูกแตะ", async () => {
    needCart();
    const a = await pay(rA, CASHIER, S.mainCart ?? "", 100000);
    ok(isRefusal(a) && a.code === "PAYMENT_MISMATCH", `ยอดขาด: ${fmt(a)}`);
    const b = await pay(rA, CASHIER, S.mainCart ?? "", 129000, rid("pay"), [{ type: "DEPOSIT", amountSatang: 20000 }]);
    ok(isRefusal(b) && b.code === "VALIDATION", `ส่ง DEPOSIT เอง: ${fmt(b)}`);
    eq((await salesOf(ids.tA, mainId())).length, 0, "บิลขาย");
    eq((await cartsOf(mainId())).map((c) => c.status), ["HELD"], "บิลพัก");
    eq((await depositOf(S.depositReceipt ?? ""))?.usedSatang, 0, "มัดจำใช้ไป");
  });
  await st("F-8", "จ่าย CASH ฿1,290 ⇒ บิล BOOKING 1 ใบ: grand ฿1,490 · แถวจ่าย CASH 129000 + DEPOSIT 20000 อ้างใบรับ · sourceId = นัด · คีย์ bq-sale-<นัด> · บรรทัด 3 พร้อม performerEmployeeId · มัดจำใช้ครบ · บิลพักไม่ HELD", async () => {
    needCart();
    const r = okPay(await pay(rA, CASHIER, S.mainCart ?? "", 129000, `qcb10-main-${RUN}`), "จ่าย");
    S.mainSale = r.saleId;
    eq([r.grandTotalSatang, r.duplicated], [149000, false], "ผลจ่าย");
    const sales = await salesOf(ids.tA, mainId());
    eq(sales.map((s) => [s.id, s.status, s.grandTotalSatang, s.idempotencyKey, s.soldByUserId]), [[r.saleId, "PAID", 149000, `bq-sale-${mainId()}`, ids.uCash]], "บิลขาย");
    eq(await paysOf(r.saleId), [{ type: "CASH", amountSatang: 129000, refSaleId: null }, { type: "DEPOSIT", amountSatang: 20000, refSaleId: S.depositReceipt ?? null }], "แถวจ่าย");
    eq((await linesOf(r.saleId)).map((l) => [l.lineTotalSatang, l.qty, l.performerEmployeeId, l.serviceId, l.productId]), [
      [90000, 1, ids.empEk, ids.COLOR, null], [30000, 1, ids.empEk, ids.TREAT, null], [29000, 1, ids.empEk, null, ids.WAX],
    ], "บรรทัดบิล");
    const d = await depositOf(S.depositReceipt ?? "");
    eq([d?.usedSatang, d?.status !== "OPEN"], [20000, true], "มัดจำ");
    eq((await cartsOf(mainId())).map((c) => c.status !== "HELD"), [true], "บิลพักถูกใช้แล้ว");
    const st2 = await SB("serviceBillStatus")(ids.tA, ids.uA, mainId());
    eq(st2 && [st2.status, st2.saleId], ["PAID", r.saleId], "serviceBillStatus");
  });
  await st("F-9", "จ่ายซ้ำ: คีย์เดิม ⇒ duplicated:true บิลเดิม · คีย์ใหม่ ⇒ SERVICE_BILL_PAID · ยังมีบิล BOOKING 1 ใบ · มัดจำใช้ 20000 (ไม่ซ้อน)", async () => {
    needSale();
    const a = await pay(rA, CASHIER, S.mainCart ?? "", 129000, `qcb10-main-${RUN}`);
    ok(a.ok && a.duplicated === true && a.saleId === S.mainSale, `คีย์เดิม: ${fmt(a)}`);
    const b = await pay(rA2, CASHIER, S.mainCart ?? "", 129000);
    ok(isRefusal(b) && b.code === "SERVICE_BILL_PAID", `คีย์ใหม่: ${fmt(b)}`);
    eq((await salesOf(ids.tA, mainId())).length, 1, "บิลขาย");
    eq((await depositOf(S.depositReceipt ?? ""))?.usedSatang, 20000, "มัดจำใช้ไป");
  });
  await st("F-10", "ตัวรับ pos.sale.paid ⇒ ค่าคอมฯ ช่างเอก ACCRUE [9000 · 3000 · 1450] Σ ฿134.50 (userId = ผู้ใช้ที่ผูก · employeeId = ช่างเอก · ฐาน = ยอดบรรทัด ไม่หักมัดจำ) · ไม่มีแถวของแคชเชียร์ (คนกดขาย)", async () => {
    needSale();
    await consume(ids.tA, "pos.sale.paid", S.mainSale ?? "");
    const c = await commOf(S.mainSale ?? "");
    eq(c.map((x) => [x.kind, x.userId, x.employeeId, x.amountSatang, x.baseSatang, x.rateBp]), [
      ["ACCRUE", ids.uEk, ids.empEk, 9000, 90000, 1000], ["ACCRUE", ids.uEk, ids.empEk, 3000, 30000, 1000], ["ACCRUE", ids.uEk, ids.empEk, 1450, 29000, 500],
    ], "สมุดค่าคอมฯ");
    eq(c.reduce((t, x) => t + x.amountSatang, 0), SQC_DONE_POS_SCENE.expect.p004.commissionSatang, "Σ ฿134.50");
    ok(!c.some((x) => x.userId === ids.uCash), "มีแถวของคนกดขาย");
  });
  await st("F-11", "booking.paid 1 แถว (คีย์ booking.paid#<นัด>) · payload {appointmentId unitId staffId kind channel saleId amountSatang via:POS} · ไม่มีชื่อ/เบอร์", async () => {
    needSale();
    const rows = await q<{ payload: Record<string, unknown> }>(`SELECT payload FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'booking.paid' AND "idempotencyKey" = $2`, [ids.tA, `booking.paid#${mainId()}`]);
    eq(rows.length, 1, "จำนวน booking.paid");
    const p = rows[0].payload;
    eq([p.appointmentId, p.unitId, p.staffId, p.saleId, p.via], [mainId(), ids.uA, ids.ek, S.mainSale, "POS"], "payload");
    ok(typeof p.amountSatang === "number", "amountSatang");
    ok(!["kind", "channel"].some((k) => !(k in p)), "ขาด kind/channel");
    const s = JSON.stringify(p);
    ok(!PHONES.some((x) => s.includes(x.slice(1))) && !NAMES.some((x) => s.includes(x)), "payload มี PII");
  });
  await st("F-12", "X4: ตัวรับ pos.sale.paid ซ้ำ 2 รอบ + พร้อมกัน 3 ทาง (ในโพรเซส) + 4 โพรเซสแยก ⇒ สมุดค่าคอมฯ เท่าเดิม (3 แถว Σ 13450) · booking.paid ยัง 1 · ไม่มีใครโยน", async () => {
    needSale();
    await consume(ids.tA, "pos.sale.paid", S.mainSale ?? "");
    const evIds = await consume(ids.tA, "pos.sale.paid", S.mainSale ?? "");
    const h = (await CONSUMERS())["pos.sale.paid"];
    const evs = await q<{ id: string; tenantId: string; type: string; payload: unknown; systemId: string | null; unitId: string | null }>(`SELECT id, "tenantId", type, payload, "systemId", "unitId" FROM "OutboxEvent" WHERE id = ANY($1::text[])`, [evIds]);
    await Promise.all([h(evs[0]), h(evs[0]), h(evs[0])]);
    const outs = await fanOut("x4", [0, 1, 2, 3].map(() => [{ fn: "consume", eventId: evIds[0] } as CallSpec]));
    ok(outs.length === 4 && outs.every((o) => o.ok && !o.threw), `ลูกโพรเซส: ${fmt(outs)}`);
    const c = await commOf(S.mainSale ?? "");
    eq([c.length, c.reduce((t, x) => t + x.amountSatang, 0)], [3, 13450], "สมุดค่าคอมฯ");
    eq(await evCount(ids.tA, `booking.paid#${mainId()}`), 1, "booking.paid");
  });
  await st("F-13", "หลังจ่าย: amendServiceBill / cancelServiceBill ⇒ BILL_PAID · setAppointmentStatus ออกจาก DONE ⇒ ok:false (ไม่ทิ้งเงินเงียบ)", async () => {
    needSale();
    const a = await FN("amendServiceBill")(cA, mainId(), { extras: [] });
    ok(!a.ok && a.code === "BILL_PAID", `amend: ${fmt(a)}`);
    const c = await FN("cancelServiceBill")(cAmgr, mainId(), { reason: "ทดสอบหลังจ่าย" });
    ok(!c.ok && c.code === "BILL_PAID", `cancel: ${fmt(c)}`);
    const s = await BK().setAppointmentStatus(ids.tA, ids.uA, mainId(), "CONFIRMED");
    ok(s.ok === false, `ออกจาก DONE ได้: ${fmt(s)}`);
    eq((await apRow(mainId())).status, "DONE", "สถานะนัด");
  }, "MAJOR");

  // ═══════════════ R. void ⇒ REVERSE ═══════════════
  console.log("\n── R: void บิล BOOKING ⇒ ค่าคอมฯ REVERSE ──");
  await st("R-1", "ตัดผม ฿250 ช่างเอก → เสร็จ → จ่าย → ACCRUE 2500 → voidSale + ตัวรับ pos.sale.voided ⇒ REVERSE −2500 (ผู้ทำเดิม) · Σ 0 · ไม่มีแถวคนกดขาย", async () => {
    needTpl();
    S.r = await bookInService(cA, ids.CUT, ids.ek, dd(1), 600);
    const f = okF(await FN("finishJob")(cA, S.r, { now: at(dd(1), 650) }), "finish");
    const p = okPay(await pay(rA, CASHIER, f.heldCartId ?? "", 25000), "จ่าย");
    S.rSale = p.saleId;
    await consume(ids.tA, "pos.sale.paid", p.saleId);
    eq((await commOf(p.saleId)).map((x) => [x.kind, x.userId, x.amountSatang]), [["ACCRUE", ids.uEk, 2500]], "ACCRUE");
    await POS().voidSale(ids.tA, ids.uA, p.saleId, { actorUserId: ids.uOwner, reason: "QC B10 void" });
    await consume(ids.tA, "pos.sale.voided", p.saleId);
    const c = await commOf(p.saleId);
    eq(c.map((x) => [x.kind, x.userId, x.employeeId, x.amountSatang]), [["ACCRUE", ids.uEk, ids.empEk, 2500], ["REVERSE", ids.uEk, ids.empEk, -2500]], "หลัง void");
    ok(!c.some((x) => x.userId === ids.uCash), "มีแถวคนกดขาย");
  });

  // ═══════════════ C. ค่าคอมฯ ═══════════════
  console.log("\n── C: ค่าคอมฯ ตามผู้ให้บริการ ──");
  const paidComm = async (ctx: Ctx, id: string, extras: ExtraLine[], ds: string, endMin: number, amount: number): Promise<CommRow[]> => {
    const f = okF(await FN("finishJob")(ctx, id, { extras, now: at(ds, endMin) }), "finish");
    const p = okPay(await pay(rA, CASHIER, f.heldCartId ?? "", amount), "จ่าย");
    await consume(ids.tA, "pos.sale.paid", p.saleId);
    return commOf(p.saleId);
  };
  await st("C-1", "ชั้น STAFF ชนะ + ปัดครึ่งขึ้น: ช่างบอย (บริการ 12.5% · สินค้า 0%) ทำบริการ ฿333.33 + ขายแว็กซ์ ⇒ แถวเดียว 4167 (33333 × 1250 / 10000 = 4166.625) · แว็กซ์ 0% ไม่มีแถว", async () => {
    needTpl();
    const id = await bookInService(cA, ids.ODD, ids.boy, dd(2), 600);
    const c = await paidComm({ ...cA, actorUserId: ids.uBoy }, id, [{ kind: "PRODUCT", productId: ids.WAX, qty: 1 }], dd(2), 630, 33333 + 29000 - 0);
    eq(c.map((x) => [x.kind, x.userId, x.employeeId, x.amountSatang, x.rateBp]), [["ACCRUE", ids.uBoy, ids.empBoy, halfUp(33333 * 1250, 10000), 1250]], "สมุด");
    eq(halfUp(33333 * 1250, 10000), 4167, "เลขคาด");
  });
  await st("C-2", "ผู้ทำไม่มีพนักงาน (ช่างแจ๊ค) ⇒ performerEmployeeId null บนบรรทัด · ไม่มีแถวค่าคอมฯ ทั้งบิล (ไม่ตกไปที่คนกดขาย)", async () => {
    needTpl();
    const id = await bookInService(cA, ids.CUT, ids.jack, dd(3), 600);
    const f = okF(await FN("finishJob")(cA, id, { now: at(dd(3), 650) }), "finish");
    const p = okPay(await pay(rA, CASHIER, f.heldCartId ?? "", 25000), "จ่าย");
    eq((await linesOf(p.saleId)).map((l) => l.performerEmployeeId), [null], "บรรทัด");
    await consume(ids.tA, "pos.sale.paid", p.saleId);
    eq(await commOf(p.saleId), [], "สมุด");
  });
  await st("C-3", "commissionTo snapshot ตอนเปิดบิล: ตั้ง OFF → เสร็จ (บิลพัก bp null) → ตั้งกลับ PERFORMER → จ่าย ⇒ ไม่มีแถวค่าคอมฯ (ค่าตั้งใหม่ไม่ย้อน)", async () => {
    needTpl();
    const id = await bookInService(cA, ids.CUT, ids.ek, dd(4), 600);
    const off = await SETTINGS().setSettings(OWNER, { tenantId: ids.tA }, [{ key: "booking.money.commissionTo", scope: "UNIT", scopeId: ids.uA, value: "OFF" }]);
    ok(off.ok, `ตั้ง OFF: ${off.code}`);
    let f: FinishResult | null = null;
    try {
      f = await FN("finishJob")(cA, id, { now: at(dd(4), 650) });
      const pv = await FN("previewServiceBill")(cA, id);
      eq(pv?.lines.map((l) => l.commissionBp), [null], "bp ในบิลพักตอน OFF");
    } finally {
      const on = await SETTINGS().setSettings(OWNER, { tenantId: ids.tA }, [{ key: "booking.money.commissionTo", scope: "UNIT", scopeId: ids.uA, value: "PERFORMER" }]);
      ok(on.ok, `ตั้งกลับ: ${on.code}`);
    }
    ok(!!f, "finishJob ไม่คืนผล");
    const ff = okF(f!, "finish");
    const p = okPay(await pay(rA, CASHIER, ff.heldCartId ?? "", 25000), "จ่าย");
    await consume(ids.tA, "pos.sale.paid", p.saleId);
    eq(await commOf(p.saleId), [], "สมุด");
  }, "MAJOR");
  await st("C-4", "ผู้ทำต่างคนต่อบรรทัด: งานช่างเอก (ตัดผม ฿250) + ทรีตเมนต์ที่ช่างบอยทำ (staffId) ⇒ เอก 2500 (10%) · บอย 3750 (12.5% ชั้น STAFF) · ไม่มีแถวคนกดขาย", async () => {
    needTpl();
    const id = await bookInService(cA, ids.CUT, ids.ek, dd(5), 660);
    const c = await paidComm(cA, id, [{ kind: "SERVICE", serviceId: ids.TREAT, staffId: ids.boy }], dd(5), 720, 25000 + 30000);
    const by = (u: string) => c.filter((x) => x.userId === u).map((x) => [x.employeeId, x.amountSatang]);
    eq(by(ids.uEk), [[ids.empEk, 2500]], "ช่างเอก");
    eq(by(ids.uBoy), [[ids.empBoy, 3750]], "ช่างบอย");
    eq(c.length, 2, "จำนวนแถว");
  });

  // ═══════════════ A. แก้ · ยกเลิก ═══════════════
  console.log("\n── A: แก้ของ · ยกเลิกบิล · เปิดใหม่ · มัดจำถูกคืนระหว่างรอ ──");
  await st("A-1", "amendServiceBill (แว็กซ์ ×2) บนบิล HELD ⇒ บรรทัด [฿250 BOOKED · ฿580 PRODUCT] · version เพิ่ม · หน้าขายเห็น ฿830 · qty 0/100 ⇒ BAD_INPUT ไม่เปลี่ยน", async () => {
    needTpl();
    S.a = await bookInService(cA, ids.CUT, ids.ek, dd(6), 600);
    const f = okF(await FN("finishJob")(cA, S.a, { now: at(dd(6), 650) }), "finish");
    S.aCart = f.heldCartId!;
    const v0 = (await cartsOf(S.a))[0].version;
    const r = okF(await FN("amendServiceBill")(cA, S.a, { extras: [{ kind: "PRODUCT", productId: ids.WAX, qty: 2 }] }), "amend");
    eq(r.heldCartId, S.aCart, "บิลเดิม");
    const v = await SB("serviceBillView")(rA, CASHIER, { heldCartId: S.aCart });
    ok(v.ok, fmt(v));
    eq([(v as SBView).lines.map((l) => l.amountSatang), (v as SBView).dueSatang], [[25000, 58000], 83000], "หลังแก้");
    ok((await cartsOf(S.a))[0].version > v0, "version ไม่เพิ่ม");
    for (const qty of [0, 100]) {
      const b = await FN("amendServiceBill")(cA, S.a, { extras: [{ kind: "PRODUCT", productId: ids.WAX, qty }] });
      ok(!b.ok && b.code === "BAD_INPUT", `qty ${qty}: ${fmt(b)}`);
    }
    eq((await SB("serviceBillView")(rA, CASHIER, { heldCartId: S.aCart }) as SBView).dueSatang, 83000, "ยอดหลังของผิด");
  });
  await st("A-2", "cancelServiceBill: เหตุผลว่าง ⇒ BAD_INPUT · มีเหตุผล ⇒ DISCARDED + AuditLog (PosHeldCart · ผู้ทำ · เหตุผล) · heldCartId = null · นัดยัง DONE · จ่ายบิลที่ทิ้ง ⇒ NOT_FOUND", async () => {
    ok(!!S.a && !!S.aCart, "ไม่มีงาน A-1");
    const e = await FN("cancelServiceBill")(cAmgr, S.a!, { reason: "  " });
    ok(!e.ok && e.code === "BAD_INPUT", `เหตุผลว่าง: ${fmt(e)}`);
    const reason = `ลูกค้าไม่พอใจ ทำใหม่ฟรี ${RUN}`;
    okF(await FN("cancelServiceBill")(cAmgr, S.a!, { reason }), "cancel");
    eq((await cartsOf(S.a!)).map((c) => c.status), ["DISCARDED"], "บิลพัก");
    const a = await apRow(S.a!);
    eq([a.status, a.heldCartId], ["DONE", null], "นัด");
    const au = await q<{ actorId: string | null; j: string }>(`SELECT "actorId", coalesce(after::text, '') || coalesce(before::text, '') AS j FROM "AuditLog" WHERE "tenantId" = $1 AND "targetId" = $2`, [ids.tA, S.aCart]);
    ok(au.some((x) => x.actorId === ids.uMgr && x.j.includes(reason)), `ไม่มี audit ที่มีผู้ทำ+เหตุผล: ${fmt(au)}`);
    const p = await pay(rA, CASHIER, S.aCart!, 83000);
    ok(isRefusal(p) && p.code === "NOT_FOUND", `จ่ายบิลที่ทิ้ง: ${fmt(p)}`);
  });
  await st("A-3", "ensureServiceBill หลังยกเลิก ⇒ บิลใหม่ (id ใหม่) HELD บรรทัดจากนัดอย่างเดียว ฿250 · บิลที่ยังมีผลต่อนัด = 1", async () => {
    ok(!!S.a, "ไม่มีงาน A-1");
    const r = okF(await FN("ensureServiceBill")(cA, S.a!), "ensure");
    ok(!!r.heldCartId && r.heldCartId !== S.aCart, `id: ${r.heldCartId}`);
    const live = (await cartsOf(S.a!)).filter((c) => c.status === "HELD");
    eq(live.map((c) => c.id), [r.heldCartId], "HELD");
    eq((await SB("serviceBillView")(rA, CASHIER, { heldCartId: r.heldCartId! }) as SBView).dueSatang, 25000, "ยอด");
    eq((await apRow(S.a!)).heldCartId, r.heldCartId, "heldCartId บนนัด");
    S.aLive = r.heldCartId!;
  });
  await st("A-4", "ออกจาก DONE ขณะมีบิล HELD (setAppointmentStatus CONFIRMED/CANCELLED) ⇒ ok:false · บิลยัง HELD · cancelByShop ของ DONE ⇒ BAD_STATE", async () => {
    ok(!!S.a && !!S.aLive, "ไม่มีบิลจากคิวที่เปิดใหม่ (A-3)");
    for (const s of ["CONFIRMED", "CANCELLED"] as const) {
      const r = await BK().setAppointmentStatus(ids.tA, ids.uA, S.a!, s);
      ok(r.ok === false, `${s}: ${fmt(r)}`);
    }
    const c = await LN().cancelByShop(cA, S.a!);
    ok(!c.ok && c.code === "BAD_STATE", `cancelByShop: ${fmt(c)}`);
    eq((await cartsOf(S.a!)).filter((x) => x.status === "HELD").length, 1, "บิล HELD");
    eq((await apRow(S.a!)).status, "DONE", "สถานะนัด");
  }, "MAJOR");
  await st("A-5", "มัดจำถูกคืน (moduleRefundDeposit) ระหว่างรอ ⇒ ยอดต้องจ่าย = ฿900 เต็ม · จ่าย ฿700 ⇒ PAYMENT_MISMATCH · จ่าย ฿900 ⇒ ok ไม่มีแถว DEPOSIT", async () => {
    needTpl();
    const id = await bookInService({ ...cA, actorUserId: ids.uBoy }, ids.COLOR, ids.boy, dd(7), 600, { deposit: true });
    const f = okF(await FN("finishJob")({ ...cA, actorUserId: ids.uBoy }, id, { now: at(dd(7), 700) }), "finish");
    const receipt = (await apRow(id)).depositSaleId ?? "";
    const dep = await tryImport<DepositApi>("@/lib/modules/pos/deposit");
    ok(!!dep.mod, dep.err);
    const rf = await dep.mod!.moduleRefundDeposit({ tenantId: ids.tA, unitId: ids.uA, receiptSaleId: receipt, reason: "QC B10 คืนมัดจำ", actorId: ids.uOwner });
    ok(rf.ok, `คืนมัดจำ: ${fmt(rf)}`);
    const v = await SB("serviceBillView")(rA, CASHIER, { heldCartId: f.heldCartId ?? "" });
    eq(v.ok && [(v as SBView).depositSatang, (v as SBView).dueSatang], [0, 90000], "ยอดหลังคืนมัดจำ");
    const bad = await pay(rA, CASHIER, f.heldCartId ?? "", 70000);
    ok(isRefusal(bad) && bad.code === "PAYMENT_MISMATCH", `฿700: ${fmt(bad)}`);
    const p = okPay(await pay(rA, CASHIER, f.heldCartId ?? "", 90000), "จ่ายเต็ม");
    eq((await paysOf(p.saleId)).map((x) => x.type), ["CASH"], "แถวจ่าย");
  }, "MAJOR");

  // ═══════════════ N. ไม่มี POS · ร้านเดิม ═══════════════
  console.log("\n── N: สาขาไม่มี POS · สาขาเดิม (_fallback) ──");
  await st("N-1", "สาขาไม่มี POS: finishJob ⇒ ok heldCartId null needsPayment NO_POS · ไม่มี PosHeldCart · markPaidWithoutPos ⇒ ok · ซ้ำ ⇒ already · booking.paid 1 (via NO_POS · saleId null)", async () => {
    needTpl();
    const id = await bookInService(cN, ids.CUTN, ids.nn, dd(3), 660);
    const f = okF(await FN("finishJob")(cN, id, { now: at(dd(3), 710) }), "finish");
    eq([f.heldCartId, f.needsPayment], [null, "NO_POS"], "ผล");
    eq((await cartsOf(id)).length, 0, "บิลพัก");
    okF(await FN("markPaidWithoutPos")(cN, id, { now: at(dd(3), 712) }), "markPaid");
    const again = okF(await FN("markPaidWithoutPos")(cN, id, { now: at(dd(3), 713) }), "markPaid ซ้ำ");
    eq(again.already, true, "already");
    const rows = await q<{ payload: Record<string, unknown> }>(`SELECT payload FROM "OutboxEvent" WHERE "tenantId" = $1 AND "idempotencyKey" = $2`, [ids.tA, `booking.paid#${id}`]);
    eq(rows.map((r) => [r.payload.via, r.payload.saleId, r.payload.amountSatang]), [["NO_POS", null, 25000]], "booking.paid");
  });
  await st("N-2", "markPaidWithoutPos บนสาขาที่มี POS ⇒ USE_POS (ไม่มี event)", async () => {
    ok(!!S.a, "ไม่มีงาน A-1");
    const r = await FN("markPaidWithoutPos")(cA, S.a!);
    ok(!r.ok && r.code === "USE_POS", fmt(r));
    eq(await evCount(ids.tA, `booking.paid#${S.a}`), 0, "booking.paid");
  });
  await st("N-3", "สาขาเดิม (ไม่เลือกแม่แบบ · มี POS): นัด DONE ทางเดิม → ensureServiceBill ⇒ ok heldCartId null legacy:true · ไม่มี PosHeldCart (ทางบิล CASH เดิมตรวจใน G qc-pos-p5.1)", async () => {
    need();
    const c = await BK().createAppointment({ tenantId: ids.tA, unitId: ids.uL, serviceId: ids.CUTL, staffId: ids.ll, dateStr: dd(0), startMin: 600, customerName: CUSTOMER("เดิม"), customerPhone: newPhone() });
    ok(c.ok, `createAppointment: ${fmt(c)}`);
    const id = (c as { id: string }).id;
    ok((await BK().setAppointmentStatus(ids.tA, ids.uL, id, "DONE")).ok, "DONE");
    const r = okF(await FN("ensureServiceBill")(cL, id), "ensure");
    eq([r.heldCartId, r.legacy], [null, true], "ผล");
    eq((await cartsOf(id)).length, 0, "บิลพัก");
  }, "MAJOR");

  // ═══════════════ X1. ข้ามร้าน/สาขา ═══════════════
  console.log("\n── X1: ข้ามร้าน/สาขา ⇒ NOT_FOUND ──");
  await st("X1-1", "ฝั่งจอง: ctx ร้าน B / สาขา uN บนนัดของ uA ⇒ preview null · finish/ensure/amend/cancel/markPaid NOT_FOUND · ไม่มีอะไรเปลี่ยน", async () => {
    ok(!!S.a, "ไม่มีงาน A-1");
    const before = await cartsOf(S.a!);
    for (const c of [cB, cN]) {
      eq(await FN("previewServiceBill")(c, S.a!), null, `preview ${c.unitId}`);
      for (const [n, r] of [
        ["finish", await FN("finishJob")(c, S.a!, { now: at(dd(6), 700) })],
        ["ensure", await FN("ensureServiceBill")(c, S.a!)],
        ["amend", await FN("amendServiceBill")(c, S.a!, { extras: [] })],
        ["cancel", await FN("cancelServiceBill")(c, S.a!, { reason: "ข้ามร้าน" })],
        ["markPaid", await FN("markPaidWithoutPos")(c, S.a!)],
      ] as const) ok(!r.ok && r.code === "NOT_FOUND", `${n} ${c.unitId}: ${fmt(r)}`);
    }
    eq(await cartsOf(S.a!), before, "บิลพักไม่เปลี่ยน");
  });
  await st("X1-2", "ฝั่งหน้าขาย: ร้าน B (ระบบ POS B) และสาขา uL (ระบบ POS เดียวกัน) เปิดดู/จ่ายบิลจากคิวของ uA ⇒ NOT_FOUND · ไม่มีบิลขาย · listServiceBills ไม่มีรายการของ uA", async () => {
    ok(!!S.a, "ไม่มีงาน A-1");
    const live = (await cartsOf(S.a!)).find((c) => c.status === "HELD");
    ok(!!live, "ไม่มีบิล HELD ของ A-3");
    for (const [ctx, actor] of [[rB, OWNER_B], [rL, CASHIER]] as const) {
      const v = await SB("serviceBillView")(ctx, actor, { heldCartId: live!.id });
      ok(isRefusal(v) && v.code === "NOT_FOUND", `view ${ctx.unitId}: ${fmt(v)}`);
      const p = await pay(ctx, actor, live!.id, 25000);
      ok(isRefusal(p) && p.code === "NOT_FOUND", `pay ${ctx.unitId}: ${fmt(p)}`);
      const l = await SB("listServiceBills")(ctx, actor);
      ok(l.ok && !(l as Extract<typeof l, { ok: true }>).items.some((x) => x.heldCartId === live!.id), `list ${ctx.unitId} เห็นบิลของ uA`);
    }
    eq((await salesOf(ids.tA, S.a!)).length, 0, "บิลขาย");
    eq((await cartsOf(S.a!)).find((c) => c.id === live!.id)?.status, "HELD", "สถานะ");
  });
  await st("X1-3", "ใบรับมัดจำของร้าน A ส่งให้บิลพักของร้าน B (openServiceBill ตรง) ⇒ ไม่หัก (ยอดต้องจ่าย = ยอดเต็ม) · มัดจำร้าน A ไม่ถูกแตะ", async () => {
    ok(!!S.depositReceipt, "ไม่มีใบรับ (P-1)");
    const fake = T("fakeB");
    const o = await SB("openServiceBill")({ tenantId: ids.tB, unitId: ids.uB, appointmentId: fake, label: "ข้ามร้าน", depositReceiptSaleId: S.depositReceipt, actorUserId: ids.uOwnerB,
      lines: [{ kind: "SERVICE", name: "ตัดผมชาย", qty: 1, unitPriceSatang: 25000, productId: null, serviceId: ids.CUTB, performerEmployeeId: null, commissionBp: null }] });
    ok(o.ok, fmt(o));
    const v = await SB("serviceBillView")(rB, OWNER_B, { heldCartId: (o as { heldCartId: string }).heldCartId });
    eq(v.ok && [(v as SBView).depositSatang, (v as SBView).dueSatang, (v as SBView).deposit], [0, 25000, null], "ยอด");
    await SB("discardServiceBill")({ tenantId: ids.tB, unitId: ids.uB, appointmentId: fake, actorUserId: ids.uOwnerB, reason: "ล้าง" });
  });

  // ═══════════════ S. สิทธิ์สด ═══════════════
  console.log("\n── S: สิทธิ์ (อ่าน Membership ทุกครั้ง) ──");
  await st("S-1", "authorizeServiceBillOp finish/amend: ช่างเจ้าของงาน ✓ · ช่างคนอื่น ✗ · แคชเชียร์ ✗ · ผู้จัดการสาขา ✓ · cancel: ช่างเจ้าของงาน ✗ (ต้อง runAny) · ผู้จัดการ ✓ · markPaid: แคชเชียร์ (pos.sale.create) ✓", async () => {
    needTpl();
    S.sAuth = await bookInService(cA, ids.CUT, ids.ek, dd(10), 600);
    const A = FN("authorizeServiceBillOp");
    const exp: [string, AuthOp, boolean][] = [
      [ids.uEk, "finish", true], [ids.uEk, "amend", true], [ids.uBoy, "finish", false], [ids.uCash, "finish", false], [ids.uMgr, "finish", true],
      [ids.uEk, "cancel", false], [ids.uMgr, "cancel", true], [ids.uCash, "markPaid", true], [ids.uOwnerB, "finish", false],
    ];
    const bad: string[] = [];
    for (const [u, op, want] of exp) { const r = await A(cA, u, op, S.sAuth); if (r.ok !== want) bad.push(`${u.split("_")[1]}:${op}=${r.ok}`); }
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("S-2", "สิทธิ์สด: ถอด booking.job.run ของช่างเอก ⇒ finish ✗ ทันที · คืนสิทธิ์ ⇒ ✓ · acceptedAt = null ⇒ ✗", async () => {
    ok(!!S.sAuth, "ไม่มีงาน S-1");
    const A = FN("authorizeServiceBillOp");
    try {
      await q(`UPDATE "Membership" SET permissions = '{}'::jsonb WHERE "userId" = $1 AND "tenantId" = $2`, [ids.uEk, ids.tA]);
      ok((await A(cA, ids.uEk, "finish", S.sAuth!)).ok === false, "ถอดสิทธิ์แล้วยังผ่าน");
      await q(`UPDATE "Membership" SET permissions = $3::jsonb WHERE "userId" = $1 AND "tenantId" = $2`, [ids.uEk, ids.tA, JSON.stringify({ "booking.job.run": true })]);
      ok((await A(cA, ids.uEk, "finish", S.sAuth!)).ok === true, "คืนสิทธิ์แล้วไม่ผ่าน");
      await q(`UPDATE "Membership" SET "acceptedAt" = NULL WHERE "userId" = $1 AND "tenantId" = $2`, [ids.uEk, ids.tA]);
      ok((await A(cA, ids.uEk, "finish", S.sAuth!)).ok === false, "acceptedAt null ยังผ่าน");
    } finally {
      await q(`UPDATE "Membership" SET permissions = $3::jsonb, "acceptedAt" = now() WHERE "userId" = $1 AND "tenantId" = $2`, [ids.uEk, ids.tA, JSON.stringify({ "booking.job.run": true })]);
    }
  });
  await st("S-3", "หน้าขาย: ผู้ไม่มี pos.sale.create ⇒ PERMISSION_DENIED ทั้ง view/pay · ไม่มีบิลขาย", async () => {
    ok(!!S.a, "ไม่มีงาน A-1");
    const live = (await cartsOf(S.a!)).find((c) => c.status === "HELD");
    ok(!!live, "ไม่มีบิล HELD");
    const p = await pay(rA, NOPERM, live!.id, 25000);
    ok(isRefusal(p) && p.code === "PERMISSION_DENIED", `pay: ${fmt(p)}`);
    eq((await salesOf(ids.tA, S.a!)).length, 0, "บิลขาย");
  });

  // ═══════════════ X3. ยิงพร้อมกัน ═══════════════
  console.log("\n── X3: ยิงพร้อมกันจาก 5 โพรเซส ──");
  await st("X3-1", "เสร็จพร้อมกัน 10 ทาง (5 โพรเซส × 2) บนงานเดียว (มัดจำ ฿200) ⇒ PosHeldCart ของงาน = 1 แถว · ทุกผล ok ได้ heldCartId เดียวกัน (หรือ BUSY/LOST_RACE) · นัด heldCartId ตรง · ไม่มีใครโยน", async () => {
    needTpl();
    S.x = await bookInService(cA, ids.COLOR, ids.ek, dd(8), 600, { deposit: true });
    const extras: ExtraLine[] = [{ kind: "PRODUCT", productId: ids.WAX, qty: 1 }];
    const call: CallSpec = { fn: "finish", ctx: cA, id: S.x, extras, now: at(dd(8), 700).toISOString() };
    const outs = await fanOut("x3a", [0, 1, 2, 3, 4].map(() => [call, call]));
    ok(outs.length === 10 && outs.every((o) => !o.threw), `โยน/ขาด: ${fmt(outs.filter((o) => o.threw))}`);
    const carts = await cartsOf(S.x);
    eq(carts.length, 1, "จำนวนบิลพัก");
    S.xCart = carts[0].id;
    const oks = outs.filter((o) => o.ok);
    ok(oks.length >= 1 && oks.every((o) => o.heldCartId === S.xCart), `ผล ok ไม่ตรงบิลเดียว: ${fmt(outs)}`);
    ok(outs.every((o) => o.ok || ["BUSY", "LOST_RACE"].includes(o.code ?? "")), `รหัสแปลก: ${fmt(outs.filter((o) => !o.ok))}`);
    eq((await apRow(S.x)).heldCartId, S.xCart, "heldCartId บนนัด");
  });
  await st("X3-2", "จ่ายพร้อมกัน 10 ทาง (คีย์ต่างกัน · 5 โพรเซส) ⇒ บิล BOOKING 1 ใบ · มัดจำใช้ 20000 ครั้งเดียว · ผู้แพ้ได้ SERVICE_BILL_PAID/BUSY · ไม่มีใครโยน", async () => {
    ok(!!S.x && !!S.xCart, "ไม่มีงาน X3-1");
    const due = 90000 + 29000 - 20000;
    const outs = await fanOut("x3b", [0, 1, 2, 3, 4].map((i) => [0, 1].map((k) => ({ fn: "pay", ctx: i % 2 ? rA2 : rA, actor: CASHIER, heldCartId: S.xCart!, amount: due, key: `x3b-${RUN}-${i}-${k}` }) as CallSpec)));
    ok(outs.length === 10 && outs.every((o) => !o.threw), `โยน: ${fmt(outs.filter((o) => o.threw))}`);
    const sales = await salesOf(ids.tA, S.x!);
    eq(sales.length, 1, "บิลขาย");
    eq(outs.filter((o) => o.ok).map((o) => o.saleId).every((x) => x === sales[0].id), true, "ผู้ชนะได้บิลเดียวกัน");
    ok(outs.every((o) => o.ok || ["SERVICE_BILL_PAID", "BUSY"].includes(o.code ?? "")), `รหัสแปลก: ${fmt(outs.filter((o) => !o.ok))}`);
    const receipt = (await apRow(S.x!)).depositSaleId ?? "";
    eq((await depositOf(receipt))?.usedSatang, 20000, "มัดจำใช้ไป");
    eq(sales[0].grandTotalSatang, 119000, "grand");
  });
  await st("X3-3", "แก้ของ ∥ จ่าย (2 แก้ + 3 จ่ายยอดเดิม · 5 โพรเซส) ⇒ บิลขาย ≤ 1 · ถ้ามี: บรรทัดบิล = ชุดก่อนแก้หรือหลังแก้ทั้งชุด (ไม่ปน) และ grand = Σ บรรทัด · บิลพักไม่ HELD ค้างคู่กับบิลขาย", async () => {
    needTpl();
    S.xb = await bookInService(cA, ids.CUT, ids.boy, dd(9), 600);
    const f = okF(await FN("finishJob")({ ...cA, actorUserId: ids.uBoy }, S.xb, { now: at(dd(9), 650) }), "finish");
    S.xbCart = f.heldCartId!;
    const amend: CallSpec = { fn: "amend", ctx: { ...cA, actorUserId: ids.uBoy }, id: S.xb, extras: [{ kind: "PRODUCT", productId: ids.WAX, qty: 1 }] };
    const payC = (i: number): CallSpec => ({ fn: "pay", ctx: rA, actor: CASHIER, heldCartId: S.xbCart!, amount: 25000, key: `x3c-${RUN}-${i}` });
    const outs = await fanOut("x3c", [[amend], [payC(0)], [amend], [payC(1)], [payC(2)]]);
    ok(outs.every((o) => !o.threw), `โยน: ${fmt(outs.filter((o) => o.threw))}`);
    const sales = await salesOf(ids.tA, S.xb);
    ok(sales.length <= 1, `บิลขาย ${sales.length}`);
    const carts = await cartsOf(S.xb);
    if (sales.length === 1) {
      const ls = (await linesOf(sales[0].id)).map((l) => l.lineTotalSatang);
      ok(isDeepStrictEqual(ls, [25000]) || isDeepStrictEqual(ls, [29000, 25000]), `บรรทัดปน: ${fmt(ls)}`);
      eq(sales[0].grandTotalSatang, ls.reduce((t, x) => t + x, 0), "grand = Σ บรรทัด");
      ok(!carts.some((c) => c.status === "HELD"), "บิลพัก HELD ค้างคู่บิลขาย");
    } else {
      eq(carts.filter((c) => c.status === "HELD").length, 1, "ไม่มีบิลขาย ⇒ บิลพัก HELD 1");
    }
  }, "MAJOR");

  // ═══════════════ EV · U · V ═══════════════
  console.log("\n── EV: booking.paid 3 ทะเบียน · PII ──");
  await st("EV-1", "booking.paid: AUTOMATION_EVENTS 1 แถว (ป้ายไทย) · WEBHOOK_EVENTS 1 แถว · consumers มีตัวจัดการ · pos.sale.paid ยังมีตัวจัดการ", async () => {
    const auto = (await tryImport<{ AUTOMATION_EVENTS: LabelDef[] }>("@/lib/automation/labels")).mod?.AUTOMATION_EVENTS ?? [];
    const wh = (await tryImport<{ WEBHOOK_EVENTS: LabelDef[] }>("@/lib/webhooks/labels")).mod?.WEBHOOK_EVENTS ?? [];
    const cons = await CONSUMERS();
    const a = auto.filter((x) => x.value === "booking.paid");
    ok(a.length === 1 && /[฀-๿]/.test(a[0].label), `automation: ${a.length}`);
    eq(wh.filter((x) => x.value === "booking.paid").length, 1, "webhook");
    ok(typeof cons["booking.paid"] === "function" && typeof cons["pos.sale.paid"] === "function", "consumer");
  });
  await st("EV-2", "payload ทุก event booking.* / queue.* ของร้านทดสอบ ไม่มีเบอร์/ชื่อลูกค้า · บิลพัก (cartJson) ไม่มีเบอร์เต็ม (X8)", async () => {
    const rows = await q<{ type: string; payload: unknown }>(`SELECT type, payload FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND (type LIKE 'booking.%' OR type LIKE 'queue.%')`, [ALL_TENANTS]);
    ok(rows.length > 0, "ไม่มี event");
    const bad = rows.filter((r) => { const s = JSON.stringify(r.payload); return PHONES.some((p) => s.includes(p.slice(1))) || NAMES.some((n) => s.includes(n)); }).map((r) => r.type);
    ok(bad.length === 0, `มี PII: ${[...new Set(bad)].join(", ")}`);
    const carts = await q<{ j: string }>(`SELECT "cartJson"::text AS j FROM "PosHeldCart" WHERE "tenantId" = ANY($1::text[])`, [ALL_TENANTS]);
    ok(!carts.some((c) => PHONES.some((p) => c.j.includes(p.slice(1)))), "cartJson มีเบอร์");
  }, "MAJOR");

  console.log("\n── U: แผ่นจบงาน (ภาพ 07 ก · DOM) ──");
  type Comp = (props: Record<string, unknown>) => unknown;
  type ReactLike = { createElement: (c: Comp, p: Record<string, unknown>) => unknown };
  type RdsLike = { renderToStaticMarkup: (el: unknown) => string };
  const renderSheet = async (view: Preview): Promise<string> => {
    ok(existsSync(join(ROOT, F.sheet)), `ยังไม่มี ${F.sheet}`);
    const m = await tryImport<Record<string, unknown>>(pathToFileURL(join(ROOT, F.sheet)).href);
    ok(!!m.mod && typeof m.mod.default === "function", `import ${F.sheet}: ${m.err || "ไม่มี default export"}`);
    const React = (await import("react" as string)) as unknown as ReactLike;
    const RDS = (await import("react-dom/server" as string)) as unknown as RdsLike;
    const noop = async (_fd: FormData) => { void _fd; };
    return String(RDS.renderToStaticMarkup(React.createElement(m.mod!.default as Comp, { view, unitSlug: "qc-b10", actions: { finish: noop, amend: noop } }))).replace(/<!-- -->/g, "");
  };
  await st("U-1", "FinishJobSheet: finish-sheet · finish-line ×3 (data-amount 90000/30000/29000 · data-source) · finish-deposit มี 200 · finish-due มี ฿1,290 · ปุ่ม finish-send มียอด · finish-add", async () => {
    ok(!!S.preview, "ไม่มี preview (F-1)");
    const html = await renderSheet(S.preview!);
    ok(/data-testid="finish-sheet"/.test(html), "ไม่มี finish-sheet");
    const amounts = [...html.matchAll(/<[^>]*\sdata-testid="finish-line"[^>]*>/g)].map((m) => /\sdata-amount="(\d+)"/.exec(m[0])?.[1] ?? null);
    eq(amounts, ["90000", "30000", "29000"], "finish-line data-amount");
    const box = (tid: string) => { const i = html.indexOf(`data-testid="${tid}"`); ok(i >= 0, `ไม่มี ${tid}`); return html.slice(i, i + 600).replace(/<[^>]+>/g, " "); };
    ok(/200/.test(box("finish-deposit")), "finish-deposit ไม่มี 200");
    ok(/฿\s*1,290/.test(box("finish-due")), "finish-due ไม่มี ฿1,290");
    ok(/1,290/.test(box("finish-send")), "ปุ่มส่งไม่มียอด");
    ok(/data-testid="finish-add"/.test(html), "ไม่มี finish-add");
  }, "MAJOR");
  await st("U-2", "แผ่นจบงานไม่มีเบอร์เต็มของลูกค้า", async () => {
    ok(!!S.preview, "ไม่มี preview (F-1)");
    const html = await renderSheet(S.preview!);
    ok(!PHONES.some((p) => html.includes(p) || html.includes(p.slice(1))), "มีเบอร์เต็ม");
  }, "MAJOR");
  console.log("\n── V: ภาพ 07 (ผู้คุมถ่าย) ──");
  await st("V-1", "SQC_VISUAL_SPECS[\"b.10\"] = 2 ภาพ (มือถือแผ่นจบงาน · แผงบิลจากคิว) + มีสคริปต์ฉาก svc-qc-done-pos-scene.mts", () => {
    const v = SQC_VISUAL_SPECS["b.10"] ?? [];
    eq(v.map((x) => x.name), ["booking-finish-sheet", "pos-service-bills"], "specs");
    ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`);
  }, "MAJOR");
  skip("V-2", "PARITY ภาพ ก/ข กับ 07-done-to-pos.png", "ผู้คุมถ่ายเองหลัง build QC (reseed → ฉาก → visual-svc b.10) — ไม่นับในข้อสอบรันเดี่ยว", "MAJOR");
} finally {
  // ═══════════════ Z. ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  for (const f of goFiles) { try { unlinkSync(f); } catch { /* ไม่เป็นไร */ } }
  try {
    await cleanup(ALL_TENANTS);
    await cleanupUsers();
    const left = Number((await q<{ n: string }>(`SELECT count(*)::text AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0]?.n ?? 0);
    record("Z-1", "ล้างร้านทดสอบหมด (Tenant slug qc-svc-b10-* = 0)", left === 0 ? "PASS" : "FAIL", left ? `เหลือ ${left}` : "", "MAJOR");
  } catch (e) {
    record("Z-1", "ล้างร้านทดสอบหมด", "FAIL", errMsg(e), "MAJOR");
  }
  await pool.end().catch(() => {});
}

// ═══════════════ G. regression (หลังล้างข้อมูล) ═══════════════
console.log("\n── G: regression จองคิว + POS บิลพัก/ค่าคอมฯ/มัดจำ + smoke ──");
const judgeSvc = (allowSkip: (id: string) => boolean) => (out: string) => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return false;
  const j = JSON.parse(line.slice(13)) as { failed: string[]; skipped: string[] };
  return j.failed.length === 0 && j.skipped.every(allowSkip);
};
const REG: { s: string; args?: string[]; judge?: (out: string, code: number | null) => boolean; note?: string; ifExists?: boolean }[] = [
  { s: "qc-svc-b.4", args: ["--no-regression"], judge: judgeSvc((x) => x.startsWith("G-") || x === "ST-1"), note: "ไม่มี FAIL · SKIP เฉพาะ G-*/ST-1" },
  { s: "qc-svc-b.5", args: ["--no-regression"], judge: judgeSvc((x) => /^(H|E|V|Q|G)-/.test(x) || x === "S-1"), note: "ไม่มี FAIL · SKIP เฉพาะ H/E/V/Q/G/S-1" },
  { s: "qc-svc-b.8", args: ["--no-regression"], judge: judgeSvc((x) => /^(V|G)-/.test(x) || x === "ST-1"), note: "ถ้ามี", ifExists: true },
  { s: "qc-booking-deposit" }, { s: "qc-booking-race" },
  { s: "qc-pos-p1.5", note: "บิลพัก" }, { s: "qc-pos-p3.5", note: "ค่าคอมฯ" }, { s: "qc-pos-p5.1", note: "มัดจำโมดูล + บิล CASH ร้านเดิม" }, { s: "qc-pos-p2.9b", note: "มัดจำหน้าขาย" },
  { s: "qc-hf-o23", note: "คีย์ booking-sale ร้านเดิม" }, { s: "fitness-pos" }, { s: "qc-svc-smoke" },
];
{
  const hasWork = typeof (finishLoad.mod as Partial<FinishApi> | null)?.finishJob === "function" && typeof posLoad.mod?.serviceBills?.payServiceBill === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (finish.finishJob / serviceBills.payServiceBill) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_B10_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) {
      if (g.ifExists) record(id, name, "PASS", "", "MINOR");
      else record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL");
      continue;
    }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: { ...process.env }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 45 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-b10-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(all, r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC B.10 · จบงาน → บิลจากคิว POS + ค่าคอมฯ =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ ยกเว้น V-2 (ผู้คุมถ่ายเอง) · SKIP อื่นไม่นับว่าผ่าน
process.exit(failed.length + skipped.filter((c) => c.id !== "V-2").length > 0 ? 1 : 0);
