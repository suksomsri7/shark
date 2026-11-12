// นาฬิกาของ "พ้นกำหนด" ในโมดูลบัญชี — ตัวเดียวที่ isOverdue / overdueWhere ทุกทางเรียก
//
// ร้านจริง: ไม่มีใครตรึง ⇒ accountNow() = new Date() ทุกครั้ง (พฤติกรรมเดิมทุกประการ)
//
// ชุดข้อสอบ QC (seed-acc-v2-qc + qc-acc-v2-*): ชุดข้อมูลตรึง "วันนี้" ไว้ที่ QC.today
//   ⇒ ต้องตรึงนาฬิกานี้ไว้ที่วันเดียวกันในโปรเซสของสคริปต์ ไม่งั้นตัวเลข "พ้นกำหนด" เน่าตามปฏิทินจริง
//   (T0.3b 12 พ.ย. 2569: เลย 31 ต.ค. แล้วใบที่ครบกำหนด พ.ย. กลายเป็นพ้นกำหนด → seed ล้ม)
// ตรึงได้เฉพาะในโปรเซสที่เรียก pinAccountClockForQc เอง (state ในหน่วยความจำ ไม่อ่าน env)
//   ⇒ เซิร์ฟเวอร์แอปไม่มีทางถูกตรึง · และห้ามตรึงเมื่อ APP_ENV=production

let pinned: number | null = null;

/** "ตอนนี้" ของการคิดพ้นกำหนด — ค่าที่ตรึงไว้ (เฉพาะสคริปต์ QC) หรือเวลาจริง */
export function accountNow(): Date {
  return pinned === null ? new Date() : new Date(pinned);
}

/** สคริปต์ QC เท่านั้น: ตรึงนาฬิกาพ้นกำหนดไว้ที่ `at` · ส่ง null = กลับไปใช้เวลาจริง */
export function pinAccountClockForQc(at: Date | null): void {
  if (at !== null && process.env.APP_ENV === "production") {
    throw new Error("pinAccountClockForQc: ห้ามตรึงนาฬิกาบัญชีเมื่อ APP_ENV=production");
  }
  pinned = at === null ? null : at.getTime();
}

/** นาฬิกาถูกตรึงอยู่หรือไม่ (ให้ข้อสอบยืนยันว่าตรึงจริงก่อนเทียบเฉลย) */
export function isAccountClockPinned(): boolean {
  return pinned !== null;
}
