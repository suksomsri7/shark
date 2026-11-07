// SVC H.4 ▸ ชิ้น pure ของจอเช็กอิน/ทะเบียนผู้พัก/ตม.30 (ภาพ 09 ครึ่งซ้าย) — ไม่มี import ค่า · ไม่มี directive (ใช้ได้ทั้งหน้าเซิร์ฟเวอร์และคอมโพเนนต์)
//   • ข้อความไทยของขั้นเช็กอิน · ป้าย ร.ร.3/ตม.30 · ตัวช่วยปิดเลข (เห็นเฉพาะ 4 ตัวท้าย) · วันเวลาไทย
import type { GuestDto, Rr3View, Rr4Row, Tm30Item, AssignableRoom, IdProposal } from "@/lib/modules/hotel";

export type { GuestDto, Rr3View, Rr4Row, Tm30Item, AssignableRoom, IdProposal };

export type CheckinReservation = {
  id: string;
  code: string;
  status: string;
  guestName: string;
  roomTypeName: string;
  roomId: string | null;
  roomNumber: string | null;
  checkIn: string;
  checkOut: string;
  checkedInAt: string | null;
  source: string;
  adults: number;
  children: number;
  depositDueSatang: number;
  securityDepositSatang: number;
  today: string;
};
export type CheckinPerms = { checkIn: boolean; register: boolean; canViewId: boolean; manage: boolean; isManager: boolean };
export type CheckinSettings = {
  aiIdReader: boolean;
  rr3OnScreen: boolean;
  keepIdImageDefault: boolean;
  tm30Enabled: boolean;
  securityDeposit: { required: boolean; amountSatang: number };
};
/** ผลของ server action ที่จอใช้ (ข้อมูล ไม่ throw) */
export type ActionResult = { ok: boolean; code?: string; reason?: string; [k: string]: unknown };
export type ActionRunner = () => Promise<ActionResult>;
export type AfterAction = (r: Record<string, unknown>) => void;
export type CheckinPrimaryCard = { recordedByName: string | null; signatureUrl: string | null; idImageUrl: string | null; signedOnPaper: boolean } | null;

/** ฟอร์มผู้พัก 1 คน (ฝั่งจอ) — idNo = เลขที่พนักงานกำลังพิมพ์ (ไม่เคยเติมจาก DTO) */
export type GuestFormValue = {
  fullName: string;
  nationality: string;
  idType: "PASSPORT" | "THAI_ID" | "OTHER";
  idNo: string;
  dob: string;
  sex: "" | "M" | "F" | "X";
  occupation: string;
  address: string;
  arrivedFrom: string;
  nextDestination: string;
  visaType: string;
  visaNo: string;
  arrivalDate: string;
  portOfEntry: string;
  tm6No: string;
  docExpiry: string;
  keepIdImage: boolean;
  imageDataUrl: string;
  aiProposed: boolean;
  confirmed: boolean;
};
export function emptyGuestForm(keepIdImage: boolean, thai: boolean): GuestFormValue {
  return {
    fullName: "",
    nationality: thai ? "THA" : "",
    idType: thai ? "THAI_ID" : "PASSPORT",
    idNo: "",
    dob: "",
    sex: "",
    occupation: "",
    address: "",
    arrivedFrom: "",
    nextDestination: "",
    visaType: "",
    visaNo: "",
    arrivalDate: "",
    portOfEntry: "",
    tm6No: "",
    docExpiry: "",
    keepIdImage,
    imageDataUrl: "",
    aiProposed: false,
    confirmed: false,
  };
}
/** ฟอร์ม → อินพุตของ action (ช่องว่าง = ไม่ส่ง) */
export function guestPayload(v: GuestFormValue): Record<string, unknown> {
  const opt = (s: string) => (s.trim() ? s.trim() : undefined);
  return {
    fullName: v.fullName.trim(),
    nationality: v.nationality.trim().toUpperCase(),
    idType: v.idType,
    idNumber: v.idNo.trim(),
    dob: opt(v.dob),
    sex: v.sex || undefined,
    occupation: opt(v.occupation),
    address: opt(v.address),
    arrivedFrom: opt(v.arrivedFrom),
    nextDestination: opt(v.nextDestination),
    visaType: opt(v.visaType),
    visaNo: opt(v.visaNo),
    arrivalDate: opt(v.arrivalDate),
    portOfEntry: opt(v.portOfEntry),
    tm6No: opt(v.tm6No),
    docExpiry: opt(v.docExpiry),
    keepIdImage: v.keepIdImage,
    aiProposed: v.aiProposed,
    confirmed: v.aiProposed ? v.confirmed : undefined,
    ...(v.imageDataUrl ? { idImage: { dataUrl: v.imageDataUrl } } : {}),
  };
}

/** เลขแบบปิด — เห็นเฉพาะ 4 ตัวท้าย (มติ §9 ข้อ 7) */
export const maskLast4 = (last4: string | null | undefined): string => (last4 ? `••••${last4}` : "—");

export const ID_TYPE_LABEL: Record<string, string> = { PASSPORT: "หนังสือเดินทาง", THAI_ID: "บัตรประชาชน", OTHER: "เอกสารอื่น" };
export const SEX_LABEL: Record<string, string> = { M: "ชาย", F: "หญิง", X: "ไม่ระบุ" };
export const TM30_LABEL: Record<string, string> = { NOT_REQUIRED: "ไม่ต้องแจ้ง", PENDING: "รอแจ้ง ตม.30", FILED: "แจ้ง ตม.30 แล้ว", LATE: "เกิน 24 ชม. ยังไม่แจ้ง" };
export const TM30_TONE: Record<string, string> = {
  NOT_REQUIRED: "border-[color:var(--color-line)] text-[color:var(--color-muted)]",
  PENDING: "border-amber-300 bg-amber-50 text-amber-800",
  FILED: "border-emerald-300 bg-emerald-50 text-emerald-800",
  LATE: "border-rose-300 bg-rose-50 text-rose-700",
};
/** สัญชาติที่ใช้บ่อยหน้าเคาน์เตอร์ (รหัส ISO-3 · กรอกรหัสอื่นเองได้) */
export const COMMON_NATIONALITIES: readonly { code: string; th: string }[] = [
  { code: "THA", th: "ไทย" },
  { code: "CHN", th: "จีน" },
  { code: "MYS", th: "มาเลเซีย" },
  { code: "JPN", th: "ญี่ปุ่น" },
  { code: "KOR", th: "เกาหลีใต้" },
  { code: "IND", th: "อินเดีย" },
  { code: "RUS", th: "รัสเซีย" },
  { code: "USA", th: "อเมริกัน" },
  { code: "GBR", th: "อังกฤษ" },
  { code: "DEU", th: "เยอรมัน" },
  { code: "FRA", th: "ฝรั่งเศส" },
  { code: "AUS", th: "ออสเตรเลีย" },
  { code: "SGP", th: "สิงคโปร์" },
  { code: "LAO", th: "ลาว" },
  { code: "MMR", th: "เมียนมา" },
  { code: "KHM", th: "กัมพูชา" },
  { code: "VNM", th: "เวียดนาม" },
];
export function nationalityText(code: string | null | undefined, th: string | null | undefined): string {
  if (!code) return "—";
  return th ? `${th} (${code})` : code;
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const TH_DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
/** "ศ. 6 พ.ย." จาก ปปปป-ดด-วว (คำนวณวันในสัปดาห์จากวันที่ UTC ของสตริง — ไม่ใช้เวลาเครื่อง) */
export function dateShortTh(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return "—";
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${TH_DOW[dow]} ${d} ${TH_MONTHS[m - 1]}`;
}
/** "6 พ.ย. 2569" */
export function dateLongTh(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return "—";
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number) as [number, number, number];
  return `${d} ${TH_MONTHS[m - 1]} ${y + 543}`;
}
/** วันเวลาไทยจาก ISO: "ศ. 6 พ.ย. 14:10" */
export function dateTimeTh(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const b = new Date(t + 7 * 3_600_000).toISOString();
  return `${dateShortTh(b.slice(0, 10))} ${b.slice(11, 16)}`;
}
/** ชั่วโมงที่เหลือก่อนครบ 24 ชม. (ติดลบ = เลยแล้ว) */
export function hoursLeft(dueIso: string | null | undefined, nowMs: number): number | null {
  if (!dueIso) return null;
  const t = Date.parse(dueIso);
  return Number.isNaN(t) ? null : Math.floor((t - nowMs) / 3_600_000);
}
export const moneyTh = (satang: number): string => `฿${(satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

/** ขั้นของการ์ดเช็กอิน (ภาพ 09 ซ้าย) */
export const CHECKIN_STEPS = {
  scan: "สแกนพาสปอร์ต",
  rr3: "บัตรทะเบียนผู้พัก (ร.ร.3)",
  rr3Help: "กรอกจากพาสปอร์ตให้ · แขกลงชื่อบนแท็บเล็ต · เก็บเข้าทะเบียนผู้พัก (ร.ร.4)",
  tm30: "แจ้งที่พักคนต่างด้าว (ตม.30) — ภายใน 24 ชม.",
  deposit: "เงินประกันห้อง",
  depositHelp: "คืนตอนเช็กเอาต์ (บันทึกเป็นเงินรับฝาก ไม่ใช่รายได้)",
} as const;

/** ไฟล์รูปจาก <input type=file> → data URL (ฝั่งจอ) */
export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(file);
  });
}
export const FILE_MAX_BYTES = 8 * 1024 * 1024;
