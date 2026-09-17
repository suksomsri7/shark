// crm-qc-env.mts — ค่าคงที่ + ตัวหาขอบเขตของชุดข้อมูล QC "CRM v2"
//
// ต่อยอดจากร้าน QC ของระบบสมาชิก (`member-qc-env.mts` · MQC) — ร้านเดียวกัน slug เดียวกัน
// 🔴 ไฟล์นี้ไม่ import prisma เอง — ผู้เรียกส่ง PrismaClient เข้ามา
// 🔴 ตัวเลขในนี้คือ "สัญญาของชุดข้อมูล" — seed-crm-qc.mts ต้องสร้างให้ตรง · ข้อสอบ qc-crm-*.mts อ้างจากนี่
//    (ledger/CRM-RUN.md §0 ข้อ 1 · พิมพ์เขียว docs/modules/20-crm-v2.md)
//
// ─── ทะเบียน partyId (C11) แก้แล้วในใบ C0.1 · ตรวจกับ prisma/schema/*.prisma จริงเมื่อ 17 ก.ย. 2569 ───
// ตารางธุรกรรม 9 ตัวแบ่งเป็น "สองกลุ่ม" เพราะข้อสอบ C1.1 ต้องยืนยันคนละเรื่องกัน:
//   • `PARTY_LINK_NEW_COLUMN` (5) — วันนี้ยังไม่มีคอลัมน์ `partyId` เลย ⇒ migration `crm_v2_a` ต้อง ADD COLUMN + index
//     (Appointment · ShopOrder · RentalBooking · QueueTicket · ClinicVisit)
//   • `PARTY_LINK_EXISTING_COLUMN` (4) — มีคอลัมน์ + index อยู่แล้ว แต่ **ไม่มีใครเขียนค่า** ⇒ C1.1 ต้องเพิ่ม "จุดเขียน"
//     และ backfill ให้แถวเดิมได้ partyId (TicketOrder · SchoolEnrollment · HotelReservation · PatientRecord)
//   • `PARTY_LINK_TABLES` (9) = สองกลุ่มต่อกัน — ใช้กับข้อที่ตรวจเหมือนกันทั้งหมด (คอลัมน์/index/แถวที่ยังว่าง)
//   • `PARTY_LINK_IDENTITY` — คอลัมน์ "ตัวตนลูกค้า" ของแต่ละตาราง (เบอร์/ผ่านแม่) ที่ backfill ใช้จับคู่ Party
//   🔴 `HotelBooking` และ `ClinicPatient` **ไม่มีอยู่จริง** (ชื่อเดาในพิมพ์เขียว) — ห้ามใส่กลับ
//   🔴 `PosSale` อยู่นอกรายการ: ไม่มีเบอร์ในแถว ผูกกับลูกค้าผ่าน `memberId` (Customer.id) เท่านั้น (มติ C11/C28)

/** (C11) ตารางธุรกรรมที่ **ยังไม่มี** คอลัมน์ partyId — `crm_v2_a` ต้อง ADD COLUMN (nullable) + index([partyId]) */
export const PARTY_LINK_NEW_COLUMN = ["Appointment", "ShopOrder", "RentalBooking", "QueueTicket", "ClinicVisit"] as const;

/** (C11) ตารางที่ **มีคอลัมน์ partyId + index อยู่แล้ว** แต่ไม่มีโค้ดไหนเขียนค่า — C1.1 เพิ่มจุดเขียน + backfill */
export const PARTY_LINK_EXISTING_COLUMN = ["TicketOrder", "SchoolEnrollment", "HotelReservation", "PatientRecord"] as const;

/** (C11) ทั้ง 9 ตาราง = จุดเขียน partyId ที่ C1.1 เป็นเจ้าของ (ไม่มี PosSale · ไม่มี HotelBooking/ClinicPatient ซึ่งไม่มีจริง) */
export const PARTY_LINK_TABLES: readonly string[] = [...PARTY_LINK_NEW_COLUMN, ...PARTY_LINK_EXISTING_COLUMN];

/**
 * ตัวตนลูกค้าของแต่ละตาราง (ตรวจกับ prisma/schema จริง):
 *  - `phoneColumn` = คอลัมน์เบอร์ในแถวนั้นเอง (backfill จับคู่ Party ด้วยเบอร์นี้) · `null` = ไม่มีเบอร์ในแถว
 *  - `via` = ทางอ้อม (ClinicVisit ได้ partyId จาก PatientRecord ของคนไข้)
 *  - `phoneRequired` = คอลัมน์เบอร์เป็น NOT NULL ⇒ ทุกแถวต้องได้ partyId หลัง backfill
 */
export const PARTY_LINK_IDENTITY: Record<string, { phoneColumn: string | null; phoneRequired: boolean; tagColumn: string; via?: string; note?: string }> = {
  Appointment: { phoneColumn: "customerPhone", phoneRequired: true, tagColumn: "customerName" },
  ShopOrder: { phoneColumn: "customerPhone", phoneRequired: true, tagColumn: "customerName" },
  RentalBooking: { phoneColumn: "customerPhone", phoneRequired: true, tagColumn: "customerName" },
  QueueTicket: { phoneColumn: "contactPhone", phoneRequired: false, tagColumn: "contactName", note: "contactPhone และ contactName เป็น optional ทั้งคู่ (คิวหน้าร้านไม่กรอกก็ได้) ⇒ 🔴 แถวป้าย QC ของตารางนี้ **ต้องเขียน contactName เสมอ** ไม่งั้น like ไม่เจอ แล้ว S5.7 แดง (อีก 8 ตารางคอลัมน์ป้ายเป็น NOT NULL อยู่แล้ว)" },
  ClinicVisit: { phoneColumn: null, phoneRequired: true, tagColumn: "symptom", via: "PatientRecord.patientId", note: "ไม่มีเบอร์ในแถว — ได้ partyId ผ่านคนไข้ (phone NOT NULL) ⇒ ทุกแถวต้องมี partyId" },
  TicketOrder: { phoneColumn: "buyerPhone", phoneRequired: false, tagColumn: "buyerName" },
  SchoolEnrollment: { phoneColumn: "studentPhone", phoneRequired: true, tagColumn: "studentName" },
  HotelReservation: { phoneColumn: "guestPhone", phoneRequired: false, tagColumn: "guestName" },
  PatientRecord: { phoneColumn: "phone", phoneRequired: true, tagColumn: "name" },
};

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
  /**
   * 🔴 สัญญาชุดข้อมูล "แถวธุรกรรม 9 ตาราง" (C11) — พิสูจน์ว่า partyId ถูกเขียนจริงทั้ง 9 จุด
   * เจ้าของการสร้างแถว = **ใบ C1.1** (ต้องเพิ่มระบบ SHOP/RENTAL/TICKET/SCHOOL/HOTEL/CLINIC/QUEUE ใน `extraSystems`
   * ก่อน แล้วค่อยสร้างแถว — ทำได้หลัง migration crm_v2_a เท่านั้น · ใบ C0.1 จึงไม่สร้างให้)
   * ข้อสอบ C1.1-S5.7 จะ **แดง** จนกว่าแถวเหล่านี้จะมีจริง — ตั้งใจให้แดง เพราะ "ไม่มีแถว = ข้อ S5.6 ไม่ได้พิสูจน์อะไร"
   */
  businessRows: {
    /** จำนวนแถวขั้นต่ำต่อหนึ่งตาราง (2 แถว = จับได้ทั้งกรณีเบอร์ใหม่และเบอร์ที่ผูก Party เดิมแล้ว) */
    perTable: 2,
    /** ป้ายที่ทำให้แยกออกว่าเป็นแถวของ QC — ใส่ใน `PARTY_LINK_IDENTITY[t].tagColumn` (ชื่อลูกค้า/อาการ) */
    tag: "qc-crm-c11",
    /**
     * ป้ายรายแถว = `qc-crm-c11:<ตาราง>:<j>` — ข้อสอบใช้หาแถวของตัวเอง **และ** รู้ว่าแถวนี้ต้องผูกกับผู้ติดต่อคนไหน
     * (ห้ามใช้แค่ป้ายรวม ไม่งั้นพิสูจน์ไม่ได้ว่า partyId ที่ถูกเขียนคือ Party ของคนที่ถูกต้อง)
     * 🔴 ต้องเป็น "คำเต็ม" ในคอลัมน์ป้าย (คั่นด้วยช่องว่าง เช่น `คุณสมชาย qc-crm-c11:ShopOrder:1`) — ข้อสอบเทียบทั้งคำ
     *    ไม่ใช่ substring เพื่อไม่ให้ `:1` ไปชนกับ `:10` เมื่อ perTable โตขึ้น
     */
    rowTagOf: (table: string, j: number) => `qc-crm-c11:${table}:${j}`,
    /**
     * แถวที่ j (1..perTable) ของตาราง t ต้องพกเบอร์ของ "ผู้ติดต่อ QC คนที่ contactIndexOf(t, j)"
     * (`CQC.contacts.phoneOf(n)`) ⇒ backfill ต้องจับคู่ Party ที่มีอยู่แล้วได้เสมอ ไม่ใช่สร้าง Party ใหม่
     */
    contactIndexOf: (table: string, j: number) => ((PARTY_LINK_TABLES.indexOf(table) * 2 + (j - 1)) % 60) + 1,
    /** ตัวตนที่แถวนั้นต้องมีตามตาราง (คอลัมน์เบอร์จริง · ClinicVisit ต้องมี PatientRecord ของ QC เป็นแม่) */
    identityOf: (table: string) => PARTY_LINK_IDENTITY[table],
    note: "ClinicVisit ไม่มีเบอร์ในแถว — สร้าง PatientRecord (phone = เบอร์ผู้ติดต่อ QC) แล้วผูก visit เข้าไป",
  },
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

/**
 * ตารางใหม่ของ crm_v2_a (พิมพ์เขียว §4.3 กลุ่ม core + ตัวตน + วัตถุ)
 * + 3 ตารางที่ใบ C1.1 รับมาเพิ่ม (พิมพ์เขียว §15 · ใบ C1.1 ข้อ 3): CrmVisibilityPolicy (C1.7 ต้องใช้) ·
 *   CrmFileLink (C19 ไฟล์แนบ) · CrmContactConsent (C20 ความยินยอมรายช่องทาง · append-only)
 */
export const CRM_V2A_TABLES = [
  "Team", "TeamMember",
  "CrmCompany", "CrmCompanyContact", "CrmDealContact", "CrmDealLine", "CrmDealStageHistory", "CrmLostReason",
  "CustomObject", "CustomRecord", "CustomRecordValue", "CustomRecordValueHistory",
  "CrmVisibilityPolicy", "CrmFileLink", "CrmContactConsent",
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
