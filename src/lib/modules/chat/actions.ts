"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
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
import { setRetentionDays } from "./retention";
import { validateBusinessHours } from "./business-hours";

// ทุก action: requireTenant + revalidate หน้า chat ของระบบนั้น

// ตรวจสิทธิ์โมดูล (system-scoped) — OWNER/MANAGER ผ่าน · STAFF ตาม permission
// หมายเหตุ: scope conversation ระดับ unit ยังบังคับผ่าน unitAccess ใน service (คงเดิม)
function assertChatCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "chat", action },
  );
}

function chatPath(systemId: string, conversationId?: string) {
  return conversationId
    ? `/app/sys/${systemId}/chat?c=${conversationId}`
    : `/app/sys/${systemId}/chat`;
}

function revalidateChat(systemId: string) {
  revalidatePath(`/app/sys/${systemId}/chat`);
  revalidatePath(`/app/sys/${systemId}`);
}

// ── ส่งข้อความ / โน้ตภายใน ──
export async function sendReplyAction(formData: FormData) {
  const auth = await requireTenant();
  assertChatCan(auth, "chat.message.send");
  const systemId = String(formData.get("systemId") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "");
  const isInternal = String(formData.get("isInternal") ?? "") === "on";
  if (systemId && conversationId && body.trim()) {
    const unitAccess = auth.active.unitAccess as string[];
    await sendReply({
      tenantId: auth.active.tenantId,
      systemId,
      conversationId,
      senderUserId: auth.user.id,
      body,
      isInternal,
      unitAccess,
    });
    await markRead({
      tenantId: auth.active.tenantId,
      systemId,
      conversationId,
      userId: auth.user.id,
      unitAccess,
    });
  }
  revalidateChat(systemId);
  redirect(chatPath(systemId, conversationId));
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
