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

/**
 * WO 9.3 — emit หลาย event ใน **คำสั่งเดียว**
 *
 * `emitOutbox` ตัวเดียวใช้ 2 คำสั่ง (findUnique + create) ⇒ งานที่ emit 2 event เช่น `recordPayment`
 * (`account.payment.recorded` + `account.invoice.paid`) กิน 4 คำสั่งใน transaction ที่ล็อกแถวเอกสารอยู่
 * → ยืดเวลาถือล็อกโดยไม่จำเป็น
 *
 * ตัวนี้ใช้ `createMany({ skipDuplicates: true })` = 1 คำสั่ง และยังคง idempotent ชั้นเดียวกันเป๊ะ
 * เพราะ skipDuplicates อาศัย `@@unique(tenantId, idempotencyKey)` ตัวเดิม (ข้ามแถวที่ชนโดยไม่ abort tx
 * ซึ่งเป็นเหตุผลเดียวกับที่ `emitOutbox` เลือก "เช็คก่อนสร้าง" แทน catch)
 *
 * 🔴 event ทุกชนิดที่ส่งเข้ามาต้องมี consumer ที่ `src/lib/outbox-consumers.ts` เหมือนกับ `emitOutbox`
 */
export async function emitOutboxMany(
  tx: Tx,
  inputs: {
    tenantId: string;
    type: string;
    idempotencyKey: string;
    payload?: unknown;
    systemId?: string | null;
    unitId?: string | null;
  }[],
): Promise<void> {
  if (inputs.length === 0) return;
  await tx.outboxEvent.createMany({
    data: inputs.map((input) => ({
      tenantId: input.tenantId,
      type: input.type,
      idempotencyKey: input.idempotencyKey,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      systemId: input.systemId ?? null,
      unitId: input.unitId ?? null,
    })),
    skipDuplicates: true,
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
    () => drainUntilQuiet(consumers, opts),
    () => drainUntilQuiet(consumers, opts),
  );
  drainChain = run.catch(() => {});
  return run;
}

// รอบต่อการเรียก 1 ครั้ง × 50 event = 500 event · งบเวลา 20 วิ (แลมบ์ดา Vercel ตัดที่ ~60 วิ · cron รายชั่วโมงเก็บตกส่วนที่เหลือ)
const MAX_ROUNDS = 10;
const TIME_BUDGET_MS = 20_000;

/**
 * ระบายคิว **หลายรอบจนเงียบ** (รอบละ `limit`) — ไม่ใช่รอบเดียวแล้วเลิก
 *
 * 🔴 ทำไม (5 ก.ย. 2026 · WO C4): พอทุกการสร้าง/แก้ผู้ติดต่อ-สินค้า-ออกเอกสาร ยิง event ด้วย
 *    การนำเข้า CSV 200 ราย = 200 event ในนาทีเดียว · แบบเดิมหยิบ 50 ตัวเก่าสุดแล้วเลิก
 *    ⇒ event ที่มาทีหลัง (ข้อความแชท · invoice.paid · ฮุคของร้านอื่น) **ต่อคิวข้างหลัง** รอ cron รายชั่วโมง
 *    ระบายทีละ 50 = หน่วงเป็นชั่วโมง (ข้อสอบ qc:all จับได้ก่อน: seed สร้าง 183 event → ชุดถัดไป drain แล้ว event ตัวเองไม่ถูกหยิบ)
 * - เลิกเมื่อรอบล่าสุดหยิบได้น้อยกว่า `limit` (คิวหมดแล้ว) หรือครบ `MAX_ROUNDS` หรือเกินงบเวลา
 * - ยังปลอดภัยเรื่อง drainer ซ้อน: ทุก event ถูก claim ด้วย lease เหมือนเดิม
 */
async function drainUntilQuiet(
  consumers: Record<string, OutboxHandler>,
  opts?: { limit?: number },
): Promise<{ processed: number; failed: number }> {
  const limit = opts?.limit ?? 50;
  const started = Date.now();
  const total = { processed: 0, failed: 0 };
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const r = await drainOnce(consumers, { limit });
    total.processed += r.processed;
    total.failed += r.failed;
    // หยิบได้ไม่เต็มรอบ = ไม่มีอะไรรอแล้ว (นับรวมที่ถูกข้าม/พักไว้ด้วย จึงดูจาก candidates ไม่ใช่ processed)
    if (r.picked < limit) break;
    if (Date.now() - started > TIME_BUDGET_MS) break;
  }
  return total;
}

/**
 * สุขภาพของคิว event — ใช้โดย cron รายชั่วโมงเพื่อ "ส่งเสียง" เมื่อมีอะไรค้างผิดปกติ
 *
 * 🔴 ทำไมต้องมี (30 ส.ค. 2026): คิวตันทั้งระบบเพราะ event ชนิดใหม่ไม่มีตัวรับ แล้ว
 *    **ไม่มีใครรู้เลย** จนลูกค้ามาบอกว่าข้อความไม่ถึง · ตาข่ายนิรภัย (cron ระบายคิว) มีอยู่แล้ว
 *    แต่ตาข่ายที่ไม่มีสัญญาณเตือน = เรารู้ตัวช้ากว่าผู้ใช้เสมอ
 *
 * - `stale` = ยังไม่ถูกประมวลผลทั้งที่เก่ากว่าหน้าต่างปกติมาก (drain ทำงานทุกครั้งที่มี event
 *   และ cron ก็กวาดรายชั่วโมง ⇒ เกิน 15 นาทีคือผิดปกติแน่นอน)
 * - `dead` = ลองครบจำนวนครั้งแล้วยังไม่สำเร็จ (`FAILED`) — ไม่มีใครยิงซ้ำให้อีก ต้องมีคนมาดู
 */
export async function outboxHealth(
  now: Date,
  staleMs = 15 * 60_000,
): Promise<{ stale: number; dead: number; oldestStaleMin: number }> {
  const cutoff = new Date(now.getTime() - staleMs);
  const [stale, dead, oldest] = await Promise.all([
    prisma.outboxEvent.count({ where: { status: "PENDING", createdAt: { lt: cutoff } } }),
    prisma.outboxEvent.count({ where: { status: "FAILED" } }),
    prisma.outboxEvent.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);
  const oldestStaleMin = oldest ? Math.floor((now.getTime() - oldest.createdAt.getTime()) / 60_000) : 0;
  return { stale, dead, oldestStaleMin };
}

async function drainOnce(
  consumers: Record<string, OutboxHandler>,
  opts?: { limit?: number },
): Promise<{ processed: number; failed: number; picked: number }> {
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
      // 🔴 ต้อง **ส่งเสียง** ด้วย — 30 ส.ค. 2026 มี type ใหม่ที่ลืมลงทะเบียน แล้ว event
      //    นอนค้างเงียบ ๆ อยู่หลายชั่วโมงโดยไม่มีใครรู้ (ปลายทางเห็นเป็น "ระบบไม่ทำงาน")
      //    logOps มี throttle 60 นาที/source อยู่แล้ว จึงไม่ท่วมแม้ drain จะวนบ่อย
      await prisma.outboxEvent.update({
        where: { id: evt.id },
        data: { lastError: `ไม่มี consumer สำหรับ type "${evt.type}"` },
      });
      try {
        const { logOps } = await import("@/lib/core/ops");
        await logOps("ERROR", "outbox", `ไม่มี consumer สำหรับ event "${evt.type}" — ค้างคิวจนกว่าจะลงทะเบียน`, {
          detail: `eventId=${evt.id} tenantId=${evt.tenantId}`,
          tenantId: evt.tenantId,
        });
      } catch { /* ห้ามให้การ log ทำ drain พัง */ }
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

  return { processed, failed, picked: candidates.length };
}
