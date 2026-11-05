// GET /api/mobile/secretary/suggestions — การ์ด "งานที่เลขาแนะนำ" (S1.11 · deterministic · ไม่เรียกโมเดล · ไม่เปิดห้องเอง — แอปเรียก POST rooms เมื่อแตะ)
import { suggestions } from "@/lib/ai/secretary/suggest";
import { gate, ok } from "../_shared";

export async function GET(req: Request) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  return ok({ items: await suggestions(a.c.conv) });
}
