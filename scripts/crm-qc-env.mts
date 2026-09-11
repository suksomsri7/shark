// crm-qc-env.mts — ค่าคงที่ + ตัวหาขอบเขตของชุดข้อมูล QC "CRM v2"
//
// ต่อยอดจากร้าน QC ของระบบสมาชิก (`member-qc-env.mts` · MQC) — ร้านเดียวกัน slug เดียวกัน
// 🔴 ไฟล์นี้ไม่ import prisma เอง — ผู้เรียกส่ง PrismaClient เข้ามา
// 🔴 ตัวเลขในนี้คือ "สัญญาของชุดข้อมูล" — seed-crm-qc.mts ต้องสร้างให้ตรง · ข้อสอบ qc-crm-*.mts อ้างจากนี่
//    (ledger/CRM-RUN.md §0 ข้อ 1 · พิมพ์เขียว docs/modules/20-crm-v2.md)

export const CQC = {
  /** ร้านเดียวกับชุดข้อมูล QC สมาชิก (ต้อง seed-member-qc.mts ก่อน) */
  tenantSlug: "siam-dive-member-qc",
  /** ระบบที่ CRM ต้องมีเพิ่มจากของสมาชิก (สมาชิกมี MEMBER POINT REWARD COUPON POS BOOKING CHAT HR) */
  extraSystems: ["CRM", "INVENTORY", "ACCOUNT"] as const,
  /** ผู้ใช้เพิ่ม: nok = หัวหน้าทีมกระบี่ (STAFF · unit kata · TeamMember role LEAD) · ใช้ทดสอบการมองเห็น TEAM */
  users: {
    nok: { email: "mb-nok@shark.local", name: "นก ศรีวิไล", unit: "kata" },
  },
  /** ทีม (core Team · tenant-scoped) — ผูกสาขา */
  teams: [
    { key: "phuket", name: "ทีมขาย — ภูเก็ต", unit: "patong", lead: "manager", members: ["thana", "pook"] },
    { key: "krabi", name: "ทีมขาย — กระบี่", unit: "kata", lead: "nok", members: ["nok", "kata"] },
  ],
  /** pipeline: ค่าเริ่มต้นจาก ensureCrm (5 ขั้น · "ขายองค์กร (B2B)" หลัง rename) + "ขายปลีก" 4 ขั้น */
  pipelines: {
    b2b: { name: "ขายองค์กร (B2B)", stages: 5 },
    retail: { name: "ขายปลีก", stages: ["สอบถาม", "เสนอ", "ปิดชนะ", "ไม่สำเร็จ"] },
  },
  companies: {
    total: 20,
    withTaxId: 15, // index 1..15 มีเลขภาษี (Party COMPANY จับคู่ด้วยเลขภาษี) · 16..20 ไม่มี
    nameOf: (i: number) => `บริษัท คิวซี ${String(i).padStart(2, "0")} จำกัด`,
    taxIdOf: (i: number) => `01055${String(i).padStart(8, "0")}`,
    domainOf: (i: number) => `qc${String(i).padStart(2, "0")}.example.com`,
    /** บริษัทข้อความ (ไม่มี CrmCompany ตอน seed) ให้ backfill companies-from-text จับ → ผู้ติดต่อ 3 คน */
    textCompany: "บริษัท ไทยทัวร์เอเชีย",
    textCompanyContacts: 3,
  },
  contacts: {
    total: 80,
    /** index 1..60 สังกัดบริษัท (i-1)%20+1 (3 คน/บริษัท · คนแรกของบริษัทเป็น primary/DECISION_MAKER) · 61..73 ไม่มีบริษัท · 74..76 = บริษัทข้อความ · 77..80 = ตัวซ้ำเบอร์ของ 1..4 */
    withCompany: 60,
    noCompany: 13,
    textCompany: 3,
    duplicates: 4,
    phoneOf: (i: number) => (i >= 77 ? `08200000${String(i - 76).padStart(2, "0")}` : `08200000${String(i).padStart(2, "0")}`),
    emailOf: (i: number) => (i % 3 === 0 ? null : `crm-contact-${String(i).padStart(2, "0")}@qc${String(((i - 1) % 20) + 1).padStart(2, "0")}.example.com`),
    /** ผู้ดูแล: 1..40 thana (ทีมภูเก็ต) · 41..60 nok (ทีมกระบี่) · 61..80 manager */
    ownerOf: (i: number) => (i <= 40 ? "thana" : i <= 60 ? "nok" : "manager"),
  },
  deals: {
    total: 60,
    /** deal i ผูกผู้ติดต่อ i (1..60) · pipeline: i ≤ 45 B2B · 46..60 retail */
    won: 10, // index 1..10
    lost: 5, // index 11..15
    open: 45, // 16..60
    /** ดีลนิ่ง: index 16..21 (6 ใบ) lastActivityAt = today−30 · stageEnteredAt = today−40 */
    stale: 6,
    staleDays: 30,
    valueOf: (i: number) => 50_000_00 + i * 10_000_00, // สตางค์ · 5,000฿ + 1,000฿×i
    /** ผู้ดูแลดีล = ผู้ดูแลผู้ติดต่อ (thana 1..40 · nok 41..60) */
  },
  activities: { total: 200, perDeal: 3, extraOnContacts: 20 },
  customObjects: {
    contract: { key: "contract", label: "สัญญา", labelPlural: "สัญญา", parentType: "COMPANY", records: 12, fields: ["contractNo", "startAt", "endAt", "valueSatang", "autoRenew"] },
  },
  lostReasons: ["ราคาสูงกว่าคู่แข่ง", "งบไม่อนุมัติ", "เลือกซัพพลายเออร์เดิม", "เงียบหาย/ไม่ตอบ", "อื่น ๆ"],
  expectedPath: "scripts/crm-expected.json",
  shotsDir: ".qc-shots/crm",
  today: "2026-09-30",
  oracleValidUntil: "2026-12-31",
} as const;

type MinimalPrisma = {
  tenant: { findFirst: (a: unknown) => Promise<{ id: string } | null> };
  appSystem: { findMany: (a: unknown) => Promise<{ id: string; type: string }[]> };
};

export type CrmScope = { tenantId: string; systemId: string; systems: Record<string, string> };

/** คืน tenantId + systemId (CRM) + แผนที่ระบบทุกประเภทของร้าน QC · null = ยังไม่ได้ seed CRM */
export async function resolveCrmScope(prisma: MinimalPrisma): Promise<CrmScope | null> {
  const t = await prisma.tenant.findFirst({ where: { slug: CQC.tenantSlug }, select: { id: true } });
  if (!t) return null;
  const rows = await prisma.appSystem.findMany({ where: { tenantId: t.id }, select: { id: true, type: true }, orderBy: { createdAt: "asc" } });
  const systems: Record<string, string> = {};
  for (const r of rows) if (!systems[r.type]) systems[r.type] = r.id;
  if (!systems.CRM || !systems.MEMBER) return null;
  return { tenantId: t.id, systemId: systems.CRM, systems };
}

/** วันที่ `today` + n วัน (12:00 BKK) */
export function dayFromToday(n: number, hourBkk = 12): Date {
  const [y, m, d] = CQC.today.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n, hourBkk - 7, 0, 0));
}

/** ตารางที่ต้องมี partyId (C11) — ชื่อ "คาดว่า" · C1.1 ต้องตรวจชื่อจริงใน prisma/schema แล้วแก้รายการนี้ให้ตรง (ห้ามเดา) */
export const PARTY_LINK_TABLES = ["Appointment", "ShopOrder", "TicketOrder", "RentalBooking", "SchoolEnrollment", "HotelBooking", "ClinicPatient", "QueueTicket"] as const;

/** ตารางใหม่ของ crm_v2_a (พิมพ์เขียว §4.3 กลุ่ม core + ตัวตน + วัตถุ) */
export const CRM_V2A_TABLES = [
  "Team", "TeamMember",
  "CrmCompany", "CrmCompanyContact", "CrmDealContact", "CrmDealLine", "CrmDealStageHistory", "CrmLostReason",
  "CustomObject", "CustomRecord", "CustomRecordValue", "CustomRecordValueHistory",
] as const;

/** backfill 6 สคริปต์ของ C1.1 (ชื่อคงที่ — ข้อสอบเรียกตามนี้) */
export const CRM_BACKFILLS = [
  "crm-backfill-companies-from-text.mts",
  "crm-backfill-stage-history.mts",
  "crm-backfill-party-links.mts",
  "crm-backfill-contact-names.mts",
  "crm-backfill-lost-reasons.mts",
  "crm-backfill-visibility.mts",
] as const;
