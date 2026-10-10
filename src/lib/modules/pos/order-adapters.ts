// order-adapters.ts — ทะเบียน adapter ของช่องทางออเดอร์ · POS P2.8 S (R4 · สัญญา C-7)
//
// คีย์ = SalesChannel.adapter · interface เดียวทุกช่องทาง {code, accept, reject, setReady, syncMenu?, setAvailability?, setStoreStatus?}
// 🔴 P2.8: MANUAL (พนักงานคีย์จากแท็บเล็ตแพลตฟอร์ม) · WEB (เว็บร้าน — ShopOrder สะท้อนเข้ามาทางประตูระบบ) · CHAT (พนักงานคีย์ให้ลูกค้าในแชท)
//    = no-op ทั้งหมด (ไม่มีอะไรให้ส่งกลับ — แพลตฟอร์มรับบนแท็บเล็ตของมันเอง · เว็บร้าน/แชทอ่านสถานะจาก POS)
//    API (LINE MAN/Grab/… จริง) = P3.1–3.3: เติมตัวที่นี่ + ตรวจลายเซ็นที่ route webhook · ห้ามใส่ความลับใน adapterConfig จนกว่า P3.1 (มติ 11)
// 🔴 ฟังก์ชันของ adapter ต้องไม่ throw ใส่ผู้เรียก (order.ts เรียกหลัง commit) · ไม่ import shop/chat/restaurant (มติ 1 5 6)

export type OrderAdapterCode = "MANUAL" | "WEB" | "CHAT" | "API" | "NONE";
export type OrderAdapterRef = { orderId: string; externalRef: string | null };
export type OrderAdapter = {
  code: OrderAdapterCode;
  /** แจ้งแพลตฟอร์มว่ารับแล้ว + เวลาเตรียม */
  accept: (ref: OrderAdapterRef & { prepMinutes: number }) => Promise<void>;
  /** แจ้งแพลตฟอร์มว่าปฏิเสธ + เหตุผล */
  reject: (ref: OrderAdapterRef & { reasonCode: string }) => Promise<void>;
  /** แจ้งว่าพร้อมให้ไรเดอร์รับ */
  setReady: (ref: OrderAdapterRef) => Promise<void>;
  /** ส่งเมนู/ราคา/ตัวเลือก (P3.2) */
  syncMenu?: (input: { channelId: string }) => Promise<void>;
  /** 86 รายตัว (P2.6 ตัวรับ pos.product.availability เรียก · P3.2 ส่งจริง) */
  setAvailability?: (input: { channelId: string; productId: string; available: boolean }) => Promise<void>;
  /** เปิด/ปิดรับ (พักรับออเดอร์) */
  setStoreStatus?: (input: { channelId: string; open: boolean }) => Promise<void>;
};

const noop = async (): Promise<void> => {};
const local = (code: OrderAdapterCode): OrderAdapter => ({ code, accept: noop, reject: noop, setReady: noop, syncMenu: noop, setAvailability: noop, setStoreStatus: noop });

/** ทะเบียน adapter ตาม SalesChannel.adapter — ไม่มีในทะเบียน (NONE · API ก่อน P3) = ไม่มีอะไรให้ส่ง */
export const ORDER_ADAPTERS: Readonly<Partial<Record<string, OrderAdapter>>> = {
  MANUAL: local("MANUAL"),
  WEB: local("WEB"),
  CHAT: local("CHAT"),
};
