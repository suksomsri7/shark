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

// คืนแต้มแบบเจาะจงจำนวน (ใช้ตอนยกเลิกการแลกรางวัล — คืนเท่า pointsCost ของรายการนั้น ๆ)
// ต่างจาก reverse() ที่กลับ "ทุก" รายการตาม refType+refId — credit คืนเป๊ะตามที่ระบุ + idempotent ผ่าน key
export async function credit(
  input: {
    tenantId: string;
    systemId: string;
    customerId: string;
    points: number;
    reason?: string;
    refType: string;
    refId: string;
    idempotencyKey: string;
  },
  client: Client = prisma,
): Promise<{ balance: number }> {
  if (input.points <= 0) throw new Error("points ต้อง > 0");
  return withTx(client, async (tx) => {
    const balance = await applyDelta(tx, {
      tenantId: input.tenantId,
      systemId: input.systemId,
      customerId: input.customerId,
      delta: input.points,
      type: "REVERSE",
      reason: input.reason ?? "คืนแต้ม",
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

// ── ตั้งค่าอัตราสะสม (tenant-scoped) ──
// อ่านค่าจริง (สร้าง default ให้ถ้ายังไม่มี) — UI ใช้ prefill ฟอร์ม
export async function getPointSettings(tenantId: string) {
  return getSettings(prisma, tenantId);
}

// บันทึกอัตราสะสม: satangPerPoint = จำนวนสตางค์ที่ใช้จ่าย = 1 แต้ม (25 บาท=1แต้ม → 2500)
// validate ≥ 1 (จำนวนเต็มสตางค์) · find→update/create (ห้าม upsert ตามกติกา)
export async function setPointSettings(
  tenantId: string,
  input: { satangPerPoint: number; active: boolean },
) {
  const spp = Math.round(input.satangPerPoint);
  if (!Number.isFinite(spp) || spp < 1) {
    throw new Error("อัตราสะสมต้องเป็นจำนวนเต็มสตางค์อย่างน้อย 1");
  }
  const existing = await prisma.pointSettings.findUnique({ where: { tenantId } });
  if (existing) {
    return prisma.pointSettings.update({
      where: { tenantId },
      data: { satangPerPoint: spp, active: input.active },
    });
  }
  return prisma.pointSettings.create({
    data: { tenantId, satangPerPoint: spp, active: input.active },
  });
}

// ── ปรับ/แจกแต้มด้วยมือ (พนักงาน) — type ADJUST ──
// delta > 0 = แจก · delta < 0 = หัก (กันแต้มติดลบ) · idempotent ผ่าน key (คีย์เดิมไม่เบิ้ล)
export async function adjustPoints(
  input: {
    tenantId: string;
    systemId: string;
    customerId: string;
    unitId?: string;
    delta: number;
    reason?: string;
    idempotencyKey: string;
  },
  client: Client = prisma,
): Promise<{ balance: number }> {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new Error("จำนวนแต้มต้องเป็นจำนวนเต็มที่ไม่เท่ากับ 0");
  }
  return withTx(client, async (tx) => {
    // ยิงซ้ำคีย์เดิม → คืนยอดปัจจุบัน ไม่ทำรายการใหม่ (กันเบิ้ล + กัน guard พลาดตอน re-run)
    const dup = await tx.pointLedger.findUnique({
      where: {
        tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey },
      },
    });
    if (dup) return { balance: await balanceIn(tx, input.systemId, input.customerId) };
    if (input.delta < 0) {
      const cur = await balanceIn(tx, input.systemId, input.customerId);
      if (cur + input.delta < 0) throw new Error("แต้มคงเหลือไม่พอสำหรับการหัก");
    }
    const balance = await applyDelta(tx, {
      tenantId: input.tenantId,
      systemId: input.systemId,
      customerId: input.customerId,
      unitId: input.unitId,
      delta: input.delta,
      type: "ADJUST",
      reason: input.reason || (input.delta > 0 ? "แจกแต้มโดยพนักงาน" : "หักแต้มโดยพนักงาน"),
      idempotencyKey: input.idempotencyKey,
    });
    return { balance };
  });
}

// ── สมาชิกที่ปรับแต้มในระบบแต้มนี้ได้ — จากระบบสมาชิก (MEMBER) ที่ผูก unit เดียวกับระบบแต้ม ──
// pattern เดียวกับ reward.listRewardCustomers (แต่ resolve จากฝั่งระบบแต้ม)
export async function listPointCustomers(
  tenantId: string,
  pointSystemId: string,
): Promise<{ id: string; name: string | null; memberCode: string; phone: string | null }[]> {
  const pointUnits = await prisma.appSystemUnit.findMany({
    where: { tenantId, systemId: pointSystemId },
    select: { unitId: true },
  });
  if (pointUnits.length === 0) return [];
  const memberLinks = await prisma.appSystemUnit.findMany({
    where: { tenantId, type: "MEMBER", unitId: { in: pointUnits.map((u) => u.unitId) } },
    select: { systemId: true },
  });
  const memberSystemIds = [...new Set(memberLinks.map((m) => m.systemId))];
  if (memberSystemIds.length === 0) return [];
  const rows = await prisma.customer.findMany({
    where: { tenantId, memberSystemId: { in: memberSystemIds } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, name: true, memberCode: true, phone: true },
  });
  return rows.map((c) => ({ ...c, memberCode: c.memberCode ?? "" }));
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
