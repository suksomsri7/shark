// /book/[shop]/t/[productSlug] — หน้าสินค้าทัวร์ (สาธารณะ · ไม่ต้องล็อกอิน) · RUN TRIPS W1.1a + W1.2a (เลือกคน/รับส่ง/เสริม → ถือที่)
// ทางเข้าเดียวคือ openBookProduct (ไม่รู้ว่าใคร ⇒ ปิด → ตัวแก้ร้าน/สินค้า → ด่านอัตราปิดเมื่อพัง → ตัวโหลด → นับเปิดดูเมื่อหน้าแสดงได้จริง) · หน้าไม่ส่งเวลาเข้าไป
// 🔴 ชื่อหน้า (metadata) กับเนื้อหาใช้ผลการเปิด **ชุดเดียวกัน** (cache ของ React ต่อคำขอ) — ไม่มีอะไรอ่านข้อมูลร้านนอกด่าน และไม่นับ/ไม่กินเพดานซ้ำ
// ไม่พบ ⇒ notFound() (404 จริง — ห้ามมี loading ใต้เส้นนี้) · ถี่เกิน ⇒ หน้าแจ้ง · สองกรณีนี้ไม่มีชื่อร้าน/สินค้าทั้งในชื่อหน้าและเนื้อหา
// W1.2: ปุ่มจองเปิด (vm.cta.enabled) ⇒ quoteBookSelection (ด่านเดียวกัน · ยอดจากบริการราคา) + nonce ของฟอร์มถือที่ — การเลือกมาจากพารามิเตอร์ GET (ไม่ต้องมี JS)
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BookProduct } from "@/components/book/BookProduct";
import { BookRateLimited } from "@/components/book/BookRateLimited";
import type { BookSelectData } from "@/components/book/BookSelect";
import { quoteBookSelection } from "@/lib/platform/trips-book";
import { bookErrorParam, parseBookSelection, selectionParamsOf } from "@/lib/platform/trips-book-core";
import { bookRequestFromHeaders, openBookProduct } from "@/lib/platform/trips-public";
import { parseBookQuery, parseBookSlot } from "@/lib/platform/trips-public-core";
import { startBookHoldAction } from "../../actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ shop: string; productSlug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const NO_INDEX: Metadata = { robots: { index: false, follow: false } };

// เปิดหน้า 1 ครั้งต่อคำขอ — อาร์กิวเมนต์เป็นค่าพื้นฐานทั้งหมด เพื่อให้ชื่อหน้าและเนื้อหาได้ผลเดียวกัน (นับเปิดดูครั้งเดียว)
// เปิดหน้า 1 ครั้งต่อคำขอ และอ่าน "ผู้ใช้คือใคร" จากหัวคำขอจุดเดียว (มติ X1 ของ W1.1) — ตัวคิดราคาของ W1.2 ใช้ req ชุดเดียวกันจากผลนี้
const openOnce = cache(async (shop: string, productSlug: string, lang: string | null, a: string | null, m: string | null, d: string | null, t: string | null) => {
  const h = await headers();
  const req = bookRequestFromHeaders((name) => h.get(name));
  // TRIPS W1.4a ▸ `t` = JSON {t, n.*, e} (ค่าพื้นฐานตัวเดียวของ cache) — n.* ตรวจรูปที่ platform · e เฉพาะ SOLD_OUT (ก้อนรอบเต็ม) ◂
  const r = await openBookProduct({ shop, productSlug, query: { lang, a, m, d, ...(JSON.parse(t ?? "{}") as Record<string, string>) }, acceptLanguage: req.acceptLanguage, clientKey: req.clientKey, countView: req.countView });
  return { r, req };
});
async function opened(props: Props) {
  const { shop, productSlug } = await props.params;
  const sp = await props.searchParams;
  const q = parseBookQuery(sp);
  const n = Object.fromEntries(Object.entries(selectionParamsOf(sp)).filter(([k]) => k.startsWith("n.")));
  return openOnce(shop, productSlug, q.lang, q.a, q.m, q.d, JSON.stringify({ ...n, ...(parseBookSlot(sp) ? { t: parseBookSlot(sp) } : {}), ...(bookErrorParam(sp)?.code === "SOLD_OUT" ? { e: "SOLD_OUT" } : {}) }));
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { r } = await opened(props);
  if (!r.ok) return NO_INDEX;
  const title = r.vm.product.title.text;
  return { ...NO_INDEX, title: title ? `${title} · ${r.vm.shop.name}` : r.vm.shop.name };
}

export default async function BookProductPage(props: Props) {
  const { r, req } = await opened(props);
  if (!r.ok) {
    if (!("reason" in r)) notFound();
    return <BookRateLimited />;
  }
  const { shop, productSlug } = await props.params;
  const sp = await props.searchParams;
  const vm = r.vm;
  let select: BookSelectData | null = null;
  /** ร้านตั้งเวลาถือสั้นเกินกว่าจะกรอก/โอนทัน ⇒ แสดงแบบปิดจอง "ติดต่อร้าน" (มติ Y1 · platform ตัดสิน) */
  let closed = false;
  const chosen = vm.selected?.slots.find((s) => s.selected && s.selectable) ?? null;
  if (vm.cta.enabled && vm.selected && chosen) {
    const base: Record<string, string> = { ...(r.carry.lang ? { lang: r.carry.lang } : {}), m: vm.month, d: vm.selected.date, ...(chosen.token ? { t: chosen.token } : {}) };
    const params = selectionParamsOf(sp);
    const ask = (withSelection: boolean) =>
      quoteBookSelection({ shop, productSlug, query: { ...base, ...(withSelection ? params : {}) }, acceptLanguage: req.acceptLanguage, clientKey: req.clientKey });
    let q = await ask(true);
    let error = bookErrorParam(sp);
    // การเลือกผิดรูป/ใช้ไม่ได้แล้ว ⇒ แสดงตัวเลือกว่าง + บอกช่องที่ผิด (ไม่สะท้อนค่า)
    if (!q.ok && q.code === "INVALID") {
      error = { code: "INVALID", fields: q.fields ?? [] };
      q = await ask(false);
    }
    if (q.ok) {
      const state = (!error || error.code !== "INVALID" ? parseBookSelection(params) : null) ?? { pax: [], extras: [], zone: null };
      select = { options: q.options, summary: q.summary, state, nonce: q.summary ? q.nonce : null, error, base, shop: vm.shop.slug, seller: q.shop, productSlug: vm.product.slug, holdAction: startBookHoldAction.bind(null, shop, productSlug) };
    } else if (q.code === "RATE_LIMITED") return <BookRateLimited />;
    else if (q.code === "UNAVAILABLE" && q.reason === "HOLD_TOO_SHORT") closed = true;
  }
  return <BookProduct vm={vm} carry={r.carry} select={select} closed={closed} />;
}
