// /book/[shop]/t/[productSlug] — หน้าสินค้าทัวร์ (สาธารณะ · ไม่ต้องล็อกอิน · อ่านอย่างเดียว: ปฏิทินที่ว่าง + ตารางราคา) · RUN TRIPS W1.1a
// ทางเข้าเดียวคือ openBookProduct (ไม่รู้ว่าใคร ⇒ ปิด → ตัวแก้ร้าน/สินค้า → ด่านอัตราปิดเมื่อพัง → ตัวโหลด → นับเปิดดูเมื่อหน้าแสดงได้จริง) · หน้าไม่ส่งเวลาเข้าไป
// 🔴 ชื่อหน้า (metadata) กับเนื้อหาใช้ผลการเปิด **ชุดเดียวกัน** (cache ของ React ต่อคำขอ) — ไม่มีอะไรอ่านข้อมูลร้านนอกด่าน และไม่นับ/ไม่กินเพดานซ้ำ
// ไม่พบ ⇒ notFound() (404 จริง — ห้ามมี loading ใต้เส้นนี้) · ถี่เกิน ⇒ หน้าแจ้ง · สองกรณีนี้ไม่มีชื่อร้าน/สินค้าทั้งในชื่อหน้าและเนื้อหา
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BookProduct } from "@/components/book/BookProduct";
import { BookRateLimited } from "@/components/book/BookRateLimited";
import { bookRequestFromHeaders, openBookProduct } from "@/lib/platform/trips-public";
import { parseBookQuery, parseBookSlot } from "@/lib/platform/trips-public-core";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ shop: string; productSlug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const NO_INDEX: Metadata = { robots: { index: false, follow: false } };

// เปิดหน้า 1 ครั้งต่อคำขอ — อาร์กิวเมนต์เป็นค่าพื้นฐานทั้งหมด เพื่อให้ชื่อหน้าและเนื้อหาได้ผลเดียวกัน (นับเปิดดูครั้งเดียว)
const openOnce = cache(async (shop: string, productSlug: string, lang: string | null, a: string | null, m: string | null, d: string | null, t: string | null) => {
  const h = await headers();
  const req = bookRequestFromHeaders((name) => h.get(name));
  return openBookProduct({ shop, productSlug, query: { lang, a, m, d, t }, acceptLanguage: req.acceptLanguage, clientKey: req.clientKey, countView: req.countView });
});
async function opened(props: Props) {
  const { shop, productSlug } = await props.params;
  const sp = await props.searchParams;
  const q = parseBookQuery(sp);
  return openOnce(shop, productSlug, q.lang, q.a, q.m, q.d, parseBookSlot(sp));
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const r = await opened(props);
  if (!r.ok) return NO_INDEX;
  const title = r.vm.product.title.text;
  return { ...NO_INDEX, title: title ? `${title} · ${r.vm.shop.name}` : r.vm.shop.name };
}

export default async function BookProductPage(props: Props) {
  const r = await opened(props);
  if (!r.ok) {
    if (!("reason" in r)) notFound();
    return <BookRateLimited />;
  }
  return <BookProduct vm={r.vm} carry={r.carry} />;
}
