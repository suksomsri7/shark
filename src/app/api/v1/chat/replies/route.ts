// POST /api/v1/chat/replies — คำตอบของทีมงานจากระบบภายนอก "สะท้อน" เข้ามาเก็บใน SHARK (WO-C3b)
//
// 🔴 **secret key เท่านั้น** — widget key ยิงเส้นนี้ต้อง 403 (ไม่ใช่ 401: กุญแจถูกต้องแต่ไม่มีสิทธิ์
//    เพื่อให้คนเขียน widget รู้ทันทีว่าเส้นนี้ไม่ใช่ของเบราว์เซอร์) · ถ้าหลุด = ใครก็ปลอมเป็น
//    ทีมงานคุยกับลูกค้าได้ในนามร้าน
// 🔴 เส้นนี้ **ไม่ยิงข้อความออกช่องทางภายนอกซ้ำ** และ **ไม่ยิง `chat.message.sent`**
//    (ระบบต้นทางส่งถึงลูกค้าไปแล้ว — ดูเหตุผลเต็มที่ `service.receiveExternalReply`)
//
// ชั้น route ทำแค่ 3 อย่าง: ตรวจตัวตน → แปลง body → เรียกชั้น 1 (กฎเหล็กข้อ 1 §2)
import {
  authenticateChatRequest,
  chatJson,
  chatPreflight,
} from "@/lib/modules/chat/public-auth";
import { receiveExternalReply } from "@/lib/modules/chat/service";

export async function OPTIONS(req: Request): Promise<Response> {
  return chatPreflight(req);
}

type Body = {
  externalUserId?: unknown;
  body?: unknown;
  senderName?: unknown;
  clientMessageId?: unknown;
  sentAt?: unknown;
  isInternal?: unknown;
};

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export async function POST(req: Request): Promise<Response> {
  // guest: "optional" — widget key ต้องตกที่ 403 ข้างล่างเสมอ ไม่ใช่ 401 "ยังไม่มี guest"
  // (เหตุผลของการปฏิเสธต้องเป็น "เส้นนี้ไม่ใช่ของ widget" ไม่ใช่ "ทำ guest ให้ครบก่อน")
  const auth = await authenticateChatRequest(req, { guest: "optional" });
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

  // แปลงรูปแบบเท่านั้น — ขอบเขตของเวลา (อนาคต/เก่าเกินเหตุ) เป็น logic ธุรกิจ อยู่ชั้น 1
  const sentAtRaw = str(body.sentAt);
  const sentAt = sentAtRaw ? new Date(sentAtRaw) : undefined;
  if (sentAt && Number.isNaN(sentAt.getTime())) {
    return chatJson(auth, { error: "sentAt ต้องเป็นวันเวลารูปแบบ ISO" }, 400);
  }

  const result = await receiveExternalReply({
    connection: auth.connection,
    externalUserId,
    body: typeof body.body === "string" ? body.body : "",
    senderName: str(body.senderName),
    clientMessageId: str(body.clientMessageId),
    sentAt,
    isInternal: body.isInternal === true,
  });

  if (!result.ok) return chatJson(auth, { error: result.reason ?? "บันทึกคำตอบไม่สำเร็จ" }, 422);
  return chatJson(auth, {
    ok: true,
    ...(result.conversationId ? { conversationId: result.conversationId } : {}),
    ...(result.messageId ? { messageId: result.messageId } : {}),
    ...(result.createdAt ? { createdAt: result.createdAt } : {}),
    ...(result.duplicate ? { duplicate: true } : {}),
  });
}
