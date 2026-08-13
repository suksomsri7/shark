// แท็บฟังก์ชันย่อยของระบบขายหน้าร้าน POS — แหล่งเดียว
// ⚠️ ต้องตรงกับ childrenFor("POS") ใน src/app/app/layout.tsx (ตรวจโดย scripts/qc-pos-catalog.mts)
// เดิมอาร์เรย์นี้ถูกก๊อปไว้ 5 ที่ → ชื่อแท็บเพี้ยนกัน ("ขาย" vs "ขายหน้าร้าน") เจ้าของหาหน้าขายไม่เจอ
export function posTabs(systemId: string): { href: string; label: string }[] {
  const s = `/app/sys/${systemId}`;
  return [
    { href: s, label: "ภาพรวม" },
    { href: `${s}/pos/register`, label: "ขายหน้าร้าน" },
    { href: `${s}/pos/products`, label: "สินค้า/บริการ" },
    { href: `${s}/pos/sales`, label: "ประวัติบิล" },
    { href: `${s}/pos/close`, label: "ปิดวัน" },
  ];
}
