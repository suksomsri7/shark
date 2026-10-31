// SVC D.13 ▸ หน้า 17 "นโยบาย · ข้อความ · สิทธิ์" — ตำแหน่งการ์ด/คีย์ค่าตั้งอยู่ไฟล์นี้ไฟล์เดียว (ledger/svc-briefs/svc-brief-d.13.md §6.1)
//   pure ล้วน (ไม่มี directive · ไม่ import อะไร) — ทั้งฝั่ง server (policy.ts · หน้า) และ client (DormPolicySettings.tsx) ใช้ร่วม
//   กริด 3 คอลัมน์: col = (no − 1) % 3 + 1 · การ์ด 7–9 ต่อท้ายจากภาพ (ภาพมี 6 การ์ด)
//   หน้า 10 (ค่าน้ำไฟ · กฎหมาย · VAT) เป็นเจ้าของกลุ่ม general · legal · utility · vat · money ⇒ ไม่อยู่ที่นี่

export type DormPolicyCardKey = "billing" | "lateFee" | "services" | "notify" | "deposit" | "roles" | "meter" | "payments" | "other";
export type DormPolicyCardLayout = { key: DormPolicyCardKey; no: number; labelTh: string; groups: { domain: string; group: string }[] };

const card = (key: DormPolicyCardKey, no: number, labelTh: string, groups: [string, string][]): DormPolicyCardLayout => ({
  key,
  no,
  labelTh,
  groups: groups.map(([domain, group]) => ({ domain, group })),
});

export const DORM_POLICY_LAYOUT: {
  cards: DormPolicyCardLayout[];
  /** ค่าที่แสดงเป็นปุ่มแบ่งส่วน (เลือกได้ทีละตัว) */
  segmented: string[];
  /** ข้อความที่แสดงตัวอย่างในการ์ด "เตือน · ทวง" */
  previewTemplateKey: string;
  /** ค่าตั้งขอบเขตอาคาร (#64) — แสดงเป็นตารางติ๊กในการ์ดสิทธิ์ */
  buildingAssignmentsKey: string;
  managerScopeKey: string;
} = {
  cards: [
    card("billing", 1, "รอบบิล", [["rooms", "billing"]]),
    card("lateFee", 2, "ค่าปรับจ่ายช้า", [["rooms", "lateFee"]]),
    card("services", 3, "ค่าบริการอื่น", [["rooms", "services"]]),
    card("notify", 4, "เตือน · ทวง · แม่แบบข้อความ", [["rooms", "notify"], ["rooms", "msg"], ["messaging", "channel"], ["messaging", "quiet"]]),
    card("deposit", 5, "เงินประกัน · สัญญา", [["rooms", "deposit"], ["rooms", "lease"], ["rooms", "moveout"]]),
    card("roles", 6, "สิทธิ์ผู้ใช้", [["rooms", "access"]]),
    card("meter", 7, "จดมิเตอร์", [["rooms", "meter"]]),
    card("payments", 8, "รับเงิน · สลิป · ภาษี", [["payments", "receiver"], ["payments", "slip"], ["rooms", "payment"], ["rooms", "tax"]]),
    card("other", 9, "แจ้งซ่อม · พัสดุ · ภาษาเอกสาร", [["rooms", "repair"], ["rooms", "parcel"], ["rooms", "locale"]]),
  ],
  segmented: ["rooms.lateFee.kind"],
  previewTemplateKey: "rooms.msg.bill",
  buildingAssignmentsKey: "rooms.access.buildingAssignments",
  managerScopeKey: "rooms.access.managerScope",
};

/** กลุ่มทั้งหมดของการ์ด (ส่งเป็น groups ให้ loadSettingsForm) — ไม่ซ้ำ */
export const DORM_POLICY_GROUPS: string[] = [...new Set(DORM_POLICY_LAYOUT.cards.flatMap((c) => c.groups.map((g) => g.group)))];

/** ป้ายไทยของตัวแปรในแม่แบบข้อความหอ (rooms.msg.*) — ชิปในตัวอย่างข้อความ */
export const DORM_MSG_VAR_LABEL_TH: Record<string, string> = {
  tenantName: "ชื่อ",
  roomNo: "ห้อง",
  unitName: "ชื่อหอ",
  period: "เดือน",
  amount: "ยอด",
  dueDate: "วันครบ",
  payLink: "ลิงก์จ่าย",
  daysLate: "จำนวนวันที่เลย",
  paidDate: "วันที่จ่าย",
  receiptLink: "ลิงก์ใบเสร็จ",
  title: "หัวเรื่อง",
  body: "เนื้อหา",
  linkCode: "รหัสผูกห้อง",
  ticketNo: "เลขงานซ่อม",
  // SVC D.11 ▸ ตัวแปรหนังสือบอกเลิกสัญญา (rooms.msg.terminationNotice) ◂
  landlordName: "ชื่อผู้ให้เช่า",
  overdueAmount: "ยอดค้างรวม",
  overduePeriods: "งวดที่ค้าง",
  noticeDate: "วันออกหนังสือ",
  effectiveDate: "วันมีผล",
  // SVC D.18 ▸ ตัวแปรข้อความพัสดุ (rooms.msg.parcelReceived · rooms.msg.parcelReminder) ◂
  carrier: "ขนส่ง",
  receivedDate: "วันที่รับ",
  pickupLink: "ลิงก์รับพัสดุ",
  daysWaiting: "จำนวนวันที่รอ",
  // SVC D.10 ▸ ตัวแปรข้อความสลิปไม่ผ่าน (rooms.msg.slipRejected) ◂
  reason: "เหตุผล",
  // SVC D.12 ▸ ตัวแปรใบสรุปเงินประกันวันย้ายออก (rooms.msg.moveOutSummary) ◂
  moveOutDate: "วันย้ายออก",
  depositAmount: "เงินประกัน",
  deductAmount: "ค่าเสียหายที่หัก",
  refundAmount: "ยอดคืน",
  owesAmount: "ยอดที่ต้องชำระเพิ่ม",
  refundDueDate: "วันครบกำหนดคืน",
  lines: "รายการหัก",
};

/** ข้อความแม่แบบ → ส่วนข้อความ/ตัวแปร (ตัวแปรที่ไม่รู้จักคงเป็นข้อความเดิมโดยไม่มีวงเล็บ) */
export function templateParts(text: string): ({ kind: "text"; text: string } | { kind: "var"; name: string; labelTh: string })[] {
  const out: ({ kind: "text"; text: string } | { kind: "var"; name: string; labelTh: string })[] = [];
  const re = /\{([A-Za-z0-9_]+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    out.push({ kind: "var", name: m[1], labelTh: DORM_MSG_VAR_LABEL_TH[m[1]] ?? m[1] });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out.map((p) => (p.kind === "text" ? { kind: "text", text: p.text.replace(/[{}]/g, "") } : p));
}

/** ฿ จากสตางค์ (ปัดลงเป็นบาท มีจุลภาค) — "หักประกัน > ฿2,000" */
export function bahtWhole(satang: number): string {
  return `฿${Math.floor(Math.max(0, satang) / 100).toLocaleString("en-US")}`;
}
