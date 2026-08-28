// POST /api/v1/chat/guest — ออกตัวตนผู้เยี่ยมชมให้ widget (§3.2)
//
// เฉพาะโหมด widget: guest token คือสิ่งที่ทำให้ widget "เป็นใครสักคน" ได้โดยไม่ต้องรู้
// externalUserId ของคนอื่น · เซิร์ฟเวอร์เป็นคนออกและเซ็นให้ (public-auth.ts) — client ปลอมไม่ได้
import { authenticateChatRequest, chatJson, chatPreflight, guestCookieHeader } from "@/lib/modules/chat/public-auth";

export async function OPTIONS(req: Request): Promise<Response> {
  return chatPreflight(req);
}

export async function POST(req: Request): Promise<Response> {
  const auth = await authenticateChatRequest(req, { guest: "mint" });
  if (!auth.ok) return auth.response;
  if (auth.mode !== "widget") {
    return chatJson(auth, { error: "เส้นนี้ใช้ได้เฉพาะกุญแจ widget" }, 403);
  }
  const token = auth.guestToken!;
  return chatJson(
    auth,
    { guestToken: token },
    200,
    auth.mintedGuestToken ? guestCookieHeader(auth.connection.id, token) : undefined,
  );
}
