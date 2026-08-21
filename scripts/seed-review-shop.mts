// เติมข้อมูลตัวอย่างให้ "ร้านตัวอย่าง (App Review)" บน prod
//
// ทำไมต้องมี (เจอจริง 21 ส.ค. 2026): ร้านที่สร้างไว้ให้ผู้ตรวจสโตร์ **ว่างเปล่า** —
// สินค้า 0 · พนักงาน 0 · ยอดขาย 0 · นัดหมาย 0 (มีแค่บริการ 3 รายการ + ช่าง 1 คน)
// → ผู้ตรวจ Apple เปิดแอปแล้วเจอแต่หน้าจอ "ยังไม่มี…" ทุกหน้า = ประเมินแอปไม่ได้ (เสี่ยงข้อ 2.1)
// → และรูปหน้าจอที่เอาไปโชว์บน landing ก็จะเป็นหน้าจอเปล่า
//
// กติกาของสคริปต์นี้:
//   · รันซ้ำได้ (idempotent) — ทุกอย่างมี key/เช็คก่อนสร้าง ไม่งอกซ้ำ
//   · แตะเฉพาะ tenant ของร้านตัวอย่างเท่านั้น (resolve จากชื่อ ไม่ hardcode id)
//   · ใช้ service จริงของแต่ละโมดูล ไม่ยัด prisma ตรง → ข้อมูลที่ได้เดินตามกติกาเดียวกับผู้ใช้จริง
//
// ใช้: pnpm exec tsx scripts/seed-review-shop.mts
try { process.loadEnvFile(".env"); } catch { /* CI ใช้ secrets */ }

const { prisma } = await import("@/lib/core/db");
const hr = await import("@/lib/modules/hr/service");
const inventory = await import("@/lib/modules/inventory/service");
const booking = await import("@/lib/modules/booking/service");
const pos = await import("@/lib/modules/pos/service");

const TENANT_NAME = "ร้านตัวอย่าง (App Review)";

const tenant = await prisma.tenant.findFirst({ where: { name: TENANT_NAME }, select: { id: true } });
if (!tenant) {
  console.error(`❌ ไม่พบร้าน "${TENANT_NAME}" — สคริปต์นี้ไม่สร้างร้านใหม่โดยตั้งใจ (กันสร้างผิดร้านบน prod)`);
  process.exit(1);
}
const tenantId = tenant.id;

const unit = await prisma.businessUnit.findFirst({ where: { tenantId, type: "BOOKING" }, select: { id: true, slug: true } });
const sysOf = async (type: "POS" | "INVENTORY" | "HR") =>
  (await prisma.appSystem.findFirst({ where: { tenantId, type }, select: { id: true } }))?.id ?? null;
const [posId, invId, hrId] = await Promise.all([sysOf("POS"), sysOf("INVENTORY"), sysOf("HR")]);

console.log(`ร้าน ${tenantId} · unit ${unit?.slug ?? "-"} · POS ${posId ? "✓" : "-"} · คลัง ${invId ? "✓" : "-"} · HR ${hrId ? "✓" : "-"}\n`);

// ── 1. พนักงาน (HR) ──
if (hrId) {
  const ctx = { tenantId, systemId: hrId };
  const EMPLOYEES = [
    { name: "สมชาย ใจดี", position: "ช่างทำผมอาวุโส", phone: "0812345671", pinCode: "1101" },
    { name: "นภา ศรีสุข", position: "ช่างทำสี", phone: "0812345672", pinCode: "1102" },
    { name: "ปิยะ วงศ์ทอง", position: "ผู้ช่วยช่าง", phone: "0812345673", pinCode: "1103" },
    { name: "มานี รักงาน", position: "แคชเชียร์ / ต้อนรับ", phone: "0812345674", pinCode: "1104" },
  ];
  const existing = await hr.listEmployees(ctx);
  const have = new Set(existing.map((e) => e.name));
  let added = 0;
  for (const e of EMPLOYEES) {
    if (have.has(e.name)) continue;
    await hr.createEmployee(ctx, e);
    added++;
  }
  console.log(`👤 พนักงาน: มีอยู่ ${existing.length} · เพิ่มใหม่ ${added}`);
}

// ── 2. สินค้าในคลัง + รับเข้าให้มีสต็อกจริง ──
if (invId) {
  const ctx = { tenantId, systemId: invId };
  const ITEMS = [
    { sku: "SH-01", name: "แชมพูสูตรอ่อนโยน 300ml", unitLabel: "ขวด", category: "ผลิตภัณฑ์ดูแลผม", costSatang: 12000, qty: 24, reorderPoint: 6 },
    { sku: "CD-01", name: "ครีมนวดผม 300ml", unitLabel: "ขวด", category: "ผลิตภัณฑ์ดูแลผม", costSatang: 13500, qty: 18, reorderPoint: 6 },
    { sku: "TR-01", name: "ทรีตเมนต์บำรุงเข้มข้น", unitLabel: "หลอด", category: "ทรีตเมนต์", costSatang: 22000, qty: 12, reorderPoint: 4 },
    { sku: "SR-01", name: "เซรั่มบำรุงปลายผม", unitLabel: "ขวด", category: "ทรีตเมนต์", costSatang: 28000, qty: 9, reorderPoint: 4 },
    { sku: "HS-01", name: "สเปรย์จัดแต่งทรงผม", unitLabel: "กระป๋อง", category: "จัดแต่งทรงผม", costSatang: 16000, qty: 15, reorderPoint: 5 },
    { sku: "CL-01", name: "น้ำยาดัดผม", unitLabel: "ชุด", category: "เคมี", costSatang: 45000, qty: 4, reorderPoint: 5 }, // ตั้งใจให้ต่ำกว่าจุดสั่งซื้อ → โชว์การ์ด "ใกล้หมด"
  ];
  const existing = await inventory.listItems(ctx);
  const bySku = new Map(existing.map((i) => [i.sku, i.id]));
  let added = 0;
  let received = 0;
  for (const it of ITEMS) {
    let id = bySku.get(it.sku);
    if (!id) {
      id = (await inventory.createItem(ctx, {
        sku: it.sku,
        name: it.name,
        unitLabel: it.unitLabel,
        category: it.category,
        costSatang: it.costSatang,
        reorderPoint: it.reorderPoint,
        kind: "PRODUCT",
      })).id;
      added++;
    }
    // idempotencyKey ตายตัวต่อ sku → รับเข้าซ้ำกี่รอบก็ไม่บวกสต็อกเพิ่ม
    await inventory.receive(ctx, {
      itemId: id,
      qty: it.qty,
      costSatang: it.costSatang,
      idempotencyKey: `seed-review-${it.sku}`,
      note: "รับเข้ารอบเปิดร้าน (ข้อมูลตัวอย่าง)",
    });
    received++;
  }
  console.log(`📦 สินค้า: มีอยู่ ${existing.length} · เพิ่มใหม่ ${added} · รับเข้า ${received} รายการ`);
}

// ── 3. ช่างเพิ่ม (ให้ตารางจองมีมากกว่า 1 คอลัมน์) ──
if (unit) {
  const staff = await prisma.bookingStaff.findMany({ where: { tenantId, unitId: unit.id }, select: { id: true, name: true } });
  const have = new Set(staff.map((s) => s.name));
  let added = 0;
  for (const name of ["ช่างบี", "ช่างซี"]) {
    if (have.has(name)) continue;
    await booking.createStaff({ tenantId, unitId: unit.id, name });
    added++;
  }
  console.log(`✂️  ช่าง: มีอยู่ ${staff.length} · เพิ่มใหม่ ${added}`);
}

// ── 4. นัดหมายวันนี้/พรุ่งนี้ (ต้องเป็นเวลาอนาคต — service บล็อกเวลาที่ผ่านไปแล้ว) ──
if (unit) {
  const services = await prisma.bookingService.findMany({ where: { tenantId, active: true }, select: { id: true, name: true } });
  const staff = await prisma.bookingStaff.findMany({ where: { tenantId, unitId: unit.id, active: true }, select: { id: true, name: true } });
  // วันที่ท้องถิ่น (ไทย) — ห้ามใช้วันที่ฮาร์ดโค้ด (บทเรียน F11: ข้อสอบ/ข้อมูลเน่าตามเวลา)
  const bkk = (d: Date) => new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const today = bkk(new Date());
  const tomorrow = bkk(new Date(Date.now() + 86400_000));
  const PLAN = [
    { dateStr: today, startMin: 13 * 60, svc: 0, st: 0, name: "คุณอรุณี", phone: "0863331101" },
    { dateStr: today, startMin: 14 * 60 + 30, svc: 1, st: 1 % Math.max(staff.length, 1), name: "คุณธนวัฒน์", phone: "0863331102" },
    { dateStr: today, startMin: 16 * 60, svc: 2, st: 2 % Math.max(staff.length, 1), name: "คุณพิมพ์ชนก", phone: "0863331103" },
    { dateStr: tomorrow, startMin: 11 * 60, svc: 1, st: 0, name: "คุณวีรพล", phone: "0863331104" },
    { dateStr: tomorrow, startMin: 15 * 60, svc: 0, st: 1 % Math.max(staff.length, 1), name: "คุณสุดารัตน์", phone: "0863331105" },
  ];
  let ok = 0;
  const skipped: string[] = [];
  for (const [i, p] of PLAN.entries()) {
    const svc = services[p.svc];
    const st = staff[p.st];
    if (!svc || !st) continue;
    const r = await booking.createAppointment({
      tenantId,
      unitId: unit.id,
      serviceId: svc.id,
      staffId: st.id,
      dateStr: p.dateStr,
      startMin: p.startMin,
      customerName: p.name,
      customerPhone: p.phone,
      source: "STAFF",
      idempotencyKey: `seed-review-appt-${p.dateStr}-${i}`,
    });
    if (r.ok) ok++;
    else skipped.push(`${p.dateStr} ${Math.floor(p.startMin / 60)}:00 — ${r.reason}`);
  }
  console.log(`📅 นัดหมาย: สำเร็จ ${ok}/${PLAN.length}${skipped.length ? ` · ข้าม: ${skipped.join(" | ")}` : ""}`);
}

// ── 5. บิลขายวันนี้ (ให้ "ยอดขายวันนี้" ไม่เป็น ฿0) ──
// ใช้ line แบบพิมพ์ชื่อเอง (ไม่ผูก itemId) → ไม่ตัดสต็อก ไม่ต้องมีระบบบัญชีผูก
if (unit && posId) {
  const BILLS = [
    { key: "a", lines: [{ name: "ตัดผมชาย", qty: 1, unitPriceSatang: 15000 }], pay: "CASH" as const },
    { key: "b", lines: [{ name: "สระ+ไดร์", qty: 1, unitPriceSatang: 25000 }, { name: "แชมพูสูตรอ่อนโยน 300ml", qty: 1, unitPriceSatang: 19000 }], pay: "PROMPTPAY" as const },
    { key: "c", lines: [{ name: "ทำสีผม", qty: 1, unitPriceSatang: 90000 }, { name: "ทรีตเมนต์บำรุงเข้มข้น", qty: 1, unitPriceSatang: 35000 }], pay: "TRANSFER" as const },
    { key: "d", lines: [{ name: "ตัดผมชาย", qty: 2, unitPriceSatang: 15000 }], pay: "CASH" as const },
  ];
  let ok = 0;
  const errs: string[] = [];
  for (const b of BILLS) {
    const total = b.lines.reduce((a, l) => a + l.qty * l.unitPriceSatang, 0);
    try {
      await pos.createSale({
        tenantId,
        unitId: unit.id,
        systemId: posId,
        idempotencyKey: `seed-review-sale-${b.key}`,
        lines: b.lines,
        payMethods: [{ type: b.pay, amountSatang: total }],
      });
      ok++;
    } catch (e) {
      errs.push(`${b.key}: ${e instanceof Error ? e.message.slice(0, 90) : String(e)}`);
    }
  }
  console.log(`🧾 บิลขาย: สำเร็จ ${ok}/${BILLS.length}${errs.length ? ` · พลาด: ${errs.join(" | ")}` : ""}`);
}

console.log("\n✅ เติมข้อมูลตัวอย่างเสร็จ — รันซ้ำได้ ไม่งอกซ้ำ");
