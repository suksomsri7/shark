// ─────────────────────────────────────────────────────────────
// trips/passengers-core.ts — แกนบริสุทธิ์ของผู้เดินทาง: แบบฟอร์มต่อสินค้า · อายุ/ผู้เยาว์ · ปิดบัง · กำหนดลบ · รูป JSON ที่เก็บ · zod ของคำขอ · RUN TRIPS T0.8
// ใบสั่ง ledger/trips-briefs/T0.8.md §2 §3 §4 §5 §6 §8 (§17 มติผู้คุมชนะ)
//
// 🔴 บริสุทธิ์: import ได้แค่ zod · node:crypto (แฮช) · import type — ไม่มี I/O · ไม่อ่านนาฬิกา (ผู้เรียกส่งเวลาเข้ามา) · ไม่ throw
// 🔴 ข้อความอิสระ = กติกาเดียวกับ booking-core.ts (คัดลอกมา · ห้ามแก้ booking-core) · จำนวนเต็มทุกช่องจำกัด int4 · ทุกอินพุต z.strictObject
// ─────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";
import { z } from "zod";

// ── T0.8 passengers ──
export const INT4_MAX = 2_147_483_647;
const sha256hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

// ═══════════════ ข้อความอิสระ (สำเนากติกา booking-core.ts :13–:29) ═══════════════
const BAD_CHARS = /[\u0000-\u001f\u007f-\u009f\u061c\u200b\u200e\u200f\u2028-\u202e\u2066-\u2069\ufeff]/;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const noCtl = (s: string) => !BAD_CHARS.test(s) && !LONE_SURROGATE.test(s);
const STRIP_SOFT = /[\u200b\ufeff]/g;
/** ข้อความอิสระ: ตัด ZWSP/BOM → NFC → trim แล้วตรวจความยาว + อักขระต้องห้าม */
export const text = (max: number) =>
  z
    .string()
    .max(max * 4 + 64)
    .transform((s) => s.replace(STRIP_SOFT, "").normalize("NFC").trim())
    .pipe(z.string().max(max).refine(noCtl, { message: "มีอักขระควบคุม" }));
export const ID = z.string().trim().min(1).max(128).refine(noCtl, { message: "มีอักขระควบคุม" });
export const NN = z.number().int().min(0).max(INT4_MAX);
/** คีย์กันซ้ำ (รูปเดียวกับ IDEM_KEY ของ booking-core) */
export const IDEM_KEY = z.string().regex(/^[A-Za-z0-9_-]{8,90}$/);
export const TOKEN = z.string().min(1).max(4096);
const HEX64 = z.string().regex(/^[0-9a-f]{64}$/);

// ═══════════════ วันที่ ═══════════════
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function isRealYmd(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = YMD_RE.exec(s);
  if (!m) return false;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}
export function addDaysYmd(ymd: string, n: number): string {
  const m = YMD_RE.exec(ymd);
  if (!m) return ymd;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n)).toISOString().slice(0, 10);
}
const fmtCache = new Map<string, Intl.DateTimeFormat | null>();
function formatterOf(tz: string): Intl.DateTimeFormat | null {
  if (fmtCache.has(tz)) return fmtCache.get(tz) ?? null;
  let f: Intl.DateTimeFormat | null = null;
  try {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    f = null;
  }
  if (fmtCache.size < 200) fmtCache.set(tz, f);
  return f;
}
/** เวลาผนัง (ms ที่อ่านเป็น UTC) ของ instant ในเขตเวลา tz · เขตเวลาผิด ⇒ เวลาไทย (+7 ไม่มีออมแสง) */
function wallMs(tz: string, utcMs: number): number {
  const f = formatterOf(tz);
  if (!f) return utcMs + 7 * 3_600_000;
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(utcMs))) if (x.type !== "literal") p[x.type] = Number(x.value);
  return Date.UTC(p.year ?? 1970, (p.month ?? 1) - 1, p.day ?? 1, p.hour ?? 0, p.minute ?? 0, p.second ?? 0);
}
/** วันที่ (YYYY-MM-DD) ของ instant ตามเขตเวลาหน่วย */
export function localYmdOf(d: Date, tz: string): string {
  return new Date(wallMs(tz, d.getTime())).toISOString().slice(0, 10);
}
/** ต้นวันถัดจาก dueYmd ตามเวลาหน่วย (เก็บถึงสิ้นวัน dueYmd) */
export function purgeInstant(dueYmd: string, tz: string): Date {
  const m = YMD_RE.exec(dueYmd);
  const wall = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1) : 0;
  let t = wall - (wallMs(tz, wall) - wall);
  t = wall - (wallMs(tz, t) - t);
  return new Date(t);
}
/** endYmd + days · days = null ⇒ ไม่ลบ (null) */
export function retentionDueYmd(endYmd: string, days: number | null): string | null {
  if (days === null || !isRealYmd(endYmd)) return null;
  return addDaysYmd(endYmd, days);
}
/** "ไม่ลบ" ของ TripDocument.retainUntil (NOT NULL · §8 Q7) */
export const NEVER_PURGE_ISO = "9999-12-31T00:00:00.000Z";

/** ปีเต็ม ณ วันเดินทาง · วันเกิดวันเดียวกัน = ครบปี · 29 ก.พ. ครบปีในปีปกติวันที่ 1 มี.ค. · วันที่ผิด/อนาคต ⇒ null */
export function ageAt(dobYmd: string, onYmd: string): number | null {
  if (!isRealYmd(dobYmd) || !isRealYmd(onYmd) || dobYmd > onYmd) return null;
  const age = Number(onYmd.slice(0, 4)) - Number(dobYmd.slice(0, 4)) - (onYmd.slice(5) < dobYmd.slice(5) ? 1 : 0);
  return age >= 0 && age <= 200 ? age : null;
}
export type MinorRule = { parentOnlyAtOrBelow: number; minorBelow: number };
export function minorStatus(i: { dob: string | null; declaredMinor: boolean | null; travelYmd: string; rule: MinorRule }): { known: boolean; isMinor: boolean; guardianOnly: boolean; age: number | null } {
  const age = i.dob ? ageAt(i.dob, i.travelYmd) : null;
  if (age !== null) return { known: true, isMinor: age < i.rule.minorBelow, guardianOnly: age <= i.rule.parentOnlyAtOrBelow, age };
  if (typeof i.declaredMinor === "boolean") return { known: true, isMinor: i.declaredMinor, guardianOnly: false, age: null };
  return { known: false, isMinor: false, guardianOnly: false, age: null };
}

// ═══════════════ เลขเอกสาร · ปิดบัง ═══════════════
export function normalizeDocNumber(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.toUpperCase().replace(/[\s-]+/g, "");
  return /^[A-Z0-9]{5,20}$/.test(s) ? s : null;
}
export function docLast4Of(normalized: string): string {
  return normalized.slice(-4);
}
export function maskDoc(last4: string | null): string | null {
  return last4 ? `••••${last4}` : null;
}
export function maskDob(ymd: string | null): string | null {
  return ymd ? `${ymd.slice(0, 4)}-••-••` : null;
}

// ═══════════════ สิทธิ์ข้อมูลอ่อนไหว (แคบกว่า evaluate · แบบ rbac.ts canViewPayroll) ═══════════════
export type SensitiveKey = "trips.passenger.health" | "trips.passenger.reveal";
export function canSeeSensitive(m: { role: string; unitAccess: string[]; permissions: Record<string, unknown> } | null, key: SensitiveKey, unitId: string): boolean {
  if (!m) return false;
  if (m.role === "OWNER") return true;
  const unitOk = Array.isArray(m.unitAccess) && (m.unitAccess.includes("*") || m.unitAccess.includes(unitId));
  return unitOk && m.permissions?.[key] === true;
}

// ═══════════════ แบบฟอร์มต่อสินค้า (§3) ═══════════════
export const PAX_FIELD_KEYS = ["fullName", "nationality", "dob", "sex", "docType", "docNumber", "docExpiry", "phone", "birthPlace", "certLevel", "diveCount", "lastDiveAt", "finSize", "allergies", "pickupHotel"] as const;
export type PaxFieldKey = (typeof PAX_FIELD_KEYS)[number];
export type FieldReq = "OFF" | "OPTIONAL" | "REQUIRED";
export type WaiverTemplate = { th: string; en?: string };
export type FormSpec = {
  fields: Record<PaxFieldKey, FieldReq>;
  health: { enabled: boolean; conditions: boolean; allergies: boolean; medicalDocument: boolean };
  waiver: { required: boolean; templateHash: string | null; template: WaiverTemplate | null };
  minor: MinorRule;
};
const PAX_REQ = z.enum(["OFF", "OPTIONAL", "REQUIRED", "REQUIRED_CROSS_BORDER"]);
const PAX_FIELDS_IN = z.strictObject(Object.fromEntries(PAX_FIELD_KEYS.map((k) => [k, PAX_REQ])) as Record<PaxFieldKey, typeof PAX_REQ>);
const TEMPLATE_IN = z.object({ th: z.string().min(1).max(20_000), en: z.string().max(20_000).optional() });
const MINOR_IN = z.object({ parentOnlyAtOrBelow: z.number().int().min(0).max(200), minorBelow: z.number().int().min(0).max(200) });
export function waiverTemplateHash(t: WaiverTemplate): string {
  return sha256hex(JSON.stringify(["trips.waiver.v1", t.th, t.en ?? null]));
}
export function resolveFormSpec(i: {
  paxFields: unknown;
  crossBorder: boolean;
  deepDive: boolean;
  healthDataProduct: unknown;
  waiverRequiredFor: unknown;
  waiverTemplate: unknown;
  minorConsent: unknown;
}): { ok: true; spec: FormSpec } | { ok: false; reason: "SETTINGS_INVALID"; key: string } {
  const bad = (key: string) => ({ ok: false as const, reason: "SETTINGS_INVALID" as const, key });
  const pf = PAX_FIELDS_IN.safeParse(i.paxFields);
  if (!pf.success) return bad("trips.pax.fields");
  if (typeof i.healthDataProduct !== "boolean") return bad("trips.pdpa.healthDataProducts");
  const wr = z.enum(["ALL", "SCUBA_ONLY", "NONE"]).safeParse(i.waiverRequiredFor);
  if (!wr.success) return bad("trips.waiver.requiredFor");
  const tp = TEMPLATE_IN.safeParse(i.waiverTemplate);
  if (!tp.success) return bad("trips.waiver.template");
  const mc = MINOR_IN.safeParse(i.minorConsent);
  if (!mc.success) return bad("trips.pdpa.minorConsent");
  const fields = {} as Record<PaxFieldKey, FieldReq>;
  for (const k of PAX_FIELD_KEYS) {
    const v = pf.data[k];
    const r: FieldReq = v === "REQUIRED_CROSS_BORDER" ? (i.crossBorder === true ? "REQUIRED" : "OFF") : v;
    fields[k] = k === "fullName" && r === "OFF" ? "OPTIONAL" : r;
  }
  const t62 = i.healthDataProduct;
  const allergies = fields.allergies !== "OFF";
  const required = wr.data === "ALL" ? true : wr.data === "SCUBA_ONLY" ? i.deepDive === true : false;
  const template: WaiverTemplate = { th: tp.data.th, ...(typeof tp.data.en === "string" ? { en: tp.data.en } : {}) };
  return {
    ok: true,
    spec: {
      fields,
      health: { enabled: t62 || allergies, conditions: t62, allergies, medicalDocument: t62 },
      waiver: { required, templateHash: required ? waiverTemplateHash(template) : null, template: required ? template : null },
      minor: { parentOnlyAtOrBelow: mc.data.parentOnlyAtOrBelow, minorBelow: mc.data.minorBelow },
    },
  };
}

// ═══════════════ ข้อความยินยอมรุ่น 1 (ม.19 · แช่แข็ง) ═══════════════
const CONSENT_V1_TH =
  "ข้าพเจ้ายินยอมให้ร้านเก็บและใช้ข้อมูลสุขภาพของผู้เดินทางคนนี้ (อาหารที่แพ้ โรคประจำตัว แบบฟอร์มแพทย์) เพื่อความปลอดภัยและการจัดบริการของทริปนี้เท่านั้น ข้อมูลจะถูกลบตามระยะเวลาที่ร้านกำหนด และถอนความยินยอมได้ทุกเมื่อจากลิงก์นี้หรือแจ้งร้าน";
const CONSENT_V1_EN =
  "I consent to the shop collecting and using this traveller's health information (food allergies, medical conditions, medical form) only for the safety and service of this trip. The information will be deleted after the shop's retention period, and I can withdraw consent at any time from this link or by telling the shop.";
const CONSENT_V1_VERSION = "trips.health-consent.v1" as const;
export const HEALTH_CONSENT_V1: { readonly version: "trips.health-consent.v1"; readonly th: string; readonly en: string; readonly hash: string } = Object.freeze({
  version: CONSENT_V1_VERSION,
  th: CONSENT_V1_TH,
  en: CONSENT_V1_EN,
  hash: sha256hex(JSON.stringify([CONSENT_V1_VERSION, CONSENT_V1_TH, CONSENT_V1_EN])),
});

// ═══════════════ ชุดค่า ═══════════════
export const SEXES = ["M", "F", "X"] as const;
export const DOC_TYPES = ["PASSPORT", "ID_CARD", "OTHER"] as const;
export const CERT_LEVELS = ["NONE", "OW", "AOW", "RESCUE", "DIVEMASTER", "INSTRUCTOR", "OTHER"] as const;
export const FIX_REASONS = ["DOC_UNREADABLE", "NAME_MISMATCH", "DOC_EXPIRED", "MISSING_INFO", "OTHER"] as const;
export type FixReason = (typeof FIX_REASONS)[number];
export const PURPOSES = ["CHECKIN", "MANIFEST", "SAFETY", "PDPA_REQUEST", "CUSTOMER_SERVICE", "OTHER"] as const;
export type Purpose = (typeof PURPOSES)[number];
export const DOC_KINDS = ["PASSPORT", "MEDICAL", "CERT", "INSURANCE", "WAIVER"] as const;
export type DocKind = (typeof DOC_KINDS)[number];
export const PUBLIC_DOC_KINDS = ["PASSPORT", "MEDICAL", "CERT"] as const;
export const UPLOAD_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
export const UPLOAD_EXT: Record<(typeof UPLOAD_TYPES)[number], string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const DOC_LIMIT_PER_KIND = 3;
/** ช่องที่ปิดรับหลังวันปิดรับข้อมูลเอกสาร (T30) — ผู้ถือลิงก์เท่านั้น */
export const PASSPORT_CUTOFF_KEYS: readonly PaxFieldKey[] = ["docType", "docNumber", "docExpiry", "nationality", "birthPlace"];

// ═══════════════ รูป JSON ที่เก็บ (§4) ═══════════════
export type HealthConsent = { version: string; textHash: string; at: string; via: "LINK" | "STAFF_RECORDED"; signerRole: "SELF" | "GUARDIAN" | "SELF_AND_GUARDIAN" };
export type HealthState =
  | { status: "PROVIDED"; box: string; consent: HealthConsent }
  | { status: "DECLINED"; at: string }
  | { status: "WITHDRAWN"; at: string }
  | { status: "PURGED"; at: string };
export type Answers = {
  v: 1;
  rev: number;
  fields: { finSize?: string; pickupHotel?: string };
  health?: HealthState;
  isMinorDeclared?: boolean;
  submittedAt?: string;
  submittedVia?: "LINK" | "STAFF";
  fixReason?: FixReason;
  purged?: { at: string; stages: string[] };
};
const CONSENT_SHAPE = z.object({
  version: z.string(),
  textHash: z.string(),
  at: z.string(),
  via: z.enum(["LINK", "STAFF_RECORDED"]),
  signerRole: z.enum(["SELF", "GUARDIAN", "SELF_AND_GUARDIAN"]),
});
const HEALTH_SHAPE = z.union([
  z.object({ status: z.literal("PROVIDED"), box: z.string(), consent: CONSENT_SHAPE }),
  z.object({ status: z.enum(["DECLINED", "WITHDRAWN", "PURGED"]), at: z.string() }),
]);
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** answers ของแถว (แถวจาก T0.6 = {} ⇒ rev 0 · ช่องผิดรูปถูกทิ้ง ไม่ throw) */
export function parseAnswers(raw: unknown): Answers {
  const o = isRec(raw) ? raw : {};
  const rev = typeof o.rev === "number" && Number.isInteger(o.rev) && o.rev >= 0 && o.rev <= INT4_MAX ? o.rev : 0;
  const f = isRec(o.fields) ? o.fields : {};
  const fields: Answers["fields"] = {};
  if (typeof f.finSize === "string") fields.finSize = f.finSize;
  if (typeof f.pickupHotel === "string") fields.pickupHotel = f.pickupHotel;
  const out: Answers = { v: 1, rev, fields };
  const h = HEALTH_SHAPE.safeParse(o.health);
  if (h.success) out.health = h.data.status === "PROVIDED" ? { status: "PROVIDED", box: h.data.box, consent: h.data.consent } : { status: h.data.status, at: h.data.at };
  if (typeof o.isMinorDeclared === "boolean") out.isMinorDeclared = o.isMinorDeclared;
  if (typeof o.submittedAt === "string") out.submittedAt = o.submittedAt;
  if (o.submittedVia === "LINK" || o.submittedVia === "STAFF") out.submittedVia = o.submittedVia;
  if (typeof o.fixReason === "string" && (FIX_REASONS as readonly string[]).includes(o.fixReason)) out.fixReason = o.fixReason as FixReason;
  if (isRec(o.purged) && typeof o.purged.at === "string" && Array.isArray(o.purged.stages)) out.purged = { at: o.purged.at, stages: o.purged.stages.filter((x): x is string => typeof x === "string") };
  return out;
}
export const isPurgedAll = (a: Answers) => a.purged?.stages.includes("ALL") === true;

export type GuardianConsent = { v: 1; name: string; relation: "PARENT" | "LEGAL_GUARDIAN"; at: string; via: "LINK" | "STAFF_RECORDED"; scopes: ("HEALTH" | "WAIVER")[] };
const GUARDIAN_SHAPE = z.object({
  v: z.literal(1),
  name: z.string(),
  relation: z.enum(["PARENT", "LEGAL_GUARDIAN"]),
  at: z.string(),
  via: z.enum(["LINK", "STAFF_RECORDED"]),
  scopes: z.array(z.enum(["HEALTH", "WAIVER"])),
});
export function parseGuardian(raw: unknown): GuardianConsent | null {
  const p = GUARDIAN_SHAPE.safeParse(raw);
  return p.success ? { v: 1, name: p.data.name, relation: p.data.relation, at: p.data.at, via: p.data.via, scopes: [...p.data.scopes] } : null;
}

export type IdentityProofRequired = "OTP_PHONE" | "LINE_LOGIN" | "LINE_IF_AVAILABLE_ELSE_OTP";
export type WaiverEvidence = {
  v: 1;
  templateHash: string;
  locale: "th" | "en";
  text: string;
  textHash: string;
  signedAt: string;
  method: "LINK" | "STAFF_WITNESSED";
  identityProof: { required: IdentityProofRequired; used: "LINK_POSSESSION" | "STAFF_WITNESSED"; verified: boolean };
  signer: { role: "SELF" | "GUARDIAN"; name: string };
  minor: { isMinor: boolean; age: number | null };
  staffUserId?: string;
  signatureDocumentId?: string;
};
export type PurgedWaiverEvidence = { v: 1; purged: true; templateHash: string; textHash: string; signedAt: string; method: "LINK" | "STAFF_WITNESSED" };
const WAIVER_FULL = z.object({
  v: z.literal(1),
  templateHash: z.string(),
  locale: z.enum(["th", "en"]),
  text: z.string(),
  textHash: z.string(),
  signedAt: z.string(),
  method: z.enum(["LINK", "STAFF_WITNESSED"]),
  identityProof: z.object({ required: z.enum(["OTP_PHONE", "LINE_LOGIN", "LINE_IF_AVAILABLE_ELSE_OTP"]), used: z.enum(["LINK_POSSESSION", "STAFF_WITNESSED"]), verified: z.boolean() }),
  signer: z.object({ role: z.enum(["SELF", "GUARDIAN"]), name: z.string() }),
  minor: z.object({ isMinor: z.boolean(), age: z.number().int().nullable() }),
  staffUserId: z.string().optional(),
  signatureDocumentId: z.string().optional(),
});
const WAIVER_PURGED = z.object({ v: z.literal(1), purged: z.literal(true), templateHash: z.string(), textHash: z.string(), signedAt: z.string(), method: z.enum(["LINK", "STAFF_WITNESSED"]) });
export function parseWaiver(raw: unknown): { kind: "NONE" } | { kind: "FULL"; e: WaiverEvidence } | { kind: "PURGED"; e: PurgedWaiverEvidence } {
  const p = WAIVER_PURGED.safeParse(raw);
  if (p.success) return { kind: "PURGED", e: { v: 1, purged: true, templateHash: p.data.templateHash, textHash: p.data.textHash, signedAt: p.data.signedAt, method: p.data.method } };
  const f = WAIVER_FULL.safeParse(raw);
  if (f.success) return { kind: "FULL", e: f.data as WaiverEvidence };
  return { kind: "NONE" };
}
export function purgedWaiverOf(e: WaiverEvidence | PurgedWaiverEvidence): PurgedWaiverEvidence {
  return { v: 1, purged: true, templateHash: e.templateHash, textHash: e.textHash, signedAt: e.signedAt, method: e.method };
}
/** สถานะเอกสารรับทราบความเสี่ยง (คำนวณ · ไม่เก็บ · Q4: แม่แบบเปลี่ยนก่อนเริ่มทริป ⇒ ต้องเซ็นใหม่เสมอ) */
export function waiverStatusOf(spec: FormSpec, raw: unknown, nowMs: number, startsAtMs: number): "NOT_REQUIRED" | "MISSING" | "SIGNED" | "NEEDS_RESIGN" {
  if (!spec.waiver.required) return "NOT_REQUIRED";
  const w = parseWaiver(raw);
  if (w.kind === "NONE") return "MISSING";
  if (w.kind === "PURGED") return "SIGNED";
  if (w.e.templateHash === spec.waiver.templateHash) return "SIGNED";
  return nowMs < startsAtMs ? "NEEDS_RESIGN" : "SIGNED";
}

// ═══════════════ ค่าของแถว · ช่องที่ขาด ═══════════════
export type PaxValues = {
  fullName: string;
  nationality: string | null;
  dob: string | null;
  sex: string | null;
  docType: string | null;
  docLast4: string | null;
  docExpiry: string | null;
  phone: string | null;
  birthPlace: string | null;
  certLevel: string | null;
  diveCount: number | null;
  lastDiveAt: string | null;
  finSize: string | null;
  pickupHotel: string | null;
};
export type HealthView = "NOT_COLLECTED" | "MISSING" | "PROVIDED" | "DECLINED" | "WITHDRAWN" | "PURGED";
export function healthViewOf(spec: FormSpec, a: Answers): HealthView {
  if (a.health) return a.health.status;
  return spec.health.enabled ? "MISSING" : "NOT_COLLECTED";
}
/** ช่อง REQUIRED ที่ยังไม่มีค่า (allergies REQUIRED ⇒ สุขภาพต้องเป็น PROVIDED หรือ DECLINED) */
export function missingFields(spec: FormSpec, v: PaxValues, a: Answers): PaxFieldKey[] {
  const has = (k: PaxFieldKey): boolean => {
    switch (k) {
      case "fullName":
        return v.fullName.trim().length > 0;
      case "docNumber":
        return v.docLast4 !== null;
      case "allergies":
        return a.health?.status === "PROVIDED" || a.health?.status === "DECLINED";
      case "diveCount":
        return v.diveCount !== null;
      default: {
        const x = v[k as Exclude<PaxFieldKey, "fullName" | "docNumber" | "allergies" | "diveCount">];
        return typeof x === "string" && x.length > 0;
      }
    }
  };
  return PAX_FIELD_KEYS.filter((k) => spec.fields[k] === "REQUIRED" && !has(k));
}

// ═══════════════ อายุเก็บ (§8) ═══════════════
export type Retention = { passportImageDays: number | null; medicalFormDays: number | null; riskAckDays: number | null; consentAccessLogDays: number | null; manifestDays: number | null; taxDocsDays: number | null };
const DAYS = z.number().int().min(1).max(36_500).nullable();
export const RETENTION_SCHEMA = z.object({ passportImageDays: DAYS, medicalFormDays: DAYS, riskAckDays: DAYS, consentAccessLogDays: DAYS, manifestDays: DAYS, taxDocsDays: DAYS });
export type PaxStage = "HEALTH_ANSWERS" | "DOC_NUMBER" | "WAIVER_EVIDENCE" | "GUARDIAN_CONSENT";
export const PAX_STAGE_DAYS: Record<PaxStage, keyof Retention> = { HEALTH_ANSWERS: "medicalFormDays", DOC_NUMBER: "manifestDays", WAIVER_EVIDENCE: "riskAckDays", GUARDIAN_CONSENT: "consentAccessLogDays" };
/** ชั้นอายุของไฟล์ (Q6: CERT/INSURANCE/PARK_TICKET = ชั้นรูปพาสปอร์ต) */
export function docRetentionKey(kind: string): keyof Retention {
  return kind === "MEDICAL" ? "medicalFormDays" : kind === "WAIVER" ? "riskAckDays" : "passportImageDays";
}
/** เวลาที่ลบได้ของชั้นหนึ่ง · null = ไม่ลบ */
export function stageDue(endYmd: string, days: number | null, tz: string): Date | null {
  const due = retentionDueYmd(endYmd, days);
  return due ? purgeInstant(due, tz) : null;
}
/** ชั้นที่ยังมีข้อมูลอยู่ของแถว */
export function presentStages(a: Answers, row: { docNumberEnc: string | null; waiverEvidence: unknown; guardianConsent: unknown }): PaxStage[] {
  const out: PaxStage[] = [];
  if (a.health?.status === "PROVIDED") out.push("HEALTH_ANSWERS");
  if (row.docNumberEnc) out.push("DOC_NUMBER");
  if (parseWaiver(row.waiverEvidence).kind === "FULL") out.push("WAIVER_EVIDENCE");
  if (row.guardianConsent !== null && row.guardianConsent !== undefined) out.push("GUARDIAN_CONSENT");
  return out;
}
/** TripPassenger.retainUntil = ค่าน้อยสุดของชั้นที่ยังมีข้อมูล (null = ไม่มีอะไรรอลบ) */
export function paxRetainUntil(stages: readonly PaxStage[], endYmd: string, tz: string, r: Retention): Date | null {
  let min: number | null = null;
  for (const s of stages) {
    const d = stageDue(endYmd, r[PAX_STAGE_DAYS[s]], tz);
    if (d && (min === null || d.getTime() < min)) min = d.getTime();
  }
  return min === null ? null : new Date(min);
}

// ═══════════════ zod ของคำขอ ═══════════════
const FIELD_VAL = z.union([z.string().max(8_000), z.number(), z.null()]).optional();
export const fieldsInputSchema = z.strictObject(Object.fromEntries(PAX_FIELD_KEYS.map((k) => [k, FIELD_VAL])) as Record<PaxFieldKey, typeof FIELD_VAL>);
export type FieldsInput = z.infer<typeof fieldsInputSchema>;
export const guardianInputSchema = z.strictObject({ name: text(200).pipe(z.string().min(1)), relation: z.enum(["PARENT", "LEGAL_GUARDIAN"]) });
export type GuardianInput = z.infer<typeof guardianInputSchema>;
/** HealthInput — รูปหลวมพอให้คืนเหตุย่อย (ไม่มี consent ⇒ HEALTH_CONSENT_REQUIRED ไม่ใช่ VALIDATION เปล่า) */
export const healthInputSchema = z.strictObject({
  consent: z.strictObject({ accepted: z.literal(true), textHash: HEX64, locale: z.enum(["th", "en"]) }).optional(),
  allergies: z.union([text(500), z.null()]).optional(),
  conditions: z.union([text(2000), z.null()]).optional(),
  declined: z.literal(true).optional(),
});
export type HealthInput = z.infer<typeof healthInputSchema>;
const writeBase = {
  idempotencyKey: IDEM_KEY,
  expectedRev: NN,
  fields: fieldsInputSchema.optional(),
  health: healthInputSchema.optional(),
  isMinorDeclared: z.boolean().optional(),
  guardian: guardianInputSchema.optional(),
};
export const submitSchema = z.strictObject({ token: TOKEN, ...writeBase });
export const updateSchema = z.strictObject({ passengerId: ID, ...writeBase });
export type WriteRequest = { idempotencyKey: string; expectedRev: number; fields?: FieldsInput; health?: HealthInput; isMinorDeclared?: boolean; guardian?: GuardianInput };
export const openSchema = z.strictObject({ token: TOKEN });
const signBase = {
  idempotencyKey: IDEM_KEY,
  templateHash: HEX64,
  locale: z.enum(["th", "en"]),
  signerName: text(200).pipe(z.string().min(1)),
  signerRole: z.enum(["SELF", "GUARDIAN"]),
  guardian: guardianInputSchema.optional(),
};
export const signSchema = z.strictObject({ token: TOKEN, accept: z.literal(true), ...signBase });
const BYTES = z.instanceof(Uint8Array);
export const witnessedSchema = z.strictObject({ passengerId: ID, ...signBase, signatureImage: z.strictObject({ contentType: z.string().min(1).max(100), data: BYTES }).optional() });
export type SignRequest = { idempotencyKey: string; templateHash: string; locale: "th" | "en"; signerName: string; signerRole: "SELF" | "GUARDIAN"; guardian?: GuardianInput };
export const uploadPublicSchema = z.strictObject({ token: TOKEN, idempotencyKey: IDEM_KEY, kind: z.enum(PUBLIC_DOC_KINDS), contentType: z.string().min(1).max(100), data: BYTES });
export const uploadStaffSchema = z.strictObject({ passengerId: ID, idempotencyKey: IDEM_KEY, kind: z.enum(DOC_KINDS), contentType: z.string().min(1).max(100), data: BYTES });
export const withdrawPublicSchema = z.strictObject({ token: TOKEN, idempotencyKey: IDEM_KEY, mode: z.enum(["PREVIEW", "EXECUTE"]) });
export const withdrawStaffSchema = z.strictObject({ passengerId: ID, idempotencyKey: IDEM_KEY, mode: z.enum(["PREVIEW", "EXECUTE"]) });
export const customerUrlSchema = z.strictObject({ token: TOKEN, documentId: ID, purpose: z.literal("CUSTOMER_SELF") });
export const bookingIdSchema = z.strictObject({ bookingId: ID });
export const passengerIdSchema = z.strictObject({ passengerId: ID });
export const formStatusSchema = z.strictObject({ passengerId: ID, expectedRev: NN, status: z.enum(["VERIFIED", "NEEDS_FIX"]), fixReason: z.enum(FIX_REASONS).optional() });
export const staffUrlSchema = z.strictObject({ documentId: ID, purpose: z.enum(PURPOSES) });
export const revealSchema = z.strictObject({ passengerId: ID, what: z.enum(["DOC_NUMBER", "HEALTH"]), purpose: z.enum(PURPOSES) });
export const publicCtxSchema = z.strictObject({ clientKey: z.string().regex(/^[A-Za-z0-9_:.-]{8,128}$/), now: z.date().optional(), locale: z.enum(["th", "en"]).optional() });
export type PublicFormCtx = { clientKey: string; now?: Date; locale?: "th" | "en" };

// ── ค่าของช่องที่ส่งมา (§6.2 รูปต่อช่อง) ──
export type FieldValues = Partial<{
  fullName: string;
  nationality: string | null;
  dob: string | null;
  sex: string | null;
  docType: string | null;
  docNumber: string | null;
  docExpiry: string | null;
  phone: string | null;
  birthPlace: string | null;
  certLevel: string | null;
  diveCount: number | null;
  lastDiveAt: string | null;
  finSize: string | null;
  pickupHotel: string | null;
}>;
/**
 * ตรวจค่าต่อช่อง (ไม่รวมสิทธิ์/ช่อง OFF/วันปิดรับ — ผู้เรียกตรวจ) · `phone` คืนข้อความที่ตัดแล้ว (ผู้เรียกแปลง E.164)
 * ผิด ⇒ ชื่อช่องที่ผิด (ไม่มีค่าที่ผู้ใช้ส่งในผล)
 */
export function checkFieldValues(raw: FieldsInput, todayYmd: string): { ok: true; values: FieldValues } | { ok: false; fields: string[] } {
  const bad: string[] = [];
  const out: FieldValues = {};
  const str = (k: PaxFieldKey, max: number): string | null | undefined => {
    const v = raw[k];
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (typeof v !== "string") {
      bad.push(k);
      return undefined;
    }
    const p = text(max).safeParse(v);
    if (!p.success) {
      bad.push(k);
      return undefined;
    }
    return p.data.length ? p.data : null;
  };
  const oneOf = (k: PaxFieldKey, set: readonly string[]): string | null | undefined => {
    const v = str(k, 40);
    if (v === undefined || v === null) return v;
    if (!set.includes(v)) {
      bad.push(k);
      return undefined;
    }
    return v;
  };
  const ymd = (k: PaxFieldKey, min?: string, max?: string): string | null | undefined => {
    const v = str(k, 10);
    if (v === undefined || v === null) return v;
    if (!isRealYmd(v) || (min && v < min) || (max && v > max)) {
      bad.push(k);
      return undefined;
    }
    return v;
  };
  if (raw.fullName !== undefined) {
    const v = str("fullName", 200);
    if (v !== undefined) out.fullName = v ?? "";
  }
  if (raw.nationality !== undefined) {
    const v = str("nationality", 2);
    if (v !== undefined) {
      if (v !== null && !/^[A-Z]{2}$/.test(v)) bad.push("nationality");
      else out.nationality = v;
    }
  }
  if (raw.dob !== undefined) {
    const v = ymd("dob", "1900-01-01", todayYmd);
    if (v !== undefined) out.dob = v;
  }
  if (raw.sex !== undefined) {
    const v = oneOf("sex", SEXES);
    if (v !== undefined) out.sex = v;
  }
  if (raw.docType !== undefined) {
    const v = oneOf("docType", DOC_TYPES);
    if (v !== undefined) out.docType = v;
  }
  if (raw.docNumber !== undefined) {
    const v = str("docNumber", 64);
    if (v !== undefined) {
      if (v === null) out.docNumber = null;
      else {
        const n = normalizeDocNumber(v);
        if (n === null) bad.push("docNumber");
        else out.docNumber = n;
      }
    }
  }
  if (raw.docExpiry !== undefined) {
    const v = ymd("docExpiry", "1900-01-01", "2199-12-31");
    if (v !== undefined) out.docExpiry = v;
  }
  if (raw.phone !== undefined) {
    const v = str("phone", 40);
    if (v !== undefined) out.phone = v;
  }
  if (raw.birthPlace !== undefined) {
    const v = str("birthPlace", 100);
    if (v !== undefined) out.birthPlace = v;
  }
  if (raw.certLevel !== undefined) {
    const v = oneOf("certLevel", CERT_LEVELS);
    if (v !== undefined) out.certLevel = v;
  }
  if (raw.diveCount !== undefined) {
    const v = raw.diveCount;
    if (v === null) out.diveCount = null;
    else if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0 || v > 100_000) bad.push("diveCount");
    else out.diveCount = v;
  }
  if (raw.lastDiveAt !== undefined) {
    const v = ymd("lastDiveAt", "1900-01-01", "2199-12-31");
    if (v !== undefined) out.lastDiveAt = v;
  }
  if (raw.finSize !== undefined) {
    const v = str("finSize", 20);
    if (v !== undefined) out.finSize = v;
  }
  if (raw.pickupHotel !== undefined) {
    const v = str("pickupHotel", 200);
    if (v !== undefined) out.pickupHotel = v;
  }
  return bad.length ? { ok: false, fields: [...new Set(bad)] } : { ok: true, values: out };
}
// ── /T0.8 passengers ──
