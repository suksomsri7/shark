// ─────────────────────────────────────────────────────────────
// defs/agency.ts — ค่าตั้งโดเมน «agency» (ชั้นเอเจนซี่ ใช้ร่วม ทัวร์ · Liveaboard · ตั๋ว) (pure) · RUN TRIPS A1.1
// แหล่ง: ledger/TRIPS-DEFAULTS.md §2 (A1–A37) + ภาคผนวก ก (X24 X25 X26 · X27 = ใบ A2.2) · ใบสั่ง ledger/trips-briefs/A1.1.md §4 + มติ R3
//        สัญญา ledger/TRIPS-CORE-CONTRACT.md §E §N.3 §N.4
//
// ▸ คีย์ `agency.<group>.<name>` (group = ส่วนที่ 2) · ชั้น "SHOP" = UNIT · ลำดับชั้นตามคอลัมน์ "ชั้น" ของ TRIPS-DEFAULTS ตรงตัว
// ▸ แม่แบบ DIVE_SHOP · DAY_TOUR · LIVEABOARD · ATTRACTION (version 1) · "—" ในเอกสาร = ค่าของ DAY_TOUR · `_fallback` = ค่า DIVE_SHOP
// ▸ เงิน = สตางค์ · % = 0–100 · อัตรา = basis point · วันที่ = "YYYY-MM-DD"
// ▸ A13 วงเงินเครดิต: schema รับถึง 100,000,000,000 สตางค์ (เกิน int4 · มติ R4) — โค้ดที่ใช้ต้องคิดด้วย bigint
// ▸ วิธีจ่าย/เทอมเครดิตจริง = A11/A12 ที่ resolve ตามชั้น UNIT → AGENT_TIER → AGENT เท่านั้น (มติ R3) ·
//   A1[ระดับ].payDefault = ค่าที่ใบ A1.3 ใช้ตอนสร้างระดับเพื่อเขียน A11 ชั้น AGENT_TIER (ระดับ A เขียน A12 = "30") — ไม่อ่าน A1 ตอนจอง
// ▸ คำเตือนกฎหมาย = legal/th-tour-2569 (WARN เท่านั้น · รูป RUNTIME `{hit}` ผ่าน legalInput) · ค่าเริ่มทุกแม่แบบต้องไม่เตือน
//
// 🔴 pure: import ได้เฉพาะ zod · ../registry · import type
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import { defineSettings } from "../registry";
import type { LegalInputFn, ScopeKind, SettingDef, SettingSensitivity, SettingValueType, TableCellSpecTh, TableSpecTh, TemplateDef } from "../types";

const EDIT = "agency.settings.edit";
const MONEY_EDIT = "agency.settings.money";

// ─────────────────── ชนิดค่าที่ใช้ซ้ำ ───────────────────
const isYmd = (s: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return t.getUTCFullYear() === Number(m[1]) && t.getUTCMonth() === Number(m[2]) - 1 && t.getUTCDate() === Number(m[3]);
};
const YMD = z.string().refine(isYmd, { message: "วันที่ต้องเป็น ปปปป-ดด-วว" });
const INT = (min: number, max: number) => z.number().int().min(min).max(max);
const PCT = INT(0, 100);
const BP = INT(0, 10_000);
/** เงินสตางค์ — เพดาน 100,000,000,000 (เกิน int4 · Number ยังปลอดภัย) */
const SATANG = INT(0, 100_000_000_000);
const BOOL = z.boolean();

// ─────────────────── ชั้น ───────────────────
const U = ["UNIT"] as const satisfies readonly ScopeKind[];
const U_A = ["UNIT", "AGENT"] as const satisfies readonly ScopeKind[];
const U_A_P = ["UNIT", "AGENT", "PRODUCT"] as const satisfies readonly ScopeKind[];
const U_AT_A = ["UNIT", "AGENT_TIER", "AGENT"] as const satisfies readonly ScopeKind[];
const U_AT_A_P = ["UNIT", "AGENT_TIER", "AGENT", "PRODUCT"] as const satisfies readonly ScopeKind[];
const AT_A = ["AGENT_TIER", "AGENT"] as const satisfies readonly ScopeKind[];
const A_P = ["AGENT", "PRODUCT"] as const satisfies readonly ScopeKind[];
const A_ONLY = ["AGENT"] as const satisfies readonly ScopeKind[];

// ─────────────────── ตัวช่วยสร้าง def ───────────────────
/** ค่าต่อแม่แบบ: [DIVE_SHOP, DAY_TOUR, LIVEABOARD] + ATTRACTION (ไม่ระบุ = ค่า DAY_TOUR) */
type Tpl = { v: readonly [ds: unknown, dt: unknown, la: unknown]; at?: unknown };
const all = (v: unknown): Tpl => ({ v: [v, v, v] });
const per = (ds: unknown, dt: unknown, la: unknown, at?: unknown): Tpl => (at === undefined ? { v: [ds, dt, la] } : { v: [ds, dt, la], at });

/** sensitivity ตามกลุ่ม (ใบสั่ง §4) — A1 ทับรายคีย์เป็น MONEY */
const SENSITIVITY: Readonly<Record<string, SettingSensitivity>> = {
  price: "MONEY", money: "MONEY", hold: "MONEY", quota: "MONEY", comm: "MONEY",
  wht: "LEGAL",
  privacy: "PRIVACY",
};

type RowInput = {
  key: string;
  type: SettingValueType;
  labelTh: string;
  helpTh?: string;
  schema: z.ZodType;
  chain: readonly ScopeKind[];
  d: Tpl;
  extra?: Partial<Pick<SettingDef, "legal" | "legalInput" | "effectiveDated" | "hiddenUntil" | "enumLabelsTh" | "reviewHint" | "reviewAuthorityTh">>;
  /** ทับ sensitivity ของกลุ่มรายคีย์ (A1 = MONEY) */
  sensitivity?: SettingSensitivity;
};

function row(x: RowInput): SettingDef {
  const group = x.key.split(".")[1];
  const sensitivity = x.sensitivity ?? SENSITIVITY[group];
  const [ds, dt, la] = x.d.v;
  return {
    key: x.key,
    domain: "agency",
    group,
    type: x.type,
    schema: x.schema,
    defaults: { DIVE_SHOP: ds, DAY_TOUR: dt, LIVEABOARD: la, ATTRACTION: x.d.at === undefined ? dt : x.d.at, _fallback: ds },
    chain: x.chain,
    editPermission: sensitivity === "MONEY" ? MONEY_EDIT : EDIT,
    ...(sensitivity ? { sensitivity } : {}),
    ...(sensitivity === "PRIVACY" ? { ownerOnly: true } : {}),
    unitTypes: ["TRIPS", "TICKET"],
    labelTh: x.labelTh,
    ...(x.helpTh ? { helpTh: x.helpTh } : {}),
    ...(x.extra ?? {}),
    ...(TABLE_TH[x.key] ? { tableTh: TABLE_TH[x.key] } : {}),
  };
}

const ACCOUNTANT = { reviewHint: "ACCOUNTANT" } as const;
const NOT_YET = "ยังไม่เปิดใช้ในรุ่นนี้";

// ─────────────────── ตัวเลือกและป้าย ───────────────────
const PAY_METHODS = ["PAY_NOW", "WALLET", "CREDIT"] as const;
const PAY_METHOD_TH: Record<(typeof PAY_METHODS)[number], string> = { PAY_NOW: "จ่ายทันที", WALLET: "ตัดจากกระเป๋าเงิน", CREDIT: "เครดิต (วางบิล)" };
const PAYER_TYPES = ["JURISTIC", "INDIVIDUAL"] as const;
const PAYER_TH: Record<(typeof PAYER_TYPES)[number], string> = { JURISTIC: "ร้านเป็นนิติบุคคล", INDIVIDUAL: "ร้านเป็นบุคคลธรรมดา" };
const PAYEE_TYPES = ["TH_JURISTIC", "TH_FOUNDATION", "TH_PERSON", "FOREIGN"] as const;
const PAYEE_TH: Record<(typeof PAYEE_TYPES)[number], string> = {
  TH_JURISTIC: "เอเจนซี่นิติบุคคลไทย",
  TH_FOUNDATION: "มูลนิธิ/สมาคม",
  TH_PERSON: "บุคคลธรรมดาไทย",
  FOREIGN: "ผู้รับต่างประเทศ",
};
const WHT_MODES = ["FLAT", "M50_1", "NONE"] as const;
const WHT_MODE_TH: Record<(typeof WHT_MODES)[number], string> = { FLAT: "หักอัตราคงที่", M50_1: "หักตาม ม.50(1) อัตราก้าวหน้า", NONE: "ไม่หัก" };
const WHT_FORMS = ["PND53", "PND3", "PND1", "PND54", "NONE"] as const;
const WHT_FORM_TH: Record<(typeof WHT_FORMS)[number], string> = { PND53: "ภ.ง.ด.53", PND3: "ภ.ง.ด.3", PND1: "ภ.ง.ด.1", PND54: "ภ.ง.ด.54", NONE: "ไม่ยื่น" };
const WHT_CERTS = ["PER_PAYMENT", "ANNUAL", "NONE"] as const;
const WHT_CERT_TH: Record<(typeof WHT_CERTS)[number], string> = { PER_PAYMENT: "50 ทวิ ทุกครั้งที่จ่าย", ANNUAL: "50 ทวิ สรุปรายปี", NONE: "ไม่ออก 50 ทวิ" };
const CONTINUOUS = ["EVERY_PAYMENT", "PER_CONTRACT_TOTAL"] as const;
const CONTINUOUS_TH: Record<(typeof CONTINUOUS)[number], string> = { EVERY_PAYMENT: "สัญญาต่อเนื่อง: หักทุกรายการ", PER_CONTRACT_TOTAL: "รวมยอดทั้งสัญญาก่อนเทียบเกณฑ์" };

// ─────────────────── รูปค่าชนิดตาราง (ใบสั่ง §4.2 · strict) ───────────────────
const TIER_ROW = z.object({ tourPct: PCT, laPct: PCT, ticketNetDiscountPct: PCT, payDefault: z.enum(PAY_METHODS), promoteAt: SATANG.nullable() }).strict();
const TIER_TABLE_SCHEMA = z.object({ A: TIER_ROW, B: TIER_ROW, C: TIER_ROW }).strict();
const TIER_TABLE = {
  A: { tourPct: 20, laPct: 18, ticketNetDiscountPct: 25, payDefault: "CREDIT", promoteAt: 300_000_000 },
  B: { tourPct: 15, laPct: 15, ticketNetDiscountPct: 20, payDefault: "PAY_NOW", promoteAt: 100_000_000 },
  C: { tourPct: 10, laPct: 10, ticketNetDiscountPct: 15, payDefault: "PAY_NOW", promoteAt: null },
};
const HOLD_DURATION = z.object({ tourHours: INT(1, 720), liveaboardDays: INT(1, 60), ticketMinutes: INT(1, 10_080).nullable() }).strict();
const HOLD_MAX = z.object({ tourSeats: INT(0, 1000), liveaboardCabins: INT(0, 100) }).strict();
const DISCOUNT_FROM_COMM = z.object({ enabled: BOOL, capPct: PCT }).strict();
const WHT_RULE = z.object({ mode: z.enum(WHT_MODES), rateBp: BP, form: z.enum(WHT_FORMS), cert: z.enum(WHT_CERTS) }).strict();
const WHT_BY_PAYEE_ROW = z.object({ TH_JURISTIC: WHT_RULE, TH_FOUNDATION: WHT_RULE, TH_PERSON: WHT_RULE, FOREIGN: WHT_RULE }).strict();
const WHT_BY_PAYEE = z.object({ JURISTIC: WHT_BY_PAYEE_ROW, INDIVIDUAL: WHT_BY_PAYEE_ROW }).strict();
const W = (mode: (typeof WHT_MODES)[number], rateBp: number, form: (typeof WHT_FORMS)[number], cert: (typeof WHT_CERTS)[number]) => ({ mode, rateBp, form, cert });
const W_NONE = W("NONE", 0, "NONE", "NONE");
const RULE_BY_PAYEE = {
  JURISTIC: { TH_JURISTIC: W("FLAT", 300, "PND53", "PER_PAYMENT"), TH_FOUNDATION: W("FLAT", 1000, "PND53", "PER_PAYMENT"), TH_PERSON: W("M50_1", 0, "PND1", "ANNUAL"), FOREIGN: W_NONE },
  INDIVIDUAL: { TH_JURISTIC: W_NONE, TH_FOUNDATION: W_NONE, TH_PERSON: W("M50_1", 0, "PND1", "ANNUAL"), FOREIGN: W_NONE },
};
const MIN_PER_CONTRACT = z
  .object({ amountSatang: SATANG, appliesTo: z.object({ TH_JURISTIC: BOOL, TH_FOUNDATION: BOOL }).strict(), continuousContract: z.enum(CONTINUOUS) })
  .strict();
const E_WHT = z.object({ enabled: BOOL, rateBp: BP, untilPaidOn: YMD.nullable() }).strict();
const LICENSE_FIELDS = z.object({ visible: BOOL, expiryReminder: BOOL }).strict();

// ─────────────────── ป้ายไทยของช่องย่อยค่าชนิดตาราง (การแสดงผลเท่านั้น · ข้อสอบ R-14 R-17) ───────────────────
const pctCell = (labelTh: string, shortTh: string): TableCellSpecTh => ({ kind: "int", labelTh, shortTh, unitTh: "%" });
const satangCell = (labelTh: string, shortTh: string, nullTh?: string): TableCellSpecTh => ({ kind: "int", labelTh, shortTh, unitTh: "สตางค์", ...(nullTh ? { nullTh } : {}) });
const boolCell = (labelTh: string, shortTh = "", onTh = "เปิด", offTh = "ปิด"): TableCellSpecTh => ({ kind: "bool", labelTh, shortTh, onTh, offTh });
const TIER_CELLS: Record<string, TableCellSpecTh> = {
  tourPct: pctCell("คอมมิชชันทัวร์", "ทัวร์"),
  laPct: pctCell("คอมมิชชัน Liveaboard", "Liveaboard"),
  ticketNetDiscountPct: pctCell("ส่วนลดราคาเน็ตตั๋ว", "ตั๋ว"),
  payDefault: { kind: "enum", labelTh: "วิธีจ่ายเริ่มต้นตอนสร้างระดับ", shortTh: "จ่าย", options: { ...PAY_METHOD_TH } },
  promoteAt: satangCell("ยอด 12 เดือนที่เลื่อนขึ้นระดับนี้", "เลื่อนระดับที่", "ไม่เลื่อนระดับอัตโนมัติ"),
};
const WHT_RULE_CELLS: Record<string, TableCellSpecTh> = {
  mode: { kind: "enum", labelTh: "วิธีหักภาษี", shortTh: "", options: { ...WHT_MODE_TH } },
  rateBp: { kind: "bp", labelTh: "อัตราหัก", shortTh: "อัตรา" },
  form: { kind: "enum", labelTh: "แบบยื่น", shortTh: "ยื่น", options: { ...WHT_FORM_TH } },
  cert: { kind: "enum", labelTh: "หนังสือรับรองหักภาษี", shortTh: "", options: { ...WHT_CERT_TH } },
};
const payeeCells = (): Record<string, TableCellSpecTh> =>
  Object.fromEntries(PAYEE_TYPES.map((p): [string, TableCellSpecTh] => [p, { kind: "object", labelTh: PAYEE_TH[p], shortTh: PAYEE_TH[p], fields: WHT_RULE_CELLS }]));

const TABLE_TH: Record<string, TableSpecTh> = {
  "agency.tier.table": {
    fields: {
      A: { kind: "object", labelTh: "ระดับ A", shortTh: "A", fields: TIER_CELLS },
      B: { kind: "object", labelTh: "ระดับ B", shortTh: "B", fields: TIER_CELLS },
      C: { kind: "object", labelTh: "ระดับ C", shortTh: "C", fields: TIER_CELLS },
    },
  },
  "agency.hold.duration": {
    fields: {
      tourHours: { kind: "int", labelTh: "ทัวร์ถือที่ได้", shortTh: "ทัวร์", unitTh: "ชั่วโมง" },
      liveaboardDays: { kind: "days", labelTh: "Liveaboard ถือที่ได้", shortTh: "Liveaboard", unitTh: "วัน" },
      ticketMinutes: { kind: "minutes", labelTh: "ตั๋วถือที่ได้", shortTh: "ตั๋ว", unitTh: "นาที", nullTh: "ไม่ให้ถือ (ซื้อเป็นชุด)" },
    },
  },
  "agency.hold.maxConcurrent": {
    fields: {
      tourSeats: { kind: "int", labelTh: "ทัวร์ถือพร้อมกันได้สูงสุด", shortTh: "ทัวร์", unitTh: "ที่" },
      liveaboardCabins: { kind: "int", labelTh: "Liveaboard ถือพร้อมกันได้สูงสุด", shortTh: "Liveaboard", unitTh: "เคบิน" },
    },
  },
  "agency.comm.discountFromCommission": {
    fields: {
      enabled: boolCell("ให้เอเจนซี่ลดราคาลูกค้าจากคอมฯ ของตัวเอง"),
      capPct: pctCell("เพดานส่วนลด", "เพดาน"),
    },
  },
  "agency.wht.ruleByPayee": {
    fields: {
      JURISTIC: { kind: "object", labelTh: PAYER_TH.JURISTIC, shortTh: PAYER_TH.JURISTIC, fields: payeeCells() },
      INDIVIDUAL: { kind: "object", labelTh: PAYER_TH.INDIVIDUAL, shortTh: PAYER_TH.INDIVIDUAL, fields: payeeCells() },
    },
  },
  "agency.wht.minPerContract": {
    fields: {
      amountSatang: satangCell("ไม่หักเมื่อยอดต่อสัญญาต่ำกว่า", "เกณฑ์"),
      appliesTo: {
        kind: "object",
        labelTh: "ใช้เกณฑ์กับผู้รับ",
        shortTh: "ใช้กับ",
        fields: { TH_JURISTIC: boolCell(PAYEE_TH.TH_JURISTIC, PAYEE_TH.TH_JURISTIC, "ใช้", "ไม่ใช้"), TH_FOUNDATION: boolCell(PAYEE_TH.TH_FOUNDATION, PAYEE_TH.TH_FOUNDATION, "ใช้", "ไม่ใช้") },
      },
      continuousContract: { kind: "enum", labelTh: "เอเจนซี่ที่มีสัญญาต่อเนื่อง", shortTh: "", options: { ...CONTINUOUS_TH } },
    },
  },
  "agency.wht.eWht": {
    fields: {
      enabled: boolCell("ใช้อัตรา e-Withholding Tax"),
      rateBp: { kind: "bp", labelTh: "อัตรา e-WHT", shortTh: "อัตรา" },
      untilPaidOn: { kind: "text", labelTh: "ใช้กับวันจ่ายถึง (ปปปป-ดด-วว)", shortTh: "ถึง", nullTh: "ไม่มีวันสิ้นสุด" },
    },
  },
  "agency.license.fields": {
    fields: {
      visible: boolCell("แสดงช่องเลขใบอนุญาตนำเที่ยว", "", "แสดง", "ไม่แสดง"),
      expiryReminder: boolCell("เตือนใบอนุญาตใกล้หมดอายุ"),
    },
  },
};

// ─────────────────── คำเตือนกฎหมาย (รูป RUNTIME {hit} ของ th-tour-2569 · ใบสั่ง §4) ───────────────────
const rec = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
/** A26: W07 = มีผู้จ่ายที่แถว TH_PERSON ตั้ง FLAT หรือยื่น ภ.ง.ด.3 · W09 = ร้านบุคคลธรรมดาหักให้นิติบุคคล/มูลนิธิ */
const ruleByPayeeLegal: LegalInputFn = (v) => {
  const t = rec(v);
  const w07 = PAYER_TYPES.some((payer) => {
    const r = rec(rec(t?.[payer])?.TH_PERSON);
    return r !== null && (r.mode === "FLAT" || r.form === "PND3");
  });
  const ind = rec(t?.INDIVIDUAL);
  const w09 = (["TH_JURISTIC", "TH_FOUNDATION"] as const).some((p) => {
    const r = rec(ind?.[p]);
    return r !== null && r.mode !== "NONE";
  });
  return { W07: { hit: w07 }, W09: { hit: w09 } };
};

// ─────────────────── ทะเบียน 40 คีย์ (TD §2 A1–A37 + ภาคผนวก ก X24–X26) ───────────────────
const DEFS: SettingDef[] = [
  // ── 2.1 ระดับ ──
  row({
    key: "agency.tier.table", type: "table", labelTh: "ระดับเอเจนซี่ (คอมมิชชัน · ส่วนลดตั๋ว · วิธีจ่ายเริ่มต้น · ยอดเลื่อนระดับ)",
    helpTh: "ใช้ตอนสร้างระดับ — วิธีจ่ายและเทอมเครดิตจริงตั้งที่ «วิธีจ่ายของเอเจนซี่» และ «เทอมเครดิต» ของแต่ละระดับ",
    chain: U, schema: TIER_TABLE_SCHEMA, d: all(TIER_TABLE), sensitivity: "MONEY",
  }),
  row({
    key: "agency.tier.newAgentTier", type: "enum", labelTh: "ระดับของเอเจนซี่ที่อนุมัติใหม่", chain: U, schema: z.enum(["A", "B", "C"]), d: all("C"),
    extra: { enumLabelsTh: { A: "ระดับ A", B: "ระดับ B", C: "ระดับ C" } },
  }),
  row({ key: "agency.tier.autoPromote", type: "bool", labelTh: "เลื่อนระดับอัตโนมัติตามยอด 12 เดือน", chain: U, schema: BOOL, d: all(false), extra: { hiddenUntil: "PHASE_2" } }),

  // ── ราคา ──
  row({
    key: "agency.price.defaultModel", type: "enum", labelTh: "รูปแบบราคาของเอเจนซี่ใหม่", chain: U_AT_A, schema: z.enum(["COMMISSION", "NET", "MARKUP"]), d: all("COMMISSION"),
    extra: { enumLabelsTh: { COMMISSION: "คอมมิชชัน (ขายราคาหน้าร้าน)", NET: "ราคาเน็ต", MARKUP: "บวกเพิ่มจากราคาเน็ต" } },
  }),
  row({
    key: "agency.price.sellerOfRecord", type: "enum", labelTh: "ผู้ขายตามสัญญา (ใครออกใบกำกับให้ลูกค้า)",
    helpTh: `ร้านเป็นผู้ขาย เอเจนซี่เป็นตัวแทน — โหมดเอเจนซี่ซื้อมาขายไป${NOT_YET}`,
    chain: U_A_P, schema: z.enum(["SHOP_PRINCIPAL"]), d: all("SHOP_PRINCIPAL"),
    extra: { enumLabelsTh: { SHOP_PRINCIPAL: "ร้านเป็นผู้ขาย · เอเจนซี่เป็นตัวแทน" }, legal: ["W13"], legalInput: (v) => ({ W13: { hit: v === "AGENT_RESELLS" } }), ...ACCOUNTANT },
  }),
  row({
    key: "agency.price.actualSalePriceField", type: "enum", labelTh: "ช่อง \"ราคาที่เอเจนซี่ขายจริง\" ในการจองราคาเน็ต", chain: U_A, schema: z.enum(["OPTIONAL_WARN", "HIDDEN"]), d: all("OPTIONAL_WARN"),
    extra: { enumLabelsTh: { OPTIONAL_WARN: "แสดง ไม่บังคับ (ว่าง = เตือน)", HIDDEN: "ไม่แสดง" }, ...ACCOUNTANT },
  }),
  row({ key: "agency.price.minResalePrice", type: "money", labelTh: "ราคาขายขั้นต่ำของเอเจนซี่ราคาเน็ต (สตางค์)", helpTh: "ไม่ตั้ง = ไม่กำหนด", chain: A_P, schema: SATANG.nullable(), d: all(null) }),
  row({ key: "agency.price.hidePriceOnVoucher", type: "bool", labelTh: "วอเชอร์ของลูกค้าเอเจนซี่ไม่แสดงราคา", chain: A_ONLY, schema: BOOL, d: all(false) }),

  // ── ยกเลิก ──
  row({
    key: "agency.cancel.policySource", type: "enum", labelTh: "นโยบายยกเลิก/เลื่อนของการจองผ่านเอเจนซี่", chain: AT_A, schema: z.enum(["PRODUCT_POLICY", "CONTRACT"]), d: all("PRODUCT_POLICY"),
    extra: { enumLabelsTh: { PRODUCT_POLICY: "ตามนโยบายของสินค้า", CONTRACT: "ตามสัญญาเอเจนซี่" } },
  }),

  // ── เงิน ──
  row({
    key: "agency.money.collector", type: "enum", labelTh: "ใครเก็บเงินลูกค้า", chain: U_AT_A, schema: z.enum(["AGENT_COLLECTS", "SHOP_COLLECTS"]), d: all("AGENT_COLLECTS"),
    extra: { enumLabelsTh: { AGENT_COLLECTS: "เอเจนซี่เก็บเงิน (ส่งยอดเน็ต)", SHOP_COLLECTS: "ร้านเก็บเงิน" } },
  }),
  row({
    key: "agency.money.paymentMethod", type: "enum", labelTh: "เอเจนซี่จ่ายร้านอย่างไร", chain: U_AT_A, schema: z.enum(PAY_METHODS), d: all("PAY_NOW"),
    extra: { enumLabelsTh: { ...PAY_METHOD_TH } },
  }),
  row({
    key: "agency.money.creditTermDays", type: "enum", labelTh: "เทอมเครดิต", chain: AT_A, schema: z.enum(["7", "15", "30"]), d: all("15"),
    extra: { enumLabelsTh: { "7": "7 วัน", "15": "15 วัน", "30": "30 วัน" } },
  }),
  row({ key: "agency.money.creditLimit", type: "money", labelTh: "วงเงินเครดิต (สตางค์)", helpTh: "0 = ไม่มีเครดิต", chain: A_ONLY, schema: SATANG, d: all(0) }),
  row({
    key: "agency.money.overLimitAction", type: "enum", labelTh: "เกินวงเงินหรือค้างเกินกำหนด → การจองใหม่", chain: AT_A, schema: z.enum(["BLOCK_NEW", "WARN_ONLY"]), d: all("BLOCK_NEW"),
    extra: { enumLabelsTh: { BLOCK_NEW: "ไม่รับการจองใหม่", WARN_ONLY: "เตือนอย่างเดียว" } },
  }),
  row({
    key: "agency.money.statementCycle", type: "enum", labelTh: "รอบใบแจ้งยอด", chain: U_A, schema: z.enum(["WEEKLY", "SEMI_MONTHLY_1_16", "MONTHLY"]), d: all("SEMI_MONTHLY_1_16"),
    extra: { enumLabelsTh: { WEEKLY: "ทุกสัปดาห์", SEMI_MONTHLY_1_16: "ครึ่งเดือน (วันที่ 1 และ 16)", MONTHLY: "ทุกเดือน" } },
  }),

  // ── ถือที่ ──
  row({ key: "agency.hold.duration", type: "table", labelTh: "เอเจนซี่ถือที่โดยยังไม่จ่ายได้นาน", chain: U_AT_A_P, schema: HOLD_DURATION, d: all({ tourHours: 24, liveaboardDays: 7, ticketMinutes: null }) }),
  row({ key: "agency.hold.maxConcurrent", type: "table", labelTh: "ถือที่พร้อมกันได้สูงสุดต่อเอเจนซี่", chain: U_AT_A, schema: HOLD_MAX, d: all({ tourSeats: 20, liveaboardCabins: 2 }) }),

  // ── โควตา ──
  row({ key: "agency.quota.releaseDaysBefore", type: "days", labelTh: "โควตาที่ยังไม่ขายคืนเข้าที่ว่างรวมก่อนเดินทาง (วัน)", chain: U_A_P, schema: INT(0, 365), d: per(2, 2, 60) }),
  row({ key: "agency.quota.requestResponseHours", type: "int", labelTh: "สินค้าแบบต้องขอก่อน: ร้านต้องตอบภายใน (ชั่วโมง)", chain: U_A_P, schema: INT(1, 168), d: all(2) }),
  row({ key: "agency.quota.freeSale", type: "bool", labelTh: "เอเจนซี่จองจากที่ว่างสาธารณะได้นอกโควตา", chain: A_P, schema: BOOL, d: all(true) }),
  row({ key: "agency.quota.requestFirst", type: "bool", labelTh: "เอเจนซี่ต้องส่งคำขอก่อน (ไม่ตัดที่ทันที)", chain: U_AT_A_P, schema: BOOL, d: all(false) }),
  row({ key: "agency.quota.returnCancelledToQuota", type: "bool", labelTh: "ที่นั่งจากโควตาที่ยกเลิกกลับเข้าโควตา", chain: U_AT_A, schema: BOOL, d: all(true) }),

  // ── คอมมิชชัน ──
  row({
    key: "agency.comm.earnedAt", type: "enum", labelTh: "คอมมิชชันได้สิทธิ์เมื่อ", chain: U_A, schema: z.enum(["AFTER_TRAVEL", "ON_CONFIRM"]), d: all("AFTER_TRAVEL"),
    extra: { enumLabelsTh: { AFTER_TRAVEL: "หลังเดินทาง (ปิดทริป)", ON_CONFIRM: "เมื่อยืนยันการจอง" } },
  }),
  row({
    key: "agency.comm.currency", type: "enum", labelTh: "คอมมิชชันของการจองสกุลต่างประเทศ",
    helpTh: `แปลงเป็นบาทด้วยอัตราที่จด ณ วันจอง — คอมฯ ในสกุลของการจอง${NOT_YET}`,
    chain: U_A, schema: z.enum(["THB_AT_BOOKING_RATE"]), d: all("THB_AT_BOOKING_RATE"),
    extra: { enumLabelsTh: { THB_AT_BOOKING_RATE: "เป็นบาท ด้วยอัตรา ณ วันจอง" } },
  }),
  row({ key: "agency.comm.clawbackOnCancel", type: "bool", labelTh: "ยกเลิกหลังได้สิทธิ์ → ดึงคอมฯ คืนในงวดถัดไป", chain: U_A, schema: BOOL, d: all(true) }),
  row({ key: "agency.comm.discountFromCommission", type: "table", labelTh: "เอเจนซี่ให้ส่วนลดลูกค้าจากคอมฯ ของตัวเอง", chain: U_AT_A, schema: DISCOUNT_FROM_COMM, d: all({ enabled: false, capPct: 5 }) }),
  row({
    key: "agency.comm.vatMode", type: "enum", labelTh: "VAT ของค่าคอมมิชชัน", chain: U_AT_A, schema: z.enum(["NONE", "EXCLUSIVE", "INCLUSIVE"]), d: all("NONE"),
    helpTh: "ร้านไม่ได้ตั้งเองและเอเจนซี่จด VAT ⇒ ระบบใช้แบบแยก VAT ตอนจอง",
    extra: { enumLabelsTh: { NONE: "ไม่มี VAT", EXCLUSIVE: "แยก VAT (บวกเพิ่ม)", INCLUSIVE: "รวม VAT แล้ว" }, ...ACCOUNTANT },
  }),

  // ── ภาษีหัก ณ ที่จ่าย ──
  row({
    key: "agency.wht.payerType", type: "enum", labelTh: "สถานะผู้จ่าย (ร้าน)", helpTh: "ไม่ตั้ง = อ่านจากสมุดบัญชีของร้าน",
    chain: U, schema: z.enum(PAYER_TYPES).nullable(), d: all(null),
    extra: { enumLabelsTh: { ...PAYER_TH } },
  }),
  row({
    key: "agency.wht.ruleByPayee", type: "table", labelTh: "ภาษีหัก ณ ที่จ่ายค่าคอมฯ ตามผู้จ่าย × ผู้รับ", chain: U_A, schema: WHT_BY_PAYEE, d: all(RULE_BY_PAYEE),
    extra: { legal: ["W07", "W09"], legalInput: ruleByPayeeLegal, effectiveDated: true, ...ACCOUNTANT },
  }),
  row({
    key: "agency.wht.minPerContract", type: "table", labelTh: "เกณฑ์ยอดขั้นต่ำต่อสัญญาที่ต้องหักภาษี", chain: U_A, schema: MIN_PER_CONTRACT,
    d: all({ amountSatang: 100_000, appliesTo: { TH_JURISTIC: true, TH_FOUNDATION: false }, continuousContract: "EVERY_PAYMENT" }),
    extra: { legal: ["W43"], legalInput: (v) => ({ W43: { hit: rec(v)?.continuousContract === "PER_CONTRACT_TOTAL" } }), effectiveDated: true, ...ACCOUNTANT },
  }),
  row({
    key: "agency.wht.eWht", type: "table", labelTh: "อัตรา e-Withholding Tax (ผู้รับนิติบุคคล)", chain: U, schema: E_WHT, d: all({ enabled: false, rateBp: 100, untilPaidOn: "2027-12-31" }),
    extra: { effectiveDated: true, ...ACCOUNTANT },
  }),
  row({
    key: "agency.wht.grossUpOnNetRemit", type: "bool", labelTh: "เอเจนซี่ส่งยอดเน็ต: บวกภาษีที่หักเข้ายอดที่ต้องโอน", chain: U_A, schema: BOOL, d: all(true),
    extra: { legal: ["W44"], legalInput: (v) => ({ W44: { hit: v === false } }), ...ACCOUNTANT },
  }),
  row({
    key: "agency.wht.remitter", type: "enum", labelTh: "ใครออก 50 ทวิ และนำส่งภาษีหัก", chain: U_A, schema: z.enum(["SHOP", "AGENT_ON_BEHALF", "NONE"]), d: all("SHOP"),
    extra: {
      enumLabelsTh: { SHOP: "ร้าน", AGENT_ON_BEHALF: "เอเจนซี่นำส่งแทน (มีหนังสือแต่งตั้ง)", NONE: "ไม่มีผู้นำส่ง" },
      legal: ["W44"], legalInput: (v) => ({ W44: { hit: v !== "SHOP" } }), ...ACCOUNTANT,
    },
  }),

  // ── ลูกค้า ──
  row({ key: "agency.crm.addToShopMarketing", type: "bool", labelTh: "ลูกค้าที่จองผ่านเอเจนซี่เข้ารายชื่อการตลาดของร้าน", chain: U_A, schema: BOOL, d: all(false) }),
  row({
    key: "agency.crm.whoMessagesCustomer", type: "enum", labelTh: "ใครส่งข้อความหาลูกค้าของเอเจนซี่", chain: AT_A, schema: z.enum(["SHOP_FULL", "SHOP_OPS_ONLY", "AGENT_ONLY"]), d: all("SHOP_OPS_ONLY"),
    extra: { enumLabelsTh: { SHOP_FULL: "ร้านส่งได้ทุกข้อความ (ในชื่อร้าน)", SHOP_OPS_ONLY: "ร้านส่งเฉพาะข้อมูลเดินทาง (เวลารับ จุดนัด เอกสาร)", AGENT_ONLY: "เอเจนซี่ส่งเองเท่านั้น" } },
  }),
  row({
    key: "agency.crm.customerContactRoute", type: "enum", labelTh: "ปุ่มติดต่อบนหน้าการจองของลูกค้าเอเจนซี่", chain: A_ONLY, schema: z.enum(["VIA_AGENT", "DIRECT"]), d: all("VIA_AGENT"),
    extra: { enumLabelsTh: { VIA_AGENT: "ติดต่อผ่านเอเจนซี่", DIRECT: "ติดต่อร้านโดยตรง" } },
  }),

  // ── ความเป็นส่วนตัว ──
  row({
    key: "agency.privacy.seeHealthForms", type: "bool", labelTh: "เอเจนซี่เปิดดูข้อมูลสุขภาพ/แบบแพทย์ของลูกค้าได้", chain: U_A, schema: BOOL, d: all(false),
    extra: { legal: ["W34"], legalInput: (v) => ({ W34: { hit: v === true } }) },
  }),
  row({ key: "agency.privacy.customerSelfFillLink", type: "bool", labelTh: "เอเจนซี่ส่งลิงก์ให้ลูกค้ากรอกรายชื่อ/เอกสารเอง", chain: U_A, schema: BOOL, d: all(true) }),

  // ── สมัคร · ใบอนุญาต ──
  row({ key: "agency.signup.requireApproval", type: "bool", labelTh: "เอเจนซี่สมัครเอง → ร้านอนุมัติก่อนใช้งาน", chain: U, schema: BOOL, d: all(true) }),
  row({
    key: "agency.license.fields", type: "table", labelTh: "ใบอนุญาตนำเที่ยวของเอเจนซี่ (ไม่บังคับ · ไม่บล็อก)", chain: U, schema: LICENSE_FIELDS, d: all({ visible: true, expiryReminder: false }),
    extra: { reviewHint: "AUTHORITY", reviewAuthorityTh: "กรมการท่องเที่ยว" },
  }),
];

// ─────────────────── แม่แบบ · snapshot · ป้ายกลุ่ม ───────────────────
const TEMPLATES: TemplateDef[] = [
  { key: "DIVE_SHOP", version: 1, labelTh: "ร้านดำน้ำ" },
  { key: "DAY_TOUR", version: 1, labelTh: "ทัวร์เดย์ทริป" },
  { key: "LIVEABOARD", version: 1, labelTh: "เรือ Liveaboard" },
  { key: "ATTRACTION", version: 1, labelTh: "สถานที่ท่องเที่ยว/ตั๋ว" },
];

/** CC §N.3 — คีย์ที่การจองผ่านเอเจนซี่จดลง policySnapshot (ตรงตัว · 24 คีย์) */
const SNAPSHOTS = {
  "agency.booking": [
    "agency.tier.table", "agency.price.defaultModel", "agency.price.sellerOfRecord", "agency.price.minResalePrice", "agency.price.hidePriceOnVoucher",
    "agency.cancel.policySource", "agency.money.collector", "agency.money.paymentMethod", "agency.money.creditTermDays",
    "agency.comm.earnedAt", "agency.comm.currency", "agency.comm.clawbackOnCancel", "agency.comm.discountFromCommission", "agency.comm.vatMode",
    "agency.wht.payerType", "agency.wht.ruleByPayee", "agency.wht.minPerContract", "agency.wht.eWht", "agency.wht.grossUpOnNetRemit", "agency.wht.remitter",
    "agency.crm.addToShopMarketing", "agency.crm.whoMessagesCustomer", "agency.crm.customerContactRoute", "agency.quota.returnCancelledToQuota",
  ],
} as const;

const GROUP_LABELS_TH: Record<string, string> = {
  tier: "ระดับเอเจนซี่",
  price: "ราคาของเอเจนซี่",
  cancel: "ยกเลิกและเลื่อน",
  money: "เงินและเครดิต",
  hold: "การถือที่",
  quota: "โควตาที่นั่ง",
  comm: "คอมมิชชัน",
  wht: "ภาษีหัก ณ ที่จ่าย",
  crm: "ลูกค้าของเอเจนซี่",
  privacy: "ข้อมูลส่วนบุคคล",
  signup: "การสมัครเอเจนซี่",
  license: "ใบอนุญาตนำเที่ยว",
};

defineSettings("agency", DEFS, { templates: TEMPLATES, snapshots: SNAPSHOTS, groupLabelsTh: GROUP_LABELS_TH });

/** คีย์ทั้งหมดของโดเมน agency (ลำดับทะเบียน) */
export const AGENCY_SETTING_KEYS: readonly string[] = DEFS.map((d) => d.key);
