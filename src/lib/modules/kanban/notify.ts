// notify.ts — ตัวช่วยกลางของการแจ้งเตือนโมดูล "บอร์ดงาน" (พิมพ์เขียว §5.6/§7.4 · D5)
//
// 🔴 กติกาเหล็ก: ทุกใบเขียน `AppNotification.recipientUserId` เสมอ
//    ของเดิม (ก่อน K1.1) เขียนเป็นประกาศทั้งร้าน (recipientUserId = null) ⇒ ใครก็ตามที่เข้าแอปของร้านได้
//    เปิด /app/notifications แล้วเห็นชื่องาน+ชื่อบอร์ดของคนอื่นหมด (บั๊กความเป็นส่วนตัว)
// 🔴 K1.8: push ก็ต้อง "ยิงรายคน" ด้วย (`sendPushToUser`) — ยิงทั้งร้านคือช่องโหว่เดียวกันบนจอล็อกมือถือ
//
// ช่องทางตาม D5 = ในแอป (AppNotification) + push รายคน + อีเมล (เฉพาะเมื่อเสียบ RESEND แล้ว)
// ทุกช่องทางที่ "ออกนอกเครื่อง" (push/อีเมล) เป็น best-effort: ล้มแล้วต้องไม่ทำให้งานหลักล้มตาม
// และต้องเรียกจาก **นอกทรานแซกชัน** เสมอ (network call ขัง Neon pool)
//
// ย้ายออกมาจาก service.ts ใน K1.2 เพื่อให้ `cards.ts` เรียกได้โดยไม่เกิด import วงกลม
// (service.ts re-export `setCardAssignees` จาก cards.ts · cards.ts จึงห้าม import service.ts)

import { emitOutbox } from "@/lib/core/outbox";
import { sendPushToUsers } from "@/lib/core/push";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { prisma } from "./db";

/** ลิงก์ลึกไปหลังการ์ดใบนั้นโดยตรง (หน้าบอร์ดอ่าน `?card=` แล้วเปิดหลังการ์ดให้เลย · K1.6) */
export function cardLink(systemId: string, boardId: string, cardId: string): string {
  return `/app/sys/${systemId}/kanban/b/${boardId}?card=${cardId}`;
}

export type KanbanNotifyInput = {
  tenantId: string;
  systemId: string;
  /** ผู้รับ 1 คน — ห้ามเป็น null (ประกาศทั้งร้านไม่ใช่ธุรกิจของโมดูลนี้) */
  recipientUserId: string;
  title: string;
  body: string;
  /** payload ของ push (แอปมือถือใช้เปิดหน้าตรง) */
  data?: Record<string, string>;
  /** ส่งอีเมลด้วยไหม — ส่งจริงเฉพาะเมื่อ `RESEND_API_KEY` ถูกตั้งค่าแล้วเท่านั้น */
  email?: boolean;
  /**
   * K2.11 — ยิง push ด้วยไหม (ค่าเริ่มต้น = ยิง)
   * ตาราง §7.4 ให้ push เฉพาะเรื่องที่ "ต้องรู้เดี๋ยวนี้" (ความเห็นใหม่ · ถูก mention · ได้รับมอบหมาย)
   * ส่วนการ์ดที่ติดตามถูกย้าย/เก็บ/เลยกำหนด = ในแอปอย่างเดียว (ไม่ปลุกจอล็อกของทั้งทีมทุกครั้งที่มีคนลากการ์ด)
   */
  push?: boolean;
  /**
   * K2.11 — ประทับ `emailedAt` ตอนสร้างเลย (ไม่ส่งมา = คิดจาก `email`)
   * `null` ชัด ๆ = "ยังไม่ส่ง ปล่อยให้รอบสรุปรายชั่วโมงเก็บ" · มีค่า = "จบเรื่องอีเมลของใบนี้แล้ว"
   * (ทั้งกรณีส่งทันที INSTANT และกรณี OFF ที่ตั้งใจไม่ส่ง — ทั้งคู่ต้องไม่ถูก sweep หยิบไปส่งซ้ำ)
   */
  emailedAt?: Date | null;
};

/**
 * เขียนใบในแอป + อีเมลของ **คนเดียว** — ไม่ยิง push (ตัวเรียกรวบ push ไว้ยิงครั้งเดียวท้ายรอบ)
 *
 * ในแอป = ต้องสำเร็จ (โยนต่อถ้าเขียนไม่ได้ — ผู้เรียกรู้ว่าแจ้งไม่ถึง)
 * อีเมล = best-effort (ล้มแล้วกลืน ไม่พางานหลักล้ม · ตัวส่งเองก็ log ให้แล้ว)
 */
async function deliverInAppAndEmail(input: KanbanNotifyInput): Promise<void> {
  await prisma.appNotification.create({
    data: {
      tenantId: input.tenantId,
      recipientUserId: input.recipientUserId,
      title: input.title,
      body: input.body,
      // K2.11: ใบที่ "จัดการเรื่องอีเมลแล้ว" (ส่งทันที หรือเจ้าตัวปิดอีเมลไว้) ต้องไม่ถูกรอบสรุปหยิบซ้ำ
      emailedAt: input.emailedAt !== undefined ? input.emailedAt : input.email ? new Date() : null,
    },
  });

  if (input.email) {
    try {
      // 🔴 โหลด env/email แบบ lazy — import static ทำให้ทุกที่ที่ import โมดูล kanban (รวม fitness F10.1 / AI tools) ต้องมี env ครบ
      const { emailEnabled } = await import("@/lib/env");
      if (!emailEnabled) return;
      const { sendEmail } = await import("@/lib/core/email");
      // B4: หัวเรื่องขึ้นต้นด้วยชื่อกิจการ — ผู้ใช้หลายร้านแยกอีเมลออกจากกันได้ในกล่องจดหมายเดียว
      const { getBrandingTokens } = await import("@/lib/branding/service");
      const [user, tokens] = await Promise.all([
        prisma.user.findUnique({
          where: { id: input.recipientUserId },
          select: { email: true },
        }),
        getBrandingTokens(input.tenantId),
      ]);
      if (user?.email) {
        await sendEmail(user.email, `[${tokens.displayName}] ${input.title}`, input.body);
      }
    } catch {
      // อีเมลเป็นช่องทางเสริม — ล้มแล้วเงียบ (sendEmail ลง OpsEvent ให้เองเมื่อ Resend ตอบไม่ ok)
    }
  }
}

export type KanbanNotifyManyInput = Omit<KanbanNotifyInput, "recipientUserId" | "email" | "emailedAt"> & {
  /** ผู้รับทั้งหมดของเรื่องเดียวกัน (ซ้ำ/ว่างได้ — ตัวนี้จัดการให้) */
  recipientUserIds: string[];
  /**
   * อ่าน "ความถี่อีเมล" ของแต่ละคนเอง (K2.11) แทนการสั่งจากผู้เรียก
   * `true` = INSTANT ส่งทันที · HOURLY ปล่อยให้รอบสรุปเก็บ · OFF ไม่ส่งแต่ประทับ `emailedAt`
   */
  byPreference?: boolean;
  /** ไม่ใช้ prefs: สั่งตรงว่าส่งอีเมลไหม (ผู้เรียกเดิมของ `notifyKanbanUser`) */
  email?: boolean;
  emailedAt?: Date | null;
};

/**
 * 🔴 **จุดเดียว** ที่โมดูลนี้แจ้งเตือนคน — ผู้รับ 1 คนหรือ 50 คนก็เดินทางเดียวกัน (K3.9)
 *
 * ทำไมต้องรวบ: ก่อน K3.9 ผู้เรียกที่มีผู้รับหลายคน (ผู้ติดตามการ์ด · เตือนกำหนดส่ง · กฎ "แจ้งผู้ดูแลบอร์ด")
 * วน `notifyKanbanUser` ทีละคน ซึ่งข้างในยิง `sendPushToUser` ⇒ **1 คิวรี + 1 รอบ HTTP ต่อคน**
 * ทั้งที่ Expo รับได้ 100 ใบต่อรอบ · บน cron ที่กวาดการ์ดทีละ 200 ใบ นี่คือที่มาของ connection ค้างใน pool
 * ⇒ ที่นี่: เขียนใบในแอป/อีเมลทีละคน (ต้องเคารพ prefs รายคน) แล้ว **ยิง push ครั้งเดียว** ท้ายรอบ
 *
 * ⚠️ ต้องเรียกจาก **นอกทรานแซกชัน** เสมอ (อ่าน prefs/ยิงอีเมล/ยิง push = network)
 * `strict` = โยน error ของใบในแอปต่อ (ผู้เรียกที่มีผู้รับคนเดียวต้องรู้ว่าแจ้งไม่ถึง) ·
 * ไม่ strict = คนหนึ่งพังไม่ลามไปตัดคนที่เหลือ
 */
export async function notifyKanbanUsers(
  input: KanbanNotifyManyInput & { strict?: boolean },
): Promise<{ notified: number; pushed: number }> {
  const targets = [...new Set(input.recipientUserIds.filter(Boolean))];
  if (targets.length === 0) return { notified: 0, pushed: 0 };

  const { getUserPreferences } = input.byPreference
    ? await import("@/lib/core/user-preferences")
    : { getUserPreferences: null };

  let notified = 0;
  for (const recipientUserId of targets) {
    // ความถี่อีเมลเป็นค่าของ "คน" (ข้ามร้าน) ⇒ อ่านต่อคน ผู้เรียกไม่ต้องรู้เรื่อง prefs เอง
    let email = input.email ?? false;
    let emailedAt = input.emailedAt;
    if (getUserPreferences) {
      const mode = (await getUserPreferences(recipientUserId)).kanbanEmailMode;
      email = mode === "INSTANT";
      emailedAt = mode === "HOURLY" ? null : new Date();
    }
    try {
      await deliverInAppAndEmail({ ...input, recipientUserId, email, emailedAt });
      notified++;
    } catch (e) {
      if (input.strict) throw e;
      // ใบในแอปของคนหนึ่งเขียนไม่ได้ ไม่ใช่เหตุให้คนที่เหลือไม่ได้รับ
    }
  }

  // push = ตาราง §7.4 (ไม่ส่ง = ยังได้ใบในแอปเหมือนเดิม แค่ไม่ปลุกจอล็อก)
  let pushed = 0;
  if (input.push !== false) {
    try {
      const res = await sendPushToUsers(
        input.tenantId,
        targets,
        { title: input.title, body: input.body, data: input.data },
      );
      pushed = res.sent;
    } catch {
      // ตัวส่ง push กลืน error ของตัวเองอยู่แล้ว — ด่านนี้กันแค่กรณี import/โค้ดพัง
    }
  }
  return { notified, pushed };
}

/**
 * แจ้งเตือน "คนเดียว" ครบทุกช่องทาง — เปลือกบางของ `notifyKanbanUsers` (ผู้เรียกเดิมไม่ต้องแก้)
 * ใบในแอปเขียนไม่ได้ = โยนต่อเหมือนเดิม (`strict`)
 */
export async function notifyKanbanUser(input: KanbanNotifyInput): Promise<void> {
  await notifyKanbanUsers({ ...input, recipientUserIds: [input.recipientUserId], strict: true });
}

/**
 * แจ้ง "ได้รับมอบหมายงาน" ให้ผู้รับ 1 คน + ยิง outbox `kanban.card.assigned`
 *
 * idempotencyKey ของ outbox = `kanban.assign.<cardId>.<userId>` ⇒ มอบหมายคนเดิมซ้ำ (ถอดแล้วใส่กลับ)
 * จะไม่เพิ่ม event ใหม่ (emitOutbox เช็คก่อนสร้าง แล้วเงียบ) แต่ **แจ้งเตือนในแอปยังออกทุกครั้งที่เพิ่งถูกเพิ่ม**
 * — ตั้งใจ: คนถูกถอดออกแล้วใส่กลับต้องรู้ตัว ส่วน event ฝั่งระบบไม่ควรวิ่งซ้ำ
 *
 * K1.8: ตัวนี้เดินผ่าน `notifyKanbanUser` แล้ว ⇒ ได้ push รายคน + อีเมลไปด้วยโดยไม่ต้องแก้ผู้เรียก
 */
export async function notifyCardAssigned(
  tenantId: string,
  systemId: string,
  card: { id: string; title: string; boardId: string },
  assigneeUserId: string,
): Promise<void> {
  const [board, membership] = await Promise.all([
    prisma.kanbanBoard.findFirst({ where: { id: card.boardId, tenantId }, select: { name: true } }),
    prisma.membership.findFirst({ where: { tenantId, userId: assigneeUserId }, include: { user: true } }),
  ]);
  const who = membership?.user.name ?? membership?.user.email ?? "พนักงาน";
  const link = cardLink(systemId, card.boardId, card.id);
  await prisma.$transaction(async (tx) => {
    await emitOutbox(tx, {
      tenantId,
      type: "kanban.card.assigned",
      idempotencyKey: `kanban.assign.${card.id}.${assigneeUserId}`,
      payload: { cardId: card.id, boardId: card.boardId, assigneeUserId },
      systemId,
    });
  });
  await notifyKanbanUser({
    tenantId,
    systemId,
    recipientUserId: assigneeUserId,
    title: "ได้รับมอบหมายงาน",
    body: `${who}: "${card.title}"${board ? ` · บอร์ด ${board.name}` : ""} · ดูงาน ${link}`,
    data: { cardId: card.id, boardId: card.boardId, systemId },
  });
  scheduleDrain();
}

// ───────────────────────── K2.11: ผู้ติดตาม (§7.4) ─────────────────────────

/** เรื่องที่ส่งถึงผู้ติดตามได้ — คนละคอลัมน์ในตาราง §7.4 (push เฉพาะ COMMENT) */
export type WatcherNotifyKind = "COMMENT" | "MOVED" | "ARCHIVED";

/**
 * ส่งแจ้งเตือน 1 ใบให้ 1 คน โดยเคารพ "ความถี่อีเมล" ที่เจ้าตัวตั้งไว้ (K2.11)
 * - `INSTANT` → ส่งอีเมลทันที + ประทับ `emailedAt` (จบเรื่องใบนี้)
 * - `HOURLY`  → ไม่ส่งตอนนี้ · `emailedAt = null` ให้ `digest.sweepKanbanEmailHourly` รวมส่งเป็นฉบับเดียว
 * - `OFF`     → ไม่ส่ง แต่ประทับ `emailedAt` ไว้ (ไม่งั้นรอบสรุปจะมาเก็บไปส่งทีหลัง = ปิดไม่จริง)
 * 🔴 อ่าน prefs ต่อคน (ค่าเป็นของ **คน** ข้ามร้าน) — ผู้เรียกวนหลายคนได้ ไม่ต้องรู้เรื่อง prefs เอง
 */
export async function notifyKanbanUserByPreference(
  input: KanbanNotifyInput & { push?: boolean },
): Promise<void> {
  await notifyKanbanUsers({ ...input, recipientUserIds: [input.recipientUserId], byPreference: true });
}

/**
 * แจ้ง "ผู้ติดตามการ์ด" ทุกคน (ยกเว้นคนทำเอง และคนที่ได้ใบอื่นของเรื่องเดียวกันไปแล้ว)
 *
 * 🔴 `excludeUserIds` มีไว้กัน "ใบซ้ำเรื่องเดียว": คนที่ถูก @mention ในความเห็นได้ใบ mention ไปแล้ว
 *    ⇒ ต้องไม่ได้ใบ "มีความเห็นใหม่ในการ์ดที่คุณติดตาม" อีกใบจากเรื่องเดียวกัน
 * 🔴 best-effort ทั้งก้อน: ล้มแล้วห้ามพางานหลัก (เขียนความเห็น/ย้ายการ์ด/เก็บการ์ด) ล้มตาม
 *    และต้องเรียก **นอกทรานแซกชัน** เสมอ (ยิง push/อีเมล/อ่าน prefs = network)
 */
export async function notifyWatchers(
  ctx: { tenantId: string; systemId: string },
  args: {
    cardId: string;
    kind: WatcherNotifyKind;
    actorUserId?: string | null;
    excludeUserIds?: string[];
    title: string;
    body: string;
  },
): Promise<number> {
  try {
    const { notifiableWatchersForCard } = await import("./watch");
    const all = await notifiableWatchersForCard(ctx as { tenantId: string; systemId: string }, args.cardId);
    const skip = new Set([...(args.excludeUserIds ?? []), ...(args.actorUserId ? [args.actorUserId] : [])]);
    const targets = all.filter((u) => !skip.has(u));
    if (targets.length === 0) return 0;
    const card = await prisma.kanbanCard.findFirst({
      where: { id: args.cardId, tenantId: ctx.tenantId },
      select: { boardId: true },
    });
    const data: Record<string, string> = { cardId: args.cardId, systemId: ctx.systemId };
    if (card) data.boardId = card.boardId;
    // K3.9: ผู้ติดตามทั้งกลุ่มเดินทางเดียว — ใบในแอป/อีเมลรายคน (เคารพความถี่ของแต่ละคน)
    //       แล้ว push **ครั้งเดียว** ให้ทุกคนที่ควรได้ (เดิมวนยิงทีละคน)
    await notifyKanbanUsers({
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      recipientUserIds: targets,
      title: args.title,
      body: args.body,
      data,
      byPreference: true,
      // §7.4: push เฉพาะ "ความเห็นใหม่" — การ์ดถูกย้าย/เก็บ = ในแอปพอ
      push: args.kind === "COMMENT",
    }).catch(() => ({ notified: 0, pushed: 0 }));
    return targets.length;
  } catch {
    // ผู้ติดตามเป็นช่องทางเสริม — ล้มแล้วเงียบ (งานหลัก commit ไปแล้ว)
    return 0;
  }
}

/** ตัดข้อความยาว (เนื้อความเห็น) ให้เหลือ ≤ n ตัวอักษร — ห้ามยัดความเห็นเต็มลงอีเมล/แจ้งเตือน (§7.4) */
export function shortenForNotice(text: string, max = 80): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max - 1)}…`;
}
