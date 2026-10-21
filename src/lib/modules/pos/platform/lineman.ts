// platform/lineman.ts — LINE MAN Wongnai (Partner POS API) · P3.1 โครง (P3-SKEL R1) — ทุกเมธอด NOT_CONFIGURED จนกว่าเจ้าของส่ง credentials (W4)
// ⚠️ ชื่อฟิลด์จากเอกสาร partner สาธารณะตอนร่าง — ผู้ดูแล partner ยืนยันตอนอนุมัติ (docs/pos/PLATFORM-SETUP.md)
// ขาเข้า (โครง · CD-S1): หัว x-shark-signature = hex HMAC-SHA256(raw body, webhookSecret) · adapter จริงแทนด้วยรูปแบบของ LINE MAN
import { skeletonAdapter, WEBHOOK_SECRET_FIELD, type PlatformField } from "./types";

export const LINEMAN_FIELDS: readonly PlatformField[] = [
  { name: "client_id", secret: false, required: true, label: "Partner client ID" },
  { name: "client_secret", secret: true, required: true, label: "Partner client secret" },
  { name: "restaurant_id", secret: false, required: true, label: "รหัสร้าน/สาขาบน LINE MAN" },
  { name: WEBHOOK_SECRET_FIELD, secret: true, required: true, label: "กุญแจลงลายเซ็น webhook" },
];

export const linemanAdapter = skeletonAdapter("LINEMAN", "LINE MAN", LINEMAN_FIELDS, { signed: true });
