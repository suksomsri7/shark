// POST /api/mobile/inbox/shift — เข้า/ออกเวรของตัวเอง (`setShift` · เข้าเวรได้ = ตอบลูกค้าได้ · S1.24)
import { z } from "zod";
import { setShift } from "@/lib/modules/chat/routing";
import { gate, readBody, REPLY } from "../_shared";

const Body = z.object({ onDuty: z.boolean() }).strict();

export async function POST(req: Request) {
  const a = await gate(req, [REPLY]);
  if (!a.ok) return a.res;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const r = await setShift(a.c.tenantId, a.c.userId, b.v.onDuty);
  return Response.json({ onDuty: r.onDuty, onDutyAt: r.onDutyAt ? r.onDutyAt.toISOString() : null });
}
