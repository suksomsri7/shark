// ─────────────────────────────────────────────────────────────
// trips/public-catalog.ts — ตัวอ่านสินค้าทัวร์ของหน้าจองสาธารณะ `/book/[shop]` · RUN TRIPS W1.1a (ใบสั่ง ledger/trips-briefs/W1.1.md §4.3)
//
// 🔴 อ่านอย่างเดียว: ไฟล์นี้ไม่มีคำสั่งเขียนฐานเลย · ไม่เปิดธุรกรรม · ไม่ต้องมีผู้ใช้ร้าน (ผู้เรียก = platform/trips-public หลัง resolve ร้านแล้ว)
// 🔴 ทุกคิวรีผูก tenantId + unitId (หน่วยต้องอยู่ใน ref.unitIds ซึ่งมาจากตัวแก้ร้านเท่านั้น) — ใช้ client ของ tenantDb ผ่าน unitDb ของโมดูล
// 🔴 มองเห็น = สินค้า ACTIVE + TOUR ในหน่วยของ ref เท่านั้น — กรณีอื่นทุกกรณีคืน null ตัวเดียว (ผู้เรียกแยกสาเหตุไม่ได้)
// 🔴 ที่ว่าง = listAvailability (T0.4) · ราคา = quoteTripLine (T0.5) — ไม่อ่านตารางราคา/ตัวนับที่นั่งเอง ไม่บวกเลขเอง
// 🔴 id ภายใน (รอบ/ตัวเลือก/ประเภทคน/รายการเสริม) ไม่ออกจากไฟล์นี้ — ผู้เรียกอ้างรอบด้วยลำดับ แล้วขอราคาผ่าน priceOf ที่ปิด id ไว้ข้างใน
//    (ยกเว้น findPublicProduct ที่คืน id สินค้า/หน่วยให้ด่านอัตราฝั่งเซิร์ฟเวอร์ — ไม่ใช่ข้อมูลของ VM)
// ─────────────────────────────────────────────────────────────
import type { SellCtx } from "@/lib/core/sellable";
import { listAvailability } from "./capacity-service";
import { hhmm, normalizeTimezone, utcToLocal } from "./departures-core";
import { quoteTripLine } from "./pricing";
import { localize, type I18n, type I18nText } from "./products-core";
import { unitDb } from "./resources";

export type PublicRef = { tenantId: string; unitIds: string[] };
export type PublicText = { text: string | null; fallback: boolean };
export type PublicCatalog = { products: { slug: string; title: PublicText; summary: PublicText }[]; total: number };
export type PublicSlot = {
  localDate: string;
  status: string;
  publicLeft: number;
  saleBlock: string | null;
  showLeft: boolean;
  timeText: string;
  optionName: PublicText;
  capacity: number;
  guaranteed: boolean;
  cutoffLocal: string;
};
export type PublicPrice = {
  currency: "THB";
  pax: { code: string; label: PublicText; ageMin: number | null; ageMax: number | null; seat: boolean; unitSatang: number }[];
  fees: { name: PublicText; paxCode: string | null; unitSatang: number; passThrough: boolean }[];
  extras: { name: PublicText; note: PublicText; basis: string; unitSatang: number }[];
  headline: { code: string; unitSatang: number } | null;
  vatNote: "INCLUDED" | "ADDED" | "NONE";
  cancelLadder: { daysBefore: number; refundBp: number }[];
};
export type PublicPriceResult = { ok: true; price: PublicPrice } | { ok: false; code: string };
export type PublicProduct = {
  tz: string;
  product: { slug: string; title: PublicText; summary: PublicText; itinerary: PublicText; includes: PublicText; meeting: PublicText };
  /** รอบของเดือนที่ขอ เรียงเวลาออก (ตัวกรองสาธารณะของ T0.4 แล้ว) */
  slots: PublicSlot[];
  /** ตารางราคาต่อหน่วยของรอบลำดับที่ i (ใน slots) — จาก quoteTripLine เท่านั้น */
  priceOf: (slotIndex: number) => Promise<PublicPriceResult>;
};
export type PublicCatalogQuery = { locale: string; take: number };
export type PublicProductQuery = { productSlug: string; locale: string; from: string; to: string };
export type PublicOpts = { now?: Date };

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;
const SLUG_MAX = 120;
/** ช่องทาง/ผู้กระทำของการอ่านหน้าสาธารณะ — clientKey เป็นค่าคงที่ (ไม่ใช่กุญแจเครื่อง: การอ่านไม่ผูกตัวตน) */
const VIEW_ACTOR = { kind: "PUBLIC", clientKey: "book-view" } as const;

const textOf = (json: unknown, locale: string): PublicText => {
  const l = localize(isRec(json) ? (json as I18nText | I18n) : null, locale);
  return { text: l.text, fallback: l.fallback };
};
const sectionOf = (body: unknown, key: string): unknown => (isRec(body) ? body[key] : null);

function refOk(ref: unknown): ref is PublicRef {
  return isRec(ref) && isId(ref.tenantId) && Array.isArray(ref.unitIds) && ref.unitIds.length > 0 && ref.unitIds.every(isId);
}
/** client อ่านของหน่วย (tenantDb ผูก tenantId + unitId) */
const dbOf = (tenantId: string, unitId: string) => unitDb({ tenantId, unitId, tz: "", actorId: null, actorType: "SYSTEM" });

// 🔴 เงื่อนไข "มองเห็น" ต้องเหมือนกันทุกคิวรีของไฟล์นี้: status ACTIVE + productType TOUR + หน่วยใน ref

/**
 * สินค้าที่หน้าสาธารณะมองเห็น จาก slug ของร้าน: ACTIVE + TOUR + อยู่ในหน่วยของ ref — ไม่ใช่ ⇒ null (สาเหตุเดียวทุกกรณี)
 * slug จากผู้ใช้ใช้เป็นค่าพารามิเตอร์ของคิวรีนี้เท่านั้น (ดัชนี TripProduct_tenantId_slug_key)
 */
export async function findPublicProduct(ref: PublicRef, productSlug: unknown): Promise<{ productId: string; unitId: string } | null> {
  if (!refOk(ref) || typeof productSlug !== "string" || productSlug.length === 0 || productSlug.length > SLUG_MAX || productSlug.includes("\u0000")) return null;
  const rows = await dbOf(ref.tenantId, ref.unitIds[0] ?? "").$queryRaw<{ id: string; unitId: string }[]>`
    SELECT p."id", p."unitId" FROM "TripProduct" p
    WHERE p."tenantId" = ${ref.tenantId} AND p."slug" = ${productSlug} AND p."unitId" = ANY(${ref.unitIds}::text[])
      AND p."status" = 'ACTIVE' AND p."productType" = 'TOUR'
    LIMIT 1`;
  const r = rows[0];
  return r ? { productId: r.id, unitId: r.unitId } : null;
}

/** รายการสินค้าทัวร์ที่เผยแพร่ของร้าน (ทุกหน่วยใน ref) — เรียงเวลาเผยแพร่แล้ว id · คิวรีเดียว (นับรวมในคำสั่งเดียวกัน) */
export async function loadPublicCatalog(ref: PublicRef, q: PublicCatalogQuery): Promise<PublicCatalog> {
  if (!refOk(ref)) return { products: [], total: 0 };
  const take = Number.isInteger(q.take) && q.take > 0 ? q.take : 1;
  const rows = await dbOf(ref.tenantId, ref.unitIds[0] ?? "").$queryRaw<{ slug: string; title: unknown; body: unknown; total: number }[]>`
    SELECT p."slug", p."title", p."body", (count(*) OVER ())::int AS "total" FROM "TripProduct" p
    WHERE p."tenantId" = ${ref.tenantId} AND p."unitId" = ANY(${ref.unitIds}::text[])
      AND p."status" = 'ACTIVE' AND p."productType" = 'TOUR'
    ORDER BY p."publishedAt" ASC NULLS LAST, p."id" ASC
    LIMIT ${take}`;
  return {
    products: rows.map((r) => ({ slug: r.slug, title: textOf(r.title, q.locale), summary: textOf(sectionOf(r.body, "summary"), q.locale) })),
    total: rows[0]?.total ?? 0,
  };
}

/**
 * หน้าสินค้า: เนื้อหาตามภาษา + รอบของช่วงวันที่ขอ (≤ 31 วัน · listAvailability ครั้งเดียว) + ตัวขอราคาต่อรอบ
 * มองไม่เห็น/หน่วยไม่พร้อม/บริการที่ว่างปฏิเสธ ⇒ null
 */
export async function loadPublicProduct(ref: PublicRef, q: PublicProductQuery, opts?: PublicOpts): Promise<PublicProduct | null> {
  const found = await findPublicProduct(ref, q.productSlug);
  if (!found) return null;
  const { tenantId } = ref;
  const { productId, unitId } = found;
  const now = opts?.now instanceof Date && Number.isFinite(opts.now.getTime()) ? opts.now : new Date();
  const locale = q.locale === "en" ? "en" : "th";
  const db = dbOf(tenantId, unitId);
  const ctx: SellCtx = { tenantId, unitId, channel: "WEB", actor: VIEW_ACTOR, now, locale };

  const [unit, product, av] = await Promise.all([
    db.businessUnit.findFirst({ where: { id: unitId, tenantId, type: "TRIPS", status: "ACTIVE" }, select: { settings: true } }),
    db.tripProduct.findFirst({ where: { id: productId, tenantId, unitId, status: "ACTIVE", productType: "TOUR" }, select: { slug: true, title: true, body: true, meetingPoint: true } }),
    listAvailability(ctx, { productId, from: q.from, to: q.to }),
  ]);
  if (!unit || !product || !av.ok) return null;
  const tz = normalizeTimezone(isRec(unit.settings) ? unit.settings.timezone : null);
  const rows = av.value;
  const slotIds = rows.map((r) => r.slotId);
  const [deps, options] = await Promise.all([
    slotIds.length ? db.tripDeparture.findMany({ where: { tenantId, unitId, productId, id: { in: slotIds } }, select: { id: true, endsAt: true, capacity: true, optionId: true } }) : Promise.resolve([]),
    slotIds.length ? db.tripOption.findMany({ where: { tenantId, unitId, productId }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const depById = new Map(deps.map((d) => [d.id, d]));
  const optById = new Map(options.map((o) => [o.id, o]));
  const local = (d: Date): { ymd: string; hm: string } => {
    const l = utcToLocal(tz, d);
    return { ymd: l.ymd, hm: hhmm(l.minutes) };
  };

  type Internal = { slotId: string; optionId: string | null };
  const internals: Internal[] = [];
  const slots: PublicSlot[] = [];
  for (const r of rows) {
    const dep = depById.get(r.slotId);
    if (!dep) continue; // รอบหายระหว่างสองคิวรี — ไม่แสดง (ไม่ปั้นข้อมูล)
    const cut = local(new Date(r.cutoffAt));
    internals.push({ slotId: r.slotId, optionId: dep.optionId });
    slots.push({
      localDate: r.localDate,
      status: r.status,
      publicLeft: r.publicLeft,
      saleBlock: r.saleBlock,
      showLeft: r.showLeft,
      timeText: `${local(new Date(r.startsAt)).hm}–${local(dep.endsAt).hm}`,
      optionName: textOf(dep.optionId ? optById.get(dep.optionId)?.name : null, locale),
      capacity: dep.capacity,
      guaranteed: r.status === "GUARANTEED",
      cutoffLocal: `${cut.ymd} ${cut.hm}`,
    });
  }

  const priceOf = async (slotIndex: number): Promise<PublicPriceResult> => {
    const it = Number.isInteger(slotIndex) ? internals[slotIndex] : undefined;
    if (!it) return { ok: false, code: "NOT_FOUND" };
    const [paxTypes, extraRows] = await Promise.all([
      db.tripPaxType.findMany({ where: { tenantId, unitId, productId, active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, code: true, label: true, ageMin: true, ageMax: true, countsCapacity: true } }),
      db.tripExtra.findMany({
        where: { tenantId, unitId, active: true, OR: [{ productId }, { productId: null }] },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: { id: true, productId: true, mandatory: true, basis: true, name: true, note: true },
      }),
    ]);
    const optional = extraRows.filter((e) => e.productId === productId && !e.mandatory);
    const requested = new Set(optional.map((e) => e.id));
    const quote = await quoteTripLine(ctx, {
      productKind: "TRIP",
      unitId,
      productId,
      slotId: it.slotId,
      ...(it.optionId ? { optionId: it.optionId } : {}),
      pax: paxTypes.map((p) => ({ paxTypeId: p.id, qty: 1 })),
      extras: optional.map((e) => ({ extraId: e.id, qty: 1 })),
    });
    if (!quote.ok) return { ok: false, code: quote.code };
    const v = quote.value;
    if (v.currency !== "THB") return { ok: false, code: "CURRENCY_NOT_ALLOWED" };
    const pax: PublicPrice["pax"] = [];
    for (const p of paxTypes) {
      const seat = v.items.find((i) => i.kind === "SEAT" && i.paxTypeId === p.id);
      if (!seat) return { ok: false, code: "VALIDATION" };
      pax.push({ code: p.code, label: textOf(p.label, locale), ageMin: p.ageMin, ageMax: p.ageMax, seat: p.countsCapacity, unitSatang: seat.unitMinor });
    }
    const extraById = new Map(extraRows.map((e) => [e.id, e]));
    const fees: PublicPrice["fees"] = v.items
      .filter((i) => i.kind === "EXTRA" && i.extraId !== null && !requested.has(i.extraId))
      .map((i) => ({ name: textOf(extraById.get(i.extraId ?? "")?.name, locale), paxCode: i.paxTypeCode, unitSatang: i.unitMinor, passThrough: i.passThrough }));
    const extras: PublicPrice["extras"] = [];
    for (const e of optional) {
      const line = v.items.find((i) => i.kind === "EXTRA" && i.extraId === e.id);
      if (!line) continue;
      extras.push({ name: textOf(e.name, locale), note: textOf(e.note, locale), basis: e.basis, unitSatang: line.unitMinor });
    }
    const t = v.totals;
    const first = pax[0];
    return {
      ok: true,
      price: {
        currency: "THB",
        pax,
        fees,
        extras,
        headline: first ? { code: first.code, unitSatang: first.unitSatang } : null,
        vatNote: t.vatSatang === 0 ? "NONE" : t.payableSatang > t.grossSatang - t.discountSatang ? "ADDED" : "INCLUDED",
        cancelLadder: v.cancelLadder.map((s) => ({ daysBefore: s.daysBefore, refundBp: s.refundBp })),
      },
    };
  };

  return {
    tz,
    product: {
      slug: product.slug,
      title: textOf(product.title, locale),
      summary: textOf(sectionOf(product.body, "summary"), locale),
      itinerary: textOf(sectionOf(product.body, "itinerary"), locale),
      includes: textOf(sectionOf(product.body, "includes"), locale),
      meeting: textOf(sectionOf(product.meetingPoint, "text"), locale),
    },
    slots,
    priceOf,
  };
}
