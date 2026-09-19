// types.ts — ชนิดข้อมูลกลางของหน้าวัตถุกำหนดเอง (CRM v2 · ใบ C1.9) — **บริสุทธิ์** (ไม่แตะ prisma/next)
// 🔴 คอมโพเนนต์ 'use client' ของโฟลเดอร์นี้ import ได้ตรง ๆ (บทเรียน reference_next_client_component_imports_server_module)

export type ObjectValueView = string | number | boolean | string[] | null;

/** ฟิลด์ 1 ตัวที่ฟอร์มรายการต้องรู้ (ย่อจาก FieldDef ของ engine — ไม่มีค่าอ่อนไหวติดมา) */
export type ObjectFormField = {
  /** id ของ MemberField (ใช้ตรวจ "มีค่าอยู่ไหม" ของฟิลด์อ่อนไหวโดยไม่อ่านค่า) */
  fieldId: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  choices: { value: string; label: string }[];
  /** ฟิลด์อ่อนไหว (ฟิลด์ sensitive หรืออยู่ในส่วน sensitive) */
  sensitive: boolean;
  /**
   * CRM C1.9 ▸ รีวิว B1: ผู้ดูคนนี้ **ไม่มีสิทธิ์** เห็นค่าอ่อนไหวของฟิลด์นี้ (คำตัดสิน D8 เดียวกับ engine — `canViewSensitive`)
   * ⇒ ฟอร์มไม่มีช่องนี้ทั้งตอนเพิ่มและแก้ไข · หน้าแสดง "ซ่อน (ข้อมูลอ่อนไหว)" เฉพาะเมื่อมีค่าอยู่จริง ◂
   */
  hidden: boolean;
};

// CRM C1.9 ▸ รีวิว S1: ฟิลด์ DATETIME = เวลาไทย (+07:00) ทั้งขาเข้าและขาออก — ไม่ขึ้นกับเขตเวลาของเครื่องเบราว์เซอร์/เซิร์ฟเวอร์
const TH_OFFSET_MS = 7 * 60 * 60 * 1000;
/** ค่า ISO ที่เก็บไว้ (UTC) → ค่าในช่อง `datetime-local` แบบเวลาไทย "YYYY-MM-DDTHH:mm" */
export function isoToThaiInput(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t + TH_OFFSET_MS).toISOString().slice(0, 16);
}
/** ค่าจากช่อง `datetime-local` (เวลาไทย) → ISO พร้อม +07:00 ที่ engine รับ · รูปแบบผิด = คืนค่าเดิม (engine แจ้งข้อความไทยเอง) */
export function thaiInputToIso(value: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4] ?? "00"}+07:00` : value;
}
/** ISO → ข้อความวันเวลาไทยสำหรับแสดงผล */
export function thaiDateTimeText(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}
// ◂ CRM C1.9

/** วัตถุ 1 ตัวในแผง "วัตถุที่มีอยู่" ของหน้าตั้งค่า */
export type ObjectListItem = {
  key: string;
  label: string;
  labelPlural: string;
  parentType: string;
  parentLabel: string;
  titleFieldKey: string;
  showAsTab: boolean;
  portalVisible: boolean;
  recordCount: number;
  fieldCount: number;
  archived: boolean;
  templateKey: string | null;
};

/** ค่าที่แสดงผลได้ของฟิลด์ (อาร์เรย์คั่นจุลภาค · true/false เป็นคำไทย · ไม่มีค่า = —) */
export function displayValue(v: ObjectValueView | undefined, choices: { value: string; label: string }[] = [], type?: string): string {
  if (v === undefined || v === null || v === "") return "—";
  if (type === "DATETIME" && typeof v === "string") return thaiDateTimeText(v);
  // ACCEPTANCE-FIX C1.9 (controller · PARITY ภาพ 06): DATE = วันที่ไทยแบบย่อ ("28 ก.ย. 2569") · MONEY = ฿ + ทศนิยม 2 ตำแหน่ง (หน่วยบาท)
  if (type === "DATE" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    return new Date(`${v.slice(0, 10)}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  }
  if (type === "MONEY" && typeof v === "number") return `฿${v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const label = (x: string) => choices.find((c) => c.value === x)?.label ?? x;
  if (Array.isArray(v)) return v.length ? v.map(label).join(", ") : "—";
  if (typeof v === "boolean") return v ? "ใช่" : "ไม่ใช่";
  if (typeof v === "number") return v.toLocaleString("th-TH");
  return label(v);
}

/** เทมเพลตกิจการ 1 ชุดที่หน้าตั้งค่าส่งให้แผง "เพิ่มวัตถุ" (ย่อจาก OBJECT_TEMPLATES) */
export type ObjectTemplateChip = {
  key: string;
  label: string;
  labelPlural: string;
  icon: string;
  parentType: "CUSTOMER" | "CONTACT" | "COMPANY" | "DEAL" | "NONE";
  titleFieldKey: string;
  description: string;
  /** ฟิลด์ข้อความของเทมเพลต (ตัวเลือก "ชื่อรายการคือ") */
  titleChoices: { key: string; label: string }[];
};
