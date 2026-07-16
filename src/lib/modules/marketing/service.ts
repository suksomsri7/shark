import { tenantDb } from "@/lib/core/db";
import { MktChannel } from "@prisma/client";
import { matchesSegment, type Cust, type Segment } from "./rules";

// Marketing (ระบบที่ 20) — service ชั้นประกอบ (systemId-scoped)
// ⚠️ กติกา segment ทั้งหมดมาจาก rules.ts (สมอง FREEZE) — ที่นี่แค่เรียก matchesSegment + ผูก DB
// scope: MktCampaign/MktRecipient เป็น system-scoped (ระบบ MARKETING) → tenantDb({ tenantId, systemId })
//    inject tenantId+systemId ทุก query อัตโนมัติ (defense-in-depth)
//
// อ่านลูกค้าข้ามระบบ (marketing → member):
//   Customer เป็น system-scoped ด้วยฟิลด์ memberSystemId (ดู scope.ts) —
//   เพื่ออ่านลูกค้าของ "ระบบสมาชิก" ที่แคมเปญเล็ง จึงเปิด tenantDb แยกอีกตัว
//   ที่ systemId = memberSystemId → guard inject where memberSystemId ให้เอง ปลอดภัยข้ามระบบ
//   (fitness F2 อนุมัติเส้น marketing→member แล้ว — ที่นี่ query ผ่าน prisma.customer ตรง ๆ ไม่ import โมดูล member)
//
// memberSystemId เก็บที่ไหน:
//   schema MktCampaign ไม่มีคอลัมน์ memberSystemId (แตะ prisma/** ไม่ได้) →
//   ฝังไว้ใน segmentJson เป็นคีย์เสริม { ...segment, memberSystemId } ·
//   matchesSegment อ่านเฉพาะ tier/minSpentSatang/inactiveDays → คีย์เสริมถูกเมิน ไม่กระทบกติกา

export type Ctx = { tenantId: string; systemId: string };

// segmentJson ที่บันทึกจริง = segment (pure) + memberSystemId (คีย์เสริม)
type StoredSegment = Segment & { memberSystemId?: string };

const CHANNELS = new Set<string>(Object.values(MktChannel));
const toChannel = (v: string): MktChannel =>
  (CHANNELS.has(v) ? v : "LINE") as MktChannel;

// contact ที่ freeze ตอนส่ง — เบอร์ก่อน ถ้าไม่มีใช้อีเมล
const contactOf = (c: { phone: string | null; email: string | null }): string =>
  (c.phone?.trim() || c.email?.trim() || "");

// ── สร้างแคมเปญ (DRAFT) ──
export type CreateCampaignInput = {
  name: string;
  channel: string;
  message: string;
  segment: Segment;
  couponCode?: string | null;
  memberSystemId: string;
};

export async function createCampaign(ctx: Ctx, input: CreateCampaignInput): Promise<{ id: string }> {
  const segmentJson: StoredSegment = { ...input.segment, memberSystemId: input.memberSystemId };
  const c = await tenantDb(ctx).mktCampaign.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      name: input.name.trim(),
      channel: toChannel(input.channel),
      message: input.message ?? "",
      segmentJson,
      couponCode: input.couponCode?.trim() || null,
      // status = DRAFT (default ใน schema)
    },
  });
  return { id: c.id };
}

// อ่านแคมเปญในขอบเขตระบบ marketing แล้วถอด segment + memberSystemId
async function loadCampaign(ctx: Ctx, campaignId: string) {
  const camp = await tenantDb(ctx).mktCampaign.findFirst({ where: { id: campaignId } });
  if (!camp) throw new Error("ไม่พบแคมเปญ");
  const stored = (camp.segmentJson ?? {}) as StoredSegment;
  const { memberSystemId, ...segment } = stored;
  return { camp, segment: segment as Segment, memberSystemId: memberSystemId ?? null };
}

// ── โหลดลูกค้าของระบบสมาชิกเป้าหมาย → map เป็น Cust แล้วกรองด้วย matchesSegment ──
async function matchedCustomers(ctx: Ctx, memberSystemId: string, segment: Segment) {
  // เปิด tenantDb ที่ systemId = memberSystemId → guard inject where memberSystemId ให้
  const memberDb = tenantDb({ tenantId: ctx.tenantId, systemId: memberSystemId });
  const customers = await memberDb.customer.findMany();
  const now = new Date();
  return customers.filter((c) => {
    const cust: Cust = {
      tier: c.tier,
      totalSpentSatang: c.totalSpentSatang,
      lastVisitAt: c.updatedAt, // ใช้ updatedAt เป็นเวลามาล่าสุด (freeze ตาม interface)
    };
    return matchesSegment(cust, segment, now);
  });
}

// ── preview audience — นับลูกค้าที่เข้าเซกเมนต์ (ไม่เขียนอะไร) ──
export async function previewAudience(ctx: Ctx, campaignId: string): Promise<{ count: number }> {
  const { segment, memberSystemId } = await loadCampaign(ctx, campaignId);
  if (!memberSystemId) return { count: 0 };
  const matched = await matchedCustomers(ctx, memberSystemId, segment);
  return { count: matched.length };
}

// ── ส่งแคมเปญ — DRAFT→SENT + สร้าง MktRecipient 1 แถว/ลูกค้าที่เข้าเซกเมนต์ ──
// v1: ส่งจริง = แค่บันทึก (log) ยังไม่ต่อ LINE จริง
// idempotent: ถ้า SENT แล้ว → return เดิม ไม่สร้างผู้รับซ้ำ
export async function sendCampaign(
  ctx: Ctx,
  campaignId: string,
): Promise<{ status: string; audienceCount: number }> {
  const db = tenantDb(ctx);
  const { camp, segment, memberSystemId } = await loadCampaign(ctx, campaignId);

  if (camp.status === "SENT") {
    return { status: camp.status, audienceCount: camp.audienceCount };
  }
  if (camp.status === "CANCELLED") {
    throw new Error("แคมเปญถูกยกเลิกแล้ว ส่งไม่ได้");
  }
  if (!memberSystemId) throw new Error("แคมเปญยังไม่ได้ผูกระบบสมาชิก");

  const matched = await matchedCustomers(ctx, memberSystemId, segment);
  const now = new Date();

  // สร้างผู้รับ (freeze contact ณ ตอนส่ง)
  if (matched.length > 0) {
    await db.mktRecipient.createMany({
      data: matched.map((c) => ({
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        campaignId: camp.id,
        customerId: c.id,
        contact: contactOf(c),
        sentAt: now,
      })),
    });
  }

  await db.mktCampaign.update({
    where: { id: camp.id },
    data: { status: "SENT", audienceCount: matched.length, sentAt: now },
  });

  return { status: "SENT", audienceCount: matched.length };
}

// ── reads (สำหรับ UI) ──
export async function listCampaigns(ctx: Ctx, take = 100) {
  return tenantDb(ctx).mktCampaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { recipients: true } } },
    take,
  });
}
