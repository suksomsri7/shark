// channel-shared.ts — ช่องทางขาย (SalesChannel) ส่วนบริสุทธิ์ · POS P2.1 (R1 R3 R4 R6 R9 · CD2 CD5 CD10)
//
// 🔴 ไฟล์นี้ client component import ได้ (เครื่องคิดค่าคอมฯ ของจอตั้งค่า P2.1U) — ห้าม import ค่าจาก prisma/db/โมดูลฝั่งเซิร์ฟเวอร์
//    (import type ได้) · ฝั่งเซิร์ฟเวอร์ = channel.ts (ผู้เขียนเดียวของตาราง) + channel-actions.ts ("use server")
// 🔴 เงินเป็นสตางค์จำนวนเต็ม · ปัดครึ่งขึ้นแบบ VAT (คำนวณด้วย BigInt — ผลคูณไม่ล้น 2^53)
// 🔴 ค่าคอมฯ ช่องทาง ≠ ค่าคอมฯ พนักงาน (HR P3.5) — ชื่อในโค้ดใช้ channelCommission* เสมอ

// ═══════════ ค่าคงที่ ═══════════
/** ช่องทางพื้นฐานของทุกสาขา (สร้างแบบขี้เกียจ · ensureUnitChannels) — ลำดับนี้ = ลำดับแสดง */
export const CHANNEL_BUILTIN_CODES = ["STORE", "QR_TABLE", "WEB", "CHAT"] as const;
/** แพลตฟอร์มสำเร็จรูป — สร้างด้วยรหัสนี้ ⇒ kind EXTERNAL · payout ปริยาย PLATFORM · adapter ปริยาย MANUAL (มติ 2) */
export const CHANNEL_EXTERNAL_PRESETS = ["LINEMAN", "GRAB", "FOODPANDA", "SHOPEE", "LAZADA", "TIKTOK"] as const;
/** เพดานช่องทางต่อสาขา (นับแถวที่เก็บแล้วด้วย — รหัสยังจองอยู่ · มติ 5) */
export const CHANNEL_LIMIT_PER_UNIT = 30;
/** เลขออเดอร์แพลตฟอร์ม (channelRef) ยาวได้ไม่เกิน */
export const CHANNEL_REF_MAX = 40;
/** ชื่อช่องทางยาวได้ไม่เกิน (ตัวอักษร) */
export const CHANNEL_NAME_MAX = 60;
export const CHANNEL_CODE_RE = /^[A-Z][A-Z0-9_]{1,23}$/;
export const CHANNEL_BP_MAX = 10_000;
export const CHANNEL_FIXED_MAX_SATANG = 1_000_000;

export type ChannelBuiltinCode = (typeof CHANNEL_BUILTIN_CODES)[number];
/** ชื่อไทยของช่องทางพื้นฐาน (แถวใหม่ใช้ชื่อนี้ · บิลเก่าที่ไม่มีช่องทางอ่านชื่อนี้เมื่อไม่มีแถวของสาขา) */
export const CHANNEL_BUILTIN_NAMES: Readonly<Record<ChannelBuiltinCode, string>> = {
  STORE: "หน้าร้าน",
  QR_TABLE: "QR โต๊ะ",
  WEB: "เว็บร้าน SHARK Shop",
  CHAT: "แชท",
};

export const CHANNEL_KINDS = ["BUILTIN", "EXTERNAL", "CUSTOM"] as const;
export const CHANNEL_ADAPTERS = ["NONE", "MANUAL", "WEB", "CHAT", "API"] as const;
export const CHANNEL_PAYOUTS = ["PLATFORM", "DIRECT"] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];
export type ChannelAdapter = (typeof CHANNEL_ADAPTERS)[number];
export type ChannelPayout = (typeof CHANNEL_PAYOUTS)[number];

// ═══════════ ชนิดข้อมูล (สัญญา P2.1U) ═══════════
/** แถวช่องทางที่จอเห็น — คีย์ตายตัว 12 ตัว (ข้อสอบ C1) */
export type ChannelItem = {
  id: string;
  code: string;
  kind: ChannelKind;
  name: string;
  adapter: ChannelAdapter;
  active: boolean;
  payout: ChannelPayout;
  commissionBp: number;
  commissionFixedSatang: number;
  commissionVatBp: number;
  sortOrder: number;
  archived: boolean;
};
/** ข้อมูลที่ saveChannel รับ (คีย์เกิน = VALIDATION) — มี id = แก้ · ไม่มี id = สร้าง (ต้องมี code) */
export type ChannelInput = {
  id?: string;
  code?: string;
  name: string;
  active?: boolean;
  payout?: ChannelPayout;
  commissionBp?: number;
  commissionFixedSatang?: number;
  commissionVatBp?: number;
  sortOrder?: number;
  adapter?: ChannelAdapter;
};
export type ChannelRefusalCode =
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "VALIDATION"
  | "CHANNEL_NOT_FOUND"
  | "CHANNEL_CODE_TAKEN"
  | "CHANNEL_BUILTIN_LOCKED"
  | "CHANNEL_LIMIT"
  | "INTERNAL";
export type ChannelRefusal = { ok: false; code: ChannelRefusalCode; message: string; field?: string };
export type ListChannelsResult = { ok: true; items: ChannelItem[] } | ChannelRefusal;
export type SaveChannelResult = { ok: true; channel: ChannelItem } | ChannelRefusal;
export type ArchiveChannelResult = { ok: true; channel: ChannelItem } | ChannelRefusal;

/** ช่องทางของบิลที่ตัวอ่านแสดง (บิลเดิมที่ไม่มี channelId = defaultChannelCode(sourceModule) · มติ 14) */
export type SaleChannelRef = { code: string; name: string };
/** ตัวเลือกค่าคอมฯ ของช่องทาง (ส่วนที่ channelCommission ใช้) */
export type ChannelCommissionRates = { commissionBp: number; commissionFixedSatang: number; commissionVatBp: number };
export type ChannelCommission = { commissionSatang: number; commissionVatSatang: number };

// ═══════════ คณิต (R6 · CD5 · CD10) ═══════════
/** ครึ่งขึ้นของ a × b / c (จำนวนเต็มไม่ติดลบ · c ≤ 0 ⇒ 0) — BigInt กันผลคูณล้น */
function halfUpMulDiv(a: number, b: number, c: number): number {
  if (!(c > 0) || !(a > 0) || !(b > 0)) return 0;
  const A = BigInt(Math.trunc(a));
  const B = BigInt(Math.trunc(b));
  const C = BigInt(Math.trunc(c));
  const TWO = BigInt(2);
  return Number((TWO * A * B + C) / (TWO * C));
}
const nonNegInt = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0);

/**
 * ค่าคอมฯ ของบิล (R6): ฐาน = ยอดบิล grandTotal (หลังส่วนลด รวมค่าบริการ ไม่รวมทิป) ·
 * commission = min(ยอด, ครึ่งขึ้น(ยอด × bp / 10000) + fixed) · VAT ค่าคอมฯ = ครึ่งขึ้น(commission × vatBp / 10000) (แพลตฟอร์มคิดบน GP · CD5)
 */
export function channelCommission(grossSatang: number, rates: ChannelCommissionRates): ChannelCommission {
  const gross = nonNegInt(grossSatang);
  const bp = Math.min(CHANNEL_BP_MAX, nonNegInt(rates?.commissionBp));
  const fixed = Math.min(CHANNEL_FIXED_MAX_SATANG, nonNegInt(rates?.commissionFixedSatang));
  const vatBp = Math.min(CHANNEL_BP_MAX, nonNegInt(rates?.commissionVatBp));
  if (gross === 0) return { commissionSatang: 0, commissionVatSatang: 0 };
  const commissionSatang = Math.min(gross, halfUpMulDiv(gross, bp, 10_000) + fixed);
  return { commissionSatang, commissionVatSatang: halfUpMulDiv(commissionSatang, vatBp, 10_000) };
}

/**
 * POS P2.1U fix รอบ 1 ▸ F5: ยอดที่ร้านได้รับจริงของบิลช่องทาง = ยอดบิล − ค่าคอมฯ − VAT ค่าคอมฯ (สตางค์จำนวนเต็ม · ไม่ปัด ·
 * ติดลบได้เมื่อค่าคอมฯ ชนเพดานยอดบิลแล้วยังมี VAT — แสดงตามจริง) · ค่าที่ไม่ใช่จำนวนเต็มบวก = 0 (เหมือน channelCommission) ◂
 */
export function channelNet(grossSatang: number, commissionSatang: number, commissionVatSatang: number): number {
  return nonNegInt(grossSatang) - nonNegInt(commissionSatang) - nonNegInt(commissionVatSatang);
}

/**
 * ส่วนแบ่งค่าคอมฯ ของใบคืนเงิน (R9 · CD10): ใบที่ทำให้คืนครบ (full) = ส่วนที่เหลือ (ค่าคอมฯ บิล − Σ ส่วนแบ่งก่อนหน้า) ·
 * ใบบางส่วน = ครึ่งขึ้น(ค่าคอมฯ บิล × ยอดคืน / ยอดบิล) จำกัดไม่เกินส่วนที่เหลือ ⇒ Σ ส่วนแบ่งทุกใบ = ค่าคอมฯ ของบิลเป๊ะ
 */
export function channelRefundShare(
  sale: { grandTotalSatang: number; channelCommissionSatang: number; channelCommissionVatSatang: number },
  refund: { grossSatang: number; full: boolean },
  prior: { commissionSatang: number; commissionVatSatang: number },
): ChannelCommission {
  const grand = nonNegInt(sale?.grandTotalSatang);
  const c = nonNegInt(sale?.channelCommissionSatang);
  const v = nonNegInt(sale?.channelCommissionVatSatang);
  const leftC = Math.max(0, c - nonNegInt(prior?.commissionSatang));
  const leftV = Math.max(0, v - nonNegInt(prior?.commissionVatSatang));
  if (refund?.full) return { commissionSatang: leftC, commissionVatSatang: leftV };
  const gross = nonNegInt(refund?.grossSatang);
  return {
    commissionSatang: Math.min(leftC, halfUpMulDiv(c, gross, grand)),
    commissionVatSatang: Math.min(leftV, halfUpMulDiv(v, gross, grand)),
  };
}

// ═══════════ ช่องทางปริยาย (R4 · CD2 · CD9) ═══════════
/** ผู้เรียก createSale ที่ไม่ส่ง channelId: ECOM → WEB · อื่นทั้งหมด (POS RESTAURANT HOTEL … ว่าง/null) → STORE */
export function defaultChannelCode(sourceModule?: string | null): "STORE" | "WEB" {
  return sourceModule === "ECOM" ? "WEB" : "STORE";
}
export const isChannelBuiltinCode = (code: unknown): code is ChannelBuiltinCode => typeof code === "string" && (CHANNEL_BUILTIN_CODES as readonly string[]).includes(code);
export const isChannelExternalPreset = (code: unknown): boolean => typeof code === "string" && (CHANNEL_EXTERNAL_PRESETS as readonly string[]).includes(code);
/** ชื่อช่องทางสำรองของบิลเดิม (ไม่มีแถวของสาขา) — builtin = ชื่อไทย · อื่น = รหัส */
export function channelFallbackName(code: string): string {
  return isChannelBuiltinCode(code) ? CHANNEL_BUILTIN_NAMES[code] : code;
}

// ═══════════ ตัวแกะข้อมูล saveChannel (R3) ═══════════
const INPUT_KEYS = ["id", "code", "name", "active", "payout", "commissionBp", "commissionFixedSatang", "commissionVatBp", "sortOrder", "adapter"] as const;
export type ParseChannelInputResult = { ok: true; value: ChannelInput } | { ok: false; code: "VALIDATION"; message: string; field?: string };
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const intIn = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/** ตรวจ + ตัดแต่งข้อมูลช่องทาง — คีย์ตายตัว · ไม่ throw · ผิด = {ok:false, code:"VALIDATION", message ไทย} */
export function parseChannelInput(raw: unknown): ParseChannelInputResult {
  const bad = (message: string, field?: string): ParseChannelInputResult => (field ? { ok: false, code: "VALIDATION", message, field } : { ok: false, code: "VALIDATION", message });
  try {
    if (!isRecord(raw)) return bad("ข้อมูลช่องทางไม่ถูกต้อง");
    const extra = Object.keys(raw).filter((k) => !(INPUT_KEYS as readonly string[]).includes(k));
    if (extra.length) return bad(`มีช่องข้อมูลที่ไม่รู้จัก: ${extra.slice(0, 3).join(", ")}`, extra[0]);
    const out: ChannelInput = { name: "" };
    if (raw.id !== undefined) {
      if (typeof raw.id !== "string" || !raw.id || raw.id.length > 200 || raw.id.includes("\u0000")) return bad("รหัสอ้างอิงช่องทางไม่ถูกต้อง", "id");
      out.id = raw.id;
    }
    if (raw.code !== undefined) {
      if (typeof raw.code !== "string" || !CHANNEL_CODE_RE.test(raw.code)) return bad("รหัสช่องทางต้องเป็น A-Z 0-9 _ ขึ้นต้นด้วยตัวอักษร ยาว 2–24 ตัว", "code");
      out.code = raw.code;
    }
    if (typeof raw.name !== "string") return bad("ต้องระบุชื่อช่องทาง", "name");
    const name = raw.name.trim();
    if (!name || [...name].length > CHANNEL_NAME_MAX || /[\u0000-\u001F\u007F]/.test(name)) return bad(`ชื่อช่องทางต้องยาว 1–${CHANNEL_NAME_MAX} ตัวอักษร`, "name");
    out.name = name;
    if (raw.active !== undefined) {
      if (typeof raw.active !== "boolean") return bad("สถานะเปิดใช้งานไม่ถูกต้อง", "active");
      out.active = raw.active;
    }
    if (raw.payout !== undefined) {
      if (!(CHANNEL_PAYOUTS as readonly unknown[]).includes(raw.payout)) return bad("วิธีรับเงินต้องเป็น PLATFORM หรือ DIRECT", "payout");
      out.payout = raw.payout as ChannelPayout;
    }
    if (raw.commissionBp !== undefined) {
      if (!intIn(raw.commissionBp, 0, CHANNEL_BP_MAX)) return bad("ค่าคอมฯ (%) ต้องอยู่ระหว่าง 0–100% (0–10000 bp)", "commissionBp");
      out.commissionBp = raw.commissionBp;
    }
    if (raw.commissionFixedSatang !== undefined) {
      if (!intIn(raw.commissionFixedSatang, 0, CHANNEL_FIXED_MAX_SATANG)) return bad("ค่าคอมฯ คงที่ต้องอยู่ระหว่าง ฿0–฿10,000", "commissionFixedSatang");
      out.commissionFixedSatang = raw.commissionFixedSatang;
    }
    if (raw.commissionVatBp !== undefined) {
      if (!intIn(raw.commissionVatBp, 0, CHANNEL_BP_MAX)) return bad("VAT ค่าคอมฯ ต้องอยู่ระหว่าง 0–100%", "commissionVatBp");
      out.commissionVatBp = raw.commissionVatBp;
    }
    if (raw.sortOrder !== undefined) {
      if (!intIn(raw.sortOrder, 0, 9_999)) return bad("ลำดับต้องเป็นจำนวนเต็ม 0–9999", "sortOrder");
      out.sortOrder = raw.sortOrder;
    }
    if (raw.adapter !== undefined) {
      if (!(CHANNEL_ADAPTERS as readonly unknown[]).includes(raw.adapter)) return bad("ชนิดการเชื่อมต่อไม่ถูกต้อง", "adapter");
      out.adapter = raw.adapter as ChannelAdapter;
    }
    return { ok: true, value: out };
  } catch {
    return bad("ข้อมูลช่องทางไม่ถูกต้อง");
  }
}
