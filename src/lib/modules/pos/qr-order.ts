// qr-order.ts — ประตูสาธารณะ QR ของ POS · POS P2.7 S (§1 a b · §2 · §3 · §10 มติ 1 3 4 5 6 9 11 13 · CD-O1 O6 O7)
//   /q/t/<qrToken>  QR โต๊ะ (โทเคนเดิมของ RestaurantTable — สติกเกอร์ที่พิมพ์ไว้ใช้ต่อได้): เมนูราคาช่องทาง QR_TABLE · ส่งรอบ · เรียกพนักงาน · ขอเช็คบิล · บิล + พร้อมเพย์ · แจ้งโอน
//   /q/<linkToken>  ลิงก์สั่งล่วงหน้า (PosOrderLink 16 ตัว): เมนูราคา QR_ORDER · ตะกร้า · ชื่อ + เบอร์ · จ่ายก่อน (Beam ถ้าร้านเปิด ไม่งั้น QR พร้อมเพย์นิ่ง)
//   /q/o/<orderToken> หน้าสถานะ (PosOrder.publicToken 12 ตัว): QR + นับถอยหลัง · เงินเข้า · ร้านรับ/พร้อม · หมดเวลา · ปฏิเสธ
//
// 🔴 ไฟล์นี้ "ประสานงาน" อย่างเดียว (มติ 13): ไม่เขียน PosOrder*/PosOrderLink/PosPaymentIntent/Restaurant*/TableSession/MenuItem เอง —
//    ออเดอร์ = order.ts · ใบขอรับเงิน = payment-intent.ts · รอบ/session/คำขอ = โมดูลร้านอาหารผ่าน `import("@/lib/modules/restaurant")` · ตัวนับเมนู event = catalog-legacy
// 🔴 ไม่มี session/ไม่ import auth: สิทธิ์ = โทเคนใน URL (capability) · โทเคนผิดรูป/ไม่รู้จัก/ถูกเปลี่ยน/ปิด/ร้านอื่น/ประตูอื่น = TOKEN_INVALID รูปเดียวกันทุกกรณี
// 🔴 อ่าน (เปิดหน้า · โพล · quote) = 0 เขียน (มติ 11 · ข้อบกพร่อง ① ของประตูเดิม) — ยกเว้นหน้าสถานะที่เลยเวลาจ่าย = ปิดออเดอร์ครั้งเดียว (S2 ขี้เกียจ)
// 🔴 ส่ง (สั่ง · ส่งรอบ · เรียก · แจ้งโอน) = เพดาน DB 10 ครั้ง/นาที/IP + ในหน่วยความจำ 60 ครั้ง/นาที/โทเคน (CD-O6) · ไม่มีเพดานกับการอ่าน
// 🔴 ราคา = ตัวแก้ราคาเดียวกับหน้าขาย (price.ts ชั้นราคา/ช่องทาง/โปร · ตัวตรวจตัวเลือก regResolveOptions ของ register-shared · priceCart · ค่าบริการ POS
//    เฉพาะ QR_TABLE · ไม่มีสมาชิก/คูปอง/ส่วนลด) ⇒ ยอดบนมือถือ = ยอดหน้าขายของช่องทางเดียวกัน (PO4) · บิลแขก = registerTableBillPreview ด้วยผู้กระทำ
//    สังเคราะห์อ่านอย่างเดียว (CD-O1 · ข้อบกพร่อง ② ยอดปัดลงของ billPreview เดิม) — ไม่มี hunk ใน register.ts นอกจาก CD4
// 🔴 คำปฏิเสธ = {ok:false, code, messageKey, lineIndex?, retryAfterSec?} (qr-order-shared · ไม่มีข้อความไทยของเซิร์ฟเวอร์/รหัสภายในหลุดถึงหน้า)
// สัญญา: ledger/pos-briefs/pos-brief-P2.7.md · ตารางชื่อ ledger/wo-notes/pos-P2.7-oracle.md · ข้อสอบ scripts/qc-pos-p2.7.mts

import { createHash } from "node:crypto";
import { Prisma, type PosProduct, type SalesChannel } from "@prisma/client";
import { prisma } from "./db";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { checkRateLimit } from "@/lib/core/rate-limit";
import { isValidPromptPayId, promptpayPayload } from "@/lib/payment/promptpay";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { loadPriceBook, priceOf, type PriceBook } from "./price";
import type { PriceSource } from "./price-shared";
import { menuSoldOutIds, rowAvailable } from "./catalog";
import { emitGuestRoundStockFlipsInTx } from "./catalog-legacy";
import { priceCart } from "./pricing-shared";
import { regResolveOptions, type RegOptGroup, type RegPickedOption, type RegisterActor } from "./register-shared";
import { registerTableBillPreview } from "./register";
import { posPaymentSettings } from "./payment-settings";
import { orderIntentUnused, orderPaymentReadiness, prepareOrderIntent, type PaymentIntentDeps, type PreparedOrderIntent } from "./payment-intent";
import { promptpayIdForUnit } from "./payment-intent-shared";
import { verifyChatTag } from "./chat-tag"; // POS P3.7 ▸ R8 ประตู B: แท็กห้องแชทบนลิงก์สั่งล่วงหน้า ◂
import { maskPhone, ORDER_PREP_DEFAULT_MIN, type OrderLineOption } from "./order-shared";
import { receiptShopHeader } from "./receipt"; // POS P2.7U ▸ หัวร้านของหน้าสาธารณะ (อ่านอย่างเดียว) ◂
import * as orders from "./order";
import type { GuestTableView } from "@/lib/modules/restaurant";
import {
  QR_ROUND_DEDUPE_MS,
  QR_SUBMIT_PER_IP_PER_MIN,
  QR_SUBMIT_PER_TOKEN_PER_MIN,
  isLinkToken,
  isOrderToken,
  isTableQrToken,
  parseQrCart,
  parseQrPreorder,
  parseQrTableRound,
  qrCartHash,
  qrRefuse,
  sinceVer,
  type QrClosedReason,
  type QrLinkDoorResult,
  type QrMenuGroup,
  type QrMenuItem,
  type QrOkResult,
  type QrOrderStatusResult,
  type QrOrderStatusView,
  type QrParsedLine,
  type QrParsedPreorder,
  type QrPlacePreorderResult,
  type QrPlaceRoundResult,
  type QrQuoteResult,
  type QrRefusal,
  type QrRefusalCode,
  type QrRound,
  type QrShopHeader,
  type QrTableBill,
  type QrTableBillResult,
  type QrTableDoorResult,
  type QrTablePollResult,
  type QrTableView,
} from "./qr-order-shared";

type RestFacade = typeof import("@/lib/modules/restaurant");
const restaurant = (): Promise<RestFacade> => import("@/lib/modules/restaurant");

const MIN = 60_000;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isRefusal = (v: unknown): v is { ok: false } => isRecord(v) && v.ok === false;
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** ขอบของทุกประตู — ขัดข้องที่ไม่คาดคิด = INTERNAL (ไม่มีรายละเอียด) */
async function qrGuard<T>(name: string, body: () => Promise<T>): Promise<T | QrRefusal> {
  try {
    return await body();
  } catch (e) {
    console.error(`[pos/qr-order] ${name} INTERNAL`, e);
    return qrRefuse("INTERNAL");
  }
}
const TOKEN_INVALID = (): QrRefusal => qrRefuse("TOKEN_INVALID");

// ═══════════ สาขาที่ผูก POS (ประตูทำงานเฉพาะสาขาที่ผูก POS ตรง ๆ · มติ 11) ═══════════
type PosUnit = { tenantId: string; systemId: string; unitId: string; unitName: string };
async function posUnitOf(tenantId: string, unitId: string, systemId?: string): Promise<PosUnit | null> {
  const link = await prisma.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId, unitId, type: "POS" } }, select: { systemId: true } });
  if (!link || (systemId && link.systemId !== systemId)) return null;
  const [sys, unit] = await Promise.all([
    prisma.appSystem.findFirst({ where: { id: link.systemId, tenantId, type: "POS", active: true }, select: { id: true } }),
    prisma.businessUnit.findFirst({ where: { id: unitId, tenantId, status: { not: "ARCHIVED" } }, select: { name: true } }),
  ]);
  if (!sys || !unit) return null;
  return { tenantId, systemId: link.systemId, unitId, unitName: unit.name };
}

// ═══════════ เพดานการส่ง (มติ 11 · CD-O6) ═══════════
/** ตัวกันถล่มต่อโทเคน (ในหน่วยความจำ) แล้วเพดาน DB ต่อ IP — คีย์ DB `pos:qrSubmit:<ip>` (ไม่ใช้ถังของบัญชี: fitness F2.2 ห้าม import account/rate-limit ตรง · ตัวเลขเดียวกับ publicSubmit) */
async function submitGuard(token: string, ip: unknown): Promise<QrRefusal | null> {
  const t = checkRateLimit(`pos-qr:token:${token}`, { limit: QR_SUBMIT_PER_TOKEN_PER_MIN, windowMs: MIN });
  if (!t.ok) return qrRefuse("RATE_LIMITED", { retryAfterSec: t.retryAfterSec ?? 60 });
  const who = typeof ip === "string" && ip.trim() ? ip.trim().slice(0, 100) : "unknown";
  const v = await checkRateLimitDb(`pos:qrSubmit:${who}`, { limit: QR_SUBMIT_PER_IP_PER_MIN, windowMs: MIN });
  if (!v.ok) return qrRefuse("RATE_LIMITED", { retryAfterSec: v.retryAfterSec ?? 60 });
  return null;
}
const ipOf = (meta: unknown): string => (isRecord(meta) && typeof meta.ip === "string" ? meta.ip : "unknown");

// POS P2.7U ▸ หัวร้านของหน้าสาธารณะ = หัวใบเสร็จ (ชื่อร้าน · โลโก้ · สาขา · อ่านอย่างเดียว) — อ่านไม่ได้ = ชื่อสาขา (หน้าไม่ล้ม) ◂
async function shopOf(tenantId: string, systemId: string, unitId: string, unitName: string): Promise<QrShopHeader> {
  const h = await receiptShopHeader(prisma, tenantId, systemId, unitId).catch(() => null);
  return { name: h?.shopName || unitName, logoUrl: h?.logoUrl ?? null, branch: h?.branchName || unitName };
}

// ═══════════ ประตูเปิด/ปิด (มติ 11: ช่องทาง active ∧ ไม่พักรับ ∧ ครัวเปิด ∧ ผูก POS — นิยาม "ช่องทางปิด" ของ QR เท่านั้น) ═══════════
type Door = { open: boolean; closedReason?: QrClosedReason; channel: SalesChannel | null };
async function doorOf(u: PosUnit, code: "QR_TABLE" | "QR_ORDER", needPayment: boolean, deps?: PaymentIntentDeps): Promise<Door> {
  // POS P2.7 ▸ fix2 R1 F4: อ่านอย่างเดียว (มติ 11 = 0 เขียน) — สาขาเก่าที่ยังไม่มีแถว builtin = ปิด (แถวเกิดเมื่อพนักงานเปิดจอ/หน้าขาย · ensureUnitChannels) ◂
  const ch = await prisma.salesChannel.findFirst({ where: { tenantId: u.tenantId, unitId: u.unitId, code, kind: "BUILTIN", archivedAt: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  if (!ch || !ch.active) return { open: false, closedReason: "CHANNEL_OFF", channel: ch };
  if (ch.pausedUntil && ch.pausedUntil.getTime() > Date.now()) return { open: false, closedReason: "CHANNEL_PAUSED", channel: ch };
  const k = await (await restaurant()).guestKitchenForPos(prisma, { tenantId: u.tenantId, unitId: u.unitId });
  if (!k.open) return { open: false, closedReason: k.paused ? "KITCHEN_PAUSED" : "KITCHEN_CLOSED", channel: ch };
  if (needPayment && !(await orderPaymentReadiness(u, deps)).ready) return { open: false, closedReason: "PAYMENT_NOT_READY", channel: ch };
  return { open: true, channel: ch };
}

// ═══════════ แคตตาล็อกของประตู (อ่านอย่างเดียว · กติกามองเห็นแบบหน้าขาย) ═══════════
type Catalog = { rows: Map<string, PosProduct>; book: PriceBook; soldOut: Set<string>; optCat: Map<string, RegOptGroup[]>; cats: Map<string, { name: string; sortOrder: number }> };
/**
 * สินค้าที่ประตูขายได้ที่สาขานี้: ระบบ POS นี้ · ไม่เก็บถาวร · ทุกสาขาหรือสาขานี้ · เมนู/สินค้า (ไม่รวมบริการ/ชุด/สินค้าชั่ง/ตัวแปร — ขายที่หน้าขาย) ·
 * ผูกคลังได้เฉพาะคลังของสาขานี้ · แม่ที่มีตัวแปรไม่อยู่ (ต้องเลือกตัวแปรที่หน้าขาย) · หมวดที่ซ่อนไม่อยู่ · ids = เฉพาะสินค้าที่ขอ
 */
async function catalogOf(u: PosUnit, ids?: string[]): Promise<Catalog> {
  const inv = await prisma.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId: u.tenantId, unitId: u.unitId, type: "INVENTORY" } }, select: { systemId: true } });
  let rows = await prisma.posProduct.findMany({
    where: {
      tenantId: u.tenantId,
      systemId: u.systemId,
      archivedAt: null,
      OR: [{ unitId: null }, { unitId: u.unitId }],
      kind: { in: ["MENU", "PRODUCT"] },
      parentId: null,
      soldByWeight: false,
      ...(ids ? { id: { in: [...new Set(ids)] } } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    take: 500,
  });
  const invIds = [...new Set(rows.map((r) => r.invItemId).filter((x): x is string => !!x))];
  const here = new Set(invIds.length && inv ? (await prisma.invItem.findMany({ where: { tenantId: u.tenantId, systemId: inv.systemId, id: { in: invIds } }, select: { id: true } })).map((x) => x.id) : []);
  rows = rows.filter((r) => !r.invItemId || here.has(r.invItemId));
  const pids = rows.map((r) => r.id);
  const withKids = new Set(
    pids.length ? (await prisma.posProduct.findMany({ where: { tenantId: u.tenantId, parentId: { in: pids }, archivedAt: null }, select: { parentId: true }, distinct: ["parentId"] })).map((x) => x.parentId as string) : [],
  );
  const catIds = [...new Set(rows.map((r) => r.categoryId).filter((x): x is string => !!x))];
  const catRows = catIds.length ? await prisma.posCategory.findMany({ where: { tenantId: u.tenantId, id: { in: catIds } }, select: { id: true, name: true, sortOrder: true, isVisible: true, archivedAt: true } }) : [];
  const hidden = new Set(catRows.filter((c) => !c.isVisible || c.archivedAt).map((c) => c.id));
  rows = rows.filter((r) => !withKids.has(r.id) && !(r.categoryId && hidden.has(r.categoryId)));
  const [book, soldOut, optCat] = await Promise.all([loadPriceBook(prisma, u, rows, new Date()), menuSoldOutIds(u.tenantId, rows, prisma), optionCatalog(u.tenantId, rows.map((r) => r.id))]);
  return { rows: new Map(rows.map((r) => [r.id, r])), book, soldOut, optCat, cats: new Map(catRows.map((c) => [c.id, { name: c.name, sortOrder: c.sortOrder }])) };
}

/** กลุ่มตัวเลือกของสินค้า (สด · ลำดับผูก) — รูปเดียวกับ regOptionCatalog ของหน้าขาย (ตัวตรวจ regResolveOptions ตัวเดียวกัน) */
async function optionCatalog(tenantId: string, productIds: string[]): Promise<Map<string, RegOptGroup[]>> {
  const out = new Map<string, RegOptGroup[]>();
  if (!productIds.length) return out;
  const links = await prisma.posProductOptionGroup.findMany({ where: { tenantId, productId: { in: productIds } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { productId: true, groupId: true } });
  const gids = [...new Set(links.map((l) => l.groupId))];
  const groups = gids.length
    ? await prisma.menuOptionGroup.findMany({
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

const imageOf = (v: unknown): string | null => (Array.isArray(v) && typeof v[0] === "string" && v[0] ? v[0] : null);
/** เมนูของประตู = สินค้าที่มีราคาในช่องทางนี้ (ไม่ขาย/ไม่ตั้งราคา = ไม่แสดง) · 86 = แสดงแบบหมด (available false) */
function menuOf(c: Catalog, unitId: string, channelCode: string): QrMenuItem[] {
  const out: QrMenuItem[] = [];
  for (const r of c.rows.values()) {
    const rp = priceOf(c.book, r, channelCode);
    if (!rp.ok) continue;
    const cat = r.categoryId ? (c.cats.get(r.categoryId) ?? null) : null;
    const groups: QrMenuGroup[] = (c.optCat.get(r.id) ?? []).map((g) => ({
      groupId: g.id,
      name: g.name,
      nameEn: g.nameEn,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      choices: g.choices.map((ch) => ({ choiceId: ch.id, name: ch.name, nameEn: ch.nameEn, priceDeltaSatang: ch.priceDelta, available: !ch.isOutOfStock })),
    }));
    out.push({
      productId: r.id,
      name: r.name,
      nameEn: r.nameEn,
      categoryId: r.categoryId,
      categoryName: cat?.name ?? null,
      imageUrl: imageOf(r.images),
      priceSatang: rp.priceSatang,
      priceSource: rp.source,
      available: rowAvailable(r, unitId, c.soldOut),
      optionGroups: groups,
    });
  }
  const rank = (m: QrMenuItem) => (m.categoryId ? (c.cats.get(m.categoryId)?.sortOrder ?? 0) : 1_000_000);
  return out.sort((a, b) => rank(a) - rank(b));
}

// ═══════════ คิดราคาตะกร้า (ตัวแก้ราคาของหน้าขาย · ลำดับตรวจเดียวกับ regPrice) ═══════════
type Priced = { row: PosProduct; qty: number; base: number; delta: number; unit: number; priceSource: PriceSource; listPriceSatang: number | null; ruleId: string | null; picked: RegPickedOption[]; choiceIds: string[]; note: string | null };
async function priceLines(u: PosUnit, channelCode: string, lines: QrParsedLine[]): Promise<{ ok: true; priced: Priced[] } | QrRefusal> {
  const c = await catalogOf(u, lines.map((l) => l.productId));
  const priced: Priced[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const row = c.rows.get(l.productId);
    if (!row || !rowAvailable(row, u.unitId, c.soldOut)) return qrRefuse("PRODUCT_UNAVAILABLE", { lineIndex: i });
    const opt = regResolveOptions(c.optCat.get(row.id) ?? [], l.choiceIds);
    if (!opt.ok) return qrRefuse(opt.code, { lineIndex: i });
    const rp = priceOf(c.book, row, channelCode);
    if (!rp.ok) return qrRefuse(rp.code === "CHANNEL_NOT_SOLD" ? "CHANNEL_NOT_SOLD" : "PRICE_NOT_SET", { lineIndex: i });
    const unit = rp.priceSatang + opt.delta;
    if (unit < 0) return qrRefuse("VALIDATION", { lineIndex: i });
    priced.push({ row, qty: l.qty, base: rp.priceSatang, delta: opt.delta, unit, priceSource: rp.source, listPriceSatang: rp.listPriceSatang ?? rp.priceSatang, ruleId: rp.ruleId, picked: opt.picked, choiceIds: l.choiceIds, note: l.note });
  }
  return { ok: true, priced };
}
/** ยอดของตะกร้า (priceCart ตัวเดียวกับหน้าขาย · ไม่มีส่วนลด · ค่าบริการปัดครึ่งขึ้นระดับบิลเมื่อส่ง bp) */
function totalsOf(priced: Priced[], serviceChargeBp: number): { ok: true; subtotal: number; serviceCharge: number; total: number; lineTotals: number[] } | QrRefusal {
  const pc = priceCart({ lines: priced.map((p) => ({ qty: p.qty, unitPriceSatang: p.unit })), billDiscount: null, vat: { mode: "NONE", rateBp: 0 }, maxDiscountBp: null, serviceChargeBp });
  if (!pc.ok) return qrRefuse("VALIDATION", pc.lineIndex !== undefined ? { lineIndex: pc.lineIndex } : {});
  return { ok: true, subtotal: pc.subtotalSatang, serviceCharge: pc.serviceChargeSatang, total: pc.grandTotalSatang, lineTotals: pc.lines.map((x) => x.lineTotalSatang) };
}
/** ค่าบริการของหน้าขาย (ช่องทาง QR_TABLE เท่านั้น · กติกาเดียวกับ regPrice · ปิด/อ่านไม่ได้ = 0) */
async function tableServiceBp(u: PosUnit): Promise<number> {
  const r = await posPaymentSettings({ tenantId: u.tenantId, systemId: u.systemId }, prisma);
  return r.ok && r.serviceCharge.enabled ? r.serviceCharge.rateBp : 0;
}
function quoteOut(priced: Priced[], t: { subtotal: number; serviceCharge: number; total: number; lineTotals: number[] }, withService: boolean): QrQuoteResult {
  return {
    ok: true,
    lines: priced.map((p, i) => ({ productId: p.row.id, qty: p.qty, unitPriceSatang: p.unit, lineTotalSatang: t.lineTotals[i] ?? p.unit * p.qty, priceSource: p.priceSource, options: p.picked.map((o) => ({ choiceId: o.choiceId, name: o.name, priceDeltaSatang: o.priceDeltaSatang })) })),
    subtotalSatang: t.subtotal,
    ...(withService ? { serviceChargeSatang: t.serviceCharge } : {}),
    totalSatang: t.total,
  };
}
const hashOf = (v: unknown): string => createHash("sha1").update(JSON.stringify(v)).digest("hex").slice(0, 16);

// ═══════════════════════════ QR โต๊ะ (§1 a) ═══════════════════════════
type TableCtx = { view: GuestTableView; u: PosUnit };
async function tableCtx(qrToken: unknown): Promise<TableCtx | null> {
  if (!isTableQrToken(qrToken)) return null;
  const view = await (await restaurant()).guestTableViewForPos(prisma, { qrToken });
  if (!view) return null;
  const u = await posUnitOf(view.tenantId, view.unitId);
  return u ? { view, u } : null;
}
function roundsOf(view: GuestTableView): QrRound[] {
  return (view.session?.rounds ?? []).map((r) => ({ id: r.id, no: r.no, at: r.at.toISOString(), items: r.items.map((it) => ({ name: it.name, qty: it.qty, options: it.options, status: it.status, lineTotalSatang: it.lineTotal })) }));
}
async function tableViewOf(t: TableCtx): Promise<QrTableView> {
  const [door, cat, bp, shop] = await Promise.all([doorOf(t.u, "QR_TABLE", false), catalogOf(t.u), tableServiceBp(t.u), shopOf(t.u.tenantId, t.u.systemId, t.u.unitId, t.u.unitName)]); // POS P2.7U ▸ + หัวร้าน ◂
  const body = {
    unit: { name: t.u.unitName },
    shop, // POS P2.7U ◂
    table: { name: t.view.table.name },
    open: door.open,
    ...(door.closedReason ? { closedReason: door.closedReason } : {}),
    menu: menuOf(cat, t.u.unitId, "QR_TABLE"),
    session: t.view.session ? { id: t.view.session.id, rounds: roundsOf(t.view) } : null,
    serviceChargeBp: bp,
  };
  return { ...body, ver: hashOf(body) };
}

/** หน้าโต๊ะ (อ่านอย่างเดียว · ไม่เปิด session — ข้อบกพร่อง ① ปิดแล้ว · TB1) */
export async function tableDoor(qrToken: string): Promise<QrTableDoorResult> {
  return qrGuard("tableDoor", async (): Promise<QrTableDoorResult> => {
    const t = await tableCtx(qrToken);
    if (!t) return TOKEN_INVALID();
    return { ok: true, view: await tableViewOf(t) };
  });
}

/** โพลของหน้าโต๊ะ — sinceVer เท่าเดิม = changed:false (0 เขียน · ไม่มีเพดาน) */
export async function tablePoll(qrToken: string, opts: { sinceVer?: string } = {}): Promise<QrTablePollResult> {
  return qrGuard("tablePoll", async (): Promise<QrTablePollResult> => {
    const t = await tableCtx(qrToken);
    if (!t) return TOKEN_INVALID();
    const view = await tableViewOf(t);
    if (isRecord(opts) && typeof opts.sinceVer === "string" && opts.sinceVer === view.ver) return { ok: true, changed: false, ver: view.ver };
    return { ok: true, changed: true, ver: view.ver, view };
  });
}

/** ยอดของตะกร้าโต๊ะ (ราคา QR_TABLE + ค่าบริการ POS · = quoteRegisterCart ของช่องทางเดียวกัน · PO4) */
export async function quoteTableCart(qrToken: string, input: { lines: unknown }): Promise<QrQuoteResult> {
  return qrGuard("quoteTableCart", async (): Promise<QrQuoteResult> => {
    const t = await tableCtx(qrToken);
    if (!t) return TOKEN_INVALID();
    const cart = parseQrCart(isRecord(input) ? input.lines : undefined);
    if (!cart.ok) return cart;
    const p = await priceLines(t.u, "QR_TABLE", cart.lines);
    if (!p.ok) return p;
    const tt = totalsOf(p.priced, await tableServiceBp(t.u));
    if (!tt.ok) return tt;
    return quoteOut(p.priced, tt, true);
  });
}

/**
 * CD-O7 · POS P2.7 ▸ fix2 R1 F1 / hunter H2: single-flight ต่อ (โต๊ะ · guestToken · session ที่หน้าเห็น · ตะกร้า) — คำขอแรกวาง Promise ลงแผนที่ "ก่อน" ธุรกรรม ·
 *   คำขอที่ตามมาภายใน 10 วิ รอ Promise เดียวกัน (ผลเดียวกัน · รอบเดียว) · คำปฏิเสธ/โยน = ลบออก (ส่งใหม่ได้) · ในหน่วยความจำต่อ instance (คีย์ถาวร = P2.14) ◂
 */
const inflightRounds = new Map<string, { at: number; p: Promise<QrPlaceRoundResult> }>();
/** ttlMs = เก็บผลที่สำเร็จไว้ตอบซ้ำนานเท่านี้ · 0 = เฉพาะระหว่างกำลังทำ (สำเร็จแล้วลบ — ประตูที่มีคีย์ใน DB อยู่แล้ว) */
function singleFlight<T extends { ok: boolean }>(map: Map<string, { at: number; p: Promise<T> }>, key: string | null, ttlMs: number, run: () => Promise<T>): Promise<T> {
  if (!key) return run();
  const now = Date.now();
  if (ttlMs > 0) for (const [k, v] of map) if (now - v.at > ttlMs) map.delete(k);
  const hit = map.get(key);
  if (hit) return hit.p;
  const p = run().then(
    (r) => {
      if (!r.ok || ttlMs === 0) map.delete(key);
      return r;
    },
    (e) => {
      map.delete(key);
      throw e;
    },
  );
  map.set(key, { at: now, p });
  return p;
}

const isRetryable = (e: unknown): boolean => {
  const code = (e as { code?: unknown } | null)?.code;
  if (code === "P2002" || code === "P2034") return true;
  return /deadlock detected|could not serialize/i.test(String((e as Error)?.message ?? ""));
};
/** ธุรกรรมที่ลองใหม่เมื่อชน unique/deadlock (ล็อก session ↔ ล็อกโต๊ะของรวมโต๊ะ) — คำปฏิเสธ/โยนอื่นไม่ลองใหม่ */
async function retryTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction((tx) => fn(tx), { timeout: 30_000, maxWait: 15_000 });
    } catch (e) {
      if (attempt < 2 && isRetryable(e)) continue;
      throw e;
    }
  }
}
class QrAbort extends Error {
  constructor(readonly refusal: QrRefusal) {
    super(refusal.code);
  }
}
/** OrderInTxError ของรอบ → รหัสสาธารณะ (86/ตัวนับหมด = PRODUCT_UNAVAILABLE · ตัวเลือกของเมนูไม่ครบ = OPTIONS_REQUIRED/INVALID · ครัวปิด = QR_CLOSED) */
function roundLineRefusal(e: { err: { code: string; reason?: string }; lineIndex: number | null }): QrRefusal {
  const li = e.lineIndex === null ? {} : { lineIndex: e.lineIndex };
  switch (e.err.code) {
    case "ITEM_UNAVAILABLE":
    case "OUT_OF_STOCK":
      return qrRefuse("PRODUCT_UNAVAILABLE", li);
    case "BAD_OPTIONS":
      return qrRefuse(/เลือก \d+-\d+/.test(e.err.reason ?? "") ? "OPTIONS_REQUIRED" : "OPTIONS_INVALID", li);
    case "KITCHEN_CLOSED":
      return qrRefuse("QR_CLOSED");
    default:
      return qrRefuse("VALIDATION", li);
  }
}

/**
 * ส่งรอบของแขก (§1 a · มติ 6 13): เพดาน → ตะกร้า → ประตูเปิด (QR_TABLE) → ราคาช่องทาง QR_TABLE → ธุรกรรม: guestRoundInTx ของร้านอาหาร (ล็อก session + OPEN +
 * merge chain · รอบแรกเปิด session ของแขก) + event 86 ของตัวนับเมนูที่หมด (catalog-legacy) — หน้าเห็น session หนึ่งแล้วโต๊ะถูกปิดระหว่างทาง = SESSION_CHANGED
 */
export async function placeTableRound(qrToken: string, input: unknown, meta: { ip: string }): Promise<QrPlaceRoundResult> {
  return qrGuard("placeTableRound", async (): Promise<QrPlaceRoundResult> => {
    const t = await tableCtx(qrToken);
    if (!t) return TOKEN_INVALID();
    const lim = await submitGuard(qrToken, ipOf(meta));
    if (lim) return lim;
    const parsed = parseQrTableRound(input);
    if (!parsed.ok) return parsed;
    const door = await doorOf(t.u, "QR_TABLE", false);
    if (!door.open) return qrRefuse("QR_CLOSED");
    const p = await priceLines(t.u, "QR_TABLE", parsed.value.lines);
    if (!p.ok) return p;
    const dedupeKey = parsed.value.guestToken ? `${t.view.table.id}|${parsed.value.guestToken}|${parsed.value.expectedSessionId ?? "-"}|${qrCartHash(parsed.value.lines)}|${parsed.value.note ?? ""}` : null;
    return singleFlight(inflightRounds, dedupeKey, QR_ROUND_DEDUPE_MS, () => sendRound(t, parsed.value, p.priced, dedupeKey)); // POS P2.7 ▸ fix2 R1 F1/H2: single-flight (ตัวเขียนรอบแยกเป็น sendRound) ◂ · POS P2.14 ▸ QR-3 คีย์ถาวรใน DB ◂
  });
}
// POS P2.7 ▸ fix2 R1 F1/H2: ส่งรอบจริง (ถูกเรียกครั้งเดียวต่อคีย์ของ single-flight) ◂
// POS P2.14 ▸ QR-3 มติ 9 (Q5): กันรอบซ้ำข้าม instance — ในธุรกรรมของรอบ: pg_advisory_xact_lock(hashtext(คีย์ของรอบ = โต๊ะ|guestToken|session|ตะกร้า|โน้ต)) แล้วค้น
//   ตัวบอกของรอบเดียวกันใน 10 วิ (AuditLog pos.qr.round · after.dedupeKey = sha256 ของคีย์ · ไม่แตะ schema ร้านอาหาร) · เจอ = รอบเดิม · ไม่เจอ = เขียนรอบ + ตัวบอกในธุรกรรมเดียวกัน ·
//   instance ที่สองรอล็อกจนรอบแรก commit แล้วเห็นตัวบอก (read committed) ⇒ สองเครื่องส่งพร้อมกัน = รอบเดียว · ไม่มี guestToken = ไม่กันซ้ำ (เหมือนเดิม) ◂
const QR_ROUND_AUDIT = "pos.qr.round";
async function sendRound(t: TableCtx, v: { expectedSessionId: string | null | undefined; guestToken: string | null; note: string | null }, priced: Priced[], dedupeKey: string | null = null): Promise<QrPlaceRoundResult> {
    const R = await restaurant();
    const lines = priced.map((x) => ({
      productId: x.row.id,
      name: x.row.name,
      qty: x.qty,
      choiceIds: x.choiceIds,
      options: x.picked.map((o) => ({ choiceId: o.choiceId, groupSnapshot: o.groupName, choiceSnapshot: o.name, priceDelta: o.priceDeltaSatang })),
      note: x.note,
      unitPrice: x.base,
      optionsTotal: x.delta,
      stationId: x.row.stationId,
    }));
    let r: { roundId: string; sessionId: string };
    try {
      const keyHash = dedupeKey ? createHash("sha256").update(`${t.u.tenantId}|${dedupeKey}`).digest("hex") : null; // POS P2.14 ▸ QR-3 ◂
      r = await retryTx(async (tx) => {
        // POS P2.14 ▸ QR-3 (Q5): ล็อก + ค้นตัวบอกของรอบเดียวกันใน 10 วิ ก่อนเขียน ◂
        if (keyHash) {
          await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${`posqr-round:${keyHash}`}))) l`;
          const prior = await tx.auditLog.findFirst({
            where: { tenantId: t.u.tenantId, action: QR_ROUND_AUDIT, targetType: "RestaurantOrder", createdAt: { gte: new Date(Date.now() - QR_ROUND_DEDUPE_MS) }, after: { path: ["dedupeKey"], equals: keyHash } },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { targetId: true, after: true },
          });
          const pa = prior && isRecord(prior.after) ? prior.after : null;
          if (prior?.targetId && pa && typeof pa.sessionId === "string") return { roundId: prior.targetId, sessionId: pa.sessionId };
        }
        const g = await R.guestRoundInTx(tx, { tenantId: t.u.tenantId, unitId: t.u.unitId, tableId: t.view.table.id, expectedSessionId: v.expectedSessionId, guestToken: v.guestToken, note: v.note, lines });
        if (!g.ok) throw new QrAbort(qrRefuse(g.code === "SESSION_CHANGED" ? "SESSION_CHANGED" : "TOKEN_INVALID"));
        await emitGuestRoundStockFlipsInTx(tx, { tenantId: t.u.tenantId, unitId: t.u.unitId }, g.menuItemIds);
        // POS P2.14 ▸ QR-3: ตัวบอกของรอบ (ผู้กระทำ = ระบบ · แขกไม่มีบัญชี) ในธุรกรรมเดียวกับรอบ ◂
        if (keyHash)
          await tx.auditLog.create({ data: { tenantId: t.u.tenantId, unitId: t.u.unitId, actorType: "SYSTEM", actorId: null, action: QR_ROUND_AUDIT, targetType: "RestaurantOrder", targetId: g.roundId, after: { dedupeKey: keyHash, sessionId: g.sessionId, tableId: t.view.table.id } } });
        return { roundId: g.roundId, sessionId: g.sessionId };
      });
    } catch (e) {
      if (e instanceof QrAbort) return e.refusal;
      if (e instanceof R.GuestRoundLineError) return roundLineRefusal(e);
      throw e;
    }
    scheduleDrain();
    return { ok: true, roundId: r.roundId, sessionId: r.sessionId };
}

/** เรียกพนักงาน / ขอเช็คบิล (คำขอจากโต๊ะของร้านอาหาร · กันซ้ำ 2 นาทีในตัว) — POS P2.7 ▸ fix2 F5 · fix3: ไม่เปิด session ให้เลย (โต๊ะว่าง = NO_SESSION · หน้าไม่แสดงปุ่ม) ◂ */
export async function tableServiceRequest(qrToken: string, input: { kind: "CALL_STAFF" | "REQUEST_BILL" }, meta: { ip: string }): Promise<QrOkResult> {
  return qrGuard("tableServiceRequest", async (): Promise<QrOkResult> => {
    const t = await tableCtx(qrToken);
    if (!t) return TOKEN_INVALID();
    const lim = await submitGuard(qrToken, ipOf(meta));
    if (lim) return lim;
    const kind = isRecord(input) ? input.kind : undefined;
    if (kind !== "CALL_STAFF" && kind !== "REQUEST_BILL") return qrRefuse("VALIDATION");
    const r = await (await restaurant()).guestServiceRequestForPos(prisma, { tenantId: t.u.tenantId, unitId: t.u.unitId, tableId: t.view.table.id, type: kind });
    return r.ok ? { ok: true } : qrRefuse(r.code === "NO_TABLE" ? "TOKEN_INVALID" : "NO_SESSION"); // POS P2.7 ▸ fix3 nit (a): qr.errors.noSession ◂
  });
}

/** ผู้กระทำสังเคราะห์อ่านอย่างเดียวของบิลแขก (CD-O1 · แบบ P2.13): ไม่มีสิทธิ์ขาย · ใช้ได้เฉพาะสาขาของโต๊ะ */
const guestActor = (unitId: string): RegisterActor => ({ userId: `guest:${unitId}`, role: "STAFF", unitAccess: [unitId], permissions: { "pos.sale.read": true } });
async function promptpayIdOf(u: PosUnit): Promise<string | null> {
  const sys = await prisma.appSystem.findFirst({ where: { id: u.systemId, tenantId: u.tenantId }, select: { settings: true } });
  const unitPp = promptpayIdForUnit(sys?.settings, u.unitId);
  if (unitPp && isValidPromptPayId(unitPp)) return unitPp;
  const profile = await prisma.paymentProfile.findUnique({ where: { tenantId: u.tenantId }, select: { promptpayId: true } });
  const id = (profile?.promptpayId ?? "").trim();
  return id && isValidPromptPayId(id) ? id : null;
}
async function billOf(t: TableCtx): Promise<QrTableBill> {
  const empty: QrTableBill = { lines: [], subtotalSatang: 0, serviceChargeSatang: 0, totalSatang: 0, promptpayPayload: null, payHidden: false };
  if (!t.view.session) return empty;
  const r = await registerTableBillPreview({ tenantId: t.u.tenantId, systemId: t.u.systemId, unitId: t.u.unitId }, guestActor(t.u.unitId), { tableSessionId: t.view.session.id }, ["pos.sale.read"]);
  if (isRefusal(r)) {
    const code = String((r as { code?: unknown }).code ?? "");
    if (code === "TABLE_EMPTY" || code === "TABLE_SESSION_CLOSED") return empty;
    // แผนแยกบิลเปิดอยู่ (หรืออ่านยอดของหน้าขายไม่ได้) = ซ่อนการจ่ายบนมือถือ — แสดงรายการที่สั่งไว้ จ่ายที่แคชเชียร์ (มติ 6)
    const lines = roundsOf(t.view).flatMap((x) => x.items.filter((it) => it.status !== "CANCELLED").map((it) => ({ name: it.name, qty: it.qty, options: it.options, amountSatang: it.lineTotalSatang })));
    const sub = lines.reduce((s, l) => s + l.amountSatang, 0);
    return { lines, subtotalSatang: sub, serviceChargeSatang: 0, totalSatang: sub, promptpayPayload: null, payHidden: true };
  }
  const total = r.quote.grandTotalSatang;
  const ppId = total > 0 ? await promptpayIdOf(t.u) : null;
  let payload: string | null = null;
  if (ppId) {
    try {
      payload = promptpayPayload({ id: ppId, amountSatang: total });
    } catch {
      payload = null;
    }
  }
  return {
    lines: r.lines.map((l) => ({ name: l.name, qty: l.qty, options: l.options, amountSatang: l.amountSatang })),
    subtotalSatang: r.quote.subtotalSatang,
    serviceChargeSatang: r.quote.serviceChargeSatang,
    totalSatang: total,
    promptpayPayload: payload,
    payHidden: false,
  };
}

/** บิลของโต๊ะบนมือถือ = บิลโต๊ะของหน้าขาย (ช่องทาง QR_TABLE/STORE + ค่าบริการ POS ปัดครึ่งขึ้น · ข้อบกพร่อง ② · TB6) + พร้อมเพย์ของยอดนั้น · แยกบิลเปิด = ซ่อนการจ่าย */
export async function tableBill(qrToken: string): Promise<QrTableBillResult> {
  return qrGuard("tableBill", async (): Promise<QrTableBillResult> => {
    const t = await tableCtx(qrToken);
    if (!t) return TOKEN_INVALID();
    return { ok: true, bill: await billOf(t) };
  });
}

/** ลูกค้าแจ้งว่าโอนพร้อมเพย์แล้ว → คำขอ PAY_PROMPTPAY เดิม (แจ้งเตือน "ยืนยันรับเงิน" บนผังโต๊ะ · ยอด = บิลของหน้าขาย) */
export async function tableNotifyPaid(qrToken: string, meta: { ip: string }): Promise<QrOkResult> {
  return qrGuard("tableNotifyPaid", async (): Promise<QrOkResult> => {
    const t = await tableCtx(qrToken);
    if (!t) return TOKEN_INVALID();
    const lim = await submitGuard(qrToken, ipOf(meta));
    if (lim) return lim;
    const bill = await billOf(t);
    if (bill.payHidden || bill.totalSatang <= 0) return qrRefuse("VALIDATION");
    const r = await (await restaurant()).guestServiceRequestForPos(prisma, {
      tenantId: t.u.tenantId,
      unitId: t.u.unitId,
      tableId: t.view.table.id,
      type: "PAY_PROMPTPAY",
      note: `ลูกค้าแจ้งชำระพร้อมเพย์ ฿${(bill.totalSatang / 100).toFixed(2)}`,
    });
    return r.ok ? { ok: true } : qrRefuse("VALIDATION");
  });
}

// ═══════════════════════════ สั่งล่วงหน้าจ่ายก่อน (§1 b) ═══════════════════════════
type LinkCtx = { u: PosUnit };
async function linkCtx(linkToken: unknown): Promise<LinkCtx | null> {
  if (!isLinkToken(linkToken)) return null;
  const l = await prisma.posOrderLink.findUnique({ where: { token: linkToken }, select: { tenantId: true, systemId: true, unitId: true, status: true } });
  if (!l || l.status !== "ACTIVE") return null;
  const u = await posUnitOf(l.tenantId, l.unitId, l.systemId);
  return u ? { u } : null;
}

/** หน้าสั่งล่วงหน้า (อ่านอย่างเดียว): ชื่อสาขา · เปิด/ปิด (+ เหตุ) · เมนูราคา QR_ORDER · เวลาเตรียมของช่องทาง */
export async function linkDoor(linkToken: string, deps?: PaymentIntentDeps): Promise<QrLinkDoorResult> {
  return qrGuard("linkDoor", async (): Promise<QrLinkDoorResult> => {
    const l = await linkCtx(linkToken);
    if (!l) return TOKEN_INVALID();
    const [door, cat, shop] = await Promise.all([doorOf(l.u, "QR_ORDER", true, deps), catalogOf(l.u), shopOf(l.u.tenantId, l.u.systemId, l.u.unitId, l.u.unitName)]); // POS P2.7U ▸ + หัวร้าน ◂
    return {
      ok: true,
      view: {
        unit: { name: l.u.unitName },
        shop, // POS P2.7U ◂
        open: door.open,
        ...(door.closedReason ? { closedReason: door.closedReason } : {}),
        menu: menuOf(cat, l.u.unitId, "QR_ORDER"),
        prepMinutes: door.channel?.prepMinutes ?? ORDER_PREP_DEFAULT_MIN,
      },
    };
  });
}

/** ยอดของตะกร้าสั่งล่วงหน้า (ราคา QR_ORDER · ไม่มีค่าบริการ · = quoteRegisterCart ของช่องทางเดียวกัน) */
export async function quotePreorderCart(linkToken: string, input: { lines: unknown }): Promise<QrQuoteResult> {
  return qrGuard("quotePreorderCart", async (): Promise<QrQuoteResult> => {
    const l = await linkCtx(linkToken);
    if (!l) return TOKEN_INVALID();
    const cart = parseQrCart(isRecord(input) ? input.lines : undefined);
    if (!cart.ok) return cart;
    const p = await priceLines(l.u, "QR_ORDER", cart.lines);
    if (!p.ok) return p;
    const tt = totalsOf(p.priced, 0);
    if (!tt.ok) return tt;
    return quoteOut(p.priced, tt, false);
  });
}

const optionSnapshot = (p: Priced): OrderLineOption[] => p.picked.map((o) => ({ choiceId: o.choiceId, groupId: o.groupId, groupName: o.groupName, choiceName: o.name, priceDeltaSatang: o.priceDeltaSatang }));

/**
 * สั่งล่วงหน้า (§1 b · S1 S2 S6 · มติ 3 4): เพดาน → ตรวจข้อมูล (ชื่อ · เบอร์ไทย · ตะกร้า) → ประตูเปิด (QR_ORDER + มีทางรับเงิน) → ราคา QR_ORDER →
 * คีย์เดิม = ออเดอร์เดิม (ไม่สร้าง charge ใหม่) → เตรียมใบ (Beam นอกธุรกรรม · ไม่งั้น QR นิ่ง) → ธุรกรรม: order.ingestPreorderInTx (ออเดอร์ PENDING_PAYMENT + ใบ) ·
 * ผล = โทเคนหน้าสถานะ /q/o/<token>
 */
export async function placePreorder(linkToken: string, input: unknown, meta: { ip: string }, deps?: PaymentIntentDeps): Promise<QrPlacePreorderResult> {
  return qrGuard("placePreorder", async (): Promise<QrPlacePreorderResult> => {
    const l = await linkCtx(linkToken);
    if (!l) return TOKEN_INVALID();
    const lim = await submitGuard(linkToken, ipOf(meta));
    if (lim) return lim;
    const chatTag: unknown = isRecord(input) ? input.chatTag : undefined; // POS P3.7 ▸ R8: chatTag ไม่ผ่านตัวแกะเดิม (คีย์ตายตัว) ◂
    const parsed = parseQrPreorder(isRecord(input) && "chatTag" in input ? Object.fromEntries(Object.entries(input).filter(([k]) => k !== "chatTag")) : input); // POS P3.7 ▸ R8 ◂
    if (!parsed.ok) return parsed;
    const chatConversationId = chatTag === undefined ? null : verifyChatTag(chatTag, { tenantId: l.u.tenantId, linkToken }); // POS P3.7 ▸ R8: แท็กเสีย/หมดอายุ/ร้านอื่น = ไม่ผูก (ไม่ปฏิเสธลูกค้า) ◂
    // POS P2.7 ▸ fix2 hunter H5: single-flight ต่อ (ลิงก์ · คีย์) รอบทั้งคำขอ — คำขอคีย์เดิมพร้อมกันรอผลเดียวกัน ⇒ Beam charge เดียว ◂
    return singleFlight(inflightPreorders, `${linkToken}|qr:${parsed.value.idempotencyKey}`, QR_PREORDER_FLIGHT_MS, () => submitPreorder(l, parsed.value, deps, chatConversationId)); // POS P3.7 ▸ + chatConversationId ◂
  });
}
const inflightPreorders = new Map<string, { at: number; p: Promise<QrPlacePreorderResult> }>();
const QR_PREORDER_FLIGHT_MS = 0; // ระหว่างทำเท่านั้น — คำขอซ้ำทีหลังตอบจากคีย์ใน DB (duplicated) ◂
async function submitPreorder(l: LinkCtx, v: QrParsedPreorder, deps?: PaymentIntentDeps, chatConversationId: string | null = null /* POS P3.7 ▸ R8 ◂ */): Promise<QrPlacePreorderResult> {
    const door = await doorOf(l.u, "QR_ORDER", true, deps);
    if (!door.open || !door.channel) return qrRefuse("QR_CLOSED");
    const p = await priceLines(l.u, "QR_ORDER", v.lines);
    if (!p.ok) return p;
    const lines: orders.PreorderLine[] = p.priced.map((x) => ({
      productId: x.row.id,
      name: x.row.name,
      qty: x.qty,
      unitPriceSatang: x.unit,
      listPriceSatang: x.listPriceSatang,
      priceSource: x.priceSource,
      priceRuleId: x.ruleId,
      options: optionSnapshot(x),
      note: x.note,
    }));
    // POS P2.7 ▸ fix2 note 1: CHANNEL_PAUSED/CHANNEL_INVALID จากการตรวจซ้ำในธุรกรรม = QR_CLOSED ◂
    const mapOut = (r: orders.PreorderIngestResult): QrPlacePreorderResult =>
      r.ok ? { ok: true, orderToken: r.publicToken, duplicated: r.duplicated } : qrRefuse(r.code === "IDEMPOTENCY_CONFLICT" || r.code === "VALIDATION" ? "VALIDATION" : r.code === "CHANNEL_INVALID" || r.code === "CHANNEL_PAUSED" ? "QR_CLOSED" : "INTERNAL");
    const total = lines.reduce((s, x) => s + x.unitPriceSatang * x.qty, 0);
    const channelId = door.channel.id;
    // POS P2.14 ▸ QR-3 มติ 9 (Q6): คีย์ใน DB ตรวจก่อนเตรียม Beam charge ใต้ล็อกเดียวกัน (ข้าม instance) — ธุรกรรมเดียว: ล็อกต่อ (สาขา · คีย์) → ค้นออเดอร์ของคีย์ →
    //   เตรียมใบ (Beam charge ครั้งเดียวต่อคำขอ · ลองธุรกรรมซ้ำใช้ใบที่เตรียมแล้ว) → รับเข้า · instance ที่สองรอล็อกแล้วเห็นออเดอร์ของคีย์ = duplicated ไม่ charge ◂
    let prepared = null as PreparedOrderIntent | null;
    type Out = { kind: "dup"; r: orders.PreorderIngestResult } | { kind: "refused"; out: QrPlacePreorderResult } | { kind: "ingested"; r: orders.PreorderIngestResult };
    let out: Out;
    try {
      out = await retryTx(async (tx): Promise<Out> => {
        await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${`posqr-pre:${l.u.tenantId}:${l.u.unitId}:${v.idempotencyKey}`}))) l`;
        const pre = await orders.findPreorderByKey(l.u, channelId, v.idempotencyKey, lines);
        if (pre) return { kind: "dup", r: pre };
        if (!prepared) {
          const prep = await prepareOrderIntent(l.u, total, deps);
          if (!prep.ok) return { kind: "refused", out: qrRefuse(prep.code === "PROMPTPAY_NOT_CONFIGURED" ? "QR_CLOSED" : prep.code === "VALIDATION" ? "VALIDATION" : "INTERNAL") };
          prepared = prep.prepared;
        }
        return { kind: "ingested", r: await orders.ingestPreorderInTx(tx, l.u, { channelId, lines, customer: v.customer, idempotencyKey: v.idempotencyKey, note: v.note, prepared, chatConversationId }) }; // POS P3.7 ▸ R8 + chatConversationId ◂
      });
    } catch (e) {
      if (prepared) await orderIntentUnused(l.u, prepared, "INGEST_FAILED"); // POS P2.7 ▸ fix2 F6 ◂
      throw e;
    }
    if (out.kind === "refused") return out.out;
    if (out.kind === "dup") {
      // POS P2.14 ▸ fix1 H6: รอบแรกเตรียมเงิน (Beam) แล้วล้ม/ลองใหม่ แต่คีย์เดียวกันลงไปก่อน ⇒ ใบที่เตรียมไว้ไม่ถูกใช้ — ปิดทิ้ง (ไม่ค้าง PENDING) ◂
      if (prepared) await orderIntentUnused(l.u, prepared, "DUPLICATE");
      return mapOut(out.r);
    }
    const r = out.r;
    if ((!r.ok || r.duplicated) && prepared) await orderIntentUnused(l.u, prepared, r.ok ? "DUPLICATE" : "REFUSED"); // POS P2.7 ▸ fix2 F6 ◂
    await orders.preorderIngested(l.u.tenantId, r);
    return mapOut(r);
}

// ═══════════════════════════ หน้าสถานะ (§1 c) ═══════════════════════════
const ORDER_STATUS_SELECT = {
  id: true,
  tenantId: true,
  systemId: true, // POS P2.7U ▸ หัวร้าน ◂
  createdAt: true, // POS P2.7U fix1 ▸ F7 ◂
  unitId: true,
  code: true,
  status: true,
  paymentState: true,
  totalSatang: true,
  payBy: true,
  paidAt: true,
  customerClaimAt: true,
  paymentIntentId: true,
  saleId: true,
  customerName: true,
  customerPhone: true,
  acceptedAt: true,
  prepMinutes: true,
  rejectReason: true,
  version: true,
} satisfies Prisma.PosOrderSelect;

/** ออเดอร์ของโทเคน (ค้นด้วย unique index เท่านั้น) — เลยเวลาจ่ายและยังรอเงิน = ปิดตอนนี้ (ครั้งเดียว · S2) */
async function orderOfToken(orderToken: unknown) {
  if (!isOrderToken(orderToken)) return null;
  let o = await prisma.posOrder.findUnique({ where: { publicToken: orderToken }, select: ORDER_STATUS_SELECT });
  if (!o) return null;
  if (o.status === "NEW" && o.paymentState === "PENDING_PAYMENT" && o.payBy && o.payBy.getTime() <= Date.now()) {
    if (await orders.expirePreorderIfDue(o.tenantId, o.id)) o = (await prisma.posOrder.findUnique({ where: { publicToken: orderToken }, select: ORDER_STATUS_SELECT })) ?? o;
  }
  return o;
}

/**
 * หน้าสถานะของลูกค้า (โพล 5 วิ · sinceVer จาก version + สถานะ + สถานะใบ = changed:false ไม่เขียน): รหัส · สถานะ · ยอด · QR ของใบเดียวกัน (ยอด/หมดเวลาเดียว · มติ 3) ·
 * ใบเสร็จออนไลน์หลังร้านรับ · เบอร์แบบปิดบัง · เวลารับโดยประมาณ · เหตุที่ปิด · รอคืนเงิน
 */
export async function orderStatus(orderToken: string, opts: { sinceVer?: string } = {}): Promise<QrOrderStatusResult> {
  return qrGuard("orderStatus", async (): Promise<QrOrderStatusResult> => {
    const o = await orderOfToken(orderToken);
    if (!o) return TOKEN_INVALID();
    const it = o.paymentIntentId ? await prisma.posPaymentIntent.findUnique({ where: { id: o.paymentIntentId }, select: { kind: true, amountSatang: true, qrPayload: true, expiresAt: true, status: true } }) : null;
    // POS P2.14 ▸ QR-2 (Q4): ตัวบอกถาวร "ร้านคืนเงินให้" = PosOrderEvent refund_needed (order.ts เขียน · อ่านเฉพาะออเดอร์ที่ปิดแล้ว) — อยู่ในรุ่นของหน้า (เพิ่มหลังปิดได้) ◂
    const refundMark = o.status === "REJECTED" || o.status === "CANCELLED" ? await prisma.posOrderEvent.findFirst({ where: { tenantId: o.tenantId, orderId: o.id, type: "refund_needed" }, select: { id: true } }) : null;
    const ver = sinceVer([o.version, o.status, o.paymentState, it?.status, o.saleId ? 1 : 0, refundMark ? 1 : 0]);
    if (isRecord(opts) && typeof opts.sinceVer === "string" && opts.sinceVer === ver) return { ok: true, changed: false, ver };
    const [lines, sale, unit, againLink] = await Promise.all([
      prisma.posOrderLine.findMany({ where: { tenantId: o.tenantId, orderId: o.id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { name: true, qty: true, options: true, lineTotalSatang: true } }),
      o.saleId ? prisma.posSale.findFirst({ where: { id: o.saleId, tenantId: o.tenantId }, select: { publicToken: true } }) : Promise.resolve(null),
      prisma.businessUnit.findFirst({ where: { id: o.unitId, tenantId: o.tenantId }, select: { name: true } }),
      prisma.posOrderLink.findFirst({ where: { tenantId: o.tenantId, systemId: o.systemId, unitId: o.unitId, status: "ACTIVE" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { token: true, rotatedAt: true, createdAt: true } }), // POS P2.7U ▸ "ลองใหม่" ◂
    ]);
    const shop = await shopOf(o.tenantId, o.systemId, o.unitId, unit?.name ?? ""); // POS P2.7U ◂
    const closed = o.status === "REJECTED" || o.status === "CANCELLED";
    const view: QrOrderStatusView = {
      code: o.code,
      status: o.status,
      paymentState: o.paymentState,
      totalSatang: o.totalSatang,
      payBy: iso(o.payBy),
      paidAt: iso(o.paidAt),
      claimedAt: iso(o.customerClaimAt),
      pay: it ? { kind: it.kind as NonNullable<QrOrderStatusView["pay"]>["kind"], amountSatang: it.amountSatang, qrPayload: it.qrPayload, expiresAt: it.expiresAt.toISOString(), status: it.status as NonNullable<QrOrderStatusView["pay"]>["status"] } : null,
      receiptToken: sale?.publicToken ?? null,
      phoneMasked: maskPhone(o.customerPhone),
      customerName: o.customerName,
      unit: { name: unit?.name ?? "" },
      shop, // POS P2.7U ◂
      // POS P2.7U fix1 ▸ F7 · fix2 ▸ N1: ลิงก์ ACTIVE ที่เป็นลิงก์เดียวกับตอนสั่ง — ไม่งั้น null (หน้าให้สแกน QR ใหม่) · ตัวตรวจจริงคือ createdAt ของลิงก์ ≤ createdAt ของออเดอร์:
      //   การเปลี่ยนลิงก์ = แถวเก่า REVOKED (+ rotatedAt) + แถว ACTIVE ใหม่ที่ rotatedAt เป็น null เสมอ ⇒ ครึ่ง rotatedAt ของเงื่อนไขจริงเสมอสำหรับแถว ACTIVE (คงไว้ตามมติ) ·
      //   ลิงก์ที่ถูกเปลี่ยน/สร้างใหม่หลังออเดอร์ = ACTIVE ที่เกิดทีหลัง ⇒ createdAt > เวลาสั่ง ⇒ null ◂
      orderAgainToken: againLink && (againLink.rotatedAt === null || againLink.rotatedAt.getTime() <= o.createdAt.getTime()) && againLink.createdAt.getTime() <= o.createdAt.getTime() ? againLink.token : null,
      serverNow: new Date().toISOString(), // POS P2.7U fix1 ▸ F3 ◂
      readyEta: o.acceptedAt ? new Date(o.acceptedAt.getTime() + (o.prepMinutes ?? ORDER_PREP_DEFAULT_MIN) * MIN).toISOString() : null,
      closedReason: o.status === "REJECTED" ? "REJECTED" : o.status === "CANCELLED" ? (o.rejectReason === "PAYMENT_EXPIRED" ? "PAYMENT_EXPIRED" : "CANCELLED") : null,
      refundPending: (closed && it?.status === "PAID") || o.paymentState === "REFUNDED" || !!refundMark, // POS P2.7 ▸ fix2 R1 F3(a): บิลของออเดอร์ถูก void หลังรับ ◂ · POS P2.14 ▸ QR-2 ตัวบอกถาวร ◂
      lines: lines.map((l) => ({ name: l.name, qty: l.qty, options: Array.isArray(l.options) ? (l.options as { choiceName?: unknown }[]).flatMap((x) => (typeof x?.choiceName === "string" ? [x.choiceName] : [])) : [], lineTotalSatang: l.lineTotalSatang })),
    };
    return { ok: true, changed: true, ver, view };
  });
}

/** ลูกค้ากด "โอนแล้ว" (QR นิ่ง · S3): บันทึก customer_paid_claim เท่านั้น — ไม่มีผลเงิน · ปิดแล้ว/เลยเวลา = PREORDER_EXPIRED */
export async function claimPaid(orderToken: string, meta: { ip: string }): Promise<QrOkResult> {
  return qrGuard("claimPaid", async (): Promise<QrOkResult> => {
    if (!isOrderToken(orderToken)) return TOKEN_INVALID();
    const exists = await prisma.posOrder.findUnique({ where: { publicToken: orderToken }, select: { id: true } });
    if (!exists) return TOKEN_INVALID();
    const lim = await submitGuard(orderToken, ipOf(meta));
    if (lim) return lim;
    const o = await orderOfToken(orderToken);
    if (!o) return TOKEN_INVALID();
    const r = await orders.claimPreorderPaid(o.tenantId, o.id);
    if (!r.ok) return r.reason === "EXPIRED" ? qrRefuse("PREORDER_EXPIRED") : TOKEN_INVALID();
    return { ok: true };
  });
}

// ═══════════════════════════ ประตูเดิม → ประตู POS (มติ 1 · CD7) ═══════════════════════════
/** หน้าเดิม /s/…/restaurant/t/<qrToken>: สาขาที่ผูก POS = "/q/t/<qrToken>" (ไม่เปิด session ผี) · ไม่ผูก POS / โทเคนไม่ใช่ของสาขานั้น = null (หน้าเดิมทำงานตามเดิม) */
export async function legacyTableQrRedirect(tenantId: string, unitId: string, qrToken: string): Promise<string | null> {
  try {
    if (typeof tenantId !== "string" || typeof unitId !== "string" || !isTableQrToken(qrToken)) return null;
    const t = await prisma.restaurantTable.findFirst({ where: { tenantId, unitId, qrToken }, select: { id: true } });
    if (!t) return null;
    return (await posUnitOf(tenantId, unitId)) ? `/q/t/${encodeURIComponent(qrToken)}` : null;
  } catch (e) {
    console.error("[pos/qr-order] legacyTableQrRedirect", e);
    return null;
  }
}

/** รหัสสาธารณะทั้งหมด (หน้าใช้ตรวจคีย์ข้อความ) */
export type { QrRefusalCode };
