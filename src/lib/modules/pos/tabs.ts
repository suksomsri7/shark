// แท็บฟังก์ชันย่อยของระบบขายหน้าร้าน POS — แหล่งเดียว
// ⚠️ ต้องตรงกับ childrenFor("POS") ใน src/app/app/layout.tsx (href ชุดเดียวกัน · ป้ายจากคีย์ pos.nav.* ชุดเดียวกัน)
// เดิมอาร์เรย์นี้ถูกก๊อปไว้ 5 ที่ → ชื่อแท็บเพี้ยนกัน เจ้าของหาหน้าขายไม่เจอ
// POS P1.18 ▸ R13c มติ Q5: ป้ายมาจาก messages `pos.nav.*` (ค่า th = ป้ายเดิม) — ผู้เรียกส่งตัวแปลภาษาได้ (`posTabs(id, t)` โดย t = getTranslations("pos")) ·
//   ไม่ส่ง = ป้ายภาษาไทยจาก messages/th/pos.json (พฤติกรรมเดิมของหน้าที่ยังไม่ส่ง t — งาน P1.18U ส่ง t ทุกหน้า) ◂
import thPos from "@/messages/th/pos.json";

export const POS_NAV_KEYS = ["overview", "register", "products", "stock", "sales", "shifts", "close", "reports", "settings"] as const;
export type PosNavKey = (typeof POS_NAV_KEYS)[number];
/** path ต่อท้าย /app/sys/<id> ของแต่ละแท็บ (ลำดับ = แถบแท็บ) */
const POS_NAV_PATH: Record<PosNavKey, string> = {
  overview: "",
  register: "/pos/register",
  products: "/pos/products",
  stock: "/pos/stock", // POS P1.14 U ▸ ตรวจนับ + รับ/โอน/ปรับ ◂
  sales: "/pos/sales",
  shifts: "/pos/shifts", // POS P1.9 U ▸ กะและลิ้นชักเงิน (ภาพ 07) ◂
  close: "/pos/close",
  reports: "/pos/reports", // POS P1.17 U ▸ รายงาน 7 ชุด ◂
  settings: "/pos/settings", // POS P1.10 U ▸ ใบเสร็จและภาษี · เครื่องและเครื่องพิมพ์ (ภาพ 17A/17B) ◂
};
/** ตัวแปลภาษาของ namespace "pos" (next-intl `t`) — รับคีย์ "nav.<key>" */
export type PosNavTranslate = (key: `nav.${PosNavKey}`) => string;
const thNav = (thPos as { nav: Record<PosNavKey, string> }).nav;
const thLabel: PosNavTranslate = (key) => thNav[key.slice(4) as PosNavKey];

export function posTabs(systemId: string, t: PosNavTranslate = thLabel): { href: string; label: string }[] {
  const s = `/app/sys/${systemId}`;
  return POS_NAV_KEYS.map((k) => ({ href: `${s}${POS_NAV_PATH[k]}`, label: t(`nav.${k}`) }));
}
