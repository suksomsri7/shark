import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";

// ─────────────────────────────────────────────────────────────
// outbox.ts — transactional outbox (kernel) — WO-0002
// 🔴 kernel ห้าม import โมดูลใด ๆ (core เท่านั้น) — consumer registry ถูกส่งเข้ามา
//    (composition root = src/lib/outbox-consumers.ts ซึ่งอยู่นอก core จึง import โมดูลได้)
//
// emit  = เขียน event ใน tx เดียวกับงานหลัก → atomic กับบิล (บิลรอด = event รอด)
// drain = คว้า PENDING มา dispatch เข้า handler · สำเร็จ→DONE · ล้ม→backoff→FAILED
// idempotent 2 ชั้น: @@unique(tenantId,idempotencyKey) กัน emit ซ้ำ +
//                    guard ฝั่ง handler (gl alreadyPosted) กัน post ซ้ำ
// ─────────────────────────────────────────────────────────────

type Tx = Prisma.TransactionClient;

const MAX_ATTEMPTS = 5;
const LEASE_MS = 60_000; // จองงาน 1 นาที กัน drainer ซ้อนหยิบ event เดียวกัน

export type OutboxHandler = (evt: {
  id: string;
  tenantId: string;
  type: string;
  payload: unknown;
  systemId: string | null;
  unitId: string | null;
}) => Promise<void>;

/**
 * เขียน outbox event ใน tx เดียวกับงานหลัก (เช่น POS createSale)
 * ชน @@unique(tenantId, idempotencyKey) = มีอยู่แล้ว → เงียบ (emit ซ้ำไม่เพิ่มแถว)
 * เช็คก่อนสร้าง (แทน catch) เพื่อไม่ให้ constraint violation ทำ tx หลัก abort
 */
export async function emitOutbox(
  tx: Tx,
  input: {
    tenantId: string;
    type: string;
    idempotencyKey: string;
    payload?: unknown;
    systemId?: string | null;
    unitId?: string | null;
  },
): Promise<void> {
  const existing = await tx.outboxEvent.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
    select: { id: true },
  });
  if (existing) return; // มีอยู่แล้ว → เงียบ
  await tx.outboxEvent.create({
    data: {
      tenantId: input.tenantId,
      type: input.type,
      idempotencyKey: input.idempotencyKey,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      systemId: input.systemId ?? null,
      unitId: input.unitId ?? null,
    },
  });
}

// serialize drain ทั้งโปรเซส — drain 2 อันในโปรเซสเดียวห้ามซ้อน (best-effort ของ POS + cron + oracle)
// → กัน race ระหว่าง drain แบบ fire-and-forget (หลัง createSale) กับ drain ที่ await
// cross-instance (serverless หลายตัว) พึ่ง DB lease (availableAt) ด้านล่างอีกชั้น
let drainChain: Promise<unknown> = Promise.resolve();

/**
 * drain outbox: คว้า PENDING ที่ availableAt<=now เรียงตาม createdAt แล้ว dispatch
 * ต่อ event: claim ด้วย updateMany (เลื่อน availableAt = lease) → count===0 = ถูกคนอื่นคว้าไปแล้ว → ข้าม
 *   (enum มีแค่ PENDING/DONE/FAILED — ไม่มีสถานะ PROCESSING → ใช้ availableAt เป็น lease กัน process ซ้อน)
 * handler สำเร็จ → DONE + processedAt
 * handler throw → attempts++ / lastError / availableAt = now + 2^attempts นาที · attempts≥5 → FAILED
 */
export function drainOutbox(
  consumers: Record<string, OutboxHandler>,
  opts?: { limit?: number },
): Promise<{ processed: number; failed: number }> {
  // ต่อคิวหลัง drain ก่อนหน้า (ไม่ว่าสำเร็จหรือ error) แล้วค่อยเริ่ม
  const run = drainChain.then(
    () => drainOnce(consumers, opts),
    () => drainOnce(consumers, opts),
  );
  drainChain = run.catch(() => {});
  return run;
}

async function drainOnce(
  consumers: Record<string, OutboxHandler>,
  opts?: { limit?: number },
): Promise<{ processed: number; failed: number }> {
  const limit = opts?.limit ?? 50;
  const now = new Date();
  const candidates = await prisma.outboxEvent.findMany({
    where: { status: "PENDING", availableAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let processed = 0;
  let failed = 0;

  for (const evt of candidates) {
    // ── claim (lease) — atomic กัน drainer ซ้อน ──
    const claim = await prisma.outboxEvent.updateMany({
      where: { id: evt.id, status: "PENDING", availableAt: { lte: now } },
      data: { availableAt: new Date(now.getTime() + LEASE_MS) },
    });
    if (claim.count === 0) continue; // คนอื่นคว้าไปแล้ว

    const handler = consumers[evt.type];
    if (!handler) {
      // ไม่มี consumer สำหรับ type นี้ → พักไว้ (ไม่นับ fail) รอ deploy handler ใหม่
      await prisma.outboxEvent.update({
        where: { id: evt.id },
        data: { lastError: `ไม่มี consumer สำหรับ type "${evt.type}"` },
      });
      continue;
    }

    try {
      await handler({
        id: evt.id,
        tenantId: evt.tenantId,
        type: evt.type,
        payload: evt.payload,
        systemId: evt.systemId,
        unitId: evt.unitId,
      });
      await prisma.outboxEvent.update({
        where: { id: evt.id },
        data: { status: "DONE", processedAt: new Date(), lastError: null },
      });
      processed++;
    } catch (err) {
      const attempts = evt.attempts + 1;
      const backoffMin = Math.pow(2, attempts); // 2,4,8,16,32 นาที
      const dead = attempts >= MAX_ATTEMPTS;
      await prisma.outboxEvent.update({
        where: { id: evt.id },
        data: {
          attempts,
          status: dead ? "FAILED" : "PENDING",
          lastError: err instanceof Error ? err.message.slice(0, 500) : String(err),
          availableAt: new Date(Date.now() + backoffMin * 60_000),
        },
      });
      failed++;
    }
  }

  return { processed, failed };
}
