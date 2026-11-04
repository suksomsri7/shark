// POST /api/mobile/secretary/staff/invites/[id]/resend — ส่งคำเชิญใหม่ (`resendInvite` · รหัสใหม่ · ลิงก์เดิมใช้ไม่ได้ · throttle 60 วิ · นับรวมเพดาน)
import { z } from "zod";
import { resendInvite } from "@/lib/staff/invite";
import { gate, idParam, notFound, readBody, thrown, withRateLimit, type RouteCtx } from "../../../../_shared";
import { inviteResponse } from "../../../_staff";

export async function POST(req: Request, ctx: RouteCtx) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.c.userId, "staff-invite", 10);
  if (rl) return rl;
  const b = await readBody(req, z.object({}).strict());
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound("ไม่พบคำเชิญนี้");
  try {
    return inviteResponse(await resendInvite({ tenantId: a.c.tenantId, actorUserId: a.c.userId, membership: a.c.m }, id));
  } catch (e) {
    return thrown(e, "staff.resend");
  }
}
