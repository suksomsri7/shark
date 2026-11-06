// POST /api/mobile/inbox/shift — เข้า/ออกเวรของตัวเอง (`setShift` · กดซ้ำไม่สร้างแถวใหม่ · เข้าเวรได้ = ตอบลูกค้าได้ · 60/นาที · S1.24 · R-S1.21d)
// GET  /api/mobile/inbox/shift — สถานะเวรของตัวเอง (S1.14b) `{ onDuty, onDutyAt }` — แถว ChatShift ที่ยังไม่ปิด
//   (ซ้อนหลายแถว = แถวแรก · ตัวเดียวกับที่ POST เข้าเวรคืน) · ด่าน = อ่านแชทได้
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { setShift } from "@/lib/modules/chat/routing";
import { gate, limited, READ, readBody, REPLY, withErrors } from "../_shared";

async function GET_(req: Request) {
  const a = await gate(req, [READ]);
  if (!a.ok) return a.res;
  const { tenantId, userId } = a.c;
  const open = await tenantDb({ tenantId }).chatShift.findFirst({
    where: { tenantId, userId, offDutyAt: null },
    orderBy: { onDutyAt: "asc" },
    select: { onDutyAt: true },
  });
  return Response.json({ onDuty: !!open, onDutyAt: open ? open.onDutyAt.toISOString() : null });
}

const Body = z.object({ onDuty: z.boolean() }).strict();

async function POST_(req: Request) {
  const a = await gate(req, [REPLY]);
  if (!a.ok) return a.res;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const rl = await limited(a.c, "shift", 60);
  if (rl) return rl;
  const r = await setShift(a.c.tenantId, a.c.userId, b.v.onDuty);
  return Response.json({ onDuty: r.onDuty, onDutyAt: r.onDutyAt ? r.onDutyAt.toISOString() : null });
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("inbox/shift GET", GET_);
export const POST = withErrors("inbox/shift POST", POST_);
