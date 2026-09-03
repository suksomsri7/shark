// seed ชุดข้อมูล QC ของงาน "บัญชี V2" — ลบร้าน QC ทิ้งแล้วสร้างใหม่ทั้งก้อน (รันซ้ำได้เสมอ)
//
// ใช้:  pnpm exec tsx scripts/seed-acc-v2-qc.mts
// ตรวจ: pnpm exec tsx scripts/qc-acc-v2-seed-check.mts
//
// 🔴 โหลด `.env.qc` เท่านั้น (ผ่าน scripts/acc-v2-env.mts) — `.env` = production
// 🔴 ทุกเอกสาร/ทุกยอดเงิน "เดินผ่าน service จริง" (createDocument → issueDocument → recordPayment)
//    ไม่ยัด AccountDocument/JournalEntry ตรงเข้า DB — ไม่งั้นข้อมูลจะสมดุลปลอมและ QC โกหก
//
// ค่าคาดหวัง (BLUEPRINT §2 · เฟรม f1/f3/f5/f6/f7):
//   ค้างรับ 486,300.00 · 18 ใบ · 14 ลูกค้า      พ้นกำหนด 128,400.00 · 4 ใบ
//   ค้างจ่าย 212,750.00 · 9 ใบ · 7 ผู้ขาย
//   ช่องทางการเงิน 4: 86,400 · 912,300 · 265,860 · 20,000 (รวม 1,284,560)
//   ใบแจ้งหนี้ 51 ใบ: ร่าง 3 · รอชำระ 12 · บางส่วน 2 · ชำระแล้ว 29 · พ้นกำหนด 4 · ยกเลิก 1
//   ผู้ติดต่อ 63 (ลูกค้า 41 · ผู้ขาย 22 · เก็บเข้ากรุ 5) · สินค้า/บริการ 12
//
// ⏰ วันที่ทั้งหมดอ้าง "วันนี้" ที่ตรึงไว้ = 2026-09-30 · ใบที่ยังไม่พ้นกำหนดตั้ง dueDate พ.ย.–ธ.ค. 2026
//    เพื่อให้ผล "พ้นกำหนด" นิ่งแม้รันจริงคนละวัน (isOverdue อ่าน Date.now() ของเครื่อง)
//    หลัง QC.oracleValidUntil ตัวเลขจะเริ่มเพี้ยน → สคริปต์เตือนเอง

import { existsSync, readFileSync, writeFileSync } from "node:fs";
// tsconfig ไม่ได้เปิด allowImportingTsExtensions → import แบบ static ที่ลงท้าย .mts จะ typecheck ไม่ผ่าน
// ⇒ โหลดแบบ dynamic (tsx resolve ตอนรันได้ปกติ) แล้วประกาศชนิดไว้เอง
const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  isAccV2SeedPresent: (p: unknown) => Promise<boolean>;
  resolveAccV2Scope: (p: unknown) => Promise<{ tenantId: string; systemId: string } | null>;
  QC: {
    tenantName: string;
    tenantSlug: string;
    ownerEmail: string;
    ownerName: string;
    expectedPath: string;
    shotsDir: string;
    today: string;
    oracleValidUntil: string;
  };
};
const { loadQcEnv, QC, isAccV2SeedPresent, resolveAccV2Scope } = accEnv;

const { host } = loadQcEnv();
console.log(`🗄️  DB QC: ${host}\n`);

const { prisma } = await import("@/lib/core/db");

// ── โหมด `--if-missing` (qc-all.mts ใช้ · WO 0.7) ──────────────────────────────
// seed ใหม่ = id เป็น cuid ชุดใหม่ ⇒ `acc-v2-expected.json` (ไฟล์ที่ commit ไว้) เปลี่ยนทุกครั้ง
// บนเครื่อง dev จึงไม่ควร seed ซ้ำถ้า DB มีชุดข้อมูลอยู่แล้ว **และ** เฉลยยังตรงกับ DB ก้อนนั้น
// บน CI (Neon branch สด) จะไม่มีร้าน QC → เข้าเงื่อนไข seed เต็มเสมอ
// พิมพ์ `ACC_V2_SEED=skipped|created` ให้ qc-all อ่านว่าต้องสร้างเฉลย dashboard ต่อหรือไม่
if (process.argv.includes("--if-missing")) {
  const present = await isAccV2SeedPresent(prisma);
  const scope = present ? await resolveAccV2Scope(prisma) : null;
  let oracleInSync = false;
  if (scope && existsSync(QC.expectedPath)) {
    try {
      const E = JSON.parse(readFileSync(QC.expectedPath, "utf8"));
      oracleInSync = E.tenantId === scope.tenantId && E.systemId === scope.systemId && !!E.dashboard;
    } catch {
      oracleInSync = false;
    }
  }
  if (present && oracleInSync) {
    console.log(`ACC_V2_SEED=skipped — มีร้าน "${QC.tenantName}" ใน DB นี้แล้ว และ ${QC.expectedPath} ตรงกัน`);
    await prisma.$disconnect();
    process.exit(0);
  }
  console.log(
    `ACC_V2_SEED=missing — ${present ? `เฉลย ${QC.expectedPath} ไม่ตรงกับ DB ก้อนนี้` : "ยังไม่มีชุดข้อมูล QC ใน DB ก้อนนี้"} → seed ใหม่ทั้งก้อน`,
  );
}
const svc = await import("@/lib/modules/account/service");
const exp = await import("@/lib/modules/account/expense");
const fin = await import("@/lib/modules/account/finance");
const prod = await import("@/lib/modules/account/product");
const gl = await import("@/lib/modules/account/gl");
const sys = await import("@/lib/modules/system/service");

// ─────────────────────────── ตัวช่วย ───────────────────────────

const D = (s: string) => new Date(`${s}T10:00:00+07:00`);
const bahtStr = (satang: number) =>
  (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ฐานราคา (ก่อน VAT) ที่ทำให้ยอดสุทธิ = grand พอดี ในโหมด "ราคาแยก VAT 7%" · null = ทำไม่ได้
 *  (base + round(base×7%) ข้ามบางค่า เช่น 8,000,000 สตางค์ — ประมาณ 7% ของยอดเป็นแบบนี้) */
function baseForGrand(grand: number): number | null {
  let base = Math.round(grand / 1.07);
  for (let i = 0; i < 200; i++) {
    const total = base + Math.round(base * 0.07);
    if (total === grand) return base;
    base += total < grand ? 1 : -1;
  }
  return null;
}

/** บรรทัดที่ทำให้ยอดสุทธิเท่ากับ grand เป๊ะ ในโหมด "ราคาแยก VAT 7%" (ทั้งชุดใช้โหมดเดียวกันตามแบบ V2)
 *  ยอดที่ 1 บรรทัดทำไม่ได้ → แตกเป็น 2 บรรทัดที่ทำได้ทั้งคู่ (ยอดรวมยังเป๊ะ)
 *  🔴 ห้ามเปลี่ยนไปใช้ "ราคารวม VAT" กับเอกสารฝั่งจ่าย — gl.postDocument (PURCHASE/EXPENSE)
 *     Dr ด้วย line.amount ซึ่งในโหมด INCLUDE คือยอด "รวม VAT" แล้ว → เดบิตเกิน = โพสต์ไม่สมดุล
 *     (บั๊กจริงของระบบเดิม เจอตอน seed 3 ก.ย. 2026 — บันทึกไว้ใน ledger/wo-notes/0.1.md) */
function docLines(grand: number, description: string, unitName = "รายการ") {
  const base = baseForGrand(grand);
  if (base !== null)
    return { vatMode: "EXCLUDE" as const, lines: [{ description, qty: 1, unitName, unitPrice: base }] };
  for (let first = Math.floor(grand / 2); first > 0; first--) {
    const b1 = baseForGrand(first);
    const b2 = baseForGrand(grand - first);
    if (b1 !== null && b2 !== null)
      return {
        vatMode: "EXCLUDE" as const,
        lines: [
          { description, qty: 1, unitName, unitPrice: b1 },
          { description: `${description} (รายการเพิ่มเติม)`, qty: 1, unitName, unitPrice: b2 },
        ],
      };
  }
  throw new Error(`แตกบรรทัดให้ยอดสุทธิ ${grand} ไม่ได้`);
}

function assertEq(label: string, actual: number, want: number) {
  if (actual !== want) throw new Error(`❌ ${label}: ได้ ${actual} ต้องการ ${want}`);
}

// ─────────────────────────── 0. เตือนเรื่องอายุของข้อสอบ ───────────────────────────

if (Date.now() > D(QC.oracleValidUntil).getTime()) {
  console.warn(
    `⚠️  วันนี้เลย ${QC.oracleValidUntil} แล้ว — ใบที่ตั้งใจให้ "ยังไม่พ้นกำหนด" อาจกลายเป็นพ้นกำหนด\n` +
      `   ต้องเลื่อน dueDate ในสคริปต์นี้ก่อนใช้ต่อ (บทเรียน: ข้อสอบเน่าตามเวลา)\n`,
  );
}

// ─────────────────────────── 1. ลบร้าน QC เดิมทิ้งให้เกลี้ยง ───────────────────────────

async function purgeTenant(tenantId: string) {
  // ตารางทั้งหมดที่มีคอลัมน์ tenantId (ครอบทุกโมดูล — ไม่ต้องไล่ชื่อเอง เพิ่มโมดูลใหม่ก็ยังลบครบ)
  const rows = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'
  `;
  let pending = rows.map((r) => r.table_name);
  let deleted = 0;
  // FK ระหว่างตาราง → วนลบหลายรอบจนไม่มีอะไรลบได้อีก (ไม่ต้องรู้ลำดับ dependency)
  for (let pass = 0; pass < 12 && pending.length > 0; pass++) {
    const still: string[] = [];
    for (const t of pending) {
      try {
        deleted += await prisma.$executeRawUnsafe(
          `DELETE FROM "${t}" WHERE "tenantId" = $1`,
          tenantId,
        );
      } catch {
        still.push(t);
      }
    }
    if (still.length === pending.length) break; // ไม่คืบหน้าแล้ว
    pending = still;
  }
  if (pending.length) throw new Error(`ลบไม่หมด (ติด FK): ${pending.join(", ")}`);
  await prisma.user.deleteMany({ where: { email: QC.ownerEmail } }); // cascade → membership + session
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  return deleted;
}

const old = await prisma.tenant.findFirst({ where: { name: QC.tenantName }, select: { id: true } });
if (old) {
  const n = await purgeTenant(old.id);
  console.log(`🧹 ลบร้าน QC เดิม (${old.id}) — ${n} แถว`);
} else {
  await prisma.user.deleteMany({ where: { email: QC.ownerEmail } });
  console.log("🧹 ยังไม่มีร้าน QC เดิม — ข้ามการลบ");
}

// ─────────────────────────── 2. ร้าน + เจ้าของ + สาขา + ระบบ ───────────────────────────

const tenant = await prisma.tenant.create({
  data: {
    name: QC.tenantName,
    slug: QC.tenantSlug,
    status: "ACTIVE",
    enabledModules: ["ACCOUNT", "POS", "INVENTORY", "MEMBER", "CRM"],
  },
});
const tenantId = tenant.id;

const owner = await prisma.user.create({ data: { email: QC.ownerEmail, name: QC.ownerName } });
await prisma.membership.create({
  data: {
    userId: owner.id,
    tenantId,
    role: "OWNER",
    unitAccess: ["*"],
    acceptedAt: new Date(),
  },
});

const unit = await prisma.businessUnit.create({
  data: { tenantId, type: "BOOKING", name: "สาขาป่าตอง", slug: "patong", status: "ACTIVE" },
});

// สร้างระบบแบบเดียวกับ DNA onboarding: CREATE_SYSTEM → LINK_UNIT (AppSystemUnit) → LINK_ACCOUNT_POS
const mkSystem = async (type: "ACCOUNT" | "POS" | "INVENTORY" | "MEMBER" | "CRM", name: string) => {
  const s = await sys.createSystem(tenantId, type, name);
  await sys.linkUnit(tenantId, s.id, unit.id);
  return s;
};
const accSys = await mkSystem("ACCOUNT", "บัญชี");
const posSys = await mkSystem("POS", "ขายหน้าร้าน");
const invSys = await mkSystem("INVENTORY", "คลังสินค้า");
const memSys = await mkSystem("MEMBER", "สมาชิก");
const crmSys = await mkSystem("CRM", "ลูกค้าสัมพันธ์");
const systemId = accSys.id;

// LINK_ACCOUNT_POS (dna/apply.ts) — เงินจาก POS/CRM เข้าบัญชีชุดนี้
for (const [kind, linkedId] of [
  ["POS", posSys.id],
  ["CRM", crmSys.id],
] as const) {
  await prisma.accountSystemLink.create({ data: { tenantId, systemId, linkedKind: kind, linkedId } });
}

await svc.saveSettings(tenantId, systemId, {
  orgPrefix: "บริษัท",
  orgName: "สยามไดฟ์ คิวซี จำกัด",
  orgNameEn: "Siam Dive QC Co., Ltd.",
  taxId: "0835565001234",
  branchCode: "00000",
  branchName: "สำนักงานใหญ่",
  address: "88/12 ถ.ทวีวงศ์ ต.ป่าตอง อ.กะทู้ จ.ภูเก็ต 83150",
  phone: "076-345-678",
  email: "acc@siamdive-qc.local",
  vatRegistered: true,
  vatRateBp: 700,
  taxPointBasis: "ON_ISSUE",
  defaultDueDays: 30,
  defaultValidDays: 30,
});
await gl.ensureAccounting({ tenantId, systemId });
console.log(`🏢 ร้าน "${QC.tenantName}" ${tenantId} · ระบบบัญชี ${systemId}`);

// ─────────────────────────── 3. หน่วยนับ + สินค้า/บริการ 12 ───────────────────────────

for (const u of ["ชิ้น", "ตัว", "ชุด", "คู่", "คน", "ทริป", "วัน", "ครั้ง", "คอร์ส", "ถัง", "กล่อง"]) {
  await prod.createUnit(tenantId, systemId, u);
}
const units = new Map((await prod.listUnits(tenantId, systemId)).map((u) => [u.name, u.id]));

const PRODUCTS: { sku: string; name: string; type: "GOODS" | "SERVICE"; unit: string; sale: number; buy?: number }[] = [
  { sku: "TRIP-SIM3D", name: "ทริปสิมิลัน 3 วัน 2 คืน", type: "SERVICE", unit: "ทริป", sale: 990_000 },
  { sku: "TRIP-RAC1D", name: "ทริปดำน้ำเกาะราชา 1 วัน", type: "SERVICE", unit: "ทริป", sale: 350_000 },
  { sku: "CRS-OW", name: "คอร์ส Open Water Diver", type: "SERVICE", unit: "คอร์ส", sale: 1_450_000 },
  { sku: "CRS-AOW", name: "คอร์ส Advanced Open Water", type: "SERVICE", unit: "คอร์ส", sale: 1_290_000 },
  { sku: "RENT-SET", name: "ค่าเช่าอุปกรณ์ดำน้ำ", type: "SERVICE", unit: "ชุด", sale: 120_000 },
  { sku: "SHIRT-SD", name: "เสื้อ SIAM DIVE", type: "GOODS", unit: "ตัว", sale: 107_103, buy: 45_000 },
  { sku: "MASK-01", name: "หน้ากากดำน้ำ Aqualung", type: "GOODS", unit: "ชิ้น", sale: 285_000, buy: 168_000 },
  { sku: "FIN-01", name: "ตีนกบ Scubapro", type: "GOODS", unit: "คู่", sale: 420_000, buy: 265_000 },
  { sku: "REG-01", name: "เรกูเลเตอร์ Mares", type: "GOODS", unit: "ชิ้น", sale: 1_890_000, buy: 1_240_000 },
  { sku: "BCD-01", name: "เสื้อชูชีพ BCD Cressi", type: "GOODS", unit: "ชิ้น", sale: 1_650_000, buy: 1_080_000 },
  { sku: "TANK-12", name: "ถังอากาศ 12 ลิตร", type: "GOODS", unit: "ถัง", sale: 780_000, buy: 520_000 },
  { sku: "LOGBK-01", name: "สมุดบันทึกการดำน้ำ", type: "GOODS", unit: "ชิ้น", sale: 35_000, buy: 18_000 },
];
const productIds = new Map<string, string>();
for (const p of PRODUCTS) {
  const r = await prod.createProduct(tenantId, systemId, {
    sku: p.sku,
    name: p.name,
    type: p.type,
    unitId: units.get(p.unit) ?? null,
    salePrice: p.sale,
    buyPrice: p.buy ?? null,
    vatRateBp: 700,
  });
  if (!r.ok) throw new Error(`สร้างสินค้า ${p.name} ไม่สำเร็จ: ${r.reason}`);
  productIds.set(p.sku, r.id);
}
console.log(`📦 สินค้า/บริการ ${productIds.size} รายการ`);

// ─────────────────────────── 4. ผู้ติดต่อ 63 (ลูกค้า 41 · ผู้ขาย 22 · กรุ 5) ───────────────────────────

// ลำดับสำคัญ: ตัวที่ 19 ของลูกค้า = "ปิยธิดา อินสุ่ม" → รหัส C00019 ในดีไซน์ V2
const CUSTOMERS: { name: string; person?: boolean; archived?: boolean }[] = [
  { name: "บริษัท อันดามัน ทราเวล จำกัด" },
  { name: "โรงแรมสิมิลันวิว" },
  { name: "โรงเรียนสอนดำน้ำ บลูโอเชียน" },
  { name: "คุณณัฐพล รุ่งเรือง", person: true },
  { name: "คุณอรทัย พงษ์ไพบูลย์", person: true },
  { name: "บริษัท ภูเก็ตดีปซี จำกัด" },
  { name: "บริษัท ทะเลใส ทัวร์ จำกัด" },
  { name: "ห้างหุ้นส่วนจำกัด ป่าตองมารีน" },
  { name: "คุณสมชาย ใจดี", person: true },
  { name: "คุณวราภรณ์ ศรีสุวรรณ", person: true },
  { name: "บริษัท ซีสตาร์ รีสอร์ท จำกัด" },
  { name: "คุณกิตติพงษ์ แสงทอง", person: true },
  { name: "บริษัท เกาะพีพี แอดเวนเจอร์ จำกัด" },
  { name: "คุณพิมพ์ชนก วัฒนสุข", person: true },
  { name: "บริษัท ไดฟ์มาสเตอร์ เอเชีย จำกัด" },
  { name: "คุณธนกร เจริญพร", person: true },
  { name: "โรงแรมกะตะบีชรีสอร์ท" },
  { name: "คุณเมธาวี บุญมาก", person: true },
  { name: "ปิยธิดา อินสุ่ม", person: true }, // ← ลำดับ 19 = C00019 (fixture ของ WO ถัดไป)
  { name: "บริษัท โอเชียนบลู ทัวร์ จำกัด" },
  { name: "คุณศิริพร ทองดี", person: true },
  { name: "บริษัท สยามซีสปอร์ต จำกัด" },
  { name: "คุณอนุชา รักษ์ทะเล", person: true },
  { name: "โรงแรมกมลาเบย์" },
  { name: "คุณจิราพร สุขสมบูรณ์", person: true },
  { name: "บริษัท พีพี ไอส์แลนด์ ทัวร์ จำกัด" },
  { name: "คุณวิชัย มั่นคง", person: true },
  { name: "บริษัท ทริปดีดี จำกัด" },
  { name: "คุณนภัสสร อินทรีย์", person: true },
  { name: "บริษัท เดอะเรฟ ไดฟ์วิ่ง จำกัด" },
  { name: "คุณปรีชา หาญกล้า", person: true },
  { name: "โรงแรมในหานวิลล่า" },
  { name: "คุณสุดารัตน์ พูนทรัพย์", person: true },
  { name: "บริษัท เจ็ตสกี ภูเก็ต จำกัด" },
  { name: "คุณเอกชัย ตั้งใจ", person: true },
  { name: "บริษัท ซันเซ็ท ครูซ จำกัด" },
  { name: "คุณรัตนา แก้วใส", person: true },
  { name: "บริษัท ลันตา ไดฟ์ จำกัด" },
  { name: "คุณสมหญิง ดีเลิศ", person: true, archived: true },
  { name: "ร้านกาแฟริมหาด (ปิดกิจการ)", archived: true },
  { name: "คุณประยุทธ ชาญชัย", person: true, archived: true },
];
const VENDORS: { name: string; person?: boolean; archived?: boolean }[] = [
  { name: "บริษัท สยามแก๊ส อินดัสทรี จำกัด" },
  { name: "บริษัท อควาเทค อุปกรณ์ดำน้ำ จำกัด" },
  { name: "อู่ต่อเรือ ป่าตองมารีนเซอร์วิส" },
  { name: "บริษัท ภูเก็ตปิโตรเลียม จำกัด" },
  { name: "บริษัท ครัวทะเลใต้ เคเทอริ่ง จำกัด" },
  { name: "ห้างหุ้นส่วนจำกัด อันดามันซัพพลาย" },
  { name: "บริษัท เซฟตี้เฟิร์ส อุปกรณ์นิรภัย จำกัด" },
  { name: "บริษัท ทีโอที โทรคมนาคม จำกัด" },
  { name: "การไฟฟ้าส่วนภูมิภาค จ.ภูเก็ต" },
  { name: "การประปาส่วนภูมิภาค สาขาภูเก็ต" },
  { name: "บริษัท ขนส่งภูเก็ตเอ็กซ์เพรส จำกัด" },
  { name: "ร้านพิมพ์ดี การพิมพ์" },
  { name: "บริษัท คลีนโปร ทำความสะอาด จำกัด" },
  { name: "สำนักงานบัญชี ภูเก็ตแอคเคาท์" },
  { name: "บริษัท ไอทีซัพพอร์ต ภูเก็ต จำกัด" },
  { name: "คุณสมบัติ ช่างซ่อมเรือ", person: true },
  { name: "บริษัท ประกันภัยทะเลไทย จำกัด" },
  { name: "บริษัท ออกซิเจนพลัส จำกัด" },
  { name: "ร้านวัสดุก่อสร้างป่าตอง" },
  { name: "บริษัท มาร์เก็ตติ้งฮับ ดิจิทัล จำกัด" },
  { name: "ร้านซักรีดสะอาดใจ (เลิกจ้าง)", archived: true },
  { name: "คุณวิรัช รับเหมาทาสี", person: true, archived: true },
];

const contactId = new Map<string, string>();
let taxSeq = 3_000_000_000_000; // ตัวเลข 13 หลักแบบไล่ลำดับ (ข้อมูลสมมติ ไม่ใช่เลขจริง)
const mkContact = async (
  c: { name: string; person?: boolean; archived?: boolean },
  kind: "CUSTOMER" | "VENDOR",
  seq: number,
) => {
  const row = await svc.createContact({
    tenantId,
    systemId,
    kind,
    legalType: c.person ? "PERSON" : "COMPANY",
    name: c.name,
    taxId: String(taxSeq++),
    address: "จ.ภูเก็ต",
    phone: `076${String(100000 + seq).slice(-6)}`,
    email: null,
    creditTermDays: c.person ? 0 : 30,
    note: `${kind === "CUSTOMER" ? "C" : "V"}${String(seq).padStart(5, "0")}`,
  });
  contactId.set(c.name, row.id);
  if (c.archived) await svc.archiveContact(tenantId, systemId, row.id);
  return row.id;
};
for (const [i, c] of CUSTOMERS.entries()) await mkContact(c, "CUSTOMER", i + 1);
for (const [i, v] of VENDORS.entries()) await mkContact(v, "VENDOR", i + 1);
console.log(`👥 ผู้ติดต่อ ${contactId.size} ราย (ลูกค้า ${CUSTOMERS.length} · ผู้ขาย ${VENDORS.length})`);

const cid = (name: string) => {
  const id = contactId.get(name);
  if (!id) throw new Error(`ไม่พบผู้ติดต่อ "${name}"`);
  return id;
};

// ─────────────────────────── 5. แผนเอกสาร (คิดยอดให้ครบก่อนแตะ DB) ───────────────────────────

type PayPlan = { fin: "CSH001" | "BSV001" | "EWL001"; amount: number; paidAt: string };
type InvPlan = {
  cust: string;
  grand: number;
  issue: string;
  due: string;
  desc: string;
  pay?: PayPlan;
  bucket: "overdue" | "awaiting" | "partial" | "paid";
};

// 5.1 พ้นกำหนด 4 ใบ · รวม 128,400.00 (dueDate ส.ค. 2026 → พ้นกำหนดแน่นอน)
const OVERDUE: InvPlan[] = [
  { cust: "ปิยธิดา อินสุ่ม", grand: 3_840_000, issue: "2026-08-12", due: "2026-08-26", desc: "ทริปดำน้ำหมู่เกาะสิมิลัน 3 วัน 2 คืน", bucket: "overdue" },
  { cust: "บริษัท อันดามัน ทราเวล จำกัด", grand: 4_200_000, issue: "2026-07-28", due: "2026-08-11", desc: "แพ็กเกจดำน้ำหมู่คณะ 12 ท่าน", bucket: "overdue" },
  { cust: "โรงเรียนสอนดำน้ำ บลูโอเชียน", grand: 3_000_000, issue: "2026-08-05", due: "2026-08-19", desc: "ค่าเช่าอุปกรณ์ดำน้ำรายเดือน", bucket: "overdue" },
  { cust: "คุณอรทัย พงษ์ไพบูลย์", grand: 1_800_000, issue: "2026-08-18", due: "2026-08-25", desc: "คอร์ส Advanced Open Water", bucket: "overdue" },
];

// 5.2 รอชำระ 12 ใบ (ยังไม่พ้นกำหนด) · รวม 245,650.00 — ใบแรก = fixture คุณณัฐพล 24,900.00
const AWAITING: InvPlan[] = [
  { cust: "คุณณัฐพล รุ่งเรือง", grand: 2_490_000, issue: "2026-09-18", due: "2026-11-17", desc: "(หลายบรรทัด)", bucket: "awaiting" },
  { cust: "บริษัท ทะเลใส ทัวร์ จำกัด", grand: 1_250_000, issue: "2026-09-02", due: "2026-11-01", desc: "ทริปดำน้ำเกาะราชา 1 วัน", bucket: "awaiting" },
  { cust: "ห้างหุ้นส่วนจำกัด ป่าตองมารีน", grand: 1_800_000, issue: "2026-09-04", due: "2026-11-03", desc: "ค่าบริการนำเที่ยวดำน้ำ", bucket: "awaiting" },
  { cust: "คุณสมชาย ใจดี", grand: 975_000, issue: "2026-09-06", due: "2026-11-05", desc: "คอร์สดำน้ำเบื้องต้น", bucket: "awaiting" },
  { cust: "บริษัท ซีสตาร์ รีสอร์ท จำกัด", grand: 3_500_000, issue: "2026-09-08", due: "2026-11-07", desc: "แพ็กเกจดำน้ำแขกโรงแรม ก.ย.", bucket: "awaiting" },
  { cust: "บริษัท เกาะพีพี แอดเวนเจอร์ จำกัด", grand: 2_730_000, issue: "2026-09-10", due: "2026-11-09", desc: "ทริปดำน้ำเกาะพีพี 2 วัน", bucket: "awaiting" },
  { cust: "คุณพิมพ์ชนก วัฒนสุข", grand: 1_420_000, issue: "2026-09-12", due: "2026-11-11", desc: "คอร์ส Open Water Diver", bucket: "awaiting" },
  { cust: "บริษัท ไดฟ์มาสเตอร์ เอเชีย จำกัด", grand: 2_200_000, issue: "2026-09-14", due: "2026-11-13", desc: "ค่าอุปกรณ์ดำน้ำและถังอากาศ", bucket: "awaiting" },
  { cust: "โรงแรมกะตะบีชรีสอร์ท", grand: 1_650_000, issue: "2026-09-16", due: "2026-11-15", desc: "ทริปดำน้ำตื้นแขกโรงแรม", bucket: "awaiting" },
  { cust: "คุณอรทัย พงษ์ไพบูลย์", grand: 2_800_000, issue: "2026-09-20", due: "2026-11-19", desc: "ทริปสิมิลัน 3 วัน 2 คืน", bucket: "awaiting" },
  { cust: "ปิยธิดา อินสุ่ม", grand: 1_980_000, issue: "2026-09-22", due: "2026-11-21", desc: "ทริปดำน้ำเกาะราชา 1 วัน (2 ท่าน)", bucket: "awaiting" },
  { cust: "บริษัท อันดามัน ทราเวล จำกัด", grand: 1_770_000, issue: "2026-09-24", due: "2026-12-23", desc: "ค่าบริการไกด์ดำน้ำ ก.ย.", bucket: "awaiting" },
];

// 5.3 ชำระบางส่วน 2 ใบ · คงเหลือรวม 112,250.00
const PARTIAL: InvPlan[] = [
  {
    cust: "โรงแรมสิมิลันวิว",
    grand: 12_450_000,
    issue: "2026-09-05",
    due: "2026-11-04",
    desc: "แพ็กเกจดำน้ำแขกโรงแรม ไตรมาส 3",
    bucket: "partial",
    pay: { fin: "BSV001", amount: 6_225_000, paidAt: "2026-09-19" },
  },
  {
    cust: "โรงเรียนสอนดำน้ำ บลูโอเชียน",
    grand: 8_000_000,
    issue: "2026-09-09",
    due: "2026-11-08",
    desc: "คอร์สดำน้ำนักเรียน 8 ท่าน",
    bucket: "partial",
    pay: { fin: "BSV001", amount: 3_000_000, paidAt: "2026-09-23" },
  },
];

// 5.4 ชำระแล้ว 29 ใบ (เงินเข้าแล้ว — ตัวกำหนดยอดคงเหลือช่องทางการเงิน)
const PAID_SPEC: { cust: string; grand: number; issue: string; fin: PayPlan["fin"]; desc: string }[] = [
  // เงินสด 6 ใบ · รวม 62,400.00
  { cust: "คุณสมชาย ใจดี", grand: 320_000, issue: "2026-06-03", fin: "CSH001", desc: "ค่าเช่าอุปกรณ์ดำน้ำ 1 วัน" },
  { cust: "คุณวราภรณ์ ศรีสุวรรณ", grand: 480_000, issue: "2026-06-11", fin: "CSH001", desc: "ทริปดำน้ำตื้นเกาะเฮ" },
  { cust: "คุณกิตติพงษ์ แสงทอง", grand: 750_000, issue: "2026-06-19", fin: "CSH001", desc: "ค่าอุปกรณ์ดำน้ำ" },
  { cust: "คุณธนกร เจริญพร", grand: 1_250_000, issue: "2026-07-02", fin: "CSH001", desc: "ทริปดำน้ำเกาะราชา" },
  { cust: "คุณเมธาวี บุญมาก", grand: 890_000, issue: "2026-07-15", fin: "CSH001", desc: "ค่าเช่าอุปกรณ์และถังอากาศ" },
  { cust: "คุณศิริพร ทองดี", grand: 2_550_000, issue: "2026-08-06", fin: "CSH001", desc: "คอร์ส Advanced Open Water" },
  // พร้อมเพย์ 8 ใบ · รวม 215,860.00
  { cust: "คุณอนุชา รักษ์ทะเล", grand: 1_890_000, issue: "2026-06-06", fin: "EWL001", desc: "เรกูเลเตอร์ Mares" },
  { cust: "คุณจิราพร สุขสมบูรณ์", grand: 2_450_000, issue: "2026-06-22", fin: "EWL001", desc: "ทริปดำน้ำเกาะพีพี" },
  { cust: "คุณวิชัย มั่นคง", grand: 3_120_000, issue: "2026-07-08", fin: "EWL001", desc: "คอร์ส Open Water Diver" },
  { cust: "คุณนภัสสร อินทรีย์", grand: 1_560_000, issue: "2026-07-21", fin: "EWL001", desc: "เสื้อชูชีพ BCD Cressi" },
  { cust: "คุณปรีชา หาญกล้า", grand: 4_200_000, issue: "2026-08-03", fin: "EWL001", desc: "ทริปสิมิลัน 3 วัน 2 คืน" },
  { cust: "คุณสุดารัตน์ พูนทรัพย์", grand: 2_880_000, issue: "2026-08-14", fin: "EWL001", desc: "คอร์สดำน้ำและอุปกรณ์" },
  { cust: "คุณเอกชัย ตั้งใจ", grand: 3_450_000, issue: "2026-08-27", fin: "EWL001", desc: "ทริปดำน้ำเกาะพีพี 2 วัน" },
  { cust: "คุณรัตนา แก้วใส", grand: 2_036_000, issue: "2026-09-07", fin: "EWL001", desc: "ค่าเช่าอุปกรณ์ดำน้ำ 3 วัน" },
  // ธนาคาร 15 ใบ · รวม 560,000.00
  { cust: "บริษัท โอเชียนบลู ทัวร์ จำกัด", grand: 3_500_000, issue: "2026-05-08", fin: "BSV001", desc: "แพ็กเกจดำน้ำหมู่คณะ" },
  { cust: "บริษัท สยามซีสปอร์ต จำกัด", grand: 4_200_000, issue: "2026-05-19", fin: "BSV001", desc: "ค่าบริการนำเที่ยวดำน้ำ" },
  { cust: "โรงแรมกมลาเบย์", grand: 2_800_000, issue: "2026-05-28", fin: "BSV001", desc: "ทริปดำน้ำแขกโรงแรม" },
  { cust: "บริษัท พีพี ไอส์แลนด์ ทัวร์ จำกัด", grand: 5_600_000, issue: "2026-06-09", fin: "BSV001", desc: "แพ็กเกจดำน้ำ 3 วัน 2 คืน" },
  { cust: "บริษัท ทริปดีดี จำกัด", grand: 3_150_000, issue: "2026-06-25", fin: "BSV001", desc: "ค่าบริการไกด์ดำน้ำ" },
  { cust: "บริษัท เดอะเรฟ ไดฟ์วิ่ง จำกัด", grand: 4_750_000, issue: "2026-07-06", fin: "BSV001", desc: "อุปกรณ์ดำน้ำครบชุด" },
  { cust: "โรงแรมในหานวิลล่า", grand: 2_450_000, issue: "2026-07-13", fin: "BSV001", desc: "ทริปดำน้ำตื้นแขกโรงแรม" },
  { cust: "บริษัท เจ็ตสกี ภูเก็ต จำกัด", grand: 6_300_000, issue: "2026-07-24", fin: "BSV001", desc: "แพ็กเกจกิจกรรมทางน้ำ" },
  { cust: "บริษัท ซันเซ็ท ครูซ จำกัด", grand: 3_850_000, issue: "2026-08-05", fin: "BSV001", desc: "ทริปดำน้ำพระอาทิตย์ตก" },
  { cust: "บริษัท ลันตา ไดฟ์ จำกัด", grand: 2_950_000, issue: "2026-08-12", fin: "BSV001", desc: "ค่าเช่าถังอากาศรายเดือน" },
  { cust: "บริษัท ภูเก็ตดีปซี จำกัด", grand: 4_100_000, issue: "2026-08-20", fin: "BSV001", desc: "แพ็กเกจดำน้ำลึก" },
  { cust: "บริษัท ซีสตาร์ รีสอร์ท จำกัด", grand: 3_300_000, issue: "2026-08-26", fin: "BSV001", desc: "ทริปดำน้ำแขกโรงแรม ส.ค." },
  { cust: "บริษัท ทะเลใส ทัวร์ จำกัด", grand: 2_700_000, issue: "2026-09-01", fin: "BSV001", desc: "ทริปดำน้ำเกาะราชา หมู่คณะ" },
  { cust: "โรงแรมสิมิลันวิว", grand: 3_950_000, issue: "2026-09-08", fin: "BSV001", desc: "แพ็กเกจดำน้ำแขกโรงแรม ก.ย." },
  { cust: "บริษัท ไดฟ์มาสเตอร์ เอเชีย จำกัด", grand: 2_400_000, issue: "2026-09-15", fin: "BSV001", desc: "อุปกรณ์ดำน้ำและอะไหล่" },
];

// 5.5 ร่าง 3 ใบ + ยกเลิก 1 ใบ (ไม่มีผลทางบัญชี)
const DRAFTS: { cust: string; grand: number; issue: string; desc: string }[] = [
  { cust: "บริษัท ทะเลใส ทัวร์ จำกัด", grand: 1_500_000, issue: "2026-09-26", desc: "ร่าง: ทริปดำน้ำเดือนหน้า" },
  { cust: "คุณธนกร เจริญพร", grand: 640_000, issue: "2026-09-27", desc: "ร่าง: ค่าเช่าอุปกรณ์" },
  { cust: "โรงแรมกะตะบีชรีสอร์ท", grand: 2_250_000, issue: "2026-09-28", desc: "ร่าง: แพ็กเกจแขกโรงแรม ต.ค." },
];
const CANCELLED = { cust: "คุณวิชัย มั่นคง", grand: 880_000, issue: "2026-09-25", desc: "ยกเลิก: ลูกค้าเลื่อนทริป" };

// 5.6 ฝั่งจ่าย — ค้างจ่าย 9 ใบ · 212,750.00 · ผู้ขาย 7 ราย
type BillPlan = {
  vendor: string;
  grand: number;
  issue: string;
  due: string;
  desc: string;
  docType: "EXPENSE" | "PURCHASE";
  pay?: { fin: "BSV001"; amount: number; paidAt: string };
};
const OPEN_BILLS: BillPlan[] = [
  { vendor: "บริษัท สยามแก๊ส อินดัสทรี จำกัด", grand: 4_500_000, issue: "2026-08-06", due: "2026-08-20", desc: "ค่าอากาศอัดถังดำน้ำ ก.ค.", docType: "EXPENSE" },
  { vendor: "บริษัท อควาเทค อุปกรณ์ดำน้ำ จำกัด", grand: 3_250_000, issue: "2026-08-14", due: "2026-08-28", desc: "สั่งซื้ออุปกรณ์ดำน้ำ", docType: "PURCHASE" },
  { vendor: "อู่ต่อเรือ ป่าตองมารีนเซอร์วิส", grand: 2_800_000, issue: "2026-09-16", due: "2026-11-15", desc: "ซ่อมบำรุงเรือนำเที่ยว", docType: "PURCHASE" },
  { vendor: "บริษัท ภูเก็ตปิโตรเลียม จำกัด", grand: 2_475_000, issue: "2026-09-21", due: "2026-11-20", desc: "ค่าน้ำมันเรือ ก.ย.", docType: "EXPENSE" },
  { vendor: "บริษัท ครัวทะเลใต้ เคเทอริ่ง จำกัด", grand: 2_200_000, issue: "2026-09-01", due: "2026-11-30", desc: "อาหารกลางวันบนเรือ ก.ย.", docType: "PURCHASE" },
  { vendor: "ห้างหุ้นส่วนจำกัด อันดามันซัพพลาย", grand: 1_850_000, issue: "2026-09-06", due: "2026-12-05", desc: "ค่าวัสดุสิ้นเปลืองประจำเดือน", docType: "EXPENSE" },
  { vendor: "บริษัท เซฟตี้เฟิร์ส อุปกรณ์นิรภัย จำกัด", grand: 1_600_000, issue: "2026-09-11", due: "2026-12-10", desc: "ชุดปฐมพยาบาลและออกซิเจนฉุกเฉิน", docType: "PURCHASE" },
  { vendor: "บริษัท สยามแก๊ส อินดัสทรี จำกัด", grand: 1_400_000, issue: "2026-09-17", due: "2026-12-15", desc: "ค่าอากาศอัดถังดำน้ำ ส.ค.", docType: "EXPENSE" },
  { vendor: "อู่ต่อเรือ ป่าตองมารีนเซอร์วิส", grand: 1_200_000, issue: "2026-09-19", due: "2026-12-20", desc: "เปลี่ยนใบจักรเรือเล็ก", docType: "PURCHASE" },
];
const PAID_BILLS: BillPlan[] = [
  { vendor: "บริษัท ภูเก็ตปิโตรเลียม จำกัด", grand: 3_200_000, issue: "2026-06-05", due: "2026-07-05", desc: "ค่าน้ำมันเรือ มิ.ย.", docType: "EXPENSE", pay: { fin: "BSV001", amount: 3_200_000, paidAt: "2026-07-03" } },
  { vendor: "การไฟฟ้าส่วนภูมิภาค จ.ภูเก็ต", grand: 2_850_000, issue: "2026-07-05", due: "2026-07-25", desc: "ค่าไฟฟ้าสำนักงาน", docType: "EXPENSE", pay: { fin: "BSV001", amount: 2_850_000, paidAt: "2026-07-22" } },
  { vendor: "บริษัท ครัวทะเลใต้ เคเทอริ่ง จำกัด", grand: 1_950_000, issue: "2026-07-12", due: "2026-08-11", desc: "อาหารกลางวันบนเรือ ก.ค.", docType: "PURCHASE", pay: { fin: "BSV001", amount: 1_950_000, paidAt: "2026-08-08" } },
  { vendor: "บริษัท ประกันภัยทะเลไทย จำกัด", grand: 2_400_000, issue: "2026-08-03", due: "2026-08-31", desc: "เบี้ยประกันเรือนำเที่ยว", docType: "EXPENSE", pay: { fin: "BSV001", amount: 2_400_000, paidAt: "2026-08-28" } },
  { vendor: "บริษัท ขนส่งภูเก็ตเอ็กซ์เพรส จำกัด", grand: 2_100_000, issue: "2026-08-10", due: "2026-09-09", desc: "ค่าขนส่งอุปกรณ์", docType: "EXPENSE", pay: { fin: "BSV001", amount: 2_100_000, paidAt: "2026-09-04" } },
  { vendor: "บริษัท ออกซิเจนพลัส จำกัด", grand: 2_000_000, issue: "2026-08-18", due: "2026-09-17", desc: "ก๊าซไนตรอกซ์", docType: "PURCHASE", pay: { fin: "BSV001", amount: 2_000_000, paidAt: "2026-09-12" } },
];

// 5.7 ใบรับเงินมัดจำ (fixture): DR 10,000.00 ของคุณณัฐพล — รับเป็นเงินสด
const DEPOSIT = { cust: "คุณณัฐพล รุ่งเรือง", grand: 1_000_000, issue: "2026-09-12", paidAt: "2026-09-12", fin: "CSH001" as const };

// ─────────── ตรวจแผนก่อนแตะ DB (ผิดตั้งแต่แผน = ไม่ต้องเสียเวลารัน) ───────────
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const receivablePlan =
  sum(OVERDUE.map((d) => d.grand)) +
  sum(AWAITING.map((d) => d.grand)) +
  sum(PARTIAL.map((d) => d.grand - (d.pay?.amount ?? 0)));
assertEq("ค้างรับตามแผน", receivablePlan, 48_630_000);
assertEq("พ้นกำหนดตามแผน", sum(OVERDUE.map((d) => d.grand)), 12_840_000);
assertEq("ค้างจ่ายตามแผน", sum(OPEN_BILLS.map((d) => d.grand)), 21_275_000);
assertEq("จำนวนใบแจ้งหนี้ตามแผน", OVERDUE.length + AWAITING.length + PARTIAL.length + PAID_SPEC.length + DRAFTS.length + 1, 51);
assertEq("ใบชำระแล้วตามแผน", PAID_SPEC.length, 29);
{
  const custs = new Set([...OVERDUE, ...AWAITING, ...PARTIAL].map((d) => d.cust));
  assertEq("ลูกค้าที่ค้างชำระตามแผน", custs.size, 14);
  const vends = new Set(OPEN_BILLS.map((b) => b.vendor));
  assertEq("ผู้ขายที่ค้างจ่ายตามแผน", vends.size, 7);
}

// ─────────────────────────── 6. ช่องทางการเงิน (ยอดยกมา = เป้าหมาย − เงินไหลตามแผน) ───────────────────────────

const FIN_TARGET = { CSH001: 8_640_000, BSV001: 91_230_000, EWL001: 26_586_000, PTY001: 2_000_000 } as const;
assertEq("ยอดรวมช่องทางการเงิน", sum(Object.values(FIN_TARGET)), 128_456_000);

// เงินเข้า/ออกที่ "จะเกิดขึ้น" จากแผนข้างบน (ค่าธรรมเนียม/WHT = 0 → ยอดเงินสดเท่ากับ amount เป๊ะ)
const flow: Record<string, number> = { CSH001: 0, BSV001: 0, EWL001: 0, PTY001: 0 };
for (const p of PAID_SPEC) flow[p.fin] += p.grand;
for (const p of PARTIAL) if (p.pay) flow[p.pay.fin] += p.pay.amount;
flow[DEPOSIT.fin] += DEPOSIT.grand;
for (const b of PAID_BILLS) if (b.pay) flow[b.pay.fin] -= b.pay.amount;

const FIN_DEF = [
  { code: "CSH001", type: "CASH" as const, name: "เงินสด", openDate: "2026-01-05", bank: null, no: null, pp: null },
  { code: "BSV001", type: "BANK" as const, name: "กสิกรไทย ออมทรัพย์", openDate: "2026-02-05", bank: "ธนาคารกสิกรไทย", no: "058-1-23456-7", pp: null },
  { code: "EWL001", type: "E_WALLET" as const, name: "พร้อมเพย์", openDate: "2026-03-05", bank: null, no: null, pp: "0835565001234" },
  { code: "PTY001", type: "PETTY_CASH" as const, name: "เงินสดย่อย", openDate: "2026-04-06", bank: null, no: null, pp: null },
];
const finId: Record<string, string> = {};
const finOpening: Record<string, number> = {};
for (const f of FIN_DEF) {
  const opening = FIN_TARGET[f.code as keyof typeof FIN_TARGET] - flow[f.code];
  if (opening < 0) throw new Error(`ยอดยกมาของ ${f.code} ติดลบ (${opening}) — ปรับแผนการชำระ`);
  finOpening[f.code] = opening;
  const r = await fin.createFinanceAccount({
    tenantId,
    systemId,
    type: f.type,
    name: f.name,
    bankName: f.bank,
    accountNo: f.no,
    promptpayId: f.pp,
    openingBalance: opening,
    openingDate: D(f.openDate), // คนละงวด — postOpening อนุญาตยอดยกมา 1 ครั้ง/งวด
    showOnDocuments: f.type !== "PETTY_CASH",
  });
  if (!r.ok) throw new Error(`สร้างช่องทางการเงิน ${f.name} ไม่สำเร็จ: ${r.reason}`);
  finId[f.code] = r.id;
  console.log(`💳 ${f.code} ${f.name} · ยอดยกมา ฿${bahtStr(opening)}`);
}

// ─────────────────────────── 7. เอกสารฝั่งรับ ───────────────────────────

const fixtures: Record<string, string> = {};

async function makeInvoice(p: InvPlan, lines?: { description: string; qty: number; unitName?: string; unitPrice: number }[]) {
  const auto = docLines(p.grand, p.desc);
  const doc = await svc.createDocument({
    tenantId,
    systemId,
    docType: "INVOICE",
    contactId: cid(p.cust),
    issueDate: D(p.issue),
    dueDate: D(p.due),
    vatMode: lines ? "EXCLUDE" : auto.vatMode,
    lines: lines ?? auto.lines,
    createdById: owner.id,
  });
  const issued = await svc.issueDocument(tenantId, systemId, doc.id);
  if (!issued.ok) throw new Error(`ออกใบแจ้งหนี้ ${p.cust} ไม่สำเร็จ: ${issued.reason}`);
  const row = await prisma.accountDocument.findUniqueOrThrow({ where: { id: doc.id }, select: { grandTotal: true, docNo: true } });
  assertEq(`ยอดใบแจ้งหนี้ ${p.cust} ${issued.docNo}`, row.grandTotal, p.grand);
  if (p.pay) {
    const r = await svc.recordPayment(tenantId, systemId, doc.id, {
      paidAt: D(p.pay.paidAt),
      channel: p.pay.fin === "CSH001" ? "CASH" : p.pay.fin === "EWL001" ? "PROMPTPAY" : "TRANSFER",
      financeAccountId: finId[p.pay.fin],
      amount: p.pay.amount,
      createdById: owner.id,
    });
    if (!r.ok) throw new Error(`รับชำระ ${p.cust} ไม่สำเร็จ: ${r.reason}`);
  }
  return { id: doc.id, docNo: issued.docNo };
}

for (const p of OVERDUE) {
  const r = await makeInvoice(p);
  if (p.cust === "ปิยธิดา อินสุ่ม") {
    fixtures.invPiyathidaId = r.id;
    fixtures.invPiyathidaDocNo = r.docNo;
  }
}

// fixture: ใบแจ้งหนี้คุณณัฐพล 24,900.00 — 3 บรรทัดตามแบบ (ราคาแยก VAT 7%)
for (const [i, p] of AWAITING.entries()) {
  const lines =
    i === 0
      ? [
          { description: "ทริปสิมิลัน 3 วัน 2 คืน", qty: 2, unitName: "ทริป", unitPrice: 990_000 },
          { description: "ค่าเช่าอุปกรณ์ดำน้ำ", qty: 2, unitName: "ชุด", unitPrice: 120_000 },
          { description: "เสื้อ SIAM DIVE", qty: 1, unitName: "ตัว", unitPrice: 107_103 },
        ]
      : undefined;
  const r = await makeInvoice(p, lines);
  if (i === 0) {
    fixtures.invNattapholId = r.id;
    fixtures.invNattapholDocNo = r.docNo;
  }
}

for (const p of PARTIAL) {
  const r = await makeInvoice(p);
  if (p.cust === "โรงแรมสิมิลันวิว") {
    fixtures.invSimilanViewId = r.id;
    fixtures.invSimilanViewDocNo = r.docNo;
  }
}

for (const p of PAID_SPEC) {
  await makeInvoice({
    cust: p.cust,
    grand: p.grand,
    issue: p.issue,
    due: p.issue,
    desc: p.desc,
    bucket: "paid",
    pay: { fin: p.fin, amount: p.grand, paidAt: p.issue },
  });
}

for (const d of DRAFTS) {
  const auto = docLines(d.grand, d.desc);
  await svc.createDocument({
    tenantId,
    systemId,
    docType: "INVOICE",
    contactId: cid(d.cust),
    issueDate: D(d.issue),
    dueDate: D("2026-12-31"),
    vatMode: auto.vatMode,
    lines: auto.lines,
    createdById: owner.id,
  });
}

{
  const auto = docLines(CANCELLED.grand, CANCELLED.desc);
  const doc = await svc.createDocument({
    tenantId,
    systemId,
    docType: "INVOICE",
    contactId: cid(CANCELLED.cust),
    issueDate: D(CANCELLED.issue),
    dueDate: D("2026-12-31"),
    vatMode: auto.vatMode,
    lines: auto.lines,
    createdById: owner.id,
  });
  const v = await svc.voidDocument(tenantId, systemId, doc.id, "ลูกค้าเลื่อนทริปไม่มีกำหนด");
  if (!v.ok) throw new Error(`ยกเลิกใบร่างไม่สำเร็จ: ${v.reason}`);
}

// ใบรับเงินมัดจำ (ไม่กระทบแท็บใบแจ้งหนี้ · เงินเข้าเงินสด)
{
  const dep = await svc.createDocument({
    tenantId,
    systemId,
    docType: "DEPOSIT_RECEIPT",
    contactId: cid(DEPOSIT.cust),
    issueDate: D(DEPOSIT.issue),
    dueDate: D(DEPOSIT.issue),
    vatMode: "NONE", // มัดจำในแบบคือ 10,000.00 ถ้วน
    lines: [{ description: "มัดจำทริปสิมิลัน 3 วัน 2 คืน", qty: 1, unitName: "ทริป", unitPrice: DEPOSIT.grand }],
    createdById: owner.id,
  });
  const issued = await svc.issueDocument(tenantId, systemId, dep.id);
  if (!issued.ok) throw new Error(`ออกใบรับมัดจำไม่สำเร็จ: ${issued.reason}`);
  const r = await svc.recordPayment(tenantId, systemId, dep.id, {
    paidAt: D(DEPOSIT.paidAt),
    channel: "CASH",
    financeAccountId: finId[DEPOSIT.fin],
    amount: DEPOSIT.grand,
    createdById: owner.id,
  });
  if (!r.ok) throw new Error(`รับเงินมัดจำไม่สำเร็จ: ${r.reason}`);
  fixtures.depositNattapholId = dep.id;
  fixtures.depositNattapholDocNo = issued.docNo;
}

console.log(`🧾 ใบแจ้งหนี้ ${OVERDUE.length + AWAITING.length + PARTIAL.length + PAID_SPEC.length + DRAFTS.length + 1} ใบ + ใบรับมัดจำ 1 ใบ`);

// ─────────────────────────── 8. เอกสารฝั่งจ่าย ───────────────────────────

// เลือกเฉพาะหมวดที่ "ใช้บันทึกค่าใช้จ่ายทั่วไปได้จริง" — เลี่ยง 5800 ส่วนลดรับ (contra),
// 6500 ค่าธรรมเนียมชำระเงิน และ 6800 ค่าเสื่อมราคา ซึ่งระบบใช้เองในการโพสต์อัตโนมัติ
const ledgers = await exp.listExpenseAccounts(systemId);
const expenseAccounts = ledgers.filter((a) => ["6000", "6100", "6200", "6300", "6900"].includes(a.code));
const cogsAccounts = ledgers.filter((a) => a.code === "5000");
if (expenseAccounts.length === 0 || cogsAccounts.length === 0)
  throw new Error("ผังบัญชีไม่มีหมวดค่าใช้จ่าย/ต้นทุน — ensureAccounting ไม่ทำงาน?");

let expIdx = 0;
async function makeBill(b: BillPlan) {
  const acct =
    b.docType === "EXPENSE"
      ? expenseAccounts[expIdx++ % expenseAccounts.length].id
      : cogsAccounts[expIdx++ % cogsAccounts.length].id;
  const auto = docLines(b.grand, b.desc);
  const doc = await exp.createExpenseDoc({
    tenantId,
    systemId,
    docType: b.docType,
    contactId: cid(b.vendor),
    issueDate: D(b.issue),
    dueDate: D(b.due),
    vatMode: auto.vatMode,
    vatPurchaseMode: "CLAIM",
    lines: auto.lines.map((l) => ({ ...l, accountId: acct })),
    createdById: owner.id,
  });
  const issued = await exp.issueExpenseDoc(tenantId, systemId, doc.id);
  if (!issued.ok) throw new Error(`ออกเอกสารจ่าย ${b.vendor} ไม่สำเร็จ: ${issued.reason}`);
  const row = await prisma.accountDocument.findUniqueOrThrow({ where: { id: doc.id }, select: { grandTotal: true } });
  assertEq(`ยอดเอกสารจ่าย ${b.vendor} ${issued.docNo}`, row.grandTotal, b.grand);
  if (b.pay) {
    const r = await exp.recordVendorPayment(tenantId, systemId, doc.id, {
      paidAt: D(b.pay.paidAt),
      channel: "TRANSFER",
      financeAccountId: finId[b.pay.fin],
      amount: b.pay.amount,
      createdById: owner.id,
    });
    if (!r.ok) throw new Error(`บันทึกจ่าย ${b.vendor} ไม่สำเร็จ: ${r.reason}`);
  }
  return doc.id;
}
for (const b of OPEN_BILLS) await makeBill(b);
for (const b of PAID_BILLS) await makeBill(b);
console.log(`🧾 เอกสารฝั่งจ่าย ${OPEN_BILLS.length + PAID_BILLS.length} ใบ (ค้างจ่าย ${OPEN_BILLS.length})`);

// ─────────────────────────── 9. อ่านผลจริงกลับมา + เขียนเฉลย ───────────────────────────

const stats = await svc.overviewStats(tenantId, systemId);
const pay = await exp.payableStats(tenantId, systemId);
const balances = await fin.financeBalances(tenantId, systemId);
const balByName = new Map(balances.map((b) => [b.name, b.balance]));

assertEq("ค้างรับ (จาก DB)", stats.receivable, 48_630_000);
assertEq("พ้นกำหนด (จาก DB)", stats.overdueAmount, 12_840_000);
assertEq("จำนวนใบพ้นกำหนด (จาก DB)", stats.overdueCount, 4);
assertEq("ค้างจ่าย (จาก DB)", pay.payable, 21_275_000);
for (const f of FIN_DEF) assertEq(`ยอดคงเหลือ ${f.name}`, balByName.get(f.name) ?? 0, FIN_TARGET[f.code as keyof typeof FIN_TARGET]);

const invoices = await prisma.accountDocument.findMany({
  where: { tenantId, systemId, docType: "INVOICE" },
  select: { status: true, dueDate: true, validUntil: true },
});
const tabs = {
  all: invoices.length,
  draft: invoices.filter((d) => d.status === "DRAFT").length,
  awaiting: invoices.filter((d) => d.status === "AWAITING_PAYMENT" && !svc.isOverdue(d)).length,
  partial: invoices.filter((d) => d.status === "PARTIAL" && !svc.isOverdue(d)).length,
  paid: invoices.filter((d) => d.status === "PAID").length,
  overdue: invoices.filter((d) => svc.isOverdue(d)).length,
  cancelled: invoices.filter((d) => d.status === "CANCELLED" || d.status === "VOIDED").length,
};
assertEq("แท็บ ทั้งหมด", tabs.all, 51);
assertEq("แท็บ ร่าง", tabs.draft, 3);
assertEq("แท็บ รอชำระ", tabs.awaiting, 12);
assertEq("แท็บ ชำระบางส่วน", tabs.partial, 2);
assertEq("แท็บ ชำระแล้ว", tabs.paid, 29);
assertEq("แท็บ พ้นกำหนด", tabs.overdue, 4);
assertEq("แท็บ ยกเลิก", tabs.cancelled, 1);

const allContacts = await svc.listContacts(tenantId, systemId, { includeArchived: true });
const contacts = {
  all: allContacts.length,
  customer: allContacts.filter((c) => c.kind === "CUSTOMER").length,
  vendor: allContacts.filter((c) => c.kind === "VENDOR").length,
  archived: allContacts.filter((c) => c.archivedAt !== null).length,
  active: allContacts.filter((c) => c.archivedAt === null).length,
};
assertEq("ผู้ติดต่อทั้งหมด", contacts.all, 63);
assertEq("ลูกค้า", contacts.customer, 41);
assertEq("ผู้ขาย", contacts.vendor, 22);
assertEq("ผู้ติดต่อที่เก็บเข้ากรุ", contacts.archived, 5);

const tb = await (await import("@/lib/modules/account/reports")).trialBalance({ tenantId, systemId }, "2026-01", "2026-12");
if (!tb.balanced) throw new Error("งบทดลองไม่สมดุล");
const needsReview = await prisma.accountJournalEntry.count({ where: { systemId, needsReview: true } });
if (needsReview > 0) throw new Error(`มี JV ที่ต้องตรวจ (needsReview) ${needsReview} รายการ`);
const suspense = await prisma.accountLedger.findFirst({ where: { systemId, code: "9999" }, select: { id: true } });
const susAgg = suspense
  ? await prisma.accountJournalLine.aggregate({ where: { systemId, accountId: suspense.id }, _sum: { debit: true, credit: true } })
  : null;
const suspenseNet = (susAgg?._sum.debit ?? 0) - (susAgg?._sum.credit ?? 0);
if (suspenseNet !== 0) throw new Error(`บัญชีพัก 9999 ไม่เป็นศูนย์ (${suspenseNet})`);

fixtures.contactC00019Id = cid("ปิยธิดา อินสุ่ม");
fixtures.contactNattapholId = cid("คุณณัฐพล รุ่งเรือง");
fixtures.contactSimilanViewId = cid("โรงแรมสิมิลันวิว");

const expected = {
  _readme:
    "เฉลยชุดเดียวของงานบัญชี V2 — เขียนโดย scripts/seed-acc-v2-qc.mts ทุกครั้งที่ seed · จำนวนเงินเป็นสตางค์ (integer)",
  generatedAt: new Date().toISOString(),
  today: QC.today,
  oracleValidUntil: QC.oracleValidUntil,
  tenantId,
  tenantName: QC.tenantName,
  ownerEmail: QC.ownerEmail,
  ownerUserId: owner.id,
  unitId: unit.id,
  systemId,
  systems: {
    ACCOUNT: accSys.id,
    POS: posSys.id,
    INVENTORY: invSys.id,
    MEMBER: memSys.id,
    CRM: crmSys.id,
  },
  receivable: 48_630_000,
  receivableDocs: 18,
  receivableCustomers: 14,
  overdueAmount: 12_840_000,
  overdueDocs: 4,
  payable: 21_275_000,
  payableDocs: 9,
  payableVendors: 7,
  payableOverdueDocs: 2,
  finance: {
    CSH001: FIN_TARGET.CSH001,
    BSV001: FIN_TARGET.BSV001,
    EWL001: FIN_TARGET.EWL001,
    PTY001: FIN_TARGET.PTY001,
    total: 128_456_000,
  },
  financeAccounts: FIN_DEF.map((f) => ({
    code: f.code,
    id: finId[f.code],
    name: f.name,
    type: f.type,
    opening: finOpening[f.code],
    balance: FIN_TARGET[f.code as keyof typeof FIN_TARGET],
  })),
  invoiceTabs: { all: 51, draft: 3, awaiting: 12, partial: 2, paid: 29, overdue: 4, cancelled: 1 },
  contacts: { all: 63, customer: 41, vendor: 22, archived: 5, active: 58 },
  products: 12,
  journal: { needsReview: 0, suspense9999: 0, trialBalanceBalanced: true },
  fixtures: {
    ...fixtures,
    contactC00019Name: "ปิยธิดา อินสุ่ม",
    contactC00019Code: "C00019",
    invPiyathidaGrand: 3_840_000,
    invPiyathidaIssue: "2026-08-12",
    invPiyathidaDue: "2026-08-26",
    invNattapholGrand: 2_490_000,
    invNattapholSubTotal: 2_327_103,
    invNattapholVat: 162_897,
    depositNattapholGrand: 1_000_000,
    invSimilanViewGrand: 12_450_000,
    invSimilanViewPaid: 6_225_000,
    invSimilanViewRemain: 6_225_000,
  },
};
writeFileSync(QC.expectedPath, `${JSON.stringify(expected, null, 2)}\n`);

console.log(`\n✅ seed เสร็จ — เขียนเฉลยลง ${QC.expectedPath} · ACC_V2_SEED=created`);
console.log("   ⚠️ เฉลยหน้าหลัก (คีย์ dashboard) ถูกเขียนทับไปด้วย — รันต่อ: QC_ENV_FILE=.env.qc pnpm tsx scripts/acc-v2-expected-dashboard.mts");
console.log(`   ค้างรับ ฿${bahtStr(stats.receivable)} · ${stats.overdueCount} ใบพ้นกำหนด ฿${bahtStr(stats.overdueAmount)}`);
console.log(`   ค้างจ่าย ฿${bahtStr(pay.payable)} · เงินคงเหลือรวม ฿${bahtStr(sum(balances.map((b) => b.balance)))}`);
console.log(`   ระบบบัญชี /app/sys/${systemId}`);
await prisma.$disconnect();
