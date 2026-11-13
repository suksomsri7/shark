// /book/[shop]/t/[productSlug] — หน้าสินค้าทัวร์ (สาธารณะ · ไม่ต้องล็อกอิน · อ่านอย่างเดียว: ปฏิทินที่ว่าง + ตารางราคา) · RUN TRIPS W1.1a
// ทางเข้าเดียวคือ openBookProduct (ด่านอัตราปิดเมื่อพัง + นับเปิดดู 1 ครั้งต่อเครื่องต่อวัน → ตัวโหลด) · หน้าไม่ส่งเวลาเข้าไป
// ไม่พบ ⇒ notFound() (404 จริง — ห้ามมี loading ใต้เส้นนี้) · ถี่เกิน ⇒ หน้าแจ้ง ไม่มีข้อมูลร้าน
// ชื่อหน้าใช้ตัวอ่านรายการของร้าน (เบา · ไม่ผ่านด่าน · ไม่นับเปิดดู) — ไม่เรียกทางเข้าของหน้าซ้ำ
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BookProduct } from "@/components/book/BookProduct";
import { BookRateLimited } from "@/components/book/BookRateLimited";
import { bookClientKey, loadBookShopVM, openBookProduct } from "@/lib/platform/trips-public";
import { clientIpFromHeaders, parseBookQuery } from "@/lib/platform/trips-public-core";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ shop: string; productSlug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const NO_INDEX: Metadata = { robots: { index: false, follow: false } };

const shopForTitle = cache((shop: string, lang: string | null, acceptLanguage: string | null) => loadBookShopVM({ shop, lang, acceptLanguage }));

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { shop, productSlug } = await props.params;
  const q = parseBookQuery(await props.searchParams);
  const h = await headers();
  // ไม่รู้ว่าใคร ⇒ หน้าจะปิดอยู่แล้ว — ไม่อ่านข้อมูลร้านมาใส่ชื่อหน้า
  if (bookClientKey(clientIpFromHeaders((name) => h.get(name))) === null) return NO_INDEX;
  const r = await shopForTitle(shop, q.lang, h.get("accept-language"));
  if (!r.ok) return NO_INDEX;
  const product = r.vm.products.find((p) => p.slug === productSlug);
  return { ...NO_INDEX, title: product?.title.text ? `${product.title.text} · ${r.vm.shop.name}` : r.vm.shop.name };
}

export default async function BookProductPage(props: Props) {
  const { shop, productSlug } = await props.params;
  const q = parseBookQuery(await props.searchParams);
  const h = await headers();
  const clientKey = bookClientKey(clientIpFromHeaders((name) => h.get(name)));
  const r = await openBookProduct({ shop, productSlug, query: q, acceptLanguage: h.get("accept-language"), clientKey });
  if (!r.ok) {
    if (!("reason" in r)) notFound();
    return <BookRateLimited />;
  }
  return <BookProduct vm={r.vm} carry={r.carry} />;
}
