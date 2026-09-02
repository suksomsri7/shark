// POST /api/v1/chat/messages — ลูกค้าส่งข้อความเข้าระบบ (§3.2)
//
// ชั้น route ทำแค่ 3 อย่าง: ตรวจตัวตน → แปลง body → เรียก `receiveExternalInbound` (ชั้น 1)
// 🔴 ห้ามมี logic ธุรกิจตรงนี้เด็ดขาด (กฎเหล็กข้อ 1) — dedupe/lock/แจ้งเตือน/outbox
//    อยู่ในชั้น 1 ทั้งหมด ไม่งั้น widget ฝังกับ SiamDive จะได้พฤติกรรมคนละแบบ
import {
  authenticateChatRequest,
  chatJson,
  chatPreflight,
  resolveExternalUserId,
} from "@/lib/modules/chat/public-auth";
import { receiveExternalInbound } from "@/lib/modules/chat/service";
import type { ExternalAttachmentInput } from "@/lib/modules/chat/service";

export async function OPTIONS(req: Request): Promise<Response> {
  return chatPreflight(req);
}

type Body = {
  externalUserId?: unknown;
  body?: unknown;
  attachments?: unknown;
  clientMessageId?: unknown;
  context?: unknown;
  displayName?: unknown;
  email?: unknown;
  phone?: unknown;
  lang?: unknown;
  verifiedEmail?: unknown;
  externalRef?: unknown;
  sentAt?: unknown;
};

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const posInt = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined;

// แปลง attachments จาก JSON ให้ตรงชนิดที่ชั้น 1 รับ — ตัวที่ไม่มี url/mimeType ชั้น 1 กรองทิ้งเอง
function toAttachments(raw: unknown): ExternalAttachmentInput[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.flatMap((a): ExternalAttachmentInput[] => {
    if (!a || typeof a !== "object") return [];
    const o = a as Record<string, unknown>;
    const url = str(o.url);
    const mimeType = str(o.mimeType);
    if (!url || !mimeType) return [];
    return [
      {
        url,
        mimeType,
        fileName: str(o.name) ?? str(o.fileName),
        sizeBytes: posInt(o.sizeBytes),
        width: posInt(o.width),
        height: posInt(o.height),
        storageKey: str(o.storageKey),
        // 🔴 ความยาวคลิป = "เจตนาว่านี่คือข้อความเสียง" (ไม่ใช่ไฟล์เสียงที่แนบมาเฉย ๆ)
        //    ตัดทิ้งตรงนี้ = เสียงที่ลูกค้าอัดจากเว็บ/แอปกลายเป็นไฟล์แนบธรรมดา ฟองเสียงไม่ขึ้นในห้อง
        //    ขอบเขตค่า (เพดาน 2 นาที) เป็น logic ธุรกิจ → ตรวจที่ชั้น 1 ตามกฎเหล็กข้อ 1
        durationMs: posInt(o.durationMs),
      },
    ];
  });
}

export async function POST(req: Request): Promise<Response> {
  const auth = await authenticateChatRequest(req);
  if (!auth.ok) return auth.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return chatJson(auth, { error: "body ต้องเป็น JSON" }, 400);
  }

  // 🔴 โหมด widget: ตัวตนมาจาก guest token เท่านั้น · อ้างเป็นคนอื่น = 403
  const who = resolveExternalUserId(auth, body.externalUserId);
  if (!who.ok) return who.response;

  // ข้อมูลตัวตนเพิ่มเติมเชื่อได้เฉพาะจากเซิร์ฟเวอร์พาร์ตเนอร์ — เบราว์เซอร์อ้างเองไม่ได้
  // (เช่น verifiedEmail: widget ตั้งเองได้ = ตราประทับ "ยืนยันอีเมลแล้ว" ไร้ความหมาย)
  const trusted = auth.mode === "secret";

  // WO-C3b: `sentAt` = เวลาจริงของข้อความ (ใช้ตอนย้ายประวัติ) — แปลงรูปแบบที่นี่
  // ขอบเขตของค่า (อนาคต/เก่าเกินเหตุ) เป็น logic ธุรกิจ อยู่ชั้น 1
  // 🔴 เชื่อได้เฉพาะ secret — widget ตั้งเองได้ = ปลอมเวลาแทรกข้อความไว้กลางประวัติ/บนสุดของ inbox
  const sentAtRaw = trusted ? str(body.sentAt) : undefined;
  const sentAt = sentAtRaw ? new Date(sentAtRaw) : undefined;
  if (sentAt && Number.isNaN(sentAt.getTime())) {
    return chatJson(auth, { error: "sentAt ต้องเป็นวันเวลารูปแบบ ISO" }, 400);
  }

  const result = await receiveExternalInbound({
    connection: auth.connection,
    externalUserId: who.externalUserId,
    body: str(body.body),
    attachments: toAttachments(body.attachments),
    clientMessageId: str(body.clientMessageId),
    displayName: str(body.displayName),
    ...(trusted
      ? {
          email: str(body.email),
          phone: str(body.phone),
          externalRef: str(body.externalRef),
          verifiedEmail: body.verifiedEmail === true,
        }
      : {}),
    lang: str(body.lang),
    ...(sentAt ? { sentAt } : {}),
    context:
      body.context && typeof body.context === "object" && !Array.isArray(body.context)
        ? (body.context as Record<string, unknown>)
        : undefined,
  });

  if (!result.ok) return chatJson(auth, { error: result.reason ?? "ส่งข้อความไม่สำเร็จ" }, 422);
  return chatJson(auth, {
    ok: true,
    ...(result.conversationId ? { conversationId: result.conversationId } : {}),
    ...(result.messageId ? { messageId: result.messageId } : {}),
    ...(result.createdAt ? { createdAt: result.createdAt } : {}), // §3.2 — ผู้เรียกต้องรู้เวลาที่บันทึกจริง
    ...(result.duplicate ? { duplicate: true } : {}),
  });
}
