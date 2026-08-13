// ทะเบียน Widget ของระบบ "การจัดการ" — ทุกเมนูในแอป = 1 widget (มติเจ้าของ: เอาทุกเมนู)
// ⚠️ ต้อง sync กับ childrenFor ใน src/app/app/layout.tsx — ตรวจโดย scripts/qc-pages.mts (RG-*)
//    เมนูใหม่ในแอป → ต้องเพิ่มที่นี่ด้วย ไม่งั้นข้อสอบแดง (กัน registry เน่าเงียบ ๆ)
// key = "B:<UNIT_TYPE><suffix>" (เมนูของหน้างาน) หรือ "S:<SYSTEM_TYPE><suffix>" (เมนูของ feature system)

export type WidgetDef = {
  key: string;
  kind: "business" | "feature";
  type: string; // UnitType หรือ SystemType
  suffix: string; // ต่อท้าย /app/u/<slug> หรือ /app/sys/<id> ("" = หน้าแรกของระบบ)
  label: string;
  icon: string; // emoji เริ่มต้น (admin เปลี่ยนเป็นรูปได้)
};

const B = (type: string, suffix: string, label: string, icon: string): WidgetDef => ({
  key: `B:${type}${suffix}`,
  kind: "business",
  type,
  suffix,
  label,
  icon,
});
const S = (type: string, suffix: string, label: string, icon: string): WidgetDef => ({
  key: `S:${type}${suffix}`,
  kind: "feature",
  type,
  suffix,
  label,
  icon,
});

export const WIDGET_DEFS: WidgetDef[] = [
  // ── หน้างาน (business unit) ──
  B("HOTEL", "/hotel", "ภาพรวมโรงแรม", "🏨"),
  B("HOTEL", "/hotel/reservations", "การจอง", "🛎️"),
  B("HOTEL", "/hotel/setup", "ตั้งค่าห้อง", "🛏️"),
  B("RESTAURANT", "/restaurant", "หน้าร้านอาหาร", "🍜"),
  B("RESTAURANT", "/restaurant/order", "คีย์ออเดอร์", "📝"),
  B("RESTAURANT", "/restaurant/menu", "เมนู", "🍽️"),
  B("RESTAURANT", "/restaurant/menu/options", "ตัวเลือกเมนู", "🧂"),
  B("RESTAURANT", "/restaurant/menu/stock", "สต็อกเมนู", "🧮"),
  B("RESTAURANT", "/restaurant/kds", "ครัว", "👨‍🍳"),
  B("RESTAURANT", "/restaurant/setup", "ตั้งค่าร้านอาหาร", "⚙️"),
  B("SHOP", "/shop", "ภาพรวมร้านออนไลน์", "🛍️"),
  B("SHOP", "/shop/orders", "ออเดอร์", "📦"),
  B("QUEUE", "/queue", "บัตรคิว", "🎫"),
  B("QUEUE", "/queue/setup", "ตั้งค่าคิว", "⚙️"),
  B("TICKET", "/ticket", "อีเวนต์", "🎟️"),
  B("TICKET", "/ticket/checkin", "เช็คอินตั๋ว", "✅"),
  B("BOOKING", "/booking", "นัดวันนี้", "📅"),
  B("BOOKING", "/booking/services", "บริการที่รับจอง", "✂️"),
  B("BOOKING", "/booking/staff", "ใครรับคิว", "🧑‍🔧"),
  B("BOOKING", "/booking/hours", "เวลาทำการ", "🕘"),
  B("BOOKING", "/booking/setup", "ตั้งค่าจองคิว", "⚙️"),
  // หน้างานแบบหน้าเดียว (ไม่มีเมนูย่อยใน childrenFor)
  B("RENTAL", "", "เช่าสินทรัพย์", "🛵"),
  B("SCHOOL", "", "คอร์สเรียน", "🎓"),
  B("CLINIC", "", "คลินิก", "🏥"),

  // ── feature systems ──
  S("POS", "", "ภาพรวมการขาย", "🧾"),
  S("POS", "/pos/register", "ขายหน้าร้าน", "💵"),
  S("POS", "/pos/products", "สินค้า/บริการ (POS)", "🏷️"),
  S("POS", "/pos/sales", "ประวัติบิล", "🧾"),
  S("POS", "/pos/close", "ปิดวัน", "🌙"),
  S("ACCOUNT", "", "ภาพรวมบัญชี", "📒"),
  S("ACCOUNT", "/account/documents", "เอกสารบัญชี", "📄"),
  S("ACCOUNT", "/account/journal", "สมุดรายวัน", "📓"),
  S("ACCOUNT", "/account/reports", "รายงานบัญชี", "📊"),
  S("ACCOUNT", "/account/accounts", "ผังบัญชี", "🗂️"),
  S("ACCOUNT", "/account/tax", "ภาษี", "🧾"),
  S("ACCOUNT", "/account/contacts", "คู่ค้า", "🤝"),
  S("ACCOUNT", "/account/aging", "อายุหนี้", "⏳"),
  S("ACCOUNT", "/account/periods", "งวดบัญชี", "🗓️"),
  S("ACCOUNT", "/account/assets", "สินทรัพย์", "🏗️"),
  S("ACCOUNT", "/account/cheque", "เช็ค", "🏦"),
  S("HR", "", "ภาพรวมพนักงาน", "🧑‍💼"),
  S("HR", "/hr/attendance", "ลงเวลา", "⏱️"),
  S("HR", "/hr/kiosk", "จอลงเวลา", "🖥️"),
  S("HR", "/hr/leave", "ใบลา", "🏖️"),
  S("HR", "/hr/employees", "พนักงาน", "🧑‍🤝‍🧑"),
  S("HR", "/hr/payroll", "เงินเดือน", "💰"),
  S("INVENTORY", "", "ภาพรวมสินค้า/บริการ", "📦"),
  S("INVENTORY", "/inventory/items", "สินค้า", "📦"),
  S("INVENTORY", "/inventory/services", "บริการ", "✂️"),
  S("INVENTORY", "/inventory/count", "นับสต็อก", "🔢"),
  S("INVENTORY", "/inventory/movements", "รับเข้า", "📥"),
  S("INVENTORY", "/inventory/locations", "คลัง", "🏬"),
  S("INVENTORY", "/inventory/procurement", "จัดซื้อ", "🛒"),
  S("INVENTORY", "/inventory/settings", "ตั้งค่าสินค้า/บริการ", "⚙️"),
  S("CRM", "", "ภาพรวม CRM", "🎯"),
  S("CRM", "/crm/deals", "ดีล", "💼"),
  S("CRM", "/crm/activities", "งานติดตาม", "📌"),
  S("CRM", "/crm/contacts", "ผู้ติดต่อ", "📇"),
  S("MARKETING", "", "ภาพรวมการตลาด", "📣"),
  S("MARKETING", "/marketing/campaigns", "แคมเปญ", "🚀"),
  S("COUPON", "", "ภาพรวมคูปอง", "🎟"),
  S("COUPON", "/coupon/list", "คูปอง", "🏷️"),
  S("MEMBER", "", "ภาพรวมสมาชิก", "👥"),
  S("MEMBER", "/member/customers", "รายชื่อสมาชิก", "📇"),
  S("MEMBER", "/member/import", "นำเข้า CSV", "📤"),
  S("MEMBER", "/member/plans", "แพ็กเกจสมาชิก", "📦"),
  S("MEMBER", "/member/tiers", "ระดับสมาชิก", "🏅"),
  S("MEMBER", "/member/subscribe", "สมัครสมาชิก", "✍️"),
  S("POINT", "", "ภาพรวมแต้ม", "⭐"),
  S("POINT", "/point/settings", "ตั้งค่าแต้ม", "⚙️"),
  S("POINT", "/point/adjust", "ปรับแต้ม", "➕"),
  S("POINT", "/point/ledger", "ประวัติแต้ม", "📜"),
  S("REWARD", "", "ภาพรวมรางวัล", "🎁"),
  S("REWARD", "/reward/rewards", "รายการรางวัล", "🎁"),
  S("REWARD", "/reward/redeem", "แลกรางวัล", "🎉"),
  S("REWARD", "/reward/history", "ประวัติการแลก", "📜"),
  S("CHAT", "", "ภาพรวมแชท", "💬"),
  S("CHAT", "/chat", "สนทนา", "💬"),
  S("CHAT", "/chat/channels", "เชื่อมช่องทาง", "🔌"),
  S("MEETING", "", "ภาพรวม Meeting", "🗓"),
  S("MEETING", "/meeting", "ห้องแชทภายใน", "🗣️"),
  S("KANBAN", "", "ภาพรวมบอร์ดงาน", "📋"),
  S("KANBAN", "/kanban/my-tasks", "งานของฉัน", "☑️"),
  S("KANBAN", "/kanban/boards", "บอร์ดงาน", "📋"),
];

export const widgetDef = (key: string) => WIDGET_DEFS.find((w) => w.key === key);

/** widget ที่เลือกได้สำหรับกิจการหนึ่ง = เมนูของหน้างานชนิดนั้น + เมนูของ feature system ที่มีให้ใช้ */
export function widgetsFor(unitType: string, featureTypes: Set<string>): WidgetDef[] {
  return WIDGET_DEFS.filter((w) =>
    w.kind === "business" ? w.type === unitType : featureTypes.has(w.type),
  );
}

/** แปลง widget → URL จริง (business ใช้ slug ของหน้างาน · feature ใช้ id ของระบบ) */
export function widgetHref(def: WidgetDef, unitSlug: string, systemIdByType: Map<string, string>): string | null {
  if (def.kind === "business") return `/app/u/${unitSlug}${def.suffix}`;
  const systemId = systemIdByType.get(def.type);
  return systemId ? `/app/sys/${systemId}${def.suffix}` : null;
}
