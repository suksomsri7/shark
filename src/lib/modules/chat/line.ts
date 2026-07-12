import { createHmac, timingSafeEqual } from "node:crypto";
import type { ChannelAdapter, ChannelCreds, InboundMessage } from "./adapter";
import { ChannelDeliveryError } from "./adapter";

// LINE Messaging API adapter (P1)
// - inbound: webhook verify x-line-signature (HMAC-SHA256 base64 ด้วย channelSecret)
// - outbound: push API (staff ตอบหลังลูกค้าทัก — reply token มักหมดอายุแล้ว → ใช้ push)
// - profile: GET /bot/profile/{userId}
// docs: https://developers.line.biz/en/reference/messaging-api/

const API = "https://api.line.me/v2/bot";

function authHeader(creds: ChannelCreds): string {
  const token = creds.channelAccessToken;
  if (!token) throw new ChannelDeliveryError("TOKEN_MISSING");
  return `Bearer ${token}`;
}

export const lineAdapter: ChannelAdapter = {
  type: "LINE",
  capabilities: { sendImage: true, sendSticker: true, replyWindowHours: null, typing: false },

  verifyWebhook(rawBody, headers, creds) {
    const secret = creds.channelSecret;
    if (!secret) return false;
    const sig =
      headers["x-line-signature"] ?? headers["X-Line-Signature"] ?? headers["x-line-signature"];
    if (!sig) return false;
    const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    try {
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  },

  parseInbound(payload) {
    const out: InboundMessage[] = [];
    const events = (payload as { events?: unknown[] })?.events;
    if (!Array.isArray(events)) return out;
    for (const ev of events) {
      const e = ev as {
        type?: string;
        replyToken?: string;
        timestamp?: number;
        source?: { userId?: string };
        message?: {
          id?: string;
          type?: string;
          text?: string;
          packageId?: string;
          stickerId?: string;
        };
      };
      if (e.type !== "message" || !e.message || !e.source?.userId) continue;
      const m = e.message;
      const base = {
        externalUserId: e.source.userId,
        externalMessageId: m.id ?? `${e.source.userId}-${e.timestamp ?? Date.now()}`,
        replyToken: e.replyToken,
        sentAt: e.timestamp ? new Date(e.timestamp) : new Date(),
      };
      if (m.type === "text") {
        out.push({ ...base, type: "TEXT", body: m.text ?? "" });
      } else if (m.type === "image") {
        out.push({ ...base, type: "IMAGE", body: "[รูปภาพ]" });
      } else if (m.type === "sticker") {
        out.push({
          ...base,
          type: "STICKER",
          stickerMeta: { packageId: m.packageId, stickerId: m.stickerId },
        });
      } else {
        // ชนิดอื่น (video/audio/location/file) — P1 เก็บเป็นข้อความหมายเหตุ
        out.push({ ...base, type: "TEXT", body: `[${m.type ?? "ข้อความ"}]` });
      }
    }
    return out;
  },

  async sendMessage({ creds, externalUserId, message }) {
    const messages: unknown[] = [];
    if (message.type === "TEXT") {
      messages.push({ type: "text", text: message.body ?? "" });
    } else if (message.type === "IMAGE" && message.imageUrl) {
      messages.push({
        type: "image",
        originalContentUrl: message.imageUrl,
        previewImageUrl: message.imageUrl,
      });
    } else if (message.type === "STICKER" && message.stickerMeta) {
      messages.push({
        type: "sticker",
        packageId: message.stickerMeta.packageId,
        stickerId: message.stickerMeta.stickerId,
      });
    } else {
      messages.push({ type: "text", text: message.body ?? "" });
    }

    let res: Response;
    try {
      res = await fetch(`${API}/message/push`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: authHeader(creds) },
        body: JSON.stringify({ to: externalUserId, messages }),
      });
    } catch {
      throw new ChannelDeliveryError("NETWORK_ERROR", true);
    }
    if (res.status === 401 || res.status === 403) {
      throw new ChannelDeliveryError("TOKEN_EXPIRED");
    }
    if (res.status === 429) throw new ChannelDeliveryError("RATE_LIMITED", true);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ChannelDeliveryError(`LINE_${res.status}:${body.slice(0, 120)}`, res.status >= 500);
    }
    const data = (await res.json().catch(() => ({}))) as {
      sentMessages?: { id?: string }[];
    };
    return { externalMessageId: data.sentMessages?.[0]?.id };
  },

  async getProfile(creds, externalUserId) {
    try {
      const res = await fetch(`${API}/profile/${externalUserId}`, {
        headers: { Authorization: authHeader(creds) },
      });
      if (!res.ok) return {};
      const p = (await res.json()) as { displayName?: string; pictureUrl?: string };
      return { displayName: p.displayName, avatarUrl: p.pictureUrl };
    } catch {
      return {};
    }
  },

  async healthCheck(creds) {
    if (!creds.channelAccessToken || !creds.channelSecret) {
      return { ok: false, detail: "กรอก Channel access token และ Channel secret ให้ครบ" };
    }
    try {
      const res = await fetch(`${API}/info`, {
        headers: { Authorization: authHeader(creds) },
      });
      if (res.status === 401) return { ok: false, detail: "Channel access token ไม่ถูกต้อง" };
      if (!res.ok) return { ok: false, detail: `เชื่อมต่อ LINE ไม่สำเร็จ (${res.status})` };
      const info = (await res.json()) as { userId?: string; displayName?: string };
      return {
        ok: true,
        detail: info.displayName ? `เชื่อมกับ ${info.displayName}` : "เชื่อมสำเร็จ",
        externalAccountId: info.userId,
      };
    } catch {
      return { ok: false, detail: "ติดต่อเซิร์ฟเวอร์ LINE ไม่ได้" };
    }
  },
};
