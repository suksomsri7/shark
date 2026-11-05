// GET /api/mobile/secretary/support/cases/[id] — เคส + ข้อความ (เก่า→ใหม่) · เปิดอ่าน = ล้างตัวนับ (`markCaseRead`) · ไม่เห็น = 404
//   ข้อความไม่มี id ของทีมงานแพลตฟอร์ม — มีแค่ฝั่ง (SHOP/PLATFORM) + `mine`
import { listCaseMessages, markCaseRead } from "@/lib/support/service";
import { attachmentsDto } from "@/lib/ai/secretary/dto";
import { gate, idParam, notFound, ok, type RouteCtx } from "../../../_shared";
import { visibleCase } from "../../_case";

export async function GET(req: Request, ctx: RouteCtx) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const id = await idParam(ctx, "id");
  const c = id ? await visibleCase(a.c, id) : null;
  if (!c) return notFound("ไม่พบเรื่องนี้");
  const tctx = { tenantId: a.c.tenantId };
  const msgs = await listCaseMessages(tctx, c.id);
  await markCaseRead(tctx, c.id);
  return ok({
    case: { id: c.id, caseNo: c.caseNo, subject: c.subject, status: c.status, category: c.category ?? null, roomId: c.roomId ?? null, createdAt: c.createdAt, updatedAt: c.updatedAt },
    messages: msgs.map((m) => ({ id: m.id, side: m.authorSide, mine: m.authorSide === "SHOP" && m.authorId === a.c.userId, body: m.body, attachments: attachmentsDto(m.attachmentsJson), createdAt: m.createdAt })),
  });
}
