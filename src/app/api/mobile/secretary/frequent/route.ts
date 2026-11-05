// GET /api/mobile/secretary/frequent?take — งานที่ผู้ใช้สั่งบ่อย (S1.11 `frequentInstructions` · นับซ้ำ ≥ 2 · ≤ 20)
import { frequentInstructions } from "@/lib/ai/secretary/suggest";
import { gate, ok, takeOf } from "../_shared";

export async function GET(req: Request) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const take = takeOf(new URL(req.url).searchParams.get("take"), 5, 20);
  return ok({ items: await frequentInstructions(a.c.conv, take) });
}
