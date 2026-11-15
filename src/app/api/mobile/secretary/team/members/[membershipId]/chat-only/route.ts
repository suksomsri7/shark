// PUT /api/mobile/secretary/team/members/[membershipId]/chat-only {} — ตั้งบทบาท "คุยอย่างเดียว" (B27 · ⚙ ในห้องแชท)
//   = STAFF + ไม่มีสาขา + ไม่มีคีย์สิทธิ์ระบบ (`updateStaffAccess` เดิม: ผู้สั่งต้องมี settings.staff.write · MANAGER แตะได้เฉพาะ STAFF ·
//     OWNER คนสุดท้ายลดไม่ได้ · ห้ามแก้ตัวเองยกเว้น OWNER · AuditLog membership.role.changed/access.update) — ตรวจทั้งหมดใน lib
import { z } from "zod";
import { updateStaffAccess } from "@/lib/staff/service";
import { gate, idParam, notFound, readBody, withRateLimit, type RouteCtx, withErrors } from "../../../../_shared";
import { staffResponse } from "../../../../staff/_staff";
import { rlKey } from "../../../_team";

const Body = z.object({}).strict();

async function PUT_(req: Request, ctx: RouteCtx<"membershipId">) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(rlKey(a.c), "staff");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "membershipId");
  if (!id) return notFound("ไม่พบผู้ใช้งานคนนี้");
  return staffResponse(await updateStaffAccess({ tenantId: a.c.tenantId, actorUserId: a.c.userId, membershipId: id, role: "STAFF", unitAccess: [], permissions: {} }));
}

export const PUT = withErrors("secretary/team/members/[membershipId]/chat-only PUT", PUT_);
