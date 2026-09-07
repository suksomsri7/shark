// digest.ts — อีเมลของบอร์ดงาน 2 แบบ (K2.11 · พิมพ์เขียว 13-kanban-v2 §7.4/§7.6 · สัญญา §K2.11)
//
//   1) `sweepKanbanEmailHourly` — "สรุปรายชั่วโมง": รวมใบแจ้งเตือนของบอร์ดงานที่ยังไม่ได้อ่านและยังไม่เคย
//      ส่งอีเมล ของคนที่ตั้ง `kanbanEmailMode = HOURLY` (ค่าเริ่มต้น) เป็นอีเมล **ฉบับเดียวต่อคนต่อร้าน**
//   2) `sweepKanbanDigest` — "อีเมลสรุปงาน" รายวัน/รายสัปดาห์: เลยกำหนด · ถึงกำหนดวันนี้ · สัปดาห์นี้ ·
//      ได้รับมอบหมายใหม่ ของงานที่ฉันรับผิดชอบหรือติดตาม
//
// 🔴 `deps.sendEmail` ฉีดได้ (แพตเทิร์นเดียวกับ `automation.ts` deps.post) — ข้อสอบดักอีเมลที่ปลายทางจริง
//    ไม่ต้องพึ่ง `RESEND_API_KEY` · ของจริง = `sendEmail` ของ core เมื่อ `emailEnabled` เท่านั้น
//    ไม่มีตัวส่ง (dev/QC ที่ไม่ได้ฉีด) = **ไม่ทำอะไรเลย** ไม่ใช่ "ทำเป็นส่งแล้วประทับ emailedAt"
//    (ประทับทั้งที่ส่งไม่ได้ = ข่าวหายถาวรเมื่อเสียบคีย์จริงวันหลัง)
// 🔴 `now` มาจากผู้เรียกเสมอ (cron ส่งให้) — ห้ามอ่านนาฬิกาเองในตัวกวาด
// 🔴 ช่องทางตาม D5 = ในแอป + push + อีเมล เท่านั้น (ไม่มีช่องทางแชทภายนอก)
// 🔴 ขอบเขตของ "สรุปรายชั่วโมง" = ใบแจ้งเตือน **ของบอร์ดงาน** เท่านั้น (ดูที่ลิงก์ `/kanban/` ในเนื้อใบ)
//    ตาราง `AppNotification` เป็นของกลางทั้งแพลตฟอร์ม (ขาย/สต็อก/อนุมัติ ก็เขียนใบลงที่นี่) — ถ้ากวาดทุกใบ
//    ค่าที่ผู้ใช้ตั้งไว้ในหน้า "บอร์ดงาน" จะไปสั่งอีเมลของโมดูลอื่นที่เขาไม่เคยเปิดด้วย

import type { Prisma } from "@prisma/client";
import { canReadKanban, toActor, visibleBoardsWhere } from "./access";
import { prisma } from "./db";
import type { KanbanActor } from "./types";

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
/** ย้อนหลังของ "สรุปรายชั่วโมง" — ใบที่เก่ากว่านี้ถือว่าเลยเวลาบอกแล้ว (ไปอ่านในแอปเอา) */
const HOURLY_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** ป้ายบอกว่าใบแจ้งเตือนใบนี้เป็นของโมดูลบอร์ดงาน — ทุกใบของโมดูลนี้มีลิงก์ลึกเสมอ (`notify.cardLink`) */
const KANBAN_LINK_MARK = "/kanban/";
/** จำนวนรายการสูงสุดต่อหัวข้อในอีเมลสรุป (อีเมลคือสรุป ไม่ใช่รายงาน — ที่เหลือกดเข้าไปดูในแอป) */
const DIGEST_SECTION_MAX = 20;

export type DigestDeps = {
  /** ฉีดตัวส่งอีเมลเข้ามา (ข้อสอบ/งานทดสอบ) — ไม่ส่งมา = ใช้ตัวจริงเมื่อ `emailEnabled` */
  sendEmail?: (to: string, subject: string, text: string) => Promise<void>;
};

/** ตัวส่งอีเมลจริงของรอบนี้ — `null` = ส่งไม่ได้ (ยังไม่ได้เสียบคีย์) ⇒ ผู้เรียกต้องไม่แตะข้อมูลอะไรเลย */
async function resolveSender(deps?: DigestDeps): Promise<((to: string, subject: string, text: string) => Promise<void>) | null> {
  if (deps?.sendEmail) return deps.sendEmail;
  const { emailEnabled } = await import("@/lib/env");
  if (!emailEnabled) return null;
  const { sendEmail } = await import("@/lib/core/email");
  return sendEmail;
}

/** ชื่อกิจการสำหรับขึ้นต้นหัวเรื่อง (B4) — จำต่อร้านในรอบเดียว ไม่ยิงซ้ำต่อคน */
async function displayNameOf(tenantId: string, cache: Map<string, string>): Promise<string> {
  const hit = cache.get(tenantId);
  if (hit !== undefined) return hit;
  let name = "SHARK";
  try {
    const { getBrandingTokens } = await import("@/lib/branding/service");
    name = (await getBrandingTokens(tenantId)).displayName;
  } catch {
    // แบรนด์อ่านไม่ได้ = ยังส่งอีเมลได้ (หัวเรื่องใช้ชื่อกลาง) — ห้ามทำให้ทั้งรอบล้ม
  }
  cache.set(tenantId, name);
  return name;
}

function bkkDateStr(ms: number): string {
  const d = new Date(ms + BKK_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function bkkDayStartMs(ms: number): number {
  return Math.floor((ms + BKK_OFFSET_MS) / DAY_MS) * DAY_MS - BKK_OFFSET_MS;
}

/** 0 = อาทิตย์ … 1 = จันทร์ (เวลาไทย · ห้ามใช้ getDay() ตรง ๆ — `reference_thai_date_getday_trap`) */
function bkkWeekday(ms: number): number {
  return new Date(ms + BKK_OFFSET_MS).getUTCDay();
}

/** เที่ยงคืนวันจันทร์ (ไทย) ของสัปดาห์ที่ครอบ ms */
function bkkWeekStartMs(ms: number): number {
  const dayStart = bkkDayStartMs(ms);
  const mondayOffset = (bkkWeekday(ms) + 6) % 7;
  return dayStart - mondayOffset * DAY_MS;
}

// ───────────────────────── 1) สรุปรายชั่วโมง ─────────────────────────

/**
 * รวมใบแจ้งเตือนของบอร์ดงานที่ "ยังไม่อ่าน + ยังไม่เคยส่งอีเมล" ส่งเป็นฉบับเดียวต่อคนต่อร้าน
 * ให้เฉพาะคนที่ตั้ง `HOURLY` (ค่าเริ่มต้น) · `OFF`/`INSTANT` ไม่แตะเลย
 *
 * ใบที่ "อ่านในแอปไปแล้ว" ไม่ส่ง แต่ **ประทับ `emailedAt` ปิดไว้** — เขารู้เรื่องแล้ว การส่งอีเมลตามหลัง
 * คือเสียงรบกวนล้วน ๆ และถ้าไม่ปิดไว้ ใบนั้นจะค้างเป็นผู้สมัครของทุกรอบไปจนพ้น 24 ชม.
 *
 * คืนจำนวน "ฉบับ" ที่ส่งออกไป (ไม่ใช่จำนวนใบ)
 */
export async function sweepKanbanEmailHourly(now: Date = new Date(), deps?: DigestDeps): Promise<number> {
  const send = await resolveSender(deps);
  if (!send) return 0;

  const rows = await prisma.appNotification.findMany({
    where: {
      recipientUserId: { not: null },
      emailedAt: null,
      createdAt: { gte: new Date(now.getTime() - HOURLY_LOOKBACK_MS) },
      body: { contains: KANBAN_LINK_MARK },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, tenantId: true, recipientUserId: true, title: true, body: true, readAt: true },
    take: 2000,
  });
  if (rows.length === 0) return 0;

  // จัดกลุ่ม "ต่อคนต่อร้าน" — คนเดียวเปิด 3 ร้านต้องได้ 3 ฉบับที่แยกกันชัด (หัวเรื่องมีชื่อกิจการ)
  const groups = new Map<string, { tenantId: string; userId: string; items: typeof rows }>();
  for (const r of rows) {
    if (!r.recipientUserId) continue;
    const key = `${r.tenantId}::${r.recipientUserId}`;
    const g = groups.get(key) ?? { tenantId: r.tenantId, userId: r.recipientUserId, items: [] };
    g.items.push(r);
    groups.set(key, g);
  }

  const brandCache = new Map<string, string>();
  let sentCount = 0;
  for (const g of groups.values()) {
    const membership = await prisma.membership.findFirst({
      where: { tenantId: g.tenantId, userId: g.userId },
      select: { role: true, unitAccess: true, permissions: true },
    });
    if (!membership) continue; // ไม่ใช่พนักงานของร้านนี้แล้ว — ไม่ส่งอะไรทั้งนั้น
    if (!canReadKanban(toActor(g.userId, membership))) continue;

    const { getUserPreferences } = await import("@/lib/core/user-preferences");
    const prefs = await getUserPreferences(g.userId);
    if (prefs.kanbanEmailMode !== "HOURLY") continue; // OFF/INSTANT จัดการจบตั้งแต่ตอนสร้างใบแล้ว

    const unread = g.items.filter((i) => i.readAt === null);
    const ids = g.items.map((i) => i.id);
    if (unread.length === 0) {
      // อ่านหมดแล้ว = ไม่ส่ง แต่ปิดใบไว้ไม่ให้ค้างเป็นผู้สมัครของรอบถัดไป
      await prisma.appNotification.updateMany({ where: { id: { in: ids } }, data: { emailedAt: now } });
      continue;
    }
    const user = await prisma.user.findUnique({ where: { id: g.userId }, select: { email: true } });
    if (!user?.email) continue;
    const brand = await displayNameOf(g.tenantId, brandCache);
    const subject = `[${brand}] บอร์ดงาน — แจ้งเตือน ${unread.length} รายการ`;
    const text = [
      `คุณมีแจ้งเตือนใหม่ในบอร์ดงาน ${unread.length} รายการ`,
      "",
      ...unread.map((i, n) => `${n + 1}. ${i.title}\n   ${i.body}`),
      "",
      "เปลี่ยนความถี่อีเมลได้ที่ บอร์ดงาน › ตั้งค่า › การแจ้งเตือนของฉัน",
    ].join("\n");
    try {
      await send(user.email, subject, text);
    } catch {
      continue; // ส่งไม่สำเร็จ = ไม่ประทับ (รอบหน้าเก็บใหม่)
    }
    await prisma.appNotification.updateMany({ where: { id: { in: ids } }, data: { emailedAt: now } });
    sentCount++;
  }
  return sentCount;
}

// ───────────────────────── 2) อีเมลสรุปงาน (digest) ─────────────────────────

type DigestLine = { title: string; boardName: string; dueAt: Date | null };

type DigestContent = {
  overdue: DigestLine[];
  today: DigestLine[];
  week: DigestLine[];
  newlyAssigned: DigestLine[];
};

function isEmptyDigest(c: DigestContent): boolean {
  // 🔴 "ไม่มีรายการ" = ไม่ส่ง: อีเมลเปล่าทุกเช้าคือวิธีที่เร็วที่สุดที่จะทำให้คนตั้งกฎกรองทิ้งทั้งโดเมน
  return c.overdue.length === 0 && c.today.length === 0 && c.week.length === 0 && c.newlyAssigned.length === 0;
}

/** เนื้อหาของสรุป 1 ฉบับ (คน 1 คน ในร้าน 1 ร้าน) — ขอบเขต = การ์ดที่ฉันรับผิดชอบหรือติดตาม */
async function buildDigest(
  tenantId: string,
  actor: KanbanActor,
  nowMs: number,
  sinceMs: number,
): Promise<DigestContent> {
  const [watchRows, assigneeRows] = await Promise.all([
    prisma.kanbanWatcher.findMany({
      where: { tenantId, userId: actor.userId },
      select: { targetType: true, targetId: true },
    }),
    prisma.kanbanCardAssignee.findMany({
      where: { tenantId, userId: actor.userId },
      select: { cardId: true, assignedAt: true },
    }),
  ]);
  const cardIds = [
    ...watchRows.filter((r) => r.targetType === "CARD").map((r) => r.targetId),
    ...assigneeRows.map((a) => a.cardId),
  ];
  const columnIds = watchRows.filter((r) => r.targetType === "COLUMN").map((r) => r.targetId);
  const boardIds = watchRows.filter((r) => r.targetType === "BOARD").map((r) => r.targetId);

  const or: Prisma.KanbanCardWhereInput[] = [{ assigneeUserId: actor.userId }];
  if (cardIds.length) or.push({ id: { in: cardIds } });
  if (columnIds.length) or.push({ columnId: { in: columnIds } });
  if (boardIds.length) or.push({ boardId: { in: boardIds } });

  const cards = await prisma.kanbanCard.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      completedAt: null,
      OR: or,
      board: { status: "ACTIVE", ...visibleBoardsWhere(actor) },
    },
    select: { id: true, title: true, dueAt: true, board: { select: { name: true } } },
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 300,
  });

  const todayStart = bkkDayStartMs(nowMs);
  const tomorrowStart = todayStart + DAY_MS;
  const weekEnd = bkkWeekStartMs(nowMs) + 7 * DAY_MS;
  const out: DigestContent = { overdue: [], today: [], week: [], newlyAssigned: [] };
  const newIds = new Set(assigneeRows.filter((a) => a.assignedAt.getTime() >= sinceMs).map((a) => a.cardId));

  for (const c of cards) {
    const line: DigestLine = { title: c.title, boardName: c.board.name, dueAt: c.dueAt };
    if (newIds.has(c.id) && out.newlyAssigned.length < DIGEST_SECTION_MAX) out.newlyAssigned.push(line);
    if (!c.dueAt) continue;
    const due = c.dueAt.getTime();
    if (due < todayStart) {
      if (out.overdue.length < DIGEST_SECTION_MAX) out.overdue.push(line);
    } else if (due < tomorrowStart) {
      if (out.today.length < DIGEST_SECTION_MAX) out.today.push(line);
    } else if (due < weekEnd) {
      if (out.week.length < DIGEST_SECTION_MAX) out.week.push(line);
    }
  }
  return out;
}

function renderDigest(content: DigestContent): string {
  const fmt = (l: DigestLine) => `• ${l.title} — ${l.boardName}`;
  const parts: string[] = [];
  const section = (heading: string, lines: DigestLine[]) => {
    if (lines.length === 0) return;
    parts.push(`${heading} (${lines.length})`, ...lines.map(fmt), "");
  };
  section("เลยกำหนดส่ง", content.overdue);
  section("ถึงกำหนดวันนี้", content.today);
  section("ถึงกำหนดภายในสัปดาห์นี้", content.week);
  section("เพิ่งได้รับมอบหมาย", content.newlyAssigned);
  parts.push("เปิดบอร์ดงานเพื่อดูรายละเอียด · เปลี่ยนความถี่ได้ที่ บอร์ดงาน › ตั้งค่า › การแจ้งเตือนของฉัน");
  return parts.join("\n");
}

/**
 * อีเมลสรุปงานรายวัน/รายสัปดาห์ (เกาะ `runDailyCron`) — คืนจำนวนฉบับที่ส่ง
 *
 * - `DAILY` = ทุกวัน · `WEEKLY` = เฉพาะวันจันทร์ (เวลาไทย) · `OFF` = ไม่ส่ง
 * - `periodKey` = `daily:YYYY-MM-DD` / `weekly:YYYY-MM-DD`(วันจันทร์ของสัปดาห์นั้น)
 * - หลักฐาน 1 แถวต่อคนต่อรอบใน `KanbanDigestSent` (unique ที่ DB) ⇒ cron ซ้อน/รันซ้ำ = ไม่ส่งซ้ำ
 * - ไม่มีรายการจะบอก = ไม่ส่ง และ **ไม่สร้างแถวหลักฐาน** (วันนั้นไม่นับ — พรุ่งนี้มีของก็ส่งได้ตามปกติ)
 */
export async function sweepKanbanDigest(now: Date = new Date(), deps?: DigestDeps): Promise<number> {
  const send = await resolveSender(deps);
  if (!send) return 0;

  const nowMs = now.getTime();
  const isMonday = bkkWeekday(nowMs) === 1;
  const dailyKey = `daily:${bkkDateStr(nowMs)}`;
  const weeklyKey = `weekly:${bkkDateStr(bkkWeekStartMs(nowMs))}`;

  const memberships = await prisma.membership.findMany({
    where: { acceptedAt: { not: null } },
    select: { tenantId: true, userId: true, role: true, unitAccess: true, permissions: true },
  });

  const { getUserPreferences } = await import("@/lib/core/user-preferences");
  const brandCache = new Map<string, string>();
  const prefsCache = new Map<string, Awaited<ReturnType<typeof getUserPreferences>>>();
  let sent = 0;

  for (const m of memberships) {
    const actor = toActor(m.userId, m);
    if (!canReadKanban(actor)) continue;

    let prefs = prefsCache.get(m.userId);
    if (!prefs) {
      prefs = await getUserPreferences(m.userId);
      prefsCache.set(m.userId, prefs);
    }
    if (prefs.kanbanDigest === "OFF") continue;
    if (prefs.kanbanDigest === "WEEKLY" && !isMonday) continue;
    const periodKey = prefs.kanbanDigest === "WEEKLY" ? weeklyKey : dailyKey;

    const already = await prisma.kanbanDigestSent.findFirst({
      where: { tenantId: m.tenantId, userId: m.userId, periodKey },
      select: { id: true },
    });
    if (already) continue;

    const sinceMs = nowMs - (prefs.kanbanDigest === "WEEKLY" ? 7 * DAY_MS : DAY_MS);
    const content = await buildDigest(m.tenantId, actor, nowMs, sinceMs);
    if (isEmptyDigest(content)) continue;

    const user = await prisma.user.findUnique({ where: { id: m.userId }, select: { email: true } });
    if (!user?.email) continue;
    const brand = await displayNameOf(m.tenantId, brandCache);
    const subject = `[${brand}] สรุปงานวันนี้ · เลยกำหนด ${content.overdue.length} · วันนี้ ${content.today.length}`;
    try {
      // สร้างหลักฐานก่อนส่ง: unique ที่ DB คือด่านกันซ้ำจริงเมื่อ cron ซ้อนกัน (ชนะได้แค่ตัวเดียว)
      await prisma.kanbanDigestSent.create({ data: { tenantId: m.tenantId, userId: m.userId, periodKey } });
    } catch {
      continue; // มีคนอื่นส่งรอบนี้ไปแล้ว
    }
    try {
      await send(user.email, subject, renderDigest(content));
      sent++;
    } catch {
      // ส่งล้ม = คงแถวหลักฐานไว้ (ยอมพลาด 1 รอบ ดีกว่ายิงซ้ำทุกครั้งที่ cron วิ่ง)
    }
  }
  return sent;
}
