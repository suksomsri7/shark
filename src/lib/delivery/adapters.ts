// Delivery adapters (WO-0060) — โครง adapter pattern รอเจ้าจริง (flash/kerry/j&t) อนาคต
// v1 มีตัวเดียว: MANUAL = ร้านจัดส่งเอง/กรอกเลขพัสดุด้วยมือ (ไม่มี API ผู้ให้บริการ)
//
// เพิ่มเจ้าใหม่ในอนาคต = เพิ่ม entry ใน ADAPTERS + set manualTracking:false
// แล้วต่อ logic ยิง API สร้างเลขพัสดุอัตโนมัติในชั้น service (createShipment)

export type DeliveryAdapter = {
  /** adapter key — ตรงกับ Shipment.provider ที่บันทึกใน DB */
  key: string;
  /** ป้ายชื่อภาษาไทย (แสดงใน UI ร้าน + หน้า public) */
  label: string;
  /** true = ร้านกรอกเลขพัสดุเอง · false = ผู้ให้บริการออกเลขให้อัตโนมัติ (อนาคต) */
  manualTracking: boolean;
};

export const ADAPTERS: Record<string, DeliveryAdapter> = {
  MANUAL: { key: "MANUAL", label: "ร้านจัดส่งเอง / กรอกเลขพัสดุ", manualTracking: true },
};

/** provider นี้รองรับไหม (อยู่ใน registry) */
export function isKnownProvider(provider: string): boolean {
  return Object.prototype.hasOwnProperty.call(ADAPTERS, provider);
}

/** รายการ adapter ทั้งหมด (สำหรับ dropdown ในหน้าร้าน) */
export function listAdapters(): DeliveryAdapter[] {
  return Object.values(ADAPTERS);
}
