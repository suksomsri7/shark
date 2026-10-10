// GET รายการห้อง · POST เปิดห้องใหม่ (ledger/MOBILE_PLAN.md M-11)
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { mobileDenied, mobileAiCtx, AI_CHAT } from "@/lib/mobile/guard";
import { listConversations, createConversation } from "@/lib/mobile/conversations";

export async function GET(req: Request) {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  const denied = mobileDenied(g, AI_CHAT); // HOTFIX 2026-10-01: same key as the web door
  if (denied) return denied;
  const conversations = await listConversations(mobileAiCtx(g)); // CRM C5.5-G2: own rooms only
  return Response.json({ conversations });
}

export async function POST(req: Request) {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  const denied = mobileDenied(g, AI_CHAT); // HOTFIX 2026-10-01: same key as the web door
  if (denied) return denied;
  let body: { title?: string };
  try {
    body = (await req.json()) as { title?: string };
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  const { id } = await createConversation(mobileAiCtx(g), typeof body.title === "string" ? body.title : undefined); // CRM C5.5-G2: creator in the id
  return Response.json({ id });
}
