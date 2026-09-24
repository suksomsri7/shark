// reminders.ts — เตือนงาน/นัดของ CRM ที่ถึงเวลา (ใบ C2.4 · พิมพ์เขียว §5.5 "remind cron 5 นาที" · CRM-RUN S5)
//
// ทำอะไร: กิจกรรมที่ `remindAt` ถึงเวลาแล้ว ยังไม่ปิด และมีผู้ดูแล ⇒ แจ้งเตือน **ในแอป** ให้ผู้ดูแลคนนั้น 1 ใบ + push 1 ใบ
//   ต่อ `(activityId, remindAt)` หนึ่งคู่ (เลื่อนเวลาเตือน = คู่ใหม่ = เตือนใหม่ได้)
//
// 🔴 AUDIT-CLASS X5 (งานตามเวลา — "ธงก่อน แล้วค่อยส่ง"): ธง = แถว `OutboxEvent` คีย์
//    `crm.activity.reminder#<activityId>#<remindAt เป็น ms>` ซึ่งตารางนั้นมี unique `(tenantId, idempotencyKey)` อยู่แล้ว
//    ⇒ ธง + แถวแจ้งเตือนเกิดใน **ธุรกรรมเดียว** ใต้ advisory lock ของคู่นั้น:
//      · สองรอบทับกัน / รอบถัดไป / ตัวรัน 2 ทาง (crontab + route) = แจ้งเตือนใบเดียว (ไม่ซ้ำ)
//      · เครื่องดับกลางทาง = ยังไม่มีทั้งธงและแถว ⇒ รอบหน้าทำใหม่ (ไม่หาย)
//      · **push ล้ม/โยน = ไม่ทำให้แถวแจ้งเตือนหาย และไม่ทำให้รอบหน้าส่งซ้ำ** (push อยู่นอกธุรกรรม และธงถูกปักแล้ว)
//        เจตนา: แจ้งเตือนในแอปคือช่องทางที่เชื่อถือได้ · push เป็นของแถม (ปลุกเครื่อง) — ของแถมล้มต้องไม่ลากของหลักลงไป
// 🔴 R-E.14: ระบบที่ยัง `uiVersion = 1` ถูกข้ามทั้งระบบ — ไม่แจ้ง ไม่ push **และไม่แตะ `remindAt`** (แถวคงอยู่
//    แล้วเตือนต่อเมื่อเจ้าของร้านเปิดรุ่น 2 อีกครั้ง)
// 🔴 AUDIT-CLASS X1: ทุกคิวรีผูก `tenantId` + `systemId` ของระบบที่กำลังกวาด · ผู้รับ = `ownerUserId` ของแถวนั้นคนเดียว
//    (`AppNotification.recipientUserId` — ไม่ใช่ประกาศทั้งร้าน ซึ่งจะทำให้คนที่ไม่มีสิทธิ์อ่านหัวเรื่องงานของคนอื่นได้)
// 🔴 AUDIT-CLASS X8: payload ของ event มีแต่ id · ข้อความที่ log มีแต่ตัวเลข (ไม่มีหัวเรื่อง/ชื่อ/เบอร์)
// 🔴 ตัวลงทะเบียนงานรายนาทีอยู่ที่ `src/lib/platform/minute-jobs.ts` (บล็อก `CRM C2.4 ▸`) แบบเดียวกับ C2.1/C2.2 —
//    import ไฟล์นี้ก็ลงทะเบียนให้ด้วย (`import "@/lib/platform/minute-jobs"` ข้างล่าง) เพื่อให้ตัวรันทุกทางเห็นงานนี้เสมอ

import { emitOutbox } from "@/lib/core/outbox";
import { logOps } from "@/lib/core/ops";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { parseCrmSettings } from "./settings";
import { ACTIVITY_TYPE_LABEL, DAY_MS, type ActivityType } from "./activities-shared";
// AUDIT-CLASS X8: ตัวปิดเบอร์/อีเมลตัวเดียวของ CRM (ที่เดียวกับที่ใช้ปิด prompt ก่อนส่งโมเดล) — ใช้กับหัวเรื่องของงานก่อนลงแจ้งเตือน
import { redactContactInfo } from "./calls-shared";
// ลงทะเบียนงานรายนาทีของ CRM (ที่เดียว) — import นี้ทำให้ "import crm/reminders = ทะเบียนถูกโหลดแล้วแน่นอน"
import "@/lib/platform/minute-jobs";

/** ชื่องานรายนาที (ประกาศที่นี่ · ผู้ลงทะเบียนอยู่ที่ `platform/minute-jobs.ts`) */
export const REMIND_JOB = "crm.activity.remind";
/** ชนิด event ที่เป็นทั้ง "ธงกันซ้ำ" และจุดให้กฎอัตโนมัติ/เว็บฮุคของร้านยิงต่อ */
export const REMIND_EVENT = "crm.activity.reminder";

/** ย้อนเก็บของที่ตกรอบได้ไม่เกิน 7 วัน — เปิดระบบครั้งแรก/ดับไปหลายวัน ต้องไม่ถล่มแจ้งเตือนของปีที่แล้วทั้งกอง */
export const REMIND_LOOKBACK_MS = 7 * DAY_MS;
/** จำนวนแถวต่อชุด (รอบละ 5 นาที · **วนจนเงียบ** ภายในงบของตัวรัน — ดู PASS_MAX) */
const BATCH = 200;
/**
 * เพดานจำนวนชุดต่อระบบต่อรอบ — กันวนไม่จบถ้ามีอะไรผิดคาด (200 × 40 = 8,000 การเตือนต่อระบบต่อรอบ ก็ยังจบใน 5 นาที)
 * 🔴 บทเรียนของรีโปนี้ (reference_outbox_drain_must_loop_until_quiet): "หยิบ 200 แล้วเลิก" = คิวค้างเป็นชั่วโมง ·
 *    ของเดิมแย่กว่านั้น: เรียงตาม remindAt แล้วหยิบ 200 ตัวแรกทุกครั้ง โดยไม่ตัดแถวที่ปักธงแล้วออก
 *    ⇒ ร้านที่มีการเตือนถึงเวลาเกิน 200 รายการ จะอ่าน 200 ตัวเดิมซ้ำตลอดกาล และตัวที่ 201 ไม่เคยได้แจ้งเลย
 */
const PASS_MAX = 40;

export type RemindPushRequest = { tenantId: string; userId: string; activityId: string; title: string; body: string };
export type RemindDeps = { push?: (req: RemindPushRequest) => Promise<unknown> };
export type RemindOpts = { tenantIds?: string[]; deps?: RemindDeps; deadline?: number; signal?: AbortSignal; limit?: number };
export type RemindSummary = { scanned: number; notified: number; pushed: number; pushFailed: number; skippedSystems: number; passes: number; cutOff: boolean };

/** แถวที่ถึงเวลาและ **ยังไม่ปักธง** (ตัดด้วย NOT EXISTS ในคิวรีเดียว — ไม่ดึงแถวที่แจ้งไปแล้วกลับมาอีก) */
type DueRow = {
  id: string;
  title: string;
  remindAt: Date;
  ownerUserId: string;
  contactId: string | null;
  dealId: string | null;
  companyId: string | null;
  type: string;
};

type Tx = Prisma.TransactionClient;
const lockKey = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
const flagKey = (activityId: string, remindAt: Date) => `${REMIND_EVENT}#${activityId}#${remindAt.getTime()}`;

/** ตัวส่ง push ปริยาย — โหลดตอนใช้ (ไฟล์นี้ถูก import จากทะเบียนงานที่ต้องเบา) · ล้มแล้วโยนต่อให้ผู้เรียกนับเป็น pushFailed */
async function defaultPush(req: RemindPushRequest): Promise<unknown> {
  const { sendPushToUser } = await import("@/lib/core/push");
  return sendPushToUser(req.userId, { title: req.title, body: req.body }, { tenantId: req.tenantId });
}

/**
 * AUDIT-CLASS X8: ข้อความที่ออกไปที่ **เครื่องของพนักงาน** ผ่าน FCM/APNs ต้องเป็นข้อความกลาง ๆ
 * 🔴 หัวเรื่องของงานเป็นข้อความที่พนักงานพิมพ์เอง — ของจริงมีทั้งชื่อลูกค้าและเบอร์โทร ("โทรคุณสมชาย 081-…")
 *    push ไม่ผ่านด่านสิทธิ์ของเรา ไปโผล่บนหน้าจอล็อกของเครื่องที่ใครหยิบดูก็ได้ และผ่านเซิร์ฟเวอร์ของผู้ให้บริการ
 *    ⇒ push = ข้อความกลาง + รหัสกิจกรรม (ลิงก์ลึก) · หัวเรื่องจริงอยู่ใน `AppNotification` ซึ่งผูก `recipientUserId` คนเดียว
 */
const PUSH_TITLE = "ถึงเวลาติดตามงานใน CRM";
const pushBodyOf = (systemId: string, activityId: string) => `เปิดดูงานที่ถึงเวลาได้ที่ /app/sys/${systemId}/crm/activities (รหัสกิจกรรม ${activityId})`;
/**
 * ป้ายชนิดงานภาษาไทย (นัด · โทร · งาน · …) — บอกได้ว่า "งานแบบไหนถึงเวลา" โดยไม่ต้องพึ่งหัวเรื่องที่พนักงานพิมพ์เอง
 * 🔴 มติผู้คุมงานรอบ 2 (N13):
 *    · `push` = ข้อความกลาง + รหัสกิจกรรม เท่านั้น (ไม่มีหัวเรื่องเลย — push ไม่ผ่านด่านสิทธิ์ของเรา และโผล่บนหน้าจอล็อก)
 *    · `AppNotification.title` = ข้อความกลาง (กระดิ่งในแอปโชว์หัวเรื่องรวมกันหลายใบ — ไม่ใช่ที่ของชื่อ/เบอร์ลูกค้า)
 *    · `AppNotification.body` = ชนิดงาน + **หัวเรื่องที่ปิดเบอร์/อีเมลแล้ว** + รหัสกิจกรรม ⇒ พนักงานรู้ว่างานไหน
 *      โดยที่เบอร์/อีเมลของลูกค้าไม่ถูกคัดลอกออกจากแถวกิจกรรม (ข้อสอบ X8.6 ตรวจทั้ง title และ body)
 */
const typeLabelOf = (type: string): string => ACTIVITY_TYPE_LABEL[type as ActivityType] ?? "งาน";
/** หัวเรื่องที่ปลอดภัยพอจะใส่ในแจ้งเตือน (ปิดเบอร์/อีเมล + ตัดความยาว) */
const safeTitleOf = (title: string): string => redactContactInfo(String(title ?? "")).slice(0, 200);

const out = (deadline?: number) => typeof deadline === "number" && Number.isFinite(deadline) && Date.now() >= deadline;

/**
 * กวาดการเตือนที่ถึงเวลา — ไม่เคย throw จาก push ที่ล้ม (คืนจำนวนไว้ในสรุป)
 * ลำดับ: ระบบ CRM ที่ `uiVersion = 2` → กิจกรรมที่ถึงเวลา (ชุดละ 200) → ต่อแถว: ธง + แถวแจ้งเตือนใน tx เดียว → push นอก tx
 */
export async function remindDue(now: Date, opts: RemindOpts = {}): Promise<RemindSummary> {
  const at = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  const tenantIds = Array.isArray(opts.tenantIds) ? opts.tenantIds.filter((x): x is string => typeof x === "string" && !!x) : null;
  const limit = Math.min(Math.max(opts.limit ?? BATCH, 1), 1000);
  const push = opts.deps?.push ?? defaultPush;
  const summary: RemindSummary = { scanned: 0, notified: 0, pushed: 0, pushFailed: 0, skippedSystems: 0, passes: 0, cutOff: false };
  const systems = await prisma.appSystem.findMany({
    where: { type: "CRM", ...(tenantIds ? { tenantId: { in: tenantIds } } : {}) },
    select: { id: true, tenantId: true, settings: true },
    orderBy: { id: "asc" },
  });
  const since = new Date(at.getTime() - REMIND_LOOKBACK_MS);
  for (const sys of systems) {
    if (opts.signal?.aborted || out(opts.deadline)) {
      summary.cutOff = true;
      break;
    }
    // R-E.14: ระบบที่ยังไม่เปิดหน้าจอ v2 = ไม่ทำอะไรเลย (แถวคงอยู่ · เตือนต่อเมื่อเปิด 2 อีกครั้ง)
    if (parseCrmSettings(sys.settings).uiVersion !== 2) {
      summary.skippedSystems += 1;
      continue;
    }
    // ── วนชุดละ `limit` จนเงียบ (ไม่มีแถวที่ยังไม่ปักธงเหลือ) หรือหมดงบ ──
    //    เคอร์เซอร์ (remindAt, id) เดินหน้าเสมอ ⇒ ถึงแม้ NOT EXISTS จะพลาด แถวก็ไม่ถูกอ่านซ้ำในรอบเดียวกัน
    let curAt = new Date(0);
    let curId = "";
    for (let pass = 0; pass < PASS_MAX; pass += 1) {
      if (opts.signal?.aborted || out(opts.deadline)) {
        summary.cutOff = true;
        break;
      }
      summary.passes += 1;
      const rows = await dueRows(sys.tenantId, sys.id, at, since, curAt, curId, limit);
      if (rows.length === 0) break;
      curAt = rows[rows.length - 1]!.remindAt;
      curId = rows[rows.length - 1]!.id;
      for (const row of rows) {
        if (opts.signal?.aborted || out(opts.deadline)) {
          summary.cutOff = true;
          break;
        }
        summary.scanned += 1;
        // N13 · X8.6: title กลาง ๆ · body = ชนิดงาน + หัวเรื่องที่ปิดเบอร์/อีเมลแล้ว + รหัสกิจกรรม
        const inAppTitle = PUSH_TITLE;
        const inAppBody = `มี${typeLabelOf(row.type)}ถึงเวลาแล้ว: ${safeTitleOf(row.title)} — เปิดดูได้ที่ /app/sys/${sys.id}/crm/activities (รหัสกิจกรรม ${row.id})`.slice(0, 500);
        let claimed = false;
        try {
          claimed = await prisma.$transaction(async (tx) => {
            // ธงก่อน: ล็อกต่อคู่ (กิจกรรม, เวลาเตือน) แล้วดูว่าปักไปแล้วหรือยัง — สองรอบทับกันจึงเข้าได้ทีละคน
            await lockKey(tx, `crm:activity-remind:${row.id}:${row.remindAt.getTime()}`);
            const key = flagKey(row.id, row.remindAt);
            const already = await tx.outboxEvent.findUnique({ where: { tenantId_idempotencyKey: { tenantId: sys.tenantId, idempotencyKey: key } }, select: { id: true } });
            if (already) return false;
            // AUDIT-CLASS X8: payload = id ล้วน (ไม่มีหัวเรื่อง/ชื่อ/เบอร์) — ผู้รับ event โหลดของที่ต้องใช้เองด้วย id
            await emitOutbox(tx, {
              tenantId: sys.tenantId,
              systemId: sys.id,
              type: REMIND_EVENT,
              idempotencyKey: key,
              payload: { activityId: row.id, activityType: row.type, ownerUserId: row.ownerUserId, contactId: row.contactId, dealId: row.dealId, companyId: row.companyId },
            });
            await tx.appNotification.create({ data: { tenantId: sys.tenantId, recipientUserId: row.ownerUserId, title: inAppTitle, body: inAppBody } });
            return true;
          });
        } catch (e) {
          // ฐานล้มระหว่างปักธง = ยังไม่มีทั้งธงและแถว ⇒ รอบหน้าทำใหม่ (ไม่หาย ไม่ซ้ำ)
          await logOps("WARN", "crm.remind", "ปักธงการเตือนไม่สำเร็จ", { tenantId: sys.tenantId, detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
          continue;
        }
        if (!claimed) continue;
        summary.notified += 1;
        // push = ของแถม (นอกธุรกรรม · ล้มแล้วไม่ย้อนอะไร และรอบหน้าไม่ส่งซ้ำเพราะธงปักแล้ว) · ข้อความกลาง ไม่มีหัวเรื่องของงาน
        try {
          await push({ tenantId: sys.tenantId, userId: row.ownerUserId, activityId: row.id, title: PUSH_TITLE, body: pushBodyOf(sys.id, row.id) });
          summary.pushed += 1;
        } catch (e) {
          summary.pushFailed += 1;
          await logOps("WARN", "crm.remind", "ส่ง push การเตือนไม่สำเร็จ (แจ้งเตือนในแอปยังอยู่ครบ)", {
            tenantId: sys.tenantId,
            detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
          });
        }
      }
      if (rows.length < limit) break; // ชุดสุดท้ายไม่เต็ม = ไม่มีของเหลือแล้ว
    }
  }
  return summary;
}

/**
 * แถวที่ถึงเวลาและยังไม่ปักธง — คิวรีเดียว (NOT EXISTS กับ `OutboxEvent.idempotencyKey`) + เคอร์เซอร์ (remindAt, id)
 * 🔴 คีย์ธงถูกประกอบใน SQL ให้ตรงกับ `flagKey()` เป๊ะ: `crm.activity.reminder#<id>#<remindAt เป็น ms>`
 *    (`extract(epoch …)` คืน numeric ⇒ คูณพันแล้วแปลง bigint ได้ค่าเดียวกับ `Date.getTime()` ไม่มีปัญหาทศนิยม)
 * 🔴 ถ้าสูตรคีย์เพี้ยน ผลที่ได้คือ "ไม่ตัดแถวที่ปักแล้วออก" (ช้าลง) ไม่ใช่ "ข้ามแถวที่ยังไม่แจ้ง" —
 *    และเคอร์เซอร์ยังเดินหน้าอยู่ ⇒ ไม่มีทางกลับไปอ่านหัวแถวเดิมซ้ำจนแถวท้ายอดตาย
 */
async function dueRows(tenantId: string, systemId: string, at: Date, since: Date, curAt: Date, curId: string, limit: number): Promise<DueRow[]> {
  const rows = await prisma.$queryRaw<DueRow[]>(Prisma.sql`
    SELECT a."id", a."title", a."remindAt", a."ownerUserId", a."contactId", a."dealId", a."companyId", a."type"::text AS "type"
      FROM "CrmActivity" a
     WHERE a."tenantId" = ${tenantId}
       AND a."systemId" = ${systemId}
       AND a."doneAt" IS NULL
       AND a."ownerUserId" IS NOT NULL
       AND a."remindAt" IS NOT NULL
       AND a."remindAt" <= ${at}
       AND a."remindAt" >= ${since}
       AND (a."remindAt" > ${curAt} OR (a."remindAt" = ${curAt} AND a."id" > ${curId}))
       AND NOT EXISTS (
             SELECT 1 FROM "OutboxEvent" o
              WHERE o."tenantId" = a."tenantId"
                AND o."idempotencyKey" = ${`${REMIND_EVENT}#`} || a."id" || '#' || ((extract(epoch FROM a."remindAt") * 1000)::bigint)::text
           )
     ORDER BY a."remindAt" ASC, a."id" ASC
     LIMIT ${limit}`);
  return rows;
}
