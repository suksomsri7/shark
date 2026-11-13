// ack-field.ts — ฟิลด์ `acknowledge` ของ op เขียนที่ลงบัญชีได้ (ACC T1.7)
// runOpAsActor เปิดบริบทการยืนยัน (src/lib/core/legal-ambient.ts) จากฟิลด์นี้ — ด่านลึกในชั้นลงบัญชี (เดือนที่ยื่นแล้ว) อ่านจากบริบท
import { z } from "zod";
import { LEGAL_WARNING_CODES } from "@/lib/core/settings/legal/warnings";

export const ackField = z
  .array(z.enum(LEGAL_WARNING_CODES))
  .max(20)
  .optional()
  .describe("Legal warning codes the user has read and accepted. Send only after showing the user the warnings returned with a 409 legal_ack_required (for example FILED_PERIOD_VAT_CHANGE when the entry lands in a month already marked filed).");

/** body ว่าง + acknowledge (ใช้แทน noBody ของ op ที่ลงบัญชีได้) */
export const ackOnlyInput = z.object({ acknowledge: ackField }).strict();
