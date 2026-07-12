import type { ChannelAdapter } from "./adapter";

// WEBCHAT adapter (P1) — widget บน storefront ของแพลตฟอร์มเอง
// ไม่มี external provider: inbound มาจาก API ภายใน (/api/chat/webchat/[connectionId])
// outbound = เก็บข้อความไว้ ลูกค้าเห็นผ่าน widget (polling) — ไม่มี API ภายนอกต้องยิง
export const webchatAdapter: ChannelAdapter = {
  type: "WEBCHAT",
  capabilities: { sendImage: true, sendSticker: false, replyWindowHours: null, typing: true },

  // widget authenticate ด้วย guest token ownership ที่ route/service ไม่ใช่ signature
  verifyWebhook() {
    return true;
  },

  // inbound ไม่ผ่าน parseInbound (route ภายในเรียก service.receiveWebchatInbound ตรง ๆ)
  parseInbound() {
    return [];
  },

  // ไม่ต้องยิงที่ไหน — ข้อความถูกเก็บใน DB แล้ว widget polling มาอ่านเอง
  async sendMessage() {
    return {};
  },

  async healthCheck() {
    return { ok: true, detail: "แชทหน้าเว็บพร้อมใช้งาน" };
  },
};
