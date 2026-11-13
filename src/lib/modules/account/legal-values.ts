// ─────────────────────────────────────────────────────────────
// legal-values.ts — ตัวอ่านเดียวของ "ค่ากฎหมาย" ของสมุดบัญชี · ACC T0.1 + T0.2
//
//   legalValueAt(key, date, ctx, query?)  ← ทุกจุดที่เคยฝัง 700 / 300 / "วันที่ 10" ต้องมาที่นี่
//   key: "vat.rate" | "wht.rate" | "filing.deadline"
//
// ที่มาของค่า (ลำดับ): แถวที่ร้านตั้ง (ค่าตั้ง `account.legal.*` ชั้น ACCOUNT_BOOK ของเครื่องยนต์ค่าตั้ง)
//   → แถวของระบบจาก skill shark-thai-law (`core/settings/legal/th-tax-2569.ts`)
//   → ไม่มีแถวครอบวันที่ = แถวใกล้สุด + คำเตือน (ไม่บล็อก) · e-WHT หมดอายุ = กลับอัตราปกติ + คำเตือน
// ประเภทผู้ประกอบการ (T0.1) อ่านจากค่าตั้ง `account.entity.kind` — ตัวอ่าน entityKindOf / isJuristicPayer (pure)
//
// 🔴 ไม่มีแคชข้ามคำขอ (กติกาเครื่องยนต์ CC §1.4) — ลูปใหญ่ให้โหลด `loadBookLegal` ครั้งเดียวแล้วใช้ตัว *From
// design note: ledger/wo-notes/T0.1-T0.2.md
// ─────────────────────────────────────────────────────────────
import { randomUUID } from "node:crypto";
import { resolveBookSettings, setSettings, type SetResult, type SettingsActor } from "@/lib/core/settings";
import { ACCOUNT_SETTING_KEYS } from "@/lib/core/settings/defs/account";
import type { LegalUiOptions } from "@/components/account-v2/doc-editor-types";
import {
  CHECK_WITH_ACCOUNTANT_TH,
  ENTITY_KIND_LABEL_TH,
  entityKindOf,
  FILING_CHANNEL_LABEL_TH,
  FILING_FORM_LABEL_TH,
  isEntityKind,
  isJuristicPayer,
  LEGAL_TAG_LABEL_TH,
  pickLegalRow,
  pickWarnings,
  shopRowWarnings,
  SYSTEM_ROWS,
  WHT_CHANNEL_LABEL_TH,
  WHT_INCOME_LABEL_TH,
  WHT_METHOD_LABEL_TH,
  WHT_PAYER_LABEL_TH,
  WHT_RECIPIENT_LABEL_TH,
  type EntityKind,
  type FilingChannel,
  type FilingDeadlineRow,
  type FilingForm,
  type LegalRowOf,
  type LegalTableKind,
  type LegalWarning,
  type VatRateRow,
  type WhtChannel,
  type WhtMethod,
  type WhtPayer,
  type WhtRateRow,
  type WhtRecipient,
} from "@/lib/core/settings/legal/th-tax-2569";

export {
  CHECK_WITH_ACCOUNTANT_TH,
  ENTITY_KIND_LABEL_TH,
  entityKindOf,
  isEntityKind,
  isJuristicPayer,
  type EntityKind,
  type LegalWarning,
};
export { ENTITY_KINDS } from "@/lib/core/settings/legal/th-tax-2569";

export type BookCtx = { tenantId: string; systemId: string };
export type { LegalUiOptions };

/** ค่ากฎหมายของสมุดหนึ่งเล่ม ณ ตอนโหลด — แถวของร้าน (แถวระบบอ่านจากโค้ด) + ประเภทผู้ประกอบการ */
export type BookLegal = {
  entityKind: EntityKind;
  shop: { vat: VatRateRow[]; wht: WhtRateRow[]; deadline: FilingDeadlineRow[] };
};

const KEY_OF: Record<LegalTableKind, string> = { vat: ACCOUNT_SETTING_KEYS.vat, wht: ACCOUNT_SETTING_KEYS.wht, deadline: ACCOUNT_SETTING_KEYS.deadline };
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** ค่าเริ่ม (ไม่มีแถวร้าน · ยังไม่ระบุประเภทผู้ประกอบการ) — ใช้เมื่อยังไม่มีสมุด/ในข้อสอบ */
export const EMPTY_BOOK_LEGAL: BookLegal = { entityKind: "UNSET", shop: { vat: [], wht: [], deadline: [] } };

/** อ่านค่าตั้งทั้ง 4 คีย์ของสมุดในคิวรีเดียว */
export async function loadBookLegal(ctx: BookCtx): Promise<BookLegal> {
  const r = await resolveBookSettings({ tenantId: ctx.tenantId }, [ACCOUNT_SETTING_KEYS.entityKind, KEY_OF.vat, KEY_OF.wht, KEY_OF.deadline], ctx.systemId);
  return {
    entityKind: entityKindOf({ entityKind: r[ACCOUNT_SETTING_KEYS.entityKind]?.value }),
    shop: {
      vat: arr<VatRateRow>(r[KEY_OF.vat]?.value),
      wht: arr<WhtRateRow>(r[KEY_OF.wht]?.value),
      deadline: arr<FilingDeadlineRow>(r[KEY_OF.deadline]?.value),
    },
  };
}

/** วันตามปฏิทินไทย (Asia/Bangkok) ของเวลาหนึ่ง → "YYYY-MM-DD" */
export function bkkYmd(d: Date): string {
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

// ═══════════════════ ตัวอ่านเดียว ═══════════════════

export type LegalKey = "vat.rate" | "wht.rate" | "filing.deadline";
export type WhtQuery = { incomeType: string; payer?: WhtPayer; recipient?: WhtRecipient; channel?: WhtChannel };
export type DeadlineQuery = { form: FilingForm; channel: FilingChannel };
export type LegalQuery<K extends LegalKey> = K extends "wht.rate" ? WhtQuery : K extends "filing.deadline" ? DeadlineQuery : undefined;

export type LegalValue = {
  /** อัตรา (bp) หรือ วันที่ของเดือน · null = ไม่มีอัตราคงที่ (ไม่หัก/อัตราก้าวหน้า/ไม่มีแถว) */
  value: number | null;
  method: WhtMethod;
  row: VatRateRow | WhtRateRow | FilingDeadlineRow | null;
  origin: "SHOP" | "SYSTEM" | null;
  /** วันที่ (ไทย) ที่ใช้เลือกแถว */
  ymd: string;
  warnings: LegalWarning[];
};

function pickFrom<K extends LegalTableKind>(kind: K, legal: BookLegal, query: Record<string, string>, ymd: string, allowNearest = true) {
  const shop = legal.shop[kind] as unknown as LegalRowOf<K>[];
  const sys = SYSTEM_ROWS[kind] as readonly LegalRowOf<K>[];
  const pick = pickLegalRow(kind, shop, sys, query, ymd, { allowNearest });
  // เทียบ "ต่างจากค่าเริ่มต้น" เฉพาะแถวระบบที่มีผลวันเดียวกันจริง (แถวร้านที่เติมช่วงที่ระบบไม่มีแถว ≠ ต่างจากค่าเริ่ม)
  const sysAlt = pick.origin === "SHOP" ? pickLegalRow(kind, [], sys, query, ymd, { allowNearest: false }).row : null;
  return { pick, warnings: pickWarnings(kind, pick, ymd, sysAlt) };
}

/** สถานะผู้จ่ายของหัก ณ ที่จ่ายจากประเภทผู้ประกอบการ — ยังไม่ระบุ ⇒ ถือว่านิติบุคคล (คงค่าแนะนำเดิม) + คำเตือน */
function payerOf(legal: BookLegal): { payer: WhtPayer; warning: LegalWarning | null } {
  const j = isJuristicPayer(legal.entityKind);
  if (j === true) return { payer: "JURISTIC", warning: null };
  if (j === false) return { payer: "NON_JURISTIC", warning: null };
  return {
    payer: "JURISTIC",
    warning: {
      code: "ENTITY_KIND_UNSET",
      messageTh: `ยังไม่ได้ระบุประเภทผู้ประกอบการของสมุดนี้ — ระบบแนะนำอัตราแบบผู้จ่ายเป็นนิติบุคคลไปก่อน ตั้งได้ที่ ตั้งค่า › ข้อมูลกิจการ (${CHECK_WITH_ACCOUNTANT_TH})`,
    },
  };
}

/** ตัวอ่านเดียว (แบบไม่แตะฐาน) — ใช้กับ BookLegal ที่โหลดแล้ว */
export function legalValueFrom<K extends LegalKey>(legal: BookLegal, key: K, date: Date, query?: LegalQuery<K>): LegalValue {
  const ymd = bkkYmd(date);
  if (key === "vat.rate") {
    const { pick, warnings } = pickFrom("vat", legal, {}, ymd);
    return { value: pick.row?.value ?? null, method: "RATE", row: pick.row, origin: pick.origin, ymd, warnings };
  }
  if (key === "filing.deadline") {
    const q = query as DeadlineQuery;
    const { pick, warnings } = pickFrom("deadline", legal, { form: q.form, channel: q.channel }, ymd, q.channel === "PAPER");
    return { value: pick.row?.value ?? null, method: "RATE", row: pick.row, origin: pick.origin, ymd, warnings };
  }
  const q = query as WhtQuery;
  const pre: LegalWarning[] = [];
  let payer = q.payer;
  if (!payer) {
    const p = payerOf(legal);
    payer = p.payer;
    if (p.warning) pre.push(p.warning);
  }
  const recipient = q.recipient ?? "JURISTIC_TH";
  if (!q.recipient) pre.push({ code: "RECIPIENT_ASSUMED", messageTh: "ยังไม่ทราบประเภทผู้รับ — ระบบแนะนำอัตราแบบผู้รับเป็นบริษัท/ห้างฯ ในไทย" });
  const channel = q.channel ?? "NORMAL";
  const base = { incomeType: q.incomeType, payer, recipient };
  if (channel === "EWHT") {
    const e = pickFrom("wht", legal, { ...base, channel: "EWHT" }, ymd, false);
    if (e.pick.row) return { value: e.pick.row.value, method: e.pick.row.method, row: e.pick.row, origin: e.pick.origin, ymd, warnings: [...pre, ...e.warnings] };
    pre.push({ code: "EWHT_NOT_IN_EFFECT", messageTh: `ไม่มีอัตรา e-Withholding Tax ที่มีผลวันที่ ${ymd} สำหรับกรณีนี้ — ระบบใช้อัตราปกติ` });
  }
  const n = pickFrom("wht", legal, { ...base, channel: "NORMAL" }, ymd);
  const row = n.pick.row;
  return { value: row ? row.value : null, method: row ? row.method : "RATE", row, origin: n.pick.origin, ymd, warnings: [...pre, ...n.warnings] };
}

/** ตัวอ่านเดียว — `legalValueAt(key, date, ctx, query)` (โหลดค่าตั้งของสมุดเอง) */
export async function legalValueAt<K extends LegalKey>(key: K, date: Date, ctx: BookCtx, query?: LegalQuery<K>): Promise<LegalValue> {
  return legalValueFrom(await loadBookLegal(ctx), key, date, query);
}

// ═══════════════════ ตัวช่วยบนตัวอ่านเดียว ═══════════════════

/** อัตรา VAT มาตรฐาน (bp) ณ วันที่ — ไม่มีแถวเลย (ร้านลบได้ไม่หมดเพราะแถวระบบอยู่ในโค้ด) จึงไม่ควรเป็น null */
export function vatRateBpFrom(legal: BookLegal, date: Date): number {
  return legalValueFrom(legal, "vat.rate", date).value ?? 0;
}

export async function vatRateBpAt(ctx: BookCtx, date: Date): Promise<number> {
  return vatRateBpFrom(await loadBookLegal(ctx), date);
}

/** ค่าพิเศษของบรรทัดเอกสาร (ไม่ใช่ค่ากฎหมาย): 0 = อัตรา 0% · −1 = ยกเว้น */
export const VAT_ZERO_BP = 0;
export const VAT_EXEMPT_BP = -1;

export type VatRule = { defaultBp: number; allowed: number[] };

/** อัตรา VAT ที่บรรทัดเอกสาร/REST รับได้ = อัตราทุกแถวในตาราง (ระบบ+ร้าน) ∪ {0, ยกเว้น} · ค่าเริ่ม = อัตรา ณ วันที่ */
export function vatRuleFrom(legal: BookLegal, date: Date): VatRule {
  const rates = new Set<number>([...SYSTEM_ROWS.vat, ...legal.shop.vat].map((r) => r.value));
  const defaultBp = vatRateBpFrom(legal, date);
  rates.add(defaultBp);
  return { defaultBp, allowed: [defaultBp, ...[...rates].filter((r) => r !== defaultBp).sort((a, b) => b - a), VAT_ZERO_BP, VAT_EXEMPT_BP] };
}

export async function vatRuleAt(ctx: BookCtx, date: Date): Promise<VatRule> {
  return vatRuleFrom(await loadBookLegal(ctx), date);
}

/** ค่าที่รับได้ไหม — ไม่ได้ ⇒ ใช้ค่าเริ่มของสมุด (แบบเดียวกับ sanitize เดิมที่ถอยไปอัตรามาตรฐาน) */
export function vatBpOrDefault(rule: VatRule, bp: unknown): number {
  return typeof bp === "number" && rule.allowed.includes(bp) ? bp : rule.defaultBp;
}

export const vatRateLabel = (bp: number): string => (bp === VAT_EXEMPT_BP ? "ยกเว้น" : `${bp / 100}%`);

/** ตัวเลือก dropdown VAT (ค่าเริ่มของสมุดขึ้นก่อน) */
export function vatOptionsFrom(rule: VatRule): { value: number; label: string }[] {
  return rule.allowed.map((value) => ({ value, label: vatRateLabel(value) }));
}

/** ประเภทเงินได้ที่เลือกได้บนเอกสาร (ตรง enum AccountWhtIncomeType) */
export const DOC_WHT_INCOME_TYPES = ["M40_1", "M40_2", "M40_3", "M40_4", "M40_5", "M40_6", "M40_7", "M40_8"] as const;

/**
 * อัตราหัก ณ ที่จ่ายที่แนะนำต่อประเภทเงินได้ (bp) — ผู้จ่ายตามประเภทผู้ประกอบการ · ผู้รับไม่ทราบ = บริษัทในไทย · ช่องทางปกติ
 * ไม่หัก/อัตราก้าวหน้า/ไม่มีแถว ⇒ 0 (ผู้ใช้กรอกเอง)
 */
export function whtSuggestionsFrom(legal: BookLegal, date: Date, payer?: WhtPayer): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of DOC_WHT_INCOME_TYPES) {
    const v = legalValueFrom(legal, "wht.rate", date, { incomeType: t, ...(payer ? { payer } : {}) });
    out[t] = v.method === "RATE" && v.value !== null ? v.value : 0;
  }
  return out;
}

export async function whtSuggestionsAt(ctx: BookCtx, date: Date): Promise<Record<string, number>> {
  return whtSuggestionsFrom(await loadBookLegal(ctx), date);
}

/** ตัวเลือกอัตราหัก ณ ที่จ่ายสำหรับ dropdown = อัตราทุกแถว RATE ที่มีผล ณ วันที่ (ระบบ+ร้าน) ∪ {0} · เรียงน้อย→มาก */
export function whtRateOptionsFrom(legal: BookLegal, date: Date): number[] {
  const ymd = bkkYmd(date);
  const inEffect = (r: WhtRateRow) => (r.from === null || r.from <= ymd) && (r.to === null || ymd <= r.to);
  const set = new Set<number>([0]);
  for (const r of [...SYSTEM_ROWS.wht, ...legal.shop.wht]) if (r.method === "RATE" && r.value !== null && inEffect(r)) set.add(r.value);
  return [...set].sort((a, b) => a - b);
}

export const whtRateLabel = (bp: number): string => `${bp / 100}%`;

/** ใครเป็นผู้จ่ายเงินได้ในฟอร์มนี้: ฝั่งจ่าย = ร้านเอง (ตามประเภทผู้ประกอบการ) · ฝั่งรับ = ลูกค้าหักเรา (ถือว่านิติบุคคล — ผู้ที่หักได้ส่วนใหญ่) */
export type WhtSide = "SHOP_PAYS" | "CUSTOMER_PAYS";

/**
 * ก้อนค่ากฎหมายสำหรับฟอร์มฝั่ง client (DocEditorV2 · ชำระเงิน · สินค้า · ผู้ติดต่อ · ผังบัญชี)
 *   shopWhtDefaults = นโยบาย "หัก ณ ที่จ่ายเริ่มต้น" ของร้าน (WO 8.2) — ทับค่าแนะนำจากตารางเฉพาะประเภทที่ร้านตั้ง
 */
export function legalUiOptionsFrom(
  legal: BookLegal,
  date: Date,
  shopWhtDefaults: readonly { incomeType: string; rateBp: number }[] = [],
  side: WhtSide = "SHOP_PAYS",
): LegalUiOptions {
  const rule = vatRuleFrom(legal, date);
  const whtSuggest = whtSuggestionsFrom(legal, date, side === "CUSTOMER_PAYS" ? "JURISTIC" : undefined);
  for (const w of shopWhtDefaults) whtSuggest[w.incomeType] = w.rateBp;
  return { defaultVatBp: rule.defaultBp, vatOptions: vatOptionsFrom(rule), whtSuggest, whtRates: whtRateOptionsFrom(legal, date) };
}

export async function legalUiOptionsAt(
  ctx: BookCtx,
  date: Date,
  shopWhtDefaults: readonly { incomeType: string; rateBp: number }[] = [],
  side: WhtSide = "SHOP_PAYS",
): Promise<LegalUiOptions> {
  return legalUiOptionsFrom(await loadBookLegal(ctx), date, shopWhtDefaults, side);
}

// ═══════════════════ กำหนดยื่นแบบ ═══════════════════

export type FilingDeadline = {
  form: FilingForm;
  taxMonth: string;
  /** วันครบกำหนดยื่นกระดาษ (เที่ยงคืน UTC ของวันไทยนั้น) */
  paper: { day: number; date: Date; row: FilingDeadlineRow } | null;
  /** ยื่นทางอินเทอร์เน็ต — มีเฉพาะเมื่อมีแถวที่ครอบวันครบกำหนดปกติ */
  online: { day: number; date: Date; row: FilingDeadlineRow } | null;
  warnings: LegalWarning[];
};

const utcDate = (y: number, m1: number, d: number) => new Date(Date.UTC(y, m1 - 1, d));
function dayOfNextMonth(taxMonth: string, day: number): Date {
  const [y, m] = taxMonth.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return utcDate(ny, nm, Math.min(day, last));
}

/** กำหนดยื่นของเดือนภาษี "YYYY-MM" — วันปกติจากตาราง + วันออนไลน์ถ้ามีแถวที่ครอบวันครบกำหนดปกติ */
export function filingDeadlineFrom(legal: BookLegal, form: FilingForm, taxMonth: string): FilingDeadline {
  const warnings: LegalWarning[] = [];
  // วันที่เป็นเที่ยงคืน UTC ของวันไทยนั้น ⇒ bkkYmd ได้วันเดียวกัน
  const p = legalValueFrom(legal, "filing.deadline", dayOfNextMonth(taxMonth, 1), { form, channel: "PAPER" });
  warnings.push(...p.warnings);
  const paper = p.value !== null && p.row ? { day: p.value, date: dayOfNextMonth(taxMonth, p.value), row: p.row as FilingDeadlineRow } : null;
  let online: FilingDeadline["online"] = null;
  if (paper) {
    // ช่วงของประกาศขยายเวลา = ช่วงของ "แบบที่ต้องยื่น" ⇒ เทียบกับวันครบกำหนดปกติ
    const o = legalValueFrom(legal, "filing.deadline", paper.date, { form, channel: "ONLINE" });
    if (o.value !== null && o.row) online = { day: o.value, date: dayOfNextMonth(taxMonth, o.value), row: o.row as FilingDeadlineRow };
    warnings.push(...o.warnings.filter((w) => w.code !== "NO_ROW"));
  }
  return { form, taxMonth, paper, online, warnings };
}

export async function filingDeadlineOf(ctx: BookCtx, form: FilingForm, taxMonth: string): Promise<FilingDeadline> {
  return filingDeadlineFrom(await loadBookLegal(ctx), form, taxMonth);
}

// ═══════════════════ มุมมองตาราง (หน้าตั้งค่า · REST · เลขา) ═══════════════════

export type LegalRowView = {
  id: string;
  origin: "SYSTEM" | "SHOP";
  /** แถวนี้คือแถวที่ระบบใช้ ณ วันที่ดู (ไม่ถูกแถวร้านทับ และครอบวันที่) */
  inEffect: boolean;
  value: number | null;
  /** WHT: RATE | NONE | PROGRESSIVE · ตารางอื่น = RATE */
  method: WhtMethod;
  valueLabel: string;
  from: string | null;
  to: string | null;
  source: string;
  tag: string;
  tagLabel: string;
  checkedAt: string | null;
  note: string | null;
  dims: Record<string, string>;
  dimsLabel: string;
  warnings: LegalWarning[];
};

export type BookTaxView = {
  asOf: string;
  entityKind: EntityKind;
  entityKindLabel: string;
  isJuristicPayer: boolean | null;
  vatRateBp: number;
  tables: { vat: LegalRowView[]; wht: LegalRowView[]; deadline: LegalRowView[] };
  warnings: LegalWarning[];
};

function dimsLabelOf(kind: LegalTableKind, r: Record<string, unknown>): string {
  if (kind === "wht") {
    const w = r as unknown as WhtRateRow;
    return [WHT_INCOME_LABEL_TH[w.incomeType] ?? w.incomeType, `ผู้จ่าย: ${WHT_PAYER_LABEL_TH[w.payer]}`, `ผู้รับ: ${WHT_RECIPIENT_LABEL_TH[w.recipient]}`, WHT_CHANNEL_LABEL_TH[w.channel]].join(" · ");
  }
  if (kind === "deadline") {
    const d = r as unknown as FilingDeadlineRow;
    return `${FILING_FORM_LABEL_TH[d.form]} · ${FILING_CHANNEL_LABEL_TH[d.channel]}`;
  }
  return "อัตรามาตรฐาน";
}

function valueLabelOf(kind: LegalTableKind, r: { value: number | null; method?: WhtMethod }): string {
  if (kind === "deadline") return `ภายในวันที่ ${r.value} ของเดือนถัดไป`;
  if (r.method && r.method !== "RATE") return WHT_METHOD_LABEL_TH[r.method];
  return r.value === null ? "-" : `${r.value / 100}%`;
}

function tableView<K extends LegalTableKind>(kind: K, legal: BookLegal, ymd: string): LegalRowView[] {
  const shop = legal.shop[kind] as unknown as LegalRowOf<K>[];
  const sys = SYSTEM_ROWS[kind] as readonly LegalRowOf<K>[];
  const dimKeys = kind === "wht" ? ["incomeType", "payer", "recipient", "channel"] : kind === "deadline" ? ["form", "channel"] : [];
  const covers = (r: { from: string | null; to: string | null }) => (r.from === null || r.from <= ymd) && (r.to === null || ymd <= r.to);
  const view = (r: LegalRowOf<K>, origin: "SYSTEM" | "SHOP"): LegalRowView => {
    const rec = r as unknown as Record<string, unknown>;
    const dims = Object.fromEntries(dimKeys.map((d) => [d, String(rec[d])]));
    const used = pickLegalRow(kind, shop, sys, dims, ymd, { allowNearest: false }).row;
    return {
      id: r.id,
      origin,
      inEffect: covers(r) && used?.id === r.id,
      value: r.value,
      method: (rec.method as WhtMethod | undefined) ?? "RATE",
      valueLabel: valueLabelOf(kind, r as { value: number | null; method?: WhtMethod }),
      from: r.from,
      to: r.to,
      source: r.source,
      tag: r.tag,
      tagLabel: LEGAL_TAG_LABEL_TH[r.tag],
      checkedAt: r.checkedAt,
      note: r.note ?? null,
      dims,
      dimsLabel: dimsLabelOf(kind, rec),
      warnings:
        origin === "SHOP"
          ? shopRowWarnings(kind, r)
          : r.tag === "S" || r.tag === "U"
            ? [{ code: "UNVERIFIED_DEFAULT", messageTh: `ค่าเริ่มต้นนี้ยังไม่ได้ยืนยันจากเอกสารทางการ — ${CHECK_WITH_ACCOUNTANT_TH}`, citation: r.source }]
            : [],
    };
  };
  return [...shop.map((r) => view(r, "SHOP")), ...sys.map((r) => view(r, "SYSTEM"))];
}

export function bookTaxViewFrom(legal: BookLegal, date: Date): BookTaxView {
  const ymd = bkkYmd(date);
  const warnings: LegalWarning[] = [];
  if (legal.entityKind === "UNSET") {
    warnings.push({ code: "ENTITY_KIND_UNSET", messageTh: "ยังไม่ได้ระบุประเภทผู้ประกอบการ — ตั้งได้ที่ ตั้งค่า › ข้อมูลกิจการ (ใช้กับคำเตือน รายงาน ปฏิทินภาษี และหัก ณ ที่จ่าย)" });
  }
  return {
    asOf: ymd,
    entityKind: legal.entityKind,
    entityKindLabel: ENTITY_KIND_LABEL_TH[legal.entityKind],
    isJuristicPayer: isJuristicPayer(legal.entityKind),
    vatRateBp: vatRateBpFrom(legal, date),
    tables: { vat: tableView("vat", legal, ymd), wht: tableView("wht", legal, ymd), deadline: tableView("deadline", legal, ymd) },
    warnings,
  };
}

export async function bookTaxView(ctx: BookCtx, date: Date = new Date()): Promise<BookTaxView> {
  return bookTaxViewFrom(await loadBookLegal(ctx), date);
}

// ═══════════════════ เขียน (ผ่านเครื่องยนต์ค่าตั้ง — สิทธิ์ · ประวัติ · audit · outbox) ═══════════════════

export type BookTaxPatch = {
  entityKind?: EntityKind;
  /** แทน "แถวที่ร้านตั้ง" ทั้งชุดของตารางนั้น (ไม่แตะแถวระบบ) · [] = กลับไปใช้ค่าเริ่มต้นทั้งหมด */
  vatRows?: Omit<VatRateRow, "tag">[];
  whtRows?: Omit<WhtRateRow, "tag">[];
  deadlineRows?: Omit<FilingDeadlineRow, "tag">[];
};

export type BookTaxSaveResult = (SetResult & { warnings: LegalWarning[] });

/** แถวของร้านติดป้าย SHOP เสมอ (ร้านอ้างป้าย [V] เองไม่ได้) · ไม่มี id = สร้างให้ · ที่มาว่าง = "ร้านตั้งเอง" */
function shopify<R extends { id?: string; source?: string; checkedAt?: string | null }>(rows: readonly R[]): (R & { id: string; tag: "SHOP"; source: string; checkedAt: string | null })[] {
  return rows.map((r) => ({ ...r, id: r.id && r.id.trim() ? r.id : `shop-${randomUUID().slice(0, 12)}`, tag: "SHOP" as const, source: (r.source ?? "").trim() || "ร้านตั้งเอง", checkedAt: r.checkedAt ?? null }));
}

export async function saveBookTax(actor: SettingsActor, ctx: BookCtx, patch: BookTaxPatch, reason?: string): Promise<BookTaxSaveResult> {
  const changes: { key: string; scope: string; scopeId: string; value: unknown; reason?: string }[] = [];
  const warnings: LegalWarning[] = [];
  const push = (key: string, value: unknown) => changes.push({ key, scope: "ACCOUNT_BOOK", scopeId: ctx.systemId, value, ...(reason ? { reason } : {}) });
  if (patch.entityKind !== undefined) push(ACCOUNT_SETTING_KEYS.entityKind, patch.entityKind);
  if (patch.vatRows !== undefined) {
    const rows = shopify(patch.vatRows) as VatRateRow[];
    for (const r of rows) warnings.push(...shopRowWarnings("vat", r));
    push(KEY_OF.vat, rows);
  }
  if (patch.whtRows !== undefined) {
    const rows = shopify(patch.whtRows) as WhtRateRow[];
    for (const r of rows) warnings.push(...shopRowWarnings("wht", r));
    push(KEY_OF.wht, rows);
  }
  if (patch.deadlineRows !== undefined) {
    const rows = shopify(patch.deadlineRows) as FilingDeadlineRow[];
    for (const r of rows) warnings.push(...shopRowWarnings("deadline", r));
    push(KEY_OF.deadline, rows);
  }
  if (changes.length === 0) return { ok: true, saved: 0, warnings };
  const res = await setSettings(actor, { tenantId: ctx.tenantId }, changes);
  return { ...res, warnings };
}
