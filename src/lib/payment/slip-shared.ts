// ─────────────────────────────────────────────────────────────
// payment/slip-shared.ts — ชนิด · ค่าคงที่ · ฟังก์ชันบริสุทธิ์ของการตรวจสลิป (SVC R0.6 fix 9)
// 🔴 ไม่มี import ฝั่งเซิร์ฟเวอร์ (prisma/node:*/storage/integrations) — หน้า client (คิวตรวจ D.10/B.8 · ฟอร์มส่งสลิป) import ได้
//    ฟังก์ชันฐานข้อมูลอยู่ที่ slip-verify.ts (re-export ไฟล์นี้ทั้งหมด)
// ─────────────────────────────────────────────────────────────

// ═══════════════ ชนิด ═══════════════
export type SlipCtx = { tenantId: string };
/** 🔴 สิทธิ์อ่านจาก Membership สด (tenantId,userId · acceptedAt ไม่ว่าง) — role/unitAccess/permissions ที่ส่งมาไม่นับ */
export type SlipActor = { userId: string };
export type SlipStatus = "PENDING" | "AUTO_APPROVED" | "NEEDS_REVIEW" | "APPROVED" | "REJECTED";
export type SlipReason =
  | "DUPLICATE_IMAGE"
  | "DUPLICATE_TRANSREF"
  | "AMOUNT_SHORT"
  | "AMOUNT_OVER"
  | "RECEIVER_MISMATCH"
  | "RECEIVER_NOT_SET"
  | "TOO_OLD"
  | "FUTURE_TIME"
  | "PAYER_NAME_MISMATCH"
  | "DATA_MISSING"
  | "UNVERIFIED"
  | "VERIFIER_DOWN"
  | "VERIFIER_INVALID"
  | "VERIFIER_DUPLICATE"
  | "VERIFIER_UNKNOWN"
  | "TRANSREF_MISMATCH";
export type SlipRefusalCode =
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "VALIDATION"
  | "INVALID_STATE"
  | "IDEMPOTENCY_CONFLICT"
  | "STORAGE_NOT_CONFIGURED"
  | "NO_RECEIVER"
  | "DUPLICATE"
  | "UNKNOWN";
/** คืนเสมอ ไม่ throw · ข้อความไทย ไม่โทษผู้ใช้ */
export type SlipRefusal = { ok: false; code: SlipRefusalCode; message: string };
export type SlipPolicy = { autoApprove: boolean; toleranceSatang: number; payerNameMatch: "OFF" | "WARN" | "BLOCK"; maxAgeHours: number };
export type SlipDomain = "BOOKING" | "DORM" | "HOTEL";
export type SlipRefType = "APPT_DEPOSIT" | "DORM_BILL" | "HOTEL_DEPOSIT";
export type SlipCheckState = "OK" | "FAIL" | "UNKNOWN" | "SKIP";
export type SlipCheckKey = "amount" | "transRef" | "receiver" | "age" | "payerName";
export type SlipCheckItem = { state: SlipCheckState; reason?: SlipReason; warnOnly?: true };
export type SlipDecision = "APPROVE" | "APPROVE_PARTIAL" | "REJECT";

export type SlipView = {
  id: string;
  unitId: string;
  domain: string;
  refType: string;
  refId: string;
  status: SlipStatus;
  reasons: SlipReason[];
  expectedSatang: number;
  amountSatang: number | null;
  /** แบบย่อเสมอ (ชื่อต้น + อักษรแรกนามสกุล) */
  payerName: string | null;
  bankCode: string | null;
  transferredAt: string | null;
  createdAt: string;
  hasFile: boolean;
};

// ═══════════════ ค่าคงที่ ═══════════════
export const SLIP_POLICY_DEFAULTS: SlipPolicy = Object.freeze({ autoApprove: false, toleranceSatang: 0, payerNameMatch: "WARN", maxAgeHours: 72 });
export const SLIP_MAX_BYTES = 5 * 1024 * 1024;
export const SLIP_VIEW_TTL_SEC = 300;
export const SLIP_VERIFY_TIMEOUT_MS = 8000;
/** เวลาโอนล้ำ "ตอนนี้" ได้ไม่เกิน (นาฬิกาเครื่องคลาด) */
export const SLIP_FUTURE_SKEW_MS = 10 * 60_000;
export const SLIP_REVIEW_KEY = "payments.slip.review";
export const SLIP_EVENTS = { submitted: "payment.slip.submitted", approved: "payment.slip.approved", rejected: "payment.slip.rejected" } as const;
export const SLIP_DOMAIN_REF: Readonly<Record<SlipDomain, SlipRefType>> = Object.freeze({ BOOKING: "APPT_DEPOSIT", DORM: "DORM_BILL", HOTEL: "HOTEL_DEPOSIT" });
export const SLIP_STATUSES: readonly SlipStatus[] = ["PENDING", "AUTO_APPROVED", "NEEDS_REVIEW", "APPROVED", "REJECTED"];
export const SLIP_ACCEPT_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

/** ป้ายไทยของเหตุผลทุกตัว (หน้าคิวตรวจ/แจ้งลูกค้า) */
export const SLIP_REASON_TH: Readonly<Record<SlipReason, string>> = Object.freeze({
  DUPLICATE_IMAGE: "รูปสลิปนี้เคยส่งมาแล้ว",
  DUPLICATE_TRANSREF: "เลขอ้างอิงการโอนนี้เคยใช้แล้ว",
  AMOUNT_SHORT: "ยอดโอนน้อยกว่ายอดที่ต้องชำระ",
  AMOUNT_OVER: "ยอดโอนมากกว่ายอดที่ต้องชำระ",
  RECEIVER_MISMATCH: "บัญชีผู้รับในสลิปไม่ตรงกับบัญชีของร้าน",
  RECEIVER_NOT_SET: "ร้านยังไม่ได้ตั้งบัญชีรับเงิน",
  TOO_OLD: "สลิปเก่าเกินกำหนด",
  FUTURE_TIME: "เวลาโอนในสลิปล้ำอนาคต",
  PAYER_NAME_MISMATCH: "ชื่อผู้โอนไม่ตรงกับผู้จ่าย",
  DATA_MISSING: "ตรวจได้ไม่ครบ ข้อมูลบางส่วนในสลิปอ่านไม่ได้",
  UNVERIFIED: "ยังไม่ได้เชื่อมระบบตรวจสลิป ต้องให้พนักงานตรวจ",
  VERIFIER_DOWN: "ระบบตรวจสลิปขัดข้อง ต้องให้พนักงานตรวจ",
  VERIFIER_INVALID: "ระบบตรวจสลิปแจ้งว่าสลิปไม่ถูกต้อง",
  VERIFIER_DUPLICATE: "ระบบตรวจสลิปแจ้งว่าสลิปนี้เคยใช้แล้ว",
  VERIFIER_UNKNOWN: "ระบบตรวจสลิปยืนยันผลไม่ได้",
  TRANSREF_MISMATCH: "เลขอ้างอิงใน QR ไม่ตรงกับที่ระบบตรวจสลิปอ่านได้",
});

const REASONS = Object.keys(SLIP_REASON_TH) as SlipReason[];
export const isSlipReason = (x: unknown): x is SlipReason => typeof x === "string" && (REASONS as string[]).includes(x);
export const isSlipStatus = (x: unknown): x is SlipStatus => typeof x === "string" && (SLIP_STATUSES as readonly string[]).includes(x);
export const isSlipDomain = (x: unknown): x is SlipDomain => x === "BOOKING" || x === "DORM" || x === "HOTEL";

// ═══════════════ เลขอ้างอิง (fix 5) ═══════════════
/**
 * รูปมาตรฐานของเลขอ้างอิงการโอน — ตัวพิมพ์ใหญ่ ตัดทุกอย่างที่ไม่ใช่ A-Z0-9 (ใช้ทั้ง QR · ตัวต่อ · ที่พนักงานกรอก ก่อนเทียบและเก็บ)
 * "abc-123" ⇒ "ABC123" · เหลือ < 6 หรือ > 64 ตัว ⇒ null
 */
export function canonTransRef(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const c = v.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length >= 6 && c.length <= 64 ? c : null;
}

// ═══════════════ QR สลิป ═══════════════
const QR_MAX = 4096;
function parseTlv(s: string): Map<string, string> | null {
  const m = new Map<string, string>();
  let i = 0;
  while (i < s.length) {
    const tag = s.slice(i, i + 2);
    const lenText = s.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lenText)) return null;
    const len = Number(lenText);
    if (i + 4 + len > s.length) return null;
    m.set(tag, s.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  return m;
}

/**
 * QR สั้นบนสลิปธนาคารไทย — ชั้นบน tag 00 = TLV ย่อย { 00 = "000001" · 01 = รหัสธนาคาร 3 หลัก · 02 = เลขอ้างอิง }
 * (+ 51 "TH" · 91 CRC — ไม่ตรวจ CRC เพราะผู้ส่งคำนวณใหม่ได้อยู่แล้ว) · เลขอ้างอิงคืนรูปมาตรฐาน · อ่านไม่ได้/ขาด tag ⇒ null ไม่ throw
 */
export function parseSlipQr(payload: unknown): { bankCode: string; transRef: string } | null {
  if (typeof payload !== "string" || !payload || payload.length > QR_MAX) return null;
  const top = parseTlv(payload.trim());
  const inner = top?.get("00");
  if (!inner) return null;
  const sub = parseTlv(inner);
  if (!sub || sub.get("00") !== "000001") return null;
  const bankCode = sub.get("01") ?? "";
  const raw = sub.get("02") ?? "";
  if (!/^\d{3}$/.test(bankCode) || raw.length > 128) return null;
  // รูปมาตรฐานก่อน แล้วค่อยตรวจยาว 6–64 บนผล (ค่ามีขีด/ตัวเล็กยังใช้ได้)
  const transRef = canonTransRef(raw);
  return transRef ? { bankCode, transRef } : null;
}

// ═══════════════ ชื่อผู้โอน ═══════════════
// คำนำหน้า — ตัวยาวก่อน (นางสาว ก่อน นาง · MRS ก่อน MR · MISS ก่อน MS) · แบบมีจุดติดชื่อได้ · แบบไม่มีจุดต้องเว้นวรรค
const PREFIX_RE = /^(?:(?:น\.ส\.|ด\.ช\.|ด\.ญ\.|mrs\.|mr\.|ms\.|miss\.)\s*|(?:นางสาว|นาง|นาย|น\.ส|ด\.ช|ด\.ญ|mrs|mr|ms|miss)\s+)/iu;

function nameTokens(name: unknown): string[] {
  if (typeof name !== "string") return [];
  let s = name.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!s) return [];
  s = s.replace(PREFIX_RE, "").trim();
  return s ? s.split(" ").filter(Boolean) : [];
}
const firstChar = (s: string) => Array.from(s)[0] ?? "";

/** ชื่อแบบย่อเพื่อเก็บ: "นางสาว สมพร ชัยดีเลิศ" ⇒ "สมพร ช." · "MR. JOHN SMITH" ⇒ "JOHN S." · ว่าง ⇒ null */
export function maskPayerName(name: unknown): string | null {
  const t = nameTokens(name);
  const first = t[0]?.replace(/\.+$/, "");
  if (!first) return null;
  const second = t[1]?.replace(/^\.+/, "");
  const init = second ? firstChar(second) : "";
  return init && init !== "." ? `${first} ${init}.` : first;
}

function nameKey(name: unknown): { first: string; init: string | null } | null {
  const t = nameTokens(name);
  const first = t[0]?.replace(/\.+$/, "").toLocaleLowerCase("th");
  if (!first) return null;
  const second = t[1]?.replace(/^\.+/, "");
  const init = second ? firstChar(second).toLocaleLowerCase("th") : "";
  return { first, init: init && init !== "." ? init : null };
}

/**
 * ชื่อในสลิปตรงชื่อที่คาดไหม — ชื่อต้นเท่ากัน (ตัดคำนำหน้า · NFKC · ไม่สนตัวพิมพ์) และถ้าทั้งคู่มีคำที่สอง อักษรแรกเท่ากัน
 * (สลิปที่ธนาคารตัดนามสกุล "น.ส. สมพร ช" ยังตรง) · ไม่มีชื่อฝั่งใดฝั่งหนึ่ง ⇒ null
 */
export function payerNameMatches(slipName: unknown, expectedNames: unknown): boolean | null {
  const a = nameKey(slipName);
  if (!a || !Array.isArray(expectedNames)) return null;
  const keys = expectedNames.map(nameKey).filter((x): x is { first: string; init: string | null } => x !== null);
  if (!keys.length) return null;
  return keys.some((b) => b.first === a.first && (a.init === null || b.init === null || a.init === b.init));
}

/**
 * เลขผู้รับในสลิป (masked) ตรงผู้รับของร้านไหม — ตัวเลขชุดยาวสุดที่เห็น (≥ 4 หลัก) ต้องอยู่ในเลขพร้อมเพย์
 * (รวมรูป 66 + ตัด 0 นำ) หรือเลขบัญชี · ไม่มี masked / เห็น < 4 หลัก / ไม่มีเลขผู้รับ ⇒ null
 */
export function receiverMatches(receiverMasked: unknown, receiver: unknown): boolean | null {
  if (typeof receiverMasked !== "string") return null;
  const runs = receiverMasked.normalize("NFKC").match(/\d+/g) ?? [];
  const longest = runs.reduce((m, r) => (r.length > m.length ? r : m), "");
  if (longest.length < 4) return null;
  if (!receiver || typeof receiver !== "object" || Array.isArray(receiver)) return null;
  const rc = receiver as { promptpayId?: unknown; bankAccount?: unknown };
  const cands: string[] = [];
  if (typeof rc.promptpayId === "string") {
    const d = rc.promptpayId.replace(/\D/g, "");
    if (d) cands.push(d);
    if (d.length === 10 && d.startsWith("0")) cands.push(`66${d.slice(1)}`, `0066${d.slice(1)}`);
  }
  if (typeof rc.bankAccount === "string") {
    const d = rc.bankAccount.replace(/\D/g, "");
    if (d) cands.push(d);
  }
  if (!cands.length) return null;
  return cands.some((c) => c.includes(longest));
}
