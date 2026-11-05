// GET /api/mobile/secretary/memories/pending — ความจำของร้านที่รอเจ้าของยืนยัน (S1.10 `pendingMemories` · OWNER เท่านั้น · คนอื่นได้รายการว่าง)
import { pendingMemories } from "@/lib/ai/secretary/teach";
import { gate, ok } from "../../_shared";

export async function GET(req: Request) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  return ok({ items: await pendingMemories(a.c.conv) });
}
