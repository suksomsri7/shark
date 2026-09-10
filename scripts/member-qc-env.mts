// member-qc-env.mts — ค่าคงที่ + ตัวหาขอบเขตของชุดข้อมูล QC "ระบบสมาชิก v2" (RUN Member System)
//
// ใช้คู่กับ `acc-v2-env.mts` (loadQcEnv = โหลด .env.qc + ด่านกัน prod ตัวเดียวกัน)
// 🔴 ไฟล์นี้ไม่ import prisma เอง — ผู้เรียกส่ง PrismaClient เข้ามา (ข้อสอบแต่ละชุด import db เอง)
// 🔴 ตัวเลขในนี้คือ "สัญญาของชุดข้อมูล" — seed ต้องสร้างให้ตรง · oracle เทียบกับตัวเลขนี้ + เฉลย json
//    (ledger/MEMBER-RUN.md §0 ข้อ 1 · พิมพ์เขียว docs/modules/06-member-v2.md)

export const MQC = {
  tenantName: "SIAM DIVE MEMBER QC",
  tenantSlug: "siam-dive-member-qc",
  ownerEmail: "mb-owner@shark.local",
  ownerName: "เจ้าของร้าน (MB QC)",
  managerEmail: "mb-manager-patong@shark.local", // MANAGER · unitAccess [patong]
  /**
   * พนักงาน (STAFF)
   * - thana  : สาขาป่าตอง · unitAccess [patong] · สิทธิ์ member พื้นฐาน (read/create/update · loyalty.stamp · promo.issue) · **ไม่มี** settings/privacy/sensitive
   * - pook   : ทั้งร้าน ["*"] · การตลาด (member.* read + promo.* + report.view)
   * - nurse  : สาขาป่าตอง · STAFF · ผูก HrEmployee ตำแหน่ง "พยาบาล" แผนก "คลินิก" (D17 — policy ตำแหน่งให้เห็นส่วนสุขภาพได้)
   * - kata   : สาขากะตะ · STAFF · unitAccess [kata] (ใช้ทดสอบ unit scope 404)
   */
  staff: [
    { key: "thana", email: "mb-thana@shark.local", name: "ธนา ศรีสมบัติ", unit: "patong" },
    { key: "pook", email: "mb-pook@shark.local", name: "ปุ๊ก มณีรัตน์", unit: "*" },
    { key: "nurse", email: "mb-nurse@shark.local", name: "นภา พยาบาลประจำ", unit: "patong", hrPosition: "พยาบาล", hrDepartment: "คลินิก" },
    { key: "kata", email: "mb-kata@shark.local", name: "กมล สาขากะตะ", unit: "kata" },
  ],
  noPermEmail: "mb-noperm@shark.local",
  units: [
    { key: "patong", name: "สาขาป่าตอง", slug: "patong" },
    { key: "kata", name: "สาขากะตะ", slug: "kata" },
  ],
  /** ระบบที่ต้องมีในร้าน QC (1 ระบบต่อประเภท · ผูกทั้ง 2 สาขา) */
  systems: ["MEMBER", "POINT", "REWARD", "COUPON", "POS", "BOOKING", "CHAT", "HR"] as const,
  /** สมาชิก 60 คน · ระดับ (enum เดิม → tierDef หลัง backfill) */
  members: {
    total: 60,
    byTier: { MEMBER: 30, SILVER: 15, GOLD: 10, PLATINUM: 5 },
    byUnit: { patong: 40, kata: 20 },
    /** เบอร์ = 0810000001..0810000060 (ตามลำดับ index 1..60) · อีเมลมีเฉพาะคนที่ index % 2 === 0 */
    phoneOf: (i: number) => `08100000${String(i).padStart(2, "0")}`,
    emailOf: (i: number) => (i % 2 === 0 ? `mb-member-${String(i).padStart(2, "0")}@example.com` : null),
    /** LINE identity (channel LINE · externalId `U-mbqc-NN`) เฉพาะ index ≤ 30 */
    lineIdentityCount: 30,
    /** marketingConsent = true เฉพาะ index % 3 !== 0 (40 คน) */
    consentCount: 40,
    /** ค่าฟิลด์เทมเพลตดำน้ำ (ระดับใบรับรอง/หน่วยงาน/จำนวนไดฟ์/ไดฟ์ล่าสุด) ให้ index ≤ 45 */
    diveFieldsCount: 45,
    /** ส่วน "สุขภาพ" (sensitive) มีค่าโรคประจำตัว/ผู้ติดต่อฉุกเฉิน ให้ index ≤ 12 */
    healthFieldsCount: 12,
    /** วันเกิด: index 1..12 = วันเกิดในเดือนตุลาคม 2026 (ใช้ทดสอบ journey วันเกิด) */
  },
  /** เกณฑ์ระดับเดิม (MemberTierConfig · สตางค์) — backfill แปลงเป็น TierDef + กฎ upgrade */
  tierConfig: { SILVER: 1_000_000, GOLD: 3_000_000, PLATINUM: 10_000_000 },
  bills: { total: 120, unitSplit: { patong: 80, kata: 40 } },
  appointments: { total: 40 },
  chat: { conversations: 10, contactsWithPhone: 6 },
  expectedPath: "scripts/member-expected.json",
  shotsDir: ".qc-shots/member",
  /** วันอ้างอิงของชุดข้อมูล (ตรึงให้ผลนิ่ง — ใช้คำนวณ createdAt/paidAt/วันเกิด/นัด) */
  today: "2026-09-30",
  oracleValidUntil: "2026-12-31",
} as const;

/** ฟิลด์ระบบ 26 ตัว (พิมพ์เขียว §11.2) — backfill-fields ต้องสร้างเป็น MemberField isSystem=true systemKey ตามนี้ */
export const SYSTEM_FIELD_KEYS = [
  "firstName", "lastName", "nickname", "titleTh", "birthDate", "gender", "nationality",
  "phone", "phone2", "email", "lineUserId", "facebook",
  "addressLine1", "addressSubdistrict", "addressDistrict", "addressProvince", "addressPostcode",
  "locale", "preferredChannel", "tags", "note", "source", "ownerUserId", "homeUnitId", "memberCode", "avatar",
] as const;

/** ทะเบียนช่องทางกลาง 15 key (D19 · `src/lib/core/channels.ts`) */
export const CHANNEL_KEYS = [
  "LINE", "WEBCHAT", "APP", "FACEBOOK", "INSTAGRAM", "MESSENGER", "WHATSAPP", "WECHAT",
  "EMAIL", "SMS", "PHONE", "PUSH", "SHOPEE", "LAZADA", "TIKTOK_SHOP",
] as const;

type MinimalPrisma = {
  tenant: { findFirst: (a: unknown) => Promise<{ id: string } | null> };
  appSystem: { findMany: (a: unknown) => Promise<{ id: string; type: string }[]> };
};

export type MemberScope = { tenantId: string; systemId: string; systems: Record<string, string> };

/** คืน tenantId + systemId (MEMBER) + แผนที่ระบบทุกประเภทของร้าน QC สมาชิก · null = ยังไม่ได้ seed */
export async function resolveMemberScope(prisma: MinimalPrisma): Promise<MemberScope | null> {
  const t = await prisma.tenant.findFirst({ where: { slug: MQC.tenantSlug }, select: { id: true } });
  if (!t) return null;
  const rows = await prisma.appSystem.findMany({ where: { tenantId: t.id }, select: { id: true, type: true }, orderBy: { createdAt: "asc" } });
  const systems: Record<string, string> = {};
  for (const r of rows) if (!systems[r.type]) systems[r.type] = r.id;
  if (!systems.MEMBER) return null;
  return { tenantId: t.id, systemId: systems.MEMBER, systems };
}

/** วันที่ `today` + n วัน (12:00 BKK = 05:00 UTC — กันเพี้ยนข้ามวันไทย) */
export function dayFromToday(n: number, hourBkk = 12): Date {
  const [y, m, d] = MQC.today.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n, hourBkk - 7, 0, 0));
}
