// POST /api/mobile/secretary/staff/[membershipId]/remove — เอาพนักงานออก (`removeStaff` = ระงับ + ถอนจากห้องเลขาทุกห้อง + ลบคำเชิญค้างของเบอร์) · Membership คงไว้เป็นประวัติ
import { z } from "zod";
import { removeStaff } from "@/lib/staff/levels";
import { gate, idParam, notFound, readBody, thrown, withRateLimit, type RouteCtx } from "../../../_shared";
import { staffResponse } from "../../_staff";

export async function POST(req: Request, ctx: RouteCtx<"membershipId">) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "staff");
  if (rl) return rl;
  const b = await readBody(req, z.object({}).strict());
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "membershipId");
  if (!id) return notFound("ไม่พบผู้ใช้งานคนนี้");
  try {
    return staffResponse(await removeStaff({ tenantId: a.c.tenantId, actorUserId: a.c.userId, membership: a.c.m }, id));
  } catch (e) {
    return thrown(e, "staff.remove");
  }
}
