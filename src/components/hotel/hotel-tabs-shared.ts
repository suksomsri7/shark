// SVC H.1 ▸ แท็บโมดูลโรงแรม (ภาพ 08/09/15 แถบบน · ใบสั่ง h.1 §7 · แบบ dorm-home-shared/DormTabs)
//   pure ล้วน (ไม่มี directive · ไม่ import) · available = หน้ามีแล้ว (ใบหลังเปิดเอง) · ราคา ⇔ hotel.rates.read · ตั้งค่า ⇔ hotel.settings.edit

export type HotelTabKey = "calendar" | "reservations" | "frontdesk" | "housekeeping" | "rates" | "reports" | "settings";
export type HotelTab = { key: HotelTabKey; labelTh: string; path: string; available: boolean };
export type HotelTabLink = { key: HotelTabKey; labelTh: string; href: string };

/** ลำดับตามภาพ — path ต่อท้าย /app/u/<slug> */
export const HOTEL_TABS: HotelTab[] = [
  { key: "calendar", labelTh: "ปฏิทินห้อง", path: "/hotel/calendar", available: false }, // H.2
  { key: "reservations", labelTh: "การจอง", path: "/hotel/reservations", available: true },
  { key: "frontdesk", labelTh: "หน้าเคาน์เตอร์", path: "/hotel", available: true },
  { key: "housekeeping", labelTh: "แม่บ้าน", path: "/hotel/housekeeping", available: false }, // H.6
  { key: "rates", labelTh: "ราคา", path: "/hotel/rates", available: true },
  { key: "reports", labelTh: "รายงาน", path: "/hotel/reports", available: false }, // H.7
  { key: "settings", labelTh: "ตั้งค่า", path: "/hotel/settings", available: true },
];

/** แท็บที่ผู้ดูเห็น (ซ่อนแท็บที่ยังไม่มีหน้า · ราคา/ตั้งค่าตามสิทธิ์) · base = /app/u/<slug> */
export function hotelTabsFor(acc: { ratesRead: boolean; settingsEdit: boolean }, base: string): HotelTabLink[] {
  const allowed = (k: HotelTabKey): boolean => (k === "rates" ? acc.ratesRead : k === "settings" ? acc.settingsEdit : true);
  return HOTEL_TABS.filter((t) => t.available && allowed(t.key)).map((t) => ({ key: t.key, labelTh: t.labelTh, href: `${base}${t.path}` }));
}
