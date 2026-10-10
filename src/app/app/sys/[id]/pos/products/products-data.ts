// products-data.ts — ตัวโหลดข้อมูลฝั่งเซิร์ฟเวอร์ของจอ 06 "สินค้าและเมนู" + จอโปรราคา (POS P2.2U · มติ 1/2/4)
//   อ่านอย่างเดียว: catalog.listForUnit ต่อสาขา (แถวราคาตามช่องทางของทุกสาขา = รวมทุกสาขาที่โหลด) · ช่องทางขายที่เปิดอยู่ของระบบ · หมวด ·
//   โปรราคา (price-rule.listPriceRules) — ไม่เขียนอะไร (ช่องทาง builtin ที่สาขายังไม่มีแถว = ชื่อตั้งต้นจาก channel-shared ไม่สร้างแถว)
// 🔴 ไฟล์นี้ใช้จาก server component เท่านั้น (import catalog.ts / price-rule.ts / prisma) — client import ไม่ได้
// 🔴 ผลส่งให้ client เป็นข้อมูลล้วน (ไม่มี Date · เงินสตางค์ Int)

import { prisma } from "@/lib/core/db";
import { CatalogError, listForUnit, type PosProductView } from "@/lib/modules/pos/catalog";
import { listPriceRules } from "@/lib/modules/pos/price-rule";
import { CHANNEL_BUILTIN_CODES, CHANNEL_BUILTIN_NAMES, type ChannelKind, type ChannelPayout } from "@/lib/modules/pos/channel-shared";
import type { PriceRuleItem } from "@/lib/modules/pos/price-shared";
import type { RegisterActor } from "@/lib/modules/pos/register-shared";

/** ช่องทางที่จอ 06 ใช้ (รวมตามรหัสข้ามสาขา — ชื่อ/payout ของสาขาแรกตามลำดับแสดง) */
export type ProductsChannel = { code: string; name: string; kind: ChannelKind; payout: ChannelPayout; unitIds: string[] };
export type ProductsPriceRow = { channelCode: string | null; unitId: string | null; priceSatang: number | null; notSold: boolean };
export type ProductsRow = {
  id: string;
  name: string;
  nameEn: string | null;
  sku: string | null;
  kind: string;
  categoryId: string | null;
  basePriceSatang: number | null;
  soldByWeight: boolean;
  /** สินค้าของสาขาเดียว (null = ทุกสาขา) */
  unitId: string | null;
  optionCount: number;
  variantCount: number;
  trackStock: boolean;
  /** สาขาที่สินค้านี้อยู่ในรายการ (ขายได้/เห็นได้ที่สาขานั้น) → สต็อก/ขายได้ */
  stock: Record<string, number>;
  available: Record<string, boolean>;
  /** แถวราคาตามช่องทาง/สาขาทั้งชุดของสินค้า (ทุกสาขาที่โหลด) — ตัวแก้ส่งกลับทั้งชุด (setChannelPrices แทนทั้งชุด) */
  rows: ProductsPriceRow[];
};
export type ProductsData = {
  units: { id: string; name: string }[];
  channels: ProductsChannel[];
  categories: { id: string; name: string; nameEn: string | null }[];
  products: ProductsRow[];
  rules: PriceRuleItem[];
  /** โหลดไม่ครบ (เกินเพดานต่อสาขา) */
  truncated: boolean;
};

const PER_UNIT_MAX = 2_000;
const PAGE = 500;

async function unitProducts(tenantId: string, systemId: string, userId: string, unitId: string): Promise<{ items: PosProductView[]; truncated: boolean }> {
  const out: PosProductView[] = [];
  let cursor: string | null = null;
  try {
    do {
      const r: { items: PosProductView[]; nextCursor: string | null } = await listForUnit({ tenantId, systemId, actorUserId: userId }, unitId, { limit: PAGE, cursor });
      out.push(...r.items);
      cursor = r.nextCursor;
    } while (cursor && out.length < PER_UNIT_MAX);
  } catch (e) {
    // สาขาที่ผู้ใช้เข้าไม่ได้/ไม่ผูกแล้ว = ข้ามสาขานั้น (หน้าไม่ล้ม)
    if (e instanceof CatalogError) return { items: out, truncated: false };
    throw e;
  }
  return { items: out, truncated: !!cursor };
}

/** ข้อมูลทั้งจอ — สาขาที่ส่งมา = สาขาที่ผู้ใช้เห็น (ผู้เรียกกรองแล้ว) */
export async function loadProductsData(
  scope: { tenantId: string; systemId: string },
  actor: RegisterActor,
  units: { id: string; name: string }[],
  opts: { rules?: boolean } = {},
): Promise<ProductsData> {
  const { tenantId, systemId } = scope;
  const per = await Promise.all(units.map((u) => unitProducts(tenantId, systemId, actor.userId, u.id)));
  const byId = new Map<string, ProductsRow>();
  const rowKeys = new Map<string, Set<string>>();
  per.forEach((res, i) => {
    const unitId = units[i]!.id;
    for (const p of res.items) {
      let row = byId.get(p.id);
      if (!row) {
        row = {
          id: p.id,
          name: p.name,
          nameEn: p.nameEn,
          sku: p.sku,
          kind: p.kind,
          categoryId: p.categoryId,
          basePriceSatang: p.basePriceSatang,
          soldByWeight: p.soldByWeight,
          unitId: p.unitId,
          optionCount: p.optionGroups.length,
          variantCount: p.variants.length,
          trackStock: p.trackStock,
          stock: {},
          available: {},
          rows: [],
        };
        if (p.parentId === null) byId.set(p.id, row);
        else continue; // ตัวแปรใช้แถวราคาของแม่ (แก้ตัวแปรรายตัว = แท็บตัวเลือก P2.3)
        rowKeys.set(p.id, new Set());
      }
      if (typeof p.stock[unitId] === "number") row.stock[unitId] = p.stock[unitId]!;
      row.available[unitId] = p.availability[unitId] !== false;
      row.variantCount = Math.max(row.variantCount, p.variants.length);
      const seen = rowKeys.get(p.id)!;
      for (const cp of p.channelPrices) {
        const k = `${cp.channelCode ?? ""}|${cp.unitId ?? ""}`;
        if (seen.has(k)) continue;
        seen.add(k);
        row.rows.push({ channelCode: cp.channelCode, unitId: cp.unitId, priceSatang: cp.priceSatang, notSold: cp.notSold });
      }
    }
  });

  const unitIds = units.map((u) => u.id);
  const [chRows, cats, rules] = await Promise.all([
    unitIds.length
      ? prisma.salesChannel.findMany({
          where: { tenantId, systemId, unitId: { in: unitIds }, archivedAt: null, active: true },
          select: { code: true, name: true, kind: true, payout: true, unitId: true, sortOrder: true, createdAt: true },
        })
      : Promise.resolve([]),
    prisma.posCategory.findMany({ where: { tenantId, systemId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, nameEn: true } }),
    opts.rules === false || !unitIds.length
      ? Promise.resolve([] as PriceRuleItem[])
      : listPriceRules({ tenantId, systemId, unitId: unitIds[0]! }, actor, {}).then((r) => (r.ok ? r.items : [])),
  ]);

  // ช่องทาง: builtin ตามลำดับคงที่ (สาขาที่ยังไม่มีแถว = ชื่อตั้งต้น) แล้วช่องทางอื่นตาม sortOrder → createdAt → รหัส
  const rank = (code: string) => {
    const i = (CHANNEL_BUILTIN_CODES as readonly string[]).indexOf(code);
    return i < 0 ? 99 : i;
  };
  const sorted = [...chRows].sort((a, b) => rank(a.code) - rank(b.code) || a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime() || a.code.localeCompare(b.code));
  const channels = new Map<string, ProductsChannel>();
  for (const c of sorted) {
    const cur = channels.get(c.code);
    if (cur) cur.unitIds.push(c.unitId);
    else channels.set(c.code, { code: c.code, name: c.name, kind: c.kind, payout: c.payout, unitIds: [c.unitId] });
  }
  for (const code of CHANNEL_BUILTIN_CODES) {
    const unitsWithout = unitIds.filter((u) => !chRows.some((r) => r.code === code && r.unitId === u));
    // สาขาที่ยังไม่เคยเปิดช่องทาง (ยังไม่มีแถว builtin เลย) = ใช้ได้ตามค่าตั้งต้น
    const fresh = unitsWithout.filter((u) => !chRows.some((r) => r.unitId === u && r.kind === "BUILTIN"));
    if (!fresh.length) continue;
    const cur = channels.get(code);
    if (cur) cur.unitIds.push(...fresh);
    else channels.set(code, { code, name: CHANNEL_BUILTIN_NAMES[code], kind: "BUILTIN", payout: "DIRECT", unitIds: fresh });
  }
  const chList = [...channels.values()].sort((a, b) => rank(a.code) - rank(b.code));
  // คงลำดับของช่องทางที่ไม่ใช่ builtin ตาม sorted (sort ของ JS เสถียร)
  return {
    units,
    channels: chList,
    categories: cats,
    products: [...byId.values()],
    rules,
    truncated: per.some((r) => r.truncated),
  };
}
