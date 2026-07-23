// AI Scheduled Tasks (agentic-3) — งานประจำที่ผู้ช่วย AI ทำเองตามเวลา
// วิสัยทัศน์เจ้าของ: "ทุกเย็น 6 โมง สรุปยอดขายให้" — ตั้งครั้งเดียว AI ทำซ้ำทุกวันเอง
//
// กฎเหล็ก:
// - งานประจำเป็นการ "สรุป/อ่าน" → เดินผ่าน sendMessage (มีเครื่องมืออ่านข้อมูลจริงครบ) ด้วย tier "fast" (haiku) ประหยัด
// - ผลลัพธ์ = AppNotification + push แจ้งเข้าเครื่อง (ไม่ทำ mutation — งานประจำห้ามลงมือแก้ข้อมูลเงียบ ๆ)
// - createTask/listTasks/setTaskActive/deleteTask เป็น tenant-scoped → tenantDb({ tenantId }) inject tenantId
// - runScheduledTasks เดินข้ามร้าน (cron ระดับแพลตฟอร์ม) → prisma ตรงได้ (นอก modules) · task พังตัวเดียว ไม่ล้มทั้งรอบ

import { prisma, tenantDb } from "@/lib/core/db";
import { sendMessage } from "./service";
import { resolveProvider, type AiProvider } from "./provider";
import { dayKeyBangkok } from "./rules";

type Ctx = { tenantId: string };

const MAX_TASKS_PER_TENANT = 10; // กันตั้งงานประจำล้นร้าน
const MAX_TENANT_TASKS_PER_RUN = 100; // เพดานต่อรอบ cron (กันงานบานปลายในชั่วโมงเดียว)

// ── สร้างงานประจำ ── instruction ว่าง / hourBkk นอก 0-23 → throw ไทย · เกิน 10 ต่อร้าน → throw
export async function createTask(
  ctx: Ctx,
  input: { instruction: string; hourBkk: number },
): Promise<{ id: string }> {
  const instruction = String(input.instruction ?? "").trim();
  if (!instruction) throw new Error("ต้องระบุสิ่งที่จะให้ผู้ช่วยทำเป็นงานประจำ");
  const hourBkk = Math.round(Number(input.hourBkk));
  if (!Number.isFinite(hourBkk) || hourBkk < 0 || hourBkk > 23) {
    throw new Error("ชั่วโมงที่ให้ทำต้องอยู่ระหว่าง 0-23 (เวลาไทย)");
  }
  const count = await tenantDb(ctx).aiScheduledTask.count();
  if (count >= MAX_TASKS_PER_TENANT) {
    throw new Error(`ตั้งงานประจำได้สูงสุด ${MAX_TASKS_PER_TENANT} รายการต่อร้าน — ลบรายการเดิมก่อนถ้าต้องการเพิ่ม`);
  }
  const row = await tenantDb(ctx).aiScheduledTask.create({
    data: { tenantId: ctx.tenantId, instruction, hourBkk },
  });
  return { id: row.id };
}

// ── งานประจำทั้งหมดของร้าน (ใหม่→เก่า) ──
export async function listTasks(ctx: Ctx) {
  return tenantDb(ctx).aiScheduledTask.findMany({ orderBy: { createdAt: "desc" } });
}

// ── เปิด/ปิดงานประจำ — คืน true ถ้าอัปเดตได้ (ไม่พบ → false) ──
export async function setTaskActive(ctx: Ctx, id: string, active: boolean): Promise<boolean> {
  const res = await tenantDb(ctx).aiScheduledTask.updateMany({ where: { id }, data: { active } });
  return res.count > 0;
}

// ── ลบงานประจำ — คืน true ถ้าลบได้ (ไม่พบ → false) ──
export async function deleteTask(ctx: Ctx, id: string): Promise<boolean> {
  const res = await tenantDb(ctx).aiScheduledTask.deleteMany({ where: { id } });
  return res.count > 0;
}

/**
 * รันงานประจำที่ถึงเวลา — เรียกจาก /api/cron/hourly ทุกชั่วโมง
 * เงื่อนไข: task active + hourBkk == ชั่วโมงไทยปัจจุบัน (คำนวณจาก now +07:00) + lastRunDay != วันนี้ (BKK)
 * แต่ละ task: รัน AI ด้วย instruction (tier fast) → เก็บผลเป็น AppNotification → เซ็ต lastRunDay = วันนี้
 * - provider จาก deps.provider (ข้อสอบฉีดได้) ?? resolveProvider("fast") · ไม่มี provider → return 0 (ไม่ throw)
 * - task พัง catch ไปต่อ (ไม่ล้มทั้งรอบ) · คืนจำนวน task ที่ทำสำเร็จ
 */
export async function runScheduledTasks(
  now: Date = new Date(),
  deps?: { provider?: AiProvider },
): Promise<number> {
  // งานประจำ = สรุป/อ่าน → tier "fast" (haiku) ประหยัด · ไม่มี provider (ยังไม่เปิด AI) = ข้ามเงียบ ๆ
  const provider = deps?.provider ?? resolveProvider("fast");
  if (!provider) return 0;

  // ชั่วโมงไทยปัจจุบัน: บวก 7 ชม.แล้วอ่าน UTC hour (เชื่อถือได้ทุก environment) · วันแบบ BKK ผ่าน rules
  const hourBkk = new Date(now.getTime() + 7 * 3_600_000).getUTCHours();
  const today = dayKeyBangkok(now);

  const tasks = await prisma.aiScheduledTask.findMany({
    where: {
      active: true,
      hourBkk,
      OR: [{ lastRunDay: null }, { lastRunDay: { not: today } }],
    },
    orderBy: { createdAt: "asc" },
    take: MAX_TENANT_TASKS_PER_RUN,
  });

  let ran = 0;
  for (const task of tasks) {
    try {
      // รัน AI แบบเดียวกับผู้ใช้พิมพ์คำสั่งเอง (มีเครื่องมืออ่านข้อมูลจริงครบ) — ฉีด provider fast
      const res = await sendMessage(
        { tenantId: task.tenantId },
        { text: task.instruction },
        { provider },
      );
      if (!res.ok) continue; // เกินเพดาน/ปิดใช้ → ข้าม ไม่ mark เพื่อให้ลองใหม่รอบถัดไปได้
      await prisma.appNotification.create({
        data: {
          tenantId: task.tenantId,
          title: "งานประจำจากผู้ช่วย AI",
          body: `${task.instruction}\n\n${res.reply}`,
        },
      });
      // push แจ้งเข้าเครื่อง — best-effort ห้ามพารอบ cron พัง
      try {
        const { sendPushToTenant } = await import("@/lib/core/push");
        await sendPushToTenant(task.tenantId, {
          title: "งานประจำจากผู้ช่วย AI",
          body: task.instruction.slice(0, 80),
        });
      } catch {
        // push พัง → เงียบ (noti ถูกบันทึกแล้ว)
      }
      // mark วันนี้แล้ว — รันซ้ำชั่วโมงเดิมในวันเดียวกันจะถูกข้าม
      await prisma.aiScheduledTask.update({ where: { id: task.id }, data: { lastRunDay: today } });
      ran++;
    } catch {
      // task ตัวนี้พัง (เช่น provider ล่มชั่วคราว) → ข้ามไปทำตัวถัดไป ไม่ให้ล้มทั้งรอบ
      continue;
    }
  }
  return ran;
}
