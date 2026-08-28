// POST /api/v1/chat/read — ลูกค้าอ่านข้อความแล้ว (§3.2)
//
// ⚠️ คนละเรื่องกับ `markRead()` ของทีมงาน: อันนั้นล้าง `staffUnreadCount` (แบดจ์ของทีม)
//    ถ้าเอามาใช้ตรงนี้ ลูกค้าเปิดอ่านแล้วงานจะหายจากกล่อง "รอตอบ" ของทีมทันที
import {
  authenticateChatRequest,
  chatJson,
  chatPreflight,
  resolveExternalUserId,
} from "@/lib/modules/chat/public-auth";
import { markCustomerRead } from "@/lib/modules/chat/service";

export async function OPTIONS(req: Request): Promise<Response> {
  return chatPreflight(req);
}

export async function POST(req: Request): Promise<Response> {
  const auth = await authenticateChatRequest(req);
  if (!auth.ok) return auth.response;

  let body: { externalUserId?: unknown; lastReadMessageId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return chatJson(auth, { error: "body ต้องเป็น JSON" }, 400);
  }
  const who = resolveExternalUserId(auth, body.externalUserId);
  if (!who.ok) return who.response;

  const lastReadMessageId =
    typeof body.lastReadMessageId === "string" && body.lastReadMessageId.trim()
      ? body.lastReadMessageId.trim()
      : undefined;

  const result = await markCustomerRead({
    connection: auth.connection,
    externalUserId: who.externalUserId,
    lastReadMessageId,
  });
  return chatJson(auth, {
    ok: true,
    ...(result.conversationId ? { conversationId: result.conversationId } : {}),
  });
}
