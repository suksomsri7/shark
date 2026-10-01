// seed-pos-qc.mts — ชุดข้อมูล QC ของ RUN "POS ใหม่" (ใบ P0.1)
//
// ใช้ (ฐาน QC4 เท่านั้น ระหว่างที่ CRM RUN ยังวิ่ง):
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-pos-qc.mts
//
// สร้างอะไร (สัญญาอยู่ที่ `scripts/pos-qc-env.mts` · PQC — แก้ที่นั่นที่เดียว):
//   • ร้านกาแฟ 2 สาขา (SHOP สีลม/อารีย์) + ระบบ POS · INVENTORY · ACCOUNT · MEMBER · POINT ผูกทั้ง 2 สาขา
//   • ร้านอาหาร 1 สาขา (RESTAURANT) + ระบบ POS · INVENTORY · ACCOUNT + เมนู (MenuItem) 4 รายการ 3 หมวด
//   • ทุกร้านมี owner (OWNER) + cashier (STAFF · สาขาเดียว · pos.sale.create) — ล็อกอินแบบเดียวกับผู้ใช้ QC อื่น
//     (passwordless: OTP บนจอในโหมด preview/dev · หรือ mint session แบบ visual-*.mts)
//   • แคตตาล็อกวันนี้ = InvItem + ราคาขาย AccountProduct.salePrice: มี VAT / ไม่มี VAT / บาร์โค้ด / 0 บาท /
//     สต็อกผูกคลัง (รับเข้าด้วย idempotencyKey ตายตัว) / บริการ · สมาชิก 1 คนในร้านกาแฟ (ผ่าน facade สมาชิก)
//
// กติกา (ใบ P0.1):
//   🔴 find-or-create ล้วน — **ไม่มีคำสั่งลบเลย** · id หลักตายตัว ⇒ รันซ้ำ = จำนวนเดิม ไม่ซ้ำ สรุปเหมือนเดิมทุกตัวอักษร
//   🔴 ไม่แตะแถวของร้านอื่น — พิสูจน์ด้วย "ลายนิ้วมือ" ของร้านอื่น (จำนวนแถว + updatedAt ล่าสุด) ก่อน/หลัง ต่างกัน = exit 1
//   🔴 ไม่เรียก drainAll (คิว outbox ไม่แยกร้าน — ระบายแล้วไปแตะ event ของร้านอื่น) · service ที่เรียกไม่มีตัวไหน scheduleDrain
//   🔴 รันพร้อมกัน 2 ตัวไม่ได้ (find-or-create ไม่มีล็อกแถว — สองรอบพร้อมกันอาจชน unique/สร้างซ้ำ) ⇒ ต้องรันผ่าน
//      `scripts/with-gate-lock.sh` เสมอ (qc4.sh ตั้ง GATE_LOCK_FILE=/tmp/shark-gate-qc4.lock = คิวเดียวของ QC4)
//   🔴 รันซ้ำ = ปรับ role/unitAccess/permissions ของ membership QC ให้ตรง PQC (แก้สิทธิ์แคชเชียร์ใน pos-qc-env แล้วรันซ้ำ = มีผล)
//   🔴 วางหลัง seed สมาชิกได้ (`seed-member-qc` / `qc-member-m1.1`) — ไม่พึ่งแถวของร้านนั้นเลย
//   ผลท้ายไฟล์: `scripts/pos-expected.json` (id + จำนวนที่คาด) · บรรทัด `SEED_SUMMARY {...}` · `JSON_SUMMARY {...}`

import { writeFileSync } from "node:fs";
import {
  loadPosQcEnv,
  PQC,
  PQC_COFFEE_ITEMS,
  PQC_RESTO_ITEMS,
  PQC_RESTO_MENU,
  PQC_TENANT_IDS,
  PQC_EMAILS,
  POS_PAGES,
  type PqcItem,
} from "./pos-qc-env.mjs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// ด่าน host อยู่ในตัวโหลด: ไม่ใช่ QC4 = exit 4 (เว้น POS_QC_ALLOW_HOST) · prod/QC1–3 = exit 4 เสมอ
loadPosQcEnv("seed-pos-qc");

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const sys = await import("@/lib/modules/system/service");
const inventory = await import("@/lib/modules/inventory/service");
const reg = await import("@/lib/modules/pos/register");
const gl = await import("@/lib/modules/account/gl");
const menu = await import("@/lib/modules/restaurant/menu");
const memberFacade = await import("@/lib/modules/member");

const t0 = Date.now();
const notTenant = { tenantId: { notIn: [...PQC_TENANT_IDS] } };

// ═══════════════════ 0. ลายนิ้วมือของร้านอื่น (ก่อน) ═══════════════════
// จำนวนแถว + updatedAt ล่าสุดของตารางที่ seed นี้ "อาจ" แตะได้ถ้าเขียนผิด + ตารางของร้าน QC สมาชิก/CRM
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const countOf = async (key: string, f: () => Promise<number>) => {
    try {
      out[key] = String(await f());
    } catch (e) {
      out[key] = `ERR ${(e as Error).message.slice(0, 40)}`;
    }
  };
  const maxOf = async (key: string, f: () => Promise<Any>) => {
    try {
      const r = await f();
      const v = r?._max?.updatedAt ?? r?._max?.createdAt ?? null;
      out[key] = v ? new Date(v).toISOString() : "null";
    } catch (e) {
      out[key] = `ERR ${(e as Error).message.slice(0, 40)}`;
    }
  };
  await countOf("tenant", () => P.tenant.count({ where: { id: { notIn: [...PQC_TENANT_IDS] } } }));
  await maxOf("tenant.maxUpdatedAt", () => P.tenant.aggregate({ where: { id: { notIn: [...PQC_TENANT_IDS] } }, _max: { updatedAt: true } }));
  await countOf("user", () => P.user.count({ where: { email: { notIn: [...PQC_EMAILS] } } }));
  await maxOf("user.maxUpdatedAt", () => P.user.aggregate({ where: { email: { notIn: [...PQC_EMAILS] } }, _max: { updatedAt: true } }));
  for (const m of [
    "membership", "businessUnit", "appSystem", "customer", "crmContact", "crmDeal", "posSale", "invItem",
    "accountProduct", "menuItem", "menuCategory", "shopProduct", "accountSystemLink",
  ]) {
    await countOf(m, () => P[m].count({ where: notTenant }));
    await maxOf(`${m}.maxUpdatedAt`, () => P[m].aggregate({ where: notTenant, _max: { updatedAt: true } }));
  }
  // ตารางไม่มี updatedAt — นับจำนวน + createdAt ล่าสุด
  for (const m of ["appSystemUnit", "invMovement", "paymentProfile"]) await countOf(m, () => P[m].count({ where: notTenant }));
  await countOf("outboxEvent.PENDING", () => P.outboxEvent.count({ where: { ...notTenant, status: "PENDING" } }));
  await countOf("outboxEvent", () => P.outboxEvent.count({ where: notTenant }));
  await countOf("session", () => P.session.count({ where: { user: { email: { notIn: [...PQC_EMAILS] } } } }));
  return out;
}
const before = await fingerprint();

// ═══════════════════ ตัวช่วย find-or-create ═══════════════════
const created: Record<string, number> = {};
const bump = (k: string) => (created[k] = (created[k] ?? 0) + 1);

async function ensureTenant(id: string, name: string, slug: string) {
  const bySlug = await P.tenant.findUnique({ where: { slug } });
  if (bySlug && bySlug.id !== id) throw new Error(`slug ${slug} ถูกร้านอื่นใช้อยู่ (id ${bySlug.id}) — ไม่แตะ หยุด`);
  if (bySlug) return bySlug;
  bump("tenant");
  return P.tenant.create({ data: { id, name, slug } });
}
async function ensureUnit(tenantId: string, u: { id: string; name: string; slug: string; type: string }) {
  const row = await P.businessUnit.findFirst({ where: { id: u.id, tenantId } });
  if (row) return row;
  bump("businessUnit");
  return P.businessUnit.create({ data: { id: u.id, tenantId, type: u.type, name: u.name, slug: u.slug } });
}
async function ensureSystem(tenantId: string, type: string, s: { id: string; name: string }) {
  const row = await P.appSystem.findFirst({ where: { id: s.id, tenantId } });
  if (row) return row;
  bump("appSystem");
  // createSystem ของจริงคือ appSystem.create ล้วน — สร้างตรงเพื่อกำหนด id ตายตัว (ไม่มีตรรกะอื่นที่ข้าม)
  return P.appSystem.create({ data: { id: s.id, tenantId, type, name: s.name } });
}
async function ensureLink(tenantId: string, systemId: string, unitId: string, type: string) {
  const link = await P.appSystemUnit.findFirst({ where: { tenantId, unitId, type } });
  if (link?.systemId === systemId) return;
  bump("appSystemUnit");
  await sys.linkUnit(tenantId, systemId, unitId); // ของจริง (ย้ายออกจากระบบเดิมของประเภทนั้นในร้านเดียวกันก่อน)
}
async function ensureUser(tenantId: string, u: { userId: string; membershipId: string; email: string; name: string; role: string }, unitAccess: string[], permissions: Record<string, boolean>) {
  let user = await P.user.findUnique({ where: { email: u.email } });
  if (user && user.id !== u.userId) throw new Error(`อีเมล ${u.email} เป็นของผู้ใช้อื่น (id ${user.id}) — ไม่แตะ หยุด`);
  if (!user) {
    bump("user");
    user = await P.user.create({ data: { id: u.userId, email: u.email, name: u.name } });
  }
  const m = await P.membership.findFirst({ where: { userId: u.userId, tenantId } });
  if (!m) {
    bump("membership");
    await P.membership.create({
      data: { id: u.membershipId, userId: u.userId, tenantId, role: u.role, unitAccess, permissions, acceptedAt: new Date("2026-10-01T00:00:00+07:00") },
    });
  } else {
    // ปรับให้ตรงสัญญา (เฉพาะแถว membership ของผู้ใช้ QC ในร้าน QC เอง) — เทียบแบบเรียงคีย์ ไม่เขียนถ้าเท่าเดิม
    const canon = (v: unknown) => JSON.stringify(v, Object.keys((v ?? {}) as object).sort());
    const same = m.role === u.role && JSON.stringify(m.unitAccess) === JSON.stringify(unitAccess) && canon(m.permissions) === canon(permissions);
    if (!same) {
      bump("membershipReconciled");
      await P.membership.update({ where: { id: m.id }, data: { role: u.role, unitAccess, permissions } });
    }
  }
  return user;
}

type ItemRow = { sku: string; id: string; invPriceSatang: number; accountProductId: string | null; salePrice: number | null; vatRateBp: number | null; onHand: number; barcode: string | null; kind: string };
async function ensureCatalog(tenantId: string, invSystemId: string, posSystemId: string, items: readonly PqcItem[]): Promise<ItemRow[]> {
  const ctx = { tenantId, systemId: invSystemId };
  const out: ItemRow[] = [];
  for (const it of items) {
    let row = await P.invItem.findFirst({ where: { tenantId, systemId: invSystemId, sku: it.sku } });
    if (!row) {
      bump("invItem");
      const r = await inventory.createItem(ctx, {
        sku: it.sku,
        name: it.name,
        barcode: it.barcode,
        unitLabel: it.unitLabel,
        costSatang: it.costSatang,
        kind: it.kind,
        // บริการ: ราคาอยู่ที่ InvItem.priceSatang (posServices อ่านช่องนี้) · สินค้า: ราคาอยู่ที่ AccountProduct.salePrice
        priceSatang: it.kind === "SERVICE" ? it.priceSatang : 0,
        ...(it.kind === "SERVICE" ? { durationMin: 30, bookable: false } : {}),
      });
      row = await P.invItem.findFirst({ where: { id: r.id } });
    }
    if (it.kind === "PRODUCT") {
      // ราคาขายผ่านทางจริงของหน้า "สินค้า/ราคา" (สร้าง AccountProduct + ผูก ครั้งแรก · ครั้งต่อไป = แก้ค่าเดิม ไม่สร้างใหม่)
      const cur = row.accountProductId ? await P.accountProduct.findFirst({ where: { id: row.accountProductId, tenantId } }) : null;
      if (!cur || cur.salePrice !== it.priceSatang) {
        const r = await reg.setItemSalePrice(tenantId, posSystemId, row.id, it.priceSatang);
        if (!r.ok) throw new Error(`ตั้งราคา ${it.sku} ไม่ได้: ${r.reason}`);
        if (!cur) bump("accountProduct");
      }
      row = await P.invItem.findFirst({ where: { id: row.id } });
      const ap = await P.accountProduct.findFirst({ where: { id: row.accountProductId, tenantId } });
      // VAT ต่อสินค้า: ไม่มีฟังก์ชันตั้งเฉพาะ vatRateBp แบบสั้นใน facade บัญชี — แก้ตรงเฉพาะแถวของร้าน QC เมื่อค่ายังไม่ตรง
      if (ap && ap.vatRateBp !== it.vatBp) await P.accountProduct.update({ where: { id: ap.id }, data: { vatRateBp: it.vatBp } });
      if (it.stock) {
        await inventory.receive(ctx, {
          itemId: row.id,
          qty: it.stock,
          costSatang: it.costSatang,
          idempotencyKey: `${PQC.tag}-recv-${it.sku}`, // ตายตัว ⇒ รันซ้ำไม่รับเข้าเบิ้ล (receiveInTx คืนรายการเดิม)
          sourceModule: "procurement",
          refType: "PosQcSeed",
        });
      }
    }
    const fin = await P.invItem.findFirst({ where: { id: row.id } });
    const ap = fin.accountProductId ? await P.accountProduct.findFirst({ where: { id: fin.accountProductId } }) : null;
    out.push({ sku: it.sku, id: fin.id, invPriceSatang: fin.priceSatang, accountProductId: fin.accountProductId, salePrice: ap?.salePrice ?? null, vatRateBp: ap?.vatRateBp ?? null, onHand: fin.onHand, barcode: fin.barcode, kind: fin.kind });
  }
  return out;
}
async function ensureAccountLink(tenantId: string, accSystemId: string, posSystemId: string) {
  await gl.ensureAccounting({ tenantId, systemId: accSystemId });
  const l = await P.accountSystemLink.findFirst({ where: { tenantId, systemId: accSystemId, linkedKind: "POS", linkedId: posSystemId } });
  if (!l) {
    bump("accountSystemLink");
    await P.accountSystemLink.create({ data: { tenantId, systemId: accSystemId, linkedKind: "POS", linkedId: posSystemId } });
  }
}
async function ensurePromptPay(tenantId: string, promptpayId: string | null, displayName: string) {
  if (!promptpayId) return;
  const p = await P.paymentProfile.findUnique({ where: { tenantId } });
  if (p) return;
  bump("paymentProfile");
  await P.paymentProfile.create({ data: { tenantId, promptpayId, displayName } });
}

// ═══════════════════ 1. ร้านกาแฟ 2 สาขา ═══════════════════
const C = PQC.coffee;
await ensureTenant(C.tenantId, C.name, C.slug);
const coffeeUnits = { silom: await ensureUnit(C.tenantId, C.units.silom), ari: await ensureUnit(C.tenantId, C.units.ari) };
for (const [type, s] of Object.entries(C.systems)) {
  await ensureSystem(C.tenantId, type, s);
  for (const u of Object.values(coffeeUnits)) await ensureLink(C.tenantId, s.id, u.id, type);
}
await ensureAccountLink(C.tenantId, C.systems.ACCOUNT.id, C.systems.POS.id);
await ensurePromptPay(C.tenantId, C.promptpayId, C.name);
await ensureUser(C.tenantId, C.users.owner, ["*"], {});
await ensureUser(C.tenantId, C.users.cashier, [C.units.silom.id], PQC.cashierPermissions);
const coffeeItems = await ensureCatalog(C.tenantId, C.systems.INVENTORY.id, C.systems.POS.id, PQC_COFFEE_ITEMS);
// สมาชิก 1 คน ผ่าน facade สมาชิก (dedup ด้วยเบอร์ต่อร้าน ⇒ รันซ้ำได้คนเดิม)
const memberBefore = await P.customer.count({ where: { tenantId: C.tenantId } });
const member = await memberFacade.findOrCreate({
  tenantId: C.tenantId,
  memberSystemId: C.systems.MEMBER.id,
  phone: C.member.phone,
  name: C.member.name,
  source: "STAFF",
});
if ((await P.customer.count({ where: { tenantId: C.tenantId } })) > memberBefore) bump("customer");

// ═══════════════════ 2. ร้านอาหาร 1 สาขา ═══════════════════
const R = PQC.resto;
await ensureTenant(R.tenantId, R.name, R.slug);
const restoUnit = await ensureUnit(R.tenantId, R.units.main);
for (const [type, s] of Object.entries(R.systems)) {
  await ensureSystem(R.tenantId, type, s);
  await ensureLink(R.tenantId, s.id, restoUnit.id, type);
}
await ensureAccountLink(R.tenantId, R.systems.ACCOUNT.id, R.systems.POS.id);
await ensureUser(R.tenantId, R.users.owner, ["*"], {});
await ensureUser(R.tenantId, R.users.cashier, [R.units.main.id], PQC.cashierPermissions);
const restoItems = await ensureCatalog(R.tenantId, R.systems.INVENTORY.id, R.systems.POS.id, PQC_RESTO_ITEMS);
// เมนูผ่าน service จริงของร้านอาหาร (getSetting/ensureDefaultStations เป็น get-or-create อยู่แล้ว)
await menu.getSetting(R.tenantId, restoUnit.id);
await menu.ensureDefaultStations(R.tenantId, restoUnit.id);
const stations = await menu.listStations(R.tenantId, restoUnit.id);
const catIds: Record<string, string> = {};
for (const c of PQC_RESTO_MENU.categories) {
  let row = await P.menuCategory.findFirst({ where: { tenantId: R.tenantId, unitId: restoUnit.id, name: c.name, archivedAt: null } });
  if (!row) {
    bump("menuCategory");
    const r = await menu.createCategory(R.tenantId, restoUnit.id, { name: c.name, nameEn: c.nameEn });
    if (!r.ok) throw new Error(`สร้างหมวด ${c.name} ไม่ได้: ${r.reason}`);
    row = { id: r.id };
  }
  catIds[c.key] = row.id;
}
const menuRows: { name: string; id: string; basePrice: number; stockQty: number | null }[] = [];
for (const m of PQC_RESTO_MENU.items) {
  const station = stations.find((s: Any) => s.name === m.station);
  if (!station) throw new Error(`ไม่พบสถานี ${m.station}`);
  let row = await P.menuItem.findFirst({ where: { tenantId: R.tenantId, unitId: restoUnit.id, name: m.name, archivedAt: null } });
  if (!row) {
    bump("menuItem");
    const r = await menu.createItem(R.tenantId, restoUnit.id, {
      categoryId: catIds[m.category]!,
      stationId: station.id,
      name: m.name,
      nameEn: m.nameEn,
      basePrice: m.basePrice,
      stockQty: m.stockQty,
    });
    if (!r.ok) throw new Error(`สร้างเมนู ${m.name} ไม่ได้: ${r.reason}`);
    row = await P.menuItem.findFirst({ where: { id: r.id } });
  }
  menuRows.push({ name: row.name, id: row.id, basePrice: row.basePrice, stockQty: row.stockQty });
}

// ═══════════════════ 3. นับของร้าน QC (ตัวเลขที่ต้องเหมือนเดิมทุกรอบ) ═══════════════════
async function countsOf(tenantId: string) {
  const w = { tenantId };
  return {
    units: await P.businessUnit.count({ where: w }),
    systems: await P.appSystem.count({ where: w }),
    systemUnitLinks: await P.appSystemUnit.count({ where: w }),
    memberships: await P.membership.count({ where: w }),
    invItems: await P.invItem.count({ where: w }),
    invItemsWithBarcode: await P.invItem.count({ where: { ...w, barcode: { not: null } } }),
    services: await P.invItem.count({ where: { ...w, kind: "SERVICE" } }),
    accountProducts: await P.accountProduct.count({ where: w }),
    accountProductsNoVat: await P.accountProduct.count({ where: { ...w, vatRateBp: 0 } }),
    accountProductsZeroPrice: await P.accountProduct.count({ where: { ...w, salePrice: 0 } }),
    invReceives: await P.invMovement.count({ where: { ...w, idempotencyKey: { startsWith: `${PQC.tag}-recv-` } } }),
    onHandTotal: (await P.invItem.aggregate({ where: w, _sum: { onHand: true } }))._sum.onHand ?? 0,
    menuCategories: await P.menuCategory.count({ where: w }),
    menuItems: await P.menuItem.count({ where: w }),
    kdsStations: await P.kdsStation.count({ where: w }),
    members: await P.customer.count({ where: w }),
    accountSystemLinks: await P.accountSystemLink.count({ where: w }),
    posSales: await P.posSale.count({ where: w }),
    paymentProfiles: await P.paymentProfile.count({ where: w }),
  };
}
const coffeeCounts = await countsOf(C.tenantId);
const restoCounts = await countsOf(R.tenantId);
const qcUsers = await P.user.count({ where: { email: { in: [...PQC_EMAILS] } } });

// ═══════════════════ 4. ลายนิ้วมือร้านอื่น (หลัง) ═══════════════════
const after = await fingerprint();
const drift = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);

// ═══════════════════ 5. เฉลย ═══════════════════
const usersOut = (def: Any) =>
  Object.fromEntries(Object.entries(def.users).map(([k, u]: [string, Any]) => [k, { userId: u.userId, membershipId: u.membershipId, email: u.email, role: u.role }]));
const expected = {
  $note: "เขียนโดย scripts/seed-pos-qc.mts — ห้ามแก้มือ · id หลักตายตัวจาก scripts/pos-qc-env.mts (PQC)",
  tag: PQC.tag,
  pages: POS_PAGES,
  coffee: {
    tenantId: C.tenantId,
    slug: C.slug,
    posSystemId: C.systems.POS.id,
    systems: Object.fromEntries(Object.entries(C.systems).map(([k, s]) => [k, s.id])),
    units: { silom: coffeeUnits.silom.id, ari: coffeeUnits.ari.id },
    users: usersOut(C),
    memberId: member.id,
    items: coffeeItems,
    counts: coffeeCounts,
  },
  resto: {
    tenantId: R.tenantId,
    slug: R.slug,
    posSystemId: R.systems.POS.id,
    systems: Object.fromEntries(Object.entries(R.systems).map(([k, s]) => [k, s.id])),
    units: { main: restoUnit.id },
    users: usersOut(R),
    items: restoItems,
    menu: menuRows,
    counts: restoCounts,
  },
  qcUsers,
};
writeFileSync(PQC.expectedPath, JSON.stringify(expected, null, 2) + "\n");

// ── สรุป (ไม่มีเวลา/จำนวนที่เพิ่งสร้าง — ต้องเหมือนเดิมทุกตัวอักษรเมื่อรันซ้ำ) ──
const summary = { coffee: coffeeCounts, resto: restoCounts, qcUsers, otherTenantsUnchanged: drift.length === 0 };
console.log("\n── ร้านกาแฟ ──");
for (const it of coffeeItems) console.log(`  ${it.sku.padEnd(13)} ${String(it.salePrice ?? it.invPriceSatang).padStart(6)} สต. · VAT ${it.vatRateBp ?? "-"}bp · คงเหลือ ${it.onHand}${it.barcode ? ` · ${it.barcode}` : ""} · ${it.kind}`);
console.log("── ร้านอาหาร ──");
for (const it of restoItems) console.log(`  ${it.sku.padEnd(13)} ${String(it.salePrice ?? "-").padStart(6)} สต. · คงเหลือ ${it.onHand}${it.barcode ? ` · ${it.barcode}` : ""}`);
for (const m of menuRows) console.log(`  เมนู ${m.name} ${m.basePrice} สต.${m.stockQty != null ? ` · สต็อกเมนู ${m.stockQty}` : ""}`);
console.log(`\nลายนิ้วมือร้านอื่น ${Object.keys(before).length} ค่า · ${drift.length === 0 ? "ไม่เปลี่ยนเลย ✅" : `เปลี่ยน ❌ ${drift.map((k) => `${k}: ${before[k]} → ${after[k]}`).join(" · ")}`}`);
console.log(`FINGERPRINT_OTHER_TENANTS ${JSON.stringify(after)}`);
console.log(`แถวใหม่รอบนี้: ${Object.keys(created).length ? JSON.stringify(created) : "ไม่มี (รันซ้ำ)"} · เฉลย ${PQC.expectedPath} · ${Math.round((Date.now() - t0) / 1000)} วิ`);
console.log(`SEED_SUMMARY ${JSON.stringify(summary)}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: "seed-pos-qc", ok: drift.length === 0, createdThisRun: created, drift })}`);
await prisma.$disconnect();
process.exit(drift.length === 0 ? 0 : 1);
