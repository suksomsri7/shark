"use server";

// Support Desk — server actions ฝั่งร้าน (WO-0021)
// เรียกจาก HelpSheet (client) · userId + tenantId ดึงจาก session เท่านั้น — ห้ามรับจาก client
// (กันร้านหนึ่งปลอมเป็นอีกร้าน/ปลอม userId)

import type { SupportAuthorSide, SupportCaseStatus } from "@prisma/client";
import { requireTenant } from "@/lib/core/context";
import { createCase, listMyCases, listCaseMessages, addShopMessage } from "./service";

export type CaseView = {
  id: string;
  subject: string;
  status: SupportCaseStatus;
  updatedAt: Date;
};
export type MessageView = {
  id: string;
  authorSide: SupportAuthorSide;
  body: string;
  createdAt: Date;
};

// เคสทั้งหมดของร้านที่กำลังเปิดใช้งาน
export async function loadMyCasesAction(): Promise<CaseView[]> {
  const auth = await requireTenant();
  const cases = await listMyCases({ tenantId: auth.active.tenantId });
  return cases.map((c) => ({ id: c.id, subject: c.subject, status: c.status, updatedAt: c.updatedAt }));
}

// บทสนทนาในเคส (สำหรับหน้าดูรายละเอียด)
export async function loadCaseThreadAction(caseId: string): Promise<MessageView[]> {
  const auth = await requireTenant();
  const msgs = await listCaseMessages({ tenantId: auth.active.tenantId }, caseId);
  return msgs.map((m) => ({ id: m.id, authorSide: m.authorSide, body: m.body, createdAt: m.createdAt }));
}

// เปิดเคสใหม่ (หัวข้อ + รายละเอียด)
export async function openCaseAction(input: {
  subject: string;
  body: string;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  const auth = await requireTenant();
  const subject = (input.subject ?? "").trim();
  const body = (input.body ?? "").trim();
  if (!subject || !body) return { ok: false, error: "กรุณากรอกหัวข้อและรายละเอียด" };
  const c = await createCase(
    { tenantId: auth.active.tenantId },
    { userId: auth.user.id, subject, body },
  );
  return { ok: true, id: c.id };
}

// พิมพ์ต่อในเคสเดิม
export async function addMessageAction(input: {
  caseId: string;
  body: string;
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireTenant();
  const body = (input.body ?? "").trim();
  if (!body) return { ok: false, error: "กรุณาพิมพ์ข้อความ" };
  const ok = await addShopMessage(
    { tenantId: auth.active.tenantId },
    input.caseId,
    auth.user.id,
    body,
  );
  return { ok, error: ok ? undefined : "ไม่พบเคสนี้" };
}
