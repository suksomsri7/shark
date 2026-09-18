// templates/objects — เทมเพลตวัตถุกำหนดเอง 8 ชุด (CRM v2 · ใบ C1.2b · พิมพ์เขียว §10 · มติ R-C.12 · R-A)
//
// 🔴 ข้อมูลล้วน (ไม่แตะ prisma/next) — `objects-shared.ts` re-export ต่อให้หน้า UI ('use client') ใช้ได้
// 🔴 ฟิลด์ทุกตัวถูกสร้างผ่าน engine ฟิลด์ตัวเดียว (member facade `fields.createSection/createField`) ตอน
//    `objects.create({ templateKey })` — ที่นี่ไม่มีตรรกะ ไม่มีการตรวจค่า (engine ตรวจชุดเดียวกับที่ผู้ใช้สร้างเอง)
// 🔴 `starterRule` = "สเปก" ของกฎ "วันที่ในฟิลด์ใกล้ถึงกำหนด" 1 ใบต่อเทมเพลต · `enabled: false` เสมอ
//    ใบ C1.2b **ไม่สร้าง AutomationRule** — ใบ C2.1 เป็นคนแปลงสเปกนี้เป็นกฎจริง (ปิดไว้) ตอนร้านเลือกเทมเพลต
// แต่ละชุด: ส่วน+ฟิลด์ 5–8 ตัว · `titleFieldKey` = ฟิลด์ TEXT ของชุดเอง · `parentType` = ค่าที่แนะนำ (ร้านเปลี่ยนได้ก่อนมีรายการ)

export type ObjectTemplateParent = "CUSTOMER" | "CONTACT" | "COMPANY" | "DEAL" | "NONE";

export type ObjectTemplateField = {
  key: string;
  label: string;
  type: "TEXT" | "LONG_TEXT" | "NUMBER" | "MONEY" | "DATE" | "DATETIME" | "SELECT" | "MULTI_SELECT" | "BOOLEAN" | "FILE" | "LOOKUP";
  options?: {
    choices?: { value: string; label: string }[];
    unit?: string;
    decimals?: number;
    min?: number;
    max?: number;
    maxLength?: number;
    target?: "PRODUCT" | "SERVICE" | "EMPLOYEE" | "UNIT" | "CUSTOMER" | "USER" | "CONTACT" | "COMPANY" | "DEAL";
  };
  filterable?: boolean;
  showInList?: boolean;
  trackHistory?: boolean;
};

export type ObjectTemplateSection = { key: string; label: string; fields: ObjectTemplateField[] };

/** สเปกกฎเริ่มต้น "ฟิลด์วันที่ใกล้ถึงกำหนด" — ข้อมูลให้ C2.1 สร้างเป็นกฎ (ปิดไว้) · ไม่มีอะไรยิงเองได้ */
export type ObjectStarterRule = {
  kind: "DATE_DUE";
  /** ฟิลด์ DATE ของเทมเพลตเดียวกัน */
  fieldKey: string;
  /** แจ้งล่วงหน้ากี่วันก่อนถึงวันที่ในฟิลด์ */
  daysBefore: number;
  /** สิ่งที่กฎจะทำเมื่อเปิดใช้ (C2.1 เป็นคนตีความ) */
  action: "NOTIFY_OWNER";
  name: string;
  enabled: false;
};

export type ObjectTemplate = {
  key: string;
  label: string;
  labelPlural: string;
  icon: string;
  parentType: ObjectTemplateParent;
  titleFieldKey: string;
  description: string;
  sections: ObjectTemplateSection[];
  starterRule: ObjectStarterRule;
};

const choices = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

export const OBJECT_TEMPLATES: readonly ObjectTemplate[] = [
  {
    key: "pet",
    label: "สัตว์เลี้ยง",
    labelPlural: "สัตว์เลี้ยง",
    icon: "paw",
    parentType: "CUSTOMER",
    titleFieldKey: "petName",
    description: "ข้อมูลสัตว์เลี้ยงของลูกค้า — คลินิกสัตว์ · ร้านอาบน้ำตัดขน · โรงแรมสัตว์เลี้ยง",
    sections: [
      {
        key: "petInfo",
        label: "ข้อมูลสัตว์เลี้ยง",
        fields: [
          { key: "petName", label: "ชื่อสัตว์เลี้ยง", type: "TEXT", showInList: true },
          { key: "species", label: "ชนิด", type: "SELECT", filterable: true, showInList: true, options: { choices: choices([["dog", "สุนัข"], ["cat", "แมว"], ["bird", "นก"], ["rabbit", "กระต่าย"], ["other", "อื่น ๆ"]]) } },
          { key: "breed", label: "สายพันธุ์", type: "TEXT" },
          { key: "birthDate", label: "วันเกิด", type: "DATE" },
          { key: "weightKg", label: "น้ำหนัก (กก.)", type: "NUMBER", trackHistory: true, options: { decimals: 1, min: 0, max: 500, unit: "กก." } },
          { key: "vaccineDue", label: "วันครบกำหนดวัคซีน", type: "DATE", filterable: true, showInList: true },
          { key: "note", label: "หมายเหตุ", type: "LONG_TEXT" },
        ],
      },
    ],
    starterRule: { kind: "DATE_DUE", fieldKey: "vaccineDue", daysBefore: 7, action: "NOTIFY_OWNER", name: "เตือนก่อนครบกำหนดวัคซีน", enabled: false },
  },
  {
    key: "vehicle",
    label: "รถ",
    labelPlural: "รถของลูกค้า",
    icon: "car",
    parentType: "CONTACT",
    titleFieldKey: "plate",
    description: "รถของลูกค้า — อู่ · ศูนย์บริการ · ร้านประดับยนต์ · ประกันภัยรถ",
    sections: [
      {
        key: "vehicleInfo",
        label: "ข้อมูลรถ",
        fields: [
          { key: "plate", label: "ทะเบียนรถ", type: "TEXT", filterable: true, showInList: true },
          { key: "brand", label: "ยี่ห้อ", type: "TEXT", filterable: true, showInList: true },
          { key: "model", label: "รุ่น", type: "TEXT" },
          { key: "year", label: "ปีรถ (ค.ศ.)", type: "NUMBER", options: { decimals: 0, min: 1950, max: 2100 } },
          { key: "mileage", label: "เลขไมล์", type: "NUMBER", trackHistory: true, options: { decimals: 0, min: 0, unit: "กม." } },
          { key: "fuel", label: "เชื้อเพลิง", type: "SELECT", options: { choices: choices([["petrol", "เบนซิน"], ["diesel", "ดีเซล"], ["hybrid", "ไฮบริด"], ["ev", "ไฟฟ้า"]]) } },
          { key: "nextService", label: "เช็กระยะครั้งถัดไป", type: "DATE", filterable: true, showInList: true },
        ],
      },
    ],
    starterRule: { kind: "DATE_DUE", fieldKey: "nextService", daysBefore: 7, action: "NOTIFY_OWNER", name: "เตือนก่อนถึงวันเช็กระยะ", enabled: false },
  },
  {
    key: "asset",
    label: "ทรัพย์สิน/เครื่องจักร",
    labelPlural: "ทรัพย์สิน/เครื่องจักร",
    icon: "wrench",
    parentType: "COMPANY",
    titleFieldKey: "assetName",
    description: "เครื่องจักร/อุปกรณ์ที่ขายหรือดูแลให้ลูกค้า — งานติดตั้ง · ซ่อมบำรุง · รับประกัน",
    sections: [
      {
        key: "assetInfo",
        label: "ข้อมูลทรัพย์สิน",
        fields: [
          { key: "assetName", label: "ชื่อทรัพย์สิน", type: "TEXT", showInList: true },
          { key: "serialNo", label: "หมายเลขเครื่อง", type: "TEXT", filterable: true, showInList: true },
          { key: "brand", label: "ยี่ห้อ/รุ่น", type: "TEXT" },
          { key: "installedAt", label: "วันที่ติดตั้ง", type: "DATE" },
          { key: "warrantyUntil", label: "ประกันถึงวันที่", type: "DATE", filterable: true },
          { key: "nextMaintenance", label: "บำรุงรักษาครั้งถัดไป", type: "DATE", filterable: true, showInList: true },
          { key: "location", label: "ที่ตั้ง", type: "TEXT" },
        ],
      },
    ],
    starterRule: { kind: "DATE_DUE", fieldKey: "nextMaintenance", daysBefore: 14, action: "NOTIFY_OWNER", name: "เตือนก่อนถึงรอบบำรุงรักษา", enabled: false },
  },
  {
    key: "contract",
    label: "สัญญา",
    labelPlural: "สัญญา",
    icon: "doc",
    parentType: "COMPANY",
    titleFieldKey: "contractNo",
    description: "สัญญาบริการ/เช่า/บำรุงรักษากับลูกค้า — ติดตามวันหมดอายุและต่อสัญญา",
    sections: [
      {
        key: "contractInfo",
        label: "ข้อมูลสัญญา",
        fields: [
          { key: "contractNo", label: "เลขที่สัญญา", type: "TEXT", filterable: true, showInList: true },
          { key: "kind", label: "ประเภทสัญญา", type: "SELECT", filterable: true, options: { choices: choices([["service", "บริการ"], ["rental", "เช่า"], ["maintenance", "บำรุงรักษา"], ["other", "อื่น ๆ"]]) } },
          { key: "startDate", label: "วันเริ่มสัญญา", type: "DATE" },
          { key: "endDate", label: "วันสิ้นสุดสัญญา", type: "DATE", filterable: true, showInList: true },
          { key: "valueSatang", label: "มูลค่าสัญญา", type: "MONEY", options: { decimals: 0, min: 0, unit: "สตางค์" } },
          { key: "autoRenew", label: "ต่ออายุอัตโนมัติ", type: "BOOLEAN", filterable: true },
        ],
      },
    ],
    starterRule: { kind: "DATE_DUE", fieldKey: "endDate", daysBefore: 30, action: "NOTIFY_OWNER", name: "เตือนก่อนสัญญาหมดอายุ", enabled: false },
  },
  {
    key: "policy",
    label: "กรมธรรม์",
    labelPlural: "กรมธรรม์",
    icon: "shield",
    parentType: "CONTACT",
    titleFieldKey: "policyNo",
    description: "กรมธรรม์ประกันของลูกค้า — ตัวแทน/นายหน้าประกัน ติดตามวันครบกำหนดต่ออายุ",
    sections: [
      {
        key: "policyInfo",
        label: "ข้อมูลกรมธรรม์",
        fields: [
          { key: "policyNo", label: "เลขกรมธรรม์", type: "TEXT", filterable: true, showInList: true },
          { key: "insurer", label: "บริษัทประกัน", type: "TEXT", filterable: true, showInList: true },
          { key: "kind", label: "ประเภท", type: "SELECT", filterable: true, options: { choices: choices([["life", "ชีวิต"], ["health", "สุขภาพ"], ["car", "รถยนต์"], ["home", "บ้าน/ทรัพย์สิน"], ["other", "อื่น ๆ"]]) } },
          { key: "premiumSatang", label: "เบี้ยประกัน", type: "MONEY", options: { decimals: 0, min: 0, unit: "สตางค์" } },
          { key: "startDate", label: "วันเริ่มคุ้มครอง", type: "DATE" },
          { key: "renewalDate", label: "วันครบกำหนดต่ออายุ", type: "DATE", filterable: true, showInList: true },
        ],
      },
    ],
    starterRule: { kind: "DATE_DUE", fieldKey: "renewalDate", daysBefore: 30, action: "NOTIFY_OWNER", name: "เตือนก่อนครบกำหนดต่ออายุกรมธรรม์", enabled: false },
  },
  {
    key: "property",
    label: "อสังหาฯ ที่สนใจ",
    labelPlural: "อสังหาฯ ที่สนใจ",
    icon: "home",
    parentType: "CONTACT",
    titleFieldKey: "projectName",
    description: "บ้าน/คอนโด/ที่ดินที่ลูกค้าสนใจ — นายหน้าและโครงการอสังหาริมทรัพย์",
    sections: [
      {
        key: "propertyInfo",
        label: "ข้อมูลอสังหาฯ",
        fields: [
          { key: "projectName", label: "ชื่อโครงการ/ทรัพย์", type: "TEXT", showInList: true },
          { key: "kind", label: "ประเภท", type: "SELECT", filterable: true, showInList: true, options: { choices: choices([["house", "บ้านเดี่ยว"], ["townhome", "ทาวน์โฮม"], ["condo", "คอนโด"], ["land", "ที่ดิน"], ["commercial", "อาคารพาณิชย์"]]) } },
          { key: "area", label: "ทำเล", type: "TEXT", filterable: true },
          { key: "budgetSatang", label: "งบประมาณ", type: "MONEY", options: { decimals: 0, min: 0, unit: "สตางค์" } },
          { key: "bedrooms", label: "จำนวนห้องนอน", type: "NUMBER", options: { decimals: 0, min: 0, max: 50 } },
          { key: "viewingDate", label: "วันนัดชม", type: "DATE", filterable: true, showInList: true },
        ],
      },
    ],
    starterRule: { kind: "DATE_DUE", fieldKey: "viewingDate", daysBefore: 1, action: "NOTIFY_OWNER", name: "เตือนก่อนวันนัดชมทรัพย์", enabled: false },
  },
  {
    key: "project",
    label: "โครงการ",
    labelPlural: "โครงการ",
    icon: "folder",
    parentType: "COMPANY",
    titleFieldKey: "projectName",
    description: "งานโครงการที่ทำให้ลูกค้า — รับเหมา · ติดตั้ง · ที่ปรึกษา · เอเจนซี",
    sections: [
      {
        key: "projectInfo",
        label: "ข้อมูลโครงการ",
        fields: [
          { key: "projectName", label: "ชื่อโครงการ", type: "TEXT", showInList: true },
          { key: "status", label: "สถานะ", type: "SELECT", filterable: true, showInList: true, options: { choices: choices([["planning", "วางแผน"], ["active", "กำลังทำ"], ["onHold", "พักไว้"], ["done", "เสร็จแล้ว"]]) } },
          { key: "startDate", label: "วันเริ่ม", type: "DATE" },
          { key: "dueDate", label: "กำหนดส่ง", type: "DATE", filterable: true, showInList: true },
          { key: "budgetSatang", label: "งบประมาณ", type: "MONEY", options: { decimals: 0, min: 0, unit: "สตางค์" } },
          { key: "note", label: "รายละเอียด", type: "LONG_TEXT" },
        ],
      },
    ],
    starterRule: { kind: "DATE_DUE", fieldKey: "dueDate", daysBefore: 7, action: "NOTIFY_OWNER", name: "เตือนก่อนถึงกำหนดส่งโครงการ", enabled: false },
  },
  {
    key: "learner",
    label: "ผู้เรียน/เด็ก",
    labelPlural: "ผู้เรียน",
    icon: "student",
    parentType: "CONTACT",
    titleFieldKey: "learnerName",
    description: "ผู้เรียนที่ผู้ปกครอง/ลูกค้าดูแล — โรงเรียนกวดวิชา · สอนว่ายน้ำ · ดนตรี · ศิลปะ",
    sections: [
      {
        key: "learnerInfo",
        label: "ข้อมูลผู้เรียน",
        fields: [
          { key: "learnerName", label: "ชื่อผู้เรียน", type: "TEXT", showInList: true },
          { key: "nickname", label: "ชื่อเล่น", type: "TEXT", showInList: true },
          { key: "birthDate", label: "วันเกิด", type: "DATE" },
          { key: "level", label: "ระดับ/ชั้น", type: "TEXT", filterable: true },
          { key: "course", label: "คอร์สที่เรียน", type: "TEXT", filterable: true },
          { key: "courseEnd", label: "วันจบคอร์ส", type: "DATE", filterable: true, showInList: true },
          { key: "allergy", label: "ข้อควรระวัง/แพ้อาหาร", type: "LONG_TEXT" },
        ],
      },
    ],
    starterRule: { kind: "DATE_DUE", fieldKey: "courseEnd", daysBefore: 14, action: "NOTIFY_OWNER", name: "เตือนก่อนคอร์สจบ (ชวนต่อคอร์ส)", enabled: false },
  },
];
