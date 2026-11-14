// /book/[shop]/** — "ไม่พบ" ของหน้าจองสาธารณะ (ข้อความเดียวทุกสาเหตุ · สองภาษา · ไม่มีชื่อร้าน/สินค้า) · RUN TRIPS W1.1a
import { BookNotFound } from "@/components/book/BookNotFound";

export default function NotFound() {
  return <BookNotFound />;
}
