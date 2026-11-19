// ─────────────────────────────────────────────────────────────
// platform/trips-self-core.ts — ตัวช่วยบริสุทธิ์ของ "การจองของฉัน" (ยืนยันเบอร์ผู้จอง → grant → ยกเลิก/ยื่นคำขอคืนเงิน) · RUN TRIPS W1.3a
// ใบสั่ง ledger/trips-briefs/W1.3.md §3.1 (มติ K1–K16 ชนะ)
//
// 🔴 บริสุทธิ์: import type เท่านั้น · ไม่มีนาฬิกา (เวลามาจากผู้เรียก) · ไม่มี env/crypto/ฐาน · ทุกฟังก์ชันไม่ throw
// ─────────────────────────────────────────────────────────────

/** รหัสผลไม่สำเร็จของ platform/trips-self (ใบสั่ง §3.2) */
export const SELF_ERROR_CODES = [
  "NOT_FOUND",
  "RATE_LIMITED",
  "INVALID",
  "VERIFY_FAILED",
  "VERIFY_REQUIRED",
  "NOT_ALLOWED",
  "ACCEPT_REQUIRED",
  "AMOUNT_CHANGED",
  "STATE_CHANGED",
  "TOO_FAST",
  "STALE_FORM",
  "DONE",
  "BUSY",
  "UNAVAILABLE",
] as const;
export type SelfErrorCode = (typeof SELF_ERROR_CODES)[number];

/** เหตุที่ปุ่มจัดการการจองไม่เปิด (มติ K8 K10) */
export const SELF_BLOCKS = ["AGENT", "PENDING", "ENDED", "STARTED", "REFUND_IN_PROGRESS", "REFUND_REJECTED"] as const;
export type SelfBlock = (typeof SELF_BLOCKS)[number];

/** ชนิดการยกเลิกของลูกค้า: ยังไม่จ่าย = ยกเลิกทันที · จ่ายแล้ว = คำขอคืนเงิน · ขายแล้วแต่ยังไม่จ่าย = คำขอยกเลิก (มติ K10 K14) */
export const SELF_CANCEL_KINDS = ["UNPAID", "REFUND_REQUEST", "CANCEL_REQUEST"] as const;
export type SelfCancelKind = (typeof SELF_CANCEL_KINDS)[number];

/** อายุ grant คงที่ 15 นาที (มติ K7 · ไม่อ่านค่าตั้ง X9) */
export const SELF_GRANT_TTL_SEC = 900;
/** ลองเบอร์ผิดได้ 20 ครั้งต่อการจองต่อ 24 ชม. (มติ K6) */
export const SELF_WRONG_PER_BOOKING = 20;
export const SELF_WRONG_WINDOW_SEC = 86_400;
/** grant = `g1.<วินาทีหมดอายุ>.<MAC 22>` */
export const SELF_GRANT_RE = /^g1\.\d{1,12}\.[A-Za-z0-9_-]{22}$/;
/** วัตถุประสงค์ของ nonce ฟอร์ม (ไม่มีเลื่อน/ขอลิงก์ใหม่ · มติ K1) */
export const SELF_NONCE_PURPOSES = ["verify", "cancel"] as const;
export type SelfNoncePurpose = (typeof SELF_NONCE_PURPOSES)[number];

/** คำขอคืนเงินล่าสุดของการจอง (mine = ลูกค้ายื่นเอง · by CUSTOMER) */
export type SelfRefundVM = { status: string; amountSatang: number; mine: boolean };
/** ก้อน "จัดการการจอง" ของหน้าการจอง (ไม่มี id/ข้อมูลบุคคล) */
export type SelfManageVM = { cancel: SelfCancelKind | null; block: SelfBlock | null; refund: SelfRefundVM | null };
export type SelfManage = { cancel: SelfCancelKind | null; block: SelfBlock | null };

const BOOKING_STATUSES: ReadonlySet<string> = new Set(["HOLD", "PENDING", "CONFIRMED", "PART_PAID", "PAID", "EXPIRED", "CANCELLED", "TRAVELLED", "NO_SHOW"]);
const ENDED_STATUSES: ReadonlySet<string> = new Set(["EXPIRED", "CANCELLED", "TRAVELLED", "NO_SHOW"]);
const SOLD_STATUSES: ReadonlySet<string> = new Set(["CONFIRMED", "PART_PAID", "PAID"]);
const REFUND_OPEN: ReadonlySet<string> = new Set(["REQUESTED", "QUOTED", "APPROVED", "EXECUTING", "FAILED", "DONE"]);
const REFUND_KNOWN: ReadonlySet<string> = new Set([...REFUND_OPEN, "REJECTED", "WITHDRAWN"]);
const ENDED: SelfManage = { cancel: null, block: "ENDED" };

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** เวลาเป็นมิลลิวินาที (สตริง ISO หรือ Date) · ผิดรูป ⇒ null */
function msOf(v: unknown): number | null {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
  if (typeof v !== "string" || v.length > 40) return null;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : null;
}
const get = (o: Record<string, unknown>, k: string): unknown => {
  try {
    return o[k];
  } catch {
    return undefined;
  }
};

/**
 * ปุ่มจัดการของการจอง ณ เวลาที่ผู้เรียกส่ง (ใบสั่ง §3.1 · ลำดับตายตัว):
 * เอเจนซี่ ⇒ AGENT · PENDING ⇒ PENDING · จบแล้ว/HOLD หมดตามนาฬิกา ⇒ ENDED · ออกเดินทางแล้ว ⇒ STARTED ·
 * คำขอเปิด ⇒ REFUND_IN_PROGRESS · คำขอของลูกค้าถูกปฏิเสธ ⇒ REFUND_REJECTED · HOLD ⇒ UNPAID · ขายแล้ว: จ่าย > 0 ⇒ REFUND_REQUEST · 0 ⇒ CANCEL_REQUEST
 * อินพุตผิดรูป ⇒ { null, ENDED } (ไม่ throw)
 */
export function selfManageOf(input: unknown): SelfManage {
  try {
    if (!isRec(input)) return ENDED;
    const status = get(input, "status");
    const agent = get(input, "agent");
    const paid = get(input, "paidSatang");
    const refund = get(input, "refund");
    const now = msOf(get(input, "now"));
    const startsAt = msOf(get(input, "startsAt"));
    const holdRaw = get(input, "holdExpiresAt");
    const holdAt = holdRaw === null || holdRaw === undefined ? null : msOf(holdRaw);
    if (typeof status !== "string" || !BOOKING_STATUSES.has(status) || typeof agent !== "boolean") return ENDED;
    if (typeof paid !== "number" || !Number.isSafeInteger(paid) || paid < 0) return ENDED;
    if (now === null || startsAt === null || (holdRaw !== null && holdRaw !== undefined && holdAt === null)) return ENDED;
    let rq: { status: string; mine: boolean } | null = null;
    if (refund !== null && refund !== undefined) {
      if (!isRec(refund)) return ENDED;
      const rs = get(refund, "status");
      if (typeof rs !== "string" || !REFUND_KNOWN.has(rs) || typeof get(refund, "mine") !== "boolean") return ENDED;
      rq = { status: rs, mine: get(refund, "mine") === true };
    }
    if (agent) return { cancel: null, block: "AGENT" };
    if (status === "PENDING") return { cancel: null, block: "PENDING" };
    if (ENDED_STATUSES.has(status)) return ENDED;
    if (status === "HOLD" && (holdAt === null || now >= holdAt)) return ENDED;
    if (now >= startsAt) return { cancel: null, block: "STARTED" };
    if (rq && REFUND_OPEN.has(rq.status)) return { cancel: null, block: "REFUND_IN_PROGRESS" };
    // L3: คำขอที่ร้าน/ระบบยื่นแล้วถูกปฏิเสธ ไม่ปิดสิทธิ์ลูกค้า — ปิดเฉพาะคำขอของลูกค้าเอง (K8)
    if (rq && rq.status === "REJECTED" && rq.mine) return { cancel: null, block: "REFUND_REJECTED" };
    if (status === "HOLD") return { cancel: "UNPAID", block: null };
    if (SOLD_STATUSES.has(status)) return { cancel: paid > 0 ? "REFUND_REQUEST" : "CANCEL_REQUEST", block: null };
    return ENDED;
  } catch {
    return ENDED;
  }
}

/** ข้อเท็จจริงของการจองที่ก้อนจัดการใช้ (จากตัวอ่านของโมดูล · ไม่ออกจากเซิร์ฟเวอร์) */
export type SelfFactsLike = { channel: string; collectMode: string; agentAccountId: string | null; refund: { status: string; amountSatang: number; by: string } | null };
/** "ผ่านเอเจนซี่" (มติ K13): channel ขึ้นต้น AGENT_ · collectMode AGENT · มี agentAccountId */
export function selfIsAgent(f: Pick<SelfFactsLike, "channel" | "collectMode" | "agentAccountId">): boolean {
  return (typeof f.channel === "string" && f.channel.startsWith("AGENT_")) || f.collectMode === "AGENT" || (typeof f.agentAccountId === "string" && f.agentAccountId !== "");
}
/**
 * ก้อน "จัดการการจอง" ของหน้า (selfManageOf + คำขอล่าสุด) — ไม่มีข้อเท็จจริง ⇒ ENDED · คำขอที่ถอนแล้วไม่แสดง
 * `mine` = ลูกค้ายื่นเอง (by CUSTOMER) · คำขอของร้าน/ระบบ ⇒ mine false (ข้อความกลาง · มติ K8)
 */
export function selfManageVMOf(i: { status: string; startsAt: string | null; now: string; holdExpiresAt: string | null; paidSatang: number; facts: SelfFactsLike | null }): SelfManageVM {
  const f = i.facts;
  if (!f) return { cancel: null, block: "ENDED", refund: null };
  const rf = f.refund;
  const mine = rf ? rf.by === "CUSTOMER" : false;
  const m = selfManageOf({ status: i.status, agent: selfIsAgent(f), startsAt: i.startsAt, now: i.now, holdExpiresAt: i.holdExpiresAt, paidSatang: i.paidSatang, refund: rf ? { status: rf.status, mine } : null });
  const show = rf && rf.status !== "WITHDRAWN" && Number.isSafeInteger(rf.amountSatang) ? { status: rf.status, amountSatang: rf.amountSatang, mine } : null;
  return { cancel: m.cancel, block: m.block, refund: show };
}

/**
 * เลขสำคัญของเบอร์ (ตัดรหัสประเทศ 0066/66/+66 และ 0 นำหน้าของเบอร์ในประเทศ) — ทนรูปที่ normalizePartyPhone เก็บไว้ทุกแบบ
 * (0066… ถูกเก็บเป็น 8… · +66… เป็น 0… · มติ L4) · สั้นกว่า 8 หลัก ⇒ null
 */
function phoneDigits(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 60) return null;
  let d = v.replace(/\D/g, "");
  if (d.startsWith("0066")) d = d.slice(4);
  else if (d.startsWith("66") && d.length >= 10) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return d.length >= 8 ? d : null;
}

/** เบอร์ที่ลูกค้าพิมพ์ตรงกับ Party.phoneNorm ของผู้จองไหม (ว่าง/สั้นกว่า 9 หลัก/ไม่ใช่สตริง ⇒ false) */
export function selfPhoneMatches(input: unknown, phoneNorm: unknown): boolean {
  const a = phoneDigits(input);
  const b = phoneDigits(phoneNorm);
  return a !== null && b !== null && a === b;
}

// ═══════════════ พารามิเตอร์ของหน้า my/[token] (ค่าที่อยู่ในรายการเท่านั้น · ไม่สะท้อนค่าอื่น) ═══════════════
/** รหัสใน `e` ของหน้า: รหัสผิด + LOCKED (ถูกล็อกจากการลองเบอร์ผิด · K6) + INVALID_PHONE (เบอร์ผิดรูป · L7 ง) */
export const SELF_PAGE_ERRORS = [...SELF_ERROR_CODES.filter((c) => c !== "DONE" && c !== "NOT_FOUND"), "LOCKED", "INVALID_PHONE"] as const;
export type SelfPageError = (typeof SELF_PAGE_ERRORS)[number];
export const SELF_OUTCOMES = ["CANCELLED", "REFUND_REQUESTED", "CANCEL_REQUESTED"] as const;
export type SelfOutcome = (typeof SELF_OUTCOMES)[number];
export type SelfPageParams = { act: "cancel" | null; grant: string | null; error: SelfPageError | null; done: SelfOutcome | null };
const one = (v: unknown): string | null => (typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : null);
/** `do` `g` `e` `done` จาก searchParams — ผิดรูป ⇒ null */
export function selfPageParams(sp: unknown): SelfPageParams {
  const r = isRec(sp) ? sp : {};
  const act = one(get(r, "do"));
  const g = one(get(r, "g"));
  const e = one(get(r, "e"));
  const d = one(get(r, "done"));
  return {
    act: act === "cancel" ? "cancel" : null,
    grant: g !== null && g.length <= 60 && SELF_GRANT_RE.test(g) ? g : null,
    error: e !== null && (SELF_PAGE_ERRORS as readonly string[]).includes(e) ? (e as SelfPageError) : null,
    done: d !== null && (SELF_OUTCOMES as readonly string[]).includes(d) ? (d as SelfOutcome) : null,
  };
}
/** ลิงก์หน้าการจองพร้อมพารามิเตอร์ของใบนี้ (ผู้เรียกตรวจ slug/token ด้วย bookRedirectOk ก่อน) */
export function selfReservationHref(shopSlug: string, token: string, lang: "th" | "en" | null, q: { act?: "cancel"; grant?: string | null; error?: SelfPageError | null; done?: SelfOutcome | null } = {}): string {
  const parts: string[] = [];
  if (lang === "th" || lang === "en") parts.push(`lang=${lang}`);
  if (q.act === "cancel") parts.push("do=cancel");
  if (q.grant && SELF_GRANT_RE.test(q.grant)) parts.push(`g=${encodeURIComponent(q.grant)}`);
  if (q.error && (SELF_PAGE_ERRORS as readonly string[]).includes(q.error)) parts.push(`e=${q.error}`);
  if (q.done && (SELF_OUTCOMES as readonly string[]).includes(q.done)) parts.push(`done=${q.done}`);
  return `/book/${encodeURIComponent(shopSlug)}/my/${encodeURIComponent(token)}${parts.length ? `?${parts.join("&")}` : ""}`;
}
/** ข้อความสถานะคำขอ (K8): QUOTED/APPROVED/REJECTED/DONE · คำขอของร้าน/ระบบ ⇒ byShop · คำขอยกเลิกยอด 0 ของลูกค้า ⇒ cancelRequested (K10) · `satang` = ยอดของคำขอ (จอไม่คิด) */
export type SelfRefundView = { kind: "QUOTED" | "APPROVED" | "REJECTED" | "byShopRejected" | "DONE" | "byShop" | "cancelRequested"; satang: number };
export function selfRefundView(r: SelfRefundVM): SelfRefundView {
  const satang = r.amountSatang;
  if (r.status === "REJECTED") return { kind: r.mine ? "REJECTED" : "byShopRejected", satang };
  if (r.status === "DONE") return { kind: "DONE", satang };
  if (!r.mine) return { kind: "byShop", satang };
  if (r.status === "APPROVED" || r.status === "EXECUTING" || r.status === "FAILED") return { kind: "APPROVED", satang };
  return { kind: satang === 0 ? "cancelRequested" : "QUOTED", satang };
}
/** ผลที่เพิ่งทำ (จาก ?done) ตรงกับสภาพจริงไหม — ไม่เชื่อพารามิเตอร์อย่างเดียว */
export function selfDoneShown(done: SelfOutcome | null, state: string, r: SelfRefundVM | null): SelfOutcome | null {
  if (done === "CANCELLED") return state === "CANCELLED" ? done : null;
  if (!r || !r.mine) return null;
  if (done === "REFUND_REQUESTED") return r.amountSatang > 0 ? done : null;
  if (done === "CANCEL_REQUESTED") return r.amountSatang === 0 ? done : null;
  return null;
}
/** รหัส `e` ของหน้าจากผลไม่สำเร็จ (ล็อกจากการลองเบอร์ผิด = LOCKED · K6 K15) · DONE/NOT_FOUND ⇒ null */
export function selfPageErrorOf(f: { code: SelfErrorCode; reason?: string; fields?: readonly string[] }): SelfPageError | null {
  if (f.code === "RATE_LIMITED" && f.reason === "LOCKED") return "LOCKED";
  if (f.code === "INVALID" && Array.isArray(f.fields) && f.fields.includes("phone")) return "INVALID_PHONE"; // L7 ง
  return (SELF_PAGE_ERRORS as readonly string[]).includes(f.code) ? (f.code as SelfPageError) : null;
}
/** ผลของหน้ายกเลิกที่ให้ก้อนจัดการบอกเหตุเอง (ปุ่มปิดแล้ว/คำขอเปิด/ไม่พบ) */
export function selfShowsManage(code: SelfErrorCode): boolean {
  return code === "NOT_ALLOWED" || code === "DONE" || code === "NOT_FOUND";
}
