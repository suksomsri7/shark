import { prisma } from "@/lib/core/db";
import type { Prisma, PrismaClient } from "@prisma/client";

// Point (แต้ม) — service ตาม contract 2.2 (Point เป็นผู้คำนวณแต้มเสมอ)
// รับ client optional → join transaction ของผู้เรียก (POS/Booking)

type Client = PrismaClient | Prisma.TransactionClient;

// รัน fn ใน transaction (ถ้า client เป็น PrismaClient) หรือใช้ tx ที่ส่งมา
async function withTx<T>(client: Client, fn: (tx: Client) => Promise<T>): Promise<T> {
  if ("$transaction" in client && typeof client.$transaction === "function") {
    return (client as PrismaClient).$transaction((tx) => fn(tx));
  }
  return fn(client);
}

async function getSettings(client: Client, tenantId: string) {
  const s = await client.pointSettings.findUnique({ where: { tenantId } });
  if (s) return s;
  return client.pointSettings.create({ data: { tenantId } });
}

async function applyDelta(
  tx: Client,
  input: {
    tenantId: string;
    customerId: string;
    unitId?: string;
    delta: number;
    type: "EARN" | "BURN" | "ADJUST" | "REVERSE" | "EXPIRE";
    reason?: string;
    refType?: string;
    refId?: string;
    idempotencyKey: string;
  },
): Promise<number> {
  // idempotent: มี key นี้แล้ว → คืนยอดปัจจุบัน ไม่ทำซ้ำ
  const dup = await tx.pointLedger.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
  });
  if (dup) {
    const bal = await tx.pointBalance.findUnique({
      where: { tenantId_customerId: { tenantId: input.tenantId, customerId: input.customerId } },
    });
    return bal?.balance ?? 0;
  }
  await tx.pointLedger.create({ data: input });
  const updated = await tx.pointBalance.upsert({
    where: { tenantId_customerId: { tenantId: input.tenantId, customerId: input.customerId } },
    create: { tenantId: input.tenantId, customerId: input.customerId, balance: input.delta },
    update: { balance: { increment: input.delta } },
  });
  return updated.balance;
}

// ── earn: Point คิดแต้มจากยอดเงิน (สตางค์) ──
export async function earn(
  input: {
    tenantId: string;
    customerId: string;
    unitId?: string;
    amountSatang: number;
    sourceModule: string;
    refType: string;
    refId: string;
    idempotencyKey: string;
  },
  client: Client = prisma,
): Promise<{ pointsEarned: number; balance: number }> {
  return withTx(client, async (tx) => {
    const settings = await getSettings(tx, input.tenantId);
    if (!settings.active) return { pointsEarned: 0, balance: await balanceIn(tx, input.tenantId, input.customerId) };
    const points = Math.floor(input.amountSatang / settings.satangPerPoint);
    if (points <= 0) return { pointsEarned: 0, balance: await balanceIn(tx, input.tenantId, input.customerId) };
    const balance = await applyDelta(tx, {
      tenantId: input.tenantId,
      customerId: input.customerId,
      unitId: input.unitId,
      delta: points,
      type: "EARN",
      reason: `สะสมจาก ${input.sourceModule}`,
      refType: input.refType,
      refId: input.refId,
      idempotencyKey: input.idempotencyKey,
    });
    return { pointsEarned: points, balance };
  });
}

// ── burn: ใช้แต้ม (ต้องพอ) ──
export async function burn(
  input: {
    tenantId: string;
    customerId: string;
    points: number;
    refType: string;
    refId: string;
    idempotencyKey: string;
  },
  client: Client = prisma,
): Promise<{ balance: number }> {
  if (input.points <= 0) throw new Error("points ต้อง > 0");
  return withTx(client, async (tx) => {
    const current = await balanceIn(tx, input.tenantId, input.customerId);
    const dup = await tx.pointLedger.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
    });
    if (!dup && current < input.points) throw new Error("แต้มไม่พอ");
    const balance = await applyDelta(tx, {
      tenantId: input.tenantId,
      customerId: input.customerId,
      delta: -input.points,
      type: "BURN",
      refType: input.refType,
      refId: input.refId,
      idempotencyKey: input.idempotencyKey,
    });
    return { balance };
  });
}

// ── reverse: กลับรายการของ ref (void/refund) ──
export async function reverse(
  input: { tenantId: string; refType: string; refId: string; idempotencyKey: string },
  client: Client = prisma,
): Promise<void> {
  await withTx(client, async (tx) => {
    const entries = await tx.pointLedger.findMany({
      where: { tenantId: input.tenantId, refType: input.refType, refId: input.refId, type: { in: ["EARN", "BURN"] } },
    });
    if (entries.length === 0) return;
    const byCustomer = new Map<string, number>();
    for (const e of entries) byCustomer.set(e.customerId, (byCustomer.get(e.customerId) ?? 0) - e.delta);
    let i = 0;
    for (const [customerId, delta] of byCustomer) {
      if (delta === 0) continue;
      await applyDelta(tx, {
        tenantId: input.tenantId,
        customerId,
        delta,
        type: "REVERSE",
        reason: "กลับรายการ",
        refType: input.refType,
        refId: input.refId,
        idempotencyKey: `${input.idempotencyKey}:${i++}`,
      });
    }
  });
}

async function balanceIn(tx: Client, tenantId: string, customerId: string): Promise<number> {
  const b = await tx.pointBalance.findUnique({
    where: { tenantId_customerId: { tenantId, customerId } },
  });
  return b?.balance ?? 0;
}

export async function getBalance(tenantId: string, customerId: string): Promise<number> {
  return balanceIn(prisma, tenantId, customerId);
}

export async function getLedger(tenantId: string, customerId: string) {
  return prisma.pointLedger.findMany({
    where: { tenantId, customerId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
