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
  // ── หัวรายงานภาษี (T1.1 · ย้ายจากคำเตือนท้องถิ่น) ──
  "TAX_REPORT_ORG_NAME_MISSING",
  "TAX_REPORT_TAX_ID_MISSING",
  // ── ภ.พ.30 (T1.3) ──
  "PP30_EXCESS_REFUND",
  "PP30_CREDIT_CARRY_OVERRIDDEN",
  "PP30_FILED_DIFFERS",
  "PP30_ADDITIONAL_SURCHARGE",
  "PP30_DECLARED_DIFFERS",
  "PP30_LEGACY_FILING",
  // ── จุดรับผิดขายสินค้า (T1.2) ──
  "OUTPUT_VAT_PARKED_PAST_MONTH",
  "TAX_INVOICE_LATE_DATE_CHOICE",
  "GOODS_TAX_INVOICE_DEFERRED",
  // ── เดือนที่ยื่นแล้ว (T1.7) ──
  "FILED_PERIOD_VAT_CHANGE",
  "FILED_PERIOD_PND_CHANGE",
  // ── ขายไม่มี VAT · JV มือแตะบัญชีภาษี (T1.9) ──
  "SALE_WITHOUT_VAT_REGISTERED",
  "MANUAL_JV_VAT_ACCOUNT",
  // ── ภาษีซื้อ (T1.4 · T1.5) ──
  "INPUT_VAT_VENDOR_NO_TAX_ID",
  "INPUT_VAT_CLAIM_WITHOUT_VENDOR_TAX_ID",
  "INPUT_VAT_CLAIM_PROHIBITED_CATEGORY",
  "INPUT_VAT_NONCLAIM_REASON_DEFAULTED",
  "EXPENSE_PAYEE_MISSING",
  "INPUT_VAT_LATE_CLAIM",
  "INPUT_VAT_LATE_CLAIM_OUT_OF_WINDOW",
  "INPUT_VAT_CLAIM_BEFORE_INVOICE_MONTH",
  "INPUT_VAT_PENDING_PAST_WINDOW",
  // ── POS ชนิด VAT ต่อบรรทัด (T1.8) ──
  "VAT_COLLECTED_ON_BEHALF",
  // ── ต้นฉบับ/สำเนา/ใบแทน (T2.7) ──
  "TAX_INVOICE_ORIGINAL_REPRINT",
  // ── เนื้อหาใบลด/เพิ่มหนี้ (T2.3) ──
  "ADJUST_NOTE_ORIGINAL_MISSING",
  "ADJUST_NOTE_REASON_GROUP_MISMATCH",
  // ── ถ้อยคำท้ายใบกำกับ (T2.10) ──
  "TAX_INVOICE_SECTION_TEXT_FORCED",
  // ── ใบกำกับตอนรับเงิน · ใบเสร็จ · ยกเลิกและออกแทน (T2.6 · T2.8 · T2.2 — เลน 1) ──
  "PAYMENT_TAX_INVOICE_EARLIER_MONTH",
  "RECEIPT_SELLER_TAX_ID_MISSING",
  "TAX_INVOICE_REPLACE",
  // ── ใบกำกับเต็มรูปครบรายการ · ใบเสร็จอัตโนมัติ · มัดจำ (T2.1 · T2c A6 · T2.4 — เลน 1) ──
  "TAX_INVOICE_BUYER_NAME_MISSING",
  "TAX_INVOICE_BUYER_ADDRESS_MISSING",
  "RECEIPT_AUTO_OFF",
  "DEPOSIT_REFUND_CREDIT_NOTE",
  "DEPOSIT_FORFEIT_VAT",
  // ── หัก ณ ที่จ่าย: แผงรับ/จ่าย · ฐาน · ตัวช่วย · e-WHT · กำหนดยื่น (T3.1 · T3.2 · T3.6 · T3.7 — เลน 1) ──
  "WHT_RATE_DIFFERS_FROM_TABLE",
  "WHT_TABLE_NO_DUTY",
  "WHT_PROGRESSIVE_MANUAL",
  "WHT_FOREIGN_NO_WITHHOLD",
  "WHT_AGENT_VENDOR",
  "WHT_BELOW_MINIMUM",
  "WHT_MINIMUM_CUMULATIVE",
  "WHT_AMOUNT_DIFFERS",
  "WHT_GROSS_UP",
  "WHT_EWHT_CHANNEL",
  "WHT_ON_FEE",
  "WHT_FILING_DUE",
  // ── 50 ทวิ ตามแบบ · ภ.ง.ด. แยกแบบ · ค้างรับ 50 ทวิ (T3.3 T3.4 T3.5 · เลน 2) ──
  "WHT_FORM_UNVERIFIED",
  "WHT_PAID_WITHOUT_CERT",
  "WHT_CERT_REPLACE",
  "WHT_ADDITIONAL_FILING",
  "WHT_CREDIT_CERT_OWED",
  // ── สมุดบัญชี: JV มือ · รายงานสมุด · ค่าเสื่อม · งบ/รอบบัญชี (T4.1 T4.2 T4.3 T4.6 · เลน 2) ──
  "JV_DESCRIPTION_MISSING",
  "JV_LATE_ENTRY",
  "JV_LATE_ENTRY_ASSUMED",
  "JV_UNAPPROVED",
  "JV_NO_SUPPORTING_DOC",
  "BOOK_REPORT_ORG_NAME_MISSING",
  "ASSET_LAND_NOT_DEPRECIATED",
  "ASSET_TAX_RATE_ABOVE_CEILING",
  "ASSET_PASSENGER_CAR_COST_CAP",
  "STATEMENT_DRAFT_FOR_ACCOUNTANT",
  "FISCAL_YEAR_CHANGE",
  "FIRST_PERIOD_SHORT",
  // ── ฟีเจอร์ภาษีที่ขาด: ปฏิทินภาษี · เงินสดรับ-จ่าย · เกณฑ์จด VAT · บวกกลับ · เฉลี่ยภาษีซื้อ/ภ.พ.36/อากร · หนี้สูญ (T5.1 T5.2 T5.3 T5.5 T5.6 T5.7 · เลน 2) ──
  "TAX_CALENDAR_DUE",
  "CASH_BOOK_DUTY",
  "CASH_BOOK_FORMAT_UNVERIFIED",
  "VAT_REG_THRESHOLD_NEAR",
  "VAT_REG_THRESHOLD_EXCEEDED",
  "VAT_REG_MEASURE_DEFAULT",
  "TAX_ADD_BACK_FLAGGED",
  "ENTERTAINMENT_CAP_EXCEEDED",
  "ENTERTAINMENT_GIFT_CHECK",
  "INPUT_VAT_APPORTIONMENT",
  "PP36_FOREIGN_SERVICE",
  "STAMP_DUTY_INSTRUMENT",
  "BAD_DEBT_TAX_CONDITIONS",
  "BAD_DEBT_ALLOWANCE_ADD_BACK",
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
  TAX_REPORT_ORG_NAME_MISSING: {
    code: "TAX_REPORT_ORG_NAME_MISSING",
    titleTh: "หัวรายงานภาษีไม่มีชื่อผู้ประกอบการ",
    messageTh: (p) => `ยังไม่ได้กรอกชื่อกิจการ — หัว${s(p, "report", "รายงานภาษี")}ต้องมีชื่อผู้ประกอบการ · กรอกได้ที่ ตั้งค่า › ข้อมูลกิจการ`,
    citation: "ประมวลรัษฎากร ม.87 · ประกาศอธิบดีฯ เรื่อง VAT ฉบับที่ 89 (หัวรายงาน: เดือนภาษี ชื่อ เลขประจำตัวผู้เสียภาษี สำนักงานใหญ่/สาขา) · references/common-vat-invoice.md §18",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  TAX_REPORT_TAX_ID_MISSING: {
    code: "TAX_REPORT_TAX_ID_MISSING",
    titleTh: "หัวรายงานภาษีไม่มีเลขประจำตัวผู้เสียภาษี",
    messageTh: (p) => `เลขประจำตัวผู้เสียภาษีของกิจการยังไม่ครบ 13 หลัก — หัว${s(p, "report", "รายงานภาษี")}ต้องมีเลขนี้ · กรอกได้ที่ ตั้งค่า › ข้อมูลกิจการ`,
    citation: "ประมวลรัษฎากร ม.87 · ประกาศอธิบดีฯ เรื่อง VAT ฉบับที่ 89 (หัวรายงาน: เดือนภาษี ชื่อ เลขประจำตัวผู้เสียภาษี สำนักงานใหญ่/สาขา) · references/common-vat-invoice.md §18",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  PP30_EXCESS_REFUND: {
    code: "PP30_EXCESS_REFUND",
    titleTh: "เลือกขอคืนภาษีที่ชำระเกิน",
    messageTh: (p) => `เดือนนี้ภาษีซื้อมากกว่าภาษีขาย ชำระเกินสุทธิ ${s(p, "amount")} บาท และเลือก "ขอคืนเป็นเงินสด" — ระบบจะไม่ยกจำนวนนี้ไปเป็นเครดิตภาษีของเดือนถัดไป (ม.84 ให้เลือกยกไปหรือขอคืน)`,
    citation: "ประมวลรัษฎากร ม.84 · references/common-vat-invoice.md §19",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  PP30_CREDIT_CARRY_OVERRIDDEN: {
    code: "PP30_CREDIT_CARRY_OVERRIDDEN",
    titleTh: "เครดิตภาษียกมาที่ร้านแก้เอง",
    messageTh: (p) => `เครดิตภาษียกมาของเดือนนี้ร้านแก้เป็น ${s(p, "shop")} บาท ต่างจากที่ระบบคิดจากเดือนก่อน ${s(p, "system")} บาท — ระบบใช้ค่าของร้าน`,
    citation: "references/common-vat-invoice.md §19 (เครดิตยกมา · ม.84)",
    tag: "S",
    checkedAt: "2026-11-13",
    ack: false,
  },
  PP30_FILED_DIFFERS: {
    code: "PP30_FILED_DIFFERS",
    titleTh: "ยอดในสมุดต่างจากแบบที่ยื่นแล้ว",
    messageTh: (p) => `เดือนภาษี ${s(p, "period")} ทำเครื่องหมายยื่นแล้ว แต่ยอดในสมุดตอนนี้ต่างจากยอดที่ยื่น — ถ้าแบบที่ยื่นไปผิด ต้องยื่นแบบเพิ่มเติม`,
    citation: "ประมวลรัษฎากร ม.83 · references/common-vat-invoice.md §19 (แบบเพิ่มเติมเมื่อยื่นผิด)",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  PP30_ADDITIONAL_SURCHARGE: {
    code: "PP30_ADDITIONAL_SURCHARGE",
    titleTh: "แบบเพิ่มเติมมีภาษีต้องชำระเพิ่ม",
    messageTh: (p) => `แบบยื่นเพิ่มเติมนี้มีภาษีต้องชำระเพิ่ม ${s(p, "amount")} บาท — อาจมีเงินเพิ่ม (ม.89/1) และเบี้ยปรับ (ม.89) ซึ่งมีระเบียบลดเบี้ยปรับ ระบบไม่ได้คำนวณให้ ${CHECK_WITH_ACCOUNTANT_TH}`,
    citation: "ประมวลรัษฎากร ม.89, 89/1 · references/common-vat-invoice.md §19 (ระเบียบลดเบี้ยปรับ [S])",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  PP30_DECLARED_DIFFERS: {
    code: "PP30_DECLARED_DIFFERS",
    titleTh: "ยอดที่แจ้งว่ายื่นไม่ตรงกับสมุด",
    messageTh: (p) => `ยอดที่แจ้งว่ายื่น (ภาษีขาย ${s(p, "declaredOut")} · ภาษีซื้อ ${s(p, "declaredIn")}) ไม่ตรงกับสมุด (ภาษีขาย ${s(p, "bookOut")} · ภาษีซื้อ ${s(p, "bookIn")}) — ภ.พ.30 ควรตรงกับรายงานภาษีขาย/ซื้อ (ม.87) · ระบบเก็บยอดจากสมุดเป็นภาพที่ยื่น`,
    citation: "references/common-vat-invoice.md §18–19 · test-rules T-ACC-03",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  PP30_LEGACY_FILING: {
    code: "PP30_LEGACY_FILING",
    titleTh: "แบบที่ยื่นก่อนระบบเก็บครบทุกช่อง",
    messageTh: () => "เดือนนี้ทำเครื่องหมายยื่นก่อนระบบเก็บตัวเลขครบทุกช่อง — มีแค่ภาษีขาย/ภาษีซื้อ/ยอดสุทธิ ผลต่างของช่องอื่นเทียบกับศูนย์",
    citation: "references/common-vat-invoice.md §19",
    tag: "S",
    checkedAt: "2026-11-13",
    ack: false,
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
  FILED_PERIOD_VAT_CHANGE: {
    code: "FILED_PERIOD_VAT_CHANGE",
    titleTh: "รายการนี้เปลี่ยนภาษีของเดือนที่ยื่น ภ.พ.30 แล้ว",
    messageTh: (p) =>
      `เดือนภาษี ${s(p, "period")} ทำเครื่องหมายยื่น ภ.พ.30 แล้ว — รายการนี้ (${s(p, "ref")}) ลงเดือนนั้นและเปลี่ยนภาษีขาย ${s(p, "output", "0.00")} · ภาษีซื้อ ${s(p, "input", "0.00")}${p.parked ? ` · ยอดพัก ${s(p, "parked")}` : ""} บาท — ยอดในสมุดจะต่างจากแบบที่ยื่น ถ้าแบบที่ยื่นไปผิดต้องยื่นแบบเพิ่มเติม (รายการนี้จะขึ้นใน "ผลต่างหลังยื่น" ของเดือนนั้น)`,
    citation: "ประมวลรัษฎากร ม.83 (แบบเพิ่มเติมเมื่อยื่นผิด) · references/common-vat-invoice.md §19 · §18 (ประกาศ VAT ฉ.89 ข้อ 12(ข): แก้ด้วยรายการปรับปรุง + รายงานการแก้ไข)",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: true,
  },
  FILED_PERIOD_PND_CHANGE: {
    code: "FILED_PERIOD_PND_CHANGE",
    titleTh: "รายการนี้เปลี่ยน ภ.ง.ด. ของเดือนที่ทำเครื่องหมายนำส่งแล้ว",
    messageTh: (p) =>
      `เดือน ${s(p, "period")} ทำเครื่องหมายนำส่ง ${s(p, "forms", "ภ.ง.ด.")} แล้ว — รายการนี้ (${s(p, "ref")}) ${s(p, "what", "เปลี่ยนภาษีหัก ณ ที่จ่ายของเดือนนั้น")} ${s(p, "amount", "")} — รายการที่ยื่นไปจะไม่ตรงกับสมุด อาจต้องยื่นเพิ่มเติม (ขึ้นใน "ผลต่างหลังยื่น" ของเดือนนั้น)`,
    citation: "references/common-withholding-tax.md (ภ.ง.ด.3/53 ยื่นรายเดือน · ใบแนบต่อรายการ) · references/domain-accounting-books.md (ป.121/2545 ข้อ 6: แก้ไขต้องมีร่องรอย/รายงานการแก้ไข) — ไม่พบกติกาแบบเพิ่มเติมของ ภ.ง.ด. ในแหล่งที่ระบบใช้",
    tag: "S",
    checkedAt: "2026-11-13",
    ack: true,
  },
  SALE_WITHOUT_VAT_REGISTERED: {
    code: "SALE_WITHOUT_VAT_REGISTERED",
    titleTh: "กิจการจด VAT แต่เอกสารขายนี้ไม่มี VAT",
    messageTh: (p) =>
      `กิจการจดทะเบียน VAT แล้ว แต่${s(p, "doc", "เอกสารขายนี้")}ไม่คิด VAT ${s(p, "amount", "")}${p.lines ? ` (${s(p, "lines")} บรรทัดไม่ได้ระบุว่าอัตรา 0% หรือยกเว้น)` : ""} — ผู้ประกอบการจดทะเบียนเก็บ VAT จากการขายสินค้า/ให้บริการ เว้นแต่เป็นรายการอัตรา 0% (ม.80/1) หรือยกเว้น (ม.81) · ถ้าเป็นรายการยกเว้น/อัตรา 0% ให้เลือกอัตรานั้นที่บรรทัด · รายได้นี้จะขึ้นในรายงาน "รายได้ที่ไม่มี VAT"`,
    citation: "ประมวลรัษฎากร ม.80/1, ม.81 · references/common-vat-invoice.md §1 (ใครต้องเก็บ VAT), §9, §21",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: true,
  },
  MANUAL_JV_VAT_ACCOUNT: {
    code: "MANUAL_JV_VAT_ACCOUNT",
    titleTh: "รายการบัญชีที่บันทึกเองแตะบัญชีภาษี",
    messageTh: (p) =>
      `รายการนี้บันทึกเองและแตะบัญชีภาษี (${s(p, "accounts")}) — ยอดภาษีจะเปลี่ยนโดยไม่มีใบกำกับภาษีรองรับ · รายงานภาษีขาย/ซื้อลงตามใบกำกับ (ม.87) ระบบจะแสดงรายการนี้แยกเป็น "รายการปรับปรุงมือ" ในรายงานภาษีและการกระทบยอด ภ.พ.30`,
    citation: "ประมวลรัษฎากร ม.87 · references/common-vat-invoice.md §18 (ประกาศ VAT ฉ.89: รายงานรายใบ · แก้ด้วยรายการปรับปรุง) · §19",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
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
  // ── ภาษีซื้อ (T1.4) ──
  INPUT_VAT_VENDOR_NO_TAX_ID: {
    code: "INPUT_VAT_VENDOR_NO_TAX_ID",
    titleTh: "คู่ค้าไม่มีเลขประจำตัวผู้เสียภาษี",
    messageTh: (p) =>
      `${p.vendor ? `คู่ค้า ${s(p, "vendor")}` : "เอกสารนี้ยังไม่มีคู่ค้า"} ไม่มีเลขประจำตัวผู้เสียภาษี — ภาษีซื้อเคลมได้เมื่อมีใบกำกับภาษีเต็มรูปที่ถูกต้อง (ไม่มีใบกำกับ/ใบไม่สมบูรณ์ = ภาษีซื้อต้องห้าม ม.82/5(1)(2)) · ระบบตั้งภาษีซื้อ ฿${s(p, "vat")} เป็น "${s(p, "status")}" ให้ก่อน เปลี่ยนได้ที่ช่องภาษีซื้อ`,
    citation: "ประมวลรัษฎากร ม.82/5(1)(2), ม.86/4 · references/common-vat-invoice.md §5, §17 · audit-checklist-accounting.md C1",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  INPUT_VAT_CLAIM_WITHOUT_VENDOR_TAX_ID: {
    code: "INPUT_VAT_CLAIM_WITHOUT_VENDOR_TAX_ID",
    titleTh: "เคลมภาษีซื้อจากคู่ค้าที่ไม่มีเลขผู้เสียภาษี",
    messageTh: (p) =>
      `เลือกเคลมภาษีซื้อ ฿${s(p, "vat")} ทั้งที่${p.vendor ? `คู่ค้า ${s(p, "vendor")}` : "เอกสาร"}ไม่มีเลขประจำตัวผู้เสียภาษี — เคลมได้เฉพาะเมื่อได้รับใบกำกับภาษีเต็มรูปที่ถูกต้องแล้ว (ม.82/5(1)(2)) · ถ้ามีใบกำกับแล้วให้กรอกเลขผู้เสียภาษีของคู่ค้า · กดยืนยันเพื่อเคลมตามที่เลือก`,
    citation: "ประมวลรัษฎากร ม.82/5(1)(2), ม.86/4 · references/common-vat-invoice.md §5, §17 · audit-checklist-accounting.md C1",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: true,
  },
  INPUT_VAT_CLAIM_PROHIBITED_CATEGORY: {
    code: "INPUT_VAT_CLAIM_PROHIBITED_CATEGORY",
    titleTh: "เคลมภาษีซื้อในหมวดที่ภาษีซื้อต้องห้าม",
    messageTh: (p) =>
      `บรรทัด "${s(p, "line")}" ลงบัญชีหมวด ${s(p, "reason")} ซึ่งภาษีซื้อเป็นภาษีซื้อต้องห้าม (${s(p, "section")}) แต่เลือกเคลม ฿${s(p, "vat")} — กดยืนยันเพื่อเคลมตามที่เลือก`,
    citation: "ประมวลรัษฎากร ม.82/5 · ประกาศ VAT ฉ.17, ฉ.42 · references/common-vat-invoice.md §17 · audit-checklist-accounting.md C2",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: true,
  },
  INPUT_VAT_NONCLAIM_REASON_DEFAULTED: {
    code: "INPUT_VAT_NONCLAIM_REASON_DEFAULTED",
    titleTh: "ไม่ได้ระบุเหตุที่เคลมไม่ได้",
    messageTh: (p) =>
      `ภาษีซื้อที่เคลมไม่ได้ ฿${s(p, "vat")} ไม่ได้ระบุเหตุ — ระบบลงเป็น "ภาษีซื้อไม่ขอคืน (รายจ่ายต้องห้าม)" ไว้ก่อน (ภาษีซื้อต้องห้ามตาม ม.82/5(4) ค่ารับรอง และ (6) เป็นรายจ่ายได้ · (1)(2)(3)(5) เป็นรายจ่ายไม่ได้) · เลือกเหตุได้ที่ช่องภาษีซื้อ`,
    citation: "ประมวลรัษฎากร ม.65 ตรี (6 ทวิ), ม.82/5 · references/domain-business-income-tax.md §ก4",
    tag: "S",
    checkedAt: "2026-11-13",
    ack: false,
  },
  EXPENSE_PAYEE_MISSING: {
    code: "EXPENSE_PAYEE_MISSING",
    titleTh: "รายจ่ายไม่มีชื่อผู้รับ",
    messageTh: () =>
      "ยังไม่ได้เลือกผู้รับเงิน (คู่ค้า) — บันทึกได้ แต่รายจ่ายที่พิสูจน์ไม่ได้ว่าใครเป็นผู้รับเป็นรายจ่ายต้องห้ามทางภาษีเงินได้ (ม.65 ตรี (18)) · ควรเลือกคู่ค้าและแนบหลักฐานการจ่าย",
    citation: "ประมวลรัษฎากร ม.65 ตรี (18) · references/domain-business-income-tax.md §ก4 (18) · audit-checklist-accounting.md C6",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  // ── ภาษีซื้อข้ามเดือน (T1.5) ──
  INPUT_VAT_LATE_CLAIM: {
    code: "INPUT_VAT_LATE_CLAIM",
    titleTh: "เคลมภาษีซื้อข้ามเดือน",
    messageTh: (p) =>
      `ใบกำกับลงวันที่เดือน ${s(p, "invoiceMonth")} นำมาเคลมในเดือนภาษี ${s(p, "claimMonth")} (เดือนที่ ${s(p, "months")} นับแต่เดือนถัดจากเดือนที่ออกใบ · เพดาน ${s(p, "limit")} เดือน) — ใช้ได้เมื่อมีเหตุจำเป็น และต้องระบุ "${s(p, "note")}" บนใบกำกับ · ระบบเก็บข้อความนี้ไว้กับเอกสารและรายงานภาษีซื้อ`,
    citation: "ประกาศอธิบดีฯ เรื่อง VAT ฉบับที่ 4 ข้อ 2 · references/common-vat-invoice.md §17 · audit-checklist-accounting.md C3",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  INPUT_VAT_LATE_CLAIM_OUT_OF_WINDOW: {
    code: "INPUT_VAT_LATE_CLAIM_OUT_OF_WINDOW",
    titleTh: "เคลมภาษีซื้อเกินเพดานเดือน",
    messageTh: (p) =>
      `ใบกำกับลงวันที่เดือน ${s(p, "invoiceMonth")} นำมาเคลมในเดือนภาษี ${s(p, "claimMonth")} = เดือนที่ ${s(p, "months")} นับแต่เดือนถัดจากเดือนที่ออกใบ เกินเพดาน ${s(p, "limit")} เดือน (ประกาศ VAT ฉ.4 ข้อ 2 · ตัวบทให้ไม่เกิน 3 ปี ม.82/3 ว.สี่) — ภาษีซื้อนี้อาจใช้เคลมในเดือนนี้ไม่ได้ · กดยืนยันเพื่อบันทึกตามที่เลือก`,
    citation: "ประกาศอธิบดีฯ เรื่อง VAT ฉบับที่ 4 ข้อ 2 · ประมวลรัษฎากร ม.82/3 ว.สี่ · references/common-vat-invoice.md §17 · audit-checklist-accounting.md C3",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: true,
  },
  INPUT_VAT_CLAIM_BEFORE_INVOICE_MONTH: {
    code: "INPUT_VAT_CLAIM_BEFORE_INVOICE_MONTH",
    titleTh: "เดือนที่เคลมอยู่ก่อนเดือนของใบกำกับ",
    messageTh: (p) =>
      `เดือนภาษีที่เลือกเคลม (${s(p, "claimMonth")}) อยู่ก่อนเดือนของใบกำกับ (${s(p, "invoiceMonth")}) — ปกติเคลมได้ตั้งแต่เดือนของใบกำกับ ตรวจวันที่อีกครั้ง · กดยืนยันเพื่อบันทึกตามที่เลือก`,
    citation: "references/common-vat-invoice.md §17 (เดือนที่ใช้: ปกติเดือนของใบกำกับ)",
    tag: "S",
    checkedAt: "2026-11-13",
    ack: true,
  },
  INPUT_VAT_PENDING_PAST_WINDOW: {
    code: "INPUT_VAT_PENDING_PAST_WINDOW",
    titleTh: "ภาษีซื้อรอใบกำกับเกินเพดานเดือน",
    messageTh: (p) =>
      `ภาษีซื้อ ฿${s(p, "vat")} ของ ${s(p, "docNo")} (ลงวันที่ ${s(p, "date")}) ยังรอใบกำกับ เลยเดือนภาษี ${s(p, "lastMonth")} ซึ่งเป็นเดือนสุดท้ายที่เคลมได้ตามเพดาน ${s(p, "limit")} เดือน (นับจากเดือนของเอกสารต้นทาง) — ถ้าใบกำกับไม่มาแล้วให้บันทึกเป็น "เคลมไม่ได้"`,
    citation: "ประกาศอธิบดีฯ เรื่อง VAT ฉบับที่ 4 ข้อ 2 · references/common-vat-invoice.md §17",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  // ── POS ชนิด VAT ต่อบรรทัด (T1.8) ──
  VAT_COLLECTED_ON_BEHALF: {
    code: "VAT_COLLECTED_ON_BEHALF",
    titleTh: "รายการเก็บแทน (นอกฐานภาษีมูลค่าเพิ่ม)",
    messageTh: (p) =>
      `${p.name ? `"${s(p, "name")}" ` : ""}ตั้งเป็น "เก็บแทน" — ยอดนี้ไม่เข้ารายได้และไม่อยู่ในฐาน VAT ได้ก็ต่อเมื่อครบทั้ง 4 ข้อ: (1) ไม่ใช่ราคาเหมา และแจกแจงรายการให้ลูกค้าทราบชัดแจ้ง (2) เก็บเท่าที่ต้องจ่ายจริง ไม่บวกเพิ่ม (บวกเพิ่มแม้ร้อยละ 5 หรือ 10 = ทั้งก้อนเป็นค่าบริการ) (3) มีหลักฐานการจ่าย เช่นใบเสร็จ/ใบกำกับในชื่อลูกค้าและส่งมอบให้ลูกค้า (4) ส่วนลดที่ได้จากผู้รับเงินคืนลูกค้าทั้งหมด · ภาษีซื้อของรายจ่ายที่ทดรองแทนลูกค้าใช้เป็นภาษีซื้อของร้านไม่ได้ · ระบบลงบัญชีเงินรับแทน (หนี้สิน) ไม่คิดส่วนลด/ค่าคอมฯ กับรายการนี้ · กดยืนยันเพื่อบันทึก`,
    citation: "หนังสือตอบข้อหารือ กค 0706/พ./625 ลว. 28 ม.ค. 2551 · กค 0811/11473 ลว. 12 ธ.ค. 2544 ข้อ 2.3 · กค 0702/พ./7308 ลว. 11 ส.ค. 2558 · กค 0706/พ./8779 ลว. 21 ต.ค. 2548 · references/common-vat-invoice.md §3 · audit-checklist-accounting.md E11",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: true,
  },
  TAX_INVOICE_ORIGINAL_REPRINT: {
    code: "TAX_INVOICE_ORIGINAL_REPRINT",
    titleTh: "พิมพ์ต้นฉบับใบกำกับภาษีซ้ำ",
    messageTh: (p) =>
      `ใบกำกับภาษี${p.docNo ? `เลขที่ ${s(p, "docNo")} ` : ""}พิมพ์ต้นฉบับไปแล้ว — ต้นฉบับให้ผู้ซื้อ สำเนาเก็บไว้ (ป.86/2542 ข้อ 4) และฉบับที่ไม่ใช่ฉบับแรกของชุดต้องเป็น "สำเนาใบกำกับภาษี" ที่มีคำว่า "เอกสารออกเป็นชุด" (ประกาศ VAT ฉ.39 ข้อ 1) · ลูกค้าทำต้นฉบับหายให้ออก "ใบแทน" (ม.86/12) · กดยืนยันเพื่อพิมพ์ต้นฉบับซ้ำ${p.n ? ` (ครั้งที่ ${s(p, "n")})` : ""} — ระบบบันทึกผู้ยืนยัน`,
    citation: "ประกาศอธิบดีฯ เรื่อง VAT ฉบับที่ 39 ข้อ 1 · คำสั่ง ป.86/2542 ข้อ 4 · ประมวลรัษฎากร ม.86/12 · ประกาศ VAT ฉ.36 · references/common-vat-invoice.md §14 · audit-checklist-accounting.md B5 B6",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: true,
  },
  ADJUST_NOTE_ORIGINAL_MISSING: {
    code: "ADJUST_NOTE_ORIGINAL_MISSING",
    titleTh: "ใบลด/เพิ่มหนี้ไม่อ้างอิงใบกำกับภาษีเดิม",
    messageTh: (p) =>
      p.side === "purchase"
        ? "ใบลดหนี้/ใบเพิ่มหนี้ที่ได้รับยังไม่ได้บันทึกเลขที่และวันที่เอกสารของผู้ขาย — รายการตาม ม.86/9–86/10 ต้องมีเลขใบกำกับภาษีเดิม · บันทึกให้ครบเพื่อใช้ลงรายงานภาษีซื้อ · กดยืนยันเพื่อบันทึกโดยไม่มีข้อมูลนี้"
        : "ยังไม่ได้อ้างอิงใบกำกับภาษีเดิม — ใบลดหนี้/ใบเพิ่มหนี้ต้องระบุเลขใบกำกับเดิม มูลค่าเดิม มูลค่าที่ถูกต้อง ผลต่าง และภาษี (ม.86/10 · ฉบับหนึ่งอ้างหลายใบได้) · ถ้าใบเดิมไม่ได้อยู่ในระบบ ให้ใส่เลขที่ใบเดิมในช่อง \"อ้างอิง\" · กดยืนยันเพื่อออกใบนี้โดยไม่อ้างอิงเอกสารในระบบ",
    citation: "ประมวลรัษฎากร ม.86/9, 86/10 · references/common-vat-invoice.md §16 · audit-checklist-accounting.md B10",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: true,
  },
  ADJUST_NOTE_REASON_GROUP_MISMATCH: {
    code: "ADJUST_NOTE_REASON_GROUP_MISMATCH",
    titleTh: "เหตุผลไม่ตรงชนิดเอกสาร",
    messageTh: (p) =>
      `เหตุผล "${s(p, "reason")}" เป็นเหตุของ${p.group === "DEBIT" ? "ใบเพิ่มหนี้ (ม.82/9)" : "ใบลดหนี้ (ประกาศ VAT ฉ.82 ข้อ 2)"} แต่เอกสารนี้เป็น${p.docKind === "DEBIT" ? "ใบเพิ่มหนี้" : "ใบลดหนี้"} — เลือกเหตุผลของชนิดเอกสารนี้ หรือ "อื่น ๆ" พร้อมระบุสาเหตุ · กดยืนยันเพื่อบันทึกตามที่เลือก`,
    citation: "ประมวลรัษฎากร ม.82/9, 82/10 · ประกาศ VAT ฉ.82 ข้อ 2 · references/common-vat-invoice.md §7, §16 · audit-checklist-accounting.md B10 B11",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: true,
  },
  TAX_INVOICE_SECTION_TEXT_FORCED: {
    code: "TAX_INVOICE_SECTION_TEXT_FORCED",
    titleTh: "บังคับพิมพ์ \"ออกตามมาตรา 86/4\" แม้ใบไม่ครบรายการ",
    messageTh: (p) =>
      `ตั้งให้พิมพ์ "ใบกำกับภาษีนี้ออกตามมาตรา 86/4 แห่งประมวลรัษฎากร" ทุกใบ — ข้อความนี้ยืนยันว่าใบมีรายการครบตาม ม.86/4 (คำว่าใบกำกับภาษี · ชื่อ ที่อยู่ เลขผู้เสียภาษีของผู้ออก · ชื่อ ที่อยู่ผู้ซื้อ · เลขที่ · รายการ · VAT แยก · วันที่ · สาขาตามประกาศ ฉ.39)${p.missing ? ` · ใบที่ขาด: ${s(p, "missing")}` : ""} · ค่าเริ่มต้น (อัตโนมัติ) พิมพ์เฉพาะใบที่ครบ · กดยืนยันเพื่อบังคับพิมพ์`,
    citation: "ประมวลรัษฎากร ม.86/4 · ประกาศ VAT ฉ.39 ข้อ 7–9 · references/common-vat-invoice.md §5, §14",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: true,
  },
  PAYMENT_TAX_INVOICE_EARLIER_MONTH: {
    code: "PAYMENT_TAX_INVOICE_EARLIER_MONTH",
    titleTh: "บันทึกรับเงินย้อนหลังข้ามเดือน",
    messageTh: (p) =>
      `วันที่รับเงิน ${s(p, "paidAt")} อยู่ในเดือน ${s(p, "paidMonth")} ซึ่งก่อนเดือนนี้ (${s(p, "nowMonth")}) — ใบกำกับภาษี${s(p, "docNo", "")}ของงวดนี้ลงวันที่รับเงิน ภาษีขาย ฿${s(p, "vat")} จึงเข้าเดือนภาษี ${s(p, "paidMonth")} ` +
      `(ความรับผิดของค่าบริการ/เงินมัดจำเกิดเมื่อได้รับชำระ ม.78/1(1) · ป.73/2541 ข้อ 2(3)(ข) และต้องออกใบกำกับในทันที ม.86) · ` +
      `การออกใบกำกับตามหลังโดยลงวันที่รับเงินย้อนหลังไม่มีแนวทางระบุไว้ ถ้าเดือน ${s(p, "paidMonth")} ยื่น ภ.พ.30 ไปแล้วอาจต้องยื่นเพิ่มเติม`,
    citation: "ประมวลรัษฎากร ม.78/1(1), ม.86 · ป.73/2541 ข้อ 2(3)(ข) · references/common-vat-invoice.md §4",
    tag: "U",
    checkedAt: "2026-11-13",
    ack: false,
  },
  RECEIPT_SELLER_TAX_ID_MISSING: {
    code: "RECEIPT_SELLER_TAX_ID_MISSING",
    titleTh: "ร้านยังไม่กรอกเลขประจำตัวผู้เสียภาษี",
    messageTh: () =>
      `ใบรับ (ใบเสร็จรับเงิน) ต้องแสดงเลขประจำตัวผู้เสียภาษีอากรของผู้ออก (ม.105 ทวิ) แต่ร้านยังไม่ได้กรอกเลขผู้เสียภาษีในตั้งค่ากิจการ — ใบเสร็จจะพิมพ์โดยไม่มีเลขนี้ · กรอกได้ที่ ตั้งค่า › กิจการ`,
    citation: "ประมวลรัษฎากร ม.105 ทวิ · references/domain-accounting-books.md §ง1 · audit-checklist-accounting.md B8",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  TAX_INVOICE_REPLACE: {
    code: "TAX_INVOICE_REPLACE",
    titleTh: "ยกเลิกใบกำกับภาษีและออกฉบับใหม่แทน",
    messageTh: (p) =>
      `จะยกเลิกใบกำกับภาษีเลขที่ ${s(p, "oldNo")} (ลงวันที่ ${s(p, "oldDate")}) แล้วออกฉบับใหม่เลขที่ใหม่ ลงวันที่ ${s(p, "newDate")} พร้อมหมายเหตุ "ออกแทนฉบับเดิมเลขที่ ${s(p, "oldNo")}" — ` +
      `ใช้สำหรับใบที่รายการผิดเท่านั้น (คืนสินค้า/ลดราคา ให้ออกใบลดหนี้) · ให้เรียกคืนฉบับเดิมจากผู้ซื้อมาเก็บรวมกับสำเนา · ` +
      `ฉบับใหม่ลงวันที่ตรงกับฉบับเดิมตามแนวทางใบกำกับกระดาษ (e-Tax Invoice ใช้วันที่ใหม่)${s(p, "filed", "") ? ` · ${s(p, "filed")}` : ""}`,
    citation: "ประกาศอธิบดีฯ เรื่อง VAT (ป.86/2542) ข้อ 25 · ประกาศ VAT ฉ.384 ข้อ 17 (e-Tax) · references/common-vat-invoice.md §14",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: true,
  },

  TAX_INVOICE_BUYER_NAME_MISSING: {
    code: "TAX_INVOICE_BUYER_NAME_MISSING",
    titleTh: "ใบกำกับภาษีไม่มีชื่อผู้ซื้อ",
    messageTh: () =>
      "ใบกำกับภาษีเต็มรูปต้องมีชื่อและที่อยู่ของผู้ซื้อ (ม.86/4(3)) — ใบนี้ยังไม่มีชื่อผู้ซื้อ · เลือกผู้ติดต่อหรือกรอกชื่อผู้ซื้อก่อนออก (ออกได้ แต่ใบจะไม่ครบรายการ ม.86/4 และระบบจะไม่พิมพ์ \"ออกตามมาตรา 86/4\")",
    citation: "ประมวลรัษฎากร ม.86/4(3) · references/common-vat-invoice.md §5 · audit-checklist-accounting.md B1",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  TAX_INVOICE_BUYER_ADDRESS_MISSING: {
    code: "TAX_INVOICE_BUYER_ADDRESS_MISSING",
    titleTh: "ใบกำกับภาษีไม่มีที่อยู่ผู้ซื้อ",
    messageTh: (p) =>
      `ใบกำกับภาษีเต็มรูปต้องมีชื่อและที่อยู่ของผู้ซื้อ (ม.86/4(3))${p.name ? ` — ผู้ซื้อ "${s(p, "name")}" ยังไม่มีที่อยู่` : " — ใบนี้ยังไม่มีที่อยู่ผู้ซื้อ"} · กรอกที่อยู่ที่ผู้ติดต่อหรือบนเอกสารก่อนออก (ออกได้ แต่ใบจะไม่ครบรายการ ม.86/4)`,
    citation: "ประมวลรัษฎากร ม.86/4(3) · references/common-vat-invoice.md §5 · audit-checklist-accounting.md B1",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  RECEIPT_AUTO_OFF: {
    code: "RECEIPT_AUTO_OFF",
    titleTh: "ปิดการออกใบเสร็จอัตโนมัติ",
    messageTh: (p) =>
      `ปิดแล้วระบบจะไม่ออกใบเสร็จให้เองเมื่อรับเงินตามใบแจ้งหนี้ — ร้านยังต้องออกใบรับ (ใบเสร็จ) "ในทันทีทุกคราวที่รับเงิน" เมื่อรับแต่ละครั้งเกิน ฿${s(p, "threshold")} (${s(p, "who")}) (ม.105)` +
      `${p.small ? ` · ${s(p, "small")}` : ""} · ต่ำกว่าเกณฑ์ ผู้จด VAT ต้องรวมยอดสิ้นวันทำบันทึกรายวัน (ม.105 ตรี) · ไม่ออกใบรับมีโทษตาม ม.127 ทวิ · ออกใบเสร็จเองได้ที่หน้าใบแจ้งหนี้ (แปลงเป็นใบเสร็จ) · กดยืนยันเพื่อปิด`,
    citation: "ประมวลรัษฎากร ม.105, ม.105 ตรี, ม.127 ทวิ · ประกาศอธิบดีฯ เกี่ยวกับอากรแสตมป์ ฉ.34 แก้โดย ฉ.49 · references/domain-accounting-books.md §ง1 · audit-checklist-accounting.md B9",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: true,
  },
  DEPOSIT_REFUND_CREDIT_NOTE: {
    code: "DEPOSIT_REFUND_CREDIT_NOTE",
    titleTh: "คืนเงินมัดจำที่ออกใบกำกับภาษีแล้ว = ออกใบลดหนี้",
    messageTh: (p) =>
      `เงินมัดจำนี้ออกใบกำกับภาษีเลขที่ ${s(p, "tiNo")} แล้ว — การคืนเงินมัดจำตามข้อตกลงเป็นเหตุออกใบลดหนี้ (ประกาศ VAT ฉ.82 ข้อ 2(2)) ระบบจะออกใบลดหนี้อ้างใบกำกับนั้น ยอด ฿${s(p, "gross")} (ภาษีที่ลดลง ฿${s(p, "vat")}) ลงวันที่ ${s(p, "date")} ` +
      `· ภาษีขายลดลงในเดือนภาษีที่ออกใบลดหนี้ (ม.82/10 · ม.86/10) · ใบรับเงินมัดจำและใบกำกับเดิมคงอยู่ (ไม่ยกเลิก)`,
    citation: "ประมวลรัษฎากร ม.82/10, ม.86/10 · ประกาศ VAT ฉ.82 ข้อ 2(2) · references/common-vat-invoice.md §7, §16 · domain-shark-accounting-cases.md §2.1 · audit-checklist-accounting.md I3",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  DEPOSIT_FORFEIT_VAT: {
    code: "DEPOSIT_FORFEIT_VAT",
    titleTh: "ริบเงินมัดจำที่ออกใบกำกับภาษีแล้ว",
    messageTh: (p) =>
      (p.mode === "CREDIT_NOTE"
        ? `ร้านตั้งให้ออกใบลดหนี้เมื่อริบมัดจำ — ระบบจะออกใบลดหนี้อ้างใบกำกับเลขที่ ${s(p, "tiNo")} (ภาษีขายลดลง ฿${s(p, "vat")}) และบันทึกเงินที่ริบ ฿${s(p, "gross")} เป็นรายได้ค่าเสียหายที่ไม่มี VAT`
        : `ค่าเริ่มต้น: ไม่ออกใบลดหนี้ — ภาษีขาย ฿${s(p, "vat")} ของใบกำกับเลขที่ ${s(p, "tiNo")} คงไว้ และบันทึกเงินมัดจำที่ริบ (ฐาน ฿${s(p, "base")}) เป็นรายได้`) +
      ` · กรมสรรพากรยังไม่มีแนวทางเรื่องริบมัดจำที่ออกใบกำกับแล้ว (ค่าปรับ/ค่าเสียหายไม่อยู่ในบังคับ VAT — ม.77/2) · เปลี่ยนวิธีได้ที่ ตั้งค่า › เอกสาร › ใบกำกับภาษีอัตโนมัติ`,
    citation: "references/common-vat-invoice.md §7 (ริบมัดจำ [U] · ค่าปรับ/ค่าเสียหาย ม.77/2 · กค 0811/11473 ข้อ 3.3(1) [V]) · audit-checklist-accounting.md I3",
    tag: "U",
    checkedAt: "2026-11-13",
    ack: false,
  },
  // ── ACC T3 (เลน 1) หัก ณ ที่จ่าย ──
  WHT_RATE_DIFFERS_FROM_TABLE: {
    code: "WHT_RATE_DIFFERS_FROM_TABLE",
    titleTh: "อัตราหัก ณ ที่จ่ายต่างจากตาราง",
    messageTh: (p) => `อัตราที่เลือก ${s(p, "rate")} ต่างจากตารางค่ากฎหมาย (${s(p, "table")} สำหรับ${s(p, "code")} · ผู้รับ: ${s(p, "recipient")}) — ระบบบันทึกตามที่เลือก ${CHECK_WITH_ACCOUNTANT_TH}`,
    citation: "references/common-withholding-tax.md §2, §10 (ท.ป.4/2528)",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  WHT_TABLE_NO_DUTY: {
    code: "WHT_TABLE_NO_DUTY",
    titleTh: "ตารางระบุว่าไม่ต้องหัก",
    messageTh: (p) => `ตามตารางค่ากฎหมาย ${s(p, "code")} ที่จ่ายให้${s(p, "recipient")} โดยผู้จ่ายประเภทนี้ไม่มีหน้าที่หักตามคำสั่ง ม.3 เตรส (เช่น ร้านบุคคลธรรมดา/ห้างสามัญจ่ายค่าบริการ ค่าเช่า โฆษณา ขนส่ง) — ร้านยังเลือกหักได้ ระบบบันทึกตามที่เลือก`,
    citation: "references/common-withholding-tax.md §16 · §1",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  WHT_PROGRESSIVE_MANUAL: {
    code: "WHT_PROGRESSIVE_MANUAL",
    titleTh: "อัตราก้าวหน้า ม.50(1) — กรอกยอดเอง",
    messageTh: () => "เงินได้นี้ที่จ่ายให้บุคคลธรรมดาหักตาม ม.50(1) (อัตราก้าวหน้า · ภ.ง.ด.1 · 50 ทวิ ออกภายใน 15 ก.พ. ปีถัดไป) — ระบบไม่คำนวณให้ ร้าน/นักบัญชีกรอกยอดภาษีเอง",
    citation: "references/common-withholding-tax.md §3 (ม.50(1) · กค 0811/10876)",
    tag: "V",
    checkedAt: "2026-11-12",
    ack: false,
  },
  WHT_FOREIGN_NO_WITHHOLD: {
    code: "WHT_FOREIGN_NO_WITHHOLD",
    titleTh: "จ่ายผู้รับต่างประเทศโดยไม่หัก — ยืนยันข้อเท็จจริง",
    messageTh: () => "ค่าเริ่มต้นไม่หักสำหรับผู้รับต่างประเทศที่ทำงานนอกไทย/อยู่ประเทศคู่อนุสัญญาและไม่มีสถานประกอบการถาวรในไทย — ถ้าผู้รับให้บริการในไทยหรือเงินได้เป็น ม.40(2)–(6) ที่ ม.70 บังคับ ต้องหักและยื่น ภ.ง.ด.54 (ภายใน 7 วันนับแต่สิ้นเดือน) · แหล่งข้อมูลขัดกันบางกรณี · เก็บหนังสือรับรองถิ่นที่อยู่ไว้เป็นหลักฐาน · กดยืนยันว่าตรวจข้อเท็จจริงแล้ว",
    citation: "references/common-withholding-tax.md §5 (ม.70 · กค 0706/1552 · กค 0702/6122) — แหล่งขัดกันบางกรณี",
    tag: "V",
    checkedAt: "2026-11-12",
    ack: true,
  },
  WHT_AGENT_VENDOR: {
    code: "WHT_AGENT_VENDOR",
    titleTh: "ผู้ขายเป็นตัวแทนหักภาษี",
    messageTh: () => "ผู้ขายรายนี้ตั้งเป็น \"ตัวแทนหักภาษี\" (ประกาศอธิบดีฯ ภาษีเงินได้ ฉ.457/ฉ.459) — ผู้ขายหักและนำส่ง ภ.ง.ด.53 แทนร้านแล้ว ร้านไม่ต้องหักซ้ำ/ไม่ต้องออก 50 ทวิ · ถ้ายังหักไว้ ระบบบันทึกตามที่เลือกแต่จะไม่ออก 50 ทวิ · แพลตฟอร์มรายใดใช้วิธีนี้ยังไม่ยืนยัน — ตรวจใบเสร็จของผู้ขายว่าระบุอัตราและจำนวนที่หักแทนแล้ว",
    citation: "references/common-withholding-tax.md §16 (ประกาศอธิบดีฯ ฉ.457 แก้โดย ฉ.459 · จ่ายตั้งแต่ 1 ก.ค. 2568) — แพลตฟอร์มรายใดใช้ [U]",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  WHT_BELOW_MINIMUM: {
    code: "WHT_BELOW_MINIMUM",
    titleTh: "ยอดตามสัญญาไม่ถึง 1,000 บาท",
    messageTh: (p) => `ยอดตามสัญญานี้ ฿${s(p, "contract")} ไม่ถึง 1,000 บาท — การจ่ายตามคำสั่ง ท.ป.4/2528 ไม่ต้องหัก (ข้อ 12/7) · ร้านยังเลือกหักได้ ระบบบันทึกตามที่เลือก · ถ้าเป็นสัญญาต่อเนื่องที่ยอดสะสมจะถึง 1,000 ต้องนำยอดครั้งก่อนมารวมหัก`,
    citation: "references/common-withholding-tax.md §11 (ท.ป.4/2528 ข้อ 12/7 · ท.ป.266/2559 · กค 0706/2356) — วัดก่อนหรือรวม VAT [U]",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  WHT_MINIMUM_CUMULATIVE: {
    code: "WHT_MINIMUM_CUMULATIVE",
    titleTh: "งวดนี้ไม่ถึง 1,000 แต่สัญญาถึงขั้นต่ำแล้ว",
    messageTh: (p) => `งวดนี้ ฿${s(p, "instalment")} ไม่ถึง 1,000 บาท แต่ยอดตามสัญญา ฿${s(p, "contract")} ถึงขั้นต่ำแล้ว — ต้องหัก ณ ที่จ่าย "แม้การจ่ายนั้นจะได้แบ่งจ่ายครั้งหนึ่งๆ ไม่ถึงหนึ่งพันบาท" · ระบบบันทึกตามที่เลือก`,
    citation: "references/common-withholding-tax.md §11 (ท.ป.4/2528 ข้อ 12/7 · กค 0706/2356)",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  WHT_AMOUNT_DIFFERS: {
    code: "WHT_AMOUNT_DIFFERS",
    titleTh: "จำนวนภาษีต่างจากฐาน × อัตรา",
    messageTh: (p) => `ภาษีที่กรอก ฿${s(p, "amount")} ต่างจากฐานของงวดนี้ ฿${s(p, "base")} × ${s(p, "rate")} = ฿${s(p, "expected")} (ฐานก่อน VAT เฉพาะรายการที่ต้องหัก ตามสัดส่วนที่จ่าย) — ระบบบันทึกตามที่กรอก · 50 ทวิ ใช้ฐานของงวดนี้`,
    citation: "references/common-withholding-tax.md §12 (ฐานไม่รวม VAT · กค 0811/4132 · หักทุกคราวที่จ่าย)",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  WHT_GROSS_UP: {
    code: "WHT_GROSS_UP",
    titleTh: "ร้านออกภาษีให้ผู้รับ",
    messageTh: (p) => `เงื่อนไข "${s(p, "condition")}" — ร้านจ่ายเงินเต็มให้ผู้รับและออกภาษี ฿${s(p, "tax")} แทน (สูตร ${s(p, "formula")} ตามค่าตั้งของร้าน) · ภาษีที่ออกแทนถือเป็นเงินได้ของผู้รับ 50 ทวิ แสดง "จำนวนเงินที่จ่าย" รวมภาษีนี้ · กรมสรรพากรไม่มีสูตรทางการ และภาษีที่ออกแทนเป็นรายจ่ายต้องห้ามหรือไม่ยังไม่ยืนยัน (ระบบลงบัญชีแยกไว้ที่ 6970)`,
    citation: "references/common-withholding-tax.md §13 (ม.40 ว.แรก · เงื่อนไข 50 ทวิ [V] · สูตรในวงการ [V2] · สูตรทางการไม่พบ)",
    tag: "U",
    checkedAt: "2026-11-13",
    ack: false,
  },
  WHT_EWHT_CHANNEL: {
    code: "WHT_EWHT_CHANNEL",
    titleTh: "นำส่งผ่าน e-Withholding Tax",
    messageTh: (p) => `นำส่งผ่านระบบ e-WHT ของธนาคาร${s(p, "ref", "")} — ใช้อัตราลดตามกฎกระทรวง ฉ.402 (จ่าย 1 ม.ค. 2569 – 31 ธ.ค. 2570) · หลักฐานที่ธนาคารออกใช้แทน 50 ทวิ (ระบบไม่ออก 50 ทวิ) และรายการนี้ไม่รวมในไฟล์ ภ.ง.ด.3/53 ที่ร้านยื่นเอง · หลังวันหมดอายุระบบกลับไปอัตราปกติเอง`,
    citation: "references/common-withholding-tax.md §6, §14 (กฎกระทรวง ฉ.402 · ม.3 ปัณรส · ประกาศอธิบดีฯ ทั่วไป ฉ.20 ข้อ 5)",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  WHT_ON_FEE: {
    code: "WHT_ON_FEE",
    titleTh: "ค่าธรรมเนียมครั้งนี้อาจต้องหัก ณ ที่จ่าย",
    messageTh: (p) => `ค่าธรรมเนียม ฿${s(p, "fee")} ที่ร้านจ่ายผู้ให้บริการ (เช่น ค่าธรรมเนียมรับบัตร/MDR) เป็นค่าบริการที่ร้านนิติบุคคลต้องหัก ณ ที่จ่าย — ธนาคารพาณิชย์ได้ผ่อนผันเมื่อค่าบริการแต่ละครั้งไม่ถึง 1,000 บาท · ค่า GP แพลตฟอร์มเดลิเวอรียังไม่มีข้อหารือตรง ${CHECK_WITH_ACCOUNTANT_TH}`,
    citation: "references/common-withholding-tax.md §16 (คำชี้แจง ท.ป.101/2544 ข้อ 2.4) · §11 (กค 0811/7657) — GP แพลตฟอร์ม [U]",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  WHT_FILING_DUE: {
    code: "WHT_FILING_DUE",
    titleTh: "ใกล้ครบกำหนดยื่นแบบ",
    messageTh: (p) => `${s(p, "form")} งวด ${s(p, "period")} — ยื่นแบบกระดาษภายใน ${s(p, "paper")}${s(p, "online", "") ? ` · ยื่นทางอินเทอร์เน็ตภายใน ${s(p, "online")}` : ""} (วันที่จากตารางค่ากฎหมาย) · ยื่นช้ามีเงินเพิ่ม 1.5% ต่อเดือน`,
    citation: "references/common-withholding-tax.md §8, §15 (ม.52 · ประกาศ กค. ขยายเวลายื่นทางอินเทอร์เน็ต ฉ.7 · ม.27) · references/common-vat-invoice.md §19 (ภ.พ.30)",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  // ── 50 ทวิ ตามแบบ · ภ.ง.ด. แยกแบบ · ค้างรับ 50 ทวิ (T3.3 T3.4 T3.5 · เลน 2) ──
  WHT_FORM_UNVERIFIED: {
    code: "WHT_FORM_UNVERIFIED",
    titleTh: "แบบ ภ.ง.ด. ของรายการนี้ยังไม่ยืนยัน",
    messageTh: (p) => `มีรายการที่จัดเข้า ${s(p, "form")} ตามค่าเริ่มต้นของตาราง${p.note ? ` (${s(p, "note")})` : ""} — ผู้รับประเภทนี้ (เช่น มูลนิธิ/สมาคม หรือผู้รับต่างประเทศ) แหล่งที่ระบบค้นไม่ได้ระบุแบบไว้ตรง ๆ`,
    citation: "references/common-withholding-tax.md §1 §5 §10 · ตาราง SYSTEM_WHT_FORM_ROWS (th-tax-2569.ts)",
    tag: "U",
    checkedAt: "2026-11-13",
    ack: false,
  },
  WHT_PAID_WITHOUT_CERT: {
    code: "WHT_PAID_WITHOUT_CERT",
    titleTh: "หักภาษีไว้แล้วแต่ยังไม่ออก 50 ทวิ",
    messageTh: (p) =>
      `${p.count ? `${s(p, "count")} รายการ` : "รายการนี้"}หักภาษี ณ ที่จ่ายไว้แล้วแต่ยังไม่ออกหนังสือรับรอง (50 ทวิ) — กรณีตามคำสั่ง ม.3 เตรส ต้องออก "ในทันทีทุกครั้งที่มีการหักภาษี ณ ที่จ่าย" (ม.50 ทวิ (1)) · รายการยังต้องนำส่งในแบบ ภ.ง.ด. ของเดือนที่จ่าย จึงแสดงในรายงานแม้ยังไม่มีใบ`,
    citation: "ประมวลรัษฎากร ม.50 ทวิ · คำสั่ง ท.ป.4/2528 ข้อ 13 · references/common-withholding-tax.md §7 §15",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  WHT_CERT_REPLACE: {
    code: "WHT_CERT_REPLACE",
    titleTh: "ยกเลิก 50 ทวิ แล้วออกใบแทน",
    messageTh: (p) =>
      `50 ทวิ${p.docNo ? ` เลขที่ ${s(p, "docNo")}` : ""} จะถูกประทับยกเลิกและเก็บไว้ (ไม่ลบ) · ใบใหม่ได้เลขที่ใหม่ ลงวันที่จ่ายเดิม และหมายเหตุว่าออกแทนฉบับเดิม · เรียกฉบับที่ 1 และ 2 ฉบับเดิมคืนจากผู้ถูกหัก · ไม่พบคำสั่งเฉพาะเรื่องยกเลิก/ออกแทน 50 ทวิ — ระบบใช้หลักเดียวกับการยกเลิกใบกำกับภาษี (ป.86/2542 ข้อ 25) · กดยืนยันเพื่อออกใบแทน`,
    citation: "references/domain-accounting-books.md §ง2 · common-vat-invoice.md §14 (ป.86/2542 ข้อ 25 — เทียบเคียง)",
    tag: "U",
    checkedAt: "2026-11-13",
    ack: true,
  },
  WHT_ADDITIONAL_FILING: {
    code: "WHT_ADDITIONAL_FILING",
    titleTh: "บันทึกแบบยื่นเพิ่มเติม ภ.ง.ด.",
    messageTh: (p) =>
      `${s(p, "form")} เดือน ${s(p, "period")} ทำเครื่องหมายนำส่งไปแล้ว · บันทึกแบบยื่นเพิ่มเติมครั้งที่ ${s(p, "n")} ด้วยภาษีส่วนต่าง ${s(p, "delta")} บาท · ภาษีที่นำส่งไม่ครบ/ล่าช้ามีเงินเพิ่มร้อยละ 1.5 ต่อเดือนหรือเศษของเดือน (ม.27) · รูปแบบการยื่นเพิ่มเติมของ ภ.ง.ด. ระบบยังไม่พบแหล่งที่ระบุตรง · กดยืนยันเพื่อบันทึก`,
    citation: "ประมวลรัษฎากร ม.27 · references/common-withholding-tax.md §15 · ledger/wo-notes/T1.7.md (ภ.ง.ด. ยื่นเพิ่มเติม = ค่าเริ่มต้นของระบบ)",
    tag: "S",
    checkedAt: "2026-11-13",
    ack: true,
  },
  WHT_CREDIT_CERT_OWED: {
    code: "WHT_CREDIT_CERT_OWED",
    titleTh: "ยังไม่ได้รับ 50 ทวิ จากลูกค้า",
    messageTh: (p) =>
      `${p.count ? `${s(p, "count")} รายการ ` : ""}ลูกค้าหักภาษี ณ ที่จ่ายไว้${p.amount ? ` รวม ${s(p, "amount")} บาท` : ""} แต่ยังไม่ได้ทำเครื่องหมายว่าได้รับหนังสือรับรอง (50 ทวิ) — ภาษีที่ถูกหักเป็นเครดิตภาษีของร้าน ใช้หนังสือรับรองเป็นหลักฐานตอนยื่นภาษีเงินได้ · ติดตามขอจากลูกค้า`,
    citation: "ประมวลรัษฎากร ม.50 ทวิ · ม.60 · references/common-withholding-tax.md §15 · audit-checklist-accounting.md F13",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  // ── ACC T4.1 (เลน 2) ▸ JV มือ ──
  JV_DESCRIPTION_MISSING: {
    code: "JV_DESCRIPTION_MISSING",
    titleTh: "รายการบัญชีที่บันทึกเองไม่มีคำอธิบาย",
    messageTh: (p) =>
      p.saved
        ? "รายการนี้บันทึกโดยไม่มีคำอธิบาย (ผู้บันทึกกดยืนยันแล้ว) — บัญชีรายวันทั่วไปต้องมีคำอธิบายรายการ และเอกสารที่จัดทำขึ้นภายในต้องมีคำอธิบาย/วิธีคำนวณ · แก้ด้วยการกลับรายการแล้วบันทึกใหม่พร้อมคำอธิบาย หรือแนบเอกสารภายในที่อธิบายรายการ"
        : "รายการนี้ไม่มีคำอธิบาย — บัญชีรายวันทั่วไปต้องมีคำอธิบายรายการ และเอกสารที่จัดทำขึ้นภายในต้องมีคำอธิบาย/วิธีคำนวณ · ใส่คำอธิบายว่ารายการนี้คืออะไร หรือกดยืนยันเพื่อบันทึกโดยไม่มีคำอธิบาย",
    citation: `ประกาศกรมทะเบียนการค้า เรื่อง กำหนดชนิดของบัญชีที่ต้องจัดทำฯ พ.ศ. 2544 ข้อ 5 · ข้อ 11`,
    tag: "V",
    checkedAt: "2026-11-13",
    ack: true,
  },
  JV_LATE_ENTRY: {
    code: "JV_LATE_ENTRY",
    titleTh: "ลงรายการช้ากว่ากำหนด",
    messageTh: (p) =>
      `รายการวันที่ ${s(p, "date")} บันทึกวันที่ ${s(p, "recorded")} — ช้ากว่ากำหนด ${s(p, "limit")} ${s(p, "rule")} (เกิน ${s(p, "over")}) · ระบบเก็บทั้งวันที่รายการและวันที่บันทึก ใช้ตอบผู้ตรวจได้ · บันทึกต่อได้`,
    citation: `ประกาศกรมทะเบียนการค้า เรื่อง กำหนดชนิดของบัญชีที่ต้องจัดทำฯ พ.ศ. 2544 ข้อ 7 · ประกาศอธิบดีกรมสรรพากรเกี่ยวกับภาษีเงินได้ (ฉบับที่ 161) ข้อ 3`,
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  JV_LATE_ENTRY_ASSUMED: {
    code: "JV_LATE_ENTRY_ASSUMED",
    titleTh: "ลงรายการช้ากว่ากำหนด (ยังไม่ระบุประเภทผู้ประกอบการ)",
    messageTh: (p) =>
      `รายการวันที่ ${s(p, "date")} บันทึกวันที่ ${s(p, "recorded")} — ช้ากว่า ${s(p, "limit")} ${s(p, "rule")} (เกิน ${s(p, "over")}) · ระบบใช้กำหนดของนิติบุคคลไปก่อนเพราะยังไม่ได้ระบุประเภทผู้ประกอบการ (ตั้งค่า › ข้อมูลกิจการ)`,
    citation: `พ.ร.บ.การบัญชี พ.ศ. 2543 ม.8 · ประกาศกรมทะเบียนการค้า พ.ศ. 2544 ข้อ 7 · ประกาศอธิบดีกรมสรรพากรเกี่ยวกับภาษีเงินได้ (ฉบับที่ 161) ข้อ 3 (กำหนดต่างกันตามประเภทผู้ประกอบการ)`,
    tag: "S",
    checkedAt: "2026-11-13",
    ack: false,
  },
  JV_UNAPPROVED: {
    code: "JV_UNAPPROVED",
    titleTh: "รายการที่บันทึกเองยังไม่มีผู้อนุมัติ",
    messageTh: () => "รายการนี้บันทึกเองและยังไม่มีผู้อนุมัติ — เอกสารที่จัดทำขึ้นภายในกิจการต้องมีลายมือชื่อผู้อนุมัติ · กดอนุมัติที่หน้ารายการเมื่อตรวจแล้ว",
    citation: `ประกาศกรมทะเบียนการค้า เรื่อง กำหนดชนิดของบัญชีที่ต้องจัดทำฯ พ.ศ. 2544 ข้อ 11`,
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  JV_NO_SUPPORTING_DOC: {
    code: "JV_NO_SUPPORTING_DOC",
    titleTh: "รายการที่บันทึกเองไม่มีเอกสารประกอบ",
    messageTh: () => "รายการนี้ไม่มีไฟล์แนบหรือเอกสารอ้างอิง — การลงบัญชีรายวันต้องมีเอกสารประกอบทุกรายการ · แนบใบเสร็จ/ใบสำคัญ/สัญญา หรือเอกสารภายในที่มีคำอธิบายและผู้อนุมัติ",
    citation: `ประกาศกรมทะเบียนการค้า เรื่อง กำหนดชนิดของบัญชีที่ต้องจัดทำฯ พ.ศ. 2544 ข้อ 13`,
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  // ── ACC T4.2 (เลน 2) ▸ รายงานสมุดบัญชี ──
  BOOK_REPORT_ORG_NAME_MISSING: {
    code: "BOOK_REPORT_ORG_NAME_MISSING",
    titleTh: "หัวรายงานสมุดบัญชีไม่มีชื่อกิจการ",
    messageTh: (p) => `ยังไม่ได้กรอกชื่อกิจการ — หัว${s(p, "report", "รายงานสมุดบัญชี")}จะไม่มีชื่อกิจการ · กรอกได้ที่ ตั้งค่า › ข้อมูลกิจการ`,
    citation: `ประกาศกรมทะเบียนการค้า เรื่อง กำหนดชนิดของบัญชีที่ต้องจัดทำฯ พ.ศ. 2544 ข้อ 5 (ทุกบัญชีต้องมีชื่อบัญชี วันที่ เลขที่เอกสารอ้างอิง รายการ จำนวนเงิน · เลขหน้าเรียง) — ชื่อกิจการบนหัวรายงานเป็นค่าเริ่มต้นของระบบ`,
    tag: "S",
    checkedAt: "2026-11-13",
    ack: false,
  },
  // ── ACC T4.3 (เลน 2) ▸ ค่าเสื่อม ──
  ASSET_LAND_NOT_DEPRECIATED: {
    code: "ASSET_LAND_NOT_DEPRECIATED",
    titleTh: "ที่ดินไม่คิดค่าเสื่อม",
    messageTh: (p) => `${p.name ? `${s(p, "name")} ` : ""}เป็นที่ดิน — ระบบไม่คิดค่าเสื่อมราคา (มาตรฐาน NPAEs ย่อหน้า 10.25 · พ.ร.ฎ.145 ม.4 คิดค่าเสื่อมได้ "นอกจากที่ดินและสินค้า") · ถ้ามีอาคารบนที่ดินให้ขึ้นทะเบียนอาคารแยก`,
    citation: `มาตรฐานการรายงานทางการเงินสำหรับกิจการที่ไม่มีส่วนได้เสียสาธารณะ (ปรับปรุง 2565) ย่อหน้า 10.25 · พ.ร.ฎ. (ฉบับที่ 145) พ.ศ. 2527 ม.4`,
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  ASSET_TAX_RATE_ABOVE_CEILING: {
    code: "ASSET_TAX_RATE_ABOVE_CEILING",
    titleTh: "อัตราค่าเสื่อมทางบัญชีสูงกว่าเพดานทางภาษี",
    messageTh: (p) =>
      `อายุ ${s(p, "life")} = ค่าเสื่อมประมาณ ${s(p, "rate")} ต่อปี สูงกว่าเพดานทางภาษีของ${s(p, "classLabel")} (${s(p, "ceiling")}) — ทางบัญชีคิดตามที่ตั้งได้ แต่ตอนคำนวณกำไรสุทธิทางภาษี ส่วนที่เกินเพดานหักเป็นรายจ่ายไม่ได้ในรอบนั้น (ผลต่างทางภาษีกับทางบัญชี) · ระบบคิดค่าเสื่อมทางบัญชีตามที่ตั้งเหมือนเดิม`,
    citation: `ประมวลรัษฎากร ม.65 ทวิ (2) · พ.ร.ฎ. (ฉบับที่ 145) พ.ศ. 2527 ม.4 · ม.4 จัตวา`,
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  ASSET_PASSENGER_CAR_COST_CAP: {
    code: "ASSET_PASSENGER_CAR_COST_CAP",
    titleTh: "รถยนต์นั่งราคาเกินฐานค่าเสื่อมทางภาษี",
    messageTh: (p) =>
      `รถยนต์นั่ง/รถยนต์โดยสารไม่เกิน 10 ที่นั่ง ราคา ${s(p, "cost")} บาท — ฐานคิดค่าเสื่อมทางภาษีไม่เกิน ${s(p, "cap")} บาทต่อคัน ส่วนเกิน ${s(p, "excess")} บาทหักเป็นรายจ่ายทางภาษีไม่ได้ · ทางบัญชียังคิดค่าเสื่อมเต็มราคาทุน (ผลต่างทางภาษีกับทางบัญชี)`,
    citation: `พ.ร.ฎ. (ฉบับที่ 145) พ.ศ. 2527 ม.5 · ประมวลรัษฎากร ม.65 ตรี (20) · พ.ร.ฎ. (ฉบับที่ 315)`,
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  // ── ACC T4.6 (เลน 2) ▸ งบการเงิน · รอบบัญชี ──
  STATEMENT_DRAFT_FOR_ACCOUNTANT: {
    code: "STATEMENT_DRAFT_FOR_ACCOUNTANT",
    titleTh: "งบจากระบบเป็นร่าง",
    messageTh: () =>
      "งบนี้คำนวณจากสมุดบัญชีในระบบ เป็นร่างสำหรับผู้ทำบัญชี/ผู้สอบบัญชี — กิจการที่มีหน้าที่จัดทำบัญชีต้องมีผู้ทำบัญชีที่มีคุณสมบัติตามประกาศอธิบดี และงบที่ยื่นต้องผ่านการตรวจตามที่กฎหมายกำหนด",
    citation: `พ.ร.บ.การบัญชี พ.ศ. 2543 ม.11 ม.19 ม.20`,
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  FISCAL_YEAR_CHANGE: {
    code: "FISCAL_YEAR_CHANGE",
    titleTh: "เปลี่ยนรอบปีบัญชี",
    messageTh: (p) =>
      `เปลี่ยนเดือนเริ่มปีบัญชีจาก ${s(p, "from")} เป็น ${s(p, "to")} — สมุดนี้มีรายการบัญชีแล้ว · การเปลี่ยนรอบบัญชีต้องได้รับอนุญาตก่อน (พ.ร.บ.การบัญชี ม.10) และรอบระยะเวลาบัญชีทางภาษีเปลี่ยนได้เมื่อได้รับอนุมัติ · งบและรายงานในระบบจะแบ่งปีตามเดือนใหม่ทันที · กดยืนยันเพื่อบันทึก`,
    citation: `พ.ร.บ.การบัญชี พ.ศ. 2543 ม.10`,
    tag: "V",
    checkedAt: "2026-11-13",
    ack: true,
  },
  FIRST_PERIOD_SHORT: {
    code: "FIRST_PERIOD_SHORT",
    titleTh: "รอบบัญชีแรกสั้นกว่า 12 เดือน",
    messageTh: (p) =>
      `เริ่มทำบัญชี ${s(p, "start")} และปีบัญชีแรกสิ้นสุด ${s(p, "end")} = ${s(p, "months")} เดือน (สั้นกว่า 12 เดือน) — ปิดบัญชีครั้งแรกได้ภายใน ${s(p, "limit")} นับแต่วันเริ่มทำบัญชี · งบปีแรกเป็นรอบไม่เต็มปี และค่าเสื่อมทางภาษีของรอบที่ไม่ถึง 12 เดือนเฉลี่ยตามส่วน`,
    citation: `พ.ร.บ.การบัญชี พ.ศ. 2543 ม.10 · ประมวลรัษฎากร ม.65 ทวิ (2)`,
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  // ── ACC T5.1 (เลน 2) ▸ ปฏิทินภาษีของร้าน (แบบรายปี) ──
  TAX_CALENDAR_DUE: {
    code: "TAX_CALENDAR_DUE",
    titleTh: "ใกล้ครบกำหนดยื่นแบบรายปี",
    messageTh: (p) => `${s(p, "form")} ${s(p, "period")} — ${s(p, "due")}${s(p, "online", "") ? ` · ยื่นทางอินเทอร์เน็ตภายใน ${s(p, "online")}` : ""} (วันที่จากตารางค่ากฎหมาย · ระบบไม่ได้ยื่นแบบแทนร้าน)`,
    citation: "ประมวลรัษฎากร ม.56 ม.56 ทวิ ม.67 ทวิ ม.68 ม.69 · พ.ร.บ.การบัญชี พ.ศ. 2543 ม.11 · ประกาศกระทรวงการคลังเรื่องขยายเวลายื่นทางอินเทอร์เน็ต ฉบับที่ 7–9",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  // ── ACC T5.2 (เลน 2) ▸ รายงานเงินสดรับ-จ่าย ──
  CASH_BOOK_DUTY: {
    code: "CASH_BOOK_DUTY",
    titleTh: "รายงานเงินสดรับ-จ่ายของร้านบุคคลธรรมดาที่ไม่จด VAT",
    messageTh: (p) =>
      `${s(p, "who")} — ผู้มีเงินได้ ม.40(5)–(8) ที่เป็นบุคคลธรรมดาและไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม ต้องจัดทำรายงานแสดงรายได้และรายจ่ายเป็นประจำวัน ภาษาไทย ลงรายการภายใน ${s(p, "days")} นับแต่วันที่มีรายได้หรือรายจ่าย · ขาย/ซื้อเชื่อบันทึกในวันที่ได้รับชำระหรือวันที่จ่ายชำระ (เกณฑ์เงินสด) · ลงยอดรวมต่อวันได้ · รายจ่ายต้องเกี่ยวกับกิจการ`,
    citation: "ประมวลรัษฎากร ม.17(1) · ประกาศอธิบดีกรมสรรพากรเกี่ยวกับภาษีเงินได้ (ฉบับที่ 161) ข้อ 2 ข้อ 3",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  CASH_BOOK_FORMAT_UNVERIFIED: {
    code: "CASH_BOOK_FORMAT_UNVERIFIED",
    titleTh: "หัวคอลัมน์ตามแบบแนบท้ายยังไม่ได้เทียบ",
    messageTh: () => "หัวคอลัมน์ของรายงานนี้ยังไม่ได้เทียบกับแบบแนบท้ายประกาศ และคณะบุคคลอยู่ในข่ายประกาศนี้หรือไม่ยังไม่ยืนยัน — ใช้เป็นร่างให้ร้าน/ผู้ทำบัญชีตรวจ",
    citation: "ประกาศอธิบดีกรมสรรพากรเกี่ยวกับภาษีเงินได้ (ฉบับที่ 161) — แบบแนบท้าย",
    tag: "U",
    checkedAt: "2026-11-13",
    ack: false,
  },
  // ── ACC T5.3 (เลน 2) ▸ เกณฑ์จดทะเบียน VAT 1.8 ล้าน ──
  VAT_REG_THRESHOLD_NEAR: {
    code: "VAT_REG_THRESHOLD_NEAR",
    titleTh: "ยอดขายใกล้เกณฑ์จดทะเบียนภาษีมูลค่าเพิ่ม",
    messageTh: (p) =>
      `ยอดขายสะสม${s(p, "period")} ${s(p, "amount")} บาท = ${s(p, "pct")} ของเกณฑ์ ${s(p, "threshold")} บาทต่อปี — เมื่อมูลค่าฐานภาษีเกินเกณฑ์ต้องยื่นจดทะเบียนภาษีมูลค่าเพิ่มภายใน ${s(p, "days")} วันนับแต่วันที่เกิน · กิจการที่ยังไม่ถึงเกณฑ์ขอจดทะเบียนเองได้`,
    citation: "ประมวลรัษฎากร ม.81/1 ม.81/3 ม.85/1(1)(ก) · พ.ร.ฎ. (ฉบับที่ 432) พ.ศ. 2548 ม.4",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  VAT_REG_THRESHOLD_EXCEEDED: {
    code: "VAT_REG_THRESHOLD_EXCEEDED",
    titleTh: "ยอดขายเกินเกณฑ์จดทะเบียนภาษีมูลค่าเพิ่ม",
    messageTh: (p) =>
      `ยอดขายสะสม${s(p, "period")} ${s(p, "amount")} บาท เกินเกณฑ์ ${s(p, "threshold")} บาทต่อปี ตั้งแต่วันที่ ${s(p, "crossed")} — ต้องยื่นจดทะเบียนภาษีมูลค่าเพิ่มภายใน ${s(p, "days")} วันนับแต่วันที่เกิน (ภายใน ${s(p, "deadline")}) · ระบบไม่บล็อกการขาย`,
    citation: "ประมวลรัษฎากร ม.81/1 ม.85/1(1)(ก) · พ.ร.ฎ. (ฉบับที่ 432) พ.ศ. 2548 ม.4",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  VAT_REG_MEASURE_DEFAULT: {
    code: "VAT_REG_MEASURE_DEFAULT",
    titleTh: "วิธีนับยอดขายเทียบเกณฑ์จด VAT",
    messageTh: (p) =>
      `ระบบนับ${s(p, "what")} ในรอบ${s(p, "year")} — กิจการที่ได้รับยกเว้นตาม ม.81 (เช่น ให้เช่าอสังหาริมทรัพย์ ขายพืชผลเกษตร) ไม่นับเข้ามูลค่าฐานภาษีหรือไม่ และนับเกณฑ์สิทธิหรือเกณฑ์เงินสด ยังไม่ได้ยืนยัน`,
    citation: "ประมวลรัษฎากร ม.81 ม.81/1 · พ.ร.ฎ. (ฉบับที่ 432) พ.ศ. 2548 ม.4",
    tag: "S",
    checkedAt: "2026-11-13",
    ack: false,
  },
  // ── ACC T5.5 (เลน 2) ▸ อาจต้องบวกกลับทางภาษี · ค่ารับรอง ──
  TAX_ADD_BACK_FLAGGED: {
    code: "TAX_ADD_BACK_FLAGGED",
    titleTh: "รายจ่ายที่อาจต้องบวกกลับทางภาษี",
    messageTh: (p) =>
      `${s(p, "count")} บัญชีติดธง "อาจต้องบวกกลับทางภาษี" ยอดรวม ${s(p, "amount")} บาท — รายจ่ายต้องห้ามตาม ม.65 ตรี หักเป็นรายจ่ายในการคำนวณกำไรสุทธิทางภาษีไม่ได้${p.individual ? " (ร้านบุคคลธรรมดาที่เลือกหักค่าใช้จ่ายตามจริงใช้หลักนี้โดยอนุโลม)" : ""} · ระบบไม่ได้คำนวณกำไรสุทธิทางภาษีหรือภาษีที่ต้องชำระ — ใช้เป็นรายการให้ผู้ทำบัญชีตรวจ`,
    citation: "ประมวลรัษฎากร ม.65 ตรี · พ.ร.ฎ. (ฉบับที่ 11) พ.ศ. 2502 ม.8 วรรคสอง",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  ENTERTAINMENT_CAP_EXCEEDED: {
    code: "ENTERTAINMENT_CAP_EXCEEDED",
    titleTh: "ค่ารับรองเกินเพดาน",
    messageTh: (p) =>
      `ค่ารับรอง${s(p, "period")} ${s(p, "amount")} บาท เกินเพดาน ${s(p, "cap")} บาท (${s(p, "rate")} ของ${s(p, "baseLabel")} ${s(p, "base")} บาท · สูงสุด ${s(p, "max")} บาท) — ส่วนเกิน ${s(p, "excess")} บาท หักเป็นรายจ่ายทางภาษีไม่ได้ · ค่ารับรองต้องมีผู้อนุมัติและใบรับ`,
    citation: "ประมวลรัษฎากร ม.65 ตรี (4) · กฎกระทรวง ฉบับที่ 143",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  ENTERTAINMENT_GIFT_CHECK: {
    code: "ENTERTAINMENT_GIFT_CHECK",
    titleTh: "ค่ารับรองที่เป็นสิ่งของ",
    messageTh: (p) => `${s(p, "count")} รายการค่ารับรองยอดเกิน ${s(p, "limit")} บาทต่อใบ — ถ้าเป็นสิ่งของที่ให้ ต้องไม่เกินคนละ ${s(p, "limit")} บาทในแต่ละคราว (ส่วนเกินหักเป็นรายจ่ายไม่ได้) · ระบบไม่รู้จำนวนผู้รับ — โปรดตรวจรายการ`,
    citation: "ประมวลรัษฎากร ม.65 ตรี (4) · กฎกระทรวง ฉบับที่ 143",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  // ── ACC T5.6 (เลน 2) ▸ เฉลี่ยภาษีซื้อ · ภ.พ.36 · อากรแสตมป์ ──
  INPUT_VAT_APPORTIONMENT: {
    code: "INPUT_VAT_APPORTIONMENT",
    titleTh: "มีรายได้ยกเว้น VAT ปนกับรายได้ที่เสีย VAT",
    messageTh: (p) =>
      `เดือน ${s(p, "period")} มีรายได้ยกเว้นภาษีมูลค่าเพิ่ม ${s(p, "exempt")} บาท ปนกับรายได้ที่เสียภาษี ${s(p, "taxable")} บาท (รายได้ที่เสียภาษี ${s(p, "ratio")} ของรายได้รวม) และใช้ภาษีซื้อ ${s(p, "input")} บาท — ภาษีซื้อของรายจ่ายที่ใช้ร่วมกันทั้งสองกิจการต้องเฉลี่ยตามส่วนรายได้ ส่วนของกิจการที่ยกเว้นเคลมไม่ได้ · ระบบยังไม่เฉลี่ยให้อัตโนมัติ และสูตรเฉลี่ยละเอียดยังไม่ได้ยืนยัน — ${CHECK_WITH_ACCOUNTANT_TH}`,
    citation: "ประมวลรัษฎากร ม.82/6 · ประกาศอธิบดีกรมสรรพากรเกี่ยวกับภาษีมูลค่าเพิ่ม (ฉบับที่ 29)",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  PP36_FOREIGN_SERVICE: {
    code: "PP36_FOREIGN_SERVICE",
    titleTh: "ค่าบริการจากต่างประเทศ — ภ.พ.36",
    messageTh: (p) =>
      `${s(p, "doc")} ค่าบริการจาก ${s(p, "vendor")} (ผู้ให้บริการต่างประเทศ) ${s(p, "amount")} บาท — ร้านที่จดทะเบียนภาษีมูลค่าเพิ่มต้องนำส่งภาษีมูลค่าเพิ่มแทนผู้ให้บริการด้วยแบบ ภ.พ.36 เมื่อบริการที่ทำในต่างประเทศได้ใช้ในราชอาณาจักร (เช่น ค่าโฆษณาที่ออกบิลจากบริษัทต่างประเทศ)${s(p, "online", "") ? ` · ยื่นทางอินเทอร์เน็ตภายในวันที่ ${s(p, "online")} ของเดือนถัดจากเดือนที่จ่าย` : ""} · กรณีลูกค้าปลายทางมาใช้บริการในไทยยังไม่ได้ยืนยัน — ${CHECK_WITH_ACCOUNTANT_TH}`,
    citation: "ประมวลรัษฎากร ม.77/2 วรรคสาม · ม.83/6 · ม.82/13",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  STAMP_DUTY_INSTRUMENT: {
    code: "STAMP_DUTY_INSTRUMENT",
    titleTh: "อากรแสตมป์ของสัญญา",
    messageTh: (p) =>
      `${s(p, "doc")} ${s(p, "amount")} บาท — ถ้าเอกสารนี้เป็นสัญญาจ้างทำของ อากรแสตมป์ ${s(p, "rate")} บาทต่อทุก 1,000 บาทหรือเศษ (ประมาณ ${s(p, "duty")} บาท) ผู้รับจ้าง${s(p, "payer")}เป็นผู้เสีย · ตราสารที่ลงนาม/ตอบรับทางอิเล็กทรอนิกส์ชำระอากรเป็นตัวเงิน (อ.ส.9) ก่อนกระทำตราสารหรือภายใน ${s(p, "days")} วันนับแต่วันถัดจากวันกระทำตราสาร แล้วเก็บรหัสรับรองไว้ · ไม่ปิดอากรใช้เป็นพยานหลักฐานในคดีแพ่งไม่ได้จนกว่าจะเสียและมีเงินเพิ่ม · ระบบตัดสินไม่ได้ว่าเป็นจ้างทำของหรือซื้อขาย (ใบเสร็จขายของ/บริการทั่วไปไม่มีอากร)`,
    citation: "ประมวลรัษฎากร ม.113 ม.114 ม.118 · บัญชีอัตราอากรแสตมป์ ลักษณะ 4 · ประกาศอธิบดีกรมสรรพากรเกี่ยวกับอากรแสตมป์ (ฉบับที่ 66 แก้ไขโดยฉบับที่ 68)",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  // ── ACC T5.7 (เลน 2) ▸ หนี้สูญ · ค่าเผื่อหนี้สงสัยจะสูญ ──
  BAD_DEBT_TAX_CONDITIONS: {
    code: "BAD_DEBT_TAX_CONDITIONS",
    titleTh: "เงื่อนไขตัดหนี้สูญทางภาษี",
    messageTh: (p) =>
      `ตัดหนี้สูญ ${s(p, "contact")} ${s(p, "amount")} บาท (รวมหนี้ที่ตัดของรายนี้ ${s(p, "total")} บาท) — ทางบัญชีลงเป็นค่าใช้จ่าย ไม่ลดรายได้ · จะหักเป็นรายจ่ายทางภาษีได้ต้องครบเงื่อนไข: ${s(p, "tier")} · ห้ามเป็นหนี้ของกรรมการหรือหุ้นส่วนผู้จัดการ · ได้รับชำระคืนภายหลังเป็นรายได้ · กดยืนยันเพื่อบันทึก`,
    citation: "กฎกระทรวง ฉบับที่ 186 แก้ไขโดยฉบับที่ 374 · มาตรฐานการรายงานทางการเงินสำหรับกิจการที่ไม่มีส่วนได้เสียสาธารณะ ย่อหน้า 7.7 18.10",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: true,
  },
  BAD_DEBT_ALLOWANCE_ADD_BACK: {
    code: "BAD_DEBT_ALLOWANCE_ADD_BACK",
    titleTh: "ค่าเผื่อหนี้สงสัยจะสูญ — อาจต้องบวกกลับ",
    messageTh: (p) =>
      `ตั้งค่าเผื่อหนี้สงสัยจะสูญ ${s(p, "amount")} บาท (ยอดค่าเผื่อหลังบันทึก ${s(p, "balance")} บาท) — ทางบัญชีตั้งได้ตามวิธีร้อยละของยอดขายเชื่อ อายุหนี้ หรือรายตัว แต่ทางภาษีเป็นเงินสำรองที่หักเป็นรายจ่ายไม่ได้จนกว่าจะตัดหนี้สูญจริง (บัญชีค่าใช้จ่ายนี้ติดธงอาจต้องบวกกลับ)`,
    citation: "ประมวลรัษฎากร ม.65 ตรี (1) · มาตรฐานการรายงานทางการเงินสำหรับกิจการที่ไม่มีส่วนได้เสียสาธารณะ ย่อหน้า 7.5",
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
