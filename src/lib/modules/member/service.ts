import { prisma, tenantDb } from "@/lib/core/db";
import { cell, columnIndex, type CsvTable, type ImportSummary } from "@/lib/core/csv";
import type { MemberTier, Prisma, PrismaClient } from "@prisma/client";

// Member (แกนกลาง CRM) — service ที่โมดูลอื่นเรียก (contract 2.6/2.7)
// รับ client optional เพื่อ join transaction ของผู้เรียก (Booking/POS)

type Client = PrismaClient | Prisma.TransactionClient;

// tier จากยอดสะสม (สตางค์) — ค่า hardcode เดิม (คงไว้ให้ callsite เก่า/ข้อสอบเก่าใช้ได้)
export function computeTier(totalSpentSatang: number): MemberTier {
  if (totalSpentSatang >= 3_000_000) return "PLATINUM";
  if (totalSpentSatang >= 1_000_000) return "GOLD";
  if (totalSpentSatang >= 300_000) return "SILVER";
  return "MEMBER";
}

// ─────────────────────────── ระดับสมาชิกกำหนดเอง (MemberTierConfig) ───────────────────────────
// เจ้าของร้านตั้งชื่อ + ยอดขั้นต่ำของแต่ละระดับได้เอง (SILVER/GOLD/PLATINUM) · ไม่ตั้ง = ค่า default เดิม
// scope: tenant (เกณฑ์ชุดเดียวใช้ทั้งร้าน) — ลูกค้าเลื่อนระดับอัตโนมัติตามยอดสะสม

export type TierName = "SILVER" | "GOLD" | "PLATINUM";
export type TierConfigRow = { tier: TierName; label: string; minSpendSatang: number };

// ลำดับระดับจากต่ำ→สูง (ใช้จัดเรียงผลลัพธ์ + วนคำนวณให้ deterministic)
const TIER_ORDER: TierName[] = ["SILVER", "GOLD", "PLATINUM"];

// ค่า default เดิม (สตางค์) — ตรงกับ computeTier hardcode
const DEFAULT_TIER_CONFIG: TierConfigRow[] = [
  { tier: "SILVER", label: "SILVER", minSpendSatang: 300_000 },
  { tier: "GOLD", label: "GOLD", minSpendSatang: 1_000_000 },
  { tier: "PLATINUM", label: "PLATINUM", minSpendSatang: 3_000_000 },
];

// อ่านเกณฑ์ระดับของร้าน (ผ่าน tenantDb) — ไม่ครบ 3 ระดับ = เติมด้วยค่า default ต่อระดับ
export async function getTierConfig(ctx: { tenantId: string }): Promise<TierConfigRow[]> {
  const rows = await tenantDb(ctx).memberTierConfig.findMany();
  const byTier = new Map(rows.map((r) => [r.tier as TierName, r]));
  return TIER_ORDER.map((tier) => {
    const r = byTier.get(tier);
    if (r) return { tier, label: r.label, minSpendSatang: r.minSpendSatang };
    return DEFAULT_TIER_CONFIG.find((d) => d.tier === tier) as TierConfigRow;
  });
}

// tier จากยอดสะสม (สตางค์) ตาม config ของร้าน (pure) — ใช้แทน computeTier ในจุดบันทึกยอด
export function computeTierFor(totalSpentSatang: number, config: TierConfigRow[]): MemberTier {
  const min = (t: TierName) =>
    config.find((c) => c.tier === t)?.minSpendSatang ??
    (DEFAULT_TIER_CONFIG.find((d) => d.tier === t) as TierConfigRow).minSpendSatang;
  if (totalSpentSatang >= min("PLATINUM")) return "PLATINUM";
  if (totalSpentSatang >= min("GOLD")) return "GOLD";
  if (totalSpentSatang >= min("SILVER")) return "SILVER";
  return "MEMBER";
}

// ชื่อระดับที่แสดงผล (helper) — MEMBER = "สมาชิก" · อื่น ๆ ใช้ label จาก config
export function tierLabel(config: TierConfigRow[], tier: MemberTier): string {
  if (tier === "MEMBER") return "สมาชิก";
  return config.find((c) => c.tier === tier)?.label ?? tier;
}

// บันทึกเกณฑ์ระดับ (validate + upsert find→update/create + recompute ลูกค้าทุกคนของร้าน)
export async function setTierConfig(ctx: { tenantId: string }, rows: TierConfigRow[]): Promise<void> {
  const byTier = new Map(rows.map((r) => [r.tier, r]));
  const ordered = TIER_ORDER.map((t) => byTier.get(t));
  if (ordered.some((r) => !r)) throw new Error("ต้องกำหนดครบทั้ง 3 ระดับ (SILVER, GOLD, PLATINUM)");
  const [silver, gold, platinum] = ordered as TierConfigRow[];

  for (const r of [silver, gold, platinum]) {
    if (!r.label.trim()) throw new Error("ชื่อระดับห้ามว่าง");
    if (!Number.isFinite(r.minSpendSatang) || r.minSpendSatang < 0) {
      throw new Error("ยอดขั้นต่ำต้องเป็นจำนวนไม่ติดลบ");
    }
  }
  if (!(silver.minSpendSatang < gold.minSpendSatang && gold.minSpendSatang < platinum.minSpendSatang)) {
    throw new Error("ยอดขั้นต่ำต้องเรียงจากน้อยไปมาก: SILVER < GOLD < PLATINUM");
  }

  // upsert แบบ find→update/create (tenantDb().upsert ใช้กับ compound-unique ไม่ได้ · create ใส่ tenantId ตรง ๆ)
  const db = tenantDb(ctx);
  for (const r of [silver, gold, platinum]) {
    const label = r.label.trim();
    const minSpendSatang = Math.round(r.minSpendSatang);
    const existing = await db.memberTierConfig.findFirst({ where: { tier: r.tier } });
    if (existing) {
      await db.memberTierConfig.update({ where: { id: existing.id }, data: { label, minSpendSatang } });
    } else {
      await db.memberTierConfig.create({
        data: { tenantId: ctx.tenantId, tier: r.tier, label, minSpendSatang },
      });
    }
  }

  // recompute tier ลูกค้าทุกคนของร้าน (updateMany เป็นช่วง ๆ ตามเกณฑ์ — deterministic)
  await recomputeAllTiers(ctx.tenantId, await getTierConfig(ctx));
}

// อัปเดต tier ลูกค้าทั้ง tenant ตาม config ใหม่ (แบ่งเป็นช่วงยอดสะสม)
async function recomputeAllTiers(tenantId: string, config: TierConfigRow[]): Promise<void> {
  const min = (t: TierName) => config.find((c) => c.tier === t)?.minSpendSatang ?? 0;
  const s = min("SILVER");
  const g = min("GOLD");
  const p = min("PLATINUM");
  await prisma.customer.updateMany({ where: { tenantId, totalSpentSatang: { lt: s } }, data: { tier: "MEMBER" } });
  await prisma.customer.updateMany({ where: { tenantId, totalSpentSatang: { gte: s, lt: g } }, data: { tier: "SILVER" } });
  await prisma.customer.updateMany({ where: { tenantId, totalSpentSatang: { gte: g, lt: p } }, data: { tier: "GOLD" } });
  await prisma.customer.updateMany({ where: { tenantId, totalSpentSatang: { gte: p } }, data: { tier: "PLATINUM" } });
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

// ── แก้ไขข้อมูลสมาชิก (backoffice) — scope tenant · กันเบอร์/อีเมลชนสมาชิกอื่นในระบบเดียวกัน ──
// patch: field ที่ไม่ส่ง = คงค่าเดิม (undefined = ไม่แตะ) · ส่ง null/"" = ล้างค่า
// กติกา: ต้องเหลือชื่อหรือเบอร์อย่างน้อย 1 อย่าง · เบอร์/อีเมลซ้ำสมาชิกอื่น (memberSystem เดียวกัน) → throw ไทย
export async function updateCustomer(
  ctx: { tenantId: string },
  customerId: string,
  patch: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    marketingConsent?: boolean;
  },
) {
  const existing = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId },
  });
  if (!existing) throw new Error("ไม่พบสมาชิกนี้");

  const name = patch.name !== undefined ? patch.name?.trim() || null : existing.name;
  const phone = patch.phone !== undefined ? normPhone(patch.phone) : existing.phone;
  const email = patch.email !== undefined ? normEmail(patch.email) : existing.email;

  if (!name && !phone) throw new Error("ต้องมีชื่อหรือเบอร์อย่างน้อย 1 อย่าง");

  // กันชนกับสมาชิกอื่นในระบบสมาชิกเดียวกัน (ยกเว้นตัวเอง)
  if (phone && phone !== existing.phone) {
    const dupPhone = await prisma.customer.findFirst({
      where: { memberSystemId: existing.memberSystemId, phone, id: { not: customerId } },
    });
    if (dupPhone) throw new Error("เบอร์นี้มีสมาชิกอื่นในระบบใช้แล้ว");
  }
  if (email && email !== existing.email) {
    const dupEmail = await prisma.customer.findFirst({
      where: { memberSystemId: existing.memberSystemId, email, id: { not: customerId } },
    });
    if (dupEmail) throw new Error("อีเมลนี้มีสมาชิกอื่นในระบบใช้แล้ว");
  }

  // marketingConsent: เปลี่ยนจากไม่ยินยอม→ยินยอม = ประทับเวลา · ถอนยินยอม = ล้างเวลา
  const marketingConsent =
    patch.marketingConsent !== undefined ? patch.marketingConsent : existing.marketingConsent;
  let consentAt = existing.consentAt;
  if (marketingConsent && !existing.marketingConsent) consentAt = new Date();
  if (!marketingConsent) consentAt = null;

  return prisma.customer.update({
    where: { id: customerId },
    data: { name, phone, email, marketingConsent, consentAt },
  });
}

// ── Public storefront (สมัครสมาชิกเอง · no-auth) ──
// resolve unit จาก slug → หา "ระบบสมาชิก" (AppSystem type=MEMBER) ที่ผูก unit นั้น
// unit ประเภทใดก็ได้ (MEMBER เป็น feature ไม่ใช่ UnitType) ขอเพียง ACTIVE + มีระบบสมาชิกผูก + ระบบ active
export async function resolveMemberUnit(tenantSlug: string, unitSlug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant || tenant.status !== "ACTIVE") return null;
  const unit = await prisma.businessUnit.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug: unitSlug } },
  });
  if (!unit || unit.status !== "ACTIVE") return null;
  const link = await prisma.appSystemUnit.findUnique({
    where: { tenantId_unitId_type: { tenantId: tenant.id, unitId: unit.id, type: "MEMBER" } },
  });
  if (!link) return null;
  const system = await prisma.appSystem.findFirst({
    where: { id: link.systemId, tenantId: tenant.id },
  });
  if (!system || !system.active) return null;
  return { tenant, unit, memberSystemId: system.id, systemName: system.name };
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
  // ใช้เกณฑ์ระดับของร้าน (ไม่ใช่ค่า hardcode) — เจ้าของกำหนดชื่อ+ยอดขั้นต่ำเองได้
  const config = await getTierConfig({ tenantId });
  await client.customer.update({
    where: { id: customerId },
    data: { totalSpentSatang: total, tier: computeTierFor(total, config) },
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
