// ─────────────────────────────────────────────────────────────
// booking/customer-notes.ts — ความชอบ/ข้อห้ามลูกค้าบนการ์ดงาน + มือถือหมอ (SVC B.16 · ใบสั่ง §3.1)
//
// 🔴 ข้อมูลอยู่ในสมาชิก ไม่ใช่ในนัด (DESIGN R7) — ที่นี่ "อ่านอย่างเดียว" ผ่าน facade `@/lib/modules/member`
// 🔴 สองด่านซ้อน: (1) คีย์จอง `booking.customer.notes` ของสาขานี้ (ไม่ผ่าน ⇒ {} ไม่อ่านค่า ไม่บันทึกการดู)
//                 (2) ฟิลด์อ่อนไหว ⇒ นโยบายสมาชิกตัดสิน (คีย์ booking.* ไม่ใช่ใบผ่านข้อมูลอ่อนไหว)
// 🔴 X1: ทุกคิวรีผูก tenantId + unitId ของ ctx · ของร้าน/สาขาอื่น/ไม่มีจริง ⇒ ไม่มีคีย์ในผลลัพธ์ (เหมือน id ที่ไม่มีจริง)
// 🔴 X8: DTO มีแค่ {appointmentId, items[{key,label,display,sensitive}], hidden} · ไม่มี console · ไม่ยิง event เอง
// ─────────────────────────────────────────────────────────────
import { tenantDb } from "@/lib/core/db";
import { resolveSetting } from "@/lib/core/settings";
import { staffNotesFor, toMemberActor } from "@/lib/modules/member";
import { systemForUnit } from "@/lib/modules/system/service";
import type { LineMember } from "./line-access";
import { canSeeCustomerNotes } from "./privacy-shared";

export type NotesPage = "booking.today" | "booking.mine";
/** Membership สดจาก requireUnit (role · unitAccess · permissions) */
export type NotesViewer = { userId: string; member: LineMember };
export type JobNoteItem = { key: string; label: string; display: string; sensitive: boolean };
export type JobCustomerNotes = { appointmentId: string; items: JobNoteItem[]; hidden: number };

const SETTING_KEY = "booking.privacy.jobCardFields";
const MAX_IDS = 200;
const PAGES: ReadonlySet<string> = new Set<NotesPage>(["booking.today", "booking.mine"]);
const ROLES: ReadonlySet<string> = new Set(["OWNER", "MANAGER", "STAFF"]);

const isStr = (v: unknown): v is string => typeof v === "string" && v !== "";

function viewerOk(v: NotesViewer | null): v is NotesViewer {
  return (
    !!v &&
    isStr(v.userId) &&
    !!v.member &&
    ROLES.has(v.member.role) &&
    Array.isArray(v.member.unitAccess) &&
    !!v.member.permissions &&
    typeof v.member.permissions === "object"
  );
}

/**
 * โน้ตลูกค้าของงานบนจอ — คีย์ = appointmentId (เฉพาะงานที่มีรายการหรือมีของถูกซ่อน)
 * ไม่ throw ในทางปกติ: ข้อมูลเข้าแปลก/ไม่มีสิทธิ์/อ่านไม่สำเร็จ ⇒ {} (จอเดิมยังใช้ได้ · ไม่โชว์สิ่งที่ยังไม่ได้บันทึกการดู)
 */
export async function loadJobCustomerNotes(
  ctx: { tenantId: string; unitId: string },
  viewer: NotesViewer | null,
  appointmentIds: string[],
  opts?: { page?: NotesPage; now?: Date },
): Promise<Record<string, JobCustomerNotes>> {
  if (!ctx || !isStr(ctx.tenantId) || !isStr(ctx.unitId)) return {};
  if (!viewerOk(viewer) || !Array.isArray(appointmentIds)) return {};
  if (!canSeeCustomerNotes(viewer.member, ctx.unitId)) return {};
  const ids = [...new Set(appointmentIds.filter(isStr))].slice(0, MAX_IDS);
  if (ids.length === 0) return {};
  const page: NotesPage = opts?.page && PAGES.has(opts.page) ? opts.page : "booking.today";

  try {
    // หน่วยต้องเป็นของร้านนี้ + ผูกระบบสมาชิก
    const unit = await tenantDb({ tenantId: ctx.tenantId }).businessUnit.findFirst({ where: { id: ctx.unitId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!unit) return {};
    const systemId = await systemForUnit(ctx.tenantId, ctx.unitId, "MEMBER");
    if (!systemId) return {};

    const appts = await tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId }).appointment.findMany({
      where: { id: { in: ids }, tenantId: ctx.tenantId, unitId: ctx.unitId, customerId: { not: null } },
      select: { id: true, customerId: true },
    });
    if (appts.length === 0) return {};

    const raw = (await resolveSetting({ tenantId: ctx.tenantId }, SETTING_KEY, { unitId: ctx.unitId }))?.value;
    const fieldKeys = Array.isArray(raw) ? raw.filter(isStr) : [];
    if (fieldKeys.length === 0) return {};

    const byCustomer = await staffNotesFor(
      { tenantId: ctx.tenantId, systemId, actorUserId: viewer.userId },
      toMemberActor(viewer.userId, viewer.member),
      { customerIds: appts.map((a) => a.customerId as string), fieldKeys, page, now: opts?.now },
    );

    const out: Record<string, JobCustomerNotes> = {};
    const order = new Map(ids.map((id, i) => [id, i]));
    for (const a of [...appts].sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0))) {
      const n = a.customerId ? byCustomer[a.customerId] : undefined;
      if (!n) continue;
      out[a.id] = { appointmentId: a.id, items: n.items.map((i) => ({ key: i.key, label: i.label, display: i.display, sensitive: i.sensitive })), hidden: n.hidden };
    }
    return out;
  } catch {
    return {};
  }
}
