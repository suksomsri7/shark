// Support Desk — ฝั่งร้าน (WO-0021 + help-v2) · tenant-scoped ทั้งหมดผ่าน tenantDb
// ปุ่มช่วยเหลือในแอปร้าน: เปิดเคส/ดูเคสของตัวเอง/คุยต่อ + แนบไฟล์ + เลขเคส + badge unread
// ทุก query ผ่าน tenantDb({ tenantId }) → inject tenantId อัตโนมัติ (kernel guard)
// เคสข้ามร้าน = มองไม่เห็น/แก้ไม่ได้ (findUnique คืน null · list คืน [])

import { Prisma } from "@prisma/client";
import type { SupportCase, SupportMessage } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";

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

// sanitize attachments จาก client → เก็บเฉพาะ field ที่ต้องการ
function cleanAttachments(attachments?: Attachment[]): Attachment[] {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter((a) => a && typeof a.url === "string" && a.url.length > 0)
    .map((a) => ({
      name: String(a.name ?? "ไฟล์แนบ"),
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
  input: { userId: string; subject: string; body: string; attachments?: Attachment[] },
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
