// QC SVC D.1 — กฎหมาย สคบ. 2568 (ตัวตรวจ × 3 โหมด) + สูตรเงินหอ (pure · สตางค์ล้วน)
// ใบสั่ง: ledger/svc-briefs/svc-brief-d.1.md · แถวใบ: ledger/SVC-MASTER-PLAN.md D.1
// รัน: bash scripts/iso.sh pnpm exec tsx scripts/qc-svc-d.1.mts   (ไม่ใช้ DB)
//
// ⚠️ Oracle ภายใต้ change control — ผู้คุม (Fable) เป็นเจ้าของ · Builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// fail-before: ยังไม่มี legal/th-rental-2568.ts และ modules/dorm/calc.ts ⇒ ทุกข้อแดงด้วยเหตุ "โมดูลยังไม่มี"
//              ส่วน defs/rooms.ts พึ่ง R0.3 (registry) ⇒ SKIP พร้อมเหตุผลจนกว่า R0.3 ลง
// pass-after: builder ทำตามใบสั่ง ⇒ เขียวครบ (SKIP ได้เฉพาะส่วน defs ก่อน R0.3)
//
// ที่มาตัวเลข: ledger/design-dorm/README.md + ภาพ 01 03 04 06 07 10 14 17
//   fixture 31 ห้อง: ภาพ 04 ให้ครบเฉพาะ 201–206 · 309 · ภาพ 06 ให้ยอด 104 · ที่เหลือ src:"fixture" = ผู้คุมแต่ง
//   ให้ตรงทุกยอดรวมบนจอ (ไฟ 3,720 หน่วย · น้ำ 198 · ค่าปรับ 2×฿200 · 24/3/4 กลุ่ม · ต้นทุนหอแบก ฿2,937.60)

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

// ─────────────────── โครงผล ───────────────────
type Status = "PASS" | "FAIL" | "SKIP";
const results: { id: string; name: string; status: Status; detail: string }[] = [];
class Missing extends Error {}
class AssertFail extends Error {}

const fmt = (v: unknown): string => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};
function check(id: string, name: string, fn: () => void): void {
  try {
    fn();
    results.push({ id, name, status: "PASS", detail: "" });
    console.log(`  ✅ [${id}] ${name}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ id, name, status: "FAIL", detail: msg });
    console.log(`  ❌ [${id}] ${name} — ${msg}`);
  }
}
function skip(id: string, name: string, reason: string): void {
  results.push({ id, name, status: "SKIP", detail: reason });
  console.log(`  ⏭️  [${id}] ${name} — SKIP: ${reason}`);
}
function eq(actual: unknown, expected: unknown, label: string): void {
  if (!isDeepStrictEqual(actual, expected)) throw new AssertFail(`${label}: คาด ${fmt(expected)} ได้ ${fmt(actual)}`);
}
function ok(cond: boolean, label: string): void {
  if (!cond) throw new AssertFail(label);
}
function throwsCode(fn: () => unknown, code: string, label: string): void {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
    if (e instanceof Missing) throw e;
    const c = typeof e === "object" && e !== null && "code" in e ? (e as { code: unknown }).code : undefined;
    const isErr = e instanceof Error;
    if (!isErr || c !== code) throw new AssertFail(`${label}: ต้อง throw DormCalcError code=${code} ได้ ${fmt(c)} (${isErr ? e.message : String(e)})`);
  }
  if (!threw) throw new AssertFail(`${label}: ต้อง throw code=${code} แต่ไม่ throw`);
}
const hasThai = (s: unknown): boolean => typeof s === "string" && /[฀-๿]/.test(s);
function allInts(x: unknown, path = "$"): string | null {
  if (typeof x === "number") return Number.isInteger(x) ? null : `${path}=${x}`;
  if (Array.isArray(x)) {
    for (let i = 0; i < x.length; i++) {
      const r = allInts(x[i], `${path}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  if (typeof x === "object" && x !== null) {
    for (const [k, v] of Object.entries(x)) {
      const r = allInts(v, `${path}.${k}`);
      if (r) return r;
    }
  }
  return null;
}

// ─────────────────── สัญญา (ชนิดในข้อสอบเอง — ไม่ผูก type ของ builder · ตรงใบสั่ง §2–§3) ───────────────────
type LegalMode = "STRICT" | "WARN" | "OUT_OF_SCOPE";
type LegalLevel = "OK" | "WARN" | "BLOCK";
type LegalVerdict = { level: LegalLevel; code: string; messageTh: string; citation: string; always?: boolean };
type LegalOutcome = LegalVerdict & { raw: LegalLevel; mode: LegalMode; needsAck: boolean; needsOwnerApproval: boolean };
type LegalCtx = { mode: LegalMode; outOfScopeReason?: string | null; params?: Record<string, unknown> };
type LegalApi = {
  evaluateLegal: (rule: string, input: unknown, ctx: LegalCtx) => LegalOutcome;
  TH_RENTAL_2568_RULES: Record<string, unknown>;
  TH_RENTAL_2568_PARAMS: Record<string, { value: unknown; review: string; noteTh: string }>;
  legalScope: (f: { roomCount: number; businessType: string }) => {
    inScope: boolean;
    code: string;
    defaultMode: LegalMode;
    autoReasonTh: string | null;
  };
  leaseKind: (months: number) => "SHORT" | "LONG" | null;
  FORBIDDEN_TERMS: readonly string[];
  findForbiddenTerms: (text: string) => string[];
  MANDATORY_CLAUSES: readonly { id: string; titleTh: string; textTh: string }[];
};

type TaxKind = "EXEMPT" | "VAT7" | "NONE";
type MeterSegment = { start: number; end: number; rolloverDigits?: number };
type UtilityMethod =
  | { kind: "ACTUAL_COST"; billSatang: number; billUnits: number }
  | { kind: "TARIFF"; tiers: { uptoUnits: number | null; rateE4: number }[]; ftE4: number }
  | { kind: "FIXED_RATE"; satangPerUnit: number }
  | { kind: "FLAT"; per: "ROOM" | "PERSON"; satang: number; persons?: number };
type UtilityInput =
  | { kind: "METERED"; segments: MeterSegment[]; method: UtilityMethod; minimumSatang?: number | null }
  | { kind: "FLAT"; method: UtilityMethod }
  | { kind: "ALLOCATED"; amountSatang: number };
type DormBillLine = {
  code: string;
  labelTh: string;
  qty: number;
  unitPriceSatang: number | null;
  amountSatang: number;
  taxKind: TaxKind;
  netSatang: number;
  vatSatang: number;
  grossSatang: number;
  meta?: Record<string, string | number>;
};
type DormBillResult = { lines: DormBillLine[]; subtotalSatang: number; vatSatang: number; totalSatang: number };
type VatCfg = { registered: boolean; pricesIncludeVat: boolean };
type BuildInput = {
  rentSatang: number;
  commonFeeSatang: number;
  electricity?: UtilityInput | null;
  water?: UtilityInput | null;
  lateFeeSatang?: number;
  services?: { code: string; labelTh: string; amountSatang: number; taxKind?: TaxKind }[];
  taxKinds?: Partial<Record<"RENT" | "COMMON" | "ELEC" | "WATER" | "SERVICE" | "LATE_FEE", TaxKind>>;
  vat: VatCfg;
};
type LateFeePolicy = {
  kind: "NONE" | "PER_DAY" | "ONCE" | "PERCENT";
  amountSatang?: number;
  percentBp?: number;
  capSatang?: number | null;
  graceDays: number;
};
type SettleInput = {
  depositSatang: number;
  utilities: { code: "ELEC" | "WATER"; labelTh?: string; input: UtilityInput }[];
  damages: { labelTh: string; amountSatang: number; kind: "DAMAGE" | "NORMAL_WEAR"; evidenceCount: number }[];
  unpaidSatang: number;
  approvalThresholdSatang: number;
  legal: { mode: LegalMode; outOfScopeReason?: string | null };
};
type SettleResult =
  | {
      ok: true;
      lines: { code: string; labelTh: string; amountSatang: number }[];
      utilitiesSatang: number;
      damagesSatang: number;
      unpaidSatang: number;
      refundSatang: number;
      tenantOwesSatang: number;
      needsApproval: boolean;
      legal: LegalOutcome[];
    }
  | { ok: false; code: string; index: number };
type CalcApi = {
  divRoundHalfUp: (n: number, d: number) => number;
  actualCostRate: (i: { billSatang: number; units: number }) => number | null;
  meterUnits: (s: MeterSegment[]) => number;
  utilityCharge: (i: { method: UtilityMethod; units: number; minimumSatang?: number | null }) => {
    amountSatang: number;
    units: number;
    rateSatangPerUnit: number | null;
    minimumApplied: boolean;
  };
  allocateShared: (i: {
    totalSatang: number;
    basis: "PERSON" | "ROOM" | "AREA";
    rooms: { roomId: string; persons?: number; areaSqmE2?: number }[];
  }) => { roomId: string; amountSatang: number }[];
  daysInMonth: (y: number, m: number) => number;
  addDaysYmd: (ymd: string, n: number) => string;
  occupiedDays: (i: { periodStart: string; periodEnd: string; moveIn?: string | null; moveOut?: string | null }) => number;
  prorate: (i: { monthlySatang: number; days: number; daysInMonth: number; mode: "ACTUAL_DAYS" | "DIV_30" | "FULL_MONTH" }) => number;
  lateFee: (i: { policy: LateFeePolicy; dueDate: string; paidDate: string; overdueSatang: number }) => {
    feeSatang: number;
    daysLate: number;
    chargeableDays: number;
    capped: boolean;
  };
  computeBill: (i: {
    lines: { code: string; labelTh: string; qty?: number; unitPriceSatang?: number | null; amountSatang: number; taxKind?: TaxKind }[];
    vat: VatCfg;
  }) => DormBillResult;
  buildDormBill: (i: BuildInput) => DormBillResult;
  sumBills: (b: DormBillResult[]) => { count: number; totalSatang: number; vatSatang: number; byCode: Record<string, number> };
  settleDeposit: (i: SettleInput) => SettleResult;
};
type AccountTotalsApi = {
  computeTotals: (i: {
    lines: { description: string; qty: number; unitPrice: number; vatRateBp?: number }[];
    vatMode: "INCLUDE" | "EXCLUDE" | "NONE";
    vatRegistered: boolean;
    vatRateBp: number;
  }) => { subTotal: number; vatAmount: number; grandTotal: number; lines: { net: number; vat: number; gross: number }[] };
};

// ─────────────────── โหลดโมดูล (หาไม่เจอ = แดงอย่างมีเหตุผล) ───────────────────
const ROOT = process.cwd();
const LEGAL_PATH = "src/lib/core/settings/legal/th-rental-2568.ts";
const CALC_PATH = "src/lib/modules/dorm/calc.ts";
const REGISTRY_PATH = "src/lib/core/settings/registry.ts";
const DEFS_PATH = "src/lib/core/settings/defs/rooms.ts";

// โหลดด้วย path ไฟล์จริง (alias "@/…" ใน import แบบตัวแปรไม่ถูกแปลงโดย tsx) · ไฟล์ไม่มี = เหตุผลชัด
async function tryImport(relPath: string): Promise<{ mod: Record<string, unknown> | null; err: string }> {
  const abs = resolve(ROOT, relPath);
  if (!existsSync(abs)) return { mod: null, err: `ไฟล์ยังไม่มี ${relPath}` };
  try {
    const m = (await import(pathToFileURL(abs).href)) as Record<string, unknown>;
    return { mod: m, err: "" };
  } catch (e) {
    return { mod: null, err: e instanceof Error ? e.message.split("\n")[0] : String(e) };
  }
}
const legalLoad = await tryImport(LEGAL_PATH);
const calcLoad = await tryImport(CALC_PATH);
const accLoad = await tryImport("src/lib/modules/account/totals.ts");

function L(): LegalApi {
  if (!legalLoad.mod) throw new Missing(`โมดูลยังไม่มี: «${LEGAL_PATH}» (${legalLoad.err})`);
  return legalLoad.mod as unknown as LegalApi;
}
function C(): CalcApi {
  if (!calcLoad.mod) throw new Missing(`โมดูลยังไม่มี: «${CALC_PATH}» (${calcLoad.err})`);
  return calcLoad.mod as unknown as CalcApi;
}
function ACC(): AccountTotalsApi {
  if (!accLoad.mod) throw new Missing(`โหลด account/totals ไม่ได้ (${accLoad.err})`);
  return accLoad.mod as unknown as AccountTotalsApi;
}

console.log("\n🧪 QC SVC D.1 — กฎหมาย สคบ. 2568 + สูตรเงินหอ (pure)\n");
if (!legalLoad.mod) console.log(`  ℹ️  ${LEGAL_PATH}: ${legalLoad.err}`);
if (!calcLoad.mod) console.log(`  ℹ️  ${CALC_PATH}: ${calcLoad.err}`);

// ═════════════════════ ก. กฎหมาย — ตัวตรวจ × 3 โหมด (ภาคผนวก ก ที่มี "ตัวตรวจ") ═════════════════════
console.log("ก. ตัวตรวจกฎหมาย × 3 โหมด");

const COST = { authorityBillSatang: 1_982_400, authorityUnits: 4200 }; // บิล กฟภ. ต.ค. ฿19,824.00 ÷ 4,200 หน่วย (README)
const allClauses = (): { id: string; text: string }[] => L().MANDATORY_CLAUSES.map((c) => ({ id: c.id, text: c.textTh }));

type RuleCase = {
  key: string;
  rule: string;
  annex: string;
  bad: () => unknown;
  badCode: string;
  good: () => unknown;
  always?: boolean;
  citation2568: boolean;
};
const RULE_CASES: RuleCase[] = [
  {
    key: "fixed-rate",
    rule: "UTIL_FIXED_RATE_LE_COST",
    annex: "#11",
    bad: () => ({ rateSatangPerUnit: 700, ...COST }), // ภาพ 10: ตั้งไฟคงที่ ฿7.00 > ต้นทุน ฿4.72
    badCode: "UTIL_FIXED_RATE_LE_COST",
    good: () => ({ rateSatangPerUnit: 472, ...COST }),
    citation2568: true,
  },
  {
    key: "total-le-bill",
    rule: "UTIL_TOTAL_LE_BILL",
    annex: "#10",
    bad: () => ({ chargedTotalSatang: 1_982_401, authorityBillSatang: 1_982_400 }),
    badCode: "UTIL_TOTAL_LE_BILL",
    good: () => ({ chargedTotalSatang: 1_982_400, authorityBillSatang: 1_982_400 }),
    citation2568: true,
  },
  {
    key: "flat",
    rule: "UTIL_FLAT_LE_COST",
    annex: "#12",
    bad: () => ({ flatSatang: 70_000, payerCount: 31, authorityBillSatang: 1_982_400 }), // 2,170,000 > 1,982,400
    badCode: "UTIL_FLAT_LE_COST",
    good: () => ({ flatSatang: 60_000, payerCount: 31, authorityBillSatang: 1_982_400 }), // 1,860,000
    citation2568: true,
  },
  {
    key: "minimum",
    rule: "UTIL_NO_MINIMUM",
    annex: "#13",
    bad: () => ({ enabled: true, minSatang: 10_000 }),
    badCode: "UTIL_NO_MINIMUM",
    good: () => ({ enabled: false, minSatang: null }),
    citation2568: true,
  },
  {
    key: "deposit-amount",
    rule: "DEPOSIT_ADVANCE_LIMIT",
    annex: "#43/#44",
    bad: () => ({ leaseKind: "SHORT", monthlyRentSatang: 450_000, depositSatang: 900_000, advanceRentSatang: 450_001 }),
    badCode: "DEPOSIT_ADVANCE_LIMIT",
    good: () => ({ leaseKind: "SHORT", monthlyRentSatang: 450_000, depositSatang: 900_000, advanceRentSatang: 450_000 }),
    citation2568: true,
  },
  {
    key: "deposit-months",
    rule: "DEPOSIT_ADVANCE_MONTHS_LIMIT",
    annex: "#43/#44",
    bad: () => ({ leaseKind: "SHORT", depositMonths: 2, advanceMonths: 2 }),
    badCode: "DEPOSIT_ADVANCE_MONTHS_LIMIT",
    good: () => ({ leaseKind: "SHORT", depositMonths: 2, advanceMonths: 1 }),
    citation2568: true,
  },
  {
    key: "return-days",
    rule: "DEPOSIT_RETURN_DAYS",
    annex: "#47",
    bad: () => ({ days: 8 }),
    badCode: "DEPOSIT_RETURN_DAYS",
    good: () => ({ days: 7 }),
    citation2568: true,
  },
  {
    key: "template-threat",
    rule: "TEMPLATE_NO_THREAT",
    annex: "#38",
    bad: () => ({ text: "เรียนคุณ {ชื่อ} ห้อง {ห้อง} ค้างชำระ {ยอด} บาท หากไม่ชำระภายใน 3 วัน หอจะตัดไฟ" }),
    badCode: "TEMPLATE_NO_THREAT",
    good: () => ({ text: "สวัสดีค่ะคุณ {ชื่อ} บิลห้อง {ห้อง} รอบ {เดือน} ยอด {ยอด} บาท ครบกำหนด {วันครบ} ค่ะ" }),
    always: true,
    citation2568: false,
  },
  {
    key: "contract-mandatory",
    rule: "CONTRACT_MANDATORY_CLAUSES",
    annex: "#50",
    bad: () => ({ clauses: allClauses().slice(1) }),
    badCode: "CONTRACT_MANDATORY_REMOVED",
    good: () => ({ clauses: allClauses() }),
    citation2568: true,
  },
  {
    key: "contract-forbidden",
    rule: "CONTRACT_MANDATORY_CLAUSES",
    annex: "#50",
    bad: () => ({ clauses: [...allClauses(), { id: "extra-1", text: "ผู้ให้เช่ามีสิทธิ์ล็อกห้องได้ทันทีเมื่อผู้เช่าค้างชำระ" }] }),
    badCode: "CONTRACT_FORBIDDEN_TERM",
    good: () => ({ clauses: [...allClauses(), { id: "extra-1", text: "ห้ามเลี้ยงสัตว์ในห้องพัก" }] }),
    always: true,
    citation2568: false,
  },
  {
    key: "deduct-evidence",
    rule: "DEDUCTION_EVIDENCE",
    annex: "#49",
    bad: () => ({ kind: "DAMAGE", evidenceCount: 0 }),
    badCode: "DEDUCT_NO_EVIDENCE",
    good: () => ({ kind: "DAMAGE", evidenceCount: 1 }),
    citation2568: false,
  },
  {
    key: "deduct-wear",
    rule: "DEDUCTION_EVIDENCE",
    annex: "#49",
    bad: () => ({ kind: "NORMAL_WEAR", evidenceCount: 3 }),
    badCode: "DEDUCT_NORMAL_WEAR",
    good: () => ({ kind: "DAMAGE", evidenceCount: 2 }),
    always: true,
    citation2568: false,
  },
  {
    key: "rent-lock",
    rule: "RENT_LOCKED_IN_LEASE",
    annex: "#6",
    bad: () => ({ context: "MID_LEASE", oldSatang: 450_000, newSatang: 480_000 }),
    badCode: "RENT_LOCKED_IN_LEASE",
    good: () => ({ context: "RENEWAL", oldSatang: 450_000, newSatang: 480_000 }),
    citation2568: true,
  },
];
const REASON = "ให้เช่าไม่ถึง 3 ห้อง (ทดสอบ)";

for (const rc of RULE_CASES) {
  const tag = `${rc.rule}${rc.badCode !== rc.rule ? `/${rc.badCode}` : ""} (${rc.annex})`;
  check(`D1-LG-${rc.key}-STRICT`, `${tag} โหมดเข้มงวด: ผิด ⇒ BLOCK`, () => {
    const o = L().evaluateLegal(rc.rule, rc.bad(), { mode: "STRICT" });
    eq(o.level, "BLOCK", "level");
    eq(o.raw, "BLOCK", "raw");
    eq(o.code, rc.badCode, "code");
    eq(o.mode, "STRICT", "mode");
    ok(hasThai(o.messageTh), `messageTh ต้องเป็นไทยไม่ว่าง: ${fmt(o.messageTh)}`);
    ok(typeof o.citation === "string" && o.citation.trim().length > 0, "citation ว่าง");
    if (rc.citation2568) ok(o.citation.includes("2568"), `citation ต้องอ้างประกาศ 2568: ${fmt(o.citation)}`);
  });
  check(`D1-LG-${rc.key}-WARN`, `${tag} โหมดเตือน: ${rc.always ? "ยังบล็อก (ห้ามเด็ดขาด)" : "ลดเป็น WARN + ยอมรับ + เจ้าของอนุมัติ"}`, () => {
    const o = L().evaluateLegal(rc.rule, rc.bad(), { mode: "WARN" });
    eq(o.raw, "BLOCK", "raw");
    if (rc.always) {
      eq(o.level, "BLOCK", "level");
    } else {
      eq(o.level, "WARN", "level");
      eq(o.needsAck, true, "needsAck");
      eq(o.needsOwnerApproval, true, "needsOwnerApproval");
    }
    eq(o.code, rc.badCode, "code");
  });
  check(`D1-LG-${rc.key}-OOS`, `${tag} โหมดนอกขอบเขต (มีเหตุผล): ${rc.always ? "ยังบล็อก" : "ไม่ตรวจ ⇒ OK"}`, () => {
    const o = L().evaluateLegal(rc.rule, rc.bad(), { mode: "OUT_OF_SCOPE", outOfScopeReason: REASON });
    eq(o.level, rc.always ? "BLOCK" : "OK", "level");
    eq(o.raw, "BLOCK", "raw (ยังรายงานผลดิบ)");
    if (!rc.always) {
      eq(o.needsAck, false, "needsAck");
      eq(o.needsOwnerApproval, false, "needsOwnerApproval");
    }
  });
  check(`D1-LG-${rc.key}-GOOD`, `${tag} ค่าถูกกฎหมาย ⇒ OK ทั้ง STRICT/WARN`, () => {
    for (const mode of ["STRICT", "WARN"] as const) {
      const o = L().evaluateLegal(rc.rule, rc.good(), { mode });
      eq(o.level, "OK", `${mode} level`);
      eq(o.raw, "OK", `${mode} raw`);
      eq(o.code, "OK", `${mode} code`);
      eq(o.needsAck, false, `${mode} needsAck`);
      eq(o.needsOwnerApproval, false, `${mode} needsOwnerApproval`);
    }
  });
}

check("D1-LG-OOS-REASON", "#3 นอกขอบเขตแต่ไม่มีเหตุผล ⇒ BLOCK OUT_OF_SCOPE_REASON_REQUIRED (ทุกกฎ · ทั้งค่าถูก/ผิด)", () => {
  for (const rc of RULE_CASES) {
    for (const reason of [undefined, null, "", "   "]) {
      for (const inp of [rc.good(), rc.bad()]) {
        const o = L().evaluateLegal(rc.rule, inp, { mode: "OUT_OF_SCOPE", outOfScopeReason: reason });
        eq(o.level, "BLOCK", `${rc.key} reason=${fmt(reason)} level`);
        eq(o.code, "OUT_OF_SCOPE_REASON_REQUIRED", `${rc.key} reason=${fmt(reason)} code`);
      }
    }
  }
});

check("D1-LG-FIXED-BOUNDARY", "#11 อัตราคงที่ = ต้นทุนพอดี (472) OK · เกิน 1 สตางค์ (473) BLOCK", () => {
  eq(L().evaluateLegal("UTIL_FIXED_RATE_LE_COST", { rateSatangPerUnit: 472, ...COST }, { mode: "STRICT" }).level, "OK", "472");
  eq(L().evaluateLegal("UTIL_FIXED_RATE_LE_COST", { rateSatangPerUnit: 473, ...COST }, { mode: "STRICT" }).level, "BLOCK", "473");
  // ต้นทุนไม่ลงตัว: 1,982,500/4,200 = 4.7202 ⇒ 472 ผ่าน (472×4200=1,982,400 ≤ บิล) · 473 ไม่ผ่าน
  eq(
    L().evaluateLegal("UTIL_FIXED_RATE_LE_COST", { rateSatangPerUnit: 473, authorityBillSatang: 1_982_500, authorityUnits: 4200 }, { mode: "STRICT" }).level,
    "BLOCK",
    "473 vs 4.7202",
  );
});

check("D1-LG-COST-UNKNOWN", "#10/#11/#12 ยังไม่มีบิลการไฟฟ้า ⇒ ดิบ WARN UTIL_COST_UNKNOWN (ยอมรับได้ ไม่ต้องอนุมัติ)", () => {
  const inputs: [string, unknown][] = [
    ["UTIL_FIXED_RATE_LE_COST", { rateSatangPerUnit: 472, authorityBillSatang: null, authorityUnits: null }],
    ["UTIL_FIXED_RATE_LE_COST", { rateSatangPerUnit: 472, authorityBillSatang: 1_982_400, authorityUnits: 0 }],
    ["UTIL_TOTAL_LE_BILL", { chargedTotalSatang: 100, authorityBillSatang: null }],
    ["UTIL_FLAT_LE_COST", { flatSatang: 30_000, payerCount: 31, authorityBillSatang: null }],
  ];
  for (const [rule, inp] of inputs) {
    for (const mode of ["STRICT", "WARN"] as const) {
      const o = L().evaluateLegal(rule, inp, { mode });
      eq(o.raw, "WARN", `${rule} ${mode} raw`);
      eq(o.level, "WARN", `${rule} ${mode} level`);
      eq(o.code, "UTIL_COST_UNKNOWN", `${rule} ${mode} code`);
      eq(o.needsAck, true, `${rule} ${mode} needsAck`);
      eq(o.needsOwnerApproval, false, `${rule} ${mode} needsOwnerApproval`);
    }
    eq(L().evaluateLegal(rule, inp, { mode: "OUT_OF_SCOPE", outOfScopeReason: REASON }).level, "OK", `${rule} OOS`);
  }
});

check("D1-LG-DEPOSIT-LONG", "#43 สัญญายาว: ประกัน+ล่วงหน้า ≤ 12 เดือน (เงินและเดือน)", () => {
  const ev = (inp: unknown, rule: string) => L().evaluateLegal(rule, inp, { mode: "STRICT" }).level;
  eq(ev({ leaseKind: "LONG", monthlyRentSatang: 450_000, depositSatang: 5_400_000, advanceRentSatang: 0 }, "DEPOSIT_ADVANCE_LIMIT"), "OK", "12 เดือนพอดี");
  eq(ev({ leaseKind: "LONG", monthlyRentSatang: 450_000, depositSatang: 5_400_001, advanceRentSatang: 0 }, "DEPOSIT_ADVANCE_LIMIT"), "BLOCK", "เกิน 1 สตางค์");
  eq(ev({ leaseKind: "LONG", depositMonths: 6, advanceMonths: 6 }, "DEPOSIT_ADVANCE_MONTHS_LIMIT"), "OK", "6+6");
  eq(ev({ leaseKind: "LONG", depositMonths: 7, advanceMonths: 6 }, "DEPOSIT_ADVANCE_MONTHS_LIMIT"), "BLOCK", "7+6");
  eq(ev({ leaseKind: "SHORT", depositMonths: 3, advanceMonths: 0 }, "DEPOSIT_ADVANCE_MONTHS_LIMIT"), "OK", "สั้น 3+0");
  // ตัวอย่างจริงหอ: ประกัน 2 เดือน ฿9,000 ห้อง ฿4,500 · ห้องใหญ่ ฿10,400 = 2×5,200 (README)
  eq(ev({ leaseKind: "SHORT", monthlyRentSatang: 520_000, depositSatang: 1_040_000, advanceRentSatang: 0 }, "DEPOSIT_ADVANCE_LIMIT"), "OK", "ห้องใหญ่");
});

check("D1-LG-PARAMS", "พารามิเตอร์กฎหมาย: ค่าที่ไม่ชัดมีป้าย PENDING_LEGAL_REVIEW (ไม่ฮาร์ดโค้ด)", () => {
  const P = L().TH_RENTAL_2568_PARAMS;
  const need: [string, unknown, string | null][] = [
    ["scopeMinRooms", 3, null],
    ["shortLeaseMaxMonths", 36, null],
    ["longLeaseMaxMonths", 360, null],
    ["depositAdvanceMaxMonthsShort", 3, null],
    ["depositAdvanceMaxMonthsLong", 12, null],
    ["depositReturnMaxDays", 7, "PENDING_LEGAL_REVIEW"],
    ["utilityCostMethod", "BILL_DIV_UNITS", "PENDING_LEGAL_REVIEW"],
    ["lateFeeCapSatang", null, "PENDING_LEGAL_REVIEW"],
  ];
  for (const [k, v, review] of need) {
    const p = P[k];
    ok(!!p, `ไม่มีพารามิเตอร์ ${k}`);
    eq(p.value, v, `${k}.value`);
    ok(p.review === "CONFIRMED" || p.review === "PENDING_LEGAL_REVIEW", `${k}.review ไม่ถูกชนิด: ${fmt(p.review)}`);
    if (review) eq(p.review, review, `${k}.review`);
    ok(hasThai(p.noteTh), `${k}.noteTh ต้องเป็นไทยไม่ว่าง`);
  }
});

check("D1-LG-PARAMS-OVERRIDE", "#47 ที่ปรึกษาเปลี่ยนเพดานคืนประกันได้ด้วย params (7 → 14) โดยไม่แก้ตรรกะ", () => {
  eq(L().evaluateLegal("DEPOSIT_RETURN_DAYS", { days: 10 }, { mode: "STRICT" }).level, "BLOCK", "ค่าเริ่ม 7");
  eq(L().evaluateLegal("DEPOSIT_RETURN_DAYS", { days: 10 }, { mode: "STRICT", params: { depositReturnMaxDays: 14 } }).level, "OK", "override 14");
  eq(L().evaluateLegal("DEPOSIT_RETURN_DAYS", { days: 15 }, { mode: "STRICT", params: { depositReturnMaxDays: 14 } }).level, "BLOCK", "15 > 14");
  eq(
    L().evaluateLegal("DEPOSIT_ADVANCE_MONTHS_LIMIT", { leaseKind: "SHORT", depositMonths: 1, advanceMonths: 1 }, { mode: "STRICT", params: { depositAdvanceMaxMonthsShort: 1 } }).level,
    "BLOCK",
    "override เพดานสั้น 1",
  );
});

check("D1-LG-RENT-DECREASE", "#6 ลดค่าเช่าระหว่างสัญญาได้ · ราคาเท่าเดิมได้ · ขึ้นกลางสัญญา 1 สตางค์ก็ไม่ได้", () => {
  const ev = (inp: unknown) => L().evaluateLegal("RENT_LOCKED_IN_LEASE", inp, { mode: "STRICT" }).level;
  eq(ev({ context: "MID_LEASE", oldSatang: 450_000, newSatang: 420_000 }), "OK", "ลด");
  eq(ev({ context: "MID_LEASE", oldSatang: 450_000, newSatang: 450_000 }), "OK", "เท่าเดิม");
  eq(ev({ context: "MID_LEASE", oldSatang: 450_000, newSatang: 450_001 }), "BLOCK", "ขึ้น 1 สตางค์");
});

check("D1-LG-SCOPE", "#1 ขอบเขตประกาศ: ≥ 3 ห้อง · อพาร์ตเมนต์/เซอร์วิส · หอนักศึกษา/โรงแรมนอกขอบเขตแต่ค่าเริ่ม STRICT", () => {
  const s = L().legalScope;
  const a = s({ roomCount: 36, businessType: "APARTMENT" });
  eq([a.inScope, a.defaultMode, a.autoReasonTh], [true, "STRICT", null], "36 ห้อง อพาร์ตเมนต์");
  eq(s({ roomCount: 3, businessType: "APARTMENT" }).inScope, true, "3 ห้องพอดี");
  eq(s({ roomCount: 3, businessType: "SERVICED_APT" }).inScope, true, "เซอร์วิส 3 ห้อง");
  const two = s({ roomCount: 2, businessType: "APARTMENT" });
  eq([two.inScope, two.defaultMode], [false, "OUT_OF_SCOPE"], "2 ห้อง");
  ok(hasThai(two.autoReasonTh), "2 ห้อง ต้องมีเหตุผลอัตโนมัติภาษาไทย");
  const st = s({ roomCount: 40, businessType: "STUDENT_DORM" });
  eq([st.inScope, st.defaultMode], [false, "STRICT"], "หอนักศึกษา (กฎเดียวกันเพราะปลอดภัยกว่า)");
  const ht = s({ roomCount: 14, businessType: "SMALL_HOTEL" });
  eq([ht.inScope, ht.defaultMode], [false, "STRICT"], "โรงแรม 14 ห้อง");
  ok(typeof a.code === "string" && a.code.length > 0, "code ว่าง");
});

check("D1-LG-LEASEKIND", "#42 ประเภทสัญญา: ≤ 36 เดือน สั้น · ≤ 360 ยาว · เกิน/ผิดชนิด = null", () => {
  const k = L().leaseKind;
  eq([k(1), k(12), k(36), k(37), k(360), k(361), k(0), k(-1), k(12.5)], ["SHORT", "SHORT", "SHORT", "LONG", "LONG", null, null, null, null], "leaseKind");
});

check("D1-LG-THREAT-VARIANTS", "#38 คำต้องห้าม: ตัดช่องว่าง/อักขระศูนย์/ตัวพิมพ์ แล้วยังจับได้ · คำปกติไม่โดน", () => {
  const bad = [
    "ค้างเกิน 7 วันจะตัดไฟทันที",
    "ค้างเกิน 7 วันจะตัด ไฟ",
    "จะตัด​น้ำ ห้อง {ห้อง}",
    "หอจะตัดน้ำไฟ",
    "หอจะล็อคห้องจนกว่าจะชำระ",
    "หอจะล็อกห้อง",
    "จะยึดทรัพย์สินในห้อง",
    "จะยึดของไว้",
    "จะขนของออกจากห้อง",
    "We will CUT OFF your water",
    "you will be locked out — lock out notice",
    "We may seize your belongings",
  ];
  const good = [
    "ค่าไฟฟ้าเดือนนี้ 125 หน่วย ยอด {ยอด} บาท",
    "ประกาศ: ส. 24 ต.ค. 10:00–12:00 ช่างล้างถังเก็บน้ำ น้ำอาจไหลอ่อน ขออภัยในความไม่สะดวกค่ะ",
    "แจ้งซ่อมห้อง {ห้อง} เสร็จแล้วค่ะ",
    "Your bill for room {ห้อง} is ready",
  ];
  for (const t of bad) {
    eq(L().evaluateLegal("TEMPLATE_NO_THREAT", { text: t }, { mode: "STRICT" }).level, "BLOCK", `ต้องบล็อก "${t}"`);
    ok(L().findForbiddenTerms(t).length > 0, `findForbiddenTerms ต้องพบใน "${t}"`);
  }
  for (const t of good) {
    eq(L().evaluateLegal("TEMPLATE_NO_THREAT", { text: t }, { mode: "STRICT" }).level, "OK", `ไม่ควรบล็อก "${t}"`);
    eq(L().findForbiddenTerms(t), [], `findForbiddenTerms "${t}"`);
  }
  ok(L().FORBIDDEN_TERMS.length >= 8, "FORBIDDEN_TERMS ต้องมี ≥ 8 คำ");
});

check("D1-LG-CLAUSES", "#50 แม่แบบสัญญา: MANDATORY_CLAUSES มีอย่างน้อย 1 ข้อ · id ไม่ซ้ำ · ไทยไม่ว่าง · ไม่มีคำต้องห้ามในตัวเอง", () => {
  const cs = L().MANDATORY_CLAUSES;
  ok(Array.isArray(cs) && cs.length >= 1, "ต้องมีข้อบังคับ ≥ 1");
  eq(new Set(cs.map((c) => c.id)).size, cs.length, "id ซ้ำ");
  for (const c of cs) {
    ok(hasThai(c.titleTh) && hasThai(c.textTh), `ข้อ ${c.id} ต้องมีชื่อ/ข้อความไทย`);
    eq(L().findForbiddenTerms(c.textTh), [], `ข้อบังคับ ${c.id} มีคำต้องห้าม`);
  }
  // ลบข้อใดก็ได้ (ทุกข้อ) ⇒ BLOCK
  for (let i = 0; i < cs.length; i++) {
    const rest = allClauses().filter((_, j) => j !== i);
    const o = L().evaluateLegal("CONTRACT_MANDATORY_CLAUSES", { clauses: rest }, { mode: "STRICT" });
    eq([o.level, o.code], ["BLOCK", "CONTRACT_MANDATORY_REMOVED"], `ลบข้อ ${cs[i].id}`);
  }
});

// ═════════════════════ ข. สูตรเงินพื้นฐาน ═════════════════════
console.log("\nข. สูตรเงิน (สตางค์ล้วน · ปัดเศษ)");

check("D1-CL-ROUND", "#4 ปัดเศษ divRoundHalfUp: ครึ่งปัดออกจากศูนย์ (ไม่ใช่ banker's)", () => {
  const d = C().divRoundHalfUp;
  eq([d(5, 2), d(7, 2), d(1, 2), d(10, 3), d(2, 3), d(1, 3), d(-5, 2), d(-1, 3), d(0, 7), d(100_001 * 15, 30)], [3, 4, 1, 3, 1, 0, -3, 0, 0, 50_001], "divRoundHalfUp");
});

check("D1-CL-COSTRATE", "อัตราต้นทุนจริง = บิล ÷ หน่วยรวม ปัดลง (ไม่เกินต้นทุน)", () => {
  const r = C().actualCostRate;
  eq(r({ billSatang: 1_982_400, units: 4200 }), 472, "ไฟ ฿4.72 (ภาพ 04/10)");
  eq(r({ billSatang: 384_000, units: 240 }), 1600, "น้ำ ฿16.00");
  eq(r({ billSatang: 1_982_500, units: 4200 }), 472, "4.7202 ⇒ 472 (ปัดลง)");
  eq(r({ billSatang: 1_984_499, units: 4200 }), 472, "4.72499 ⇒ 472");
  eq(r({ billSatang: 1_984_600, units: 4200 }), 472, "4.72523 ⇒ 472 (ไม่ปัดขึ้น)");
  eq(r({ billSatang: 1_982_400, units: 0 }), null, "หน่วย 0");
});

check("D1-CL-METER", "หน่วยมิเตอร์: ปกติ · เปลี่ยนมิเตอร์กลางรอบ (2 ตัว) · วนรอบ · ถอยหลัง = throw", () => {
  const m = C().meterUnits;
  eq(m([{ start: 1287, end: 1412 }]), 125, "204 ไฟ 1,287→1,412");
  eq(m([{ start: 312, end: 318 }]), 6, "204 น้ำ 0312→0318");
  eq(m([{ start: 2000, end: 2126 }]), 126, "207 ไฟวันออก");
  eq(m([{ start: 8904, end: 8951 }, { start: 0, end: 126 }]), 173, "112 เปลี่ยนมิเตอร์ (ภาพ 03: 8,904 → 126)");
  eq(m([{ start: 9990, end: 5, rolloverDigits: 4 }]), 15, "มิเตอร์น้ำ 4 หลักวนรอบ");
  eq(m([{ start: 500, end: 500 }]), 0, "ไม่ใช้เลย");
  throwsCode(() => m([{ start: 8904, end: 126 }]), "METER_BACKWARDS", "เลขถอยหลังไม่มีเปลี่ยนมิเตอร์");
  throwsCode(() => m([]), "NO_SEGMENTS", "ไม่มีช่วง");
  throwsCode(() => m([{ start: 1287.5, end: 1412 }]), "INVALID_READING", "เลขทศนิยม");
});

check("D1-CL-UTIL-4", "ค่าน้ำไฟ 4 วิธี: ต้นทุนจริง · ตารางอัตรา (ขั้นบันได+Ft) · คงที่ · เหมา", () => {
  const u = C().utilityCharge;
  const actual = u({ method: { kind: "ACTUAL_COST", billSatang: 1_982_400, billUnits: 4200 }, units: 125 });
  eq([actual.amountSatang, actual.units, actual.rateSatangPerUnit, actual.minimumApplied], [59_000, 125, 472, false], "ต้นทุนจริง 125×4.72");
  const tiers = [
    { uptoUnits: 150, rateE4: 32_484 },
    { uptoUnits: 400, rateE4: 42_218 },
    { uptoUnits: null, rateE4: 44_217 },
  ];
  const tariff = (units: number) => u({ method: { kind: "TARIFF", tiers, ftE4: 3972 }, units });
  eq(tariff(125).amountSatang, 45_570, "ตาราง 125 หน่วย (ขั้นแรก)");
  eq(tariff(131).amountSatang, 47_757, "ตาราง 131 หน่วย (47,757.36 ⇒ 47,757)");
  eq(tariff(200).amountSatang, 77_779, "ตาราง 200 หน่วย (ข้ามขั้น)");
  eq(tariff(450).amountSatang, 194_254, "ตาราง 450 หน่วย (3 ขั้น · 194,253.5 ⇒ half-up 194,254 · ปัดครั้งเดียวท้ายสุด)");
  eq(tariff(125).rateSatangPerUnit, null, "ตาราง ไม่มีอัตราเดียว");
  const fixed = u({ method: { kind: "FIXED_RATE", satangPerUnit: 700 }, units: 125 });
  eq([fixed.amountSatang, fixed.rateSatangPerUnit], [87_500, 700], "คงที่ ฿7 × 125");
  eq(u({ method: { kind: "FLAT", per: "ROOM", satang: 30_000 }, units: 999 }).amountSatang, 30_000, "เหมาต่อห้อง ไม่ขึ้นกับหน่วย");
  eq(u({ method: { kind: "FLAT", per: "PERSON", satang: 15_000, persons: 3 }, units: 0 }).amountSatang, 45_000, "เหมาต่อคน × 3");
});

check("D1-CL-UTIL-MIN", "#13 ค่าขั้นต่ำ (คำนวณได้ — การห้ามเป็นหน้าที่ตัวตรวจ)", () => {
  const u = C().utilityCharge;
  const a = u({ method: { kind: "FIXED_RATE", satangPerUnit: 472 }, units: 3, minimumSatang: 5000 });
  eq([a.amountSatang, a.minimumApplied], [5000, true], "3 หน่วย × 4.72 = 14.16 < ขั้นต่ำ 50");
  const b = u({ method: { kind: "FIXED_RATE", satangPerUnit: 472 }, units: 125, minimumSatang: 5000 });
  eq([b.amountSatang, b.minimumApplied], [59_000, false], "เกินขั้นต่ำ");
  const c = u({ method: { kind: "FIXED_RATE", satangPerUnit: 472 }, units: 3, minimumSatang: null });
  eq([c.amountSatang, c.minimumApplied], [1416, false], "ปิดขั้นต่ำ");
});

check("D1-CL-SHARED-3", "มิเตอร์รวมเฉลี่ย 3 แบบ (คน/ห้อง/พื้นที่) · largest remainder · ผลรวมตรงเป๊ะ", () => {
  const a = C().allocateShared;
  const rooms3 = (extra: { persons?: number; areaSqmE2?: number }[]) => extra.map((e, i) => ({ roomId: `R${i + 1}`, ...e }));
  eq(
    a({ totalSatang: 10_000, basis: "ROOM", rooms: rooms3([{}, {}, {}]) }).map((x) => x.amountSatang),
    [3334, 3333, 3333],
    "ตามห้อง (เศษเท่ากัน ⇒ ลำดับแรกก่อน)",
  );
  eq(
    a({ totalSatang: 10_000, basis: "PERSON", rooms: rooms3([{ persons: 1 }, { persons: 2 }, { persons: 3 }]) }).map((x) => x.amountSatang),
    [1667, 3333, 5000],
    "ตามคน",
  );
  eq(
    a({ totalSatang: 10_001, basis: "AREA", rooms: rooms3([{ areaSqmE2: 2400 }, { areaSqmE2: 2400 }, { areaSqmE2: 3200 }]) }).map((x) => x.amountSatang),
    [3000, 3000, 4001],
    "ตามพื้นที่ 24/24/32 ตร.ม.",
  );
  eq(
    a({ totalSatang: 9_000, basis: "PERSON", rooms: rooms3([{ persons: 0 }, { persons: 2 }, { persons: 1 }]) }).map((x) => x.amountSatang),
    [0, 6000, 3000],
    "ห้อง 0 คนไม่จ่าย",
  );
  eq(
    a({ totalSatang: 100, basis: "ROOM", rooms: [{ roomId: "B" }, { roomId: "A" }] }).map((x) => x.roomId),
    ["B", "A"],
    "คืนตามลำดับอินพุต",
  );
  throwsCode(() => a({ totalSatang: 100, basis: "PERSON", rooms: rooms3([{ persons: 0 }, { persons: 0 }]) }), "NO_ALLOCATION_BASIS", "ไม่มีฐาน");
});

check("D1-CL-DAYS", "วันที่ (สตริง YYYY-MM-DD): จำนวนวันของเดือน · บวกวัน · วันที่พัก (นับรวมสองปลาย)", () => {
  const c = C();
  eq([c.daysInMonth(2026, 11), c.daysInMonth(2026, 12), c.daysInMonth(2027, 2), c.daysInMonth(2028, 2), c.daysInMonth(2100, 2), c.daysInMonth(2000, 2)], [30, 31, 28, 29, 28, 29], "daysInMonth");
  eq([c.addDaysYmd("2026-10-31", 7), c.addDaysYmd("2026-12-28", 7), c.addDaysYmd("2028-02-28", 1), c.addDaysYmd("2026-11-05", 0)], ["2026-11-07", "2027-01-04", "2028-02-29", "2026-11-05"], "addDaysYmd");
  const nov = { periodStart: "2026-11-01", periodEnd: "2026-11-30" };
  eq(c.occupiedDays({ ...nov, moveIn: "2026-11-15" }), 16, "เบญจาเข้า 207 วันที่ 15 พ.ย.");
  eq(c.occupiedDays({ ...nov, moveOut: "2026-11-10" }), 10, "ออก 10 พ.ย.");
  eq(c.occupiedDays({ ...nov, moveIn: "2026-11-05", moveOut: "2026-11-20" }), 16, "เข้า 5 ออก 20");
  eq(c.occupiedDays({ ...nov }), 30, "ทั้งเดือน");
  eq(c.occupiedDays({ ...nov, moveIn: "2026-10-01" }), 30, "เข้าก่อนงวด");
  eq(c.occupiedDays({ ...nov, moveIn: "2026-12-01" }), 0, "เข้าหลังงวด");
});

check("D1-CL-PRORATE", "#27 เศษวันเข้า/ออกกลางเดือน: ตามวันจริง · ÷30 · เต็มเดือน", () => {
  const p = C().prorate;
  eq(p({ monthlySatang: 450_000, days: 16, daysInMonth: 30, mode: "ACTUAL_DAYS" }), 240_000, "207 เบญจา 16/30");
  eq(p({ monthlySatang: 450_000, days: 15, daysInMonth: 31, mode: "ACTUAL_DAYS" }), 217_742, "15/31 (2,177.419 ⇒ 2,177.42)");
  eq(p({ monthlySatang: 520_000, days: 15, daysInMonth: 31, mode: "ACTUAL_DAYS" }), 251_613, "ห้องใหญ่ 15/31");
  eq(p({ monthlySatang: 100_001, days: 15, daysInMonth: 30, mode: "ACTUAL_DAYS" }), 50_001, "ครึ่งพอดี ⇒ ปัดขึ้น");
  eq(p({ monthlySatang: 450_000, days: 15, daysInMonth: 31, mode: "DIV_30" }), 225_000, "÷30");
  eq(p({ monthlySatang: 450_000, days: 31, daysInMonth: 31, mode: "DIV_30" }), 450_000, "÷30 ไม่เกินทั้งเดือน");
  eq(p({ monthlySatang: 450_000, days: 3, daysInMonth: 31, mode: "FULL_MONTH" }), 450_000, "เต็มเดือน");
  eq(p({ monthlySatang: 450_000, days: 30, daysInMonth: 30, mode: "ACTUAL_DAYS" }), 450_000, "ทั้งเดือน = ค่าเต็ม");
});

const SAMPLE_LATE: LateFeePolicy = { kind: "PER_DAY", amountSatang: 5000, capSatang: 50_000, graceDays: 0 }; // ภาพ 17 หอตัวอย่าง
check("D1-CL-LATEFEE", "#31–34 ค่าปรับ: ต่อวัน/ครั้งเดียว/% · เพดานต่อบิล · ผ่อนผัน", () => {
  const f = C().lateFee;
  const r203 = f({ policy: SAMPLE_LATE, dueDate: "2026-10-05", paidDate: "2026-10-09", overdueSatang: 554_256 });
  eq([r203.feeSatang, r203.daysLate, r203.chargeableDays, r203.capped], [20_000, 4, 4, false], "203 ปรับช้า ต.ค. 4 วัน = ฿200 (ภาพ 04)");
  const g3 = { ...SAMPLE_LATE, graceDays: 3 };
  eq(f({ policy: g3, dueDate: "2026-10-05", paidDate: "2026-10-08", overdueSatang: 1 }).feeSatang, 0, "ผ่อนผัน 3 วัน จ่ายวันที่ 3");
  const g3b = f({ policy: g3, dueDate: "2026-10-05", paidDate: "2026-10-09", overdueSatang: 1 });
  eq([g3b.feeSatang, g3b.daysLate, g3b.chargeableDays], [5000, 4, 1], "ผ่อนผัน 3 วัน จ่ายวันที่ 4 ⇒ คิด 1 วัน");
  const cap = f({ policy: SAMPLE_LATE, dueDate: "2026-10-05", paidDate: "2026-10-25", overdueSatang: 1 });
  eq([cap.feeSatang, cap.capped, cap.daysLate], [50_000, true, 20], "20 วัน = ฿1,000 ⇒ เพดาน ฿500");
  eq(f({ policy: SAMPLE_LATE, dueDate: "2026-10-05", paidDate: "2026-10-05", overdueSatang: 1 }).feeSatang, 0, "จ่ายวันครบ");
  eq(f({ policy: SAMPLE_LATE, dueDate: "2026-10-05", paidDate: "2026-10-01", overdueSatang: 1 }).daysLate, 0, "จ่ายก่อน");
  eq(f({ policy: SAMPLE_LATE, dueDate: "2026-12-05", paidDate: "2027-01-04", overdueSatang: 1 }).daysLate, 30, "ข้ามปี");
  eq(f({ policy: { kind: "ONCE", amountSatang: 20_000, graceDays: 0 }, dueDate: "2026-10-05", paidDate: "2026-10-06", overdueSatang: 1 }).feeSatang, 20_000, "ครั้งเดียว");
  eq(f({ policy: { kind: "PERCENT", percentBp: 200, graceDays: 0 }, dueDate: "2026-10-05", paidDate: "2026-10-06", overdueSatang: 548_600 }).feeSatang, 10_972, "2% ของ ฿5,486");
  eq(f({ policy: { kind: "PERCENT", percentBp: 200, graceDays: 0 }, dueDate: "2026-10-05", paidDate: "2026-10-06", overdueSatang: 548_625 }).feeSatang, 10_973, "2% half-up (10,972.5)");
  const pc = f({ policy: { kind: "PERCENT", percentBp: 200, capSatang: 10_000, graceDays: 0 }, dueDate: "2026-10-05", paidDate: "2026-10-06", overdueSatang: 548_600 });
  eq([pc.feeSatang, pc.capped], [10_000, true], "% + เพดาน");
  eq(f({ policy: { kind: "NONE", graceDays: 0 }, dueDate: "2026-10-05", paidDate: "2026-11-30", overdueSatang: 1 }).feeSatang, 0, "ไม่มีค่าปรับ");
});

// ═════════════════════ ค. VAT แยกบรรทัด ═════════════════════
console.log("\nค. VAT แยกบรรทัด (ค่าห้องยกเว้น · น้ำไฟ/ส่วนกลาง 7% เมื่อจด · รวม/ไม่รวม VAT)");

const ELEC_COST: UtilityMethod = { kind: "ACTUAL_COST", billSatang: 1_982_400, billUnits: 4200 };
const WATER_COST: UtilityMethod = { kind: "ACTUAL_COST", billSatang: 384_000, billUnits: 240 };
const bill204 = (vat: VatCfg): DormBillResult =>
  C().buildDormBill({
    rentSatang: 450_000,
    commonFeeSatang: 30_000,
    electricity: { kind: "METERED", segments: [{ start: 1287, end: 1412 }], method: ELEC_COST },
    water: { kind: "METERED", segments: [{ start: 312, end: 318 }], method: WATER_COST },
    vat,
  });
const pick = (b: DormBillResult) => b.lines.map((l) => [l.code, l.taxKind, l.netSatang, l.vatSatang, l.grossSatang]);

check("D1-VAT-NOTREG", "หอไม่จด VAT (ภาพ 04): ไม่มี VAT ทุกบรรทัด · ชนิดภาษี NONE", () => {
  const b = bill204({ registered: false, pricesIncludeVat: true });
  eq(pick(b), [
    ["RENT", "NONE", 450_000, 0, 450_000],
    ["COMMON", "NONE", 30_000, 0, 30_000],
    ["ELEC", "NONE", 59_000, 0, 59_000],
    ["WATER", "NONE", 9_600, 0, 9_600],
  ], "บรรทัด");
  eq([b.subtotalSatang, b.vatSatang, b.totalSatang], [548_600, 0, 548_600], "ยอด");
});

check("D1-VAT-INCL", "จด VAT + ราคารวม VAT: ค่าห้องยกเว้น · ส่วนกลาง/ไฟ/น้ำ ถอด VAT ต่อบรรทัด · ยอดรวมเท่าเดิม", () => {
  const b = bill204({ registered: true, pricesIncludeVat: true });
  eq(pick(b), [
    ["RENT", "EXEMPT", 450_000, 0, 450_000],
    ["COMMON", "VAT7", 28_037, 1_963, 30_000],
    ["ELEC", "VAT7", 55_140, 3_860, 59_000],
    ["WATER", "VAT7", 8_972, 628, 9_600],
  ], "บรรทัด");
  eq([b.subtotalSatang, b.vatSatang, b.totalSatang], [542_149, 6_451, 548_600], "ยอด (VAT ต่อบรรทัด 6,451 ≠ ต่อบิล 6,450 — ใช้ต่อบรรทัดตามบัญชี V2)");
});

check("D1-VAT-EXCL", "จด VAT + ราคาไม่รวม VAT: บวก 7% เฉพาะบรรทัดที่มี VAT", () => {
  const b = bill204({ registered: true, pricesIncludeVat: false });
  eq(pick(b), [
    ["RENT", "EXEMPT", 450_000, 0, 450_000],
    ["COMMON", "VAT7", 30_000, 2_100, 32_100],
    ["ELEC", "VAT7", 59_000, 4_130, 63_130],
    ["WATER", "VAT7", 9_600, 672, 10_272],
  ], "บรรทัด");
  eq([b.subtotalSatang, b.vatSatang, b.totalSatang], [548_600, 6_902, 555_502], "ยอด");
});

check("D1-VAT-SERVICE", "#21/#40 ค่าบริการอื่นแยกบรรทัด (ที่จอด VAT7) · ค่าปรับ NONE · ทับชนิดภาษีได้", () => {
  const b = C().buildDormBill({
    rentSatang: 450_000,
    commonFeeSatang: 30_000,
    electricity: null,
    water: null,
    lateFeeSatang: 20_000,
    services: [
      { code: "PARKING", labelTh: "ที่จอดรถยนต์", amountSatang: 50_000 },
      { code: "CLEANING", labelTh: "ทำความสะอาดห้อง", amountSatang: 20_000, taxKind: "EXEMPT" },
      { code: "ZERO", labelTh: "ไม่มีค่า", amountSatang: 0 },
    ],
    vat: { registered: true, pricesIncludeVat: false },
  });
  eq(b.lines.map((l) => l.code), ["RENT", "COMMON", "SERVICE:PARKING", "SERVICE:CLEANING", "LATE_FEE"], "ลำดับ/บรรทัดศูนย์ไม่ออก");
  const by = Object.fromEntries(b.lines.map((l) => [l.code, [l.taxKind, l.vatSatang]]));
  eq(by["SERVICE:PARKING"], ["VAT7", 3_500], "ที่จอด VAT 7%");
  eq(by["SERVICE:CLEANING"], ["EXEMPT", 0], "ทับเป็นยกเว้น");
  eq(by["LATE_FEE"], ["NONE", 0], "ค่าปรับ (ค่าเริ่ม NONE · รอที่ปรึกษา)");
  const b2 = C().buildDormBill({
    rentSatang: 450_000,
    commonFeeSatang: 0,
    electricity: null,
    water: null,
    taxKinds: { RENT: "VAT7" },
    vat: { registered: true, pricesIncludeVat: false },
  });
  eq(b2.lines.map((l) => [l.code, l.taxKind, l.vatSatang]), [["RENT", "VAT7", 31_500]], "ทับชนิดภาษีค่าห้อง (เช่น ใช้เชิงพาณิชย์) · ส่วนกลาง 0 ไม่ออกบรรทัด");
});

check("D1-VAT-ACCOUNT", "สูตร VAT ต่อบรรทัดตรงกับ computeTotals ของบัญชี V2 (ใบแจ้งหนี้ D.2 ต้องได้ยอดเดียวกัน) · สุ่ม 300 บิล", () => {
  const rnd = mulberry32(0xd1_0a7);
  for (let i = 0; i < 300; i++) {
    const incl = rnd() < 0.5;
    const lines = Array.from({ length: 1 + Math.floor(rnd() * 6) }, (_, j) => ({
      code: `X${j}`,
      labelTh: `รายการ ${j}`,
      amountSatang: 1 + Math.floor(rnd() * 2_000_000),
      taxKind: (rnd() < 0.35 ? "EXEMPT" : "VAT7") as TaxKind,
    }));
    const ours = C().computeBill({ lines, vat: { registered: true, pricesIncludeVat: incl } });
    const acc = ACC().computeTotals({
      lines: lines.map((l) => ({ description: l.labelTh, qty: 1, unitPrice: l.amountSatang, vatRateBp: l.taxKind === "VAT7" ? 700 : -1 })),
      vatMode: incl ? "INCLUDE" : "EXCLUDE",
      vatRegistered: true,
      vatRateBp: 700,
    });
    eq(ours.vatSatang, acc.vatAmount, `บิล ${i} vat`);
    eq(ours.totalSatang, acc.grandTotal, `บิล ${i} total`);
    eq(ours.lines.map((l) => l.vatSatang), acc.lines.map((l) => l.vat), `บิล ${i} vat ต่อบรรทัด`);
  }
});

// ═════════════════════ ง. ฉากบิลห้อง 204 (README · ภาพ 04 05) ═════════════════════
console.log("\nง. ฉากบิลห้อง 204");

check("D1-B204-LINES", "204 ณัฐชา: ค่าห้อง 4,500 · ส่วนกลาง 300 · ไฟ 1,287→1,412 125×4.72 = 590 · น้ำ 0312→0318 6×16 = 96 · ยอด ฿5,486.00", () => {
  const b = bill204({ registered: false, pricesIncludeVat: true });
  eq(b.lines.map((l) => [l.code, l.qty, l.unitPriceSatang, l.amountSatang]), [
    ["RENT", 1, 450_000, 450_000],
    ["COMMON", 1, 30_000, 30_000],
    ["ELEC", 125, 472, 59_000],
    ["WATER", 6, 1_600, 9_600],
  ], "qty/ราคาต่อหน่วย/ยอด (กฎหมาย: แสดงหน่วย+ราคาต่อหน่วย)");
  const el = b.lines.find((l) => l.code === "ELEC");
  const wa = b.lines.find((l) => l.code === "WATER");
  eq([el?.meta?.from, el?.meta?.to, el?.meta?.units, el?.meta?.segments], [1287, 1412, 125, 1], "meta ไฟ");
  eq([wa?.meta?.from, wa?.meta?.to, wa?.meta?.units], [312, 318, 6], "meta น้ำ");
  eq(b.totalSatang, 548_600, "ยอดชำระ ฿5,486.00");
  ok(b.lines.every((l) => hasThai(l.labelTh)), "ทุกบรรทัดต้องมีป้ายไทย");
});

check("D1-B204-FLEX", "204 ภาพ 05 (LINE): ค่าห้อง+ส่วนกลาง 4,800 · ไฟ 590 · น้ำ 96 · ประมาณน้ำไฟ ฿686 (ภาพ 03)", () => {
  const b = bill204({ registered: false, pricesIncludeVat: true });
  const g = (c: string) => b.lines.filter((l) => l.code === c).reduce((s, l) => s + l.grossSatang, 0);
  eq([g("RENT") + g("COMMON"), g("ELEC"), g("WATER"), g("ELEC") + g("WATER")], [480_000, 59_000, 9_600, 68_600], "ยอดย่อย");
});

check("D1-B-ALLOCATED", "บิลที่น้ำมาจากมิเตอร์รวม (ALLOCATED) + ไฟเหมา (FLAT) ออกบรรทัดได้", () => {
  const b = C().buildDormBill({
    rentSatang: 450_000,
    commonFeeSatang: 30_000,
    electricity: { kind: "FLAT", method: { kind: "FLAT", per: "PERSON", satang: 15_000, persons: 2 } },
    water: { kind: "ALLOCATED", amountSatang: 3_334 },
    vat: { registered: false, pricesIncludeVat: true },
  });
  eq(b.lines.map((l) => [l.code, l.qty, l.amountSatang]), [
    ["RENT", 1, 450_000],
    ["COMMON", 1, 30_000],
    ["ELEC", 2, 30_000],
    ["WATER", 1, 3_334],
  ], "บรรทัด");
  eq(b.totalSatang, 513_334, "ยอด");
});

// ═════════════════════ จ. รอบบิล พ.ย. 31 บิล = ฿174,126.40 (ภาพ 04 · 01 · 06 · 14) ═════════════════════
console.log("\nจ. รอบบิล พ.ย. 2569 — 31 บิล");

type Grp = "PAID" | "SLIP" | "UNPAID";
type Src = "04" | "06" | "03" | "fixture";
type FixRoom = { room: string; large: boolean; elec: MeterSegment[]; water: MeterSegment[]; late: boolean; group: Grp; src: Src; screenTotal?: number };
// [ห้อง, หน่วยไฟ, หน่วยน้ำ, ค่าปรับ, กลุ่ม, ที่มา, ยอดบนจอ]
const RAW: [string, number, number, boolean, Grp, Src, number?][] = [
  ["101", 118, 8, false, "PAID", "fixture"],
  ["102", 88, 6, false, "PAID", "fixture"],
  ["103", 95, 7, false, "PAID", "fixture"],
  ["104", 120, 1, false, "SLIP", "06", 538_240], // ยอดจากภาพ 06 · หน่วยแก้สมการ 4.72e+16w = 582.40 ได้คำตอบเดียว (120/1)
  ["105", 102, 6, false, "PAID", "fixture"],
  ["106", 148, 6, false, "UNPAID", "fixture"],
  ["107", 76, 5, false, "PAID", "fixture"],
  ["109", 91, 7, false, "PAID", "fixture"],
  ["110", 84, 6, false, "PAID", "fixture"],
  ["111", 99, 7, false, "PAID", "fixture"],
  ["112", 173, 8, false, "PAID", "03"], // เปลี่ยนมิเตอร์ 8,904→(ถอด 8,951 = fixture) + ตัวใหม่ 0→126
  ["201", 142, 7, false, "PAID", "04", 628_224],
  ["202", 156, 11, false, "PAID", "04", 571_232],
  ["203", 98, 5, true, "PAID", "04", 554_256],
  ["204", 125, 6, false, "PAID", "04", 548_600],
  ["205", 110, 6, false, "PAID", "04", 541_520],
  ["206", 131, 9, false, "SLIP", "04", 556_232],
  ["208", 105, 7, false, "PAID", "fixture"],
  ["209", 87, 6, false, "PAID", "fixture"],
  ["211", 139, 5, true, "UNPAID", "fixture"], // ค่าปรับใบที่ 2 (README รวมค่าปรับ ฿400 = 2 × ฿200)
  ["212", 121, 8, false, "PAID", "fixture"],
  ["301", 110, 8, false, "PAID", "fixture"],
  ["303", 82, 6, false, "PAID", "fixture"],
  ["304", 93, 7, false, "PAID", "fixture"],
  ["305", 152, 6, false, "UNPAID", "fixture"],
  ["306", 79, 5, false, "PAID", "fixture"],
  ["307", 90, 6, false, "PAID", "fixture"],
  ["308", 86, 7, false, "PAID", "fixture"],
  ["309", 412, 6, false, "SLIP", "04", 684_064],
  ["310", 128, 5, false, "UNPAID", "fixture"],
  ["312", 80, 5, false, "PAID", "fixture"],
];
const LARGE = new Set(["101", "112", "201", "212", "301", "312"]);
const FIX: FixRoom[] = RAW.map(([room, e, w, late, group, src, screenTotal], i) => {
  let elec: MeterSegment[] = [{ start: 1000 + i * 97, end: 1000 + i * 97 + e }];
  let water: MeterSegment[] = [{ start: 100 + i * 11, end: 100 + i * 11 + w }];
  if (room === "204") {
    elec = [{ start: 1287, end: 1412 }];
    water = [{ start: 312, end: 318 }];
  }
  if (room === "112") elec = [{ start: 8904, end: 8951 }, { start: 0, end: 126 }];
  return { room, large: LARGE.has(room), elec, water, late, group, src, screenTotal };
});

function runNov(vat: VatCfg = { registered: false, pricesIncludeVat: true }) {
  const c = C();
  // อัตราจากบิลจริงผ่านฟังก์ชัน ไม่ฮาร์ดโค้ด 472/1600
  const elecRate = c.actualCostRate({ billSatang: 1_982_400, units: 4200 });
  const waterRate = c.actualCostRate({ billSatang: 384_000, units: 240 });
  if (elecRate === null || waterRate === null) throw new AssertFail("actualCostRate คืน null");
  return FIX.map((r) => {
    const fee = r.late ? c.lateFee({ policy: SAMPLE_LATE, dueDate: "2026-10-05", paidDate: "2026-10-09", overdueSatang: 500_000 }).feeSatang : 0;
    const bill = c.buildDormBill({
      rentSatang: r.large ? 520_000 : 450_000,
      commonFeeSatang: 30_000,
      electricity: { kind: "METERED", segments: r.elec, method: { kind: "FIXED_RATE", satangPerUnit: elecRate } },
      water: { kind: "METERED", segments: r.water, method: { kind: "FIXED_RATE", satangPerUnit: waterRate } },
      lateFeeSatang: fee,
      vat,
    });
    return { r, bill };
  });
}

check("D1-RUN-TOTAL", "31 บิล รวม ฿174,126.40 · ค่าห้อง 143,700 + ส่วนกลาง 9,300 + ไฟ 17,558.40 + น้ำ 3,168 + ค่าปรับ 400", () => {
  const run = runNov();
  const s = C().sumBills(run.map((x) => x.bill));
  eq(s.count, 31, "จำนวนบิล");
  eq(s.totalSatang, 17_412_640, "รวมทั้งรอบ");
  eq(s.vatSatang, 0, "ไม่จด VAT");
  eq(
    [s.byCode.RENT, s.byCode.COMMON, s.byCode.ELEC, s.byCode.WATER, s.byCode.LATE_FEE],
    [14_370_000, 930_000, 1_755_840, 316_800, 40_000],
    "แยกประเภท (ภาพ 04 การ์ดบน)",
  );
});

check("D1-RUN-UNITS", "หน่วยรวม: ไฟ 3,720 หน่วย · น้ำ 198 หน่วย (ห้อง 112 นับ 2 มิเตอร์)", () => {
  const run = runNov();
  const sumQty = (code: string) => run.reduce((s, x) => s + x.bill.lines.filter((l) => l.code === code).reduce((a, l) => a + l.qty, 0), 0);
  eq([sumQty("ELEC"), sumQty("WATER")], [3720, 198], "หน่วย");
  const b112 = run.find((x) => x.r.room === "112")?.bill;
  const l112 = b112?.lines.find((l) => l.code === "ELEC");
  eq([l112?.qty, l112?.meta?.segments, l112?.amountSatang], [173, 2, 81_656], "112 เปลี่ยนมิเตอร์คิดรวม 2 ตัว");
});

check("D1-RUN-ROOMS", "ยอดรายห้องตรงจอ: 201 · 202 · 203 (ค่าปรับ) · 204 · 205 · 206 · 309 (ภาพ 04) · 104 (ภาพ 06)", () => {
  const run = runNov();
  for (const { r, bill } of run) if (r.screenTotal !== undefined) eq(bill.totalSatang, r.screenTotal, `ห้อง ${r.room}`);
  const b203 = run.find((x) => x.r.room === "203")?.bill;
  eq(b203?.lines.find((l) => l.code === "LATE_FEE")?.amountSatang, 20_000, "203 ปรับช้า ต.ค. 4 วัน ฿200");
  const b309 = run.find((x) => x.r.room === "309")?.bill;
  eq(b309?.lines.find((l) => l.code === "ELEC")?.amountSatang, 194_464, "309 ไฟ 412 หน่วย ฿1,944.64");
});

check("D1-RUN-GROUPS", "แยกกลุ่ม 3 พ.ย. (ภาพ 01/06): จ่ายแล้ว 24 ฿133,912.80 · สลิปรอตรวจ 3 ฿17,785.36 · ยังไม่จ่าย 4 ฿22,428.24", () => {
  const run = runNov();
  const g = (grp: Grp) => run.filter((x) => x.r.group === grp);
  const sum = (xs: { bill: DormBillResult }[]) => xs.reduce((s, x) => s + x.bill.totalSatang, 0);
  eq([g("PAID").length, g("SLIP").length, g("UNPAID").length], [24, 3, 4], "จำนวน");
  eq([sum(g("PAID")), sum(g("SLIP")), sum(g("UNPAID"))], [13_391_280, 1_778_536, 2_242_824], "ยอด");
  eq(17_412_640 - sum(g("PAID")), 4_021_360, "รอเก็บ ฿40,213.60 (ภาพ 01)");
});

check("D1-RUN-LEGAL", "#10 ทั้งรอบไม่เกินบิลการไฟฟ้า/ประปา (STRICT ผ่าน) · ต้นทุนส่วนต่างที่หอแบก ฿2,937.60 (ภาพ 14)", () => {
  const s = C().sumBills(runNov().map((x) => x.bill));
  eq(L().evaluateLegal("UTIL_TOTAL_LE_BILL", { chargedTotalSatang: s.byCode.ELEC, authorityBillSatang: 1_982_400 }, { mode: "STRICT" }).level, "OK", "ไฟ");
  eq(L().evaluateLegal("UTIL_TOTAL_LE_BILL", { chargedTotalSatang: s.byCode.WATER, authorityBillSatang: 384_000 }, { mode: "STRICT" }).level, "OK", "น้ำ");
  eq(1_982_400 - s.byCode.ELEC + (384_000 - s.byCode.WATER), 293_760, "ต้นทุนหอแบก (ส่วนกลาง+ห้องว่าง)");
  eq(L().evaluateLegal("UTIL_FIXED_RATE_LE_COST", { rateSatangPerUnit: 472, ...COST }, { mode: "STRICT" }).level, "OK", "อัตรา 4.72 = ต้นทุน");
});

check("D1-RUN-VAT", "รอบเดียวกันถ้าหอจด VAT (รวม VAT): ยอดรวมเท่าเดิม · VAT เฉพาะส่วนกลาง/ไฟ/น้ำ · ค่าห้องไม่มี VAT", () => {
  const run = runNov({ registered: true, pricesIncludeVat: true });
  const s = C().sumBills(run.map((x) => x.bill));
  eq(s.totalSatang, 17_412_640, "รวม VAT แล้วยอดไม่เปลี่ยน");
  ok(s.vatSatang > 0, "ต้องมี VAT");
  for (const { r, bill } of run) {
    eq(bill.lines.filter((l) => l.code === "RENT").map((l) => [l.taxKind, l.vatSatang]), [["EXEMPT", 0]], `ห้อง ${r.room} ค่าห้อง`);
    ok(bill.lines.filter((l) => ["COMMON", "ELEC", "WATER"].includes(l.code)).every((l) => l.taxKind === "VAT7"), `ห้อง ${r.room} น้ำไฟส่วนกลาง VAT7`);
  }
});

// ═════════════════════ ฉ. ย้ายออกห้อง 207 คืน ฿7,759.28 (README · ภาพ 07) ═════════════════════
console.log("\nฉ. ย้ายออก 207 · คืนประกัน");

const util207: SettleInput["utilities"] = [
  { code: "ELEC", input: { kind: "METERED", segments: [{ start: 2000, end: 2126 }], method: ELEC_COST } },
  { code: "WATER", input: { kind: "METERED", segments: [{ start: 383, end: 389 }], method: WATER_COST } },
];
const dmg207: SettleInput["damages"] = [
  { labelTh: "มุ้งลวดหน้าต่าง ขาด 20 ซม.", amountSatang: 35_000, kind: "DAMAGE", evidenceCount: 2 },
  { labelTh: "กุญแจห้อง คืน 1 จาก 2 ดอก", amountSatang: 20_000, kind: "DAMAGE", evidenceCount: 1 },
];
const settle207 = (over: Partial<SettleInput> = {}) =>
  C().settleDeposit({
    depositSatang: 900_000,
    utilities: util207,
    damages: dmg207,
    unpaidSatang: 0,
    approvalThresholdSatang: 200_000,
    legal: { mode: "STRICT" },
    ...over,
  });

check("D1-207-REFUND", "207 ธนพล: 9,000 − 594.72 − 96.00 − 350 − 200 − 0 = ฿7,759.28 · ไม่ต้องอนุมัติ (หัก 550 < 2,000)", () => {
  const r = settle207();
  if (!r.ok) throw new AssertFail(`ต้อง ok ได้ ${fmt(r)}`);
  eq([r.refundSatang, r.tenantOwesSatang, r.utilitiesSatang, r.damagesSatang, r.unpaidSatang, r.needsApproval], [775_928, 0, 69_072, 55_000, 0, false], "สรุป");
  eq(r.lines.map((l) => [l.code, l.amountSatang]), [
    ["DEPOSIT", 900_000],
    ["ELEC", -59_472],
    ["WATER", -9_600],
    ["DAMAGE", -35_000],
    ["DAMAGE", -20_000],
    ["UNPAID", 0],
  ], "บรรทัด (ภาพ 07)");
  eq(r.lines.reduce((s, l) => s + l.amountSatang, 0), r.refundSatang - r.tenantOwesSatang, "Σ บรรทัด = คืน − ผู้เช่าค้าง");
  ok(r.lines.every((l) => hasThai(l.labelTh)), "ป้ายไทยทุกบรรทัด");
  eq(r.legal.every((o) => o.level === "OK"), true, "ทุกรายการหักผ่านตัวตรวจ");
});

check("D1-207-DUE", "#47 ครบกำหนดคืนประกัน 7 วันหลังย้ายออก 31 ต.ค. = ส. 7 พ.ย. 2569", () => {
  eq(C().addDaysYmd("2026-10-31", 7), "2026-11-07", "วันครบ");
  eq(L().evaluateLegal("DEPOSIT_RETURN_DAYS", { days: 7 }, { mode: "STRICT" }).level, "OK", "7 วันผ่าน");
});

check("D1-207-WEAR", "#49 หักค่าเสื่อมปกติ ⇒ ไม่ได้ทุกโหมด · หักไม่มีหลักฐาน ⇒ STRICT ไม่ได้ / WARN ได้แต่ต้องอนุมัติเจ้าของ", () => {
  const wear = [{ labelTh: "ทาสีผนังทั้งห้อง", amountSatang: 150_000, kind: "NORMAL_WEAR" as const, evidenceCount: 4 }, ...dmg207];
  for (const mode of ["STRICT", "WARN"] as const) {
    const r = settle207({ damages: wear, legal: { mode } });
    eq(r.ok ? "ok" : [r.code, r.index], ["DEDUCT_NORMAL_WEAR", 0], `ค่าเสื่อม ${mode}`);
  }
  const r3 = settle207({ damages: wear, legal: { mode: "OUT_OF_SCOPE", outOfScopeReason: REASON } });
  eq(r3.ok ? "ok" : r3.code, "DEDUCT_NORMAL_WEAR", "ค่าเสื่อม OUT_OF_SCOPE");
  const noEv = [dmg207[0], { ...dmg207[1], evidenceCount: 0 }];
  const s = settle207({ damages: noEv });
  eq(s.ok ? "ok" : [s.code, s.index], ["DEDUCT_NO_EVIDENCE", 1], "ไม่มีหลักฐาน STRICT");
  const w = settle207({ damages: noEv, legal: { mode: "WARN" } });
  if (!w.ok) throw new AssertFail(`WARN ต้องผ่านแบบมีเงื่อนไข ได้ ${fmt(w)}`);
  ok(w.legal.some((o) => o.level === "WARN" && o.needsOwnerApproval && o.code === "DEDUCT_NO_EVIDENCE"), "WARN ต้องมีผลที่ต้องอนุมัติเจ้าของ");
  eq(w.refundSatang, 775_928, "ยอดคืนเท่าเดิม");
});

check("D1-207-APPROVAL", "#48 หักค่าเสียหายเกินวงเงิน ⇒ needsApproval · หักเกินประกัน ⇒ คืน 0 + ผู้เช่าค้าง", () => {
  const a = settle207({ approvalThresholdSatang: 50_000 });
  eq(a.ok ? a.needsApproval : "fail", true, "550 > 500");
  const b = settle207({ approvalThresholdSatang: 55_000 });
  eq(b.ok ? b.needsApproval : "fail", false, "550 = วงเงิน ไม่เกิน");
  const c = settle207({ depositSatang: 50_000, damages: [{ labelTh: "ประตูพัง", amountSatang: 80_000, kind: "DAMAGE", evidenceCount: 2 }] });
  if (!c.ok) throw new AssertFail(`ต้อง ok ได้ ${fmt(c)}`);
  eq([c.refundSatang, c.tenantOwesSatang], [0, 99_072], "500 − 690.72 − 800 ⇒ ค้าง 990.72");
  eq(c.lines.reduce((s, l) => s + l.amountSatang, 0), -99_072, "Σ บรรทัด = −ค้าง");
  const d = settle207({ unpaidSatang: 521_400 });
  eq(d.ok ? [d.refundSatang, d.unpaidSatang] : "fail", [254_528, 521_400], "หักค่าห้องค้าง");
});

// ═════════════════════ ช. property · ไม่มีทศนิยมลอย ═════════════════════
console.log("\nช. property (สุ่ม seed คงที่) · ไม่มีทศนิยมลอย");

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

check("D1-PROP-BILL", "สุ่ม 500 บิล (ทุกวิธีน้ำไฟ × VAT 3 แบบ): Σบรรทัด = ยอดบิล · net+vat = gross · ไม่จด VAT = 0 · ค่าห้องไม่มี VAT · ทุกตัวเลขเป็นจำนวนเต็ม", () => {
  const rnd = mulberry32(20261027);
  const ri = (n: number) => Math.floor(rnd() * n);
  const methods = (): UtilityInput => {
    const k = ri(5);
    const prev = ri(9000);
    const seg = [{ start: prev, end: prev + ri(600) }];
    if (k === 0) return { kind: "METERED", segments: seg, method: { kind: "ACTUAL_COST", billSatang: 1 + ri(5_000_000), billUnits: 1 + ri(9000) } };
    if (k === 1)
      return {
        kind: "METERED",
        segments: [...seg, { start: 0, end: ri(300) }],
        method: { kind: "TARIFF", tiers: [{ uptoUnits: 150, rateE4: 30_000 + ri(5000) }, { uptoUnits: null, rateE4: 40_000 + ri(9000) }], ftE4: ri(5000) },
      };
    if (k === 2) return { kind: "METERED", segments: seg, method: { kind: "FIXED_RATE", satangPerUnit: ri(2000) }, minimumSatang: rnd() < 0.3 ? ri(20_000) : null };
    if (k === 3) return { kind: "FLAT", method: { kind: "FLAT", per: "PERSON", satang: ri(50_000), persons: 1 + ri(4) } };
    return { kind: "ALLOCATED", amountSatang: ri(300_000) };
  };
  for (let i = 0; i < 500; i++) {
    const vatPick = ri(3);
    const vat: VatCfg = vatPick === 0 ? { registered: false, pricesIncludeVat: true } : { registered: true, pricesIncludeVat: vatPick === 1 };
    const input: BuildInput = {
      rentSatang: 1 + ri(2_000_000),
      commonFeeSatang: ri(100_000),
      electricity: rnd() < 0.9 ? methods() : null,
      water: rnd() < 0.9 ? methods() : null,
      lateFeeSatang: rnd() < 0.3 ? ri(50_000) : 0,
      services: rnd() < 0.5 ? [{ code: "PARKING", labelTh: "ที่จอดรถ", amountSatang: ri(100_000) }] : [],
      vat,
    };
    const b = C().buildDormBill(input);
    const bad = allInts(b);
    if (bad) throw new AssertFail(`บิล ${i} มีทศนิยม ${bad}`);
    eq(b.lines.reduce((s, l) => s + l.grossSatang, 0), b.totalSatang, `บิล ${i} Σgross = total`);
    eq(b.lines.reduce((s, l) => s + l.vatSatang, 0), b.vatSatang, `บิล ${i} Σvat`);
    eq(b.lines.reduce((s, l) => s + l.netSatang, 0), b.subtotalSatang, `บิล ${i} Σnet`);
    for (const l of b.lines) {
      eq(l.netSatang + l.vatSatang, l.grossSatang, `บิล ${i} ${l.code} net+vat`);
      if (!vat.registered) eq([l.taxKind, l.vatSatang, l.grossSatang], ["NONE", 0, l.amountSatang], `บิล ${i} ${l.code} ไม่จด VAT`);
      if (vat.registered && vat.pricesIncludeVat) eq(l.grossSatang, l.amountSatang, `บิล ${i} ${l.code} รวม VAT ⇒ gross = ราคาที่กรอก`);
      if (vat.registered && !vat.pricesIncludeVat) eq(l.netSatang, l.amountSatang, `บิล ${i} ${l.code} ไม่รวม VAT ⇒ net = ราคาที่กรอก`);
      ok(l.amountSatang >= 0, `บิล ${i} ${l.code} ยอดติดลบ`);
    }
    eq(b.lines.find((l) => l.code === "RENT")?.vatSatang, 0, `บิล ${i} ค่าห้องไม่มี VAT`);
    eq(b.lines[0]?.code, "RENT", `บิล ${i} บรรทัดแรกเป็นค่าห้อง`);
  }
});

check("D1-PROP-SHARED", "สุ่ม 500 ชุดเฉลี่ยมิเตอร์รวม: ผลรวม = ยอดเป๊ะ · แต่ละห้องห่างสัดส่วนจริง < 1 สตางค์ · ไม่ติดลบ", () => {
  const rnd = mulberry32(0x5_4a2e);
  const ri = (n: number) => Math.floor(rnd() * n);
  for (let i = 0; i < 500; i++) {
    const basis = (["PERSON", "ROOM", "AREA"] as const)[ri(3)];
    const rooms = Array.from({ length: 1 + ri(40) }, (_, j) => ({ roomId: `R${j}`, persons: 1 + ri(4), areaSqmE2: 1500 + ri(4000) }));
    const total = ri(10_000_000);
    const out = C().allocateShared({ totalSatang: total, basis, rooms });
    eq(out.reduce((s, x) => s + x.amountSatang, 0), total, `ชุด ${i} ผลรวม`);
    const w = rooms.map((r) => (basis === "ROOM" ? 1 : basis === "PERSON" ? r.persons : r.areaSqmE2));
    const W = w.reduce((s, x) => s + x, 0);
    out.forEach((x, j) => {
      ok(Number.isInteger(x.amountSatang) && x.amountSatang >= 0, `ชุด ${i} ห้อง ${j} ไม่ใช่จำนวนเต็มบวก`);
      ok(Math.abs(x.amountSatang * W - total * w[j]) < W, `ชุด ${i} ห้อง ${j} ห่างสัดส่วน ≥ 1 สตางค์`);
    });
  }
});

check("D1-PROP-SETTLE", "สุ่ม 300 ใบย้ายออก: Σบรรทัด = คืน − ค้าง · คืน/ค้างไม่ติดลบ และไม่เกิดพร้อมกัน · จำนวนเต็ม", () => {
  const rnd = mulberry32(0x207);
  const ri = (n: number) => Math.floor(rnd() * n);
  for (let i = 0; i < 300; i++) {
    const r = C().settleDeposit({
      depositSatang: ri(3_000_000),
      utilities: [{ code: "ELEC", input: { kind: "METERED", segments: [{ start: 0, end: ri(500) }], method: { kind: "FIXED_RATE", satangPerUnit: ri(900) } } }],
      damages: Array.from({ length: ri(4) }, (_, j) => ({ labelTh: `ความเสียหาย ${j}`, amountSatang: ri(500_000), kind: "DAMAGE" as const, evidenceCount: 1 })),
      unpaidSatang: rnd() < 0.3 ? ri(1_000_000) : 0,
      approvalThresholdSatang: 200_000,
      legal: { mode: "STRICT" },
    });
    if (!r.ok) throw new AssertFail(`ใบ ${i} ต้อง ok`);
    const bad = allInts(r);
    if (bad) throw new AssertFail(`ใบ ${i} มีทศนิยม ${bad}`);
    eq(r.lines.reduce((s, l) => s + l.amountSatang, 0), r.refundSatang - r.tenantOwesSatang, `ใบ ${i} Σ`);
    ok(r.refundSatang >= 0 && r.tenantOwesSatang >= 0 && (r.refundSatang === 0 || r.tenantOwesSatang === 0), `ใบ ${i} คืน/ค้างผิด`);
  }
});

check("D1-NOFLOAT-IN", "อินพุตเงิน/เลขมิเตอร์ทศนิยม ⇒ throw (ไม่ปัดเงียบ)", () => {
  const c = C();
  throwsCode(() => c.buildDormBill({ rentSatang: 450_000.5, commonFeeSatang: 0, vat: { registered: false, pricesIncludeVat: true } }), "NON_INTEGER_SATANG", "ค่าห้อง");
  throwsCode(() => c.buildDormBill({ rentSatang: 450_000, commonFeeSatang: 0, lateFeeSatang: 50.5, vat: { registered: false, pricesIncludeVat: true } }), "NON_INTEGER_SATANG", "ค่าปรับ");
  throwsCode(() => c.utilityCharge({ method: { kind: "FIXED_RATE", satangPerUnit: 4.72 }, units: 10 }), "NON_INTEGER_SATANG", "อัตรา ฿4.72 เป็นบาท");
  throwsCode(() => c.prorate({ monthlySatang: 4500.5, days: 3, daysInMonth: 30, mode: "ACTUAL_DAYS" }), "NON_INTEGER_SATANG", "prorate");
  throwsCode(() => c.allocateShared({ totalSatang: 100.5, basis: "ROOM", rooms: [{ roomId: "A" }] }), "NON_INTEGER_SATANG", "allocate");
  throwsCode(() => c.lateFee({ policy: { kind: "PER_DAY", amountSatang: 50.5, graceDays: 0 }, dueDate: "2026-10-05", paidDate: "2026-10-09", overdueSatang: 1 }), "NON_INTEGER_SATANG", "lateFee");
  throwsCode(() => c.computeBill({ lines: [{ code: "X", labelTh: "x", amountSatang: 1.25 }], vat: { registered: true, pricesIncludeVat: true } }), "NON_INTEGER_SATANG", "computeBill");
});

check("D1-NOFLOAT-OUT", "ผลลัพธ์ทุกฟังก์ชันในฉากข้างบนเป็นจำนวนเต็มล้วน", () => {
  const c = C();
  const outs: unknown[] = [
    runNov().map((x) => x.bill),
    runNov({ registered: true, pricesIncludeVat: true }).map((x) => x.bill),
    runNov({ registered: true, pricesIncludeVat: false }).map((x) => x.bill),
    settle207(),
    c.utilityCharge({ method: { kind: "TARIFF", tiers: [{ uptoUnits: null, rateE4: 33_333 }], ftE4: 1_111 }, units: 7 }),
    c.allocateShared({ totalSatang: 1_982_400, basis: "AREA", rooms: [{ roomId: "a", areaSqmE2: 2433 }, { roomId: "b", areaSqmE2: 1777 }] }),
    c.lateFee({ policy: { kind: "PERCENT", percentBp: 333, graceDays: 0 }, dueDate: "2026-10-05", paidDate: "2026-10-09", overdueSatang: 548_601 }),
  ];
  for (const o of outs) {
    const bad = allInts(o);
    if (bad) throw new AssertFail(`ทศนิยมลอย ${bad}`);
  }
});

// ═════════════════════ ซ. ความบริสุทธิ์ของไฟล์ (pure · ไม่มี float เงิน) ═════════════════════
console.log("\nซ. pure");

const ALLOWED_IMPORT = [/^zod(\/.*)?$/, /^\.\.?\//, /^@\/lib\/core\/settings\//, /^@\/lib\/modules\/account\/totals$/, /^@\/lib\/modules\/dorm\/calc$/];
const FORBIDDEN_SRC: [RegExp, string][] = [
  [/Date\.now\(/, "Date.now("],
  [/Math\.random\(/, "Math.random("],
  [/new Date\(\s*\)/, "new Date()"],
  [/\.toFixed\(/, "toFixed("],
  [/parseFloat\(/, "parseFloat("],
  [/:\s*any\b|as any\b|<any>/, "any"],
];
for (const [id, p] of [
  ["D1-PURE-LEGAL", LEGAL_PATH],
  ["D1-PURE-CALC", CALC_PATH],
] as const) {
  check(id, `«${p}» pure: import เฉพาะ zod/ไฟล์ settings/account totals · ไม่มีนาฬิกา/สุ่ม/toFixed/any`, () => {
    const abs = resolve(ROOT, p);
    if (!existsSync(abs)) throw new Missing(`ไฟล์ยังไม่มี: «${p}»`);
    // ตัดคอมเมนต์ก่อนตรวจ (กันคำว่า any/Date ในคำอธิบาย) — ข้อความใน string ยังถูกตรวจ
    const src = readFileSync(abs, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    const specs = [...src.matchAll(/(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|^\s*import\s*["']([^"']+)["']/gm)].map((m) => m[1] ?? m[2] ?? m[3]);
    for (const s of specs) ok(ALLOWED_IMPORT.some((re) => re.test(s)), `import ต้องห้าม: "${s}"`);
    for (const [re, label] of FORBIDDEN_SRC) ok(!re.test(src), `พบ ${label}`);
  });
}

// ═════════════════════ ฌ. defs/rooms.ts (พึ่ง R0.3) ═════════════════════
console.log("\nฌ. ค่าตั้งหอ defs/rooms.ts (ต้องมี registry ของ R0.3)");

const DEF_CHECKS: [string, string][] = [
  ["D1-DEF-COUNT", "listDefs('rooms') ≥ 83 ค่า · แม่แบบ APARTMENT/STUDENT_DORM/SMALL_HOTEL/SERVICED_APT"],
  ["D1-DEF-DEFAULTS", "ค่าเริ่ม APARTMENT ตามภาคผนวก ก (คีย์ที่ใบสั่ง §4 ผูก)"],
  ["D1-DEF-LEGALREF", "ทุก def.legal ชี้ ruleId ที่มีจริง · คีย์กฎหมายผูกตัวตรวจถูกตัว · template ทุกตัวมี TEMPLATE_NO_THREAT"],
  ["D1-DEF-OWNERONLY", "#2 rooms.legal.mode ownerOnly + sensitivity LEGAL"],
  ["D1-DEF-HOTEL-HIDDEN", "ค่าโรงแรม rooms.hotel.* ซ่อน hiddenUntil PHASE_H"],
  ["D1-DEF-SNAPSHOT", "SNAPSHOT_KEYS.lease / .bill มีคีย์ที่สัญญา/บิลต้องจด"],
  ["D1-DEF-TEMPLATES-LEGAL", "ค่าเริ่มของทุกแม่แบบผ่านตัวตรวจในโหมด STRICT"],
];

type RegistryApi = {
  listDefs: (domain: string, group?: string) => {
    key: string;
    type: string;
    defaults: Record<string, unknown>;
    legal?: string[];
    ownerOnly?: boolean;
    sensitivity?: string;
    hiddenUntil?: string;
  }[];
  getDef: (key: string) => { key: string; type: string; defaults: Record<string, unknown>; legal?: string[]; ownerOnly?: boolean; sensitivity?: string } | undefined;
  TEMPLATES: Record<string, unknown>;
  SNAPSHOT_KEYS: Record<string, readonly string[]>;
};

if (!existsSync(resolve(ROOT, REGISTRY_PATH))) {
  for (const [id, name] of DEF_CHECKS) skip(id, name, `R0.3 ยังไม่ลง (ไม่มี «${REGISTRY_PATH}») — ใบสั่ง D.1 §1: ทำ defs/rooms.ts หลัง R0.3`);
} else {
  const defsLoad = await tryImport(DEFS_PATH);
  const regLoad = await tryImport(REGISTRY_PATH);
  const R = (): RegistryApi => {
    if (!defsLoad.mod) throw new Missing(`ยังไม่มี «${DEFS_PATH}» (${defsLoad.err})`);
    if (!regLoad.mod) throw new Missing(`โหลด registry ไม่ได้ (${regLoad.err})`);
    return regLoad.mod as unknown as RegistryApi;
  };
  const TPLS = ["APARTMENT", "STUDENT_DORM", "SMALL_HOTEL", "SERVICED_APT"];
  const dflt = (key: string, tpl = "APARTMENT"): unknown => {
    const d = R().getDef(key);
    if (!d) throw new AssertFail(`ไม่มี def ${key}`);
    return tpl in d.defaults ? d.defaults[tpl] : d.defaults._fallback;
  };
  check(DEF_CHECKS[0][0], DEF_CHECKS[0][1], () => {
    ok(R().listDefs("rooms").length >= 83, `มี ${R().listDefs("rooms").length} ค่า`);
    const t = R().TEMPLATES.rooms;
    const names = Array.isArray(t) ? t.map((x) => (typeof x === "string" ? x : (x as { key: string }).key)) : Object.keys((t ?? {}) as object);
    for (const n of TPLS) ok(names.includes(n), `ไม่มีแม่แบบ ${n}`);
  });
  check(DEF_CHECKS[1][0], DEF_CHECKS[1][1], () => {
    const want: [string, unknown][] = [
      ["rooms.legal.mode", "STRICT"],
      ["rooms.legal.outOfScopeReason", null],
      ["rooms.utility.elec.method", "ACTUAL_COST"],
      ["rooms.utility.water.method", "ACTUAL_COST"],
      ["rooms.utility.elec.fixedRate", null],
      ["rooms.utility.water.fixedRate", null],
      ["rooms.utility.minimum", null],
      ["rooms.utility.sharedBasis", "PERSON"],
      ["rooms.vat.registered", false],
      ["rooms.vat.pricesIncludeVat", true],
      ["rooms.vat.taxKinds", { RENT: "EXEMPT", COMMON: "VAT7", ELEC: "VAT7", WATER: "VAT7", SERVICE: "VAT7", LATE_FEE: "NONE" }],
      ["rooms.billing.issueDay", 25],
      ["rooms.billing.dueDay", 5],
      ["rooms.billing.prorate", "ACTUAL_DAYS"],
      ["rooms.lateFee.kind", "PER_DAY"],
      ["rooms.lateFee.amount", 5000],
      ["rooms.lateFee.capPerBill", 50_000],
      ["rooms.lateFee.graceDays", 3],
      ["rooms.deposit.months", 2],
      ["rooms.lease.advanceMonths", 0],
      ["rooms.deposit.returnDays", 7],
      ["rooms.deposit.approvalThreshold", 200_000],
      ["rooms.moveout.noticeDays", 30],
    ];
    for (const [k, v] of want) eq(dflt(k), v, k);
  });
  check(DEF_CHECKS[2][0], DEF_CHECKS[2][1], () => {
    const rules = L().TH_RENTAL_2568_RULES;
    for (const d of R().listDefs("rooms")) for (const r of d.legal ?? []) ok(r in rules, `${d.key} อ้าง ruleId ที่ไม่มี: ${r}`);
    const has = (k: string, r: string) => ok((R().getDef(k)?.legal ?? []).includes(r), `${k} ต้องผูก ${r}`);
    has("rooms.utility.elec.method", "UTIL_TOTAL_LE_BILL");
    has("rooms.utility.water.method", "UTIL_TOTAL_LE_BILL");
    has("rooms.utility.elec.fixedRate", "UTIL_FIXED_RATE_LE_COST");
    has("rooms.utility.water.fixedRate", "UTIL_FIXED_RATE_LE_COST");
    has("rooms.utility.minimum", "UTIL_NO_MINIMUM");
    has("rooms.deposit.months", "DEPOSIT_ADVANCE_MONTHS_LIMIT");
    has("rooms.lease.advanceMonths", "DEPOSIT_ADVANCE_MONTHS_LIMIT");
    has("rooms.deposit.returnDays", "DEPOSIT_RETURN_DAYS");
    const tpl = R().listDefs("rooms").filter((d) => d.type === "template");
    ok(tpl.length >= 1, "ต้องมี def ชนิด template");
    for (const d of tpl) ok((d.legal ?? []).includes("TEMPLATE_NO_THREAT"), `${d.key} ต้องผูก TEMPLATE_NO_THREAT`);
  });
  check(DEF_CHECKS[3][0], DEF_CHECKS[3][1], () => {
    const d = R().getDef("rooms.legal.mode");
    eq([d?.ownerOnly, d?.sensitivity], [true, "LEGAL"], "rooms.legal.mode");
  });
  check(DEF_CHECKS[4][0], DEF_CHECKS[4][1], () => {
    const h = R().listDefs("rooms").filter((d) => d.key.startsWith("rooms.hotel."));
    ok(h.length >= 1, "ต้องมีค่าโรงแรมอย่างน้อย 1");
    for (const d of h) eq(d.hiddenUntil, "PHASE_H", d.key);
  });
  check(DEF_CHECKS[5][0], DEF_CHECKS[5][1], () => {
    const S = R().SNAPSHOT_KEYS;
    for (const k of ["rooms.lateFee.kind", "rooms.lateFee.amount", "rooms.lateFee.capPerBill", "rooms.lateFee.graceDays", "rooms.deposit.months", "rooms.billing.dueDay"])
      ok((S.lease ?? []).includes(k), `SNAPSHOT_KEYS.lease ขาด ${k}`);
    for (const k of ["rooms.utility.elec.method", "rooms.utility.water.method", "rooms.vat.registered", "rooms.vat.pricesIncludeVat", "rooms.vat.taxKinds"])
      ok((S.bill ?? []).includes(k), `SNAPSHOT_KEYS.bill ขาด ${k}`);
  });
  check(DEF_CHECKS[6][0], DEF_CHECKS[6][1], () => {
    for (const tpl of TPLS) {
      const dep = dflt("rooms.deposit.months", tpl);
      const adv = dflt("rooms.lease.advanceMonths", tpl);
      eq(L().evaluateLegal("DEPOSIT_ADVANCE_MONTHS_LIMIT", { leaseKind: "SHORT", depositMonths: dep, advanceMonths: adv }, { mode: "STRICT" }).level, "OK", `${tpl} ประกัน+ล่วงหน้า`);
      eq(L().evaluateLegal("DEPOSIT_RETURN_DAYS", { days: dflt("rooms.deposit.returnDays", tpl) }, { mode: "STRICT" }).level, "OK", `${tpl} คืนประกัน`);
      const min = dflt("rooms.utility.minimum", tpl);
      eq(L().evaluateLegal("UTIL_NO_MINIMUM", { enabled: min !== null && min !== false, minSatang: typeof min === "number" ? min : null }, { mode: "STRICT" }).level, "OK", `${tpl} ขั้นต่ำ`);
      eq(dflt("rooms.legal.mode", tpl), "STRICT", `${tpl} โหมดเริ่ม`);
    }
  });
}

// ─────────────────── สรุป ───────────────────
const pass = results.filter((r) => r.status === "PASS").length;
const fail = results.filter((r) => r.status === "FAIL").length;
const skp = results.filter((r) => r.status === "SKIP").length;
console.log(`\n📊 D.1 — ${results.length} ข้อ · ✅ ${pass} · ❌ ${fail} · ⏭️ ${skp}`);
if (fail > 0) {
  const missing = results.filter((r) => r.status === "FAIL" && r.detail.includes("ยังไม่มี")).length;
  if (missing === fail) console.log(`   ทุกข้อที่แดง (${fail}) แดงเพราะโมดูลยังไม่มี — สถานะ fail-before ที่ถูกต้อง`);
  process.exit(1);
}
process.exit(0);
