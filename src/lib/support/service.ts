// Support Desk — ฝั่งร้าน (WO-0021 + help-v2) · tenant-scoped ทั้งหมดผ่าน tenantDb
// ปุ่มช่วยเหลือในแอปร้าน: เปิดเคส/ดูเคสของตัวเอง/คุยต่อ + แนบไฟล์ + เลขเคส + badge unread
// ทุก query ผ่าน tenantDb({ tenantId }) → inject tenantId อัตโนมัติ (kernel guard)
// เคสข้ามร้าน = มองไม่เห็น/แก้ไม่ได้ (findUnique คืน null · list คืน [])

import { Prisma } from "@prisma/client";
import type { Role, SupportCase, SupportMessage } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { currentToolCallKey, toolCallRowId } from "@/lib/ai/tool-call-key"; // SEC S3a.1-S1 R-Z7

type Ctx = { tenantId: string };

// ไฟล์แนบในข้อความ (รูป/ไฟล์) — เก็บใน SupportMessage.attachmentsJson
export type Attachment = { name: string; url: string; kind: "image" | "file" };

// การ์ดเคส + meta สำหรับ HelpSheet (เลขเคส + สถานะ + จำนวนยังไม่อ่าน)
export type CaseMeta = {
  id: string;
  caseNo: number;
  subject: string;
  status: SupportCase["status"];
  updatedAt: Date;
  unreadCount: number;
};

// ── กติกาไฟล์แนบ (บังคับฝั่ง server — UI จำกัดไว้แล้วแต่ client แก้ได้) ──
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_URL_LEN = 3_000_000; // ~2MB base64 + หัว data URL
// อนุญาตเฉพาะรูป data URL กับลิงก์ http(s) — กัน javascript:/vbscript:/data:text/html
// (url นี้ถูกเอาไป render เป็น href/src ตรง ๆ ใน HelpSheet → scheme อันตราย = stored XSS)
const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|heic|heif);base64,[A-Za-z0-9+/=]+$/i;
function isSafeAttachmentUrl(u: string): boolean {
  if (SAFE_DATA_IMAGE.test(u)) return true;
  try {
    const p = new URL(u).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

// sanitize attachments จาก client → เก็บเฉพาะ field ที่ต้องการ + ตรวจ scheme/ขนาด/จำนวน
function cleanAttachments(attachments?: Attachment[]): Attachment[] {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter(
      (a) =>
        a &&
        typeof a.url === "string" &&
        a.url.length > 0 &&
        a.url.length <= MAX_ATTACHMENT_URL_LEN &&
        isSafeAttachmentUrl(a.url),
    )
    .slice(0, MAX_ATTACHMENTS)
    .map((a) => ({
      name: String(a.name ?? "ไฟล์แนบ").slice(0, 200),
      url: String(a.url),
      kind: a.kind === "image" ? "image" : "file",
    }));
}

// เปิดเคสใหม่ (สถานะ OPEN) + ข้อความแรกฝั่งร้าน (SHOP) + ไฟล์แนบ (ถ้ามี)
//   caseNo = running ต่อ tenant เริ่ม 1 — race-safe: นับ count+1 แล้วสร้าง
//   ถ้าชน @@unique[tenantId, caseNo] (P2002 คนอื่นเพิ่งเปิดเคสพร้อมกัน) → นับใหม่ retry
//   (ไม่ใช้ counter table / upsert — กติกาเดียวกับ createPo ใน procurement.ts)
export async function createCase(
  ctx: Ctx,
  input: { userId: string; subject: string; body: string; attachments?: Attachment[]; id?: string },
): Promise<{ id: string; caseNo: number }> {
  const db = tenantDb(ctx);
  const attachments = cleanAttachments(input.attachments);

  for (let attempt = 0; attempt < 6; attempt++) {
    const count = await db.supportCase.count();
    const caseNo = count + 1;
    try {
      const c = await db.$transaction(async (tx) => {
        const created = await tx.supportCase.create({
          data: {
            ...(input.id ? { id: input.id } : {}), // SEC S3a.1-S1 R-Z7: รหัสกำหนดได้จากกุญแจ tool call (openCaseFromAi)
            tenantId: ctx.tenantId,
            caseNo,
            openedByUserId: input.userId,
            subject: input.subject,
          },
        });
        await tx.supportMessage.create({
          data: {
            tenantId: ctx.tenantId,
            caseId: created.id,
            authorSide: "SHOP",
            authorId: input.userId,
            body: input.body,
            attachmentsJson: attachments,
          },
        });
        return created;
      });
      return { id: c.id, caseNo: c.caseNo };
    } catch (e) {
      // caseNo ชนกับเคสที่คนอื่นเพิ่งเปิด → นับใหม่แล้วลองอีกครั้ง
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new Error("เปิดเคสไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
}

// help-v2 (mobile): เปิดเคสจากผู้ช่วย AI — ผู้ใช้แจ้งปัญหาในห้องแชท → ผูก conversationId
//   เพื่อ bridge คำตอบแอดมินกลับ session เดิม · reuse createCase (caseNo running race-safe + SHOP msg แรก)
//   แล้วค่อยผูก conversationId — ไม่ทำ caseNo logic ซ้ำ
export async function openCaseFromAi(
  ctx: Ctx,
  input: { userId: string; conversationId: string; subject: string; body: string },
): Promise<{ id: string; caseNo: number }> {
  // SEC S3a.1-S1 ▸ R-Z7: เทิร์นห้องเลขาที่รันซ้ำ (กุญแจ tc:<messageId>:<i>) ⇒ เรื่องเดิม ไม่เปิดเรื่องที่สอง ◂
  const tcKey = currentToolCallKey();
  const fixedId = tcKey ? toolCallRowId("tcase", [ctx.tenantId, input.conversationId, tcKey]) : undefined;
  const existingCase = async () => (fixedId ? tenantDb(ctx).supportCase.findFirst({ where: { id: fixedId }, select: { id: true, caseNo: true } }) : null);
  const had = await existingCase();
  if (had) return had;
  let c: { id: string; caseNo: number };
  try {
    c = await createCase(ctx, { userId: input.userId, subject: input.subject, body: input.body, ...(fixedId ? { id: fixedId } : {}) });
  } catch (e) {
    const raced = await existingCase();
    if (raced) return raced;
    throw e;
  }
  await tenantDb(ctx).supportCase.update({
    where: { id: c.id },
    data: { conversationId: input.conversationId },
  });
  return c;
}

// ── S1.17 (R-K12) ▸ Support Desk ต่อแอป (จอ H1/H2 ของเลขา) ─────────────────────────────────────
//   หมวดของเรื่องที่แจ้ง (ชิปบนจอ H1) · ค่าที่ไม่รู้จัก ⇒ "other" · source = "APP" · ห้องงานที่แนบ = `roomId` (ไม่ใช่ conversationId)
//   ⇒ คำตอบทีมงานไม่ถูกแทรกลงห้องเลขา (ดู platform/support.ts addPlatformMessage) แต่ push ถึงผู้แจ้งด้วย link /help/<caseId>
//   การมองเห็น: ผู้แจ้งเห็นเรื่องของตัวเอง · OWNER เห็นทุกเรื่องของร้าน (รวมเรื่องเดิมที่ผู้ช่วย AI เปิดในนาม "ai-assistant") ◂
export const CASE_CATEGORIES = ["secretary_wrong", "bug", "question", "billing", "feature", "other"] as const;
export type CaseCategory = (typeof CASE_CATEGORIES)[number];

const ROOM_ID_MAX = 191;

/** ผู้ใช้นี้มองเห็นห้องงานนี้ไหม (ผู้เปิดห้อง ∪ สมาชิกห้อง ∪ OWNER ที่รับแล้ว) — ไม่เห็น/ไม่มี/ร้านอื่น = null */
async function visibleRoomFor(ctx: Ctx, userId: string, roomId: unknown): Promise<{ id: string; conversationId: string } | null> {
  const id = typeof roomId === "string" ? roomId.trim().slice(0, ROOM_ID_MAX) : "";
  if (!id || !userId) return null;
  const db = tenantDb(ctx);
  const room = await db.aiRoom.findFirst({
    where: { id },
    select: { id: true, conversationId: true, startedById: true, members: { where: { userId }, select: { id: true }, take: 1 } },
  });
  if (!room) return null;
  if (room.startedById === userId || room.members.length > 0) return { id: room.id, conversationId: room.conversationId };
  // Membership เป็น axis global (scope.ts) ⇒ ใส่ tenantId เอง
  const owner = await prisma.membership.count({ where: { tenantId: ctx.tenantId, userId, role: "OWNER", acceptedAt: { not: null } } });
  return owner > 0 ? { id: room.id, conversationId: room.conversationId } : null;
}

/**
 * เปิดเรื่องจากแอป (จอ H1) — `createCase` เดิม (caseNo race-safe + ข้อความแรก + ไฟล์แนบ) แล้วตั้ง `source="APP"` · หมวด · ห้องที่แนบ
 *   ห้องที่ผู้แจ้งมองไม่เห็น ⇒ ไม่แนบ (roomId null · ไม่บอกว่ามีอยู่) · **ไม่ตั้ง conversationId** (R-K12)
 *   หมวด "secretary_wrong" + ห้อง ⇒ บันทึก 👎 ของห้องนั้นเข้า AiFeedback (best-effort · anonymize ใน recordFeedback · ล้มไม่ throw)
 */
export async function openCaseFromApp(
  ctx: Ctx,
  input: { userId: string; subject: string; body: string; attachments?: Attachment[]; category?: string; roomId?: string | null },
): Promise<{ id: string; caseNo: number }> {
  const category: CaseCategory = (CASE_CATEGORIES as readonly string[]).includes(String(input.category ?? ""))
    ? (input.category as CaseCategory)
    : "other";
  const room = await visibleRoomFor(ctx, input.userId, input.roomId);
  const c = await createCase(ctx, { userId: input.userId, subject: input.subject, body: input.body, attachments: input.attachments });
  await tenantDb(ctx).supportCase.update({
    where: { id: c.id },
    data: { source: "APP", category, roomId: room?.id ?? null },
  });
  if (category === "secretary_wrong" && room) {
    try {
      const { recordFeedback } = await import("@/lib/ai/feedback");
      await recordFeedback(ctx, {
        conversationId: room.conversationId,
        userText: input.subject,
        replyText: input.body,
        rating: "DOWN",
        note: `help:${c.id}`,
      });
    } catch {
      // feedback เป็นของแถม — เรื่องที่แจ้งถูกบันทึกแล้ว
    }
  }
  return c;
}

/** เงื่อนไขเรื่องที่ผู้ใช้นี้เห็น — OWNER ทั้งร้าน · คนอื่นเฉพาะที่ตัวเองเปิด */
function caseScope(userId: string, role: Role): Prisma.SupportCaseWhereInput {
  return role === "OWNER" ? {} : { openedByUserId: userId || "~no-user~" };
}

/** จำนวนข้อความทีมงานที่ยังไม่อ่านต่อเคส (ข้อความ PLATFORM ใหม่กว่า shopLastReadAt) — 1 query */
async function unreadByCaseOf(ctx: Ctx, cases: { id: string; shopLastReadAt: Date | null }[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (cases.length === 0) return out;
  const msgs = await tenantDb(ctx).supportMessage.findMany({
    where: { caseId: { in: cases.map((c) => c.id) }, authorSide: "PLATFORM" },
    select: { caseId: true, createdAt: true },
  });
  const readAtByCase = new Map(cases.map((c) => [c.id, c.shopLastReadAt] as const));
  for (const m of msgs) {
    const readAt = readAtByCase.get(m.caseId);
    if (!readAt || m.createdAt > readAt) out.set(m.caseId, (out.get(m.caseId) ?? 0) + 1);
  }
  return out;
}

/** เรื่องที่ผู้ใช้นี้เห็น + meta (เลขเคส/สถานะ/ยังไม่อ่าน) — เรียงความเคลื่อนไหวล่าสุดก่อน · 2 query */
export async function listCasesForUser(ctx: Ctx, userId: string, role: Role, take = 50): Promise<CaseMeta[]> {
  const n = Math.min(Math.max(Math.floor(Number(take) || 50), 1), 200);
  const cases = await tenantDb(ctx).supportCase.findMany({ where: caseScope(userId, role), orderBy: { updatedAt: "desc" }, take: n });
  const unread = await unreadByCaseOf(ctx, cases);
  return cases.map((c) => ({
    id: c.id,
    caseNo: c.caseNo,
    subject: c.subject,
    status: c.status,
    updatedAt: c.updatedAt,
    unreadCount: unread.get(c.id) ?? 0,
  }));
}

/** ข้อความทีมงานที่ยังไม่อ่านรวมของเรื่องที่ผู้ใช้นี้เห็น (badge) — 2 query */
export async function unreadCaseTotalForUser(ctx: Ctx, userId: string, role: Role): Promise<number> {
  const cases = await tenantDb(ctx).supportCase.findMany({ where: caseScope(userId, role), select: { id: true, shopLastReadAt: true } });
  let total = 0;
  for (const v of (await unreadByCaseOf(ctx, cases)).values()) total += v;
  return total;
}

/** ร้านกด "แก้แล้ว" (การ์ดบนจอ H2) — เฉพาะเรื่องที่ผู้ใช้เห็น ⇒ RESOLVED · ไม่เห็น/ไม่มี/ร้านอื่น = false */
export async function setResolvedByShop(ctx: Ctx, userId: string, role: Role, caseId: string): Promise<boolean> {
  const db = tenantDb(ctx);
  const id = typeof caseId === "string" ? caseId.trim() : "";
  if (!id) return false;
  const found = await db.supportCase.findFirst({ where: { id, ...caseScope(userId, role) }, select: { id: true } });
  if (!found) return false;
  await db.supportCase.update({ where: { id: found.id }, data: { status: "RESOLVED" } });
  return true;
}

// เคสของร้านนี้ (มีความเคลื่อนไหวล่าสุดก่อน)
export async function listMyCases(ctx: Ctx, take = 50): Promise<SupportCase[]> {
  return tenantDb(ctx).supportCase.findMany({ orderBy: { updatedAt: "desc" }, take });
}

// เคส + meta (เลขเคส/สถานะ/จำนวนยังไม่อ่าน) สำหรับการ์ด HelpSheet
//   unreadCount = ข้อความ authorSide PLATFORM ที่ createdAt > shopLastReadAt
//   (shopLastReadAt = null → ยังไม่เคยเปิดอ่าน → นับข้อความ PLATFORM ทั้งหมด)
export async function listMyCasesWithMeta(ctx: Ctx, take = 50): Promise<CaseMeta[]> {
  const db = tenantDb(ctx);
  const cases = await db.supportCase.findMany({ orderBy: { updatedAt: "desc" }, take });
  if (cases.length === 0) return [];
  // แก้ N+1: ดึงข้อความ PLATFORM ของทุกเคสในคิวรีเดียว แล้วนับ unread ต่อเคสใน JS
  // (unread = ข้อความจากทีมงานที่ createdAt > shopLastReadAt ของเคสนั้น) — 2 คิวรีคงที่ไม่ว่ากี่เคส
  const msgs = await db.supportMessage.findMany({
    where: { caseId: { in: cases.map((c) => c.id) }, authorSide: "PLATFORM" },
    select: { caseId: true, createdAt: true },
  });
  const unreadByCase = new Map<string, number>();
  const readAtByCase = new Map(cases.map((c) => [c.id, c.shopLastReadAt] as const));
  for (const m of msgs) {
    const readAt = readAtByCase.get(m.caseId);
    if (!readAt || m.createdAt > readAt) unreadByCase.set(m.caseId, (unreadByCase.get(m.caseId) ?? 0) + 1);
  }
  return cases.map((c) => ({
    id: c.id,
    caseNo: c.caseNo,
    subject: c.subject,
    status: c.status,
    updatedAt: c.updatedAt,
    unreadCount: unreadByCase.get(c.id) ?? 0,
  }));
}

// จำนวนข้อความยังไม่อ่านรวมทุกเคส (สำหรับ badge ปุ่ม help บน Topbar) — คิวรีเดียว
export async function unreadCaseTotal(ctx: Ctx): Promise<number> {
  const db = tenantDb(ctx);
  const cases = await db.supportCase.findMany({ select: { id: true, shopLastReadAt: true } });
  if (cases.length === 0) return 0;
  const msgs = await db.supportMessage.findMany({
    where: { caseId: { in: cases.map((c) => c.id) }, authorSide: "PLATFORM" },
    select: { caseId: true, createdAt: true },
  });
  const readAtByCase = new Map(cases.map((c) => [c.id, c.shopLastReadAt] as const));
  let total = 0;
  for (const m of msgs) {
    const readAt = readAtByCase.get(m.caseId);
    if (!readAt || m.createdAt > readAt) total++;
  }
  return total;
}

// ร้านเปิดอ่านเธรด → set shopLastReadAt = now (เคลียร์ badge)
//   เคสข้ามร้าน → false (findUnique คืน null เพราะ kernel guard)
export async function markCaseRead(ctx: Ctx, caseId: string): Promise<boolean> {
  const db = tenantDb(ctx);
  const existing = await db.supportCase.findUnique({ where: { id: caseId } });
  if (!existing) return false;
  await db.supportCase.update({ where: { id: caseId }, data: { shopLastReadAt: new Date() } });
  return true;
}

// บทสนทนาในเคส (เก่า→ใหม่) · เคสข้ามร้าน → [] (tenantId ถูก inject ใน where)
export async function listCaseMessages(ctx: Ctx, caseId: string): Promise<SupportMessage[]> {
  return tenantDb(ctx).supportMessage.findMany({
    where: { caseId },
    orderBy: { createdAt: "asc" },
  });
}

// ร้านพิมพ์ข้อความต่อในเคส + ไฟล์แนบ (ถ้ามี)
// - เคสไม่ใช่ของ tenant นี้ → false (findUnique คืน null เพราะ kernel guard)
// - เคสปิดแล้ว (RESOLVED) → เปิดใหม่เป็น OPEN
// - ทุกข้อความจากร้าน = ดันสถานะเป็น OPEN (รอแพลตฟอร์มตอบ)
export async function addShopMessage(
  ctx: Ctx,
  caseId: string,
  userId: string,
  body: string,
  attachments?: Attachment[],
): Promise<boolean> {
  const db = tenantDb(ctx);
  const existing = await db.supportCase.findUnique({ where: { id: caseId } });
  if (!existing) return false;
  await db.supportCase.update({ where: { id: caseId }, data: { status: "OPEN" } });
  await db.supportMessage.create({
    data: {
      tenantId: ctx.tenantId,
      caseId,
      authorSide: "SHOP",
      authorId: userId,
      body,
      attachmentsJson: cleanAttachments(attachments),
    },
  });
  return true;
}

// CRM C5.5-fix13 (hunt-4 H4-1) ▸ ลบข้อมูลส่วนบุคคลตาม PDPA (ผู้เรียก: crm/privacy.ts ใน tx ของการลบ) — หัวเคส + ข้อความในเคสของร้านนี้
//   ที่มีคำระบุตัวของคนที่ถูกลบ (ชื่อเต็ม · เบอร์ · อีเมล …) → แทนด้วย `mask` · แถวคงอยู่ (ประวัติเคสกับทีมงาน) · ทุกฝั่งผู้เขียน
//   (ร้าน · ทีมงาน · ผู้ช่วย AI ที่เปิดเคส) · หนึ่งคำสั่งต่อคำต่อตาราง (เขียนเป็นชุด) · `updatedAt` ไม่ขยับ (ไม่ดันเคสเก่าขึ้นบนสุดของรายการ)
export async function maskSupportTextInTx(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  tenantId: string,
  tokens: readonly string[],
  mask: string,
): Promise<number> {
  let n = 0;
  if (!tenantId) return 0;
  for (const tk of tokens) {
    if (!tk || tk.length < 4) continue;
    n += Number(
      await tx.$executeRaw`UPDATE "SupportCase" SET "subject" = replace("subject", ${tk}, ${mask}) WHERE "tenantId" = ${tenantId} AND strpos("subject", ${tk}) > 0`,
    );
    n += Number(
      await tx.$executeRaw`UPDATE "SupportMessage" SET "body" = replace("body", ${tk}, ${mask}) WHERE "tenantId" = ${tenantId} AND strpos("body", ${tk}) > 0`,
    );
  }
  return n;
}
