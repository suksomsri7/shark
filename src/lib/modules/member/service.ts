import { prisma } from "@/lib/core/db";
import { cell, columnIndex, type CsvTable, type ImportSummary } from "@/lib/core/csv";
import type { MemberTier, Prisma, PrismaClient } from "@prisma/client";

// Member (แกนกลาง CRM) — service ที่โมดูลอื่นเรียก (contract 2.6/2.7)
// รับ client optional เพื่อ join transaction ของผู้เรียก (Booking/POS)

type Client = PrismaClient | Prisma.TransactionClient;

// tier จากยอดสะสม (สตางค์)
export function computeTier(totalSpentSatang: number): MemberTier {
  if (totalSpentSatang >= 3_000_000) return "PLATINUM";
  if (totalSpentSatang >= 1_000_000) return "GOLD";
  if (totalSpentSatang >= 300_000) return "SILVER";
  return "MEMBER";
}

// รหัสสมาชิก 6 ตัว (ตัดตัวสับสน 0/O/1/I)
const CODE_ALPHABET = "ACDEFGHJKLMNPQRSTUVWXY3456789";
function randCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}
async function uniqueMemberCode(client: Client, memberSystemId: string): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const code = randCode();
    const exists = await client.customer.findFirst({ where: { memberSystemId, memberCode: code } });
    if (!exists) return code;
  }
  return randCode() + randCode().slice(0, 2);
}

function normEmail(e?: string | null) {
  return e?.trim().toLowerCase() || null;
}
function normPhone(p?: string | null) {
  return p?.trim() || null;
}

// ── contract 2.6 findOrCreate (dedup by phone→email ต่อ tenant) ──
export async function findOrCreate(
  input: {
    tenantId: string;
    memberSystemId: string;
    phone?: string;
    email?: string;
    name?: string;
    source: "AUTO" | "STAFF" | "SELF" | "IMPORT";
    consents?: string[];
  },
  client: Client = prisma,
) {
  const { memberSystemId } = input;
  const phone = normPhone(input.phone);
  const email = normEmail(input.email);
  let c = (phone && (await client.customer.findFirst({ where: { memberSystemId, phone } }))) || null;
  if (!c && email) {
    c = await client.customer.findFirst({ where: { memberSystemId, email } });
  }
  if (c) return c;
  const memberCode = await uniqueMemberCode(client, memberSystemId);
  const marketing = !!input.consents?.includes("marketing");
  return client.customer.create({
    data: {
      tenantId: input.tenantId,
      memberSystemId,
      memberCode,
      name: input.name?.trim() || null,
      phone,
      email,
      marketingConsent: marketing,
      consentAt: input.consents?.length ? new Date() : null,
    },
  });
}

// ── contract 2.7 activity.log ──
export async function logActivity(
  input: {
    tenantId: string;
    customerId: string;
    unitId?: string;
    module: string;
    type: string;
    refType?: string;
    refId?: string;
    summary: string;
  },
  client: Client = prisma,
) {
  await client.memberActivity.create({ data: input });
}

// ── นับการมาใช้บริการ (จำนวนครั้ง) ──
export async function recordVisit(tenantId: string, customerId: string, client: Client = prisma) {
  const c = await client.customer.findFirst({ where: { id: customerId, tenantId } });
  if (!c) return;
  await client.customer.update({
    where: { id: customerId },
    data: { visitCount: { increment: 1 } },
  });
}

// ── บันทึกยอดใช้จ่าย (เรียกโดย POS createSale) → อัปเดต tier ──
export async function recordSpend(
  tenantId: string,
  customerId: string,
  amountSatang: number,
  client: Client = prisma,
) {
  const c = await client.customer.findFirst({ where: { id: customerId, tenantId } });
  if (!c) return;
  const total = c.totalSpentSatang + amountSatang;
  await client.customer.update({
    where: { id: customerId },
    data: { totalSpentSatang: total, tier: computeTier(total) },
  });
}

// ── dashboard: list + search ──
export async function listCustomers(tenantId: string, search?: string) {
  const q = search?.trim();
  return prisma.customer.findMany({
    where: {
      tenantId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { memberCode: { contains: q.toUpperCase() } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

// ── นำเข้าลูกค้าจาก CSV (WO Wave6-A) — reuse findOrCreate (dedup เบอร์→อีเมล) ──
// header ที่รองรับ (ไทย/อังกฤษ) — normalize ตัดช่องว่าง/พิมพ์เล็กแล้วเทียบ
const MEMBER_COLS = {
  name: ["name", "ชื่อ", "ชื่อลูกค้า", "ชื่อสมาชิก", "ชื่อ-นามสกุล", "ชื่อนามสกุล", "fullname"],
  phone: ["phone", "เบอร์", "เบอร์โทร", "เบอร์โทรศัพท์", "โทรศัพท์", "โทร", "tel", "mobile", "phoneno", "phonenumber"],
  email: ["email", "อีเมล", "อีเมล์", "e-mail", "mail"],
};

// นำเข้าทีละแถว: ต้องมีชื่อหรือเบอร์อย่างน้อย 1 · ตรวจซ้ำ (เบอร์→อีเมล) = ข้าม · ที่เหลือ findOrCreate
// ctx.systemId = memberSystemId (Customer เป็น member-scoped)
export async function importCustomers(
  ctx: { tenantId: string; systemId: string },
  table: CsvTable,
): Promise<ImportSummary> {
  const iName = columnIndex(table.headers, MEMBER_COLS.name);
  const iPhone = columnIndex(table.headers, MEMBER_COLS.phone);
  const iEmail = columnIndex(table.headers, MEMBER_COLS.email);
  const summary: ImportSummary = { created: 0, skipped: 0, errors: [] };

  for (let r = 0; r < table.rows.length; r++) {
    const rowNo = r + 2; // +1 header, +1 = เลขแถวแบบ 1-based ที่ผู้ใช้เห็นใน Excel
    const row = table.rows[r];
    const name = cell(row, iName);
    const phone = normPhone(cell(row, iPhone));
    const email = normEmail(cell(row, iEmail));
    if (!name && !phone) {
      summary.errors.push({ row: rowNo, reason: "ต้องมีชื่อหรือเบอร์อย่างน้อย 1 อย่าง" });
      continue;
    }
    try {
      // ตรวจซ้ำแบบเดียวกับ findOrCreate (เบอร์ก่อน แล้วอีเมล) เพื่อแยกนับ created/skipped
      let existing =
        (phone && (await prisma.customer.findFirst({ where: { tenantId: ctx.tenantId, memberSystemId: ctx.systemId, phone } }))) ||
        null;
      if (!existing && email) {
        existing = await prisma.customer.findFirst({
          where: { tenantId: ctx.tenantId, memberSystemId: ctx.systemId, email },
        });
      }
      if (existing) {
        summary.skipped += 1;
        continue;
      }
      await findOrCreate({
        tenantId: ctx.tenantId,
        memberSystemId: ctx.systemId,
        name: name || undefined,
        phone: phone || undefined,
        email: email || undefined,
        source: "IMPORT",
      });
      summary.created += 1;
    } catch (e) {
      summary.errors.push({ row: rowNo, reason: e instanceof Error ? e.message.slice(0, 120) : "เกิดข้อผิดพลาด" });
    }
  }
  return summary;
}

export async function getProfile(tenantId: string, id: string) {
  const customer = await prisma.customer.findFirst({ where: { id, tenantId } });
  if (!customer) return null;
  const activities = await prisma.memberActivity.findMany({
    where: { tenantId, customerId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return { customer, activities };
}
