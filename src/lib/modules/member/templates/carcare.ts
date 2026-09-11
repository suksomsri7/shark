// เทมเพลตกิจการ #11 — คาร์แคร์ / อู่ (พิมพ์เขียว docs/modules/06-member-v2.md §10 แถวที่ 11)

import type { MemberTemplate } from "./index";

export const CARCARE_TEMPLATE: MemberTemplate = {
  key: "carcare",
  name: "คาร์แคร์ / อู่",
  description: "ร้านล้างรถ อู่ซ่อม — ทะเบียน/รุ่น/ปีรถ เลขไมล์ล่าสุด รอบเปลี่ยนน้ำมัน และวันประกันหมดอายุ",
  sections: [
    {
      key: "assets",
      label: "ทรัพย์สิน / อุปกรณ์",
      description: "ข้อมูลรถของลูกค้า",
      columns: 2,
      fields: [
        { key: "vehiclePlate", label: "รถ (ทะเบียน / รุ่น / ปี)", type: "LONG_TEXT" },
        { key: "lastMileage", label: "เลขไมล์ล่าสุด", type: "NUMBER", options: { unit: "กม.", decimals: 0, min: 0 } },
        { key: "lastOilChangeAt", label: "เปลี่ยนน้ำมันล่าสุด", type: "DATE", filterable: true },
        { key: "insuranceExpiresAt", label: "ประกันหมดอายุ", type: "DATE", filterable: true },
      ],
    },
  ],
  tiers: [
    { key: "gold", label: "Gold", color: "AMBER", description: "ล้างรถฟรีเดือนละ 1 ครั้ง (ตั้งค่าสิทธิ์ FREE_SERVICE ที่หน้าตั้งค่าระดับ — เลือกบริการจริงของร้าน)" },
    { key: "silver", label: "Silver", color: "BLUE", description: "ส่วนลดล้างรถ 10%", benefits: [{ kind: "DISCOUNT_PCT", config: { pct: 10 } }] },
  ],
  stamps: [
    {
      key: "wash10",
      name: "ล้างรถครบ 10 ครั้งฟรี 1",
      slots: 10,
      ruleKind: "PER_VISIT",
      rewardKind: "REWARD",
      rewardConfig: { note: "ล้างรถฟรี 1 ครั้ง" },
      description: "ล้างรถครบ 10 ครั้ง รับฟรี 1 ครั้ง",
    },
  ],
  journeys: [
    {
      key: "maintenance_due",
      name: "ถึงรอบบำรุงรักษา — นัดหมาย",
      presetKey: "inactive",
      description: "ไม่ได้เข้ามาบำรุงรักษานาน → ชวนนัดเปลี่ยนน้ำมัน (ไมล์/เวลาถึงรอบตามฟิลด์กำหนดเอง และประกันหมด 30 วันยังไม่มีทริกเกอร์ตรงในทะเบียน M3.3)",
    },
  ],
};
