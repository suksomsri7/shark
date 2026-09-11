"use server";

// reports-actions.ts — server action ของหน้า "ระบบสมาชิก › รายงาน" (M3.8 · ภาพ 25)
//
// 🔴 ทุก action ผ่านด่าน `gate(systemId, key)`: requireTenant → มีคีย์ที่ต้องใช้ (ไม่มี = assertCan โยน) → ระบบเป็น MEMBER ของร้านนี้จริง
//    · ส่งออก CSV = `member.report.view` · ตั้งเวลาส่งอีเมล = `member.settings.manage` (service ตรวจซ้ำอีกชั้นเสมอ)
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดอยู่ที่ `reports-shared.ts` (export type ที่นี่ = หน้า 500)
// 🔴 ข้อความ error ที่ส่งกลับหน้าจอผ่าน `safeReason` เสมอ

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { safeReason } from "@/lib/core/errors";
import { assertCan } from "@/lib/core/rbac";
import { hasMemberPerm, toMemberActor, type MemberActor } from "./access";
import { prisma } from "./db";
import type { MemberCtx } from "./profile";
import { exportCsv, setReportSchedule } from "./reports";
import type { ReportActionResult, ReportSchedule, ReportScheduleInput } from "./reports-shared";

const PATH = (systemId: string) => `/app/sys/${systemId}/member/reports`;

async function gate(systemId: string, key: "member.report.view" | "member.settings.manage"): Promise<{ ctx: MemberCtx; actor: MemberActor }> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!hasMemberPerm(actor, key)) {
    assertCan({ role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions }, { module: "member", action: key });
  }
  const system = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");
  return { ctx: { tenantId, systemId, actorUserId: auth.user.id }, actor };
}

/** ส่งออก CSV ของแท็บที่เปิดอยู่ (BOM + หัวตารางไทย) — หน้าจอเอาไปสร้างไฟล์ดาวน์โหลดเอง */
export async function exportReportCsvAction(systemId: string, tab: string): Promise<ReportActionResult<{ filename: string; csv: string }>> {
  try {
    const { ctx, actor } = await gate(systemId, "member.report.view");
    const data = await exportCsv(ctx, actor, tab);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ส่งออก CSV ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** บันทึกการตั้งเวลาส่งอีเมลรายงาน (อีเมล ≤ 5 · ชั่วโมงไทย 0–23 · แท็บที่แนบ · สวิตช์) */
export async function saveReportScheduleAction(systemId: string, input: ReportScheduleInput): Promise<ReportActionResult<ReportSchedule>> {
  try {
    const { ctx, actor } = await gate(systemId, "member.settings.manage");
    const data = await setReportSchedule(ctx, actor, input);
    revalidatePath(PATH(systemId));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกการตั้งเวลาส่งรายงานไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}
