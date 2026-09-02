"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertChatCan } from "./guard";
import {
  sendReply,
  setStatus,
  assign,
  markRead,
  linkCustomer,
  connectLine,
  setConnectionStatus,
  setMemberSystem,
  setBusinessHours,
} from "./service";
import type { ExternalAttachmentInput } from "./service";
// ชั้นกลาง realtime (WO-CV9) — ยิงที่ **call site** ไม่ใช่ใน `sendReply`
// (ฟังก์ชันนั้นเป็นของสายข้อความเสียงในรอบเดียวกัน — สองสายแก้ฟังก์ชันเดียวกัน = ชนกันแน่)
import { publishChat, EV_CHAT_NEW } from "@/lib/realtime";
import { setRetentionDays } from "./retention";
import { validateBusinessHours } from "./business-hours";
import { translateMessage, translateDraft, type TranslateResult } from "./translate";
import { suggestReply, recordSuggestionOutcome, ignoreSuggestions, type SuggestResult } from "./ai-suggest";
import { saveAnswerExample, archiveAnswerExample } from "./learning";
import {
  uploadFile,
  ALLOWED_UPLOAD_TYPES,
  CHAT_ATTACHMENT_MAX_BYTES,
  normalizeUploadType,
  isAudioUploadType,
} from "@/lib/storage/service";
// ชื่อนามสกุลที่ระบบรับ — ประกอบจากทะเบียนเดียวกัน ห้ามพิมพ์ลิสต์ซ้ำในข้อความบอกผู้ใช้
import { uploadExtensions } from "@/lib/storage/upload-accept";
import { tenantDb } from "@/lib/core/db";
import { canSendAudio } from "./adapter";
import { channelSentenceLabel } from "./channel-icon";

// ทุก action: requireTenant + revalidate หน้า chat ของระบบนั้น

function chatPath(systemId: string, conversationId?: string) {
  return conversationId
    ? `/app/sys/${systemId}/chat?c=${conversationId}`
    : `/app/sys/${systemId}/chat`;
}

function revalidateChat(systemId: string) {
  revalidatePath(`/app/sys/${systemId}/chat`);
  revalidatePath(`/app/sys/${systemId}`);
}

/** error แบบ inline บนหน้าแชท (ไม่ใช่ Alert) — [[feedback_validation_inline_not_alert]] */
function chatError(systemId: string, conversationId: string, msg: string): never {
  const base = chatPath(systemId, conversationId);
  redirect(`${base}${base.includes("?") ? "&" : "?"}err=${encodeURIComponent(msg)}`);
}

/** ไฟล์แนบสูงสุดต่อข้อความ — ตัวเลขเดียวกับขาเข้า (`MAX_EXTERNAL_ATTACHMENTS` ใน service) */
const MAX_REPLY_FILES = 10;

/**
 * รับไฟล์จากฟอร์ม → ตรวจ → อัปขึ้น storage → คืน `ExternalAttachmentInput[]`
 *
 * 🔴 **อยู่นอกทรานแซกชันเสมอ** และเกิด **ก่อน** `sendReply` — Bunny เป็น network call
 *    ขังไว้ในทรานแซกชัน = ถือ connection ของ Neon ค้าง → pool ตันทั้งแพลตฟอร์ม (กฎเหล็กข้อ 5)
 * 🔴 ตรวจขนาด/ชนิด **ก่อนอัป** ไม่ใช่ปล่อยอัปแล้วค่อยเด้ง error — ผู้ใช้บนมือถือรอ 30 วิ
 *    แล้วโดนปฏิเสธ คือประสบการณ์ที่แย่กว่าบอกตั้งแต่แรก 10 เท่า
 * 🔴 อัปไม่ผ่านแม้ไฟล์เดียว = ไม่เขียนข้อความเลย — ข้อความครึ่ง ๆ กลาง ๆ ที่รูปหาย
 *    ทำให้ทีมเข้าใจว่าส่งไปแล้วทั้งที่ลูกค้าไม่ได้รับรูป
 */
async function uploadReplyFiles(
  tenantId: string,
  systemId: string,
  conversationId: string,
  formData: FormData,
): Promise<ExternalAttachmentInput[]> {
  const files = formData
    .getAll("files")
    .filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f)
    .filter((f) => f.size > 0);
  if (files.length === 0) return [];
  if (files.length > MAX_REPLY_FILES) {
    chatError(systemId, conversationId, `แนบไฟล์ได้ไม่เกิน ${MAX_REPLY_FILES} รายการต่อข้อความ`);
  }

  for (const f of files) {
    // 🔴 normalize ก่อนเทียบทะเบียน — เหมือน `sendVoiceReplyAction` และ `uploadFile`
    //    เบราว์เซอร์คืน mime พร้อมพารามิเตอร์เป็นเรื่องปกติ (`audio/wav;codecs=1`
    //    · `audio/webm;codecs=opus`) ⇒ เทียบดิบ = ปฏิเสธไฟล์ที่ storage เองรับได้อยู่แล้ว
    //    (normalize ≠ ปล่อยผ่าน — ชนิดที่ normalize แล้วยังไม่อยู่ในทะเบียน ยังถูกปฏิเสธเหมือนเดิม)
    const mime = normalizeUploadType(f.type);
    // ทะเบียนชนิดไฟล์เดียวกับ storage/service — ห้ามมีลิสต์ที่สอง
    if (!(mime in ALLOWED_UPLOAD_TYPES)) {
      chatError(
        systemId,
        conversationId,
        // 🔴 รายชื่อชนิดสร้างจากทะเบียน ไม่พิมพ์มือ — ลิสต์พิมพ์มือคือทะเบียนที่สอง
        //    วันที่เพิ่มชนิดใหม่ ข้อความจะโกหกผู้ใช้ทันทีโดยไม่มีใครรู้
        `ไฟล์ "${f.name}" เป็นชนิดที่ส่งในแชทไม่ได้ — ชนิดที่ส่งได้ตอนนี้คือ ${uploadExtensions(ALLOWED_UPLOAD_TYPES).join(" · ")}`,
      );
    }
    // เพดานเดียวกับที่ storage บังคับ (CHAT_ATTACHMENT_MAX_BYTES) — ห้ามพิมพ์ตัวเลขซ้ำที่นี่
    if (f.size > CHAT_ATTACHMENT_MAX_BYTES) {
      chatError(
        systemId,
        conversationId,
        `ไฟล์ "${f.name}" ใหญ่เกิน ${Math.round(CHAT_ATTACHMENT_MAX_BYTES / (1024 * 1024))}MB — ย่อขนาดแล้วส่งใหม่ได้เลย`,
      );
    }
  }

  const out: ExternalAttachmentInput[] = [];
  for (const f of files) {
    // ใช้ชื่อในทะเบียน (ตัดพารามิเตอร์ทิ้งแล้ว) ทั้งตอนอัปและตอนบันทึกแถว —
    // ไม่งั้น `ChatAttachment.mimeType` จะเก็บ `audio/wav;codecs=1` ไว้ให้ทุกคนที่อ่านต่อไปเจอเอง
    const mime = normalizeUploadType(f.type);
    const res = await uploadFile(
      { tenantId },
      {
        kind: "ATTACHMENT",
        filename: f.name,
        contentType: mime,
        data: new Uint8Array(await f.arrayBuffer()),
        maxBytes: CHAT_ATTACHMENT_MAX_BYTES,
      },
    );
    if (!res.ok) chatError(systemId, conversationId, res.error);
    out.push({
      url: res.cdnUrl,
      mimeType: mime,
      fileName: f.name,
      sizeBytes: f.size,
      // path บน CDN = handle เดียวที่จะไปลบไฟล์จริงทีหลังได้ (retention เก็บช่องนี้ไว้โดยเจตนา)
      storageKey: (() => {
        try {
          return new URL(res.cdnUrl).pathname.replace(/^\/+/, "");
        } catch {
          return res.cdnUrl;
        }
      })(),
    });
  }
  return out;
}

// ── ส่งข้อความ / รูป / ไฟล์ / โน้ตภายใน ──
/**
 * ส่งคำตอบของทีม — **คืนผลลัพธ์ ไม่ redirect**
 *
 * 🔴 บั๊กจริงที่เจ้าของเจอ 1 ก.ย. 2026 (มีภาพหน้าจอ):
 *    ของเดิมจบด้วย `redirect()` ซึ่ง Next ใช้วิธี **โยน error พิเศษ** เป็นกลไก
 *    หน้าจอใหม่เรียก action นี้ตรง ๆ (ไม่ผ่าน `<form action>`) แล้วครอบด้วย try/catch
 *    ⇒ catch คว้า error ของ redirect ไปตีความว่า "ส่งไม่สำเร็จ"
 *    ผลคือ **ข้อความส่งสำเร็จจริงและขึ้นในห้องแล้ว แต่จอขึ้นสีแดงว่าส่งไม่สำเร็จ
 *    พร้อมเอาข้อความกลับมาใส่ช่องพิมพ์** — ถ้าผู้ใช้กดส่งซ้ำก็จะได้ข้อความซ้ำ
 *    ⇒ เลิก redirect ทั้งเส้น (ไม่มีใครเรียกผ่านฟอร์มแล้ว) แล้วคืนผลจริงให้หน้าจอตัดสินใจเอง
 *
 * 🔴 กติกาที่ต้องรักษา: `ok:false` = **ไม่ได้บันทึก** เท่านั้น
 *    ส่งออกช่องทางไม่สำเร็จแต่บันทึกแล้ว ให้ดูที่ `ChatMessage.deliveryStatus` (จอแสดง ✗ + ปุ่มลองใหม่)
 */
export type SendReplyResult = { ok: boolean; reason?: string; messageId?: string };

export async function sendReplyAction(formData: FormData): Promise<SendReplyResult> {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.message.send");
  const systemId = String(formData.get("systemId") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "");
  const originalBody = String(formData.get("originalBody") ?? "");
  const suggestionId = String(formData.get("suggestionId") ?? "").trim();
  const isInternal = String(formData.get("isInternal") ?? "") === "on";
  if (!systemId || !conversationId) return { ok: false, reason: "ไม่พบบทสนทนา" };
  {
    const tenantId = auth.active.tenantId;
    // 🔴 อัปโหลดจบก่อน แล้วค่อยเข้าทรานแซกชันของ sendReply
    const attachments = await uploadReplyFiles(tenantId, systemId, conversationId, formData);
    if (body.trim() || attachments.length > 0) {
      const unitAccess = auth.active.unitAccess as string[];
      const sent = await sendReply({
        tenantId,
        systemId,
        conversationId,
        senderUserId: auth.user.id,
        body,
        attachments,
        isInternal,
        ...(originalBody.trim() ? { originalBody } : {}),
        unitAccess,
      });
      await markRead({
        tenantId,
        systemId,
        conversationId,
        userId: auth.user.id,
        unitAccess,
      });
      // เส้นทางที่ 1 ของ §5.4 — ส่งด้วยคำแนะนำของ AI (แก้หรือไม่แก้ก็ตาม) → บันทึกผลจริง
      // 🔴 ความจริงคือข้อความที่ส่ง ไม่ใช่ที่ AI เสนอ · ล้มที่นี่ต้องไม่ทำให้ข้อความหาย
      if (suggestionId && sent.messageId && !isInternal) {
        await recordSuggestionOutcome({
          tenantId,
          systemId,
          suggestionId,
          sentMessageId: sent.messageId,
          sentBody: body,
          userId: auth.user.id,
        }).catch(() => null);
      }
      // 🔴 สัญญาณ "ห้องนี้มีของใหม่" หลังบันทึกสำเร็จแล้วเท่านั้น — เพื่อนร่วมทีมที่เปิดห้อง
      //    เดียวกันอยู่จะเห็นทันทีโดยไม่ต้องรอรอบ poll · ส่งแค่ id ห้อง ไม่มีเนื้อความ
      //    ห้าม throw ที่นี่เด็ดขาด (`publish` กลืน error ให้แล้ว): ข้อความถูกบันทึกไปแล้ว
      //    ถ้าคืน ok:false ผู้ใช้จะกดส่งซ้ำแล้วได้ข้อความซ้ำ
      if (sent.messageId) {
        await publishChat(tenantId, systemId, EV_CHAT_NEW, {
          conversationId,
          kind: isInternal ? "note" : "outbound",
        });
      }
      revalidateChat(systemId);
      return sent.ok
        ? { ok: true, ...(sent.messageId ? { messageId: sent.messageId } : {}) }
        : { ok: false, reason: sent.reason ?? "ส่งข้อความไม่สำเร็จ" };
    }
  }
  return { ok: false, reason: "ต้องมีข้อความหรือไฟล์แนบอย่างน้อยหนึ่งอย่าง" };
}

// ── 🌐 แปลข้อความของลูกค้า (ปุ่ม "แปล" ใต้ฟองข้อความ) ──
// คืนผลให้หน้าจอแสดงเอง — ไม่ redirect เพราะร่างที่ทีมกำลังพิมพ์ต้องไม่หาย
export async function translateMessageAction(
  systemId: string,
  messageId: string,
  targetLang?: string,
): Promise<TranslateResult> {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.translate.use");
  if (!systemId || !messageId) return { ok: false, reason: "ข้อมูลไม่ครบสำหรับการแปล" };
  return translateMessage({
    tenantId: auth.active.tenantId,
    systemId,
    messageId,
    targetLang,
    userId: auth.user.id,
  });
}

// ── 🌐 แปลร่างก่อนส่ง (ทีม → ลูกค้า) ──
// 🔴 คืนคำแปลเฉย ๆ **ไม่ส่งเอง** — ทีมต้องเห็นและกดส่งเองอีกครั้ง (§5.2)
export async function translateDraftAction(
  systemId: string,
  conversationId: string,
  body: string,
  targetLang?: string,
): Promise<TranslateResult> {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.translate.use");
  if (!systemId || !conversationId) return { ok: false, reason: "ข้อมูลไม่ครบสำหรับการแปล" };
  return translateDraft({
    tenantId: auth.active.tenantId,
    systemId,
    conversationId,
    body,
    targetLang,
    userId: auth.user.id,
  });
}

// ── ✨ AI แนะนำคำตอบ ──
// 🔴 เป็นข้อเสนอเท่านั้น: ไม่มีการส่งข้อความใด ๆ เกิดขึ้นจาก action นี้
export async function suggestReplyAction(
  systemId: string,
  conversationId: string,
): Promise<SuggestResult> {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.ai.suggest");
  if (!systemId || !conversationId) return { ok: false, reason: "ข้อมูลไม่ครบสำหรับการขอคำแนะนำ" };
  return suggestReply({
    tenantId: auth.active.tenantId,
    systemId,
    conversationId,
    userId: auth.user.id,
  });
}

// ── ทีมกดข้ามคำแนะนำทั้งชุด (เส้นทางที่ 3 ของ §5.4 — สัญญาณลบที่ต้องเก็บ) ──
export async function ignoreSuggestionsAction(
  systemId: string,
  conversationId: string,
  sourceMessageId: string,
): Promise<{ ok: boolean; count: number }> {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.ai.suggest");
  if (!systemId || !conversationId || !sourceMessageId) return { ok: false, count: 0 };
  return ignoreSuggestions({
    tenantId: auth.active.tenantId,
    systemId,
    conversationId,
    sourceMessageId,
  });
}

// ── 📚 "บันทึกเป็นตัวอย่างคำตอบ" (เส้นทางที่ 2 ของ §5.4) ──
// 🔴 ต้องเป็นการกดของคน — ระบบไม่เก็บให้เองตอนส่งข้อความ ไม่งั้นคลังเต็มไปด้วย "ครับ"
export async function saveAnswerExampleAction(formData: FormData) {
  const auth = await requireTenant();
  // 🔴 ไม่ใช่ `chat.message.send` (Fable 31 ส.ค.) — ตอบลูกค้า 1 ครั้ง คือของชั่วคราว
  //    แต่บันทึกเข้าคลัง = แก้แหล่งอ้างอิงถาวรที่ AI ใช้ตอบให้ **ทุกคนในร้านตลอดไป**
  assertChatCan(auth, "chat.example.manage");
  const systemId = String(formData.get("systemId") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  const messageId = String(formData.get("messageId") ?? "");
  if (systemId && messageId) {
    const res = await saveAnswerExample({
      tenantId: auth.active.tenantId,
      systemId,
      messageId,
      userId: auth.user.id,
    });
    if (!res.ok) chatError(systemId, conversationId, res.reason ?? "บันทึกตัวอย่างคำตอบไม่สำเร็จ");
  }
  revalidateChat(systemId);
  redirect(chatPath(systemId, conversationId));
}

// ── 📚 ถอดตัวอย่างที่ไม่ดีออกจากคลัง (หน้า "เชื่อมช่องทาง") ──
// ถอด = ปัก archivedAt ไม่ลบแถว — ของที่ลบทิ้งจะตรวจย้อนไม่ได้ว่าเคยแนะนำอะไรผิดไป
export async function archiveAnswerExampleAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.example.manage"); // เหตุผลเดียวกับ saveAnswerExampleAction
  const systemId = String(formData.get("systemId") ?? "");
  const exampleId = String(formData.get("exampleId") ?? "");
  const path = `/app/sys/${systemId}/chat/channels`;
  if (systemId && exampleId) {
    const res = await archiveAnswerExample({
      tenantId: auth.active.tenantId,
      systemId,
      exampleId,
      userId: auth.user.id,
    });
    if (!res.ok) redirect(`${path}?err=${encodeURIComponent(res.reason ?? "ถอดตัวอย่างไม่สำเร็จ")}`);
  }
  revalidatePath(path);
  redirect(path);
}

// ── เปลี่ยนสถานะ (ปิด=RESOLVED / พัก=PENDING / เปิด=OPEN) ──
export async function setStatusAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.conversation.setStatus");
  const systemId = String(formData.get("systemId") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  const status = String(formData.get("status") ?? "") as "OPEN" | "PENDING" | "RESOLVED";
  if (systemId && conversationId && ["OPEN", "PENDING", "RESOLVED"].includes(status)) {
    await setStatus({
      tenantId: auth.active.tenantId,
      systemId,
      conversationId,
      status,
      actorUserId: auth.user.id,
      unitAccess: auth.active.unitAccess as string[],
    });
  }
  revalidateChat(systemId);
  redirect(chatPath(systemId, conversationId));
}

// ── มอบหมาย (รับเอง / ปล่อยว่าง / เลือกคน) ──
export async function assignAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.conversation.assign");
  const systemId = String(formData.get("systemId") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  const raw = String(formData.get("assigneeUserId") ?? "");
  const assigneeUserId = raw === "me" ? auth.user.id : raw === "" || raw === "none" ? null : raw;
  if (systemId && conversationId) {
    await assign({
      tenantId: auth.active.tenantId,
      systemId,
      conversationId,
      assigneeUserId,
      actorUserId: auth.user.id,
      unitAccess: auth.active.unitAccess as string[],
    });
  }
  revalidateChat(systemId);
  redirect(chatPath(systemId, conversationId));
}

/**
 * เปิดห้อง = อ่านแล้ว — เรียกจาก `<ChatMarkReadOnOpen>` ตอน mount
 *
 * 🔴 ห้าม `redirect()` ที่นี่ (ต่างจาก `markReadAction` ที่มาจากการกดปุ่ม) — action นี้ถูกเรียก
 *    จาก effect ตอนหน้าโหลด ถ้า redirect จะกลายเป็นวงวนโหลดหน้าไม่รู้จบ
 * เงียบเสมอ: อ่านไม่สำเร็จก็ไม่ควรทำให้หน้าแชทที่ทีมกำลังใช้งานพัง
 */
export async function markReadOnOpenAction(systemId: string, conversationId: string): Promise<void> {
  if (!systemId || !conversationId) return;
  try {
    const auth = await requireTenant();
    assertChatCan(auth, "chat.conversation.markRead");
    await markRead({
      tenantId: auth.active.tenantId,
      systemId,
      conversationId,
      userId: auth.user.id,
      unitAccess: auth.active.unitAccess as string[],
    });
    revalidateChat(systemId);
  } catch (e) {
    // 🔴 ห้ามเงียบสนิท — ถ้าบทบาทของทีมไม่มีสิทธิ์ `chat.conversation.markRead`
    //    ห้องจะไม่ถูกนับว่าอ่านตลอดกาล แล้วทั้ง "แจ้งเตือนรอบถัดไป" และ "ติ๊กคู่ ✓✓"
    //    จะตายเงียบโดยไม่มีใครรู้ว่าเพราะอะไร (อาการเดียวกับที่เจ้าของเจอมาแล้วสองรอบ)
    //    จอผู้ใช้ยังต้องไม่พัง จึงกลืน error ไว้ แต่ต้องทิ้งร่องรอยให้ตามได้
    const { logOps } = await import("@/lib/core/ops");
    await logOps("WARN", "chat", "เปิดห้องแล้วทำเป็นอ่านไม่สำเร็จ (ติ๊กคู่/แจ้งเตือนรอบถัดไปจะไม่ทำงาน)", {
      detail: `systemId=${systemId} conversationId=${conversationId} — ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`,
    }).catch(() => {});
  }
}

// ── ทำเป็นอ่านแล้ว ──
export async function markReadAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.conversation.markRead");
  const systemId = String(formData.get("systemId") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  if (systemId && conversationId) {
    await markRead({
      tenantId: auth.active.tenantId,
      systemId,
      conversationId,
      userId: auth.user.id,
      unitAccess: auth.active.unitAccess as string[],
    });
  }
  revalidateChat(systemId);
  redirect(chatPath(systemId, conversationId));
}

// ── ผูกลูกค้าเข้าสมาชิก (จากเบอร์) / ถอด ──
export async function linkCustomerAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.customer.link");
  const systemId = String(formData.get("systemId") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const phone = String(formData.get("phone") ?? "").trim();
  const unlink = String(formData.get("unlink") ?? "") === "1";
  if (systemId && contactId) {
    await linkCustomer({
      tenantId: auth.active.tenantId,
      systemId,
      contactId,
      actorUserId: auth.user.id,
      phone: unlink ? undefined : phone || undefined,
      customerId: unlink ? null : undefined,
      unitAccess: auth.active.unitAccess as string[], // B6
    });
  }
  revalidateChat(systemId);
  redirect(chatPath(systemId, conversationId));
}

// ── เชื่อม LINE OA (BYOK) ──
export async function connectLineAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.connection.create");
  const systemId = String(formData.get("systemId") ?? "");
  const displayName = String(formData.get("displayName") ?? "");
  const channelAccessToken = String(formData.get("channelAccessToken") ?? "");
  const channelSecret = String(formData.get("channelSecret") ?? "");
  if (systemId && channelAccessToken && channelSecret) {
    await connectLine({
      tenantId: auth.active.tenantId,
      systemId,
      displayName,
      channelAccessToken,
      channelSecret,
    });
  }
  revalidateChat(systemId);
  redirect(chatPath(systemId));
}

// ── ถอด/ปิดช่องทาง ──
export async function disableConnectionAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.connection.disable");
  const systemId = String(formData.get("systemId") ?? "");
  const connectionId = String(formData.get("connectionId") ?? "");
  if (systemId && connectionId) {
    await setConnectionStatus(auth.active.tenantId, connectionId, "DISABLED");
  }
  revalidateChat(systemId);
  redirect(chatPath(systemId));
}

// ── อายุการเก็บข้อความ (PDPA · WO-C12) ──
// ค่าที่รับมาถูกบีบเข้าช่วง 90–730 ที่ setRetentionDays อีกชั้น (ฟอร์มโกงได้ เซิร์ฟเวอร์ต้องกันเอง)
export async function setRetentionDaysAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.setting.setRetention");
  const systemId = String(formData.get("systemId") ?? "");
  const raw = String(formData.get("retentionDays") ?? "").trim();
  if (systemId && raw) {
    await setRetentionDays(auth.active.tenantId, systemId, Number(raw));
  }
  revalidateChat(systemId);
  redirect(chatPath(systemId));
}

// ── เวลาทำการของทีมตอบแชท (WO-C16) ──
// ฟอร์มส่งมาเป็นช่องแยกรายวัน (day-<d> / open-<d> / close-<d>) → ประกอบเป็นรูปเดียวกับที่เก็บใน DB
// 🔴 ตรวจที่เซิร์ฟเวอร์เสมอ: ฟอร์มโกงได้ (input เป็น text ไม่ใช่ type=time เพื่อคุมความกว้างบนมือถือ)
//    ค่าอย่าง "25:00" ต้องถูกปฏิเสธที่นี่ ไม่ใช่พึ่ง validation ของเบราว์เซอร์
// error แสดง inline ผ่าน `?err=` (แบบเดียวกับโมดูลบัญชี/คลินิก) ไม่ใช่ Alert
// [[feedback_validation_inline_not_alert]]
export async function setBusinessHoursAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.setting.setBusinessHours");
  const systemId = String(formData.get("systemId") ?? "");
  if (!systemId) redirect("/app");
  const path = `/app/sys/${systemId}/chat/channels`;
  const fail = (msg: string) => redirect(`${path}?err=${encodeURIComponent(msg)}`);

  // ไม่ติ๊ก "แสดงเวลาทำการ" = ล้างค่า → ลูกค้าไม่เห็นบรรทัดเวลาทำการเลย (ไม่ใช่ 24 ชม.)
  if (String(formData.get("enabled") ?? "") !== "on") {
    const okClear = await setBusinessHours(auth.active.tenantId, systemId, null);
    if (!okClear) fail("ไม่พบระบบแชทนี้ในร้านของคุณ");
    revalidatePath(path);
    redirect(path);
  }

  const days: { d: number; open: string; close: string }[] = [];
  for (let d = 0; d < 7; d++) {
    if (String(formData.get(`day-${d}`) ?? "") !== "on") continue;
    days.push({
      d,
      open: String(formData.get(`open-${d}`) ?? "").trim(),
      close: String(formData.get(`close-${d}`) ?? "").trim(),
    });
  }
  const noteRaw = String(formData.get("note") ?? "").trim();
  const holidays = String(formData.get("holidays") ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");

  const parsed = validateBusinessHours({
    tz: String(formData.get("tz") ?? "").trim(),
    // เก็บเป็น map ภาษา (ตอนนี้หน้าจอมีช่องไทยช่องเดียว) — เพิ่มภาษาทีหลังได้โดยไม่ต้อง migrate
    note: noteRaw === "" ? null : { th: noteRaw },
    days,
    holidays,
  });
  if (!parsed.ok) fail(parsed.error);
  else {
    const saved = await setBusinessHours(auth.active.tenantId, systemId, parsed.value);
    if (!saved) fail("ไม่พบระบบแชทนี้ในร้านของคุณ");
  }
  revalidatePath(path);
  redirect(path);
}

// ── เชื่อมระบบสมาชิก (opt-in) ──
export async function setMemberSystemAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.setting.setMemberSystem");
  const systemId = String(formData.get("systemId") ?? "");
  const memberSystemId = String(formData.get("memberSystemId") ?? "").trim() || null;
  if (systemId) {
    await setMemberSystem(auth.active.tenantId, systemId, memberSystemId);
  }
  revalidateChat(systemId);
  redirect(chatPath(systemId));
}

// ═════════════ ข้อความเสียง (WO-CV8) ═════════════

/**
 * ห้องนี้ส่งข้อความเสียงได้ไหม — ชั้นที่ (ก) ของ VO-4 (หน้าจอถามก่อนโชว์ปุ่มไมค์)
 *
 * 🔴 หน้าจอ **ห้ามเดาเอง** ว่าช่องทางไหนส่งเสียงได้ — ความจริงอยู่ที่ `capabilities.audio`
 *    ของ adapter ฝั่งเซิร์ฟเวอร์ที่เดียว · ลิสต์ที่พิมพ์มือไว้ในหน้าจอจะค้างโกหกวันที่ adapter เปลี่ยน
 * 🔴 ยังไม่มี adapter ของช่องทางนั้น = ตอบ false พร้อมเหตุผล ไม่ใช่ปล่อยให้กดแล้วเงียบ
 */
export async function voiceCapabilityAction(
  systemId: string,
  conversationId: string,
): Promise<{ canSendAudio: boolean; reason?: string }> {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.message.send");
  if (!systemId || !conversationId) return { canSendAudio: false, reason: "ไม่พบบทสนทนา" };
  const conv = await tenantDb({ tenantId: auth.active.tenantId, systemId }).chatConversation.findFirst({
    where: { id: conversationId },
    select: { channel: true },
  });
  if (!conv) return { canSendAudio: false, reason: "ไม่พบบทสนทนา" };
  if (canSendAudio(conv.channel)) return { canSendAudio: true };
  return {
    canSendAudio: false,
    reason: `ช่องทางนี้ยังส่งข้อความเสียงไม่ได้ (${channelSentenceLabel(conv.channel)}) — พิมพ์ข้อความหรือแนบไฟล์แทนได้เลย`,
  };
}

/**
 * ส่งข้อความเสียงที่อัดจากกล่องพิมพ์ — อัปผ่าน **เส้นทางไฟล์แนบเดิม** แล้วเข้า `sendReply` ตัวเดียวกัน
 *
 * 🔴 ไม่สร้างที่เก็บไฟล์ใหม่ซ้อน: ใช้ `uploadFile()` + `CHAT_ATTACHMENT_MAX_BYTES` ชุดเดิม
 *    (ที่เก็บที่สองแปลว่ามีเส้นทางลบไฟล์/นับพื้นที่/ตรวจชนิด อีกชุดที่ไม่มีใครดูแล)
 * 🔴 ตรวจ **ก่อนอัป** ทั้งชนิดและความยาว — ผู้ใช้บนมือถือรออัปเสร็จแล้วค่อยโดนปฏิเสธ = แย่กว่ามาก
 * 🔴 คืนผลลัพธ์ ไม่ redirect (บทเรียน 1 ก.ย.: redirect ในเส้นทางที่ถูกเรียกตรง ๆ ถูก catch
 *    ไปตีความว่าส่งไม่สำเร็จ ทั้งที่ข้อความถูกบันทึกแล้ว)
 */
export async function sendVoiceReplyAction(formData: FormData): Promise<SendReplyResult> {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.message.send");
  const systemId = String(formData.get("systemId") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  const isInternal = String(formData.get("isInternal") ?? "") === "on";
  if (!systemId || !conversationId) return { ok: false, reason: "ไม่พบบทสนทนา" };

  const file = formData.get("file");
  if (!(typeof file === "object" && file !== null && "arrayBuffer" in file)) {
    return { ok: false, reason: "ไม่พบไฟล์เสียงที่อัดไว้ — กดไมค์แล้วอัดใหม่อีกครั้งได้เลย" };
  }
  const f = file as File;
  const mime = normalizeUploadType(f.type);
  if (!isAudioUploadType(mime) || !(mime in ALLOWED_UPLOAD_TYPES)) {
    return {
      ok: false,
      reason: "ไฟล์เสียงชนิดนี้ส่งในแชทไม่ได้ — รองรับ webm/m4a/mp3/ogg (อัดใหม่จากเบราว์เซอร์รุ่นล่าสุดได้เลย)",
    };
  }
  if (f.size === 0) return { ok: false, reason: "คลิปเสียงว่างเปล่า — อัดใหม่แล้วส่งอีกครั้งได้เลย" };
  if (f.size > CHAT_ATTACHMENT_MAX_BYTES) {
    return {
      ok: false,
      reason: `คลิปเสียงใหญ่เกิน ${Math.round(CHAT_ATTACHMENT_MAX_BYTES / (1024 * 1024))}MB — อัดใหม่ให้สั้นลงแล้วส่งได้เลย`,
    };
  }

  // ความยาวที่หน้าจอวัดมา — ปลอมได้ จึงบีบให้เป็นจำนวนเต็มบวกก่อน แล้วให้ `sendReply` ตรวจเพดานอีกชั้น
  const durationMs = Math.trunc(Number(formData.get("durationMs") ?? 0));
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return { ok: false, reason: "ความยาวของคลิปเสียงไม่ถูกต้อง — อัดใหม่แล้วส่งอีกครั้งได้เลย" };
  }

  const tenantId = auth.active.tenantId;
  const up = await uploadFile(
    { tenantId },
    {
      kind: "ATTACHMENT",
      filename: f.name || "voice",
      contentType: mime,
      data: new Uint8Array(await f.arrayBuffer()),
      maxBytes: CHAT_ATTACHMENT_MAX_BYTES,
    },
  );
  if (!up.ok) return { ok: false, reason: up.error };

  const unitAccess = auth.active.unitAccess as string[];
  const sent = await sendReply({
    tenantId,
    systemId,
    conversationId,
    senderUserId: auth.user.id,
    attachments: [
      {
        url: up.cdnUrl,
        mimeType: mime,
        fileName: f.name || "voice",
        sizeBytes: f.size,
        durationMs,
        // path บน CDN = handle เดียวที่จะไปลบไฟล์จริงทีหลังได้ (เหมือนไฟล์แนบปกติ)
        storageKey: (() => {
          try {
            return new URL(up.cdnUrl).pathname.replace(/^\/+/, "");
          } catch {
            return up.cdnUrl;
          }
        })(),
      },
    ],
    isInternal,
    unitAccess,
  });
  if (!sent.ok) return { ok: false, reason: sent.reason ?? "ส่งข้อความเสียงไม่สำเร็จ" };

  await markRead({ tenantId, systemId, conversationId, userId: auth.user.id, unitAccess });
  if (sent.messageId) {
    await publishChat(tenantId, systemId, EV_CHAT_NEW, {
      conversationId,
      kind: isInternal ? "note" : "outbound",
    });
  }
  revalidateChat(systemId);
  return { ok: true, ...(sent.messageId ? { messageId: sent.messageId } : {}) };
}
