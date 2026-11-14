// retention.ts — คำเตือนหน้าที่เก็บเอกสารก่อนลบร้าน (ACC T4.5 · K2 K6) · ใช้ทั้งหน้าความเป็นส่วนตัว และ server action ขอลบร้าน
//   ตัวเลขระยะเก็บ = ตารางค่ากฎหมาย (BOOKS_RETENTION_YEARS · ร้านทับได้) · ไม่บล็อก — สมุดที่ยังไม่ครบระยะ = คำเตือนต้องติ๊กรับทราบ
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/warnings";
import { retentionNotice, type RetentionBookNotice } from "@/lib/modules/account/books-export";

const thDate = (ymd: string) => new Date(`${ymd}T12:00:00+07:00`).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });

export async function deletionRetentionWarnings(tenantId: string): Promise<{ warnings: LegalWarning[]; books: RetentionBookNotice[] }> {
  const books = await retentionNotice(tenantId);
  const warnings: LegalWarning[] = [];
  if (books.length > 0) {
    warnings.push(legalWarning("SHOP_RECORDS_RETENTION_DUTY", { years: Math.max(...books.map((b) => b.retentionYears)) }));
    for (const b of books.filter((x) => x.withinRetention && x.lastEntryDate && x.keepUntil))
      warnings.push(legalWarning("SHOP_DELETE_WITHIN_RETENTION", { book: b.name, last: thDate(b.lastEntryDate!), until: thDate(b.keepUntil!), years: b.retentionYears }));
    warnings.push(legalWarning("PAPER_ORIGINALS_KEEP"));
  }
  return { warnings, books };
}
