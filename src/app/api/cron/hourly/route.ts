import { NextResponse } from "next/server";
import { runScheduledTasks } from "@/lib/ai/scheduled";
import { campaignsDue, journeyWaits, sweepPendingVoiceDelivery } from "@/lib/platform/cron";
import { sweepScheduledRules } from "@/lib/modules/kanban/automation";
import { sweepDueSoonReminders } from "@/lib/modules/kanban/reminders";
import { sweepKanbanEmailHourly } from "@/lib/modules/kanban/digest";
import { sweepUnattendedChats } from "@/lib/platform/kanban-bridges";
import { logOps } from "@/lib/core/ops";
import { isCronAuthorized } from "@/lib/core/cron-auth";

// GET /api/cron/hourly — งานประจำของผู้ช่วย AI (Vercel Cron เรียกทุกต้นชั่วโมง)
// auth: isCronAuthorized (Bearer SHARK_CRON_SECRET หรือ X-Cron-Secret) — ผิด/ไม่มี → 401 สั้น ๆ
// รัน runScheduledTasks(now): task ที่ถึงชั่วโมงไทยตอนนี้และยังไม่ได้รันวันนี้ → สรุปเป็น AppNotification
// + WO-CV13: ตาข่ายเก็บตกข้อความเสียงที่ค้างรอส่งเข้าช่องทาง (เผื่อ cron บน VPS ตาย)
// + K2.9: กฎอัตโนมัติของบอร์ดงานชนิด "ตั้งเวลา" (SCHEDULED) — เทียบ cron ไทยกับชั่วโมงนี้
//   🔴 best-effort: ล้มห้ามทำให้ cron รอบนี้แดง · ไม่เพิ่ม cron ตัวใหม่ใน vercel.json (§7.6)
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // runScheduledTasks catch งานย่อยรายตัวเองแล้ว — ห่ออีกชั้นเผื่อพังทั้งรอบ → logOps ERROR
  let ran: number;
  try {
    ran = await runScheduledTasks(new Date());
  } catch (e) {
    await logOps("ERROR", "cron", "runScheduledTasks ล้มทั้งรอบ", {
      detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
    });
    return NextResponse.json({ ok: false, error: "cron_failed" }, { status: 500 });
  }
  // best-effort — ตัวนี้ล้มห้ามทำให้ cron รอบนี้แดง (งานหลักของ route คือ runScheduledTasks)
  const voiceSent = await sweepPendingVoiceDelivery();
  // K2.9 — `now` ส่งจากที่นี่เสมอ (ตัว sweep ห้ามอ่านนาฬิกาเอง เพื่อให้ทดสอบชั่วโมงอื่นได้)
  let kanbanScheduled = -1;
  try {
    kanbanScheduled = await sweepScheduledRules(new Date());
  } catch (e) {
    await logOps("WARN", "cron", "sweepScheduledRules (กฎอัตโนมัติบอร์ดงาน) ล้ม", {
      detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
    });
  }
  // K2.11 — เตือน "ใกล้ถึงกำหนดส่ง" + รวมใบแจ้งเตือนเป็นอีเมลฉบับเดียวให้คนที่ตั้ง "สรุปรายชั่วโมง"
  //   🔴 best-effort เหมือนกัน: ล้มห้ามทำให้รอบนี้แดง · `now` ส่งจากที่นี่ (sweep ไม่อ่านนาฬิกาเอง)
  let kanbanDueSoon = -1;
  let kanbanEmails = -1;
  try {
    kanbanDueSoon = await sweepDueSoonReminders(new Date());
  } catch (e) {
    await logOps("WARN", "cron", "sweepDueSoonReminders (เตือนใกล้ถึงกำหนดส่ง) ล้ม", {
      detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
    });
  }
  try {
    kanbanEmails = await sweepKanbanEmailHourly(new Date());
  } catch (e) {
    await logOps("WARN", "cron", "sweepKanbanEmailHourly (อีเมลสรุปรายชั่วโมงของบอร์ดงาน) ล้ม", {
      detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
    });
  }
  // K3.3 — ห้องแชทที่ลูกค้าทักแล้วไม่มีใครรับเกิน N นาที → เปิดการ์ด "ลูกค้ารอคำตอบ" ให้ทีมตาม
  //   🔴 best-effort เหมือนตัวอื่น: ล้มห้ามทำให้รอบนี้แดง · `now` ส่งจากที่นี่ (sweep ไม่อ่านนาฬิกาเอง)
  //   ร้านที่ไม่ได้เปิดสวิตช์ = จบตั้งแต่ด่านแรก ไม่มีคิวรีตามมา
  let kanbanChatCards = -1;
  try {
    kanbanChatCards = await sweepUnattendedChats(new Date());
  } catch (e) {
    await logOps("WARN", "cron", "sweepUnattendedChats (การ์ดจากแชทที่ไม่มีคนรับ) ล้ม", {
      detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
    });
  }
  // M3.2 — แคมเปญที่ตั้งเวลาไว้และถึงเวลาแล้ว (ตัว sweep ห่อ try/catch เองแล้ว คืน -1 เมื่อพัง)
  const campaignsSent = await campaignsDue(new Date());
  // M3.3 — journey: ขั้น "รอ n วันแล้วทำต่อ" ที่ถึงเวลาแล้ว (ตัว step ห่อ try/catch เองแล้ว คืน -1 เมื่อพัง)
  const journeyWaitsRan = await journeyWaits(new Date());
  return NextResponse.json({ ok: true, ran, voiceSent, kanbanScheduled, kanbanDueSoon, kanbanEmails, kanbanChatCards, campaignsSent, journeyWaitsRan, at: new Date().toISOString() });
}
