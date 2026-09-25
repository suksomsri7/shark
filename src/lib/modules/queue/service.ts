import { resolvePublicUnit } from "@/lib/core/storefront";
import { prisma } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox"; // CRM C2.9 ▸ เหตุการณ์ "คิวได้รับบริการเสร็จ" ใน tx เดียวกับสถานะ ◂
import { normalizePartyPhone, safeFindOrCreate } from "@/lib/modules/party";
import type {
  Prisma,
  QueueIssueChannel,
  QueueTicket,
  QueueTicketStatus,
} from "@prisma/client";

// Queue service — scope=unit. ใช้ base prisma + ระบุ tenantId/unitId ตรงๆ ทุก query
// (deterministic ไม่พึ่ง scope registration ที่เจ้าของจะ merge ตอน integration)

export type Ctx = { tenantId: string; unitId: string };

// ── business date ตามโซนร้าน (default Asia/Bangkok) → "YYYY-MM-DD" ──
export function businessDateOf(tz = "Asia/Bangkok", d = new Date()): string {
  // en-CA ให้รูปแบบ YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

const ACTIVE_STATUSES: QueueTicketStatus[] = ["WAITING", "CALLED", "SERVING"];

function ticketNumber(prefix: string, seq: number): string {
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

// ── resolve unit สาธารณะ (public/no-auth) จาก slug → ต้องเป็นระบบ QUEUE ที่ ACTIVE ──
export async function resolveQueueUnit(tenantSlug: string, unitSlug: string) {
  // คิวรีเดียว (เดิมยิง tenant แล้ว unit เรียงกัน = 2 round-trip ไปสิงคโปร์)
  return resolvePublicUnit(tenantSlug, unitSlug, "QUEUE");
}

// ── ประเภทคิวที่รับออนไลน์ได้ (public — หน้ารับบัตรของลูกค้า) ──
export async function listOnlineTypes(ctx: Ctx) {
  return prisma.queueType.findMany({
    where: { ...ctx, status: "ACTIVE", onlineIssuable: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

// ── ภาพรวมคิวสาธารณะ (public — เลขคิวเท่านั้น ไม่มีชื่อ/เบอร์) ──
// ใช้บนหน้ารับบัตร + หน้าสถานะบัตร: กำลังเรียกเลขไหน + รออีกกี่คน + เปิดรับออนไลน์ไหม
export async function getPublicOverview(ctx: Ctx) {
  const businessDate = businessDateOf();
  const [calling, waitingCount, policy] = await Promise.all([
    prisma.queueTicket.findMany({
      where: { ...ctx, businessDate, status: { in: ["CALLED", "SERVING"] } },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { number: true },
    }),
    prisma.queueTicket.count({ where: { ...ctx, businessDate, status: "WAITING" } }),
    prisma.queuePolicy.findUnique({ where: { unitId: ctx.unitId }, select: { onlineIssueOpen: true } }),
  ]);
  return {
    calling: calling.map((c) => c.number),
    waitingCount,
    onlineOpen: policy ? policy.onlineIssueOpen : true, // ไม่มี policy = เปิดตาม default schema
  };
}

// ─────────────────────────────────────────────────────────────
// Config reads
// ─────────────────────────────────────────────────────────────
export async function listTypes(ctx: Ctx, includeArchived = false) {
  return prisma.queueType.findMany({
    where: {
      ...ctx,
      ...(includeArchived ? {} : { status: { not: "ARCHIVED" } }),
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function listCounters(ctx: Ctx, includeArchived = false) {
  return prisma.queueCounter.findMany({
    where: {
      ...ctx,
      ...(includeArchived ? {} : { status: { not: "ARCHIVED" } }),
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { types: { include: { type: true } } },
  });
}

export async function listDisplays(ctx: Ctx) {
  return prisma.queueDisplay.findMany({
    where: { ...ctx, revokedAt: null },
    orderBy: { createdAt: "asc" },
  });
}

// ─────────────────────────────────────────────────────────────
// ออกบัตร (issueTicket) — atomic running number ต่อวัน
// ทุกช่องทาง (kiosk / online / staff / booking handoff) ลงเอยที่นี่
// ─────────────────────────────────────────────────────────────
export async function issueTicket(input: {
  tenantId: string;
  unitId: string;
  typeId?: string;
  typeCode?: string; // handoff ใช้ code (เช่น APPOINTMENT)
  channel: QueueIssueChannel;
  memberId?: string;
  contact?: { name?: string; phone?: string; email?: string };
  refType?: string;
  refId?: string;
  issuedBy?: string;
  actorType?: "STAFF" | "CUSTOMER" | "SYSTEM";
}): Promise<
  | { ok: true; ticket: QueueTicket }
  | { ok: false; reason: string; code: string }
> {
  const { tenantId, unitId } = input;
  const businessDate = businessDateOf();

  try {
    const ticket = await prisma.$transaction(async (tx) => {
      const type = await tx.queueType.findFirst({
        where: {
          tenantId,
          unitId,
          status: "ACTIVE",
          ...(input.typeId ? { id: input.typeId } : {}),
          ...(input.typeCode ? { code: input.typeCode } : {}),
        },
      });
      if (!type) throw new Error("NO_TYPE");

      // increment atomic: INSERT ... ON CONFLICT DO UPDATE value=value+1 RETURNING value
      const rows = await tx.$queryRaw<{ value: number }[]>`
        INSERT INTO "QueueDailySequence" ("id","tenantId","unitId","typeId","businessDate","value","updatedAt")
        VALUES (gen_random_uuid()::text, ${tenantId}, ${unitId}, ${type.id}, ${businessDate}, 1, now())
        ON CONFLICT ("unitId","typeId","businessDate")
        DO UPDATE SET "value" = "QueueDailySequence"."value" + 1, "updatedAt" = now()
        RETURNING "value"`;
      const seq = rows[0].value;

      const created = await tx.queueTicket.create({
        data: {
          tenantId,
          unitId,
          typeId: type.id,
          businessDate,
          seq,
          number: ticketNumber(type.prefix, seq),
          status: "WAITING",
          priority: type.priority,
          channel: input.channel,
          memberId: input.memberId ?? null,
          contactName: input.contact?.name ?? null,
          contactPhone: input.contact?.phone ?? null,
          contactEmail: input.contact?.email ?? null,
          refType: input.refType ?? null,
          refId: input.refId ?? null,
          issuedBy: input.issuedBy ?? null,
        },
      });

      await tx.queueTicketEvent.create({
        data: {
          tenantId,
          unitId,
          ticketId: created.id,
          action: "ISSUED",
          actorType: input.actorType ?? "STAFF",
          actorId: input.issuedBy ?? null,
        },
      });
      return created;
    });
    await linkPartyAfterCommit(tenantId, ticket.id, input.contact?.name, input.contact?.phone, input.contact?.email); // CRM v2 C1.1 (C11)
    return { ok: true, ticket };
  } catch (e) {
    if (e instanceof Error && e.message === "NO_TYPE") {
      return { ok: false, reason: "ไม่พบประเภทคิว หรือประเภทถูกปิด", code: "NO_TYPE" };
    }
    throw e;
  }
}

// ── กันรับคิวออนไลน์ซ้ำ: เบอร์เดิมมีบัตร active วันนี้ใน unit แล้วหรือยัง ──
export async function findActiveTicketByPhone(ctx: Ctx, phone: string) {
  return prisma.queueTicket.findFirst({
    where: {
      ...ctx,
      businessDate: businessDateOf(),
      contactPhone: phone,
      status: { in: ACTIVE_STATUSES },
    },
  });
}

// ─────────────────────────────────────────────────────────────
// เรียกคิวถัดไปให้เคาน์เตอร์ (call-next engine)
// เลือก WAITING ของประเภทที่เคาน์เตอร์รับ → priority DESC, createdAt ASC
// retry เมื่อชนกับเคาน์เตอร์อื่น (optimistic guard ด้วย updateMany status=WAITING)
// ─────────────────────────────────────────────────────────────
export async function callNext(
  ctx: Ctx,
  counterId: string,
  actorId?: string,
): Promise<
  | { ok: true; ticket: QueueTicket }
  | { ok: false; code: "NO_COUNTER" | "COUNTER_CLOSED" | "NO_WAITING" | "CONTENTION" }
> {
  type Step =
    | { kind: "ok"; ticket: QueueTicket }
    | { kind: "retry" }
    | { kind: "err"; code: "NO_COUNTER" | "COUNTER_CLOSED" | "NO_WAITING" };

  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await prisma.$transaction(async (tx): Promise<Step> => {
      const counter = await tx.queueCounter.findFirst({
        where: { ...ctx, id: counterId },
        include: { types: true },
      });
      if (!counter) return { kind: "err", code: "NO_COUNTER" };
      if (counter.status !== "OPEN") return { kind: "err", code: "COUNTER_CLOSED" };

      const typeIds = counter.types.map((t) => t.typeId);
      const cand = await tx.queueTicket.findFirst({
        where: {
          ...ctx,
          businessDate: businessDateOf(),
          status: "WAITING",
          ...(typeIds.length ? { typeId: { in: typeIds } } : {}),
        },
        // โอนกลับ WAITING (transferredFrom) จะถูกดันขึ้นก่อนตาม createdAt เดิม
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      });
      if (!cand) return { kind: "err", code: "NO_WAITING" };

      const upd = await tx.queueTicket.updateMany({
        where: { id: cand.id, status: "WAITING" },
        data: {
          status: "CALLED",
          counterId,
          calledAt: cand.calledAt ?? new Date(),
          callCount: { increment: 1 },
        },
      });
      if (upd.count === 0) return { kind: "retry" };

      await tx.queueTicketEvent.create({
        data: {
          tenantId: ctx.tenantId,
          unitId: ctx.unitId,
          ticketId: cand.id,
          action: "CALLED",
          counterId,
          actorType: "STAFF",
          actorId: actorId ?? null,
        },
      });
      const ticket = await tx.queueTicket.findFirst({ where: { id: cand.id } });
      return { kind: "ok", ticket: ticket as QueueTicket };
    });

    if (result.kind === "retry") continue;
    if (result.kind === "ok") return { ok: true, ticket: result.ticket };
    return { ok: false, code: result.code };
  }
  return { ok: false, code: "CONTENTION" };
}

// ── transition ทั่วไป: อ่านบัตร (scoped) → ตรวจ status ที่อนุญาต → อัปเดต + event ──
// CRM C2.9 ▸ พารามิเตอร์ตัวที่หก `emit` — ให้ตัวเรียกยิง outbox event **ใน tx เดียวกับการเปลี่ยนสถานะ** ได้
//   (วันนี้มีผู้ใช้รายเดียว = `markDone` · ตัวอื่นส่ง undefined ⇒ พฤติกรรมเดิมทุกไบต์)
async function transition(
  ctx: Ctx,
  ticketId: string,
  allowed: QueueTicketStatus[],
  data: Prisma.QueueTicketUncheckedUpdateInput,
  event: { action: string; counterId?: string | null; actorId?: string; detail?: Prisma.InputJsonValue },
  emit?: (tx: Prisma.TransactionClient, ticket: QueueTicket) => Promise<void>,
): Promise<{ ok: true; ticket: QueueTicket } | { ok: false; code: "NOT_FOUND" | "BAD_STATE" }> {
  return prisma.$transaction(async (tx) => {
    const cur = await tx.queueTicket.findFirst({ where: { ...ctx, id: ticketId } });
    if (!cur) return { ok: false as const, code: "NOT_FOUND" as const };
    if (!allowed.includes(cur.status)) return { ok: false as const, code: "BAD_STATE" as const };
    const ticket = await tx.queueTicket.update({ where: { id: ticketId }, data });
    if (emit) await emit(tx, ticket);
    await tx.queueTicketEvent.create({
      data: {
        tenantId: ctx.tenantId,
        unitId: ctx.unitId,
        ticketId,
        action: event.action,
        counterId: event.counterId ?? cur.counterId,
        actorType: "STAFF",
        actorId: event.actorId ?? null,
        detail: event.detail,
      },
    });
    return { ok: true as const, ticket };
  });
}

// เรียกซ้ำ (ประกาศซ้ำ) — CALLED เท่านั้น, callCount++
export function recall(ctx: Ctx, ticketId: string, actorId?: string) {
  return transition(ctx, ticketId, ["CALLED"], { callCount: { increment: 1 } }, {
    action: "RECALLED",
    actorId,
  });
}

// ข้าม — CALLED → SKIPPED
export function skip(ctx: Ctx, ticketId: string, actorId?: string) {
  return transition(ctx, ticketId, ["CALLED"], { status: "SKIPPED", skippedAt: new Date() }, {
    action: "SKIPPED",
    actorId,
  });
}

// เรียกคืนคิวที่ข้าม — SKIPPED → CALLED ที่เคาน์เตอร์ผู้กด
export function recallSkipped(ctx: Ctx, ticketId: string, counterId: string, actorId?: string) {
  return transition(
    ctx,
    ticketId,
    ["SKIPPED"],
    { status: "CALLED", counterId, calledAt: new Date(), callCount: { increment: 1 } },
    { action: "RECALL_SKIPPED", counterId, actorId },
  );
}

// เริ่มบริการ — CALLED → SERVING
export function serve(ctx: Ctx, ticketId: string, actorId?: string) {
  return transition(ctx, ticketId, ["CALLED"], { status: "SERVING", servedAt: new Date() }, {
    action: "SERVING",
    actorId,
  });
}

// จบบริการ — CALLED/SERVING → DONE
export function markDone(ctx: Ctx, ticketId: string, actorId?: string) {
  return transition(
    ctx,
    ticketId,
    ["CALLED", "SERVING"],
    { status: "DONE", doneAt: new Date() },
    { action: "DONE", actorId },
    // CRM C2.9 ▸ (มติ C11 · ใบ C2.9) "คิวได้รับบริการเสร็จแล้ว" — ยิงตอน **DONE** (ไม่ใช่ตอนเรียก/ตอนเริ่มบริการ:
    //   การมาใช้บริการเกิดขึ้นจริงเมื่อจบงาน) · อยู่ใน tx เดียวกับการเปลี่ยนสถานะ + แถวประวัติของบัตร ⇒
    //   จบบริการสำเร็จ = มี event เสมอ · event เขียนไม่ได้ = ยกเลิกทั้งก้อน (บัตรยัง CALLED/SERVING)
    //   payload = id ล้วน (X8: ไม่มีชื่อ/เบอร์ที่ลูกค้าฝากไว้ตอนกดรับบัตร)
    async (tx, ticket) => {
      await emitOutbox(tx, {
        tenantId: ctx.tenantId,
        unitId: ctx.unitId,
        type: "queue.served",
        idempotencyKey: `queue.served#${ticketId}`,
        payload: { ticketId, unitId: ctx.unitId, partyId: ticket.partyId, typeId: ticket.typeId, counterId: ticket.counterId },
      });
    },
    // ◂ CRM C2.9
  );
}

// ยกเลิก — จากสถานะ active ใดๆ
export function cancel(
  ctx: Ctx,
  ticketId: string,
  reason: "CUSTOMER" | "STAFF" | "END_OF_DAY" = "STAFF",
  actorId?: string,
) {
  return transition(
    ctx,
    ticketId,
    ["WAITING", "CALLED", "SERVING", "SKIPPED"],
    { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
    { action: "CANCELLED", actorId, detail: { reason } },
  );
}

// โอนเคาน์เตอร์ — CALLED/SERVING → WAITING (เลขเดิม) ที่เคาน์เตอร์/ประเภทเป้าหมาย
export async function transfer(
  ctx: Ctx,
  ticketId: string,
  target: { toCounterId?: string; toTypeId?: string },
  actorId?: string,
) {
  const cur = await prisma.queueTicket.findFirst({ where: { ...ctx, id: ticketId } });
  const fromCounterId = cur?.counterId ?? null;
  return transition(
    ctx,
    ticketId,
    ["CALLED", "SERVING"],
    {
      status: "WAITING",
      counterId: null,
      transferredFromCounterId: fromCounterId,
      ...(target.toTypeId ? { typeId: target.toTypeId } : {}),
    },
    {
      action: "TRANSFERRED",
      counterId: target.toCounterId ?? null,
      actorId,
      detail: { fromCounterId, ...target },
    },
  );
}

// ─────────────────────────────────────────────────────────────
// Board (แดชบอร์ด staff): เคาน์เตอร์ + current ticket + waiting + skipped + counts
// ─────────────────────────────────────────────────────────────
export async function getBoard(ctx: Ctx) {
  const businessDate = businessDateOf();
  const [counters, todays] = await Promise.all([
    listCounters(ctx),
    prisma.queueTicket.findMany({
      where: { ...ctx, businessDate },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      include: { type: true },
    }),
  ]);

  const waiting = todays.filter((t) => t.status === "WAITING");
  const skipped = todays.filter((t) => t.status === "SKIPPED");
  const serving = todays.filter((t) => t.status === "CALLED" || t.status === "SERVING");

  const counterCards = counters
    .filter((c) => c.status !== "ARCHIVED")
    .map((c) => ({
      counter: c,
      current:
        serving
          .filter((t) => t.counterId === c.id)
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null,
    }));

  const counts = {
    waiting: waiting.length,
    serving: serving.length,
    done: todays.filter((t) => t.status === "DONE").length,
    skipped: skipped.length,
    total: todays.length,
  };

  return { businessDate, counterCards, waiting, skipped, counts };
}

export async function listWaiting(ctx: Ctx) {
  return prisma.queueTicket.findMany({
    where: { ...ctx, businessDate: businessDateOf(), status: "WAITING" },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    include: { type: true },
  });
}

// ── สถานะบัตรลูกค้า (public จาก publicToken) + position + estimate หยาบ ──
export async function getTicketStatus(unitId: string, publicToken: string) {
  const ticket = await prisma.queueTicket.findUnique({ where: { publicToken } });
  if (!ticket || ticket.unitId !== unitId) return null;

  let position = 0;
  let estimateMin: number | null = null;
  if (ticket.status === "WAITING") {
    // จำนวนคิวข้างหน้าใน pool เดียวกัน (priority สูงกว่า หรือเท่ากันแต่มาก่อน)
    const ahead = await prisma.queueTicket.count({
      where: {
        tenantId: ticket.tenantId,
        unitId: ticket.unitId,
        businessDate: ticket.businessDate,
        status: "WAITING",
        OR: [
          { priority: { gt: ticket.priority } },
          { priority: ticket.priority, createdAt: { lt: ticket.createdAt } },
        ],
      },
    });
    position = ahead;
    const type = await prisma.queueType.findUnique({ where: { id: ticket.typeId } });
    const openCounters = await prisma.queueCounter.count({
      where: { tenantId: ticket.tenantId, unitId: ticket.unitId, status: "OPEN" },
    });
    const avg = type?.avgServiceMinFallback ?? 10;
    const lanes = Math.max(1, openCounters);
    estimateMin = Math.ceil(((ahead + 1) / lanes) * avg);
  }
  return { ticket, position, estimateMin };
}

// ── snapshot จอ TV (public จาก displayToken) ──
export async function getDisplaySnapshot(unitId: string, displayToken: string) {
  const display = await prisma.queueDisplay.findUnique({ where: { displayToken } });
  if (!display || display.unitId !== unitId || display.revokedAt) return null;
  const ctx = { tenantId: display.tenantId, unitId: display.unitId };
  const businessDate = businessDateOf();

  const [counters, called, waiting] = await Promise.all([
    prisma.queueCounter.findMany({
      where: { ...ctx, status: "OPEN" },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.queueTicket.findMany({
      where: { ...ctx, businessDate, status: { in: ["CALLED", "SERVING"] } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.queueTicket.findMany({
      where: { ...ctx, businessDate, status: "WAITING" },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 8,
      select: { id: true, number: true },
    }),
  ]);

  // ล่าสุดต่อเคาน์เตอร์ (ไม่มีชื่อ/เบอร์ลูกค้า — privacy)
  const perCounter = counters.map((c) => {
    const cur = called.find((t) => t.counterId === c.id);
    return { counterName: c.name, counterCode: c.code, number: cur?.number ?? null };
  });

  return {
    display,
    perCounter,
    next: waiting.map((w) => w.number),
    waitingCount: waiting.length,
  };
}

// ─────────────────────────────────────────────────────────────
// Cron / งานพื้นหลัง
//   a) SKIPPED เกิน skippedExpiryMin → NO_SHOW
//   b) สิ้นวัน: WAITING/CALLED/SKIPPED ของ business date ก่อนหน้า → CANCELLED(END_OF_DAY)
// ─────────────────────────────────────────────────────────────
export async function resetDaily(ctx: Ctx) {
  const today = businessDateOf();
  const stale = await prisma.queueTicket.updateMany({
    where: {
      ...ctx,
      businessDate: { not: today },
      status: { in: ["WAITING", "CALLED", "SERVING", "SKIPPED"] },
    },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "END_OF_DAY" },
  });
  return { cancelled: stale.count };
}

export async function expireSkipped(ctx: Ctx) {
  const policy = await prisma.queuePolicy.findUnique({ where: { unitId: ctx.unitId } });
  const mins = policy?.skippedExpiryMin ?? 60;
  const cutoff = new Date(Date.now() - mins * 60_000);
  const expired = await prisma.queueTicket.updateMany({
    where: { ...ctx, status: "SKIPPED", skippedAt: { lt: cutoff } },
    data: { status: "NO_SHOW" },
  });
  return { expired: expired.count };
}

// ───────── CRM v2 ใบ C1.1 (C11) — ผูก Party กลางให้ QueueTicket ─────────
// 🔴 เรียก "หลัง commit" เท่านั้น: รายการที่ล้ม (เต็ม/ชน/ไม่พบ) ต้องไม่ทิ้ง Party ของคนที่ไม่ได้เป็นลูกค้า (PDPA · เก็บเท่าที่จำเป็น)
//    และไม่ถือ connection ที่สองขณะ transaction ธุรกิจถือ lock อยู่
// 🔴 กุญแจต้องเชื่อถือได้: เบอร์ normalize ≥ 9 หลัก หรืออีเมลที่ถูกรูป — ไม่งั้นไม่ผูก (party.findOrCreate สร้างใหม่ทุกครั้งเมื่อเบอร์ < 8 หลัก ⇒ Party ขยะ)
// 🔴 ไม่มีวัน throw เข้าหาผู้เรียก · ล้ม = ปล่อย partyId ว่างให้ backfill party-links เก็บตก
// AUDIT-CLASS X8: log แค่ชื่อตาราง + tenant ไม่มีเบอร์/อีเมล/ชื่อ
async function linkPartyAfterCommit(tenantId: string, id: string, name: string | null | undefined, phone: string | null | undefined, email?: string | null): Promise<void> {
  try {
    const phoneOk = normalizePartyPhone(phone).length >= 9;
    const mail = email?.trim() ?? "";
    const mailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail);
    if (!phoneOk && !mailOk) return;
    const partyId = await safeFindOrCreate(tenantId, { name: name?.trim() || "ลูกค้าไม่ระบุชื่อ", phone: phoneOk ? phone : null, email: mailOk ? mail : null });
    if (partyId) await prisma.queueTicket.updateMany({ where: { id, tenantId, partyId: null }, data: { partyId } });
    else console.warn(`[party-link] QueueTicket tenant=${tenantId}: ไม่ได้ partyId — ปล่อยว่าง`);
  } catch {
    console.warn(`[party-link] QueueTicket tenant=${tenantId}: ผูก Party ไม่สำเร็จ — ปล่อยว่าง`);
  }
}
