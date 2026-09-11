// เทมเพลตกิจการ #15 — อสังหา / ให้เช่า (พิมพ์เขียว docs/modules/06-member-v2.md §10 แถวที่ 15)
//
// 🔴 ไม่มีสแตมป์ (§10: "—")

import type { MemberTemplate } from "./index";

export const REALESTATE_TEMPLATE: MemberTemplate = {
  key: "realestate",
  name: "อสังหา / ให้เช่า",
  description: "อพาร์ตเมนต์ คอนโดให้เช่า — ห้อง/ยูนิต วันเริ่ม/สิ้นสุดสัญญา เงินประกัน ผู้ติดต่อฉุกเฉิน และยานพาหนะ",
  sections: [
    {
      key: "documents",
      label: "เอกสารสำคัญ",
      description: "ข้อมูลอ่อนไหว — เห็นได้เฉพาะผู้มีสิทธิ์",
      columns: 2,
      sensitive: true,
      fields: [
        { key: "unitNo", label: "ห้อง / ยูนิต", type: "TEXT", options: { maxLength: 40 } },
        { key: "leaseStartAt", label: "สัญญาเริ่มวันที่", type: "DATE" },
        { key: "leaseEndAt", label: "สัญญาสิ้นสุดวันที่", type: "DATE", filterable: true },
        { key: "deposit", label: "เงินประกัน", type: "MONEY", sensitive: true, options: { unit: "บาท", decimals: 0, min: 0 } },
        { key: "emergencyContact", label: "ผู้ติดต่อฉุกเฉิน", type: "TEXT", sensitive: true },
        { key: "vehiclePlate", label: "ยานพาหนะ (ทะเบียน)", type: "TEXT", options: { maxLength: 40 } },
      ],
    },
  ],
  tiers: [
    {
      key: "returning_tenant",
      label: "ผู้เช่าเก่า",
      color: "SLATE",
      description: "ลดค่าเช่าเมื่อต่อสัญญา 5%",
      benefits: [{ kind: "DISCOUNT_PCT", config: { pct: 5 } }],
    },
    { key: "gold", label: "Gold", color: "AMBER", description: "สิทธิ์เลือกห้องก่อนผู้เช่าใหม่" },
  ],
  stamps: [],
  journeys: [
    {
      key: "lease_ending",
      name: "สัญญาใกล้หมด — เสนอต่อสัญญา",
      presetKey: "at_risk",
      description: "สัญญาใกล้หมดอายุ 60 วัน → ทีมติดต่อเสนอเงื่อนไขต่อสัญญา (ค่าเช่าค้าง(บัญชี)→เตือน ยังไม่มีทริกเกอร์เชื่อมโมดูลบัญชีในทะเบียน M3.3)",
    },
  ],
};
