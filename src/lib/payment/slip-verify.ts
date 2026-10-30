// ─────────────────────────────────────────────────────────────
// payment/slip-verify.ts — ตรวจสลิปโอนเงินกลาง (SVC R0.6 · CC §3 · ใบสั่ง svc-brief-r0.6.md) — ฝั่งเซิร์ฟเวอร์เท่านั้น
//
// มติเจ้าของ: ตรวจอัตโนมัติ = ตัวต่อที่ร้านสมัครเอง · **ไม่เชื่อม = ตรวจมือเสมอ** (ไม่อนุมัติ/ปฏิเสธเอง นอกจากซ้ำชัดเจน)
// 🔴 ไม่มีผลเงินในไฟล์นี้ — อนุมัติ = outbox `payment.slip.approved` เท่านั้น (consumer เงินของโดเมน B.8 / D.10)
// 🔴 ไม่ import POS/บัญชี · ไม่แตะสลิปของ POS (X-POS.1) · ตัวต่อผ่าน getIntegration + callIntegration เท่านั้น
// 🔴 PII (carry R0.6 · X8): payerName เก็บแบบย่อ (maskPayerName) · verifierResult เก็บเฉพาะคีย์ในรายการอนุญาต ·
//    ชื่อเต็ม/expectedPayerNames ห้ามลง DB/log/event/console · ผลคืนไม่มี URL/path ไฟล์ (X10: ลิงก์ชั่วคราวผ่าน slipFileUrl เท่านั้น)
// 🔴 ซ้ำ: unique บางส่วน (tenantId,imageHash) / (tenantId,transRef) WHERE status <> 'REJECTED' — ชน (P2002/23505) ⇒
//    อ่านใหม่ → key เดียวกัน = replay · ไม่ใช่ = เขียนเป็น REJECTED ตามดัชนีที่ชน (ไม่โยนไปหาผู้เรียก)
//    เลขอ้างอิงเก็บ/เทียบในรูปมาตรฐาน canonTransRef เสมอ (QR · ตัวต่อ · พนักงานกรอก)
// ค่าตั้ง: payments.slip.* ผ่าน resolveSettings (UNIT→TENANT) · deps.policy (ฝั่งเซิร์ฟเวอร์/ข้อสอบเท่านั้น) ทับผลสุดท้าย ·
//   ตัวต่อล่มใช้ TenantIntegration.onFailure (fallback ของ callIntegration) — ไม่อ่าน payments.slip.onVerifierDown (หนี้ R0.3/R0.4)
// ชนิด/ค่าคงที่/ฟังก์ชันบริสุทธิ์อยู่ที่ slip-shared.ts (client import ได้) — re-export ทั้งหมดจากไฟล์นี้
// ─────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { callIntegration, getIntegration, providerDef, type SlipVerifyResult } from "@/lib/core/integrations";
import { resolveSettings } from "@/lib/core/settings";
import { deleteFileAsset, storageEnabled, uploadFile, type DeleteDeps, type UploadDeps } from "@/lib/storage/service";
import { privateFileUrl } from "@/lib/storage/private-links";
import { receiverFor, type Receiver } from "./receiver";
import {
  canonTransRef,
  isSlipDomain,
  isSlipReason,
  isSlipStatus,
  maskPayerName,
  parseSlipQr,
  payerNameMatches,
  receiverMatches,
  SLIP_DOMAIN_REF,
  SLIP_EVENTS,
  SLIP_FUTURE_SKEW_MS,
  SLIP_MAX_BYTES,
  SLIP_POLICY_DEFAULTS,
  SLIP_REVIEW_KEY,
  SLIP_VERIFY_TIMEOUT_MS,
  SLIP_VIEW_TTL_SEC,
  type SlipActor,
  type SlipCheckItem,
  type SlipCheckKey,
  type SlipCheckState,
  type SlipCtx,
  type SlipDecision,
  type SlipDomain,
  type SlipPolicy,
  type SlipReason,
  type SlipRefType,
  type SlipRefusal,
  type SlipRefusalCode,
  type SlipStatus,
  type SlipView,
} from "./slip-shared";

export * from "./slip-shared";

// ═══════════════ ชนิดของฟังก์ชันฐานข้อมูล ═══════════════
export type SubmitSlipInput = {
  unitId: string;
  domain: SlipDomain;
  refType: SlipRefType;
  refId: string;
  partyId?: string;
  file: { data: Uint8Array; contentType: string };
  /** ข้อความใน QR ของสลิป (อ่านฝั่ง client) — เซิร์ฟเวอร์ไม่ถอดรูป */
  qrPayload?: string;
  /** 🔴 ผู้เรียกคำนวณจากบิล/การจองฝั่งเซิร์ฟเวอร์ — ห้ามรับจาก client */
  expectedSatang: number;
  /** ชื่อผู้จ่ายที่คาด (ใช้เทียบเท่านั้น — 🔴 ห้ามเก็บ/บันทึก) */
  expectedPayerNames?: string[];
  idempotencyKey: string;
};
/**
 * 🔴 deps ทั้งก้อน (โดยเฉพาะ `policy`) เป็นของผู้เรียกฝั่งเซิร์ฟเวอร์/ข้อสอบเท่านั้น —
 *    route/server action ห้ามส่งต่อค่าจาก request มาที่นี่ (ไม่งั้นลูกค้าเปิด autoApprove/tolerance ให้ตัวเองได้)
 */
export type SubmitSlipDeps = {
  put?: UploadDeps["put"];
  /** ลบวัตถุที่อัปแล้วแต่ไม่ได้ใช้ (แพ้ replay / ล้มหลังอัป) — คู่กับ put ที่ฉีด */
  del?: DeleteDeps["del"];
  now?: Date;
  /** ทับนโยบายจากค่าตั้ง — ฝั่งเซิร์ฟเวอร์/ข้อสอบเท่านั้น ห้ามรับจาก request */
  policy?: Partial<SlipPolicy>;
  /** ปริยาย 8000 */
  verifyTimeoutMs?: number;
};
export type SubmitSlipResult = { ok: true; slipId: string; status: SlipStatus; reasons: SlipReason[]; replayed?: true } | SlipRefusal;

/** transRef: บังคับเมื่ออนุมัติสลิปที่ยังไม่มีเลขอ้างอิง (ทางมือ) — พนักงานกรอกจากสลิป */
export type DecideSlipInput = { decision: SlipDecision; amountSatang?: number; reason: string; transRef?: string };
export type DecideSlipResult = { ok: true; slipId: string; status: "APPROVED" | "REJECTED" } | SlipRefusal;
export type SlipQueueFilter = { unitId: string; domain?: SlipDomain; status?: SlipStatus | SlipStatus[] };
export type SlipQueueResult = { ok: true; items: SlipView[] } | SlipRefusal;
export type SlipFileUrlResult = { ok: true; url: string; expiresAt: string } | SlipRefusal;

// ═══════════════ ค่าคงที่ภายใน ═══════════════
const CHECK_KEYS: readonly SlipCheckKey[] = ["amount", "transRef", "receiver", "age", "payerName"];
const VERIFIER_RESULT_KEYS = ["status", "amountSatang", "transRef", "transferredAt", "receiverMasked", "providerRef"] as const;
const POLICY_KEYS = {
  autoApprove: "payments.slip.autoApprove",
  toleranceSatang: "payments.slip.toleranceSatang",
  payerNameMatch: "payments.slip.payerNameMatch",
  maxAgeHours: "payments.slip.maxAgeHours",
} as const;
/** คอลัมน์ Int (int32) */
const INT_MAX = 2_147_483_647;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const KEY_RE = /^[A-Za-z0-9_:-]{8,128}$/;
const QR_MAX = 4096;
const REASON_MAX = 500;
const QUEUE_LIMIT = 200;
const IMAGE_TYPES: Readonly<Record<string, { ext: string; magic: (b: Uint8Array) => boolean }>> = {
  "image/jpeg": { ext: "jpg", magic: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", magic: (b) => b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x) },
  "image/webp": {
    ext: "webp",
    magic: (b) => b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
  },
};

const MESSAGES: Record<SlipRefusalCode, string> = {
  NOT_FOUND: "ไม่พบรายการนี้",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ตรวจสลิปของสาขานี้ — ให้เจ้าของร้านเปิดสิทธิ์ \"ตรวจ/อนุมัติสลิปโอนเงิน\"",
  VALIDATION: "ข้อมูลที่ส่งมายังไม่ครบหรือไม่ถูกต้อง",
  INVALID_STATE: "สลิปนี้ตัดสินไปแล้ว หรืออยู่ในสถานะที่ตัดสินไม่ได้",
  IDEMPOTENCY_CONFLICT: "รายการนี้ถูกส่งไปแล้วด้วยข้อมูลอื่น — เริ่มส่งใหม่อีกครั้ง",
  STORAGE_NOT_CONFIGURED: "ระบบยังไม่ได้ตั้งที่เก็บไฟล์ จึงรับสลิปไม่ได้ในตอนนี้ — แจ้งผู้ดูแลระบบ",
  NO_RECEIVER: "ร้านยังไม่ได้ตั้งบัญชีพร้อมเพย์สำหรับรับเงิน",
  DUPLICATE: "เลขอ้างอิงการโอนนี้ถูกใช้กับสลิปอื่นแล้ว — ตรวจสลิปอีกครั้ง",
  UNKNOWN: "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง",
};
const refuse = (code: SlipRefusalCode, message?: string): SlipRefusal => ({ ok: false, code, message: message ?? MESSAGES[code] });

// ═══════════════ ตัวช่วยเล็ก ═══════════════
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const errName = (e: unknown) => (e instanceof Error ? e.name : "Error");
function ascii(b: Uint8Array, from: number, to: number): string {
  let s = "";
  for (let i = from; i < to; i++) s += String.fromCharCode(b[i] ?? 0);
  return s;
}
const reasonsOf = (s: string | null | undefined): SlipReason[] => (s ? s.split(",").filter(isSlipReason) : []);
const reasonText = (r: readonly SlipReason[]): string | null => (r.length ? r.join(",") : null);
const sha256hex = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** ฐานปฏิเสธแถวซ้ำ (partial UNIQUE) — P2002 ของ Prisma หรือ 23505 ที่ driver adapter ห่อมา */
function isUniqueViolation(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const x = e as { code?: unknown; meta?: { driverAdapterError?: { cause?: { originalCode?: unknown; code?: unknown } } }; message?: unknown };
  if (x.code === "P2002") return true;
  const c = x.meta?.driverAdapterError?.cause;
  if (c && (c.originalCode === "23505" || c.code === "23505")) return true;
  return typeof x.message === "string" && /23505|Unique constraint failed/i.test(x.message);
}

function ctxOf(ctx: unknown): SlipCtx | null {
  return isRec(ctx) && typeof ctx.tenantId === "string" && ID_RE.test(ctx.tenantId) ? { tenantId: ctx.tenantId } : null;
}

async function unitOfTenant(tenantId: string, unitId: unknown): Promise<boolean> {
  if (typeof unitId !== "string" || !ID_RE.test(unitId)) return false;
  return (await prisma.businessUnit.count({ where: { id: unitId, tenantId } })) === 1;
}

// ═══════════════ นโยบาย ═══════════════
const POLICY_OK = {
  autoApprove: (v: unknown): v is boolean => typeof v === "boolean",
  toleranceSatang: (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 100_000_000,
  payerNameMatch: (v: unknown): v is SlipPolicy["payerNameMatch"] => v === "OFF" || v === "WARN" || v === "BLOCK",
  maxAgeHours: (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 1 && v <= 720,
};

function applyPolicy(base: SlipPolicy, src: unknown): SlipPolicy {
  if (!isRec(src)) return base;
  const out: SlipPolicy = { ...base };
  if (POLICY_OK.autoApprove(src.autoApprove)) out.autoApprove = src.autoApprove;
  if (POLICY_OK.toleranceSatang(src.toleranceSatang)) out.toleranceSatang = src.toleranceSatang;
  if (POLICY_OK.payerNameMatch(src.payerNameMatch)) out.payerNameMatch = src.payerNameMatch;
  if (POLICY_OK.maxAgeHours(src.maxAgeHours)) out.maxAgeHours = src.maxAgeHours;
  return out;
}

/** นโยบายของสาขา: ค่าปริยาย ← ค่าตั้ง payments.slip.* (UNIT→TENANT) ← deps.policy (ฝั่งเซิร์ฟเวอร์เท่านั้น) */
async function policyFor(ctx: SlipCtx, unitId: string, over: unknown): Promise<SlipPolicy> {
  let fromSettings: Record<string, unknown> = {};
  try {
    const r = await resolveSettings(ctx, Object.values(POLICY_KEYS), { unitId });
    fromSettings = Object.fromEntries(Object.entries(POLICY_KEYS).map(([k, key]) => [k, r[key]?.value]));
  } catch (e) {
    console.error("[payment.slip] settings", errName(e));
  }
  return applyPolicy(applyPolicy({ ...SLIP_POLICY_DEFAULTS }, fromSettings), over);
}

// ═══════════════ submit: ตรวจ input ═══════════════
type ParsedSubmit = {
  unitId: string;
  domain: SlipDomain;
  refType: SlipRefType;
  refId: string;
  partyId: string | null;
  data: Uint8Array;
  contentType: string;
  ext: string;
  qrPayload: string | null;
  expectedSatang: number;
  expectedPayerNames: string[];
  idempotencyKey: string;
};

function parseSubmit(input: unknown): ParsedSubmit | SlipRefusal {
  if (!isRec(input)) return refuse("VALIDATION");
  const { unitId, domain, refType, refId, partyId, file, qrPayload, expectedSatang, expectedPayerNames, idempotencyKey } = input;
  if (typeof unitId !== "string" || !ID_RE.test(unitId)) return refuse("NOT_FOUND");
  if (!isSlipDomain(domain) || SLIP_DOMAIN_REF[domain] !== refType) return refuse("VALIDATION", "ประเภทรายการกับประเภทเอกสารอ้างอิงไม่เข้าคู่กัน");
  if (typeof refId !== "string" || refId.length < 1 || refId.length > 64 || refId.trim() !== refId) return refuse("VALIDATION", "เลขอ้างอิงรายการไม่ถูกต้อง");
  if (partyId !== undefined && partyId !== null && (typeof partyId !== "string" || !ID_RE.test(partyId))) return refuse("VALIDATION");
  if (typeof expectedSatang !== "number" || !Number.isSafeInteger(expectedSatang) || expectedSatang < 1 || expectedSatang > INT_MAX) {
    return refuse("VALIDATION", "ยอดที่ต้องชำระไม่ถูกต้อง");
  }
  if (typeof idempotencyKey !== "string" || !KEY_RE.test(idempotencyKey)) return refuse("VALIDATION");
  if (qrPayload !== undefined && qrPayload !== null && (typeof qrPayload !== "string" || qrPayload.length > QR_MAX)) return refuse("VALIDATION");
  let names: string[] = [];
  if (expectedPayerNames !== undefined && expectedPayerNames !== null) {
    if (!Array.isArray(expectedPayerNames) || expectedPayerNames.length > 10 || !expectedPayerNames.every((x) => typeof x === "string" && x.length <= 200)) {
      return refuse("VALIDATION");
    }
    names = expectedPayerNames as string[];
  }
  if (!isRec(file) || !(file.data instanceof Uint8Array) || typeof file.contentType !== "string") return refuse("VALIDATION", "แนบรูปสลิป (JPG/PNG/WEBP)");
  const ct = file.contentType.split(";")[0]!.trim().toLowerCase();
  const kind = IMAGE_TYPES[ct];
  const data = file.data;
  if (!kind) return refuse("VALIDATION", "รับเฉพาะรูปสลิป JPG/PNG/WEBP");
  if (data.length === 0) return refuse("VALIDATION", "ไฟล์สลิปว่าง");
  if (data.length > SLIP_MAX_BYTES) return refuse("VALIDATION", "รูปสลิปใหญ่เกิน 5MB — ย่อขนาดก่อนส่ง");
  if (!kind.magic(data)) return refuse("VALIDATION", "ไฟล์ไม่ใช่รูปภาพตามชนิดที่แจ้ง");
  return {
    unitId,
    domain,
    refType: SLIP_DOMAIN_REF[domain],
    refId,
    partyId: typeof partyId === "string" ? partyId : null,
    data,
    contentType: ct,
    ext: kind.ext,
    qrPayload: typeof qrPayload === "string" && qrPayload ? qrPayload : null,
    expectedSatang,
    expectedPayerNames: names,
    idempotencyKey,
  };
}

// ═══════════════ submit: ตัดสิน ═══════════════
type Draft = {
  status: SlipStatus;
  reasons: SlipReason[];
  items: Record<SlipCheckKey, SlipCheckItem>;
  verifier: "NONE" | "SKIPPED" | "DOWN" | "TIMEOUT" | SlipVerifyResult["status"];
  policy: SlipPolicy | null;
  /** ผู้ให้บริการประกาศ checksReceiver ⇒ อนุมัติอัตโนมัติได้ */
  autoCapable: boolean;
  amountSatang: number | null;
  transRef: string | null;
  payerName: string | null;
  bankCode: string | null;
  transferredAt: Date | null;
  verifierIntegrationId: string | null;
  verifierResult: Record<string, string | number> | null;
};

const allItems = (state: SlipCheckState): Record<SlipCheckKey, SlipCheckItem> =>
  Object.fromEntries(CHECK_KEYS.map((k) => [k, { state }])) as Record<SlipCheckKey, SlipCheckItem>;

function blankDraft(qr: { bankCode: string; transRef: string } | null): Draft {
  return {
    status: "NEEDS_REVIEW",
    reasons: [],
    items: allItems("UNKNOWN"),
    verifier: "SKIPPED",
    policy: null,
    autoCapable: false,
    amountSatang: null,
    transRef: qr?.transRef ?? null,
    payerName: null,
    bankCode: qr?.bankCode ?? null,
    transferredAt: null,
    verifierIntegrationId: null,
    verifierResult: null,
  };
}

/** ผลตัวต่อ → เก็บเฉพาะคีย์ที่อนุญาต (ไม่มีชื่อ/รูป) · transRef เก็บรูปมาตรฐาน */
function filterVerifierResult(v: SlipVerifyResult): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const k of VERIFIER_RESULT_KEYS) {
    const x = k === "transRef" ? canonTransRef(v.transRef) : v[k];
    if (typeof x === "string" && x.length <= 200) out[k] = x;
    else if (typeof x === "number" && Number.isFinite(x)) out[k] = x;
  }
  return out;
}

function parseWhen(s: unknown): Date | null {
  if (typeof s !== "string" || !s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

const validAmount = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= INT_MAX ? v : null);

async function liveSlipWith(tenantId: string, where: { imageHash: string } | { transRef: string }, notId?: string): Promise<{ id: string } | null> {
  return prisma.paymentSlip.findFirst({
    where: { tenantId, ...where, status: { not: "REJECTED" }, ...(notId ? { id: { not: notId } } : {}) },
    select: { id: true },
  });
}

/** ข้อ 5–7 ของใบสั่ง — ไม่เขียนฐาน */
async function judge(c: SlipCtx, p: ParsedSubmit, imageHash: string, deps: { now: Date; policy: unknown; timeoutMs: number }): Promise<Draft> {
  const qr = p.qrPayload ? parseSlipQr(p.qrPayload) : null;
  const d = blankDraft(qr);

  // 5. ซ้ำชัดเจน (ทุกสาขาในร้าน) ⇒ REJECTED ทันที · ไม่เรียกตัวต่อ
  if (await liveSlipWith(c.tenantId, { imageHash })) return { ...d, status: "REJECTED", reasons: ["DUPLICATE_IMAGE"] };
  if (qr && (await liveSlipWith(c.tenantId, { transRef: qr.transRef }))) return { ...d, status: "REJECTED", reasons: ["DUPLICATE_TRANSREF"] };

  // 6. ตัวต่อ — ไม่เชื่อม = ตรวจมือเสมอ
  const h = await getIntegration({ tenantId: c.tenantId, unitId: p.unitId }, "SLIP_VERIFY");
  if (!h) return { ...d, verifier: "NONE", reasons: ["UNVERIFIED"] };
  const receiver: Receiver | null = await receiverFor(c, p.unitId);
  const expectReceiver: { promptpayId?: string; bankAccount?: string } = {};
  if (receiver) {
    expectReceiver.promptpayId = receiver.promptpayId;
    if (receiver.bankAccount) expectReceiver.bankAccount = receiver.bankAccount;
  }
  const image = Buffer.from(p.data);
  const qrPayload = p.qrPayload ?? undefined;
  const r = await callIntegration(
    h,
    "slip.verify",
    (a, { signal }) => a.verify({ image, qrPayload }, { amountSatang: p.expectedSatang, receiver: expectReceiver }, { signal }),
    { timeoutMs: deps.timeoutMs },
  );
  // fix 7 ▸ อนุมัติอัตโนมัติได้เฉพาะผู้ให้บริการที่ประกาศว่าตรวจบัญชีผู้รับจริง ◂
  const autoCapable = providerDef("SLIP_VERIFY", h.provider)?.capabilities?.checksReceiver === true;
  const base: Draft = { ...d, verifierIntegrationId: h.integrationId, autoCapable };
  if (!r.ok) {
    // fix 6 ▸ TIMEOUT = ไม่รู้ผล (CC §2.3 ห้ามสรุป) ⇒ ทางมือเสมอ · REJECT ตาม onFailure เฉพาะ PROVIDER_ERROR ชัดเจน ◂
    const reject = r.code === "PROVIDER_ERROR" && r.fallback === "REJECT";
    return { ...base, verifier: r.code === "TIMEOUT" ? "TIMEOUT" : "DOWN", status: reject ? "REJECTED" : "NEEDS_REVIEW", reasons: ["VERIFIER_DOWN"] };
  }

  const v = r.value;
  const statusOk = isRec(v) && (v.status === "VALID" || v.status === "INVALID" || v.status === "DUPLICATE" || v.status === "UNKNOWN");
  if (!statusOk) return { ...base, verifier: "UNKNOWN", reasons: ["VERIFIER_UNKNOWN"] };
  const filtered = filterVerifierResult(v);
  const amount = validAmount(v.amountSatang);
  const when = parseWhen(v.transferredAt);
  const masked = maskPayerName(v.payerName);
  const vRef = canonTransRef(v.transRef);
  const transRef = vRef ?? qr?.transRef ?? null;
  const withData: Draft = { ...base, verifier: v.status, verifierResult: filtered, amountSatang: amount, transferredAt: when, payerName: masked, transRef };

  // เลขอ้างอิงจากตัวต่อซ้ำแถวอื่น ⇒ ซ้ำชัดเจน (ทุกผลตัวต่อ — ดัชนี unique ก็กันอยู่แล้ว)
  if (transRef && transRef !== qr?.transRef && (await liveSlipWith(c.tenantId, { transRef }))) {
    return { ...withData, status: "REJECTED", reasons: ["DUPLICATE_TRANSREF"] };
  }
  if (v.status !== "VALID") {
    // คนตัดสิน — ไม่ปฏิเสธตามคำผู้ให้บริการ (เก็บเลขอ้างอิงของตัวต่อไว้กันใช้ซ้ำ — fix 4)
    const reason: SlipReason = v.status === "INVALID" ? "VERIFIER_INVALID" : v.status === "DUPLICATE" ? "VERIFIER_DUPLICATE" : "VERIFIER_UNKNOWN";
    return { ...withData, reasons: [reason] };
  }

  // 7. ตรวจในระบบ 5 ข้อ
  const policy = await policyFor(c, p.unitId, deps.policy);
  const reasons: SlipReason[] = [];
  const items = allItems("UNKNOWN");
  const fail = (k: SlipCheckKey, reason: SlipReason, warnOnly = false) => {
    items[k] = warnOnly ? { state: "FAIL", reason, warnOnly: true } : { state: "FAIL", reason };
    reasons.push(reason);
  };

  if (!transRef) items.transRef = { state: "UNKNOWN" };
  else if (vRef && qr && vRef !== qr.transRef) fail("transRef", "TRANSREF_MISMATCH");
  else items.transRef = { state: "OK" };

  if (amount === null) items.amount = { state: "UNKNOWN" };
  else if (Math.abs(amount - p.expectedSatang) <= policy.toleranceSatang) items.amount = { state: "OK" };
  else fail("amount", amount < p.expectedSatang ? "AMOUNT_SHORT" : "AMOUNT_OVER");

  if (!receiver) fail("receiver", "RECEIVER_NOT_SET");
  else {
    const m = receiverMatches(v.receiverMasked, receiver);
    if (m === null) items.receiver = { state: "UNKNOWN" };
    else if (m) items.receiver = { state: "OK" };
    else fail("receiver", "RECEIVER_MISMATCH");
  }

  if (!when) items.age = { state: "UNKNOWN" };
  else if (deps.now.getTime() - when.getTime() > policy.maxAgeHours * 3_600_000) fail("age", "TOO_OLD");
  else if (when.getTime() - deps.now.getTime() > SLIP_FUTURE_SKEW_MS) fail("age", "FUTURE_TIME");
  else items.age = { state: "OK" };

  if (policy.payerNameMatch === "OFF") items.payerName = { state: "SKIP" };
  else {
    const m = payerNameMatches(v.payerName, p.expectedPayerNames);
    if (m === null) items.payerName = { state: policy.payerNameMatch === "BLOCK" ? "UNKNOWN" : "SKIP" };
    else if (m) items.payerName = { state: "OK" };
    else fail("payerName", "PAYER_NAME_MISMATCH", policy.payerNameMatch === "WARN");
  }

  if (CHECK_KEYS.some((k) => items[k].state === "UNKNOWN")) reasons.push("DATA_MISSING");
  const blocking = reasons.some((x) => !(x === "PAYER_NAME_MISMATCH" && policy.payerNameMatch === "WARN"));
  const status: SlipStatus = blocking ? "NEEDS_REVIEW" : policy.autoApprove && autoCapable ? "AUTO_APPROVED" : "PENDING";
  return { ...withData, policy, items, reasons, status };
}

// ═══════════════ submit: เขียน ═══════════════
const LITE = { id: true, imageHash: true, status: true, reviewReason: true, unitId: true, domain: true, refType: true, refId: true, expectedSatang: true } as const;
type SlipRowLite = { id: string; imageHash: string; status: string; reviewReason: string | null; unitId: string; domain: string; refType: string; refId: string; expectedSatang: number };

/** fix 2 ▸ replay ต้องตรงทั้งรูป · สาขา · ประเภท · เลขรายการ · ยอดคาด — ต่างข้อใด = IDEMPOTENCY_CONFLICT ◂ */
function replayOf(row: SlipRowLite, p: ParsedSubmit, imageHash: string): SubmitSlipResult {
  const same =
    row.imageHash === imageHash &&
    row.unitId === p.unitId &&
    row.domain === p.domain &&
    row.refType === p.refType &&
    row.refId === p.refId &&
    row.expectedSatang === p.expectedSatang;
  if (!same) return refuse("IDEMPOTENCY_CONFLICT");
  return { ok: true, slipId: row.id, status: isSlipStatus(row.status) ? row.status : "NEEDS_REVIEW", reasons: reasonsOf(row.reviewReason), replayed: true };
}

/** SVC D.0 ▸ ค้นด้วยรูปนิพจน์เดียวกับดัชนี unique "PaymentSlip_tenantId_idempotencyKey_key" (tenantId, (checks->>'idempotencyKey'))
 *  — JSON path ของ Prisma ใช้ดัชนีนี้ไม่ได้ · unique ⇒ มีได้แถวเดียว แล้วอ่านแถวด้วย select LITE เดิม ◂ */
async function findByKey(db: Prisma.TransactionClient | typeof prisma, tenantId: string, key: string): Promise<SlipRowLite | null> {
  const hit = await db.$queryRaw<{ id: string }[]>`SELECT "id" FROM "PaymentSlip" WHERE "tenantId" = ${tenantId} AND ("checks"->>'idempotencyKey') = ${key} LIMIT 1`;
  if (hit.length === 0) return null;
  return db.paymentSlip.findFirst({ where: { id: hit[0].id, tenantId }, select: LITE });
}

type EventInput = { slipId: string; domain: string; refType: string; refId: string; amountSatang: number | null; status: SlipStatus };
async function emitSlipEvent(tx: Prisma.TransactionClient, tenantId: string, unitId: string, kind: keyof typeof SLIP_EVENTS, e: EventInput): Promise<void> {
  // payload พอดี 6 คีย์ (CC §7) — ไม่มีชื่อผู้โอน/รูป/URL
  await emitOutbox(tx, {
    tenantId,
    unitId,
    type: SLIP_EVENTS[kind],
    idempotencyKey: `${SLIP_EVENTS[kind]}:${e.slipId}`,
    payload: { slipId: e.slipId, domain: e.domain, refType: e.refType, refId: e.refId, amountSatang: e.amountSatang, status: e.status },
  });
}

const TX_OPTS = { maxWait: 15_000, timeout: 20_000 } as const;

/** fix 8 ▸ ไฟล์ที่อัปแล้วแต่ไม่มีแถวสลิปอ้าง — ลบทั้งแถว FileAsset และวัตถุ (deleteFileAsset) · ไม่ throw ◂ */
async function discardUpload(c: SlipCtx, fileId: string, del: DeleteDeps["del"] | undefined): Promise<void> {
  try {
    const r = await deleteFileAsset(c, fileId, del ? { del } : undefined);
    // ไม่มีที่เก็บจริง (อัปผ่าน put ที่ฉีด · ไม่มี del) ⇒ วัตถุไม่ได้อยู่บนที่เก็บของเรา — ลบแถวทะเบียนได้เลย
    if (!r.ok && !del && !storageEnabled()) await prisma.fileAsset.deleteMany({ where: { id: fileId, tenantId: c.tenantId } });
  } catch (e) {
    console.error("[payment.slip] discard", errName(e));
  }
}

type Persisted = { result: SubmitSlipResult; discard: boolean };

async function persist(c: SlipCtx, p: ParsedSubmit, imageHash: string, fileId: string, first: Draft): Promise<Persisted> {
  let draft = first;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await prisma.$transaction(async (tx): Promise<Persisted> => {
        // key เดียวกันยิงพร้อมกัน ⇒ เข้าคิวทีละตัว แล้วตัวหลังกลายเป็น replay (ไม่มีแถว/event ซ้ำ)
        await tx.$queryRaw`SELECT count(*)::int AS n FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`payment.slip:${c.tenantId}:${p.idempotencyKey}`}::text, 0))) q`;
        const prior = await findByKey(tx, c.tenantId, p.idempotencyKey);
        if (prior) return { result: replayOf(prior, p, imageHash), discard: true };
        const checks = {
          idempotencyKey: p.idempotencyKey,
          items: draft.items,
          verifier: draft.verifier,
          policy: draft.policy,
          autoCapable: draft.autoCapable,
          qr: p.qrPayload ? (parseSlipQr(p.qrPayload) ? "PARSED" : "UNREADABLE") : "NONE",
        };
        const row = await tx.paymentSlip.create({
          data: {
            tenantId: c.tenantId,
            unitId: p.unitId,
            domain: p.domain,
            refType: p.refType,
            refId: p.refId,
            partyId: p.partyId,
            fileId,
            imageHash,
            transRef: draft.transRef,
            expectedSatang: p.expectedSatang,
            amountSatang: draft.amountSatang,
            payerName: draft.payerName,
            bankCode: draft.bankCode,
            transferredAt: draft.transferredAt,
            checks: checks as Prisma.InputJsonValue,
            verifierIntegrationId: draft.verifierIntegrationId,
            verifierResult: draft.verifierResult ? (draft.verifierResult as Prisma.InputJsonValue) : undefined,
            status: draft.status,
            reviewReason: reasonText(draft.reasons),
          },
          select: { id: true },
        });
        const ev: EventInput = { slipId: row.id, domain: p.domain, refType: p.refType, refId: p.refId, amountSatang: draft.amountSatang, status: draft.status };
        await emitSlipEvent(tx, c.tenantId, p.unitId, "submitted", ev);
        if (draft.status === "AUTO_APPROVED") await emitSlipEvent(tx, c.tenantId, p.unitId, "approved", ev);
        if (draft.status === "REJECTED") await emitSlipEvent(tx, c.tenantId, p.unitId, "rejected", ev);
        return { result: { ok: true, slipId: row.id, status: draft.status, reasons: draft.reasons }, discard: false };
      }, TX_OPTS);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // ชน unique บางส่วน (ยิงพร้อมกัน/ต่างสาขา — carry R0.6) ⇒ อ่านใหม่ ไม่โยนไปหาผู้เรียก
      const prior = await findByKey(prisma, c.tenantId, p.idempotencyKey);
      if (prior) return { result: replayOf(prior, p, imageHash), discard: true };
      if (await liveSlipWith(c.tenantId, { imageHash })) draft = { ...draft, status: "REJECTED", reasons: ["DUPLICATE_IMAGE"] };
      else if (draft.transRef && (await liveSlipWith(c.tenantId, { transRef: draft.transRef }))) draft = { ...draft, status: "REJECTED", reasons: ["DUPLICATE_TRANSREF"] };
      // ไม่พบแถวที่ชน (อีกฝั่งถูกปฏิเสธไปแล้ว) ⇒ ลองเขียนเดิมอีกรอบ
    }
  }
  return { result: refuse("UNKNOWN"), discard: true };
}

/**
 * รับสลิป 1 ใบ — ตรวจ input → unit ของร้าน → replay ตาม key → อัปไฟล์ส่วนตัว → ซ้ำชัดเจน → ตัวต่อ → ตรวจในระบบ 5 ข้อ → เขียน + event (tx เดียว)
 * ล้มก่อนเขียน = ไม่มีแถว/event/ไฟล์ค้าง · คืนคำปฏิเสธ ไม่ throw
 * 🔴 deps (รวม policy) ห้ามมาจาก request
 */
export async function submitSlip(ctx: SlipCtx, input: SubmitSlipInput, deps?: SubmitSlipDeps): Promise<SubmitSlipResult> {
  let uploaded: { c: SlipCtx; fileId: string; del: DeleteDeps["del"] | undefined } | null = null;
  try {
    const c = ctxOf(ctx);
    if (!c) return refuse("NOT_FOUND");
    const p = parseSubmit(input);
    if ("ok" in p) return p;
    const dp = isRec(deps) ? deps : {};
    const put = typeof dp.put === "function" ? (dp.put as UploadDeps["put"]) : undefined;
    const del = typeof dp.del === "function" ? (dp.del as DeleteDeps["del"]) : undefined;
    const now = dp.now instanceof Date && Number.isFinite(dp.now.getTime()) ? dp.now : new Date();
    const t = dp.verifyTimeoutMs;
    const timeoutMs = typeof t === "number" && Number.isFinite(t) && t > 0 ? Math.min(Math.max(Math.floor(t), 50), 30_000) : SLIP_VERIFY_TIMEOUT_MS;

    if (!(await unitOfTenant(c.tenantId, p.unitId))) return refuse("NOT_FOUND");

    const imageHash = sha256hex(p.data);
    const prior = await findByKey(prisma, c.tenantId, p.idempotencyKey);
    if (prior) return replayOf(prior, p, imageHash);

    if (!put && !storageEnabled()) return refuse("STORAGE_NOT_CONFIGURED");
    const up = await uploadFile(
      c,
      { kind: "ATTACHMENT", filename: `slip.${p.ext}`, contentType: p.contentType, data: p.data, maxBytes: SLIP_MAX_BYTES, visibility: "private" },
      put ? { put } : undefined,
    );
    if (!up.ok) return refuse("UNKNOWN", "อัปโหลดรูปสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    uploaded = { c, fileId: up.assetId, del };

    const draft = await judge(c, p, imageHash, { now, policy: dp.policy, timeoutMs });
    const out = await persist(c, p, imageHash, up.assetId, draft);
    if (out.discard) await discardUpload(c, up.assetId, del);
    uploaded = null;
    return out.result;
  } catch (e) {
    console.error("[payment.slip] submit", errName(e));
    if (uploaded) await discardUpload(uploaded.c, uploaded.fileId, uploaded.del);
    return refuse("UNKNOWN");
  }
}

// ═══════════════ สิทธิ์ (Membership สด) ═══════════════
/** 🔴 fix 1 (BLOCKER) ▸ ถอนสิทธิ์ = acceptedAt null ⇒ ไม่ใช่สมาชิก ◂ */
async function membershipOf(tenantId: string, actor: unknown): Promise<MembershipCtx | null> {
  if (!isRec(actor) || typeof actor.userId !== "string" || !actor.userId || actor.userId.length > 128) return null;
  const m = await prisma.membership.findFirst({
    where: { userId: actor.userId, tenantId, acceptedAt: { not: null } },
    select: { role: true, unitAccess: true, permissions: true },
  });
  if (!m) return null;
  return {
    role: m.role,
    unitAccess: Array.isArray(m.unitAccess) ? m.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: isRec(m.permissions) ? m.permissions : {},
  };
}

async function canReview(tenantId: string, actor: unknown, unitId: string): Promise<boolean> {
  return evaluate(await membershipOf(tenantId, actor), { module: "payments", action: SLIP_REVIEW_KEY, unitId });
}

// SVC D.10 ▸ R1 (เพิ่มอย่างเดียว): สลิปโดเมน DORM ตรวจได้ด้วย `dorm.slip.review` (module dorm) นอกจาก payments.slip.review เดิม — โดเมนอ่านจากแถวสลิปเสมอ (ไม่รับจากผู้เรียก)
//   decideSlip/slipFileUrl ประกาศ `canReview` เงาในบล็อกของตัวเอง (ผูกโดเมนของสลิป) เพื่อไม่แตะบรรทัดเดิม ◂
const DORM_SLIP_REVIEW_KEY = "dorm.slip.review";
function reviewOfSlip(domain: string) {
  return async (tenantId: string, actor: unknown, unitId: string): Promise<boolean> =>
    (await canReview(tenantId, actor, unitId)) || (domain === "DORM" && evaluate(await membershipOf(tenantId, actor), { module: "dorm", action: DORM_SLIP_REVIEW_KEY, unitId }));
}

// ═══════════════ decideSlip ═══════════════
/**
 * คนตัดสินสลิป (PENDING/NEEDS_REVIEW เท่านั้น) — APPROVE · APPROVE_PARTIAL (ยอด 1..คาด−1) · REJECT · เหตุผลบังคับ
 * APPROVE: ยอด ≥ ยอดคาด และ ≤ max(ยอดคาด, ยอดในสลิป) + toleranceSatang (ต่ำกว่ายอดคาดต้องใช้ APPROVE_PARTIAL)
 * อนุมัติสลิปที่ยังไม่มีเลขอ้างอิง ⇒ ต้องกรอก transRef (ดัชนี unique กันอนุมัติสลิปเดียวกันซ้ำ ⇒ DUPLICATE)
 * กันพร้อมกัน: updateMany ตามสถานะ — ชนะได้ทางเดียว · tx เดียว: สถานะ + outbox + AuditLog
 */
export async function decideSlip(actor: SlipActor, ctx: SlipCtx, slipId: string, input: DecideSlipInput): Promise<DecideSlipResult> {
  try {
    const c = ctxOf(ctx);
    if (!c || typeof slipId !== "string" || !ID_RE.test(slipId)) return refuse("NOT_FOUND");
    const slip = await prisma.paymentSlip.findFirst({ where: { id: slipId, tenantId: c.tenantId } });
    if (!slip) return refuse("NOT_FOUND");
    const canReview = reviewOfSlip(slip.domain); // SVC D.10 ▸ R1 ◂
    if (!(await canReview(c.tenantId, actor, slip.unitId))) return refuse("PERMISSION_DENIED");

    if (!isRec(input)) return refuse("VALIDATION");
    const decision = input.decision;
    if (decision !== "APPROVE" && decision !== "APPROVE_PARTIAL" && decision !== "REJECT") return refuse("VALIDATION", "เลือกได้ว่า อนุมัติ · อนุมัติบางส่วน · หรือปฏิเสธ");
    const reason = typeof input.reason === "string" ? input.reason.normalize("NFKC").trim() : "";
    if (!reason || reason.length > REASON_MAX) return refuse("VALIDATION", `ใส่เหตุผลการตัดสิน 1–${REASON_MAX} ตัวอักษร`);
    const amt = input.amountSatang;
    const intIn = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= lo && v <= hi;
    let approved: number | null = null;
    if (decision === "APPROVE_PARTIAL") {
      if (!intIn(amt, 1, slip.expectedSatang - 1)) return refuse("VALIDATION", "ยอดที่รับบางส่วนต้องมากกว่า 0 และน้อยกว่ายอดที่ต้องชำระ");
      approved = amt;
    } else if (decision === "APPROVE") {
      if (amt !== undefined && amt !== null && !intIn(amt, 1, INT_MAX)) return refuse("VALIDATION", "ยอดที่อนุมัติไม่ถูกต้อง");
      const want = typeof amt === "number" ? amt : (slip.amountSatang ?? slip.expectedSatang);
      // fix 3 ▸ ต่ำกว่ายอดคาด ⇒ ต้องอนุมัติบางส่วน · เพดาน = max(ยอดคาด, ยอดในสลิป) + tolerance ของสาขา ◂
      if (want < slip.expectedSatang) return refuse("VALIDATION", "ยอดต่ำกว่าบิล ต้องอนุมัติบางส่วน");
      const policy = await policyFor(c, slip.unitId, undefined);
      const cap = Math.max(slip.expectedSatang, slip.amountSatang ?? 0) + policy.toleranceSatang;
      if (want > cap) return refuse("VALIDATION", "ยอดที่อนุมัติสูงกว่ายอดในสลิปและยอดที่ต้องชำระ");
      approved = want;
    } else if (amt !== undefined && amt !== null) {
      return refuse("VALIDATION");
    }

    // fix 4/5 ▸ เลขอ้างอิง: อนุมัติสลิปที่ยังไม่มี ⇒ บังคับกรอก (รูปมาตรฐาน) · มีแล้วแต่กรอกต่าง ⇒ VALIDATION ◂
    let newRef: string | null = null;
    if (decision !== "REJECT") {
      const given = input.transRef === undefined || input.transRef === null || input.transRef === "" ? null : canonTransRef(input.transRef);
      if (input.transRef !== undefined && input.transRef !== null && input.transRef !== "" && !given) return refuse("VALIDATION", "เลขอ้างอิงการโอนไม่ถูกต้อง (ตัวอักษร/ตัวเลข 6–64 ตัว)");
      if (!slip.transRef) {
        if (!given) return refuse("VALIDATION", "ใส่เลขอ้างอิงการโอนจากสลิปก่อนอนุมัติ");
        newRef = given;
      } else if (given && given !== slip.transRef) {
        return refuse("VALIDATION", "เลขอ้างอิงที่กรอกไม่ตรงกับเลขในสลิป");
      }
    }

    if (slip.status !== "PENDING" && slip.status !== "NEEDS_REVIEW") return refuse("INVALID_STATE");
    if (newRef && (await liveSlipWith(c.tenantId, { transRef: newRef }, slip.id))) return refuse("DUPLICATE");
    const status: "APPROVED" | "REJECTED" = decision === "REJECT" ? "REJECTED" : "APPROVED";
    const decided = decision === "APPROVE_PARTIAL" ? { decision, amountSatang: approved, partial: true } : { decision, amountSatang: approved };
    const checks = { ...(isRec(slip.checks) ? slip.checks : {}), decided };
    const userId = (actor as SlipActor).userId;

    let won: boolean;
    try {
      won = await prisma.$transaction(async (tx) => {
        const u = await tx.paymentSlip.updateMany({
          where: { id: slip.id, tenantId: c.tenantId, status: { in: ["PENDING", "NEEDS_REVIEW"] } },
          data: { status, decidedById: userId, decidedAt: new Date(), checks: checks as Prisma.InputJsonValue, ...(newRef ? { transRef: newRef } : {}) },
        });
        if (u.count !== 1) return false;
        await emitSlipEvent(tx, c.tenantId, slip.unitId, status === "APPROVED" ? "approved" : "rejected", {
          slipId: slip.id,
          domain: slip.domain,
          refType: slip.refType,
          refId: slip.refId,
          amountSatang: status === "APPROVED" ? approved : slip.amountSatang,
          status,
        });
        await tx.auditLog.create({
          data: {
            tenantId: c.tenantId,
            actorType: "USER",
            actorId: userId,
            action: "payments.slip.decide",
            targetType: "PaymentSlip",
            targetId: slip.id,
            before: { status: slip.status } as Prisma.InputJsonValue,
            after: { status, decision, amountSatang: approved, partial: decision === "APPROVE_PARTIAL", reason } as Prisma.InputJsonValue,
          },
        });
        return true;
      }, TX_OPTS);
    } catch (e) {
      // ดัชนี unique (tenantId, transRef) ของแถวที่ยังไม่ปฏิเสธ — อนุมัติสลิปเดียวกันซ้ำ (พร้อมกัน) ⇒ DUPLICATE
      if (isUniqueViolation(e)) return refuse("DUPLICATE");
      throw e;
    }
    if (!won) return refuse("INVALID_STATE");
    return { ok: true, slipId: slip.id, status };
  } catch (e) {
    console.error("[payment.slip] decide", errName(e));
    return refuse("UNKNOWN");
  }
}

// ═══════════════ slipQueue ═══════════════
/** คิวตรวจสลิปของสาขา — ค่าปริยาย PENDING + NEEDS_REVIEW · ใหม่สุดก่อน · ไม่มี URL/path ไฟล์ · ชื่อแบบย่อ */
export async function slipQueue(actor: SlipActor, ctx: SlipCtx, filter: SlipQueueFilter): Promise<SlipQueueResult> {
  try {
    const c = ctxOf(ctx);
    if (!c || !isRec(filter)) return refuse("NOT_FOUND");
    if (!(await unitOfTenant(c.tenantId, filter.unitId))) return refuse("NOT_FOUND");
    const unitId = filter.unitId;
    if (!(await canReview(c.tenantId, actor, unitId))) return refuse("PERMISSION_DENIED");
    if (filter.domain !== undefined && !isSlipDomain(filter.domain)) return refuse("VALIDATION");
    let statuses: SlipStatus[] = ["PENDING", "NEEDS_REVIEW"];
    if (filter.status !== undefined) {
      const raw: unknown[] = Array.isArray(filter.status) ? filter.status : [filter.status];
      if (!raw.length || !raw.every(isSlipStatus)) return refuse("VALIDATION");
      statuses = [...new Set(raw as SlipStatus[])];
    }
    const rows = await prisma.paymentSlip.findMany({
      where: { tenantId: c.tenantId, unitId, status: { in: statuses }, ...(filter.domain ? { domain: filter.domain } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: QUEUE_LIMIT,
      select: {
        id: true, unitId: true, domain: true, refType: true, refId: true, status: true, reviewReason: true, expectedSatang: true,
        amountSatang: true, payerName: true, bankCode: true, transferredAt: true, createdAt: true, fileId: true,
      },
    });
    const items: SlipView[] = rows.map((r) => ({
      id: r.id,
      unitId: r.unitId,
      domain: r.domain,
      refType: r.refType,
      refId: r.refId,
      status: isSlipStatus(r.status) ? r.status : "NEEDS_REVIEW",
      reasons: reasonsOf(r.reviewReason),
      expectedSatang: r.expectedSatang,
      amountSatang: r.amountSatang,
      payerName: r.payerName,
      bankCode: r.bankCode,
      transferredAt: r.transferredAt ? r.transferredAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      hasFile: !!r.fileId,
    }));
    return { ok: true, items };
  } catch (e) {
    console.error("[payment.slip] queue", errName(e));
    return refuse("UNKNOWN");
  }
}

// ═══════════════ slipFileUrl ═══════════════
/** ลิงก์ดูรูปสลิปแบบชั่วคราว (≤ 300 วิ · ผูกผู้ดู STAFF:<userId>) — route /api/files/[id] ตรวจลายเซ็น · ไม่มี URL ถาวร (X10) */
export async function slipFileUrl(actor: SlipActor, ctx: SlipCtx, slipId: string): Promise<SlipFileUrlResult> {
  try {
    const c = ctxOf(ctx);
    if (!c || typeof slipId !== "string" || !ID_RE.test(slipId)) return refuse("NOT_FOUND");
    const slip = await prisma.paymentSlip.findFirst({ where: { id: slipId, tenantId: c.tenantId }, select: { id: true, unitId: true, fileId: true } });
    if (!slip) return refuse("NOT_FOUND");
    const canReview = reviewOfSlip((await prisma.paymentSlip.findFirst({ where: { id: slip.id, tenantId: c.tenantId }, select: { domain: true } }))?.domain ?? ""); // SVC D.10 ▸ R1 ◂
    if (!(await canReview(c.tenantId, actor, slip.unitId))) return refuse("PERMISSION_DENIED");
    const file = await prisma.fileAsset.findFirst({ where: { id: slip.fileId, tenantId: c.tenantId }, select: { id: true } });
    if (!file) return refuse("NOT_FOUND", "ไม่พบไฟล์สลิป");
    const url = privateFileUrl(file.id, { kind: "STAFF", id: (actor as SlipActor).userId }, SLIP_VIEW_TTL_SEC);
    const exp = Number(new URL(url, "http://local").searchParams.get("exp"));
    return { ok: true, url, expiresAt: new Date(exp * 1000).toISOString() };
  } catch (e) {
    console.error("[payment.slip] fileUrl", errName(e));
    return refuse("UNKNOWN");
  }
}
