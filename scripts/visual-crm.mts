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
const TMP = { contactIds: [] as string[], dealIds: [] as string[], activityIds: [] as string[], companyIds: [] as string[] };

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
const C15_DEAL: string | null = WO === "1.5"
  ? ((await (prisma as Any).crmDeal.findMany({ where: { systemId: SYS }, select: { id: true, _count: { select: { stageHistory: true } } } }))
      .sort((a: Any, b: Any) => b._count.stageHistory - a._count.stageHistory)[0]?.id ?? null)
  : null;

const SPECS: Record<string, Spec[]> = {
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
