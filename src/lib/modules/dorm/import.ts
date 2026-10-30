// SVC D.4 ▸ นำเข้า Excel/CSV ของหอ (อัปโหลด → เดาคอลัมน์ → ตรวจ/พรีวิว → สร้าง → ย้อนกลับ) — ledger/svc-briefs/svc-brief-d.4.md §2–§7
//
// ชั้นตรวจ "เข้ม" (เงิน: ประกันยกมา · กฎหมาย สคบ. · ข้อมูลข้ามร้าน · X6):
//   • ขอบเขต (X1): ทุกคำสั่งผ่าน tenantDb({tenantId, unitId}) (ไม่ import prisma ดิบ — F5) · หน่วย DORM ของร้าน · Membership สด · สิทธิ์ dorm.import
//     (สร้าง/ย้อน + dorm.lease.manage + เห็นทุกอาคาร) · ชุดต้องเป็นของหน่วยนั้น — ไม่ผ่าน ⇒ NOT_FOUND เหตุผลเดียวกันทุกกรณี (อ่าน ⇒ null/[])
//   • ไม่มีเส้นเงินแยก: สัญญา/เงินประกันยกมาผ่าน createLease + moveIn ของ D.5 เท่านั้น (คีย์ dorm.lease:<id>:deposit · JV เดียวกับ D.5)
//     มิเตอร์/เลขผ่าน createMeter + submitReadings ของ D.6 (source IMPORT) · ย้อนกลับเงิน = กลับรายการ (reverseSecurityDepositReceiptInTx) ไม่ลบแถวบัญชี
//   • พร้อมกัน: ทุกการเปลี่ยนสถานะ = CAS (status + version) + claimToken สุ่ม 128 บิต + claimUntil (ต่ออายุทุก tx ของแถว)
//     ล็อก advisory ต่อหน่วย `dorm.import:<unitId>` คำสั่งแรกของทุก tx ของงาน (ทางเข้า = try-lock ไม่รอ ⇒ BUSY · tx ของแถว = รอ)
//     createImport คิดแผนใหม่ใต้ล็อกแล้วเทียบ previewHash ⇒ STALE_PREVIEW · ไม่เปิด connection ที่สองระหว่าง tx · 40P01/P2034 ⇒ ลองใหม่ 1 ครั้งแล้ว BUSY
//     ลำดับล็อก: dorm.import:<unit> → (D.5) dorm.lease:<id> → แถว Tenant (บัญชี InTx) → แถวสัญญา · งานต่อแถวเป็นลำดับ tx สั้น (ไม่ใช่ tx ยักษ์)
//   • เซลล์อันตราย: ข้อความขาเข้าผ่าน neutralizeCell · ทุกค่าที่สะท้อนกลับ (samples · issues · CSV · จอ) ปิดเบอร์/เลขบัตร + เป็นกลาง · ไม่ประเมินสูตร
//   • ไม่ throw ออก facade (ปฏิเสธ = { ok:false, code, reason ไทย }) · ไม่ใช้ Promise.all กับงานเงิน/สัญญา (ทีละรายการ)
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { csvRow } from "@/lib/core/csv";
import { ciEquals } from "@/lib/core/ci-equals";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { resolveSettings } from "@/lib/core/settings";
import { evaluateLegal, findForbiddenTerms, isValidOutOfScopeReason, leaseKind as legalLeaseKind, normalizeLegalMode } from "@/lib/core/settings/legal/th-rental-2568";
import { deleteFileAsset, uploadFile } from "@/lib/storage/service";
import { normalizePartyPhone, normalizePartyTaxId } from "@/lib/modules/party";
import { releaseOccupancy } from "@/lib/modules/rooms";
import { reverseSecurityDepositReceiptInTx, runDormMoneyTx, securityDepositHeldInTx } from "@/lib/modules/account";
import { createLease, leaseContractNameProblems, leaseEndDate, moveIn } from "./lease";
import { createMeter, submitReadings } from "./meter";
import { dormBuildingScope } from "./scope";
import { defaultColumnGuesser, type ImportColumnGuesser } from "./import-ai";
import {
  IMPORT_FIELDS,
  IMPORT_MAX_CELL,
  IMPORT_MAX_COLUMNS,
  headerGuess,
  isImportFieldKey,
  maskPersonal,
  neutralizeCell,
  parseImportFile,
  parseMoneySatang,
  parseThaiDate,
  phoneDigits,
  safeEcho,
  looksFormula,
  type ImportFieldKey,
  type ImportMapping,
} from "./import-parse";

// ───────────────────────── สัญญา §3 ─────────────────────────
export type { ImportFieldKey, ImportMapping } from "./import-parse";
export type { ImportColumnGuesser } from "./import-ai";
export type ImportCtx = { tenantId: string; actorUserId: string };
export type ImportOptions = { dateFormat?: "BE_DMY" | "CE_DMY" | "ISO"; meterReadDate?: string; depositChannel?: "CASH" | "TRANSFER" | "PROMPTPAY"; financeAccountId?: string | null };
export type ImportDecision =
  | { action: "SKIP" }
  | { action: "SET"; field: ImportFieldKey; value: string }
  | { action: "TENANT"; mode: "MERGE" | "SEPARATE" }
  | { action: "TENANT"; confirmPartyId: string }
  | { action: "TENANT"; createNewParty: true };
export type ImportIssue = {
  rowNo: number | null;
  room: string | null;
  code: string;
  severity: "MUST_FIX" | "WARN" | "INFO";
  field: ImportFieldKey | null;
  value: string | null;
  messageTh: string;
  legal?: { code: string; messageTh: string; citation: string } | null;
};
export type ImportPlan = {
  buildings: number;
  floors: number;
  rooms: number;
  roomTypes: number;
  leases: number;
  parties: number;
  meters: number;
  readings: number;
  depositSatang: number;
  arrears: { count: number; satang: number };
  existing: { rooms: number; leases: number; meters: number };
  skippedRows: number;
};
export type ImportSummary = { rows: number; ready: number; warn: number; mustFix: number };
export type ImportStatus = "DRAFT" | "CREATING" | "CREATED" | "UNDOING" | "UNDONE";
export type ImportRowAction = "CREATE" | "VACANT" | "SKIP_EXISTS" | "SKIPPED" | "BLOCKED";
export type ImportPreviewRow = { rowNo: number; room: string; action: ImportRowAction; severity: "OK" | "WARN" | "MUST_FIX" };
export type ImportPreviewResult = {
  ok: true;
  status: ImportStatus;
  confirmed: boolean;
  previewHash: string;
  mapping: ImportMapping;
  summary: ImportSummary;
  issues: ImportIssue[];
  plan: ImportPlan;
  rows: ImportPreviewRow[];
};
export type ImportView = {
  batchId: string;
  unitId: string;
  fileName: string;
  format: "CSV" | "XLSX";
  sheet: string;
  sheets: { name: string; rowCount: number }[];
  rowCount: number;
  columnCount: number;
  headers: string[];
  samples: string[][];
  status: ImportStatus;
  proposal: { source: "AI" | "HEADER" | "NONE"; guessed: number } | null;
  mapping: ImportMapping | null;
  confirmed: boolean;
  summary: ImportSummary | null;
  plan: ImportPlan | null;
  issues: ImportIssue[];
  committedAt: string | null;
  undoUntil: string | null;
  canUndo: boolean;
  undoneAt: string | null;
  createdBy: string | null;
  /** ย้อนกลับได้ภายในกี่วัน (ค่าตั้ง rooms.import.undoDays สด · 0 = ภายในวันนำเข้า) */
  undoDays: number;
  /** X3 ▸ hash ของพรีวิวล่าสุดที่คนยืนยันแมปแล้ว (ใช้กดนำเข้าจากหน้าจริง) — ไม่ยืนยัน/สถานะอื่น ⇒ null */
  previewHash: string | null;
  /** X8 ▸ ทำต่อได้ (CREATING ไม่มีผู้ถือ) · ย้อนต่อได้ (UNDOING ไม่มีผู้ถือ) · ความผิดพลาดล่าสุด */
  resumable: boolean;
  undoResumable: boolean;
  lastError: { rowNo: number | null; code: string } | null;
  options: { dateFormat: "BE_DMY" | "CE_DMY" | "ISO"; meterReadDate: string; depositChannel: "CASH" | "TRANSFER" | "PROMPTPAY"; financeAccountId: string | null } | null;
  decisions: Record<string, ImportDecision[]>;
};
type Fail = { ok: false; code: string; reason: string };
type ImportUploadResult = {
  ok: true;
  batchId: string;
  duplicate: boolean;
  status: ImportStatus;
  format: "CSV" | "XLSX";
  sheet: string;
  sheets: { name: string; rowCount: number }[];
  rowCount: number;
  columnCount: number;
  headers: string[];
  samples: string[][];
};
type UndoBlocker = { code: "BILL_EXISTS" | "MOVEOUT_EXISTS" | "LEASE_CHANGED" | "DEPOSIT_MOVED" | "METER_READ_AFTER_IMPORT" | "ROOM_IN_USE"; room: string; leaseId?: string };
export type ImportUndone = { leases: number; depositReversals: number; reversedSatang: number; rooms: number; roomTypes: number; buildings: number; meters: number; readings: number; keptReadings?: number };

// ───────────────────────── ค่าคงที่ · ข้อความ ─────────────────────────
const NF_REASON = "ไม่พบชุดนำเข้าหรือหอที่ระบุ หรือบัญชีนี้ไม่มีสิทธิ์นำเข้าข้อมูล";
const BUSY_REASON = "มีการนำเข้า/ย้อนกลับของหอนี้กำลังทำอยู่ — รอสักครู่แล้วลองใหม่";
const TX_OPTS = { maxWait: 20_000, timeout: 30_000 } as const;
const CLAIM_MS = 120_000;
const CLAIM_GRACE_MS = 60_000;
const GUESS_TIMEOUT_MS = 10_000;
const MAX_SAMPLES = 3;
const NAME_MAX = 200;
const NOTE_MAX = 500;
const TEXT_MAX = 60;
const MAX_READING = 2_147_483_647;
const MAX_UNZIP = 40_000_000;
const ZIP_RATIO = 10;
/** X2 ค: เพดานผลรวมตัวอักษรหลังแยก (เก็บลง parsed เฉพาะเมื่อผ่าน) */
const MAX_PARSED_CHARS = 10_000_000;
const PARSED_RATIO = 5;
const DAY_MS = 86_400_000;
const ROOM_RE = /^[A-Za-z0-9ก-ฮ/-]{1,12}$/;
const LIVE_LEASE = ["DRAFT", "ACTIVE", "NOTICE"];

type Tx = Prisma.TransactionClient;
type Db = Tx | ReturnType<typeof tenantDb>;

const fail = (code: string, reason: string): Fail => ({ ok: false, code, reason });
const notFound = (): Fail => fail("NOT_FOUND", NF_REASON);
const busy = (): Fail => fail("BUSY", BUSY_REASON);
const unavailable = (): Fail => fail("UNAVAILABLE", "ระบบนำเข้าขัดข้องชั่วคราว — ยังไม่มีอะไรเปลี่ยนในขั้นนี้ ลองใหม่อีกครั้ง");
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const strOr = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const numOr = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const json = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

class Abort extends Error {
  constructor(public readonly result: Fail & Record<string, unknown>) {
    super("dorm.import abort");
  }
}

/** เดินสาย error หา SQLSTATE/รหัส Prisma */
function errCode(e: unknown): string {
  let cur: unknown = e;
  for (let d = 0; d < 6 && cur && typeof cur === "object"; d++) {
    const o = cur as { code?: unknown; originalCode?: unknown; meta?: unknown; cause?: unknown; message?: unknown };
    for (const c of [o.originalCode, o.code]) if (typeof c === "string" && /^(40P01|40001|P2034|P2002|P2028|P2024|23505)$/.test(c)) return c;
    const meta = isRec(o.meta) ? o.meta : null;
    if (meta && typeof meta.code === "string" && /^(40P01|40001|23505)$/.test(meta.code)) return meta.code;
    if (typeof o.message === "string" && /deadlock detected/i.test(o.message)) return "40P01";
    cur = o.cause ?? meta?.driverAdapterError;
  }
  return "";
}
const isRetryable = (c: string) => c === "40P01" || c === "40001" || c === "P2034";
const isBusyish = (c: string) => c === "P2002" || c === "23505" || c === "P2028" || c === "P2024";

/** tx ของงานนำเข้า (tenantDb · connection เดียว) — Abort ⇒ ผลปฏิเสธ · 40P01/P2034 ⇒ ลองใหม่ 1 ครั้งแล้ว BUSY · ชน unique/รอ connection ⇒ BUSY */
async function importTx<T>(tenantId: string, unitId: string, fn: (tx: Tx) => Promise<T>): Promise<T | Fail> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await tenantDb({ tenantId, unitId }).$transaction((tx) => fn(tx as unknown as Tx), TX_OPTS);
    } catch (e) {
      if (e instanceof Abort) return e.result;
      const c = errCode(e);
      if (isRetryable(c) && attempt === 0) continue;
      if (isRetryable(c) || isBusyish(c)) return busy();
      throw e;
    }
  }
  return busy();
}
/** tx ดิบของเงินหอ (runDormMoneyTx ของ facade บัญชี) — ใช้เมื่อต้องเรียกรุ่น InTx ของบัญชี · ทุกคำสั่งหอใส่ tenantId + unitId เอง */
async function moneyTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T | Fail> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await runDormMoneyTx(fn);
    } catch (e) {
      if (e instanceof Abort) return e.result;
      const c = errCode(e);
      if (isRetryable(c) && attempt === 0) continue;
      if (isRetryable(c) || isBusyish(c)) return busy();
      throw e;
    }
  }
  return busy();
}
const isFail = (v: unknown): v is Fail => isRec(v) && v.ok === false && typeof v.code === "string";

const importLockKey = (unitId: string) => `dorm.import:${unitId}`;
async function lockWait(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
async function lockTry(tx: Tx, key: string): Promise<boolean> {
  const r = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS ok`;
  return r[0]?.ok === true;
}
const newToken = () => randomBytes(16).toString("hex");
const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (isRec(v))
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}

// ───────────────────────── วันที่ (ข้อความ YYYY-MM-DD) ─────────────────────────
const ymdMs = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
const addDaysYmd = (ymd: string, n: number) => new Date(ymdMs(ymd) + n * DAY_MS).toISOString().slice(0, 10);
const isYmd = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && parseThaiDate(s, "ISO") === s;
/** สิ้นวันไทยของ ymd (23:59:59.999 +07:00) */
const endOfBkkDay = (ymd: string) => new Date(Date.parse(`${ymd}T23:59:59.999+07:00`));

// ───────────────────────── ชื่อ ─────────────────────────
/** K3 (ตรรกะเดียวกับ D.5): ไม่สนช่องว่าง/ตัวพิมพ์ · ยอมส่วนต่อท้ายเมื่อส่วนที่ตรงยาว ≥ 6 */
function nameMatches(a: string, b: string): boolean {
  const k = (x: string) => x.normalize("NFC").replace(/\s+/g, "").toLowerCase();
  const x = k(a);
  const y = k(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 6 && long.startsWith(short);
}
function thaiIdOk(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(id[i]) * (13 - i);
  return (11 - (s % 11)) % 10 === Number(id[12]);
}
const bahtLabel = (satang: number) => {
  const st = satang % 100;
  return `฿${Math.floor(satang / 100).toLocaleString("en-US")}${st ? `.${String(st).padStart(2, "0")}` : ""}`;
};

// ───────────────────────── ด่าน (§3) ─────────────────────────
type Gate = { tenantId: string; unitId: string; unitName: string; actorUserId: string; role: string; m: MembershipCtx };
async function gate(ctx: unknown, unitId: unknown, need: "import" | "manage"): Promise<Gate | null> {
  if (!isRec(ctx) || !isStr(ctx.tenantId) || !isStr(ctx.actorUserId) || !isStr(unitId)) return null;
  const tenantId = ctx.tenantId;
  const actorUserId = ctx.actorUserId;
  const tdb = tenantDb({ tenantId });
  const unit = await tdb.businessUnit.findFirst({ where: { id: unitId, type: "DORM" }, select: { id: true, name: true } });
  if (!unit) return null;
  const mem = await tdb.membership.findFirst({ where: { tenantId, userId: actorUserId, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } });
  if (!mem) return null;
  const m: MembershipCtx = {
    role: mem.role,
    unitAccess: Array.isArray(mem.unitAccess) ? mem.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: isRec(mem.permissions) ? mem.permissions : {},
  };
  if (!evaluate(m, { module: "dorm", action: "dorm.import", unitId: unit.id })) return null;
  if (need === "manage") {
    if (!evaluate(m, { module: "dorm", action: "dorm.lease.manage", unitId: unit.id })) return null;
    const scope = await dormBuildingScope({ tenantId }, { unitId: unit.id, userId: actorUserId });
    if (!scope.all) return null;
  }
  return { tenantId, unitId: unit.id, unitName: unit.name, actorUserId, role: String(mem.role), m };
}

// ───────────────────────── ค่าตั้ง (อ่านสดทุกคำขอ · ไม่แคช) ─────────────────────────
type ImportSettings = { maxRows: number; maxFileBytes: number; undoDays: number; legalMode: "STRICT" | "WARN" | "OUT_OF_SCOPE"; oosReason: string | null; defaultMonths: number };
async function settingsOf(tenantId: string, unitId: string): Promise<ImportSettings> {
  const r = await resolveSettings(
    { tenantId },
    ["rooms.import.maxRows", "rooms.import.maxFileBytes", "rooms.import.undoDays", "rooms.legal.mode", "rooms.legal.outOfScopeReason", "rooms.lease.defaultMonths"],
    { unitId },
  );
  const n = (k: string, d: number, lo: number, hi: number) => {
    const v = r[k]?.value;
    return isInt(v) && v >= lo && v <= hi ? v : d;
  };
  const oos = r["rooms.legal.outOfScopeReason"]?.value;
  return {
    maxRows: n("rooms.import.maxRows", 1000, 10, 5000),
    maxFileBytes: n("rooms.import.maxFileBytes", 2_000_000, 10_000, 10_000_000),
    undoDays: n("rooms.import.undoDays", 0, 0, 7),
    legalMode: normalizeLegalMode(r["rooms.legal.mode"]?.value),
    oosReason: typeof oos === "string" ? oos : null,
    defaultMonths: n("rooms.lease.defaultMonths", 12, 1, 360),
  };
}

// ───────────────────────── แถวชุด ─────────────────────────
type Parsed = { encoding: string; sheets: { name: string; rowCount: number }[]; headers: string[]; rows: string[][] };
const BATCH_SELECT = {
  id: true,
  tenantId: true,
  unitId: true,
  fileHash: true,
  fileName: true,
  format: true,
  sheet: true,
  rowCount: true,
  columnCount: true,
  parsed: true,
  status: true,
  version: true,
  proposal: true,
  mapping: true,
  mappingConfirmedById: true,
  options: true,
  decisions: true,
  previewHash: true,
  summary: true,
  manifest: true,
  lastError: true,
  claimToken: true,
  claimUntil: true,
  createdById: true,
  committedAt: true,
  undoneAt: true,
  createdAt: true,
} as const;
type BatchRec = {
  id: string;
  tenantId: string;
  unitId: string;
  fileHash: string;
  fileName: string;
  format: string;
  sheet: string | null;
  rowCount: number;
  columnCount: number;
  parsed: Prisma.JsonValue;
  status: string;
  version: number;
  proposal: Prisma.JsonValue;
  mapping: Prisma.JsonValue;
  mappingConfirmedById: string | null;
  options: Prisma.JsonValue;
  decisions: Prisma.JsonValue;
  previewHash: string | null;
  summary: Prisma.JsonValue;
  manifest: Prisma.JsonValue;
  lastError: Prisma.JsonValue;
  claimToken: string | null;
  claimUntil: Date | null;
  createdById: string | null;
  committedAt: Date | null;
  undoneAt: Date | null;
  createdAt: Date;
};
async function readBatch(db: Db, g: { tenantId: string; unitId: string }, batchId: unknown): Promise<BatchRec | null> {
  if (!isStr(batchId) || batchId.length > 64) return null;
  return (await (db as Tx).dormImportBatch.findFirst({ where: { id: batchId, tenantId: g.tenantId, unitId: g.unitId }, select: BATCH_SELECT })) as BatchRec | null;
}
function parsedOf(b: BatchRec): Parsed {
  const p = isRec(b.parsed) ? b.parsed : {};
  const headers = Array.isArray(p.headers) ? p.headers.map((h) => strOr(h)) : [];
  const rows = Array.isArray(p.rows) ? p.rows.map((r) => (Array.isArray(r) ? r.map((c) => strOr(c)) : [])) : [];
  const sheets = Array.isArray(p.sheets) ? (p.sheets as unknown[]).filter(isRec).map((s) => ({ name: strOr(s.name), rowCount: numOr(s.rowCount) })) : [];
  return { encoding: strOr(p.encoding), sheets, headers, rows };
}
const statusOf = (s: string): ImportStatus => (["DRAFT", "CREATING", "CREATED", "UNDOING", "UNDONE"].includes(s) ? (s as ImportStatus) : "DRAFT");
/** มีผู้ถือ claim ที่ยังมีชีวิต (claimUntil ยังไม่เลยเวลา + ผ่อน 60 วิ) */
const claimAlive = (b: { claimUntil: Date | null }, now = Date.now()) => !!b.claimUntil && b.claimUntil.getTime() >= now - CLAIM_GRACE_MS;

/** ตัวอย่างต่อคอลัมน์ (≤ 3 ค่าแรกที่ไม่ว่าง) — ปิดเบอร์/เลขบัตร + เป็นกลาง */
function samplesOf(p: Parsed): string[][] {
  return p.headers.map((_, ci) => {
    const out: string[] = [];
    for (const r of p.rows) {
      const v = (r[ci] ?? "").trim();
      if (!v) continue;
      out.push(safeEcho(v, 60));
      if (out.length >= MAX_SAMPLES) break;
    }
    return out;
  });
}
const headersOf = (p: Parsed) => p.headers.map((h) => safeEcho(h, 80));

// ───────────────────────── ตรวจอินพุต ─────────────────────────
function mappingOf(v: unknown, columns: number): ImportMapping | null {
  if (!isRec(v)) return null;
  const out: ImportMapping = {};
  const used = new Set<string>();
  for (const [k, f] of Object.entries(v)) {
    if (!/^(0|[1-9]\d{0,2})$/.test(k) || Number(k) >= columns) return null;
    if (f === "IGNORE") {
      out[k] = "IGNORE";
      continue;
    }
    if (!isImportFieldKey(f) || used.has(f)) return null;
    used.add(f);
    out[k] = f;
  }
  if (!used.has("room")) return null;
  const sorted: ImportMapping = {};
  for (const k of Object.keys(out).sort((a, b) => Number(a) - Number(b))) sorted[k] = out[k];
  return sorted;
}
type NormOptions = { dateFormat: "BE_DMY" | "CE_DMY" | "ISO"; meterReadDate: string; depositChannel: "CASH" | "TRANSFER" | "PROMPTPAY"; financeAccountId: string | null };
function optionsOf(v: unknown, today: string): NormOptions | null {
  if (v !== undefined && v !== null && !isRec(v)) return null;
  const o = isRec(v) ? v : {};
  const df = o.dateFormat === undefined || o.dateFormat === null ? "BE_DMY" : o.dateFormat;
  if (df !== "BE_DMY" && df !== "CE_DMY" && df !== "ISO") return null;
  const rd = o.meterReadDate === undefined || o.meterReadDate === null || o.meterReadDate === "" ? today : o.meterReadDate;
  if (!isYmd(rd) || rd > today) return null;
  const ch = o.depositChannel === undefined || o.depositChannel === null ? "TRANSFER" : o.depositChannel;
  if (ch !== "CASH" && ch !== "TRANSFER" && ch !== "PROMPTPAY") return null;
  const fa = o.financeAccountId;
  if (fa !== undefined && fa !== null && !(typeof fa === "string" && fa.length <= 64)) return null;
  return { dateFormat: df, meterReadDate: rd, depositChannel: ch, financeAccountId: typeof fa === "string" && fa ? fa : null };
}
type NormDecision = { skip: boolean; set: Partial<Record<ImportFieldKey, string>>; tenant: { mode?: "MERGE" | "SEPARATE"; confirmPartyId?: string; createNewParty?: true } };
function decisionsOf(v: unknown, rowCount: number): Record<string, NormDecision> | null {
  if (v === undefined || v === null) return {};
  if (!isRec(v)) return null;
  const out: Record<string, NormDecision> = {};
  for (const [k, list] of Object.entries(v)) {
    if (!/^\d{1,6}$/.test(k) || Number(k) < 2 || Number(k) > rowCount + 1) return null;
    if (!Array.isArray(list) || list.length > 20) return null;
    const d: NormDecision = { skip: false, set: {}, tenant: {} };
    for (const x of list) {
      if (!isRec(x)) return null;
      if (x.action === "SKIP") d.skip = true;
      else if (x.action === "SET") {
        if (!isImportFieldKey(x.field) || typeof x.value !== "string" || x.value.length > IMPORT_MAX_CELL) return null;
        d.set[x.field] = x.value;
      } else if (x.action === "TENANT") {
        if (x.mode === "MERGE" || x.mode === "SEPARATE") d.tenant.mode = x.mode;
        else if (isStr(x.confirmPartyId) && x.confirmPartyId.length <= 64) d.tenant.confirmPartyId = x.confirmPartyId;
        else if (x.createNewParty === true) d.tenant.createNewParty = true;
        else return null;
      } else return null;
    }
    out[k] = d;
  }
  return out;
}
/** เก็บรูปเดิมของ decisions (สำหรับ hash/แสดงผล) */
function decisionsRaw(d: Record<string, NormDecision>): Record<string, ImportDecision[]> {
  const out: Record<string, ImportDecision[]> = {};
  for (const k of Object.keys(d).sort((a, b) => Number(a) - Number(b))) {
    const x = d[k];
    const list: ImportDecision[] = [];
    if (x.skip) list.push({ action: "SKIP" });
    for (const f of Object.keys(x.set).sort() as ImportFieldKey[]) list.push({ action: "SET", field: f, value: x.set[f] ?? "" });
    if (x.tenant.mode) list.push({ action: "TENANT", mode: x.tenant.mode });
    if (x.tenant.confirmPartyId) list.push({ action: "TENANT", confirmPartyId: x.tenant.confirmPartyId });
    if (x.tenant.createNewParty) list.push({ action: "TENANT", createNewParty: true });
    out[k] = list;
  }
  return out;
}

// ───────────────────────── แผน (ตรวจ + พรีวิว · อ่านอย่างเดียว) ─────────────────────────
type RoomRes = { kind: "EXISTING"; roomId: string } | { kind: "REVIVE"; roomId: string } | { kind: "NEW" };
type PartyRes = { kind: "EXISTING"; partyId: string } | { kind: "NEW" } | { kind: "NEW_FORCED" } | { kind: "CONFIRMED"; partyId: string } | { kind: "MERGE"; rowNo: number; partyId: string | null };
type MeterWork = { kind: "ELEC" | "WATER"; value: number; meterId: string | null; write: boolean };
type RowWork = {
  rowNo: number;
  room: string;
  action: ImportRowAction;
  roomRes: RoomRes | null;
  building: { id: string | null; name: string } | null;
  floorNo: number;
  type: { id: string | null; name: string; rate: number | null } | null;
  note: string | null;
  tenant: null | {
    name: string;
    phone: string | null;
    idCard: string | null;
    start: string;
    months: number;
    rent: number;
    deposit: number;
    advance: number;
    legalWarn: boolean;
    party: PartyRes;
  };
  meters: MeterWork[];
  arrears: number;
};
type Existing = {
  buildings: { id: string; name: string }[];
  types: { id: string; name: string; active: boolean; monthlyRateSatang: number | null; rentMode: string }[];
  rooms: Map<string, { id: string; active: boolean; roomTypeId: string; rentMode: string | null }>;
  revivable: Set<string>;
  leases: Map<string, { id: string; partyId: string }>;
  meters: Map<string, string>;
  readings: Map<string, number>;
  parties: { id: string; name: string; phoneNorm: string | null; taxId: string | null }[];
};
type PlanOut = { work: RowWork[]; issues: ImportIssue[]; rows: ImportPreviewRow[]; summary: ImportSummary; plan: ImportPlan; hash: string; legalWarnRows: number };

const roomKey = (s: string) => s.trim().toUpperCase();
const meterKey = (roomId: string, kind: string) => `${roomId}|${kind}`;
const typeNameOf = (rate: number | null) => (rate === null ? "ห้องพัก" : `ห้อง ${bahtLabel(rate)}/เดือน`);

async function loadExisting(db: Db, tenantId: string, unitId: string, roomNos: string[], phones: string[], ids: string[], periodKey: string, selfBatchId: string): Promise<Existing> {
  const t = db as Tx;
  const buildings = await t.roomBuilding.findMany({ where: { tenantId, unitId }, select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const types = await t.hotelRoomType.findMany({ where: { tenantId, unitId }, select: { id: true, name: true, active: true, monthlyRateSatang: true, rentMode: true } });
  // X15 ▸ เลขห้องเทียบแบบไม่สนตัวพิมพ์ (อ่านห้องทั้งหน่วยแล้วจับคู่ด้วย roomKey)
  const want = new Set(roomNos.map(roomKey));
  const roomRows = want.size
    ? (await t.hotelRoom.findMany({ where: { tenantId, unitId }, select: { id: true, number: true, active: true, roomTypeId: true, rentMode: true }, orderBy: [{ active: "desc" }, { createdAt: "asc" }] })).filter((r) => want.has(roomKey(r.number)))
    : [];
  const rooms = new Map<string, { id: string; active: boolean; roomTypeId: string; rentMode: string | null }>();
  for (const r of roomRows) if (!rooms.has(roomKey(r.number))) rooms.set(roomKey(r.number), { id: r.id, active: r.active, roomTypeId: r.roomTypeId, rentMode: r.rentMode });
  // ห้อง inactive ที่ชุด UNDONE (รวมชุดนี้เอง) เคยสร้าง/ปลุก ⇒ ปลุกกลับได้
  const revivable = new Set<string>();
  const undone = await t.dormImportBatch.findMany({ where: { tenantId, unitId, status: "UNDONE" }, select: { id: true, manifest: true } });
  for (const b of undone) {
    const rows = isRec(b.manifest) && isRec(b.manifest.rows) ? Object.values(b.manifest.rows) : [];
    for (const r of rows) if (isRec(r) && isStr(r.roomId) && (r.roomCreated === true || r.roomRevived === true)) revivable.add(r.roomId);
  }
  void selfBatchId;
  const roomIds = roomRows.map((r) => r.id);
  const leaseRows = roomIds.length
    ? await t.dormLease.findMany({ where: { tenantId, unitId, roomId: { in: roomIds }, status: { in: LIVE_LEASE } }, select: { id: true, roomId: true, partyId: true }, orderBy: { startDate: "asc" } })
    : [];
  const leases = new Map<string, { id: string; partyId: string }>();
  for (const l of leaseRows) if (!leases.has(l.roomId)) leases.set(l.roomId, { id: l.id, partyId: l.partyId });
  const meterRows = roomIds.length ? await t.dormMeter.findMany({ where: { tenantId, unitId, roomId: { in: roomIds }, removedAt: null }, select: { id: true, roomId: true, kind: true } }) : [];
  const meters = new Map(meterRows.filter((m) => m.roomId).map((m) => [meterKey(m.roomId as string, m.kind), m.id]));
  const readRows = meterRows.length
    ? await t.dormMeterReading.findMany({ where: { tenantId, unitId, meterId: { in: meterRows.map((m) => m.id) }, periodKey, kind: "PERIOD" }, select: { meterId: true, value: true } })
    : [];
  const readings = new Map(readRows.map((r) => [r.meterId, r.value]));
  const or: Prisma.PartyWhereInput[] = [];
  if (phones.length) or.push({ phoneNorm: { in: phones } });
  if (ids.length) or.push({ taxId: { in: ids } });
  const parties = or.length
    ? await t.party.findMany({ where: { tenantId, mergedIntoId: null, OR: or }, select: { id: true, name: true, phoneNorm: true, taxId: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
    : [];
  return { buildings, types, rooms, revivable, leases, meters, readings, parties };
}

type PlanInput = {
  tenantId: string;
  unitId: string;
  batchId: string;
  fileHash: string;
  parsed: Parsed;
  mapping: ImportMapping;
  options: NormOptions;
  decisions: Record<string, NormDecision>;
  settings: ImportSettings;
  today: string;
  /** X12 ▸ ชื่อที่ทำให้ข้อความสัญญาของหน่วยผิด (ตัวตรวจอ่านอย่างเดียวของ D.5 · คิดก่อนเปิด tx) */
  contractBad: Set<string>;
};
/** ชื่อผู้เช่าที่อาจถูกใช้ (รูปเดียวกับ computePlan) ของทุกแมปปิ้ง/การตัดสินที่ให้มา */
function candidateNames(p: Parsed, maps: (ImportMapping | null)[], decs: (Record<string, NormDecision> | null)[]): string[] {
  const out = new Set<string>();
  const norm = (v: string) => neutralizeCell(v.replace(/\s+/g, " ").trim()).replace(/\s+/g, " ").trim();
  for (const m of maps) {
    if (!m) continue;
    const col = Object.entries(m).find(([, f]) => f === "tenantName")?.[0];
    if (col === undefined) continue;
    for (const r of p.rows) {
      const v = r[Number(col)] ?? "";
      if (v.trim() && v.length <= IMPORT_MAX_CELL) out.add(norm(v));
    }
  }
  for (const d of decs) for (const x of Object.values(d ?? {})) if (typeof x.set.tenantName === "string" && x.set.tenantName.trim()) out.add(norm(x.set.tenantName));
  return [...out];
}
const SEV_RANK = { OK: 0, WARN: 1, MUST_FIX: 2 } as const;

async function computePlan(db: Db, inp: PlanInput): Promise<PlanOut> {
  const { parsed, mapping, options, decisions, settings, today } = inp;
  const colOf = new Map<ImportFieldKey, number>();
  for (const [k, f] of Object.entries(mapping)) if (f !== "IGNORE") colOf.set(f, Number(k));
  const periodKey = options.meterReadDate.slice(0, 7);
  type Cells = Partial<Record<ImportFieldKey, string>>;
  const cellsOf = (r: string[], rowNo: number): Cells => {
    const c: Cells = {};
    for (const [f, i] of colOf) c[f] = r[i] ?? "";
    const set = decisions[String(rowNo)]?.set ?? {};
    for (const [f, v] of Object.entries(set)) c[f as ImportFieldKey] = v;
    return c;
  };
  const allCells = parsed.rows.map((r, i) => cellsOf(r, i + 2));
  // ค่าที่ต้องรู้ก่อนอ่านฐาน: เลขห้อง · เบอร์ · เลขบัตร
  const roomNos = [...new Set(allCells.map((c) => (c.room ?? "").trim()).filter((x) => ROOM_RE.test(x)))];
  const phones = [...new Set(allCells.map((c) => normalizePartyPhone(phoneDigits(c.phone ?? ""))).filter((x) => x.length >= 8))];
  const ids = [...new Set(allCells.map((c) => (c.idCard ?? "").replace(/[\s-]/g, "")).filter((x) => thaiIdOk(x)).map((x) => normalizePartyTaxId(x)))];
  const confirmIds = [...new Set(Object.values(decisions).map((d) => d.tenant.confirmPartyId).filter(isStr))];
  const ex = await loadExisting(db, inp.tenantId, inp.unitId, roomNos, phones, ids, periodKey, inp.batchId);
  const confirmParties = confirmIds.length
    ? await (db as Tx).party.findMany({ where: { tenantId: inp.tenantId, id: { in: confirmIds }, mergedIntoId: null }, select: { id: true } })
    : [];
  const confirmOk = new Set(confirmParties.map((p) => p.id));

  // มัธยฐานมิเตอร์ต่อคอลัมน์ (ใช้ตัดสินค่าผิดปกติ)
  const medianOf = (f: ImportFieldKey) => {
    const vs = allCells.map((c) => (c[f] ?? "").replace(/,/g, "").trim()).filter((x) => /^\d{1,10}$/.test(x)).map(Number).sort((a, b) => a - b);
    if (!vs.length) return 0;
    const mid = Math.floor(vs.length / 2);
    return vs.length % 2 ? vs[mid] : (vs[mid - 1] + vs[mid]) / 2;
  };
  const medElec = medianOf("elecReading");
  const medWater = medianOf("waterReading");
  // ค่าเช่าที่พบบ่อยสุด (ห้องไม่มีค่าเช่า ⇒ ประเภทของค่านี้)
  const rentCount = new Map<number, number>();
  for (const c of allCells) {
    const r = parseMoneySatang(c.rent ?? "");
    if (r !== null && r > 0) rentCount.set(r, (rentCount.get(r) ?? 0) + 1);
  }
  let commonRent: number | null = null;
  for (const [r, n] of [...rentCount].sort((a, b) => a[0] - b[0])) if (commonRent === null || n > (rentCount.get(commonRent) ?? 0)) commonRent = r;
  // ห้องซ้ำในไฟล์
  const roomSeen = new Map<string, number>();
  for (const c of allCells) {
    const k = roomKey(c.room ?? "");
    if (k) roomSeen.set(k, (roomSeen.get(k) ?? 0) + 1);
  }

  const issues: ImportIssue[] = [];
  const work: RowWork[] = [];
  const rowsOut: ImportPreviewRow[] = [];
  const byContact = new Map<string, { rowNo: number; room: string; name: string; party: PartyRes }>();
  const newBuildingName = "อาคาร 1";
  let legalWarnRows = 0;
  const roomBad = new Set<number>();

  parsed.rows.forEach((raw, i) => {
    const rowNo = i + 2;
    const c = allCells[i];
    const dec = decisions[String(rowNo)];
    const roomRaw = (c.room ?? "").trim();
    const roomShow = safeEcho(roomRaw, 20) || null;
    const iss: ImportIssue[] = [];
    const add = (code: string, severity: ImportIssue["severity"], field: ImportFieldKey | null, value: string | null, messageTh: string, legal?: ImportIssue["legal"]) =>
      iss.push({ rowNo, room: roomShow, code, severity, field, value: value === null ? null : safeEcho(value), messageTh, ...(legal ? { legal } : {}) });
    const rw: RowWork = { rowNo, room: roomRaw, action: "VACANT", roomRes: null, building: null, floorNo: 1, type: null, note: null, tenant: null, meters: [], arrears: 0 };
    if (dec?.skip) {
      rw.action = "SKIPPED";
      work.push(rw);
      rowsOut.push({ rowNo, room: roomShow ?? "", action: "SKIPPED", severity: "OK" });
      return;
    }
    // เซลล์ยาวเกิน (ทุกช่องที่แมป)
    for (const [f] of colOf) if ([...(c[f] ?? "")].length > IMPORT_MAX_CELL) add("CELL_TOO_LONG", "MUST_FIX", f, (c[f] ?? "").slice(0, 40), `ข้อความในช่องยาวเกิน ${IMPORT_MAX_CELL.toLocaleString("en-US")} ตัวอักษร — ตัดให้สั้นลงในไฟล์`);
    void raw;
    // ── ห้อง ──
    if (!roomRaw || looksFormula(roomRaw) || !ROOM_RE.test(roomRaw)) add("ROOM_INVALID", "MUST_FIX", "room", roomRaw, "เลขห้องต้องเป็นตัวเลข/ตัวอักษร ไม่เกิน 12 ตัว (เช่น 101, A-12)");
    else if ((roomSeen.get(roomKey(roomRaw)) ?? 0) > 1) add("ROOM_DUP_IN_FILE", "MUST_FIX", "room", roomRaw, "เลขห้องนี้อยู่ในไฟล์มากกว่า 1 แถว — แก้ให้เหลือแถวเดียว หรือข้ามแถวที่ซ้ำ");
    const exRoom = ROOM_RE.test(roomRaw) ? ex.rooms.get(roomKey(roomRaw)) : undefined;
    if (exRoom) {
      if (exRoom.active) rw.roomRes = { kind: "EXISTING", roomId: exRoom.id };
      else if (ex.revivable.has(exRoom.id)) rw.roomRes = { kind: "REVIVE", roomId: exRoom.id };
      else add("ROOM_INACTIVE", "MUST_FIX", "room", roomRaw, "ห้องเลขนี้ถูกปิดใช้งานอยู่ในระบบ — เปิดใช้ห้องก่อน หรือข้ามแถวนี้");
      const ty = ex.types.find((x) => x.id === exRoom.roomTypeId);
      const mode = exRoom.rentMode ?? ty?.rentMode ?? "MONTHLY";
      if (mode === "NIGHTLY") add("ROOM_NOT_MONTHLY", "MUST_FIX", "room", roomRaw, "ห้องนี้ตั้งเป็นห้องรายคืน — เปลี่ยนเป็นรายเดือนก่อนนำเข้าผู้เช่า");
    } else rw.roomRes = { kind: "NEW" };
    // ── ชั้น ──
    if (colOf.has("floor") && (c.floor ?? "").trim()) {
      const f = (c.floor ?? "").trim();
      if (/^\d{1,3}$/.test(f) && Number(f) >= 1 && Number(f) <= 200) rw.floorNo = Number(f);
      else add("FLOOR_INVALID", "MUST_FIX", "floor", f, "ชั้นต้องเป็นจำนวนเต็ม 1–200");
    } else if (/^\d{3}$/.test(roomRaw)) rw.floorNo = Math.max(1, Number(roomRaw[0]));
    else if (/^\d{4}$/.test(roomRaw)) rw.floorNo = Math.max(1, Number(roomRaw.slice(0, 2)));
    else rw.floorNo = 1;
    // ── อาคาร ──
    const bRaw = (c.building ?? "").trim();
    if (bRaw) {
      const bn = neutralizeCell(bRaw).slice(0, TEXT_MAX);
      if (bn !== bRaw) add("TEXT_NEUTRALIZED", "WARN", "building", bn, "ชื่ออาคารขึ้นต้นด้วยเครื่องหมายสูตร — ระบบเก็บเป็นข้อความธรรมดา (แก้ในไฟล์ได้)");
      const hit = ex.buildings.find((b) => b.name === bn);
      rw.building = { id: hit?.id ?? null, name: bn };
    } else if (ex.buildings.length === 1) rw.building = { id: ex.buildings[0].id, name: ex.buildings[0].name };
    else if (ex.buildings.length === 0) rw.building = { id: null, name: newBuildingName };
    else if (rw.roomRes?.kind === "NEW") add("BUILDING_REQUIRED", "MUST_FIX", "building", null, "หอนี้มีหลายอาคาร — เพิ่มคอลัมน์อาคารในไฟล์ หรือระบุอาคารของห้องนี้");
    // ── เงิน ──
    const money = (f: ImportFieldKey): number | null => {
      const v = (c[f] ?? "").trim();
      if (!v) return null;
      const m = parseMoneySatang(v);
      if (m === null) {
        add("MONEY_INVALID", "MUST_FIX", f, v, "ยอดเงินอ่านไม่ได้ (ใช้ตัวเลข เช่น 4500 หรือ 4,500.50 · ไม่ติดลบ · ไม่ใช่สูตร)");
        return null;
      }
      return m;
    };
    const rent = money("rent");
    const deposit = money("deposit");
    const advance = money("advanceRent");
    const arrears = money("arrears");
    if (arrears !== null && arrears > 0) {
      rw.arrears = arrears;
      add("ARREARS_NOT_IMPORTED", "INFO", "arrears", null, `ยอดค้างยกมา ${bahtLabel(arrears)} — จดไว้ ยังไม่ออกใบแจ้งหนี้`);
    }
    // ── ประเภทห้อง ──
    const tRaw = (c.roomType ?? "").trim();
    if (rw.roomRes?.kind === "NEW") {
      if (tRaw) {
        const tn = neutralizeCell(tRaw).slice(0, TEXT_MAX);
        if (tn !== tRaw) add("TEXT_NEUTRALIZED", "WARN", "roomType", tn, "ชื่อประเภทห้องขึ้นต้นด้วยเครื่องหมายสูตร — ระบบเก็บเป็นข้อความธรรมดา");
        const hit = ex.types.find((x) => x.name === tn);
        rw.type = { id: hit?.id ?? null, name: tn, rate: hit ? hit.monthlyRateSatang : rent && rent > 0 ? rent : null };
      } else {
        let rate = rent !== null && rent > 0 ? rent : null;
        if (rate === null) {
          rate = commonRent;
          add("ROOM_TYPE_ASSUMED", "INFO", "roomType", null, `ห้องไม่มีค่าเช่าในไฟล์ — ใช้ประเภท ${typeNameOf(rate)} (ค่าที่พบบ่อยสุดในไฟล์)`);
        }
        const name = typeNameOf(rate);
        const hit = ex.types.find((x) => x.name === name);
        rw.type = { id: hit?.id ?? null, name, rate };
      }
    }
    // ── หมายเหตุ (เฉพาะห้องที่สร้างใหม่) ──
    const nRaw = c.note ?? "";
    if (nRaw.trim()) {
      const nn = neutralizeCell(nRaw);
      if (nn !== nRaw) add("TEXT_NEUTRALIZED", "WARN", "note", nn, "หมายเหตุขึ้นต้นด้วยเครื่องหมายสูตร — ระบบเก็บเป็นข้อความธรรมดา (แก้ในไฟล์ได้)");
      if ([...nn.trim()].length > NOTE_MAX) add("TEXT_TOO_LONG", "MUST_FIX", "note", nn.slice(0, 40), `หมายเหตุยาวเกิน ${NOTE_MAX} ตัวอักษร`);
      rw.note = nn.trim().slice(0, NOTE_MAX) || null;
    }
    // ── มิเตอร์ ──
    for (const [f, kind, med] of [["elecReading", "ELEC", medElec], ["waterReading", "WATER", medWater]] as const) {
      const v = (c[f] ?? "").replace(/,/g, "").trim();
      if (!v) continue;
      if (!/^\d{1,10}$/.test(v) || Number(v) > MAX_READING) {
        add("METER_INVALID", "MUST_FIX", f, c[f] ?? "", "เลขมิเตอร์ต้องเป็นจำนวนเต็มไม่ติดลบ");
        continue;
      }
      const value = Number(v);
      if (med > 0 && value > med * 3) add("METER_OUTLIER", "WARN", f, v, `เลขมิเตอร์${kind === "ELEC" ? "ไฟ" : "น้ำ"} ${value.toLocaleString("en-US")} สูงกว่าห้องอื่นมาก — ตรวจว่าเลขถูก (ระบบใช้เป็นเลขเริ่มตามไฟล์)`);
      const roomId = rw.roomRes && rw.roomRes.kind !== "NEW" ? rw.roomRes.roomId : null;
      const meterId = roomId ? (ex.meters.get(meterKey(roomId, kind)) ?? null) : null;
      let write = true;
      if (meterId && ex.readings.has(meterId)) {
        write = false;
        if (ex.readings.get(meterId) !== value) add("METER_CONFLICT", "WARN", f, v, "มีเลขมิเตอร์งวดนี้ในระบบแล้วและไม่ตรงกับไฟล์ — คงค่าในระบบไว้ (ไม่ทับ)");
      }
      rw.meters.push({ kind, value, meterId, write });
    }
    // ── ผู้เช่า ──
    const nameRaw = (c.tenantName ?? "").replace(/\s+/g, " ").trim();
    if (nameRaw) {
      const name = neutralizeCell(nameRaw).replace(/\s+/g, " ").trim();
      if (name !== nameRaw) add("TEXT_NEUTRALIZED", "WARN", "tenantName", name, "ชื่อผู้เช่าขึ้นต้นด้วยเครื่องหมายสูตร — ระบบเก็บเป็นข้อความธรรมดา (แก้ในไฟล์ได้)");
      if ([...name].length > NAME_MAX) add("TEXT_TOO_LONG", "MUST_FIX", "tenantName", name.slice(0, 40), `ชื่อผู้เช่ายาวเกิน ${NAME_MAX} ตัวอักษร`);
      if (inp.contractBad.has(name) || findForbiddenTerms(name).length) add("CONTRACT_LEGAL", "MUST_FIX", "tenantName", null, "ชื่อผู้เช่ามีถ้อยคำที่ข้อความสัญญาห้ามตามประกาศ สคบ. — ตรวจชื่อในไฟล์");
      // เบอร์ · เลขบัตร
      const phRaw = (c.phone ?? "").trim();
      let phone: string | null = null;
      if (phRaw) {
        const d = phRaw.startsWith("+") || !looksFormula(phRaw) ? phoneDigits(phRaw) : "";
        if (!d) add("PHONE_INVALID", "MUST_FIX", "phone", phRaw, "เบอร์โทรไม่ถูกต้อง (เบอร์ไทย 9–10 หลัก)");
        else phone = d;
      }
      const idRaw = (c.idCard ?? "").replace(/[\s-]/g, "");
      let idCard: string | null = null;
      if (idRaw) {
        if (!thaiIdOk(idRaw)) add("IDCARD_INVALID", "MUST_FIX", "idCard", idRaw, "เลขบัตรประชาชนไม่ถูกต้อง (13 หลัก เลขตรวจต้องถูก)");
        else idCard = idRaw;
      }
      if (!phRaw && !idRaw) add("TENANT_CONTACT_REQUIRED", "MUST_FIX", "phone", null, "ต้องมีเบอร์โทรหรือเลขบัตรประชาชนของผู้เช่า (ใช้หาผู้เช่าซ้ำ)");
      // วันเริ่ม · ระยะ
      const sRaw = (c.startDate ?? "").trim();
      const start = sRaw ? parseThaiDate(sRaw, options.dateFormat) : null;
      if (!sRaw) add("DATE_INVALID", "MUST_FIX", "startDate", null, "ไม่มีวันเข้าอยู่ของผู้เช่า");
      else if (!start) add("DATE_INVALID", "MUST_FIX", "startDate", sRaw, "วันเข้าอยู่อ่านไม่ได้ (เช่น 1/5/69 = 1 พ.ค. 2569)");
      else if (start > today) add("START_IN_FUTURE", "MUST_FIX", "startDate", sRaw, "วันเข้าอยู่ยังไม่ถึง — ผู้ที่ยังไม่เข้าอยู่ให้ทำสัญญาที่หน้าผู้เช่า");
      let months = settings.defaultMonths;
      const mRaw = (c.months ?? "").trim();
      if (mRaw) {
        if (/^\d{1,3}$/.test(mRaw) && Number(mRaw) >= 1 && Number(mRaw) <= 360) months = Number(mRaw);
        else add("MONTHS_INVALID", "MUST_FIX", "months", mRaw, "ระยะสัญญาต้องเป็นจำนวนเดือนเต็ม 1–360");
      }
      if (start && start <= today && leaseEndDate(start, months) < today) {
        while (months <= 360 && leaseEndDate(start, months) < today) months += settings.defaultMonths;
        if (months > 360) add("MONTHS_INVALID", "MUST_FIX", "months", null, "สัญญาในไฟล์เริ่มนานเกินกว่าจะต่ออายุอัตโนมัติ — ระบุวันเริ่มรอบปัจจุบัน");
        else add("LEASE_ENDED_IN_FILE", "WARN", "startDate", sRaw, `สัญญาในไฟล์ครบกำหนดแล้ว — ระบบต่ออายุให้ครอบวันนี้ (รวม ${months} เดือน)`);
      }
      // ค่าเช่า
      let rentV = rent;
      if (rentV === null || rentV <= 0) {
        const rate = rw.type?.rate ?? (exRoom ? (ex.types.find((x) => x.id === exRoom.roomTypeId)?.monthlyRateSatang ?? null) : null);
        if (!(c.rent ?? "").trim() || rentV === 0) {
          if (tRaw && rate && rate > 0) rentV = rate;
          else add("RENT_REQUIRED", "MUST_FIX", "rent", null, "ไม่มีค่าเช่าของห้องนี้ในไฟล์ — ใส่ค่าห้องต่อเดือน");
        }
      }
      const dep = deposit ?? 0;
      const adv = advance ?? 0;
      // กฎหมาย (ตัวตรวจเดียวกับ createLease · โหมดสด)
      let legalWarn = false;
      if (start && rentV && rentV > 0 && months <= 360) {
        const lk = legalLeaseKind(months);
        if (!lk) add("MONTHS_INVALID", "MUST_FIX", "months", null, "ระยะสัญญาเกินที่กฎหมายกำหนด");
        else {
          const o = evaluateLegal("DEPOSIT_ADVANCE_LIMIT", { leaseKind: lk, monthlyRentSatang: rentV, depositSatang: dep, advanceRentSatang: adv }, { mode: settings.legalMode, outOfScopeReason: settings.oosReason });
          const legal = { code: o.code, messageTh: o.messageTh, citation: o.citation };
          const months10 = Math.round((dep * 10) / rentV) / 10;
          const msg = `ประกัน ${bahtLabel(dep)} = ${months10} เดือนของค่าเช่า — ${o.messageTh} → แก้ยอด หรือข้ามแถว`;
          if (o.level === "BLOCK") add("DEPOSIT_LEGAL", "MUST_FIX", "deposit", null, msg, legal);
          else if (o.level === "WARN") {
            add("DEPOSIT_LEGAL", "WARN", "deposit", null, `${msg} (สร้างได้เมื่อเจ้าของยืนยันพร้อมเหตุผล)`, legal);
            legalWarn = true;
          }
        }
      }
      // ผู้เช่า = Party (K3 แบบอ่านอย่างเดียว) + ซ้ำในไฟล์
      const ph = phone ? normalizePartyPhone(phone) : "";
      const idn = idCard ? normalizePartyTaxId(idCard) : "";
      let party: PartyRes = { kind: "NEW" };
      const prior = (ph && byContact.get(`p:${ph}`)) || (idn && byContact.get(`i:${idn}`)) || null;
      if (dec?.tenant.confirmPartyId) {
        if (confirmOk.has(dec.tenant.confirmPartyId)) party = { kind: "CONFIRMED", partyId: dec.tenant.confirmPartyId };
        else add("TENANT_MATCH_CONFIRM", "MUST_FIX", "tenantName", null, "ไม่พบผู้ติดต่อที่เลือกในร้าน — เลือกใหม่ หรือสร้างผู้เช่ารายใหม่");
      } else if (dec?.tenant.createNewParty) party = { kind: "NEW_FORCED" };
      else if (prior) {
        const same = nameMatches(name, prior.name);
        const mode = dec?.tenant.mode ?? (same ? "MERGE" : null);
        const priorPartyId = prior.party.kind === "EXISTING" || prior.party.kind === "CONFIRMED" ? prior.party.partyId : prior.party.kind === "MERGE" ? prior.party.partyId : null;
        if (mode === "MERGE") party = { kind: "MERGE", rowNo: prior.party.kind === "MERGE" ? prior.party.rowNo : prior.rowNo, partyId: priorPartyId };
        else if (mode === "SEPARATE") party = { kind: "NEW_FORCED" };
        add(
          "PHONE_DUP_IN_FILE",
          mode ? "WARN" : "MUST_FIX",
          "phone",
          phRaw || null,
          `เบอร์ซ้ำกับห้อง ${safeEcho(prior.room, 20)} — คนเดียวเช่า 2 ห้อง? ${mode === "MERGE" ? "รวมเป็นผู้เช่าคนเดียว" : mode === "SEPARATE" ? "แยกเป็นคนละคน" : "เลือก รวมเป็นผู้เช่าคนเดียว / แยกคน"}`,
        );
      } else {
        const byId = idn ? ex.parties.find((p) => p.taxId === idn) : undefined;
        const byPhone = !byId && ph.length >= 8 ? ex.parties.find((p) => p.phoneNorm === ph) : undefined;
        const confirm = (p: { name: string }) =>
          add("TENANT_MATCH_CONFIRM", "MUST_FIX", "tenantName", null, `${byId ? "เลขบัตรประชาชน" : "เบอร์โทร"}นี้เป็นของผู้ติดต่อชื่ออื่นในร้าน (${safeEcho(p.name, 40)}) — เลือกใช้ผู้ติดต่อรายนั้น หรือสร้างผู้เช่ารายใหม่`);
        if (byId) {
          if (nameMatches(name, byId.name)) party = { kind: "EXISTING", partyId: byId.id };
          else confirm(byId);
        } else if (byPhone) {
          if (byPhone.taxId && idn) party = { kind: "NEW" };
          else if (nameMatches(name, byPhone.name)) party = { kind: "EXISTING", partyId: byPhone.id };
          else confirm(byPhone);
        }
      }
      rw.tenant = { name, phone, idCard, start: start ?? "", months, rent: rentV ?? 0, deposit: dep, advance: adv, legalWarn, party };
    } else if (rent !== null && rent > 0) add("VACANT_WITH_RENT", "WARN", "tenantName", null, "ไม่มีชื่อผู้เช่าแต่มีค่าเช่า — นำเข้าเป็นห้องว่าง (ไม่สร้างสัญญา)");
    else add("ROOM_ONLY", "INFO", null, null, "ห้องว่าง — สร้างห้องและมิเตอร์เท่านั้น");

    // ── ห้องมีสัญญาอยู่แล้ว ──
    const roomId = rw.roomRes && rw.roomRes.kind !== "NEW" ? rw.roomRes.roomId : null;
    const live = roomId ? ex.leases.get(roomId) : undefined;
    let skipExists = false;
    if (live && rw.tenant) {
      const p = rw.tenant.party;
      const pid = p.kind === "EXISTING" || p.kind === "CONFIRMED" ? p.partyId : p.kind === "MERGE" ? p.partyId : null;
      if (pid && pid === live.partyId) {
        skipExists = true;
        add("SKIP_EXISTS", "INFO", null, null, "ห้องนี้มีสัญญาของผู้เช่าคนเดียวกันอยู่แล้ว — ไม่สร้างซ้ำ");
      } else add("ROOM_OCCUPIED", "MUST_FIX", "room", roomRaw, "ห้องนี้มีสัญญาของผู้เช่าคนอื่นอยู่ในระบบ — ตรวจเลขห้อง หรือข้ามแถวนี้");
    }

    if (iss.some((x) => x.severity === "MUST_FIX" && (x.field === "room" || x.field === "building" || x.field === "floor" || x.field === "roomType"))) roomBad.add(rowNo);
    const sev = iss.reduce<"OK" | "WARN" | "MUST_FIX">((s, x) => (x.severity === "INFO" ? s : SEV_RANK[x.severity] > SEV_RANK[s] ? x.severity : s), "OK");
    rw.action = sev === "MUST_FIX" ? "BLOCKED" : skipExists ? "SKIP_EXISTS" : rw.tenant ? "CREATE" : "VACANT";
    if (rw.action === "CREATE" && rw.tenant?.legalWarn) legalWarnRows++;
    if ((rw.action === "CREATE" || rw.action === "SKIP_EXISTS") && rw.tenant) {
      const entry = { rowNo, room: roomRaw, name: rw.tenant.name, party: rw.tenant.party };
      const pk = phoneKey(rw.tenant.phone);
      if (pk && !byContact.has(`p:${pk}`)) byContact.set(`p:${pk}`, entry);
      if (rw.tenant.idCard && !byContact.has(`i:${normalizePartyTaxId(rw.tenant.idCard)}`)) byContact.set(`i:${normalizePartyTaxId(rw.tenant.idCard)}`, entry);
    }
    issues.push(...iss);
    work.push(rw);
    rowsOut.push({ rowNo, room: roomShow ?? "", action: rw.action, severity: sev });
  });

  // ── แผน (ของที่จะสร้างใหม่จริง) ──
  const counted = work.filter((w) => w.action === "CREATE" || w.action === "VACANT" || w.action === "SKIP_EXISTS");
  // โครงสร้าง (ห้อง/มิเตอร์) นับรวมแถวที่ติดเฉพาะเรื่องผู้เช่า/เงิน (ห้องของแถวนั้นยังถูกต้อง) — ตามภาพ 12 "1 · 3 · 36"
  const structural = work.filter((w) => w.action !== "SKIPPED" && w.roomRes !== null && !roomBad.has(w.rowNo));
  const newRooms = structural.filter((w) => w.roomRes?.kind === "NEW" || w.roomRes?.kind === "REVIVE");
  const newTypeNames = new Set(newRooms.filter((w) => w.roomRes?.kind === "NEW" && w.type && !w.type.id).map((w) => w.type!.name));
  const newBuildings = new Set(newRooms.filter((w) => w.roomRes?.kind === "NEW" && w.building && !w.building.id).map((w) => w.building!.name));
  const creates = counted.filter((w) => w.action === "CREATE");
  const plan: ImportPlan = {
    buildings: newBuildings.size,
    floors: new Set(newRooms.map((w) => w.floorNo)).size,
    rooms: newRooms.length,
    roomTypes: newTypeNames.size,
    leases: creates.length,
    parties: creates.filter((w) => w.tenant && (w.tenant.party.kind === "NEW" || w.tenant.party.kind === "NEW_FORCED")).length,
    meters: structural.reduce((s, w) => s + w.meters.filter((m) => !m.meterId).length, 0),
    readings: structural.reduce((s, w) => s + w.meters.filter((m) => m.write).length, 0),
    depositSatang: creates.reduce((s, w) => s + (w.tenant?.deposit ?? 0), 0),
    arrears: { count: work.filter((w) => w.action !== "SKIPPED" && w.arrears > 0).length, satang: work.filter((w) => w.action !== "SKIPPED").reduce((s, w) => s + w.arrears, 0) },
    existing: {
      rooms: counted.filter((w) => w.roomRes?.kind === "EXISTING").length,
      leases: counted.filter((w) => w.action === "SKIP_EXISTS").length,
      meters: counted.reduce((s, w) => s + w.meters.filter((m) => !!m.meterId).length, 0),
    },
    skippedRows: work.filter((w) => w.action === "SKIPPED").length,
  };
  const summary: ImportSummary = {
    rows: rowsOut.length,
    ready: rowsOut.filter((r) => r.severity === "OK").length,
    warn: rowsOut.filter((r) => r.severity === "WARN").length,
    mustFix: rowsOut.filter((r) => r.severity === "MUST_FIX").length,
  };
  const hash = sha256(
    stable({
      v: 1,
      fileHash: inp.fileHash,
      mapping,
      options,
      decisions: decisionsRaw(decisions),
      legal: { mode: settings.legalMode, reason: settings.oosReason },
      settings: { defaultMonths: settings.defaultMonths },
      today,
      work,
    }),
  );
  return { work, issues, rows: rowsOut, summary, plan, hash, legalWarnRows };
}
const phoneKey = (p: string | null) => (p ? normalizePartyPhone(p) : "");

/** พรีวิวที่ผ่านมา (ล่าสุด ≤ 20) — createImport ใช้สถานะของพรีวิวที่ hash ตรง (คนยืนยัน · การตัดสิน · ตัวเลือก) แล้วคิดแผนใหม่ใต้ล็อก */
type PreviewState = { hash: string; mapping: unknown; options: unknown; decisions: unknown; confirmedById: string | null };
const MAX_PREVIEWS = 20;
function previewsOf(b: BatchRec): PreviewState[] {
  const s = isRec(b.summary) ? b.summary : null;
  const list: unknown[] = s && Array.isArray(s.previews) ? (s.previews as unknown[]) : [];
  return list
    .filter(isRec)
    .filter((x) => typeof x.hash === "string")
    .map((x) => ({ hash: String(x.hash), mapping: x.mapping, options: x.options, decisions: x.decisions, confirmedById: typeof x.confirmedById === "string" ? x.confirmedById : null }));
}
/** อ่านสถานะชุด + แผนพรีวิวเดิมจาก JSON (ไม่มี ⇒ null) */
function storedPreview(b: BatchRec): { summary: ImportSummary; issues: ImportIssue[]; plan: ImportPlan } | null {
  const s = isRec(b.summary) ? b.summary : null;
  if (!s || !isRec(s.summary) || !isRec(s.plan)) return null;
  return { summary: s.summary as unknown as ImportSummary, issues: Array.isArray(s.issues) ? (s.issues as unknown as ImportIssue[]) : [], plan: s.plan as unknown as ImportPlan };
}

// ═════════════════════════ 3.1 uploadImport ═════════════════════════
export async function uploadImport(
  ctx: ImportCtx,
  input: { unitId: string; fileName: string; contentType?: string | null; data: Uint8Array; sheet?: string | null },
  deps?: { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void> },
): Promise<ImportUploadResult | Fail> {
  try {
    if (!isRec(input)) return notFound();
    const g = await gate(ctx, input.unitId, "import");
    if (!g) return notFound();
    if (!(input.data instanceof Uint8Array)) return fail("INVALID_INPUT", "ไม่มีไฟล์ที่จะนำเข้า");
    const fileName = (typeof input.fileName === "string" ? input.fileName : "").replace(/[\\/\u0000-\u001f]/g, " ").trim().slice(0, 200) || "import";
    const st = await settingsOf(g.tenantId, g.unitId);
    if (input.data.length > st.maxFileBytes)
      return fail("FILE_TOO_LARGE", `ไฟล์ใหญ่เกิน ${(st.maxFileBytes / 1_000_000).toLocaleString("en-US")} MB — แบ่งเป็นหลายไฟล์ หรือลบคอลัมน์ที่ไม่ใช้`);
    const p = parseImportFile(input.data, {
      sheet: input.sheet ?? null,
      maxUnzippedBytes: Math.min(MAX_UNZIP, st.maxFileBytes * ZIP_RATIO),
      maxRows: st.maxRows,
      maxChars: Math.min(MAX_PARSED_CHARS, st.maxFileBytes * PARSED_RATIO),
    });
    if (!p.ok) return fail(p.code, p.reason);
    if (p.rows.length > st.maxRows) return fail("TOO_MANY_ROWS", `ไฟล์มี ${p.rows.length.toLocaleString("en-US")} แถว เกินที่ตั้งไว้ ${st.maxRows.toLocaleString("en-US")} แถว — แบ่งเป็นหลายไฟล์`);
    if (p.headers.length > IMPORT_MAX_COLUMNS) return fail("TOO_MANY_COLUMNS", `ไฟล์มีเกิน ${IMPORT_MAX_COLUMNS} คอลัมน์ — ลบคอลัมน์ที่ไม่ใช้ออกก่อน`);
    const fileHash = sha256(input.data);
    const parsed: Parsed = { encoding: p.encoding, sheets: p.sheets, headers: p.headers, rows: p.rows };
    const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
    const resultOf = (b: BatchRec, duplicate: boolean): ImportUploadResult => {
      const pp = parsedOf(b);
      return {
        ok: true,
        batchId: b.id,
        duplicate,
        status: statusOf(b.status),
        format: b.format === "XLSX" ? "XLSX" : "CSV",
        sheet: b.sheet ?? "",
        sheets: pp.sheets,
        rowCount: b.rowCount,
        columnCount: b.columnCount,
        headers: headersOf(pp),
        samples: samplesOf(pp),
      };
    };
    const already = (await db.dormImportBatch.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, fileHash }, select: BATCH_SELECT })) as BatchRec | null;
    if (already) {
      // X18 ▸ ไฟล์เดิมแต่เลือกชีตอื่น: ชุดที่ยังไม่สร้าง (DRAFT/UNDONE) ⇒ เปลี่ยนชีตของชุด (ล้างข้อเสนอ/การยืนยัน/พรีวิวเดิม)
      const wantSheet = typeof input.sheet === "string" && input.sheet.trim() ? input.sheet.trim() : null;
      if (wantSheet && wantSheet !== already.sheet && (already.status === "DRAFT" || already.status === "UNDONE")) {
        const upd = await db.dormImportBatch.updateMany({
          where: { id: already.id, tenantId: g.tenantId, unitId: g.unitId, status: { in: ["DRAFT", "UNDONE"] }, version: already.version },
          data: {
            sheet: p.sheet,
            parsed: json(parsed),
            rowCount: p.rows.length,
            columnCount: p.headers.length,
            proposal: json(null),
            mapping: json(null),
            mappingConfirmedById: null,
            options: json(null),
            decisions: json(null),
            summary: json(null),
            previewHash: null,
            version: { increment: 1 },
          },
        });
        if (upd.count !== 1) return busy();
        const fresh = (await db.dormImportBatch.findFirst({ where: { id: already.id, tenantId: g.tenantId, unitId: g.unitId }, select: BATCH_SELECT })) as BatchRec | null;
        if (fresh) return resultOf(fresh, true);
      }
      return resultOf(already, true);
    }
    // ไฟล์ต้นทาง ⇒ FileAsset private ก่อนเปิด tx (ที่เก็บไฟล์ไม่พร้อม ⇒ ทำต่อโดยไม่มีสำเนา)
    let fileId: string | null = null;
    try {
      const up = await uploadFile(
        { tenantId: g.tenantId },
        {
          kind: "ATTACHMENT",
          visibility: "private",
          filename: `dorm-import.${p.format === "XLSX" ? "xlsx" : "txt"}`,
          contentType: p.format === "XLSX" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/plain",
          data: input.data,
          maxBytes: st.maxFileBytes,
        },
        deps?.put ? { put: deps.put } : undefined,
      );
      fileId = up.ok ? up.assetId : null;
    } catch {
      fileId = null;
    }
    const dropOurFile = async () => {
      if (!fileId) return;
      try {
        await deleteFileAsset({ tenantId: g.tenantId }, fileId, deps?.put ? { del: async () => 200 } : undefined);
      } catch {
        /* best-effort — ไฟล์ส่วนตัวที่ไม่มีชุดใดชี้ */
      }
    };
    let created: BatchRec | null = null;
    try {
      created = (await db.dormImportBatch.create({
        data: {
          tenantId: g.tenantId,
          unitId: g.unitId,
          fileHash,
          fileName,
          format: p.format,
          sheet: p.sheet,
          fileId,
          rowCount: p.rows.length,
          columnCount: p.headers.length,
          parsed: json(parsed),
          createdById: g.actorUserId,
        },
        select: BATCH_SELECT,
      })) as BatchRec;
    } catch (e) {
      const c = errCode(e);
      if (c !== "P2002" && c !== "23505") throw e;
    }
    if (!created) {
      await dropOurFile();
      const won = (await db.dormImportBatch.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, fileHash }, select: BATCH_SELECT })) as BatchRec | null;
      return won ? resultOf(won, true) : busy();
    }
    await db.auditLog.create({
      data: { tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action: "dorm.import.uploaded", targetType: "DormImportBatch", targetId: created.id, after: { batchId: created.id, fileHash, rowCount: created.rowCount, columnCount: created.columnCount, format: created.format } },
    });
    return resultOf(created, false);
  } catch {
    return unavailable();
  }
}

// ═════════════════════════ 3.2 guessColumns ═════════════════════════
/**
 * X11 ▸ สิ่งที่ส่งให้ AI = "รูปแบบ" ของค่า (ไม่ใช่ค่าจริง) ทุกคอลัมน์ที่ไม่ใช่ตัวเลขล้วน — PDPA: ไม่มีชื่อ/เบอร์/บัตร/ข้อความจริงออกนอกระบบ
 *   ตัวเลขล้วน (ค่าเช่า · เลขห้อง · มิเตอร์) ส่งได้ · เบอร์/บัตร/วันที่/ข้อความ ⇒ ป้ายรูปแบบ
 */
function patternOf(v: string): string {
  const t = v.trim();
  if (!t) return "";
  if (/^[0-9][0-9,.]{0,9}$/.test(t) && t.replace(/\D/g, "").length <= 7) return t;
  const digits = t.replace(/[\s()+-]/g, "");
  if (/^\d{13}$/.test(digits)) return "เลขบัตร 13 หลัก";
  if (/^\d{8,12}$/.test(digits)) return "เบอร์โทร";
  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(t)) return "วันที่ ว/ด/ป";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return "วันที่ ปปปป-ดด-วว";
  if (/^฿?\s*[\d,]+(\.\d{1,2})?\s*(บาท)?$/.test(t)) return "จำนวนเงิน";
  const words = t.split(/\s+/).length;
  const thai = /[\u0E00-\u0E7F]/.test(t);
  const digit = /\d/.test(t);
  return `${thai ? "ข้อความไทย" : "ข้อความ"} ${words} คำ${digit ? " มีตัวเลข" : ""}`;
}
function anonymizedSamples(p: Parsed): string[][] {
  return p.headers.map((_, ci) => {
    const out: string[] = [];
    for (const r of p.rows) {
      const v = (r[ci] ?? "").trim();
      if (!v) continue;
      out.push(patternOf(v));
      if (out.length >= MAX_SAMPLES) break;
    }
    return out;
  });
}
export async function guessColumns(
  ctx: ImportCtx,
  input: { unitId: string; batchId: string },
  deps?: { guesser?: ImportColumnGuesser | null },
): Promise<{ ok: true; source: "AI" | "HEADER" | "NONE"; mapping: ImportMapping; confidence: Record<string, number>; guessed: number; columns: number } | Fail> {
  try {
    if (!isRec(input)) return notFound();
    const g = await gate(ctx, input.unitId, "import");
    if (!g) return notFound();
    const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
    const b = await readBatch(db, g, input.batchId);
    if (!b) return notFound();
    const p = parsedOf(b);
    const columns = p.headers.length;
    const hg = headerGuess(p.headers);
    let source: "AI" | "HEADER" | "NONE" = "HEADER";
    let mapping: ImportMapping = hg;
    let confidence: Record<string, number> = {};
    const guesser = deps && "guesser" in deps ? (deps.guesser ?? null) : await defaultColumnGuesser({ tenantId: g.tenantId, actorUserId: g.actorUserId });
    let aiOk = false;
    if (guesser) {
      try {
        const fields = IMPORT_FIELDS.map((f) => ({ key: f.key, labelTh: f.labelTh }));
        let timer: ReturnType<typeof setTimeout> | null = null;
        const res = await Promise.race([
          guesser.guess({ headers: headersOf(p), samples: anonymizedSamples(p), fields }),
          new Promise<never>((_, rej) => {
            timer = setTimeout(() => rej(new Error("timeout")), GUESS_TIMEOUT_MS);
          }),
        ]).finally(() => {
          if (timer) clearTimeout(timer);
        });
        const out: ImportMapping = {};
        const conf: Record<string, number> = {};
        const used = new Set<string>();
        for (const x of Array.isArray(res) ? res : []) {
          if (!isRec(x) || !isInt(x.col) || x.col < 0 || x.col >= columns) continue;
          const k = String(x.col);
          if (out[k] !== undefined) continue;
          if (x.field === "IGNORE") out[k] = "IGNORE";
          else if (isImportFieldKey(x.field) && !used.has(x.field)) {
            used.add(x.field);
            out[k] = x.field;
          } else continue;
          conf[k] = typeof x.confidence === "number" && x.confidence >= 0 && x.confidence <= 1 ? x.confidence : 0.5;
        }
        if (Object.keys(out).length) {
          const sorted: ImportMapping = {};
          for (const k of Object.keys(out).sort((a, c) => Number(a) - Number(c))) sorted[k] = out[k];
          mapping = sorted;
          confidence = conf;
          source = "AI";
          aiOk = true;
        }
      } catch {
        aiOk = false;
      }
    }
    if (!aiOk) {
      mapping = hg;
      confidence = Object.fromEntries(Object.keys(hg).map((k) => [k, 1]));
      source = Object.values(hg).some((f) => f !== "IGNORE") ? "HEADER" : "NONE";
    }
    const guessed = Object.values(mapping).filter((f) => f !== "IGNORE").length;
    const proposal = { source, mapping, confidence, guessed, columns };
    // Y2 ▸ CAS: เฉพาะชุดที่ยังแก้ได้ (DRAFT/UNDONE) และไม่ถูกเปลี่ยนระหว่างรอ AI — ไม่ตรง ⇒ BUSY (ไม่เขียนทับข้อเสนอบนชุดที่กำลัง/นำเข้าแล้ว) ◂
    const w = await db.dormImportBatch.updateMany({
      where: { id: b.id, tenantId: g.tenantId, unitId: g.unitId, status: { in: ["DRAFT", "UNDONE"] }, version: b.version },
      data: { proposal: json(proposal), version: { increment: 1 } },
    });
    if (w.count !== 1) return busy();
    return { ok: true, source, mapping, confidence, guessed, columns };
  } catch {
    return unavailable();
  }
}

// ═════════════════════════ 3.3 previewImport ═════════════════════════
type PreviewCtxOk = { b: BatchRec; mapping: ImportMapping; confirmed: boolean; options: NormOptions; decisions: Record<string, NormDecision> };
function proposalMapping(b: BatchRec): ImportMapping | null {
  const pr = isRec(b.proposal) ? b.proposal : null;
  return pr ? mappingOf(pr.mapping, b.columnCount) : null;
}
export async function previewImport(
  ctx: ImportCtx,
  input: { unitId: string; batchId: string; mapping?: ImportMapping; options?: ImportOptions; decisions?: Record<string, ImportDecision[]> },
): Promise<ImportPreviewResult | Fail> {
  try {
    if (!isRec(input)) return notFound();
    const g = await gate(ctx, input.unitId, "import");
    if (!g) return notFound();
    const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
    const today = bkkYmd(new Date());
    for (let attempt = 0; attempt < 2; attempt++) {
      const b = await readBatch(db, g, input.batchId);
      if (!b) return notFound();
      if (b.status === "CREATING" || b.status === "UNDOING") return busy();
      const given = input.mapping !== undefined;
      const mapping = given ? mappingOf(input.mapping, b.columnCount) : (proposalMapping(b) ?? mappingOf(headerGuess(parsedOf(b).headers), b.columnCount));
      if (!mapping) return fail("INVALID_MAPPING", "การจับคู่คอลัมน์ไม่ถูกต้อง — ต้องมีคอลัมน์เลขห้อง และแต่ละช่องในระบบใช้ได้คอลัมน์เดียว");
      const options = optionsOf(input.options ?? b.options, today);
      if (!options) return fail("INVALID_INPUT", "ตัวเลือกการนำเข้าไม่ถูกต้อง (รูปแบบวันที่ · วันจดมิเตอร์ต้องไม่เกินวันนี้ · ช่องทางรับเงิน)");
      const decisions = decisionsOf(input.decisions !== undefined ? input.decisions : given ? undefined : b.decisions, b.rowCount);
      if (!decisions) return fail("INVALID_INPUT", "การตัดสินรายแถวไม่ถูกต้อง");
      const ok: PreviewCtxOk = { b, mapping, confirmed: given, options, decisions };
      const st = await settingsOf(g.tenantId, g.unitId);
      const contractBad = await leaseContractNameProblems(g.tenantId, g.unitId, candidateNames(parsedOf(b), [mapping], [decisions]));
      const out = await computePlan(db, { tenantId: g.tenantId, unitId: g.unitId, batchId: b.id, fileHash: b.fileHash, parsed: parsedOf(b), mapping, options, decisions, settings: st, today, contractBad });
      const upd = await db.dormImportBatch.updateMany({
        where: { id: b.id, tenantId: g.tenantId, unitId: g.unitId, status: { in: ["DRAFT", "CREATED", "UNDONE"] }, version: b.version },
        data: {
          mapping: json(ok.mapping),
          mappingConfirmedById: ok.confirmed ? g.actorUserId : null,
          options: json(ok.options),
          decisions: json(decisionsRaw(ok.decisions)),
          summary: json({
            summary: out.summary,
            issues: out.issues,
            plan: out.plan,
            rows: out.rows,
            previews: [
              ...previewsOf(b).filter((x) => x.hash !== out.hash),
              { hash: out.hash, mapping: ok.mapping, options: ok.options, decisions: decisionsRaw(ok.decisions), confirmedById: ok.confirmed ? g.actorUserId : null },
            ].slice(-MAX_PREVIEWS),
          }),
          previewHash: out.hash,
          version: { increment: 1 },
        },
      });
      if (upd.count !== 1) continue;
      return { ok: true, status: statusOf(b.status), confirmed: ok.confirmed, previewHash: out.hash, mapping, summary: out.summary, issues: out.issues, plan: out.plan, rows: out.rows };
    }
    return busy();
  } catch {
    return unavailable();
  }
}

// ═════════════════════════ 3.4 createImport ═════════════════════════
type ManifestRow = {
  rowNo: number;
  room: string;
  roomId: string | null;
  roomCreated: boolean;
  roomRevived: boolean;
  roomTypeIds: string[];
  buildingIds: string[];
  leaseId?: string;
  partyId?: string;
  partyCreated?: boolean;
  receiptKey?: string | null;
  depositSatang: number;
  meterIds: string[];
  readingIds: string[];
  status: "STARTED" | "DONE" | "FAILED";
};
type Manifest = {
  plan: ImportPlan;
  work: RowWork[];
  rows: Record<string, ManifestRow>;
  options: NormOptions;
  legalAck: string | null;
  undone?: ImportUndone;
  /** ความคืบหน้าการย้อนต่อสัญญา (X14) */
  undoProgress?: Record<string, { reversed: boolean; satang: number }>;
};
function manifestOf(b: { manifest: Prisma.JsonValue }): Manifest | null {
  const m = isRec(b.manifest) ? b.manifest : null;
  if (!m || !isRec(m.plan) || !Array.isArray(m.work) || !isRec(m.rows)) return null;
  return m as unknown as Manifest;
}
const blankRow = (w: RowWork): ManifestRow => ({ rowNo: w.rowNo, room: w.room, roomId: null, roomCreated: false, roomRevived: false, roomTypeIds: [], buildingIds: [], depositSatang: 0, meterIds: [], readingIds: [], status: "STARTED" });

/** ตรวจ claim ใต้ล็อก (คำสั่งแรกหลังล็อก) — ไม่ใช่ของเรา ⇒ Abort BUSY · คืนแถวชุดปัจจุบัน */
async function holdClaim(tx: Tx, g: Gate, batchId: string, token: string, status: "CREATING" | "UNDOING"): Promise<BatchRec> {
  const b = await readBatch(tx, g, batchId);
  if (!b || b.status !== status || b.claimToken !== token) throw new Abort(busy());
  return b;
}
async function saveManifest(tx: Tx, g: Gate, b: BatchRec, token: string, m: Manifest): Promise<void> {
  const r = await tx.dormImportBatch.updateMany({
    where: { id: b.id, tenantId: g.tenantId, unitId: g.unitId, claimToken: token, version: b.version },
    data: { manifest: json(m), claimUntil: new Date(Date.now() + CLAIM_MS), version: { increment: 1 } },
  });
  if (r.count !== 1) throw new Abort(busy());
}

export async function createImport(
  ctx: ImportCtx,
  input: { unitId: string; batchId: string; previewHash: string; legalAck?: { reason: string } | null; skipRows?: number[] },
): Promise<{ ok: true; status: "CREATED"; duplicate: boolean; created: ImportPlan } | (Fail & Record<string, unknown>)> {
  try {
    if (!isRec(input)) return notFound();
    const g = await gate(ctx, input.unitId, "manage");
    if (!g) return notFound();
    const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
    const pre = await readBatch(db, g, input.batchId);
    if (!pre) return notFound();
    const dupOf = (b: BatchRec) => ({ ok: true as const, status: "CREATED" as const, duplicate: true, created: manifestOf(b)?.plan ?? storedPreview(b)?.plan ?? emptyPlan() });
    if (pre.status === "CREATED") return dupOf(pre);
    if (pre.status === "UNDOING") return busy();
    if (pre.status === "CREATING" && claimAlive(pre)) return busy();
    const resume = pre.status === "CREATING";
    const ackReason = isRec(input.legalAck) && typeof input.legalAck.reason === "string" ? input.legalAck.reason.trim() : null;
    const st = resume ? null : await settingsOf(g.tenantId, g.unitId); // อ่านก่อนจับล็อก (ค่าตั้งอ่านผ่าน connection ของตัวเอง — ห้ามระหว่างถือ tx)
    // X12 ▸ ตัวตรวจข้อความสัญญา (อ่านแม่แบบผ่าน connection ของตัวเอง) — คิดก่อนเปิด tx จากทุกพรีวิวที่เก็บไว้
    const contractBad = resume
      ? new Set<string>()
      : await leaseContractNameProblems(
          g.tenantId,
          g.unitId,
          candidateNames(
            parsedOf(pre),
            [mappingOf(pre.mapping, pre.columnCount), ...previewsOf(pre).map((x) => mappingOf(x.mapping, pre.columnCount))],
            [decisionsOf(pre.decisions, pre.rowCount), ...previewsOf(pre).map((x) => decisionsOf(x.decisions, pre.rowCount))],
          ),
        );
    const today = bkkYmd(new Date());
    const token = newToken();

    // ── tx A: ล็อกหน่วย (ไม่รอ) → อ่านชุดใหม่ → (คิดแผนใหม่ · เทียบ hash · ต้องแก้ · ทางเตือนกฎหมาย) → CAS เป็น CREATING ──
    const a = await importTx(g.tenantId, g.unitId, async (tx) => {
      if (!(await lockTry(tx, importLockKey(g.unitId)))) throw new Abort(busy());
      const b = await readBatch(tx, g, input.batchId);
      if (!b) throw new Abort(notFound());
      if (b.status === "CREATED") return { dup: dupOf(b) };
      if (b.status === "UNDOING" || (b.status === "CREATING" && claimAlive(b))) throw new Abort(busy());
      const other = await tx.dormImportBatch.count({ where: { tenantId: g.tenantId, unitId: g.unitId, status: { in: ["CREATING", "UNDOING"] }, NOT: { id: b.id } } });
      if (other > 0) throw new Abort(busy());
      if (b.status === "CREATING") {
        const m = manifestOf(b);
        if (!m) throw new Abort(busy());
        // X8 ▸ ทำต่อหลัง PARTIAL: ข้ามแถวที่ผู้ใช้เลือก (เช่น ห้องถูกจองระหว่างนำเข้า) — เฉพาะแถวที่ยังไม่เสร็จ
        const skip = new Set(Array.isArray(input.skipRows) ? input.skipRows.filter((x) => isInt(x)) : []);
        if (skip.size) for (const w of m.work) if (skip.has(w.rowNo) && m.rows[String(w.rowNo)]?.status !== "DONE") w.action = "SKIPPED";
        const r = await tx.dormImportBatch.updateMany({
          where: { id: b.id, tenantId: g.tenantId, unitId: g.unitId, status: "CREATING", version: b.version },
          data: { claimToken: token, claimUntil: new Date(Date.now() + CLAIM_MS), lastError: json(null), manifest: json(m), version: { increment: 1 } },
        });
        if (r.count !== 1) throw new Abort(busy());
        return { manifest: m };
      }
      if (b.status !== "DRAFT" && b.status !== "UNDONE") throw new Abort(busy());
      if (!st) throw new Abort(busy());
      const notConfirmed = () => new Abort(fail("NOT_CONFIRMED", "ยังไม่ได้ยืนยันการจับคู่คอลัมน์ — ตรวจคอลัมน์แล้วกด \"ตรวจ\" ก่อนนำเข้า"));
      const stale = (hash: string | null) => new Abort({ ...fail("STALE_PREVIEW", "ข้อมูลหรือค่าตั้งเปลี่ยนไปหลังพรีวิว — ตรวจอีกครั้งแล้วค่อยนำเข้า"), ...(hash ? { previewHash: hash } : {}) });
      const planOf = async (st0: { mapping: unknown; options: unknown; decisions: unknown }) => {
        const mapping = mappingOf(st0.mapping, b.columnCount);
        const options = optionsOf(st0.options, today);
        const decisions = decisionsOf(st0.decisions, b.rowCount);
        if (!mapping || !options || !decisions) return null;
        return { options, out: await computePlan(tx, { tenantId: g.tenantId, unitId: g.unitId, batchId: b.id, fileHash: b.fileHash, parsed: parsedOf(b), mapping, options, decisions, settings: st, today, contractBad }), mapping, decisions };
      };
      // สถานะของพรีวิวที่ผู้ใช้เห็น (hash ตรง) — ไม่พบ ⇒ STALE_PREVIEW พร้อม hash ของสถานะล่าสุด
      const entry = isStr(input.previewHash) ? previewsOf(b).find((x) => x.hash === input.previewHash) : undefined;
      if (!entry) {
        if (!b.mappingConfirmedById) throw notConfirmed();
        const latest = await planOf({ mapping: b.mapping, options: b.options, decisions: b.decisions });
        throw stale(latest?.out.hash ?? null);
      }
      if (!entry.confirmedById) throw notConfirmed();
      const pl = await planOf(entry);
      if (!pl) throw stale(null);
      const { out, options } = pl;
      if (out.hash !== input.previewHash) throw stale(out.hash);
      if (out.summary.mustFix > 0) throw new Abort({ ...fail("MUST_FIX_REMAINING", `ยังมี ${out.summary.mustFix} แถวที่ต้องแก้ — แก้ในไฟล์ ตัดสินรายแถว หรือข้ามแถว`), mustFix: out.summary.mustFix });
      if (out.legalWarnRows > 0 && (g.role !== "OWNER" || !ackReason || !isValidOutOfScopeReason(ackReason)))
        throw new Abort(fail("NEEDS_OWNER", "มีแถวที่เงินประกันเกินคำแนะนำตามกฎหมาย (โหมดเตือน) — เจ้าของร้านต้องนำเข้าเองพร้อมระบุเหตุผลอย่างน้อย 10 ตัวอักษร"));
      const m: Manifest = { plan: out.plan, work: out.work, rows: {}, options, legalAck: out.legalWarnRows > 0 ? ackReason : null };
      const r = await tx.dormImportBatch.updateMany({
        where: { id: b.id, tenantId: g.tenantId, unitId: g.unitId, status: { in: ["DRAFT", "UNDONE"] }, version: b.version },
        data: {
          status: "CREATING",
          claimToken: token,
          claimUntil: new Date(Date.now() + CLAIM_MS),
          manifest: json(m),
          mapping: json(pl.mapping),
          options: json(options),
          decisions: json(decisionsRaw(pl.decisions)),
          mappingConfirmedById: entry.confirmedById,
          previewHash: out.hash,
          lastError: json(null),
          committedAt: null,
          undoneAt: null,
          undoneById: null,
          undoReason: null,
          version: { increment: 1 },
        },
      });
      if (r.count !== 1) throw new Abort(busy());
      return { manifest: m };
    });
    if (isFail(a)) {
      if (a.code === "BUSY") {
        const now = await readBatch(db, g, input.batchId);
        if (now?.status === "CREATED") return dupOf(now);
      }
      return a;
    }
    if ("dup" in a && a.dup) return a.dup;
    if (!("manifest" in a) || !a.manifest) return busy();
    try {
      return await runRows(g, input.batchId, token, a.manifest);
    } catch (e) {
      // X20 ▸ ล้มแบบไม่คาดหมายกลางงาน: ปล่อย claim + จด lastError · บอกตามจริงว่าบางแถวอาจนำเข้าแล้ว (เรียกซ้ำ = ทำต่อ ไม่สร้างซ้ำ)
      await releaseClaim(g, input.batchId, token, "CREATING", e);
      return fail("UNAVAILABLE", "ระบบขัดข้องระหว่างนำเข้า — บางแถวอาจนำเข้าแล้ว กดนำเข้าอีกครั้งเพื่อทำต่อจากแถวที่ค้าง (ไม่สร้างซ้ำ)");
    }
  } catch {
    return unavailable();
  }
}
async function releaseClaim(g: Gate, batchId: string, token: string, status: "CREATING" | "UNDOING", e: unknown): Promise<void> {
  try {
    await importTx(g.tenantId, g.unitId, async (tx) => {
      await lockWait(tx, importLockKey(g.unitId));
      await tx.dormImportBatch.updateMany({
        where: { id: batchId, tenantId: g.tenantId, unitId: g.unitId, status, claimToken: token },
        data: { claimToken: null, claimUntil: null, lastError: json({ code: "ERROR", detail: e instanceof Error ? e.name : "error", at: new Date().toISOString() }), version: { increment: 1 } },
      });
    });
  } catch {
    /* claim หมดอายุเองภายใน 2 นาที */
  }
}
const emptyPlan = (): ImportPlan => ({ buildings: 0, floors: 0, rooms: 0, roomTypes: 0, leases: 0, parties: 0, meters: 0, readings: 0, depositSatang: 0, arrears: { count: 0, satang: 0 }, existing: { rooms: 0, leases: 0, meters: 0 }, skippedRows: 0 });

type RowFail = { rowNo: number; code: string };
async function runRows(g: Gate, batchId: string, token: string, start: Manifest): Promise<{ ok: true; status: "CREATED"; duplicate: boolean; created: ImportPlan } | (Fail & Record<string, unknown>)> {
  const ctx: ImportCtx = { tenantId: g.tenantId, actorUserId: g.actorUserId };
  const guard = { batchId, claimToken: token };
  const opts = start.options;
  const readAt = `${opts.meterReadDate}T12:00:00+07:00`;
  const periodKey = opts.meterReadDate.slice(0, 7);
  let done = Object.values(start.rows).filter((r) => r.status === "DONE").length;
  const floorsOf = new Map<string, number>();
  for (const w of start.work) if (w.building && !w.building.id) floorsOf.set(w.building.name, Math.max(floorsOf.get(w.building.name) ?? 1, w.floorNo));

  const failRow = async (f: RowFail): Promise<Fail & Record<string, unknown>> => {
    await importTx(g.tenantId, g.unitId, async (tx) => {
      await lockWait(tx, importLockKey(g.unitId));
      await tx.dormImportBatch.updateMany({
        where: { id: batchId, tenantId: g.tenantId, unitId: g.unitId, status: "CREATING", claimToken: token },
        data: { lastError: json({ rowNo: f.rowNo, code: f.code, at: new Date().toISOString() }), claimToken: null, claimUntil: null, version: { increment: 1 } },
      });
    });
    if (f.code === "BUSY") return busy();
    return { ...fail("PARTIAL", `นำเข้าได้ ${done} แถว แล้วหยุดที่แถว ${f.rowNo} — แก้สาเหตุแล้วกดนำเข้าอีกครั้งเพื่อทำต่อจากแถวนั้น (ไม่สร้างซ้ำ)`), done, failedRowNo: f.rowNo, failedCode: f.code };
  };

  for (const w of start.work) {
    if (w.action === "SKIPPED" || w.action === "BLOCKED") continue;
    const key = String(w.rowNo);
    // ── tx R1: ล็อก + claim → อาคาร/ประเภท/ห้อง (ยังไม่มี) + จด manifest ของแถวใน tx เดียวกัน ──
    const r1 = await importTx(g.tenantId, g.unitId, async (tx) => {
      await lockWait(tx, importLockKey(g.unitId));
      const b = await holdClaim(tx, g, batchId, token, "CREATING");
      const m = manifestOf(b);
      if (!m) throw new Abort(busy());
      const cur = m.rows[key] ?? blankRow(w);
      if (cur.status === "DONE") return { row: cur, skip: true };
      if (!cur.roomId) {
        const T = { tenantId: g.tenantId, unitId: g.unitId };
        const found = await tx.hotelRoom.findFirst({ where: { ...T, number: ciEquals(w.room) }, select: { id: true, active: true, roomTypeId: true, buildingId: true }, orderBy: [{ active: "desc" }, { createdAt: "asc" }] });
        if (found?.active) cur.roomId = found.id;
        else if (found) {
          // ห้องที่ชุดย้อนไปแล้วเคยสร้าง (แผนบอก REVIVE) ⇒ ปลุก · ประเภทที่ถูกปิดตามไปด้วย ⇒ เปิดคืน
          if (!(w.roomRes?.kind === "REVIVE" && w.roomRes.roomId === found.id)) throw new Abort(fail("ROOM_INACTIVE", "ห้องถูกปิดใช้งานระหว่างนำเข้า"));
          await tx.hotelRoom.updateMany({ where: { ...T, id: found.id }, data: { active: true } });
          const ty = await tx.hotelRoomType.updateMany({ where: { ...T, id: found.roomTypeId, active: false }, data: { active: true } });
          if (ty.count) cur.roomTypeIds.push(found.roomTypeId);
          // X16 ▸ อาคารที่ถูกลบตอนย้อน (ห้องหลุดอาคาร) ⇒ ผูกอาคารตามแผนคืน (มีชื่อเดิม ⇒ ใช้ · ไม่มี ⇒ สร้าง)
          if (!found.buildingId && w.building) {
            let bid = w.building.id && (await tx.roomBuilding.findFirst({ where: { ...T, id: w.building.id }, select: { id: true } })) ? w.building.id : null;
            if (!bid) bid = (await tx.roomBuilding.findFirst({ where: { ...T, name: w.building.name }, select: { id: true } }))?.id ?? null;
            if (!bid) {
              const n = await tx.roomBuilding.count({ where: T });
              bid = (await tx.roomBuilding.create({ data: { ...T, name: w.building.name, floors: floorsOf.get(w.building.name) ?? w.floorNo, sortOrder: n + 1 }, select: { id: true } })).id;
              cur.buildingIds.push(bid);
            }
            await tx.hotelRoom.updateMany({ where: { ...T, id: found.id }, data: { buildingId: bid } });
          }
          cur.roomId = found.id;
          cur.roomRevived = true;
        } else {
          if (!w.type || !w.building) throw new Abort(fail("ROOM_INVALID", "ข้อมูลห้องไม่ครบ"));
          let buildingId = w.building.id;
          if (!buildingId) {
            const hb = await tx.roomBuilding.findFirst({ where: { ...T, name: w.building.name }, select: { id: true } });
            if (hb) buildingId = hb.id;
            else {
              const n = await tx.roomBuilding.count({ where: T });
              buildingId = (await tx.roomBuilding.create({ data: { ...T, name: w.building.name, floors: floorsOf.get(w.building.name) ?? w.floorNo, sortOrder: n + 1 }, select: { id: true } })).id;
              cur.buildingIds.push(buildingId);
            }
          }
          let typeId = w.type.id;
          if (!typeId) {
            const ht = await tx.hotelRoomType.findFirst({ where: { ...T, name: w.type.name }, select: { id: true, active: true } });
            if (ht) {
              typeId = ht.id;
              if (!ht.active) {
                await tx.hotelRoomType.updateMany({ where: { ...T, id: ht.id }, data: { active: true } });
                cur.roomTypeIds.push(ht.id);
              }
            } else {
              typeId = (
                await tx.hotelRoomType.create({
                  data: { ...T, name: w.type.name, capacity: 2, baseRateSatang: 0, depositSatang: 0, rentMode: "MONTHLY", monthlyRateSatang: w.type.rate },
                  select: { id: true },
                })
              ).id;
              cur.roomTypeIds.push(typeId);
            }
          }
          const room = await tx.hotelRoom.create({
            data: { ...T, roomTypeId: typeId, number: w.room, floor: String(w.floorNo), floorNo: w.floorNo, buildingId, note: w.note },
            select: { id: true },
          });
          cur.roomId = room.id;
          cur.roomCreated = true;
        }
      }
      m.rows[key] = cur;
      await saveManifest(tx, g, b, token, m);
      return { row: cur, skip: false };
    });
    if (isFail(r1)) return failRow({ rowNo: w.rowNo, code: r1.code });
    if (r1.skip) continue;
    const row = r1.row;
    const roomId = row.roomId as string;

    // ── สัญญา + เงินประกันยกมา (D.5 · ทีละแถว) ──
    if (w.action === "CREATE" && w.tenant && !row.leaseId) {
      const t = w.tenant;
      const mark = { importBatchId: batchId, rowNo: w.rowNo, claimToken: token };
      const mergedParty = t.party.kind === "MERGE" ? (t.party.partyId ?? start.rows[String(t.party.rowNo)]?.partyId ?? (await partyOfRow(g, batchId, t.party.rowNo))) : null;
      const tenant =
        t.party.kind === "CONFIRMED"
          ? { name: t.name, phone: t.phone, idCardNo: t.idCard, confirmPartyId: t.party.partyId }
          : mergedParty
            ? { partyId: mergedParty }
            : t.party.kind === "NEW_FORCED"
              ? { name: t.name, phone: t.phone, idCardNo: t.idCard, createNewParty: true }
              : { name: t.name, phone: t.phone, idCardNo: t.idCard };
      const c = await createLease(
        ctx,
        { unitId: g.unitId, roomId, startDate: t.start, months: t.months, tenant, rentSatang: t.rent, depositSatang: t.deposit, advanceRentSatang: t.advance, bookingFeeSatang: 0, legalAck: t.legalWarn && start.legalAck ? { reason: start.legalAck } : null },
        mark,
      );
      let leaseId: string | null = null;
      let partyId: string | null = null;
      let partyCreated = false;
      if (c.ok) {
        leaseId = c.leaseId;
        partyId = c.partyId;
        partyCreated = c.partyCreated;
      } else if (c.code === "ROOM_TAKEN") {
        // ทำต่อหลังล้ม: สัญญาค้างของชุดนี้บนห้องนี้ ⇒ รับเป็นของเรา (ไม่สร้างซ้ำ)
        const own = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).dormLease.findFirst({
          where: { tenantId: g.tenantId, unitId: g.unitId, roomId, status: { in: LIVE_LEASE }, policySnapshot: { path: ["import", "batchId"], equals: batchId } },
          select: { id: true, partyId: true },
        });
        if (!own) return failRow({ rowNo: w.rowNo, code: "ROOM_TAKEN" });
        leaseId = own.id;
        partyId = own.partyId;
      } else return failRow({ rowNo: w.rowNo, code: c.code });
      const mv = await moveIn(ctx, { unitId: g.unitId, leaseId, paidAt: new Date(), channel: opts.depositChannel, financeAccountId: opts.financeAccountId }, mark);
      if (!mv.ok) return failRow({ rowNo: w.rowNo, code: mv.code });
      row.leaseId = leaseId;
      row.partyId = partyId ?? undefined;
      row.partyCreated = partyCreated;
      row.receiptKey = t.deposit > 0 ? `dorm.lease:${leaseId}:deposit` : null;
      row.depositSatang = t.deposit;
    }

    // ── มิเตอร์ + เลขล่าสุด (D.6 · source IMPORT) ──
    const mdb = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
    for (const mw of w.meters) {
      let meterId: string | null = null;
      let ours = false;
      const cur = await mdb.dormMeter.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, roomId, kind: mw.kind, removedAt: null }, select: { id: true, note: true } });
      if (cur) {
        meterId = cur.id;
        ours = row.meterIds.includes(cur.id) || cur.note === `import:${batchId}`;
      } else {
        const cm = await createMeter(ctx, { unitId: g.unitId, kind: mw.kind, roomId, startReading: mw.value, note: `import:${batchId}` }, guard);
        if (!cm.ok && cm.code === "BUSY") return failRow({ rowNo: w.rowNo, code: "BUSY" });
        if (cm.ok) {
          meterId = cm.meterId;
          ours = true;
        } else {
          const again = await mdb.dormMeter.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, roomId, kind: mw.kind, removedAt: null }, select: { id: true, note: true } });
          if (!again) return failRow({ rowNo: w.rowNo, code: cm.code });
          meterId = again.id;
          ours = again.note === `import:${batchId}`;
        }
      }
      if (ours && !row.meterIds.includes(meterId)) row.meterIds.push(meterId);
      const have = await mdb.dormMeterReading.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, meterId, periodKey, kind: "PERIOD" }, select: { id: true, source: true } });
      if (have) {
        if (ours && have.source === "IMPORT" && !row.readingIds.includes(have.id)) row.readingIds.push(have.id);
        continue;
      }
      if (!ours && !mw.write) continue;
      const sr = await submitReadings(ctx, { unitId: g.unitId, periodKey, items: [{ meterId, value: mw.value, readAt }] }, { source: "IMPORT", ifAbsent: true, importGuard: guard });
      if (!sr.ok) return failRow({ rowNo: w.rowNo, code: sr.code });
      const it = sr.results[0];
      if (it?.code === "BUSY") return failRow({ rowNo: w.rowNo, code: "BUSY" });
      if (it?.status === "CONFLICT") continue; // X10 ▸ มีเลขงวดนี้ในระบบแล้ว (ค่าอื่น) ⇒ คงค่าในระบบ ไม่ทับ
      if (!it || it.status === "REJECTED" || it.status === "LOCKED") return failRow({ rowNo: w.rowNo, code: it?.code ?? "METER_REJECTED" });
      if (it.status === "CREATED" && it.readingId && !row.readingIds.includes(it.readingId)) row.readingIds.push(it.readingId);
    }

    // ── tx R2: ล็อก + claim → จด manifest ของแถว (DONE) ──
    const r2 = await importTx(g.tenantId, g.unitId, async (tx) => {
      await lockWait(tx, importLockKey(g.unitId));
      const b = await holdClaim(tx, g, batchId, token, "CREATING");
      const m = manifestOf(b);
      if (!m) throw new Abort(busy());
      m.rows[key] = { ...row, status: "DONE" };
      await saveManifest(tx, g, b, token, m);
      return true;
    });
    if (isFail(r2)) return failRow({ rowNo: w.rowNo, code: r2.code });
    start.rows[key] = { ...row, status: "DONE" };
    done++;
  }

  // ── ปิดงาน: CAS CREATING → CREATED + audit ──
  const fin = await importTx(g.tenantId, g.unitId, async (tx) => {
    await lockWait(tx, importLockKey(g.unitId));
    const b = await holdClaim(tx, g, batchId, token, "CREATING");
    const m = manifestOf(b);
    if (!m) throw new Abort(busy());
    const r = await tx.dormImportBatch.updateMany({
      where: { id: b.id, tenantId: g.tenantId, unitId: g.unitId, status: "CREATING", claimToken: token, version: b.version },
      data: { status: "CREATED", committedAt: new Date(), claimToken: null, claimUntil: null, lastError: json(null), version: { increment: 1 } },
    });
    if (r.count !== 1) throw new Abort(busy());
    const p = m.plan;
    await tx.auditLog.create({
      data: {
        tenantId: g.tenantId,
        unitId: g.unitId,
        actorType: "USER",
        actorId: g.actorUserId,
        action: "dorm.import.created",
        targetType: "DormImportBatch",
        targetId: b.id,
        after: { batchId: b.id, rooms: p.rooms, roomTypes: p.roomTypes, buildings: p.buildings, leases: p.leases, parties: p.parties, meters: p.meters, readings: p.readings, depositSatang: p.depositSatang, legalAck: m.legalAck ? true : false },
      },
    });
    return p;
  });
  if (isFail(fin)) return fin.code === "BUSY" ? busy() : fin;
  return { ok: true, status: "CREATED", duplicate: false, created: fin };
}
async function partyOfRow(g: Gate, batchId: string, rowNo: number): Promise<string | null> {
  const b = await readBatch(tenantDb({ tenantId: g.tenantId, unitId: g.unitId }), g, batchId);
  const m = b ? manifestOf(b) : null;
  return m?.rows[String(rowNo)]?.partyId ?? null;
}

// ═════════════════════════ 3.5 undoImport ═════════════════════════
function undoDeadline(committedAt: Date, undoDays: number): Date {
  return endOfBkkDay(addDaysYmd(bkkYmd(committedAt), undoDays));
}
export async function undoImport(
  ctx: ImportCtx,
  input: { unitId: string; batchId: string; reason: string },
  deps?: { now?: Date },
): Promise<{ ok: true; status: "UNDONE"; duplicate: boolean; undone: ImportUndone } | (Fail & Record<string, unknown>)> {
  try {
    if (!isRec(input)) return notFound();
    const g = await gate(ctx, input.unitId, "manage");
    if (!g) return notFound();
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if ([...reason].length < 3) return fail("INVALID_INPUT", "ระบุเหตุผลที่ย้อนกลับการนำเข้า (อย่างน้อย 3 ตัวอักษร)");
    const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
    const pre = await readBatch(db, g, input.batchId);
    if (!pre) return notFound();
    const zero: ImportUndone = { leases: 0, depositReversals: 0, reversedSatang: 0, rooms: 0, roomTypes: 0, buildings: 0, meters: 0, readings: 0 };
    const dupOf = (b: BatchRec) => ({ ok: true as const, status: "UNDONE" as const, duplicate: true, undone: manifestOf(b)?.undone ?? zero });
    if (pre.status === "UNDONE") return dupOf(pre);
    if (pre.status === "DRAFT") return fail("NOT_CREATED", "ชุดนี้ยังไม่ได้นำเข้า — ไม่มีอะไรให้ย้อนกลับ");
    if ((pre.status === "CREATING" || pre.status === "UNDOING") && claimAlive(pre)) return busy();
    const now = deps?.now instanceof Date && !Number.isNaN(deps.now.getTime()) ? deps.now : new Date();
    const st = await settingsOf(g.tenantId, g.unitId);
    if (pre.status === "CREATED" && pre.committedAt && now.getTime() > undoDeadline(pre.committedAt, st.undoDays).getTime())
      return fail("UNDO_EXPIRED", st.undoDays === 0 ? "ย้อนกลับได้ภายในวันที่นำเข้าเท่านั้น — เลยกำหนดแล้ว" : `ย้อนกลับได้ภายใน ${st.undoDays} วันหลังวันที่นำเข้า — เลยกำหนดแล้ว`);
    const token = newToken();

    // ── tx U0 (tx เงินหอ · connection เดียว): ล็อกหน่วย (ไม่รอ) → ตรวจตัวกั้นทุกแถว → CAS เป็น UNDOING ──
    const u0 = await moneyTx(async (tx) => {
      if (!(await lockTry(tx, importLockKey(g.unitId)))) throw new Abort(busy());
      const b = await readBatch(tx, g, input.batchId);
      if (!b) throw new Abort(notFound());
      if (b.status === "UNDONE") return { dup: dupOf(b) };
      if (b.status === "DRAFT") throw new Abort(fail("NOT_CREATED", "ชุดนี้ยังไม่ได้นำเข้า — ไม่มีอะไรให้ย้อนกลับ"));
      if ((b.status === "CREATING" || b.status === "UNDOING") && claimAlive(b)) throw new Abort(busy());
      const m = manifestOf(b) ?? { plan: emptyPlan(), work: [], rows: {}, options: optionsOf(null, bkkYmd(now)) as NormOptions, legalAck: null };
      if (b.status !== "UNDOING") {
        const blockers = await undoBlockers(tx, g, b.id, m);
        if (blockers.length) throw new Abort({ ...fail("UNDO_BLOCKED", "ย้อนกลับไม่ได้ — มีรายการที่เกิดหลังนำเข้า (บิล · ย้ายออก · เงินประกัน · เลขมิเตอร์ · ห้องถูกใช้) ดูรายการที่ติด"), blockers });
      }
      const r = await tx.dormImportBatch.updateMany({
        where: { id: b.id, tenantId: g.tenantId, unitId: g.unitId, status: { in: ["CREATED", "CREATING", "UNDOING"] }, version: b.version },
        data: { status: "UNDOING", claimToken: token, claimUntil: new Date(Date.now() + CLAIM_MS), version: { increment: 1 } },
      });
      if (r.count !== 1) throw new Abort(busy());
      return { manifest: m };
    });
    if (isFail(u0)) {
      if (u0.code === "BUSY") {
        const nowB = await readBatch(db, g, input.batchId);
        if (nowB?.status === "UNDONE") return dupOf(nowB);
      }
      return u0;
    }
    if ("dup" in u0 && u0.dup) return u0.dup;
    if (!("manifest" in u0) || !u0.manifest) return busy();
    const m = u0.manifest;

    // ── ต่อสัญญา (ทีละสัญญา · tx เดียวต่อสัญญา): ล็อกหน่วย+claim → ล็อกสัญญา → แถว Tenant → แถวสัญญา (FOR UPDATE) → ตัวกั้นซ้ำใต้ล็อก
    //    → กลับรายการรับประกัน → CANCELLED → ปล่อยห้อง → จดความคืบหน้าใน manifest (ลำดับล็อก §2.8 · X13) ──
    const own0 = await moneyTx((tx) => ownership(tx, g, pre.id, m));
    if (isFail(own0)) return own0;
    const endReason = `IMPORT_UNDONE:${pre.id}`;
    for (const t of own0.leases) {
      let r: { reversed: boolean; satang: number } | Fail & Record<string, unknown>;
      try {
        r = await moneyTx(async (tx) => {
          await lockWait(tx, importLockKey(g.unitId));
          const bb = await holdClaim(tx, g, pre.id, token, "UNDOING");
          await lockWait(tx, `dorm.lease:${t.leaseId}`);
          await tx.tenant.updateMany({ where: { id: g.tenantId }, data: { updatedAt: new Date() } });
          await tx.$queryRaw`SELECT "id" FROM "DormLease" WHERE "id" = ${t.leaseId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} FOR UPDATE`;
          const l = await tx.dormLease.findFirst({ where: { id: t.leaseId, tenantId: g.tenantId, unitId: g.unitId }, select: { id: true, status: true, endReason: true, occupancyId: true, depositSatang: true } });
          if (!l || (l.status === "CANCELLED" && l.endReason === endReason)) return { reversed: false, satang: 0 };
          const blk = (code: UndoBlocker["code"]): never => {
            throw new Abort({ ...fail("UNDO_BLOCKED", "ย้อนกลับไม่ได้ — มีรายการที่เกิดหลังนำเข้า ดูรายการที่ติด"), blockers: [{ code, room: safeEcho(t.room, 20), leaseId: t.leaseId }] });
          };
          if (l.status !== "ACTIVE" && l.status !== "DRAFT") blk("LEASE_CHANGED");
          if ((await tx.dormBill.count({ where: { tenantId: g.tenantId, unitId: g.unitId, leaseId: l.id } })) > 0) blk("BILL_EXISTS");
          if ((await tx.dormMoveOut.count({ where: { tenantId: g.tenantId, unitId: g.unitId, leaseId: l.id } })) > 0) blk("MOVEOUT_EXISTS");
          // X1 ▸ ยอดถือต้องเท่าที่นำเข้าพอดี (ACTIVE = ประกันในสัญญา · DRAFT = 0) — ปิดประกัน/รับเพิ่มไปแล้ว ⇒ DEPOSIT_MOVED (ไม่ข้ามเงียบ)
          const held = await securityDepositHeldInTx(tx, { tenantId: g.tenantId, unitId: g.unitId, leaseId: l.id });
          const expect = l.status === "ACTIVE" ? l.depositSatang : 0;
          if (held !== expect) blk("DEPOSIT_MOVED");
          let reversed = false;
          if (held > 0) {
            const rv = await reverseSecurityDepositReceiptInTx(tx, {
              tenantId: g.tenantId,
              unitId: g.unitId,
              leaseId: l.id,
              receiptKey: t.receiptKey ?? `dorm.lease:${l.id}:deposit`,
              reason: `ย้อนกลับการนำเข้า: ${reason}`,
              createdById: g.actorUserId,
            });
            if (!rv.ok) {
              if (rv.code === "DEPOSIT_SETTLED" || rv.code === "NOT_FOUND") blk("DEPOSIT_MOVED");
              throw new Abort(fail(rv.code, rv.reason));
            }
            if (rv.heldSatang !== 0) blk("DEPOSIT_MOVED");
            reversed = true;
          }
          const upd = await tx.dormLease.updateMany({ where: { id: l.id, tenantId: g.tenantId, unitId: g.unitId, status: { in: ["ACTIVE", "DRAFT"] } }, data: { status: "CANCELLED", endReason, endedAt: new Date() } });
          if (upd.count !== 1) blk("LEASE_CHANGED");
          if (l.occupancyId) {
            const rel = await releaseOccupancy(tx, { tenantId: g.tenantId, unitId: g.unitId, occupancyId: l.occupancyId, reason: "dorm.import.undone" });
            if (!rel.ok && rel.code !== "NOT_FOUND") throw new Error("ปล่อยห้องไม่สำเร็จ");
          }
          await tx.auditLog.create({
            data: { tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action: "dorm.lease.import_undone", targetType: "DormLease", targetId: l.id, after: { batchId: pre.id, reversedSatang: reversed ? held : 0 } },
          });
          // ความคืบหน้า (ตัวเลข undone นับเฉพาะที่ทำจริง · รวมสัญญากำพร้า — X14)
          const mm = manifestOf(bb) ?? m;
          mm.undoProgress = { ...(mm.undoProgress ?? {}), [l.id]: { reversed, satang: reversed ? held : 0 } };
          await saveManifest(tx, g, bb, token, mm);
          return { reversed, satang: reversed ? held : 0 };
        });
      } catch (e) {
        await releaseClaim(g, pre.id, token, "UNDOING", e);
        return fail("UNAVAILABLE", "ระบบขัดข้องระหว่างย้อนกลับ — บางสัญญาอาจย้อนแล้ว กดย้อนกลับอีกครั้งเพื่อทำต่อ (ไม่กลับรายการซ้ำ)");
      }
      if (isFail(r)) {
        // หยุด: สัญญาที่ย้อนแล้วคงย้อน · ชุดคง UNDOING ไม่มีผู้ถือ (เรียกซ้ำทำต่อได้)
        await importTx(g.tenantId, g.unitId, async (tx) => {
          await lockWait(tx, importLockKey(g.unitId));
          await tx.dormImportBatch.updateMany({ where: { id: pre.id, tenantId: g.tenantId, unitId: g.unitId, status: "UNDOING", claimToken: token }, data: { claimToken: null, claimUntil: null, lastError: json({ code: r.code, leaseId: t.leaseId }), version: { increment: 1 } } });
        });
        return r;
      }
    }

    // ── tx U2: เลข/มิเตอร์ของชุด ⇒ ลบ (เลขบนมิเตอร์เดิมที่ไม่ใช่ของชุด ⇒ คงไว้ · X7) · ห้องของชุด ⇒ ปิดใช้ · ประเภท/อาคาร ⇒ ปิด/ลบเมื่อไม่มีห้อง active · CAS เป็น UNDONE ──
    let u2: ImportUndone | Fail;
    try {
      u2 = await importTx(g.tenantId, g.unitId, async (tx) => {
        await lockWait(tx, importLockKey(g.unitId));
        const b = await holdClaim(tx, g, pre.id, token, "UNDOING");
        const mm = manifestOf(b) ?? m;
        const own = await ownership(tx, g, pre.id, mm);
        const T = { tenantId: g.tenantId, unitId: g.unitId };
        const rows = Object.values(mm.rows);
        const roomIds = [...new Set(rows.filter((r) => r.roomId && (r.roomCreated || r.roomRevived)).map((r) => r.roomId as string))];
        const typeIds = [...new Set(rows.flatMap((r) => r.roomTypeIds))];
        const buildingIds = [...new Set(rows.flatMap((r) => r.buildingIds))];
        const readings = own.readingIds.length ? (await tx.dormMeterReading.deleteMany({ where: { ...T, id: { in: own.readingIds }, source: "IMPORT" } })).count : 0;
        let meters = 0;
        for (const id of own.meterIds) {
          const left = await tx.dormMeterReading.count({ where: { ...T, meterId: id } });
          if (left === 0) meters += (await tx.dormMeter.deleteMany({ where: { ...T, id } })).count;
          else meters += (await tx.dormMeter.updateMany({ where: { ...T, id, removedAt: null }, data: { removedAt: new Date() } })).count;
        }
        const rooms = roomIds.length ? (await tx.hotelRoom.updateMany({ where: { ...T, id: { in: roomIds }, active: true }, data: { active: false } })).count : 0;
        let roomTypes = 0;
        for (const id of typeIds) {
          const used = await tx.hotelRoom.count({ where: { ...T, roomTypeId: id, active: true } });
          if (used === 0) roomTypes += (await tx.hotelRoomType.updateMany({ where: { ...T, id, active: true }, data: { active: false } })).count;
        }
        let buildings = 0;
        for (const id of buildingIds) {
          // X16 ▸ อาคารที่ชุดสร้างและไม่เหลือห้อง active ⇒ ลบ (ห้องที่ปิดหลุดอาคาร · ปลุกห้องคืนแล้วผูกอาคารใหม่ตามแผน)
          const used = await tx.hotelRoom.count({ where: { ...T, buildingId: id, active: true } });
          if (used === 0) buildings += (await tx.roomBuilding.deleteMany({ where: { ...T, id } })).count;
        }
        const prog = Object.values(mm.undoProgress ?? {});
        const undone: ImportUndone = {
          leases: prog.length,
          depositReversals: prog.filter((x) => x.reversed).length,
          reversedSatang: prog.reduce((a2, x) => a2 + (x.reversed ? x.satang : 0), 0),
          rooms,
          roomTypes,
          buildings,
          meters,
          readings,
          keptReadings: own.keptReadings,
        };
        const r = await tx.dormImportBatch.updateMany({
          where: { id: b.id, ...T, status: "UNDOING", claimToken: token },
          data: { status: "UNDONE", undoneAt: new Date(), undoneById: g.actorUserId, undoReason: reason.slice(0, 500), claimToken: null, claimUntil: null, lastError: json(null), manifest: json({ ...mm, undone }), version: { increment: 1 } },
        });
        if (r.count !== 1) throw new Abort(busy());
        await tx.auditLog.create({
          data: { ...T, actorType: "USER", actorId: g.actorUserId, action: "dorm.import.undone", targetType: "DormImportBatch", targetId: b.id, after: { batchId: b.id, reason: reason.slice(0, 500), ...undone } },
        });
        return undone;
      });
    } catch (e) {
      await releaseClaim(g, pre.id, token, "UNDOING", e);
      return fail("UNAVAILABLE", "ระบบขัดข้องระหว่างย้อนกลับ — สัญญา/เงินที่ย้อนแล้วคงย้อน กดย้อนกลับอีกครั้งเพื่อทำต่อ");
    }
    if (isFail(u2)) return u2;
    return { ok: true, status: "UNDONE", duplicate: false, undone: u2 };
  } catch {
    return unavailable();
  }
}

/**
 * ของที่เป็นของชุดนี้ (X6): สัญญาใน manifest ∪ สัญญาที่ policySnapshot.import.batchId = ชุดนี้ (ค้างจากงานที่ตายกลางแถว) ·
 *   มิเตอร์ใน manifest ∪ มิเตอร์ note `import:<batchId>` · เลขของชุด = เลขใน manifest บนมิเตอร์ของชุด ∪ เลข source IMPORT งวดนำเข้าบนมิเตอร์ของชุด
 *   เลขใน manifest ที่อยู่บนมิเตอร์เดิม (ไม่ใช่ของชุด) ⇒ คงไว้ (X7) นับใน keptReadings
 */
async function ownership(tx: Tx, g: Gate, batchId: string, m: Manifest): Promise<{ leases: { leaseId: string; room: string; receiptKey: string | null }[]; leaseIds: string[]; meterIds: string[]; readingIds: string[]; keptReadings: number }> {
  const T = { tenantId: g.tenantId, unitId: g.unitId };
  const rows = Object.values(m.rows);
  const leases: { leaseId: string; room: string; receiptKey: string | null }[] = rows.filter((r) => isStr(r.leaseId)).map((r) => ({ leaseId: r.leaseId as string, room: r.room, receiptKey: r.receiptKey ?? null }));
  const orphans = await tx.dormLease.findMany({ where: { ...T, policySnapshot: { path: ["import", "batchId"], equals: batchId } }, select: { id: true, room: { select: { number: true } } }, orderBy: { id: "asc" } });
  for (const o of orphans) if (!leases.some((x) => x.leaseId === o.id)) leases.push({ leaseId: o.id, room: o.room?.number ?? "", receiptKey: null });
  const noteMeters = await tx.dormMeter.findMany({ where: { ...T, note: `import:${batchId}` }, select: { id: true } });
  const meterIds = [...new Set([...rows.flatMap((r) => r.meterIds), ...noteMeters.map((x) => x.id)])];
  const manifestReadings = [...new Set(rows.flatMap((r) => r.readingIds))];
  const period = isRec(m.options) && typeof m.options.meterReadDate === "string" ? m.options.meterReadDate.slice(0, 7) : null;
  const onOurs = meterIds.length ? await tx.dormMeterReading.findMany({ where: { ...T, meterId: { in: meterIds } }, select: { id: true, source: true, periodKey: true, kind: true } }) : [];
  const ourSet = new Set(onOurs.filter((x) => manifestReadings.includes(x.id) || (x.source === "IMPORT" && x.kind === "PERIOD" && (!period || x.periodKey === period))).map((x) => x.id));
  const onOursIds = new Set(onOurs.map((x) => x.id));
  const keptReadings = manifestReadings.filter((id) => !onOursIds.has(id)).length;
  return { leases, leaseIds: leases.map((x) => x.leaseId), meterIds, readingIds: [...ourSet], keptReadings };
}

/** ตัวกั้นทุกแถว (อ่านผ่าน tx ของผู้เรียก) — ว่าง = ย้อนได้ */
async function undoBlockers(tx: Tx, g: Gate, batchId: string, m: Manifest): Promise<UndoBlocker[]> {
  const T = { tenantId: g.tenantId, unitId: g.unitId };
  const out: UndoBlocker[] = [];
  const endReason = `IMPORT_UNDONE:${batchId}`;
  const own = await ownership(tx, g, batchId, m);
  const ourLeaseIds = own.leaseIds.length ? own.leaseIds : ["-"];
  for (const t of own.leases) {
    const room = safeEcho(t.room, 20);
    const l = await tx.dormLease.findFirst({ where: { ...T, id: t.leaseId }, select: { id: true, status: true, endReason: true, depositSatang: true } });
    if (!l || (l.status === "CANCELLED" && l.endReason === endReason)) continue;
    if (l.status !== "ACTIVE" && l.status !== "DRAFT") out.push({ code: "LEASE_CHANGED", room, leaseId: l.id });
    if ((await tx.dormBill.count({ where: { ...T, leaseId: l.id } })) > 0) out.push({ code: "BILL_EXISTS", room, leaseId: l.id });
    if ((await tx.dormMoveOut.count({ where: { ...T, leaseId: l.id } })) > 0) out.push({ code: "MOVEOUT_EXISTS", room, leaseId: l.id });
    const held = await securityDepositHeldInTx(tx, { tenantId: g.tenantId, unitId: g.unitId, leaseId: l.id });
    const expect = l.status === "ACTIVE" ? l.depositSatang : 0;
    if (held !== expect) out.push({ code: "DEPOSIT_MOVED", room, leaseId: l.id });
  }
  if (own.meterIds.length) {
    const ours = own.readingIds.length ? own.readingIds : ["-"];
    const extra = await tx.dormMeterReading.findMany({ where: { ...T, meterId: { in: own.meterIds }, NOT: { id: { in: ours } } }, select: { meter: { select: { room: { select: { number: true } } } } } });
    for (const x of extra.slice(0, 50)) out.push({ code: "METER_READ_AFTER_IMPORT", room: safeEcho(x.meter?.room?.number ?? "", 20) });
  }
  for (const r of Object.values(m.rows)) {
    if (!(r.roomId && (r.roomCreated || r.roomRevived))) continue;
    const otherLease = await tx.dormLease.count({ where: { ...T, roomId: r.roomId, status: { in: LIVE_LEASE }, NOT: { id: { in: ourLeaseIds } } } });
    const occ = await tx.roomOccupancy.count({ where: { ...T, roomId: r.roomId, active: true, NOT: { AND: [{ refType: "DormLease" }, { refId: { in: ourLeaseIds } }] } } });
    if (otherLease > 0 || occ > 0) out.push({ code: "ROOM_IN_USE", room: safeEcho(r.room, 20) });
  }
  return out;
}

// ═════════════════════════ 3.6 อ่าน ═════════════════════════
export async function getImport(ctx: ImportCtx, input: { unitId: string; batchId: string }): Promise<ImportView | null> {
  try {
    if (!isRec(input)) return null;
    const g = await gate(ctx, input.unitId, "import");
    if (!g) return null;
    const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
    const b = await readBatch(db, g, input.batchId);
    if (!b) return null;
    const p = parsedOf(b);
    const pr = isRec(b.proposal) ? b.proposal : null;
    const source = pr && (pr.source === "AI" || pr.source === "HEADER" || pr.source === "NONE") ? pr.source : null;
    const sp = storedPreview(b);
    const st = await settingsOf(g.tenantId, g.unitId);
    const until = b.committedAt ? undoDeadline(b.committedAt, st.undoDays) : null;
    const status = statusOf(b.status);
    let createdBy: string | null = null;
    if (b.createdById) {
      const u = await tenantDb({ tenantId: g.tenantId }).membership.findFirst({ where: { tenantId: g.tenantId, userId: b.createdById }, select: { user: { select: { name: true } } } });
      createdBy = u?.user?.name ? safeEcho(maskPersonal(u.user.name), 80) : null;
    }
    return {
      batchId: b.id,
      unitId: b.unitId,
      fileName: safeEcho(b.fileName, 200),
      format: b.format === "XLSX" ? "XLSX" : "CSV",
      sheet: safeEcho(b.sheet ?? "", 80),
      sheets: p.sheets.map((s) => ({ name: safeEcho(s.name, 80), rowCount: s.rowCount })),
      rowCount: b.rowCount,
      columnCount: b.columnCount,
      headers: headersOf(p),
      samples: samplesOf(p),
      status,
      proposal: source ? { source, guessed: numOr(pr?.guessed) } : null,
      mapping: mappingOf(b.mapping, b.columnCount),
      confirmed: !!b.mappingConfirmedById,
      summary: sp?.summary ?? null,
      plan: sp?.plan ?? null,
      issues: sp?.issues ?? [],
      committedAt: b.committedAt ? b.committedAt.toISOString() : null,
      undoUntil: until ? until.toISOString() : null,
      canUndo: status === "CREATED" && !!until && Date.now() <= until.getTime(),
      undoneAt: b.undoneAt ? b.undoneAt.toISOString() : null,
      createdBy,
      undoDays: st.undoDays,
      previewHash: b.mappingConfirmedById && (status === "DRAFT" || status === "UNDONE") ? b.previewHash : null,
      resumable: status === "CREATING" && !claimAlive(b),
      undoResumable: status === "UNDOING" && !claimAlive(b),
      lastError: isRec(b.lastError) && typeof b.lastError.code === "string" ? { rowNo: isInt(b.lastError.rowNo) ? b.lastError.rowNo : null, code: b.lastError.code } : null,
      options: optionsOf(b.options, bkkYmd(new Date())),
      decisions: decisionsRaw(decisionsOf(b.decisions, b.rowCount) ?? {}),
    };
  } catch {
    return null;
  }
}

export async function listImports(ctx: ImportCtx, input: { unitId: string }): Promise<{ batchId: string; fileName: string; status: ImportStatus; rowCount: number; committedAt: string | null; createdAt: string }[]> {
  try {
    if (!isRec(input)) return [];
    const g = await gate(ctx, input.unitId, "import");
    if (!g) return [];
    const rows = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).dormImportBatch.findMany({
      where: { tenantId: g.tenantId, unitId: g.unitId },
      select: { id: true, fileName: true, status: true, rowCount: true, committedAt: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
    });
    return rows.map((r) => ({ batchId: r.id, fileName: safeEcho(r.fileName, 200), status: statusOf(r.status), rowCount: r.rowCount, committedAt: r.committedAt ? r.committedAt.toISOString() : null, createdAt: r.createdAt.toISOString() }));
  } catch {
    return [];
  }
}

const SEV_TH: Record<string, string> = { MUST_FIX: "ต้องแก้", WARN: "เตือน", INFO: "ข้อมูล" };
export async function importIssuesCsv(ctx: ImportCtx, input: { unitId: string; batchId: string }): Promise<string | null> {
  try {
    if (!isRec(input)) return null;
    const g = await gate(ctx, input.unitId, "import");
    if (!g) return null;
    const b = await readBatch(tenantDb({ tenantId: g.tenantId, unitId: g.unitId }), g, input.batchId);
    if (!b) return null;
    const issues = storedPreview(b)?.issues ?? [];
    const label = new Map(IMPORT_FIELDS.map((f) => [f.key, f.labelTh]));
    const lines = [csvRow(["แถว", "ห้อง", "รหัส", "ระดับ", "ช่อง", "ค่า", "คำอธิบาย"])];
    for (const i of issues)
      lines.push(
        csvRow([
          i.rowNo ?? "",
          neutralizeCell(maskPersonal(i.room ?? "")),
          i.code,
          SEV_TH[i.severity] ?? i.severity,
          i.field ? (label.get(i.field) ?? i.field) : "",
          neutralizeCell(maskPersonal(i.value ?? "")),
          neutralizeCell(i.legal ? `${i.messageTh} (${i.legal.citation})` : i.messageTh),
        ]),
      );
    return `﻿${lines.join("\r\n")}\r\n`;
  } catch {
    return null;
  }
}
