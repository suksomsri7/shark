import type { SystemType, UnitType } from "@prisma/client";

// ทะเบียน "ระบบ" ทั้ง 14 — ทุกอย่างคือระบบ เท่าเทียมกัน สร้างได้หลายชุด เชื่อมถึงกันได้
// kind "business" = ระบบที่มีหน้างาน/ลูกค้า (เก็บเป็น BusinessUnit — มี slug/storefront)
// kind "feature"  = ระบบข้อมูล/บริการ (เก็บเป็น AppSystem — เชื่อมเข้าระบบ business ได้)
export type SystemStatus = "available" | "coming_soon";
export type SystemKind = "business" | "feature";

export type SystemDef = {
  code: string; // รหัสในระบบ (ตรง enum)
  no: number; // ลำดับตามพิมพ์เขียว
  kind: SystemKind;
  label: string;
  hint: string;
  icon: string;
  status: SystemStatus;
};

export const SYSTEM_DEFS: SystemDef[] = [
  { code: "HOTEL", no: 1, kind: "business", label: "โรงแรม", hint: "ห้องพัก จอง เช็คอิน", icon: "🏨", status: "available" },
  { code: "RESTAURANT", no: 2, kind: "business", label: "ร้านอาหาร", hint: "เมนู โต๊ะ ครัว", icon: "🍜", status: "available" },
  { code: "BOOKING", no: 3, kind: "business", label: "จองคิว / นัดหมาย", hint: "นัดหมายตามเวลา นวด สปา คลินิก ทำเล็บ", icon: "📅", status: "available" },
  { code: "QUEUE", no: 4, kind: "business", label: "บัตรคิว (Q)", hint: "ออกบัตร เรียกคิว", icon: "🎫", status: "available" },
  { code: "TICKET", no: 5, kind: "business", label: "ตั๋ว / อีเวนต์", hint: "ขายตั๋ว เช็คอิน", icon: "🎟️", status: "available" },
  { code: "MEMBER", no: 6, kind: "feature", label: "สมาชิก (Member)", hint: "ฐานลูกค้า/สมาชิก", icon: "👥", status: "available" },
  { code: "REWARD", no: 7, kind: "feature", label: "รางวัล (Reward)", hint: "แลกของด้วยแต้ม", icon: "🎁", status: "available" },
  { code: "COUPON", no: 8, kind: "feature", label: "คูปอง & Voucher", hint: "ส่วนลด โค้ด", icon: "🎟", status: "available" },
  { code: "POINT", no: 9, kind: "feature", label: "แต้ม (Point)", hint: "สะสมแต้ม", icon: "⭐", status: "available" },
  { code: "CHAT", no: 10, kind: "feature", label: "รวม Chat", hint: "แชทลูกค้า", icon: "💬", status: "coming_soon" },
  { code: "MEETING", no: 11, kind: "feature", label: "Meeting", hint: "แชทภายในองค์กร", icon: "🗓", status: "available" },
  { code: "ACCOUNT", no: 12, kind: "feature", label: "บัญชี (Account)", hint: "รายรับรายจ่าย", icon: "📒", status: "available" },
  { code: "KANBAN", no: 13, kind: "feature", label: "Kanban", hint: "บอร์ดงาน", icon: "📋", status: "available" },
  { code: "POS", no: 14, kind: "feature", label: "ร้านค้า POS", hint: "ขาย บิล ยอดขาย", icon: "🧾", status: "available" },
  { code: "AI", no: 15, kind: "feature", label: "AI พนักงาน", hint: "จ้างพนักงาน AI ทำงานแทน 24 ชม.", icon: "🤖", status: "coming_soon" },
  { code: "KB", no: 16, kind: "feature", label: "คลังความรู้ (KB)", hint: "FAQ/ความรู้ร้าน ให้ AI และทีมใช้ตอบ", icon: "📚", status: "coming_soon" },
  { code: "HR", no: 17, kind: "feature", label: "พนักงาน (HR)", hint: "เวลาเข้างาน ขาด ลา มาสาย กะ", icon: "🧑‍💼", status: "coming_soon" },
  { code: "INVENTORY", no: 18, kind: "feature", label: "คลังสินค้า / สต็อก", hint: "สต็อกกลาง รับเข้า-ตัดออก แจ้งใกล้หมด", icon: "📦", status: "coming_soon" },
];

export const systemDef = (code: string) => SYSTEM_DEFS.find((s) => s.code === code);

export const AVAILABLE_BUSINESS = new Set(
  SYSTEM_DEFS.filter((s) => s.kind === "business" && s.status === "available").map(
    (s) => s.code as UnitType,
  ),
);
export const AVAILABLE_FEATURE = new Set(
  SYSTEM_DEFS.filter((s) => s.kind === "feature" && s.status === "available").map(
    (s) => s.code as SystemType,
  ),
);
