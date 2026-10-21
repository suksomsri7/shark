// platform/marketplace.ts — Shopee · Lazada · TikTok Shop · P3.3 โครง (P3-SKEL R4) — ทุกเมธอด NOT_CONFIGURED จนกว่าเจ้าของส่ง credentials (W4)
// 🔴 มติ §10-7: สมาชิกจาก marketplace = OUT จนกว่าจะมี creds (ข้อมูลผู้ซื้อมักถูกปิดบัง + ต้องมีความยินยอม) — ไม่มีตารางจับคู่ ไม่มีแฮชเบอร์
// ⚠️ การอนุญาตร้าน (OAuth redirect → access/refresh token) ไม่อยู่ในโครง (ต้องมีแอปจริง) · ลายเซ็นขาเข้าของ marketplace ยังไม่ตรึง ⇒ verifyInbound = false
import { skeletonAdapter, type PlatformField } from "./types";

export const SHOPEE_FIELDS: readonly PlatformField[] = [
  { name: "partner_id", secret: false, required: true, label: "Shopee partner_id" },
  { name: "partner_key", secret: true, required: true, label: "Shopee partner_key" },
  { name: "shop_id", secret: false, required: true, label: "Shopee shop_id" },
];
export const LAZADA_FIELDS: readonly PlatformField[] = [
  { name: "app_key", secret: true, required: true, label: "Lazada app_key" },
  { name: "app_secret", secret: true, required: true, label: "Lazada app_secret" },
  { name: "seller_id", secret: false, required: true, label: "Lazada seller ID" },
];
export const TIKTOK_FIELDS: readonly PlatformField[] = [
  { name: "app_key", secret: true, required: true, label: "TikTok Shop app_key" },
  { name: "app_secret", secret: true, required: true, label: "TikTok Shop app_secret" },
  { name: "shop_id", secret: false, required: true, label: "TikTok Shop shop id / cipher" },
];

export const shopeeAdapter = skeletonAdapter("SHOPEE", "Shopee", SHOPEE_FIELDS, { signed: false });
export const lazadaAdapter = skeletonAdapter("LAZADA", "Lazada", LAZADA_FIELDS, { signed: false });
export const tiktokAdapter = skeletonAdapter("TIKTOK", "TikTok Shop", TIKTOK_FIELDS, { signed: false });
