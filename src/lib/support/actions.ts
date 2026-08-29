"use server";

// Support Desk — server actions ฝั่งร้าน (WO-0021 + help-v2)
// เรียกจาก HelpSheet (client) · userId + tenantId ดึงจาก session เท่านั้น — ห้ามรับจาก client
// (กันร้านหนึ่งปลอมเป็นอีกร้าน/ปลอม userId)

import type { SupportAuthorSide, SupportCaseStatus } from "@prisma/client";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
// B9: `unreadCount()` ของโมดูลแชทมีอยู่แล้วแต่ไม่เคยถูกเรียก — badge เมนูใช้ตัวนี้ ห้ามเขียน query ใหม่
import { unreadCount as chatUnreadCount } from "@/lib/modules/chat/service";
import {
  createCase,
  listMyCasesWithMeta,
  listCaseMessages,
  addShopMessage,
  markCaseRead,
  unreadCaseTotal,
  type Attachment,
} from "./service";


export type CaseView = {
  id: string;
  caseNo: number;
  subject: string;
  status: SupportCaseStatus;
  updatedAt: Date;
  unreadCount: number;
};
export type MessageView = {
  id: string;
  authorSide: SupportAuthorSide;
  body: string;
  attachments: Attachment[];
  createdAt: Date;
};

// แปลง attachmentsJson (Json) → Attachment[] ที่ปลอดภัยสำหรับ client
// กรอง scheme ซ้ำอีกชั้นตอน "อ่าน" ด้วย — แถวเก่าที่บันทึกไว้ก่อนมีด่านตอนเขียนจะได้ไม่หลุดออกจอ
const SAFE_ATTACH_URL = /^(https?:\/\/|data:image\/(png|jpe?g|gif|webp|heic|heif);base64,)/i;
function parseAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .filter((a) => typeof a.url === "string" && SAFE_ATTACH_URL.test(a.url as string))
    .map((a) => ({
      name: typeof a.name === "string" ? a.name : "ไฟล์แนบ",
      url: a.url as string,
      kind: a.kind === "image" ? "image" : "file",
    }));
}

// เคสทั้งหมดของร้านที่กำลังเปิดใช้งาน (พร้อมเลขเคส + จำนวนยังไม่อ่าน)
export async function loadMyCasesAction(): Promise<CaseView[]> {
  const auth = await requireTenant();
  const cases = await listMyCasesWithMeta({ tenantId: auth.active.tenantId });
  return cases.map((c) => ({
    id: c.id,
    caseNo: c.caseNo,
    subject: c.subject,
    status: c.status,
    updatedAt: c.updatedAt,
    unreadCount: c.unreadCount,
  }));
}

// จำนวนยังไม่อ่านรวมทุกเคส (สำหรับ badge ปุ่ม help บน Topbar — Fable ใช้ต่อ)
export async function unreadCaseTotalAction(): Promise<number> {
  const auth = await requireTenant();
  return unreadCaseTotal({ tenantId: auth.active.tenantId });
}

// บทสนทนาในเคส (สำหรับหน้าดูรายละเอียด)
export async function loadCaseThreadAction(caseId: string): Promise<MessageView[]> {
  const auth = await requireTenant();
  const msgs = await listCaseMessages({ tenantId: auth.active.tenantId }, caseId);
  return msgs.map((m) => ({
    id: m.id,
    authorSide: m.authorSide,
    body: m.body,
    attachments: parseAttachments(m.attachmentsJson),
    createdAt: m.createdAt,
  }));
}

// ร้านเปิดอ่านเคส → เคลียร์ badge
export async function markCaseReadAction(caseId: string): Promise<{ ok: boolean }> {
  const auth = await requireTenant();
  const ok = await markCaseRead({ tenantId: auth.active.tenantId }, caseId);
  return { ok };
}

// เปิดเคสใหม่ (หัวข้อ + รายละเอียด + ไฟล์แนบ)
export async function openCaseAction(input: {
  subject: string;
  body: string;
  attachments?: Attachment[];
}): Promise<{ ok: boolean; error?: string; id?: string; caseNo?: number }> {
  const auth = await requireTenant();
  const subject = (input.subject ?? "").trim();
  const body = (input.body ?? "").trim();
  if (!subject || !body) return { ok: false, error: "กรุณากรอกหัวข้อและรายละเอียด" };
  const c = await createCase(
    { tenantId: auth.active.tenantId },
    { userId: auth.user.id, subject, body, attachments: input.attachments },
  );
  return { ok: true, id: c.id, caseNo: c.caseNo };
}

// พิมพ์ต่อในเคสเดิม (+ ไฟล์แนบ)
export async function addMessageAction(input: {
  caseId: string;
  body: string;
  attachments?: Attachment[];
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireTenant();
  const body = (input.body ?? "").trim();
  if (!body) return { ok: false, error: "กรุณาพิมพ์ข้อความ" };
  const ok = await addShopMessage(
    { tenantId: auth.active.tenantId },
    input.caseId,
    auth.user.id,
    body,
    input.attachments,
  );
  return { ok, error: ok ? undefined : "ไม่พบเคสนี้" };
}

// รวม badge ทั้งชุด (help + AI แจ้งเตือน + ข้อความลูกค้าค้างตอบรายระบบแชท) ในครั้งเดียว
// โหลดฝั่ง client หลังหน้าโผล่ (perf A: ไม่บล็อกเปลี่ยนหน้า) — ใช้ round-trip เดิมที่มีอยู่แล้ว
// ไม่เพิ่มคำขอใหม่ต่อการเรนเดอร์เมนู
//
// 🔴 ต้นทุนของ badge แชท (B9) — ตัดสินใจไว้ตรงนี้:
//  · `chatSystemIds` มาจาก layout ซึ่ง query `appSystem` อยู่แล้ว ⇒ **ไม่ถาม DB ซ้ำเพื่อหาว่าร้าน
//    เปิดระบบแชทไหม** · ร้านที่ไม่ได้เปิดระบบแชทส่งลิสต์ว่างมา → ไม่มี query ส่วนเกินแม้แต่ครั้งเดียว
//  · ร้านที่เปิด = 1 aggregate ต่อระบบแชท (ปกติมีระบบเดียว) ต่อการ mount ของ app shell
//    ไม่ใช่ต่อการเรนเดอร์หน้า (NavDrawer อยู่ใน layout ที่ไม่ re-mount ตอนเปลี่ยนหน้า)
//  · นับด้วย `unreadCount()` ของโมดูลแชทตัวเดิม — ห้ามเขียน query ซ้ำที่นี่
// 🔴 ความปลอดภัย: `tenantId` มาจาก session เสมอ · `unreadCount` ผูก tenantId ทุกครั้ง ⇒ ปลอม
//    systemId ของร้านอื่นได้แค่เลข 0 · ตัดลิสต์ที่ 10 กันไคลเอนต์ยัดรายการยาวให้เซิร์ฟเวอร์ทำงานไม่จำกัด
export async function loadNavBadgesAction(chatSystemIds?: string[]): Promise<{
  helpUnread: number;
  aiUnread: number;
  chatUnread: Record<string, number>;
}> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const ids = Array.from(
    new Set((chatSystemIds ?? []).filter((s): s is string => typeof s === "string" && s.length > 0)),
  ).slice(0, 10);
  const [helpUnread, aiUnread, counts] = await Promise.all([
    unreadCaseTotal({ tenantId }).catch(() => 0),
    prisma.appNotification.count({ where: { tenantId, readAt: null } }).catch(() => 0),
    Promise.all(ids.map((id) => chatUnreadCount(tenantId, id).catch(() => 0))),
  ]);
  const chatUnread: Record<string, number> = {};
  ids.forEach((id, i) => {
    const n = counts[i] ?? 0;
    if (n > 0) chatUnread[id] = n;
  });
  return { helpUnread, aiUnread, chatUnread };
}
