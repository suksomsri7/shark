"use server";

// reports-actions.ts — server action ของหน้ารายงาน CRM (ใบ C3.1 · ภาพ 09): ส่งออก CSV · ตารางส่งอีเมล
// 🔴 "use server" = ส่งออกได้เฉพาะ async function (ชนิด/ค่าคงที่ห้ามส่งออกจากไฟล์นี้ — หน้า 500 ทั้งที่ build ผ่าน)
// 🔴 R-E.14: ทุกทางเข้าอ่านประตู uiVersion เอง (`assertCrmV2`) ก่อนแตะบริการ · บริการยังกันซ้ำอีกชั้น
// 🔴 systemId จาก client ไม่ถูกเชื่อ: ร้าน = session ปัจจุบัน · ระบบถูก resolve ใหม่ในบริการ (ร้านนี้ + ชนิด CRM) · คีย์ตัดสินในบริการ
// 🔴 ข้อความ error เป็นไทยที่ไม่โทษผู้ใช้ — error ที่ไม่รู้จักไม่สะท้อนรายละเอียดภายใน

import { requireTenant } from "@/lib/core/context";
import { toMemberActor } from "@/lib/modules/member";
import { assertCrmV2 } from "@/lib/modules/crm/ui-version";
import { deleteSchedule, getExport, listSchedules, runExportJobs, saveSchedule, startExport } from "@/lib/modules/crm/reports";
import { REPORT_SCHEDULE_FREQUENCY_LABEL, REPORT_TAB_LABEL, REPORT_WEEKDAY_LABEL, type ReportFilters, type ReportSchedule } from "@/lib/modules/crm/reports-shared";

const FALLBACK = "ทำรายการไม่สำเร็จเพราะระบบขัดข้องชั่วคราว — ลองใหม่อีกครั้ง";

async function gate(systemId: unknown) {
  const auth = await requireTenant();
  const ctx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  await assertCrmV2(ctx);
  return { ctx, actor: toMemberActor(auth.user.id, auth.active) };
}

function messageOf(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  if (e instanceof Error && typeof code === "string" && ["VALIDATION", "FORBIDDEN", "NOT_FOUND"].includes(code) && /[ก-๙]/.test(e.message)) return e.message;
  return FALLBACK;
}

function cleanFilters(raw: unknown): ReportFilters {
  const f = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out: ReportFilters = {};
  for (const k of ["from", "to", "teamId", "pipelineId"] as const) if (typeof f[k] === "string" && f[k]) out[k] = f[k] as string;
  return out;
}

function rowOf(s: ReportSchedule) {
  const when = s.frequency === "WEEKLY" ? `ทุกวัน${REPORT_WEEKDAY_LABEL[s.weekday] ?? ""}` : s.frequency === "MONTHLY" ? `ทุกวันที่ ${s.dayOfMonth}` : "ทุกเช้า";
  return { id: s.id, tabLabel: REPORT_TAB_LABEL[s.tab], frequencyLabel: REPORT_SCHEDULE_FREQUENCY_LABEL[s.frequency], whenLabel: when, recipients: s.recipientUserIds.length };
}

/** ขอส่งออก CSV — งาน async เสมอ (แถวงาน + audit) แล้วเร่งรันงานของระบบนี้ทันที (ไฟล์เล็กเสร็จในคำขอเดียว · ใหญ่ = งานรายนาทีทำต่อ) */
export async function startCrmReportExportAction(systemId: string, tab: string, filters: unknown): Promise<{ ok: true; value: { jobId: string } } | { ok: false; error: string }> {
  try {
    const { ctx, actor } = await gate(systemId);
    const r = await startExport(ctx, actor, { tab, filters: cleanFilters(filters) });
    await runExportJobs({ tenantIds: [ctx.tenantId], systemIds: [ctx.systemId], deadline: Date.now() + 8_000 }).catch(() => undefined);
    return { ok: true, value: { jobId: r.jobId } };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

/** สถานะ/ผลของงานส่งออก (เฉพาะผู้ขอ) — ถ้ายังค้างอยู่ช่วยรันงานของระบบนี้อีกรอบ */
export async function getCrmReportExportAction(
  systemId: string,
  jobId: string,
): Promise<{ ok: true; value: { status: string; csv: string | null; filename: string | null; error: string | null } } | { ok: false; error: string }> {
  try {
    const { ctx, actor } = await gate(systemId);
    let r = await getExport(ctx, actor, jobId);
    if (r.status === "QUEUED") {
      await runExportJobs({ tenantIds: [ctx.tenantId], systemIds: [ctx.systemId], deadline: Date.now() + 8_000 }).catch(() => undefined);
      r = await getExport(ctx, actor, jobId);
    }
    return { ok: true, value: { status: r.status, csv: r.csv, filename: r.filename, error: r.error } };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

export async function saveCrmReportScheduleAction(
  systemId: string,
  input: { tab: string; frequency: string; weekday: number; dayOfMonth: number; recipientUserIds: string[]; filters: unknown },
): Promise<{ ok: true; value: ReturnType<typeof rowOf>[] } | { ok: false; error: string }> {
  try {
    const { ctx, actor } = await gate(systemId);
    const f = cleanFilters(input?.filters);
    await saveSchedule(ctx, actor, {
      tab: String(input?.tab ?? ""),
      frequency: String(input?.frequency ?? ""),
      weekday: Number(input?.weekday),
      dayOfMonth: Number(input?.dayOfMonth),
      recipientUserIds: Array.isArray(input?.recipientUserIds) ? input.recipientUserIds.map(String) : [],
      filters: { teamId: f.teamId ?? null, pipelineId: f.pipelineId ?? null },
    });
    return { ok: true, value: (await listSchedules(ctx, actor)).schedules.map(rowOf) };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

export async function deleteCrmReportScheduleAction(systemId: string, id: string): Promise<{ ok: true; value: ReturnType<typeof rowOf>[] } | { ok: false; error: string }> {
  try {
    const { ctx, actor } = await gate(systemId);
    await deleteSchedule(ctx, actor, id);
    return { ok: true, value: (await listSchedules(ctx, actor)).schedules.map(rowOf) };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}
