// POST ประกอบระบบจริงจากพิมพ์เขียว (ledger/MOBILE_PLAN.md M-11)
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { applyBlueprint } from "@/lib/dna/apply";

export async function POST(req: Request) {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  let body: { blueprintId?: string };
  try {
    body = (await req.json()) as { blueprintId?: string };
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  const blueprintId = typeof body.blueprintId === "string" ? body.blueprintId : "";
  if (!blueprintId) return Response.json({ error: "blueprintId_required" }, { status: 400 });
  const res = await applyBlueprint(g.ctx.tenantId, blueprintId);
  return Response.json(res);
}
