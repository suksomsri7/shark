// ถ่ายภาพหน้าจอจริงของ "CRM v2" (RUN CRM) — เดสก์ท็อป 1440×900 + มือถือ 390×844 (fullPage)
//
// ใช้:
//   bash scripts/acc-v2-serve.sh                               # production build บน .env.qc :3215 (ต้องมีก่อน)
//   pnpm exec tsx scripts/visual-crm.mts 0.1                   # ถ่ายชุดของ WO C0.1 (ดู SPECS ด้านล่าง · ปริยาย owner)
//   pnpm exec tsx scripts/visual-crm.mts 0.1 --user thana      # สายตา STAFF ทีมภูเก็ต
//   pnpm exec tsx scripts/visual-crm.mts 0.1 --user nok        # สายตาหัวหน้าทีมกระบี่
//   pnpm exec tsx scripts/visual-crm.mts 0.1 --user manager    # สายตาผู้จัดการ
//   pnpm exec tsx scripts/visual-crm.mts 3.5 --user customer:<รหัส>  # สายตาลูกค้า (portal /b/* — มีตั้งแต่ C3.5)
//   pnpm exec tsx scripts/visual-crm.mts path /app/sys/<sys>/crm/deals   # หน้าเดียวตามใจ
//   bash scripts/acc-v2-serve.sh stop
//
// 🔴 ชื่อไฟล์จงใจไม่ขึ้นต้น qc- (ต้อง build+server+chromium — ไม่เข้า qc:all)
// 🔴 session ที่ mint ต้องถูกลบเสมอ — ปักธง userAgent = "qc-visual-crm" แล้วลบ **เฉพาะแถวของรอบนี้** ใน finally
//    (mint อยู่ในกรอบ try เสมอ · ห้าม process.exit() ระหว่างนั้น เพราะ exit ข้าม finally = token ค้างในฐาน QC ที่ใช้ร่วมกัน)
// 🔴 ล้นแนวนอน (overflow) = ❌ ตกทันที ไม่ใช่แค่บันทึก — ด่าน D7 (MASTER-PLAN §3) บอกว่า 'ไม่มี overflow'
// 🔴 ชื่อคุกกี้ผูกกับ APP_ENV: http = `shark_session` · https = `__Host-shark_session`
// 🔴 ทุกบล็อก "เตรียมของ" ต่อ WO ต้องคืนสภาพใน restoreSeed() (อยู่ใน finally — พังกลางทางก็คืน)
// 🔴 ต่อ QC server ไม่ได้ = ตายทันทีพร้อมเหตุผล (ห้ามค้างรอ) — ตรวจหลังเลือกสเปค ก่อน mint session เสมอ
// โครง/ขั้นตอน (Step) สืบทอดจาก scripts/visual-member.mts (M1.3–M3.11)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const cq = (await import("./crm-qc-env.mts" as string)) as { CQC: Any };
const { CQC } = cq;
const { prisma } = await import("@/lib/core/db");
const { sha256 } = await import("@/lib/core/hash");

const argv = process.argv.slice(2);
const WO = argv[0] ?? "0.1";
const userKey = argv.includes("--user") ? argv[argv.indexOf("--user") + 1]! : "owner";
const isCustomer = userKey.startsWith("customer:");
const STAFF_KEYS = ["owner", "manager", "thana", "nok"] as const;
if (!isCustomer && !(STAFF_KEYS as readonly string[]).includes(userKey)) {
  console.error(`❌ --user ${userKey} ไม่รู้จัก — ใช้ได้: ${STAFF_KEYS.join(" · ")} · customer:<รหัส>`);
  process.exit(2);
}
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";
const OUT = `${CQC.shotsDir}/${WO}`;
mkdirSync(OUT, { recursive: true });
if (!existsSync(CQC.expectedPath)) { console.error(`❌ ไม่พบเฉลย ${CQC.expectedPath} — รัน seed ก่อน (scripts/seed-crm-qc.mts)`); process.exit(2); }
const E = JSON.parse(readFileSync(CQC.expectedPath, "utf8"));
const SYS: string = E.systemId;
const CRM_BASE = `/app/sys/${SYS}/crm`;

type Step =
  | { click: string }
  | { select: { on: string; value: string } }
  | { fill: string; value: string }
  | { press: string }
  | { waitFor: string; timeoutMs?: number }
  | { drag: { from: string; to: string; steps?: number } }
  | { dragBy: { on: string; dx: number; dy?: number; steps?: number } }
  | { wait: number }
  | { swipe: { on: string; dx: number } }
  | { upload: { on: string; filePath: string } }
  | { longPress: { on: string; ms?: number } }
  | { scrollTo: string };
type Spec = {
  name: string;
  path: string;
  note?: string;
  steps?: Step[];
  onlyDevice?: "desktop" | "mobile";
  expect?: string[];
  /** งานฝั่งข้อมูลก่อนสเปคนี้ (รันครั้งเดียวต่อสเปค) — ต้องคืนใน restoreSeed() */
  before?: () => Promise<void>;
};

// ── ของชั่วคราวต่อ WO (จำไว้คืนใน restoreSeed) ──
// C0.1 ไม่เตรียมข้อมูลอะไรเลย (อ่านอย่างเดียว) — ใบถัดไปเพิ่มบล็อก `if (WO === "1.x") { … }` ตรงนี้
// แล้วเก็บ id ที่สร้างไว้ใน TMP เพื่อให้ restoreSeed() ลบทิ้งได้ · ทุกแถวชั่วคราวติดแท็ก `qc-visual-crm`
const TMP = {
  contactIds: [] as string[], dealIds: [] as string[], activityIds: [] as string[], companyIds: [] as string[],
  // CRM C2.2/C2.3 ▸ ของที่สร้างผ่าน facade จริงเพื่อให้ภาพ "มีของ" เหมือนแบบ (ลบครบใน restoreSeed) ◂
  sequenceIds: [] as string[], enrollmentIds: [] as string[], ruleIds: [] as string[],
  // CRM C2.4 ▸ นัดของโมดูลจอง/คลินิก/โรงเรียนที่ต้องโผล่บนปฏิทิน CRM (โมดูลพวกนั้น "ไม่มี" facade ฝั่งเขียน — ใบนี้เปิดแค่ขาอ่าน
  //   ⇒ แถวนัดสร้างด้วย prisma ตรง ๆ แล้วลบครบใน restoreSeed · ฝั่ง CRM (ผู้ติดต่อ) ยังสร้างผ่าน facade เหมือนใบอื่น) ◂
  unitIds: [] as string[], bookingIds: [] as string[], clinicIds: [] as string[], schoolIds: [] as string[], partyIds: [] as string[],
  // CRM C2.5 ▸ เธรดจดหมาย 1 ชุด (ขาเข้ามี HTML + ไฟล์แนบ) · แม่แบบ 1 ใบ · ทับค่าต่อผู้ใช้ 1 แถว (ลบครบใน restoreSeed) ◂
  emailIds: [] as string[], emailTemplateIds: [] as string[], emailUserSettingIds: [] as string[], emailFileIds: [] as string[],
  // CRM C2.6 ▸ ลิงก์ติดตาม · ผู้เข้าชม (การเข้าชม+เหตุการณ์) · ผู้ติดต่อที่ถูกผูก (กิจกรรม WEB + event) · ฟอร์ม (ลบครบใน restoreSeed) ◂
  trackedLinkIds: [] as string[], webVisitorIds: [] as string[], webContactIds: [] as string[], formIds: [] as string[],
  // CRM C2.7 ▸ ทางเดินเงิน: การผูกบัญชี↔CRM · ใบเสนอราคา/บิล POS ตัวอย่าง (แถวเงิน CrmDealPayment ถูกลบตามดีล onDelete: Cascade — ไม่ต้องจำ id) ◂
  accLinkIds: [] as string[], docIds: [] as string[], posSaleIds: [] as string[],
};
/** จำนวนแถวก่อน "เตรียมของ" (−1 = ใบนี้ไม่ได้เตรียมอะไร) — restoreSeed() พิมพ์คู่กับจำนวนหลังคืน เพื่อพิสูจน์ว่าเท่าเดิม */
const BEFORE = { sequences: -1, rules: -1, emails: -1, emailTemplates: -1, links: -1, webSessions: -1, forms: -1, accountDocs: -1, posSales: -1, moneyRows: -1 };
// CRM C2.6 ▸ ค่าตั้ง `settings.crm.tracking` ก่อนแตะ (undefined = ใบนี้ไม่ได้แตะ · null = เดิมไม่มีคีย์นี้) + เวลาเริ่มรอบ (ลบ audit ของรอบนี้) ◂
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let C26_TRACKING_BEFORE: any;
const C26_START = new Date();
let C26_LINK_ID: string | null = null;

// แท็บย่อยของ CRM v1 (crmTabs ใน src/lib/modules/crm/ui.tsx) — ลิงก์จริงที่ต้องมีทุกหน้า
const V1_TABS = ["a[href$='/crm/deals']", "a[href$='/crm/activities']", "a[href$='/crm/contacts']"];

// C1.3 — บริษัทที่มีผู้ติดต่อมากที่สุดของระบบ CRM ใน seed (อ่านอย่างเดียว ⇒ ไม่มีอะไรต้องคืน)
const C13_COMPANY: string | null = WO === "1.3"
  ? ((await (prisma as Any).crmCompany.findMany({ where: { systemId: SYS, archivedAt: null }, select: { id: true, _count: { select: { contacts: true } } } }))
      .sort((a: Any, b: Any) => b._count.contacts - a._count.contacts)[0]?.id ?? null)
  : null;

// C1.4 — ผู้ติดต่อที่มีดีลมากที่สุดของระบบ CRM ใน seed (อ่านอย่างเดียว)
const C14_CONTACT: string | null = WO === "1.4"
  ? ((await (prisma as Any).crmContact.findMany({ where: { systemId: SYS, archivedAt: null, mergedIntoId: null }, select: { id: true, _count: { select: { deals: true } } } }))
      .sort((a: Any, b: Any) => b._count.deals - a._count.deals)[0]?.id ?? null)
  : null;

// C1.5 — ดีลที่มีบรรทัดสินค้า/ประวัติมากที่สุด (อ่านอย่างเดียว)
const C15_DEAL: string | null = WO === "1.5" || WO === "1.6"
  ? ((await (prisma as Any).crmDeal.findMany({ where: { systemId: SYS }, select: { id: true, _count: { select: { stageHistory: true } } } }))
      .sort((a: Any, b: Any) => b._count.stageHistory - a._count.stageHistory)[0]?.id ?? null)
  : null;

// C1.9 — seed object `contract` + its newest record (read-only)
const C19_REC: string | null = WO === "1.9"
  // parent = บริษัทที่เจ้าของเป็น OWNER หรือคนในหน่วยของ manager (ป่าตอง) — บริษัทของ nok (กระบี่) manager มองไม่เห็นตามหน่วย = 404 ถูกต้อง
  ? await (async () => {
      const P = prisma as Any;
      const mgr = await P.membership.findFirst({ where: { tenantId: E.tenantId, userId: E.users.manager.userId }, select: { unitAccess: true } });
      const mu: string[] = Array.isArray(mgr?.unitAccess) ? mgr.unitAccess : [];
      const bosses = (await P.membership.findMany({ where: { tenantId: E.tenantId }, select: { userId: true, role: true, unitAccess: true } }))
        .filter((x: Any) => x.role === "OWNER" || (Array.isArray(x.unitAccess) && x.unitAccess.some((u: string) => mu.includes(u)))).map((x: Any) => x.userId);
      const cos = (await P.crmCompany.findMany({ where: { systemId: SYS, ownerUserId: { in: bosses }, archivedAt: null }, select: { id: true } })).map((x: Any) => x.id);
      return ((await P.customRecord.findFirst({ where: { systemId: SYS, archivedAt: null, object: { key: "contract" }, parentType: "COMPANY", parentId: { in: cos } }, orderBy: { createdAt: "desc" }, select: { id: true } }))?.id ?? null) as string | null;
    })()
  : null;

// CRM C1.11 ▸ ห้องแชทของร้าน QC ที่ลูกค้าเป็นผู้ติดต่อใน CRM (แผงข้าง "CRM") — อ่านอย่างเดียว · ไม่มี = ข้ามภาพแผงแชท
const C111_CHAT: { sysId: string; convId: string } | null = WO === "1.11"
  ? await (async () => {
      const P = prisma as Any;
      const parties = (await P.crmContact.findMany({ where: { systemId: SYS, partyId: { not: null }, mergedIntoId: null }, select: { partyId: true }, take: 500 })).map((x: Any) => x.partyId);
      const cc = await P.chatContact.findFirst({ where: { tenantId: E.tenantId, partyId: { in: parties } }, select: { id: true, systemId: true } });
      const conv = cc ? await P.chatConversation.findFirst({ where: { tenantId: E.tenantId, contactId: cc.id }, orderBy: { lastMessageAt: "desc" }, select: { id: true } }) : null;
      return cc && conv ? { sysId: cc.systemId as string, convId: conv.id as string } : null;
    })()
  : null;
// C1.11 ▸ ตัวอย่างสำหรับหน้า 360 ที่ 390 (อ่านอย่างเดียว)
const C111_IDS = WO === "1.11"
  ? await (async () => {
      const P = prisma as Any;
      const contact = (await P.crmContact.findFirst({ where: { systemId: SYS, archivedAt: null, mergedIntoId: null, ...(userKey === "thana" ? { ownerUserId: E.users.thana?.userId ?? "-" } : {}) }, orderBy: { createdAt: "asc" }, select: { id: true } }))?.id ?? null;
      const company = (await P.crmCompany.findFirst({ where: { systemId: SYS, archivedAt: null, mergedIntoId: null, ...(userKey === "thana" ? { ownerUserId: E.users.thana?.userId ?? "-" } : {}) }, orderBy: { createdAt: "asc" }, select: { id: true } }))?.id ?? null;
      const deal = (await P.crmDeal.findFirst({ where: { systemId: SYS, ...(userKey === "thana" ? { ownerUserId: E.users.thana?.userId ?? "-" } : {}) }, orderBy: { createdAt: "asc" }, select: { id: true } }))?.id ?? null;
      return { contact, company, deal };
    })()
  : { contact: null, company: null, deal: null };
// ◂ CRM C1.11
// CRM C2.2 ▸ ผู้ติดต่อตัวอย่างสำหรับบล็อก "ลำดับการติดตาม" บนหน้า 360 (อ่านอย่างเดียว · thana เห็นแต่คนของตัวเอง) ◂
const C22_CONTACT: string | null = WO === "2.2"
  ? ((await (prisma as Any).crmContact.findFirst({
      where: { systemId: SYS, archivedAt: null, mergedIntoId: null, marketingOptOut: false, ...(userKey === "thana" ? { ownerUserId: E.users.thana?.userId ?? "-" } : {}) },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }))?.id ?? null)
  : null;

// CRM C2.5 ▸ เธรดที่จะถ่าย (ตั้งค่าในบล็อก "เตรียมของ" ด้านล่าง — ที่นี่ประกาศไว้ให้ SPECS อ้างถึงได้) ◂
let C25_THREAD: string | null = null;

// CRM C2.7 ▸ หน้าขายของโมดูล POS (ช่อง "ดีล" อยู่ที่นั่น ไม่ได้อยู่ใต้ /crm) — สาขาป่าตองของเฉลย ◂
const POS_REGISTER = `/app/sys/${(E.systems?.POS ?? "") as string}/pos/register?unit=${(E.units?.patong ?? "") as string}`;

const SPECS: Record<string, Spec[]> = {
  // CRM C2.7 ▸ ทางเดินเงิน (พิมพ์เขียว §7.2 · ภาพ 06): ช่อง "ดีล" ข้างช่องสมาชิกบนหน้าขาย · บล็อก "ดีล" บนหน้าเอกสารบัญชี ·
  //   ดีล 360 ที่มีรายการสินค้า + บิลหน้าร้านที่ผูกไว้ (บล็อก "เตรียมของ C2.7" ด้านล่างสร้างให้ แล้ว unshift สเปคที่ต้องใช้ id)
  //   ภาพแรกเป็น "ตัวคุม": ยังไม่เลือกสมาชิก ⇒ ช่องดีลต้องไม่โผล่ (ร้านที่ไม่ได้ใช้ CRM v2 เห็นหน้าขายเดิมทุกตัวอักษร)
  //   thana/nok (STAFF) ไม่มีสิทธิ์หน้าบัญชี/หน้าขายของเฉลย ⇒ ถ่ายเฉพาะ owner/manager (แบบเดียวกับ C2.1/C2.3)
  "2.7": isCustomer || userKey === "thana" || userKey === "nok" || !E.systems?.POS ? [] : [
    {
      name: `pos-register-no-deal-${userKey}`,
      path: POS_REGISTER,
      note: "หน้าขายก่อนเลือกสมาชิก — ต้องไม่มีช่อง \"ดีล\" (ตัวคุม parity ของหน้าขายเดิม)",
      expect: ["[data-testid=pos-register]", "[data-testid=pos-member-select]"],
      steps: [{ waitFor: "[data-testid=pos-member-select]", timeoutMs: 20_000 }, { wait: 400 }],
    },
  ],
  // ◂ CRM C2.7
  // CRM C2.4 ▸ บันทึกการโทร (ภาพ 08 ซ้าย) + ปฏิทินที่รวมนัดของโมดูลอื่น (ภาพ 08 ขวา) — เจ้าของร้าน + ผู้จัดการ · 1440 และ 390
  //   ชุดนี้ต้องมี "ของจริง" ทั้งสองฝั่ง: ผู้ติดต่อที่มีเบอร์ (ปุ่มโทรจึงขึ้น) + นัดในสัปดาห์นี้ที่ผูก Party เดียวกัน
  //   ⇒ บล็อก "เตรียมของ C2.4" ด้านล่างสร้างให้ แล้ว splice สเปคของผู้ติดต่อ 360 เข้ามา (พาธต้องมี id)
  //   thana/nok (STAFF) เห็นเฉพาะลูกค้าของตัวเอง ⇒ ผู้ติดต่อชั่วคราวของเจ้าของร้านจะ 404 สำหรับพวกเขา — ไม่อยู่ในชุด
  "2.4": isCustomer || userKey === "thana" || userKey === "nok" ? [] : [
    {
      name: `crm-calendar-merged-${userKey}`,
      path: `${CRM_BASE}/calendar?view=week&scope=team`,
      note: "ปฏิทินสัปดาห์ที่รวมนัดของ Party เดียวกันจากระบบจอง · คลินิก · โรงเรียน (ชิปเส้นประ = อ่านอย่างเดียว) — เทียบภาพ 08 ขวา",
      expect: ["[data-testid=crm-calendar-page]", "[data-testid=crm-calendar-appointment]"],
      steps: [{ waitFor: "[data-testid=crm-calendar-appointment]", timeoutMs: 20_000 }, { wait: 500 }],
    },
  ],
  // ◂ CRM C2.4
  // CRM C2.5 ▸ อีเมล (ภาพ 08 กลาง + ภาพ 15): กล่องจดหมาย · กล่อง "ยังไม่จับคู่" · เธรด (จดหมายขาเข้าใน iframe ทึบ
  //   + ปุ่มแสดงรูป + ไฟล์แนบ) · ช่องเขียนจดหมาย (แม่แบบ/แนบ/ตั้งเวลา) · ตั้งค่าอีเมล — ทั้ง 1440 และ 390
  //   thana/nok (STAFF) เห็นกล่องจดหมายได้ (คีย์ crm.email.read ปริยาย) แต่หน้าตั้งค่า = 404 (ต้อง crm.email.settings)
  //   ⚠️ ไม่กดปุ่มที่ส่งจดหมายจริง — ชุดนี้ถ่ายรูปอย่างเดียว
  "2.5": isCustomer ? [] : [
    { name: `crm-emails-${userKey}`, path: `${CRM_BASE}/emails`, note: "กล่องจดหมาย — รายการเธรด (ผู้ติดต่อ · หัวข้อ · ข้อความย่อ · เข้า/ออก · เวลา) + ช่องค้นหา", expect: ["[data-testid=crm-emails-page]", "[data-testid=crm-emails-inbox]", "[data-testid=crm-emails-search]"], steps: [{ waitFor: "[data-testid=crm-emails-inbox]", timeoutMs: 20_000 }, { wait: 500 }] },
    ...(userKey === "owner" || userKey === "manager"
      ? ([
          { name: `crm-emails-unmatched-${userKey}`, path: `${CRM_BASE}/emails?box=unmatched`, note: "กล่อง \"ยังไม่จับคู่\" (เปิดได้เฉพาะคนที่เห็นผู้ติดต่อทั้งระบบ/ผู้จัดการขึ้นไป)", expect: ["[data-testid=crm-emails-tab-unmatched]"], steps: [{ waitFor: "[data-testid=crm-emails-inbox]", timeoutMs: 20_000 }, { wait: 400 }] },
          { name: `crm-email-settings-${userKey}`, path: `${CRM_BASE}/settings/email`, note: "ตั้งค่า — อีเมล (เส้นทางส่ง/รับ) ตามภาพ 15: กล่องรับ + หมุนกุญแจ · ผู้ส่ง + โดเมน/DNS · Reply-To · สำเนา · BCC/ติดตาม/อายุเก็บ · ทับค่าต่อผู้ใช้ · แม่แบบ", expect: ["[data-testid=crm-email-settings]", "[data-testid=crm-email-inbound-address]", "[data-testid=crm-email-user-overrides]", "[data-testid=crm-email-domain-records]"], steps: [{ waitFor: "[data-testid=crm-email-settings]", timeoutMs: 20_000 }, { wait: 500 }] },
        ] as Spec[])
      : []),
  ],
  // ◂ CRM C2.5
  // CRM C2.6 ▸ ติดตามเว็บ + ลิงก์ติดตาม (ภาพ 16 + ภาพ 11) · ฟอร์มรับลูกค้า · บล็อกไทม์ไลน์เว็บบนผู้ติดต่อ 360 — ทั้ง 1440 และ 390
  //   thana/nok (STAFF ไม่มีคีย์ crm.tracking.manage) = 404 ตามแบบ (ข้อสอบ C2.6 X9.1) → ถ่ายเฉพาะ owner/manager
  //   ⚠️ ไม่กดปุ่มที่ลบลิงก์จริง (งานอันตราย X9) — ชุดนี้เปิดกล่อง QR กับกล่องพรีวิวแบนเนอร์อย่างเดียว
  "2.6": isCustomer || userKey === "thana" || userKey === "nok" ? [] : [
    {
      name: `crm-tracking-${userKey}`,
      path: `${CRM_BASE}/settings/tracking`,
      note: "ติดตามเว็บและลิงก์ (ภาพ 16 + 11) — สวิตช์เปิดใช้ · โดเมนที่อนุญาต · โค้ดฝัง · ข้อความ cookie consent + เวอร์ชัน · อายุเก็บ (ไม่เก็บ IP เต็ม) · สถิติ · ตารางลิงก์ติดตาม",
      expect: ["[data-testid=crm-tracking-page]", "[data-testid=crm-track-web-enabled]", "[data-testid=crm-track-embed-code]", "[data-testid=crm-track-stats]", "[data-testid=crm-link-create]"],
      steps: [{ waitFor: "[data-testid=crm-tracking-page]", timeoutMs: 20_000 }, { wait: 500 }],
    },
    {
      name: `crm-tracking-preview-${userKey}`,
      path: `${CRM_BASE}/settings/tracking`,
      note: "กล่องพรีวิวแบนเนอร์ cookie consent (ข้อความของร้าน + ปุ่ม ยอมรับ/ปฏิเสธ) — เปิดด้วยปุ่ม \"ดูตัวอย่างแบนเนอร์\"",
      expect: ["[data-testid=crm-track-preview-box]"],
      steps: [{ waitFor: "[data-testid=crm-track-preview]", timeoutMs: 20_000 }, { click: "[data-testid=crm-track-preview]" }, { wait: 400 }],
    },
    {
      name: `crm-forms-${userKey}`,
      path: `${CRM_BASE}/settings/forms`,
      note: "ฟอร์มรับลูกค้า — ระบบ CRM ปลายทาง · กฎมอบหมาย · คะแนนเมื่อกรอก · บริษัทจากช่อง · กันสแปม · utm · โค้ดฝัง",
      expect: ["[data-testid=crm-forms-page]"],
      steps: [{ waitFor: "[data-testid=crm-forms-page]", timeoutMs: 20_000 }, { wait: 500 }],
    },
  ],
  // ◂ CRM C2.6
  // CRM C2.3 ▸ มอบหมายอัตโนมัติ (ภาพ 07 ขวา): ตารางกฎตามลำดับ + ป้าย "คิวถัดไป" + ผู้รับสำรอง + ทดลอง · ตัวแก้กฎ (เปิดด้วย "เพิ่มกฎ") ทั้ง 1440 และ 390
  //   thana/nok (STAFF ไม่มีคีย์ crm.assignment.manage) = 404 ตามแบบ (ข้อสอบ C2.3 X1.6) → ถ่ายเฉพาะ owner/manager
  "2.3": isCustomer || userKey === "thana" || userKey === "nok" ? [] : [
    { name: `crm-assignment-${userKey}`, path: `${CRM_BASE}/settings/assignment`, note: "มอบหมายอัตโนมัติ — กฎตามลำดับ (วิธีแจก · คนที่รับ · คิวถัดไป) + ผู้รับสำรอง + ทดลอง + คิวของพนักงาน", expect: ["[data-testid=crm-assign-page]", "[data-testid=crm-assign-rule-list]", "[data-testid=crm-assign-fallback]"], steps: [{ waitFor: "[data-testid=crm-assign-page]", timeoutMs: 20_000 }, { wait: 500 }] },
    { name: `crm-assignment-editor-${userKey}`, path: `${CRM_BASE}/settings/assignment`, note: "ตัวแก้กฎ: ชื่อ/วิธีแจก/ทีม/เพดาน + คนที่รับ + เงื่อนไข (และ/หรือ)", expect: ["[data-testid=crm-assign-rule-mode]"], steps: [{ waitFor: "[data-testid=crm-assign-rule-new]", timeoutMs: 20_000 }, { click: "[data-testid=crm-assign-rule-new]" }, { wait: 300 }, { click: "[data-testid=crm-assign-cond-add]" }, { wait: 300 }] },
  ],
  // ◂ CRM C2.3
  // CRM C2.1 ▸ กฎอัตโนมัติ CRM (ภาพ 07 บน): รายการกฎ + ชิปโควตา · ตัวสร้างกฎประโยคไทย (เปิดด้วย "สร้างกฎใหม่") ทั้ง 1440 และ 390
  //   thana/nok (STAFF ไม่มีคีย์ crm.automation.manage) = 404 ตามแบบ (ข้อสอบ C2.1 X1.4) → ถ่ายเฉพาะ owner/manager
  "2.1": isCustomer || userKey === "thana" || userKey === "nok" ? [] : [
    { name: `crm-automation-${userKey}`, path: `${CRM_BASE}/settings/automation`, note: "กฎอัตโนมัติ CRM — รายการกฎ (รันแล้ว · เดือนนี้ · เปิด/ปิด) + บันทึกการทำงาน", expect: ["[data-testid=crm-auto-page]", "[data-testid=crm-auto-usage]"], steps: [{ waitFor: "[data-testid=crm-auto-page]", timeoutMs: 20_000 }, { wait: 500 }] },
    { name: `crm-automation-builder-${userKey}`, path: `${CRM_BASE}/settings/automation`, note: "ตัวสร้างกฎประโยคไทย: เมื่อ / และถ้า / ให้ทำ + ทดลองรัน", expect: ["[data-testid=crm-auto-trigger]"], steps: [{ waitFor: "[data-testid=crm-auto-new]", timeoutMs: 20_000 }, { click: "[data-testid=crm-auto-new]" }, { wait: 300 }, { click: "[data-testid=crm-auto-add-condition]" }, { wait: 300 }] },
  ],
  // ◂ CRM C2.1
  // CRM C2.2 ▸ ลำดับการติดตาม (ภาพ 07 ล่าง): รายการลำดับ · ฟอร์มสร้างลำดับใหม่ · ตัวแก้ไข (ขั้น + สถิติต่อขั้น + ผู้ลงทะเบียน)
  //   · วันทำการ/วันหยุด (มีปุ่ม "นำเข้าวันหยุดราชการไทย") · ปุ่มใส่เข้าลำดับบนผู้ติดต่อ 360 · ใส่เป็นกลุ่มจากรายชื่อผู้ติดต่อ
  //   thana/nok (STAFF มีแต่คีย์ crm.sequence.enroll) เห็นหน้ารายการ/ตัวแก้ไขได้แบบอ่าน แต่หน้าวันหยุด = 404 (ต้องมี crm.sequence.manage)
  //   ⚠️ ไม่กดปุ่มที่เขียนฐาน (สร้าง/ใส่เข้าลำดับ) — ชุดนี้ถ่ายรูปอย่างเดียว ไม่แก้ข้อมูลเฉลย
  "2.2": isCustomer ? [] : [
    { name: `crm-sequences-${userKey}`, path: `${CRM_BASE}/settings/sequences`, note: "ลำดับการติดตาม — รายการลำดับ (จำนวนขั้น · เวอร์ชัน · กำลังเดิน/พัก/จบ/หยุด)", expect: ["[data-testid=crm-sequences-page]", "[data-testid=crm-seq-list]"], steps: [{ waitFor: "[data-testid=crm-sequences-page]", timeoutMs: 20_000 }, { wait: 500 }] },
    ...(userKey === "owner" || userKey === "manager"
      ? ([
          { name: `crm-sequences-new-${userKey}`, path: `${CRM_BASE}/settings/sequences`, note: "ฟอร์มสร้างลำดับใหม่ (ชื่อ + ขั้นแรก: อีเมล/LINE/งาน/รอ)", expect: ["[data-testid=crm-seq-new-form]", "[data-testid=crm-seq-step-kind-new]"], steps: [{ waitFor: "[data-testid=crm-seq-new]", timeoutMs: 20_000 }, { click: "[data-testid=crm-seq-new]" }, { wait: 400 }] },
          { name: `crm-sequences-holidays-${userKey}`, path: `${CRM_BASE}/settings/holidays`, note: "วันทำการและวันหยุด + นำเข้าวันหยุดราชการไทยของปี N", expect: ["[data-testid=crm-seq-calendar]", "[data-testid=crm-seq-holiday-import]"], steps: [{ waitFor: "[data-testid=crm-seq-calendar]", timeoutMs: 20_000 }, { wait: 400 }] },
        ] as Spec[])
      : []),
    { name: `crm-contacts-bulk-enroll-${userKey}`, path: `${CRM_BASE}/contacts`, note: "ใส่ผู้ติดต่อเข้าลำดับเป็นกลุ่ม (ยืนยัน + เหตุผล — X9)", expect: ["[data-testid=contacts-page]"], steps: [{ waitFor: "[data-testid=contacts-page]", timeoutMs: 20_000 }, { wait: 600 }] },
    ...(C22_CONTACT
      ? ([{ name: `crm-contact-360-sequences-${userKey}`, path: `${CRM_BASE}/contacts/${C22_CONTACT}`, note: "บล็อกลำดับการติดตามบนผู้ติดต่อ 360 + ปุ่มใส่เข้าลำดับ", expect: ["[data-testid=contact-360-sequences]"], steps: [{ waitFor: "[data-testid=contact-360-sequences]", timeoutMs: 20_000 }, { wait: 500 }] }] as Spec[])
      : []),
  ],
  // ◂ CRM C2.2
  // CRM C1.11 ▸ ทุกหน้า C1 ที่ 390 (owner/thana · D7 ไม่มีล้นแนวนอน) + หน้าใหม่ของ C1.11 ทั้งสองขนาด + แผงแชท (เดสก์ท็อป — คอลัมน์บริบทของแชทมีเฉพาะ lg ขึ้นไป)
  //   + หน้าสลับ (เจ้าของร้าน · ต้องมี CRM_V2_SWITCH=all ในเซิร์ฟเวอร์ QC จึงเห็นการ์ดสวิตช์) · thana ไม่มีคีย์ตั้งค่า ⇒ หน้าตั้งค่าไม่อยู่ในชุดของ thana
  "1.11": isCustomer ? [] : [
    { name: `crm-home-${userKey}`, path: `/app/sys/${SYS}`, note: "หน้าแรก CRM ใหม่ (ภาพ 13(ก)): ดีลของฉัน + ชิปขั้น + ป้ายนิ่ง · งานของฉันวันนี้", expect: ["[data-testid=crm-home]", "[data-testid=crm-home-my-deals]", "[data-testid=crm-home-my-tasks]"], steps: [{ waitFor: "[data-testid=crm-home]", timeoutMs: 20_000 }, { wait: 600 }] },
    { name: `crm-import-${userKey}`, path: `${CRM_BASE}/contacts/import`, note: "นำเข้าผู้ติดต่อ + บริษัท (จับคู่คอลัมน์ · 3 วิธีจัดการแถวซ้ำ)", expect: ["[data-testid=crm-import-page]", "[data-testid=crm-import-file]"], steps: [{ waitFor: "[data-testid=crm-import-page]", timeoutMs: 20_000 }, { wait: 400 }] },
    { name: `crm-contact-duplicates-${userKey}`, path: `${CRM_BASE}/contacts/duplicates`, note: "ผู้ติดต่อที่น่าจะซ้ำ (การ์ดที่ 390 · ตารางที่ 1440)", expect: ["[data-testid=crm-contact-duplicates-page]"], steps: [{ waitFor: "[data-testid=crm-contact-duplicates-page]", timeoutMs: 20_000 }, { wait: 400 }] },
    { name: `crm-company-duplicates-${userKey}`, path: `${CRM_BASE}/companies/duplicates`, note: "บริษัทที่น่าจะซ้ำ", expect: ["[data-testid=crm-company-duplicates-page]"], steps: [{ waitFor: "[data-testid=crm-company-duplicates-page]", timeoutMs: 20_000 }, { wait: 400 }] },
    ...(userKey === "owner" ? [{ name: `crm-switch-${userKey}`, path: `${CRM_BASE}/settings`, note: "หน้าตั้งค่า CRM + สวิตช์หน้าจอ (เจ้าของร้าน)", expect: ["[data-testid=crm-settings-page]"], steps: [{ waitFor: "[data-testid=crm-settings-page]", timeoutMs: 20_000 }, { wait: 400 }] } as Spec] : []),
    ...(C111_CHAT ? [{ name: `crm-chat-panel-${userKey}`, path: `/app/sys/${C111_CHAT.sysId}?c=${C111_CHAT.convId}`, note: "แผงข้าง CRM ในห้องแชท (ผู้ติดต่อ · บริษัท · ดีลเปิด · ปุ่ม 3)", onlyDevice: "desktop" as const, expect: ["[data-testid=crm-chat-panel]"], steps: [{ waitFor: "[data-testid=crm-chat-panel]", timeoutMs: 20_000 }, { wait: 600 }] } as Spec] : []),
    // ── หน้า C1 เดิมที่ 390 ──
    { name: `crm-390-contacts-${userKey}`, path: `${CRM_BASE}/contacts`, onlyDevice: "mobile", steps: [{ wait: 1200 }] },
    { name: `crm-390-contacts-new-${userKey}`, path: `${CRM_BASE}/contacts/new`, onlyDevice: "mobile", steps: [{ wait: 800 }] },
    ...(C111_IDS.contact ? [{ name: `crm-390-contact-360-${userKey}`, path: `${CRM_BASE}/contacts/${C111_IDS.contact}`, onlyDevice: "mobile" as const, steps: [{ wait: 1200 }] } as Spec] : []),
    { name: `crm-390-companies-${userKey}`, path: `${CRM_BASE}/companies`, onlyDevice: "mobile", steps: [{ wait: 1200 }] },
    { name: `crm-390-companies-new-${userKey}`, path: `${CRM_BASE}/companies/new`, onlyDevice: "mobile", steps: [{ wait: 800 }] },
    ...(C111_IDS.company ? [{ name: `crm-390-company-360-${userKey}`, path: `${CRM_BASE}/companies/${C111_IDS.company}`, onlyDevice: "mobile" as const, steps: [{ wait: 1200 }] } as Spec] : []),
    { name: `crm-390-deals-board-${userKey}`, path: `${CRM_BASE}/deals`, onlyDevice: "mobile", note: "กระดานปัดทีละขั้น (snap)", steps: [{ wait: 1500 }] },
    { name: `crm-390-deals-table-${userKey}`, path: `${CRM_BASE}/deals?view=table`, onlyDevice: "mobile", steps: [{ wait: 1200 }] },
    ...(C111_IDS.deal ? [{ name: `crm-390-deal-360-${userKey}`, path: `${CRM_BASE}/deals/${C111_IDS.deal}`, onlyDevice: "mobile" as const, steps: [{ wait: 1200 }] } as Spec] : []),
    { name: `crm-390-deals-new-${userKey}`, path: `${CRM_BASE}/deals/new`, onlyDevice: "mobile", steps: [{ wait: 800 }] },
    { name: `crm-390-pipelines-${userKey}`, path: `${CRM_BASE}/pipelines`, onlyDevice: "mobile", steps: [{ wait: 800 }] },
    { name: `crm-390-activities-${userKey}`, path: `${CRM_BASE}/activities`, onlyDevice: "mobile", steps: [{ wait: 1200 }] },
    { name: `crm-390-calendar-${userKey}`, path: `${CRM_BASE}/calendar`, onlyDevice: "mobile", steps: [{ wait: 1200 }] },
    ...(userKey === "owner"
      ? (["/settings/pipelines", "/settings/stages", "/settings/lost-reasons", "/settings/visibility", "/settings/objects", "/settings/api", "/objects"] as const).map((p) => ({ name: `crm-390${p.replace(/\//g, "-")}-${userKey}`, path: `${CRM_BASE}${p}`, onlyDevice: "mobile" as const, steps: [{ wait: 1000 }] }) as Spec)
      : []),
  ],
  // ◂ CRM C1.11
  // C1.9 — ข้อมูลกำหนดเอง: ตั้งค่าวัตถุ (+ ตัวออกแบบฟิลด์) · ดัชนี · รายการ · เรคคอร์ด (เทียบภาพ 06)
  // thana/nok (STAFF ไม่มีคีย์ crm.record.read) = 404 ตามแบบ (ข้อสอบ C1.9 X2 คุมไว้) → ถ่ายเฉพาะ owner/manager
  "1.9": isCustomer || userKey === "thana" || userKey === "nok" ? [] : [
    { name: `crm-objects-settings-${userKey}`, path: `${CRM_BASE}/settings/objects?object=contract`, note: "ตั้งค่าวัตถุ + ตัวออกแบบฟิลด์", steps: [{ wait: 1500 }] },
    { name: `crm-objects-index-${userKey}`, path: `${CRM_BASE}/objects`, note: "ดัชนีข้อมูลกำหนดเอง", steps: [{ wait: 1000 }] },
    { name: `crm-objects-list-${userKey}`, path: `${CRM_BASE}/objects/contract`, note: "รายการสัญญา", steps: [{ wait: 1200 }] },
    ...(C19_REC ? [{ name: `crm-objects-record-${userKey}`, path: `${CRM_BASE}/objects/contract/${C19_REC}`, note: "หน้าเรคคอร์ด", steps: [{ wait: 1200 }] } as Spec] : []),
  ],
  // CRM C1.10 ▸ ตั้งค่า CRM (หน้ารวม) · API และ webhook (คีย์ · curl · เครื่องมือ AI · ฮุค + การส่งล่าสุด) — เทียบภาพ 14 ขวา
  //   thana/nok/ผู้จัดการ = 404 (ไม่มี crm.settings.manage / crm.api.manage) — ภาพของเจ้าของร้านเท่านั้นที่มีเนื้อหา
  "1.10": isCustomer ? [] : [
    { name: `crm-settings-${userKey}`, path: `${CRM_BASE}/settings`, note: "ตั้งค่า CRM (ค่าปัจจุบัน + การ์ดไปหน้าตั้งค่าย่อย)", steps: [{ wait: 1500 }] },
    { name: `crm-settings-api-${userKey}`, path: `${CRM_BASE}/settings/api`, note: "API และ webhook: คีย์ · curl · เครื่องมือ AI 14 ตัว · ปลายทาง webhook · การส่งล่าสุด", steps: [{ wait: 1500 }] },
    { name: `crm-settings-api-new-key-${userKey}`, path: `${CRM_BASE}/settings/api`, note: "ฟอร์มสร้างคีย์ (ชุดสิทธิ์ 3 ชุด + ตัวกรองทีม)", onlyDevice: "desktop", steps: [{ wait: 1200 }, { click: "[data-testid=crm-api-new]" }, { wait: 500 }] },
  ],
  // ◂ CRM C1.10
  // C1.7 — ทีมขาย (/app/settings/teams · core) · สิทธิ์การมองเห็น (/crm/settings/visibility · v2) — เทียบภาพ 10 ซ้าย
  "1.7": isCustomer ? [] : [
    { name: `crm-teams-${userKey}`, path: `/app/settings/teams`, note: "ทีมขาย: การ์ดทีม + รายละเอียด", steps: [{ wait: 1500 }] },
    { name: `crm-visibility-${userKey}`, path: `${CRM_BASE}/settings/visibility`, note: "ตารางบทบาท × ข้อมูล + ข้อยกเว้นทีม/pipeline", steps: [{ wait: 1500 }] },
    { name: `crm-v2-deals-board-${userKey}`, path: `${CRM_BASE}/deals`, note: "กระดานดีลตามสิทธิ์ผู้ดู (thana = ทีมภูเก็ตเท่านั้น)", expect: ["[data-testid=deal-board]"], steps: [{ waitFor: "[data-testid=deal-board]", timeoutMs: 20_000 }, { wait: 600 }] },
  ],
  // C1.6 — กิจกรรม v2 · ปฏิทิน (สัปดาห์/เดือน · ทีม) · บล็อกกิจกรรม/ไฟล์ใน Deal 360 (เทียบภาพ 08)
  "1.6": isCustomer ? [] : [
    { name: `crm-activities-${userKey}`, path: `${CRM_BASE}/activities?scope=team`, note: "กิจกรรม v2 (ทีม · ค้าง)", expect: ["[data-testid=activities-list]"], steps: [{ waitFor: "[data-testid=activities-list]", timeoutMs: 20_000 }, { wait: 500 }] },
    { name: `crm-calendar-week-${userKey}`, path: `${CRM_BASE}/calendar?view=week&scope=team`, note: "ปฏิทินสัปดาห์ (+ นัด/โทร/งานชั่วคราว 4 รายการ ติดแท็ก qc-visual-crm)", steps: [{ wait: 1500 }],
      before: async () => {
        // ภาพเทียบ 08 ต้องมีรายการในสัปดาห์นี้ — seed มีกิจกรรมแค่ 2 รายการนอกสัปดาห์ ⇒ สร้างชั่วคราว แล้ว restoreSeed() ลบทิ้ง
        const P = prisma as Any; const now = Date.now(); const H = 3_600_000; const day0 = Math.floor((now + 7 * H) / (24 * H)) * 24 * H - 7 * H; // 00:00 ไทยวันนี้ (ถูกทั้งก่อน/หลัง 07:00 ไทย)
        const rows: [string, string, number, number][] = [["MEETING", "นัดสาธิตแพ็กเกจองค์กร", 0, 10], ["CALL", "โทรติดตามใบเสนอราคา", 1, 14], ["TASK", "ส่งสัญญาฉบับแก้ไข", 2, 9], ["VISIT", "เยี่ยมลูกค้าที่โรงแรม", -1, 15]];
        for (const [type, title, d, h] of rows) {
          const startAt = new Date(day0 + d * 24 * H + h * H);
          const a = await P.crmActivity.create({ data: { tenantId: E.tenantId, systemId: SYS, contactId: E.contactIds?.[0] ?? null, type, title: `${title} · qc-visual-crm`, startAt, endAt: new Date(startAt.getTime() + H), dueAt: type === "TASK" ? startAt : null, ownerUserId: E.users.owner.userId } });
          TMP.activityIds.push(a.id);
        }
      } },
    { name: `crm-calendar-month-${userKey}`, path: `${CRM_BASE}/calendar?view=month&scope=team`, note: "ปฏิทินเดือน", expect: ["[data-testid=calendar-month]"], steps: [{ waitFor: "[data-testid=calendar-month]", timeoutMs: 20_000 }, { wait: 500 }] },
    ...(C15_DEAL ? [{ name: `crm-deal-360-activity-${userKey}`, path: `${CRM_BASE}/deals/${C15_DEAL}?tab=activities`, note: "บล็อกกิจกรรม+การ์ดงาน+ไฟล์ใน Deal 360", expect: ["[data-testid=crm-activity-block]"], steps: [{ waitFor: "[data-testid=crm-activity-block]", timeoutMs: 20_000 }, { wait: 800 }] } as Spec] : []),
  ],
  // C1.5 — ดีล: กระดาน (crm-v2-deals) · ตาราง · พยากรณ์ · 360 · สร้าง · /pipelines (เทียบภาพ 02 กระดาน · 03 Deal 360)
  "1.5": isCustomer ? [] : [
    { name: `crm-v2-deals-board-${userKey}`, path: `${CRM_BASE}/deals`, note: "กระดานดีล v2", expect: ["[data-testid=deals-page]", "[data-testid=deal-board]"], steps: [{ waitFor: "[data-testid=deal-board]", timeoutMs: 20_000 }, { wait: 600 }] },
    { name: `crm-v2-deals-table-${userKey}`, path: `${CRM_BASE}/deals?view=table`, note: "ตารางดีล", expect: ["[data-testid=deals-page]"], steps: [{ waitFor: "[data-testid=deals-page]", timeoutMs: 20_000 }, { wait: 600 }] },
    { name: `crm-v2-deals-forecast-${userKey}`, path: `${CRM_BASE}/deals?view=forecast`, note: "พยากรณ์", expect: ["[data-testid=deals-page]"], steps: [{ waitFor: "[data-testid=deals-page]", timeoutMs: 20_000 }, { wait: 600 }] },
    ...(C15_DEAL ? [{ name: `crm-deal-360-${userKey}`, path: `${CRM_BASE}/deals/${C15_DEAL}`, note: "Deal 360", expect: ["[data-testid=deal-360]", "[data-testid=deal-360-header]"], steps: [{ waitFor: "[data-testid=deal-360]", timeoutMs: 20_000 }, { wait: 800 }] } as Spec] : []),
    { name: `crm-deals-new-${userKey}`, path: `${CRM_BASE}/deals/new`, note: "สร้างดีล /deals/new", expect: ["[data-testid=deal-new-form]"], steps: [{ waitFor: "[data-testid=deal-new-form]", timeoutMs: 20_000 }, { wait: 500 }] },
    { name: `crm-pipelines-${userKey}`, path: `${CRM_BASE}/pipelines`, note: "ภาพรวม pipelines", expect: ["[data-testid=pipelines-page]"], steps: [{ waitFor: "[data-testid=pipelines-page]", timeoutMs: 20_000 }, { wait: 500 }] },
  ],
  // C1.4 — ผู้ติดต่อ: รายการ · สร้างใหม่ · 360 (เทียบภาพ ledger/design-crm/05-*.png)
  "1.4": isCustomer ? [] : [
    {
      name: `crm-contacts-list-${userKey}`,
      path: `${CRM_BASE}/contacts`,
      note: "รายการผู้ติดต่อ v2: ตัวกรอง · มุมมองที่บันทึก · นำเข้า/ส่งออก · มอบหมายหลายรายการ",
      expect: ["[data-testid=contacts-filter-form]"],
      steps: [{ waitFor: "[data-testid=contacts-filter-form]", timeoutMs: 20_000 }, { wait: 500 }],
    },
    {
      name: `crm-contacts-new-${userKey}`,
      path: `${CRM_BASE}/contacts/new`,
      note: "ฟอร์มผู้ติดต่อใหม่ + กล่องรายการซ้ำ",
      expect: ["[data-testid=contact-new-form]"],
      steps: [{ waitFor: "[data-testid=contact-new-form]", timeoutMs: 20_000 }, { wait: 500 }],
    },
    ...(C14_CONTACT ? [{
      name: `crm-contact-360-${userKey}`,
      path: `${CRM_BASE}/contacts/${C14_CONTACT}`,
      note: "Contact 360 — เทียบภาพ 05",
      expect: ["[data-testid=contact-360]", "[data-testid=contact-360-header]", "[data-testid=contact-360-timeline]"],
      steps: [{ waitFor: "[data-testid=contact-360]", timeoutMs: 20_000 }, { wait: 800 }],
    } as Spec] : []),
    ...(C14_CONTACT ? [{
      name: `crm-contact-convert-${userKey}`,
      path: `${CRM_BASE}/contacts/${C14_CONTACT}`,
      note: "โมดัล 'แปลง lead' 3 ติ๊ก (สมาชิก/บริษัท/ดีล) — เทียบภาพ 05 (เปิดดูอย่างเดียว ไม่กดแปลง)",
      onlyDevice: "desktop" as const,
      expect: ["[data-testid=contact-convert-company-section]", "[data-testid=contact-convert-deal-section]"],
      steps: [{ waitFor: "[data-testid=contact-convert-btn]", timeoutMs: 20_000 }, { click: "[data-testid=contact-convert-btn]" }, { waitFor: "[data-testid=contact-convert-deal-section]", timeoutMs: 10_000 }, { wait: 500 }],
    } as Spec] : []),
  ],
  // C1.3 — บริษัท: รายการ · สร้างใหม่ · 360 (เทียบภาพ ledger/design-crm/04-company-360.png)
  "1.3": isCustomer ? [] : [
    {
      name: `crm-companies-list-${userKey}`,
      path: `${CRM_BASE}/companies`,
      note: "รายการบริษัท: ค้นหา/ตัวกรอง/นำเข้า/ส่งออก/+เพิ่มบริษัท · ตาราง (1440) หรือการ์ด (390)",
      expect: ["[data-testid=companies-page]", "[data-testid=companies-filter-form]", "[data-testid=companies-count]"],
      steps: [{ waitFor: "[data-testid=companies-page]", timeoutMs: 20_000 }, { wait: 500 }],
    },
    {
      name: `crm-companies-new-${userKey}`,
      path: `${CRM_BASE}/companies/new`,
      note: "ฟอร์มสร้างบริษัท (ตรวจค่าแบบ inline)",
      expect: ["form"],
      steps: [{ waitFor: "form", timeoutMs: 20_000 }, { wait: 500 }],
    },
    ...(C13_COMPANY ? [{
      name: `crm-company-360-${userKey}`,
      path: `${CRM_BASE}/companies/${C13_COMPANY}`,
      note: "Company 360: หัว + KPI 5 + แท็บ + ผู้ติดต่อ + แถบขวา — เทียบภาพ 04",
      expect: ["[data-testid=company-360]", "[data-testid=company-360-header]", "[data-testid=company-360-kpis]", "[data-testid=company-360-tabs]"],
      steps: [{ waitFor: "[data-testid=company-360]", timeoutMs: 20_000 }, { wait: 800 }],
    } as Spec] : []),
  ],
  // C0.1 — พิสูจน์ว่าฮาร์เนสถ่ายภาพใช้ได้จริงวันนี้ ด้วย "หน้า CRM v1 สามหน้าเท่าที่มี"
  //   (src/app/app/sys/[id]/crm/{contacts,deals,activities}/page.tsx → ส่วนเนื้อใน src/lib/modules/crm/ui.tsx)
  //   🔴 v1 ยังไม่มี data-testid สักตัว ⇒ selector ที่นี่ต้องเป็นของจริงตาม DOM (ชื่อ input / ลิงก์แท็บ / h1-h2)
  //   หน้าเหล่านี้ไม่มีด่านสิทธิ์รายบทบาท (แค่ requireTenant + AppSystem type=CRM) ⇒ ทั้ง 4 บทบาทต้องได้ HTTP 200
  "0.1": isCustomer ? [] : [
    {
      name: `crm-v1-contacts-${userKey}`,
      path: `${CRM_BASE}/contacts`,
      note: "CRM v1 หน้าผู้ติดต่อ: หัวข้อ + แท็บ 4 + รายการผู้ติดต่อ (DataList) + ฟอร์มเพิ่มผู้ติดต่อ (ชื่อ/เบอร์/ที่มา) — ฐานเทียบก่อนรื้อเป็น v2 ใน C1.4",
      expect: ["h1", ...V1_TABS, "form input[name='name']", "form input[name='phone']", "form input[name='source']"],
      steps: [{ waitFor: "form input[name='name']", timeoutMs: 20_000 }, { wait: 500 }],
    },
    {
      name: `crm-v1-deals-${userKey}`,
      path: `${CRM_BASE}/deals`,
      note: "CRM v1 หน้าดีล: ยอดคาดการณ์ถ่วงน้ำหนัก + กระดานไปป์ไลน์ (เลื่อนแนวนอนได้) + ฟอร์มสร้างดีล (ผู้ติดต่อ/ชื่อ/มูลค่า) — ฐานเทียบก่อนรื้อเป็น v2 ใน C1.5",
      expect: ["h1", ...V1_TABS, "form select[name='contactId']", "form input[name='title']", "form input[name='value']"],
      steps: [{ waitFor: "form select[name='contactId']", timeoutMs: 20_000 }, { wait: 500 }],
    },
    {
      name: `crm-v1-activities-${userKey}`,
      path: `${CRM_BASE}/activities`,
      note: "CRM v1 หน้างานติดตาม: หัวข้อ 'งานติดตามค้างอยู่ (n)' + รายการงานค้าง (หรือกล่องว่างเมื่อไม่มี) — ฐานเทียบก่อนรื้อเป็น v2 ใน C1.6",
      expect: ["h1", "h2", ...V1_TABS],
      steps: [{ waitFor: "h2", timeoutMs: 20_000 }, { wait: 500 }],
    },
  ],
};

async function restoreSeed(): Promise<void> {
  const P = prisma as Any;
  // C0.1: สเปคของใบนี้อ่านอย่างเดียว ⇒ ไม่มีอะไรต้องคืน · โครงนี้มีไว้ให้ใบถัดไปเติม (ห้ามลบ ห้ามข้าม finally)
  if (TMP.activityIds.length) await P.crmActivity?.deleteMany?.({ where: { id: { in: TMP.activityIds } } }).catch(() => null);
  if (TMP.dealIds.length) await P.crmDeal?.deleteMany?.({ where: { id: { in: TMP.dealIds } } }).catch(() => null);
  if (TMP.contactIds.length) await P.crmContact?.deleteMany?.({ where: { id: { in: TMP.contactIds } } }).catch(() => null);
  if (TMP.companyIds.length) await P.crmCompany?.deleteMany?.({ where: { id: { in: TMP.companyIds } } }).catch(() => null);
  // CRM C2.2/C2.3 ▸ คืนสภาพของที่บล็อก "เตรียมของ" สร้าง — ลบจากใบนอกเข้าใน: event → audit → ผู้ลงทะเบียน → ขั้น → ลำดับ → กฎ
  //   🔴 ลบแถวตรง ๆ (ไม่เรียก stop/archive ของบริการ) เพราะทางนั้นเขียน event + audit เพิ่มอีกชุดระหว่างกำลังเก็บกวาด
  //   🔴 outbox จับด้วย idempotencyKey ที่มี id ของผู้ลงทะเบียนอยู่ (`<type>#<enrollmentId>#<n>`) ⇒ ครอบทั้ง enrolled/finished
  {
    const { sequenceIds: sq, enrollmentIds: en, ruleIds: ru } = TMP;
    if (en.length) await P.outboxEvent.deleteMany({ where: { tenantId: E.tenantId, OR: en.map((id) => ({ idempotencyKey: { contains: id } })) } });
    const targets = [
      ...sq.map((id) => ({ targetType: "CrmSequence", targetId: id })),
      ...en.map((id) => ({ targetType: "CrmSequenceEnrollment", targetId: id })),
      ...ru.map((id) => ({ targetType: "CrmAssignmentRule", targetId: id })),
    ];
    if (targets.length) await P.auditLog.deleteMany({ where: { tenantId: E.tenantId, OR: targets } });
    if (sq.length) {
      await P.crmSequenceEnrollment.deleteMany({ where: { sequenceId: { in: sq } } });
      await P.crmSequenceStep.deleteMany({ where: { sequenceId: { in: sq } } });
      await P.crmSequence.deleteMany({ where: { id: { in: sq } } });
    }
    if (ru.length) await P.crmAssignmentRule.deleteMany({ where: { id: { in: ru } } });
  }
  // CRM C2.5 ▸ คืนสภาพของที่บล็อก "เตรียมของ" ของอีเมลสร้าง — จากใบนอกเข้าใน:
  //   event (key มี emailId) → audit → กิจกรรมที่ชี้จดหมาย → CrmEmailEvent → แถวจดหมาย → ไฟล์แนบ → แม่แบบ → ทับค่าต่อผู้ใช้
  //   🔴 ลบแถวตรง ๆ (ไม่เรียกบริการ) เพราะทางนั้นเขียน event/audit เพิ่มอีกชุดระหว่างกำลังเก็บกวาด
  {
    const { emailIds: em, emailTemplateIds: tp, emailUserSettingIds: us, emailFileIds: fi } = TMP;
    if (em.length) {
      await P.outboxEvent.deleteMany({ where: { tenantId: E.tenantId, OR: em.map((id) => ({ idempotencyKey: { contains: id } })) } });
      await P.auditLog.deleteMany({ where: { tenantId: E.tenantId, OR: em.map((id) => ({ targetType: "CrmEmailMessage", targetId: id })) } });
      await P.crmActivity.deleteMany({ where: { tenantId: E.tenantId, sourceRef: { in: em } } });
      await P.crmEmailEvent.deleteMany({ where: { emailId: { in: em } } });
      await P.crmEmailMessage.deleteMany({ where: { id: { in: em } } });
    }
    if (fi.length) await P.fileAsset.deleteMany({ where: { id: { in: fi } } });
    if (tp.length) {
      await P.auditLog.deleteMany({ where: { tenantId: E.tenantId, OR: tp.map((id) => ({ targetType: "CrmEmailTemplate", targetId: id })) } });
      await P.crmEmailTemplate.deleteMany({ where: { id: { in: tp } } });
    }
    if (us.length) {
      await P.auditLog.deleteMany({ where: { tenantId: E.tenantId, OR: us.map((id) => ({ targetType: "CrmEmailUserSetting", targetId: id })) } });
      await P.crmEmailUserSetting.deleteMany({ where: { id: { in: us } } });
    }
  }
  // CRM C2.4 ▸ คืนสภาพ: event/ประวัติของผู้ติดต่อชั่วคราว → นัด → แม่ของนัด → สาขาที่ใบนี้สร้างเอง → Party
  //   (สาขาที่มีอยู่ก่อนไม่ถูกแตะ — เก็บ id เฉพาะที่สร้างใหม่)
  {
    const { bookingIds: bk, clinicIds: cl, schoolIds: sc, unitIds: un, partyIds: pt, contactIds: ct24 } = TMP;
    if (ct24.length) {
      await P.auditLog.deleteMany({ where: { tenantId: E.tenantId, targetType: "CrmContact", targetId: { in: ct24 } } }).catch(() => null);
      await P.outboxEvent.deleteMany({ where: { tenantId: E.tenantId, OR: ct24.map((id: string) => ({ idempotencyKey: { contains: id } })) } }).catch(() => null);
    }
    if (bk.length) {
      await P.appointment?.deleteMany?.({ where: { id: { in: bk } } }).catch(() => null);
      await P.bookingService?.deleteMany?.({ where: { id: { in: bk } } }).catch(() => null);
      await P.bookingStaff?.deleteMany?.({ where: { id: { in: bk } } }).catch(() => null);
    }
    if (cl.length) {
      await P.clinicVisit?.deleteMany?.({ where: { id: { in: cl } } }).catch(() => null);
      await P.patientRecord?.deleteMany?.({ where: { id: { in: cl } } }).catch(() => null);
    }
    if (sc.length) {
      await P.schoolEnrollment?.deleteMany?.({ where: { id: { in: sc } } }).catch(() => null);
      await P.schoolClass?.deleteMany?.({ where: { id: { in: sc } } }).catch(() => null);
      await P.schoolCourse?.deleteMany?.({ where: { id: { in: sc } } }).catch(() => null);
    }
    if (un.length) await P.businessUnit?.deleteMany?.({ where: { id: { in: un } } }).catch(() => null);
    if (pt.length) await P.party?.deleteMany?.({ where: { id: { in: pt }, tenantId: E.tenantId } }).catch(() => null);
  }
  // CRM C2.7 ▸ คืนสภาพของทางเดินเงิน — จากใบนอกเข้าใน: event/audit ของดีลและเอกสาร → บิลหน้าร้าน → เอกสารบัญชี → การผูกบัญชี↔CRM
  //   🔴 แถว `CrmDealPayment` หายไปพร้อมดีลด้านบนแล้ว (FK onDelete: Cascade) · ลบแถวตรง ๆ ไม่เรียกบริการ (ทางนั้นเขียน event เพิ่ม)
  {
    const { dealIds: dl, docIds: dc, posSaleIds: ps, accLinkIds: al } = TMP;
    if (dl.length) {
      await P.auditLog.deleteMany({ where: { tenantId: E.tenantId, targetType: "CrmDeal", targetId: { in: dl } } }).catch(() => null);
      await P.outboxEvent.deleteMany({ where: { tenantId: E.tenantId, OR: dl.map((id: string) => ({ idempotencyKey: { contains: id } })) } }).catch(() => null);
    }
    if (dc.length) {
      await P.auditLog.deleteMany({ where: { tenantId: E.tenantId, targetId: { in: dc } } }).catch(() => null);
      await P.outboxEvent.deleteMany({ where: { tenantId: E.tenantId, OR: dc.map((id: string) => ({ idempotencyKey: { contains: id } })) } }).catch(() => null);
    }
    if (ps.length) {
      await P.outboxEvent.deleteMany({ where: { tenantId: E.tenantId, OR: ps.map((id: string) => ({ idempotencyKey: { contains: id } })) } }).catch(() => null);
      await P.posPayment?.deleteMany?.({ where: { saleId: { in: ps } } }).catch(() => null);
      await P.posSaleLine?.deleteMany?.({ where: { saleId: { in: ps } } }).catch(() => null);
      await P.posSale?.deleteMany?.({ where: { id: { in: ps } } }).catch(() => null);
    }
    if (dc.length) {
      await P.accountDocumentLine?.deleteMany?.({ where: { documentId: { in: dc } } }).catch(() => null);
      await P.accountDocument?.deleteMany?.({ where: { id: { in: dc } } }).catch(() => null);
    }
    if (al.length) await P.accountSystemLink?.deleteMany?.({ where: { id: { in: al } } }).catch(() => null);
  }
  if (BEFORE.accountDocs >= 0) {
    const docNow = await P.accountDocument.count({ where: { tenantId: E.tenantId } });
    const saleNow = await P.posSale.count({ where: { tenantId: E.tenantId } });
    const moneyNow = await P.crmDealPayment.count({ where: { tenantId: E.tenantId } });
    const ok = docNow === BEFORE.accountDocs && saleNow === BEFORE.posSales && moneyNow === BEFORE.moneyRows;
    console.log(`  ${ok ? "🔢" : "❌"} คืนสภาพ: เอกสารบัญชี ${BEFORE.accountDocs} → ${docNow} · บิลหน้าร้าน ${BEFORE.posSales} → ${saleNow} · แถวเงินของดีล ${BEFORE.moneyRows} → ${moneyNow}${ok ? " (เท่าเดิม)" : " — ไม่เท่าเดิม!"}`);
  }
  if (BEFORE.sequences >= 0) {
    const seqNow = await P.crmSequence.count({ where: { tenantId: E.tenantId, systemId: SYS } });
    const ruleNow = await P.crmAssignmentRule.count({ where: { tenantId: E.tenantId, systemId: SYS } });
    const ok = seqNow === BEFORE.sequences && ruleNow === BEFORE.rules;
    console.log(`  ${ok ? "🔢" : "❌"} คืนสภาพ: ลำดับ ${BEFORE.sequences} → ${seqNow} · กฎมอบหมาย ${BEFORE.rules} → ${ruleNow}${ok ? " (เท่าเดิม)" : " — ไม่เท่าเดิม!"}`);
  }
  // CRM C2.6 ▸ คืนสภาพของที่บล็อก "เตรียมของ" ของการติดตามเว็บสร้าง — จากใบนอกเข้าใน:
  //   เหตุการณ์การเข้าชม → การเข้าชม → กิจกรรม WEB + outbox (key มี contactId) → คลิก + ลิงก์ → คำตอบ + ฟอร์ม → audit ของรอบนี้
  //   → ค่าตั้ง `settings.crm.tracking` (เขียนคืนทุกไบต์ · เดิมไม่มีคีย์ = ถอดคีย์ออก)
  //   🔴 ลบแถวตรง ๆ (ไม่เรียก deleteLink/saveWebSettings ของบริการ) เพราะทางนั้นเขียน audit เพิ่มอีกชุดระหว่างกำลังเก็บกวาด
  {
    const { trackedLinkIds: lk, webVisitorIds: vi, webContactIds: wc, formIds: fm } = TMP;
    if (vi.length) {
      const ss = (await P.crmWebSession.findMany({ where: { tenantId: E.tenantId, visitorId: { in: vi } }, select: { id: true } }).catch(() => [])) as Any[];
      if (ss.length) await P.crmWebEvent.deleteMany({ where: { sessionId: { in: ss.map((x: Any) => x.id as string) } } }).catch(() => null);
      await P.crmWebSession.deleteMany({ where: { tenantId: E.tenantId, visitorId: { in: vi } } }).catch(() => null);
    }
    if (wc.length) {
      await P.crmActivity.deleteMany({ where: { tenantId: E.tenantId, systemId: SYS, type: "WEB", contactId: { in: wc } } }).catch(() => null);
      await P.outboxEvent.deleteMany({ where: { tenantId: E.tenantId, type: "crm.web.identified", OR: wc.map((id: string) => ({ idempotencyKey: { contains: id } })) } }).catch(() => null);
    }
    if (lk.length) {
      await P.crmTrackedClick.deleteMany({ where: { linkId: { in: lk } } }).catch(() => null);
      await P.crmTrackedLink.deleteMany({ where: { id: { in: lk } } }).catch(() => null);
    }
    if (fm.length) {
      await P.formSubmission.deleteMany({ where: { formId: { in: fm } } }).catch(() => null);
      await P.formDef.deleteMany({ where: { id: { in: fm }, tenantId: E.tenantId } }).catch(() => null);
    }
    if (lk.length || fm.length || C26_TRACKING_BEFORE !== undefined) {
      await P.auditLog.deleteMany({ where: { tenantId: E.tenantId, action: { startsWith: "crm.tracking." }, createdAt: { gte: C26_START } } }).catch(() => null);
    }
    if (C26_TRACKING_BEFORE !== undefined) {
      if (C26_TRACKING_BEFORE === null) {
        await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = "settings" #- '{crm,tracking}' WHERE "id" = $1`, SYS).catch(() => null);
      } else {
        await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set("settings", '{crm,tracking}', $1::jsonb, true) WHERE "id" = $2`, JSON.stringify(C26_TRACKING_BEFORE), SYS).catch(() => null);
      }
    }
  }
  if (BEFORE.links >= 0) {
    const linkNow = await P.crmTrackedLink.count({ where: { tenantId: E.tenantId, systemId: SYS } });
    const sessNow = await P.crmWebSession.count({ where: { tenantId: E.tenantId, systemId: SYS } });
    const formNow = await P.formDef.count({ where: { tenantId: E.tenantId } });
    const trackNow = ((await P.appSystem.findFirst({ where: { id: SYS }, select: { settings: true } }))?.settings as Any)?.crm?.tracking ?? null;
    const sameSettings = JSON.stringify(trackNow ?? null) === JSON.stringify(C26_TRACKING_BEFORE ?? null);
    const ok = linkNow === BEFORE.links && sessNow === BEFORE.webSessions && formNow === BEFORE.forms && sameSettings;
    console.log(`  ${ok ? "🔢" : "❌"} คืนสภาพ: ลิงก์ ${BEFORE.links} → ${linkNow} · การเข้าชม ${BEFORE.webSessions} → ${sessNow} · ฟอร์ม ${BEFORE.forms} → ${formNow} · ค่าตั้ง tracking ${sameSettings ? "เท่าเดิม" : "ไม่เท่าเดิม!"}`);
  }
  // CRM C2.5 ▸ พิสูจน์ว่าจำนวนจดหมาย/แม่แบบกลับมาเท่าเดิม (แบบเดียวกับ C2.2/C2.3) ◂
  if (BEFORE.emails >= 0) {
    const emailNow = await P.crmEmailMessage.count({ where: { tenantId: E.tenantId, systemId: SYS } });
    const tplNow = await P.crmEmailTemplate.count({ where: { tenantId: E.tenantId, systemId: SYS } });
    const ok = emailNow === BEFORE.emails && tplNow === BEFORE.emailTemplates;
    console.log(`  ${ok ? "🔢" : "❌"} คืนสภาพ: จดหมาย ${BEFORE.emails} → ${emailNow} · แม่แบบ ${BEFORE.emailTemplates} → ${tplNow}${ok ? " (เท่าเดิม)" : " — ไม่เท่าเดิม!"}`);
  }
}

const specs: Spec[] = WO === "path" ? [{ name: "custom", path: argv[1]! }] : (SPECS[WO] ?? []);
if (specs.length === 0) {
  console.error(`❌ ไม่มี spec ของ WO ${WO}${isCustomer ? ` สำหรับสายตาลูกค้า (${userKey}) — หน้า portal เริ่มมีในใบ C3.5` : ""}`);
  process.exit(2);
}

// ── ด่านแรก: QC server ต้องรับสายจริง (ไม่งั้นทุกภาพจะรอจน timeout ทีละ 60 วิ) ──
{
  const ping = await fetch(BASE, { redirect: "manual", signal: AbortSignal.timeout(8_000) }).catch((e: unknown) => e as Error);
  if (ping instanceof Error) {
    console.error(`❌ ต่อ QC server ${BASE} ไม่ได้ (${ping.message}) — สั่ง \`bash scripts/acc-v2-serve.sh\` (ผ่าน iso) ให้ขึ้นก่อน แล้วรันซ้ำ`);
    process.exit(2);
  }
  console.log(`🌐 QC server ${BASE} ตอบ HTTP ${ping.status}`);
}

// ── เตรียมของจริงของ C2.2 / C2.3 (ภาพ 07) ──────────────────────────────────────────────────────
// 🔴 ทำไมต้องมีบล็อกนี้: seed QC ไม่มีลำดับการติดตามและไม่มีกฎมอบหมายเลย ⇒ สองใบนี้ถ่ายได้แต่ "กล่องว่าง"
//    ซึ่งเทียบ parity กับภาพ 07 (5 การ์ดขั้น + ผู้ลงทะเบียน 4 คน · ตารางกฎ + คิวถัดไป) ไม่ได้
// 🔴 สร้างผ่าน facade จริง (`@/lib/modules/crm`) เท่านั้น — ยัดแถวดิบจะได้ภาพของข้อมูลที่บริการไม่มีวันสร้าง
// 🔴 ตำแหน่ง: **หลัง** ด่าน QC server (ไม่งั้นเซิร์ฟเวอร์ล่ม = ของค้างในฐาน) และก่อน try/finally ที่ไม่มี
//    ทางออกอื่นคั่นกลาง ⇒ ของทุกชิ้นถูกคืนใน restoreSeed() เสมอ (ดูหมายเหตุหัวไฟล์)
if (WO === "2.2" || WO === "2.3") {
  const P = prisma as Any;
  const crm = await import("@/lib/modules/crm");
  const mem = await P.membership.findFirst({ where: { tenantId: E.tenantId, userId: E.users.owner.userId }, select: { role: true, unitAccess: true, permissions: true } });
  const ownerActor = {
    userId: E.users.owner.userId as string,
    role: (mem?.role ?? "OWNER") as Any,
    unitAccess: (Array.isArray(mem?.unitAccess) ? mem.unitAccess : []) as string[],
    permissions: (mem?.permissions ?? {}) as Record<string, unknown>,
  };
  const ctx = { tenantId: E.tenantId as string, systemId: SYS, actorUserId: ownerActor.userId };
  BEFORE.sequences = await P.crmSequence.count({ where: { tenantId: E.tenantId, systemId: SYS } });
  BEFORE.rules = await P.crmAssignmentRule.count({ where: { tenantId: E.tenantId, systemId: SYS } });
  if (WO === "2.2") {
    // ภาพ 07 ล่าง: "ติดตามใบเสนอราคา" — อีเมลวันที่ 0 → รอ 3 วันทำการ → LINE → รอ 4 → งานโทร
    const seq = await crm.sequences.createSequence(ctx, ownerActor, {
      name: "ติดตามใบเสนอราคา",
      description: "ติดตามลูกค้าที่ได้รับใบเสนอราคาแล้ว — หยุดเมื่อ ตอบกลับ · ดีลชนะ · ดีลแพ้ · ขอไม่รับข่าวสาร",
      stopOnReply: true,
      stopOnWon: true,
      stopOnLost: true,
      businessDaysOnly: true,
      sendWindow: { from: "09:00", to: "18:00" },
      steps: [
        { kind: "EMAIL", subject: "ใบเสนอราคาจากสยามไดฟ์เซ็นเตอร์", body: "เรียนคุณ {{contact.firstName}} แนบใบเสนอราคามาให้แล้วนะคะ หากมีข้อสงสัยตอบกลับอีเมลนี้ได้เลยค่ะ" },
        { kind: "WAIT", waitDays: 3 },
        { kind: "LINE", body: "รบกวนสอบถามความคืบหน้าใบเสนอราคาที่ส่งไปนะคะ ต้องการให้ปรับอะไรเพิ่มแจ้งได้เลยค่ะ" },
        { kind: "WAIT", waitDays: 4 },
        { kind: "TASK", taskTitle: "โทรติดตามใบเสนอราคา", taskType: "CALL" },
      ],
    });
    TMP.sequenceIds.push(seq.id);
    // ผู้ลงทะเบียน 4 คน (ภาพ 07: "ลงทะเบียนอยู่ 4 คน") — ผู้ติดต่อเก่าสุดที่ยังไม่ขอหยุดรับข่าวสาร
    const targets = (await P.crmContact.findMany({
      where: { tenantId: E.tenantId, systemId: SYS, archivedAt: null, mergedIntoId: null, marketingOptOut: false },
      orderBy: { createdAt: "asc" }, take: 4, select: { id: true },
    })) as { id: string }[];
    for (const c of targets) {
      const r = (await crm.sequences.enroll(ctx, ownerActor, { sequenceId: seq.id, contactId: c.id })) as Any;
      const eid = r?.enrollmentId ?? r?.id;
      if (typeof eid === "string" && eid) TMP.enrollmentIds.push(eid);
    }
    console.log(`🧪 เตรียมของ C2.2: ลำดับ "${seq.name}" (${seq.steps.length} ขั้น) + ผู้ลงทะเบียน ${TMP.enrollmentIds.length} คน`);
    specs.splice(1, 0, {
      name: `crm-sequence-editor-${userKey}`,
      path: `${CRM_BASE}/settings/sequences/${seq.id}`,
      note: "ตัวแก้ไขลำดับ \"ติดตามใบเสนอราคา\": การ์ดขั้น 5 ใบ (อีเมล → รอ 3 วัน → LINE → รอ 4 วัน → งานโทร) + สถิติต่อขั้น + ผู้ลงทะเบียน 4 คน — เทียบภาพ 07 ล่าง",
      expect: ["[data-testid=crm-sequence-editor-page]", "[data-testid=crm-seq-editor]", "[data-testid=crm-seq-stats]", "[data-testid=crm-seq-enrollments]"],
      steps: [{ waitFor: "[data-testid=crm-seq-editor]", timeoutMs: 20_000 }, { wait: 600 }],
    });
  } else {
    // ภาพ 07 ขวา: "มอบหมายอัตโนมัติ — Round-robin" (ทีมขายองค์กร B2B · ชิปพนักงาน + ป้ายคิวถัดไป)
    // 🔴 ผู้รับต้อง "มองเห็นผู้ติดต่อได้" (คีย์ crm.contact.read) ไม่งั้นตารางกฎขึ้นว่า "พนักงานที่ถูกเอาออก" — หน้าปั้นชื่อจากรายชื่อพนักงานที่เข้า CRM ได้เท่านั้น
    const wanted = (["thana", "nok", "kata", "manager", "pook"] as const).map((k) => E.users?.[k]?.userId as string | undefined).filter((u): u is string => typeof u === "string" && !!u);
    const rows = (await P.membership.findMany({ where: { tenantId: E.tenantId, userId: { in: wanted }, acceptedAt: { not: null } }, select: { userId: true, role: true, permissions: true } })) as Any[];
    const okIds = new Set(rows.filter((m) => crm.crmCan({ role: m.role, permissions: (m.permissions ?? {}) as Record<string, unknown> }, "crm.contact.read")).map((m) => m.userId as string));
    const staff = wanted.filter((u) => okIds.has(u)).slice(0, 4);
    if (staff.length < 3) {
      console.log(`⚠️ เตรียมของ C2.3 ข้าม — หาพนักงานในเฉลยได้ ${staff.length} คน (ต้อง ≥ 3) ⇒ ตารางกฎยังเป็นกล่องว่าง`);
    } else {
      const rule = await crm.assignment.createRule(ctx, ownerActor, {
        name: "lead ใหม่ — ทีมขายองค์กร (round-robin)",
        mode: "ROUND_ROBIN",
        userIds: staff,
        maxOpenPerUser: null, // เว้นว่าง = ไม่จำกัด (ตามแบบ)
        conditions: { mode: "AND", items: [{ field: "sourceKind", op: "eq", value: "WEB_FORM" }] },
        active: true,
      });
      TMP.ruleIds.push(rule.id);
      console.log(`🧪 เตรียมของ C2.3: กฎ "${rule.name}" (${rule.mode} · ผู้รับ ${rule.userIds.length} คน)`);
      specs.push({
        name: `crm-assignment-rule-editor-${userKey}`,
        path: `${CRM_BASE}/settings/assignment`,
        note: "ตัวแก้กฎที่เปิดจากกฎจริง \"lead ใหม่ — ทีมขายองค์กร (round-robin)\" (ปุ่ม \"แก้\" ในแถว) — ชื่อ/วิธีแจก/ผู้รับ/เงื่อนไข ช่องทางที่มา = ฟอร์มบนเว็บ",
        expect: ["[data-testid=crm-assign-editor]", "[data-testid=crm-assign-rule-mode]"],
        steps: [{ waitFor: `[data-testid=crm-assign-rule-edit-${rule.id}]`, timeoutMs: 20_000 }, { click: `[data-testid=crm-assign-rule-edit-${rule.id}]` }, { wait: 400 }],
      });
    }
  }
}
// ◂ เตรียมของจริงของ C2.2 / C2.3

// ── เตรียมของจริงของ C2.5 (ภาพ 08 กลาง + ภาพ 15) ────────────────────────────────────────────────
// 🔴 ทำไมต้องมีบล็อกนี้: seed QC ไม่มีจดหมายสักฉบับ ⇒ กล่องจดหมาย/เธรดถ่ายได้แต่ "กล่องว่าง" ซึ่งเทียบ parity
//    กับภาพ 08 กลาง (บับเบิลเข้า/ออก + ชิป "เปิด n ครั้ง" + ช่องเขียนจดหมาย) ไม่ได้เลย
// 🔴 สร้างผ่าน facade จริง (`emails.ingestInbound` / `emails.sendEmail` / `saveTemplate` / `setUserSetting`) เท่านั้น —
//    ยัดแถวดิบจะได้ภาพของข้อมูลที่บริการไม่มีวันสร้าง (เช่นเธรดที่ไม่มี token/กิจกรรม)
// 🔴 **ไม่มีทางที่จะยิงถึง Resend/Bunny จริง**: ฉีด `transport`/`put` ปลอมเข้าไปทุกครั้ง (ของจริงอ่าน env ไม่เจอก็จริง
//    แต่พึ่ง "ไม่มี key" เป็นเกราะไม่ได้ — วันหนึ่งเครื่อง QC จะมี key)
// 🔴 ตำแหน่ง: หลังด่าน QC server และก่อน try/finally ⇒ ทุกชิ้นถูกคืนใน restoreSeed()
if (WO === "2.5") {
  const P = prisma as Any;
  const crm = await import("@/lib/modules/crm");
  const mem = await P.membership.findFirst({ where: { tenantId: E.tenantId, userId: E.users.owner.userId }, select: { role: true, unitAccess: true, permissions: true } });
  const ownerActor = {
    userId: E.users.owner.userId as string,
    role: (mem?.role ?? "OWNER") as Any,
    unitAccess: (Array.isArray(mem?.unitAccess) ? mem.unitAccess : []) as string[],
    permissions: (mem?.permissions ?? {}) as Record<string, unknown>,
  };
  const ctx = { tenantId: E.tenantId as string, systemId: SYS, actorUserId: ownerActor.userId };
  BEFORE.emails = await P.crmEmailMessage.count({ where: { tenantId: E.tenantId, systemId: SYS } });
  BEFORE.emailTemplates = await P.crmEmailTemplate.count({ where: { tenantId: E.tenantId, systemId: SYS } });

  // ตัวส่ง/ที่เก็บปลอม — ภาพต้องมี "จดหมายที่ส่งแล้ว" โดยไม่มีอะไรออกเน็ตเลย
  const deps = { transport: async () => ({ ok: true, providerId: `visual-${Date.now().toString(36)}` }), put: async () => {}, del: async () => 200 };
  const settings = await crm.emails.getEmailSettings(ctx, ownerActor);
  const target = (await P.crmContact.findFirst({
    where: { tenantId: E.tenantId, systemId: SYS, archivedAt: null, mergedIntoId: null, marketingOptOut: false, emailOptOut: false, emailBouncedAt: null, email: { not: null }, ...(userKey === "thana" ? { ownerUserId: E.users.thana?.userId ?? "-" } : {}) },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true },
  })) as Any;

  if (!target?.email) {
    console.log("⚠️ เตรียมของ C2.5 ข้าม — ไม่พบผู้ติดต่อที่มีอีเมลและยินยอมรับข่าวสารในเฉลย ⇒ กล่องจดหมายยังเป็นกล่องว่าง");
  } else {
    // 1) จดหมายขาเข้า 1 ฉบับ (HTML + รูปจากภายนอก + ไฟล์แนบ) — เปิดเธรด
    const rfc = `<visual-${Date.now().toString(36)}@mail.example>`;
    const inbound = await crm.emails.ingestInbound(
      {
        messageId: rfc,
        from: `"${target.name}" <${target.email}>`,
        to: [settings.inboundAddress],
        subject: "ขอใบเสนอราคาแพ็กเกจดำน้ำกลุ่ม 25 คน",
        text: "สวัสดีค่ะ สนใจแพ็กเกจดำน้ำสำหรับพนักงานโรงแรม 25 ท่าน ช่วงต้นเดือน พ.ย. รบกวนส่งใบเสนอราคาให้ด้วยนะคะ",
        html: '<p>สวัสดีค่ะ สนใจแพ็กเกจดำน้ำสำหรับพนักงานโรงแรม <b>25 ท่าน</b> ช่วงต้นเดือน พ.ย. รบกวนส่งใบเสนอราคาให้ด้วยนะคะ</p><p><img src="https://example.invalid/logo.png" alt="โลโก้บริษัท" width="120"></p>',
        headers: {},
        attachments: [{ filename: "รายชื่อผู้ร่วมทริป.pdf", content_type: "application/pdf", contentType: "application/pdf", content: Buffer.from(new Uint8Array(2048).fill(37)).toString("base64") }],
      } as Any,
      deps as Any,
    );
    if (inbound?.emailId) TMP.emailIds.push(inbound.emailId);
    const inRow = inbound?.emailId ? await P.crmEmailMessage.findFirst({ where: { id: inbound.emailId }, select: { threadKey: true, attachments: true } }) : null;
    for (const a of (inRow?.attachments ?? []) as Any[]) if (typeof a?.fileId === "string") TMP.emailFileIds.push(a.fileId);

    // 2) คำตอบของร้าน 1 ฉบับในเธรดเดียวกัน (ให้ภาพมีบับเบิลทั้งเข้าและออกเหมือนภาพ 08)
    if (inbound?.emailId) {
      const out = await crm.emails.sendEmail(
        ctx,
        ownerActor,
        {
          contactId: target.id,
          subject: "ตอบ: ขอใบเสนอราคาแพ็กเกจดำน้ำกลุ่ม 25 คน",
          bodyHtml: "<p>สวัสดีค่ะ ขอบคุณที่สนใจค่ะ แนบใบเสนอราคาเบื้องต้นมาให้ก่อนนะคะ หากต้องการปรับจำนวนวันหรือรอบเรือ แจ้งได้เลยค่ะ</p>",
          replyToEmailId: inbound.emailId,
        },
        deps as Any,
      );
      TMP.emailIds.push(out.emailId);
      C25_THREAD = inRow?.threadKey ?? out.threadKey;
    }

    // 3) แม่แบบจดหมาย 1 ใบ (ให้ช่อง "แม่แบบ" ในหน้าเขียนจดหมายมีของให้เลือก + ตารางแม่แบบในหน้าตั้งค่ามีแถว)
    const tpl = await crm.emails
      .saveTemplate(ctx, ownerActor, {
        name: "ส่งใบเสนอราคา (ภาพตัวอย่าง)",
        subject: "ใบเสนอราคาจากสยามไดฟ์เซ็นเตอร์",
        bodyHtml: "<p>เรียนคุณ {{contact.firstName}} แนบใบเสนอราคามาให้แล้วนะคะ หากมีข้อสงสัยตอบกลับอีเมลนี้ได้เลยค่ะ</p>",
        category: "QUOTE",
      })
      .catch(() => null);
    if (tpl?.id) TMP.emailTemplateIds.push(tpl.id);

    // 4) ทับค่าต่อผู้ใช้ 1 แถว (ตาราง "ทับค่าต่อผู้ใช้" ของภาพ 15 ต้องมีอย่างน้อยหนึ่งแถวที่ตั้งค่าจริง)
    const other = (E.users?.thana?.userId ?? E.users?.manager?.userId) as string | undefined;
    if (other) {
      await crm.emails.setUserSetting(ctx, ownerActor, { userId: other, fromName: "ฝ่ายขาย (ภาพตัวอย่าง)", replyToMode: "SELF" }).catch(() => null);
      const row = await P.crmEmailUserSetting.findFirst({ where: { systemId: SYS, userId: other }, select: { id: true } });
      if (row?.id) TMP.emailUserSettingIds.push(row.id);
    }

    console.log(`🧪 เตรียมของ C2.5: เธรด ${C25_THREAD ?? "-"} (ขาเข้า+ขาออก ${TMP.emailIds.length} ฉบับ) · แม่แบบ ${TMP.emailTemplateIds.length} ใบ · ทับค่าต่อผู้ใช้ ${TMP.emailUserSettingIds.length} แถว`);
    if (C25_THREAD) {
      specs.splice(1, 0, {
        name: `crm-email-thread-${userKey}`,
        path: `${CRM_BASE}/emails/${encodeURIComponent(C25_THREAD)}`,
        note: "เธรดจดหมาย (ภาพ 08 กลาง): บับเบิลเข้า/ออก · เนื้อจดหมายขาเข้าในกล่องทึบ (รูปจากภายนอกปิดไว้ก่อน + ปุ่มแสดงรูป) · ไฟล์แนบเป็นลิงก์ที่ออกตอนกด · ช่องเขียนจดหมาย (แม่แบบ/แนบ/ตั้งเวลา)",
        expect: ["[data-testid=crm-email-thread-page]", "[data-testid=crm-email-composer]", "[data-testid=crm-email-send]"],
        steps: [{ waitFor: "[data-testid=crm-email-thread-page]", timeoutMs: 20_000 }, { wait: 600 }],
      });
      specs.push({
        name: `crm-email-composer-${userKey}`,
        path: `${CRM_BASE}/emails/${encodeURIComponent(C25_THREAD)}`,
        note: "ช่องเขียนจดหมายหลังเลือกแม่แบบ — หัวข้อ/เนื้อความถูกเติมจากแม่แบบ (ยังไม่กดส่ง)",
        expect: ["[data-testid=crm-email-composer]", "[data-testid=crm-email-body]"],
        steps: [
          { waitFor: "[data-testid=crm-email-template]", timeoutMs: 20_000 },
          { scrollTo: "[data-testid=crm-email-composer]" },
          { wait: 600 },
        ],
      });
    }
  }
}
// ◂ เตรียมของจริงของ C2.5

// ── เตรียมของจริงของ C2.6 (ภาพ 16 + ภาพ 11) ─────────────────────────────────────────────────────
// 🔴 ทำไมต้องมีบล็อกนี้: seed QC ไม่เคยเปิดการติดตามเว็บ · ไม่มีลิงก์ติดตาม · ไม่มีการเข้าชม · ไม่มีฟอร์มสักใบ
//    ⇒ สามหน้าของใบนี้ถ่ายได้แต่ "กล่องว่าง" ซึ่งเทียบ parity กับภาพ 16 (โดเมน/โค้ดฝัง/สถิติ) และภาพ 11
//    (ตารางลิงก์ + QR + ไทม์ไลน์เว็บบนผู้ติดต่อ 360) ไม่ได้เลย
// 🔴 สร้างผ่าน facade จริงเท่านั้น (`tracking.saveWebSettings/createLink/recordConsent/collect/identify/saveFormTarget`
//    + `forms/service.createForm`) — ยัดแถวดิบจะได้ภาพของข้อมูลที่บริการไม่มีวันสร้าง (เช่นการเข้าชมที่ไม่มีความยินยอม)
// 🔴 **ไม่มีอะไรออกเน็ต**: การติดตามเว็บไม่เรียกผู้ให้บริการภายนอกเลย (โดเมนตัวอย่างเป็น `*.example.com` ที่ไม่มีใครยิงถึง)
// 🔴 ตำแหน่ง: หลังด่าน QC server และก่อน try/finally ⇒ ทุกชิ้นถูกคืนใน restoreSeed() (รวม `settings.crm.tracking` เดิม)
if (WO === "2.6") {
  const P = prisma as Any;
  const crm = await import("@/lib/modules/crm");
  const formsSvc = (await import("@/lib/modules/forms/service")) as Any;
  const { randomUUID } = await import("node:crypto");
  const mem = await P.membership.findFirst({ where: { tenantId: E.tenantId, userId: E.users.owner.userId }, select: { role: true, unitAccess: true, permissions: true } });
  const ownerActor = {
    userId: E.users.owner.userId as string,
    role: (mem?.role ?? "OWNER") as Any,
    unitAccess: (Array.isArray(mem?.unitAccess) ? mem.unitAccess : []) as string[],
    permissions: (mem?.permissions ?? {}) as Record<string, unknown>,
  };
  const ctx = { tenantId: E.tenantId as string, systemId: SYS, actorUserId: ownerActor.userId };
  BEFORE.links = await P.crmTrackedLink.count({ where: { tenantId: E.tenantId, systemId: SYS } });
  BEFORE.webSessions = await P.crmWebSession.count({ where: { tenantId: E.tenantId, systemId: SYS } });
  BEFORE.forms = await P.formDef.count({ where: { tenantId: E.tenantId } });

  // 0) จำค่าตั้งเดิมของ `settings.crm.tracking` — restoreSeed() เขียนคืนทุกไบต์ (เดิมไม่มีคีย์ = ถอดคีย์ออก)
  const sysRow = await P.appSystem.findFirst({ where: { id: SYS }, select: { settings: true } });
  C26_TRACKING_BEFORE = (sysRow?.settings as Any)?.crm?.tracking ?? null;

  const rand = Math.random().toString(36).slice(2, 7).replace(/[^a-z0-9]/g, "q");
  const DOMAIN = "siamdive-demo.example.com";
  const ORIGIN = `https://${DOMAIN}`;
  const web = await crm.tracking.saveWebSettings(ctx, ownerActor, {
    enabled: true,
    domains: [DOMAIN],
    consentText: "เว็บไซต์นี้ใช้คุกกี้เพื่อจดจำการเข้าชมและช่วยให้เราดูแลคุณได้ดีขึ้น — เลือกได้ว่าจะให้เก็บหรือไม่",
    retentionDays: 180,
  });

  // 1) ลิงก์ติดตาม 2 ลิงก์ (หนึ่งใบรหัสตั้งเอง `b2b-…` ตามภาพ 11)
  const l1 = await crm.tracking.createLink(ctx, ownerActor, { url: `${ORIGIN}/promo/b2b`, name: "โปรโมชันลูกค้าองค์กร (ภาพตัวอย่าง)", channel: "LINE", code: `b2b-${rand}` });
  const l2 = await crm.tracking.createLink(ctx, ownerActor, { url: `${ORIGIN}/trips/similan`, name: "ทริปสิมิลัน (QR ใบปลิว)", channel: "QR" });
  for (const l of [l1, l2]) TMP.trackedLinkIds.push(l.id);
  C26_LINK_ID = l1.id;

  // 2) การเข้าชม 1 ชุด (ยอมรับคุกกี้ + 3 หน้า) แล้วผูกกับผู้ติดต่อจริงของ seed ⇒ บล็อกไทม์ไลน์บนหน้า 360 มีของ
  const visitor = randomUUID();
  const meta = { origin: ORIGIN, ip: "203.0.113.7", userAgent: "qc-visual-crm", bytes: 300 };
  TMP.webVisitorIds.push(visitor);
  await crm.tracking.recordConsent({ k: web.siteKey, v: visitor, cv: web.consentVersion, d: "accept", u: `${ORIGIN}/?utm_source=facebook&utm_medium=cpc&utm_campaign=q4` }, meta);
  for (const u of [`${ORIGIN}/trips/similan`, `${ORIGIN}/trips/similan/liveaboard`, `${ORIGIN}/contact`]) {
    await crm.tracking.collect({ k: web.siteKey, v: visitor, cv: web.consentVersion, t: "page", u, ti: "ทริปสิมิลัน 4 วัน 4 คืน" }, meta);
  }
  const target = (await P.crmContact.findFirst({
    where: { tenantId: E.tenantId, systemId: SYS, archivedAt: null, mergedIntoId: null, trackingOptOut: false, ...(userKey === "thana" ? { ownerUserId: E.users.thana?.userId ?? "-" } : {}) },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })) as Any;
  if (target?.id) {
    const bound = await crm.tracking.identify({ tenantId: E.tenantId as string, systemId: SYS }, { visitorId: visitor, contactId: target.id, by: "FORM" });
    if (bound.bound > 0) TMP.webContactIds.push(target.id);
  }

  // 3) ฟอร์มรับลูกค้า 1 ใบ + ตั้งปลายทางฝั่ง CRM ผ่าน facade ของใบนี้
  const form = await formsSvc
    .createForm({ tenantId: E.tenantId as string }, {
      name: "ติดต่อเรา (ภาพตัวอย่าง)",
      description: "ฟอร์มบนเว็บของร้าน — คำตอบเข้า CRM เป็น lead",
      crmEnabled: true,
      fields: [
        { key: "name", label: "ชื่อ-นามสกุล", type: "text", required: true },
        { key: "phone", label: "เบอร์โทร", type: "phone", required: true },
        { key: "email", label: "อีเมล", type: "email", required: false },
        { key: "company", label: "บริษัท", type: "text", required: false },
        { key: "message", label: "สิ่งที่สนใจ", type: "textarea", required: false },
      ],
    })
    .catch(() => null);
  if (form?.id) {
    TMP.formIds.push(form.id);
    await crm.tracking.saveFormTarget(ctx, ownerActor, form.id, { crmSystemId: SYS, scoreOnSubmit: 10, utmCapture: true, createCompanyFromField: "company" }).catch(() => null);
  }
  console.log(`🧪 เตรียมของ C2.6: siteKey ${web.siteKey ?? "-"} · ลิงก์ ${TMP.trackedLinkIds.length} ใบ · การเข้าชม 1 ชุด (ผูกผู้ติดต่อ ${TMP.webContactIds.length} ราย) · ฟอร์ม ${TMP.formIds.length} ใบ`);

  // ภาพเพิ่ม: กล่อง QR ของลิงก์จริง (ภาพ 11) + บล็อกไทม์ไลน์เว็บบนผู้ติดต่อ 360 ที่ถูกผูก
  if (C26_LINK_ID) {
    specs.push({
      name: `crm-link-qr-${userKey}`,
      path: `${CRM_BASE}/settings/tracking`,
      note: "กล่อง QR ของลิงก์ติดตาม (ภาพ 11) — SVG พิมพ์ได้ + ลิงก์สั้น /l/<code>",
      expect: ["[data-testid=crm-link-qr-box]"],
      steps: [{ waitFor: `[data-testid=crm-link-qr-${C26_LINK_ID}]`, timeoutMs: 20_000 }, { click: `[data-testid=crm-link-qr-${C26_LINK_ID}]` }, { wait: 500 }],
    });
  }
  if (TMP.webContactIds[0]) {
    specs.push({
      name: `crm-contact360-web-${userKey}`,
      path: `${CRM_BASE}/contacts/${TMP.webContactIds[0]}`,
      note: "ผู้ติดต่อ 360 — บล็อก \"การเข้าชมเว็บ\" (ภาพ 11): รอบการเข้าชม · จำนวนหน้า · utm · หน้าที่เปิด (ไม่มี IP/เบราว์เซอร์ใน DTO)",
      expect: ["[data-testid=crm-web-timeline]"],
      steps: [{ waitFor: "[data-testid=crm-web-timeline]", timeoutMs: 20_000 }, { scrollTo: "[data-testid=crm-web-timeline]" }, { wait: 500 }],
    });
  }
}
// ◂ เตรียมของจริงของ C2.6

// CRM C2.4 ▸ เตรียมของจริง: ผู้ติดต่อที่มีเบอร์ (ผ่าน facade) + นัดในสัปดาห์นี้ของ Party เดียวกัน 3 ระบบ (แถวตรง — ไม่มี facade ฝั่งเขียน)
//   🔴 ตำแหน่ง: หลังด่าน QC server และก่อน try/finally เดียวกับ C2.2/C2.3 ⇒ ของทุกชิ้นถูกคืนใน restoreSeed() เสมอ
if (WO === "2.4") {
  const P24 = prisma as Any;
  const crm = await import("@/lib/modules/crm");
  const mem = await P24.membership.findFirst({ where: { tenantId: E.tenantId, userId: E.users.owner.userId }, select: { role: true, unitAccess: true, permissions: true } });
  const ownerActor = {
    userId: E.users.owner.userId as string,
    role: (mem?.role ?? "OWNER") as Any,
    unitAccess: (Array.isArray(mem?.unitAccess) ? mem.unitAccess : []) as string[],
    permissions: (mem?.permissions ?? {}) as Record<string, unknown>,
  };
  const ctx = { tenantId: E.tenantId as string, systemId: SYS, actorUserId: ownerActor.userId };
  // ผู้ติดต่อชั่วคราว: ต้องมีเบอร์ (ปุ่ม "โทร" ขึ้นเฉพาะเมื่อมีเบอร์) และมี Party (ปุ่มจองคิว + การจับคู่นัดใช้ Party)
  const made = await crm.contacts.createContact(ctx, ownerActor as Any, {
    firstName: "ณิชา",
    lastName: "ทดสอบภาพ qc-visual-crm",
    phone: "0812340024",
    email: "nicha.qc-visual-crm@example.com",
    jobTitle: "ผู้จัดการจัดซื้อ",
    force: true,
  });
  TMP.contactIds.push(made.contact.id);
  const partyId = (await P24.crmContact.findFirst({ where: { id: made.contact.id }, select: { partyId: true } }))?.partyId as string | null;
  if (partyId) TMP.partyIds.push(partyId);
  // นัดในสัปดาห์นี้ (พรุ่งนี้ 10:00 / 13:00 / วันเริ่มรอบเรียน) — เวลาไทยคิดจาก epoch ตรง ๆ
  const H = 3_600_000;
  const day0 = Math.floor((Date.now() + 7 * H) / (24 * H)) * 24 * H - 7 * H;
  const at = (d: number, h: number) => new Date(day0 + d * 24 * H + h * H);
  if (!partyId) {
    console.log("⚠️ เตรียมของ C2.4 ข้าม (นัด) — ผู้ติดต่อชั่วคราวไม่ได้ partyId ⇒ ปฏิทินจะไม่มีชิปนัด");
  } else {
    const unit = async (type: string, name: string) => {
      const found = await P24.businessUnit.findFirst({ where: { tenantId: E.tenantId, type, status: "ACTIVE" }, select: { id: true } });
      if (found) return found.id as string;
      const row = await P24.businessUnit.create({ data: { tenantId: E.tenantId, type, name: `${name} qc-visual-crm`, slug: `qc-visual-crm-${type.toLowerCase()}` } });
      TMP.unitIds.push(row.id);
      return row.id as string;
    };
    const uBook = await unit("BOOKING", "จองคิว");
    const svc = await P24.bookingService.create({ data: { tenantId: E.tenantId, unitId: uBook, name: "ปรึกษาแพ็กเกจดำน้ำ qc-visual-crm", durationMin: 60 } });
    const stf = await P24.bookingStaff.create({ data: { tenantId: E.tenantId, unitId: uBook, name: "ครูฝึก qc-visual-crm" } });
    const appt = await P24.appointment.create({
      data: { tenantId: E.tenantId, unitId: uBook, serviceId: svc.id, staffId: stf.id, partyId, startAt: at(1, 10), endAt: at(1, 11), status: "CONFIRMED", customerName: "ณิชา qc-visual-crm", customerPhone: "0812340024" },
    });
    TMP.bookingIds.push(appt.id, svc.id, stf.id);
    const uClinic = await unit("CLINIC", "คลินิก");
    const pat = await P24.patientRecord.create({ data: { tenantId: E.tenantId, unitId: uClinic, name: "ณิชา qc-visual-crm", phone: "0812340024", partyId } });
    const visit = await P24.clinicVisit.create({ data: { tenantId: E.tenantId, unitId: uClinic, patientId: pat.id, visitDate: at(1, 13), symptom: "ตรวจก่อนดำน้ำ qc-visual-crm", partyId } });
    TMP.clinicIds.push(visit.id, pat.id);
    const uSchool = await unit("SCHOOL", "โรงเรียน");
    const course = await P24.schoolCourse.create({ data: { tenantId: E.tenantId, unitId: uSchool, name: "คอร์ส Open Water qc-visual-crm" } });
    const klass = await P24.schoolClass.create({ data: { tenantId: E.tenantId, unitId: uSchool, courseId: course.id, name: "รอบเช้า qc-visual-crm", startDate: at(2, 0) } });
    const enr = await P24.schoolEnrollment.create({ data: { tenantId: E.tenantId, unitId: uSchool, classId: klass.id, studentName: "ณิชา qc-visual-crm", studentPhone: "0812340024", status: "PAID", partyId } });
    TMP.schoolIds.push(enr.id, klass.id, course.id);
    console.log(`🧪 เตรียมของ C2.4: ผู้ติดต่อ 1 คน (มีเบอร์ + Party) + นัดจอง 1 · คลินิก 1 · รอบเรียน 1 ในสัปดาห์นี้`);
  }
  specs.unshift(
    {
      name: `crm-call-log-modal-${userKey}`,
      path: `${CRM_BASE}/contacts/${made.contact.id}`,
      note: "โมดัลบันทึกการโทรที่เปิดจากปุ่ม \"โทร\" บนผู้ติดต่อ 360 — ผลสาย · ระยะเวลา · ทิศทาง · โน้ต · งานถัดไป · ไฟล์เสียง (เทียบภาพ 08 ซ้าย)",
      expect: ["[data-testid=crm-call-log-modal]", "[data-testid=crm-call-outcome]", "[data-testid=crm-call-recording-input]", "[data-testid=crm-call-save]"],
      steps: [{ waitFor: "[data-testid=crm-call-tel]", timeoutMs: 20_000 }, { click: "[data-testid=crm-call-tel]" }, { waitFor: "[data-testid=crm-call-log-modal]", timeoutMs: 10_000 }, { wait: 400 }],
    },
    {
      name: `crm-contact-360-call-${userKey}`,
      path: `${CRM_BASE}/contacts/${made.contact.id}`,
      note: "ผู้ติดต่อ 360 พร้อมปุ่ม \"โทร\" (เปิดสาย + บันทึกสาย) และปุ่ม \"จองผ่านระบบจองคิว\" (R-A)",
      expect: ["[data-testid=contact-360]", "[data-testid=crm-call-tel]"],
      steps: [{ waitFor: "[data-testid=contact-360]", timeoutMs: 20_000 }, { wait: 500 }],
    },
  );
}
// ◂ เตรียมของจริงของ C2.4

// CRM C2.7 ▸ เตรียมของจริงของทางเดินเงิน (ภาพ 06): ผู้ติดต่อที่เป็น "คนเดียวกับสมาชิก" (Party เดียวกัน · จับคู่ด้วยเบอร์) +
//   ดีลที่มีรายการสินค้า 3 บรรทัด + ใบเสนอราคา (ร่าง — ไม่ออกเลขที่/ไม่ลงบัญชี) + บิลหน้าร้านที่ผูกเข้าดีลผ่าน facade
//   🔴 ทำไมต้องมี: เฉลย QC ไม่มีเอกสารบัญชีเลย (0 ใบ) ไม่มีการผูกบัญชี↔CRM และไม่มีสมาชิกคนไหนใช้ Party ร่วมกับผู้ติดต่อ CRM
//      ⇒ ถ้าไม่เตรียม ช่อง "ดีล" บนหน้าขายจะไม่โผล่เลย และหน้าเอกสารบัญชีก็ยังไม่มีเอกสารให้เปิด
//   🔴 ฝั่ง CRM สร้างผ่าน facade จริงทั้งหมด (`contacts.createContact` · `deals.createDeal/setLines/issueQuotation` ·
//      `payments.linkSaleToDeal`) · แถวบิลหน้าร้านสร้างตรง ๆ เพราะ `pos.createSale` โพสต์บัญชี/ตัดสต็อก/ระบายคิวตามหลัง
//      ซึ่งคืนสภาพแบบแถวต่อแถวไม่ได้ — สิ่งที่ภาพต้องพิสูจน์คือ "การผูกผ่าน facade" ไม่ใช่การขายซ้ำ
//   🔴 ตำแหน่ง: หลังด่าน QC server และก่อน try/finally เดียวกับใบอื่น ⇒ ของทุกชิ้นถูกคืนใน restoreSeed() เสมอ
if (WO === "2.7") {
  const P27 = prisma as Any;
  const crm = await import("@/lib/modules/crm");
  const posReg = (await import("@/lib/modules/pos/register" as string)) as Any;
  const mem = await P27.membership.findFirst({ where: { tenantId: E.tenantId, userId: E.users.owner.userId }, select: { role: true, unitAccess: true, permissions: true } });
  const ownerActor = {
    userId: E.users.owner.userId as string,
    role: (mem?.role ?? "OWNER") as Any,
    unitAccess: (Array.isArray(mem?.unitAccess) ? mem.unitAccess : []) as string[],
    permissions: (mem?.permissions ?? {}) as Record<string, unknown>,
  };
  const ctx = { tenantId: E.tenantId as string, systemId: SYS, actorUserId: ownerActor.userId };
  const accSys = (E.systems?.ACCOUNT ?? "") as string;
  const memSys = (E.systems?.MEMBER ?? "") as string;
  const posSys = (E.systems?.POS ?? "") as string;
  const unitId = (E.units?.patong ?? "") as string;
  BEFORE.accountDocs = await P27.accountDocument.count({ where: { tenantId: E.tenantId } });
  BEFORE.posSales = await P27.posSale.count({ where: { tenantId: E.tenantId } });
  BEFORE.moneyRows = await P27.crmDealPayment.count({ where: { tenantId: E.tenantId } });

  // (1) ผูกระบบบัญชี ↔ CRM (ใบเสนอราคาของดีลออกไม่ได้ถ้าไม่ผูก) — ผูกไว้แล้วก็ไม่แตะ
  if (accSys) {
    const have = await P27.accountSystemLink.findFirst({ where: { tenantId: E.tenantId, systemId: accSys, linkedKind: "CRM", linkedId: SYS }, select: { id: true } });
    if (!have) {
      const made = await P27.accountSystemLink.create({ data: { tenantId: E.tenantId, systemId: accSys, linkedKind: "CRM", linkedId: SYS } });
      TMP.accLinkIds.push(made.id);
    }
  }

  // (2) สมาชิกที่หน้าขายเลือกได้จริง (อยู่ใน dropdown 200 คนล่าสุด) + มีเบอร์ + มี Party
  const members: Any[] = memSys ? await posReg.posMembers(E.tenantId, memSys) : [];
  let picked: { id: string; name: string; phone: string; partyId: string } | null = null;
  for (const m of members) {
    const phone = String(m.phone ?? "").trim();
    if (!phone) continue;
    const row = await P27.customer.findFirst({ where: { id: m.id, tenantId: E.tenantId }, select: { partyId: true } });
    if (row?.partyId) { picked = { id: m.id as string, name: String(m.name ?? ""), phone, partyId: row.partyId as string }; break; }
  }

  // (3) ผู้ติดต่อ CRM ของคนเดียวกัน — ส่งเบอร์เดียวกันไป ⇒ `party.findOrCreate` จับคู่ Party เดิมของสมาชิก (ไม่มีการยัดแถว)
  const made = await crm.contacts.createContact(ctx, ownerActor as Any, {
    firstName: "ภัทร",
    lastName: "ทดสอบทางเดินเงิน qc-visual-crm",
    phone: picked?.phone ?? "0812340027",
    email: "pat.money.qc-visual-crm@example.com",
    jobTitle: "เจ้าของกิจการ",
    force: true,
  });
  TMP.contactIds.push(made.contact.id);
  const ctRow = await P27.crmContact.findFirst({ where: { id: made.contact.id }, select: { partyId: true } });
  const samePerson = !!picked && ctRow?.partyId === picked.partyId;
  if (!samePerson && ctRow?.partyId) TMP.partyIds.push(ctRow.partyId); // Party ที่ใบนี้สร้างเองเท่านั้นที่ลบได้

  // (4) ดีลที่มีรายการสินค้า 3 บรรทัด (ยอดจริงจากรายการ) + ใบเสนอราคาร่าง
  const deal = await crm.deals.createDeal(ctx, ownerActor as Any, {
    contactId: made.contact.id,
    pipelineId: E.pipelines.b2b.id as string,
    title: "แพ็กเกจดำน้ำองค์กร qc-visual-crm",
    valueSatang: 3_000_00,
    ownerUserId: ownerActor.userId,
  });
  TMP.dealIds.push(deal.id);
  await crm.deals.setLines(ctx, ownerActor as Any, deal.id, {
    lines: [
      { name: "ทริปดำน้ำ 3 วัน 2 คืน", qty: 2, unitPriceSatang: 1_250_00, vatRateBp: 700 },
      { name: "เช่าอุปกรณ์ครบชุด", qty: 3, unitPriceSatang: 333_33, discountBp: 500, vatRateBp: 700 },
      { name: "รถรับส่งสนามบิน", qty: 1, unitPriceSatang: 87_77 },
    ],
  });
  let docId = "";
  if (accSys) {
    const q = await crm.deals.issueQuotation(ctx, ownerActor as Any, deal.id, {}).catch((e: unknown) => {
      console.log(`⚠️ เตรียมของ C2.7: ออกใบเสนอราคาไม่ได้ — ${e instanceof Error ? e.message.slice(0, 120) : e}`);
      return null;
    });
    docId = String((q as Any)?.docId ?? "");
    if (docId) TMP.docIds.push(docId);
  }

  // (5) บิลหน้าร้านที่ "จ่ายแล้ว" + ผูกเข้าดีลผ่าน facade (ทางเดินเงินนับให้ใน tx เดียวกัน — มติผู้คุมงาน C2.7 ข้อ 2)
  let linked = false;
  if (posSys && unitId) {
    const sale = await P27.posSale.create({
      data: {
        tenantId: E.tenantId, unitId, systemId: posSys, sourceModule: "POS", idempotencyKey: `qc-visual-crm-${deal.id}`,
        status: "PAID", subtotalSatang: 1_200_00, grandTotalSatang: 1_200_00, paidAt: new Date(),
        ...(picked ? { memberId: picked.id } : {}),
        lines: { create: [{ tenantId: E.tenantId, unitId, name: "มัดจำทริปองค์กร qc-visual-crm", qty: 1, unitPriceSatang: 1_200_00, lineTotalSatang: 1_200_00 }] },
        payments: { create: [{ tenantId: E.tenantId, unitId, type: "CASH", amountSatang: 1_200_00 }] },
      },
    });
    TMP.posSaleIds.push(sale.id);
    const lr = await crm.payments.linkSaleToDeal({ tenantId: E.tenantId as string, systemId: SYS }, ownerActor as Any, { dealId: deal.id, saleId: sale.id })
      .catch((e: unknown) => { console.log(`⚠️ เตรียมของ C2.7: ผูกบิลเข้าดีลไม่ได้ — ${e instanceof Error ? e.message.slice(0, 120) : e}`); return null; });
    linked = !!lr?.counted;
  }
  console.log(`🧪 เตรียมของ C2.7: ผู้ติดต่อ+ดีล 3 บรรทัด (${deal.id}) · ใบเสนอราคา ${docId || "-"} · บิลผูกแล้ว=${linked} · สมาชิกคนเดียวกัน=${samePerson}${picked ? ` (${picked.id})` : " — ไม่มีสมาชิกที่มีเบอร์+Party ⇒ ช่องดีลจะไม่โผล่"}`);

  specs.unshift(
    ...(picked && samePerson
      ? ([{
          name: `pos-register-deal-select-${userKey}`,
          path: POS_REGISTER,
          note: "หน้าขาย: เลือกสมาชิกแล้ว ⇒ ช่อง \"ดีล\" ข้างช่องสมาชิกขึ้นพร้อมดีลที่ยังเปิดอยู่ของคนนั้น + คำอธิบายใต้ช่อง (เทียบภาพ 06)",
          expect: ["[data-testid=pos-deal-select]", "[data-testid=pos-deal-hint]"],
          steps: [
            { waitFor: "[data-testid=pos-member-select]", timeoutMs: 20_000 },
            { select: { on: "[data-testid=pos-member-select]", value: picked.id } },
            { waitFor: "[data-testid=pos-deal-select]", timeoutMs: 15_000 },
            { select: { on: "[data-testid=pos-deal-select]", value: deal.id } },
            { wait: 400 },
          ],
        }] as Spec[])
      : []),
    ...(docId && accSys
      ? ([{
          name: `acc-doc-crm-deal-${userKey}`,
          path: `/app/sys/${accSys}/account/docs/QUOTATION/${docId}`,
          note: "หน้าเอกสารบัญชี: บล็อก \"ดีล\" ที่ลิงก์กลับไปดีลของ CRM (`payments.dealForDoc` · เส้น account→crm เดิม)",
          expect: ["[data-testid=acc-doc-crm-deal]"],
          steps: [{ waitFor: "[data-testid=acc-doc-crm-deal]", timeoutMs: 20_000 }, { wait: 400 }],
        }] as Spec[])
      : []),
    {
      name: `crm-deal-money-${userKey}`,
      path: `${CRM_BASE}/deals/${deal.id}`,
      note: "ดีล 360 ของดีลที่มีรายการสินค้า 3 บรรทัด + ใบเสนอราคา + บิลหน้าร้านที่ผูกไว้ (เงินที่รับของดีลมาจากบิลใบนั้น)",
      expect: ["[data-testid=deal-360]", "[data-testid=deal-360-lines]"],
      steps: [{ waitFor: "[data-testid=deal-360-lines]", timeoutMs: 20_000 }, { wait: 400 }],
    },
  );
}
// ◂ เตรียมของจริงของ C2.7

// ── mint session (เรียกจากในกรอบ try เท่านั้น — ดูหมายเหตุหัวไฟล์) ──
const UA = "qc-visual-crm";
/** ข้อผิดพลาดที่ต้องจบโปรแกรมด้วย exit 2 — โยนแทน process.exit() เพื่อให้ finally (ลบ session) ได้ทำงาน */
class Fatal extends Error {}
/** แถว session ที่ "รอบนี้" สร้างเอง — ลบเฉพาะของตัวเอง (ลบด้วยแท็กเปล่า ๆ จะฆ่ารอบที่รันขนานกันอยู่) */
const MINE = { sessionIds: [] as string[], tokenHashes: [] as string[] };

async function mintSession(): Promise<Any[]> {
  const token = "crm" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const ttl = new Date(Date.now() + 60 * 60 * 1000);
  const https = BASE.startsWith("https:");
  const host = new URL(BASE).hostname;
  if (isCustomer) {
    // C3.5 — session ลูกค้าของ portal (มติ C15: ตาราง PortalSession · subject = CrmPortalAccess)
    //   ผู้ทำ C3.5 ต้อง export `mintPortalSession(accessCode, { userAgent })` ที่ «src/lib/modules/crm/portal-session.ts»
    //   ระหว่างนี้รองรับ session ลูกค้าของระบบสมาชิก (customer-session.ts) เป็นทางถอย เพื่อถ่ายหน้า /m/* ได้
    const code = userKey.slice("customer:".length);
    const ps = (await import("@/lib/modules/crm/portal-session" as string).catch(() => null)) as Any;
    const cs = (await import("@/lib/modules/member/customer-session" as string).catch(() => null)) as Any;
    let minted: Any = null;
    if (ps?.mintPortalSession) {
      minted = await ps.mintPortalSession(code, { userAgent: UA });
    } else if (cs?.mintCustomerSession) {
      const cust = await prisma.customer.findFirst({ where: { tenantId: E.tenantId, memberCode: code }, select: { id: true } });
      if (!cust) throw new Fatal(`ไม่พบสมาชิกรหัส ${code} ในร้าน QC`);
      minted = await cs.mintCustomerSession(cust.id, { userAgent: UA });
    } else {
      throw new Fatal("ยังไม่มีตัวออก session ลูกค้า — portal-session.ts มาในใบ C3.5");
    }
    // 🔴 หนี้ที่ **ใบ C3.5 เป็นเจ้าของ** (อย่าปล่อยผ่าน): บรรทัดนี้ "เดา" ว่า mintPortalSession เก็บ token เป็น
    //    sha256 ดิบเหมือน customer-session.ts (tokenHash = sha256(token)) การลบใน finally จึงจับแถวด้วยค่านี้
    //    ถ้า C3.5 แฮชด้วยวิธีอื่น (salt/HMAC/argon) แถว PortalSession จะ **ไม่ถูกลบ = session ลูกค้าค้างในฐาน QC**
    //    ⇒ C3.5 ต้องทำอย่างใดอย่างหนึ่ง: ใช้ sha256 ดิบ · หรือให้ mintPortalSession คืน `id`/`tokenHash` มาด้วย
    //    แล้วแก้บรรทัดนี้ให้เก็บค่าที่คืนมา (และเติมตารางใหม่ลงในตัวกวาดซากท้ายไฟล์)
    MINE.tokenHashes.push(sha256(minted.token));
    return https
      ? [{ name: minted.cookieName, value: minted.token, url: BASE, path: "/", secure: true }]
      : [{ name: minted.cookieName, value: minted.token, domain: host, path: "/" }];
  }
  // เฉลย seed มี userId ของทั้ง 4 บทบาทอยู่แล้ว · เผื่อเฉลยเก่า → ถอยไปหาด้วยอีเมลของ CQC/ระบบสมาชิก
  const FALLBACK_EMAIL: Record<string, string> = {
    owner: "mb-owner@shark.local",
    manager: "mb-manager-patong@shark.local",
    thana: "mb-thana@shark.local",
    nok: CQC.users?.nok?.email ?? "mb-nok@shark.local",
  };
  let userId: string | undefined = E.users?.[userKey]?.userId;
  if (!userId) {
    const email = FALLBACK_EMAIL[userKey]!;
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!u) throw new Fatal(`ไม่พบผู้ใช้ ${userKey} (${email}) — รัน seed-member-qc แล้ว seed-crm-qc ก่อน`);
    userId = u.id;
  }
  const row = await prisma.session.create({ data: { userId, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
  MINE.sessionIds.push(row.id);
  return https
    ? [{ name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: E.tenantId, url: BASE, path: "/", secure: true }]
    : [{ name: "shark_session", value: token, domain: host, path: "/" }, { name: "shark_tenant", value: E.tenantId, domain: host, path: "/" }];
}

let failures = 0;
let fatal = "";
const shots: string[] = [];
/** สรุปต่อภาพ (HTTP · selector ที่หาไม่เจอ · console error · คำขอ ≥400 · ล้นแนวนอน) — เขียนลง `${OUT}/summary-${userKey}.json` ให้ oracle อ่าน */
const results: { name: string; device: string; status: number; missing: string[]; errors: string[]; httpErrors: string[]; file: string; overflow: boolean; overflowEl: string | null }[] = [];
try {
  const cookies: Any[] = await mintSession();
  const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string).catch((e: unknown) => {
    // 🔴 ห้าม process.exit() ที่นี่ — จะข้าม finally แล้ว session ที่เพิ่ง mint จะค้างในฐาน QC
    throw new Fatal(`เปิด puppeteer-core ไม่ได้ (${e instanceof Error ? e.message : e}) — ต้องมี /root/dive3d/node_modules/puppeteer-core`);
  });
  const browser = await (pptr as Any).default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-crm-${process.pid}`],
  });
  try {
    for (const spec of specs) {
      if (spec.before) await spec.before();
      const viewports: readonly (readonly [string, number, number])[] = process.env.KQC_VIEWPORTS
        ? process.env.KQC_VIEWPORTS.split(",").map((v) => { const [name, wh] = v.split(":"); const [w, h] = wh!.split("x").map(Number); return [name!, w!, h!] as const; })
        : ([["desktop", 1440, 900], ["mobile", 390, 844]] as const);
      for (const [device, w, h] of viewports) {
        if (spec.onlyDevice && spec.onlyDevice !== device) continue;
        const page = await browser.newPage();
        if (process.env.KQC_UA) await page.setUserAgent(`${await browser.userAgent()} ${process.env.KQC_UA}`);
        await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: device === "mobile", hasTouch: device === "mobile" });
        await page.setCookie(...cookies);
        const errors: string[] = [];
        const httpErrors: string[] = [];
        page.on("pageerror", (e: Error) => errors.push(e.message.slice(0, 120)));
        page.on("console", (m: Any) => { if (m.type() === "error") { const u = m.location?.()?.url; errors.push(`${String(m.text()).slice(0, 120)}${u ? ` @ ${String(u).slice(0, 160)}` : ""}`); } });
        // คำขอย่อยที่ ≥400 (รูป/asset/action) — "Failed to load resource" เปล่า ๆ ไม่บอก URL ⇒ เก็บไว้ในสรุปให้ตามต้นเหตุได้
        page.on("response", (r: Any) => { try { if (r.status() >= 400) { const line = `HTTP ${r.status()} ${String(r.url()).slice(0, 200)}`; httpErrors.push(line); console.log(`   ↳ ${line}`); } } catch { /* ignore */ } });
        const resp = await page.goto(`${BASE}${spec.path}`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null);
        await new Promise((r) => setTimeout(r, 1200));
        for (const step of spec.steps ?? []) {
          try {
            if ("waitFor" in step) await page.waitForSelector(step.waitFor, { timeout: step.timeoutMs ?? 10_000 });
            else if ("click" in step) await page.click(step.click);
            else if ("select" in step) await page.select(step.select.on, step.select.value);
            else if ("fill" in step) { await page.click(step.fill, { clickCount: 3 }); await page.keyboard.type(step.value, { delay: 15 }); }
            else if ("press" in step) await page.keyboard.press(step.press as Any);
            else if ("wait" in step) await new Promise((r) => setTimeout(r, step.wait));
            else if ("drag" in step) {
              const from = await page.$(step.drag.from); const to = await page.$(step.drag.to);
              if (!from || !to) throw new Error(`ไม่พบ element สำหรับลาก ${!from ? step.drag.from : step.drag.to}`);
              const a = (await from.boundingBox())!; const b = (await to.boundingBox())!;
              const sx = a.x + a.width / 2, sy = a.y + a.height / 2, tx = b.x + b.width / 2, ty = b.y + 8;
              await page.mouse.move(sx, sy); await page.mouse.down();
              await new Promise((r) => setTimeout(r, 350));
              const n = step.drag.steps ?? 12;
              for (let i = 1; i <= n; i++) { await page.mouse.move(sx + ((tx - sx) * i) / n, sy + ((ty - sy) * i) / n); await new Promise((r) => setTimeout(r, 30)); }
              await page.mouse.up();
            } else if ("dragBy" in step) {
              const el = await page.$(step.dragBy.on);
              if (!el) throw new Error(`ไม่พบ element สำหรับลาก ${step.dragBy.on}`);
              const bb = (await el.boundingBox())!;
              const sx = bb.x + bb.width / 2, sy = bb.y + bb.height / 2;
              const dx = step.dragBy.dx, dy = step.dragBy.dy ?? 0;
              await page.mouse.move(sx, sy); await page.mouse.down();
              await new Promise((r) => setTimeout(r, 250));
              const n = step.dragBy.steps ?? 10;
              for (let i = 1; i <= n; i++) { await page.mouse.move(sx + (dx * i) / n, sy + (dy * i) / n); await new Promise((r) => setTimeout(r, 30)); }
              await page.mouse.up();
            } else if ("upload" in step) {
              const input = await page.$(step.upload.on);
              if (!input) throw new Error(`ไม่พบ input สำหรับอัปโหลด ${step.upload.on}`);
              await input.uploadFile(step.upload.filePath);
            } else if ("swipe" in step) {
              const el = await page.$(step.swipe.on); const bb = (await el!.boundingBox())!;
              const y = bb.y + bb.height / 2; const x0 = bb.x + bb.width / 2;
              await page.touchscreen.touchStart(x0, y); for (let i = 1; i <= 8; i++) await page.touchscreen.touchMove(x0 + (step.swipe.dx * i) / 8, y); await page.touchscreen.touchEnd();
            } else if ("scrollTo" in step) {
              const sel = step.scrollTo;
              await page.evaluate((q: string) => { document.querySelector(q)?.scrollIntoView({ block: "center", inline: "nearest" }); }, sel);
            } else if ("longPress" in step) {
              const el = await page.$(step.longPress.on);
              if (!el) throw new Error(`ไม่พบ element สำหรับกดค้าง ${step.longPress.on}`);
              const bb = (await el.boundingBox())!;
              await page.touchscreen.touchStart(bb.x + bb.width / 2, bb.y + bb.height / 2);
              await new Promise((r) => setTimeout(r, step.longPress.ms ?? 400));
            }
          } catch (e) { failures++; console.log(`  ❌ step ${JSON.stringify(step).slice(0, 80)} — ${e instanceof Error ? e.message.slice(0, 120) : e}`); }
        }
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
        await new Promise((r) => setTimeout(r, 250));
        // ล้นแนวนอน (scrollWidth > viewport = เลย์เอาต์แตก) — เกณฑ์ D7 ของทุกใบ UI
        const overflow = await page.evaluate((w: number) => document.documentElement.scrollWidth > w + 2, w).catch(() => false);
        // เมื่อล้น: หา element ที่ขอบขวาเลย viewport มากสุด (ไม่นับ position:fixed และตัวที่ถูก ancestor ตัดไว้แล้ว) → บอกต้นเหตุเป็นชื่อจริง
        const overflowEl = overflow
          ? await page.evaluate((w: number) => {
              let best: { r: number; w: number; d: string } | null = null;
              for (const el of Array.from(document.querySelectorAll("body *"))) {
                const cs = getComputedStyle(el);
                if (cs.position === "fixed" || cs.display === "none") continue;
                const b = el.getBoundingClientRect();
                if (b.width === 0) continue;
                const right = b.right + window.scrollX;
                if (right <= w + 2) continue;
                let clipped = false;
                for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
                  const ox = getComputedStyle(a).overflowX;
                  if ((ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") && a.getBoundingClientRect().right + window.scrollX <= w + 2) { clipped = true; break; }
                }
                if (clipped) continue;
                if (!best || right > best.r + 1 || (Math.abs(right - best.r) <= 1 && b.width < best.w)) {
                  const tid = el.getAttribute("data-testid");
                  best = { r: right, w: b.width, d: `${el.tagName.toLowerCase()}${tid ? `[data-testid=${tid}]` : ""}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).slice(0, 4).join(".")}` : ""} right=${Math.round(right)} w=${Math.round(b.width)}` };
                }
              }
              return best?.d ?? null;
            }, w).catch(() => null)
          : null;
        const file = `${OUT}/${spec.name}-${device}.png`;
        await page.screenshot({ path: file, fullPage: true });
        shots.push(file);
        const missing: string[] = [];
        for (const sel of spec.expect ?? []) { if (!(await page.$(sel))) missing.push(sel); }
        const status = resp?.status() ?? 0;
        // ล้นแนวนอน = ตก (D7) · คำขอย่อย ≥400 เก็บไว้ดูเฉย ๆ (asset 404 ไม่ใช่เกณฑ์ผ่าน)
        const ok = status < 400 && missing.length === 0 && errors.length === 0 && !overflow;
        if (!ok) failures++;
        results.push({ name: spec.name, device, status, missing, errors, httpErrors, file, overflow, overflowEl });
        console.log(`  ${ok ? "✅" : "❌"} ${spec.name} [${device}] HTTP ${status} → ${file}${missing.length ? ` · ไม่พบ ${missing.join(",")}` : ""}${errors.length ? ` · console error ${errors.length}: ${errors[0]}` : ""}${overflow ? ` · ล้นแนวนอน: ${overflowEl ?? "?"}` : ""}${spec.note ? `\n       ↳ ${spec.note}` : ""}`);
        await page.close();
      }
    }
  } finally { await browser.close(); }
} catch (e) {
  fatal = e instanceof Fatal ? e.message : `ผิดพลาดกลางคัน — ${e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)}`;
} finally {
  try { await restoreSeed(); } catch (e) { failures++; console.log(`  ❌ คืนสภาพ seed ไม่สำเร็จ — ${e instanceof Error ? e.message.slice(0, 200) : e}`); }
  // ลบเฉพาะแถวที่รอบนี้สร้าง (id / tokenHash) — ห้ามลบด้วย userAgent เปล่า ๆ เพราะรอบอื่นที่รันพร้อมกันจะตาย
  let count = 0;
  if (MINE.sessionIds.length) count += (await prisma.session.deleteMany({ where: { id: { in: MINE.sessionIds } } })).count;
  if (MINE.tokenHashes.length) {
    for (const mdl of ["portalSession", "customerSession"]) {
      try { count += (await (prisma as Any)[mdl]?.deleteMany?.({ where: { tokenHash: { in: MINE.tokenHashes } } }))?.count ?? 0; } catch { /* ตารางยังไม่มี */ }
    }
  }
  // กวาดซากของรอบที่ถูก kill กลางคัน: แท็กเดียวกัน **และหมดอายุแล้ว** (รอบที่ยังวิ่งอยู่มี expiresAt อีก 1 ชม. จึงไม่โดน)
  // 🔴 หนี้ที่ **ใบ C3.5 เป็นเจ้าของ**: ตัวกวาดนี้ครอบเฉพาะตาราง `Session` (พนักงาน) — ยังไม่ครอบ
  //    `CustomerSession` / `PortalSession` เพราะตารางหลังยังไม่มีในวันที่เขียน ⇒ C3.5 ต้องเติมลูปกวาด
  //    (userAgent = UA และ expiresAt < now) ให้ครบทั้งสองตาราง ไม่งั้นรอบที่ถูก kill จะทิ้ง session ลูกค้าค้างไว้
  const stale = await prisma.session.deleteMany({ where: { userAgent: UA, expiresAt: { lt: new Date() } } });
  await prisma.$disconnect();
  writeFileSync(`${OUT}/summary-${userKey}.json`, JSON.stringify({ wo: WO, user: userKey, at: new Date().toISOString(), results }, null, 2));
  console.log(`\n🧹 ลบ session QC ของรอบนี้ ${count}${stale.count ? ` (+ซากหมดอายุ ${stale.count})` : ""} · ภาพ ${shots.length} ใบใน ${OUT} · สรุป summary-${userKey}.json`);
}
if (fatal) console.error(`❌ ${fatal}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, user: userKey, shots, failures, fatal: fatal || null })}`);
process.exit(fatal ? 2 : failures > 0 ? 1 : 0);
