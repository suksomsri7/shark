// ─────────────────────────────────────────────────────────────
// trips/passengers-core.ts — แกนบริสุทธิ์ของผู้เดินทาง: แบบฟอร์มต่อสินค้า · อายุ/ผู้เยาว์ · ปิดบัง · รูป JSON ที่เก็บ · สถานะเอกสารรับทราบความเสี่ยง · RUN TRIPS T0.8
// ใบสั่ง ledger/trips-briefs/T0.8.md §2 §3 §4 §6 §8 (§17 มติผู้คุมชนะ · รอบแก้ r1 P3 P4 P5 P9)
//
// 🔴 บริสุทธิ์: import ได้แค่ zod · node:crypto (แฮช) · import type — ไม่มี I/O · ไม่อ่านนาฬิกา (ผู้เรียกส่งเวลาเข้ามา) · ไม่ throw
// 🔴 ข้อความอิสระ · zod ของคำขอ · เขตเวลา (purgeInstant) อยู่ที่ passengers.ts (ใช้ text() ของ booking-core และ localToUtc ของ departures-core — r1 P7 P8)
// ─────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";
import { z } from "zod";

// ── T0.8 passengers ──
export const INT4_MAX = 2_147_483_647;
const sha256hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

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
/** อายุจาก dob ก่อน · ไม่มี dob ⇒ คำประกาศ · ไม่มีทั้งคู่ ⇒ known=false (isMinor=false ใช้ไม่ได้เป็นหลักฐานว่าเป็นผู้ใหญ่ — ดู ageBasis) */
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

// ═══════════════ รูป JSON ที่เก็บ (§4 + r1) ═══════════════
export type HealthConsent = { version: string; textHash: string; locale: "th" | "en"; at: string; via: "LINK" | "STAFF_RECORDED"; signerRole: "SELF" | "GUARDIAN" | "SELF_AND_GUARDIAN" };
/** r1 P4: GUARDIAN_REQUIRED = เคยให้ด้วยตัวเองแล้วกลายเป็นผู้เยาว์ที่รู้อายุ ⇒ กล่องถูกลบแบบถอน รอผู้ปกครองให้ความยินยอม */
export type HealthState =
  | { status: "PROVIDED"; box: string; consent: HealthConsent }
  | { status: "DECLINED"; at: string }
  | { status: "WITHDRAWN"; at: string }
  | { status: "GUARDIAN_REQUIRED"; at: string }
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
  /** วันจบทริป (เวลาหน่วย) ที่ใช้คิด retainUntil ครั้งล่าสุด — รอบเลื่อนเร็วขึ้น ⇒ งานลบคิดใหม่ (r1 P9) */
  retE?: string;
  /** r1 P4: ผู้ลงนามเองกลายเป็นผู้เยาว์ ⇒ ผู้ปกครองต้องลงนามใหม่ */
  waiverResign?: { reason: "MINOR"; at: string };
};
const CONSENT_SHAPE = z.object({
  version: z.string(),
  textHash: z.string(),
  locale: z.enum(["th", "en"]).optional(),
  at: z.string(),
  via: z.enum(["LINK", "STAFF_RECORDED"]),
  signerRole: z.enum(["SELF", "GUARDIAN", "SELF_AND_GUARDIAN"]),
});
const HEALTH_SHAPE = z.union([
  z.object({ status: z.literal("PROVIDED"), box: z.string(), consent: CONSENT_SHAPE }),
  z.object({ status: z.enum(["DECLINED", "WITHDRAWN", "GUARDIAN_REQUIRED", "PURGED"]), at: z.string() }),
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
  if (h.success) {
    if (h.data.status === "PROVIDED") {
      const c = h.data.consent;
      out.health = { status: "PROVIDED", box: h.data.box, consent: { version: c.version, textHash: c.textHash, locale: c.locale ?? "th", at: c.at, via: c.via, signerRole: c.signerRole } };
    } else out.health = { status: h.data.status, at: h.data.at };
  }
  if (typeof o.isMinorDeclared === "boolean") out.isMinorDeclared = o.isMinorDeclared;
  if (typeof o.submittedAt === "string") out.submittedAt = o.submittedAt;
  if (o.submittedVia === "LINK" || o.submittedVia === "STAFF") out.submittedVia = o.submittedVia;
  if (typeof o.fixReason === "string" && (FIX_REASONS as readonly string[]).includes(o.fixReason)) out.fixReason = o.fixReason as FixReason;
  if (isRec(o.purged) && typeof o.purged.at === "string" && Array.isArray(o.purged.stages)) out.purged = { at: o.purged.at, stages: o.purged.stages.filter((x): x is string => typeof x === "string") };
  if (typeof o.retE === "string" && isRealYmd(o.retE)) out.retE = o.retE;
  if (isRec(o.waiverResign) && o.waiverResign.reason === "MINOR" && typeof o.waiverResign.at === "string") out.waiverResign = { reason: "MINOR", at: o.waiverResign.at };
  return out;
}
export const isPurgedAll = (a: Answers) => a.purged?.stages.includes("ALL") === true;

// ── ผู้ปกครอง: บันทึกต่อขอบเขต (r1 P3) — ช่องบนสุด (name/relation/at/via/scopes) = ผู้ให้ความยินยอมหลัก (HEALTH ก่อน ไม่งั้น WAIVER) เพื่อความเข้ากันได้ ──
export type GuardianScope = "HEALTH" | "WAIVER";
export type GuardianGrant = { name: string; relation: "PARENT" | "LEGAL_GUARDIAN"; at: string; via: "LINK" | "STAFF_RECORDED"; version: string | null };
export type GuardianConsent = {
  v: 1;
  name: string;
  relation: "PARENT" | "LEGAL_GUARDIAN";
  at: string;
  via: "LINK" | "STAFF_RECORDED";
  scopes: GuardianScope[];
  grants: Partial<Record<GuardianScope, GuardianGrant>>;
};
const GRANT_SHAPE = z.object({ name: z.string(), relation: z.enum(["PARENT", "LEGAL_GUARDIAN"]), at: z.string(), via: z.enum(["LINK", "STAFF_RECORDED"]), version: z.string().nullable().optional() });
const GUARDIAN_SHAPE = z.object({
  v: z.literal(1),
  name: z.string(),
  relation: z.enum(["PARENT", "LEGAL_GUARDIAN"]),
  at: z.string(),
  via: z.enum(["LINK", "STAFF_RECORDED"]),
  scopes: z.array(z.enum(["HEALTH", "WAIVER"])),
  grants: z.object({ HEALTH: GRANT_SHAPE.optional(), WAIVER: GRANT_SHAPE.optional() }).optional(),
});
const grantOf = (g: z.infer<typeof GRANT_SHAPE>): GuardianGrant => ({ name: g.name, relation: g.relation, at: g.at, via: g.via, version: g.version ?? null });
/** ประกอบรูปที่เก็บจากการให้ความยินยอมต่อขอบเขต (ไม่มีขอบเขต ⇒ null) */
export function guardianFromGrants(grants: Partial<Record<GuardianScope, GuardianGrant>>): GuardianConsent | null {
  const primary = grants.HEALTH ?? grants.WAIVER;
  if (!primary) return null;
  const same = (g: GuardianGrant | undefined) => !!g && g.name === primary.name && g.relation === primary.relation;
  const scopes = (["HEALTH", "WAIVER"] as const).filter((s) => same(grants[s]));
  return { v: 1, name: primary.name, relation: primary.relation, at: primary.at, via: primary.via, scopes, grants: { ...grants } };
}
export function parseGuardian(raw: unknown): GuardianConsent | null {
  const p = GUARDIAN_SHAPE.safeParse(raw);
  if (!p.success) return null;
  const d = p.data;
  if (d.grants && (d.grants.HEALTH || d.grants.WAIVER)) {
    const grants: Partial<Record<GuardianScope, GuardianGrant>> = {};
    if (d.grants.HEALTH) grants.HEALTH = grantOf(d.grants.HEALTH);
    if (d.grants.WAIVER) grants.WAIVER = grantOf(d.grants.WAIVER);
    return guardianFromGrants(grants);
  }
  // รูปเดิม (ไม่มี grants): ทุกขอบเขตเป็นของผู้ปกครองบนสุด
  const g: GuardianGrant = { name: d.name, relation: d.relation, at: d.at, via: d.via, version: null };
  const grants: Partial<Record<GuardianScope, GuardianGrant>> = {};
  for (const s of d.scopes) grants[s] = g;
  return guardianFromGrants(grants) ?? { v: 1, name: d.name, relation: d.relation, at: d.at, via: d.via, scopes: [], grants: {} };
}

export type IdentityProofRequired = "OTP_PHONE" | "LINE_LOGIN" | "LINE_IF_AVAILABLE_ELSE_OTP";
/** r1 P5: หลักฐานอายุของผู้ลงนาม — SELF ได้เฉพาะ DOB (ผู้ใหญ่) หรือ DECLARED_ADULT · GUARDIAN อาจเป็น UNKNOWN (isMinor null) */
export type AgeBasis = "DOB" | "DECLARED_ADULT" | "DECLARED_MINOR" | "UNKNOWN";
export type WaiverHistoryItem = { templateHash: string; textHash: string; signedAt: string; method: "LINK" | "STAFF_WITNESSED"; signerRole: "SELF" | "GUARDIAN" };
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
  minor: { isMinor: boolean | null; age: number | null; ageBasis?: AgeBasis };
  staffUserId?: string;
  signatureDocumentId?: string;
  /** การลงนามก่อนหน้า (แฮชเท่านั้น · ไม่เกิน 5 รายการ · r1 P9) */
  previous?: WaiverHistoryItem[];
};
export const WAIVER_HISTORY_MAX = 5;
export type PurgedWaiverEvidence = { v: 1; purged: true; templateHash: string; textHash: string; signedAt: string; method: "LINK" | "STAFF_WITNESSED" };
const HISTORY_ITEM = z.object({ templateHash: z.string(), textHash: z.string(), signedAt: z.string(), method: z.enum(["LINK", "STAFF_WITNESSED"]), signerRole: z.enum(["SELF", "GUARDIAN"]) });
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
  minor: z.object({ isMinor: z.boolean().nullable(), age: z.number().int().nullable(), ageBasis: z.enum(["DOB", "DECLARED_ADULT", "DECLARED_MINOR", "UNKNOWN"]).optional() }),
  staffUserId: z.string().optional(),
  signatureDocumentId: z.string().optional(),
  previous: z.array(HISTORY_ITEM).max(50).optional(),
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
/**
 * สถานะเอกสารรับทราบความเสี่ยง (คำนวณ · ไม่เก็บ · Q4: แม่แบบเปลี่ยนก่อนเริ่มทริป ⇒ ต้องเซ็นใหม่เสมอ)
 * r1 P4: ผู้ลงนาม SELF แต่ผู้เดินทางเป็นผู้เยาว์ที่รู้อายุ (หรือมีธง waiverResign) ⇒ NEEDS_RESIGN เสมอ
 */
export function waiverStatusOf(spec: FormSpec, raw: unknown, nowMs: number, startsAtMs: number, ctx?: { knownMinor: boolean; answers: Answers }): "NOT_REQUIRED" | "MISSING" | "SIGNED" | "NEEDS_RESIGN" {
  if (!spec.waiver.required) return "NOT_REQUIRED";
  const w = parseWaiver(raw);
  if (w.kind === "NONE") return "MISSING";
  if (w.kind === "PURGED") return "SIGNED";
  if (w.e.signer.role === "SELF" && (ctx?.knownMinor === true || ctx?.answers.waiverResign)) return "NEEDS_RESIGN";
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
export type HealthView = "NOT_COLLECTED" | "MISSING" | "PROVIDED" | "DECLINED" | "WITHDRAWN" | "GUARDIAN_REQUIRED" | "PURGED";
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
/** สถานะแบบฟอร์มหลังการเขียน: ครบ ⇒ SUBMITTED · ไม่ครบ ⇒ คง NEEDS_FIX ไม่งั้น PENDING */
export function nextFormStatus(prev: string, complete: boolean): string {
  return complete ? "SUBMITTED" : prev === "NEEDS_FIX" ? "NEEDS_FIX" : "PENDING";
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
/** ชั้นที่ยังมีข้อมูลอยู่ของแถว */
export function presentStages(a: Answers, row: { docNumberEnc: string | null; waiverEvidence: unknown; guardianConsent: unknown }): PaxStage[] {
  const out: PaxStage[] = [];
  if (a.health?.status === "PROVIDED") out.push("HEALTH_ANSWERS");
  if (row.docNumberEnc) out.push("DOC_NUMBER");
  if (parseWaiver(row.waiverEvidence).kind === "FULL") out.push("WAIVER_EVIDENCE");
  if (row.guardianConsent !== null && row.guardianConsent !== undefined) out.push("GUARDIAN_CONSENT");
  return out;
}
// ── /T0.8 passengers ──
