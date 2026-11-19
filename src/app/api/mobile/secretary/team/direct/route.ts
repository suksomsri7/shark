// POST /api/mobile/secretary/team/direct {userId} — เปิด/คืนห้องแชท 1:1 กับคนในทีม (B27) · อีกฝ่ายต้องเป็นสมาชิกร้านที่รับแล้ว · 30/นาที
import { z } from "zod";
import { openDirect } from "@/lib/team-chat/service";
import { gate, ID_MAX, ok, readBody, withRateLimit, withErrors } from "../../_shared";
import { rlKey, teamCtx, teamFail } from "../_team";

const Body = z.object({ userId: z.string().trim().min(1).max(ID_MAX) }).strict();

async function POST_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(rlKey(a.c), "team-direct");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const r = await openDirect(teamCtx(a.c), b.v.userId);
  if (!r.ok) return teamFail(r);
  return ok({ threadId: r.threadId });
}

export const POST = withErrors("secretary/team/direct POST", POST_);
