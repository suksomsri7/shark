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
  },  TAX_INVOICE_ORIGINAL_REPRINT: {
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
