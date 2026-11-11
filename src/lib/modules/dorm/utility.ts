// SVC D.7 ▸ ค่าน้ำไฟทุกโหมด + ตัวตรวจรายเดือน — สัญญา ledger/svc-briefs/svc-brief-d.7.md §2–§3.5
//   • สูตรเงินทุกตัวเรียก D.1 (calc.ts) — actualCostRate · utilityLine · allocateShared · computeBill (ไม่เขียนสูตรซ้ำ)
//   • ตัวตรวจกฎหมายทุกตัวผ่าน evaluateLegal (โหมด/เหตุผล = ค่าตั้งปัจจุบันของหน่วย · params = ค่าเริ่มของแพลตฟอร์ม)
//   • ขอบเขต (X1): อ่าน/เขียนผ่าน tenantDb เท่านั้น · หน่วยต้องเป็น DORM ของร้านนี้ (ไม่ใช่ ⇒ NOT_FOUND/ผลว่าง ไม่บอกว่ามีอยู่)
//   • บิลการไฟฟ้า/ประปา 1 แถว/(หน่วย, อาคาร|null, kind, งวด) — advisory lock ต่อ (หน่วย, kind, งวด) ใน tx + ดัชนี unique NULLS NOT DISTINCT ของ D.0 (X3)
//   • ชุดแก้ผู้ตรวจ (/root/svc-runs/fix/d7.md H1–H9): ขอบเขตบิล = แถวที่มียอดบิลจริงเท่านั้น · ตัวตรวจใช้ค่าตั้งที่คิดเงินจริงรายแถว ·
//     บิลทั้งหน่วยกับรายอาคารห้ามซ้อน · STRICT ไม่รู้ต้นทุน = บล็อก · TARIFF อยู่ใต้เพดานต้นทุน · มิเตอร์รวม: ส่วนห้องว่างผู้ให้เช่าแบก ·
//     ผสมมิเตอร์ห้อง+มิเตอร์รวม = บล็อก · นอกขอบเขตตรวจขอบเขต/หลักฐานสดที่ด่าน · การยอมรับผูก fingerprint + รุ่นบิล
//   • การใส่บิลไม่ถูกบล็อกเพราะกฎหมาย (บันทึกข้อเท็จจริงเสมอ) — บล็อกที่ด่านออกบิล utilityBillingGate (D.8 เรียก)
//   • legalCheck ในแถว = บันทึกผลล่าสุด/การยอมรับ — การตัดสินคำนวณสดทุกครั้ง (ไม่ใช้ผลเก่า)
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { resolveSettings, resolveSettingsMany } from "@/lib/core/settings";
import type { Resolved, ScopeRefs } from "@/lib/core/settings";
import {
  evaluateLegal,
  isValidOutOfScopeReason,
  legalScope,
  normalizeLegalMode,
  type BusinessType,
  type LegalMode,
  type LegalOutcome,
  type LegalRuleId,
  type LegalRuleInputs,
} from "@/lib/core/settings/legal/th-rental-2568";
import { isPrivateStoragePath, uploadFile } from "@/lib/storage/service";
import { occupancyRange } from "@/lib/modules/rooms";
import {
  actualCostRate,
  allocateShared,
  computeBill,
  DEFAULT_DORM_TAX_KINDS,
  DormCalcError,
  utilityLine,
  type TariffTier,
  type TaxKind,
  type VatConfig,
} from "./calc";
import { listMeters, periodUsage, type PeriodUsageRow } from "./meter";

// ───────────────────────── ชนิด (สัญญา §3) ─────────────────────────
export type UtilityCtx = { tenantId: string; actorUserId?: string | null };
export type UtilityKind = "ELEC" | "WATER";
type Kind = UtilityKind;
type Fail = { ok: false; code: string; reason: string };
type Metering = "ROOM_METER" | "SHARED_METER" | "NONE";
type Method = "ACTUAL_COST" | "TARIFF" | "FIXED_RATE" | "FLAT";
type Basis = "PERSON" | "ROOM" | "AREA";
type Flat = { per: "ROOM" | "PERSON"; satang: number };

export type UtilityLegalOutcome = {
  ruleId: LegalRuleId;
  level: "OK" | "WARN" | "BLOCK";
  raw: "OK" | "WARN" | "BLOCK";
  code: string;
  messageTh: string;
  needsAck: boolean;
  needsOwnerApproval: boolean;
  always?: boolean;
};
export type UtilityLegalGroup = {
  kind: Kind;
  buildingId: string | null;
  mode: LegalMode;
  level: "OK" | "WARN" | "BLOCK";
  outcomes: UtilityLegalOutcome[];
  fingerprint: string;
  accepted: boolean;
  acceptance: { byUserId: string; at: string; reason: string } | null;
};
export type UtilityChargeRow = {
  roomId: string;
  roomNumber: string;
  buildingId: string | null;
  kind: Kind;
  metering: Metering;
  method: Method;
  status: "OK" | "HELD" | "NO_READING" | "NO_COST_BASIS" | "NONE";
  code: string | null;
  units: number | null;
  rateSatangPerUnit: number | null;
  amountSatang: number | null;
  grossSatang: number | null;
  /** SHARED: น้ำหนักของห้อง */
  weight: number | null;
};
export type UtilityGroup = {
  kind: Kind;
  buildingId: string | null;
  metering: string;
  method: string;
  billSatang: number | null;
  billUnits: number | null;
  costRateSatangPerUnit: number | null;
  /** แถว OK */
  chargedRooms: number;
  /** Σ grossSatang แถว OK */
  chargedTotalSatang: number;
  /** SHARED: ยอดที่นำมาเฉลี่ย (ทั้งขอบเขตบิล รวมส่วนห้องว่าง) */
  allocatedSatang: number | null;
  /** SHARED (H6): ส่วนของห้องว่างในขอบเขตบิล — ไม่เรียกเก็บผู้เช่า ผู้ให้เช่าแบก */
  landlordShareSatang: number | null;
  legal: UtilityLegalGroup;
};
export type UtilityCharges = { periodKey: string; rows: UtilityChargeRow[]; groups: UtilityGroup[] };
export type UtilityGateItem = { kind: Kind; buildingId: string | null; code: string; messageTh: string; ruleId?: string };
export type UtilityGate = { ok: boolean; blocks: UtilityGateItem[]; needsAcceptance: UtilityGateItem[]; groups: UtilityGroup[] };
export type RecordAuthorityBillResult =
  | {
      ok: true;
      rateId: string;
      status: "CREATED" | "UPDATED" | "UNCHANGED";
      units: number;
      unitsSource: "BILL" | "MAIN_METER";
      costRateSatangPerUnit: number;
      legal: UtilityLegalGroup;
    }
  | Fail;
export type AuthorityTariff = {
  authority: string;
  kind: Kind;
  tariffCode: string;
  label: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  tiers: TariffTier[];
  ftE4: number;
  serviceSatang: number | null;
};
export type UtilityDeps = { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void>; now?: Date };

// ───────────────────────── ค่าคงที่ · ตัวช่วยเล็ก ─────────────────────────
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_BILL_SATANG = 1_000_000_000;
const MAX_INT4 = 2_147_483_647;
const MIN_PERIOD = "2020-01";
/** ต้นทุนต่อหน่วยที่เป็นไปได้ (สตางค์) — นอกช่วง = กรอกผิด (เช่น หน่วยขาดศูนย์) */
const COST_MIN = 1;
const COST_MAX = 10_000;
const KINDS: readonly Kind[] = ["ELEC", "WATER"];
const LABEL_TH: Record<Kind, string> = { ELEC: "ค่าไฟฟ้า", WATER: "ค่าน้ำประปา" };
const TX_OPTS = { maxWait: 30_000, timeout: 60_000 } as const;
const LEVEL_RANK: Record<"OK" | "WARN" | "BLOCK", number> = { OK: 0, WARN: 1, BLOCK: 2 };

const fail = (code: string, reason: string): Fail => ({ ok: false, code, reason });
const NOT_FOUND = (): Fail => fail("NOT_FOUND", "ไม่พบหอพักหรืออาคารนี้");
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isNat = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const isKind = (v: unknown): v is Kind => v === "ELEC" || v === "WATER";
const periodOk = (v: unknown): v is string => typeof v === "string" && PERIOD_RE.test(v);
/** งวดอยู่ในช่วงที่ยอมรับ: 2020-01 .. เดือนปัจจุบันไทย + 1 */
// SVC D.12 ▸ (มติผู้คุม P-5) "เดือนหน้า" นับจาก now ที่ผู้เรียกส่งมา (รอบบิลใช้ deps.now) · ไม่ส่ง = นาฬิกาจริงเหมือนเดิม ◂
const periodInRange = (p: string, now?: Date): boolean => p >= MIN_PERIOD && p <= nextPeriod(bkkYmd(now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date()).slice(0, 7));
/** ตัวเลือกเวลาของด่าน/ค่าน้ำไฟ (SVC D.12 · เพิ่มอย่างเดียว) */
export type UtilityClockOpts = { now?: Date };
const sub = (k: Kind) => (k === "ELEC" ? "elec" : "water");
const numCmp = (a: string, b: string) => a.localeCompare(b, "th", { numeric: true });

function nextPeriod(p: string): string {
  const y = Number(p.slice(0, 4));
  const m = Number(p.slice(5, 7)); // 1..12
  return m === 12 ? `${String(y + 1).padStart(4, "0")}-01` : `${p.slice(0, 4)}-${String(m + 1).padStart(2, "0")}`;
}

/** ตัวช่วยเฉพาะตารางกลาง (ไม่มีแกนร้าน) — tenantDb ส่งผ่านโมเดล global ตรง ๆ · ผู้เรียกกรอง tenantId เอง */
const globalDb = () => tenantDb({ tenantId: "platform-global-read" });

/** หน่วยเป็น DORM ของร้านนี้ไหม */
async function dormUnit(tenantId: unknown, unitId: unknown): Promise<{ id: string; name: string } | null> {
  if (!isStr(tenantId) || !isStr(unitId)) return null;
  return tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: unitId, type: "DORM" }, select: { id: true, name: true } });
}

/** ผิดเพราะแถวซ้ำ (unique) — เดินสาย error ของ Prisma → driver adapter → pg */
function isUniqueViolation(e: unknown): boolean {
  let cur: unknown = e;
  for (let d = 0; d < 6 && cur && typeof cur === "object"; d++) {
    const o = cur as { code?: unknown; originalCode?: unknown; message?: unknown; cause?: unknown; meta?: unknown };
    if (o.code === "P2002" || o.code === "23505" || o.originalCode === "23505") return true;
    if (typeof o.message === "string" && /unique constraint|duplicate key|23505|UniqueConstraintViolation/i.test(o.message)) return true;
    const meta = isRec(o.meta) ? o.meta : null;
    cur = o.cause ?? meta?.driverAdapterError;
  }
  return false;
}

type Tx = Prisma.TransactionClient;
/** ล็อกต่อ (หน่วย, kind, งวด) — ครอบทุกขอบเขต (ทั้งหน่วย/รายอาคาร) เพื่อกันบิลซ้อนขอบเขต (H2) */
const lockKey = (unitId: string, kind: Kind, periodKey: string) => `dorm.utility:${unitId}:${kind}:${periodKey}`;
async function advisoryLock(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
function runTx<T>(tenantId: string, unitId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return tenantDb({ tenantId, unitId }).$transaction((tx) => fn(tx as unknown as Tx), TX_OPTS);
}

// ───────────────────────── ค่าตั้ง ─────────────────────────
type KindCfg = { metering: Metering; method: Method; fixedRate: number | null; tariffRef: string | null; flat: Flat | null };
type Cfg = {
  ELEC: KindCfg;
  WATER: KindCfg;
  minimum: number | null;
  sharedBasis: Basis;
  vat: VatConfig;
  taxKinds: Record<Kind, TaxKind>;
  mode: LegalMode;
  reason: string | null;
  businessType: BusinessType;
  evidence: string[];
};

const SETTING_KEYS: string[] = [
  ...KINDS.flatMap((k) => ["metering", "method", "fixedRate", "tariffRef", "flat"].map((n) => `rooms.utility.${sub(k)}.${n}`)),
  "rooms.utility.minimum",
  "rooms.utility.sharedBasis",
  "rooms.vat.registered",
  "rooms.vat.pricesIncludeVat",
  "rooms.vat.taxKinds",
  "rooms.legal.mode",
  "rooms.legal.outOfScopeReason",
  "rooms.legal.outOfScopeEvidence",
  "rooms.general.businessType",
];
const BUSINESS_TYPES: readonly BusinessType[] = ["APARTMENT", "STUDENT_DORM", "SMALL_HOTEL", "SERVICED_APT"];

const asMetering = (v: unknown): Metering => (v === "SHARED_METER" || v === "NONE" ? v : "ROOM_METER");
const asMethod = (v: unknown): Method => (v === "TARIFF" || v === "FIXED_RATE" || v === "FLAT" ? v : "ACTUAL_COST");
const asBasis = (v: unknown): Basis => (v === "ROOM" || v === "AREA" ? v : "PERSON");
const asTaxKind = (v: unknown, d: TaxKind): TaxKind => (v === "EXEMPT" || v === "VAT7" || v === "NONE" ? v : d);
const asFlat = (v: unknown): Flat | null =>
  isRec(v) && (v.per === "ROOM" || v.per === "PERSON") && isNat(v.satang) ? { per: v.per, satang: v.satang } : null;

function cfgOf(r: Record<string, Resolved>): Cfg {
  const val = (k: string): unknown => r[k]?.value;
  const kindCfg = (k: Kind): KindCfg => {
    const tr = val(`rooms.utility.${sub(k)}.tariffRef`);
    const fr = val(`rooms.utility.${sub(k)}.fixedRate`);
    return {
      metering: asMetering(val(`rooms.utility.${sub(k)}.metering`)),
      method: asMethod(val(`rooms.utility.${sub(k)}.method`)),
      fixedRate: isNat(fr) ? fr : null,
      tariffRef: typeof tr === "string" && tr ? tr : null,
      flat: asFlat(val(`rooms.utility.${sub(k)}.flat`)),
    };
  };
  const min = val("rooms.utility.minimum");
  const tk = val("rooms.vat.taxKinds");
  const tkr = isRec(tk) ? tk : {};
  const reason = val("rooms.legal.outOfScopeReason");
  const bt = val("rooms.general.businessType");
  const ev = val("rooms.legal.outOfScopeEvidence");
  return {
    ELEC: kindCfg("ELEC"),
    WATER: kindCfg("WATER"),
    minimum: isNat(min) ? min : null,
    sharedBasis: asBasis(val("rooms.utility.sharedBasis")),
    vat: { registered: val("rooms.vat.registered") === true, pricesIncludeVat: val("rooms.vat.pricesIncludeVat") !== false },
    taxKinds: { ELEC: asTaxKind(tkr.ELEC, DEFAULT_DORM_TAX_KINDS.ELEC), WATER: asTaxKind(tkr.WATER, DEFAULT_DORM_TAX_KINDS.WATER) },
    mode: normalizeLegalMode(val("rooms.legal.mode")),
    reason: typeof reason === "string" ? reason : null,
    businessType: BUSINESS_TYPES.find((b) => b === bt) ?? "APARTMENT",
    evidence: Array.isArray(ev) ? ev.filter(isStr) : [],
  };
}

/** VAT ของบรรทัดน้ำไฟ (ตรง buildDormBill ของ D.1): taxKind VAT7 ⇒ สถานะ VAT ของหอ · ไม่งั้น null */
const utilVat = (c: Cfg, k: Kind): VatConfig | null => (c.taxKinds[k] === "VAT7" ? c.vat : null);
/** ยอดที่ผู้เช่าจ่ายจริง = computeBill ของ D.1 (บรรทัดเดียว) */
const grossOf = (c: Cfg, k: Kind, amountSatang: number): number =>
  computeBill({ lines: [{ code: k, labelTh: LABEL_TH[k], amountSatang, taxKind: c.taxKinds[k] }], vat: c.vat }).totalSatang;

// ───────────────────────── ตารางอัตรา ─────────────────────────
const ymdOfDb = (d: Date) => d.toISOString().slice(0, 10);
const dbOfYmd = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

function tiersOf(v: unknown): TariffTier[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: TariffTier[] = [];
  for (const t of v) {
    if (!isRec(t) || !isNat(t.rateE4) || !(t.uptoUnits === null || isNat(t.uptoUnits))) return null;
    out.push({ uptoUnits: t.uptoUnits, rateE4: t.rateE4 });
  }
  return out;
}

/** ตารางอัตราของรัฐที่มีผล ณ วันที่ `at` (YYYY-MM-DD) · ไม่มี/ช่วงไม่ครอบ ⇒ null · อ่านอย่างเดียว */
export async function authorityTariffFor(q: { authority: string; kind: Kind; tariffCode: string; at: string }): Promise<AuthorityTariff | null> {
  if (!isRec(q) || !isStr(q.authority) || !isKind(q.kind) || !isStr(q.tariffCode) || typeof q.at !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(q.at)) return null;
  const at = dbOfYmd(q.at);
  if (Number.isNaN(at.getTime())) return null;
  const row = await globalDb().dormAuthorityTariff.findFirst({
    where: { authority: q.authority, kind: q.kind, tariffCode: q.tariffCode, effectiveFrom: { lte: at }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }] },
    orderBy: [{ effectiveFrom: "desc" }],
  });
  if (!row) return null;
  const tiers = tiersOf(row.tiers);
  if (!tiers) return null;
  return {
    authority: row.authority,
    kind: q.kind,
    tariffCode: row.tariffCode,
    label: row.label,
    effectiveFrom: ymdOfDb(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? ymdOfDb(row.effectiveTo) : null,
    tiers,
    ftE4: row.ftE4,
    serviceSatang: row.serviceSatang,
  };
}

type TariffPick = { ok: true; tiers: TariffTier[]; ftE4: number } | { ok: false; code: "TARIFF_MISSING" | "TARIFF_NEGATIVE_FT" };

/** §2 ตารางอัตรา: ตารางของร้าน (ชั้น TENANT) ชนะ ⇒ tariffRef "AUTH:CODE" ⇒ ไม่มี = TARIFF_MISSING · Ft ติดลบ = TARIFF_NEGATIVE_FT */
async function pickTariff(table: unknown, kind: Kind, tariffRef: string | null, periodKey: string): Promise<TariffPick> {
  if (Array.isArray(table)) {
    const mine = table.filter((t) => isRec(t) && t.kind === kind);
    if (mine.length) {
      const tiers = tiersOf(mine);
      if (!tiers) return { ok: false, code: "TARIFF_MISSING" };
      const withFt = mine.find((t) => isRec(t) && typeof t.ftE4 === "number");
      const ft = withFt && isRec(withFt) && typeof withFt.ftE4 === "number" && Number.isSafeInteger(withFt.ftE4) ? withFt.ftE4 : 0;
      if (ft < 0) return { ok: false, code: "TARIFF_NEGATIVE_FT" };
      return { ok: true, tiers: sortTiers(tiers), ftE4: ft };
    }
  }
  const m = tariffRef ? /^([A-Z]+):(.+)$/.exec(tariffRef) : null;
  if (!m) return { ok: false, code: "TARIFF_MISSING" };
  const t = await authorityTariffFor({ authority: m[1], kind, tariffCode: m[2], at: `${periodKey}-01` });
  if (!t) return { ok: false, code: "TARIFF_MISSING" };
  if (t.ftE4 < 0) return { ok: false, code: "TARIFF_NEGATIVE_FT" };
  return { ok: true, tiers: sortTiers(t.tiers), ftE4: t.ftE4 };
}
const sortTiers = (t: TariffTier[]): TariffTier[] =>
  [...t].sort((a, b) => (a.uptoUnits === null ? 1 : b.uptoUnits === null ? -1 : a.uptoUnits - b.uptoUnits));

// ───────────────────────── ข้อความ ─────────────────────────
const CODE_TH: Record<string, string> = {
  BILL_MISSING: "ยังไม่ได้ใส่บิลจากการไฟฟ้า/การประปาของงวดนี้ — ใส่บิลก่อนจึงคิดค่าน้ำไฟตามต้นทุนจริงได้",
  RATE_MISSING: "ยังไม่ได้ตั้งอัตราของวิธีคิดที่เลือก (อัตราคงที่หรือค่าเหมาจ่าย) — ตั้งอัตราก่อนออกบิล",
  TARIFF_MISSING: "ยังไม่มีตารางอัตราที่ใช้ได้ของงวดนี้ — ตั้งประเภทอัตราหรือตารางอัตราของร้านก่อนออกบิล",
  TARIFF_NEGATIVE_FT: "ตารางอัตรางวดนี้มีค่า Ft ติดลบ ซึ่งระบบยังคำนวณให้ไม่ได้ — ใช้วิธีคิดอื่นชั่วคราวหรือแจ้งผู้ดูแลระบบ",
  NO_ALLOCATION_BASIS: "ยังไม่มีฐานสำหรับเฉลี่ยมิเตอร์รวม (จำนวนคน/พื้นที่ห้องเป็นศูนย์) — ตรวจข้อมูลผู้พักหรือพื้นที่ห้อง",
  NO_COST_BASIS: "หน่วยรวมในบิลเป็นศูนย์ จึงคิดต้นทุนต่อหน่วยไม่ได้ — ตรวจบิลที่ใส่",
  METER_UNREADABLE: "เลขมิเตอร์งวดนี้คำนวณหน่วยไม่ได้ — ตรวจเลขมิเตอร์อีกครั้ง",
  CFG_DOUBLE_METER: "อาคาร/ขอบเขตบิลเดียวกันมีทั้งห้องที่คิดตามมิเตอร์ห้องและห้องที่เฉลี่ยมิเตอร์รวม ซึ่งทำให้เก็บค่าซ้ำซ้อน — ตั้งวิธีวัดให้เหมือนกันทั้งขอบเขตบิล",
  SCOPE_CONFLICT: "งวดนี้มีบิลทั้งแบบทั้งหน่วยและแบบรายอาคารซ้อนกัน ซึ่งทำให้นับต้นทุนซ้ำ — ลบ/แก้ให้เหลือแบบเดียว",
  LEGAL_SCOPE_EVIDENCE_MISSING: "หอนี้อยู่ในขอบเขตประกาศ สคบ. 2568 แต่ตั้งโหมดนอกขอบเขตโดยไม่มีหลักฐานที่ยังอยู่ในระบบ — แนบหลักฐานใหม่หรือเปลี่ยนโหมดเป็นเข้มงวด/เตือน",
};
const codeTh = (code: string) => CODE_TH[code] ?? "ข้อมูลสำหรับคิดค่าน้ำไฟยังไม่ครบ — ตรวจค่าตั้งและบิลของงวดนี้";

// ───────────────────────── คำนวณ (ภายใน) ─────────────────────────
type BillRow = {
  id: string;
  buildingId: string | null;
  kind: string;
  authorityBillSatang: number | null;
  authorityUnits: number | null;
  rateSatangPerUnit: number | null;
  billPhotoFileId: string | null;
  legalCheck: Prisma.JsonValue | null;
  mode: string;
};
type RoomRow = { roomId: string; number: string; buildingId: string | null; roomTypeId: string; charged: boolean; persons: number; areaE2: number };
type Draft = UtilityChargeRow & { _flat: Flat | null; _payers: number; _segs: { start: number; end: number }[] | null; _cfg: Cfg };
type LegalPiece = { ruleId: LegalRuleId; input: unknown; outcome: LegalOutcome };
type GroupInternal = UtilityGroup & { _scopeRow: BillRow | null; _cfg: Cfg; _extra: UtilityGateItem[]; _version: number };
type Computed = {
  unitId: string;
  periodKey: string;
  rows: UtilityChargeRow[];
  groups: GroupInternal[];
  /** แถวที่มียอดบิลจริง (ขอบเขตบิล) */
  bills: BillRow[];
  /** รายการบล็อกระดับหน่วย (ไม่ขึ้นกับกลุ่ม) — ใส่ด่านทั้ง 2 kind */
  unitBlocks: UtilityGateItem[];
  /** ขอบเขตบิลของห้อง (kind|roomId → อาคารของขอบเขต) */
  scopeOf: Map<string, string | null>;
};

const BILL_SELECT = {
  id: true,
  buildingId: true,
  kind: true,
  authorityBillSatang: true,
  authorityUnits: true,
  rateSatangPerUnit: true,
  billPhotoFileId: true,
  legalCheck: true,
  mode: true,
} as const;
const billKey = (kind: Kind, buildingId: string | null) => `${kind}|${buildingId ?? ""}`;

/** "24.50" → 2450 (พื้นที่ × 100 จำนวนเต็ม ปัดครึ่งขึ้น) · ไม่มี/เพี้ยน ⇒ 0 */
function areaE2Of(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const m = /^(\d+)(?:\.(\d+))?$/.exec(String(v).trim());
  if (!m) return 0;
  const frac = (m[2] ?? "").padEnd(3, "0");
  const base = parseInt(`${m[1]}${frac.slice(0, 2)}`, 10);
  return Number.isSafeInteger(base) ? base + (Number(frac[2]) >= 5 ? 1 : 0) : 0;
}

/** ผู้พักในห้อง (ฐาน PERSON) = 1 + ผู้พักร่วม (รูป D.5 { occupants: [] }) · รูปผิด/ไม่มีสัญญา ⇒ 1 */
function personsOf(coTenants: unknown): number {
  if (!isRec(coTenants) || !Array.isArray(coTenants.occupants)) return 1;
  return 1 + coTenants.occupants.filter((o) => isRec(o)).length;
}

const refsOf = (unitId: string, buildingId: string | null, extra?: Partial<ScopeRefs>): ScopeRefs => ({
  unitId,
  ...(buildingId ? { buildingId } : {}),
  ...(extra ?? {}),
});

/** รุ่นบิลของแถว (เพิ่มทุกครั้งที่ยอดบิล/หน่วย/รูปเปลี่ยน) — การยอมรับผูกกับรุ่นนี้ (กัน ABA) */
const versionOf = (lc: unknown): number => (isRec(lc) && isNat(lc.billVersion) ? lc.billVersion : 0);

const outcomeOf = (ruleId: LegalRuleId, o: LegalOutcome, mode: LegalMode): UtilityLegalOutcome => {
  // H4 (ผู้คุมกลับมติ §8.4): STRICT + ยังไม่รู้ต้นทุน (ไม่มีบิล) ⇒ บล็อก ยอมรับไม่ได้ · WARN ยอมรับได้ · นอกขอบเขต evaluateLegal ให้ OK แล้ว
  const strictUnknown = mode === "STRICT" && o.code === "UTIL_COST_UNKNOWN" && o.level === "WARN";
  return {
    ruleId,
    level: strictUnknown ? "BLOCK" : o.level,
    raw: o.raw,
    code: o.code,
    messageTh: strictUnknown ? `${o.messageTh} — โหมดเข้มงวดออกบิลค่าน้ำไฟได้หลังใส่บิลของงวดนี้แล้วเท่านั้น` : o.messageTh,
    needsAck: strictUnknown ? false : o.needsAck,
    needsOwnerApproval: strictUnknown ? false : o.needsOwnerApproval,
    ...(o.always ? { always: true } : {}),
  };
};

type StoredAcceptance = { byUserId: string; at: string; reason: string; fingerprint: string; billVersion: number; codes: string[] };
function storedAcceptance(lc: unknown): StoredAcceptance | null {
  if (!isRec(lc) || !isRec(lc.acceptance)) return null;
  const a = lc.acceptance;
  if (!isStr(a.byUserId) || !isStr(a.at) || typeof a.reason !== "string" || !isStr(a.fingerprint)) return null;
  return {
    byUserId: a.byUserId,
    at: a.at,
    reason: a.reason,
    fingerprint: a.fingerprint,
    billVersion: isNat(a.billVersion) ? a.billVersion : -1,
    codes: Array.isArray(a.codes) ? a.codes.filter(isStr) : [],
  };
}

/**
 * ตัวตรวจรายเดือนของกลุ่ม (§3.3) — ผ่าน evaluateLegal เท่านั้น
 * H1: ใช้ค่าตั้งที่ "คิดเงินจริงของแต่ละแถว" (_cfg รายห้อง) ไม่ใช่ค่าระดับกลุ่ม · H5: TARIFF อยู่ใต้เพดานต้นทุน
 */
function groupLegal(
  kind: Kind,
  buildingId: string | null,
  gcfg: Cfg,
  bill: BillRow | null,
  accRow: BillRow | null,
  rows: Draft[],
  chargedTotal: number,
  extra: UtilityGateItem[],
): { legal: UtilityLegalGroup; pieces: LegalPiece[] } {
  const lctx = { mode: gcfg.mode, outOfScopeReason: gcfg.reason };
  const vat = utilVat(gcfg, kind);
  const billSatang = bill?.authorityBillSatang ?? null;
  const billUnits = bill?.authorityUnits ?? null;
  const pieces: LegalPiece[] = [];
  const seen = new Set<string>();
  const run = <K extends LegalRuleId>(ruleId: K, input: LegalRuleInputs[K]) => {
    const sig = `${ruleId}|${JSON.stringify(input)}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    pieces.push({ ruleId, input, outcome: evaluateLegal(ruleId, input, lctx) });
  };
  const okRows = rows.filter((r) => r.status === "OK");

  // ค่าขั้นต่ำ: ทุกค่าที่มีผลจริง (กลุ่ม + รายแถว)
  const mins = [gcfg.minimum, ...rows.map((r) => r._cfg.minimum)];
  for (const m of [...new Set(mins)].sort((a, b) => (a ?? -1) - (b ?? -1))) run("UTIL_NO_MINIMUM", { enabled: m !== null, minSatang: m });

  // อัตราคงที่: ทุกอัตราที่แถว (หรือกลุ่ม) ใช้จริง
  const rates = new Set<number>();
  if (gcfg[kind].method === "FIXED_RATE" && gcfg[kind].fixedRate !== null) rates.add(gcfg[kind].fixedRate as number);
  for (const r of rows) if (r.method === "FIXED_RATE" && r._cfg[kind].fixedRate !== null) rates.add(r._cfg[kind].fixedRate as number);
  for (const rate of [...rates].sort((a, b) => a - b)) {
    run("UTIL_FIXED_RATE_LE_COST", { rateSatangPerUnit: rate, authorityBillSatang: billSatang, authorityUnits: billUnits, vat });
  }

  // H5 ตารางอัตรา: อัตราเฉลี่ยที่เก็บต่อหน่วย (ปัดขึ้น · แถวที่แพงสุด) ≤ ต้นทุนต่อหน่วย
  const tariffRows = okRows.filter((r) => r.method === "TARIFF" && r.units !== null && r.units > 0 && r.amountSatang !== null);
  if (tariffRows.length) {
    const maxAvg = Math.max(...tariffRows.map((r) => Math.ceil((r.amountSatang as number) / (r.units as number))));
    run("UTIL_FIXED_RATE_LE_COST", { rateSatangPerUnit: maxAvg, authorityBillSatang: billSatang, authorityUnits: billUnits, vat });
  }

  // เหมาจ่าย: แถวที่คิดเหมาจริง (ค่าเหมาเท่ากันทุกแถว ⇒ ค่าเหมา × ผู้จ่าย · ต่างกัน ⇒ ยอดรวมจริง × 1)
  const flatRows = okRows.filter((r) => r.method === "FLAT");
  if (flatRows.length) {
    const f0 = flatRows[0]._flat;
    const same = !!f0 && flatRows.every((r) => r._flat !== null && r._flat.per === f0.per && r._flat.satang === f0.satang);
    run(
      "UTIL_FLAT_LE_COST",
      same && f0
        ? { flatSatang: f0.satang, payerCount: flatRows.reduce((s, r) => s + r._payers, 0), authorityBillSatang: billSatang, vat }
        : { flatSatang: flatRows.reduce((s, r) => s + (r.amountSatang ?? 0), 0), payerCount: 1, authorityBillSatang: billSatang, vat },
    );
  } else {
    const gk = gcfg[kind];
    if (gk.method === "FLAT" && gk.flat) run("UTIL_FLAT_LE_COST", { flatSatang: gk.flat.satang, payerCount: 0, authorityBillSatang: billSatang, vat });
  }

  if (okRows.length > 0) run("UTIL_TOTAL_LE_BILL", { chargedTotalSatang: chargedTotal, authorityBillSatang: billSatang });

  const outcomes = pieces.map((p) => outcomeOf(p.ruleId, p.outcome, gcfg.mode));
  let level = outcomes.reduce<"OK" | "WARN" | "BLOCK">((w, o) => (LEVEL_RANK[o.level] > LEVEL_RANK[w] ? o.level : w), "OK");
  if (extra.length) level = "BLOCK";
  const parts: unknown[] = [gcfg.mode, ...extra.map((x) => ["EXTRA", x.code])];
  pieces.forEach((p, i) => {
    if (outcomes[i].level !== "OK") parts.push([p.ruleId, outcomes[i].code, p.input]);
  });
  const fingerprint = createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  const acc = storedAcceptance(accRow?.legalCheck);
  const accepted = !!acc && acc.fingerprint === fingerprint && acc.billVersion === versionOf(accRow?.legalCheck);
  return {
    legal: { kind, buildingId, mode: gcfg.mode, level, outcomes, fingerprint, accepted, acceptance: accepted && acc ? { byUserId: acc.byUserId, at: acc.at, reason: acc.reason } : null },
    pieces,
  };
}

const calcCode = (e: unknown): string => (e instanceof DormCalcError ? e.code : "NO_COST_BASIS");

/** มิเตอร์ห้อง kind นี้ของห้อง (ตัวแรกที่จดแล้ว · ไม่มี ⇒ ตัวแรก) */
function pickUsage(usage: PeriodUsageRow[], roomId: string, kind: Kind): PeriodUsageRow | null {
  const mine = usage.filter((u) => u.role === "ROOM" && u.roomId === roomId && u.kind === kind);
  return mine.find((u) => u.value !== null) ?? mine[0] ?? null;
}

/** H3: โหมดนอกขอบเขตแต่หน่วยอยู่ในขอบเขตตอนนี้ ⇒ ต้องมีหลักฐานไฟล์ส่วนตัวของร้านที่ยังอยู่จริง ≥ 1 */
async function scopeEvidenceOk(tenantId: string, cfg: Cfg, roomCount: number): Promise<boolean> {
  if (cfg.mode !== "OUT_OF_SCOPE") return true;
  if (!legalScope({ roomCount, businessType: cfg.businessType }).inScope) return true;
  const ids = [...new Set(cfg.evidence)].slice(0, 50);
  if (!ids.length) return false;
  const files = await tenantDb({ tenantId }).fileAsset.findMany({ where: { id: { in: ids } }, select: { path: true } });
  return files.some((f) => isPrivateStoragePath(f.path) && f.path.startsWith(`t/${tenantId}/`));
}

/** แกนคำนวณ §3.2 + §3.3 — หน่วยต้องผ่าน dormUnit มาแล้ว · คำนวณสดทุกครั้ง (ไม่มีแคชข้ามการเรียก) */
async function compute(tenantId: string, unitId: string, periodKey: string): Promise<Computed> {
  const db = tenantDb({ tenantId, unitId });
  const start = `${periodKey}-01`;
  const end = `${nextPeriod(periodKey)}-01`;
  const [roomRows, occs, allRows, usage, tableRes] = await Promise.all([
    db.hotelRoom.findMany({ where: { active: true }, select: { id: true, number: true, buildingId: true, roomTypeId: true, roomType: { select: { areaSqm: true } } } }),
    occupancyRange({ tenantId }, { unitId, start, end }),
    db.dormUtilityRate.findMany({ where: { periodKey }, select: BILL_SELECT, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    periodUsage({ tenantId }, { unitId, periodKey }),
    // ตารางของร้านมีวันที่มีผล ⇒ อ่าน ณ วันแรกของงวด (ตรงกับตารางรัฐ)
    resolveSettings({ tenantId }, ["rooms.utility.tariffTable"], { unitId }, new Date(`${start}T00:00:00+07:00`)),
  ]);
  const tariffTable = tableRes["rooms.utility.tariffTable"]?.value ?? null;

  // ห้องที่คิดเงิน = มี occupancy LEASE/STAY ซ้อนงวด · คน = จากสัญญาของ occupancy ล่าสุด · ห้องว่างยังอยู่ในฐานเฉลี่ย (H6) แต่ไม่มีแถว
  const live = occs.filter((o) => o.kind === "LEASE" || o.kind === "STAY");
  const latestOcc = new Map<string, (typeof live)[number]>();
  for (const o of live) {
    const cur = latestOcc.get(o.roomId);
    if (!cur || cur.startDate <= o.startDate) latestOcc.set(o.roomId, o);
  }
  const occIds = [...latestOcc.values()].map((o) => o.occupancyId);
  const leaseRefIds = [...latestOcc.values()].filter((o) => o.refType === "DormLease").map((o) => o.refId);
  const leases = occIds.length
    ? await db.dormLease.findMany({
        where: { OR: [{ occupancyId: { in: occIds } }, ...(leaseRefIds.length ? [{ id: { in: leaseRefIds } }] : [])] },
        select: { id: true, occupancyId: true, coTenants: true },
      })
    : [];
  const rooms: RoomRow[] = roomRows
    .map((r) => {
      const o = latestOcc.get(r.id);
      const lease = o ? leases.find((l) => l.occupancyId === o.occupancyId || (o.refType === "DormLease" && l.id === o.refId)) : undefined;
      return {
        roomId: r.id,
        number: r.number,
        buildingId: r.buildingId,
        roomTypeId: r.roomTypeId,
        charged: !!o,
        // ห้องว่าง (ฐานคน) นับ 1 ส่วน — ผู้ให้เช่าแบกส่วนนั้นเอง
        persons: o ? (lease ? personsOf(lease.coTenants) : 1) : 1,
        areaE2: areaE2Of(r.roomType?.areaSqm),
      };
    })
    .sort((a, b) => numCmp(a.number, b.number));

  // H1: ขอบเขตบิล = แถวที่มียอดบิลจริง · แถวยอมรับ/บิลว่างใช้เก็บการยอมรับเท่านั้น
  const bills = allRows.filter((b) => isKind(b.kind) && b.authorityBillSatang !== null);
  const billMap = new Map<string, BillRow>();
  for (const b of bills) if (isKind(b.kind) && !billMap.has(billKey(b.kind, b.buildingId))) billMap.set(billKey(b.kind, b.buildingId), b);
  const rowMap = new Map<string, BillRow>();
  for (const b of allRows) if (isKind(b.kind) && !rowMap.has(billKey(b.kind, b.buildingId))) rowMap.set(billKey(b.kind, b.buildingId), b);

  // ค่าตั้ง: ต่อห้องทุกห้อง active (ห้อง/ประเภท/อาคาร/หน่วย) + ต่อกลุ่ม (อาคาร|หน่วย) — อ่านครั้งเดียวต่อการเรียก
  const gbList = [...new Set<string | null>([null, ...rooms.map((r) => r.buildingId), ...allRows.map((b) => b.buildingId)])];
  const refsList: ScopeRefs[] = [
    ...gbList.map((b) => refsOf(unitId, b)),
    ...rooms.map((r) => refsOf(unitId, r.buildingId, { roomTypeId: r.roomTypeId, roomId: r.roomId })),
  ];
  const resolved = await resolveSettingsMany({ tenantId }, SETTING_KEYS, refsList);
  const groupCfg = new Map<string | null, Cfg>();
  gbList.forEach((b, i) => groupCfg.set(b, cfgOf(resolved[i])));
  const roomCfg = new Map<string, Cfg>();
  rooms.forEach((r, i) => roomCfg.set(r.roomId, cfgOf(resolved[gbList.length + i])));
  const unitCfg = groupCfg.get(null) as Cfg;

  // ระดับหน่วย: H3 ขอบเขต/หลักฐานสด · H2 บิลซ้อนขอบเขต (ข้อมูลเก่า/เขียนตรง)
  const unitBlocks: UtilityGateItem[] = [];
  if (!(await scopeEvidenceOk(tenantId, unitCfg, rooms.length))) {
    for (const k of KINDS) unitBlocks.push({ kind: k, buildingId: null, code: "LEGAL_SCOPE_EVIDENCE_MISSING", messageTh: codeTh("LEGAL_SCOPE_EVIDENCE_MISSING") });
  }
  for (const k of KINDS) {
    const mineBills = bills.filter((b) => b.kind === k);
    if (mineBills.some((b) => b.buildingId === null) && mineBills.some((b) => b.buildingId !== null)) {
      unitBlocks.push({ kind: k, buildingId: null, code: "SCOPE_CONFLICT", messageTh: codeTh("SCOPE_CONFLICT") });
    }
  }

  const scopeOf = new Map<string, string | null>();
  const scopeFor = (kind: Kind, room: RoomRow): string | null => {
    const b = room.buildingId && billMap.has(billKey(kind, room.buildingId)) ? room.buildingId : billMap.has(billKey(kind, null)) ? null : room.buildingId;
    scopeOf.set(`${kind}|${room.roomId}`, b);
    return b;
  };

  const tariffCache = new Map<string, TariffPick>();
  const tariffOf = async (kind: Kind, ref: string | null): Promise<TariffPick> => {
    const k = `${kind}|${ref ?? ""}`;
    const hit = tariffCache.get(k);
    if (hit) return hit;
    const t = await pickTariff(tariffTable, kind, ref, periodKey);
    tariffCache.set(k, t);
    return t;
  };

  // ── ผ่านที่ 1: แถวต่อห้องที่คิดเงิน × kind (FLAT · NONE · มิเตอร์ห้อง FIXED/TARIFF) ──
  const drafts: Draft[] = [];
  const groupOfRow = new Map<Draft, string | null>();
  for (const room of rooms) {
    const rc = roomCfg.get(room.roomId);
    if (!rc) continue;
    for (const kind of KINDS) {
      const scopeB = scopeFor(kind, room);
      if (!room.charged) continue;
      const kc = rc[kind];
      const d: Draft = {
        roomId: room.roomId,
        roomNumber: room.number,
        buildingId: room.buildingId,
        kind,
        metering: kc.metering,
        method: kc.method,
        status: "NONE",
        code: null,
        units: null,
        rateSatangPerUnit: null,
        amountSatang: null,
        grossSatang: null,
        weight: null,
        _flat: null,
        _payers: 0,
        _segs: null,
        _cfg: rc,
      };
      groupOfRow.set(d, scopeB);
      drafts.push(d);
      if (kc.method === "FLAT") {
        if (!kc.flat) {
          d.status = "NO_COST_BASIS";
          d.code = "RATE_MISSING";
          continue;
        }
        const persons = kc.flat.per === "PERSON" ? room.persons : 1;
        d._flat = kc.flat;
        d._payers = persons;
        d.amountSatang = utilityLine({ kind: "FLAT", method: { kind: "FLAT", per: kc.flat.per, satang: kc.flat.satang, persons } }).amountSatang;
        d.status = "OK";
        continue;
      }
      if (kc.metering === "NONE") continue; // status NONE
      if (kc.metering === "SHARED_METER") {
        d.status = "NO_COST_BASIS"; // ผ่านที่ 2 ตัดสิน
        continue;
      }
      const u = pickUsage(usage, room.roomId, kind);
      if (!u || u.value === null) {
        d.status = "NO_READING";
        continue;
      }
      if (u.held) {
        d.status = "HELD";
        continue;
      }
      if (u.units === null) {
        d.status = "HELD";
        d.code = "METER_UNREADABLE";
        continue;
      }
      d.units = u.units;
      d._segs = u.segments;
      if (kc.method === "ACTUAL_COST") {
        d.status = "NO_COST_BASIS"; // ผ่านที่ 2 (ต้องรู้จำนวนห้องที่แชร์บิล)
        continue;
      }
      try {
        if (kc.method === "FIXED_RATE") {
          if (kc.fixedRate === null) {
            d.status = "NO_COST_BASIS";
            d.code = "RATE_MISSING";
            continue;
          }
          const line = utilityLine({ kind: "METERED", segments: u.segments, method: { kind: "FIXED_RATE", satangPerUnit: kc.fixedRate }, minimumSatang: rc.minimum }, utilVat(rc, kind));
          d.amountSatang = line.amountSatang;
          d.rateSatangPerUnit = line.unitPriceSatang;
          d.status = "OK";
        } else {
          const t = await tariffOf(kind, kc.tariffRef);
          if (!t.ok) {
            d.status = "NO_COST_BASIS";
            d.code = t.code;
            continue;
          }
          const line = utilityLine({ kind: "METERED", segments: u.segments, method: { kind: "TARIFF", tiers: t.tiers, ftE4: t.ftE4 }, minimumSatang: rc.minimum }, utilVat(rc, kind));
          d.amountSatang = line.amountSatang;
          d.rateSatangPerUnit = null;
          d.status = "OK";
        }
      } catch (e) {
        d.status = "NO_COST_BASIS";
        d.code = calcCode(e);
        d.amountSatang = null;
      }
    }
  }

  // ── กลุ่ม = (kind, อาคารของขอบเขตบิล) ของแถวที่คิดเงิน + แถวบิลจริงที่ไม่มีห้องคิดเงิน ──
  const gkeys: { kind: Kind; buildingId: string | null }[] = [];
  const seenG = new Set<string>();
  const addG = (kind: Kind, b: string | null) => {
    const k = billKey(kind, b);
    if (!seenG.has(k)) {
      seenG.add(k);
      gkeys.push({ kind, buildingId: b });
    }
  };
  for (const d of drafts) addG(d.kind, groupOfRow.get(d) ?? null);
  for (const b of bills) if (isKind(b.kind)) addG(b.kind, b.buildingId);

  const groups: GroupInternal[] = [];
  for (const g of gkeys) {
    const cfg = groupCfg.get(g.buildingId) ?? unitCfg;
    const bill = billMap.get(billKey(g.kind, g.buildingId)) ?? null;
    const accRow = rowMap.get(billKey(g.kind, g.buildingId)) ?? null;
    const billSatang = bill?.authorityBillSatang ?? null;
    const billUnits = bill?.authorityUnits ?? null;
    const mine = drafts.filter((d) => d.kind === g.kind && (groupOfRow.get(d) ?? null) === g.buildingId);
    // ห้องทั้งหมดในขอบเขตนี้ (รวมห้องว่าง) กับค่าตั้งของห้องนั้น
    const members = rooms.filter((r) => (scopeOf.get(`${g.kind}|${r.roomId}`) ?? null) === g.buildingId);
    const extra: UtilityGateItem[] = unitBlocks.filter((x) => x.kind === g.kind);

    // H7: ผสมมิเตอร์ห้อง + มิเตอร์รวม ในขอบเขตบิลเดียว ⇒ บล็อกทุกโหมด
    const meterings = new Set(
      members
        .map((r) => roomCfg.get(r.roomId)?.[g.kind])
        .filter((k): k is KindCfg => !!k && k.method !== "FLAT" && k.metering !== "NONE")
        .map((k) => k.metering),
    );
    if (meterings.has("ROOM_METER") && meterings.has("SHARED_METER")) {
      extra.push({ kind: g.kind, buildingId: g.buildingId, code: "CFG_DOUBLE_METER", messageTh: codeTh("CFG_DOUBLE_METER") });
    }

    // ── ผ่านที่ 2a: มิเตอร์ห้อง ต้นทุนจริง (billedRooms = แถวที่มีหน่วยของกลุ่ม) ──
    const actual = mine.filter((d) => d.metering === "ROOM_METER" && d.method === "ACTUAL_COST" && d.units !== null && d._segs !== null);
    for (const d of actual) {
      if (billSatang === null || billUnits === null) {
        d.code = "BILL_MISSING";
        continue;
      }
      try {
        const line = utilityLine(
          { kind: "METERED", segments: d._segs ?? [], method: { kind: "ACTUAL_COST", billSatang, billUnits, billedRooms: actual.length }, minimumSatang: d._cfg.minimum },
          utilVat(d._cfg, d.kind),
        );
        d.amountSatang = line.amountSatang;
        d.rateSatangPerUnit = line.unitPriceSatang;
        d.status = "OK";
      } catch (e) {
        d.code = calcCode(e);
      }
    }

    // ── ผ่านที่ 2b: มิเตอร์รวม (H6) — ฐานเฉลี่ย = ทุกห้องมิเตอร์รวมในขอบเขตบิล (รวมห้องว่าง) · ส่วนของห้องว่างผู้ให้เช่าแบก ──
    const shared = mine.filter((d) => d.method !== "FLAT" && d.metering === "SHARED_METER");
    let allocated: number | null = null;
    let landlord: number | null = null;
    if (shared.length) {
      if (billSatang === null) {
        for (const d of shared) d.code = "BILL_MISSING";
      } else {
        const basis = cfg.sharedBasis;
        const part = members.filter((r) => {
          const k = roomCfg.get(r.roomId)?.[g.kind];
          return !!k && k.method !== "FLAT" && k.metering === "SHARED_METER";
        });
        const weightOf = (r: RoomRow) => (basis === "ROOM" ? 1 : basis === "PERSON" ? r.persons : r.areaE2);
        const charged = new Set(shared.map((d) => d.roomId));
        // n = ห้องที่มีน้ำหนักในขอบเขตบิล (รวมห้องว่าง) — หลักเดียวกับ actualCostRate (กรณีเลวสุด)
        const n = part.filter((r) => weightOf(r) > 0).length;
        const nCharged = part.filter((r) => charged.has(r.roomId) && weightOf(r) > 0).length;
        const W = part.reduce((s, r) => s + weightOf(r), 0);
        if (nCharged === 0 || W <= 0) {
          for (const d of shared) d.code = "NO_ALLOCATION_BASIS";
        } else {
          const vat = utilVat(cfg, g.kind);
          let T = billSatang;
          if (vat && vat.registered && !vat.pricesIncludeVat) {
            // ถอด VAT จากบิล + เผื่อเศษครึ่งสตางค์ต่อแถวที่เรียกเก็บ (หลักเดียวกับ actualCostRate ของ D.1) ⇒ Σ ที่ผู้เช่าจ่ายจริง ≤ บิล
            const x = billSatang * 100 - 50 * n;
            T = x <= 0 ? 0 : (x - (x % 107)) / 107;
          }
          try {
            const parts = allocateShared({
              totalSatang: T,
              basis,
              rooms: part.map((r) => ({ roomId: r.roomId, persons: basis === "PERSON" ? weightOf(r) : undefined, areaSqmE2: basis === "AREA" ? weightOf(r) : undefined })),
            });
            allocated = T;
            landlord = parts.filter((p) => !charged.has(p.roomId)).reduce((sum, p) => sum + p.amountSatang, 0);
            const byRoom = new Map(parts.map((p, i) => [p.roomId, { amount: p.amountSatang, weight: weightOf(part[i]) }]));
            for (const d of shared) {
              const p = byRoom.get(d.roomId);
              if (!p) {
                d.code = "NO_ALLOCATION_BASIS";
                continue;
              }
              d.amountSatang = p.amount;
              d.weight = p.weight;
              d.status = "OK";
              d.code = null;
            }
          } catch (e) {
            for (const d of shared) d.code = calcCode(e);
          }
        }
      }
    }

    // ── gross + ยอดรวม + ตัวตรวจ ──
    for (const d of mine) d.grossSatang = d.status === "OK" && d.amountSatang !== null ? grossOf(d._cfg, d.kind, d.amountSatang) : null;
    const okRows = mine.filter((d) => d.status === "OK");
    const chargedTotal = okRows.reduce((s, d) => s + (d.grossSatang ?? 0), 0);
    const { legal } = groupLegal(g.kind, g.buildingId, cfg, bill, accRow, mine, chargedTotal, extra);
    // วิธีวัด/คิดที่รายงาน = ของห้องในกลุ่มถ้าเหมือนกันทุกห้อง · ไม่งั้น "MIXED"
    const ms = new Set(mine.map((d) => d.metering));
    const mm = new Set(mine.map((d) => d.method));
    groups.push({
      kind: g.kind,
      buildingId: g.buildingId,
      metering: ms.size === 1 ? [...ms][0] : ms.size === 0 ? cfg[g.kind].metering : "MIXED",
      method: mm.size === 1 ? [...mm][0] : mm.size === 0 ? cfg[g.kind].method : "MIXED",
      billSatang,
      billUnits,
      costRateSatangPerUnit: bill?.rateSatangPerUnit ?? null,
      chargedRooms: okRows.length,
      chargedTotalSatang: chargedTotal,
      allocatedSatang: allocated,
      landlordShareSatang: landlord,
      legal,
      _scopeRow: accRow,
      _cfg: cfg,
      _extra: extra,
      _version: versionOf(accRow?.legalCheck),
    });
  }

  // แถวที่ยังค้าง NO_COST_BASIS โดยไม่มีโค้ด (กันหลุด) ⇒ BILL_MISSING
  for (const d of drafts) if (d.status === "NO_COST_BASIS" && !d.code) d.code = "BILL_MISSING";

  const rows: UtilityChargeRow[] = drafts
    .sort((a, b) => numCmp(a.roomNumber, b.roomNumber) || (a.kind === b.kind ? 0 : a.kind === "ELEC" ? -1 : 1))
    .map((d) => ({
      roomId: d.roomId,
      roomNumber: d.roomNumber,
      buildingId: d.buildingId,
      kind: d.kind,
      metering: d.metering,
      method: d.method,
      status: d.status,
      code: d.status === "OK" || d.status === "NONE" ? null : d.code,
      units: d.status === "OK" && d.metering === "ROOM_METER" && d.method !== "FLAT" ? d.units : null,
      rateSatangPerUnit: d.status === "OK" ? d.rateSatangPerUnit : null,
      amountSatang: d.status === "OK" ? d.amountSatang : null,
      grossSatang: d.status === "OK" ? d.grossSatang : null,
      weight: d.status === "OK" ? d.weight : null,
    }));
  groups.sort((a, b) => (a.kind === b.kind ? (a.buildingId ?? "").localeCompare(b.buildingId ?? "") : a.kind === "ELEC" ? -1 : 1));
  return { unitId, periodKey, rows, groups, bills, unitBlocks, scopeOf };
}

const publicGroup = (g: GroupInternal): UtilityGroup => ({
  kind: g.kind,
  buildingId: g.buildingId,
  metering: g.metering,
  method: g.method,
  billSatang: g.billSatang,
  billUnits: g.billUnits,
  costRateSatangPerUnit: g.costRateSatangPerUnit,
  chargedRooms: g.chargedRooms,
  chargedTotalSatang: g.chargedTotalSatang,
  allocatedSatang: g.allocatedSatang,
  landlordShareSatang: g.landlordShareSatang,
  legal: g.legal,
});

/** รูป legalCheck (§3.3) — คงรุ่นบิลและการยอมรับเดิมไว้ (มีผลเฉพาะ fingerprint + รุ่นตรง) */
function legalCheckJson(g: GroupInternal, prev: unknown, acceptance: StoredAcceptance | null, now: Date): Prisma.InputJsonValue {
  const out: Record<string, unknown> = {
    v: 1,
    checkedAt: now.toISOString(),
    mode: g.legal.mode,
    level: g.legal.level,
    outcomes: g.legal.outcomes.map((o) => ({ ruleId: o.ruleId, code: o.code, level: o.level, raw: o.raw })),
    fingerprint: g.legal.fingerprint,
    billVersion: versionOf(prev),
  };
  if (acceptance) out.acceptance = acceptance;
  return out as Prisma.InputJsonValue;
}

/** กลุ่ม (kind, อาคารของขอบเขตบิล) ของผลคำนวณ */
function findGroup(c: Computed, kind: Kind, buildingId: string | null): GroupInternal | null {
  return c.groups.find((g) => g.kind === kind && g.buildingId === buildingId) ?? null;
}

/** บิลขอบเขตอื่นของ (kind, งวด) ที่มียอดบิลอยู่แล้ว (H2: ทั้งหน่วย ⟷ รายอาคาร ห้ามซ้อน) */
async function conflictingScope(db: Tx, tenantId: string, unitId: string, kind: Kind, periodKey: string, buildingId: string | null): Promise<boolean> {
  const n = await db.dormUtilityRate.count({
    where: { tenantId, unitId, kind, periodKey, authorityBillSatang: { not: null }, buildingId: buildingId === null ? { not: null } : null },
  });
  return n > 0;
}

// ───────────────────────── ตัวแปลงบาท (หน้า/action ใช้ตัวนี้ตัวเดียว · H9) ─────────────────────────
const BAHT_RE = /^(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{1,2})?$/;
/** "19,824.00" → 1982400 สตางค์ ด้วยข้อความ/จำนวนเต็มล้วน — จุลภาคต้องคั่นหลักพันถูกตำแหน่ง ("1,23" ⇒ null) · ทศนิยม ≤ 2 ตำแหน่ง · ≤ ฿99,999,999.99 */
export function parseBahtToSatang(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!BAHT_RE.test(t)) return null;
  const [whole, frac = ""] = t.replace(/,/g, "").split(".");
  if (whole.length > 8) return null;
  const n = parseInt(`${whole}${frac.padEnd(2, "0")}`, 10);
  return Number.isSafeInteger(n) ? n : null;
}

// ───────────────────────── 3.1 ใส่บิลการไฟฟ้า/ประปา ─────────────────────────
export async function recordAuthorityBill(
  ctx: UtilityCtx,
  input: { unitId: string; kind: Kind; periodKey: string; buildingId?: string | null; billSatang: number; units?: number | null; photo?: { data: Uint8Array; contentType: string } | null },
  deps?: UtilityDeps,
): Promise<RecordAuthorityBillResult> {
  const tenantId = ctx?.tenantId;
  // H9: ตรวจทุกค่าก่อนเขียน/อัปไฟล์
  if (!isRec(input)) return fail("INVALID_INPUT", "ข้อมูลบิลไม่ครบ");
  const { kind, periodKey, billSatang } = input;
  if (!isKind(kind)) return fail("INVALID_INPUT", "ชนิดบิลต้องเป็นค่าไฟฟ้าหรือค่าน้ำประปา");
  if (!periodOk(periodKey)) return fail("INVALID_INPUT", "งวดของบิลต้องเป็นรูปแบบ ปี-เดือน เช่น 2026-10");
  if (!periodInRange(periodKey)) return fail("BAD_PERIOD", "งวดของบิลต้องอยู่ระหว่าง 2020-01 ถึงเดือนหน้า");
  if (!isNat(billSatang) || billSatang > MAX_BILL_SATANG) return fail("INVALID_INPUT", "ยอดบิลต้องเป็นจำนวนเงินไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง และไม่เกิน ฿10,000,000");
  const unitsIn = input.units;
  if (unitsIn !== undefined && unitsIn !== null && !(isNat(unitsIn) && unitsIn > 0 && unitsIn <= MAX_INT4)) {
    return fail("INVALID_INPUT", "หน่วยรวมในบิลต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 2,147,483,647");
  }
  const bIn = input.buildingId;
  if (bIn !== undefined && bIn !== null && !isStr(bIn)) return fail("INVALID_INPUT", "อาคารที่ระบุไม่ถูกต้อง");
  const buildingId: string | null = isStr(bIn) ? bIn : null;

  const unit = await dormUnit(tenantId, input.unitId);
  if (!unit) return NOT_FOUND();
  const unitId = unit.id;
  const db = tenantDb({ tenantId, unitId });
  if (buildingId) {
    const b = await db.roomBuilding.findFirst({ where: { id: buildingId }, select: { id: true } });
    if (!b) return NOT_FOUND();
  }

  // หน่วยรวม: จากบิล หรือมิเตอร์ MAIN kind เดียวกันของอาคารเดียวกัน (จดแล้ว · ไม่พัก)
  let units: number;
  let unitsSource: "BILL" | "MAIN_METER";
  if (isNat(unitsIn) && unitsIn > 0) {
    units = unitsIn;
    unitsSource = "BILL";
  } else {
    const [meters, usage] = await Promise.all([listMeters({ tenantId }, { unitId }), periodUsage({ tenantId }, { unitId, periodKey })]);
    const mains = meters.filter((m) => m.role === "MAIN" && m.kind === kind && (m.buildingId ?? null) === buildingId);
    const rows = mains.map((m) => usage.find((u) => u.meterId === m.meterId) ?? null);
    const ok = rows.length > 0 && rows.every((r) => r !== null && r.units !== null && !r.held);
    const sum = ok ? rows.reduce((s, r) => s + (r?.units ?? 0), 0) : 0;
    if (!ok || sum <= 0) return fail("UNITS_UNKNOWN", "ยังไม่รู้หน่วยรวมของบิลนี้ — กรอกหน่วยตามบิล หรือจดมิเตอร์รวมของอาคารงวดนี้ก่อน");
    if (sum > MAX_INT4) return fail("IMPLAUSIBLE_BILL", "หน่วยรวมจากมิเตอร์รวมมากผิดปกติ — กรอกหน่วยตามบิลแทน");
    units = sum;
    unitsSource = "MAIN_METER";
  }
  // ต้นทุนจริงต่อหน่วย (มติ §8 ข้อ 1) = บิล ÷ หน่วย ปัดลง — ไม่ส่ง vat (ค่าที่แสดง/เก็บ)
  const cost = actualCostRate({ billSatang, units });
  if (cost === null || cost < COST_MIN || cost > COST_MAX) {
    return fail("IMPLAUSIBLE_BILL", "ต้นทุนต่อหน่วยที่ได้จากบิลผิดปกติ (ต้องอยู่ระหว่าง ฿0.01 ถึง ฿100.00 ต่อหน่วย) — ตรวจยอดบิลและหน่วยรวมอีกครั้ง");
  }
  // H2: ขอบเขตบิลซ้อน (ทั้งหน่วย ⟷ รายอาคาร) ⇒ ไม่เขียนอะไร (ตรวจก่อนอัปรูป แล้วตรวจซ้ำใต้ล็อก)
  const SCOPE_FAIL = fail("SCOPE_CONFLICT", "งวดนี้มีบิลอีกแบบอยู่แล้ว (ทั้งหน่วย กับ รายอาคาร ใช้ร่วมกันไม่ได้) — แก้บิลเดิมหรือเลือกขอบเขตเดียวกัน");
  if (await conflictingScope(db as unknown as Tx, tenantId, unitId, kind, periodKey, buildingId)) return SCOPE_FAIL;

  const gcfg = cfgOf((await resolveSettingsMany({ tenantId }, SETTING_KEYS, [refsOf(unitId, buildingId)]))[0]);
  const method = gcfg[kind].method;

  // รูปบิล (X10): ไฟล์ส่วนตัว · อัปหลังผ่านตรวจทุกค่าแล้ว · อัปไม่สำเร็จ = เก็บบิลต่อ
  let photoFileId: string | null = null;
  const photo = input.photo;
  if (photo && photo.data instanceof Uint8Array && photo.data.length > 0 && typeof photo.contentType === "string") {
    try {
      const up = await uploadFile(
        { tenantId },
        { kind: "ATTACHMENT", filename: "utility-bill.jpg", contentType: photo.contentType, data: photo.data, visibility: "private" },
        deps?.put ? { put: deps.put } : undefined,
      );
      if (up.ok) photoFileId = up.assetId;
    } catch (e) {
      await logOps("WARN", "dorm.utility", "อัปรูปบิลค่าน้ำไฟไม่สำเร็จ (เก็บบิลต่อ)", { tenantId, detail: e instanceof Error ? e.name : "error" });
    }
  }

  type W =
    | { status: "CONFLICT" }
    | { status: "CREATED" | "UPDATED" | "UNCHANGED"; id: string; version: number; before: { billSatang: number | null; units: number | null; rateSatangPerUnit: number | null; hasPhoto: boolean } | null };
  const key = lockKey(unitId, kind, periodKey);
  let w: W | null = null;
  for (let attempt = 0; attempt < 3 && !w; attempt++) {
    try {
      w = await runTx(tenantId, unitId, async (tx): Promise<W> => {
        await advisoryLock(tx, key);
        if (await conflictingScope(tx, tenantId, unitId, kind, periodKey, buildingId)) return { status: "CONFLICT" };
        const cur = await tx.dormUtilityRate.findFirst({ where: { tenantId, unitId, buildingId, kind, periodKey }, select: BILL_SELECT });
        if (!cur) {
          const row = await tx.dormUtilityRate.create({
            data: {
              tenantId,
              unitId,
              buildingId,
              kind,
              periodKey,
              mode: method,
              authorityBillSatang: billSatang,
              authorityUnits: units,
              rateSatangPerUnit: cost,
              enteredById: ctx.actorUserId ?? null,
              billPhotoFileId: photoFileId,
              legalCheck: { v: 1, billVersion: 1 },
            },
            select: { id: true },
          });
          return { status: "CREATED", id: row.id, version: 1, before: null };
        }
        if (cur.authorityBillSatang === billSatang && cur.authorityUnits === units && !photoFileId) return { status: "UNCHANGED", id: cur.id, version: versionOf(cur.legalCheck), before: null };
        // รุ่นบิล +1 ใน tx เดียวกับยอดใหม่ ⇒ การยอมรับเดิมไม่มีผลแม้ยอดกลับเป็นค่าเดิม (กัน ABA)
        const version = versionOf(cur.legalCheck) + 1;
        const lc = { ...(isRec(cur.legalCheck) ? cur.legalCheck : {}), billVersion: version } as Prisma.InputJsonValue;
        await tx.dormUtilityRate.update({
          where: { id: cur.id, tenantId, unitId },
          data: {
            authorityBillSatang: billSatang,
            authorityUnits: units,
            rateSatangPerUnit: cost,
            mode: method,
            enteredById: ctx.actorUserId ?? null,
            legalCheck: lc,
            ...(photoFileId ? { billPhotoFileId: photoFileId } : {}),
          },
        });
        return {
          status: "UPDATED",
          id: cur.id,
          version,
          before: { billSatang: cur.authorityBillSatang, units: cur.authorityUnits, rateSatangPerUnit: cur.rateSatangPerUnit, hasPhoto: !!cur.billPhotoFileId },
        };
      });
    } catch (e) {
      // ผู้เขียนอีกทางชนะดัชนี unique (ไม่ผ่านล็อกเดียวกัน) ⇒ อ่านแถวผู้ชนะในรอบถัดไป
      if (!isUniqueViolation(e) || attempt === 2) throw e;
    }
  }
  if (!w) throw new Error("[dorm.utility] บันทึกบิลไม่สำเร็จ");
  if (w.status === "CONFLICT") return SCOPE_FAIL;
  const done = w;

  if (done.status === "UPDATED") {
    await writeAudit({
      tenantId,
      actorId: ctx.actorUserId ?? null,
      action: "dorm.utility.bill.updated",
      targetType: "DormUtilityRate",
      targetId: done.id,
      before: { unitId, buildingId, kind, periodKey, ...done.before },
      after: { unitId, buildingId, kind, periodKey, billSatang, units, rateSatangPerUnit: cost, hasPhoto: !!photoFileId || !!done.before?.hasPhoto, billVersion: done.version },
    });
  }

  // ตัวตรวจของกลุ่ม (ไม่บล็อกการใส่บิล) — เก็บผลลง legalCheck เฉพาะเมื่อแถวเปลี่ยน และรุ่นบิลยังเป็นรุ่นที่เพิ่งเขียน
  const c = await compute(tenantId, unitId, periodKey);
  const g = findGroup(c, kind, buildingId);
  if (!g) throw new Error("[dorm.utility] ไม่พบกลุ่มของบิลที่เพิ่งบันทึก");
  if (done.status !== "UNCHANGED") {
    await runTx(tenantId, unitId, async (tx) => {
      await advisoryLock(tx, key);
      const cur = await tx.dormUtilityRate.findFirst({ where: { id: done.id, tenantId, unitId }, select: { legalCheck: true } });
      if (!cur || versionOf(cur.legalCheck) !== done.version) return; // มีการเขียนใหม่กว่าแล้ว — ไม่ทับ
      await tx.dormUtilityRate.update({
        where: { id: done.id, tenantId, unitId },
        data: { legalCheck: legalCheckJson(g, cur.legalCheck, storedAcceptance(cur.legalCheck), deps?.now ?? new Date()) },
      });
    });
  }
  return { ok: true, rateId: done.id, status: done.status, units, unitsSource, costRateSatangPerUnit: cost, legal: g.legal };
}

// ───────────────────────── 3.2 ค่าน้ำไฟทุกโหมด ─────────────────────────
export async function utilityCharges(ctx: UtilityCtx, input: { unitId: string; periodKey: string }, opts?: UtilityClockOpts): Promise<UtilityCharges> {
  const periodKey = isRec(input) && typeof input.periodKey === "string" ? input.periodKey : "";
  const empty: UtilityCharges = { periodKey, rows: [], groups: [] };
  if (!periodOk(periodKey) || !periodInRange(periodKey, opts?.now)) return empty;
  const unit = await dormUnit(ctx?.tenantId, isRec(input) ? input.unitId : null);
  if (!unit) return empty;
  const c = await compute(ctx.tenantId, unit.id, periodKey);
  return { periodKey, rows: c.rows, groups: c.groups.map(publicGroup) };
}

// ───────────────────────── 3.4 ด่านก่อนออกบิล ─────────────────────────
function gateOf(c: Computed): UtilityGate {
  const blocks: UtilityGateItem[] = [];
  const needs: UtilityGateItem[] = [];
  const seen = new Set<string>();
  const push = (arr: UtilityGateItem[], it: UtilityGateItem) => {
    const k = `${arr === blocks ? "B" : "N"}|${it.kind}|${it.buildingId ?? ""}|${it.code}|${it.ruleId ?? ""}`;
    if (seen.has(k)) return;
    seen.add(k);
    arr.push(it);
  };
  // ระดับหน่วย (H2/H3) — บล็อกทุก kind แม้ยังไม่มีกลุ่ม
  for (const x of c.unitBlocks) push(blocks, x);
  for (const g of c.groups) {
    for (const x of g._extra) push(blocks, x);
    for (const o of g.legal.outcomes) {
      if (o.level === "BLOCK") push(blocks, { kind: g.kind, buildingId: g.buildingId, code: o.code, messageTh: o.messageTh, ruleId: o.ruleId });
      else if (o.level === "WARN" && !g.legal.accepted) push(needs, { kind: g.kind, buildingId: g.buildingId, code: o.code, messageTh: o.messageTh, ruleId: o.ruleId });
    }
  }
  // ไม่มีฐานคิด = ออกบิลไม่ได้ทุกโหมด (แม้นอกขอบเขต) — อาคารของรายการ = ขอบเขตบิลที่แถวใช้
  for (const r of c.rows) {
    if (r.status !== "NO_COST_BASIS" || !r.code) continue;
    push(blocks, { kind: r.kind, buildingId: c.scopeOf.get(`${r.kind}|${r.roomId}`) ?? r.buildingId, code: r.code, messageTh: codeTh(r.code) });
  }
  return { ok: blocks.length === 0 && needs.length === 0, blocks, needsAcceptance: needs, groups: c.groups.map(publicGroup) };
}

export async function utilityBillingGate(ctx: UtilityCtx, input: { unitId: string; periodKey: string }, opts?: UtilityClockOpts): Promise<UtilityGate | Fail> {
  if (!isRec(input) || !periodOk(input.periodKey)) return fail("INVALID_INPUT", "งวดต้องเป็นรูปแบบ ปี-เดือน เช่น 2026-10");
  if (!periodInRange(input.periodKey, opts?.now)) return fail("BAD_PERIOD", "งวดต้องอยู่ระหว่าง 2020-01 ถึงเดือนหน้า");
  const unit = await dormUnit(ctx?.tenantId, input.unitId);
  if (!unit) return NOT_FOUND();
  return gateOf(await compute(ctx.tenantId, unit.id, input.periodKey));
}

// ───────────────────────── 3.5 ยอมรับคำเตือนรายเดือน (เจ้าของเท่านั้น) ─────────────────────────
/** เจ้าของกิจการจาก Membership สด (role OWNER · ตอบรับคำเชิญแล้ว) — ไม่เชื่อบทบาทที่ผู้เรียกส่งมา */
export async function isLiveOwner(tenantId: string, userId: unknown): Promise<boolean> {
  if (!isStr(tenantId) || !isStr(userId)) return false;
  const m = await globalDb().membership.findFirst({ where: { tenantId, userId, role: "OWNER", acceptedAt: { not: null } }, select: { id: true } });
  return !!m;
}

export type AcceptDeps = {
  /** ทดสอบการแข่ง: เรียกหลังคำนวณรอบแรก ก่อนตรวจซ้ำใต้ล็อกแล้วเขียน (ข้อสอบ STALE) — ห้ามถือล็อกขณะเรียก (ผู้เรียกอาจใส่บิล) */
  beforeCommit?: () => Promise<void>;
};

export async function acceptUtilityLegalWarn(
  ctx: UtilityCtx,
  input: { unitId: string; periodKey: string; kind: Kind; buildingId?: string | null; reason: string; fingerprint?: string | null },
  deps?: AcceptDeps,
): Promise<{ ok: true; fingerprint: string } | Fail> {
  if (!isRec(input) || !isKind(input.kind) || !periodOk(input.periodKey)) return fail("INVALID_INPUT", "ข้อมูลที่ส่งมาไม่ถูกต้อง");
  if (!periodInRange(input.periodKey)) return fail("BAD_PERIOD", "งวดต้องอยู่ระหว่าง 2020-01 ถึงเดือนหน้า");
  const bIn = input.buildingId;
  if (bIn !== undefined && bIn !== null && !isStr(bIn)) return fail("INVALID_INPUT", "อาคารที่ระบุไม่ถูกต้อง");
  const buildingId: string | null = isStr(bIn) ? bIn : null;
  const unit = await dormUnit(ctx?.tenantId, input.unitId);
  if (!unit) return NOT_FOUND();
  const tenantId = ctx.tenantId;
  const actor = ctx.actorUserId;
  if (!isStr(actor) || !(await isLiveOwner(tenantId, actor))) return fail("OWNER_ONLY", "การยอมรับคำเตือนตามกฎหมายทำได้เฉพาะเจ้าของกิจการ — รอเจ้าของยืนยัน");

  const unitId = unit.id;
  const { kind, periodKey } = input;
  const c = await compute(tenantId, unitId, periodKey);
  const g = findGroup(c, kind, buildingId);
  if (!g) return NOT_FOUND();
  if (g.legal.level === "BLOCK") return fail("LEGAL_BLOCK", "มีรายการที่ผิดกฎหมายหรือออกบิลไม่ได้ในโหมดนี้ ยอมรับข้ามไม่ได้ — แก้อัตรา/ค่าตั้ง/บิลให้ถูกต้องก่อน");
  if (g.legal.level === "OK") return fail("NOTHING_TO_ACCEPT", "งวดนี้ผ่านตัวตรวจแล้ว ไม่มีคำเตือนให้ยอมรับ");
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!isValidOutOfScopeReason(reason)) return fail("REASON_REQUIRED", "กรุณาระบุเหตุผลการยอมรับอย่างน้อย 10 ตัวอักษร");
  const STALE = fail("STALE", "ข้อมูลของงวดนี้เปลี่ยนระหว่างยอมรับ (บิล/อัตรา/เลขมิเตอร์) — โหลดหน้าใหม่แล้วตรวจอีกครั้งก่อนยอมรับ");
  if (isStr(input.fingerprint) && input.fingerprint !== g.legal.fingerprint) return STALE;

  const fingerprint = g.legal.fingerprint;
  const codes = g.legal.outcomes.filter((o) => o.level !== "OK").map((o) => o.code);
  const now = new Date();
  const key = lockKey(unitId, kind, periodKey);
  if (deps?.beforeCommit) await deps.beforeCommit();
  let res: "WROTE" | "ALREADY" | "STALE" = "STALE";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await runTx(tenantId, unitId, async (tx) => {
        await advisoryLock(tx, key);
        // คำนวณซ้ำใต้ล็อก (ผู้เขียนบิลถูกกันไว้) — fingerprint/รุ่นบิลต้องเท่าที่เจ้าของยอมรับ ไม่งั้น STALE
        const g2 = findGroup(await compute(tenantId, unitId, periodKey), kind, buildingId);
        if (!g2 || g2.legal.fingerprint !== fingerprint || g2._version !== g._version || g2.legal.level !== "WARN") return "STALE";
        const cur = await tx.dormUtilityRate.findFirst({ where: { tenantId, unitId, buildingId, kind, periodKey }, select: { id: true, legalCheck: true } });
        const version = versionOf(cur?.legalCheck);
        const prev = storedAcceptance(cur?.legalCheck);
        if (prev && prev.fingerprint === fingerprint && prev.billVersion === version) return "ALREADY";
        const acceptance: StoredAcceptance = { byUserId: actor, at: now.toISOString(), reason, fingerprint, billVersion: version, codes };
        const lc = legalCheckJson(g2, cur?.legalCheck ?? null, acceptance, now);
        if (!cur) {
          // ยังไม่มีแถวของขอบเขตนี้ (WARN + ยังไม่มีบิล) ⇒ สร้างแถวบิลว่างเก็บการยอมรับ (ไม่สร้างขอบเขตบิล — H1)
          await tx.dormUtilityRate.create({ data: { tenantId, unitId, buildingId, kind, periodKey, mode: g2._cfg[kind].method, legalCheck: lc } });
        } else {
          await tx.dormUtilityRate.update({ where: { id: cur.id, tenantId, unitId }, data: { legalCheck: lc } });
        }
        return "WROTE";
      });
      break;
    } catch (e) {
      if (!isUniqueViolation(e) || attempt === 2) throw e;
    }
  }
  if (res === "STALE") return STALE;
  if (res === "WROTE") {
    await writeAudit({
      tenantId,
      actorId: actor,
      action: "dorm.utility.legal_accepted",
      targetType: "DormUtilityRate",
      targetId: `${unitId}:${buildingId ?? "-"}:${kind}:${periodKey}`,
      after: { unitId, kind, buildingId, periodKey, codes, fingerprint, billVersion: g._version, reason },
    });
  }
  return { ok: true, fingerprint };
}
