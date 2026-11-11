// platform/grab.ts — GrabFood (Partner API · OAuth2 client-credentials) · P3.2 โครง (P3-SKEL R1) — ทุกเมธอด NOT_CONFIGURED จนกว่าเจ้าของส่ง credentials (W4)
// ⚠️ ชื่อฟิลด์จากเอกสาร partner สาธารณะตอนร่าง — Grab เรียก endpoint ของเรา ⇒ webhookSecret = ความลับที่ "เรา" ออกให้ Grab (โครงรองรับแบบ shared-secret header เท่านั้น)
import { skeletonAdapter, WEBHOOK_SECRET_FIELD, type PlatformField } from "./types";

export const GRAB_FIELDS: readonly PlatformField[] = [
  { name: "client_id", secret: false, required: true, label: "Partner client ID" },
  { name: "client_secret", secret: true, required: true, label: "Partner client secret" },
  { name: "merchant_id", secret: false, required: true, label: "GrabFood merchantID ของสาขา" },
  { name: WEBHOOK_SECRET_FIELD, secret: true, required: true, label: "กุญแจลงลายเซ็น webhook (ที่เราออกให้ Grab)" },
];

export const grabAdapter = skeletonAdapter("GRAB", "GrabFood", GRAB_FIELDS, { signed: true });
