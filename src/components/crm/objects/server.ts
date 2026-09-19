// server.ts — ตัวช่วยฝั่งเซิร์ฟเวอร์ของหน้าวัตถุกำหนดเอง (CRM v2 · ใบ C1.9) — ใช้ในหน้า/คอมโพเนนต์ฝั่งเซิร์ฟเวอร์เท่านั้น
//
// 🔴 ห้าม import จากไฟล์ 'use client' (ไฟล์นี้ถึง prisma) — ชนิดที่ client ใช้อยู่ที่ `./types`
// 🔴 อ่านอย่างเดียว (หน้า GET ไม่เขียน) · วัตถุ/รายการอ่านผ่านบริการ C1.2b (`objects`) เท่านั้น — ที่นี่แตะ prisma เฉพาะ
//    AppSystem (ระบบ CRM ของร้าน) และ MemberSavedView (มุมมองที่บันทึกไว้ของวัตถุ)

import { prisma } from "@/lib/core/db";
import { canReadMember, canViewSensitive, fields, type MemberActor } from "@/lib/modules/member";
import { crmCan, objects, parseCrmSettings } from "@/lib/modules/crm";
import type { ObjectFormField } from "./types";

export type ObjectsPageCtx = { tenantId: string; systemId: string; actorUserId: string };

/**
 * ฟิลด์ของวัตถุสำหรับฟอร์ม/ตาราง (engine ตัวเดียว · ctx.objectKey + actor) — ฟิลด์ระบบไม่รวม
 * CRM C1.9 ▸ รีวิว B1: `hidden` = ผู้ดูคนนี้ **ไม่มีสิทธิ์** เห็นค่าอ่อนไหว — คำตัดสิน D8 ตัวเดียวกับ engine
 *   (`canViewSensitive` → privacy.evaluateSensitiveAccess · เป้าหมาย SECTION ถ้าส่วนอ่อนไหว ไม่งั้น FIELD · customerId = id รายการ)
 *   ไม่ใช่ "ค่าหายไป" (ค่าว่างของฟิลด์อ่อนไหวไม่ใช่การซ่อน) ◂
 */
export async function formFieldsOf(ctx: ObjectsPageCtx, actor: MemberActor, objectKey: string, recordId?: string): Promise<ObjectFormField[]> {
  const layout = await fields.listLayout({ ...ctx, objectKey, actor }, {});
  const decided = new Map<string, boolean>();
  const mayView = async (targetType: "SECTION" | "FIELD", targetId: string): Promise<boolean> => {
    const k = `${targetType}:${targetId}`;
    if (!decided.has(k)) decided.set(k, await canViewSensitive(ctx, actor, { targetType, targetId, customerId: recordId ?? "" }));
    return decided.get(k) === true;
  };
  const out: ObjectFormField[] = [];
  for (const s of layout.sections) {
    for (const f of s.fields) {
      if (f.isSystem || f.archivedAt) continue;
      const sensitive = s.sensitive || f.sensitive;
      const allowed = !sensitive || (await mayView(s.sensitive ? "SECTION" : "FIELD", s.sensitive ? s.id : f.id));
      out.push({ fieldId: f.id, key: f.key, label: f.label, type: f.type, required: f.required, choices: f.options.choices ?? [], sensitive, hidden: !allowed });
    }
  }
  return out;
}

/**
 * รีวิว B1: ฟิลด์อ่อนไหวที่ผู้ดูไม่มีสิทธิ์ "มีค่าอยู่ไหม" (อ่านเฉพาะการมีอยู่ของแถว — ไม่อ่านค่า) → ชุด `recordId:fieldId`
 * ใช้ตัดสินว่าจะแสดง "ซ่อน (ข้อมูลอ่อนไหว)" (มีค่า) หรือ "—" (ไม่มีค่า)
 */
export async function sensitivePresence(tenantId: string, recordIds: string[], fieldIds: string[]): Promise<Set<string>> {
  if (recordIds.length === 0 || fieldIds.length === 0) return new Set();
  const rows = await prisma.customRecordValue.findMany({
    where: { tenantId, recordType: "CUSTOM", recordId: { in: recordIds }, fieldId: { in: fieldIds } },
    select: { recordId: true, fieldId: true },
  });
  return new Set(rows.map((r) => `${r.recordId}:${r.fieldId}`));
}

/** รีวิว note: ลิงก์ไปหน้าสมาชิก 360 ของแม่ชนิด CUSTOMER — เฉพาะผู้ดูที่เปิดโมดูลสมาชิกได้ (canReadMember) */
export async function customerLinks(tenantId: string, actor: MemberActor, customerIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (customerIds.length === 0 || !canReadMember(actor)) return out;
  const rows = await prisma.customer.findMany({ where: { tenantId, id: { in: [...new Set(customerIds)] } }, select: { id: true, memberSystemId: true } });
  for (const r of rows) if (r.memberSystemId) out.set(r.id, `/app/sys/${r.memberSystemId}/member/members/${r.id}`);
  return out;
}

export type ObjectViewOption = { id: string; name: string; scope: string; ownerUserId: string | null };

/** มุมมองที่บันทึกไว้ของวัตถุนี้ที่ผู้ดูใช้ได้ (ของตัวเอง + ที่แชร์ทั้งร้าน) — ระบบนี้ + objectKey นี้เท่านั้น */
export async function objectViews(ctx: ObjectsPageCtx, actor: MemberActor, objectKey: string): Promise<ObjectViewOption[]> {
  return prisma.memberSavedView.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey, OR: [{ ownerUserId: actor.userId }, { scope: "TEAM" }] },
    select: { id: true, name: true, scope: true, ownerUserId: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: 100,
  });
}

/**
 * ตัวกรองของมุมมองที่เลือก — AUDIT-CLASS X1: มุมมองของวัตถุอื่น/ระบบอื่น/ร้านอื่น/ของคนอื่นที่ไม่ได้แชร์ = null
 * (ผู้เรียกแสดงข้อความในหน้าและ "ไม่มีแถว" — ไม่ใช่ "ไม่กรอง")
 */
export async function objectViewFilters(ctx: ObjectsPageCtx, actor: MemberActor, objectKey: string, viewId: string): Promise<{ f: Record<string, string>; q: string } | null> {
  const row = await prisma.memberSavedView.findFirst({
    where: { id: viewId, tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey, OR: [{ ownerUserId: actor.userId }, { scope: "TEAM" }] },
    select: { filters: true },
  });
  if (!row) return null;
  const raw = row.filters && typeof row.filters === "object" && !Array.isArray(row.filters) ? (row.filters as Record<string, unknown>) : {};
  const fRaw = raw.f && typeof raw.f === "object" && !Array.isArray(raw.f) ? (raw.f as Record<string, unknown>) : {};
  const f: Record<string, string> = {};
  for (const [k, v] of Object.entries(fRaw)) if (typeof v === "string") f[k] = v;
  return { f, q: typeof raw.q === "string" ? raw.q : "" };
}

export type MemberObjectTab = {
  /** ค่าใน `?tab=` — `obj-<key>` ถ้า key ไม่ซ้ำข้ามระบบ · ซ้ำ = `obj-<key>-<systemId>` (มติผู้คุมงาน C1.9 ข้อ 4) */
  tabId: string;
  systemId: string;
  systemName: string;
  objectKey: string;
  label: string;
  labelPlural: string;
  count: number;
  /** key นี้มีในระบบ CRM มากกว่า 1 ระบบ ⇒ ป้ายแท็บต่อท้ายชื่อระบบ */
  shared: boolean;
};

/**
 * แท็บวัตถุในหน้าสมาชิก 360: วัตถุที่ผูกกับ "สมาชิก" (CUSTOMER) ของระบบ CRM ของร้านนี้ **ที่เปิด CRM ใหม่แล้ว (uiVersion 2)** เท่านั้น
 * 🔴 กติกาถาวร: ร้านที่ยังเป็น uiVersion 1 ทุกระบบ ⇒ [] (หน้าสมาชิกเหมือนเดิมทุกอย่าง)
 * AUDIT-CLASS X1: จำนวน/สิทธิ์ผ่าน `objects.tabsFor` (C1.7 — ขอบเขตสาขา · คีย์ crm.record.read) · ไม่มีคีย์อ่านรายการ = ไม่มีแท็บ
 */
export async function memberObjectTabs(tenantId: string, actor: MemberActor, customerId: string): Promise<MemberObjectTab[]> {
  if (!crmCan(actor, "crm.record.read")) return [];
  const systems = await prisma.appSystem.findMany({ where: { tenantId, type: "CRM" }, select: { id: true, name: true, settings: true }, orderBy: { createdAt: "asc" } });
  const out: Omit<MemberObjectTab, "tabId" | "shared">[] = [];
  for (const s of systems) {
    const ctx = { tenantId, systemId: s.id, actorUserId: actor.userId };
    // CRM uiVersion gate ▸ ตัวแปลงเดียวกับ drawer (facade `parseCrmSettings`) — อ่านไม่ได้/ไม่ใช่ 2 = ข้ามระบบนี้ (fail closed) ◂
    let v2 = false;
    try {
      v2 = parseCrmSettings(s.settings).uiVersion === 2;
    } catch {
      v2 = false;
    }
    if (!v2) continue;
    const tabs = await objects.tabsFor(ctx, actor, "CUSTOMER", customerId).catch(() => []);
    for (const t of tabs) out.push({ systemId: s.id, systemName: s.name, objectKey: t.objectKey, label: t.label, labelPlural: t.labelPlural, count: t.count });
  }
  const seen = new Map<string, number>();
  for (const t of out) seen.set(t.objectKey, (seen.get(t.objectKey) ?? 0) + 1);
  return out.map((t) => {
    const shared = (seen.get(t.objectKey) ?? 0) > 1;
    return { ...t, shared, tabId: shared ? `obj-${t.objectKey}-${t.systemId}` : `obj-${t.objectKey}` };
  });
}
