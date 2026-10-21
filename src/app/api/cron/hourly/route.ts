import { NextResponse } from "next/server";
import { runScheduledTasks } from "@/lib/ai/scheduled";
import { campaignsDue, journeyWaits, memberReportsEmail, notificationsDue, sweepPendingVoiceDelivery } from "@/lib/platform/cron";
import { sweepScheduledRules } from "@/lib/modules/kanban/automation";
import { sweepDueSoonReminders } from "@/lib/modules/kanban/reminders";
import { sweepKanbanEmailHourly } from "@/lib/modules/kanban/digest";
import { sweepUnattendedChats } from "@/lib/platform/kanban-bridges";
import { logOps } from "@/lib/core/ops";
import { isCronAuthorized } from "@/lib/core/cron-auth";
import { forceCloseStaleShifts } from "@/lib/modules/pos/shift";
import { expirePaymentIntents } from "@/lib/modules/pos/payment-intent"; // POS P1.7 ▸ R5 ◂
import { expirePreorders } from "@/lib/modules/pos/order"; // POS P2.7 ▸ S2 ◂
import { sendPosDailyBriefs } from "@/lib/modules/pos/ai-brief"; // POS P3.9 ▸ R9 ◂
import { listPending as approvalListPending } from "@/lib/modules/approval/service"; // POS P3.9 ▸ R6 (คำขอที่รอผู้รับสรุปเช้า) ◂
import { drainAll } from "@/lib/outbox-consumers";

// GET /api/cron/hourly — งานประจำของผู้ช่วย AI (Vercel Cron เรียกทุกต้นชั่วโมง)
// auth: isCronAuthorized (Bearer SHARK_CRON_SECRET หรือ X-Cron-Secret) — ผิด/ไม่มี → 401 สั้น ๆ
// รัน runScheduledTasks(now): task ที่ถึงชั่วโมงไทยตอนนี้และยังไม่ได้รันวันนี้ → สรุปเป็น AppNotification
// + WO-CV13: ตาข่ายเก็บตกข้อความเสียงที่ค้างรอส่งเข้าช่องทาง (เผื่อ cron บน VPS ตาย)
// + K2.9: กฎอัตโนมัติของบอร์ดงานชนิด "ตั้งเวลา" (SCHEDULED) — เทียบ cron ไทยกับชั่วโมงนี้
// + C5.4 (L3-M1 ส่วนแพลตฟอร์ม): ระบายคิว outbox จนเงียบ (ท้ายรอบ — เก็บ event ที่ sweep ด้านบนเพิ่งสร้างด้วย)
//   ⇒ คอมเมนต์ของ kernel (`core/outbox.ts` "cron รายชั่วโมงเก็บตก") เป็นจริง: event ที่ไม่มีใครปลุก drain รอ ≤ 1 ชม. ไม่ใช่ ≤ 24 ชม.
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
  // M3.6 — การแจ้งเตือนสมาชิก: แถวที่ถึงกำหนด (digest รายวัน + เลื่อนจาก quiet hours) — ห่อ try/catch เองแล้ว
  const notificationsSent = await notificationsDue(new Date());
  // M3.8 — อีเมลรายงานสมาชิกตามเวลาที่ร้านตั้ง (ไม่ส่งซ้ำวันเดียวกัน) — ห่อ try/catch เองแล้ว คืน -1 เมื่อพัง
  const memberReportsSent = await memberReportsEmail(new Date());
  // POS P1.9 ▸ S12: บังคับปิดกะที่เปิดค้างเกิน forceCloseAfterHours (ปริยาย 24 ชม.) — best-effort · ล้มห้ามทำให้รอบนี้แดง ◂
  let posShiftsForced = -1;
  try {
    posShiftsForced = (await forceCloseStaleShifts({ now: new Date() })).closed.length;
  } catch (e) {
    await logOps("WARN", "cron", "forceCloseStaleShifts (บังคับปิดกะ POS ที่ค้าง) ล้ม", {
      detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
    });
  }
  // POS P1.7 ▸ R5: ใบขอรับเงิน PENDING ที่หมดเวลา → EXPIRED (จอใช้การอ่านสถานะแบบเขียนทันทีอยู่แล้ว · ตัวนี้เก็บกวาด) — best-effort ◂
  let posIntentsExpired = -1;
  try {
    posIntentsExpired = (await expirePaymentIntents()).expired;
  } catch (e) {
    await logOps("WARN", "cron", "expirePaymentIntents (ใบขอรับเงิน POS หมดอายุ) ล้ม", {
      detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
    });
  }
  // POS P2.7 ▸ S2: ออเดอร์สั่งล่วงหน้าที่เลยเวลาจ่าย → ยกเลิก + ใบ EXPIRED (หน้าสถานะ/จอ 09 ปิดแบบขี้เกียจอยู่แล้ว · ตัวนี้เก็บกวาด) — best-effort ◂
  let posPreordersExpired = -1;
  try {
    posPreordersExpired = (await expirePreorders()).expired;
  } catch (e) {
    await logOps("WARN", "cron", "expirePreorders (ออเดอร์สั่งล่วงหน้าเลยเวลาจ่าย) ล้ม", {
      detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
    });
  }
  // POS P3.9 ▸ R8 R9 มติ 4 5: สรุปเช้า POS รายผู้รับ (เจ้าของ + ผู้จัดการที่เลือก) เมื่อชั่วโมงไทย ≥ เวลาที่ร้านตั้ง (ปริยาย 06:00 · พลาด = ส่งตามหลังวันเดียวกัน) ·
  //   กันซ้ำในตัว (advisory lock + หัวเรื่องต่อผู้รับ) · งบ 20 วิ · best-effort: ล้มห้ามทำให้รอบนี้แดง ◂
  let posBriefsSent = -1;
  try {
    posBriefsSent = (
      await sendPosDailyBriefs({
        now: new Date(),
        deadline: new Date(Date.now() + 20_000),
        pendingApprovals: async (tenantId, r) => (await approvalListPending({ tenantId }, { userId: r.userId, role: r.role, unitAccess: r.unitAccess, permissions: r.permissions })).length,
      })
    ).sent;
  } catch (e) {
    await logOps("WARN", "cron", "sendPosDailyBriefs (สรุปเช้า POS) ล้ม", {
      detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
    });
  }
  // ◂ POS P3.9
  // POS P3.8 ▸ R5 R6 R8 R10: บอร์ดงาน/ห้องทีม POS — 86 นานเกิน N ชม. → การ์ด · คืนขาย → ปิดการ์ด · refund_needed 7 วัน → การ์ด · สรุปเช้าในห้องทีม (opt-in) ·
  //   ปริยายปิดทุกร้าน · งบ 20 วิ · พังรายระบบ = ops WARN pos.board · best-effort: ล้มห้ามทำให้รอบนี้แดง
  try {
    await (await import("@/lib/pos-board-bridges")).sweepPosBoard({ now: new Date(), deadline: new Date(Date.now() + 20_000) });
  } catch (e) {
    await logOps("WARN", "cron", "sweepPosBoard (บอร์ดงาน/ห้องทีม POS) ล้ม", {
      detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
    });
  }
  // ◂ POS P3.8
  // POS P3.6 ▸ R10 มติ 5: บิลที่ตั้งใจผูกดีล CRM (PosSale.crmDealId) แต่สะพาน pos.sale.paid พลาด (ปิดสะพาน/ล้ม = WARN) → ผูก + นับเข้าดีล ·
  //   หน้าต่าง 7 วัน · ปักธงก่อน (เรียกซ้ำ = ไม่มีแถวเพิ่ม) · งบ 20 วิ · best-effort: ล้มห้ามทำให้รอบนี้แดง
  try {
    await (await import("@/lib/modules/pos/crm-link")).sweepDealIntents({ now: new Date(), deadline: new Date(Date.now() + 20_000) });
  } catch (e) {
    await logOps("WARN", "cron", "sweepDealIntents (บิลผูกดีล CRM ที่ยังไม่ถูกนับ) ล้ม", {
      detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
    });
  }
  // ◂ POS P3.6
  // C5.4 (L3-M1 ส่วนแพลตฟอร์ม) — ระบายคิวจนเงียบด้วยตัวช่วยเดิม (`drainAll` → `drainUntilQuiet`: วนรอบละ 50 จนรอบหนึ่งหยิบไม่ได้เลย
  //   · เพดาน 10 รอบ · งบเวลา 20 วิ เหมือนทุกทางที่ระบาย) · best-effort: ล้มห้ามทำให้รอบนี้แดง · ต้อง await (แลมบ์ดาจบ = งานค้างถูกแช่แข็ง)
  let outboxDrained = -1;
  try {
    outboxDrained = (await drainAll()).processed;
  } catch (e) {
    await logOps("WARN", "cron", "drainAll (ระบายคิว outbox รายชั่วโมง) ล้ม", {
      detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
    });
  }
  return NextResponse.json({
    ok: true,
    ran,
    voiceSent,
    kanbanScheduled,
    kanbanDueSoon,
    kanbanEmails,
    kanbanChatCards,
    campaignsSent,
    journeyWaitsRan,
    notificationsSent,
    memberReportsSent,
    posShiftsForced,
    posIntentsExpired,
    posPreordersExpired, // POS P2.7 ◂
    posBriefsSent, // POS P3.9 ◂
    outboxDrained,
    at: new Date().toISOString(),
  });
}
