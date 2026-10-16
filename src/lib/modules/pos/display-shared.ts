// display-shared.ts — จอลูกค้า (จอที่ 2 · POS P2.10) : ชนิดข้อมูล + ตัวตรวจ/ตัดบริสุทธิ์ + ค่าคงที่ (บรีฟ §2 R1–R8 · §3 · §10 มติ 1–13)
//
// 🔴 ไฟล์นี้ client import ได้ (จอ /d · hook หน้าขาย · DeviceSettings) — ห้าม import prisma/server/next
// 🔴 ชนิดข้อมูลของ display-actions.ts อยู่ที่นี่ (ไฟล์ "use server" export ได้เฉพาะ async function)
// 🔴 DisplayState = ของที่หน้าขายส่ง (คีย์แปลก/QR/ลิงก์ใบเสร็จ/ข้อมูลส่วนตัว = ปฏิเสธทั้งก้อน · มติ 3 6) ·
//    DisplayView = ของที่จอได้ (เซิร์ฟเวอร์สร้าง QR/ลิงก์ใบเสร็จเอง · ตัดแต้มตาม showPoints · หมดอายุ → idle)

export const MAX_DISPLAY_LINES = 20;
export const MAX_DISPLAY_STATE_BYTES = 16384;
/** ความยาวสูงสุดของข้อความทุกช่อง (ตัวอักษร) — ยาวกว่านี้ตัดเหลือ 79 + "…" (มติ 13.5) */
export const MAX_DISPLAY_TEXT = 80;
/** ชื่อต้นบนจอ (คำแรก) ≤ 30 ตัว (มติ 3) */
export const MAX_DISPLAY_FIRST_NAME = 30;
/** บรรทัดส่วนลดสมาชิกบนยอด ≤ 10 */
export const MAX_DISPLAY_MEMBER_LINES = 10;
export const DISPLAY_IDLE_TEXT_MAX = 80;
/** หน้าขายเงียบเกิน 120 วิ = จอกลับหน้าพัก · หน้า "ขอบคุณ" อยู่ 20 วิ (มติ 1 8) */
export const DISPLAY_STALE_MS = 120_000;
export const DISPLAY_DONE_MS = 20_000;
export const DISPLAY_POLL_ACTIVE_MS = 1_000;
export const DISPLAY_POLL_IDLE_MS = 3_000;
/** lastPolledAt เขียนไม่ถี่กว่า 30 วิ · ออนไลน์ = อ่านภายใน 120 วิ */
export const DISPLAY_POLL_WRITE_MS = 30_000;
export const DISPLAY_ONLINE_MS = 120_000;
/** รหัสจับคู่ 8 ตัว Crockford อายุ 10 นาที · ล็อกเมื่อ pairFailCount ถึง 5 (มติ 2 · 13.1) */
export const DISPLAY_PAIR_CODE_LEN = 8;
export const DISPLAY_PAIR_CODE_TTL_MS = 10 * 60_000;
export const DISPLAY_PAIR_FAIL_LIMIT = 5;
export const DISPLAY_PAIR_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/;
export const DISPLAY_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** หน้าขายเขียนไม่ถี่กว่า 1 ครั้ง/วิ · หน่วง 300 มิลลิวิหลัง quote นิ่ง · ส่งซ้ำทุก 60 วิ (กันจอเข้าใจว่าหน้าขายหลุด) · paired:false = ถามใหม่ทุก 5 นาที */
export const DISPLAY_PUBLISH_DEBOUNCE_MS = 300;
export const DISPLAY_PUBLISH_MIN_GAP_MS = 1_000;
export const DISPLAY_PUBLISH_KEEPALIVE_MS = 60_000;
export const DISPLAY_UNPAIRED_RECHECK_MS = 5 * 60_000;
/** stateSeq เป็น int4 */
export const DISPLAY_SEQ_MAX = 2_147_483_647;

export const DISPLAY_COOKIE = "pos_display";
export const DISPLAY_COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "lax", path: "/d", maxAge: 400 * 86_400 } as const;

export type DisplayPhase = "idle" | "cart" | "paying" | "done";
export type DisplayPayMethod = "CASH" | "PROMPTPAY" | "CARD" | "OTHER";
export type DisplayLocale = "th" | "en";

export type DisplayLine = { qty: number; name: string; detail?: string; grossSatang: number; discountSatang?: number; discountLabel?: string };
export type DisplayTotals = {
  subtotalSatang: number;
  lineDiscountSatang: number;
  billDiscountSatang: number;
  coupon?: { code: string; satang: number } | null;
  member?: { kind?: DisplayMemberKind; label: string; satang: number }[]; // POS P2.10 ▸ fix1 F4: kind (ภาพที่ส่ง) · view = label + satang ◂ · POS P2.14 ▸ TL-5: ตัวตรวจภาพที่ส่ง (displayStateSchema) บังคับ kind · ชนิดนี้ใช้ร่วมกับ view (ไม่มี kind) ◂
  serviceChargeSatang: number;
  grandTotalSatang: number;
};
// POS P2.10 ▸ fix1 F4 (มติ fix1 ข้อ 4): ชนิดแถวส่วนลดสมาชิก (= RegisterMemberLine.kind) · ป้ายกลางที่เซิร์ฟเวอร์ใช้แทนป้ายจากหน้าขาย —
//    POINTS เมื่อ showPoints=false ("ใช้ 1,240 แต้ม" บอกจำนวนแต้ม) · VOUCHER ที่ไม่มีชื่อ (wallet ใช้โค้ด voucher แทนชื่อ) ·
//    GIFTCARD เสมอ (ป้ายมีเลขบัตรปิดบัง · มติ 3 ห้ามเลขบัตร) — ไม่เคยแสดงโค้ด voucher / เลขบัตร
export type DisplayMemberKind = "TIER" | "VOUCHER" | "POINTS" | "GIFTCARD";
export const DISPLAY_MEMBER_KINDS: readonly DisplayMemberKind[] = ["TIER", "VOUCHER", "POINTS", "GIFTCARD"];
export const DISPLAY_MEMBER_GENERIC_LABEL: Record<DisplayLocale, { member: string; voucher: string; giftCard: string }> = {
  th: { member: "ส่วนลดสมาชิก", voucher: "คูปอง", giftCard: "บัตรกำนัล" },
  en: { member: "Member discount", voucher: "Voucher", giftCard: "Gift card" },
};
/** ป้ายที่หน้าตาเป็นโค้ด (ตัวใหญ่/ตัวเลข/ขีด ไม่มีช่องว่าง ≥ 4 ตัว) — VOUCHER ที่ป้ายเป็นโค้ด = ไม่มีชื่อ */
export const DISPLAY_VOUCHER_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{3,}$/;
export function displayMemberLabel(m: { kind?: DisplayMemberKind; label: string }, showPoints: boolean, locale: DisplayLocale): string {
  const g = DISPLAY_MEMBER_GENERIC_LABEL[locale];
  if (m.kind === "GIFTCARD") return g.giftCard;
  if (m.kind === "POINTS" && !showPoints) return g.member;
  if (m.kind === "VOUCHER" && (!m.label || DISPLAY_VOUCHER_CODE_RE.test(m.label))) return g.voucher;
  return m.label || g.member;
}
// ◂
export type DisplayStampIn = { name: string; stamps: number; slots: number; toAdd: number };
export type DisplayPayIn = {
  method: DisplayPayMethod;
  dueSatang: number;
  roundSatang: number;
  paidSatang: number;
  remainingSatang: number;
  cashReceivedSatang?: number;
  changeSatang?: number;
  intentId?: string;
};
export type DisplayDoneIn = { receiptNo: string | null; saleId?: string; changeSatang: number; pointsEarned?: number };
/** หน้าขาย → เซิร์ฟเวอร์ (ทุกคีย์ไม่บังคับ ยกเว้น phase · คีย์แปลก = DISPLAY_STATE_INVALID) */
export type DisplayState = {
  phase: DisplayPhase;
  member?: { firstName: string; tier: string | null; points?: number } | null;
  lines?: DisplayLine[];
  moreCount?: number;
  totals?: DisplayTotals | null;
  stamp?: DisplayStampIn | null;
  pay?: DisplayPayIn | null;
  done?: DisplayDoneIn | null;
};

export type DisplayQr = { payload: string | null; amountSatang: number; status: string; intentId: string | null };
/** เซิร์ฟเวอร์ → จอ */
export type DisplayView = {
  phase: DisplayPhase;
  header: { shopName: string; logoUrl: string | null; branch: string; counter: string };
  settings: { showPoints: boolean; idleText: string | null; locale: DisplayLocale };
  member: { firstName: string; tier: string | null; points?: number } | null;
  lines: { qty: number; name: string; detail: string | null; grossSatang: number; discountSatang: number; discountLabel: string | null }[];
  moreCount: number;
  totals: DisplayTotals | null;
  stamp: { name: string; filled: number; slots: number; toAdd: number; near: boolean } | null;
  pay: (Omit<DisplayPayIn, "intentId"> & { qr: DisplayQr | null }) | null;
  done: { receiptNo: string | null; receiptUrl: string | null; changeSatang: number; pointsEarned?: number } | null;
};

// ═══════════ คำปฏิเสธ + ผลลัพธ์ ═══════════
export type DisplayRefusalCode =
  | "DISPLAY_NOT_PAIRED"
  | "PAIR_CODE_INVALID"
  | "DEVICE_NOT_REGISTERED"
  | "DISPLAY_STATE_INVALID"
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "VALIDATION"
  | "INTERNAL";
export type DisplayRefusal = { ok: false; code: DisplayRefusalCode; message: string };
/** คีย์ข้อความ pos.display.errors.<camel> ของรหัส */
export const displayErrorKey = (code: string | undefined): string =>
  `errors.${String(code ?? "INTERNAL").toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())}`;

export type CustomerDisplayStatusView = {
  /** มีแถว ACTIVE ของเครื่องนี้ (เคยกดเปิดและยังไม่ยกเลิก) */
  enabled: boolean;
  paired: boolean;
  pendingCodeExpiresAt: string | null;
  /** รหัสที่รออยู่ถูกล็อก (ผิดครบ 5) — ต้องกดเปิดใหม่ */
  pairLocked: boolean;
  online: boolean;
  lastPolledAt: string | null;
  showPoints: boolean;
  idleText: string | null;
  locale: DisplayLocale | null;
};
export type CustomerDisplayStatusResult = { ok: true; display: CustomerDisplayStatusView } | DisplayRefusal;
export type EnableCustomerDisplayResult = { ok: true; pairCode: string; pairCodeExpiresAt: string; display: CustomerDisplayStatusView } | DisplayRefusal;
export type PairCustomerDisplayResult = { ok: true; token: string; displayId: string } | DisplayRefusal;
export type PublishDisplayStateResult = { ok: true; paired: false } | { ok: true; paired: true; seq: number; written: boolean } | DisplayRefusal;
export type ReadCustomerDisplayResult =
  | { ok: true; changed: false; seq: number; ver: string; nextPollMs: number }
  | { ok: true; changed: true; seq: number; ver: string; view: DisplayView; nextPollMs: number }
  | DisplayRefusal;
export type UpdateCustomerDisplaySettingsInput = { deviceId: string; showPoints?: boolean; idleText?: string | null; locale?: DisplayLocale | null };

// ═══════════ ตัวช่วยบริสุทธิ์ ═══════════
/** ช่วงโพลของจอ (มติ 1): idle 3 วิ · cart/paying/done 1 วิ */
export function nextPollMs(phase: DisplayPhase | string | null | undefined): number {
  return phase === "cart" || phase === "paying" || phase === "done" ? DISPLAY_POLL_ACTIVE_MS : DISPLAY_POLL_IDLE_MS;
}

const chars = (s: string) => [...s];
/** ตัดข้อความให้ ≤ max ตัวอักษร (เกิน = max−1 ตัว + "…") · ตัดช่องว่างหัวท้าย */
export function displayCut(s: string, max = MAX_DISPLAY_TEXT): string {
  const t = s.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  const c = chars(t);
  return c.length <= max ? t : `${c.slice(0, max - 1).join("").trimEnd()}…`;
}
/** ชื่อต้น (คำแรก ≤ 30 ตัว) — ไม่มีนามสกุลบนจอ (มติ 3) */
export function displayFirstName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return displayCut(first, MAX_DISPLAY_FIRST_NAME);
}
// POS P2.10 ▸ fix1 F2 (มติ fix1 ข้อ 2): สมาชิกไม่มีชื่อ → บรีฟสมาชิกใช้รหัสสมาชิกแทนชื่อ (member/profile.ts briefsOf) — ห้ามขึ้นจอ
//    รูปแบบรหัสจริง = member/service.ts randCode: 6 ตัวจาก "ACDEFGHJKLMNPQRSTUVWXY3456789" (ชนกัน 6 รอบ = 8 ตัว) ·
//    + รหัสที่นำเข้าแบบตัวอักษรนำ + ตัวเลขล้วน (เช่น M000123) — ชื่อต้นที่หน้าตาเป็นรหัส = "" (จอทักทายแบบไม่มีชื่อ)
export const DISPLAY_MEMBER_CODE_RES: readonly RegExp[] = [/^[ACDEFGHJKLMNPQRSTUVWXY3-9]{6}(?:[ACDEFGHJKLMNPQRSTUVWXY3-9]{2})?$/, /^[A-Z]{0,3}\d{4,}$/];
export function displayLooksLikeMemberCode(s: string): boolean {
  return DISPLAY_MEMBER_CODE_RES.some((re) => re.test(s));
}
// ◂
/** รหัสจับคู่ที่พิมพ์/สแกน → รูปมาตรฐาน (ตัวใหญ่ · ไม่มีช่องว่าง/ขีด · I L → 1 · O → 0 ตามกติกา Crockford) · ผิดรูป = null */
export function normalizePairCode(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 40) return null;
  const c = raw.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
  return DISPLAY_PAIR_CODE_RE.test(c) ? c : null;
}
/** seq ของการเผยแพร่ = ร้อยมิลลิวินาทีนับจาก 1 ม.ค. 2026 (UTC) — เพิ่มขึ้นเองข้ามการโหลดหน้าใหม่ · พอดี int4 ถึงราวปี 2032 */
const SEQ_EPOCH_MS = Date.UTC(2026, 0, 1);
export function displaySeqNow(nowMs: number, last = 0): number {
  const base = Math.max(1, Math.floor((nowMs - SEQ_EPOCH_MS) / 100));
  return Math.min(DISPLAY_SEQ_MAX, Math.max(base, last + 1));
}
/** แถบสแตมป์บนจอ: filled = min(stamps + toAdd, slots) · near = เหลือ ≤ 2 ช่อง (DESIGN :237 "ใกล้ได้รางวัล") */
export function displayStampView(s: DisplayStampIn): { name: string; filled: number; slots: number; toAdd: number; near: boolean } {
  const filled = Math.min(s.stamps + s.toAdd, s.slots);
  return { name: s.name, filled, slots: s.slots, toAdd: s.toAdd, near: s.slots - filled <= 2 };
}
/** เวลาที่ภาพนี้ยังใช้ได้: เกิน 120 วิ (หน้าขายหลุด) หรือ done เกิน 20 วิ = idle */
export function displayEffectivePhase(phase: DisplayPhase | null | undefined, stateAtMs: number | null, nowMs: number): DisplayPhase {
  if (!phase || phase === "idle" || stateAtMs === null) return "idle";
  const age = nowMs - stateAtMs;
  if (age > DISPLAY_STALE_MS) return "idle";
  if (phase === "done" && age > DISPLAY_DONE_MS) return "idle";
  return phase;
}

// ═══════════ ตัวตรวจ DisplayState (มติ 9 · 13.5) — ตรวจเข้ม: คีย์แปลก/ชนิดผิด = ปฏิเสธทั้งก้อน · ข้อความยาว = ตัด · บรรทัดเกิน 20 = ตัด + moreCount ═══════════
type Parse<T> = { success: true; data: T } | { success: false; error: string };
class Bad extends Error {}
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const PHASES: readonly string[] = ["idle", "cart", "paying", "done"];
const METHODS: readonly string[] = ["CASH", "PROMPTPAY", "CARD", "OTHER"];
const MAX_SATANG = 100_000_000_000; // ≤ 1,000 ล้านบาท

function obj(v: unknown, path: string, allowed: readonly string[]): Record<string, unknown> {
  if (!isRecord(v)) throw new Bad(`${path}: ต้องเป็นออบเจกต์`);
  for (const k of Object.keys(v)) if (!allowed.includes(k) && v[k] !== undefined) throw new Bad(`${path}.${k}: คีย์ไม่รู้จัก`);
  return v;
}
const has = (o: Record<string, unknown>, k: string) => o[k] !== undefined;
function satang(v: unknown, path: string, signed = false): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || Math.abs(v) > MAX_SATANG || (!signed && v < 0)) throw new Bad(`${path}: ต้องเป็นสตางค์จำนวนเต็ม`);
  return v;
}
function count(v: unknown, path: string, max = 1_000_000): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0 || v > max) throw new Bad(`${path}: ต้องเป็นจำนวนเต็มไม่ติดลบ`);
  return v;
}
function text(v: unknown, path: string, max = MAX_DISPLAY_TEXT): string {
  if (typeof v !== "string") throw new Bad(`${path}: ต้องเป็นข้อความ`);
  return displayCut(v, max);
}
function optText(o: Record<string, unknown>, k: string, path: string): string | undefined {
  if (!has(o, k) || o[k] === null) return undefined;
  const t = text(o[k], `${path}.${k}`);
  return t ? t : undefined;
}

function parseLine(v: unknown, path: string): DisplayLine {
  const o = obj(v, path, ["qty", "name", "detail", "grossSatang", "discountSatang", "discountLabel"]);
  if (typeof o.qty !== "number" || !Number.isFinite(o.qty) || o.qty <= 0 || o.qty > 100_000) throw new Bad(`${path}.qty`);
  const line: DisplayLine = { qty: o.qty, name: text(o.name, `${path}.name`) || "-", grossSatang: satang(o.grossSatang, `${path}.grossSatang`) };
  const detail = optText(o, "detail", path);
  if (detail) line.detail = detail;
  if (has(o, "discountSatang")) line.discountSatang = satang(o.discountSatang, `${path}.discountSatang`);
  const label = optText(o, "discountLabel", path);
  if (label) line.discountLabel = label;
  return line;
}
function parseTotals(v: unknown, path: string): DisplayTotals {
  const o = obj(v, path, ["subtotalSatang", "lineDiscountSatang", "billDiscountSatang", "coupon", "member", "serviceChargeSatang", "grandTotalSatang"]);
  const t: DisplayTotals = {
    subtotalSatang: satang(o.subtotalSatang, `${path}.subtotalSatang`),
    lineDiscountSatang: satang(o.lineDiscountSatang, `${path}.lineDiscountSatang`),
    billDiscountSatang: satang(o.billDiscountSatang, `${path}.billDiscountSatang`),
    serviceChargeSatang: satang(o.serviceChargeSatang, `${path}.serviceChargeSatang`),
    grandTotalSatang: satang(o.grandTotalSatang, `${path}.grandTotalSatang`),
  };
  if (has(o, "coupon")) {
    if (o.coupon === null) t.coupon = null;
    else {
      const c = obj(o.coupon, `${path}.coupon`, ["code", "satang"]);
      t.coupon = { code: text(c.code, `${path}.coupon.code`, 40), satang: satang(c.satang, `${path}.coupon.satang`) };
    }
  }
  if (has(o, "member")) {
    if (!Array.isArray(o.member) || o.member.length > MAX_DISPLAY_MEMBER_LINES) throw new Bad(`${path}.member`);
    // POS P2.10 ▸ fix1 F4: kind (ไม่บังคับ) · ป้ายไม่บังคับเมื่อมี kind (VOUCHER ไม่มีชื่อ = ไม่ส่งป้าย)
    t.member = o.member.map((m, i) => {
      const r = obj(m, `${path}.member[${i}]`, ["kind", "label", "satang"]);
      const p = `${path}.member[${i}]`;
      // POS P2.14 ▸ TL-5 (P6): kind บังคับ (ผู้ส่งเดียว use-display-publish ส่งทุกแถว) — ไม่มี kind = ภาพผิดรูป ◂
      if (!has(r, "kind") || typeof r.kind !== "string" || !DISPLAY_MEMBER_KINDS.includes(r.kind as DisplayMemberKind)) throw new Bad(`${p}.kind`);
      const row: { kind: DisplayMemberKind; label: string; satang: number } = { kind: r.kind as DisplayMemberKind, label: !has(r, "label") ? "" : text(r.label, `${p}.label`), satang: satang(r.satang, `${p}.satang`) };
      return row;
    }); // ◂
  }
  return t;
}
function parsePay(v: unknown, path: string): DisplayPayIn {
  const o = obj(v, path, ["method", "dueSatang", "roundSatang", "paidSatang", "remainingSatang", "cashReceivedSatang", "changeSatang", "intentId"]);
  if (typeof o.method !== "string" || !METHODS.includes(o.method)) throw new Bad(`${path}.method`);
  const p: DisplayPayIn = {
    method: o.method as DisplayPayMethod,
    dueSatang: satang(o.dueSatang, `${path}.dueSatang`),
    roundSatang: satang(o.roundSatang, `${path}.roundSatang`),
    paidSatang: satang(o.paidSatang, `${path}.paidSatang`),
    remainingSatang: satang(o.remainingSatang, `${path}.remainingSatang`, true),
  };
  if (has(o, "cashReceivedSatang")) p.cashReceivedSatang = satang(o.cashReceivedSatang, `${path}.cashReceivedSatang`);
  if (has(o, "changeSatang")) p.changeSatang = satang(o.changeSatang, `${path}.changeSatang`);
  if (has(o, "intentId") && o.intentId !== null) {
    if (typeof o.intentId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(o.intentId)) throw new Bad(`${path}.intentId`);
    p.intentId = o.intentId;
  }
  return p;
}
function parseDone(v: unknown, path: string): DisplayDoneIn {
  const o = obj(v, path, ["receiptNo", "saleId", "changeSatang", "pointsEarned"]);
  const d: DisplayDoneIn = {
    receiptNo: o.receiptNo === null || o.receiptNo === undefined ? null : text(o.receiptNo, `${path}.receiptNo`, 40) || null,
    changeSatang: has(o, "changeSatang") ? satang(o.changeSatang, `${path}.changeSatang`) : 0,
  };
  if (has(o, "saleId") && o.saleId !== null) {
    if (typeof o.saleId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(o.saleId)) throw new Bad(`${path}.saleId`);
    d.saleId = o.saleId;
  }
  if (has(o, "pointsEarned") && o.pointsEarned !== null) d.pointsEarned = count(o.pointsEarned, `${path}.pointsEarned`, 100_000_000);
  return d;
}

function parseState(v: unknown): DisplayState {
  const o = obj(v, "state", ["phase", "member", "lines", "moreCount", "totals", "stamp", "pay", "done"]);
  if (typeof o.phase !== "string" || !PHASES.includes(o.phase)) throw new Bad("state.phase");
  const st: DisplayState = { phase: o.phase as DisplayPhase };
  if (has(o, "member")) {
    if (o.member === null) st.member = null;
    else {
      const m = obj(o.member, "member", ["firstName", "tier", "points"]);
      // POS P2.10 ▸ fix1 F2: ชื่อที่เป็นรหัสสมาชิก = ""
      const first = displayFirstName(text(m.firstName, "member.firstName", 400));
      st.member = {
        firstName: displayLooksLikeMemberCode(first) ? "" : first, // ◂
        tier: m.tier === null || m.tier === undefined ? null : text(m.tier, "member.tier", 40) || null,
      };
      if (has(m, "points") && m.points !== null) st.member.points = count(m.points, "member.points", 1_000_000_000);
    }
  }
  let more = has(o, "moreCount") ? count(o.moreCount, "moreCount") : 0;
  if (has(o, "lines")) {
    if (!Array.isArray(o.lines) || o.lines.length > 500) throw new Bad("lines");
    const all = o.lines.map((l, i) => parseLine(l, `lines[${i}]`));
    st.lines = all.slice(0, MAX_DISPLAY_LINES);
    more += all.length - st.lines.length;
  }
  if (more > 0) st.moreCount = more;
  if (has(o, "totals")) st.totals = o.totals === null ? null : parseTotals(o.totals, "totals");
  if (has(o, "stamp")) {
    if (o.stamp === null) st.stamp = null;
    else {
      const s = obj(o.stamp, "stamp", ["name", "stamps", "slots", "toAdd"]);
      const slots = count(s.slots, "stamp.slots", 100);
      if (slots < 1) throw new Bad("stamp.slots");
      st.stamp = { name: text(s.name, "stamp.name"), stamps: count(s.stamps, "stamp.stamps", 10_000), slots, toAdd: has(s, "toAdd") ? count(s.toAdd, "stamp.toAdd", 10_000) : 0 };
    }
  }
  if (has(o, "pay")) st.pay = o.pay === null ? null : parsePay(o.pay, "pay");
  if (has(o, "done")) st.done = o.done === null ? null : parseDone(o.done, "done");
  return st;
}

/** ตัวตรวจ DisplayState (แบบ safeParse ของ zod · ไม่โยน) — ผลลัพธ์ = state ที่ทำความสะอาดแล้ว (ชื่อต้น · ตัดข้อความ · ≤ 20 บรรทัด + moreCount) */
export const displayStateSchema = {
  safeParse(v: unknown): Parse<DisplayState> {
    try {
      return { success: true, data: parseState(v) };
    } catch (e) {
      return { success: false, error: e instanceof Bad ? e.message : "state" };
    }
  },
};

/** ขนาด JSON (UTF-8 ไบต์) ของค่าที่ส่งมา — วนอ้างตัวเอง/แปลงไม่ได้ = Infinity */
export function displayJsonBytes(v: unknown): number {
  try {
    const s = JSON.stringify(v);
    return typeof s === "string" ? new TextEncoder().encode(s).length : Infinity;
  } catch {
    return Infinity;
  }
}

/** จำนวนเต็ม → "1,240" (ไม่พึ่ง locale ของเครื่อง — ผล SSR = ผลบนจอ) */
export function displayGroup(n: number): string {
  const v = Number.isFinite(n) ? Math.trunc(n) : 0;
  return `${v < 0 ? "−" : ""}${String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
/** สตางค์ → "฿625" / "฿40.50" (ติดลบใช้เครื่องหมายลบยาว) — แบบเดียวกับใบเสร็จออนไลน์ */
export function displayBaht(satang: number): string {
  const n = Number.isFinite(satang) ? Math.trunc(satang) : 0;
  const a = Math.abs(n);
  const frac = a % 100;
  return `${n < 0 ? "−" : ""}฿${displayGroup(Math.floor(a / 100))}${frac ? `.${String(frac).padStart(2, "0")}` : ""}`;
}
