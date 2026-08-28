// POST /api/v1/chat/identities — ออก/ผูก contact ล่วงหน้า (§3.2)
//
// เฉพาะโหมด secret: เส้นนี้คือการ "อ้างแทนลูกค้าคนหนึ่ง" ตรง ๆ ซึ่งเป็นสิ่งที่ widget
// ทำไม่ได้ตามนิยาม (§3.1) · SiamDive เรียกตอนผู้ใช้ยืนยันอีเมลหรือเปลี่ยนภาษา
import { authenticateChatRequest, chatJson, chatPreflight } from "@/lib/modules/chat/public-auth";
import { upsertExternalIdentity } from "@/lib/modules/chat/service";

export async function OPTIONS(req: Request): Promise<Response> {
  return chatPreflight(req);
}

type Body = {
  externalUserId?: unknown;
  displayName?: unknown;
  email?: unknown;
  phone?: unknown;
  lang?: unknown;
  verifiedEmail?: unknown;
  externalRef?: unknown;
  meta?: unknown;
};

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export async function POST(req: Request): Promise<Response> {
  const auth = await authenticateChatRequest(req);
  if (!auth.ok) return auth.response;
  if (auth.mode !== "secret") {
    return chatJson(auth, { error: "เส้นนี้ใช้ได้เฉพาะกุญแจฝั่งเซิร์ฟเวอร์" }, 403);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return chatJson(auth, { error: "body ต้องเป็น JSON" }, 400);
  }
  const externalUserId = str(body.externalUserId);
  if (!externalUserId) return chatJson(auth, { error: "ต้องระบุ externalUserId" }, 400);

  const result = await upsertExternalIdentity({
    connection: auth.connection,
    externalUserId,
    displayName: str(body.displayName),
    email: str(body.email),
    phone: str(body.phone),
    lang: str(body.lang),
    externalRef: str(body.externalRef),
    verifiedEmail: body.verifiedEmail === true,
    meta:
      body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)
        ? (body.meta as Record<string, unknown>)
        : undefined,
  });
  if (!result.ok) return chatJson(auth, { error: result.reason }, 422);
  return chatJson(auth, {
    contactId: result.contactId,
    ...(result.conversationId ? { conversationId: result.conversationId } : {}),
  });
}
