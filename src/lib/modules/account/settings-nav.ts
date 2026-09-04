// settings-nav.ts — โครงเมนูซ้ายของหน้าตั้งค่า (§9 · เฟรม f10-settings.png)
//
// แหล่งเดียวของ "หัวข้อ/หัวข้อย่อย/ลำดับ" — ใช้ทั้งเมนูซ้าย (accordion w-280), breadcrumb tail
// และ flyout "ตั้งค่า" บนแถบเมนู (nav.ts) เพื่อไม่ให้ 3 ที่หลุดจากกัน
export type SettingsSection = {
  key: string;
  label: string;
  /** path ใต้ `/app/sys/<id>/account/settings` ("" = หน้าองค์กรเดิม) */
  path: string;
  /** query `?s=` ของหัวข้อย่อย (ว่าง = หัวข้อหลักไม่มีย่อย) */
  sub?: string;
  /** ยังไม่ทำ — แสดงจาง + ป้าย "เร็ว ๆ นี้" (§9.3 Smart Insight 🕓) */
  soon?: boolean;
};

export type SettingsGroup = {
  key: string;
  label: string;
  icon: string; // คีย์ของ AccountIcon (ไอคอนเส้น ไม่ใช่ emoji)
  path: string;
  items: SettingsSection[];
  /** ยังไม่ทำ — แสดงจาง + ป้าย "เร็ว ๆ นี้" */
  soon?: boolean;
};

/** หัวข้อย่อยของ "เอกสารและเลขที่" (§9.2 ครบ 10 หัวข้อ · 3 อันแรกคือที่วาดไว้ใน f10) */
export const DOC_SETTINGS_SUBS: { key: string; label: string }[] = [
  { key: "numbering", label: "รูปแบบเลขที่เอกสาร" },
  { key: "notes", label: "ข้อความท้ายเอกสาร" },
  { key: "public", label: "ลิงก์สาธารณะและ QR" },
  // ↓ §9.2 บังคับให้มี แต่ f10 ไม่ได้วาดเป็นหัวข้อย่อยไว้ (จดส่วนต่างไว้ที่ ledger/wo-notes/8.1.md)
  { key: "due", label: "วันครบกำหนด" },
  { key: "channels", label: "ช่องทางรับชำระบนเอกสาร" },
  { key: "tags", label: "แท็ก" },
  { key: "autotax", label: "ใบกำกับภาษีอัตโนมัติ" },
  { key: "print", label: "เทมเพลตพิมพ์" },
  { key: "accounts", label: "บัญชีรายวันของเอกสาร" },
];

export const DEFAULT_DOC_SUB = "numbering";

/** หัวข้อย่อยของ "นโยบายบัญชี" (WO 8.2 · §9.3 — เรียงตามลำดับใน SPEC เป๊ะ) */
export const POLICY_SETTINGS_SUBS: { key: string; label: string; soon?: boolean }[] = [
  { key: "fiscal", label: "ปีบัญชี" },
  { key: "vat", label: "ภาษีมูลค่าเพิ่ม (VAT)" },
  { key: "wht", label: "หัก ณ ที่จ่ายเริ่มต้น" },
  { key: "price", label: "ประเภทราคาเริ่มต้น" },
  { key: "lock", label: "ล็อกข้อมูลก่อนวันที่" },
  { key: "dup", label: "การสร้างชื่อซ้ำ" },
  { key: "accounts", label: "บัญชีรายรับ/รายจ่ายเริ่มต้น" },
  { key: "convert", label: "การออกเอกสารต่อ" },
  { key: "regular", label: "นิยามลูกค้าประจำ" },
  { key: "autoclose", label: "ปิดงวดอัตโนมัติ" },
  { key: "email", label: "รายงานทางอีเมล" },
  { key: "insight", label: "Smart Insight", soon: true },
];

export const DEFAULT_POLICY_SUB = "fiscal";

/** หัวข้อย่อยของ "สิทธิ์ผู้ใช้งาน" (WO 8.3 · §9.4 — เฟรม g13 เมนูซ้าย) */
export const PERMISSION_SETTINGS_SUBS: { key: string; label: string }[] = [
  { key: "users", label: "ผู้ใช้งาน" },
  { key: "matrix", label: "สิทธิ์การใช้งาน" },
];

export const DEFAULT_PERMISSION_SUB = "users";

export function permissionSubLabel(key: string): string {
  return PERMISSION_SETTINGS_SUBS.find((x) => x.key === key)?.label ?? PERMISSION_SETTINGS_SUBS[0].label;
}

/** หัวข้อย่อยของ "การเชื่อมต่อ" (WO 8.3 · §9.5 — เฟรม g14 เมนูซ้าย) */
export const CONNECTION_SETTINGS_SUBS: { key: string; label: string; soon?: boolean }[] = [
  { key: "shark", label: "ระบบใน SHARK" },
  { key: "etax", label: "e-Tax Invoice", soon: true },
  { key: "api", label: "แอปภายนอก/API" },
];

export const DEFAULT_CONNECTION_SUB = "shark";

export function connectionSubLabel(key: string): string {
  return CONNECTION_SETTINGS_SUBS.find((x) => x.key === key)?.label ?? CONNECTION_SETTINGS_SUBS[0].label;
}

export function policySubLabel(key: string): string {
  return POLICY_SETTINGS_SUBS.find((x) => x.key === key)?.label ?? POLICY_SETTINGS_SUBS[0].label;
}

export function docSubLabel(key: string): string {
  return DOC_SETTINGS_SUBS.find((x) => x.key === key)?.label ?? DOC_SETTINGS_SUBS[0].label;
}

export function settingsGroups(base: string): SettingsGroup[] {
  const root = `${base}/settings`;
  return [
    {
      key: "org",
      label: "ข้อมูลกิจการ",
      icon: "shop",
      path: root,
      items: [
        { key: "general", label: "ข้อมูลทั่วไป", path: root, sub: "general" },
        { key: "address", label: "ที่อยู่และสาขา", path: root, sub: "address" },
        { key: "brand", label: "โลโก้ ตราประทับ ลายเซ็น", path: root, sub: "brand" },
      ],
    },
    {
      key: "doc",
      label: "เอกสารและเลขที่",
      icon: "doc",
      path: `${root}/documents`,
      items: DOC_SETTINGS_SUBS.map((x) => ({
        key: x.key,
        label: x.label,
        path: `${root}/documents`,
        sub: x.key,
      })),
    },
    {
      key: "policy",
      label: "นโยบายบัญชี",
      icon: "lock",
      path: `${root}/policy`,
      items: POLICY_SETTINGS_SUBS.map((x) => ({
        key: x.key,
        label: x.label,
        path: `${root}/policy`,
        sub: x.key,
        soon: x.soon,
      })),
    },
    {
      key: "permissions",
      label: "สิทธิ์ผู้ใช้งาน",
      icon: "users",
      path: `${root}/permissions`,
      items: PERMISSION_SETTINGS_SUBS.map((x) => ({
        key: x.key,
        label: x.label,
        path: `${root}/permissions`,
        sub: x.key,
      })),
    },
    {
      key: "connections",
      label: "การเชื่อมต่อ",
      icon: "link",
      path: `${root}/connections`,
      items: CONNECTION_SETTINGS_SUBS.map((x) => ({
        key: x.key,
        label: x.label,
        path: `${root}/connections`,
        sub: x.key,
        soon: x.soon,
      })),
    },
    { key: "plan", label: "แพ็กเกจและการใช้งาน", icon: "tag", path: `${root}/plan`, items: [], soon: true },
  ];
}
