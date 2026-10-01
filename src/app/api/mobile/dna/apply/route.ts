// POST ประกอบระบบจริงจากพิมพ์เขียว (ledger/MOBILE_PLAN.md M-11)
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { mobileDenied, SYSTEM_CREATE } from "@/lib/mobile/guard";
import { applyBlueprint } from "@/lib/dna/apply";

export async function POST(req: Request) {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  const denied = mobileDenied(g, SYSTEM_CREATE); // HOTFIX 2026-10-01: same key as the web door
  if (denied) return denied;
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
