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
//   ค้างรับ 494,300.00 · 20 ใบ · 14 ลูกค้า      พ้นกำหนด 128,400.00 · 4 ใบ
//   ค้างจ่าย 214,750.00 · 10 ใบ · 7 ผู้ขาย
//   ช่องทางการเงิน 4: 86,400 · 901,800 · 265,860 · 29,700 (รวม 1,283,760 — WO 5.2: เติม/เบิกชดเชยสำรองจ่าย)
//   ใบแจ้งหนี้ 53 ใบ: ร่าง 3 · รอชำระ 14 (2 ใบครบกำหนดเดือนนี้ — WO 5.2 round 2) · บางส่วน 2 · ชำระแล้ว 29 · พ้นกำหนด 4 · ยกเลิก 1
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
const coa = await import("@/lib/modules/account/coa"); // WO 2.2: ปักหมุด "บัญชีที่ติดตาม" (ผังบัญชี) ให้ตรง f1
const contactsList = await import("@/lib/modules/account/contacts-list"); // WO 3.2: กลุ่มผู้ติดต่อ
const mem = await import("@/lib/modules/member/service"); // WO 3.2: สาธิตป้าย "สมาชิก" (เชื่อม Party)
const crm = await import("@/lib/modules/crm/service"); // WO 3.2: สาธิตป้าย "CRM" (เชื่อม Party)
const inv = await import("@/lib/modules/inventory/service"); // WO 4.1: สินค้าที่ "ติดตามสต็อกในคลัง"
const invLink = await import("@/lib/modules/account/inventory-link"); // WO 4.1: ผูกสินค้าบัญชี ↔ InvItem
const pos = await import("@/lib/modules/pos/service"); // WO 4.2: บิลขายหน้าร้าน (POS ส่งบรรทัดเข้าบัญชี)
const finOv = await import("@/lib/modules/account/finance-overview"); // WO 5.2: เติมเงิน/เบิกชดเชยสำรองจ่าย
const { drainAll } = await import("@/lib/outbox-consumers"); // WO 4.2: ระบายคิว outbox ให้ bridge ทำงานทันที
const wht = await import("@/lib/modules/account/wht"); // WO 5.4: ภาษีหัก ณ ที่จ่าย 2 ขา V2
const chq = await import("@/lib/modules/account/cheque"); // WO 5.4: ทะเบียนเช็ค V2

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

// WO 4.3 §8.3 — หน่วยเริ่มต้น 12 หน่วย (มีรหัส PU/SU + ชื่ออังกฤษ) · idempotent
const unitSeed = await prod.seedUnits(tenantId, systemId);
// หน่วยเฉพาะร้านดำน้ำที่ไม่อยู่ในชุดเริ่มต้น
for (const u of ["ตัว", "คู่", "ถัง"]) {
  await prod.createUnit(tenantId, systemId, u, { kind: "PRODUCT" });
}
const units = new Map((await prod.listUnits(tenantId, systemId)).map((u) => [u.name, u.id]));
console.log(`📏 หน่วยนับ ${units.size} หน่วย (ชุดเริ่มต้น §8.3 สร้างใหม่ ${unitSeed.created} · เติมรหัสให้ของเดิม ${unitSeed.filled})`);

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

// ── WO 4.1: สินค้า 2 ตัวใน 12 ตัวเดิม "ติดตามสต็อกในคลัง" (จำนวนสินค้ายังเท่าเดิม = 12) ──
// ตั้งสต็อกด้วย `adjust` (นับสต็อก) ไม่ใช่ `receive` — ตั้งใจ: ADJUST ไม่โพสต์ GL
//   ⇒ งบ/หน้าหลัก/ภาพรวม ของชุดข้อมูล QC ไม่ขยับแม้แต่บาทเดียว (เฉลยเดิมทุกใบยังใช้ได้)
// ต้นทุนใน item ตั้งให้ **เท่ากับ** buyPrice ของสินค้าบัญชีเป๊ะ ⇒ sync แล้วไม่มีอะไรเปลี่ยน (idempotent)
const invCtx = { tenantId, systemId: invSys.id };
const LINKED_STOCK: { sku: string; onHand: number }[] = [
  { sku: "MASK-01", onHand: 24 }, // หน้ากากดำน้ำ Aqualung · ต้นทุน 1,680.00
  { sku: "TANK-12", onHand: 9 }, // ถังอากาศ 12 ลิตร · ต้นทุน 5,200.00
];
const linkedItems: { sku: string; itemId: string; onHand: number; costSatang: number }[] = [];
for (const l of LINKED_STOCK) {
  const src = PRODUCTS.find((p) => p.sku === l.sku)!;
  const item = await inv.createItem(invCtx, {
    sku: l.sku,
    name: src.name,
    unitLabel: src.unit,
    kind: "PRODUCT",
    costSatang: src.buy ?? 0,
    reorderPoint: 5,
  });
  await inv.adjust(invCtx, { itemId: item.id, newQty: l.onHand, idempotencyKey: `seed-acc-v2-stock-${l.sku}`, note: "ยอดยกมา (ชุดข้อมูล QC)" });
  const link = await invLink.linkProductToItem({ tenantId, systemId }, productIds.get(l.sku)!, { itemId: item.id });
  if (!link.ok) throw new Error(`ผูกสินค้า ${l.sku} กับคลังไม่สำเร็จ: ${link.reason}`);
  linkedItems.push({ sku: l.sku, itemId: item.id, onHand: l.onHand, costSatang: src.buy ?? 0 });
}
console.log(`🔗 ผูกคลังสินค้า ${linkedItems.length} รายการ (${linkedItems.map((i) => `${i.sku}=${i.onHand}`).join(" · ")})`);

// ── WO 4.3 §8.2: รายการจัดชุด 1 ชุด (สินค้ารวมเป็น 13) ──
// ชุด "ดำน้ำตื้นครบเซ็ต" = หน้ากาก 1 + ถังอากาศ 1 (ทั้งคู่ผูกคลัง ⇒ ขายชุด 1 = สต็อกทั้งสองลด 1)
const bundleRes = await prod.createProduct(tenantId, systemId, {
  sku: "SET-SNK",
  name: "ชุดดำน้ำตื้นครบเซ็ต (หน้ากาก + ถังอากาศ)",
  type: "BUNDLE",
  unitId: units.get("ชุด") ?? null,
  salePrice: 1_000_000, // ราคาชุด ฿10,000.00 (ถูกกว่าซื้อแยก 285,000 + 780,000)
  vatRateBp: 700,
  category: "ชุดอุปกรณ์",
});
if (!bundleRes.ok) throw new Error(`สร้างรายการจัดชุดไม่สำเร็จ: ${bundleRes.reason}`);
productIds.set("SET-SNK", bundleRes.id);
const BUNDLE_RECIPE = [
  { sku: "MASK-01", qty: 1 },
  { sku: "TANK-12", qty: 1 },
];
const bundleSet = await prod.setBundleItems(
  tenantId,
  systemId,
  bundleRes.id,
  BUNDLE_RECIPE.map((c) => ({ componentProductId: productIds.get(c.sku)!, qty: c.qty })),
);
if (!bundleSet.ok) throw new Error(`ตั้งส่วนประกอบของชุดไม่สำเร็จ: ${bundleSet.reason}`);
console.log(`🎁 รายการจัดชุด 1 ชุด (${bundleRes.code}) · ส่วนประกอบ ${bundleSet.count} รายการ`);

// ── WO 4.3 §8.2: ยอดยกมา 1 lot ของสินค้าที่ไม่ผูกคลัง (สมุดบันทึกการดำน้ำ) ──
// Dr 1200 สินค้าคงเหลือ / Cr 3999 ยอดยกมา = 50 × ฿180.00 = ฿9,000.00 (งบดุลขยับ · P&L ไม่ขยับ)
const OPENING_LOT = { sku: "LOGBK-01", qty: 50, unitCost: 18_000, date: "2026-01-01" };
const openingRes = await prod.addOpeningLot(tenantId, systemId, productIds.get(OPENING_LOT.sku)!, {
  lotDate: D(OPENING_LOT.date),
  qty: OPENING_LOT.qty,
  unitCost: OPENING_LOT.unitCost,
});
if (!openingRes.ok) throw new Error(`ยอดยกมาไม่สำเร็จ: ${openingRes.reason}`);
console.log(`📥 ยอดยกมา ${OPENING_LOT.sku} ${OPENING_LOT.qty} ชิ้น × ฿${bahtStr(OPENING_LOT.unitCost)} = ฿${bahtStr(openingRes.amount)}`);

// ── WO 4.3 §8.4: ใบปรับต้นทุนสินค้า 1 ใบ (CA) ──
// หน้ากากดำน้ำ: ต้นทุน 1,680.00 → 1,750.00 · คงเหลือ 24 ⇒ กำไรจากการปรับ 24 × ฿70.00 = ฿1,680.00
// JV: Dr 1200 / Cr 5310 (กำไร/ขาดทุนจากการปรับมูลค่าสินค้า)
const CA_FIXTURE = { sku: "MASK-01", newCost: 175_000, date: "2026-09-28" };
const caRes = await prod.createCostAdjustment({
  tenantId,
  systemId,
  productId: productIds.get(CA_FIXTURE.sku)!,
  newCostSatang: CA_FIXTURE.newCost,
  issueDate: D(CA_FIXTURE.date),
  reason: "ต้นทุนซื้อเปลี่ยน",
  note: "ผู้ขายปรับราคาหน้ากากขึ้น",
});
if (!caRes.ok) throw new Error(`ใบปรับต้นทุนไม่สำเร็จ: ${caRes.reason}`);
console.log(
  `🧮 ใบปรับต้นทุน ${caRes.docNo} · ${CA_FIXTURE.sku} ฿${bahtStr(caRes.oldCost)} → ฿${bahtStr(caRes.newCost)} × ${caRes.qty} = ฿${bahtStr(caRes.delta)}`,
);
// ต้นทุนของ item ที่ผูกไว้ขยับตามใบปรับต้นทุน → เฉลย `inventory.linked` ต้องตามด้วย (ไม่งั้น QC โกหก)
{
  const li = linkedItems.find((i) => i.sku === CA_FIXTURE.sku);
  if (li) li.costSatang = caRes.newCost;
}

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
    // WO 3.2 🐞 บั๊กที่เจอ: เดิมทั้งลูกค้า+ผู้ขายใช้สูตรเบอร์เดียวกัน "076" + seq (seq เริ่ม 1 ใหม่ทั้งคู่)
    // ⇒ ลูกค้าลำดับ 9/19 กับผู้ขายลำดับ 9/19 ได้เบอร์ชนกันเป๊ะ (ผู้เสียภาษีคนละเลขแต่เบอร์เดียวกัน) — WO 3.1
    // Party จับคู่ด้วย phoneNorm เป็นลำดับรอง (ไม่พบ taxId ก่อน) จึงรวมนิติบุคคลคนละรายเป็น Party เดียวกันผิด ๆ
    // (เจอจาก WO 3.2 P3 "ที่มา": สมาชิก/CRM นับได้ 2 ราย ทั้งที่ตั้งใจสาธิตแค่รายละ 1) → แยกรหัสพื้นที่ตามชนิด
    phone: `${kind === "CUSTOMER" ? "076" : "077"}${String(100000 + seq).slice(-6)}`,
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

// ─────────────────────────── 4.5 กลุ่มผู้ติดต่อกำหนดเอง + สาธิตป้าย "ที่มา" (WO 3.2 §7.1) ───────────────────────────
// ตัวเลขกลุ่มกำหนดเองไม่ใช่เฉลยที่ BLUEPRINT บังคับ (บังคับแค่ 63/41/12/22/5 ของกลุ่มมาตรฐาน) — เลือกสมาชิกให้สมเหตุสมผล
const ctx = { tenantId, systemId };
const gVip = await contactsList.createContactGroup(ctx, { name: "ลูกค้า VIP", color: "accent" });
await contactsList.addContactsToGroup(ctx, gVip.id, [
  cid("ปิยธิดา อินสุ่ม"),
  cid("โรงแรมสิมิลันวิว"),
  cid("บริษัท อันดามัน ทราเวล จำกัด"),
  cid("บริษัท เกาะพีพี แอดเวนเจอร์ จำกัด"),
  cid("บริษัท เจ็ตสกี ภูเก็ต จำกัด"),
]);
const gHotel = await contactsList.createContactGroup(ctx, { name: "โรงแรมพันธมิตร", color: "muted" });
await contactsList.addContactsToGroup(ctx, gHotel.id, [
  cid("โรงแรมสิมิลันวิว"),
  cid("โรงแรมกะตะบีชรีสอร์ท"),
  cid("โรงแรมกมลาเบย์"),
  cid("โรงแรมในหานวิลล่า"),
]);
const gSupplier = await contactsList.createContactGroup(ctx, { name: "ซัพพลายเออร์หลัก", color: "strong" });
await contactsList.addContactsToGroup(ctx, gSupplier.id, [
  cid("บริษัท สยามแก๊ส อินดัสทรี จำกัด"),
  cid("บริษัท อควาเทค อุปกรณ์ดำน้ำ จำกัด"),
  cid("บริษัท ภูเก็ตปิโตรเลียม จำกัด"),
  cid("บริษัท ครัวทะเลใต้ เคเทอริ่ง จำกัด"),
]);
console.log(`🗂️  กลุ่มผู้ติดต่อกำหนดเอง 3 กลุ่ม (VIP 5 · โรงแรมพันธมิตร 4 · ซัพพลายเออร์หลัก 4)`);

// ป้าย "สมาชิก"/"CRM" (§7.1 "ที่มา") มาจาก Customer/CrmContact ที่ partyId เดียวกับ AccountContact (WO 3.1 Party)
// ใช้เบอร์เดียวกับที่ mkContact สร้างให้ผู้ติดต่อเดิม → party.safeFindOrCreate จับคู่ Party เดิมผ่าน phoneNorm
// (ไม่ใช่สร้าง Party ใหม่ซ้อน) — พิสูจน์ badge "สมาชิก"/"CRM" ในหน้าผู้ติดต่อจากข้อมูลจริง ไม่ใช่ค่า mock
const piyathidaPhone = `076${String(100000 + 19).slice(-6)}`; // ปิยธิดา อินสุ่ม = ลูกค้าลำดับ 19 (C00019)
const somchaiPhone = `076${String(100000 + 9).slice(-6)}`; // คุณสมชาย ใจดี = ลูกค้าลำดับ 9
const piyathidaMember = await mem.findOrCreate({ tenantId, memberSystemId: memSys.id, phone: piyathidaPhone, name: "ปิยธิดา อินสุ่ม", source: "STAFF" });
await crm.createContact({ tenantId, systemId: crmSys.id }, { name: "คุณสมชาย ใจดี", phone: somchaiPhone });
console.log(`🔗 สาธิตป้าย "ที่มา": สมาชิก 1 ราย (ปิยธิดา อินสุ่ม) · CRM 1 ราย (คุณสมชาย ใจดี)`);

// ─────────────────────────── 5. แผนเอกสาร (คิดยอดให้ครบก่อนแตะ DB) ───────────────────────────

type PayPlan = { fin: "CSH001" | "BSV001" | "EWL001"; amount: number; paidAt: string };
type InvPlan = {
  cust: string;
  grand: number;
  issue: string;
  // string = D(due) (10:00 BKK ปกติ) · Date = ใช้ตรง ๆ (WO 5.2 round 2: ต้องคุมเวลาแม่นกว่าวันเดียว —
  // ครบกำหนด "ท้ายเดือน" ต้องอยู่หลัง QC.today 12:00 ไม่งั้นเฉลย acc-v2-expected-dashboard.mts (NOW ตรึงที่
  // 2026-09-30T12:00) จะนับเป็น "พ้นกำหนดแล้ว" ปนเข้าไทล์ overdue โดยไม่ตั้งใจ)
  due: string | Date;
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
  // WO 5.2 round 2 (coordinator feedback) — 2 ใบเพิ่ม ครบกำหนด "เดือนนี้" (ไม่ใช่ พ.ย./ธ.ค. เหมือนใบอื่น) เพื่อให้ไทล์
  // "คาดว่าจะเข้า" ของหน้าภาพรวมการเงิน (f7 §10.2) มีตัวเลขจริงให้ทดสอบ — ใช้ลูกค้าเดิมที่มีอยู่แล้ว (ไม่เพิ่มผู้ติดต่อใหม่
  // ⇒ ไม่กระทบ receivableCustomers/contacts count) · ยอดเล็ก ๆ ⇒ กระทบแค่ receivable/receivableDocs/invoiceTabs
  // due = เย็นวันที่ 30 ก.ย. (หลัง QC.today 12:00 ที่ acc-v2-expected-dashboard.mts ตรึงไว้เป็น "วันนี้")
  // เพื่อให้อยู่ในเดือนนี้แน่ ๆ แต่ "ยังไม่พ้นกำหนด" ตามเฉลย — ดูหมายเหตุที่ type InvPlan.due
  { cust: "คุณพิมพ์ชนก วัฒนสุข", grand: 500_000, issue: "2026-09-24", due: new Date("2026-09-30T20:00:00+07:00"), desc: "ค่าเช่าอุปกรณ์ดำน้ำเพิ่มเติม (ครบกำหนดเดือนนี้)", bucket: "awaiting" },
  { cust: "บริษัท เกาะพีพี แอดเวนเจอร์ จำกัด", grand: 300_000, issue: "2026-09-25", due: new Date("2026-09-30T21:00:00+07:00"), desc: "ค่าธรรมเนียมทริปเสริม (ครบกำหนดเดือนนี้)", bucket: "awaiting" },
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
  due: string | Date; // ดูหมายเหตุที่ InvPlan.due
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
  // WO 5.2 round 2 — 1 ใบเพิ่ม ครบกำหนด "เดือนนี้" ให้ไทล์ "คาดว่าจะออก" มีตัวเลขจริง (เหตุผลเดียวกับฝั่งรับด้านบน)
  // due = เย็นวันที่ 30 ก.ย. (ดูหมายเหตุที่ type BillPlan.due / InvPlan.due ด้านบน)
  { vendor: "บริษัท เซฟตี้เฟิร์ส อุปกรณ์นิรภัย จำกัด", grand: 200_000, issue: "2026-09-23", due: new Date("2026-09-30T22:00:00+07:00"), desc: "ชุดปฐมพยาบาลเพิ่มเติม (ครบกำหนดเดือนนี้)", docType: "PURCHASE" },
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
assertEq("ค้างรับตามแผน", receivablePlan, 49_430_000);
assertEq("พ้นกำหนดตามแผน", sum(OVERDUE.map((d) => d.grand)), 12_840_000);
assertEq("ค้างจ่ายตามแผน", sum(OPEN_BILLS.map((d) => d.grand)), 21_475_000);
assertEq("จำนวนใบแจ้งหนี้ตามแผน", OVERDUE.length + AWAITING.length + PARTIAL.length + PAID_SPEC.length + DRAFTS.length + 1, 53);
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
// WO 5.1 — BSV001 ยกมาเป็น 2 รายการ (แทนก้อนเดียว) พิสูจน์ "ยอดยกมาหลายรายการ" → 2 JV แยกกัน ผลรวมเท่าเดิม
// (ยอดรวม/ยอดกลุ่มของ BSV001 ต้องไม่ขยับ — split คงที่ 5,000 บาท ก้อนที่สอง)
const SPLIT_OPENING_CODE = "BSV001";
const SPLIT_SECOND_SATANG = 500_000; // 5,000.00 บาท
for (const f of FIN_DEF) {
  const opening = FIN_TARGET[f.code as keyof typeof FIN_TARGET] - flow[f.code];
  if (opening < 0) throw new Error(`ยอดยกมาของ ${f.code} ติดลบ (${opening}) — ปรับแผนการชำระ`);
  finOpening[f.code] = opening;
  const openingEntries =
    f.code === SPLIT_OPENING_CODE
      ? [
          { date: D(f.openDate), amountSatang: opening - SPLIT_SECOND_SATANG, note: "ยอดยกมาจากระบบเดิม" },
          { date: D("2026-02-20"), amountSatang: SPLIT_SECOND_SATANG, note: "เงินโอนรับล่วงหน้า" },
        ]
      : opening !== 0
        ? [{ date: D(f.openDate), amountSatang: opening, note: null }]
        : [];
  const r = await fin.createFinanceAccount({
    tenantId,
    systemId,
    type: f.type,
    code: f.code, // WO 5.1: รหัสช่องทางตอนนี้ persist จริง (ก่อนหน้านี้เป็นแค่ key ในสคริปต์ seed)
    name: f.name,
    bankName: f.bank,
    accountNo: f.no,
    promptpayId: f.pp,
    openingEntries, // คนละงวด (openDate ต่าง เดือนกัน) — เดิมพึ่ง postOpening (1 ครั้ง/งวดทั้งระบบ) ตอนนี้ใช้ gl.postFinanceOpening (idempotent ต่อรายการ) ไม่ติดข้อจำกัดนั้นแล้ว
    showOnDocuments: f.type !== "PETTY_CASH",
    // WO 5.1 — สำรองรับ-จ่าย ต้องมีวงเงิน/ผู้ถือ (g9: "วงเงิน ฿20,000.00 · ผู้ถือ …") ไม่งั้นการ์ดโชว์ "วงเงิน ฿0.00" หลอกตา
    limitSatang: f.type === "PETTY_CASH" ? FIN_TARGET.PTY001 : undefined,
    holderUserId: f.type === "PETTY_CASH" ? owner.id : undefined,
  });
  if (!r.ok) throw new Error(`สร้างช่องทางการเงิน ${f.name} ไม่สำเร็จ: ${r.reason}`);
  finId[f.code] = r.id;
  console.log(`💳 ${f.code} ${f.name} · ยอดยกมา ฿${bahtStr(opening)}`);
}

// WO 5.1 — ช่องทางปิดใช้งาน 1 บัญชี (ยอด 0 ตั้งแต่สร้าง → archive ผ่านได้ทันที) พิสูจน์ว่าไม่นับเข้ายอดรวม/รายการ
const archivedFin = await fin.createFinanceAccount({
  tenantId,
  systemId,
  type: "BANK",
  name: "ธนาคารกรุงเทพ (เลิกใช้)",
  bankName: "ธนาคารกรุงเทพ",
  accountNo: "999-0-00000-0",
  showOnDocuments: false,
});
if (!archivedFin.ok) throw new Error(`สร้างช่องทางตัวอย่าง (ปิดใช้งาน) ไม่สำเร็จ: ${archivedFin.reason}`);
const archiveRes = await fin.archiveFinanceAccount(tenantId, systemId, archivedFin.id);
if (!archiveRes.ok) throw new Error(`ปิดใช้งานช่องทางตัวอย่างไม่สำเร็จ: ${archiveRes.reason}`);
console.log(`🗄️  ${archivedFin.code} ธนาคารกรุงเทพ (เลิกใช้) · ปิดใช้งานแล้ว (ไม่นับในยอดรวม)`);

// WO 2.2 (Fable QC ภาพจริง): ปักหมุด "บัญชีเงินที่ติดตาม" ให้ตรง f1 — กสิกรไทย ออมทรัพย์ · เงินสด · พร้อมเพย์
// (เงินสดย่อยไม่ปักหมุด ตามภาพ) · idempotent — เรียกซ้ำแล้วแทนที่ทั้งชุดเสมอ ไม่สะสม
{
  const pinFin = await fin.setPinnedFinanceAccounts(tenantId, systemId, [finId["BSV001"], finId["CSH001"], finId["EWL001"]]);
  if (!pinFin.ok) throw new Error(`ปักหมุดบัญชีเงินไม่สำเร็จ: ${pinFin.reason}`);
  console.log(`📌 ปักหมุดบัญชีเงินที่ติดตาม: กสิกรไทย ออมทรัพย์ · เงินสด · พร้อมเพย์`);

  // "บัญชีที่ติดตาม" (ผังบัญชี) — รายได้จากการขายสินค้า (4000) + ซื้อสินค้า/ต้นทุนขาย (5000)
  const pinLedgers = await prisma.accountLedger.findMany({
    where: { systemId, code: { in: ["4000", "5000"] } },
    select: { id: true, code: true },
  });
  if (pinLedgers.length !== 2) throw new Error(`หาบัญชี 4000/5000 ไม่ครบ (เจอ ${pinLedgers.length}) — ปักหมุดผังบัญชีไม่ได้`);
  const pinLedger = await coa.setPinnedLedgerAccounts({ tenantId, systemId }, pinLedgers.map((l) => l.id));
  if (!pinLedger.ok) throw new Error(`ปักหมุดผังบัญชีไม่สำเร็จ: ${pinLedger.reason}`);
  console.log(`📌 ปักหมุดบัญชีที่ติดตาม: 4000 รายได้จากการขายสินค้า · 5000 ซื้อสินค้า/ต้นทุนขาย`);
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
    dueDate: p.due instanceof Date ? p.due : D(p.due),
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
    dueDate: b.due instanceof Date ? b.due : D(b.due),
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

// ─────────────────────────── 8.5 สำรองรับ-จ่าย (WO 5.2 · §10.3) ───────────────────────────
// เติมเงิน 1 ครั้ง (internal transfer — ไม่กระทบยอดรวม) + ค่าใช้จ่าย 2 รายการเล็ก ๆ จ่ายจาก PTY001
// (1 เบิกชดเชยแล้ว · 1 ค้างเบิก) — ตัวเลขบันทึกไว้ใน wo-notes/5.2.md หัวข้อ "ตัวเลขที่จะเปลี่ยนจาก seed"
const PETTY_TOPUP_SATANG = 1_000_000; // 10,000.00 ฿ BSV001 → PTY001
const PETTY_EXPENSE_A_SATANG = 50_000; // 500.00 ฿ "ค่าอาหารว่างประชุม" — เบิกชดเชยแล้ว
const PETTY_EXPENSE_B_SATANG = 30_000; // 300.00 ฿ "ค่าจอดรถ" — ค้างเบิก (pending)

const pettyTopUp = await finOv.topUpPettyCash(tenantId, systemId, {
  pettyId: finId["PTY001"],
  sourceFinanceId: finId["BSV001"],
  amount: PETTY_TOPUP_SATANG,
  date: D("2026-09-10"),
  note: "เติมเงินสำรองจ่ายประจำเดือน",
});
if (!pettyTopUp.ok) throw new Error(`เติมเงินสำรองจ่ายไม่สำเร็จ: ${pettyTopUp.reason}`);

const miscAccount = ledgers.find((a) => a.code === "6900") ?? expenseAccounts[0];
async function makePettyExpense(desc: string, grand: number, issue: string): Promise<string> {
  const auto = docLines(grand, desc);
  const doc = await exp.createExpenseDoc({
    tenantId,
    systemId,
    docType: "EXPENSE",
    issueDate: D(issue),
    vatMode: auto.vatMode,
    vatPurchaseMode: "CLAIM",
    lines: auto.lines.map((l) => ({ ...l, accountId: miscAccount.id })),
    createdById: owner.id,
  });
  const issued = await exp.issueExpenseDoc(tenantId, systemId, doc.id);
  if (!issued.ok) throw new Error(`ออกเอกสารค่าใช้จ่ายสำรองจ่าย "${desc}" ไม่สำเร็จ: ${issued.reason}`);
  const pay = await exp.recordVendorPayment(tenantId, systemId, doc.id, {
    paidAt: D(issue),
    channel: "CASH",
    financeAccountId: finId["PTY001"],
    amount: grand,
    createdById: owner.id,
  });
  if (!pay.ok || !pay.paymentId) throw new Error(`บันทึกจ่ายค่าใช้จ่ายสำรองจ่าย "${desc}" ไม่สำเร็จ: ${!pay.ok ? pay.reason : "ไม่มี paymentId"}`);
  return pay.paymentId;
}

const pettyExpenseAPaymentId = await makePettyExpense("ค่าอาหารว่างประชุม", PETTY_EXPENSE_A_SATANG, "2026-09-12");
const pettyExpenseBPaymentId = await makePettyExpense("ค่าจอดรถ", PETTY_EXPENSE_B_SATANG, "2026-09-20");

const pettyReimburseA = await finOv.reimbursePettyCash(tenantId, systemId, {
  paymentId: pettyExpenseAPaymentId,
  sourceFinanceId: finId["BSV001"],
  date: D("2026-09-14"),
  note: "เบิกชดเชยค่าอาหารว่างประชุม",
});
if (!pettyReimburseA.ok) throw new Error(`เบิกชดเชยค่าอาหารว่างประชุมไม่สำเร็จ: ${pettyReimburseA.reason}`);
// (pettyExpenseBPaymentId ตั้งใจ "ไม่" เรียก reimbursePettyCash — ค้างเบิกไว้ตามแผน)

// ยอดสุดท้ายหลังบล็อกนี้ (ตรวจทวนกับ SQL อิสระใน qc-acc-v2-finance-overview.mts):
//   PTY001 = 2,000,000 (opening) + 1,000,000 (topup) − 50,000 (exp A) − 30,000 (exp B) + 50,000 (reimburse A)
//          = 2,970,000 สตางค์ (฿29,700.00)
//   BSV001 = 91,230,000 (opening target เดิม) − 1,000,000 (topup out) − 50,000 (reimburse out)
//          = 90,180,000 สตางค์ (฿901,800.00)
//   รวมทุกช่องทาง = 128,456,000 − 50,000 − 30,000 = 128,376,000 สตางค์ (฿1,283,760.00)
//   (เติมเงิน/เบิกชดเชย = โอนภายใน ไม่กระทบยอดรวม — ยอดรวมขยับแค่จาก 2 ค่าใช้จ่ายจริงเท่านั้น)
const PETTY_FINAL = {
  PTY001: FIN_TARGET.PTY001 + PETTY_TOPUP_SATANG - PETTY_EXPENSE_A_SATANG - PETTY_EXPENSE_B_SATANG + PETTY_EXPENSE_A_SATANG,
  BSV001: FIN_TARGET.BSV001 - PETTY_TOPUP_SATANG - PETTY_EXPENSE_A_SATANG,
};
assertEq("PTY001 หลังเติม/เบิกชดเชย (WO 5.2)", PETTY_FINAL.PTY001, 2_970_000);
assertEq("BSV001 หลังเติม/เบิกชดเชย (WO 5.2)", PETTY_FINAL.BSV001, 90_180_000);
console.log(`🐷 สำรองรับ-จ่าย: เติม ฿10,000 · ค่าใช้จ่าย 2 รายการ (เบิกชดเชยแล้ว 1) → PTY001 ฿${bahtStr(PETTY_FINAL.PTY001)} · BSV001 ฿${bahtStr(PETTY_FINAL.BSV001)}`);

// ─────────── 8.5 คู่ผู้ติดต่อซ้ำที่ "ตั้งใจใส่" (WO 3.4 · SPEC §7.3 · ภาพ g7-contact-merge.png) ───────────
//
// กติกาของใบสั่งงาน: **ผู้ติดต่อต้องยังเป็น 63 รายเท่าเดิม** ⇒ ไม่สร้างรายใหม่ แต่ทำให้ 2 รายที่มีอยู่แล้ว
// กลายเป็น "คู่ซ้ำ" จริง ๆ (เหมือนที่เกิดในร้านจริง: คีย์ซ้ำตอนออกบิลสาขา)
//   ตัวหลัก (เก็บไว้) = C00001 "บริษัท อันดามัน ทราเวล จำกัด" — สำนักงานใหญ่ 00000
//   ตัวรอง (ถูกรวม)  = C00007 เปลี่ยนชื่อเป็น "บจก. อันดามัน ทราเวล" + **เลขภาษีเดียวกับ C00001** + สาขา 00002
//
// 🔴 ทำไมต้องคนละ branchCode: DB มี partial unique index
//    `AccountContact_systemId_taxId_branchCode_active_key` (WHERE taxId IS NOT NULL AND archivedAt IS NULL)
//    ⇒ ผู้ติดต่อที่ยังใช้งานอยู่ 2 รายจะมี (taxId, branchCode) ซ้ำกันไม่ได้เลย
//    ⇒ "เลขภาษีเท่ากัน" ในโลกจริงจึงเป็นได้เฉพาะกรณี **เลขเดียวกันแต่คนละสาขา/สาขาไม่ตรง**
//    ⇒ `listMergeCandidates` จึงจับกลุ่มด้วย **เลขภาษีอย่างเดียว** (ไม่รวม branchCode) ต่างจาก
//       `party.findDuplicateCandidates` ที่รวม branchCode (ตาราง Party ไม่มี unique ตัวนี้) — จดไว้ใน wo-notes/3.4.md
const dupPrimaryId = cid("บริษัท อันดามัน ทราเวล จำกัด");
const dupSecondaryId = cid("บริษัท ทะเลใส ทัวร์ จำกัด");
const dupPrimaryRow = await prisma.accountContact.findUniqueOrThrow({
  where: { id: dupPrimaryId },
  select: { taxId: true, code: true },
});
await prisma.accountContact.update({
  where: { id: dupPrimaryId },
  data: { officeType: "HQ", branchCode: "00000" },
});
await prisma.accountContact.update({
  where: { id: dupSecondaryId },
  data: {
    name: "บจก. อันดามัน ทราเวล",
    taxId: dupPrimaryRow.taxId,
    branchCode: "00002",
    officeType: "BRANCH",
    branchName: "สาขาป่าตอง",
  },
});

// กลุ่ม: ตัวรองอยู่ทั้งกลุ่มที่ซ้ำกับตัวหลัก (ลูกค้า VIP → ต้องถูก **ลบทิ้ง** ตอนรวมเพราะ unique(groupId,contactId))
// และกลุ่มที่ตัวหลักไม่ได้อยู่ (โรงแรมพันธมิตร → ต้อง **ย้าย**) ⇒ ข้อสอบตรวจได้ทั้ง 2 กิ่ง
await contactsList.addContactsToGroup(ctx, gVip.id, [dupSecondaryId]);
await contactsList.addContactsToGroup(ctx, gHotel.id, [dupSecondaryId]);

// เอกสารของตัวรองให้ครบ 14 ใบ / ≥4 ชนิด — เพิ่ม 11 ใบเป็น **ร่าง (DRAFT) ทั้งหมด**
// (ร่างไม่ลง GL · ไม่นับเป็นค้างรับ/ค้างจ่าย · ไม่นับเป็น "เอกสารที่ออก" ⇒ ตัวเลขที่ BLUEPRINT ตรึงไว้
//  — ค้างรับ 486,300 · IV 51/3/12/2/29/4/1 · ยอดช่องทางเงิน 1,284,560 — ไม่ขยับแม้แต่สตางค์เดียว)
const DUP_DRAFTS: { docType: "QUOTATION" | "RECEIPT" | "TAX_INVOICE"; grand: number; issue: string; desc: string }[] = [
  { docType: "QUOTATION", grand: 1_800_000, issue: "2026-05-06", desc: "ร่าง: เสนอราคาทริปหมู่คณะ พ.ค." },
  { docType: "QUOTATION", grand: 2_100_000, issue: "2026-06-08", desc: "ร่าง: เสนอราคาทริปหมู่คณะ มิ.ย." },
  { docType: "QUOTATION", grand: 1_450_000, issue: "2026-07-03", desc: "ร่าง: เสนอราคาคอร์ส Open Water" },
  { docType: "QUOTATION", grand: 3_200_000, issue: "2026-08-04", desc: "ร่าง: เสนอราคาแพ็กเกจ 3 วัน" },
  { docType: "QUOTATION", grand: 2_650_000, issue: "2026-09-05", desc: "ร่าง: เสนอราคาทริปเกาะห้อง" },
  { docType: "RECEIPT", grand: 1_250_000, issue: "2026-06-20", desc: "ร่าง: ใบเสร็จรอตรวจ มิ.ย." },
  { docType: "RECEIPT", grand: 1_900_000, issue: "2026-07-21", desc: "ร่าง: ใบเสร็จรอตรวจ ก.ค." },
  { docType: "RECEIPT", grand: 2_350_000, issue: "2026-08-22", desc: "ร่าง: ใบเสร็จรอตรวจ ส.ค." },
  { docType: "RECEIPT", grand: 1_050_000, issue: "2026-09-09", desc: "ร่าง: ใบเสร็จรอตรวจ ก.ย." },
  { docType: "TAX_INVOICE", grand: 2_800_000, issue: "2026-08-25", desc: "ร่าง: ใบกำกับภาษีรอตรวจ ส.ค." },
  { docType: "TAX_INVOICE", grand: 1_600_000, issue: "2026-09-23", desc: "ร่าง: ใบกำกับภาษีรอตรวจ ก.ย." },
];
for (const d of DUP_DRAFTS) {
  const { vatMode, lines } = docLines(d.grand, d.desc);
  await svc.createDocument({
    tenantId,
    systemId,
    docType: d.docType,
    contactId: dupSecondaryId,
    issueDate: D(d.issue),
    vatMode,
    vatTiming: "ON_ISSUE",
    lines,
    createdById: owner.id,
  });
}

// กฎเอกสารประจำ 1 กฎของตัวรอง (ต้องถูกย้ายไปตัวหลักตอนรวม — ตาราง AccountRecurringRule)
const dupRule = await svc.createRecurringRule(
  tenantId,
  systemId,
  {
    name: "ค่าบริการรายเดือน (คู่ซ้ำสาธิต)",
    docType: "INVOICE",
    contactId: dupSecondaryId,
    template: { priceMode: "EXCLUDE_VAT", lines: docLines(1_200_000, "ค่าบริการรายเดือน").lines, tags: [] },
    frequency: "MONTHLY",
    dayOfMonth: 5,
    startDate: D("2026-10-05"),
    leadDays: 0,
    autoApprove: false,
    active: true,
  } as never,
  owner.id,
);
if (!dupRule.ok) throw new Error(`สร้างกฎเอกสารประจำของคู่ซ้ำไม่สำเร็จ: ${dupRule.reason}`);

{
  const [docs, jv, groups, rules] = await Promise.all([
    prisma.accountDocument.count({ where: { tenantId, systemId, contactId: dupSecondaryId } }),
    prisma.accountJournalLine.count({ where: { systemId, contactId: dupSecondaryId } }),
    prisma.accountContactGroupMember.count({ where: { systemId, contactId: dupSecondaryId } }),
    prisma.accountRecurringRule.count({ where: { systemId, contactId: dupSecondaryId } }),
  ]);
  assertEq("คู่ซ้ำ: เอกสารของตัวรอง", docs, 14);
  assertEq("คู่ซ้ำ: บรรทัดสมุดรายวันของตัวรอง", jv, 1);
  assertEq("คู่ซ้ำ: กลุ่มของตัวรอง", groups, 2);
  assertEq("คู่ซ้ำ: กฎเอกสารประจำของตัวรอง", rules, 1);
  console.log(`👯 คู่ผู้ติดต่อซ้ำที่ตั้งใจใส่: ${dupPrimaryRow.code} ↔ C00007 (เลขภาษีเดียวกัน คนละสาขา) — ตัวรองมีเอกสาร ${docs} ใบ · JV ${jv} · กลุ่ม ${groups} · กฎประจำ ${rules}`);
}

// ─────────── 8.6 บิลขายหน้าร้าน (POS) 2 ใบ — WO 4.2 (MAP §F.13) ───────────
// ทำไมต้องมีในชุดข้อมูล: รายงาน "ขายอะไรดี / ขายใคร" (SPEC §4 บล็อก 8) ต้องมียอดขายหน้าร้านจริงให้เห็น
//   และต้องพิสูจน์ว่า POS ที่มีสมาชิก **ไม่สร้างผู้ติดต่อซ้ำ** (จำนวนผู้ติดต่อยังต้องเป็น 63 เท่าเดิม)
//
// ยอดเล็ก ๆ ตั้งใจให้จำง่าย (สตางค์):
//   บิล A (สมาชิก ปิยธิดา อินสุ่ม · เงินสด) — MASK-01 ×1 = 285,000 + TANK-12 ×1 = 780,000 → 1,065,000 (฿10,650.00)
//   บิล B (ลูกค้าเดินเข้าร้าน · พร้อมเพย์) — MASK-01 ×1 = 285,000 (฿2,850.00)
//   รวมยอดขาย POS 1,350,000 (฿13,500.00) · ต้นทุนที่ตัดออกจากคลัง 856,000 (฿8,560.00)
//   สต็อกหลังขาย: MASK-01 24−2 = 22 · TANK-12 9−1 = 8
//
// 🔴 ยอดช่องทางการเงินไม่ขยับ: JV ของ POS ลงบัญชี **แม่** 1000/1010 ส่วนช่องทางการเงินใช้บัญชี **ลูก**
//    (1000-01 ฯลฯ) ⇒ เฉลย finance 1,284,560 เท่าเดิมเป๊ะ
// ⚠️ วันที่ของ JV ต้นทุนขาย (COGS) = วันที่รัน seed จริง (inventory.consume ใช้ createdAt ของ movement)
//    ส่วนวันที่ของบิล/รายได้ถูกตรึงไว้ตามด้านล่าง — เฉลยทุกใบถูกสร้างใหม่หลัง seed จึงตรงกันเสมอ
const posSalesPlan = [
  {
    key: "A",
    date: "2026-09-18",
    memberId: piyathidaMember.id as string | null,
    pay: "CASH" as const,
    lines: [
      { sku: "MASK-01", qty: 1, unitPriceSatang: 285_000 },
      { sku: "TANK-12", qty: 1, unitPriceSatang: 780_000 },
    ],
  },
  {
    key: "B",
    date: "2026-09-19",
    memberId: null,
    pay: "PROMPTPAY" as const,
    lines: [{ sku: "MASK-01", qty: 1, unitPriceSatang: 285_000 }],
  },
];
const itemIdBySku = new Map(linkedItems.map((i) => [i.sku, i.itemId]));
const posSaleIds: { key: string; saleId: string; receiptNo: string | null; grandTotalSatang: number }[] = [];
for (const plan of posSalesPlan) {
  const gross = plan.lines.reduce((n, l) => n + l.qty * l.unitPriceSatang, 0);
  // createSale ภายใน tx ของเรา ⇒ ownsTx=false → ไม่ตัดสต็อก/ไม่ drain เอง (เราคุมลำดับเองด้านล่าง
  // เพื่อ "ตรึงวันที่บิล" ก่อน outbox จะสร้างเอกสารบัญชี — ไม่งั้นวันที่จะเป็นเวลาที่รัน seed)
  const sale = await prisma.$transaction((tx) =>
    pos.createSale(
      {
        tenantId,
        unitId: unit.id,
        systemId: posSys.id,
        memberId: plan.memberId ?? undefined,
        idempotencyKey: `seed-acc-v2-pos-${plan.key}`,
        lines: plan.lines.map((l) => ({
          name: PRODUCTS.find((p) => p.sku === l.sku)!.name,
          qty: l.qty,
          unitPriceSatang: l.unitPriceSatang,
          itemId: itemIdBySku.get(l.sku),
        })),
        payMethods: [{ type: plan.pay, amountSatang: gross }],
      },
      tx,
    ),
  );
  await prisma.posSale.update({ where: { id: sale.saleId }, data: { paidAt: D(plan.date), createdAt: D(plan.date) } });
  // ตัดสต็อก (perpetual) — คีย์เดียวกับ pos.consumeSaleInventory เพื่อให้ void/คืนสต็อกภายหลังเดินเส้นเดิม
  const saleLines = await prisma.posSaleLine.findMany({
    where: { tenantId, saleId: sale.saleId, itemId: { not: null } },
    select: { id: true, itemId: true, qty: true },
  });
  for (const l of saleLines) {
    await inv.consume(invCtx, {
      itemId: l.itemId!,
      qty: l.qty,
      sourceModule: "POS",
      refType: "PosSale",
      refId: sale.saleId,
      idempotencyKey: `pos-consume-${sale.saleId}-${l.id}`,
    });
  }
  posSaleIds.push({ key: plan.key, saleId: sale.saleId, receiptNo: sale.receiptNo, grandTotalSatang: sale.grandTotalSatang });
}
// ระบายคิว outbox → bridge → applyExternalSale (JV + เอกสารบิลขายหน้าร้าน + บรรทัดสินค้า)
await drainAll();

const posDocs = await prisma.accountDocument.findMany({
  where: { tenantId, systemId, docType: "TAX_INVOICE_ABB" },
  select: { id: true, docNo: true, contactId: true, grandTotal: true, subTotal: true, vatAmount: true, refId: true, lines: { select: { productId: true, qty: true, amount: true }, orderBy: { sortOrder: "asc" } } },
  orderBy: { issueDate: "asc" },
});
assertEq("บิลขายหน้าร้าน: จำนวนเอกสารบัญชี", posDocs.length, 2);
assertEq("บิลขายหน้าร้าน: จำนวนบรรทัดรวม", posDocs.reduce((n, d) => n + d.lines.length, 0), 3);
assertEq("บิลขายหน้าร้าน: บรรทัดที่ผูกทะเบียนสินค้า", posDocs.reduce((n, d) => n + d.lines.filter((l) => l.productId).length, 0), 3);
assertEq("บิลขายหน้าร้าน: ยอดรวมทั้ง 2 ใบ", posDocs.reduce((n, d) => n + d.grandTotal, 0), 1_350_000);
assertEq("บิลขายหน้าร้าน: ใบที่ผูกผู้ติดต่อ (สมาชิก)", posDocs.filter((d) => d.contactId).length, 1);
{
  const posEntries = await prisma.accountJournalEntry.count({ where: { systemId, refType: "PosSale" } });
  assertEq("บิลขายหน้าร้าน: JV ที่ลงจากบิล POS", posEntries, 2);
}
// สต็อกลดลงจริงจากบิล POS ⇒ อัปเดตเฉลยของ WO 4.1 (linkedItems) ให้เป็นยอดหลังขาย ไม่ใช่ยอดตั้งต้น
for (const li of linkedItems) {
  const it = await prisma.invItem.findUniqueOrThrow({ where: { id: li.itemId }, select: { onHand: true } });
  li.onHand = it.onHand;
}
assertEq("คงเหลือ MASK-01 หลังขาย POS", linkedItems.find((i) => i.sku === "MASK-01")!.onHand, 22);
assertEq("คงเหลือ TANK-12 หลังขาย POS", linkedItems.find((i) => i.sku === "TANK-12")!.onHand, 8);
console.log(`🧾 บิลขายหน้าร้าน (POS) ${posDocs.length} ใบ · รวม ฿${bahtStr(1_350_000)} · บรรทัดสินค้า 3 บรรทัด (ผูกทะเบียนสินค้าครบ) · สต็อกเหลือ MASK-01=22 · TANK-12=8`);

// ─────────────────────────── 8.6 กระทบยอดธนาคาร (WO 5.3 · §10.2 · g10) ───────────────────────────
// สร้างไฟล์ statement จากบรรทัด GL จริงของ BSV001 เดือน ก.ย. (SQL อิสระในสคริปต์ generator)
// แล้วนำเข้า + จับคู่อัตโนมัติ ⇒ ร้าน QC อยู่ในสถานะเดียวกับภาพ g10 (ยังมีส่วนต่าง · ยังจับคู่ไม่ครบ)
// ⚠️ ขั้นนี้ **ไม่โพสต์ JV ใด ๆ** (ไม่สร้างรายการค่าธรรมเนียม/ดอกเบี้ย) ⇒ ยอดเงินทุกบัญชีไม่ขยับ
//    ตัวเลขเฉลยเดิมของ WO 5.1/5.2 จึงไม่กระทบเลย (การสร้างรายการเป็นงานของข้อสอบในร้านทิ้ง)
const fixtureMod = (await import("./acc-v2-fixture-bank-statement.mts" as string)) as {
  buildBankStatementFixture: (o?: {
    write?: boolean;
    periodKey?: string;
    csvPath?: string;
    expectedPath?: string;
    withAdjustments?: boolean;
  }) => Promise<Record<string, unknown> & { rowCount: number; fileName: string }>;
  readKbankFixture: (path?: string) => string;
  KBANK_PREV_CSV: string;
  KBANK_PREV_EXPECTED: string;
  FIXTURE_PREV_PERIOD: string;
};
const rec = await import("@/lib/modules/account/reconcile");
const bankFixture = await fixtureMod.buildBankStatementFixture();
const bankImport = await rec.importStatement(
  { tenantId, systemId },
  {
    financeId: String(bankFixture.financeId),
    periodKey: String(bankFixture.periodKey),
    source: "KBANK",
    fileName: bankFixture.fileName,
    text: fixtureMod.readKbankFixture(),
    userId: owner.id,
  },
);
if (!("statementId" in bankImport)) throw new Error(`นำเข้า statement ไม่สำเร็จ: ${JSON.stringify(bankImport)}`);
const bankAuto = await rec.autoMatch({ tenantId, systemId }, bankImport.statementId, owner.id);
if (!("matched" in bankAuto)) throw new Error(`จับคู่อัตโนมัติไม่สำเร็จ: ${JSON.stringify(bankAuto)}`);
assertEq("statement นำเข้า", bankImport.imported, bankFixture.rowCount);
assertEq("จับคู่อัตโนมัติ", bankAuto.matched, Number(bankFixture.expectMatched));
assertEq("แนะนำจับคู่", bankAuto.suggested, Number(bankFixture.expectSuggested));
assertEq("รอจับคู่", bankAuto.unmatched, Number(bankFixture.expectUnmatched));
console.log(
  `🏦 กระทบยอดธนาคาร BSV001 ${bankFixture.periodKey}: นำเข้า ${bankImport.imported} แถว · จับคู่ ${bankAuto.matched} · แนะนำ ${bankAuto.suggested} · รอจับคู่ ${bankAuto.unmatched}`,
);

// เดือนก่อนหน้า (ส.ค.) — statement ที่ตรงกันพอดี ⇒ ส่วนต่าง 0 · จับคู่ครบ · **ปุ่มยืนยันกดได้** (ยังไม่กดให้)
// ใช้เป็นสถานะตัวอย่างของหน้าจอ (ภาพ QC "ยืนยันได้") โดยไม่ต้องโพสต์ JV เพิ่ม
const bankPrevFixture = await fixtureMod.buildBankStatementFixture({
  periodKey: fixtureMod.FIXTURE_PREV_PERIOD,
  csvPath: fixtureMod.KBANK_PREV_CSV,
  expectedPath: fixtureMod.KBANK_PREV_EXPECTED,
  withAdjustments: false,
});
const bankPrevImport = await rec.importStatement(
  { tenantId, systemId },
  {
    financeId: String(bankPrevFixture.financeId),
    periodKey: String(bankPrevFixture.periodKey),
    source: "KBANK",
    fileName: bankPrevFixture.fileName,
    text: fixtureMod.readKbankFixture(fixtureMod.KBANK_PREV_CSV),
    userId: owner.id,
  },
);
if (!("statementId" in bankPrevImport)) throw new Error(`นำเข้า statement เดือนก่อนไม่สำเร็จ: ${JSON.stringify(bankPrevImport)}`);
const bankPrevAuto = await rec.autoMatch({ tenantId, systemId }, bankPrevImport.statementId, owner.id);
if (!("matched" in bankPrevAuto)) throw new Error("จับคู่อัตโนมัติเดือนก่อนไม่สำเร็จ");
assertEq("statement เดือนก่อน นำเข้า", bankPrevImport.imported, bankPrevFixture.rowCount);
assertEq("statement เดือนก่อน จับคู่ครบ", bankPrevAuto.matched, bankPrevFixture.rowCount);
assertEq("statement เดือนก่อน ไม่มีรายการค้าง", bankPrevAuto.suggested + bankPrevAuto.unmatched, 0);
const bankPrevSummary = await rec.summary({ tenantId, systemId }, String(bankPrevFixture.financeId), String(bankPrevFixture.periodKey));
if ("ok" in bankPrevSummary) throw new Error("สรุปกระทบยอดเดือนก่อนล้ม");
assertEq("statement เดือนก่อน ส่วนต่าง 0", bankPrevSummary.differenceSatang ?? -1, 0);
console.log(
  `🏦 กระทบยอดธนาคาร BSV001 ${bankPrevFixture.periodKey}: นำเข้า ${bankPrevImport.imported} แถว · จับคู่ครบ · ส่วนต่าง 0 (ปุ่มยืนยันกดได้)`,
);

// ─────────────────────────── 8.7 ภาษีหัก ณ ที่จ่าย V2 + เช็ค V2 (WO 5.4 · §10.4–5 · g11) ───────────────────────────
// 3 ใบเครดิต (ลูกค้าหักเรา — หน้า "ภาษีถูกหักไว้") + 3 ใบหัก (เราหักผู้ขาย — หน้า "ภาษีหัก ณ ที่จ่าย") คนละ 2 เดือน
// (ส.ค./ก.ย. 69) — จ่าย/รับผ่าน **CSH001 เท่านั้น** (ตั้งใจไม่แตะ BSV001: WO 5.3 generate statement CSV เดือน ก.ย.
// จาก GL จริงของบัญชีนั้นครั้งเดียวแล้ว freeze ไว้ — ถ้ามีรายการใหม่โผล่ใน BSV001 เดือน ก.ย. "ยอดในระบบ" จะขยับ
// แต่ statement ที่ freeze แล้วไม่ขยับตาม ⇒ ส่วนต่างของ WO 5.3 เพี้ยน)
// ⇒ เงินเข้า/ออกจริง (WHT ไม่ใช่ "ของฟรี" — payment จริงมีเงินเข้า/ออกเสมอ) → ต้องปรับเฉลย CSH001/total ท้ายไฟล์
//   ด้วย CASH_WHT_DELTA (คำนวณจากค่าคงที่ด้านล่างเป๊ะ ไม่พิมพ์เลขมือ) — จดไว้ ledger/wo-notes/5.4.md ขั้น 8
type WhtFix = { name: string; grand: number; issue: string; incomeType: "M40_2" | "M40_6" | "M40_7" | "M40_8" };
const WHT_RATE_BP = 300; // 3% ทุกใบ (ม.40 ที่ธุรกิจนี้ใช้บ่อยสุด)

const CREDIT_FIX: WhtFix[] = [
  { name: "บริษัท ภูเก็ตดีปซี จำกัด", grand: 2_140_000, issue: "2026-08-20", incomeType: "M40_8" },
  { name: "คุณสมชาย ใจดี", grand: 1_605_000, issue: "2026-09-02", incomeType: "M40_8" },
  { name: "บริษัท ซีสตาร์ รีสอร์ท จำกัด", grand: 2_675_000, issue: "2026-09-03", incomeType: "M40_8" },
];
const DEDUCT_FIX: WhtFix[] = [
  { name: "บริษัท เซฟตี้เฟิร์ส อุปกรณ์นิรภัย จำกัด", grand: 1_070_000, issue: "2026-08-20", incomeType: "M40_8" },
  { name: "คุณสมบัติ ช่างซ่อมเรือ", grand: 856_000, issue: "2026-09-02", incomeType: "M40_7" },
  { name: "สำนักงานบัญชี ภูเก็ตแอคเคาท์", grand: 535_000, issue: "2026-09-03", incomeType: "M40_6" },
];

let creditCashIn = 0;
let creditWhtTotal = 0;
const creditCertIds: string[] = [];
for (const f of CREDIT_FIX) {
  const doc = await makeInvoice({ cust: f.name, grand: f.grand, issue: f.issue, due: "2026-12-15", desc: `บริการ WHT ทดสอบ (${f.incomeType})`, bucket: "paid" });
  const base = baseForGrand(f.grand);
  if (base === null) throw new Error(`หา base ของ WHT credit ${f.name} ไม่ได้`);
  const wht = Math.round((base * WHT_RATE_BP) / 10000);
  const cash = f.grand - wht;
  const r = await svc.recordPayment(tenantId, systemId, doc.id, {
    paidAt: D(f.issue),
    channel: "CASH",
    financeAccountId: finId["CSH001"],
    amount: cash,
    whtAmountSatang: wht,
    whtRateBp: WHT_RATE_BP,
    whtIncomeType: f.incomeType,
    createdById: owner.id,
  });
  if (!r.ok) throw new Error(`รับชำระ (WHT credit) ${f.name} ไม่สำเร็จ: ${r.reason}`);
  if (!r.whtCertNo) throw new Error(`ไม่ออกใบเครดิตภาษีให้ ${f.name}`);
  const cert = await prisma.accountDocument.findFirstOrThrow({ where: { systemId, docType: "WHT_CERT", docNo: r.whtCertNo }, select: { id: true } });
  creditCertIds.push(cert.id);
  creditCashIn += cash;
  creditWhtTotal += wht;
}

let deductCashOut = 0;
let deductWhtTotal = 0;
const deductCertIds: string[] = [];
for (const f of DEDUCT_FIX) {
  const auto = docLines(f.grand, `ค่าใช้จ่าย WHT ทดสอบ (${f.incomeType})`);
  const doc = await exp.createExpenseDoc({
    tenantId,
    systemId,
    docType: "EXPENSE",
    contactId: cid(f.name),
    issueDate: D(f.issue),
    dueDate: D(f.issue),
    vatMode: auto.vatMode,
    vatPurchaseMode: "CLAIM",
    lines: auto.lines.map((l) => ({ ...l, accountId: expenseAccounts[0].id })),
    createdById: owner.id,
  });
  const issued = await exp.issueExpenseDoc(tenantId, systemId, doc.id);
  if (!issued.ok) throw new Error(`ออกเอกสารจ่าย (WHT deduct) ${f.name} ไม่สำเร็จ: ${issued.reason}`);
  const base = baseForGrand(f.grand);
  if (base === null) throw new Error(`หา base ของ WHT deduct ${f.name} ไม่ได้`);
  const wht = Math.round((base * WHT_RATE_BP) / 10000);
  const cash = f.grand - wht;
  const r = await exp.recordVendorPayment(tenantId, systemId, doc.id, {
    paidAt: D(f.issue),
    channel: "CASH",
    financeAccountId: finId["CSH001"],
    amount: cash,
    whtAmountSatang: wht,
    whtRateBp: WHT_RATE_BP,
    whtIncomeType: f.incomeType,
    createdById: owner.id,
  });
  if (!r.ok) throw new Error(`บันทึกจ่าย (WHT deduct) ${f.name} ไม่สำเร็จ: ${r.reason}`);
  const pay = await prisma.accountDocumentPayment.findFirstOrThrow({ where: { documentId: doc.id }, select: { whtCertDocId: true } });
  if (!pay.whtCertDocId) throw new Error(`ไม่ออก 50 ทวิ ให้ ${f.name}`);
  deductCertIds.push(pay.whtCertDocId);
  deductCashOut += cash;
  deductWhtTotal += wht;
}

// WO 5.4 round 2 (Fable ตีกลับ): ทำเครื่องหมายนำส่งแล้ว 1 งวด (ภ.ง.ด.53 · ก.ย. 69 — ตรงกับใบเดียวที่เป็น
// นิติบุคคลของเดือน ก.ย. คือ "สำนักงานบัญชี ภูเก็ตแอคเคาท์" ดัชนี 2 ของ DEDUCT_FIX) ให้หน้า g11 โชว์ทั้ง 2 สไตล์ชิป
// ("ยื่นแล้ว ก.ย." เข้มขอบดำ / "ยังไม่ยื่น" เทาจาง) — ไม่กระทบใบอื่น (บริษัท เซฟตี้เฟิร์ส = ส.ค. · คุณสมบัติ = ภ.ง.ด.3)
const markFiledSeed = await wht.markFiled(tenantId, systemId, { form: 53, periodKey: "2026-09", filedById: owner.id });
if (!markFiledSeed.ok) throw new Error(`ทำเครื่องหมายนำส่งแล้ว (seed fixture) ไม่สำเร็จ: ${markFiledSeed.reason}`);
console.log(`   ทำเครื่องหมายนำส่งแล้ว: ภ.ง.ด.53 ก.ย. 69 (${markFiledSeed.certCount} ใบ · ภาษี ${bahtStr(markFiledSeed.totalTaxSatang)})`);

// ผลต่างเงินสดสุทธิจาก WHT ทั้ง 6 ใบ (รับ − จ่าย) — บวกเข้า CSH001 ในเฉลยส่วนที่ 9 ด้านล่าง
const CASH_WHT_DELTA = creditCashIn - deductCashOut;
const CASH_FINAL = FIN_TARGET.CSH001 + CASH_WHT_DELTA;
console.log(
  `🧾 WHT V2: เครดิต ${CREDIT_FIX.length} ใบ (รับสุทธิ ${bahtStr(creditCashIn)} · เครดิตภาษี ${bahtStr(creditWhtTotal)}) · ` +
    `หัก ${DEDUCT_FIX.length} ใบ (จ่ายสุทธิ ${bahtStr(deductCashOut)} · ภาษีที่หัก ${bahtStr(deductWhtTotal)}) · CSH001 Δ ${bahtStr(CASH_WHT_DELTA)}`,
);

// ── เช็ค V2 — 4 ใบ (§10.4) ตั้งใจเป็น "เช็คลอย" ไม่ผูกเอกสาร (documentId ไม่ระบุ) ──
// เหตุผล: ผูกเอกสารจริงแล้วให้เด้ง/ยกเลิกจะ "คืนหนี้เอกสารกลับเป็นค้างชำระ" (restoreDocForCheque ใน cheque.ts)
// ⇒ เอกสารใหม่โผล่มาเป็นค้างรับ/ค้างจ่ายที่ไม่ได้อยู่ในแผนของหมวด 5–6 ด้านบน (จะกระทบ receivable/payable +
// invoiceTabs ที่ผูกกันเป็นลูกโซ่ทั่วทั้งชุดข้อสอบ) — "เช็คลอย" (financeAccountId ใส่ไว้เป็นบัญชีที่ตั้งใจนำฝาก/
// จ่ายจาก แต่ยังไม่เคลียร์ = ไม่กระทบ GL เงินสด/ธนาคารเลย) ให้ผลทดสอบ lifecycle เดียวกันโดยไม่มีผลข้างเคียง
// 🔴 ต่างจากใบสั่งงาน (จดไว้): ใบสั่งงานขอ "2 รับ (1 ครบกำหนด 5 วัน · 1 เคลียร์แล้ว) · 2 จ่าย (1 ค้าง · 1 เด้ง)"
//   ที่จริงเด้งได้เฉพาะเช็ครับ (bounceCheque บังคับ direction IN) และเช็คจ่ายไม่มีสถานะ "เด้ง" ใน state machine
//   (SPEC §3: เช็คจ่าย = ออกแล้ว·ตัดบัญชีแล้ว·ยกเลิก เท่านั้น) ⇒ สลับเป็น "1 รับเด้ง" (ใช้ direction ที่ถูกจริง)
//   และ "1 จ่ายยกเลิก" (VOIDED แทน BOUNCED) · ไม่เคลียร์เช็คใดเลย (เหตุผลเดียวกับข้างบน — เคลียร์ = เงินเข้าจริง
//   ที่ต้องปรับเฉลยอีกชั้น ทำได้แต่ไม่จำเป็นสำหรับพิสูจน์ UI/summary — QC script 5.4 ทดสอบ clearCheque เองแยก
//   บนข้อมูลชั่วคราวที่ไม่ผูกกับเฉลยชุดนี้)
const chequeDueSoon = new Date(Date.now() + 5 * 24 * 3600 * 1000);
const cq1 = await chq.createCheque({
  tenantId,
  systemId,
  direction: "IN",
  chequeNo: "1000123",
  bankName: "ธนาคารกสิกรไทย",
  chequeDate: chequeDueSoon,
  amount: 850_000,
  financeAccountId: finId["BSV001"],
  note: "เช็ครับ — รอครบกำหนด (WO 5.4 fixture)",
});
if (!cq1.ok) throw new Error(`สร้างเช็ครับ #1 ไม่สำเร็จ: ${cq1.reason}`);

const cq2 = await chq.createCheque({
  tenantId,
  systemId,
  direction: "IN",
  chequeNo: "1000124",
  bankName: "ธนาคารไทยพาณิชย์",
  chequeDate: D("2026-08-25"),
  amount: 1_200_000,
  financeAccountId: finId["BSV001"],
  note: "เช็ครับ — เด้ง (WO 5.4 fixture)",
});
if (!cq2.ok) throw new Error(`สร้างเช็ครับ #2 ไม่สำเร็จ: ${cq2.reason}`);
const cq2Bounce = await chq.bounceCheque(tenantId, systemId, cq2.id, "เงินในบัญชีไม่พอ");
if (!cq2Bounce.ok) throw new Error(`บันทึกเช็คเด้ง #2 ไม่สำเร็จ: ${cq2Bounce.reason}`);

const cq3 = await chq.createCheque({
  tenantId,
  systemId,
  direction: "OUT",
  chequeNo: "5551001",
  bankName: "ธนาคารกรุงไทย",
  chequeDate: D("2026-09-10"),
  amount: 950_000,
  financeAccountId: finId["BSV001"],
  note: "เช็คจ่าย — รอเรียกเก็บ (WO 5.4 fixture)",
});
if (!cq3.ok) throw new Error(`สร้างเช็คจ่าย #1 ไม่สำเร็จ: ${cq3.reason}`);

const cq4 = await chq.createCheque({
  tenantId,
  systemId,
  direction: "OUT",
  chequeNo: "5551002",
  bankName: "ธนาคารกรุงเทพ",
  chequeDate: D("2026-08-28"),
  amount: 600_000,
  financeAccountId: finId["BSV001"],
  note: "เช็คจ่าย — ยกเลิก (WO 5.4 fixture)",
});
if (!cq4.ok) throw new Error(`สร้างเช็คจ่าย #2 ไม่สำเร็จ: ${cq4.reason}`);
const cq4Void = await chq.voidCheque(tenantId, systemId, cq4.id, "ออกเช็คผิดจำนวน");
if (!cq4Void.ok) throw new Error(`ยกเลิกเช็คจ่าย #2 ไม่สำเร็จ: ${cq4Void.reason}`);

console.log(`🖊️  เช็ค V2: เช็ครับ 2 (1 รอครบกำหนด · 1 เด้ง) · เช็คจ่าย 2 (1 รอเรียกเก็บ · 1 ยกเลิก) — ไม่มีใบใดเคลียร์`);

// ─────────────────── 8.8 PromptPay ลิงก์ชำระเงิน (WO 5.5 · §0.3 ข้อ 5) ───────────────────
// 2 คำขอ ตามใบสั่งงาน:
//   ① โหมด Beam — จ่ายแล้ว: ใบแจ้งหนี้ใหม่ 1 ใบ → สร้างคำขอ → จำลอง webhook → PAID + payment + JV
//   ② โหมด QR นิ่ง — ยังรอชำระ: ผูกกับ **ใบแจ้งหนี้เดิม** (ณัฐพล 24,900) ⇒ ไม่มีเงินขยับ ไม่มีเลขเฉลยใดเปลี่ยน
//
// 🔴 ทำไมเงินเข้า **EWL001 (พร้อมเพย์)** เท่านั้น:
//    BSV001 = WO 5.3 freeze statement เดือน ก.ย. ไว้ (มีรายการใหม่ = ส่วนต่างกระทบยอดเพี้ยน)
//    CSH001 = WO 5.4 ใช้เป็นช่องทางของ WHT แล้ว · EWL001 เป็นช่องทางเดียวที่มี promptpayId จริงด้วย
// ⇒ ต้องปรับเฉลย EWL001/E_WALLET/total ท้ายไฟล์ด้วย PP_BEAM_GRAND (คิดจากค่าคงที่ ไม่พิมพ์เลขมือ)
const payreq = await import("@/lib/modules/account/payment-request");

/** ยอดใบแจ้งหนี้ของคำขอโหมด Beam — 700,000 + VAT 7% = 749,000 สตางค์ (฿7,490.00) */
const PP_BEAM_GRAND = 749_000;
const PP_BEAM_CHARGE_ID = "qc_beam_charge_5_5";

// เสียบ Beam ปลอม (prod ยังไม่มีกุญแจจริง — ทั้ง WO ต้องเดินได้ผ่านตัวเสียบ + webhook จำลอง)
const realBeamEnabled = payreq.beamAdapter.enabled;
const realBeamCreateCharge = payreq.beamAdapter.createCharge;
payreq.beamAdapter.enabled = () => true;
payreq.beamAdapter.createCharge = async (input) => ({
  url: `https://beam.qc.local/pay/${encodeURIComponent(input.referenceId)}`,
  chargeId: PP_BEAM_CHARGE_ID,
});

const ppBeamInvoice = await makeInvoice({
  cust: "บริษัท ภูเก็ตดีปซี จำกัด",
  grand: PP_BEAM_GRAND,
  issue: "2026-09-02",
  due: "2026-12-15",
  desc: "ค่าบริการดำน้ำ (จ่ายผ่านลิงก์พร้อมเพย์)",
  bucket: "paid",
});
const ppBeamReq = await payreq.createPaymentRequest({ tenantId, systemId }, ppBeamInvoice.id, {
  financeId: finId["EWL001"],
  expiresInDays: 7,
  userId: owner.id,
});
if (!ppBeamReq.ok) throw new Error(`สร้างคำขอชำระเงิน (Beam) ไม่สำเร็จ: ${ppBeamReq.reason}`);
if (ppBeamReq.request.method !== "PROMPTPAY_BEAM") throw new Error("คำขอ Beam ไม่ได้เป็นโหมด PROMPTPAY_BEAM");

const ppBeamPaid = await payreq.handleBeamPaid({
  referenceId: `acc:${ppBeamReq.request.id}`,
  chargeId: PP_BEAM_CHARGE_ID,
  paidSatang: PP_BEAM_GRAND,
});
if (!ppBeamPaid.ok) throw new Error(`จำลอง webhook (Beam) ไม่สำเร็จ: ${ppBeamPaid.reason}`);

payreq.beamAdapter.enabled = realBeamEnabled;
payreq.beamAdapter.createCharge = realBeamCreateCharge;

const ppBeamDoc = await prisma.accountDocument.findUniqueOrThrow({
  where: { id: ppBeamInvoice.id },
  select: { status: true, paidTotal: true },
});
if (ppBeamDoc.status !== "PAID")
  throw new Error(`❌ ใบแจ้งหนี้ที่จ่ายผ่านลิงก์ต้องเป็น "ชำระเงินแล้ว" แต่ได้ ${ppBeamDoc.status}`);
assertEq("ยอดที่ชำระของใบนั้น", ppBeamDoc.paidTotal, PP_BEAM_GRAND);

// ② QR นิ่ง — ยังรอชำระ (ผูกใบเดิม ไม่มีเงินขยับ) · Beam ปิดอยู่ ⇒ ตกโหมดนิ่งเองตามตรรกะจริง
const ppStaticReq = await payreq.createPaymentRequest({ tenantId, systemId }, String(fixtures.invNattapholId), {
  financeId: finId["EWL001"],
  expiresInDays: 30,
  userId: owner.id,
});
if (!ppStaticReq.ok) throw new Error(`สร้างคำขอชำระเงิน (QR นิ่ง) ไม่สำเร็จ: ${ppStaticReq.reason}`);
if (ppStaticReq.request.method !== "PROMPTPAY_STATIC") throw new Error("คำขอ QR นิ่งไม่ได้เป็นโหมด PROMPTPAY_STATIC");
if (!ppStaticReq.request.qrPayload?.startsWith("00")) throw new Error("payload PromptPay ของคำขอ QR นิ่งไม่ถูกต้อง");

/** ยอด EWL001 หลังรับเงินผ่านลิงก์พร้อมเพย์ (ใช้แทน FIN_TARGET.EWL001 ในเฉลยส่วนที่ 9) */
const EWALLET_FINAL = FIN_TARGET.EWL001 + PP_BEAM_GRAND;
console.log(
  `🔗 PromptPay V2: คำขอ 2 ใบ (Beam จ่ายแล้ว ${bahtStr(PP_BEAM_GRAND)} · QR นิ่งรอชำระ ${bahtStr(ppStaticReq.request.amountSatang)}) · EWL001 Δ ${bahtStr(PP_BEAM_GRAND)}`,
);

// ─────────────────── 8.9 ผังบัญชี V2 (WO 6.1 · §11.1 · f8) ───────────────────
// เพิ่มบัญชีที่ "ผู้ใช้สร้างเอง" 2 ตัว + บัญชีที่ปิดใช้งานแล้ว 1 ตัว
//   • ทั้ง 3 ตัวใช้รหัสใน "หมวดย่อย" ที่มีชื่ออยู่แล้ว (630 ค่าการตลาดและโฆษณา · 403 รายได้ค่าบริการ)
//     เพื่อให้ต้นไม้ในภาพไม่มีกลุ่มชื่อสำรอง "หมวดย่อย 631"
//   • ตั้งใจ **ไม่มีรายการเคลื่อนไหว** — ตัวเลขเงินทุกตัวของ seed เดิมจึงไม่ขยับแม้แต่สตางค์เดียว
//     (การทดสอบ "ปิดใช้งานไม่ได้เพราะมีรายการ" ทำในร้านทิ้งของ scripts/qc-acc-v2-coa.mts)
const coaCustom = await prisma.accountLedger.createManyAndReturn({
  data: [
    {
      tenantId,
      systemId,
      code: "6301",
      name: "ค่าโฆษณาออนไลน์",
      nameEn: "Online Advertising",
      type: "EXPENSE" as const,
      cashflowActivity: "OPERATING" as const,
      isSystem: false,
      level: 4,
      description: "ค่ายิงโฆษณาเฟซบุ๊ก/กูเกิลของทริปดำน้ำ",
      defaultWhtRateBp: 200,
      defaultWhtType: "ADVERTISING",
      vatTreatment: "CLAIMABLE",
    },
    {
      tenantId,
      systemId,
      code: "4031",
      name: "รายได้ค่าเช่าอุปกรณ์",
      nameEn: "Equipment Rental Income",
      type: "INCOME" as const,
      cashflowActivity: "OPERATING" as const,
      isSystem: false,
      level: 4,
      description: "ค่าเช่าอุปกรณ์ดำน้ำรายวัน (ไม่รวมทริป)",
    },
    {
      tenantId,
      systemId,
      code: "6302",
      name: "ค่าโฆษณาสิ่งพิมพ์",
      nameEn: "Print Advertising",
      type: "EXPENSE" as const,
      cashflowActivity: "OPERATING" as const,
      isSystem: false,
      level: 4,
      description: "เลิกใช้แล้ว — เก็บไว้ดูประวัติ",
      archivedAt: D("2026-08-31"),
    },
  ],
  select: { id: true, code: true },
});
const coaCustomId = Object.fromEntries(coaCustom.map((l) => [l.code, l.id])) as Record<string, string>;
// คำอธิบายของบัญชีลูกที่ผูกช่องทางเงิน (แผงขวาใน f8 มีคำอธิบายจริงให้ดู ไม่ใช่ "—")
const COA_CHILD_DESC: [string, string][] = [
  ["1000-01", "เงินสดในลิ้นชักหน้าร้านและเงินทอนของทริป"],
  ["1010-01", "บัญชีหลักของร้าน รับโอน/จ่ายซัพพลายเออร์"],
  ["1020-01", "รับเงินลูกค้าผ่านพร้อมเพย์/ลิงก์ชำระเงิน"],
  ["1030-01", "เงินสดย่อยสำหรับค่าใช้จ่ายหน้างาน"],
];
for (const [code, desc] of COA_CHILD_DESC)
  await prisma.accountLedger.updateMany({ where: { systemId, code }, data: { description: desc } });

console.log(`🧾 ผังบัญชี V2: +บัญชีสร้างเอง 2 (6301/4031) +ปิดใช้งาน 1 (6302)`);

// ─────────────────────────── 9. อ่านผลจริงกลับมา + เขียนเฉลย ───────────────────────────

const stats = await svc.overviewStats(tenantId, systemId);
const pay = await exp.payableStats(tenantId, systemId);
// WO 6.1 รอบ 2: financeBalances/coa คิดยอด "ณ วันที่" แล้ว ⇒ เฉลยต้องตรึงที่ QC.today (ไม่ใช่นาฬิกาเครื่อง)
const QC_ASOF = new Date(`${QC.today}T12:00:00+07:00`);
const balances = await fin.financeBalances(tenantId, systemId, QC_ASOF);
const balByName = new Map(balances.map((b) => [b.name, b.balance]));

assertEq("ค้างรับ (จาก DB)", stats.receivable, 49_430_000);
assertEq("พ้นกำหนด (จาก DB)", stats.overdueAmount, 12_840_000);
assertEq("จำนวนใบพ้นกำหนด (จาก DB)", stats.overdueCount, 4);
assertEq("ค้างจ่าย (จาก DB)", pay.payable, 21_475_000);
// WO 5.2: BSV001/PTY001 ขยับจากเติมเงิน/เบิกชดเชยสำรองจ่าย (บล็อก 8.5) · WO 5.4: CSH001 ขยับจาก WHT V2 สุทธิ
// (บล็อก 8.7 — CASH_WHT_DELTA) — เทียบกับ PETTY_FINAL/CASH_FINAL แทน FIN_TARGET ตรง ๆ
for (const f of FIN_DEF) {
  const want =
    f.code === "BSV001"
      ? PETTY_FINAL.BSV001
      : f.code === "PTY001"
        ? PETTY_FINAL.PTY001
        : f.code === "CSH001"
          ? CASH_FINAL
          : f.code === "EWL001"
            ? EWALLET_FINAL // WO 5.5: รับเงินผ่านลิงก์พร้อมเพย์ (บล็อก 8.8)
            : FIN_TARGET[f.code as keyof typeof FIN_TARGET];
  assertEq(`ยอดคงเหลือ ${f.name}`, balByName.get(f.name) ?? 0, want);
}

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
// WO 5.4: +3 (all/paid) จาก CREDIT_FIX (บล็อก 8.7 — 3 ใบแจ้งหนี้ใหม่ WHT credit จ่ายครบทันที = PAID)
// WO 5.5: +1 (all/paid) จากใบแจ้งหนี้ที่จ่ายผ่านลิงก์พร้อมเพย์ (บล็อก 8.8) ⇒ 57 / ชำระแล้ว 33
assertEq("แท็บ ทั้งหมด", tabs.all, 57);
assertEq("แท็บ ร่าง", tabs.draft, 3);
assertEq("แท็บ รอชำระ", tabs.awaiting, 14);
assertEq("แท็บ ชำระบางส่วน", tabs.partial, 2);
assertEq("แท็บ ชำระแล้ว", tabs.paid, 33);
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

// ── เฉลยผังบัญชี V2 (WO 6.1) — คิดด้วย SQL ดิบคนละสำนวนกับ coa.ts (ไม่เรียกโค้ดจริงมาเช็คตัวเอง) ──
const COA_MONTH_KEY = QC.today.slice(0, 7); // เฉลยตรึงที่เดือนของ QC.today (ไม่ใช่เดือนของนาฬิกาเครื่อง)
// ยอด "ณ QC.today" — ตัดที่เที่ยงคืนของวันถัดไป (กติกาเดียวกับ asOfCutoff ใน coa-v2.ts แต่เขียนเป็น SQL/JS คนละสำนวน)
const COA_CUTOFF = new Date(new Date(`${QC.today}T00:00:00+07:00`).getTime() + 24 * 3600 * 1000);
const COA_MONTH_FROM = new Date(`${COA_MONTH_KEY}-01T00:00:00+07:00`);
const COA_SAMPLE_CODES = ["1000-01", "1100", "4000"];
const coaTypeRows = await prisma.$queryRaw<Array<{ type: string; cnt: bigint }>>`
  SELECT "type"::text AS type, COUNT(*)::bigint AS cnt
    FROM "AccountLedger"
   WHERE "systemId" = ${systemId} AND "archivedAt" IS NULL
   GROUP BY "type"`;
const coaGroupRows = await prisma.$queryRaw<Array<{ prefix: string; cnt: bigint }>>`
  SELECT LEFT(REGEXP_REPLACE("code", '[^0-9]', '', 'g'), 2) AS prefix, COUNT(*)::bigint AS cnt
    FROM "AccountLedger"
   WHERE "systemId" = ${systemId} AND "archivedAt" IS NULL
   GROUP BY 1`;
const coaSampleRows = await prisma.$queryRaw<Array<{ code: string; id: string; balance: bigint; month: bigint }>>`
  SELECT l."code",
         l."id",
         COALESCE(SUM(CASE WHEN e."id" IS NULL THEN 0
                           WHEN l."type"::text IN ('LIABILITY','EQUITY','INCOME')
                           THEN jl."credit" - jl."debit" ELSE jl."debit" - jl."credit" END), 0)::bigint AS balance,
         COALESCE(SUM(CASE WHEN e."date" >= ${COA_MONTH_FROM}
                           THEN (CASE WHEN l."type"::text IN ('LIABILITY','EQUITY','INCOME')
                                      THEN jl."credit" - jl."debit" ELSE jl."debit" - jl."credit" END)
                           ELSE 0 END), 0)::bigint AS month
    FROM "AccountLedger" l
    LEFT JOIN "AccountJournalLine" jl ON jl."accountId" = l."id"
    -- ยอด "ณ QC.today": เข้าร่วมเฉพาะใบสำคัญที่ลงวันที่ก่อน cutoff (LEFT JOIN + เงื่อนไขใน ON = แถวที่เกินถูกตัดทิ้ง)
    LEFT JOIN "AccountJournalEntry" e ON e."id" = jl."entryId" AND e."date" < ${COA_CUTOFF}
   WHERE l."systemId" = ${systemId} AND l."code" = ANY(${COA_SAMPLE_CODES})
   GROUP BY l."id", l."code"`;
const coaActive = coaTypeRows.reduce((n, r) => n + Number(r.cnt), 0);
console.log(`🧾 เฉลยผังบัญชี: ${coaActive} บัญชีที่เปิดใช้งาน · ตัวอย่าง ${coaSampleRows.map((r) => `${r.code}=${bahtStr(Number(r.balance))}`).join(" · ")}`);

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
  receivable: 49_430_000,
  receivableDocs: 20,
  receivableCustomers: 14,
  overdueAmount: 12_840_000,
  overdueDocs: 4,
  payable: 21_475_000,
  payableDocs: 10,
  payableVendors: 7,
  payableOverdueDocs: 2,
  // WO 5.2: BSV001/PTY001/total อัปเดตเป็นยอดหลังเติมเงิน/เบิกชดเชยสำรองจ่าย (ดูบล็อก 8.5 ด้านบน)
  // WO 5.4: CSH001/total อัปเดตเป็นยอดหลังรับ/จ่าย WHT V2 สุทธิ (ดูบล็อก 8.7 — CASH_WHT_DELTA)
  // WO 5.5: EWL001/total อัปเดตเป็นยอดหลังรับเงินผ่านลิงก์พร้อมเพย์ (ดูบล็อก 8.8 — PP_BEAM_GRAND)
  finance: {
    CSH001: CASH_FINAL,
    BSV001: PETTY_FINAL.BSV001,
    EWL001: EWALLET_FINAL,
    PTY001: PETTY_FINAL.PTY001,
    total: CASH_FINAL + PETTY_FINAL.BSV001 + EWALLET_FINAL + PETTY_FINAL.PTY001,
  },
  financeAccounts: FIN_DEF.map((f) => ({
    code: f.code,
    id: finId[f.code],
    name: f.name,
    type: f.type,
    opening: finOpening[f.code],
    balance:
      f.code === "BSV001"
        ? PETTY_FINAL.BSV001
        : f.code === "PTY001"
          ? PETTY_FINAL.PTY001
          : f.code === "CSH001"
            ? CASH_FINAL
            : f.code === "EWL001"
              ? EWALLET_FINAL
              : FIN_TARGET[f.code as keyof typeof FIN_TARGET],
  })),
  // WO 5.1 — กลุ่ม/ยอดกลุ่ม (§10.1): เงินสด·ออมทรัพย์·e-Wallet·สำรองรับ-จ่าย (ไม่มีบัญชีกระแสในชุดข้อมูลนี้)
  // WO 5.2: BANK_SAVINGS/PETTY_CASH อัปเดตตามยอดหลังเติม/เบิกชดเชย · WO 5.4: CASH อัปเดตตาม WHT V2 สุทธิ
  financeGroups: {
    CASH: CASH_FINAL,
    BANK_SAVINGS: PETTY_FINAL.BSV001,
    E_WALLET: EWALLET_FINAL, // WO 5.5
    PETTY_CASH: PETTY_FINAL.PTY001,
  },
  // WO 5.1 — BSV001 ยกมา 2 รายการ (ผลรวม = finOpening.BSV001 เท่าเดิม) — qc ยิง 2 JV แยกกันตรง key นี้
  financeOpeningSplit: {
    code: SPLIT_OPENING_CODE,
    financeId: finId[SPLIT_OPENING_CODE],
    entries: [
      { seq: 1, amount: finOpening[SPLIT_OPENING_CODE] - SPLIT_SECOND_SATANG },
      { seq: 2, amount: SPLIT_SECOND_SATANG },
    ],
    sum: finOpening[SPLIT_OPENING_CODE],
  },
  // WO 5.1 — ช่องทางปิดใช้งาน 1 บัญชี (ไม่นับใน financeAccounts/financeGroups/total ข้างบน)
  financeArchived: { id: archivedFin.id, code: archivedFin.code },
  // WO 5.2 (§10.3) — เฉลยสำรองรับ-จ่าย: กล่อง PTY001 เติม 1 ครั้ง (฿10,000 · 2026-09-10) + ค่าใช้จ่าย 2 รายการ
  pettyCash: {
    id: finId["PTY001"],
    code: "PTY001",
    balance: PETTY_FINAL.PTY001,
    topUpAmount: PETTY_TOPUP_SATANG,
    topUpDate: "2026-09-10",
    reimbursed: { paymentId: pettyExpenseAPaymentId, amount: PETTY_EXPENSE_A_SATANG, date: "2026-09-12" },
    pending: { paymentId: pettyExpenseBPaymentId, amount: PETTY_EXPENSE_B_SATANG, date: "2026-09-20" },
  },
  // WO 5.4: +3 (all/paid) จาก CREDIT_FIX (ดูบล็อก 8.7)
  // WO 5.5: +1 ที่ all/paid — ใบแจ้งหนี้ที่ลูกค้าจ่ายผ่านลิงก์พร้อมเพย์ (บล็อก 8.8)
  invoiceTabs: { all: 57, draft: 3, awaiting: 14, partial: 2, paid: 33, overdue: 4, cancelled: 1 },
  contacts: { all: 63, customer: 41, vendor: 22, archived: 5, active: 58 },
  // WO 4.3: 13 = สินค้า 7 + บริการ 5 + รายการจัดชุด 1 (เดิม 12 · เพิ่ม "ชุดดำน้ำตื้นครบเซ็ต")
  products: 13,
  productsByType: { GOODS: 7, SERVICE: 5, BUNDLE: 1 },
  // WO 4.3 — หน่วยนับ · รายการจัดชุด · ยอดยกมา · ใบปรับต้นทุน (ตัวเลขอิสระจากเฉลยชุดอื่น)
  units: { seeded: prod.UNIT_SEED.length, total: units.size },
  bundle: {
    id: bundleRes.id,
    code: bundleRes.code,
    sku: "SET-SNK",
    name: "ชุดดำน้ำตื้นครบเซ็ต (หน้ากาก + ถังอากาศ)",
    salePrice: 1_000_000,
    components: BUNDLE_RECIPE.map((c) => ({ sku: c.sku, productId: productIds.get(c.sku)!, qty: c.qty })),
  },
  openingLot: {
    sku: OPENING_LOT.sku,
    productId: productIds.get(OPENING_LOT.sku)!,
    qty: OPENING_LOT.qty,
    unitCost: OPENING_LOT.unitCost,
    amount: openingRes.amount, // 900,000 สตางค์
    drCode: "1200",
    crCode: "3999",
  },
  costAdjustment: {
    docId: caRes.id,
    docNo: caRes.docNo,
    sku: CA_FIXTURE.sku,
    productId: productIds.get(CA_FIXTURE.sku)!,
    oldCost: caRes.oldCost,
    newCost: caRes.newCost,
    qty: caRes.qty,
    delta: caRes.delta, // (ใหม่−เดิม)×คงเหลือ — บวก = กำไร
    drCode: "1200",
    crCode: "5310",
  },
  // WO 4.1 — สินค้าที่ผูกคลังสินค้า (ตัวเลขอิสระจากเฉลยชุดอื่น · ยอดคงเหลือมาจาก InvItem.onHand)
  inventory: {
    systemId: invSys.id,
    linked: linkedItems,
    linkedCount: linkedItems.length,
    // WO 4.3: นับจากจำนวนสินค้าจริง (เดิมฮาร์ดโค้ด 12 → พังทันทีที่ seed เพิ่มรายการจัดชุด)
    unlinkedCount: productIds.size - linkedItems.length,
  },
  // WO 4.2 — บิลขายหน้าร้าน (POS ส่งบรรทัดเข้าบัญชี) · เอกสารชนิด TAX_INVOICE_ABB (ไม่โพสต์ GL ซ้ำ)
  posSales: {
    docType: "TAX_INVOICE_ABB",
    posSystemId: posSys.id,
    memberSystemId: memSys.id,
    count: posDocs.length,
    lineCount: posDocs.reduce((n, d) => n + d.lines.length, 0),
    grandTotal: posDocs.reduce((n, d) => n + d.grandTotal, 0),
    withContact: posDocs.filter((d) => d.contactId).length,
    sales: posSaleIds,
    docs: posDocs.map((d) => ({
      id: d.id,
      docNo: d.docNo,
      refId: d.refId,
      contactId: d.contactId,
      subTotal: d.subTotal,
      vatAmount: d.vatAmount,
      grandTotal: d.grandTotal,
      lines: d.lines.map((l) => ({ productId: l.productId, qty: Number(l.qty), amount: l.amount })),
    })),
  },
  journal: { needsReview: 0, suspense9999: 0, trialBalanceBalanced: true },
  // WO 5.3 — กระทบยอดธนาคาร (ค่าทั้งหมดมาจาก generator ที่คิดด้วย SQL อิสระ ไม่ใช่จาก reconcile.ts)
  bankReconcile: {
    ...bankFixture,
    statementId: bankImport.statementId,
    imported: bankImport.imported,
    autoMatched: bankAuto.matched,
    autoSuggested: bankAuto.suggested,
    autoUnmatched: bankAuto.unmatched,
    prev: {
      ...bankPrevFixture,
      statementId: bankPrevImport.statementId,
      imported: bankPrevImport.imported,
      autoMatched: bankPrevAuto.matched,
    },
  },
  // WO 5.4 — WHT 2 ขา V2 + เช็ค V2 (§10.4–5 · g11) — id/ยอดของ fixture ให้ qc-acc-v2-wht-cheque.mts อ้างอิง
  // (สคริปต์นั้นยังต้องคำนวณผลรวม/ตัวนับซ้ำด้วย SQL อิสระของตัวเอง — คีย์นี้ไว้ระบุ "ใบไหนคือใบไหน" เท่านั้น)
  whtV2: {
    creditCertIds,
    deductCertIds,
    creditCashInSatang: creditCashIn,
    creditWhtTotalSatang: creditWhtTotal,
    deductCashOutSatang: deductCashOut,
    deductWhtTotalSatang: deductWhtTotal,
    cashWhtDeltaSatang: CASH_WHT_DELTA,
    months: ["2026-08", "2026-09"],
    // WO 5.4 round 2 — 1 ใน 3 ใบหัก (deductCertIds[2] "สำนักงานบัญชี ภูเก็ตแอคเคาท์") ถูกทำเครื่องหมายนำส่งแล้ว
    filedForm: 53,
    filedPeriodKey: "2026-09",
    filedCertId: deductCertIds[2],
  },
  // WO 5.5 — คำขอชำระเงินผ่านลิงก์+QR PromptPay (§0.3 ข้อ 5) · id/ยอด ให้ qc-acc-v2-promptpay.mts อ้างอิง
  promptPay: {
    financeId: finId["EWL001"],
    financeCode: "EWL001",
    promptpayId: "0835565001234",
    beam: {
      requestId: ppBeamReq.request.id,
      token: ppBeamReq.request.token,
      chargeId: PP_BEAM_CHARGE_ID,
      documentId: ppBeamInvoice.id,
      docNo: ppBeamInvoice.docNo,
      amountSatang: PP_BEAM_GRAND,
      paymentId: ppBeamPaid.paymentId,
    },
    staticPending: {
      requestId: ppStaticReq.request.id,
      token: ppStaticReq.request.token,
      documentId: String(fixtures.invNattapholId),
      amountSatang: ppStaticReq.request.amountSatang,
      qrPayload: ppStaticReq.request.qrPayload,
    },
    ewalletDeltaSatang: PP_BEAM_GRAND,
  },
  chequeV2: {
    inDueSoonId: cq1.id,
    inDueSoonChequeNo: "1000123",
    inDueSoonDate: chequeDueSoon.toISOString(),
    inBouncedId: cq2.id,
    inBouncedChequeNo: "1000124",
    outPendingId: cq3.id,
    outPendingChequeNo: "5551001",
    outVoidedId: cq4.id,
    outVoidedChequeNo: "5551002",
  },
  // WO 6.1 — ผังบัญชี V2 (§11.1 · f8) — ตัวเลขทั้งหมดจาก SQL ดิบด้านบน
  coa: {
    monthKey: COA_MONTH_KEY,
    activeAccounts: coaActive,
    byType: Object.fromEntries(coaTypeRows.map((r) => [r.type, Number(r.cnt)])),
    byGroup2: Object.fromEntries(coaGroupRows.map((r) => [r.prefix, Number(r.cnt)])),
    samples: coaSampleRows
      .map((r) => ({ code: r.code, id: r.id, balanceSatang: Number(r.balance), monthDeltaSatang: Number(r.month) }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    custom: { onlineAds: coaCustomId["6301"], rentalIncome: coaCustomId["4031"], archived: coaCustomId["6302"] },
  },
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
