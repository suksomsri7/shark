// GET /api/mobile/secretary/rooms/[id]/proposals — ข้อเสนอ + แผนที่รออนุมัติในห้อง (เก่า→ใหม่) · ไม่มี payload ดิบ (dto)
//   ต่อแถว: `why` (เหตุผลไทยจาก approvalGate/whyApproval) · `classes` {money, customerFacing, destructive} · `editable` (ทะเบียน op เท่านั้น) ·
//   `canApprove` ของผู้เรียก (dry-run ไม่มีผลข้างเคียง — การกดจริงตรวจซ้ำใน executeProposal/executePlan) · `views.pendingItemsFor`
//   สมาชิก seeHistory=false ไม่เห็นของก่อน addedAt (R-S1.6a · บังคับใน lib) · มองไม่เห็นห้อง = 404
import { getRoom } from "@/lib/ai/secretary/rooms";
import { pendingItemsFor } from "@/lib/ai/secretary/views";
import { gate, idParam, notFound, ok, type RouteCtx, withErrors } from "../../../_shared";

async function GET_(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const id = await idParam(ctx, "id");
  const room = id ? await getRoom(a.c.conv, id) : null;
  if (!room) return notFound("ไม่พบห้องงานนี้");
  return ok({ items: await pendingItemsFor(a.c, room.conversationId) });
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("secretary/rooms/[id]/proposals GET", GET_);
