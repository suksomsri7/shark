// ─────────────────────────────────────────────────────────────
// warnings.ts — ทะเบียนคำเตือนกฎหมายกลาง (T0.4) · ที่เดียวที่นิยามคำเตือนกฎหมายของ SHARK
//
// 🔴 pure ล้วน: ไม่ import db/prisma/next · ใช้ได้ทั้ง server และ client (คอมโพเนนต์แสดงคำเตือนอ่านจากไฟล์นี้)
// 🔴 กติกา ACCOUNT-TAX-PLAN ข้อ 1–2: ไม่บล็อกผู้ใช้ด้วยเหตุผลกฎหมาย — คืนคำเตือนที่อ้างมาตรา แล้วร้านกดยืนยันผ่านได้
//    · ห้ามเขียนว่าสิ่งใด "ถูกกฎหมาย" · คำเตือนจากกฎป้าย [S]/[U] ต่อท้ายว่าเป็นค่าเริ่มต้นของระบบ + "โปรดตรวจกับนักบัญชีของร้าน" เสมอ
// 🔴 แหล่ง = skill `shark-thai-law` (references/<ไฟล์> §<ข้อ>) · checkedAt = วันที่ skill ตรวจแหล่งนั้น · ไม่ใช่คำปรึกษากฎหมาย
// รูปเดียวกันทุกช่องทาง: จอ (LegalWarningList) · REST (`error.warnings` ของ 409 legal_ack_required) · เครื่องมือเลขา AI
// ─────────────────────────────────────────────────────────────

/** ป้ายความมั่นใจของกฎ (ตาม SKILL.md ของ shark-thai-law) */
export type LegalTag = "V" | "V2" | "S" | "U";

/** ป้ายสั้นที่จอแสดง (ความหมายตาม SKILL.md) */
export const LEGAL_TAG_SHORT_TH: Record<LegalTag, string> = {
  V: "แหล่งทางการ [V]",
  V2: "แหล่งรองที่อ้างมาตรา [V2]",
  S: "ค่าเริ่มต้นของระบบ [S]",
  U: "ยังไม่ยืนยัน [U]",
};

export const LEGAL_WARNING_CODES = [
  // ── ตารางค่ากฎหมาย (T0.2) — แจ้งให้ทราบ ไม่ต้องกดยืนยัน ──
  "SHOP_DIFFERS_FROM_DEFAULT",
  "UNVERIFIED_DEFAULT",
  "NO_ROW_FOR_DATE",
  "NO_ROW",
  "EWHT_NOT_IN_EFFECT",
  "ENTITY_KIND_UNSET",
  "RECIPIENT_ASSUMED",
  // ── บล็อกเดิมที่เปลี่ยนเป็นคำเตือน (T0.4) ──
  "TAX_INVOICE_NOT_VAT_REGISTERED",
  "TAX_INVOICE_SELLER_TAX_ID_MISSING",
  "ADJUST_NOTE_REASON_MISSING",
  "BUYER_TAX_ID_MISSING",
  "GIFTCARD_EXPIRY_BELOW_DEFAULT",
  // ── จุดรับผิดขายสินค้า (T1.2) ──
  "OUTPUT_VAT_PARKED_PAST_MONTH",
  "TAX_INVOICE_LATE_DATE_CHOICE",
  "GOODS_TAX_INVOICE_DEFERRED",
] as const;

export type LegalWarningCode = (typeof LEGAL_WARNING_CODES)[number];

/** คำเตือน 1 รายการที่ส่งออก (จอ · REST · AI ใช้รูปนี้รูปเดียว) */
export type LegalWarning = {
  code: LegalWarningCode;
  messageTh: string;
  /** มาตรา/แหล่ง — ค่าเริ่ม = ของทะเบียน · ตัวอ่านตารางค่ากฎหมายใส่ที่มาของแถวที่ใช้แทนได้ */
  citation?: string;
  tag?: LegalTag;
  /** YYYY-MM-DD วันที่ skill ตรวจแหล่ง */
  checkedAt?: string;
  /** true = ต้องกดยืนยันก่อนทำต่อ */
  ack?: boolean;
};

export type LegalWarningDef = {
  code: LegalWarningCode;
  titleTh: string;
  /** ข้อความหลัก (ไม่รวมคำต่อท้ายของป้าย [S]/[U] — `legalWarning` เติมให้) */
  messageTh: (p: Record<string, string | number>) => string;
  citation: string;
  tag: LegalTag;
  checkedAt: string;
  ack: boolean;
};

/** ข้อความกลางสำหรับค่าที่ไม่ได้มาจากเอกสารทางการ (กติกาข้อ 1 ของ ACCOUNT-TAX-PLAN) */
export const CHECK_WITH_ACCOUNTANT_TH = "โปรดตรวจกับนักบัญชีของร้าน";
/** คำต่อท้ายคำเตือนจากกฎป้าย [S]/[U] */
export const SYSTEM_DEFAULT_SUFFIX_TH = `เป็นค่าเริ่มต้นของระบบ — ${CHECK_WITH_ACCOUNTANT_TH}`;

const s = (p: Record<string, string | number>, k: string, d = "-") => (p[k] === undefined || p[k] === "" ? d : String(p[k]));

const TABLE_SRC = "ตารางค่ากฎหมาย src/lib/core/settings/legal/th-tax-2569.ts (ที่มาตามแถว: references/common-vat-invoice.md §12 · common-withholding-tax.md §2–§10)";

export const LEGAL_WARNINGS: { readonly [K in LegalWarningCode]: LegalWarningDef & { code: K } } = {
  SHOP_DIFFERS_FROM_DEFAULT: {
    code: "SHOP_DIFFERS_FROM_DEFAULT",
    titleTh: "ค่าที่ร้านตั้งต่างจากค่าเริ่มต้น",
    messageTh: (p) => `ค่าที่ร้านตั้ง (${s(p, "shop")}) ต่างจากค่าเริ่มต้นของระบบ (${s(p, "system")}) — ระบบใช้ค่าของร้าน ${CHECK_WITH_ACCOUNTANT_TH}`,
    citation: TABLE_SRC,
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  UNVERIFIED_DEFAULT: {
    code: "UNVERIFIED_DEFAULT",
    titleTh: "ค่าเริ่มต้นยังไม่ได้ยืนยันจากเอกสารทางการ",
    messageTh: () => "ค่าเริ่มต้นนี้ยังไม่ได้ยืนยันจากเอกสารทางการ",
    citation: TABLE_SRC,
    tag: "U",
    checkedAt: "2026-11-13",
    ack: false,
  },
  NO_ROW_FOR_DATE: {
    code: "NO_ROW_FOR_DATE",
    titleTh: "ไม่มีค่าที่มีผลในวันที่นี้",
    messageTh: (p) => `ไม่มีค่าในตารางที่มีผลวันที่ ${s(p, "ymd")} — ระบบใช้ค่าใกล้ที่สุด (${s(p, "value")}) ไปก่อน`,
    citation: TABLE_SRC,
    tag: "S",
    checkedAt: "2026-11-13",
    ack: false,
  },
  NO_ROW: {
    code: "NO_ROW",
    titleTh: "ไม่มีค่าในตารางค่ากฎหมาย",
    messageTh: () => "ไม่มีค่าในตารางค่ากฎหมายสำหรับกรณีนี้ — กรอกเองหรือเพิ่มแถวในตั้งค่า",
    citation: TABLE_SRC,
    tag: "S",
    checkedAt: "2026-11-13",
    ack: false,
  },
  EWHT_NOT_IN_EFFECT: {
    code: "EWHT_NOT_IN_EFFECT",
    titleTh: "อัตรา e-Withholding Tax ไม่มีผล",
    messageTh: (p) => `ไม่มีอัตรา e-Withholding Tax ที่มีผลวันที่ ${s(p, "ymd")} สำหรับกรณีนี้ — ระบบใช้อัตราปกติ`,
    citation: "references/common-withholding-tax.md §6, §14 (อัตราลด e-WHT มีวันสิ้นสุด)",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  ENTITY_KIND_UNSET: {
    code: "ENTITY_KIND_UNSET",
    titleTh: "ยังไม่ระบุประเภทผู้ประกอบการ",
    messageTh: (p) =>
      p.context === "withholding"
        ? "ยังไม่ได้ระบุประเภทผู้ประกอบการของสมุดนี้ — ระบบแนะนำอัตราแบบผู้จ่ายเป็นนิติบุคคลไปก่อน ตั้งได้ที่ ตั้งค่า › ข้อมูลกิจการ"
        : "ยังไม่ได้ระบุประเภทผู้ประกอบการ — ตั้งได้ที่ ตั้งค่า › ข้อมูลกิจการ (ใช้กับคำเตือน รายงาน ปฏิทินภาษี และหัก ณ ที่จ่าย)",
    citation: "references/common-withholding-tax.md §1, §16 (ผู้จ่ายนิติบุคคล/บุคคลธรรมดาใช้กติกาคนละชุด)",
    tag: "S",
    checkedAt: "2026-11-13",
    ack: false,
  },
  RECIPIENT_ASSUMED: {
    code: "RECIPIENT_ASSUMED",
    titleTh: "ยังไม่ทราบประเภทผู้รับ",
    messageTh: () => "ยังไม่ทราบประเภทผู้รับ — ระบบแนะนำอัตราแบบผู้รับเป็นบริษัท/ห้างฯ ในไทย",
    citation: "references/common-withholding-tax.md §2, §10",
    tag: "S",
    checkedAt: "2026-11-13",
    ack: false,
  },
  TAX_INVOICE_NOT_VAT_REGISTERED: {
    code: "TAX_INVOICE_NOT_VAT_REGISTERED",
    titleTh: "ออกใบกำกับภาษีขณะตั้งค่าว่าไม่จด VAT",
    // T0.4b (เจ้าของตัดสิน 13 พ.ย.): กดยืนยันแล้ว ระบบ **ไม่** เปลี่ยนใบเป็น "ไม่มี VAT" ให้ — ข้อความต้องบอกชัดว่าใบนี้ยังคิด VAT ตามที่ตั้งไว้
    //   `vat` = ยอด VAT ของใบ (ข้อความบาท เช่น "7,000.00") ถ้าผู้เรียกส่งมา · ไม่ส่ง = บอกว่าคิดตามโหมดที่ตั้ง
    messageTh: (p) => {
      const vatPart =
        p.vat === undefined || p.vat === ""
          ? "ใบนี้ยังคิดภาษีมูลค่าเพิ่มตามโหมด VAT ที่ตั้งไว้ในเอกสาร"
          : p.vat === "0.00" || p.vat === "0"
            ? "ใบนี้ไม่มียอดภาษีมูลค่าเพิ่ม (฿0.00) ตามโหมด VAT ที่ตั้งไว้ในเอกสาร"
            : `ใบนี้ยังคิดภาษีมูลค่าเพิ่ม ฿${p.vat} ตามโหมด VAT ที่ตั้งไว้ในเอกสาร`;
      return `สมุดนี้ตั้งค่าไว้ว่ายังไม่จดทะเบียนภาษีมูลค่าเพิ่ม — ผู้ที่ไม่ได้จดทะเบียนออกใบกำกับภาษีไม่ได้ (ม.86/13) · ${vatPart} — ระบบไม่เปลี่ยนเป็น "ไม่มี VAT" ให้ ถ้าไม่ได้ตั้งใจ ให้แก้โหมด VAT ของเอกสารก่อนออก · ถ้าจดแล้วให้แก้ที่ ตั้งค่า › ข้อมูลกิจการ · กดยืนยันเพื่อออกใบนี้ตามที่ตั้งไว้`;
    },
    citation: "ประมวลรัษฎากร ม.86/13 · references/common-vat-invoice.md §14, §21",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: true,
  },
  TAX_INVOICE_SELLER_TAX_ID_MISSING: {
    code: "TAX_INVOICE_SELLER_TAX_ID_MISSING",
    titleTh: "ไม่มีเลขประจำตัวผู้เสียภาษีของผู้ขาย",
    messageTh: () =>
      "ยังไม่ได้กรอกเลขประจำตัวผู้เสียภาษีของกิจการ — ใบกำกับภาษีเต็มรูปต้องมีเลขของผู้ออก (ม.86/4(2)) · กรอกได้ที่ ตั้งค่า › ข้อมูลกิจการ · กดยืนยันเพื่อออกใบนี้โดยไม่มีเลข",
    citation: "ประมวลรัษฎากร ม.86/4(2) · references/common-vat-invoice.md §5",
    tag: "V",
    checkedAt: "2026-11-12",
    ack: true,
  },
  ADJUST_NOTE_REASON_MISSING: {
    code: "ADJUST_NOTE_REASON_MISSING",
    titleTh: "ใบลด/เพิ่มหนี้ไม่มีเหตุผลการออก",
    messageTh: () =>
      "ยังไม่ได้ระบุเหตุผลการออกใบลดหนี้/ใบเพิ่มหนี้ — รายการที่ต้องมีตาม ม.86/9–86/10 รวม \"สาเหตุย่อ\" (เหตุลดหนี้ตามประกาศ VAT ฉ.82) · กดยืนยันเพื่อออกใบนี้โดยไม่ระบุเหตุผล",
    citation: "ประมวลรัษฎากร ม.86/9, 86/10 · ประกาศ VAT ฉ.82 ข้อ 2 · references/common-vat-invoice.md §7, §16",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: true,
  },
  BUYER_TAX_ID_MISSING: {
    code: "BUYER_TAX_ID_MISSING",
    titleTh: "ผู้ซื้อไม่มีเลขประจำตัวผู้เสียภาษี",
    messageTh: () =>
      "ไม่ได้กรอกเลขประจำตัวผู้เสียภาษีของผู้ซื้อ — ผู้ซื้อทั่วไปไม่ต้องมี แต่ถ้าผู้ซื้อเป็นผู้ประกอบการจดทะเบียน VAT ใบกำกับต้องมีเลขและสาขาของผู้ซื้อ (ประกาศ VAT ฉ.39 ข้อ 7, 9)",
    citation: "ประกาศอธิบดีฯ เรื่อง VAT ฉบับที่ 39 ข้อ 7, 9 · references/common-vat-invoice.md §14",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  GIFTCARD_EXPIRY_BELOW_DEFAULT: {
    code: "GIFTCARD_EXPIRY_BELOW_DEFAULT",
    titleTh: "อายุบัตรกำนัลสั้นกว่าค่าเริ่มต้น",
    messageTh: (p) =>
      `อายุบัตรกำนัล ${s(p, "months")} เดือน สั้นกว่าค่าเริ่มต้น ${s(p, "default")} เดือน — ไม่พบกฎหมายกำหนดอายุขั้นต่ำ (บัตรกำนัลไม่อยู่ในธุรกิจควบคุมสัญญาของ สคบ.) แต่ข้อสัญญาที่ทำให้ร้านได้เปรียบเกินสมควรอาจมีผลบังคับได้เพียงเท่าที่เป็นธรรม (พ.ร.บ.ข้อสัญญาที่ไม่เป็นธรรม ม.4)`,
    citation: "พ.ร.บ.ว่าด้วยข้อสัญญาที่ไม่เป็นธรรม พ.ศ. 2540 ม.4 · references/common-consumer-contract-esign.md §4",
    tag: "U",
    checkedAt: "2026-11-12",
    ack: true,
  },
  OUTPUT_VAT_PARKED_PAST_MONTH: {
    code: "OUTPUT_VAT_PARKED_PAST_MONTH",
    titleTh: "ภาษีขายของสินค้าค้างพักข้ามเดือน",
    messageTh: (p) =>
      p.count !== undefined
        ? `มีใบแจ้งหนี้ ${s(p, "count")} ใบที่ภาษีขายของสินค้ารวม ฿${s(p, "vat")} ยังพักอยู่ (ยังไม่ออกใบกำกับ) ข้ามเดือนของใบแจ้งหนี้ — ภาษีขายของสินค้าเกิดเมื่อส่งมอบ (ม.78) และต้องออกใบกำกับในทันทีที่ความรับผิดเกิด (ม.86) · ยอดที่พักไม่เข้า ภ.พ.30 จนกว่าจะออกใบกำกับ`
        : `ภาษีขายของสินค้า ฿${s(p, "vat")} ในใบแจ้งหนี้ ${s(p, "docNo")} (ลงวันที่ ${s(p, "date")}) ยังพักอยู่ ${s(p, "days")} วัน ข้ามเดือนของใบแจ้งหนี้ — ภาษีขายของสินค้าเกิดเมื่อส่งมอบ (ม.78) และต้องออกใบกำกับในทันทีที่ความรับผิดเกิด (ม.86) · ยอดนี้ไม่เข้า ภ.พ.30 จนกว่าจะออกใบกำกับ`,
    citation: "ประมวลรัษฎากร ม.78(1), ม.86 · references/common-vat-invoice.md §4, §13",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  TAX_INVOICE_LATE_DATE_CHOICE: {
    code: "TAX_INVOICE_LATE_DATE_CHOICE",
    titleTh: "เลือกวันที่ของใบกำกับที่ออกตามหลัง",
    messageTh: (p) =>
      `ใบกำกับที่ออกตามหลังเพื่อปล่อยภาษีขายที่พักไว้ (${s(p, "choice")}) — ลงวันที่ใบแจ้งหนี้: ภาษีเข้าเดือนเดิมตามจุดรับผิด (ม.78) แต่ถ้ายื่น ภ.พ.30 เดือนนั้นแล้วอาจต้องยื่นเพิ่มเติม · ลงวันที่วันนี้: ภาษีเข้าเดือนนี้ แต่จุดรับผิดของสินค้าอยู่ที่วันส่งมอบ · ไม่พบกติกาเรื่องวันที่ของใบกำกับที่ออกล่าช้าในแหล่งที่ระบบใช้ ร้านต้องเลือกเอง`,
    citation: "ประมวลรัษฎากร ม.78(1), ม.86 · references/common-vat-invoice.md §4, §13 (§14 ข้อ 25 ว่าด้วยยกเลิก-ออกใหม่แทนฉบับเดิมเท่านั้น)",
    tag: "U",
    checkedAt: "2026-11-13",
    ack: true,
  },
  GOODS_TAX_INVOICE_DEFERRED: {
    code: "GOODS_TAX_INVOICE_DEFERRED",
    titleTh: "ไม่ออกใบกำกับของสินค้าพร้อมใบแจ้งหนี้",
    messageTh: (p) =>
      `ใบนี้จะไม่ออกใบกำกับของสินค้าพร้อมกัน — ภาษีขายของสินค้า ฿${s(p, "vat")} จะพักไว้จนกว่าจะออกใบกำกับ · ภาษีขายของสินค้าเกิดเมื่อส่งมอบ (ม.78) ถ้าส่งมอบแล้วต้องออกใบกำกับทันที (ม.86) · ระบบเตือนเมื่อค้างข้ามเดือน`,
    citation: "ประมวลรัษฎากร ม.78(1), ม.86 · references/common-vat-invoice.md §4, §13",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
};

export function isLegalWarningCode(v: unknown): v is LegalWarningCode {
  return typeof v === "string" && (LEGAL_WARNING_CODES as readonly string[]).includes(v);
}

/** สร้างคำเตือนจากทะเบียน (ทางเดียว) · `citation` แทนที่มาของทะเบียนได้ (เช่นที่มาของแถวในตารางค่ากฎหมาย) */
export function legalWarning(code: LegalWarningCode, params: Record<string, string | number> = {}, opts: { citation?: string } = {}): LegalWarning {
  const d = LEGAL_WARNINGS[code];
  const base = d.messageTh(params);
  const messageTh = d.tag === "S" || d.tag === "U" ? `${base} — ${SYSTEM_DEFAULT_SUFFIX_TH}` : base;
  return { code, messageTh, citation: opts.citation ?? d.citation, tag: d.tag, checkedAt: d.checkedAt, ack: d.ack };
}

/** คำเตือนที่ต้องกดยืนยันแต่ยังไม่อยู่ในรหัสที่ผู้ใช้ยืนยันมา */
export function unacknowledged(warnings: readonly LegalWarning[], ackCodes: readonly string[] | null | undefined): LegalWarning[] {
  const acked = new Set(ackCodes ?? []);
  return warnings.filter((w) => w.ack && !acked.has(w.code));
}

/** รหัสผลของ service/REST เมื่อยังไม่ได้กดยืนยัน */
export const LEGAL_ACK_REQUIRED = "LEGAL_ACK_REQUIRED" as const;

/** ผลมาตรฐานของ service เมื่อยังไม่ได้กดยืนยัน (ไม่ throw — ผู้เรียกแสดงคำเตือนแล้วส่งซ้ำพร้อมรหัสที่ยืนยัน) */
export type LegalAckRequired = { code: typeof LEGAL_ACK_REQUIRED; warnings: LegalWarning[] };

export const LEGAL_ACK_REASON_TH = "มีคำเตือนตามกฎหมายที่ต้องกดยืนยันก่อนทำต่อ";

/** ข้อความไทยบรรทัดเดียวของคำเตือนชุดหนึ่ง (ใช้ใน reason / ข้อความถึงเลขา AI) */
export function legalWarningsText(warnings: readonly LegalWarning[]): string {
  return warnings.map((w) => `[${w.code}] ${w.messageTh}${w.citation ? ` (อ้างอิง: ${w.citation})` : ""}`).join(" · ");
}

/** โยนข้ามชั้นภายใน service (ในธุรกรรม) แล้วผู้เรียกแปลงเป็น `{ ok:false, legal }` — ห้ามหลุดถึงผู้ใช้เป็น error ดิบ */
export class LegalAckRequiredError extends Error {
  readonly warnings: LegalWarning[];
  constructor(warnings: LegalWarning[]) {
    super(`${LEGAL_ACK_REASON_TH}: ${legalWarningsText(warnings)}`);
    this.name = "LegalAckRequiredError";
    this.warnings = warnings;
  }
}

export function isLegalAckRequiredError(e: unknown): e is LegalAckRequiredError {
  return e instanceof LegalAckRequiredError || (typeof e === "object" && e !== null && (e as { name?: unknown }).name === "LegalAckRequiredError" && Array.isArray((e as { warnings?: unknown }).warnings));
}

/** ผู้ที่กดยืนยัน — ผู้เรียกส่งเข้า service พร้อมรหัสที่ยืนยัน */
export type LegalAck = {
  codes: readonly string[];
  actorId?: string | null;
  /** ตรงกับ enum ActorType ของ AuditLog · ข้อเสนอของเลขา AI ที่คนกดยืนยัน = USER ของคนนั้น (via ใส่ "ai-proposal") */
  actorType?: "USER" | "PLATFORM_USER" | "SYSTEM" | "API_KEY";
  /** ช่องทาง เช่น "screen" · "rest" · "ai-proposal" */
  via?: string;
};
