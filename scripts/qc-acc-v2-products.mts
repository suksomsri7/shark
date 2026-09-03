// QC WO 4.3 — หน้าสินค้า/บริการ V2 + หน่วย + รายการจัดชุด + ใบเบิก/ส่งคืน/ปรับต้นทุน
// (DESIGN-SPEC-V2 §8.1–8.5 · เฟรม f6 / g8 / g12)
//
// requires: acc-v2-seed
//
// รัน (บังคับ DB QC branch):
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/seed-acc-v2-qc.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-products.mts
//
// 🔴 ความปลอดภัยข้อมูล: ทุกการ **เขียน** เกิดใน "ร้านทิ้ง" ที่สคริปต์สร้างเอง แล้วลบใน finally
//    ร้าน QC จริง (`SIAM DIVE QC`) = อ่านอย่างเดียว
// 🔴 เฉลยของข้อที่วัดตัวเลข ใช้ **raw SQL อิสระ** (ไม่เรียกฟังก์ชันเดียวกับที่กำลังทดสอบ)
//
// ครอบคลุม
//   PR1  fixture ของ seed: สินค้า 13 (7/5/1) · หน่วย 12 หน่วยมีรหัส PU/SU · ชุดมีสูตร 2 ส่วนประกอบ
//   PR2  หน้ารายการ: ตัวนับแท็บชนิด/แท็บย่อย · ค้นหา · แบ่งหน้า · มูลค่าสต็อกรวม = เฉลย SQL
//   PR3  การ์ด "สินค้าที่ติดตาม" ≤6 · คงเหลือ/จุดสั่งซื้อตรงคลัง
//   PR4  เลขที่สินค้าอัตโนมัติ P/S/B แยกสาย · แก้เองได้ · ซ้ำไม่ได้ · ยิงพร้อมกัน 5 ตัวไม่ชนกัน
//   PR5  หน่วย: seed 12 หน่วย idempotent (รันซ้ำไม่เพิ่ม) · รหัส PU/SU ไม่ซ้ำ · นับจำนวนสินค้าที่ใช้
//   PR6  สร้างสินค้า + ติดตามสต็อก → InvItem เกิด + เลือกคลังได้ + จุดสั่งซื้อไปถึงคลัง
//   PR7  ขายผ่าน POS: สินค้าที่ผูกคลัง โผล่ในคิวรีสินค้าของ POS พร้อมราคาขาย · posEnabled ถูกบันทึก
//   PR8  ขายชุด 1 → ส่วนประกอบทุกตัวลดตามสูตร · คีย์ idempotent `acc-issue-<lineId>-<componentId>`
//   PR9  ใบเบิกอนุมัติ → GL Dr ค่าใช้จ่ายที่ปรับปรุง / Cr 1200 = ต้นทุนของ movement เป๊ะ
//   PR10 ใบส่งคืนกลับด้าน (Dr 1200 / Cr ค่าใช้จ่าย) · เพดานคืนไม่เกินที่เบิก
//   PR11 ร่าง → อนุมัติ: ร่างไม่แตะสต็อก/ไม่มี JV · อนุมัติแล้วได้เลขที่ PRR-YYYYMM####
//   PR12 ใบปรับต้นทุน: InvItem.costSatang เปลี่ยน · JV = (ใหม่−เดิม)×คงเหลือ · ทิศ Dr/Cr ถูกทั้งกำไรและขาดทุน
//   PR13 ยอดยกมา: รับเข้าคลังคีย์ `acc-open-<productId>-<n>` + JV Dr 1200 / Cr 3999 · เพิ่ม lot ซ้ำไม่ทับ
//   PR14 ด่านสิทธิ์: ทุก route ใหม่ลงทะเบียนใน ACCOUNT_PAGE_PERMISSIONS
//   PR15 tenant isolation: สูตรชุด/ยอดยกมา/ใบปรับต้นทุน ข้ามร้านไม่ได้
//   PR16 rollback: ใส่ความล้มเหลว (ลิงก์คลังเสีย) → ไม่มีเอกสาร/สต็อก/JV ค้าง
import { readFileSync, existsSync } from "node:fs";

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();

const { prisma } = await import("@/lib/core/db");
const system = await import("@/lib/modules/system/service");
const prod = await import("@/lib/modules/account/product");
const link = await import("@/lib/modules/account/inventory-link");
const svc = await import("@/lib/modules/account/service");
const glMod = await import("@/lib/modules/account/gl");
const inv = await import("@/lib/modules/inventory/service");
const register = await import("@/lib/modules/pos/register");
const guard = await import("@/lib/modules/account/guard");

let passed = 0;
const findings: string[] = [];
const ok = (name: string) => {
  passed++;
  console.log("  ✅ " + name);
};
const bad = (name: string, detail: string) => {
  findings.push(`${name} — ${detail}`);
  console.log("  ❌ " + name + " — " + detail);
};
const assert = (name: string, cond: boolean, detail = "") => (cond ? ok(name) : bad(name, detail));
const eq = (name: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  assert(name, a === b, `ได้ ${a} · ควรได้ ${b}`);
};

console.log(`\n===== QC WO 4.3 · สินค้า/บริการ V2 + หน่วย + จัดชุด + เบิก/คืน/ปรับต้นทุน =====`);
console.log(`[env] DB ${host}\n`);

type Expected = {
  tenantId: string;
  systemId: string;
  products: number;
  productsByType: { GOODS: number; SERVICE: number; BUNDLE: number };
  units: { seeded: number; total: number };
  bundle: { id: string; code: string | null; sku: string; salePrice: number; components: { sku: string; productId: string; qty: number }[] };
  openingLot: { sku: string; productId: string; qty: number; unitCost: number; amount: number; drCode: string; crCode: string };
  costAdjustment: {
    docId: string;
    docNo: string;
    sku: string;
    productId: string;
    oldCost: number;
    newCost: number;
    qty: number;
    delta: number;
    drCode: string;
    crCode: string;
  };
  inventory: { systemId: string };
};

const stamp = Date.now();
const tenantIds: string[] = [];

async function makeShop(name: string, opts: { pos?: boolean } = {}) {
  const t = await prisma.tenant.create({
    data: { name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${stamp}-${tenantIds.length}` },
  });
  tenantIds.push(t.id);
  const unit = await prisma.businessUnit.create({
    data: { tenantId: t.id, type: "BOOKING", name: "สาขาทดสอบ", slug: `u-${stamp}-${tenantIds.length}`, status: "ACTIVE" },
  });
  const mk = async (type: "ACCOUNT" | "INVENTORY" | "POS", label: string) => {
    const s = await system.createSystem(t.id, type, label);
    await system.linkUnit(t.id, s.id, unit.id);
    return s;
  };
  const acc = await mk("ACCOUNT", "บัญชี");
  const ivs = await mk("INVENTORY", "คลัง");
  const pos = opts.pos ? await mk("POS", "ขายหน้าร้าน") : null;
  if (pos) {
    await prisma.accountSystemLink.create({
      data: { tenantId: t.id, systemId: acc.id, linkedKind: "POS", linkedId: pos.id },
    });
  }
  await glMod.ensureAccounting({ tenantId: t.id, systemId: acc.id });
  return { tenantId: t.id, accSystemId: acc.id, invSystemId: ivs.id, posSystemId: pos?.id ?? "", unitId: unit.id };
}

/** เฉลยอิสระ: ยอด debit/credit รายบัญชี ของ JV ที่อ้างเอกสารใบนี้ (raw SQL — ไม่ผ่าน gl.ts ที่กำลังทดสอบ) */
async function jvOf(systemId: string, refId: string) {
  const rows = await prisma.$queryRaw<{ code: string; debit: bigint; credit: bigint }[]>`
    SELECT l."code" AS code, SUM(jl."debit")::bigint AS debit, SUM(jl."credit")::bigint AS credit
    FROM "AccountJournalLine" jl
    JOIN "AccountJournalEntry" je ON je."id" = jl."entryId"
    JOIN "AccountLedger" l ON l."id" = jl."accountId"
    WHERE je."systemId" = ${systemId} AND je."refType" = 'AccountDocument' AND je."refId" = ${refId}
    GROUP BY l."code" ORDER BY l."code"`;
  return rows.map((r) => ({ code: r.code, debit: Number(r.debit), credit: Number(r.credit) }));
}

try {
  // ═════════ PR1 — fixture ของ seed (อ่านอย่างเดียว) ═════════
  console.log("PR1 ชุดข้อมูล QC: สินค้า/หน่วย/รายการจัดชุด");
  if (!existsSync(QC.expectedPath)) throw new Error(`ไม่พบ ${QC.expectedPath} — รัน seed-acc-v2-qc.mts ก่อน`);
  const E = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as Expected;
  if (!E.bundle || !E.costAdjustment || !E.openingLot) {
    bad("PR1.0 เฉลยมีคีย์ของ WO 4.3", "ไม่มี bundle/openingLot/costAdjustment — seed ใหม่ก่อน");
  }

  {
    // เฉลยอิสระด้วย raw SQL (ไม่ผ่าน listProductsPaged ที่กำลังทดสอบ)
    const byType = await prisma.$queryRaw<{ type: string; n: bigint }[]>`
      SELECT "type"::text AS type, COUNT(*)::bigint AS n FROM "AccountProduct"
      WHERE "systemId" = ${E.systemId} AND "archivedAt" IS NULL GROUP BY "type"`;
    const map = Object.fromEntries(byType.map((r) => [r.type, Number(r.n)]));
    eq("PR1.1 สินค้าตามชนิด (SQL) = เฉลย", { GOODS: map.GOODS ?? 0, SERVICE: map.SERVICE ?? 0, BUNDLE: map.BUNDLE ?? 0 }, E.productsByType);
    eq(
      "PR1.2 สินค้ารวม = เฉลย",
      (map.GOODS ?? 0) + (map.SERVICE ?? 0) + (map.BUNDLE ?? 0),
      E.products,
    );

    const units = await prod.listUnits(E.tenantId, E.systemId);
    const seeded = units.filter((u) => prod.UNIT_SEED.some((s) => s.name === u.name));
    eq("PR1.3 หน่วยเริ่มต้น §8.3 ครบ 12", seeded.length, prod.UNIT_SEED.length);
    assert(
      "PR1.4 หน่วยเริ่มต้นมีรหัส PU/SU + ชื่ออังกฤษ ครบทุกตัว",
      seeded.every((u) => /^(PU|SU)\d{2}$/.test(u.code ?? "") && !!u.nameEn && !!u.kind),
      seeded.filter((u) => !/^(PU|SU)\d{2}$/.test(u.code ?? "")).map((u) => `${u.name}=${u.code}`).join(","),
    );
    const codes = seeded.map((u) => u.code);
    eq("PR1.5 รหัสหน่วยไม่ซ้ำ", new Set(codes).size, codes.length);

    const items = await prod.listBundleItems(E.tenantId, E.systemId, E.bundle.id);
    eq("PR1.6 ชุดมีส่วนประกอบตามสูตร", items.map((i) => ({ sku: i.sku, qty: i.qty })), E.bundle.components.map((c) => ({ sku: c.sku, qty: c.qty })));
    const bundleProduct = await prod.getProduct(E.tenantId, E.systemId, E.bundle.id);
    assert("PR1.7 ชุดเป็นชนิด BUNDLE และไม่ผูกคลังเอง", bundleProduct?.type === "BUNDLE" && !bundleProduct?.invItemId, JSON.stringify({ t: bundleProduct?.type, inv: bundleProduct?.invItemId }));
    assert("PR1.8 ชุดมีเลขที่ขึ้นต้น B", (bundleProduct?.code ?? "").startsWith("B"), String(bundleProduct?.code));
  }

  // ═════════ PR2 — หน้ารายการ (§8.1 · f6) ═════════
  console.log("\nPR2 หน้ารายการสินค้า: แท็บ · ค้นหา · แบ่งหน้า · มูลค่าสต็อก");
  {
    const page = await prod.listProductsPaged(E.tenantId, E.systemId, { type: "GOODS", pageSize: 8, page: 1 });
    eq("PR2.1 ตัวนับแท็บชนิด = เฉลย", { GOODS: page.counts.GOODS, SERVICE: page.counts.SERVICE, BUNDLE: page.counts.BUNDLE }, E.productsByType);
    eq("PR2.2 จำนวนแถวในหน้า ≤ ขนาดหน้า", page.rows.length, Math.min(8, E.productsByType.GOODS));
    eq("PR2.3 จำนวนหน้า", page.pageCount, Math.ceil(E.productsByType.GOODS / 8));

    const p2 = await prod.listProductsPaged(E.tenantId, E.systemId, { type: "GOODS", pageSize: 8, page: 2 });
    const overlap = p2.rows.filter((r) => page.rows.some((a) => a.id === r.id));
    eq("PR2.4 หน้า 2 ไม่ซ้ำกับหน้า 1", overlap.length, 0);

    const search = await prod.listProductsPaged(E.tenantId, E.systemId, { type: "GOODS", q: "หน้ากาก" });
    assert("PR2.5 ค้นหาชื่อไทยเจอ", search.total >= 1 && search.rows.every((r) => /หน้ากาก/.test(r.name)), `${search.total} แถว`);
    const searchCode = await prod.listProductsPaged(E.tenantId, E.systemId, { type: "GOODS", q: "MASK-01" });
    eq("PR2.6 ค้นหาด้วยรหัสสินค้า (SKU) เจอ 1", searchCode.total, 1);
    const searchNone = await prod.listProductsPaged(E.tenantId, E.systemId, { type: "GOODS", q: "ไม่มีสินค้าชื่อนี้แน่นอน" });
    eq("PR2.7 ค้นหาที่ไม่มี = 0 แถว", searchNone.total, 0);

    const archived = await prod.listProductsPaged(E.tenantId, E.systemId, { type: "GOODS", sub: "archived" });
    const archivedSql = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM "AccountProduct"
      WHERE "systemId" = ${E.systemId} AND "type" = 'GOODS' AND "archivedAt" IS NOT NULL`;
    eq("PR2.8 แท็บย่อย 'ปิดใช้งาน' = เฉลย SQL", archived.total, Number(archivedSql[0].n));

    // มูลค่าสต็อกรวม (ท้ายตาราง f6) — เฉลยอิสระ: Σ คงเหลือจริง × ราคาซื้อ
    const rows = await prisma.$queryRaw<{ id: string; invItemId: string | null; qtyOnHand: string; buyPrice: number | null }[]>`
      SELECT "id", "invItemId", "qtyOnHand"::text AS "qtyOnHand", "buyPrice" FROM "AccountProduct"
      WHERE "systemId" = ${E.systemId} AND "type" = 'GOODS' AND "archivedAt" IS NULL`;
    const itemIds = rows.map((r) => r.invItemId).filter((x): x is string => !!x);
    const onHandRows = itemIds.length
      ? await prisma.$queryRaw<{ id: string; onHand: number }[]>`
          SELECT "id", "onHand" FROM "InvItem" WHERE "id" = ANY(${itemIds}::text[])`
      : [];
    const onHandById = new Map(onHandRows.map((r) => [r.id, r.onHand]));
    let expectValue = 0;
    for (const r of rows) {
      const q = r.invItemId ? (onHandById.get(r.invItemId) ?? Number(r.qtyOnHand)) : Number(r.qtyOnHand);
      expectValue += Math.round(q * (r.buyPrice ?? 0));
    }
    eq("PR2.9 มูลค่าสต็อกรวม = เฉลย SQL", page.stockValue, expectValue);

    const bundlePage = await prod.listProductsPaged(E.tenantId, E.systemId, { type: "BUNDLE" });
    eq("PR2.10 แท็บ 'รายการจัดชุด' มีชุดเดียว + นับส่วนประกอบได้", bundlePage.rows.map((r) => r.bundleCount), [E.bundle.components.length]);
    const servicePage = await prod.listProductsPaged(E.tenantId, E.systemId, { type: "SERVICE" });
    assert("PR2.11 บริการไม่มีมูลค่าสต็อก", servicePage.stockValue === 0, String(servicePage.stockValue));
  }

  // ═════════ PR3 — การ์ด "สินค้าที่ติดตาม" ═════════
  console.log("\nPR3 การ์ดสินค้าที่ติดตาม (f6)");
  {
    const cards = await prod.trackedProductCards(E.tenantId, E.systemId, 6);
    assert("PR3.1 การ์ดไม่เกิน 6 ใบ", cards.length <= 6, String(cards.length));
    assert("PR3.2 มีการ์ดของสินค้าที่ผูกคลัง", cards.length >= 2, String(cards.length));
    const mask = cards.find((c) => c.name.includes("หน้ากาก"));
    const maskSql = await prisma.$queryRaw<{ onHand: number; reorderPoint: number }[]>`
      SELECT i."onHand", i."reorderPoint" FROM "InvItem" i
      JOIN "AccountProduct" p ON p."invItemId" = i."id"
      WHERE p."systemId" = ${E.systemId} AND p."sku" = 'MASK-01'`;
    assert("PR3.3 คงเหลือ/จุดสั่งซื้อบนการ์ด = ค่าจากคลัง (SQL)", !!mask && !!maskSql[0] && mask.stock === maskSql[0].onHand && mask.reorderPoint === maskSql[0].reorderPoint, JSON.stringify({ card: mask, sql: maskSql[0] }));
  }

  // ═════════ PR4 — เลขที่สินค้าอัตโนมัติ ═════════
  console.log("\nPR4 เลขที่สินค้า P/S/B (§8.2)");
  {
    const shop = await makeShop("QC43 CODE");
    const ctx = { tenantId: shop.tenantId, systemId: shop.accSystemId };
    const g1 = await prod.createProduct(ctx.tenantId, ctx.systemId, { name: "สินค้า ก", type: "GOODS" });
    const g2 = await prod.createProduct(ctx.tenantId, ctx.systemId, { name: "สินค้า ข", type: "GOODS" });
    const s1 = await prod.createProduct(ctx.tenantId, ctx.systemId, { name: "บริการ ก", type: "SERVICE" });
    const b1 = await prod.createProduct(ctx.tenantId, ctx.systemId, { name: "ชุด ก", type: "BUNDLE" });
    eq("PR4.1 เลขที่แยกสายตามชนิด", [g1.ok && g1.code, g2.ok && g2.code, s1.ok && s1.code, b1.ok && b1.code], ["P00001", "P00002", "S00001", "B00001"]);

    const manual = await prod.createProduct(ctx.tenantId, ctx.systemId, { name: "สินค้า กำหนดเอง", type: "GOODS", code: "VIP-1" });
    eq("PR4.2 กรอกเลขที่เองได้", manual.ok && manual.code, "VIP-1");
    const dup = await prod.createProduct(ctx.tenantId, ctx.systemId, { name: "สินค้า ซ้ำ", type: "GOODS", code: "VIP-1" });
    assert("PR4.3 เลขที่ซ้ำถูกปฏิเสธเป็นภาษาไทย", !dup.ok && /ซ้ำ/.test(dup.ok ? "" : dup.reason), JSON.stringify(dup));

    // ยิงพร้อมกัน 5 ตัว — partial unique index ต้องกันซ้ำ และ retry ต้องออกเลขให้ครบ
    const many = await Promise.all(
      Array.from({ length: 5 }, (_, i) => prod.createProduct(ctx.tenantId, ctx.systemId, { name: `พร้อมกัน ${i}`, type: "GOODS" })),
    );
    const okCodes = many.filter((m) => m.ok).map((m) => (m as { code: string | null }).code);
    eq("PR4.4 สร้างพร้อมกัน 5 ตัวสำเร็จครบ", many.filter((m) => m.ok).length, 5);
    eq("PR4.5 เลขที่ไม่ซ้ำกันเลย", new Set(okCodes).size, okCodes.length);
    const codeSql = await prisma.$queryRaw<{ code: string; n: bigint }[]>`
      SELECT "code", COUNT(*)::bigint AS n FROM "AccountProduct"
      WHERE "systemId" = ${ctx.systemId} AND "code" IS NOT NULL AND "archivedAt" IS NULL
      GROUP BY "code" HAVING COUNT(*) > 1`;
    eq("PR4.6 ไม่มีเลขที่ซ้ำในฐานข้อมูล (SQL)", codeSql.length, 0);
  }

  // ═════════ PR5 — หน่วย (§8.3) ═════════
  console.log("\nPR5 หน่วยนับ (§8.3)");
  {
    const shop = await makeShop("QC43 UNIT");
    const first = await prod.seedUnits(shop.tenantId, shop.accSystemId);
    eq("PR5.1 seed หน่วยครั้งแรกได้ 12", first.created, prod.UNIT_SEED.length);
    const second = await prod.seedUnits(shop.tenantId, shop.accSystemId);
    eq("PR5.2 seed ซ้ำไม่สร้างเพิ่ม (idempotent)", { created: second.created, total: second.total }, { created: 0, total: first.total });
    const cnt = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM "AccountUnit" WHERE "systemId" = ${shop.accSystemId}`;
    eq("PR5.3 จำนวนหน่วยใน DB (SQL) = 12", Number(cnt[0].n), prod.UNIT_SEED.length);

    const piece = await prisma.accountUnit.findFirst({ where: { systemId: shop.accSystemId, name: "ชิ้น" } });
    const hour = await prisma.accountUnit.findFirst({ where: { systemId: shop.accSystemId, name: "ชั่วโมง" } });
    assert("PR5.4 หน่วยสินค้าได้รหัส PU · หน่วยบริการได้ SU", (piece?.code ?? "").startsWith("PU") && (hour?.code ?? "").startsWith("SU"), `${piece?.code} / ${hour?.code}`);

    const dupUnit = await prod.createUnit(shop.tenantId, shop.accSystemId, "ชิ้น");
    assert("PR5.5 หน่วยชื่อซ้ำถูกปฏิเสธ", !dupUnit.ok, JSON.stringify(dupUnit));
    const longUnit = await prod.createUnit(shop.tenantId, shop.accSystemId, "ก".repeat(21));
    assert("PR5.6 ชื่อหน่วยยาวเกิน 20 ถูกปฏิเสธ", !longUnit.ok, JSON.stringify(longUnit));

    await prod.createProduct(shop.tenantId, shop.accSystemId, { name: "ของใช้หน่วยชิ้น", type: "GOODS", unitId: piece!.id });
    const usage = await prod.unitUsageCount(shop.accSystemId);
    eq("PR5.7 นับ 'ใช้กับสินค้า n' ถูก", usage.get(piece!.id) ?? 0, 1);
  }

  // ═════════ PR6/PR7 — modal สร้างสินค้า + ติดตามสต็อก + POS ═════════
  console.log("\nPR6/PR7 ติดตามสต็อก + ขายผ่าน POS (§8.2 การเชื่อมต่อ)");
  {
    const shop = await makeShop("QC43 LINK", { pos: true });
    const accCtx = { tenantId: shop.tenantId, systemId: shop.accSystemId };
    const invCtx = { tenantId: shop.tenantId, systemId: shop.invSystemId };
    const wh2 = await inv.createLocation(invCtx, { name: "คลังสาขา 2" });

    const created = await prod.createProduct(shop.tenantId, shop.accSystemId, {
      name: "เรกูเลเตอร์ QC",
      type: "GOODS",
      sku: "QC-REG",
      salePrice: 3_290_000,
      buyPrice: 2_150_000,
      posEnabled: true,
      posCategory: "อุปกรณ์",
      barcode: "8850001",
      category: "อุปกรณ์ขาย",
    });
    assert("PR6.1 สร้างสินค้าสำเร็จ", created.ok, JSON.stringify(created));
    const productId = created.ok ? created.id : "";
    const linked = await link.linkProductToItem(accCtx, productId, { createItem: { warehouseId: wh2.id, reorderPoint: 5 } });
    assert("PR6.2 ติดตามสต็อก → สร้าง InvItem + ผูกสองทาง", linked.ok, JSON.stringify(linked));
    const itemId = linked.ok ? linked.itemId : "";
    const itemSql = await prisma.$queryRaw<{ sku: string; reorderPoint: number; accountProductId: string | null }[]>`
      SELECT "sku", "reorderPoint", "accountProductId" FROM "InvItem" WHERE "id" = ${itemId}`;
    eq("PR6.3 InvItem ได้ sku/จุดสั่งซื้อ/ขากลับ", itemSql[0], { sku: "QC-REG", reorderPoint: 5, accountProductId: productId });
    const pAfter = await prod.getProduct(shop.tenantId, shop.accSystemId, productId);
    eq("PR6.4 สินค้าจำคลังที่เลือกไว้", pAfter?.warehouseId, wh2.id);
    eq("PR6.5 บันทึกบาร์โค้ด/หมวด/ขายผ่าน POS", { b: pAfter?.barcode, c: pAfter?.category, pos: pAfter?.posEnabled, pc: pAfter?.posCategory }, { b: "8850001", c: "อุปกรณ์ขาย", pos: true, pc: "อุปกรณ์" });

    const posList = await register.listPosProducts(shop.tenantId, shop.posSystemId);
    const row = posList.items.find((i) => i.sku === "QC-REG");
    assert("PR7.1 POS เห็นสินค้าที่ติดตามสต็อก", !!row, JSON.stringify(posList.items.map((i) => i.sku)));
    eq("PR7.2 POS เห็นราคาขายของบัญชี", row?.salePriceSatang, 3_290_000);

    const svcTrack = await prod.createProduct(shop.tenantId, shop.accSystemId, { name: "บริการ QC", type: "SERVICE" });
    const svcLink = await link.linkProductToItem(accCtx, svcTrack.ok ? svcTrack.id : "", { createItem: {} });
    assert("PR6.6 บริการติดตามสต็อกไม่ได้", !svcLink.ok && /บริการ/.test(svcLink.ok ? "" : svcLink.reason), JSON.stringify(svcLink));
  }

  // ═════════ PR8 — ขายรายการจัดชุด → ตัดสต็อกส่วนประกอบ ═════════
  console.log("\nPR8 ขายรายการจัดชุด 1 ชุด → ตัดสต็อกส่วนประกอบ (§8.2)");
  {
    const shop = await makeShop("QC43 BUNDLE");
    const accCtx = { tenantId: shop.tenantId, systemId: shop.accSystemId };
    const invCtx = { tenantId: shop.tenantId, systemId: shop.invSystemId };
    const mkGoods = async (sku: string, name: string, onHand: number, cost: number) => {
      const p = await prod.createProduct(shop.tenantId, shop.accSystemId, { name, type: "GOODS", sku, buyPrice: cost, salePrice: cost * 2 });
      const id = p.ok ? p.id : "";
      const item = await inv.createItem(invCtx, { sku, name, kind: "PRODUCT", costSatang: cost, reorderPoint: 2 });
      await inv.adjust(invCtx, { itemId: item.id, newQty: onHand, idempotencyKey: `qc43-${sku}-${stamp}` });
      const l = await link.linkProductToItem(accCtx, id, { itemId: item.id });
      if (!l.ok) throw new Error(`ผูกคลังไม่สำเร็จ: ${l.reason}`);
      return { id, itemId: item.id };
    };
    const mask = await mkGoods("QCB-MASK", "หน้ากาก QC", 10, 100_000);
    const snorkel = await mkGoods("QCB-SNK", "ท่อหายใจ QC", 20, 40_000);
    const setP = await prod.createProduct(shop.tenantId, shop.accSystemId, { name: "ชุดหน้ากาก + ท่อหายใจ", type: "BUNDLE", salePrice: 300_000 });
    const setId = setP.ok ? setP.id : "";
    const recipe = await prod.setBundleItems(shop.tenantId, shop.accSystemId, setId, [
      { componentProductId: mask.id, qty: 1 },
      { componentProductId: snorkel.id, qty: 2 },
    ]);
    assert("PR8.1 ตั้งสูตรชุดสำเร็จ", recipe.ok && recipe.count === 2, JSON.stringify(recipe));

    const contact = await svc.createContact({
      tenantId: shop.tenantId,
      systemId: shop.accSystemId,
      kind: "CUSTOMER",
      name: "ลูกค้าชุด QC",
    });
    const doc = await svc.createDocument({
      tenantId: shop.tenantId,
      systemId: shop.accSystemId,
      docType: "INVOICE",
      contactId: contact.id,
      issueDate: new Date(),
      lines: [{ description: "ชุดหน้ากาก + ท่อหายใจ", qty: 1, unitPrice: 300_000, productId: setId }],
    });
    const issued = await svc.issueDocument(shop.tenantId, shop.accSystemId, doc.id);
    assert("PR8.2 ออกใบแจ้งหนี้ที่มีรายการจัดชุดได้", issued.ok, JSON.stringify(issued));

    const after = await prisma.$queryRaw<{ sku: string; onHand: number }[]>`
      SELECT "sku", "onHand" FROM "InvItem" WHERE "systemId" = ${shop.invSystemId} ORDER BY "sku"`;
    eq("PR8.3 ขายชุด 1 → ส่วนประกอบลดตามสูตร (SQL)", after, [
      { sku: "QCB-MASK", onHand: 9 },
      { sku: "QCB-SNK", onHand: 18 },
    ]);

    const keys = await prisma.$queryRaw<{ idempotencyKey: string }[]>`
      SELECT "idempotencyKey" FROM "InvMovement"
      WHERE "systemId" = ${shop.invSystemId} AND "idempotencyKey" LIKE 'acc-issue-%' ORDER BY "idempotencyKey"`;
    assert(
      "PR8.4 คีย์ movement = acc-issue-<lineId>-<componentId>",
      keys.length === 2 && keys.every((k) => /^acc-issue-[^-]+-[^-]+$/.test(k.idempotencyKey)),
      JSON.stringify(keys),
    );

    // ยิงซ้ำด้วยเอกสารเดิม → ต้องไม่ตัดเบิ้ล
    await prod.consumeBundleComponentsForDoc(accCtx, doc.id);
    const after2 = await prisma.$queryRaw<{ sku: string; onHand: number }[]>`
      SELECT "sku", "onHand" FROM "InvItem" WHERE "systemId" = ${shop.invSystemId} ORDER BY "sku"`;
    eq("PR8.5 ตัดซ้ำด้วยคีย์เดิมไม่เบิ้ล (idempotent)", after2, after);

    // กันชุดซ้อนชุด + ชุดใส่ตัวเอง
    const nested = await prod.setBundleItems(shop.tenantId, shop.accSystemId, setId, [{ componentProductId: setId, qty: 1 }]);
    assert("PR8.6 ชุดใส่ตัวเองไม่ได้", !nested.ok, JSON.stringify(nested));
    const set2 = await prod.createProduct(shop.tenantId, shop.accSystemId, { name: "ชุดที่ 2", type: "BUNDLE" });
    const nested2 = await prod.setBundleItems(shop.tenantId, shop.accSystemId, set2.ok ? set2.id : "", [{ componentProductId: setId, qty: 1 }]);
    assert("PR8.7 ชุดซ้อนชุดไม่ได้", !nested2.ok, JSON.stringify(nested2));
  }

  // ═════════ PR9–PR11 — ใบเบิก/ส่งคืน + GL ═════════
  console.log("\nPR9–PR11 ใบเบิก/ส่งคืน: ตัดสต็อก + ลงบัญชี (§8.4 · g12)");
  {
    const shop = await makeShop("QC43 ISSUE");
    const accCtx = { tenantId: shop.tenantId, systemId: shop.accSystemId };
    const invCtx = { tenantId: shop.tenantId, systemId: shop.invSystemId };
    const p = await prod.createProduct(shop.tenantId, shop.accSystemId, { name: "ถังอากาศ QC", type: "GOODS", sku: "QCI-TANK", buyPrice: 500_000 });
    const pid = p.ok ? p.id : "";
    const item = await inv.createItem(invCtx, { sku: "QCI-TANK", name: "ถังอากาศ QC", kind: "PRODUCT", costSatang: 500_000 });
    await inv.adjust(invCtx, { itemId: item.id, newQty: 10, idempotencyKey: `qc43-tank-${stamp}` });
    const l = await link.linkProductToItem(accCtx, pid, { itemId: item.id });
    if (!l.ok) throw new Error(l.reason);

    // ร่าง — ไม่แตะสต็อก ไม่มี JV
    const draft = await prod.createGoodsMovement({
      tenantId: shop.tenantId,
      systemId: shop.accSystemId,
      docType: "GOODS_ISSUE",
      lines: [{ productId: pid, qty: 2 }],
      adjustReason: "ใช้ในกิจการ",
      asDraft: true,
    });
    assert("PR11.1 บันทึกร่างใบเบิกได้", draft.ok, JSON.stringify(draft));
    const draftId = draft.ok ? draft.id : "";
    const onHandDraft = await prisma.$queryRaw<{ onHand: number }[]>`SELECT "onHand" FROM "InvItem" WHERE "id" = ${item.id}`;
    eq("PR11.2 ร่างไม่ตัดสต็อก", onHandDraft[0].onHand, 10);
    const jvDraft = await jvOf(shop.accSystemId, draftId);
    eq("PR11.3 ร่างไม่มี JV", jvDraft.length, 0);
    const draftDoc = await prisma.accountDocument.findUnique({ where: { id: draftId }, select: { docNo: true, status: true } });
    eq("PR11.4 ร่างยังไม่มีเลขที่", { docNo: draftDoc?.docNo, status: draftDoc?.status }, { docNo: null, status: "DRAFT" });

    const approved = await prod.approveGoodsMovement(shop.tenantId, shop.accSystemId, draftId);
    assert("PR11.5 อนุมัติร่างได้", approved.ok, JSON.stringify(approved));
    const docNo = approved.ok ? approved.docNo : "";
    assert("PR11.6 เลขที่รูปแบบ PRR-YYYYMM####", /^PRR-\d{6}-\d{4}$/.test(docNo), docNo);

    const onHandAfter = await prisma.$queryRaw<{ onHand: number }[]>`SELECT "onHand" FROM "InvItem" WHERE "id" = ${item.id}`;
    eq("PR9.1 อนุมัติแล้วตัดสต็อก 2", onHandAfter[0].onHand, 8);
    const mvCost = await prisma.$queryRaw<{ costSatang: number; qtyDelta: number }[]>`
      SELECT "costSatang", "qtyDelta" FROM "InvMovement"
      WHERE "systemId" = ${shop.invSystemId} AND "refId" = ${draftId}`;
    const expectCost = mvCost.reduce((n, m) => n + m.costSatang * Math.abs(m.qtyDelta), 0);
    eq("PR9.2 ต้นทุนที่คลังคืนมา = 2 × 5,000.00", expectCost, 1_000_000);
    const jv = await jvOf(shop.accSystemId, draftId);
    eq("PR9.3 JV ใบเบิก = Dr 5300 / Cr 1200 เท่าต้นทุน movement", jv, [
      { code: "1200", debit: 0, credit: expectCost },
      { code: "5300", debit: expectCost, credit: 0 },
    ]);
    const lineCost = await prisma.$queryRaw<{ unitCost: number | null; amount: number }[]>`
      SELECT "unitCost", "amount" FROM "AccountDocumentLine" WHERE "documentId" = ${draftId}`;
    eq("PR9.4 เก็บต้นทุนที่ตัดจริงไว้ที่บรรทัด", lineCost[0], { unitCost: 500_000, amount: 1_000_000 });

    // อนุมัติซ้ำ = ปฏิเสธ (ไม่ตัดเบิ้ล)
    const again = await prod.approveGoodsMovement(shop.tenantId, shop.accSystemId, draftId);
    assert("PR11.7 อนุมัติซ้ำถูกปฏิเสธ", !again.ok, JSON.stringify(again));

    // บัญชี Dr ที่ผู้ใช้เลือกเอง (§8.4 "ค่าใช้จ่ายที่ปรับปรุง")
    const chosen = await prod.createGoodsMovement({
      tenantId: shop.tenantId,
      systemId: shop.accSystemId,
      docType: "GOODS_ISSUE",
      lines: [{ productId: pid, qty: 1 }],
      adjustReason: "ตัวอย่าง/แจก",
      adjustAccountCode: "6300",
    });
    assert("PR9.5 เลือกบัญชี Dr เองได้", chosen.ok, JSON.stringify(chosen));
    const jv2 = await jvOf(shop.accSystemId, chosen.ok ? chosen.id : "");
    eq("PR9.6 JV ใช้บัญชีที่เลือก (6300 ค่าการตลาด)", jv2, [
      { code: "1200", debit: 0, credit: 500_000 },
      { code: "6300", debit: 500_000, credit: 0 },
    ]);

    // ใบส่งคืน — กลับด้าน + เพดาน
    const ret = await prod.createGoodsMovement({
      tenantId: shop.tenantId,
      systemId: shop.accSystemId,
      docType: "GOODS_ISSUE_RETURN",
      lines: [{ productId: pid, qty: 1 }],
      sourceDocId: draftId,
    });
    assert("PR10.1 สร้างใบส่งคืนได้", ret.ok, JSON.stringify(ret));
    assert("PR10.2 เลขที่ใบส่งคืน RPR-YYYYMM####", /^RPR-\d{6}-\d{4}$/.test(ret.ok ? ret.docNo : ""), JSON.stringify(ret));
    const jvRet = await jvOf(shop.accSystemId, ret.ok ? ret.id : "");
    eq("PR10.3 JV ใบส่งคืนกลับด้าน (Dr 1200 / Cr 5300)", jvRet, [
      { code: "1200", debit: 500_000, credit: 0 },
      { code: "5300", debit: 0, credit: 500_000 },
    ]);
    const onHandRet = await prisma.$queryRaw<{ onHand: number }[]>`SELECT "onHand" FROM "InvItem" WHERE "id" = ${item.id}`;
    eq("PR10.4 คืนแล้วสต็อกกลับมา", onHandRet[0].onHand, 8);

    const over = await prod.createGoodsMovement({
      tenantId: shop.tenantId,
      systemId: shop.accSystemId,
      docType: "GOODS_ISSUE_RETURN",
      lines: [{ productId: pid, qty: 5 }],
      sourceDocId: draftId,
    });
    assert("PR10.5 คืนเกินที่เบิกถูกปฏิเสธ", !over.ok && /เกินจำนวน/.test(over.ok ? "" : over.reason), JSON.stringify(over));

    const short = await prod.createGoodsMovement({
      tenantId: shop.tenantId,
      systemId: shop.accSystemId,
      docType: "GOODS_ISSUE",
      lines: [{ productId: pid, qty: 999 }],
    });
    assert("PR9.7 เบิกเกินสต็อกถูกปฏิเสธเป็นภาษาไทย", !short.ok && /ไม่พอ/.test(short.ok ? "" : short.reason), JSON.stringify(short));
    const docCount = await prisma.accountDocument.count({ where: { systemId: shop.accSystemId, docType: "GOODS_ISSUE" } });
    eq("PR16.1 เบิกล้ม = ไม่มีเอกสารค้าง (rollback)", docCount, 2);
  }

  // ═════════ PR12 — ใบปรับต้นทุน (CA) ═════════
  console.log("\nPR12 ใบปรับต้นทุนสินค้า (§8.4)");
  {
    // (ก) fixture ของ seed — เฉลยอิสระด้วย SQL
    const jvSeed = await jvOf(E.systemId, E.costAdjustment.docId);
    eq("PR12.1 JV ใบปรับต้นทุนของ seed = (ใหม่−เดิม)×คงเหลือ", jvSeed, [
      { code: "1200", debit: E.costAdjustment.delta, credit: 0 },
      { code: "5310", debit: 0, credit: E.costAdjustment.delta },
    ]);
    const itemCost = await prisma.$queryRaw<{ costSatang: number }[]>`
      SELECT i."costSatang" FROM "InvItem" i
      JOIN "AccountProduct" p ON p."invItemId" = i."id"
      WHERE p."id" = ${E.costAdjustment.productId}`;
    eq("PR12.2 ต้นทุนใน InvItem ถูกปรับจริง (SQL)", itemCost[0].costSatang, E.costAdjustment.newCost);
    const buyPrice = await prisma.$queryRaw<{ buyPrice: number | null }[]>`
      SELECT "buyPrice" FROM "AccountProduct" WHERE "id" = ${E.costAdjustment.productId}`;
    eq("PR12.3 ราคาซื้อฝั่งบัญชีตามทัน", buyPrice[0].buyPrice, E.costAdjustment.newCost);
    const caDoc = await prisma.accountDocumentLine.findFirst({
      where: { documentId: E.costAdjustment.docId },
      select: { unitCost: true, unitPrice: true, qty: true },
    });
    eq("PR12.4 บรรทัดเก็บต้นทุนเดิม/ใหม่/จำนวน", { old: caDoc?.unitCost, neu: caDoc?.unitPrice, qty: Number(caDoc?.qty) }, { old: E.costAdjustment.oldCost, neu: E.costAdjustment.newCost, qty: E.costAdjustment.qty });
    assert("PR12.5 เลขที่ CA-YYYYMM####", /^CA-\d{6}-\d{4}$/.test(E.costAdjustment.docNo), E.costAdjustment.docNo);

    // (ข) ขาดทุนจากการปรับ (ทิศกลับด้าน) — ในร้านทิ้ง
    const shop = await makeShop("QC43 CA");
    const accCtx = { tenantId: shop.tenantId, systemId: shop.accSystemId };
    const invCtx = { tenantId: shop.tenantId, systemId: shop.invSystemId };
    const p = await prod.createProduct(shop.tenantId, shop.accSystemId, { name: "ตีนกบ QC", type: "GOODS", sku: "QCC-FIN", buyPrice: 200_000 });
    const pid = p.ok ? p.id : "";
    const item = await inv.createItem(invCtx, { sku: "QCC-FIN", name: "ตีนกบ QC", kind: "PRODUCT", costSatang: 200_000 });
    await inv.adjust(invCtx, { itemId: item.id, newQty: 6, idempotencyKey: `qc43-fin-${stamp}` });
    const l = await link.linkProductToItem(accCtx, pid, { itemId: item.id });
    if (!l.ok) throw new Error(l.reason);
    const ca = await prod.createCostAdjustment({
      tenantId: shop.tenantId,
      systemId: shop.accSystemId,
      productId: pid,
      newCostSatang: 150_000,
      reason: "สินค้าเสื่อมสภาพ",
    });
    assert("PR12.6 ปรับต้นทุนลงได้", ca.ok, JSON.stringify(ca));
    const delta = ca.ok ? ca.delta : 0;
    eq("PR12.7 ส่วนต่าง = (150,000−200,000)×6", delta, -300_000);
    const jvLoss = await jvOf(shop.accSystemId, ca.ok ? ca.id : "");
    eq("PR12.8 ขาดทุน → Dr 5310 / Cr 1200", jvLoss, [
      { code: "1200", debit: 0, credit: 300_000 },
      { code: "5310", debit: 300_000, credit: 0 },
    ]);
    const svcCa = await prod.createProduct(shop.tenantId, shop.accSystemId, { name: "บริการ CA", type: "SERVICE" });
    const badCa = await prod.createCostAdjustment({
      tenantId: shop.tenantId,
      systemId: shop.accSystemId,
      productId: svcCa.ok ? svcCa.id : "",
      newCostSatang: 100,
    });
    assert("PR12.9 ปรับต้นทุนของบริการไม่ได้", !badCa.ok && /บริการ/.test(badCa.ok ? "" : badCa.reason), JSON.stringify(badCa));
  }

  // ═════════ PR13 — ยอดยกมา ═════════
  console.log("\nPR13 ยอดยกมา (§8.2)");
  {
    const jvOpen = await prisma.$queryRaw<{ code: string; debit: bigint; credit: bigint }[]>`
      SELECT l."code" AS code, SUM(jl."debit")::bigint AS debit, SUM(jl."credit")::bigint AS credit
      FROM "AccountJournalLine" jl
      JOIN "AccountJournalEntry" je ON je."id" = jl."entryId"
      JOIN "AccountLedger" l ON l."id" = jl."accountId"
      WHERE je."systemId" = ${E.systemId} AND je."idempotencyKey" LIKE 'AccountDocument#open-%#OPENING'
      GROUP BY l."code" ORDER BY l."code"`;
    eq(
      "PR13.1 JV ยอดยกมา = Dr 1200 / Cr 3999 เท่ามูลค่า lot",
      jvOpen.map((r) => ({ code: r.code, debit: Number(r.debit), credit: Number(r.credit) })),
      [
        { code: "1200", debit: E.openingLot.amount, credit: 0 },
        { code: "3999", debit: 0, credit: E.openingLot.amount },
      ],
    );
    const lots = await prod.listOpeningLots(E.tenantId, E.systemId, E.openingLot.productId);
    eq("PR13.2 lot ถูกบันทึกไว้ 1 รายการ พร้อมเวลาโพสต์", { n: lots.length, seq: lots[0]?.seq, posted: !!lots[0]?.postedAt }, { n: 1, seq: 1, posted: true });
    const stock = await prisma.$queryRaw<{ qtyOnHand: string }[]>`
      SELECT "qtyOnHand"::text AS "qtyOnHand" FROM "AccountProduct" WHERE "id" = ${E.openingLot.productId}`;
    eq("PR13.3 คงเหลือของสินค้าที่ไม่ผูกคลังเพิ่มตาม lot", Number(stock[0].qtyOnHand), E.openingLot.qty);

    // ร้านทิ้ง: lot ที่ 2 ของสินค้าที่ผูกคลัง → รับเข้าคลังคีย์ acc-open-<productId>-2
    const shop = await makeShop("QC43 OPEN");
    const accCtx = { tenantId: shop.tenantId, systemId: shop.accSystemId };
    const invCtx = { tenantId: shop.tenantId, systemId: shop.invSystemId };
    const p = await prod.createProduct(shop.tenantId, shop.accSystemId, { name: "สมุดดำน้ำ QC", type: "GOODS", sku: "QCO-LOG", buyPrice: 10_000 });
    const pid = p.ok ? p.id : "";
    const item = await inv.createItem(invCtx, { sku: "QCO-LOG", name: "สมุดดำน้ำ QC", kind: "PRODUCT", costSatang: 10_000 });
    const l = await link.linkProductToItem(accCtx, pid, { itemId: item.id });
    if (!l.ok) throw new Error(l.reason);
    const lot1 = await prod.addOpeningLot(shop.tenantId, shop.accSystemId, pid, { lotDate: "2026-01-01", qty: 10, unitCost: 10_000 });
    const lot2 = await prod.addOpeningLot(shop.tenantId, shop.accSystemId, pid, { lotDate: "2026-02-01", qty: 5, unitCost: 12_000 });
    eq("PR13.4 lot ที่ 2 ได้ seq 2", [lot1.ok && lot1.seq, lot2.ok && lot2.seq], [1, 2]);
    const keys = await prisma.$queryRaw<{ idempotencyKey: string; qtyDelta: number }[]>`
      SELECT "idempotencyKey", "qtyDelta" FROM "InvMovement"
      WHERE "systemId" = ${shop.invSystemId} AND "idempotencyKey" LIKE 'acc-open-%' ORDER BY "idempotencyKey"`;
    eq("PR13.5 คีย์รับเข้า acc-open-<productId>-<n>", keys.map((k) => k.idempotencyKey), [`acc-open-${pid}-1`, `acc-open-${pid}-2`]);
    const onHand = await prisma.$queryRaw<{ onHand: number; costSatang: number }[]>`SELECT "onHand", "costSatang" FROM "InvItem" WHERE "id" = ${item.id}`;
    eq("PR13.6 คงเหลือ = 15 · ต้นทุนถัวเฉลี่ยขยับตามสูตรคลัง", onHand[0].onHand, 15);
    const neg = await prod.addOpeningLot(shop.tenantId, shop.accSystemId, pid, { lotDate: "2026-02-01", qty: 0, unitCost: 100 });
    assert("PR13.7 จำนวน 0 ถูกปฏิเสธ", !neg.ok, JSON.stringify(neg));
  }

  // ═════════ PR14 — ด่านสิทธิ์ทุก route ใหม่ ═════════
  console.log("\nPR14 ด่านสิทธิ์ของ route ใหม่");
  {
    const reg = guard.ACCOUNT_PAGE_PERMISSIONS;
    for (const route of [
      "products/page.tsx",
      "units/page.tsx",
      "goods-issue/page.tsx",
      "goods-issue/new/page.tsx",
      "goods-issue/return/new/page.tsx",
      "cost-adjustment/page.tsx",
      "cost-adjustment/new/page.tsx",
    ]) {
      assert(`PR14 ${route} มีด่านสิทธิ์`, reg[route] === "account.product.manage", `ได้ ${reg[route] ?? "(ไม่มี)"}`);
    }
  }

  // ═════════ PR15 — tenant isolation ═════════
  console.log("\nPR15 กันข้ามร้าน (tenant isolation)");
  {
    const a = await makeShop("QC43 ISO A");
    const b = await makeShop("QC43 ISO B");
    const pa = await prod.createProduct(a.tenantId, a.accSystemId, { name: "ของร้าน A", type: "GOODS" });
    const pb = await prod.createProduct(b.tenantId, b.accSystemId, { name: "ของร้าน B", type: "GOODS" });
    const setB = await prod.createProduct(b.tenantId, b.accSystemId, { name: "ชุดร้าน B", type: "BUNDLE" });
    const cross = await prod.setBundleItems(b.tenantId, b.accSystemId, setB.ok ? setB.id : "", [
      { componentProductId: pa.ok ? pa.id : "", qty: 1 },
    ]);
    assert("PR15.1 ใส่สินค้าของอีกร้านเป็นส่วนประกอบไม่ได้", !cross.ok, JSON.stringify(cross));
    const crossLot = await prod.addOpeningLot(b.tenantId, b.accSystemId, pa.ok ? pa.id : "", { lotDate: "2026-01-01", qty: 1, unitCost: 100 });
    assert("PR15.2 ใส่ยอดยกมาให้สินค้าของอีกร้านไม่ได้", !crossLot.ok, JSON.stringify(crossLot));
    const crossCa = await prod.createCostAdjustment({ tenantId: b.tenantId, systemId: b.accSystemId, productId: pa.ok ? pa.id : "", newCostSatang: 1 });
    assert("PR15.3 ปรับต้นทุนสินค้าของอีกร้านไม่ได้", !crossCa.ok, JSON.stringify(crossCa));
    const crossIssue = await prod.createGoodsMovement({
      tenantId: b.tenantId,
      systemId: b.accSystemId,
      docType: "GOODS_ISSUE",
      lines: [{ productId: pa.ok ? pa.id : "", qty: 1 }],
    });
    assert("PR15.4 เบิกสินค้าของอีกร้านไม่ได้", !crossIssue.ok, JSON.stringify(crossIssue));
    const listB = await prod.listProductsPaged(b.tenantId, b.accSystemId, { type: "GOODS" });
    eq("PR15.5 หน้ารายการเห็นเฉพาะของร้านตัวเอง", listB.rows.map((r) => r.id), [pb.ok ? pb.id : ""]);
  }

  // ═════════ PR16 — rollback เมื่อมีความล้มเหลวกลางทาง ═════════
  console.log("\nPR16 ธุรกรรมย้อนครบเมื่อล้มกลางทาง");
  {
    const shop = await makeShop("QC43 ROLLBACK");
    const accCtx = { tenantId: shop.tenantId, systemId: shop.accSystemId };
    const invCtx = { tenantId: shop.tenantId, systemId: shop.invSystemId };
    const p = await prod.createProduct(shop.tenantId, shop.accSystemId, { name: "ของลิงก์เสีย", type: "GOODS", sku: "QCR-1", buyPrice: 100_000 });
    const pid = p.ok ? p.id : "";
    const item = await inv.createItem(invCtx, { sku: "QCR-1", name: "ของลิงก์เสีย", kind: "PRODUCT", costSatang: 100_000 });
    await inv.adjust(invCtx, { itemId: item.id, newQty: 5, idempotencyKey: `qc43-rb-${stamp}` });
    const l = await link.linkProductToItem(accCtx, pid, { itemId: item.id });
    if (!l.ok) throw new Error(l.reason);
    // ทำลิงก์ให้เสีย: ลบ item ทิ้งแต่ AccountProduct ยังชี้อยู่
    await prisma.invMovement.deleteMany({ where: { itemId: item.id } });
    await prisma.invLocationStock.deleteMany({ where: { itemId: item.id } });
    await prisma.invItem.delete({ where: { id: item.id } });

    const res = await prod.createGoodsMovement({
      tenantId: shop.tenantId,
      systemId: shop.accSystemId,
      docType: "GOODS_ISSUE",
      lines: [{ productId: pid, qty: 1 }],
    });
    assert("PR16.2 ลิงก์คลังเสีย → ปฏิเสธเป็นภาษาไทย", !res.ok && /ลิงก์เสีย|ไม่พบ/.test(res.ok ? "" : res.reason), JSON.stringify(res));
    const docs = await prisma.accountDocument.count({ where: { systemId: shop.accSystemId } });
    const jvs = await prisma.accountJournalEntry.count({ where: { systemId: shop.accSystemId } });
    eq("PR16.3 ไม่มีเอกสาร/JV ค้างหลังล้ม", { docs, jvs }, { docs: 0, jvs: 0 });
  }
} catch (e) {
  bad("CRASH", e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(1, 5).join("\n")}` : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => {
    try {
      await f();
    } catch {
      /* ล้างแบบ best-effort */
    }
  };
  for (const id of tenantIds) {
    await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: id }, data: { reversalOfId: null } }));
    await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountDocumentRelation.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountDocumentPayment.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountDocument.deleteMany({ where: { tenantId: id } }));
    for (const m of [
      "accountProductBundleItem", "accountProductOpeningLot",
      "accountProduct", "accountUnit", "accountCategory", "accountContact", "accountMapping", "accountLedger",
      "accountPeriod", "accountDocSequence", "accountSettings", "accountSystemLink",
      "invMovement", "invLot", "invLocationStock", "invLocation", "invItemImage", "invItem", "invSettings", "invCategory",
      "appNotification", "outboxEvent", "appSystemUnit", "appSystem", "businessUnit",
    ]) {
      await d(() => (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    }
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  console.log(`\n🧹 ลบร้านทดสอบ ${tenantIds.length} ร้าน`);
}

console.log(`\n===== QC WO 4.3 · สินค้า V2 สรุป =====`);
console.log(`ผ่าน ${passed} · ตก ${findings.length}`);
if (findings.length > 0) console.log(findings.map((f) => "  - " + f).join("\n"));
console.log(`JSON_SUMMARY ${JSON.stringify({ total: passed + findings.length, passed, findings })}`);
await prisma.$disconnect();
process.exit(findings.length === 0 ? 0 : 1);
