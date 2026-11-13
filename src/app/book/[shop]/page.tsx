// /book/[shop] — หน้ารายการสินค้าทัวร์ของร้าน (สาธารณะ · ไม่ต้องล็อกอิน · อ่านอย่างเดียว) · RUN TRIPS W1.1a
// ทางเข้าเดียวคือ openBookShop (ไม่รู้ว่าใคร ⇒ ปิด → ตัวแก้ร้าน → ด่านอัตราปิดเมื่อพัง → ตัวโหลด) · หน้าไม่ส่งเวลาเข้าไป (นาฬิกาจริงของเซิร์ฟเวอร์)
// 🔴 ชื่อหน้า (metadata) กับเนื้อหาใช้ผลการเปิด **ชุดเดียวกัน** (cache ของ React ต่อคำขอ) — ไม่มีอะไรอ่านข้อมูลร้านนอกด่าน และไม่นับ/ไม่กินเพดานซ้ำ
// ไม่พบ ⇒ notFound() (404 จริง — ห้ามมี loading ใต้เส้นนี้) · ถี่เกิน/ไม่รู้ว่าใคร/ด่านใช้ไม่ได้ ⇒ หน้าแจ้งเดียวกัน · สองกรณีนี้ไม่มีชื่อร้านทั้งในชื่อหน้าและเนื้อหา
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BookIndex } from "@/components/book/BookIndex";
import { BookRateLimited } from "@/components/book/BookRateLimited";
import { bookRequestFromHeaders, openBookShop } from "@/lib/platform/trips-public";
import { parseBookQuery } from "@/lib/platform/trips-public-core";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ shop: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const NO_INDEX: Metadata = { robots: { index: false, follow: false } };

// เปิดหน้า 1 ครั้งต่อคำขอ — อาร์กิวเมนต์เป็นค่าพื้นฐานทั้งหมด เพื่อให้ชื่อหน้าและเนื้อหาได้ผลเดียวกัน
const openOnce = cache(async (shop: string, lang: string | null, a: string | null) => {
  const h = await headers();
  const req = bookRequestFromHeaders((name) => h.get(name));
  return openBookShop({ shop, query: { lang, a }, acceptLanguage: req.acceptLanguage, clientKey: req.clientKey });
});
async function opened(props: Props) {
  const { shop } = await props.params;
  const q = parseBookQuery(await props.searchParams);
  return openOnce(shop, q.lang, q.a);
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const r = await opened(props);
  return r.ok ? { ...NO_INDEX, title: r.vm.shop.name } : NO_INDEX;
}

export default async function BookShopPage(props: Props) {
  const r = await opened(props);
  if (!r.ok) {
    if (!("reason" in r)) notFound();
    return <BookRateLimited />;
  }
  return <BookIndex vm={r.vm} carry={r.carry} />;
}
