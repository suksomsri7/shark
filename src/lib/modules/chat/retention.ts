// retention.ts — บังคับ `ChatSetting.retentionDays` ให้ทำงานจริง (WO-C12 · PDPA §11)
//
// เหตุ: ฟิลด์ `retentionDays` (default 365 · ช่วงที่ตั้งใจ 90–730) ไม่มีโค้ดไหนอ่านเลยทั้ง repo
// ⇒ ข้อความลูกค้าอยู่ในระบบตลอดกาล ขัดกับที่หน้า /privacy จะต้องประกาศตอน SiamDive ย้ายข้อมูลเข้ามา
//
// ═══════════════════════════════════════════════════════════════
// 🔴 "ลบ" ที่นี่ = **ปกปิดเนื้อหา (redact) แล้วเก็บแถวไว้** ไม่ใช่ลบแถวทิ้ง
//
// เหตุผล (เรียงตามน้ำหนัก):
//  1. `ChatMessage.purgedAt` มีอยู่ในสคีมาแล้วตั้งแต่ WO-C1 — **แถวที่ถูกลบทิ้งถือ timestamp ไม่ได้**
//     การมีคอลัมน์นี้คือเจตนาชัดของเจ้าของสคีมาว่า "เก็บซอง ทิ้งไส้"
//  2. `@@unique([conversationId, externalMessageId])` คือ **สมุดกัน webhook ซ้ำ** (ดู
//     api/chat/webhook/[connectionId]/route.ts) — ลบแถว = provider ยิงซ้ำของเก่าแล้วเด้งกลับเข้า inbox ได้อีก
//  3. ตัวเลข SLA/ประวัติบน `ChatConversation` (firstCustomerMessageAt / firstResponseAt / reopenedCount)
//     อ้างอิงประวัติข้อความ — ลบแถวทิ้งทำให้สถิติของเธรดโกหก
//  4. `ChatAttachment.messageId` → `ChatMessage` **ไม่มี onDelete: Cascade** ในสคีมา ⇒ ลบแถวข้อความตรง ๆ
//     จะชน FK จริงบน Postgres (ต้องไล่ลบลูกก่อน = ล็อกยาวและพลาดง่าย)
//  5. redact เป็น `updateMany` ที่ where มี `purgedAt: null` ⇒ **รันซ้ำได้โดยธรรมชาติ** (idempotent)
//
// สิ่งที่ถูกลบจริง (กู้คืนไม่ได้): body · stickerMeta · orderContext · meta · senderName
// ของไฟล์แนบ: url · fileName  ⇒ เหลือแค่ซองเปล่า (เวลา/ทิศทาง/ชนิด) ไว้ให้เธรดยังอ่านเป็นเรื่องเป็นราว
//
// ✅ **หนี้ที่ปิดแล้ว (WO-CV9 · 2 ก.ย.) — ไฟล์จริงบน Bunny ถูกลบด้วย**
//    เดิมกวาดแค่ฟิลด์ ⇒ ใครถือ url เก่าอยู่ในมือยังเปิดฟัง/ดูรูปได้ตลอดกาล = "ลบตามอายุเก็บ" ไม่จริง
//    ตอนนี้เรียก `deleteStoredFile(url เดิม)` **ก่อน** ล้างฟิลด์ · ลบไม่สำเร็จก็ล้างฟิลด์ต่อ
//    (ความเป็นส่วนตัวระดับ DB ต้องเกิดเสมอ — ห้ามให้ CDN ล่มมาบล็อกการกวาด)
//    `storageKey` ยัง **ตั้งใจไม่ลบ** — เป็น handle สำรองไว้ตามเก็บไฟล์ที่ลบไม่สำเร็จ (ดู OpsEvent
//    source `storage.delete`) และไว้กวาดของค้างจากยุคก่อนหน้าฟีเจอร์นี้
//
// ⚠️ ข้อจำกัดที่ยังเหลือ — **CDN edge cache**: Bunny ลบวัตถุที่ storage zone ทันที
//    แต่ edge ที่เคยแคช (`max-age=2592000` = 30 วัน) ยังเสิร์ฟ url เดิมต่อได้จนหมดอายุ
//    purge ราย URL ต้องใช้ **account key** (`BUNNY_ACCOUNT_KEY`) ซึ่งยังไม่ได้ตั้งเป็น env ของ shark
//    (`SHARK_BUNNY_KEY` เป็นรหัสของ storage zone คนละตัว ใช้ purge ไม่ได้)
//    → โค้ดใน storage/service.ts เผื่อไว้แล้ว: มี env ก็ยิง purge ให้ ไม่มีก็ข้าม
//    🔴 จนกว่าจะตั้ง env นี้ ให้ถือว่า "ลบแล้ว" = ลบที่ต้นทาง ไม่ใช่หายจาก edge ทันที
// ═══════════════════════════════════════════════════════════════
//
// ⚠️ raw prisma: งานนี้กวาด **ข้ามทุกร้าน** (เหมือน sweepExpiringLots / sweepPendingDeletes)
//    → ใช้ tenantDb ไม่ได้เพราะยังไม่รู้ tenant ตอนเริ่ม · ทุก where ผูก `tenantId + systemId`
//    ที่อ่านมาจากแถว ChatSetting เสมอ (แกน system ตาม src/lib/core/scope.ts) ห้ามยิง where เปล่า

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { deleteStoredFile } from "@/lib/storage/service";

const DAY_MS = 24 * 60 * 60 * 1000;

/** ช่วงที่สคีมาตั้งใจ (`chat.prisma` คอมเมนต์ "90–730") — สคีมาไม่มี CHECK constraint จึงบังคับที่โค้ด */
export const RETENTION_MIN_DAYS = 90;
export const RETENTION_MAX_DAYS = 730;
export const RETENTION_DEFAULT_DAYS = 365;

/** จำนวนแถวสูงสุดต่อ 1 รอบ cron (กันล็อกตารางยาว) */
const DEFAULT_LIMIT = 2000;
/** ขนาด statement ย่อย — updateMany ทีละก้อนเล็ก ๆ ไม่ใช่ทีเดียวทั้งหมื่นแถว */
const CHUNK = 500;

/**
 * บีบค่าเข้าช่วง 90–730 เสมอ — fail-safe 2 ทาง:
 * ค่าเพี้ยนน้อย (เช่น 0/1) จะไม่กวาดข้อมูลใหม่ทิ้ง · ค่าเพี้ยนมากก็ไม่กลายเป็นเก็บตลอดกาล
 */
export function clampRetentionDays(value: unknown): number {
  const n =
    typeof value === "number" && Number.isFinite(value)
      ? Math.trunc(value)
      : RETENTION_DEFAULT_DAYS;
  if (n < RETENTION_MIN_DAYS) return RETENTION_MIN_DAYS;
  if (n > RETENTION_MAX_DAYS) return RETENTION_MAX_DAYS;
  return n;
}

/**
 * ตัวลบไฟล์จริง — ฉีดได้เพื่อ **พิสูจน์ว่ามีการเรียกจริง** (ข้อสอบ RT-5)
 * แพตเทิร์นเดียวกับ `uploadFile(deps.put)` — ของจริงยิง Bunny, ข้อสอบฉีดตัวนับ
 */
export type PurgeDeps = {
  deleteFile?: (
    url: string,
    opts?: { tenantId?: string },
  ) => Promise<{ ok: boolean; reason?: string }>;
};

export type PurgeResult = {
  /** จำนวนข้อความที่ถูกดึงมาพิจารณาในรอบนี้ (= ที่เข้าเงื่อนไขหมดอายุและยังไม่เคยปกปิด) */
  scanned: number;
  /** จำนวนข้อความที่ถูกปกปิดจริงในรอบนี้ */
  purged: number;
  /** จำนวนระบบ (ChatSetting) ที่มีข้อความถูกปกปิดในรอบนี้ */
  systems: number;
};

/**
 * ปกปิดเนื้อหาข้อความที่เกินอายุเก็บของแต่ละระบบ — เรียกจาก cron รายวัน
 *
 * - ไล่ทีละ `ChatSetting` (1 แถว = 1 ระบบ CHAT) → cutoff = now − clamp(retentionDays)
 * - แต่ละระบบใช้ `retentionDays` ของตัวเอง (ร้าน A 90 วัน / ร้าน B 730 วัน อยู่ด้วยกันได้)
 * - จำกัดด้วย `limit` ต่อรอบ · รันซ้ำได้ (แถวที่ purge แล้วถูกตัดออกด้วย `purgedAt: null`)
 * - ระบบไหนพังไม่ล้มทั้งรอบ (ห่อ try/catch ต่อระบบ) — cron จะได้ไม่ตายเพราะร้านเดียว
 */
export async function purgeExpiredChatMessages(
  opts: { now?: Date; limit?: number } = {},
  deps?: PurgeDeps,
): Promise<PurgeResult> {
  const now = opts.now ?? new Date();
  const limit = Math.max(1, Math.trunc(opts.limit ?? DEFAULT_LIMIT));
  const deleteFile = deps?.deleteFile ?? deleteStoredFile;

  const settings = await prisma.chatSetting.findMany({
    select: { tenantId: true, systemId: true, retentionDays: true },
    orderBy: { systemId: "asc" },
  });

  let scanned = 0;
  let purged = 0;
  let systems = 0;
  let budget = limit;

  for (const s of settings) {
    if (budget <= 0) break;
    try {
      const cutoff = new Date(now.getTime() - clampRetentionDays(s.retentionDays) * DAY_MS);
      let purgedHere = 0;

      // ── (0) 🔴 H2 (WO-CW3): คลังตัวอย่างคำตอบ = "สำเนาเนื้อความอีกที่หนึ่ง" ──
      //    `question` คือข้อความจริงของลูกค้า · `answer` คือคำตอบจริงของทีม
      //    ไม่กวาด = ปกปิด ChatMessage ไปแล้วแต่เนื้อหาเดิมยังอ่านได้จากตารางนี้ตลอดกาล
      //    ปกปิด (ไม่ลบแถว) ด้วยเหตุผลเดียวกับข้อความ: ตัวอย่างที่เคยถูกใช้ต้องตรวจย้อนได้ว่ามีอยู่
      //    `OR: [{question not ""}, {answer not ""}]` ทำให้รันซ้ำแล้วไม่แตะแถวเดิม (idempotent)
      //    ⚠️ อยู่นอก while เพราะไม่ผูกกับ "มีข้อความหมดอายุในรอบนี้ไหม" — ตัวอย่างหมดอายุได้เอง
      //    และไม่กิน `budget` ของข้อความ (คนละตาราง คนละขนาดงาน)
      await prisma.chatAnswerExample.updateMany({
        where: {
          tenantId: s.tenantId,
          systemId: s.systemId,
          createdAt: { lt: cutoff },
          OR: [{ question: { not: "" } }, { answer: { not: "" } }],
        },
        data: { question: "", answer: "" },
      });

      while (budget > 0) {
        const take = Math.min(budget, CHUNK);
        // 🔴 where ผูก tenantId + systemId เสมอ — ห้ามกวาดข้ามร้าน
        const rows = await prisma.chatMessage.findMany({
          where: {
            tenantId: s.tenantId,
            systemId: s.systemId,
            purgedAt: null,
            createdAt: { lt: cutoff },
          },
          select: { id: true, conversationId: true },
          orderBy: { createdAt: "asc" },
          take,
        });
        if (rows.length === 0) break;

        scanned += rows.length;
        budget -= rows.length;
        const ids = rows.map((r) => r.id);
        const convIds = [...new Set(rows.map((r) => r.conversationId))];

        // (1) ไส้ของข้อความ — Json? ต้องใช้ Prisma.DbNull ถึงจะเป็น SQL NULL จริง
        const res = await prisma.chatMessage.updateMany({
          where: {
            tenantId: s.tenantId,
            systemId: s.systemId,
            id: { in: ids },
            purgedAt: null, // idempotent: รันซ้ำแล้วไม่ทับ purgedAt เดิม
          },
          data: {
            body: null,
            stickerMeta: Prisma.DbNull,
            orderContext: Prisma.DbNull,
            meta: Prisma.DbNull,
            senderName: null,
            // 🔴 H1 (WO-CW3): `translatedBody` คือ **สำเนาเนื้อความอีกชุด** ที่ WO-CW1 เพิ่งเพิ่ม
            //    ล้างแต่ `body` = ข้อความที่ "ปกปิดแล้ว" ยังอ่านได้เต็ม ๆ จากช่องคำแปล
            //    (แพตเทิร์นเดียวกับบั๊ก lastMessagePreview 28 ส.ค. เป๊ะ)
            //    ล้าง detectedLang/translatedLang/translatedAt ไปด้วย — เป็นร่องรอยว่าใครพูดภาษาอะไร
            //    และแปลเมื่อไหร่ ซึ่งเป็นข้อมูลส่วนบุคคลของบทสนทนาที่หมดอายุไปแล้ว
            translatedBody: null,
            detectedLang: null,
            translatedLang: null,
            translatedAt: null,
            purgedAt: now,
          },
        });
        purged += res.count;
        purgedHere += res.count;

        // (2a) 🔴 WO-CV9: **ลบไฟล์จริงบน storage ก่อน** แล้วค่อยล้างฟิลด์
        //      ลำดับนี้ห้ามสลับด้วยเหตุผลของ "ถ้าพังกลางคัน":
        //      · ลบไฟล์ก่อน → ถ้าพังตอนล้างฟิลด์: DB ชี้ไฟล์ที่หายไป = ฟองเสีย แต่ **ข้อมูลไม่รั่ว**
        //        และรอบถัดไปกวาดฟิลด์ต่อได้เอง (deleteStoredFile ถือ 404 = สำเร็จ)
        //      · ล้างฟิลด์ก่อน → ถ้าพังตอนลบไฟล์: url หายจาก DB แล้ว = **เสีย handle** ที่จะไปลบไฟล์
        //        (เหลือแค่ storageKey ที่ยังไม่มีตัวกวาดอัตโนมัติ) ⇒ ไฟล์กำพร้าที่ยังเปิดได้ตลอดกาล
        //
        //      ⚠️ ไฟล์ที่ **หลายแถวชี้ร่วมกัน** ห้ามลบ: ข้อความถูกส่งต่อ/ตอบซ้ำใช้ url เดียวกันได้
        //      ลบทิ้งเพราะแถวหนึ่งหมดอายุ = ฟองของอีกเธรดที่ยังไม่หมดอายุพังไปด้วย
        //      → แถวที่เหลือจะเป็นคนลบไฟล์เองตอนที่มันหมดอายุ (ตอนนั้นแถวนี้ url = "" แล้ว ไม่ถูกนับ)
        const atts = await prisma.chatAttachment.findMany({
          where: {
            tenantId: s.tenantId,
            systemId: s.systemId,
            messageId: { in: ids },
            url: { not: "" },
          },
          select: { id: true, url: true },
        });
        if (atts.length > 0) {
          const batchIds = new Set(atts.map((a) => a.id));
          const urls = [...new Set(atts.map((a) => a.url).filter((u) => u))];
          // ⚠️ where ผูกแค่ tenantId **โดยเจตนา** (ไม่ใส่ systemId): ร้านเดียวกันคนละระบบ
          //    อ้าง url เดียวกันได้ ถ้ากรอง systemId ด้วยจะมองไม่เห็นผู้ใช้ร่วมแล้วลบไฟล์ของเขาทิ้ง
          //    (ข้ามร้านเป็นไปไม่ได้อยู่แล้ว — path บน CDN ฝัง tenantId ไว้: `t/<tenantId>/...`)
          const sharers = await prisma.chatAttachment.findMany({
            where: { tenantId: s.tenantId, url: { in: urls } },
            select: { id: true, url: true },
          });
          for (const url of urls) {
            const usedElsewhere = sharers.some((x) => x.url === url && !batchIds.has(x.id));
            if (usedElsewhere) continue;
            try {
              await deleteFile(url, { tenantId: s.tenantId });
            } catch {
              // best-effort: ลบไฟล์ไม่สำเร็จห้ามหยุดการล้างฟิลด์ (ความเป็นส่วนตัวใน DB ต้องเกิดเสมอ)
              // ตัวลบลง OpsEvent source `storage.delete` ให้แล้ว — ที่นี่แค่ห้ามระเบิดขึ้นไป
            }
          }
        }

        // (2b) ไฟล์แนบ — ลบ url/fileName แต่ **คง storageKey** ไว้เป็น handle สำรอง
        // 🔴 WO-CV8: เสียงคือเนื้อความอีกรูปหนึ่ง — ล้าง url แล้วคลิปเล่นไม่ได้ (ฟองเสียงขึ้นปุ่มเล่นที่กดไม่ได้)
        //    ล้าง `durationMs` ไปด้วย เพราะ "ข้อความเสียง 1:47" ก็ยังเล่าเรื่องของบทสนทนาที่ถูกปกปิดไปแล้ว
        await prisma.chatAttachment.updateMany({
          where: {
            tenantId: s.tenantId,
            systemId: s.systemId,
            messageId: { in: ids },
            url: { not: "" },
          },
          data: { url: "", fileName: "", durationMs: null },
        });

        // (3) 🔴 denorm ที่มองไม่เห็น: `lastMessagePreview` เก็บสำเนาเนื้อความไว้ที่เธรด
        //     ไม่ล้าง = เนื้อหายังโผล่ในหน้ารายการ inbox ทั้งที่ข้อความถูกปกปิดไปแล้ว
        //     เงื่อนไข `lastMessageAt < cutoff` = "ข้อความล่าสุดของเธรดนี้หมดอายุแล้ว"
        //     (preview สะท้อนข้อความล่าสุดเสมอ — เธรดที่ยังมีข้อความใหม่กว่า cutoff ต้องไม่ถูกแตะ)
        await prisma.chatConversation.updateMany({
          where: {
            tenantId: s.tenantId,
            systemId: s.systemId,
            id: { in: convIds },
            lastMessageAt: { lt: cutoff },
            lastMessagePreview: { not: null },
          },
          data: { lastMessagePreview: null },
        });

        if (rows.length < take) break; // หมดแล้วสำหรับระบบนี้
      }

      if (purgedHere > 0) systems += 1;
    } catch {
      // ระบบเดียวพัง → ข้ามไปทำร้านอื่นต่อ (cron ต้องไม่ล้มทั้งรอบ)
    }
  }

  return { scanned, purged, systems };
}

/**
 * ตั้งอายุเก็บข้อความของระบบ (หน้า "เชื่อมช่องทาง") — บังคับช่วง 90–730 ที่ชั้นนี้ด้วย
 * ไม่ใช้ upsert by systemId เปล่า ๆ: where ต้องมี tenantId ไม่งั้นรู้ systemId ของร้านอื่นก็แก้ค่าเขาได้
 * คืนค่าที่บันทึกจริง (หลัง clamp) · null = ระบบนี้ไม่ใช่ของร้านนี้ → ไม่แตะอะไรเลย
 */
export async function setRetentionDays(
  tenantId: string,
  systemId: string,
  days: unknown,
): Promise<number | null> {
  const value = clampRetentionDays(typeof days === "string" ? Number(days) : days);
  const res = await prisma.chatSetting.updateMany({
    where: { tenantId, systemId },
    data: { retentionDays: value },
  });
  if (res.count > 0) return value;

  // ยังไม่มีแถวตั้งค่า — สร้างได้เฉพาะเมื่อระบบ CHAT นี้เป็นของร้านนี้จริง
  const sys = await prisma.appSystem.findFirst({
    where: { id: systemId, tenantId, type: "CHAT" },
    select: { id: true },
  });
  if (!sys) return null;
  await prisma.chatSetting.create({ data: { tenantId, systemId, retentionDays: value } });
  return value;
}
