// SVC D.13 ▸ ของใช้ร่วมของหน้าแรกหอ + แท็บโมดูลหอ (ledger/svc-briefs/svc-brief-d.13.md §8)
//   pure ล้วน (ไม่มี directive · ไม่ import อะไร) · วันที่จากสตริง "YYYY-MM-DD" เท่านั้น (ไม่อ่านนาฬิกา · ไม่ใช้เมธอดวันที่ของ Date)

export type DormTabKey = "board" | "tenants" | "meter" | "settings";
export type DormTab = { key: DormTabKey; labelTh: string; path: string };
export type DormTabLink = { key: DormTabKey; labelTh: string; href: string };

/** แท็บของโมดูลหอ (บิล/แจ้งซ่อม/ประกาศ/รายงาน เพิ่มเมื่อมีหน้า) — path ต่อท้าย /app/u/<slug> */
export const DORM_TABS: DormTab[] = [
  { key: "board", labelTh: "ผังห้อง", path: "/dorm" },
  { key: "tenants", labelTh: "ผู้เช่า/สัญญา", path: "/dorm/tenants" },
  { key: "meter", labelTh: "จดมิเตอร์", path: "/dorm/meter" },
  { key: "settings", labelTh: "ตั้งค่า", path: "/dorm/settings" },
];

/** แท็บที่ผู้ดูเห็น: board/settings ⇔ board · tenants ⇔ leaseView · meter ⇔ meter · base = /app/u/<slug> */
export function dormTabsFor(acc: { board: boolean; meter: boolean; leaseView: boolean }, base: string): DormTabLink[] {
  const show: Record<DormTabKey, boolean> = { board: acc.board, tenants: acc.leaseView, meter: acc.meter, settings: acc.board };
  return DORM_TABS.filter((t) => show[t.key]).map((t) => ({ key: t.key, labelTh: t.labelTh, href: `${base}${t.path}` }));
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const PERIOD_RE = /^(\d{4})-(\d{2})/;
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-10" (หรือ "2026-10-xx") → "ต.ค." */
export function thaiMonthShort(period: string): string {
  const m = PERIOD_RE.exec(period ?? "");
  return m ? (TH_MONTHS[Number(m[2]) - 1] ?? "") : "";
}

/** "2026-11-15" → "15 พ.ย." */
export function thaiShortDate(ymd: string): string {
  const m = YMD_RE.exec(ymd ?? "");
  if (!m) return "";
  return `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1] ?? ""}`.trim();
}

/** "2026-11" → "พ.ย. 2569" */
export function thaiMonthYear(period: string): string {
  const m = PERIOD_RE.exec(period ?? "");
  return m ? `${TH_MONTHS[Number(m[2]) - 1] ?? ""} ${Number(m[1]) + 543}` : "";
}

/** สตางค์ → "133,912.80" (ไม่มี ฿ · จำนวนเต็มสตางค์ ไม่ใช้ทศนิยมลอย) */
export function bahtText(satang: number): string {
  const n = Math.round(Number.isFinite(satang) ? satang : 0);
  const neg = n < 0;
  const a = Math.abs(n);
  const baht = Math.floor(a / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${baht}.${String(a % 100).padStart(2, "0")}`;
}

/** สตางค์ → "5,214" (ปัดลงเป็นบาท มีจุลภาค) */
export function bahtFloor(satang: number): string {
  return Math.floor(Math.max(0, satang) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// SVC D.10 ▸ แท็บ "บิล/รับเงิน" (ภาพ หอ 06) — เฉพาะผู้มี dorm.slip.review หรือ dorm.payment.manual · แทรกก่อน "ตั้งค่า"
//   แยกจาก dormTabsFor (ผลของ dormTabsFor คงเดิมทุกไบต์) · ผู้เรียกส่งผลของ dormTabsFor + สิทธิ์ ◂
export const DORM_PAY_TAB = { key: "payments", labelTh: "บิล/รับเงิน", path: "/dorm/payments" } as const;
export function dormTabsWithPay(tabs: DormTabLink[], pay: boolean, base: string): DormTabLink[] {
  if (!pay) return tabs;
  const link = { key: DORM_PAY_TAB.key as unknown as DormTabKey, labelTh: DORM_PAY_TAB.labelTh, href: `${base}${DORM_PAY_TAB.path}` };
  const at = tabs.findIndex((t) => t.key === "settings");
  return at < 0 ? [...tabs, link] : [...tabs.slice(0, at), link, ...tabs.slice(at)];
}
