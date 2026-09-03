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
  // ── ข้อความเสียง: `audio: true` ตั้งแต่ 2 ก.ย. 2026 (WO-CV13 · ปิดมติ D31 ทาง ข) ──
  //    LINE รับ audio message เฉพาะ `originalContentUrl` ที่เป็นไฟล์ **m4a** (https) + ต้องส่ง
  //    `duration` เป็น **มิลลิวินาที** มาด้วย · ตัวอัดฝั่งเบราว์เซอร์ผลิต **WAV** เส้นทางเดียว
  //    (D29/D30 — ชนิดเดียวที่เล่นได้ทุกเครื่อง) ⇒ ณ วินาทีที่พนักงานกด "ส่ง" ไฟล์ยังเป็น wav
  //
  //    ทางที่เลือกคือ **ส่งเข้า LINE แบบ async**: `sendReply` บันทึกข้อความเป็น PENDING
  //    (`meta.pendingReason = "TRANSCODE"` · ฟองขึ้นนาฬิกา "กำลังแปลงไฟล์…" ห้ามขึ้น ✓)
  //    แล้ว `scripts/voice-transcode-worker.mts` (cron ทุก 1 นาที บน VPS) แปลง wav→m4a เสร็จ
  //    จึงเรียก `deliverPendingVoice()` ยิงเข้า LINE เองแล้วปรับเป็น SENT/FAILED
  //
  //    🔴 ธงนี้คือ "ส่งถึงลูกค้าได้จริงไหม" ไม่ใช่ "ส่งได้ทันทีไหม" — ปิดกลับเป็น false เมื่อไหร่
  //       ปุ่มไมค์ในห้อง LINE จะหายไปทั้งจอ (`canSendAudio` ตัวเดียวคุมทั้งหน้าจอและเซิร์ฟเวอร์)
  capabilities: { sendImage: true, sendSticker: true, audio: true, replyWindowHours: null, typing: false },

  verifyWebhook(rawBody, headers, creds) {
    const secret = creds.channelSecret;
    if (!secret) return false;
    // B10 (WO-C4): สัญญาของ ChannelAdapter คือ headers ถูก lowercase มาแล้ว
    // (route ทำ `headers[k.toLowerCase()] = v` — api/chat/webhook/[connectionId]/route.ts)
    // ของเดิมเขียน `?? headers["X-Line-Signature"] ?? headers["x-line-signature"]` ต่อท้าย
    // = operand ที่ 3 ซ้ำ operand ที่ 1 (dead code) และ operand ที่ 2 ก็ไม่มีวันมีค่าเพราะคีย์ถูก
    // lowercase ไปแล้ว → fallback ทั้งชุดเป็นของตาย สื่อเจตนาผิดว่ารองรับ header ดิบ ตัดออก
    const sig = headers["x-line-signature"];
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
    } else if (message.type === "AUDIO" && message.audioUrl) {
      // 🔴 LINE ต้องการ `duration` เป็นมิลลิวินาที (ไม่ใช่วินาที) และไฟล์ต้องเป็น m4a บน https
      //    ตัวตัดสินว่าไฟล์เป็น m4a จริงและอยู่บน CDN ของเราอยู่ที่ service (ก่อนเรียกมาถึงตรงนี้)
      messages.push({
        type: "audio",
        originalContentUrl: message.audioUrl,
        duration: message.durationMs ?? 0,
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
