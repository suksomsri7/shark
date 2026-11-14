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
  // ── ลบร้าน/ยกเลิกบริการ (T4.5 — เลน 1) ──
  "SHOP_RECORDS_RETENTION_DUTY",
  "SHOP_DELETE_WITHIN_RETENTION",
  "PAPER_ORIGINALS_KEEP",
  // ── POS ↔ บัญชี (T4.7 — เลน 1) ──
  "POS_TIP_REVENUE_VAT",
  "POS_TIP_LIABILITY_REVIEW",
  "POS_TIP_STAFF_DIRECT",
  "POS_SHIFT_CASH_VARIANCE",
  "POS_CASH_REGISTER_APPROVAL",
  "POS_BILLS_NOT_POSTED",
  // ── คลัง · เงินประกันหอ · แต้ม (T4.8 — เลน 1) ──
  "STOCK_ISSUE_GIVEAWAY",
  "STOCK_ISSUE_SAMPLE",
  "STOCK_ISSUE_STAFF_MEAL",
  "STOCK_ISSUE_PERSONAL_USE",
  "STOCK_ISSUE_WASTE",
  "STOCK_ISSUE_SHORTAGE",
  "STOCK_ISSUE_APPROVER_SAME",
  "DORM_DEPOSIT_OVER_MULTIPLE",
  "DORM_DEPOSIT_LONG_CONTRACT",
  "DORM_DEPOSIT_UNVERIFIED_CASE",
  "LOYALTY_POINTS_OUTSTANDING",
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
  /**
   * ACC T4 Job 0 ▸ ข้อความอ้างอิงที่ผู้ใช้เห็น: มาตรา/ประกาศเป็นภาษาไทยล้วน (ไม่มี path ภายใน ชื่อ skill หรือป้าย V/U/S)
   *   `citation` / `tag` / `checkedAt` = ช่องเครื่องของทะเบียน/REST (เก็บไว้ตรวจย้อน) · จอ/ข้อความถึงผู้ใช้/เลขา AI ใช้ช่องนี้เท่านั้น ◂
   */
  lawTh?: string;
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
  /** ACC T4 Job 0 ▸ อ้างอิงที่ผู้ใช้เห็น (ไม่ใส่ = ตัดจาก `citation` ด้วย `publicCitationTh`) ◂ */
  lawTh?: string;
};

// ─────────────────────────────────────────────────────────────
// ACC T4 Job 0 ▸ อ้างอิงที่ผู้ใช้เห็น — ผู้ใช้ต้องไม่เห็น path ภายใน (references/… .md · src/… · ledger/…) ชื่อ skill หรือป้าย [V]/[U]/[S]
//   ตัดเอาเฉพาะชิ้นที่เป็นกฎหมาย (มาตรา · ประกาศ · คำสั่ง · ข้อหารือ กค · พ.ร.บ. · กฎกระทรวง) · ชิ้นภายในที่มีกฎหมายในวงเล็บ/หลัง "—" ⇒ เก็บเฉพาะส่วนกฎหมาย
// ─────────────────────────────────────────────────────────────
const INTERNAL_RE = /references\/|[A-Za-z0-9_-]+\.(?:md|ts|tsx|mts)\b|ledger\/|src\/|test-rules|audit-checklist|SYSTEM_[A-Z_]+|ตารางค่ากฎหมาย|skill|T-ACC|§/i;
const LAWISH_RE = /ม\.\s?\d|มาตรา|ประมวลรัษฎากร|ประกาศ|คำสั่ง|กค\s?0\d|พ\.ร\.บ|พ\.ร\.ฎ|กฎกระทรวง|ท\.ป\.|ป\.\d|ฉ\.\s?\d|ฉบับที่|NPAEs|ระเบียบ|ข้อหารือ|หนังสือตอบ/;
/** ป้ายความมั่นใจ / หมายเหตุภายในที่ห้ามหลุดถึงผู้ใช้ */
const TAG_TOKEN_RE = /\s*\[(?:V2|V|S|U)\]|\s*—?\s*(?:เทียบเคียง|แหล่งขัดกัน[^·)]*|สูตรในวงการ|สูตรทางการไม่พบ)/g;

/** แยกที่ตัวคั่นระดับบนสุด (ไม่ตัดในวงเล็บ) */
function splitTop(s: string, seps: readonly string[]): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    const sep = depth === 0 ? seps.find((x) => s.startsWith(x, i)) : undefined;
    if (sep) {
      out.push(cur);
      cur = "";
      i += sep.length - 1;
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** วงเล็บระดับบนสุดของข้อความ (เนื้อในเท่านั้น) */
function topParens(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (s[i] === ")" && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) out.push(s.slice(start, i));
    }
  }
  return out;
}

/** ACC T4 Job 0 ▸ อ้างอิงทางกฎหมายภาษาไทยล้วนจากข้อความที่มาภายใน (ไม่มีชิ้นกฎหมาย = "") ◂ */
export function publicCitationTh(citation: string | null | undefined, depth = 0): string {
  if (!citation || depth > 3) return "";
  const cleaned = citation.replace(TAG_TOKEN_RE, "");
  const out: string[] = [];
  for (const raw of splitTop(cleaned, [" · ", " ; ", "; "])) {
    const p = raw.trim().replace(/^[—–-]\s*/, "").trim();
    if (!p) continue;
    if (INTERNAL_RE.test(p)) {
      // ชิ้นภายใน: เก็บกฎหมายในวงเล็บ / หลังขีดยาว
      const inner = p.includes(" — ") ? [p.slice(p.indexOf(" — ") + 3)] : topParens(p);
      for (const x of inner) {
        const sub = publicCitationTh(x, depth + 1);
        if (sub) out.push(sub);
      }
      continue;
    }
    if (!LAWISH_RE.test(p)) continue;
    // ตัดคำอธิบายหลัง ":" (เช่น "ม.83: ภายในวันที่ 15…") ให้เหลือชื่อกฎหมาย
    const law = splitTop(p, [": "])[0]!.trim().replace(/\s*\(\s*\)\s*/g, "");
    if (law) out.push(law);
  }
  const seen = new Set<string>();
  return out
    .flatMap((x) => x.split(" · "))
    .map((x) => x.trim())
    .filter((x) => x && !INTERNAL_RE.test(x) && !seen.has(x) && (seen.add(x), true))
    .join(" · ");
}

/** ACC T4 Job 0 ▸ ข้อความอ้างอิงบรรทัดเดียวที่ผู้ใช้เห็นของคำเตือน 1 รายการ: กฎหมาย + (ป้าย [S]/[U]) "โปรดตรวจกับนักบัญชีของร้าน" ◂ */
export function legalWarningRefTh(w: Pick<LegalWarning, "lawTh" | "citation" | "tag" | "messageTh">): string {
  const law = w.lawTh ?? publicCitationTh(w.citation);
  const parts: string[] = [];
  if (law) parts.push(`อ้างอิง: ${law}`);
  if ((w.tag === "S" || w.tag === "U") && !(w.messageTh ?? "").includes(CHECK_WITH_ACCOUNTANT_TH_)) parts.push(CHECK_WITH_ACCOUNTANT_TH_);
  return parts.join(" · ");
}
const CHECK_WITH_ACCOUNTANT_TH_ = "โปรดตรวจกับนักบัญชีของร้าน";

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
  // ── ลบร้าน/ยกเลิกบริการ (T4.5 — เลน 1) ──
  SHOP_RECORDS_RETENTION_DUTY: {
    code: "SHOP_RECORDS_RETENTION_DUTY",
    titleTh: "หน้าที่เก็บบัญชีและเอกสารเป็นของร้าน",
    messageTh: (p) =>
      `ร้านต้องเก็บบัญชีและเอกสารประกอบการลงบัญชีไว้ไม่น้อยกว่า ${s(p, "years", "5")} ปีนับแต่วันปิดบัญชี (รายงานภาษีมูลค่าเพิ่มนับจากวันยื่นแบบ · สำเนาใบรับนับจากวันออก) แม้เลิกใช้บริการ SHARK แล้ว — หน้าที่นี้เป็นของร้าน ไม่ใช่ของ SHARK · ส่งออกสมุดบัญชีที่พิมพ์ได้และไฟล์แนบเก็บไว้ก่อนลบร้าน · กิจการที่เลิกโดยไม่ชำระบัญชีต้องส่งมอบบัญชีและเอกสารภายใน 90 วัน`,
    citation: "references/domain-accounting-books.md §ก4 — พ.ร.บ.การบัญชี พ.ศ. 2543 ม.14 · ม.17 · ประมวลรัษฎากร ม.87/3 · ม.105 ทวิ",
    lawTh: "พ.ร.บ.การบัญชี พ.ศ. 2543 ม.14, ม.17 · ประมวลรัษฎากร ม.87/3, ม.105 ทวิ",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  SHOP_DELETE_WITHIN_RETENTION: {
    code: "SHOP_DELETE_WITHIN_RETENTION",
    titleTh: "ลบร้านก่อนครบระยะเก็บเอกสาร",
    messageTh: (p) =>
      `สมุด${p.book ? ` "${s(p, "book")}"` : ""} มีรายการบัญชีล่าสุดวันที่ ${s(p, "last")} — ยังต้องเก็บถึงอย่างน้อย ${s(p, "until")} (${s(p, "years", "5")} ปีนับแต่วันปิดบัญชี) · เมื่อลบร้าน ข้อมูลบัญชีในระบบจะถูกลบถาวรเมื่อครบช่วงรอ ร้านต้องเก็บสำเนาที่ส่งออกและต้นฉบับกระดาษไว้เอง · กดยืนยันเพื่อขอลบร้าน`,
    citation: "references/domain-accounting-books.md §ก4 — พ.ร.บ.การบัญชี พ.ศ. 2543 ม.14 · ม.38 (ทำลาย/ทำให้สูญหาย)",
    lawTh: "พ.ร.บ.การบัญชี พ.ศ. 2543 ม.14, ม.38",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: true,
  },
  PAPER_ORIGINALS_KEEP: {
    code: "PAPER_ORIGINALS_KEEP",
    titleTh: "เก็บต้นฉบับกระดาษไว้จนครบอายุ",
    messageTh: () =>
      "เก็บต้นฉบับกระดาษของเอกสารที่ได้รับ (ใบกำกับภาษีซื้อ ใบเสร็จ สัญญา) ไว้จนครบระยะเก็บ — เจ้าพนักงานเรียกดูเอกสารกระดาษได้ และระบบไม่พบตัวบทหรือข้อหารือที่รับรองว่าสแกนแล้วทำลายต้นฉบับได้ · ไฟล์ในระบบเป็นสำเนาเพื่อความสะดวก",
    citation: "references/domain-accounting-books.md §ง3 — คำสั่ง ป.121/2545 ข้อ 3",
    tag: "U",
    checkedAt: "2026-11-13",
    ack: false,
  },
  // ── POS ↔ บัญชี (T4.7 — เลน 1) ──
  POS_TIP_REVENUE_VAT: {
    code: "POS_TIP_REVENUE_VAT",
    titleTh: "ทิปลงเป็นรายได้ของร้าน (คิด VAT)",
    messageTh: () =>
      `ทิปที่ลูกค้าจ่ายผ่านร้าน (เงินสด บัตร QR รวมในบิล) ลงเป็นรายได้ของร้านและคิดภาษีขาย · ส่วนที่ร้านแบ่งจ่ายพนักงานเป็นเงินได้ของพนักงาน · ข้อหารือที่พบเป็นเรื่องภาษีของพนักงาน ไม่ได้ชี้ตรงว่าทิปต้องเสียภาษีมูลค่าเพิ่ม — ${CHECK_WITH_ACCOUNTANT_TH}`,
    citation: "references/domain-shark-accounting-cases.md §1.8 — หนังสือตอบข้อหารือ กค 0702/3278",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  POS_TIP_LIABILITY_REVIEW: {
    code: "POS_TIP_LIABILITY_REVIEW",
    titleTh: "ทิปลงเป็นเงินรับแทนพนักงาน",
    messageTh: () =>
      "ทิปลงเป็นหนี้สิน \"รอจ่ายพนักงาน\" ไม่คิดภาษีขาย — ข้อหารือที่พบระบุว่ากิจการนำทิปที่จ่ายเข้ากิจการไปเสียภาษีมูลค่าเพิ่ม วิธีนี้จึงควรทบทวน (ทางเลือก: รายได้ของร้านคิด VAT)",
    citation: "references/domain-shark-accounting-cases.md §1.8 — หนังสือตอบข้อหารือ กค 0702/3278 (บัญชีพักทิปแบบหนี้สินต้องทบทวน)",
    tag: "U",
    checkedAt: "2026-11-13",
    ack: false,
  },
  POS_TIP_STAFF_DIRECT: {
    code: "POS_TIP_STAFF_DIRECT",
    titleTh: "ทิปเงินสดที่พนักงานรับตรง",
    messageTh: () =>
      "ทิปเงินสดถือว่าพนักงานรับตรงจากลูกค้า ไม่ผ่านบัญชีร้าน (ไม่ลงเงินสดและไม่ลงรายได้) · ทิปที่เข้าบัญชีร้าน (บัตร QR โอน) ยังลงเป็นเงินรับแทนพนักงาน · ไม่พบข้อหารือเรื่องทิปที่ลูกค้าให้พนักงานโดยตรง",
    citation: "references/domain-shark-accounting-cases.md §1.8 (ทิปตรงถึงพนักงาน — ไม่พบข้อหารือ)",
    tag: "U",
    checkedAt: "2026-11-13",
    ack: false,
  },
  POS_SHIFT_CASH_VARIANCE: {
    code: "POS_SHIFT_CASH_VARIANCE",
    titleTh: "เงินขาด/เกินปิดกะลงบัญชี",
    messageTh: (p) =>
      `${p.count ? `${s(p, "count")} กะ ` : ""}ผลต่างเงินสดจากการนับปิดกะลงบัญชี "เงินขาดจากการนับเงินสด" / "เงินเกินจากการนับเงินสด" ผูกกะ เครื่อง และพนักงาน ไม่หักกลบข้ามกะ · เงินขาดที่เรียกคืนจากพนักงานให้ตั้งเป็นลูกหนี้พนักงาน · ไม่มีตัวบท/ข้อหารือตรงเรื่องนี้ (แนวปฏิบัติทางบัญชี)`,
    citation: "references/domain-shark-accounting-cases.md §1.9 — ประมวลรัษฎากร ม.65 ตรี (13)(18) · กค 0702/8080 (แนวผลเสียหายจากทุจริต)",
    tag: "U",
    checkedAt: "2026-11-13",
    ack: false,
  },
  POS_CASH_REGISTER_APPROVAL: {
    code: "POS_CASH_REGISTER_APPROVAL",
    titleTh: "เครื่องบันทึกการเก็บเงินต้องขออนุมัติ",
    messageTh: (p) =>
      `ร้านจดภาษีมูลค่าเพิ่มที่ใช้เครื่องบันทึกการเก็บเงินออกใบกำกับภาษีอย่างย่อต้องยื่นคำขออนุมัติต่ออธิบดี (แบบ ภ.พ.06) ต่อสถานประกอบการ และพิมพ์เลขรหัสประจำเครื่องบนใบ · ใช้โดยไม่ได้รับอนุมัติมีโทษตาม ม.90/3${p.devices ? ` · เครื่องที่ยังไม่มีเลขรหัสประจำเครื่อง: ${s(p, "devices")}` : ""} · ไม่พบแนวทางว่าแอปขายบนแท็บเล็ตเข้าข่ายเครื่องบันทึกการเก็บเงินหรือไม่`,
    citation: "references/domain-shark-accounting-cases.md §1.4 — ประมวลรัษฎากร ม.86/6 ว.หก · ม.90/3(2) · ประกาศ VAT ฉ.46 ข้อ 3 (การปรับใช้กับแท็บเล็ต [U])",
    lawTh: "ประมวลรัษฎากร ม.86/6, ม.90/3 · ประกาศอธิบดีฯ เรื่อง VAT ฉบับที่ 46",
    tag: "U",
    checkedAt: "2026-11-13",
    ack: false,
  },
  POS_BILLS_NOT_POSTED: {
    code: "POS_BILLS_NOT_POSTED",
    titleTh: "บิลขายหน้าร้านที่ยังไม่ลงบัญชี",
    messageTh: (p) =>
      `มีบิลขายหน้าร้าน ${s(p, "count")} บิล (${s(p, "amount")} บาท) ที่ยังไม่ลงสมุดบัญชี — ใบกำกับภาษีอย่างย่อต้องลงรายงานภาษีขายเป็นยอดรวมรายวันภายใน 3 วันทำการ · ตรวจการเชื่อมจุดขายกับสมุด`,
    citation: "references/domain-shark-accounting-cases.md §1.3 — ประกาศ VAT ฉ.89 ข้อ 7(2)",
    lawTh: "ประกาศอธิบดีฯ เรื่อง VAT ฉบับที่ 89 ข้อ 7(2)",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  // ── คลัง · เงินประกันหอ · แต้ม (T4.8 — เลน 1) ──
  STOCK_ISSUE_GIVEAWAY: {
    code: "STOCK_ISSUE_GIVEAWAY",
    titleTh: "ของแถม",
    messageTh: () =>
      "ของแถมไม่ถือเป็นการขายเมื่อแถมพร้อมกับการขายในใบกำกับภาษีใบเดียวกัน และมูลค่าของแถมไม่เกินมูลค่าสินค้าที่ขาย — แถมคนละบิล/คนละวัน หรือเกินมูลค่า อาจถือเป็นการขายที่ต้องเสียภาษี · ควรออกของแถมผ่านบิลขาย",
    citation: "references/domain-shark-accounting-cases.md §5.1 — ประกาศ VAT ฉ.40 ข้อ 2(1) · คำสั่ง ป.86/2542 ข้อ 13",
    lawTh: "ประกาศอธิบดีฯ เรื่อง VAT ฉบับที่ 40 ข้อ 2(1) · คำสั่ง ป.86/2542 ข้อ 13",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  STOCK_ISSUE_SAMPLE: {
    code: "STOCK_ISSUE_SAMPLE",
    titleTh: "สินค้าตัวอย่าง",
    messageTh: () => "สินค้าตัวอย่างที่แจกในกิจกรรมส่งเสริมการขายไม่ถือเป็นการขาย — เก็บหลักฐานกิจกรรม (วันที่ สถานที่ จำนวน) ไว้กับใบเบิก",
    citation: "references/domain-shark-accounting-cases.md §5.2 — ประกาศ VAT ฉ.40 ข้อ 2(7)",
    lawTh: "ประกาศอธิบดีฯ เรื่อง VAT ฉบับที่ 40 ข้อ 2(7)",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  STOCK_ISSUE_STAFF_MEAL: {
    code: "STOCK_ISSUE_STAFF_MEAL",
    titleTh: "อาหารพนักงาน",
    messageTh: () =>
      "อาหารและเครื่องดื่มที่ร้านจัดให้พนักงานระหว่างเวลาทำงานตามระเบียบสวัสดิการ ในราคาที่ไม่เกินสมควร ไม่ถือเป็นการขาย — ควรมีระเบียบสวัสดิการเป็นลายลักษณ์อักษร · ลงบัญชีเป็นค่าสวัสดิการพนักงาน",
    citation: "references/domain-shark-accounting-cases.md §5.2 — ประกาศ VAT ฉ.40 ข้อ 2(8)",
    lawTh: "ประกาศอธิบดีฯ เรื่อง VAT ฉบับที่ 40 ข้อ 2(8)",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  STOCK_ISSUE_PERSONAL_USE: {
    code: "STOCK_ISSUE_PERSONAL_USE",
    titleTh: "เจ้าของนำไปใช้ส่วนตัว",
    messageTh: (p) =>
      `เจ้าของหรือผู้อื่นนำสินค้าไปใช้ที่ไม่ใช่เพื่อกิจการโดยตรงถือเป็นการขาย — ร้านจดภาษีมูลค่าเพิ่มต้องคิดภาษีขายจากราคาตลาด${p.vat ? ` (ประมาณ ${s(p, "vat")} บาท)` : ""} และออกใบกำกับภาษี · ใบเบิกนี้ลงต้นทุนเข้าบัญชีถอนใช้ส่วนตัว ไม่ใช่ค่าใช้จ่ายของกิจการ · กดยืนยันเพื่ออนุมัติ`,
    citation: "references/domain-shark-accounting-cases.md §5.3 — ประมวลรัษฎากร ม.77/1(8)(ง) · ม.79/3",
    lawTh: "ประมวลรัษฎากร ม.77/1(8)(ง), ม.79/3",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: true,
  },
  STOCK_ISSUE_WASTE: {
    code: "STOCK_ISSUE_WASTE",
    titleTh: "ของเสีย/ทำลาย",
    messageTh: () =>
      "สินค้าเน่าเสียหรือทำลาย: บันทึกวันที่ รายการ ปริมาณ ต้นทุน สาเหตุ ผู้อนุมัติ และพยาน (รูปถ่ายถ้ามี) — ของที่เก็บไม่ได้ (เช่นอาหาร) ต้องตรวจสภาพโดยผู้มีอำนาจอนุมัติและมีพยานลงชื่อ ไม่ต้องแจ้งสรรพากร · ผลทางภาษีมูลค่าเพิ่มของการทำลายยังไม่ยืนยัน",
    citation: "references/domain-shark-accounting-cases.md §5.5 — คำสั่ง ป.79/2541 ข้อ 3(3.1) (ผลทาง VAT [S])",
    lawTh: "คำสั่ง ป.79/2541 ข้อ 3(3.1)",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  STOCK_ISSUE_SHORTAGE: {
    code: "STOCK_ISSUE_SHORTAGE",
    titleTh: "สินค้าขาดไม่ทราบสาเหตุ",
    messageTh: () =>
      "สินค้าที่ขาดจากรายงานสินค้าและวัตถุดิบถือเป็นการขาย ความรับผิดภาษีเกิดเมื่อตรวจพบ — ร้านจดภาษีมูลค่าเพิ่มควรคิดภาษีขายของสินค้าที่ขาด · การนับเองของร้านถือเป็น \"ตรวจพบ\" หรือไม่ยังไม่ยืนยัน",
    citation: "references/domain-shark-accounting-cases.md §5.4 — คำสั่ง ป.86/2542 ข้อ 3(3) · ประมวลรัษฎากร ม.89(10)",
    lawTh: "คำสั่ง ป.86/2542 ข้อ 3(3) · ประมวลรัษฎากร ม.89(10)",
    tag: "U",
    checkedAt: "2026-11-13",
    ack: false,
  },
  STOCK_ISSUE_APPROVER_SAME: {
    code: "STOCK_ISSUE_APPROVER_SAME",
    titleTh: "ผู้อนุมัติคนเดียวกับผู้ทำใบเบิก",
    messageTh: () =>
      "ใบเบิกนี้อนุมัติโดยคนเดียวกับผู้สร้าง — เอกสารภายในควรมีลายมือชื่อผู้อนุมัติ และการทำลายสินค้าควรมีผู้มีอำนาจอนุมัติแยกจากผู้ทำและมีพยาน",
    citation: "references/domain-accounting-books.md §ก2 — ประกาศกรมทะเบียนการค้า พ.ศ. 2544 ข้อ 11 · domain-shark-accounting-cases.md §5.5",
    lawTh: "ประกาศกรมทะเบียนการค้า เรื่อง กำหนดชนิดของบัญชีที่ต้องจัดทำ พ.ศ. 2544 ข้อ 11 · คำสั่ง ป.79/2541 ข้อ 3(3.1)",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  DORM_DEPOSIT_OVER_MULTIPLE: {
    code: "DORM_DEPOSIT_OVER_MULTIPLE",
    titleTh: "เงินประกันหอพักเกินเพดานที่ไม่ถือเป็นรายได้",
    messageTh: (p) =>
      `${p.lease ? `${s(p, "lease")}: ` : ""}เงินประกัน ${s(p, "deposit")} บาท เกิน ${s(p, "max", "6")} เท่าของค่าเช่ารายเดือน (${s(p, "rent")} บาท) — เงินประกันการเช่าที่อยู่อาศัยไม่ถือเป็นรายได้ของผู้ให้เช่าเฉพาะเมื่อเป็นธรรมเนียมของธุรกิจ ต้องคืนทันทีที่สัญญาสิ้นสุดโดยไม่มีเงื่อนไข ไม่เกิน ${s(p, "max", "6")} เท่าของค่าเช่ารายเดือน และสัญญาไม่เกิน ${s(p, "years", "3")} ปี — ไม่ครบเงื่อนไขถือเป็นรายได้`,
    citation: "references/domain-shark-accounting-cases.md §2.2 — คำสั่ง ป.73/2541 ข้อ 2(3)(ง), 3(2)",
    lawTh: "คำสั่งกรมสรรพากร ที่ ป.73/2541 ข้อ 3(2)",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  DORM_DEPOSIT_LONG_CONTRACT: {
    code: "DORM_DEPOSIT_LONG_CONTRACT",
    titleTh: "สัญญาเช่าหอพักยาวเกินเพดาน",
    messageTh: (p) =>
      `${p.lease ? `${s(p, "lease")}: ` : ""}สัญญาเช่ายาว ${s(p, "months")} เดือน เกิน ${s(p, "years", "3")} ปี — เงินประกันของสัญญาที่เกิน ${s(p, "years", "3")} ปีไม่เข้าเงื่อนไข "ไม่ถือเป็นรายได้" และอาจถือเป็นรายได้ของผู้ให้เช่า`,
    citation: "references/domain-shark-accounting-cases.md §2.2 — คำสั่ง ป.73/2541 ข้อ 3(2)",
    lawTh: "คำสั่งกรมสรรพากร ที่ ป.73/2541 ข้อ 3(2)",
    tag: "V",
    checkedAt: "2026-11-13",
    ack: false,
  },
  DORM_DEPOSIT_UNVERIFIED_CASE: {
    code: "DORM_DEPOSIT_UNVERIFIED_CASE",
    titleTh: "กรณีเงินประกันหอพักที่ยังไม่มีแนวทาง",
    messageTh: () =>
      "ผู้ให้เช่าที่เป็นบุคคลธรรมดา และสัญญาที่ต่ออายุจนรวมกันเกิน 3 ปี — ยังไม่พบแนวทางว่าใช้เงื่อนไขเงินประกันข้างต้นอย่างไร",
    citation: "references/domain-shark-accounting-cases.md §2.2 (บุคคลธรรมดา/ต่ออายุ [U]) — คำสั่ง ป.73/2541 ข้อ 3(2)",
    tag: "U",
    checkedAt: "2026-11-13",
    ack: false,
  },
  LOYALTY_POINTS_OUTSTANDING: {
    code: "LOYALTY_POINTS_OUTSTANDING",
    titleTh: "แต้มสะสมคงค้าง ณ วันสิ้นงวด",
    messageTh: (p) =>
      `แต้มคงค้าง ณ ${s(p, "asOf")} รวม ${s(p, "points")} แต้ม มูลค่าตามอัตราแลก ${s(p, "amount")} บาท — มาตรฐาน NPAEs ให้เลือกตั้งเป็นหนี้สินหรือรับรู้เป็นส่วนลดเมื่อลูกค้าใช้แต้ม · ทางภาษี ประมาณการหนี้สินเข้าข่าย "เงินสำรอง" ที่หักเป็นรายจ่ายไม่ได้จนกว่าจะใช้จริง (การปรับใช้กับแต้มยังไม่ยืนยัน)`,
    citation: "references/domain-shark-accounting-cases.md §3.4 — TFRS for NPAEs 18.31 · ประมวลรัษฎากร ม.65 ตรี (1)",
    lawTh: "มาตรฐาน TFRS for NPAEs ย่อหน้า 18.31 · ประมวลรัษฎากร ม.65 ตรี (1)",
    tag: "U",
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
  const citation = opts.citation ?? d.citation;
  // ACC T4 Job 0 ▸ อ้างอิงที่ผู้ใช้เห็น: แถวตาราง (opts.citation) ตัดจากที่มาของแถว · ไม่งั้นค่าที่ทะเบียนเขียนไว้ / ตัดจาก citation ของทะเบียน ◂
  const lawTh = (opts.citation ? publicCitationTh(opts.citation) : "") || d.lawTh || publicCitationTh(d.citation);
  return { code, messageTh, citation, tag: d.tag, checkedAt: d.checkedAt, ack: d.ack, ...(lawTh ? { lawTh } : {}) };
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
  // ACC T4 Job 0 ▸ ข้อความถึงผู้ใช้/เลขา: กฎหมายภาษาไทยเท่านั้น (ไม่มี path ภายใน/ป้าย) — citation ดิบอยู่ในช่องเครื่องของ REST ◂
  return warnings
    .map((w) => {
      const ref = legalWarningRefTh(w);
      return `[${w.code}] ${w.messageTh}${ref ? ` (${ref})` : ""}`;
    })
    .join(" · ");
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
