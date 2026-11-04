// POST /api/mobile/secretary/staff/invite {name, phone, role, unitIds?, permissions?} — เชิญพนักงานด้วยเบอร์ (S1.25 `inviteStaff` · R-K11 · ไม่สร้าง Membership จนกว่าจะรับ)
//   เพดานของ lib (ต่อร้าน+เบอร์ 5/วัน · ร้าน 50/วัน · ผู้เชิญ 30/วัน) + เพดานเส้นนี้ 10/นาที
import { z } from "zod";
import { inviteStaff } from "@/lib/staff/invite";
import { gate, ID_MAX, readBody, thrown, withRateLimit } from "../../_shared";
import { inviteResponse } from "../_staff";

const Body = z
  .object({
    name: z.string().trim().min(1).max(80),
    phone: z.string().trim().min(6).max(20),
    role: z.enum(["MANAGER", "STAFF"]),
    unitIds: z.array(z.string().max(ID_MAX)).max(50).optional(),
    permissions: z.record(z.string().max(120), z.unknown()).optional(),
  })
  .strict();

export async function POST(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.c.userId, "staff-invite", 10);
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  try {
    return inviteResponse(await inviteStaff({ tenantId: a.c.tenantId, actorUserId: a.c.userId, membership: a.c.m }, b.v));
  } catch (e) {
    return thrown(e, "staff.invite");
  }
}
