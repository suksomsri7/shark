"use server";

// Support Desk — server actions ฝั่งร้าน (WO-0021 + help-v2)
// เรียกจาก HelpSheet (client) · userId + tenantId ดึงจาก session เท่านั้น — ห้ามรับจาก client
// (กันร้านหนึ่งปลอมเป็นอีกร้าน/ปลอม userId)

import type { SupportAuthorSide, SupportCaseStatus } from "@prisma/client";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import {
  createCase,
  listMyCasesWithMeta,
  listCaseMessages,
  addShopMessage,
  markCaseRead,
  unreadCaseTotal,
  type Attachment,
} from "./service";

export type { Attachment };

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
function parseAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .filter((a) => typeof a.url === "string" && (a.url as string).length > 0)
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

// รวม badge ทั้ง 2 (help + AI แจ้งเตือน) ในครั้งเดียว — โหลดฝั่ง client หลังหน้าโผล่ (perf A: ไม่บล็อกเปลี่ยนหน้า)
export async function loadNavBadgesAction(): Promise<{ helpUnread: number; aiUnread: number }> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const [helpUnread, aiUnread] = await Promise.all([
    unreadCaseTotal({ tenantId }).catch(() => 0),
    prisma.appNotification.count({ where: { tenantId, readAt: null } }).catch(() => 0),
  ]);
  return { helpUnread, aiUnread };
}
