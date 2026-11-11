// chat-send.ts — ค่าคงที่ของข้อความถึงลูกค้าจากเลขา (S1.12 · R-K15 · RESOLUTIONS §M) · pure ไม่ import อะไร
//   แยกจาก proposals.ts เพราะ tools.ts ใช้ตอนโหลดโมดูล (คำอธิบายเครื่องมือ) — proposals ↔ tools เป็นวงโหลด

export const CHAT_SEND_SENDER_NAME = "Shark (ผู้ช่วย AI)";
export const CHAT_SEND_MAX_CHARS = 1000;
/** R-S1.12c (K-3): บรรทัดลงชื่อคงที่ต่อท้ายทุกข้อความ (ช่องทางที่ไม่แสดง senderName ลูกค้าก็ยังเห็นว่า AI เขียน) */
export const CHAT_SEND_SIGNATURE = "\n— ข้อความนี้ส่งโดย Shark ผู้ช่วย AI ของร้าน";
/** ความยาวสูงสุดของข้อความที่ผู้สั่งเขียน — สำรองที่ให้บรรทัดลงชื่อ (รวมแล้ว ≤ CHAT_SEND_MAX_CHARS) */
export const CHAT_SEND_BODY_MAX = CHAT_SEND_MAX_CHARS - CHAT_SEND_SIGNATURE.length;
/** R-S1.12e: คีย์กันส่งซ้ำของข้อความจากเลขา (namespace "ai:" ไม่ชนคีย์ของ webchat ขาเข้า) */
export const chatSendClientMessageId = (proposalId: string): string => `ai:${proposalId}`;
