// ─────────────────────────────────────────────────────────────
// trips/passengers.ts — ผู้เดินทาง: ช่องตามที่นั่ง · ร้านแก้/ตรวจ/ขอแก้ · ลิงก์กรอกเอง · ความยินยอมสุขภาพ · เอกสารรับทราบความเสี่ยง · ไฟล์ส่วนตัว · เปิดดู · RUN TRIPS T0.8
// ใบสั่ง ledger/trips-briefs/T0.8.md §2 §4 §5 §6 (§17 มติผู้คุมชนะ · รอบแก้ r1 P1–P9) · CC §J.1 §J.3 §J.4
//
// 🔴 tenantDb เท่านั้น (ไม่มี prisma ดิบ) · SQL ดิบใส่ "tenantId" (+ "unitId") เองทุกคำสั่ง · ไม่ลบแถว Trip* · ไม่ส่ง object ผู้เรียกเข้า Prisma data
// 🔴 นอก tx เท่านั้น: resolveSettings · uploadFile · deleteFileAsset · checkRateLimitDb · privateFileUrl (หลัง commit) — ใน tx = คำสั่งผ่าน tx ตัวเดียว (runTx ของ T0.4)
// 🔴 ข้อมูลสุขภาพ · เลขเอกสาร · token ห้ามอยู่ใน event · audit · ops · error · URL · path — กล่องปิดผนึก (secret-box + AAD ผูกแถว) เท่านั้น
// 🔴 r1 P1: แฮชของคำขอ (keyHash · bodyHash · guardianRef) = HMAC-SHA256 ด้วยกุญแจติดป้าย "trips.t08.body.v1:" + SESSION_SECRET · ไม่มีกุญแจ ⇒ BUSY SERVER_KEY_MISSING
// 🔴 r1 P2: ลบไฟล์ MEDICAL (ปฏิเสธ/ถอน/กลายเป็นผู้เยาว์) = ล็อก t08.doc → CAS rev → ทำเครื่องหมาย deletedAt ใน tx → commit → ลบวัตถุ (ล้ม ⇒ งานลบลองใหม่) — ผู้แพ้ CAS ไม่ทำลายอะไร
// 🔴 ทุกการเขียนแถวผู้เดินทาง = CAS answers.rev + ตรวจจำนวนแถว · ส่งซ้ำ = ผลเดิม (แถว audit keyHash + bodyHash)
// 🔴 advisory lock ช่องกุญแจสองอาร์กิวเมนต์ hashtext('trips.booking.v1') · คำนำหน้าย่อยใหม่ "t08.link:" "t08.doc:" "t08.pdpareq:" "t08.pdpasub:"
// ─────────────────────────────────────────────────────────────
import { createHash, createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { integrationSecretKeyConfigured, openIntegrationSecret, sealIntegrationSecret } from "@/lib/core/integrations/secret-box";
import { logOps } from "@/lib/core/ops";
import { emitOutboxMany } from "@/lib/core/outbox";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { canAccessUnit, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import type { SellErrorCode, SellResult } from "@/lib/core/sellable";
import { resolveSettings } from "@/lib/core/settings";
import { SIGNED_LINK_MAX_MIN, signLink, verifyLink } from "@/lib/core/signed-link";
import { deleteFileAsset, privateFileUrl, storageEnabled, uploadFile, type DeleteDeps, type UploadDeps } from "@/lib/storage/service";
import { sniffedAttachmentType } from "@/lib/storage/sniff";
import { phoneE164, text } from "./booking-core";
import { CapacityAbort, parseCtx, sellFail, type Failure, type Tx } from "./capacity";
import { runTx } from "./capacity-service";
import { localToUtc, normalizeTimezone, utcToLocal } from "./departures-core";
import {
  CERT_LEVELS,
  DOC_KINDS,
  DOC_LIMIT_PER_KIND,
  DOC_TYPES,
  FIX_REASONS,
  HEALTH_CONSENT_V1,
  INT4_MAX,
  NEVER_PURGE_ISO,
  PASSPORT_CUTOFF_KEYS,
  PAX_FIELD_KEYS,
  PAX_STAGE_DAYS,
  PUBLIC_DOC_KINDS,
  PURPOSES,
  RETENTION_SCHEMA,
  SEXES,
  UPLOAD_EXT,
  UPLOAD_MAX_BYTES,
  UPLOAD_TYPES,
  WAIVER_HISTORY_MAX,
  addDaysYmd,
  ageAt,
  canSeeSensitive,
  docLast4Of,
  docRetentionKey,
  guardianFromGrants,
  healthViewOf,
  isPurgedAll,
  isRealYmd,
  maskDob,
  maskDoc,
  minorStatus,
  missingFields,
  nextFormStatus,
  normalizeDocNumber,
  parseAnswers,
  parseGuardian,
  parseWaiver,
  presentStages,
  resolveFormSpec,
  retentionDueYmd,
  waiverStatusOf,
  type AgeBasis,
  type Answers,
  type FormSpec,
  type GuardianConsent,
  type GuardianGrant,
  type HealthState,
  type HealthView,
  type IdentityProofRequired,
  type PaxFieldKey,
  type PaxStage,
  type PaxValues,
  type Retention,
  type WaiverEvidence,
  type WaiverHistoryItem,
} from "./passengers-core";

// ── T0.8 passengers ──
// ═══════════════════════ ค่าคงที่ ═══════════════════════
const LINK_PURPOSE = "trips.pax-form";
export const A = {
  slots: "trips.passenger.slots_created",
  updated: "trips.passenger.updated",
  formStatus: "trips.passenger.form_status",
  linkIssued: "trips.passenger.link_issued",
  linkRevoked: "trips.passenger.link_revoked",
  consentGiven: "trips.passenger.consent_given",
  consentWithdrawn: "trips.passenger.consent_withdrawn",
  revealed: "trips.passenger.revealed",
  listUnmasked: "trips.passenger.list_unmasked",
  purged: "trips.passenger.purged",
  exported: "trips.passenger.exported",
  waiverSigned: "trips.waiver.signed",
  waiverResign: "trips.waiver.resign_required",
  docUploaded: "trips.document.uploaded",
  docPurged: "trips.document.purged",
  bookingPiiPurged: "trips.booking.pii_purged",
  requestRecorded: "trips.pdpa.request_recorded",
  requestResolved: "trips.pdpa.request_resolved",
} as const;
export const EVT_FORM_COMPLETED = "trips.passenger.form_completed";
export const EVT_DOC_PURGED = "trips.document.purged";
/** อายุลิงก์ไฟล์ (วินาที) — เพดาน route 900 */
const URL_TTL_SEC = 300;
/** ช่วงเผื่อนาฬิกาคลาดของการค้นแถว audit (ค่าทางเทคนิค · แบบ T0.6) — ค้นตั้งแต่ (สร้างแถวผู้เดินทาง − 24 ชม.) ถึง (ตอนนี้ + 24 ชม.) */
export const IDEM_SKEW_MS = 24 * 60 * 60 * 1000;
const TOKEN_WINDOW_MS = 3_600_000;
/** เพดานของ token ที่ตรวจลายเซ็นไม่ผ่าน (ยังไม่รู้ร้าน) = เพดานใน schema ของ tokenPerHourPerDevice (defs/trips.ts) */
const TOKEN_GUESS_LIMIT = 60;
/** r1 P6: การใช้ลิงก์ที่ถูกต้อง นับต่อลิงก์ = 10 × tokenPerHourPerDevice ของหน่วย (ค่าเริ่ม 30 ⇒ 300 ครั้ง/ชม./ลิงก์) — ไม่มีคีย์ค่าตั้งแยก */
const LINK_USE_FACTOR = 10;
const LOCK_CLASS = "trips.booking.v1";
const BODY_KEY_LABEL = "trips.t08.body.v1:";
const K = {
  fields: "trips.pax.fields",
  health: "trips.pdpa.healthDataProducts",
  waiverFor: "trips.waiver.requiredFor",
  template: "trips.waiver.template",
  minor: "trips.pdpa.minorConsent",
  cutoff: "trips.pax.passportCutoffDays",
  mask: "trips.pdpa.maskOnScreen",
  retention: "trips.pdpa.retention",
  identity: "trips.waiver.identityProof",
  rate: "trips.public.rateLimits",
} as const;

export const sha256hex = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const ymdOf = (d: Date | string | null | undefined): string | null => (d ? (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10)) : null);
export const serverKeyOk = () => typeof process.env.SESSION_SECRET === "string" && process.env.SESSION_SECRET.length >= 32;
/** ทุก instant ที่บริการคืนเป็น ISO */
const iso = (d: Date) => d.toISOString();

// ═══════════════════════ เวลา · อายุเก็บ (r1 P8: ตัวช่วยเขตเวลาของโมดูล) ═══════════════════════
/** วันที่ (YYYY-MM-DD) ของ instant ตามเขตเวลาหน่วย */
export const localYmdOf = (d: Date, tz: string): string => utcToLocal(tz, d).ymd;
/** ต้นวันถัดจาก dueYmd ตามเวลาหน่วย (เก็บถึงสิ้นวัน dueYmd) — localToUtc: เที่ยงคืนที่ไม่มีจริง (DST) ⇒ ขยับไปข้างหน้า = วินาทีแรกของวันถัดไป */
export function purgeInstant(dueYmd: string, tz: string): Date {
  return localToUtc(tz, addDaysYmd(dueYmd, 1), 0);
}
export function stageDue(endYmd: string, days: number | null, tz: string): Date | null {
  const due = retentionDueYmd(endYmd, days);
  return due ? purgeInstant(due, tz) : null;
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
/** retainUntil ของไฟล์ = ต้นวันถัดจาก E + N ของชั้น (เวลาหน่วย) · N = null ⇒ 9999-12-31 */
export function docRetainUntil(kind: string, endYmd: string, tz: string, r: Retention): Date {
  return stageDue(endYmd, r[docRetentionKey(kind)], tz) ?? new Date(NEVER_PURGE_ISO);
}

// ═══════════════════════ แฮชที่มีกุญแจ (r1 P1) ═══════════════════════
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v !== null && typeof v === "object" && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .map((k) => [k, canonical(o[k])]),
    );
  }
  return v;
}
/** HMAC-SHA256(กุญแจ "trips.t08.body.v1:" + SESSION_SECRET, canonical JSON) — ไม่มีกุญแจ ⇒ throw CapacityAbort BUSY SERVER_KEY_MISSING (ผ่าน safely) */
export function mac(x: unknown): string {
  const s = process.env.SESSION_SECRET;
  if (typeof s !== "string" || s.length < 32) throw new CapacityAbort("BUSY", { reason: "SERVER_KEY_MISSING" });
  return createHmac("sha256", `${BODY_KEY_LABEL}${s}`).update(JSON.stringify(canonical(x))).digest("hex");
}

// ═══════════════════════ ผลพลาด ═══════════════════════
const REASON_TH: Record<string, string> = {
  FIELD_OFF: "ช่องนี้ไม่ได้เปิดให้กรอกสำหรับสินค้านี้",
  PASSPORT_CUTOFF_PASSED: "เลยวันปิดรับข้อมูลเอกสารแล้ว กรุณาติดต่อร้าน",
  HEALTH_NOT_COLLECTED: "สินค้านี้ไม่เก็บข้อมูลสุขภาพส่วนนี้",
  HEALTH_CONSENT_REQUIRED: "ต้องให้ความยินยอมเรื่องข้อมูลสุขภาพก่อน",
  CONSENT_TEXT_CHANGED: "ข้อความยินยอมเปลี่ยนแล้ว กรุณาอ่านและยืนยันใหม่",
  GUARDIAN_REQUIRED: "ผู้เยาว์ต้องมีผู้ปกครองให้ความยินยอมหรือลงนาม",
  AGE_UNKNOWN: "ต้องระบุวันเกิดหรือแจ้งว่าเป็นผู้เยาว์หรือไม่ก่อน",
  WAIVER_NOT_REQUIRED: "สินค้านี้ไม่ต้องลงนามเอกสารรับทราบความเสี่ยง",
  TEMPLATE_CHANGED: "ข้อความเอกสารเปลี่ยนแล้ว กรุณาอ่านฉบับล่าสุดแล้วลงนามใหม่",
  WAIVER_ALREADY_SIGNED: "ลงนามเอกสารฉบับนี้แล้ว",
  DOC_KIND_NOT_ALLOWED: "สินค้านี้ไม่รับเอกสารชนิดนี้",
  FILE_TYPE: "รับเฉพาะไฟล์ JPG PNG หรือ PDF",
  FILE_TOO_LARGE: "ไฟล์ใหญ่เกิน 5MB",
  DOC_LIMIT: "ส่งเอกสารชนิดนี้ครบจำนวนแล้ว",
  FORM_INCOMPLETE: "ข้อมูลผู้เดินทางยังไม่ครบ",
  BOOKING_CLOSED: "การจองนี้ปิดแล้ว",
  PURGED: "ข้อมูลนี้ถูกลบตามนโยบายข้อมูลส่วนบุคคลแล้ว",
  SENSITIVE_PERMISSION: "บัญชีนี้ไม่มีสิทธิ์ดูข้อมูลอ่อนไหวส่วนนี้",
  AGENCY_NOT_ENABLED: "ระบบเอเจนซี่ยังไม่เปิดใช้",
  PUBLIC_NOT_ALLOWED: "ทำรายการนี้ผ่านหน้าสาธารณะไม่ได้",
  SETTINGS_INVALID: "ค่าตั้งของหน่วยไม่ถูกต้อง กรุณาตรวจค่าตั้งทัวร์ก่อน",
  PARTY_ERASE_NOT_SUPPORTED: "ยังลบข้อมูลผู้ติดต่อจากระบบนี้ไม่ได้ กรุณาลบที่ระบบผู้ติดต่อ",
  OTP_REQUIRED: "ต้องยืนยันตัวตนก่อนเปิดเอกสารนี้",
  SERVER_KEY_MISSING: "ระบบยังไม่ได้ตั้งกุญแจเซิร์ฟเวอร์ — ทำรายการนี้ไม่ได้ชั่วคราว",
  SECRET_KEY_MISSING: "ระบบยังไม่ได้ตั้งกุญแจเข้ารหัสข้อมูล — ทำรายการนี้ไม่ได้ชั่วคราว",
  STORAGE_NOT_CONFIGURED: "ยังไม่ได้ตั้งค่าที่เก็บไฟล์",
  UPLOAD_FAILED: "อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่",
  STORAGE_DELETE_FAILED: "ลบไฟล์ที่ที่เก็บไม่สำเร็จ กรุณาลองใหม่",
  RECEIVED_AT_OUT_OF_RANGE: "วันที่รับคำขอต้องไม่อยู่ในอนาคตและไม่ก่อนวันที่มีข้อมูล",
  UNEXPECTED: "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง",
};
export function fail(code: SellErrorCode, details?: Record<string, unknown>): Failure {
  const r = typeof details?.reason === "string" ? REASON_TH[details.reason] : undefined;
  return sellFail(code, details, r);
}
export const NF = (): Failure => fail("NOT_FOUND");
export const KEY_MISSING = (): Failure => fail("BUSY", { reason: "SERVER_KEY_MISSING" });
export const isFailure = (x: unknown): x is Failure => isRec(x) && x.ok === false;
export function invalid(e: { issues: readonly { path: readonly PropertyKey[] }[] }): Failure {
  return fail("VALIDATION", { fields: [...new Set(e.issues.map((i) => i.path.map(String).join(".") || "(root)"))].slice(0, 10) });
}

// ═══════════════════════ ข้อผิดพลาดที่ไม่คาดคิด (แบบ booking.ts safely · log ตัดข้อความ) ═══════════════════════
let unexpectedCount = 0;
export function passengersUnexpectedCount(): number {
  return unexpectedCount;
}
async function logUnexpected(where: string, e: unknown, tenantId: string | null): Promise<void> {
  const err = e instanceof Error ? e : null;
  const o = err ? (err as unknown as Record<string, unknown>) : {};
  const meta = isRec(o.meta) ? o.meta : {};
  const frames = err?.stack ? err.stack.split("\n").filter((l) => /^\s+at\s/.test(l)).slice(0, 8).map((l) => l.trim().replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, "$1…$1").slice(0, 200)) : [];
  // ข้อความดิบของ error อาจมีค่าที่ผู้ใช้ส่ง (ชื่อ · เลขเอกสาร · ข้อมูลสุขภาพ) ⇒ ไม่บันทึกข้อความเลย — เก็บชื่อ · รหัส · constraint · stack frame
  const detail = {
    where,
    name: err ? err.name || "Error" : typeof e,
    code: typeof o.code === "string" ? o.code.slice(0, 16) : null,
    constraint: typeof meta.constraint === "string" ? meta.constraint.slice(0, 100) : null,
    frames,
  };
  await logOps("ERROR", "trips.passengers", `ข้อผิดพลาดที่ไม่คาดคิดใน ${where}`, { tenantId: tenantId ?? undefined, detail: JSON.stringify(detail) }).catch(() => undefined);
}
/** ห่อบริการ: CapacityAbort ⇒ ผลมีชื่อ · อื่น ⇒ ops (ไม่มีข้อมูลบุคคล) + BUSY UNEXPECTED */
export async function safely<T>(where: string, ctx: unknown, fn: () => Promise<SellResult<T>>): Promise<SellResult<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof CapacityAbort) return fail(e.code, e.details);
    unexpectedCount++;
    await logUnexpected(where, e, isRec(ctx) && typeof ctx.tenantId === "string" ? ctx.tenantId : null);
    return fail("BUSY", { reason: "UNEXPECTED" });
  }
}
/** ธุรกรรมของหน่วย (runTx ของ T0.4: ลองใหม่เมื่อ deadlock · CapacityAbort ⇒ rollback + ผล) — ข้อความไทยตามเหตุของใบนี้ */
export async function inTx<T>(g: Unit, fn: (tx: Tx) => Promise<T>): Promise<SellResult<T>> {
  const r = await runTx({ tenantId: g.tenantId, unitId: g.unitId, tz: g.tz }, fn);
  return r.ok ? r : fail(r.code, r.details);
}
export const abort = (code: SellErrorCode, details?: Record<string, unknown>): never => {
  throw new CapacityAbort(code, details);
};
export const ro = (tenantId: string) => tenantDb({ tenantId }) as unknown as Tx;
export const lockKey = (tx: Tx, sub: string) => tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtext(${LOCK_CLASS}), hashtext(${sub}))`;

// ═══════════════════════ zod ของคำขอ (ข้อความอิสระ = text() ของ booking-core · r1 P7) ═══════════════════════
const ID = z.string().trim().min(1).max(128);
const NN = z.number().int().min(0).max(INT4_MAX);
const IDEM_KEY = z.string().regex(/^[A-Za-z0-9_-]{8,90}$/);
const TOKEN = z.string().min(1).max(4096);
const HEX64 = z.string().regex(/^[0-9a-f]{64}$/);
const BYTES = z.instanceof(Uint8Array);
const FIELD_VAL = z.union([z.string().max(8_000), z.number(), z.null()]).optional();
const fieldsInputSchema = z.strictObject(Object.fromEntries(PAX_FIELD_KEYS.map((k) => [k, FIELD_VAL])) as Record<PaxFieldKey, typeof FIELD_VAL>);
type FieldsInput = z.infer<typeof fieldsInputSchema>;
const guardianInputSchema = z.strictObject({ name: text(200).pipe(z.string().min(1)), relation: z.enum(["PARENT", "LEGAL_GUARDIAN"]) });
type GuardianInput = z.infer<typeof guardianInputSchema>;
/** HealthInput — รูปหลวมพอให้คืนเหตุย่อย (ไม่มี consent ⇒ HEALTH_CONSENT_REQUIRED ไม่ใช่ VALIDATION เปล่า) */
const healthInputSchema = z.strictObject({
  consent: z.strictObject({ accepted: z.literal(true), textHash: HEX64, locale: z.enum(["th", "en"]) }).optional(),
  allergies: z.union([text(500), z.null()]).optional(),
  conditions: z.union([text(2000), z.null()]).optional(),
  declined: z.literal(true).optional(),
});
type HealthInput = z.infer<typeof healthInputSchema>;
const writeBase = {
  idempotencyKey: IDEM_KEY,
  expectedRev: NN,
  fields: fieldsInputSchema.optional(),
  health: healthInputSchema.optional(),
  isMinorDeclared: z.boolean().optional(),
  guardian: guardianInputSchema.optional(),
};
const submitSchema = z.strictObject({ token: TOKEN, ...writeBase });
const updateSchema = z.strictObject({ passengerId: ID, ...writeBase });
type WriteRequest = { idempotencyKey: string; expectedRev: number; fields?: FieldsInput; health?: HealthInput; isMinorDeclared?: boolean; guardian?: GuardianInput };
const openSchema = z.strictObject({ token: TOKEN });
const signBase = {
  idempotencyKey: IDEM_KEY,
  templateHash: HEX64,
  locale: z.enum(["th", "en"]),
  signerName: text(200).pipe(z.string().min(1)),
  signerRole: z.enum(["SELF", "GUARDIAN"]),
  guardian: guardianInputSchema.optional(),
  /** r1 P5: SELF ที่ไม่มีวันเกิด ต้องประกาศว่าไม่ใช่ผู้เยาว์ในคำขอนี้ (false) */
  isMinorDeclared: z.boolean().optional(),
};
const signSchema = z.strictObject({ token: TOKEN, accept: z.literal(true), ...signBase });
const witnessedSchema = z.strictObject({ passengerId: ID, ...signBase, signatureImage: z.strictObject({ contentType: z.string().min(1).max(100), data: BYTES }).optional() });
type SignRequest = { idempotencyKey: string; templateHash: string; locale: "th" | "en"; signerName: string; signerRole: "SELF" | "GUARDIAN"; guardian?: GuardianInput; isMinorDeclared?: boolean };
const uploadPublicSchema = z.strictObject({ token: TOKEN, idempotencyKey: IDEM_KEY, kind: z.enum(PUBLIC_DOC_KINDS), contentType: z.string().min(1).max(100), data: BYTES });
const uploadStaffSchema = z.strictObject({ passengerId: ID, idempotencyKey: IDEM_KEY, kind: z.enum(DOC_KINDS), contentType: z.string().min(1).max(100), data: BYTES });
const withdrawPublicSchema = z.strictObject({ token: TOKEN, idempotencyKey: IDEM_KEY, mode: z.enum(["PREVIEW", "EXECUTE"]) });
const withdrawStaffSchema = z.strictObject({ passengerId: ID, idempotencyKey: IDEM_KEY, mode: z.enum(["PREVIEW", "EXECUTE"]) });
const customerUrlSchema = z.strictObject({ token: TOKEN, documentId: ID, purpose: z.literal("CUSTOMER_SELF") });
const bookingIdSchema = z.strictObject({ bookingId: ID });
const passengerIdSchema = z.strictObject({ passengerId: ID });
const formStatusSchema = z.strictObject({ passengerId: ID, expectedRev: NN, status: z.enum(["VERIFIED", "NEEDS_FIX"]), fixReason: z.enum(FIX_REASONS).optional() });
const staffUrlSchema = z.strictObject({ documentId: ID, purpose: z.enum(PURPOSES) });
const revealSchema = z.strictObject({ passengerId: ID, what: z.enum(["DOC_NUMBER", "HEALTH"]), purpose: z.enum(PURPOSES) });
export type PublicFormCtx = { clientKey: string; now?: Date; locale?: "th" | "en" };
const publicCtxSchema = z.strictObject({ clientKey: z.string().regex(/^[A-Za-z0-9_:.-]{8,128}$/), now: z.date().optional(), locale: z.enum(["th", "en"]).optional() });

type FieldValues = Partial<{
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
/** ตรวจค่าต่อช่อง (§6.2) — ผิด ⇒ ชื่อช่องที่ผิด (ไม่มีค่าที่ผู้ใช้ส่งในผล) */
function checkFieldValues(raw: FieldsInput, todayYmd: string): { ok: true; values: FieldValues } | { ok: false; fields: string[] } {
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
    if (v !== undefined) {
      if (v === null) out.phone = null;
      else {
        const e164 = phoneE164(v);
        if (!e164) bad.push("phone");
        else out.phone = e164;
      }
    }
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

// ═══════════════════════ ด่านฝั่งร้าน ═══════════════════════
export type Unit = { tenantId: string; unitId: string; tz: string };
export type Staff = Unit & { userId: string; m: MembershipCtx; now: Date; locale: "th" | "en" };
/**
 * ด่าน (แบบ resources.ts:56–77): ctx → ผู้กระทำ STAFF (PUBLIC ⇒ FORBIDDEN PUBLIC_NOT_ALLOWED · AGENT ⇒ FORBIDDEN AGENCY_NOT_ENABLED · SYSTEM ⇒ FORBIDDEN)
 * → Membership สด → หน่วยของร้าน + canAccessUnit (ไม่ได้ ⇒ NOT_FOUND) → TRIPS → evaluate(trips, perm) (ไม่ได้ ⇒ FORBIDDEN) · perm null = ผู้เรียกตรวจเอง
 */
export async function staffGate(ctx: unknown, perm: string | null): Promise<Staff | Failure> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return fail(pc.code, pc.details);
  const c = pc.c;
  if (c.actor.kind === "PUBLIC") return fail("FORBIDDEN", { reason: "PUBLIC_NOT_ALLOWED" });
  if (c.actor.kind !== "STAFF") return fail("FORBIDDEN");
  const db = tenantDb({ tenantId: c.tenantId });
  const mem = await db.membership.findFirst({ where: { tenantId: c.tenantId, userId: c.actor.userId, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } });
  if (!mem) return NF();
  const m: MembershipCtx = {
    role: mem.role,
    unitAccess: Array.isArray(mem.unitAccess) ? mem.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: isRec(mem.permissions) ? mem.permissions : {},
  };
  const unit = await db.businessUnit.findFirst({ where: { id: c.unitId }, select: { id: true, type: true, settings: true } });
  if (!unit || !canAccessUnit(m, unit.id) || unit.type !== "TRIPS") return NF();
  if (perm && !evaluate(m, { module: "trips", action: perm, unitId: unit.id })) return fail("FORBIDDEN");
  const locale = isRec(ctx) && ctx.locale === "en" ? "en" : "th";
  return { tenantId: c.tenantId, unitId: unit.id, tz: normalizeTimezone(isRec(unit.settings) ? unit.settings.timezone : null), userId: c.actor.userId, m, now: c.clock.now, locale };
}
export const sensitiveOk = (s: Staff, key: "trips.passenger.health" | "trips.passenger.reveal") => canSeeSensitive(s.m, key, s.unitId);
export const SENSITIVE = (): Failure => fail("FORBIDDEN", { reason: "SENSITIVE_PERMISSION" });

// ═══════════════════════ แถวผู้เดินทาง + การจอง + รอบ + สินค้า ═══════════════════════
export type PaxRow = {
  id: string;
  unitId: string;
  bookingId: string;
  itemId: string | null;
  createdAt: Date;
  fullName: string;
  nationality: string | null;
  dob: Date | string | null;
  sex: string | null;
  docType: string | null;
  docNumberEnc: string | null;
  docLast4: string | null;
  docExpiry: Date | string | null;
  phone: string | null;
  birthPlace: string | null;
  certLevel: string | null;
  diveCount: number | null;
  lastDiveAt: Date | string | null;
  isMinor: boolean;
  guardianConsent: unknown;
  answers: unknown;
  formStatus: string;
  waiverSignedAt: Date | null;
  waiverEvidence: unknown;
  retainUntil: Date | null;
  checkinAt: Date | null;
  bookingStatus: string;
  piiPurgedAt: Date | null;
  bookingCreatedAt: Date;
  productId: string;
  departureId: string;
  localDate: Date | string;
  startsAt: Date;
  endsAt: Date;
  crossBorder: boolean;
  deepDive: boolean;
  title: unknown;
};
const PAX_COLS = Prisma.sql`p."id", p."unitId", p."bookingId", p."itemId", p."createdAt", p."fullName", p."nationality", p."dob", p."sex", p."docType", p."docNumberEnc",
  p."docLast4", p."docExpiry", p."phone", p."birthPlace", p."certLevel", p."diveCount", p."lastDiveAt", p."isMinor", p."guardianConsent", p."answers", p."formStatus",
  p."waiverSignedAt", p."waiverEvidence", p."retainUntil", p."checkinAt", b."status" AS "bookingStatus", b."piiPurgedAt", b."createdAt" AS "bookingCreatedAt", b."productId", b."departureId",
  d."localDate", d."startsAt", d."endsAt", pr."crossBorder", pr."deepDive", pr."title"`;
const PAX_FROM = Prisma.sql`FROM "TripPassenger" p
  JOIN "TripBooking" b ON b."id" = p."bookingId" AND b."tenantId" = p."tenantId" AND b."unitId" = p."unitId"
  JOIN "TripDeparture" d ON d."id" = b."departureId" AND d."tenantId" = b."tenantId"
  JOIN "TripProduct" pr ON pr."id" = b."productId" AND pr."tenantId" = b."tenantId"`;
export async function loadPax(db: Tx, tenantId: string, unitId: string | null, id: string, lock: "" | "UPDATE" | "SHARE" = ""): Promise<PaxRow | null> {
  const lk = lock === "UPDATE" ? Prisma.sql`FOR UPDATE OF p` : lock === "SHARE" ? Prisma.sql`FOR SHARE OF p` : Prisma.empty;
  const rows = await db.$queryRaw<PaxRow[]>`SELECT ${PAX_COLS} ${PAX_FROM}
    WHERE p."id" = ${id} AND p."tenantId" = ${tenantId} ${unitId ? Prisma.sql`AND p."unitId" = ${unitId}` : Prisma.empty} ${lk}`;
  return rows[0] ?? null;
}
async function loadBookingPax(db: Tx, s: Unit, bookingId: string): Promise<PaxRow[]> {
  return db.$queryRaw<PaxRow[]>`SELECT ${PAX_COLS} ${PAX_FROM}
    WHERE p."bookingId" = ${bookingId} AND p."tenantId" = ${s.tenantId} AND p."unitId" = ${s.unitId} ORDER BY p."createdAt", p."id"`;
}
export const travelYmdOf = (p: PaxRow) => ymdOf(p.localDate) ?? "";
export const endYmdOf = (p: { endsAt: Date }, tz: string) => localYmdOf(new Date(p.endsAt), tz);
export function valuesOf(p: PaxRow, a: Answers): PaxValues {
  return {
    fullName: p.fullName,
    nationality: p.nationality,
    dob: ymdOf(p.dob),
    sex: p.sex,
    docType: p.docType,
    docLast4: p.docLast4,
    docExpiry: ymdOf(p.docExpiry),
    phone: p.phone,
    birthPlace: p.birthPlace,
    certLevel: p.certLevel,
    diveCount: p.diveCount,
    lastDiveAt: ymdOf(p.lastDiveAt),
    finSize: a.fields.finSize ?? null,
    pickupHotel: a.fields.pickupHotel ?? null,
  };
}
const titleOf = (t: unknown, locale: "th" | "en"): string => {
  if (!isRec(t)) return "";
  const v = locale === "en" && typeof t.en === "string" && t.en ? t.en : t.th;
  return typeof v === "string" ? v : "";
};

// ═══════════════════════ ค่าตั้ง (นอก tx · ชั้น U·P) ═══════════════════════
export type Cfg = {
  spec: FormSpec;
  cutoff: { domestic: number; crossBorder: number };
  mask: boolean;
  retention: Retention;
  identityProof: IdentityProofRequired;
};
const CUTOFF_S = { parse: (v: unknown) => (isRec(v) && Number.isInteger(v.domestic) && Number.isInteger(v.crossBorder) ? { domestic: Number(v.domestic), crossBorder: Number(v.crossBorder) } : null) };
export async function loadCfg(u: Unit, p: { productId: string; crossBorder: boolean; deepDive: boolean }, now: Date): Promise<Cfg | Failure> {
  const r = await resolveSettings({ tenantId: u.tenantId }, [K.fields, K.health, K.waiverFor, K.template, K.minor, K.cutoff, K.mask, K.retention, K.identity], { unitId: u.unitId, productId: p.productId }, now);
  const v = (k: string) => r[k]?.value;
  const spec = resolveFormSpec({ paxFields: v(K.fields), crossBorder: p.crossBorder, deepDive: p.deepDive, healthDataProduct: v(K.health), waiverRequiredFor: v(K.waiverFor), waiverTemplate: v(K.template), minorConsent: v(K.minor) });
  if (!spec.ok) return fail("VALIDATION", { reason: "SETTINGS_INVALID", key: spec.key });
  const cutoff = CUTOFF_S.parse(v(K.cutoff));
  if (!cutoff || cutoff.domestic < 0 || cutoff.crossBorder < 0) return fail("VALIDATION", { reason: "SETTINGS_INVALID", key: K.cutoff });
  if (typeof v(K.mask) !== "boolean") return fail("VALIDATION", { reason: "SETTINGS_INVALID", key: K.mask });
  const ret = RETENTION_SCHEMA.safeParse(v(K.retention));
  if (!ret.success) return fail("VALIDATION", { reason: "SETTINGS_INVALID", key: K.retention });
  const idp = v(K.identity);
  if (idp !== "OTP_PHONE" && idp !== "LINE_LOGIN" && idp !== "LINE_IF_AVAILABLE_ELSE_OTP") return fail("VALIDATION", { reason: "SETTINGS_INVALID", key: K.identity });
  return { spec: spec.spec, cutoff, mask: v(K.mask) === true, retention: ret.data, identityProof: idp };
}
export async function loadRetention(u: Unit, now: Date): Promise<Retention | null> {
  const r = await resolveSettings({ tenantId: u.tenantId }, [K.retention], { unitId: u.unitId }, now);
  const p = RETENTION_SCHEMA.safeParse(r[K.retention]?.value);
  return p.success ? p.data : null;
}

// ═══════════════════════ audit · event ═══════════════════════
export type Who = { kind: "USER"; userId: string } | { kind: "SYSTEM" };
export type AuditVal = Record<string, string | number | boolean | null>;
export async function auditTx(tx: Tx, u: Unit, who: Who, action: string, targetType: string, targetId: string, after: AuditVal): Promise<string> {
  const row = await tx.auditLog.create({
    data: { tenantId: u.tenantId, unitId: u.unitId, actorType: who.kind === "USER" ? "USER" : "SYSTEM", actorId: who.kind === "USER" ? who.userId : null, action, targetType, targetId, after: { ...after } },
    select: { id: true },
  });
  return row.id;
}
export type Evt = { type: string; key: string; payload: Record<string, string | number | boolean | null> };
export async function emitTx(tx: Tx, u: Unit, evts: readonly Evt[]): Promise<void> {
  if (!evts.length) return;
  await emitOutboxMany(tx, evts.map((e) => ({ tenantId: u.tenantId, unitId: u.unitId, type: e.type, idempotencyKey: e.key, payload: { ...e.payload } })));
}
export const purgedEvt = (key: string, bookingId: string, passengerId: string | null, kind: string): Evt => ({
  type: EVT_DOC_PURGED,
  key: `${EVT_DOC_PURGED}:${key}`,
  payload: { bookingId, passengerId, kind },
});
/**
 * แถว audit กันซ้ำ — ดัชนี AuditLog_tenantId_createdAt_idx: tenantId + createdAt ∈ [สร้างแถวผู้เดินทาง − 24 ชม., ตอนนี้ + 24 ชม.] แล้วกรอง targetId/action/keyHash
 * (หนี้ดัชนี (tenantId, targetId) แบบ T0.6 · กรณีเลวสุด = ทุกแถว audit ของร้านตั้งแต่สร้างการจอง)
 */
export async function idemFind(db: Tx, tenantId: string, action: string, targetId: string, since: Date, keyHash: string): Promise<Record<string, unknown> | null> {
  const until = new Date(Date.now() + IDEM_SKEW_MS);
  const rows = await db.$queryRaw<{ after: unknown }[]>`
    SELECT "after" FROM "AuditLog" WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${iso(since)}::timestamp AND "createdAt" <= ${iso(until)}::timestamp
      AND "targetId" = ${targetId} AND "action" = ${action} AND "after"->>'keyHash' = ${keyHash} LIMIT 1`;
  const a = rows[0]?.after;
  return isRec(a) ? a : null;
}
export const sinceOf = (createdAt: Date) => new Date(new Date(createdAt).getTime() - IDEM_SKEW_MS);

// ═══════════════════════ ไฟล์ ═══════════════════════
export type DocRow = { id: string; passengerId: string; kind: string; fileId: string; retainUntil: Date; deletedAt: Date | null; createdAt: Date };
export async function liveDocs(db: Tx, u: Unit, passengerId: string, kind?: string): Promise<DocRow[]> {
  return db.$queryRaw<DocRow[]>`
    SELECT "id", "passengerId", "kind", "fileId", "retainUntil", "deletedAt", "createdAt" FROM "TripDocument"
    WHERE "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND "passengerId" = ${passengerId} AND "deletedAt" IS NULL ${kind ? Prisma.sql`AND "kind" = ${kind}` : Prisma.empty}
    ORDER BY "createdAt", "id"`;
}
/** ลบวัตถุ + แถว FileAsset (นอก tx) — คืนจำนวนที่ล้ม (แถว TripDocument ที่ทำเครื่องหมายแล้วรอให้งานลบลองใหม่) */
export async function deleteObjects(u: Unit, fileIds: readonly string[], deps?: DeleteDeps): Promise<number> {
  let failed = 0;
  for (const f of fileIds) {
    const r = await deleteFileAsset({ tenantId: u.tenantId }, f, deps);
    if (!r.ok) failed++;
  }
  return failed;
}
/**
 * ตั้ง deletedAt (CAS deletedAt IS NULL) + retainUntil = now + audit + event ต่อชิ้น — นับเฉพาะแถวที่เปลี่ยนจริง (รันซ้อนกันได้ = ครั้งเดียวต่อชิ้น)
 * คืน fileId ของแถวที่เปลี่ยน — ผู้เรียกลบวัตถุหลัง commit (r1 P2) หรือก่อนหน้า (งานลบตามอายุ: วัตถุก่อน แล้วค่อยแถว)
 */
export async function markDocsDeletedInTx(tx: Tx, u: Unit, who: Who, docIds: readonly string[], bookingId: string, now: Date, stage: string): Promise<{ id: string; kind: string; fileId: string }[]> {
  const out: { id: string; kind: string; fileId: string }[] = [];
  for (const id of [...docIds].sort()) {
    const rows = await tx.$queryRaw<{ id: string; kind: string; passengerId: string; fileId: string }[]>`
      UPDATE "TripDocument" SET "deletedAt" = ${iso(now)}::timestamp, "retainUntil" = LEAST("retainUntil", ${iso(now)}::timestamp), "updatedAt" = ${iso(now)}::timestamp
      WHERE "id" = ${id} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND "deletedAt" IS NULL RETURNING "id", "kind", "passengerId", "fileId"`;
    const r = rows[0];
    if (!r) continue;
    await auditTx(tx, u, who, A.docPurged, "TripDocument", r.id, { documentId: r.id, passengerId: r.passengerId, kind: r.kind, stage });
    await emitTx(tx, u, [purgedEvt(r.id, bookingId, r.passengerId, r.kind)]);
    out.push({ id: r.id, kind: r.kind, fileId: r.fileId });
  }
  return out;
}
/** ไฟล์ MEDICAL ทั้งหมดของผู้เดินทาง ⇒ ทำเครื่องหมายลบ (ในธุรกรรมที่ถือ t08.doc แล้วชนะ CAS) */
async function markMedicalInTx(tx: Tx, u: Unit, who: Who, passengerId: string, bookingId: string, now: Date, stage: string) {
  const live = await liveDocs(tx, u, passengerId, "MEDICAL");
  return markDocsDeletedInTx(tx, u, who, live.map((d) => d.id), bookingId, now, stage);
}

// ═══════════════════════ อัตรา (r1 P6) ═══════════════════════
/**
 * ถังของเครื่องถึงเพดานความผิดพลาดแล้วหรือยัง (อ่านอย่างเดียว · ไม่เพิ่มตัวนับ) — กติกาเดียว: ผิดครบ N ครั้ง (N = เพดานที่ใช้) ⇒ คำขอถัดไปจากเครื่องนั้น RATE_LIMITED
 * แม้ token ถูก (ตรงกับ checkRateLimitDb ที่ให้ผ่าน count ≤ N แล้วปฏิเสธครั้งที่ N+1 ⇒ ที่นี่ count ≥ N)
 */
async function deviceOverLimit(db: Tx, key: string, limit: number): Promise<boolean> {
  const rows = await db.$queryRaw<{ count: number; windowStart: Date }[]>`SELECT "count", "windowStart" FROM "ChatRateBucket" WHERE "key" = ${key}`;
  const r = rows[0];
  return !!r && new Date(r.windowStart).getTime() > Date.now() - TOKEN_WINDOW_MS && r.count >= limit;
}

// ═══════════════════════ ลิงก์ (§5) ═══════════════════════
type LinkRow = { id: string; action: string; after: unknown; createdAt: Date };
/** แถวลิงก์ล่าสุดของผู้เดินทาง (issued/revoked · เรียงตาม after.seq ที่จัดใต้ advisory lock) — ดัชนี/ช่วงเวลาเดียวกับ idemFind */
async function latestLinkRow(db: Tx, tenantId: string, passengerId: string, since: Date): Promise<LinkRow | null> {
  const until = new Date(Date.now() + IDEM_SKEW_MS);
  const rows = await db.$queryRaw<LinkRow[]>`
    SELECT "id", "action", "after", "createdAt" FROM "AuditLog"
    WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${iso(since)}::timestamp AND "createdAt" <= ${iso(until)}::timestamp
      AND "targetId" = ${passengerId} AND "action" IN (${A.linkIssued}, ${A.linkRevoked})
    ORDER BY COALESCE(("after"->>'seq')::int, 0) DESC, "createdAt" DESC, "id" DESC LIMIT 1`;
  return rows[0] ?? null;
}
const linkAfter = (r: LinkRow | null) => (r && isRec(r.after) ? r.after : {});
/** ลิงก์ที่ใช้ได้ = แถว issued ล่าสุดที่ไม่มี revoked ตามหลัง และยังไม่หมดอายุ */
function activeLink(r: LinkRow | null, now: Date): { id: string; tokenHash: string; expiresAt: Date; issuedAt: Date } | null {
  if (!r || r.action !== A.linkIssued) return null;
  const a = linkAfter(r);
  const exp = typeof a.expiresAt === "string" ? new Date(a.expiresAt) : null;
  if (typeof a.tokenHash !== "string" || !exp || !Number.isFinite(exp.getTime()) || now.getTime() > exp.getTime()) return null;
  return { id: r.id, tokenHash: a.tokenHash, expiresAt: exp, issuedAt: new Date(r.createdAt) };
}
const bookingOpen = (p: PaxRow) => p.bookingStatus !== "EXPIRED" && p.bookingStatus !== "CANCELLED" && p.piiPurgedAt === null;

type LinkCtx = { u: Unit; P: PaxRow; a: Answers; cfg: Cfg; linkId: string; tokenHash: string; now: Date; locale: "th" | "en" };
/**
 * ตรวจลิงก์ (ลำดับ §5 + r1 P6): ไม่มีกุญแจเซิร์ฟเวอร์ ⇒ BUSY SERVER_KEY_MISSING (ไม่นับเป็นการเดา) → verifyLink →
 * token ใช้ไม่ได้ (ลายเซ็นผิด / ไม่รู้ผู้เดินทาง / ไม่ใช่ลิงก์ล่าสุด / หมดอายุ / การจองปิด / ถูกลบ) ⇒ นับถังเครื่อง trips:token:<clientKey> (เพดาน: ไม่รู้ร้าน 60 · รู้หน่วย = tokenPerHourPerDevice) แล้ว NOT_FOUND ข้อความเดียว
 * token ใช้ได้ ⇒ เครื่องที่เดาเกินเพดานแล้วถูกปฏิเสธ (อ่านถังไม่เพิ่ม) → นับถังของลิงก์ trips:link:<linkId> (10 × ค่าตั้ง)
 */
async function openLink(pctx: unknown, token: string): Promise<LinkCtx | Failure> {
  const pc = publicCtxSchema.safeParse(pctx);
  if (!pc.success) return fail("VALIDATION", { fields: ["ctx"] });
  if (!serverKeyOk()) return KEY_MISSING();
  const now = pc.data.now ?? new Date();
  if (!Number.isFinite(now.getTime())) return fail("VALIDATION", { fields: ["ctx"] });
  const locale = pc.data.locale === "en" ? "en" : "th";
  const devKey = `trips:token:${pc.data.clientKey}`;
  const guess = async (limit: number): Promise<Failure> => {
    const rl = await checkRateLimitDb(devKey, { limit, windowMs: TOKEN_WINDOW_MS });
    return rl.ok ? NF() : fail("RATE_LIMITED", { retryAfterSec: rl.retryAfterSec ?? 60 });
  };
  const v = verifyLink(token, LINK_PURPOSE);
  if (!v) return guess(TOKEN_GUESS_LIMIT);
  const db = ro(v.tenantId);
  const us = await db.$queryRaw<{ unitId: string; type: string; settings: unknown }[]>`
    SELECT p."unitId", bu."type"::text AS "type", bu."settings" FROM "TripPassenger" p JOIN "BusinessUnit" bu ON bu."id" = p."unitId" AND bu."tenantId" = p."tenantId"
    WHERE p."id" = ${v.subjectId} AND p."tenantId" = ${v.tenantId}`;
  const urow = us[0];
  if (!urow || urow.type !== "TRIPS") return guess(TOKEN_GUESS_LIMIT);
  const r = await resolveSettings({ tenantId: v.tenantId }, [K.rate], { unitId: urow.unitId }, now);
  const x = r[K.rate]?.value;
  const n = isRec(x) ? x.tokenPerHourPerDevice : undefined;
  const limit = typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= TOKEN_GUESS_LIMIT ? n : TOKEN_GUESS_LIMIT;
  const u: Unit = { tenantId: v.tenantId, unitId: urow.unitId, tz: normalizeTimezone(isRec(urow.settings) ? urow.settings.timezone : null) };
  const P = await loadPax(db, u.tenantId, u.unitId, v.subjectId);
  if (!P) return guess(limit);
  const tokenHash = sha256hex(token);
  const L = activeLink(await latestLinkRow(db, u.tenantId, P.id, sinceOf(P.createdAt)), now);
  const a = parseAnswers(P.answers);
  if (!L || L.tokenHash !== tokenHash || !bookingOpen(P) || isPurgedAll(a) || now.getTime() >= new Date(P.endsAt).getTime()) return guess(limit);
  if (await deviceOverLimit(db, devKey, limit)) return fail("RATE_LIMITED", { retryAfterSec: 60 });
  const rl = await checkRateLimitDb(`trips:link:${L.id}`, { limit: limit * LINK_USE_FACTOR, windowMs: TOKEN_WINDOW_MS });
  if (!rl.ok) return fail("RATE_LIMITED", { retryAfterSec: rl.retryAfterSec ?? 60 });
  const cfg = await loadCfg(u, P, now);
  if (isFailure(cfg)) return cfg;
  return { u, P, a, cfg, linkId: L.id, tokenHash, now, locale };
}

/** ผลตรวจของ route ไฟล์กลาง (ผู้ดู LINK_CUSTOMER · §6.3 ข้อ 3) — ไม่ throw · false ทุกกรณีล้ม */
export async function linkCustomerMayOpenFile(i: { viewerId: string; fileId: string; tenantId: string; now?: Date }): Promise<boolean> {
  try {
    if (!isRec(i) || typeof i.viewerId !== "string" || typeof i.fileId !== "string" || typeof i.tenantId !== "string" || !i.viewerId || !i.fileId || !i.tenantId) return false;
    const now = i.now instanceof Date && Number.isFinite(i.now.getTime()) ? i.now : new Date();
    const db = ro(i.tenantId);
    const rows = await db.$queryRaw<{ id: string; targetId: string | null }[]>`
      SELECT "id", "targetId" FROM "AuditLog" WHERE "id" = ${i.viewerId} AND "tenantId" = ${i.tenantId} AND "action" = ${A.linkIssued} LIMIT 1`;
    const own = rows[0];
    const passengerId = own?.targetId;
    if (!own || !passengerId) return false;
    const P = await loadPax(db, i.tenantId, null, passengerId);
    if (!P) return false;
    const L = activeLink(await latestLinkRow(db, i.tenantId, P.id, sinceOf(P.createdAt)), now);
    if (!L || L.id !== own.id) return false;
    if (!bookingOpen(P) || isPurgedAll(parseAnswers(P.answers)) || now.getTime() >= new Date(P.endsAt).getTime()) return false;
    const docs = await db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "TripDocument" WHERE "tenantId" = ${i.tenantId} AND "unitId" = ${P.unitId} AND "passengerId" = ${P.id} AND "fileId" = ${i.fileId}
        AND "deletedAt" IS NULL AND "kind" <> 'MEDICAL' LIMIT 1`;
    return docs.length === 1;
  } catch {
    return false;
  }
}

/** ออกลิงก์ในธุรกรรม: advisory ต่อผู้เดินทาง → seq ถัดไป → แถว link_issued (sha256 ของ token ที่ระบบออกเอง) — token ดิบคืนผู้เรียกครั้งเดียว */
async function issueLinkInTx(tx: Tx, u: Unit, who: Who, P: PaxRow, now: Date): Promise<{ passengerId: string; token: string; expiresAt: string }> {
  await lockKey(tx, `t08.link:${P.id}`);
  const last = await latestLinkRow(tx, u.tenantId, P.id, sinceOf(P.createdAt));
  const seq = (() => {
    const s = linkAfter(last).seq;
    return typeof s === "number" && Number.isInteger(s) && s >= 0 && s < 2_000_000_000 ? s + 1 : 1;
  })();
  const endsMs = new Date(P.endsAt).getTime();
  const expMs = Math.min(endsMs, now.getTime() + SIGNED_LINK_MAX_MIN * 60_000);
  const expMin = Math.max(1, Math.ceil((expMs - now.getTime()) / 60_000));
  const token = signLink({ tenantId: u.tenantId, purpose: LINK_PURPOSE, subjectId: P.id, expMin });
  const expiresAt = iso(new Date(expMs));
  await auditTx(tx, u, who, A.linkIssued, "TripPassenger", P.id, { bookingId: P.bookingId, tokenHash: sha256hex(token), expiresAt, seq });
  return { passengerId: P.id, token, expiresAt };
}
async function revokeLinkInTx(tx: Tx, u: Unit, who: Who, P: PaxRow, now: Date): Promise<boolean> {
  await lockKey(tx, `t08.link:${P.id}`);
  const last = await latestLinkRow(tx, u.tenantId, P.id, sinceOf(P.createdAt));
  if (!last || last.action !== A.linkIssued) return false;
  const s = linkAfter(last).seq;
  const seq = typeof s === "number" && Number.isInteger(s) && s >= 0 && s < 2_000_000_000 ? s + 1 : 1;
  await auditTx(tx, u, who, A.linkRevoked, "TripPassenger", P.id, { bookingId: P.bookingId, seq, at: iso(now) });
  return true;
}

// ═══════════════════════ ผู้เขียน (ลูกค้าผ่านลิงก์ / พนักงาน) ═══════════════════════
type Writer = { via: "LINK"; tokenHash: string } | { via: "STAFF"; userId: string; m: MembershipCtx };
const whoOf = (w: Writer): Who => (w.via === "STAFF" ? { kind: "USER", userId: w.userId } : { kind: "SYSTEM" });
const keyHashOf = (w: Writer, key: string) => mac(["trips.t08.key", w.via === "LINK" ? `pubform:${w.tokenHash}` : `st:${w.userId}`, key]);
const consentVia = (w: Writer): "LINK" | "STAFF_RECORDED" => (w.via === "LINK" ? "LINK" : "STAFF_RECORDED");
/** อ้างอิงผู้ปกครองแบบมีกุญแจ (audit ไม่มีชื่อ · r1 P3) */
const guardianRef = (u: Unit, pid: string, g: { name: string; relation: string }) => mac(["trips.t08.guardian", u.tenantId, pid, g.name, g.relation]);
const healthAad = (u: Unit, pid: string) => `trips.pax.health.v1:${u.tenantId}:${pid}`;
const docAad = (u: Unit, pid: string) => `trips.pax.doc.v1:${u.tenantId}:${pid}`;
export function openDocNumber(u: Unit, pid: string, box: string | null): string | null | "LOCKED" {
  if (!box) return null;
  const o = openIntegrationSecret(box, docAad(u, pid));
  return o && typeof o.n === "string" ? o.n : "LOCKED";
}
export function openHealth(u: Unit, pid: string, h: HealthState | undefined): { allergies: string | null; conditions: string | null } | null | "LOCKED" {
  if (!h || h.status !== "PROVIDED") return null;
  const o = openIntegrationSecret(h.box, healthAad(u, pid));
  if (!o) return "LOCKED";
  return { allergies: typeof o.allergies === "string" ? o.allergies : null, conditions: typeof o.conditions === "string" ? o.conditions : null };
}
const grantsOf = (g: GuardianConsent | null): Partial<Record<"HEALTH" | "WAIVER", GuardianGrant>> => ({ ...(g?.grants ?? {}) });
/** ลบไฟล์วัตถุหลัง commit — ล้ม ⇒ แถวถูกทำเครื่องหมายแล้ว งานลบตามอายุลองใหม่ (pdpa.ts ขั้นวัตถุค้าง) */
async function afterCommitDelete(u: Unit, fileIds: readonly string[], deps?: DeleteDeps): Promise<void> {
  if (fileIds.length) await deleteObjects(u, fileIds, deps);
}

type WriteOut = { rev: number; formStatus: string; replayed?: true };
/**
 * แกนการเขียนแบบฟอร์ม (ลูกค้า §6.2 submit · ร้าน §6.1 update) — กันซ้ำ → rev → ช่อง (OFF · รูป) → วันปิดรับ (ลูกค้า) → สุขภาพ/ผู้เยาว์ (r1 P3 P4) → กุญแจกล่อง →
 * tx: ล็อก t08.doc → CAS rev → (ปฏิเสธ/กลายเป็นผู้เยาว์: ทำเครื่องหมายไฟล์ MEDICAL) → audit/event → commit → ลบวัตถุ (r1 P2)
 */
async function writeCore(u: Unit, P: PaxRow, cfg: Cfg, w: Writer, req: WriteRequest, now: Date, deps?: DeleteDeps): Promise<SellResult<WriteOut>> {
  const db = ro(u.tenantId);
  const a = parseAnswers(P.answers);
  if (isPurgedAll(a)) return fail("NOT_FOUND", { reason: "PURGED" });
  const spec = cfg.spec;
  const keyHash = keyHashOf(w, req.idempotencyKey);
  const bodyHash = mac({ op: "trips.pax.write.v1", expectedRev: req.expectedRev, fields: req.fields ?? null, health: req.health ?? null, isMinorDeclared: req.isMinorDeclared ?? null, guardian: req.guardian ?? null });
  const replay = (x: Record<string, unknown>): SellResult<WriteOut> =>
    x.bodyHash === bodyHash ? { ok: true, value: { rev: Number(x.rev), formStatus: String(x.formStatus), replayed: true } } : fail("IDEMPOTENCY_CONFLICT");
  const pre = await idemFind(db, u.tenantId, A.updated, P.id, sinceOf(P.createdAt), keyHash);
  if (pre) return replay(pre);
  if (req.expectedRev !== a.rev) return fail("STATE_CONFLICT", { rev: a.rev });
  if (a.rev >= 2_000_000_000) return fail("STATE_CONFLICT", { rev: a.rev });

  // ── ช่อง ──
  let vals: FieldValues = {};
  if (req.fields) {
    const sent = Object.keys(req.fields).filter((k) => req.fields?.[k as PaxFieldKey] !== undefined) as PaxFieldKey[];
    if (sent.some((k) => k === "allergies" || spec.fields[k] === "OFF")) return fail("VALIDATION", { reason: "FIELD_OFF", fields: sent.filter((k) => k === "allergies" || spec.fields[k] === "OFF") });
    const cv = checkFieldValues(req.fields, localYmdOf(now, u.tz));
    if (!cv.ok) return fail("VALIDATION", { fields: cv.fields });
    vals = cv.values;
  }
  const cur = valuesOf(P, a);
  // ── วันปิดรับข้อมูลเอกสาร (T30 · ลูกค้าเท่านั้น · แก้ค่าเดิมซ้ำได้) ──
  if (w.via === "LINK") {
    const days = P.crossBorder ? cfg.cutoff.crossBorder : cfg.cutoff.domestic;
    if (localYmdOf(now, u.tz) > addDaysYmd(travelYmdOf(P), -days)) {
      const changed = PASSPORT_CUTOFF_KEYS.some((k) => {
        if (k === "docNumber") {
          if (vals.docNumber === undefined) return false;
          const curDoc = openDocNumber(u, P.id, P.docNumberEnc);
          return curDoc === "LOCKED" || curDoc !== vals.docNumber;
        }
        const nv = vals[k as keyof FieldValues];
        return nv !== undefined && nv !== cur[k as keyof PaxValues];
      });
      if (changed) return fail("VALIDATION", { reason: "PASSPORT_CUTOFF_PASSED" });
    }
  }
  const nv: PaxValues = {
    fullName: vals.fullName !== undefined ? vals.fullName : cur.fullName,
    nationality: vals.nationality !== undefined ? vals.nationality : cur.nationality,
    dob: vals.dob !== undefined ? vals.dob : cur.dob,
    sex: vals.sex !== undefined ? vals.sex : cur.sex,
    docType: vals.docType !== undefined ? vals.docType : cur.docType,
    docLast4: vals.docNumber !== undefined ? (vals.docNumber === null ? null : docLast4Of(vals.docNumber)) : cur.docLast4,
    docExpiry: vals.docExpiry !== undefined ? vals.docExpiry : cur.docExpiry,
    phone: vals.phone !== undefined ? vals.phone : cur.phone,
    birthPlace: vals.birthPlace !== undefined ? vals.birthPlace : cur.birthPlace,
    certLevel: vals.certLevel !== undefined ? vals.certLevel : cur.certLevel,
    diveCount: vals.diveCount !== undefined ? vals.diveCount : cur.diveCount,
    lastDiveAt: vals.lastDiveAt !== undefined ? vals.lastDiveAt : cur.lastDiveAt,
    finSize: vals.finSize !== undefined ? vals.finSize : cur.finSize,
    pickupHotel: vals.pickupHotel !== undefined ? vals.pickupHotel : cur.pickupHotel,
  };
  const declaredMinor = req.isMinorDeclared !== undefined ? req.isMinorDeclared : (a.isMinorDeclared ?? null);
  const minor = minorStatus({ dob: nv.dob, declaredMinor, travelYmd: travelYmdOf(P), rule: spec.minor });
  const g0 = parseGuardian(P.guardianConsent);
  let grants = grantsOf(g0);
  let health: HealthState | undefined = a.health;
  let consentAudit: AuditVal | null = null;
  let eraseCause: "DECLINED" | "BECAME_MINOR" | null = null;
  let healthGivenNow = false;

  // ── สุขภาพ (ม.26 · ม.19 · ม.20) ──
  if (req.health) {
    const h = req.health;
    if (!spec.health.enabled) return fail("VALIDATION", { reason: "HEALTH_NOT_COLLECTED" });
    if (h.declined === true) {
      if (h.consent || h.allergies !== undefined || h.conditions !== undefined) return fail("VALIDATION", { fields: ["health"] });
      eraseCause = "DECLINED";
      health = { status: "DECLINED", at: iso(now) };
    } else {
      if (typeof h.conditions === "string" && h.conditions && !spec.health.conditions) return fail("VALIDATION", { reason: "HEALTH_NOT_COLLECTED" });
      if (typeof h.allergies === "string" && h.allergies && !spec.health.allergies) return fail("VALIDATION", { reason: "HEALTH_NOT_COLLECTED" });
      if (!h.consent) return fail("VALIDATION", { reason: "HEALTH_CONSENT_REQUIRED" });
      if (h.consent.textHash !== HEALTH_CONSENT_V1.hash) return fail("VALIDATION", { reason: "CONSENT_TEXT_CHANGED", textHash: HEALTH_CONSENT_V1.hash });
      if (!minor.known) return fail("VALIDATION", { reason: "AGE_UNKNOWN" });
      if (minor.isMinor && !req.guardian) return fail("VALIDATION", { reason: "GUARDIAN_REQUIRED" });
      if (!integrationSecretKeyConfigured()) return fail("BUSY", { reason: "SECRET_KEY_MISSING" });
      const old = openHealth(u, P.id, a.health);
      if (old === "LOCKED") return fail("BUSY", { reason: "SECRET_KEY_MISSING" });
      const allergies = h.allergies !== undefined ? (h.allergies || null) : (old?.allergies ?? null);
      const conditions = h.conditions !== undefined ? (h.conditions || null) : (old?.conditions ?? null);
      const signerRole = !minor.isMinor ? "SELF" : minor.guardianOnly ? "GUARDIAN" : "SELF_AND_GUARDIAN";
      health = {
        status: "PROVIDED",
        box: sealIntegrationSecret({ v: 1, allergies, conditions }, healthAad(u, P.id)),
        consent: { version: HEALTH_CONSENT_V1.version, textHash: HEALTH_CONSENT_V1.hash, locale: h.consent.locale, at: iso(now), via: consentVia(w), signerRole },
      };
      healthGivenNow = true;
      consentAudit = { passengerId: P.id, scope: "HEALTH", version: HEALTH_CONSENT_V1.version, textHash: HEALTH_CONSENT_V1.hash, locale: h.consent.locale, signerRole, via: consentVia(w), guardianRef: null };
      // ผู้ปกครองของขอบเขต HEALTH เท่านั้น (ไม่แตะผู้ลงนาม WAIVER · r1 P3)
      if (minor.isMinor && req.guardian) {
        grants = { ...grants, HEALTH: { name: req.guardian.name, relation: req.guardian.relation, at: iso(now), via: consentVia(w), version: HEALTH_CONSENT_V1.version } };
        consentAudit.guardianRef = guardianRef(u, P.id, req.guardian);
      }
    }
  }
  // ผู้ปกครองที่ไม่ได้ให้ความยินยอมขอบเขตใดในคำขอนี้ ⇒ ไม่บันทึก (ไม่เปลี่ยนผู้ให้ความยินยอมเดิม · r1 P3)

  // ── r1 P4: กลายเป็นผู้เยาว์ที่รู้อายุ ขณะสุขภาพ PROVIDED โดย SELF ⇒ ลบแบบถอน รอผู้ปกครอง · เอกสารลงนามโดย SELF ⇒ ต้องลงนามใหม่โดยผู้ปกครอง ──
  if (!healthGivenNow && minor.known && minor.isMinor && health?.status === "PROVIDED" && health.consent.signerRole === "SELF") {
    health = { status: "GUARDIAN_REQUIRED", at: iso(now) };
    eraseCause = "BECAME_MINOR";
  }
  const wv = parseWaiver(P.waiverEvidence);
  const needResign = minor.known && minor.isMinor && wv.kind === "FULL" && wv.e.signer.role === "SELF" && !a.waiverResign;
  const eraseHealth = eraseCause !== null && a.health?.status === "PROVIDED";
  const guardian = guardianFromGrants(grants);

  // ── เลขเอกสาร (กล่องปิดผนึก) ──
  let docEnc = P.docNumberEnc;
  if (vals.docNumber !== undefined) {
    if (vals.docNumber === null) docEnc = null;
    else {
      if (!integrationSecretKeyConfigured()) return fail("BUSY", { reason: "SECRET_KEY_MISSING" });
      docEnc = sealIntegrationSecret({ v: 1, n: vals.docNumber }, docAad(u, P.id));
    }
  }

  // ── answers ใหม่ · สถานะ ──
  const fields: Answers["fields"] = {};
  if (nv.finSize) fields.finSize = nv.finSize;
  if (nv.pickupHotel) fields.pickupHotel = nv.pickupHotel;
  const E = endYmdOf(P, u.tz);
  const next: Answers = { v: 1, rev: a.rev + 1, fields, retE: E };
  if (health) next.health = health;
  if (declaredMinor !== null) next.isMinorDeclared = declaredMinor;
  if (a.purged) next.purged = a.purged;
  if (a.waiverResign) next.waiverResign = a.waiverResign;
  if (needResign) next.waiverResign = { reason: "MINOR", at: iso(now) };
  const complete = missingFields(spec, nv, next).length === 0;
  const status = nextFormStatus(P.formStatus, complete);
  if (complete) {
    next.submittedAt = iso(now);
    next.submittedVia = w.via === "LINK" ? "LINK" : "STAFF";
  } else {
    if (a.submittedAt) next.submittedAt = a.submittedAt;
    if (a.submittedVia) next.submittedVia = a.submittedVia;
    if (status === "NEEDS_FIX" && a.fixReason) next.fixReason = a.fixReason;
  }
  const transitioned = complete && (P.formStatus === "PENDING" || P.formStatus === "NEEDS_FIX");
  const isMinor = minor.known ? minor.isMinor : P.isMinor;
  const retainUntil = paxRetainUntil(presentStages(next, { docNumberEnc: docEnc, waiverEvidence: P.waiverEvidence, guardianConsent: guardian }), E, u.tz, cfg.retention);
  const changedNames = [
    ...(req.fields ? (Object.keys(req.fields) as PaxFieldKey[]).filter((k) => req.fields?.[k] !== undefined) : []),
    ...(req.health ? ["health"] : []),
    ...(req.isMinorDeclared !== undefined ? ["isMinorDeclared"] : []),
    ...(req.guardian ? ["guardian"] : []),
  ].sort();
  const who = whoOf(w);

  const r = await inTx(u, async (tx): Promise<{ out: WriteOut; fileIds: string[] }> => {
    await lockKey(tx, `t08.doc:${P.id}`);
    const done = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "TripPassenger" SET "fullName" = ${nv.fullName}, "nationality" = ${nv.nationality}, "dob" = ${nv.dob}::date, "sex" = ${nv.sex}, "docType" = ${nv.docType},
        "docNumberEnc" = ${docEnc}, "docLast4" = ${nv.docLast4}, "docExpiry" = ${nv.docExpiry}::date, "phone" = ${nv.phone}, "birthPlace" = ${nv.birthPlace},
        "certLevel" = ${nv.certLevel}, "diveCount" = ${nv.diveCount}::int, "lastDiveAt" = ${nv.lastDiveAt}::timestamp, "isMinor" = ${isMinor},
        "guardianConsent" = ${guardian ? JSON.stringify(guardian) : null}::jsonb, "answers" = ${JSON.stringify(next)}::jsonb, "formStatus" = ${status},
        "retainUntil" = ${retainUntil ? iso(retainUntil) : null}::timestamp, "updatedAt" = ${iso(now)}::timestamp
      WHERE "id" = ${P.id} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND COALESCE(("answers"->>'rev')::int, 0) = ${a.rev}
        AND NOT (COALESCE("answers"->'purged'->'stages', '[]'::jsonb) ? 'ALL')
      RETURNING "id"`;
    if (done.length !== 1) {
      const again = await idemFind(tx, u.tenantId, A.updated, P.id, sinceOf(P.createdAt), keyHash);
      if (again && again.bodyHash === bodyHash) return { out: { rev: Number(again.rev), formStatus: String(again.formStatus), replayed: true }, fileIds: [] };
      if (again) return abort("IDEMPOTENCY_CONFLICT");
      const curRows = await tx.$queryRaw<{ rev: number | null }[]>`
        SELECT COALESCE(("answers"->>'rev')::int, 0) AS "rev" FROM "TripPassenger" WHERE "id" = ${P.id} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId}`;
      return abort("STATE_CONFLICT", { rev: curRows[0]?.rev ?? null });
    }
    await auditTx(tx, u, who, A.updated, "TripPassenger", P.id, { bookingId: P.bookingId, rev: next.rev, formStatus: status, fieldsChanged: changedNames.join(","), keyHash, bodyHash, via: w.via });
    if (consentAudit) await auditTx(tx, u, who, A.consentGiven, "TripPassenger", P.id, consentAudit);
    // ไฟล์ MEDICAL: ทำเครื่องหมายหลังชนะ CAS (ใต้ t08.doc · อัปโหลดที่มาทีหลังเห็นสุขภาพใหม่แล้วถูกปฏิเสธ)
    const marked = eraseCause ? await markMedicalInTx(tx, u, who, P.id, P.bookingId, now, eraseCause) : [];
    if (eraseHealth || marked.length) {
      await auditTx(tx, u, who, A.consentWithdrawn, "TripPassenger", P.id, { passengerId: P.id, healthAnswers: eraseHealth, medicalDocuments: marked.length, via: w.via, cause: eraseCause ?? "DECLINED" });
      if (eraseHealth) await emitTx(tx, u, [purgedEvt(`${P.id}:HEALTH_ANSWERS:w${next.rev}`, P.bookingId, P.id, "HEALTH_ANSWERS")]);
    }
    if (needResign) await auditTx(tx, u, who, A.waiverResign, "TripPassenger", P.id, { passengerId: P.id, reason: "MINOR", templateHash: wv.kind === "FULL" ? wv.e.templateHash : null });
    if (transitioned) {
      await emitTx(tx, u, [{ type: EVT_FORM_COMPLETED, key: `${EVT_FORM_COMPLETED}:${P.id}:${next.rev}`, payload: { bookingId: P.bookingId, passengerId: P.id, kind: "FORM" } }]);
    }
    return { out: { rev: next.rev, formStatus: status }, fileIds: marked.map((m) => m.fileId) };
  });
  if (!r.ok) return r;
  await afterCommitDelete(u, r.value.fileIds, deps);
  return { ok: true, value: r.value.out };
}

// ═══════════════════════ บริการสาธารณะ (ผู้ถือลิงก์ · §6.2) ═══════════════════════
export type PublicFormView = {
  rev: number;
  passengerIndex: number;
  passengerCount: number;
  product: { title: string };
  travelDate: string;
  spec: { fields: FormSpec["fields"]; health: FormSpec["health"]; waiver: { required: boolean } };
  values: {
    fullName: string;
    nationality: string | null;
    dob: string | null;
    sex: string | null;
    docType: string | null;
    docMasked: string | null;
    docExpiry: string | null;
    phone: string | null;
    birthPlace: string | null;
    certLevel: string | null;
    diveCount: number | null;
    lastDiveAt: string | null;
    finSize: string | null;
    pickupHotel: string | null;
  };
  health: HealthView;
  consentText: typeof HEALTH_CONSENT_V1;
  waiver: { status: "NOT_REQUIRED" | "MISSING" | "SIGNED" | "NEEDS_RESIGN"; templateHash: string | null; template: { th: string; en?: string } | null; signedAt: string | null };
  documents: { id: string; kind: string; uploadedAt: string; viewable: boolean }[];
  formStatus: string;
  missing: PaxFieldKey[];
  minor: { isMinor: boolean; guardianOnly: boolean; known: boolean };
};
export async function openPassengerForm(pctx: unknown, input: unknown): Promise<SellResult<PublicFormView>> {
  return safely("openPassengerForm", null, async () => {
    const p = openSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    const L = await openLink(pctx, p.data.token);
    if (isFailure(L)) return L;
    const { u, P, a, cfg, now } = L;
    const db = ro(u.tenantId);
    const sibs = await db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "TripPassenger" WHERE "bookingId" = ${P.bookingId} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} ORDER BY "createdAt", "id"`;
    const docs = await liveDocs(db, u, P.id);
    const v = valuesOf(P, a);
    const minor = minorStatus({ dob: v.dob, declaredMinor: a.isMinorDeclared ?? null, travelYmd: travelYmdOf(P), rule: cfg.spec.minor });
    const w = parseWaiver(P.waiverEvidence);
    return {
      ok: true,
      value: {
        rev: a.rev,
        passengerIndex: sibs.findIndex((x) => x.id === P.id) + 1,
        passengerCount: sibs.length,
        product: { title: titleOf(P.title, L.locale) },
        travelDate: travelYmdOf(P),
        spec: { fields: cfg.spec.fields, health: cfg.spec.health, waiver: { required: cfg.spec.waiver.required } },
        values: {
          fullName: v.fullName,
          nationality: v.nationality,
          dob: cfg.mask ? maskDob(v.dob) : v.dob,
          sex: v.sex,
          docType: v.docType,
          docMasked: maskDoc(v.docLast4),
          docExpiry: v.docExpiry,
          phone: v.phone,
          birthPlace: v.birthPlace,
          certLevel: v.certLevel,
          diveCount: v.diveCount,
          lastDiveAt: v.lastDiveAt,
          finSize: v.finSize,
          pickupHotel: v.pickupHotel,
        },
        health: healthViewOf(cfg.spec, a),
        consentText: HEALTH_CONSENT_V1,
        waiver: {
          status: waiverStatusOf(cfg.spec, P.waiverEvidence, now.getTime(), new Date(P.startsAt).getTime(), { knownMinor: minor.known && minor.isMinor, answers: a }),
          templateHash: cfg.spec.waiver.templateHash,
          template: cfg.spec.waiver.template,
          signedAt: w.kind === "NONE" ? null : w.e.signedAt,
        },
        documents: docs.map((d) => ({ id: d.id, kind: d.kind, uploadedAt: iso(new Date(d.createdAt)), viewable: d.kind !== "MEDICAL" })),
        formStatus: P.formStatus,
        missing: missingFields(cfg.spec, v, a),
        minor: { isMinor: minor.isMinor, guardianOnly: minor.guardianOnly, known: minor.known },
      },
    };
  });
}

export async function submitPassengerForm(pctx: unknown, input: unknown, deps?: { del?: DeleteDeps["del"] }): Promise<SellResult<WriteOut>> {
  return safely("submitPassengerForm", null, async () => {
    const p = submitSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    const L = await openLink(pctx, p.data.token);
    if (isFailure(L)) return L;
    const { token: _t, ...req } = p.data;
    return writeCore(L.u, L.P, L.cfg, { via: "LINK", tokenHash: L.tokenHash }, req, L.now, deps?.del ? { del: deps.del } : undefined);
  });
}

// ═══════════════════════ เอกสารรับทราบความเสี่ยง (§6.2 · T-SIGN-01 · r1 P5) ═══════════════════════
type SignOut = { signedAt: string; templateHash: string; documentId: string | null; replayed?: true };
type Signature = { contentType: string; data: Uint8Array };
/**
 * หลักฐานอายุของผู้ลงนาม (r1 P5): dob ⇒ DOB · ไม่มี dob + คำขอประกาศว่าไม่ใช่ผู้เยาว์ (false) ⇒ DECLARED_ADULT ·
 * ประกาศ/บันทึกว่าเป็นผู้เยาว์ ⇒ DECLARED_MINOR · ไม่มีทั้งคู่ ⇒ UNKNOWN (SELF ⇒ AGE_UNKNOWN · GUARDIAN ลงนามแทนได้)
 */
function signerBasis(spec: FormSpec, dob: string | null, stored: boolean | null, req: SignRequest, travelYmd: string): { isMinor: boolean | null; age: number | null; ageBasis: AgeBasis } | Failure {
  const age = dob ? ageAt(dob, travelYmd) : null;
  let isMinor: boolean | null;
  let ageBasis: AgeBasis;
  if (age !== null) {
    isMinor = age < spec.minor.minorBelow;
    ageBasis = "DOB";
  } else if (req.isMinorDeclared === false) {
    isMinor = false;
    ageBasis = "DECLARED_ADULT";
  } else if ((req.isMinorDeclared ?? stored) === true) {
    isMinor = true;
    ageBasis = "DECLARED_MINOR";
  } else {
    isMinor = null;
    ageBasis = "UNKNOWN";
  }
  if (req.signerRole === "GUARDIAN" && !req.guardian) return fail("VALIDATION", { reason: "GUARDIAN_REQUIRED" });
  if (req.signerRole === "SELF" && isMinor === true) return fail("VALIDATION", { reason: "GUARDIAN_REQUIRED" });
  if (req.signerRole === "SELF" && isMinor === null) return fail("VALIDATION", { reason: "AGE_UNKNOWN" });
  return { isMinor, age, ageBasis };
}
async function signCore(u: Unit, P: PaxRow, cfg: Cfg, w: Writer, req: SignRequest, now: Date, sig: Signature | null, deps?: UploadDeps & DeleteDeps): Promise<SellResult<SignOut>> {
  const db = ro(u.tenantId);
  const a = parseAnswers(P.answers);
  if (isPurgedAll(a)) return fail("NOT_FOUND", { reason: "PURGED" });
  const keyHash = keyHashOf(w, req.idempotencyKey);
  const bodyHash = mac({
    op: "trips.waiver.sign.v1",
    templateHash: req.templateHash,
    locale: req.locale,
    signerName: req.signerName,
    signerRole: req.signerRole,
    guardian: req.guardian ?? null,
    isMinorDeclared: req.isMinorDeclared ?? null,
    signature: sig ? { contentType: sig.contentType, sha256: sha256hex(sig.data) } : null,
  });
  const replay = (x: Record<string, unknown>): SellResult<SignOut> =>
    x.bodyHash === bodyHash
      ? { ok: true, value: { signedAt: String(x.signedAt), templateHash: String(x.templateHash), documentId: typeof x.documentId === "string" ? x.documentId : null, replayed: true } }
      : fail("IDEMPOTENCY_CONFLICT");
  const pre = await idemFind(db, u.tenantId, A.waiverSigned, P.id, sinceOf(P.createdAt), keyHash);
  if (pre) return replay(pre);
  const spec = cfg.spec;
  if (!spec.waiver.required || !spec.waiver.template || !spec.waiver.templateHash) return fail("VALIDATION", { reason: "WAIVER_NOT_REQUIRED" });
  if (req.templateHash !== spec.waiver.templateHash) return fail("VALIDATION", { reason: "TEMPLATE_CHANGED", templateHash: spec.waiver.templateHash });
  const templateHash = spec.waiver.templateHash;
  const alreadySigned = (raw: unknown, ans: Answers, isMinorRow: boolean) => {
    const x = parseWaiver(raw);
    return x.kind === "FULL" && x.e.templateHash === templateHash && !(x.e.signer.role === "SELF" && (isMinorRow || ans.waiverResign));
  };
  if (alreadySigned(P.waiverEvidence, a, P.isMinor)) return fail("STATE_CONFLICT", { reason: "WAIVER_ALREADY_SIGNED" });
  const pb = signerBasis(spec, ymdOf(P.dob), a.isMinorDeclared ?? null, req, travelYmdOf(P));
  if (isFailure(pb)) return pb;
  const tpl = spec.waiver.template;
  const locale: "th" | "en" = req.locale === "en" && typeof tpl.en === "string" && tpl.en ? "en" : "th";
  const shown = locale === "en" ? (tpl.en ?? tpl.th) : tpl.th;
  const witnessed = w.via === "STAFF";

  // รูปลายเซ็น (พนักงานเซ็นต่อหน้า): ตรวจชนิด/ขนาด → อัปโหลดนอก tx
  let fileId: string | null = null;
  let sigBytes = 0;
  let sigType = "";
  if (sig) {
    const chk = fileCheck(sig.contentType, sig.data);
    if (isFailure(chk)) return chk;
    if (!deps?.put && !storageEnabled()) return fail("BUSY", { reason: "STORAGE_NOT_CONFIGURED" });
    const up = await uploadFile({ tenantId: u.tenantId }, { kind: "ATTACHMENT", filename: `waiver.${chk.ext}`, contentType: chk.type, data: sig.data, maxBytes: UPLOAD_MAX_BYTES, visibility: "private" }, deps?.put ? { put: deps.put } : undefined);
    if (!up.ok) return fail("BUSY", { reason: "UPLOAD_FAILED" });
    fileId = up.assetId;
    sigBytes = sig.data.length;
    sigType = chk.type;
  }
  const dropOwnFile = async () => {
    if (fileId) await deleteFileAsset({ tenantId: u.tenantId }, fileId, deps?.del ? { del: deps.del } : undefined);
  };
  const who = whoOf(w);
  const r = await inTx(u, async (tx): Promise<SignOut> => {
    const L = await loadPax(tx, u.tenantId, u.unitId, P.id, "UPDATE");
    if (!L) return abort("NOT_FOUND");
    const la = parseAnswers(L.answers);
    if (isPurgedAll(la)) return abort("NOT_FOUND", { reason: "PURGED" });
    const again = await idemFind(tx, u.tenantId, A.waiverSigned, P.id, sinceOf(P.createdAt), keyHash);
    if (again) {
      if (again.bodyHash !== bodyHash) return abort("IDEMPOTENCY_CONFLICT");
      return { signedAt: String(again.signedAt), templateHash: String(again.templateHash), documentId: typeof again.documentId === "string" ? again.documentId : null, replayed: true };
    }
    if (alreadySigned(L.waiverEvidence, la, L.isMinor)) return abort("STATE_CONFLICT", { reason: "WAIVER_ALREADY_SIGNED" });
    // อายุอ่านจากแถวที่ล็อกแล้ว (r1 P9 · ไม่ใช้ค่าที่อ่านก่อน tx)
    const basis = signerBasis(spec, ymdOf(L.dob), la.isMinorDeclared ?? null, req, travelYmdOf(L));
    if (isFailure(basis)) return abort(basis.code, basis.details);
    let documentId: string | null = null;
    const E = endYmdOf(L, u.tz);
    if (fileId) {
      const doc = await tx.tripDocument.create({
        data: { tenantId: u.tenantId, unitId: u.unitId, passengerId: P.id, kind: "WAIVER", fileId, consent: { retE: E }, retainUntil: docRetainUntil("WAIVER", E, u.tz, cfg.retention) },
        select: { id: true },
      });
      documentId = doc.id;
      await auditTx(tx, u, who, A.docUploaded, "TripPassenger", P.id, { documentId: doc.id, passengerId: P.id, kind: "WAIVER", bytes: sigBytes, contentType: sigType, via: w.via });
    }
    const prev = parseWaiver(L.waiverEvidence);
    const history: WaiverHistoryItem[] =
      prev.kind === "FULL"
        ? [{ templateHash: prev.e.templateHash, textHash: prev.e.textHash, signedAt: prev.e.signedAt, method: prev.e.method, signerRole: prev.e.signer.role }, ...(prev.e.previous ?? [])].slice(0, WAIVER_HISTORY_MAX)
        : [];
    const evidence: WaiverEvidence = {
      v: 1,
      templateHash,
      locale,
      text: shown,
      textHash: sha256hex(shown),
      signedAt: iso(now),
      method: witnessed ? "STAFF_WITNESSED" : "LINK",
      identityProof: { required: cfg.identityProof, used: witnessed ? "STAFF_WITNESSED" : "LINK_POSSESSION", verified: witnessed },
      signer: { role: req.signerRole, name: req.signerName },
      minor: { isMinor: basis.isMinor, age: basis.age, ageBasis: basis.ageBasis },
      ...(w.via === "STAFF" ? { staffUserId: w.userId } : {}),
      ...(documentId ? { signatureDocumentId: documentId } : {}),
      ...(history.length ? { previous: history } : {}),
    };
    // ผู้ปกครองของขอบเขต WAIVER เท่านั้น (r1 P3)
    let grants = grantsOf(parseGuardian(L.guardianConsent));
    if (req.signerRole === "GUARDIAN" && req.guardian) grants = { ...grants, WAIVER: { name: req.guardian.name, relation: req.guardian.relation, at: iso(now), via: consentVia(w), version: templateHash } };
    const guardian = guardianFromGrants(grants);
    const { waiverResign: _wr, ...rest } = la;
    const next: Answers = { ...rest, rev: la.rev + 1, retE: E, ...(req.isMinorDeclared !== undefined ? { isMinorDeclared: req.isMinorDeclared } : {}) };
    const retainUntil = paxRetainUntil(presentStages(next, { docNumberEnc: L.docNumberEnc, waiverEvidence: evidence, guardianConsent: guardian }), E, u.tz, cfg.retention);
    const isMinorCol = basis.isMinor === null ? L.isMinor : basis.isMinor;
    const done = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "TripPassenger" SET "waiverEvidence" = ${JSON.stringify(evidence)}::jsonb, "waiverSignedAt" = ${iso(now)}::timestamp, "isMinor" = ${isMinorCol},
        "guardianConsent" = ${guardian ? JSON.stringify(guardian) : null}::jsonb, "answers" = ${JSON.stringify(next)}::jsonb,
        "retainUntil" = ${retainUntil ? iso(retainUntil) : null}::timestamp, "updatedAt" = ${iso(now)}::timestamp
      WHERE "id" = ${P.id} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND COALESCE(("answers"->>'rev')::int, 0) = ${la.rev}
      RETURNING "id"`;
    if (done.length !== 1) return abort("STATE_CONFLICT", { rev: la.rev });
    await auditTx(tx, u, who, A.waiverSigned, "TripPassenger", P.id, {
      passengerId: P.id,
      templateHash,
      textHash: evidence.textHash,
      method: evidence.method,
      signerRole: req.signerRole,
      ageBasis: basis.ageBasis,
      guardianRef: req.signerRole === "GUARDIAN" && req.guardian ? guardianRef(u, P.id, req.guardian) : null,
      signedAt: evidence.signedAt,
      documentId,
      keyHash,
      bodyHash,
      via: w.via,
    });
    return { signedAt: evidence.signedAt, templateHash, documentId };
  });
  if (!r.ok || r.value.replayed) await dropOwnFile();
  return r;
}

export async function signPassengerWaiver(pctx: unknown, input: unknown): Promise<SellResult<{ signedAt: string; templateHash: string; replayed?: true }>> {
  return safely("signPassengerWaiver", null, async () => {
    const p = signSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    const L = await openLink(pctx, p.data.token);
    if (isFailure(L)) return L;
    const d = p.data;
    const r = await signCore(
      L.u,
      L.P,
      L.cfg,
      { via: "LINK", tokenHash: L.tokenHash },
      { idempotencyKey: d.idempotencyKey, templateHash: d.templateHash, locale: d.locale, signerName: d.signerName, signerRole: d.signerRole, ...(d.guardian ? { guardian: d.guardian } : {}), ...(d.isMinorDeclared !== undefined ? { isMinorDeclared: d.isMinorDeclared } : {}) },
      L.now,
      null,
    );
    if (!r.ok) return r;
    return { ok: true, value: { signedAt: r.value.signedAt, templateHash: r.value.templateHash, ...(r.value.replayed ? { replayed: true as const } : {}) } };
  });
}

// ═══════════════════════ ไฟล์ (§6.2 อัปโหลด) ═══════════════════════
function fileCheck(contentTypeRaw: string, data: Uint8Array): { type: (typeof UPLOAD_TYPES)[number]; ext: string } | Failure {
  const declared = contentTypeRaw.split(";")[0]?.trim().toLowerCase() ?? "";
  if (data.length > UPLOAD_MAX_BYTES) return fail("VALIDATION", { reason: "FILE_TOO_LARGE" });
  const t = (UPLOAD_TYPES as readonly string[]).includes(declared) ? (declared as (typeof UPLOAD_TYPES)[number]) : null;
  if (!t || data.length === 0 || sniffedAttachmentType(data, t) !== t) return fail("VALIDATION", { reason: "FILE_TYPE" });
  return { type: t, ext: UPLOAD_EXT[t] };
}
type UploadOut = { documentId: string; kind: string; replayed?: true };
/** อัปโหลด: วัตถุนอก tx → tx: ล็อก t08.doc → ตรวจกันซ้ำ/เพดาน/สุขภาพ (MEDICAL ต้อง PROVIDED ใต้ล็อกเดียวกับการปฏิเสธ/ถอน · r1 P2) → INSERT */
async function uploadCore(u: Unit, P: PaxRow, cfg: Cfg, w: Writer, req: { idempotencyKey: string; kind: string; contentType: string; bytes: Uint8Array }, deps?: UploadDeps & DeleteDeps): Promise<SellResult<UploadOut>> {
  const db = ro(u.tenantId);
  const bytes = req.bytes;
  const a = parseAnswers(P.answers);
  if (isPurgedAll(a)) return fail("NOT_FOUND", { reason: "PURGED" });
  const keyHash = keyHashOf(w, req.idempotencyKey);
  const bodyHash = mac({ op: "trips.doc.upload.v1", kind: req.kind, contentType: req.contentType, bytes: bytes.length, sha256: sha256hex(bytes) });
  const replay = (x: Record<string, unknown>): SellResult<UploadOut> =>
    x.bodyHash === bodyHash ? { ok: true, value: { documentId: String(x.documentId), kind: String(x.kind), replayed: true } } : fail("IDEMPOTENCY_CONFLICT");
  const pre = await idemFind(db, u.tenantId, A.docUploaded, P.id, sinceOf(P.createdAt), keyHash);
  if (pre) return replay(pre);
  const chk = fileCheck(req.contentType, bytes);
  if (isFailure(chk)) return chk;
  const f = cfg.spec.fields;
  const allowed =
    req.kind === "PASSPORT" ? f.docNumber !== "OFF" || f.docType !== "OFF" : req.kind === "CERT" ? f.certLevel !== "OFF" : req.kind === "MEDICAL" ? cfg.spec.health.medicalDocument : w.via === "STAFF";
  if (!allowed) return fail("VALIDATION", { reason: "DOC_KIND_NOT_ALLOWED" });
  if (req.kind === "MEDICAL" && a.health?.status !== "PROVIDED") return fail("VALIDATION", { reason: "HEALTH_CONSENT_REQUIRED" });
  if ((await liveDocs(db, u, P.id, req.kind)).length >= DOC_LIMIT_PER_KIND) return fail("VALIDATION", { reason: "DOC_LIMIT" });
  if (!deps?.put && !storageEnabled()) return fail("BUSY", { reason: "STORAGE_NOT_CONFIGURED" });
  const up = await uploadFile(
    { tenantId: u.tenantId },
    { kind: "ATTACHMENT", filename: `${req.kind.toLowerCase()}.${chk.ext}`, contentType: chk.type, data: bytes, maxBytes: UPLOAD_MAX_BYTES, visibility: "private" },
    deps?.put ? { put: deps.put } : undefined,
  );
  if (!up.ok) return fail("BUSY", { reason: "UPLOAD_FAILED" });
  const fileId = up.assetId;
  const who = whoOf(w);
  const r = await inTx(u, async (tx): Promise<UploadOut> => {
    await lockKey(tx, `t08.doc:${P.id}`);
    const again = await idemFind(tx, u.tenantId, A.docUploaded, P.id, sinceOf(P.createdAt), keyHash);
    if (again) {
      if (again.bodyHash !== bodyHash) return abort("IDEMPOTENCY_CONFLICT");
      return { documentId: String(again.documentId), kind: String(again.kind), replayed: true };
    }
    const L = await loadPax(tx, u.tenantId, u.unitId, P.id, "SHARE");
    if (!L) return abort("NOT_FOUND");
    const la = parseAnswers(L.answers);
    if (isPurgedAll(la)) return abort("NOT_FOUND", { reason: "PURGED" });
    if (req.kind === "MEDICAL" && la.health?.status !== "PROVIDED") return abort("VALIDATION", { reason: "HEALTH_CONSENT_REQUIRED" });
    const n = await tx.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS "n" FROM "TripDocument" WHERE "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND "passengerId" = ${P.id} AND "kind" = ${req.kind} AND "deletedAt" IS NULL`;
    if ((n[0]?.n ?? 0) >= DOC_LIMIT_PER_KIND) return abort("VALIDATION", { reason: "DOC_LIMIT" });
    const E = endYmdOf(L, u.tz);
    const consent = req.kind === "MEDICAL" && la.health?.status === "PROVIDED" ? { version: la.health.consent.version, textHash: la.health.consent.textHash, retE: E } : { retE: E };
    const doc = await tx.tripDocument.create({
      data: { tenantId: u.tenantId, unitId: u.unitId, passengerId: P.id, kind: req.kind, fileId, consent, retainUntil: docRetainUntil(req.kind, E, u.tz, cfg.retention) },
      select: { id: true },
    });
    await auditTx(tx, u, who, A.docUploaded, "TripPassenger", P.id, { documentId: doc.id, passengerId: P.id, kind: req.kind, bytes: bytes.length, contentType: chk.type, keyHash, bodyHash, via: w.via });
    return { documentId: doc.id, kind: req.kind };
  });
  if (!r.ok || r.value.replayed) await deleteFileAsset({ tenantId: u.tenantId }, fileId, deps?.del ? { del: deps.del } : undefined);
  return r;
}

export async function uploadPassengerDocument(pctx: unknown, input: unknown, deps?: { put?: UploadDeps["put"]; del?: DeleteDeps["del"] }): Promise<SellResult<UploadOut>> {
  return safely("uploadPassengerDocument", null, async () => {
    const p = uploadPublicSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    const L = await openLink(pctx, p.data.token);
    if (isFailure(L)) return L;
    return uploadCore(L.u, L.P, L.cfg, { via: "LINK", tokenHash: L.tokenHash }, { idempotencyKey: p.data.idempotencyKey, kind: p.data.kind, contentType: p.data.contentType, bytes: p.data.data }, deps);
  });
}

// ═══════════════════════ ถอนความยินยอม (ม.19 วรรคห้า · Q13 ลบทันที · r1 P2) ═══════════════════════
type WithdrawOut = { effects: { healthAnswers: boolean; medicalDocuments: number }; done: boolean; replayed?: true };
/** ล็อก t08.doc → แถว FOR UPDATE → กันซ้ำ → CAS rev (WITHDRAWN + สถานะแบบฟอร์มใหม่) → ทำเครื่องหมายไฟล์ MEDICAL → commit → ลบวัตถุ */
async function withdrawCore(u: Unit, P: PaxRow, cfg: Cfg, w: Writer, req: { idempotencyKey: string; mode: "PREVIEW" | "EXECUTE" }, now: Date, deps?: DeleteDeps): Promise<SellResult<WithdrawOut>> {
  const db = ro(u.tenantId);
  const a = parseAnswers(P.answers);
  if (isPurgedAll(a)) return fail("NOT_FOUND", { reason: "PURGED" });
  if (req.mode === "PREVIEW") {
    const meds = await liveDocs(db, u, P.id, "MEDICAL");
    return { ok: true, value: { effects: { healthAnswers: a.health?.status === "PROVIDED", medicalDocuments: meds.length }, done: false } };
  }
  const keyHash = keyHashOf(w, req.idempotencyKey);
  const bodyHash = mac({ op: "trips.consent.withdraw.v1", scope: "HEALTH" });
  const replay = (x: Record<string, unknown>): SellResult<WithdrawOut> =>
    x.bodyHash === bodyHash ? { ok: true, value: { effects: { healthAnswers: x.healthAnswers === true, medicalDocuments: Number(x.medicalDocuments) || 0 }, done: true, replayed: true } } : fail("IDEMPOTENCY_CONFLICT");
  const pre = await idemFind(db, u.tenantId, A.consentWithdrawn, P.id, sinceOf(P.createdAt), keyHash);
  if (pre) return replay(pre);
  const who = whoOf(w);
  const r = await inTx(u, async (tx): Promise<{ out: WithdrawOut; fileIds: string[] }> => {
    await lockKey(tx, `t08.doc:${P.id}`);
    const L = await loadPax(tx, u.tenantId, u.unitId, P.id, "UPDATE");
    if (!L) return abort("NOT_FOUND");
    const again = await idemFind(tx, u.tenantId, A.consentWithdrawn, P.id, sinceOf(P.createdAt), keyHash);
    if (again) {
      if (again.bodyHash !== bodyHash) return abort("IDEMPOTENCY_CONFLICT");
      return { out: { effects: { healthAnswers: again.healthAnswers === true, medicalDocuments: Number(again.medicalDocuments) || 0 }, done: true, replayed: true }, fileIds: [] };
    }
    const la = parseAnswers(L.answers);
    if (isPurgedAll(la)) return abort("NOT_FOUND", { reason: "PURGED" });
    const hadHealth = la.health?.status === "PROVIDED";
    let rev = la.rev;
    if (hadHealth) {
      const next: Answers = { ...la, rev: la.rev + 1, health: { status: "WITHDRAWN", at: iso(now) } };
      const complete = missingFields(cfg.spec, valuesOf(L, next), next).length === 0;
      const status = complete ? L.formStatus : nextFormStatus(L.formStatus, false);
      const E = endYmdOf(L, u.tz);
      const retainUntil = paxRetainUntil(presentStages(next, { docNumberEnc: L.docNumberEnc, waiverEvidence: L.waiverEvidence, guardianConsent: L.guardianConsent }), E, u.tz, cfg.retention);
      const done = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "TripPassenger" SET "answers" = ${JSON.stringify({ ...next, retE: E })}::jsonb, "formStatus" = ${status},
          "retainUntil" = ${retainUntil ? iso(retainUntil) : null}::timestamp, "updatedAt" = ${iso(now)}::timestamp
        WHERE "id" = ${P.id} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND COALESCE(("answers"->>'rev')::int, 0) = ${la.rev}
        RETURNING "id"`;
      if (done.length !== 1) return abort("STATE_CONFLICT", { rev: la.rev });
      rev = next.rev;
    }
    const marked = await markMedicalInTx(tx, u, who, P.id, P.bookingId, now, "WITHDRAWN");
    await auditTx(tx, u, who, A.consentWithdrawn, "TripPassenger", P.id, { passengerId: P.id, healthAnswers: hadHealth, medicalDocuments: marked.length, keyHash, bodyHash, via: w.via });
    if (hadHealth) await emitTx(tx, u, [purgedEvt(`${P.id}:HEALTH_ANSWERS:w${rev}`, P.bookingId, P.id, "HEALTH_ANSWERS")]);
    return { out: { effects: { healthAnswers: hadHealth, medicalDocuments: marked.length }, done: true }, fileIds: marked.map((m) => m.fileId) };
  });
  if (!r.ok) return r;
  await afterCommitDelete(u, r.value.fileIds, deps);
  return { ok: true, value: r.value.out };
}

export async function withdrawHealthConsent(pctx: unknown, input: unknown, deps?: { del?: DeleteDeps["del"] }): Promise<SellResult<WithdrawOut>> {
  return safely("withdrawHealthConsent", null, async () => {
    const p = withdrawPublicSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    const L = await openLink(pctx, p.data.token);
    if (isFailure(L)) return L;
    return withdrawCore(L.u, L.P, L.cfg, { via: "LINK", tokenHash: L.tokenHash }, { idempotencyKey: p.data.idempotencyKey, mode: p.data.mode }, L.now, deps?.del ? { del: deps.del } : undefined);
  });
}

/** ผู้ถือลิงก์ขอ URL ไฟล์ของตัวเองทีละใบ (§6.3 ข้อ 4) — MEDICAL ต้อง OTP (W1.3) · URL ผูกแถว link_issued ไม่ใช่ token */
export async function customerDocumentUrl(pctx: unknown, input: unknown): Promise<SellResult<{ url: string; expiresInSec: number }>> {
  return safely("customerDocumentUrl", null, async () => {
    const p = customerUrlSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    const L = await openLink(pctx, p.data.token);
    if (isFailure(L)) return L;
    const { u, P, now } = L;
    const rows = await ro(u.tenantId).$queryRaw<DocRow[]>`
      SELECT "id", "passengerId", "kind", "fileId", "retainUntil", "deletedAt", "createdAt" FROM "TripDocument"
      WHERE "id" = ${p.data.documentId} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND "passengerId" = ${P.id}`;
    const d = rows[0];
    if (!d) return NF();
    if (d.deletedAt) return fail("NOT_FOUND", { reason: "PURGED" });
    if (d.kind === "MEDICAL") return fail("FORBIDDEN", { reason: "OTP_REQUIRED" });
    const r = await inTx(u, async (tx) => {
      await tx.tripDocView.create({ data: { tenantId: u.tenantId, unitId: u.unitId, documentId: d.id, viewerKind: "LINK_CUSTOMER", viewerId: L.linkId, purpose: "CUSTOMER_SELF", at: now }, select: { id: true } });
      return d.fileId;
    });
    if (!r.ok) return r;
    return { ok: true, value: { url: `${privateFileUrl(r.value, { kind: "LINK_CUSTOMER", id: L.linkId }, 300)}&lv=${L.linkId}`, expiresInSec: URL_TTL_SEC } };
  });
}

// ═══════════════════════ บริการฝั่งร้าน (§6.1) ═══════════════════════
const P_VIEW = "trips.passenger.view";
const P_EDIT = "trips.passenger.edit";
type StaffPax = { s: Staff; P: PaxRow; cfg: Cfg };
async function staffPax(ctx: unknown, perm: string, passengerId: string): Promise<StaffPax | Failure> {
  const s = await staffGate(ctx, perm);
  if (isFailure(s)) return s;
  const P = await loadPax(ro(s.tenantId), s.tenantId, s.unitId, passengerId);
  if (!P) return NF();
  const cfg = await loadCfg(s, P, s.now);
  if (isFailure(cfg)) return cfg;
  return { s, P, cfg };
}

export type PassengerDTO = {
  id: string;
  bookingId: string;
  itemId: string | null;
  rev: number;
  fullName: string;
  nationality: string | null;
  dob: string | null;
  sex: string | null;
  docType: string | null;
  docMasked: string | null;
  docNumber?: string | null;
  docExpiry: string | null;
  phone: string | null;
  birthPlace: string | null;
  certLevel: string | null;
  diveCount: number | null;
  lastDiveAt: string | null;
  fields: { finSize: string | null; pickupHotel: string | null };
  isMinor: boolean;
  guardian: { name: string; relation: string } | null;
  health: HealthView;
  formStatus: string;
  missing: PaxFieldKey[];
  fixReason: string | null;
  waiver: { status: "NOT_REQUIRED" | "MISSING" | "SIGNED" | "NEEDS_RESIGN"; signedAt: string | null; method: string | null; identityVerified: boolean };
  documents: { id: string; kind: string; uploadedAt: string; deleted: boolean }[];
  link: { active: boolean; issuedAt: string; expiresAt: string } | null;
  purged: boolean;
};
type Summary = { total: number; seats: number; formComplete: number; waiverRequired: number; waiverSigned: number; healthMissing: number };
export async function getTripPassengers(ctx: unknown, input: unknown): Promise<SellResult<{ bookingId: string; passengers: PassengerDTO[]; summary: Summary }>> {
  return safely("getTripPassengers", ctx, async () => {
    const p = bookingIdSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    const s = await staffGate(ctx, P_VIEW);
    if (isFailure(s)) return s;
    const db = ro(s.tenantId);
    const bk = await db.$queryRaw<{ id: string; productId: string; crossBorder: boolean; deepDive: boolean }[]>`
      SELECT b."id", b."productId", pr."crossBorder", pr."deepDive" FROM "TripBooking" b JOIN "TripProduct" pr ON pr."id" = b."productId" AND pr."tenantId" = b."tenantId"
      WHERE b."id" = ${p.data.bookingId} AND b."tenantId" = ${s.tenantId} AND b."unitId" = ${s.unitId}`;
    const b = bk[0];
    if (!b) return NF();
    const cfg = await loadCfg(s, b, s.now);
    if (isFailure(cfg)) return cfg;
    const rows = await loadBookingPax(db, s, b.id);
    const ids = rows.map((r) => r.id);
    const seats = await db.$queryRaw<{ n: number }[]>`
      SELECT COALESCE(sum("qty"), 0)::int AS "n" FROM "TripBookingItem" WHERE "bookingId" = ${b.id} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} AND "kind" = 'SEAT' AND "active" = true`;
    const docs = ids.length
      ? await db.$queryRaw<DocRow[]>`
          SELECT "id", "passengerId", "kind", "fileId", "retainUntil", "deletedAt", "createdAt" FROM "TripDocument"
          WHERE "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} AND "passengerId" = ANY(${ids}::text[]) ORDER BY "createdAt", "id"`
      : [];
    const since = rows.length ? sinceOf(new Date(Math.min(...rows.map((r) => new Date(r.createdAt).getTime())))) : s.now;
    const until = new Date(Date.now() + IDEM_SKEW_MS);
    const links = ids.length
      ? await db.$queryRaw<(LinkRow & { targetId: string })[]>`
          SELECT "id", "action", "after", "createdAt", "targetId" FROM "AuditLog"
          WHERE "tenantId" = ${s.tenantId} AND "createdAt" >= ${iso(since)}::timestamp AND "createdAt" <= ${iso(until)}::timestamp
            AND "targetId" = ANY(${ids}::text[]) AND "action" IN (${A.linkIssued}, ${A.linkRevoked})`
      : [];
    const seqOf = (r: LinkRow) => {
      const x = linkAfter(r).seq;
      return typeof x === "number" ? x : 0;
    };
    const unmasked = !cfg.mask && sensitiveOk(s, "trips.passenger.reveal");
    let revealed = 0;
    const out: PassengerDTO[] = [];
    for (const r of rows) {
      const a = parseAnswers(r.answers);
      const v = valuesOf(r, a);
      const g = parseGuardian(r.guardianConsent);
      const w = parseWaiver(r.waiverEvidence);
      const mine = links.filter((x) => x.targetId === r.id).sort((x, y) => seqOf(y) - seqOf(x) || new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime());
      const last = mine[0] ?? null;
      const act = activeLink(last, s.now);
      const issued = mine.find((x) => x.action === A.linkIssued) ?? null;
      const ia = linkAfter(issued);
      let docNumber: string | null = null;
      if (unmasked) {
        const n = openDocNumber(s, r.id, r.docNumberEnc);
        if (n === "LOCKED") return fail("BUSY", { reason: "SECRET_KEY_MISSING" });
        docNumber = n;
        if (n !== null) revealed++;
      }
      out.push({
        id: r.id,
        bookingId: r.bookingId,
        itemId: r.itemId,
        rev: a.rev,
        fullName: v.fullName,
        nationality: v.nationality,
        dob: cfg.mask ? maskDob(v.dob) : v.dob,
        sex: v.sex,
        docType: v.docType,
        docMasked: maskDoc(v.docLast4),
        ...(unmasked ? { docNumber } : {}),
        docExpiry: v.docExpiry,
        phone: v.phone,
        birthPlace: v.birthPlace,
        certLevel: v.certLevel,
        diveCount: v.diveCount,
        lastDiveAt: v.lastDiveAt,
        fields: { finSize: v.finSize, pickupHotel: v.pickupHotel },
        isMinor: r.isMinor,
        guardian: g ? { name: g.name, relation: g.relation } : null,
        health: healthViewOf(cfg.spec, a),
        formStatus: r.formStatus,
        missing: missingFields(cfg.spec, v, a),
        fixReason: a.fixReason ?? null,
        waiver: {
          status: waiverStatusOf(cfg.spec, r.waiverEvidence, s.now.getTime(), new Date(r.startsAt).getTime(), { knownMinor: r.isMinor, answers: a }),
          signedAt: w.kind === "NONE" ? (r.waiverSignedAt ? iso(new Date(r.waiverSignedAt)) : null) : w.e.signedAt,
          method: w.kind === "NONE" ? null : w.e.method,
          identityVerified: w.kind === "FULL" ? w.e.identityProof.verified : false,
        },
        documents: docs.filter((d) => d.passengerId === r.id).map((d) => ({ id: d.id, kind: d.kind, uploadedAt: iso(new Date(d.createdAt)), deleted: d.deletedAt !== null })),
        link: issued
          ? { active: act !== null, issuedAt: iso(new Date(issued.createdAt)), expiresAt: typeof ia.expiresAt === "string" ? ia.expiresAt : iso(new Date(r.endsAt)) }
          : null,
        purged: isPurgedAll(a),
      });
    }
    if (unmasked && revealed > 0) {
      const wr = await inTx(s, async (tx) => auditTx(tx, s, { kind: "USER", userId: s.userId }, A.listUnmasked, "TripBooking", b.id, { bookingId: b.id, count: revealed }));
      if (!wr.ok) return wr;
    }
    const summary: Summary = {
      total: out.length,
      seats: seats[0]?.n ?? 0,
      formComplete: out.filter((x) => x.formStatus === "SUBMITTED" || x.formStatus === "VERIFIED").length,
      waiverRequired: cfg.spec.waiver.required ? out.length : 0,
      waiverSigned: out.filter((x) => x.waiver.status === "SIGNED").length,
      healthMissing: out.filter((x) => x.health === "MISSING" || x.health === "GUARDIAN_REQUIRED").length,
    };
    return { ok: true, value: { bookingId: b.id, passengers: out, summary } };
  });
}

/** ช่องผู้เดินทางให้ครบตามที่นั่ง SEAT active (รวมทารก) — ล็อกแถวการจองก่อนนับ · ซ้ำ = 0 */
export async function ensurePassengerSlots(ctx: unknown, input: unknown): Promise<SellResult<{ created: number; total: number }>> {
  return safely("ensurePassengerSlots", ctx, async () => {
    const p = bookingIdSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    const s = await staffGate(ctx, P_EDIT);
    if (isFailure(s)) return s;
    return inTx(s, async (tx) => {
      const bk = await tx.$queryRaw<{ id: string; status: string; piiPurgedAt: Date | null }[]>`
        SELECT "id", "status", "piiPurgedAt" FROM "TripBooking" WHERE "id" = ${p.data.bookingId} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} FOR UPDATE`;
      const b = bk[0];
      if (!b) return abort("NOT_FOUND");
      if (b.status === "EXPIRED" || b.status === "CANCELLED" || b.piiPurgedAt) return abort("STATE_CONFLICT", { reason: "BOOKING_CLOSED" });
      const items = await tx.$queryRaw<{ id: string; qty: number }[]>`
        SELECT "id", "qty" FROM "TripBookingItem" WHERE "bookingId" = ${b.id} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} AND "kind" = 'SEAT' AND "active" = true ORDER BY "createdAt", "id"`;
      const have = await tx.$queryRaw<{ itemId: string | null }[]>`
        SELECT "itemId" FROM "TripPassenger" WHERE "bookingId" = ${b.id} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId}`;
      const seats = items.reduce((t, x) => t + x.qty, 0);
      const need = Math.max(0, Math.min(seats, 1000) - have.length);
      const used = new Map<string, number>();
      for (const h of have) if (h.itemId) used.set(h.itemId, (used.get(h.itemId) ?? 0) + 1);
      const rows: { tenantId: string; unitId: string; bookingId: string; itemId: string | null; fullName: string; answers: { v: 1; rev: number; fields: Record<string, never> }; formStatus: string }[] = [];
      for (let i = 0; i < need; i++) {
        const it = items.find((x) => (used.get(x.id) ?? 0) < x.qty);
        if (it) used.set(it.id, (used.get(it.id) ?? 0) + 1);
        rows.push({ tenantId: s.tenantId, unitId: s.unitId, bookingId: b.id, itemId: it?.id ?? null, fullName: "", answers: { v: 1, rev: 0, fields: {} }, formStatus: "PENDING" });
      }
      if (rows.length) {
        await tx.tripPassenger.createMany({ data: rows });
        await auditTx(tx, s, { kind: "USER", userId: s.userId }, A.slots, "TripBooking", b.id, { bookingId: b.id, created: rows.length, total: have.length + rows.length });
      }
      return { created: rows.length, total: have.length + rows.length };
    });
  });
}

export async function updateTripPassenger(ctx: unknown, input: unknown, deps?: { del?: DeleteDeps["del"] }): Promise<SellResult<WriteOut>> {
  return safely("updateTripPassenger", ctx, async () => {
    const p = updateSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    if (!serverKeyOk()) return KEY_MISSING();
    const x = await staffPax(ctx, P_EDIT, p.data.passengerId);
    if (isFailure(x)) return x;
    if (p.data.health && !sensitiveOk(x.s, "trips.passenger.health")) return SENSITIVE();
    const { passengerId: _p, ...req } = p.data;
    return writeCore(x.s, x.P, x.cfg, { via: "STAFF", userId: x.s.userId, m: x.s.m }, req, x.s.now, deps?.del ? { del: deps.del } : undefined);
  });
}

export async function setPassengerFormStatus(ctx: unknown, input: unknown): Promise<SellResult<{ rev: number; formStatus: string }>> {
  return safely("setPassengerFormStatus", ctx, async () => {
    const p = formStatusSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    const d = p.data;
    if ((d.status === "NEEDS_FIX") !== (d.fixReason !== undefined)) return fail("VALIDATION", { fields: ["fixReason"] });
    const x = await staffPax(ctx, P_EDIT, d.passengerId);
    if (isFailure(x)) return x;
    const { s, P } = x;
    const a = parseAnswers(P.answers);
    if (isPurgedAll(a)) return fail("NOT_FOUND", { reason: "PURGED" });
    if (d.expectedRev !== a.rev) return fail("STATE_CONFLICT", { rev: a.rev });
    if (d.status === "VERIFIED" && (P.formStatus === "PENDING" || missingFields(x.cfg.spec, valuesOf(P, a), a).length > 0)) return fail("STATE_CONFLICT", { reason: "FORM_INCOMPLETE" });
    const { fixReason: _drop, ...rest } = a;
    const next: Answers = { ...rest, rev: a.rev + 1, ...(d.status === "NEEDS_FIX" && d.fixReason ? { fixReason: d.fixReason } : {}) };
    return inTx(s, async (tx) => {
      const done = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "TripPassenger" SET "formStatus" = ${d.status}, "answers" = ${JSON.stringify(next)}::jsonb, "updatedAt" = ${iso(s.now)}::timestamp
        WHERE "id" = ${P.id} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} AND COALESCE(("answers"->>'rev')::int, 0) = ${a.rev}
        RETURNING "id"`;
      if (done.length !== 1) return abort("STATE_CONFLICT", { rev: a.rev });
      await auditTx(tx, s, { kind: "USER", userId: s.userId }, A.formStatus, "TripPassenger", P.id, { passengerId: P.id, from: P.formStatus, to: d.status, fixReason: d.fixReason ?? null, rev: next.rev });
      return { rev: next.rev, formStatus: d.status };
    });
  });
}

async function linkable(x: StaffPax): Promise<Failure | null> {
  const a = parseAnswers(x.P.answers);
  if (isPurgedAll(a)) return fail("NOT_FOUND", { reason: "PURGED" });
  if (!bookingOpen(x.P) || x.s.now.getTime() >= new Date(x.P.endsAt).getTime()) return fail("STATE_CONFLICT", { reason: "BOOKING_CLOSED" });
  return null;
}
export async function issuePassengerFormLink(ctx: unknown, input: unknown): Promise<SellResult<{ token: string; expiresAt: string }>> {
  return safely("issuePassengerFormLink", ctx, async () => {
    const p = passengerIdSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    if (!serverKeyOk()) return KEY_MISSING();
    const x = await staffPax(ctx, P_EDIT, p.data.passengerId);
    if (isFailure(x)) return x;
    const bad = await linkable(x);
    if (bad) return bad;
    const r = await inTx(x.s, (tx) => issueLinkInTx(tx, x.s, { kind: "USER", userId: x.s.userId }, x.P, x.s.now));
    return r.ok ? { ok: true, value: { token: r.value.token, expiresAt: r.value.expiresAt } } : r;
  });
}
export async function issueBookingFormLinks(ctx: unknown, input: unknown): Promise<SellResult<{ links: { passengerId: string; token: string; expiresAt: string }[] }>> {
  return safely("issueBookingFormLinks", ctx, async () => {
    const p = bookingIdSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    if (!serverKeyOk()) return KEY_MISSING();
    const s = await staffGate(ctx, P_EDIT);
    if (isFailure(s)) return s;
    const rows = await loadBookingPax(ro(s.tenantId), s, p.data.bookingId);
    if (!rows.length) {
      const b = await ro(s.tenantId).$queryRaw<{ id: string }[]>`SELECT "id" FROM "TripBooking" WHERE "id" = ${p.data.bookingId} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId}`;
      return b.length ? { ok: true, value: { links: [] } } : NF();
    }
    const first = rows[0];
    if (first && (!bookingOpen(first) || s.now.getTime() >= new Date(first.endsAt).getTime())) return fail("STATE_CONFLICT", { reason: "BOOKING_CLOSED" });
    const live = rows.filter((r) => !isPurgedAll(parseAnswers(r.answers)));
    const r = await inTx(s, async (tx) => {
      const out: { passengerId: string; token: string; expiresAt: string }[] = [];
      for (const P of live) out.push(await issueLinkInTx(tx, s, { kind: "USER", userId: s.userId }, P, s.now));
      return out;
    });
    return r.ok ? { ok: true, value: { links: r.value } } : r;
  });
}
export async function revokePassengerFormLink(ctx: unknown, input: unknown): Promise<SellResult<{ revoked: boolean }>> {
  return safely("revokePassengerFormLink", ctx, async () => {
    const p = passengerIdSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    const x = await staffPax(ctx, P_EDIT, p.data.passengerId);
    if (isFailure(x)) return x;
    const r = await inTx(x.s, (tx) => revokeLinkInTx(tx, x.s, { kind: "USER", userId: x.s.userId }, x.P, x.s.now));
    return r.ok ? { ok: true, value: { revoked: r.value } } : r;
  });
}

export async function recordWitnessedWaiver(ctx: unknown, input: unknown, deps?: { put?: UploadDeps["put"]; del?: DeleteDeps["del"] }): Promise<SellResult<SignOut>> {
  return safely("recordWitnessedWaiver", ctx, async () => {
    const p = witnessedSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    if (!serverKeyOk()) return KEY_MISSING();
    const x = await staffPax(ctx, P_EDIT, p.data.passengerId);
    if (isFailure(x)) return x;
    const d = p.data;
    return signCore(
      x.s,
      x.P,
      x.cfg,
      { via: "STAFF", userId: x.s.userId, m: x.s.m },
      { idempotencyKey: d.idempotencyKey, templateHash: d.templateHash, locale: d.locale, signerName: d.signerName, signerRole: d.signerRole, ...(d.guardian ? { guardian: d.guardian } : {}), ...(d.isMinorDeclared !== undefined ? { isMinorDeclared: d.isMinorDeclared } : {}) },
      x.s.now,
      d.signatureImage ? { contentType: d.signatureImage.contentType, data: d.signatureImage.data } : null,
      deps,
    );
  });
}

export async function uploadPassengerDocumentStaff(ctx: unknown, input: unknown, deps?: { put?: UploadDeps["put"]; del?: DeleteDeps["del"] }): Promise<SellResult<UploadOut>> {
  return safely("uploadPassengerDocumentStaff", ctx, async () => {
    const p = uploadStaffSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    if (!serverKeyOk()) return KEY_MISSING();
    const x = await staffPax(ctx, P_EDIT, p.data.passengerId);
    if (isFailure(x)) return x;
    if (p.data.kind === "MEDICAL" && !sensitiveOk(x.s, "trips.passenger.health")) return SENSITIVE();
    return uploadCore(x.s, x.P, x.cfg, { via: "STAFF", userId: x.s.userId, m: x.s.m }, { idempotencyKey: p.data.idempotencyKey, kind: p.data.kind, contentType: p.data.contentType, bytes: p.data.data }, deps);
  });
}

/** พนักงานขอลิงก์ไฟล์ — ใน tx เดียว: ตรวจแถว → TripDocView STAFF → commit → privateFileUrl (TTL 300 · ออกหลัง commit เท่านั้น) */
export async function passengerDocumentUrl(ctx: unknown, input: unknown): Promise<SellResult<{ url: string; expiresInSec: number }>> {
  return safely("passengerDocumentUrl", ctx, async () => {
    const p = staffUrlSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    const s = await staffGate(ctx, P_VIEW);
    if (isFailure(s)) return s;
    if (!serverKeyOk()) return KEY_MISSING();
    const r = await inTx(s, async (tx) => {
      const rows = await tx.$queryRaw<DocRow[]>`
        SELECT "id", "passengerId", "kind", "fileId", "retainUntil", "deletedAt", "createdAt" FROM "TripDocument"
        WHERE "id" = ${p.data.documentId} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId}`;
      const d = rows[0];
      if (!d) return abort("NOT_FOUND");
      if (d.deletedAt) return abort("NOT_FOUND", { reason: "PURGED" });
      if (d.kind === "MEDICAL" && !sensitiveOk(s, "trips.passenger.health")) return abort("FORBIDDEN", { reason: "SENSITIVE_PERMISSION" });
      await tx.tripDocView.create({ data: { tenantId: s.tenantId, unitId: s.unitId, documentId: d.id, viewerKind: "STAFF", viewerId: s.userId, purpose: p.data.purpose, at: s.now }, select: { id: true } });
      return d.fileId;
    });
    if (!r.ok) return r;
    return { ok: true, value: { url: privateFileUrl(r.value, { kind: "STAFF", id: s.userId }, 300), expiresInSec: URL_TTL_SEC } };
  });
}

/** เปิดค่าเต็ม (เลขเอกสาร/สุขภาพ) — สิทธิ์แคบ · audit revealed (ไม่มีค่า) ใน tx ก่อนคืนค่า (แบบ hotel/guest.ts) */
export async function revealPassengerData(ctx: unknown, input: unknown): Promise<SellResult<{ docNumber: string | null } | { health: { allergies: string | null; conditions: string | null } }>> {
  return safely("revealPassengerData", ctx, async () => {
    const p = revealSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    const s = await staffGate(ctx, P_VIEW);
    if (isFailure(s)) return s;
    const P = await loadPax(ro(s.tenantId), s.tenantId, s.unitId, p.data.passengerId);
    if (!P) return NF();
    const what = p.data.what;
    if (!sensitiveOk(s, what === "HEALTH" ? "trips.passenger.health" : "trips.passenger.reveal")) return SENSITIVE();
    const a = parseAnswers(P.answers);
    if (isPurgedAll(a)) return fail("NOT_FOUND", { reason: "PURGED" });
    let value: { docNumber: string | null } | { health: { allergies: string | null; conditions: string | null } };
    if (what === "DOC_NUMBER") {
      if (!P.docNumberEnc && a.purged?.stages.includes("DOC_NUMBER")) return fail("NOT_FOUND", { reason: "PURGED" });
      const n = openDocNumber(s, P.id, P.docNumberEnc);
      if (n === "LOCKED") return fail("BUSY", { reason: "SECRET_KEY_MISSING" });
      value = { docNumber: n };
    } else {
      if (a.health && a.health.status !== "PROVIDED" && a.health.status !== "DECLINED") return fail("NOT_FOUND", { reason: "PURGED" });
      const h = openHealth(s, P.id, a.health);
      if (h === "LOCKED") return fail("BUSY", { reason: "SECRET_KEY_MISSING" });
      value = { health: h ?? { allergies: null, conditions: null } };
    }
    const r = await inTx(s, (tx) => auditTx(tx, s, { kind: "USER", userId: s.userId }, A.revealed, "TripPassenger", P.id, { passengerId: P.id, what, purpose: p.data.purpose }));
    if (!r.ok) return r;
    return { ok: true, value };
  });
}

export async function withdrawHealthConsentStaff(ctx: unknown, input: unknown, deps?: { del?: DeleteDeps["del"] }): Promise<SellResult<WithdrawOut>> {
  return safely("withdrawHealthConsentStaff", ctx, async () => {
    const p = withdrawStaffSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    if (!serverKeyOk()) return KEY_MISSING();
    const x = await staffPax(ctx, P_EDIT, p.data.passengerId);
    if (isFailure(x)) return x;
    return withdrawCore(x.s, x.P, x.cfg, { via: "STAFF", userId: x.s.userId, m: x.s.m }, { idempotencyKey: p.data.idempotencyKey, mode: p.data.mode }, x.s.now, deps?.del ? { del: deps.del } : undefined);
  });
}
// ── /T0.8 passengers ──
