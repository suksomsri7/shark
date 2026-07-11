import type { UnitType } from "@prisma/client";

// ทะเบียนกลางของ "ระบบ" ทั้งหมดใน SHARK — แหล่งความจริงเดียว
// พอสร้างโมดูลไหนเสร็จ เปลี่ยน status → "available" ที่นี่จุดเดียว (onboarding + sidebar อ่านจากนี่)
export type SystemStatus = "available" | "coming_soon";

// ── ประเภทกิจการ (BusinessUnit type) ที่เลือกตอน onboarding ──
export type UnitTypeMeta = {
  type: UnitType;
  label: string;
  hint: string;
  icon: string;
  status: SystemStatus;
};

export const UNIT_TYPES: UnitTypeMeta[] = [
  { type: "BOOKING", label: "จองคิว / นัดหมาย", hint: "ร้านตัดผม นวด สปา คลินิก", icon: "✂️", status: "available" },
  { type: "RESTAURANT", label: "ร้านอาหาร", hint: "เมนู โต๊ะ ครัว", icon: "🍜", status: "coming_soon" },
  { type: "HOTEL", label: "โรงแรม", hint: "ห้องพัก จอง เช็คอิน", icon: "🏨", status: "coming_soon" },
  { type: "QUEUE", label: "บัตรคิว", hint: "ออกบัตร เรียกคิว", icon: "🎫", status: "coming_soon" },
  { type: "TICKET", label: "ตั๋ว / อีเวนต์", hint: "ขายตั๋ว เช็คอิน", icon: "🎟️", status: "coming_soon" },
  { type: "SHOP", label: "ร้านค้า (POS)", hint: "ขายหน้าร้าน สต็อก", icon: "🛍️", status: "coming_soon" },
];

export const AVAILABLE_UNIT_TYPES = new Set(
  UNIT_TYPES.filter((u) => u.status === "available").map((u) => u.type),
);

// ── โมดูลระดับองค์กร (cross-cutting) ที่โชว์ใน sidebar ──
export type ModuleMeta = { key: string; label: string; href: string; status: SystemStatus };

export const TENANT_MODULES: ModuleMeta[] = [
  { key: "members", label: "สมาชิก / แต้ม", href: "/app/members", status: "coming_soon" },
  { key: "rewards", label: "รางวัล", href: "/app/rewards", status: "coming_soon" },
  { key: "coupons", label: "คูปอง", href: "/app/coupons", status: "coming_soon" },
  { key: "chat", label: "แชท", href: "/app/chat", status: "coming_soon" },
  { key: "meeting", label: "ทีม / ประชุม", href: "/app/meeting", status: "coming_soon" },
  { key: "account", label: "บัญชี", href: "/app/account", status: "coming_soon" },
  { key: "kanban", label: "งาน (Kanban)", href: "/app/kanban", status: "coming_soon" },
];
