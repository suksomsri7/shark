// SVC H.10 ▸ ตัวช่วยจอช่องทาง OTA (pure · ไม่มี directive · ไม่ import ฝั่งเซิร์ฟเวอร์)
export const BTN = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[color:var(--color-line)] px-4 py-2 text-sm disabled:opacity-50";
export const BTN_PRIMARY = "inline-flex min-h-11 items-center justify-center rounded-lg bg-[color:var(--color-ink)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
export const INPUT = "min-h-11 w-full rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm";
export const CARD = "flex flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4";

export const CONN_STATUS_TH: Record<string, string> = { CONNECTED: "เชื่อมแล้ว", ERROR: "ขัดข้อง", DRAFT: "ยังไม่ทดสอบ", DISABLED: "ถอดแล้ว" };
export const JOB_STATUS_TH: Record<string, string> = { PENDING: "รอส่ง", SENT: "ส่งแล้ว", FAILED: "ส่งไม่สำเร็จ", SUPERSEDED: "ข้าม (ค่าเดิม/มีงานใหม่แทน)" };
export const INBOX_STATUS_TH: Record<string, string> = { RECEIVED: "รับแล้ว รอลงปฏิทิน", APPLIED: "ลงปฏิทินแล้ว", NEEDS_ROOM: "ต้องจัดห้อง", REJECTED: "ปฏิเสธแล้ว" };

const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "YYYY-MM-DD" ⇒ "7 พ.ย." (ไม่พึ่งเขตเวลา) */
export function thDay(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "-";
  return `${Number(ymd.slice(8, 10))} ${TH_MONTH[Number(ymd.slice(5, 7)) - 1] ?? ""}`;
}
/** สตางค์ ⇒ "1,483.50" */
export const baht = (satang: number): string => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: satang % 100 ? 2 : 0, maximumFractionDigits: 2 });
/** bp ⇒ "15%" */
export const pct = (bp: number | null | undefined): string => (typeof bp === "number" ? `${(bp / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}%` : "ค่าตั้งของร้าน");
/** ISO ⇒ เวลาไทยสั้น */
export function thTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
