// POST /api/mobile/secretary/team/threads {name, userIds[], photoFileId?} — สร้างกลุ่ม (B27 · ผู้สร้าง = ผู้ดูแล) · สมาชิกต้องเป็นคนในทีม · 10/นาที
//   photoFileId = รูปที่ผู้สร้างอัปเองผ่าน team/attachments (lib ตรวจ)
import { z } from "zod";
import { createGroup } from "@/lib/team-chat/service";
import { gate, ID_MAX, ok, readBody, withRateLimit, withErrors } from "../../_shared";
import { rlKey, teamCtx, teamFail } from "../_team";

const Body = z
  .object({
    name: z.string().trim().min(1).max(60),
    userIds: z.array(z.string().max(ID_MAX)).min(1).max(255),
    photoFileId: z.string().max(ID_MAX).nullable().optional(),
  })
  .strict();

async function POST_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(rlKey(a.c), "team-group", 10);
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const r = await createGroup(teamCtx(a.c), b.v);
  if (!r.ok) return teamFail(r);
  return ok({ threadId: r.threadId });
}

export const POST = withErrors("secretary/team/threads POST", POST_);
