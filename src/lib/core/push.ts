// push.ts — ส่ง push notification เข้าเครื่องมือถือของ tenant (Expo push · Phase 2)
// 🔴 PushDevice เป็น global axis → เขียน prisma ตรงได้
// best-effort เหมือน email.ts: ห้าม throw · ส่งพลาด → logOps("ERROR","push",...) แล้วคืน sent เท่าที่ได้
//   transport ฉีดได้ (deps.post) เพื่อทดสอบ · default = ยิง Expo push API จริง

import { prisma } from "@/lib/core/db";
import {
  selectChatNotifyRecipients,
  toChatNotifyMember,
  VIEWING_WINDOW_MS,
} from "@/lib/modules/chat/notify";

type PushMsg = { title: string; body: string; data?: Record<string, unknown> };
type PushDeps = { post?: (payloads: unknown[]) => Promise<unknown[]> };

const CHUNK = 100; // Expo push API รับได้ ≤100/ครั้ง

// ticket จาก Expo — เราสนแค่ status + details.error (DeviceNotRegistered = token ตาย)
// `message` = คำอธิบายจาก Expo ตอน status=error (เช่น "Could not find APNs credentials for …")
// ต้องมีในชนิดข้อมูล ไม่งั้นเหตุผลจริงของความล้มเหลวถูกทิ้งตั้งแต่ชั้นชนิดข้อมูล
type Ticket = { status?: string; message?: string; details?: { error?: string } };

// default transport — ยิง Expo push API จริง (POST JSON array) → คืน data (array of tickets)
async function expoPost(payloads: unknown[]): Promise<unknown[]> {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payloads),
  });
  const json = (await res.json()) as { data?: unknown[] };
  return Array.isArray(json.data) ? json.data : [];
}

/**
 * ส่ง 1 chunk แล้วอ่าน ticket — **จุดเดียวในระบบที่ตัดสินว่า "ส่งสำเร็จ" แปลว่าอะไร**
 *
 * 🔴 29 ส.ค. 2026 — เดิมนับ `sent += 1` ให้ **ทุกใบที่ไม่ใช่ DeviceNotRegistered**
 *    รวมใบที่ Expo ตอบ `status:"error"` ด้วยเหตุอื่น ⇒ คืน `{sent:1}` ทั้งที่ไม่มีอะไรถึงเครื่องเลย
 *    ของจริงที่เจอ: `InvalidCredentials — Could not find APNs credentials for th.in.shark.ai`
 *    (แอปยังไม่มีใบรับรอง push ของ Apple) · เจ้าของแจ้งว่าไม่ได้รับแจ้งเตือน แต่ระบบรายงานว่า
 *    ส่งสำเร็จมาตลอด ⇒ **ตัวเลขที่โกหกแพงกว่าไม่มีตัวเลข** เพราะมันปิดทางสงสัย
 *    ⇒ นับเฉพาะ `status === "ok"` · error อื่นต้องถูกส่งกลับไป logOps ไม่ใช่กลืนเงียบ
 *
 * ⚠️ `sent` ยังแปลว่า "Expo **รับไว้แล้ว**" ไม่ใช่ "ถึงเครื่องแล้ว" (ต้องดู receipt อีกชั้น)
 * ⚠️ ฟังก์ชันนี้ throw ต่อได้ (เน็ตพัง/Expo ล่ม) — ผู้เรียกต้องดักเองแล้ว log
 */
async function deliverBatch(
  batch: { expoToken: string }[],
  msg: PushMsg,
  post: (payloads: unknown[]) => Promise<unknown[]>,
): Promise<{ sent: number; dead: string[]; failures: string[] }> {
  const payloads = batch.map((d) => ({
    to: d.expoToken,
    title: msg.title,
    body: msg.body,
    data: msg.data,
    sound: "default",
  }));
  const tickets = (await post(payloads)) as Ticket[];
  const dead: string[] = []; // token ที่ตาย → ลบทิ้ง
  const failures: string[] = [];
  let sent = 0;
  batch.forEach((d, idx) => {
    const t = tickets[idx];
    if (t?.status === "error" && t.details?.error === "DeviceNotRegistered") {
      dead.push(d.expoToken);
    } else if (t?.status === "ok") {
      sent += 1;
    } else {
      failures.push(`${t?.details?.error ?? t?.status ?? "unknown"}: ${t?.message ?? ""}`.slice(0, 160));
    }
  });
  return { sent, dead, failures };
}

/** log แบบไม่พาใครพัง — import แบบ dynamic เหมือนเดิมเพื่อไม่ผูก push.ts เข้ากับ ops ตอนโหลด */
async function logPushError(message: string, detail: string, tenantId: string): Promise<void> {
  try {
    const { logOps } = await import("@/lib/core/ops");
    await logOps("ERROR", "push", message, { detail: detail.slice(0, 500), tenantId }).catch(() => {});
  } catch {
    // ops เองพัง → เงียบ (ห้ามพา flow หลักล้ม)
  }
}

/**
 * ส่ง push เข้าทุกเครื่องของ tenant — best-effort ห้าม throw
 * แบ่ง chunk ≤100 · ticket DeviceNotRegistered → ลบ PushDevice ของ token นั้น (จับคู่ตาม index)
 * ไม่มีเครื่อง → {sent:0} · ส่งพลาด/เน็ตพัง → logOps แล้วคืน sent เท่าที่ส่งได้
 */
export async function sendPushToTenant(
  tenantId: string,
  msg: PushMsg,
  deps?: PushDeps,
): Promise<{ sent: number }> {
  const post = deps?.post ?? expoPost;
  let sent = 0;
  try {
    const devices = await prisma.pushDevice.findMany({ where: { tenantId } });
    if (devices.length === 0) return { sent: 0 };

    for (let i = 0; i < devices.length; i += CHUNK) {
      const batch = devices.slice(i, i + CHUNK);
      try {
        const r = await deliverBatch(batch, msg, post);
        sent += r.sent;
        if (r.failures.length > 0) {
          await logPushError(
            `Expo ปฏิเสธ ${r.failures.length} ใบ (tenant ${tenantId})`,
            r.failures.slice(0, 5).join(" · "),
            tenantId,
          );
        }
        if (r.dead.length > 0) {
          await prisma.pushDevice.deleteMany({ where: { expoToken: { in: r.dead } } });
        }
      } catch (e) {
        // chunk นี้ส่งพลาด (เน็ตพัง/Expo ล่ม) → log แล้วไปต่อ chunk ถัดไป
        await logPushError(`ส่ง push ล้มเหลว (tenant ${tenantId})`, String(e), tenantId);
      }
    }
  } catch (e) {
    // อ่านเครื่อง/อื่น ๆ พัง → log เงียบ ไม่พา flow หลักพัง
    await logPushError(`push พัง (tenant ${tenantId})`, String(e), tenantId);
  }
  return { sent };
}

/**
 * ส่ง push ของ **กล่องแชทลูกค้า** เข้าเฉพาะเครื่องของคนที่ควรได้รับ (WO-CW5 · ปิด G9)
 *
 * 🔴 ต่างจาก `sendPushToTenant` ตรงที่ **ไม่ยิงทุกเครื่องในร้าน**:
 *    ตัวอย่างข้อความลูกค้าจะเด้งบนจอล็อกของมือถือ ⇒ คนที่ไม่มีสิทธิ์อ่านแชทต้องไม่ได้รับ
 *    (ซ่อนเมนูอย่างเดียวแก้ไม่ได้ — ต้องตัดที่ต้นทางของการส่ง)
 *
 * ผู้รับตัดสินโดย `selectChatNotifyRecipients()` ใน `chat/notify.ts` (pure · ข้อสอบยิงตรงได้):
 *   • ต้องมี `chat.conversation.read` จริงตาม `evaluate()` + เข้าถึง unit ของเธรดได้
 *   • ผู้รับผิดชอบเธรด (assignee) ขึ้นหัวคิวส่ง
 *   • คนที่กำลังเปิดห้องนั้นอยู่ (`ChatReadState.lastReadAt` สด) ถูกตัดออก
 *
 * ตัวเลขที่คืน — **ห้ามโกหก** (บทเรียน 29 ส.ค.):
 *   `sent`    = จำนวนใบที่ Expo ตอบ `status:"ok"` เท่านั้น
 *   `skipped` = เครื่องที่เหลือทั้งหมดของร้านที่ "ไม่ได้รับ" — ทั้งที่ถูกตัดด้วยสิทธิ์/กำลังเปิดห้องอยู่
 *               และที่ยิงไปแล้ว Expo ปฏิเสธ (รวม token ตายที่ถูกลบทิ้ง)
 *   ⇒ `sent + skipped` = จำนวนเครื่องทั้งหมดของร้านเสมอ (ยกเว้นตอนอ่านเครื่องไม่ได้ = 0/0)
 *
 * 🔴 ห้าม throw ทุกกรณี · ต้องเรียกจาก **นอกทรานแซกชัน** เท่านั้น (network call ขัง Neon pool)
 */
export async function sendPushToChatStaff(args: {
  tenantId: string;
  systemId: string;
  conversationId: string;
  assigneeUserId?: string | null;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<{ sent: number; skipped: number }> {
  const { tenantId, systemId, conversationId } = args;
  let sent = 0;
  let skipped = 0;
  try {
    // ร้านที่ยังไม่มีใครลงแอป → ไม่ต้องอ่านอะไรต่อ ไม่ยิง HTTP ทิ้งเปล่า
    const devices = await prisma.pushDevice.findMany({ where: { tenantId } });
    if (devices.length === 0) return { sent: 0, skipped: 0 };

    const [conv, memberRows, readerRows] = await Promise.all([
      prisma.chatConversation.findUnique({
        where: { id: conversationId },
        select: { unitId: true, assigneeUserId: true },
      }),
      // คนที่ถูกถอนสิทธิ์ (acceptedAt=null) ไม่ใช่สมาชิกที่ใช้งานอยู่ — ตรงกับด่านใน core/context.ts
      prisma.membership.findMany({
        where: { tenantId, acceptedAt: { not: null } },
        select: { userId: true, role: true, unitAccess: true, permissions: true },
      }),
      // อ่านเฉพาะ read state ที่ยังสด — ถ้าเก่ากว่าหน้าต่างก็แปลว่าไม่ได้เปิดค้างอยู่แล้ว
      prisma.chatReadState.findMany({
        where: { conversationId, lastReadAt: { gte: new Date(Date.now() - VIEWING_WINDOW_MS) } },
        select: { userId: true, lastReadAt: true },
      }),
    ]);

    const recipientUserIds = selectChatNotifyRecipients({
      members: memberRows.map(toChatNotifyMember),
      unitId: conv?.unitId ?? null,
      // ผู้เรียกรู้ค่าล่าสุดกว่าเสมอ (เพิ่ง assign ในทรานแซกชันเดียวกัน) → ให้ค่าที่ส่งมาชนะ
      assigneeUserId: args.assigneeUserId ?? conv?.assigneeUserId ?? null,
      readers: readerRows,
    });

    // เรียงเครื่องตามลำดับผู้รับ — ผู้รับผิดชอบต้องได้ก่อนคนอื่นจริง ๆ ในคิวส่ง
    const rank = new Map(recipientUserIds.map((u, i) => [u, i]));
    const targets = devices
      .filter((d) => rank.has(d.userId))
      .sort((a, b) => (rank.get(a.userId) ?? 0) - (rank.get(b.userId) ?? 0));
    skipped += devices.length - targets.length;
    if (targets.length === 0) return { sent: 0, skipped };

    const msg: PushMsg = { title: args.title, body: args.body, data: args.data };
    for (let i = 0; i < targets.length; i += CHUNK) {
      const batch = targets.slice(i, i + CHUNK);
      try {
        const r = await deliverBatch(batch, msg, expoPost);
        sent += r.sent;
        skipped += batch.length - r.sent;
        if (r.failures.length > 0) {
          await logPushError(
            `Expo ปฏิเสธ ${r.failures.length} ใบ (แชท ${systemId}/${conversationId})`,
            r.failures.slice(0, 5).join(" · "),
            tenantId,
          );
        }
        if (r.dead.length > 0) {
          await prisma.pushDevice.deleteMany({ where: { expoToken: { in: r.dead } } });
        }
      } catch (e) {
        skipped += batch.length;
        await logPushError(
          `ส่ง push แชทล้มเหลว (แชท ${systemId}/${conversationId})`,
          String(e),
          tenantId,
        );
      }
    }
  } catch (e) {
    // อ่านสมาชิก/สิทธิ์/เครื่องพัง → log แล้วเงียบ · ข้อความลูกค้าถูกบันทึกไปแล้วก่อนถึงตรงนี้
    await logPushError(`push แชทพัง (แชท ${systemId}/${conversationId})`, String(e), tenantId);
  }
  return { sent, skipped };
}
