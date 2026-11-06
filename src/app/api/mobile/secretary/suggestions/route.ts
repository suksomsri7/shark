// GET /api/mobile/secretary/suggestions — การ์ด "งานที่เลขาแนะนำ" (S1.11 · deterministic · ไม่เรียกโมเดล · ไม่เปิดห้องเอง — แอปเรียก POST rooms เมื่อแตะ)
import { suggestions } from "@/lib/ai/secretary/suggest";
import { gate, ok, withErrors } from "../_shared";

async function GET_(req: Request) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  return ok({ items: await suggestions(a.c.conv) });
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("secretary/suggestions GET", GET_);
