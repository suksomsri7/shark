// _case.ts — เรื่องช่วยเหลือที่ผู้ใช้นี้เห็น (ไม่ใช่ route) — ขอบเขตเดียวกับ `listCasesForUser` ของ support/service.ts (OWNER ทั้งร้าน · คนอื่นเฉพาะที่ตัวเองเปิด)
//   service.ts ไม่ export ตัวกรอง (`caseScope` ภายใน) และใบนี้ห้ามแก้ lib ของใบอื่น ⇒ อ่านแถวเดียวด้วยกติกาเดียวกันที่นี่ (หนี้: export จาก service.ts)
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { MAX_ATTACHMENTS, type CaseFile } from "@/lib/support/service";
import { resolveAttachmentRefs } from "@/lib/ai/secretary/attachments";
import { caseAttachmentsDto } from "@/lib/support/files";
import { fail, ID_MAX, type SecCtx } from "../_shared";

export async function visibleCase(c: SecCtx, caseId: string) {
  return tenantDb({ tenantId: c.tenantId }).supportCase.findFirst({
    where: { id: caseId, ...(c.m.role === "OWNER" ? {} : { openedByUserId: c.userId || "~no-user~" }) },
  });
}

/** ไฟล์แนบที่แอปส่งมา (≤ 5 ชิ้น) — ตัวกรองจริง (scheme ปลอดภัย · ขนาด) อยู่ที่ `cleanAttachments` ของ support/service.ts */
export const AttachmentsSchema = z
  .array(z.object({ name: z.string().max(200), url: z.string().max(3_000_000), kind: z.enum(["image", "file"]) }).strict())
  .max(MAX_ATTACHMENTS);

/** help-cases ▸ ไฟล์ส่วนตัวที่อัปผ่าน support/attachments (≤ 5) — `{id, name?}` */
export const FilesSchema = z
  .array(z.object({ id: z.string().trim().min(1).max(ID_MAX), name: z.string().max(200).optional() }).strict())
  .max(MAX_ATTACHMENTS);

/** รหัสไฟล์ → รายการที่ตรวจกับ FileAsset ของร้านแล้ว (ไม่ผ่านบางไฟล์ = 400 ทั้งชุด · ไฟล์ + แนบเดิมรวมเกิน 5 = 400) */
export async function resolveCaseFiles(
  tenantId: string,
  refs: { id: string; name?: string }[] | undefined,
  legacyCount = 0,
): Promise<{ ok: true; files: CaseFile[] } | { ok: false; res: Response }> {
  if (!refs?.length) return { ok: true, files: [] };
  if (refs.length + legacyCount > MAX_ATTACHMENTS) return { ok: false, res: fail(400, "bad_request", `แนบได้ครั้งละไม่เกิน ${MAX_ATTACHMENTS} ไฟล์`) };
  const r = await resolveAttachmentRefs(tenantId, refs);
  return r.ok ? { ok: true, files: r.items } : { ok: false, res: fail(400, "bad_request", r.message) };
}

/** ไฟล์แนบที่ส่งออกให้แอป — ไฟล์ส่วนตัวโหลดผ่าน cases/[id]/files/[fileId] (Bearer) */
export function caseAttachmentsForApp(caseId: string, raw: unknown) {
  return caseAttachmentsDto(raw, (fileId) => `/api/mobile/secretary/support/cases/${encodeURIComponent(caseId)}/files/${encodeURIComponent(fileId)}`);
}
