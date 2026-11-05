// GET/PUT /api/mobile/secretary/after-hours — Shark ตอบลูกค้านอกเวลาทำการ (S1.22 · B7) · OWNER เท่านั้นทั้งอ่านและตั้ง
//   PUT {reply?, handoff?, disclosure?} → `setAfterHours` (ผูกร้าน + ตรวจ OWNER จากฐาน · disclosure ต้องบอกว่าเป็น AI)
import { z } from "zod";
import { afterHoursSettings, setAfterHours } from "@/lib/modules/chat/after-hours";
import { forbidden, gate, ok, readBody, thrown, withRateLimit } from "../_shared";

const Body = z.object({ reply: z.boolean().optional(), handoff: z.boolean().optional(), disclosure: z.string().max(400).optional() }).strict();
const OWNER_ONLY = "ตั้งค่าการตอบนอกเวลาได้เฉพาะเจ้าของกิจการ";

export async function GET(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  if (a.c.m.role !== "OWNER") return forbidden(OWNER_ONLY);
  return ok(await afterHoursSettings(a.c.tenantId));
}

export async function PUT(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "after-hours");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  try {
    return ok(await setAfterHours(a.c.tenantId, { userId: a.c.userId, membership: a.c.m, tenantId: a.c.tenantId }, b.v));
  } catch (e) {
    return thrown(e, "after-hours.put");
  }
}
