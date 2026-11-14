// components/book/BookNotFound.tsx — หน้า "ไม่พบ" ของหน้าจองสาธารณะ · RUN TRIPS W1.1a
// ข้อความเดียวทุกสาเหตุ (ร้านไม่มี / ไม่เปิด / สินค้าไม่เผยแพร่ / ลิงก์ผิด) · ไม่มีชื่อร้านหรือสินค้า · สองภาษา (not-found ไม่ได้รับพารามิเตอร์ของหน้า)
import { BookNoticeFrame } from "./BookShell";
import { bookT } from "./book-i18n";

export function BookNotFound() {
  const th = bookT("th");
  const en = bookT("en");
  return (
    <BookNoticeFrame testId="book-not-found">
      <div lang="th">
        <h1 className="text-lg font-semibold">{th("notFound.title")}</h1>
        <p className="mt-2 text-sm text-[color:var(--color-ink-soft)]">{th("notFound.body")}</p>
      </div>
      <div lang="en" className="mt-5 border-t pt-5">
        <p className="text-base font-semibold">{en("notFound.title")}</p>
        <p className="mt-2 text-sm text-[color:var(--color-ink-soft)]">{en("notFound.body")}</p>
      </div>
    </BookNoticeFrame>
  );
}
