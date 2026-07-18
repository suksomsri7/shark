import { prisma } from "@/lib/core/db";
import type { Prisma, PrismaClient, SystemType } from "@prisma/client";

// "ระบบ" (System Instance) — สร้างได้หลายชุด ผูกกับกิจการ (unit). 1 unit → 1 ระบบ/ประเภท
type Client = PrismaClient | Prisma.TransactionClient;

// ประเภทระบบ feature ที่ provision อัตโนมัติต่อ unit
// (ระบบ opt-in อื่น เช่น COUPON/MEETING/KANBAN/ACCOUNT สร้างแยกเอง ไม่ผูก unit อัตโนมัติ)
type ProvisionType = "MEMBER" | "POINT" | "POS" | "REWARD";
const TYPES: ProvisionType[] = ["MEMBER", "POINT", "POS", "REWARD"];
const PROVISION_SET = new Set<SystemType>(TYPES);
const TYPE_LABEL: Record<ProvisionType, string> = {
  MEMBER: "สมาชิก",
  POINT: "แต้ม",
  POS: "ขายหน้าร้าน",
  REWARD: "รางวัล",
};

export type UnitSystems = Record<ProvisionType, string>;

// provision ระบบเริ่มต้น 3 ประเภทให้ unit (idempotent) — เรียกตอนสร้างกิจการ
export async function ensureUnitSystems(
  tenantId: string,
  unitId: string,
  unitName: string,
  client: Client = prisma,
): Promise<UnitSystems> {
  const out: Partial<UnitSystems> = {};
  for (const type of TYPES) {
    const link = await client.appSystemUnit.findUnique({
      where: { tenantId_unitId_type: { tenantId, unitId, type } },
    });
    if (link) {
      out[type] = link.systemId;
      continue;
    }
    const system = await client.appSystem.create({
      data: { tenantId, type, name: `${TYPE_LABEL[type]} · ${unitName}` },
    });
    await client.appSystemUnit.create({ data: { tenantId, systemId: system.id, unitId, type } });
    out[type] = system.id;
  }
  return out as UnitSystems;
}

// resolve ระบบของ unit (readonly) — null ถ้ายังไม่ผูก
export async function getUnitSystems(
  tenantId: string,
  unitId: string,
  client: Client = prisma,
): Promise<Partial<UnitSystems>> {
  const links = await client.appSystemUnit.findMany({ where: { tenantId, unitId } });
  const out: Partial<UnitSystems> = {};
  for (const l of links) if (PROVISION_SET.has(l.type)) out[l.type as ProvisionType] = l.systemId;
  return out;
}

export async function systemForUnit(
  tenantId: string,
  unitId: string,
  type: SystemType,
  client: Client = prisma,
): Promise<string | null> {
  const l = await client.appSystemUnit.findUnique({
    where: { tenantId_unitId_type: { tenantId, unitId, type } },
  });
  return l?.systemId ?? null;
}

// resolve unit(s) ที่ระบบหนึ่งผูกอยู่ (readonly) — ใช้ resolve ข้ามระบบผ่าน unit ร่วม
// (เช่น ระบบ MEMBER ที่ไม่มี unitId ใน ctx → หา unit ก่อน แล้วค่อยหา POS บน unit นั้น)
export async function unitsForSystem(
  tenantId: string,
  systemId: string,
  client: Client = prisma,
): Promise<string[]> {
  const links = await client.appSystemUnit.findMany({
    where: { tenantId, systemId },
    select: { unitId: true },
  });
  return links.map((l) => l.unitId);
}

// ── management ──
export async function listSystems(tenantId: string, type?: SystemType) {
  return prisma.appSystem.findMany({
    where: { tenantId, ...(type ? { type } : {}) },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    include: { units: true },
  });
}

export async function createSystem(tenantId: string, type: SystemType, name: string) {
  return prisma.appSystem.create({ data: { tenantId, type, name } });
}

// ผูก unit เข้าระบบ (ย้ายออกจากระบบเดิมของประเภทนั้นก่อน — 1 unit/1 ระบบ/ประเภท)
export async function linkUnit(tenantId: string, systemId: string, unitId: string) {
  const system = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId } });
  if (!system) return;
  await prisma.$transaction(async (tx) => {
    await tx.appSystemUnit.deleteMany({ where: { tenantId, unitId, type: system.type } });
    await tx.appSystemUnit.create({
      data: { tenantId, systemId, unitId, type: system.type },
    });
  });
}

export { TYPE_LABEL, TYPES };
