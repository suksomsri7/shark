// _case.ts — เรื่องช่วยเหลือที่ผู้ใช้นี้เห็น (ไม่ใช่ route) — ขอบเขตเดียวกับ `listCasesForUser` ของ support/service.ts (OWNER ทั้งร้าน · คนอื่นเฉพาะที่ตัวเองเปิด)
//   service.ts ไม่ export ตัวกรอง (`caseScope` ภายใน) และใบนี้ห้ามแก้ lib ของใบอื่น ⇒ อ่านแถวเดียวด้วยกติกาเดียวกันที่นี่ (หนี้: export จาก service.ts)
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { MAX_ATTACHMENTS } from "@/lib/support/service";
import type { SecCtx } from "../_shared";

export async function visibleCase(c: SecCtx, caseId: string) {
  return tenantDb({ tenantId: c.tenantId }).supportCase.findFirst({
    where: { id: caseId, ...(c.m.role === "OWNER" ? {} : { openedByUserId: c.userId || "~no-user~" }) },
  });
}

/** ไฟล์แนบที่แอปส่งมา (≤ 5 ชิ้น) — ตัวกรองจริง (scheme ปลอดภัย · ขนาด) อยู่ที่ `cleanAttachments` ของ support/service.ts */
export const AttachmentsSchema = z
  .array(z.object({ name: z.string().max(200), url: z.string().max(3_000_000), kind: z.enum(["image", "file"]) }).strict())
  .max(MAX_ATTACHMENTS);
