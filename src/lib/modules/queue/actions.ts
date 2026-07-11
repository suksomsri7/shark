"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUnit } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import * as queue from "./service";

// helper: บริบท + path หลักของระบบคิว
async function ctxOf(unitSlug: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  return {
    ctx: { tenantId: auth.active.tenantId, unitId: unit.id },
    userId: auth.user.id,
    unit,
    tenant: auth.active.tenant,
    base: `/app/u/${unitSlug}/queue`,
  };
}

// ─────────────────────────────────────────────────────────────
// Config: ประเภทคิว
// ─────────────────────────────────────────────────────────────
const typeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  prefix: z.string().trim().min(1).max(3).transform((s) => s.toUpperCase()),
  priority: z.coerce.number().int().min(0).max(1000).default(0),
  onlineIssuable: z.coerce.boolean().default(false),
});

export async function addTypeAction(unitSlug: string, formData: FormData) {
  const { ctx, base } = await ctxOf(unitSlug);
  const p = typeSchema.safeParse({
    name: formData.get("name"),
    prefix: formData.get("prefix"),
    priority: formData.get("priority"),
    onlineIssuable: formData.get("onlineIssuable") === "on",
  });
  if (!p.success) return;
  // code อัตโนมัติจาก prefix (unique ต่อ unit) — กันชนใช้ prefix
  const exists = await prisma.queueType.findFirst({
    where: { ...ctx, OR: [{ prefix: p.data.prefix }, { code: p.data.prefix }], status: { not: "ARCHIVED" } },
  });
  if (exists) return;
  await prisma.queueType.create({
    data: {
      ...ctx,
      code: p.data.prefix,
      name: p.data.name,
      prefix: p.data.prefix,
      priority: p.data.priority,
      onlineIssuable: p.data.onlineIssuable,
    },
  });
  revalidatePath(`${base}/setup`);
}

export async function removeTypeAction(unitSlug: string, formData: FormData) {
  const { ctx, base } = await ctxOf(unitSlug);
  const id = String(formData.get("id") ?? "");
  const t = await prisma.queueType.findFirst({ where: { ...ctx, id } });
  if (!t || t.isSystem) return;
  await prisma.queueType.updateMany({ where: { ...ctx, id }, data: { status: "ARCHIVED" } });
  revalidatePath(`${base}/setup`);
}

// ─────────────────────────────────────────────────────────────
// Config: เคาน์เตอร์
// ─────────────────────────────────────────────────────────────
const counterSchema = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().min(1).max(8),
});

export async function addCounterAction(unitSlug: string, formData: FormData) {
  const { ctx, base } = await ctxOf(unitSlug);
  const p = counterSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
  });
  if (!p.success) return;
  const dup = await prisma.queueCounter.findFirst({
    where: { ...ctx, OR: [{ code: p.data.code }, { name: p.data.name }], status: { not: "ARCHIVED" } },
  });
  if (dup) return;
  await prisma.queueCounter.create({ data: { ...ctx, name: p.data.name, code: p.data.code } });
  revalidatePath(`${base}/setup`);
}

export async function removeCounterAction(unitSlug: string, formData: FormData) {
  const { ctx, base } = await ctxOf(unitSlug);
  const id = String(formData.get("id") ?? "");
  await prisma.queueCounter.updateMany({ where: { ...ctx, id }, data: { status: "ARCHIVED" } });
  revalidatePath(`${base}/setup`);
}

// ตั้งประเภทที่เคาน์เตอร์รับ (checkbox list) — ไม่เลือกเลย = รับทุกประเภท
export async function setCounterTypesAction(unitSlug: string, formData: FormData) {
  const { ctx, base } = await ctxOf(unitSlug);
  const counterId = String(formData.get("counterId") ?? "");
  const counter = await prisma.queueCounter.findFirst({ where: { ...ctx, id: counterId } });
  if (!counter) return;
  const typeIds = formData.getAll("typeId").map((v) => String(v));
  await prisma.$transaction(async (tx) => {
    await tx.queueCounterType.deleteMany({ where: { ...ctx, counterId } });
    if (typeIds.length) {
      await tx.queueCounterType.createMany({
        data: typeIds.map((typeId) => ({ ...ctx, counterId, typeId })),
        skipDuplicates: true,
      });
    }
  });
  revalidatePath(`${base}/setup`);
}

// เปิด/ปิดเคาน์เตอร์รายวัน + ประจำเคาน์เตอร์
export async function openCounterAction(unitSlug: string, formData: FormData) {
  const { ctx, userId, base } = await ctxOf(unitSlug);
  const id = String(formData.get("id") ?? "");
  await prisma.queueCounter.updateMany({
    where: { ...ctx, id },
    data: { status: "OPEN", activeUserId: userId },
  });
  revalidatePath(base);
}

export async function closeCounterAction(unitSlug: string, formData: FormData) {
  const { ctx, base } = await ctxOf(unitSlug);
  const id = String(formData.get("id") ?? "");
  // กันบัตรลอย: ปิดไม่ได้ถ้ามี CALLED/SERVING ค้าง
  const busy = await prisma.queueTicket.count({
    where: { ...ctx, counterId: id, status: { in: ["CALLED", "SERVING"] } },
  });
  if (busy > 0) return;
  await prisma.queueCounter.updateMany({
    where: { ...ctx, id },
    data: { status: "CLOSED", activeUserId: null },
  });
  revalidatePath(base);
}

// จอ TV
export async function createDisplayAction(unitSlug: string, formData: FormData) {
  const { ctx, base } = await ctxOf(unitSlug);
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1) return;
  const dup = await prisma.queueDisplay.findFirst({ where: { ...ctx, name, revokedAt: null } });
  if (dup) return;
  await prisma.queueDisplay.create({ data: { ...ctx, name } });
  revalidatePath(`${base}/setup`);
}

export async function revokeDisplayAction(unitSlug: string, formData: FormData) {
  const { ctx, base } = await ctxOf(unitSlug);
  const id = String(formData.get("id") ?? "");
  await prisma.queueDisplay.updateMany({ where: { ...ctx, id }, data: { revokedAt: new Date() } });
  revalidatePath(`${base}/setup`);
}

// ─────────────────────────────────────────────────────────────
// Ticket operations
// ─────────────────────────────────────────────────────────────
export async function issueTicketAction(unitSlug: string, formData: FormData) {
  const { ctx, userId, base } = await ctxOf(unitSlug);
  const typeId = String(formData.get("typeId") ?? "");
  if (!typeId) return;
  const name = String(formData.get("contactName") ?? "").trim();
  const phone = String(formData.get("contactPhone") ?? "").trim();
  await queue.issueTicket({
    ...ctx,
    typeId,
    channel: "STAFF",
    issuedBy: userId,
    actorType: "STAFF",
    contact: name || phone ? { name: name || undefined, phone: phone || undefined } : undefined,
  });
  revalidatePath(base);
}

export async function callNextAction(unitSlug: string, formData: FormData) {
  const { ctx, userId, base } = await ctxOf(unitSlug);
  const counterId = String(formData.get("counterId") ?? "");
  await queue.callNext(ctx, counterId, userId);
  revalidatePath(base);
}

async function opById(
  unitSlug: string,
  formData: FormData,
  fn: (ctx: queue.Ctx, ticketId: string, userId: string) => Promise<unknown>,
) {
  const { ctx, userId, base } = await ctxOf(unitSlug);
  const id = String(formData.get("id") ?? "");
  if (id) await fn(ctx, id, userId);
  revalidatePath(base);
}

export async function recallAction(unitSlug: string, fd: FormData) {
  await opById(unitSlug, fd, (ctx, id, uid) => queue.recall(ctx, id, uid));
}
export async function skipAction(unitSlug: string, fd: FormData) {
  await opById(unitSlug, fd, (ctx, id, uid) => queue.skip(ctx, id, uid));
}
export async function serveAction(unitSlug: string, fd: FormData) {
  await opById(unitSlug, fd, (ctx, id, uid) => queue.serve(ctx, id, uid));
}
export async function doneAction(unitSlug: string, fd: FormData) {
  await opById(unitSlug, fd, (ctx, id, uid) => queue.markDone(ctx, id, uid));
}
export async function cancelAction(unitSlug: string, fd: FormData) {
  await opById(unitSlug, fd, (ctx, id, uid) => queue.cancel(ctx, id, "STAFF", uid));
}

export async function recallSkippedAction(unitSlug: string, formData: FormData) {
  const { ctx, userId, base } = await ctxOf(unitSlug);
  const id = String(formData.get("id") ?? "");
  const counterId = String(formData.get("counterId") ?? "");
  if (id && counterId) await queue.recallSkipped(ctx, id, counterId, userId);
  revalidatePath(base);
}

export async function transferAction(unitSlug: string, formData: FormData) {
  const { ctx, userId, base } = await ctxOf(unitSlug);
  const id = String(formData.get("id") ?? "");
  const toCounterId = String(formData.get("toCounterId") ?? "");
  if (id && toCounterId) await queue.transfer(ctx, id, { toCounterId }, userId);
  revalidatePath(base);
}
