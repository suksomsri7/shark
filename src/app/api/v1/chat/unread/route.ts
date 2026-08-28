// GET /api/v1/chat/unread — จำนวนข้อความจากร้านที่ลูกค้ายังไม่ได้อ่าน (§3.2)
import {
  authenticateChatRequest,
  chatJson,
  chatPreflight,
  resolveExternalUserId,
} from "@/lib/modules/chat/public-auth";
import { customerUnreadCount } from "@/lib/modules/chat/service";

export async function OPTIONS(req: Request): Promise<Response> {
  return chatPreflight(req);
}

export async function GET(req: Request): Promise<Response> {
  const auth = await authenticateChatRequest(req);
  if (!auth.ok) return auth.response;

  const who = resolveExternalUserId(auth, new URL(req.url).searchParams.get("externalUserId"));
  if (!who.ok) return who.response;

  const unread = await customerUnreadCount({
    connection: auth.connection,
    externalUserId: who.externalUserId,
  });
  return chatJson(auth, { unread });
}
