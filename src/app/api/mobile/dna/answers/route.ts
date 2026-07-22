// POST ส่งคำตอบสัมภาษณ์ → บันทึกข้อเท็จจริง + เสนอพิมพ์เขียว (ledger/MOBILE_PLAN.md M-11)
// facts ไม่ผ่าน Zod → 400
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { ZDnaFacts } from "@/lib/dna/schema";
import { saveDnaFacts, proposeBlueprint } from "@/lib/dna/apply";

export async function POST(req: Request) {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  let body: { facts?: unknown };
  try {
    body = (await req.json()) as { facts?: unknown };
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  const parsed = ZDnaFacts.safeParse(body.facts);
  if (!parsed.success) return Response.json({ error: "invalid_facts" }, { status: 400 });

  await saveDnaFacts(g.ctx.tenantId, parsed.data);
  const { blueprintId, plan } = await proposeBlueprint(g.ctx.tenantId);
  return Response.json({ blueprintId, plan });
}
