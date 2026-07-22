// GET รายการห้อง · POST เปิดห้องใหม่ (ledger/MOBILE_PLAN.md M-11)
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { listConversations, createConversation } from "@/lib/mobile/conversations";

export async function GET(req: Request) {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  const conversations = await listConversations(g.ctx);
  return Response.json({ conversations });
}

export async function POST(req: Request) {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  let body: { title?: string };
  try {
    body = (await req.json()) as { title?: string };
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  const { id } = await createConversation(g.ctx, typeof body.title === "string" ? body.title : undefined);
  return Response.json({ id });
}
