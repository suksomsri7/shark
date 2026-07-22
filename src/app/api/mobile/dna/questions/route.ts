// GET คำถามสัมภาษณ์ DNA — JSON เดียวกับเว็บ (ledger/MOBILE_PLAN.md M-11)
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { QUESTIONS } from "@/lib/dna/questions";

export async function GET(req: Request) {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  return Response.json({ questions: QUESTIONS });
}
