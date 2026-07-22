// PATCH เปลี่ยนชื่อ · DELETE ลบ soft (ledger/MOBILE_PLAN.md M-11)
// Next 16: params เป็น Promise ต้อง await
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { renameConversation, deleteConversation } from "@/lib/mobile/conversations";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  const { id } = await params;
  let body: { title?: string };
  try {
    body = (await req.json()) as { title?: string };
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return Response.json({ error: "title_required" }, { status: 400 });
  const ok = await renameConversation(g.ctx, id, title);
  return Response.json({ ok });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  const { id } = await params;
  const ok = await deleteConversation(g.ctx, id);
  return Response.json({ ok });
}
