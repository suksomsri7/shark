// GET/POST /api/mobile/secretary/support/cases — เรื่องช่วยเหลือจากแอป (S1.17 · R-K12) · ต้องมี x-tenant-id (เคสเป็นของกิจการ)
//   GET `listCasesForUser` (OWNER ทั้งร้าน · คนอื่นของตัวเอง) · POST `openCaseFromApp` (source APP · หมวด · ห้องที่ผู้แจ้งเห็น — ไม่เห็น = ไม่ผูก)
import { z } from "zod";
import { CASE_CATEGORIES, listCasesForUser, openCaseFromApp, unreadCaseTotalForUser } from "@/lib/support/service";
import { gate, ID_MAX, ok, readBody, thrown, withRateLimit, withErrors } from "../../_shared";
import { AttachmentsSchema } from "../_case";

const Body = z
  .object({
    subject: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(4000),
    category: z.enum(CASE_CATEGORIES).optional(),
    roomId: z.string().trim().min(1).max(ID_MAX).optional(),
    attachments: AttachmentsSchema.optional(),
  })
  .strict();

async function GET_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const ctx = { tenantId: a.c.tenantId };
  const [items, unread] = await Promise.all([listCasesForUser(ctx, a.c.userId, a.c.m.role), unreadCaseTotalForUser(ctx, a.c.userId, a.c.m.role)]);
  return ok({ items, unread, categories: CASE_CATEGORIES });
}

async function POST_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "support");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  try {
    const r = await openCaseFromApp({ tenantId: a.c.tenantId }, { userId: a.c.userId, ...b.v, roomId: b.v.roomId ?? null });
    return ok({ id: r.id, caseNo: r.caseNo });
  } catch (e) {
    return thrown(e, "support.open");
  }
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("secretary/support/cases GET", GET_);
export const POST = withErrors("secretary/support/cases POST", POST_);
