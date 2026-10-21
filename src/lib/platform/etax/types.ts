// platform/etax/types.ts — เอกสาร e-Tax Invoice รูปกลาง (P3-SKEL R11 · มติ §10-5) — ชั้นแพลตฟอร์ม ไม่ใช่ของโมดูลบัญชี/POS
// ผู้เรียก (POS etax-link.ts วันนี้ · บัญชีภายหลัง) แปลงเอกสารของตัวเองเป็นรูปนี้ → normalizeEtaxDocument → renderEtaxXml → ผู้ให้บริการ (provider.ts)
// 🔴 ไฟล์นี้มีแต่ชนิด — import ได้ทุกที่ (ข้อสอบ ET1 ตรวจว่า render.ts ลากได้เฉพาะ node:* + ไฟล์ในโฟลเดอร์นี้)

/** 388 ใบกำกับภาษี · T03 ใบเสร็จรับเงิน/ใบกำกับภาษี · 81 ใบลดหนี้ (ขมธอ. 3-2560 · ⚠️ ผู้ให้บริการยืนยันโปรไฟล์จริง — W20) */
export type EtaxTypeCode = "388" | "T03" | "81";
export const ETAX_TYPE_CODES: readonly EtaxTypeCode[] = ["388", "T03", "81"];

export type EtaxParty = { name: string; taxId: string; branch: string; address: string };
export type EtaxBuyer = { kind: string; name: string; taxId: string; branchCode: string; address: string; email: string };
export type EtaxLine = { name: string; qty: number; unitPriceSatang: number; amountSatang: number };

/** เงินเป็นสตางค์ (จำนวนเต็ม) ทุกช่อง · net + vat = grand · Σ บรรทัด = grand (ราคารวม VAT) */
export type EtaxDocument = {
  seller: EtaxParty;
  buyer: EtaxBuyer;
  doc: { typeCode: EtaxTypeCode; number: string; issueDate: string; refNumber?: string };
  lines: EtaxLine[];
  totals: { netSatang: number; vatSatang: number; grandSatang: number };
  vat: { rateBp: number; inclusive: boolean };
};

export type EtaxRefusal = { ok: false; code: "VALIDATION" | "NOT_CONFIGURED" | "NOT_ELIGIBLE" | "PERMISSION_DENIED" | "SALE_NOT_FOUND" | "UNKNOWN"; message: string; field?: string };
export type EtaxNormalizeResult = { ok: true; doc: EtaxDocument } | (EtaxRefusal & { code: "VALIDATION" });

/** ผู้ให้บริการ e-Tax (โครง) — send/status คืน NOT_CONFIGURED จนกว่าเจ้าของเลือกผู้ให้บริการ + ส่ง credentials (W4/W20) */
export type EtaxProvider = {
  code: string;
  label: string;
  ready: false;
  requiredFields: readonly { name: string; secret: boolean; required: boolean; label: string }[];
  send: (doc: unknown, xml: unknown, creds: unknown) => Promise<EtaxRefusal>;
  status: (ref: unknown) => Promise<EtaxRefusal>;
};
