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
// C5.4 (hunter H4): 6 นาที > เพดานเวลาที่ฟังก์ชันหนึ่งรันได้จริง (Vercel 300 วิ) — lease สั้นกว่าชีวิตของ drainer ⇒ อีกตัวหยิบ event
//   ที่ยังทำอยู่ไปทำซ้ำ (และความล้มของเจ้าของเดิมไม่มีวันลงแถว) · แลกกับ: event ของ drainer ที่ตายกลางคันรอ 6 นาทีแทน 1 นาที
const LEASE_MS = 6 * 60_000;

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
 * K3.3 — emit **นอก transaction** (ใช้ client กลางของโปรเซสเอง)
 *
 * 🔴 มีไว้ให้โมดูลที่เขียนงานหลักผ่าน `tenantDb(ctx)` เท่านั้น: client ที่ถูก `$extends` แล้ว
 *    ส่งเข้า `emitOutbox` ไม่ได้ (ชนิดไม่ตรงกับ `Prisma.TransactionClient`) และการลาก `prisma` ดิบ
 *    เข้าไปในโมดูลก็ผิดกติกา chokepoint (fitness F5.1 — raw prisma ในโมดูลห้ามเพิ่ม)
 *
 * ⚠️ **ไม่ atomic กับงานหลัก** — เรียกได้เฉพาะ event ที่ "ตกหล่นแล้วไม่มีเงินหาย":
 *    ใช้กับ `hr.leave.submitted` (พลาด = การ์ดหาคนแทนไม่เกิด ซึ่งคนยังเห็นใบลาในระบบ HR ตามปกติ)
 *    🔴 ห้ามใช้กับ event ที่ผูกกับเงิน/เอกสารบัญชี — พวกนั้นต้อง `emitOutbox(tx, …)` ใน tx เดียวกับงานหลัก
 *    idempotencyKey ยังกันซ้ำเหมือนเดิม ⇒ เรียกซ้ำไม่เพิ่มแถว
 */
export async function emitOutboxOutsideTx(input: {
  tenantId: string;
  type: string;
  idempotencyKey: string;
  payload?: unknown;
  systemId?: string | null;
  unitId?: string | null;
}): Promise<void> {
  await emitOutbox(prisma, input);
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

// รอบต่อการเรียก 1 ครั้ง × 50 event = 500 event · งบเวลา 20 วิ (แลมบ์ดา Vercel ตัดที่ ~60 วิ · ส่วนที่เหลือ = drain ครั้งถัดไป:
// `scheduleDrain` หลังงานเขียนของโมดูล · `/api/cron/hourly` (C5.4 — ระบายทุกต้นชั่วโมงจริงแล้ว) · `/api/cron/tick` รายวัน)
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
    // 🔴 เลิกเมื่อ **รอบหนึ่งไม่มีอะไรให้หยิบเลย** (ไม่ใช่ "หยิบได้ไม่เต็มรอบ" — M2.3 · 10 ก.ย. 2569)
    //    เหตุ: consumer บางตัว **สร้าง event ใหม่** ระหว่างรอบนั้นเอง (booking.completed → ประทับสแตมป์
    //    → stamp.added) · แบบเดิมรอบนั้นหยิบได้ 47 จาก 200 แล้วเลิกทันที ⇒ event ที่เพิ่งเกิดค้าง PENDING
    //    จนกว่า cron รายชั่วโมงจะมาเก็บ ทั้งที่ตัวระบายยังทำงานอยู่ตรงนั้น (คิว "เงียบ" ทั้งที่ยังไม่ว่าง)
    //    ยังจบแน่นอน: event ที่ไม่มี consumer/ล้มเหลว ถูกเลื่อน availableAt ไปอนาคตแล้ว รอบถัดไปจึงไม่หยิบซ้ำ
    //    + ยังมีเพดาน MAX_ROUNDS และงบเวลาคุมอยู่เหมือนเดิม
    if (r.picked === 0) break;
    if (Date.now() - started > TIME_BUDGET_MS) break;
  }
  return total;
}

/**
 * สุขภาพของคิว event — ใช้โดย cron รายวัน (`runDailyCron` หลัง drain) เพื่อ "ส่งเสียง" เมื่อมีอะไรค้างผิดปกติ
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
  const roundStart = new Date();
  const candidates = await prisma.outboxEvent.findMany({
    where: { status: "PENDING", availableAt: { lte: roundStart } },
    // CRM C2.7-fix ▸ แถวจาก emitOutboxMany คำสั่งเดียวมี createdAt เท่ากัน — id (cuid เรียงตามลำดับที่เขียน) ตัดสินให้แน่นอน
    //   (กันไว้อีกชั้นเท่านั้น: ตัวรับต้องไม่พึ่งลำดับ เพราะตัวระบายหลายตัว/การลองใหม่ทำให้ลำดับสลับได้เสมอ) ◂
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
  });

  let processed = 0;
  let failed = 0;

  for (const evt of candidates) {
    // ── claim (lease) — atomic กัน drainer ซ้อน ──
    // 🔴 C5.4 (L3-M3): lease นับจาก **เวลาที่ claim ใบนี้** ไม่ใช่เวลาเริ่มรอบ — รอบหนึ่งทำได้ถึง 50 ใบทีละใบ
    //    (webhook ที่ timeout 5 วิ × หลายใบ = เกิน 60 วิได้จริง) ⇒ แบบเดิมใบท้าย ๆ ได้ lease ที่ "หมดอายุตั้งแต่เกิด"
    //    แล้ว drainer อีกตัว (after() ของแลมบ์ดาอื่น / cron) หยิบซ้ำทันที = ฮุคยิงซ้ำ · กฎ v1 ทำงานซ้ำ
    //    `lease` เก็บค่าที่เขียนจริงไว้ ⇒ ขาปิดงานด้านล่างเขียนได้เฉพาะเมื่อ "ยังเป็นเจ้าของ lease นี้อยู่"
    const claimAt = new Date();
    const lease = new Date(claimAt.getTime() + LEASE_MS);
    const claim = await prisma.outboxEvent.updateMany({
      where: { id: evt.id, status: "PENDING", availableAt: { lte: claimAt } },
      data: { availableAt: lease },
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
      // 🔴 C5.4 (L3-M3): ปิดงานแบบมีเงื่อนไข — แถวต้องยัง PENDING (ไม่มีใครปิดไปก่อน) · สำเร็จ = DONE ได้เสมอ
      //    แม้ lease จะหลุดไปเป็นของ drainer อื่นแล้ว (งานเสร็จจริง · ตัวที่ถือ lease อยู่จะปิดไม่ได้เพราะไม่ใช่ PENDING แล้ว)
      await prisma.outboxEvent.updateMany({
        where: { id: evt.id, status: "PENDING" },
        data: { status: "DONE", processedAt: new Date(), lastError: null },
      });
      processed++;
    } catch (err) {
      const attempts = evt.attempts + 1;
      const backoffMin = Math.pow(2, attempts); // 2,4,8,16,32 นาที
      const dead = attempts >= MAX_ATTEMPTS;
      // 🔴 C5.4 (L3-M3): ขาล้มเขียนได้เฉพาะเมื่อ **ยังถือ lease ของตัวเองอยู่** (status PENDING + availableAt = lease ที่เขียนไว้)
      //    เดิมเขียนทับไม่มีเงื่อนไข ⇒ ตัวซ้ำที่ล้มหลังอีกตัวทำสำเร็จแล้ว พลิก DONE กลับเป็น PENDING (attempts+1) = รอบที่สาม
      //    lease หลุดไปแล้ว = คนอื่นรับช่วงไปแล้ว ⇒ ความล้มของรอบนี้ไม่มีสิทธิ์ตัดสินสถานะของแถว (นับ failed ในสถิติของรอบเท่านั้น)
      await prisma.outboxEvent.updateMany({
        where: { id: evt.id, status: "PENDING", availableAt: lease },
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
