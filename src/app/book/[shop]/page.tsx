// /book/[shop] — หน้ารายการสินค้าทัวร์ของร้าน (สาธารณะ · ไม่ต้องล็อกอิน · อ่านอย่างเดียว) · RUN TRIPS W1.1a
// ทางเข้าเดียวคือ openBookShop (ด่านอัตราปิดเมื่อพัง → ตัวแก้ร้าน → ตัวโหลด) · หน้าไม่ส่งเวลาเข้าไป (นาฬิกาจริงของเซิร์ฟเวอร์)
// ไม่พบ ⇒ notFound() (404 จริง — ห้ามมี loading ใต้เส้นนี้) · ถี่เกิน/ไม่รู้ว่าใคร/ด่านใช้ไม่ได้ ⇒ หน้าแจ้งเดียวกัน ไม่มีข้อมูลร้าน
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BookIndex } from "@/components/book/BookIndex";
import { BookRateLimited } from "@/components/book/BookRateLimited";
import { bookClientKey, loadBookShopVM, openBookShop } from "@/lib/platform/trips-public";
import { clientIpFromHeaders, parseBookQuery } from "@/lib/platform/trips-public-core";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ shop: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const NO_INDEX: Metadata = { robots: { index: false, follow: false } };

// อ่านอย่างเดียวสำหรับชื่อหน้า (ไม่ผ่านด่าน ไม่นับเปิดดู) — จำผลไว้ภายในคำขอเดียว
const shopForTitle = cache((shop: string, lang: string | null, acceptLanguage: string | null) => loadBookShopVM({ shop, lang, acceptLanguage }));

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { shop } = await props.params;
  const q = parseBookQuery(await props.searchParams);
  const h = await headers();
  // ไม่รู้ว่าใคร ⇒ หน้าจะปิดอยู่แล้ว — ไม่อ่านข้อมูลร้านมาใส่ชื่อหน้า
  if (bookClientKey(clientIpFromHeaders((name) => h.get(name))) === null) return NO_INDEX;
  const r = await shopForTitle(shop, q.lang, h.get("accept-language"));
  return r.ok ? { ...NO_INDEX, title: r.vm.shop.name } : NO_INDEX;
}

export default async function BookShopPage(props: Props) {
  const { shop } = await props.params;
  const q = parseBookQuery(await props.searchParams);
  const h = await headers();
  const clientKey = bookClientKey(clientIpFromHeaders((name) => h.get(name)));
  const r = await openBookShop({ shop, query: q, acceptLanguage: h.get("accept-language"), clientKey });
  if (!r.ok) {
    if (!("reason" in r)) notFound();
    return <BookRateLimited />;
  }
  return <BookIndex vm={r.vm} carry={r.carry} />;
}
