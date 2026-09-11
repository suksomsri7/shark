// cron.ts — เคอร์เนล cron ระดับแพลตฟอร์ม (WO-0029)
// กวาดของหมดอายุข้ามทุกร้าน + เก็บตก outbox event ที่ยังค้าง
// อยู่ระดับ platform → prisma ตรง updateMany (ไม่ผูก tenant เดียว — กวาดทั้งระบบ)
// เรียกจาก route /api/cron/tick วันละครั้ง (03:00 BKK)

import { prisma } from "@/lib/core/db";
import { drainAll } from "@/lib/outbox-consumers";
import { outboxHealth } from "@/lib/core/outbox";
import { logOps } from "@/lib/core/ops";
import { sweepPendingDeletes } from "@/lib/platform/pdpa";
import { sweepWeeklyAnalysis } from "@/lib/ai/analyst";
import { sweepExpiringLots } from "@/lib/modules/inventory/service";
import { retryFailedWebhooks } from "@/lib/webhooks/service";
import { sweepAutoClosePeriods } from "@/lib/modules/account/period-sweep";
import { sweepOnboardingDrip } from "@/lib/platform/onboarding-drip";
import { sweepDnaReview } from "@/lib/ai/dna-review";
import { sweepProactiveNudges } from "@/lib/ai/proactive";
import { purgeExpiredChatMessages } from "@/lib/modules/chat/retention";
import { deliverPendingVoice } from "@/lib/modules/chat/service";
import { sweepRateBuckets } from "@/lib/core/rate-limit-db";
import { sweepRecurringCards } from "@/lib/modules/kanban/recurrence";
import { sweepDueDateRules } from "@/lib/modules/kanban/automation";
import { sweepOverdue } from "@/lib/modules/kanban/reminders";
import { sweepKanbanDigest } from "@/lib/modules/kanban/digest";
import { emitJourneyCronEvents, runDueWaits, runTierReview, sweepAutoErase, sweepCustomerAuth } from "@/lib/modules/member";
import { expireDue, notifyExpiring } from "@/lib/modules/point";
import { expireDue as giftCardExpireDue } from "@/lib/modules/giftcard";
import { expireDue as stampExpireDue } from "@/lib/modules/stamp";
import { expireDue as rewardExpireDue } from "@/lib/modules/reward";
import { expireDue as voucherExpireDue, notifyExpiring as voucherNotifyExpiring } from "@/lib/modules/voucher";
import { sendDueCampaigns } from "@/lib/modules/marketing";
// M2.5 — ต่อสาย "ของแจกย้อนกลับ" (ขึ้นระดับ → voucher ต้อนรับ) ก่อนงานกวาดรายวันเริ่มทำงาน
//   cron เป็นหนึ่งใน 2 ทางเข้าที่ทำให้ระดับสมาชิกเปลี่ยนได้โดยไม่มีคนกดปุ่ม (อีกทางคือคิว outbox)
//   ⇒ ถ้าไม่ลงทะเบียนที่นี่ รอบทบทวนระดับกลางดึกจะเลื่อนระดับให้ แต่ลูกค้าไม่ได้ voucher ต้อนรับ
import { registerMemberHooks } from "@/lib/member-hooks";

/**
 * M1.9 (D1 · §7.5) — รอบทบทวนระดับสมาชิกของทุกร้านที่มี "ระบบสมาชิก"
 *
 * `runTierReview` หยิบเฉพาะสมาชิกที่ `tierReviewAt` ถึงกำหนดแล้ว (+ คนที่ใกล้ถึงกำหนดสำหรับ
 * การแจ้งล่วงหน้า) ⇒ รันทุกวันได้โดยไม่ทำงานซ้ำ · แจ้ง "เสี่ยงหลุดระดับ" 1 ครั้งต่อรอบ
 * 🔴 ร้านเดียวพังต้องไม่ล้มทั้งรอบ — try/catch รอบร้าน (ตัวเรียกก็มี try/catch ของ step ตัวเองอีกชั้น)
 */
export async function sweepTierReviews(now: Date = new Date()): Promise<number> {
  const systems = await prisma.appSystem.findMany({
    where: { type: "MEMBER", active: true },
    select: { id: true, tenantId: true },
  });
  let evaluated = 0;
  for (const s of systems) {
    try {
      const r = await runTierReview({ tenantId: s.tenantId, systemId: s.id, actorUserId: null }, s.id, now, {});
      evaluated += r.evaluated;
    } catch {
      // ร้านนี้ทบทวนไม่สำเร็จ → ข้ามไปร้านถัดไป (รอบพรุ่งนี้ได้ใหม่ · tierReviewAt ยังค้างอยู่)
    }
  }
  return evaluated;
}

/**
 * M2.1 (D2 · §7.5 · §11.4) — ตัดล็อตแต้มที่หมดอายุของ **ทุกร้าน**
 *
 * `expireDue(null, now)` หยิบเฉพาะล็อตที่ `expiresAt ≤ now` และยังไม่ถูกตัด (`expiredAt` ว่าง)
 * ⇒ รันทุกวันได้โดยไม่ทำงานซ้ำ · ทำเป็นชุดละ 1,000 ใบจนหมด (ร้านใหญ่ต้องไม่ค้างครึ่งทาง)
 * 🔴 คืนจำนวน **แต้ม** ที่ถูกตัด (ไม่ใช่จำนวนล็อต) — ตัวเลขนี้คือ "หนี้แต้ม" ที่หายไปจากบัญชีร้าน
 */
export async function sweepPointExpiry(now: Date = new Date()): Promise<number> {
  const r = await expireDue(null, now);
  return r.points;
}

/**
 * M2.1 (§7.4 ตาราง "แต้มใกล้หมดอายุ") — ยิง event `point.expiring` ล่วงหน้าตาม `remindDays` ของแต่ละร้าน
 * dedupe ต่อ (ล็อต, จำนวนวันที่เหลือ) ผ่าน idempotencyKey ของ outbox ⇒ รันซ้ำวันเดียวกันไม่ส่งซ้ำ
 */
export async function sweepPointExpiring(now: Date = new Date()): Promise<number> {
  const r = await notifyExpiring(null, now);
  return r.notified;
}

/**
 * M2.6 (D3 · §11.6) — บัตรกำนัลที่ถึงวันหมดอายุของ **ทุกร้าน** → EXPIRED
 *
 * ยอดที่ยังเหลืออยู่บนบัตรกลายเป็น "รายได้อื่น" (Dr 2110 · Cr 4900) เฉพาะร้านที่เปิดสวิตช์ผูกบัญชี
 * และเฉพาะบัตรที่ **ขายตอนสวิตช์เปิด** เท่านั้น (ไม่งั้นจะปิดหนี้สินที่ไม่เคยถูกบันทึกไว้)
 * 🔴 idempotent: `updateMany` มีเงื่อนไข `status: ACTIVE` ⇒ รันซ้ำวันเดียวกันไม่ทำรายการซ้ำ
 */
export async function giftCardExpire(now: Date = new Date()): Promise<number> {
  const r = await giftCardExpireDue(now);
  return r.expired;
}

/**
 * M2.3 (§7.5 · §11.9) — ใบสะสมตราที่ถึงวันหมดอายุของ **ทุกร้าน**
 *
 * ตราที่ค้างอยู่หายไป (StampEvent EXPIRE) แล้ว "เริ่มนับใหม่" จากวันนี้ — ไม่ลบแถวทิ้ง
 * เพราะลูกค้าต้องเห็นประวัติว่าเคยสะสมไว้เท่าไหร่แล้วหมดอายุเมื่อไหร่
 * 🔴 idempotent: หยิบเฉพาะใบที่ยังไม่ปิด + `expiresAt ≤ now` + ยังมีตราค้าง ⇒ รันซ้ำวันเดียวกันไม่ทำซ้ำ
 */
export async function stampExpire(now: Date = new Date()): Promise<number> {
  const r = await stampExpireDue(now);
  return r.expired;
}

/**
 * M2.4 (§7.5 · §11.9) — รายการแลกของรางวัล PENDING ที่ถึงวันหมดอายุรับของ**ทุกร้าน** → CANCELLED
 * (คืนแต้ม/สแตมป์/สต็อกให้ครบ + cancelReason "EXPIRED")
 * 🔴 idempotent: หยิบเฉพาะ `status: PENDING` + `expiresAt ≤ now` ⇒ รันซ้ำวันเดียวกันไม่ทำซ้ำ
 */
export async function rewardExpire(now: Date = new Date()): Promise<number> {
  const r = await rewardExpireDue(now);
  return r.expired;
}

/**
 * M2.5 (§7.5 · §11.6) — voucher ที่ถึงวันหมดอายุของ **ทุกร้าน** → EXPIRED + event `voucher.expired`
 * 🔴 idempotent: `updateMany` มีเงื่อนไข `status: ACTIVE` ⇒ รันซ้ำวันเดียวกันไม่ทำรายการซ้ำ
 */
export async function voucherExpire(now: Date = new Date()): Promise<number> {
  const r = await voucherExpireDue(now);
  return r.expired;
}

/**
 * M2.5 (§7.4) — แจ้งล่วงหน้า "voucher ใกล้หมดอายุ" (เหลือ 7 วัน และ 1 วัน นับเป็นวันไทย)
 * dedupe ต่อ (ใบ, วันไทยที่แจ้ง) ผ่าน idempotencyKey ของ outbox ⇒ รันซ้ำวันเดียวกันไม่ส่งซ้ำ
 */
export async function voucherExpiring(now: Date = new Date()): Promise<number> {
  const r = await voucherNotifyExpiring(now);
  return r.notified;
}

// MemberSubscription ACTIVE ที่ครบกำหนด (endAt < now) → EXPIRED ทุกร้าน
// where จำกัด status=ACTIVE → รันซ้ำได้ (ตัวที่ EXPIRED ไปแล้วไม่ถูกแตะ = idempotent)
export async function sweepExpiredSubscriptions(now: Date = new Date()): Promise<number> {
  const res = await prisma.memberSubscription.updateMany({
    where: { status: "ACTIVE", endAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  return res.count;
}

// AiProposal PENDING ที่เลย TTL (expiresAt < now) → EXPIRED ทุกร้าน
// where จำกัด status=PENDING → idempotent เช่นกัน
export async function sweepExpiredProposals(now: Date = new Date()): Promise<number> {
  const res = await prisma.aiProposal.updateMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  return res.count;
}

/**
 * ตาข่ายเก็บตกข้อความเสียงที่ค้างรอส่งเข้าช่องทาง (WO-CV13 M3 ข · รายชั่วโมง)
 *
 * เส้นทางหลักคือ `scripts/voice-transcode-worker.mts` บน VPS (ทุก 1 นาที — เป็นทั้งตัวแปลง
 * และตัวส่ง) · ตัวนี้มีไว้เผื่อ **VPS ตาย/cron ถูกปิด** ⇒ ส่งได้เฉพาะแถวที่ไฟล์เป็น m4a แล้ว
 * (Vercel ไม่มี ffmpeg แปลงเองไม่ได้) และแถวที่ค้างเกิน 30 นาทีจะถูกมาร์ก FAILED ให้ทีมเห็น ✗
 * แทนที่จะค้าง PENDING เงียบ ๆ ตลอดกาล
 *
 * 🔴 best-effort — ห้าม throw ออกไปทำให้ cron ทั้งรอบล้ม
 */
export async function sweepPendingVoiceDelivery(): Promise<number> {
  try {
    const r = await deliverPendingVoice({ limit: 50 });
    return r.sent;
  } catch {
    return -1;
  }
}

/**
 * M3.2 — แคมเปญที่ "ตั้งเวลาไว้" และถึงเวลาแล้ว (ทุกร้าน) · เรียกจาก cron **รายชั่วโมง**
 *
 * 🔴 ความละเอียดคือ 1 ชั่วโมง โดยตั้งใจ: ข้อความการตลาดที่ออกช้าไป 30 นาทีไม่เสียหาย แต่ cron
 *    ถี่กว่านี้ = แคมเปญใหญ่ถูกยิงทับกันเองตอนรอบก่อนยังส่งไม่จบ (ผู้รับมี unique กันซ้ำอยู่แล้ว
 *    แต่การแย่ง connection กับงานขายหน้าร้านไม่คุ้ม)
 * 🔴 best-effort — ล้มห้ามทำให้ cron ทั้งรอบแดง · ใบที่ถูกยกเลิกถูกกรองออกตั้งแต่คิวรี
 */
export async function campaignsDue(now: Date = new Date()): Promise<number> {
  try {
    const r = await sendDueCampaigns({ now });
    return r.sent;
  } catch {
    return -1;
  }
}

/**
 * M3.3 — journey: ขั้น "รอ n วันแล้วทำต่อ" ที่ถึงเวลาแล้ว (ทุกร้าน) · เรียกจาก cron **รายชั่วโมง**
 * 🔴 ตัวส่งจริง (LINE/อีเมล/SMS/push/บอร์ดงาน) ฉีดจาก composition root แบบ dynamic — ไฟล์นั้นลากแชท/บอร์ดงาน
 *    ซึ่งวนกลับมาที่ outbox-consumers (เหตุผลเดียวกับ kanbanBridge)
 * 🔴 best-effort — ล้มห้ามทำให้ cron ทั้งรอบแดง · แถวที่หยิบแล้วถูกจองด้วย updateMany (cron ซ้อนไม่ทำซ้ำ)
 */
export async function journeyWaits(now: Date = new Date()): Promise<number> {
  try {
    registerMemberHooks();
    const { journeySenders } = await import("@/lib/member-journey-senders");
    const r = await runDueWaits({ now, deps: journeySenders });
    return r.ran;
  } catch {
    return -1;
  }
}

/**
 * M3.3 — journey: ยิง event รอบเวลา (วันเกิด · หายไปนาน · ใกล้รอบทบทวนระดับ) ของทุกร้าน · เรียกจาก cron **รายวัน**
 * ก่อน drain outbox ในรอบเดียวกัน ⇒ ลูกค้าได้ของวันนี้เลย ไม่ต้องรอ cron รอบถัดไป
 */
export async function journeyCronEvents(now: Date = new Date()): Promise<number> {
  try {
    const r = await emitJourneyCronEvents({ now });
    return r.emitted;
  } catch {
    return -1;
  }
}

// งานประจำวัน: กวาด subs + proposals + เก็บตก outbox
// ห้าม throw — แต่ละส่วนห่อ try/catch เอง · ส่วนไหนพังเก็บเป็น -1 แล้วไปต่อ
// (cron ต้องไม่ล้มทั้งรอบเพราะงานย่อยอันเดียวพัง)
export async function runDailyCron(
  now: Date = new Date(),
): Promise<{
  subsExpired: number;
  proposalsExpired: number;
  outboxDrained: number;
  tenantsPurged: number;
  weeklyReports: number;
  lotsExpiring: number;
  webhooksRetried: number;
  periodsClosed: number;
  onboardingDripped: number;
  dnaReviews: number;
  proactiveNudges: number;
  chatPurged: number;
  rateBucketsSwept: number;
  recurringCards: number;
  kanbanDueRules: number;
  kanbanOverdue: number;
  kanbanDigests: number;
  tierReviews: number;
  autoErase: number;
  pointExpired: number;
  giftCardExpired: number;
  stampExpired: number;
  pointExpiring: number;
  voucherExpired: number;
  voucherExpiring: number;
  rewardExpired: number;
  customerAuthSwept: number;
  journeyEvents: number;
}> {
  let subsExpired = -1;
  let proposalsExpired = -1;
  let outboxDrained = -1;
  let tenantsPurged = -1;
  let weeklyReports = -1;
  let lotsExpiring = -1;
  let webhooksRetried = -1;
  let periodsClosed = -1;
  let onboardingDripped = -1;
  let dnaReviews = -1;
  let proactiveNudges = -1;
  let chatPurged = -1;
  let rateBucketsSwept = -1;
  let recurringCards = -1;
  let kanbanDueRules = -1;
  let kanbanOverdue = -1;
  let kanbanDigests = -1;
  let tierReviews = -1;
  let autoErase = -1;
  let pointExpired = -1;
  let giftCardExpired = -1;
  let stampExpired = -1;
  let pointExpiring = -1;
  let voucherExpired = -1;
  let voucherExpiringCount = -1;
  let rewardExpired = -1;
  let customerAuthSwept = -1;
  let journeyEvents = -1;

  // M2.5 — hook ของแจกย้อนกลับต้องพร้อมก่อนรอบทบทวนระดับ (idempotent · เรียกซ้ำได้)
  registerMemberHooks();

  // M3.3 — ยิง event รอบเวลาของ journey **ก่อน** drain ด้านล่าง ⇒ journey วันเกิด/หายไปนานวิ่งในรอบนี้เลย
  //   (ตัว step ห่อ try/catch เองแล้ว คืน -1 เมื่อพัง)
  journeyEvents = await journeyCronEvents(now);

  try {
    subsExpired = await sweepExpiredSubscriptions(now);
  } catch {
    // กวาด subs พัง → -1 ไปต่อ
  }
  try {
    proposalsExpired = await sweepExpiredProposals(now);
  } catch {
    // กวาด proposals พัง → -1 ไปต่อ
  }
  try {
    const r = await drainAll();
    outboxDrained = r.processed;
  } catch {
    // drain outbox พัง → -1 ไปต่อ
  }
  try {
    // PDPA (WO-0042): ลบร้านที่ขอลบครบ 30 วันแล้ว
    tenantsPurged = await sweepPendingDeletes(now);
  } catch {
    // purge พัง → -1 ไปต่อ
  }
  try {
    // รายงานธุรกิจประจำสัปดาห์ (WO-0046): รันเฉพาะวันจันทร์เวลาไทย (ไม่ใช่จันทร์ → 0)
    weeklyReports = await sweepWeeklyAnalysis(now);
  } catch {
    // สร้างรายงานสัปดาห์พัง → -1 ไปต่อ
  }
  try {
    // แจ้งเตือน lot ใกล้หมดอายุ (WO-0038): กวาดทุกร้าน INVENTORY, idempotent ต่อวัน BKK
    lotsExpiring = await sweepExpiringLots(now);
  } catch {
    // กวาด lot ใกล้หมดอายุพัง → -1 ไปต่อ
  }
  try {
    // 🔴 ตัวเฝ้าคิว (30 ส.ค. 2026) — ตาข่ายนิรภัยที่ไม่มีสัญญาณเตือน = รู้ตัวช้ากว่าผู้ใช้เสมอ
    //    รอบนี้คิวตันทั้งระบบหลายชั่วโมงโดยไม่มีใครรู้ จนลูกค้ามาบอกว่าข้อความไม่ถึง
    //    ⇒ ตรวจ **หลัง** drain แล้ว: ถ้ายังมีของค้าง/ตาย แปลว่าระบายไม่ออกจริง ต้องส่งเสียง
    //    logOps ERROR ส่งอีเมลแจ้งเจ้าของ + throttle 60 นาที/source อยู่แล้ว จึงไม่ท่วม
    const health = await outboxHealth(now);
    const deadHooks = await prisma.webhookDelivery.count({ where: { status: "FAILED", attempts: { gte: 5 } } });
    if (health.stale > 0 || health.dead > 0 || deadHooks > 0) {
      await logOps(
        "ERROR",
        "outbox-health",
        `คิวส่งข้อความผิดปกติ — ค้างนาน ${health.stale} ใบ · ล้มถาวร ${health.dead} ใบ · webhook ตาย ${deadHooks} ใบ`,
        { detail: `ใบที่เก่าสุดค้างมา ${health.oldestStaleMin} นาที · ตรวจหลัง drain ของ cron รอบนี้แล้ว` },
      );
    }
  } catch {
    // ตัวเฝ้าพัง → ห้ามทำให้ cron ทั้งรอบล้ม
  }
  try {
    // Webhooks ขาออก (WO-0062): ยิงซ้ำการส่งที่ล้ม (attempts < 5) ทุกร้าน
    webhooksRetried = await retryFailedWebhooks();
  } catch {
    // retry webhook พัง → -1 ไปต่อ
  }
  try {
    // ปิดงวดบัญชีอัตโนมัติ (WO-0039): ปิดงวดเดือนก่อนหน้าทุกร้าน ACCOUNT ที่ Gate C ผ่าน
    periodsClosed = await sweepAutoClosePeriods(now);
  } catch {
    // ปิดงวดอัตโนมัติพัง → -1 ไปต่อ
  }
  try {
    // Onboarding drip (WO-0072): แนะขั้นถัดไปให้ร้านใหม่รายวัน
    onboardingDripped = await sweepOnboardingDrip(now);
  } catch {
    // drip พัง → -1 ไปต่อ
  }
  try {
    // WO-0048: DNA ต่อเนื่อง — ชวนอัปเดตเมื่อธุรกิจจริงต่างจาก facts
    dnaReviews = await sweepDnaReview(now);
  } catch {
    // drip พัง → -1 ไปต่อ
  }
  try {
    // AI เชิงรุก L1: ทักร้านที่มีสัญญาณ (สต็อกต่ำ/อนุมัติค้าง/ลาค้าง/ออเดอร์รอจ่าย) รายวัน
    proactiveNudges = await sweepProactiveNudges(now);
  } catch {
    // ทัก proactive พัง → -1 ไปต่อ
  }
  try {
    // WO-C12 (PDPA): ปกปิดเนื้อหาข้อความแชทที่เกิน ChatSetting.retentionDays ของแต่ละระบบ
    chatPurged = (await purgeExpiredChatMessages({ now })).purged;
  } catch {
    // กวาดข้อความหมดอายุพัง → -1 ไปต่อ
  }
  try {
    // WO-C3/B2: ChatRateBucket โตตามจำนวน key ที่ไม่ซ้ำ (ip/guest) — ไม่มีตัวกวาด = โตไม่จำกัด
    // ถังที่หน้าต่างเก่ากว่า 24 ชม. ไม่มีใครอ่านแล้ว (หน้าต่างยาวสุดของ chat = 1 ชม.)
    rateBucketsSwept = await sweepRateBuckets(24 * 60 * 60_000, now.getTime());
  } catch {
    // กวาดถัง rate limit พัง → -1 ไปต่อ
  }
  try {
    // K2.7: การ์ดเกิดซ้ำ — สร้างการ์ดลูกของงานประจำที่ถึงรอบวันนี้ (idempotent ผ่าน recurrenceKey)
    recurringCards = await sweepRecurringCards(now);
  } catch {
    // sweep งานประจำพัง → -1 ไปต่อ (ห้ามพา cron ทั้งรอบล้ม)
  }
  try {
    // K2.9: กฎอัตโนมัติชนิด "ตามวันครบกำหนด" (idempotent ต่อ กฎ+การ์ด+วันไทย ผ่าน AutomationRun.detail)
    kanbanDueRules = await sweepDueDateRules(now);
  } catch {
    // sweep กฎวันครบกำหนดพัง → -1 ไปต่อ (try/catch แยกของตัวเองตามสัญญา K2.9)
  }
  try {
    // K2.11: การ์ดที่เลยกำหนดส่ง — แจ้งผู้รับผิดชอบ + ผู้ดูแลบอร์ดที่ถูกเชิญชัด วันละครั้งต่อการ์ด
    kanbanOverdue = await sweepOverdue(now);
  } catch {
    // sweep เลยกำหนดพัง → -1 ไปต่อ (try/catch แยกของตัวเองตามสัญญา K2.11)
  }
  try {
    // K2.11: อีเมลสรุปงานรายวัน/รายสัปดาห์ (WEEKLY ส่งเฉพาะวันจันทร์ไทย · ไม่มีรายการ = ไม่ส่ง)
    kanbanDigests = await sweepKanbanDigest(now);
  } catch {
    // sweep อีเมลสรุปพัง → -1 ไปต่อ (try/catch แยกของตัวเองตามสัญญา K2.11)
  }
  try {
    // M1.9: รอบทบทวนระดับสมาชิกทุกร้านที่มีระบบสมาชิก (คง/เสี่ยงหลุด/ลด + แจ้งล่วงหน้า)
    tierReviews = await sweepTierReviews(now);
  } catch {
    // sweep รอบทบทวนระดับพัง → -1 ไปต่อ (ห้ามพา cron ทั้งรอบล้ม)
  }
  try {
    // M1.7 (§7.5 · §11.8): ร้านที่ตั้ง "ลบข้อมูลลูกค้าที่ไม่เคลื่อนไหวเกิน N ปี"
    //   → สร้าง **คำขอลบ** เข้าสายอนุมัติ (ไม่ลบเอง) · ข้ามคนที่มีคำขอค้างอยู่แล้ว = รันทุกวันได้
    autoErase = (await sweepAutoErase(undefined, now)).created;
  } catch {
    // sweep ลบอัตโนมัติพัง → -1 ไปต่อ (ห้ามพา cron ทั้งรอบล้ม)
  }
  try {
    // M2.1 (§7.5): ตัดล็อตแต้มที่หมดอายุของทุกร้าน (ledger EXPIRE + ยอดคงเหลือ + event point.expired)
    pointExpired = await sweepPointExpiry(now);
  } catch {
    // sweep แต้มหมดอายุพัง → -1 ไปต่อ (try/catch แยกของตัวเองตามสัญญา M2.1)
  }
  try {
    // M2.1 (§7.4): แจ้งล่วงหน้า "แต้มใกล้หมดอายุ" ตาม remindDays ของแต่ละร้าน (idempotent ต่อ ล็อต+วัน)
    pointExpiring = await sweepPointExpiring(now);
  } catch {
    // sweep แจ้งแต้มใกล้หมดอายุพัง → -1 ไปต่อ
  }
  try {
    // M2.6 (§11.6): บัตรกำนัลที่ถึงวันหมดอายุทุกร้าน → EXPIRED (+ รายได้อื่นเมื่อผูกบัญชีไว้)
    giftCardExpired = await giftCardExpire(now);
  } catch {
    // sweep บัตรกำนัลหมดอายุพัง → -1 ไปต่อ (ห้ามพา cron ทั้งรอบล้ม)
  }
  try {
    // M2.3 (§7.5): ใบสะสมตราที่ถึงวันหมดอายุทุกร้าน → ตราค้างหายไป + เริ่มนับใหม่
    stampExpired = await stampExpire(now);
  } catch {
    // sweep สแตมป์หมดอายุพัง → -1 ไปต่อ (ห้ามพา cron ทั้งรอบล้ม)
  }
  try {
    // M2.4 (§7.5): รายการแลกของรางวัลที่ถึงวันหมดอายุรับของทุกร้าน → CANCELLED (คืนแต้ม/สแตมป์/สต็อก)
    rewardExpired = await rewardExpire(now);
  } catch {
    // sweep ของรางวัลหมดอายุพัง → -1 ไปต่อ (ห้ามพา cron ทั้งรอบล้ม)
  }
  try {
    // M2.5 (§7.5): voucher ที่ถึงวันหมดอายุทุกร้าน → EXPIRED + event voucher.expired
    voucherExpired = await voucherExpire(now);
  } catch {
    // sweep voucher หมดอายุพัง → -1 ไปต่อ (ห้ามพา cron ทั้งรอบล้ม)
  }
  try {
    // M2.5 (§7.4): แจ้งล่วงหน้า voucher ใกล้หมดอายุ 7 วัน / 1 วัน (idempotent ต่อ ใบ+วันไทย)
    voucherExpiringCount = await voucherExpiring(now);
  } catch {
    // sweep แจ้ง voucher ใกล้หมดอายุพัง → -1 ไปต่อ
  }
  try {
    // M2.9: ล้าง OTP/เซสชันของลูกค้า (`/m/*`) ที่หมดอายุแล้วทุกร้าน — ของพวกนี้ไม่มีค่าทางบัญชี
    customerAuthSwept = await sweepCustomerAuth(now);
  } catch {
    // กวาด session ลูกค้าพัง → -1 ไปต่อ
  }

  return {
    subsExpired,
    proposalsExpired,
    outboxDrained,
    tenantsPurged,
    weeklyReports,
    lotsExpiring,
    webhooksRetried,
    periodsClosed,
    onboardingDripped,
    dnaReviews,
    proactiveNudges,
    chatPurged,
    rateBucketsSwept,
    recurringCards,
    kanbanDueRules,
    kanbanOverdue,
    kanbanDigests,
    tierReviews,
    autoErase,
    pointExpired,
    pointExpiring,
    giftCardExpired,
    stampExpired,
    voucherExpired,
    voucherExpiring: voucherExpiringCount,
    rewardExpired,
    customerAuthSwept,
    journeyEvents,
  };
}
