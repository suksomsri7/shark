// qr-staff-shared.ts — ชนิดของจอพนักงานฝั่ง QR (POS P2.7U): การ์ดรอบ QR โต๊ะบนจอ 09 · QR ของโต๊ะ (แผงโต๊ะ/แผ่นพิมพ์) · ลิงก์สั่งล่วงหน้า (ลิ้นชักช่องทาง)
//   บริสุทธิ์ (client import ได้) · เงินเป็นสตางค์ · เวลาเป็น ISO · ไม่มีข้อมูลส่วนตัวของแขก

/** รอบที่แขกสั่งเองผ่าน QR โต๊ะ (RestaurantOrder placedByUserId null) ของวันนี้ — การ์ด "QR โต๊ะ B2 · #18 · ครัวกำลังทำ 0/2 · เก็บเงินรวมกับบิลโต๊ะ" */
export type QrTableRoundCard = {
  orderId: string;
  sessionId: string;
  tableId: string;
  tableName: string;
  dailyNo: number;
  at: string;
  /** บรรทัด/ชิ้นที่ไม่ถูกยกเลิก */
  itemCount: number;
  qtyCount: number;
  /** Σ lineTotal ของรายการที่ไม่ถูกยกเลิก (ราคา ณ ตอนสั่ง) */
  totalSatang: number;
  /** ครัวทำเสร็จ (READY/SERVED) / ทั้งหมดที่ไม่ยกเลิก */
  done: number;
  total: number;
  /** คอลัมน์ของจอ 09: ยังทำไม่ครบ = preparing · ครบแต่ยังไม่เสิร์ฟหมด = ready · เสิร์ฟหมด = done */
  column: "preparing" | "ready" | "done";
  /** session ยังเปิดอยู่ (ปิดแล้ว = จ่ายแล้ว/ปิดโต๊ะ) */
  sessionOpen: boolean;
};
export type QrTableRoundsResult = { ok: true; rounds: QrTableRoundCard[]; at: string } | { ok: false; code: string; message: string };

/** QR ของโต๊ะ (แผงโต๊ะ "QR ของโต๊ะ" · แผ่นพิมพ์ทุกโต๊ะ) — ลิงก์ = <origin>/q/t/<qrToken> */
export type QrTableTokenRow = { tableId: string; name: string; zoneId: string; zoneName: string; qrToken: string; active: boolean };
export type QrTablesResult = { ok: true; tables: QrTableTokenRow[]; shopName: string; unitName: string; canRotate: boolean } | { ok: false; code: string; message: string };

/** ลิงก์สั่งล่วงหน้าของสาขา (PosOrderLink · /q/<token>) */
export type QrOrderLinkView = { id: string; token: string; status: "ACTIVE" | "REVOKED"; unitId: string; rotatedAt: string | null; createdAt: string };
export type QrOrderLinkResult = { ok: true; link: QrOrderLinkView | null } | { ok: false; code: string; message: string; messageKey?: string };

/** ทางของหน้าสาธารณะ (origin ใส่ฝั่งเครื่อง) */
export const qrTablePath = (qrToken: string) => `/q/t/${encodeURIComponent(qrToken)}`;
export const qrLinkPath = (token: string) => `/q/${encodeURIComponent(token)}`;
