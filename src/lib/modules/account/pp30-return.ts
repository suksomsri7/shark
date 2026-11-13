// ─────────────────────────────────────────────────────────────
// pp30-return.ts — ช่อง ภ.พ.30 ครบ + เครดิตยกมาจำต่อเดือน + สถานะยื่น/แบบเพิ่มเติม + กำหนดยื่น + กระทบยอด GL ผ่าน mapping (ACC T1.3)
//
// อ่านอย่างเดียว · reports.pp30 เรียก `pp30ReturnOf` แล้วแนบผลไว้ที่ `Pp30.ret` · ฝั่งเขียน (ยื่น · แบบเพิ่มเติม · แก้เครดิต) = pp30-filing.ts
// 🔴 ตะขอของ T1.7: `vatFiledState(ctx, periodKey)` — ยื่นแล้วไหม · ยอดยื่นล่าสุด · (ผู้เรียกเทียบกับสมุดเอง) · ไม่มีคำเตือนตอนลงรายการในไฟล์นี้
// design note ledger/wo-notes/T1.3.md
// ─────────────────────────────────────────────────────────────
import { tenantDb } from "@/lib/core/db";
import { resolveBookSettings } from "@/lib/core/settings";
import { ACCOUNT_SETTING_KEYS } from "@/lib/core/settings/defs/account";
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/warnings";
import { MAPPING_KEY_LABEL } from "./coa";
import { filingDeadlineOf, bkkYmd, type FilingDeadline } from "./legal-values";
import {
  computePp30Lines,
  diffPp30Lines,
  isPp30ExcessChoice,
  pp30HasDiff,
  prevPeriodKey,
  storedPp30Lines,
  type Pp30CarrySource,
  type Pp30ExcessChoice,
  type Pp30LineKey,
  type Pp30Lines,
} from "./pp30-shared";

type Ctx = { tenantId: string; systemId: string };

// ─────────────────── บัญชีภาษีจาก mapping ───────────────────

export const VAT_MAPPING_KEYS = ["VAT_OUTPUT", "VAT_INPUT", "VAT_OUTPUT_UNDUE", "VAT_OUTPUT_PENDING_INVOICE", "VAT_INPUT_UNDUE"] as const;
export type VatMappingKey = (typeof VAT_MAPPING_KEYS)[number];
export type VatLedger = { key: VatMappingKey; id: string; code: string; name: string; label: string; viaMapping: boolean };

/** สมุดเก่าที่ไม่มีแถว mapping ของบัญชีภาษี — ใช้รหัสของผังบัญชีเริ่มต้น (coa.ts) แทน และติดป้าย viaMapping=false */
const FALLBACK_CODE: Record<VatMappingKey, string> = {
  VAT_OUTPUT: "2200",
  VAT_INPUT: "1150",
  VAT_OUTPUT_UNDUE: "2210",
  VAT_OUTPUT_PENDING_INVOICE: "2205",
  VAT_INPUT_UNDUE: "1155",
};

/** บัญชีภาษีของสมุดตาม mapping (`AccountMapping.key`) — T1.9 จะย้ายรายงานอื่นมาใช้ทางเดียวกัน */
export async function vatLedgers(ctx: Ctx): Promise<Partial<Record<VatMappingKey, VatLedger>>> {
  const db = tenantDb(ctx);
  const maps = await db.accountMapping.findMany({
    where: { key: { in: [...VAT_MAPPING_KEYS] } },
    select: { key: true, account: { select: { id: true, code: true, name: true } } },
  });
  const out: Partial<Record<VatMappingKey, VatLedger>> = {};
  for (const m of maps) {
    const k = m.key as VatMappingKey;
    out[k] = { key: k, id: m.account.id, code: m.account.code, name: m.account.name, label: MAPPING_KEY_LABEL[k] ?? k, viaMapping: true };
  }
  const missing = VAT_MAPPING_KEYS.filter((k) => !out[k]);
  if (missing.length) {
    const ls = await db.accountLedger.findMany({ where: { code: { in: missing.map((k) => FALLBACK_CODE[k]) } }, select: { id: true, code: true, name: true } });
    for (const k of missing) {
      const l = ls.find((x) => x.code === FALLBACK_CODE[k]);
      if (l) out[k] = { key: k, id: l.id, code: l.code, name: l.name, label: MAPPING_KEY_LABEL[k] ?? k, viaMapping: false };
    }
  }
  return out;
}

/** ยอดเคลื่อนไหวของบัญชีหนึ่งในเดือน: เครดิตสุทธิ (ฝั่งหนี้สิน) */
async function netCredit(ctx: Ctx, ledgerId: string | undefined, periodKey: string): Promise<number> {
  if (!ledgerId) return 0;
  const a = await tenantDb(ctx).accountJournalLine.aggregate({ where: { accountId: ledgerId, entry: { periodKey } }, _sum: { debit: true, credit: true } });
  return (a._sum.credit ?? 0) - (a._sum.debit ?? 0);
}

/** ยอดคงเหลือสะสมถึงสิ้นเดือน (เครดิตสุทธิ) — บัญชีพักภาษี */
async function balanceCreditTo(ctx: Ctx, ledgerId: string | undefined, periodKey: string): Promise<number> {
  if (!ledgerId) return 0;
  const a = await tenantDb(ctx).accountJournalLine.aggregate({ where: { accountId: ledgerId, entry: { periodKey: { lte: periodKey } } }, _sum: { debit: true, credit: true } });
  return (a._sum.credit ?? 0) - (a._sum.debit ?? 0);
}

// ─────────────────── ค่าตั้ง ───────────────────

export async function pp30ExcessChoiceSetting(ctx: Ctx): Promise<Pp30ExcessChoice> {
  const r = await resolveBookSettings({ tenantId: ctx.tenantId }, [ACCOUNT_SETTING_KEYS.pp30ExcessChoice], ctx.systemId);
  const v = r[ACCOUNT_SETTING_KEYS.pp30ExcessChoice]?.value;
  return isPp30ExcessChoice(v) ? v : "CARRY_FORWARD";
}

// ─────────────────── สถานะยื่น (ตะขอ T1.7) ───────────────────

export type VatFilingRecord = {
  kind: "ORIGINAL" | "ADDITIONAL";
  seq: number; // 0 = ต้นฉบับ
  filedAt: Date;
  filedById: string | null;
  note: string | null;
  lines: Partial<Record<Pp30LineKey, number | null>>;
  excessChoice: Pp30ExcessChoice | null;
  /** แถวก่อน T1.3 ไม่มีภาพตัวเลขครบ */
  legacy: boolean;
  /** แบบเพิ่มเติม: ผลต่างที่ยื่น */
  diff?: Partial<Record<Pp30LineKey, number>>;
  /** ยอดที่ผู้ยื่นแจ้งเอง (คอลัมน์เดิม) — ต้นฉบับเท่านั้น */
  declared?: { salesVat: number; inputVat: number };
};

export type VatFiledState = {
  periodKey: string;
  filed: boolean;
  records: VatFilingRecord[];
  /** ยอดที่ยื่นล่าสุด (แบบเพิ่มเติมล่าสุด หรือต้นฉบับ) */
  latest: VatFilingRecord | null;
};

/** ตะขอ T1.7: เดือนนี้ยื่นแล้วไหม + ยอดที่ยื่นทุกครั้ง — T1.7 เรียกตอนมีรายการลงเดือนที่ยื่นแล้ว แล้วเทียบกับ `pp30` ของเดือนนั้น */
export async function vatFiledState(ctx: Ctx, periodKey: string): Promise<VatFiledState> {
  return (await vatFiledStates(ctx, [periodKey])).get(periodKey)!;
}

export async function vatFiledStates(ctx: Ctx, periodKeys?: string[]): Promise<Map<string, VatFiledState>> {
  const db = tenantDb(ctx);
  const where = periodKeys ? { periodKey: { in: periodKeys } } : {};
  const [orig, adds] = await Promise.all([
    db.accountVatFiling.findMany({ where }),
    db.accountVatAdditionalFiling.findMany({ where, orderBy: { seq: "asc" } }),
  ]);
  const out = new Map<string, VatFiledState>();
  const keys = new Set<string>([...(periodKeys ?? []), ...orig.map((o) => o.periodKey)]);
  for (const k of keys) {
    const o = orig.find((x) => x.periodKey === k);
    const records: VatFilingRecord[] = [];
    if (o) {
      const st = storedPp30Lines(o.lines, o);
      records.push({
        kind: "ORIGINAL",
        seq: 0,
        filedAt: o.filedAt,
        filedById: o.filedById,
        note: o.note,
        lines: st,
        excessChoice: isPp30ExcessChoice(o.excessChoice) ? o.excessChoice : (st.excessChoice ?? null),
        legacy: st.legacy,
        declared: { salesVat: o.salesVatSatang, inputVat: o.inputVatSatang },
      });
      for (const a of adds.filter((x) => x.periodKey === k)) {
        const sa = storedPp30Lines(a.lines, { salesVatSatang: 0, inputVatSatang: 0, payableSatang: 0 });
        records.push({
          kind: "ADDITIONAL",
          seq: a.seq,
          filedAt: a.filedAt,
          filedById: a.filedById,
          note: a.note,
          lines: sa,
          excessChoice: isPp30ExcessChoice(a.excessChoice) ? a.excessChoice : null,
          legacy: false,
          diff: (a.diff ?? {}) as Partial<Record<Pp30LineKey, number>>,
        });
      }
    }
    out.set(k, { periodKey: k, filed: !!o, records, latest: records[records.length - 1] ?? null });
  }
  return out;
}

// ─────────────────── เครดิตยกมา ───────────────────

export type CreditCarryHistoryRow = { amountSatang: number | null; reason: string; setById: string | null; createdAt: Date };

export type Pp30Carry = {
  amount: number;
  source: Pp30CarrySource;
  /** เดือนต้นทางของเครดิต (เดือนก่อน) */
  fromPeriod: string;
  /** ค่าที่ระบบคิดเอง (ไม่นับที่ร้านแก้) — เทียบเมื่อร้านแก้ */
  systemAmount: number;
  systemSource: Exclude<Pp30CarrySource, "OVERRIDE" | "QUERY">;
  history: CreditCarryHistoryRow[];
};

/** เพดานการไล่ย้อน (เดือน) — กันสมุดเก่ามากไล่ไม่จบ */
const CARRY_LOOKBACK = 120;

/**
 * เครดิตภาษียกมาของเดือน M (ลำดับตัดสิน — design note ข้อ 2):
 * ① ร้านแก้เอง (แถวล่าสุดของเดือน · null = กลับค่าระบบ) ② เดือนก่อนยื่นแล้ว → เครดิตยกไปของยอดที่ยื่นล่าสุด ③ คิดต่อเนื่องจากเดือนก่อน (ไล่ย้อนจนเจอ ① ② หรือก่อนรายการภาษีแรก)
 */
export async function creditBroughtForwardOf(ctx: Ctx, periodKey: string, ledgers?: Partial<Record<VatMappingKey, VatLedger>>): Promise<Pp30Carry> {
  const db = tenantDb(ctx);
  const L = ledgers ?? (await vatLedgers(ctx));
  const vatIds = [L.VAT_OUTPUT?.id, L.VAT_INPUT?.id].filter((x): x is string => !!x);
  const [overrides, firstLine, defaultChoice] = await Promise.all([
    db.accountVatCreditCarry.findMany({ where: { periodKey: { lte: periodKey } }, orderBy: { createdAt: "asc" } }),
    vatIds.length
      ? db.accountJournalLine.findFirst({ where: { accountId: { in: vatIds } }, orderBy: { entry: { periodKey: "asc" } }, select: { entry: { select: { periodKey: true } } } })
      : Promise.resolve(null),
    pp30ExcessChoiceSetting(ctx),
  ]);
  const latestOverride = new Map<string, number | null>();
  for (const o of overrides) latestOverride.set(o.periodKey, o.amountSatang);
  const history: CreditCarryHistoryRow[] = overrides
    .filter((o) => o.periodKey === periodKey)
    .map((o) => ({ amountSatang: o.amountSatang, reason: o.reason, setById: o.setById, createdAt: o.createdAt }));
  const earliest = firstLine?.entry.periodKey ?? null;

  const back: string[] = [];
  for (let i = 0, x = periodKey; i < CARRY_LOOKBACK; i++) back.push((x = prevPeriodKey(x)));
  const filed = await vatFiledStates(ctx, back);
  const ovOf = (k: string) => {
    const v = latestOverride.get(k);
    return v === undefined || v === null ? null : v;
  };
  const outMemo = new Map<string, number>();
  // เครดิตยกไปของเดือน j (ใช้เป็นเครดิตยกมาของ j+1) · depth = กันวนเกินเพดาน
  const carryOutOf = async (j: string, depth: number): Promise<number> => {
    const fs = filed.get(j);
    if (fs?.filed && fs.latest) return fs.latest.lines.creditCarriedForward ?? 0;
    if (!earliest || j < earliest || depth >= CARRY_LOOKBACK) return 0;
    const memo = outMemo.get(j);
    if (memo !== undefined) return memo;
    const cin = ovOf(j) ?? (await carryOutOf(prevPeriodKey(j), depth + 1));
    const [out, inp] = await Promise.all([netCredit(ctx, L.VAT_OUTPUT?.id, j), netCredit(ctx, L.VAT_INPUT?.id, j)]);
    const v = computePp30Lines({ salesTaxable: 0, salesZero: 0, salesExempt: 0, purchases: 0, outputVat: out, inputVat: -inp, creditBroughtForward: cin, excessChoice: defaultChoice }).creditCarriedForward;
    outMemo.set(j, v);
    return v;
  };
  const prev = prevPeriodKey(periodKey);
  const systemAmount = await carryOutOf(prev, 0);
  const systemSource: Pp30Carry["systemSource"] = filed.get(prev)?.filed ? "FILED" : systemAmount !== 0 ? "COMPUTED" : "NONE";
  const ov = ovOf(periodKey);
  if (ov !== null) return { amount: ov, source: "OVERRIDE", fromPeriod: prev, systemAmount, systemSource, history };
  return { amount: systemAmount, source: systemSource, fromPeriod: prev, systemAmount, systemSource, history };
}

// ─────────────────── ก้อนเต็มของเดือน ───────────────────

export type Pp30Reconcile = {
  key: VatMappingKey;
  label: string;
  ledger: { id: string; code: string; name: string; viaMapping: boolean } | null;
  /** ยอดเคลื่อนไหวในเดือน (ภาษีขาย = เครดิตสุทธิ · ภาษีซื้อ = เดบิตสุทธิ) */
  movement: number;
  /** ยอดในแบบ (เฉพาะ VAT_OUTPUT / VAT_INPUT) */
  onReturn: number | null;
  ok: boolean | null;
  /** บัญชีพัก: ยอดคงค้างสิ้นเดือน (ไม่เข้า ภ.พ.30) */
  balance?: number;
};

export type Pp30Return = {
  periodKey: string;
  lines: Pp30Lines;
  carry: Pp30Carry;
  excessChoiceSetting: Pp30ExcessChoice;
  deadline: { paper: { day: number; date: string; source: string } | null; online: { day: number; date: string; source: string } | null };
  reconcile: Pp30Reconcile[];
  filed: VatFiledState;
  /** ผลต่าง สมุดตอนนี้ − ยอดที่ยื่นล่าสุด (null = ยังไม่ยื่น) */
  diffFromFiled: Record<Pp30LineKey, number> | null;
  amendmentNeeded: boolean;
  warnings: LegalWarning[];
};

export type Pp30Base = {
  salesTaxable: number;
  salesZero: number;
  salesExempt: number;
  outputVat: number;
  purchases: number;
  inputVat: number;
};

/**
 * ภ.พ.30 ครบช่องของเดือน · `carryOverride` = ค่าใส่ดูชั่วคราว (เช่น ?carry= ของหน้าเก่า / `carryForwardSatang` ของ REST) ไม่บันทึก
 * `excessChoice` = ดูผลถ้าเลือกอีกทาง (ไม่บันทึก) · ค่าเริ่ม = ทางที่ยื่นไว้ (เดือนที่ยื่นแล้ว) หรือค่าตั้งของสมุด
 */
export async function pp30ReturnOf(
  ctx: Ctx,
  periodKey: string,
  base: Pp30Base,
  opts?: { carryOverride?: number | null; excessChoice?: Pp30ExcessChoice | null; ledgers?: Partial<Record<VatMappingKey, VatLedger>> },
): Promise<Pp30Return> {
  const L = opts?.ledgers ?? (await vatLedgers(ctx));
  const [carry0, setting, filed, deadline, outMove, inMove, undueOut, pendOut, undueIn] = await Promise.all([
    creditBroughtForwardOf(ctx, periodKey, L),
    pp30ExcessChoiceSetting(ctx),
    vatFiledState(ctx, periodKey),
    filingDeadlineOf(ctx, "PP30", periodKey).catch(() => null as FilingDeadline | null),
    netCredit(ctx, L.VAT_OUTPUT?.id, periodKey),
    netCredit(ctx, L.VAT_INPUT?.id, periodKey),
    balanceCreditTo(ctx, L.VAT_OUTPUT_UNDUE?.id, periodKey),
    balanceCreditTo(ctx, L.VAT_OUTPUT_PENDING_INVOICE?.id, periodKey),
    balanceCreditTo(ctx, L.VAT_INPUT_UNDUE?.id, periodKey),
  ]);
  const carry: Pp30Carry =
    opts?.carryOverride !== undefined && opts.carryOverride !== null ? { ...carry0, amount: opts.carryOverride, source: "QUERY" } : carry0;
  const excessChoice: Pp30ExcessChoice = opts?.excessChoice ?? filed.latest?.excessChoice ?? setting;
  const lines = computePp30Lines({ ...base, creditBroughtForward: carry.amount, excessChoice });

  const warnings: LegalWarning[] = [];
  if (carry.source === "OVERRIDE" && carry.amount !== carry.systemAmount) {
    warnings.push(legalWarning("PP30_CREDIT_CARRY_OVERRIDDEN", { shop: baht(carry.amount), system: baht(carry.systemAmount) }));
  }
  if (lines.netExcess > 0 && excessChoice === "REFUND") warnings.push(legalWarning("PP30_EXCESS_REFUND", { amount: baht(lines.netExcess) }));
  let diffFromFiled: Pp30Return["diffFromFiled"] = null;
  if (filed.latest) {
    diffFromFiled = diffPp30Lines(lines, filed.latest.lines);
    if (filed.latest.legacy) warnings.push(legalWarning("PP30_LEGACY_FILING"));
    if (pp30HasDiff(diffFromFiled)) warnings.push(legalWarning("PP30_FILED_DIFFERS", { period: periodKey }));
  }
  if (deadline) warnings.push(...deadline.warnings);

  const inputOnReturn = base.inputVat;
  const reconcile: Pp30Reconcile[] = [
    { key: "VAT_OUTPUT", label: "ภาษีขาย", ledger: led(L.VAT_OUTPUT), movement: outMove, onReturn: base.outputVat, ok: outMove === base.outputVat },
    { key: "VAT_INPUT", label: "ภาษีซื้อ", ledger: led(L.VAT_INPUT), movement: -inMove, onReturn: inputOnReturn, ok: -inMove === inputOnReturn },
    { key: "VAT_OUTPUT_UNDUE", label: L.VAT_OUTPUT_UNDUE?.label ?? "ภาษีขายยังไม่ถึงกำหนด", ledger: led(L.VAT_OUTPUT_UNDUE), movement: 0, onReturn: null, ok: null, balance: undueOut },
    { key: "VAT_OUTPUT_PENDING_INVOICE", label: L.VAT_OUTPUT_PENDING_INVOICE?.label ?? "ภาษีขายรอออกใบกำกับ", ledger: led(L.VAT_OUTPUT_PENDING_INVOICE), movement: 0, onReturn: null, ok: null, balance: pendOut },
    { key: "VAT_INPUT_UNDUE", label: L.VAT_INPUT_UNDUE?.label ?? "ภาษีซื้อยังไม่ถึงกำหนด", ledger: led(L.VAT_INPUT_UNDUE), movement: 0, onReturn: null, ok: null, balance: -undueIn },
  ];

  return {
    periodKey,
    lines,
    carry,
    excessChoiceSetting: setting,
    deadline: {
      paper: deadline?.paper ? { day: deadline.paper.day, date: bkkYmd(deadline.paper.date), source: deadline.paper.row.source } : null,
      online: deadline?.online ? { day: deadline.online.day, date: bkkYmd(deadline.online.date), source: deadline.online.row.source } : null,
    },
    reconcile,
    filed,
    diffFromFiled,
    amendmentNeeded: !!diffFromFiled && pp30HasDiff(diffFromFiled),
    warnings,
  };
}

const led = (l: VatLedger | undefined) => (l ? { id: l.id, code: l.code, name: l.name, viaMapping: l.viaMapping } : null);
const baht = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
