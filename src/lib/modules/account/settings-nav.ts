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
    { key: "policy", label: "นโยบายบัญชี", icon: "lock", path: `${root}/policy`, items: [], soon: true },
    { key: "permissions", label: "สิทธิ์ผู้ใช้งาน", icon: "users", path: `${root}/permissions`, items: [], soon: true },
    { key: "connections", label: "การเชื่อมต่อ", icon: "link", path: `${root}/connections`, items: [], soon: true },
    { key: "plan", label: "แพ็กเกจและการใช้งาน", icon: "tag", path: `${root}/plan`, items: [], soon: true },
  ];
}
