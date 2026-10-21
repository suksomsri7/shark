// platform/etax/provider.ts — ทะเบียนผู้ให้บริการ e-Tax Invoice by Email (P3-SKEL R11 · มติ §10-5) — โครง: ทุกตัว NOT_CONFIGURED
// รายชื่อจาก DESIGN-POS :398 (เจ้าของเลือกเมื่อร้านต้องใช้ — W20) · ⚠️ ชื่อฟิลด์เป็นตัวแทน ผู้ให้บริการที่เลือกยืนยันชื่อจริง
// 🔴 ไม่ยิงเครือข่าย · ไม่เขียน AccountDocument.etaxStatus/etaxMeta (เจ้าของโมดูลบัญชีต่อสายเองภายหลัง — OP §ACCOUNT)
import type { EtaxProvider, EtaxRefusal } from "./types";

const pending = (label: string): EtaxRefusal => ({ ok: false, code: "NOT_CONFIGURED", message: `${label}: ยังไม่ได้เชื่อมผู้ให้บริการ e-Tax — รอ credentials จากเจ้าของ (W4/W20)` });

function skeleton(code: string, label: string, requiredFields: EtaxProvider["requiredFields"]): EtaxProvider {
  return { code, label, ready: false, requiredFields, send: async () => pending(label), status: async () => pending(label) };
}

export const ETAX_PROVIDERS: Readonly<Record<string, EtaxProvider>> = Object.freeze({
  INET: skeleton("INET", "INET e-Tax", [
    { name: "api_user", secret: false, required: true, label: "API user" },
    { name: "api_key", secret: true, required: true, label: "API key" },
    { name: "seller_id", secret: false, required: true, label: "รหัสผู้ขาย (seller id)" },
  ]),
  LECEIPT: skeleton("LECEIPT", "Leceipt", [
    { name: "api_key", secret: true, required: true, label: "API key" },
    { name: "seller_id", secret: false, required: true, label: "รหัสผู้ขาย (seller id)" },
  ]),
});

export function etaxProvider(code: unknown): EtaxProvider | null {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(ETAX_PROVIDERS, code) ? ETAX_PROVIDERS[code]! : null;
}
