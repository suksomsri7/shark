// ─────────────────────────────────────────────────────────────
// settings-shared.ts — โมเดลฟอร์มค่าตั้ง + ฟังก์ชัน pure ของหน้าตั้งค่า (R0.4)
// ใบสั่ง ledger/svc-briefs/svc-brief-r0.4.md §2 §4
//
// 🔴 pure ล้วน: ไม่มี directive · import ได้เฉพาะ `import type` จาก @/lib/core/settings/types
//    (ทั้ง server — form.ts, หน้าห่อ — และ client — SettingsForm.tsx — import ไฟล์นี้ได้)
// 🔴 ทุกค่าในโมเดลเป็น JSON ล้วน (ไม่มี function/Date/zod) — วันที่เป็น ISO string
// ─────────────────────────────────────────────────────────────
import type { ScopeKind, SettingChangeInput, SettingValueType } from "@/lib/core/settings/types";

export type SettingsFieldOption = { value: string; labelTh: string };
export type SettingsFieldSource = ScopeKind | "TEMPLATE" | "FALLBACK";

export type SettingsField = {
  key: string;
  domain: string;
  group: string;
  type: SettingValueType;
  labelTh: string;
  helpTh: string | null;
  /** ค่าที่มีผล ณ (scope, scopeId) รวมการสืบชั้น · masked ⇒ null */
  value: unknown;
  /** มีแถว SettingValue ที่ (key, scope, scopeId) นี้เอง */
  hasOwn: boolean;
  source: SettingsFieldSource;
  sourceLabelTh: string;
  templateValue: unknown;
  differsFromTemplate: boolean;
  /** แถวชั้นที่ลึกกว่า scope นี้ (ในสาขาเดียวกัน) ของคีย์นี้ ⇒ ป้าย "ปรับรายคน N" */
  overrideCount: number;
  editable: boolean;
  /** !editable ⇒ ข้อความไทยไม่ว่าง */
  lockedReasonTh: string | null;
  /** sensitivity PRIVACY และผู้ดูไม่ใช่ OWNER */
  masked: boolean;
  /** key ∈ PENDING_LEGAL_REVIEW_KEYS (rooms) — ป้ายเท่านั้น */
  pendingLegalReview: boolean;
  options: SettingsFieldOption[] | null;
  nullable: boolean;
  min: number | null;
  max: number | null;
  templateVars: string[] | null;
  requiresIntegration: string | null;
  effectiveDated: boolean;
  sensitivity: "MONEY" | "LEGAL" | "PRIVACY" | null;
  ownerOnly: boolean;
  /** B.11 ▸ type=percent: 100 = เก็บเป็น % เต็ม (0–100) · ไม่มี/10000 = basis point (คัดลอกจาก def — ห้ามเดาจาก max) ◂ */
  percentScale?: 100 | 10000;
};

export type SettingsHistoryRow = {
  id: string;
  key: string;
  labelTh: string;
  beforeTh: string;
  afterTh: string;
  at: string;
  legalLevel: string;
  masked: boolean;
};

export type SettingsFormModel = {
  unitId: string;
  unitName: string;
  scope: ScopeKind;
  scopeId: string;
  domains: string[];
  templates: { domain: string; key: string | null; labelTh: string | null }[];
  groups: { domain: string; key: string; labelTh: string; fields: SettingsField[] }[];
  /** จำนวน field ที่ differsFromTemplate */
  differsCount: number;
  /** ≤ 50 ล่าสุด ของคีย์ใน domains · สาขานี้ (+TENANT เมื่อผู้ดูไม่จำกัดสาขา) */
  history: SettingsHistoryRow[];
};

/** ส่วนของ field ที่การแสดงผลค่าต้องใช้ (SettingsField เต็มก็ส่งได้) */
export type FieldFormatSpec = Pick<SettingsField, "key" | "type" | "options" | "masked">;

/** ป้ายไทยของชั้น (ใช้ใน sourceLabelTh) */
export const SCOPE_LABEL_TH: Record<string, string> = {
  TENANT: "ทั้งร้าน",
  UNIT: "สาขา",
  BUILDING: "อาคาร",
  ROOM_TYPE: "ประเภทห้อง",
  ROOM: "ห้อง",
  LEASE: "สัญญา",
  RATE_PLAN: "แผนราคา",
  STAFF: "พนักงาน",
  SERVICE: "บริการ",
  RESOURCE: "ทรัพยากร",
  DEVICE: "อุปกรณ์",
  COURSE: "คอร์ส",
};

// ───────────────────────── ตัวช่วย ─────────────────────────

/** B.11 ▸ หน่วยเก็บของ percent (มีฟิลด์ percentScale = 100 ⇒ % เต็ม · อื่น = bp) — อ่านจากฟิลด์เท่านั้น ◂ */
const percentScaleOf = (f: object): number => ("percentScale" in f && f.percentScale === 100 ? 100 : 10000);

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** เทียบค่า JSON แบบลึก (ลำดับคีย์ในออบเจกต์ไม่มีผล) */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isRec(a) && isRec(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

const groupDigits = (n: string): string => n.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** สตางค์ → "1,250.50" (ไม่มีเศษ ⇒ "1,250") */
function bahtText(satang: number): string {
  const neg = satang < 0;
  const abs = Math.abs(Math.round(satang));
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const w = groupDigits(String(whole));
  return `${neg ? "-" : ""}${frac === 0 ? w : `${w}.${String(frac).padStart(2, "0")}`}`;
}

/** basis point → "7.5" (ไม่มีเศษ ⇒ "10") */
function percentText(bp: number): string {
  const neg = bp < 0;
  const abs = Math.abs(Math.round(bp));
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const f = frac === 0 ? "" : `.${String(frac).padStart(2, "0").replace(/0$/, "")}`;
  return `${neg ? "-" : ""}${whole}${f}`;
}

/** หน่วยที่ผู้ใช้กรอก (แสดงท้ายช่อง) */
export function unitLabelTh(type: SettingValueType): string | null {
  switch (type) {
    case "money":
      return "บาท";
    case "percent":
      return "%";
    case "minutes":
      return "นาที";
    case "days":
      return "วัน";
    default:
      return null;
  }
}

/** ค่าเก็บ → ข้อความในช่องกรอก (money/percent แปลงเป็นหน่วยที่ผู้ใช้กรอก) */
export function valueToInputText(field: Pick<SettingsField, "type">, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (field.type === "money") return (Math.round(value) / 100).toFixed(2).replace(/\.00$/, "");
    if (field.type === "percent" && percentScaleOf(field) === 100) return String(value); // B.11 percentScale
    if (field.type === "percent") return percentText(value);
    return String(value);
  }
  return typeof value === "string" ? value : String(value);
}

// ───────────────────────── submissionFor ─────────────────────────

/**
 * ประกอบสิ่งที่จะส่งเมื่อกดบันทึก
 *  changes = เฉพาะคีย์ใน edits ที่ (มีใน model · editable · ไม่ masked · ไม่อยู่ใน follow · ค่าไม่เท่า field.value แบบลึก)
 *            scope/scopeId จากโมเดล — ไม่มีคีย์อื่นเด็ดขาด
 *  resets  = คีย์ใน follow ที่ hasOwn && editable (ไม่มีแถวของตัวเอง = ไม่ส่ง)
 */
export function submissionFor(
  model: SettingsFormModel,
  edits: Record<string, unknown>,
  follow: ReadonlySet<string>,
): { changes: SettingChangeInput[]; resets: { key: string; scope: string; scopeId: string }[] } {
  const byKey = new Map<string, SettingsField>();
  for (const g of model.groups) for (const f of g.fields) byKey.set(f.key, f);
  const changes: SettingChangeInput[] = [];
  for (const [key, value] of Object.entries(edits)) {
    const f = byKey.get(key);
    if (!f || !f.editable || f.masked || follow.has(key)) continue;
    if (deepEqual(value, f.value)) continue;
    changes.push({ key, scope: model.scope, scopeId: model.scopeId, value });
  }
  const resets: { key: string; scope: string; scopeId: string }[] = [];
  for (const key of follow) {
    const f = byKey.get(key);
    if (!f || !f.hasOwn || !f.editable) continue;
    resets.push({ key, scope: model.scope, scopeId: model.scopeId });
  }
  return { changes, resets };
}

// ───────────────────────── parseFieldInput ─────────────────────────

export type ParseResult = { ok: true; value: unknown } | { ok: false; messageTh: string };

const bad = (messageTh: string): ParseResult => ({ ok: false, messageTh });
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

type NumFmt = (n: number) => string;
function rangeCheck(f: Pick<SettingsField, "labelTh" | "min" | "max">, n: number, fmt: NumFmt, unit: string): ParseResult | null {
  if (f.min !== null && n < f.min) return bad(`«${f.labelTh}» ต้องไม่น้อยกว่า ${fmt(f.min)}${unit}`);
  if (f.max !== null && n > f.max) return bad(`«${f.labelTh}» ต้องไม่เกิน ${fmt(f.max)}${unit}`);
  return null;
}

/** เลขทศนิยมไม่เกิน 2 ตำแหน่ง → จำนวนเต็ม ×100 (คำนวณเลขจำนวนเต็ม ไม่ใช้ float) */
function scaled100(text: string): { ok: true; n: number } | { ok: false; reason: "NEG" | "FRAC" | "NAN" } {
  const t = text.replace(/[,\s฿%]/g, "");
  if (/^-\d/.test(t) || /^-\.\d/.test(t)) return { ok: false, reason: "NEG" };
  const m = /^(\d*)(?:\.(\d*))?$/.exec(t);
  if (!m || (m[1] === "" && (m[2] ?? "") === "")) return { ok: false, reason: "NAN" };
  const frac = m[2] ?? "";
  if (frac.length > 2) return { ok: false, reason: "FRAC" };
  return { ok: true, n: Number(m[1] || "0") * 100 + Number(frac.padEnd(2, "0") || "0") };
}

/** B.11 ▸ percentScale 100: กรอก % เต็มเป็นจำนวนเต็ม (เช่น "70" ⇒ 70) ◂ */
function parseWholePercent(field: Pick<SettingsField, "labelTh" | "min" | "max">, t: string): ParseResult {
  const c = t.replace(/[,\s%]/g, "");
  if (/^-/.test(c)) return bad(`«${field.labelTh}» กรอกเปอร์เซ็นต์ ห้ามติดลบ`);
  if (!/^\d+$/.test(c)) return bad(`«${field.labelTh}» กรอกเปอร์เซ็นต์เป็นจำนวนเต็ม เช่น 60`);
  const n = Number(c);
  return rangeCheck(field, n, (x) => String(x), "%") ?? { ok: true, value: n };
}

export function parseFieldInput(
  field: Pick<SettingsField, "type" | "labelTh" | "nullable" | "min" | "max" | "options">,
  raw: string | boolean,
): ParseResult {
  const label = `«${field.labelTh}»`;
  if (field.type === "bool") {
    if (typeof raw === "boolean") return { ok: true, value: raw };
    if (raw === "true") return { ok: true, value: true };
    if (raw === "false") return { ok: true, value: false };
    return bad(`${label} เลือกเปิดหรือปิด`);
  }
  const text = typeof raw === "string" ? raw : String(raw);
  const blank = text.trim() === "";
  if (blank) {
    if (field.nullable) return { ok: true, value: null };
    if (field.type === "text" || field.type === "template") return { ok: true, value: "" };
    return bad(`กรุณากรอก ${label}`);
  }
  const t = text.trim();
  switch (field.type) {
    case "int":
    case "minutes":
    case "days": {
      const unit = unitLabelTh(field.type);
      const u = unit ? ` ${unit}` : "";
      const c = t.replace(/,/g, "");
      if (!/^-?\d+$/.test(c)) return bad(`${label} กรอกเป็นจำนวนเต็ม${unit ? ` (${unit})` : ""}`);
      const n = Number(c);
      if (!Number.isSafeInteger(n)) return bad(`${label} ตัวเลขใหญ่เกินไป`);
      return rangeCheck(field, n, (x) => groupDigits(String(x)), u) ?? { ok: true, value: n };
    }
    case "money": {
      const r = scaled100(t);
      if (!r.ok) {
        if (r.reason === "NEG") return bad(`${label} กรอกจำนวนเงินเป็นบาท ห้ามติดลบ`);
        if (r.reason === "FRAC") return bad(`${label} ทศนิยมได้ไม่เกิน 2 ตำแหน่ง (สตางค์)`);
        return bad(`${label} กรอกจำนวนเงินเป็นตัวเลข (บาท) เช่น 1,250.50`);
      }
      if (!Number.isSafeInteger(r.n)) return bad(`${label} ตัวเลขใหญ่เกินไป`);
      return rangeCheck(field, r.n, bahtText, " บาท") ?? { ok: true, value: r.n };
    }
    case "percent": {
      if (percentScaleOf(field) === 100) return parseWholePercent(field, t); // B.11 percentScale
      const r = scaled100(t);
      if (!r.ok) {
        if (r.reason === "NEG") return bad(`${label} กรอกเปอร์เซ็นต์ ห้ามติดลบ`);
        if (r.reason === "FRAC") return bad(`${label} ทศนิยมได้ไม่เกิน 2 ตำแหน่ง`);
        return bad(`${label} กรอกเป็นตัวเลขเปอร์เซ็นต์ เช่น 7.5`);
      }
      return rangeCheck(field, r.n, percentText, "%") ?? { ok: true, value: r.n };
    }
    case "time":
      return HHMM.test(t) ? { ok: true, value: t } : bad(`${label} กรอกเวลาเป็น ชั่วโมง:นาที เช่น 08:30`);
    case "enum": {
      if ((field.options ?? []).some((o) => o.value === text)) return { ok: true, value: text };
      return bad(`${label} เลือกจากตัวเลือกที่มีให้`);
    }
    case "table": {
      try {
        return { ok: true, value: JSON.parse(text) as unknown };
      } catch {
        return bad(`${label} รูปแบบข้อมูลไม่ถูกต้อง`);
      }
    }
    default:
      return { ok: true, value: text }; // text · template — ส่งตามเดิม (เครื่องยนต์ตรวจต่อ)
  }
}

// ───────────────────────── formatFieldValue ─────────────────────────

/** ป้ายไทยของชื่อช่องย่อยในค่าชนิดตาราง (ไม่รู้จัก ⇒ ใช้ชื่อเดิม) */
export const TABLE_KEY_TH: Record<string, string> = {
  promptpayId: "พร้อมเพย์",
  displayName: "ชื่อบัญชี",
  bankAccount: "เลขบัญชี",
  paymentProfileId: "โปรไฟล์รับเงิน",
  labelTh: "ชื่อที่แสดง",
  start: "เริ่ม",
  end: "ถึง",
  per: "คิดต่อ",
  satang: "จำนวนเงิน (สตางค์)",
  kind: "ชนิด",
  uptoUnits: "ถึงหน่วยที่",
  rateE4: "อัตรา (หน่วย 1/10000 บาท)",
  ftE4: "ค่า Ft (หน่วย 1/10000 บาท)",
  pctFromAvg3: "ต่างจากค่าเฉลี่ย 3 เดือนเกิน (%)",
  vacantMaxUnits: "ห้องว่างใช้ได้ไม่เกิน (หน่วย)",
  flagBackwards: "เตือนเมื่อเลขถอยหลัง",
  code: "รหัส",
  amountSatang: "จำนวนเงิน (สตางค์)",
  textTh: "ข้อความไทย",
  textEn: "ข้อความอังกฤษ",
  id: "รหัส",
  board: "บอร์ดงาน",
  assigneeId: "ผู้รับผิดชอบ",
  RENT: "ค่าห้อง",
  COMMON: "ค่าส่วนกลาง",
  ELEC: "ค่าไฟ",
  WATER: "ค่าน้ำ",
  SERVICE: "ค่าบริการ",
  LATE_FEE: "ค่าปรับล่าช้า",
  _default: "ค่าเริ่มต้น",
  th: "ไทย",
  en: "อังกฤษ",
};

const keyTh = (k: string): string => TABLE_KEY_TH[k] ?? k;

function scalarText(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "เปิด" : "ปิด";
  return String(v);
}

/** สรุปค่าชนิดตาราง/แม่แบบเป็นข้อความสั้น (ไม่ขึ้นต้น { หรือ [) */
function summarize(v: unknown, depth = 0): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) {
    if (v.length === 0) return "ไม่มีรายการ";
    if (v.every((x) => x === null || typeof x !== "object")) return v.map(scalarText).join(", ");
    return `${v.length} รายการ`;
  }
  if (isRec(v)) {
    const parts = Object.entries(v)
      .filter(([, x]) => x !== undefined)
      .map(([k, x]) => `${keyTh(k)} ${depth > 0 && typeof x === "object" && x !== null ? "…" : summarize(x, depth + 1)}`);
    return parts.length ? parts.join(" · ") : "ไม่มีรายการ";
  }
  return scalarText(v);
}

function templatePreview(v: unknown): string {
  let text = "";
  if (typeof v === "string") text = v;
  else if (isRec(v)) text = typeof v.th === "string" ? v.th : (Object.values(v).find((x) => typeof x === "string") as string | undefined) ?? "";
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return "—";
  return `“${text.length > 60 ? `${text.slice(0, 60)}…` : text}”`;
}

/** ค่า → ข้อความที่คนอ่านรู้เรื่อง (money ฿ · percent % · นาที · วัน · เปิด/ปิด · ป้าย enum · ว่าง "—" · masked "ซ่อนไว้") */
export function formatFieldValue(field: FieldFormatSpec, value: unknown): string {
  if (field.masked) return "ซ่อนไว้";
  if (value === null || value === undefined) return "—";
  if (field.type === "percent" && percentScaleOf(field) === 100) return typeof value === "number" ? `${value}%` : String(value); // B.11 percentScale
  switch (field.type) {
    case "money":
      return typeof value === "number" ? `฿${bahtText(value)}` : String(value);
    case "percent":
      return typeof value === "number" ? `${percentText(value)}%` : String(value);
    case "minutes":
      return `${value} นาที`;
    case "days":
      return `${value} วัน`;
    case "bool":
      return value === true ? "เปิด" : value === false ? "ปิด" : String(value);
    case "enum": {
      const o = (field.options ?? []).find((x) => x.value === value);
      return o ? o.labelTh : String(value);
    }
    case "table":
      return summarize(value);
    case "template":
      return templatePreview(value);
    case "text":
      return typeof value === "string" ? (value === "" ? "—" : value) : summarize(value);
    default:
      return typeof value === "object" ? summarize(value) : String(value);
  }
}
