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
  actorUserId?: string, // POS P1.1b R2 F9: ผู้กระทำจริง → audit ของแคตตาล็อก (ไม่บังคับ)
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
    const ok = await prisma.$transaction((tx) => writeAccountProductSalePrice(tx, tenantId, productId, price, actorUserId));
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
  await inventory.linkAccountProduct({ ...invCtx, actorUserId }, itemId, productId);
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
import { createSale, PosSaleError, type CreateSaleInput } from "./service";
// POS P1.7 ▸ ใบขอรับเงิน (pi_…) ใช้ในธุรกรรมขายของหน้าขาย · งานหลัง commit ชุดเดียวกับ createSale (ตัดสต็อก + ระบายคิว · มติ I) ◂
import { consumeSaleInventory } from "./service";
import { consumeSaleIntents, lockSaleIntents, type SaleIntentRef } from "./payment-intent";
import { isPaymentIntentId } from "./payment-intent-shared";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { posPaymentSettings, type PosPaymentSettings } from "./payment-settings";
// POS P1.9 ▸ กะของเครื่อง (S5/S6/S15) ◂
import { isShiftDeviceId, registerShiftStatus, resolveRegisterShift } from "./shift";
import { posDeviceRevoked, touchPosDevice } from "./device"; // POS P1.10 ▸ การ์ดเครื่องที่ถูกเพิกถอน + heartbeat ◂
import { effectiveTrackStock, menuSoldOutIds, rowAvailable } from "./catalog";
import { priceCart, roundHalfUp, PRICE_MAX_SATANG, type PriceDiscount } from "./pricing-shared";
// POS P1.2 ▸ R10 ป้ายเครื่องชั่ง (ตัวถอดบริสุทธิ์ชุดเดียวกับจอ) ◂
import { parseWeighedBarcode, weighedBarcodeSettings, weighedGramsFromPrice, weighedPriceSatang, type WeighedBarcodeSettings } from "./scan-shared";
import {
  REGISTER_MAX_LINES,
  REGISTER_MAX_OPTIONS_PER_LINE,
  REGISTER_MAX_WEIGHT_GRAMS,
  REGISTER_MAX_PAY_METHODS,
  REGISTER_MAX_QTY,
  REGISTER_NOTE_MAX,
  REGISTER_REFERENCE_MAX,
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
  type RegisterProductOptionsResult,
  type RegisterQuoteInput,
  type RegisterQuoteLine,
  type RegisterQuoteLineInput,
  type RegisterQuoteLineOption,
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
  type RegisterWeighedScan,
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
  OPTIONS_REQUIRED: "สินค้านี้ต้องเลือกตัวเลือกให้ครบก่อน",
  // POS P1.2 ▸ ตัวเลือก · ตัวแปร · สินค้าชั่ง ◂
  OPTIONS_INVALID: "ตัวเลือกไม่ถูกต้อง — เลือกตัวเลือกใหม่อีกครั้ง",
  OPTION_UNAVAILABLE: "ตัวเลือกนี้หมดชั่วคราว — เลือกตัวเลือกอื่น",
  VARIANT_REQUIRED: "เลือกขนาด/แบบของสินค้านี้ก่อน",
  WEIGHT_REQUIRED: "สินค้านี้ขายตามน้ำหนัก — สแกนป้ายชั่งหรือใส่น้ำหนักก่อน",
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
  ALREADY_RECALLED: "บิลที่พักนี้ถูกเรียกคืนไปแล้ว (อาจจากอีกเครื่อง)",
  UNIT_SYSTEM_MISMATCH: "เลือกจุดขายก่อน — สาขานี้ไม่ได้ผูกกับจุดขายนี้",
  SPLIT_INVALID: `แบ่งจ่ายได้ไม่เกิน ${REGISTER_MAX_PAY_METHODS} รายการ`,
  TIP_ACCOUNT_REQUIRED: "เปิดรับทิปไม่ได้ — เลือกบัญชีพักทิปในสมุดบัญชีที่เชื่อมกับจุดขายนี้ก่อน",
  // POS P1.9 ▸ กะ ◂
  SHIFT_REQUIRED: "เปิดกะก่อนเริ่มขาย",
  SHIFT_ALREADY_OPEN: "เครื่องนี้มีกะที่เปิดอยู่แล้ว",
  SHIFT_CLOSED: "กะนี้ปิดแล้ว",
  REASON_REQUIRED: "เงินขาด/เกินเกินเกณฑ์ — ใส่เหตุผลก่อนปิดกะ",
  DRAWER_INSUFFICIENT: "เงินในลิ้นชักไม่พอ",
  // POS P1.10 ▸ ทะเบียนเครื่อง ◂
  DEVICE_REVOKED: "เครื่องนี้ถูกเพิกถอนแล้ว — ใช้ขายไม่ได้ ติดต่อผู้จัดการ",
  DEVICE_LIMIT: "ลงทะเบียนเครื่องครบจำนวนที่แพ็กเกจให้แล้ว",
  DEVICE_NOT_FOUND: "ไม่พบเครื่องนี้ในสาขานี้",
  // POS P1.7 ▸ ใบขอรับเงิน (pi_…) ◂
  INTENT_NOT_FOUND: "ไม่พบรายการรับเงินนี้ที่สาขานี้ — สร้าง QR ใหม่",
  INTENT_NOT_PAID: "ยังไม่ได้รับเงินของรายการนี้ — รอเงินเข้า หรือยืนยันเองเมื่อเห็นเงินเข้า",
  INTENT_CONSUMED: "รายการรับเงินนี้ถูกใช้กับบิลอื่นไปแล้ว",
  INTENT_EXPIRED: "เงินเข้าเกิน 24 ชั่วโมงแล้ว — ใช้กับบิลไม่ได้ ให้ผู้จัดการจัดการเอง",
  AMOUNT_MISMATCH: "ยอดชำระไม่ตรงกับรายการรับเงิน — ตรวจยอดอีกครั้ง",
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
  // P1.2 R2 F1: ชุด (BUNDLE) ขายได้เฉพาะสาขาที่ส่วนประกอบทุกชิ้นอยู่ในคลังของสาขานั้น — สาขาไม่มีคลัง = ขายได้เฉพาะชุดที่ไม่มีส่วนประกอบ
  //   (ไม่ผ่าน = มองไม่เห็น: กริด/ค้นหา/สแกนไม่ขึ้น · quote/submit = PRODUCT_NOT_FOUND)
  const bundleOk = s.unitInv
    ? Prisma.sql`NOT EXISTS (SELECT 1 FROM "RecipeLine" r WHERE r."productId" = p.id AND r."tenantId" = ${s.tenantId}
        AND NOT EXISTS (SELECT 1 FROM "InvItem" ci WHERE ci.id = r."invItemId" AND ci."tenantId" = ${s.tenantId} AND ci."systemId" = ${s.unitInv}))`
    : Prisma.sql`NOT EXISTS (SELECT 1 FROM "RecipeLine" r WHERE r."productId" = p.id AND r."tenantId" = ${s.tenantId})`;
  // P1.2 R6: แม่เก็บถาวร = ตัวแปรขายไม่ได้ (PRODUCT_NOT_FOUND · สแกน none)
  return Prisma.sql`p."tenantId" = ${s.tenantId} AND p."systemId" = ${s.systemId} AND p."archivedAt" IS NULL
    AND (p."unitId" IS NULL OR p."unitId" = ${s.unitId}) AND ${wh}
    AND (p."kind" <> 'BUNDLE' OR ${bundleOk})
    AND (p."parentId" IS NULL OR EXISTS (SELECT 1 FROM "PosProduct" pp WHERE pp.id = p."parentId" AND pp."tenantId" = ${s.tenantId} AND pp."archivedAt" IS NULL))`;
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
  // P1.2 R6: ตัวแปรใช้กลุ่มตัวเลือกของแม่ (P6) และราคาแม่เมื่อไม่ตั้งราคาเอง (P5)
  const parentIds = [...new Set(rows.map((r) => r.parentId).filter((x): x is string => !!x))];
  const ownerIds = [...new Set(rows.map((r) => r.parentId ?? r.id))];
  const [items, links, menuSoldOut, parents, kids] = await Promise.all([
    invIds.length ? db.invItem.findMany({ where: { tenantId: s.tenantId, id: { in: invIds } }, select: { id: true, onHand: true, barcode: true, sku: true } }) : Promise.resolve([]),
    db.posProductOptionGroup.findMany({ where: { tenantId: s.tenantId, productId: { in: ownerIds } }, select: { productId: true, groupId: true } }),
    // P1.1b มติ 3 (merge): แถว MENU ใช้ความพร้อมขายสดจาก MenuItem — กติกาเดียวกับ catalog.listForUnit (S1.27)
    menuSoldOutIds(s.tenantId, rows, db),
    parentIds.length ? db.posProduct.findMany({ where: { tenantId: s.tenantId, id: { in: parentIds } }, select: { id: true, basePriceSatang: true } }) : Promise.resolve([]),
    // P1.2 R6: ตัวแปรที่ขายได้ที่สาขานี้ (กติกามองเห็นเดียวกัน) ต่อแม่
    db.$queryRaw<{ id: string; n: number }[]>`SELECT p."parentId" AS id, count(*)::int AS n FROM "PosProduct" p
      WHERE ${regVisibleWhere(s)} AND p."parentId" = ANY(${ids}::text[]) GROUP BY p."parentId"`,
  ]);
  const parentPrice = new Map(parents.map((p) => [p.id, p.basePriceSatang]));
  const kidCount = new Map(kids.map((k) => [k.id, Number(k.n)]));
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
    const grp = links.filter((l) => l.productId === (p.parentId ?? p.id)).map((l) => groupById.get(l.groupId)).filter((g): g is { id: string; minSelect: number } => !!g);
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
      // P1.2 P5: ตัวแปรที่ไม่ตั้งราคา = ราคาแม่ (สินค้าชั่ง = ราคาต่อกิโลกรัม)
      priceSatang: p.basePriceSatang ?? (p.parentId ? (parentPrice.get(p.parentId) ?? null) : null),
      sku: inv?.sku ?? null,
      barcode: p.barcode ?? inv?.barcode ?? null,
      imageUrl: images[0] ?? null,
      optionGroupCount: grp.length,
      requiredOptionGroupCount: grp.filter((g) => g.minSelect >= 1).length,
      parentId: p.parentId,
      variantCount: kidCount.get(p.id) ?? 0,
      soldByWeight: p.soldByWeight,
      soldOut: soldOutReason !== null,
      soldOutReason,
      stockLeft,
      trackStock: ts.trackStock,
      trackStockMode: ts.mode,
    };
  });
}

// ── POS P1.2 ▸ ตัวช่วยอ่านตัวเลือก/ตัวแปร/ค่าตั้งป้ายชั่ง (อ่านอย่างเดียว · ใช้ร่วม quote/submit/สแกน/ป๊อปโอเวอร์) ◂ ──
type RegOptChoice = { id: string; name: string; nameEn: string | null; priceDelta: number; isDefault: boolean; isOutOfStock: boolean };
type RegOptGroup = { id: string; name: string; nameEn: string | null; minSelect: number; maxSelect: number; choices: RegOptChoice[] };

/**
 * กลุ่มตัวเลือกที่ผูกกับสินค้า (owner = แม่ของตัวแปร หรือตัวเอง) อ่านสดจาก MenuOptionGroup/Choice (brief §3 · ไม่มีสำเนา):
 * ตามลำดับผูก · เฉพาะกลุ่มของร้านนี้ที่ไม่เก็บถาวร · ตัวเลือกที่ไม่เก็บถาวร (86 ยังอยู่ — ผู้เรียกตัดสิน)
 */
async function regOptionCatalog(db: RegDb, tenantId: string, ownerIds: string[]): Promise<Map<string, RegOptGroup[]>> {
  const out = new Map<string, RegOptGroup[]>();
  if (!ownerIds.length) return out;
  const links = await db.posProductOptionGroup.findMany({
    where: { tenantId, productId: { in: ownerIds } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { productId: true, groupId: true },
  });
  const gids = [...new Set(links.map((l) => l.groupId))];
  const groups = gids.length
    ? await db.menuOptionGroup.findMany({
        where: { tenantId, id: { in: gids }, archivedAt: null },
        select: {
          id: true, name: true, nameEn: true, minSelect: true, maxSelect: true,
          choices: { where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { id: true, name: true, nameEn: true, priceDelta: true, isDefault: true, isOutOfStock: true } },
        },
      })
    : [];
  const byId = new Map(groups.map((g) => [g.id, g]));
  for (const l of links) {
    const g = byId.get(l.groupId);
    if (g) out.set(l.productId, [...(out.get(l.productId) ?? []), g]);
  }
  return out;
}

type RegPickedOption = { choiceId: string; groupId: string; groupName: string; name: string; priceDeltaSatang: number };
/**
 * R2 — ตัวเลือกที่ส่งมากับบรรทัด ตรวจตามลำดับ: ไม่ใช่ตัวเลือกที่ใช้งานของกลุ่มที่ผูก = OPTIONS_INVALID → 86 = OPTION_UNAVAILABLE →
 * กลุ่มใดเลือกน้อยกว่า minSelect = OPTIONS_REQUIRED → เกิน maxSelect = OPTIONS_INVALID · ไม่ใส่ isDefault ให้เอง · ราคา/ชื่อจาก DB เท่านั้น
 */
function regResolveOptions(groups: RegOptGroup[], chosen: string[]): { ok: true; picked: RegPickedOption[]; delta: number } | { ok: false; code: "OPTIONS_INVALID" | "OPTION_UNAVAILABLE" | "OPTIONS_REQUIRED" } {
  const byChoice = new Map<string, { g: RegOptGroup; c: RegOptChoice }>();
  for (const g of groups) for (const c of g.choices) byChoice.set(c.id, { g, c });
  const hits = chosen.map((id) => byChoice.get(id));
  if (hits.some((h) => !h)) return { ok: false, code: "OPTIONS_INVALID" };
  const found = hits as { g: RegOptGroup; c: RegOptChoice }[];
  if (found.some((h) => h.c.isOutOfStock)) return { ok: false, code: "OPTION_UNAVAILABLE" };
  const count = new Map<string, number>();
  for (const h of found) count.set(h.g.id, (count.get(h.g.id) ?? 0) + 1);
  if (groups.some((g) => (count.get(g.id) ?? 0) < g.minSelect)) return { ok: false, code: "OPTIONS_REQUIRED" };
  if (groups.some((g) => (count.get(g.id) ?? 0) > g.maxSelect)) return { ok: false, code: "OPTIONS_INVALID" };
  const picked = found.map((h) => ({ choiceId: h.c.id, groupId: h.g.id, groupName: h.g.name, name: h.c.name, priceDeltaSatang: h.c.priceDelta }));
  return { ok: true, picked, delta: picked.reduce((t, x) => t + x.priceDeltaSatang, 0) };
}

/** ตัวแปรของแม่ที่ขายได้ที่สาขานี้ (กติกามองเห็นเดียวกับกริด) เรียงชื่อ+id */
async function regChildViews(db: RegDb, s: RegScope, parentId: string): Promise<RegisterProduct[]> {
  const ids = await db.$queryRaw<{ id: string }[]>`SELECT p.id FROM "PosProduct" p WHERE ${regVisibleWhere(s)} AND p."parentId" = ${parentId} ORDER BY p.name, p.id LIMIT ${REGISTER_PAGE_MAX}`;
  return regViews(db, s, await regRowsInOrder(db, s.tenantId, ids.map((r) => r.id)));
}

/** R10: ค่าตั้งป้ายเครื่องชั่งของระบบ POS นี้ (ตัวอ่านเดียวใน scan-shared · ไม่ตั้ง = ปิด) */
async function regWeighedSettings(db: RegDb, s: { tenantId: string; systemId: string }): Promise<WeighedBarcodeSettings> {
  const sys = await db.appSystem.findFirst({ where: { id: s.systemId, tenantId: s.tenantId }, select: { settings: true } });
  return weighedBarcodeSettings(sys?.settings);
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
    // P1.2 R6: กริด/ค้นหาแสดงเฉพาะแม่ (ตัวแปรเลือกผ่านป๊อปโอเวอร์ · สแกนบาร์โค้ดลูกยังได้ลูก)
    const ids = await db.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM "PosProduct" p
      WHERE ${where} AND p."parentId" IS NULL
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
      WHERE ${where} AND p."parentId" IS NULL AND p."categoryId" IS NOT NULL GROUP BY p."categoryId"`;
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
    if (products.length === 1) {
      // P1.2 R6: บาร์โค้ดของแม่ที่มีตัวแปร = ให้เลือกตัวแปร (เฉพาะลูกที่ขายได้ที่สาขานี้) · บาร์โค้ดของลูก = ลูกตัวเดียว
      const one = products[0]!;
      if (one.variantCount > 0) {
        const kids = await regChildViews(db, s, one.id);
        if (kids.length) return { ok: true, match: "choose", products: kids };
      }
      return { ok: true, match: "one", product: one };
    }
    if (products.length > 1) {
      // P1.2 R2 F6: รายการให้เลือกไม่รวมแม่ที่มีตัวแปร (แม่ขายตรงไม่ได้ = VARIANT_REQUIRED) · เหลือตัวเดียว = one ·
      //   ไม่เหลือเลย (ทุกตัวเป็นแม่) = ให้เลือกจากตัวแปรของแม่เหล่านั้น (แบบเดียวกับสแกนแม่ตัวเดียว)
      const sellable = products.filter((x) => x.variantCount === 0);
      if (sellable.length === 1) return { ok: true, match: "one", product: sellable[0]! };
      if (sellable.length > 1) return { ok: true, match: "choose", products: sellable };
      const kids = (await Promise.all(products.map((x) => regChildViews(db, s, x.id)))).flat().slice(0, REGISTER_PAGE_MAX);
      return kids.length ? { ok: true, match: "choose", products: kids } : { ok: true, match: "none" };
    }
    // P1.2 R11 ②: ไม่มีบาร์โค้ดที่ลงทะเบียน → ป้ายเครื่องชั่ง (เปิดค่าตั้ง + กฎตรง + check digit ถูก) → PLU ของสินค้าชั่งที่ขายได้ที่สาขานี้
    //   ③ อย่างอื่น = none (check digit ผิด = none ไม่เดา)
    const wb = parseWeighedBarcode(code, await regWeighedSettings(db, s));
    if (!wb) return { ok: true, match: "none" };
    const wIds = await db.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM "PosProduct" p
      WHERE ${where} AND p."soldByWeight" = true AND p."scalePlu" = ${wb.itemCode}
      ORDER BY p.name, p.id
      LIMIT 2`;
    if (wIds.length !== 1) return { ok: true, match: "none" };
    const [w] = await regViews(db, s, await regRowsInOrder(db, s.tenantId, [wIds[0]!.id]));
    if (!w) return { ok: true, match: "none" };
    return { ok: true, match: "one", product: w, weighed: regWeighedOf(wb, code, w.priceSatang) };
  });
}

/** R11: น้ำหนัก/ราคาของป้ายชั่ง ด้วยราคาต่อกก.ของสินค้า (ไม่มีราคา = ค่าที่คิดไม่ได้เป็น null) */
function regWeighedOf(wb: NonNullable<ReturnType<typeof parseWeighedBarcode>>, code: string, perKg: number | null): RegisterWeighedScan {
  if (wb.kind === "WEIGHT") return { code, grams: wb.grams, priceSatang: perKg === null ? null : weighedPriceSatang(wb.grams ?? 0, perKg) };
  return { code, grams: perKg !== null && perKg > 0 ? weighedGramsFromPrice(wb.priceSatang ?? 0, perKg) : null, priceSatang: wb.priceSatang };
}

/**
 * POS P1.2 R7 — ตัวเลือก/ตัวแปรของสินค้า 1 ตัว (ป๊อปโอเวอร์ภาพ 01) · ด่านขอบเขตเดียวกับกริด · สินค้าที่ขายไม่ได้ที่สาขานี้/ไม่มีจริง = PRODUCT_NOT_FOUND
 *   groups = กลุ่มที่ผูก (ตัวแปร = ของแม่) ตามลำดับผูก · ตัวเลือกที่เก็บถาวรไม่อยู่ · 86 = unavailable:true · variants = ลูกที่ขายได้ที่สาขานี้ (ลูก = [])
 */
export async function registerProductOptions(ctx: RegisterCtx, actor: RegisterActor, input: { productId: string }, client?: RegDb): Promise<RegisterProductOptionsResult> {
  return regGuard("registerProductOptions", async (): Promise<RegisterProductOptionsResult> => {
    const db: RegDb = client ?? prisma;
    const s = await regScope(db, ctx, actor);
    if (isRegRefusal(s)) return s;
    const o: unknown = input;
    if (!regIsRecord(o) || !regOnlyKeys(o, new Set(["productId"]))) return regRefuse("VALIDATION");
    const pid = o.productId;
    if (!regIsId(pid)) return regRefuse("PRODUCT_NOT_FOUND");
    const vis = await db.$queryRaw<{ id: string }[]>`SELECT p.id FROM "PosProduct" p WHERE ${regVisibleWhere(s)} AND p.id = ${pid}`;
    const [row] = await regRowsInOrder(db, s.tenantId, vis.map((r) => r.id));
    if (!row) return regRefuse("PRODUCT_NOT_FOUND");
    const owner = row.parentId ?? row.id;
    const [cat, kids] = await Promise.all([regOptionCatalog(db, s.tenantId, [owner]), row.parentId ? Promise.resolve([]) : regChildViews(db, s, row.id)]);
    return {
      ok: true,
      productId: row.id,
      groups: (cat.get(owner) ?? []).map((g) => ({
        groupId: g.id,
        name: g.name,
        nameEn: g.nameEn,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        choices: g.choices.map((c) => ({ choiceId: c.id, name: c.name, nameEn: c.nameEn, priceDeltaSatang: c.priceDelta, isDefault: c.isDefault, unavailable: c.isOutOfStock })),
      })),
      variants: kids.map((k) => ({ id: k.id, name: k.name, nameEn: k.nameEn, priceSatang: k.priceSatang, barcode: k.barcode, soldOut: k.soldOut })),
    };
  });
}

// ── ตะกร้าของคำขอ (quote/submit) ──
// note = หมายเหตุบรรทัด (P1.6 R5 · เก็บลงบิลตอน submit · quote ไม่ใช้)
// P1.2: options = choiceId ที่เลือก (ว่าง = ไม่มี) · บรรทัดชั่ง = weighedBarcode (ป้าย) หรือ weightGrams (กรอกเอง) อย่างใดอย่างหนึ่ง (qty 1)
type RegParsedLine =
  | {
      kind: "product";
      productId: string;
      qty: number;
      discount: PriceDiscount | null;
      openPrice: number | null;
      note?: string | null;
      options: string[];
      weighedBarcode: string | null;
      weightGrams: number | null;
    }
  | { kind: "custom"; name: string; qty: number; unitPriceSatang: number; discount: PriceDiscount | null; note?: string | null };
type RegParsedCart = { lines: RegParsedLine[]; billDiscount: PriceDiscount | null; memberId: string | null };

const REG_QUOTE_KEYS: ReadonlySet<string> = new Set(["lines", "billDiscount", "memberId"]);
const REG_SUBMIT_KEYS: ReadonlySet<string> = new Set([...REG_QUOTE_KEYS, "idempotencyKey", "payMethods", "cashReceivedSatang", "expectedGrandTotalSatang", "tipSatang", "note"]);
const REG_PAY_KEYS: ReadonlySet<string> = new Set(["type", "amountSatang", "reference"]);
const REG_LINE_KEYS: ReadonlySet<string> = new Set(["productId", "name", "qty", "unitPriceSatang", "openPrice", "discount", "note", "options", "weighedBarcode", "weightGrams"]);
/** P1.2 R1: คีย์ของรายการตัวเลือก — priceDeltaSatang/name รับได้แต่ "ไม่ใช้" (ราคาจาก client ไม่ถูกเชื่อ · มติ R2) · คีย์อื่น = VALIDATION */
const REG_OPTION_KEYS: ReadonlySet<string> = new Set(["choiceId", "priceDeltaSatang", "name"]);

/** P1.2 R1: options ถูกรูป → choiceId ตามลำดับ · ไม่ใช่ array / เกินเพดาน / รายการผิดรูป / choiceId ซ้ำ = null (VALIDATION) */
function regOptionIds(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > REGISTER_MAX_OPTIONS_PER_LINE) return null;
  const out: string[] = [];
  for (const e of v as unknown[]) {
    if (!regIsRecord(e) || !regOnlyKeys(e, REG_OPTION_KEYS) || !regIsId(e.choiceId)) return null;
    out.push(e.choiceId);
  }
  return new Set(out).size === out.length ? out : null;
}

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
    if (l.note !== undefined && l.note !== null && (typeof l.note !== "string" || l.note.length > REGISTER_NOTE_MAX || !regCleanText(l.note))) {
      return regRefuse("VALIDATION", undefined, i);
    }
    const note = typeof l.note === "string" && l.note.length > 0 ? l.note : null;
    if (l.openPrice !== undefined && typeof l.openPrice !== "boolean") return regRefuse("VALIDATION", undefined, i);
    // P1.2: ช่องตัวเลือก/น้ำหนัก (undefined/null = ไม่ส่ง)
    const hasOpt = l.options !== undefined && l.options !== null;
    const hasWb = l.weighedBarcode !== undefined && l.weighedBarcode !== null;
    const hasWg = l.weightGrams !== undefined && l.weightGrams !== null;
    if (l.productId !== undefined && l.productId !== null) {
      if (!regIsId(l.productId)) return regRefuse("VALIDATION", undefined, i);
      let openPrice: number | null = null;
      if (l.openPrice === true) {
        if (!regIsMoney(l.unitPriceSatang)) return regRefuse("INVALID_LINE", "ราคาที่กรอกต้องเป็นจำนวนเต็มสตางค์ที่ไม่ติดลบ", i);
        openPrice = l.unitPriceSatang;
      }
      // P1.2 R1: ตัวเลือก — ผิดรูป/ซ้ำ/เกิน 20 = VALIDATION · ราคาเปิดคู่ตัวเลือก = VALIDATION (P1.2)
      let options: string[] = [];
      if (hasOpt) {
        const ids = regOptionIds(l.options);
        if (!ids) return regRefuse("VALIDATION", "ตัวเลือกที่ส่งมาไม่ถูกต้อง", i);
        options = ids;
      }
      if (openPrice !== null && options.length) return regRefuse("VALIDATION", "ราคาที่กรอกเองใช้คู่กับตัวเลือกไม่ได้", i);
      // P1.2 R12: บรรทัดชั่ง — ป้ายหรือน้ำหนักอย่างใดอย่างหนึ่ง · ไม่คู่ราคาเปิด · qty 1 · น้ำหนัก 1–99999 กรัม
      if (hasWb && hasWg) return regRefuse("VALIDATION", "ส่งได้อย่างใดอย่างหนึ่ง: ป้ายชั่ง หรือ น้ำหนัก", i);
      if ((hasWb || hasWg) && openPrice !== null) return regRefuse("VALIDATION", "สินค้าชั่งใช้ราคาที่กรอกเองไม่ได้", i);
      let weighedBarcode: string | null = null;
      let weightGrams: number | null = null;
      if (hasWb) {
        if (typeof l.weighedBarcode !== "string" || l.weighedBarcode.length > 64 || !regCleanText(l.weighedBarcode)) return regRefuse("VALIDATION", "ป้ายชั่งไม่ถูกต้อง", i);
        weighedBarcode = l.weighedBarcode.trim();
      }
      if (hasWg) {
        if (typeof l.weightGrams !== "number") return regRefuse("VALIDATION", "น้ำหนักไม่ถูกต้อง", i);
        if (!Number.isInteger(l.weightGrams) || l.weightGrams < 1 || l.weightGrams > REGISTER_MAX_WEIGHT_GRAMS) {
          return regRefuse("INVALID_LINE", `น้ำหนักต้องเป็นจำนวนเต็ม 1–${REGISTER_MAX_WEIGHT_GRAMS} กรัม`, i);
        }
        weightGrams = l.weightGrams;
      }
      if ((hasWb || hasWg) && l.qty !== 1) return regRefuse("INVALID_LINE", "สินค้าชั่งใส่ได้ครั้งละ 1 ป้าย (จำนวน 1)", i);
      // ราคาที่ client ส่งมากับสินค้าแคตตาล็อก (ไม่ใช่ราคาเปิด) = ไม่ใช้เลย — ราคามาจาก DB เสมอ (มติ R2)
      lines.push({ kind: "product", productId: l.productId, qty: l.qty, discount, openPrice, note, options, weighedBarcode, weightGrams });
    } else {
      if (l.openPrice === true) return regRefuse("VALIDATION", undefined, i);
      // P1.2: รายการกำหนดเองไม่มีตัวเลือก/น้ำหนัก
      if (hasOpt || hasWb || hasWg) return regRefuse("VALIDATION", "รายการกำหนดเองใส่ตัวเลือกหรือน้ำหนักไม่ได้", i);
      const name = typeof l.name === "string" ? l.name.trim() : "";
      if (!name || name.length > 200 || !regCleanText(name)) return regRefuse("VALIDATION", "รายการกำหนดเองต้องมีชื่อ", i);
      if (!regIsMoney(l.unitPriceSatang)) return regRefuse("INVALID_LINE", "ราคาต้องเป็นจำนวนเต็มสตางค์ที่ไม่ติดลบ", i);
      lines.push({ kind: "custom", name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, discount, note });
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
  note: string | null;
  /** P1.2: ตัวเลือกที่ใช้คิดราคา (สำเนาลงบิล) · ส่วนประกอบชุด ต่อ 1 หน่วย · น้ำหนักบรรทัดชั่ง (กรัม) */
  options: RegPickedOption[];
  components: { invItemId: string; qty: number }[];
  weightGrams: number | null;
};

/**
 * คิดราคาฝั่งเซิร์ฟเวอร์ (ใช้ร่วม quote + submit): สิทธิ์ราคาเอง → สมาชิก → สินค้า (ขายได้ที่สาขานี้ · เปิดขาย · ไม่มีตัวเลือกบังคับ ·
 * มีราคา) → priceCart ด้วยราคาจาก DB · เพดานส่วนลดของผู้ขาย · VAT ของสมุดที่ผูก
 */
async function regPrice(
  db: RegDb,
  s: RegScope,
  cart: RegParsedCart,
  pay?: PosPaymentSettings,
): Promise<{ quote: RegisterQuoteTotals; resolved: RegResolvedLine[] } | RegisterRefusal> {
  // Q8: รายการกำหนดเอง / ราคาเปิด ต้องมี pos.sale.priceOverride (OWNER/MANAGER ได้ตามบทบาท · STAFF ต้องได้รับ)
  // P1.2 R12 (มติ P4): กรอกน้ำหนักเอง = ตั้งราคาเอง (กันโกงตาชั่ง) · สแกนป้ายชั่งไม่ต้องมีสิทธิ์
  const needOverride = cart.lines.findIndex((l) => l.kind === "custom" || l.openPrice !== null || l.weightGrams !== null);
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
  const rowById = new Map(rows.map((r) => [r.id, r]));
  // P1.2: กลุ่มตัวเลือก (สด) ของเจ้าของกลุ่ม · สูตรชุด · ค่าตั้งป้ายชั่ง (อ่านเมื่อมีบรรทัดที่ต้องใช้เท่านั้น)
  const optCat = await regOptionCatalog(db, s.tenantId, [...new Set(rows.map((r) => r.parentId ?? r.id))]);
  const bundleIds = rows.filter((r) => r.kind === "BUNDLE").map((r) => r.id);
  const recipes = bundleIds.length
    ? await db.recipeLine.findMany({ where: { tenantId: s.tenantId, productId: { in: bundleIds } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { productId: true, invItemId: true, qty: true } })
    : [];
  // P1.2 R2 F1: ตรวจซ้ำบนสูตรที่อ่านจริง (สูตรถูกแก้ระหว่างตรวจมองเห็น) — ส่วนประกอบนอกคลังของสาขานี้ = ชุดนั้นขายไม่ได้ที่นี่
  const compIds = [...new Set(recipes.map((r) => r.invItemId))];
  const compHere = new Set(
    compIds.length && s.unitInv
      ? (await db.invItem.findMany({ where: { tenantId: s.tenantId, systemId: s.unitInv, id: { in: compIds } }, select: { id: true } })).map((x) => x.id)
      : [],
  );
  const bundleBlocked = new Set(recipes.filter((r) => !compHere.has(r.invItemId)).map((r) => r.productId));
  const wbs = cart.lines.some((l) => l.kind === "product" && l.weighedBarcode !== null) ? await regWeighedSettings(db, s) : null;
  const priceLines: { qty: number; unitPriceSatang: number; discount: PriceDiscount | null }[] = [];
  const meta: Omit<RegResolvedLine, "discountSatang" | "unitPriceSatang">[] = [];
  for (let i = 0; i < cart.lines.length; i++) {
    const l = cart.lines[i]!;
    if (l.kind === "custom") {
      priceLines.push({ qty: l.qty, unitPriceSatang: l.unitPriceSatang, discount: l.discount });
      meta.push({ name: l.name, qty: l.qty, productId: null, itemId: null, serviceId: null, note: l.note ?? null, options: [], components: [], weightGrams: null });
      continue;
    }
    const v = views.get(l.productId);
    const row = rowById.get(l.productId);
    // มติ 3.1 ข้อ 3: สาขาอื่น / คลังอื่น / ร้านอื่น / เก็บถาวร / ไม่มีจริง = PRODUCT_NOT_FOUND (ไม่คิดราคา · ไม่บอกชื่อ)
    if (!v || !row || bundleBlocked.has(row.id)) return regRefuse("PRODUCT_NOT_FOUND", undefined, i);
    if (v.soldOutReason === "UNAVAILABLE") return regRefuse("PRODUCT_UNAVAILABLE", undefined, i);
    // P1.2 R6: แม่ที่มีตัวแปรขายได้ = ต้องเลือกตัวแปร (ไม่คิดราคา)
    if (v.variantCount > 0) return regRefuse("VARIANT_REQUIRED", undefined, i);
    // P1.2 R1/R2: ตัวเลือก (ตัวแปร = กลุ่มของแม่) — ราคา/ชื่อสดจาก DB · ไม่ส่ง options เลยกับกลุ่มบังคับ = OPTIONS_REQUIRED (P1.3 S3.26 คงเดิม)
    const opt = regResolveOptions(optCat.get(row.parentId ?? row.id) ?? [], l.options);
    if (!opt.ok) return regRefuse(opt.code, undefined, i);
    let base: number;
    let weightGrams: number | null = null;
    if (row.soldByWeight) {
      // P1.2 R12: ราคาต่อกก. = ราคาของแถว (ตัวแปรสืบแม่) · ป้าย WEIGHT = ปัดครึ่งขึ้น(กรัม × ราคา/1000) · ป้าย PRICE = ราคาบนป้าย (สตางค์ · มติ P2)
      if (l.weighedBarcode === null && l.weightGrams === null) return regRefuse("WEIGHT_REQUIRED", undefined, i);
      const perKg = v.priceSatang;
      if (perKg === null) return regRefuse("PRICE_NOT_SET", undefined, i);
      if (l.weighedBarcode !== null) {
        const wb = wbs ? parseWeighedBarcode(l.weighedBarcode, wbs) : null;
        // ป้ายอ่านไม่ได้ (ปิดค่าตั้ง · check digit ผิด · คำนำหน้าไม่อยู่ในกฎ) / PLU ไม่ใช่สินค้านี้ = VALIDATION (ราคา/น้ำหนักจาก client ไม่ถูกใช้)
        if (!wb || wb.itemCode !== row.scalePlu) return regRefuse("VALIDATION", "ป้ายชั่งนี้ไม่ใช่ของสินค้านี้ — สแกนป้ายใหม่", i);
        if (wb.kind === "WEIGHT") {
          weightGrams = wb.grams ?? 0;
          if (weightGrams < 1) return regRefuse("INVALID_LINE", "น้ำหนักบนป้ายต้องมากกว่า 0", i);
          base = weighedPriceSatang(weightGrams, perKg);
        } else {
          base = wb.priceSatang ?? 0;
          if (perKg < 1) return regRefuse("INVALID_LINE", "ตั้งราคาต่อกิโลกรัมก่อนขายด้วยป้ายฝังราคา", i);
          weightGrams = weighedGramsFromPrice(base, perKg);
          // R2 F3: ป้ายราคาที่ราคา < 1 สตางค์ หรือคิดน้ำหนักได้ < 1 กรัม = INVALID_LINE ตั้งแต่ quote (ไม่ใช่ VALIDATION ตอนบันทึก)
          if (base < 1 || weightGrams < 1) return regRefuse("INVALID_LINE", "ราคาบนป้ายน้อยเกินไป — คิดน้ำหนักไม่ได้ สแกนป้ายใหม่", i);
        }
      } else {
        weightGrams = l.weightGrams!;
        base = weighedPriceSatang(weightGrams, perKg);
      }
    } else {
      if (l.weighedBarcode !== null || l.weightGrams !== null) return regRefuse("VALIDATION", "สินค้านี้ไม่ได้ขายตามน้ำหนัก", i);
      const unit0 = l.openPrice ?? v.priceSatang;
      if (unit0 === null) return regRefuse("PRICE_NOT_SET", undefined, i);
      base = unit0;
    }
    // R1: ราคาต่อหน่วย = ฐาน + Σ delta (ส่วนลดบรรทัด/ท้ายบิลคิดบนราคานี้) · ติดลบ = INVALID_LINE
    const unit = base + opt.delta;
    if (unit < 0 || unit > PRICE_MAX_SATANG) return regRefuse("INVALID_LINE", "ราคารวมตัวเลือกไม่ถูกต้อง", i);
    priceLines.push({ qty: l.qty, unitPriceSatang: unit, discount: l.discount });
    // ตัดสต็อกเฉพาะสินค้าที่นับสต็อกจริง (C2 · trackStock off/AUTO ที่ยังไม่เคยมีสต็อก = ไม่ตัด) · บริการผูก serviceId (มติ R5)
    //   P1.2: ตัวแปรตัด InvItem ของตัวเอง · ชุด (BUNDLE) ไม่มี itemId — ตัดส่วนประกอบตามสูตร ณ ตอนขาย (R8) · สินค้าชั่งตัดเป็นกรัม (P3)
    const itemId = v.kind === "PRODUCT" && v.invItemId && v.trackStock ? v.invItemId : null;
    const serviceId = v.kind === "SERVICE" && v.invItemId ? v.invItemId : null;
    const components = v.kind === "BUNDLE" ? recipes.filter((r) => r.productId === v.id).map((r) => ({ invItemId: r.invItemId, qty: r.qty })) : [];
    meta.push({ name: v.name, qty: l.qty, productId: v.id, itemId, serviceId, note: l.note ?? null, options: opt.picked, components, weightGrams });
  }
  const vat = await regVat(db, s.tenantId, s.systemId);
  // P1.6 O19: ค่าบริการตามค่าตั้งของระบบ POS (ปิด = 0 · ยอดเท่าวันนี้)
  const settings = pay ?? (await regPaySettings(db, s));
  const serviceChargeBp = settings.serviceCharge.enabled ? settings.serviceCharge.rateBp : 0;
  const r = priceCart({ lines: priceLines, billDiscount: cart.billDiscount, vat, maxDiscountBp: regMaxDiscountBp(s.actor), serviceChargeBp });
  if (!r.ok) return regRefuse(r.code, r.code === "DISCOUNT_EXCEEDS_LIMIT" || r.code === "TOO_MANY_LINES" ? undefined : r.message, r.lineIndex);
  // B1.1 (มติ 3.2 ข้อ 3 · D6 ใหม่): สมาชิกที่ createSale จะหักส่วนลดอัตโนมัติให้ = ปฏิเสธตั้งแต่ quote ก่อนเขียนอะไร (P1.12 รองรับ)
  if (cart.memberId) {
    const wallet = r.lines.map((x, i) => ({ name: meta[i]!.name, qty: x.qty, unitPriceSatang: x.unitPriceSatang, discountSatang: x.discountSatang, itemId: meta[i]!.itemId, serviceId: meta[i]!.serviceId }));
    if (await regMemberAutoDiscount(s, cart.memberId, wallet)) return regRefuse("MEMBER_RIGHTS_UNSUPPORTED");
  }
  const lines: RegisterQuoteLine[] = r.lines.map((x, i) => {
    const m = meta[i]!;
    const options: RegisterQuoteLineOption[] = m.options.map((o) => ({ choiceId: o.choiceId, groupId: o.groupId, name: o.name, priceDeltaSatang: o.priceDeltaSatang }));
    return {
      productId: m.productId,
      unitPriceSatang: x.unitPriceSatang,
      grossSatang: x.grossSatang,
      discountSatang: x.discountSatang,
      lineTotalSatang: x.lineTotalSatang,
      // P1.2 R3
      optionsSatang: m.options.reduce((t, o) => t + o.priceDeltaSatang, 0),
      options,
      weightGrams: m.weightGrams,
    };
  });
  const quote: RegisterQuoteTotals = {
    subtotalSatang: r.subtotalSatang,
    lineDiscountSatang: r.lineDiscountSatang,
    billDiscountSatang: r.billDiscountSatang,
    couponDiscountSatang: r.couponDiscountSatang,
    netSatang: r.netSatang,
    serviceChargeSatang: r.serviceChargeSatang,
    vatSatang: r.vatSatang,
    grandTotalSatang: r.grandTotalSatang,
    lines,
    vatMode: vat.mode,
    vatRateBp: vat.rateBp,
  };
  const resolved = r.lines.map((x, i) => ({ ...meta[i]!, unitPriceSatang: x.unitPriceSatang, discountSatang: x.discountSatang }));
  return { quote, resolved };
}

/** P1.6: ค่าตั้งการชำระเงินของระบบ POS นี้ (อ่านไม่ได้ = ปิดทั้งคู่ — ยอดเท่าวันนี้ ไม่เดาค่าบริการ) */
async function regPaySettings(db: RegDb, s: RegScope): Promise<PosPaymentSettings> {
  const r = await posPaymentSettings({ tenantId: s.tenantId, systemId: s.systemId }, db);
  return r.ok ? { serviceCharge: r.serviceCharge, tip: r.tip } : { serviceCharge: { enabled: false, rateBp: 0 }, tip: { enabled: false, ledgerAccountId: null } };
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

// ── POS P1.5 ▸ ตัวช่วยของ held-cart.ts (พัก/เรียกคืน) — ใช้ด่านขอบเขต + ตัวตรวจตะกร้า "ชุดเดียว" กับ quote/submit ◂ ──
/** ด่านขอบเขตเดียวกับหน้าขาย (ร้าน · ระบบ POS · สาขา · เข้าสาขาได้ · pos.sale.create) — ok = ctx/actor ที่ตรวจแล้ว */
export async function registerScopeCheck(
  ctx: RegisterCtx,
  actor: RegisterActor,
  client?: RegDb,
): Promise<{ ok: true; ctx: RegisterCtx; actor: RegisterActor } | RegisterRefusal> {
  const s = await regScope(client ?? prisma, ctx, actor);
  if (isRegRefusal(s)) return s;
  return { ok: true, ctx: { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId }, actor: s.actor };
}

/**
 * ตะกร้าจาก client/DB → รูปมาตรฐานของ RegisterQuoteInput (ตัวตรวจเดียวกับ quote · คีย์แปลก/คูปอง = VALIDATION) —
 * ราคาของสินค้าแคตตาล็อกที่ไม่ใช่ราคาเปิด "ถูกตัดทิ้ง" (ไม่เก็บ ไม่เชื่อ · มติ R2) · note ไม่เก็บ (quote/submit ไม่ใช้)
 */
export function registerCanonicalCart(raw: unknown): RegisterQuoteInput | RegisterRefusal {
  const c = regParseCart(raw, REG_QUOTE_KEYS);
  if (isRegRefusal(c)) return c;
  const lines: RegisterQuoteLineInput[] = c.lines.map((l) => {
    const discount = l.discount ? { discount: { ...l.discount } } : {};
    if (l.kind === "custom") return { name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, ...discount };
    return {
      productId: l.productId,
      qty: l.qty,
      ...discount,
      ...(l.openPrice !== null ? { openPrice: true as const, unitPriceSatang: l.openPrice } : {}),
      // P1.2 R13: บิลพักเก็บตัวเลือก (choiceId เท่านั้น) + ป้ายชั่ง/น้ำหนัก — เรียกคืนแล้ว quote ใหม่ด้วยราคาสด
      ...(l.options.length ? { options: l.options.map((choiceId) => ({ choiceId })) } : {}),
      ...(l.weighedBarcode !== null ? { weighedBarcode: l.weighedBarcode } : {}),
      ...(l.weightGrams !== null ? { weightGrams: l.weightGrams } : {}),
    };
  });
  return { lines, ...(c.billDiscount ? { billDiscount: { ...c.billDiscount } } : {}), ...(c.memberId ? { memberId: c.memberId } : {}) };
}

/** สินค้าที่ "ยังขายได้ที่สาขานี้" ตาม id (กติกามองเห็นเดียวกับกริด) — จอใช้แสดงชื่อ/ราคาบรรทัดที่เรียกคืน · ไม่เจอ = ไม่อยู่ในผล */
export async function registerProductsByIds(ctx: RegisterCtx, actor: RegisterActor, ids: string[], client?: RegDb): Promise<RegisterProduct[]> {
  const db: RegDb = client ?? prisma;
  const s = await regScope(db, ctx, actor);
  const want = [...new Set(ids.filter(regIsId))].slice(0, REGISTER_MAX_LINES);
  if (isRegRefusal(s) || !want.length) return [];
  const visible = (await db.$queryRaw<{ id: string }[]>`SELECT p.id FROM "PosProduct" p WHERE ${regVisibleWhere(s)} AND p.id = ANY(${want}::text[])`).map((r) => r.id);
  return regViews(db, s, await regRowsInOrder(db, s.tenantId, visible));
}

// ── ส่งบิล ──
type RegParsedSubmit = {
  cart: RegParsedCart;
  /** คีย์ที่เก็บจริง = REG_KEY_PREFIX + คีย์ของ client (R4 K1) */
  idempotencyKey: string;
  payMethods: { type: RegisterPayType; amountSatang: number; reference: string | null }[];
  cashReceivedSatang: number | null;
  expected: number;
  /** P1.6 ทิป (0 = ไม่มี) · หมายเหตุบิล (null = ไม่มี) */
  tipSatang: number;
  note: string | null;
  /** P1.2 R14: ค่าตั้งป้ายชั่ง ณ ตอนเทียบคำขอซ้ำ (โหลดเมื่อมีบรรทัดป้ายชั่งเท่านั้น) */
  wb?: WeighedBarcodeSettings | null;
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
  if (!Array.isArray(pmRaw)) return regRefuse("VALIDATION", "วิธีชำระเงินไม่ถูกต้อง");
  // P1.6 R2: แบ่งจ่าย 1…10 รายการ (ชนิดซ้ำได้ — เช่น บัตรสองใบ) · เกิน = SPLIT_INVALID ไม่มีบิล
  if (pmRaw.length > REGISTER_MAX_PAY_METHODS) return regRefuse("SPLIT_INVALID");
  const payMethods: RegParsedSubmit["payMethods"] = [];
  for (const p of pmRaw as unknown[]) {
    if (!regIsRecord(p) || !regOnlyKeys(p, REG_PAY_KEYS)) return regRefuse("VALIDATION", "วิธีชำระเงินไม่ถูกต้อง");
    if (!(REGISTER_PAY_TYPES as readonly unknown[]).includes(p.type)) return regRefuse("VALIDATION", "หน้าขายนี้รับเงินสด พร้อมเพย์ โอน และบัตรเท่านั้น");
    // B1.1: แต่ละรายการต้อง ≥ 1 สตางค์ (รายการยอด 0 = VALIDATION — บิลยอด 0 ส่งรายการว่าง)
    if (!regIsMoney(p.amountSatang) || p.amountSatang < 1) return regRefuse("VALIDATION", "จำนวนเงินของแต่ละวิธีต้องเป็นจำนวนเต็มสตางค์ตั้งแต่ 1");
    // เงินสดได้รายการเดียว (เงินที่รับ/ทอนผูกกับแถวเงินสดแถวเดียว · มติ §8 ข้อ 2)
    if (p.type === "CASH" && payMethods.some((x) => x.type === "CASH")) return regRefuse("VALIDATION", "เงินสดใส่ได้รายการเดียว");
    let reference: string | null = null;
    if (p.reference !== undefined && p.reference !== null) {
      // POS P1.7 ▸ พร้อมเพย์รับเลขอ้างอิงได้เฉพาะ id ใบขอรับเงิน (pi_…) · อื่น ๆ = VALIDATION เหมือน P1.6 ◂
      if (p.type !== "CARD" && p.type !== "TRANSFER" && !(p.type === "PROMPTPAY" && isPaymentIntentId(p.reference))) return regRefuse("VALIDATION", "เลขอ้างอิงใส่ได้เฉพาะบัตรและโอน");
      if (typeof p.reference !== "string" || p.reference.length > REGISTER_REFERENCE_MAX || !regCleanText(p.reference)) return regRefuse("VALIDATION", "เลขอ้างอิงไม่ถูกต้อง");
      reference = p.reference.trim() || null;
    }
    payMethods.push({ type: p.type as RegisterPayType, amountSatang: p.amountSatang, reference });
  }
  let cashReceivedSatang: number | null = null;
  if (raw.cashReceivedSatang !== undefined && raw.cashReceivedSatang !== null) {
    if (!regIsMoney(raw.cashReceivedSatang)) return regRefuse("VALIDATION", "จำนวนเงินที่รับต้องเป็นจำนวนเต็มสตางค์ที่ไม่ติดลบ");
    cashReceivedSatang = raw.cashReceivedSatang;
  }
  const cash = payMethods.find((p) => p.type === "CASH")?.amountSatang ?? 0;
  if (cash === 0 && cashReceivedSatang !== null && cashReceivedSatang !== 0) return regRefuse("VALIDATION", "ไม่มีส่วนเงินสด — ไม่ต้องกรอกเงินที่รับ");
  // P1.6 ทิป: จำนวนเต็มสตางค์ ≥ 0 (เปิดรับทิปไหม ตรวจกับค่าตั้งของระบบตอน submit)
  let tipSatang = 0;
  if (raw.tipSatang !== undefined && raw.tipSatang !== null) {
    if (!regIsMoney(raw.tipSatang)) return regRefuse("VALIDATION", "ทิปต้องเป็นจำนวนเต็มสตางค์ที่ไม่ติดลบ");
    tipSatang = raw.tipSatang;
  }
  // P1.6 R5 หมายเหตุบิล
  let note: string | null = null;
  if (raw.note !== undefined && raw.note !== null) {
    if (typeof raw.note !== "string" || raw.note.length > REGISTER_NOTE_MAX || !regCleanText(raw.note)) return regRefuse("VALIDATION", `หมายเหตุบิลยาวได้ไม่เกิน ${REGISTER_NOTE_MAX} ตัวอักษร`);
    note = raw.note.length > 0 ? raw.note : null;
  }
  return { cart, idempotencyKey: REG_KEY_PREFIX + raw.idempotencyKey, payMethods, cashReceivedSatang, expected: raw.expectedGrandTotalSatang, tipSatang, note };
}

// P1.2 R14: บรรทัดพกตัวเลือกที่บันทึก (PosSaleLineOption) มาด้วย — ใช้เทียบคำขอซ้ำ
type RegSaleRow = Prisma.PosSaleGetPayload<{ include: { lines: { include: { options: true } }; payments: true } }>;
async function regLoadSale(db: RegDb, tenantId: string, idempotencyKey: string): Promise<RegSaleRow | null> {
  // B1.1: ลำดับคงที่ (การเทียบเป็น multiset อยู่แล้ว — ลำดับนี้ให้ผลอ่านซ้ำได้เหมือนเดิมทุกครั้ง)
  return db.posSale.findUnique({
    where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
    include: { lines: { orderBy: { id: "asc" }, include: { options: { orderBy: { id: "asc" } } } }, payments: { orderBy: { id: "asc" } } },
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
type RegProductLine = Extract<RegParsedLine, { kind: "product" }>;
type RegStoredLine = RegSaleRow["lines"][number];
/** P1.2 R14: ชุดตัวเลือกแบบไม่ขึ้นกับลำดับ */
const regOptKey = (ids: readonly string[]) => [...ids].sort().join(",");
const regIsWeighedReq = (l: RegProductLine) => l.weighedBarcode !== null || l.weightGrams !== null;

/**
 * P1.2 R14 — บรรทัดชั่งของคำขอ ↔ บรรทัดชั่งที่บันทึก (จับคู่หนึ่งต่อหนึ่งแบบ augmenting path · ไม่ตะกละ):
 *   สินค้า · ชุดตัวเลือก · จำนวน เท่ากัน และ น้ำหนักกรอกเอง/ป้าย WEIGHT = กรัมเท่ากัน · ป้าย PRICE = ราคาบนป้าย = ราคาที่บันทึก − Σ delta ที่บันทึก ·
 *   ส่วนลดของคำขอคิดบนราคาที่บันทึก = ส่วนลดที่บันทึก · ป้ายที่อ่านไม่ได้แล้ว (ปิดค่าตั้งภายหลัง) = ไม่ตรง
 */
function regWeighedEqual(req: RegProductLine[], stored: RegStoredLine[], wb: WeighedBarcodeSettings | null): boolean {
  if (req.length !== stored.length) return false;
  if (!req.length) return true;
  const fits = (r: RegProductLine, x: RegStoredLine): boolean => {
    if (x.productId !== r.productId || x.qty !== r.qty || x.weightGrams === null) return false;
    if (regOptKey(x.options.map((o) => o.choiceId)) !== regOptKey(r.options)) return false;
    if (regDiscountSatang(r.discount, x.unitPriceSatang * x.qty) !== x.discountSatang) return false;
    if (r.weightGrams !== null) return x.weightGrams === r.weightGrams;
    const p = wb && r.weighedBarcode !== null ? parseWeighedBarcode(r.weighedBarcode, wb) : null;
    if (!p) return false;
    if (p.kind === "WEIGHT") return x.weightGrams === p.grams;
    return x.unitPriceSatang - x.options.reduce((t, o) => t + o.priceDeltaSatang, 0) === p.priceSatang;
  };
  const owner: (number | null)[] = stored.map(() => null);
  const tryAssign = (ri: number, seen: boolean[]): boolean => {
    for (let si = 0; si < stored.length; si++) {
      if (seen[si] || !fits(req[ri]!, stored[si]!)) continue;
      seen[si] = true;
      if (owner[si] === null || tryAssign(owner[si]!, seen)) {
        owner[si] = ri;
        return true;
      }
    }
    return false;
  };
  for (let ri = 0; ri < req.length; ri++) if (!tryAssign(ri, stored.map(() => false))) return false;
  return true;
}

function regLinesEqual(req: RegParsedLine[], stored: RegSaleRow["lines"], wb: WeighedBarcodeSettings | null = null): boolean {
  if (stored.length !== req.length) return false;
  const sCustom = stored.filter((x) => x.productId === null).map((x) => `${x.name}|${regTup(x.unitPriceSatang, x.qty, x.discountSatang)}`);
  const rCustom = req.flatMap((l) => (l.kind === "custom" ? [`${l.name}|${regTup(l.unitPriceSatang, l.qty, regDiscountSatang(l.discount, l.unitPriceSatang * l.qty))}`] : []));
  if (regBag(sCustom) !== regBag(rCustom)) return false;
  // P1.2 R14: บรรทัดชั่งเทียบแยก (น้ำหนัก/ป้ายเป็นส่วนหนึ่งของตัวตนบรรทัด)
  const rProd = req.filter((l): l is RegProductLine => l.kind === "product");
  const sProd = stored.filter((x) => x.productId !== null);
  if (!regWeighedEqual(rProd.filter(regIsWeighedReq), sProd.filter((x) => x.weightGrams !== null), wb)) return false;
  // บรรทัดปกติ: กลุ่ม = สินค้า + ชุดตัวเลือก (ทุกบรรทัดของกลุ่มเดียวกันในบิลเดียวใช้ราคาเดียวกันเสมอ — ฐาน + Σ delta อ่านครั้งเดียว) ·
  //   ไม่มีตัวเลือกเลย = กลุ่มของสินค้าแบบเดิมทุกประการ (payload แบบ P1.3 เทียบเหมือนวันนี้)
  const rPlain = rProd.filter((l) => !regIsWeighedReq(l));
  const sPlain = sProd.filter((x) => x.weightGrams === null);
  const gk = (pid: string, opts: readonly string[]) => `${pid}#${regOptKey(opts)}`;
  const sKey = (x: RegStoredLine) => gk(x.productId!, x.options.map((o) => o.choiceId));
  const groups = new Set<string>([...sPlain.map(sKey), ...rPlain.map((l) => gk(l.productId, l.options))]);
  for (const g of groups) {
    const sLines = sPlain.filter((x) => sKey(x) === g);
    const target = regBag(sLines.map((x) => regTup(x.unitPriceSatang, x.qty, x.discountSatang)));
    const mine = rPlain.filter((l) => gk(l.productId, l.options) === g);
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
  // P1.6: ทิป + หมายเหตุบิลเป็นส่วนหนึ่งของคำขอ
  if (sale.tipSatang !== req.tipSatang || (sale.note ?? null) !== req.note) return false;
  const payKey = (xs: { type: string; amountSatang: number }[]) => regBag(xs.map((p) => `${p.type}:${p.amountSatang}`));
  if (payKey(sale.payments) !== payKey(req.payMethods)) return false;
  if (sale.discountSatang !== regDiscountSatang(req.cart.billDiscount, sale.subtotalSatang)) return false;
  return regLinesEqual(req.cart.lines, sale.lines, req.wb ?? null);
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
  // POS P1.8 F7 ▸ คีย์นี้เป็นของใบคืน (REFUND) = ชนเปล่า ๆ — ไม่ตอบใบคืนเป็นบิลขาย และไม่พกรายละเอียดของมัน ◂
  if (sale.docType === "REFUND") return regRefuse("IDEMPOTENCY_CONFLICT");
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
    // POS P1.9: รหัสเครื่องผิดรูป = VALIDATION (ไม่ส่ง = ไม่มีเครื่อง → ตัดสินตามค่าตั้ง S6 หลังค้นคีย์)
    const deviceId = regDeviceOf(ctx);
    if (deviceId === false) return regRefuse("VALIDATION", "รหัสเครื่องไม่ถูกต้อง");
    const req = regParseSubmit(input);
    if (isRegRefusal(req)) return req;
    // R4 K4 (มติ R4.1 ข้อ 3): ⑤ เงินสดที่รับ ตรวจ "ก่อน" ค้นคีย์ — คำขอแรกและคำขอซ้ำผ่านด่านเดียวกัน (ไม่มีทอนติดลบจากการส่งซ้ำ)
    //   ส่วนเงินสดมาจากคำขอเอง (ไม่ต้องคิดราคา) · ติดลบ/ไม่ใช่จำนวนเต็ม = VALIDATION ที่ regParseSubmit แล้ว
    const cash = req.payMethods.find((x) => x.type === "CASH")?.amountSatang ?? 0;
    if (cash > 0 && (req.cashReceivedSatang === null || req.cashReceivedSatang < cash)) {
      return regRefuse("PAYMENT_MISMATCH", "เงินที่รับน้อยกว่าส่วนที่จ่ายเงินสด");
    }
    // P1.2 R14: ป้ายชั่งเป็นส่วนหนึ่งของตัวตนบรรทัด — โหลดค่าตั้งไว้เทียบคำขอซ้ำ (เฉพาะเมื่อมีบรรทัดป้ายชั่ง)
    req.wb = req.cart.lines.some((l) => l.kind === "product" && l.weighedBarcode !== null) ? await regWeighedSettings(db, s) : null;
    // ① คีย์เดิมก่อนคิดราคา (ลองซ้ำหลังราคาเปลี่ยนต้องได้บิลเดิม)
    const prior = await regLoadSale(db, s.tenantId, req.idempotencyKey);
    if (prior) return regDuplicate(s, req, prior, true);
    // POS P1.10 ▸ R2: เครื่องที่ถูกเพิกถอนของสาขานี้ขายไม่ได้ (หลังคีย์ซ้ำ ⇒ ลองซ้ำบิลที่ commit ก่อนเพิกถอน = บิลเดิม) · ไม่ลงทะเบียน = ขายได้ (Q3) ◂
    if (deviceId && (await posDeviceRevoked(db, s.tenantId, s.unitId, deviceId))) return regRefuse("DEVICE_REVOKED");
    // POS P1.9 ▸ S6: กะของเครื่อง (หลังคีย์ซ้ำ ⇒ ลองซ้ำบิลที่ commit ในกะที่ปิดแล้ว = บิลเดิม) · บังคับมีกะแต่ไม่มี = SHIFT_REQUIRED ไม่มีบิล ◂
    const shift = await resolveRegisterShift(db, s, deviceId);
    if (!shift.ok) return regRefuse("SHIFT_REQUIRED");
    // P1.6: ค่าตั้งการชำระเงิน (ค่าบริการ · ทิป) — ทิปส่งมาตอนระบบไม่เปิดรับทิป = VALIDATION (ไม่มีบิล)
    const paySettings = await regPaySettings(db, s);
    if (req.tipSatang > 0 && !paySettings.tip.enabled) return regRefuse("VALIDATION", "จุดขายนี้ยังไม่เปิดรับทิป");
    // ②
    const p = await regPrice(db, s, req.cart, paySettings);
    if (isRegRefusal(p)) return p;
    const q = p.quote;
    // ③
    if (req.expected !== q.grandTotalSatang) return { ok: false, code: "PRICE_CHANGED", message: REG_MESSAGE.PRICE_CHANGED, ...q };
    // ④ (⑤ ย้ายไปก่อน ① — R4 K4) · P1.6: ทิปอยู่นอกยอดบิล ⇒ Σ วิธีจ่าย = ยอด + ทิป (มติ §8 ข้อ 1)
    if (req.payMethods.reduce((t, x) => t + x.amountSatang, 0) !== q.grandTotalSatang + req.tipSatang) return regRefuse("PAYMENT_MISMATCH");
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
        ...(l.note ? { note: l.note } : {}),
        // P1.2: สำเนาตัวเลือก (R4) · ส่วนประกอบชุด (R8) · น้ำหนัก (R12) — ไม่มี = ไม่ส่ง (บิลแบบ P1.3 เหมือนเดิมทุกไบต์)
        ...(l.options.length
          ? { options: l.options.map((o) => ({ choiceId: o.choiceId, groupId: o.groupId, groupName: o.groupName, choiceName: o.name, priceDeltaSatang: o.priceDeltaSatang })) }
          : {}),
        ...(l.components.length ? { components: l.components.map((c) => ({ ...c })) } : {}),
        ...(l.weightGrams !== null ? { weightGrams: l.weightGrams } : {}),
      })),
      billDiscountSatang: q.billDiscountSatang,
      // P1.6: เงินที่รับอยู่บนแถวเงินสด (ทอนคิดที่ createSale) · เลขอ้างอิงบัตร/โอน
      payMethods: req.payMethods.map((x) => ({
        type: x.type,
        amountSatang: x.amountSatang,
        ...(x.reference ? { reference: x.reference } : {}),
        ...(x.type === "CASH" && req.cashReceivedSatang !== null ? { cashTenderedSatang: req.cashReceivedSatang } : {}),
      })),
      ...(q.serviceChargeSatang > 0 ? { serviceChargeSatang: q.serviceChargeSatang } : {}),
      ...(req.tipSatang > 0 ? { tipSatang: req.tipSatang } : {}),
      ...(req.note ? { note: req.note } : {}),
      shiftId: shift.shiftId,
      soldByUserId: actor.userId, // POS P1.17 ▸ R6 · ผู้ขาย = ผู้ใช้ของ session ◂
    };
    // POS P1.7 ▸ R4: PROMPTPAY/CARD ที่อ้าง "pi_…" = ใช้ใบขอรับเงินที่ PAID ในธุรกรรมเดียวกับบิล (ล็อก FOR UPDATE) · ไม่มี = ทาง P1.6 เดิมทุกไบต์ ◂
    const intentRefs: SaleIntentRef[] = req.payMethods.flatMap((x) =>
      (x.type === "PROMPTPAY" || x.type === "CARD") && x.reference !== null && isPaymentIntentId(x.reference) ? [{ intentId: x.reference, payType: x.type, amountSatang: x.amountSatang }] : [],
    );
    if (intentRefs.length) return regSubmitWithIntents(db, s, req, saleInput, intentRefs, startedAt);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await regCreateSale(saleInput, db);
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
        // P1.6: คำปฏิเสธของ createSale เป็นข้อมูล (ไม่มีบิลเกิด) — คีย์ชนแต่ payload ต่าง = อ่านบิลจริงมาตอบแบบคีย์ซ้ำ
        if (e instanceof PosSaleError) {
          if (e.code === "IDEMPOTENCY_CONFLICT") {
            const row = await regLoadSale(db, s.tenantId, req.idempotencyKey);
            return row ? regDuplicate(s, req, row, true) : regRefuse("IDEMPOTENCY_CONFLICT");
          }
          // POS P1.8: HAS_REFUNDS มาจาก voidSale เท่านั้น (createSale ไม่โยน) — กันชนิดไว้เป็น VALIDATION
          return regRefuse(e.code === "HAS_REFUNDS" ? "VALIDATION" : e.code, e.code === "STOCK_INSUFFICIENT" ? e.message : undefined);
        }
        // createSale ตรวจยอดอีกชั้น (เช่น ส่วนลดอัตโนมัติของระดับสมาชิกที่ P1.3 ยังไม่คิด · P1.12) — ไม่มีบิลเกิด
        if (e instanceof Error && e.message.startsWith("PAYMENT_MISMATCH")) return regRefuse("PAYMENT_MISMATCH");
        throw e;
      }
    }
    return regRefuse("BUSY");
  });
}

/**
 * POS P1.7: จุดเรียก createSale จุดเดียวของหน้าขาย (ทะเบียนผู้เรียกของ qc-pos-p1.6 U4 นับต่อจุด) —
 * client = prisma ของแอป/ของผู้เรียก (ทาง P1.6) หรือ tx ของธุรกรรมใบขอรับเงิน (createSale ไม่เปิด tx ซ้อน · ไม่ทำงานหลัง commit เอง)
 */
function regCreateSale(input: CreateSaleInput, client: RegDb | Prisma.TransactionClient) {
  return createSale(input, client);
}

/** POS P1.7: ข้อผิดพลาดภายในธุรกรรมขายแบบใบขอรับเงิน (โยนเพื่อให้ธุรกรรมย้อนทั้งก้อน แล้วคืนเป็นคำปฏิเสธ) */
class RegIntentRefusal extends Error {
  constructor(readonly refusal: RegisterRefusal) {
    super(refusal.code);
  }
}

/**
 * POS P1.7 R4 — ส่งบิลที่อ้างใบขอรับเงิน: ธุรกรรมเดียว = ล็อก intent (FOR UPDATE) → ตรวจ → createSale(…, tx) → CONSUMED + saleId + PosPayment.note
 * ⇒ สองคำขอแย่ง intent เดียว = บิลเกิดใบเดียว (ผู้แพ้รอล็อกแล้วเห็น CONSUMED) · คีย์เดิมซ้ำ = บิลเดิม (ค้นคีย์ก่อนล็อก + หลังแพ้)
 * หลัง commit: ตัดสต็อก (perpetual) + scheduleDrain() ให้ pos.sale.paid ทำงานทันที (มติ I) — ชุดเดียวกับ createSale ตอนเป็นเจ้าของ tx
 */
async function regSubmitWithIntents(
  db: RegDb,
  s: RegScope,
  req: RegParsedSubmit,
  saleInput: CreateSaleInput,
  refs: SaleIntentRef[],
  startedAt: number,
): Promise<RegisterSubmitResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const saleId = await db.$transaction(
        async (tx) => {
          const locked = await lockSaleIntents(tx, s, refs);
          if (!locked.ok) throw new RegIntentRefusal(regRefuse(locked.code));
          const r = await regCreateSale(saleInput, tx);
          // createSale คืนบิลเดิมของคีย์นี้ได้ (บิลที่ไม่ได้อ้าง intent ชุดนี้ commit ไปก่อน) ⇒ ใช้ intent เฉพาะเมื่อบิลนี้อ้างครบทุกใบ
          const linked = await tx.posPayment.count({ where: { tenantId: s.tenantId, saleId: r.saleId, reference: { in: [...locked.notes.keys()] } } });
          if (linked === locked.notes.size) await consumeSaleIntents(tx, s, r.saleId, locked.notes);
          return r.saleId;
        },
        { timeout: 20_000, maxWait: 10_000 },
      );
      if (saleInput.lines.some((l) => l.itemId || (l.components && l.components.length))) await consumeSaleInventory(s.tenantId, s.unitId, saleId);
      scheduleDrain();
      const row = await regLoadSale(db, s.tenantId, req.idempotencyKey);
      if (!row || row.id !== saleId) return regRefuse("INTERNAL");
      return regDuplicate(s, req, row, row.createdAt.getTime() < startedAt);
    } catch (e) {
      if (e instanceof RegIntentRefusal) {
        // แพ้การแย่ง intent ให้คำขอคีย์เดียวกันที่ commit ไปแล้ว = บิลเดิม (ไม่ใช่ INTENT_CONSUMED)
        if (e.refusal.code === "INTENT_CONSUMED") {
          const row = await regLoadSale(db, s.tenantId, req.idempotencyKey);
          if (row) return regDuplicate(s, req, row, true);
        }
        return e.refusal;
      }
      const code = (e as { code?: unknown } | null)?.code;
      if (code === "P2002") {
        const row = await regLoadSale(db, s.tenantId, req.idempotencyKey);
        if (row) return regDuplicate(s, req, row, true);
        continue;
      }
      if (code === "P2034" || code === "P2028") continue;
      if (e instanceof PosSaleError) {
        if (e.code === "IDEMPOTENCY_CONFLICT") {
          const row = await regLoadSale(db, s.tenantId, req.idempotencyKey);
          return row ? regDuplicate(s, req, row, true) : regRefuse("IDEMPOTENCY_CONFLICT");
        }
        return regRefuse(e.code === "HAS_REFUNDS" ? "VALIDATION" : e.code, e.code === "STOCK_INSUFFICIENT" ? e.message : undefined);
      }
      if (e instanceof Error && e.message.startsWith("PAYMENT_MISMATCH")) return regRefuse("PAYMENT_MISMATCH");
      if (e instanceof Error && e.message.startsWith("INTENT_CONSUMED")) return regRefuse("INTENT_CONSUMED");
      throw e;
    }
  }
  return regRefuse("BUSY");
}

/** POS P1.9: ctx.deviceId — ไม่ส่ง = undefined · ผิดรูป = false */
function regDeviceOf(ctx: unknown): string | undefined | false {
  const v = regIsRecord(ctx) ? ctx.deviceId : undefined;
  if (v === undefined || v === null) return undefined;
  return isShiftDeviceId(v) ? v : false;
}

/** แถบสถานะ (สเปก §4.5) — กะของเครื่อง (P1.9) · ออฟไลน์ = P3 (0) · รอตัดสต็อก = บิลวันนี้ (เวลาไทย) ที่บรรทัดผูกสต็อกยังไม่ถูกตัดครบ */
export async function registerStatus(ctx: RegisterCtx, actor: RegisterActor, client?: RegDb): Promise<RegisterStatusResult> {
  return regGuard("registerStatus", async (): Promise<RegisterStatusResult> => {
    const db: RegDb = client ?? prisma;
    const s = await regScope(db, ctx, actor);
    if (isRegRefusal(s)) return s;
    const deviceId = regDeviceOf(ctx);
    if (deviceId === false) return regRefuse("VALIDATION", "รหัสเครื่องไม่ถูกต้อง");
    // POS P1.10 ▸ R2: heartbeat ของเครื่องที่ลงทะเบียน (ในการอ่านสถานะเดิม · throttle 30 วิ · ไม่ได้ลงทะเบียน = ไม่สร้างแถว) — ล้มไม่ทำให้สถานะล้ม ◂
    // แก้รอบ 1 F10: deviceStatus = สถานะทะเบียนของเครื่องนี้ (null = ไม่ส่ง deviceId / ไม่ได้ลงทะเบียน / heartbeat ล้ม) — ฟิลด์เสริม
    let deviceStatus: "ACTIVE" | "REVOKED" | null = null;
    if (deviceId) {
      try {
        const t = await touchPosDevice(db, s.tenantId, s.unitId, deviceId);
        deviceStatus = t.row ? t.row.status : null;
      } catch (e) {
        console.error("[pos/register] registerStatus heartbeat", e);
      }
    }
    const sh = await registerShiftStatus(db, s, deviceId);
    const user = await db.user.findUnique({ where: { id: s.actor.userId }, select: { name: true, email: true } });
    const bkk = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const dayStart = new Date(new Date(`${bkk}T00:00:00Z`).getTime() - 7 * 3600000);
    // คีย์ตัดสต็อกต่อบรรทัดของ createSale = `pos-consume-<saleId>-<lineId>` (service.ts consumeSaleInventory) — ใช้ unique (tenantId, idempotencyKey)
    // POS P1.8 ▸ R3: เฉพาะบิลขาย (docType SALE) — บรรทัดใบคืนถือ itemId ของบรรทัดเดิมแต่ไม่มีการตัดสต็อก ◂
    // P1.2 R8: บรรทัดชุดนับจนกว่าคีย์ของ "ทุก" ส่วนประกอบ `pos-consume-<saleId>-<lineId>-<invItemId>` จะมีครบ
    const pend = await db.$queryRaw<{ n: number }[]>`
      SELECT count(DISTINCT s.id)::int AS n FROM "PosSale" s JOIN "PosSaleLine" l ON l."saleId" = s.id
      WHERE s."tenantId" = ${s.tenantId} AND s."unitId" = ${s.unitId} AND s.status = 'PAID' AND s."docType" = 'SALE' AND s."createdAt" >= ${dayStart}
        AND (
          (l."itemId" IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM "InvMovement" m WHERE m."tenantId" = ${s.tenantId} AND m."idempotencyKey" = 'pos-consume-' || s.id || '-' || l.id))
          OR (l."components" IS NOT NULL AND jsonb_typeof(l."components") = 'array'
            AND EXISTS (SELECT 1 FROM jsonb_array_elements(l."components") c
              WHERE NOT EXISTS (SELECT 1 FROM "InvMovement" m WHERE m."tenantId" = ${s.tenantId}
                AND m."idempotencyKey" = 'pos-consume-' || s.id || '-' || l.id || '-' || (c->>'invItemId'))))
        )`;
    return {
      ok: true,
      unit: { id: s.unitId, name: s.unitName },
      user: { name: user?.name?.trim() || user?.email || "-", roleLabel: REG_ROLE_LABEL[s.actor.role], role: s.actor.role },
      shift: sh.shift,
      shiftRequired: sh.required,
      pendingStockCount: Number(pend[0]?.n ?? 0),
      pendingSyncCount: 0,
      deviceStatus,
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
