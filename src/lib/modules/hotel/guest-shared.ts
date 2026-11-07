// SVC H.4 ▸ ทะเบียนผู้เข้าพัก — ชิ้น pure (ไม่มี import ค่า · ไม่มี directive) ใช้ได้ทั้งเซิร์ฟเวอร์และจอ
//   • สัญชาติ ISO-3 → ชื่อไทย · คนต่างด้าว = สัญชาติ ≠ THA (พ.ร.บ.คนเข้าเมือง 2522 ม.38 ⇒ แจ้ง ตม.30)
//   • ตรวจรูปเลขเอกสาร: บัตรประชาชนไทย 13 หลัก (checksum mod 11) · พาสปอร์ต 6–9 ตัวอักษร/ตัวเลข · อื่น 4–20
//   • maskId = เห็นเฉพาะ 4 ตัวท้าย (มติผู้คุม h.4 §9 ข้อ 7 — ภาพ 09 "C01X··· 4KJ" ไม่ยึด)

export type GuestIdType = "PASSPORT" | "THAI_ID" | "OTHER";
export const GUEST_ID_TYPES: readonly GuestIdType[] = ["PASSPORT", "THAI_ID", "OTHER"];
export type Tm30Status = "NOT_REQUIRED" | "PENDING" | "FILED" | "LATE";
export const TM30_STATUSES: readonly Tm30Status[] = ["NOT_REQUIRED", "PENDING", "FILED", "LATE"];

/** ชื่อไทยของสัญชาติที่พบบ่อย (ISO 3166-1 alpha-3) — ไม่มีในตาราง ⇒ จอแสดงรหัส ISO แทน (รับรหัสได้ทุกตัวที่รูปแบบถูก) */
const NATIONALITY_TH: Readonly<Record<string, string>> = {
  THA: "ไทย", DEU: "เยอรมัน", JPN: "ญี่ปุ่น", CHN: "จีน", USA: "อเมริกัน", GBR: "อังกฤษ", FRA: "ฝรั่งเศส", ITA: "อิตาลี",
  ESP: "สเปน", NLD: "เนเธอร์แลนด์", BEL: "เบลเยียม", CHE: "สวิส", AUT: "ออสเตรีย", SWE: "สวีเดน", NOR: "นอร์เวย์", DNK: "เดนมาร์ก",
  FIN: "ฟินแลนด์", IRL: "ไอร์แลนด์", PRT: "โปรตุเกส", POL: "โปแลนด์", CZE: "เช็ก", HUN: "ฮังการี", GRC: "กรีก", RUS: "รัสเซีย",
  UKR: "ยูเครน", TUR: "ตุรกี", ISR: "อิสราเอล", ARE: "เอมิเรตส์", SAU: "ซาอุดีอาระเบีย", IND: "อินเดีย", PAK: "ปากีสถาน", BGD: "บังกลาเทศ",
  LKA: "ศรีลังกา", NPL: "เนปาล", MMR: "เมียนมา", LAO: "ลาว", KHM: "กัมพูชา", VNM: "เวียดนาม", MYS: "มาเลเซีย", SGP: "สิงคโปร์",
  IDN: "อินโดนีเซีย", PHL: "ฟิลิปปินส์", BRN: "บรูไน", KOR: "เกาหลีใต้", PRK: "เกาหลีเหนือ", TWN: "ไต้หวัน", HKG: "ฮ่องกง", MAC: "มาเก๊า",
  MNG: "มองโกเลีย", AUS: "ออสเตรเลีย", NZL: "นิวซีแลนด์", CAN: "แคนาดา", MEX: "เม็กซิโก", BRA: "บราซิล", ARG: "อาร์เจนตินา", CHL: "ชิลี",
  COL: "โคลอมเบีย", PER: "เปรู", ZAF: "แอฟริกาใต้", EGY: "อียิปต์", NGA: "ไนจีเรีย", KEN: "เคนยา", MAR: "โมร็อกโก", IRN: "อิหร่าน",
  KAZ: "คาซัคสถาน", UZB: "อุซเบกิสถาน", ROU: "โรมาเนีย", BGR: "บัลแกเรีย", SRB: "เซอร์เบีย", HRV: "โครเอเชีย", SVK: "สโลวาเกีย", SVN: "สโลวีเนีย",
  EST: "เอสโตเนีย", LVA: "ลัตเวีย", LTU: "ลิทัวเนีย", ISL: "ไอซ์แลนด์", LUX: "ลักเซมเบิร์ก", QAT: "กาตาร์", KWT: "คูเวต", BHR: "บาห์เรน",
  OMN: "โอมาน", JOR: "จอร์แดน", LBN: "เลบานอน", BTN: "ภูฏาน", MDV: "มัลดีฟส์", TLS: "ติมอร์-เลสเต",
};

const ISO3_RE = /^[A-Z]{3}$/;
/** รหัสสัญชาติรูปแบบถูก (ตัวพิมพ์ใหญ่ 3 ตัว) — ผู้เรียกส่งตัวพิมพ์ใหญ่เท่านั้น ("de"/"XX" ⇒ false) */
export function isIso3(v: unknown): v is string {
  return typeof v === "string" && ISO3_RE.test(v);
}
/** ชื่อไทยของสัญชาติ · รหัสผิดรูป/ไม่รู้จัก ⇒ null */
export function nationalityTh(iso3: string | null | undefined): string | null {
  if (typeof iso3 !== "string") return null;
  const k = iso3.trim().toUpperCase();
  return NATIONALITY_TH[k] ?? null;
}
/** ป้ายสัญชาติบนจอ/แบบพิมพ์: "เยอรมัน (DEU)" · ไม่รู้จัก ⇒ รหัสอย่างเดียว */
export function nationalityLabel(iso3: string | null | undefined): string {
  if (typeof iso3 !== "string" || !iso3.trim()) return "—";
  const th = nationalityTh(iso3);
  return th ? `${th} (${iso3.trim().toUpperCase()})` : iso3.trim().toUpperCase();
}
/** คนต่างด้าว = สัญชาติไม่ใช่ไทย (ไม่มีสัญชาติ ⇒ false — ทะเบียนบังคับกรอกสัญชาติอยู่แล้ว) */
export function isForeigner(iso3: string | null | undefined): boolean {
  if (typeof iso3 !== "string" || !iso3.trim()) return false;
  return iso3.trim().toUpperCase() !== "THA";
}

/** บัตรประชาชนไทย 13 หลัก: Σ d[i]×(13−i) (i=0..11) · หลักตรวจ = (11 − Σ mod 11) mod 10 */
export function thaiIdChecksumOk(s: string): boolean {
  if (!/^\d{13}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(s[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(s[12]);
}
/** ทำเลขเอกสารให้เป็นรูปเดียว: ตัดช่องว่าง/ขีด · ตัวพิมพ์ใหญ่ */
export function normalizeIdNumber(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}
export type IdCheck = { ok: true; value: string } | { ok: false; reason: string };
/** ตรวจรูปเลขเอกสารตามชนิด — คืนเลขที่ทำรูปแล้ว (ใช้เข้ารหัส/last4) */
export function validateIdNumber(idType: string | null | undefined, raw: string | null | undefined): IdCheck {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, reason: "กรอกเลขเอกสารของผู้เข้าพัก" };
  const v = normalizeIdNumber(raw);
  if (idType === "THAI_ID") {
    if (!/^\d{13}$/.test(v)) return { ok: false, reason: "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก" };
    if (!thaiIdChecksumOk(v)) return { ok: false, reason: "เลขบัตรประชาชนไม่ถูกต้อง (หลักตรวจไม่ตรง) — ตรวจเลขอีกครั้ง" };
    return { ok: true, value: v };
  }
  if (idType === "PASSPORT") {
    if (!/^[A-Z0-9]{6,9}$/.test(v)) return { ok: false, reason: "เลขหนังสือเดินทางต้องเป็นตัวอักษร/ตัวเลข 6–9 ตัว" };
    return { ok: true, value: v };
  }
  if (idType === "OTHER") {
    if (!/^[A-Z0-9]{4,20}$/.test(v)) return { ok: false, reason: "เลขเอกสารต้องเป็นตัวอักษร/ตัวเลข 4–20 ตัว" };
    return { ok: true, value: v };
  }
  return { ok: false, reason: "เลือกชนิดเอกสาร (หนังสือเดินทาง · บัตรประชาชน · อื่น ๆ)" };
}
/** 4 ตัวท้ายของเลขที่ทำรูปแล้ว */
export function idLast4(normalized: string): string {
  return normalized.replace(/[^A-Za-z0-9]/g, "").slice(-4);
}
/** เลขเอกสารแบบปิด — เห็นเฉพาะ 4 ตัวท้าย ("••••KJ77") · ค่าว่าง ⇒ "" · สั้นกว่า 5 ⇒ ปิดทั้งหมดยกเว้นตัวท้าย */
export function maskId(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  const v = raw.replace(/[^A-Za-z0-9]/g, "");
  if (!v) return "";
  if (v.length <= 4) return `••••${v.slice(-1)}`.slice(0, 5);
  return `••••${v.slice(-4)}`;
}
/** แสดงจาก last4 ที่เก็บไว้ (DTO ไม่มีเลขเต็ม) */
export function maskFromLast4(last4: string | null | undefined): string {
  return typeof last4 === "string" && last4 ? `••••${last4}` : "—";
}

export const ID_TYPE_TH: Readonly<Record<GuestIdType, string>> = { PASSPORT: "หนังสือเดินทาง", THAI_ID: "บัตรประชาชน", OTHER: "เอกสารอื่น" };
export const TM30_STATUS_TH: Readonly<Record<Tm30Status, string>> = { NOT_REQUIRED: "ไม่ต้องแจ้ง", PENDING: "รอแจ้ง", FILED: "แจ้งแล้ว", LATE: "เกิน 24 ชม." };
export const SEX_TH: Readonly<Record<string, string>> = { M: "ชาย", F: "หญิง", X: "ไม่ระบุ" };
