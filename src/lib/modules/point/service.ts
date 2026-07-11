import { prisma } from "@/lib/core/db";
import type { Prisma, PrismaClient } from "@prisma/client";

// Point (แต้ม) — scope ตาม systemId (ระบบแต้ม). Point คิดแต้มเอง (contract 2.2)
type Client = PrismaClient | Prisma.TransactionClient;

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

async function balanceIn(tx: Client, systemId: string, customerId: string): Promise<number> {
  const b = await tx.pointBalance.findUnique({
    where: { systemId_customerId: { systemId, customerId } },
  });
  return b?.balance ?? 0;
}

async function applyDelta(
  tx: Client,
  input: {
    tenantId: string;
    systemId: string;
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
  const dup = await tx.pointLedger.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
  });
  if (dup) return balanceIn(tx, input.systemId, input.customerId);
  await tx.pointLedger.create({ data: input });
  const updated = await tx.pointBalance.upsert({
    where: { systemId_customerId: { systemId: input.systemId, customerId: input.customerId } },
    create: {
      tenantId: input.tenantId,
      systemId: input.systemId,
      customerId: input.customerId,
      balance: input.delta,
    },
    update: { balance: { increment: input.delta } },
  });
  return updated.balance;
}

export async function earn(
  input: {
    tenantId: string;
    systemId: string;
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
    const cur = await balanceIn(tx, input.systemId, input.customerId);
    if (!settings.active) return { pointsEarned: 0, balance: cur };
    const points = Math.floor(input.amountSatang / settings.satangPerPoint);
    if (points <= 0) return { pointsEarned: 0, balance: cur };
    const balance = await applyDelta(tx, {
      tenantId: input.tenantId,
      systemId: input.systemId,
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

export async function burn(
  input: {
    tenantId: string;
    systemId: string;
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
    const current = await balanceIn(tx, input.systemId, input.customerId);
    const dup = await tx.pointLedger.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
    });
    if (!dup && current < input.points) throw new Error("แต้มไม่พอ");
    const balance = await applyDelta(tx, {
      tenantId: input.tenantId,
      systemId: input.systemId,
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

export async function reverse(
  input: { tenantId: string; systemId: string; refType: string; refId: string; idempotencyKey: string },
  client: Client = prisma,
): Promise<void> {
  await withTx(client, async (tx) => {
    const entries = await tx.pointLedger.findMany({
      where: {
        tenantId: input.tenantId,
        systemId: input.systemId,
        refType: input.refType,
        refId: input.refId,
        type: { in: ["EARN", "BURN"] },
      },
    });
    if (entries.length === 0) return;
    const byCustomer = new Map<string, number>();
    for (const e of entries) byCustomer.set(e.customerId, (byCustomer.get(e.customerId) ?? 0) - e.delta);
    let i = 0;
    for (const [customerId, delta] of byCustomer) {
      if (delta === 0) continue;
      await applyDelta(tx, {
        tenantId: input.tenantId,
        systemId: input.systemId,
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

export async function getBalance(systemId: string, customerId: string): Promise<number> {
  return balanceIn(prisma, systemId, customerId);
}

// รวมแต้มของลูกค้า จากระบบแต้มที่ผูกกับ unit เดียวกับระบบสมาชิกของลูกค้า
export async function getCustomerPoints(
  tenantId: string,
  memberSystemId: string,
  customerId: string,
): Promise<number> {
  const memberUnits = await prisma.appSystemUnit.findMany({
    where: { tenantId, systemId: memberSystemId },
    select: { unitId: true },
  });
  if (memberUnits.length === 0) return 0;
  const pointLinks = await prisma.appSystemUnit.findMany({
    where: { tenantId, type: "POINT", unitId: { in: memberUnits.map((u) => u.unitId) } },
    select: { systemId: true },
  });
  const pointSystemIds = [...new Set(pointLinks.map((p) => p.systemId))];
  if (pointSystemIds.length === 0) return 0;
  const balances = await prisma.pointBalance.findMany({
    where: { systemId: { in: pointSystemIds }, customerId },
    select: { balance: true },
  });
  return balances.reduce((s, b) => s + b.balance, 0);
}
