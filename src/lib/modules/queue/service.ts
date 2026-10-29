import { resolvePublicUnit } from "@/lib/core/storefront";
import { prisma } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox"; // CRM C2.9 ▸ เหตุการณ์ "คิวได้รับบริการเสร็จ" ใน tx เดียวกับสถานะ ◂
import { normalizePartyPhone, safeFindOrCreate } from "@/lib/modules/party";
import { resolveSettings } from "@/lib/core/settings"; // SVC B.4 ▸ resolveQueueUnit ยอมหน่วย BOOKING แถวเดียว (CC §6.1) ◂
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
  const q = await resolvePublicUnit(tenantSlug, unitSlug, "QUEUE");
  if (q) return q;
  // SVC B.4 ▸ CC §6.1: หน่วย BOOKING ที่เปิด `booking.queue.singleLine` = มีคิวบนหน่วยจองคิว (บัตร P/A) · ปิดโหมด ⇒ null (เหมือนเดิม)
  //   หน่วย QUEUE ได้ผลเดิมทุกไบต์ (คืนก่อนถึงบรรทัดนี้) ◂
  const b = await resolvePublicUnit(tenantSlug, unitSlug, "BOOKING");
  if (!b) return null;
  const r = await resolveSettings({ tenantId: b.tenant.id }, ["booking.queue.singleLine"], { unitId: b.unit.id });
  return r["booking.queue.singleLine"]?.value === true ? b : null;
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
export type IssueTicketInput = {
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
};

export async function issueTicket(input: IssueTicketInput): Promise<
  | { ok: true; ticket: QueueTicket }
  | { ok: false; reason: string; code: string }
> {
  const { tenantId } = input;
  const businessDate = businessDateOf();

  try {
    const ticket = await prisma.$transaction((tx) =>
      issueTicketTx(tx, { ...input, businessDate, actorType: input.actorType ?? "STAFF" }),
    );
    await linkPartyAfterCommit(tenantId, ticket.id, input.contact?.name, input.contact?.phone, input.contact?.email); // CRM v2 C1.1 (C11)
    return { ok: true, ticket };
  } catch (e) {
    if (e instanceof Error && e.message === "NO_TYPE") {
      return { ok: false, reason: "ไม่พบประเภทคิว หรือประเภทถูกปิด", code: "NO_TYPE" };
    }
    throw e;
  }
}

/**
 * SVC B.4 ▸ ตัวเดียวกับ `issueTicket` แต่ใช้ธุรกรรมของผู้เรียก (บัตร P/A ของจองคิวออกใน tx เดียวกับสถานะงาน — ใบสั่ง §3.5)
 *   ไม่ผูก Party ใน tx (ผู้เรียกผูกหลัง commit · ห้ามใช้ connection ที่สองขณะถือล็อก) · `partyId` = ของแถวต้นทาง (ถ้ามี)
 *   ไม่พบประเภท ACTIVE ⇒ throw Error("NO_TYPE") (issueTicket แปลงเป็น code เดิม) ◂
 */
export async function issueTicketTx(
  tx: Prisma.TransactionClient,
  input: IssueTicketInput & { businessDate: string; actorType: "STAFF" | "CUSTOMER" | "SYSTEM"; partyId?: string | null },
): Promise<QueueTicket> {
  const { tenantId, unitId, businessDate } = input;
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
      ...(input.partyId ? { partyId: input.partyId } : {}),
    },
  });

  await tx.queueTicketEvent.create({
    data: {
      tenantId,
      unitId,
      ticketId: created.id,
      action: "ISSUED",
      actorType: input.actorType,
      actorId: input.issuedBy ?? null,
    },
  });
  return created;
}

// ═════════ SVC B.4 ▸ บัตรของระบบ (P นัด / A walk-in) + บัตรเดินตามงาน (ใบสั่ง §3.1 §3.5) ═════════

/**
 * ประเภทบัตรของระบบ (isSystem · priority 0 · ไม่ออกเองจากตู้/ออนไลน์ของหน่วยคิว) — สร้างครั้งแรกที่ใช้ ·
 * `createMany skipDuplicates` = INSERT … ON CONFLICT DO NOTHING ⇒ เรียกพร้อมกันได้แถวเดียว · มีอยู่แล้ว (แม้ prefix ต่าง) = ใช้แถวเดิม ·
 * เรียก **นอก** ธุรกรรมที่ถือล็อก (คำสั่งเดี่ยว) · คืน null เมื่อใช้ไม่ได้ (prefix ชนประเภทอื่นของหน่วย / แถวของระบบถูกปิด) — ไม่ throw
 */
export async function ensureSystemQueueType(ctx: Ctx, code: "APPOINTMENT" | "WALKIN", prefix: string): Promise<{ id: string; prefix: string } | null> {
  // J6: ใช้ได้เฉพาะแถว ACTIVE (issueTicketTx กรอง ACTIVE) · ถูกปิด/ prefix ชนประเภทอื่น ⇒ null ให้ผู้เรียกตอบ {ok:false}
  const find = () => prisma.queueType.findFirst({ where: { ...ctx, code, status: "ACTIVE" }, select: { id: true, prefix: true } });
  const found = await find();
  if (found) return found;
  try {
    await prisma.queueType.createMany({
    data: [{
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      code,
      name: code === "APPOINTMENT" ? "นัดหมาย" : "walk-in",
      prefix,
      priority: 0,
      isSystem: true,
      onlineIssuable: false,
      kioskIssuable: false,
    }],
    skipDuplicates: true,
    });
  } catch (e) {
    console.warn(`[queue] สร้างประเภทบัตรของระบบ ${code} ไม่ได้ unit=${ctx.unitId}`, e instanceof Error ? e.message : e);
    return null;
  }
  return find();
}

// SVC B.5 ▸ ข้าม (#43): CALLED → SKIPPED (skippedAt) · เรียกคืน: SKIPPED → CALLED เฉพาะเมื่อผู้เรียกขอ (`recallSkipped: true` · action RECALLED)
//   — ทางเดิม (callJob ของ B.4) ไม่ส่งธง ⇒ บัตร SKIPPED ยังเป็น BAD_STATE เหมือนเดิม · หน่วย QUEUE/issueTicket ไม่เปลี่ยน ◂
export type TicketMove = "CALLED" | "SERVING" | "DONE" | "NO_SHOW" | "CANCELLED" | "SKIPPED";
const MOVE_FROM: Record<TicketMove, QueueTicketStatus[]> = {
  CALLED: ["WAITING", "CALLED"],
  SKIPPED: ["CALLED"],
  SERVING: ["WAITING", "CALLED", "SKIPPED"],
  DONE: ["WAITING", "CALLED", "SERVING", "SKIPPED"],
  NO_SHOW: ["WAITING", "CALLED", "SERVING", "SKIPPED"],
  CANCELLED: ["WAITING", "CALLED", "SERVING", "SKIPPED"],
};

/**
 * เปลี่ยนสถานะบัตรใน tx ของผู้เรียก (ตาราง §3.1) — compare-and-set จากสถานะ+callCount ที่อ่าน · เขียน `QueueTicketEvent` ใน tx เดียวกัน ·
 * ไม่ยิง outbox (ผู้เรียกยิง event ของงาน) · **ไม่ยิง `queue.served`** (บัตรแถวเดียว: booking.completed ทำหน้าที่ VISIT · §6 ข้อ 8)
 */
export async function moveTicketTx(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  ticketId: string,
  to: TicketMove,
  o: { now: Date; actorType: "STAFF" | "SYSTEM" | "CUSTOMER"; actorId?: string | null; cancelReason?: "CUSTOMER" | "STAFF" | "END_OF_DAY"; recallSkipped?: boolean },
): Promise<{ ok: true; ticket: QueueTicket; from: QueueTicketStatus } | { ok: false; code: "NOT_FOUND" | "BAD_STATE" | "LOST_RACE" }> {
  const cur = await tx.queueTicket.findFirst({ where: { ...ctx, id: ticketId } });
  if (!cur) return { ok: false, code: "NOT_FOUND" };
  const recall = to === "CALLED" && o.recallSkipped === true;
  if (recall ? cur.status !== "SKIPPED" : !MOVE_FROM[to].includes(cur.status)) return { ok: false, code: "BAD_STATE" };
  const data: Prisma.QueueTicketUncheckedUpdateManyInput =
    to === "CALLED" ? { status: "CALLED", calledAt: o.now, callCount: { increment: 1 } }
    : to === "SKIPPED" ? { status: "SKIPPED", skippedAt: o.now }
    : to === "SERVING" ? { status: "SERVING", servedAt: o.now }
    : to === "DONE" ? { status: "DONE", doneAt: o.now }
    : to === "NO_SHOW" ? { status: "NO_SHOW" }
    : { status: "CANCELLED", cancelledAt: o.now, cancelReason: o.cancelReason ?? "STAFF" };
  const upd = await tx.queueTicket.updateMany({
    where: { ...ctx, id: ticketId, status: cur.status, callCount: cur.callCount },
    data,
  });
  if (upd.count === 0) return { ok: false, code: "LOST_RACE" };
  const action = to === "CALLED" ? (cur.status === "CALLED" || cur.status === "SKIPPED" ? "RECALLED" : "CALLED") : to;
  await tx.queueTicketEvent.create({
    data: {
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      ticketId,
      action,
      counterId: cur.counterId,
      actorType: o.actorType,
      actorId: o.actorId ?? null,
      ...(to === "CANCELLED" ? { detail: { reason: o.cancelReason ?? "STAFF" } } : {}),
    },
  });
  const ticket = (await tx.queueTicket.findFirst({ where: { ...ctx, id: ticketId } })) as QueueTicket;
  return { ok: true, ticket, from: cur.status };
}
// ◂ SVC B.4

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
  // SVC B.6 ▸ บัตรของโหมดแถวเดียว (refType APPOINTMENT) เปิดผ่าน /bq/t/<token HMAC> เท่านั้น — publicToken เดิม (cuid) ใช้ไม่ได้ ◂
  if (ticket.refType === "APPOINTMENT") return null;

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
    // SVC B.4 ▸ BQ-4: บัตรที่ตัววางคิวให้เวลาไว้ (etaAt) ⇒ ETA จากแผน ไม่ใช่สูตรหยาบ · ไม่มี etaAt = สูตรเดิม ◂
    if (ticket.etaAt) estimateMin = Math.max(0, Math.ceil((ticket.etaAt.getTime() - Date.now()) / 60_000));
  }
  return { ticket, position, estimateMin };
}

// ── snapshot จอ TV (public จาก displayToken) ──
export async function getDisplaySnapshot(unitId: string, displayToken: string) {
  const display = await prisma.queueDisplay.findUnique({ where: { displayToken } });
  if (!display || display.unitId !== unitId || display.revokedAt) return null;
  // SVC B.6 ▸ แถวที่มี settings.kind = จอ/ตู้ของหน่วยแถวเดียว (เก็บ hash ใน displayToken) — ไม่ใช่จอคิวเดิม ⇒ เปิดทางนี้ไม่ได้ ◂
  const b6 = display.settings && typeof display.settings === "object" && !Array.isArray(display.settings) ? (display.settings as { kind?: unknown }).kind : undefined;
  if (b6 !== undefined) return null;
  // SVC B.6 ▸ (มติผู้คุม K6) จอคิวเดิมเปิดได้เฉพาะหน่วย QUEUE — แถวเก่าที่ค้างในหน่วย BOOKING (ไม่มี kind · ถอนจาก UI ไม่ได้) ⇒ null ◂
  const b6Unit = await prisma.businessUnit.findFirst({ where: { id: display.unitId, tenantId: display.tenantId }, select: { type: true } });
  if (b6Unit?.type !== "QUEUE") return null;
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
// SVC B.4 ▸ `now` ฉีดได้ (ไม่ส่ง = เดิมทุกไบต์) · ตัวกรอง `line` ใช้เฉพาะ runQueueHousekeeping (ข้ามบัตรของจองคิว) ◂
const NOT_LINE_TICKET: Prisma.QueueTicketWhereInput = { OR: [{ refType: null }, { refType: { not: "APPOINTMENT" } }] };

export async function resetDaily(ctx: Ctx, now?: Date) {
  return resetDailyWhere(ctx, now, false);
}

async function resetDailyWhere(ctx: Ctx, now: Date | undefined, skipLine: boolean) {
  const today = businessDateOf(undefined, now ?? new Date());
  const stale = await prisma.queueTicket.updateMany({
    where: {
      ...ctx,
      businessDate: { not: today },
      status: { in: ["WAITING", "CALLED", "SERVING", "SKIPPED"] },
      ...(skipLine ? NOT_LINE_TICKET : {}),
    },
    data: { status: "CANCELLED", cancelledAt: now ?? new Date(), cancelReason: "END_OF_DAY" },
  });
  return { cancelled: stale.count };
}

export async function expireSkipped(ctx: Ctx, now?: Date) {
  return expireSkippedWhere(ctx, now, false);
}

async function expireSkippedWhere(ctx: Ctx, now: Date | undefined, skipLine: boolean) {
  const policy = await prisma.queuePolicy.findUnique({ where: { unitId: ctx.unitId } });
  const mins = policy?.skippedExpiryMin ?? 60;
  const cutoff = new Date((now ? now.getTime() : Date.now()) - mins * 60_000);
  const expired = await prisma.queueTicket.updateMany({
    where: { ...ctx, status: "SKIPPED", skippedAt: { lt: cutoff }, ...(skipLine ? NOT_LINE_TICKET : {}) },
    data: { status: "NO_SHOW" },
  });
  return { expired: expired.count };
}

/**
 * SVC B.4 ▸ งานรายนาที "queue.housekeeping" (ใบสั่ง §3.5 §3.6): resetDaily + expireSkipped ทุกหน่วยที่มีบัตรค้าง (ข้ามร้าน ·
 * `tenantIds` = จำกัดขอบเขต) · **ข้ามบัตร refType='APPOINTMENT'** (บัตร P/A ของจองคิว — สิ้นวันของ walk-in ทำใน runLineTick ·
 * ARRIVED ค้างข้ามวันร้านปิดเองบนจอ B.5) · updateMany มีเงื่อนไขสถานะ ⇒ รันซ้อนกันได้ แต่ละบัตรเปลี่ยนครั้งเดียว
 */
export async function runQueueHousekeeping(now: Date, opts?: { tenantIds?: string[] }): Promise<{ cancelled: number; expired: number }> {
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  if (opts?.tenantIds && opts.tenantIds.length === 0) return { cancelled: 0, expired: 0 };
  const units = await prisma.queueTicket.findMany({
    where: {
      status: { in: ["WAITING", "CALLED", "SERVING", "SKIPPED"] },
      ...NOT_LINE_TICKET,
      ...(opts?.tenantIds ? { tenantId: { in: opts.tenantIds } } : {}),
    },
    distinct: ["tenantId", "unitId"],
    select: { tenantId: true, unitId: true },
  });
  let cancelled = 0;
  let expired = 0;
  for (const u of units) {
    const ctx = { tenantId: u.tenantId, unitId: u.unitId };
    cancelled += (await resetDailyWhere(ctx, at, true)).cancelled;
    expired += (await expireSkippedWhere(ctx, at, true)).expired;
  }
  return { cancelled, expired };
}
// ◂ SVC B.4

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
