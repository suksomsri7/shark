// backfill 2/6 — ส่วน/ฟิลด์ระบบ (D14 · พิมพ์เขียว §4.6 ข้อ 2 · §11.2)
//
// สร้าง "ส่วนระบบ" 4 กล่อง + "ฟิลด์ระบบ" 26 ตัว (isSystem) ให้ทุกระบบสมาชิกของร้าน
//
// 🔴 ไม่ย้ายค่า: ฟิลด์ระบบเป็นแค่ **ตัวชี้** ไปคอลัมน์ของ Customer (`systemKey`)
//    ตัวออกแบบฟิลด์เห็นเป็นฟิลด์ปกติ (ซ่อน/เปลี่ยนป้าย/เรียงได้) แต่ค่าจริงยังอยู่คอลัมน์เดิม
//    ⇒ ไม่มีการก๊อปข้อมูลลูกค้าไปไว้สองที่ (ถ้าก๊อป วันหนึ่งสองที่จะไม่ตรงกันแน่นอน)
//
// วิธีรัน
//   QC   :  pnpm exec tsx scripts/member-backfill-fields.mts [--tenant <slug>] [--dry-run]
//   PROD :  ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/member-backfill-fields.mts --tenant <slug>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const SCRIPT = "member-backfill-fields";
const common = (await import("./member-backfill-common.mts" as string)) as Any;
const args = common.parseArgs();
await common.loadBackfillEnv(SCRIPT);

const { prisma } = await import("@/lib/core/db");
const tenants = await common.pickTenants(prisma, args.tenantSlug);
common.banner(SCRIPT, args, tenants);

// ── ส่วนระบบ (§11.2 — แบ่งตามที่คนกรอกจริงเป็นกลุ่ม ๆ) ──
const SECTIONS = [
  { key: "profile", label: "ข้อมูลพื้นฐาน", columns: 2, sortOrder: 0, description: "ชื่อ วันเกิด เพศ รหัสสมาชิก" },
  { key: "contact", label: "ช่องทางติดต่อ", columns: 2, sortOrder: 1, description: "เบอร์โทร อีเมล ไลน์ โซเชียล" },
  { key: "address", label: "ที่อยู่", columns: 2, sortOrder: 2, description: "ที่อยู่สำหรับจัดส่ง/ออกใบเสร็จ" },
  { key: "internal", label: "ข้อมูลภายใน", columns: 2, sortOrder: 3, description: "ที่มา ผู้ดูแล สาขาหลัก แท็ก โน้ต" },
];

type FieldSeed = {
  key: string;
  label: string;
  type: string;
  section: string;
  options?: unknown;
  required?: boolean;
  unique?: boolean;
  filterable?: boolean;
  showInList?: boolean;
  showOnCard?: boolean;
  customerEditable?: boolean;
};

const choice = (value: string, label: string) => ({ value, label });

// ฟิลด์ระบบ 26 ตัว — `key` = `systemKey` = ชื่อคอลัมน์ของ Customer (ยกเว้น address* ที่ไปอยู่ MemberAddress)
const FIELDS: FieldSeed[] = [
  // ── ข้อมูลพื้นฐาน ──
  { key: "memberCode", label: "รหัสสมาชิก", type: "TEXT", section: "profile", showInList: true },
  { key: "firstName", label: "ชื่อจริง", type: "TEXT", section: "profile", showInList: true, showOnCard: true, customerEditable: true },
  { key: "lastName", label: "นามสกุล", type: "TEXT", section: "profile", showInList: true, customerEditable: true },
  { key: "nickname", label: "ชื่อเล่น", type: "TEXT", section: "profile", customerEditable: true },
  { key: "titleTh", label: "คำนำหน้า", type: "TEXT", section: "profile", customerEditable: true },
  {
    key: "birthDate",
    label: "วันเกิด",
    type: "DATE",
    section: "profile",
    filterable: true,
    customerEditable: true,
  },
  {
    key: "gender",
    label: "เพศ",
    type: "SELECT",
    section: "profile",
    filterable: true,
    customerEditable: true,
    options: { choices: [choice("MALE", "ชาย"), choice("FEMALE", "หญิง"), choice("OTHER", "อื่น ๆ"), choice("UNSPECIFIED", "ไม่ระบุ")] },
  },
  { key: "nationality", label: "สัญชาติ", type: "TEXT", section: "profile", customerEditable: true },
  { key: "avatar", label: "รูปโปรไฟล์", type: "FILE", section: "profile", customerEditable: true },
  // ── ช่องทางติดต่อ ──
  // 🔴 phone เป็นทั้ง required และ unique: เบอร์คือกุญแจจับคู่ตัวตนของทั้งระบบ (D18)
  { key: "phone", label: "เบอร์โทร", type: "TEXT", section: "contact", required: true, unique: true, filterable: true, showInList: true, showOnCard: true },
  { key: "phone2", label: "เบอร์สำรอง", type: "TEXT", section: "contact" },
  { key: "email", label: "อีเมล", type: "TEXT", section: "contact", unique: true, showInList: true, customerEditable: true },
  { key: "lineUserId", label: "ไอดีไลน์", type: "TEXT", section: "contact" },
  { key: "facebook", label: "เฟซบุ๊ก", type: "TEXT", section: "contact", customerEditable: true },
  // ── ที่อยู่ ──
  { key: "addressLine1", label: "ที่อยู่", type: "TEXT", section: "address", customerEditable: true },
  { key: "addressSubdistrict", label: "ตำบล / แขวง", type: "TEXT", section: "address", customerEditable: true },
  { key: "addressDistrict", label: "อำเภอ / เขต", type: "TEXT", section: "address", customerEditable: true },
  { key: "addressProvince", label: "จังหวัด", type: "TEXT", section: "address", filterable: true, customerEditable: true },
  { key: "addressPostcode", label: "รหัสไปรษณีย์", type: "TEXT", section: "address", customerEditable: true },
  // ── ข้อมูลภายใน ──
  { key: "locale", label: "ภาษาที่ใช้", type: "TEXT", section: "internal" },
  { key: "preferredChannel", label: "ช่องทางที่สะดวก", type: "TEXT", section: "internal" },
  { key: "tags", label: "แท็ก", type: "MULTI_SELECT", section: "internal", filterable: true, showInList: true, options: { choices: [] } },
  { key: "note", label: "โน้ตภายใน", type: "LONG_TEXT", section: "internal" },
  {
    key: "source",
    label: "ช่องทางที่มา",
    type: "SELECT",
    section: "internal",
    filterable: true,
    options: {
      choices: [
        choice("WALK_IN", "เดินเข้าร้าน"), choice("POS", "หน้าร้าน (POS)"), choice("BOOKING", "จองคิว"),
        choice("LINE_OA", "ไลน์ OA"), choice("LIFF", "ไลน์ (หน้าสมัคร)"), choice("WEB_FORM", "ฟอร์มบนเว็บ"),
        choice("CHAT", "กล่องแชท"), choice("REFERRAL", "เพื่อนแนะนำ"), choice("IMPORT", "นำเข้าจากไฟล์"),
        choice("CRM", "งานขาย (CRM)"), choice("CAMPAIGN", "แคมเปญ"), choice("API", "ระบบภายนอก"),
        choice("MARKETPLACE", "ตลาดออนไลน์"), choice("APP", "แอปมือถือ"), choice("OTHER", "อื่น ๆ"),
      ],
    },
  },
  // 🔴 target = USER ไม่ใช่ EMPLOYEE: คอลัมน์ `Customer.ownerUserId` เก็บ **User.id** (บัญชีผู้ใช้ที่มี
  //    Membership ในร้าน) ไม่ใช่ `HrEmployee.id` — ถ้าตรวจกับทะเบียน HR จะเลือกคนที่ไม่มีบัญชีเข้าระบบได้
  //    (แก้ที่ M1.4 พร้อม migration `member_v2_b` ที่เพิ่มค่า enum `MemberLookupTarget.USER`)
  { key: "ownerUserId", label: "ผู้ดูแล", type: "LOOKUP", section: "internal", filterable: true, options: { target: "USER" } },
  { key: "homeUnitId", label: "สาขาหลัก", type: "LOOKUP", section: "internal", filterable: true, showInList: true, options: { target: "UNIT" } },
];

const counts: Record<string, number> = { ร้านที่แก้: 0, ส่วนที่สร้าง: 0, ฟิลด์ที่สร้าง: 0, ฟิลด์ที่ปรับปลายทาง: 0 };

for (const t of tenants) {
  const systems = await common.memberSystems(prisma, t.id);
  if (systems.length === 0) continue;
  let touched = false;

  const work = async (tx: Any) => {
    for (const sys of systems) {
      const sectionId = new Map<string, string>();
      for (const s of SECTIONS) {
        const found = await tx.memberSection.findFirst({ where: { systemId: sys.id, key: s.key } });
        if (found) {
          sectionId.set(s.key, found.id);
          continue;
        }
        counts.ส่วนที่สร้าง += 1;
        touched = true;
        if (args.dryRun) {
          console.log(`  [dry-run] ${t.slug}: จะสร้างส่วน "${s.label}" ในระบบ ${sys.name}`);
          sectionId.set(s.key, `dry-${s.key}`);
          continue;
        }
        const row = await tx.memberSection.create({
          data: { tenantId: t.id, systemId: sys.id, key: s.key, label: s.label, description: s.description, columns: s.columns, sortOrder: s.sortOrder, isSystem: true },
        });
        sectionId.set(s.key, row.id);
      }

      let order = 0;
      for (const f of FIELDS) {
        order += 1;
        // idempotent ต่อ (systemId, systemKey) — ร้านเปลี่ยนป้าย/ย้ายส่วนแล้วต้องไม่ถูกเขียนทับ
        const found = await tx.memberField.findFirst({ where: { systemId: sys.id, systemKey: f.key } });
        if (found) {
          // 🔴 ข้อยกเว้นเดียวของกติกา "ไม่ทับของเดิม" (M1.4): ฟิลด์ระบบ `ownerUserId` ที่ backfill รอบก่อน
          //    สร้างไว้ด้วย target = EMPLOYEE ชี้ผิดตาราง (ค่าที่เก็บคือ User.id) ⇒ ย้ายเป็น USER ให้
          //    ปรับเฉพาะแถวที่ยังเป็น EMPLOYEE เท่านั้น (รันซ้ำครั้งที่ 2 = 0 แถว) · ไม่แตะป้าย/ส่วน/ลำดับที่ร้านตั้งเอง
          if (f.key === "ownerUserId" && (found.options as Any)?.target === "EMPLOYEE") {
            counts["ฟิลด์ที่ปรับปลายทาง"] += 1;
            touched = true;
            if (!args.dryRun) {
              await tx.memberField.update({ where: { id: found.id }, data: { options: { target: "USER" } } });
            } else {
              console.log(`  [dry-run] ${t.slug}: จะย้ายปลายทางฟิลด์ "ผู้ดูแล" จาก EMPLOYEE → USER`);
            }
          }
          continue;
        }
        counts.ฟิลด์ที่สร้าง += 1;
        touched = true;
        if (args.dryRun) continue;
        await tx.memberField.create({
          data: {
            tenantId: t.id,
            systemId: sys.id,
            sectionId: sectionId.get(f.section)!,
            key: f.key,
            label: f.label,
            type: f.type,
            options: (f.options ?? null) as Any,
            required: f.required ?? false,
            unique: f.unique ?? false,
            filterable: f.filterable ?? false,
            showInList: f.showInList ?? false,
            showOnCard: f.showOnCard ?? false,
            customerEditable: f.customerEditable ?? false,
            sensitive: false,
            trackHistory: false,
            isSystem: true,
            systemKey: f.key,
            sortOrder: order,
          },
        });
      }
      if (args.dryRun) console.log(`  [dry-run] ${t.slug}: ระบบ ${sys.name} — ฟิลด์ระบบที่ยังขาด ${FIELDS.length - (await tx.memberField.count({ where: { systemId: sys.id, isSystem: true } }))} ตัว`);
    }
  };

  if (args.dryRun) await work(prisma);
  else await prisma.$transaction(work, { timeout: 180_000, maxWait: 30_000 });
  if (touched) {
    counts.ร้านที่แก้ += 1;
    console.log(`  ✏️  ${t.name} (${t.slug})`);
  }
}

common.summary(SCRIPT, args, { ...counts, ฟิลด์ระบบทั้งหมด: FIELDS.length });
await prisma.$disconnect();
