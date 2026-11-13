// ─────────────────────────────────────────────────────────────
// trips/public-catalog.ts — ตัวอ่านสินค้าทัวร์ของหน้าจองสาธารณะ `/book/[shop]` · RUN TRIPS W1.1a (ใบสั่ง ledger/trips-briefs/W1.1.md §4.3)
//
// 🔴 อ่านอย่างเดียว: ไฟล์นี้ไม่มีคำสั่งเขียนฐานเลย · ไม่เปิดธุรกรรม · ไม่ต้องมีผู้ใช้ร้าน (ผู้เรียก = platform/trips-public หลัง resolve ร้านแล้ว)
// 🔴 ทุกคิวรีผูก tenantId + unitId (หน่วยต้องอยู่ใน ref.unitIds ซึ่งมาจากตัวแก้ร้านเท่านั้น) — ใช้ client ของ tenantDb ผ่าน unitDb ของโมดูล
// 🔴 มองเห็น = สินค้า ACTIVE + TOUR ในหน่วยของ ref เท่านั้น — กรณีอื่นทุกกรณีคืน null ตัวเดียว (ผู้เรียกแยกสาเหตุไม่ได้)
// 🔴 ที่ว่าง = listAvailability (T0.4) · ราคา = quoteTripLine (T0.5) — ไม่อ่านตารางราคา/กฎราคา/ตัวนับที่นั่งเอง
// 🔴 ราคาต่อคน = ใบเสนอของ **คนเดียว ประเภทเดียว** ต่อครั้ง (มติ X3) — ราคากลุ่ม/ที่นั่งฟรีตามจำนวนไม่ปนเข้ามาในราคาต่อคน
//    ร้านคิดภาษีเพิ่มจากราคาตั้ง ⇒ ยอดต่อบรรทัด = ยอดสุทธิ + ภาษีของบรรทัดนั้นจากบริการราคา และต้องรวมได้เท่ายอดที่จ่ายจริงของใบเสนอ (มติ X11 · ตัวช่วย payableOfLine)
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
  /** เวลาออก (ISO) — ผู้เรียกใช้คิดส่วนต่างเขตเวลา ณ วันเดินทาง · ไม่ใช่ id */
  startsAt: string;
  /** เวลาออกของร้าน "HH:MM" */
  startTime: string;
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
  /** ADDED = ร้านคิดภาษีเพิ่มจากราคาตั้ง — ทุกยอดในตารางนี้รวมภาษีแล้ว */
  vatNote: "INCLUDED" | "ADDED" | "NONE";
  cancelLadder: { daysBefore: number; refundBp: number }[];
  /** บริการราคาให้ราคาต่อคนของกลุ่ม (จำนวนเท่าที่ว่างของรอบ) ต่างจากราคาคนเดียว */
  groupPricing: boolean;
};
export type PublicPriceResult = { ok: true; price: PublicPrice } | { ok: false; code: string };
export type PublicProduct = {
  tz: string;
  product: { slug: string; title: PublicText; summary: PublicText; itinerary: PublicText; includes: PublicText; meeting: PublicText };
  /** รอบของเดือนที่ขอ เรียงเวลาออก (ตัวกรองสาธารณะของ T0.4 แล้ว) */
  slots: PublicSlot[];
  /** ตารางราคาต่อหน่วยของรอบลำดับที่ i (ใน slots) — จาก quoteTripLine เท่านั้น (คนเดียวต่อใบเสนอ) */
  priceOf: (slotIndex: number) => Promise<PublicPriceResult>;
  /** ราคาเริ่มต้นต่อคนของรอบลำดับที่ i (คนเดียว · ประเภทคนแรกที่มีที่นั่งและมีราคา) — ไม่มีราคา ⇒ null */
  fromOf: (slotIndex: number) => Promise<{ code: string; unitSatang: number } | null>;
};
/** สินค้าที่ตัวแก้ของหน้าหาเจอแล้วในคำขอนี้ (ส่งต่อเพื่อไม่ค้นซ้ำ) — tz = เขตเวลาของหน่วยจากตัวแก้ร้าน */
export type PublicFound = { productId: string; unitId: string; tz?: string };
export type PublicCatalogQuery = { locale: string; take: number };
export type PublicProductQuery = { productSlug: string; locale: string; from: string; to: string; found?: PublicFound };
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
  const rows = await dbOf(ref.tenantId, ref.unitIds[0] ?? "").$queryRaw<{ slug: string; title: unknown; summary: unknown; total: number }[]>`
    SELECT p."slug", p."title", p."body"->'summary' AS "summary", (count(*) OVER ())::int AS "total" FROM "TripProduct" p
    WHERE p."tenantId" = ${ref.tenantId} AND p."unitId" = ANY(${ref.unitIds}::text[])
      AND p."status" = 'ACTIVE' AND p."productType" = 'TOUR'
    ORDER BY p."publishedAt" ASC NULLS LAST, p."id" ASC
    LIMIT ${take}`;
  return {
    products: rows.map((r) => ({ slug: r.slug, title: textOf(r.title, q.locale), summary: textOf(r.summary, q.locale) })),
    total: rows[0]?.total ?? 0,
  };
}

/**
 * หน้าสินค้า: เนื้อหาตามภาษา + รอบของช่วงวันที่ขอ (≤ 31 วัน · listAvailability ครั้งเดียว) + ตัวขอราคาต่อรอบ
 * มองไม่เห็น/หน่วยไม่พร้อม/บริการที่ว่างปฏิเสธ ⇒ null
 * `q.found` = ผลของ findPublicProduct ในคำขอเดียวกัน (ไม่ค้นซ้ำ) — เนื้อหายังอ่านด้วยเงื่อนไข "มองเห็น" ชุดเดิมเสมอ จึงใช้ข้ามด่านการมองเห็นไม่ได้
 */
export async function loadPublicProduct(ref: PublicRef, q: PublicProductQuery, opts?: PublicOpts): Promise<PublicProduct | null> {
  if (!refOk(ref)) return null;
  const given = isRec(q.found) && isId(q.found.productId) && isId(q.found.unitId) && ref.unitIds.includes(q.found.unitId) ? q.found : null;
  const found: PublicFound | null = given ?? (await findPublicProduct(ref, q.productSlug));
  if (!found) return null;
  const { tenantId } = ref;
  const { productId, unitId } = found;
  const now = opts?.now instanceof Date && Number.isFinite(opts.now.getTime()) ? opts.now : new Date();
  const locale = q.locale === "en" ? "en" : "th";
  const db = dbOf(tenantId, unitId);
  const ctx: SellCtx = { tenantId, unitId, channel: "WEB", actor: VIEW_ACTOR, now, locale };
  const givenTz = typeof found.tz === "string" && found.tz !== "" ? found.tz : null;

  const [unit, product, av] = await Promise.all([
    givenTz !== null ? Promise.resolve(null) : db.businessUnit.findFirst({ where: { id: unitId, tenantId, type: "TRIPS", status: "ACTIVE" }, select: { settings: true } }),
    db.tripProduct.findFirst({ where: { id: productId, tenantId, unitId, status: "ACTIVE", productType: "TOUR" }, select: { slug: true, title: true, body: true, meetingPoint: true } }),
    listAvailability(ctx, { productId, from: q.from, to: q.to }),
  ]);
  if ((givenTz === null && !unit) || !product || !av.ok) return null;
  const tz = normalizeTimezone(givenTz ?? (unit && isRec(unit.settings) ? unit.settings.timezone : null));
  const rows = [...av.value].sort((a, b) => (a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : 0));
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

  type Internal = { slotId: string; optionId: string | null; left: number };
  const internals: Internal[] = [];
  const slots: PublicSlot[] = [];
  for (const r of rows) {
    const dep = depById.get(r.slotId);
    if (!dep) continue; // รอบหายระหว่างสองคิวรี — ไม่แสดง (ไม่ปั้นข้อมูล)
    const cut = local(new Date(r.cutoffAt));
    const start = local(new Date(r.startsAt)).hm;
    internals.push({ slotId: r.slotId, optionId: dep.optionId, left: r.saleBlock === null && Number.isInteger(r.publicLeft) && r.publicLeft > 0 ? r.publicLeft : 0 });
    slots.push({
      startsAt: r.startsAt,
      startTime: start,
      localDate: r.localDate,
      status: r.status,
      publicLeft: r.publicLeft,
      saleBlock: r.saleBlock,
      showLeft: r.showLeft,
      timeText: `${start}–${local(dep.endsAt).hm}`,
      optionName: textOf(dep.optionId ? optById.get(dep.optionId)?.name : null, locale),
      capacity: dep.capacity,
      guaranteed: r.status === "GUARANTEED",
      cutoffLocal: `${cut.ymd} ${cut.hm}`,
    });
  }

  // ── ราคา: ทุกยอดมาจาก quoteTripLine — ใบเสนอของคนเดียว ประเภทเดียว ต่อครั้ง ──
  type PaxRow = { id: string; code: string; label: unknown; ageMin: number | null; ageMax: number | null; countsCapacity: boolean };
  type ExtraRow = { id: string; productId: string | null; mandatory: boolean; basis: string; name: unknown; note: unknown };
  let catalog: Promise<{ paxTypes: PaxRow[]; extraRows: ExtraRow[] }> | null = null;
  /** ประเภทคน + รายการเสริมของสินค้า (อ่านครั้งเดียวต่อคำขอ) */
  const catalogOf = (): Promise<{ paxTypes: PaxRow[]; extraRows: ExtraRow[] }> => {
    catalog ??= Promise.all([
      db.tripPaxType.findMany({ where: { tenantId, unitId, productId, active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, code: true, label: true, ageMin: true, ageMax: true, countsCapacity: true } }),
      db.tripExtra.findMany({
        where: { tenantId, unitId, active: true, OR: [{ productId }, { productId: null }] },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: { id: true, productId: true, mandatory: true, basis: true, name: true, note: true },
      }),
    ]).then(([paxTypes, extraRows]) => ({ paxTypes, extraRows }));
    return catalog;
  };
  type Quote = Extract<Awaited<ReturnType<typeof quoteTripLine>>, { ok: true }>["value"];
  type Line = Quote["items"][number];
  type Quoted = { ok: true; v: Quote; added: boolean } | { ok: false; code: string };
  /** ใบเสนอของรอบนี้ — สกุลต้องเป็นบาท · ร้านคิดภาษีเพิ่ม ⇒ ยอดต่อบรรทัดต้องรวมได้เท่ายอดที่จ่ายจริงของบริการ ไม่งั้นถือว่าไม่มีราคา (ไม่ปั้นเลข) */
  const quoteOf = async (it: Internal, pax: { paxTypeId: string; qty: number }[], extras: { extraId: string; qty: number }[]): Promise<Quoted> => {
    const r = await quoteTripLine(ctx, { productKind: "TRIP", unitId, productId, slotId: it.slotId, ...(it.optionId ? { optionId: it.optionId } : {}), pax, extras });
    if (!r.ok) return { ok: false, code: r.code };
    const v = r.value;
    if (v.currency !== "THB") return { ok: false, code: "CURRENCY_NOT_ALLOWED" };
    const t = v.totals;
    const added = t.vatSatang !== 0 && t.payableSatang > t.grossSatang - t.discountSatang;
    if (added && v.items.reduce((sum, i) => sum + payableOfLine(i), 0) !== t.payableSatang) return { ok: false, code: "VALIDATION" };
    return { ok: true, v, added };
  };
  /** ยอดที่ลูกค้าจ่ายจริงของบรรทัดจำนวน 1 (สุทธิ + ภาษีของบรรทัด — ทั้งสองตัวมาจากบริการราคา) */
  const payableOfLine = (i: Line): number => i.amountSatang + i.vatSatang;
  /** ราคาต่อหน่วยที่แสดง: ร้านคิดภาษีเพิ่ม ⇒ ยอดจ่ายจริงของบรรทัด (จำนวน 1) · ไม่งั้น ⇒ ราคาต่อหน่วยของบริการตรง ๆ */
  const unitOf = (i: Line, added: boolean): number => (added && i.qty === 1 ? payableOfLine(i) : i.unitMinor);
  const noteOf = (v: Quote, added: boolean): PublicPrice["vatNote"] => (v.totals.vatSatang === 0 ? "NONE" : added ? "ADDED" : "INCLUDED");
  const seatLine = (v: Quote, paxTypeId: string): Line | undefined => v.items.find((i) => i.kind === "SEAT" && i.paxTypeId === paxTypeId && i.qty === 1);

  const fromOf = async (slotIndex: number): Promise<{ code: string; unitSatang: number } | null> => {
    const it = Number.isInteger(slotIndex) ? internals[slotIndex] : undefined;
    if (!it) return null;
    const { paxTypes } = await catalogOf();
    for (const p of paxTypes.filter((x) => x.countsCapacity)) {
      const r = await quoteOf(it, [{ paxTypeId: p.id, qty: 1 }], []);
      const line = r.ok ? seatLine(r.v, p.id) : undefined;
      if (r.ok && line) return { code: p.code, unitSatang: unitOf(line, r.added) };
    }
    return null;
  };

  const priceOf = async (slotIndex: number): Promise<PublicPriceResult> => {
    const it = Number.isInteger(slotIndex) ? internals[slotIndex] : undefined;
    if (!it) return { ok: false, code: "NOT_FOUND" };
    const { paxTypes, extraRows } = await catalogOf();
    const optional = extraRows.filter((e) => e.productId === productId && !e.mandatory);
    const extraById = new Map(extraRows.map((e) => [e.id, e]));
    // 1) คนเดียวต่อประเภทคน (ไม่ขอรายการเสริม ⇒ บรรทัดเสริมที่ได้ = รายการบังคับที่บริการเติมเอง)
    const solo = await Promise.all(paxTypes.map((p) => quoteOf(it, [{ paxTypeId: p.id, qty: 1 }], [])));
    const lead =
      paxTypes.find((p, k) => {
        const r = solo[k];
        return p.countsCapacity && r !== undefined && r.ok && seatLine(r.v, p.id) !== undefined;
      }) ?? null;
    type Priced = { p: PaxRow; v: Quote; added: boolean; line: Line };
    const priced: Priced[] = [];
    let firstFail: string | null = null;
    for (let k = 0; k < paxTypes.length; k++) {
      const p = paxTypes[k];
      let r = solo[k];
      if (!p || !r) continue;
      // ประเภทคนที่ไม่ใช้ที่นั่ง (ทารก) ที่บริการไม่ให้ราคาเมื่อไปคนเดียว ⇒ ขอคู่กับผู้เดินทางหลัก 1 คน (จำนวนที่นั่งยังเป็น 1 — ราคากลุ่มไม่ปน)
      if (!r.ok && !p.countsCapacity && lead && lead.id !== p.id) r = await quoteOf(it, [{ paxTypeId: lead.id, qty: 1 }, { paxTypeId: p.id, qty: 1 }], []);
      const line = r.ok ? seatLine(r.v, p.id) : undefined;
      if (!r.ok || !line) {
        firstFail ??= r.ok ? "VALIDATION" : r.code;
        continue; // ประเภทคนที่ยังไม่มีราคา ⇒ ไม่แสดงเฉพาะแถวนั้น (มติ X7)
      }
      priced.push({ p, v: r.v, added: r.added, line });
    }
    if (!priced.length) return { ok: false, code: firstFail ?? "VALIDATION" };
    const head = priced.find((x) => x.p.countsCapacity) ?? priced[0];
    if (!head) return { ok: false, code: "VALIDATION" };

    const pax: PublicPrice["pax"] = priced.map((x) => ({ code: x.p.code, label: textOf(x.p.label, locale), ageMin: x.p.ageMin, ageMax: x.p.ageMax, seat: x.p.countsCapacity, unitSatang: unitOf(x.line, x.added) }));
    const fees: PublicPrice["fees"] = [];
    const seenFee = new Set<string>();
    for (const x of priced) {
      for (const i of x.v.items) {
        if (i.kind !== "EXTRA" || i.extraId === null || i.qty !== 1) continue;
        const key = `${i.extraId}|${i.paxTypeCode ?? ""}`;
        if (seenFee.has(key)) continue;
        seenFee.add(key);
        fees.push({ name: textOf(extraById.get(i.extraId)?.name, locale), paxCode: i.paxTypeCode, unitSatang: unitOf(i, x.added), passThrough: i.passThrough });
      }
    }
    // 2) รายการเสริมไม่บังคับ: ขอคู่กับผู้เดินทางหลัก 1 คน อย่างละ 1 · 3) ราคากลุ่ม: ผู้เดินทางหลักจำนวนเท่าที่ว่างของรอบ เทียบราคาต่อคนกับคนเดียว
    const [withExtras, group] = await Promise.all([
      optional.length ? quoteOf(it, [{ paxTypeId: head.p.id, qty: 1 }], optional.map((e) => ({ extraId: e.id, qty: 1 }))) : Promise.resolve(null),
      head.p.countsCapacity && it.left >= 2 ? quoteOf(it, [{ paxTypeId: head.p.id, qty: it.left }], []) : Promise.resolve(null),
    ]);
    const extras: PublicPrice["extras"] = [];
    if (withExtras && withExtras.ok) {
      for (const e of optional) {
        const line = withExtras.v.items.find((i) => i.kind === "EXTRA" && i.extraId === e.id && i.qty === 1);
        if (!line) continue;
        extras.push({ name: textOf(e.name, locale), note: textOf(e.note, locale), basis: e.basis, unitSatang: unitOf(line, withExtras.added) });
      }
    }
    const groupPricing = group !== null && group.ok && group.v.items.some((i) => i.kind === "SEAT" && i.paxTypeId === head.p.id && i.unitMinor !== head.line.unitMinor);
    const first = pax.find((x) => x.seat) ?? pax[0];
    return {
      ok: true,
      price: {
        currency: "THB",
        pax,
        fees,
        extras,
        headline: first ? { code: first.code, unitSatang: first.unitSatang } : null,
        vatNote: noteOf(head.v, head.added),
        cancelLadder: head.v.cancelLadder.map((s) => ({ daysBefore: s.daysBefore, refundBp: s.refundBp })),
        groupPricing,
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
    fromOf,
  };
}
