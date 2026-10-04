// POS หน้าขาย (register/cashier) — reads + resolve เท่านั้น · ห้ามแตะ createSale engine
// รวม logic ปลอดภัยของหน้าขาย: หา unit ที่ผูก POS · resolve ระบบแต้ม/คูปอง/คลัง/สมาชิก ที่ผูก unit เดียวกัน
//   + catalog สินค้าจากคลัง (ราคาขายจาก AccountProduct ถ้าเชื่อม ไม่งั้น fallback ต้นทุน)
// ทุกอย่าง tenant-scoped ผ่าน filter tenantId ตรง ๆ (กันข้ามร้าน)

import { prisma } from "@/lib/core/db";
import { systemForUnit } from "@/lib/modules/system/service";
import * as inventory from "@/lib/modules/inventory/service";
import * as account from "@/lib/modules/account";
// POS P1.1b ▸ setItemSalePrice (สินค้าที่ผูกบัญชีแล้ว) เขียนราคาผ่าน catalog-legacy — AccountProduct + แคตตาล็อกในธุรกรรมเดียว (มติ 1) ◂
import { writeAccountProductSalePrice } from "./catalog-legacy";
// CRM C2.7 ▸ เส้น pos→crm (chokepoint ที่ลงทะเบียนใน scripts/fitness.mts) — หน้าขายอ่าน "ดีลที่ยังเปิดอยู่ของลูกค้าคนนี้"
//   และผูกบิลเข้าดีล ผ่าน **facade `@/lib/modules/crm` เท่านั้น** (ห้าม import ไฟล์ภายในของ CRM · ด่าน F2.3) ◂
import * as crm from "@/lib/modules/crm";
import type { MemberActor } from "@/lib/modules/member";

// type = ชนิดหน้างาน (BOOKING/SHOP/RESTAURANT…) — หน้า POS ใช้ตั้งค่าเริ่มต้นว่าบริการใหม่ควรจองล่วงหน้าได้ไหม
export type PosUnit = { id: string; name: string; type: string };
export type PosCatalogItem = {
  id: string;
  name: string;
  unitLabel: string;
  priceSatang: number;
  sku: string;
  barcode: string | null;
};
export type PosMember = { id: string; name: string | null; memberCode: string; phone: string | null };

// ── M2.8 · แผงสิทธิ์ที่หน้าขาย (ภาพ 06) ────────────────────────────────────────
// 🔴 ชนิดข้อมูลของแผงอยู่ที่นี่ (ไม่ใช่ใน `actions/pos.ts`) เพราะไฟล์ `"use server"`
//    **ห้าม export ชนิดข้อมูลปนกับ server action** (บทเรียน M2.2: Next นับทุก export
//    ในไฟล์ use-server เป็น action แล้วหน้าจอพังตอนรัน ทั้งที่ tsc เขียว)
// ตัวเลขทุกตัวเป็น "สตางค์" · ข้อความไทยล้วน (พนักงานอ่านหน้างาน) · ไม่มี PIN/เลขบัตรเต็มในนี้

/** สิทธิ์ที่พนักงานติ๊กเลือกให้บิลนี้ — ส่วนลดระดับไม่ต้องเลือก (ใช้อัตโนมัติทุกบิล) */
export type PosMemberChoicesInput = {
  voucherIds?: string[];
  points?: number;
  giftCard?: { number: string; pin: string; satang: number };
};

export type PosMemberVoucher = {
  id: string;
  name: string;
  code: string;
  valueLabel: string;
  expiresLabel: string;
  /** ใช้กับตะกร้าตอนนี้ได้ไหม (false = แสดงจาง + เหตุผล) */
  applicable: boolean;
  reason: string | null;
};

export type PosMemberStamp = { cardId: string; name: string; stamps: number; slots: number };

/** บัตรกำนัลของสมาชิก — เลขปิดบังเท่านั้น (ใช้จริงต้องกรอกเลขเต็ม + PIN ที่หน้าจอ) */
export type PosMemberGiftCard = { numberMasked: string; balanceSatang: number };

/** กระเป๋าสิทธิ์ของสมาชิกที่เลือก — โหลดครั้งเดียวตอนเลือกคน (ไม่ใช่ทุกครั้งที่ตะกร้าเปลี่ยน) */
export type PosMemberRights = {
  memberId: string;
  name: string;
  memberCode: string;
  tierName: string | null;
  tierDiscountPct: number;
  tierDiscountFixedSatang: number;
  /** "สมาชิกมา 2 ปี 3 เดือน" */
  memberSinceLabel: string;
  pointBalance: number;
  burnRateSatang: number;
  burnMinPoints: number;
  burnMaxPct: number;
  vouchers: PosMemberVoucher[];
  giftCards: PosMemberGiftCard[];
  stamps: PosMemberStamp[];
};

export type PosMemberQuoteLine = {
  kind: string;
  ref: string | null;
  label: string;
  discountSatang: number;
  note: string | null;
};

/** ผลของ "ถ้าใช้สิทธิ์ชุดนี้กับตะกร้านี้" — มาจาก `member.quoteApply` ตรง ๆ (ลำดับ/กันซ้อนคิดที่นั่น) */
export type PosMemberQuote = {
  order: string[];
  lines: PosMemberQuoteLine[];
  conflicts: { kind: string; ref: string | null; message: string }[];
  totalDiscountSatang: number;
  netSatang: number;
  pointsToEarn: number;
  stampsToAdd: { cardId: string; name: string; count: number }[];
};
export type PosLinks = {
  pointSystemId: string | null;
  couponSystemId: string | null;
  inventorySystemId: string | null;
  memberSystemId: string | null;
};

// unit ทั้งหมดที่ผูกกับระบบ POS นี้ (type=POS) — เรียงเก่าสุดก่อน
export async function posUnits(tenantId: string, posSystemId: string): Promise<PosUnit[]> {
  const links = await prisma.appSystemUnit.findMany({
    where: { tenantId, systemId: posSystemId, type: "POS" },
    select: { unitId: true },
  });
  if (links.length === 0) return [];
  const units = await prisma.businessUnit.findMany({
    where: { tenantId, id: { in: links.map((l) => l.unitId) }, status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, type: true },
  });
  return units;
}

// HF-POS-PAGES: สาขาที่ "ราคาขาย" ของ POS นี้ไปถึง — ราคาอยู่ที่ AccountProduct ผูก InvItem ของคลัง
//   ⇒ ทุกหน้าขายที่สาขาใช้คลังเดียวกันเห็นราคาเดียวกัน (posCatalog) · คืน = สาขาของ POS นี้ + สาขาที่ผูกคลัง
//   ที่สาขาของ POS นี้ใช้ (ไม่นับ archived) — ใช้ตัดสินว่าใครตั้งราคาได้ (posCanSetTenantPrice)
export async function posPriceUnitIds(tenantId: string, posSystemId: string): Promise<string[]> {
  const units = await posUnits(tenantId, posSystemId);
  if (units.length === 0) return [];
  const invLinks = await prisma.appSystemUnit.findMany({
    where: { tenantId, type: "INVENTORY", unitId: { in: units.map((u) => u.id) } },
    select: { systemId: true },
  });
  const invIds = [...new Set(invLinks.map((l) => l.systemId))];
  const shared = invIds.length
    ? await prisma.appSystemUnit.findMany({ where: { tenantId, type: "INVENTORY", systemId: { in: invIds } }, select: { unitId: true } })
    : [];
  const extra = shared.map((l) => l.unitId).filter((id) => !units.some((u) => u.id === id));
  const live = extra.length
    ? await prisma.businessUnit.findMany({ where: { tenantId, id: { in: extra }, status: { not: "ARCHIVED" } }, select: { id: true } })
    : [];
  return [...units.map((u) => u.id), ...live.map((u) => u.id)];
}

// ตรวจว่า unit นี้ผูกกับ POS นี้จริง (กันยิง unitId ข้ามร้าน/ข้ามระบบ) → true/false
export async function posUnitIsLinked(tenantId: string, posSystemId: string, unitId: string): Promise<boolean> {
  const link = await prisma.appSystemUnit.findUnique({
    where: { tenantId_unitId_type: { tenantId, unitId, type: "POS" } },
    select: { systemId: true },
  });
  return !!link && link.systemId === posSystemId;
}

// resolve ระบบที่ผูก unit เดียวกัน (แต้ม/คูปอง/คลัง/สมาชิก) — null = ไม่มี
export async function resolvePosLinks(tenantId: string, unitId: string): Promise<PosLinks> {
  const [pointSystemId, couponSystemId, inventorySystemId, memberSystemId] = await Promise.all([
    systemForUnit(tenantId, unitId, "POINT"),
    systemForUnit(tenantId, unitId, "COUPON"),
    systemForUnit(tenantId, unitId, "INVENTORY"),
    systemForUnit(tenantId, unitId, "MEMBER"),
  ]);
  return { pointSystemId, couponSystemId, inventorySystemId, memberSystemId };
}

// catalog สินค้าจากคลังที่ผูก unit — ราคาขายจาก AccountProduct.salePrice (ถ้าเชื่อม) ไม่งั้น fallback ต้นทุนถัวเฉลี่ย
// (InvItem ไม่มีช่องราคาขายของตัวเอง — พนักงานแก้ราคาในตะกร้าได้เสมอ)
export async function posCatalog(tenantId: string, inventorySystemId: string): Promise<PosCatalogItem[]> {
  const items = await inventory.listItems({ tenantId, systemId: inventorySystemId });
  const acctIds = items.map((i) => i.accountProductId).filter((x): x is string => !!x);
  const products = acctIds.length
    ? await prisma.accountProduct.findMany({
        where: { tenantId, id: { in: acctIds } },
        select: { id: true, salePrice: true },
      })
    : [];
  const priceById = new Map(products.map((p) => [p.id, p.salePrice]));
  return items.map((i) => {
    const sale = i.accountProductId ? priceById.get(i.accountProductId) : null;
    const priceSatang = sale && sale > 0 ? sale : Math.max(0, i.costSatang);
    return { id: i.id, name: i.name, unitLabel: i.unitLabel, priceSatang, sku: i.sku, barcode: i.barcode };
  });
}

/** บริการที่ขายหน้าร้านได้ — มาจาก **แคตตาล็อกกลาง** (InvItem kind=SERVICE) */
export type PosServiceItem = { id: string; name: string; priceSatang: number; durationMin: number; bookable: boolean };

/**
 * บริการที่ขายหน้าร้านได้ — ร้านบริการ (ตัดผม/นวด/คลินิก) รายได้หลักคือบริการ ไม่ใช่สินค้า
 * 🔴 13 ส.ค. 2026 (เจ้าของสั่งข้อ 14-15): ดึงจาก **แคตตาล็อกกลาง** ไม่ใช่ BookingService อีกแล้ว
 *    ต้นฉบับเดียว → ตั้งราคาที่ระบบสินค้า/บริการ แล้วทั้งหน้าขายและหน้าจองเห็นตรงกัน
 * บริการไม่ตัดสต็อก: บรรทัดบิลใส่ serviceId (ไม่ใส่ itemId) — ตรงกับสัญญาเดิมของ PosSaleLine
 */
export async function posServices(
  tenantId: string,
  inventorySystemId: string | null,
  unitId?: string | null,
): Promise<PosServiceItem[]> {
  if (inventorySystemId) {
    const rows = await inventory.listServices({ tenantId, systemId: inventorySystemId });
    if (rows.length > 0) {
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        priceSatang: r.priceSatang,
        durationMin: r.durationMin ?? 0,
        bookable: r.bookable,
      }));
    }
  }
  // ── ทางสำรอง (M2.8): ร้านที่ยังไม่ได้เปิดระบบคลัง/ยังไม่ได้ย้ายบริการเข้าแคตตาล็อกกลาง ──
  // 🔴 `registerSaleAction` ตรวจ `serviceId` ที่ client ส่งมากับตาราง **BookingService ของสาขานี้** อยู่แล้ว
  //    ⇒ ถ้าหน้าขายไม่เคยเสนอบริการจากตารางนั้นเลย ร้านบริการที่ยังไม่มีคลังจะ "ขายอะไรไม่ได้เลย"
  //    (ต้องพิมพ์รายการเองทุกบิล · ยอดไม่เข้ารายงานฝั่งบริการ) — ปิดช่องนี้ตอนที่แตะหน้าขายอยู่แล้ว
  //    ไม่ระบุสาขา = ไม่ถาม (ผู้เรียกเดิมที่ส่ง 2 พารามิเตอร์ยังได้พฤติกรรมเดิมเป๊ะ)
  if (!unitId) return [];
  const rows = await prisma.bookingService.findMany({
    where: { tenantId, unitId, active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, priceSatang: true, durationMin: true, bookable: true },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    priceSatang: r.priceSatang,
    durationMin: r.durationMin,
    bookable: r.bookable,
  }));
}

// ═══════════ หน้า "สินค้า/ราคา" ของ POS (WO ส่วน B) ═══════════
// ตั้งราคาขายต่อสินค้าในคลังที่ผูก POS · ราคาขายเก็บที่ AccountProduct.salePrice (master data)
//   - resolve inventorySystemId จาก unit แรกที่ผูกคลัง (POS หน้าเดียวต่อระบบ)
//   - resolve accountSystemId ผ่าน facade (AccountSystemLink POS↔บัญชี) — ไม่มี = ตั้งราคาสินค้า "ใหม่" ไม่ได้
//     (แก้ราคาสินค้าที่ผูก AccountProduct ไว้แล้วยังทำได้ เพราะรู้ productId ตรง)

export type PosProductRow = {
  id: string; // InvItem.id
  name: string;
  unitLabel: string;
  sku: string;
  costSatang: number;
  salePriceSatang: number | null; // null = ยังไม่ตั้งราคาขาย (POS จะ fallback ต้นทุน)
  linked: boolean; // ผูก AccountProduct แล้วหรือยัง
};
export type PosProductsResult = {
  inventorySystemId: string | null; // null = POS ยังไม่ผูกคลัง (ไม่มีสินค้าให้ตั้งราคา)
  accountSystemId: string | null; // null = ยังไม่เชื่อมระบบบัญชี (ตั้งราคาสินค้าใหม่ไม่ได้)
  items: PosProductRow[];
};

// resolve ระบบคลังที่ผูก POS นี้ (ผ่าน unit แรกที่มีคลัง) — null = ไม่มี
async function inventorySystemForPos(tenantId: string, posSystemId: string): Promise<string | null> {
  const units = await posUnits(tenantId, posSystemId);
  for (const u of units) {
    const links = await resolvePosLinks(tenantId, u.id);
    if (links.inventorySystemId) return links.inventorySystemId;
  }
  return null;
}

// รายการสินค้าที่ POS ขาย (จากคลัง) + ราคาขายปัจจุบัน (จาก AccountProduct.salePrice ถ้ามี)
export async function listPosProducts(tenantId: string, posSystemId: string): Promise<PosProductsResult> {
  const [inventorySystemId, accountSystemId] = await Promise.all([
    inventorySystemForPos(tenantId, posSystemId),
    account.posAccountSystemId(tenantId, posSystemId),
  ]);
  if (!inventorySystemId) return { inventorySystemId: null, accountSystemId, items: [] };

  const items = await inventory.listItems({ tenantId, systemId: inventorySystemId });
  const acctIds = items.map((i) => i.accountProductId).filter((x): x is string => !!x);
  const products = acctIds.length
    ? await prisma.accountProduct.findMany({
        where: { tenantId, id: { in: acctIds } },
        select: { id: true, salePrice: true },
      })
    : [];
  const priceById = new Map(products.map((p) => [p.id, p.salePrice]));
  const rows: PosProductRow[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    unitLabel: i.unitLabel,
    sku: i.sku,
    costSatang: Math.max(0, i.costSatang),
    salePriceSatang: i.accountProductId ? priceById.get(i.accountProductId) ?? null : null,
    linked: !!i.accountProductId,
  }));
  return { inventorySystemId, accountSystemId, items: rows };
}

export type SetSalePriceResult = { ok: true; productId: string } | { ok: false; reason: string };

// ตั้งราคาขายของสินค้า item หนึ่ง:
//   - item ผูก AccountProduct แล้ว → update salePrice (ผ่าน facade บัญชี)
//   - ยังไม่ผูก → ต้องมีระบบบัญชี → สร้าง AccountProduct (ชื่อ=item.name) + set ราคา + ผูก InvItem.accountProductId
// find→update/create เท่านั้น (ไม่ upsert) · ราคาขายไม่กระทบ ledger (master data)
export async function setItemSalePrice(
  tenantId: string,
  posSystemId: string,
  itemId: string,
  salePriceSatang: number,
): Promise<SetSalePriceResult> {
  if (!Number.isFinite(salePriceSatang) || salePriceSatang < 0) {
    return { ok: false, reason: "ราคาขายต้องเป็นตัวเลขไม่ติดลบ" };
  }
  const price = Math.round(salePriceSatang);

  const inventorySystemId = await inventorySystemForPos(tenantId, posSystemId);
  if (!inventorySystemId) return { ok: false, reason: "ยังไม่ได้เชื่อมระบบสินค้า/บริการกับระบบขายนี้" };

  const invCtx = { tenantId, systemId: inventorySystemId };
  const item = await inventory.getItem(invCtx, itemId); // scope tenant+system → กัน itemId ข้ามร้าน/ข้ามระบบ
  if (!item) return { ok: false, reason: "ไม่พบสินค้าในคลัง" };

  // มี AccountProduct อยู่แล้ว → แค่แก้ราคา (รู้ productId ตรง ไม่ต้องมีระบบบัญชีผูก POS)
  if (item.accountProductId) {
    const productId = item.accountProductId;
    const ok = await prisma.$transaction((tx) => writeAccountProductSalePrice(tx, tenantId, productId, price));
    if (!ok) return { ok: false, reason: "อัปเดตราคาไม่สำเร็จ" };
    return { ok: true, productId: item.accountProductId };
  }

  // ยังไม่ผูก → ต้องมีระบบบัญชีเพื่อเก็บราคา (AccountProduct.systemId บังคับ)
  const accountSystemId = await account.posAccountSystemId(tenantId, posSystemId);
  if (!accountSystemId) {
    return { ok: false, reason: "ตั้งราคาขายต้องเปิด/เชื่อมระบบบัญชีกับระบบขายนี้ก่อน" };
  }
  const productId = await account.createAccountProductWithSalePrice(tenantId, accountSystemId, {
    name: item.name,
    salePriceSatang: price,
  });
  await inventory.linkAccountProduct(invCtx, itemId, productId);
  return { ok: true, productId };
}

// สมาชิกในระบบสมาชิกที่ผูก unit (สำหรับ dropdown แนบบิลเพื่อสะสมแต้ม) — เว้น null = ไม่มีระบบสมาชิก
export async function posMembers(tenantId: string, memberSystemId: string): Promise<PosMember[]> {
  const rows = await prisma.customer.findMany({
    where: { tenantId, memberSystemId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, name: true, memberCode: true, phone: true },
  });
  return rows.map((c) => ({ ...c, memberCode: c.memberCode ?? "" }));
}

// ═══════════ CRM C2.7 · ช่อง "ดีล" ที่หน้าขาย (พิมพ์เขียว §7.2 · ภาพ 06) ═══════════
//
// 🔴 อ่าน/เขียนฝั่ง CRM ผ่าน facade เท่านั้น · ขอบเขตการมองเห็น/คีย์สิทธิ์ตัดสินในโมดูล CRM (แคชเชียร์เห็นเฉพาะดีลของตัวเอง)
// 🔴 ไม่มีคีย์ `crm.deal.read` / ร้านยังใช้ CRM รุ่นเดิม (uiVersion 1) = รายการว่าง **ไม่ใช่ error** — หน้าขายต้องขายต่อได้เสมอ

/** ดีลที่เลือกได้ที่หน้าขาย (1 แถวต่อดีล · ยอดเป็นสตางค์) */
export type PosDealOption = { id: string; systemId: string; title: string; valueSatang: number; stageName: string };

/** ระบบ CRM ทุกใบของร้าน (เก่าสุดก่อน) — ประตู uiVersion/คีย์ ตัดสินในโมดูล CRM เอง */
async function crmSystemIds(tenantId: string): Promise<string[]> {
  const rows = await prisma.appSystem.findMany({ where: { tenantId, type: "CRM" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
  return rows.map((r) => r.id);
}

/**
 * ดีลที่ยังเปิดอยู่ของสมาชิกที่แคชเชียร์เลือก (ผ่าน Party ของสมาชิก) — ว่างได้เสมอ ไม่ throw
 * 🔴 มติผู้คุมงาน C2.7 รอบ 2 (N1): ไม่มีคีย์ `crm.deal.update` = **ซ่อนช่อง "ดีล" ไปเลย** (รายการว่าง)
 *    คนที่ผูกบิลไม่ได้ ต้องไม่เห็นช่องให้เลือก ไม่ใช่เลือกแล้วไปเจอ "ไม่มีสิทธิ์" ตอนเก็บเงินเสร็จ (เงินจ่ายแล้ว แก้อะไรไม่ได้)
 *    ตัวตัดสินคีย์คือ `crm.crmCan` ของโมดูล CRM (ผ่าน facade) — ไม่มีทะเบียนสิทธิ์ซ้อนในโมดูล POS
 */
export async function posOpenDeals(tenantId: string, actor: MemberActor, memberId: string): Promise<PosDealOption[]> {
  const id = String(memberId ?? "").trim();
  if (!id) return [];
  if (!crm.crmCan(actor, "crm.deal.update")) return [];
  const cust = await prisma.customer.findFirst({ where: { id, tenantId }, select: { partyId: true } });
  if (!cust?.partyId) return [];
  const out: PosDealOption[] = [];
  for (const systemId of await crmSystemIds(tenantId)) {
    const rows = await crm.payments.openDealsForParty({ tenantId, systemId }, actor, cust.partyId).catch(() => []);
    for (const d of rows) out.push({ id: d.id, systemId, title: d.title, valueSatang: d.valueSatang, stageName: d.stageName });
    if (out.length >= crm.POS_LINK_LIMIT) break;
  }
  return out.slice(0, crm.POS_LINK_LIMIT);
}

/**
 * ผูกบิลที่ขายสำเร็จแล้วเข้ากับดีล — คืน true เมื่อผูกได้
 * ร้านมีระบบ CRM ได้หลายใบ: ลองทีละใบ ใบที่ไม่ได้เป็นเจ้าของดีลจะตอบ "ไม่พบ" (ขอบเขต X1 ของโมดูล CRM) ⇒ ข้ามไป
 * 🔴 ผู้เรียก (`registerSaleAction`) ต้องห่อไว้เสมอ: บิลจ่ายเงินแล้ว ความล้มของ CRM ห้ามทำให้การขายล้ม
 */
export async function posLinkSaleToDeal(tenantId: string, actor: MemberActor, input: { dealId: string; saleId: string }): Promise<boolean> {
  const dealId = String(input?.dealId ?? "").trim();
  const saleId = String(input?.saleId ?? "").trim();
  if (!dealId || !saleId) return false;
  let lastError: unknown = null;
  for (const systemId of await crmSystemIds(tenantId)) {
    try {
      await crm.payments.linkSaleToDeal({ tenantId, systemId }, actor, { dealId, saleId });
      return true;
    } catch (e) {
      const code = (e as { code?: unknown } | null)?.code;
      if (code === "NOT_FOUND" || code === "FORBIDDEN") continue; // ดีลไม่ได้อยู่ในระบบใบนี้ / ระบบนี้ยังไม่เปิด CRM ใหม่
      lastError = e;
    }
  }
  if (lastError) throw lastError;
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// POS P1.3 ▸ หน้าขายใหม่ — ฝั่งเซิร์ฟเวอร์ (B1) · registerCatalog · registerScan · quoteRegisterCart · submitRegisterSale ·
//   registerStatus · registerVatConfig · สัญญา = scripts/qc-pos-p1.3.mts (S1–S4) + ledger/pos-briefs/pos-brief-P1.3.md (Addendum 2)
//   โน้ต: ledger/wo-notes/pos-P1.3.md
// 🔴 บล็อกนี้แยกจากโค้ดเดิมทั้งไฟล์ (P1.1b แก้ setItemSalePrice ในไฟล์เดียวกันขนาน) — import ของบล็อกอยู่ตรงนี้ (ES hoist) ไม่แตะหัวไฟล์
// 🔴 ทุกฟังก์ชัน "คืน" คำปฏิเสธ {ok:false, code, message} ไม่ throw (server action ของ Next ปิดข้อความ error ใน production) ·
//    ขัดข้องที่ไม่คาดคิด = code INTERNAL (ต้นฉบับ console.error ฝั่งเซิร์ฟเวอร์ครั้งเดียว)
// 🔴 ผู้ขาย (actor) มาจากผู้เรียก: server action สร้างจาก membership ของ SESSION (register-actions.ts) — ที่นี่ตัดสินสิทธิ์จาก actor นั้น
//    ⇒ อ่านแคตตาล็อกตรงแบบอ่านอย่างเดียว ด้วยกติกามองเห็นเดียวกับ catalog.listForUnit (สาขา · ไม่เก็บถาวร · C3 คลังของสาขา)
//    ไม่เรียก listForUnit เพราะมันโหลด membership จาก DB ใหม่ตาม actorUserId (ไม่ใช่ actor ที่ส่งมา) และหน้าขายห้ามใช้
//    ตัวบ่งชี้ผู้เรียกระดับระบบ (F15.5) · การ "เขียน" แคตตาล็อกไม่มีในบล็อกนี้ (F15.1)
// 🔴 เงิน: ราคาอ่านจาก DB ใหม่ทุกครั้งทั้ง quote และ submit (ราคาที่ client ส่งมากับสินค้าแคตตาล็อกถูกเมิน) · สตางค์ Int ล้วน ·
//    ส่วนลดเกินเพดาน/เกินยอด = ปฏิเสธ · บิลจริงเดินผ่าน createSale เดิม (ตัดสต็อก · บัญชี · แต้ม · outbox เหมือนวันนี้ทุกประการ)
import { Prisma, type PosProduct, type PrismaClient } from "@prisma/client";
import { canAccessUnit, evaluate, permissionValue } from "@/lib/core/rbac";
import { createSale, type CreateSaleInput } from "./service";
import { effectiveTrackStock, menuSoldOutIds, rowAvailable } from "./catalog";
import { priceCart, roundHalfUp, PRICE_MAX_SATANG, type PriceDiscount } from "./pricing-shared";
import {
  REGISTER_MAX_LINES,
  REGISTER_MAX_QTY,
  REGISTER_PAGE_MAX,
  REGISTER_PAGE_SIZE,
  REGISTER_PAY_TYPES,
  REGISTER_STAFF_MAX_DISCOUNT_BP,
  type RegisterActor,
  type RegisterCatalogInput,
  type RegisterCatalogResult,
  type RegisterCategory,
  type RegisterCtx,
  type RegisterPayType,
  type RegisterProduct,
  type RegisterQuoteInput,
  type RegisterQuoteLine,
  type RegisterQuoteResult,
  type RegisterQuoteTotals,
  type RegisterRefusal,
  type RegisterRefusalCode,
  type RegisterRole,
  type RegisterScanResult,
  type RegisterStatusResult,
  type RegisterSubmitInput,
  type RegisterSubmitResult,
  type RegisterVatConfigResult,
} from "./register-shared";

/** ผู้เรียกส่ง PrismaClient ของตัวเองได้ (ข้อสอบยิงพร้อมกันบน connection แยกต่อคำขอ) — ไม่ส่ง = prisma ของแอป */
type RegDb = PrismaClient;

const REG_MESSAGE: Record<RegisterRefusalCode, string> = {
  NOT_FOUND: "ไม่พบสาขานี้ หรือบัญชีนี้ยังขายที่สาขานี้ไม่ได้",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของร้าน",
  VALIDATION: "ข้อมูลที่ส่งมาไม่ถูกต้อง — ยังไม่ได้บันทึกอะไร",
  INVALID_LINE: "จำนวนหรือราคาไม่ถูกต้อง — ตรวจรายการอีกครั้ง",
  PRODUCT_NOT_FOUND: "มีสินค้าที่ไม่ได้ขายที่สาขานี้แล้ว — นำออกจากตะกร้าแล้วลองใหม่",
  PRODUCT_UNAVAILABLE: "สินค้านี้ปิดขายที่สาขานี้อยู่",
  OPTIONS_REQUIRED: "สินค้านี้ต้องเลือกตัวเลือก — ยังขายจากหน้านี้ไม่ได้",
  MEMBER_NOT_FOUND: "ไม่พบสมาชิกนี้ในร้าน",
  MEMBER_RIGHTS_UNSUPPORTED: "สมาชิกคนนี้มีส่วนลดอัตโนมัติ — หน้าขายนี้ยังคิดสิทธิ์สมาชิกไม่ได้ ขายแบบไม่แนบสมาชิก หรือใช้หน้าขายเดิม",
  PRICE_NOT_SET: "สินค้านี้ยังไม่ตั้งราคา — ตั้งราคาที่หน้าสินค้าก่อน",
  PRICE_CHANGED: "ราคาบางรายการเปลี่ยน — ตรวจยอดใหม่แล้วชำระอีกครั้ง",
  PAYMENT_MISMATCH: "ยอดเงินไม่ตรงกับยอดบิลล่าสุด — ตรวจยอดใหม่แล้วชำระอีกครั้ง",
  IDEMPOTENCY_CONFLICT: "มีบิลของรายการนี้อยู่แล้ว — ตรวจบิลเดิมก่อน ห้ามขายซ้ำ",
  LINE_DISCOUNT_EXCEEDS_LINE: "ส่วนลดมากกว่าราคาของรายการ",
  BILL_DISCOUNT_EXCEEDS_TOTAL: "ส่วนลดท้ายบิลมากกว่ายอดบิล",
  DISCOUNT_EXCEEDS_LIMIT: "ส่วนลดเกินสิทธิ์ของบัญชีนี้ — ให้ผู้จัดการทำรายการนี้",
  TOO_MANY_LINES: `บิลหนึ่งใส่ได้ไม่เกิน ${REGISTER_MAX_LINES} รายการ — แยกเป็นบิลใหม่`,
  STOCK_INSUFFICIENT: "สินค้าในสต็อกไม่พอ",
  CONFLICT: "มีรายการนี้อยู่แล้ว",
  BUSY: "ระบบกำลังบันทึกบิลอื่นของสาขานี้อยู่ — ลองอีกครั้งด้วยบิลเดิม ระบบจะไม่เก็บเงินซ้ำ",
  INTERNAL: "ระบบขายขัดข้องชั่วคราว — ลองอีกครั้งด้วยบิลเดิม ระบบจะไม่เก็บเงินซ้ำ",
  UNKNOWN: "เกิดข้อผิดพลาด — ลองอีกครั้ง",
};
const REG_ROLE_LABEL: Record<RegisterRole, string> = { OWNER: "เจ้าของร้าน", MANAGER: "ผู้จัดการ", STAFF: "แคชเชียร์" };

function regRefuse(code: RegisterRefusalCode, message?: string, lineIndex?: number): RegisterRefusal {
  return lineIndex === undefined ? { ok: false, code, message: message ?? REG_MESSAGE[code] } : { ok: false, code, message: message ?? REG_MESSAGE[code], lineIndex };
}
const isRegRefusal = (v: unknown): v is RegisterRefusal => !!v && typeof v === "object" && (v as { ok?: unknown }).ok === false;
const regIsRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const regIsMoney = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= PRICE_MAX_SATANG;

/** ไม่มี NUL และเป็น UTF-16 ถูกรูป (กติกาเดียวกับ catalog R5 F2) */
function regCleanText(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0) return false;
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}
/** id/คีย์: สตริงไม่ว่าง สะอาด ยาว ≤ 200 */
const regIsId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && regCleanText(v);
/**
 * R4 K1 (มติ R4.1): คีย์ของ client = [A-Za-z0-9_-] ยาว 8–100 เท่านั้น (UI ส่ง UUID) — ":" ไม่อยู่ในชุดอักษร ⇒ "reg2:…" จาก client = VALIDATION
 * เซิร์ฟเวอร์เก็บ/ค้นด้วย REG_KEY_PREFIX + คีย์ เสมอ ⇒ หน้าขายใหม่ไม่มีวันเจอหรือยึดคีย์ของโมดูลอื่น (hotel-sale-… · rental-… · booking-deposit-…)
 * 🔴 actions/pos.ts (หน้าขายเดิม) ยังมีรูเดิม — ไม่แตะใน P1.3 (O23 แยก hotfix)
 */
const regIsIdemKey = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(v);
/** namespace ของคีย์หน้าขายใหม่ใน PosSale.idempotencyKey (ตายตัว — มติ R4.1 ข้อ 2) */
const REG_KEY_PREFIX = "reg2:";
/** คีย์ของออบเจกต์อยู่ในรายการที่รู้จักทั้งหมดไหม (คีย์แปลกปลอม = VALIDATION ไม่เงียบทิ้ง) */
const regOnlyKeys = (o: Record<string, unknown>, allowed: ReadonlySet<string>) => Object.keys(o).every((k) => allowed.has(k));

/** ขอบของทุกฟังก์ชันในบล็อกนี้ — error ที่ไม่คาดคิด = INTERNAL (คืน ไม่ throw) */
async function regGuard<T>(name: string, body: () => Promise<T>): Promise<T | RegisterRefusal> {
  try {
    return await body();
  } catch (e) {
    console.error(`[pos/register] ${name} INTERNAL`, e);
    return regRefuse("INTERNAL");
  }
}

// ── ขอบเขตของคำขอ: ร้าน + ระบบ POS + สาขา + ผู้ขาย (404 ไม่ใช่ 403 · มติ R8) ──
type RegScope = { tenantId: string; systemId: string; unitId: string; unitName: string; unitInv: string | null; actor: RegisterActor };

function regActorOf(a: unknown): RegisterActor | null {
  if (!regIsRecord(a) || !regIsId(a.userId)) return null;
  if (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF") return null;
  if (!Array.isArray(a.unitAccess) || !a.unitAccess.every((x) => typeof x === "string")) return null;
  if (!regIsRecord(a.permissions)) return null;
  return { userId: a.userId, role: a.role, unitAccess: [...(a.unitAccess as string[])], permissions: a.permissions };
}

/**
 * ctx ผิดรูป / ระบบไม่ใช่ POS ที่เปิดใช้งานของร้านนี้ / สาขาไม่ผูกระบบนี้ / สาขาเก็บถาวร / ผู้ขายเข้าสาขาไม่ได้ = NOT_FOUND
 * · actor ผิดรูป หรือไม่มี pos.sale.create ที่สาขานี้ = PERMISSION_DENIED (ด่านเดียวกับหน้า posRegisterView)
 */
async function regScope(db: RegDb, ctx: unknown, actorRaw: unknown): Promise<RegScope | RegisterRefusal> {
  if (!regIsRecord(ctx) || !regIsId(ctx.tenantId) || !regIsId(ctx.systemId) || !regIsId(ctx.unitId)) return regRefuse("NOT_FOUND");
  const { tenantId, systemId, unitId } = ctx as RegisterCtx;
  const actor = regActorOf(actorRaw);
  if (!actor) return regRefuse("PERMISSION_DENIED");
  const [sys, link, unit, inv] = await Promise.all([
    db.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS", active: true }, select: { id: true } }),
    db.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId, unitId, type: "POS" } }, select: { systemId: true } }),
    db.businessUnit.findFirst({ where: { id: unitId, tenantId, status: { not: "ARCHIVED" } }, select: { id: true, name: true } }),
    db.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId, unitId, type: "INVENTORY" } }, select: { systemId: true } }),
  ]);
  if (!sys || !link || link.systemId !== systemId || !unit) return regRefuse("NOT_FOUND");
  if (!canAccessUnit(actor, unitId)) return regRefuse("NOT_FOUND");
  if (!evaluate(actor, { module: "pos", action: "pos.sale.create", unitId })) return regRefuse("PERMISSION_DENIED");
  return { tenantId, systemId, unitId, unitName: unit.name, unitInv: inv?.systemId ?? null, actor };
}

// ── กติกามองเห็นสินค้า (ชุดเดียวกับ catalog.listForUnit) ──
function regVisibleWhere(s: RegScope): Prisma.Sql {
  const wh = s.unitInv
    ? Prisma.sql`(p."invItemId" IS NULL OR EXISTS (SELECT 1 FROM "InvItem" w WHERE w.id = p."invItemId" AND w."tenantId" = ${s.tenantId} AND w."systemId" = ${s.unitInv}))`
    : Prisma.sql`p."invItemId" IS NULL`;
  return Prisma.sql`p."tenantId" = ${s.tenantId} AND p."systemId" = ${s.systemId} AND p."archivedAt" IS NULL
    AND (p."unitId" IS NULL OR p."unitId" = ${s.unitId}) AND ${wh}`;
}
const regLike = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

type RegCursor = { n: string; i: string };
const regEncodeCursor = (p: { name: string; id: string }) => Buffer.from(JSON.stringify({ n: p.name, i: p.id })).toString("base64url");
function regDecodeCursor(v: string): RegCursor | null {
  try {
    const o: unknown = JSON.parse(Buffer.from(v, "base64url").toString("utf8"));
    if (regIsRecord(o) && typeof o.n === "string" && typeof o.i === "string" && regCleanText(o.n) && regIsId(o.i)) return { n: o.n, i: o.i };
  } catch {
    /* ผิดรูป */
  }
  return null;
}

async function regRowsInOrder(db: RegDb, tenantId: string, ids: string[]): Promise<PosProduct[]> {
  if (!ids.length) return [];
  const rows = await db.posProduct.findMany({ where: { tenantId, id: { in: ids } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}

/** แถว → สินค้าบนกริด (สเปก §3.2 + Q6 Q9 · trackStock แบบ C2 ผ่าน effectiveTrackStock ของ catalog) */
async function regViews(db: RegDb, s: RegScope, rows: PosProduct[]): Promise<RegisterProduct[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const invIds = [...new Set(rows.map((r) => r.invItemId).filter((x): x is string => !!x))];
  const [items, links, menuSoldOut] = await Promise.all([
    invIds.length ? db.invItem.findMany({ where: { tenantId: s.tenantId, id: { in: invIds } }, select: { id: true, onHand: true, barcode: true, sku: true } }) : Promise.resolve([]),
    db.posProductOptionGroup.findMany({ where: { tenantId: s.tenantId, productId: { in: ids } }, select: { productId: true, groupId: true } }),
    // P1.1b มติ 3 (merge): แถว MENU ใช้ความพร้อมขายสดจาก MenuItem — กติกาเดียวกับ catalog.listForUnit (S1.27)
    menuSoldOutIds(s.tenantId, rows, db),
  ]);
  const groupIds = [...new Set(links.map((l) => l.groupId))];
  const groups = groupIds.length
    ? await db.menuOptionGroup.findMany({ where: { tenantId: s.tenantId, id: { in: groupIds }, archivedAt: null }, select: { id: true, minSelect: true } })
    : [];
  const itemById = new Map(items.map((i) => [i.id, i]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  // AUTO ต้องรู้ว่า "เคยเคลื่อนไหว" ไหม — ถามเฉพาะแถว AUTO ที่ onHand = 0 ในคลังของสาขานี้ (แบบเดียวกับ catalog.toViews)
  const needMove = rows
    .filter((r) => r.trackStock === null && r.kind === "PRODUCT" && !!r.invItemId && itemById.get(r.invItemId)?.onHand === 0)
    .map((r) => r.invItemId as string);
  const moved =
    needMove.length && s.unitInv
      ? await db.$queryRaw<{ id: string }[]>`SELECT i.id FROM "InvItem" i WHERE i.id = ANY(${needMove}::text[]) AND i."tenantId" = ${s.tenantId}
          AND EXISTS (SELECT 1 FROM "InvMovement" m WHERE m."itemId" = i.id AND m."tenantId" = ${s.tenantId} AND m."systemId" = ${s.unitInv} LIMIT 1)`
      : [];
  const movedSet = new Set(moved.map((m) => m.id));
  return rows.map((p) => {
    const inv = p.invItemId ? itemById.get(p.invItemId) : undefined;
    const ts = effectiveTrackStock(p, inv ? { hasMovement: movedSet.has(inv.id), onHand: inv.onHand } : null);
    const grp = links.filter((l) => l.productId === p.id).map((l) => groupById.get(l.groupId)).filter((g): g is { id: string; minSelect: number } => !!g);
    const stockLeft = ts.trackStock && inv ? inv.onHand : null;
    const unavailable = !rowAvailable(p, s.unitId, menuSoldOut);
    // มติ 3.1 ข้อ 12: ปิดขายมือชนะหมดสต็อก
    const soldOutReason = unavailable ? ("UNAVAILABLE" as const) : stockLeft !== null && stockLeft <= 0 ? ("NO_STOCK" as const) : null;
    const images = Array.isArray(p.images) ? p.images.filter((x): x is string => typeof x === "string") : [];
    return {
      id: p.id,
      invItemId: p.invItemId,
      name: p.name,
      nameEn: p.nameEn,
      kind: p.kind,
      categoryId: p.categoryId,
      priceSatang: p.basePriceSatang,
      sku: inv?.sku ?? null,
      barcode: p.barcode ?? inv?.barcode ?? null,
      imageUrl: images[0] ?? null,
      optionGroupCount: grp.length,
      requiredOptionGroupCount: grp.filter((g) => g.minSelect >= 1).length,
      soldOut: soldOutReason !== null,
      soldOutReason,
      stockLeft,
      trackStock: ts.trackStock,
      trackStockMode: ts.mode,
    };
  });
}

const REG_CATALOG_KEYS: ReadonlySet<string> = new Set(["q", "categoryId", "cursor", "limit"]);

/**
 * กริด/หมวด/ค้นหาของหน้าขาย (สาขาเดียว) — แบ่งหน้าเสมอ: ปริยาย 100 · เกิน 500 ตัดเหลือ 500 · ลำดับ ชื่อ+id คงที่ (keyset)
 * ปฏิเสธ: NOT_FOUND / PERMISSION_DENIED (ขอบเขต) · VALIDATION (limit ไม่ใช่จำนวนเต็ม ≥ 1 · cursor ผิดรูป · q/หมวดผิดรูป · คีย์แปลก)
 * cursor ของสาขาอื่น = ตำแหน่ง (ชื่อ+id) ล้วน ⇒ ได้เฉพาะแถวที่สาขานี้มองเห็น (มติ 3.1 ข้อ 9)
 */
export async function registerCatalog(ctx: RegisterCtx, actor: RegisterActor, input: RegisterCatalogInput = {}, client?: RegDb): Promise<RegisterCatalogResult> {
  return regGuard("registerCatalog", async (): Promise<RegisterCatalogResult> => {
    const db: RegDb = client ?? prisma;
    const s = await regScope(db, ctx, actor);
    if (isRegRefusal(s)) return s;
    const o: unknown = input ?? {};
    if (!regIsRecord(o) || !regOnlyKeys(o, REG_CATALOG_KEYS)) return regRefuse("VALIDATION");
    let q = "";
    if (o.q !== undefined && o.q !== null) {
      if (typeof o.q !== "string" || !regCleanText(o.q)) return regRefuse("VALIDATION", "คำค้นมีอักขระที่ระบบรับไม่ได้");
      q = o.q.trim().slice(0, 100);
      if (q && !regCleanText(q)) q = q.slice(0, -1); // ตัดกลางคู่ surrogate
    }
    let categoryId: string | null = null;
    if (o.categoryId !== undefined && o.categoryId !== null) {
      if (!regIsId(o.categoryId)) return regRefuse("VALIDATION", "หมวดไม่ถูกต้อง");
      categoryId = o.categoryId;
    }
    let limit = REGISTER_PAGE_SIZE;
    if (o.limit !== undefined && o.limit !== null) {
      if (typeof o.limit !== "number" || !Number.isInteger(o.limit) || o.limit < 1) return regRefuse("VALIDATION", "จำนวนต่อหน้าต้องเป็นจำนวนเต็มตั้งแต่ 1");
      limit = Math.min(o.limit, REGISTER_PAGE_MAX);
    }
    let cur: RegCursor | null = null;
    if (o.cursor !== undefined && o.cursor !== null) {
      cur = typeof o.cursor === "string" && o.cursor.length <= 2000 ? regDecodeCursor(o.cursor) : null;
      if (!cur) return regRefuse("VALIDATION", "ตำแหน่งหน้าถัดไปไม่ถูกต้อง — โหลดรายการใหม่อีกครั้ง");
    }
    const where = regVisibleWhere(s);
    const pat = q ? regLike(q) : null;
    const ids = await db.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM "PosProduct" p
      WHERE ${where}
        ${categoryId ? Prisma.sql`AND p."categoryId" = ${categoryId}` : Prisma.empty}
        ${pat ? Prisma.sql`AND (p.name ILIKE ${pat} OR p."nameEn" ILIKE ${pat} OR p.barcode ILIKE ${pat}
          OR EXISTS (SELECT 1 FROM "InvItem" s WHERE s.id = p."invItemId" AND s."tenantId" = ${s.tenantId} AND (s.sku ILIKE ${pat} OR s.barcode ILIKE ${pat})))` : Prisma.empty}
        ${cur ? Prisma.sql`AND (p.name > ${cur.n} OR (p.name = ${cur.n} AND p.id > ${cur.i}))` : Prisma.empty}
      ORDER BY p.name, p.id
      LIMIT ${limit + 1}`;
    const page = await regRowsInOrder(db, s.tenantId, ids.slice(0, limit).map((r) => r.id));
    const nextCursor = ids.length > limit && page.length ? regEncodeCursor(page[page.length - 1]!) : null;
    // หมวด: เฉพาะหมวดที่มีสินค้าขายได้ที่สาขานี้ (นับตามกติกามองเห็นเดียวกัน · ไม่ขึ้นกับคำค้น/หน้า)
    const counts = await db.$queryRaw<{ id: string; n: number }[]>`
      SELECT p."categoryId" AS id, count(*)::int AS n FROM "PosProduct" p
      WHERE ${where} AND p."categoryId" IS NOT NULL GROUP BY p."categoryId"`;
    const countById = new Map(counts.map((c) => [c.id, Number(c.n)]));
    const cats = countById.size
      ? await db.posCategory.findMany({
          where: { tenantId: s.tenantId, systemId: s.systemId, id: { in: [...countById.keys()] }, archivedAt: null, isVisible: true, OR: [{ unitId: null }, { unitId: s.unitId }] },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
          select: { id: true, name: true, nameEn: true },
        })
      : [];
    const categories: RegisterCategory[] = cats.map((c) => ({ id: c.id, name: c.name, nameEn: c.nameEn, productCount: countById.get(c.id) ?? 0 }));
    return { ok: true, categories, products: await regViews(db, s, page), nextCursor };
  });
}

/**
 * สแกนบาร์โค้ด (C5) — บาร์โค้ดของแถวเอง หรือของ InvItem ที่ผูก · เฉพาะที่ขายได้ที่สาขานี้ · ลำดับ ชื่อ+id คงที่
 * → one (ตัวเดียว) · choose (ซ้ำหลายตัว ให้แคชเชียร์เลือก — ไม่เดาตัวเก่าสุด) · none · รหัสผิดรูป = none (เครื่องสแกนสะดุดไม่ทำให้หน้าล้ม)
 */
export async function registerScan(ctx: RegisterCtx, actor: RegisterActor, input: { barcode: string }, client?: RegDb): Promise<RegisterScanResult> {
  return regGuard("registerScan", async (): Promise<RegisterScanResult> => {
    const db: RegDb = client ?? prisma;
    const s = await regScope(db, ctx, actor);
    if (isRegRefusal(s)) return s;
    const raw: unknown = regIsRecord(input) ? input.barcode : undefined;
    const code = typeof raw === "string" ? raw.trim() : "";
    if (!code || code.length > 200 || !regCleanText(code)) return { ok: true, match: "none" };
    const where = regVisibleWhere(s);
    const ids = await db.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM "PosProduct" p
      WHERE ${where} AND (p.barcode = ${code}
        OR EXISTS (SELECT 1 FROM "InvItem" b WHERE b.id = p."invItemId" AND b."tenantId" = ${s.tenantId} AND b.barcode = ${code}))
      ORDER BY p.name, p.id
      LIMIT ${REGISTER_PAGE_MAX}`;
    const products = await regViews(db, s, await regRowsInOrder(db, s.tenantId, ids.map((r) => r.id)));
    if (products.length === 0) return { ok: true, match: "none" };
    if (products.length === 1) return { ok: true, match: "one", product: products[0]! };
    return { ok: true, match: "choose", products };
  });
}

// ── ตะกร้าของคำขอ (quote/submit) ──
type RegParsedLine =
  | { kind: "product"; productId: string; qty: number; discount: PriceDiscount | null; openPrice: number | null }
  | { kind: "custom"; name: string; qty: number; unitPriceSatang: number; discount: PriceDiscount | null };
type RegParsedCart = { lines: RegParsedLine[]; billDiscount: PriceDiscount | null; memberId: string | null };

const REG_QUOTE_KEYS: ReadonlySet<string> = new Set(["lines", "billDiscount", "memberId"]);
const REG_SUBMIT_KEYS: ReadonlySet<string> = new Set([...REG_QUOTE_KEYS, "idempotencyKey", "payMethods", "cashReceivedSatang", "expectedGrandTotalSatang"]);
const REG_LINE_KEYS: ReadonlySet<string> = new Set(["productId", "name", "qty", "unitPriceSatang", "openPrice", "discount", "note"]);

/** ส่วนลดถูกรูป: undefined/null = ไม่มี · ผิดรูป = undefined */
function regDiscount(v: unknown): PriceDiscount | null | undefined {
  if (v === undefined || v === null) return null;
  if (!regIsRecord(v) || !regOnlyKeys(v, new Set(["type", "value"]))) return undefined;
  if (v.type === "AMOUNT" && regIsMoney(v.value)) return { type: "AMOUNT", value: v.value };
  if (v.type === "PERCENT" && regIsMoney(v.value)) return { type: "PERCENT", value: v.value };
  return undefined;
}
/** ส่วนลดเป็นสตางค์ (สูตรเดียวกับ priceCart) — PERCENT เกิน 100% = −1 (ไม่มีวันตรงกับค่าที่เก็บ) */
function regDiscountSatang(d: PriceDiscount | null, base: number): number {
  if (!d) return 0;
  if (d.type === "AMOUNT") return d.value;
  return d.value > 10_000 ? -1 : roundHalfUp(base * d.value, 10_000);
}

/** ตรวจโครงตะกร้า (ไม่แตะ DB) — คูปองจาก client = VALIDATION (มติ Q12: ไม่เมิน ไม่เชื่อ) */
function regParseCart(raw: unknown, allowed: ReadonlySet<string>): RegParsedCart | RegisterRefusal {
  if (!regIsRecord(raw)) return regRefuse("VALIDATION");
  if (raw.couponCode !== undefined || raw.couponDiscountSatang !== undefined) {
    return regRefuse("VALIDATION", "หน้าขายนี้ยังไม่รับคูปอง — ยังไม่ได้บันทึกอะไร");
  }
  if (!regOnlyKeys(raw, allowed)) return regRefuse("VALIDATION");
  if (!Array.isArray(raw.lines)) return regRefuse("VALIDATION", "ข้อมูลรายการในตะกร้าไม่ถูกต้อง");
  if (raw.lines.length > REGISTER_MAX_LINES) return regRefuse("TOO_MANY_LINES");
  const billDiscount = regDiscount(raw.billDiscount);
  if (billDiscount === undefined) return regRefuse("VALIDATION", "ส่วนลดท้ายบิลไม่ถูกต้อง");
  let memberId: string | null = null;
  if (raw.memberId !== undefined && raw.memberId !== null) {
    if (!regIsId(raw.memberId)) return regRefuse("VALIDATION", "รหัสสมาชิกไม่ถูกต้อง");
    memberId = raw.memberId;
  }
  const lines: RegParsedLine[] = [];
  for (let i = 0; i < raw.lines.length; i++) {
    const l: unknown = raw.lines[i];
    if (!regIsRecord(l) || !regOnlyKeys(l, REG_LINE_KEYS)) return regRefuse("VALIDATION", undefined, i);
    if (typeof l.qty !== "number" || !Number.isInteger(l.qty) || l.qty < 1 || l.qty > REGISTER_MAX_QTY) {
      return regRefuse("INVALID_LINE", `จำนวนต้องเป็นจำนวนเต็ม 1–${REGISTER_MAX_QTY}`, i);
    }
    const discount = regDiscount(l.discount);
    if (discount === undefined) return regRefuse("INVALID_LINE", "ส่วนลดของรายการไม่ถูกต้อง", i);
    if (l.note !== undefined && l.note !== null && (typeof l.note !== "string" || l.note.length > 500 || !regCleanText(l.note))) {
      return regRefuse("VALIDATION", undefined, i);
    }
    if (l.openPrice !== undefined && typeof l.openPrice !== "boolean") return regRefuse("VALIDATION", undefined, i);
    if (l.productId !== undefined && l.productId !== null) {
      if (!regIsId(l.productId)) return regRefuse("VALIDATION", undefined, i);
      let openPrice: number | null = null;
      if (l.openPrice === true) {
        if (!regIsMoney(l.unitPriceSatang)) return regRefuse("INVALID_LINE", "ราคาที่กรอกต้องเป็นจำนวนเต็มสตางค์ที่ไม่ติดลบ", i);
        openPrice = l.unitPriceSatang;
      }
      // ราคาที่ client ส่งมากับสินค้าแคตตาล็อก (ไม่ใช่ราคาเปิด) = ไม่ใช้เลย — ราคามาจาก DB เสมอ (มติ R2)
      lines.push({ kind: "product", productId: l.productId, qty: l.qty, discount, openPrice });
    } else {
      if (l.openPrice === true) return regRefuse("VALIDATION", undefined, i);
      const name = typeof l.name === "string" ? l.name.trim() : "";
      if (!name || name.length > 200 || !regCleanText(name)) return regRefuse("VALIDATION", "รายการกำหนดเองต้องมีชื่อ", i);
      if (!regIsMoney(l.unitPriceSatang)) return regRefuse("INVALID_LINE", "ราคาต้องเป็นจำนวนเต็มสตางค์ที่ไม่ติดลบ", i);
      lines.push({ kind: "custom", name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, discount });
    }
  }
  return { lines, billDiscount, memberId };
}

/** เพดานส่วนลดของผู้ขาย (basis point) — OWNER ไม่จำกัด · MANAGER ไม่จำกัดเว้นตั้ง `pos._maxDiscountBp` · STAFF ปริยาย 10% */
function regMaxDiscountBp(a: RegisterActor): number | null {
  if (a.role === "OWNER") return null;
  const v = permissionValue(a, "pos._maxDiscountBp");
  const set = v !== undefined && Number.isInteger(v) && v >= 0 ? v : null;
  if (a.role === "MANAGER") return set;
  return set ?? REGISTER_STAFF_MAX_DISCOUNT_BP;
}

/**
 * สิทธิ์ผู้ขายที่หน้าเพจส่งให้จอ (ปุ่มรายการกำหนดเอง/ราคาเปิด · เพดานส่วนลดของการคิดยอดทันใจ) — กติกาเดียวกับที่ quote/submit
 * บังคับจริง (ตัวตัดสินจริงอยู่ฝั่งเซิร์ฟเวอร์เสมอ · ค่านี้ใช้แสดงผล) · บริสุทธิ์ ไม่แตะ DB
 */
export function registerSellerLimits(actor: RegisterActor, unitId: string): { canSell: boolean; canOverridePrice: boolean; maxDiscountBp: number | null } {
  const a = regActorOf(actor);
  if (!a || !regIsId(unitId)) return { canSell: false, canOverridePrice: false, maxDiscountBp: 0 };
  return {
    canSell: evaluate(a, { module: "pos", action: "pos.sale.create", unitId }),
    canOverridePrice: evaluate(a, { module: "pos", action: "pos.sale.priceOverride", unitId }),
    maxDiscountBp: regMaxDiscountBp(a),
  };
}

/**
 * VAT ที่หน้าขายใช้คิดยอดบนจอ (มติ Q25 · R7: VAT ที่ "เก็บลงบิล" = P1.6) — ตามสมุดบัญชีที่ผูก POS นี้ (ทางเดียวกับที่บัญชีลงยอด POS):
 * ไม่ผูกบัญชี / ไม่จด VAT = NONE 0 · จด VAT = INCLUDED ตามอัตราของสมุด (ไม่มีแถวตั้งค่า = จด 7% แบบ account.vatConfigOf)
 * หนี้ (แบบ N5 ของ catalog.ts): อ่าน AccountSettings ตรงเพราะ facade บัญชียังไม่ส่งออก vatConfigOf
 */
async function regVat(db: RegDb, tenantId: string, systemId: string): Promise<{ mode: "INCLUDED" | "NONE"; rateBp: number }> {
  const acct = await account.posAccountSystemId(tenantId, systemId);
  if (!acct) return { mode: "NONE", rateBp: 0 };
  const st = await db.accountSettings.findFirst({ where: { systemId: acct, tenantId }, select: { vatRegistered: true, vatRateBp: true } });
  const registered = st?.vatRegistered ?? true;
  const rate = st?.vatRateBp ?? 700;
  return registered && Number.isInteger(rate) && rate > 0 && rate <= 10_000 ? { mode: "INCLUDED", rateBp: rate } : { mode: "NONE", rateBp: 0 };
}

/**
 * สมาชิกคนนี้จะได้ส่วนลดอัตโนมัติจาก createSale ไหม — ใช้ตัวตัดสินเดียวกับ createSale: ระบบสมาชิกของสาขา (systemForUnit MEMBER)
 * → `member.automaticDiscountForSale` (ขั้นส่วนลดระดับของ computeQuote ที่ applyOnSale ใช้ · อ่านอย่างเดียว ไม่เรียก computeEarn
 * จึงไม่สร้างแถวตั้งค่าใด ๆ) · สาขาไม่มีระบบสมาชิก / ลูกค้าไม่อยู่ในระบบนั้น = createSale ไม่ใช้สิทธิ์ (แนบชื่อเฉย ๆ) = false
 */
async function regMemberAutoDiscount(
  s: RegScope,
  memberId: string,
  lines: { name: string; qty: number; unitPriceSatang: number; discountSatang: number; itemId: string | null; serviceId: string | null }[],
): Promise<boolean> {
  const memberSystemId = await systemForUnit(s.tenantId, s.unitId, "MEMBER");
  if (!memberSystemId) return false;
  // dynamic import แบบเดียวกับ service.ts (member/index → wallet → giftcard → pos/index = วงกลมของโมดูล)
  const member = await import("@/lib/modules/member");
  try {
    const d = await member.automaticDiscountForSale({ tenantId: s.tenantId, systemId: memberSystemId, actorUserId: null }, memberId, { unitId: s.unitId, lines });
    return d > 0;
  } catch (e) {
    if (e instanceof member.MemberNotFoundError) return false;
    throw e;
  }
}

/** บรรทัดที่คิดแล้ว พร้อมส่งเข้า createSale */
type RegResolvedLine = {
  name: string;
  qty: number;
  unitPriceSatang: number;
  discountSatang: number;
  productId: string | null;
  itemId: string | null;
  serviceId: string | null;
};

/**
 * คิดราคาฝั่งเซิร์ฟเวอร์ (ใช้ร่วม quote + submit): สิทธิ์ราคาเอง → สมาชิก → สินค้า (ขายได้ที่สาขานี้ · เปิดขาย · ไม่มีตัวเลือกบังคับ ·
 * มีราคา) → priceCart ด้วยราคาจาก DB · เพดานส่วนลดของผู้ขาย · VAT ของสมุดที่ผูก
 */
async function regPrice(db: RegDb, s: RegScope, cart: RegParsedCart): Promise<{ quote: RegisterQuoteTotals; resolved: RegResolvedLine[] } | RegisterRefusal> {
  // Q8: รายการกำหนดเอง / ราคาเปิด ต้องมี pos.sale.priceOverride (OWNER/MANAGER ได้ตามบทบาท · STAFF ต้องได้รับ)
  const needOverride = cart.lines.findIndex((l) => l.kind === "custom" || l.openPrice !== null);
  if (needOverride >= 0 && !evaluate(s.actor, { module: "pos", action: "pos.sale.priceOverride", unitId: s.unitId })) {
    return regRefuse("PERMISSION_DENIED", "ต้องมีสิทธิ์ตั้งราคาเอง — ให้ผู้จัดการทำรายการนี้", needOverride);
  }
  if (cart.memberId) {
    const c = await db.customer.findFirst({ where: { id: cart.memberId, tenantId: s.tenantId }, select: { id: true } });
    if (!c) return regRefuse("MEMBER_NOT_FOUND");
  }
  const wantIds = [...new Set(cart.lines.flatMap((l) => (l.kind === "product" ? [l.productId] : [])))];
  const visibleIds = wantIds.length
    ? (await db.$queryRaw<{ id: string }[]>`SELECT p.id FROM "PosProduct" p WHERE ${regVisibleWhere(s)} AND p.id = ANY(${wantIds}::text[])`).map((r) => r.id)
    : [];
  const rows = await regRowsInOrder(db, s.tenantId, visibleIds);
  const views = new Map((await regViews(db, s, rows)).map((v) => [v.id, v]));
  const priceLines: { qty: number; unitPriceSatang: number; discount: PriceDiscount | null }[] = [];
  const meta: Omit<RegResolvedLine, "discountSatang" | "unitPriceSatang">[] = [];
  for (let i = 0; i < cart.lines.length; i++) {
    const l = cart.lines[i]!;
    if (l.kind === "custom") {
      priceLines.push({ qty: l.qty, unitPriceSatang: l.unitPriceSatang, discount: l.discount });
      meta.push({ name: l.name, qty: l.qty, productId: null, itemId: null, serviceId: null });
      continue;
    }
    const v = views.get(l.productId);
    // มติ 3.1 ข้อ 3: สาขาอื่น / คลังอื่น / ร้านอื่น / เก็บถาวร / ไม่มีจริง = PRODUCT_NOT_FOUND (ไม่คิดราคา · ไม่บอกชื่อ)
    if (!v) return regRefuse("PRODUCT_NOT_FOUND", undefined, i);
    if (v.soldOutReason === "UNAVAILABLE") return regRefuse("PRODUCT_UNAVAILABLE", undefined, i);
    if (v.requiredOptionGroupCount > 0) return regRefuse("OPTIONS_REQUIRED", undefined, i);
    const unit = l.openPrice ?? v.priceSatang;
    if (unit === null) return regRefuse("PRICE_NOT_SET", undefined, i);
    priceLines.push({ qty: l.qty, unitPriceSatang: unit, discount: l.discount });
    // ตัดสต็อกเฉพาะสินค้าที่นับสต็อกจริง (C2 · trackStock off/AUTO ที่ยังไม่เคยมีสต็อก = ไม่ตัด) · บริการผูก serviceId (มติ R5)
    const itemId = v.kind === "PRODUCT" && v.invItemId && v.trackStock ? v.invItemId : null;
    const serviceId = v.kind === "SERVICE" && v.invItemId ? v.invItemId : null;
    meta.push({ name: v.name, qty: l.qty, productId: v.id, itemId, serviceId });
  }
  const vat = await regVat(db, s.tenantId, s.systemId);
  const r = priceCart({ lines: priceLines, billDiscount: cart.billDiscount, vat, maxDiscountBp: regMaxDiscountBp(s.actor) });
  if (!r.ok) return regRefuse(r.code, r.code === "DISCOUNT_EXCEEDS_LIMIT" || r.code === "TOO_MANY_LINES" ? undefined : r.message, r.lineIndex);
  // B1.1 (มติ 3.2 ข้อ 3 · D6 ใหม่): สมาชิกที่ createSale จะหักส่วนลดอัตโนมัติให้ = ปฏิเสธตั้งแต่ quote ก่อนเขียนอะไร (P1.12 รองรับ)
  if (cart.memberId) {
    const wallet = r.lines.map((x, i) => ({ name: meta[i]!.name, qty: x.qty, unitPriceSatang: x.unitPriceSatang, discountSatang: x.discountSatang, itemId: meta[i]!.itemId, serviceId: meta[i]!.serviceId }));
    if (await regMemberAutoDiscount(s, cart.memberId, wallet)) return regRefuse("MEMBER_RIGHTS_UNSUPPORTED");
  }
  const lines: RegisterQuoteLine[] = r.lines.map((x, i) => ({
    productId: meta[i]!.productId,
    unitPriceSatang: x.unitPriceSatang,
    grossSatang: x.grossSatang,
    discountSatang: x.discountSatang,
    lineTotalSatang: x.lineTotalSatang,
  }));
  const quote: RegisterQuoteTotals = {
    subtotalSatang: r.subtotalSatang,
    lineDiscountSatang: r.lineDiscountSatang,
    billDiscountSatang: r.billDiscountSatang,
    couponDiscountSatang: r.couponDiscountSatang,
    netSatang: r.netSatang,
    vatSatang: r.vatSatang,
    grandTotalSatang: r.grandTotalSatang,
    lines,
    vatMode: vat.mode,
    vatRateBp: vat.rateBp,
  };
  const resolved = r.lines.map((x, i) => ({ ...meta[i]!, unitPriceSatang: x.unitPriceSatang, discountSatang: x.discountSatang }));
  return { quote, resolved };
}

/** ยอดบนจอจากราคาฝั่งเซิร์ฟเวอร์ (ไม่บันทึกอะไร) — ปฏิเสธไม่มียอดติดมา */
export async function quoteRegisterCart(ctx: RegisterCtx, actor: RegisterActor, input: RegisterQuoteInput, client?: RegDb): Promise<RegisterQuoteResult> {
  return regGuard("quoteRegisterCart", async (): Promise<RegisterQuoteResult> => {
    const db: RegDb = client ?? prisma;
    const s = await regScope(db, ctx, actor);
    if (isRegRefusal(s)) return s;
    const cart = regParseCart(input, REG_QUOTE_KEYS);
    if (isRegRefusal(cart)) return cart;
    const p = await regPrice(db, s, cart);
    if (isRegRefusal(p)) return p;
    return { ok: true, ...p.quote };
  });
}

// ── ส่งบิล ──
type RegParsedSubmit = {
  cart: RegParsedCart;
  /** คีย์ที่เก็บจริง = REG_KEY_PREFIX + คีย์ของ client (R4 K1) */
  idempotencyKey: string;
  payMethods: { type: RegisterPayType; amountSatang: number }[];
  cashReceivedSatang: number | null;
  expected: number;
};

/** โครงของ submit (ไม่แตะ DB) — วิธีจ่าย CASH/PROMPTPAY เท่านั้น (Addendum 2) · expected ต้องเป็นจำนวนเต็ม ≥ 0 */
function regParseSubmit(raw: unknown): RegParsedSubmit | RegisterRefusal {
  if (!regIsRecord(raw)) return regRefuse("VALIDATION");
  const cart = regParseCart(raw, REG_SUBMIT_KEYS);
  if (isRegRefusal(cart)) return cart;
  if (cart.lines.length === 0) return regRefuse("VALIDATION", "ยังไม่มีสินค้าในตะกร้า");
  if (!regIsIdemKey(raw.idempotencyKey)) return regRefuse("VALIDATION", "ข้อมูลบิลไม่ครบ — ลองใหม่อีกครั้ง");
  if (!regIsMoney(raw.expectedGrandTotalSatang)) return regRefuse("VALIDATION", "ยอดที่ต้องชำระไม่ถูกต้อง — ตรวจยอดใหม่อีกครั้ง");
  const pmRaw: unknown = raw.payMethods;
  // B1.1 (มติ 3.2 ข้อ 5): รายการว่างได้ (บิลยอด 0) — ว่างกับยอด ≠ 0 = PAYMENT_MISMATCH ที่ขั้น ④
  if (!Array.isArray(pmRaw) || pmRaw.length > REGISTER_PAY_TYPES.length) return regRefuse("VALIDATION", "วิธีชำระเงินไม่ถูกต้อง");
  const payMethods: RegParsedSubmit["payMethods"] = [];
  for (const p of pmRaw as unknown[]) {
    if (!regIsRecord(p) || !regOnlyKeys(p, new Set(["type", "amountSatang"]))) return regRefuse("VALIDATION", "วิธีชำระเงินไม่ถูกต้อง");
    if (!(REGISTER_PAY_TYPES as readonly unknown[]).includes(p.type)) return regRefuse("VALIDATION", "หน้าขายนี้รับเงินสดและพร้อมเพย์เท่านั้น");
    // B1.1: แต่ละรายการต้อง ≥ 1 สตางค์ (รายการยอด 0 = VALIDATION — บิลยอด 0 ส่งรายการว่าง)
    if (!regIsMoney(p.amountSatang) || p.amountSatang < 1) return regRefuse("VALIDATION", "จำนวนเงินของแต่ละวิธีต้องเป็นจำนวนเต็มสตางค์ตั้งแต่ 1");
    if (payMethods.some((x) => x.type === p.type)) return regRefuse("VALIDATION", "วิธีชำระเงินซ้ำกัน");
    payMethods.push({ type: p.type as RegisterPayType, amountSatang: p.amountSatang });
  }
  let cashReceivedSatang: number | null = null;
  if (raw.cashReceivedSatang !== undefined && raw.cashReceivedSatang !== null) {
    if (!regIsMoney(raw.cashReceivedSatang)) return regRefuse("VALIDATION", "จำนวนเงินที่รับต้องเป็นจำนวนเต็มสตางค์ที่ไม่ติดลบ");
    cashReceivedSatang = raw.cashReceivedSatang;
  }
  const cash = payMethods.find((p) => p.type === "CASH")?.amountSatang ?? 0;
  if (cash === 0 && cashReceivedSatang !== null && cashReceivedSatang !== 0) return regRefuse("VALIDATION", "ไม่มีส่วนเงินสด — ไม่ต้องกรอกเงินที่รับ");
  return { cart, idempotencyKey: REG_KEY_PREFIX + raw.idempotencyKey, payMethods, cashReceivedSatang, expected: raw.expectedGrandTotalSatang };
}

type RegSaleRow = Prisma.PosSaleGetPayload<{ include: { lines: true; payments: true } }>;
async function regLoadSale(db: RegDb, tenantId: string, idempotencyKey: string): Promise<RegSaleRow | null> {
  // B1.1: ลำดับคงที่ (การเทียบเป็น multiset อยู่แล้ว — ลำดับนี้ให้ผลอ่านซ้ำได้เหมือนเดิมทุกครั้ง)
  return db.posSale.findUnique({
    where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
    include: { lines: { orderBy: { id: "asc" } }, payments: { orderBy: { id: "asc" } } },
  });
}

/** กุญแจของบรรทัดแบบมาตรฐาน (ราคาต่อหน่วย · จำนวน · ส่วนลดเป็นสตางค์) */
const regTup = (unitPriceSatang: number, qty: number, discountSatang: number) => `${unitPriceSatang}|${qty}|${discountSatang}`;
/** multiset → สตริงเดียว (เรียงแล้ว) */
const regBag = (xs: string[]) => xs.slice().sort().join("\n");

/**
 * B1.1 (มติ 3.2 ข้อ 1) — บรรทัดของคำขอ = บรรทัดของบิลที่บันทึกไหม แบบไม่ขึ้นกับลำดับและตรงตัว (ไม่ใช่จับคู่แบบตะกละ):
 *   • รายการกำหนดเอง: multiset ของ (ชื่อ · ราคา · จำนวน · ส่วนลดสตางค์) ต้องเท่ากันทุกตัว
 *   • สินค้า: แยกตาม productId — บรรทัดราคาเปิด (ราคารู้จากคำขอ) + บรรทัดปกติ (ราคา = ราคาแคตตาล็อกตอนขาย ไม่ได้เก็บแยก
 *     แต่ทุกบรรทัดปกติของสินค้าเดียวในบิลเดียวใช้ราคาเดียวกันเสมอ เพราะ regPrice อ่านราคาครั้งเดียว) ⇒ ต้องมีราคา c หนึ่งค่า
 *     จากราคาที่บันทึกของสินค้านั้น ที่ทำให้ multiset (ราคาเปิด ∪ ปกติ@c) เท่ากับ multiset ที่บันทึกพอดี
 *   ส่วนลดของคำขอคิดด้วยสูตรเดียวกับ priceCart บนฐานราคาที่ใช้เทียบ · ราคาแคตตาล็อกที่เปลี่ยนหลังขายไม่ทำให้ "ต่าง"
 */
function regLinesEqual(req: RegParsedLine[], stored: RegSaleRow["lines"]): boolean {
  if (stored.length !== req.length) return false;
  const sCustom = stored.filter((x) => x.productId === null).map((x) => `${x.name}|${regTup(x.unitPriceSatang, x.qty, x.discountSatang)}`);
  const rCustom = req.flatMap((l) => (l.kind === "custom" ? [`${l.name}|${regTup(l.unitPriceSatang, l.qty, regDiscountSatang(l.discount, l.unitPriceSatang * l.qty))}`] : []));
  if (regBag(sCustom) !== regBag(rCustom)) return false;
  const pids = new Set<string>([
    ...stored.flatMap((x) => (x.productId ? [x.productId] : [])),
    ...req.flatMap((l) => (l.kind === "product" ? [l.productId] : [])),
  ]);
  for (const pid of pids) {
    const sLines = stored.filter((x) => x.productId === pid);
    const target = regBag(sLines.map((x) => regTup(x.unitPriceSatang, x.qty, x.discountSatang)));
    const mine = req.filter((l): l is Extract<RegParsedLine, { kind: "product" }> => l.kind === "product" && l.productId === pid);
    const open = mine.filter((l) => l.openPrice !== null).map((l) => regTup(l.openPrice!, l.qty, regDiscountSatang(l.discount, l.openPrice! * l.qty)));
    const plain = mine.filter((l) => l.openPrice === null);
    if (sLines.length !== mine.length) return false;
    if (plain.length === 0) {
      if (regBag(open) !== target) return false;
      continue;
    }
    const candidates = [...new Set(sLines.map((x) => x.unitPriceSatang))];
    const fits = candidates.some((c) => regBag([...open, ...plain.map((l) => regTup(c, l.qty, regDiscountSatang(l.discount, c * l.qty)))]) === target);
    if (!fits) return false;
  }
  return true;
}

/**
 * บิลที่มีคีย์นี้อยู่แล้ว = คำขอเดียวกันไหม (ไม่มีคอลัมน์เก็บลายนิ้วมือคำขอ ⇒ เทียบคำขอกับบิลที่บันทึกจริง ด้วยราคาที่บันทึกไว้):
 * สาขา/ระบบ/ที่มา POS · สมาชิก · ยอดที่คาด = ยอดบิล · วิธีจ่าย+จำนวน (multiset) · ส่วนลดท้ายบิล · บรรทัด (regLinesEqual)
 * (cashReceivedSatang ไม่ได้บันทึก ⇒ ไม่อยู่ในการเทียบ · เงินทอนของคำตอบซ้ำคิดจากคำขอ — D12)
 */
function regSameSubmission(s: RegScope, req: RegParsedSubmit, sale: RegSaleRow): boolean {
  if (sale.unitId !== s.unitId || sale.systemId !== s.systemId || sale.sourceModule !== "POS") return false;
  if ((sale.memberId ?? null) !== req.cart.memberId) return false;
  if (sale.grandTotalSatang !== req.expected) return false;
  const payKey = (xs: { type: string; amountSatang: number }[]) => regBag(xs.map((p) => `${p.type}:${p.amountSatang}`));
  if (payKey(sale.payments) !== payKey(req.payMethods)) return false;
  if (sale.discountSatang !== regDiscountSatang(req.cart.billDiscount, sale.subtotalSatang)) return false;
  return regLinesEqual(req.cart.lines, sale.lines);
}

const regChange = (req: RegParsedSubmit): number => {
  const cash = req.payMethods.find((p) => p.type === "CASH")?.amountSatang ?? 0;
  return cash > 0 && req.cashReceivedSatang !== null ? req.cashReceivedSatang - cash : 0;
};
/**
 * คีย์นี้มีบิลแล้ว: payload เดิม + บิลยัง PAID = บิลเดิม (ok) · อย่างอื่นทั้งหมด (payload ต่าง หรือบิลถูก VOIDED/คืนแล้ว) =
 * IDEMPOTENCY_CONFLICT ที่พก saleId · receiptNo · saleStatus ของบิลนั้น (มติ 3.2 ข้อ 1–2 — ห้ามตอบ ok ให้บิลที่ยกเลิกแล้ว)
 * — R4 K2: พกรายละเอียดเฉพาะบิล POS ของระบบ+สาขาเดียวกัน · อื่น ๆ = CONFLICT เปล่า
 */
function regDuplicate(s: RegScope, req: RegParsedSubmit, sale: RegSaleRow, duplicated: boolean): RegisterSubmitResult {
  if (sale.status !== "PAID" || !regSameSubmission(s, req, sale)) {
    // R4 K2: รายละเอียดบิล (saleId · receiptNo · สถานะ) เฉพาะบิล POS ของระบบ+สาขาเดียวกับคำขอ (ผู้ขายผ่าน regScope ของสาขานี้แล้ว = มองเห็นได้)
    //   อย่างอื่น (สาขาอื่น · โมดูลอื่นที่ถือคีย์ reg2:… ผ่านหน้าขายเดิม) = CONFLICT เปล่า ไม่มีฟิลด์บิลเลย
    if (sale.sourceModule !== "POS" || sale.unitId !== s.unitId || sale.systemId !== s.systemId) return regRefuse("IDEMPOTENCY_CONFLICT");
    return { ok: false, code: "IDEMPOTENCY_CONFLICT", message: REG_MESSAGE.IDEMPOTENCY_CONFLICT, saleId: sale.id, receiptNo: sale.receiptNo, saleStatus: sale.status };
  }
  return { ok: true, saleId: sale.id, receiptNo: sale.receiptNo, grandTotalSatang: sale.grandTotalSatang, changeSatang: regChange(req), duplicated };
}

/**
 * ส่งบิล (สเปก §3.4 · Addendum 2) — ลำดับ:
 *   ขอบเขต/สิทธิ์ขาย → โครงคำขอ (VALIDATION · TOO_MANY_LINES · INVALID_LINE) → ⑤ เงินสดที่รับ (R4 K4 · ก่อนค้นคีย์) → ① คีย์เดิม (reg2:+คีย์ · R4 K1): payload เดิม = บิลเดิม (duplicated:true
 *   แม้ราคาเปลี่ยนแล้ว) · payload ต่าง = IDEMPOTENCY_CONFLICT → ② คิดราคาใหม่จาก DB (ปฏิเสธของ quote ทั้งหมด) → ③ expected ≠ ยอด =
 *   PRICE_CHANGED (พกยอดสด) → ④ Σ วิธีจ่าย ≠ ยอด = PAYMENT_MISMATCH → ⑤ เงินสดที่รับขาด/ไม่ส่ง = PAYMENT_MISMATCH → ⑥ createSale เดิม
 * 🔴 กันบิลซ้ำจากคำขอพร้อมกัน: unique (tenantId, idempotencyKey) ของ PosSale ในธุรกรรมของ createSale — คำขอที่แพ้ได้ P2002
 *    (insert ชนแถวของผู้ชนะ · ธุรกรรมของผู้แพ้ rollback ทั้งก้อน รวมตัวนับใบเสร็จ) แล้วที่นี่อ่านบิลของผู้ชนะมาเทียบ payload
 */
export async function submitRegisterSale(ctx: RegisterCtx, actor: RegisterActor, input: RegisterSubmitInput, client?: RegDb): Promise<RegisterSubmitResult> {
  return regGuard("submitRegisterSale", async (): Promise<RegisterSubmitResult> => {
    const startedAt = Date.now();
    const db: RegDb = client ?? prisma;
    const s = await regScope(db, ctx, actor);
    if (isRegRefusal(s)) return s;
    const req = regParseSubmit(input);
    if (isRegRefusal(req)) return req;
    // R4 K4 (มติ R4.1 ข้อ 3): ⑤ เงินสดที่รับ ตรวจ "ก่อน" ค้นคีย์ — คำขอแรกและคำขอซ้ำผ่านด่านเดียวกัน (ไม่มีทอนติดลบจากการส่งซ้ำ)
    //   ส่วนเงินสดมาจากคำขอเอง (ไม่ต้องคิดราคา) · ติดลบ/ไม่ใช่จำนวนเต็ม = VALIDATION ที่ regParseSubmit แล้ว
    const cash = req.payMethods.find((x) => x.type === "CASH")?.amountSatang ?? 0;
    if (cash > 0 && (req.cashReceivedSatang === null || req.cashReceivedSatang < cash)) {
      return regRefuse("PAYMENT_MISMATCH", "เงินที่รับน้อยกว่าส่วนที่จ่ายเงินสด");
    }
    // ① คีย์เดิมก่อนคิดราคา (ลองซ้ำหลังราคาเปลี่ยนต้องได้บิลเดิม)
    const prior = await regLoadSale(db, s.tenantId, req.idempotencyKey);
    if (prior) return regDuplicate(s, req, prior, true);
    // ②
    const p = await regPrice(db, s, req.cart);
    if (isRegRefusal(p)) return p;
    const q = p.quote;
    // ③
    if (req.expected !== q.grandTotalSatang) return { ok: false, code: "PRICE_CHANGED", message: REG_MESSAGE.PRICE_CHANGED, ...q };
    // ④ (⑤ ย้ายไปก่อน ① — R4 K4)
    if (req.payMethods.reduce((t, x) => t + x.amountSatang, 0) !== q.grandTotalSatang) return regRefuse("PAYMENT_MISMATCH");
    // ⑥
    const saleInput: CreateSaleInput = {
      tenantId: s.tenantId,
      unitId: s.unitId,
      systemId: s.systemId,
      ...(req.cart.memberId ? { memberId: req.cart.memberId } : {}),
      sourceModule: "POS",
      idempotencyKey: req.idempotencyKey,
      lines: p.resolved.map((l) => ({
        name: l.name,
        qty: l.qty,
        unitPriceSatang: l.unitPriceSatang,
        discountSatang: l.discountSatang,
        ...(l.itemId ? { itemId: l.itemId } : {}),
        ...(l.serviceId ? { serviceId: l.serviceId } : {}),
        ...(l.productId ? { productId: l.productId } : {}),
      })),
      billDiscountSatang: q.billDiscountSatang,
      payMethods: req.payMethods.map((x) => ({ type: x.type, amountSatang: x.amountSatang })),
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await createSale(saleInput, db);
        // createSale คืนบิลเดิมเงียบ ๆ เมื่อคีย์ถูกบันทึกระหว่างที่เราตรวจ ⇒ อ่านบิลจริงมาเทียบ payload ทุกครั้ง
        const row = await regLoadSale(db, s.tenantId, req.idempotencyKey);
        if (!row || row.id !== r.saleId) return regRefuse("INTERNAL");
        return regDuplicate(s, req, row, row.createdAt.getTime() < startedAt);
      } catch (e) {
        const code = (e as { code?: unknown } | null)?.code;
        if (code === "P2002") {
          // แพ้การแข่ง: บิลของผู้ชนะ commit แล้ว → เทียบ payload · ยังไม่เห็นบิล (ชนตัวนับใบเสร็จ) → ลองใหม่
          const row = await regLoadSale(db, s.tenantId, req.idempotencyKey);
          if (row) return regDuplicate(s, req, row, true);
          continue;
        }
        if (code === "P2034" || code === "P2028") continue; // ธุรกรรมชน/หมดเวลา = rollback แล้ว ลองซ้ำได้ (คีย์กันซ้ำ)
        // createSale ตรวจยอดอีกชั้น (เช่น ส่วนลดอัตโนมัติของระดับสมาชิกที่ P1.3 ยังไม่คิด · P1.12) — ไม่มีบิลเกิด
        if (e instanceof Error && e.message.startsWith("PAYMENT_MISMATCH")) return regRefuse("PAYMENT_MISMATCH");
        throw e;
      }
    }
    return regRefuse("BUSY");
  });
}

/** แถบสถานะ (สเปก §4.5) — กะ = P1.9 (null) · ออฟไลน์ = P3 (0) · รอตัดสต็อก = บิลวันนี้ (เวลาไทย) ที่บรรทัดผูกสต็อกยังไม่ถูกตัดครบ */
export async function registerStatus(ctx: RegisterCtx, actor: RegisterActor, client?: RegDb): Promise<RegisterStatusResult> {
  return regGuard("registerStatus", async (): Promise<RegisterStatusResult> => {
    const db: RegDb = client ?? prisma;
    const s = await regScope(db, ctx, actor);
    if (isRegRefusal(s)) return s;
    const user = await db.user.findUnique({ where: { id: s.actor.userId }, select: { name: true, email: true } });
    const bkk = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const dayStart = new Date(new Date(`${bkk}T00:00:00Z`).getTime() - 7 * 3600000);
    // คีย์ตัดสต็อกต่อบรรทัดของ createSale = `pos-consume-<saleId>-<lineId>` (service.ts consumeSaleInventory) — ใช้ unique (tenantId, idempotencyKey)
    const pend = await db.$queryRaw<{ n: number }[]>`
      SELECT count(DISTINCT s.id)::int AS n FROM "PosSale" s JOIN "PosSaleLine" l ON l."saleId" = s.id
      WHERE s."tenantId" = ${s.tenantId} AND s."unitId" = ${s.unitId} AND s.status = 'PAID' AND s."createdAt" >= ${dayStart}
        AND l."itemId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "InvMovement" m WHERE m."tenantId" = ${s.tenantId} AND m."idempotencyKey" = 'pos-consume-' || s.id || '-' || l.id)`;
    return {
      ok: true,
      unit: { id: s.unitId, name: s.unitName },
      user: { name: user?.name?.trim() || user?.email || "-", roleLabel: REG_ROLE_LABEL[s.actor.role], role: s.actor.role },
      shift: null,
      pendingStockCount: Number(pend[0]?.n ?? 0),
      pendingSyncCount: 0,
    };
  });
}

/** VAT ของระบบ POS นี้ (มติ Q25) — ค่าเดียวกับ vatMode/vatRateBp ที่ quote ใช้ · หน้าเพจส่งให้ client คิดยอดทันใจก่อน quote แรก */
export async function registerVatConfig(ctx: { tenantId: string; systemId: string; unitId?: string }, client?: RegDb): Promise<RegisterVatConfigResult> {
  return regGuard("registerVatConfig", async (): Promise<RegisterVatConfigResult> => {
    const db: RegDb = client ?? prisma;
    if (!regIsRecord(ctx) || !regIsId(ctx.tenantId) || !regIsId(ctx.systemId)) return regRefuse("NOT_FOUND");
    // B1.1: ระบบ POS ที่ปิดใช้งาน = NOT_FOUND แบบเดียวกับฟังก์ชันอื่นของหน้าขาย (regScope)
    const sys = await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "POS", active: true }, select: { id: true } });
    if (!sys) return regRefuse("NOT_FOUND");
    const v = await regVat(db, ctx.tenantId, ctx.systemId);
    return { ok: true, mode: v.mode, rateBp: v.rateBp };
  });
}
// ◂ POS P1.3
