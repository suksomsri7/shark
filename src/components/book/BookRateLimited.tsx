// components/book/BookRateLimited.tsx — หน้า "เปิดถี่เกินไป" ของหน้าจองสาธารณะ · RUN TRIPS W1.1a
// ข้อความเดียวทุกเหตุ (เกินเพดาน / ไม่รู้ว่าใคร / ด่านใช้ไม่ได้ — ไม่บอกเหตุย่อย) · ไม่มีข้อมูลร้าน · สองภาษา
import { BookNoticeFrame } from "./BookShell";
import { bookT } from "./book-i18n";

export function BookRateLimited() {
  const th = bookT("th");
  const en = bookT("en");
  return (
    <BookNoticeFrame testId="book-rate-limited">
      <div lang="th">
        <h1 className="text-lg font-semibold">{th("rate.title")}</h1>
        <p className="mt-2 text-sm text-[color:var(--color-ink-soft)]">{th("rate.body")}</p>
      </div>
      <div lang="en" className="mt-5 border-t pt-5">
        <p className="text-base font-semibold">{en("rate.title")}</p>
        <p className="mt-2 text-sm text-[color:var(--color-ink-soft)]">{en("rate.body")}</p>
      </div>
    </BookNoticeFrame>
  );
}
