// quick-create-parse.ts — ตัวแปลข้อความอิสระของแผง "สร้างด่วน" (⌘K) เป็นคำสั่งสร้างเอกสาร (WO 9.4 §0.3 ข้อ 3)
//
// ⚠️ ไฟล์นี้ต้อง client-safe ล้วน (ไม่ import prisma/service/doc-editor-config) — ใช้ตรงจาก QuickCreate.tsx
// (client component) และจาก scripts/qc-acc-v2-simplicity.mts (ทดสอบ pure function โดยไม่ต้องมี DB)
//
// รูปแบบที่รองรับ: "<คำชนิดเอกสาร TH/EN/prefix> [ชื่อผู้ติดต่อ] [จำนวนเงิน]"
//   เช่น "ใบแจ้งหนี้ ณัฐพล 24900" · "invoice john 500" · "iv สมชาย 1,200" · "ใบเสนอราคา 3000 บาท" · "quotation abc 10k"
// ชนิดเอกสารมาจาก `createDocTypes` (ส่งมาจาก server — ดู layout.tsx: กรองเฉพาะที่ canCreateDirect และไม่ใช่กลุ่ม)
// เพื่อไม่ให้คีย์เวิร์ดในไฟล์นี้เพี้ยนไปจากทะเบียนจริงของ doc-editor-config.ts

export type QuickCreateDocTypeDef = {
  docType: string;
  label: string;
  route: string;
  side: "revenue" | "expense";
};

/** คำพ้อง TH/EN/ตัวย่อ ต่อ docType — คีย์ต้องตรงกับ AccountDocType จริง (ตรวจใน qc-acc-v2-simplicity.mts) */
export const QUICK_CREATE_KEYWORDS: Record<string, string[]> = {
  QUOTATION: ["ใบเสนอราคา", "เสนอราคา", "quotation", "quote", "qt"],
  INVOICE: ["ใบแจ้งหนี้", "แจ้งหนี้", "invoice", "bill", "iv"],
  DEPOSIT_RECEIPT: ["ใบรับเงินมัดจำ", "รับมัดจำ", "มัดจำ", "deposit receipt", "deposit", "dr"],
  CREDIT_NOTE: ["ใบลดหนี้", "ลดหนี้", "credit note", "cn"],
  DEBIT_NOTE: ["ใบเพิ่มหนี้", "เพิ่มหนี้", "debit note", "dn"],
  BILLING_NOTE: ["ใบวางบิล", "วางบิล", "billing note", "bn"],
  PURCHASE: ["บันทึกซื้อสินค้า", "ซื้อสินค้า", "purchase", "pu"],
  EXPENSE: ["บันทึกค่าใช้จ่าย", "ค่าใช้จ่าย", "expense", "ex"],
  PURCHASE_ORDER: ["ใบสั่งซื้อ", "สั่งซื้อ", "purchase order", "po"],
  ASSET_PURCHASE_ORDER: ["ใบสั่งซื้อสินทรัพย์", "สั่งซื้อสินทรัพย์", "asset po", "apo"],
  ASSET_PURCHASE: ["ซื้อสินทรัพย์", "asset purchase", "ap"],
  DEPOSIT_PAYMENT: ["ใบจ่ายเงินมัดจำ", "จ่ายมัดจำ", "deposit payment", "dp"],
  CREDIT_NOTE_RECEIVED: ["รับใบลดหนี้", "cnr"],
  DEBIT_NOTE_RECEIVED: ["รับใบเพิ่มหนี้", "dnr"],
  GOODS_ISSUE: ["ใบเบิกสินค้า", "เบิกสินค้า", "goods issue", "gi"],
  GOODS_ISSUE_RETURN: ["ใบส่งคืนเบิกสินค้า", "คืนเบิก", "goods return", "gir"],
  COST_ADJUSTMENT: ["ใบปรับต้นทุนสินค้า", "ปรับต้นทุน", "cost adjustment", "ca"],
  WHT_CERT: ["หนังสือรับรองหัก ณ ที่จ่าย", "50 ทวิ", "wht cert", "wht"],
};

export type QuickCreateParsed = {
  def: QuickCreateDocTypeDef;
  /** ส่วนที่เหลือหลังตัดคำชนิดเอกสาร+จำนวนเงินออก — ใช้ค้นหาผู้ติดต่อแบบ fuzzy ต่อ (ว่าง = ไม่ระบุ) */
  contactQuery: string;
  /** สตางค์ — null = ไม่ได้พิมพ์จำนวนเงินมา */
  amountSatang: number | null;
};

/** ตัดจำนวนเงินท้ายสตริง — รองรับคอมมา/บาท/k (พัน) เช่น "24,900" · "3000 บาท" · "10k" */
function extractAmount(rest: string): { contactQuery: string; amountSatang: number | null } {
  const m = rest.match(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*(k|K|บาท)?\s*$/);
  if (!m || !m[1]) return { contactQuery: rest.trim(), amountSatang: null };
  let baht = Number.parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(baht)) return { contactQuery: rest.trim(), amountSatang: null };
  if (m[2] && m[2].toLowerCase() === "k") baht *= 1000;
  const amountSatang = Math.round(baht * 100);
  const contactQuery = rest.slice(0, m.index).trim();
  return { contactQuery, amountSatang };
}

/**
 * แปลข้อความอิสระ → คำสั่งสร้างเอกสาร (docType + ผู้ติดต่อ(ข้อความค้นหา) + จำนวนเงิน)
 * ไม่พบคำชนิดเอกสารที่ขึ้นต้น query = null (ให้ผู้เรียกลอง match นำทางอื่นแทน)
 */
export function parseQuickCreateQuery(
  raw: string,
  docTypes: QuickCreateDocTypeDef[],
): QuickCreateParsed | null {
  const q = raw.trim();
  if (!q) return null;
  const lower = q.toLowerCase();

  let best: { def: QuickCreateDocTypeDef; kwLen: number } | null = null;
  for (const def of docTypes) {
    const keywords = QUICK_CREATE_KEYWORDS[def.docType] ?? [def.label.toLowerCase()];
    for (const kw of keywords) {
      const kwLower = kw.toLowerCase();
      if (lower.startsWith(kwLower) && (!best || kwLower.length > best.kwLen)) {
        best = { def, kwLen: kwLower.length };
      }
    }
  }
  if (!best) return null;

  const rest = q.slice(best.kwLen).trim();
  const { contactQuery, amountSatang } = extractAmount(rest);
  return { def: best.def, contactQuery, amountSatang };
}

/** แปลง query `?amount=` (บาท เป็นสตริง — ที่ QuickCreate.tsx ใส่มา) → สตางค์ · ค่าที่แปลงไม่ได้ = undefined */
export function parseAmountQueryToSatang(amount: string | undefined): number | undefined {
  if (!amount) return undefined;
  const baht = Number.parseFloat(amount);
  if (!Number.isFinite(baht) || baht <= 0) return undefined;
  return Math.round(baht * 100);
}

export default parseQuickCreateQuery;
