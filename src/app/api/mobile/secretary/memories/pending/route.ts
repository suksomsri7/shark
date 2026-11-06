// GET /api/mobile/secretary/memories/pending — ความจำของร้านที่รอเจ้าของยืนยัน (S1.10 `pendingMemories` · OWNER เท่านั้น · คนอื่นได้รายการว่าง)
import { pendingMemories } from "@/lib/ai/secretary/teach";
import { gate, ok, withErrors } from "../../_shared";

async function GET_(req: Request) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  return ok({ items: await pendingMemories(a.c.conv) });
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("secretary/memories/pending GET", GET_);
