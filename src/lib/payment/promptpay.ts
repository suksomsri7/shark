// สร้าง payload PromptPay ตามมาตรฐาน EMVCo QR (WO-0023) — pure ล้วน ห้ามแตะ DB
// อ้างอิงสเปก EMVCo Merchant-Presented QR + PromptPay (ธปท./NITMX)
//
// โครง TLV (Tag 2 หลัก + Length 2 หลัก + Value):
//   00 = "01"                          Payload Format Indicator
//   01 = "11" (static) / "12" (dynamic) Point of Initiation Method
//   29 = { 00: AID "A000000677010111", 01|02: proxy }  Merchant Account Info (PromptPay)
//   53 = "764"                         สกุลเงิน (THB)
//   54 = จำนวนเงินบาท 2 ตำแหน่ง (เฉพาะ dynamic)
//   58 = "TH"                          ประเทศ
//   63 = CRC16 ท้ายสุด (คิดรวม "6304" ด้วย)
//
// proxy:
//   เบอร์มือถือ 10 หลักขึ้นต้น 0 → tag 01 · ค่า "0066" + ตัด 0 นำออก (รวม 13 ตัว)
//   เลขบัตรประชาชน 13 หลัก        → tag 02 · ค่าเลขบัตรตรง ๆ (13 ตัว)

const AID = "A000000677010111"; // Application ID ของ PromptPay

// TLV: tag + ความยาว value (2 หลัก) + value
function tlv(tag: string, value: string): string {
  return tag + String(value.length).padStart(2, "0") + value;
}

// CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF, ไม่ reflect, ไม่ xorout)
// vector มาตรฐาน: "123456789" → 29B1 · คืน hex ตัวใหญ่ 4 ตัว
export function crc16xmodem(s: string): string {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// แยกประเภท id → tag proxy + ค่า proxy · ไม่เข้าเกณฑ์ = โยน (ไทย)
function resolveProxy(rawId: string): { tag: string; value: string } {
  const digits = (rawId ?? "").replace(/\D/g, ""); // ตัดช่องว่าง/ขีดออก
  if (digits.length === 10 && digits.startsWith("0")) {
    // เบอร์มือถือ → "0066" + 9 หลักหลัง (ตัด 0 นำ) = 13 ตัว
    return { tag: "01", value: "0066" + digits.slice(1) };
  }
  if (digits.length === 13) {
    // เลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก
    return { tag: "02", value: digits };
  }
  throw new Error("PromptPay ID ไม่ถูกต้อง — ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน 13 หลัก");
}

// ตรวจ id ว่าใช้ได้ไหม (สำหรับ validate ก่อนบันทึก) — ไม่เข้าเกณฑ์คืน false
export function isValidPromptPayId(rawId: string): boolean {
  try {
    resolveProxy(rawId);
    return true;
  } catch {
    return false;
  }
}

// สร้าง payload สำหรับสร้าง QR
//   ไม่มี amount = static (สแกนแล้วกรอกเงินเอง) · มี amount = dynamic (ล็อกยอด)
export function promptpayPayload(input: { id: string; amountSatang?: number }): string {
  const proxy = resolveProxy(input.id);
  const hasAmount =
    typeof input.amountSatang === "number" &&
    Number.isFinite(input.amountSatang) &&
    input.amountSatang > 0;

  let p = "";
  p += tlv("00", "01"); // Payload Format Indicator
  p += tlv("01", hasAmount ? "12" : "11"); // static/dynamic
  p += tlv("29", tlv("00", AID) + tlv(proxy.tag, proxy.value)); // Merchant Account Info
  p += tlv("53", "764"); // THB
  if (hasAmount) {
    // แปลงสตางค์เป็นบาททศนิยม 2 ตำแหน่ง (เช่น 15050 → "150.50")
    p += tlv("54", (input.amountSatang! / 100).toFixed(2));
  }
  p += tlv("58", "TH"); // ประเทศ

  // CRC ปิดท้าย — คิดรวม tag+len "6304" ตามสเปก
  const withCrcTag = p + "6304";
  return withCrcTag + crc16xmodem(withCrcTag);
}
