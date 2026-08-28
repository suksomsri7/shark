// GET /api/v1/chat/thread — อ่านบทสนทนาของลูกค้าคนหนึ่ง (§3.2)
//
// `messages[]` เป็น **สัญญาสาธารณะ** — shape มาจาก `publicThread()` ที่เดียว (ชั้น 1)
// เปลี่ยน shape ทีหลัง = ลูกค้าที่ต่อ API อยู่พังทั้งหมด (D2)
import {
  authenticateChatRequest,
  chatJson,
  chatPreflight,
  resolveExternalUserId,
} from "@/lib/modules/chat/public-auth";
import { publicThread } from "@/lib/modules/chat/service";

export async function OPTIONS(req: Request): Promise<Response> {
  return chatPreflight(req);
}

export async function GET(req: Request): Promise<Response> {
  const auth = await authenticateChatRequest(req);
  if (!auth.ok) return auth.response;

  const q = new URL(req.url).searchParams;
  const who = resolveExternalUserId(auth, q.get("externalUserId"));
  if (!who.ok) return who.response;

  const afterRaw = q.get("after");
  const after = afterRaw ? new Date(afterRaw) : undefined;
  if (after && Number.isNaN(after.getTime())) {
    return chatJson(auth, { error: "after ต้องเป็นวันเวลารูปแบบ ISO" }, 400);
  }
  const limitRaw = q.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
    return chatJson(auth, { error: "limit ต้องเป็นจำนวนเต็มบวก" }, 400);
  }

  const thread = await publicThread({
    connection: auth.connection,
    externalUserId: who.externalUserId,
    after,
    limit,
  });
  return chatJson(auth, thread);
}
