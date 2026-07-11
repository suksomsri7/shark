"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUnit } from "@/lib/core/context";
import * as ticket from "./service";

// แปลง "YYYY-MM-DDTHH:mm" (เวลาไทย จาก <input type=datetime-local>) → UTC Date
function bkkLocalToUtc(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h - 7, +mi));
}

async function ctxOf(unitSlug: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  return { tenantId: auth.active.tenantId, unitId: unit.id };
}

// ─────────────────────────── Event ───────────────────────────

const eventSchema = z.object({
  name: z.string().trim().min(1).max(120),
  venue: z.string().trim().max(160).optional(),
  startAt: z.string().min(1),
  endAt: z.string().optional(),
  description: z.string().trim().max(2000).optional(),
});

export async function createEventAction(unitSlug: string, formData: FormData) {
  const ctx = await ctxOf(unitSlug);
  const p = eventSchema.safeParse({
    name: formData.get("name"),
    venue: formData.get("venue") ?? undefined,
    startAt: formData.get("startAt"),
    endAt: formData.get("endAt") ?? undefined,
    description: formData.get("description") ?? undefined,
  });
  if (!p.success) return;
  const startAt = bkkLocalToUtc(p.data.startAt);
  if (!startAt) return;
  const endAt = p.data.endAt ? bkkLocalToUtc(p.data.endAt) : null;
  const event = await ticket.createEvent(ctx, {
    name: p.data.name,
    venue: p.data.venue,
    startAt,
    endAt,
    description: p.data.description,
  });
  revalidatePath(`/app/u/${unitSlug}/ticket`);
  revalidatePath(`/app/u/${unitSlug}/ticket/event/${event.id}`);
}

export async function setEventStatusAction(unitSlug: string, formData: FormData) {
  const ctx = await ctxOf(unitSlug);
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const parsed = z.enum(["DRAFT", "PUBLISHED", "ENDED", "CANCELLED"]).safeParse(status);
  if (!id || !parsed.success) return;
  await ticket.setEventStatus(ctx, id, parsed.data);
  revalidatePath(`/app/u/${unitSlug}/ticket`);
  revalidatePath(`/app/u/${unitSlug}/ticket/event/${id}`);
}

export async function archiveEventAction(unitSlug: string, formData: FormData) {
  const ctx = await ctxOf(unitSlug);
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await ticket.archiveEvent(ctx, id);
  revalidatePath(`/app/u/${unitSlug}/ticket`);
}

// ─────────────────────────── TicketType ───────────────────────────

const typeSchema = z.object({
  eventId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  priceBaht: z.coerce.number().min(0).max(1_000_000),
  quota: z.coerce.number().int().min(0).max(1_000_000),
});

export async function addTypeAction(unitSlug: string, formData: FormData) {
  const ctx = await ctxOf(unitSlug);
  const p = typeSchema.safeParse({
    eventId: formData.get("eventId"),
    name: formData.get("name"),
    priceBaht: formData.get("priceBaht"),
    quota: formData.get("quota"),
  });
  if (!p.success) return;
  await ticket.addTicketType(ctx, p.data.eventId, {
    name: p.data.name,
    priceSatang: Math.round(p.data.priceBaht * 100),
    quota: p.data.quota,
  });
  revalidatePath(`/app/u/${unitSlug}/ticket/event/${p.data.eventId}`);
}

export async function removeTypeAction(unitSlug: string, formData: FormData) {
  const ctx = await ctxOf(unitSlug);
  const id = String(formData.get("id") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  if (!id) return;
  await ticket.deactivateTicketType(ctx, id);
  revalidatePath(`/app/u/${unitSlug}/ticket/event/${eventId}`);
}

// ─────────────────────────── Order (ขาย/จอง หน้างาน) ───────────────────────────

// รับ line จำนวนตั๋วจาก field ชื่อ "qty:<ticketTypeId>"
export async function createOrderAction(unitSlug: string, formData: FormData) {
  const ctx = await ctxOf(unitSlug);
  const eventId = String(formData.get("eventId") ?? "");
  const buyerName = String(formData.get("buyerName") ?? "").trim();
  const buyerPhone = String(formData.get("buyerPhone") ?? "").trim();
  const markPaid = String(formData.get("markPaid") ?? "") === "1";
  if (!eventId || !buyerName) return { ok: false, reason: "กรอกชื่อผู้ซื้อ" } as const;

  const lines: { ticketTypeId: string; qty: number }[] = [];
  for (const [key, val] of formData.entries()) {
    if (key.startsWith("qty:")) {
      const qty = parseInt(String(val), 10);
      if (qty > 0) lines.push({ ticketTypeId: key.slice(4), qty });
    }
  }

  const res = await ticket.createOrder(ctx, {
    eventId,
    buyerName,
    buyerPhone: buyerPhone || undefined,
    lines,
    channel: "STAFF",
    markPaid,
  });
  revalidatePath(`/app/u/${unitSlug}/ticket/event/${eventId}`);
  return res;
}

export async function markPaidAction(unitSlug: string, formData: FormData) {
  const ctx = await ctxOf(unitSlug);
  const id = String(formData.get("id") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  if (!id) return;
  await ticket.markPaid(ctx, id);
  revalidatePath(`/app/u/${unitSlug}/ticket/event/${eventId}`);
}

export async function cancelOrderAction(unitSlug: string, formData: FormData) {
  const ctx = await ctxOf(unitSlug);
  const id = String(formData.get("id") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  if (!id) return;
  await ticket.cancelOrder(ctx, id);
  revalidatePath(`/app/u/${unitSlug}/ticket/event/${eventId}`);
}

// ─────────────────────────── Check-in ───────────────────────────

export async function checkInAction(
  unitSlug: string,
  _prev: unknown,
  formData: FormData,
): Promise<ticket.CheckInResult> {
  const { auth, unit } = await requireUnit(unitSlug);
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };
  const code = String(formData.get("code") ?? "");
  const eventId = String(formData.get("eventId") ?? "") || undefined;
  const res = await ticket.checkIn(ctx, code, { eventId, userId: auth.user.id });
  revalidatePath(`/app/u/${unitSlug}/ticket/checkin`);
  return res;
}
